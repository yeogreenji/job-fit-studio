import type { PlanId, PlanState } from "../types";

/**
 * 요금제 — Free / 1개월 집중 / 3개월 이직 패스 / 프리미엄 커리어 패스.
 *
 * 결제는 아직 붙이지 않았습니다. 이 파일은 ‘무엇이 어느 플랜에 열리는지’만 정의하고,
 * 화면에서는 데모 활성화(무료 체험)로 같은 상태를 만들어 실제 잠금 동작을 확인합니다.
 * 실제 PG 연동 시에는 `persistPlan`을 서버 영수증 기준으로 바꾸면 됩니다.
 */

export const PLAN_KEY = "jobfit.plan.v1";

export const TRIAL_DAYS = 14;
/** 기간제 상품의 이용 일수 */
export const PLAN_DAYS: Record<PlanId, number> = { free: 0, focus: 30, pass: 90, premium: 180 };
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
  /** 카드 위 작은 표시 (기간·대상) */
  badge?: string;
}

export const PLANS: PlanMeta[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceLabel: "0원",
    period: "계속 무료",
    tagline: "공고를 모으고, 내 이력서 기준으로 점수를 봅니다",
    bullets: [
      "리멤버·원티드·사람인·잡코리아 실시간 수집",
      "이력서 업로드 → 프로필 자동 채움 → 맞춤 공고 자동 수집",
      "적합도 0~100%와 산출 근거 · 서류 대조",
      "한 줄 어필·지원 동기·바로 지원하기",
      "지원 파이프라인 5건까지",
    ],
    cta: "무료로 사용 중",
    badge: "기본",
  },
  {
    id: "focus",
    name: "1개월 집중",
    price: 49000,
    priceLabel: "49,000원",
    period: "1개월 · 1회 결제",
    tagline: "지원서 서너 건을 몰아서 끝내는 한 달",
    bullets: [
      "Free의 모든 기능",
      "지원 패키지 4종 전체 — 어필 3선·1분 자기소개·면접 질문 5·연봉 협상",
      "AI 문장 다듬기 무제한",
      "90초 면접 연습과 답변 평가",
      "지원 파이프라인 무제한 · MD/인쇄 내보내기",
    ],
    cta: "1개월 시작 (데모)",
    badge: "단기",
  },
  {
    id: "pass",
    name: "3개월 이직 패스",
    price: 119000,
    priceLabel: "119,000원",
    period: "3개월 · 1회 결제",
    tagline: "이직을 끝낼 때까지 쓰는 3개월",
    bullets: [
      "1개월 집중의 모든 기능",
      "3개월 동안 지원 준비 무제한",
      "월 39,667원꼴 — 1개월씩 세 번 결제보다 20% 저렴",
      "기간이 끝나면 자동으로 Free로 돌아감",
    ],
    popular: true,
    cta: "3개월 패스 시작 (데모)",
    badge: "가장 많이 고름",
  },
  {
    id: "premium",
    name: "프리미엄 커리어 패스",
    price: 249000,
    priceLabel: "249,000원",
    period: "6개월 · 1회 결제",
    tagline: "연봉 협상과 심층 분석까지, 반년 동안",
    bullets: [
      "3개월 이직 패스의 모든 기능",
      "6개월 이용 — 이직·연봉 협상 두 번의 기회",
      "연봉 협상·심층 분석 무제한",
      "지원 현황 전체 내보내기(CSV) — 회사·직무·상태·마감·메모",
      "새 기능 우선 공개",
    ],
    cta: "프리미엄 시작 (데모)",
    badge: "장기",
  },
];

export const planById = (id: PlanId): PlanMeta => PLANS.find((plan) => plan.id === id) ?? PLANS[0];

export interface FeatureRow {
  label: string;
  hint: string;
  free: string;
  focus: string;
  pass: string;
  premium: string;
}

const ALL = "포함";

export const FEATURE_ROWS: FeatureRow[] = [
  { label: "공고 자동 수집", hint: "리멤버·원티드·사람인·잡코리아", free: "무제한", focus: "무제한", pass: "무제한", premium: "무제한" },
  { label: "이력서 → 프로필 자동 채움", hint: "AI·규칙으로 직무·연차·키워드 추출", free: ALL, focus: ALL, pass: ALL, premium: ALL },
  { label: "내 이력서 기준 공고 자동 수집", hint: "업로드 즉시 맞춤 공고와 대조", free: ALL, focus: ALL, pass: ALL, premium: ALL },
  { label: "적합도·산출 근거", hint: "직무·키워드·연차·조건·연봉", free: ALL, focus: ALL, pass: ALL, premium: ALL },
  { label: "바로 지원하기·접수 기록", hint: "맞춤 문구·제출 시각·서류", free: ALL, focus: ALL, pass: ALL, premium: ALL },
  { label: "지원 패키지 4종", hint: "어필 3선·자기소개·면접 5·협상", free: "첫 항목만", focus: "전체", pass: "전체", premium: "전체" },
  { label: "AI 문장 다듬기", hint: "Gemini로 다시 쓰기", free: "—", focus: "무제한", pass: "무제한", premium: "무제한" },
  { label: "연봉 협상 스크립트", hint: "첫 제안·차액 대응·비연봉 카드", free: "—", focus: ALL, pass: ALL, premium: "무제한" },
  { label: "90초 면접 연습", hint: "답변 평가·역질문", free: "—", focus: ALL, pass: ALL, premium: "무제한" },
  { label: "지원 파이프라인", hint: "담아 둔 공고 관리", free: "5건까지", focus: "무제한", pass: "무제한", premium: "무제한" },
  { label: "MD·인쇄 내보내기", hint: "지원 패키지 출력", free: "지원 문구만", focus: ALL, pass: ALL, premium: ALL },
  { label: "지원 현황 전체 내보내기", hint: "CSV — 회사·상태·마감·메모", free: "—", focus: "—", pass: "—", premium: ALL },
];

