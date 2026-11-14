# Decisions

Non-obvious choices, newest last. Each entry: what, why, how to undo.

## 2026-11-14 Stage 1

1. **Sound palette section was missing from the brief.** The brief refers to "the recordings listed in the Sound palette section", which was not supplied. Palette chosen here (see MAPPING.md): temperature cello section, wind flute, precipitation harp, CO2 double bass, CO clarinet, NO2 oboe, O3 glockenspiel, PM2.5 marimba, no-data felt piano. Each voice owns a register, EQ band and pan position so four stacked layers stay apart. Replace by editing `VOICES` in `src/audio/mapping.ts` and the instrument list in `scripts/prepare_audio.py`.

2. **Wind is a concert flute, not a bamboo flute.** The brief's example says "bamboo flute". No openly licensed, multi-sampled bamboo flute was found; VSCO-2-CE (CC0) has a concert flute with staccato samples. Sample slot: `public/audio/flute/*.mp3`. Drop in bansuri or shakuhachi samples with the same note names to swap.

3. **Felt piano = VSCO upright piano, pp layer, behind a 1.1 kHz low-pass.** No CC0 felt-piano set found. Recorded piano, softened; no synthesis.

4. **Frame drum = tumba (conga family) hand-drum hit** from VSCO-2-CE. No CC0 frame drum found. Slot: `oneshots/framedrum.mp3`.

5. **Small bell = triangle hit** (VSCO-2-CE). Slot: `oneshots/smallbell.mp3`. Prime meridian reuses it played lower (0.75x rate) so it is recognisably a "line" but distinct from tropics and circles.

6. **Brushed whoosh is a band-passed slice of the ocean recording**, looped, level following drag speed. No openly licensed brush-swish recording found. It is a recording, not noise from an oscillator. Slot: `oneshots/whoosh.mp3`.

7. **Clock ratchet tick = first 180 ms of a VSCO orchestral ratchet.** Slot: `oneshots/ratchet.mp3`.

8. **Reversed cymbal swell is made at load time** by reversing the VSCO crash sample buffer, so only one cymbal file ships.

9. **Pitch is absolute, so "register from the window mean" is implicit.** Each pitch voice maps the normalised value of a column straight onto the scale inside its register. The window mean therefore decides which part of the register the loop sits in. The alternative (shift the register by the mean, then map columns relative to it) would make equal values sound at different pitches in different windows, which breaks blindfold test (c). The window mean also sets timbre: low-pass cutoff (700 Hz to the band ceiling) and up to +3 dB level.

10. **Density voices (wind, rain) play 1 to 4 notes per step**, rising in thirds from the register home set by the window mean. Never zero, so a dry desert is still audible as one quiet pluck per beat.

11. **Articulation uses variance in normalised space**, so log-scaled layers (rain, NO2, PM2.5) behave like linear ones. Standard deviation of 0.08 of the range or more gives the shortest notes.

12. **Gradient sets a stereo drift, not an LFO.** Pan glides over 4 s to home + 0.3 x sin(gradient direction): values rising to the east drift right. A slow ramp is easier to trace to the data than a cycling LFO.

13. **Loop swaps at the next bar line (every 4 beats)**, so the worst-case wait after a move is one bar (3.3 s at 72 bpm). Event one-shots give the immediate feedback; the first loop after start swaps in at once.

14. **Border tick pitch.** Border events only happen between two countries, so the second clave tick is always higher ("entering"). Leaving land is a coast event (wave wash), not a border.

15. **Hysteresis by distance.** While dragging, a new country only counts once the centre is 0.15 degrees past the point where it first appeared. Keyboard and button moves commit at once. The tracker walks the path between positions in 0.25-degree steps so a 30-degree jump still reports every border and line on the way.

16. **Speech after discrete moves.** When a key or button move crosses a border or coast, a short "Now over X" is spoken. Not done while dragging (too chatty); the earcons carry that.

17. **Built-in voice can be turned off.** With a screen reader running, speechSynthesis and the screen reader would both talk. Setting "Built-in voice" off leaves the aria-live mirror only.

18. **Haptics driver choice.** Capacitor Haptics is reached through `window.Capacitor.Plugins.Haptics` at run time, so the web bundle carries no Capacitor dependency. `navigator.vibrate` is only trusted on Android because desktop Chrome exposes it without a motor. Everything else plays the thump sample.

19. **Overlay is drawn as two half-globe images** (west and east) because a single image spanning -180 to 180 is ambiguous at the antimeridian. Latitudes beyond 85 degrees are not drawn (MapLibre image sources use Web Mercator bounds).

20. **Gestures are handled by our own pointer code**; MapLibre interaction is off (`interactive: false`). One finger after 80 ms moves the window, a second finger cancels the drag and returns the window to where the drag began, two fingers rotate and pinch. A quick tap places the window. Mouse: left-drag moves the window, right-drag or Shift-drag turns the globe, wheel zooms.

21. **Many-borders texture runs on a timer, not the transport**, so it is heard even while the loop is paused.

22. **Geo raster at 0.25 degrees** (1440 x 720, Uint8 country ids then Uint8 sea ids, 2 MB, about 120 kB gzipped). Every sea cell is filled with its nearest named Natural Earth marine area, so "over the Bay of Bengal" is O(1).

23. **Loudness.** Master chain is compressor (-20 dB threshold, 3:1) then limiter at -1 dBFS, volume 70%. Gain staging aims at about -14 LUFS for four layers but has not been measured with a meter yet (see VALIDATION.md).
