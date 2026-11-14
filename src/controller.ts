// Glue between input, state, data, geo, audio, haptics and speech.

import { engine } from './audio/engine';
import { fx } from './fx';
import { moodOf } from './audio/harmony';
import { denorm, norm, severity, voiceFor } from './audio/mapping';
import { placeName, spokenDate, spokenNumber, whatAmIHearing, whereAmI } from './assist/answers';
import { announce, say } from './assist/speech';
import { source } from './data';
import { normLon } from './data/fixture';
import type { BBox, LayerId } from './data/types';
import { GeoEventTracker, LINE_NAMES, type GeoEvent } from './geo/events';
import { compassWord, loadGeo, type GeoGrid } from './geo/grid';
import { haptics } from './haptics/haptics';
import { gsap } from 'gsap';
import { HALO, MAX_LAT, MAX_LAYERS, MAX_SIZE, MIN_SIZE, useApp, type Halo } from './state';

export let geo: GeoGrid | null = null;
let tracker: GeoEventTracker | null = null;
const st = () => useApp.getState();

export function bboxOf(lat: number, lon: number, size: number): BBox {
  return { west: lon - size / 2, east: lon + size / 2, south: Math.max(-90, lat - size / 2), north: Math.min(90, lat + size / 2) };
}

const layerInfo = (id: LayerId) => st().layers.find((l) => l.id === id)!;

// ---------- start ----------

export function startFromGesture() {
  if (st().started || st().loading) return;
  void engine.unlock(); // synchronous part resumes the AudioContext inside the gesture
  st().set({ loading: true });
  void say('Loading sounds.');
  void boot();
}

async function boot() {
  const [g, layers] = await Promise.all([loadGeo(), source.listLayers(), engine.init()]);
  geo = g;
  tracker = new GeoEventTracker(g);
  tracker.reset(st().lat, st().lon);
  const [lo, hi] = layers[0].timeRange;
  const date = st().date < lo ? lo : st().date > hi ? hi : st().date;
  st().set({ layers, date, started: true, loading: false });
  haptics.init();
  applySettings();
  useApp.subscribe((s, prev) => { if (s.settings !== prev.settings) applySettings(prev.settings.keyRoot !== s.settings.keyRoot); });
  engine.onBar = () => { if (st().travelling) travelStep(); };
  engine.onAccent = () => { if (st().settings.hapticAccents) haptics.pulse('accent'); };
  if (engine.terrain) {
    engine.terrain.onStep = () => haptics.pulse('tick'); // every contour crossed is a detent under the finger
    engine.terrain.onArrive = (which, spot) => {
      const top = topLayer();
      if (which === 'peak') engine.play('smallbell', { rate: 1.5, db: -12 }); else engine.play('framedrum', { rate: 0.7, db: -10, lowpass: 500 });
      haptics.pulse('coast');
      fx.emit({ kind: 'coast', to: which === 'peak' ? 'land' : 'sea' });
      if (top) void say(`${which === 'peak' ? 'Peak' : 'Valley'}: ${spokenNumber(denorm(spot.t, top))} ${top.unitSpoken}.`, false);
    };
  }
  syncVoices();
  engine.field?.move(st().lat, st().lon, st().size);
  updateSurface();
  await regenerate();
  engine.startLoop();
  st().set({ playing: true });
  const demo = layers.some((l) => l.demo) ? 'This build plays DEMO DATA, not NASA data. ' : '';
  void say(`${demo}Feel the Earth. You are listening to ${placeName(g, st().lat, st().lon)}. ` +
    'Arrow keys move the listening window. Plus and minus change its size. Numbers 1 to 9 switch layers. ' +
    'W: where am I. H: what am I hearing. Comma and full stop step through days. T takes the listening tour. V turns this voice off.');
}

function applySettings(keyChanged = false) {
  const s = st().settings;
  engine.setMasterVolume(s.masterVolume);
  engine.setMono(s.mono);
  engine.field?.setEnabled(s.spatial);
  engine.terrain?.setEnabled(s.probe);
  engine.keyRoot = s.keyRoot;
  for (const [id, v] of engine.voices) v.setLevel(s.layerDb[id] ?? 0);
  haptics.enabled = s.haptics;
  document.documentElement.classList.toggle('high-contrast', s.highContrast);
  if (keyChanged) scheduleRegen();
}

// ---------- loop regeneration ----------

let regenTimer = 0;

export function scheduleRegen() {
  clearTimeout(regenTimer);
  regenTimer = window.setTimeout(() => void regenerate(), 150);
}

