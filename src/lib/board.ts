import type { AiConfig, GradeTone, JobPosting, JobSource, MasterResume } from "../types";
import { matchResume } from "./engine";
import { JobUrlError, fetchJobFromUrl } from "./jobUrl";
import { parseJobText } from "./import";

export type BoardStatus = "new" | "interested" | "applied" | "skip";

export const BOARD_STATUS_LABEL: Record<BoardStatus, string> = {
  new: "새 공고",
  interested: "지원 예정",
  applied: "지원 완료",
  skip: "건너뜀",
};

export interface BoardPosting {
  id: string;
  /** 공고 원문 주소(붙여넣기로 넣은 경우는 없음) */
  url?: string;
  site: string;
  addedAt: string;
  job: JobPosting;
  source: JobSource;
  score: number;
  gradeLabel: string;
  gradeTone: GradeTone;
  matched: string[];
  missing: string[];
  status: BoardStatus;
  note: string;
  appliedAt?: string;
}

export interface BoardFailure {
  id: string;
  url: string;
  code: string;
  message: string;
  excerpt: string;
}

const BOARD_KEY = "jobfit.board.v1";
const MAX_POSTINGS = 300;

export function loadBoard(): BoardPosting[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOARD_KEY) ?? "[]") as BoardPosting[];
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === "string" && p.job).slice(0, MAX_POSTINGS) : [];
  } catch {
    return [];
  }
}

export function persistBoard(postings: BoardPosting[]) {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(postings.slice(0, MAX_POSTINGS)));
  } catch {
    /* 저장 공간이 없으면 조용히 넘어갑니다 */
  }
}

const URL_RE = /https?:\/\/[^\s<>"'）)\]]+/gi;

/** 텍스트에서 공고 URL을 모두 뽑아 중복 없이 돌려줍니다. */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    const url = raw.replace(/[.,;]+$/, "");
    const key = normalizeUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

/** 추적용 쿼리를 걷어낸 비교용 주소 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|trackingId|trk)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** 한 번에 붙여넣은 여러 공고 본문을 ‘===’·‘---’ 줄로 나눕니다. */
export function splitPostings(text: string): string[] {
  return text
    .split(/^\s*(?:={3,}|-{3,})\s*$/m)
    .map((t) => t.trim())
    .filter((t) => t.length >= 40);
}

const uid = () => `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function scorePosting(resume: MasterResume, job: JobPosting) {
  const match = matchResume(resume, job);
  const byWeight = (a: { weight: number }, b: { weight: number }) => b.weight - a.weight;
  return {
    score: match.score,
    gradeLabel: match.grade.label,
    gradeTone: match.grade.tone,
    matched: match.keywords.filter((k) => k.status === "matched").sort(byWeight).slice(0, 5).map((k) => k.label),
    missing: match.keywords.filter((k) => k.status === "missing").sort(byWeight).slice(0, 4).map((k) => k.label),
  };
}

export function makePosting(resume: MasterResume, job: JobPosting, source: JobSource): BoardPosting {
  return {
    id: uid(),
    url: source.url,
    site: source.site ?? "공고",
    addedAt: new Date().toISOString(),
    job,
    source,
    ...scorePosting(resume, job),
    status: "new",
    note: "",
  };
}

/** 이력서가 바뀌면 보드의 모든 공고 점수를 다시 계산합니다. */
export function rescoreAll(resume: MasterResume, postings: BoardPosting[]): BoardPosting[] {
  return postings.map((p) => ({ ...p, ...scorePosting(resume, p.job) }));
}

/** 동시에 n개씩만 처리합니다. 공고 사이트에 부담을 주지 않도록 기본 3개입니다. */
export async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>, concurrency = 3) {
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
}

export interface CollectResult {
  added: BoardPosting[];
  failed: BoardFailure[];
  duplicates: number;
}

/** URL 여러 개를 읽어 점수까지 매깁니다. 이미 보드에 있는 주소는 건너뜁니다. */
export async function collectUrls(
  urls: string[],
  ctx: { resume: MasterResume; config: AiConfig; existing: BoardPosting[]; onProgress?: (done: number, total: number) => void },
): Promise<CollectResult> {
  const known = new Set(ctx.existing.map((p) => (p.url ? normalizeUrl(p.url) : "")).filter(Boolean));
  const todo = urls.filter((u) => !known.has(normalizeUrl(u)));
  const result: CollectResult = { added: [], failed: [], duplicates: urls.length - todo.length };
  let done = 0;
  await runPool(todo, async (url) => {
    try {
      const r = await fetchJobFromUrl(url, ctx.config);
      const source: JobSource = { kind: "url", url: r.meta.url || url, site: r.meta.site, fetchedAt: new Date().toISOString(), note: r.meta.note };
      result.added.push(makePosting(ctx.resume, r.job, source));
    } catch (error) {
      const e = error instanceof JobUrlError ? error : new JobUrlError("unknown", "공고를 불러오지 못했습니다.");
      result.failed.push({ id: uid(), url, code: e.code, message: e.message, excerpt: e.excerpt });
    } finally {
      done += 1;
      ctx.onProgress?.(done, todo.length);
    }
  });
  return result;
}

/** 붙여넣은 본문들을 공고로 만듭니다. */
export function collectTexts(texts: string[], resume: MasterResume, url?: string): BoardPosting[] {
  return texts.map((text) => {
    const { job } = parseJobText(text);
    const source: JobSource = { kind: "paste", url, site: url ? hostOf(url) : "붙여넣은 본문", fetchedAt: new Date().toISOString() };
    return makePosting(resume, job, source);
  });
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "공고";
  }
};

/** 마감일 문자열에서 남은 일수. 상시·파싱 불가면 null */
export function daysLeft(deadline: string, now = new Date()): number | null {
  const m = deadline.match(/(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!m) return null;
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

/** 사용자가 자기 브라우저에서 검색 결과 페이지의 공고 링크를 한꺼번에 복사하는 북마클릿 */
export const COLLECTOR_BOOKMARKLET =
  "javascript:(()=>{const re=/(wanted\\.co\\.kr\\/wd\\/\\d+|saramin\\.co\\.kr\\/zf_user\\/jobs\\/relay\\/view|jobkorea\\.co\\.kr\\/Recruit\\/GI_Read|linkedin\\.com\\/jobs\\/view|career\\.rememberapp\\.co\\.kr\\/job\\/posting|jumpit\\.saramin\\.co\\.kr\\/position|catch\\.co\\.kr\\/NCS\\/RecruitInfoDetails)/;const s=new Set();document.querySelectorAll('a[href]').forEach(a=>{if(re.test(a.href))s.add(a.href.split('#')[0])});const t=[...s].join('\\n');if(!t){alert('공고 링크를 찾지 못했습니다.');return}navigator.clipboard.writeText(t).then(()=>alert(s.size+'개 공고 링크를 복사했습니다. 잡핏 보드에 붙여넣으세요.'),()=>prompt('복사해서 잡핏에 붙여넣으세요',t))})();";
