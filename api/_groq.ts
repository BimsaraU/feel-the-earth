// JODI's server side: Groq chat and Fish Audio speech, kept on the server so the API keys never reach the browser.
// Used by the Vercel functions in this folder and by the dev server (vite.config.ts).
// Keys: GROQ_API_KEY (or GROQ) and FISH_AUDIO_API_KEY (or FAUDIO); on Vercel, Project Settings > Environment Variables.

import { DEFAULT_VOICE, VOICES_TTS } from '../src/assist/voices';

const BASE = 'https://api.groq.com/openai/v1';
const CHAT_MODEL = 'openai/gpt-oss-120b';
const TTS_MODEL = 'canopylabs/orpheus-v1-english';
/** Orpheus English voices: autumn, diana, hannah, austin, daniel, troy. */
const VOICE = 'hannah';

const env = (k: string) => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];
const key = () => env('GROQ_API_KEY') ?? env('GROQ');

const SYSTEM = (name: string) => `You are ${name}, the friendly voice guide of Feel the Earth (you are a little Earth with a headband), an app that turns NASA Earth data into music for blind and sighted
listeners. You speak, you are not read: answer in one to three short, warm, gently playful sentences, like a curious, knowledgeable friend
beside them. No lists, no markdown, no emoji, no URLs. Spell out units ("degrees Celsius"). Use the app context you are
given (place, date, layers and their values); never invent data values. When a layer's value comes from its "nearest
record", say the year it was measured, not the app's date. If the question is about using the app, say the
spoken command that does it (for example "say go to Peru", "say next month", "press H"). If you do not know, say so briefly.`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Groq's error, logged on the server (e.g. "requires terms acceptance"), a short code to the browser. */
async function fail(r: Response) {
  console.error('groq', r.status, (await r.text()).slice(0, 300));
  return json({ error: `groq ${r.status}` }, 502);
}

/** Only this app's own pages may call (browsers always send Origin on POST). ponytail: stops other sites using the
 *  key, not scripts that forge headers; add a rate limit (e.g. Vercel KV / Upstash) if the quota is ever abused. */
function foreign(req: Request) {
  const o = req.headers.get('origin');
  return !!o && new URL(o).host !== (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host);
}

/** POST { question, context } -> { answer } */
export async function chat(req: Request): Promise<Response> {
  const k = key();
  if (!k) return json({ error: 'no key' }, 503);
  if (foreign(req)) return json({ error: 'forbidden' }, 403);
  const { question, context, name } = (await req.json().catch(() => ({}))) as { question?: string; context?: string; name?: string };
  if (!question || question.length > 500) return json({ error: 'bad question' }, 400);
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      // A reasoning model: keep the thinking short (speed) and out of the reply; the budget covers both.
      model: env('GROQ_CHAT_MODEL') ?? CHAT_MODEL, temperature: 0.6, max_completion_tokens: 700, reasoning_effort: 'low', include_reasoning: false,
      messages: [{ role: 'system', content: SYSTEM(VOICES_TTS.some((v) => v.persona === name) ? name! : 'Jodi') }, { role: 'user', content: `App context: ${String(context ?? '').slice(0, 1500)}\n\nListener: ${question}` }],
    }),
  });
  if (!r.ok) return fail(r);
  const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return json({ answer: data.choices?.[0]?.message?.content?.trim() ?? '' });
}

const fishKey = () => env('FISH_AUDIO_API_KEY') ?? env('FAUDIO');

/** POST { text, voice? } (max 200 characters; voice one of src/assist/voices.ts) -> audio. Fish Audio when its key is set (Groq's TTS rate limit is tiny),
 *  otherwise Groq Orpheus. */
export async function tts(req: Request): Promise<Response> {
  const fk = fishKey(), k = fk ?? key();
  if (!k) return json({ error: 'no key' }, 503);
  if (foreign(req)) return json({ error: 'forbidden' }, 403);
  const { text, voice } = (await req.json().catch(() => ({}))) as { text?: string; voice?: string };
  if (!text || text.length > 200) return json({ error: 'bad text' }, 400);
  // Only the app's own voices: the key must not voice arbitrary (e.g. cloned) models for others.
  const ref = VOICES_TTS.some((v) => v.id === voice) ? voice! : env('FISH_VOICE') ?? DEFAULT_VOICE;
  const r = fk
    // s2.1-pro with latency "low" measured ~1 s for a 6 s sentence.
    ? await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { authorization: `Bearer ${fk}`, 'content-type': 'application/json', model: env('FISH_MODEL') ?? 's2.1-pro' },
      body: JSON.stringify({ text, reference_id: ref, format: 'mp3', latency: 'low', language: 'en' }),
    })
    : await fetch(`${BASE}/audio/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: TTS_MODEL, voice: env('GROQ_VOICE') ?? VOICE, input: text, response_format: 'wav' }),
    });
  if (!r.ok) return fail(r);
  // Same text always gives usable audio: let the browser and CDN keep it.
  return new Response(r.body, { headers: { 'content-type': fk ? 'audio/mpeg' : 'audio/wav', 'cache-control': 'public, max-age=31536000, immutable' } });
}
