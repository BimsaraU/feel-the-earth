import { computeStats } from './stats';
import type { BBox, DataSource, LayerId, LayerInfo, WindowData } from './types';

// DEMO DATA. Plausible-looking synthetic fields, deterministic for (layer, date).
// Nothing here is NASA data; every layer is flagged demo and labelled as such in UI and speech.

const DEMO = 'DEMO DATA: synthetic fixture for development, not NASA data.';
const RANGE: [string, string] = ['2015-01-01', '2026-12-31'];

const LAYERS: LayerInfo[] = [
  { id: 'temperature', name: 'Surface air temperature', unit: '°C', unitSpoken: 'degrees Celsius', min: -50, max: 45, scale: 'linear' },
  { id: 'wind', name: 'Wind speed', unit: 'm/s', unitSpoken: 'metres per second', min: 0, max: 30, scale: 'linear' },
  { id: 'precipitation', name: 'Precipitation', unit: 'mm/day', unitSpoken: 'millimetres per day', min: 0.1, max: 60, scale: 'log' },
  { id: 'co2', name: 'Carbon dioxide', unit: 'ppm', unitSpoken: 'parts per million', min: 395, max: 435, scale: 'linear' },
  { id: 'co', name: 'Carbon monoxide', unit: 'ppb', unitSpoken: 'parts per billion', min: 40, max: 300, scale: 'linear' },
  { id: 'no2', name: 'Nitrogen dioxide', unit: 'µmol/m²', unitSpoken: 'micromoles per square metre', min: 1, max: 300, scale: 'log' },
  { id: 'o3', name: 'Ozone column', unit: 'DU', unitSpoken: 'Dobson units', min: 120, max: 480, scale: 'linear' },
  { id: 'pm25', name: 'Fine particulate matter, PM2.5', unit: 'µg/m³', unitSpoken: 'micrograms per cubic metre', min: 1, max: 200, scale: 'log' },
].map((l) => ({ ...l, id: l.id as LayerId, scale: l.scale as 'linear' | 'log', timeRange: RANGE, resolutionDeg: 0.5, cadence: 'daily' as const, sourceText: DEMO, demo: true }));

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
    case 'temperature': {
      const base = 30 * Math.cos(lat * D2R) ** 1.5 - 18;
      return base - 14 * Math.sin(lat * D2R) * season + (drift(1, 12) - 0.5) * 10;
    }
    case 'wind': {
      const jets = 14 * (blob(lat, 0, 45, 0, 8) + blob(lat, 0, -50, 0, 8));
      const trades = 6 * (blob(lat, 0, 15, 0, 6) + blob(lat, 0, -15, 0, 6));
      return Math.max(0, 2 + jets + trades + (drift(2, 10) - 0.5) * 12);
    }
    case 'precipitation': {
      const itcz = blob(lat, 0, 6 - 8 * season, 0, 7);
      const storms = Math.max(0, drift(3, 8) - 0.45) * 2;
      return Math.max(0.1, 40 * itcz * drift(4, 6) + 25 * storms * (1 - Math.abs(lat) / 90));
    }
    case 'co2': {
      const years = d.year - 2015 + d.doy / 365;
      const cycle = Math.cos((2 * Math.PI * (d.doy - 130)) / 365) * (lat > 0 ? 3.5 : 0.8);
      return 400 + 2.4 * years + cycle + (noise(lat, lon, 20, 5) - 0.5) * 3;
    }
    case 'co': {
      if (Math.abs(lat) > 70) return NaN; // retrieval gap at high latitude
      const fires = blob(lat, lon, -8, 20, 8) + blob(lat, lon, -8, -60, 8) + blob(lat, lon, 2, 105, 6);
      return 60 + 40 * (lat > 0 ? 1 : 0.3) + 150 * fires * drift(6, 10) + 30 * drift(7, 15);
    }
    case 'no2': {
      if (Math.abs(lat) > 70) return NaN;
      const cities = blob(lat, lon, 35, 115, 5) + blob(lat, lon, 28, 77, 4) + blob(lat, lon, 51, 7, 4) + blob(lat, lon, 40, -76, 4);
      return Math.max(1, 6 + 250 * cities * (0.6 + 0.4 * drift(8, 6)) + 8 * drift(9, 10));
    }
    case 'o3': {
      const polarNight = (lat < -75 && d.doy > 150 && d.doy < 240) || (lat > 75 && (d.doy < 45 || d.doy > 330));
      if (polarNight) return NaN;
      const hole = lat < -60 && d.doy > 245 && d.doy < 320 ? 140 * Math.sin((Math.PI * (d.doy - 245)) / 75) : 0;
      return 260 + 120 * Math.abs(Math.sin(lat * D2R)) ** 2 - hole + 40 * (drift(10, 15) - 0.5);
    }
    case 'pm25': {
      if (Math.abs(lat) > 70) return NaN;
      const sources = 120 * blob(lat, lon, 27, 80, 5) + 90 * blob(lat, lon, 33, 113, 6) + 70 * blob(lat, lon, 20, 8, 10);
      return Math.max(1, 4 + sources * (0.5 + drift(11, 8)) + 6 * drift(12, 10));
    }
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
