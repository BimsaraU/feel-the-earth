import { create } from 'zustand';
import type { BBox, LayerId, LayerInfo } from './data/types';

export interface Settings {
  masterVolume: number; // 0..1
  layerDb: Partial<Record<LayerId, number>>;
  speechRate: number;
  /** Built-in voice. Screen-reader users may turn it off and rely on the live region. */
  voice: boolean;
  haptics: boolean;
  hapticAccents: boolean;
  /** Navigation speed, window widths per second. */
  navSpeed: number;
  keyRoot: number; // pitch class, 2 = D
  mono: boolean;
  highContrast: boolean;
  /** Surround field: data around the window as 3D (HRTF) sources with doppler while moving. */
  spatial: boolean;
}

/** The data map around the window, HALO times its size, sampled for every active layer. Feeds the 3D view and the surround field. */
export interface Halo { box: BBox; n: number; lat: number; lon: number; size: number; grids: Partial<Record<LayerId, Float32Array>> }
export const HALO = 2.5;

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
  /** Time travel: the date advances one step per bar while the loop plays. */
  travelling: boolean;
  live: string;
  /** Listening tour in progress: segment index, count, title and the words being spoken. */
  tour: { i: number; n: number; title: string; text: string } | null;
  /** Window mean per active layer, from the last loop regeneration. */
  means: Partial<Record<LayerId, number>>;
  halo: Halo | null;
  settings: Settings;
  set: (p: Partial<AppState>) => void;
  setSettings: (p: Partial<Settings>) => void;
}

const SETTINGS_KEY = 'fte-settings';
const defaults: Settings = {
  masterVolume: 0.7, layerDb: {}, speechRate: 1.1, voice: true, haptics: true, hapticAccents: false,
  navSpeed: 0.6, keyRoot: 2, mono: false, highContrast: false, spatial: true,
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
  active: ['sst'],
  lat: 7.9,
  lon: 80.7,
  size: 10,
  date: '2007-11-14', // inside the sea surface temperature record (2007-03-25 .. 2008-03-03)
  playing: false,
  dragging: false,
  globeMode: false,
  travelling: false,
  live: '',
  tour: null,
  means: {},
  halo: null,
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
