---
version: alpha
name: Ivan
description: >
  네비게이토 암송 과정 훈련 PWA "Ivan"의 디자인 시스템: 침묵의 필사실 (The Quiet Scriptorium).
  Ivan은 Navi를 뒤집은 이름이자 요한(Yohanan, "여호와는 은혜로우시다")의 슬라브형이다.
  도구가 사람을 이끄는 것이 아니라 말씀이 화면의 주인이 되고, 은혜의 등불 하나가 길을 비춘다.
colors:
  primary: '#eab355'
  bg: '#0e121b'
  panel: '#161c28'
  panel-alt: '#202838'
  line: '#38435c'
  border: '#657599'
  text: '#f2ece1'
  muted: '#9ea8c2'
  accent: '#eab355'
  on-accent: '#1c1405'
  info: '#9bbcf0'
  ok: '#85cf93'
  warn: '#e5b458'
  bad: '#ea8e82'
typography:
  app-title:
    fontFamily: Pretendard
    fontSize: 1.266rem
    fontWeight: 700
    letterSpacing: 0.04em
  screen-title:
    fontFamily: Pretendard
    fontSize: 1.266rem
    fontWeight: 700
    lineHeight: 1.3
  section-title:
    fontFamily: Pretendard
    fontSize: 1.125rem
    fontWeight: 700
    lineHeight: 1.3
  verse-body:
    fontFamily: Noto Serif KR
    fontSize: 1.266rem
    lineHeight: 1.9
  verse-quiet:
    fontFamily: Noto Serif KR
    fontSize: 1.125rem
    lineHeight: 1.9
  verse-prompt:
    fontFamily: Pretendard
    fontSize: 1.424rem
    fontWeight: 700
    lineHeight: 1.3
  figure:
    fontFamily: Pretendard
    fontSize: 1.802rem
    fontWeight: 700
    lineHeight: 1
  body-md:
    fontFamily: Pretendard
    fontSize: 1rem
    lineHeight: 1.6
  meta-sm:
    fontFamily: Pretendard
    fontSize: 0.875rem
    lineHeight: 1.6
  label:
    fontFamily: Pretendard
    fontSize: 0.875rem
    fontWeight: 600
  micro:
    fontFamily: Pretendard
    fontSize: 0.75rem
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
  2xl: 32px
components:
  ground:
    backgroundColor: '{colors.bg}'
    textColor: '{colors.text}'
  panel:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.lg}'
    padding: 16px
  stage-card:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.lg}'
    padding: 20px
  well:
    backgroundColor: '{colors.panel-alt}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: 12px
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.md}'
    padding: 12px
  button-secondary:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: 12px
  button-danger:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.bad}'
    rounded: '{rounded.md}'
    padding: 12px
  nav-tab-active:
    textColor: '{colors.accent}'
    rounded: '{rounded.lg}'
  segment-active:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.accent}'
    rounded: '{rounded.md}'
  mode-tag:
    textColor: '{colors.info}'
    typography: '{typography.label}'
  card-head:
    textColor: '{colors.muted}'
    typography: '{typography.meta-sm}'
  rate-suggested:
    backgroundColor: '{colors.panel-alt}'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
  progress-bar:
    backgroundColor: '{colors.panel-alt}'
    rounded: '{rounded.pill}'
    height: 6px
  progress-fill:
    backgroundColor: '{colors.accent}'
    rounded: '{rounded.pill}'
  status-due:
    backgroundColor: '{colors.panel-alt}'
    textColor: '{colors.text}'
    typography: '{typography.micro}'
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
   가장 크고 가장 숨 쉬는 글이며(무대에서 1.266rem, 행간 1.9), UI는 산세리프로
   물러선다.
2. **등불은 하나.** 금색 악센트는 화면당 하나의 주 행동(오늘 복습, 제출)에만
   쓴다. 악센트가 둘이면 등불이 아니라 조명이다. 등불은 고정된 자리가 아니라
   **오늘 할 일로 옮겨 다닌다** — 홈에서 복습할 카드가 남아 있으면 '복습 시작'이,
   다 마쳤으면 '이어서'(없으면 '다음 구절')가 켜진다. 누를 수 없는 주 행동은
   꺼진 등불(보조 버튼과 같은 외곽선)로 있다가 누를 수 있게 되는 순간 켜진다.
