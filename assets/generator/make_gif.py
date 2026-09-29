"""Assemble .cache/gif/*.png (from e2e/gif.spec.ts) into docs/demo.gif."""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
paths = sorted(glob.glob(os.path.join(ROOT, ".cache", "gif", "*.png")))
frames = [Image.open(p).convert("RGB").resize((640, 400), Image.LANCZOS) for p in paths]
# One shared palette keeps the file small and stops colours flickering between frames.
palette = frames[len(frames) // 3].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
q = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
durations = [80] * len(q)
durations[39] = 900  # pause on the tower before night falls
durations[-1] = 1500
out = os.path.join(ROOT, "docs", "demo.gif")
q[0].save(out, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True, disposal=1)
print(f"wrote docs/demo.gif ({len(q)} frames, {os.path.getsize(out) / 1e6:.1f} MB)")
