// Glue between input, state, data, geo, audio, haptics and speech.

import { engine } from './audio/engine';
import { moodOf } from './audio/harmony';
import { norm, severity, voiceFor } from './audio/mapping';
import { placeName, spokenDate, whatAmIHearing, whereAmI } from './assist/answers';
import { announce, say } from './assist/speech';
import { source } from './data';
import { normLon } from './data/fixture';
import type { BBox, LayerId } from './data/types';
import { GeoEventTracker, LINE_NAMES, type GeoEvent } from './geo/events';
import { loadGeo, type GeoGrid } from './geo/grid';
import { haptics } from './haptics/haptics';
import { gsap } from 'gsap';
import { MAX_LAT, MAX_LAYERS, MAX_SIZE, MIN_SIZE, useApp } from './state';

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
  engine.onAccent = () => { if (st().settings.hapticAccents) haptics.pulse('accent'); };
  syncVoices();
  updateSurface();
  await regenerate();
  engine.startLoop();
  st().set({ playing: true });
  const demo = layers.some((l) => l.demo) ? 'This build plays DEMO DATA, not NASA data. ' : '';
  void say(`${demo}Feel the Earth. You are listening to ${placeName(g, st().lat, st().lon)}. ` +
    'Arrow keys move the listening window. Plus and minus change its size. Numbers 1 to 8 switch layers. ' +
    'W: where am I. H: what am I hearing. Comma and full stop step through days. T plays the audio legend. V turns this voice off.');
}

function applySettings(keyChanged = false) {
  const s = st().settings;
  engine.setMasterVolume(s.masterVolume);
  engine.setTempo(s.tempo);
  engine.setMono(s.mono);
  engine.keyRoot = s.keyRoot;
  for (const [id, v] of engine.voices) v.setLevel(s.layerDb[id] ?? 0);
  haptics.enabled = s.haptics;
  document.documentElement.classList.toggle('high-contrast', s.highContrast);
  if (keyChanged) scheduleRegen();
}

// ---------- loop regeneration ----------

let regenTimer = 0;
const hadNoData = new Set<LayerId>();

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
    const noData = !!pattern?.steps.some((s) => s.noData);
    if (noData && !hadNoData.has(id)) haptics.pulse('noData');
    if (noData) hadNoData.add(id); else hadNoData.delete(id);
  }));
  st().set({ means });
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
let whooshStop = 0;

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
  const dist = Math.hypot(lat - lastMove.lat, ((lon - lastMove.lon + 540) % 360) - 180);
  lastMove = { t: now, lat, lon };
  engine.setMoveSpeed(settle ? 30 : dist / dt);
  clearTimeout(whooshStop);
  whooshStop = window.setTimeout(() => engine.setMoveSpeed(0), settle ? 250 : 120);

  st().set({ lat, lon });
  updateSurface();
  events.forEach((e) => playEvent(e));
  if (settle) {
    const turn = events.filter((e) => e.type === 'border' || e.type === 'coast').pop();
    if (turn && geo) void say(`Now over ${placeName(geo, lat, lon)}.`);
    scheduleRegen();
  } else {
    scrub();
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
  // Chill: 0 at sea level, 1 at 3,000 m and above.
  engine.setSurface(geo.landShare(box), Math.min(1, geo.landElevation(box) / 3000));
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
  const apply = () => { st().set({ size: sizeAnim.v }); updateSurface(); scrub(); };
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
    void say(`${info.name} on, ${v.instrumentSpoken}.${info.demo ? ' Demo data.' : ''}`);
  }
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

export function setDate(iso: string, kind: 'day' | 'month' = 'day', layers = st().layers) {
  const [lo, hi] = layers[0]?.timeRange ?? [iso, iso];
  if (iso < lo || iso > hi) {
    void say(`No data ${iso < lo ? 'before' : 'after'} ${spokenDate(iso < lo ? lo : hi)}.`);
    return;
  }
  st().set({ date: iso });
  engine.play(kind === 'month' ? 'windchime' : 'ratchet', { db: kind === 'month' ? -6 : 0 });
  haptics.pulse('timeStep');
  announce(spokenDate(iso));
  scheduleRegen();
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
      break;
    }
    case 'coast':
      if (e.to === 'sea') engine.play('wave', { db: -20, lowpass: 1500 });
      else engine.play('framedrum', { db: -20, lowpass: 600 });
      haptics.pulse('coast');
      break;
    case 'line':
      if (e.line === 'equator') engine.play('singingbowl', { db: -4 });
      else if (e.line === 'antimeridian') engine.play('cymbal', { reverse: true, db: -6 });
      else engine.play('smallbell', { rate: e.line === 'primeMeridian' ? 0.75 : 1, db: -6 });
      announce(`Crossed ${LINE_NAMES[e.line]}.`);
      break;
    case 'pole':
      engine.play('gong', { rate: 0.7, lowpass: 500, db: 2 });
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
