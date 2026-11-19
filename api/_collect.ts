/**
 * JobFit Studio — 실제 채용 공고 자동 수집 (서버 전용)
 *
 * 공개 채용 사이트의 공개 목록/검색 응답을 서버에서 직접 읽어, 로그인 없이 볼 수 있는
 * 실제 공고만 돌려줍니다. 더미·예시 공고를 섞지 않습니다.
 *
 * 검증한 소스 (2026-11-19, 서버 fetch 기준 응답 확인)
 *  · 리멤버   — career-api.rememberapp.co.kr /job_postings/search (POST, 로그인 불필요)
 *                응답에 담당 업무·자격 요건·우대 사항 본문이 함께 옵니다.
 *  · 원티드   — /api/v4/jobs (목록·키워드 검색) + /api/v4/jobs/{id} (본문 요건·우대)
 *  · 사람인   — /zf_user/search (목록 HTML: 회사·직무·경력·학력·지역·급여·마감)
 *  · 잡코리아 — /Search/ (목록 HTML: 회사·직무·지역·직무태그·경력)
 *  · 로켓펀치 — Cloudflare 챌린지(403)로 서버 수집 불가 → 사용하지 않음
 *  · 점핏     — 목록 API는 열리지만 키워드가 회사명으로만 걸려 직무 검색에 못 씀 → 사용하지 않음
 *
 * 한 소스가 막히거나 늦어도 나머지 결과로 응답합니다(소스별 상태를 함께 돌려줌).
 *
 * 프로필(profile=seoul-inhouse-pr)로 부르면 여러 검색어를 돌려 모은 뒤,
 * 서울 · 인하우스 홍보/PR · 과차장급만 남기고 왜 몇 건을 걸렀는지 함께 돌려줍니다.
 */

import { companyTypeOf, judgeTarget, profileById, targetScore, type CompanyType, type RejectReason } from "./_target.js";

export type SourceId = "remember" | "wanted" | "saramin" | "jobkorea";

export interface CollectedJob {
  /** "wanted:399106" 처럼 소스+공고번호로 만든 안정적인 키 */
  id: string;
  source: SourceId;
  sourceName: string;
  sourceJobId: string;
  company: string;
  role: string;
  employmentType: string;
  /** "경력 5~8년" · "신입" · "경력무관" */
  experience: string;
  location: string;
  deadline: string;
  salary: string;
  tags: string[];
  responsibilities: string;
  requirements: string;
  preferred: string;
  documents: string;
  /** 원문 공고 주소 */
  url: string;
  /** 원문의 지원 페이지(없으면 원문 공고 주소) */
  applyUrl: string;
  /** full: 본문 요건까지 읽음 · list: 목록 정보만 */
  detailLevel: "full" | "list";
  /** 목록에서 읽은 조건 한 줄 (예: "경력무관 · 고졸↑ · 정규직 · 380만원") */
  conditions: string;
  /* ── 타깃 프로필 판정용 (있으면 화면·필터가 이 값을 씁니다) ── */
  companyType?: CompanyType;
  minYears?: number | null;
  maxYears?: number | null;
  leaderPosition?: boolean;
  headhunter?: boolean;
}

/** 프로필 수집에서 몇 건이 어떤 이유로 빠졌는지 */
export interface FilterReport {
  profile: string;
  label: string;
  /** 거르기 전 모은 건수 */
  raw: number;
  /** 조건에 남은 건수 */
  kept: number;
  excluded: Record<RejectReason, number>;
}

export interface SourceReport {
  id: SourceId;
  name: string;
  ok: boolean;
  count: number;
  ms: number;
  full: number;
  note?: string;
}

export interface CollectResult {
  ok: boolean;
  query: string;
  jobs: CollectedJob[];
  sources: SourceReport[];
  fetchedAt: string;
  cached?: boolean;
  /** 프로필 수집일 때만: 무엇을 남기고 무엇을 걸렀는지 */
  filter?: FilterReport;
}

export class CollectError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CollectError";
    this.status = status;
    this.code = code;
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_BUDGET_MS = 18_000;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function cleanQuery(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f<>"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
}

interface GetResult {
  status: number;
  body: string;
  finalUrl: string;
  /** 429일 때 서버가 알려 준 대기 시간(초) */
  retryAfter?: number;
}

async function postJson(
  url: string,
  body: unknown,
  opts: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<GetResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 9_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
        ...opts.headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const retryAfter = Number(response.headers.get("retry-after") ?? "");
    return {
      status: response.status,
      body: text,
      finalUrl: response.url || url,
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new CollectError(aborted ? 504 : 502, aborted ? "timeout" : "fetch_failed", `${url.split("/")[2] ?? url} 응답 없음`);
  } finally {
    clearTimeout(timer);
  }
}

