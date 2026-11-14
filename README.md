# Feel the Earth (Earth Jukebox)

NASA Space Apps Challenge 2026, "The Earth Information Jukebox".

Move a small listening window over a globe and hear the Earth data inside it as a looping soundscape
played by recorded instruments. Borders, coasts and named lines are earcons and haptic pulses. Time steps by day
or month. Everything works by keyboard, by touch and with a screen reader.

**Stage 1 plays DEMO DATA, not NASA data.** It is labelled on screen and in speech.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run e2e        # Playwright smoke test (builds and serves on :4173)
npm run build      # production build + service worker (works offline after first visit)
npm run mapping    # regenerate docs/MAPPING.md from src/audio/mapping.ts
```

Assets are committed. To rebuild them (needs network):
`python scripts/prepare_audio.py` and `python scripts/build_geo.py` and `python scripts/build_imagery.py` (numpy, scipy, matplotlib, pillow, soundfile, imageio-ffmpeg).

## Keys

| Key | Action |
|---|---|
| Arrows (hold) / Shift+arrows | Glide the window; a tap moves at least a quarter / full width. Speed in Navigate |
| + / - | Grow / shrink window (2 to 30 degrees) |
| 1 to 8 | Toggle layers (up to 4) |
| , and . / Shift+, and . | Day / month back and forward |
| W / H | Where am I? / What am I hearing? |
| G | Arrows turn the globe instead |
| T | Audio legend (tutorial) |
| V | Voice guide on / off (spoken help; captions stay) |
| Space | Play / pause |
| Esc | Stop speech and tutorial |

## Layout

`src/audio` engine, voices, mapping · `src/geo` raster lookups and events · `src/data` DataSource and fixture ·
`src/haptics` · `src/assist` speech, answers, tutorial · `src/ui` globe and controls · `docs` mapping, credits, decisions.
