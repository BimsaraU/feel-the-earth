// Heatmap painting, pure: runs in a Web Worker (paint.worker.ts) so the per-pixel work never blocks the main thread,
// where it used to stall the audio scheduler (heard as stumbles in the music) on every redraw.
import { norm } from '../audio/mapping';
import type { BBox, LayerId, LayerInfo } from '../data/types';
import { colour } from './colour';

export const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
export const invMerc = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;
/** Catmull-Rom weights for the four samples around fraction f. */
const cr = (f: number) => [((-f + 2) * f - 1) * f / 2, ((3 * f - 5) * f * f + 2) / 2, ((-3 * f + 4) * f + 1) * f / 2, (f - 1) * f * f / 2];

/** Noisy retrievals are smoothed for display only (the sound reads the raw data): 3 x 3 NaN-aware box passes.
 *  CO2 cells scatter by a few ppm from retrieval noise, which hid the real pattern under speckle. */
const SMOOTH: Partial<Record<LayerId, number>> = { co2: 3 };

/** NaN-aware 3 x 3 box blur, `passes` times. Holes with at least 5 of 8 neighbours filled in are filled (single
 *  missing cells), so the basemap does not show through as dark specks; coasts and big gaps stay open. */
export function smoothGrid(g: Float32Array, n: number, passes: number): Float32Array {
  let a = g;
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      let s = 0, k = 0;
      for (let i = r - 1; i <= r + 1; i++) for (let j = c - 1; j <= c + 1; j++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const v = a[i * n + j];
        if (!Number.isNaN(v)) { s += v; k++; }
      }
      const self = a[r * n + c];
      b[r * n + c] = Number.isNaN(self) && k < 5 ? NaN : k ? s / k : NaN;
    }
    a = b;
  }
  return a;
}

/**
 * Paint one layer's grid (n x n cells over box) as a W x H Web Mercator image, as sharply as the data allows:
 * the data is bicubically (Catmull-Rom) interpolated to every pixel; relief shading from the local gradient (light
 * from the north-west) gives fronts and basins a soft relief. No contour lines: on data recovered from video colours
 * they traced pixel noise as squiggles. Edges of the data fade over half a cell.
 */
export function paintPixels(layer: LayerInfo, grid: Float32Array, n: number, box: BBox, W: number, H: number): ImageData {
  const g = SMOOTH[layer.id] ? smoothGrid(grid, n, SMOOTH[layer.id]!) : grid;
  const at = (r: number, c: number) => g[Math.max(0, Math.min(n - 1, r)) * n + Math.max(0, Math.min(n - 1, c))];
  const c0 = new Int32Array(W), fx = new Float32Array(W), wx = new Float32Array(W * 4);
  for (let x = 0; x < W; x++) {
    const fc = ((x + 0.5) / W) * n - 0.5;
    c0[x] = Math.floor(fc); fx[x] = fc - c0[x]; wx.set(cr(fx[x]), x * 4);
  }
  // 1. Normalised value and coverage per pixel.
  const T = new Float32Array(W * H), A = new Uint8Array(W * H);
  const yN = mercY(box.north), yS = mercY(box.south);
  for (let y = 0; y < H; y++) {
    const lat = invMerc(yN + ((yS - yN) * (y + 0.5)) / H);
    const fr = ((box.north - lat) / (box.north - box.south)) * n - 0.5, r0 = Math.floor(fr), fy = fr - r0, wy = cr(fy);
    for (let x = 0; x < W; x++) {
      const c = c0[x];
      let v = 0, ok = true;
      for (let j = 0; j < 4 && ok; j++) for (let i = 0; i < 4; i++) {
        const s = at(r0 - 1 + j, c - 1 + i);
        if (Number.isNaN(s)) { ok = false; break; }
        v += s * wy[j] * wx[x * 4 + i];
      }
      let a = 1;
      if (!ok) { // next to missing data: still bicubic, missing samples stand in as the local mean; fade out over the last cell
        let sum = 0, k = 0, w = 0;
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const s = at(r0 + j, c + i);
          if (!Number.isNaN(s)) { sum += s; k++; w += (j ? fy : 1 - fy) * (i ? fx[x] : 1 - fx[x]); }
        }
        v = k ? 0 : NaN;
        for (let j = 0; j < 4 && k; j++) for (let i = 0; i < 4; i++) {
          const s = at(r0 - 1 + j, c - 1 + i);
          v += (Number.isNaN(s) ? sum / k : s) * wy[j] * wx[x * 4 + i];
        }
        a = Math.max(0, Math.min(1, (w - 0.15) / 0.7));
      }
      T[y * W + x] = norm(v, layer);
      A[y * W + x] = Number.isNaN(v) ? 0 : 255 * a;
    }
  }
  // 2. Colour and gentle relief shading.
  const img = new ImageData(W, H), px = img.data;
  const k = 1.2 / ((box.east - box.west) / W); // shading strength per unit of (range per degree)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = T[i];
    if (!A[i]) continue;
    const e = x < W - 1 && A[i + 1] ? T[i + 1] : t, s = y < H - 1 && A[i + W] ? T[i + W] : t;
    const shade = Math.max(0.94, Math.min(1.06, 1 + k * (e - t + s - t)));
    const c = colour(t, layer.id);
    for (let q = 0; q < 3; q++) px[i * 4 + q] = Math.min(255, c[q] * shade);
    px[i * 4 + 3] = A[i];
  }
  return img;
}
