/**
 * 정경 66권 표 — 개역한글 표준 약칭 · 전체 이름 · 장수 · OSIS 코드.
 *
 * verses.ts의 BOOK_ALIASES는 암송 495구절에 등장하는 책만 안다. 묵상 기능은
 * 통독 계획(66권 전부)과 상호참조 데이터(OSIS 코드 표기)를 오가야 하므로
 * 전권 표가 필요하다.
 *
 * 장수는 개신교 정경 기준 총 1189장이며, tests/readingPlan.test.ts가 통독
 * 계획과 대조해 전수 검증한다.
 */
export interface BookInfo {
  /** 개역한글 표준 약칭 (통독 계획·앱 표기의 정본) */
  abbr: string
  /** 전체 이름 */
  name: string
  /** 장수 */
  chapters: number
  /** OSIS 책 코드 — 상호참조 데이터셋의 키 */
  osis: string
  testament: 'OT' | 'NT'
}

// prettier-ignore
const TABLE: readonly [abbr: string, name: string, chapters: number, osis: string][] = [
  ['창', '창세기', 50, 'Gen'], ['출', '출애굽기', 40, 'Exod'], ['레', '레위기', 27, 'Lev'],
  ['민', '민수기', 36, 'Num'], ['신', '신명기', 34, 'Deut'], ['수', '여호수아', 24, 'Josh'],
  ['삿', '사사기', 21, 'Judg'], ['룻', '룻기', 4, 'Ruth'], ['삼상', '사무엘상', 31, '1Sam'],
  ['삼하', '사무엘하', 24, '2Sam'], ['왕상', '열왕기상', 22, '1Kgs'], ['왕하', '열왕기하', 25, '2Kgs'],
  ['대상', '역대상', 29, '1Chr'], ['대하', '역대하', 36, '2Chr'], ['스', '에스라', 10, 'Ezra'],
  ['느', '느헤미야', 13, 'Neh'], ['에', '에스더', 10, 'Esth'], ['욥', '욥기', 42, 'Job'],
  ['시', '시편', 150, 'Ps'], ['잠', '잠언', 31, 'Prov'], ['전', '전도서', 12, 'Eccl'],
  ['아', '아가', 8, 'Song'], ['사', '이사야', 66, 'Isa'], ['렘', '예레미야', 52, 'Jer'],
  ['애', '예레미야애가', 5, 'Lam'], ['겔', '에스겔', 48, 'Ezek'], ['단', '다니엘', 12, 'Dan'],
  ['호', '호세아', 14, 'Hos'], ['욜', '요엘', 3, 'Joel'], ['암', '아모스', 9, 'Amos'],
  ['옵', '오바댜', 1, 'Obad'], ['욘', '요나', 4, 'Jonah'], ['미', '미가', 7, 'Mic'],
  ['나', '나훔', 3, 'Nah'], ['합', '하박국', 3, 'Hab'], ['습', '스바냐', 3, 'Zeph'],
  ['학', '학개', 2, 'Hag'], ['슥', '스가랴', 14, 'Zech'], ['말', '말라기', 4, 'Mal'],
  ['마', '마태복음', 28, 'Matt'], ['막', '마가복음', 16, 'Mark'], ['눅', '누가복음', 24, 'Luke'],
  ['요', '요한복음', 21, 'John'], ['행', '사도행전', 28, 'Acts'], ['롬', '로마서', 16, 'Rom'],
  ['고전', '고린도전서', 16, '1Cor'], ['고후', '고린도후서', 13, '2Cor'], ['갈', '갈라디아서', 6, 'Gal'],
  ['엡', '에베소서', 6, 'Eph'], ['빌', '빌립보서', 4, 'Phil'], ['골', '골로새서', 4, 'Col'],
  ['살전', '데살로니가전서', 5, '1Thess'], ['살후', '데살로니가후서', 3, '2Thess'],
  ['딤전', '디모데전서', 6, '1Tim'], ['딤후', '디모데후서', 4, '2Tim'], ['딛', '디도서', 3, 'Titus'],
  ['몬', '빌레몬서', 1, 'Phlm'], ['히', '히브리서', 13, 'Heb'], ['약', '야고보서', 5, 'Jas'],
  ['벧전', '베드로전서', 5, '1Pet'], ['벧후', '베드로후서', 3, '2Pet'], ['요일', '요한일서', 5, '1John'],
  ['요이', '요한이서', 1, '2John'], ['요삼', '요한삼서', 1, '3John'], ['유', '유다서', 1, 'Jude'],
  ['계', '요한계시록', 22, 'Rev'],
]

/** 정경 순서 그대로 */
export const BOOKS: readonly BookInfo[] = TABLE.map(([abbr, name, chapters, osis], i) => ({
  abbr,
  name,
  chapters,
  osis,
  testament: i < 39 ? 'OT' : 'NT',
}))

export const BOOK_BY_ABBR: ReadonlyMap<string, BookInfo> = new Map(
  BOOKS.map((b) => [b.abbr, b]),
)
export const BOOK_BY_OSIS: ReadonlyMap<string, BookInfo> = new Map(
  BOOKS.map((b) => [b.osis, b]),
)
/** 정경 순번 (0-based) — 구절 정렬·구간 비교용 */
export const BOOK_ORDER: ReadonlyMap<string, number> = new Map(BOOKS.map((b, i) => [b.abbr, i]))
