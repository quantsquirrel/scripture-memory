// 본문 정본 대조의 회귀 고정.
//
// T5에서 495구절을 원문 소스와 전수 대조한 결과를 테스트로 못박는다.
// 원문 소스가 담고 있는 것이 달라 대조 범위도 다르다:
//   - scripts/data/tms180.txt : 장절 + 본문  → 180구절 본문까지 대조
//   - scripts/data/dep242.txt : 장절만       → DEP242는 장절만 대조
//   - 5확신·8동행·60구절(73구절) : 저장소에 독립 소스 없음 → 내부 교차 검증
//
// 전체 보고서는 `npm run verify:data`가 출력한다.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { collectionOf, refKeyOf, VERSES } from '../src/data/verses'
import { toChars } from '../src/domain/grading'
import { required } from '../src/domain/invariant'

const readSource = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8')

const norm = (s: string): string => toChars(s).join('')

const byCollection = (key: string) => VERSES.filter((v) => collectionOf(v).key === key)

/**
 * 장절 토큰을 '약칭 장:절,절,…' 표준형으로 펼친다.
 * 원문은 '고전12:4-6' 같은 범위 표기를, JSON은 절 배열을 쓰므로 양쪽을 같은 모양으로.
 */
function canonicalRef(token: string): string {
  const m = /^([가-힣]+)\s*(\d+)\s*:\s*(.+)$/.exec(token.trim())
  if (!m?.[1] || !m[2] || !m[3]) return token.trim()
  const verses: number[] = []
  for (const part of m[3].replace(/[상하]/g, '').split(',')) {
    const range = /^(\d+)[-~](\d+)$/.exec(part.trim())
    if (range?.[1] !== undefined && range[2] !== undefined) {
      for (let i = Number(range[1]); i <= Number(range[2]); i++) verses.push(i)
    } else if (part.trim() !== '') {
      verses.push(Number(part.trim()))
    }
  }
  return `${m[1]}${m[2]}:${verses.join(',')}`
}

describe('개역한글(1961) 표기 일관성', () => {
  it("'-ㄹ찌' 계열만 쓰고 개역개정의 '-ㄹ지'가 섞이지 않는다", () => {
    // 개역한글은 '예배할찌니라/거룩할찌어다'처럼 쓰고, 개역개정이 '지'로 바꿨다.
    // 세 컬렉션(60구절·DEP·180구절)이 서로 다른 경로로 들어왔는데도 표기가
    // 일관된다는 것이 정본을 따르고 있다는 증거다.
    const jji = VERSES.filter((v) => /(할찌|알찌|볼찌|울찌|찌어다|찌니라|찌로다)/.test(v.text))
    const ji = VERSES.filter((v) => /(할지니|할지라|지어다|지니라(?![가-힣]))/.test(v.text))
    expect(jji.length).toBe(17)
    expect(ji).toEqual([])
    // 세 컬렉션 모두에 나타난다 (한 소스에서만 온 것이 아니다)
    const cols = new Set(jji.map((v) => collectionOf(v).key))
    expect([...cols].sort()).toEqual(['DEP', 'TMS180', 'TMS60'])
  })

  it('현대어·이질 문자가 본문에 섞이지 않는다', () => {
    for (const v of VERSES) {
      expect(v.text, `${v.id} 경어체`).not.toMatch(/습니다|합니다/)
      expect(v.text, `${v.id} 라틴 문자`).not.toMatch(/[a-zA-Z]/)
      expect(v.text, `${v.id} 아라비아 숫자`).not.toMatch(/[0-9]/)
      expect(v.text, `${v.id} 전각 괄호`).not.toMatch(/[（）［］]/)
    }
  })

  it('본문에 앞뒤 공백이나 연속 공백이 없다', () => {
    for (const v of VERSES) {
      expect(v.text, v.id).toBe(v.text.trim())
      expect(v.text, v.id).not.toMatch(/\s{2}/)
    }
  })
})

describe('장절 표기와 절 배열의 정합성', () => {
  it('절 번호는 오름차순이고 중복이 없으며 비어 있지 않다', () => {
    for (const v of VERSES) {
      expect(v.verses.length, v.id).toBeGreaterThan(0)
      expect(
        [...v.verses].sort((a, b) => a - b),
        v.id,
      ).toEqual(v.verses)
      expect(new Set(v.verses).size, v.id).toBe(v.verses.length)
    }
  })

  it('반절 표기(상/하) 구절은 장절 표기를 유지하고 본문은 절 전체를 담는다', () => {
    const half = VERSES.filter((v) => /[상하]$/.test(v.refAbbr))
    // 대하 16:9상, 삼상 2:30하, 히 11:36-38상 등 — 표기는 유지가 의도다
    expect(half.map((v) => v.refAbbr).sort()).toEqual([
      '대하 16:9상',
      '대하 16:9상',
      '삼상 2:30하',
      '히 11:36-38상',
    ])
    for (const v of half) expect(v.text.length, v.id).toBeGreaterThan(10)
  })
})

describe('겹치는 장절의 본문 동일성 (독립 소스 없는 73구절의 교차 검증)', () => {
  it('같은 장절을 공유하는 구절은 본문이 완전히 같다', () => {
    const groups = new Map<string, typeof VERSES>()
    for (const v of VERSES) {
      const k = refKeyOf(v)
      const arr = groups.get(k)
      if (arr) arr.push(v)
      else groups.set(k, [v])
    }
    const shared = [...groups.values()].filter((g) => g.length > 1)
    // 5확신·8동행·60구절은 저장소에 원문 파일이 없다. 대신 DEP·180구절과
    // 장절이 겹치는 구절들의 본문이 일치하는지로 교차 검증한다.
    expect(shared.length).toBe(70)
    for (const group of shared) {
      const texts = new Set(group.map((v) => norm(v.text)))
      expect(
        texts.size,
        `${refKeyOf(required(group[0]))}: ${group.map((v) => v.id).join(',')}`,
      ).toBe(1)
    }
  })
})

