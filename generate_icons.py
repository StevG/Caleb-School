#!/usr/bin/env python3
"""Generate the app icons with the Python standard library only (no PIL).

Draws a playful pixel-art scene: a little green dinosaur riding a rocket
through a starry night sky. Pixel art scales cleanly to every icon size and
reads instantly as "a fun kids app" on the home screen.

    python3 generate_icons.py

Outputs static/icon-192.png, static/icon-512.png and static/apple-touch-icon.png
(180x180). Re-run after changing the design (edit the SPRITE rows below —
each character is one pixel, see PALETTE).
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "static")

CREAM = (253, 246, 236)    # app page background (--bg) — shows at the corners
NIGHT = (43, 56, 100)      # starry-sky tile
NIGHT_D = (34, 45, 82)     # sky shading (bottom of tile)

PALETTE = {
    "W": (250, 250, 245),  # rocket body
    "S": (214, 220, 228),  # rocket body shading
    "R": (232, 112, 90),   # nose cone + fins (--red, friendly coral)
    "r": (198, 84, 64),    # fin shading
    "B": (79, 157, 222),   # window ring (--blue)
    "b": (176, 214, 245),  # window glass behind the dino
    "G": (98, 200, 112),   # dino
    "g": (74, 165, 90),    # dino shading
    "K": (45, 42, 38),     # eye (--ink)
    "w": (255, 255, 255),  # eye shine / highlights
    "O": (244, 185, 66),   # flame outer (--amber)
    "Y": (255, 224, 130),  # flame core
}

# 16 x 22 sprite. '.' = sky. The dino peeks out of the round window,
# facing right (eye on the right side of the green head).
SPRITE = [
    ".......RR.......",
    "......RRRR......",
    ".....RRRRRR.....",
    "...WWWWWWWWWS...",
    "...WWWWWWWWWS...",
    "...WBBBBBBBBS...",
    "...WBbbGGbbBS...",
    "...WBbGGGGbBS...",
    "...WBGGGKGbBS...",
    "...WBGGGGgbBS...",
    "...WBgGGGGbBS...",
    "...WBBBBBBBBS...",
    "..RWWWWWWWWWSr..",
    ".RRWWWWWWWWWSrr.",
    "RRRWWWWWWWWWSrrr",
    "RRR..WWWWWS..rrr",
    "RR............rr",
    "......OYYO......",
    ".....OYYYYO.....",
    ".....OYYYYO.....",
    "......OYYO......",
    ".......OO.......",
]
SPR_W, SPR_H = 16, len(SPRITE)

# Little 1px stars scattered around the rocket (sprite-grid coordinates,
# may be negative / beyond the sprite — they're clamped to the tile).
STARS = [(-5, 1), (-6, 8), (-4, 15), (-5, 20), (18, 2), (20, 9),
         (19, 16), (17, 21), (-2, -3), (10, -4), (3, 24), (13, 25)]


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


def rounded(x, y, n, margin, radius):
    """True if pixel (x,y) is inside an n-wide rounded square with `margin`."""
    m = n - 2 * margin
    return _in_round_rect(x - margin, y - margin, m, m, radius)


def render(n):
    margin = int(n * 0.06)
    radius = int(n * 0.22)

    # Sky tile with a subtle vertical shade; cream page color at the corners
    # (this PNG has no alpha channel, so the corners need a real color).
    px = []
    for y in range(n):
        t = y / n
        sky = tuple(int(NIGHT[i] + (NIGHT_D[i] - NIGHT[i]) * t) for i in range(3))
        for x in range(n):
            px.append(sky if rounded(x, y, n, margin, radius) else CREAM)

    # Scale the sprite to ~62% of the tile height, centered.
    scale = max(1, int(n * 0.62 / SPR_H))
    ox = (n - SPR_W * scale) // 2
    oy = (n - SPR_H * scale) // 2

    def blit(gx, gy, color):
        for yy in range(oy + gy * scale, oy + (gy + 1) * scale):
            for xx in range(ox + gx * scale, ox + (gx + 1) * scale):
                if 0 <= xx < n and 0 <= yy < n and rounded(xx, yy, n, margin, radius):
                    px[yy * n + xx] = color

    for sx, sy in STARS:
        blit(sx, sy, PALETTE["w"])
    for gy, row in enumerate(SPRITE):
        for gx, ch in enumerate(row):
            if ch != ".":
                blit(gx, gy, PALETTE[ch])
    return px


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
