#!/usr/bin/env python3
"""
PWA 아이콘 생성기 — Ivan 디자인 시스템 (The Quiet Scriptorium)
고해상도 원본 마스터(scripts/data/master_icon.png)로부터 Area-averaging 다운샘플링을 통해
PWA 표준 아이콘 세트(apple-touch-icon, icon-192, icon-512, icon-512-maskable)를 생성한다.
"""
import struct, zlib, pathlib

def decode_png(path):
    with open(path, 'rb') as f:
        data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    idx = 8
    idat = []
    width, height = 0, 0
    while idx < len(data):
        length = struct.unpack('>I', data[idx:idx+4])[0]
        ctype = data[idx+4:idx+8]
        cdata = data[idx+8:idx+8+length]
        idx += 8 + length + 4
        if ctype == b'IHDR':
            width, height = struct.unpack('>II', cdata[:8])
            bit_depth, color_type = cdata[8], cdata[9]
        elif ctype == b'IDAT':
            idat.append(cdata)
        elif ctype == b'IEND':
            break
    raw = zlib.decompress(b''.join(idat))
    bpp = 4 if color_type == 6 else 3
    stride = width * bpp
    pixels = []
    r_idx = 0
    prev_row = [0] * stride
    for y in range(height):
        filter_type = raw[r_idx]
        r_idx += 1
        row = list(raw[r_idx:r_idx+stride])
        r_idx += stride
        if filter_type == 0:
            cur_row = row
        elif filter_type == 1:
            cur_row = []
            for i in range(stride):
                left = cur_row[i - bpp] if i >= bpp else 0
                cur_row.append((row[i] + left) & 0xff)
        elif filter_type == 2:
            cur_row = [(row[i] + prev_row[i]) & 0xff for i in range(stride)]
        elif filter_type == 3:
            cur_row = []
            for i in range(stride):
                left = cur_row[i - bpp] if i >= bpp else 0
                up = prev_row[i]
                cur_row.append((row[i] + ((left + up) >> 1)) & 0xff)
        elif filter_type == 4:
            cur_row = []
            for i in range(stride):
                a = cur_row[i - bpp] if i >= bpp else 0
                b = prev_row[i]
                c = prev_row[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                cur_row.append((row[i] + pr) & 0xff)
        prev_row = cur_row
        pixels.append(cur_row)
    return width, height, bpp, pixels

def encode_png(width, height, rows):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )

def resize_box(src_w, src_h, bpp, src_pixels, target_size, pad_factor=1.0):
    target_w = target_size
    target_h = target_size
    inner_size = int(target_size * pad_factor)
    offset = (target_size - inner_size) // 2
    corner_r = src_pixels[0][0]
    corner_g = src_pixels[0][1]
    corner_b = src_pixels[0][2]
    scale = src_w / inner_size
    
    out_rows = []
    for ty in range(target_h):
        row = []
        for tx in range(target_w):
            if offset <= tx < offset + inner_size and offset <= ty < offset + inner_size:
                ix = tx - offset
                iy = ty - offset
                sx0 = int(ix * scale)
                sx1 = min(src_w, max(sx0 + 1, int((ix + 1) * scale)))
                sy0 = int(iy * scale)
                sy1 = min(src_h, max(sy0 + 1, int((iy + 1) * scale)))
                count = (sx1 - sx0) * (sy1 - sy0)
                r_sum, g_sum, b_sum = 0, 0, 0
                for sy in range(sy0, sy1):
                    s_row = src_pixels[sy]
                    for sx in range(sx0, sx1):
                        idx = sx * bpp
                        r_sum += s_row[idx]
                        g_sum += s_row[idx + 1]
                        b_sum += s_row[idx + 2]
                row.append((r_sum // count, g_sum // count, b_sum // count))
            else:
                row.append((corner_r, corner_g, corner_b))
        out_rows.append(row)
    return encode_png(target_w, target_h, out_rows)

def main():
    root = pathlib.Path(__file__).resolve().parent.parent
    master_path = root / "public" / "icons" / "master_icon.png"
    out_dir = root / "public" / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)
    
    src_w, src_h, bpp, pixels = decode_png(str(master_path))
    targets = [
        ("apple-touch-icon.png", 180, 1.0),
        ("icon-192.png", 192, 1.0),
        ("icon-512.png", 512, 1.0),
        ("icon-512-maskable.png", 512, 0.8),
    ]
    for name, size, pad in targets:
        data = resize_box(src_w, src_h, bpp, pixels, size, pad)
        (out_dir / name).write_bytes(data)
        print(f"Generated {name} ({size}x{size})")

if __name__ == "__main__":
    main()
