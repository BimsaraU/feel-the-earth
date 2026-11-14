"""Rasterise Natural Earth 1:50m into O(1) lookup grids.

Run once with network: python scripts/build_geo.py
Writes public/data/geo/grid.bin (country ids then sea ids, Uint8, row 0 = north),
public/data/geo/meta.json and public/data/geo/countries.geojson (display outline).
"""
import json, urllib.request
from pathlib import Path

import numpy as np
from matplotlib.path import Path as MPath
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "geo"
OUT = ROOT / "public" / "data" / "geo"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
RES = 0.25
W, H = int(360 / RES), int(180 / RES)
LON = -180 + RES * (np.arange(W) + 0.5)
LAT = 90 - RES * (np.arange(H) + 0.5)


def fetch(name):
    dest = CACHE / name
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(NE + name, headers={"User-Agent": "feel-the-earth-build/0.1"})
        dest.write_bytes(urllib.request.urlopen(req).read())
    return json.loads(dest.read_text(encoding="utf-8"))


def polygons(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def rasterise(features, grid, ids):
    for f, idx in zip(features, ids):
        for poly in polygons(f["geometry"]):
            rings = [np.asarray(r)[:, :2] for r in poly]
            outer = rings[0]
            c0, c1 = np.searchsorted(LON, [outer[:, 0].min(), outer[:, 0].max()])
            r0, r1 = np.searchsorted(-LAT, [-outer[:, 1].max(), -outer[:, 1].min()])
            if c1 <= c0 or r1 <= r0:
                continue
            gx, gy = np.meshgrid(LON[c0:c1], LAT[r0:r1])
            pts = np.column_stack([gx.ravel(), gy.ravel()])
            inside = MPath(outer).contains_points(pts)
            for hole in rings[1:]:
                inside &= ~MPath(hole).contains_points(pts)
            sub = grid[r0:r1, c0:c1]
            sub[inside.reshape(sub.shape)] = idx


def main():
    countries = fetch("ne_50m_admin_0_countries.geojson")["features"]
    marine = fetch("ne_50m_geography_marine_polys.geojson")["features"]
    assert len(countries) < 255

    cgrid = np.zeros((H, W), np.uint8)
    rasterise(countries, cgrid, range(1, len(countries) + 1))

    # Seas: big oceans first so smaller seas painted later win where they overlap.
    marine = sorted(marine, key=lambda f: -abs(f["properties"].get("scalerank", 0) - 10))
    names = sorted({f["properties"]["name"] for f in marine if f["properties"].get("name")})
    sgrid = np.zeros((H, W), np.uint8)
    rasterise(marine, sgrid, [names.index(f["properties"]["name"]) + 1 if f["properties"].get("name") else 0 for f in marine])
    # Every cell gets the nearest named sea, so "nearest sea" lookups are O(1) too.
    _, (ri, ci) = distance_transform_edt(sgrid == 0, return_indices=True)
    sgrid = sgrid[ri, ci]

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "grid.bin").write_bytes(cgrid.tobytes() + sgrid.tobytes())
    meta = {
        "res": RES, "width": W, "height": H,
        "countries": [f["properties"].get("NAME_LONG") or f["properties"]["NAME"] for f in countries],
        "seas": [n.title() if n.isupper() else n for n in names],
    }
    (OUT / "meta.json").write_text(json.dumps(meta))

    def rnd(c):
        return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 2), round(c[1], 2)]
    display = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"id": i + 1},
         "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}}
        for i, f in enumerate(countries)]}
    (OUT / "countries.geojson").write_text(json.dumps(display, separators=(",", ":")))
    print("land cells", int((cgrid > 0).sum()), "countries", len(countries), "seas", len(names))


if __name__ == "__main__":
    main()
