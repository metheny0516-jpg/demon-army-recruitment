"""Prepare individually generated poses using measured identity scale, never sheet slicing."""
import json
import argparse
from pathlib import Path
from PIL import Image

POSES = ('idle', 'attack-windup', 'strike', 'recover', 'hurt', 'fallen')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    args = parser.parse_args()
    config = json.loads((args.directory / 'motion-scale.json').read_text())
    cells = []
    for pose in POSES:
        with Image.open(args.directory / (pose + '-source.png')) as source:
            assert source.mode == 'RGBA', f'{pose}: no alpha'
            alpha = source.getchannel('A')
            assert alpha.getextrema()[0] == 0, f'{pose}: opaque background'
            bounds = alpha.point(lambda a: 255 if a > 20 else 0).getbbox()
            assert bounds, f'{pose}: empty'
            cell = source.crop(bounds)
            # Calibrate a fixed body landmark (helmet), not the pose bounding box.
            factor = config['referencePixels'] / config['landmarkPixels'][pose]
            cells.append(cell.resize((round(cell.width * factor), round(cell.height * factor)), Image.Resampling.LANCZOS))
    scale = min(450 / max(c.width for c in cells), 440 / max(c.height for c in cells))
    preview = Image.new('RGB', (768, 280), '#d5cfbd')
    for index, (pose, cell) in enumerate(zip(POSES, cells)):
        cell = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (512, 512))
        canvas.alpha_composite(cell, ((512 - cell.width) // 2, 492 - cell.height))
        target = args.directory / (pose + '.webp')
        canvas.save(target, 'WEBP', quality=90, method=6)
        preview.paste(canvas.resize((128, 128)), (index * 128, 0), canvas.resize((128, 128)))
        flipped = canvas.transpose(Image.Transpose.FLIP_LEFT_RIGHT).resize((128, 128))
        preview.paste(flipped, (index * 128, 140), flipped)
        print(pose, target.stat().st_size, canvas.getchannel('A').getextrema())
    preview.save(args.directory / 'motion-review.jpg')

if __name__ == '__main__':
    main()
