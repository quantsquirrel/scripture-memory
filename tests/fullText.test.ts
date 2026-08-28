/**
 * 개역한글 전문의 불변식.
 *
 * `scripts/data/build_fulltext.py`가 만들 때 게이트로 한 번 막지만, 그 스크립트는
 * 사람이 손으로 돌린다. 여기서 다시 보는 것은 **소스가 조용히 바뀌어도 CI가 잡게**
 * 하기 위해서다 — 특히 495구절과의 전수 대조는 두 코퍼스가 어긋나기 시작하는
 * 순간을 잡는 유일한 그물이다.
 */
import { describe, expect, it } from 'vitest'

import { BOOKS } from '../src/data/canon'
import full from '../src/data/fullText.json'
import { VERSE_PASSAGES, VERSES } from '../src/data/verses'
import xref from '../src/data/xrefCandidates.json'
import type { FullText } from '../src/domain/scripture'
import { textOf } from '../src/domain/scripture'

const TABLE = full as FullText

/** 개역한글 고린도후서 13장은 13절까지다 — 상호참조가 가리키는 유일한 빈자리 */
const CHAIN_EXCEPTIONS = new Set(['고후 13:14'])

const chars = (s: string): string => s.replace(/[^가-힣a-zA-Z0-9]/g, '')

const chapters = Object.entries(TABLE) as [string, (string | null)[]][]

describe('개역한글 전문 — 구조', () => {
  it('66권 1189장 31,102절이 빠짐없이 있다', () => {
    expect(chapters).toHaveLength(1189)
    expect(chapters.reduce((n, [, arr]) => n + arr.length, 0)).toBe(31102)
  })

  it('권별 장수가 canon.ts와 66권 전부 일치한다', () => {
    for (const b of BOOKS) {
      expect(TABLE[`${b.abbr}${b.chapters}`], `${b.name} ${b.chapters}장`).toBeDefined()
      expect(TABLE[`${b.abbr}${b.chapters + 1}`], `${b.name}에 없는 장`).toBeUndefined()
    }
  })

  it('빈 절이 없고 라틴 문자가 섞이지 않았다', () => {
    // 라틴 문자는 절이 잘리거나 HTML이 새어 들어온 자리를 드러낸다
    for (const [key, arr] of chapters) {
      for (const [i, t] of arr.entries()) {
        if (t === null) continue
        expect(t.trim(), `${key}:${i + 1}`).not.toBe('')
        expect(t, `${key}:${i + 1}`).not.toMatch(/[a-zA-Z]/)
      }
    }
  })

  it('절 자리가 null인 것은 합본 절의 이어지는 자리뿐이다', () => {
    // 첫 절이 null이면 앞에 덩어리가 없다는 뜻이라 조회가 배열 밖으로 나간다
    const nulls = chapters.flatMap(([key, arr]) =>
      arr.flatMap((t, i) => (t === null ? [`${key}:${i + 1}`] : [])),
    )
    expect(nulls).toHaveLength(21) // 19개 덩어리가 덮는 40절 − 덩어리 19개
    for (const [key, arr] of chapters) {
      expect(arr[0], `${key} 1절`).not.toBeNull()
    }
  })
})

describe('개역한글 전문 — 495구절과의 관계', () => {
  it('495구절 전수가 전문과 일치한다 (소스가 바뀌면 여기서 잡힌다)', () => {
    const mismatched: string[] = []
    for (const v of VERSES) {
      const arr = TABLE[`${v.bookAbbr}${v.chapter}`]
      if (!arr) {
        mismatched.push(`${v.refAbbr} (장 없음)`)
        continue
      }
      const seen = new Set<string>()
      const parts: string[] = []
      for (const n of v.verses) {
        let i = n - 1
        while (arr[i] === null) i--
        const t = arr[i]
        if (t === undefined || t === null) {
          parts.length = 0
          break
        }
        if (seen.has(t)) continue // 합본 덩어리를 두 번 잇지 않는다
        seen.add(t)
        parts.push(t)
      }
      const src = parts.join(' ')
      if (chars(src) !== chars(v.text) || src.split(/\s+/).join(' ') !== v.text) {
        mismatched.push(v.refAbbr)
      }
    }
    // 예외 목록을 두지 않는다 — 안 맞으면 추출이나 파싱이 잘못된 것이다
    expect(mismatched).toEqual([])
  })

  it('겹치는 자리는 495가 이긴다 (외운 그 문장·그 띄어쓰기를 보여준다)', () => {
    const v = VERSES[0]
    if (!v) throw new Error('구절이 없다')
    const label = `${v.bookAbbr} ${v.chapter}:${v.verses[0]}`
    const hit = textOf({ corpus: VERSE_PASSAGES, full: TABLE }, label)
    expect(hit?.text).toBe(v.text)
    expect(hit?.ref).toBe(v.refAbbr)
  })
})

