#!/usr/bin/env python3
"""bskorea(대한성서공회) 개역한글판에서 TMS 66개 절을 정본 추출."""
import json, re, html, time, urllib.request, pathlib

SCRATCH = pathlib.Path(__file__).parent
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

# 한글 책이름 -> bskorea 코드 후보
CODES = {
    "레위기": ["lev"], "민수기": ["num"], "여호수아": ["jos", "josh"],
    "시편": ["psa", "psm", "ps"], "잠언": ["pro", "prv"], "이사야": ["isa"],
    "예레미야애가": ["lam"], "마태복음": ["mat", "mt"], "마가복음": ["mar", "mrk"],
    "누가복음": ["luk", "luk"], "요한복음": ["jhn", "joh"], "사도행전": ["act"],
    "로마서": ["rom"], "고린도전서": ["1co", "1cor"], "고린도후서": ["2co", "2cor"],
    "갈라디아서": ["gal"], "에베소서": ["eph"], "빌립보서": ["php", "phi", "bil"],
    "디모데후서": ["2ti", "2tm"], "디도서": ["tit"], "히브리서": ["heb"],
    "베드로전서": ["1pe", "1pet"], "요한일서": ["1jo", "1jn"], "요한계시록": ["rev"],
}

def fetch(code, chap):
    url = f"https://www.bskorea.or.kr/bible/korbibReadpage.php?version=HAN&book={code}&chap={chap}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
        return r.read().decode("utf-8", "replace")

def parse(h):
    """{절번호: 본문} — 각주 div/마커 제거, 절 경계는 </font></span>"""
    out = {}
    for m in re.finditer(r'<span class="number">(\d+)&nbsp;.*?</span>(.*?)</font></span>', h, re.S):
        n = int(m.group(1))
        seg = m.group(2)
        seg = re.sub(r"<div[^>]*>.*?</div>", "", seg, flags=re.S)   # 각주 팝업 본문
        seg = re.sub(r"<a class=comment.*?</a>", "", seg, flags=re.S)  # 각주 번호 링크
        seg = re.sub(r"<[^>]+>", "", seg)
        seg = html.unescape(seg)
        seg = re.sub(r"\d+\)", "", seg)  # 잔여 각주 마커
        seg = re.sub(r"\s+", " ", seg).strip()
        out[n] = seg
    return out

draft = json.load(open(SCRATCH / "verses_draft.json", encoding="utf-8"))
needed = {}  # (book,chapter) -> set(verses)
for v in draft["verses"]:
    needed.setdefault((v["book"], v["chapter"]), set()).update(v["verses"])

resolved_code, chapters = {}, {}
for (book, chap), vss in sorted(needed.items()):
    codes = [resolved_code[book]] if book in resolved_code else CODES[book]
    ok = False
    for code in codes:
        try:
            h = fetch(code, chap)
        except Exception as e:
            print(f"FETCH FAIL {book} {code} {chap}: {e}")
            continue
        vv = parse(h)
        if len(vv) >= 3 and all(n in vv for n in vss):
            resolved_code[book] = code
            chapters[(book, chap)] = vv
            ok = True
            break
    if not ok:
        print(f"UNRESOLVED: {book} {chap} {sorted(vss)}")
    time.sleep(0.3)

report = []
for v in draft["verses"]:
    vv = chapters.get((v["book"], v["chapter"]), {})
    parts = [vv.get(n) for n in v["verses"]]
    if any(p is None for p in parts):
        report.append((v["id"], "MISSING", None))
        continue
    official = " ".join(parts)
    strip = lambda t: re.sub(r"[^가-힣a-zA-Z0-9\s]", "", t)
    same1 = strip(official).split() == strip(v["text"]).split()
    same2 = strip(official).split() == strip(v["textAlt"]).split()
    v["text"] = official
    report.append((v["id"], "OK", f"src1={'=' if same1 else 'X'} src2={'=' if same2 else 'X'}"))

for v in draft["verses"]:
    v.pop("textAlt", None)

json.dump(draft, open(SCRATCH / "verses_final.json", "w"), ensure_ascii=False, indent=1)
print("codes:", resolved_code)
missing = [r for r in report if r[1] != "OK"]
print(f"OK {len(report)-len(missing)}/{len(report)}, MISSING: {missing}")
agree = sum(1 for r in report if r[2] and "src1==" in r[2].replace("= ", "=="))
for r in report:
    print(r[0], r[2])
