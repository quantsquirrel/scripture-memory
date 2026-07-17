export interface FLWord {
  word: string
  hint: string
}

/** 어절별 첫 글자 힌트. 원문 어절을 그대로 유지한다. */
export function firstLetterWords(text: string): FLWord[] {
  return text
    .normalize('NFC')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ word, hint: word[0] }))
}
