import type {
  CareerDoc,
  CareerDocKind,
  CareerKit,
  DocMatch,
  DocMatchReason,
  JobPosting,
  MasterResume,
} from "../types";
import { keywordsFromResume, roleFromResume, summaryFromResume } from "./career";
import { parseYearsText } from "./fit";
import { quotedJosa } from "./josa";

/**
 * 커리어 서류 3종 — 이력서 · 자기소개서 · 포트폴리오.
 *
 * 세 서류에서 **실제로 적힌 말만** 뽑아 (1) 공고 검색 키워드, (2) 공고 대조 근거,
 * (3) 지원 문구 재료로 씁니다. 문서에 없는 경력·수치·회사는 만들지 않습니다.
 * 원문 전체는 저장하지 않고, 화면에 보여 줄 요약·키워드·대표 문장만 남깁니다.
 */

export const DOC_KINDS: CareerDocKind[] = ["resume", "cover", "portfolio"];

export const DOC_LABEL: Record<CareerDocKind, string> = {
  resume: "이력서",
  cover: "자기소개서",
  portfolio: "포트폴리오",
};

export const DOC_HINT: Record<CareerDocKind, string> = {
  resume: "경력·직함·성과 문장 (필수)",
  cover: "지원 동기·강점 (선택)",
  portfolio: "프로젝트·작업물 링크·성과 (선택)",
};

export const DOC_TAG: Record<CareerDocKind, string> = {
  resume: "이력서",
  cover: "자소서",
  portfolio: "포폴",
};

export const EMPTY_KIT: CareerKit = {
  docs: { resume: null, cover: null, portfolio: null },
  portfolioUrl: "",
  keywords: [],
  keywordDocs: {},
  role: "",
  years: null,
  summary: "",
  updatedAt: "",
};

/* ───────────────────────── 키워드 사전 ───────────────────────── */

interface Term {
  term: string;
  patterns: RegExp[];
}

/**
 * 서류에서 찾아 올리는 직무 어휘. 사전에 있는 말이 서류에 실제로 나올 때만 키워드가 됩니다.
 * (새 직군을 쓰는 사용자를 위해 흔한 직무 용어를 폭넓게 두었습니다)
 */
