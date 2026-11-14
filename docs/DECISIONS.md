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

## 2026-11-14 Stage 1, round 2 (UI and sonification rework)

24. **Sonification now follows NASA Chandra's method** (Arcand, Russo, Santaguida, "A Universe of Sound", https://chandra.si.edu/sound/). A line scans the window west to east (as Chandra scans left to right); north-south position sets pitch (6 rows, northern rows higher), the data value sets loudness (Chandra: brightness to volume), smooth stretches along a row are one held tone (diffuse light as sustained sound) and local peaks are short accented strikes (point sources as plucks or bells). Stereo follows the scan. This replaces decisions 9 to 12: value no longer moves pitch, so "which region is higher" is answered by loudness. The scan line is drawn on the map.

25. **Minor pentatonic** (a subset of D dorian) for the 6 rows, so any combination of rows is consonant. Narrow registers (oboe, marimba) were widened so every key fits 6 rows (unit test).

26. **Ambience beds.** Sea: a 24 s seamless slice of the ocean recording, low-passed. Land: a 28 s public-domain breeze-and-birds recording, high-passed. Both at -20 dB, mixed equal-power by the land share of the window (10 x 10 sample of the geo raster). Loops are crossfaded tail-into-head at build time and play with 60 ms trimmed at each end to skip MP3 encoder padding.

27. **Touch drag puts the window centre under the fingertip** (no grab offset), so the contact point is the probe: land/water crossings under the finger fire the coast haptic and the beds shift. Mouse drag keeps its grab offset.

28. **Haptic thump fallback only on coarse pointers.** On desktop the event sounds already carry the information; the extra thump made the mix busy. Android vibrate and Capacitor are unchanged.

29. **Smooth navigation.** Held arrows and on-screen arrows glide with eased velocity at a user-set speed (0.1 to 2 window widths per second, default 0.6). A tap still lands exactly a quarter width (Shift: full width), easing out. The camera chases the window when it leaves the middle 40 % of the screen.

30. **Map, not just globe.** MapLibre projection interpolates from globe (zoom 3) to flat Mercator (zoom 4), so zooming in gives a full-screen map. Basemap: NASA Blue Marble "Whole world - land and oceans" cut into Mercator tiles z0 to z5 (9 MB, `scripts/build_imagery.py`), overzoomed beyond z5.

31. **Overlay projection fix.** The colour overlay is now resampled row by row to Mercator latitude; before, it was drawn as an equirectangular image stretched over Mercator corners and was misplaced away from the equator.

32. **Window resize by direct manipulation:** a handle on the north-east corner (mouse and touch), a size slider (keyboard and screen readers), and + / - which tween with GSAP.

33. **UI**: GSAP for entrances, place-title crossfades, number counters, drawer and panel motion. Under reduced motion GSAP's global timeline runs 50x faster (effectively instant) and CSS animations are off. Fonts: Fraunces (organic serif, titles and numbers) and Outfit (UI text), bundled for offline use.

34. **Voice guide toggle** (toolbar button and V key). Off means no speech at all; every message still goes to the caption and the aria-live region, so screen-reader users keep it.

35. **Precache size** grew to about 16 MB (1,481 files, mostly map tiles). First visit on a slow connection takes longer; all later visits are offline.

## 2026-11-14 Stage 1, round 3 (harmony, severity, altitude, haptics)

36. **Shared harmony replaces per-layer pentatonic clusters** (supersedes the pitch part of 24 and 25). Six-row pentatonic chords from several unrelated layers stacked into clusters. Now a conductor holds one chord per bar from a 4-chord progression and every voice takes its notes from that chord, the way orchestral sections share a progression. Each layer has an orchestral role (bass, pad, melody, arp, colour, pulse) that limits how many notes it plays. The Chandra reading is kept: west-to-east scan, north-south position to pitch height, value to loudness, peaks to strikes. A unit test checks that every voice in every mood stays in the bar's chord (the melody may pass through the scale on weak beats).

37. **Severity transforms the score.** Each layer declares when it is dangerous (CO2, CO, NO2, PM2.5, heat, storm wind and flooding rain when high; ozone when low). The worst active layer sets the ensemble severity. Calm: Dm9, G, Fmaj7, Cadd9 (open D dorian). Uneasy: Dm, Bb, Gm, Asus4 (natural minor) plus a tremolo-string drone. Severe: Dm, Bbmaj7, C#dim7, A7b9 (harmonic minor) plus a timpani heartbeat. The progression always resolves to D minor at the loop start, so even the severe version stays tonal.

38. **Character filters per feature.** Each layer's filters follow its window mean so the timbre matches the meaning: cold air thin and icy, hot air dark and full; CO2 darker with a resonant growl; NO2 nasal; PM2.5 muffled as if through smog; ozone bells brighter when the layer is thick and sparse over an ozone hole. Wind and rain add recorded textures (howling wind, falling rain) whose level follows the value.

39. **Gradients shape dynamics.** The change in value from one beat to the next scales loudness (rising swells to x1.4, falling recedes to x0.6). A change steeper than 12 % of the range per beat is a front: a short accented note. Bass splits the bar root-then-fifth when the bar rises.

40. **Altitude.** Land ambience mixes a warm bed (breeze and birds, darker) with a chilly bed (howling mountain wind, high-passed) by the mean elevation of the land in the window: warm at sea level, chilly from 3,000 m. Elevation is NOAA ETOPO5, block-averaged to the 0.25-degree raster (`scripts/build_elevation.py`, 1 MB).

41. **Crossings are very subtle now:** border ticks at -24/-26 dB through a 2.2 kHz low-pass, wave wash and land touch at -20 dB, low-passed; ducking under events reduced from 3 to 1.5 dB. Haptic pulses carry most of the crossing.

42. **Haptics on tablets.** Root cause: Chrome on Android tablets sends a desktop user agent by default, so the old `/Android/` check fell through to the audio thump. Now any touch device with `navigator.vibrate` uses it. iPhone Safari (iOS 18+) gets system haptics through the native switch-control trick. iPads have no vibration motor and Safari has no Vibration API, so iPad web cannot vibrate; it keeps the thump. Settings has a "Test haptics" button that says which driver is in use.

43. **Quieter menus.** Glass panels are more transparent and brighten on hover or focus; no visible scroll bars; Navigate starts collapsed; layer chips show short names only (state is aria-pressed and the lit outline).
