#!/usr/bin/env python3
"""Perspective-warp exact artwork onto a photographed surface.

Example:
python perspective_mockup.py \
  --base package.jpg \
  --art artwork.png \
  --quad "260,180 780,220 740,820 230,780" \
  --output package_mockup.png \
  --surface-light 0.55 \
  --edge-blur 0.8 \
  --displace 1.2

The quad order is top-left, top-right, bottom-right, bottom-left.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

import cv2
import numpy as np
from PIL import Image


def parse_quad(value: str) -> np.ndarray:
    points = []
    for token in value.replace(";", " ").split():
        x_str, y_str = token.split(",", 1)
        points.append((float(x_str), float(y_str)))
    if len(points) != 4:
        raise argparse.ArgumentTypeError("quad must contain exactly four x,y points")
    return np.array(points, dtype=np.float32)


def load_rgba(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGBA")
    return np.asarray(image, dtype=np.float32) / 255.0


def save_rgba(path: Path, data: np.ndarray) -> None:
    clipped = np.clip(data * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(clipped, mode="RGBA").save(path)


def gaussian_kernel_for_image(width: int, height: int) -> float:
    return max(5.0, min(width, height) / 42.0)


def apply_displacement(image: np.ndarray, alpha: np.ndarray, luminance: np.ndarray,
                       amount: float) -> tuple[np.ndarray, np.ndarray]:
    if abs(amount) < 1e-6:
        return image, alpha

    h, w = luminance.shape
    smooth = cv2.GaussianBlur(luminance, (0, 0), sigmaX=max(2.0, min(h, w) / 90.0))
    grad_x = cv2.Sobel(smooth, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(smooth, cv2.CV_32F, 0, 1, ksize=3)
    scale = max(float(np.max(np.abs(grad_x))), float(np.max(np.abs(grad_y))), 1e-6)
    grad_x = grad_x / scale
    grad_y = grad_y / scale

    grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    map_x = grid_x + grad_x * amount
    map_y = grid_y + grad_y * amount

    displaced_image = cv2.remap(image, map_x, map_y, interpolation=cv2.INTER_CUBIC,
                                borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    displaced_alpha = cv2.remap(alpha, map_x, map_y, interpolation=cv2.INTER_CUBIC,
                                borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return displaced_image, displaced_alpha


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--art", required=True, type=Path)
    parser.add_argument("--quad", required=True, type=parse_quad)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--opacity", type=float, default=1.0)
    parser.add_argument("--surface-light", type=float, default=0.50,
                        help="0 disables base-surface light inheritance; 1 applies it strongly")
    parser.add_argument("--edge-blur", type=float, default=0.6)
    parser.add_argument("--displace", type=float, default=0.0,
                        help="mild pixel displacement derived from base luminance")
    args = parser.parse_args()

    if not args.base.is_file():
        raise FileNotFoundError(args.base)
    if not args.art.is_file():
        raise FileNotFoundError(args.art)
    if not 0.0 <= args.opacity <= 1.0:
        raise ValueError("opacity must be between 0 and 1")
    if not 0.0 <= args.surface_light <= 1.0:
        raise ValueError("surface-light must be between 0 and 1")

    base = load_rgba(args.base)
    art = load_rgba(args.art)
    h, w = base.shape[:2]
    ah, aw = art.shape[:2]

    src = np.array([[0, 0], [aw - 1, 0], [aw - 1, ah - 1], [0, ah - 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(src, args.quad)

    art_rgb = art[:, :, :3]
    art_alpha = art[:, :, 3]
    warped_rgb = cv2.warpPerspective(art_rgb, matrix, (w, h), flags=cv2.INTER_CUBIC,
                                     borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    warped_alpha = cv2.warpPerspective(art_alpha, matrix, (w, h), flags=cv2.INTER_CUBIC,
                                       borderMode=cv2.BORDER_CONSTANT, borderValue=0)

    base_lum = (base[:, :, 0] * 0.2126 + base[:, :, 1] * 0.7152 + base[:, :, 2] * 0.0722).astype(np.float32)
    warped_rgb, warped_alpha = apply_displacement(warped_rgb, warped_alpha, base_lum, args.displace)

    if args.edge_blur > 0:
        warped_alpha = cv2.GaussianBlur(warped_alpha, (0, 0), sigmaX=args.edge_blur)

    if args.surface_light > 0:
        sigma = gaussian_kernel_for_image(w, h)
        low = cv2.GaussianBlur(base_lum, (0, 0), sigmaX=sigma)
        mask = warped_alpha > 0.01
        if np.any(mask):
            mean_lum = float(np.mean(low[mask]))
        else:
            mean_lum = float(np.mean(low))
        mean_lum = max(mean_lum, 1e-4)
        light = np.clip(low / mean_lum, 0.45, 1.65)
        light = 1.0 + (light - 1.0) * args.surface_light
        warped_rgb = np.clip(warped_rgb * light[:, :, None], 0.0, 1.0)

    alpha = np.clip(warped_alpha * args.opacity, 0.0, 1.0)[:, :, None]
    out_rgb = warped_rgb * alpha + base[:, :, :3] * (1.0 - alpha)
    out_alpha = alpha[:, :, 0] + base[:, :, 3] * (1.0 - alpha[:, :, 0])
    output = np.dstack([out_rgb, out_alpha])

    args.output.parent.mkdir(parents=True, exist_ok=True)
    save_rgba(args.output, output)
    print(str(args.output.resolve()))


if __name__ == "__main__":
    main()
