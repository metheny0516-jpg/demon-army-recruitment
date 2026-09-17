#!/usr/bin/env python3
"""Normalize Succubus frame 9 without reprocessing recovered frames 0–8."""

from pathlib import Path
from tempfile import NamedTemporaryFile

from PIL import Image

source = Path('docs/succubus-ready-spin-source/command-pose-source.png')
target = Path('assets/battle/units/succubus/ready-spin/9.webp')
with Image.open(source) as raw:
    image = raw.convert('RGBA')
bounds = image.getchannel('A').getbbox()
if bounds is None:
    raise SystemExit('empty frame 9')
crop = image.crop(bounds)
# Match the recovered Succubus spin frames' approximately 425px visible height.
height = 425
width = round(crop.width * height / crop.height)
crop = crop.resize((width, height), Image.Resampling.LANCZOS)
crop = crop.crop(crop.getchannel('A').getbbox())
canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
canvas.alpha_composite(crop, (256 - crop.width // 2, 480 - crop.height + 1))
with NamedTemporaryFile(suffix='.webp', dir=target.parent, delete=False) as temp:
    temporary = Path(temp.name)
canvas.save(temporary, format='WEBP', lossless=True, method=6)
temporary.replace(target)
print(target)
