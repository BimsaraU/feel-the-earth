// Audio legend: each layer alone at low, middle and high values, then each event sound. Under 60 s.

import { engine } from '../audio/engine';
import { buildPattern, constantWindow } from '../audio/loop';
import { VOICES } from '../audio/mapping';
import { playEvent } from '../controller';
import type { GeoEvent } from '../geo/events';
import { useApp } from '../state';
import { say, stopSpeech } from './speech';

let runId = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EVENTS: [string, GeoEvent | 'day' | 'month' | 'nodata'][] = [
  ['Border.', { type: 'border', from: '', to: '' }],
  ['Coast, into the sea.', { type: 'coast', to: 'sea', name: '' }],
  ['Coast, onto land.', { type: 'coast', to: 'land', name: '' }],
  ['Equator.', { type: 'line', line: 'equator' }],
  ['Tropic or polar circle.', { type: 'line', line: 'tropicOfCancer' }],
  ['Antimeridian.', { type: 'line', line: 'antimeridian' }],
  ['Pole limit.', { type: 'pole', which: 'north' }],
  ['Next day.', 'day'],
  ['Next month.', 'month'],
  ['No data.', 'nodata'],
];

export function stopTutorial() {
  runId++;
  stopSpeech();
}

export async function runTutorial() {
  const id = ++runId;
  const live = () => id === runId;
  const app = useApp.getState();
  const wasPlaying = app.playing;
  engine.pauseLoop();
  const t0 = performance.now();
  await say('Audio legend. Each layer plays low, middle, then high.');
  for (const v of VOICES) {
    if (!live()) break;
    const layer = app.layers.find((l) => l.id === v.layer)!;
    const voice = engine.voices.get(v.layer);
    await say(`${v.key}. ${layer.name}. ${v.instrumentSpoken.replace(/^the /, '')}.`);
    if (!live() || !voice) continue;
    const was = voice.enabled;
    voice.setEnabled(true);
    const stepSec = 0.55;
    [0.1, 0.5, 0.9].forEach((t, i) => {
      const step = buildPattern(constantWindow(layer, t), layer, v, engine.keyRoot).steps[0];
      voice.preview(step, engine.now() + 0.05 + i * 0.65, stepSec);
    });
    await wait(2000);
    voice.setEnabled(was);
  }
  if (live()) await say('Events.');
  for (const [label, e] of EVENTS) {
    if (!live()) break;
    await say(label);
    if (e === 'day' || e === 'month') engine.play(e === 'month' ? 'windchime' : 'ratchet');
    else if (e === 'nodata') engine.voices.get(VOICES[0].layer)?.preview({ notes: [], noData: true, accent: false, value: NaN }, engine.now(), 0.8);
    else if (e.type === 'pole') engine.play('gong', { rate: 0.7, lowpass: 500, db: 2 });
    else playEvent(e);
    await wait(typeof e === 'object' && e.type === 'line' && e.line === 'equator' ? 1600 : 1000);
  }
  if (live()) await say('Legend done. Press T to hear it again.');
  console.info(`Tutorial took ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  if (wasPlaying && live()) engine.startLoop();
}
