export type SectionId = "responsibilities" | "requirements" | "preferred" | "tone";

export interface Bullet {
  id: string;
  text: string;
}

export interface Experience {
  id: string;
  company: string;
  role: string;
  period: string;
  employment: string;
  bullets: Bullet[];
}

export interface MasterResume {
  id: string;
  name: string;
  headline: string;
  years: number;
  summary: string;
  experiences: Experience[];
  skills: string[];
  industries: string[];
}

export interface JobPosting {
  id: string;
  company: string;
  role: string;
  employmentType: string;
  location: string;
  deadline: string;
  responsibilities: string;
  requirements: string;
  preferred: string;
  tone: string;
}

export type KeywordStatus = "matched" | "weak" | "missing";

export interface Evidence {
  bulletId: string;
  text: string;
  company: string;
  role: string;
}

export interface KeywordItem {
  id: string;
  label: string;
  cluster: string;
  group: "core" | "industry";
  weight: number;
  weightPct: number;
  sections: SectionId[];
  sectionLabel: string;
  snippet: string;
  hits: number;
  resumeHits: number;
  labelHits: number;
  coverage: number;
  status: KeywordStatus;
  evidence: Evidence[];
}

export interface ToneAxis {
  id: string;
  label: string;
  job: number;
  resume: number;
  note: string;
}

export interface ToneProfile {
  label: string;
  summary: string;
  axes: ToneAxis[];
}

export interface SubScore {
  id: string;
  label: string;
  score: number;
  weight: number;
  note: string;
}

export type GradeTone = "high" | "mid" | "low" | "bad";

export interface Grade {
  label: string;
  tone: GradeTone;
  desc: string;
}

export interface MatchResult {
  score: number;
  grade: Grade;
  subs: SubScore[];
  keywords: KeywordItem[];
  tone: ToneProfile;
  matchedCount: number;
  weakCount: number;
  missingCount: number;
  requiredYears: number | null;
  industry: string | null;
  industryMatch: boolean;
  summaryLine: string;
  resumeKeywordCount: number;
}

export interface RewriteItem {
  id: string;
  experienceId: string;
  company: string;
  role: string;
  period: string;
  order: number;
  before: string;
  after: string;
  matched: string[];
  added: string | null;
  reason: string;
  relevance: number;
  adopted: boolean;
  metric: boolean;
  jdQuote: string;
}

export interface SummaryRewrite {
  before: string;
  after: string;
  added: string[];
  reason: string;
  adopted: boolean;
}

export interface AppealItem {
  id: string;
  title: string;
  body: string;
  keywords: string[];
  evidence: string;
}

export type QuestionCategory =
  | "전환"
  | "성과 검증"
  | "위기 대응"
  | "직무"
  | "협업"
  | "리더십"
  | "갭 보완"
  | "컬처";

export interface StarAnswer {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export interface InterviewQuestion {
  id: string;
  category: QuestionCategory;
  question: string;
  why: string;
  difficulty: 1 | 2 | 3;
  gap: string | null;
  edited: boolean;
  star: StarAnswer;
  hint: string;
}

export interface JobPackage {
  id: string;
  createdAt: string;
  company: string;
  role: string;
  employmentType: string;
  location: string;
  resumeName: string;
  resumeHeadline: string;
  years: number;
  engine: "heuristic" | "llm";
  match: MatchResult;
  summary: SummaryRewrite;
  rewrites: RewriteItem[];
  appeals: AppealItem[];
  questions: InterviewQuestion[];
  jobKeywords: string[];
  resumeSnapshot: MasterResume;
  jobSnapshot: JobPosting;
}

export interface LlmConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
  enabled: boolean;
}

export type TabId = "match" | "rewrite" | "interview" | "export";
export type ViewId = "studio" | "history";
