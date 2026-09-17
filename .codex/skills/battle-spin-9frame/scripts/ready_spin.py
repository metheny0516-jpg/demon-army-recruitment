#!/usr/bin/env python3
"""Checkpointed helper for ten-image battle command motion assets."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

FRAME_COUNT = 10
REQUEST_SEQUENCE = list(range(8)) * 2 + [8]
CONFIRM_SEQUENCE = list(range(8)) + [9]
CANVAS = (512, 512)
ANCHOR_X = 256
BASELINE_Y = 480


def load_manifest(workspace: Path) -> tuple[Path, dict]:
    path = workspace / "manifest.json"
    if not path.exists():
        raise SystemExit(f"missing manifest: {path}")
    return path, json.loads(path.read_text(encoding="utf-8"))


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as out:
        json.dump(data, out, ensure_ascii=False, indent=2)
        out.write("\n")
        temp = Path(out.name)
    temp.replace(path)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def frame_paths(workspace: Path, manifest: dict) -> list[Path]:
    root = workspace / manifest["frames_dir"]
    return [root / f"{index}.webp" for index in range(FRAME_COUNT)]


def split(args) -> None:
    workspace = args.workspace.resolve()
    manifest_path, manifest = load_manifest(workspace)
    source_path = args.source.resolve()
    if not source_path.exists():
        raise SystemExit(f"missing source: {source_path}")
    x_edges = args.x_edges
    y_edges = args.y_edges
    if len(x_edges) != 4 or len(y_edges) != 4 or x_edges != sorted(x_edges) or y_edges != sorted(y_edges):
        raise SystemExit("--x-edges and --y-edges require four increasing measured boundaries")
    out_dir = workspace / "03-split"
    out_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as source:
        for row in range(3):
            for column in range(3):
                index = row * 3 + column
                crop = source.crop((x_edges[column], y_edges[row], x_edges[column + 1], y_edges[row + 1]))
                target = out_dir / f"{index}.png"
                with tempfile.NamedTemporaryFile(suffix=".png", dir=out_dir, delete=False) as temp:
                    temp_path = Path(temp.name)
                crop.save(temp_path)
                temp_path.replace(target)
    manifest["source_sheet"] = str(source_path)
    manifest["grid"] = {"column_edges": x_edges, "row_edges": y_edges}
    manifest["stages"]["source"] = "complete"
    manifest["stages"]["split"] = "complete"
    manifest["recovery"]["last_completed_stage"] = "split"
    atomic_json(manifest_path, manifest)
    print(out_dir)


def normalize(args) -> None:
    workspace = args.workspace.resolve()
    manifest_path, manifest = load_manifest(workspace)
    input_dir = args.input_dir.resolve()
    out_dir = workspace / manifest["frames_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    for index in range(FRAME_COUNT):
        candidates = [input_dir / f"{index}.png", input_dir / f"{index}.webp"]
        source_path = next((path for path in candidates if path.exists()), None)
        if source_path is None:
            raise SystemExit(f"missing transparent cell {index} in {input_dir}")
        with Image.open(source_path) as source:
            image = source.convert("RGBA")
            bounds = alpha_bounds(image)
            if bounds is None:
                raise SystemExit(f"empty alpha in cell {index}")
            crop = image.crop(bounds)
            if crop.width > CANVAS[0] or crop.height > BASELINE_Y + 1:
                scale = min(CANVAS[0] / crop.width, (BASELINE_Y + 1) / crop.height)
                crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
            x = ANCHOR_X - crop.width // 2
            y = BASELINE_Y - crop.height + 1
            canvas.alpha_composite(crop, (x, y))
            target = out_dir / f"{index}.webp"
            with tempfile.NamedTemporaryFile(suffix=".webp", dir=out_dir, delete=False) as temp:
                temp_path = Path(temp.name)
            canvas.save(temp_path, format="WEBP", lossless=True, method=6)
            temp_path.replace(target)
    manifest["stages"]["transparency"] = "complete"
    manifest["stages"]["normalize"] = "complete"
    manifest["stages"]["command_pose"] = "complete"
    manifest["recovery"]["last_completed_stage"] = "normalize"
    atomic_json(manifest_path, manifest)
    print(out_dir)


def alpha_bounds(image: Image.Image):
    return image.getchannel("A").getbbox()


def init(args) -> None:
    workspace = args.workspace.resolve()
    path = workspace / "manifest.json"
    if path.exists() and not args.force:
        raise SystemExit(f"manifest exists: {path}; use --force only for an intentional reset")
    data = {
        "schema_version": 2,
        "character": args.character,
        "source_sheet": None,
        "frames_dir": "05-normalized",
        "preview_dir": "06-preview",
        "qc_dir": "07-qc",
        "motion": {
            "command_request": {"lead_seconds": 0.09, "spin_seconds": 0.275, "settle_seconds": 0.08, "sequence": REQUEST_SEQUENCE},
            "command_confirm": {"spin_seconds": 0.16, "sequence": CONFIRM_SEQUENCE, "hold_frame": 9},
        },
        "normalization": {"canvas": list(CANVAS), "anchor_x": ANCHOR_X, "baseline_y": BASELINE_Y, "alpha_mode": "preserve", "black_chroma_key": False, "minimum_component_pixels": 500, "component_filter_frames": []},
        "stages": {name: "pending" for name in ("spec", "reference", "source", "split", "transparency", "normalize", "command_pose", "preview", "qc", "delivery")},
        "artifacts": {},
        "recovery": {"rescued_from_stopped_work_session": False, "regenerated_source": False, "last_completed_stage": None, "notes": []},
    }
    atomic_json(path, data)
    print(path)


def inspect_frames(workspace: Path, manifest: dict) -> tuple[list[dict], list[str]]:
    rows, failures = [], []
    for index, path in enumerate(frame_paths(workspace, manifest)):
        if not path.exists():
            failures.append(f"missing frame {index}: {path}")
            continue
        with Image.open(path) as source:
            image = source.convert("RGBA")
            bounds = alpha_bounds(image)
            passed = image.size == CANVAS and bounds is not None
            if not passed:
                failures.append(f"frame {index}: size={image.size}, bounds={bounds}")
            if bounds:
                left, top, right, bottom = bounds
                center = (left + right - 1) / 2
                foot = bottom - 1
            else:
                center = foot = None
            rows.append({"frame": index, "size": list(image.size), "bounds": list(bounds) if bounds else None, "center_x": center, "foot_y": foot, "sha256": sha256(path), "passes": passed})
    return rows, failures


def qc(args) -> None:
    workspace = args.workspace.resolve()
    manifest_path, manifest = load_manifest(workspace)
    rows, failures = inspect_frames(workspace, manifest)
    report = {
        "automated_pass": not failures,
        "failed_frames": failures,
        "frames": rows,
        "visual_qc_required": ["exact-speed two cycles", "7-to-0", "7-to-8", "8-to-0 command confirm", "7-to-9 landing", "frame-9 combat readiness", "identity", "foreign fragments", "detached parts"],
    }
    out = workspace / manifest["qc_dir"] / "qc.json"
    atomic_json(out, report)
    manifest["stages"]["qc"] = "complete" if not failures else "failed"
    if not failures and manifest["stages"].get("delivery") != "complete":
        manifest["recovery"]["last_completed_stage"] = "qc"
    manifest.setdefault("artifacts", {})[str(out.relative_to(workspace))] = sha256(out)
    atomic_json(manifest_path, manifest)
    print(out)
    if failures:
        raise SystemExit("\n".join(failures))


def contact_sheet(images: list[Image.Image], out: Path) -> None:
    columns, rows = 4, 3
    sheet = Image.new("RGB", (columns * 512, rows * 512), (232, 229, 225))
    draw = ImageDraw.Draw(sheet)
    for index, image in enumerate(images):
        x, y = (index % columns) * 512, (index // columns) * 512
        sheet.paste(image, (x, y), image)
        draw.text((x + 8, y + 8), str(index), fill=(25, 25, 25))
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".png", dir=out.parent, delete=False) as temp:
        temp_path = Path(temp.name)
    sheet.save(temp_path)
    temp_path.replace(out)


def preview(args) -> None:
    workspace = args.workspace.resolve()
    manifest_path, manifest = load_manifest(workspace)
    paths = frame_paths(workspace, manifest)
    missing = [str(path) for path in paths if not path.exists()]
    if missing:
        raise SystemExit("missing frames:\n" + "\n".join(missing))
    images = [Image.open(path).convert("RGBA") for path in paths]
    preview_dir = workspace / manifest["preview_dir"]
    sheet_path = preview_dir / "contact-sheet.png"
    contact_sheet(images, sheet_path)

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit("contact sheet written; ffmpeg is required for the exact-speed MP4")
    with tempfile.TemporaryDirectory(dir=preview_dir) as temp_dir:
        temp = Path(temp_dir)
        lead_frames, spin_frames, settle_frames = 9, 28, 8
        timeline = [0] * lead_frames
        timeline += [REQUEST_SEQUENCE[min(int(i * 16 / spin_frames), 15)] for i in range(spin_frames)]
        timeline += [8] * settle_frames
        timeline += [8] * 40  # Simulated command-selection hold for review.
        confirm_frames = 16
        timeline += [CONFIRM_SEQUENCE[min(int(i * 8 / confirm_frames), 7)] for i in range(confirm_frames)]
        timeline += [9] * 30
        for number, frame in enumerate(timeline):
            # H.264/yuv420p cannot preserve alpha.  Flatten explicitly so hidden
            # RGB beneath transparent WebP pixels cannot appear as false streaks.
            encoded = Image.new("RGB", CANVAS, (232, 229, 225))
            encoded.paste(images[frame], (0, 0), images[frame])
            encoded.save(temp / f"{number:04d}.png")
        mp4_path = preview_dir / "actual-speed.mp4"
        tmp_mp4 = preview_dir / ".actual-speed.tmp.mp4"
        subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-framerate", "100", "-i", str(temp / "%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(tmp_mp4)], check=True)
        tmp_mp4.replace(mp4_path)
    manifest["stages"]["preview"] = "complete"
    manifest["recovery"]["last_completed_stage"] = "preview"
    for path in (sheet_path, mp4_path):
        manifest.setdefault("artifacts", {})[str(path.relative_to(workspace))] = sha256(path)
    atomic_json(manifest_path, manifest)
    print(preview_dir)


def verify(args) -> None:
    workspace = args.workspace.resolve()
    _, manifest = load_manifest(workspace)
    errors = []
    for relative, expected in manifest.get("artifacts", {}).items():
        path = workspace / relative
        actual = sha256(path) if path.exists() else None
        if actual != expected:
            errors.append(f"{relative}: expected {expected}, got {actual}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"verified {len(manifest.get('artifacts', {}))} artifacts")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    sub = root.add_subparsers(dest="command", required=True)
    command = sub.add_parser("init")
    command.add_argument("workspace", type=Path)
    command.add_argument("--character", required=True)
    command.add_argument("--force", action="store_true")
    command.set_defaults(func=init)
    command = sub.add_parser("split")
    command.add_argument("workspace", type=Path)
    command.add_argument("--source", required=True, type=Path)
    command.add_argument("--x-edges", required=True, type=int, nargs=4)
    command.add_argument("--y-edges", required=True, type=int, nargs=4)
    command.set_defaults(func=split)
    command = sub.add_parser("normalize")
    command.add_argument("workspace", type=Path)
    command.add_argument("--input-dir", required=True, type=Path)
    command.set_defaults(func=normalize)
    for name, func in (("preview", preview), ("qc", qc), ("verify", verify)):
        command = sub.add_parser(name)
        command.add_argument("workspace", type=Path)
        command.set_defaults(func=func)
    return root


if __name__ == "__main__":
    options = parser().parse_args()
    options.func(options)
