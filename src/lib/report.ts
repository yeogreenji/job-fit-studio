import type { JobPackage } from "../types";

const SECTION_LABEL: Record<string, string> = {
  matched: "매칭",
  weak: "보완",
  missing: "미충족",
};

const DIFFICULTY = ["", "기본", "실무", "압박"];

const pad = (n: number) => String(n).padStart(2, "0");

export function buildMarkdown(pkg: JobPackage): string {
  const { match } = pkg;
  const when = new Date(pkg.createdAt);
  const lines: string[] = [];

  lines.push(`# ${pkg.company} — ${pkg.role} 지원 패키지`);
  lines.push("");
  lines.push(`- 지원자: ${pkg.resumeName} (${pkg.resumeHeadline}, 경력 ${pkg.years}년)`);
  lines.push(`- 고용 형태: ${pkg.employmentType}${pkg.location ? ` · ${pkg.location}` : ""}`);
  lines.push(`- 생성: ${when.getFullYear()}.${pad(when.getMonth() + 1)}.${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`);
  lines.push(`- 엔진: ${pkg.engine === "llm" ? "내장 엔진 + LLM 정밀 보정" : "내장 키워드 매칭 엔진 v1.0"}`);
  lines.push("");
  lines.push("## 1. 적합도 요약");
  lines.push("");
  lines.push(`**${match.score}/100 · ${match.grade.label}** — ${match.grade.desc}`);
  lines.push("");
  lines.push("| 항목 | 점수 | 가중치 | 근거 |");
  lines.push("| --- | --- | --- | --- |");
  for (const sub of match.subs) {
    lines.push(`| ${sub.label} | ${sub.score} | ${Math.round(sub.weight * 100)}% | ${sub.note.replace(/\|/g, "\\|")} |`);
  }
  lines.push("");
  lines.push(`- ${match.summaryLine}`);
  lines.push(`- 조직 톤: ${match.tone.label}`);
  lines.push(`- ${match.tone.summary}`);
  lines.push("");
  lines.push("## 2. 키워드 매칭과 갭");
  lines.push("");
  lines.push("| 키워드 | 상태 | 공고 내 위치 | 이력서 근거 |");
  lines.push("| --- | --- | --- | --- |");
  for (const keyword of match.keywords) {
    const evidence = keyword.evidence.length ? keyword.evidence[0].text.replace(/\|/g, "\\|") : "—";
    lines.push(`| ${keyword.label} | ${SECTION_LABEL[keyword.status]} | ${keyword.sectionLabel} | ${evidence} |`);
  }
  lines.push("");
  const gaps = match.keywords.filter((k) => k.status !== "matched");
  if (gaps.length) {
    lines.push("### 미충족·보완 키워드");
    lines.push("");
    for (const gap of gaps) {
      lines.push(`- **${gap.label}** (${SECTION_LABEL[gap.status]}) — 공고: “${gap.snippet}”`);
    }
    lines.push("");
  }
  lines.push("## 3. 핵심 어필 포인트");
  lines.push("");
  pkg.appeals.forEach((appeal, index) => {
    lines.push(`### ${index + 1}. ${appeal.title}`);
    lines.push(appeal.body);
    if (appeal.keywords.length) lines.push(`> 연결 키워드: ${appeal.keywords.join(" · ")}`);
    lines.push("");
  });
  lines.push("## 4. 경력기술서 리라이트");
  lines.push("");
  lines.push("### 지원 요약 (프로필)");
  lines.push("");
  lines.push(`- 원문: ${pkg.summary.before || "—"}`);
  lines.push(`- 수정: ${pkg.summary.after}`);
  lines.push(`- 근거: ${pkg.summary.reason}`);
  lines.push("");
  const adopted = pkg.rewrites.filter((r) => r.adopted);
  lines.push(`반영 ${adopted.length} / 전체 ${pkg.rewrites.length}문장`);
  lines.push("");
  let currentExperience = "";
  for (const rewrite of pkg.rewrites) {
    if (rewrite.experienceId !== currentExperience) {
      currentExperience = rewrite.experienceId;
      lines.push(`### ${rewrite.company} · ${rewrite.role} (${rewrite.period})`);
      lines.push("");
    }
    lines.push(`**${rewrite.adopted ? "반영" : "미반영"} · 관련도 ${rewrite.relevance}**`);
    lines.push(`- 원문: ${rewrite.before}`);
    lines.push(`- 수정: ${rewrite.after}`);
    lines.push(`- 근거: ${rewrite.reason}`);
    if (rewrite.matched.length) lines.push(`- 키워드: ${rewrite.matched.join(", ")}`);
    lines.push("");
  }
  lines.push("## 5. 면접 예상 질문 & STAR");
  lines.push("");
  pkg.questions.forEach((q, index) => {
    lines.push(`### Q${index + 1}. [${q.category} · ${DIFFICULTY[q.difficulty]}] ${q.question}`);
    lines.push("");
    lines.push(`> 왜 묻는가: ${q.why}`);
    if (q.gap) lines.push(`> 연결 갭: ${q.gap}`);
    lines.push("");
    lines.push(`- **S** ${q.star.situation}`);
    lines.push(`- **T** ${q.star.task}`);
    lines.push(`- **A** ${q.star.action}`);
    lines.push(`- **R** ${q.star.result}`);
    lines.push("");
  });
  lines.push("## 6. 제출 전 체크리스트");
  lines.push("");
  lines.push(`- [${adopted.length === pkg.rewrites.length ? "x" : " "}] 경력기술서 리라이트 전체 반영 검토 (${adopted.length}/${pkg.rewrites.length})`);
  lines.push(`- [${pkg.questions.every((q) => q.star.result && !q.star.result.startsWith("[")) ? "x" : " "}] STAR 답변의 결과 수치 채우기`);
  lines.push("- [ ] 지원 동기를 회사 최근 소식과 연결해 한 문단으로 정리");
  lines.push("- [ ] 면접 준비 시트 인쇄 또는 PDF 저장");
  lines.push("");
  lines.push("---");
  lines.push("JobFit Studio · 모든 예시 인물과 기업은 가상이며, 입력한 정보는 이 브라우저에만 저장됩니다.");
  lines.push("");

  return lines.join("\n");
}

