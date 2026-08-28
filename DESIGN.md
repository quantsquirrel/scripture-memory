---
version: alpha
name: Ivan
description: >
  네비게이토 암송 과정 훈련 PWA "Ivan"의 디자인 시스템. Ivan은 Navi를 뒤집은
  이름이자 요한(Yohanan, "여호와는 은혜로우시다")의 슬라브형이다. 항해 도구가
  아니라 밤의 독서실 — 말씀이 주인공이고, 은혜의 등불 하나가 길을 비춘다.
colors:
  primary: '#e7b45a'
  bg: '#0b1120'
  panel: '#151f36'
  panel-alt: '#1f2c4c'
  line: '#48588f'
  border: '#7286bd'
  text: '#ede8da'
  muted: '#a9b3cd'
  accent: '#e7b45a'
  on-accent: '#221a09'
  info: '#a2c2f2'
  ok: '#82cd90'
  warn: '#e3b258'
  bad: '#ec9186'
typography:
  app-title:
    fontFamily: Pretendard
    fontSize: 1.3rem
    fontWeight: 700
    letterSpacing: 0.02em
  section-title:
    fontFamily: Pretendard
    fontSize: 1.02rem
    fontWeight: 700
  verse-body:
    fontFamily: Noto Serif KR
    fontSize: 1.02rem
    lineHeight: 1.95
  verse-prompt:
    fontFamily: Pretendard
    fontSize: 1.45rem
    fontWeight: 700
    lineHeight: 1.3
  body-md:
    fontFamily: Pretendard
    fontSize: 0.95rem
    lineHeight: 1.7
  meta-sm:
    fontFamily: Pretendard
    fontSize: 0.8rem
    lineHeight: 1.7
  label-caps:
    fontFamily: Pretendard
    fontSize: 0.72rem
    letterSpacing: 0.06em
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  panel:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.lg}'
    padding: 16px
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.md}'
    padding: 13px
  button-secondary:
    backgroundColor: '{colors.panel-alt}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: 13px
  button-danger:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.bad}'
    rounded: '{rounded.md}'
    padding: 13px
  nav-tab-active:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.accent}'
    rounded: '{rounded.md}'
  mode-tag:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.info}'
    typography: '{typography.label-caps}'
    rounded: '{rounded.sm}'
  progress-bar:
    backgroundColor: '{colors.panel-alt}'
    rounded: '{rounded.pill}'
    height: 10px
  progress-fill:
    backgroundColor: '{colors.accent}'
    rounded: '{rounded.pill}'
  text-meta:
    textColor: '{colors.muted}'
    typography: '{typography.meta-sm}'
  diff-score-good:
    textColor: '{colors.ok}'
    rounded: '{rounded.md}'
    padding: 8px
  diff-score-warn:
    textColor: '{colors.warn}'
    rounded: '{rounded.md}'
    padding: 8px
  diff-score-bad:
    textColor: '{colors.bad}'
    rounded: '{rounded.md}'
    padding: 8px
---

## Overview

**Ivan은 Navi의 반전이다.** Navi(나비·항해자)가 지도와 경로, 진행률을 앞세우는
"안내하는 도구"라면, Ivan은 그 이름을 뒤집었듯 우선순위도 뒤집는다 — 도구가
사람을 이끄는 것이 아니라 **말씀이 화면의 주인이 되고, 나머지는 모두 물러선다**.
Ivan은 요한(Yohanan)의 슬라브형이며 그 뜻은 "여호와는 은혜로우시다"다. 이 앱의
화면이 전하려는 단 하나의 감각이 그것이다: 훈련 성과가 아니라 은혜.

