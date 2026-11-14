// Visual effects bus: the audio engine and controller say what just sounded, the globe draws it.
// Kept free of imports so audio code does not depend on UI code.

import type { LayerId } from './data/types';
import type { LineId } from './geo/events';
import type { Step } from './audio/loop';

export type Fx =
  | { kind: 'step'; layer: LayerId; i: number; step: Step }
  | { kind: 'heartbeat'; strength: number }
  | { kind: 'line'; line: LineId; lat: number; lon: number }
  | { kind: 'border'; lat: number; lon: number }
  | { kind: 'coast'; to: 'land' | 'sea' }
  | { kind: 'pole' }
  | { kind: 'time'; big: boolean }
  /** Tutorial demo: a burst inside the window at value t (0..1). */
  | { kind: 'demo'; layer: LayerId; t: number };

type Listener = (f: Fx) => void;
const listeners = new Set<Listener>();

export const fx = {
  emit(f: Fx) { listeners.forEach((l) => l(f)); },
  on(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
};
