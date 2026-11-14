// The one machine-readable mapping table. docs/MAPPING.md is generated from this file
// (npm run mapping) and the assist answers read their wording from here.

import type { LayerId, LayerInfo } from '../data/types';

export type Instrument = 'cello' | 'flute' | 'harp' | 'contrabass' | 'clarinet' | 'oboe' | 'glock' | 'marimba' | 'piano' | 'cellotrem';

/**
 * Orchestral role. All roles draw notes from the one shared chord of the bar (see harmony.ts),
 * so layers that do not correlate still harmonise, the way sections of an orchestra share a progression.
 *   bass:   chord root (and fifth when the bar rises), held.
 *   pad:    two inner chord tones, held a bar; height from where in the window values are highest.
 *   melody: one line; pitch from the north-south position of the strongest cell, smooth voice leading.
 *   arp:    rising or falling chord tones, more notes per beat for higher values.
 *   color:  sparse high chord tones on local peaks only.
 *   pulse:  steady beat on root and fifth, loudness from value.
 */
export type Role = 'bass' | 'pad' | 'melody' | 'arp' | 'color' | 'pulse';

/** A value interpolated by the window's normalised mean t (0 = layer minimum, 1 = maximum). */
export type Span = [atLow: number, atHigh: number];

export interface VoiceMapping {
  layer: LayerId;
  /** Keyboard toggle 1..9. */
  key: number;
  instrument: Instrument;
  instrumentSpoken: string;
  role: Role;
  /** MIDI range the voice may use. Keeps each voice in its own band. */
  register: [number, number];
  /** Character: filters that make the timbre match the feature (Hz, interpolated geometrically by t). */
  timbre: { hp: Span; lp: Span; q: Span };
  /** Recorded texture under the instrument, level in dB by t (wind noise, rain). */
  texture?: { sample: 'windbed' | 'rain'; db: Span };
  /** When this layer is dangerous: severity rises from 0 at `from` to 1 at `to` (t space; from > to = low is bad). */
  danger: { from: number; to: number; what: string };
  /** Stereo home position -1..1. */
  pan: number;
  /** Mix trim in dB so voices sit at similar loudness. */
  trimDb: number;
  /** One sentence for "What am I hearing?". */
  hear: string;
}

export const VOICES: VoiceMapping[] = [
  { layer: 'temperature', key: 1, instrument: 'cello', instrumentSpoken: 'the cello section', role: 'melody', register: [45, 69],
    timbre: { hp: [220, 60], lp: [9000, 2400], q: [0.7, 0.7] }, danger: { from: 0.72, to: 0.95, what: 'heat' },
    pan: -0.25, trimDb: 0, hear: 'Louder means warmer air; cold air sounds thin and icy, hot air dark and full.' },
  { layer: 'wind', key: 2, instrument: 'flute', instrumentSpoken: 'the flute and the wind', role: 'arp', register: [74, 91],
    timbre: { hp: [500, 300], lp: [4000, 10000], q: [0.7, 0.7] }, texture: { sample: 'windbed', db: [-40, -16] },
    danger: { from: 0.6, to: 0.9, what: 'storm winds' },
    pan: 0.45, trimDb: -6, hear: 'More and louder flute notes, and more wind noise, mean stronger wind.' },
  { layer: 'precipitation', key: 3, instrument: 'harp', instrumentSpoken: 'the harp and the rain', role: 'arp', register: [62, 86],
    timbre: { hp: [200, 200], lp: [5000, 8000], q: [0.7, 0.7] }, texture: { sample: 'rain', db: [-42, -14] },
    danger: { from: 0.7, to: 0.95, what: 'flooding rain' },
    pan: -0.55, trimDb: -4, hear: 'More harp plucks and louder rain mean heavier rain.' },
  { layer: 'co2', key: 4, instrument: 'contrabass', instrumentSpoken: 'the double bass', role: 'bass', register: [28, 43],
    timbre: { hp: [35, 35], lp: [1600, 450], q: [0.7, 5] }, danger: { from: 0.35, to: 0.9, what: 'carbon dioxide' },
    pan: 0, trimDb: 0, hear: 'Louder, darker and more growling means more carbon dioxide.' },
  { layer: 'co', key: 5, instrument: 'clarinet', instrumentSpoken: 'the clarinet', role: 'pad', register: [50, 67],
    timbre: { hp: [150, 150], lp: [4000, 1600], q: [0.7, 3] }, danger: { from: 0.45, to: 0.9, what: 'carbon monoxide' },
    pan: 0.2, trimDb: -4, hear: 'Louder and duller means more carbon monoxide.' },
  { layer: 'no2', key: 6, instrument: 'oboe', instrumentSpoken: 'the oboe', role: 'pad', register: [62, 77],
    timbre: { hp: [300, 300], lp: [7000, 3200], q: [0.7, 7] }, danger: { from: 0.4, to: 0.85, what: 'nitrogen dioxide' },
    pan: -0.15, trimDb: -6, hear: 'Louder and harsher, more nasal, means more nitrogen dioxide.' },
  { layer: 'o3', key: 7, instrument: 'glock', instrumentSpoken: 'the glockenspiel', role: 'color', register: [79, 98],
    timbre: { hp: [1200, 1200], lp: [6000, 12000], q: [0.7, 0.7] }, danger: { from: 0.35, to: 0.05, what: 'ozone loss' },
    pan: 0.6, trimDb: -9, hear: 'More and brighter bells mean a thicker ozone layer; an ozone hole falls silent.' },
  { layer: 'pm25', key: 8, instrument: 'marimba', instrumentSpoken: 'the marimba', role: 'pulse', register: [45, 60],
    timbre: { hp: [80, 80], lp: [5000, 700], q: [0.7, 1.5] }, danger: { from: 0.45, to: 0.85, what: 'smoky, dusty air' },
    pan: 0.3, trimDb: -4, hear: 'Louder and more muffled, as if through smog, means dirtier air.' },
];

