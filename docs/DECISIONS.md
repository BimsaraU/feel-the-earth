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

## 2026-11-14 Stage 2 (real EIC data, sidebar, wheels, gestures)

44. **Real data from NASA SVS / EIC visualisations** (see EIC_LAYERS.md). The sources given are movies, so `pipeline/build_eic.py` recovers values from pixels and geo-registers each source against Natural Earth. The four demo layers are gone from the app; the fixture survives for tests and as a labelled DEMO fallback.

45. **Sea temperature gaps are interpolated.** Flow streaks cover about 30 % of the ocean in a single day. Gaps are filled from the ±3-day mean, then from neighbours up to 3 degrees, ocean cells only (90 % coverage). This is interpolation of the visualisation, not new data.

46. **Lightning and night lights are relative indices**, not physical units. Spoken as "on a lightning density index from 0 to 1" and similar, never as flashes or radiance.

47. **Layer voices for the new data.** Sea temperature: cello melody (danger: marine heat above about 27.5 °C). Lightning: glockenspiel strikes plus a rain texture (danger: thunderstorms). Night lights: harp arpeggios, more notes where brighter. Light change: clarinet pad, bright and loud for new lights, dark and quiet for lights out. Unused instrument samples (flute, oboe, double bass, marimba) were removed to keep the offline download smaller.

48. **Time.** The date cursor spans 2007-03-25 to 2023-12-31; outside a layer's record that layer plays the felt-piano "no data" pulse. Turning on a layer whose record does not cover the date moves the date into the record and says so. Time travel (Y, or the Time menu) advances the date one step per bar while the loop plays, using the finest cadence among active layers (day, 10 days, year), and stops at the end of the record.

49. **Tempo is fixed at 72 bpm.** No single feature drives tempo, and the tempo setting was removed. Time travel uses the bar, not tempo, as its clock.

50. **All menus live in one sidebar** (Menu button or M): Listen, Layers (toggles plus live readouts), Time, Window, Settings, About the data. The map shows only the place title, date and caption.

51. **Sliders are tactile scroll wheels** (`src/ui/Wheel.tsx`): drag or flick with inertia, scroll, or arrow keys; each detent gives a haptic tick on phones (real haptics only: no thump sound per tick). They are ARIA sliders with spoken value text.

52. **Touch: one finger never moves the globe.** The camera only follows the window during keyboard or button glides. Two fingers spin and zoom the globe, and the window stays under the fingers (its centre follows the touch centroid), so spinning sweeps the window over the Earth. This replaces the earlier "second finger cancels the window drag".

## 2026-11-14 Stage 3 (surround field, 3D holographic view, GIBS layers)

53. **Halo map.** Every active layer is also sampled over 2.5 x the window (48 x 48, `refreshHalo` in the controller, at most ~8 per second while moving). It feeds both the 3D view and the surround field, so what you see around the window is what you hear around you.

54. **Surround field = 16 Earth-anchored sources with HRTF panning** (`src/audio/field.ts`). A 4 x 4 lattice, spacing 0.75 window widths, anchored to latitude and longitude, not to the window, so moving the window moves the listener through it. North is ahead, east right. Each source is a soft three-partial tone on the key root or fifth of the top layer's value (higher value = higher, louder, brighter). A source that leaves one edge re-enters at the other from silence (treadmill); sources inside the window are 8 dB down because the main voices live there. Output is binaural stereo for headphones; true multichannel (5.1) output is not attempted. Off switch: Settings, "Surround field".

55. **Doppler.** Moving-observer formula f' = f (c + v_r) / c with the window's smoothed velocity. c = 3 window widths per second (`DOPPLER_C`), tuned by ear so a keyboard glide gives about 3 semitones; clamped to 4 semitones for flings. Velocity relaxes to zero 150 ms after the last move.

