import { describe, expect, it } from 'vitest';
import type { LayerInfo } from '../data/types';
import type { Halo } from '../state';
import { grainSound, haloMean, placement, pointsAround } from './field';

describe('surround field', () => {
  it('halo mean reads the right cells, ignores NaN, wraps longitude', () => {
    // 4 x 4 over lat -20..20, lon 170..210 (crosses the antimeridian); value = column index, row 0 NaN.
    const n = 4, grid = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r * n + c] = r === 0 ? NaN : c;
    const h: Halo = { box: { west: 170, east: 210, south: -20, north: 20 }, n, lat: 0, lon: 190, size: 16, grids: { sst: grid } };
    expect(haloMean(h, grid, -15, 175, 1)).toBe(0); // first column
    expect(haloMean(h, grid, -15, -155, 1)).toBe(3); // 205 E written as -155: last column
    expect(haloMean(h, grid, 15, 175, 1)).toBeNaN(); // only the NaN row
  });
});

describe('granular field', () => {
  const layer = { id: 'sst', min: 0, max: 32, scale: 'linear' } as LayerInfo;
  const n = 96;
  // Warm to the east, a sharp front at 5 E; 50 x 50 degrees around (0, 0).
  const grid = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r * n + c] = -25 + ((c + 0.5) * 50) / n > 5 ? 30 : 10;
  const h: Halo = { box: { west: -25, east: 25, south: -25, north: 25 }, n, lat: 0, lon: 0, size: 20, grids: { sst: grid } };
  const chord = [0, 3, 7];

  it('moving never changes what a place sounds like, only where it is heard from', () => {
    const a = pointsAround(h, grid, layer, 0, 0, 10), b = pointsAround(h, grid, layer, 1.3, 2.1, 10);
    const shared = a.filter((p) => b.some((q) => q.i === p.i && q.j === p.j));
    expect(shared.length).toBeGreaterThan(10);
    for (const p of shared) {
      const q = b.find((x) => x.i === p.i && x.j === p.j)!;
      expect(grainSound(q, chord, 2)).toEqual(grainSound(p, chord, 2));
      expect(placement(q, 1.3, 2.1, 10)).not.toEqual(placement(p, 0, 0, 10));
    }
  });

  it('places east to the right and north ahead; nearer is louder and brighter', () => {
    const [east] = pointsAround(h, grid, layer, 0, 0, 10).filter((p) => p.lat === 0 && p.lon > 5);
    const at = placement(east, 0, 0, 10), far = placement(east, 0, -6, 10);
    expect(at.x).toBeGreaterThan(0);
    expect(Math.abs(at.y)).toBeLessThan(1e-9);
    expect(at.gain).toBeGreaterThan(far.gain);
    expect(at.lowpass).toBeGreaterThan(far.lowpass);
  });

  it('value, gradient and danger each change a different sound dimension', () => {
    const pts = pointsAround(h, grid, layer, 0, 0, 10);
    const warm = pts.find((p) => p.lon > 9)!, cold = pts.find((p) => p.lon < -5)!, front = pts.find((p) => Math.abs(p.lon - 5) < 2 && p.grad > 0.5)!;
    const [w, c, f] = [warm, cold, front].map((p) => grainSound(p, chord, 2));
    expect(w.midi).toBeGreaterThan(c.midi); // value -> chord-tone height
    expect(w.rate).toBeGreaterThan(c.rate); // value -> density
    expect(f.index).toBeGreaterThan(c.index); // gradient -> timbre
    expect(chord).toContain(((w.midi - 2) % 12 + 12) % 12); // always a chord tone, relative to the key (D)
    expect(w.clash).toBe(w.midi + 1); // 30 °C is past the marine-heat line: danger -> semitone clash
    expect(c.clash).toBeNull();
  });
});
