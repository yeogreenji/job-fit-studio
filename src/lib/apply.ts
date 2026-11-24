import type { ApplyDraft, ApplyStatus, JobPosting, MasterResume } from "../types";
import { analyze } from "./engine";
import { rankBullets } from "./coach";
import { findSourceSentence, guardText } from "./guard";

/**
 * 지원 허브의 문구 만들기.
 * 규칙 엔진이 고른 이력서 문장만 인용하고, 공고에 없는 요구를 만들지 않습니다.
 * AI가 연결되면 같은 결과를 더 자연스러운 문장으로 다듬습니다(src/lib/ai.ts).
 */

export const APPLY_STATUSES: ApplyStatus[] = ["지원 전", "준비중", "지원완료", "서류합격", "면접", "오퍼"];

export const STATUS_CHIP: Record<ApplyStatus, string> = {
  "지원 전": "bg-paper-deep text-muted",
  준비중: "bg-warn-soft text-warn",
  지원완료: "bg-info-soft text-info",
  서류합격: "bg-accent-soft text-accent-deep",
  면접: "bg-ok-soft text-ok",
  오퍼: "bg-[#efe7fb] text-[#5b3b9b]",
};

export const STATUS_DOT: Record<ApplyStatus, string> = {
  "지원 전": "#989da5",
  준비중: "#a4680c",
  지원완료: "#2f5f8a",
  서류합격: "#0e6a58",
  면접: "#16714f",
  오퍼: "#5b3b9b",
};

