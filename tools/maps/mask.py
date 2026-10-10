#!/usr/bin/env python3
"""Make a land mask for a painted world from a map image.

  tools/maps/mask.py MAP OUT.png --sea R,G,B [--sea R,G,B ...] [--land R,G,B ...] [--lava R,G,B ...]
                     [--unknown R,G,B ...] [--dark N] [--tol N] [--erase X0,Y0,X1,Y1 ...]
                     [--line-rows] [--open N] [--min-area N] [--size 2048] [--blur 1.2]

Each pixel of the map is sea, land or lava when its color is near one of the given colors (within
--tol), and unknown when it is not: outlines, labels, grid lines. With no --land colors, every pixel
that is not sea, lava, an --unknown color or darker than --dark counts as land. An unknown pixel
takes the class of the nearest known pixel, so a label in the sea becomes sea and a label on land
becomes land. --line-rows treats a row that is mostly lava color as a drawn line (an equator), not
lava. An --erase box (in map pixels) becomes sea, for a title box or a scale bar. --open N removes
land thinner than N pixels (grid lines and borders drawn in a land color), and --min-area N drops
specks of land smaller than N pixels.

The output is an equirectangular PNG, twice as wide as high: red is land (lava included), green is
lava. A world with look.proc.mask set to it gets its coastlines from the map, and planets.js paints
the terrain inside them.
"""
from __future__ import annotations

import argparse

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def rgb(s: str) -> np.ndarray:
    return np.array([float(x) for x in s.split(",")])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("map")
    ap.add_argument("out")
    ap.add_argument("--sea", action="append", required=True)
    ap.add_argument("--land", action="append", default=[])
    ap.add_argument("--lava", action="append", default=[])
    ap.add_argument("--unknown", action="append", default=[])
    ap.add_argument("--dark", type=float, default=0, help="pixels darker than this (0 to 255) are unknown")
    ap.add_argument("--tol", type=float, default=40)
    ap.add_argument("--erase", action="append", default=[])
    ap.add_argument("--line-rows", action="store_true")
    ap.add_argument("--open", type=int, default=0)
    ap.add_argument("--min-area", type=int, default=0)
    ap.add_argument("--size", type=int, default=2048)
    ap.add_argument("--blur", type=float, default=1.2)
    a = ap.parse_args()

    im = np.asarray(Image.open(a.map).convert("RGB"), dtype=np.float32)
    h, w, _ = im.shape

    def near(cols: list[str]) -> np.ndarray:
        if not cols:
            return np.zeros((h, w), bool)
        return np.min([np.linalg.norm(im - rgb(c), axis=2) for c in cols], axis=0) < a.tol

    sea, lava, odd = near(a.sea), near(a.lava), near(a.unknown)
    dark = im.mean(axis=2) < a.dark
    if a.line_rows:
        for y in np.where(lava.mean(axis=1) > 0.5)[0]:
            lava[y] = False
            odd[y] |= near(a.lava)[y]
    land = near(a.land) if a.land else ~(sea | lava | odd | dark)
    cls = np.full((h, w), -1, np.int8)
    cls[sea] = 0
    cls[land & ~sea] = 1
    cls[lava] = 2
    cls[odd | (dark & ~sea & ~lava)] = -1
    for box in a.erase:
        x0, y0, x1, y1 = (int(v) for v in box.split(","))
        cls[y0:y1, x0:x1] = 0
    unknown = cls < 0
    if unknown.any():
        near_known = np.asarray(ndimage.distance_transform_edt(unknown, return_distances=False, return_indices=True))
        cls = cls[near_known[0], near_known[1]]
    if a.open > 1:
        ground = ndimage.binary_opening(cls >= 1, structure=np.ones((a.open, a.open), bool))
        cls = np.where(ground, cls, 0).astype(np.int8)
    if a.min_area > 0:
        labeled = ndimage.label(cls >= 1)
        lab, n = np.asarray(labeled[0]), int(labeled[1])  # type: ignore[index]  # label() returns (array, count)
        sizes = np.asarray(ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1)))
        small = np.isin(lab, np.where(sizes < a.min_area)[0] + 1)
        cls = np.where(small, 0, cls).astype(np.int8)
    out = np.zeros((h, w, 3), np.uint8)
    out[..., 0] = np.where(cls >= 1, 255, 0)
    out[..., 1] = np.where(cls == 2, 255, 0)
    img = Image.fromarray(out).resize((a.size, a.size // 2), Image.Resampling.LANCZOS)
    if a.blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(a.blur))
    img.save(a.out, optimize=True)
    land_share = (cls >= 1).mean()
    print(f"{a.out}: {a.size}x{a.size // 2}, land {land_share:.0%}, lava {(cls == 2).mean():.1%}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
