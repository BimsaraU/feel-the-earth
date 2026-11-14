import type { WindowStats } from './types';

/** Shared by every DataSource so stats mean the same thing for fixture and real data. */
export function computeStats(grid: Float32Array, n: number): WindowStats {
  let sum = 0, count = 0, min = Infinity, max = -Infinity;
  let east = 0, eastN = 0, west = 0, westN = 0, north = 0, northN = 0, south = 0, southN = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = grid[r * n + c];
      if (Number.isNaN(v)) continue;
      sum += v; count++;
      if (v < min) min = v;
      if (v > max) max = v;
      if (c >= n / 2) { east += v; eastN++; } else { west += v; westN++; }
      if (r < n / 2) { north += v; northN++; } else { south += v; southN++; }
    }
  }
  if (!count) return { mean: NaN, min: NaN, max: NaN, variance: NaN, gradientDeg: NaN, validFraction: 0 };
  const mean = sum / count;
  let ss = 0;
  for (const v of grid) if (!Number.isNaN(v)) ss += (v - mean) ** 2;
  const dx = eastN && westN ? east / eastN - west / westN : 0;
  const dy = northN && southN ? north / northN - south / southN : 0;
  const gradientDeg = dx === 0 && dy === 0 ? NaN : ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  return { mean, min, max, variance: ss / count, gradientDeg, validFraction: count / grid.length };
}