56. **Data in 3D on the real globe** (replaces a Three.js view the user rejected: the Earth must stay the real MapLibre globe with Blue Marble imagery and true geography). Around the window, each active layer is drawn as fill-extrusion blocks with the exact geographic bounds of each halo cell, floating on its own faint plate, stacked upwards in switch-on order; signed layers rise above or hang below their plate. Depth is deliberately subtle (plate spacing 1.4 % and full block height 1.2 % of the window width). Block colour is 35 % absolute + 65 % stretched over the neighbourhood so local structure shows; the global overlay and legend stay absolute. Each layer has its own colour range (src/ui/colour.ts): thermal for temperatures, dark-to-blue-violet for rain, brown-to-green for vegetation, plasma for CO2, magma for night lights, orange-purple diverging for night-light change. Coastlines and borders are sharp glowing lines; a quarter-size bloom pass (thresholded copy of each frame, screened and blurred) and faint scanlines give the monitor look. The map starts tilted 28 degrees. Setup listens for style.load, not load: the scan line updates its source every frame, so the map never reports fully loaded.

57. **More NASA layers from GIBS** (`pipeline/build_gibs.py`, EIC_LAYERS.md): CO2, air temperature, precipitation, vegetation, aerosols, monthly. Exact values from published colour maps instead of pixel recovery. Voices reuse the recorded instruments in new roles: CO2 low cello bass, air temperature clarinet melody, precipitation harp + rain, vegetation cello pad, aerosols muffled glockenspiel pulse. Time travel steps one month when a monthly layer is the finest cadence.

## 2026-11-14 Android app (Capacitor)

52. **Android app via Capacitor 8.** `android/` wraps the same `dist/` build. `src/haptics/haptics.ts` imports `@capacitor/haptics` directly: Capacitor 8 only exposes `Capacitor.Plugins.Haptics` after `registerPlugin`, so the old `window.Capacitor.Plugins.Haptics` lookup (decision 18) never matched. Config is `capacitor.config.json` because the CLI cannot load a `.ts` config with TypeScript 7 on Node 22.17. Build: `npm run build && npx cap sync android`, then `android/gradlew assembleDebug` with JDK 21 (Gradle 8.14 does not run on JDK 26).

58. **No sound for missing data.** The felt-piano "no data" pulse, its haptic, the grey map hatching, the no-data ring and the tour segment are gone (user: a stand-in sound is confusing). A layer is simply silent where it has no data; "What am I hearing" still says so in words. The no-layer piano pulse is gone too; the ambience beds keep the app from being silent.

59. **You can hear which way you are moving.** While the window travels, the whole music mix leans in the direction of travel (stereo balance up to 60 % for east/west, `0.6 tanh(1.5 v)` with v in window widths per second, smoothed) and tilts with a 2.5 kHz high shelf: up to +4 dB going north (brighter), -4 dB going south (darker). The whoosh pans further. Linear 250 to 350 ms ramps; it eases back to centre 150 ms after the last move. Event earcons stay centred.

60. **Smoother movement.** During keyboard glides the camera follows continuously with a frame-rate-independent ease (time constant about 0.3 s) instead of jumping once the window nears the edge. The 3D blocks stay put while the window glides (they are geographic) and refresh when it comes to rest, instead of stepping 8 times a second. The colour overlay is drawn at 0.5 degrees with linear resampling and a short fade.

61. **Navigation like NASA Eyes on the Earth** (replaces 20 and 52). MapLibre's own handlers: drag spins the globe with inertia, wheel and pinch zoom smoothly, double-click zooms, north stays up, the globe still flattens into a map from zoom 3 to 4. The listening window is locked to the centre of the view, so turning the globe is moving: every camera move updates the window continuously and commits (borders, "Now over") when it settles. A click glides the view there. Keyboard glides move the camera with them.

62. **Heatmap like Eyes, not tiles** (replaces the 3D blocks of 56). The top layer is one continuous colour field: data bilinearly interpolated at 0.5 degrees, rows blended across the Mercator stretch, linear GPU resampling, 72 % opacity, no data transparent.

