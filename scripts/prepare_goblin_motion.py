"""Slice the accepted six-pose sheet; keep a shared scale and ground baseline."""
import argparse
from pathlib import Path
from PIL import Image

POSES = {
    'idle': (0, 0, 500, 500),
    'attack-windup': (510, 0, 980, 500),
    'strike': (990, 0, 1536, 500),
    'recover': (0, 515, 500, 1024),
    'hurt': (515, 515, 985, 1024),
    'fallen': (1000, 515, 1536, 1024),
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--swordsman', type=Path)
    parser.add_argument('--background', type=Path)
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / 'assets/battle/units/goblin'
    with Image.open(args.source) as source:
        assert source.size == (1536, 1024), 'Accepted sheet must be 1536x1024'
        assert source.mode == 'RGBA' and source.getchannel('A').getextrema()[0] == 0
        for name, box in POSES.items():
            cell = source.crop(box)
            bounds = cell.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
            cell = cell.crop(bounds)
            cell = cell.resize((round(cell.width * .86), round(cell.height * .86)), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (512, 512))
            canvas.alpha_composite(cell, ((512 - cell.width) // 2, 492 - cell.height))
            target = output / (name + '.webp')
            canvas.save(target, 'WEBP', quality=90, method=6)
            print(name, target.stat().st_size, canvas.getchannel('A').getextrema())
    if args.swordsman:
        with Image.open(args.swordsman) as source:
            assert source.mode == 'RGBA' and source.getchannel('A').getextrema()[0] == 0
            bounds = source.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
            actor = source.crop(bounds)
            actor.thumbnail((450, 430), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (512, 512))
            canvas.alpha_composite(actor, ((512 - actor.width) // 2, 492 - actor.height))
            target = output.parent / 'swordsman/idle.webp'
            target.parent.mkdir(exist_ok=True)
            canvas.save(target, 'WEBP', quality=90, method=4)
            print('swordsman', target.stat().st_size)
    if args.background:
        with Image.open(args.background) as source:
            target = output.parents[1] / 'backdrops/hall.webp'
            target.parent.mkdir(exist_ok=True)
            source.convert('RGB').save(target, 'WEBP', quality=82, method=4)
            print('hall', target.stat().st_size)

if __name__ == '__main__':
    main()
