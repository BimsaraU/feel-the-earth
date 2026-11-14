"""Stage 2: turn NASA SVS / EIC visualisations into value grids the app can sonify.

Run once with network: python pipeline/build_eic.py   (about 400 MB of downloads, cached in .cache/svs)
Needs: numpy, pillow, imageio-ffmpeg.

The SVS pages publish movies, not data files, so values are recovered from the pixels:
  * Sea surface temperature (SVS 3912, ECCO2 model, 2007-03-25 .. 2008-03-03): flow streaks coloured by a
    0-32 °C rainbow colour bar. Colour -> temperature by nearest hue on the published colour bar.
  * Lightning (SVS 5011, ISS LIS, 2017-03 .. 2023-07, 10-day roving window): yellow dots on a grey map.
    Value = share of each cell covered by lightning dots (relative density index, 0..1).
  * Night lights (SVS 5313, Black Marble annual composites 2012 .. 2023): brightness above the basemap.
  * Night-light change 2012 -> 2023 (SVS 5313): orange (lights out) .. white .. purple (new lights), -1..1.
Every frame is geo-registered against Natural Earth coastlines (fit of longitude offset and latitude span).

Output: public/data/eic/manifest.json and one PNG atlas per layer (frames stacked vertically, 8-bit:
0 = no data, 1..255 = min..max linearly).
"""
import json, re, subprocess, urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
from PIL import Image
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "svs"
OUT = ROOT / "public" / "data" / "eic"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VIS = "https://svs.gsfc.nasa.gov/vis/a000000"

SRC = {
    "sst_movie": f"{VIS}/a003900/a003912/ecco2_sst_flow.m4v",
    "sst_dates": f"{VIS}/a003900/a003912/flat_ecco2_dates.txt",
    "sst_cbar": f"{VIS}/a003900/a003912/sst_ecco2_cbar.png",
    "lightning_movie": f"{VIS}/a005000/a005011/iss_lightning_sos_yearly_07312023_2048p60.mp4",
    "lightning_labels": f"{VIS}/a005000/a005011/labels.txt",
    "lights_movie": f"{VIS}/a005300/a005313/nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4",
}


def fetch(key):
    p = CACHE / SRC[key].rsplit("/", 1)[1]
    if not p.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(SRC[key], headers={"User-Agent": "feel-the-earth-pipeline/0.2"})
        p.write_bytes(urllib.request.urlopen(req).read())
    return p


