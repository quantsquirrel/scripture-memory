#!/usr/bin/env python3
"""PWA 아이콘 생성 — 외부 의존성 없이 PNG를 직접 인코딩한다."""
import struct, zlib, pathlib

BG = (38, 50, 78, 255)      # 딥 네이비
FG = (245, 241, 232, 255)   # 웜 화이트


def png_bytes(w, h, rows):
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def make_icon(size):
    vx0, vx1 = 0.44 * size, 0.56 * size   # 세로대
    vy0, vy1 = 0.18 * size, 0.82 * size
    hx0, hx1 = 0.26 * size, 0.74 * size   # 가로대
    hy0, hy1 = 0.34 * size, 0.46 * size
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            in_v = vx0 <= x < vx1 and vy0 <= y < vy1
            in_h = hx0 <= x < hx1 and hy0 <= y < hy1
            row.append(FG if (in_v or in_h) else BG)
        rows.append(row)
    return png_bytes(size, size, rows)


out = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"
out.mkdir(parents=True, exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    (out / name).write_bytes(make_icon(size))
    print(f"wrote {name}")
