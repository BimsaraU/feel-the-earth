# Sound mapping

Generated from `src/audio/mapping.ts` by `npm run mapping`. Do not edit by hand.
Every sound traces to a data value. Transport: 72 bpm, D dorian, 4-bar loop (settings can change tempo and key).

## Layers

| Key | Layer | Range | Scale | Voice | Mode | MIDI register | EQ band (Hz) | Pan | Meaning |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Surface air temperature | -50 to 45 °C | linear | cello | pitch | 38-62 | 60-2500 | -0.25 | Higher notes mean warmer air. |
| 2 | Wind speed | 0 to 30 m/s | linear | flute | density | 72-86 | 400-9000 | 0.45 | Faster notes mean stronger wind. |
| 3 | Precipitation | 0.1 to 60 mm/day | log | harp | density | 62-86 | 200-8000 | -0.55 | More plucks mean heavier rain. |
| 4 | Carbon dioxide | 395 to 435 ppm | linear | contrabass | pitch | 26-47 | 35-800 | 0 | Higher notes mean more carbon dioxide. |
| 5 | Carbon monoxide | 40 to 300 ppb | linear | clarinet | pitch | 50-74 | 150-4000 | 0.2 | Higher notes mean more carbon monoxide. |
| 6 | Nitrogen dioxide | 1 to 300 µmol/m² | log | oboe | intensity | 62-74 | 300-6000 | -0.15 | Louder, brighter notes mean more nitrogen dioxide. |
| 7 | Ozone column | 120 to 480 DU | linear | glock | pitch | 79-103 | 1200-12000 | 0.6 | Higher notes mean a thicker ozone layer. |
| 8 | Fine particulate matter, PM2.5 | 1 to 200 µg/m³ | log | marimba | intensity | 45-57 | 80-3000 | 0.3 | Louder, brighter notes mean dirtier air. |

## Window features (all layers)

| Data feature | Sound parameter |
|---|---|
| Window, read west to east | The 4-bar loop. 16 columns become 16 steps, one per beat. |
| Column mean | Note (pitch voices), notes per step (density voices) or loudness (intensity voices) of that step. |
| Column variance | Articulation. Smooth columns are held, rough columns are short and detached. |
| Whole-window mean | Register and timbre blend: higher mean, higher octave band and brighter filter. |
| Gradient direction | Slow stereo drift towards the side where values rise (east right, west left). |
| No data | Soft felt-piano pulse on that step. Never silence. |

## Events

| Event | Sound | Sample slot |
|---|---|---|
| Border crossed | Two wooden clave ticks, the second higher: stepping into the next country. | `clave` |
| Many borders per second | Continuous soft clave patter. | `clave` |
| Coast, into sea | Short wave wash. | `wave` |
| Coast, onto land | Soft hand-drum thud. | `framedrum` |
| Equator | Singing bowl. | `singingbowl` |
| Tropics and polar circles | Small bell. | `smallbell` |
| Prime meridian | Small bell, lower. | `smallbell` |
| Antimeridian | Reversed cymbal swell. | `cymbal` |
| Window moving | Brushed whoosh, louder when faster. | `whoosh` |
| Day step | One clock ratchet tick. | `ratchet` |
| Month step | Wind chime. | `windchime` |
| Pole limit | Low muted gong. | `gong` |
| Haptic fallback | Short low thump where no vibration motor is available. | `thump` |

## Haptic patterns (ms, on/off/on...)

| Event | Pattern |
|---|---|
| border | 15, 40, 15 |
| coast | 40 |
| noData | 5, 30, 5, 30, 5 |
| timeStep | 8 |
| accent | 10 |
