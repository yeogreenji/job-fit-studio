/**
 * JobFit Studio — AI 백엔드 (Vercel Serverless Function)
 *
 * POST /api/analyze  { mode: "package" | "interview_eval", ... }
 * GET  /api/analyze  서버·키 상태 확인 (앱이 모드 배너를 정할 때 사용)
 *
 * 키 우선순위: process.env.GEMINI_API_KEY → process.env.OPENAI_API_KEY → 요청 본문 apiKey(비 sk-…=Gemini / sk-…=OpenAI) → 501 no_key
 *   두 서버 키가 다 있으면 Gemini를 씁니다. 개인 키는 앞자리로 제공자를 가립니다.
 *   Gemini는 generationConfig.responseMimeType: application/json 으로 같은 구조화 JSON을 받습니다.
 * 정직성 원칙: 지원자 원문에 없는 경험·수치·회사를 만들지 않도록 프롬프트에서 제한하고,
 *              클라이언트가 한 번 더 검증합니다(src/lib/guard.ts).
 * 개인정보: 키와 입력은 저장하지 않습니다.
 */

import { UrlError, excerptOf, fetchJobPage, structureFromPage, type ExtractedJob, type FetchedPage } from "./_joburl.js";

type HeaderValue = string | string[] | undefined;

interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  on?: (event: string, listener: (chunk: unknown) => void) => void;
}

interface ApiResponse {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
  end: (body?: string) => void;
}

const SERVICE = "jobfit-analyze";
const VERSION = "1.5.0";
const MODES = ["package", "interview_eval", "job_url", "recommend", "apply_kit", "resume_profile"] as const;
type Mode = (typeof MODES)[number];
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const ALLOWED_MODELS = new Set(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"]);
const MAX_BODY_CHARS = 60_000;
const FIELD_LIMIT = 3_500;
const ANSWER_LIMIT = 3_000;

type Provider = "gemini" | "openai";

/**
 * 개인 키는 앞자리로 제공자를 가립니다. OpenAI 키만 sk- 로 시작하고,
 * Gemini 키는 AIza… 또는 AQ.… 등으로 발급되므로 "sk-가 아니면 Gemini"로 봅니다.
 */
const isGeminiKey = (key: string): boolean => key.length > 0 && !key.startsWith("sk-");

const env = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

function send(res: ApiResponse, status: number, payload: unknown) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS };
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

const fail = (res: ApiResponse, status: number, code: string, message: string) =>
  send(res, status, { ok: false, error: { code, message } });

function readStream(req: ApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof req.on !== "function") {
      reject(new Error("no stream"));
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += typeof chunk === "string" ? chunk : String(chunk);
    });
    req.on("end", () => resolve(raw));
    req.on("error", () => reject(new Error("stream error")));
  });
}

async function readBody(req: ApiRequest): Promise<Record<string, unknown> | null> {
  let raw: string;
  if (req.body !== undefined && req.body !== null) {
    raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  } else {
    try {
      raw = await readStream(req);
    } catch {
      return null;
    }
  }
  if (!raw.trim()) return {};
  if (raw.length > MAX_BODY_CHARS) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (value: unknown, limit = FIELD_LIMIT): string => (typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, limit).trim() : "");
const strList = (value: unknown, limit = 24, itemLimit = 80): string[] =>
  Array.isArray(value) ? value.map((item) => str(item, itemLimit)).filter(Boolean).slice(0, limit) : [];

