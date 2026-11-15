// Tours, spoken by JODI: the welcome at start, the listening tour (T: every sound, what it means and why it sounds that
// way) and the assistant tour (Shift+T or "help": how to talk to JODI).
// Narration is pre-recorded with JODI's Fish Audio voice (scripts/build_narration.mjs, text in narration.json);
// without the clips, or with the voice guide off, it falls back to the browser voice / captions.
// Each demo also fires the visuals (src/fx.ts) so sound, picture and words line up.

import { engine } from '../audio/engine';
import { constantWindow, type Step } from '../audio/loop';
import { scaleNotes, VOICES } from '../audio/mapping';
import { playEvent } from '../controller';
import type { LayerId } from '../data/types';
import { fx } from '../fx';
import { useApp } from '../state';
import NARRATION from './narration.json';
import { announce, say, speechGen, stopSpeech } from './speech';

let runId = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const st = () => useApp.getState();
const CLIP = (id: string) => `${import.meta.env.BASE_URL}audio/narration/${id}.mp3`;

/** Back to what the listener had: the loop plays if they had it playing. */
function resumeLoop() {
  if (st().playing) engine.startLoop(); else engine.pauseLoop();
}

export function stopTutorial() {
  runId++;
  engine.stopClip();
  stopSpeech();
  if (st().tour) { st().set({ tour: null }); restoreAll(); resumeLoop(); }
}

/** Skip the rest of the current narration; the tour moves on. */
export function skipNarration() {
  engine.stopClip();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

type Tour = 'listening' | 'assistant';
type Segment = (typeof NARRATION)[number] & { tour?: string };
const segments = (tour: Tour | 'welcome') => (NARRATION as Segment[]).filter((s) => (s.tour ?? 'listening') === tour);

async function narrate(id: string, i: number, n: number) {
  const seg = NARRATION.find((x) => x.id === id)!;
  st().set({ tour: { i, n, title: seg.title, text: seg.text } });
  if (!st().settings.voice) return say(seg.text); // captions only, timed to reading speed
  announce(seg.text);
  try { await engine.playClip(CLIP(id)); } catch { await say(seg.text); }
}

/** One layer's sound at a constant value t, with its full character. Resolves when it has played. */
function demoLayer(layer: LayerId, t: number, beats = 4) {
  const info = st().layers.find((l) => l.id === layer);
  const voice = engine.voices.get(layer);
  if (!info || !voice) return 0;
  fx.emit({ kind: 'demo', layer, t });
  return voice.demo(constantWindow(info, t), info, engine.stepSeconds() * 0.75, beats);
}

const restoreAll = () => engine.voices.forEach((v) => v.restore());

/** What each segment plays once its narration ends; resolves when it has finished sounding. */
const ACTIONS: Record<string, () => Promise<void> | void> = {
  scan: async () => {
    if (!engine.playing) engine.startLoop();
    await wait(engine.stepSeconds() * 8 * 1000); // two bars of the real thing
    engine.pauseLoop();
  },
  pitch: async () => {
    const v = VOICES.find((x) => x.layer === 'sst')!;
    const notes = scaleNotes(engine.keyRoot, v.register[0], v.register[1], [0, 4, 7]).filter((_, k) => k % 2 === 0).slice(0, 6);
    const steps: Step[] = notes.map((midi) => ({ notes: [{ midi, offset: 0, dur: 1, vel: 0.6 }], noData: false, accent: false, value: 0.6 }));
    const sec = engine.voices.get('sst')?.playSteps(steps, 0.5) ?? 0;
    await wait(sec * 1000 + 800);
    restoreAll();
  },
  loud: async () => {
    for (const t of [0.1, 0.5, 0.9]) await wait(demoLayer('sst', t, 2) * 1000 + 250);
    restoreAll();
  },
  sst: () => lowHigh('sst', 0.08, 0.92),
  lightning: () => lowHigh('lightning', 0.1, 0.9),
  lights: () => lowHigh('lights', 0.08, 0.9),
  lightschange: () => lowHigh('lightschange', 0.1, 0.9),
  harmony: async () => {
    const secs = VOICES.slice(0, 4).map((v) => demoLayer(v.layer, 0.65, 8));
    await wait(Math.max(0, ...secs) * 1000 + 800);
    restoreAll();
  },
  severity: async () => {
    const was = engine.severity;
    engine.severity = 0.95; // the screen edges glow with it
    await wait(engine.demoSeverity() * 1000);
    engine.severity = was;
  },
  border: async () => { playEvent({ type: 'border', from: '', to: '' }); await wait(1200); },
  coast: async () => {
    playEvent({ type: 'coast', to: 'sea', name: '' }); await wait(1800);
    playEvent({ type: 'coast', to: 'land', name: '' }); await wait(1200);
  },
  equator: async () => { playEvent({ type: 'line', line: 'equator' }); await wait(2600); },
  tropic: async () => {
    playEvent({ type: 'line', line: 'tropicOfCancer' }); await wait(2200);
    playEvent({ type: 'line', line: 'primeMeridian' }); await wait(2200);
  },
  antimeridian: async () => { playEvent({ type: 'line', line: 'antimeridian' }); await wait(2600); },
  beacons: async () => { engine.play('smallbell', { rate: 1.5, db: -12 }); await wait(1400); }, // arrival bell
  'a-peak': async () => { engine.play('smallbell', { rate: 1.5, db: -12 }); await wait(1400); },
  time: async () => {
    engine.play('ratchet', { db: -4 }); fx.emit({ kind: 'time', big: false }); await wait(1200);
    engine.play('windchime', { db: -6 }); fx.emit({ kind: 'time', big: true }); await wait(1800);
  },
};

async function lowHigh(layer: LayerId, lo: number, hi: number) {
  await wait(demoLayer(layer, lo) * 1000 + 500);
  await wait(demoLayer(layer, hi) * 1000 + 700);
  restoreAll();
}

/** T: the listening tour; Shift+T / "help": the assistant tour. */
export async function runTutorial(tour: Tour = 'listening') {
  stopTutorial();
  const id = ++runId;
  const live = () => id === runId;
  const t0 = performance.now();
  const list = segments(tour);
  for (const [i, seg] of list.entries()) {
    if (!live()) break;
    if (seg.id === 'pitch') engine.pauseLoop(); // demos play on their own from here
    await narrate(seg.id, i, list.length);
    if (!live()) break;
    await ACTIONS[seg.id]?.();
  }
  if (!live()) return; // stopTutorial already restored everything
  st().set({ tour: null });
  console.info(`Tour took ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  resumeLoop();
}

/** Spoken welcome at start: JODI introduces the app, names the place, and points to the tours. Escape or any new
 *  speech cuts it short. The place is live speech between the two recorded parts. */
export async function welcome(place: string, prefix = '') {
  const id = ++runId;
  if (prefix) await say(prefix);
  const g = speechGen(); // anything else said with interruption (W, H, a command) ends the welcome
  const live = () => id === runId && speechGen() === g;
  const [a, b] = segments('welcome');
  for (const [seg, after] of [[a, `You are now listening to ${place}.`], [b, '']] as const) {
    if (!live()) return;
    if (!st().settings.voice) { await say(seg.text); } else { announce(seg.text); try { await engine.playClip(CLIP(seg.id)); } catch { await say(seg.text); } }
    if (after && live()) await say(after, false);
  }
}