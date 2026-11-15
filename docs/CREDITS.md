# Credits

Every audio file and dataset shipped in this app, with source URL and licence.
Audio files are trimmed, faded, peak-normalised to -3 dBFS, mixed to mono and encoded as 96 kbps MP3
by `scripts/prepare_audio.py`. Geodata is rasterised by `scripts/build_geo.py`.

## Datasets

| File | Source | Licence |
|---|---|---|
| `public/data/geo/grid.bin`, `meta.json`, `countries.geojson` | Natural Earth 1:50m Admin 0 Countries, [ne_50m_admin_0_countries.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson), https://www.naturalearthdata.com/ | Public domain |
| `public/data/geo/grid.bin` (sea names) | Natural Earth 1:50m Marine Areas, [ne_50m_geography_marine_polys.geojson](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_geography_marine_polys.geojson) | Public domain |
| `public/tiles/**` | NASA Earth Observatory (Reto Stöckli, NASA GSFC), Blue Marble "Whole world - land and oceans", [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Whole_world_-_land_and_oceans.jpg) | Public domain (NASA) |
| `public/data/geo/elevation.bin` | NOAA NCEI ETOPO5 5-minute global relief, https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO5/ | Public domain (US Government) |
| `public/data/eic/sst_*.png` | NASA SVS 3912 "Global Sea Surface Currents and Temperature" (Greg Shirah), ECCO2 model, https://svs.gsfc.nasa.gov/3912/ | NASA media, public domain; credit NASA/Goddard Space Flight Center Scientific Visualization Studio |
| `public/data/eic/lightning_*.png` | NASA SVS 5011 "Lightning Events Detected from the ISS 2017-2023" (Michala Garrison), https://svs.gsfc.nasa.gov/5011/ | NASA media, public domain; credit NASA SVS |
| `public/data/eic/lights_*.png`, `lightschange_*.png` | NASA SVS 5313 "Change in Night Lights between 2012 and 2023 - EIC Version" (Kel Elkins), https://svs.gsfc.nasa.gov/5313/ | NASA media, public domain; credit NASA SVS |
| Fixture values (tests, offline fallback only) | **DEMO DATA**, generated in `src/data/fixture.ts`. Not NASA data. | Project code |

## Software