async function regenerate() {
  const { lat, lon, size, date, active } = st();
  const box = bboxOf(lat, lon, size);
  const means: Partial<Record<LayerId, number>> = {};
  const wins = await Promise.all(active.map((id) => source.getWindow(id, box, date, 32)));
  // Conductor: the most dangerous active layer sets the ensemble's severity and mood for every voice.
  engine.severity = Math.max(0, ...active.map((id, k) => severity(voiceFor(id), norm(wins[k].stats.mean, layerInfo(id)))));
  engine.mood = moodOf(engine.severity);
  await Promise.all(active.map(async (id, k) => {
    const win = wins[k];
    means[id] = win.stats.mean;
    const pattern = engine.voices.get(id)?.render(win, layerInfo(id));
    void pattern;
  }));
  st().set({ means });
  void refreshHalo();
}

// ---------- halo: the larger map around the window (3D view + surround field) ----------

const HALO_N = 48;
let haloAt = 0, haloTimer = 0, haloSeq = 0;

/** Sample every active layer over HALO x the window. Throttled to ~8 per second while moving. */
export async function refreshHalo() {
  const now = performance.now();
  clearTimeout(haloTimer);
  if (now - haloAt < 120) { haloTimer = window.setTimeout(() => void refreshHalo(), 120 - (now - haloAt)); return; }
  haloAt = now;
  const seq = ++haloSeq;
  const { lat, lon, size, date, active } = st();
  const box = bboxOf(lat, lon, size * HALO);
  const wins = await Promise.all(active.map((id) => source.getWindow(id, box, date, HALO_N)));
  if (seq !== haloSeq) return; // a newer request already started
  const halo: Halo = { box, n: HALO_N, lat, lon, size, grids: Object.fromEntries(active.map((id, k) => [id, wins[k].grid])) };
  const top = active[active.length - 1];
  st().set({ halo });
  engine.field?.setHalo(halo, top ? layerInfo(top) : null);
  engine.terrain?.setHalo(halo, top ? layerInfo(top) : null);
}

let scrubQueued = false;
function scrub() {
  if (scrubQueued) return;
  scrubQueued = true;
  requestAnimationFrame(async () => {
    scrubQueued = false;
    const { lat, lon, size, date, active } = st();
    for (const id of active) {
      const win = await source.getWindow(id, bboxOf(lat, lon, size), date, 8);
      engine.voices.get(id)?.scrub(win, layerInfo(id));
    }
  });
}

function syncVoices() {
  const active = st().active;
  for (const [id, v] of engine.voices) v.setEnabled(active.includes(id));
  engine.firstLayer = active[0] ?? null;
}

// ---------- window movement ----------

let lastMove = { t: 0, lat: 0, lon: 0 };
let regenAt = 0;
let whooshStop = 0;
const motion = { e: 0, n: 0 };

/** Move the window centre. settle = discrete move (keys, buttons), false while dragging. */
export function setCenter(lat: number, lon: number, settle: boolean) {
  if (!st().started) return;
  let pole: 'north' | 'south' | null = null;
  if (lat > MAX_LAT) { lat = MAX_LAT; pole = 'north'; }
  if (lat < -MAX_LAT) { lat = -MAX_LAT; pole = 'south'; }
  lon = normLon(lon);
  const now = performance.now();
  const events: GeoEvent[] = tracker ? tracker.update(lat, lon, now, settle) : [];
  if (pole && (settle || st().lat !== lat)) events.push({ type: 'pole', which: pole });

  // Whoosh level follows speed.
  const dt = Math.max(16, now - lastMove.t) / 1000;
  const dLon = ((lon - lastMove.lon + 540) % 360) - 180, dLat = lat - lastMove.lat;
  const dist = Math.hypot(dLat, dLon);
  lastMove = { t: now, lat, lon };
  engine.setMoveSpeed(settle ? 30 : dist / dt);
  // Direction of travel in window widths per second, smoothed; a jump (tap, settle) is not travel.
  if (!settle && dt < 0.25) {
    const w = st().size, k = 0.15;
    motion.e += ((dLon * Math.cos((lat * Math.PI) / 180)) / w / dt - motion.e) * k;
    motion.n += (dLat / w / dt - motion.n) * k;
    engine.setMotion(motion.e, motion.n);
  }
  clearTimeout(whooshStop);
  whooshStop = window.setTimeout(() => { engine.setMoveSpeed(0); motion.e = motion.n = 0; engine.setMotion(0, 0); engine.setProbing(false); }, settle ? 250 : 350);

  st().set({ lat, lon });
  engine.field?.move(lat, lon, st().size);
  void refreshHalo();
  updateSurface();
  events.forEach((e) => playEvent(e));
  if (settle) {
    const turn = events.filter((e) => e.type === 'border' || e.type === 'coast').pop();
    if (turn && geo) void say(`Now over ${placeName(geo, lat, lon)}.`);
    scheduleRegen();
  } else {
    scrub();
    if (st().settings.probe) { engine.setProbing(true); engine.terrain?.move(lat, lon, st().size); }
    // The notes follow the window while it travels, not only once it rests.
    if (now - regenAt > 400) { regenAt = now; void regenerate(); }
  }
}

