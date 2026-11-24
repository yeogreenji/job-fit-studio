/**
 * PDF 텍스트 추출 + 커리어 서류 요약 단위 테스트.
 *   node scripts/test-pdf.mjs
 * scripts/fixtures/my-resume.pdf 를 읽어 이름·경력 문장이 나오는지,
 * my-cover.txt · my-portfolio.txt 에서 키워드·프로젝트가 뽑히는지 확인합니다.
 */
import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const buildDir = path.join(here, ".build");

await mkdir(buildDir, { recursive: true });

const pdfOut = path.join(buildDir, "pdf.mjs");
await build({
  entryPoints: [path.join(root, "src/lib/pdf.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: pdfOut,
  logLevel: "silent",
});

const kitOut = path.join(buildDir, "careerkit.mjs");
await build({
  entryPoints: [path.join(root, "src/lib/careerKit.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: kitOut,
  logLevel: "silent",
});

const { extractPdfText } = await import(`${pdfOut}?t=${Date.now()}`);
const { parseDoc, putDoc, composeKit, kitReady, searchKeywords, matchJobWithKit, EMPTY_KIT } = await import(`${kitOut}?t=${Date.now()}`);

const buffer = await readFile(path.join(here, "fixtures/my-resume.pdf"));
const result = await extractPdfText(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

const coverText = await readFile(path.join(here, "fixtures/my-cover.txt"), "utf-8");
const portfolioText = await readFile(path.join(here, "fixtures/my-portfolio.txt"), "utf-8");

const cover = parseDoc({ kind: "cover", text: coverText, fileName: "my-cover.txt", chars: coverText.length });
const portfolio = parseDoc({ kind: "portfolio", text: portfolioText, fileName: "my-portfolio.txt", chars: portfolioText.length });

const resumeLike = {
  id: "r",
  name: "김하람",
  headline: "브랜드 커뮤니케이션 매니저",
  years: 6,
  summary: "브랜드 캠페인과 SNS 채널을 운영해 온 커뮤니케이터입니다.",
  skills: ["브랜드 캠페인", "SNS 운영", "위기 대응"],
  industries: ["커머스"],
  experiences: [
    {
      id: "e",
      company: "노바커머스",
      role: "브랜드 커뮤니케이션 매니저",
      period: "2021.03 – 현재",
      employment: "정규직",
      bullets: [{ id: "b", text: "보도자료 12건을 배포해 주요 매체 8곳에 기사화했습니다." }],
    },
  ],
};
const resumeDoc = parseDoc({ kind: "resume", text: "", fileName: "my-resume.txt", chars: 1200, resume: resumeLike });

let kit = putDoc(EMPTY_KIT, resumeDoc, { role: "브랜드 커뮤니케이션 매니저", years: 6, resume: resumeLike });
kit = putDoc(kit, cover);
kit = putDoc(kit, portfolio);

const job = {
  id: "j",
  company: "노바커머스",
  role: "홍보 PR 과장",
  employmentType: "정규직",
  location: "서울",
  deadline: "2026-12-20",
  responsibilities: "보도자료 작성과 미디어 대응\n위기 대응 메시지와 공식 입장문 작성",
  requirements: "경력 10년 이상\n보도자료 작성과 미디어 대응 실무 경험\n영상 편집 툴 운용 경험",
  preferred: "인플루언서 협업 경험",
  documents: "이력서 1부\n자기소개서 1부\n포트폴리오 1부",
  tone: "",
  experience: "경력 10년 이상",
};
const match = matchJobWithKit(kit, job);
const composed = composeKit({ docs: kit.docs, portfolioUrl: "", role: kit.role, years: kit.years, resume: resumeLike });

const checks = [
  ["pdf ok", result.ok === true],
  ["pdf pages", result.pages >= 1],
  ["pdf name", result.text.includes("김하람")],
  ["pdf headline", result.text.includes("브랜드 커뮤니케이션 매니저")],
  ["pdf bullet", result.text.includes("인플루언서 90명")],
  ["pdf metric", result.text.includes("28%")],
  ["cover summary", cover.summary.length >= 20],
  ["cover keywords", cover.keywords.includes("보도자료") && cover.keywords.includes("위기관리")],
  ["cover highlights", cover.highlights.length >= 1],
  ["portfolio projects", portfolio.projects.includes("신제품 런칭 캠페인")],
  ["portfolio keywords", portfolio.keywords.includes("보도자료") && portfolio.keywords.includes("인플루언서 협업")],
  ["portfolio metric highlight", portfolio.highlights.some((line) => line.includes("28%"))],
  ["resume doc keywords", resumeDoc.keywords.length >= 2],
  ["kit ready", kitReady(kit) === true],
  ["kit docs count", ["resume", "cover", "portfolio"].every((kind) => kit.docs[kind])],
  ["kit summary", kit.summary.includes("서류 3/3")],
  ["kit keywords merged", kit.keywords.length >= 6],
  ["kit keyword origin", (kit.keywordDocs["보도자료"] || []).length >= 2],
  ["kit role", kit.role === "브랜드 커뮤니케이션 매니저"],
  ["kit years", kit.years === 6],
  ["search keywords", searchKeywords(kit, 4).length === 4 && !searchKeywords(kit, 4).includes("매니저")],
  ["doc match score", match.score > 30 && match.score <= 98],
  ["doc match reasons", match.matched.length >= 3],
  ["doc match years gap", match.gaps.some((gap) => gap.includes("10년"))],
  ["doc match skill gap", match.gaps.some((gap) => gap.includes("영상"))],
  ["doc match synonym", match.matched.some((item) => item.label === "미디어 대응")],
  ["doc match labels", match.matched.every((item) => ["resume", "cover", "portfolio"].includes(item.doc))],
  ["compose keeps docs", ["resume", "cover", "portfolio"].every((kind) => composed.docs[kind])],
];

let failed = 0;
for (const [name, ok] of checks) {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
}
console.log(`SUMMARY ${checks.length - failed}/${checks.length} passed`);
if (!result.ok) console.log("reason:", result.reason);
console.log("--- text ---\n" + result.text.slice(0, 400));
process.exit(failed === 0 ? 0 : 1);
