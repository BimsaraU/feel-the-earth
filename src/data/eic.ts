import { computeStats } from './stats';
import type { BBox, DataSource, LayerId, LayerInfo, WindowData } from './types';

// NASA EIC / SVS layers, pre-processed by pipeline/build_eic.py into 8-bit PNG atlases
// (0 = no data, 1..255 = min..max). Everything is served from the app, so it works offline.

interface ManifestLayer {
  id: LayerId; name: string; unit: string; unitSpoken: string; min: number; max: number; scale: 'linear' | 'log';
  res: number; cadence: LayerInfo['cadence']; sourceText: string; page: string;
  width: number; height: number; perAtlas: number; atlases: string[]; dates: string[];
}

const DAY = 86400000;
const days = (iso: string) => Date.parse(iso + 'T00:00:00Z') / DAY;

export class EicSource implements DataSource {
  private manifest: Promise<ManifestLayer[]>;
  private atlases = new Map<string, Promise<Uint8Array>>();

  constructor(private base = `${import.meta.env.BASE_URL}data/eic/`) {
    this.manifest = fetch(this.base + 'manifest.json').then((r) => r.json()).then((m) => m.layers);
  }

  async listLayers(): Promise<LayerInfo[]> {
    return (await this.manifest).map((l) => ({
      id: l.id, name: l.name, unit: l.unit, unitSpoken: l.unitSpoken, min: l.min, max: l.max, scale: l.scale,
      timeRange: l.cadence === 'static' ? ['2012-01-01', '2023-12-31']
        : l.cadence === 'monthly' ? [l.dates[0], `${l.dates[l.dates.length - 1].slice(0, 7)}-28`]
        : l.cadence === 'annual' ? [`${l.dates[0].slice(0, 4)}-01-01`, `${l.dates[l.dates.length - 1].slice(0, 4)}-12-31`]
        : [l.dates[0], l.dates[l.dates.length - 1]],
      resolutionDeg: l.res, cadence: l.cadence, sourceText: l.sourceText, demo: false,
    }));
  }

  /** Index of the frame that covers a date. Annual frames cover their year, monthly their month. Synchronised time:
   *  outside a layer's record (or in a gap) the nearest frame stands in, so every layer always plays something. */
  frameFor(l: ManifestLayer, dateISO: string): number {
    if (l.cadence === 'static') return 0;
    const exact = l.cadence === 'annual' ? l.dates.findIndex((d) => d.slice(0, 4) === dateISO.slice(0, 4))
      : l.cadence === 'monthly' ? l.dates.findIndex((d) => d.slice(0, 7) === dateISO.slice(0, 7)) : -1;
    if (exact >= 0) return exact;
    const t = days(dateISO);
    let best = 0, bestD = Infinity;
    l.dates.forEach((d, i) => { const dd = Math.abs(days(d) - t); if (dd < bestD) { bestD = dd; best = i; } });
    return best;
  }

  /** Date of the frame actually heard for a layer at a date (differs from the date outside its record). */
  async frameDate(id: LayerId, dateISO: string): Promise<string | null> {
    const l = (await this.manifest).find((x) => x.id === id);
    return l ? l.dates[this.frameFor(l, dateISO)] : null;
  }

  private atlas(file: string): Promise<Uint8Array> {
    let p = this.atlases.get(file);
    if (!p) {
      p = fetch(this.base + file).then((r) => r.blob())
        // Raw 8-bit codes: no colour management, or values would shift.
        .then((b) => createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })).then((bmp) => {
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
        const out = new Uint8Array(bmp.width * bmp.height);
        for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4];
        return out;
      });
      this.atlases.set(file, p);
    }
    return p;
  }

  async getWindow(layerId: LayerId, bbox: BBox, dateISO: string, n: number): Promise<WindowData> {
    const l = (await this.manifest).find((x) => x.id === layerId)!;
    const grid = new Float32Array(n * n).fill(NaN);
    const f = l ? this.frameFor(l, dateISO) : -1;
    if (f >= 0 && l.dates.length) {
      const px = await this.atlas(l.atlases[Math.floor(f / l.perAtlas)]);
      const row0 = (f % l.perAtlas) * l.height;
      const { width: W, height: H, res } = l;
      const value = (r: number, c: number) => {
        const k = px[(row0 + Math.min(H - 1, Math.max(0, r))) * W + (((c % W) + W) % W)];
        return k ? l.min + ((k - 1) / 254) * (l.max - l.min) : NaN;
      };
      const dLat = (bbox.north - bbox.south) / n, dLon = (bbox.east - bbox.west) / n;
      for (let r = 0; r < n; r++) {
        const y = (90 - (bbox.north - (r + 0.5) * dLat)) / res - 0.5;
        for (let c = 0; c < n; c++) {
          const x = (bbox.west + (c + 0.5) * dLon + 180) / res - 0.5;
          // Bilinear between the four nearest cells, ignoring cells without data.
          const y0 = Math.floor(y), x0 = Math.floor(x), fy = y - y0, fx = x - x0;
          let s = 0, w = 0;
          for (let k = 0; k < 4; k++) {
            const dy = k >> 1, dx = k & 1, wt = (dy ? fy : 1 - fy) * (dx ? fx : 1 - fx);
            const v = value(y0 + dy, x0 + dx);
            if (!Number.isNaN(v) && wt > 0) { s += v * wt; w += wt; }
          }
          grid[r * n + c] = w > 0.25 ? s / w : NaN;
        }
      }
    }
    return { grid, n, stats: computeStats(grid, n) };
  }
}
