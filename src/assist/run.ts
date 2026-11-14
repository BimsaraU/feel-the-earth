import * as Tone from 'tone';
import { VOICES, voiceFor } from '../audio/mapping';
import {
  askBeacons, askWhat, askWhere, geo, moveBy, resize, setCenter, setSize, setTravelling, showLayer, stepDate, togglePlay, toggleVoice,
} from '../controller';
import { MAX_SIZE, MIN_SIZE, useApp } from '../state';
import { resetZoom, zoomBy } from '../ui/Globe';
import { HELP_TEXT, matchPlace, parseAlternatives, type Command } from './commands';
import { lastSaid, say } from './speech';
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
    case 'beacons': askBeacons(); break;
    case 'tour': void runTutorial(); break;
    case 'travel': setTravelling(c.on); break;
    case 'repeat': void say(lastSaid() || 'Nothing to repeat yet.'); break;
    case 'help': void say(HELP_TEXT); break;
    case 'ambiguous': void say(c.question); break;
    case 'unknown': void say(heard ? `Sorry, I did not catch "${heard}". Say help for the commands.` : 'Say help for the commands.'); break;
  }
}

/** A typed or spoken phrase, end to end. */
export function runText(text: string) {
  const { command, heard } = parseAlternatives([text]);
  runCommand(command, heard);
}

type Recognition = {
  lang: string; maxAlternatives: number;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onend: () => void; onerror: () => void; start(): void; stop(): void;
};
const Rec = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
export const canListen = !!Rec;

let rec: Recognition | null = null;

/** Start listening for one command; calls onState(false) when the recognizer stops. Returns stop. */
export function listen(onState: (on: boolean) => void = () => {}): () => void {
  if (!Rec) { void say('Speech recognition is not available in this browser. Type the command in the assistant instead.'); return () => {}; }
  rec?.stop();
  const r = new Rec();
  r.lang = 'en-GB';
  r.maxAlternatives = 3;
  r.onresult = (e) => {
    const alts = Array.from(e.results[0] ?? [], (a) => a.transcript);
    const { command, heard } = parseAlternatives(alts);
    runCommand(command, heard);
  };
  r.onend = r.onerror = () => { if (rec === r) rec = null; onState(false); };
  r.start();
  rec = r;
  onState(true);
  return () => r.stop();
}

/** K key: start listening, or stop if already listening. */
export function toggleListening() {
  if (rec) rec.stop(); else listen();
}
