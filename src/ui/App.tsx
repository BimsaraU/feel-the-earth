import { useEffect } from 'react';
import { startFromGesture } from '../controller';
import { useApp } from '../state';
import { Controls } from './Controls';
import { Globe } from './Globe';
import { onKey } from './keyboard';

const START_TEXT = 'Tap or press any key to begin. Headphones recommended.';

function StartScreen() {
  const loading = useApp((s) => s.loading);
  useEffect(() => {
    // Best effort: most browsers only allow speech after a gesture, so the text is also on screen and focused.
    try { speechSynthesis.speak(new SpeechSynthesisUtterance(START_TEXT)); } catch { /* no TTS */ }
    const key = (e: KeyboardEvent) => { e.preventDefault(); startFromGesture(); };
    window.addEventListener('keydown', key, { once: true });
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <button type="button" className="start" autoFocus onPointerDown={startFromGesture} onClick={startFromGesture}>
      <span className="title">Feel the Earth</span>
      <span>{loading ? 'Loading sounds…' : START_TEXT}</span>
    </button>
  );
}

export function App() {
  const started = useApp((s) => s.started);
  useEffect(() => {
    if (!started) return;
    window.addEventListener('keydown', onKey);
    const noZoom = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', noZoom); // iOS Safari pinch-zoom
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('gesturestart', noZoom); };
  }, [started]);

  if (!started) return <StartScreen />;
  return (
    <main className="app">
      <Globe />
      <Controls />
    </main>
  );
}
