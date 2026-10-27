#!/usr/bin/env python3
"""
PWA 아이콘 생성기 — Ivan 디자인 시스템: 침묵의 필사실 (The Quiet Scriptorium)
펼쳐진 성경책(양피지)과 그 위를 비추는 따뜻한 등불(은혜의 불꽃).
외부 그래픽 라이브러리 없이 퓨어 파이썬(struct, zlib)과 서브픽셀 수퍼샘플링으로
부드러운 안티앨리어싱 고해상도 PNG를 생성한다.
"""
import struct, zlib, math, pathlib

def render_icon(size, is_maskable=False):
    # Supersampling 2x for silky antialiasing
    scale = 2
    W = size * scale
    H = size * scale
    
    # ── 품격 있는 팔레트 (RGB) ──────────────────────────────
    # 배경: 짙은 묵빛과 흑요석(Deep Obsidian Ink)
    BG_BASE = (14, 18, 28)         # #0e121c
    BG_CENTER = (22, 29, 44)       # 은은한 심도 #161d2c
    
    # 등불(Sacred Flame): 따뜻한 촛불 금빛
    GOLD_CORE = (252, 214, 118)    # #fcd676
    GOLD_MID = (235, 172, 64)      # #ebac40
    GOLD_OUTER = (204, 138, 38)    # #cc8a26
    
    # 펼쳐진 말씀(Scripture Folio): 부드러운 고서 양피지
    PAGE_PARCHMENT = (242, 237, 226) # #f2ede2
    PAGE_SHADOW = (18, 23, 35)       # 중앙 골짜기 깊은 음영
    PAGE_BORDER = (165, 155, 138)    # 가장자리 섬세한 금박/가죽 마감
    BOOK_RIBBON = (212, 152, 54)     # 가름끈(Bookmark Ribbon) 금빛
    
    cx, cy = W / 2.0, H / 2.0
    
    # Maskable 아이콘은 안전 구역(Safe zone 80%)을 위해 스케일 0.78 적용
    s_factor = 0.78 if is_maskable else 0.94
    
    # 기하학 파라미터
    spine_x = cx
    spine_top_y = cy + 0.03 * H * s_factor
    spine_bot_y = cy + 0.32 * H * s_factor
    page_w = 0.32 * W * s_factor
    page_h = 0.28 * H * s_factor
    
    flame_cx = cx
    flame_base_y = cy - 0.01 * H * s_factor
    flame_top_y = cy - 0.29 * H * s_factor
    flame_rx = 0.075 * W * s_factor
    
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            r_acc, g_acc, b_acc = 0, 0, 0
            for sy in range(scale):
                for sx in range(scale):
                    px = x * scale + sx
                    py = y * scale + sy
                    
                    # 1. 배경 방사형 은은한 심도 (Vignette)
                    dx_c = (px - cx) / (W * 0.5)
                    dy_c = (py - cy) / (H * 0.5)
                    dist_c = math.sqrt(dx_c*dx_c + dy_c*dy_c)
                    bg_t = min(1.0, dist_c * 0.85)
                    r = int(BG_CENTER[0] * (1.0 - bg_t) + BG_BASE[0] * bg_t)
                    g = int(BG_CENTER[1] * (1.0 - bg_t) + BG_BASE[1] * bg_t)
                    b = int(BG_CENTER[2] * (1.0 - bg_t) + BG_BASE[2] * bg_t)
                    
                    # 2. 마스크 가능한 원형/스퀘어클 미세 금빛 테두리 링
                    if not is_maskable:
                        dist_px = math.sqrt((px - cx)**2 + (py - cy)**2)
                        ring_r = 0.44 * W
                        ring_diff = abs(dist_px - ring_r)
                        if ring_diff < 1.5 * scale:
                            ring_alpha = max(0.0, 1.0 - ring_diff / (1.5 * scale)) * 0.28
                            r = int(r * (1.0 - ring_alpha) + GOLD_MID[0] * ring_alpha)
                            g = int(g * (1.0 - ring_alpha) + GOLD_MID[1] * ring_alpha)
                            b = int(b * (1.0 - ring_alpha) + GOLD_MID[2] * ring_alpha)
                    
                    # 3. 펼쳐진 성경책 (Open Folio Pages)
                    in_book = False
                    book_color = None
                    
                    # 좌우 양면
                    if spine_top_y - 0.08*H <= py <= spine_bot_y + 0.08*H:
                        # 왼쪽 페이지
                        if spine_x - page_w <= px <= spine_x:
                            u = (spine_x - px) / page_w  # 0 at spine, 1 at outer edge
                            # 우아한 종이 곡선 (페이지 굴곡)
                            curve = math.sin(u * math.pi) * 0.045 * H * s_factor
                            y_top = spine_top_y - curve + u * 0.035 * H * s_factor
                            y_bot = spine_bot_y - curve + u * 0.035 * H * s_factor
                            if y_top <= py <= y_bot:
                                in_book = True
                                # 등불로부터의 거리 기반 페이지 라이팅
                                d_light = math.sqrt(((px - flame_cx)/(W*0.3))**2 + ((py - flame_base_y)/(H*0.3))**2)
                                light_warmth = max(0.0, 1.0 - d_light * 0.5) * 0.15
                                
                                if u < 0.12:  # 책 중앙 책등 그림자 (Spine shadow)
                                    s_val = u / 0.12
                                    base_c = (
                                        int(PAGE_SHADOW[0]*(1-s_val) + PAGE_PARCHMENT[0]*s_val),
                                        int(PAGE_SHADOW[1]*(1-s_val) + PAGE_PARCHMENT[1]*s_val),
                                        int(PAGE_SHADOW[2]*(1-s_val) + PAGE_PARCHMENT[2]*s_val)
                                    )
                                elif u > 0.94:  # 외곽 절단면 음영
                                    base_c = PAGE_BORDER
                                else:
                                    base_c = PAGE_PARCHMENT
                                
                                # 등불 반사광 합성
                                book_color = (
                                    min(255, int(base_c[0] + GOLD_CORE[0] * light_warmth)),
                                    min(255, int(base_c[1] + GOLD_CORE[1] * light_warmth)),
                                    min(255, int(base_c[2] + GOLD_CORE[2] * light_warmth * 0.5))
                                )
                                
                        # 오른쪽 페이지
                        elif spine_x <= px <= spine_x + page_w:
                            u = (px - spine_x) / page_w
                            curve = math.sin(u * math.pi) * 0.045 * H * s_factor
                            y_top = spine_top_y - curve + u * 0.035 * H * s_factor
                            y_bot = spine_bot_y - curve + u * 0.035 * H * s_factor
                            if y_top <= py <= y_bot:
                                in_book = True
                                d_light = math.sqrt(((px - flame_cx)/(W*0.3))**2 + ((py - flame_base_y)/(H*0.3))**2)
                                light_warmth = max(0.0, 1.0 - d_light * 0.5) * 0.15
                                
                                if u < 0.12:
                                    s_val = u / 0.12
                                    base_c = (
                                        int(PAGE_SHADOW[0]*(1-s_val) + PAGE_PARCHMENT[0]*s_val),
                                        int(PAGE_SHADOW[1]*(1-s_val) + PAGE_PARCHMENT[1]*s_val),
                                        int(PAGE_SHADOW[2]*(1-s_val) + PAGE_PARCHMENT[2]*s_val)
                                    )
                                elif u > 0.94:
                                    base_c = PAGE_BORDER
                                else:
                                    base_c = PAGE_PARCHMENT
                                
                                book_color = (
                                    min(255, int(base_c[0] + GOLD_CORE[0] * light_warmth)),
                                    min(255, int(base_c[1] + GOLD_CORE[1] * light_warmth)),
                                    min(255, int(base_c[2] + GOLD_CORE[2] * light_warmth * 0.5))
                                )
                    
                    if in_book and book_color:
                        r, g, b = book_color
                        
                    # 4. 가름끈 (Bookmark Ribbon) — 책 하단으로 살짝 흘러내리는 금빛 리본
                    ribbon_y0 = spine_bot_y - 0.02 * H * s_factor
                    ribbon_y1 = spine_bot_y + 0.10 * H * s_factor
                    if ribbon_y0 <= py <= ribbon_y1:
                        v = (py - ribbon_y0) / (ribbon_y1 - ribbon_y0)
                        ribbon_x = spine_x + math.sin(v * math.pi * 0.9) * 0.035 * W * s_factor
                        if abs(px - ribbon_x) < 0.012 * W * s_factor:
                            r, g, b = BOOK_RIBBON
                    
                    # 5. 거룩한 등불 / 불꽃 (Sacred Lamp Flame)
                    # 유선형 눈물방울 / 불꽃 곡선
                    if flame_top_y <= py <= flame_base_y + 0.02 * H * s_factor:
                        t = (py - flame_top_y) / (flame_base_y - flame_top_y)  # 0: 불꽃 끝, 1: 밑동
                        if 0.0 <= t <= 1.0:
                            # 유려한 불꽃 형태 곡선
                            flame_w = flame_rx * math.sin(t * math.pi * 0.88) * (1.15 - 0.25 * t)
                            flame_dx = abs(px - flame_cx)
                            if flame_dx <= flame_w:
                                q = flame_dx / max(1.0, flame_w)  # 0 at center, 1 at edge
                                if q < 0.45:
                                    # 백금/순금빛 핵
                                    k = q / 0.45
                                    f_r = int(GOLD_CORE[0]*(1-k) + GOLD_MID[0]*k)
                                    f_g = int(GOLD_CORE[1]*(1-k) + GOLD_MID[1]*k)
                                    f_b = int(GOLD_CORE[2]*(1-k) + GOLD_MID[2]*k)
                                else:
                                    # 앰버/따뜻한 금빛 외곽
                                    k = (q - 0.45) / 0.55
                                    alpha = (1.0 - k)
                                    f_r = int(GOLD_MID[0]*alpha + r*(1-alpha))
                                    f_g = int(GOLD_MID[1]*alpha + g*(1-alpha))
                                    f_b = int(GOLD_MID[2]*alpha + b*(1-alpha))
                                r, g, b = f_r, f_g, f_b
                    
                    # 6. 불꽃 주변의 은은한 온화한 광배 (Sacred Halo Glow)
                    d_flame_c = math.sqrt(((px - flame_cx)/(flame_rx*2.4))**2 + ((py - (flame_top_y+flame_base_y)*0.5)/(flame_rx*2.4))**2)
                    if d_flame_c < 1.0 and not in_book:
                        halo_alpha = (1.0 - d_flame_c)**2 * 0.22
                        r = min(255, int(r * (1 - halo_alpha) + GOLD_MID[0] * halo_alpha))
                        g = min(255, int(g * (1 - halo_alpha) + GOLD_MID[1] * halo_alpha))
                        b = min(255, int(b * (1 - halo_alpha) + GOLD_MID[2] * halo_alpha))

                    r_acc += r
                    g_acc += g
                    b_acc += b
            
            samples = scale * scale
            row.append((r_acc // samples, g_acc // samples, b_acc // samples, 255))
        rows.append(row)
    
    # PNG 압축 포맷 빌드
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in rows)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )

def main():
    out = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    
    icons = [
        ("apple-touch-icon.png", 180, False),
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-512-maskable.png", 512, True),
    ]
    
    for name, size, maskable in icons:
        p = out / name
        p.write_bytes(render_icon(size, is_maskable=maskable))
        print(f"✓ Generated {name} ({size}x{size}, maskable={maskable})")

if __name__ == "__main__":
    main()
