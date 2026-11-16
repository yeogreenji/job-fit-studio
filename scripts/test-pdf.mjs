/**
 * PDF 텍스트 추출 단위 테스트.
 *   node scripts/test-pdf.mjs
 * scripts/fixtures/my-resume.pdf 를 읽어 이름·경력 문장이 나오는지 확인합니다.
 */
import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outfile = path.join(here, ".build", "pdf.mjs");

await mkdir(path.join(here, ".build"), { recursive: true });
await build({
  entryPoints: [path.join(root, "src/lib/pdf.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  logLevel: "silent",
});

const { extractPdfText } = await import(`${outfile}?t=${Date.now()}`);
const buffer = await readFile(path.join(here, "fixtures/my-resume.pdf"));
const result = await extractPdfText(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));

const checks = [
  ["pdf ok", result.ok === true],
  ["pdf pages", result.pages >= 1],
  ["pdf name", result.text.includes("김하람")],
  ["pdf headline", result.text.includes("브랜드 커뮤니케이션 매니저")],
  ["pdf bullet", result.text.includes("인플루언서 90명")],
  ["pdf metric", result.text.includes("28%")],
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
