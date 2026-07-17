#!/usr/bin/env python3
"""verses.json v2 빌드: 5확신 + 생활지침8 + 60구절(기존) + DEP242.
DEP 원문 파싱 → 정규화 → bskorea 개역한글 본문 추출 → 통합 스키마 출력."""
import json, re, html, time, urllib.request, pathlib, sys

SCRATCH = pathlib.Path(__file__).parent
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

# ---------- 책 이름/코드 ----------
BOOKS = {  # 약칭: (전체 이름, bskorea 코드 후보들)
    "창": ("창세기", ["gen"]), "출": ("출애굽기", ["exo", "exd"]),
    "레": ("레위기", ["lev"]), "민": ("민수기", ["num"]),
    "신": ("신명기", ["deu", "deut"]), "수": ("여호수아", ["jos"]),
    "삼상": ("사무엘상", ["1sa", "1sm"]), "삼하": ("사무엘하", ["2sa", "2sm"]),
    "대상": ("역대상", ["1ch", "1chr"]), "대하": ("역대하", ["2ch", "2chr"]),
    "스": ("에스라", ["ezr", "ezra"]), "느": ("느헤미야", ["neh"]),
    "욥": ("욥기", ["job"]), "시": ("시편", ["psa"]), "잠": ("잠언", ["pro"]),
    "전": ("전도서", ["ecc", "ecl"]), "사": ("이사야", ["isa"]),
    "렘": ("예레미야", ["jer"]), "애": ("예레미야애가", ["lam"]),
    "겔": ("에스겔", ["ezk", "eze"]), "단": ("다니엘", ["dan"]),
    "욘": ("요나", ["jon", "jnh"]), "합": ("하박국", ["hab", "hk"]),
    "말": ("말라기", ["mal"]),
    "마": ("마태복음", ["mat"]), "막": ("마가복음", ["mrk", "mar"]),
    "눅": ("누가복음", ["luk"]), "요": ("요한복음", ["jhn", "joh"]),
    "행": ("사도행전", ["act"]), "롬": ("로마서", ["rom"]),
    "고전": ("고린도전서", ["1co"]), "고후": ("고린도후서", ["2co"]),
    "갈": ("갈라디아서", ["gal"]), "엡": ("에베소서", ["eph"]),
    "빌": ("빌립보서", ["php", "phi"]), "골": ("골로새서", ["col"]),
    "살전": ("데살로니가전서", ["1th", "1ts"]), "살후": ("데살로니가후서", ["2th", "2ts"]),
    "딤전": ("디모데전서", ["1ti", "1tm"]), "딤후": ("디모데후서", ["2ti", "2tm"]),
    "딛": ("디도서", ["tit"]), "히": ("히브리서", ["heb"]),
    "약": ("야고보서", ["jas", "jam"]), "벧전": ("베드로전서", ["1pe"]),
    "벧후": ("베드로후서", ["2pe", "2pet"]), "요일": ("요한일서", ["1jn", "1jo"]),
    "계": ("요한계시록", ["rev"]),
}
ABBR_ALT = sorted(BOOKS.keys(), key=len, reverse=True)
REF_RE = re.compile(
    r"(" + "|".join(ABBR_ALT) + r")\s*(\d+)\s*:\s*([\d]+(?:\s*[,~\-]\s*\d+)*)(상|하)?"
)

