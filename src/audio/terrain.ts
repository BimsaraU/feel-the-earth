// Terrain: peaks, valleys and contours, read from the halo map (the top layer around the window).
//  - Beacons. The highest and lowest places within earshot ping from where they are: peak = two rising high
//    notes, valley = two falling low notes, always the same pitch. Pings speed up and get louder as you close in.
//    They sound only while the window moves (and briefly after), or for a few seconds on B (peak) / V (valley).
//  - Contours. Crossing each 1/16 step of value is a silent haptic tick (40 % absolute + 60 % local scale), so you
//    feel slopes under the finger without anything changing pitch.
// Sound only says WHERE things are; what they are is the granular field's job (field.ts).

import * as Tone from 'tone';
import type { LayerInfo } from '../data/types';
import type { Halo } from '../state';
import { norm } from './mapping';

/** A place in the halo, as an offset from the window centre in window widths. */
export interface Spot { lat: number; lon: number; t: number; east: number; north: number; dist: number }
export interface Relief {
  /** Centre value 0..1 of the layer range, and 0..1 of the neighbourhood range. NaN where there is no data. */
  t: number; local: number;
  /** Slope at the centre: change of the local value per window width, towards east and north. */
  east: number; north: number;
  peak: Spot | null; valley: Spot | null;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;
const wrap = (d: number) => mod(d + 180, 360) - 180;
/** Below this spread (share of the layer range) the neighbourhood counts as flat: no beacons, no slope. */
const FLAT = 0.03;
/** Within this many window widths of a beacon you have arrived. */
export const ARRIVE = 0.12;

/** Halo grid as normalised values, 3 x 3 smoothed (NaN-aware) so single noisy cells do not become peaks. */
export function smooth(h: Halo, grid: Float32Array, layer: LayerInfo): Float32Array {
  const n = h.n, out = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    let s = 0, k = 0;
    for (let i = Math.max(0, r - 1); i <= Math.min(n - 1, r + 1); i++) for (let j = Math.max(0, c - 1); j <= Math.min(n - 1, c + 1); j++) {
      const t = norm(grid[i * n + j], layer);
      if (!Number.isNaN(t)) { s += t; k++; }
    }
    out[r * n + c] = k && !Number.isNaN(grid[r * n + c]) ? s / k : NaN;
  }
  return out;
}

/** Bilinear sample of a smoothed halo at a place; cells without data are skipped. */
function sample(h: Halo, s: Float32Array, lat: number, lon: number): number {
  const { box, n } = h;
  const y = ((box.north - lat) / (box.north - box.south)) * n - 0.5, x = (mod(lon - box.west, 360) / (box.east - box.west)) * n - 0.5;
  if (y < -0.5 || y > n - 0.5 || x < -0.5 || x > n - 0.5) return NaN;
  const y0 = Math.floor(y), x0 = Math.floor(x), fy = y - y0, fx = x - x0;
  let sum = 0, w = 0;
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const v = s[Math.min(n - 1, Math.max(0, y0 + dy)) * n + Math.min(n - 1, Math.max(0, x0 + dx))];
    const wt = (dy ? fy : 1 - fy) * (dx ? fx : 1 - fx);
    if (!Number.isNaN(v) && wt > 0) { sum += v * wt; w += wt; }
  }
  return w > 0.25 ? sum / w : NaN;
}

