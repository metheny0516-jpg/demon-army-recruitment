from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw


TARGET_SIZE = (768, 1024)
MAX_BYTES = 80 * 1024


def prepare(source: Path, destination: Path) -> tuple[int, int]:
    with Image.open(source) as image:
        image = image.convert("RGB")
        image = image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)

        destination.parent.mkdir(parents=True, exist_ok=True)
        for scale in (1.0, 0.75, 0.5, 0.375):
            working_size = (
                round(TARGET_SIZE[0] * scale),
                round(TARGET_SIZE[1] * scale),
            )
            working = image.resize(working_size, Image.Resampling.LANCZOS)
            for colors in (96, 80, 64, 56, 48, 40, 32, 24, 16):
                reduced = working.quantize(
                    colors=colors,
                    method=Image.Quantize.MEDIANCUT,
                    dither=Image.Dither.NONE,
                )
                if working_size != TARGET_SIZE:
                    reduced = reduced.resize(TARGET_SIZE, Image.Resampling.NEAREST)
                reduced.save(destination, format="PNG", optimize=True)
                if destination.stat().st_size <= MAX_BYTES:
                    return colors, destination.stat().st_size

    raise RuntimeError(f"Could not compress {source} below {MAX_BYTES} bytes")


def make_icon_preview(destinations: list[Path]) -> Path:
    icon_size = 40
    gap = 12
    sheet = Image.new(
        "RGB",
        (gap + len(destinations) * (icon_size + gap), icon_size + gap * 2),
        "#20242a",
    )
    mask = Image.new("L", (icon_size, icon_size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, icon_size - 1, icon_size - 1), fill=255)

    for index, destination in enumerate(destinations):
        with Image.open(destination) as image:
            top_square = image.convert("RGB").crop((0, 0, 768, 768))
            icon = top_square.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
            sheet.paste(icon, (gap + index * (icon_size + gap), gap), mask)

    preview = Path("output/monster-icon-preview.png")
    preview.parent.mkdir(parents=True, exist_ok=True)
    sheet.resize((sheet.width * 5, sheet.height * 5), Image.Resampling.NEAREST).save(preview)
    return preview


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pairs", nargs="+", help="SOURCE=DESTINATION")
    args = parser.parse_args()

    destinations: list[Path] = []
    for pair in args.pairs:
        source_text, destination_text = pair.split("=", 1)
        source = Path(source_text)
        destination = Path(destination_text)
        colors, size = prepare(source, destination)
        destinations.append(destination)
        print(f"{destination}: {TARGET_SIZE[0]}x{TARGET_SIZE[1]}, {size} bytes, {colors} colors")

    print(f"40px icon preview: {make_icon_preview(destinations)}")


if __name__ == "__main__":
    main()
