"""Record the listening-tour narration with a neural voice: src/assist/narration.json -> public/audio/narration/<id>.mp3.

Voice: Kokoro-82M (Apache-2.0), run locally with kokoro-onnx. Needs:
  pip install kokoro-onnx soundfile imageio-ffmpeg
  model files in .cache/tts/ (downloaded on first run):
    kokoro-v1.0.onnx, voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Run again after editing narration.json; unchanged lines are skipped.
"""

import hashlib
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import imageio_ffmpeg
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "tts"
OUT = ROOT / "public" / "audio" / "narration"
REL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
VOICE, SPEED = "af_heart", 0.98
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def model(name):
    p = CACHE / name
    if not p.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print("downloading", name)
        urllib.request.urlretrieve(REL + name, p)
    return str(p)


def main():
    lines = json.loads((ROOT / "src" / "assist" / "narration.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    stamp_file = OUT / "stamps.json"
    stamps = json.loads(stamp_file.read_text()) if stamp_file.exists() else {}
    tts = Kokoro(model("kokoro-v1.0.onnx"), model("voices-v1.0.bin"))
    for line in lines:
        key = hashlib.sha1(f"{VOICE}|{SPEED}|{line['text']}".encode()).hexdigest()
        out = OUT / f"{line['id']}.mp3"
        if stamps.get(line["id"]) == key and out.exists():
            continue
        audio, sr = tts.create(line["text"], voice=VOICE, speed=SPEED, lang="en-us")
        audio = audio / max(1e-6, np.abs(audio).max()) * 0.89  # peak -1 dBFS
        with tempfile.TemporaryDirectory() as d:
            wav = Path(d) / "x.wav"
            sf.write(wav, audio, sr)
            subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(wav), "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "64k", str(out)], check=True)
        stamps[line["id"]] = key
        print(f"{line['id']}: {len(audio) / sr:.1f} s")
    stamp_file.write_text(json.dumps(stamps, indent=1))


if __name__ == "__main__":
    main()
