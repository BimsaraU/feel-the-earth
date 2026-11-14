import { describe, expect, it } from 'vitest';
import { FixtureSource, sampleWindow } from '../data/fixture';
import type { LayerInfo, WindowData } from '../data/types';
import { chordAt, SCALES, type Mood } from './harmony';
import { buildPattern, constantWindow, STEPS } from './loop';
import { severity, VOICES, voiceFor } from './mapping';

const layers = await new FixtureSource().listLayers();
const L = (id: string) => layers.find((l) => l.id === id)!;
const temp = L('sst');
const box = { west: 82, east: 92, south: 2.9, north: 12.9 }; // Bay of Bengal
const field = (layer: LayerInfo, n: number, f: (r: number, c: number) => number): WindowData => {
  const grid = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r * n + c] = layer.min + f(r, c) * (layer.max - layer.min);
  const mean = grid.reduce((a, v) => a + v, 0) / grid.length;
  return { grid, n, stats: { mean, min: 0, max: 0, variance: 0, gradientDeg: NaN, validFraction: 1 } };
};
const pc = (m: number, key = 2) => (((m - key) % 12) + 12) % 12;

describe('loop generation', () => {
  it('is deterministic for (window, layer, date)', () => {
    const a = buildPattern(sampleWindow('sst', box, '2007-11-14', 32), temp, voiceFor('sst'), 2);
    const b = buildPattern(sampleWindow('sst', box, '2007-11-14', 32), temp, voiceFor('sst'), 2);
    expect(a).toEqual(b);
    expect(a.steps).toHaveLength(STEPS);
  });

  it('changes when the date changes', () => {
    const a = buildPattern(sampleWindow('sst', box, '2007-04-14', 32), temp, voiceFor('sst'), 2);
    const b = buildPattern(sampleWindow('sst', box, '2007-08-14', 32), temp, voiceFor('sst'), 2);
    expect(a).not.toEqual(b);
  });

  it('harmonises: every voice stays in the shared chord of the bar (melody may pass through the scale)', () => {
    for (const mood of [0, 1, 2] as Mood[]) {
      for (const v of VOICES) {
        const layer = L(v.layer);
        const win = field(layer, 24, (r, c) => 0.2 + 0.6 * Math.abs(Math.sin(r * 1.3 + c * 0.7)));
        buildPattern(win, layer, v, 2, mood).steps.forEach((s, i) => {
          for (const n of s.notes) {
            const allowed = v.role === 'melody' && i % 2 === 1 ? SCALES[mood] : chordAt(mood, Math.floor(i / 4));
            expect(allowed, `${v.layer} mood ${mood} step ${i}`).toContain(pc(n.midi));
          }
        });
      }
    }
  });

  it('value sets loudness: a field warming eastwards gets louder', () => {
    const p = buildPattern(field(temp, 32, (_, c) => c / 32), temp, voiceFor('sst'), 2);
    const vel = p.steps.flatMap((s) => s.notes.map((n) => n.vel));
    expect(vel.length).toBeGreaterThan(3);
    expect(vel.at(-1)!).toBeGreaterThan(vel[0]);
  });

  it('north-south position sets pitch height', () => {
    const north = buildPattern(field(temp, 24, (r) => (r < 4 ? 0.9 : 0.1)), temp, voiceFor('sst'), 2);
    const south = buildPattern(field(temp, 24, (r) => (r > 19 ? 0.9 : 0.1)), temp, voiceFor('sst'), 2);
    const avg = (p: typeof north) => { const m = p.steps.flatMap((s) => s.notes.map((n) => n.midi)); return m.reduce((a, x) => a + x, 0) / m.length; };
    expect(avg(north)).toBeGreaterThan(avg(south));
  });

  it('severity follows each layer\'s danger direction', () => {
    expect(severity(voiceFor('sst'), 0.99)).toBe(1); // marine heat
    expect(severity(voiceFor('sst'), 0.5)).toBe(0);
    expect(severity(voiceFor('lightning'), 0.8)).toBe(1); // thunderstorms
    expect(severity(voiceFor('lights'), 1)).toBe(0); // light is not a danger here
    expect(buildPattern(constantWindow(L('lightning'), 0.9), L('lightning'), voiceFor('lightning'), 2).severity).toBe(1);
  });

  it('marks no-data columns', () => {
    const n = 16;
    const win = { grid: new Float32Array(n * n).fill(NaN), n, stats: { mean: NaN, min: NaN, max: NaN, variance: NaN, gradientDeg: NaN, validFraction: 0 } };
    expect(buildPattern(win, temp, voiceFor('sst'), 2).allNoData).toBe(true);
  });

  it('fixture has no-data regions', () => {
    const w = sampleWindow('sst', { west: -130, east: -120, south: -47, north: -37 }, '2007-11-14', 16);
    expect(w.stats.validFraction).toBeLessThan(1);
  });
});