export function moveBy(dLat: number, dLon: number) {
  const { lat, lon } = st();
  setCenter(lat + dLat, lon + dLon, true);
}

function updateSurface() {
  const { lat, lon, size } = st();
  if (!geo) return;
  const box = bboxOf(lat, lon, size);
  // Height: 0 below 600 m (no wind on lowland), 1 at 3,000 m and above.
  engine.setSurface(geo.landShare(box), Math.max(0, Math.min(1, (geo.landElevation(box) - 600) / 2400)));
}

// Smooth gliding: held arrows move at settings.navSpeed window widths per second, with eased start and stop.
// A tap still travels at least a quarter width (a full width with Shift), as the keyboard spec asks.
export type Dir = 'n' | 's' | 'e' | 'w';
const held = new Set<Dir>();
const glide = { raf: 0, last: 0, vLat: 0, vLon: 0, travelled: 0, min: 0, dir: 'n' as Dir };

export function glideStart(dir: Dir, full = false) {
  if (!st().started) return;
  held.add(dir);
  glide.dir = dir;
  glide.min = st().size * (full ? 1 : 0.25);
  glide.travelled = 0;
  if (glide.raf) return;
  glide.last = performance.now();
  dragStart();
  glide.raf = requestAnimationFrame(glideTick);
}

export function glideStop(dir: Dir) {
  held.delete(dir);
}

/** One discrete step (buttons activated by keyboard, screen readers). */
export function step(dir: Dir, full = false) {
  glideStart(dir, full);
  glideStop(dir);
}

const VEC: Record<Dir, [number, number]> = { n: [1, 0], s: [-1, 0], e: [0, 1], w: [0, -1] };

function glideEnd() {
  glide.raf = 0;
  glide.vLat = glide.vLon = 0;
  const { lat, lon } = st();
  setCenter(lat, lon, true); // commit pending borders, speak "Now over"
  dragEnd();
}

function glideTick(now: number) {
  const dt = Math.min(0.05, (now - glide.last) / 1000);
  glide.last = now;
  const { size, lat, lon, settings } = st();
  const speed = settings.navSpeed * size;
  let dLat: number, dLon: number;
  if (!held.size && glide.travelled < glide.min) {
    // Released before a full step: ease out and land exactly on the step distance.
    const rem = glide.min - glide.travelled;
    const d = Math.min(rem, Math.min(speed, Math.max(rem * 6, speed * 0.05)) * dt);
    const [a, b] = VEC[glide.dir];
    [dLat, dLon] = [a * d, b * d];
    glide.vLat = (a * d) / dt; glide.vLon = (b * d) / dt;
    glide.travelled += d;
    setCenter(lat + dLat, lon + dLon, false);
    if (glide.min - glide.travelled < 1e-6) return glideEnd();
  } else {
    const k = 1 - Math.exp(-dt * 9); // ease towards the target velocity
    glide.vLat += ((held.has('n') ? speed : 0) - (held.has('s') ? speed : 0) - glide.vLat) * k;
    glide.vLon += ((held.has('e') ? speed : 0) - (held.has('w') ? speed : 0) - glide.vLon) * k;
    if (!held.size && Math.hypot(glide.vLat, glide.vLon) < speed * 0.03) return glideEnd();
    glide.travelled += Math.hypot(glide.vLat, glide.vLon) * dt;
    setCenter(lat + glide.vLat * dt, lon + glide.vLon * dt, false);
  }
  glide.raf = requestAnimationFrame(glideTick);
}

export function dragStart() {
  st().set({ dragging: true });
}

export function dragEnd() {
  st().set({ dragging: false });
  if (tracker) tracker.tick(performance.now() + 2000).forEach((e) => playEvent(e));
  engine.setMoveSpeed(0);
  scheduleRegen();
}

const sizeAnim = { v: 10 };

export function resize(dir: 1 | -1) {
  const size = Math.round(st().size);
  const next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size + dir * (size < 10 ? 1 : 5)));
  if (next === size) {
    void say(`Window is already at its ${dir > 0 ? 'largest' : 'smallest'}, ${size} degrees.`);
    return;
  }
  setSize(next, true);
}

