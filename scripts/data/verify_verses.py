#!/usr/bin/env python3
"""src/data/verses.json 전수 대조.

대조 가능 범위는 원문 소스가 무엇을 담고 있는지에 달려 있다:
  - scripts/data/tms180.txt : 장절 + 본문  → 180구절 본문 어절 단위 대조 가능
  - scripts/data/dep242.txt : 장절만 (본문 없음) → DEP242는 장절·주제 구조만 대조
  - 5확신(5)·8동행(8)·60구절(60) : 저장소에 독립 소스가 없음 → 내부 정합성만

출력은 (a) 확실한 오류 / (b) 판단 필요 / (c) 정상으로 분류한다.
실행: python3 scripts/data/verify_verses.py
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSES_JSON = ROOT / "src" / "data" / "verses.json"
TMS180_TXT = ROOT / "scripts" / "data" / "tms180.txt"
DEP242_TXT = ROOT / "scripts" / "data" / "dep242.txt"

certain: list[str] = []      # (a) 확실한 오류
review: list[str] = []       # (b) 판단 필요
notes: list[str] = []        # (c) 정상 확인 내역
orthography: list[str] = []  # 역본 표기 차이 (정당한 차이로 별도 분류)
spacing: list[str] = []      # 띄어쓰기만 다른 구절 (채점 무영향)


def norm_words(text: str) -> list[str]:
    """어절 단위 비교용 정규화: NFC, 구두점 제거, 공백 정리."""
    t = unicodedata.normalize("NFC", text)
    t = re.sub(r"[^\uac00-\ud7a3a-zA-Z0-9\s]", " ", t)
    return t.split()


def norm_chars(text: str) -> str:
    """글자 단위 비교용: 공백까지 제거 (띄어쓰기 차이를 별도 분류하기 위해)."""
    return "".join(norm_words(text))


def parse_ref_token(tok: str) -> tuple[str, int, list[int]] | None:
    """'요1:1,14' / '시 42:1' / '대하16:9상' → (약칭, 장, [절...])"""
    tok = tok.strip()
    m = re.match(r"^([가-힣]+)\s*(\d+)\s*:\s*([\d,\-~상하절\s]+)$", tok)
    if not m:
        return None
    book, chap, rest = m.group(1), int(m.group(2)), m.group(3)
    verses: list[int] = []
    for part in rest.replace("절", "").split(","):
        part = part.strip()
        if not part:
            continue
        half = part.rstrip("상하")
        rng = re.match(r"^(\d+)\s*[-~]\s*(\d+)$", half)
        if rng:
            a, b = int(rng.group(1)), int(rng.group(2))
            verses.extend(range(a, b + 1))
        elif half.isdigit():
            verses.append(int(half))
        else:
            return None
    return (book, chap, verses) if verses else None


# ─────────────────────────────────────────────────────────────
# 데이터 적재
# ─────────────────────────────────────────────────────────────
data = json.loads(VERSES_JSON.read_text(encoding="utf-8"))
verses = data["verses"]
topics = {t["key"]: t for t in data["topics"]}
sections = {s["key"]: s for s in data["sections"]}
collections = {c["key"]: c for c in data["collections"]}


def collection_of(v: dict) -> str:
    return sections[topics[v["topicKey"]]["section"]]["collection"]


# 장절 토큰은 실제 책 약칭으로만 시작해야 한다 — 앞말이 붙어 잘못 잡히는 것을 막는다.
# 긴 약칭을 먼저 시도해야 '요일'이 '요'로 잘리지 않는다.
BOOK_ABBRS = sorted({v["bookAbbr"] for v in verses}, key=len, reverse=True)
BOOK_REF_RE = re.compile(
    r"(?:" + "|".join(map(re.escape, BOOK_ABBRS)) + r")\s*\d+\s*:\s*\d+(?:[,\-~]\d+)*[상하]?"
)

by_collection: dict[str, list[dict]] = defaultdict(list)
for v in verses:
    by_collection[collection_of(v)].append(v)

notes.append(
    "구절 총계: "
    + " · ".join(f"{k} {len(by_collection[k])}" for k in ["AS", "LV", "TMS60", "DEP", "TMS180"])
    + f" = {len(verses)}"
)

# ─────────────────────────────────────────────────────────────
# 1. TMS180 본문 어절 단위 전수 대조 (원문에 본문이 있는 유일한 컬렉션)
# ─────────────────────────────────────────────────────────────
tms_entries: list[tuple[str, str]] = []  # (ref 원문 토큰, 본문)
for raw in TMS180_TXT.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line:
        continue
    m = re.match(r"^([가-힣]+\s*\d+\s*:\s*[\d,\-~]+)\s+(.+)$", line)
    if m and len(m.group(2)) > 8:
        tms_entries.append((m.group(1).strip(), m.group(2).strip()))

tms_json = by_collection["TMS180"]
notes.append(f"tms180.txt에서 추출한 (장절+본문) 항목 {len(tms_entries)}개 / JSON TMS180 {len(tms_json)}구절")

if len(tms_entries) != len(tms_json):
    certain.append(
        f"TMS180 항목 수 불일치: 원문 {len(tms_entries)}개 vs JSON {len(tms_json)}개"
    )

# 원문 순서 = JSON 순서라는 전제로 1:1 대조하고, 장절이 어긋나면 즉시 보고
space_diff = 0
punct_diff = 0
matched = 0
for i, (src_ref, src_text) in enumerate(tms_entries):
    if i >= len(tms_json):
        break
    v = tms_json[i]
    parsed = parse_ref_token(src_ref)
    if parsed is None:
        review.append(f"tms180.txt {i+1}번째 장절 토큰을 파싱할 수 없음: {src_ref!r}")
        continue
    book, chap, vs = parsed
    if book != v["bookAbbr"] or chap != v["chapter"] or vs != v["verses"]:
        certain.append(
            f"[{v['id']}] 장절 불일치: 원문 {src_ref} vs JSON "
            f"{v['bookAbbr']}{v['chapter']}:{','.join(map(str, v['verses']))}"
        )
        continue

    if src_text == v["text"]:
        matched += 1
        continue
    sw, jw = norm_words(src_text), norm_words(v["text"])
    if sw == jw:
        punct_diff += 1
        matched += 1
        continue
    if norm_chars(src_text) == norm_chars(v["text"]):
        space_diff += 1
        spacing.append(f"[{v['id']}] {v['refAbbr']}")
        continue
    # 어절 단위로 어디가 다른지 본다
    diff_src = [w for w in sw if w not in jw]
    diff_json = [w for w in jw if w not in sw]

    # 개역한글(1961)은 '-ㄹ찌' 계열 표기를 쓰고 개역개정이 '-ㄹ지'로 바꿨다.
    # verses.json은 세 컬렉션 전체에서 '찌' 17건 / '지' 0건으로 일관되므로
    # 이 차이는 JSON 오류가 아니라 tms180.txt(블로그 출처)의 현대화 표기다.
    if len(diff_src) == len(diff_json) == 1:
        a, b = diff_src[0], diff_json[0]
        if a.replace("지", "찌") == b:
            orthography.append(f"[{v['id']}] {v['refAbbr']} 원문 {a} ↔ JSON {b}")
            matched += 1
            continue
        review.append(
            f"[{v['id']}] {v['refAbbr']} 한 어절 차이 — 원문 {a!r} vs JSON {b!r}\n"
            f"      원문: {src_text}\n      JSON: {v['text']}"
        )
        continue

    certain.append(
        f"[{v['id']}] {v['refAbbr']} 본문 어절 불일치\n"
        f"      원문:      {src_text}\n"
        f"      JSON:      {v['text']}\n"
        f"      원문에만:  {diff_src}\n"
        f"      JSON에만:  {diff_json}"
    )

notes.append(
    f"TMS180 본문 대조: 일치 {matched}/{len(tms_json)} "
    f"(구두점 차이 허용 {punct_diff}건, 개역한글 '-ㄹ찌' 표기 차이 {len(orthography)}건)"
)
notes.append(
    f"TMS180 띄어쓰기만 다른 구절 {space_diff}건 — 채점은 띄어쓰기를 무시하므로"
    " word-perfect 판정에 영향 없음 (domain/grading.ts의 toChars)"
)
if orthography:
    notes.append(
        "개역한글 표기 차이 (JSON이 정본, tms180.txt가 현대화된 쪽): "
        + "; ".join(o.split("] ")[0].lstrip("[") for o in orthography)
    )

# ─────────────────────────────────────────────────────────────
# 2. DEP242 장절·주제 구조 대조 (원문에 본문 없음)
# ─────────────────────────────────────────────────────────────
# 원문의 주제 줄 형식이 여러 가지(번호/별표/공백)이므로 모든 줄에서 장절 토큰을
# 긁어모아 다중집합으로 비교한다 — 주제 파싱 실패가 장절 대조를 가리지 않게.
dep_refs: list[tuple[str, str]] = []  # (줄 내용, ref 토큰)
for raw in DEP242_TXT.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith(("[출처]", "window.", "entryId", "}")):
        continue
    for tok in re.findall(BOOK_REF_RE, line):
        dep_refs.append((line[:30], tok.strip()))

dep_json = by_collection["DEP"]
notes.append(f"dep242.txt에서 추출한 장절 {len(dep_refs)}개 / JSON DEP {len(dep_json)}구절")

src_keys = Counter()
for title, tok in dep_refs:
    p = parse_ref_token(tok)
    if p is None:
        review.append(f"dep242.txt 장절 파싱 실패: {tok!r} (주제: {title})")
        continue
    src_keys[(p[0], p[1], tuple(p[2]))] += 1

json_keys = Counter(
    (v["bookAbbr"], v["chapter"], tuple(v["verses"])) for v in dep_json
)

only_src = src_keys - json_keys
only_json = json_keys - src_keys
if only_src:
    for (b, c, vs), n in sorted(only_src.items()):
        review.append(
            f"DEP: 원문에만 있는 장절 {b}{c}:{','.join(map(str, vs))} ×{n} "
            "(반절 표기·범위 표기 차이 가능)"
        )
if only_json:
    for (b, c, vs), n in sorted(only_json.items()):
        review.append(
            f"DEP: JSON에만 있는 장절 {b}{c}:{','.join(map(str, vs))} ×{n} "
            "(원문 표기가 축약형일 수 있음)"
        )
if not only_src and not only_json:
    notes.append("DEP242 장절 집합이 원문과 정확히 일치")

# 세계비전 9번째 주제 보완이 유지되는지 (README에 기록된 사용자 책자 대조 결과)
d8 = [v for v in dep_json if topics[v["topicKey"]]["section"] == "D8"]
promise = [v for v in d8 if topics[v["topicKey"]]["title"] == "약속성취의 영광"]
if len(promise) != 2:
    certain.append(f"세계비전 '약속성취의 영광' 구절이 2개가 아님: {len(promise)}개")
else:
    notes.append(
        "세계비전 '약속성취의 영광' 2구절 유지: "
        + ", ".join(v["refAbbr"] for v in promise)
    )

# ─────────────────────────────────────────────────────────────
# 3. 장절 표기 ↔ 본문 절 개수 정합성 (반절 구절 4건은 의도된 예외)
# ─────────────────────────────────────────────────────────────
half_marks = [v for v in verses if re.search(r"[상하]\s*$", v["refAbbr"]) or "상" in v["ref"] or "하" in v["ref"]]
notes.append(f"반절 표기(상/하) 구절 {len(half_marks)}건: " + ", ".join(v["refAbbr"] for v in half_marks))

for v in verses:
    if not v["verses"]:
        certain.append(f"[{v['id']}] verses 배열이 비어 있음")
    if sorted(v["verses"]) != v["verses"]:
        review.append(f"[{v['id']}] {v['refAbbr']} 절 번호가 오름차순이 아님: {v['verses']}")
    if len(set(v["verses"])) != len(v["verses"]):
        certain.append(f"[{v['id']}] {v['refAbbr']} 절 번호 중복: {v['verses']}")
    # refAbbr 안의 장절이 verses 배열과 맞는지
    p = parse_ref_token(v["refAbbr"].split(" ", 1)[-1] if " " in v["refAbbr"] else v["refAbbr"])
    if p and p[2] != v["verses"] and not re.search(r"[상하]", v["refAbbr"]):
        review.append(
            f"[{v['id']}] refAbbr({v['refAbbr']})와 verses{v['verses']} 불일치"
        )

# ─────────────────────────────────────────────────────────────
# 4. 계층 구조: 누락·중복
# ─────────────────────────────────────────────────────────────
ids = [v["id"] for v in verses]
dupe_ids = [i for i, n in Counter(ids).items() if n > 1]
if dupe_ids:
    certain.append(f"구절 id 중복: {dupe_ids}")
else:
    notes.append(f"구절 id {len(ids)}개 전부 유일")

for v in verses:
    if v["topicKey"] not in topics:
        certain.append(f"[{v['id']}] 없는 주제 참조: {v['topicKey']}")
    elif topics[v["topicKey"]]["section"] not in sections:
        certain.append(f"[{v['id']}] 없는 섹션 참조: {topics[v['topicKey']]['section']}")

orphan_topics = [k for k in topics if not any(v["topicKey"] == k for v in verses)]
if orphan_topics:
    review.append(f"구절이 없는 주제 {len(orphan_topics)}개: {orphan_topics[:10]}")
orphan_sections = [
    k for k in sections if not any(topics[v["topicKey"]]["section"] == k for v in verses)
]
if orphan_sections:
    review.append(f"구절이 없는 섹션: {orphan_sections}")
if not orphan_topics and not orphan_sections:
    notes.append("모든 주제·섹션에 구절이 연결됨 (고아 없음)")

# 레거시 id 보존 (사용자 데이터 호환)
legacy = [f"{c}{n}{s}" for c in "ABCDE" for n in range(1, 7) for s in "ab"]
missing_legacy = [i for i in legacy if i not in set(ids)]
if missing_legacy:
    certain.append(f"레거시 60구절 id 누락 ({len(missing_legacy)}개): {missing_legacy}")
else:
    notes.append(f"레거시 60구절 id A1a~E6b {len(legacy)}개 전부 보존")

# ─────────────────────────────────────────────────────────────
# 5. 같은 장절을 공유하는 구절의 본문 일치 (독립 소스 없는 73구절의 교차 검증)
# ─────────────────────────────────────────────────────────────
by_ref: dict[tuple, list[dict]] = defaultdict(list)
for v in verses:
    by_ref[(v["bookAbbr"], v["chapter"], tuple(v["verses"]))].append(v)

shared = {k: vs for k, vs in by_ref.items() if len(vs) > 1}
mismatch = 0
for (b, c, vs), group in sorted(shared.items()):
    texts = {norm_chars(v["text"]) for v in group}
    if len(texts) > 1:
        mismatch += 1
        certain.append(
            f"같은 장절 {b}{c}:{','.join(map(str, vs))}인데 본문이 다름: "
            + " / ".join(f"[{v['id']}] {v['text'][:40]}…" for v in group)
        )
notes.append(
    f"장절이 겹치는 그룹 {len(shared)}개 검사 — 본문 불일치 {mismatch}건"
)

# ─────────────────────────────────────────────────────────────
# 6. 개역한글(1961) 정본에서 벗어난 표기 탐지
# ─────────────────────────────────────────────────────────────
# 개역한글에 나타나지 않는 형태만 좁게 본다 (개역개정 혼입·현대어 혼입 신호)
FORBIDDEN = {
    r"습니다": "경어체 종결 (두 역본 모두 사용하지 않음)",
    r"합니다": "경어체 종결",
    r"[a-zA-Z]": "라틴 문자",
    r"[0-9]": "아라비아 숫자",
    r"[（）［］]": "전각 괄호",
    r"\.\.\.": "말줄임표",
}
for v in verses:
    for pat, why in FORBIDDEN.items():
        if re.search(pat, v["text"]):
            certain.append(f"[{v['id']}] {v['refAbbr']} 본문에 {why}: {v['text'][:60]}")

# 개역개정에서 바뀐 대표 어휘 — 개역한글에도 드물게 나오므로 판단 필요로 분류
MODERN_HINTS = {"그들": "개역한글은 대개 '저희'", "따라": "개역한글은 대개 '좇아'"}
hint_hits: dict[str, list[str]] = defaultdict(list)
for v in verses:
    for word, why in MODERN_HINTS.items():
        if re.search(rf"\b{word}", v["text"]):
            hint_hits[word].append(v["id"])
for word, hits in hint_hits.items():
    review.append(
        f"현대어 의심 '{word}' {len(hits)}구절 ({MODERN_HINTS[word]}) — "
        f"예: {hits[:8]}{' …' if len(hits) > 8 else ''}"
    )

# 본문 길이 이상치
for v in verses:
    if len(v["text"]) < 10:
        certain.append(f"[{v['id']}] {v['refAbbr']} 본문이 너무 짧음: {v['text']!r}")
    if v["text"] != v["text"].strip():
        certain.append(f"[{v['id']}] 본문 앞뒤 공백")
    if re.search(r"\s{2,}", v["text"]):
        certain.append(f"[{v['id']}] 본문에 연속 공백")

# ─────────────────────────────────────────────────────────────
# 보고
# ─────────────────────────────────────────────────────────────
def section(title: str, items: list[str]) -> None:
    print(f"\n{'=' * 72}\n{title} — {len(items)}건\n{'=' * 72}")
    for it in items:
        print(f"  • {it}")


if spacing:
    notes.append("띄어쓰기 차이 구절: " + ", ".join(s.split("] ")[0].lstrip("[") for s in spacing))

section("(a) 확실한 오류 — 수정 대상", certain)
section("(b) 판단 필요 — 사용자 확인 대기", review)
section("(c) 정상 확인", notes)

print(f"\n요약: 확실한 오류 {len(certain)} · 판단 필요 {len(review)} · 정상 확인 {len(notes)}")
sys.exit(1 if certain else 0)
