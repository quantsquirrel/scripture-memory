/**
 * 상호참조 후보표 컴파일러.
 *
 * 입력: OpenBible.info cross-references (CC-BY)
 *   https://a.openbible.info/data/cross-references.zip 안의 cross_references.txt
 *   형식: `From Verse<TAB>To Verse<TAB>Votes`, 참조는 OSIS 표기('Rom.8.28',
 *   'Ps.148.4-Ps.148.5'), Votes는 사용자 투표 합(음수 = "관련 없다").
 * 출력: src/data/xrefCandidates.json — "이 장을 읽었을 때 떠올릴 만한 암송구절
 *   상위 K개 + 그 구절에 이르는 참조 사슬들".
 *
 * 왜 미리 계산하는가: 34만 간선을 앱에 실으면 번들이 수 MB로 불어난다. 실제로
 * 필요한 것은 1189개 장 각각의 상위 몇 개뿐이라, 빌드 때 한 번 걷고 결과만
 * 싣는다. 앱은 오프라인에서 표를 조회할 뿐이다(하드 경계 4).
 *
 * 사용: npx vite-node scripts/data/build_xref.ts <cross_references.txt>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BOOKS } from '../../src/data/canon'
import rawVerses from '../../src/data/verses.json'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// ── 파라미터 ────────────────────────────────────────────────────
const P = {
  /** 참조 구간이 넓을수록 지시가 흐릿하다 — 무게를 sqrt(|구간|)로 나눈다 */
  rangeCap: 15,
  /** 역방향 간선의 무게 비율 (참조는 서로를 비추지만 원 방향이 더 강하다) */
  reverse: 0.5,
  /** 홉당 감쇠 — spreading activation의 decay */
  decay: 0.4,
  /** 몇 홉까지 걷는가 (씨앗 → 1홉 → 2홉) */
  hops: 2,
  /** 확산 중 무게가 이보다 작아지면 가지를 접는다 */
  threshold: 1e-9,
  /**
   * 허브 억제 지수: 점수를 (그 절이 받은 총 참조량)^hub 로 나눈다.
   *
   * 1189장 전수 스윕에서 이 값이 argmax였다 — 등장 구절 수 / 상위5 점유율:
   * 0.00 → 378개 / 6.4%, 0.25 → 420, 0.50 → 436 / 4.5%, 0.75 → 418, 1.00 → 406.
   * (BM25의 pivoted normalization은 b≈0.75를 권하지만 그건 문서 길이 이야기라
   * 그대로 빌려올 수 없어 이 데이터로 직접 맞췄다.)
   */
  hub: 0.5,
  /**
   * 전이확률의 Dirichlet 평활 계수.
   *
   * p = w/Σw 로 행 합을 1로 강제하면 나가는 참조가 몇 개 없는 절이 과대평가된다
   * — 참조가 6개뿐인 창 6:20은 2표짜리 약한 간선에도 1/6의 확률을 얹어 주고,
   * 실제로 그 간선(창 6:20 → 요 5:40, 2표)이 창세기 6장의 1위로 올라왔다.
   * 대신 p = w/(Σw + μ)로 두면 남는 μ/(Σw+μ)가 새어 나가 절대 참조강도가 약한
   * 절이 스스로 조용해진다 (Zhai & Lafferty 2001의 Dirichlet prior smoothing을
   * 그래프로 옮긴 것). μ=20에서 창 6:20→요 5:40은 0.219→0.044로 80% 줄지만
   * 요 3:16의 최강 간선은 14%만 준다 — 원하는 비대칭이 정확히 나온다.
   */
  mu: 20,
  /** 장별로 남길 후보 수 */
  topK: 10,
  /** 코퍼스 절마다 남길 1홉 기여 수 */
  keep1: 3,
  /** 2홉 기여 수 */
  keep2: 2,
}

const OSIS_INDEX = new Map(BOOKS.map((b, i) => [b.osis, i]))
const ABBR_OF = BOOKS.map((b) => b.abbr)
const ABBR_INDEX = new Map(BOOKS.map((b, i) => [b.abbr, i]))

