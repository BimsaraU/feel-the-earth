// Perceptually ordered ramp from deep teal through mint to warm sand: lightness rises monotonically,
// so order reads without hue (colour-blind safe). Always paired with numbers in the legend.
const STOPS: [number, number, number][] = [[12, 38, 52], [22, 92, 98], [62, 160, 132], [158, 226, 178], [246, 232, 178]];

export function colour(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x)), f = x - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number];
}
