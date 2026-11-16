/**
 * E2E용 로컬 서버.
 *   node scripts/e2e-server.mjs ai 4183      → dist 정적 파일 + 실제 api/analyze.ts (OpenAI는 스텁)
 *   node scripts/e2e-server.mjs gemini 4185  → 같은 서버를 GEMINI_API_KEY로 띄우고 Gemini 경로를 스텁
 *   node scripts/e2e-server.mjs nokey 4185   → 서버는 있지만 키 없음 (501 no_key)
 *   node scripts/e2e-server.mjs offline 4184 → 정적 파일만 (AI 서버 없음)
 */
import http from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const jobPage = await readFile(path.join(here, "fixtures/job-page.html"), "utf-8");
const dist = path.join(root, "dist");
const mode = process.argv[2] ?? "ai";
const port = Number(process.argv[3] ?? 4183);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

/** 공고 URL 정리 스텁: 페이지에 실제로 있는 값만 돌려줍니다. */
function jobExtractPayload() {
  return {
    company: "노바커머스",
    role: "브랜드 커뮤니케이션 매니저",
    employmentType: "정규직",
    location: "서울 성동구",
    deadline: "2026-12-20",
    responsibilities:
      "브랜드 캠페인 기획과 실행, 채널별 메시지 관리\n인플루언서·크리에이터 협업 프로그램 운영\n위기 이슈 모니터링과 공식 입장문 작성\n콘텐츠 성과 데이터를 정리해 월간 리포트로 공유",
    requirements:
      "브랜드 커뮤니케이션 또는 콘텐츠 마케팅 경력 4년 이상\nSNS 채널 운영 실무 경험\n유관부서와 협업해 캠페인을 끝까지 실행한 경험",
    preferred: "커머스 산업 경험\n숏폼 콘텐츠 제작 경험\n데이터 기반으로 캠페인을 개선한 경험",
    tone: "브랜드 감도와 디테일을 중시하는 팀\n빠른 실험과 데이터 확인을 반복하는 문화",
    note: "",
  };
}

/** 추천 스텁: 이력서에 있는 말만 씁니다. */
function recommendPayload() {
  return {
    titles: [
      { title: "시니어 브랜드 커뮤니케이션 매니저", why: "브랜드 캠페인과 SNS 채널 운영 문장이 경력에 이어져 있습니다." },
      { title: "콘텐츠 마케팅 매니저", why: "콘텐츠 기획과 성과 분석 경험이 함께 확인됩니다." },
      { title: "인플루언서 마케팅 매니저", why: "인플루언서 협업 프로그램 운영 경험이 근거입니다." },
    ],
    salaryBand: { min: 4800, max: 5800, basis: "6년차 브랜드 커뮤니케이션 기준 추정" },
    targets: [
      { group: "커머스·D2C 브랜드", why: "커머스 산업 경험과 자사몰 성과 문장이 있습니다." },
      { group: "콘텐츠 기업", why: "콘텐츠 제작과 채널 운영 경험이 이어집니다." },
      { group: "뷰티 브랜드 인하우스", why: "브랜드 캠페인 실행 경험이 인하우스 업무와 겹칩니다." },
    ],
  };
}

