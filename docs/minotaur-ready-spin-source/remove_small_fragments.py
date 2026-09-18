#!/usr/bin/env python3
"""Remove only tiny disconnected alpha fragments from selected split cells."""

from collections import deque
from pathlib import Path

from PIL import Image


WORK = Path("/workspace/scratch/2a7e56be1139/minotaur-ready-spin-work/04-transparent")
FRAMES = (5, 8)
MIN_PIXELS = 1000


for frame in FRAMES:
    path = WORK / f"{frame}.png"
    with Image.open(path) as raw:
        image = raw.convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    keep = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] == 0:
                continue
            seen[start] = 1
            queue = deque([(x, y)])
            component = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for next_x, next_y in (
                    (current_x - 1, current_y), (current_x + 1, current_y),
                    (current_x, current_y - 1), (current_x, current_y + 1),
                ):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    next_index = next_y * width + next_x
                    if not seen[next_index] and pixels[next_x, next_y] > 0:
                        seen[next_index] = 1
                        queue.append((next_x, next_y))
            if len(component) >= MIN_PIXELS:
                for keep_x, keep_y in component:
                    keep[keep_y * width + keep_x] = 1
    output = image.copy()
    output_alpha = output.getchannel("A")
    output_pixels = output_alpha.load()
    for y in range(height):
        for x in range(width):
            if pixels[x, y] > 0 and not keep[y * width + x]:
                output_pixels[x, y] = 0
    output.putalpha(output_alpha)
    output.save(path)
    print(path)
