"""Stage 3: more NASA layers from GIBS (the imagery service behind Worldview and the Earth Information Center).

Run once with network: python pipeline/build_gibs.py [layer ids...]   (default: all; cached in .cache/gibs)
Needs: numpy, pillow.

Unlike the SVS movies, GIBS publishes a colour map for every layer (colormaps/v1.3/<layer>.xml) that maps each
exact RGB colour to a value range, so values are recovered exactly (bin midpoints), not by nearest hue.
Each month is fetched as a 0.5 degree WMS image (nearest-neighbour colours), decoded and averaged to 1 degree.
Output: appended to public/data/eic/manifest.json with build_eic.write (same atlas format).
"""
import io, json, re, sys, time, urllib.request
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from build_eic import OUT, write  # noqa: E402

CACHE = Path(__file__).resolve().parent.parent / ".cache" / "gibs"
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
CMAP = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/{}.xml"

# id, GIBS layer, name, unit, unitSpoken, first month, last month, sourceText
LAYERS = [
    ("co2", "AIRS_L3_Carbon_Dioxide_AIRS_AMSU_Monthly", "Carbon dioxide", "ppm", "parts per million", "2010-01", "2012-02",
     "NASA AIRS/AMSU (Aqua) mid-troposphere CO2, monthly, via NASA GIBS. Values from the published GIBS colour map."),
    ("airtemp", "AIRS_L3_Surface_Air_Temperature_Monthly_Day", "Air temperature", "K", "kelvin", "2007-01", "2023-12",
     "NASA AIRS (Aqua) surface air temperature, daytime monthly mean, via NASA GIBS. Values from the published GIBS colour map."),
    ("precip", "MERRA2_Precipitation_Bias_Corrected_Monthly", "Precipitation", "mm/day", "millimetres per day", "2007-01", "2023-12",
     "NASA GMAO MERRA-2 bias-corrected precipitation, monthly, via NASA GIBS. Values from the published GIBS colour map."),
    ("ndvi", "MODIS_Terra_L3_NDVI_Monthly", "Vegetation", "NDVI", "on the vegetation index from minus 1 to 1", "2007-01", "2023-12",
     "NASA MODIS (Terra) NDVI, monthly, via NASA GIBS. Values from the published GIBS colour map."),
    ("aerosol", "MERRA2_Total_Aerosol_Optical_Thickness_550nm_Extinction_Monthly", "Aerosols", "AOD", "aerosol optical depth", "2007-01", "2023-12",
     "NASA GMAO MERRA-2 total aerosol optical thickness at 550 nm, monthly, via NASA GIBS. Values from the published GIBS colour map."),
]


def get(url, path):
    if not path.exists():
        for k in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "feel-the-earth-pipeline/0.3"})
                path.write_bytes(urllib.request.urlopen(req, timeout=60).read())
                break
            except Exception as e:  # flaky network: retry, then give up on this frame
                print("  retry", k, e)
                time.sleep(2 * (k + 1))
    return path.read_bytes() if path.exists() else None


# Colour map names differ from layer names (from WMTSCapabilities.xml).
CMAP_NAME = {"AIRS_L3_Carbon_Dioxide_AIRS_AMSU_Monthly": "AIRS_Carbon_Dioxide_AIRS_AMSU_Monthly",
             "AIRS_L3_Surface_Air_Temperature_Monthly_Day": "AIRS_Surface_Air_Temperature_Monthly_Day",
             "MODIS_Terra_L3_NDVI_Monthly": "MODIS_L3_NDVI"}


def colormap(layer):
    """RGB int -> value (bin midpoint); nodata and unbounded bins are skipped. Returns (lut, lo, hi, units)."""
    name = CMAP_NAME.get(layer, layer)
    xml = get(CMAP.format(name), CACHE / f"{name}.xml").decode()
    lut, mids = {}, []
    for m in re.finditer(r'<ColorMapEntry rgb="(\d+),(\d+),(\d+)"([^>]*)/>', xml):
        r, g, b, attrs = m.groups()
        val = re.search(r' value="[\[\(]([^,]*),([^\]\)]*)[\]\)]"', attrs)
        if 'nodata="true"' in attrs or not val:
            continue
        a, z = (float(x.replace("INF", "inf")) for x in val.groups())
        if not (np.isfinite(a) or np.isfinite(z)):
            continue
        v = (a + z) / 2 if np.isfinite(a) and np.isfinite(z) else (a if np.isfinite(a) else z)  # open bins: their edge
        lut[(int(r) << 16) | (int(g) << 8) | int(b)] = v
        mids.append(v)
    units = re.search(r'units="([^"]*)"', xml)
    return lut, float(np.percentile(mids, 1)), float(np.percentile(mids, 99)), units.group(1) if units else ""


def months(a, b):
    y, m = map(int, a.split("-"))
    while f"{y:04d}-{m:02d}" <= b:
        yield date(y, m, 1)
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def frame(layer, d, lut):
    url = (f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={layer}&CRS=EPSG:4326&BBOX=-90,-180,90,180"
           f"&WIDTH=720&HEIGHT=360&FORMAT=image/png&TIME={d.isoformat()}")
    raw = get(url, CACHE / layer / f"{d.isoformat()}.png")
    if raw is None:
        return None
    px = np.asarray(Image.open(io.BytesIO(raw)).convert("RGBA")).astype(np.int64)
    key = (px[..., 0] << 16) | (px[..., 1] << 8) | px[..., 2]
    vals = np.vectorize(lambda k: lut.get(k, np.nan), otypes=[float])(key)
    vals[px[..., 3] == 0] = np.nan
    v = vals.reshape(180, 2, 360, 2)  # 0.5 -> 1 degree: mean of the cells with data
    with np.errstate(invalid="ignore"):
        return np.nanmean(v, axis=(1, 3))  # all-NaN cells stay NaN (warning only)


def build(spec):
    lid, layer, name, unit, spoken, a, b, text = spec
    (CACHE / layer).mkdir(parents=True, exist_ok=True)
    lut, lo, hi, units = colormap(layer)
    if units.startswith("kg/m"):  # precipitation flux: kg m-2 s-1 = mm per second -> mm per day
        lut = {k: v * 86400 for k, v in lut.items()}; lo, hi = lo * 86400, hi * 86400
    print(lid, layer, "colours", len(lut), "range", round(lo, 3), round(hi, 3), units)
    grids = []
    for d in months(a, b):
        g = frame(layer, d, lut)
        if g is not None and np.isfinite(g).any():
            grids.append((d, g))
    print("  months", len(grids))
    meta = dict(id=lid, name=name, unit=unit, unitSpoken=spoken, min=round(lo, 4), max=round(hi, 4), scale="linear",
                res=1.0, cadence="monthly", sourceText=text, page=f"https://worldview.earthdata.nasa.gov/?l={layer}")
    return write(meta, grids)


def main(which):
    mf = OUT / "manifest.json"
    doc = json.loads(mf.read_text())
    layers = {l["id"]: l for l in doc["layers"]}
    for spec in LAYERS:
        if not which or spec[0] in which:
            layers[spec[0]] = build(spec)
    doc["layers"] = list(layers.values())
    mf.write_text(json.dumps(doc, indent=1))


if __name__ == "__main__":
    CACHE.mkdir(parents=True, exist_ok=True)
    main(sys.argv[1:])