/** 절 id = 책순번*1e6 + 장*1e3 + 절 */
const vid = (b: number, c: number, v: number): number => b * 1_000_000 + c * 1_000 + v
const chapKey = (id: number): number => Math.floor(id / 1_000)
const verseOf = (id: number): number => id % 1_000
const refOf = (id: number): string =>
  `${ABBR_OF[Math.floor(id / 1_000_000)] ?? '?'} ${Math.floor(id / 1_000) % 1_000}:${verseOf(id)}`

function parseOsis(s: string | undefined): number | null {
  if (s === undefined) return null
  const m = /^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/.exec(s)
  if (!m?.[1] || !m[2] || !m[3]) return null
  const b = OSIS_INDEX.get(m[1])
  if (b === undefined) return null
  const c = parseInt(m[2], 10)
  return c < 1 || c > (BOOKS[b]?.chapters ?? 0) ? null : vid(b, c, parseInt(m[3], 10))
}

// ── 0. 원본 적재 ────────────────────────────────────────────────
const RAW = process.argv[2]
if (RAW === undefined)
  throw new Error('사용법: vite-node scripts/data/build_xref.ts <cross_references.txt>')
const lines = fs.readFileSync(RAW, 'utf8').split('\n')
if (!lines[0]?.startsWith('From Verse')) throw new Error('헤더가 다르다 — 원본 형식이 바뀌었다')

/**
 * 절 구분(versification): 원본에 홑절로 등장하는 절만 실재하는 절로 본다.
 *
 * 구간 참조("롬 8:28-30")를 낱개 절로 펼칠 때 장 끝을 모르면 창 4:27처럼
 * 없는 절을 만들어낸다. 원본이 홑절로 인용한 절들의 장별 최댓값이 곧 각 장의
 * 마지막 절이다 — 별도 데이터 없이 원본만으로 장 끝을 정확히 얻는다.
 * (검증: 창4=26, 창6=22, 창7=24, 시119=176 — 모두 실제 값과 일치)
 */
const lastVerse = new Map<number, number>()
function seenAtomic(s: string | undefined): void {
  const id = parseOsis(s)
  if (id === null) return
  const k = chapKey(id)
  if ((lastVerse.get(k) ?? 0) < verseOf(id)) lastVerse.set(k, verseOf(id))
}
for (const line of lines.slice(1)) {
  if (line === '') continue
  const [f, t] = line.split('\t')
  seenAtomic(f)
  const parts = (t ?? '').split('-')
  seenAtomic(parts[0])
  seenAtomic(parts[1])
}
console.error(
  `절 구분표: ${lastVerse.size}개 장 · 총 ${[...lastVerse.values()].reduce((a, b) => a + b, 0)}절`,
)
const exists = (id: number): boolean =>
  verseOf(id) >= 1 && verseOf(id) <= (lastVerse.get(chapKey(id)) ?? 0)

// ── 1. 간선 적재 ────────────────────────────────────────────────
interface Edge {
  to: number
  w: number
  /** 원 참조가 쓴 표기 ('히 11:5-6') — 사슬에 그대로 보여준다 */
  label: string
  /** 출발 절 안에서 정규화한 확률 */
  p: number
}

const adj = new Map<number, Edge[]>()
/** 절이 받은 총 참조량 (허브 억제용) */
const inMass = new Map<number, number>()
function pushEdge(u: number, e: Edge): void {
  const es = adj.get(u)
  if (es) es.push(e)
  else adj.set(u, [e])
}

