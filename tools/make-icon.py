"""Draws the launcher's icon: build/icon.png (512 px) and build/icon.ico (16 to 256 px), in the launcher's colours, and the same emblem
without its tile for the window's title bar (src/renderer/src/assets/emblem.png).

An original emblem, nothing taken from the game: a gold ring on a night-blue tile, a four-pointed star of aether in it and two wings.
Run with `python tools/make-icon.py` (needs Pillow) after changing it; the files are committed.
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024  # drawn large, scaled down for each size
GOLD = (216, 180, 108)
GOLD_LIGHT = (242, 214, 150)
NIGHT_TOP = (16, 26, 54)
NIGHT_BOTTOM = (6, 9, 19)
AETHER = (120, 190, 255)

root = Path(__file__).resolve().parent.parent
out = root / 'build'
assets = root / 'src' / 'renderer' / 'src' / 'assets'


def tile() -> Image.Image:
    gradient = Image.new('RGB', (SIZE, SIZE))
    pixels = gradient.load()
    for y in range(SIZE):
        t = y / (SIZE - 1)
        colour = tuple(round(a + (b - a) * t) for a, b in zip(NIGHT_TOP, NIGHT_BOTTOM))
        for x in range(SIZE):
            pixels[x, y] = colour
    mask = Image.new('L', (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((24, 24, SIZE - 24, SIZE - 24), radius=200, fill=255)
    image = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    image.paste(gradient, mask=mask)
    ImageDraw.Draw(image).rounded_rectangle((24, 24, SIZE - 24, SIZE - 24), radius=200, outline=GOLD + (140,), width=10)
    return image


def star(cx: float, cy: float, outer: float, inner: float) -> list[tuple[float, float]]:
    points = []
    for i in range(8):
        angle = -math.pi / 2 + i * math.pi / 4
        radius = outer if i % 2 == 0 else inner
        points.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return points


def wing(cx: float, cy: float, side: int) -> list[list[tuple[float, float]]]:
    """Three feathers sweeping up and out from the ring."""
    feathers = []
    for i, (length, lift) in enumerate(((230, 190), (200, 120), (160, 55))):
        base_y = cy - 60 + i * 62
        root = (cx + side * 190, base_y)
        tip = (cx + side * (190 + length), base_y - lift)
        under = (cx + side * (190 + length * 0.6), base_y - lift * 0.45 + 30)
        over = (cx + side * (190 + length * 0.4), base_y - lift * 0.75 - 10)
        feathers.append([root, over, tip, under])
    return feathers


def emblem(on_tile: bool = True) -> Image.Image:
    image = tile() if on_tile else Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    cx, cy = SIZE / 2, SIZE / 2 + 20

    glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((cx - 150, cy - 150, cx + 150, cy + 150), fill=AETHER + (120,))

    draw = ImageDraw.Draw(image)
    for side in (-1, 1):
        for feather in wing(cx, cy, side):
            draw.polygon(feather, fill=GOLD + (235,), outline=GOLD_LIGHT)
    draw.ellipse((cx - 215, cy - 215, cx + 215, cy + 215), fill=NIGHT_TOP + (255,), outline=GOLD, width=30)
    draw.ellipse((cx - 175, cy - 175, cx + 175, cy + 175), outline=GOLD_LIGHT + (120,), width=7)
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(55)))
    draw = ImageDraw.Draw(image)
    draw.polygon(star(cx, cy, 150, 40), fill=GOLD_LIGHT)
    draw.polygon(star(cx, cy, 80, 26), fill=(255, 246, 222))
    return image


def main() -> None:
    out.mkdir(exist_ok=True)
    image = emblem()
    image.resize((512, 512), Image.LANCZOS).save(out / 'icon.png')
    image.save(out / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    assets.mkdir(parents=True, exist_ok=True)
    bare = emblem(on_tile=False)
    # cropped as much below the ring's centre as the wings rise above it: centred in a line, the ring sits on the line's middle
    left, top, right, bottom = bare.getbbox()
    centre = SIZE / 2 + 20
    half = max(centre - top, bottom - centre)
    bare = bare.crop((left, round(centre - half), right, round(centre + half)))
    bare.resize((round(bare.width * 64 / bare.height), 64), Image.LANCZOS).save(assets / 'emblem.png')
    print('wrote', out / 'icon.png', out / 'icon.ico', 'and', assets / 'emblem.png')


if __name__ == '__main__':
    main()