export const FEATURES = FEATURE_ROWS;

export const FAQ: { q: string; a: string }[] = [
  {
    q: "지금 결제가 되나요?",
    a: "아직 결제(PG) 연동 전입니다. 그래서 지금은 ‘14일 무료 체험’으로 유료 기능을 먼저 열어 확인할 수 있게 두었습니다. 실제 카드 결제는 붙이지 않았고, 이 화면에서 어떤 결제도 일어나지 않습니다.",
  },
  {
    q: "왜 3개월 패스가 119,000원인가요?",
    a: "지원서 한 건을 제대로 준비하는 데 드는 시간과 비교해 정한 가격입니다. 공고 수집·적합도·이력서 분석은 계속 무료이고, 유료는 지원서를 끝까지 끌고 가는 기능(패키지 4종·AI 다듬기·면접 연습·무제한 관리)입니다. 1개월 49,000원을 세 번 결제하면 147,000원이라 3개월 패스가 20% 저렴합니다.",
  },
  {
    q: "Free로 어디까지 할 수 있나요?",
    a: "이력서 업로드와 프로필 자동 채움, 내 이력서 기준 공고 자동 수집, 적합도와 근거, 한 줄 어필·지원 동기, 바로 지원하기와 접수 기록, 지원 파이프라인 5건까지는 계속 무료입니다.",
  },
  {
    q: "프리미엄은 무엇이 다른가요?",
    a: "기간이 6개월이고, 연봉 협상과 심층 분석을 무제한으로 씁니다. 지원 현황 전체를 CSV로 내려받아 엑셀에서 관리할 수 있습니다. 1개월 집중·3개월 패스의 기능은 모두 들어 있습니다.",
  },
  {
    q: "해지하면 어떻게 되나요?",
    a: "기간이 끝나면 Free로 돌아가고, 담아 둔 공고·프로필·이력서는 그대로 남습니다. 다만 5건을 넘는 파이프라인 카드는 읽기만 되고 새로 담을 수 없습니다.",
  },
  {
    q: "내 이력서는 어디에 저장되나요?",
    a: "이 브라우저(localStorage)에만 저장됩니다. 서버에 이력서를 보관하지 않고, 프로필 추출·문장 생성을 요청할 때만 본문을 전송합니다.",
  },
];

/* ── 상태 ── */

const PLAN_IDS: PlanId[] = ["free", "focus", "pass", "premium"];

/** 예전 저장값(pro)을 새 상품(1개월 집중)으로 옮깁니다. */
const migrateId = (value: unknown): PlanId => {
  if (value === "pro") return "focus";
  return PLAN_IDS.includes(value as PlanId) ? (value as PlanId) : "free";
};

const addDays = (iso: string, days: number): string => {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  return base.toISOString();
};

/** 기간이 끝난 유료 기간제·체험은 Free로 되돌립니다. */
export function normalizePlan(state: PlanState | null | undefined): PlanState {
  if (!state) return { ...EMPTY_PLAN };
  const plan = migrateId((state as { plan?: unknown }).plan);
  if (plan === "free") return { ...EMPTY_PLAN };
  const expires = state.expiresAt;
  const trial = Boolean(state.trial);
  if (expires && new Date(expires).getTime() < Date.now()) return { ...EMPTY_PLAN };
  return {
    plan,
    trial,
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

/** 데모 활성화 — 결제 없이 14일 동안 유료 기능(3개월 패스와 같은 범위)을 엽니다. */
export function activateTrial(now = new Date().toISOString()): PlanState {
  return { plan: "pass", trial: true, startedAt: now, expiresAt: addDays(now, TRIAL_DAYS) };
}

/** 데모 활성화 — 상품 기간만큼 엽니다. */
export function activatePlan(id: Exclude<PlanId, "free">, now = new Date().toISOString()): PlanState {
  return { plan: id, trial: false, startedAt: now, expiresAt: addDays(now, PLAN_DAYS[id]) };
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
  /** 지원 현황 전체 CSV 내보내기 (프리미엄) */
  deskExport: boolean;
  /** 담을 수 있는 공고 수 */
  pipelineLimit: number;
}

export function featuresOf(state: PlanState): PlanFeatures {
  const normalized = normalizePlan(state);
  const paid = normalized.plan !== "free";
  return {
    fullKit: paid,
    aiRefine: paid,
    negotiation: paid,
    deepPrep: paid,
    deskExport: normalized.plan === "premium",
    pipelineLimit: paid ? Number.POSITIVE_INFINITY : FREE_PIPELINE_LIMIT,
  };
}

export function planLabel(state: PlanState): string {
  const normalized = normalizePlan(state);
  if (normalized.plan === "focus") return normalized.trial ? "무료 체험" : "1개월 집중";
  if (normalized.plan === "pass") return normalized.trial ? "무료 체험" : "이직 패스";
  if (normalized.plan === "premium") return "프리미엄";
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