async function get(url: string, opts: { timeoutMs?: number; accept?: string } = {}): Promise<GetResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 9_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: opts.accept ?? "application/json, text/html;q=0.9, */*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
      },
      signal: controller.signal,
    });
    const body = await response.text();
    return { status: response.status, body, finalUrl: response.url || url };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new CollectError(aborted ? 504 : 502, aborted ? "timeout" : "fetch_failed", `${url.split("/")[2] ?? url} 응답 없음`);
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────────── 글자 정리 ───────────────────────────── */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0\u200b]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

const oneLine = (text: string, limit = 120): string => text.replace(/\s+/g, " ").trim().slice(0, limit);

/** "[이런 분이라면 딱 맞아요.]" 같은 소제목 줄을 걷어내고 본문만 남깁니다. */
function tidyBlock(raw: string): string {
  const lines = raw
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•·▪◦‣\-–—]+/, "").replace(/^[①-⑳]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^\[[^\]]{1,24}\]$/.test(line))
    .slice(0, 14);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2_000);
}

const toKstDate = (value: string): string => {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return trimmed.slice(0, 24);
};

/* ───────────────────────────── 리멤버 ───────────────────────────── */

const REMEMBER_SEARCH = "https://career-api.rememberapp.co.kr/job_postings/search";
const REMEMBER_POSTING = "https://career.rememberapp.co.kr/job/posting";

function rememberExperience(min: number | null, max: number | null): string {
  if (min === null && max === null) return "경력무관";
  if (min !== null && max !== null) return min === max ? `경력 ${min}년` : `경력 ${min}~${max}년`;
  if (min !== null) return min > 0 ? `경력 ${min}년 이상` : "신입·경력";
  return max && max > 0 ? `경력 ${max}년 이하` : "경력무관";
}

function rememberLocation(item: Record<string, unknown>): string {
  const normalized = recordOf(item.normalized_address);
  const level1 = strOf(normalized.level1, 20);
  const level2 = strOf(normalized.level2, 20);
  if (level1) return [level1, level2].filter(Boolean).join(" ");
  const first = Array.isArray(item.addresses) ? recordOf(item.addresses[0]) : {};
  return [strOf(first.address_level1, 20).replace(/특별시|광역시|특별자치시|도$/, "").trim(), strOf(first.address_level2, 20)]
    .filter(Boolean)
    .join(" ");
}

function rememberTags(item: Record<string, unknown>): string[] {
  const categories = Array.isArray(item.job_categories) ? item.job_categories : [];
  const tags = categories
    .map((entry) => {
      const category = recordOf(entry);
      const level1 = strOf(category.level1, 20);
      const level2 = strOf(category.level2, 24);
      return level2 ? `${level1}/${level2}` : level1;
    })
    .filter(Boolean);
  return tags.filter((tag, index) => tags.indexOf(tag) === index).slice(0, 6);
}

function rememberSalary(item: Record<string, unknown>): string {
  const min = numOf(item.min_salary);
  const max = numOf(item.max_salary);
  if (min === null && max === null) return "";
  const fmt = (value: number) => value.toLocaleString("en-US");
  if (min !== null && max !== null) return min === max ? `연봉 ${fmt(min)}만원` : `연봉 ${fmt(min)}~${fmt(max)}만원`;
  if (min !== null) return `연봉 ${fmt(min)}만원 이상`;
  return `연봉 ${fmt(max as number)}만원 이하`;
}

/** 리멤버가 429를 주면 이 시간까지는 다시 부르지 않습니다 (Cloudflare 요청 제한). */
let rememberBlockedUntil = 0;

