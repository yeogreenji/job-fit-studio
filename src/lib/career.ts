import type { CareerProfile, MasterResume, PriorityId } from "../types";

/**
 * 커리어 프로필 — “지금 찾는 자리”의 조건.
 *
 * 이력서는 “내가 해 온 일”이고, 프로필은 “내가 원하는 자리”입니다.
 * 공고마다 같은 기준으로 적합도를 계산하려면 이 조건이 한 곳에 저장돼 있어야 합니다.
 * 값은 모두 사용자가 직접 넣거나, 이력서 파일(PDF·TXT·MD)에서 확인되는 값만 초안으로 채웁니다.
 * 이름·연락처·회사 기밀은 프로필에 넣지 않습니다.
 */

export const EMPTY_PROFILE: CareerProfile = {
  role: "",
  summary: "",
  years: null,
  keywords: [],
  salary: null,
  locations: [],
  exclude: [],
  inhouseOnly: false,
  updatedAt: "",
  origin: "manual",
};

/** 프로필을 처음 만들 때 눌러 넣을 수 있는 제안 (개인정보 아님, 직무 용어) */
export const SUGGESTED_KEYWORDS = [
  "보도자료",
  "미디어 대응",
  "위기관리",
  "브랜드 PR",
  "대외협력",
  "콘텐츠 기획",
  "SNS 운영",
  "퍼포먼스 캠페인",
  "성과 분석",
  "IR 커뮤니케이션",
];

export const SUGGESTED_EXCLUDES = ["인턴", "계약직", "파견", "주말 근무", "영업"];

export const LOCATION_OPTIONS = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "재택"];

/**
 * 이력서 문장에서 찾아 올리는 직무 어휘.
 * 사전에 있는 말이 이력서에 실제로 나올 때만 키워드로 올립니다(추측으로 만들지 않음).
 */
const LEXICON: { term: string; patterns: RegExp[] }[] = [
  { term: "보도자료", patterns: [/보도자료/, /press\s*release/i] },
  { term: "미디어 대응", patterns: [/미디어\s*대응/, /언론\s*대응/, /기자\s*대응/, /media\s*relation/i] },
  { term: "위기관리", patterns: [/위기\s*(?:관리|대응|커뮤니케이션)/, /리스크\s*커뮤니케이션/, /crisis/i] },
  { term: "브랜드 PR", patterns: [/브랜드\s*(?:PR|피알|커뮤니케이션)/i, /brand\s*(?:pr|communication)/i] },
  { term: "대외협력", patterns: [/대외\s*협력/, /대관/, /파트너십/, /partnership/i] },
  { term: "콘텐츠 기획", patterns: [/콘텐츠\s*기획/, /콘텐츠\s*제작/, /content\s*(?:planning|production)/i] },
  { term: "SNS 운영", patterns: [/SNS\s*(?:운영|채널|콘텐츠)/i, /인스타그램/, /소셜\s*미디어/, /social\s*media/i] },
  { term: "퍼포먼스 캠페인", patterns: [/퍼포먼스/, /performance\s*marketing/i, /광고\s*캠페인/] },
  { term: "성과 분석", patterns: [/성과\s*분석/, /데이터\s*분석/, /지표\s*분석/, /GA4|구글\s*애널리틱스/] },
  { term: "IR 커뮤니케이션", patterns: [/IR\b/, /투자자\s*(?:관계|커뮤니케이션)/, /주주\s*총회/] },
  { term: "캠페인 기획", patterns: [/캠페인\s*기획/, /캠페인\s*실행/, /campaign/i] },
  { term: "인플루언서 협업", patterns: [/인플루언서/, /크리에이터\s*협업/, /influencer/i] },
  { term: "채널 운영", patterns: [/채널\s*운영/, /블로그\s*운영/, /뉴스레터/] },
  { term: "공식 입장문", patterns: [/입장문/, /보도\s*대응/, /공식\s*발표/] },
  { term: "이벤트·행사", patterns: [/행사\s*(?:기획|운영)/, /이벤트\s*(?:기획|운영)/, /컨퍼런스/] },
  { term: "영문 커뮤니케이션", patterns: [/영문\s*(?:보도자료|커뮤니케이션)/, /영어\s*(?:보도자료|기사)/, /English\s*(?:release|communication)/i] },
  { term: "브랜딩", patterns: [/브랜딩/, /브랜드\s*전략/, /branding/i] },
  { term: "마케팅", patterns: [/마케팅/, /marketing/i] },
];

const clean = (value: string): string => value.replace(/\s+/g, " ").replace(/^[-–—•·*]\s*/, "").trim();

/** 이력서 문장 전체에서 사전에 있는 직무 어휘만 골라 빈도순으로 올립니다. */
export function keywordsFromResume(resume: MasterResume, limit = 8): string[] {
  const body = [
    resume.headline,
    resume.summary,
    ...resume.experiences.flatMap((exp) => [exp.role, ...exp.bullets.map((bullet) => bullet.text)]),
  ]
    .filter(Boolean)
    .join("\n");

  const found = LEXICON.filter((entry) => entry.patterns.some((pattern) => pattern.test(body))).map((entry) => entry.term);
  const declared = [...resume.skills, ...resume.industries].map((item) => clean(item)).filter((item) => item.length > 1 && item.length <= 16);

  // 이력서가 직접 적은 스킬을 먼저, 이어서 본문에서 확인된 어휘
  return [...new Set([...declared, ...found])].slice(0, limit);
}

