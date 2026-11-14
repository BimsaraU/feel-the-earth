// Pure, deterministic: window grid in, 16-step pattern out.
// Reading follows NASA Chandra's sonifications (Arcand, Russo, Santaguida): a line scans the window
// west to east, north-south position sets pitch height, the value sets loudness, peaks are strikes.
// Writing follows orchestral practice: each layer has a role (bass, pad, melody, arp, colour, pulse)
// and every note comes from the shared chord of the bar, so independent data still harmonises.

import type { LayerInfo, WindowData } from '../data/types';
import { chordAt, SCALES, type Mood } from './harmony';
import { denorm, norm, scaleNotes, severity, span, type VoiceMapping } from './mapping';

export const STEPS = 16;
export const ROWS = 6;
const HOLD = 0.06; // melody holds while the value stays within 6 % of the range
const FRONT = 0.12; // a steeper change per beat than this is a front: accented

export interface Note { midi: number; offset: number; dur: number; vel: number } // offset, dur in steps
export interface Step { notes: Note[]; noData: boolean; accent: boolean; value: number }
export interface Pattern {
  steps: Step[];
  windowNorm: number;
  /** This layer's danger, 0..1, for the ensemble mood. */
  severity: number;
  hpHz: number;
  lpHz: number;
  q: number;
  textureDb: number;
  /** Home pan including the gradient nudge; the scan sweeps around it. */
  pan: number;
  allNoData: boolean;
  /** The ROWS x STEPS cells the pattern was read from (row 0 = north), for the visuals. */
  cells: Float64Array;
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

const vel = (t: number) => 0.12 + 0.7 * t ** 1.3;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const nearest = (tones: number[], target: number) => tones.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), tones[0]);

