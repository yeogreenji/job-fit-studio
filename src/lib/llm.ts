import type { JobPackage, LlmConfig } from "../types";

const SYSTEM_PROMPT = `당신은 한국 기업 채용 공고에 맞춰 지원자의 경력기술서와 면접 답변을 다듬는 커리어 코치입니다.
규칙:
1. 제공된 경력 문장의 사실만 사용하세요. 없는 경험, 없는 수치, 없는 회사를 절대 만들지 마세요.
2. 수치는 원문에 있는 값만 그대로 쓰고, 새로 계산하거나 추정하지 마세요.
3. 문장은 한국어 이력서 문체(~했습니다 / 명사형)로, 한 문장 120자 이내로 쓰세요.
4. 반드시 아래 JSON 형식만 출력하세요.

{
  "appeals": [{"title": "12자 내외 제목", "body": "공고 요구와 경력 근거를 연결한 2문장"}],
  "rewrites": [{"before": "원문 문장 그대로", "after": "다듬은 문장", "reason": "어떤 공고 문구를 반영했는지 한 문장"}],
  "questions": [{"question": "압박 면접 질문", "why": "왜 이 질문이 나오는지", "category": "전환|성과 검증|위기 대응|직무|협업|리더십|갭 보완|컬처"}]
}`;

function buildPrompt(pkg: JobPackage): string {
  const bullets = pkg.resumeSnapshot.experiences
    .map((exp) => `[${exp.company} · ${exp.role} · ${exp.period}]\n${exp.bullets.map((b) => `- ${b.text}`).join("\n")}`)
    .join("\n\n");
  const job = pkg.jobSnapshot;
  return `[지원자]
${pkg.resumeName} · ${pkg.resumeHeadline} · 경력 ${pkg.years}년
요약: ${pkg.resumeSnapshot.summary}
스킬: ${pkg.resumeSnapshot.skills.join(", ")}

[경력 문장]
${bullets}

[채용 공고]
회사: ${job.company}
직무: ${job.role}
담당 업무:
${job.responsibilities}
자격 요건:
${job.requirements}
우대 사항:
${job.preferred}
조직 톤:
${job.tone}

[내장 엔진 분석]
적합도 ${pkg.match.score}/100 (${pkg.match.grade.label})
미충족 키워드: ${pkg.match.keywords.filter((k) => k.status === "missing").map((k) => k.label).join(", ") || "없음"}
보완 키워드: ${pkg.match.keywords.filter((k) => k.status === "weak").map((k) => k.label).join(", ") || "없음"}

핵심 어필 포인트 3개, 경력 문장 리라이트(원문 그대로의 before 포함, 최대 8개), 이 공고에 특화된 압박 면접 질문 5개를 만들어 주세요.`;
}

async function callOpenAI(config: LlmConfig, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model || "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI 응답 오류 (${res.status})`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("응답 본문이 비어 있습니다");
  return text;
}

async function callAnthropic(config: LlmConfig, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.model || "claude-3-5-haiku-latest",
      max_tokens: 2400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic 응답 오류 (${res.status})`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("응답 본문이 비어 있습니다");
  return text;
}

const CATEGORIES = ["전환", "성과 검증", "위기 대응", "직무", "협업", "리더십", "갭 보완", "컬처"] as const;
type Category = (typeof CATEGORIES)[number];

interface Payload {
  appeals?: { title?: string; body?: string }[];
  rewrites?: { before?: string; after?: string; reason?: string }[];
  questions?: { question?: string; why?: string; category?: string }[];
}

const parseJson = (raw: string): Payload => {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as Payload;
};

export interface LlmEnrichment {
  appeals: { title: string; body: string }[];
  rewrites: { before: string; after: string; reason: string }[];
  questions: { question: string; why: string; category: Category }[];
}

export async function enrichPackage(config: LlmConfig, pkg: JobPackage): Promise<LlmEnrichment> {
  const prompt = buildPrompt(pkg);
  const raw = config.provider === "anthropic" ? await callAnthropic(config, prompt) : await callOpenAI(config, prompt);
  const payload = parseJson(raw);

  const appeals = (payload.appeals ?? [])
    .filter((a) => typeof a?.title === "string" && typeof a?.body === "string" && a.title.trim() && a.body.trim())
    .slice(0, 3)
    .map((a) => ({ title: a.title!.trim(), body: a.body!.trim() }));

  const rewrites = (payload.rewrites ?? [])
    .filter((r) => typeof r?.before === "string" && typeof r?.after === "string" && r.after.trim().length > 10)
    .slice(0, 10)
    .map((r) => ({
      before: r.before!.trim(),
      after: r.after!.trim(),
      reason: (r.reason ?? "LLM이 공고 문구에 맞춰 다듬은 문장입니다.").trim(),
    }));

  const questions = (payload.questions ?? [])
    .filter((q) => typeof q?.question === "string" && q.question.trim().length > 8)
    .slice(0, 6)
    .map((q) => {
      const category = CATEGORIES.includes(q.category as Category) ? (q.category as Category) : "직무";
      return {
        question: q.question!.trim(),
        why: (q.why ?? "이 공고에서 실제로 나올 수 있는 확인 질문입니다.").trim(),
        category,
      };
    });

  return { appeals, rewrites, questions };
}

export async function testLlmConnection(config: LlmConfig): Promise<string> {
  if (!config.apiKey.trim()) throw new Error("API 키가 비어 있습니다");
  const ping = '연결 확인입니다. JSON으로 {"ok":true} 만 출력하세요.';
  const raw = config.provider === "anthropic" ? await callAnthropic(config, ping) : await callOpenAI(config, ping);
  return raw.slice(0, 120);
}

export function applyEnrichment(pkg: JobPackage, enrichment: LlmEnrichment): JobPackage {
  const next: JobPackage = { ...pkg, engine: "llm" };

  if (enrichment.appeals.length === 3) {
    next.appeals = pkg.appeals.map((appeal, index) => ({
      ...appeal,
      title: enrichment.appeals[index]?.title || appeal.title,
      body: enrichment.appeals[index]?.body || appeal.body,
    }));
  }

  next.rewrites = pkg.rewrites.map((rewrite) => {
    const match = enrichment.rewrites.find((r) => r.before === rewrite.before);
    if (!match) return rewrite;
    return { ...rewrite, after: match.after, reason: match.reason };
  });

  const existing = new Set(pkg.questions.map((q) => q.question));
  const additions = enrichment.questions
    .filter((q) => !existing.has(q.question))
    .map((q, index) => ({
      id: `q-llm-${index + 1}`,
      category: q.category,
      question: q.question,
      why: q.why,
      difficulty: 3 as const,
      gap: null,
      edited: false,
      star: {
        situation: "[상황: 언제, 어느 조직에서]",
        task: "[과제: 무엇을 맡았는지]",
        action: "[행동: 내가 직접 한 일]",
        result: "[결과: 수치·변화]",
      },
      hint: "LLM이 공고를 보고 만든 질문입니다. 경력 원본에 있는 사실로만 답을 채우세요.",
    }));

  next.questions = [...pkg.questions, ...additions].slice(0, 14).map((q, i) => ({ ...q, id: `q-${i + 1}` }));
  return next;
}
