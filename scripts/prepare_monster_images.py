#!/usr/bin/env python3
"""Normalize monster portraits to the game's size, budget, and 40px QA crop."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


WIDTH, HEIGHT = 768, 1024
MAX_BYTES = 80 * 1024
PALETTE_STEPS = (256, 192, 160, 128, 96, 80, 64, 48, 32, 24, 16, 12, 8)
DETAIL_SCALES = (1.0, 0.75, 0.5, 0.25, 0.1875, 0.125)


def parse_source(value: str) -> tuple[str, Path]:
    try:
        monster_id, filename = value.split("=", 1)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Use ID=SOURCE.png") from error
    if not monster_id or not filename:
        raise argparse.ArgumentTypeError("Use ID=SOURCE.png")
    return monster_id, Path(filename)


def flatten_and_resize(source: Path) -> Image.Image:
    with Image.open(source) as original:
        rgba = original.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (174, 190, 205, 255))
    background.alpha_composite(rgba)
    return background.convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)


def save_under_budget(image: Image.Image, destination: Path) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    for detail_scale in DETAIL_SCALES:
        if detail_scale == 1.0:
            simplified = image
        else:
            reduced = image.resize(
                (round(WIDTH * detail_scale), round(HEIGHT * detail_scale)),
                Image.Resampling.LANCZOS,
            )
            simplified = reduced.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        for colors in PALETTE_STEPS:
            indexed = simplified.quantize(
                colors=colors,
                method=Image.Quantize.MEDIANCUT,
                dither=Image.Dither.NONE,
            )
            indexed.save(destination, format="PNG", optimize=True, compress_level=9)
            size = destination.stat().st_size
            if size <= MAX_BYTES:
                return size
    raise RuntimeError(f"{destination} cannot meet the {MAX_BYTES} byte limit")


def top_square_preview(image: Image.Image) -> Image.Image:
    return image.crop((0, 0, WIDTH, WIDTH)).resize((40, 40), Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", action="append", required=True, type=parse_source,
                        metavar="ID=SOURCE.png")
    parser.add_argument("--output-dir", type=Path, default=Path("assets/monsters"))
    parser.add_argument("--qa-preview", type=Path, default=Path("tmp/monster-40px-qa.png"))
    args = parser.parse_args()

    previews: list[Image.Image] = []
    for monster_id, source in args.source:
        if not source.is_file():
            raise FileNotFoundError(source)
        image = flatten_and_resize(source)
        destination = args.output_dir / f"{monster_id}.png"
        size = save_under_budget(image, destination)
        with Image.open(destination) as prepared:
            previews.append(top_square_preview(prepared.convert("RGB")))
        print(f"{destination}: 768x1024, {size} bytes")

    sheet = Image.new("RGB", (40 * len(previews), 40), (174, 190, 205))
    for index, preview in enumerate(previews):
        sheet.paste(preview, (index * 40, 0))
    args.qa_preview.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.qa_preview, format="PNG", optimize=True)
    print(f"{args.qa_preview}: {sheet.size[0]}x40 (top-aligned battle crop)")


if __name__ == "__main__":
    main()
