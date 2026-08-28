#!/usr/bin/env python3
"""bskorea 캐시를 검증하고 src/data/fullText.json을 만든다.

  python3 scripts/data/build_fulltext.py <캐시경로.json> [--check]

캐시는 bsk_fetch.py가 만든다. --check를 주면 파일을 쓰지 않고 검증만 한다.
게이트를 하나라도 통과하지 못하면 아무것도 쓰지 않고 종료 코드 1로 죽는다
(fail-closed) — 검증되지 않은 본문이 앱에 실리는 경로를 두지 않는다.

게이트
  1 구조      66권 1189장 31102절, canon.ts 장수 일치, 절 번호 연속, 라틴 0
  2 골든 495  암송 495구절과 toChars 기준·어절 기준 모두 495/495 일치
  3 역본      개역개정 전용 표기 0건, 개역한글 전용 표기 하한 유지
  4 사슬      xrefCandidates.json의 사슬 노드가 해석된다 (예외 고후 13:14 1건)

산출 형식 — {"창1": [절1, 절2, …]}
  배열 인덱스+1이 절 번호다. 개역한글에는 두 절이 한 덩어리로 인쇄된
  자리가 19개 장에 있고(예: 사 7:8-9), 그 덩어리는 첫 절 자리에 본문을
  두고 이어지는 절 자리를 null로 남긴다. 없는 절 번호를 지어내지도, 뒤
  절을 비우지도 않는다 — 조회하는 쪽이 null을 거슬러 올라가 덩어리의
  실제 범위를 알아내고 "사 7:8-9"로 밝혀 보여준다.
"""

import json
import pathlib
import re
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "src/data/fullText.json"
GOLD = ROOT / "src/data/verses.json"
XREF = ROOT / "src/data/xrefCandidates.json"

# 정경 순서 (약칭, 장수) — canon.ts의 TABLE과 같은 순서·값이다.
BOOKS = [
    ("창", 50), ("출", 40), ("레", 27), ("민", 36), ("신", 34), ("수", 24),
    ("삿", 21), ("룻", 4), ("삼상", 31), ("삼하", 24), ("왕상", 22), ("왕하", 25),
    ("대상", 29), ("대하", 36), ("스", 10), ("느", 13), ("에", 10), ("욥", 42),
    ("시", 150), ("잠", 31), ("전", 12), ("아", 8), ("사", 66), ("렘", 52),
    ("애", 5), ("겔", 48), ("단", 12), ("호", 14), ("욜", 3), ("암", 9),
    ("옵", 1), ("욘", 4), ("미", 7), ("나", 3), ("합", 3), ("습", 3),
    ("학", 2), ("슥", 14), ("말", 4), ("마", 28), ("막", 16), ("눅", 24),
    ("요", 21), ("행", 28), ("롬", 16), ("고전", 16), ("고후", 13), ("갈", 6),
    ("엡", 6), ("빌", 4), ("골", 4), ("살전", 5), ("살후", 3), ("딤전", 6),
    ("딤후", 4), ("딛", 3), ("몬", 1), ("히", 13), ("약", 5), ("벧전", 5),
    ("벧후", 3), ("요일", 5), ("요이", 1), ("요삼", 1), ("유", 1), ("계", 22),
]

# verses.json은 책 이름을 전체 이름으로 쓴다 — 약칭으로 잇는다.
FULL_NAMES = (
    "창세기 출애굽기 레위기 민수기 신명기 여호수아 사사기 룻기 사무엘상 사무엘하 "
    "열왕기상 열왕기하 역대상 역대하 에스라 느헤미야 에스더 욥기 시편 잠언 전도서 아가 "
    "이사야 예레미야 예레미야애가 에스겔 다니엘 호세아 요엘 아모스 오바댜 요나 미가 나훔 "
    "하박국 스바냐 학개 스가랴 말라기 마태복음 마가복음 누가복음 요한복음 사도행전 로마서 "
    "고린도전서 고린도후서 갈라디아서 에베소서 빌립보서 골로새서 데살로니가전서 "
    "데살로니가후서 디모데전서 디모데후서 디도서 빌레몬서 히브리서 야고보서 베드로전서 "
    "베드로후서 요한일서 요한이서 요한삼서 유다서 요한계시록"
).split()

TOTAL_VERSES = 31102

# 개역한글 고린도후서 13장은 13절까지다. 상호참조 데이터는 영어권 절 구분을
# 따라 13:14를 가리키는 자리가 있고, 그 한 건은 본문을 채울 수 없다.
CHAIN_EXCEPTIONS = {"고후 13:14"}