63. **Earth, not wind, for land** (replaces 26 and 40 for land). Land plays a synthesized deep earth rumble (brown noise below 180 Hz plus a faint 420 Hz soil grain); the mountain-wind recording joins only above about 600 m mean land elevation and reaches full at 3,000 m. Bed crossfades ramp over 0.8 s.

64. **No doppler; spatial motion instead** (replaces 55). Direction of travel is heard by level and position only: stereo balance for east/west, and while moving up to half the mix crossfades (equal power) into an HRTF panner placed in the direction of travel, ahead for north and behind for south, plus a gentle ±3 dB treble tilt. Everything eases over 0.5 s and returns to the plain stereo mix when you stop. The surround field keeps its HRTF positions but no longer shifts pitch.

## 2026-11-15 Terrain probe, sharp heatmap, galaxy, tactile dials

65. **Terrain probe: you feel the data change while you move** (`src/audio/terrain.ts`, on top of 59 and 64). The loop only told you about a place after you stopped. Now, while the window moves, the value under its centre is a held tone on a 16-rung pentatonic ladder; rung height is 40 % absolute (layer range) + 60 % local (range of the halo), so a 1 °C change in the tropics still climbs rungs. Every rung crossed is re-struck with a haptic tick (hysteresis 0.6 rung), so uphill is a rising run and downhill a falling one. The tone sits in the uphill direction by HRTF, further out when steeper, and brightens with the rate of change. The music ducks 5 dB while moving, and the loop itself now regenerates every 400 ms during travel and swaps on any beat instead of the next bar. Pitch follows the data, never the speed (no doppler, as in 64). Off switch: Settings, "Terrain probe and beacons".

66. **Peak and valley beacons.** The highest and lowest smoothed values within the halo (1.25 window widths) ping from their true bearing: peak two rising high notes, valley two falling low notes, faster (1.2 s to 0.2 s) and louder as you approach, silent once within 0.12 window widths. Arriving plays a bell (peak) or deep drum (valley) and speaks the value; it only counts if the place was far and stayed put while you closed in, because on plateaus the extreme can jump under the window. B, or Assistant, "Find peak and valley", speaks bearing, distance and value. Among near-equal extremes the nearer wins (distance penalty 0.03 per window width).

67. **Heatmap as sharp as the data** (replaces 62 and the bloom and scanlines of 56). Data is read at its own resolution and interpolated bicubically (Catmull-Rom) per pixel; relief shading from the local gradient and a one-pixel contour line every 1/16 of the layer range give crisp structure. Two levels: the world at four pixels per data cell, and above zoom 2.5 a screen-resolution patch of the visible area redrawn when the view settles. The bloom pass (a blurred copy screened over everything) and the scanlines are gone. Zoomed in past level 5 the Blue Marble comes from NASA GIBS (online, level 8); the bundled tiles stay underneath for offline use. The data itself is still 1 degree (0.5 for night lights): finer needs a pipeline rebuild.

68. **Galaxy and a contained planet.** A procedural star field with a nebula band (`src/ui/Galaxy.tsx`, seeded, drawn once per size) sits behind a transparent map. The view starts at the zoom where the whole planet fits with space around it, and programmatic moves compensate MapLibre's latitude-relative globe zoom so the planet keeps its size.

69. **Interface** (replaces 50). Top left: place, one line of coordinates and date, caption. Top right: Play/Pause, Assistant (A), Menu (M). The audio assistant is its own panel: where am I, what am I hearing, find peak and valley, tour, voice guide, hold to ask. Bottom left: a map key that names the layer drawn on the map with its colour scale, contour interval and date, lists layers that are heard but not drawn (click one to draw it), and explains the window and scan line. Dials are knurled drums: a click per step (higher going up), a haptic tick, a thud and a nudge at the end stops.

## 2026-11-15 Granular spatial field (replaces the probe tone of 65 and the 16-source field of 54)

