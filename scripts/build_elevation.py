"""Land elevation grid from NOAA ETOPO5 (public domain), matched to the 0.25-degree geo raster.

Run once with network: python scripts/build_elevation.py
Writes public/data/geo/elevation.bin: Uint8, 1440 x 720, row 0 = north, land elevation in 25 m steps
(0 = sea level or below, 255 = 6,375 m or higher).
"""
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = "https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO5/TOPO/ETOPO5/ETOPO5.DAT"
CACHE = ROOT / ".cache" / "geo" / "ETOPO5.DAT"

if not CACHE.exists():
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(urllib.request.urlopen(urllib.request.Request(SRC, headers={"User-Agent": "feel-the-earth-build/0.1"})).read())

# 5 arc-minute grid, big-endian int16 metres, starting at 90N, 0E.
z = np.fromfile(CACHE, dtype=">i2").reshape(2160, 4320).astype(np.float32)
z = np.roll(z, 2160, axis=1)                                  # start at 180W like the geo raster
z = z.reshape(720, 3, 1440, 3).mean(axis=(1, 3))              # 3 x 3 blocks = 0.25 degrees
out = np.clip(np.round(z / 25), 0, 255).astype(np.uint8)
(ROOT / "public" / "data" / "geo" / "elevation.bin").write_bytes(out.tobytes())
print("max m", int(z.max()), "land cells > 2000 m", int((z > 2000).sum()))