/** 여러 줄 텍스트를 줄 단위 목록으로 (불릿·번호 제거) */
export const linesOf = (text: string | undefined, max = 14): string[] =>
  (text ?? "")
    .split("\n")
    .map((line) => line.replace(/^[\s•·▪◦‣\-–—]+/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter((line) => line.length > 1)
    .slice(0, max);

/**
 * 공고의 제출서류 항목. 원문에 없으면 빈 배열입니다(임의로 만들지 않습니다).
 * 한 줄에 쉼표로 여러 서류를 적은 공고는 항목별로 나눠 체크할 수 있게 합니다.
 */
export const docItems = (job: JobPosting): string[] => {
  const rows: string[] = [];
  for (const line of linesOf(job.documents, 10)) {
    const parts = line.split(/\s*[,、]\s*/).map((part) => part.trim()).filter((part) => part.length > 1);
    if (parts.length > 1 && line.length <= 60 && parts.every((part) => part.length <= 24)) {
      rows.push(...parts);
    } else {
      rows.push(line);
    }
  }
  return rows.slice(0, 10);
};

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

const endSentence = (text: string) => {
  const trimmed = clean(text);
  if (!trimmed) return "";
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** AI 결과 검증에 쓰는 출처 모음 (지원자 원문 + 공고 원문) */
export function applySources(resume: MasterResume, job: JobPosting): string[] {
  return [
    resume.headline,
    resume.summary,
    resume.skills.join(" "),
    resume.industries.join(" "),
    ...resume.experiences.flatMap((exp) => [exp.company, exp.role, exp.period, ...exp.bullets.map((bullet) => bullet.text)]),
    job.company,
    job.role,
    job.responsibilities,
    job.requirements,
    job.preferred,
    job.documents ?? "",
  ].filter(Boolean);
}

interface KitSignals {
  keywords: string[];
  bullets: { company: string; role: string; text: string }[];
  duty: string;
  preferred: string;
  requirement: string;
}

/** 공고와 이력서에서 문구 재료를 고릅니다(규칙). */
function signalsOf(resume: MasterResume, job: JobPosting): KitSignals {
  const { match } = analyze(resume, job);
  const seenTokens = new Set<string>();
  const keywords = match.keywords
    .filter((keyword) => keyword.status !== "missing")
    .sort((a, b) => b.weight * b.coverage - a.weight * a.coverage)
    .map((keyword) => keyword.label)
    .filter((label, index, all) => all.indexOf(label) === index)
    // '브랜드 커뮤니케이션 · 커뮤니케이션 전략'처럼 같은 단어가 겹치면 뒤쪽은 남은 단어만 씁니다.
    .map((label) => {
      const fresh = label.split(/\s+/).filter((token) => token && !seenTokens.has(token));
      if (!fresh.length) return "";
      for (const token of fresh) seenTokens.add(token);
      return fresh.join(" ");
    })
    .filter(Boolean)
    .slice(0, 3);
  const bullets = rankBullets(resume, match)
    .filter((bullet) => bullet.text.length > 8)
    .slice(0, 3)
    .map((bullet) => ({ company: bullet.company, role: bullet.role, text: clean(bullet.text) }));
  const duties = linesOf(job.responsibilities, 6);
  const preferred = linesOf(job.preferred, 4);
  const requirements = linesOf(job.requirements, 4);
  return {
    keywords,
    bullets,
    duty: duties[0] ?? "",
    preferred: preferred[0] ?? "",
    requirement: requirements[0] ?? "",
  };
}

/** 규칙 기반 지원 문구 — 저장된 이력서 문장을 그대로 인용합니다. */
export function buildLocalApplyKit(resume: MasterResume, job: JobPosting): ApplyDraft {
  const signals = signalsOf(resume, job);
  const role = job.role.trim() || resume.headline || "이 직무";
  const company = job.company.trim();
  const keywordText = signals.keywords.join("·");
  const namePart = resume.name ? `${resume.name}입니다. ` : "";

  const oneLiner = clean(
    `${keywordText || resume.headline || role} 경험으로 ${company ? `${company} ` : ""}${role}에 바로 기여하겠습니다`,
  ).slice(0, 90);

  const opening = endSentence(
    `${company ? `${company}의 ` : ""}${role} 공고에서 ${signals.duty ? `‘${signals.duty.replace(/[.。]$/, "")}’` : "맡을 업무"}를 확인했습니다. ` +
      `${namePart}${resume.headline || role}로 ${resume.years}년 일하면서 ${keywordText || "같은 업무"}를 직접 해 왔습니다`,
  );

  const proofBullets = signals.bullets.slice(0, 2).map((bullet) => endSentence(`${bullet.company ? `${bullet.company}에서 ` : ""}${bullet.text}`));
  const proof = proofBullets.length
    ? `${proofBullets.join(" ")}`
    : endSentence(`${role}에서 해 온 일의 기준과 순서를 문서로 남겨 왔습니다`);

  const fitLine = signals.preferred
    ? `공고의 우대 사항인 ‘${signals.preferred.replace(/[.。]$/, "")}’도 같은 흐름에서 준비해 왔습니다.`
    : signals.requirement
      ? `공고가 요구한 ‘${signals.requirement.replace(/[.。]$/, "")}’에 맞춰 제가 해 온 일을 먼저 말씀드리겠습니다.`
      : "";

  const closing = endSentence(
    `입사하면 ${role}의 ${signals.keywords[0] || "업무"} 기준을 먼저 확인하고, 실행과 성과 확인을 반복하며 팀에 필요한 결과를 만들겠습니다`,
  );

  return {
    oneLiner,
    coverLetter: [opening, [proof, fitLine].filter(Boolean).join(" "), closing].filter(Boolean).join("\n\n"),
    keyPoints: signals.bullets.map((bullet) => bullet.text),
    source: "rule",
    updatedAt: new Date().toISOString(),
  };
}

/**
 * AI가 만든 문구에서 원문에 없는 수치·회사명을 걷어냅니다.
 * 통과한 항목만 교체하고, 걸러낸 개수를 warnings에 남깁니다.
 */
export function mergeAiApplyKit(
  local: ApplyDraft,
  ai: { oneLiner?: string; coverLetter?: string; keyPoints?: string[] },
  sources: string[],
  resumeBullets: string[],
  model?: string,
): { draft: ApplyDraft; warnings: number } {
  let warnings = 0;
  const oneLiner = (ai.oneLiner ?? "").trim();
  const coverLetter = (ai.coverLetter ?? "").trim();
  const keyPoints = (ai.keyPoints ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 3);

  const oneLinerOk = oneLiner.length >= 12 && oneLiner.length <= 140 && guardText(oneLiner, sources).ok;
  const coverOk = coverLetter.length >= 180 && guardText(coverLetter, sources).ok;
  const keptKeyPoints = keyPoints.filter((point) => Boolean(findSourceSentence(point, resumeBullets)));

  if (oneLiner && !oneLinerOk) warnings += 1;
  if (coverLetter && !coverOk) warnings += 1;
  warnings += keyPoints.length - keptKeyPoints.length;

  const next: ApplyDraft = {
    ...local,
    oneLiner: oneLinerOk ? oneLiner : local.oneLiner,
    coverLetter: coverOk ? coverLetter : local.coverLetter,
    keyPoints: keptKeyPoints.length ? keptKeyPoints : local.keyPoints,
    source: "ai",
    model,
    updatedAt: new Date().toISOString(),
    warnings,
  };
  return { draft: next, warnings };
}