/** 리멤버 공개 검색 API 한 번 호출 — 실패하면 CollectError로 소스 상태에 남깁니다. */
async function rememberSearch(keyword: string, per: number, page: number, timeoutMs: number): Promise<CollectedJob[]> {
  if (Date.now() < rememberBlockedUntil) {
    throw new CollectError(429, "rate_limited", "리멤버 요청 제한 — 잠시 뒤 다시");
  }
  const searched = await postJson(
    REMEMBER_SEARCH,
    { page, per, search: { keywords: [keyword] } },
    {
      timeoutMs,
      headers: {
        Origin: "https://career.rememberapp.co.kr",
        Referer: "https://career.rememberapp.co.kr/job/postings",
      },
    },
  );
  if (searched.status === 429) {
    // 요청 제한은 몇 분간 이어집니다. 더 부르면 차단만 길어지므로 바로 멈춥니다.
    const waitSeconds = Math.max(60, Math.min(300, searched.retryAfter ?? 120));
    rememberBlockedUntil = Date.now() + waitSeconds * 1_000;
    throw new CollectError(429, "rate_limited", `리멤버 요청 제한 — ${waitSeconds}초 뒤 다시`);
  }
  if (searched.status !== 200) throw new CollectError(502, "upstream", `리멤버 HTTP ${searched.status}`);
  let payload: unknown;
  try {
    payload = JSON.parse(searched.body);
  } catch {
    throw new CollectError(502, "bad_json", "리멤버 응답을 해석하지 못했습니다");
  }
  const items = Array.isArray(recordOf(payload).data) ? (recordOf(payload).data as unknown[]) : [];
  const jobs: CollectedJob[] = [];
  for (const raw of items) {
    const item = recordOf(raw);
    const id = numOf(item.id);
    if (!id) continue;
    const organization = recordOf(item.organization);
    const company = strOf(organization.name, 80);
    const role = strOf(item.title, 120);
    if (!company || !role) continue;
    const minYears = numOf(item.min_experience);
    const maxYears = numOf(item.max_experience);
    const location = rememberLocation(item);
    const tags = rememberTags(item);
    const externalApply = strOf(item.link, 500);
    const url = `${REMEMBER_POSTING}/${id}`;
    const headhunter = organization.headhunter === true;
    const leader = item.leader_position === true || strOf(item.job_rank_category, 20) !== "";
    const experience = rememberExperience(minYears, maxYears);
    const requirements = tidyBlock(String(item.qualifications ?? ""));
    const responsibilities = tidyBlock(String(item.job_description ?? ""));
    const preferred = tidyBlock(String(item.preferred_qualifications ?? ""));
    const salary = rememberSalary(item);
    const ends = item.explicit_due === false ? "상시" : toKstDate(String(item.ends_at ?? ""));
    jobs.push({
      id: `remember:${id}`,
      source: "remember",
      sourceName: "리멤버",
      sourceJobId: String(id),
      company,
      role,
      employmentType: "",
      experience,
      location,
      deadline: ends || "상시",
      salary,
      tags,
      responsibilities,
      requirements,
      preferred,
      documents: "",
      url,
      applyUrl: /^https?:\/\//.test(externalApply) ? externalApply : url,
      detailLevel: requirements || responsibilities ? "full" : "list",
      conditions: [experience, leader ? "리더급" : "", location, salary].filter(Boolean).join(" · "),
      companyType: companyTypeOf(company, role, headhunter),
      minYears,
      maxYears,
      leaderPosition: leader,
      headhunter,
    });
  }
  return jobs;
}

/** 여러 검색어를 돌려 리멤버에서 모읍니다. 한 검색어가 실패해도 나머지는 살립니다. */
async function collectRemember(keywords: string[], per: number, deadline: number, pages = 1): Promise<CollectedJob[]> {
  const seen = new Set<string>();
  const jobs: CollectedJob[] = [];
  const queue: { keyword: string; page: number }[] = [];
  keywords.forEach((keyword, index) => {
    // 첫 검색어만 두 페이지까지 읽고 나머지는 한 페이지 — 요청 수를 줄여 요청 제한을 피합니다.
    const depth = index === 0 ? Math.max(1, pages) : 1;
    for (let page = 1; page <= depth; page += 1) queue.push({ keyword, page });
  });
  let firstError = "";
  let answered = 0;
  // 순서대로, 요청 사이에 짧은 간격을 두고 부릅니다. 429가 오면 남은 검색어는 건너뜁니다.
  while (queue.length) {
    const next = queue.shift();
    if (!next) break;
    if (Date.now() > deadline) break;
    if (Date.now() < rememberBlockedUntil) {
      if (!firstError) firstError = "리멤버 요청 제한 — 잠시 뒤 다시";
      break;
    }
    try {
      const found = await rememberSearch(
        next.keyword,
        per,
        next.page,
        Math.max(4_000, Math.min(9_000, deadline - Date.now())),
      );
      answered += 1;
      for (const job of found) {
        if (seen.has(job.sourceJobId)) continue;
        seen.add(job.sourceJobId);
        jobs.push(job);
      }
    } catch (error) {
      if (!firstError) firstError = error instanceof CollectError ? error.message : "리멤버 응답을 읽지 못했습니다";
      if (error instanceof CollectError && error.code === "rate_limited") break;
    }
    await new Promise((resolve) => setTimeout(resolve, 160));
  }
  if (!answered && firstError) throw new CollectError(429, "rate_limited", firstError);
  return jobs;
}

/* ───────────────────────────── 원티드 ───────────────────────────── */

const WANTED_LIST = "https://www.wanted.co.kr/api/v4/jobs";
const WANTED_DETAIL = "https://www.wanted.co.kr/api/v4/jobs";
const WANTED_JOB = "https://www.wanted.co.kr/wd";

