import * as Tone from 'tone';
import { VOICES, voiceFor } from '../audio/mapping';
import {
  askBeacons, askWhat, askWhere, geo, moveBy, resize, setCenter, setSize, setTravelling, showLayer, stepDate, togglePlay, toggleVoice,
} from '../controller';
import { MAX_SIZE, MIN_SIZE, useApp } from '../state';
import { resetZoom, zoomBy } from '../ui/Globe';
import { HELP_TEXT, matchPlace, parseAlternatives, WAKE, type Command } from './commands';
import { announce, converse, lastSaid, say, stopSpeech } from './speech';
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
      if (!name || !at) { void say(`I could not find ${c.place}.`); break; }
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
    case 'tour': void runTutorial(); break;
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
    return l ? `${l.name} (${voiceFor(id).instrumentSpoken}): ${m === undefined || Number.isNaN(m) ? 'no data here' : `${spokenNumber(m)} ${l.unitSpoken}`}`
      + `, scale ${l.min} to ${l.max}${f && f !== s.date ? `, nearest record ${spokenDate(f)}` : ''}. Source: ${l.sourceText}` : id;
  });
  return [
    `Place: ${geo ? placeName(geo, s.lat, s.lon) : 'unknown'} (${s.lat.toFixed(1)}, ${s.lon.toFixed(1)}), window ${Math.round(s.size)} degrees wide.`,
    `Date: ${spokenDate(s.date)}. Music ${s.playing ? 'playing' : 'paused'}.`,
    `Layers playing: ${layers.join(' | ') || 'none'}.`,
    `Other layers: ${s.layers.filter((l) => !s.active.includes(l.id)).map((l) => l.name).join(', ')}.`,
    'Higher values play higher notes; the scan line sweeps the window west to east once per loop; danger adds a tremolo drone and heartbeat.',
  ].join(' ');
}

/** Not a command: a question for the conversational assistant (Groq), with the plain fallback when offline. */
async function ask(heard: string) {
  if (!heard) { void say('Say help for the commands.'); return; }
  announce('Thinking…');
  st().set({ jodi: 'thinking' });
  const answer = await converse(heard, context());
  if (st().jodi === 'thinking') st().set({ jodi: 'idle' });
  void say(answer ?? `Sorry, I did not catch "${heard}". Say help for the commands.`);
}

/** A typed or spoken phrase, end to end. */
export function runText(text: string) {
  const { command, heard } = parseAlternatives([text]);
  runCommand(command, heard);
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
    if (!cancelled && alts.length) {
      const { command, heard } = parseAlternatives(alts);
      runCommand(command, heard);
    }
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
