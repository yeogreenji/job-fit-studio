import type { AiConfig, JobPosting } from "../types";
import { ANALYZE_ENDPOINT } from "./ai";

export interface JobUrlMeta {
  url: string;
  finalUrl: string;
  site: string;
  title: string;
  chars: number;
  note: string;
}

export interface JobUrlResult {
  job: JobPosting;
  meta: JobUrlMeta;
  engine: "rule" | "ai";
  model?: string;
}

export type JobUrlErrorCode =
  | "bad_url"
  | "fetch_blocked"
  | "fetch_failed"
  | "not_job_page"
  | "too_large"
  | "server_unavailable"
  | "timeout"
  | "unknown";

export class JobUrlError extends Error {
  code: JobUrlErrorCode;
  site?: string;
  excerpt: string;
  constructor(code: JobUrlErrorCode, message: string, extra?: { site?: string; excerpt?: string }) {
    super(message);
    this.name = "JobUrlError";
    this.code = code;
    this.site = extra?.site;
    this.excerpt = extra?.excerpt ?? "";
  }
}

const uid = () => `job-url-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

const keyOf = (config: AiConfig): string | undefined => (config.sendKey && config.apiKey.trim() ? config.apiKey.trim() : undefined);

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** 공고 URL을 서버로 보내 본문을 긁어옵니다. 실패하면 붙여넣기로 넘어갈 수 있게 이유와 본문 조각을 돌려줍니다. */
export async function fetchJobFromUrl(url: string, config: AiConfig, timeoutMs = 45_000): Promise<JobUrlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "job_url", jobUrl: url, apiKey: keyOf(config), model: config.model || undefined }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new JobUrlError("timeout", "공고를 불러오는 데 시간이 너무 걸렸습니다. 본문을 붙여넣어 주세요.");
    }
    throw new JobUrlError("server_unavailable", "공고를 불러오는 서버에 연결하지 못했습니다. 본문을 붙여넣으면 같은 분석을 받을 수 있습니다.");
  }
  clearTimeout(timer);

  const raw = await response.text();
  let payload: {
    ok?: boolean;
    engine?: string;
    model?: string;
    job?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    error?: { code?: string; message?: string; site?: string; excerpt?: string };
  } = {};
  try {
    payload = JSON.parse(raw) as typeof payload;
  } catch {
    throw new JobUrlError("server_unavailable", "공고를 불러오는 서버가 준비되지 않았습니다. 본문을 붙여넣어 주세요.");
  }

  if (!response.ok || payload.ok === false) {
    const code = (payload.error?.code as JobUrlErrorCode | undefined) ?? (response.status === 404 ? "server_unavailable" : "unknown");
    const fallback: Record<string, string> = {
      server_unavailable: "공고를 불러오는 서버에 연결하지 못했습니다. 이 화면은 정적 호스팅이라 서버가 없습니다. 공고 본문을 붙여넣으면 같은 분석을 받을 수 있습니다.",
      bad_url: "URL 형식을 확인해 주세요. https://로 시작하는 공고 주소를 붙여넣어 주세요.",
      fetch_blocked: "사이트가 자동 수집을 막았습니다. 공고 본문을 붙여넣어 주세요.",
      fetch_failed: "공고 페이지를 열지 못했습니다. 주소를 확인하거나 본문을 붙여넣어 주세요.",
      not_job_page: "공고 본문을 찾지 못했습니다. 본문을 붙여넣어 주세요.",
      too_large: "페이지가 너무 큽니다. 공고 본문만 복사해 붙여넣어 주세요.",
      timeout: "공고를 불러오는 데 시간이 너무 걸렸습니다. 본문을 붙여넣어 주세요.",
      unknown: "공고를 불러오지 못했습니다. 본문을 붙여넣어 주세요.",
    };
    throw new JobUrlError(code, payload.error?.message || fallback[code] || fallback.unknown, {
      site: payload.error?.site,
      excerpt: payload.error?.excerpt,
    });
  }

  const job = payload.job ?? {};
  const meta = payload.meta ?? {};
  return {
    job: {
      id: uid(),
      company: asString(job.company),
      role: asString(job.role),
      employmentType: asString(job.employmentType) || "정규직",
      location: asString(job.location),
      deadline: asString(job.deadline),
      responsibilities: asString(job.responsibilities),
      requirements: asString(job.requirements),
      preferred: asString(job.preferred),
      tone: asString(job.tone),
    },
    meta: {
      url: asString(meta.url) || url,
      finalUrl: asString(meta.finalUrl) || url,
      site: asString(meta.site) || "공고",
      title: asString(meta.title),
      chars: typeof meta.chars === "number" ? meta.chars : 0,
      note: asString(meta.note),
    },
    engine: payload.engine === "ai" ? "ai" : "rule",
    model: payload.model,
  };
}
