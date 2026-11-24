import type { HubJob, JobPosting } from "../types";
import { parseYearsText } from "./fit";

/**
 * 자동 공고 수집 클라이언트.
 *
 * 서버(/api/jobs)가 공개 채용 사이트에서 읽어 온 실제 공고를 받아, 허브에 붙일 수 있는
 * HubJob 모양으로 바꿉니다. 조건에 맞는 공고가 없거나 서버가 없으면 그 사실을 그대로 알립니다
 * (공고를 만들어 채우지 않습니다).
 */

export const JOBS_ENDPOINT = "/api/jobs";

export interface CollectedJob {
  id: string;
  source: string;
  sourceName: string;
  sourceJobId: string;
  company: string;
  role: string;
  employmentType: string;
  experience: string;
  location: string;
  deadline: string;
  salary: string;
  tags: string[];
  responsibilities: string;
  requirements: string;
  preferred: string;
  documents: string;
  url: string;
  applyUrl: string;
  detailLevel: "full" | "list";
  conditions: string;
  companyType?: "inhouse" | "agency" | "searchfirm" | "unknown";
  /** 서류 키워드 수집에서 이 공고에 실제로 걸린 키워드 */
  hitKeywords?: string[];
}

/** 프로필 수집에서 남긴 건수·걸린 건수 */
export interface CollectFilter {
  profile: string;
  label: string;
  raw: number;
  kept: number;
  excluded: { region: number; role: number; junior: number; agency: number };
}

export interface CollectSource {
  id: string;
  name: string;
  ok: boolean;
  count: number;
  full: number;
  ms: number;
  note?: string;
}

export interface CollectResponse {
  ok: boolean;
  query: string;
  jobs: CollectedJob[];
  sources: CollectSource[];
  fetchedAt: string;
  cached?: boolean;
  error?: { code?: string; message?: string };
  filter?: CollectFilter;
}

export type CollectErrorCode = "server_unavailable" | "timeout" | "blocked" | "bad_response" | "unknown";

/** 첫 화면 수집 바의 상태 */
export interface CollectionState {
  /** 선택한 직무 프리셋 id (직접 입력이면 custom) */
  preset: string;
  /** 입력창의 키워드 */
  keyword: string;
  /** 지금 보드에 채운 결과를 만든 키워드 */
  applied: string;
  /** 적용한 수집 타깃 프로필 (없으면 빈 문자열) */
  profile: string;
  /** 프로필로 걸러 낸 결과 요약 */
  filter: CollectFilter | null;
  region: string;
  /** 경력 조건 필터 (전체 · 신입 · 1~4년 · 5~9년 · 10년↑) */
  years: string;
  /** 이 점수 이상만 보기 (0이면 전체) */
  minFit: number;
  /** 제외 키워드에 걸린 공고 숨기기 */
  hideExcluded: boolean;
  /** 켜 둔 수집처 (비어 있으면 전체) */
  activeSources: string[];
  sort: "latest" | "deadline" | "fit" | "doc";
  status: "idle" | "loading" | "ready" | "empty" | "error";
  sources: CollectSource[];
  at: string | null;
  error: string;
  cached: boolean;
  /** 이 결과를 만든 방식 — 프리셋·키워드(auto) / 내 서류(docs) */
  mode: "auto" | "docs";
  /** 내 서류로 모을 때 서버에 보낸 키워드 */
  docKeywords: string[];
}

export class CollectError extends Error {
  code: CollectErrorCode;
  constructor(code: CollectErrorCode, message: string) {
    super(message);
    this.name = "CollectError";
    this.code = code;
  }
}

const asString = (value: unknown, limit = 400): string => (typeof value === "string" ? value.trim().slice(0, limit) : "");
const asTags = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => asString(item, 24)).filter(Boolean).slice(0, 8) : [];

