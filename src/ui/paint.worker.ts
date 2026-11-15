import { paintPixels } from './paint';

/** { id, layer, grid, n, box, W, H } -> { id, blob } (PNG of the painted heatmap). */
self.onmessage = async (e: MessageEvent) => {
  const { id, layer, grid, n, box, W, H } = e.data;
  let blob: Blob | null = null;
  try {
    const c = new OffscreenCanvas(W, H);
    c.getContext('2d')!.putImageData(paintPixels(layer, grid, n, box, W, H), 0, 0);
    blob = await c.convertToBlob();
  } catch (err) { console.error('paint', err); }
  postMessage({ id, blob });
};
