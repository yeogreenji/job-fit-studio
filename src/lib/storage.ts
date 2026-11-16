import type { AiConfig, ApplicationEntry, JobPackage, MasterResume, NegotiationItem, PriorityId, Stage } from "../types";
import { EMPTY_RESUME } from "./presets";

const RESUME_KEY = "jobfit.resume.v1";
const PACKAGES_KEY = "jobfit.packages.v1";
const API_KEY = "jobfit.api.v2";
const LEGACY_API_KEY = "jobfit.api.v1";
const TRACKER_KEY = "jobfit.tracker.v1";
const MAX_PACKAGES = 20;

export const STAGES: Stage[] = ["준비중", "서류", "1차", "2차", "최종", "오퍼"];

export const NEGOTIATION_TEMPLATE: { id: string; label: string }[] = [
  { id: "base", label: "희망·현재 연봉을 숫자로 정리했다" },
  { id: "bonus", label: "베이스 외 보상(인센티브·사이닝·스톡)을 확인했다" },
  { id: "title", label: "직급·타이틀과 역할 범위를 글로 확인했다" },
  { id: "work", label: "근무 형태(재택·유연근무·코어타임)를 물었다" },
  { id: "leave", label: "연차·휴가 규정과 실제 사용 관행을 확인했다" },
  { id: "growth", label: "성장 예산(교육·컨퍼런스·장비)을 확인했다" },
  { id: "start", label: "입사일과 온보딩 계획을 협의했다" },
  { id: "letter", label: "오퍼레터에 구두 합의가 모두 반영됐는지 대조했다" },
];

export const freshNegotiation = (): NegotiationItem[] => NEGOTIATION_TEMPLATE.map((item) => ({ ...item, done: false }));

/**
 * 저장된 이력서를 읽습니다. 아직 등록 전이면 빈 이력서를 돌려줍니다.
 * (예시 이력서는 ‘샘플로 체험’을 눌렀을 때만 들어갑니다 — 처음 화면이 예시처럼 보이지 않게)
 */
export function loadResume(): MasterResume {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return { ...EMPTY_RESUME, experiences: EMPTY_RESUME.experiences.map((exp) => ({ ...exp, bullets: exp.bullets.map((b) => ({ ...b })) })) };
    const parsed = JSON.parse(raw) as MasterResume;
    if (!parsed || !Array.isArray(parsed.experiences)) return EMPTY_RESUME;
    return {
      ...parsed,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      industries: Array.isArray(parsed.industries) ? parsed.industries : [],
      experiences: parsed.experiences.map((exp) => ({
        ...exp,
        bullets: Array.isArray(exp.bullets) ? exp.bullets : [],
      })),
    };
  } catch {
    return EMPTY_RESUME;
  }
}

export function persistResume(resume: MasterResume) {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify(resume));
  } catch {
    /* 저장 공간이 없으면 조용히 넘어갑니다 */
  }
}

const normalizePackage = (pkg: JobPackage): JobPackage => {
  const engine = (pkg as { engine?: string }).engine;
  return {
    ...pkg,
    engine: engine === "ai" || engine === "llm" ? "ai" : "rule",
    questions: Array.isArray(pkg.questions) ? pkg.questions : [],
    rewrites: Array.isArray(pkg.rewrites) ? pkg.rewrites : [],
    feedback: Array.isArray(pkg.feedback) ? pkg.feedback : [],
  };
};

export function loadPackages(): JobPackage[] {
  try {
    const raw = localStorage.getItem(PACKAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JobPackage[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.id === "string" && typeof p.match?.score === "number" && p.company)
      .map(normalizePackage)
      .slice(0, MAX_PACKAGES);
  } catch {
    return [];
  }
}

export function persistPackages(packages: JobPackage[]) {
  try {
    localStorage.setItem(PACKAGES_KEY, JSON.stringify(packages.slice(0, MAX_PACKAGES)));
  } catch {
    /* ignore */
  }
}

export function addPackage(packages: JobPackage[], pkg: JobPackage): JobPackage[] {
  const next = [pkg, ...packages.filter((p) => p.id !== pkg.id)].slice(0, MAX_PACKAGES);
  persistPackages(next);
  return next;
}

export function updatePackage(packages: JobPackage[], pkg: JobPackage): JobPackage[] {
  const exists = packages.some((p) => p.id === pkg.id);
  const next = exists ? packages.map((p) => (p.id === pkg.id ? pkg : p)) : [pkg, ...packages].slice(0, MAX_PACKAGES);
  persistPackages(next);
  return next;
}

export function removePackage(packages: JobPackage[], id: string): JobPackage[] {
  const next = packages.filter((p) => p.id !== id);
  persistPackages(next);
  return next;
}

export function clearPackages(): JobPackage[] {
  persistPackages([]);
  return [];
}

const DEFAULT_AI: AiConfig = {
  apiKey: "",
  model: "gpt-4o-mini",
  sendKey: false,
};

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(API_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiConfig>;
      return { ...DEFAULT_AI, ...parsed, sendKey: Boolean(parsed.sendKey && parsed.apiKey) };
    }
    const legacy = localStorage.getItem(LEGACY_API_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as { provider?: string; apiKey?: string; model?: string };
      // 예전에 저장한 Anthropic 키는 이 서버(OpenAI)와 맞지 않으므로 옮기지 않습니다.
      if (parsed.provider === "anthropic") return DEFAULT_AI;
      return { ...DEFAULT_AI, apiKey: parsed.apiKey ?? "", model: parsed.model || DEFAULT_AI.model, sendKey: Boolean(parsed.apiKey) };
    }
    return DEFAULT_AI;
  } catch {
    return DEFAULT_AI;
  }
}

