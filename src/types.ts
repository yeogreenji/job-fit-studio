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

/** 생성 주체. 규칙 엔진만으로 만든 결과와 AI가 만든 결과를 화면에서 구분합니다. */
export type EngineKind = "rule" | "ai";

export interface IntroOutline {
  hook: string;
  proof: string;
  fit: string;
  close: string;
}

export interface IntroPitch {
  text: string;
  source: EngineKind;
  model?: string;
  outline?: IntroOutline;
}

export type ReverseTone = "성과 기준" | "갭 확인" | "조직 적합";

export interface ReverseQuestion {
  id: string;
  question: string;
  intent: string;
  tone: ReverseTone;
  source: EngineKind;
}

export interface InterviewFeedback {
  id: string;
  questionId: string;
  question: string;
  answer: string;
  strengths: string[];
  improvements: string[];
  followUp: string;
  followUpWhy: string;
  score: number;
  seconds: number;
  source: EngineKind;
  model?: string;
  createdAt: string;
}

export interface AiFit {
  verdict: string;
  strengths: { label: string; why: string }[];
  gaps: { label: string; how: string }[];
  model?: string;
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
  engine: EngineKind;
  match: MatchResult;
  summary: SummaryRewrite;
  rewrites: RewriteItem[];
  appeals: AppealItem[];
  questions: InterviewQuestion[];
  jobKeywords: string[];
  resumeSnapshot: MasterResume;
  jobSnapshot: JobPosting;
  /* ── 실전 AI 확장 ── */
  intro?: IntroPitch;
  reverse?: ReverseQuestion[];
  feedback?: InterviewFeedback[];
  aiFit?: AiFit;
  aiModel?: string;
  aiWarnings?: string[];
}

export interface AiConfig {
  /** 서버 환경변수가 없을 때만 요청 본문에 실어 보내는 개인 키 */
  apiKey: string;
  model: string;
  sendKey: boolean;
}

export type AiStatusKind = "checking" | "live" | "local";

export interface AiStatus {
  kind: AiStatusKind;
  reachable: boolean;
  model?: string;
  reason?: string;
  message: string;
  checkedAt: string;
}

export type Stage = "준비중" | "서류" | "1차" | "2차" | "최종" | "오퍼";

export interface NegotiationItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ApplicationEntry {
  id: string;
  company: string;
  role: string;
  stage: Stage;
  packageId: string | null;
  score: number | null;
  deadline: string;
  nextAction: string;
  /** 만원 단위 */
  salary: { current: number | null; hope: number | null; offered: number | null };
  negotiation: NegotiationItem[];
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export type TabId = "match" | "rewrite" | "interview" | "pitch" | "export";
export type ViewId = "studio" | "history" | "tracker";
