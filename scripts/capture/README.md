# 화면 캡처: `npx vite-node scripts/capture/run.ts --out <폴더>`

이 worktree를 빌드해 전 화면·전 상태를 다크·라이트 × 폰 390×844 · PC 1280×800(무대 화면은 360×640도)으로 찍는다.

저장소 루트에서 돌린다. 먼저 `npm ci`, Playwright chromium이 없으면 `npx playwright install chromium`. 213개 상태, 그림 약 1,360장, 6병렬(`--jobs 6`)로 2분 남짓.

## 옵션

| 옵션                 | 뜻                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--out <폴더>`       | 출력 폴더(필수, 또는 `CAPTURE_OUT`). 저장소 밖 미션 폴더를 쓴다                                                                                                                      |
| `--only <앞머리,…>`  | 상태 id 앞머리로 골라 찍는다. 예: `--only home,review-recite`. 같은 폴더에 찍으면 그 상태만 바뀌고 나머지는 남는다(목록에서 빠진 상태 id는 지운다)                                   |
| `--jobs <n>`         | 동시에 여는 브라우저 컨텍스트 수(기본 4)                                                                                                                                             |
| `--root <worktree>`  | 다른 worktree를 빌드해 찍는다(기본: 지금 폴더). 그 worktree에 `node_modules`가 있어야 한다                                                                                           |
| `--url <주소>`       | 이미 떠 있는 빌드를 찍는다. 끝이 `/scripture-memory/`인 주소. 빌드하지 않는다                                                                                                        |
| `--relay-url <주소>` | `--url`과 함께: 연동 서버 주소(`VITE_PAIRING_RELAY_URL=https://relay.capture.invalid`)를 넣은 빌드. 없으면 켜진 빌드에서 찍는 `settings-pairing-*` 상태(`-off` 말고)가 실패로 남는다 |
| `--commit <sha>`     | `--url`일 때 manifest에 적을 커밋                                                                                                                                                    |
| `--list`             | 화면·상태 목록과 찍지 못하는 상태를 표로 찍고 끝낸다                                                                                                                                 |

기본 모드는 빌드를 두 번 한다: 연동 서버 주소 없는 빌드(`npm run build`와 같다)와 있는 빌드. 둘 다 임시 폴더에 빌드하고(대상 worktree의 `dist/`를 건드리지 않는다) 빈 포트의 `vite preview`(127.0.0.1)로 띄우며, 끝나면(실패해도) 내리고 지운다. 4173은 쓰지 않는다.

## 전후 비교와 모아 보기

```
npx vite-node scripts/capture/compare.ts <전 폴더> <뒤 폴더> [--notes 메모.md] [--out 페이지.html]
npx vite-node scripts/capture/compare.ts <폴더>      # 모아 보기 → <폴더>/index.html (run.ts가 끝에 만든다)
```

비교 페이지는 기본으로 `<뒤 폴더>/compare.html`에 생기고 그림을 상대 경로로 건다. 세는 단위는 쌍(상태 하나의 테마·폭 하나, 뷰포트 그림과 전체 그림을 함께)이다.

- 바이트까지 같은 상태는 "변화 없음"으로 접는다(펼치면 그림). 첫 화면이 같고 아래쪽만 바뀌면 전체 그림을 나란히 놓는다. 한쪽 그림 파일이 없으면 "그림 없음"으로 드러낸다
- 뒤에만 있는 상태는 펼쳐 두고, `--only`로 이번에 찍지 않아 전에만 있는 상태는 화면마다 한 줄 목록으로 접는다
- 실패·페이지 오류가 있는 상태는 접지 않고 빨간 글씨로 보인다
- 접근성 측정값에서 나빠진 것만 맨 위와 터미널에 뽑는다: 44px 미만 타깃이 새로 생기거나(이름이 같아도 개수가 늘면) 더 작아짐, 가로 넘침이 새로 생기거나 커짐, 포커스 링이 그려지지 않음, 대화형 요소 수가 줄어듦. 전에 없던 상태·폭은 빈 기준과 견준다

