# EIC layers

Stage 1 ships only DEMO DATA (`src/data/fixture.ts`). Stage 2 replaces `source` in `src/data/index.ts`
with a real `DataSource`; nothing else changes.

| Key | Layer id | Demo unit and range | Stage 2 candidate (to confirm against the EIC catalogue) |
|---|---|---|---|
| 1 | temperature | °C, -50 to 45 | Surface air temperature (e.g. MERRA-2 T2M) |
| 2 | wind | m/s, 0 to 30 | 10 m wind speed (e.g. MERRA-2 U10M/V10M) |
| 3 | precipitation | mm/day, 0.1 to 60, log | IMERG daily precipitation |
| 4 | co2 | ppm, 395 to 435 | OCO-2 XCO2 |
| 5 | co | ppb, 40 to 300 | MOPITT or TROPOMI CO |
| 6 | no2 | µmol/m², 1 to 300, log | OMI or TROPOMI tropospheric NO2 |
| 7 | o3 | DU, 120 to 480 | OMI total column ozone |
| 8 | pm25 | µg/m³, 1 to 200, log | MERRA-2 surface PM2.5 |

The products above are placeholders for planning. None of them has been fetched or verified in Stage 1.
Each real source must fill `LayerInfo` (`id, name, unit, min, max, scale, timeRange, resolutionDeg, cadence, sourceText`)
and set `demo: false`.
