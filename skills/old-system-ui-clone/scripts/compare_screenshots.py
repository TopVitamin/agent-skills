#!/usr/bin/env python3
"""Create a side-by-side source vs clone screenshot comparison."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a side-by-side screenshot comparison PNG.")
    parser.add_argument("source", help="Source screenshot path")
    parser.add_argument("clone", help="Clone screenshot path")
    parser.add_argument("output", help="Output comparison PNG path, usually qa/screenshots/<state-id>-compare-v1.png")
    parser.add_argument("--source-label", default="SOURCE", help="Label for the left image")
    parser.add_argument("--clone-label", default="CLONE", help="Label for the right image")
    parser.add_argument("--max-width", type=int, default=2400, help="Maximum output width")
    parser.add_argument("--gap", type=int, default=24, help="Gap between images")
    return parser.parse_args()


def fit_image(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    ratio = min(max_width / image.width, max_height / image.height, 1)
    if ratio == 1:
        return image.copy()
    return image.resize((round(image.width * ratio), round(image.height * ratio)), Image.LANCZOS)


def draw_label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], label: str) -> None:
    try:
        font = ImageFont.truetype("Arial.ttf", 24)
    except OSError:
        font = ImageFont.load_default()
    x, y = xy
    draw.rounded_rectangle((x, y, x + 220, y + 38), radius=4, fill=(10, 24, 61))
    draw.text((x + 12, y + 10), label, fill=(255, 255, 255), font=font)


def main() -> int:
    args = parse_args()
    source_path = Path(args.source).expanduser().resolve()
    clone_path = Path(args.clone).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not source_path.exists():
        raise SystemExit(f"Source screenshot does not exist: {source_path}")
    if not clone_path.exists():
        raise SystemExit(f"Clone screenshot does not exist: {clone_path}")

    source = Image.open(source_path).convert("RGB")
    clone = Image.open(clone_path).convert("RGB")

    per_image_max_width = max(320, (args.max_width - args.gap) // 2)
    max_height = max(source.height, clone.height)
    source_fit = fit_image(source, per_image_max_width, max_height)
    clone_fit = fit_image(clone, per_image_max_width, max_height)

    label_h = 54
    width = source_fit.width + args.gap + clone_fit.width
    height = label_h + max(source_fit.height, clone_fit.height)
    canvas = Image.new("RGB", (width, height), (240, 242, 245))
    canvas.paste(source_fit, (0, label_h))
    canvas.paste(clone_fit, (source_fit.width + args.gap, label_h))

    draw = ImageDraw.Draw(canvas)
    draw_label(draw, (0, 8), args.source_label)
    draw_label(draw, (source_fit.width + args.gap, 8), args.clone_label)

    # Separator line makes layout/height mismatches easier to see.
    sep_x = source_fit.width + args.gap // 2
    draw.line((sep_x, 0, sep_x, height), fill=(190, 195, 204), width=1)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path)
    print(f"Comparison saved: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
