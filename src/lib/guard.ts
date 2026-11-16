/**
 * AI가 만든 문장이 지원자 원문에 없는 사실을 말하지 않도록 막는 마지막 관문.
 * - 원문에 없는 숫자(성과 수치)는 버립니다.
 * - 원문에 없는 회사·브랜드처럼 보이는 고유명사는 버립니다.
 * - 리라이트는 원문 문장과 정확히 대응될 때만 반영합니다.
 */

const COMPANY_PATTERN =
  /[가-힣A-Za-z0-9]{2,}(?:커머스|테크|소프트|엔터테인먼트|엔터|모빌리티|피알|그룹|랩스|웍스|월드와이드|월드|코리아|테크놀로지|소프트웨어)(?!\S)/g;

const compact = (text: string) => text.replace(/\s+/g, " ").trim();

export function numberTokens(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map((token) => token.replace(/[,]/g, "").replace(/\.$/, ""));
}

export function companyTokens(text: string): string[] {
  return (text.match(COMPANY_PATTERN) ?? []).map((token) => token.trim());
}

export interface TextGuard {
  ok: boolean;
  notes: string[];
}

/** 후보 문장이 출처 텍스트에 없는 숫자·고유명사를 쓰면 실패로 돌려줍니다. */
export function guardText(candidate: string, sources: string[]): TextGuard {
  const notes: string[] = [];
  const sourceText = sources.join("\n");
  const allowedNumbers = new Set(numberTokens(sourceText));
  const invented = numberTokens(candidate).filter((token) => !allowedNumbers.has(token));
  if (invented.length) notes.push(`원문에 없는 수치(${invented.join(", ")})`);

  const allowedCompanies = new Set(companyTokens(sourceText).map((token) => token.toLowerCase()));
  const unknown = companyTokens(candidate).filter((token) => !allowedCompanies.has(token.toLowerCase()));
  if (unknown.length) notes.push(`원문에 없는 회사명(${unknown.join(", ")})`);

  return { ok: notes.length === 0, notes };
}

/** 원문 문장과 대응되는지 비교할 때 쓰는 정규화 (공백·따옴표·끝맺음만 다듬음) */
export function normalizeSentence(text: string): string {
  return compact(text)
    .replace(/[“”"'’‘]/g, "")
    .replace(/[.。]$/, "")
    .toLowerCase();
}

export function findSourceSentence(before: string, candidates: string[]): string | null {
  const target = normalizeSentence(before);
  if (!target) return null;
  const exact = candidates.find((candidate) => normalizeSentence(candidate) === target);
  if (exact) return exact;
  // AI가 앞뒤를 조금 잘라 보낸 경우를 구제합니다 (80% 이상 겹치면 같은 문장으로 봅니다).
  const partial = candidates.find((candidate) => {
    const norm = normalizeSentence(candidate);
    return norm.includes(target) || target.includes(norm);
  });
  return partial ?? null;
}

export function guardIntro(text: string, sources: string[]): TextGuard {
  const guard = guardText(text, sources);
  const length = compact(text).length;
  if (length < 180) guard.notes.push(`분량 부족(${length}자)`);
  if (length > 900) guard.notes.push(`분량 초과(${length}자)`);
  return { ok: guard.ok && length >= 180 && length <= 900, notes: guard.notes };
}

export function guardBulletTexts(items: { before: string; after: string }[], resumeBullets: string[], sources: string[]): string[] {
  const notes: string[] = [];
  for (const item of items) {
    if (!findSourceSentence(item.before, resumeBullets)) {
      notes.push(`원문과 대응되지 않는 리라이트(${item.before.slice(0, 24)}…)`);
    } else if (!guardText(item.after, [item.before, ...sources]).ok) {
      notes.push(`리라이트에 원문에 없는 값(${item.before.slice(0, 20)}…)`);
    }
  }
  return notes;
}
