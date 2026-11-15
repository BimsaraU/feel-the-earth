import * as Tone from 'tone';
import { VOICES, voiceFor } from '../audio/mapping';
import {
  askBeacons, askWhat, askWhere, dateBounds, geo, moveBy, resize, setCenter, setDate, setSize, setTravelling, showLayer, stepDate, toggleLayer, togglePlay, toggleVoice,
} from '../controller';
import { MAX_SIZE, MIN_SIZE, useApp } from '../state';
import { resetZoom, zoomBy } from '../ui/Globe';
import { HELP_TEXT, matchPlace, parseAlternatives, WAKE, type Command } from './commands';
import { announce, capture, converse, lastSaid, say, stopSpeech, type ChatMsg } from './speech';
import type { LayerId } from '../data/types';
import { LAYER_IDS } from './tools';
import { engine } from '../audio/engine';
import { placeName, spokenDate, spokenNumber } from './answers';
import { runTutorial } from './tutorial';

const BPM = 72;
const st = () => useApp.getState();

/** Turn one command into the same actions the keyboard and buttons use. */
export function runCommand(c: Command, heard = '') {
  const s = st();
  switch (c.kind) {
    case 'play': case 'resume': if (!s.playing) togglePlay(); else void say('Already playing.'); break;
    case 'pause': if (s.playing) togglePlay(); else void say('Already paused.'); break;
    case 'layer': showLayer(c.id); break;
    case 'layerStep': {
      const order = VOICES.map((v) => v.layer).filter((id) => s.layers.some((l) => l.id === id));
      const top = s.active[s.active.length - 1];
      const i = top ? order.indexOf(top) : -1;
      showLayer(order[(i + c.step + order.length) % order.length]);
      break;
    }
    case 'move': {
      const d = s.size * c.steps;
      const [dLat, dLon] = { north: [d, 0], south: [-d, 0], east: [0, d], west: [0, -d] }[c.dir];
      moveBy(dLat, dLon);
      break;
    }
    case 'goto': {
      if (!geo) { void say('The map is still loading.'); break; }
      const name = matchPlace(c.place, [...geo.meta.countries, ...geo.meta.seas]);
      const at = name ? geo.centreOf(name) : null;
      if (!name || !at) { void ask(heard || `go to ${c.place}`); break; } // a city, reef or mountain: the assistant knows where
      void say(`Going to ${name}.`);
      setCenter(at.lat, at.lon, true);
      break;
    }
    case 'frame': c.unit === 'year' ? stepDate(0, 12 * c.step) : c.unit === 'month' ? stepDate(0, c.step) : stepDate(c.step); break;
    case 'window': resize(c.step); break;
    case 'tool':
      if (c.tool === 'point') setSize(MIN_SIZE, true);
      else if (c.tool === 'box') void say(`The listening window is a box, ${Math.round(s.size)} degrees wide. Say wider or narrower to change it.`);
      else void say('Rows and columns are not in this app. The scan line sweeps the window west to east, so you hear one column at a time.');
      break;
    case 'wholeMap': setSize(MAX_SIZE, true); break;
    case 'run': void askWhat(); break;
    case 'zoom': if (c.step === 0) resetZoom(); else zoomBy(c.step); break;
    case 'volume': {
      const v = Math.round(Math.min(1, Math.max(0, s.settings.masterVolume + 0.1 * c.step)) * 100) / 100;
      s.setSettings({ masterVolume: v });
      void say(`Volume ${Math.round(v * 100)} percent.`);
      break;
    }
    case 'speed': {
      const bpm = c.step === 0 ? BPM : Math.min(120, Math.max(40, Tone.getTransport().bpm.value + 12 * c.step));
      Tone.getTransport().bpm.rampTo(bpm, 0.5);
      void say(c.step === 0 ? 'Normal speed.' : `${c.step > 0 ? 'Faster' : 'Slower'}, ${bpm} beats a minute.`);
      break;
    }
    case 'legend': {
      const parts = s.active.map((id) => `${s.layers.find((l) => l.id === id)?.name ?? id} is the ${voiceFor(id).instrumentSpoken}`);
      void say(parts.length
        ? `${parts.join('. ')}. Higher values play higher notes. The scan line sweeps west to east once per loop.`
        : 'No layer is playing. Say a layer name, like ocean.');
      break;
    }
    case 'describe': if (c.on !== s.settings.voice) toggleVoice(); else void say(`Voice guide is already ${c.on ? 'on' : 'off'}.`); break;
    case 'theme': if (c.dark) void say('The app is always in night mode.'); else void say('There is no day mode. For stronger contrast, turn on High contrast in Settings.'); break;
    case 'explore': void say(c.on ? 'You are always exploring here: turn the globe or say north, south, east or west.' : 'Say pause to stop the music.'); break;
    case 'where': askWhere(); break;
    case 'what': void askWhat(); break;
    case 'beacons': askBeacons(c.which); break;
    case 'tour': void runTutorial(c.which); break;
    case 'travel': setTravelling(c.on); break;
    case 'repeat': void say(lastSaid() || 'Nothing to repeat yet.'); break;
    case 'help': void say(HELP_TEXT); break;
    case 'ambiguous': void say(c.question); break;
    case 'unknown': void ask(heard); break;
  }
}

