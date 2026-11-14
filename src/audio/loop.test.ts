import { describe, expect, it } from 'vitest';
import { FixtureSource, sampleWindow } from '../data/fixture';
import { buildPattern, STEPS } from './loop';
import { voiceFor } from './mapping';

const layers = await new FixtureSource().listLayers();
const temp = layers.find((l) => l.id === 'temperature')!;
const box = { west: 75.7, east: 85.7, south: 2.9, north: 12.9 };
const flat = (mean: number) => ({ mean, min: mean, max: mean, variance: 0, gradientDeg: NaN, validFraction: 1 });

describe('loop generation', () => {
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

  it('reads west to east: a field rising eastwards gives rising notes', () => {
    const n = 32;
    const grid = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r * n + c] = -40 + (80 * c) / n;
    const p = buildPattern({ grid, n, stats: { ...flat(0), gradientDeg: 90 } }, temp, voiceFor('temperature'), 2);
    const notes = p.steps.map((s) => s.notes[0].midi);
    expect(notes).toEqual([...notes].sort((x, y) => x - y));
    expect(notes[STEPS - 1]).toBeGreaterThan(notes[0]);
    expect(p.pan).toBeGreaterThan(voiceFor('temperature').pan); // values rise to the east: drift right
  });

  it('marks no-data columns', () => {
    const n = 16;
    const p = buildPattern({ grid: new Float32Array(n * n).fill(NaN), n, stats: { ...flat(NaN), validFraction: 0 } }, temp, voiceFor('temperature'), 2);
    expect(p.allNoData).toBe(true);
  });

  it('fixture has no-data regions', () => {
    const w = sampleWindow('temperature', { west: -130, east: -120, south: -47, north: -37 }, '2026-11-14', 16);
    expect(w.stats.validFraction).toBeLessThan(1);
  });
});