메모 파일(마크다운): `# 무엇이 바뀌었나`, `# 볼 것`, `# 잘 된 모습` 세 칸이 맨 위에, `## <화면>`(home, review, learn, browse, settings, recal, shell, focus, hover, contrast) 또는 `## <상태 id>` 칸이 그 화면·상태 위에 실린다.

## 같은 커밋이면 같은 그림

```
npx vite-node scripts/capture/run.ts --out /tmp/a && npx vite-node scripts/capture/run.ts --out /tmp/b
diff -r -q -x '*.html' /tmp/a /tmp/b && echo 같다    # 또는 compare.ts /tmp/a /tmp/b → "바뀐 쌍 0"
```

같은 빌드를 두 번 찍으면 그림 전부와 `manifest.json`·`metrics.json`이 바이트까지 같다(`diff`가 셋을 다 본다). 다른 그림이 나오면 고친 화면이 아니라 이 도구의 고정 장치가 샌 것이다.

고정하는 것(`session.ts`의 `fixtures`, `run.ts`의 `capture`):

- 시계 `2026-11-24 09:00 KST`(`seed.ts`의 `NOW`, `clock.setFixedTime`), 타임존 Asia/Seoul. 시드의 due·기록 시각도 NOW에서 잰 거리다
- `Math.random`(복습 큐 셔플이 due 순을 그대로 두게 — 가장 이른 카드가 첫 장), `crypto.getRandomValues`·`randomUUID`(연동 코드)
- 첫 실행 소개(`src/views/intro`)는 건너뛴다: 빈 기기의 첫 화면을 덮으므로, 이 기기에서 이미 띄웠다는 표시(`localStorage`의 `intro-seen`)를 e2e(`playwright.config.ts`)와 같은 값으로 넣어 둔다. 소개 장면 자체는 아직 상태 목록에 없다
- 움직임: 모든 애니메이션·전환이 처음부터 0초(끝난 모습 그대로). 입력 커서는 숨긴다
- 글꼴: 레이아웃 뒤 `document.fonts`가 다 실릴 때까지 기다린다(unicode-range 조각)
- 래스터: Chromium을 `--disable-partial-raster --disable-gpu-rasterization --disable-lcd-text --force-color-profile=srgb`로 띄운다(없으면 PC 그림의 테두리 안티에일리어싱이 실행마다 몇 픽셀씩 달랐다)
- 상태마다·테마마다·폰/PC마다 새 컨텍스트, 서비스 워커 차단, 앱 오리진 밖 요청은 모두 끊는다(연동·Gist는 상태가 `page.route`로 흉내 낸다). 스크롤 위치는 정수 px
- 폰 클래스는 터치·`hover: none`·DPR 2, PC는 DPR 1. 긴 화면의 전체 그림은 Playwright `fullPage`를 쓰지 않고 뷰포트를 페이지 높이로 늘려 찍는다(`fullPage`가 폰 흉내를 풀었다)
- 카드 안 스크롤(`states-review.ts`의 `scrollCard`)은 글꼴이 다 실린 뒤에 자리를 잡는다. 먼저 잡으면 대체 글꼴로 짠 짧은 본문에서 잰 자리에 멈춰, 기기가 바쁠 때 끝까지 내려가지 않은 그림이 나왔다
- 마우스: 상태를 만든 뒤 화면 밖(`-1, -1`)으로 치우고 찍는다(`session.ts`의 `park`). 창을 떠난 것과 같아 어떤 요소도 `:hover`가 아니다. 누른 자리에 남은 마우스는 자동 조작의 흔적인데, 그 자리에 선 버튼의 hover 채움이 앱의 가림막(`SettleShield`, 누른 자리를 0.4초 덮는다)이 걷히기 앞에 찍히느냐 뒤에 찍히느냐로 갈려 같은 빌드의 PC 그림이 실행마다 몇 장씩 달랐다. 마우스를 올린 모습을 찍는 상태(`hover: true`인 hover-\*)만 올린 자리에 그대로 둔다

