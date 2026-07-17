#!/usr/bin/env python3
"""TMS 60구절을 두 KRV 소스에서 추출·대조하고 verses.json 초안을 생성한다."""
import json, html, re, unicodedata

SCRATCH = "/private/tmp/claude-501/-Users-quantsquirrel-orca-projects-scripture-memory/5e974a01-04cd-4b5e-8ed1-175405711c4e/scratchpad"

# (id, 주제key, 책 ko.json index, krv2 book name, 한글 책이름, 약칭, 장, [절들])
REFS = [
    ("A1a", "A1", 46, "2Corinthians", "고린도후서", "고후", 5, [17]),
    ("A1b", "A1", 47, "Galatians", "갈라디아서", "갈", 2, [20]),
    ("A2a", "A2", 44, "Romans", "로마서", "롬", 12, [1]),
    ("A2b", "A2", 42, "John", "요한복음", "요", 14, [21]),
    ("A3a", "A3", 54, "2Timothy", "디모데후서", "딤후", 3, [16]),
    ("A3b", "A3", 5, "Joshua", "여호수아", "수", 1, [8]),
    ("A4a", "A4", 42, "John", "요한복음", "요", 15, [7]),
    ("A4b", "A4", 49, "Philippians", "빌립보서", "빌", 4, [6, 7]),
    ("A5a", "A5", 39, "Matthew", "마태복음", "마", 18, [20]),
    ("A5b", "A5", 57, "Hebrews", "히브리서", "히", 10, [24, 25]),
    ("A6a", "A6", 39, "Matthew", "마태복음", "마", 4, [19]),
    ("A6b", "A6", 44, "Romans", "로마서", "롬", 1, [16]),
    ("B1a", "B1", 44, "Romans", "로마서", "롬", 3, [23]),
    ("B1b", "B1", 22, "Isaiah", "이사야", "사", 53, [6]),
    ("B2a", "B2", 44, "Romans", "로마서", "롬", 6, [23]),
    ("B2b", "B2", 57, "Hebrews", "히브리서", "히", 9, [27]),
    ("B3a", "B3", 44, "Romans", "로마서", "롬", 5, [8]),
    ("B3b", "B3", 59, "1Peter", "베드로전서", "벧전", 3, [18]),
    ("B4a", "B4", 48, "Ephesians", "에베소서", "엡", 2, [8, 9]),
    ("B4b", "B4", 55, "Titus", "디도서", "딛", 3, [5]),
    ("B5a", "B5", 42, "John", "요한복음", "요", 1, [12]),
    ("B5b", "B5", 65, "Revelation", "요한계시록", "계", 3, [20]),
    ("B6a", "B6", 61, "1John", "요한일서", "요일", 5, [13]),
    ("B6b", "B6", 42, "John", "요한복음", "요", 5, [24]),
    ("C1a", "C1", 45, "1Corinthians", "고린도전서", "고전", 3, [16]),
    ("C1b", "C1", 45, "1Corinthians", "고린도전서", "고전", 2, [12]),
    ("C2a", "C2", 22, "Isaiah", "이사야", "사", 41, [10]),
    ("C2b", "C2", 49, "Philippians", "빌립보서", "빌", 4, [13]),
    ("C3a", "C3", 24, "Lamentations", "예레미야애가", "애", 3, [22, 23]),
    ("C3b", "C3", 3, "Numbers", "민수기", "민", 23, [19]),
    ("C4a", "C4", 22, "Isaiah", "이사야", "사", 26, [3]),
    ("C4b", "C4", 59, "1Peter", "베드로전서", "벧전", 5, [7]),
    ("C5a", "C5", 44, "Romans", "로마서", "롬", 8, [32]),
    ("C5b", "C5", 49, "Philippians", "빌립보서", "빌", 4, [19]),
    ("C6a", "C6", 57, "Hebrews", "히브리서", "히", 2, [18]),
    ("C6b", "C6", 18, "Psalms", "시편", "시", 119, [9, 11]),
    ("D1a", "D1", 39, "Matthew", "마태복음", "마", 6, [33]),
    ("D1b", "D1", 41, "Luke", "누가복음", "눅", 9, [23]),
    ("D2a", "D2", 61, "1John", "요한일서", "요일", 2, [15, 16]),
    ("D2b", "D2", 44, "Romans", "로마서", "롬", 12, [2]),
    ("D3a", "D3", 45, "1Corinthians", "고린도전서", "고전", 15, [58]),
    ("D3b", "D3", 57, "Hebrews", "히브리서", "히", 12, [3]),
    ("D4a", "D4", 40, "Mark", "마가복음", "막", 10, [45]),
    ("D4b", "D4", 46, "2Corinthians", "고린도후서", "고후", 4, [5]),
    ("D5a", "D5", 19, "Proverbs", "잠언", "잠", 3, [9, 10]),
    ("D5b", "D5", 46, "2Corinthians", "고린도후서", "고후", 9, [6, 7]),
    ("D6a", "D6", 43, "Acts", "사도행전", "행", 1, [8]),
    ("D6b", "D6", 39, "Matthew", "마태복음", "마", 28, [19, 20]),
    ("E1a", "E1", 42, "John", "요한복음", "요", 13, [34, 35]),
    ("E1b", "E1", 61, "1John", "요한일서", "요일", 3, [18]),
    ("E2a", "E2", 49, "Philippians", "빌립보서", "빌", 2, [3, 4]),
    ("E2b", "E2", 59, "1Peter", "베드로전서", "벧전", 5, [5, 6]),
    ("E3a", "E3", 48, "Ephesians", "에베소서", "엡", 5, [3]),
    ("E3b", "E3", 59, "1Peter", "베드로전서", "벧전", 2, [11]),
    ("E4a", "E4", 2, "Leviticus", "레위기", "레", 19, [11]),
    ("E4b", "E4", 43, "Acts", "사도행전", "행", 24, [16]),
    ("E5a", "E5", 57, "Hebrews", "히브리서", "히", 11, [6]),
    ("E5b", "E5", 44, "Romans", "로마서", "롬", 4, [20, 21]),
    ("E6a", "E6", 47, "Galatians", "갈라디아서", "갈", 6, [9, 10]),
    ("E6b", "E6", 39, "Matthew", "마태복음", "마", 5, [16]),
]

