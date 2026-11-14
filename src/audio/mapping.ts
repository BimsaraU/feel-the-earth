// The one machine-readable mapping table. docs/MAPPING.md is generated from this file
// (npm run mapping) and the assist answers read their wording from here.

import type { LayerId, LayerInfo } from '../data/types';

export type Instrument = 'cello' | 'flute' | 'harp' | 'contrabass' | 'clarinet' | 'oboe' | 'glock' | 'marimba' | 'piano';

/**
 * pitch: column value picks the scale degree (higher value, higher note).
 * density: column value picks how many notes per step (more notes, higher value).
 * intensity: column value sets loudness and brightness of a fixed note.
 */
export type StepMode = 'pitch' | 'density' | 'intensity';

export interface VoiceMapping {
  layer: LayerId;
  /** Keyboard toggle 1..9. */
  key: number;
  instrument: Instrument;
  instrumentSpoken: string;
  mode: StepMode;
  /** MIDI range the voice may use. Keeps each voice in its own band. */
  register: [number, number];
  /** Per-layer EQ: high-pass and low-pass corners in Hz. */
  band: [number, number];
  /** Stereo home position -1..1. */
  pan: number;
  /** Mix trim in dB so voices sit at similar loudness. */
  trimDb: number;
  /** One sentence for "What am I hearing?". */
  hear: string;
}

export const VOICES: VoiceMapping[] = [
  { layer: 'temperature', key: 1, instrument: 'cello', instrumentSpoken: 'the cello section', mode: 'pitch', register: [38, 62], band: [60, 2500], pan: -0.25, trimDb: 0, hear: 'Higher notes mean warmer air.' },
  { layer: 'wind', key: 2, instrument: 'flute', instrumentSpoken: 'the flute', mode: 'density', register: [72, 86], band: [400, 9000], pan: 0.45, trimDb: -4, hear: 'Faster notes mean stronger wind.' },
  { layer: 'precipitation', key: 3, instrument: 'harp', instrumentSpoken: 'the harp', mode: 'density', register: [62, 86], band: [200, 8000], pan: -0.55, trimDb: -2, hear: 'More plucks mean heavier rain.' },
  { layer: 'co2', key: 4, instrument: 'contrabass', instrumentSpoken: 'the double bass', mode: 'pitch', register: [26, 47], band: [35, 800], pan: 0, trimDb: 0, hear: 'Higher notes mean more carbon dioxide.' },
  { layer: 'co', key: 5, instrument: 'clarinet', instrumentSpoken: 'the clarinet', mode: 'pitch', register: [50, 74], band: [150, 4000], pan: 0.2, trimDb: -3, hear: 'Higher notes mean more carbon monoxide.' },
  { layer: 'no2', key: 6, instrument: 'oboe', instrumentSpoken: 'the oboe', mode: 'intensity', register: [62, 74], band: [300, 6000], pan: -0.15, trimDb: -5, hear: 'Louder, brighter notes mean more nitrogen dioxide.' },
  { layer: 'o3', key: 7, instrument: 'glock', instrumentSpoken: 'the glockenspiel', mode: 'pitch', register: [79, 103], band: [1200, 12000], pan: 0.6, trimDb: -8, hear: 'Higher notes mean a thicker ozone layer.' },
  { layer: 'pm25', key: 8, instrument: 'marimba', instrumentSpoken: 'the marimba', mode: 'intensity', register: [45, 57], band: [80, 3000], pan: 0.3, trimDb: -2, hear: 'Louder, brighter notes mean dirtier air.' },
];

export const voiceFor = (layer: LayerId) => VOICES.find((v) => v.layer === layer)!;

/** Rows shared by every layer: which window feature drives which sound parameter. */
export const FEATURES = [
  { feature: 'Window, read west to east', sound: 'The 4-bar loop. 16 columns become 16 steps, one per beat.' },
  { feature: 'Column mean', sound: 'Note (pitch voices), notes per step (density voices) or loudness (intensity voices) of that step.' },
  { feature: 'Column variance', sound: 'Articulation. Smooth columns are held, rough columns are short and detached.' },
  { feature: 'Whole-window mean', sound: 'Register and timbre blend: higher mean, higher octave band and brighter filter.' },
  { feature: 'Gradient direction', sound: 'Slow stereo drift towards the side where values rise (east right, west left).' },
  { feature: 'No data', sound: 'Soft felt-piano pulse on that step. Never silence.' },
];

