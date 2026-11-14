import type { GeoGrid } from './grid';

export type LineId = 'equator' | 'tropicOfCancer' | 'tropicOfCapricorn' | 'arcticCircle' | 'antarcticCircle' | 'primeMeridian' | 'antimeridian';

export type GeoEvent =
  | { type: 'border'; from: string; to: string }
  | { type: 'coast'; to: 'land' | 'sea'; name: string }
  | { type: 'line'; line: LineId }
  | { type: 'pole'; which: 'north' | 'south' }
  | { type: 'manyBorders'; active: boolean };

const LAT_LINES: [LineId, number][] = [
  ['equator', 0], ['tropicOfCancer', 23.44], ['tropicOfCapricorn', -23.44], ['arcticCircle', 66.56], ['antarcticCircle', -66.56],
];

export const LINE_NAMES: Record<LineId, string> = {
  equator: 'the equator', tropicOfCancer: 'the Tropic of Cancer', tropicOfCapricorn: 'the Tropic of Capricorn',
  arcticCircle: 'the Arctic Circle', antarcticCircle: 'the Antarctic Circle', primeMeridian: 'the prime meridian', antimeridian: 'the antimeridian',
};

const HYSTERESIS_DEG = 0.15; // must be this far past a border before it counts while dragging
const SAME_EVENT_MS = 250;
const MANY_BORDERS_PER_S = 3;

const wrap = (d: number) => ((d + 540) % 360) - 180;

/** Turns window-centre movement into geo events. Feed it every position; it walks the path between them. */
export class GeoEventTracker {
  private lat = NaN;
  private lon = NaN;
  private committed = 0; // country id, 0 = sea
  private pending: { id: number; lat: number; lon: number } | null = null;
  private lastFired = new Map<string, number>();
  private borderTimes: number[] = [];
  private many = false;

  constructor(private geo: GeoGrid) {}

  reset(lat: number, lon: number) {
    this.lat = lat; this.lon = lon;
    this.committed = this.geo.countryId(lat, lon);
    this.pending = null;
  }

  /** settle: the move is discrete (keyboard, button), so commit any pending state at the end. */
  update(lat: number, lon: number, now: number, settle: boolean): GeoEvent[] {
    if (Number.isNaN(this.lat)) { this.reset(lat, lon); return []; }
    const out: GeoEvent[] = [];
    const dLon = wrap(lon - this.lon), dLat = lat - this.lat;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dLon), Math.abs(dLat)) / this.geo.meta.res));
    let pLat = this.lat, pLon = this.lon;
    for (let i = 1; i <= steps; i++) {
      const sLat = this.lat + (dLat * i) / steps;
      const sLonRaw = this.lon + (dLon * i) / steps;
      const sLon = wrap(sLonRaw);
      this.lines(pLat, pLon, sLat, sLonRaw, out);
      this.land(sLat, sLon, i === steps && settle, out);
      pLat = sLat; pLon = sLonRaw;
    }
    this.lat = lat; this.lon = lon;
    return this.throttle(out, now);
  }

  private lines(aLat: number, aLon: number, bLat: number, bLon: number, out: GeoEvent[]) {
    for (const [id, l] of LAT_LINES) if ((aLat - l) * (bLat - l) < 0 || (bLat === l && aLat !== l)) out.push({ type: 'line', line: id });
    // aLon is the previous sample's unwrapped longitude, bLon continues it, so crossings are sign changes.
    const kA = Math.floor((aLon + 180) / 360), kB = Math.floor((bLon + 180) / 360);
    if (kA !== kB) out.push({ type: 'line', line: 'antimeridian' });
    else if ((wrap(aLon) < 0) !== (wrap(bLon) < 0) && Math.abs(wrap(aLon)) < 90) out.push({ type: 'line', line: 'primeMeridian' });
  }

  private land(lat: number, lon: number, settle: boolean, out: GeoEvent[]) {
    const id = this.geo.countryId(lat, lon);
    if (id === this.committed) { this.pending = null; return; }
    if (!this.pending || this.pending.id !== id) this.pending = { id, lat, lon };
    const past = Math.max(Math.abs(lat - this.pending.lat), Math.abs(wrap(lon - this.pending.lon)));
    if (!settle && past < HYSTERESIS_DEG) return;
    const from = this.committed;
    this.committed = id;
    this.pending = null;
    if (from && id) out.push({ type: 'border', from: this.geo.countryName(from), to: this.geo.countryName(id) });
    else if (id) out.push({ type: 'coast', to: 'land', name: this.geo.countryName(id) });
    else out.push({ type: 'coast', to: 'sea', name: this.geo.seaName(lat, lon) });
  }

  private throttle(events: GeoEvent[], now: number): GeoEvent[] {
    const out: GeoEvent[] = [];
    for (const e of events) {
      if (e.type === 'border') {
        this.borderTimes.push(now);
        this.borderTimes = this.borderTimes.filter((t) => now - t < 1000);
        if (!this.many && this.borderTimes.length > MANY_BORDERS_PER_S) {
          this.many = true;
          out.push({ type: 'manyBorders', active: true });
        }
        if (this.many) continue;
      }
      const key = JSON.stringify(e);
      if (now - (this.lastFired.get(key) ?? -Infinity) < SAME_EVENT_MS) continue;
      this.lastFired.set(key, now);
      out.push(e);
    }
    return out;
  }

  /** Call regularly (e.g. each animation frame or on drag end) to leave many-borders mode once things calm down. */
  tick(now: number): GeoEvent[] {
    this.borderTimes = this.borderTimes.filter((t) => now - t < 1000);
    if (this.many && this.borderTimes.length === 0) {
      this.many = false;
      return [{ type: 'manyBorders', active: false }];
    }
    return [];
  }
}
