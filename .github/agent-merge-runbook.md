# 에이전트 머지 런북 (Pinky)

이 레포의 PR을 자동 검수·머지하는 에이전트가 따르는 절차다. 사람이 누른 머지와
에이전트 머지는 **GitHub 신원으로** 구분한다.

- 에이전트 머지: `merged_by` = `pinky-review-quantsquirrel[bot]` (GitHub App)
- 사람 머지: `merged_by` = `quantsquirrel`

에이전트는 `quantsquirrel` 개인 토큰으로 머지하지 않는다. 그러면 위 구분이 무너진다.

## 역할 경계

기계로 잡을 수 있는 것은 CI(`.github/workflows/deploy.yml`)가 필수 체크로 막는다.
에이전트는 CI를 기다리지 않고, CI가 하는 일을 반복하지 않는다.

| 누가       | 무엇을                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| CI `build` | lint · format:check · coverage(`tests/boundaries.test.ts` 포함) · typecheck · build |
| CI `e2e`   | Playwright (오프라인 빌드)                                                          |
| CI `guard` | 기존 골든 fixture 수정·삭제 금지 · `verify:data`(본문 정본 대조) · `audit:contrast` |
| 에이전트   | 판단이 필요한 것만 — 아래 검수 항목                                                 |

### 검수 항목 (CLAUDE.md 하드 경계 기준)

1. 증거(ReviewEntry) 없이 FSRS 등급이 만들어지는 새 경로가 생기는가
2. recite 자가 채점이 타이핑 감사(`src/domain/policy.ts`) 없이 이어질 수 있게 되는가
3. IndexedDB·export 형식이 바뀌는데 마이그레이션과 **새** fixture가 빠졌는가
4. 필수 네트워크 의존이 생기는가 (Gist는 `src/app/sync.ts`의 동적 import로만)
5. 본문·UI 문구에 개역개정(1998) 표기가 섞였는가 — '그들'·'따라'는 개역한글이다, 고치지 말 것
6. PR 설명과 diff가 같은 말을 하는가 (기획 의도 왜곡)
7. 비밀값·토큰 노출, 워크플로 권한 확대

## 위험도

`gh pr diff <PR> --name-only`로 정한다. 하나라도 걸리면 높은 쪽.

| 등급   | 경로                                                                                                                                                  | 처리                        | 알림            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------- |
| high   | `src/domain/**` · `src/app/review.ts` · `src/adapters/**` · `src/data/**` · `tests/fixtures/**` · `.github/**` · `package.json` · `package-lock.json` | 검수만 하고 **머지는 사람** | 즉시            |
| normal | 그 밖의 `src/**` 변경                                                                                                                                 | 검수 후 auto-merge          | 즉시, 한 줄     |
| low    | 문서·CSS·자산만, 또는 `chore:` 제목                                                                                                                   | 검수 후 auto-merge          | 하루 한 번 요약 |
| 실패   | CI·배포 실패                                                                                                                                          | —                           | 항상 즉시       |

## 절차

1. **깨우기.** 열린 PR 중 head SHA에 `pinky/review` 상태가 없는 것만 고른다.
   없으면 LLM을 부르지 않고 끝낸다 (셸에서 거른다).
   ```bash
   R=quantsquirrel/scripture-memory
   for PR in $(gh pr list -R $R --json number,isDraft -q '.[]|select(.isDraft|not)|.number'); do
     SHA=$(gh pr view $PR -R $R --json headRefOid -q .headRefOid)
     gh api repos/$R/commits/$SHA/statuses -q '.[].context' | grep -qx pinky/review || echo $PR
   done
   ```
2. **App 토큰.** 아래 "App 토큰 발급"으로 `GH_TOKEN`을 설치 토큰으로 바꾼다.
3. **검수.** 위험도를 정하고 검수 항목만 본다. CI 결과는 기다리지 않는다.
4. **판정을 SHA에 기록한다.** `pinky/review`는 ruleset 필수 체크다. 검수 뒤 새 커밋이
   push되면 새 SHA에는 상태가 없으므로 다시 검수할 때까지 머지되지 않는다.
   ```bash
   # 통과
   gh api repos/$R/statuses/$SHA -f state=success -f context=pinky/review \
     -f description="검수 통과 (tier: normal)"
   gh pr review $PR -R $R --approve --body "<검수 요약: 본 항목과 근거>"
   # 반려
   gh api repos/$R/statuses/$SHA -f state=failure -f context=pinky/review -f description="<한 줄 이유>"
   gh pr review $PR -R $R --request-changes --body "<이유와 위치>"
   # high: 통과여도 auto-merge는 켜지 않는다
   gh api repos/$R/statuses/$SHA -f state=success -f context=pinky/review \
     -f description="검수 통과 — 사람 머지 대기 (tier: high)"
   ```
5. **auto-merge를 켜고 바로 끝낸다** (normal·low만). sleep하며 CI나 배포를 기다리지 않는다.
   GitHub가 필수 체크(`build`·`e2e`·`guard`·`pinky/review`)가 다 통과하면 squash한다.
   ```bash
   BODY=$(gh pr view $PR -R $R --json commits -q '
     if (.commits|length) == 1 then .commits[0].messageBody
     else [.commits[] | "* " + .messageHeadline + "\n\n" + .messageBody] | join("\n\n") end')
   BODY=$(printf '%s\n' "$BODY" | git interpret-trailers \
     --trailer "Reviewed-by: $BOT_NAME <$BOT_EMAIL>" \
     --trailer "Merged-by-agent: pinky")
   gh pr merge $PR -R $R --auto --squash --match-head-commit $SHA --body "$BODY"
   ```
6. **배포 결과**는 기다리지 않는다. `deploy.yml`의 `notify` job이 main push마다
   `PINKY_HOOK_URL`로 결과(JSON)를 보낸다. 실패만 즉시, 나머지는 등급대로 알린다.

## 커밋 메시지 규칙

- **원래 커밋 본문을 지우지 않는다.** `decision:` 블록이 이 레포의 유일한 결정 기록이다
  (별도 ADR 없음). `--body`에는 위처럼 원래 본문을 담고 트레일러만 덧붙인다.
- `Co-authored-by`는 **코드를 쓴 주체**에만 쓴다 (Claude, Cursor 등). 검수·머지만 한
  에이전트는 `Reviewed-by`를 쓴다. `git interpret-trailers`는 기존 트레일러 단락
  (`Co-Authored-By: Claude …`)에 이어 붙여 GitHub가 공동 작성자를 계속 인식하게 한다.

## App 토큰 발급

필요한 값(에이전트 쪽 비밀 저장소에 둔다): `APP_ID`, `INSTALLATION_ID`, 개인 키 PEM 경로.
설치 토큰은 1시간 유효하다. 실행마다 새로 받는다.

```bash
b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
now=$(date +%s)
h=$(printf '{"alg":"RS256","typ":"JWT"}' | b64)
p=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now - 60)) $((now + 540)) "$APP_ID" | b64)
s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -sign "$APP_KEY_PEM" | b64)
export GH_TOKEN=$(curl -fsS -X POST -H "Authorization: Bearer $h.$p.$s" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/app/installations/$INSTALLATION_ID/access_tokens" | jq -r .token)
```

App 권한: contents·pull_requests·statuses 쓰기, checks 읽기. 이 레포에만 설치한다.