시각 은유는 **밤바다 위의 등불**이다. 깊은 남빛 배경(밤바다) 위에 따뜻한 상아색
본문(양피지의 글)과 금빛 악센트(등불) 하나. 디자인 스킬 갤러리(typeui.sh, 90종)
전수 탐색 결과를 따라 **calm(저자극·부드러운 대비) + paper(지면 같은 표면)를
기반**으로 삼고, **editorial의 독서 타이포 위계**와 **spacious의 여백·행간**을
빌린다. refined(절제된 마감)로 다듬되, clean/contemporary류의 범용 SaaS 톤과
warm/cafe류의 라이프스타일 브랜드 톤, 글래스모피즘·그라디언트 같은 장식 계열은
경건한 분위기와 충돌하므로 채택하지 않는다.

세 가지 원칙:

1. **말씀 우선.** 성경 본문만 세리프(Noto Serif KR)를 쓴다. 본문은 화면에서
   가장 넓고 가장 숨 쉬는 요소이며(행간 1.95), UI는 산세리프로 물러선다.
2. **등불은 하나.** 금색 악센트는 화면당 하나의 주 행동(오늘 복습, 제출)에만
   쓴다. 악센트가 둘이면 등불이 아니라 조명이다.
3. **지표는 접힌다.** 정확도·FSRS 상태 같은 훈련 지표는 muted 색·작은 크기로
   물러서거나 접힌 영역에 둔다. 숫자가 은혜를 가리지 않게 한다.

**워드마크:** 소문자 `ıvan`(dotless ı) 위에 금색 점 하나를 올린다 — i의 점이
곧 등불이다. 구현은 `.brand`/`.brand-i`(base.css). 워드마크의 점은 "악센트는
화면당 주 행동 1곳" 규칙의 예외가 아니라 그 규칙의 상징이다: 화면 어디에서든
등불은 하나뿐이라는 표지. 접근성 이름은 `aria-label="Ivan"`으로 준다.

## Colors

정본 팔레트는 **다크(기본)**다. 값은 `src/styles/tokens.css`의
`--palette-dark-*`와 1:1 대응하며, 그 파일이 구현의 진실이다. 모든 값은
`npm run audit:contrast`(WCAG 감사)를 통과한 상태이므로, 색을 바꿀 때는 이
문서와 tokens.css를 함께 고치고 감사를 다시 돌린다.

