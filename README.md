# 말씀암송 — 주제별 성경암송 PWA

네비게이토 암송 과정을 **축자(word-perfect) 암기**와 **장기 유지** 양쪽에서
훈련하는 로컬 퍼스트 PWA.

- **수록 총량 495구절**: 5확신(5) → 생활지침 8동행(8) → 주제별 60구절(60) →
  제자의 도 DEP(242) → 주제별 성경암송 시리즈 180구절(180).
- **목표 범위 315구절**: 목표일 페이싱과 시험 준비도는 DEP242 완결까지
  (5+8+60+242)만 센다. 180구절 확장은 목표에 포함하지 않고 유지 복습 대상이다
  (`src/domain/goal.ts`의 `GOAL_VERSE_COUNT`). 서버 없이 브라우저(IndexedDB)에만 기록하며,
  아이폰/안드로이드 홈 화면에 설치해 오프라인으로 쓸 수 있다.

## 핵심 설계

- **학습 사다리** (새 구절): 본문 익히기(낭송 규칙: 주제→장절→말씀→장절) →
  첫글자 복원(엿보기 2회 이하) → 타이핑 검증(word-perfect) → 졸업.
- **3방향 카드**: 졸업 시 `주제→말씀`, `장절→말씀`, `말씀→장절` 카드가 각각
  독립 FSRS 상태로 생성된다.
- **FSRS 스케줄링**: [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs),
  목표 기억율 90%.
- **객관 채점 → 등급 자동 제안**: 타이핑은 어절 LCS diff(구두점 무시)로
  정확도를 계산해 FSRS 등급(다시/어려움/좋음)을 제안한다. 첫글자 모드는 엿보기
  횟수로, 장절 입력은 정오로 제안한다. 최종 선택은 사용자가 확정.
- **복습 모드 정책**: 어린 카드(reps<3) 첫글자 → 이후 낭송+자가채점,
  5회마다 타이핑 감사. `말씀→장절` 방향은 항상 장절 입력.

## 본문 데이터

- 역본: **성경전서 개역한글판(1961)** — 저작재산권 보호기간 만료(2011-12-31),
  퍼블릭 도메인.
- 추출: 대한성서공회 온라인 본문(bskorea.or.kr, version=HAN)에서 장 단위로
  추출·각주 제거 후, 독립 소스 2종(GitHub KRV 데이터셋)과 어절 단위 전수 대조.
- 구절 목록 (모두 복수 소스 교차 검증):
  - **5확신** 그리스도인의 확신 5구절 — 영어 원전(Lessons on Assurance PDF) 대조
  - **8동행** 그리스도인의 생활지침 8구절 — 독립 한국어 소스 2곳 일치
  - **60구절** TMS 5시리즈 × 6주제 × 2구절
  - **DEP** 제자의 도 8섹션(구원의 확신/경건의 시간/말씀/기도/교제/증거/주재권/세계비전)
    242구절 — 블로그 소스에서 누락됐던 세계비전 9번째 주제 "약속성취의 영광
    (합 2:14, 말 1:11)"은 사용자 책자 대조로 보완 완료(2026-07).
    원문 소스는 `scripts/data/dep242.txt`, 빌드는 `scripts/data/build_v2.py`.
    반절 구절(대하 16:9상 등 4건)은 장절 표기는 유지하되 본문은 절 전체를 수록.
  - **180구절** 주제별 성경암송 시리즈 5시리즈 × 36구절 — 원문 소스는
    `scripts/data/tms180.txt`. 장절 180/180, 본문은 글자 단위 180/180 일치
    (`npm run verify:data`).
- `src/data/verses.json` 스키마(v2):
  `컬렉션 - 섹션(대제목) - 그룹 - 주제(제목) - 장절 - 말씀`. 기존 60구절 구절
  id(A1a~E6b)는 사용자 데이터 호환을 위해 보존.

## 개발

```bash
npm install
npm run dev             # 개발 서버
npm test                # vitest (TZ=Asia/Seoul 고정)
npm run coverage        # vitest + domain/ 커버리지 임계값 검사
npm run typecheck       # tsc --noEmit
npm run lint            # ESLint 9 (typescript-eslint strict-type-checked)
npm run format          # Prettier
npm run build           # 프로덕션 빌드 (PWA 포함)
npm run preview         # 빌드 결과 로컬 서빙
npm run e2e             # Playwright (프로덕션 빌드 대상)
npm run verify:data     # 본문 정본 전수 대조 (원문 소스와 어절 단위 비교)
npm run audit:contrast  # 디자인 토큰 WCAG AA 명도비 감사
npm run bench           # 저장소 쿼리 벤치마크
```

## 구조

헥사고날 구조. 도메인은 순수 함수·타입만 두고 I/O를 모른다.

```
src/
  domain/      순수 규칙 — I/O 없음
    card.ts        카드·방향·증거 타입
    ladder.ts      학습 사다리 상태 머신 (불법 전이를 타입으로 차단)
    scheduler.ts   ts-fsrs 래퍼. applyRating은 이 모듈 밖으로 나가지 않는다
    grading.ts     글자 LCS diff 채점, 등급 매핑
    ref.ts         장절 입력 파서/채점
    policy.ts      복습 모드 선택 + 주기적 타이핑 감사
    stats.ts       통계 집계 · goal.ts 목표 페이싱
  ports/       저장소 인터페이스 (CardRepository / ReviewLog / … / Store)
  adapters/    indexeddb(v2 + 마이그레이션) · memory(테스트용) · gist · theme
  app/         유스케이스 — submitReview가 등급 적용의 유일한 경로
  views/       컨테이너/프레젠테이션 분리 + hash 라우팅
  styles/      디자인 토큰 → base → 컴포넌트 → 접근성 보정
```

등급 적용은 `app/submitReview` 하나뿐이다. `domain/scheduler.ts`의
`applyRating`은 export되지 않고, 유일한 진입점 `rateCard()`가 증거를 필수
인자로 받으며, 저장소는 그 결과(`RatedCard`)만 커밋할 수 있다 — 카드 상태
변경과 증거 기록이 타입으로 묶여 있고 한 트랜잭션으로 처리된다.

## 백업

설정 → 내보내기로 전체 상태(JSON)를 보관하고, 새 기기에서 가져오기로 복원한다.