/** Everything the assistant may know about the moment: place, date, window and each layer's value. */
function context(): string {
  const s = st();
  const layers = s.active.map((id) => {
    const l = s.layers.find((x) => x.id === id);
    const m = s.means[id];
    const f = s.frames[id];
    return l ? `${l.name} [${id}] (${voiceFor(id).instrumentSpoken}): ${m === undefined ? 'not read yet' : Number.isNaN(m) ? 'no data here' : `${spokenNumber(m)} ${l.unitSpoken}`}`
      + `, scale ${l.min} to ${l.max}${f && f !== s.date ? `, nearest record ${spokenDate(f)}` : ''}${id === s.active[s.active.length - 1] ? `. Source: ${l.sourceText}` : ''}` : id;
  });
  return [
    `Place: ${geo ? placeName(geo, s.lat, s.lon) : 'unknown'} (${s.lat.toFixed(1)}, ${s.lon.toFixed(1)}), window ${Math.round(s.size)} degrees wide.`,
    `Date: ${spokenDate(s.date)} (${s.date}); data from ${dateBounds()[0]} to ${dateBounds()[1]}. Music ${s.playing ? 'playing' : 'paused'}${s.travelling ? ', time travelling' : ''}. Volume ${Math.round(s.settings.masterVolume * 100)} percent, tempo ${Math.round(Tone.getTransport().bpm.value)}. The mapped layer is the last one playing.`,
    `Layers playing: ${layers.join(' | ') || 'none'}.`,
    `Other layers: ${s.layers.filter((l) => !s.active.includes(l.id)).map((l) => `${l.name} [${l.id}]`).join(', ')}.`,
    'Higher values play higher notes; the scan line sweeps the window west to east once per loop; danger adds a tremolo drone and heartbeat.',
  ].join(' ');
}

// ---------- the agent: JODI (Qwen on Groq) answers and acts through the tools in tools.ts ----------

/** What the window values depend on. */
const where = () => { const s = st(); return `${s.lat},${s.lon},${s.size},${s.date},${s.active.join()}`; };
/** Resolves when the window values next update (after a move), or after 2 s. */
const freshValues = () => new Promise<void>((resolve) => {
  const done = () => { clearTimeout(t); un(); resolve(); };
  const t = setTimeout(done, 2000), un = useApp.subscribe((s, p) => { if (s.means !== p.means) done(); });
});

/** Recent turns (listener and JODI's spoken replies), so follow-ups like "and further east?" make sense. */
let history: ChatMsg[] = [];
let turn = 0;

const num = (v: unknown, lo: number, hi: number, d: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) && v !== null ? Number(v) : d));
const here = () => (geo ? placeName(geo, st().lat, st().lon) : 'unknown');