export function buildPattern(win: WindowData, layer: LayerInfo, voice: VoiceMapping, keyRoot: number, mood: Mood = 0): Pattern {
  const c = cells(win, layer);
  const at = (r: number, s: number) => (r < 0 || r >= ROWS ? NaN : c[r * STEPS + ((s + STEPS) % STEPS)]);
  const [lo, hi] = voice.register;

  // Per column: mean, height of the strongest features (north = 1), gradient along the scan.
  const cols = Array.from({ length: STEPS }, (_, s) => {
    let sum = 0, k = 0, hw = 0, w = 0;
    for (let r = 0; r < ROWS; r++) {
      const t = at(r, s);
      if (Number.isNaN(t)) continue;
      sum += t; k++;
      hw += t * t * (1 - r / (ROWS - 1)); w += t * t;
    }
    return { mean: k ? sum / k : NaN, height: w ? hw / w : 0.5 };
  });
  const grad = cols.map((col, s) => {
    const p = cols[(s + STEPS - 1) % STEPS].mean;
    return Number.isNaN(col.mean) || Number.isNaN(p) || s === 0 ? 0 : col.mean - p;
  });
  // Gradient shapes dynamics: rising swells, falling recedes.
  const dyn = (s: number) => clamp(1 + 2 * grad[s], 0.6, 1.4);

  const steps: Step[] = cols.map(({ mean }, s) => {
    const prev = cols[(s + STEPS - 1) % STEPS].mean, next = cols[(s + 1) % STEPS].mean;
    return { notes: [], noData: Number.isNaN(mean), accent: !(mean <= prev) && !(mean <= next), value: mean };
  });
  const tones = (pcs: number[]) => scaleNotes(keyRoot, lo, hi, pcs);
  const chord = (s: number) => chordAt(mood, Math.floor(s / 4));
  const push = (s: number, n: Note) => { if (!steps[s].noData) steps[s].notes.push(n); };
  const barMean = (b: number) => {
    const v = cols.slice(b * 4, b * 4 + 4).map((x) => x.mean).filter((x) => !Number.isNaN(x));
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN;
  };

  switch (voice.role) {
    case 'bass':
      for (let b = 0; b < 4; b++) {
        const t = barMean(b);
        if (Number.isNaN(t)) continue;
        const root = tones([chord(b * 4)[0]])[0];
        const rising = cols[b * 4 + 3].mean - cols[b * 4].mean > 0.08;
        if (rising) {
          push(b * 4, { midi: root, offset: 0, dur: 2, vel: vel(t) * dyn(b * 4) });
          push(b * 4 + 2, { midi: root + 7 <= hi ? root + 7 : root - 5, offset: 0, dur: 2, vel: vel(t) * dyn(b * 4 + 2) });
        } else push(b * 4, { midi: root, offset: 0, dur: 3.9, vel: vel(t) });
      }
      break;
    case 'pad':
      for (let b = 0; b < 4; b++) {
        const t = barMean(b);
        if (Number.isNaN(t)) continue;
        const ch = chord(b * 4);
        const inner = tones(ch.length >= 3 ? ch.slice(1) : ch);
        const h = cols.slice(b * 4, b * 4 + 4).reduce((a, x) => a + x.height, 0) / 4;
        const target = lo + h * (hi - lo);
        const two = [...inner].sort((x, y) => Math.abs(x - target) - Math.abs(y - target)).slice(0, 2);
        for (const m of two) push(b * 4, { midi: m, offset: 0, dur: 3.9, vel: vel(t) * 0.8 });
      }
      break;
    case 'melody': {
      let last: Note | null = null, lastT = NaN;
      for (let s = 0; s < STEPS; s++) {
        const t = cols[s].mean;
        if (Number.isNaN(t)) { last = null; continue; }
        // Strong beats land on chord tones; weak beats may pass through the mood's scale.
        const pcs = s % 2 === 0 ? chord(s) : SCALES[mood];
        const target = lo + cols[s].height * (hi - lo);
        const prevMidi: number = last?.midi ?? target;
        const cand = tones(pcs);
        const midi: number = cand.reduce((a, m) => (Math.abs(m - target) + 0.6 * Math.abs(m - prevMidi) < Math.abs(a - target) + 0.6 * Math.abs(a - prevMidi) ? m : a), cand[0]);
        const front = Math.abs(grad[s]) > FRONT;
        if (last && midi === last.midi && Math.abs(t - lastT) < HOLD && !front && s % 4 !== 0) { last.dur += 1; continue; }
        last = { midi, offset: 0, dur: front ? 0.5 : 1, vel: clamp(vel(t) * dyn(s) * (front ? 1.25 : 1), 0, 1) };
        lastT = t;
        push(s, last);
      }
      break;
    }
    case 'arp':
      for (let s = 0; s < STEPS; s++) {
        const t = cols[s].mean;
        if (Number.isNaN(t)) continue;
        const ct = tones(chord(s));
        const count = 1 + Math.round(t * 3);
        let i = ct.indexOf(nearest(ct, lo + cols[s].height * (hi - lo)));
        const dir = grad[s] >= 0 ? 1 : -1; // rising values arpeggiate upwards
        for (let k = 0; k < count; k++) {
          push(s, { midi: ct[clamp(i, 0, ct.length - 1)], offset: k / count, dur: 0.9 / count, vel: vel(t) * dyn(s) * 0.9 });
          i += dir;
          if (i < 0 || i >= ct.length) i -= 2 * dir;
        }
      }
      break;
    case 'color':
      for (let s = 0; s < STEPS; s++) {
        const ct = tones(chord(s));
        let n = 0;
        for (let r = 0; r < ROWS && n < 2; r++) {
          const t = at(r, s);
          if (!(t > 0.15)) continue;
          const peak = [at(r - 1, s), at(r + 1, s), at(r, s - 1), at(r, s + 1)].every((v) => !(v >= t - 0.04));
          const sparkle = s % 4 === 0 && t > 0.6 && r === 0;
          if (!peak && !sparkle) continue;
          push(s, { midi: nearest(ct, lo + (1 - r / (ROWS - 1)) * (hi - lo)), offset: 0, dur: 1, vel: vel(t) });
          n++;
        }
      }
      break;
    case 'pulse':
      for (let s = 0; s < STEPS; s++) {
        const t = cols[s].mean;
        if (Number.isNaN(t)) continue;
        const ch = chord(s);
        const ct = tones([s % 2 === 0 ? ch[0] : ch[2] ?? ch[0]]);
        push(s, { midi: nearest(ct, (lo + hi) / 2), offset: 0, dur: 0.5, vel: vel(t) * dyn(s) });
      }
      break;
  }

  const wn = norm(win.stats.mean, layer);
  const t = Number.isNaN(wn) ? 0.5 : wn;
  const g = win.stats.gradientDeg;
  return {
    steps,
    windowNorm: wn,
    severity: severity(voice, wn),
    hpHz: span(voice.timbre.hp, t, true),
    lpHz: span(voice.timbre.lp, t, true),
    q: span(voice.timbre.q, t),
    textureDb: voice.texture ? span(voice.texture.db, t) : -Infinity,
    pan: clamp(voice.pan + (Number.isNaN(g) ? 0 : 0.15 * Math.sin((g * Math.PI) / 180)), -1, 1),
    allNoData: steps.every((x) => x.noData),
    cells: c,
  };
}

/** Stereo position of the scan at step i: west left, east right, around the voice's home. */
export const scanPan = (home: number, i: number) => clamp(home * 0.5 + 0.7 * (i / (STEPS - 1) - 0.5), -1, 1);

/** A window holding one constant value, used by the tutorial legend. */
export function constantWindow(layer: LayerInfo, t: number, n = 6): WindowData {
  const v = denorm(t, layer);
  return { grid: new Float32Array(n * n).fill(v), n, stats: { mean: v, min: v, max: v, variance: 0, gradientDeg: NaN, validFraction: 1 } };
}
