import { create } from 'zustand';
import type { LayerId, LayerInfo } from './data/types';

export interface Settings {
  masterVolume: number; // 0..1
  layerDb: Partial<Record<LayerId, number>>;
  speechRate: number;
  /** Built-in voice. Screen-reader users may turn it off and rely on the live region. */
  voice: boolean;
  haptics: boolean;
  hapticAccents: boolean;
  tempo: number;
  /** Navigation speed, window widths per second. */
  navSpeed: number;
  keyRoot: number; // pitch class, 2 = D
  mono: boolean;
  highContrast: boolean;
}

export interface AppState {
  started: boolean;
  loading: boolean;
  layers: LayerInfo[];
  active: LayerId[]; // order = order switched on; first is the "first active layer"
  lat: number;
  lon: number;
  size: number;
  date: string;
  playing: boolean;
  dragging: boolean;
  globeMode: boolean;
  live: string;
  /** Window mean per active layer, from the last loop regeneration. */
  means: Partial<Record<LayerId, number>>;
  settings: Settings;
  set: (p: Partial<AppState>) => void;
  setSettings: (p: Partial<Settings>) => void;
}

const SETTINGS_KEY = 'fte-settings';
const defaults: Settings = {
  masterVolume: 0.7, layerDb: {}, speechRate: 1.1, voice: true, haptics: true, hapticAccents: false,
  tempo: 72, navSpeed: 0.6, keyRoot: 2, mono: false, highContrast: false,
};

function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export const useApp = create<AppState>((set) => ({
  started: false,
  loading: false,
  layers: [],
  active: ['temperature'],
  lat: 7.9,
  lon: 80.7,
  size: 10,
  date: new Date().toISOString().slice(0, 10),
  playing: false,
  dragging: false,
  globeMode: false,
  live: '',
  means: {},
  settings: loadSettings(),
  set: (p) => set(p),
  setSettings: (p) =>
    set((s) => {
      const settings = { ...s.settings, ...p };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
      return { settings };
    }),
}));

export const MIN_SIZE = 2;
export const MAX_SIZE = 30;
export const MAX_LAT = 85;
export const MAX_LAYERS = 4;
