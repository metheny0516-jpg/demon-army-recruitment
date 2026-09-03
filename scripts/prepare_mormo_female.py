"""Prepare the accepted female Mormo drafts for the existing 512px sprite contract."""

from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "mormo" / "female"
OUTPUT = ROOT / "assets" / "mormo"
NAMES = ("welcome", "report", "worried", "panic", "angry", "joy")


def extract_character(path: Path) -> Image.Image:
    bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if bgr is None:
        raise RuntimeError(f"画像を読めません: {path}")

    height, width = bgr.shape[:2]
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)

    # White or checkerboard extraction drafts: remove only pale pixels connected
    # to an outer edge, so white eyes and ruffles inside the silhouette survive.
    edge_value = np.concatenate((hsv[0, :, 2], hsv[-1, :, 2], hsv[:, 0, 2], hsv[:, -1, 2]))
    if float(edge_value.mean()) > 180:
        pale = ((hsv[:, :, 1] < 42) & (hsv[:, :, 2] > 175)).astype(np.uint8)
        count, labels = cv2.connectedComponents(pale, 8)
        edge_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
        background = np.isin(labels, list(edge_labels - {0}))
        alpha = np.where(background, 0, 255).astype(np.uint8)
        alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        alpha = cv2.GaussianBlur(alpha, (0, 0), 0.55)
        rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
        rgba[:, :, 3] = alpha
        return Image.fromarray(rgba)

    mask = np.full((height, width), cv2.GC_PR_BGD, dtype=np.uint8)
    border = max(8, min(width, height) // 80)
    mask[:border, :] = cv2.GC_BGD
    mask[-border:, :] = cv2.GC_BGD
    mask[:, :border] = cv2.GC_BGD
    mask[:, -border:] = cv2.GC_BGD

    # The accepted drafts always place Mormo in the central 82% of the canvas.
    x0, x1 = int(width * 0.09), int(width * 0.91)
    y0, y1 = int(height * 0.025), int(height * 0.965)
    mask[y0:y1, x0:x1] = cv2.GC_PR_FGD

    # Skin, gold trim, and saturated purple are reliable foreground seeds.
    saturated = hsv[:, :, 1] > 62
    warm = (hsv[:, :, 0] < 35) & (hsv[:, :, 1] > 35)
    seed = (saturated | warm)
    seed[:border * 2, :] = False
    seed[-border * 2:, :] = False
    seed[:, :border * 2] = False
    seed[:, -border * 2:] = False
    mask[seed] = cv2.GC_FGD

    bg_model = np.zeros((1, 65), np.float64)
    fg_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr, mask, None, bg_model, fg_model, 7, cv2.GC_INIT_WITH_MASK)
    alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # Keep the main connected silhouette and nearby loose report pages.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
    keep = np.zeros_like(alpha)
    if count > 1:
        main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        main_box = stats[main]
        mx, my, mw, mh = main_box[:4]
        for label in range(1, count):
            x, y, w, h, area = stats[label]
            near_main = x < mx + mw + width * 0.08 and x + w > mx - width * 0.08
            near_main &= y < my + mh + height * 0.05 and y + h > my - height * 0.05
            if label == main or (area > width * height * 0.00015 and near_main):
                keep[labels == label] = 255
    alpha = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.65)

    rgba = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGBA)
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba)


def fit_square(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise RuntimeError("前景を抽出できませんでした")
    cropped = image.crop(bbox)
    cropped.thumbnail((486, 486), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    x = (512 - cropped.width) // 2
    y = max(4, (512 - cropped.height) // 2)
    canvas.alpha_composite(cropped, (x, y))
    return canvas


def main() -> None:
    selected = tuple(sys.argv[1:]) or NAMES
    unknown = set(selected) - set(NAMES)
    if unknown:
        raise SystemExit(f"不明な表情名: {', '.join(sorted(unknown))}")
    for name in selected:
        prepared = fit_square(extract_character(SOURCE / f"{name}.png"))
        destination = OUTPUT / f"{name}.webp"
        prepared.save(destination, "WEBP", quality=88, method=6)
        print(f"{name}: {destination.stat().st_size} bytes", flush=True)


if __name__ == "__main__":
    main()
