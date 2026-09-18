#!/usr/bin/env python3
"""Prepare Goblin frame 9 without modifying the accepted 0–8 spin cells."""

from collections import deque
from pathlib import Path
from tempfile import NamedTemporaryFile

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT.parent / 'goblin-ready-spin-work'
SOURCE = Path(__file__).with_name('command-pose-source.png')
TRANSPARENT = WORK / '04-transparent' / '9.png'
TARGET = ROOT / 'assets/battle/units/goblin/ready-spin/9.webp'


def is_background(red: int, green: int, blue: int) -> bool:
    """The source has a continuous desaturated blue-grey backdrop."""
    return blue >= green and blue >= red + 8 and green >= red - 16


def make_transparent() -> None:
    with Image.open(SOURCE) as raw:
        image = raw.convert('RGBA')
    width, height = image.size
    pixels = image.load()
    background = bytearray(width * height)
    queue = deque()
    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(1, height - 1):
        queue.extend(((0, y), (width - 1, y)))
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if background[index]:
            continue
        red, green, blue, _ = pixels[x, y]
        if not is_background(red, green, blue):
            continue
        background[index] = 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                queue.append((nx, ny))
    alpha = image.getchannel('A')
    alpha_data = alpha.load()
    for y in range(height):
        for x in range(width):
            if background[y * width + x]:
                alpha_data[x, y] = 0
    image.putalpha(alpha)
    TRANSPARENT.parent.mkdir(parents=True, exist_ok=True)
    image.save(TRANSPARENT)
    print(TRANSPARENT)


def normalize() -> None:
    with Image.open(TRANSPARENT) as source:
        image = source.convert('RGBA')
    bounds = image.getchannel('A').getbbox()
    if bounds is None:
        raise SystemExit('empty Goblin frame 9')
    crop = image.crop(bounds)
    # Existing Goblin frames occupy roughly 400px of the 480px baseline canvas.
    height = 400
    width = round(crop.width * height / crop.height)
    crop = crop.resize((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
    canvas.alpha_composite(crop, (256 - crop.width // 2, 480 - crop.height + 1))
    # Keep hidden RGB transparent-black so every renderer sees an empty backdrop.
    data = canvas.load()
    for y in range(512):
        for x in range(512):
            red, green, blue, alpha = data[x, y]
            if alpha == 0:
                data[x, y] = (0, 0, 0, 0)
    with NamedTemporaryFile(suffix='.webp', dir=TARGET.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    canvas.save(temporary_path, format='WEBP', lossless=True, method=6)
    with Image.open(temporary_path) as check:
        if check.size != (512, 512) or check.convert('RGBA').getchannel('A').getbbox() is None:
            temporary_path.unlink(missing_ok=True)
            raise SystemExit('normalized Goblin frame 9 failed validation')
    temporary_path.replace(TARGET)
    print(TARGET)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=('transparent', 'normalize'))
    args = parser.parse_args()
    {'transparent': make_transparent, 'normalize': normalize}[args.stage]()
