import type { AiConfig, HubJob, JobPosting, JobSource } from "../types";
import { fetchJobFromUrl, JobUrlError, type JobUrlResult } from "./jobUrl";
import { parseJobText } from "./import";

/** 공고 URL 여러 개를 한 번에 넣을 때의 진행 상태 */
export interface AddProgress {
  url: string;
  state: "waiting" | "loading" | "done" | "failed";
  message?: string;
}

const URL_SHAPE = /^(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

/** 붙여넣은 글에서 공고 주소만 골라냅니다. 줄바꿈·쉼표·공백으로 여러 개를 넣을 수 있습니다. */
export function splitJobUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(/^[<("'“]+|[>)"'”]+$/g, "").trim();
    if (!token || !URL_SHAPE.test(token)) continue;
    if (!/^(?:https?:\/\/)/i.test(token) && !/^www\./i.test(token) && !/^[\w-]+\.(?:co\.kr|com|kr|io|net|so|site|me)(?:\/|$)/i.test(token)) {
      // 파일명·문장 속 마침표와 구분하기 위해 알려진 형태만 받습니다.
      continue;
    }
    const key = token.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(/^https?:\/\//i.test(token) ? token : `https://${token}`);
  }
  return out.slice(0, 12);
}

/** 같은 공고를 두 번 모으지 않기 위한 비교 키 */
export function urlKey(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./i, "").toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** 사용자가 붙여넣은 주소에 https://를 붙여 새 탭 링크로 쓸 수 있게 만듭니다. */
export function normalizeApplyUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(?:\.[\w-]+)+(?:[/?#]\S*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export const makeHubJob = (job: JobPosting, source: JobSource, applyUrl: string): HubJob => {
  const now = new Date().toISOString();
  const link = normalizeApplyUrl(applyUrl || source.url || "");
  return {
    id: `hub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    job: { ...job, applyUrl: link, applyLabel: job.applyLabel || "원문 공고" },
    source,
    applyUrl: link,
    status: "지원 전",
    memo: "",
    documentsChecked: [],
    createdAt: now,
    updatedAt: now,
  };
};

export interface FetchOutcome {
  url: string;
  ok: boolean;
  result?: JobUrlResult;
  error?: JobUrlError;
}

/**
 * 여러 공고를 최대 3개씩 동시에 읽어 옵니다.
 * 실패한 주소는 나머지를 막지 않고, 진행 상태를 주소별로 돌려줍니다.
 */
export async function fetchMany(
  urls: string[],
  config: AiConfig,
  onProgress: (index: number, state: AddProgress["state"], message?: string) => void,
  concurrency = 3,
): Promise<FetchOutcome[]> {
  const outcomes: FetchOutcome[] = urls.map((url) => ({ url, ok: false }));
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      const url = urls[index];
      onProgress(index, "loading");
      try {
        const result = await fetchJobFromUrl(url, config);
        outcomes[index] = { url, ok: true, result };
        const company = result.job.company || "회사 미확인";
        const role = result.job.role || "직무 미확인";
        onProgress(index, "done", `${company} · ${role}`);
      } catch (error) {
        const failure = error instanceof JobUrlError ? error : new JobUrlError("unknown", "공고를 불러오지 못했습니다.");
        outcomes[index] = { url, ok: false, error: failure };
        onProgress(index, "failed", failure.message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, urls.length)) }, worker));
  return outcomes;
}

export function hubJobFromOutcome(url: string, result: JobUrlResult): HubJob {
  const source: JobSource = {
    kind: "url",
    url: result.meta.finalUrl || result.meta.url || url,
    site: result.meta.site,
    fetchedAt: new Date().toISOString(),
    note: result.meta.note,
  };
  const applyUrl = result.job.applyUrl || result.meta.finalUrl || result.meta.url || url;
  return makeHubJob({ ...result.job, applyUrl }, source, applyUrl);
}

export function hubJobFromPaste(text: string, url: string): HubJob {
  const parsed = parseJobText(text);
  const trimmedUrl = normalizeApplyUrl(url);
  const source: JobSource = {
    kind: "paste",
    site: trimmedUrl ? "본문 붙여넣기" : "붙여넣은 본문",
    url: trimmedUrl || undefined,
    fetchedAt: new Date().toISOString(),
  };
  return makeHubJob(parsed.job, source, trimmedUrl);
}

/** 공고 원문에 적힌 제출서류가 없을 때 화면에 띄울 안내 (임의 항목을 만들지 않습니다) */
export const NO_DOCUMENTS_HINT = "공고 원문에 제출서류 항목이 없습니다. 지원 페이지에서 확인하세요.";
