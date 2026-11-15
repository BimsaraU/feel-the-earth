import { describe, expect, it } from 'vitest';
import { loadGeoFromDisk } from '../geo/testGeo';
import { matchPlace, parseCommand } from './commands';

describe('assistant commands', () => {
  it.each([
    ['play', { kind: 'play' }],
    ['please pause', { kind: 'pause' }],
    ['far north', { kind: 'move', dir: 'north', steps: 5 }],
    ['go east three', { kind: 'move', dir: 'east', steps: 3 }],
    ['night light change', { kind: 'layer', id: 'lightschange' }],
    ['show me the night lights', { kind: 'layer', id: 'lights' }],
    ['air quality', { kind: 'layer', id: 'aerosol' }],
    ['air temperature', { kind: 'layer', id: 'airtemp' }],
    ['ocean', { kind: 'layer', id: 'sst' }],
    ['lightening', { kind: 'layer', id: 'lightning' }],
    ['go to Niger', { kind: 'goto', place: 'niger' }],
    ['next month', { kind: 'frame', step: 1, unit: 'month' }],
    ['previous year', { kind: 'frame', step: -1, unit: 'year' }],
    ['next', { kind: 'layerStep', step: 1 }],
    ['why is the sea warmer to the east', { kind: 'unknown' }], // open question: the conversational assistant
    ['zoom in', { kind: 'zoom', step: 1 }],
    ['wider', { kind: 'window', step: 1 }],
    ['what am I hearing', { kind: 'what' }],
    ['where am I', { kind: 'where' }],
    ['find the peak', { kind: 'beacons' }],
    ['time travel off', { kind: 'travel', on: false }],
    ['louder', { kind: 'volume', step: 1 }],
    ['explorer', { kind: 'explore', on: true }],
    ['banana', { kind: 'unknown' }],
  ])('%s', (text, want) => expect(parseCommand(text)).toEqual(want));

  it('finds spoken places and their centres', () => {
    const geo = loadGeoFromDisk();
    const names = [...geo.meta.countries, ...geo.meta.seas];
    expect(matchPlace('sri lanka', names)).toBe('Sri Lanka');
    expect(matchPlace('america', names)).toBe('United States');
    const c = geo.centreOf('Sri Lanka')!;
    expect(c.lat).toBeCloseTo(7.8, 0);
    expect(c.lon).toBeCloseTo(80.7, 0);
    expect(geo.centreOf('Fiji')!.lon).toBeGreaterThan(170); // straddles the antimeridian: circular mean
  });
});