def parse_verse_spec(spec):
    out = []
    for part in re.split(r",", spec):
        part = part.strip()
        m = re.match(r"^(\d+)\s*[~\-]\s*(\d+)$", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            if b < a or b - a > 30:
                raise ValueError(f"bad range {spec}")
            out.extend(range(a, b + 1))
        else:
            out.append(int(part))
    return out

def find_refs(line):
    refs = []
    for m in REF_RE.finditer(line):
        abbr, ch, spec, half = m.group(1), int(m.group(2)), m.group(3), m.group(4) or ""
        refs.append({"abbr": abbr, "chapter": ch, "verses": parse_verse_spec(spec), "half": half})
    stripped = REF_RE.sub("", line)
    return refs, stripped

# ---------- DEP 파싱 ----------
def parse_dep():
    lines = [l.strip() for l in open(SCRATCH / "dep242.txt", encoding="utf-8").read().split("\n")]
    lines = [l for l in lines if l and l not in ("​",)]
    lines = [l.replace("​", "").replace("엠6:17", "엡6:17") for l in lines]
    # 헤더/푸터 제거
    lines = [l for l in lines if "cheking" not in l and "[출처]" not in l and "window." not in l and "entryId" not in l and l != "}"]
    sections = []
    cur_sec, cur_group = None, None
    for line in lines:
        refs, stripped = find_refs(line)
        sec_m = re.match(r"^(\d)\s*\.\s*(\S.*)$", line)
        if not refs and sec_m and len(sec_m.group(2)) < 20 and not sec_m.group(2)[0].isdigit():
            cur_sec = {"title": sec_m.group(2).strip(), "groups": []}
            sections.append(cur_sec)
            cur_group = None
            continue
        if line.startswith("*"):
            cur_group = {"title": line.lstrip("*").strip().rstrip("?").strip(), "topics": []}
            cur_sec["groups"].append(cur_group)
            continue
        if not refs:
            continue  # 잡음 라인
        if cur_group is None:
            cur_group = {"title": None, "topics": []}
            cur_sec["groups"].append(cur_group)
        title = re.sub(r"^\d+\s*[\.\)]\s*", "", stripped).strip(" -–,·")
        title = re.sub(r"\s+", " ", title).strip()
        cur_group["topics"].append({"title": title, "refs": refs})
    return sections

# ---------- bskorea 추출 ----------
resolved = {}
chap_cache = {}

def fetch_chap(abbr, chapter):
    if (abbr, chapter) in chap_cache:
        return chap_cache[(abbr, chapter)]
    _, candidates = BOOKS[abbr]
    codes = [resolved[abbr]] if abbr in resolved else candidates
    for code in codes:
        url = f"https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book={code}&chap={chapter}"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                h = r.read().decode("utf-8", "replace")
        except Exception as e:
            print(f"  fetch err {abbr}({code}) {chapter}: {e}", file=sys.stderr)
            continue
        vv = {}
        for m in re.finditer(r'<span class="number">(\d+)&nbsp;.*?</span>(.*?)</font></span>', h, re.S):
            n = int(m.group(1))
            seg = m.group(2)
            seg = re.sub(r"<div[^>]*>.*?</div>", "", seg, flags=re.S)
            seg = re.sub(r"<a class=comment.*?</a>", "", seg, flags=re.S)
            seg = re.sub(r"<[^>]+>", "", seg)
            seg = html.unescape(seg)
            seg = re.sub(r"\d+\)", "", seg)
            vv[n] = re.sub(r"\s+", " ", seg).strip()
        if len(vv) >= 2:
            resolved[abbr] = code
            chap_cache[(abbr, chapter)] = vv
            time.sleep(0.25)
            return vv
        time.sleep(0.25)
    raise RuntimeError(f"unresolved book {abbr} ch{chapter}")

def text_for(ref):
    vv = fetch_chap(ref["abbr"], ref["chapter"])
    parts = []
    for n in ref["verses"]:
        if n not in vv:
            raise RuntimeError(f"missing {ref['abbr']} {ref['chapter']}:{n}")
        parts.append(vv[n])
    return " ".join(parts)

def vlabel(ref):
    vs = ref["verses"]
    groups = []
    start = prev = vs[0]
    for v in vs[1:]:
        if v == prev + 1:
            prev = v
        else:
            groups.append((start, prev))
            start = prev = v
    groups.append((start, prev))
    lab = ",".join(f"{a}" if a == b else f"{a}-{b}" for a, b in groups)
    return lab + ref.get("half", "")

def mk_verse(vid, topic_key, ref):
    full, _ = BOOKS[ref["abbr"]]
    lab = vlabel(ref)
    return {
        "id": vid, "topicKey": topic_key,
        "ref": f"{full} {ref['chapter']}:{lab}",
        "refAbbr": f"{ref['abbr']} {ref['chapter']}:{lab}",
        "book": full, "bookAbbr": ref["abbr"],
        "chapter": ref["chapter"], "verses": ref["verses"],
        "text": text_for(ref),
    }

# ---------- 컬렉션 정의 ----------
AS_TOPICS = [
    ("구원의 확신", {"abbr": "요일", "chapter": 5, "verses": [11, 12], "half": ""}),
    ("기도응답의 확신", {"abbr": "요", "chapter": 16, "verses": [24], "half": ""}),
    ("승리의 확신", {"abbr": "고전", "chapter": 10, "verses": [13], "half": ""}),
    ("사죄의 확신", {"abbr": "요일", "chapter": 1, "verses": [9], "half": ""}),
    ("인도의 확신", {"abbr": "잠", "chapter": 3, "verses": [5, 6], "half": ""}),
]
LV_TOPICS = [
    ("그리스도 안의 생활", {"abbr": "요", "chapter": 15, "verses": [5], "half": ""}),
    ("하나님의 말씀에 의한 생활", {"abbr": "행", "chapter": 20, "verses": [32], "half": ""}),
    ("하나님의 성령에 의한 생활", {"abbr": "롬", "chapter": 8, "verses": [14], "half": ""}),
    ("믿음에 의한 생활", {"abbr": "고후", "chapter": 5, "verses": [7], "half": ""}),
    ("사랑에 의한 생활", {"abbr": "요일", "chapter": 4, "verses": [11], "half": ""}),
    ("그리스도인의 교제하는 생활", {"abbr": "요일", "chapter": 1, "verses": [7], "half": ""}),
    ("증인으로서의 생활", {"abbr": "벧전", "chapter": 3, "verses": [15], "half": ""}),
    ("후히 드리는 생활", {"abbr": "고후", "chapter": 9, "verses": [7], "half": ""}),
]

def main():
    dep = parse_dep()
    n_dep_refs = sum(len(t["refs"]) for s in dep for g in s["groups"] for t in g["topics"])
    print(f"DEP 섹션 {len(dep)}개, 주제 {sum(len(g['topics']) for s in dep for g in s['groups'])}개, 구절 {n_dep_refs}개")
    for s in dep:
        cnt = sum(len(t["refs"]) for g in s["groups"] for t in g["topics"])
        print(f"  {s['title']}: {cnt}구절 / 그룹 {[g['title'] for g in s['groups']]}")

    old = json.load(open(SCRATCH / "verses_final.json", encoding="utf-8"))

    collections = [
        {"key": "AS", "title": "그리스도인의 확신", "short": "5확신", "order": 1},
        {"key": "LV", "title": "그리스도인의 생활지침", "short": "8동행", "order": 2},
        {"key": "TMS60", "title": "주제별 성경암송", "short": "60구절", "order": 3},
        {"key": "DEP", "title": "제자의 도", "short": "DEP 242", "order": 4},
    ]
    sections, topics, verses = [], [], []

    # 5확신 / 생활지침
    for ckey, sec_title, tps in [("AS", "그리스도인의 확신", AS_TOPICS), ("LV", "그리스도인의 생활지침", LV_TOPICS)]:
        sections.append({"key": ckey, "collection": ckey, "title": sec_title, "subtitle": ""})
        for i, (title, ref) in enumerate(tps, 1):
            tkey = f"{ckey}{i}"
            topics.append({"key": tkey, "section": ckey, "group": "", "title": title})
            verses.append(mk_verse(f"{tkey}a", tkey, ref))
            print(f"  {tkey}a ok")

    # 60구절 (기존 데이터 그대로 — ID/topicKey 보존)
    for skey, s in old["series"].items():
        sections.append({"key": skey, "collection": "TMS60", "title": s["title"], "subtitle": s["subtitle"]})
    for tkey, title in old["topics"].items():
        topics.append({"key": tkey, "section": tkey[0], "group": "", "title": title})
    verses.extend(old["verses"])

    # DEP
    for si, s in enumerate(dep, 1):
        skey = f"D{si}"
        sections.append({"key": skey, "collection": "DEP", "title": s["title"], "subtitle": ""})
        ti = 0
        for g in s["groups"]:
            for t in g["topics"]:
                ti += 1
                tkey = f"{skey}-{ti}"
                topics.append({"key": tkey, "section": skey, "group": g["title"] or "", "title": t["title"]})
                for j, ref in enumerate(t["refs"]):
                    vid = f"{tkey}{'ab'[j] if j < 2 else chr(99 + j - 2)}"
                    verses.append(mk_verse(vid, tkey, ref))
        print(f"  DEP {skey} {s['title']} done")

    out = {"collections": collections, "sections": sections, "topics": topics, "verses": verses}
    json.dump(out, open(SCRATCH / "verses2.json", "w"), ensure_ascii=False, indent=1)
    ids = [v["id"] for v in verses]
    assert len(ids) == len(set(ids)), "duplicate ids!"
    print(f"총 구절 {len(verses)} (AS 5 + LV 8 + TMS60 {len(old['verses'])} + DEP {n_dep_refs})")
    print("resolved codes:", resolved)

if __name__ == "__main__":
    main()