# ── 게이트 3: 역본 판별 ──────────────────────────────────────────────
# 개역개정판(1998)은 보호 중인 저작물이다. 섞이면 만료 저작물이 아니라
# 보호 중 저작물을 배포하게 되므로 자동 검사로 못박는다.
#
# '저희'·'그들'·'좇아'·'따라'는 단독 판별자로 쓰지 않는다 — 개역한글도
# '그들'과 '따라'를 쓴다.
RRV_ONLY = ["나병", "맹인", "파수꾼", "일꾼", "다리 저는", "막론하고",
            "청하건대", "여호와의 천사", "일찍이", "침례"]

# 실측치. 하한은 이 값의 90%로 잡아 장 단위 부분 오염을 잡는다.
KRV_ONLY = {"가라사대": 782, "가로되": 1911, "일찌기": 54, "문둥병": 51,
            "소경": 75, "파숫군": 37, "일군": 28, "절뚝발이": 14,
            "무론하고": 20, "세례": 101, "찐대": 64, "찐저": 62}

ENDING_SUFFIXES = ("니", "라", "어다", "로다", "며", "언정", "어", "로소이다")
JJI_MIN = 1943 * 9 // 10   # -ㄹ찌계 어미 실측 1943건의 90%
JI_MAX = 114               # -ㄹ지계 어미 실측 잔여 114건 — 늘면 혼입으로 본다

TOCHARS = re.compile(r"[^가-힣a-zA-Z0-9]")
LATIN = re.compile(r"[a-zA-Z]")


def to_chars(s: str) -> str:
    return TOCHARS.sub("", unicodedata.normalize("NFC", s))


def jongseong(c: str) -> int:
    o = ord(c) - 0xAC00
    return o % 28 if 0 <= o < 11172 else -1


def count_ending(blob: str, target: str) -> int:
    """ㄹ 받침 뒤의 `찌`/`지` 어미 — 개역한글은 -ㄹ찌, 개역개정은 -ㄹ지."""
    n = 0
    for i, c in enumerate(blob):
        if c == target and i > 0 and jongseong(blob[i - 1]) == 8:
            if blob[i + 1:].startswith(ENDING_SUFFIXES):
                n += 1
    return n


class Failure(Exception):
    pass


def build_chapters(cache: dict) -> dict[str, list]:
    """캐시 → {"창1": [본문|null, …]}. 합본 절은 첫 자리에 두고 뒤를 null로."""
    out: dict[str, list] = {}
    for book_no, (abbr, chapters) in enumerate(BOOKS, 1):
        for chap in range(1, chapters + 1):
            raw = cache.get(f"{book_no}:{chap}")
            if not raw:
                raise Failure(f"게이트 1 — 캐시에 {abbr}{chap}장이 없다")
            spans: list[tuple[int, int, str]] = []
            for key, text in raw.items():
                if "-" in key:
                    a, z = key.split("-")
                    spans.append((int(a), int(z), text))
                else:
                    spans.append((int(key), int(key), text))
            spans.sort()
            arr: list = []
            for start, end, text in spans:
                if start != len(arr) + 1:
                    raise Failure(
                        f"게이트 1 — {abbr}{chap}장 절 번호가 끊겼다: "
                        f"{len(arr) + 1}절이 와야 하는데 {start}절"
                    )
                arr.append(text)
                arr.extend([None] * (end - start))
            out[f"{abbr}{chap}"] = arr
    return out


def gate1(chapters: dict[str, list]) -> None:
    if len(chapters) != 1189:
        raise Failure(f"게이트 1 — 장 수 {len(chapters)}, 1189여야 한다")
    total = sum(len(v) for v in chapters.values())
    if total != TOTAL_VERSES:
        raise Failure(f"게이트 1 — 절 수 {total}, {TOTAL_VERSES}여야 한다")
    for abbr, n in BOOKS:
        if f"{abbr}{n}" not in chapters or f"{abbr}{n + 1}" in chapters:
            raise Failure(f"게이트 1 — {abbr} 장수가 canon과 다르다 ({n}장이어야)")
    for key, arr in chapters.items():
        for i, t in enumerate(arr):
            if t is None:
                continue
            if not t.strip():
                raise Failure(f"게이트 1 — {key}:{i + 1}이 빈 절이다")
            if LATIN.search(t):
                raise Failure(f"게이트 1 — {key}:{i + 1}에 라틴 문자: {t[:40]}")
    print(f"게이트 1 통과 — 1189장 {total}절, 빈 절 0, 라틴 0")


def text_at(arr: list, verse: int) -> str | None:
    """합본 덩어리를 거슬러 올라가 본문을 찾는다."""
    i = verse - 1
    if not 0 <= i < len(arr):
        return None
    while arr[i] is None:
        i -= 1
    return arr[i]


