// Surround field: the data AROUND the listening window, heard from where it is.
// A 4 x 4 lattice of sources is anchored to the Earth (not to the window) over the halo map (HALO x the window).
// Each source is a soft tone whose loudness, pitch and brightness follow the mean value of its lattice cell, placed
// with HRTF panning relative to the window centre (north = ahead, east = right). Moving the window moves the
// listener through the field: sources ahead grow louder and slide round to the side and behind as you pass them
// (no pitch change: level and position only). The lattice is a treadmill: a slot that falls off one edge re-enters
// at the other, faded in from silence at the rim so nothing pops.

import * as Tone from 'tone';
import type { LayerInfo } from '../data/types';
import type { Halo } from '../state';
import { norm, scaleNotes } from './mapping';

const SLOTS = 4;
/** Lattice spacing in window widths. */
const SPACING = 0.75;

const mod = (a: number, n: number) => ((a % n) + n) % n;
const wrap = (d: number) => mod(d + 180, 360) - 180;

/** Mean of the halo grid over a square of half-width r degrees around (lat, lon). NaN if no data there. */
export function haloMean(h: Halo, grid: Float32Array, lat: number, lon: number, r: number): number {
  const { box, n } = h;
  const dLat = (box.north - box.south) / n, dLon = (box.east - box.west) / n;
  const r0 = Math.max(0, Math.floor((box.north - (lat + r)) / dLat)), r1 = Math.min(n - 1, Math.floor((box.north - (lat - r)) / dLat));
  const x = mod(lon - box.west, 360);
  const c0 = Math.max(0, Math.floor((x - r) / dLon)), c1 = Math.min(n - 1, Math.floor((x + r) / dLon));
  let s = 0, k = 0;
  for (let i = r0; i <= r1; i++) for (let j = c0; j <= c1; j++) {
    const v = grid[i * n + j];
    if (!Number.isNaN(v)) { s += v; k++; }
  }
  return k ? s / k : NaN;
}

interface Emitter { osc: Tone.Oscillator; lp: Tone.Filter; gain: Tone.Gain; pan: Tone.Panner3D; i: number; j: number; t: number; f0: number }

export class Field {
  private out = new Tone.Gain(0);
  private em: Emitter[] = [];
  private halo: Halo | null = null;
  private layer: LayerInfo | null = null;
  private pos = { lat: 0, lon: 0, size: 10 };
  enabled = true;

  constructor(dest: Tone.InputNode, private keyRoot: () => number) {
    this.out.connect(dest);
    for (let k = 0; k < SLOTS * SLOTS; k++) {
      const osc = new Tone.Oscillator({ type: 'sine3', frequency: 220 }).start();
      const lp = new Tone.Filter(1200, 'lowpass');
      const gain = new Tone.Gain(0);
      const pan = new Tone.Panner3D({ panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1.1, maxDistance: 50 });
      osc.chain(lp, gain, pan, this.out);
      this.em.push({ osc, lp, gain, pan, i: NaN, j: NaN, t: NaN, f0: 220 });
    }
  }

  /** New data around the window (or a new top layer). Re-reads every source's value. */
  setHalo(h: Halo | null, layer: LayerInfo | null) {
    this.halo = h;
    this.layer = layer;
    for (const e of this.em) e.i = NaN; // force re-sample
    this.applyOut();
    this.update();
  }

  setEnabled(on: boolean) { this.enabled = on; this.applyOut(); }

  private applyOut() {
    this.out.gain.rampTo(this.enabled && this.layer ? Tone.dbToGain(-4) : 0, 0.4);
  }

  /** Window moved or resized. */
  move(lat: number, lon: number, size: number) {
    this.pos = { lat, lon, size };
    this.update();
  }

  private update() {
    const { lat, lon, size } = this.pos;
    const s = size * SPACING, half = size / 2, cos = Math.cos((lat * Math.PI) / 180);
    const i0 = Math.floor(lat / s) - 1, j0 = Math.floor(lon / s) - 1;
    const notes = scaleNotes(this.keyRoot(), 45, 74, [0, 7]);
    const rim = (SLOTS / 2) * SPACING * 2; // field units from centre to the treadmill edge
    for (let a = 0; a < SLOTS; a++) for (let b = 0; b < SLOTS; b++) {
      const e = this.em[a * SLOTS + b];
      const i = i0 + mod(a - i0, SLOTS), j = j0 + mod(b - j0, SLOTS);
      const pLat = (i + 0.5) * s, pLon = (j + 0.5) * s;
      if (i !== e.i || j !== e.j) {
        e.i = i; e.j = j;
        const grid = this.halo && this.layer ? this.halo.grids[this.layer.id] : undefined;
        e.t = grid && this.layer ? norm(haloMean(this.halo!, grid, pLat, pLon, s / 2), this.layer) : NaN;
        e.f0 = Tone.Frequency(notes[Math.round((Number.isNaN(e.t) ? 0 : e.t) * (notes.length - 1))], 'midi').toFrequency();
        e.osc.frequency.setValueAtTime(e.f0, Tone.now()); // silent at this moment (faded out at the rim), so no glide
        e.lp.frequency.rampTo(500 + 3000 * (Number.isNaN(e.t) ? 0 : e.t), 0.3);
        e.gain.gain.cancelScheduledValues(Tone.now());
        e.gain.gain.setValueAtTime(0, Tone.now()); // re-entered the field: fade in from silence
      }
      const x = (wrap(pLon - lon) * cos) / half, y = (pLat - lat) / half;
      const d = Math.hypot(x, y) || 1e-6;
      e.pan.positionX.linearRampTo(x, 0.12);
      e.pan.positionZ.linearRampTo(-y, 0.12); // listener faces -Z: north is ahead
      // Quiet inside the window (the main voices live there), silent at the treadmill rim.
      const edge = Math.min(1, Math.max(0, (rim - d) / 1.2));
      const inner = d < 1 ? 0.4 : 1;
      const g = Number.isNaN(e.t) ? 0 : Tone.dbToGain(-30 + 16 * e.t) * edge * inner;
      e.gain.gain.linearRampTo(g, 0.4);
    }
  }
}
