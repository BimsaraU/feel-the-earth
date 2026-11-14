import { describe, expect, it } from 'vitest';
import { FixtureSource, sampleWindow } from '../data/fixture';
import { buildPattern, ROWS, STEPS } from './loop';
import { voiceFor } from './mapping';

const layers = await new FixtureSource().listLayers();
const temp = layers.find((l) => l.id === 'temperature')!;
const box = { west: 75.7, east: 85.7, south: 2.9, north: 12.9 };
const stats = (mean: number) => ({ mean, min: mean, max: mean, variance: 0, gradientDeg: NaN, validFraction: 1 });
const field = (n: number, f: (r: number, c: number) => number) => {
  const grid = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r * n + c] = f(r, c);
  return grid;
};

describe('loop generation (scan sonification)', () => {
  it('is deterministic for (window, layer, date)', () => {
    const a = buildPattern(sampleWindow('temperature', box, '2026-11-14', 32), temp, voiceFor('temperature'), 2);
    const b = buildPattern(sampleWindow('temperature', box, '2026-11-14', 32), temp, voiceFor('temperature'), 2);
    expect(a).toEqual(b);
    expect(a.steps).toHaveLength(STEPS);
  });

  it('changes when the date changes', () => {
    const a = buildPattern(sampleWindow('temperature', box, '2026-01-14', 32), temp, voiceFor('temperature'), 2);
    const b = buildPattern(sampleWindow('temperature', box, '2026-07-14', 32), temp, voiceFor('temperature'), 2);
    expect(a).not.toEqual(b);
  });

  it('a uniform field is one held chord: rows to pitch, north highest', () => {
    const n = 12;
    const p = buildPattern({ grid: field(n, () => 20), n, stats: stats(20) }, temp, voiceFor('temperature'), 2);
    expect(p.steps[0].notes).toHaveLength(ROWS);
    expect(p.steps.slice(1).every((s) => s.notes.length === 0)).toBe(true); // held, not retriggered
    const midis = p.steps[0].notes.map((x) => x.midi);
    expect(midis).toEqual([...midis].sort((a, b) => b - a)); // row 0 (north) first and highest
    expect(p.steps[0].notes[0].dur).toBeGreaterThan(STEPS - 1);
  });

  it('value sets loudness: warmer east is louder', () => {
    const n = 32;
    const p = buildPattern({ grid: field(n, (_, c) => -40 + (80 * c) / n), n, stats: stats(0) }, temp, voiceFor('temperature'), 2);
    const vel = p.steps.filter((s) => s.notes.length).map((s) => s.notes[0].vel);
    expect(vel.length).toBeGreaterThan(3);
    expect(vel).toEqual([...vel].sort((a, b) => a - b));
  });

  it('marks no-data columns', () => {
    const n = 16;
    const p = buildPattern({ grid: new Float32Array(n * n).fill(NaN), n, stats: { ...stats(NaN), validFraction: 0 } }, temp, voiceFor('temperature'), 2);
    expect(p.allNoData).toBe(true);
  });

  it('fixture has no-data regions', () => {
    const w = sampleWindow('temperature', { west: -130, east: -120, south: -47, north: -37 }, '2026-11-14', 16);
    expect(w.stats.validFraction).toBeLessThan(1);
  });
});
