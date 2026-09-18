"""Rebuild accepted command sprites using reviewed body scales, never bbox auto-fit."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'assets/battle/command-poses.json'

def prepare(entry):
    source = ROOT / entry['source']
    with Image.open(source) as im:
        assert im.mode == 'RGBA', f'{source}: missing alpha'
        assert im.getchannel('A').getextrema() == (0, 255), f'{source}: invalid alpha'
        scale = entry['scale']
        scaled = im.resize((round(im.width * scale), round(im.height * scale)), Image.Resampling.LANCZOS)
    bounds = scaled.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
    assert bounds, f'{source}: empty image'
    sprite = scaled.crop(bounds)
    assert sprite.width <= 488 and sprite.height <= 480, f'{source}: would crop at reviewed scale'
    canvas = Image.new('RGBA', (512, 512))
    x = round((512 - sprite.width) / 2) + entry.get('offsetX', 0)
    y = entry.get('ground', 492) - sprite.height
    assert 0 <= x and x + sprite.width <= 512 and y >= 0
    canvas.alpha_composite(sprite, (x, y))
    target = ROOT / entry['target']
    if '--preview' in sys.argv:
        return canvas
    canvas.save(target, 'WEBP', quality=90, method=4)
    with Image.open(target) as check:
        assert check.size == (512, 512) and check.mode == 'RGBA'
        assert check.getchannel('A').getextrema() == (0, 255)
    return canvas

def main():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    entries = manifest['entries']
    sprites = [prepare(e) for e in entries]
    # Review at 128 px on both a light and a dark battle-like background.
    columns = 6
    rows = (len(entries) + columns - 1) // columns
    review = Image.new('RGB', (columns * 256, rows * 158), '#ddd6c5')
    draw = ImageDraw.Draw(review)
    for n, (entry, sprite) in enumerate(zip(entries, sprites)):
        x, y = (n % columns) * 256, (n // columns) * 158
        draw.rectangle((x + 128, y + 24, x + 255, y + 151), fill='#24242c')
        small = sprite.resize((128, 128), Image.Resampling.LANCZOS)
        review.paste(small, (x, y + 24), small)
        review.paste(small, (x + 128, y + 24), small)
        draw.text((x + 4, y + 5), entry['id'] + '/' + entry['pose'], fill='#171717')
    review.save(ROOT / 'assets/battle/command-poses-review.jpg', quality=94)
    action = 'Previewed' if '--preview' in sys.argv else 'Prepared'
    print(f'{action} {len(entries)} sprites')

if __name__ == '__main__':
    main()