70. **Pitch never follows motion.** User: moving changed the pitch, so changes were hard to tell apart. The probe ladder tone (65) and the loop re-rendering during travel are gone; the loop again swaps at bar lines and re-reads the window when you stop. Contour crossings remain, as silent haptic ticks. Beacons keep fixed pitches.

71. **Granular spatial field** (`src/audio/field.ts`). The map within 1.25 window widths is split into points on a lattice anchored to latitude and longitude, a third of a window apart (about 50 points). Each point emits short FM grains from its true direction (HRTF, north ahead). What a point sounds like depends only on its data and the bar's chord; where it sounds from depends only on where you are. Five features, five dimensions: value sets grain density and loudness and which chord tone it sings (low places low tones); gradient sets timbre (FM index: flat = pure, fronts = metallic); roughness sets articulation (smooth = long soft, patchy = short plucked); a value past the layer's danger line adds a semitone clash. Distance: gain 1 / (1 + (d / 0.45)^2) and an air low-pass 9 kHz / (1 + 4 d), fading to silence at the rim. Grains fall on the loop's 16th-note grid, so simultaneous points form the bar's chord. Pool of 20 voices, loudest first. The field bypasses the music duck, so while you move it leads and the loop steps back 5 dB. ponytail: tuned by reasoning, not by ear; the curves are `grainSound` and `placement`.

72. **Lighter precache** (replaces 35). Precaching all ~45 MB made each new deploy wait for the full download before it could take over, so phones kept showing old builds. Precached: app shell, all audio and the data layers (~12 MB). Map tiles and atlas images are cached on first use (stale-while-revalidate).

73. **Audio buffer and lookahead.** A single AudioContext created in the start gesture with latencyHint 'playback' and 0.2 s lookahead on touch devices ('balanced', 0.12 s elsewhere). Grains are scheduled 250 ms ahead and the grain pool is 12 voices on phones (20 on desktop), since HRTF is the main audio cost. Costs about 0.1 s of latency on one-shots, for no crackles when the map and React are busy.

74. **Silence when idle.** Peak/valley beacons ping only while the window moves and 0.8 s after (was 4 s), or for 6 s on "Find peak and valley". The granular field sounds while the music plays or the window moves; paused and still is silent. The many-borders clave patter now ends when movement stops (it only ended on drag release, so key moves could leave it ticking).

75. **Synchronised dates.** All layers share one date. A layer whose record does not cover it plays its nearest frame; the map key and the assistant say which ("nearest record March 2008"). Turning a layer on no longer moves the date. The app starts on the most recent date of any layer (31 December 2023).

76. **Home date dial.** The date wheel also sits at the bottom of the home screen as a small pill with the date. Touching, scrolling or focusing it rolls out the full drum; it tucks away 1.4 s after release.

77. **Conversational assistant (Groq).** The key stays on the server: Vercel edge functions api/chat and api/tts (also served by the dev and preview servers), key from GROQ_API_KEY or GROQ. Open questions and anything the command grammar does not match go to openai/gpt-oss-120b with the moment's context (place, date, layers, values, nearest records); answers are one to three spoken sentences. All speech uses the Orpheus neural voice (hannah) in chunks of at most 200 characters, cached per phrase; if the first chunk takes over 2.5 s or the service fails, the browser voice speaks and the neural voice rests for a minute. Calls from other origins are refused.

78. **Beacons are optional, off by default.** Peak/valley pings competed with the music, so they have their own setting ("Peak and valley beacons while moving"), 6 dB quieter, separate from contour ticks. "Find peak and valley" still pings on request. Pings are scheduled on the audio clock from Tone.immediate() up to 150 ms ahead: no lookahead delay on the first ping, no timer jitter after.

79. **Heatmap painting in a Web Worker.** The per-pixel paint (up to 2048 x 2048, bicubic) ran on the main thread and stalled the audio scheduler on every redraw, heard as stumbles. It now runs in src/ui/paint.worker.ts. Audio context uses the 'playback' latency hint everywhere; the motion HRTF panner sits after its wet gain so it is silent (and skipped) at rest; grain pool 14 (8 on phones).

