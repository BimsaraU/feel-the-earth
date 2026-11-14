# Sound mapping

Generated from `src/audio/mapping.ts` by `npm run mapping`. Do not edit by hand.
Every sound traces to a data value. Transport: 72 bpm, key D (settings change tempo and key), 4-bar loop, one chord per bar.
Spans read "at layer minimum → at layer maximum" of the window mean.

## Layers

| Key | Layer | Range | Scale | Voice | Role | MIDI register | High-pass Hz | Low-pass Hz | Resonance Q | Texture dB | Dangerous when | Meaning |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Surface air temperature | -50 to 45 °C | linear | cello | melody | 45-69 | 220 → 60 | 9000 → 2400 | 0.7 |  | high (t 0.72 → 0.95): heat | Louder means warmer air; cold air sounds thin and icy, hot air dark and full. |
| 2 | Wind speed | 0 to 30 m/s | linear | flute | arp | 74-91 | 500 → 300 | 4000 → 10000 | 0.7 | windbed -40 → -16 | high (t 0.6 → 0.9): storm winds | More and louder flute notes, and more wind noise, mean stronger wind. |
| 3 | Precipitation | 0.1 to 60 mm/day | log | harp | arp | 62-86 | 200 | 5000 → 8000 | 0.7 | rain -42 → -14 | high (t 0.7 → 0.95): flooding rain | More harp plucks and louder rain mean heavier rain. |
| 4 | Carbon dioxide | 395 to 435 ppm | linear | contrabass | bass | 28-43 | 35 | 1600 → 450 | 0.7 → 5 |  | high (t 0.35 → 0.9): carbon dioxide | Louder, darker and more growling means more carbon dioxide. |
| 5 | Carbon monoxide | 40 to 300 ppb | linear | clarinet | pad | 50-67 | 150 | 4000 → 1600 | 0.7 → 3 |  | high (t 0.45 → 0.9): carbon monoxide | Louder and duller means more carbon monoxide. |
| 6 | Nitrogen dioxide | 1 to 300 µmol/m² | log | oboe | pad | 62-77 | 300 | 7000 → 3200 | 0.7 → 7 |  | high (t 0.4 → 0.85): nitrogen dioxide | Louder and harsher, more nasal, means more nitrogen dioxide. |
| 7 | Ozone column | 120 to 480 DU | linear | glock | color | 79-98 | 1200 | 6000 → 12000 | 0.7 |  | low (t 0.35 → 0.05): ozone loss | More and brighter bells mean a thicker ozone layer; an ozone hole falls silent. |
| 8 | Fine particulate matter, PM2.5 | 1 to 200 µg/m³ | log | marimba | pulse | 45-60 | 80 | 5000 → 700 | 0.7 → 1.5 |  | high (t 0.45 → 0.85): smoky, dusty air | Louder and more muffled, as if through smog, means dirtier air. |

## Window features (all layers)

| Data feature | Sound parameter |
|---|---|
| Scan | A line sweeps the window west to east over 4 bars (16 beats), then repeats. Method after NASA Chandra sonifications. |
| North-south position | Pitch height: features in the north of the window sound higher. |
| Value | Loudness, and for arp voices the number of notes per beat. |
| Shared harmony | All layers play tones of one chord per bar from a 4-chord progression, so uncorrelated data still harmonises. |
| Severity (worst active layer) | Chooses the progression: calm (D dorian, open), uneasy (D minor), severe (harmonic minor with diminished and dominant b9 chords). Above uneasy a tremolo string drone enters; above severe a timpani heartbeat. |
| Gradient along the scan | Rising values swell (louder), falling values recede; a steep front (12 % of range per beat) is an accent. |
| Window mean | Character filters per layer (see table): e.g. cold air thin and icy, CO2 darker and growling, PM2.5 muffled. |
| East-west position | Stereo follows the scan from left to right. |
| Land and water share | Ambience: soft sea wash for water, land sounds for land, mixed by share. |
| Land elevation | Land ambience: low land is warm (breeze and birds, darker), high land chilly (mountain wind, thinner). |
| No data | Soft felt-piano pulse on that beat. Never silence. |

## Events

| Event | Sound | Sample slot |
|---|---|---|
| Border crossed | Two faint wooden ticks, the second higher. | `clave` |
| Many borders per second | Faint continuous wooden patter. | `clave` |
| Coast, into sea | Faint wave wash. | `wave` |
| Coast, onto land | Faint, muffled hand-drum touch. | `framedrum` |
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
| border | 12, 40, 12 |
| coast | 30 |
| noData | 5, 30, 5, 30, 5 |
| timeStep | 8 |
| accent | 10 |
| test | 40, 60, 40 |
