#!/usr/bin/env python3
"""디자인 토큰의 명도비를 실제로 계산해 WCAG AA 미달을 찾는다.

토큰 값은 src/styles/tokens.css에서 직접 읽으므로, 색을 바꾸면 이 스크립트의
결과가 함께 바뀐다. 검사 조합은 앱에서 실제로 쓰이는 (전경, 배경) 쌍만 적었다.

기준 (WCAG 2.2 AA):
  - 일반 텍스트          4.5:1
  - 큰 텍스트(≥18.66px bold 또는 ≥24px)  3.0:1
  - UI 컴포넌트 경계·아이콘  3.0:1

실행: npm run audit:contrast
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

TOKENS_CSS = Path(__file__).resolve().parents[1] / "src" / "styles" / "tokens.css"

AA_TEXT = 4.5
AA_LARGE = 3.0
AA_UI = 3.0

# --color-line은 장식용 헤어라인이라 WCAG 1.4.11 대상이 아니다 (컨트롤 식별에
# 필요하지 않은 구분선). 컨트롤 경계는 --color-border를 쓰고 3:1을 요구한다.


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (
        0.2126 * srgb_to_linear(r)
        + 0.7152 * srgb_to_linear(g)
        + 0.0722 * srgb_to_linear(b)
    )


def contrast(fg: str, bg: str) -> float:
    l1, l2 = relative_luminance(fg), relative_luminance(bg)
    lo, hi = sorted((l1, l2))
    return (hi + 0.05) / (lo + 0.05)


def mix(fg: str, bg: str, pct: float) -> str:
    """color-mix(in srgb, fg pct%, transparent)를 bg 위에 올린 실효 색."""
    def ch(c: str, i: int) -> int:
        h = c.lstrip("#")
        return int(h[i : i + 2], 16)

    out = []
    for i in (0, 2, 4):
        v = round(ch(fg, i) * pct + ch(bg, i) * (1 - pct))
        out.append(max(0, min(255, v)))
    return "#{:02x}{:02x}{:02x}".format(*out)


def load_palettes() -> dict[str, dict[str, str]]:
    """tokens.css에서 --palette-{theme}-{name}: #hex 를 읽는다."""
    css = TOKENS_CSS.read_text(encoding="utf-8")
    palettes: dict[str, dict[str, str]] = {"dark": {}, "light": {}}
    for theme, name, value in re.findall(
        r"--palette-(dark|light)-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})", css
    ):
        palettes[theme][name] = value
    return palettes


# (전경 토큰, 배경 토큰, 기준, 설명)
CHECKS: list[tuple[str, str, float, str]] = [
    ("text", "bg", AA_TEXT, "본문 텍스트 / 페이지 배경"),
    ("text", "panel", AA_TEXT, "본문 텍스트 / 패널"),
    ("text", "panel2", AA_TEXT, "본문 텍스트 / 입력·버튼 배경"),
    ("muted", "bg", AA_TEXT, "보조 텍스트 / 페이지 배경"),
    ("muted", "panel", AA_TEXT, "보조 텍스트 / 패널 (.muted .small 다수)"),
    ("muted", "panel2", AA_TEXT, "보조 텍스트 / 입력 배경 (.fl-dots, .rate-interval)"),
    ("accent", "bg", AA_LARGE, "강조 숫자(1.6rem) / 페이지 배경"),
    ("accent", "panel", AA_LARGE, "강조 숫자 / 패널"),
    ("accent", "panel2", AA_TEXT, "첫글자 공개 텍스트 / 입력 배경 (.fl-revealed)"),
    ("accent-text", "accent", AA_TEXT, "주 버튼 라벨 / 주 버튼 배경"),
    ("blue", "panel", AA_TEXT, "장절·모드 태그 / 패널 (.answer-ref, .mode-tag)"),
    ("blue", "bg", AA_TEXT, "그룹 제목 / 페이지 배경 (.group-title)"),
    ("ok", "panel", AA_TEXT, "통과 등급 라벨 / 패널 (.rate-3)"),
    ("warn", "panel", AA_TEXT, "주의 등급 라벨 / 패널 (.rate-2)"),
    ("bad", "panel", AA_TEXT, "실패 등급 라벨 / 패널 (.rate-1, .diff-miss)"),
    ("border", "panel", AA_UI, "컨트롤 경계 / 패널 (입력·버튼 테두리)"),
    ("border", "panel2", AA_UI, "컨트롤 경계 / 입력 배경"),
    ("border", "bg", AA_UI, "컨트롤 경계 / 페이지 배경"),
    ("accent", "panel", AA_UI, "포커스 링 / 패널 (UI)"),
]

# 반투명 배지: color-mix(in srgb, <색> N%, transparent)를 패널 위에 올린 실효 배경
MIX_CHECKS: list[tuple[str, str, float, float, str]] = [
    ("ok", "ok", 0.18, AA_TEXT, ".diff-score.good — 색 18% 배경 위 같은 색 텍스트"),
    ("warn", "warn", 0.18, AA_TEXT, ".diff-score.warn"),
    ("bad", "bad", 0.18, AA_TEXT, ".diff-score.bad"),
    ("warn", "warn", 0.15, AA_TEXT, ".st-learning 배지"),
    ("ok", "ok", 0.15, AA_TEXT, ".st-done 배지"),
]


def main() -> int:
    palettes = load_palettes()
    failures = 0
    for theme in ("dark", "light"):
        p = palettes[theme]
        if not p:
            print(f"토큰을 읽지 못했습니다: {TOKENS_CSS}")
            return 2
        print(f"\n{'=' * 74}\n{theme.upper()} 테마\n{'=' * 74}")
        print(f"{'조합':<46} {'명도비':>7} {'기준':>5}  판정")
        for fg, bg, need, label in CHECKS:
            if fg not in p or bg not in p:
                print(f"  누락된 토큰: {fg} 또는 {bg}")
                failures += 1
                continue
            ratio = contrast(p[fg], p[bg])
            ok = ratio >= need
            if not ok:
                failures += 1
            print(f"  {label:<44} {ratio:6.2f} {need:5.1f}  {'OK' if ok else 'FAIL'}")
        for fg, mixc, pct, need, label in MIX_CHECKS:
            eff_bg = mix(p[mixc], p["panel"], pct)
            ratio = contrast(p[fg], eff_bg)
            ok = ratio >= need
            if not ok:
                failures += 1
            print(f"  {label:<44} {ratio:6.2f} {need:5.1f}  {'OK' if ok else 'FAIL'}")

    print(f"\n총 미달 {failures}건")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
