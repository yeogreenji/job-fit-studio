import type { CareerProfile, FitPart, FitResult, FitTone, JobPosting } from "../types";
import { CLUSTERS, countAlias } from "./korean";

/**
 * 공고 적합도 — 0~100%.
 *
 * 점수는 “서류 통과 확률”이 아니라, 저장한 커리어 프로필과 공고 원문을
 * 같은 규칙으로 비교한 값입니다. 계산에 쓴 항목·비중·근거를 화면에 그대로 보여 주고,
 * 프로필에 값이 없는 항목은 계산에서 빼서 나머지 항목으로 다시 100%를 맞춥니다.
 */

const BASE_WEIGHT: Record<FitPart["id"], number> = {
  role: 0.28,
  keywords: 0.32,
  years: 0.22,
  place: 0.1,
  salary: 0.08,
};

const STOP_TOKENS = new Set([
  "인하우스",
  "에이전시",
  "대행사",
  "과차장급",
  "과장",
  "차장",
  "부장",
  "팀장",
  "급",
  "시니어",
  "주니어",
  "경력",
  "신입",
  "담당",
  "매니저",
  "manager",
  "senior",
  "junior",
  "inhouse",
  "in-house",
  "lead",
]);

/** 직무 이름에서 자주 쓰는 동의어 — ‘PR’과 ‘홍보’를 같은 것으로 봅니다. */
const ROLE_SYNONYMS: string[][] = [
  ["pr", "홍보", "피알", "언론홍보", "public relations", "커뮤니케이션", "communication", "communications", "대외협력", "대관"],
  ["브랜드", "brand", "브랜딩"],
  ["마케팅", "marketing"],
  ["콘텐츠", "content"],
  ["기획", "planning", "strategy", "전략"],
  ["디자인", "design", "디자이너"],
  ["개발", "개발자", "engineer", "developer"],
  ["데이터", "data", "분석"],
  ["영업", "sales", "세일즈"],
  ["경영지원", "인사", "재무", "총무", "hr"],
];

const norm = (text: string): string => text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

/** 공고 원문에서 직무·요건 텍스트를 한 덩어리로 */
export function jobText(job: JobPosting): string {
  return [
    job.company,
    job.role,
    (job.tags ?? []).join(" "),
    job.experience,
    job.conditions,
    job.responsibilities,
    job.requirements,
    job.preferred,
    job.tone,
  ]
    .filter(Boolean)
    .join("\n");
}