let rows = 0
let dropped = 0
for (const line of lines.slice(1)) {
  if (line === '') continue
  const [fRaw, tRaw, vRaw] = line.split('\t')
  const votes = Number(vRaw)
  // 0표·음수표는 "관련 없다"는 투표다 — 관계로 세지 않는다
  if (!Number.isFinite(votes) || votes <= 0) continue
  const from = parseOsis(fRaw)
  const [tsRaw, teRaw] = (tRaw ?? '').split('-')
  const ts = parseOsis(tsRaw)
  const te = teRaw === undefined ? ts : parseOsis(teRaw)
  if (from === null || ts === null || te === null || te < ts || !exists(from) || !exists(ts)) {
    dropped++
    continue
  }
  const members: number[] = []
  for (let id = ts; id <= te && members.length < P.rangeCap; id++) {
    if (chapKey(id) !== chapKey(ts)) break // 장을 넘는 구간은 시작 장까지만
    if (!exists(id)) break
    members.push(id)
  }
  const w = Math.log1p(votes) / Math.sqrt(members.length)
  const label =
    members.length === 1
      ? refOf(ts)
      : `${refOf(ts)}-${verseOf(members[members.length - 1] ?? ts)}`
  for (const to of members) {
    pushEdge(from, { to, w, label, p: 0 })
    pushEdge(to, { to: from, w: w * P.reverse, label: refOf(from), p: 0 })
    inMass.set(to, (inMass.get(to) ?? 0) + w)
  }
  rows++
}

// 전이확률 — 행 합을 1로 강제하지 않는다(P.mu 주석 참고)
for (const es of adj.values()) {
  const sum = es.reduce((a, e) => a + e.w, 0)
  for (const e of es) e.p = e.w / (sum + P.mu)
}
console.error(
  `간선 ${rows}행 → ${[...adj.values()].reduce((a, es) => a + es.length, 0)}개 (버림 ${dropped}) · 절 ${adj.size}개`,
)

// ── 2. 암송 코퍼스(495구절) → 절 id ─────────────────────────────
/** 같은 장절이 여러 주제에 실려 있다 — 후보로는 학습 순서상 첫 구절 하나만 쓴다 */
const canonicalOf = new Map<string, string>()
for (const v of rawVerses.verses) {
  const key = `${v.bookAbbr}${v.chapter}:${v.verses.join(',')}`
  if (!canonicalOf.has(key)) canonicalOf.set(key, v.id)
}
/** 절 id → 대표 암송구절 id 목록 */
const corpusAt = new Map<number, string[]>()
for (const v of rawVerses.verses) {
  if (canonicalOf.get(`${v.bookAbbr}${v.chapter}:${v.verses.join(',')}`) !== v.id) continue
  const b = ABBR_INDEX.get(v.bookAbbr)
  if (b === undefined) throw new Error(`코퍼스에 알 수 없는 책 약칭: ${v.bookAbbr} (${v.id})`)
  for (const n of v.verses) {
    const id = vid(b, v.chapter, n)
    const at = corpusAt.get(id)
    if (at) at.push(v.id)
    else corpusAt.set(id, [v.id])
  }
}
console.error(
  `코퍼스 ${rawVerses.verses.length}구절 → 고유 장절 ${canonicalOf.size}개 · 절 ${corpusAt.size}개`,
)

/*
 * 절 구분 교차검증.
 *
 * 위에서 만든 절 구분표는 영어권 절 나눔(OpenBible)에서 왔다. 개역한글이 다른
 * 곳이 있으면(시편 표제, 요엘·말라기 장 나눔 등) 없는 절을 가리키게 된다.
 * 손에 있는 유일한 개역한글 정본은 검증된 495구절이므로, 그것이 전부 파생
 * 절수 안에 들어오는지 확인한다. 어긋나면 표를 만들지 않고 멈춘다.
 */
const outOfRange: string[] = []
for (const v of rawVerses.verses) {
  const b = ABBR_INDEX.get(v.bookAbbr)
  if (b === undefined) continue
  for (const n of v.verses)
    if (!exists(vid(b, v.chapter, n))) outOfRange.push(`${v.refAbbr}(${n})`)
}
if (outOfRange.length > 0)
  throw new Error(`절 구분표가 개역한글과 어긋난다: ${outOfRange.join(', ')}`)
console.error(`절 구분 교차검증: 코퍼스 495구절 전부 범위 안 ✓`)