3. **지표는 물러선다.** 정확도·FSRS 상태 같은 훈련 지표는 muted 색·작은 크기로
   물러서거나 접힌 영역에 둔다. 숫자가 은혜를 가리지 않게 한다.

**서명(signature): 낭송의 틀.** 복습 카드의 정답은 TMS 낭송 규칙의 차례
(주제 → 장절 → 말씀 → 장절)대로 선다. 여는 장절은 왼쪽, 말씀은 세리프로 크게,
닫는 장절은 카드 끝 오른쪽에 — 종이 TMS 카드의 아랫단에 다시 찍힌 장절처럼.
다른 플래시카드 앱이 아니라 이 앱이라는 것을 알려 주는 한 장면이 이것이다.

**워드마크:** 소문자 `ıvan`(dotless ı) 위에 금색 점 하나를 올린다 — i의 점이
곧 등불이다. 구현은 `.brand`/`.brand-i-icon`(base.css). 워드마크의 점은 "악센트는
화면당 주 행동 1곳" 규칙의 예외가 아니라 그 규칙의 상징이다: 화면 어디에서든
등불은 하나뿐이라는 표지. 접근성 이름은 `aria-label="Ivan"`으로 준다.

**검증:** 이 시스템은 디자인 스킬 hallmark의 바닥 규칙(Floor)을 지킨다 — 토큰 밖
색·간격 금지, 즉시 나타나는 포커스 링, 움직임 최소화 대체, 자간을 벌린 라벨·아이브로·
가운뎃점 나열·이모지 아이콘 금지. 그 기록은 `src/styles/index.css` 맨 위 Hallmark
주석에 있고, `sloplint.mjs <src> --scope app --render`로 다시 잴 수 있다.

## Colors

정본 팔레트는 **다크(기본)**다. 값은 `src/styles/tokens.css`의
`--palette-dark-*`와 1:1 대응하며, 그 파일이 구현의 진실이다. 모든 값은
`npm run audit:contrast`(WCAG 감사)를 통과한 상태이므로, 색을 바꿀 때는 이
문서와 tokens.css를 함께 고치고 감사를 다시 돌린다.

