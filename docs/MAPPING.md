# Sound mapping

Generated from `src/audio/mapping.ts` by `npm run mapping`. Do not edit by hand.
Every sound traces to a data value. Transport: 72 bpm, D minor pentatonic (within D dorian), 4-bar loop (settings can change tempo and key).

## Layers

| Key | Layer | Range | Scale | Voice | MIDI register | EQ band (Hz) | Pan | Meaning |
|---|---|---|---|---|---|---|---|---|
| 1 | Surface air temperature | -50 to 45 °C | linear | cello | 38-62 | 60-2500 | -0.25 | Louder means warmer air. |
| 2 | Wind speed | 0 to 30 m/s | linear | flute | 72-86 | 400-9000 | 0.45 | Louder means stronger wind. |
| 3 | Precipitation | 0.1 to 60 mm/day | log | harp | 62-86 | 200-8000 | -0.55 | Louder means heavier rain. |
| 4 | Carbon dioxide | 395 to 435 ppm | linear | contrabass | 26-47 | 35-800 | 0 | Louder means more carbon dioxide. |
| 5 | Carbon monoxide | 40 to 300 ppb | linear | clarinet | 50-74 | 150-4000 | 0.2 | Louder means more carbon monoxide. |
| 6 | Nitrogen dioxide | 1 to 300 µmol/m² | log | oboe | 60-76 | 300-6000 | -0.15 | Louder means more nitrogen dioxide. |
| 7 | Ozone column | 120 to 480 DU | linear | glock | 79-103 | 1200-12000 | 0.6 | Louder means a thicker ozone layer. |
| 8 | Fine particulate matter, PM2.5 | 1 to 200 µg/m³ | log | marimba | 43-59 | 80-3000 | 0.3 | Louder means dirtier air. |

## Window features (all layers)

| Data feature | Sound parameter |
|---|---|
| Scan | A line sweeps the window west to east over 4 bars (16 beats), then repeats. Method after NASA Chandra sonifications. |
| North-south position | Pitch. The window is read in 6 rows; northern rows sound higher (minor pentatonic in the chosen key). |
| Value of a cell | Loudness. Higher value, louder note. |
| Smooth stretch along a row | One held tone for as long as the value stays within 6 % of the range. |
| Local peak | Short accented strike, like point sources in the Chandra pieces. |
| Column variance | Articulation. Rough columns are detached, smooth columns legato. |
| East-west position | Stereo. The scan moves from left to right; the gradient direction nudges the voice towards the rising side. |
| Whole-window mean | Timbre: brighter filter and up to 3 dB more level for higher means. |
| Land and water share | Ambience bed: soft sea wash for water, breeze and birds for land, mixed by the share of each in the window. |
| No data | Soft felt-piano pulse on that beat. Never silence. |

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