const recordOf = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const strOf = (value: unknown, limit = 200): string => (typeof value === "string" ? oneLine(value, limit) : "");
const numOf = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function wantedExperience(from: number | null, to: number | null): string {
  if (from === null && to === null) return "";
  if ((from ?? 0) === 0 && (to === null || to === 0 || to >= 100)) return "경력무관";
  if (to !== null && to >= 100) return from && from > 0 ? `경력 ${from}년 이상` : "경력무관";
  if (!from && to) return to > 0 ? `신입·경력 ${to}년 이하` : "신입";
  if (from !== null && to !== null) return from === to ? `경력 ${from}년` : `경력 ${from}~${to}년`;
  return from ? `경력 ${from}년 이상` : "";
}

function wantedLocation(item: Record<string, unknown>): string {
  const address = recordOf(item.address);
  return [strOf(address.location, 20), strOf(address.district, 20)].filter(Boolean).join(" ").trim();
}

async function collectWanted(
  query: string,
  want: number,
  detailLimit: number,
  deadline: number,
): Promise<CollectedJob[]> {
  const params = new URLSearchParams({
    country: "kr",
    job_sort: "job.latest_order",
    limit: String(clamp(want, 6, 24)),
    offset: "0",
  });
  if (query) params.set("query", query);
  const listed = await get(`${WANTED_LIST}?${params.toString()}`, { timeoutMs: 8_000 });
  if (listed.status !== 200) throw new CollectError(502, "upstream", `원티드 HTTP ${listed.status}`);
  let data: unknown;
  try {
    data = JSON.parse(listed.body);
  } catch {
    throw new CollectError(502, "bad_json", "원티드 응답을 해석하지 못했습니다");
  }
  const items = Array.isArray(recordOf(data).data) ? (recordOf(data).data as unknown[]) : [];
  const jobs: CollectedJob[] = [];
  for (const raw of items) {
    const item = recordOf(raw);
    const id = numOf(item.id);
    if (!id) continue;
    const company = strOf(recordOf(item.company).name, 60);
    const role = strOf(item.position, 80);
    if (!company && !role) continue;
    const url = `${WANTED_JOB}/${id}`;
    jobs.push({
      id: `wanted:${id}`,
      source: "wanted",
      sourceName: "원티드",
      sourceJobId: String(id),
      company,
      role,
      employmentType: "",
      experience: wantedExperience(numOf(item.annual_from), numOf(item.annual_to)),
      location: wantedLocation(item),
      deadline: item.due_time ? toKstDate(String(item.due_time)) : "상시",
      salary: "",
      tags: [],
      responsibilities: "",
      requirements: "",
      preferred: "",
      documents: "",
      url,
      applyUrl: url,
      detailLevel: "list",
      conditions: "",
      companyType: companyTypeOf(company, role),
    });
  }

  // 본문(담당 업무·자격 요건·우대 사항)은 상세 API에서만 옵니다. 앞쪽 공고만 병렬로 읽습니다.
  await enrichWantedDetail(jobs, detailLimit, deadline);
  return jobs;
}

/** 원티드 목록만 받은 공고의 본문 요건을 상세 API로 채웁니다. */
async function enrichWantedDetail(jobs: CollectedJob[], detailLimit: number, deadline: number): Promise<void> {
  const targets = jobs.slice(0, clamp(detailLimit, 0, 20));
  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      if (Date.now() > deadline) return;
      const job = targets[cursor++];
      try {
        const detail = await get(`${WANTED_DETAIL}/${job.sourceJobId}`, { timeoutMs: 6_500 });
        if (detail.status !== 200) continue;
        const parsed = recordOf(JSON.parse(detail.body));
        const body = recordOf(recordOf(parsed.job).detail);
        const mainTasks = tidyBlock(String(body.main_tasks ?? ""));
        const requirements = tidyBlock(String(body.requirements ?? ""));
        const preferred = tidyBlock(String(body.preferred_points ?? ""));
        if (!mainTasks && !requirements && !preferred) continue;
        job.responsibilities = mainTasks;
        job.requirements = requirements;
        job.preferred = preferred;
        job.detailLevel = "full";
        const skillTags = Array.isArray(recordOf(parsed.job).skill_tags) ? (recordOf(parsed.job).skill_tags as unknown[]) : [];
        job.tags = skillTags.map((tag) => strOf(recordOf(tag).title ?? tag, 20)).filter(Boolean).slice(0, 6);
        const yearly = recordOf(parsed.job).annual_to;
        if (!job.experience && yearly !== undefined) {
          job.experience = wantedExperience(numOf(recordOf(parsed.job).annual_from), numOf(yearly));
        }
      } catch {
        /* 상세가 막히면 목록 정보만 남깁니다 */
      }
    }
  };
  await Promise.all([0, 1, 2, 3].map(worker));
}