def frames(movie, w, h, select=None):
    """Yield (index, HxWx3 uint8) frames scaled to w x h. select: frame indices to keep (decoding streams past the rest)."""
    keep = None if select is None else set(select)
    cmd = [FFMPEG, "-v", "error", "-nostdin", "-i", str(movie), "-vf", f"scale={w}:{h}:flags=area",
           "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    k, last = 0, max(keep) if keep else None
    while True:
        buf = p.stdout.read(w * h * 3)
        if len(buf) < w * h * 3 or (last is not None and k > last):
            break
        if keep is None or k in keep:
            yield k, np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        k += 1
    p.kill()


# ---------- geo registration against Natural Earth ----------

def ne_land(res):
    meta = json.loads((ROOT / "public/data/geo/meta.json").read_text())
    g = np.fromfile(ROOT / "public/data/geo/grid.bin", np.uint8)[: meta["width"] * meta["height"]].reshape(meta["height"], meta["width"]) > 0
    k = int(round(res / meta["res"]))
    return g.reshape(g.shape[0] // k, k, g.shape[1] // k, k).mean(axis=(1, 3)) > 0.5


def register(land_px):
    """Fit lon of the left edge and lat of top/bottom edges so the image land mask matches Natural Earth (1 degree)."""
    ref = ne_land(1.0)
    h, w = land_px.shape
    best = (-1, None)
    for top in np.arange(70, 90.01, 1.0):
        for bot in np.arange(-90, -50, 1.0):
            # resample image rows to 1-degree latitudes inside [bot, top]
            lats = 89.5 - np.arange(180)
            inside = (lats <= top) & (lats >= bot)
            rows = ((top - lats[inside]) / (top - bot) * h).astype(int).clip(0, h - 1)
            cols = ((np.arange(360) + 0.5) / 360 * w).astype(int)
            img = land_px[np.ix_(rows, cols)]
            for shift in range(-30, 31):
                r = np.roll(ref[inside], shift, axis=1)
                score = (img == r).mean()
                if score > best[0]:
                    best = (score, (float(top), float(bot), -180.0 - shift))  # roll right by shift = image starts shift degrees west
    print("  registration agreement", round(best[0], 3), "top, bottom, left lon =", best[1])
    return best[1]


def to_grid(img_vals, valid, geo, res, reducer="mean"):
    """Equirectangular image (geo = top, bottom, left lon) -> res-degree global grid, NaN where no data."""
    top, bot, left = geo
    h, w = img_vals.shape
    W, H = int(360 / res), int(180 / res)
    ys, xs = np.nonzero(valid)
    lat = top - (ys + 0.5) / h * (top - bot)
    lon = ((left + (xs + 0.5) / w * 360) + 180) % 360 - 180
    r = ((90 - lat) / res).astype(int).clip(0, H - 1)
    c = ((lon + 180) / res).astype(int).clip(0, W - 1)
    s = np.zeros((H, W)); n = np.zeros((H, W))
    np.add.at(s, (r, c), img_vals[ys, xs]); np.add.at(n, (r, c), 1)
    out = np.where(n > 0, s / np.maximum(n, 1), np.nan)
    if reducer == "density":  # share of all image pixels in the cell that were valid
        tot = np.zeros((H, W)); ys2, xs2 = np.mgrid[0:h, 0:w]
        lat2 = top - (ys2 + 0.5) / h * (top - bot)
        r2 = ((90 - lat2) / res).astype(int).clip(0, H - 1)
        c2 = (((((left + (xs2 + 0.5) / w * 360) + 180) % 360 - 180) + 180) / res).astype(int).clip(0, W - 1)
        np.add.at(tot, (r2, c2), 1)
        out = np.where(tot > 0, s / np.maximum(tot, 1), np.nan)
        lat_rows = 90 - (np.arange(H) + 0.5) * res
        out[(lat_rows > top) | (lat_rows < bot)] = np.nan
    return out


def hsv(rgb):
    x = rgb.astype(np.float32) / 255
    mx, mn = x.max(-1), x.min(-1)
    d = mx - mn + 1e-6
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    hue = np.where(mx == r, (g - b) / d % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return hue, d / (mx + 1e-6), mx


# ---------- layers ----------

def build_sst():
    movie, dates, cbar = fetch("sst_movie"), fetch("sst_dates"), fetch("sst_cbar")
    bar = np.asarray(Image.open(cbar).convert("RGB"))
    # Colour bar strip: find the rows/cols of the saturated ramp, ticks 0..32 °C at its ends.
    hb, sb, vb = hsv(bar)
    ramp = (sb > 0.5) & (vb > 0.3)  # saturated and not the black frame
    row = int(np.argmax(ramp.sum(1)))
    cols = np.nonzero(ramp[row])[0]
    ramp_hue = hb[row, cols[0]:cols[-1] + 1]
    ramp_val = np.linspace(0, 32, len(ramp_hue))
    when = [datetime.strptime(l.split()[1], "%Y-%m-%dT%H:%MZ").date() for l in dates.read_text().split("\n") if l.strip()]

    W, H = 640, 320
    land_votes = np.zeros((H, W))
    day_sum, day_n, out = {}, {}, {}
    for i, f in frames(movie, W, H):
        if i >= len(when):
            break
        hue, sat, val = hsv(f)
        ok = (sat > 0.35) & (val > 0.15)
        # nearest colour-bar hue -> temperature (hue falls monotonically from blue to red along the bar)
        dh = np.abs(hue[..., None] - ramp_hue[None, None, ::4])
        idx = np.minimum(dh, 360 - dh).argmin(-1) * 4  # hue is circular: 355 deg is next to red 0 deg
        t = ramp_val[idx.clip(0, len(ramp_val) - 1)]
        land_votes += (sat < 0.12) & (val > 0.25) & (val < 0.5)  # flat grey land
        d = when[i]
        day_sum.setdefault(d, []).append((np.where(ok, t, 0), ok))
    land = land_votes / max(1, len(when)) > 0.5
    print("SST frames", len(when), "days", len(day_sum))
    geo = register(land)
    days = sorted(day_sum)
    D = []
    for d in days:
        s = sum(a for a, _ in day_sum[d]); n = sum(b.astype(float) for _, b in day_sum[d])
        D.append(to_grid(np.where(n > 0, s / np.maximum(n, 1), 0), n > 0, geo, 1.0))
    D = np.array(D)
    # Streaks cover only part of the ocean each day. Fill gaps (ocean only, Natural Earth mask) from the
    # +-3 day mean, then from neighbouring cells up to 3 degrees away. Interpolation, logged in DECISIONS.
    ocean = ~ne_land(1.0)
    k = np.ones(7) / 7
    with np.errstate(invalid="ignore"):
        S = np.apply_along_axis(lambda x: np.convolve(np.nan_to_num(x), k, "same"), 0, D)
        N = np.apply_along_axis(lambda x: np.convolve(~np.isnan(x), k, "same"), 0, D)
        D = np.where(np.isnan(D) & (N > 0), S / np.maximum(N, 1e-9), D)
        for _ in range(3):
            P = np.pad(D, ((0, 0), (1, 1), (1, 1)), mode="wrap")
            nb = np.stack([P[:, 1 + dy:P.shape[1] - 1 + dy, 1 + dx:P.shape[2] - 1 + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)])
            D = np.where(np.isnan(D), np.nanmean(nb, 0), D)
    D[:, ~ocean] = np.nan
    print("  SST ocean coverage after fill", round(float(np.mean(~np.isnan(D[:, ocean]))), 3))
    grids = list(zip(days, D))
    return dict(id="sst", name="Sea surface temperature", unit="°C", unitSpoken="degrees Celsius", min=0, max=32, scale="linear",
                res=1.0, cadence="daily",
                sourceText="NASA SVS 3912 (Greg Shirah), ECCO2 model surface currents coloured by temperature. Values recovered from the visualisation colours, averaged per day on a 1 degree grid.",
                page="https://svs.gsfc.nasa.gov/3912/"), grids


def build_lightning():
    movie, labels = fetch("lightning_movie"), fetch("lightning_labels")
    lab = [datetime.strptime(l.strip(), "%d %b %Y %H:%M").date() for l in labels.read_text().splitlines() if l.strip()]
    # The published label file says 2003 after 2022-12-31; the movie runs to 2023-07-31, so read those as 2023.
    lab = [d.replace(year=2023) if d.year == 2003 else d for d in lab]
    # Keep one frame per 10 days, only where the labels run forward through 2017-03 .. 2023-07.
    pick, nxt = [], date(2017, 3, 1)
    for i, d in enumerate(lab):
        if date(2017, 3, 1) <= d <= date(2023, 7, 31) and d >= nxt:
            pick.append((i, d)); nxt = d + timedelta(days=10)
    W, H = 1024, 512
    sel = [i for i, _ in pick]
    out, land = [], None
    for k, (i, f) in enumerate(frames(movie, W, H, sel)):
        f = f.astype(np.int16)
        yellow = ((f[..., 0] + f[..., 1]) / 2 - f[..., 2]) > 60  # dots are yellow; the basemap is grey
        if land is None:
            # Science On a Sphere movies are full equirectangular globes; the fit only confirms the longitude.
            lum = f.mean(-1)
            land = lum > 45
            geo = (90.0, -90.0, register(land)[2])
        out.append((pick[k][1], to_grid(yellow.astype(float), yellow, geo, 1.0, reducer="density")))
    print("lightning frames", len(out))
    return dict(id="lightning", name="Lightning", unit="index", unitSpoken="on a lightning density index from 0 to 1", min=0, max=0.4, scale="linear",
                res=1.0, cadence="10-day",
                sourceText="NASA SVS 5011 (Michala Garrison), ISS Lightning Imaging Sensor, 10-day roving window. Value is the share of each 1 degree cell covered by lightning dots in the visualisation (relative, not flashes per km²).",
                page="https://svs.gsfc.nasa.gov/5011/"), out


def build_lights():
    movie = fetch("lights_movie")
    year_frame = {y: int(round(5 + 17.5 * (y - 2012))) for y in range(2012, 2024)}
    change_frame = 450
    sel = sorted(list(year_frame.values()) + [change_frame])
    # The EIC frame (7680 x 2160) holds two copies of the world side by side; use the left copy.
    W, H = 3840, 1080
    got = {i: f[:, : W // 2] for i, f in frames(movie, W, H, sel)}
    W //= 2
    geo = register(got[year_frame[2012]].astype(np.int16).mean(-1) > 10)
    # Mask the colour bar (change frame, right edge of the left copy, over the open Pacific).
    mask = np.ones((H, W), bool)
    cmask = mask.copy(); cmask[int(H * 0.5):int(H * 0.64), int(W * 0.95):] = False
    lights = []
    for y, i in year_frame.items():
        f = got[i].astype(np.float32)
        lum = f.mean(-1)
        snow = (lum < 110) & (np.abs(f[..., 0] - f[..., 2]) < 6)  # neutral grey ice and snow of the basemap
        v = np.where(snow, 0, np.clip((lum - 40) / 215, 0, 1))  # basemap land stays below ~35
        lights.append((date(y, 7, 1), to_grid(v, mask, geo, 0.5)))
    f = got[change_frame].astype(np.float32)
    # Purple (blue above red) = new lights, orange (red above blue) = lights out; dark areas = no light, no change.
    signed = np.where(f.mean(-1) > 40, np.clip((f[..., 2] - f[..., 0]) / 128, -1, 1), 0)
    change = to_grid(signed, cmask, geo, 0.5)
    print("lights years", len(lights))
    common = dict(res=0.5, page="https://svs.gsfc.nasa.gov/5313/")
    return (dict(id="lights", name="Night lights", unit="index", unitSpoken="on a brightness index from 0 to 1", min=0, max=0.6, scale="linear",
                 cadence="annual",
                 sourceText="NASA SVS 5313 (Kel Elkins), Black Marble annual night lights 2012-2023. Value is brightness above the basemap in the visualisation (relative).", **common), lights), \
           (dict(id="lightschange", name="Night light change 2012 to 2023", unit="index", unitSpoken="on a scale from minus 1, lights out, to plus 1, new lights", min=-0.6, max=0.6, scale="linear",
                 cadence="static",
                 sourceText="NASA SVS 5313 (Kel Elkins), Black Marble change 2012 to 2023: orange lights out, purple new lights. Value recovered from the visualisation colours (relative).", **common), [(date(2023, 1, 1), change)])


def write(layer, grids):
    OUT.mkdir(parents=True, exist_ok=True)
    lo, hi = layer["min"], layer["max"]
    q = []
    for d, g in grids:
        k = np.where(np.isnan(g), 0, np.round(1 + (np.clip(g, lo, hi) - lo) / (hi - lo) * 254)).astype(np.uint8)
        q.append(k)
    per = max(1, 4096 // q[0].shape[0])  # frames per atlas image (keeps PNGs <= 4096 px tall)
    files = []
    for a in range(0, len(q), per):
        name = f"{layer['id']}_{a // per:02d}.png"
        Image.fromarray(np.vstack(q[a:a + per])).save(OUT / name, optimize=True)
        files.append(name)
    layer.update(width=q[0].shape[1], height=q[0].shape[0], perAtlas=per, atlases=files,
                 dates=[d.isoformat() for d, _ in grids])
    print(layer["id"], len(q), "frames", sum((OUT / f).stat().st_size for f in files) // 1024, "kB")
    return layer


def main(which):
    """python pipeline/build_eic.py [sst] [lights] [lightning]  (default: all). Updates the manifest in place."""
    mf = OUT / "manifest.json"
    layers = {l["id"]: l for l in json.loads(mf.read_text())["layers"]} if mf.exists() else {}
    if "sst" in which:
        layers["sst"] = write(*build_sst())
    if "lights" in which:
        a, b = build_lights(); layers["lights"] = write(*a); layers["lightschange"] = write(*b)
    if "lightning" in which:
        layers["lightning"] = write(*build_lightning())
    order = ["sst", "lightning", "lights", "lightschange"]
    mf.write_text(json.dumps({"generated": date.today().isoformat(), "layers": [layers[k] for k in order if k in layers]}, indent=1))


if __name__ == "__main__":
    import sys
    main(sys.argv[1:] or ["sst", "lights", "lightning"])
