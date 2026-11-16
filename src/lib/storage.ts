import type { AiConfig, ApplicationEntry, JobPackage, MasterResume, NegotiationItem, Stage } from "../types";
import { DEFAULT_RESUME } from "./presets";

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

export function loadResume(): MasterResume {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return DEFAULT_RESUME;
    const parsed = JSON.parse(raw) as MasterResume;
    if (!parsed || !Array.isArray(parsed.experiences)) return DEFAULT_RESUME;
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
    return DEFAULT_RESUME;
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
