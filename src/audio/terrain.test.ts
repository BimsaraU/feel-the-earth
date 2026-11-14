import { describe, expect, it } from 'vitest';
import type { LayerInfo } from '../data/types';
import type { Halo } from '../state';
import { relief, rung, smooth } from './terrain';

const layer = { id: 'sst', min: 0, max: 100, scale: 'linear' } as LayerInfo;
const n = 48;
/** Halo of 25 degrees around (0, 180): crosses the antimeridian. */
const halo = (f: (lat: number, lon: number) => number): [Halo, Float32Array] => {
  const box = { west: 167.5, east: 192.5, south: -12.5, north: 12.5 };
  const grid = new Float32Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r * n + c] = f(12.5 - ((r + 0.5) * 25) / n, 167.5 + ((c + 0.5) * 25) / n);
  const h: Halo = { box, n, lat: 0, lon: 180, size: 10, grids: { sst: grid } };
  return [h, smooth(h, grid, layer)];
};

describe('terrain probe', () => {
  it('a ramp rising eastwards pulls east, climbs rungs going east, and has its peak to the east', () => {
    const [h, s] = halo((_lat, lon) => 40 + (lon - 180));
    const a = relief(h, s, 0, 180, 10), b = relief(h, s, 0, -177, 10); // 3 degrees further east, written as 177 W
    expect(a.east).toBeGreaterThan(0.2);
    expect(Math.abs(a.north)).toBeLessThan(0.01);
    expect(a.t).toBeCloseTo(0.4, 2);
    expect(rung(b, 16) - rung(a, 16)).toBeGreaterThan(1); // 3 % of the layer range is still more than a rung
    expect(a.peak!.east).toBeGreaterThan(1);
    expect(a.valley!.east).toBeLessThan(-1);
  });

  it('finds a bump as the peak, with the right bearing and distance', () => {
    const [h, s] = halo((lat, lon) => 20 + 60 * Math.exp(-((lat - 5) ** 2 + (lon - 175) ** 2) / 8));
    const r = relief(h, s, 0, 180, 10);
    expect(r.peak!.lat).toBeCloseTo(5, 0);
    expect(r.peak!.lon).toBeCloseTo(175, 0);
    expect(r.peak!.north).toBeCloseTo(0.5, 1);
    expect(r.peak!.east).toBeCloseTo(-0.5, 1);
    expect(relief(h, s, 5, 175, 10).peak!.dist).toBeLessThan(0.12); // standing on it
  });

  it('flat or missing data gives no beacons and no slope', () => {
    const [h, s] = halo(() => 50);
    const r = relief(h, s, 0, 180, 10);
    expect([r.peak, r.valley, r.east, r.north]).toEqual([null, null, 0, 0]);
    const [h2, s2] = halo(() => NaN);
    expect(relief(h2, s2, 0, 180, 10).t).toBeNaN();
  });
});
