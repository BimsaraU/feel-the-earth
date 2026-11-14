// The one machine-readable mapping table. docs/MAPPING.md is generated from this file
// (npm run mapping) and the assist answers read their wording from here.

import type { LayerId, LayerInfo } from '../data/types';

export type Instrument = 'cello' | 'harp' | 'clarinet' | 'glock' | 'piano' | 'cellotrem';

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
  { layer: 'sst', key: 1, instrument: 'cello', instrumentSpoken: 'the cello section', role: 'melody', register: [45, 69],
    timbre: { hp: [240, 60], lp: [9000, 2400], q: [0.7, 0.7] }, danger: { from: 0.86, to: 0.97, what: 'marine heat' },
    pan: -0.2, trimDb: 0, hear: 'Louder means warmer water; cold water sounds thin and icy, warm water dark and full.' },
  { layer: 'lightning', key: 2, instrument: 'glock', instrumentSpoken: 'the glockenspiel and the rain', role: 'color', register: [79, 98],
    timbre: { hp: [900, 900], lp: [7000, 12000], q: [0.7, 0.7] }, texture: { sample: 'rain', db: [-44, -16] },
    danger: { from: 0.3, to: 0.75, what: 'thunderstorms' },
    pan: 0.5, trimDb: -8, hear: 'Each bright strike is a lightning hot spot; more strikes and louder rain mean more lightning.' },
  { layer: 'lights', key: 3, instrument: 'harp', instrumentSpoken: 'the harp', role: 'arp', register: [62, 86],
    timbre: { hp: [200, 200], lp: [3500, 9000], q: [0.7, 0.7] }, danger: { from: 2, to: 3, what: 'none' },
    pan: -0.5, trimDb: -4, hear: 'More and brighter harp notes mean more night light from towns and cities.' },
  { layer: 'lightschange', key: 4, instrument: 'clarinet', instrumentSpoken: 'the clarinet', role: 'pad', register: [50, 67],
    timbre: { hp: [150, 150], lp: [1200, 5000], q: [0.7, 0.7] }, danger: { from: 2, to: 3, what: 'none' },
    pan: 0.2, trimDb: -4, hear: 'Bright and loud means new lights since 2012; dark and quiet means lights went out.' },
  // NASA GIBS monthly layers (pipeline/build_gibs.py). Instruments are reused in new roles and registers.
  { layer: 'co2', key: 5, instrument: 'cello', instrumentSpoken: 'the low cellos', role: 'bass', register: [38, 55],
    timbre: { hp: [40, 40], lp: [700, 2200], q: [0.7, 1.4] }, danger: { from: 0.7, to: 0.95, what: 'high carbon dioxide' },
    pan: 0, trimDb: -3, hear: 'A deep held bass; louder and more growling means more carbon dioxide in the air.' },
  { layer: 'airtemp', key: 6, instrument: 'clarinet', instrumentSpoken: 'the clarinet melody', role: 'melody', register: [55, 76],
    timbre: { hp: [300, 120], lp: [2500, 7000], q: [0.7, 0.7] }, danger: { from: 0.86, to: 0.97, what: 'extreme heat' },
    pan: -0.35, trimDb: -4, hear: 'Louder and brighter clarinet means warmer air near the surface.' },
  { layer: 'precip', key: 7, instrument: 'harp', instrumentSpoken: 'the harp and the rain', role: 'arp', register: [64, 88],
    timbre: { hp: [300, 300], lp: [3000, 8000], q: [0.7, 0.7] }, texture: { sample: 'rain', db: [-50, -18] },
    danger: { from: 0.7, to: 0.95, what: 'very heavy rain' },
    pan: 0.35, trimDb: -5, hear: 'More harp notes and louder rain mean more rainfall that month.' },
  { layer: 'ndvi', key: 8, instrument: 'cello', instrumentSpoken: 'the cello chords', role: 'pad', register: [50, 69],
    timbre: { hp: [200, 80], lp: [1200, 6000], q: [0.7, 0.7] }, danger: { from: 2, to: 3, what: 'none' },
    pan: -0.15, trimDb: -6, hear: 'Fuller, brighter chords mean greener, denser vegetation; thin chords mean bare ground.' },
  { layer: 'aerosol', key: 9, instrument: 'glock', instrumentSpoken: 'the muffled glockenspiel pulse', role: 'pulse', register: [72, 91],
    timbre: { hp: [600, 600], lp: [9000, 1500], q: [0.7, 0.7] }, danger: { from: 0.45, to: 0.85, what: 'hazy, polluted air' },
    pan: 0.15, trimDb: -10, hear: 'A steady pulse that gets louder and more muffled as the air gets hazier.' },
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
  { feature: 'No data', sound: 'That layer is silent on that beat (no stand-in sound).' },
  { feature: 'Direction of travel', sound: 'While the window moves the whole mix leans left or right with east-west travel and gets brighter going north, darker going south; the whoosh pans with it.' },
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
  timeStep: [8],
  accent: [10],
  test: [40, 60, 40],
  tick: [6],
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
