#!/usr/bin/env python3
"""verses.json v3 빌드: 기존 315구절(v2)에 '주제별 성경암송 시리즈 180구절'을 추가.

- 목록 출처: holycall 블로그 개역한글판 포스트(2012) → scripts/data/tms180.txt 보존.
  개정판 포스트(2024)와 장절 180개 전체 일치 확인(교차 검증).
- 본문 정본: bskorea 개역한글(HAN)에서 재추출 — build_v2와 동일 파이프라인.
- 기존 v2 데이터(315구절)는 id/본문 그대로 보존, TMS180 컬렉션만 뒤에 붙인다.
- DEP 컬렉션 short 표기를 "DEP 242" → "DEP242"로 변경.
"""
import json
import pathlib
import re
import sys

from build_v2 import REF_RE, find_refs, mk_verse

SCRATCH = pathlib.Path(__file__).parent
REPO = SCRATCH.parent.parent

SERIES_EN = {  # 개정판(NKR) 포스트의 영문 시리즈명
    1: "Getting to Know God",
    2: "Growing in Love",
    3: "Growing in Faith",
    4: "Walking in Victory",
    5: "Sharing Christ with Others",
}


def tidy(title):
    """'성 령' 같은 활자 간격 제거: 모든 어절이 한 글자면 붙인다."""
    parts = title.split()
    if len(parts) > 1 and all(len(p) == 1 for p in parts):
        return "".join(parts)
    return " ".join(parts)


def parse_tms180():
    lines = [l.strip() for l in (SCRATCH / "tms180.txt").read_text().split("\n")]
    lines = [l for l in lines if l]
    series = []
    cur_series = cur_part = None
    for line in lines:
        m = re.match(r"^(\d)\s*-\s*(\S.*)$", line)
        if m and not REF_RE.search(line):
            n = int(m.group(1))
            cur_series = {"n": n, "title": tidy(m.group(2)), "parts": []}
            series.append(cur_series)
            cur_part = None
            continue
        m = re.match(r"^([A-Z])\.\s*(\S.*)$", line)
        if m:
            cur_part = {"title": tidy(m.group(2)), "topics": []}
            cur_series["parts"].append(cur_part)
            continue
        m = re.match(r"^(\d+)\.\s*(\S.*)$", line)
        if m and not REF_RE.match(line):
            cur_part["topics"].append({"title": tidy(m.group(2)), "refs": [], "raw": []})
            continue
        refs, stripped = find_refs(line)
        if refs and REF_RE.match(line):
            # 구절 라인: "요1:1,14 본문…" — 라인당 1구절, 첫 매치만 실제 장절
            cur_part["topics"][-1]["refs"].append(refs[0])
            cur_part["topics"][-1]["raw"].append(stripped.strip())
    return series


def norm(t):
    return re.sub(r"[^가-힣]", "", t)


def main():
    series = parse_tms180()
    n_refs = sum(len(t["refs"]) for s in series for p in s["parts"] for t in p["topics"])
    assert len(series) == 5, f"시리즈 {len(series)}개"
    for s in series:
        cnt = sum(len(t["refs"]) for p in s["parts"] for t in p["topics"])
        assert cnt == 36, f"{s['title']}: {cnt}구절 (36이어야 함)"
        print(f"  {s['n']}-{s['title']}: {cnt}구절 / 파트 {[p['title'] for p in s['parts']]}")
    assert n_refs == 180, n_refs

    data = json.load(open(REPO / "src/data/verses.json", encoding="utf-8"))
    assert len(data["verses"]) == 315, "v2 기반이 아님"

    for c in data["collections"]:
        if c["key"] == "DEP":
            c["short"] = "DEP242"
    data["collections"].append(
        {"key": "TMS180", "title": "주제별 성경암송 시리즈", "short": "180구절", "order": 5}
    )

    mismatches = 0
    for s in series:
        skey = f"T{s['n']}"
        data["sections"].append(
            {"key": skey, "collection": "TMS180", "title": s["title"], "subtitle": SERIES_EN[s["n"]]}
        )
        ti = 0
        for p in s["parts"]:
            for t in p["topics"]:
                ti += 1
                tkey = f"{skey}-{ti}"
                data["topics"].append(
                    {"key": tkey, "section": skey, "group": p["title"], "title": t["title"]}
                )
                for j, ref in enumerate(t["refs"]):
                    vid = f"{tkey}{'ab'[j] if j < 2 else chr(99 + j - 2)}"
                    v = mk_verse(vid, tkey, ref)
                    # 블로그 본문과 대조(참고용) — 정본은 bskorea
                    if norm(v["text"]) != norm(t["raw"][j]):
                        mismatches += 1
                        print(f"  본문 차이 {vid} {v['refAbbr']}", file=sys.stderr)
                    data["verses"].append(v)
        print(f"  TMS180 {skey} {s['title']} done")

    ids = [v["id"] for v in data["verses"]]
    assert len(ids) == len(set(ids)), "duplicate ids!"
    assert len(data["verses"]) == 495, len(data["verses"])
    json.dump(
        data, open(REPO / "src/data/verses.json", "w", encoding="utf-8"),
        ensure_ascii=False, indent=1,
    )
    print(f"총 구절 {len(data['verses'])} (기존 315 + TMS180 180) / 블로그 대비 본문 차이 {mismatches}건")


if __name__ == "__main__":
    main()
