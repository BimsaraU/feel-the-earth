"""Download recorded samples, trim and normalise them, write public/audio/*.mp3 + manifest.json.

Run once with network: python scripts/prepare_audio.py
Needs: numpy, soundfile, imageio-ffmpeg (pip install numpy soundfile imageio-ffmpeg).
The output is committed, so the app itself never needs the network.
"""
import json, re, subprocess, urllib.parse, urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "audio"
OUT = ROOT / "public" / "audio"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VSCO = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/"
SR = 44100

# Pitched instruments: regex over the VSCO-2-CE file tree, first group = note name.
INSTRUMENTS = {
    "cello":      (r"Strings/Cello Section/susvib/susvib_([A-G]#?\d)_v3_1\.wav", "C2", "F4", 3.5),
    "harp":       (r"Strings/Harp/KSHarp_([A-G]#?\d)_(?:mf|f|mp)\.wav", "C3", "G6", 2.5),
    "clarinet":   (r"Woodwinds/Clarinet/susLong/DCClar_susLong_([A-G]#?\d)_v3_rr1_sum\.wav", "D2", "F#5", 3.0),
    "glock":      (r"Percussion/Glock/glock_medium_([A-G]#?\d)\.wav", "G4", "G6", 2.0),
    "piano":      (r"Keys/Upright Nr1/UR1_([A-G]#?\d)_pp_RR1\.wav", "C2", "C6", 3.0),
    # Severity voice: tremolo strings for the darkening drone.
    "cellotrem":  (r"Strings/Cello Section/trem/trem_([A-G]#?\d)_v\d_1\.wav", "C1", "F4", 3.5),
}

RAIN = "https://upload.wikimedia.org/wikipedia/commons/4/4f/Falling_Rain_SFX_1_2016-11-19.oga"
# Long recordings: only the first bytes are fetched (enough for the slice we use).
PARTIAL = {RAIN: 4_000_000}

# One-shots: (url, start seconds, duration seconds)
ONESHOTS = {
    "clave":       (VSCO + "Percussion/Claves1_Hit_v2_rr1_Sum.wav", 0, 0.4),
    "framedrum":   (VSCO + "Percussion/Tumba-HitN_v1_rr1_Sum.wav", 0, 0.8),
    "smallbell":   (VSCO + "Percussion/Triangle6-HitM_v1_rr1_Sum.wav", 0, 2.5),
    "gong":        (VSCO + "Percussion/gongHit_p.wav", 0, 4.0),
    "cymbal":      (VSCO + "Percussion/cymbal-crash1_mp_rr1.wav", 0, 3.0),
    "ratchet":     (VSCO + "Percussion/Ratchet1-Slow_v1_rr1_Sum.wav", 0, 0.18),
    "thump":       (VSCO + "Percussion/BDrumNewhit_v1_rr1_Sum.wav", 0, 0.35),
    "singingbowl": ("https://upload.wikimedia.org/wikipedia/commons/e/e1/Tibetan_Singing_Bowl_hit_11inch.flac", 0, 6.0),
    "wave":        ("https://upload.wikimedia.org/wikipedia/commons/f/f1/Oceanwavescrushing.ogg", 12.0, 2.5),
    "whoosh":      ("https://upload.wikimedia.org/wikipedia/commons/f/f1/Oceanwavescrushing.ogg", 40.0, 4.0),
    "windchime":   ("https://upload.wikimedia.org/wikipedia/commons/0/09/Windchimes.ogg", 0, 3.5),
    # Ambience beds under the loop: sea, land, mixed by the land/water share of the window.
    "oceanbed":    ("https://upload.wikimedia.org/wikipedia/commons/f/f1/Oceanwavescrushing.ogg", 60.0, 24.0),
    "landbed":     ("https://upload.wikimedia.org/wikipedia/commons/0/0e/Gentle_breeze_and_birds_singing.ogg", 2.0, 28.0),
    # Cold land bed (high altitude) and the wind layer's texture.
    "windbed":     ("https://upload.wikimedia.org/wikipedia/commons/2/2d/Howling_wind.ogg", 20.0, 24.0),
    # Rain layer's texture.
    "rain":        (RAIN, 30.0, 16.0),
    # Severity heartbeat.
    "timpani":     (VSCO + "Percussion/Timpani/Timpani2_Hit_v3_rr1_Sum.wav", 0, 2.5),
}
NO_SILENCE_TRIM = {"wave", "whoosh", "oceanbed", "landbed", "windbed", "rain"}  # field-recording slices, start where asked
LOOPED = {"whoosh", "oceanbed", "landbed", "windbed", "rain"}  # tail crossfaded into head so it loops seamlessly

NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def midi(n):
    m = re.fullmatch(r"([A-G]#?)(-?\d)", n)
    return NOTE[m[1]] + 12 * (int(m[2]) + 1)


def fetch(url):
    dest = CACHE / re.sub(r"[^A-Za-z0-9._-]", "_", urllib.parse.unquote(url.split("/", 3)[-1]))
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        headers = {"User-Agent": "feel-the-earth-build/0.1"}
        if url in PARTIAL:
            headers["Range"] = f"bytes=0-{PARTIAL[url] - 1}"
        req = urllib.request.Request(urllib.parse.quote(url, safe=":/"), headers=headers)
        dest.write_bytes(urllib.request.urlopen(req).read())
    return dest


def load(path):
    wav = path.with_suffix(".decoded.wav")
    if not wav.exists():
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(path), "-ac", "1", "-ar", str(SR), str(wav)], check=True)
    x, _ = sf.read(wav, dtype="float32")
    return x


def shape(x, start, dur, trim=True, loop=False):
    x = x[int(start * SR):]
    if trim:
        thr = 10 ** (-50 / 20) * np.max(np.abs(x))
        on = np.argmax(np.abs(x) > thr)
        x = x[max(0, on - int(0.002 * SR)):]
    if loop:
        xf = int(1.5 * SR)
        x = x[: int(dur * SR) + xf].copy()
        ramp = np.sin(np.linspace(0, np.pi / 2, xf)) ** 2
        x[:xf] = x[:xf] * ramp + x[-xf:] * ramp[::-1]
        x = x[:-xf]
    else:
        x = x[: int(dur * SR)].copy()
        fade = int(min(0.3, dur / 4) * SR)
        x[-fade:] *= np.linspace(1, 0, fade) ** 2
    return x / (np.max(np.abs(x)) + 1e-9) * 10 ** (-3 / 20)  # peak -3 dBFS


def write_mp3(x, rel):
    out = OUT / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE / "tmp.wav"
    sf.write(tmp, x, SR, subtype="PCM_16")
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(tmp), "-codec:a", "libmp3lame", "-b:a", "96k", str(out)], check=True)


def main():
    tree = json.load(urllib.request.urlopen(urllib.request.Request(
        "https://api.github.com/repos/sgossner/VSCO-2-CE/git/trees/master?recursive=1",
        headers={"User-Agent": "feel-the-earth-build/0.1"})))
    files = [t["path"] for t in tree["tree"] if t["type"] == "blob"]
    manifest = {"instruments": {}, "oneshots": {}, "sources": []}

    for name, (pattern, lo, hi, dur) in INSTRUMENTS.items():
        zones = {}
        for f in sorted(files):
            m = re.fullmatch(pattern, f)
            if m and midi(lo) <= midi(m[1]) <= midi(hi) and m[1] not in zones:
                zones[m[1]] = f
        manifest["instruments"][name] = {}
        for note, f in zones.items():
            rel = f"{name}/{note.replace('#', 's')}.mp3"
            write_mp3(shape(load(fetch(VSCO + f)), 0, dur), rel)
            manifest["instruments"][name][note] = rel
            manifest["sources"].append({"file": rel, "url": VSCO + f, "licence": "CC0 1.0 (VSCO 2 Community Edition)"})
        print(name, list(zones))

    for name, (url, start, dur) in ONESHOTS.items():
        rel = f"oneshots/{name}.mp3"
        write_mp3(shape(load(fetch(url)), start, dur, name not in NO_SILENCE_TRIM, name in LOOPED), rel)
        manifest["oneshots"][name] = rel
        lic = "CC0 1.0 (VSCO 2 Community Edition)" if url.startswith(VSCO) else "see docs/CREDITS.md"
        manifest["sources"].append({"file": rel, "url": url, "licence": lic})
        print(name)

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