/** Change window size. animate: glide there with GSAP (keys, buttons); otherwise follow a drag directly. */
export function setSize(next: number, animate: boolean) {
  next = Math.min(MAX_SIZE, Math.max(MIN_SIZE, next));
  gsap.killTweensOf(sizeAnim);
  const apply = () => { st().set({ size: sizeAnim.v }); engine.field?.move(st().lat, st().lon, sizeAnim.v); void refreshHalo(); updateSurface(); scrub(); };
  if (!animate) { sizeAnim.v = next; apply(); return; }
  sizeAnim.v = st().size;
  gsap.to(sizeAnim, { v: next, duration: 0.35, ease: 'power2.out', onUpdate: apply, onComplete: () => scheduleRegen() });
  void say(`Window ${next} degrees.`);
}

export function sizeDone() {
  void say(`Window ${Math.round(st().size)} degrees.`);
  scheduleRegen();
}

// ---------- layers ----------

export function toggleLayer(id: LayerId) {
  const { active } = st();
  const info = layerInfo(id);
  if (!info) return;
  const v = voiceFor(id);
  if (active.includes(id)) {
    st().set({ active: active.filter((a) => a !== id) });
    void say(`${info.name} off.`);
  } else if (active.length >= MAX_LAYERS) {
    void say(`Four layers is the maximum. Turn one off first.`);
    return;
  } else {
    st().set({ active: [...active, id] });
    const [lo, hi] = info.timeRange;
    const { date } = st();
    let moved = '';
    if (date < lo || date > hi) {
      const to = date < lo ? lo : hi;
      st().set({ date: to });
      moved = ` Its record runs from ${spokenDate(lo)} to ${spokenDate(hi)}, so the date moved to ${spokenDate(to)}.`;
    }
    void say(`${info.name} on, ${v.instrumentSpoken}.${info.demo ? ' Demo data.' : ''}${moved}`);
  }
  syncVoices();
  scheduleRegen();
}

/** Draw this active layer on the map (the last active layer is the one drawn and probed). */
export function showLayer(id: LayerId) {
  const { active } = st();
  if (!active.includes(id) || active[active.length - 1] === id) return;
  st().set({ active: [...active.filter((a) => a !== id), id] });
  void say(`${layerInfo(id).name} on the map.`);
  syncVoices();
  scheduleRegen();
}

// ---------- time ----------

export function stepDate(days: number, months = 0) {
  const { date, layers } = st();
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  setDate(d.toISOString().slice(0, 10), months ? 'month' : 'day', layers);
}

/** Earliest start and latest end over all layers. */
export function dateBounds(layers = st().layers): [string, string] {
  if (!layers.length) return ['2007-01-01', '2023-12-31'];
  return [layers.reduce((a, l) => (l.timeRange[0] < a ? l.timeRange[0] : a), '9999'), layers.reduce((a, l) => (l.timeRange[1] > a ? l.timeRange[1] : a), '0000')];
}

export function setDate(iso: string, kind: 'day' | 'month' | 'quiet' = 'day', layers = st().layers) {
  const [lo, hi] = dateBounds(layers);
  if (iso < lo || iso > hi) {
    void say(`No data ${iso < lo ? 'before' : 'after'} ${spokenDate(iso < lo ? lo : hi)}.`);
    return;
  }
  st().set({ date: iso });
  if (kind !== 'quiet') {
    engine.play(kind === 'month' ? 'windchime' : 'ratchet', { db: kind === 'month' ? -6 : -4 });
    fx.emit({ kind: 'time', big: kind === 'month' });
    haptics.pulse('timeStep');
  }
  announce(spokenDate(iso));
  scheduleRegen();
}

// ---------- time travel ----------

/** One step of the finest cadence among the active layers: a day, ten days or a year. */
function travelStepSize(): { days: number; months: number } {
  const cad = st().active.map((id) => layerInfo(id)?.cadence);
  if (cad.includes('daily')) return { days: 1, months: 0 };
  if (cad.includes('10-day')) return { days: 10, months: 0 };
  if (cad.includes('monthly')) return { days: 0, months: 1 };
  return { days: 0, months: 12 };
}

function travelStep() {
  const { date } = st();
  const { days, months } = travelStepSize();
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  const next = d.toISOString().slice(0, 10);
  // Stop at the end of the record of the layers being heard.
  const end = st().active.map((id) => layerInfo(id)?.timeRange[1] ?? '').sort().pop() ?? dateBounds()[1];
  if (next > end) { setTravelling(false); void say('End of the record.'); return; }
  engine.play('ratchet', { db: -14 });
  setDate(next, 'quiet');
}

