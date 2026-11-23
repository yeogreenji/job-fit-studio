import type { PlanId, PlanState } from "../types";

/**
 * 요금제 — Free / Pro / 3개월 이직 패스.
 *
 * 결제는 아직 붙이지 않았습니다. 이 파일은 ‘무엇이 어느 플랜에 열리는지’만 정의하고,
 * 화면에서는 데모 활성화(무료 체험)로 같은 상태를 만들어 실제 잠금 동작을 확인합니다.
 * 실제 PG 연동 시에는 `persistPlan`을 서버 영수증 기준으로 바꾸면 됩니다.
 */

export const PLAN_KEY = "jobfit.plan.v1";

export const TRIAL_DAYS = 14;
export const PASS_DAYS = 90;
/** Free에서 담아 둘 수 있는 공고 수 */
export const FREE_PIPELINE_LIMIT = 5;

export const EMPTY_PLAN: PlanState = {
  plan: "free",
  trial: false,
  startedAt: "",
  expiresAt: null,
};

export interface PlanMeta {
  id: PlanId;
  name: string;
  price: number;
  priceLabel: string;
  period: string;
  tagline: string;
  /** 아래 목록은 카드에 그대로 보이는 짧은 문구 */
  bullets: string[];
  popular?: boolean;
  cta: string;
}

export const PLANS: PlanMeta[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceLabel: "0원",
    period: "계속 무료",
    tagline: "공고를 모으고, 내 기준으로 점수를 봅니다",
    bullets: [
      "리멤버·원티드·사람인·잡코리아 실시간 자동 수집",
      "커리어 프로필 기반 적합도 0~100%와 산출 근거",
      "PDF·TXT 이력서 등록과 프로필 자동 채움",
      "한 줄 어필·지원서 초안(규칙 엔진)",
      "지원 파이프라인 5건까지",
    ],
    cta: "무료로 사용 중",
  },
  {
    id: "pro",
    name: "Pro",
    price: 19900,
    priceLabel: "월 19,900원",
    period: "월 구독 · 언제든 해지",
    tagline: "지원서 한 건을 끝까지 끌고 갑니다",
    bullets: [
      "Free의 모든 기능",
      "지원 패키지 4종 전체 — 어필 3선·1분 자기소개·면접 질문 5·연봉 협상",
      "AI 문장 다듬기(Gemini) 무제한",
      "90초 면접 연습과 답변 평가, 역질문",
      "지원 파이프라인 무제한 · MD/인쇄 내보내기",
    ],
    popular: true,
    cta: "Pro 무료 체험",
  },
  {
    id: "pass",
    name: "3개월 이직 패스",
    price: 49000,
    priceLabel: "49,000원",
    period: "3개월 1회 결제",
    tagline: "이직 한 번에 집중하는 기간제",
    bullets: [
      "Pro와 같은 기능 전부",
      "3개월 동안 무제한 지원 준비",
      "월 16,333원꼴 — 구독보다 18% 저렴",
      "기간이 끝나면 자동으로 Free로 돌아감",
    ],
    cta: "패스 활성화 (데모)",
  },
];

export const planById = (id: PlanId): PlanMeta => PLANS.find((plan) => plan.id === id) ?? PLANS[0];

const FEATURE_ROWS: { label: string; hint: string; free: string; pro: string; pass: string }[] = [
  { label: "공고 자동 수집", hint: "리멤버·원티드·사람인·잡코리아", free: "무제한", pro: "무제한", pass: "무제한" },
  { label: "적합도·산출 근거", hint: "직무·키워드·연차·조건·연봉", free: "포함", pro: "포함", pass: "포함" },
  { label: "PDF·TXT 이력서 → 프로필", hint: "직무·연차·키워드·요약 자동 채움", free: "포함", pro: "포함", pass: "포함" },
  { label: "한 줄 어필·지원서 초안", hint: "규칙 엔진", free: "포함", pro: "포함", pass: "포함" },
  { label: "지원 패키지 4종", hint: "어필 3선·자기소개·면접 5·협상", free: "첫 항목만", pro: "전체", pass: "전체" },
  { label: "AI 문장 다듬기", hint: "Gemini로 다시 쓰기", free: "—", pro: "무제한", pass: "무제한" },
  { label: "연봉 협상 스크립트", hint: "첫 제안·차액 대응·비연봉 카드", free: "—", pro: "포함", pass: "포함" },
  { label: "90초 면접 연습", hint: "답변 평가·역질문", free: "—", pro: "포함", pass: "포함" },
  { label: "지원 파이프라인", hint: "담아 둔 공고 관리", free: "5건까지", pro: "무제한", pass: "무제한" },
  { label: "MD·인쇄 내보내기", hint: "지원 패키지 출력", free: "지원 문구만", pro: "포함", pass: "포함" },
];

export const FEATURES = FEATURE_ROWS;