/* ───────────────────────────── 검색어 걸러내기 ───────────────────────────── */

/**
 * 사람인·잡코리아 검색은 단어 일부만 겹쳐도 결과를 내놓습니다(예: '보도자료' → IR/공시).
 * 제목·직무태그·회사명에 검색어(또는 앞 두 글자)가 실제로 들어 있는 공고만 남깁니다.
 */
function queryTokens(query: string): string[] {
  const tokens = new Set<string>();
  for (const raw of query.split(/[\s,·/]+/)) {
    const token = raw.trim().toLowerCase();
    if (token.length < 2) continue;
    tokens.add(token);
    if (token.length >= 3) tokens.add(token.slice(0, 2));
  }
  return [...tokens];
}

function matchesQuery(text: string, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const haystack = text.toLowerCase().replace(/\s+/g, " ");
  return tokens.some((token) => haystack.includes(token));
}

/* ───────────────────────────── 사람인 ───────────────────────────── */

const SARAMIN_SEARCH = "https://www.saramin.co.kr/zf_user/search";
const SARAMIN_BASE = "https://www.saramin.co.kr";

function firstMatch(text: string, pattern: RegExp): string {
  return pattern.exec(text)?.[1] ?? "";
}

function saraminConditions(block: string): string[] {
  const box = firstMatch(block, /<div class="job_condition">([\s\S]*?)<\/div>/);
  if (!box) return [];
  return [...box.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)]
    .map((match) => stripTags(match[1] ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function saraminTags(block: string): string[] {
  const box = firstMatch(block, /<div class="job_sector">([\s\S]*?)<\/div>/);
  if (!box) return [];
  return [...box.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)]
    .map((match) => stripTags(match[1] ?? "").replace(/\s+/g, " ").trim())
    .filter((tag) => tag.length > 1 && tag.length < 20)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 8);
}

async function collectSaramin(query: string, want: number, deadline: number): Promise<CollectedJob[]> {
  if (!query) return [];
  const params = new URLSearchParams({
    searchword: query,
    search_done: "y",
    search_optional_item: "n",
    searchType: "search",
    recruitPage: "1",
    recruitPageCount: String(clamp(want, 10, 40)),
  });
  const listed = await get(`${SARAMIN_SEARCH}?${params.toString()}`, {
    timeoutMs: Math.max(6_000, Math.min(12_000, deadline - Date.now())),
    accept: "text/html,application/xhtml+xml",
  });
  if (listed.status !== 200) throw new CollectError(502, "upstream", `사람인 HTTP ${listed.status}`);

  const blocks = listed.body.split('<div class="item_recruit"').slice(1);
  const tokens = queryTokens(query);
  const jobs: CollectedJob[] = [];
  for (const block of blocks) {
    const sourceJobId = firstMatch(block, /value="(\d{6,})"/);
    const href = decodeEntities(firstMatch(block, /href="([^"]*\/zf_user\/jobs\/relay\/view[^"]*)"/));
    if (!sourceJobId || !href) continue;
    const title = decodeEntities(firstMatch(block, /<h2 class="job_tit">[\s\S]*?<a[^>]*title="([^"]*)"/)) ||
      stripTags(firstMatch(block, /<h2 class="job_tit">([\s\S]*?)<\/h2>/));
    const company = stripTags(firstMatch(block, /class="corp_name"[^>]*>([\s\S]*?)<\/strong>/));
    if (!title || !company) continue;
    const conditions = saraminConditions(block);
    const tags = saraminTags(block);
    const deadlineText = oneLine(stripTags(firstMatch(block, /class="date">([\s\S]*?)<\/span>/)), 24);
    const location = conditions[0] && !/경력|신입|정규직|계약직|인턴|학력|고졸|대졸|만원/.test(conditions[0]) ? conditions[0] : "";
    const experience = conditions.find((item) => /경력|신입/.test(item)) ?? "";
    const education = conditions.find((item) => /고졸|대졸|초대졸|석사|박사|학력/.test(item)) ?? "";
    const employment = conditions.find((item) => /정규직|계약직|인턴|아르바이트|프리랜서|파견/.test(item)) ?? "";
    const salary = conditions.find((item) => /만원|연봉/.test(item)) ?? "";
    const url = new URL(`/zf_user/jobs/relay/view?rec_idx=${sourceJobId}`, SARAMIN_BASE).toString();
    if (!matchesQuery(`${title} ${company} ${tags.join(" ")}`, tokens)) continue;
    jobs.push({
      id: `saramin:${sourceJobId}`,
      source: "saramin",
      sourceName: "사람인",
      sourceJobId,
      company: oneLine(company, 60),
      role: oneLine(title, 90),
      employmentType: employment,
      experience,
      location,
      deadline: deadlineText.replace(/^~\s*/, ""),
      salary,
      tags,
      responsibilities: "",
      requirements: "",
      preferred: "",
      documents: "",
      url,
      applyUrl: url,
      detailLevel: "list",
      conditions: [experience, education, employment, salary].filter(Boolean).join(" · "),
      companyType: companyTypeOf(oneLine(company, 60), oneLine(title, 90)),
    });
  }
  return jobs;
}

