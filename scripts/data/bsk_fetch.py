#!/usr/bin/env python3
"""bskorea(대한성서공회) 개역한글판 전권 1189장을 받아 캐시에 쌓는다.

산출은 앱 데이터가 아니라 원자료 캐시다. 여기서 받은 캐시를
build_fulltext.py가 검증하고 src/data/fullText.json으로 만든다.

  python3 scripts/data/bsk_fetch.py <캐시경로.json>

중단해도 캐시에 남은 장은 다시 받지 않는다(재개 가능). 요청 간격은
0.25초 이상을 지킨다 — 1189장이면 약 20분이다.

절 번호 정규식이 합본 절(`4-5`)까지 매치한다는 점이 bsk_extract.py와
다르다. 개역한글에는 두 절이 한 덩어리로 인쇄된 자리가 19개 장에 있고,
`(\\d+)`만 쓰면 그 40개 절이 조용히 사라진다.
"""

import html
import json
import os
import re
import sys
import time
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
DELAY = 0.25

# 정경 순서대로 (bskorea 책 코드, 장수). canon.ts의 BOOKS와 같은 순서다.
BOOKS = [
    ("gen", 50), ("exo", 40), ("lev", 27), ("num", 36), ("deu", 34),
    ("jos", 24), ("jdg", 21), ("rut", 4), ("1sa", 31), ("2sa", 24),
    ("1ki", 22), ("2ki", 25), ("1ch", 29), ("2ch", 36), ("ezr", 10),
    ("neh", 13), ("est", 10), ("job", 42), ("psa", 150), ("pro", 31),
    ("ecc", 12), ("sng", 8), ("isa", 66), ("jer", 52), ("lam", 5),
    ("ezk", 48), ("dan", 12), ("hos", 14), ("jol", 3), ("amo", 9),
    ("oba", 1), ("jnh", 4), ("mic", 7), ("nam", 3), ("hab", 3),
    ("zep", 3), ("hag", 2), ("zec", 14), ("mal", 4), ("mat", 28),
    ("mrk", 16), ("luk", 24), ("jhn", 21), ("act", 28), ("rom", 16),
    ("1co", 16), ("2co", 13), ("gal", 6), ("eph", 6), ("php", 4),
    ("col", 4), ("1th", 5), ("2th", 3), ("1ti", 6), ("2ti", 4),
    ("tit", 3), ("phm", 1), ("heb", 13), ("jas", 5), ("1pe", 5),
    ("2pe", 3), ("1jn", 5), ("2jn", 1), ("3jn", 1), ("jud", 1),
    ("rev", 22),
]

# 합본 절(`4-5`)까지 잡는다 — bsk_extract.py의 `(\d+)`가 놓치던 자리다.
VERSE_RE = re.compile(
    r'<span class="number">(\d+(?:-\d+)?)&nbsp;.*?</span>(.*?)</font></span>', re.S
)


def fetch(code: str, chap: int) -> str:
    url = (
        "https://www.bskorea.or.kr/bible/korbibReadpage.php"
        f"?version=HAN&book={code}&chap={chap}"
    )
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1.5)
    raise AssertionError("unreachable")


def parse(page: str) -> dict[str, str]:
    """{'4' | '4-5': 본문} — 각주 팝업과 각주 마커를 지운다."""
    out: dict[str, str] = {}
    for m in VERSE_RE.finditer(page):
        seg = re.sub(r"<div[^>]*>.*?</div>", "", m.group(2), flags=re.S)  # 각주 본문
        seg = re.sub(r"<a class=comment.*?</a>", "", seg, flags=re.S)  # 각주 링크
        seg = re.sub(r"<[^>]+>", "", seg)
        seg = html.unescape(seg)
        seg = re.sub(r"\d+\)", "", seg)  # 잔여 각주 마커
        out[m.group(1)] = re.sub(r"\s+", " ", seg).strip()
    return out


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    out_path = sys.argv[1]
    cache: dict[str, dict[str, str]] = {}
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            cache = json.load(f)

    fetched = 0
    for book_no, (code, chapters) in enumerate(BOOKS, 1):
        for chap in range(1, chapters + 1):
            key = f"{book_no}:{chap}"
            if key in cache:
                continue
            cache[key] = parse(fetch(code, chap))
            fetched += 1
            if fetched % 100 == 0:
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(cache, f, ensure_ascii=False)
                print(f"... {fetched}장 (최근 {key})", flush=True)
            time.sleep(DELAY)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)
    verses = sum(len(v) for v in cache.values())
    print(f"완료 — {len(cache)}장 {verses}항목 (새로 받은 장 {fetched})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
