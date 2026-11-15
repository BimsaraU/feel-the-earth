// JODI's voices (Fish Audio public models). Shared by the Settings picker and the server (api/_groq.ts), which only
// accepts these ids. The first is the default, and the one the welcome and tours are recorded in
// (scripts/build_narration.mjs); with another voice the tours are spoken live instead.
export const VOICES_TTS = [
  { id: '933563129e564b19a115bedd57b7406a', name: 'Sarah', note: 'female, soft and gentle' },
  { id: 'c85fb11f91f84312a4bd16756f298ae2', name: 'Gojo', note: 'male, confident' },
  { id: 'd38a3e358fc74bf6bf78aa3351add681', name: 'Harriet', note: 'female, London accent' },
  { id: '5109f9634e6d45d5a870a2fc29950ef4', name: 'Sweet', note: 'female, young and breathy' },
] as const;

export const DEFAULT_VOICE = VOICES_TTS[0].id;
