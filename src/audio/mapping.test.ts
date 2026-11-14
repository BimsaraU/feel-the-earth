import { describe, expect, it } from 'vitest';
import { FixtureSource } from '../data/fixture';
import { PENTATONIC, ROWS } from './loop';
import { denorm, norm, renderMappingMarkdown, scaleNotes, VOICES } from './mapping';

const layers = await new FixtureSource().listLayers();

describe('mapping table', () => {
  it('value -> normalised -> value round-trips for every layer', () => {
    for (const l of layers) {
      for (const t of [0, 0.1, 0.37, 0.5, 0.9, 1]) {
        const v = denorm(t, l);
        expect(norm(v, l)).toBeCloseTo(t, 9);
        expect(denorm(norm(v, l), l)).toBeCloseTo(v, 6);
      }
    }
  });

  it('every layer has exactly one voice and unique keys', () => {
    expect(new Set(VOICES.map((v) => v.layer))).toEqual(new Set(layers.map((l) => l.id)));
    expect(new Set(VOICES.map((v) => v.key)).size).toBe(VOICES.length);
  });

  it('every voice register holds one pentatonic note per scan row in every key', () => {
    for (const v of VOICES) for (let k = 0; k < 12; k++) expect(scaleNotes(k, ...v.register, PENTATONIC).length).toBeGreaterThanOrEqual(ROWS);
  });

  it('docs/MAPPING.md matches the table (npm run mapping regenerates it)', async () => {
    await expect(renderMappingMarkdown(layers)).toMatchFileSnapshot('../../docs/MAPPING.md');
  });
});
