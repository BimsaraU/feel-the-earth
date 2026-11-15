// Granular spatial field: the Earth around the window, broken into small data points that each sing from where
// they are. Points sit on a lattice anchored to latitude and longitude (spacing a third of the window), out to
// 1.25 window widths. Each point emits short grains; HRTF puts every grain at the point's true bearing (north
// ahead, east right).
//
// The rule that makes movement readable: WHAT a point sounds like comes only from the data at that point and the
// shared chord of the bar. WHERE and HOW NEAR it sounds comes only from the listener's position. Moving never
// changes a point's pitch, timbre or rhythm; it only turns and approaches the sources, like walking through a
// room of instruments. Distance is heard as level and air (high frequencies fade with distance).
//
// Five data features, five different sound dimensions (not just loudness):
//   value        -> grain density (rhythm) and loudness
//   value        -> chord-tone height: low places sing low chord tones, high places high ones (harmonised)
//   gradient     -> timbre: calm, flat data is a pure tone; fronts and edges turn bright and metallic (FM index)
//   roughness    -> articulation: smooth areas are soft, long grains; patchy areas short, plucked ones
//   danger       -> harmony: a place past its layer's danger line adds a semitone clash to its chord tone
// Grains fall on a 16th-note grid locked to the loop, so many points at once form chords, not noise.

import * as Tone from 'tone';
import type { LayerInfo } from '../data/types';
import type { Halo } from '../state';
import { chordAt, type Mood } from './harmony';
import { norm, scaleNotes, severity, voiceFor } from './mapping';

/** Lattice spacing in window widths: small points, the "grains" of the map. */
const SPACING = 1 / 3;
/** How far you hear, in window widths. Matches the halo (2.5 x the window). */
const REACH = 1.25;
/** Grain voices (FM synth + HRTF panner each). Fewer on phones, where HRTF convolution is the main audio cost. */
const POOL = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 8 : 14;
const REGISTER: [number, number] = [55, 88];

const mod = (a: number, n: number) => ((a % n) + n) % n;
const wrap = (d: number) => mod(d + 180, 360) - 180;

/** Mean of the halo grid over a square of half-width r degrees around (lat, lon). NaN if no data there. */
export function haloMean(h: Halo, grid: Float32Array, lat: number, lon: number, r: number): number {
  return haloStats(h, grid, lat, lon, r)[0];
}

/** [mean, standard deviation] of the halo grid over a square of half-width r degrees. */
function haloStats(h: Halo, grid: Float32Array, lat: number, lon: number, r: number): [number, number] {
  const { box, n } = h;
  const dLat = (box.north - box.south) / n, dLon = (box.east - box.west) / n;
  const r0 = Math.max(0, Math.floor((box.north - (lat + r)) / dLat)), r1 = Math.min(n - 1, Math.floor((box.north - (lat - r)) / dLat));
  const x = mod(lon - box.west, 360);
  const c0 = Math.max(0, Math.floor((x - r) / dLon)), c1 = Math.min(n - 1, Math.floor((x + r) / dLon));
  let s = 0, ss = 0, k = 0;
  for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) {
    const v = grid[i * n + j];
    if (!Number.isNaN(v)) { s += v; ss += v * v; k++; }
  }
  if (!k) return [NaN, NaN];
  const m = s / k;
  return [m, Math.sqrt(Math.max(0, ss / k - m * m))];
}

/** One data point of the field. t, grad, rough are 0..1; danger 0..1 from the layer's danger line. */
export interface Point { i: number; j: number; lat: number; lon: number; t: number; grad: number; rough: number; danger: number }

/** The lattice points within reach of (lat, lon), with their data features. Pure; listener-independent values. */
export function pointsAround(h: Halo, grid: Float32Array, layer: LayerInfo, lat: number, lon: number, size: number): Point[] {
  const s = size * SPACING, span = (layer.max - layer.min) || 1;
  const v = voiceFor(layer.id);
  const out: Point[] = [];
  const reach = Math.ceil(REACH / SPACING);
  const ci = Math.round(lat / s), cj = Math.round(lon / s);
  const t = (i: number, j: number) => norm(haloMean(h, grid, i * s, j * s, s / 2), layer);
  for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) {
    const pLat = i * s, pLon = j * s;
    if (Math.hypot(pLat - lat, wrap(pLon - lon)) / size > REACH || Math.abs(pLat) > 85) continue;
    const [m, sd] = haloStats(h, grid, pLat, pLon, s / 2);
    const tv = norm(m, layer);
    if (Number.isNaN(tv)) continue;
    // Gradient: largest change to a neighbouring point, as a share of the layer range (8 % or more = a front).
    let g = 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tn = t(i + a, j + b);
      if (!Number.isNaN(tn)) g = Math.max(g, Math.abs(tn - tv));
    }
    out.push({ i, j, lat: pLat, lon: wrap(pLon), t: tv, grad: Math.min(1, g / 0.08), rough: Math.min(1, sd / span / 0.06), danger: severity(v, tv) });
  }
  return out;
}

/** What a point sounds like in a given chord. Depends only on the point and the harmony, never on the listener. */
export function grainSound(p: Point, chord: number[], keyRoot: number) {
  const tones = scaleNotes(keyRoot, REGISTER[0], REGISTER[1], chord);
  const midi = tones[Math.min(tones.length - 1, Math.round(p.t * (tones.length - 1)))];
  return {
    midi,
    /** Semitone clash for dangerous places. */
    clash: p.danger > 0.5 ? midi + 1 : null,
    /** Grains per second. */
    rate: 0.15 + 2.2 * p.t ** 1.4,
    vel: 0.25 + 0.6 * p.t,
    index: 0.3 + 9 * p.grad,
    dur: 0.42 - 0.32 * p.rough,
    attack: 0.04 - 0.035 * p.rough,
  };
}

