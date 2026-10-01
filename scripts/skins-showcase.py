"""Assemble .cache/showcase/<skin>.png into docs/skins/grid.jpg and docs/skins/skins.gif."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SKINS = ['default', 'night', 'sitcom', 'pastel', 'toybox', 'voxel', 'chunky', 'retro', 'neon',
         'vintage', 'sketch', 'handdrawn', 'comic', 'blueprint', 'golden', 'autumn', 'winter',
         'christmas', 'halloween', 'shamrock']
LABEL = {'default': 'Day', 'retro': 'Retro handheld', 'sketch': 'Ink sketch',
         'handdrawn': 'Hand-drawn', 'golden': 'Golden hour'}
src, out = Path('.cache/showcase'), Path('docs/skins')
out.mkdir(parents=True, exist_ok=True)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
except OSError:
    font = ImageFont.load_default()


def labelled(name, size):
    im = Image.open(src / f'{name}.png').convert('RGB').resize(size, Image.LANCZOS)
    d = ImageDraw.Draw(im)
    text = LABEL.get(name, name.capitalize())
    w = d.textlength(text, font=font)
    d.rounded_rectangle((12, 12, 12 + w + 20, 48), 10, fill=(255, 255, 255))
    d.text((22, 16), text, font=font, fill=(43, 45, 66))
    return im


cols, tile = 4, (480, 300)
rows = -(-len(SKINS) // cols)
grid = Image.new('RGB', (cols * tile[0], rows * tile[1]), 'white')
for i, s in enumerate(SKINS):
    grid.paste(labelled(s, tile), ((i % cols) * tile[0], (i // cols) * tile[1]))
grid.save(out / 'grid.jpg', quality=84, optimize=True, progressive=True)

frames = [labelled(s, (720, 450)) for s in SKINS]
frames[0].save(out / 'skins.gif', save_all=True, append_images=frames[1:], duration=1300, loop=0,
               optimize=True)
print('wrote', out / 'grid.jpg', out / 'skins.gif')
