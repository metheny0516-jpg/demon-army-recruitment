#!/usr/bin/env python3
"""Prepare transparent square event-expression art without touching resume portraits."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


SIZE = 512
MAX_BYTES = 80 * 1024


def parse_source(value: str) -> tuple[str, str, Path]:
    try:
        monster_id, expression, filename = value.split("=", 2)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Use ID=EXPRESSION=SOURCE.png") from error
    return monster_id, expression, Path(filename)


def remove_checkerboard(image: Image.Image) -> Image.Image:
    """Remove only checker-like pixels connected to the canvas edge.

    Image generation occasionally returns an RGB preview grid despite an alpha request.
    Restricting removal to edge-connected near-neutral pixels protects white highlights
    and tears enclosed by the character silhouette.
    """
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    seen: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    def background(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return max(red, green, blue) - min(red, green, blue) <= 8 and min(red, green, blue) >= 220

    for x in range(width):
        if background(x, 0): queue.append((x, 0))
        if background(x, height - 1): queue.append((x, height - 1))
    for y in range(height):
        if background(0, y): queue.append((0, y))
        if background(width - 1, y): queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not background(x, y):
            continue
        seen.add((x, y))
        pixels[x, y] = (*pixels[x, y][:3], 0)
        if x: queue.append((x - 1, y))
        if x + 1 < width: queue.append((x + 1, y))
        if y: queue.append((x, y - 1))
        if y + 1 < height: queue.append((x, y + 1))
    return rgba


def prepare(source: Path) -> Image.Image:
    with Image.open(source) as original:
        image = original.convert("RGBA")
        alpha = image.getchannel("A")
        if alpha.getextrema() == (255, 255):
            image = remove_checkerboard(image)
    image.thumbnail((SIZE, SIZE), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((SIZE - image.width) // 2, SIZE - image.height))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", required=True, type=parse_source,
                        metavar="ID=EXPRESSION=SOURCE.png")
    parser.add_argument("--output-dir", type=Path, default=Path("assets/monsters/events"))
    parser.add_argument("--qa-preview", type=Path, default=Path("tmp/event-expression-qa.png"))
    args = parser.parse_args()

    previews = []
    for monster_id, expression, source in args.source:
        image = prepare(source)
        destination = args.output_dir / monster_id / f"{expression}.webp"
        destination.parent.mkdir(parents=True, exist_ok=True)
        quality = 88
        while quality >= 40:
            image.save(destination, "WEBP", quality=quality, method=6)
            if destination.stat().st_size <= MAX_BYTES:
                break
            quality -= 6
        if destination.stat().st_size > MAX_BYTES:
            raise RuntimeError(f"{destination} exceeds {MAX_BYTES} bytes")
        previews.append(image.resize((96, 96), Image.Resampling.LANCZOS))
        print(f"{destination}: {image.size[0]}x{image.size[1]}, {destination.stat().st_size} bytes")

    sheet = Image.new("RGBA", (96 * len(previews), 96), (35, 28, 45, 255))
    for index, preview in enumerate(previews):
        sheet.alpha_composite(preview, (index * 96, 0))
    args.qa_preview.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(args.qa_preview, "PNG", optimize=True)
    print(f"{args.qa_preview}: {sheet.size[0]}x{sheet.size[1]}")


if __name__ == "__main__":
    main()