const sameSynonym = (a: string, b: string): boolean => {
  const left = norm(a);
  const right = norm(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return ROLE_SYNONYMS.some((group) => group.includes(left) && group.includes(right));
};

/** 키워드가 본문에 있는지 — 사전 클러스터(동의어)까지 확인합니다. */
export function keywordHit(text: string, keyword: string): boolean {
  const term = keyword.trim();
  if (!term) return false;
  if (countAlias(text, term) > 0) return true;
  const cluster = CLUSTERS.find(
    (item) => norm(item.label) === norm(term) || item.aliases.some((alias) => norm(alias) === norm(term)),
  );
  return cluster ? cluster.aliases.some((alias) => countAlias(text, alias) > 0) : false;
}

/** "경력 7~13년", "경력 8년↑", "신입·경력 4년 이하" 같은 표기를 최소·최대 연차로 */
export function parseYearsText(experience: string): { min: number | null; max: number | null } {
  const text = norm(experience);
  if (!text) return { min: null, max: null };
  if (/경력\s*무관|경력무관/.test(text)) return { min: null, max: null };

  const range = text.match(/(\d+)\s*(?:~|-|∼|∼)\s*(\d+)\s*년/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const over = text.match(/(\d+)\s*년\s*(?:이상|↑)/);
  if (over) return { min: Number(over[1]), max: null };
  const under = text.match(/경력\s*(\d+)\s*년\s*(?:이하|↓)/);
  if (under) return { min: 0, max: Number(under[1]) };
  const single = text.match(/경력\s*(\d+)\s*년/);
  if (single) return { min: Number(single[1]), max: null };
  if (/신입/.test(text) && !/경력/.test(text)) return { min: 0, max: 0 };
  return { min: null, max: null };
}

/** 급여 표기에서 만원 단위 숫자를 읽습니다. 읽지 못하면 null (추정하지 않습니다). */
export function parseSalaryText(salary: string): { min: number | null; max: number | null } {
  const text = (salary ?? "").replace(/\s+/g, " ");
  if (!text || /면접|협의|내규|추후|미정/.test(text)) return { min: null, max: null };
  const numbers = [...text.matchAll(/(\d[\d,]{2,})\s*(억|만원|만|천만)?/g)]
    .map((match) => {
      const value = Number(match[1].replace(/,/g, ""));
      if (!Number.isFinite(value)) return null;
      if (match[2] === "억") return value * 10_000;
      if (value >= 100_000) return Math.round(value / 10_000);
      return value;
    })
    .filter((value): value is number => value !== null && value > 0 && value <= 100_000);
  if (!numbers.length) return { min: null, max: null };
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));

export function fitLabelFor(score: number): { label: string; tone: FitTone } {
  if (score >= 80) return { label: "매우 적합", tone: "high" };
  if (score >= 65) return { label: "적합", tone: "mid" };
  if (score >= 50) return { label: "보완 필요", tone: "low" };
  return { label: "맞지 않음", tone: "bad" };
}

const roleTokens = (role: string): string[] =>
  role
    .split(/[\s·,/|()+]+/)
    .map((token) => token.replace(/[()]/g, "").trim())
    .filter((token) => token.length >= 2 && !STOP_TOKENS.has(norm(token)));

const tokenHit = (text: string, token: string): boolean => {
  if (countAlias(text, token) > 0) return true;
  return ROLE_SYNONYMS.some((group) => group.some((word) => sameSynonym(word, token)) && group.some((word) => countAlias(text, word) > 0));
};

export function scoreFit(profile: CareerProfile | null, job: JobPosting): FitResult {
  const empty: FitResult = {
    score: 0,
    label: "프로필 필요",
    tone: "low",
    parts: [],
    matched: [],
    missing: [],
    excluded: [],
    reasons: ["커리어 프로필을 저장하면 공고마다 적합도를 계산합니다."],
    needsProfile: true,
  };
  if (!profile) return empty;

  const text = jobText(job);
  const title = [job.role, (job.tags ?? []).join(" "), job.company].filter(Boolean).join(" ");
  const parts: FitPart[] = [];
  const reasons: string[] = [];

  /* 1) 직무 */
  const tokens = roleTokens(profile.role);
  if (tokens.length) {
    const hits = tokens.filter((token) => tokenHit(title, token));
    const score = Math.round((hits.length / tokens.length) * 100);
    parts.push({
      id: "role",
      label: "직무 일치",
      weight: BASE_WEIGHT.role,
      score,
      available: true,
      note: hits.length
        ? `공고 직무에 ‘${hits.join("·")}’가 있습니다`
        : `공고 직무(${job.role || "미확인"})에 ‘${tokens.join("·")}’가 없습니다`,
    });
    reasons.push(`직무 ${score}점`);
  } else {
    parts.push({ id: "role", label: "직무 일치", weight: BASE_WEIGHT.role, score: 0, available: false, note: "대표 직무를 입력하면 계산합니다" });
  }

  /* 2) 핵심 키워드 */
  const matched: string[] = [];
  const missing: string[] = [];
  if (profile.keywords.length) {
    for (const keyword of profile.keywords) {
      if (keywordHit(text, keyword)) matched.push(keyword);
      else missing.push(keyword);
    }
    const score = Math.round((matched.length / profile.keywords.length) * 100);
    parts.push({
      id: "keywords",
      label: "핵심 키워드",
      weight: BASE_WEIGHT.keywords,
      score,
      available: true,
      note: `${profile.keywords.length}개 중 ${matched.length}개가 공고 본문에 있습니다`,
    });
    reasons.push(`키워드 ${matched.length}/${profile.keywords.length}`);
  } else {
    parts.push({ id: "keywords", label: "핵심 키워드", weight: BASE_WEIGHT.keywords, score: 0, available: false, note: "핵심 키워드를 넣으면 공고 문장과 대조합니다" });
  }

  /* 3) 경력 연차 */
  const years = parseYearsText(job.experience ?? "");
  if (profile.years !== null) {
    let score = 55;
    let note = "공고에 경력 조건이 적혀 있지 않습니다";
    if (years.min !== null) {
      if (profile.years >= years.min) {
        if (years.max !== null && profile.years > years.max) {
          score = 75;
          note = `요건(최대 ${years.max}년)보다 경력이 많습니다`;
        } else {
          score = 100;
          note = `요건(최소 ${years.min}년)을 충족합니다`;
        }
      } else {
        score = clamp(100 - (years.min - profile.years) * 25);
        note = `요건 최소 ${years.min}년보다 ${years.min - profile.years}년 부족합니다`;
      }
    } else if (years.max !== null) {
      score = profile.years <= years.max ? 90 : 40;
      note = profile.years <= years.max ? `요건(최대 ${years.max}년) 안에 있습니다` : `요건(최대 ${years.max}년)을 넘습니다`;
    }
    parts.push({ id: "years", label: "경력 연차", weight: BASE_WEIGHT.years, score, available: true, note });
    reasons.push(`경력 ${score}점`);
  } else {
    parts.push({ id: "years", label: "경력 연차", weight: BASE_WEIGHT.years, score: 0, available: false, note: "경력 연차를 입력하면 요건과 비교합니다" });
  }

  /* 4) 근무 조건 (지역·인하우스) */
  const location = job.location ?? "";
  const locationKnown = profile.locations.length > 0;
  const locationHit = locationKnown ? profile.locations.some((place) => place === "재택" ? /재택|원격/.test(location) : location.includes(place)) : null;
  const typeKnown = profile.inhouseOnly;
  const typeHit = typeKnown ? (job.companyType === "agency" ? false : job.companyType === "unknown" ? null : true) : null;
  if (locationKnown || typeKnown) {
    const checks: number[] = [];
    if (locationHit !== null) checks.push(locationHit ? 100 : 0);
    if (typeHit !== null) checks.push(typeHit ? 100 : 20);
    const score = checks.length ? Math.round(checks.reduce((a, b) => a + b, 0) / checks.length) : 55;
    const notes = [
      locationHit === true ? `${profile.locations.join("·")} 근무` : locationHit === false ? `근무지 ${location || "미확인"}` : "",
      typeHit === false ? "에이전시 공고 (인하우스 선호와 다름)" : typeHit === true ? "인하우스" : "",
    ].filter(Boolean);
    parts.push({ id: "place", label: "근무 조건", weight: BASE_WEIGHT.place, score, available: true, note: notes.join(" · ") || "확인 가능한 값이 없습니다" });
    if (profile.inhouseOnly && typeHit === false) reasons.push("에이전시");
  } else {
    parts.push({ id: "place", label: "근무 조건", weight: BASE_WEIGHT.place, score: 0, available: false, note: "선호 지역·인하우스 여부를 정하면 반영합니다" });
  }

  /* 5) 희망 연봉 */
  const salary = parseSalaryText(job.salary ?? "");
  if (profile.salary !== null) {
    let score = 55;
    let note = "공고에 급여가 적혀 있지 않습니다";
    if (salary.max !== null) {
      if (profile.salary <= salary.max) {
        score = 100;
        note = `공고 상한 ${salary.max.toLocaleString("ko-KR")}만원 이상`;
      } else {
        score = clamp(Math.round((salary.max / profile.salary) * 100));
        note = `공고 상한 ${salary.max.toLocaleString("ko-KR")}만원 < 희망 ${profile.salary.toLocaleString("ko-KR")}만원`;
      }
    }
    parts.push({ id: "salary", label: "희망 연봉", weight: BASE_WEIGHT.salary, score, available: true, note });
    if (salary.max !== null && profile.salary > salary.max) reasons.push("연봉 차이");
  } else {
    parts.push({ id: "salary", label: "희망 연봉", weight: BASE_WEIGHT.salary, score: 0, available: false, note: "희망 연봉을 넣으면 공고 급여와 비교합니다" });
  }

  /* 제외 키워드 — 하나라도 걸리면 최종 점수를 크게 낮춥니다. */
  const excluded = profile.exclude.filter((keyword) => keyword.trim() && countAlias(text, keyword) > 0);
  if (excluded.length) reasons.unshift(`제외 키워드: ${excluded.join("·")}`);
  // 인하우스만 보기로 해 두었으면 에이전시 공고는 위에 다른 점수가 좋아도 낮게 둡니다.
  const agencyBlocked = profile.inhouseOnly && job.companyType === "agency";

  const active = parts.filter((part) => part.available);
  const totalWeight = active.reduce((sum, part) => sum + part.weight, 0);
  const weighted = totalWeight > 0 ? active.reduce((sum, part) => sum + part.score * part.weight, 0) / totalWeight : 0;
  let score = Math.round(weighted);
  if (excluded.length) score = Math.min(score, 32);
  if (agencyBlocked) score = Math.min(score, 45);
  score = clamp(score);

  // 화면에 보이는 비중은 실제 계산에 쓰인 항목만 100%로 맞춥니다.
  const visible = parts.map((part) => ({
    ...part,
    weight: part.available && totalWeight > 0 ? Number((part.weight / totalWeight).toFixed(3)) : 0,
  }));

  const { label, tone } = fitLabelFor(score);
  return {
    score,
    label: excluded.length ? "제외 조건" : agencyBlocked ? "인하우스 아님" : label,
    tone: excluded.length || agencyBlocked ? "bad" : tone,
    parts: visible,
    matched,
    missing,
    excluded,
    reasons,
    needsProfile: active.length === 0,
  };
}

/** 목록에서 빠르게 쓸 수 있는 한 줄 (툴팁·검색용) */
export function fitHint(fit: FitResult): string {
  if (fit.needsProfile) return "커리어 프로필을 저장하면 적합도가 나옵니다.";
  const lines = fit.parts.filter((part) => part.available).map((part) => `${part.label} ${part.score} — ${part.note}`);
  if (fit.excluded.length) lines.unshift(`제외 키워드: ${fit.excluded.join(", ")}`);
  return lines.join("\n");
}