SERIES = {
    "A": {"title": "새로운 삶", "subtitle": "Live the New Life"},
    "B": {"title": "그리스도를 전파함", "subtitle": "Proclaim Christ"},
    "C": {"title": "하나님을 의뢰함", "subtitle": "Rely on God's Resources"},
    "D": {"title": "그리스도 제자의 자격", "subtitle": "Be Christ's Disciple"},
    "E": {"title": "그리스도를 닮아감", "subtitle": "Grow in Christlikeness"},
}
TOPICS = {
    "A1": "중심되신 그리스도", "A2": "그리스도께 순종", "A3": "말씀", "A4": "기도",
    "A5": "교제", "A6": "증거",
    "B1": "모든 사람이 죄를 범함", "B2": "죄의 형벌", "B3": "그리스도가 형벌을 받음",
    "B4": "선행으로 구원받지 못함", "B5": "그리스도를 모셔야 함", "B6": "구원의 확신",
    "C1": "성령", "C2": "능력", "C3": "성실", "C4": "평안", "C5": "공급",
    "C6": "유혹에서 도우심",
    "D1": "그리스도를 첫자리에 모심", "D2": "죄에서 떠남", "D3": "견고함",
    "D4": "다른 사람을 섬김", "D5": "후히 드릴 것", "D6": "세계 비전",
    "E1": "사랑", "E2": "겸손", "E3": "순결", "E4": "정직", "E5": "믿음", "E6": "선행",
}

src1 = json.load(open(f"{SCRATCH}/ko.json", encoding="utf-8-sig"))
src2 = json.load(open(f"{SCRATCH}/krv2.json", encoding="utf-8-sig"))
src2map = {b["book"]: b for b in src2}

def clean(t):
    t = html.unescape(html.unescape(t))
    t = unicodedata.normalize("NFC", t)
    t = re.sub(r"[\"'‘’“”`]+$", "", t.strip())
    t = re.sub(r"\s+", " ", t)
    return t.strip()

def words_only(t):
    # 어절 내용 비교용: 구두점 제거
    return re.sub(r"[^가-힣a-zA-Z0-9\s]", "", t)

def get1(bi, ch, vs):
    try:
        return clean(src1[bi]["chapters"][ch - 1][vs - 1])
    except IndexError:
        return None

def get2(name, ch, vs):
    b = src2map[name]
    chap = next(c for c in b["chapters"] if c["chapter"] == ch)
    return clean(next(v for v in chap["verses"] if v["verse"] == vs)["text"])

diffs, entries = [], []
punct1 = punct2 = 0
src2only = []
for vid, tkey, bi, bname, bko, babbr, ch, vss in REFS:
    parts1 = [get1(bi, ch, v) for v in vss]
    t2 = " ".join(get2(bname, ch, v) for v in vss)
    if any(p is None for p in parts1):
        src2only.append(vid)
        t1 = t2
    else:
        t1 = " ".join(parts1)
    if re.search(r"[^가-힣a-zA-Z0-9\s]", t1): punct1 += 1
    if re.search(r"[^가-힣a-zA-Z0-9\s]", t2): punct2 += 1
    w1, w2 = words_only(t1).split(), words_only(t2).split()
    if w1 != w2:
        diffs.append((vid, t1, t2))
    vlabel = ",".join(map(str, vss))
    entries.append({
        "id": vid, "topicKey": tkey,
        "ref": f"{bko} {ch}:{vlabel}", "refAbbr": f"{babbr} {ch}:{vlabel}",
        "book": bko, "bookAbbr": babbr, "chapter": ch, "verses": vss,
        "text": t1, "textAlt": t2,
    })

print(f"어절 불일치: {len(diffs)}건 / 구두점 포함: src1 {punct1}, src2 {punct2} (총 {len(REFS)})")
print(f"src2 단독 (ko.json 결손, bible.com 검증 필요): {src2only}")
for vid, t1, t2 in diffs:
    print(f"--- {vid}\n  src1: {t1}\n  src2: {t2}")

json.dump({"series": SERIES, "topics": TOPICS, "verses": entries},
          open(f"{SCRATCH}/verses_draft.json", "w"), ensure_ascii=False, indent=1)
print("saved verses_draft.json")