function normalizeJob(raw: unknown): CollectedJob | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const url = asString(item.url, 600);
  const applyUrl = asString(item.applyUrl, 600) || url;
  const source = asString(item.source, 20);
  const sourceJobId = asString(item.sourceJobId, 40);
  const company = asString(item.company, 80);
  const role = asString(item.role, 120);
  if (!url || !source || !sourceJobId || (!company && !role)) return null;
  return {
    id: asString(item.id, 60) || `${source}:${sourceJobId}`,
    source,
    sourceName: asString(item.sourceName, 20) || source,
    sourceJobId,
    company,
    role,
    employmentType: asString(item.employmentType, 30),
    experience: asString(item.experience, 30),
    location: asString(item.location, 40),
    deadline: asString(item.deadline, 24),
    salary: asString(item.salary, 30),
    tags: asTags(item.tags),
    responsibilities: asString(item.responsibilities, 2_500),
    requirements: asString(item.requirements, 2_500),
    preferred: asString(item.preferred, 2_500),
    documents: asString(item.documents, 1_500),
    url,
    applyUrl,
    detailLevel: item.detailLevel === "full" ? "full" : "list",
    conditions: asString(item.conditions, 120),
    companyType:
      item.companyType === "inhouse" || item.companyType === "agency" || item.companyType === "searchfirm"
        ? item.companyType
        : "unknown",
    hitKeywords: asTags(item.hitKeywords),
  };
}

/** 서버에서 실제 공고를 받아 옵니다. */
export async function requestJobs(
  input: { query: string; limit?: number; detail?: number; profile?: string; keywords?: string[] },
  timeoutMs = 40_000,
): Promise<CollectResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(JOBS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: input.query,
        limit: input.limit ?? 36,
        detail: input.detail ?? 12,
        ...(input.profile ? { profile: input.profile } : {}),
        ...(input.keywords?.length ? { keywords: input.keywords } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CollectError("timeout", "공고를 모으는 데 오래 걸리고 있습니다. 잠시 뒤 다시 시도해 주세요.");
    }
    throw new CollectError("server_unavailable", "공고 수집 서버에 연결하지 못했습니다. 공고 URL을 직접 넣어 추가할 수 있습니다.");
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new CollectError(
      response.status === 404 ? "server_unavailable" : "bad_response",
      response.status === 404
        ? "이 주소에는 공고 수집 서버가 없습니다. 공고 URL을 직접 넣어 추가해 주세요."
        : "공고 수집 서버 응답을 읽지 못했습니다.",
    );
  }

  const rawJobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const jobs = rawJobs.map(normalizeJob).filter((job): job is CollectedJob => Boolean(job));
  const sources: CollectSource[] = Array.isArray(payload.sources)
    ? payload.sources.map((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return {
          id: asString(item.id, 20),
          name: asString(item.name, 20),
          ok: item.ok === true,
          count: typeof item.count === "number" ? item.count : 0,
          full: typeof item.full === "number" ? item.full : 0,
          ms: typeof item.ms === "number" ? item.ms : 0,
          note: asString(item.note, 120) || undefined,
        };
      })
    : [];

  const errorRecord = (payload.error ?? {}) as { code?: string; message?: string };
  if (!response.ok || payload.ok === false) {
    const message = asString(errorRecord.message, 160) || "지금은 공고를 모으지 못했습니다.";
    const code = asString(errorRecord.code, 40);
    throw new CollectError(code === "sources_blocked" ? "blocked" : code === "no_result" ? "bad_response" : "unknown", message);
  }

  return {
    ok: true,
    query: asString(payload.query, 40),
    jobs,
    sources,
    fetchedAt: asString(payload.fetchedAt, 40) || new Date().toISOString(),
    cached: payload.cached === true,
    error: errorRecord.message ? { code: errorRecord.code, message: errorRecord.message } : undefined,
    filter: normalizeFilter(payload.filter),
  };
}

