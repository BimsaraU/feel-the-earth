// JODI's server side: Groq chat and Fish Audio speech, kept on the server so the API keys never reach the browser.
// Used by the Vercel functions in this folder and by the dev server (vite.config.ts).
// Keys: GROQ_API_KEY (or GROQ) and FISH_AUDIO_API_KEY (or FAUDIO); on Vercel, Project Settings > Environment Variables.

import { TOOLS } from '../src/assist/tools';
import { DEFAULT_VOICE, VOICES_TTS } from '../src/assist/voices';

const BASE = 'https://api.groq.com/openai/v1';
/** Qwen on Groq: fast tool calling (~0.4 s a step). When its rate limit is hit (the free tier allows ~8,000 tokens a
 *  minute per model) the next model takes over; each model has its own allowance. */
const CHAT_MODELS: Record<string, object> = {
  'qwen/qwen3.8-27b': { reasoning_effort: 'none', reasoning_format: 'hidden' },
  'openai/gpt-oss-120b': { reasoning_effort: 'low', include_reasoning: false },
};
const TTS_MODEL = 'canopylabs/orpheus-v1-english';
/** Orpheus English voices: autumn, diana, hannah, austin, daniel, troy. */
const VOICE = 'hannah';

const env = (k: string) => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];
const key = () => env('GROQ_API_KEY') ?? env('GROQ');

const SYSTEM = (name: string) => `You are ${name}, the friendly voice guide of Feel the Earth (you are a little Earth with a headband), an app that turns NASA Earth data into music for blind and sighted
listeners. You can act in the app with your tools: when the listener asks for something the tools can do, do it (several
tools in one turn is fine, e.g. go somewhere, switch a layer on and play), then confirm briefly what you did. Use
set_location with coordinates for any place you know that go_to_place does not find. Tool results tell you what
happened; trust them over your guesses. Read values with what_am_i_hearing or the app context; never invent data values.
You speak, you are not read: reply in one to three short, warm, gently playful sentences, like a curious, knowledgeable
friend beside them. No lists, no markdown, no emoji, no URLs. Spell out units ("degrees Celsius"). When a layer's value
comes from its "nearest record", say the year it was measured, not the app's date. If you do not know, say so briefly.`;

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

type Msg = { role: 'user' | 'assistant' | 'tool'; content?: string | null; tool_calls?: unknown[]; tool_call_id?: string };

/** Only conversation turns the browser may send: no system prompts, bounded size. */
function clean(m: unknown): Msg | null {
  const { role, content, tool_calls, tool_call_id } = (m ?? {}) as Msg;
  if (role !== 'user' && role !== 'assistant' && role !== 'tool') return null;
  if (content != null && (typeof content !== 'string' || content.length > 2000)) return null;
  if (role === 'tool') return typeof tool_call_id === 'string' ? { role, content: content ?? '', tool_call_id } : null;
  if (role === 'assistant' && Array.isArray(tool_calls)) return { role, content: content ?? null, tool_calls: tool_calls.slice(0, 8) };
  return { role, content: content ?? '' };
}

/** POST { messages, context, name } -> { message } (the model's reply: text and/or tool calls for the browser to run).
 *  The browser runs the agent loop because the tools act on its own state (map, music, date). */
export async function chat(req: Request): Promise<Response> {
  const k = key();
  if (!k) return json({ error: 'no key' }, 503);
  if (foreign(req)) return json({ error: 'forbidden' }, 403);
  const { messages, context, name } = (await req.json().catch(() => ({}))) as { messages?: unknown[]; context?: string; name?: string };
  const turns = Array.isArray(messages) && messages.length <= 30 ? messages.map(clean) : [null];
  if (!turns.length || turns.some((m) => !m)) return json({ error: 'bad messages' }, 400);
  const system = `${SYSTEM(VOICES_TTS.some((v) => v.persona === name) ? name! : 'Jodi')}\n\nApp context right now: ${String(context ?? '').slice(0, 2500)}`;
  const models = env('GROQ_CHAT_MODEL') ? [env('GROQ_CHAT_MODEL')!] : Object.keys(CHAT_MODELS);
  let r!: Response;
  for (const model of models) {
    r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model, ...CHAT_MODELS[model], temperature: 0.5, max_completion_tokens: 1024,
        tools: TOOLS, tool_choice: 'auto', parallel_tool_calls: true,
        messages: [{ role: 'system', content: system }, ...turns],
      }),
    });
    if (r.status !== 429) break;
  }
  if (!r.ok) return fail(r);
  const data = (await r.json()) as { choices?: { message?: { content?: string | null; tool_calls?: unknown[] } }[] };
  const m = data.choices?.[0]?.message;
  return json({ message: { role: 'assistant', content: m?.content?.trim() ?? '', ...(m?.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) } });
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
