"""Prepare accepted six-pose battle sheets with one shared scale per species."""
import argparse
from pathlib import Path
from PIL import Image

POSES = ('idle', 'attack-windup', 'strike', 'recover', 'hurt', 'fallen')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('species', choices=('slime', 'skeleton', 'orc', 'archer', 'cleric', 'sage', 'kobold', 'zombie', 'imp', 'mage', 'necromancer', 'ogre', 'king_slime', 'shield', 'slinger', 'axeman', 'cavalry', 'commander', 'hero'))
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / 'assets/battle/units' / args.species
    output.mkdir(parents=True, exist_ok=True)
    with Image.open(args.source) as source:
        assert source.mode == 'RGBA' and source.size == (1536, 1024)
        assert source.getchannel('A').getextrema()[0] == 0
        cells = []
        for i in range(6):
            x, y = (i % 3) * 512, (i // 3) * 512
            cell = source.crop((x, y, x + 512, y + 512))
            # Accepted sage fallen toe extends 5px into the empty left gutter.
            if args.species == 'sage' and i == 5:
                cell = source.crop((1000, y, 1536, y + 512))
            if args.species in ('mage', 'necromancer') and i % 3 in (1, 2):
                edge = 900 if args.species == 'mage' else 930
                cell = source.crop((512 if i % 3 == 1 else edge, y, edge if i % 3 == 1 else 1536, y + 512))
            if args.species == 'kobold':
                edges = (0, 480, 980, 1536) if i < 3 else (0, 512, 1024, 1536)
                cell = source.crop((edges[i % 3], y, edges[i % 3 + 1], y + 512))
            if args.species == 'zombie' and i >= 3:
                edges = (0, 512, 970, 1536)
                cell = source.crop((edges[i % 3], y, edges[i % 3 + 1], y + 512))
            bounds = cell.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
            assert bounds, 'Empty pose'
            cells.append(cell.crop(bounds))
        scale = min(450 / max(c.width for c in cells), 440 / max(c.height for c in cells))
        for pose, cell in zip(POSES, cells):
            cell = cell.resize((round(cell.width * scale), round(cell.height * scale)), Image.Resampling.LANCZOS)
            canvas = Image.new('RGBA', (512, 512))
            canvas.alpha_composite(cell, ((512 - cell.width) // 2, 492 - cell.height))
            target = output / (pose + '.webp')
            canvas.save(target, 'WEBP', quality=90, method=4)
            print(target.name, target.stat().st_size)

if __name__ == '__main__':
    main()
