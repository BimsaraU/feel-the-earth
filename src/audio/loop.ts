// Pure, deterministic: window grid in, 16-step pattern out. The loop is a west-to-east reading of the window.

import type { LayerInfo, WindowData } from '../data/types';
import { denorm, norm, scaleNotes, type VoiceMapping } from './mapping';

export const STEPS = 16;

export interface Note { midi: number; offset: number; dur: number; vel: number } // offset, dur in steps
export interface Step { notes: Note[]; noData: boolean; accent: boolean; value: number }
export interface Pattern {
  steps: Step[];
  windowNorm: number;
  cutoffHz: number;
  pan: number;
  allNoData: boolean;
}

/** 16 columns west to east: mean and variance of normalised values (NaN-aware). */
export function columns(win: WindowData, layer: LayerInfo): { mean: number; variance: number }[] {
  const { grid, n } = win;
  return Array.from({ length: STEPS }, (_, s) => {
    const c0 = Math.floor((s * n) / STEPS), c1 = Math.max(c0 + 1, Math.floor(((s + 1) * n) / STEPS));
    let sum = 0, sq = 0, k = 0;
    for (let r = 0; r < n; r++) {
      for (let c = c0; c < c1; c++) {
        const t = norm(grid[r * n + c], layer);
        if (Number.isNaN(t)) continue;
        sum += t; sq += t * t; k++;
      }
    }
    if (!k) return { mean: NaN, variance: NaN };
    const mean = sum / k;
    return { mean, variance: Math.max(0, sq / k - mean * mean) };
  });
}

export function buildPattern(win: WindowData, layer: LayerInfo, voice: VoiceMapping, keyRoot: number): Pattern {
  const cols = columns(win, layer);
  const windowNorm = norm(win.stats.mean, layer);
  const notes = scaleNotes(keyRoot, voice.register[0], voice.register[1]);
  const at = (t: number) => notes[Math.round(t * (notes.length - 1))];
  const home = Number.isNaN(windowNorm) ? 0 : Math.round(windowNorm * (notes.length - 1));

  const steps: Step[] = cols.map(({ mean, variance }, s) => {
    if (Number.isNaN(mean)) return { notes: [], noData: true, accent: false, value: NaN };
    // Smooth column: held for the whole beat. Rough (std >= 0.08 of range): a quarter beat.
    const dur = 1 - 0.75 * Math.min(1, Math.sqrt(variance) / 0.08);
    const prev = cols[(s + STEPS - 1) % STEPS].mean, next = cols[(s + 1) % STEPS].mean;
    const accent = !(mean <= prev) && !(mean <= next); // local peak; NaN neighbours count as lower
    let out: Note[];
    if (voice.mode === 'pitch') {
      out = [{ midi: at(mean), offset: 0, dur, vel: 0.7 }];
    } else if (voice.mode === 'density') {
      const count = 1 + Math.round(mean * 3);
      out = Array.from({ length: count }, (_, k) => ({
        midi: notes[Math.min(notes.length - 1, home + 2 * k)], // rising thirds from the register home
        offset: k / count,
        dur: dur / count,
        vel: 0.45 + 0.35 * mean,
      }));
    } else {
      out = [{ midi: notes[home], offset: 0, dur, vel: 0.15 + 0.85 * mean }];
    }
    return { notes: out, noData: false, accent, value: mean };
  });

  const t = Number.isNaN(windowNorm) ? 0.5 : windowNorm;
  const cutoffHz = Math.min(voice.band[1], 700 * 2 ** (t * 3.5));
  const g = win.stats.gradientDeg;
  const drift = Number.isNaN(g) ? 0 : 0.3 * Math.sin((g * Math.PI) / 180);
  return {
    steps,
    windowNorm,
    cutoffHz,
    pan: Math.max(-1, Math.min(1, voice.pan + drift)),
    allNoData: steps.every((s) => s.noData),
  };
}

/** A pattern holding one constant value, used by the tutorial legend. */
export function constantWindow(layer: LayerInfo, t: number, n = 4): WindowData {
  const v = denorm(t, layer);
  return { grid: new Float32Array(n * n).fill(v), n, stats: { mean: v, min: v, max: v, variance: 0, gradientDeg: NaN, validFraction: 1 } };
}
