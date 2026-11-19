/**
 * JobFit Studio — 기본 수집 타깃 프로필 (서울 · 인하우스 홍보/PR · 과차장급)
 *
 * 공고를 모으는 것만으로는 부족해서, 모은 공고 가운데 "지금 찾는 자리"에 맞는 것만
 * 남기는 규칙을 한 곳에 모았습니다. 화면과 서버가 같은 기준을 쓰도록 문장이 아니라
 * 규칙(정규식·목록)으로 적었고, 어떤 이유로 몇 건을 걸렀는지 함께 돌려줍니다.
 *
 * 기준 (2026-11-19 확인)
 *  · 지역 — 서울. 경기·지방 공고는 기본 목록에서 제외
 *  · 직무 — 홍보/PR·커뮤니케이션·대외협력·언론 대응. 개발·디자인·영업·단순 마케팅 제외
 *  · 경력 — 경력 5년 이상(과장·차장·팀장·리드급). 신입·인턴·주니어 전용 제외
 *  · 유형 — 인하우스 기업 우선. PR 에이전시·대행사는 제외하고, 서치펌(헤드헌팅)은
 *           고용주가 공개되지 않은 공고라 별도 표시로 남깁니다.
 *
 * 이 파일에는 사용자 이름·연락처 같은 개인정보를 두지 않습니다. 조건만 있습니다.
 */

export type CompanyType = "inhouse" | "agency" | "searchfirm" | "unknown";

export const TARGET_PROFILE = "seoul-inhouse-pr";

export interface TargetProfile {
  id: string;
  label: string;
  /** 각 채용 사이트에 던질 검색어 */
  keywords: string[];
  region: "서울";
  minYears: number;
}

export const TARGET_PROFILES: Record<string, TargetProfile> = {
  [TARGET_PROFILE]: {
    id: TARGET_PROFILE,
    label: "서울 인하우스 홍보·PR (과차장급)",
    keywords: ["홍보", "PR", "언론홍보", "기업PR", "커뮤니케이션", "대외협력"],
    region: "서울",
    minYears: 5,
  },
};

export const profileById = (id: string | undefined): TargetProfile | undefined =>
  id ? TARGET_PROFILES[id] : undefined;

/* ───────────────────────────── 직무 판정 ───────────────────────────── */

/** 홍보·PR 직무를 가리키는 말. 제목·직무태그·회사명에서 찾습니다. */
const PR_TERMS: RegExp[] = [
  /홍보/,
  /피알/,
  /(^|[^a-z])pr([^a-z]|$)/i,
  /커뮤니케이션/,
  /communication/i,
  /대외\s*협력/,
  /대외\s*홍보/,
  /언론/,
  /미디어\s*(대응|관계|커뮤니케이션)/,
  /보도/,
  /public\s*relations/i,
  /public\s*affairs/i,
  /corporate\s*(communication|affairs)/i,
  /대관/,
  /브랜딩/,
];

/** 홍보팀이 아니라 다른 직무인 공고를 걸러내는 말 (제목 기준). */
const ROLE_BLOCKERS: RegExp[] = [
  /개발자/,
  /엔지니어/,
  /백엔드/,
  /프론트엔드/,
  /디자이너/,
  /퍼블리셔/,
  /퍼포먼스/,
  /그로스\s*해킹/,
  /영업/,
  /세일즈/,
  /총무/,
  /사무\s*보조/,
  /비서/,
  /배송/,
  /자재/,
  /물류/,
  /회계/,
  /재무/,
  /인사\s*담당/,
  /노무/,
  /상품\s*기획/,
  /MD\b/,
  /촬영/,
  /편집자/,
  /포토샵/,
  /계정\s*관리/,
  /데이터\s*(분석|엔지니어)/,
  /서비스\s*기획/,
  /프랜차이즈\s*홍보\s*마케팅/,
  /입학/,
  /연구원/,
  /모금/,
  /총괄\s*관리/,
  /사업\s*전략/,
  /고문/,
  /chairman/i,
  /제안서/,
  /번역/,
];

/** 신입·인턴·주니어 전용을 걸러내는 말. */
const JUNIOR_TERMS: RegExp[] = [
  /인턴/,
  /신입/,
  /주니어/,
  /사원/,
  /보조/,
  /대리급/,
  /어시스턴트/,
  /assistant/i,
  /스태프/,
  /코디/,
  /助理/,
];

