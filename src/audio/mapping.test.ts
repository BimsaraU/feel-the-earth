import { describe, expect, it } from 'vitest';
import { FixtureSource } from '../data/fixture';
import { PROGRESSIONS, type Mood } from './harmony';
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

  it('every voice can play every chord of every mood in every key', () => {
    for (const v of VOICES) for (let k = 0; k < 12; k++) for (const m of [0, 1, 2] as Mood[]) for (const ch of PROGRESSIONS[m].chords) {
      expect(scaleNotes(k, ...v.register, [ch[0]]).length).toBeGreaterThan(0); // root, for bass and pulse
      expect(scaleNotes(k, ...v.register, ch).length).toBeGreaterThanOrEqual(2); // two tones, for pads
    }
  });

  it('docs/MAPPING.md matches the table (npm run mapping regenerates it)', async () => {
    await expect(renderMappingMarkdown(layers)).toMatchFileSnapshot('../../docs/MAPPING.md');
  });
});