export function persistAiConfig(config: AiConfig) {
  try {
    localStorage.setItem(API_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

export function loadTracker(): ApplicationEntry[] {
  try {
    const raw = localStorage.getItem(TRACKER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ApplicationEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.id === "string" && entry.company)
      .map((entry) => ({
        ...entry,
        stage: STAGES.includes(entry.stage) ? entry.stage : "준비중",
        salary: {
          current: entry.salary?.current ?? null,
          hope: entry.salary?.hope ?? null,
          offered: entry.salary?.offered ?? null,
        },
        negotiation: NEGOTIATION_TEMPLATE.map((template) => {
          const found = (entry.negotiation ?? []).find((item) => item.id === template.id);
          return { ...template, done: Boolean(found?.done) };
        }),
      }));
  } catch {
    return [];
  }
}

export function persistTracker(entries: ApplicationEntry[]) {
  try {
    localStorage.setItem(TRACKER_KEY, JSON.stringify(entries.slice(0, 60)));
  } catch {
    /* ignore */
  }
}

export function makeEntry(input: { company: string; role: string; stage?: Stage; packageId?: string | null; score?: number | null; deadline?: string }): ApplicationEntry {
  const now = new Date().toISOString();
  return {
    id: `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    company: input.company,
    role: input.role,
    stage: input.stage ?? "준비중",
    packageId: input.packageId ?? null,
    score: input.score ?? null,
    deadline: input.deadline ?? "",
    nextAction: "",
    salary: { current: null, hope: null, offered: null },
    negotiation: freshNegotiation(),
    memo: "",
    createdAt: now,
    updatedAt: now,
  };
}

/* ── 이직 우선순위·희망 연봉 (URL·이력서 중심 재설계) ── */

const PREFS_KEY = "jobfit.prefs.v1";
const RESUME_META_KEY = "jobfit.resume.meta.v1";

export interface Prefs {
  priority: PriorityId | null;
  /** 만원 단위 희망 연봉. 입력하지 않았으면 null */
  targetSalary: number | null;
}

const DEFAULT_PREFS: Prefs = { priority: "salary", targetSalary: null };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    const valid = ["salary", "balance", "growth", "stability"];
    return {
      priority: typeof parsed.priority === "string" && valid.includes(parsed.priority) ? (parsed.priority as PriorityId) : DEFAULT_PREFS.priority,
      targetSalary:
        typeof parsed.targetSalary === "number" && Number.isFinite(parsed.targetSalary) && parsed.targetSalary > 0
          ? Math.round(parsed.targetSalary)
          : null,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function persistPrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export interface ResumeMeta {
  /** 이력서를 어떻게 등록했는지 */
  source: "file" | "manual" | "sample" | "none";
  fileName?: string;
  savedAt: string;
  /** PDF에서 뽑은 글자 수 등 참고 정보 */
  note?: string;
}

export function loadResumeMeta(): ResumeMeta | null {
  try {
    const raw = localStorage.getItem(RESUME_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeMeta;
    return parsed && typeof parsed.savedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function persistResumeMeta(meta: ResumeMeta) {
  try {
    localStorage.setItem(RESUME_META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/** 저장된 이력서가 실제로 쓸 수 있는 상태인지 (경력 문장 1개 이상) */
export function resumeReady(resume: MasterResume): boolean {
  return resume.experiences.some((exp) => exp.bullets.some((bullet) => bullet.text.trim().length > 5));
}

export function resumeBulletCount(resume: MasterResume): number {
  return resume.experiences.reduce((sum, exp) => sum + exp.bullets.filter((bullet) => bullet.text.trim().length > 5).length, 0);
}