- **bg (#0e121b):** 짙은 묵빛과 흑요석(Deep Obsidian Ink). 차가운 디지털 블루를
  걷어내고, 고요하고 아늑한 밤의 필사실 바닥. 진행률 표·목록 섹션 제목처럼
  "읽는 기록"은 카드에 담지 않고 이 바닥에 바로 선다.
- **panel (#161c28) / panel-alt (#202838):** 고서의 가죽 장정과 양피지 판본의 층.
  그림자 대신 이 두 단의 명도 차가 깊이를 만든다.
- **line (#38435c):** 장식용 헤어라인 (고서 인쇄 괘선). 컨트롤 식별에 쓰지 않는다
  (WCAG 1.4.11 비적용). 카드 테두리·목록 구분선·숫자 묶음의 세로선이 이것이다.
- **border (#657599):** 입력·버튼 컨트롤 경계 (배경 대비 3:1 이상 충족).
- **text (#f2ece1):** 오랜 세월을 견딘 양피지의 부드러운 상아빛 (Aged Parchment Ivory).
- **muted (#9ea8c2):** 필사자의 먹물 회색. "물러서는 것들"의 색.
- **primary = accent (#eab355) / on-accent (#1c1405):** 성서 사본의 손길 닿은 금박
  (Illuminated Gold Leaf). 주 행동 버튼, 활성 탭·세그먼트, 홈의 전체 진행률 막대,
  복습의 제안 등급, 마침 장면의 등불 마크, 포커스 링에만 쓴다. 제목 장식·콜아웃 띠·
  상태 칩 채움·과정별 막대에는 쓰지 않는다.
- **info (#9bbcf0):** 장절 인덱스·모드 표지. 차분한 하늘빛으로 본문과 구분한다.
- **ok (#85cf93) / warn (#e5b458) / bad (#ea8e82):** 채점 결과 전용 상태색.
  diff 점수, 오답 표시, 등급 이름, 말씀 상태 개정의 판정 밖에서는 쓰지 않는다.
- **선택 영역·입력 커서·스크롤바**도 팔레트에서 고른다(금빛 30% 선택, 금빛 커서,
  line/bg 스크롤바) — 직접 그리지 않은 면이 브라우저 기본 파랑으로 튀지 않게.

**라이트 팔레트는 다크의 반전이다** — Navi→Ivan 역철의 시각 번역. 잉크와 종이가
자리를 바꾼다: bg `#f7f2e7`(수제 양피지) / panel `#fffdf8`(깨끗한 속지) / panel-alt
`#efe7d5` / line `#ddd3bd`(연필 괘선 — 진하면 카드마다 갈색 상자가 둘러졌다) /
border `#887959` / text `#1e2538`(남빛 먹물) /
muted `#58617a` / accent `#8c5a08`(깊은 옻칠 금빛) / on-accent `#fffbee` / info
`#2a487c` / ok `#286835` / warn `#795609` / bad `#8f3227`. 새 색을 더할 때는
반드시 두 팔레트에 쌍으로 더하고, 의미 토큰(`--color-*`)을 통해서만 참조한다.

## Typography

두 서체의 역할 분담이 이 시스템의 뼈대다.

- **Noto Serif KR — 오직 성경 본문.** 무대(복습·학습·개정 카드)의 본문은
  `verse-body`(1.266rem, 행간 1.9)로 화면에서 가장 큰 글이다. 낭송 중 눈이 한 줄을
  따라가기 쉽도록 행간을 넉넉히 잡는다. 목록에서 펼친 본문과 첫글자 보드는
  `verse-quiet`(1.125rem) — 읽는 글이 아니라 차례 속 인용이고 떠올리는 발판이다.
  세리프가 본문 밖(버튼, 제목, 설명)으로 새어 나가면 "말씀만 세리프"라는 위계가
  무너진다. 본문이 나오는 자리는 모두 세리프다: 카드의 본문, 목록의 본문 첫머리
  (한 줄 말줄임), 첫글자 보드, diff 결과, 그리고 **타이핑 입력란** — 기억해서 받아
  적는 글자가 곧 말씀이므로 필사(筆寫)처럼 세리프로 적힌다. 입력란의 안내
  문구(placeholder)는 UI라서 산세리프다.
- **Pretendard — 모든 UI.** 시스템 폴백은 Apple SD Gothic Neo → Noto Sans KR.
- **두 서체 모두 앱에 싣는다**(npm `pretendard`, `@fontsource/noto-serif-kr`).
  기기 설치 글꼴에 맡기면 iPhone과 Windows PC의 모양이 달라진다. 버튼·입력도
  `font: inherit`로 같은 서체를 쓴다. 세리프는 400 한 벌만 실으므로
  `font-synthesis: none`으로 가짜 굵은 글씨를 막는다.
- **크기 스케일: 16px 본문에서 1.125배씩 오르는 고정 스케일.** 0.75 / 0.875 /
  1 / 1.125 / 1.266 / 1.424 / 1.602 / 1.802rem (`--text-xs` … `--text-3xl`).
  앱 화면이라 화면 폭에 따라 늘지 않는다. 새 크기를 발명하지 말고 이 스케일에서 고른다.
- **굵기는 셋:** 400(본문·지표) / 600(컨트롤·이름·라벨) / 700(제목·숫자·주 버튼).
- `verse-prompt`(1.424rem 굵게)는 복습 카드의 물음("요한일서 5:11-12", 주제 이름)처럼
  화면당 하나뿐인 물음에 쓴다. 진하고 크게 — 그러나 답(본문)이 나타나면 본문이 주인공.
- **라벨은 자간을 벌리지 않는다.** 모드 표지·범례·탭 이름·상태 칩은 본문 서체로
  한 단 작게, 자간 0. 자간을 벌리는 글자는 워드마크 하나뿐이다.
- **제목에 장식 기호를 붙이지 않고, 제목 위에 작은 머리글(아이브로)을 얹지 않는다.**
  위계는 크기·굵기·여백으로만 만든다. 카드 안의 소제목(h3, 1rem)은 카드 제목
  (h2, 1.125rem)보다 작다. 제목은 `text-wrap: balance`, 문단은 `pretty`.
- **사실을 가운뎃점으로 이어 늘어놓지 않는다(`A · B · C`).** 숫자·사실 여럿은
  헤어라인으로 가른 묶음(`.figures`, `.today-meta`)이나 줄바꿈으로, 경로는 `›`로
  (`Crumb`), 이름 여럿과 문장 안은 쉼표로 잇는다(`5확신, 8동행, 60구절`). 붙여 쓰는
  낱말 사이의 가운뎃점(`카드·학습 상태`)은 맞춤법의 쓰임이라 그대로 둔다. 줄표(—)도
  화면 문구에는 쓰지 않는다. 두 마디짜리 버튼 이름은 쉼표나 '-하고'로 잇는다
  ('낭송했어요, 다음으로', '졸업하고 복습 큐에 추가'). 예외는 저작권 안내 문장 하나다.
- 숫자는 `tabular-nums`로 자릿수를 맞춘다(남은 수, 진행 수, 다음 복습까지).
- 숫자 지표(정확도 %, 남은 개수)는 `meta-sm` + muted 색이 기본이다. 문장의
  핵심이 되는 큰 숫자(`figure`, 오늘 복습 구절 수)는 크기만 키우고 색은 본문색을
  쓴다 — 금색 숫자 금지. 지표를 키우고 싶다는 유혹이 들면 Overview의 원칙 3을
  다시 읽는다.

## Layout

- **한 열, 최대 560px, 중앙 정렬.** 이 앱은 한 손 모바일 PWA다. 데스크톱에서도
  열을 넓히지 않는다 — 읽기 폭이 곧 낭송 폭이다.
- **간격은 4px 격자.** 토큰 이름의 숫자 × 2px: `--space-2` 4 / `-4` 8 / `-6` 12 /
  `-8` 16 / `-10` 20 / `-12` 24 / `-16` 32 / `-20` 40 / `-24` 48px. 2px(`--space-1`)은
  헤어라인 옆 미세 조정에만 쓴다. 격자 밖 값(6·10·14px)과 날 px는 쓰지 않는다.
  카드 안쪽 여백 16px, 무대 카드 20px, 카드 사이 12px, 바닥에 서는 묶음 앞 32px.
- **표면의 사다리:** 바닥(bg) → 헤어라인 → 옅은 우물(panel-alt) → 카드(panel).
  카드는 손으로 다루는 대상(오늘의 복습, 새 구절 학습, 구절 카드, 컨트롤이 있는 설정
  묶음, 목록의 구절 줄)에만 쓴다. 읽는 기록(홈 진행률 표, 설정의 기록 숫자와 정보)과
  목록의 섹션 제목은 바닥에 선다. 낭송 규칙·개정 안내처럼 곁에 두는 말은 우물이다.
  같은 상자를 화면 끝까지 쌓지 않는다. 화면 제목과 같은 카드 제목은 모바일에서
  눈에서만 감춘다(`.screen-dup` — 헤더의 화면 이름이 이미 말한다).
- **레이아웃 기준선은 769px 하나다.** 그 아래는 모바일, 이상은 PC. 줄바꿈
  (`word-break: keep-all`)처럼 읽기에 관한 규칙은 폭과 무관하게 같다. 가로 넘침은
  `overflow-x: clip`으로 자른다(hidden이면 sticky 헤더가 죽는다).
- **모바일: 하단 플로팅 독** (블러 배경 + 헤어라인). 탭은 글자 없이 24px 선
  아이콘만 두고, 이름은 aria-label이 맡는다. 본문 스크롤 영역은
  내비 높이 + `env(safe-area-inset-bottom)`만큼 하단 패딩을 확보한다. 헤더는
  워드마크 대신 지금 화면의 이름(`screen-title`) 한 줄이다.
- **PC: 헤더 탭.** 같은 내비가 워드마크 옆으로 올라가 18px 아이콘 + 이름으로
  보이고, 헤더는 위에 붙어 스크롤해도 탭에 닿는다. 마우스가 위에서 시작하고,
  짧은 화면에서 본문과 맨 아래 독 사이가 벌어지기 때문이다.
- **터치 타겟 최소 44px** (WCAG 2.2 Target Size 권장), 화면당 하나인 주 버튼은
  48px. 단어 칩(첫글자 보드)처럼 밀도가 필요한 곳은 누를 영역만 투명하게 넓힌다.
- **무대(stage):** 복습·학습 사다리·말씀 상태 개정처럼 구절 하나를 마주하는 화면은
  카드 한 장이 남은 높이를 채우고(앱 셸이 세로 flex), 주 행동(`.stage-foot` —
  정답 보기, 등급 버튼, 다음 단계)이 카드 맨 아래 **엄지가 닿는 자리**로 내려간다.
  물음은 위에 머물러 정답이 열려도 자리가 튀지 않는다. **주 행동 묶음은 sticky다** —
  말씀이 길어 카드가 화면을 넘쳐도(긴 DEP 구절, 타이핑 감사의 diff와 정답) 독 바로
  위(`--dock-gap` + `--dock-height`)에 붙어 남고, 밑으로 지나가는 본문은 카드와 같은
  면이 덮는다. 입력란이 있는 단계(타이핑·장절 입력)는 화면 키보드가 덮지 않도록
  버튼을 입력란 바로 아래에 둔다. PC에서는 엄지 영역이 없으므로 카드가 내용 높이
  (최소 440px)로 서고 주 행동 묶음은 화면 아래 끝에 붙는다.
- **무대는 마주할 구절이 있을 때만.** 복습할 카드가 처음부터 없으면 화면을 채우는
  무대 대신 내용 높이의 작은 카드(`.empty-state`)로 비어 있음과 다음 걸음만 알린다.
  무대와 등불은 마친 장면(복습 완료·졸업·개정 완료)의 몫이다.
- **무대 윗줄:** `‹ 나가기 / 진행 막대 / 남은 수` 세 칸이 복습·학습·개정에서 같다.
  학습에서는 진행 막대 자리에 사다리 네 칸(본문 익히기→첫글자→타이핑→졸업)이 선다.
  뒤로 가기는 글자 화살표(←)가 아니라 탭 아이콘과 같은 선의 꺾쇠(`Chevron`)다.
- **카드 머리줄(`.card-head`):** 무대 카드 맨 위 가장자리에 늘 같은 자리로 서는 한 줄.
  왼쪽은 이 카드가 무엇을 묻는지(모드), 오른쪽은 말씀이 어디에 있는지(경로 또는
  개정 차례 번호). 제목을 예고하는 머리글이 아니라 TMS 카드 윗단에 인쇄된 표지다.
- 과정 선택(목록)은 테마 선택과 같은 세그먼트 컨트롤로 다섯 칸이 한 줄에 선다.

## Elevation & Depth

**그림자로 띄우지 않고 명도로 가라앉힌다.** 깊이는 bg → panel → panel-alt 세 단의
명도 단차로만 표현한다 — 밤바다에서 물결의 층이 그렇듯, 광원을 상정한 드롭
섀도는 이 세계에 없다. **그림자 토큰은 하나도 없다.**

- **하단 플로팅 독(모바일):** 콘텐츠 위에 실제로 떠 있는 유일한 면이지만 그림자
  없이 선다 — panel 86% 바탕 + `backdrop-filter: blur(20px)` + 헤어라인 테두리.
  어두운 바탕 위의 드롭 섀도는 번지는 빛처럼 보였다.
- **포커스 링:** 2px accent `outline`(바깥으로 2px, 입력란은 안쪽으로 3px). 번지거나
  서서히 나타나지 않고 곧바로 선다. 그림자 링을 겹치지 않는다.

카드·버튼·진행 막대·세그먼트·독에 그림자나 그라디언트를 다시 넣지 않는다(한때
들어갔다가 라이트 테마에서 카드 아래가 탁하게 번지고 금색 버튼이 사진처럼 떠 보여
걷어냈다).

## Shapes

- 반경 스케일: sm 6px(키 표지) / md 10px(버튼·입력·단어 칩·우물) / lg
  14px(카드 panel·세그먼트 틀) / pill(진행률 바·상태 칩).
- 큰 면일수록 반경이 크고, 안쪽 반경 = 바깥 반경 − 안쪽 여백으로 곡선의 중심을
  맞춘다(세그먼트 틀 14 = 칸 10 + 여백 4, 독 18 = 탭 14 + 여백 4).
- 정답 공개 전 경계선은 점선(dashed hairline)으로 긋는다. "아직 열리지 않은
  것"의 관례다. 한 번만 쓰는 연동 코드 상자도 같은 점선이다.

## Components

값은 front matter의 `components`가 정본이다. 적용 규칙:

- **button-primary:** 화면당 하나. 오늘의 주 행동(복습 시작, 정답 보기, 제출,
  다음)에만. 전체 폭, 굵은 글씨, 평평한 금색 채움. 설정 화면처럼 오늘의 주 행동이
  없는 화면에는 하나도 켜지 않는다. 화면마다 위에 붙는 설치 안내도 금색을 쓰지
  않는다. 비활성(입력 전 '채점' 등)은 꺼진 등불 — 채움 없이 외곽선과 muted 글자,
  금지 커서.
- **button-secondary:** 보조 행동(건너뛰기, 나중에). **채움 없이 border 색 외곽선만**
  — 채움이 있는 버튼은 금색 주 행동 하나뿐이라 둘이 나란히 서도 무게를 다투지
  않는다. 마우스를 올리면 panel-alt로 채워진다. 긴 이름은 둘째 줄(`.btn-sub`)이나
  muted 보조 표기(`.btn-note`, 예: "내보내기 (JSON)")로 나누고, 반쪽 폭에서
  꺾이는 이름이면 전폭으로 세운다.
- **button-danger:** 파괴적 행동(초기화, 삭제) 전용. 채움 없이 bad 색 외곽선 —
  누르기 전부터 무겁게 보일 필요는 없지만 구별은 되어야 한다. 백업 버튼과 나란히
  두지 않고 구분선 아래(`.danger-zone`)로 떼어 한 줄 설명과 함께 둔다.
- **누름과 비활성:** 누르면 1px 내려앉는다(`translateY(1px)`, 0.12s). 누를 수 없는
  버튼은 옅은 글자·`not-allowed` 커서·`disabled` 속성 세 갈래로 알린다.
- **nav-tab-active:** 활성 탭만 accent 그림(글자) + 같은 금빛이 은은히 번진 바탕
  (모바일 14%, PC 9% — 이름 글자가 보이는 PC는 4.5:1을 지키도록 옅게). 비활성은 muted.
- **segment-active:** 테마·과정 선택의 활성 칸 — panel 바탕 + accent 글자.
- **mode-tag:** 복습 모드(타이핑/첫글자/낭송/장절)를 알리는 하늘빛 글자 한 줄.
  상자·자간 없이 카드 머리줄 왼쪽에 선다. 악센트를 쓰지 않는다(등불은 하나).
- **경로(Crumb):** 과정 › 단원 › 묶음. 구분 기호(›)는 화면 낭독기가 읽지 않는다.
  주제를 묻는 카드는 머리줄 오른쪽에, 장절·본문을 묻는 카드는 정답과 함께(미리
  보이면 그것이 곧 힌트라서), 학습 카드는 머리줄에 주제까지 이어서 보인다.
- **낭송의 틀(answer):** 점선 아래 — (장절을 물었으면 주제와 경로) → 여는 장절
  (info) → 말씀(verse-body) → 닫는 장절(info, 오른쪽 정렬). 본문을 물었으면 장절이
  제목(1.424rem)이 되고 그 아래 주제와 경로가 선다. 말씀 전문이 무대에 나오는 다른
  카드도 같은 틀로 닫는다: 학습 1단계(장절 제목 → 말씀 → 닫는 장절, 바로 아래
  낭송 규칙이 이 차례를 가르친다)와 말씀 상태 개정의 공개된 본문.
- **progress-bar / progress-fill:** 금색 채움은 홈의 **전체 진행률 막대 하나**뿐이다.
  과정별 막대·복습 세션 막대·개정 진행 막대는 먹빛(본문색 42%)으로 채운다 —
  막대가 여럿인 화면에서 금색이 막대 수만큼 켜지지 않게. 채움은 폭을 바꾸지 않고
  `--fill`(0~1)을 받아 `transform`으로 끌어낸다(`fillStyle`). 진행률은 은혜의
  기록이지 압박 장치가 아니다 — 목표일 페이싱은 D-day 한 줄과 작은 숫자 묶음이면
  충분하다.
- **학습 사다리(ladder):** 네 칸 막대. 지나온 단은 먹빛, 지금 선 단은 본문색.
  글자 안내(`첫글자 복원 2/4`)가 옆에 있으므로 막대 자체는 장식(aria-hidden)이다.
- **숫자 묶음(figures):** 이름(dt, muted, meta-sm) 위·값(dd) 아래, 칸 사이는 line 색
  세로 헤어라인 하나. 홈의 목표 페이싱(남은·하루 필요·오늘)과 설정의 기록(암송 편입·
  총 복습)이 이것이다. 상자(우물)에 넣지 않는다.
- **오늘의 복습 카드:** 제목과 날짜(`<time>`)가 한 줄 — 날짜는 오른쪽 끝의 날인이다.
  큰 숫자(figure) + 단위, 설명 한 줄, 곁가지 숫자(밀린 카드·오늘 복습)는 세로
  헤어라인으로 나란히, 그 아래 주 버튼.
- **등급 버튼(rating-bar):** 네 칸, 라벨은 결과 상태색(bad/warn/ok/info), 간격은
  muted. 객관 채점이 제안한 칸(`rate-suggested`)이 이 화면의 등불이다 — 금색 2px
  테두리 + 금빛 7% 바탕 + 칸 위의 '제안' 표지(색만으로 알리지 않는다).
- **diff 채점 결과:** ok/warn/bad를 18% 투명 배경 + 본색 글자로 쓰고, 앞에 ✓ / !
  표지를 둔다(구현: `color-mix(in srgb, var(--color-ok) 18%, transparent)`). 오답
  단어는 bad 색 + 점선 밑줄로 본문 흐름 안에서 표시한다. 범례는 칸을 띄워 나란히.
- **첫글자 보드(fl-board):** 단어 칩은 panel-alt 면 + border 외곽선 + md 반경,
  `verse-quiet` 크기. 칩의 높이·행간을 일정하게 유지해 눈이 격자를 따라가게 하되,
  고정폭 서체는 쓰지 않는다(한글 본문에 이질적이다). **엿본 어절**은 상자를 벗고
  본문 글자로 돌아가며 warn 색 밑줄로 "여기서 도움을 받았다"를 남긴다 — 엿보기
  횟수가 채점 증거이기 때문이다.
- **목록의 구절 한 줄:** 장절(굵게) + 본문 첫머리(세리프, muted, 한 줄 말줄임) +
  상태. 본문 첫머리는 버튼 이름에서 뺀다(aria-hidden) — 스크린리더가 구절마다
  본문 전체를 읽지 않게. 구분선은 한 주제 안의 구절 사이에만 긋는다.
- **상태 칩:** 복습 대기 = panel-alt 칩 + 본문색 굵은 글자 + 작은 금색 등불 점
  (`status-due` — 점은 "지금 돌아볼 때"라는 살아 있는 상태다). 학습 중 = warn 12% 칩.
  다음 복습까지(N일 후)·미학습 = muted — 지표는 물러선다. 칩 전체를 금색으로
  채우지 않는다.
- **우물(well):** panel-alt 바탕 + md 반경, 띠를 두르지 않는다. 학습 1단계의 낭송
  규칙, 홈 맨 위의 개정 안내(`.notice-row`, 끝에 꺾쇠)가 이것이다. 낭송 규칙의
  "장절" 강조(`em`)는 기울이지 않고 info 색으로 — 한글 서체에는 기울임꼴이 없어
  글자가 억지로 눕는다.
- **목록 행(recal-unit 등):** 이름 + muted 보조 표기 + 오른쪽 꺾쇠(누르면 들어간다).
  비활성 행은 꺾쇠를 내린다.
- **판정 버튼(말씀 상태 개정):** 보조 버튼 모양에 상태색 테두리(ok/warn/bad)와
  낱말('온전히 기억남', '가물가물함', '다시 사다리 타기'). 신호등 이모지를 쓰지
  않는다. 개정 결과는 판정 셋을 나란히 세고, 칸 위의 상태색 2px 선이 판정을 가리킨다.
- **정보 목록(about-list):** 항목 이름(dt)과 내용(dd)을 두 열로. `<br>`로 이어 붙인
  긴 문단을 쓰지 않는다.
- **등불 마크(LampMark):** 복습 완료·졸업·개정 완료 장면에만, 하나만. 워드마크 i의
  점과 같은 금색 점에 투명도가 다른 동심원 네 겹으로 번짐을 그린다(그라디언트 금지).
  켜질 때 한 번 커지며 밝아지고(0.42s) 그 뒤로는 움직이지 않는다.
- **불러오는 중:** 데이터 읽기는 순식간에 끝나므로 "불러오는 중…" 한 줄은 0.2초를
  기다렸다가 나타난다 — 짧은 읽기에서 글자가 깜빡이지 않게.

## Do's and Don'ts

**Do**

- 성경 본문에는 항상 세리프(`verse-body`, 목록·보드는 `verse-quiet`)를 쓴다.
- 색은 의미 토큰(`--color-*`)으로만 참조하고, 다크·라이트 쌍으로 관리한다.
  간격·크기·반경·움직임도 토큰으로만 쓴다(날 px 금지).
- 색·대비를 바꾸면 `npm run audit:contrast`를 돌리고, 이 문서는
  `npx @google/design.md lint DESIGN.md`로 검증한다.
- 새 UI는 기존 컴포넌트(panel, btn 계열, mode-tag, figures, Crumb, Chevron)를
  먼저 재사용한다.
- 애니메이션은 상태가 바뀔 때만, `transform`과 `opacity`로만: 누름 1px(0.12s),
  새 카드·새 단계가 놓였다는 신호(6px 떠오르며 0.22s), 정답·diff가 열리는 페이드,
  진행 막대 채움(transform, 0.42s), 마침 장면의 등불 켜짐(0.42s). 반복·장식
  애니메이션은 없다. `prefers-reduced-motion`이면 a11y.css가 전부 끈다.
- 새로 그린 색 조합(반투명 번짐 포함)은 `scripts/audit_contrast.py`의 검사 목록에
  함께 넣는다.

**Don't**

- 악센트 금색을 화면당 두 곳 이상의 행동에 쓰지 않는다. 제목 앞 장식 기호, 콜아웃
  띠, 상태 칩 채움, 막대 여러 개에 금색을 쓰지 않는다.
- 세리프를 성경 본문 밖에 쓰지 않는다.
- 훈련 지표(정확도, FSRS 상태, 연속 일수)를 본문보다 크게 키우지 않는다.
- 그림자·그라디언트·글래스 효과로 깊이를 만들지 않는다 — 깊이는 panel 명도
  단차로만 (떠 있는 독도 블러와 헤어라인뿐이다).
- 라벨·태그의 자간을 벌리지 않고, 제목 위에 머리글을 얹지 않고, 가운뎃점으로
  사실을 나열하지 않고, 이모지를 아이콘으로 쓰지 않고, 버튼 이름 끝에 화살표를
  붙이지 않는다.
- `transition: all`을 쓰지 않고, 폭·높이·위치를 애니메이션하지 않는다.
- 순백(#fff) 텍스트·순검정(#000) 배경을 쓰지 않는다.
- 라이트 팔레트에만 있고 다크에 없는(또는 그 반대) 색을 만들지 않는다.