export const voiceFor = (layer: LayerId) => VOICES.find((v) => v.layer === layer)!;

/** Interpolate a Span; frequencies geometrically so the sweep sounds even. */
export const span = ([a, b]: Span, t: number, geometric = false) =>
  geometric ? a * (b / a) ** t : a + (b - a) * t;

/** Severity of one layer, 0 (fine) .. 1 (dangerous), from its normalised window mean. */
export function severity(v: VoiceMapping, t: number): number {
  if (Number.isNaN(t)) return 0;
  return Math.min(1, Math.max(0, (t - v.danger.from) / (v.danger.to - v.danger.from)));
}

export const moodWord = (s: number) => (s < 0.34 ? 'calm' : s < 0.67 ? 'uneasy' : 'severe');

/** Rows shared by every layer: which window feature drives which sound parameter. */
export const FEATURES = [
  { feature: 'Scan', sound: 'A line sweeps the window west to east over 4 bars (16 beats), then repeats. Method after NASA Chandra sonifications.' },
  { feature: 'North-south position', sound: 'Pitch height: features in the north of the window sound higher.' },
  { feature: 'Value', sound: 'Loudness, and for arp voices the number of notes per beat.' },
  { feature: 'Shared harmony', sound: 'All layers play tones of one chord per bar from a 4-chord progression, so uncorrelated data still harmonises.' },
  { feature: 'Severity (worst active layer)', sound: 'Chooses the progression: calm (D dorian, open), uneasy (D minor), severe (harmonic minor with diminished and dominant b9 chords). Above uneasy a tremolo string drone enters; above severe a timpani heartbeat.' },
  { feature: 'Gradient along the scan', sound: 'Rising values swell (louder), falling values recede; a steep front (12 % of range per beat) is an accent.' },
  { feature: 'Window mean', sound: 'Character filters per layer (see table): e.g. cold air thin and icy, CO2 darker and growling, PM2.5 muffled.' },
  { feature: 'East-west position', sound: 'Stereo follows the scan from left to right.' },
  { feature: 'Land and water share', sound: 'Ambience: soft sea wash for water, land sounds for land, mixed by share.' },
  { feature: 'Land elevation', sound: 'Land ambience: low land is warm (breeze and birds, darker), high land chilly (mountain wind, thinner).' },
  { feature: 'No data', sound: 'Soft felt-piano pulse on that beat. Never silence.' },
];

export const EVENT_SOUNDS = [
  { event: 'Border crossed', sound: 'Two faint wooden ticks, the second higher.', sample: 'clave' },
  { event: 'Many borders per second', sound: 'Faint continuous wooden patter.', sample: 'clave' },
  { event: 'Coast, into sea', sound: 'Faint wave wash.', sample: 'wave' },
  { event: 'Coast, onto land', sound: 'Faint, muffled hand-drum touch.', sample: 'framedrum' },
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
  border: [12, 40, 12],
  coast: [30],
  noData: [5, 30, 5, 30, 5],
  timeStep: [8],
  accent: [10],
  test: [40, 60, 40],
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

/** All MIDI notes whose pitch class (relative to the key) is in `pcs`, inside [lo, hi], ascending. */
export function scaleNotes(keyRoot: number, lo: number, hi: number, pcs = DORIAN): number[] {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes((((m - keyRoot) % 12) + 12) % 12)) out.push(m);
  return out;
}

export function renderMappingMarkdown(layers: Pick<LayerInfo, 'id' | 'name' | 'unit' | 'min' | 'max' | 'scale'>[]): string {
  const name = (id: LayerId) => layers.find((l) => l.id === id);
  const hz = (s: Span) => (s[0] === s[1] ? `${s[0]}` : `${s[0]} → ${s[1]}`);
  const lines = [
    '# Sound mapping',
    '',
    'Generated from `src/audio/mapping.ts` by `npm run mapping`. Do not edit by hand.',
    'Every sound traces to a data value. Transport: 72 bpm, key D (settings change tempo and key), 4-bar loop, one chord per bar.',
    'Spans read "at layer minimum → at layer maximum" of the window mean.',
    '',
    '## Layers',
    '',
    '| Key | Layer | Range | Scale | Voice | Role | MIDI register | High-pass Hz | Low-pass Hz | Resonance Q | Texture dB | Dangerous when | Meaning |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...VOICES.map((v) => {
      const l = name(v.layer)!;
      const tex = v.texture ? `${v.texture.sample} ${hz(v.texture.db)}` : '';
      const dz = v.danger.from > v.danger.to ? `low (t ${v.danger.from} → ${v.danger.to})` : `high (t ${v.danger.from} → ${v.danger.to})`;
      return `| ${v.key} | ${l.name} | ${l.min} to ${l.max} ${l.unit} | ${l.scale} | ${v.instrument} | ${v.role} | ${v.register[0]}-${v.register[1]} | ${hz(v.timbre.hp)} | ${hz(v.timbre.lp)} | ${hz(v.timbre.q)} | ${tex} | ${dz}: ${v.danger.what} | ${v.hear} |`;
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