/** 커리어 프로필(지원자가 찾는 자리)을 프롬프트 한 줄로. 값이 없으면 미입력. */
const profileLine = (value: unknown): string => {
  if (!value || typeof value !== "object") return "(미입력)";
  const item = value as Record<string, unknown>;
  const role = str(item.role, 60);
  const years = typeof item.years === "number" && Number.isFinite(item.years) && item.years >= 0 ? Math.round(item.years) : null;
  const keywords = strList(item.keywords, 10, 30);
  const exclude = strList(item.exclude, 8, 30);
  const parts = [
    role ? `직무 ${role}` : "",
    years !== null ? `경력 ${years}년` : "",
    keywords.length ? `핵심 키워드 ${keywords.join(", ")}` : "",
    exclude.length ? `제외 ${exclude.join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "(미입력)";
};

interface NormalizedJob {
  company: string;
  role: string;
  employmentType: string;
  location: string;
  responsibilities: string;
  requirements: string;
  preferred: string;
  documents: string;
  tone: string;
}

interface NormalizedResume {
  name: string;
  headline: string;
  years: number;
  summary: string;
  skills: string[];
  industries: string[];
  experiences: { company: string; role: string; period: string; bullets: string[] }[];
}

const normalizeJob = (value: unknown): NormalizedJob | null => {
  if (!value || typeof value !== "object") return null;
  const job = value as Record<string, unknown>;
  const normalized: NormalizedJob = {
    company: str(job.company, 120),
    role: str(job.role, 120),
    employmentType: str(job.employmentType, 40),
    location: str(job.location, 60),
    responsibilities: str(job.responsibilities),
    requirements: str(job.requirements),
    preferred: str(job.preferred),
    documents: str(job.documents),
    tone: str(job.tone),
  };
  if (!normalized.responsibilities && !normalized.requirements) return null;
  return normalized;
};

const normalizeResume = (value: unknown): NormalizedResume | null => {
  if (!value || typeof value !== "object") return null;
  const resume = value as Record<string, unknown>;
  const experiences = Array.isArray(resume.experiences) ? resume.experiences : [];
  const normalizedExperiences = experiences
    .slice(0, 12)
    .map((item) => {
      const exp = (item ?? {}) as Record<string, unknown>;
      return {
        company: str(exp.company, 80),
        role: str(exp.role, 80),
        period: str(exp.period, 40),
        bullets: strList(exp.bullets, 20, 320),
      };
    })
    .filter((exp) => exp.bullets.length > 0);
  const normalized: NormalizedResume = {
    name: str(resume.name, 40),
    headline: str(resume.headline, 80),
    years: typeof resume.years === "number" && Number.isFinite(resume.years) ? Math.max(0, Math.min(50, Math.round(resume.years))) : 0,
    summary: str(resume.summary, 1_500),
    skills: strList(resume.skills, 30, 30),
    industries: strList(resume.industries, 10, 30),
    experiences: normalizedExperiences,
  };
  if (!normalizedExperiences.length) return null;
  return normalized;
};

const PACKAGE_SYSTEM = `[JOBFIT_PACKAGE] 당신은 한국 기업 채용에 맞춰 지원자의 서류와 면접을 준비시키는 커리어 코치입니다.
아래 규칙을 어기면 결과 전체가 폐기됩니다.
1. 지원자 원문([지원자 경력 문장])에 있는 사실만 씁니다. 없는 경험, 없는 프로젝트, 없는 회사·브랜드를 만들지 않습니다.
2. 숫자(성과 수치)는 원문에 적힌 값만 그대로 씁니다. 새로 계산·추정·반올림하지 않습니다. 원문에 수치가 없으면 수치를 쓰지 않습니다.
3. 리라이트의 "before"는 원문 문장을 한 글자도 바꾸지 않고 그대로 복사합니다. "after"는 그 문장의 사실 범위를 넘지 않습니다.
4. 1분 자기소개는 250~320자 한국어 구어체로, 원문에 있는 경력과 수치만 인용해 4문장 구조(훅·증명·적합·마무리)로 씁니다.
5. 압박 질문은 공고의 요구·갭에서 나와야 하며, 지원자가 답을 지어내야 하는 전제를 넣지 않습니다.
6. 역질문은 지원자가 면접관에게 실제로 물을 수 있는 것으로, 회사 내부 기밀을 요구하지 않습니다.
7. 각 질문의 answer는 지원자가 90초 안에 말할 수 있는 4~5문장 스크립트입니다. 원문 문장을 근거로 쓰고, 원문에 없는 수치·회사는 쓰지 않습니다.
   avoid는 그 질문에서 면접관을 잃는 답변 한 문장입니다.
8. negotiation의 숫자는 [희망 연봉]에 주어진 값만 씁니다. 값이 없으면 금액 없이 조건 중심으로 씁니다.
9. [지원자가 찾는 자리]가 주어지면 강조점·자기소개 마무리·협상 관점에만 반영합니다. 그 조건에 맞추려고 지원자 경력에 없는 사실을 더하지 않습니다.
10. 반드시 아래 JSON 객체 하나만 출력합니다. 설명 문장, 코드블록 표시를 붙이지 않습니다.

{
  "fit": {"verdict": "이 지원자의 적합성을 2문장으로", "onePoint": {"title": "12자 내외", "body": "이 공고에 넣을 때 강조할 원포인트 전략 2~3문장"}, "strengths": [{"label": "12자 내외", "why": "원문 근거"}], "gaps": [{"label": "공고의 미충족 요구", "how": "원문 범위에서 보완할 방법"}]},
  "intro": {"text": "250~320자 1분 자기소개", "outline": {"hook": "", "proof": "", "fit": "", "close": ""}},
  "appeals": [{"title": "12자 내외", "body": "공고 요구와 경력 근거를 연결한 2문장"}],
  "rewrites": [{"before": "원문 문장 그대로", "after": "다듬은 문장(120자 이내)", "reason": "어떤 공고 문구를 반영했는지"}],
  "questions": [{"question": "압박 면접 질문", "why": "왜 묻는지", "category": "전환|성과 검증|위기 대응|직무|협업|리더십|갭 보완|컬처", "answer": "4~5문장 말하기 스크립트", "avoid": "피해야 할 답변 한 문장"}],
  "reverseQuestions": [{"question": "면접관에게 할 질문", "intent": "이 질문으로 확인하려는 것", "tone": "성과 기준|갭 확인|조직 적합"}],
  "negotiation": {"opener": "처우 협의 첫 문장", "counter": "금액 차이가 있을 때 제안 문장", "nonSalary": ["비연봉 조건 3~5개"], "questions": ["처우·조직 확인 질문 3개"]}
}
strengths 3개, gaps 2~3개, appeals 3개, rewrites 최대 10개, questions 5개, reverseQuestions 3개로 맞춥니다.`;

const EVAL_SYSTEM = `[JOBFIT_EVAL] 당신은 한국 기업 실전 면접을 90초 답변으로 연습시키는 면접 코치입니다.
규칙:
1. 지원자가 실제로 말한 내용만 근거로 평가합니다. 답변에 없는 경험·수치·회사를 추정해 채우지 않습니다.
2. strengths와 improvements는 각 3개 이내, 각 항목은 1~2문장으로 구체적으로 씁니다.
3. followUp은 면접관이 실제로 이어서 물을 꼬리질문 1개입니다. 지원자가 답하지 않은 지점을 찌릅니다.
4. score는 0~100 정수로, 구조·구체성·수치·직무 연결을 종합한 참고 점수입니다. 점수만으로 합불을 단정하지 않습니다.
5. 반드시 아래 JSON 객체 하나만 출력합니다.

{"strengths": ["..."], "improvements": ["..."], "followUp": "...", "followUpWhy": "왜 이 질문을 이어서 하는지", "score": 0, "verdict": "한 문장 총평"}`;

function buildPackagePrompt(body: Record<string, unknown>, job: NormalizedJob, resume: NormalizedResume): string {
  const match = (body.match ?? {}) as Record<string, unknown>;
  const experiences = resume.experiences
    .map((exp) => `[${exp.company} · ${exp.role} · ${exp.period}]\n${exp.bullets.map((bullet) => `- ${bullet}`).join("\n")}`)
    .join("\n\n");
  return `[지원자]
이름: ${resume.name || "(미입력)"} · 한 줄 소개: ${resume.headline || "(미입력)"} · 경력 ${resume.years}년
요약: ${resume.summary || "(미입력)"}
스킬: ${resume.skills.join(", ") || "(미입력)"}
산업: ${resume.industries.join(", ") || "(미입력)"}

[지원자 경력 문장 — 이 문장들의 사실만 사용]
${experiences}

[채용 공고]
회사: ${job.company || "(미입력)"}
직무: ${job.role || "(미입력)"}
고용 형태: ${job.employmentType || "(미입력)"} / 근무지: ${job.location || "(미입력)"}
담당 업무:
${job.responsibilities || "(미입력)"}
자격 요건:
${job.requirements || "(미입력)"}
우대 사항:
${job.preferred || "(미입력)"}
조직 톤:
${job.tone || "(미입력)"}

[이직 우선순위]
${str(body.priorityLabel, 40) || "(미선택)"} — 이 우선순위를 자기소개 마무리와 처우 협상 문장에 반영하세요.
[희망 연봉]
${typeof body.targetSalary === "number" && Number.isFinite(body.targetSalary) && body.targetSalary > 0 ? `${Math.round(body.targetSalary)}만원` : "(미입력 — 금액을 쓰지 말 것)"}
[지원자가 찾는 자리 — 커리어 프로필]
${profileLine(body.profile)}

[내장 엔진 계산]
적합도 ${typeof match.score === "number" ? match.score : "?"}/100 (${str(match.grade, 20) || "?"})
미충족: ${strList(match.missing, 12, 40).join(", ") || "없음"}
보완: ${strList(match.weak, 12, 40).join(", ") || "없음"}

위 지원자와 공고로 요청한 JSON을 만드세요. 원문에 없는 수치와 회사명은 절대 쓰지 마세요.`;
}

const JOB_EXTRACT_SYSTEM = `[JOBFIT_JOBURL] 당신은 채용 공고 페이지의 HTML에서 뽑아낸 텍스트를 읽고, 공고 정보를 구조화하는 도구입니다.
규칙:
1. 주어진 본문에 실제로 적힌 내용만 옮깁니다. 본문에 없는 회사명·직무·연봉·복지·수치를 만들지 않습니다.
2. 회사명은 채용 주체(회사)입니다. 사이트 이름(예: 채용 플랫폼 이름)을 회사명으로 쓰지 않습니다.
3. 담당 업무·자격 요건·우대 사항을 원문 문장 그대로 줄 단위로 옮깁니다(각 12줄, 1,800자 이내). 요약해서 새 문장을 만들지 않아도 됩니다.
4. 제출서류·필수 제출 항목이 있으면 documents에 옮기고, 없으면 빈 문자열로 둡니다.
5. 조직 문화/복지 섹션이 있으면 tone에 옮기고, 없으면 빈 문자열로 둡니다.
6. 찾을 수 없는 항목은 빈 문자열("")로 둡니다. 추측해서 채우지 않습니다.
7. 반드시 아래 JSON 객체 하나만 출력합니다. 설명 문장이나 코드블록 표시를 붙이지 않습니다.

{
  "company": "",
  "role": "",
  "employmentType": "",
  "location": "",
  "deadline": "",
  "responsibilities": "",
  "requirements": "",
  "preferred": "",
  "documents": "",
  "tone": "",
  "note": "공고에서 확인하지 못한 항목이 있으면 한 문장"
}`;

const PROFILE_SYSTEM = `[JOBFIT_PROFILE] 당신은 한국 채용 시장의 이력서를 읽고, 지원자가 지금 찾을 자리의 조건을 정리하는 도구입니다.
규칙:
1. 주어진 이력서 본문에 실제로 적힌 내용만 옮깁니다. 없는 경력·회사·기술·수치를 만들지 않습니다.
2. role은 이력서의 한 줄 소개나 가장 최근 직함에서 고릅니다(2~30자). 회사 이름이나 채용 사이트 이름을 쓰지 않습니다.
3. years는 본문에 적힌 경력 연차(예: ‘경력 6년’, ‘6년차’)입니다. 명시된 값이 없으면 0으로 둡니다. 경력 기간을 더해 새로 계산하지 않습니다.
4. keywords는 본문에 나온 직무 용어·기술·업무 이름 중 5~8개입니다. 본문에 없는 말은 넣지 않습니다. ‘매니저·대리·과장·차장’ 같은 직급만 있는 말은 넣지 않습니다.
5. summary는 이력서의 소개 문장을 160자 이내로 줄인 한 줄 요약입니다. 소개가 없으면 가장 최근 경력과 연차로 씁니다.
6. achievements는 본문의 성과 문장 2~3개를 **한 글자도 바꾸지 않고** 그대로 옮깁니다.
7. locations는 본문에 근무지로 적힌 지역만 넣습니다(예: 서울). 언급이 없으면 빈 배열입니다.
8. salary는 본문에 희망 연봉이 만원 단위 숫자로 적혀 있을 때만 그 값을 쓰고, 없으면 0입니다.
9. 반드시 아래 JSON 객체 하나만 출력합니다. 설명 문장이나 코드블록 표시를 붙이지 않습니다.

{"role": "", "years": 0, "keywords": [""], "summary": "", "achievements": [""], "locations": [""], "salary": 0}`;

const RECOMMEND_SYSTEM = `[JOBFIT_RECOMMEND] 당신은 한국 경력직 이직을 돕는 커리어 코치입니다.
지원자의 이력서만 보고 (공고 없이) 다음을 제안합니다.
규칙:
1. 이력서 원문에 있는 경력·산업·스킬만 근거로 씁니다. 없는 경력을 전제로 한 포지션을 권하지 않습니다.
2. titles는 지금 바로 지원할 수 있는 포지션명 3개입니다. 각 항목의 why에는 이력서의 어떤 경험이 근거인지 한 문장으로 씁니다.
3. salaryBand는 한국 시장의 일반적인 범위를 만원 단위 정수로 추정합니다(예: 4200~5200). 확정된 값이 아니며, basis에 "연차·직무 기준 추정"처럼 근거와 한계를 반드시 적습니다.
4. targets는 지원할 기업군 3개입니다(회사명이 아니라 기업군: 예 "B2B SaaS 인하우스", "뷰티·커머스 브랜드", "PR 대행사 시니어"). why에 왜 이 지원자에게 맞는지 한 문장.
5. 반드시 아래 JSON 객체 하나만 출력합니다.

{"titles": [{"title": "", "why": ""}], "salaryBand": {"min": 0, "max": 0, "basis": ""}, "targets": [{"group": "", "why": ""}]}`;

const APPLY_SYSTEM = `[JOBFIT_APPLY] 당신은 한국 기업 지원서를 대신 쓰는 커리어 코치입니다. 지원자가 공고에 바로 붙여넣을 지원 문구를 만듭니다.
규칙:
1. [지원자 경력 문장]에 있는 사실만 씁니다. 없는 경험·프로젝트·회사·브랜드를 만들지 않습니다.
2. 숫자는 지원자 원문에 적힌 값만 그대로 씁니다. 새로 계산·추정하지 않습니다.
3. oneLiner는 40~70자의 한 줄 어필입니다. 공고의 직무·요구와 지원자 경력의 접점을 한 문장으로 씁니다. 인사말로 시작하지 않습니다.
4. coverLetter는 3문단 500~800자입니다. 1문단은 공고의 담당 업무 중 지원자가 실제로 해 온 일과 연결한 지원 동기, 2문단은 이력서 문장을 근거로 한 강점(문장 1~2개를 그대로 인용해도 됩니다), 3문단은 입사 후 기여와 마무리입니다. ‘안녕하세요’ 인사말과 서명은 쓰지 말고 본문만 씁니다.
5. keyPoints는 이력서 경력 문장 중 이 공고에 가장 잘 맞는 문장 3개를 원문 그대로 옮깁니다. 한 글자도 바꾸지 않습니다.
6. 공고의 자격 요건을 지원자가 충족했다고 단정하지 않습니다. 근거가 되는 경험만 연결합니다.
7. 반드시 아래 JSON 객체 하나만 출력합니다. 설명 문장이나 코드블록 표시를 붙이지 않습니다.

{"oneLiner": "", "coverLetter": "", "keyPoints": [""]}`;

function buildApplyPrompt(job: NormalizedJob, resume: NormalizedResume): string {
  const experiences = resume.experiences
    .map((exp) => `[${exp.company} · ${exp.role} · ${exp.period}]\n${exp.bullets.map((bullet) => `- ${bullet}`).join("\n")}`)
    .join("\n\n");
  return `[지원자]
이름: ${resume.name || "(미입력)"} · 한 줄 소개: ${resume.headline || "(미입력)"} · 경력 ${resume.years}년
요약: ${resume.summary || "(미입력)"}
스킬: ${resume.skills.join(", ") || "(미입력)"}
산업: ${resume.industries.join(", ") || "(미입력)"}

[지원자 경력 문장 — 이 문장들의 사실만 사용]
${experiences || "(경력 문장 없음)"}

[지원 공고]
회사: ${job.company || "(미입력)"}
직무: ${job.role || "(미입력)"}
담당 업무:
${job.responsibilities || "(미입력)"}
자격 요건:
${job.requirements || "(미입력)"}
우대 사항:
${job.preferred || "(미입력)"}
제출서류:
${job.documents || "(미입력)"}

위 지원자가 이 공고에 바로 붙여넣을 한 줄 어필·지원서 본문 초안·강조 경력 문장을 JSON으로 만드세요. 원문에 없는 경험과 수치는 절대 쓰지 마세요.`;
}

function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d[\d,.]*/g) ?? []).map((token) => token.replace(/[,]/g, "").replace(/\.$/, "")));
}

function buildJobExtractPrompt(page: Pick<FetchedPage, "title" | "finalUrl" | "text">): string {
  const body = page.text.replace(/\n{2,}/g, "\n").slice(0, 6_000);
  return `[페이지 제목] ${page.title}\n[주소] ${page.finalUrl}\n[본문]\n${body}\n\n위 페이지에서 회사·직무·담당 업무·자격 요건·우대 사항·조직 문화를 뽑아 JSON으로 정리하세요. 본문에 없는 값은 빈 문자열로 두세요.`;
}

function buildResumeProfilePrompt(text: string): string {
  const body = text.replace(/\n{2,}/g, "\n").slice(0, 16_000);
  return `[이력서 본문]\n${body}\n\n위 이력서에서 대표 직무·경력 연차·핵심 키워드·한 줄 요약·대표 성과 문장·근무지·희망 연봉을 뽑아 JSON으로 정리하세요. 본문에 없는 값은 비우거나 0으로 두세요.`;
}

/** AI가 뽑은 프로필을 이력서 원문과 대조해, 원문에 없는 값은 버립니다. */
function groundProfile(data: Record<string, unknown>, text: string): Record<string, unknown> {
  const compact = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  const haystack = compact(text);
  const allowed = numbersIn(text);
  const LOCATIONS = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종", "제주", "재택"];

  const roleCandidate = str(data.role, 40).replace(/^[-–—•·*]\s*/, "");
  const PORTAL = /^(?:사람인|잡코리아|원티드|리멤버|링크드인|점핏|로켓펀치|인크루트)$/;
  const roleTokens = roleCandidate.split(/\s+/).map((token) => compact(token).replace(/[()\[\],·/]/g, "")).filter((token) => token.length >= 2);
  const roleGrounded = roleTokens.some((token) => haystack.includes(token));
  const role = PORTAL.test(roleCandidate) || roleCandidate.length < 2 || !roleGrounded ? "" : roleCandidate;

  const yearsRaw = typeof data.years === "number" && Number.isFinite(data.years) ? Math.round(data.years) : 0;
  const years = yearsRaw > 0 && yearsRaw <= 50 && text.includes(String(yearsRaw)) ? yearsRaw : 0;

  const keywords = strList(data.keywords, 12, 24).filter((term) => {
    const key = compact(term).replace(/[()\[\],·/]/g, "");
    return key.length >= 2 && key.length <= 20 && haystack.includes(key) && !/^(매니저|대리|과장|차장|부장|팀장|사원|인턴|신입|경력)$/.test(term);
  });

  const summaryRaw = str(data.summary, 200);
  const summaryNumbers = [...numbersIn(summaryRaw)].filter((token) => !allowed.has(token));
  const summary = summaryNumbers.length ? "" : summaryRaw;

  const achievements = strList(data.achievements, 4, 200).filter((line) => compact(line).length >= 10 && haystack.includes(compact(line)));

  const locations = strList(data.locations, 6, 20).filter((place) => LOCATIONS.includes(place) && text.includes(place));

  const salaryRaw = typeof data.salary === "number" && Number.isFinite(data.salary) ? Math.round(data.salary) : 0;
  const salary = salaryRaw > 0 && salaryRaw <= 100_000 && text.includes(String(salaryRaw)) ? salaryRaw : null;

  return { role, years, keywords, summary, achievements, locations, salary };
}

function buildRecommendPrompt(resume: NormalizedResume, priority: string): string {
  const experiences = resume.experiences
    .map((exp) => `[${exp.company} · ${exp.role} · ${exp.period}]\n${exp.bullets.map((bullet) => `- ${bullet}`).join("\n")}`)
    .join("\n\n");
  return `[지원자]
한 줄 소개: ${resume.headline || "(미입력)"} · 경력 ${resume.years}년
요약: ${resume.summary || "(미입력)"}
스킬: ${resume.skills.join(", ") || "(미입력)"}
산업: ${resume.industries.join(", ") || "(미입력)"}

[경력 문장 — 이 문장의 사실만 근거로 사용]
${experiences}

[이직 우선순위]
${priority || "(미선택)"}

위 지원자에게 맞는 포지션 3개, 연봉 참고 범위, 타깃 기업군 3개를 JSON으로 제안하세요.`;
}

function buildEvalPrompt(body: Record<string, unknown>, job: NormalizedJob | null, resume: NormalizedResume | null): string {
  const question = str(body.question, 400);
  const answer = str(body.answer, ANSWER_LIMIT);
  const seconds = typeof body.seconds === "number" && Number.isFinite(body.seconds) ? Math.round(body.seconds) : 0;
  const resumeText = resume
    ? resume.experiences
        .map((exp) => `[${exp.company} ${exp.role}] ${exp.bullets.join(" / ")}`)
        .join("\n")
    : "(미제공)";
  return `[면접 질문]
${question}

[지원자 답변 — 실제로 말한 내용]
${answer}

[답변에 쓴 시간]
${seconds}초 / 제한 90초

[지원 직무]
${job ? `${job.company} · ${job.role}\n담당 업무: ${job.responsibilities}\n자격 요건: ${job.requirements}` : "(미제공)"}

[지원자 이력서 요약]
${resumeText.slice(0, 2_500)}

위 답변을 평가해 요청한 JSON을 만드세요. 답변에 없는 경험을 만들어 칭찬하거나 지적하지 마세요.`;
}

interface CompletionResult {
  content: string;
  model: string;
}

async function callOpenAI(input: CompletionInput): Promise<CompletionResult> {
  const base = (env().OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.3,
        max_tokens: input.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = "";
      try {
        const payload = JSON.parse(text) as { error?: { message?: string } };
        detail = payload.error?.message?.slice(0, 180) ?? "";
      } catch {
        detail = text.slice(0, 160);
      }
      throw Object.assign(new Error(detail || `HTTP ${response.status}`), { status: response.status });
    }
    const payload = JSON.parse(text) as { choices?: { message?: { content?: string } }[]; model?: string };
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw Object.assign(new Error("빈 응답"), { status: 502 });
    return { content, model: payload.model || input.model };
  } finally {
    clearTimeout(timer);
  }
}

interface CompletionInput {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}

interface GeminiPayload {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  modelVersion?: string;
}

/** Google Gemini REST(generateContent)로 같은 구조화 JSON을 받습니다. */
async function callGemini(input: CompletionInput): Promise<CompletionResult> {
  const base = (env().GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    temperature: 0.4,
  };
  if (/^gemini-3\./.test(input.model)) {
    // Gemini 3.x는 thinking을 끌 수 없고 thinking 토큰이 maxOutputTokens에 포함됩니다.
    // 잘린 JSON을 받지 않도록 한도만 넓히고, thinkingConfig는 보내지 않습니다(모델별 지원 편차).
    generationConfig.maxOutputTokens = Math.min(65_536, input.maxTokens * 3 + 1_024);
  } else {
    generationConfig.maxOutputTokens = input.maxTokens;
    // 2.5 Flash는 thinkingBudget 0으로 추론을 끌 수 있습니다(2.5 Flash-Lite는 기본 꺼짐).
    if (/^gemini-2\.5-flash(?!-lite)/.test(input.model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: "user", parts: [{ text: input.user }] }],
        generationConfig,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 160);
      try {
        const payload = JSON.parse(text) as { error?: { message?: string } };
        detail = payload.error?.message?.slice(0, 180) ?? detail;
      } catch {
        /* 원문 유지 */
      }
      // Gemini는 잘못된 키를 400·403으로, 못 쓰는 모델을 404로 돌려줍니다.
      // 앱에서는 각각 인증 오류·제공자 오류로 묶어 안내합니다.
      const unavailable = response.status === 404;
      const status = unavailable
        ? 502
        : response.status === 400 || response.status === 401 || response.status === 403
          ? 401
          : response.status;
      const message = unavailable
        ? `Gemini 모델(${input.model})을 사용할 수 없습니다. GEMINI_MODEL을 확인하세요. ${detail}`.trim()
        : detail || `HTTP ${response.status}`;
      throw Object.assign(new Error(message), { status });
    }
    const payload = JSON.parse(text) as GeminiPayload;
    const content = (payload.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => part.thought !== true)
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!content) {
      const reason = payload.candidates?.[0]?.finishReason;
      throw Object.assign(new Error(reason ? `Gemini가 응답을 만들지 못했습니다 (${reason})` : "빈 응답"), { status: 502 });
    }
    return { content, model: payload.modelVersion || input.model };
  } finally {
    clearTimeout(timer);
  }
}

const callCompletion = (input: CompletionInput & { provider: Provider }): Promise<CompletionResult> =>
  input.provider === "gemini" ? callGemini(input) : callOpenAI(input);

function parseJsonContent(content: string): Record<string, unknown> | null {
  const cleaned = content
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const candidates = [cleaned];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* 다음 후보 시도 */
    }
  }
  return null;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "OPTIONS") {
    for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value);
    res.setHeader("Access-Control-Max-Age", "86400");
    res.statusCode = 204;
    res.end();
    return;
  }

  const geminiEnvKey = env().GEMINI_API_KEY?.trim() ?? "";
  const openaiEnvKey = env().OPENAI_API_KEY?.trim() ?? "";
  const geminiConfigModel = env().GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const openaiConfigModel = env().OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  const envProvider: Provider | null = geminiEnvKey ? "gemini" : openaiEnvKey ? "openai" : null;

  if (method === "GET") {
    send(res, 200, {
      ok: true,
      service: SERVICE,
      version: VERSION,
      ai: Boolean(envProvider),
      provider: envProvider,
      model: envProvider === "gemini" ? geminiConfigModel : openaiConfigModel,
      reason: envProvider ? undefined : "no_key",
      modes: [...MODES],
      urlFetch: true,
    });
    return;
  }

  if (method !== "POST") {
    fail(res, 405, "method_not_allowed", "GET 또는 POST만 지원합니다.");
    return;
  }

  const body = await readBody(req);
  if (body === null) {
    fail(res, 413, "too_large", "요청 본문이 너무 크거나 JSON이 아닙니다.");
    return;
  }

  const mode = str(body.mode, 30) as Mode;
  if (!MODES.includes(mode)) {
    fail(res, 400, "bad_mode", "mode는 package, interview_eval, job_url, recommend, apply_kit, resume_profile 중 하나이어야 합니다.");
    return;
  }

  const requestKey = str(body.apiKey, 200);
  // sk-…는 OpenAI, 그 외(AIza…·AQ.… 등 Gemini 키)는 최소 길이와 문자만 확인합니다.
  const keyShapeOk =
    !requestKey || /^sk-[A-Za-z0-9\-_*.]{10,}$/.test(requestKey) || /^[A-Za-z0-9._\-]{10,}$/.test(requestKey);
  if (!keyShapeOk) {
    fail(res, 400, "bad_key", "API 키 형식이 올바르지 않습니다.");
    return;
  }
  // 서버 키가 1순위. 서버 키가 없을 때만 요청의 개인 키를 쓰고, 앞자리로 제공자를 가립니다.
  const geminiKey = geminiEnvKey || (requestKey && isGeminiKey(requestKey) ? requestKey : "");
  const openaiKey = openaiEnvKey || (requestKey && !isGeminiKey(requestKey) ? requestKey : "");
  const provider: Provider | null = geminiKey ? "gemini" : openaiKey ? "openai" : null;
  const apiKey = geminiKey || openaiKey;

  const requestedModel = str(body.model, 40);
  const useModel =
    provider === "gemini"
      ? /^gemini-[a-z0-9.\-]{2,}$/i.test(requestedModel)
        ? requestedModel
        : geminiConfigModel
      : ALLOWED_MODELS.has(requestedModel)
        ? requestedModel
        : openaiConfigModel;

  // URL 수집은 AI 키 없이도 동작합니다(페이지 글자에서 직접 문단을 나눔).
  if (mode === "job_url") {
    let page: FetchedPage;
    try {
      page = await fetchJobPage(str(body.jobUrl, 600));
    } catch (error) {
      if (error instanceof UrlError) {
        send(res, error.status, {
          ok: false,
          error: { code: error.code, message: error.message, site: error.site, excerpt: error.excerpt ?? "" },
          meta: { url: str(body.jobUrl, 600), site: error.site },
        });
        return;
      }
      fail(res, 502, "fetch_failed", error instanceof Error ? error.message.slice(0, 160) : "공고를 불러오지 못했습니다.");
      return;
    }

    let job: ExtractedJob = structureFromPage(page);
    if (!job.applyUrl) job.applyUrl = page.finalUrl;
    if (!job.applyLabel) job.applyLabel = "원문 공고";
    let engine: "rule" | "ai" = "rule";
    let model: string | undefined;
    let note = "";
    if (provider) {
      try {
        const completion = await callCompletion({
          provider,
          apiKey,
          model: useModel,
          system: JOB_EXTRACT_SYSTEM,
          user: buildJobExtractPrompt(page),
          maxTokens: 1_600,
        });
        const data = parseJsonContent(completion.content);
        if (data) {
          job = mergeExtracted(job, data, page.text);
          engine = "ai";
          model = completion.model;
          note = str(data.note, 160);
        }
      } catch (error) {
        note = `AI 정리를 건너뛰고 페이지 글자에서 직접 나눴습니다. (${error instanceof Error ? error.message.slice(0, 80) : "알 수 없는 오류"})`;
      }
    } else {
      note = "AI 키 없이 페이지 글자에서 직접 나눴습니다. 문단이 어긋나면 본문을 붙여넣어 주세요.";
    }
    if (!job.company && !job.role) {
      send(res, 422, {
        ok: false,
        error: {
          code: "not_job_page",
          message: `${page.site} 페이지에서 회사와 직무를 찾지 못했습니다. 공고 본문을 붙여넣어 주세요.`,
          site: page.site,
          excerpt: excerptOf(page),
        },
      });
      return;
    }
    send(res, 200, {
      ok: true,
      mode,
      engine,
      provider,
      model,
      job: {
        ...job,
        applyUrl: job.applyUrl || page.finalUrl,
        applyLabel: job.applyLabel || "원문 공고",
        documents: job.documents || "",
      },
      meta: {
        url: page.url,
        finalUrl: page.finalUrl,
        site: page.site,
        title: page.title.slice(0, 160),
        chars: page.text.length,
        note,
      },
    });
    return;
  }

  if (!provider) {
    fail(res, 501, "no_key", "서버에 GEMINI_API_KEY나 OPENAI_API_KEY가 없고 요청에도 키가 없습니다.");
    return;
  }

  try {
    if (mode === "package") {
      const job = normalizeJob(body.job);
      const resume = normalizeResume(body.resume);
      if (!job) {
        fail(res, 400, "bad_job", "공고의 담당 업무나 자격 요건이 필요합니다.");
        return;
      }
      if (!resume) {
        fail(res, 400, "bad_resume", "경력 문장이 한 개 이상 필요합니다.");
        return;
      }
      const completion = await callCompletion({
        provider,
        apiKey,
        model: useModel,
        system: PACKAGE_SYSTEM,
        user: buildPackagePrompt(body, job, resume),
        maxTokens: 2_400,
      });
      const data = parseJsonContent(completion.content);
      if (!data) {
        fail(res, 502, "bad_json", "AI 응답을 JSON으로 읽지 못했습니다.");
        return;
      }
      send(res, 200, { ok: true, mode, provider, model: completion.model, data });
      return;
    }

    if (mode === "apply_kit") {
      // 목록만 수집한 공고(요건 본문 없음)도 회사·직무·조건으로 문구를 만들 수 있게 느슨히 받습니다.
      const job = normalizeJob(body.job) ?? normalizeJobLoose(body.job);
      const resume = normalizeResume(body.resume);
      if (!job || (!job.role && !job.company)) {
        fail(res, 400, "bad_job", "공고의 회사나 직무가 필요합니다.");
        return;
      }
      if (!resume) {
        fail(res, 400, "bad_resume", "경력 문장이 한 개 이상 필요합니다.");
        return;
      }
      const completion = await callCompletion({
        provider,
        apiKey,
        model: useModel,
        system: APPLY_SYSTEM,
        user: buildApplyPrompt(job, resume),
        maxTokens: 1_500,
      });
      const data = parseJsonContent(completion.content);
      if (!data) {
        fail(res, 502, "bad_json", "AI 응답을 JSON으로 읽지 못했습니다.");
        return;
      }
      send(res, 200, { ok: true, mode, provider, model: completion.model, data });
      return;
    }

    if (mode === "resume_profile") {
      const text = str(body.text, 20_000);
      if (text.length < 60) {
        fail(res, 400, "bad_resume_text", "이력서 글자가 너무 적습니다.");
        return;
      }
      const completion = await callCompletion({
        provider,
        apiKey,
        model: useModel,
        system: PROFILE_SYSTEM,
        user: buildResumeProfilePrompt(text),
        maxTokens: 1_000,
      });
      const data = parseJsonContent(completion.content);
      if (!data) {
        fail(res, 502, "bad_json", "AI 응답을 JSON으로 읽지 못했습니다.");
        return;
      }
      send(res, 200, { ok: true, mode, provider, model: completion.model, data: groundProfile(data, text) });
      return;
    }

    if (mode === "recommend") {
      const resume = normalizeResume(body.resume);
      if (!resume) {
        fail(res, 400, "bad_resume", "경력 문장이 한 개 이상 필요합니다.");
        return;
      }
      const completion = await callCompletion({
        provider,
        apiKey,
        model: useModel,
        system: RECOMMEND_SYSTEM,
        user: buildRecommendPrompt(resume, str(body.priorityLabel, 40)),
        maxTokens: 1_100,
      });
      const data = parseJsonContent(completion.content);
      if (!data) {
        fail(res, 502, "bad_json", "AI 응답을 JSON으로 읽지 못했습니다.");
        return;
      }
      send(res, 200, { ok: true, mode, provider, model: completion.model, data });
      return;
    }

    const question = str(body.question, 400);
    const answer = str(body.answer, ANSWER_LIMIT);
    if (question.length < 5) {
      fail(res, 400, "bad_question", "면접 질문이 필요합니다.");
      return;
    }
    if (answer.length < 10) {
      fail(res, 400, "bad_answer", "답변이 너무 짧습니다.");
      return;
    }
    const completion = await callCompletion({
      provider,
      apiKey,
      model: useModel,
      system: EVAL_SYSTEM,
      user: buildEvalPrompt(body, normalizeJobLoose(body.job), normalizeResumeLoose(body.resume)),
      maxTokens: 900,
    });
    const data = parseJsonContent(completion.content);
    if (!data) {
      fail(res, 502, "bad_json", "AI 응답을 JSON으로 읽지 못했습니다.");
      return;
    }
    send(res, 200, { ok: true, mode, provider, model: completion.model, data });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    fail(res, status === 401 ? 502 : status, status === 401 ? "provider_auth" : "upstream", message.slice(0, 200));
  }
}

/** AI가 정리한 공고 필드를 페이지 원문과 대조해 받아들입니다. 원문에 없는 숫자는 버리고, 비어 있으면 기존 값을 유지합니다. */
function mergeExtracted(heuristic: ExtractedJob, data: Record<string, unknown>, pageText: string): ExtractedJob {
  const allowed = numbersIn(pageText);
  const pick = (key: keyof ExtractedJob, limit: number): string => {
    const candidate = str(data[key], limit);
    if (!candidate) return heuristic[key];
    const invented = [...numbersIn(candidate)].filter((token) => !allowed.has(token));
    if (invented.length) return heuristic[key];
    return candidate;
  };
  return {
    company: pick("company", 80),
    role: pick("role", 80),
    employmentType: pick("employmentType", 30),
    location: pick("location", 60),
    deadline: pick("deadline", 40),
    responsibilities: pick("responsibilities", 2_000),
    requirements: pick("requirements", 2_000),
    preferred: pick("preferred", 2_000),
    documents: pick("documents", 1_200),
    tone: pick("tone", 1_200),
    // 지원 링크는 페이지 HTML에서 직접 읽은 값만 씁니다(AI가 만든 링크는 받지 않습니다).
    applyUrl: heuristic.applyUrl,
    applyLabel: heuristic.applyLabel,
  };
}

/** 면접 평가 모드에서는 공고·이력서가 일부만 와도 됩니다. */
function normalizeJobLoose(value: unknown): NormalizedJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as Record<string, unknown>;
  return {
    company: str(job.company, 120),
    role: str(job.role, 120),
    employmentType: "",
    location: "",
    responsibilities: str(job.responsibilities),
    requirements: str(job.requirements),
    preferred: str(job.preferred, 1_500),
    documents: str(job.documents, 1_500),
    tone: str(job.tone, 800),
  };
}

function normalizeResumeLoose(value: unknown): NormalizedResume | null {
  if (!value || typeof value !== "object") return null;
  const resume = value as Record<string, unknown>;
  const experiences = Array.isArray(resume.experiences) ? resume.experiences : [];
  return {
    name: str(resume.name, 40),
    headline: str(resume.headline, 80),
    years: typeof resume.years === "number" ? Math.max(0, Math.min(50, Math.round(resume.years))) : 0,
    summary: str(resume.summary, 1_000),
    skills: strList(resume.skills, 30, 30),
    industries: [],
    experiences: experiences.slice(0, 12).map((item) => {
      const exp = (item ?? {}) as Record<string, unknown>;
      return {
        company: str(exp.company, 80),
        role: str(exp.role, 80),
        period: str(exp.period, 40),
        bullets: strList(exp.bullets, 20, 320),
      };
    }),
  };
}
