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
    const wind = layers.find((l) => l.id === 'wind')!;
    expect(whatAmIHearing([{ layer: wind, voice: voiceFor('wind'), mean: 24 }])).toBe(
      'Demo data, not NASA data. Wind speed, 24 metres per second, high. You hear it as the flute and the wind. More and louder flute notes, and more wind noise, mean stronger wind. The music is calm. The scan runs west to east; higher notes are further north.');
    expect(whatAmIHearing([{ layer: wind, voice: voiceFor('wind'), mean: NaN }])).toContain('no data');
  });

  it('formats numbers', () => {
    expect(spokenNumber(-5.24)).toBe('minus 5.2');
    expect(spokenNumber(412.3)).toBe('412');
    expect(roughKm(1102)).toBe('1,100 kilometres');
  });
});
