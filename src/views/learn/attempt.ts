/**
 * 첫글자 단계의 한 번의 시도 — 화면 상태일 뿐 저장하지 않는다.
 * 본문을 펼쳐 읽는 동안에도 사다리 단계(LearnProgress.step)는 firstLetter 그대로다.
 */
export interface FirstLetterAttempt {
  /** 이번 시도에서 엿본 어절 수 — 통과 판정에 실리는 유일한 수 */
  peeks: number
  /** 보드를 새로 놓을 때마다 바뀐다(모든 어절을 다시 가린다) */
  board: number
  /** 통과 기준을 넘긴 시도의 엿보기 수(실패 안내) */
  failedPeeks: number | null
  /** 본문 전체를 펼쳐 읽는 중 */
  reading: boolean
}

export type AttemptEvent =
  | { type: 'peek' }
  | { type: 'failed'; peeks: number }
  | { type: 'reread' }
  /** 다시 시도, 또는 본문을 다시 가림 — 어느 쪽이든 엿보기 0회의 새 보드 */
  | { type: 'restart' }

export const FRESH_ATTEMPT: FirstLetterAttempt = {
  peeks: 0,
  board: 0,
  failedPeeks: null,
  reading: false,
}

/**
 * 저장된 단계로 첫글자 단계에 다시 들어올 때의 시작 — 본문부터 본다. 1단계만 하고
 * 나갔다가, 또는 2단계 도중에 나갔다가 돌아온 사람은 본문을 다시 읽고 시작한다.
 * 같은 방문에서 1단계를 마치고 넘어오면 restart로 보드부터다(방금 본문을 읽었다).
 */
export const RESUMED_ATTEMPT: FirstLetterAttempt = { ...FRESH_ATTEMPT, reading: true }

export function nextAttempt(s: FirstLetterAttempt, e: AttemptEvent): FirstLetterAttempt {
  switch (e.type) {
    case 'peek':
      return { ...s, peeks: s.peeks + 1 }
    case 'failed':
      return { ...s, failedPeeks: e.peeks }
    case 'reread':
      return { ...s, reading: true }
    case 'restart':
      // 본문을 본 시도는 무효다 — 돌아오면 그 시도의 엿보기와 실패 안내를 남기지 않는다
      return { ...FRESH_ATTEMPT, board: s.board + 1 }
  }
}