/* ───────────────────────────── 잡코리아 ───────────────────────────── */

const JOBKOREA_SEARCH = "https://www.jobkorea.co.kr/Search/";


function spanByClass(block: string, className: string): string {
  const pattern = new RegExp(`<span[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/span>`, "i");
  return oneLine(stripTags(firstMatch(block, pattern)), 90);
}

/** 카드 HTML을 | 로 나눈 짧은 글자 조각들 — 위치·직무태그·경력·마감 배지를 순서대로 읽습니다. */
function jobkoreaParts(block: string): string[] {
  const cleaned = block
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "|");
  return decodeEntities(cleaned)
    .split("|")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const REGION = /^(서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)(\s|$)/;

async function collectJobkorea(query: string, want: number, deadline: number): Promise<CollectedJob[]> {
  if (!query) return [];
  const params = new URLSearchParams({ stext: query, tabType: "recruit", Page_No: "1" });
  const listed = await get(`${JOBKOREA_SEARCH}?${params.toString()}`, {
    timeoutMs: Math.max(6_000, Math.min(12_000, deadline - Date.now())),
    accept: "text/html,application/xhtml+xml",
  });
  if (listed.status !== 200) throw new CollectError(502, "upstream", `잡코리아 HTTP ${listed.status}`);

  const blocks = listed.body.split('data-sentry-component="CardJob"').slice(1);
  const tokens = queryTokens(query);
  const jobs: CollectedJob[] = [];
  for (const block of blocks) {
    const href = decodeEntities(firstMatch(block, /href="(https:\/\/www\.jobkorea\.co\.kr\/Recruit\/GI_Read\/\d+)/));
    const sourceJobId = firstMatch(href, /GI_Read\/(\d+)/);
    if (!href || !sourceJobId || jobs.some((job) => job.sourceJobId === sourceJobId)) continue;
    const role = spanByClass(block, "text-typo-b1-18");
    const company = spanByClass(block, "text-typo-b2-16");
    if (!role || !company) continue;
    const parts = jobkoreaParts(block);
    const location = parts.find((part) => REGION.test(part) && part.length <= 30) ?? "";
    const tagLine = parts.find((part) => part.includes(",") && part.length <= 80 && !/지원|스크랩|채용/.test(part));
    const tags = tagLine
      ? tagLine
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 1 && tag.length < 20)
          .slice(0, 6)
      : [];
    const experience =
      parts.find((part) => /^(신입·경력|경력무관|신입|경력\s*\d*\s*년[↑이상\s]*|경력)$/.test(part)) ??
      (parts.some((part) => /신입·경력/.test(part)) ? "신입·경력" : "");
    const employmentType = parts.find((part) => /^(정규직|계약직|인턴|아르바이트|프리랜서)$/.test(part)) ?? "";
    const deadlinePart = parts.find((part) => /^D-\d+$/.test(part) || /^(오늘|내일)마감$/.test(part)) ?? "";
    if (!matchesQuery(`${role} ${company} ${tags.join(" ")}`, tokens)) continue;
    jobs.push({
      id: `jobkorea:${sourceJobId}`,
      source: "jobkorea",
      sourceName: "잡코리아",
      sourceJobId,
      company: oneLine(company, 60),
      role: oneLine(role, 90),
      employmentType,
      experience,
      location,
      deadline: deadlinePart,
      salary: "",
      tags,
      responsibilities: "",
      requirements: "",
      preferred: "",
      documents: "",
      url: href,
      applyUrl: href,
      detailLevel: "list",
      conditions: [experience, employmentType, location].filter(Boolean).join(" · "),
      companyType: companyTypeOf(oneLine(company, 60), oneLine(role, 90)),
    });
  }
  return jobs.slice(0, want);
}

/* ───────────────────────────── 합치기 ───────────────────────────── */

const normKey = (text: string): string =>
  text
    .replace(/\(주\)|㈜|주식회사|\(유\)|㈜/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s\[\]{}·,.\-–—_/&]+/g, "")
    .toLowerCase();