/** 프롬프트에서 지원자 경력 문장과 공고 정보를 뽑아, 원문 근거만 쓰는 가짜 AI 응답을 만듭니다. */
function packagePayload(user) {
  const resumeBlock = user.split("[지원자 경력 문장")[1]?.split("[채용 공고]")[0] ?? "";
  const bullets = [...resumeBlock.matchAll(/^- (.+)$/gm)].map((match) => match[1].trim());
  const company = (user.match(/^회사: (.+)$/m) ?? [])[1] ?? "";
  const role = (user.match(/^직무: (.+)$/m) ?? [])[1] ?? "";
  const first = bullets[0] ?? "경력 문장을 바탕으로 준비했습니다.";
  const second = bullets[1] ?? first;
  const third = bullets[2] ?? second;
  const targetRaw = (user.match(/\[희망 연봉\]\n(\d+)만원/) ?? [])[1] ?? "";
  const targetManwon = targetRaw ? Number(targetRaw).toLocaleString("en-US") : "";

  const intro = [
    "저는 브랜드 캠페인과 채널 운영을 직접 해 온 커뮤니케이터입니다.",
    first,
    second,
    third,
    "캠페인 성과는 채널별 지표로 나눠 확인해 왔습니다.",
    "위기 이슈가 생겼을 때는 먼저 사실을 정리하고 공식 입장을 만들었습니다.",
    "콘텐츠는 기획부터 제작과 성과 확인까지 직접 맡아 왔습니다.",
    "귀사가 요구한 캠페인 기획과 콘텐츠 운영은 제가 해 온 일과 겹칩니다.",
    "입사하면 먼저 채널별 메시지 기준을 정리하고 성과 지표를 맞추겠습니다.",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    fit: {
      verdict: "캠페인 실행과 채널 운영 경험이 공고의 담당 업무와 직접 겹칩니다. 다만 위기 대응은 근거 문장이 적습니다.",
      strengths: [
        { label: "캠페인 실행", why: `공고의 브랜드 캠페인 업무에 대해 “${first}”라는 근거가 있습니다.` },
        { label: "채널 운영", why: `공고의 SNS 운영 요구에 대해 “${third}”라는 근거가 있습니다.` },
        { label: "성과 리포트", why: `공고의 데이터 리포트 요구에 대해 “${second}”라는 근거가 있습니다.` },
      ],
      gaps: [
        { label: "위기 대응 체계", how: "입사 후 대응 매뉴얼과 입장문 템플릿을 먼저 정리하겠습니다." },
        { label: "숏폼 제작", how: "숏폼은 협업 크리에이터와 함께 시작하겠습니다." },
      ],
      onePoint: {
        title: "‘숏폼 제작’을 첫 문단에",
        body: "공고의 우대 사항에 숏폼 제작이 있는데 이력서에는 숏폼 문장이 약합니다. 지원 요약 첫 문단에서 숏폼 콘텐츠 제작 경험을 먼저 말하고, 면접에서는 채널 지표로 이어 설명하세요.",
      },
    },
    intro: {
      text: intro,
      outline: {
        hook: "저는 브랜드 캠페인과 채널 운영을 직접 해 온 커뮤니케이터입니다.",
        proof: first,
        fit: "귀사가 요구한 캠페인 기획과 콘텐츠 운영은 제가 해 온 일과 겹칩니다.",
        close: "입사하면 먼저 채널별 메시지 기준을 정리하고 성과 지표를 맞추겠습니다.",
      },
    },
    appeals: [
      { title: "캠페인 실행력", body: `${company}의 ${role} 공고가 요구한 캠페인 기획에 대해, ${first}` },
      { title: "채널 운영", body: `공고의 SNS 운영 요구에 대해, ${third}` },
      { title: "성과 리포트", body: `공고의 데이터 기반 개선 요구에 대해, ${second}` },
    ],
    rewrites: [
      { before: first, after: `${first} 성과 기준과 기간을 함께 정리했습니다.`, reason: "공고의 성과 리포트 요구를 반영했습니다." },
      { before: second, after: `${second} 채널별 성과로 나눠 확인했습니다.`, reason: "공고의 채널 운영 요구를 앞에 세웠습니다." },
      {
        before: third,
        after: `${third} 매출 999억을 달성했습니다.`,
        reason: "공고의 성과 수치 요구를 반영했습니다.",
      },
    ],
    questions: [
      {
        question: "위기 대응 업무를 맡으면 어떤 순서로 대응하시겠습니까?",
        why: "공고의 위기 대응 업무를 실제로 맡을 수 있는지 확인합니다.",
        category: "위기 대응",
        answer: `위기 이슈가 터지면 사실 확인과 내부 정렬을 먼저 합니다. ${first} 이 경험에서 먼저 확인한 것은 사실과 이해관계자였고, 그다음에 공식 입장을 만들었습니다. 입사 후에도 같은 순서로 움직이겠습니다.`,
        avoid: "첫 문장이 ‘일단 보도자료를 쓰겠습니다’인 답변은 사실 확인 없이 나가는 메시지라 2차 이슈를 만듭니다.",
      },
      {
        question: "인플루언서 협업의 성과를 어떤 지표로 판단하시겠습니까?",
        why: "공고의 인플루언서 협업 업무와 성과 관점을 확인합니다.",
        category: "성과 검증",
        answer: `인플루언서 협업은 제작 수와 전환을 나눠 봅니다. ${second} 협업을 운영할 때는 콘텐츠 제작 수와 채널 반응을 함께 봤고, 다음 캠페인에서는 반응이 좋은 형식만 남겼습니다.`,
        avoid: "노출 수만 말하고 전환이나 제작 비용을 말하지 않는 답변은 성과 판단 기준이 없다는 인상을 줍니다.",
      },
      {
        question: "캠페인 성과가 목표에 미달했을 때 무엇부터 다시 보십니까?",
        why: "실패를 다루는 방식을 확인합니다.",
        category: "직무",
        answer: `먼저 지표를 채널별로 나눠 어디서 끊겼는지 봅니다. ${third} 그 경험에서도 메시지보다 채널 배치가 문제였고, 배치를 바꾼 뒤 반응이 달라졌습니다.`,
        avoid: "예산이 부족했다는 설명으로 끝나는 답변은 내가 바꾼 것을 보여주지 못합니다.",
      },
      {
        question: "유관부서와 의견이 갈렸던 경험을 말씀해 주세요.",
        why: "협업 방식을 확인합니다.",
        category: "협업",
        answer: `반대하는 이유를 먼저 정확히 듣고 공동 목표로 다시 정의합니다. ${first} 이 과정에서도 유관부서와 지표를 먼저 맞춘 뒤 실행했습니다.`,
        avoid: "‘설득해서 잘 진행했습니다’로 끝나는 답변은 상대의 이유를 어떻게 들었는지가 빠져 있습니다.",
      },
      {
        question: "이 직무에서 가장 먼저 정리하고 싶은 기준은 무엇입니까?",
        why: "입사 후 우선순위를 확인합니다.",
        category: "컬처",
        answer: "채널별 메시지 기준과 성과 지표를 먼저 맞추겠습니다. 브랜드 캠페인과 채널 운영을 함께 해 왔기 때문에 메시지와 지표를 한 문서에서 관리하는 방식이 맞다고 봅니다.",
        avoid: "회사 홈페이지 문구를 그대로 읽는 답변은 내 습관과 사례가 없어 준비하지 않은 것으로 읽힙니다.",
      },
    ],
    negotiation: {
      opener: targetManwon
        ? `먼저 처우 이야기해 주셔서 감사합니다. 지금 경력과 이 직무의 범위를 함께 봤을 때 ${targetManwon}만원을 기준으로 협의하고 싶습니다.`
        : "먼저 처우 이야기해 주셔서 감사합니다. 지금 경력과 이 직무의 범위를 함께 봤을 때 협의하고 싶은 기준이 있습니다.",
      counter:
        "제시해 주신 금액과 제 기준 사이에 차이가 있습니다. 사이닝 보너스, 연차·재택 조건, 6개월 뒤 성과 재협상 중 조정 가능한 방법이 있으면 맞추겠습니다.",
      nonSalary: ["사이닝 보너스 또는 첫해 인센티브", "재택·유연근무의 실제 운영 방식", "교육·컨퍼런스 예산"],
      questions: ["6개월 뒤 잘하고 있다고 판단하는 기준은 무엇인가요?", "팀의 채널 운영 체계는 어디까지 갖춰져 있나요?", "처우 협의는 어느 단계에서 진행되나요?"],
    },
    reverseQuestions: [
      { question: "이 자리에서 6개월 뒤 잘하고 있다고 판단하는 기준은 무엇인가요?", intent: "평가 기준을 먼저 확인해 우선순위를 정합니다.", tone: "성과 기준" },
      { question: "지금 팀은 위기 대응 체계를 어디까지 갖추고 있나요?", intent: "갭을 약점이 아니라 입사 후 할 일로 만듭니다.", tone: "갭 확인" },
      { question: "브랜드 감도를 중시한다고 하셨는데, 최근 잘 작동한 사례를 들려주실 수 있나요?", intent: "조직의 실제 작동 방식을 확인합니다.", tone: "조직 적합" },
    ],
  };
}