/** Everything the probe needs at one window position. Pure. */
export function relief(h: Halo, s: Float32Array, lat: number, lon: number, size: number): Relief {
  const { box, n } = h;
  const dLat = (box.north - box.south) / n, dLon = (box.east - box.west) / n;
  let lo = Infinity, hi = -Infinity, pk = -Infinity, vl = Infinity, pi = -1, vi = -1;
  for (let i = 0; i < n * n; i++) {
    const v = s[i];
    if (Number.isNaN(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    // ponytail: among near-equal extremes (plateaus, clipped values) the nearer one wins via a small distance penalty.
    const d = Math.hypot(box.north - (Math.floor(i / n) + 0.5) * dLat - lat, wrap(box.west + ((i % n) + 0.5) * dLon - lon)) / size;
    if (v - 0.03 * d > pk) { pk = v - 0.03 * d; pi = i; }
    if (v + 0.03 * d < vl) { vl = v + 0.03 * d; vi = i; }
  }
  const t = sample(h, s, lat, lon);
  const flat = !(hi - lo >= FLAT);
  const spot = (i: number): Spot | null => {
    if (flat || i < 0) return null;
    const pLat = box.north - (Math.floor(i / n) + 0.5) * dLat, pLon = box.west + ((i % n) + 0.5) * dLon;
    const east = wrap(pLon - lon) / size, north = (pLat - lat) / size;
    return { lat: pLat, lon: wrap(pLon), t: s[i], east, north, dist: Math.hypot(east, north) };
  };
  const local = (v: number) => (flat ? 0.5 : (v - lo) / (hi - lo));
  // Central differences a quarter window either side; one-sided where a neighbour has no data.
  const q = size / 4;
  const diff = (a: number, b: number) => (Number.isNaN(t) || flat ? 0
    : !Number.isNaN(a) && !Number.isNaN(b) ? (local(a) - local(b)) * 2
    : !Number.isNaN(a) ? (local(a) - local(t)) * 4 : !Number.isNaN(b) ? (local(t) - local(b)) * 4 : 0);
  return {
    t, local: Number.isNaN(t) ? NaN : local(t),
    east: diff(sample(h, s, lat, lon + q), sample(h, s, lat, lon - q)),
    north: diff(sample(h, s, lat + q, lon), sample(h, s, lat - q, lon)),
    peak: spot(pi), valley: spot(vi),
  };
}

/** Rung of the ladder for a relief: 40 % absolute, 60 % local. */
export const rung = (r: Relief, rungs: number) => (0.4 * r.t + 0.6 * r.local) * (rungs - 1);

interface Beacon { synth: Tone.Synth; pan: Tone.Panner3D; spot: Spot | null; next: number; midi: number; ratio: number; armed: boolean }

export class Terrain {
  private out = new Tone.Gain(1);
  private pings: Record<'peak' | 'valley', Beacon>;
  private halo: Halo | null = null;
  private grid: Float32Array | null = null;
  private pos = { lat: 0, lon: 0, size: 10 };
  private idx = -1;
  private until = 0; // beacons ping until this time (performance.now)
  private timer = 0;
  private restTimer = 0;
  private moving = false;
  /** Contour ticks. */
  enabled = true;
  /** Beacons ping while moving (B / V ping on request regardless). */
  beacons = true;
  /** Only this beacon pings (B: peak, V: valley); null = both. */
  private only: 'peak' | 'valley' | null = null;
  /** Latest reading, for "Find peak and valley" and the UI. */
  last: Relief | null = null;
  /** A contour was crossed (dir +1 up, -1 down): haptic detent. */
  onStep: ((dir: number) => void) | null = null;
  onArrive: ((which: 'peak' | 'valley', spot: Spot) => void) | null = null;

  constructor(dest: Tone.InputNode, private keyRoot: () => number) {
    this.out.connect(dest);
    const make = (type: 'sine' | 'triangle', octave: number, ratio: number): Beacon => {
      const pan = new Tone.Panner3D({ panningModel: 'HRTF', rolloffFactor: 0 }).connect(this.out);
      const synth = new Tone.Synth({ oscillator: { type }, envelope: { attack: 0.004, decay: 0.16, sustain: 0, release: 0.08 } }).connect(pan);
      return { synth, pan, spot: null, next: 0, midi: octave, ratio, armed: false };
    };
    // Peak: high, rising fifth. Valley: low, falling fourth.
    this.pings = { peak: make('sine', 84, 1.5), valley: make('triangle', 48, 0.75) };
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.rest(true);
  }

  /** New data around the window (or another top layer). */
  setHalo(h: Halo | null, layer: LayerInfo | null) {
    const g = h && layer ? h.grids[layer.id] : undefined;
    // The halo is centred on the window: take its position too, or beacons are placed from wherever the last move
    // left off (at boot that was 0, 0, which put them dozens of degrees away and out of earshot).
    if (h) this.pos = { lat: h.lat, lon: h.lon, size: h.size };
    this.halo = g ? h : null;
    this.grid = g && h && layer ? smooth(h, g, layer) : null;
    this.read();
  }

  /** The window moved (or was resized) under the listener's hand. */
  move(lat: number, lon: number, size: number) {
    this.pos = { lat, lon, size };
    this.moving = true;
    clearTimeout(this.restTimer);
    this.restTimer = window.setTimeout(() => this.rest(), 350);
    if (this.beacons) this.ping(800, null); // a navigation aid: ping while you move, fall silent soon after you stop
    this.read();
  }

  /** Let the beacons (or just one) ping for a while: movement, or B / V. */
  ping(ms: number, only: 'peak' | 'valley' | null = null) {
    // Moving does not cut short a B / V request that is still pinging.
    if (only || performance.now() > this.until) this.only = only;
    this.until = Math.max(this.until, performance.now() + ms);
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), 40);
    this.tick(); // first ping now, not on the next timer tick
  }

  private rest(now = false) {
    this.moving = false;
    if (now) this.until = 0;
  }

  private read() {
    if (!this.halo || !this.grid) { this.last = null; this.pings.peak.spot = this.pings.valley.spot = null; return; }
    const { lat, lon, size } = this.pos;
    const r = (this.last = relief(this.halo, this.grid, lat, lon, size));
    for (const k of ['peak', 'valley'] as const) {
      const b = this.pings[k], prev = b.spot, s = (b.spot = r[k]);
      if (!s) continue;
      // Arrival counts only for a place you travelled to: it was far, and it stayed put while you closed in
      // (on plateaus the extreme can jump under the window by itself).
      const still = !!prev && Math.hypot(s.lat - prev.lat, wrap(s.lon - prev.lon)) < 0.15 * size;
      const d = s.dist || 1e-6;
      b.pan.positionX.rampTo(s.east / d, 0.05, Tone.immediate());
      b.pan.positionZ.rampTo(-s.north / d, 0.05, Tone.immediate()); // listener faces -Z: north is ahead
      if (s.dist > 0.4) b.armed = true;
      else if (s.dist < ARRIVE && b.armed && still) { b.armed = false; if (this.moving) this.onArrive?.(k, s); }
    }
    if (!this.moving || !this.enabled || Number.isNaN(r.t)) return;
    // Contour detents, with hysteresis so a value sitting on a boundary does not chatter.
    const p = rung(r, 16);
    if (this.idx < 0 || Math.abs(p - this.idx) > 0.6) {
      const next = Math.round(p), dir = Math.sign(next - this.idx), first = this.idx < 0;
      this.idx = next;
      if (!first && dir) this.onStep?.(dir);
    }
  }

  /** Pings are scheduled on the audio clock up to 150 ms ahead, so a busy main thread (map redraws) cannot make the
   *  rhythm stumble, and the first one starts at once (Tone.immediate, not Tone.now with its lookahead delay). */
  private tick() {
    if (performance.now() > this.until) { clearInterval(this.timer); this.timer = 0; return; }
    const now = Tone.immediate();
    for (const [k, b] of Object.entries(this.pings)) {
      if (this.only && k !== this.only) continue;
      const s = b.spot;
      if (!s || s.dist < ARRIVE) continue;
      if (b.next < now) b.next = now + 0.01;
      const near = 1 - Math.min(1, s.dist / 1.25);
      const f = Tone.Frequency(b.midi + this.keyRoot(), 'midi').toFrequency(), vel = 0.15 + 0.45 * near;
      while (b.next < now + 0.15) {
        b.synth.triggerAttackRelease(f, 0.05, b.next, vel);
        b.synth.triggerAttackRelease(f * b.ratio, 0.05, b.next + 0.075, vel);
        b.next += 0.2 + 1.0 * (1 - near);
      }
    }
  }
}