const LEXICON: Term[] = [
  { term: "보도자료", patterns: [/보도자료/, /press\s*release/i] },
  { term: "미디어 대응", patterns: [/미디어\s*대응/, /언론\s*대응/, /기자\s*대응/, /media\s*relation/i] },
  { term: "위기관리", patterns: [/위기\s*(?:관리|대응|커뮤니케이션)/, /리스크\s*커뮤니케이션/, /crisis\s*(?:management|communication)/i] },
  { term: "브랜드 PR", patterns: [/브랜드\s*(?:PR|피알|커뮤니케이션)/i, /brand\s*(?:pr|communication)/i] },
  { term: "대외협력", patterns: [/대외\s*협력/, /대관/, /파트너십/, /partnership/i] },
  { term: "공식 입장문", patterns: [/입장문/, /공식\s*(?:발표|입장)/] },
  { term: "IR 커뮤니케이션", patterns: [/\bIR\b/, /투자자\s*(?:관계|커뮤니케이션)/, /주주\s*총회/] },
  { term: "콘텐츠 기획", patterns: [/콘텐츠\s*(?:기획|제작)/, /content\s*(?:planning|production)/i] },
  { term: "SNS 운영", patterns: [/SNS\s*(?:운영|채널|콘텐츠)/i, /인스타그램/, /소셜\s*미디어/, /social\s*media/i] },
  { term: "인플루언서 협업", patterns: [/인플루언서/, /크리에이터\s*협업/, /influencer/i] },
  { term: "채널 운영", patterns: [/채널\s*운영/, /블로그\s*운영/, /뉴스레터/] },
  { term: "캠페인 기획", patterns: [/캠페인\s*(?:기획|실행)/, /campaign/i] },
  { term: "퍼포먼스 마케팅", patterns: [/퍼포먼스/, /performance\s*marketing/i] },
  { term: "성과 분석", patterns: [/성과\s*분석/, /데이터\s*분석/, /지표\s*분석/, /GA4|구글\s*애널리틱스/] },
  { term: "브랜딩", patterns: [/브랜딩/, /브랜드\s*전략/, /branding/i] },
  { term: "행사 운영", patterns: [/행사\s*(?:기획|운영)/, /이벤트\s*(?:기획|운영)/, /컨퍼런스/] },
  { term: "영문 커뮤니케이션", patterns: [/영문\s*(?:보도자료|커뮤니케이션)/, /영어\s*(?:보도자료|기사)/, /English\s*(?:release|communication)/i] },
  { term: "마케팅", patterns: [/마케팅/, /marketing/i] },
  { term: "서비스 기획", patterns: [/서비스\s*기획/, /기획\s*(?:업무|역량)/] },
  { term: "UX 리서치", patterns: [/UX\s*(?:리서치|리서치|설계)/i, /사용자\s*(?:조사|리서치)/, /user\s*research/i] },
  { term: "UI 디자인", patterns: [/UI\s*(?:디자인|설계)/i, /디자인\s*시스템/i, /design\s*system/i] },
  { term: "프로토타이핑", patterns: [/프로토타이핑/, /prototyp/i] },
  { term: "데이터 시각화", patterns: [/데이터\s*시각화/, /대시보드/, /dashboard/i] },
  { term: "SQL", patterns: [/\bSQL\b/i] },
  { term: "Python", patterns: [/\bPython\b/i] },
  { term: "TypeScript", patterns: [/\bTypeScript\b/i] },
  { term: "React", patterns: [/\bReact\b/] },
  { term: "API 설계", patterns: [/\bAPI\b/] },
  { term: "Figma", patterns: [/\bFigma\b/i] },
  { term: "Photoshop", patterns: [/Photoshop/i, /포토샵/] },
  { term: "Premiere", patterns: [/Premiere/i, /프리미어/] },
  { term: "Excel", patterns: [/\bExcel\b/i, /엑셀/] },
  { term: "Notion", patterns: [/\bNotion\b/i] },
  { term: "CRM", patterns: [/\bCRM\b/i] },
  { term: "B2B 영업", patterns: [/B2B\s*(?:영업|세일즈)/i, /B2B/i] },
  { term: "B2C 마케팅", patterns: [/B2C/i] },
  { term: "제안서", patterns: [/제안서/, /proposal/i] },
  { term: "리더십", patterns: [/리더십/, /팀\s*리딩/, /leadership/i] },
  { term: "협업", patterns: [/협업/, /collaborat/i] },
];

const clean = (value: string): string => value.replace(/\s+/g, " ").replace(/^[-–—•·*]\s*/, "").trim();

/** 문장을 나눕니다 (마침표·줄바꿈). */
const sentencesOf = (text: string): string[] =>
  text
    .split(/\n+|(?<=[.!?])\s+/)
    .map(clean)
    .filter((line) => line.length >= 8);

const countOf = (text: string, pattern: RegExp): number => (text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) ?? []).length;

/** 사전에 있는 말을 서류에서 찾아 개수와 함께 돌려줍니다. */
function lexiconHits(text: string): { term: string; count: number }[] {
  return LEXICON.map((entry) => ({
    term: entry.term,
    count: entry.patterns.reduce((sum, pattern) => sum + countOf(text, pattern), 0),
  })).filter((entry) => entry.count > 0);
}

const MAX_HIGHLIGHTS = 3;
const MAX_DOC_KEYWORDS = 8;

/* ───────────────────────── 서류 판별 ───────────────────────── */

/** 파일 이름과 내용으로 어느 서류인지 판단합니다. */
export function detectDocKind(fileName: string, text: string): CareerDocKind {
  const name = fileName.toLowerCase();
  if (/자소서|자기소개서|cover|motivation|letter|지원동기/.test(name)) return "cover";
  if (/포트폴리오|포폴|portfolio|work|작업물|projects?/i.test(name)) return "portfolio";

  const sample = text.slice(0, 2_000);
  const counts = {
    cover: (sample.match(/자기\s*소개서|지원\s*동기|입사\s*후|성장\s*과정|지원한\s*이유|성격의\s*장단점/g) ?? []).length,
    portfolio: (sample.match(/포트폴리오|프로젝트|작업물|캠페인\s*사례|성과\s*요약|Project|Case\s*Study/gi) ?? []).length,
    resume: (sample.match(/이력서|경력\s*사항|학력|보유\s*스킬|경력기술서|Work\s*Experience/gi) ?? []).length,
  };
  const best = (Object.keys(counts) as CareerDocKind[]).sort((a, b) => counts[b] - counts[a])[0];
  if (counts[best] >= 2) return best;
  return "resume";
}

