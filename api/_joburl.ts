/**
 * 채용 공고 URL에서 공고 본문을 가져와 문단으로 나눕니다.
 *
 * - 서버에서만 실행됩니다(브라우저 CORS 우회). 응답은 12초·1.8MB로 제한합니다.
 * - 사설망·로컬 주소는 SSRF 방지를 위해 막습니다. 테스트에서만 JOBFIT_ALLOW_LOCAL_FETCH=1로 풉니다.
 * - 결과는 항상 "페이지에서 실제로 읽은 글자"에서만 만듭니다. 없는 회사·직무를 지어내지 않습니다.
 */

export const MAX_BYTES = 1_800_000;
export const MAX_CHARS = 6_000;
const TIMEOUT_MS = 12_000;

export class UrlError extends Error {
  status: number;
  code: string;
  site?: string;
  excerpt?: string;
  constructor(status: number, code: string, message: string, extra?: { site?: string; excerpt?: string }) {
    super(message);
    this.name = "UrlError";
    this.status = status;
    this.code = code;
    this.site = extra?.site;
    this.excerpt = extra?.excerpt;
  }
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  site: string;
  title: string;
  description: string;
  text: string;
  html: string;
  ld: Record<string, unknown> | null;
}

export interface ExtractedJob {
  company: string;
  role: string;
  employmentType: string;
  location: string;
  deadline: string;
  responsibilities: string;
  requirements: string;
  preferred: string;
  /** 제출서류·필수 제출 항목 */
  documents: string;
  tone: string;
  /** 원문 공고의 직접 지원 링크 */
  applyUrl: string;
  /** 원문 지원 버튼 문구 */
  applyLabel: string;
}

const SITES: { test: RegExp; label: string }[] = [
  { test: /(^|\.)wanted\.co\.kr$/, label: "원티드" },
  { test: /(^|\.)jobkorea\.co\.kr$/, label: "잡코리아" },
  { test: /(^|\.)saramin\.co\.kr$/, label: "사람인" },
  { test: /(^|\.)rememberapp\.co\.kr$/, label: "리멤버" },
  { test: /(^|\.)linkedin\.com$/, label: "링크드인" },
  { test: /(^|\.)notion\.(site|so)$/, label: "노션" },
  { test: /(^|\.)greenhouse\.io$/, label: "그린하우스" },
  { test: /(^|\.)lever\.co$/, label: "리버" },
  { test: /(^|\.)workday\.com$/, label: "워크데이" },
  { test: /(^|\.)ashbyhq\.com$/, label: "애쉬비" },
  { test: /(^|\.)incruit\.com$/, label: "인크루트" },
  { test: /(^|\.)programmers\.co\.kr$/, label: "프로그래머스" },
  { test: /(^|\.)jumpit\.co\.kr$/, label: "점핏" },
  { test: /(^|\.)rocketpunch\.com$/, label: "로켓펀치" },
  { test: /(^|\.)toss\.im$/, label: "토스" },
];

export function siteOf(hostname: string): string {
  const host = hostname.toLowerCase();
  const found = SITES.find((site) => site.test.test(host));
  if (found) return found.label;
  return host.replace(/^www\./, "");
}

const PRIVATE_V4 = /^(10\.|127\.|0\.0\.0\.0|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return PRIVATE_V4.test(host) || host === "255.255.255.255";
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

function allowLocal(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return env.JOBFIT_ALLOW_LOCAL_FETCH === "1";
}

export function parseJobUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new UrlError(400, "bad_url", "공고 URL을 입력해 주세요.");
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    throw new UrlError(400, "bad_url", "http 또는 https 주소만 불러올 수 있습니다.");
  }
  let url: URL;
  try {
    url = new URL(scheme ? trimmed : `https://${trimmed}`);
  } catch {
    throw new UrlError(400, "bad_url", "URL 형식을 확인해 주세요. https://로 시작하는 주소를 붙여넣어 주세요.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlError(400, "bad_url", "http 또는 https 주소만 불러올 수 있습니다.");
  }
  if (url.username || url.password) throw new UrlError(400, "bad_url", "로그인 정보가 포함된 주소는 불러올 수 없습니다.");
  if (isPrivateHost(url.hostname) && !allowLocal()) {
    throw new UrlError(400, "bad_url", "사내망·로컬 주소는 불러올 수 없습니다. 공개된 공고 주소를 사용해 주세요.");
  }
  return url;
}

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
  copy: "©",
  reg: "®",
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return " ";
  try {
    return String.fromCodePoint(code);
  } catch {
    return " ";
  }
}

