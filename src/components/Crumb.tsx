import { Fragment } from 'react'

/**
 * 경로 표기 — 과정 › 단원 › 묶음. 가운뎃점으로 이어 붙이면 지표 나열처럼 읽혀
 * 위계가 보이지 않았다. 구분 기호는 화면 낭독기가 읽지 않고 이름만 차례로 읽힌다
 * (이름 사이 공백은 글자 그대로 남겨 두어 낭독기가 한 낱말로 붙여 읽지 않게 한다).
 */
export function Crumb({ parts }: { parts: readonly string[] }) {
  return (
    <span className="crumb">
      {parts.map((part, i) => (
        <Fragment key={`${String(i)}:${part}`}>
          {i > 0 && (
            <>
              {' '}
              <span className="crumb-sep" aria-hidden="true">
                ›
              </span>{' '}
            </>
          )}
          {part}
        </Fragment>
      ))}
    </span>
  )
}
