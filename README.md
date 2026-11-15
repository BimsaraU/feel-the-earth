# Feel the Earth (Earth Jukebox)

NASA Space Apps Challenge 2026, "The Earth Information Jukebox".

Move a small listening window over a globe and hear the Earth data inside it as a looping soundscape
played by recorded instruments. Borders, coasts and named lines are earcons and haptic pulses. Time steps by day
or month. Everything works by keyboard, by touch and with a screen reader.

Data: NASA Earth Information Center visualisations (sea surface temperature, lightning, night lights, night-light change), see docs/EIC_LAYERS.md. Rebuild with `python pipeline/build_eic.py`.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run e2e        # Playwright smoke test (builds and serves on :4173)
npm run build      # production build + service worker (app shell offline; data cached as used)
npm run mapping    # regenerate docs/MAPPING.md from src/audio/mapping.ts
```

Assets are committed. To rebuild them (needs network):
`python scripts/prepare_audio.py`, `node --experimental-strip-types scripts/build_narration.mjs` (start line, welcome and tours in every assistant voice, via Fish Audio; needs the Fish key), `python scripts/build_geo.py`, `python scripts/build_imagery.py` and `python scripts/build_elevation.py` (numpy, scipy, matplotlib, pillow, soundfile, imageio-ffmpeg).

## Keys

| Key | Action |
|---|---|
| Arrows (hold) / Shift+arrows | Glide the window; a tap moves at least a quarter / full width. Speed in Navigate |
| + / - | Grow / shrink window (2 to 30 degrees) |
| 1 to 4 | Toggle layers |
| , and . / Shift+, and . | Day / month back and forward |
| W / H | Where am I? / What am I hearing? |
| B / V | Find the peak / the valley: where the highest / lowest value nearby is (its beacon pings) |
| A | Audio assistant panel |
| G | Arrows turn the globe instead |
| T / Shift+T | Listening tour (every sound and why it sounds that way) / assistant tour (how to talk to JODI). Esc ends either |
| J (hold) | Talk to JODI, the voice assistant (or say "Hey Jodi"). A quick tap turns the voice guide on / off |
| Y | Time travel on / off (one step per bar) |
| M | Menu (sidebar) |
| Space | Play / pause |
| Esc | Stop speech and tutorial |

## Layout

`src/audio` engine, voices, mapping · `src/geo` raster lookups and events · `src/data` DataSource and fixture ·
`src/haptics` · `src/assist` speech, answers, tutorial · `src/ui` globe and controls · `docs` mapping, credits, decisions.
