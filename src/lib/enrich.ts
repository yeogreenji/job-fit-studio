import type { AiConfig, AiFit, InterviewQuestion, JobPackage, QuestionCategory, ReverseQuestion, ReverseTone } from "../types";
import { requestAiPackage } from "./ai";
import { guardIntro, guardText, findSourceSentence } from "./guard";

const CATEGORIES: QuestionCategory[] = ["전환", "성과 검증", "위기 대응", "직무", "협업", "리더십", "갭 보완", "컬처"];
const TONES: ReverseTone[] = ["성과 기준", "갭 확인", "조직 적합"];

export const resumeSources = (pkg: JobPackage): string[] => {
  const { resumeSnapshot: resume, jobSnapshot: job } = pkg;
  return [
    resume.name,
    resume.headline,
    resume.summary,
    String(resume.years),
    resume.skills.join(" "),
    resume.industries.join(" "),
    ...resume.experiences.flatMap((exp) => [exp.company, exp.role, exp.period, ...exp.bullets.map((b) => b.text)]),
    job.company,
    job.role,
    job.responsibilities,
    job.requirements,
    job.preferred,
    job.tone,
  ].filter(Boolean);
};

const sentence = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
export interface EnrichResult {
  pkg: JobPackage;
  warnings: string[];
  model?: string;
}

/**
 * AI 결과를 내장 엔진 패키지에 합칩니다.
 * 원문에 없는 수치·회사명이 섞인 항목은 버리고 경고로 남깁니다.
 */
