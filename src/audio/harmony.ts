// The conductor's score: one chord per bar, shared by every voice. Severity picks the progression,
// like a film or symphonic score darkening from modal calm to minor to diminished/dominant tension.
// Pitch classes are relative to the key root (0 = tonic). Root first, then colour tones.

export type Mood = 0 | 1 | 2; // calm, uneasy, severe

export const PROGRESSIONS: Record<Mood, { name: string; chords: number[][] }> = {
  // i9 – IV – bIII maj7 – bVII add9: open D dorian
  0: { name: 'Dm9, G, Fmaj7, Cadd9', chords: [[0, 3, 7, 10, 2], [5, 9, 0], [3, 7, 10, 2], [10, 2, 5, 0]] },
  // i – bVI – iv – v(sus): natural minor, heavier
  1: { name: 'Dm, Bb, Gm, Asus4', chords: [[0, 3, 7], [8, 0, 3], [5, 8, 0], [7, 0, 2]] },
  // i – bVI maj7 – vii°7 – V7b9: harmonic minor, tension that resolves home each loop
  2: { name: 'Dm, Bbmaj7, C#dim7, A7b9', chords: [[0, 3, 7], [8, 0, 3, 7], [11, 2, 5, 8], [7, 11, 2, 5, 8]] },
};

export const moodOf = (severity: number): Mood => (severity < 0.34 ? 0 : severity < 0.67 ? 1 : 2);

/** Chord pitch classes for bar 0..3. */
export const chordAt = (mood: Mood, bar: number) => PROGRESSIONS[mood].chords[bar % 4];

/** Melody passing tones on weak beats come from the mood's scale. */
export const SCALES: Record<Mood, number[]> = {
  0: [0, 2, 3, 5, 7, 9, 10], // dorian
  1: [0, 2, 3, 5, 7, 8, 10], // natural minor
  2: [0, 2, 3, 5, 7, 8, 11], // harmonic minor
};
