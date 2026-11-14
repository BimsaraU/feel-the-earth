import { engine } from '../audio/engine';
import { HAPTICS, type HapticPattern } from '../audio/mapping';

type Driver = 'capacitor' | 'vibrate' | 'ios-switch' | 'audio' | 'none';

interface CapacitorHaptics { impact(o: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }): Promise<void> }
declare global {
  interface Window { Capacitor?: { isNativePlatform?(): boolean; Plugins?: { Haptics?: CapacitorHaptics } } }
}

function detect(): Driver {
  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.() && cap.Plugins?.Haptics) return 'capacitor';
  // Any touch device with the Vibration API. Not a UA check: Chrome on Android tablets sends a desktop
  // user agent by default. Desktop Chrome has vibrate() but no touch points (and no motor).
  if (typeof navigator.vibrate === 'function' && navigator.maxTouchPoints > 0) return 'vibrate';
  // iPhone Safari (iOS 18+) has no Vibration API, but toggling a native switch control gives a system haptic tick.
  if (/iPhone/.test(navigator.userAgent)) return 'ios-switch';
  // Thump stands in for a motor on touch devices (iOS Safari). With a mouse the event sounds already carry it.
  return matchMedia('(pointer: coarse)').matches ? 'audio' : 'none';
}

// iOS 18+: clicking the label of an <input type=checkbox switch> plays the system haptic.
let iosLabel: HTMLLabelElement | null = null;
function iosTick() {
  if (!iosLabel) {
    iosLabel = document.createElement('label');
    iosLabel.setAttribute('aria-hidden', 'true');
    iosLabel.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    iosLabel.appendChild(input);
    document.body.appendChild(iosLabel);
  }
  iosLabel.click();
}

export const haptics = {
  enabled: true,
  driver: 'audio' as Driver,

  init() {
    this.driver = detect();
  },

  /** Human-readable driver, for the settings test button. */
  describe(): string {
    return {
      capacitor: 'native vibration',
      vibrate: 'the vibration motor',
      'ios-switch': 'iPhone system haptics',
      audio: 'a soft thump sound, because this browser cannot vibrate (iPads have no vibration motor)',
      none: 'nothing: no touch screen detected, the event sounds carry the information',
    }[this.driver];
  },

  /** Fire now, at the event time; never wait for the sound to finish. */
  pulse(name: HapticPattern) {
    if (!this.enabled || this.driver === 'none') return;
    if (name === 'tick' && this.driver === 'audio') return; // wheel detents: real haptics only, no thump stream
    const pattern = HAPTICS[name];
    if (this.driver === 'vibrate' && navigator.vibrate(pattern)) return;
    if (this.driver === 'ios-switch') {
      let t = 0;
      pattern.forEach((ms, i) => { if (i % 2 === 0) setTimeout(iosTick, t); t += ms; });
      return;
    }
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
