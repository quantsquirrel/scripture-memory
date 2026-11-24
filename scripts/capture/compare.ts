/**
 * 전후 비교 페이지와 모아 보기. 사용법은 README.md.
 *
 *   npx vite-node scripts/capture/compare.ts <전 폴더> <뒤 폴더> [--notes 메모.md] [--out 페이지.html]
 *   npx vite-node scripts/capture/compare.ts <폴더>          # 모아 보기 → <폴더>/index.html
 */
import { join, resolve } from 'node:path'

import { readNotes, writeCompare, writeGallery } from './report'

const argv = process.argv.slice(2)
const flag = (name: string): string | null => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? (argv[i + 1] ?? null) : null
}
const dirs = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'))
const [first, second] = dirs.map((d) => resolve(d))

if (first === undefined) {
  console.error('폴더를 하나(모아 보기) 또는 둘(전후 비교) 준다')
  process.exit(2)
}

if (second === undefined) {
  console.log(`모아 보기: ${writeGallery(first)}`)
} else {
  const notes = flag('notes')
  const out = resolve(flag('out') ?? join(second, 'compare.html'))
  const r = writeCompare(first, second, readNotes(notes === null ? null : resolve(notes)), out)
  console.log(`전후 비교: ${r.out}`)
  const extra = [
    ...(r.missing > 0 ? [`그림 없는 쌍 ${String(r.missing)}`] : []),
    ...(r.failed > 0 ? [`실패한 상태 ${String(r.failed)}`] : []),
  ]
  console.log(
    [
      `바뀐 쌍 ${String(r.changed)}`,
      `같은 쌍 ${String(r.unchanged)}`,
      `한쪽에만 있는 상태 ${String(r.oneSided)}`,
      ...extra,
    ].join(' · ') + ' (쌍 = 상태 하나의 테마·폭 하나, 전체 그림 포함)',
  )
  if (r.regressions.length === 0) console.log('접근성 측정값에서 나빠진 항목 없음')
  else {
    console.log(`나빠진 접근성 측정값 ${String(r.regressions.length)}개:`)
    for (const line of r.regressions) console.log(`  ${line}`)
  }
}