/** Run one tool call; resolves to what happened, for the model. `after` collects actions to run once JODI has replied. */
async function runTool(name: string, a: Record<string, unknown>, after: (() => void)[]): Promise<string> {
  const s = st();
  switch (name) {
    case 'set_playing': if (!!a.playing !== s.playing) togglePlay(); return a.playing ? 'Playing.' : 'Paused.';
    case 'layer': {
      const id = a.layer as LayerId;
      if (!LAYER_IDS.includes(id) || !s.layers.some((l) => l.id === id)) return `No layer ${String(a.layer)}.`;
      const on = s.active.includes(id);
      if (a.on === false) { if (on) toggleLayer(id); return on ? `${id} off.` : `${id} was already off.`; }
      if (!on) toggleLayer(id);
      showLayer(id);
      return st().active.includes(id) ? `${id} on and on the map.` : 'Four layers is the maximum; turn one off first.';
    }
    case 'go_to_place': {
      if (!geo) return 'The map is still loading.';
      const place = String(a.place ?? ''), name = matchPlace(place, [...geo.meta.countries, ...geo.meta.seas]), at = name ? geo.centreOf(name) : null;
      if (!name || !at) return `${place} is not a country or sea I know; use set_location with its coordinates.`;
      setCenter(at.lat, at.lon, true);
      return `Now over ${name} (${at.lat.toFixed(1)}, ${at.lon.toFixed(1)}).`;
    }
    case 'set_location': {
      setCenter(num(a.lat, -85, 85, s.lat), num(a.lon, -180, 180, s.lon), true);
      return `Now at ${st().lat.toFixed(1)}, ${st().lon.toFixed(1)}, over ${here()}.`;
    }
    case 'move': {
      const d = s.size * num(a.steps, 1, 20, 1);
      const [dLat, dLon] = ({ north: [d, 0], south: [-d, 0], east: [0, d], west: [0, -d] } as Record<string, number[]>)[String(a.direction)] ?? [0, 0];
      moveBy(dLat, dLon);
      return `Moved ${String(a.direction)}; now over ${here()}.`;
    }
    case 'set_window_size': { const d = Math.round(num(a.degrees, MIN_SIZE, MAX_SIZE, s.size)); setSize(d, true); return `Window ${d} degrees.`; }
    case 'set_date': {
      const d = String(a.date ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return 'Use a real date as YYYY-MM-DD.';
      setDate(d);
      return `Date is ${spokenDate(st().date)}.`;
    }
    case 'step_date': {
      const n = Math.round(num(a.steps, -50, 50, 1));
      if (a.unit === 'year') stepDate(0, 12 * n); else if (a.unit === 'month') stepDate(0, n); else stepDate(n);
      return `Date is ${spokenDate(st().date)}.`;
    }
    case 'time_travel': setTravelling(!!a.on); return `Time travel ${a.on ? 'on' : 'off'}.`;
    case 'zoom': if (a.action === 'reset') resetZoom(); else zoomBy(a.action === 'out' ? -1 : 1); return 'Zoomed.';
    case 'set_volume': { const v = Math.round(num(a.percent, 0, 100, 70)); s.setSettings({ masterVolume: v / 100 }); return `Volume ${v} percent.`; }
    case 'set_tempo': { const b = Math.round(num(a.bpm, 40, 120, BPM)); Tone.getTransport().bpm.rampTo(b, 0.5); return `Tempo ${b} beats a minute.`; }
    case 'where_am_i': askWhere(); return '';
    case 'what_am_i_hearing': await askWhat(); return '';
    case 'find_extremes': askBeacons((a.which === 'peak' || a.which === 'valley' ? a.which : 'both')); return '';
    case 'start_tour': after.push(() => void runTutorial(a.which === 'assistant' ? 'assistant' : 'listening')); return 'The tour starts after your reply.';
    default: return `No tool ${name}.`;
  }
}

/** JODI answers, acting through tools (a few rounds at most). Resolves false when the assistant is unavailable
 *  (offline, no key) and did nothing, so the caller can fall back to the keyword command. */
async function agent(heard: string): Promise<boolean> {
  const my = ++turn;
  announce('Thinking…');
  st().set({ jodi: 'thinking' });
  const msgs: ChatMsg[] = [...history, { role: 'user', content: heard }];
  const after: (() => void)[] = [];
  let reply: string | null = null, acted = false;
  const did: string[] = [];
  for (let round = 0; round < 5 && reply === null; round++) {
    const m = await converse(msgs, context());
    if (my !== turn) return true; // a newer request took over
    if (!m) break;
    msgs.push(m);
    if (!m.tool_calls?.length) { reply = m.content ?? ''; break; }
    const before = where();
    for (const c of m.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* bad JSON: the tool falls back to defaults */ }
      // What the action would have said (e.g. "No data before 2007") goes to the model, not the speaker.
      let res = '';
      const spoken = await capture(async () => { res = await runTool(c.function.name, args, after); });
      const content = [res, spoken].filter(Boolean).join(' ') || 'Done.';
      msgs.push({ role: 'tool', tool_call_id: c.id, content });
      did.push(content);
      acted = true;
    }
    if (where() !== before) await freshValues(); // the next step should read the new place's values, not the old ones
  }
  if (my !== turn) return true;
  if (st().jodi === 'thinking') st().set({ jodi: 'idle' });
  if (reply === null && !acted) return false;
  const text = reply || did.slice(-2).join(' ') || 'Done.';
  history = [...history, { role: 'user' as const, content: heard }, { role: 'assistant' as const, content: text }].slice(-8);
  await say(text);
  after.forEach((f) => f());
  return true;
}

/** Not a plain command: a question or request for the assistant, with a fallback when it is unavailable. */
async function ask(heard: string, fallback?: Command) {
  if (!heard) { void say('Say help for the commands.'); return; }
  if (await agent(heard)) return;
  if (fallback) runCommand(fallback);
  else void say(`Sorry, I could not do "${heard}" without the internet. Say help for the commands.`);
}

