import * as Tone from 'tone';
import { engine } from '../audio/engine';
import { useApp, type JodiState } from '../state';
import { personaOf } from './voices';

let flip = false;
let last = '';
/** The last thing said, for "repeat". */
export const lastSaid = () => last;

/** Mirror text to the aria-live region. Alternating a zero-width space makes repeats announce again. */
export function announce(text: string) {
  flip = !flip;
  useApp.getState().set({ live: text + (flip ? '​' : '') });
}

// ---------- neural voice (Groq Orpheus through /api/tts), browser voice as fallback ----------

/** Orpheus takes at most 200 characters: split at sentence ends, then commas, then spaces. */
export function chunks(text: string, max = 200): string[] {
  const out: string[] = [];
  for (const sentence of text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]) {
    let s = sentence.trim();
    while (s.length > max) {
      const cut = Math.max(s.lastIndexOf(', ', max), s.lastIndexOf(' ', max));
      const at = cut > max / 3 ? cut + 1 : max;
      out.push(s.slice(0, at).trim());
      s = s.slice(at).trim();
    }
    const prev = out[out.length - 1];
    if (prev && prev.length + 1 + s.length <= max) out[out.length - 1] = `${prev} ${s}`; // fewer, longer requests
    else if (s) out.push(s);
  }
  return out;
}

const voiceCache = new Map<string, Promise<Tone.ToneAudioBuffer>>();
/** After a failure (no key, rate limit, offline) use the browser voice for a while. */
let neuralOffUntil = 0;

function neural(text: string): Promise<Tone.ToneAudioBuffer> {
  const voice = useApp.getState().settings.ttsVoice, key = voice + text;
  let p = voiceCache.get(key);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice }) })
      .then(async (r) => {
        if (!r.ok) throw new Error(`tts ${r.status}`);
        return new Tone.ToneAudioBuffer(await Tone.getContext().decodeAudioData(await r.arrayBuffer()));
      });
    p.catch(() => { voiceCache.delete(key); neuralOffUntil = performance.now() + 60_000; });
    if (voiceCache.size > 300) voiceCache.delete(voiceCache.keys().next().value!);
    voiceCache.set(key, p);
  }
  return p;
}

const timeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('slow')), ms))]);

let gen = 0;
/** Bumps whenever speech is interrupted; long narrations check it to know they were cut short. */
export const speechGen = () => gen;
let queue: Promise<void> = Promise.resolve();

/** Speak and mirror to the aria-live region. Resolves when speech ends (or right away without a voice). */
export function say(text: string, interrupt = true): Promise<void> {
  last = text;
  announce(text);
  const { settings } = useApp.getState();
  const hasSynth = typeof speechSynthesis !== 'undefined';
  if (!settings.voice) return new Promise((r) => setTimeout(r, 400 + text.length * 25));
  if (interrupt) { gen++; engine.stopClip(); if (hasSynth) speechSynthesis.cancel(); queue = Promise.resolve(); }
  const my = gen;
  const parts = chunks(text);
  const useNeural = engine.ready && navigator.onLine && performance.now() > neuralOffUntil;
  const bufs = useNeural ? parts.map((t) => neural(t)) : []; // all requests start now, play in order
  const jodi = (s: JodiState) => { if (my === gen) useApp.getState().set({ jodi: s }); };
  const run = async () => {
    jodi('speaking');
    try { await speak(); } finally { jodi('idle'); }
  };
  const speak = async () => {
    for (let i = 0; i < parts.length; i++) {
      if (my !== gen) return;
      if (useNeural && performance.now() > neuralOffUntil) {
        try {
          // The first part has to arrive quickly or the browser voice takes over; later ones load while it plays.
          const b = await timeout(bufs[i], i === 0 ? 2500 : 8000);
          if (my !== gen) return;
          await engine.playVoice(b);
          continue;
        } catch { /* fall through to the browser voice */ }
      }
      if (my !== gen) return;
      if (hasSynth) await browserSay(parts[i], settings.speechRate);
    }
  };
  queue = queue.then(run);
  return queue;
}

function browserSay(text: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.lang = 'en-GB';
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      engine.duckSpeech(false); // the next utterance's onstart ducks again
      resolve();
    };
    u.onstart = () => engine.duckSpeech(true);
    u.onend = end;
    u.onerror = end;
    // Some engines never fire onend (or never start without voices); do not hang the caller.
    setTimeout(end, 1500 + text.length * 90);
    speechSynthesis.speak(u);
  });
}

export function stopSpeech() {
  gen++;
  queue = Promise.resolve();
  engine.stopClip();
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  engine.duckSpeech(false);
  useApp.getState().set({ jodi: 'idle' });
}

// ---------- conversation (Groq chat through /api/chat) ----------

/** Ask the assistant a free question about the place, data or app. Resolves to its answer, or null if unavailable. */
export async function converse(question: string, context: string): Promise<string | null> {
  if (!navigator.onLine) return null;
  try {
    const r = await timeout(fetch(`${import.meta.env.BASE_URL}api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, context, name: personaOf(useApp.getState().settings.ttsVoice) }),
    }), 8000);
    if (!r.ok) return null;
    const { answer } = (await r.json()) as { answer?: string };
    return answer || null;
  } catch {
    return null;
  }
}
