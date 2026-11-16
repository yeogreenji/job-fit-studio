import type { AiConfig, JobPosting, MasterResume, MatchResult } from "../types";

export const ANALYZE_ENDPOINT = "/api/analyze";

export type AiErrorCode =
  | "server_unavailable"
  | "no_key"
  | "timeout"
  | "too_large"
  | "rate_limit"
  | "upstream"
  | "bad_response";

const MESSAGES: Record<AiErrorCode, string> = {
  server_unavailable: "AI 서버에 연결하지 못했습니다",
  no_key: "AI 서버에 GEMINI_API_KEY 또는 OPENAI_API_KEY가 설정되지 않았습니다",
  timeout: "AI 응답이 시간 안에 오지 않았습니다",
  too_large: "입력이 너무 길어 AI로 보내지 못했습니다",
  rate_limit: "AI 호출 한도에 걸렸습니다",
  upstream: "AI 제공자 응답에 문제가 있었습니다",
  bad_response: "AI 응답 형식을 해석하지 못했습니다",
};

export class AiError extends Error {
  code: AiErrorCode;
  status?: number;
  constructor(code: AiErrorCode, detail?: string, status?: number) {
    super(detail ? `${MESSAGES[code]} — ${detail}` : MESSAGES[code]);
    this.name = "AiError";
    this.code = code;
    this.status = status;
  }
}

export interface ProbeResult {
  reachable: boolean;
  ai: boolean;
  model?: string;
  reason?: string;
  message: string;
}

const mapStatus = (status: number): AiErrorCode => {
  if (status === 404 || status === 405) return "server_unavailable";
  if (status === 501) return "no_key";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  return "bad_response";
};

async function post<T>(body: unknown, timeoutMs: number): Promise<{ model?: string; data: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof DOMException && error.name === "AbortError") throw new AiError("timeout");
    throw new AiError("server_unavailable");
  }
  clearTimeout(timer);

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new AiError(response.ok ? "bad_response" : mapStatus(response.status), "JSON이 아닌 응답", response.status);
  }

  const record = (payload ?? {}) as { ok?: boolean; model?: string; data?: T; error?: { code?: string; message?: string } };
  if (!response.ok || record.ok === false) {
    const code = (record.error?.code as AiErrorCode | undefined) ?? mapStatus(response.status);
    throw new AiError(code in MESSAGES ? code : mapStatus(response.status), record.error?.message, response.status);
  }
  if (!record.data) throw new AiError("bad_response", "data가 비어 있습니다", response.status);
  return { model: record.model, data: record.data };
}

/** 서버가 살아 있고 키가 있는지 확인합니다. 앱을 열 때 한 번 호출합니다. */
export async function probeAiServer(timeoutMs = 6000): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ANALYZE_ENDPOINT}?probe=1`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) return { reachable: response.status !== 404, ai: false, reason: mapStatus(response.status), message: "AI 서버가 준비되지 않았습니다" };
    let payload: { ok?: boolean; ai?: boolean; model?: string; reason?: string } = {};
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      // vite preview처럼 index.html이 돌아오는 경우
      return { reachable: false, ai: false, reason: "server_unavailable", message: "AI 서버가 연결되지 않았습니다" };
    }
    if (!payload.ok) return { reachable: false, ai: false, reason: payload.reason ?? "server_unavailable", message: "AI 서버가 연결되지 않았습니다" };
    if (!payload.ai) return { reachable: true, ai: false, model: payload.model, reason: payload.reason ?? "no_key", message: "서버는 연결됐지만 API 키가 없습니다" };
    return { reachable: true, ai: true, model: payload.model, message: "실시간 AI 분석 준비됨" };
  } catch {
    return { reachable: false, ai: false, reason: "server_unavailable", message: "AI 서버가 연결되지 않았습니다" };
  } finally {
    clearTimeout(timer);
  }
}

const keyOf = (config: AiConfig): string | undefined => (config.sendKey && config.apiKey.trim() ? config.apiKey.trim() : undefined);

export interface PackageRequestInput {
  job: JobPosting;
  resume: MasterResume;
  match: MatchResult;
  config: AiConfig;
}

export interface AiPackageData {
  fit?: {
    verdict?: string;
    strengths?: { label?: string; why?: string }[];
    gaps?: { label?: string; how?: string }[];
  };
  intro?: { text?: string; outline?: { hook?: string; proof?: string; fit?: string; close?: string } };
  appeals?: { title?: string; body?: string; evidence?: string }[];
  rewrites?: { before?: string; after?: string; reason?: string }[];
  questions?: { question?: string; why?: string; category?: string; difficulty?: number }[];
  reverseQuestions?: { question?: string; intent?: string; tone?: string }[];
}

export async function requestAiPackage(input: PackageRequestInput): Promise<{ model?: string; data: AiPackageData }> {
  const { job, resume, match, config } = input;
  const body = {
    mode: "package" as const,
    apiKey: keyOf(config),
    model: config.model || undefined,
    job: {
      company: job.company,
      role: job.role,
      employmentType: job.employmentType,
      location: job.location,
      responsibilities: job.responsibilities,
      requirements: job.requirements,
      preferred: job.preferred,
      tone: job.tone,
    },
    resume: {
      name: resume.name,
      headline: resume.headline,
      years: resume.years,
      summary: resume.summary,
      skills: resume.skills,
      industries: resume.industries,
      experiences: resume.experiences.map((exp) => ({
        company: exp.company,
        role: exp.role,
        period: exp.period,
        bullets: exp.bullets.map((bullet) => bullet.text).filter((text) => text.trim().length > 3),
      })),
    },
    match: {
      score: match.score,
      grade: match.grade.label,
      missing: match.keywords.filter((k) => k.status === "missing").map((k) => k.label),
      weak: match.keywords.filter((k) => k.status === "weak").map((k) => k.label),
    },
  };
  return post<AiPackageData>(body, 60000);
}

export interface EvalRequestInput {
  question: string;
  answer: string;
  seconds: number;
  job: JobPosting;
  resume: MasterResume;
  config: AiConfig;
}

export interface AiEvalData {
  strengths?: string[];
  improvements?: string[];
  followUp?: string;
  followUpWhy?: string;
  score?: number;
  verdict?: string;
}

export async function requestAiEvaluation(input: EvalRequestInput): Promise<{ model?: string; data: AiEvalData }> {
  const body = {
    mode: "interview_eval" as const,
    apiKey: keyOf(input.config),
    model: input.config.model || undefined,
    seconds: input.seconds,
    question: input.question,
    answer: input.answer,
    job: {
      company: input.job.company,
      role: input.job.role,
      responsibilities: input.job.responsibilities,
      requirements: input.job.requirements,
      preferred: input.job.preferred,
    },
    resume: {
      headline: input.resume.headline,
      years: input.resume.years,
      skills: input.resume.skills,
      experiences: input.resume.experiences.map((exp) => ({
        company: exp.company,
        role: exp.role,
        bullets: exp.bullets.map((bullet) => bullet.text),
      })),
    },
  };
  return post<AiEvalData>(body, 60000);
}
