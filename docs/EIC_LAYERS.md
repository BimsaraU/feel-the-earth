# EIC layers

Stage 2 data. Built by `pipeline/build_eic.py` from NASA Scientific Visualization Studio (SVS) pages made for the
Earth Information Center, served from `public/data/eic/` (about 9 MB, works offline). `src/data/eic.ts` reads them.
If the manifest cannot load, the app falls back to labelled DEMO DATA (`src/data/fixture.ts`).

The SVS pages publish movies and frames, not data files, so values are recovered from pixels and are as good as
the visualisation: colour-bar inversion for sea temperature, "index" units elsewhere.

| Key | Layer | Source | Time | Grid | Value | Method |
|---|---|---|---|---|---|---|
| 1 | Sea surface temperature | [SVS 3912](https://svs.gsfc.nasa.gov/3912/), ECCO2 model, `ecco2_sst_flow.m4v` (640 x 320) + `flat_ecco2_dates.txt` | daily, 2007-03-25 .. 2008-03-03 (345 days) | 1° | 0 .. 32 °C | Streak colours matched to the nearest hue on `sst_ecco2_cbar.png`; all frames of a day averaged; gaps filled from the ±3-day mean, then neighbours up to 3°, ocean only |
| 2 | Lightning | [SVS 5011](https://svs.gsfc.nasa.gov/5011/), ISS LIS, SOS movie `iss_lightning_sos_yearly_07312023_2048p60.mp4` + `labels.txt` | one frame per 10 days, 2017-03-01 .. 2023-07-30 (234) | 1° | index 0 .. 0.4 | Share of each cell covered by yellow lightning dots (10-day roving window in the source) |
| 3 | Night lights | [SVS 5313](https://svs.gsfc.nasa.gov/5313/), Black Marble, EIC movie (7680 x 2160) | annual, 2012 .. 2023 (12) | 0.5° | index 0 .. 0.6 | Brightness above the basemap (basemap land < 35/255, grey snow excluded) |
| 4 | Night light change 2012 → 2023 | same movie, change sequence | one map | 0.5° | index −0.6 .. +0.6 | Purple (new lights) minus orange (lights out), where lit |

Geo-registration: every source is fitted against Natural Earth land (longitude of the left edge, latitude of
top and bottom) and reports the agreement: SST 0.95, night lights 0.90, lightning full globe by the SOS format.

Known issues in the sources:
- `labels.txt` for the lightning movie says 2003 after 2022-12-31; the movie ends 2023-07-31, so those labels are read as 2023.
- The night-lights EIC frame shows two copies of the world side by side; the left copy is used. Year frames were
  picked from the on-screen year labels (frame 5 + 17.5 per year).
- Records do not overlap in time for sea temperature (2007-08) and the other layers (2012-23). Turning a layer
  on moves the date into its record and says so.