export function buildInterviewSheet(pkg: JobPackage): string {
  const lines: string[] = [];
  lines.push(`# ${pkg.company} ${pkg.role} — 면접 준비 시트`);
  lines.push("");
  lines.push(`적합도 ${pkg.match.score}/100 · ${pkg.match.grade.label} · ${pkg.match.tone.label}`);
  lines.push("");
  lines.push("## 30초 자기소개");
  lines.push(`${pkg.resumeName} · ${pkg.resumeHeadline} · 경력 ${pkg.years}년`);
  lines.push("");
  lines.push(pkg.summary.adopted ? pkg.summary.after : pkg.summary.before);
  lines.push(pkg.appeals.map((a) => `- ${a.title}`).join("\n"));
  lines.push("");
  lines.push("## 예상 질문");
  pkg.questions.forEach((q, i) => {
    lines.push(`${i + 1}. [${q.category}] ${q.question}`);
    lines.push(`   - ${q.star.result}`);
  });
  lines.push("");
  lines.push("## 보완 키워드");
  lines.push(pkg.match.keywords.filter((k) => k.status !== "matched").map((k) => `- ${k.label} (${SECTION_LABEL[k.status]})`).join("\n"));
  return lines.join("\n");
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugForFile(company: string, date: string) {
  const d = new Date(date);
  const safe = company.replace(/[^\w가-힣]+/g, "-").replace(/^-|-$/g, "") || "jobfit";
  return `${safe}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.md`;
}