/** 대표 직무 — 이력서에 적힌 직함/희망 직무를 먼저, 없으면 가장 최근 경력의 직함 */
export function roleFromResume(resume: MasterResume): string {
  const headline = clean(resume.headline);
  if (headline && headline.length <= 40) return headline;
  const latest = resume.experiences.find((exp) => exp.role.trim());
  return latest ? clean(latest.role).slice(0, 40) : "";
}

/** 한 줄 경력 요약 — 이력서 요약이 있으면 그것, 없으면 최근 경력과 문장 수로 */
export function summaryFromResume(resume: MasterResume): string {
  const declared = clean(resume.summary);
  if (declared.length >= 12) return declared.slice(0, 160);
  const latest = resume.experiences.find((exp) => exp.company || exp.role);
  const years = resume.years > 0 ? `경력 ${resume.years}년` : "";
  const parts = [
    latest ? [latest.company, latest.role].filter(Boolean).join(" ") : "",
    years,
    resume.experiences.length > 1 ? `경력 ${resume.experiences.length}곳` : "",
  ].filter(Boolean);
  return parts.join(" · ").slice(0, 160);
}

/** 이력서에서 확인되는 값만으로 만드는 프로필 초안 (없는 값은 비워 둡니다). */
export function profileFromResume(resume: MasterResume, salary: number | null = null): CareerProfile {
  return {
    role: roleFromResume(resume),
    summary: summaryFromResume(resume),
    years: resume.years > 0 ? resume.years : null,
    keywords: keywordsFromResume(resume),
    salary,
    locations: [],
    exclude: [],
    inhouseOnly: false,
    updatedAt: "",
    origin: "resume",
  };
}

export interface MergeResult {
  profile: CareerProfile;
  /** 새로 채운 항목 이름 (화면 안내용) */
  filled: string[];
}

/**
 * 이력서 파일을 올렸을 때 프로필을 자동으로 채웁니다.
 *
 * 이미 사용자가 넣어 둔 값은 건드리지 않고 **비어 있는 항목만** 채웁니다.
 * (직접 고른 희망 연봉·선호 지역·제외 키워드를 이력서가 덮어쓰면 안 되기 때문)
 */
export function mergeProfileFromResume(current: CareerProfile | null, resume: MasterResume): MergeResult {
  const base: CareerProfile = current ? { ...current } : { ...EMPTY_PROFILE };
  const draft = profileFromResume(resume, base.salary);
  const filled: string[] = [];
  const next: CareerProfile = { ...base };

  if (!base.role.trim() && draft.role) {
    next.role = draft.role;
    filled.push("대표 직무");
  }
  if (!(base.summary ?? "").trim() && draft.summary) {
    next.summary = draft.summary;
    filled.push("경력 요약");
  }
  if (base.years === null && draft.years !== null) {
    next.years = draft.years;
    filled.push(`경력 ${draft.years}년`);
  }
  if (!base.keywords.length && draft.keywords.length) {
    next.keywords = draft.keywords;
    filled.push(`키워드 ${draft.keywords.length}개`);
  }
  if (!base.locations.length) {
    const latest = resume.experiences[0];
    const place = LOCATION_OPTIONS.find((option) => option !== "재택" && `${latest?.company ?? ""}${latest?.role ?? ""}`.includes(option));
    if (place) {
      next.locations = [place];
      filled.push(`선호 지역 ${place}`);
    }
  }

  if (filled.length) {
    next.origin = "resume";
    next.updatedAt = new Date().toISOString();
  }
  return { profile: next, filled };
}

/** 화면에 보여 줄 만한 프로필인지 (적합도 계산에 쓸 값이 하나라도 있는지) */
export function profileIsSet(profile: CareerProfile | null | undefined): profile is CareerProfile {
  if (!profile) return false;
  return Boolean(profile.role.trim() || profile.keywords.length || profile.years !== null || profile.locations.length);
}

/** 쉼표·가운뎃점·줄바꿈으로 적은 키워드를 배열로 */
export function splitKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,·、\n]/)
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter((item) => item.length > 0),
    ),
  ].slice(0, 12);
}

export function profileSummary(profile: CareerProfile): string {
  return [
    profile.role || "직무 미설정",
    profile.years !== null ? `경력 ${profile.years}년` : "",
    profile.keywords.length ? `핵심 키워드 ${profile.keywords.length}` : "핵심 키워드 없음",
    profile.locations.length ? profile.locations.join("·") : "",
    profile.salary !== null ? `희망 ${profile.salary.toLocaleString("ko-KR")}만원` : "",
    profile.exclude.length ? `제외 ${profile.exclude.length}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

const PRIORITY_LABEL: Record<PriorityId, string> = {
  salary: "처우",
  balance: "워라밸",
  growth: "성장",
  stability: "안정",
};

export const priorityLabel = (id: PriorityId | null | undefined): string => (id ? PRIORITY_LABEL[id] : "");