/* ───────────────────────── 서류 요약 ───────────────────────── */

export interface DocParseInput {
  kind: CareerDocKind;
  text: string;
  fileName: string;
  chars: number;
  pages?: number;
  uploadedAt?: string;
  /** 이력서는 이미 파싱한 값이 있으면 그쪽을 우선합니다 */
  resume?: MasterResume | null;
}

/** 파일에서 뽑은 요약 — 문서에 적힌 문장만 씁니다. */
export function parseDoc(input: DocParseInput): CareerDoc {
  const text = input.text;
  const hits = lexiconHits(text);
  const keywords = hits.sort((a, b) => b.count - a.count).map((hit) => hit.term).slice(0, MAX_DOC_KEYWORDS);

  let summary = "";
  let highlights: string[] = [];
  let projects: string[] = [];

  if (input.kind === "resume" && input.resume) {
    summary = summaryFromResume(input.resume).slice(0, 160);
    const bullets = input.resume.experiences.flatMap((exp) => exp.bullets.map((bullet) => clean(bullet.text))).filter((line) => line.length > 12);
    const withMetric = bullets.filter((line) => /\d/.test(line));
    highlights = [...withMetric, ...bullets].filter((line, index, all) => all.indexOf(line) === index).slice(0, MAX_HIGHLIGHTS).map((line) => line.slice(0, 140));
    const declared = keywordsFromResume(input.resume, MAX_DOC_KEYWORDS);
    if (declared.length) {
      const merged = [...declared, ...keywords].filter((term, index, all) => all.indexOf(term) === index).slice(0, MAX_DOC_KEYWORDS);
      return {
        kind: input.kind,
        fileName: input.fileName,
        chars: input.chars,
        pages: input.pages,
        uploadedAt: input.uploadedAt ?? new Date().toISOString(),
        summary: summary || `${DOC_LABEL.resume} · ${keywords.length}개 키워드`,
        keywords: merged,
        highlights,
        projects,
      };
    }
  }

  if (input.kind === "cover") {
    const lines = text.split("\n").map(clean).filter(Boolean);
    const first = lines.find((line) => line.length >= 20) ?? lines[0] ?? "";
    summary = (sentencesOf(first).slice(0, 2).join(" ") || first).slice(0, 160);
    highlights = sentencesOf(text)
      .filter((line) => line.length >= 18 && /성과|달성|개선|증가|기여|운영|기획|맡|해 왔|경험|역량|성장/.test(line))
      .slice(0, MAX_HIGHLIGHTS)
      .map((line) => line.slice(0, 140));
  }

  if (input.kind === "portfolio") {
    projects = text
      .split("\n")
      .map((line) => clean(line.replace(/^#{1,4}\s*/, "")))
      .map((line) => {
        const match = line.match(/^(?:프로젝트|캠페인|작업|사례|Project|Case)\s*[:：\-–—]?\s*(.+)$/i);
        return match?.[1]?.trim() ?? "";
      })
      .filter((line) => line.length >= 3 && line.length <= 48)
      .slice(0, 6);
    const titles = projects;
    const metrics = text
      .split("\n")
      .map(clean)
      .filter((line) => line.length >= 12 && /\d+(?:\.\d+)?\s*(?:%|건|명|개|배|만|억|위|일|시간)/.test(line));
    highlights = [...metrics, ...sentencesOf(text).filter((line) => /성과|개선|증가|달성|수상|선정|기여/.test(line))]
      .filter((line, index, all) => all.indexOf(line) === index)
      .slice(0, MAX_HIGHLIGHTS)
      .map((line) => line.slice(0, 140));
    summary = [titles[0] ? `대표 작업 ‘${titles[0].slice(0, 30)}’` : "", titles.length > 1 ? `프로젝트 ${titles.length}개` : "", `성과 문장 ${highlights.length}개`]
      .filter(Boolean)
      .join(" · ") || "포트폴리오";
  }

  if (input.kind === "resume" && !summary) {
    summary = sentencesOf(text)[0]?.slice(0, 160) ?? `${DOC_LABEL.resume} · ${input.chars.toLocaleString("ko-KR")}자`;
  }

  return {
    kind: input.kind,
    fileName: input.fileName,
    chars: input.chars,
    pages: input.pages,
    uploadedAt: input.uploadedAt ?? new Date().toISOString(),
    summary,
    keywords,
    highlights,
    projects,
  };
}

/* ───────────────────────── 키트 조립 ───────────────────────── */

export interface KitInput {
  docs: Record<CareerDocKind, CareerDoc | null>;
  portfolioUrl: string;
  resume?: MasterResume | null;
  role?: string;
  years?: number | null;
}

/** 세 서류를 합쳐 검색 키워드·대표 직무·요약을 다시 계산합니다. */
export function composeKit(input: KitInput): CareerKit {
  const docs = input.docs;
  const present = DOC_KINDS.filter((kind) => docs[kind]);
  const order: Record<CareerDocKind, number> = { resume: 0, cover: 1, portfolio: 2 };
  const seen = new Map<string, { count: number; docs: CareerDocKind[] }>();

  for (const kind of present) {
    const doc = docs[kind];
    if (!doc) continue;
    doc.keywords.forEach((term, index) => {
      const key = term.trim();
      if (!key) return;
      const current = seen.get(key) ?? { count: 0, docs: [] };
      current.count += MAX_DOC_KEYWORDS - index;
      if (!current.docs.includes(kind)) current.docs.push(kind);
      seen.set(key, current);
    });
  }

  const rankedAll = [...seen.entries()]
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return order[a[1].docs[0]] - order[b[1].docs[0]];
    })
    .map(([term]) => term);

  // ‘위기관리’와 ‘위기 대응’, ‘인플루언서 협업’과 ‘인플루언서 마케팅’처럼 같은 말이 겹치면
  // 먼저 나온 것만 남깁니다 (앞 두 글자가 같거나 한 단어를 함께 쓰는 경우).
  const ranked: string[] = [];
  for (const term of rankedAll) {
    const key = term.replace(/\s+/g, "");
    const duplicate = ranked.some((kept) => {
      const other = kept.replace(/\s+/g, "");
      if (key === other) return true;
      if (key.length >= 2 && other.length >= 2 && key.slice(0, 2) === other.slice(0, 2)) return true;
      const tokens = new Set(term.split(/\s+/).filter((token) => token.length >= 2));
      return kept
        .split(/\s+/)
        .filter((token) => token.length >= 2)
        .some((token) => tokens.has(token));
    });
    if (!duplicate) ranked.push(term);
    if (ranked.length >= 12) break;
  }

  const keywordDocs: Record<string, CareerDocKind[]> = {};
  for (const term of ranked) keywordDocs[term] = (seen.get(term)?.docs ?? []).sort((a, b) => order[a] - order[b]);

  const role =
    clean(input.role ?? "").slice(0, 40) ||
    (input.resume ? roleFromResume(input.resume) : "") ||
    "";
  const years = input.years ?? (input.resume && input.resume.years > 0 ? input.resume.years : null);

  const summaryParts = [
    role || "직무 미확인",
    years !== null ? `경력 ${years}년` : "연차 미확인",
    `서류 ${present.length}/3`,
    ranked.length ? `키워드 ${ranked.length}개` : "키워드 없음",
  ];

  return {
    docs,
    portfolioUrl: input.portfolioUrl.trim(),
    keywords: ranked,
    keywordDocs,
    role,
    years,
    summary: summaryParts.join(" · "),
    updatedAt: new Date().toISOString(),
  };
}

/** 서류 한 건을 넣거나 바꿉니다. */
export function putDoc(kit: CareerKit, doc: CareerDoc, extra: { portfolioUrl?: string; role?: string; years?: number | null; resume?: MasterResume | null } = {}): CareerKit {
  return composeKit({
    docs: { ...kit.docs, [doc.kind]: doc },
    portfolioUrl: extra.portfolioUrl ?? kit.portfolioUrl,
    role: extra.role ?? kit.role,
    years: extra.years === undefined ? kit.years : extra.years,
    resume: extra.resume ?? null,
  });
}

/** 서류 한 건을 뺍니다. */
export function removeDocFromKit(kit: CareerKit, kind: CareerDocKind, extra: { role?: string; years?: number | null; resume?: MasterResume | null } = {}): CareerKit {
  return composeKit({
    docs: { ...kit.docs, [kind]: null },
    portfolioUrl: kit.portfolioUrl,
    role: extra.role ?? kit.role,
    years: extra.years === undefined ? kit.years : extra.years,
    resume: extra.resume ?? null,
  });
}

export function kitDocCount(kit: CareerKit): number {
  return DOC_KINDS.filter((kind) => kit.docs[kind] || (kind === "portfolio" && kit.portfolioUrl)).length;
}

/** 공고를 모을 수 있는 상태인지 — 이력서나 자기소개서 중 하나는 있어야 합니다. */
export function kitReady(kit: CareerKit): boolean {
  return Boolean(kit.docs.resume || kit.docs.cover || kit.keywords.length >= 2);
}

/**
 * 공고 검색에 던질 키워드. 대표 직무를 먼저, 이어서 서류에서 많이 나온 말.
 * (너무 긴 문장은 검색이 안 되므로 2~12자만 씁니다)
 */
export function searchKeywords(kit: CareerKit, max = 4): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const term = clean(value);
    if (term.length < 2 || term.length > 12) return;
    if (out.some((item) => item === term || item.includes(term) || term.includes(item))) return;
    out.push(term);
  };
  // ‘매니저·과장·담당’ 같은 직급 말은 검색어로 쓰지 않습니다.
  const generic = /^(매니저|담당|담당자|주임|대리|과장|차장|부장|팀장|실장|본부장|사원|인턴|선임|수석|시니어|주니어|리더|총괄|책임|엔지니어|개발자|디자이너)$/;
  const roleTokens = kit.role
    .split(/\s+/)
    .map((token) => token.replace(/[()\[\],·/]/g, "").trim())
    .filter((token) => token.length >= 2 && token.length <= 12 && !generic.test(token));
  const roleKeyword = roleTokens.slice(-1)[0] ?? "";
  if (roleKeyword) push(roleKeyword);
  for (const term of kit.keywords) {
    if (out.length >= max) break;
    push(term);
  }
  return out.slice(0, max);
}

