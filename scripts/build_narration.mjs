// Record the tours in JODI's voice: src/assist/narration.json -> public/audio/narration/<id>.mp3, via Fish Audio.
// Key: FISH_AUDIO_API_KEY (or FAUDIO) in the environment or .env. Voice: the default in src/assist/voices.ts (FISH_VOICE overrides).
// Usage: node scripts/build_narration.mjs [id ...]   (no ids = every line)
// After re-recording, bump CACHE in src/audio/cache.ts so browsers drop the old clips.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'narration');
const VOICE = 'e107ce68d2a64e928c3a674781ce9d56'; // Upbeat: DEFAULT_VOICE in src/assist/voices.ts

const dotenv = (() => {
  try {
    return Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  } catch { return {}; }
})();
const env = (k) => process.env[k] ?? dotenv[k];
const key = env('FISH_AUDIO_API_KEY') ?? env('FAUDIO');
if (!key) throw new Error('Set FISH_AUDIO_API_KEY (or FAUDIO) in the environment or .env');

const only = process.argv.slice(2);
const lines = JSON.parse(readFileSync(join(ROOT, 'src', 'assist', 'narration.json'), 'utf8'))
  .filter((l) => !only.length || only.includes(l.id));
mkdirSync(OUT, { recursive: true });

async function record({ id, text }) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', model: env('FISH_MODEL') ?? 's2.1-pro' },
      // Offline recording: best quality, not lowest latency.
      body: JSON.stringify({ text, reference_id: env('FISH_VOICE') ?? VOICE, format: 'mp3', mp3_bitrate: 128, latency: 'normal', language: 'en' }),
    });
    if (r.ok) { writeFileSync(join(OUT, `${id}.mp3`), Buffer.from(await r.arrayBuffer())); console.log('recorded', id); return; }
    const msg = `${id}: ${r.status} ${(await r.text()).slice(0, 200)}`;
    if (attempt >= 3 || r.status < 500 && r.status !== 429) throw new Error(msg);
    console.warn('retrying', msg);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}

// Three at a time: quick, and kind to the rate limit.
const queue = [...lines];
await Promise.all([0, 1, 2].map(async () => { while (queue.length) await record(queue.shift()); }));