/** 같은 공고가 두 소스에 있으면 먼저 읽은 쪽만 남깁니다. */
function dedupe(groups: CollectedJob[][], limit: number): CollectedJob[] {
  const seen = new Set<string>();
  const out: CollectedJob[] = [];
  let index = 0;
  let added = true;
  while (added && out.length < limit) {
    added = false;
    groups.forEach((group) => {
      const job = group[index];
      if (!job) return;
      added = true;
      const key = `${job.source}:${job.sourceJobId}`;
      const crossKey = `${normKey(job.company)}|${normKey(job.role)}`;
      if (seen.has(key) || seen.has(crossKey)) return;
      seen.add(key);
      seen.add(crossKey);
      out.push(job);
    });
    index += 1;
  }
  return out.slice(0, limit);
}

export interface CollectOptions {
  query: string;
  limit?: number;
  detailLimit?: number;
  budgetMs?: number;
  /** 기본 수집 타깃 프로필 id (예: seoul-inhouse-pr) */
  profile?: string;
}

interface SourceTask {
  id: SourceId;
  name: string;
  run: () => Promise<CollectedJob[]>;
}

interface SettledSource {
  task: SourceTask;
  jobs: CollectedJob[];
  ms: number;
  error: string;
}

async function runTasks(tasks: SourceTask[]): Promise<SettledSource[]> {
  return Promise.all(
    tasks.map(async (task) => {
      const t0 = Date.now();
      try {
        const jobs = await task.run();
        return { task, jobs, ms: Date.now() - t0, error: "" };
      } catch (error) {
        const message = error instanceof CollectError ? error.message : "응답을 읽지 못했습니다";
        return { task, jobs: [] as CollectedJob[], ms: Date.now() - t0, error: message.slice(0, 120) };
      }
    }),
  );
}

/** 모은 순서(소스 교차)를 지키면서 같은 공고를 한 번만 남깁니다. */
function dedupeFlat(jobs: CollectedJob[], limit: number): CollectedJob[] {
  const seen = new Set<string>();
  const out: CollectedJob[] = [];
  for (const job of jobs) {
    if (out.length >= limit) break;
    const key = `${job.source}:${job.sourceJobId}`;
    const crossKey = `${normKey(job.company)}|${normKey(job.role)}`;
    if (seen.has(key) || seen.has(crossKey)) continue;
    seen.add(key);
    seen.add(crossKey);
    out.push(job);
  }
  return out;
}

/** 프로필 수집: 여러 검색어로 모은 뒤 타깃 조건만 남깁니다. */
async function collectProfiled(
  profile: NonNullable<ReturnType<typeof profileById>>,
  options: { limit: number; detailLimit: number; budgetMs: number },
): Promise<CollectResult> {
  const started = Date.now();
  const budget = clamp(options.budgetMs, 8_000, 25_000);
  const deadline = started + budget;
  const keywords = profile.keywords;
  const perSource = clamp(Math.ceil(options.limit / 2) + 6, 12, 30);

  const tasks: SourceTask[] = [
    { id: "remember", name: "리멤버", run: () => collectRemember(keywords, 30, deadline, 2) },
    {
      id: "wanted",
      name: "원티드",
      run: async () => {
        const groups = await Promise.all(
          keywords.map((keyword) =>
            collectWanted(keyword, 18, 0, deadline).catch(() => [] as CollectedJob[]),
          ),
        );
        return groups.flat();
      },
    },
    {
      id: "saramin",
      name: "사람인",
      run: async () => {
        const groups = await Promise.all(
          ["홍보", "언론홍보"].map((keyword) =>
            collectSaramin(keyword, perSource, deadline).catch(() => [] as CollectedJob[]),
          ),
        );
        return groups.flat();
      },
    },
    {
      id: "jobkorea",
      name: "잡코리아",
      run: async () => {
        const groups = await Promise.all(
          ["홍보", "대외협력"].map((keyword) =>
            collectJobkorea(keyword, perSource, deadline).catch(() => [] as CollectedJob[]),
          ),
        );
        return groups.flat();
      },
    },
  ];

  const settled = await runTasks(tasks);
  const rawBySource = new Map<SourceId, number>();
  for (const entry of settled) rawBySource.set(entry.task.id, entry.jobs.length);

  const excluded: Record<RejectReason, number> = { region: 0, role: 0, junior: 0, agency: 0 };
  const kept: CollectedJob[] = [];
  const scored: { job: CollectedJob; score: number }[] = [];
  const all = settled.flatMap((entry) => entry.jobs);
  const rawCount = new Set(all.map((job) => `${job.source}:${job.sourceJobId}`)).size;

  for (const job of all) {
    const verdict = judgeTarget(
      {
        company: job.company,
        role: job.role,
        location: job.location,
        experience: job.experience,
        tags: job.tags,
        conditions: job.conditions,
        minYears: job.minYears,
        maxYears: job.maxYears,
        leaderPosition: job.leaderPosition,
        headhunter: job.headhunter,
      },
      profile,
    );
    job.companyType = verdict.companyType;
    if (!verdict.ok) {
      excluded[verdict.reason] += 1;
      continue;
    }
    kept.push(job);
    scored.push({ job, score: targetScore(verdict, job.role) });
  }

  scored.sort((a, b) => b.score - a.score);
  const ordered = dedupeFlat(
    scored.map((entry) => entry.job),
    options.limit,
  );

  // 걸러낸 뒤 남은 원티드 공고만 본문을 읽습니다 (시간을 아끼려고).
  const wantedTargets = ordered.filter((job) => job.source === "wanted");
  if (wantedTargets.length && detailLimitSafe(options.detailLimit) > 0) {
    const wantIds = new Set(wantedTargets.slice(0, clamp(options.detailLimit, 0, 12)).map((job) => job.id));
    await enrichWantedDetail(
      ordered.filter((job) => wantIds.has(job.id)),
      wantIds.size,
      deadline + 2_000,
    );
  }

  const reports: SourceReport[] = settled.map((entry) => {
    const own = ordered.filter((job) => job.source === entry.task.id);
    const raw = rawBySource.get(entry.task.id) ?? 0;
    return {
      id: entry.task.id,
      name: entry.task.name,
      ok: !entry.error,
      count: own.length,
      full: own.filter((job) => job.detailLevel === "full").length,
      ms: entry.ms,
      note: entry.error || (own.length ? `원본 ${raw}건 → 조건 ${own.length}건` : `원본 ${raw}건 · 조건에 맞는 공고 없음`),
    };
  });

  return {
    ok: ordered.length > 0,
    query: profile.label,
    jobs: ordered,
    sources: reports,
    fetchedAt: new Date().toISOString(),
    filter: {
      profile: profile.id,
      label: profile.label,
      raw: rawCount,
      kept: kept.length,
      excluded,
    },
  };
}

