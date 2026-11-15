import { describe, expect, it } from 'vitest';
import { smoothGrid } from './paint';

describe('smoothGrid', () => {
  it('fills a single missing cell, flattens a spike, leaves big gaps open', () => {
    const n = 5, g = new Float32Array(n * n).fill(1);
    g[1 * n + 1] = NaN; // isolated hole
    g[3 * n + 3] = 10; // noisy spike
    for (let c = 0; c < n; c++) g[4 * n + c] = NaN; // a whole missing row (edge of the data)
    g[3 * n + 0] = NaN;
    const s = smoothGrid(g, n, 1);
    expect(s[1 * n + 1]).toBeCloseTo(1);
    expect(s[3 * n + 3]).toBeLessThan(3);
    expect(Number.isNaN(s[4 * n + 2])).toBe(true);
  });
});