export const FAQ: { q: string; a: string }[] = [
  {
    q: "지금 결제가 되나요?",
    a: "아직 결제(PG) 연동 전입니다. 그래서 지금은 ‘Pro 무료 체험(데모)’으로 Pro 기능을 먼저 열어 확인할 수 있게 두었습니다. 실제 카드 결제는 붙이지 않았고, 이 화면에서 어떤 결제도 일어나지 않습니다.",
  },
  {
    q: "Free로 어디까지 할 수 있나요?",
    a: "공고 자동 수집, 적합도와 산출 근거, PDF·TXT 이력서에서 프로필 자동 채움, 한 줄 어필과 지원서 초안, 지원 파이프라인 5건까지는 계속 무료입니다.",
  },
  {
    q: "Pro와 3개월 이직 패스는 무엇이 다른가요?",
    a: "기능은 같습니다. Pro는 월 19,900원 구독이고, 패스는 49,000원을 한 번 결제해 3개월 쓰는 방식(월 16,333원꼴)입니다. 이직을 3개월 안에 끝낼 계획이면 패스가, 기간이 유동적이면 Pro가 맞습니다.",
  },
  {
    q: "쿠폰이나 할인은 있나요?",
    a: "아직 없습니다. 결제 연동과 함께 첫 달 할인·이직 시즌 쿠폰을 넣을 예정이고, 그때 이 화면에 조건을 그대로 적습니다.",
  },
  {
    q: "해지하면 어떻게 되나요?",
    a: "Free로 돌아가고, 담아 둔 공고·프로필·이력서는 그대로 남습니다. 다만 5건을 넘는 파이프라인 카드는 읽기만 되고 새로 담을 수 없습니다.",
  },
  {
    q: "내 이력서는 어디에 저장되나요?",
    a: "이 브라우저(localStorage)에만 저장됩니다. 서버에 이력서를 보관하지 않고, AI를 쓸 때만 요청 본문으로 전달합니다.",
  },
];

/* ── 상태 ── */

const isPlanId = (value: unknown): value is PlanId => value === "free" || value === "pro" || value === "pass";

const addDays = (iso: string, days: number): string => {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString();
};

/** 기간이 끝난 패스·체험은 Free로 되돌립니다. */
export function normalizePlan(state: PlanState | null | undefined): PlanState {
  if (!state || !isPlanId(state.plan)) return { ...EMPTY_PLAN };
  const expires = state.expiresAt;
  if ((state.plan === "pass" || state.trial) && expires && new Date(expires).getTime() < Date.now()) {
    return { ...EMPTY_PLAN };
  }
  return {
    plan: state.plan,
    trial: Boolean(state.trial && state.plan === "pro"),
    startedAt: typeof state.startedAt === "string" ? state.startedAt : "",
    expiresAt: typeof expires === "string" && expires ? expires : null,
  };
}

export function loadPlan(): PlanState {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return { ...EMPTY_PLAN };
    return normalizePlan(JSON.parse(raw) as PlanState);
  } catch {
    return { ...EMPTY_PLAN };
  }
}

export function persistPlan(state: PlanState) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(state));
  } catch {
    /* 저장 공간이 없으면 조용히 넘어갑니다 */
  }
}

/** 데모 활성화 — 결제 없이 Pro 상태를 만듭니다 (14일) */
export function activateTrial(now = new Date().toISOString()): PlanState {
  return { plan: "pro", trial: true, startedAt: now, expiresAt: addDays(now, TRIAL_DAYS) };
}

/** 데모 활성화 — 3개월 이직 패스 (90일) */
export function activatePass(now = new Date().toISOString()): PlanState {
  return { plan: "pass", trial: false, startedAt: now, expiresAt: addDays(now, PASS_DAYS) };
}

export function deactivatePlan(): PlanState {
  return { ...EMPTY_PLAN };
}

export interface PlanFeatures {
  /** 지원 패키지 4종 전체 (Free는 첫 항목만) */
  fullKit: boolean;
  /** AI 문장 다듬기 */
  aiRefine: boolean;
  /** 연봉 협상 스크립트 */
  negotiation: boolean;
  /** 90초 면접 연습·심층 준비 */
  deepPrep: boolean;
  /** 담을 수 있는 공고 수 */
  pipelineLimit: number;
}

export function featuresOf(state: PlanState): PlanFeatures {
  const normalized = normalizePlan(state);
  const paid = normalized.plan === "pro" || normalized.plan === "pass";
  return {
    fullKit: paid,
    aiRefine: paid,
    negotiation: paid,
    deepPrep: paid,
    pipelineLimit: paid ? Number.POSITIVE_INFINITY : FREE_PIPELINE_LIMIT,
  };
}

export function planLabel(state: PlanState): string {
  const normalized = normalizePlan(state);
  if (normalized.plan === "pro") return normalized.trial ? "Pro 체험" : "Pro";
  if (normalized.plan === "pass") return "이직 패스";
  return "Free";
}

/** 체험·패스 남은 날 (없으면 null) */
export function daysLeft(state: PlanState): number | null {
  const normalized = normalizePlan(state);
  if (!normalized.expiresAt) return null;
  const end = new Date(normalized.expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}
