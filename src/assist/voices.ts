// The assistant's voices (Fish Audio public models). Shared by the Settings picker and the server (api/_groq.ts), which
// only accepts these ids. The first is the default, and the one the welcome and tours are recorded in
// (scripts/build_narration.mjs); with another voice the tours are spoken live instead.
// persona: the name the assistant goes by in that voice (Gojo's voice calls itself Gojo; the rest are JODI).
export const VOICES_TTS = [
  { id: 'e107ce68d2a64e928c3a674781ce9d56', name: 'Upbeat', note: 'female, confident and clear', persona: 'Jodi' },
  { id: '933563129e564b19a115bedd57b7406a', name: 'Sarah', note: 'female, soft and gentle', persona: 'Jodi' },
  { id: 'd38a3e358fc74bf6bf78aa3351add681', name: 'Harriet', note: 'female, London accent', persona: 'Jodi' },
  { id: '5109f9634e6d45d5a870a2fc29950ef4', name: 'Sweet', note: 'female, young and breathy', persona: 'Jodi' },
  { id: 'c85fb11f91f84312a4bd16756f298ae2', name: 'Gojo', note: 'male, confident', persona: 'Gojo' },
] as const;

export type Persona = (typeof VOICES_TTS)[number]['persona'];
export const DEFAULT_VOICE: string = VOICES_TTS[0].id;
/** Name the assistant goes by with this voice. */
export const personaOf = (voice: string): Persona => VOICES_TTS.find((v) => v.id === voice)?.persona ?? 'Jodi';
/** Swap the default name in a fixed line (tours, welcome) for the current persona. */
export const asPersona = (text: string, p: Persona) => (p === 'Jodi' ? text : text.replace(/\bJodi\b/g, p).replace(/\bJODI\b/g, p.toUpperCase()));
/** Folder of a voice's recordings under public/audio/narration (the default voice for an unknown id). */
export const voiceFolder = (voice: string) => (VOICES_TTS.find((v) => v.id === voice) ?? VOICES_TTS[0]).name.toLowerCase();