| Package | Licence |
|---|---|
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause |
| [Tone.js](https://github.com/Tonejs/Tone.js) | MIT |
| [React](https://react.dev) | MIT |
| [zustand](https://github.com/pmndrs/zustand) | MIT |
| [vite-plugin-pwa / Workbox](https://github.com/vite-pwa/vite-plugin-pwa) | MIT |
| [GSAP](https://gsap.com) | GSAP Standard License (no-charge, includes commercial use) |
| [Fraunces](https://github.com/undercasetype/Fraunces) via @fontsource-variable | SIL Open Font License 1.1 |
| [Outfit](https://github.com/Outfitio/Outfit-Fonts) via @fontsource-variable | SIL Open Font License 1.1 |

## Audio

Instrument samples: **VSCO 2 Community Edition** by Versilian Studios, https://github.com/sgossner/VSCO-2-CE (CC0 1.0).
The upright piano (`piano/*`, used as the felt-piano no-data pulse) is VSCO-2-CE "Upright Nr1", pp layer.

Field recordings and percussion from Wikimedia Commons are credited per file below. The singing bowl
recording is CC BY-SA 4.0: our trimmed file `oneshots/singingbowl.mp3` is a derivative and is shared under the same licence.
`oneshots/whoosh.mp3` and `oneshots/oceanbed.mp3` are further slices of the same ocean recording as `oneshots/wave.mp3` (see DECISIONS.md).

| File | Source | Licence |
|---|---|---|
| `public/audio/cello/A2.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_A2_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_A2_v3_1.wav) | CC0 1.0 |
| `public/audio/cello/B3.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_B3_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_B3_v3_1.wav) | CC0 1.0 |
| `public/audio/cello/C3.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_C3_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_C3_v3_1.wav) | CC0 1.0 |
| `public/audio/cello/D2.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_D2_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_D2_v3_1.wav) | CC0 1.0 |
| `public/audio/cello/D4.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_D4_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_D4_v3_1.wav) | CC0 1.0 |
| `public/audio/cello/E3.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_E3_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_E3_v3_1.wav) | CC0 1.0 |
| `public/audio/cello/F2.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_F2_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_F2_v3_1.wav) | CC0 1.0 |
| `public/audio/cello/F4.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_F4_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_F4_v3_1.wav) | CC0 1.0 |
| `public/audio/cello/G3.mp3` | [VSCO-2-CE Strings/Cello Section/susvib/susvib_G3_v3_1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Cello%20Section/susvib/susvib_G3_v3_1.wav) | CC0 1.0 |
| `public/audio/harp/A4.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_A4_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_A4_mf.wav) | CC0 1.0 |
| `public/audio/harp/B3.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_B3_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_B3_mf.wav) | CC0 1.0 |
| `public/audio/harp/B5.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_B5_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_B5_mf.wav) | CC0 1.0 |
| `public/audio/harp/C3.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_C3_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_C3_mf.wav) | CC0 1.0 |
| `public/audio/harp/C5.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_C5_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_C5_mf.wav) | CC0 1.0 |
| `public/audio/harp/D4.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_D4_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_D4_mf.wav) | CC0 1.0 |
| `public/audio/harp/D6.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_D6_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_D6_mf.wav) | CC0 1.0 |
| `public/audio/harp/E3.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_E3_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_E3_mf.wav) | CC0 1.0 |
| `public/audio/harp/E5.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_E5_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_E5_mf.wav) | CC0 1.0 |
| `public/audio/harp/F4.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_F4_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_F4_mf.wav) | CC0 1.0 |
| `public/audio/harp/F6.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_F6_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_F6_mf.wav) | CC0 1.0 |
| `public/audio/harp/G3.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_G3_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_G3_mf.wav) | CC0 1.0 |
| `public/audio/harp/G5.mp3` | [VSCO-2-CE Strings/Harp/KSHarp_G5_mf.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Harp/KSHarp_G5_mf.wav) | CC0 1.0 |
| `public/audio/clarinet/As2.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_A#2_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A#2_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/As3.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_A#3_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A#3_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/As4.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_A#4_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_A#4_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/D2.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_D2_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D2_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/D3.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/D4.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_D4_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D4_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/D5.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_D5_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_D5_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/Fs5.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_F#5_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F#5_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/F2.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_F2_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F2_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/F3.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/clarinet/F4.mp3` | [VSCO-2-CE Woodwinds/Clarinet/susLong/DCClar_susLong_F4_v3_rr1_sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Woodwinds/Clarinet/susLong/DCClar_susLong_F4_v3_rr1_sum.wav) | CC0 1.0 |
| `public/audio/glock/C5.mp3` | [VSCO-2-CE Percussion/Glock/glock_medium_C5.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_C5.wav) | CC0 1.0 |
| `public/audio/glock/C6.mp3` | [VSCO-2-CE Percussion/Glock/glock_medium_C6.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_C6.wav) | CC0 1.0 |
| `public/audio/glock/G4.mp3` | [VSCO-2-CE Percussion/Glock/glock_medium_G4.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_G4.wav) | CC0 1.0 |
| `public/audio/glock/G5.mp3` | [VSCO-2-CE Percussion/Glock/glock_medium_G5.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_G5.wav) | CC0 1.0 |
| `public/audio/glock/G6.mp3` | [VSCO-2-CE Percussion/Glock/glock_medium_G6.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Glock/glock_medium_G6.wav) | CC0 1.0 |
| `public/audio/piano/C2.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_C2_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C2_pp_RR1.wav) | CC0 1.0 |
| `public/audio/piano/C3.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_C3_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C3_pp_RR1.wav) | CC0 1.0 |
| `public/audio/piano/C4.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_C4_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C4_pp_RR1.wav) | CC0 1.0 |
| `public/audio/piano/C5.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_C5_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C5_pp_RR1.wav) | CC0 1.0 |
| `public/audio/piano/C6.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_C6_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_C6_pp_RR1.wav) | CC0 1.0 |
| `public/audio/piano/G2.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_G2_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G2_pp_RR1.wav) | CC0 1.0 |
| `public/audio/piano/G3.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_G3_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G3_pp_RR1.wav) | CC0 1.0 |
| `public/audio/piano/G4.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_G4_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G4_pp_RR1.wav) | CC0 1.0 |
| `public/audio/piano/G5.mp3` | [VSCO-2-CE Keys/Upright Nr1/UR1_G5_pp_RR1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Keys/Upright%20Nr1/UR1_G5_pp_RR1.wav) | CC0 1.0 |
| `public/audio/oneshots/clave.mp3` | [VSCO-2-CE Percussion/Claves1_Hit_v2_rr1_Sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Claves1_Hit_v2_rr1_Sum.wav) | CC0 1.0 |
| `public/audio/oneshots/framedrum.mp3` | [VSCO-2-CE Percussion/Tumba-HitN_v1_rr1_Sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Tumba-HitN_v1_rr1_Sum.wav) | CC0 1.0 |
| `public/audio/oneshots/smallbell.mp3` | [VSCO-2-CE Percussion/Triangle6-HitM_v1_rr1_Sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Triangle6-HitM_v1_rr1_Sum.wav) | CC0 1.0 |
| `public/audio/oneshots/gong.mp3` | [VSCO-2-CE Percussion/gongHit_p.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/gongHit_p.wav) | CC0 1.0 |
| `public/audio/oneshots/cymbal.mp3` | [VSCO-2-CE Percussion/cymbal-crash1_mp_rr1.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/cymbal-crash1_mp_rr1.wav) | CC0 1.0 |
| `public/audio/oneshots/ratchet.mp3` | [VSCO-2-CE Percussion/Ratchet1-Slow_v1_rr1_Sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Ratchet1-Slow_v1_rr1_Sum.wav) | CC0 1.0 |
| `public/audio/oneshots/thump.mp3` | [VSCO-2-CE Percussion/BDrumNewhit_v1_rr1_Sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/BDrumNewhit_v1_rr1_Sum.wav) | CC0 1.0 |
| `public/audio/oneshots/singingbowl.mp3` | [Tibetan_Singing_Bowl_hit_11inch.flac](https://commons.wikimedia.org/wiki/File:Tibetan_Singing_Bowl_hit_11inch.flac) by דג בלי מלח (Wikimedia Commons user) | CC BY-SA 4.0 |
| `public/audio/oneshots/wave.mp3` | [Oceanwavescrushing.ogg](https://commons.wikimedia.org/wiki/File:Oceanwavescrushing.ogg) by Luftrum | CC BY 3.0 |
| `public/audio/oneshots/whoosh.mp3` | [Oceanwavescrushing.ogg](https://commons.wikimedia.org/wiki/File:Oceanwavescrushing.ogg) by Luftrum | CC BY 3.0 |
| `public/audio/oneshots/windchime.mp3` | [Windchimes.ogg](https://commons.wikimedia.org/wiki/File:Windchimes.ogg) by Esc861 | Public domain |
| `public/audio/oneshots/oceanbed.mp3` | [Oceanwavescrushing.ogg](https://commons.wikimedia.org/wiki/File:Oceanwavescrushing.ogg) by Luftrum | CC BY 3.0 |
| `public/audio/oneshots/landbed.mp3` | [Gentle breeze and birds singing.ogg](https://commons.wikimedia.org/wiki/File:Gentle_breeze_and_birds_singing.ogg) by ezwa | Public domain |
| `public/audio/oneshots/windbed.mp3` | [Howling wind.ogg](https://commons.wikimedia.org/wiki/File:Howling_wind.ogg) by Tvabutzku1234 | CC0 1.0 |
| `public/audio/oneshots/rain.mp3` | [Falling Rain SFX 1 2016-11-19.oga](https://commons.wikimedia.org/wiki/File:Falling_Rain_SFX_1_2016-11-19.oga) by valvalion | CC BY 3.0 |
| `public/audio/oneshots/timpani.mp3` | [VSCO-2-CE Percussion/Timpani/Timpani2_Hit_v3_rr1_Sum.wav](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Percussion/Timpani/Timpani2_Hit_v3_rr1_Sum.wav) | CC0 1.0 |
| `public/audio/cellotrem/*.mp3` | VSCO-2-CE Strings/Cello Section/trem/* (https://github.com/sgossner/VSCO-2-CE) | CC0 1.0 |

## Narration

Welcome and tour voice (public/audio/narration) and JODI's live speech: generated with Fish Audio (fish.audio), public voice
models (Sarah by default; the choices are in src/assist/voices.ts). Script: src/assist/narration.json; build: scripts/build_narration.mjs.
