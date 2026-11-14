// O(1) lookups into the Natural Earth raster built by scripts/build_geo.py.

export interface GeoMeta {
  res: number;
  width: number;
  height: number;
  countries: string[];
  seas: string[];
}

export const KM_PER_DEG = 111.32;
const D2R = Math.PI / 180;

export class GeoGrid {
  readonly country: Uint8Array;
  readonly sea: Uint8Array;

  /** Land elevation in 25 m steps (0 = sea level or below), same cells as the country grid. */
  readonly elevation: Uint8Array | null;

  constructor(bytes: Uint8Array, readonly meta: GeoMeta, elevation?: Uint8Array) {
    this.elevation = elevation ?? null;
    const n = meta.width * meta.height;
    this.country = bytes.subarray(0, n);
    this.sea = bytes.subarray(n, 2 * n);
  }

  cell(lat: number, lon: number): number {
    const { res, width, height } = this.meta;
    const r = Math.min(height - 1, Math.max(0, Math.floor((90 - lat) / res)));
    const c = (((Math.floor((lon + 180) / res)) % width) + width) % width;
    return r * width + c;
  }

  /** 0 = no country (sea). */
  countryId(lat: number, lon: number): number {
    return this.country[this.cell(lat, lon)];
  }

  countryName(id: number): string {
    return this.meta.countries[id - 1] ?? '';
  }

  /** Nearest named sea or ocean; every cell has one. */
  seaName(lat: number, lon: number): string {
    return this.meta.seas[this.sea[this.cell(lat, lon)] - 1] ?? 'open ocean';
  }

  /** Share of land in a box, 0..1, from a 10 x 10 sample. */
  landShare(box: { west: number; east: number; south: number; north: number }): number {
    let land = 0;
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
      const lat = box.south + ((i + 0.5) * (box.north - box.south)) / 10;
      const lon = box.west + ((j + 0.5) * (box.east - box.west)) / 10;
      if (this.countryId(lat, lon) > 0) land++;
    }
    return land / 100;
  }

  /** Mean elevation of the land in a box, metres (0 when the box is all sea). */
  landElevation(box: { west: number; east: number; south: number; north: number }): number {
    if (!this.elevation) return 0;
    let sum = 0, k = 0;
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
      const c = this.cell(box.south + ((i + 0.5) * (box.north - box.south)) / 10, box.west + ((j + 0.5) * (box.east - box.west)) / 10);
      if (this.country[c] > 0) { sum += this.elevation[c] * 25; k++; }
    }
    return k ? sum / k : 0;
  }

  /** Ring search outwards for the nearest cell whose land state differs. Called on demand, not per frame. */
  nearestCoast(lat: number, lon: number, maxKm = 3000): { km: number; bearingDeg: number } | null {
    const { res } = this.meta;
    const land = this.countryId(lat, lon) > 0;
    const maxR = Math.ceil(maxKm / KM_PER_DEG / res);
    let best: { km: number; bearingDeg: number } | null = null;
    for (let k = 1; k <= maxR; k++) {
      // Once a hit exists, rings further out (in latitude, the shortest axis) cannot be closer.
      if (best && k * res * KM_PER_DEG > best.km) break;
      for (let i = -k; i <= k; i++) {
        for (const [di, dj] of [[i, -k], [i, k], [-k, i], [k, i]]) {
          const pLat = lat + dj * res, pLon = lon + di * res;
          if (Math.abs(pLat) > 90 || (this.countryId(pLat, pLon) > 0) === land) continue;
          const d = distanceKm(lat, lon, pLat, pLon);
          if (!best || d < best.km) best = { km: d, bearingDeg: bearing(lat, lon, pLat, pLon) };
        }
      }
    }
    return best;
  }
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(((lat2 - lat1) * D2R) / 2) ** 2 +
    Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(((lon2 - lon1) * D2R) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin((lon2 - lon1) * D2R) * Math.cos(lat2 * D2R);
  const x = Math.cos(lat1 * D2R) * Math.sin(lat2 * D2R) - Math.sin(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.cos((lon2 - lon1) * D2R);
  return ((Math.atan2(y, x) / D2R) + 360) % 360;
}

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compassWord = (deg: number) => POINTS[Math.round(deg / 45) % 8];

export async function loadGeo(base = import.meta.env.BASE_URL): Promise<GeoGrid> {
  const [bin, meta, elev] = await Promise.all([
    fetch(`${base}data/geo/grid.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}data/geo/meta.json`).then((r) => r.json()),
    fetch(`${base}data/geo/elevation.bin`).then((r) => r.arrayBuffer()),
  ]);
  return new GeoGrid(new Uint8Array(bin), meta, new Uint8Array(elev));
}
