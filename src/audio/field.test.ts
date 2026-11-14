import { describe, expect, it } from 'vitest';
import type { Halo } from '../state';
import { haloMean } from './field';

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