// ── 3. 장별 확산 ────────────────────────────────────────────────
interface Inbound {
  seed: number
  /** 2홉일 때 거쳐온 절 */
  mid: number | null
  /** 도착 절이 인용된 표기 */
  label: string
  /** 씨앗→중간 간선의 표기 (2홉 전용) */
  midLabel: string
  mass: number
}

/**
 * 씨앗(그 장의 모든 절)에서 감쇠하며 퍼뜨린다.
 *
 * 코퍼스 절로 들어오는 기여는 홉별로 상위 몇 개를 따로 모아 둔다. 최댓값
 * 하나만 남기면 "오늘 본문의 한 자리가 이 말씀을 가리킨다"까지밖에 못 보여주는데,
 * 실제로는 오늘 읽은 여러 자리가 같은 말씀을 함께 가리키는 경우가 많고
 * 그것이 사용자가 보고 싶어 하는 "영향을 미친 참조 말씀들"이다.
 */
function spread(
  seedIds: readonly number[],
  homeChapter: number,
): { score: Map<number, number>; inbound: Map<number, { h1: Inbound[]; h2: Inbound[] }> } {
  const score = new Map<number, number>()
  /** 1홉에서 각 절로 들어온 최대 기여 (2홉 사슬의 앞부분을 되짚는 데 쓴다) */
  const via1 = new Map<number, { seed: number; label: string; mass: number }>()
  const inbound = new Map<number, { h1: Inbound[]; h2: Inbound[] }>()
  function bump(id: number, hop: 1 | 2, entry: Inbound): void {
    let slot = inbound.get(id)
    if (!slot) {
      slot = { h1: [], h2: [] }
      inbound.set(id, slot)
    }
    const list = hop === 1 ? slot.h1 : slot.h2
    // 같은 출발 자리에서 온 기여는 하나만 (구간 참조가 여러 절로 펼쳐진 경우)
    const dup = list.find((e) => e.seed === entry.seed && e.mid === entry.mid)
    if (dup) {
      if (entry.mass > dup.mass) Object.assign(dup, entry)
      return
    }
    list.push(entry)
    list.sort((a, b) => b.mass - a.mass)
    if (list.length > (hop === 1 ? P.keep1 : P.keep2)) list.pop()
  }

  /*
   * 씨앗 질량을 균등하게 주면 참조가 빈약한 절이 과대평가된다. 확률
   * p = w/Σw 는 출발 절 안에서만 정규화하므로, 나가는 간선이 6개뿐인
   * 창 1:8 같은 절은 2표짜리 약한 참조에도 1/6의 확률을 얹어 준다. 반대로
   * 창 1:1처럼 참조가 풍부한 절은 각 간선의 확률이 잘게 쪼개진다. 그래서
   * 질량 자체를 그 절의 총 참조 강도에 비례해 나눠 준다 — 그 장에서 성경이
   * 가장 많이 되돌아보는 자리가 곧 그 장의 무게중심이라는 뜻이다.
   */
  let frontier = new Map<number, number>()
  const strength = new Map<number, number>()
  let total = 0
  for (const s of seedIds) {
    const w = (adj.get(s) ?? []).reduce((a, e) => a + e.w, 0)
    strength.set(s, w)
    total += w
  }
  if (total === 0) return { score, inbound }
  for (const s of seedIds) frontier.set(s, (strength.get(s) ?? 0) / total)

  for (let hop = 1; hop <= P.hops; hop++) {
    const next = new Map<number, number>()
    for (const [u, mass] of frontier) {
      const carry = mass * P.decay
      if (carry < P.threshold) continue
      for (const e of adj.get(u) ?? []) {
        const add = carry * e.p
        if (add < P.threshold) continue
        next.set(e.to, (next.get(e.to) ?? 0) + add)
        score.set(e.to, (score.get(e.to) ?? 0) + add)
        if (hop === 1) {
          const cur = via1.get(e.to)
          if (!cur || add > cur.mass) via1.set(e.to, { seed: u, label: e.label, mass: add })
          if (corpusAt.has(e.to))
            bump(e.to, 1, { seed: u, mid: null, label: e.label, midLabel: '', mass: add })
        } else if (
          corpusAt.has(e.to) &&
          chapKey(u) !== homeChapter &&
          chapKey(u) !== chapKey(e.to)
        ) {
          // 중간 지점이 오늘 읽는 장 안이거나 도착지와 같은 장이면 "다른 말씀을
          // 거쳐 왔다"가 아니다 — 사 7:14 → 요 1:1-2 → 요 1:1 같은 헛걸음이 된다
          const back = via1.get(u)
          if (back)
            bump(e.to, 2, {
              seed: back.seed,
              mid: u,
              label: e.label,
              midLabel: back.label,
              mass: add,
            })
        }
      }
    }
    frontier = next
  }
  return { score, inbound }
}