describe('개역한글 전문 — 합본 절', () => {
  it('사슬이 뒤 절을 가리키면 덩어리를 주고 실제 범위를 밝힌다', () => {
    // 사 7:9는 사슬 노드로 14번 나오는데, 개역한글은 8-9절을 한 덩어리로
    // 인쇄한다. 물은 자리 그대로 '사 7:9'라 적으면 8절이 섞인 사실이 감춰진다.
    const hit = textOf({ corpus: VERSE_PASSAGES, full: TABLE }, '사 7:9')
    expect(hit?.ref).toBe('사 7:8-9')
    expect(hit?.text).toContain('아람의 머리는 다메섹이요')
  })

  it('합본 자리를 가리키는 사슬 노드가 전부 본문을 얻는다', () => {
    const sources = { corpus: VERSE_PASSAGES, full: TABLE }
    for (const node of ['사 7:9', '욥 35:10', '렘 33:11', '신 15:5', '롬 9:2']) {
      expect(textOf(sources, node)?.text, node).toBeTruthy()
    }
  })
})

describe('개역한글 전문 — 역본 판별', () => {
  // 개역개정판(1998)은 아직 보호 중인 저작물이다. 섞이면 만료 저작물이 아니라
  // 보호 중 저작물을 배포하게 되므로, 빌드 스크립트뿐 아니라 CI에서도 본다.
  //
  // '저희'·'그들'·'좇아'·'따라'로는 판정하지 않는다 — 개역한글도 '그들'과
  // '따라'를 쓴다. 양쪽에 다 나오는 말은 판별자가 되지 못한다.
  const blob = chapters.flatMap(([, arr]) => arr.filter((t) => t !== null)).join('\n')

  it('개역개정 전용 표기가 한 건도 없다', () => {
    for (const word of [
      '나병',
      '맹인',
      '파수꾼',
      '일꾼',
      '다리 저는',
      '막론하고',
      '청하건대',
      '여호와의 천사',
      '일찍이',
      '침례',
    ]) {
      expect(blob, `개역개정 전용 표기 '${word}'`).not.toContain(word)
    }
  })

  it('개역한글 전용 표기가 실측 하한 위에 있다 (장 단위 부분 오염 탐지)', () => {
    const measured: Record<string, number> = {
      가라사대: 782,
      가로되: 1911,
      일찌기: 54,
      문둥병: 51,
      소경: 75,
      파숫군: 37,
      일군: 28,
      절뚝발이: 14,
      무론하고: 20,
      세례: 101,
      찐대: 64,
      찐저: 62,
    }
    for (const [word, n] of Object.entries(measured)) {
      const found = blob.split(word).length - 1
      expect(found, `개역한글 전용 표기 '${word}'`).toBeGreaterThanOrEqual(Math.floor(n * 0.9))
    }
  })

  it('-ㄹ찌 어미가 -ㄹ지에 밀려나지 않았다', () => {
    // 개역한글은 '할찌니라', 개역개정은 '할지니라'다. ㄹ 받침 뒤의 어미만
    // 센다 — '알지 못하고'의 '지'는 두 역본에 다 있는 보조 연결어미다.
    const count = (target: string): number => {
      let n = 0
      for (let i = 1; i < blob.length; i++) {
        if (blob[i] !== target) continue
        const prev = (blob.codePointAt(i - 1) ?? 0) - 0xac00
        if (prev < 0 || prev >= 11172 || prev % 28 !== 8) continue
        if (/^(?:니|라|어다|로다|며|언정|어|로소이다)/.test(blob.slice(i + 1))) n++
      }
      return n
    }
    expect(count('찌')).toBeGreaterThanOrEqual(Math.floor(1943 * 0.9))
    // 취득한 그대로 남아 있는 잔여분. 늘어나면 개역개정이 섞인 것이다.
    expect(count('지')).toBeLessThanOrEqual(114)
  })
})

describe('개역한글 전문 — 사슬 해석', () => {
  it('사슬 노드가 전부 본문을 얻는다 (예외는 고후 13:14 한 건뿐)', () => {
    const table = xref as Record<string, { c: string[][] }[]>
    const nodes = new Set<string>()
    for (const cands of Object.values(table)) {
      for (const c of cands) {
        // 마지막 노드는 묵상 구절이라 늘 495에 있다 — 세지 않는다
        for (const chain of c.c) for (const n of chain.slice(0, -1)) nodes.add(n)
      }
    }
    const sources = { corpus: VERSE_PASSAGES, full: TABLE }
    const unresolved = [...nodes].filter((n) => textOf(sources, n) === null)
    expect(nodes.size).toBe(11528)
    expect(unresolved.sort()).toEqual([...CHAIN_EXCEPTIONS])
  })
})