const detailLimitSafe = (value: number): number => clamp(Math.round(value ?? 8), 0, 20);

export async function collectJobs(options: CollectOptions): Promise<CollectResult> {
  const profile = profileById(options.profile ? cleanQuery(options.profile) : "");
  if (profile) {
    return collectProfiled(profile, {
      limit: clamp(Math.round(options.limit ?? 60), 6, 60),
      detailLimit: clamp(Math.round(options.detailLimit ?? 8), 0, 12),
      budgetMs: options.budgetMs ?? 20_000,
    });
  }

  const query = cleanQuery(options.query);
  const limit = clamp(Math.round(options.limit ?? 36), 6, 60);
  const detailLimit = clamp(Math.round(options.detailLimit ?? 12), 0, 20);
  const started = Date.now();
  const deadline = started + clamp(options.budgetMs ?? DEFAULT_BUDGET_MS, 3_000, 25_000);
  const perSource = clamp(Math.ceil(limit / 2) + 4, 10, 40);

  const tasks: SourceTask[] = [
    { id: "wanted", name: "원티드", run: () => collectWanted(query, limit, detailLimit, deadline) },
  ];
  if (query) {
    tasks.push({ id: "remember", name: "리멤버", run: () => collectRemember([query], 24, deadline) });
    tasks.push({ id: "saramin", name: "사람인", run: () => collectSaramin(query, perSource, deadline) });
    tasks.push({ id: "jobkorea", name: "잡코리아", run: () => collectJobkorea(query, perSource, deadline) });
  }

  const settled = await runTasks(tasks);

  const reports: SourceReport[] = settled.map((entry) => ({
    id: entry.task.id,
    name: entry.task.name,
    ok: !entry.error && entry.jobs.length > 0,
    count: entry.jobs.length,
    full: entry.jobs.filter((job) => job.detailLevel === "full").length,
    ms: entry.ms,
    note: entry.error || (entry.jobs.length ? undefined : "조건에 맞는 공고가 없습니다"),
  }));

  const jobs = dedupe(
    settled.map((entry) => entry.jobs),
    limit,
  );

  // 화면에 실제로 올라간 건수로 다시 셉니다 (중복·순서 조정 뒤).
  const shown: SourceReport[] = reports.map((report) => {
    const own = jobs.filter((job) => job.source === report.id);
    return { ...report, count: own.length, full: own.filter((job) => job.detailLevel === "full").length };
  });

  return {
    ok: jobs.length > 0,
    query,
    jobs,
    sources: shown,
    fetchedAt: new Date().toISOString(),
  };
}
