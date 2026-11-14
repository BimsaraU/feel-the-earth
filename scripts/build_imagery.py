"""Cut NASA's "Whole world - land and oceans" (Blue Marble, public domain) into Web Mercator tiles z0-5.

Run once with network: python scripts/build_imagery.py
Writes public/tiles/{z}/{x}/{y}.jpg (1365 tiles). The app overzooms past z5.
"""
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parent.parent
SRC = "https://upload.wikimedia.org/wikipedia/commons/4/4d/Whole_world_-_land_and_oceans.jpg"
CACHE = ROOT / ".cache" / "imagery" / "whole_world.jpg"
OUT = ROOT / "public" / "tiles"
MAXZ, T = 5, 256

if not CACHE.exists():
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_bytes(urllib.request.urlopen(urllib.request.Request(SRC, headers={"User-Agent": "feel-the-earth-build/0.1"})).read())

Image.MAX_IMAGE_PIXELS = None
src = np.asarray(Image.open(CACHE).convert("RGB"), dtype=np.float32)
H, W, _ = src.shape

for z in range(MAXZ + 1):
    n = 2 ** z
    for x in range(n):
        for y in range(n):
            px = (x * T + np.arange(T) + 0.5) / (n * T)          # 0..1 across the world
            py = (y * T + np.arange(T) + 0.5) / (n * T)
            lon = px * 360 - 180
            lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * py))))
            cols = (lon + 180) / 360 * W - 0.5
            rows = (90 - lat) / 180 * H - 0.5
            rr, cc = np.meshgrid(rows, cols, indexing="ij")
            tile = np.stack([map_coordinates(src[:, :, k], [rr, cc], order=1, mode="nearest") for k in range(3)], -1)
            out = OUT / str(z) / str(x)
            out.mkdir(parents=True, exist_ok=True)
            Image.fromarray(tile.clip(0, 255).astype(np.uint8)).save(out / f"{y}.jpg", quality=78, optimize=True)
    print("zoom", z, "done")
