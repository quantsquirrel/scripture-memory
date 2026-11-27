/**
 * 화면·상태 목록 — 이 배열이 정본이다. src/views·src/components의 조건 분기를 읽고 하나씩 세웠다.
 * 상태를 더하려면 해당 화면 파일(states-*.ts)에 StateDef를 하나 넣는다(README 참고).
 */
import type { StateDef } from './define'
import { BROWSE_STATES } from './states-browse'
import { HOME } from './states-home'
import { LEARN } from './states-learn'
import { CONTRAST, FOCUS, HOVER, SHELL } from './states-misc'
import { RECAL } from './states-recal'
import { REVIEW } from './states-review'
import { SETTINGS } from './states-settings'

export const STATES: readonly StateDef[] = [
  ...SHELL,
  ...HOME,
  ...REVIEW,
  ...LEARN,
  ...BROWSE_STATES,
  ...SETTINGS,
  ...RECAL,
  ...FOCUS,
  ...HOVER,
  ...CONTRAST,
]

/** 찍지 못하는(또는 따로 찍지 않는) 상태와 그 이유 */
export const UNCAPTURED: readonly { what: string; why: string }[] = [
  {
    what: "등급 버튼의 제안이 '쉬움'(4)인 경우",
    why: '어느 방식도 4를 제안하지 않는다 — 첫글자·타이핑은 최대 3(좋음), 장절 입력은 3 또는 1(src/domain/grading.ts, review/modes.tsx). 제안 1·2·3은 review-*-revealed·-perfect·-close·-wrong·refinput-*가 찍는다',
  },
  {
    what: "가장 짧은 구절의 '조금 틀림'(정확도 90% 이상·완벽 아님) — review-typing-*-close-short, learn-typing-close-short",
    why: '살전 5:17은 비교 글자가 8자라 한 글자만 틀려도 87.5%로 많이 틀림이 된다',
  },
  {
    what: "복습 완료 장면에서 '다음 복습' 문구도 안내도 없는 조합",
    why: '다음 복습 시각(nextDueAt)이 없으려면 카드가 하나도 없어야 하는데, 마지막 카드를 넘긴 직후 그 사이에 다른 탭이 모두 지우는 경합에서만 생긴다. 문구가 없는 모습은 review-stale-skip-finale(건너뜀 안내와 함께)이 찍는다',
  },
  {
    what: '설치된 앱(display-mode: standalone)의 상태바 띠',
    why: 'iOS 홈 화면 앱에서 safe-area-inset-top이 있을 때만 높이가 생긴다. 헤드리스 Chromium은 standalone 표시 방식과 safe-area를 흉내 내지 못한다. 설치된 앱에서는 설치 안내가 없다(=shell-install-dismissed의 모습)',
  },
  {
    what: '연동·동기화 실패 문구의 다른 갈래(413·429·시간 초과·연결 실패, Gist 401·쓰기 실패)',
    why: '같은 자리·같은 모양에 문구만 다르다. 404·500 하나씩(settings-pairing-failed, settings-pairing-create-failed, settings-sync-failed)으로 모양을 남긴다',
  },
  {
    what: '말씀 상태 개정의 판정 저장 중(판정 버튼 disabled={busy})',
    why: '로컬 IndexedDB 쓰기 한 번(수 ms) 동안만 선다. 저장을 멈춰 두는 장치는 판정 자체를 실패로 만들어(recal-notice-failed) 비활성 모습이 남지 않는다',
  },
  {
    what: '마우스 올림 상태의 폰 폭',
    why: '폰에는 hover가 없다(hover: none 미디어 쿼리). hover-* 상태는 PC 폭에서만 찍는다',
  },
]