function normalizeFilter(raw: unknown): CollectFilter | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const item = raw as Record<string, unknown>;
  const excluded = (item.excluded ?? {}) as Record<string, unknown>;
  const countOf = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const label = asString(item.label, 60);
  if (!label) return undefined;
  return {
    profile: asString(item.profile, 40),
    label,
    raw: countOf(item.raw),
    kept: countOf(item.kept),
    excluded: {
      region: countOf(excluded.region),
      role: countOf(excluded.role),
      junior: countOf(excluded.junior),
      agency: countOf(excluded.agency),
    },
  };
}

/** 자동 수집 공고 → 허브 카드. 출처·상세수준을 함께 남겨 화면에서 구분합니다. */
export function hubJobFromCollected(job: CollectedJob, fetchedAt: string): HubJob {
  const posting: JobPosting = {
    id: job.id,
    company: job.company || "회사 미확인",
    role: job.role || "직무 미확인",
    employmentType: job.employmentType,
    location: job.location,
    deadline: job.deadline,
    responsibilities: job.responsibilities,
    requirements: job.requirements,
    preferred: job.preferred,
    documents: job.documents,
    applyUrl: job.applyUrl,
    applyLabel: "원문 지원",
    tone: "",
    experience: job.experience,
    salary: job.salary,
    tags: job.tags,
    conditions: job.conditions,
    detailLevel: job.detailLevel,
    companyType: job.companyType,
  };
  return {
    id: `auto-${job.source}-${job.sourceJobId}`,
    job: posting,
    source: {
      kind: "auto",
      sourceId: job.source,
      sourceJobId: job.sourceJobId,
      site: job.sourceName,
      url: job.url,
      fetchedAt,
      detailLevel: job.detailLevel,
      hitKeywords: job.hitKeywords,
    },
    applyUrl: job.applyUrl || job.url,
    status: "지원 전",
    memo: "",
    documentsChecked: [],
    saved: false,
    createdAt: fetchedAt,
    updatedAt: fetchedAt,
  };
}

/** 사용자가 손댄 공고인지 — 자동 수집분이라도 이 조건이면 보드에 남기고 브라우저에 저장합니다. */
export function isTrackedJob(job: HubJob): boolean {
  return Boolean(job.saved || job.status !== "지원 전" || job.memo.trim() || job.documentsChecked.length > 0);
}

/** 자동 수집 결과를 기존 보드에 합칩니다. 손댄 공고·직접 추가한 공고는 그대로 둡니다. */
export function mergeCollected(prev: HubJob[], collected: CollectedJob[], fetchedAt: string): HubJob[] {
  const kept = prev.filter((job) => job.source.kind !== "auto" || isTrackedJob(job));
  const keyOf = (value: string) => value.replace(/[\s()[\]{}·,.\-–—_/&]+/g, "").toLowerCase();
  const seen = new Set(kept.flatMap((job) => [
    `${job.source.sourceId ?? job.source.kind}:${job.source.sourceJobId ?? job.id}`,
    `${keyOf(job.job.company)}|${keyOf(job.job.role)}`,
  ]));
  const added: HubJob[] = [];
  for (const job of collected) {
    const next = hubJobFromCollected(job, fetchedAt);
    const idKey = `${job.source}:${job.sourceJobId}`;
    const pairKey = `${keyOf(next.job.company)}|${keyOf(next.job.role)}`;
    if (seen.has(idKey) || seen.has(pairKey)) continue;
    seen.add(idKey);
    seen.add(pairKey);
    added.push(next);
  }
  return [...kept, ...added];
}