80. **CO2 smoothed for display.** Carbon dioxide retrievals scatter by a few ppm, which showed as speckle. The map applies three NaN-aware 3 x 3 passes (filling isolated missing cells); the sound still reads the raw data.
81. **JODI, the voice assistant.** Hold J (or the Hold button, or K) to talk: listening starts on key-down so no words are lost, and runs through pauses until release; a tap under 250 ms toggles the voice guide instead (V became "find valley"). "Hey Jodi" wakes it hands-free through background browser speech recognition (Chrome/Edge), paused while JODI speaks so it never wakes itself; off by default on phones, where restarts chime. Avatar: a small wobbling orange Earth with a headband in the top bar (glows listening, orbit ring thinking, bounces speaking) until the real artwork lands.

82. **Fish Audio speech.** Groq's TTS hit its rate limit; speech now comes from Fish Audio (s2.1-pro, latency low, ~1 s per sentence, MP3) with the public "Female Voice" model, overridable by FISH_VOICE. Key FISH_AUDIO_API_KEY (or FAUDIO), server-side only. Groq Orpheus stays as the fallback when no Fish key is set.

83. **Beacons fixed and split.** B pings only the peak, V only the valley. Beacons were placed from the last move's position, which at boot was (0, 0), so they sat out of earshot until the first drag; they now take the halo's centre. Navigation beacons are on by default again (the setting was renamed so an old saved "off" does not stick), at -6 dB.
84. **JODI speaks with a London accent, and the tours are hers.** Live speech and every recorded line use Fish Audio's public "Harriet's London Voice". The start-up greeting is now JODI's welcome (two recorded parts with the place spoken live between them; any interrupting speech or Esc ends it). T plays the listening tour (now with peaks and valleys), Shift+T or "help" plays the new assistant tour on how to talk to JODI; "what can I say" still lists the commands. Narration is recorded by scripts/build_narration.mjs (replaces the Kokoro Python script); audio cache bumped to v2 so browsers fetch the new clips.
85. **Voice choice; Sarah by default.** JODI's voice is a setting: Sarah (default, soft female), Gojo (male), Harriet (London) and Sweet (young, breathy). The list in src/assist/voices.ts is shared with the server, which refuses other ids so the key cannot voice arbitrary models. Welcome, tours and the start-screen line are recorded in Sarah; with another voice they are spoken live. The start screen plays its recorded line when the browser allows sound before a gesture, else the browser voice.

86. **Taps never overshoot.** An arrow tap glides exactly a quarter width even when a busy main thread delivers the key-up late: tap vs hold is judged from the events' own timestamps (under 200 ms = tap), and until then the glide never passes the step.
87. **Gojo and a confident female voice.** The voice list gains Upbeat (confident female). Each voice carries a persona: in Gojo's (male) voice the assistant calls itself Gojo everywhere: labels, chat answers (the server takes the name from an allowlist), live-spoken tours and welcome, and "Hey Gojo" wakes it too.

88. **Upbeat is the default voice; JODI waits longer for it.** The neural voice now gets 9 s for the first part and 15 s for later parts (was 2.5 s / 8 s) before the browser voice steps in, a failed request benches it for 15 s (was 60 s), and chat answers get 20 s. Recordings redone in Upbeat; the voice setting was renamed (jodiVoice) so an old saved Sarah does not stick.

89. **Tours pre-recorded in every voice.** The start line, welcome, listening tour and assistant tour are recorded for each of the five voices (public/audio/narration/<voice>/, Gojo's naming itself Gojo), so no voice falls back to live speech for them. Only the default voice is precached (the precache stays ~13 MB); the others download on first use and stay in the audio cache. Clips at 64 kbit/s, about 2.5 MB per voice.