/* ───────────────────────── 공고 대조 ───────────────────────── */

const norm = (value: string): string => value.replace(/\s+/g, " ").trim().toLowerCase();

/** 키워드가 글 안에 있는지 — 여러 단어 키워드는 모든 단어가 같은 항목 안에 있으면 맞은 것으로 봅니다. */
function phraseHit(haystack: string, keyword: string): boolean {
  const text = norm(haystack);
  const term = norm(keyword);
  if (!term) return false;
  if (text.includes(term)) return true;
  const tokens = term.split(/\s+/).filter((token) => token.length >= 2);
  return tokens.length > 1 && tokens.every((token) => text.includes(token));
}

/**
 * 사전에서 같은 뜻으로 묶은 말까지 보고 맞는지 판단합니다.
 * 서류에는 ‘언론 대응’으로 적혔는데 공고는 ‘미디어 대응’이라고 쓴 경우를 놓치지 않기 위해서입니다.
 */
export function termHit(haystack: string, keyword: string): boolean {
  if (phraseHit(haystack, keyword)) return true;
  const entry = LEXICON.find((item) => item.term === keyword);
  if (!entry) return false;
  return entry.patterns.some((pattern) => new RegExp(pattern.source, pattern.flags.replace(/g/g, "")).test(haystack));
}