function evalPayload(user) {
  return {
    strengths: [
      "상황과 행동이 순서대로 드러나 듣는 사람이 따라가기 쉽습니다.",
      "캠페인 성과를 수치로 제시해 기여 범위가 분명합니다.",
      "매출 777억을 달성했습니다.",
    ],
    improvements: [
      "결과의 측정 기준과 기간을 한 문장 덧붙이면 압박 질문에 강해집니다.",
      "본인이 직접 한 일과 팀이 한 일을 한 번 더 나눠 말해 보세요.",
    ],
    followUp: "그 캠페인의 성과를 어떤 지표로 측정했는지 말씀해 주시겠어요?",
    followUpWhy: "수치의 측정 기준이 답변에 없어 면접관이 이어서 물을 지점입니다.",
    score: 74,
    verdict: "구조는 좋지만 측정 기준 설명이 한 문장 부족합니다.",
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

/** Gemini 모의 응답: 마지막 요청 본문을 남겨 generationConfig 계약을 검증할 수 있게 합니다. */
async function geminiResponse(url, init = {}) {
  const target = String(url);
  const key = new URL(target).searchParams.get("key") ?? "";
  // Gemini 키는 AIza…·AQ.… 등으로 발급됩니다. OpenAI 키(sk-)나 빈 값만 거부합니다.
  if (!key || key.startsWith("sk-")) {
    return jsonResponse({ error: { message: "API key not valid. Please pass a valid API key." } }, 400);
  }
  const body = JSON.parse(init.body ?? "{}");
  const model = decodeURIComponent((target.split("/models/")[1] || "").split(":")[0]);
  try {
    await mkdir(path.join(here, ".build"), { recursive: true });
    await writeFile(path.join(here, ".build", "gemini-request.json"), JSON.stringify({ model, body }, null, 2), "utf-8");
  } catch {
    /* 캡처 실패는 무시 */
  }
  const system = body.systemInstruction?.parts?.[0]?.text ?? "";
  const user = body.contents?.[0]?.parts?.[0]?.text ?? "";
  const data = payloadFor(system, user);
  return jsonResponse({
    candidates: [{ content: { parts: [{ text: JSON.stringify(data) }], role: "model" }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 900, totalTokenCount: 2100 },
    modelVersion: model,
  });
}

function payloadFor(system, user) {
  if (system.includes("JOBFIT_JOBURL")) return jobExtractPayload();
  if (system.includes("JOBFIT_RECOMMEND")) return recommendPayload();
  if (system.includes("JOBFIT_EVAL")) return evalPayload(user);
  return packagePayload(user);
}

async function boot() {
  let handler = null;
  if (mode !== "offline") {
    const outfile = path.join(here, ".build", "analyze.mjs");
    await build({
      entryPoints: [path.join(root, "api/analyze.ts")],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      outfile,
      logLevel: "silent",
    });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const target = String(url);
      if (target.includes(":generateContent")) return geminiResponse(url, init);
      // 공고 URL 수집 테스트용 가짜 사이트
      if (target.includes("wanted.co.kr")) {
        return new Response(jobPage, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (target.includes("blocked-careers.example")) {
        return new Response("Forbidden", { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
      }
      if (!target.includes("/chat/completions")) return realFetch(url, init);
      const body = JSON.parse(init.body ?? "{}");
      const system = body.messages?.[0]?.content ?? "";
      const user = body.messages?.[1]?.content ?? "";
      if (user.includes("FAIL_UPSTREAM")) return jsonResponse({ error: { message: "stub upstream failure" } }, 500);
      const data = payloadFor(system, user);
      return jsonResponse({ model: body.model ?? "gpt-4o-mini", choices: [{ message: { content: JSON.stringify(data) } }] });
    };
    if (mode === "ai" || mode === "strict") {
      process.env.OPENAI_API_KEY = "sk-test-jobfit-mock-0000000000";
    } else if (mode === "gemini") {
      process.env.GEMINI_API_KEY = "AQ-test-jobfit-mock-0000000000";
      delete process.env.OPENAI_API_KEY;
    } else {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
    }
    delete process.env.OPENAI_BASE_URL;
    delete process.env.GEMINI_BASE_URL;
    delete process.env.GEMINI_MODEL;
    process.env.JOBFIT_ALLOW_LOCAL_FETCH = mode === "strict" ? "" : "1";
    handler = (await import(`${outfile}?ts=${Date.now()}`)).default;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    if (url.pathname === "/api/analyze") {
      if (!handler) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: { code: "server_unavailable" } }));
        return;
      }
      await handler(req, res);
      return;
    }
    let filePath = path.join(dist, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(dist)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    try {
      const content = await readFile(filePath);
      res.statusCode = 200;
      res.setHeader("content-type", MIME[path.extname(filePath)] ?? "application/octet-stream");
      res.end(content);
    } catch {
      try {
        const content = await readFile(path.join(dist, "index.html"));
        res.statusCode = 200;
        res.setHeader("content-type", MIME[".html"]);
        res.end(content);
      } catch {
        res.statusCode = 404;
        res.end("not found");
      }
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`jobfit e2e server (${mode}) on http://127.0.0.1:${port}/`);
  });
}

boot().catch((error) => {
  console.error(error);
  process.exit(1);
});
