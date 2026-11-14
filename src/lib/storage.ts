import type { JobPackage, LlmConfig, MasterResume } from "../types";
import { DEFAULT_RESUME } from "./presets";

const RESUME_KEY = "jobfit.resume.v1";
const PACKAGES_KEY = "jobfit.packages.v1";
const API_KEY = "jobfit.api.v1";
const MAX_PACKAGES = 20;

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

export function loadPackages(): JobPackage[] {
  try {
    const raw = localStorage.getItem(PACKAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as JobPackage[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.id === "string" && typeof p.match?.score === "number" && p.company)
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

const DEFAULT_API: LlmConfig = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
  enabled: false,
};

export function loadApiConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(API_KEY);
    if (!raw) return DEFAULT_API;
    const parsed = JSON.parse(raw) as Partial<LlmConfig>;
    return { ...DEFAULT_API, ...parsed };
  } catch {
    return DEFAULT_API;
  }
}

export function persistApiConfig(config: LlmConfig) {
  try {
    localStorage.setItem(API_KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}