페이지 오류(pageerror)가 하나라도 나면 그 상태를 실패로 친다 — 고정 장치가 일부만 걸렸을 수 있다.

## 알려진 것

- 무대 카드(`.stage-card`)는 등장한 뒤 스타일이 한 번이라도 다시 계산되면 Chromium이 다르게 그려, 네 모서리의 안티에일리어싱이 채널 값 3/255까지 달라진다(모서리마다 수십 픽셀, 눈에는 같다). 상태가 실행마다 같은 길로 만들어지면 그림은 같다. `learn-intro-duplicate`만 그 재계산이 실행에 따라 일어나기도 아니기도 해서(기기가 바쁠 때 열두 번에 한 번쯤) 상태 정의가 미리 한 번 일으킨다(`states-learn.ts`의 `restyleCard`). 새 상태의 그림이 카드 모서리에서만 갈리면 이것부터 본다
- 그림이 버튼 하나 크기의 영역에서 갈리면 hover다 — 마우스를 치우지 않는 상태(`hover: true`)이거나, 그림을 찍는 차례에 마우스를 옮기는 조작이 끼어든 것이다

## 출력

```
<폴더>/<상태 id>/<theme>-<viewport>.png        theme: dark·light, viewport: phone·small·pc
<폴더>/<상태 id>/<theme>-<viewport>-full.png   한 화면에 다 안 들어가는 상태의 전체(위에서부터)
<폴더>/manifest.json   상태 목록(id·화면·설명·도달 방법·그림·커밋), 고정 시각, 찍지 못하는 상태
<폴더>/metrics.json    상태·테마·폭마다
                       checked·small   대화형 요소 수와 44px 미만인 것(e2e/a11y.spec.ts와 같은 잣대)
                       overflowX·overflowRight·overflowAt   가로 넘침 — 앱이 html·body를
                           overflow-x: clip으로 두어 scrollWidth로는 안 보이므로, 잘라 주는 조상이
                           없는 보이는 요소의 오른쪽 끝을 잰다(가장 멀리 나간 요소를 적는다)
                       focus   포커스 상태(focus-*)만: :focus-visible 여부와 그려진 링
                           (outline ≥ 2px·불투명, 또는 box-shadow)
<폴더>/index.html      모아 보기
```

뷰포트 그림은 맨 위에서 찍는다. 상태가 `view`를 정했으면 그 요소를 헤더 바로 아래로 올려(설정의 칸들, 펼친 구절) 찍고, 포커스 상태는 포커스한 요소를 가운데로 둔다. 무대의 주 행동 묶음은 sticky라 뷰포트 그림에서만 제자리에 보인다. 전체 그림은 마우스 올림 상태(hover-\*)만 빼고 찍는다 — 뷰포트를 늘리면 마우스 아래 요소가 바뀐다.

## 상태를 더하려면

화면별 파일(`states-home.ts`, `states-review.ts`, …)에 `StateDef`를 하나 넣는다(`define.ts`). `run(s)`은 시드를 넣고(`s.seed(...)`, 재료는 `seed.ts`) 경로를 연 뒤(`s.open('#/…')`) 화면을 조작하고, **그 상태임을 확인하는 대기**(`s.see('…')`, `locator.waitFor()`)로 끝낸다 — 대기가 실패하면 그 상태는 실패로 남는다. 앱 코드에 시험용 구멍을 내지 않는다. 말씀이 나오는 무대 상태는 `vary()`로 가장 긴·짧은 구절 변형(`-long`, `-short`)을 함께 만든다. 마우스를 올린 모습이 그 상태의 내용이면 `hover: true`를 주고 `locator.hover()`로 끝낸다 — 그 밖의 상태는 누른 자리의 hover가 그림에 실리지 않는다. 찍을 수 없는 상태는 `states.ts`의 `UNCAPTURED`에 이유와 함께 적는다.