/** 한 공고를 내 서류와 대조해 점수·근거·빈틈을 만듭니다. */
export function matchJobWithKit(kit: CareerKit, job: JobPosting): DocMatch {
  if (!kitReady(kit)) {
    return { score: 0, matched: [], gaps: [], summary: "서류를 올리면 대조합니다", needsKit: true };
  }

  const sections: { where: DocMatchReason["where"]; text: string }[] = [
    { where: "직무", text: `${job.role} ${job.employmentType}` },
    { where: "담당 업무", text: job.responsibilities },
    { where: "자격 요건", text: job.requirements },
    { where: "우대 사항", text: job.preferred },
    { where: "태그", text: `${(job.tags ?? []).join(" ")} ${job.conditions ?? ""}` },
  ];

  const matched: DocMatchReason[] = [];
  for (const keyword of kit.keywords.slice(0, 12)) {
    const section = sections.find((entry) => termHit(entry.text, keyword));
    if (!section) continue;
    const doc = (kit.keywordDocs[keyword] ?? ["resume"])[0];
    matched.push({ label: keyword, doc, where: section.where });
  }
  const unique = matched.filter((item, index, all) => all.findIndex((other) => other.label === item.label) === index);

  const roleHit = Boolean(kit.role) && phraseHit(`${job.role} ${(job.tags ?? []).join(" ")}`, kit.role);
  const portfolioHit = unique.some((item) => item.doc === "portfolio");
  const coverHit = unique.some((item) => item.doc === "cover");

  const years = parseYearsText(job.experience ?? "");
  const gaps: string[] = [];
  let yearsScore = 0;
  let yearsNote = "";
  if (kit.years !== null && years.min !== null) {
    const diff = years.min - kit.years;
    if (diff <= 1) {
      yearsScore = 8;
      yearsNote = "연차 조건 충족";
    } else if (diff >= 3) {
      yearsScore = -10;
      yearsNote = "연차 조건 높음";
      gaps.push(`공고는 경력 ${years.min}년 이상인데 서류에는 ${kit.years}년으로 적혀 있습니다`);
    }
  }

  let score = 24 + Math.min(48, unique.length * 9);
  if (roleHit) score += 14;
  if (portfolioHit) score += 6;
  if (coverHit) score += 3;
  score += yearsScore;
  score = Math.max(5, Math.min(98, score));

  // 연차·학력·고용형태처럼 서류 키워드로 확인할 수 없는 줄은 빈틈으로 세지 않습니다.
  const ADMIN_LINE = /경력\s*\d|경력\s*(?:무관|이상|이하)|학력|전공|정규직|계약직|인턴|근무\s*(?:지|형태)|출근|급여|연봉|복리후생|4대\s*보험/;
  const requirementLines = (job.requirements ?? "")
    .split("\n")
    .map(clean)
    .filter((line) => line.length >= 8 && !ADMIN_LINE.test(line));
  for (const line of requirementLines) {
    if (gaps.length >= 2) break;
    if (!kit.keywords.some((keyword) => termHit(line, keyword))) {
      gaps.push(`공고 자격 요건의 ${quotedJosa(line.slice(0, 36), "이")} 서류에서 확인되지 않습니다`);
    }
  }
  if (!kit.docs.portfolio && /포트폴리오/.test(`${job.documents ?? ""} ${job.requirements ?? ""}`) && gaps.length < 3) {
    gaps.push("공고가 포트폴리오를 요구합니다 — 포트폴리오 파일이나 링크를 올려 두세요");
  }

  const summaryParts = [
    unique.length ? `서류 키워드 ${unique.length}개 일치` : "서류 키워드 일치 없음",
    roleHit ? "직무 일치" : "",
    yearsNote,
  ].filter(Boolean);

  return {
    score,
    matched: unique.slice(0, 6),
    gaps: gaps.slice(0, 3),
    summary: summaryParts.join(" · "),
    needsKit: false,
  };
}

/** 화면에 짧게 쓰는 대조 한 줄 */
export function docMatchLabel(match: DocMatch): string {
  if (match.needsKit) return "서류 미등록";
  if (!match.matched.length) return "서류 키워드 일치 없음";
  return match.matched
    .slice(0, 2)
    .map((item) => `${DOC_TAG[item.doc]} · ${item.label}`)
    .join(" / ");
}

/** 키워드가 어느 서류에서 왔는지 (설명용) */
export function docOriginsOf(kit: CareerKit, keyword: string): string {
  const docs = kit.keywordDocs[keyword] ?? [];
  return docs.map((kind) => DOC_TAG[kind]).join("·");
}