describe('원문 소스와의 대조 고정', () => {
  it('180구절의 장절이 tms180.txt와 순서까지 정확히 일치한다', () => {
    const src = readSource('scripts/data/tms180.txt')
    const entries: { ref: string; text: string }[] = []
    for (const raw of src.split('\n')) {
      const m = /^([가-힣]+\s*\d+\s*:\s*[\d,\-~]+)\s+(.+)$/.exec(raw.trim())
      if (m?.[1] !== undefined && m[2] !== undefined && m[2].length > 8) {
        entries.push({ ref: m[1].replace(/\s+/g, ''), text: m[2].trim() })
      }
    }
    const json = byCollection('TMS180')
    expect(entries).toHaveLength(180)
    expect(json).toHaveLength(180)
    for (const [i, e] of entries.entries()) {
      const v = required(json[i], `${String(i)}번째 구절`)
      expect(`${v.bookAbbr}${v.chapter}:${v.verses.join(',')}`, v.id).toBe(canonicalRef(e.ref))
    }
  })

  it('180구절 본문은 띄어쓰기·개역한글 표기 차이 외에 원문과 같다', () => {
    const src = readSource('scripts/data/tms180.txt')
    const texts: string[] = []
    for (const raw of src.split('\n')) {
      const m = /^([가-힣]+\s*\d+\s*:\s*[\d,\-~]+)\s+(.+)$/.exec(raw.trim())
      if (m?.[2] !== undefined && m[2].length > 8) texts.push(m[2].trim())
    }
    const json = byCollection('TMS180')
    let identical = 0
    const differing: string[] = []
    for (const [i, srcText] of texts.entries()) {
      const v = required(json[i], `${String(i)}번째 구절`)
      if (norm(srcText) === norm(v.text)) {
        identical++
        continue
      }
      differing.push(v.id)
    }
    // 글자 단위(띄어쓰기·구두점 무시)로 171/180이 완전히 같고, 다른 9건은
    // tms180.txt의 '-ㄹ지' 현대화 표기 8건 + '힙입어' 오타 1건이 전부다.
    // 즉 본문 자체가 어긋난 구절은 없다.
    expect(identical).toBe(171)
    expect(differing.sort()).toEqual([
      'T1-19a',
      'T1-20a',
      'T2-15a',
      'T2-1a',
      'T2-8b',
      'T3-11a',
      'T4-3b',
      'T5-18a',
      'T5-24a',
    ])
  })

  it('원문이 현대화한 8구절은 JSON이 개역한글 표기를 지킨다', () => {
    const modernized = [
      'T1-19a',
      'T1-20a',
      'T2-1a',
      'T2-8b',
      'T2-15a',
      'T3-11a',
      'T4-3b',
      'T5-24a',
    ]
    const byId = new Map(VERSES.map((v) => [v.id, v]))
    for (const id of modernized) {
      const v = required(byId.get(id), id)
      expect(v.text, `${id}는 개역한글 '찌' 표기를 지켜야 한다`).toMatch(/찌/)
    }
  })

  it('원문의 오타 2건을 JSON이 따라가지 않는다', () => {
    const src180 = readSource('scripts/data/tms180.txt')
    const srcDep = readSource('scripts/data/dep242.txt')
    // 원문에는 오타가 있다
    expect(src180).toContain('힙입어')
    expect(srcDep).toContain('엠6:17')
    // JSON은 올바른 표기를 쓴다
    expect(VERSES.filter((v) => v.text.includes('힙입어'))).toEqual([])
    expect(VERSES.filter((v) => v.text.includes('힘입어')).map((v) => v.id)).toEqual(['T5-18a'])
    expect(
      VERSES.filter((v) => v.bookAbbr === '엡' && v.chapter === 6 && v.verses.join() === '17'),
    ).toHaveLength(1)
  })

  it('DEP242의 장절 241개가 dep242.txt와 일치한다 (남은 1건은 원문 오타)', () => {
    const abbrs = [...new Set(VERSES.map((v) => v.bookAbbr))].sort(
      (a, b) => b.length - a.length,
    )
    const re = new RegExp(
      `(?:${abbrs.join('|')})\\s*\\d+\\s*:\\s*\\d+(?:[,\\-~]\\d+)*[상하]?`,
      'g',
    )
    const src = readSource('scripts/data/dep242.txt')
    const found = new Set<string>()
    for (const raw of src.split('\n')) {
      if (/^(\[출처\]|window\.|entryId|\})/.test(raw.trim())) continue
      for (const tok of raw.match(re) ?? []) found.add(canonicalRef(tok))
    }
    const dep = byCollection('DEP')
    expect(dep).toHaveLength(242)
    const missing = dep.filter(
      (v) => !found.has(`${v.bookAbbr}${v.chapter}:${v.verses.join(',')}`),
    )
    // 엡6:17만 빠진다 — 원문이 '엠6:17'로 잘못 적었기 때문이다
    expect(missing.map((v) => v.refAbbr)).toEqual(['엡 6:17'])
  })
})
