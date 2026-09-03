"""Prepare generated battle VFX sources for browser playback."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
EFFECT_DIR = ROOT / "assets" / "battle" / "effects"
MAX_SIZE = (512, 512)


def prepare(source: Path) -> Path:
    target = source.with_name(source.name.replace("-source.png", ".webp"))
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        rgba.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", MAX_SIZE, (0, 0, 0, 0))
        offset = ((MAX_SIZE[0] - rgba.width) // 2, (MAX_SIZE[1] - rgba.height) // 2)
        canvas.alpha_composite(rgba, offset)
        canvas.save(target, "WEBP", lossless=True, method=6)
    return target


def main() -> None:
    sources = sorted(EFFECT_DIR.glob("*-source.png"))
    if not sources:
        raise SystemExit(f"No source images found in {EFFECT_DIR}")
    for source in sources:
        target = prepare(source)
        with Image.open(target) as prepared:
            alpha = prepared.getchannel("A")
            print(
                f"{target.name}: {prepared.width}x{prepared.height}, "
                f"{target.stat().st_size} bytes, alpha={alpha.getextrema()}"
            )


if __name__ == "__main__":
    main()