/** 마감 문자열을 정렬용 숫자로. 모르는 값은 맨 뒤로 보냅니다. */
export function deadlineRank(deadline: string): number {
  const iso = deadline.match(/^(\d{4})[-./](\d{2})[-./](\d{2})/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const monthDay = deadline.match(/(\d{1,2})\/(\d{1,2})/);
  if (monthDay) {
    const now = new Date();
    const year = Number(monthDay[1]) < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
    return Date.UTC(year, Number(monthDay[1]) - 1, Number(monthDay[2]));
  }
  if (/오늘마감/.test(deadline)) return Date.now();
  if (/내일마감/.test(deadline)) return Date.now() + 86_400_000;
  if (/상시/.test(deadline)) return Number.MAX_SAFE_INTEGER - 1;
  return Number.MAX_SAFE_INTEGER;
}

export const REGION_FILTERS = ["전체", "서울", "경기", "인천", "부산", "대구", "대전", "광주", "기타"] as const;

export const YEAR_FILTERS = ["전체", "신입", "1~4년", "5~9년", "10년↑"] as const;

/** 공고의 경력 표기를 연차 구간으로 */
export function yearsBandOf(experience: string): string {
  const years = parseYearsText(experience);
  if (years.min === null && years.max === null) return "미확인";
  const min = years.min ?? 0;
  const max = years.max;
  if (max !== null && max <= 1) return "신입";
  if (min >= 10 || (max !== null && max >= 10 && min >= 10)) return "10년↑";
  if (min >= 5) return "5~9년";
  if (max !== null && max >= 10) return "5~9년";
  return "1~4년";
}

/** 선택한 경력 구간에 공고가 걸리는지 — 구간이 겹치면 보여 줍니다. */
export function matchesYears(experience: string, band: string): boolean {
  if (!band || band === "전체") return true;
  const years = parseYearsText(experience);
  if (years.min === null && years.max === null) return false;
  const min = years.min ?? 0;
  const max = years.max ?? Number.POSITIVE_INFINITY;
  const bands: Record<string, [number, number]> = {
    "신입": [0, 1],
    "1~4년": [1, 4],
    "5~9년": [5, 9],
    "10년↑": [10, Number.POSITIVE_INFINITY],
  };
  const range = bands[band];
  if (!range) return true;
  return min <= range[1] && max >= range[0];
}

/** 마감까지 남은 날 (D-day) — 색과 문구를 화면에서 그대로 씁니다. */
export interface Dday {
  label: string;
  tone: "over" | "soon" | "ok" | "none";
  days: number | null;
}

const localDayOf = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** 마감 문자열을 날짜로. 읽지 못하면 null. */
export function deadlineDate(deadline: string): Date | null {
  if (!deadline) return null;
  // 2026-12-20 · 2026.12.20 · 2026/12/20
  const full = deadline.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (full) {
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(Number(full[1]), month - 1, day);
  }
  const monthDay = deadline.match(/(?:^|[^\d])(\d{1,2})\s*[\/.월]\s*(\d{1,2})(?:[^\d]|$)/);
  if (monthDay) {
    const now = new Date();
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
      return new Date(year, month - 1, day);
    }
  }
  if (/오늘\s*마감/.test(deadline)) return new Date();
  if (/내일\s*마감/.test(deadline)) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }
  return null;
}

export function ddayOf(deadline: string): Dday {
  if (!deadline) return { label: "마감 미확인", tone: "none", days: null };
  if (/상시/.test(deadline)) return { label: "상시 채용", tone: "none", days: null };
  const date = deadlineDate(deadline);
  if (!date) return { label: deadline.slice(0, 10), tone: "none", days: null };
  const days = Math.round((localDayOf(date) - localDayOf(new Date())) / 86_400_000);
  if (days < 0) return { label: "마감 지남", tone: "over", days };
  if (days === 0) return { label: "오늘 마감", tone: "soon", days };
  if (days === 1) return { label: "내일 마감", tone: "soon", days };
  return { label: `D-${days}`, tone: days <= 7 ? "soon" : "ok", days };
}

export function matchesRegion(location: string, region: string): boolean {
  if (!region || region === "전체") return true;
  const text = location.replace(/\s+/g, " ");
  if (region === "기타") {
    return !/(서울|경기|인천|부산|대구|대전|광주|울산|세종)/.test(text);
  }
  return text.includes(region);
}