/** 제목에 이 말이 있으면 경력 조건이 흐려도 과차장급으로 봅니다. */
const SENIOR_TERMS: RegExp[] = [
  /과장/,
  /차장/,
  /부장/,
  /팀장/,
  /팀\s*리더/,
  /리더/,
  /리드/,
  /책임/,
  /총괄/,
  /\bhead\b/i,
  /\bleader\b/i,
  /\blead\b/i,
  /\bmanager\b/i,
  /\bdirector\b/i,
  /\bprincipal\b/i,
  /\bsenior\b/i,
  /\bchief\b/i,
];

/** PR 에이전시·대행사 (회사명 기준). 확인한 이름만 적고, 새 이름은 여기에 더합니다. */
const AGENCY_NAMES: RegExp[] = [
  /프레인/,
  /함샤우트/,
  /함파트너스/,
  /이오스커뮤니케이션/,
  /브리스캔/,
  /미디컴피알/,
  /팀쿠키/,
  /업사이드포텐셜/,
  /위펀/,
  /피알원/,
  /케이피알/,
  /\bkpr\b/i,
  /에스프레소\s*커뮤니케이션/,
  /더피알/,
  /피알게이트/,
  /커뮤니케이션즈/,
  /커뮤니케이션\s*하우스/,
  /에델만/,
  /웨바\s*샌드윅/,
  /플레시먼/,
  /힐앤놀튼/,
  /오길비/,
  /\bbbdo\b/i,
  /\btbwa\b/i,
  /퍼블리시스/,
  /맥켄에릭슨/,
  /이노션/,
  /제일기획/,
  /대홍기획/,
  /\bhs\s*애드\b/i,
  /매커니/,
  /오리콤/,
];

/** 서치펌·헤드헌팅 (회사명 또는 제목). 고용주가 공개되지 않은 공고입니다. */
const SEARCH_FIRM_NAMES: RegExp[] = [
  /써치/,
  /서치/,
  /헤드헌/,
  /헤딩/,
  /리크루트/,
  /프로써치/,
  /유니코/,
  /맨파워/,
  /에버드림/,
  /에버브레인/,
  /시너지버슨/,
  /파인드잡/,
  /커리어케어/,
  /커리어셀파/,
  /커리어앤유/,
  /탑앤스카우트/,
  /인싸이트/,
  /피플온/,
  /스카우트/,
  /인피니티\s*컨설팅/,
];

/** 에이전시가 쓴 공고에 흔한 표현 (제목·직무). */
const AGENCY_ROLE_MARKERS: RegExp[] = [/에이전시/, /대행/, /\bAE\b/, /광고\s*회사/, /홍보\s*회사/];

const norm = (text: string): string => text.replace(/\s+/g, " ").trim();

export function hasPrRole(text: string): boolean {
  const haystack = norm(text).toLowerCase();
  return PR_TERMS.some((term) => term.test(haystack));
}

export function isJuniorTitle(title: string): boolean {
  return JUNIOR_TERMS.some((term) => term.test(title));
}

export function isSeniorTitle(title: string): boolean {
  return SENIOR_TERMS.some((term) => term.test(title));
}

export function isSeoul(location: string): boolean {
  return /서울/.test(location);
}

export function isAgency(company: string, role: string): boolean {
  const name = norm(company);
  if (AGENCY_NAMES.some((term) => term.test(name))) return true;
  if (AGENCY_ROLE_MARKERS.some((term) => term.test(norm(role)))) return true;
  // 회사명 자체에 '커뮤니케이션즈'·'피알'이 들어가면 대행사로 봅니다.
  return /(커뮤니케이션즈|피알|PR\s*컴퍼니)/i.test(name);
}