- **bg (#0b1120):** 밤바다. 앱 전체의 바닥. 순검정이 아닌 남빛 — 차갑지 않고
  깊게.
- **panel (#151f36) / panel-alt (#1f2c4c):** 물결의 층. 카드와 입력면을 배경에서
  한 단계씩 들어올린다. 그림자 대신 이 두 단의 명도 차가 깊이를 만든다.
- **line (#48588f):** 장식용 헤어라인. 컨트롤 식별에 쓰지 않는다(WCAG 1.4.11
  비적용 대상).
- **border (#7286bd):** 입력·버튼처럼 경계가 컨트롤을 식별하는 곳 전용.
  배경 대비 3:1 이상을 유지해야 한다.
- **text (#ede8da):** 양피지 상아색. 순백을 쓰지 않는 이유는 어둠 속에서
  눈부심 없이 오래 읽기 위해서다.
- **muted (#a9b3cd):** 메타데이터·지표·보조 설명. "물러서는 것들"의 색.
- **primary = accent (#e7b45a) / on-accent (#221a09):** 등불의 금색. 이 시스템의
  primary이자 유일한 브랜드색. 주 행동 버튼, 활성 탭, 진행률 채움에만 쓴다.
  넓은 면적의 배경으로 쓰지 않는다. 구현(`--color-accent`)에서는 accent라는
  이름을 쓴다.
- **info (#a2c2f2):** 장절 표기·모드 태그. 차분한 하늘빛으로 본문과 구분한다.
- **ok (#82cd90) / warn (#e3b258) / bad (#ec9186):** 채점 결과 전용 상태색.
  diff 점수와 오답 표시 밖에서는 쓰지 않는다.

**라이트 팔레트는 다크의 반전이다** — Navi→Ivan 역철의 시각 번역. 잉크와 종이가
자리를 바꾼다: bg `#f7f1e3`(따뜻한 종이) / panel `#fffdf6` / panel-alt
`#f0e7d2` / line `#a2977c` / border `#837455` / text `#222b45`(남빛 잉크) /
muted `#565f78` / accent `#8a5a09`(깊은 금) / on-accent `#fffaee` / info
`#2c4b80` / ok `#2d6a3b` / warn `#7a570c` / bad `#90352a`. 새 색을 더할 때는
반드시 두 팔레트에 쌍으로 더하고, 의미 토큰(`--color-*`)을 통해서만 참조한다.

## Typography

두 서체의 역할 분담이 이 시스템의 뼈대다.

- **Noto Serif KR — 오직 성경 본문.** `verse-body`(1.02rem, 행간 1.95)는 낭송
  중 눈이 한 줄을 따라가기 쉽도록 행간을 넉넉히 잡는다. 세리프가 본문 밖(버튼,
  제목, 설명)으로 새어 나가면 "말씀만 세리프"라는 위계가 무너진다.
- **Pretendard — 모든 UI.** 시스템 폴백은 Apple SD Gothic Neo → Noto Sans KR.
- **크기 스케일:** 0.72 / 0.8 / 0.88 / 0.95 / 1.02 / 1.12 / 1.3 / 1.45 /
  1.6rem. 새 크기를 발명하지 말고 이 스케일에서 고른다.
- `verse-prompt`(1.45rem 굵게)는 복습 카드의 장절 질문("요 1:12은?")처럼 화면당
  하나뿐인 물음에 쓴다. 진하고 크게 — 그러나 답(본문)이 나타나면 본문이 주인공.
- `label-caps`(0.72rem, 자간 0.06em)는 모드 태그·범례 등 분류 라벨 전용.
- 숫자 지표(정확도 %, 남은 개수)는 `meta-sm` + muted 색이 기본이다. 문장의
  핵심이 되는 큰 숫자(`big-number`, 오늘 복습 구절 수 등)는 크기만 키우고
  색은 본문색을 쓴다 — 금색 숫자 금지. 지표를 키우고 싶다는 유혹이 들면
  Overview의 원칙 3을 다시 읽는다.

## Layout

- **한 열, 최대 560px, 중앙 정렬.** 이 앱은 한 손 모바일 PWA다. 데스크톱에서도
  열을 넓히지 않는다 — 읽기 폭이 곧 낭송 폭이다.
- **간격은 4px 스케일**(xs 4 / sm 8 / md 12 / lg 16 / xl 24). 카드 안쪽 여백은
  lg(16px), 카드 사이는 14px, 섹션 사이는 xl.
- **하단 고정 내비게이션** (블러 배경 + 상단 헤어라인). 본문 스크롤 영역은
  내비 높이 + `env(safe-area-inset-bottom)`만큼 하단 패딩을 확보한다.
- **터치 타겟 최소 44px** (WCAG 2.2 Target Size 권장). 단어 칩(첫글자 보드)처럼
  밀도가 필요한 곳도 최소 24px을 지킨다.
- 화면당 카드(panel) 2–4장을 세로로 쌓는 구조가 기본형이다. 그리드는 시리즈
  진행판(5열)과 통계 차트에만 쓴다.

## Elevation & Depth

**그림자로 띄우지 않고 명도로 가라앉힌다.** 깊이는 bg → panel → panel-alt 세 단의
명도 단차로만 표현한다 — 밤바다에서 물결의 층이 그렇듯, 광원을 상정한 드롭
섀도는 이 세계에 없다. 예외는 정확히 둘뿐이다:

- **하단 내비게이션:** 88% 불투명 배경 + `backdrop-filter: blur(12px)` + 위쪽
  헤어라인, 그리고 얇은 상향 그림자(`0 -1px 12px rgb(0 0 0 / 22%)`). 콘텐츠
  위에 실제로 떠 있는 유일한 면이기 때문이다.
- **포커스 링:** `0 0 0 3px`의 accent 45% 링. 그림자가 아니라 키보드 사용자를
  위한 표지다.

이 두 예외 밖에서 `box-shadow`가 등장하면 잘못된 것이다.

## Shapes

- 반경 스케일: sm 6px(태그·작은 칩) / md 10px(버튼·입력·단어 칩) / lg
  14px(카드 panel) / pill(진행률 바·배지).
- 큰 면일수록 반경이 크다. 카드보다 각진 버튼, 버튼보다 각진 태그 — 이 순서가
  뒤집히면 어색해진다.
- 정답 공개 전 경계선은 점선(dashed hairline)으로 긋는다. "아직 열리지 않은
  것"의 관례다.

## Components

값은 front matter의 `components`가 정본이다. 적용 규칙:

- **button-primary:** 화면당 하나. 오늘의 주 행동(복습 시작, 제출, 다음)에만.
  전체 폭, 굵은 글씨.
- **button-secondary:** 보조 행동(건너뛰기, 나중에). primary와 나란히 놓일 때
  시각 무게가 확실히 가벼워야 한다.
- **button-danger:** 파괴적 행동(초기화, 삭제) 전용. 채움 없이 bad 색 외곽선 —
  누르기 전부터 무겁게 보일 필요는 없지만 구별은 되어야 한다.
- **nav-tab-active:** 활성 탭만 accent 글자 + panel 배경. 비활성 탭은 muted.
- **mode-tag:** 복습 모드(타이핑/첫글자/낭송/장절)를 알리는 외곽선 태그. info
  색 — 악센트를 쓰지 않는다(등불은 하나).
- **progress-bar / progress-fill:** 채움만 accent. 진행률은 은혜의 기록이지
  압박 장치가 아니다 — 목표일 페이싱 경고는 warn 색 텍스트로 한 줄이면 충분하다.
- **diff 채점 결과:** ok/warn/bad를 18% 투명 배경 + 본색 글자로 쓴다(구현:
  `color-mix(in srgb, var(--color-ok) 18%, transparent)`). 오답 단어는 bad 색
  - 점선 밑줄로 본문 흐름 안에서 표시한다.
- **첫글자 보드(fl-board):** 단어 칩은 button-secondary와 같은 표면(panel-alt +
  md 반경)을 쓴다. 훈련 화면은 mono 계열의 정렬 감각을 빌린다 — 칩의 높이·행간을
  일정하게 유지해 눈이 격자를 따라가게 하되, 실제 고정폭 서체는 쓰지 않는다
  (한글 본문에 이질적이다).

## Do's and Don'ts

**Do**

- 성경 본문에는 항상 `verse-body`(세리프, 행간 1.95)를 쓴다.
- 색은 의미 토큰(`--color-*`)으로만 참조하고, 다크·라이트 쌍으로 관리한다.
- 색·대비를 바꾸면 `npm run audit:contrast`를 돌리고, 이 문서는
  `npx @google/design.md lint DESIGN.md`로 검증한다.
- 새 UI는 기존 컴포넌트(panel, btn 계열, mode-tag)를 먼저 재사용한다.
- 애니메이션은 기능적일 때만: 버튼 press scale(0.985), 진행률 폭 전환(0.4s).

**Don't**

- 악센트 금색을 화면당 두 곳 이상의 행동에 쓰지 않는다.
- 세리프를 성경 본문 밖에 쓰지 않는다.
- 훈련 지표(정확도, FSRS 상태, 연속 일수)를 본문보다 크게 키우지 않는다.
- 그림자·그라디언트·글래스 효과로 깊이를 만들지 않는다 — 깊이는 panel 명도
  단차로만 (예외: 하단 내비의 블러와 얇은 그림자, 포커스 링).
- 순백(#fff) 텍스트·순검정(#000) 배경을 쓰지 않는다.
- 라이트 팔레트에만 있고 다크에 없는(또는 그 반대) 색을 만들지 않는다.
