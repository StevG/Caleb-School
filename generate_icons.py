#!/usr/bin/env python3
"""Generate the app icons with the Python standard library only (no PIL).

Draws a friendly rounded tile in the app's blue with three big letter tiles
("A B C") — reads instantly as a kids' spelling app on the home screen.

    python3 generate_icons.py

Outputs static/icon-192.png, static/icon-512.png and static/apple-touch-icon.png
(180x180). Re-run after changing the design.
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "static")

BLUE = (79, 157, 222)      # #4f9dde background
BLUE_D = (59, 134, 196)
CREAM = (253, 246, 236)    # letter tiles
INK = (45, 42, 38)         # letters
GREEN = (91, 191, 106)
AMBER = (244, 185, 66)

# 5x7 pixel-font glyphs for the three letters we draw.
GLYPHS = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10001", "01110"],
}
TILE_COLORS = [GREEN, CREAM, AMBER]


def rounded(x, y, n, margin, radius):
    """True if pixel (x,y) is inside an n-wide rounded square with `margin`."""
    lo, hi = margin, n - margin
    if x < lo or x >= hi or y < lo or y >= hi:
        return False
    # rounded corners
    for cx, cy in ((lo + radius, lo + radius), (hi - radius, lo + radius),
                   (lo + radius, hi - radius), (hi - radius, hi - radius)):
        inx = (x < lo + radius) if cx < n / 2 else (x >= hi - radius)
        iny = (y < lo + radius) if cy < n / 2 else (y >= hi - radius)
        if inx and iny:
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if dx * dx + dy * dy > radius * radius:
                return False
    return True


def render(n):
    px = [BLUE] * (n * n)
    margin = int(n * 0.06)
    radius = int(n * 0.22)
    # background rounded tile
    for y in range(n):
        for x in range(n):
            if not rounded(x, y, n, margin, radius):
                px[y * n + x] = (0, 0, 0)  # transparent-ish edge -> use bg cream
                px[y * n + x] = CREAM if False else px[y * n + x]

    # Three letter tiles across the middle.
    tiles = 3
    gap = n * 0.05
    area = n * 0.74
    left = (n - area) / 2
    tile = (area - gap * (tiles - 1)) / tiles
    trad = int(tile * 0.18)
    letters = "ABC"
    cy0 = (n - tile) / 2
    for t in range(tiles):
        tx0 = left + t * (tile + gap)
        # draw tile
        for y in range(int(cy0), int(cy0 + tile)):
            for x in range(int(tx0), int(tx0 + tile)):
                lx, ly = x - tx0, y - cy0
                if _in_round_rect(lx, ly, tile, tile, trad):
                    px[y * n + x] = TILE_COLORS[t]
        # draw letter glyph centred on the tile
        glyph = GLYPHS[letters[t]]
        gw, gh = 5, 7
        scale = tile * 0.58 / gh
        gx0 = tx0 + (tile - gw * scale) / 2
        gy0 = cy0 + (tile - gh * scale) / 2
        color = INK if TILE_COLORS[t] != INK else CREAM
        for ry in range(gh):
            for rx in range(gw):
                if glyph[ry][rx] == "1":
                    for yy in range(int(gy0 + ry * scale), int(gy0 + (ry + 1) * scale) + 1):
                        for xx in range(int(gx0 + rx * scale), int(gx0 + (rx + 1) * scale) + 1):
                            if 0 <= xx < n and 0 <= yy < n:
                                px[yy * n + xx] = color
    return px


def _in_round_rect(x, y, w, h, r):
    if x < 0 or y < 0 or x >= w or y >= h:
        return False
    for cx, cy in ((r, r), (w - r, r), (r, h - r), (w - r, h - r)):
        inx = (x < r) if cx < w / 2 else (x >= w - r)
        iny = (y < r) if cy < h / 2 else (y >= h - r)
        if inx and iny:
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            if dx * dx + dy * dy > r * r:
                return False
    return True


def write_png(path, n, px):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    raw = bytearray()
    for y in range(n):
        raw.append(0)
        for x in range(n):
            raw.extend(px[y * n + x])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", n, n, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, n in (("icon-192.png", 192), ("icon-512.png", 512),
                    ("apple-touch-icon.png", 180)):
        write_png(os.path.join(OUT, name), n, render(n))
        print(f"wrote static/{name}")


if __name__ == "__main__":
    main()
