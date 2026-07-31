/**
 * 있어야 하는 값이 없으면 즉시 실패한다.
 *
 * noUncheckedIndexedAccess 아래에서 인덱스 접근은 모두 `T | undefined`가 된다.
 * 대부분은 호출 쪽에서 좁힐 수 있지만, "데이터 무결성이 이미 보장된 조회"
 * (verses.json 계층 연결, 범위 검사를 끝낸 배열 인덱스)는 좁힐 근거가
 * 런타임에만 있다. 그 자리에서 `!`나 `as`로 침묵시키는 대신 여기서 던져,
 * 무결성이 깨진 순간이 조용히 넘어가지 않게 한다.
 */
export function required<T>(value: T | undefined | null, what = '값'): T {
  if (value === undefined || value === null) {
    throw new Error(`${what}이(가) 없습니다 — 데이터 무결성 오류`)
  }
  return value
}