def gate2(chapters: dict[str, list]) -> None:
    abbr_of = {full: BOOKS[i][0] for i, full in enumerate(FULL_NAMES)}
    gold = json.loads(GOLD.read_text(encoding="utf-8"))["verses"]
    same_chars = same_words = 0
    diffs = []
    for g in gold:
        arr = chapters.get(f"{abbr_of[g['book']]}{g['chapter']}")
        if arr is None:
            raise Failure(f"게이트 2 — {g['ref']}의 장이 없다")
        parts, seen = [], set()
        for vn in g["verses"]:
            t = text_at(arr, vn)
            if t is None:
                raise Failure(f"게이트 2 — {g['ref']}의 {vn}절이 없다")
            if t in seen:      # 합본 덩어리를 두 번 잇지 않는다
                continue
            seen.add(t)
            parts.append(t)
        src = " ".join(parts)
        if to_chars(src) == to_chars(g["text"]):
            same_chars += 1
        else:
            diffs.append((g["ref"], src, g["text"]))
        if src.split() == g["text"].split():
            same_words += 1
    if same_chars != len(gold) or same_words != len(gold):
        for ref, a, b in diffs[:5]:
            print(f"  {ref}\n    전문: {a}\n    495 : {b}", file=sys.stderr)
        raise Failure(
            f"게이트 2 — 골든 {len(gold)}구절 중 toChars {same_chars} · "
            f"어절 {same_words}. 예외 목록으로 우회하지 말 것 — "
            "추출이나 파싱이 잘못된 것이다"
        )
    print(f"게이트 2 통과 — 골든 {len(gold)}/{len(gold)} (toChars·어절 양쪽)")


def gate3(chapters: dict[str, list]) -> None:
    blob = "\n".join(t for arr in chapters.values() for t in arr if t)
    found = [(w, blob.count(w)) for w in RRV_ONLY if w in blob]
    if found:
        raise Failure(f"게이트 3B — 개역개정 전용 표기 검출: {found}")
    low = [(w, blob.count(w), n) for w, n in KRV_ONLY.items()
           if blob.count(w) < n * 9 // 10]
    if low:
        raise Failure(f"게이트 3C — 개역한글 전용 표기가 하한 미달: {low}")
    jji = count_ending(blob, "찌")
    ji = count_ending(blob, "지")
    if jji < JJI_MIN:
        raise Failure(f"게이트 3A — -ㄹ찌계 어미 {jji}건, 하한 {JJI_MIN}")
    if ji > JI_MAX:
        raise Failure(f"게이트 3A — -ㄹ지계 어미 {ji}건, 상한 {JI_MAX}")
    print(f"게이트 3 통과 — 개역개정 전용어 0건, -ㄹ찌 {jji} / -ㄹ지 {ji}")


REF_RE = re.compile(r"^(\S+)\s+(\d+):(\d+)(?:-(\d+))?$")


def gate4(chapters: dict[str, list]) -> None:
    xref = json.loads(XREF.read_text(encoding="utf-8"))
    nodes = {n for cands in xref.values() for c in cands
             for chain in c["c"] for n in chain[:-1]}
    unresolved = set()
    for node in nodes:
        m = REF_RE.match(node)
        if not m:
            unresolved.add(node)
            continue
        arr = chapters.get(f"{m.group(1)}{m.group(2)}")
        last = int(m.group(4) or m.group(3))
        if arr is None or text_at(arr, int(m.group(3))) is None \
                or text_at(arr, last) is None:
            unresolved.add(node)
    if unresolved - CHAIN_EXCEPTIONS:
        raise Failure(f"게이트 4 — 해석 못한 사슬 노드: "
                      f"{sorted(unresolved - CHAIN_EXCEPTIONS)[:10]}")
    print(f"게이트 4 통과 — 사슬 노드 {len(nodes) - len(unresolved)}"
          f"/{len(nodes)} 해석 (예외 {sorted(unresolved)})")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 2
    cache = json.loads(pathlib.Path(args[0]).read_text(encoding="utf-8"))
    try:
        chapters = build_chapters(cache)
        gate1(chapters)
        gate2(chapters)
        gate3(chapters)
        gate4(chapters)
    except Failure as e:
        print(f"\n실패 — {e}", file=sys.stderr)
        return 1
    if "--check" in sys.argv:
        print("검증만 했다 — 파일을 쓰지 않았다")
        return 0
    OUT.write_text(
        json.dumps(chapters, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"\n{OUT.relative_to(ROOT)} — {OUT.stat().st_size:,} B")
    return 0


if __name__ == "__main__":
    sys.exit(main())
