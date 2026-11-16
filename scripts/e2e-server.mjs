/**
 * E2E용 로컬 서버.
 *   node scripts/e2e-server.mjs ai 4183      → dist 정적 파일 + 실제 api/analyze.ts (OpenAI는 스텁)
 *   node scripts/e2e-server.mjs nokey 4185   → 서버는 있지만 OPENAI_API_KEY 없음 (501 no_key)
 *   node scripts/e2e-server.mjs offline 4184 → 정적 파일만 (AI 서버 없음)
 */
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
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

/** 프롬프트에서 지원자 경력 문장과 공고 정보를 뽑아, 원문 근거만 쓰는 가짜 AI 응답을 만듭니다. */
function packagePayload(user) {
  const resumeBlock = user.split("[지원자 경력 문장")[1]?.split("[채용 공고]")[0] ?? "";
  const bullets = [...resumeBlock.matchAll(/^- (.+)$/gm)].map((match) => match[1].trim());
  const company = (user.match(/^회사: (.+)$/m) ?? [])[1] ?? "";
  const role = (user.match(/^직무: (.+)$/m) ?? [])[1] ?? "";
  const first = bullets[0] ?? "경력 문장을 바탕으로 준비했습니다.";
  const second = bullets[1] ?? first;
  const third = bullets[2] ?? second;

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
        { label: "커머스 지표", how: "구매 전환 지표를 월간 리포트에 함께 정리하겠습니다." },
        { label: "숏폼 제작", how: "숏폼은 협업 크리에이터와 함께 시작하겠습니다." },
      ],
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
      { question: "위기 대응 업무를 맡으면 어떤 순서로 대응하시겠습니까?", why: "공고의 위기 대응 업무를 실제로 맡을 수 있는지 확인합니다.", category: "위기 대응" },
      { question: "인플루언서 협업의 성과를 어떤 지표로 판단하시겠습니까?", why: "공고의 인플루언서 협업 업무와 성과 관점을 확인합니다.", category: "성과 검증" },
      { question: "캠페인 성과가 목표에 미달했을 때 무엇부터 다시 보십니까?", why: "실패를 다루는 방식을 확인합니다.", category: "직무" },
      { question: "유관부서와 의견이 갈렸던 경험을 말씀해 주세요.", why: "협업 방식을 확인합니다.", category: "협업" },
      { question: "이 직무에서 가장 먼저 정리하고 싶은 기준은 무엇입니까?", why: "입사 후 우선순위를 확인합니다.", category: "컬처" },
    ],
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
      if (!target.includes("/chat/completions")) return realFetch(url, init);
      const body = JSON.parse(init.body ?? "{}");
      const system = body.messages?.[0]?.content ?? "";
      const user = body.messages?.[1]?.content ?? "";
      if (user.includes("FAIL_UPSTREAM")) return jsonResponse({ error: { message: "stub upstream failure" } }, 500);
      const data = system.includes("JOBFIT_EVAL") ? evalPayload(user) : packagePayload(user);
      return jsonResponse({ model: body.model ?? "gpt-4o-mini", choices: [{ message: { content: JSON.stringify(data) } }] });
    };
    if (mode === "ai") process.env.OPENAI_API_KEY = "sk-test-jobfit-mock-0000000000";
    else delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
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