export const EVENT_SOUNDS = [
  { event: 'Border crossed', sound: 'Two wooden clave ticks, the second higher: stepping into the next country.', sample: 'clave' },
  { event: 'Many borders per second', sound: 'Continuous soft clave patter.', sample: 'clave' },
  { event: 'Coast, into sea', sound: 'Short wave wash.', sample: 'wave' },
  { event: 'Coast, onto land', sound: 'Soft hand-drum thud.', sample: 'framedrum' },
  { event: 'Equator', sound: 'Singing bowl.', sample: 'singingbowl' },
  { event: 'Tropics and polar circles', sound: 'Small bell.', sample: 'smallbell' },
  { event: 'Prime meridian', sound: 'Small bell, lower.', sample: 'smallbell' },
  { event: 'Antimeridian', sound: 'Reversed cymbal swell.', sample: 'cymbal' },
  { event: 'Window moving', sound: 'Brushed whoosh, louder when faster.', sample: 'whoosh' },
  { event: 'Day step', sound: 'One clock ratchet tick.', sample: 'ratchet' },
  { event: 'Month step', sound: 'Wind chime.', sample: 'windchime' },
  { event: 'Pole limit', sound: 'Low muted gong.', sample: 'gong' },
  { event: 'Haptic fallback', sound: 'Short low thump where no vibration motor is available.', sample: 'thump' },
] as const;

/** Vibration patterns in ms (on, off, on...). The audio fallback plays one thump per "on". */
export const HAPTICS = {
  border: [15, 40, 15],
  coast: [40],
  noData: [5, 30, 5, 30, 5],
  timeStep: [8],
  accent: [10],
};
export type HapticPattern = keyof typeof HAPTICS;

// ---- value scaling ----

export function norm(v: number, l: Pick<LayerInfo, 'min' | 'max' | 'scale'>): number {
  if (Number.isNaN(v)) return NaN;
  const t = l.scale === 'log'
    ? (Math.log(Math.max(v, l.min)) - Math.log(l.min)) / (Math.log(l.max) - Math.log(l.min))
    : (v - l.min) / (l.max - l.min);
  return Math.min(1, Math.max(0, t));
}

export function denorm(t: number, l: Pick<LayerInfo, 'min' | 'max' | 'scale'>): number {
  return l.scale === 'log' ? Math.exp(Math.log(l.min) + t * (Math.log(l.max) - Math.log(l.min))) : l.min + t * (l.max - l.min);
}

export const levelWord = (t: number) => (t < 1 / 3 ? 'low' : t < 2 / 3 ? 'typical' : 'high');

// ---- music theory ----

export const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/** All MIDI notes of the key inside [lo, hi], ascending. */
export function scaleNotes(keyRoot: number, lo: number, hi: number, mode = DORIAN): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (mode.includes((((m - keyRoot) % 12) + 12) % 12)) out.push(m);
  return out;
}

export function renderMappingMarkdown(layers: Pick<LayerInfo, 'id' | 'name' | 'unit' | 'min' | 'max' | 'scale'>[]): string {
  const name = (id: LayerId) => layers.find((l) => l.id === id);
  const lines = [
    '# Sound mapping',
    '',
    'Generated from `src/audio/mapping.ts` by `npm run mapping`. Do not edit by hand.',
    'Every sound traces to a data value. Transport: 72 bpm, D dorian, 4-bar loop (settings can change tempo and key).',
    '',
    '## Layers',
    '',
    '| Key | Layer | Range | Scale | Voice | Mode | MIDI register | EQ band (Hz) | Pan | Meaning |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...VOICES.map((v) => {
      const l = name(v.layer)!;
      return `| ${v.key} | ${l.name} | ${l.min} to ${l.max} ${l.unit} | ${l.scale} | ${v.instrument} | ${v.mode} | ${v.register[0]}-${v.register[1]} | ${v.band[0]}-${v.band[1]} | ${v.pan} | ${v.hear} |`;
    }),
    '',
    '## Window features (all layers)',
    '',
    '| Data feature | Sound parameter |',
    '|---|---|',
    ...FEATURES.map((f) => `| ${f.feature} | ${f.sound} |`),
    '',
    '## Events',
    '',
    '| Event | Sound | Sample slot |',
    '|---|---|---|',
    ...EVENT_SOUNDS.map((e) => `| ${e.event} | ${e.sound} | \`${e.sample}\` |`),
    '',
    '## Haptic patterns (ms, on/off/on...)',
    '',
    '| Event | Pattern |',
    '|---|---|',
    ...Object.entries(HAPTICS).map(([k, p]) => `| ${k} | ${p.join(', ')} |`),
    '',
  ];
  return lines.join('\n');
}
