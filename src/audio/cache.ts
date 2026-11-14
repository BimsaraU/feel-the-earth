import * as Tone from 'tone';

/** Bump when files under public/audio change, so browsers drop the old copies. */
const CACHE = 'fte-audio-v1';

/**
 * Load an audio file into a Tone buffer through the browser's Cache Storage: the first visit downloads it, every
 * later visit (and offline) decodes it straight from the cache. Falls back to the network where Cache Storage is
 * missing (insecure origins, some webviews).
 */
export async function loadBuffer(url: string): Promise<Tone.ToneAudioBuffer> {
  const abs = new URL(url, location.href).href;
  let res: Response | undefined;
  try {
    const cache = await caches.open(CACHE);
    res = await cache.match(abs);
    if (!res) {
      res = await fetch(abs);
      if (res.ok) await cache.put(abs, res.clone());
    }
  } catch {
    res = await fetch(abs);
  }
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Tone.ToneAudioBuffer(await Tone.getContext().decodeAudioData(await res.arrayBuffer()));
}

/** Drop audio caches from older versions. */
export function pruneAudioCaches() {
  if (typeof caches === 'undefined') return;
  void caches.keys().then((ks) => ks.filter((k) => k.startsWith('fte-audio-') && k !== CACHE).forEach((k) => caches.delete(k)));
}
