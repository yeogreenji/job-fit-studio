/**
 * GET /api/jobs?q=홍보&limit=36&detail=12   — 실제 채용 공고 자동 수집
 * POST /api/jobs { q, limit, detail }        — 같은 동작 (긴 키워드용)
 * POST /api/jobs { profile: "seoul-inhouse-pr" } — 서울·인하우스·과차장급만 남기는 기본 수집
 *
 * 공개 사이트(리멤버·원티드·사람인·잡코리아)의 공개 응답만 읽습니다. 로그인·키가 필요 없습니다.
 * 10분 캐시로 같은 조건의 반복 요청을 줄입니다 (리멤버는 요청이 몰리면 잠시 막히므로 특히 중요).
 */

import { CollectError, collectJobs, type CollectResult } from "./_collect.js";
import { TARGET_PROFILES } from "./_target.js";

type HeaderValue = string | string[] | undefined;

interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  on?: (event: string, listener: (chunk: unknown) => void) => void;
}

interface ApiResponse {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
  end: (body?: string) => void;
}

const SERVICE = "jobfit-jobs";
const VERSION = "1.0.0";
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 24;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

const cache = new Map<string, { at: number; result: CollectResult }>();

function send(res: ApiResponse, status: number, payload: unknown) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS };
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

const fail = (res: ApiResponse, status: number, code: string, message: string) =>
  send(res, status, { ok: false, error: { code, message } });

function readStream(req: ApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof req.on !== "function") {
      reject(new Error("no stream"));
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += typeof chunk === "string" ? chunk : String(chunk);
    });
    req.on("end", () => resolve(raw));
    req.on("error", () => reject(new Error("stream error")));
  });
}

async function readBody(req: ApiRequest): Promise<Record<string, unknown> | null> {
  let raw = "";
  if (req.body !== undefined && req.body !== null) {
    raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  } else if (typeof req.on === "function") {
    try {
      raw = await readStream(req);
    } catch {
      return null;
    }
  }
  if (!raw.trim()) return {};
  if (raw.length > 8_000) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const intOf = (value: unknown, fallback: number): number => {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^\d]/g, "")) : NaN;
  return Number.isFinite(number) ? number : fallback;
};

function trimCache() {
  if (cache.size <= CACHE_MAX) return;
  const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - CACHE_MAX);
  for (const [key] of oldest) cache.delete(key);
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method === "OPTIONS") {
    for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value);
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method && req.method !== "GET" && req.method !== "POST") {
    fail(res, 405, "method_not_allowed", "GET 또는 POST만 지원합니다.");
    return;
  }

  const url = new URL(req.url ?? "/api/jobs", "https://jobfit.local");
  const body = req.method === "POST" ? await readBody(req) : {};
  if (body === null) {
    fail(res, 400, "bad_body", "요청 본문을 읽지 못했습니다.");
    return;
  }

  const rawQuery =
    (typeof body.q === "string" ? body.q : "") ||
    (typeof body.query === "string" ? body.query : "") ||
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    "";
  const limit = intOf(body.limit ?? url.searchParams.get("limit"), 36);
  const detail = intOf(body.detail ?? url.searchParams.get("detail"), 12);
  const rawProfile =
    (typeof body.profile === "string" ? body.profile : "") || url.searchParams.get("profile") || "";
  const profile = rawProfile.trim() in TARGET_PROFILES ? rawProfile.trim() : "";
  // 내 서류 키워드 수집 — 문자열 배열(최대 6개)만 받습니다.
  const keywordList = Array.isArray(body.keywords)
    ? body.keywords.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean).slice(0, 6)
    : [];
  const keywordsParam = url.searchParams.get("keywords");
  if (!keywordList.length && keywordsParam) {
    keywordList.push(...keywordsParam.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 6));
  }

  if (url.searchParams.get("ping") === "1") {
    send(res, 200, {
      ok: true,
      service: SERVICE,
      version: VERSION,
      sources: ["remember", "wanted", "saramin", "jobkorea"],
      profiles: Object.keys(TARGET_PROFILES),
    });
    return;
  }

  const key = `${profile}|${keywordList.join(",")}|${rawQuery.trim().toLowerCase()}|${limit}|${detail}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    send(res, 200, { ...hit.result, cached: true, service: SERVICE, version: VERSION });
    return;
  }

  try {
    const result = await collectJobs({ query: rawQuery, limit, detailLimit: detail, profile: profile || undefined, keywords: keywordList });
    cache.set(key, { at: Date.now(), result });
    trimCache();
    if (!result.jobs.length) {
      const blocked = result.sources.every((source) => source.note && source.note !== "조건에 맞는 공고가 없습니다");
      send(res, blocked ? 502 : 200, {
        ...result,
        service: SERVICE,
        version: VERSION,
        error: blocked
          ? { code: "sources_blocked", message: "지금은 채용 사이트 응답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요." }
          : { code: "no_result", message: "이 조건에 맞는 공고를 찾지 못했습니다. 다른 직무·키워드로 시도해 보세요." },
      });
      return;
    }
    send(res, 200, { ...result, service: SERVICE, version: VERSION });
  } catch (error) {
    if (error instanceof CollectError) {
      fail(res, error.status, error.code, error.message);
      return;
    }
    fail(res, 502, "collect_failed", error instanceof Error ? error.message.slice(0, 160) : "공고를 모으지 못했습니다.");
  }
}
