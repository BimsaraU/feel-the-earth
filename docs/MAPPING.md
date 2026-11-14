# Sound mapping

Generated from `src/audio/mapping.ts` by `npm run mapping`. Do not edit by hand.
Every sound traces to a data value. Transport: 72 bpm, key D (settings change tempo and key), 4-bar loop, one chord per bar.
Spans read "at layer minimum → at layer maximum" of the window mean.

## Layers

| Key | Layer | Range | Scale | Voice | Role | MIDI register | High-pass Hz | Low-pass Hz | Resonance Q | Texture dB | Dangerous when | Meaning |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Sea surface temperature | 0 to 32 °C | linear | cello | melody | 45-69 | 240 → 60 | 9000 → 2400 | 0.7 |  | high (t 0.86 → 0.97): marine heat | Louder means warmer water; cold water sounds thin and icy, warm water dark and full. |
| 2 | Lightning | 0 to 0.4 index | linear | glock | color | 79-98 | 900 | 7000 → 12000 | 0.7 | rain -44 → -16 | high (t 0.3 → 0.75): thunderstorms | Each bright strike is a lightning hot spot; more strikes and louder rain mean more lightning. |
| 3 | Night lights | 0 to 0.6 index | linear | harp | arp | 62-86 | 200 | 3500 → 9000 | 0.7 |  | high (t 2 → 3): none | More and brighter harp notes mean more night light from towns and cities. |
| 4 | Night light change 2012 to 2023 | -0.6 to 0.6 index | linear | clarinet | pad | 50-67 | 150 | 1200 → 5000 | 0.7 |  | high (t 2 → 3): none | Bright and loud means new lights since 2012; dark and quiet means lights went out. |
| 5 | Carbon dioxide | 390 to 405 ppm | linear | cello | bass | 38-55 | 40 | 700 → 2200 | 0.7 → 1.4 |  | high (t 0.7 → 0.95): high carbon dioxide | A deep held bass; louder and more growling means more carbon dioxide in the air. |
| 6 | Air temperature | 201 to 319 K | linear | clarinet | melody | 55-76 | 300 → 120 | 2500 → 7000 | 0.7 |  | high (t 0.86 → 0.97): extreme heat | Louder and brighter clarinet means warmer air near the surface. |
| 7 | Precipitation | 0 to 20 mm/day | linear | harp | arp | 64-88 | 300 | 3000 → 8000 | 0.7 | rain -50 → -18 | high (t 0.7 → 0.95): very heavy rain | More harp notes and louder rain mean more rainfall that month. |
| 8 | Vegetation | -0.03 to 0.98 NDVI | linear | cello | pad | 50-69 | 200 → 80 | 1200 → 6000 | 0.7 |  | high (t 2 → 3): none | Fuller, brighter chords mean greener, denser vegetation; thin chords mean bare ground. |
| 9 | Aerosols | 0 to 0.9 AOD | linear | glock | pulse | 72-91 | 600 | 9000 → 1500 | 0.7 |  | high (t 0.45 → 0.85): hazy, polluted air | A steady pulse that gets louder and more muffled as the air gets hazier. |

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
| Land elevation | Land ambience: a deep, warm earth rumble; mountain wind joins only above about 600 m and grows to 3,000 m. |
| No data | That layer is silent on that beat (no stand-in sound). |
| Direction of travel | While the window moves the whole mix leans left or right with east-west travel and gets brighter going north, darker going south; the whoosh pans with it. |
| Value under the window centre, while moving (terrain probe) | A held tone on a 16-rung pentatonic ladder, height 40 % from the layer range and 60 % from the range of the neighbourhood. Each rung crossed is re-struck with a haptic tick: uphill is a rising run, downhill a falling one. The music steps back 5 dB while you move. |
| Slope at the centre | The probe tone sits in the uphill direction (HRTF: north ahead, east right), further out the steeper the slope, and brightens with the rate of change. |
| Highest and lowest value within 1.25 window widths | Beacons at their true bearing: peak = two rising high notes, valley = two falling low notes; pings get faster and louder as you approach. B speaks where they are. |

## Events

| Event | Sound | Sample slot |
|---|---|---|
| Peak reached | Bright bell, value spoken. | `smallbell` |
| Valley reached | Deep muffled drum, value spoken. | `framedrum` |
| Dial step / end stop | Dry click per step, higher going up; dull thud at the end of the range. | `clave` |
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
| timeStep | 8 |
| accent | 10 |
| test | 40, 60, 40 |
| tick | 6 |