export async function enrichWithAi(pkg: JobPackage, config: AiConfig): Promise<EnrichResult> {
  const { data, model } = await requestAiPackage({
    job: pkg.jobSnapshot,
    resume: pkg.resumeSnapshot,
    match: pkg.match,
    config,
  });
  const sources = resumeSources(pkg);
  const warnings: string[] = [];
  const next: JobPackage = { ...pkg, engine: "ai", aiModel: model };

  // 1) AI 적합도 진단
  if (data.fit) {
    const strengths = (Array.isArray(data.fit.strengths) ? data.fit.strengths : [])
      .map((item) => ({ label: sentence(item?.label), why: sentence(item?.why) }))
      .filter((item) => item.label && item.why && guardText(`${item.label} ${item.why}`, sources).ok)
      .slice(0, 3);
    const gaps = (Array.isArray(data.fit.gaps) ? data.fit.gaps : [])
      .map((item) => ({ label: sentence(item?.label), how: sentence(item?.how) }))
      .filter((item) => item.label && item.how && guardText(`${item.label} ${item.how}`, sources).ok)
      .slice(0, 3);
    const verdict = sentence(data.fit.verdict);
    if (verdict && guardText(verdict, sources).ok) {
      const fit: AiFit = { verdict, strengths, gaps, model };
      next.aiFit = fit;
    } else if (verdict) {
      warnings.push("AI 진단 문장에 원문에 없는 값이 있어 제외했습니다.");
    }
  }

  // 2) 1분 자기소개
  const introText = sentence(data.intro?.text);
  if (introText) {
    const guard = guardIntro(introText, sources);
    if (guard.ok) {
      next.intro = {
        text: introText,
        source: "ai",
        model,
        outline: {
          hook: sentence(data.intro?.outline?.hook),
          proof: sentence(data.intro?.outline?.proof),
          fit: sentence(data.intro?.outline?.fit),
          close: sentence(data.intro?.outline?.close),
        },
      };
    } else {
      warnings.push(`AI 자기소개를 쓰지 못했습니다: ${guard.notes.join(", ")}`);
    }
  }

  // 3) 핵심 어필 3
  const appeals = (Array.isArray(data.appeals) ? data.appeals : [])
    .map((item) => ({ title: sentence(item?.title), body: sentence(item?.body) }))
    .filter((item) => item.title.length >= 4 && item.body.length >= 20 && guardText(`${item.title} ${item.body}`, sources).ok)
    .slice(0, 3);
  if (appeals.length === 3) {
    next.appeals = pkg.appeals.map((appeal, index) => ({ ...appeal, title: appeals[index].title, body: appeals[index].body }));
  } else if (appeals.length) {
    warnings.push("어필 포인트 3개 중 일부가 원문 근거를 확인하지 못해 기존 문장을 유지했습니다.");
    next.appeals = pkg.appeals.map((appeal, index) => (appeals[index] ? { ...appeal, title: appeals[index].title, body: appeals[index].body } : appeal));
  }

  // 4) 경력 문장 리라이트
  const bulletTexts = pkg.resumeSnapshot.experiences.flatMap((exp) => exp.bullets.map((bullet) => bullet.text)).filter(Boolean);
  let applied = 0;
  const rewrites = pkg.rewrites.map((rewrite) => {
    const candidate = (Array.isArray(data.rewrites) ? data.rewrites : []).find((item) => {
      const before = sentence(item?.before);
      return before && findSourceSentence(before, [rewrite.before]) !== null;
    });
    if (!candidate) return rewrite;
    const after = sentence(candidate.after);
    const reason = sentence(candidate.reason) || "공고 문구에 맞춰 다듬은 문장입니다.";
    if (after.length < 10) return rewrite;
    if (!findSourceSentence(sentence(candidate.before), bulletTexts)) {
      warnings.push(`원문과 대응되지 않는 리라이트 1건을 제외했습니다.`);
      return rewrite;
    }
    if (!guardText(after, [rewrite.before, ...sources]).ok) {
      warnings.push(`원문에 없는 값이 들어간 리라이트 1건을 제외했습니다.`);
      return rewrite;
    }
    applied += 1;
    return { ...rewrite, after, reason };
  });
  if (applied) next.rewrites = rewrites;

  // 5) 압박 질문
  const existing = new Set(pkg.questions.map((q) => q.question.replace(/\s+/g, "")));
  const additions: InterviewQuestion[] = (Array.isArray(data.questions) ? data.questions : [])
    .map((item) => {
      const question = sentence(item?.question);
      const category = CATEGORIES.includes(item?.category as QuestionCategory) ? (item.category as QuestionCategory) : "직무";
      return { question, why: sentence(item?.why) || "이 공고에서 실제로 나올 수 있는 확인 질문입니다.", category };
    })
    .filter((item) => item.question.length > 10 && !existing.has(item.question.replace(/\s+/g, "")) && guardText(item.question, [...sources, "90초"]).ok)
    .slice(0, 6)
    .map((item, index) => ({
      id: `q-ai-${index + 1}`,
      category: item.category,
      question: item.question,
      why: item.why,
      difficulty: 3 as const,
      gap: null,
      edited: false,
      star: {
        situation: "[상황: 언제, 어느 조직에서]",
        task: "[과제: 무엇을 맡았는지]",
        action: "[행동: 내가 직접 한 일]",
        result: "[결과: 수치·변화]",
      },
      hint: "AI가 공고를 보고 만든 질문입니다. 답은 경력 원본에 있는 사실로만 채우세요.",
    }));

  if (additions.length) {
    next.questions = [...pkg.questions, ...additions].slice(0, 16).map((q, index) => ({ ...q, id: `q-${index + 1}` }));
  }

  // 6) 역질문 3개
  const reverse: ReverseQuestion[] = (Array.isArray(data.reverseQuestions) ? data.reverseQuestions : [])
    .map((item, index) => {
      const question = sentence(item?.question);
      const intent = sentence(item?.intent) || "면접관이 이 자리의 실제 기대를 확인하는 질문입니다.";
      const tone = TONES.includes(item?.tone as ReverseTone) ? (item.tone as ReverseTone) : TONES[index % TONES.length];
      return { id: `rv-ai-${index + 1}`, question, intent, tone, source: "ai" as const };
    })
    .filter((item) => item.question.length > 12 && guardText(item.question, [...sources, "6개월", "1년", "90일", "3개월"]).ok)
    .slice(0, 3);
  if (reverse.length >= 2) next.reverse = reverse;
  else if (reverse.length) warnings.push("AI 역질문 일부가 근거를 확인하지 못해 규칙 질문을 유지했습니다.");

  next.aiWarnings = warnings.filter(Boolean);
  const unique = [...new Set(next.aiWarnings)];
  next.aiWarnings = unique;
  return { pkg: next, warnings: unique, model };
}

export const listToText = (items: string[] | undefined): string => (Array.isArray(items) ? items.filter(Boolean).join(" ") : "");
