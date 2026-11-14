import { computeStats } from './stats';
import type { BBox, DataSource, LayerId, LayerInfo, WindowData } from './types';

// DEMO DATA. Synthetic stand-ins for the four EIC layers, deterministic for (layer, date). Used by tests
// and as an offline fallback if the EIC manifest cannot load. Flagged demo and labelled as such.

const DEMO = 'DEMO DATA: synthetic fixture for development, not NASA data.';

const LAYERS: LayerInfo[] = [
  { id: 'sst', name: 'Sea surface temperature', unit: '°C', unitSpoken: 'degrees Celsius', min: 0, max: 32, scale: 'linear', cadence: 'daily' },
  { id: 'lightning', name: 'Lightning', unit: 'index', unitSpoken: 'on a lightning density index from 0 to 1', min: 0, max: 0.4, scale: 'linear', cadence: '10-day' },
  { id: 'lights', name: 'Night lights', unit: 'index', unitSpoken: 'on a brightness index from 0 to 1', min: 0, max: 0.6, scale: 'linear', cadence: 'annual' },
  { id: 'lightschange', name: 'Night light change 2012 to 2023', unit: 'index', unitSpoken: 'on a scale from minus 1 to plus 1', min: -0.6, max: 0.6, scale: 'linear', cadence: 'static' },
  { id: 'co2', name: 'Carbon dioxide', unit: 'ppm', unitSpoken: 'parts per million', min: 390, max: 405, scale: 'linear', cadence: 'monthly' },
  { id: 'airtemp', name: 'Air temperature', unit: 'K', unitSpoken: 'kelvin', min: 201, max: 319, scale: 'linear', cadence: 'monthly' },
  { id: 'precip', name: 'Precipitation', unit: 'mm/day', unitSpoken: 'millimetres per day', min: 0, max: 20, scale: 'linear', cadence: 'monthly' },
  { id: 'ndvi', name: 'Vegetation', unit: 'NDVI', unitSpoken: 'on the vegetation index from minus 1 to 1', min: -0.03, max: 0.98, scale: 'linear', cadence: 'monthly' },
  { id: 'aerosol', name: 'Aerosols', unit: 'AOD', unitSpoken: 'aerosol optical depth', min: 0, max: 0.9, scale: 'linear', cadence: 'monthly' },
].map((l) => ({ ...l, id: l.id as LayerId, scale: 'linear' as const, cadence: l.cadence as LayerInfo['cadence'], timeRange: ['2007-01-01', '2023-12-31'] as [string, string], resolutionDeg: 0.5, sourceText: DEMO, demo: true }));

const D2R = Math.PI / 180;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in 0..1. Wraps in longitude so the antimeridian is seamless. */
function noise(lat: number, lon: number, cellDeg: number, seed: number): number {
  const period = Math.round(360 / cellDeg);
  const x = (lon + 180) / cellDeg, y = (lat + 90) / cellDeg;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => hash(((i % period) + period) % period, j, seed);
  const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * sx;
  const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * sx;
  return a + (b - a) * sy;
}

const fbm = (lat: number, lon: number, cellDeg: number, seed: number) =>
  0.65 * noise(lat, lon, cellDeg, seed) + 0.35 * noise(lat, lon, cellDeg / 2.7, seed + 17);

function blob(lat: number, lon: number, cLat: number, cLon: number, r: number): number {
  const dLon = ((lon - cLon + 540) % 360) - 180;
  const d2 = (lat - cLat) ** 2 + (dLon * Math.cos(cLat * D2R)) ** 2;
  return Math.exp(-d2 / (2 * r * r));
}

export interface DayInfo { day: number; doy: number; year: number }

export function dayInfo(dateISO: string): DayInfo {
  const t = Date.parse(dateISO + 'T00:00:00Z');
  const year = new Date(t).getUTCFullYear();
  return { day: Math.floor(t / 86400000), doy: Math.floor((t - Date.UTC(year, 0, 1)) / 86400000), year };
}

/** One field value. NaN marks regions with no data. */
export function fieldValue(id: LayerId, lat: number, lon: number, d: DayInfo): number {
  const season = Math.cos((2 * Math.PI * (d.doy - 15)) / 365); // +1 mid January, -1 mid July
  // Weather noise drifts eastward and decorrelates over about a week.
  const week = Math.floor(d.day / 7), f = (d.day % 7) / 7;
  const drift = (s: number, cell: number) =>
    fbm(lat, lon - d.day * 1.5, cell, s + week) * (1 - f) + fbm(lat, lon - d.day * 1.5, cell, s + week + 1) * f;

  if (blob(lat, lon, -42, -125, 6) > 0.3) return NaN; // simulated sensor gap, all layers

  switch (id) {
    case 'sst': {
      const base = 29 * Math.cos(lat * D2R) ** 2 - 1;
      return Math.max(-1.8, base - 4 * Math.sin(lat * D2R) * season + (drift(1, 12) - 0.5) * 3);
    }
    case 'lightning': {
      const storms = blob(lat, lon, -2, 24, 10) + blob(lat, lon, -5, -60, 12) + blob(lat, lon, 5, 110, 12);
      return Math.max(0, 0.3 * storms * drift(2, 8) + 0.03 * blob(lat, 0, 0, 0, 25));
    }
    case 'lights': {
      const cities = blob(lat, lon, 40, -75, 3) + blob(lat, lon, 51, 5, 4) + blob(lat, lon, 28, 77, 3) + blob(lat, lon, 31, 121, 3);
      return Math.min(0.6, 0.5 * cities * (0.9 + 0.01 * (d.year - 2012)));
    }
    case 'lightschange':
      return 0.4 * blob(lat, lon, 28, 77, 5) - 0.3 * blob(lat, lon, 49, 2, 4);
    case 'co2':
      return 396 + 4 * Math.cos(lat * D2R) + 3 * (drift(3, 20) - 0.5);
    case 'airtemp':
      return 250 + 50 * Math.cos(lat * D2R) ** 2 - 10 * Math.sin(lat * D2R) * season;
    case 'precip':
      return 14 * (blob(lat, lon, 0, 100, 15) + blob(lat, lon, -3, -60, 12)) * drift(4, 10);
    case 'ndvi':
      return 0.8 * (blob(lat, lon, -3, -60, 14) + blob(lat, lon, 0, 20, 12) + blob(lat, lon, 50, 10, 15));
    case 'aerosol':
      return 0.8 * blob(lat, lon, 20, 10, 12) + 0.6 * blob(lat, lon, 28, 80, 8);
  }
}

export function normLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export class FixtureSource implements DataSource {
  async listLayers() {
    return LAYERS;
  }

  async getWindow(layerId: LayerId, bbox: BBox, dateISO: string, gridN: number): Promise<WindowData> {
    return sampleWindow(layerId, bbox, dateISO, gridN);
  }
}

/** Synchronous core, also used for the colour overlay and scrub-mode previews. */
export function sampleWindow(layerId: LayerId, bbox: BBox, dateISO: string, n: number): WindowData {
  const d = dayInfo(dateISO);
  const grid = new Float32Array(n * n);
  const dLat = (bbox.north - bbox.south) / n, dLon = (bbox.east - bbox.west) / n;
  for (let r = 0; r < n; r++) {
    const lat = bbox.north - (r + 0.5) * dLat;
    for (let c = 0; c < n; c++) grid[r * n + c] = fieldValue(layerId, lat, normLon(bbox.west + (c + 0.5) * dLon), d);
  }
  return { grid, n, stats: computeStats(grid, n) };
}
