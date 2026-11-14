import { describe, expect, it } from 'vitest';
import { GeoEventTracker, type GeoEvent } from './events';
import { loadGeoFromDisk } from './testGeo';

const geo = loadGeoFromDisk();

function walk(path: [number, number][], settle = true, dtMs = 1000): GeoEvent[] {
  const t = new GeoEventTracker(geo);
  t.reset(...path[0]);
  return path.slice(1).flatMap(([lat, lon], i) => t.update(lat, lon, (i + 1) * dtMs, settle));
}

describe('geo events', () => {
  it('looks up countries and seas', () => {
    expect(geo.countryName(geo.countryId(7.9, 80.7))).toBe('Sri Lanka');
    expect(geo.countryId(0, -30)).toBe(0);
    expect(geo.seaName(0, -30)).toMatch(/Atlantic/);
  });

  it('France to Germany across the Rhine is one border event', () => {
    expect(walk([[48.5, 3], [48.5, 9]])).toEqual([{ type: 'border', from: 'France', to: 'Germany' }]);
  });

  it('leaving Sri Lanka eastwards reaches the sea', () => {
    const ev = walk([[7.9, 80.7], [7.9, 84]]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'coast', to: 'sea' });
  });

  it('arriving in Sri Lanka from the west is a coast onto land', () => {
    expect(walk([[7.9, 77], [7.9, 80.7]])).toEqual([{ type: 'coast', to: 'land', name: 'Sri Lanka' }]);
  });

  it('crosses the equator, tropics and antimeridian', () => {
    expect(walk([[-1, -30], [1, -30]])).toEqual([{ type: 'line', line: 'equator' }]);
    expect(walk([[20, -40], [25, -40]])).toEqual([{ type: 'line', line: 'tropicOfCancer' }]);
    expect(walk([[0, 179], [0, -179]])).toEqual([{ type: 'line', line: 'antimeridian' }]);
    expect(walk([[0, -179], [0, 179]])).toEqual([{ type: 'line', line: 'antimeridian' }]);
    expect(walk([[40, -20], [40, -10]])).toEqual([]); // open Atlantic, nothing to hear
  });

  it('suppresses jitter on a border while dragging', () => {
    // Find the France/Germany boundary on 48.5N, then wobble across it by 0.05 degrees.
    let lon = 7;
    while (geo.countryName(geo.countryId(48.5, lon)) === 'France') lon += 0.01;
    const path: [number, number][] = [[48.5, lon - 0.5]];
    for (let i = 0; i < 20; i++) path.push([48.5, lon + (i % 2 ? 0.05 : -0.05)]);
    expect(walk(path, false, 50).filter((e) => e.type === 'border')).toHaveLength(0);
  });

  it('switches to the many-borders texture above 3 borders a second', () => {
    const t = new GeoEventTracker(geo);
    t.reset(48.5, 3);
    const out: GeoEvent[] = [];
    // Back and forth over the Rhine, 5 crossings within one second.
    [9, 3, 9, 3, 9].forEach((lon, i) => out.push(...t.update(48.5, lon, i * 150, true)));
    expect(out.filter((e) => e.type === 'border').length).toBeLessThanOrEqual(3);
    expect(out).toContainEqual({ type: 'manyBorders', active: true });
    expect(t.tick(5000)).toEqual([{ type: 'manyBorders', active: false }]);
  });

  it('finds the nearest coast', () => {
    const c = geo.nearestCoast(7.9, 80.7)!;
    expect(c.km).toBeGreaterThan(20);
    expect(c.km).toBeLessThan(150);
  });
});
