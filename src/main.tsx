import '@fontsource-variable/fraunces';
import '@fontsource-variable/outfit';
import { gsap } from 'gsap';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import './ui/style.css';

// Reduced motion: every GSAP animation finishes almost at once.
if (matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.globalTimeline.timeScale(50);

registerSW({ immediate: true });
createRoot(document.getElementById('root')!).render(<App />);
