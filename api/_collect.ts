/**
 * JobFit Studio — 실제 채용 공고 자동 수집 (서버 전용)
 *
 * 공개 채용 사이트의 공개 목록/검색 응답을 서버에서 직접 읽어, 로그인 없이 볼 수 있는
 * 실제 공고만 돌려줍니다. 더미·예시 공고를 섞지 않습니다.
 *
 * 검증한 소스 (2026-11-19, 서버 fetch 기준 응답 확인)
 *  · 원티드   — /api/v4/jobs (목록·키워드 검색) + /api/v4/jobs/{id} (본문 요건·우대)
 *  · 사람인   — /zf_user/search (목록 HTML: 회사·직무·경력·학력·지역·급여·마감)
 *  · 잡코리아 — /Search/ (목록 HTML: 회사·직무·지역·직무태그·경력)
 *  · 로켓펀치 — Cloudflare 챌린지(403)로 서버 수집 불가 → 사용하지 않음
 *  · 점핏     — 목록 API는 열리지만 키워드가 회사명으로만 걸려 직무 검색에 못 씀 → 사용하지 않음
 *
 * 한 소스가 막히거나 늦어도 나머지 결과로 응답합니다(소스별 상태를 함께 돌려줌).
 */

export type SourceId = "wanted" | "saramin" | "jobkorea";

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
    });
  }

  // 본문(담당 업무·자격 요건·우대 사항)은 상세 API에서만 옵니다. 앞쪽 공고만 병렬로 읽습니다.
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
  return jobs;
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
    });
  }
  return jobs.slice(0, want);
}

/* ───────────────────────────── 합치기 ───────────────────────────── */

const normKey = (text: string): string => text.replace(/[\s()[\]{}·,.\-–—_/&]+/g, "").toLowerCase();

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
}

export async function collectJobs(options: CollectOptions): Promise<CollectResult> {
  const query = cleanQuery(options.query);
  const limit = clamp(Math.round(options.limit ?? 36), 6, 60);
  const detailLimit = clamp(Math.round(options.detailLimit ?? 12), 0, 20);
  const started = Date.now();
  const deadline = started + clamp(options.budgetMs ?? DEFAULT_BUDGET_MS, 3_000, 25_000);
  const perSource = clamp(Math.ceil(limit / 2) + 4, 10, 40);

  const tasks: { id: SourceId; name: string; run: () => Promise<CollectedJob[]> }[] = [
    { id: "wanted", name: "원티드", run: () => collectWanted(query, limit, detailLimit, deadline) },
  ];
  if (query) {
    tasks.push({ id: "saramin", name: "사람인", run: () => collectSaramin(query, perSource, deadline) });
    tasks.push({ id: "jobkorea", name: "잡코리아", run: () => collectJobkorea(query, perSource, deadline) });
  }

  const settled = await Promise.all(
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
