import { engine } from '../audio/engine';
import { HAPTICS, type HapticPattern } from '../audio/mapping';

type Driver = 'capacitor' | 'vibrate' | 'audio' | 'none';

interface CapacitorHaptics { impact(o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void> }
declare global {
  interface Window { Capacitor?: { isNativePlatform?(): boolean; Plugins?: { Haptics?: CapacitorHaptics } } }
}

function detect(): Driver {
  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.() && cap.Plugins?.Haptics) return 'capacitor';
  // Desktop Chrome exposes navigator.vibrate but has no motor, so only trust it on Android.
  if (typeof navigator.vibrate === 'function' && /Android/i.test(navigator.userAgent)) return 'vibrate';
  // Thump stands in for a motor on touch devices (iOS Safari). With a mouse the event sounds already carry it.
  return matchMedia('(pointer: coarse)').matches ? 'audio' : 'none';
}

export const haptics = {
  enabled: true,
  driver: 'audio' as Driver,

  init() {
    this.driver = detect();
  },

  /** Fire now, at the event time; never wait for the sound to finish. */
  pulse(name: HapticPattern) {
    if (!this.enabled || this.driver === 'none') return;
    const pattern = HAPTICS[name];
    if (this.driver === 'vibrate' && navigator.vibrate(pattern)) return;
    let t = 0;
    pattern.forEach((ms, i) => {
      if (i % 2 === 0) {
        const at = t;
        if (this.driver === 'capacitor') {
          setTimeout(() => void window.Capacitor!.Plugins!.Haptics!.impact({ style: ms >= 30 ? 'MEDIUM' : 'LIGHT' }), at);
        } else {
          engine.play('thump', { at: engine.now() + at / 1000, db: ms >= 30 ? -4 : -10, rate: ms >= 30 ? 0.85 : 1.1 });
        }
      }
      t += ms;
    });
  },
};
