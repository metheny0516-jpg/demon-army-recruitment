#!/usr/bin/env python3
"""Repack nine transparent Minotaur source components into crop-safe Skill cells."""

from collections import deque
from pathlib import Path

from PIL import Image


SOURCE = Path(__file__).with_name("minotaur-ready-spin-source.png")
OUTPUT = Path(__file__).with_name("minotaur-ready-spin-source-repacked.png")
CELL = 480


def components(image: Image.Image):
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    found = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pixels[x, y] < 128:
                continue
            seen[index] = 1
            queue, count, box = deque([(x, y)]), 0, [x, y, x, y]
            while queue:
                current_x, current_y = queue.popleft()
                count += 1
                box = [
                    min(box[0], current_x), min(box[1], current_y),
                    max(box[2], current_x), max(box[3], current_y),
                ]
                for next_x, next_y in (
                    (current_x - 1, current_y), (current_x + 1, current_y),
                    (current_x, current_y - 1), (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if not seen[next_index] and pixels[next_x, next_y] >= 128:
                        seen[next_index] = 1
                        queue.append((next_x, next_y))
            if count > 10000:
                found.append((count, box))
    if len(found) != 9:
        raise SystemExit(f"expected nine Minotaur components, found {len(found)}")
    # Preserve the authored 3x3 order. Large raised wings make top-edge sorting
    # unreliable, so classify each component by the cell containing its center.
    source_cell_width = width / 3
    source_cell_height = height / 3
    return sorted(
        found,
        key=lambda item: (
            min(2, int(((item[1][1] + item[1][3]) / 2) / source_cell_height)),
            min(2, int(((item[1][0] + item[1][2]) / 2) / source_cell_width)),
        ),
    )


with Image.open(SOURCE) as raw:
    source = raw.convert("RGBA")

sheet = Image.new("RGBA", (CELL * 3, CELL * 3), (0, 0, 0, 0))
for index, (_, box) in enumerate(components(source)):
    crop = source.crop((box[0], box[1], box[2] + 1, box[3] + 1))
    scale = min(430 / crop.width, 430 / crop.height, 1)
    crop = crop.resize(
        (round(crop.width * scale), round(crop.height * scale)),
        Image.Resampling.LANCZOS,
    )
    column, row = index % 3, index // 3
    x = column * CELL + (CELL - crop.width) // 2
    y = row * CELL + 450 - crop.height
    sheet.alpha_composite(crop, (x, y))

sheet.save(OUTPUT)
print(OUTPUT)
