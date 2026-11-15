// Record the start line, welcome and tours in every assistant voice, via Fish Audio:
//   src/assist/narration.json -> public/audio/narration/<voice name>/<id>.mp3   (voices: src/assist/voices.ts)
// Gojo's recordings name the assistant Gojo. Existing files are kept unless --force.
// Key: FISH_AUDIO_API_KEY (or FAUDIO) in the environment or .env.
// Usage: node --experimental-strip-types scripts/build_narration.mjs [--force] [--voice sarah] [id ...]
// After re-recording, bump CACHE in src/audio/cache.ts so browsers drop the old clips.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { asPersona, VOICES_TTS } from '../src/assist/voices.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'narration');

const dotenv = (() => {
  try {
    return Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
  } catch { return {}; }
})();
const env = (k) => process.env[k] ?? dotenv[k];
const key = env('FISH_AUDIO_API_KEY') ?? env('FAUDIO');
if (!key) throw new Error('Set FISH_AUDIO_API_KEY (or FAUDIO) in the environment or .env');

const args = process.argv.slice(2);
const force = args.includes('--force');
const vi = args.indexOf('--voice');
const onlyVoice = vi >= 0 ? args[vi + 1] : null;
const ids = args.filter((a, i) => !a.startsWith('--') && !(vi >= 0 && i === vi + 1));
const lines = JSON.parse(readFileSync(join(ROOT, 'src', 'assist', 'narration.json'), 'utf8'))
  .filter((l) => !ids.length || ids.includes(l.id));

const jobs = [];
for (const v of VOICES_TTS) {
  const folder = v.name.toLowerCase();
  if (onlyVoice && folder !== onlyVoice.toLowerCase()) continue;
  mkdirSync(join(OUT, folder), { recursive: true });
  for (const l of lines) {
    const file = join(OUT, folder, `${l.id}.mp3`);
    if (force || !existsSync(file)) jobs.push({ file, voice: v.id, label: `${folder}/${l.id}`, text: asPersona(l.text, v.persona) });
  }
}

async function record({ file, voice, label, text }) {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', model: env('FISH_MODEL') ?? 's2.1-pro' },
      // Offline recording: best quality, not lowest latency. 64 kbit/s mono speech keeps five voices small.
      body: JSON.stringify({ text, reference_id: voice, format: 'mp3', mp3_bitrate: 64, latency: 'normal', language: 'en' }),
    });
    if (r.ok) { writeFileSync(file, Buffer.from(await r.arrayBuffer())); console.log('recorded', label); return; }
    const msg = `${label}: ${r.status} ${(await r.text()).slice(0, 200)}`;
    if (attempt >= 3 || r.status < 500 && r.status !== 429) throw new Error(msg);
    console.warn('retrying', msg);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}

console.log(`${jobs.length} clips to record`);
// Three at a time: quick, and kind to the rate limit.
await Promise.all([0, 1, 2].map(async () => { while (jobs.length) await record(jobs.shift()); }));
