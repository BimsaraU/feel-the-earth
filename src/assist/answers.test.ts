import { describe, expect, it } from 'vitest';
import { voiceFor } from '../audio/mapping';
import { FixtureSource } from '../data/fixture';
import { loadGeoFromDisk } from '../geo/testGeo';
import { roughKm, spokenNumber, whatAmIHearing, whereAmI } from './answers';

const geo = loadGeoFromDisk();
const layers = await new FixtureSource().listLayers();

describe('assist answers', () => {
  it('where am I', () => {
    const s = whereAmI(geo, 7.9, 80.7, 10, '2026-11-14');
    expect(s).toMatch(/^Window centre 7.9 north, 80.7 east, over Sri Lanka\./);
    expect(s).toContain('about 1,100 kilometres');
    expect(s).toMatch(/Nearest coast is .* kilometres/);
    expect(s).toContain('Date: 14 November 2026.');
  });

  it('what am I hearing', () => {
    const sst = layers.find((l) => l.id === 'sst')!;
    expect(whatAmIHearing([{ layer: sst, voice: voiceFor('sst'), mean: 24 }])).toBe(
      'Demo data, not NASA data. Sea surface temperature, 24 degrees Celsius, high. You hear it as the cello section. Louder means warmer water; cold water sounds thin and icy, warm water dark and full. The music is calm. The scan runs west to east; higher notes are further north.');
    expect(whatAmIHearing([{ layer: sst, voice: voiceFor('sst'), mean: NaN }])).toContain('no data');
    expect(whatAmIHearing([{ layer: { ...sst, demo: false }, voice: voiceFor('sst'), mean: 24 }])).not.toContain('Demo');
  });

  it('formats numbers', () => {
    expect(spokenNumber(-5.24)).toBe('minus 5.2');
    expect(spokenNumber(412.3)).toBe('412');
    expect(roughKm(1102)).toBe('1,100 kilometres');
  });
});