export function isSearchFirm(company: string, role: string): boolean {
  const name = norm(company);
  if (SEARCH_FIRM_NAMES.some((term) => term.test(name))) return true;
  return /^\[?\s*헤드헌팅/.test(norm(role)) || /헤드헌팅/.test(role);
}

export function companyTypeOf(company: string, role: string, headhunter = false): CompanyType {
  if (!company && !role) return "unknown";
  if (isAgency(company, role)) return "agency";
  if (headhunter || isSearchFirm(company, role)) return "searchfirm";
  return "inhouse";
}

/* ───────────────────────────── 경력 판정 ───────────────────────────── */

export interface Years {
  min: number | null;
  max: number | null;
}

/**
 * "경력 7~13년", "경력8년↑", "신입·경력 4년 이하", "경력무관", "7년~12년 차" 같은
 * 표기를 최소·최대 연차로 읽습니다. 읽지 못하면 둘 다 null.
 */
export function parseYears(experience: string): Years {
  const text = norm(experience);
  if (!text) return { min: null, max: null };
  if (/경력\s*무관|경력무관/.test(text)) return { min: null, max: null };

  const range = text.match(/(\d+)\s*(?:~|-|∼)\s*(\d+)\s*년/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };

  const over = text.match(/(\d+)\s*년\s*(?:이상|↑|이상\s*↑)/);
  if (over) return { min: Number(over[1]), max: null };

  const under = text.match(/경력\s*(\d+)\s*년\s*(?:이하|↓)/);
  if (under) return { min: 0, max: Number(under[1]) };

  const single = text.match(/경력\s*(\d+)\s*년/);
  if (single) return { min: Number(single[1]), max: null };

  if (/신입/.test(text) && !/경력/.test(text)) return { min: 0, max: 0 };
  return { min: null, max: null };
}

/* ───────────────────────────── 판정 묶음 ───────────────────────────── */

export interface TargetInput {
  company: string;
  role: string;
  location: string;
  experience: string;
  tags?: string[];
  conditions?: string;
  /** 리멤버가 주는 숫자 경력 (있으면 문장 해석보다 우선) */
  minYears?: number | null;
  maxYears?: number | null;
  /** 리멤버 '리더급 포지션' 표시 */
  leaderPosition?: boolean;
  headhunter?: boolean;
}

export type RejectReason = "region" | "role" | "junior" | "agency";

export type TargetVerdict =
  | { ok: true; companyType: CompanyType; years: Years }
  | { ok: false; reason: RejectReason; companyType: CompanyType; years: Years };

export const REJECT_LABEL: Record<RejectReason, string> = {
  region: "지방·경기",
  role: "직무 불일치",
  junior: "신입·주니어",
  agency: "에이전시·대행사",
};

/** 한 공고가 기본 타깃(서울 인하우스 홍보·PR 과차장급)에 맞는지 판정합니다. */
export function judgeTarget(job: TargetInput, profile: TargetProfile): TargetVerdict {
  const years: Years = {
    min: job.minYears ?? parseYears(job.experience).min,
    max: job.maxYears ?? parseYears(job.experience).max,
  };
  const companyType = companyTypeOf(job.company, job.role, Boolean(job.headhunter));

  if (!isSeoul(job.location)) return { ok: false, reason: "region", companyType, years };
  if (companyType === "agency") return { ok: false, reason: "agency", companyType, years };

  const roleText = job.role;
  const blocked = ROLE_BLOCKERS.some((term) => term.test(job.role));
  if (!hasPrRole(roleText) || blocked) {
    // 회사명·태그에 홍보가 들어가도 직무가 다르면 걸러냅니다.
    return { ok: false, reason: "role", companyType, years };
  }

  if (isJuniorTitle(job.role)) return { ok: false, reason: "junior", companyType, years };

  if (years.min !== null) {
    // 연차가 적혀 있으면 그 값을 믿습니다 (제목이 매니저여도 3년~ 이상이면 주니어·중간급).
    if (years.min < profile.minYears) return { ok: false, reason: "junior", companyType, years };
  } else if (years.max !== null) {
    if (years.max < profile.minYears) return { ok: false, reason: "junior", companyType, years };
  } else if (!isSeniorTitle(job.role)) {
    // 경력 표기도, 직급 신호도 없으면 과차장급으로 보기 어렵습니다.
    return { ok: false, reason: "junior", companyType, years };
  }

  return { ok: true, companyType, years };
}

/** 타깃에 맞는 공고를 앞에 두기 위한 정렬 점수 (클수록 먼저). */
export function targetScore(verdict: { companyType: CompanyType; years: Years }, role: string): number {
  let score = 0;
  if (verdict.companyType === "inhouse") score += 40;
  else if (verdict.companyType === "searchfirm") score += 20;
  if (isSeniorTitle(role)) score += 12;
  if (verdict.years.min !== null) {
    // 7년 안팎이 가장 잘 맞고, 너무 높은 연차(15년+)는 조금 뒤로.
    score += Math.max(0, 10 - Math.abs(verdict.years.min - 7));
  }
  return score;
}