/** Long or compound requests ("go to Peru and play the ocean") go to the agent first; short ones stay instant and offline. */
export const forAgent = (heard: string) => heard.trim().split(/\s+/).length >= 6 || /\b(and|then|also|after that)\b/i.test(heard);

/** A typed or spoken phrase (or the recognizer's alternatives), end to end. */
export function runText(text: string | string[]) {
  const alts = Array.isArray(text) ? text : [text];
  const { command, heard } = parseAlternatives(alts);
  const said = heard || alts[0] || '';
  if (command.kind !== 'unknown' && forAgent(said)) void ask(said, command);
  else runCommand(command, said);
}

// ---------- JODI listens: hold J (or K / the Hold button) for one request, or "Hey Jodi" in the background ----------

type Result = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type Recognition = {
  lang: string; maxAlternatives: number; continuous: boolean; interimResults: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<Result> }) => void;
  onstart: () => void; onend: () => void; onerror: (e: { error: string }) => void; start(): void; stop(): void; abort(): void;
};
const Rec = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
export const canListen = !!Rec;

let rec: Recognition | null = null;

/**
 * Listen for one request and run it when the recognizer stops. hold = keep listening through pauses until the
 * returned stop is called (press and hold J); otherwise the browser ends it after the first phrase.
 * stop(true) cancels without running anything.
 */
export function listen(onState: (on: boolean) => void = () => {}, hold = false): (cancel?: boolean) => void {
  if (!Rec) { void say('Speech recognition is not available in this browser. Type the command in the assistant instead.'); return () => {}; }
  stopWake();
  rec?.abort();
  stopSpeech(); // JODI stops talking when you start
  const r = new Rec();
  r.lang = 'en-GB';
  r.maxAlternatives = 3;
  r.continuous = hold;
  r.interimResults = false;
  let alts: string[] = [], cancelled = false;
  r.onstart = () => { if (!cancelled) engine.play('smallbell', { rate: 2, db: -20 }); }; // earcon: JODI is listening
  r.onresult = (e) => {
    const res = Array.from(e.results);
    alts = res.length === 1 ? Array.from(res[0], (a) => a.transcript) : [res.map((x) => x[0].transcript).join(' ')];
  };
  r.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') void say('The microphone is blocked. Allow it in the browser, or type in the assistant.'); };
  r.onend = () => {
    if (rec === r) rec = null;
    onState(false);
    if (st().jodi === 'listening') st().set({ jodi: 'idle' });
    if (!cancelled && alts.length) runText(alts);
    setTimeout(resumeWake, 300);
  };
  r.start();
  rec = r;
  onState(true);
  st().set({ jodi: 'listening' });
  return (cancel = false) => { cancelled = cancel; if (cancel) r.abort(); else r.stop(); };
}

/** K key: start listening, or stop if already listening. */
export function toggleListening() {
  if (rec) rec.stop(); else listen();
}


let wake: Recognition | null = null;
let wakeOn = false, wakeBlocked = false, wakeSub: (() => void) | null = null;

/** Background wake word on or off (setting "Hey Jodi"). Paused while JODI speaks (so it never wakes itself) and
 *  while a request is being heard. ponytail: browser speech recognition, so Chrome / Edge only and online. */
export function setWake(on: boolean) {
  wakeOn = on;
  wakeSub ??= useApp.subscribe((s, p) => {
    if (s.jodi === p.jodi) return;
    if (s.jodi === 'speaking') stopWake(); else if (s.jodi === 'idle') setTimeout(resumeWake, 400);
  });
  if (on) resumeWake(); else stopWake();
}

function stopWake() {
  const w = wake;
  wake = null;
  w?.abort();
}

function resumeWake() {
  if (!Rec || !wakeOn || wakeBlocked || wake || rec || st().jodi !== 'idle') return;
  const w = new Rec();
  w.lang = 'en-GB';
  w.continuous = true;
  w.interimResults = false;
  w.maxAlternatives = 1;
  w.onstart = () => {};
  w.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript, m = WAKE.exec(text);
      if (!m) continue;
      stopWake();
      const rest = text.slice(m.index + m[0].length).trim();
      if (rest.split(/\s+/).length >= 2) runText(rest); // "Hey Jodi, go to Peru" in one breath
      else listen(); // "Hey Jodi" ... then the request
      return;
    }
  };
  w.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') wakeBlocked = true; };
  w.onend = () => { if (wake === w) { wake = null; setTimeout(resumeWake, 250); } }; // browsers end it now and then
  try { w.start(); wake = w; } catch { /* already running */ }
}
