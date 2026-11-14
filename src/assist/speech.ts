import { engine } from '../audio/engine';
import { useApp } from '../state';

let flip = false;
let last = '';
/** The last thing said, for "repeat". */
export const lastSaid = () => last;

/** Mirror text to the aria-live region. Alternating a zero-width space makes repeats announce again. */
export function announce(text: string) {
  flip = !flip;
  useApp.getState().set({ live: text + (flip ? '​' : '') });
}

/** Speak and mirror to the aria-live region. Resolves when speech ends (or right away without TTS). */
export function say(text: string, interrupt = true): Promise<void> {
  last = text;
  announce(text);
  const { settings } = useApp.getState();
  const synth = typeof speechSynthesis === 'undefined' || !settings.voice ? null : speechSynthesis;
  if (!synth) return new Promise((r) => setTimeout(r, 400 + text.length * 25));
  if (interrupt) synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = settings.speechRate;
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
    synth.speak(u);
  });
}

export function stopSpeech() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  engine.duckSpeech(false);
}