/** Time travel: while on, every bar of the loop moves the date one step forward. */
export function setTravelling(on: boolean) {
  st().set({ travelling: on });
  if (on && !st().playing) togglePlay();
  const { days, months } = travelStepSize();
  const unit = months === 1 ? 'a month' : months ? 'a year' : days === 10 ? 'ten days' : 'a day';
  void say(on ? `Time travel on: ${unit} per bar.` : 'Time travel off.');
}

export function isGliding() {
  return glide.raf !== 0;
}

export function sayDate() {
  void say(spokenDate(st().date));
}

// ---------- events ----------

export function playEvent(e: GeoEvent) {
  switch (e.type) {
    case 'border': {
      engine.play('clave', { db: -24, lowpass: 2200 });
      // Second tick higher when entering a country.
      engine.play('clave', { at: engine.now() + 0.12, rate: 1.26, db: -26, lowpass: 2200 });
      haptics.pulse('border');
      fx.emit({ kind: 'border', lat: st().lat, lon: st().lon });
      break;
    }
    case 'coast':
      if (e.to === 'sea') engine.play('wave', { db: -20, lowpass: 1500 });
      else engine.play('framedrum', { db: -20, lowpass: 600 });
      haptics.pulse('coast');
      fx.emit({ kind: 'coast', to: e.to });
      break;
    case 'line':
      // Lines sit just above the border ticks: noticeable, never startling.
      if (e.line === 'equator') engine.play('singingbowl', { db: -20, lowpass: 2500 });
      else if (e.line === 'antimeridian') engine.play('cymbal', { reverse: true, db: -22, lowpass: 4000 });
      else engine.play('smallbell', { rate: e.line === 'primeMeridian' ? 0.75 : 1, db: -22, lowpass: 3500 });
      fx.emit({ kind: 'line', line: e.line, lat: st().lat, lon: st().lon });
      announce(`Crossed ${LINE_NAMES[e.line]}.`);
      break;
    case 'pole':
      engine.play('gong', { rate: 0.7, lowpass: 500, db: -10 });
      fx.emit({ kind: 'pole' });
      void say(`${e.which === 'north' ? 'North' : 'South'} limit, 85 degrees.`, false);
      break;
    case 'manyBorders':
      engine.setManyBorders(e.active);
      if (e.active) haptics.pulse('border');
      break;
  }
}

// ---------- assist ----------

export function askWhere() {
  if (!geo) return;
  const { lat, lon, size, date } = st();
  void say(whereAmI(geo, lat, lon, size, date));
}

export async function askWhat() {
  const { lat, lon, size, date, active } = st();
  const box = bboxOf(lat, lon, size);
  const items = await Promise.all(active.map(async (id) => ({
    layer: layerInfo(id),
    voice: voiceFor(id),
    mean: (await source.getWindow(id, box, date, 32)).stats.mean,
  })));
  void say(whatAmIHearing(items, engine.severity));
}

const topLayer = () => { const a = st().active; return a.length ? layerInfo(a[a.length - 1]) : undefined; };

/** Where the highest and lowest values near the window are; their beacons ping for a few seconds. */
export function askBeacons() {
  const top = topLayer(), r = engine.terrain?.last;
  if (!top || !r) { void say('No layer on the map to search.'); return; }
  if (!r.peak || !r.valley) { void say(`${top.name} is flat or missing around here.`); return; }
  const { size } = st();
  const where = (s: NonNullable<typeof r.peak>) => (s.dist < 0.12 ? 'right here'
    : `${spokenNumber(s.dist * size)} degrees ${compassWord(((Math.atan2(s.east, s.north) * 180) / Math.PI + 360) % 360)}`);
  engine.terrain?.ping(6000);
  void say(`${top.name}. Highest nearby, the high beacon: ${spokenNumber(denorm(r.peak.t, top))} ${top.unitSpoken}, ${where(r.peak)}. ` +
    `Lowest nearby, the low beacon: ${spokenNumber(denorm(r.valley.t, top))} ${top.unitSpoken}, ${where(r.valley)}.`);
}

export function togglePlay() {
  const playing = !st().playing;
  if (playing) engine.startLoop(); else engine.pauseLoop();
  st().set({ playing });
  void say(playing ? 'Playing.' : 'Paused.');
}

/** Spoken assistance on or off. Off: no speech at all, text still goes to the caption and aria-live region. */
export function toggleVoice() {
  const voice = !st().settings.voice;
  if (!voice) void say('Voice guide off.'); // last words, then silence
  st().setSettings({ voice });
  if (voice) void say('Voice guide on.');
}
