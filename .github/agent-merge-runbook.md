# 에이전트 머지 런북 (Pinky)

이 레포의 PR을 자동 검수하는 에이전트가 따르는 절차다. 사람이 누른 머지와
에이전트 머지는 **GitHub 신원으로** 구분한다.

- 에이전트 머지: `merged_by` = `pinky-merge[bot]` (GitHub App)
- 사람 머지: `merged_by` = `quantsquirrel`

**에이전트는 머지 명령을 직접 실행하지 않는다** (`gh pr merge` 금지). 검수하고 판정을
남기면, 머지는 `.github/workflows/pinky-merge.yml`이 App 신원으로 한다. App 개인 키는
저장소 secret에만 있고 에이전트는 키를 갖지 않는다.

## 역할 경계

| 누가                 | 무엇을                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| CI `build`           | lint · format:check · coverage(`tests/boundaries.test.ts` 포함) · typecheck · build                                                     |
| CI `e2e`             | Playwright (오프라인 빌드)                                                                                                              |
| CI `guard`           | 기존 골든 fixture 수정·삭제 금지 · `verify:data`(본문 정본 대조) · `audit:contrast`                                                     |
| 워크플로 pinky-merge | `pinky:approved` 라벨을 받으면 head SHA에 `pinky/review` 기록, 위험도 판정, auto-merge(원래 본문 보존 + 트레일러), 새 push 시 승인 해제 |
| 에이전트             | 판단이 필요한 검수만 — 아래 검수 항목                                                                                                   |

에이전트는 CI를 기다리지 않고, CI가 하는 일을 반복하지 않는다.

### 검수 항목 (CLAUDE.md 하드 경계 기준)

1. 증거(ReviewEntry) 없이 FSRS 등급이 만들어지는 새 경로가 생기는가
2. recite 자가 채점이 타이핑 감사(`src/domain/policy.ts`) 없이 이어질 수 있게 되는가
3. IndexedDB·export 형식이 바뀌는데 마이그레이션과 **새** fixture가 빠졌는가
4. 필수 네트워크 의존이 생기는가 (Gist는 `src/app/sync.ts`의 동적 import로만)
5. 본문·UI 문구에 개역개정(1998) 표기가 섞였는가 — '그들'·'따라'는 개역한글이다, 고치지 말 것
6. PR 설명과 diff가 같은 말을 하는가 (기획 의도 왜곡)
7. 비밀값·토큰 노출, 워크플로 권한 확대

## 위험도

워크플로가 바뀐 파일 경로로 정한다. 에이전트가 고를 필요는 없다.

| 등급  | 경로                                                                                                                                                  | 처리                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| high  | `src/domain/**` · `src/app/review.ts` · `src/adapters/**` · `src/data/**` · `tests/fixtures/**` · `.github/**` · `package.json` · `package-lock.json` | `pinky/review`만 통과로 기록, **머지는 사람**        |
| 그 밖 | 나머지                                                                                                                                                | auto-merge — 필수 체크가 다 통과하면 GitHub가 squash |

## 절차

1. **깨우기.** 아직 검수하지 않은 head SHA가 있는 PR만 고른다. 없으면 LLM을 부르지
   않고 끝낸다 (셸에서 거른다). 검수 댓글마다 `<!-- pinky-reviewed: SHA -->`를 남겨
   표시로 쓴다.
   ```bash
   R=quantsquirrel/scripture-memory
   for PR in $(gh pr list -R $R --json number,isDraft -q '.[]|select(.isDraft|not)|.number'); do
     SHA=$(gh pr view $PR -R $R --json headRefOid -q .headRefOid)
     gh pr view $PR -R $R --json comments -q '.comments[].body' | grep -q "pinky-reviewed: $SHA" || echo "$PR $SHA"
   done
   ```
2. **검수.** 검수 항목만 본다. CI 결과는 기다리지 않는다.
3. **판정.** 댓글 하나로 요약을 남기고, 통과면 라벨을 붙인다. 그리고 바로 끝낸다.
   ```bash
   # 통과
   gh pr comment $PR -R $R --body "<검수 요약: 본 항목과 근거>

   <!-- pinky-reviewed: $SHA -->"
   gh pr edit $PR -R $R --add-label pinky:approved
   # 반려 — 라벨을 붙이지 않는다
   gh pr comment $PR -R $R --body "<고칠 것과 위치>

   <!-- pinky-reviewed: $SHA -->"
   ```
   라벨이 붙으면 워크플로가 판정을 기록하고 auto-merge를 켠다(high는 기록만).
   승인 뒤 새 커밋이 push되면 워크플로가 라벨과 auto-merge를 거두므로, 1번에서
   새 SHA로 다시 잡힌다.
4. **알림.** 사용자에게는 판정 한 줄만 보낸다. high는 "사람 머지 대기"로 즉시,
   그 밖의 통과는 모아서 보낸다. 배포 결과는 기다리지 않는다 — 실패하면 GitHub가
   사용자에게 알린다.

## 커밋 메시지 규칙 (워크플로가 지킨다)

- **원래 커밋 본문을 지우지 않는다.** `decision:` 블록이 이 레포의 유일한 결정 기록이다
  (별도 ADR 없음). squash 본문은 PR 커밋 본문 그대로에 트레일러만 덧붙인다.
- `Co-authored-by`는 **코드를 쓴 주체**에만 쓴다 (Claude, Cursor 등). 검수·머지만 한
  에이전트는 `Reviewed-by: pinky-merge[bot]`과 `Merged-by-agent: pinky`로 남는다.

## App

`pinky-merge` — App id 5643359, 봇 `pinky-merge[bot]`(사용자 id 353369846), 이 레포에만
설치. 권한: contents·pull_requests·statuses 쓰기, checks 읽기. 워크플로는 저장소 변수
`PINKY_MERGE_CLIENT_ID`와 secret `PINKY_MERGE_APP_KEY`로 설치 토큰을 받는다.
