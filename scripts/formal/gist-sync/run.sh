#!/usr/bin/env bash
# Gist 동기화 형식 검증: TLC로 GistSync.tla의 모든 검사를 돌리고, 모델이 찾았던
# 반례를 실제 코드로 재생하는 tests/syncRace.test.ts를 돌린다. 결과가 아래 EXPECT
# 표와 하나라도 다르면 exit 1.
#
# 실행: npm run verify:sync
# 필요: Java 11+ (JAVA 환경변수 > PATH의 java > Homebrew openjdk 순으로 찾는다)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TLA_VERSION="1.7.4"
TLA_SHA256="936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
CACHE="$ROOT/node_modules/.cache/tla2tools"
JAR="$CACHE/tla2tools-$TLA_VERSION.jar"

# 설정 파일 | 모듈 | 기대 결과 (pass, 또는 깨져야 하는 성질 이름)
EXPECT=(
  "all.cfg|GistSync|pass"
  "f1-commit-during-sync.cfg|GistSync|pass"
  "f1b-state-without-evidence.cfg|GistSync|pass"
  "f2-two-devices.cfg|GistSync|pass"
  "f3-stale-review-card.cfg|GistSync|pass"
  "f4-two-syncs-one-device.cfg|GistSync|pass"
  "mutant-merge-drops-local-reviews.cfg|GistSyncMutants|EvidenceSurvives"
  "mutant-merge-remote-card-wins.cfg|GistSyncMutants|ProgressSurvives"
  "mutant-commit-card-first.cfg|GistSyncMutants|EvidenceBacksState"
  "mutant-merge-reads-before-fetch.cfg|GistSyncMutants|EvidenceSurvives"
  "mutant-commit-no-base-check.cfg|GistSyncMutants|ProgressSurvives"
  "mutant-shared-gist-file.cfg|GistSyncMutants|SyncedStaysSynced"
  "mutant-no-sync-lock.cfg|GistSyncMutants|SyncedStaysSynced"
)

find_java() {
  local c
  for c in "${JAVA:-}" "$(command -v java || true)" \
    /opt/homebrew/opt/openjdk/bin/java /opt/homebrew/opt/openjdk@21/bin/java \
    /usr/local/opt/openjdk/bin/java; do
    if [[ -n "$c" && -x "$c" ]] && "$c" -version >/dev/null 2>&1; then
      echo "$c"
      return
    fi
  done
  echo "Java를 찾지 못했다 — 'brew install openjdk' 후 다시, 또는 JAVA=/path/to/java" >&2
  exit 2
}

ensure_jar() {
  if [[ ! -f "$JAR" ]]; then
    mkdir -p "$CACHE"
    echo "tla2tools $TLA_VERSION 내려받는 중…"
    curl -fsSL -o "$JAR.part" \
      "https://github.com/tlaplus/tlaplus/releases/download/v$TLA_VERSION/tla2tools.jar"
    mv "$JAR.part" "$JAR"
  fi
  local got
  got="$(shasum -a 256 "$JAR" | cut -d' ' -f1)"
  if [[ "$got" != "$TLA_SHA256" ]]; then
    echo "tla2tools 체크섬 불일치: $got" >&2
    rm -f "$JAR"
    exit 2
  fi
}

JAVA_BIN="$(find_java)"
ensure_jar
cd "$HERE"

fail=0
for row in "${EXPECT[@]}"; do
  IFS='|' read -r cfg module want <<<"$row"
  out="$("$JAVA_BIN" -XX:+UseParallelGC -cp "$JAR" tlc2.TLC -workers auto \
    -metadir "$CACHE/states/${cfg%.cfg}" -config "$cfg" "$module.tla" 2>&1 || true)"
  if grep -q "No error has been found" <<<"$out"; then
    got="pass"
  elif v="$(grep -oE '(Invariant|Action property) [A-Za-z]+ is violated' <<<"$out" | head -1)" && [[ -n "$v" ]]; then
    got="$(awk '{print $(NF-2)}' <<<"$v")"
  else
    echo "ERROR $cfg — TLC가 결론을 내지 못했다 (문법·의미 오류):"
    echo "$out" | tail -25
    fail=1
    continue
  fi
  states="$(grep -oE '[0-9]+ distinct states found' <<<"$out" | tail -1 || true)"
  if [[ "$got" == "$want" ]]; then
    mark="ok   "
  else
    mark="DRIFT"
    fail=1
  fi
  echo "$mark $cfg — 기대 $want · 실제 $got ($states)"
  if [[ "$got" != "pass" ]]; then
    # 반례를 동작 이름의 순서로 줄여 보여준다
    grep -oE '^State [0-9]+: <[A-Za-z]+' <<<"$out" | sed -E 's/^State ([0-9]+): <(.*)/        \1. \2/'
  fi
done

echo
echo "--- 실제 코드 재생 (tests/syncRace.test.ts)"
cd "$ROOT"
if ! TZ=Asia/Seoul npx --no-install vitest run tests/syncRace.test.ts; then
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  echo
  echo "기대와 다른 결과가 있다 — .claude/skills/verify-gist-sync/SKILL.md의 '결과 읽기'를 따른다." >&2
  exit 1
fi
echo
echo "모든 검사가 기대대로다."
