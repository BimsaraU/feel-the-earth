import { gsap } from 'gsap';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { glideStop, startFromGesture } from '../controller';
import { useApp } from '../state';
import { Controls } from './Controls';
import { Galaxy } from './Galaxy';
import { Globe } from './Globe';
import { onKey, onKeyUp } from './keyboard';

const START_TEXT = 'Tap or press any key to begin. Headphones recommended.';

function StartScreen() {
  const loading = useApp((s) => s.loading);
  const root = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!root.current) return;
    gsap.from(root.current.children, { opacity: 0, y: 24, filter: 'blur(10px)', duration: 1.4, stagger: 0.18, ease: 'power3.out' });
  }, []);
  useEffect(() => {
    // Best effort: most browsers only allow speech after a gesture, so the text is also on screen and focused.
    try { speechSynthesis.speak(new SpeechSynthesisUtterance(START_TEXT)); } catch { /* no TTS */ }
    const key = (e: KeyboardEvent) => { e.preventDefault(); startFromGesture(); };
    window.addEventListener('keydown', key, { once: true });
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <>
      <Galaxy />
      <button ref={root} type="button" className="start" autoFocus onPointerDown={startFromGesture} onClick={startFromGesture}>
        <span className="eyebrow">NASA Space Apps 2026 · Earth Information Jukebox</span>
        <span className="title">Feel the Earth</span>
        <span className="pulse">{loading ? 'Loading sounds…' : START_TEXT}</span>
      </button>
    </>
  );
}

export function App() {
  const started = useApp((s) => s.started);
  useEffect(() => {
    if (!started) return;
    const stopAll = () => (['n', 's', 'e', 'w'] as const).forEach(glideStop);
    const noZoom = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', stopAll); // never leave a glide running after focus is lost
    document.addEventListener('gesturestart', noZoom); // iOS Safari pinch-zoom
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', stopAll);
      document.removeEventListener('gesturestart', noZoom);
    };
  }, [started]);

  if (!started) return <StartScreen />;
  return (
    <main className="app">
      <Galaxy />
      <Globe />
      <Controls />
    </main>
  );
}
