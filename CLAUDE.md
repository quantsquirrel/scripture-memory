# scripture-memory

네비게이토 암송 과정(개역한글판) 훈련 PWA. 사용자 1명, 로컬 퍼스트.

**수록 총량 495구절** (5확신 5 + 8동행 8 + 60구절 60 + DEP242 242 + 180구절 180).
**목표 범위는 315구절** — 목표일 페이싱과 시험 준비도는 DEP242 완결까지만 센다
(`src/domain/goal.ts`의 `GOAL_VERSE_COUNT`). 180구절은 목표에 넣지 않고 유지
복습 대상이다. 이 둘을 섞어 쓰지 말 것.

이 앱의 존재 이유: 기존 도구는 "축자(word-perfect) 암기 훈련"과 "수년 단위 유지(FSRS)"를
모두 갖춘 것이 없고, 특히 **객관적 채점 증거를 FSRS 등급으로 연결**하는 도구가 없다.
아래 하드 경계는 그 존재 이유를 지키는 최소 규칙이다.

## 진실 우선순위

**코드와 테스트가 현재 의도의 정본이다.** 이 문서(또는 메모리)가 코드·테스트와
충돌하면, 코드를 문서에 맞춰 "고치지" 말고 사용자에게 어느 쪽이 의도인지 확인하라.

## 하드 경계

1. **증거 없는 등급 적용 금지.** FSRS 상태 변경은 `submitReview()`(src/app/review.ts)를
   통해서만 — 등급 적용과 증거(ReviewEntry) 기록은 항상 한 트랜잭션이다.
   `applyRating`은 src/domain/scheduler.ts 밖으로 export하지 않는다. 유일한
   진입점 `rateCard()`가 증거를 필수 인자로 받고, 저장소의 `commitRating`은
   그 결과(`RatedCard`, 미공개 심볼 브랜드)만 받는다. `assertRated()`가 커밋
   직전 런타임 검증까지 한다. 증거를 먼저 쓰고 카드를 나중에 쓴다(fail-closed).
2. **객관 채점이 기본, 자가 채점은 감사와 함께만.** 객관 모드(typing/refInput/firstLetter)의
   제안 등급은 입력 증거(diff 정확도, 정답 여부, 엿보기 횟수)에서만 산출한다.
   recite 자가 채점은 의도된 예외이며, 반드시 주기적 타이핑 감사 정책
   (src/domain/policy.ts)과 함께 존재해야 한다. 감사 주기를 제거하거나 우회하는
   변경 금지. `reps`는 백업 가져오기로 외부에서 들어오므로 정수 검증
   (src/adapters/bundle.ts의 `count()`)과 `Math.floor` 계산을 둘 다 유지해야
   한다 — 소수 reps는 감사 주기를 영구히 건너뛰게 만든다.
3. **기존 사용자 데이터는 생존해야 한다.** 저장(IndexedDB)·export 스키마를 바꾸면
   마이그레이션을 함께 구현하고, tests/fixtures/의 골든 fixture로 검증하라.
   **기존 fixture 파일 수정 금지** — 그것이 과거 사용자 데이터의 대역이다.
   새 버전을 만들면 새 fixture를 추가한다.
4. **오프라인 완결.** 계정·백엔드 없이 핵심 기능(학습·복습·export)이 동작해야 한다.
   필수 네트워크 의존 추가 금지. Gist 동기화(src/adapters/gist.ts)는 선택 기능이며
   src/app/sync.ts의 **동적 import**로만 닿는다 — 정적으로 import하면 네트워크
   코드가 메인 번들에 섞여 이 경계가 관례로 내려앉는다.

## 복습·저장 코드 변경 전 체크리스트

- 증거 기록 없이 FSRS 등급이 만들어지는 새 경로가 생기는가?
- 자가 채점이 객관 감사 없이 무한정 이어질 수 있게 되는가?
- 영속 데이터(IndexedDB)나 export 형식이 바뀌는가? → 마이그레이션 + fixture 테스트
- 필수 네트워크 의존이 생기는가?
- 어떤 테스트가 의도한 동작을 증명하는가?

## 결정 기록

되돌리기 아까운 결정은 커밋 본문에 `decision:` 블록으로 남긴다.
Why에는 이론이 아니라 **관찰된 사실 한 줄**만 쓴다 (예: "실사용에서 문장부호 감점이 과했음").
별도 ADR 문서는 만들지 않는다.

## 명령

- 테스트: `npm test` (TZ=Asia/Seoul 고정 — CI가 UTC라서)
- 커버리지: `npm run coverage` (domain/ 임계값 강제, CI가 이걸 돌린다)
- 타입 검사: `npm run typecheck` · 린트: `npm run lint` · 포맷: `npm run format`
- 빌드: `npm run build` · E2E: `npm run e2e`
- 본문 정본 대조: `npm run verify:data` · 명도비 감사: `npm run audit:contrast`

하드 경계 회귀 테스트는 `tests/boundaries.test.ts`에 있다. 경계를 건드리는
변경을 했다면 이 파일이 먼저 실패해야 정상이다.

## 데이터

- 본문 정본: 대한성서공회(bskorea) 개역한글판. GitHub의 KRV 소스는 결함이 있어 쓰지 않는다.
- 성경 데이터: src/data/verses.json (학습 권장 순서로 정렬됨)
- 원문 소스: scripts/data/tms180.txt(장절+본문), scripts/data/dep242.txt(장절만).
  두 파일은 개역한글로 교정했다 — '-ㄹ찌'가 개역한글, '-ㄹ지'가 개역개정이다.
  `npm run verify:data`가 verses.json과 어절 단위로 전수 대조한다.
- '그들'·'따라'는 개역한글 표기다 (KRV 원문 대조 확인). '저희'·'좇아'로
  "고치지" 말 것.
