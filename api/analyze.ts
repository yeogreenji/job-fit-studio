/**
 * JobFit Studio — AI 백엔드 (Vercel Serverless Function)
 *
 * POST /api/analyze  { mode: "package" | "interview_eval", ... }
 * GET  /api/analyze  서버·키 상태 확인 (앱이 모드 배너를 정할 때 사용)
 *
 * 키 우선순위: process.env.OPENAI_API_KEY → 요청 본문 apiKey → 501 no_key
 * 정직성 원칙: 지원자 원문에 없는 경험·수치·회사를 만들지 않도록 프롬프트에서 제한하고,
 *              클라이언트가 한 번 더 검증합니다(src/lib/guard.ts).
 * 개인정보: 키와 입력은 저장하지 않습니다.
 */

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
const VERSION = "1.0.0";
const DEFAULT_MODEL = "gpt-4o-mini";
const ALLOWED_MODELS = new Set(["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"]);
const MAX_BODY_CHARS = 60_000;
const FIELD_LIMIT = 3_500;
const ANSWER_LIMIT = 3_000;

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

interface NormalizedJob {
  company: string;
  role: string;
  employmentType: string;
  location: string;
  responsibilities: string;
  requirements: string;
  preferred: string;
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
7. 반드시 아래 JSON 객체 하나만 출력합니다. 설명 문장, 코드블록 표시를 붙이지 않습니다.

{
  "fit": {"verdict": "이 지원자의 적합성을 2문장으로", "strengths": [{"label": "12자 내외", "why": "원문 근거"}], "gaps": [{"label": "공고의 미충족 요구", "how": "원문 범위에서 보완할 방법"}]},
  "intro": {"text": "250~320자 1분 자기소개", "outline": {"hook": "", "proof": "", "fit": "", "close": ""}},
  "appeals": [{"title": "12자 내외", "body": "공고 요구와 경력 근거를 연결한 2문장"}],
  "rewrites": [{"before": "원문 문장 그대로", "after": "다듬은 문장(120자 이내)", "reason": "어떤 공고 문구를 반영했는지"}],
  "questions": [{"question": "압박 면접 질문", "why": "왜 묻는지", "category": "전환|성과 검증|위기 대응|직무|협업|리더십|갭 보완|컬처"}],
  "reverseQuestions": [{"question": "면접관에게 할 질문", "intent": "이 질문으로 확인하려는 것", "tone": "성과 기준|갭 확인|조직 적합"}]
}
strengths 3개, gaps 3개, appeals 3개, rewrites 최대 10개, questions 5개, reverseQuestions 3개로 맞춥니다.`;

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

[내장 엔진 계산]
적합도 ${typeof match.score === "number" ? match.score : "?"}/100 (${str(match.grade, 20) || "?"})
미충족: ${strList(match.missing, 12, 40).join(", ") || "없음"}
보완: ${strList(match.weak, 12, 40).join(", ") || "없음"}

위 지원자와 공고로 요청한 JSON을 만드세요. 원문에 없는 수치와 회사명은 절대 쓰지 마세요.`;
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

async function callOpenAI(input: { apiKey: string; model: string; system: string; user: string; maxTokens: number }): Promise<CompletionResult> {
  const base = (env().OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
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

  const envKey = env().OPENAI_API_KEY?.trim() ?? "";
  const model = env().OPENAI_MODEL?.trim() || DEFAULT_MODEL;

  if (method === "GET") {
    send(res, 200, {
      ok: true,
      service: SERVICE,
      version: VERSION,
      ai: Boolean(envKey),
      model,
      reason: envKey ? undefined : "no_key",
      modes: ["package", "interview_eval"],
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

  const mode = str(body.mode, 30);
  if (mode !== "package" && mode !== "interview_eval") {
    fail(res, 400, "bad_mode", "mode는 package 또는 interview_eval 이어야 합니다.");
    return;
  }

  const requestKey = str(body.apiKey, 200);
  if (requestKey && !/^sk-[A-Za-z0-9\-_*.]{10,}$/.test(requestKey)) {
    fail(res, 400, "bad_key", "API 키 형식이 올바르지 않습니다.");
    return;
  }
  const apiKey = envKey || requestKey;
  if (!apiKey) {
    fail(res, 501, "no_key", "서버에 OPENAI_API_KEY가 없고 요청에도 키가 없습니다.");
    return;
  }
  const requestedModel = str(body.model, 40);
  const useModel = ALLOWED_MODELS.has(requestedModel) ? requestedModel : model;

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
      const completion = await callOpenAI({
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
      send(res, 200, { ok: true, mode, model: completion.model, data });
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
    const completion = await callOpenAI({
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
    send(res, 200, { ok: true, mode, model: completion.model, data });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    fail(res, status === 401 ? 502 : status, status === 401 ? "provider_auth" : "upstream", message.slice(0, 200));
  }
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