function metaContent(html: string, key: string): string {
  const pattern = new RegExp(`<meta[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const tag = html.match(pattern)?.[0];
  if (!tag) return "";
  const content = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return decodeEntities(content?.[1] ?? content?.[2] ?? "").trim();
}

function extractJsonLd(html: string): Record<string, unknown> | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        const type = record["@type"];
        const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];
        if (types.some((entry) => entry.toLowerCase() === "jobposting")) return record;
        if (Array.isArray(record["@graph"])) queue.push(...(record["@graph"] as unknown[]));
      }
    } catch {
      /* 다음 블록 시도 */
    }
  }
  return null;
}

function htmlToText(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|canvas)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|dd|dt|ul|ol|table|header|footer|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(cleaned)
    .replace(/[ \t\u00a0\u200b]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line.length > 0 || (all[index - 1] ?? "").length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchJobPage(rawUrl: string): Promise<FetchedPage> {
  const url = parseJobUrl(rawUrl);
  const site = siteOf(url.hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new UrlError(
      422,
      "fetch_failed",
      aborted
        ? `${site} 응답이 12초 안에 오지 않았습니다. 공고 본문을 붙여넣어 주세요.`
        : `${site} 페이지를 열지 못했습니다. 주소가 맞는지 확인하거나 본문을 붙여넣어 주세요.`,
      { site },
    );
  }
  clearTimeout(timer);

  const finalUrl = response.url || url.toString();
  if (!allowLocal()) {
    try {
      if (isPrivateHost(new URL(finalUrl).hostname)) {
        throw new UrlError(400, "bad_url", "사설망 주소로 이동하는 링크는 불러올 수 없습니다.", { site });
      }
    } catch (error) {
      if (error instanceof UrlError) throw error;
    }
  }

  if (!response.ok) {
    // 차단 페이지라도 본문 일부가 있으면 붙여넣기 칸에 미리 넣어 줍니다.
    let excerpt = "";
    try {
      const body = await response.text();
      const partial = htmlToText(body.slice(0, 200_000));
      if (partial.replace(/\s+/g, "").length > 200) excerpt = partial.slice(0, MAX_CHARS);
    } catch {
      /* 본문을 못 읽으면 비워 둡니다 */
    }
    const hint =
      response.status === 403 || response.status === 401
        ? "로그인이 필요한 공고입니다. 공고 본문을 복사해 아래 칸에 붙여넣으면 같은 분석을 받을 수 있습니다."
        : response.status === 429
          ? "요청이 잠시 제한되었습니다. 잠시 뒤 다시 시도하거나 본문을 붙여넣어 주세요."
          : "공고 본문을 복사해 아래 칸에 붙여넣으면 같은 분석을 받을 수 있습니다.";
    throw new UrlError(422, "fetch_blocked", `${site}가 자동 수집을 막았습니다(HTTP ${response.status}). ${hint}`, { site, excerpt });
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType && !/(text\/html|application\/xhtml|text\/plain|application\/xml|text\/xml)/.test(contentType)) {
    throw new UrlError(422, "not_job_page", `${site}에서 HTML 문서를 받지 못했습니다(${contentType.split(";")[0]}). 공고 본문을 붙여넣어 주세요.`, { site });
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES) {
    throw new UrlError(422, "too_large", `${site} 페이지가 너무 큽니다(${Math.round(buffer.byteLength / 1024)}KB). 공고 본문만 복사해 붙여넣어 주세요.`, { site });
  }

  const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const charset = html.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase();
  const decoded =
    charset && !/utf-?8/.test(charset) && !/euc-?kr/.test(charset)
      ? (() => {
          try {
            return new TextDecoder(charset, { fatal: false }).decode(buffer);
          } catch {
            return html;
          }
        })()
      : html;

  const ld = extractJsonLd(decoded);
  const title = (metaContent(decoded, "og:title") || decodeEntities(decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")).replace(/\s+/g, " ").trim();
  const description = metaContent(decoded, "og:description") || metaContent(decoded, "description");
  const text = htmlToText(decoded);

  const meaningful = text.replace(/\s+/g, "");
  if (meaningful.length < 220) {
    throw new UrlError(
      422,
      "not_job_page",
      `${site} 페이지에서 공고 본문을 찾지 못했습니다. 자바스크립트로만 그려지는 페이지일 수 있습니다. 공고 본문을 붙여넣어 주세요.`,
      { site, excerpt: text.slice(0, 4_000) },
    );
  }

  return { url: url.toString(), finalUrl, site, title, description, text, html: decoded, ld };
}

/* ───────────────────────────── 문단 나누기 ───────────────────────────── */

type SectionKey = "responsibilities" | "requirements" | "preferred" | "documents" | "tone";

const HEADINGS: { id: SectionKey; pattern: RegExp }[] = [
  {
    id: "responsibilities",
    pattern: /^(?:주요\s*업무|담당\s*업무|업무\s*내용|하는\s*일|업무\s*소개|역할|미션|Responsibilities|What you(?:'|’)ll do|What you will do|The role|About the role|직무\s*내용)$/i,
  },
  {
    id: "requirements",
    pattern: /^(?:자격\s*요건|지원\s*자격|응시\s*자격|자격\s*조건|필수\s*요건|필수\s*역량|자격요건|요구\s*사항|모집\s*요강|Requirements|Qualifications|Who you are|What we(?:'|’)re looking for|Minimum qualifications|필수)$/i,
  },
  {
    id: "preferred",
    pattern: /^(?:우대\s*사항|우대\s*조건|기본\s*우대|우대|우대요건|있으면\s*좋은|Preferred|Nice to have|Preferred qualifications|Bonus points|Pluses)$/i,
  },
  {
    id: "documents",
    pattern: /^(?:제출\s*서류|제출\s*자료|필수\s*제출|제출\s*항목|지원\s*서류|Required documents|Documents required|How to apply|To apply|Application)$/i,
  },
  {
    id: "tone",
    pattern: /^(?:조직\s*문화|기업\s*문화|우리\s*팀|팀\s*소개|복지|혜택|근무\s*조건|근무\s*환경|About us|About the team|Benefits|Perks|Why join us|Culture)$/i,
  },
];

const isHeading = (line: string): { id: SectionKey } | null => {
  const compact = line
    .replace(/^[\s•·\-–—*>#]+/, "")
    .replace(/^[\[【(]+/, "")
    .replace(/[\]】)]+$/, "")
    .replace(/[:：]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact || compact.length > 28) return null;
  for (const heading of HEADINGS) {
    if (heading.pattern.test(compact)) return { id: heading.id };
  }
  return null;
};

const cleanBlock = (lines: string[]): string =>
  lines
    .map((line) => line.replace(/^[\s•·▪◦‣]+/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter((line) => line.length > 1)
    // 채용 사이트 공통 영역(로그인 유도·추천공고·기업정보 링크)은 요건이 아닙니다.
    .filter((line) => !/^(?:로그인|회원가입|TOP|궁금해요|지도보기|인근지하철|이 기업의 취업 전략|비슷한 조건|AI추천공고|추천공고|스크랩|공유하기|채용정보|기업정보|접수기간|남은기간|시작일|마감일은|마감일|합격자소서|인적성·면접 후기)/.test(line))
    .filter((line) => !/^\d{1,2}\.\d{1,2}\([월화수목금토일]\)$/.test(line))
    .slice(0, 14)
    .join("\n");

/** 다른 공고·합격자소서 예시 같은 다른 성격의 글자가 시작되는 지점 — 수집을 멈춥니다. */
const STOP_LINE =
  /^(?:보유기술 및 경험직무|합격자소서|인적성·면접 후기|이 기업의 취업 전략|비슷한 조건의 공고|AI추천공고|추천공고|최근 본 공고|연관 공고|관련 공고)/;

export function splitSections(text: string): Pick<ExtractedJob, "responsibilities" | "requirements" | "preferred" | "documents" | "tone"> {
  const lines = text.split("\n").map((line) => line.trim());
  const buckets: Record<string, string[]> = { responsibilities: [], requirements: [], preferred: [], documents: [], tone: [] };
  let current: SectionKey | null = null;
  for (const line of lines) {
    if (STOP_LINE.test(line)) {
      current = null;
      continue;
    }
    const heading = isHeading(line);
    if (heading) {
      current = heading.id;
      continue;
    }
    if (current) {
      if (buckets[current].join(" ").length > 2_400) {
        current = null;
        continue;
      }
      buckets[current].push(line);
    }
  }
  const result = {
    responsibilities: cleanBlock(buckets.responsibilities),
    requirements: cleanBlock(buckets.requirements),
    preferred: cleanBlock(buckets.preferred),
    documents: cleanBlock(buckets.documents),
    tone: cleanBlock(buckets.tone),
  };
  if (!result.responsibilities && !result.requirements) {
    const body = lines
      .filter((line) => line.length > 8 && !/^(?:채용|공고|지원하기|로그인|회사소개|이용약관|개인정보)/.test(line))
      .slice(0, 18)
      .join("\n");
    result.responsibilities = body.slice(0, 2_400);
  }
  return result;
}

const firstString = (value: unknown): string => (typeof value === "string" ? value : "");

function ldText(value: unknown): string {
  if (typeof value === "string") return htmlToText(value);
  if (Array.isArray(value)) return value.map((item) => ldText(item)).filter(Boolean).join("\n");
  return "";
}

function ldPlace(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (Array.isArray(value)) return ldPlace(value[0]);
  const address = record.address as Record<string, unknown> | undefined;
  const region = address ? [firstString(address.addressLocality), firstString(address.addressRegion)] : [];
  return [firstString(record.name), ...region].filter(Boolean).join(" ").trim();
}

const titleParts = (title: string): string[] =>
  title
    .split(/\s*[|·]\s*|\s+[-–—]\s+|\s*\|\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 1 && part.length < 60);

const APPLY_LABEL =
  /(지원\s*하기|지원하기|입사\s*지원|입사지원|지원\s*접수|지원서\s*작성|온라인\s*지원|apply(?:\s*now)?|submit\s*(?:application|resume)|join\s*us)/i;
const APPLY_HREF = /(apply|application|applyform|입사지원)/i;
const SKIP_HREF = /(login|signin|sign-in|logout|privacy|terms|policy|faq|help|customer|apply-status|mypage|member|javascript:|mailto:|tel:)/i;

/**
 * 원문 공고의 ‘지원하기’ 링크를 찾습니다.
 * 페이지 안의 앵커 문구·경로에서 지원 버튼을 고르고, 없으면 공고 URL 자체를 씁니다.
 * (AI가 만든 값이 아니라 페이지 HTML에서 직접 읽은 값입니다)
 */
export function extractApplyLink(
  html: string,
  baseUrl: string,
  ld: Record<string, unknown> | null,
): { applyUrl: string; applyLabel: string } {
  const baseOrigin = (() => {
    try {
      return new URL(baseUrl).origin;
    } catch {
      return "";
    }
  })();
  const candidates: { href: string; label: string; score: number }[] = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html))) {
    const attrs = match[1] ?? "";
    const hrefMatch = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const raw = decodeEntities(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
    if (!raw || raw.startsWith("#") || SKIP_HREF.test(raw)) continue;
    let resolved: URL;
    try {
      resolved = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    const label = htmlToText(match[2] ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30);
    const labelHit = APPLY_LABEL.test(label);
    const hrefHit = APPLY_HREF.test(`${resolved.pathname}${resolved.search}`);
    if (!labelHit && !hrefHit) continue;
    let score = (labelHit ? 6 : 0) + (hrefHit ? 2 : 0) + (resolved.origin === baseOrigin ? 1 : 0);
    if (/(login|signin|privacy|terms|faq)/i.test(resolved.pathname)) score -= 5;
    candidates.push({ href: resolved.toString(), label, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best) return { applyUrl: best.href, applyLabel: best.label };

  const ldUrl = ld ? firstString((ld as Record<string, unknown>).url) : "";
  if (ldUrl) {
    try {
      const resolved = new URL(ldUrl, baseUrl);
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        return { applyUrl: resolved.toString(), applyLabel: "원문 공고" };
      }
    } catch {
      /* 공고 URL 사용 */
    }
  }
  return { applyUrl: baseUrl, applyLabel: "원문 공고" };
}

/** 구조화 데이터의 고용형태 영문 코드를 화면에 익숙한 한국어로 바꿉니다. */
const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: "정규직",
  PART_TIME: "파트타임",
  CONTRACTOR: "계약직",
  TEMPORARY: "계약직",
  INTERN: "인턴",
  INTERNSHIP: "인턴",
  FREELANCE: "프리랜서",
  PER_DIEM: "기간제",
  OTHER: "",
};

const mapEmployment = (value: string): string => {
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (EMPLOYMENT_LABELS[key] !== undefined) return EMPLOYMENT_LABELS[key];
  return value.replace(/\bFULL_TIME\b/gi, "정규직").replace(/\bCONTRACTOR\b/gi, "계약직").replace(/\bINTERN\b/gi, "인턴").trim();
};

export function structureFromPage(page: FetchedPage): ExtractedJob {
  const ld = page.ld;
  const parts = titleParts(page.title);
  const ldTitle = ld ? firstString((ld as Record<string, unknown>).title) : "";
  const ldCompany = ld
    ? ldPlace((ld as Record<string, unknown>).hiringOrganization) || ldPlace((ld as Record<string, unknown>).organization)
    : "";
  const ldDescription = ld ? ldText((ld as Record<string, unknown>).description) : "";
  const ldLocation = ld ? ldPlace((ld as Record<string, unknown>).jobLocation) : "";
  const ldEmployment = ld ? ldText((ld as Record<string, unknown>).employmentType).replace(/\n+/g, " ") : "";

  const text = [page.text, ldDescription].filter(Boolean).join("\n");
  const sections = splitSections(ldDescription.length > 200 ? ldDescription : text);

  const labeled = (keys: string[]): string => {
    for (const key of keys) {
      const match = page.text.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*[:：]\\s*([^\\n]{2,60})`, "i"));
      if (match?.[1]) return match[1].trim();
    }
    return "";
  };

  const company =
    labeled(["회사명", "기업명", "Company"]) ||
    ldCompany ||
    (parts.length > 1 ? parts[parts.length - 1] ?? "" : "") ||
    "";
  const role = labeled(["직무", "포지션", "모집부문", "채용직무", "Position", "Role"]) || ldTitle || parts[0] || "";

  // 채용 사이트 이름을 회사·직무로 읽으면 공고가 아닌 값이 됩니다.
  const PORTAL = /^(?:사람인|잡코리아|원티드|링크드인|점핏|로켓펀치|인크루트|JobKorea|Saramin)$/i;
  const cleanCompany = PORTAL.test(company.trim()) ? "" : company;
  const cleanRole = PORTAL.test(role.trim()) ? "" : role;

  const defaultEmployment = /정규직|계약직|인턴|프리랜서/.exec(page.text)?.[0] ?? "";
  const normalizedEmployment =
    labeled(["고용\\s*형태", "고용형태", "Employment"]) || ldEmployment || defaultEmployment;
  const location = labeled(["근무지", "근무\\s*지역", "Location"]) || ldLocation;
  const deadline = labeled(["마감일", "접수\\s*기간", "마감", "Deadline"]) || (ld ? firstString((ld as Record<string, unknown>).validThrough) : "");

  const link = extractApplyLink(page.html, page.finalUrl, ld);

  return {
    company: cleanCompany.slice(0, 80),
    role: cleanRole.slice(0, 80),
    employmentType: mapEmployment(normalizedEmployment).slice(0, 30),
    location: location.slice(0, 60),
    deadline: deadline.slice(0, 40),
    responsibilities: sections.responsibilities,
    requirements: sections.requirements,
    preferred: sections.preferred,
    documents: sections.documents,
    tone: sections.tone,
    applyUrl: link.applyUrl,
    applyLabel: link.applyLabel,
  };
}

export function excerptOf(page: FetchedPage, max = MAX_CHARS): string {
  return page.text.slice(0, max);
}

export function compactForPrompt(page: FetchedPage, max = MAX_CHARS): string {
  const body = page.text.replace(/\n{2,}/g, "\n").slice(0, max);
  return `[페이지 제목] ${page.title}\n[주소] ${page.finalUrl}\n[본문]\n${body}`;
}
