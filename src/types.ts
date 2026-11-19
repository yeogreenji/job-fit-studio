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
  /** 제출서류·필수 제출 항목 (공고 원문에 있을 때만) */
  documents?: string;
  /** 원문 공고의 직접 지원 링크 */
  applyUrl?: string;
  /** 원문 지원 버튼 문구 (예: 지원하기) */
  applyLabel?: string;
  tone: string;
  /* ── 자동 수집으로 채운 실제 공고 정보 ── */
  /** 경력 조건 (예: 경력 3~8년 · 신입·경력) */
  experience?: string;
  /** 급여 표기 (공고에 적힌 경우만) */
  salary?: string;
  /** 직무 태그 */
  tags?: string[];
  /** 목록에서 읽은 조건 한 줄 */
  conditions?: string;
  /** full: 본문 요건까지 읽음 · list: 목록 정보만 */
  detailLevel?: "full" | "list";
  /** 인하우스 / 서치펌(헤드헌팅) / 에이전시 구분 (자동 수집분) */
  companyType?: "inhouse" | "agency" | "searchfirm" | "unknown";
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
  /** 바로 읽고 말할 수 있는 모범 답변 스크립트 */
  answer?: string;
  answerSource?: EngineKind;
  /** 면접에서 피해야 할 답변 */
  avoid?: string;
}

/** 생성 주체. 규칙 엔진만으로 만든 결과와 AI가 만든 결과를 화면에서 구분합니다. */
export type EngineKind = "rule" | "ai";

/** 이직 우선순위 — 지원 패키지의 톤과 협상 스크립트를 바꿉니다. */
export type PriorityId = "salary" | "balance" | "growth" | "stability";

export interface PriorityOption {
  id: PriorityId;
  label: string;
  short: string;
  desc: string;
  /** 협상·역질문에서 먼저 꺼낼 카드 */
  focus: string[];
}

/** 공고를 어디서 가져왔는지. 결과 화면 상단에 출처를 남깁니다. */
export interface JobSource {
  kind: "url" | "paste" | "sample" | "auto";
  url?: string;
  site?: string;
  fetchedAt?: string;
  note?: string;
  /** 자동 수집 소스 식별자 (wanted · saramin · jobkorea) */
  sourceId?: string;
  /** 소스 안에서의 공고 번호 */
  sourceJobId?: string;
  /** 수집기가 본문까지 읽었는지 */
  detailLevel?: "full" | "list";
}

/** 처우 협상 스크립트 묶음 */
export interface NegotiationPlan {
  /** 희망 연봉 표기 (예: 5,500만원). 값이 없으면 빈 문자열 */
  target: string;
  basis: string;
  opener: string;
  counter: string;
  nonSalary: string[];
  questions: string[];
  source: EngineKind;
}

/** 이 공고에 넣을 때의 원포인트 전략 */
export interface OnePoint {
  title: string;
  body: string;
}

/** 이력서만으로 만드는 추천 방향 */
export interface ResumeRecommendation {
  titles: { title: string; why: string }[];
  salaryBand: { min: number; max: number; basis: string } | null;
  targets: { group: string; why: string }[];
  source: EngineKind;
  model?: string;
}

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
  /* ── URL·이력서 중심 재설계 ── */
  source?: JobSource;
  priority?: PriorityId;
  onePoint?: OnePoint;
  negotiation?: NegotiationPlan;
  /** 만원 단위 희망 연봉. 협상 스크립트가 이 값을 씁니다. */
  targetSalary?: number | null;
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

/* ── 공고 수집·직접 지원 허브 ── */

/** 지원 상태 — 허브 카드에서 바로 바꿉니다. */
export type ApplyStatus = "지원 전" | "준비중" | "지원완료" | "서류합격" | "면접";

/** 저장된 이력서로 만든 복붙용 지원 문구 묶음 */
export interface ApplyDraft {
  /** 한 줄 어필 */
  oneLiner: string;
  /** 지원서·자소서에 붙일 본문 초안 (3문단) */
  coverLetter: string;
  /** 이력서에서 그대로 인용한 강조 문장 */
  keyPoints: string[];
  source: EngineKind;
  model?: string;
  updatedAt: string;
  /** 근거 확인에서 제외한 항목 수 */
  warnings?: number;
}

/** 첫 화면의 직무 프리셋 */
export interface JobPreset {
  id: string;
  label: string;
  /** 수집에 보낼 키워드. 비어 있으면 최신 공고 전체 */
  query: string;
  hint: string;
  /** 서버가 적용할 기본 수집 타깃 프로필 (예: seoul-inhouse-pr) */
  profile?: string;
}

/** 허브에 모은 공고 한 건 — 공고 원문 + 지원 상태 + 메모 + 지원 문구 */
export interface HubJob {
  id: string;
  job: JobPosting;
  source: JobSource;
  /** 원문 직접 지원 링크 (없으면 공고 URL) */
  applyUrl: string;
  status: ApplyStatus;
  memo: string;
  /** 제출서류 체크한 항목 */
  documentsChecked: string[];
  draft?: ApplyDraft;
  /** 보드에 담아 둔 공고 (자동 수집분은 담아야 브라우저에 남습니다) */
  saved?: boolean;
  createdAt: string;
  updatedAt: string;
}
