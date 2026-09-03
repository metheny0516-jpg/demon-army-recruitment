"""Prepare transparent battle standing art and motion key poses."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
UNIT_DIR = ROOT / "assets" / "battle" / "units"
CANVAS = (512, 768)
MARGIN = 20


def prepare(source: Path) -> Path:
    target = source.with_name(source.name.replace("-extracted.png", ".webp"))
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        bounds = alpha.getbbox()
        if not bounds:
            raise ValueError(f"No visible pixels: {source}")
        rgba = rgba.crop(bounds)
        rgba.thumbnail((CANVAS[0] - MARGIN * 2, CANVAS[1] - MARGIN * 2), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        offset = ((CANVAS[0] - rgba.width) // 2, CANVAS[1] - MARGIN - rgba.height)
        canvas.alpha_composite(rgba, offset)
        canvas.save(target, "WEBP", lossless=True, method=6)
    return target


def main() -> None:
    sources = sorted(UNIT_DIR.rglob("*-extracted.png"))
    if not sources:
        raise SystemExit(f"No extracted sprites found in {UNIT_DIR}")
    for source in sources:
        target = prepare(source)
        with Image.open(target) as prepared:
            print(
                f"{target.relative_to(ROOT)}: {prepared.width}x{prepared.height}, "
                f"{target.stat().st_size} bytes, alpha={prepared.getchannel('A').getextrema()}"
            )


if __name__ == "__main__":
    main()
