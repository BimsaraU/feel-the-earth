// Pure, deterministic: window grid in, 16-step pattern out.
// Method follows NASA Chandra's sonifications (Arcand, Russo, Santaguida): a line scans the image
// left to right (here west to east), vertical position sets pitch (north = higher), brightness
// (here the data value) sets loudness, diffuse regions sound as held tones and compact peaks as strikes.

import type { LayerInfo, WindowData } from '../data/types';
import { denorm, norm, scaleNotes, type VoiceMapping } from './mapping';

export const STEPS = 16;
export const ROWS = 6;
/** Minor pentatonic, a subset of D dorian: any combination of rows stays consonant. */
export const PENTATONIC = [0, 3, 5, 7, 10];
/** A held tone continues while the value stays within this share of the range. */
const HOLD = 0.06;

export interface Note { midi: number; offset: number; dur: number; vel: number } // offset, dur in steps
export interface Step { notes: Note[]; noData: boolean; accent: boolean; value: number }
export interface Pattern {
  steps: Step[];
  windowNorm: number;
  cutoffHz: number;
  /** Home pan including the gradient nudge; the scan sweeps around it. */
  pan: number;
  allNoData: boolean;
}

/** ROWS x STEPS cells of normalised values (row 0 = north), NaN-aware block means. */
export function cells(win: WindowData, layer: LayerInfo): Float64Array {
  const { grid, n } = win;
  const out = new Float64Array(ROWS * STEPS);
  for (let r = 0; r < ROWS; r++) {
    const r0 = Math.floor((r * n) / ROWS), r1 = Math.max(r0 + 1, Math.floor(((r + 1) * n) / ROWS));
    for (let s = 0; s < STEPS; s++) {
      const c0 = Math.floor((s * n) / STEPS), c1 = Math.max(c0 + 1, Math.floor(((s + 1) * n) / STEPS));
      let sum = 0, k = 0;
      for (let i = r0; i < r1; i++) for (let j = c0; j < c1; j++) {
        const t = norm(grid[i * n + j], layer);
        if (!Number.isNaN(t)) { sum += t; k++; }
      }
      out[r * STEPS + s] = k ? sum / k : NaN;
    }
  }
  return out;
}

/** Column mean and variance over rows, for accents and articulation. */
function column(c: Float64Array, s: number) {
  let sum = 0, sq = 0, k = 0;
  for (let r = 0; r < ROWS; r++) {
    const t = c[r * STEPS + s];
    if (!Number.isNaN(t)) { sum += t; sq += t * t; k++; }
  }
  const mean = k ? sum / k : NaN;
  return { mean, variance: k ? Math.max(0, sq / k - mean * mean) : NaN };
}

export function buildPattern(win: WindowData, layer: LayerInfo, voice: VoiceMapping, keyRoot: number): Pattern {
  const c = cells(win, layer);
  const scale = scaleNotes(keyRoot, voice.register[0], voice.register[1], PENTATONIC);
  // ROWS pitches spread over the register, highest for the northern row.
  const pitch = Array.from({ length: ROWS }, (_, r) => scale[Math.round(((ROWS - 1 - r) * (scale.length - 1)) / (ROWS - 1))]);
  const cols = Array.from({ length: STEPS }, (_, s) => column(c, s));
  const at = (r: number, s: number) => (r < 0 || r >= ROWS ? NaN : c[r * STEPS + ((s + STEPS) % STEPS)]);

  const steps: Step[] = cols.map(({ mean }, s) => {
    const prev = cols[(s + STEPS - 1) % STEPS].mean, next = cols[(s + 1) % STEPS].mean;
    return { notes: [], noData: Number.isNaN(mean), accent: !(mean <= prev) && !(mean <= next), value: mean };
  });

  for (let r = 0; r < ROWS; r++) {
    let s = 0;
    while (s < STEPS) {
      const t = at(r, s);
      if (Number.isNaN(t)) { s++; continue; }
      // Run of similar values: one held tone, like the diffuse light in Chandra's pieces.
      let len = 1;
      while (s + len < STEPS && Math.abs(at(r, s + len) - t) < HOLD) len++;
      // Compact peak (brighter than all four neighbours): a short accented strike.
      const peak = [at(r - 1, s), at(r + 1, s), at(r, s - 1), at(r, s + 1)].every((v) => !(v >= t - 0.04));
      // Rough columns are played detached; smooth ones legato.
      const rough = Math.min(1, Math.sqrt(cols[s].variance || 0) / 0.15);
      const dur = peak ? 0.5 : Math.max(0.35, len - 0.6 * rough);
      const vel = Math.min(1, (0.05 + 0.75 * t ** 1.5) * (peak ? 1.3 : 1));
      if (t > 0.03) steps[s].notes.push({ midi: pitch[r], offset: 0, dur, vel });
      s += len;
    }
  }

  const wn = norm(win.stats.mean, layer);
  const t = Number.isNaN(wn) ? 0.5 : wn;
  const g = win.stats.gradientDeg;
  return {
    steps,
    windowNorm: wn,
    cutoffHz: Math.min(voice.band[1], 700 * 2 ** (t * 3.5)),
    pan: Math.max(-1, Math.min(1, voice.pan + (Number.isNaN(g) ? 0 : 0.15 * Math.sin((g * Math.PI) / 180)))),
    allNoData: steps.every((x) => x.noData),
  };
}

/** Stereo position of the scan at step i: west left, east right, around the voice's home. */
export const scanPan = (home: number, i: number) => Math.max(-1, Math.min(1, home * 0.5 + 0.7 * (i / (STEPS - 1) - 0.5)));

/** A window holding one constant value, used by the tutorial legend. */
export function constantWindow(layer: LayerInfo, t: number, n = 6): WindowData {
  const v = denorm(t, layer);
  return { grid: new Float32Array(n * n).fill(v), n, stats: { mean: v, min: v, max: v, variance: 0, gradientDeg: NaN, validFraction: 1 } };
}