/**
 * 화면에 보여줄 참조 사슬들 — 직접 이어지는 자리 2개 + 다른 말씀을 거쳐 오는
 * 자리 1개. "오늘 본문의 여기저기가 이 말씀을 가리키고, 그중 하나는 다른
 * 말씀을 거쳐 온다"가 한눈에 읽히도록 고른 조합이다.
 */
function chainsFor(entry: { h1: Inbound[]; h2: Inbound[] } | undefined): string[][] {
  if (!entry) return []
  const out = entry.h1.slice(0, 2).map((e) => [refOf(e.seed), e.label])
  const two = entry.h2[0]
  if (two) out.push([refOf(two.seed), two.midLabel, two.label])
  return out
}

const table: Record<string, { v: string; s: number; c: string[][] }[]> = {}
BOOKS.forEach((book, b) => {
  for (let c = 1; c <= book.chapters; c++) {
    const key = `${book.abbr}${c}`
    const here = chapKey(vid(b, c, 1))
    const seeds: number[] = []
    for (let v = 1; v <= (lastVerse.get(here) ?? 0); v++) {
      const id = vid(b, c, v)
      if (adj.has(id)) seeds.push(id)
    }
    if (seeds.length === 0) {
      table[key] = []
      continue
    }
    const { score, inbound } = spread(seeds, here)

    const hits = new Map<string, { score: number; at: number }>()
    for (const [id, s] of score) {
      if (chapKey(id) === here) continue // 같은 장은 "다른 말씀"이 아니다
      const owners = corpusAt.get(id)
      if (!owners) continue
      const adjusted = s / Math.pow(inMass.get(id) ?? 1, P.hub)
      for (const owner of owners) {
        const prev = hits.get(owner)
        if (!prev || adjusted > prev.score) hits.set(owner, { score: adjusted, at: id })
      }
    }

    table[key] = [...hits]
      .sort((x, y) => y[1].score - x[1].score || (x[0] < y[0] ? -1 : 1))
      .slice(0, P.topK)
      .map(([verseId, hit]) => ({
        v: verseId,
        // 정수로 싣는다 — 0.00038353 대신 3835. 순위와 합산에만 쓰이므로
        // 소수 자리를 그대로 들고 다닐 이유가 없고, 표가 100KB 넘게 가벼워진다.
        s: Math.max(1, Math.round(hit.score * 1e7)),
        c: chainsFor(inbound.get(hit.at)),
      }))
  }
})

const sizes = Object.values(table).map((t) => t.length)
console.error(
  `장 ${Object.keys(table).length}개 · 후보 없음 ${sizes.filter((n) => n === 0).length}개 · 평균 후보 ${(sizes.reduce((a, x) => a + x, 0) / sizes.length).toFixed(1)}`,
)
const chains = Object.values(table).flatMap((t) => t.map((e) => e.c.length))
console.error(`사슬 수 평균 ${(chains.reduce((a, b) => a + b, 0) / chains.length).toFixed(2)}`)

const OUT = path.join(ROOT, 'src/data/xrefCandidates.json')
fs.writeFileSync(OUT, JSON.stringify(table))
console.error(`→ ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`)