/** Where and how near a point sounds from the listener: x east, z north (listener faces north), gain, air. */
export function placement(p: Point, lat: number, lon: number, size: number) {
  const x = (wrap(p.lon - lon) * Math.cos((lat * Math.PI) / 180)) / size, y = (p.lat - lat) / size;
  const d = Math.hypot(x, y);
  const rim = Math.max(0, Math.min(1, (REACH - d) / 0.3)); // fade out at the edge of hearing, so nothing pops in
  return { x, y, d, gain: rim / (1 + (d / 0.45) ** 2), lowpass: 9000 / (1 + 4 * d) };
}

interface Grain { synth: Tone.FMSynth; lp: Tone.Filter; pan: Tone.Panner3D; free: number }

export interface Score { keyRoot: number; mood: Mood }

export class Field {
  private out = new Tone.Gain(0);
  private pool: Grain[] = [];
  private halo: Halo | null = null;
  private layer: LayerInfo | null = null;
  private pos = { lat: 0, lon: 0, size: 10 };
  private points: Point[] = [];
  private next = 0;
  enabled = true;
  /** Window moving: the field sounds even with the music paused (paused and still = silence). */
  moving = false;

  constructor(dest: Tone.InputNode, private score: () => Score) {
    this.out.connect(dest);
    for (let k = 0; k < POOL; k++) {
      const pan = new Tone.Panner3D({ panningModel: 'HRTF', rolloffFactor: 0 }).connect(this.out);
      const lp = new Tone.Filter(6000, 'lowpass').connect(pan);
      const synth = new Tone.FMSynth({ harmonicity: 2, modulationIndex: 1, envelope: { attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.25 },
        modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 } }).connect(lp);
      synth.volume.value = -10;
      this.pool.push({ synth, lp, pan, free: 0 });
    }
    window.setInterval(() => this.schedule(), 25);
  }

  /** New data around the window (or a new top layer). */
  setHalo(h: Halo | null, layer: LayerInfo | null) {
    this.halo = h;
    this.layer = layer;
    this.refresh();
    this.applyOut();
  }

  setEnabled(on: boolean) { this.enabled = on; this.applyOut(); }

  private applyOut() {
    this.out.gain.rampTo(this.enabled && this.layer ? 1 : 0, 0.4);
  }

  /** Window moved or resized. Points are Earth-anchored, so a point still in reach keeps exactly its values;
   *  only which points are in reach and where they sit from you changes. */
  move(lat: number, lon: number, size: number) {
    this.pos = { lat, lon, size };
    this.refresh(); // ponytail: re-reads ~200 halo cells per move; cache per (i, j) if it ever shows in a profile
  }

  private refresh() {
    const g = this.halo && this.layer ? this.halo.grids[this.layer.id] : undefined;
    this.points = g && this.layer ? pointsAround(this.halo!, g, this.layer, this.pos.lat, this.pos.lon, this.pos.size) : [];
  }

  /** Lookahead scheduler: every 16th note, each point may emit a grain (probability = its rate x step). */
  private schedule() {
    if (!this.enabled || !this.points.length || Tone.getContext().state !== 'running') return;
    if (Tone.getTransport().state !== 'started' && !this.moving) { this.next = 0; return; }
    const transport = Tone.getTransport(), step = 60 / transport.bpm.value / 4, now = Tone.now();
    if (this.next < now) this.next = transport.state === 'started' ? transport.nextSubdivision('16n') : now + 0.03;
    const { keyRoot, mood } = this.score();
    while (this.next < now + 0.25) { // 250 ms ahead: survives main-thread stalls (map redraws) without gaps
      const t = this.next;
      this.next += step;
      const bar = transport.state === 'started' ? Math.floor(transport.getTicksAtTime(t) / transport.PPQ / 4) : 0;
      const chord = chordAt(mood, bar);
      const due: { p: Point; at: ReturnType<typeof placement>; snd: ReturnType<typeof grainSound> }[] = [];
      for (const p of this.points) {
        const snd = grainSound(p, chord, keyRoot);
        if (Math.random() > snd.rate * step) continue;
        const at = placement(p, this.pos.lat, this.pos.lon, this.pos.size);
        if (at.gain > 0.02) due.push({ p, at, snd });
      }
      // Loudest first: when the pool is full, the faint far grains are the ones dropped.
      due.sort((a, b) => b.at.gain * b.snd.vel - a.at.gain * a.snd.vel);
      for (const { at, snd } of due) {
        for (const midi of snd.clash ? [snd.midi, snd.clash] : [snd.midi]) {
          const g = this.pool.find((x) => x.free <= t);
          if (!g) return;
          g.free = t + snd.dur + 0.3;
          g.pan.positionX.setValueAtTime(at.x, t);
          g.pan.positionZ.setValueAtTime(-at.y, t); // listener faces -Z: north is ahead
          g.lp.frequency.setValueAtTime(at.lowpass, t);
          g.synth.modulationIndex.setValueAtTime(snd.index, t);
          g.synth.envelope.attack = snd.attack;
          g.synth.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), snd.dur, t, snd.vel * at.gain * (midi === snd.clash ? 0.6 : 1));
        }
      }
    }
  }
}
