import { VOICES } from '../audio/mapping';
import { askWhat, askWhere, setTravelling, toggleVoice, glideStart, glideStop, resize, stepDate, toggleLayer, togglePlay } from '../controller';
import { say } from '../assist/speech';
import { runTutorial, stopTutorial } from '../assist/tutorial';
import { useApp } from '../state';
import { rotateGlobe } from './Globe';

const ARROWS: Record<string, 'n' | 's' | 'e' | 'w'> = { ArrowUp: 'n', ArrowDown: 's', ArrowRight: 'e', ArrowLeft: 'w' };

export function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return; // native controls keep their keys
  if (!useApp.getState().started || e.ctrlKey || e.metaKey || e.altKey) return;
  const activates = tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A';

  const dir = ARROWS[e.key];
  if (dir) {
    if (useApp.getState().globeMode) {
      const d = e.shiftKey ? 30 : 10;
      rotateGlobe(dir === 'n' ? d : dir === 's' ? -d : 0, dir === 'e' ? d : dir === 'w' ? -d : 0);
    } else if (!e.repeat) glideStart(dir, e.shiftKey); // held keys glide until keyup
  } else if (e.key === '+' || e.key === '=') resize(1);
  else if (e.key === '-' || e.key === '_') resize(-1);
  else if (/^Digit[1-9]$/.test(e.code)) {
    const v = VOICES.find((x) => x.key === Number(e.code.slice(5)));
    if (v) toggleLayer(v.layer); else void say('No layer on that key yet.');
  } else if (e.code === 'Comma') stepDate(e.shiftKey ? 0 : -1, e.shiftKey ? -1 : 0);
  else if (e.code === 'Period') stepDate(e.shiftKey ? 0 : 1, e.shiftKey ? 1 : 0);
  else if (e.code === 'KeyW') askWhere();
  else if (e.code === 'KeyH') void askWhat();
  else if (e.code === 'KeyT') void runTutorial();
  else if (e.code === 'KeyV') toggleVoice();
  else if (e.code === 'KeyY') setTravelling(!useApp.getState().travelling);
  else if (e.code === 'KeyM') window.dispatchEvent(new Event('fte-menu'));
  else if (e.code === 'KeyG') {
    const globeMode = !useApp.getState().globeMode;
    useApp.getState().set({ globeMode });
    void say(globeMode ? 'Arrows now turn the globe.' : 'Arrows now move the window.');
  } else if (e.code === 'Space' && !activates) togglePlay();
  else if (e.key === 'Escape') stopTutorial();
  else return;
  e.preventDefault();
}

export function onKeyUp(e: KeyboardEvent) {
  const dir = ARROWS[e.key];
  if (dir) glideStop(dir);
}
