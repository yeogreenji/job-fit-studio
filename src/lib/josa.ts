/**
 * 받침에 따라 조사를 고릅니다 — ‘보도자료’를 / ‘입장문’을 처럼 화면·문구에서 자연스럽게 읽히도록.
 * 한글 음절의 종성 유무만 보고, 한글이 아니면 뒤쪽 조사를 씁니다.
 */

const PAIRS: Record<string, [string, string]> = {
  // [받침 없음, 받침 있음]
  "을": ["를", "을"],
  "이": ["가", "이"],
  "은": ["는", "은"],
  "과": ["와", "과"],
  "으로": ["로", "으로"],
  "이다": ["다", "이다"],
  "이라고": ["라고", "이라고"],
};

function hasFinalConsonant(word: string): boolean | null {
  const last = word.trim().slice(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  return (code - 0xac00) % 28 !== 0;
}

/** 단어 뒤에 알맞은 조사를 붙입니다. 예) withJosa("보도자료", "을") → "보도자료를" */
export function withJosa(word: string, josa: keyof typeof PAIRS | string): string {
  const pair = PAIRS[josa];
  if (!pair) return `${word}${josa}`;
  const final = hasFinalConsonant(word);
  if (final === null) return `${word}${pair[0]}`;
  return `${word}${final ? pair[1] : pair[0]}`;
}

/** 따옴표로 감싼 인용 뒤에 조사를 붙입니다. 예) quotedJosa("보도자료 작성", "을") → "‘보도자료 작성’을" */
export function quotedJosa(phrase: string, josa: keyof typeof PAIRS | string): string {
  const inner = phrase.replace(/[.。]$/, "").trim();
  const pair = PAIRS[josa];
  if (!pair) return `‘${inner}’${josa}`;
  const final = hasFinalConsonant(inner);
  return `‘${inner}’${final === null || !final ? pair[0] : pair[1]}`;
}
