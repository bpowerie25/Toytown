"""Assemble .cache/gif/*.png (from e2e/gif.spec.ts) into docs/demo.gif (~25 s)."""
import glob, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
paths = sorted(glob.glob(os.path.join(ROOT, ".cache", "gif", "*.png")))
frames = [Image.open(p).convert("RGB").resize((480, 300), Image.LANCZOS) for p in paths]
# One palette from a day frame and a night frame keeps the file small and stops colours
# flickering between frames.
day, night = frames[len(frames) // 5], frames[-len(frames) // 5]
sample = Image.new("RGB", (480, 600)); sample.paste(day, (0, 0)); sample.paste(night, (0, 300))
palette = sample.quantize(colors=96, method=Image.Quantize.MEDIANCUT)
q = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
durations = [150] * len(q)
segments = [os.path.basename(p).rsplit("-", 1)[0] for p in paths]
for i in range(len(q) - 1):
    if segments[i] != segments[i + 1]:
        durations[i] = 900  # hold the last frame of each segment
durations[-1] = 1500
out = os.path.join(ROOT, "docs", "demo.gif")
q[0].save(out, save_all=True, append_images=q[1:], duration=durations, loop=0, optimize=True, disposal=1)
print(f"wrote docs/demo.gif ({len(q)} frames, {sum(durations) / 1000:.1f} s, {os.path.getsize(out) / 1e6:.1f} MB)")
