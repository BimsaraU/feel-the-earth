import type { LayerId } from '../data/types';

// Default ramp from deep teal through mint to warm sand: lightness rises monotonically,
// so order reads without hue (colour-blind safe). Always paired with numbers in the legend.
const DEFAULT = ['#0c2634', '#165c62', '#3ea084', '#9ee2b2', '#f6e8b2'];

// Per-layer colour ranges, chosen for what the data means. Low values stay dark so they sit quietly on the night globe;
// lightness still rises with value in every sequential ramp. Night-light change is diverging around zero.
const RAMPS: Partial<Record<LayerId, string[]>> = {
  sst: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#fdae61', '#f46d43', '#d73027'], // thermal
  airtemp: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#fee090', '#fdae61', '#f46d43', '#d73027'],
  precip: ['#0b1f3a', '#1d4f86', '#2f86c2', '#52bde0', '#9be3f0', '#c9b8ff', '#9b6bff'], // dry dark to wet blue-violet
  ndvi: ['#3d2a14', '#7a5a2b', '#b59a52', '#c9d36a', '#86c45a', '#3a9e4a', '#0f6e34'], // bare brown to dense green
  aerosol: ['#14202a', '#3d4a3a', '#7d7a45', '#c2a454', '#e0864a', '#c2465e', '#8e2a7a'], // clean to smoky
  co2: ['#0d0887', '#5402a3', '#8b0aa5', '#b93289', '#db5c68', '#f48849', '#febd2a', '#f0f921'], // plasma
  lightning: ['#120f33', '#2b2a7a', '#4f5bc4', '#88a6f2', '#c9dbff', '#ffffff'], // night to flash white
  lights: ['#000004', '#2c115f', '#721f81', '#b73779', '#f1605d', '#feb078', '#fcfdbf'], // magma
  lightschange: ['#e66101', '#f5a04a', '#3a3a3a', '#a99ad6', '#5e3c99'], // lights out (orange) .. none .. new (purple)
};

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const cache = new Map<string, number[][]>();

export function colour(t: number, layer?: LayerId): [number, number, number] {
  const key = layer ?? '';
  let stops = cache.get(key);
  if (!stops) { stops = (RAMPS[layer!] ?? DEFAULT).map(rgb); cache.set(key, stops); }
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  const [a, b] = [stops[i], stops[i + 1]];
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number];
}

/** CSS gradient of a layer's colour range, for legends. */
export const rampCss = (layer?: LayerId) =>
  `linear-gradient(to right, ${[0, 0.17, 0.33, 0.5, 0.67, 0.83, 1].map((t) => `rgb(${colour(t, layer).join(',')}) ${Math.round(t * 100)}%`).join(',')})`;
