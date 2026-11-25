import type { HubJob, JobPackage } from "../types";
import { buildLocalIntro, buildLocalReverse, speakingSeconds } from "./coach";

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
  lines.push(`- 엔진: ${pkg.engine === "ai" ? `AI 분석${pkg.aiModel ? ` (${pkg.aiModel})` : ""}` : "내장 키워드 매칭 엔진 v1.0"}`);
  if (pkg.source) {
    lines.push(`- 공고 출처: ${pkg.source.kind === "url" ? `${pkg.source.site ?? "URL"} · ${pkg.source.url ?? ""}` : pkg.source.kind === "paste" ? "본문 붙여넣기" : "샘플"}`);
  }
  if (pkg.priority) lines.push(`- 이직 우선순위: ${pkg.priority}`);
  if (pkg.targetSalary) lines.push(`- 희망 연봉: ${pkg.targetSalary.toLocaleString("ko-KR")}만원`);
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
  if (pkg.onePoint) {
    lines.push("");
    lines.push(`### 원포인트 전략 — ${pkg.onePoint.title}`);
    lines.push(pkg.onePoint.body);
  }
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
  lines.push("## 5. 1분 자기소개 · 역질문");
  lines.push("");
  const intro = pkg.intro ?? buildLocalIntro(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match);
  const reverse = pkg.reverse ?? buildLocalReverse(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match);
  lines.push(`### 1분 자기소개 (${intro.text.replace(/\s+/g, "").length}자 · 약 ${speakingSeconds(intro.text)}초 · ${intro.source === "ai" ? "AI 생성" : "규칙 생성"})`);
  lines.push("");
  lines.push(intro.text);
  lines.push("");
  lines.push("### 마지막 역질문");
  lines.push("");
  reverse.forEach((item, index) => {
    lines.push(`${index + 1}. [${item.tone}] ${item.question}`);
    lines.push(`   - 의도: ${item.intent}`);
  });
  lines.push("");
  lines.push("## 6. 처우 · 연봉 협상 스크립트");
  lines.push("");
  if (pkg.negotiation) {
    const negotiation = pkg.negotiation;
    lines.push(`- 기준 금액: ${negotiation.target || "미입력"} (${negotiation.basis})`);
    lines.push("");
    lines.push(`**첫 제안** — ${negotiation.opener}`);
    lines.push("");
    lines.push(`**금액 차이가 있을 때** — ${negotiation.counter}`);
    lines.push("");
    if (negotiation.nonSalary.length) lines.push(`- 비연봉 카드: ${negotiation.nonSalary.join(" / ")}`);
    negotiation.questions.forEach((item) => lines.push(`- 처우 확인 질문: ${item}`));
  } else {
    lines.push("협상 스크립트가 없습니다. 희망 연봉을 입력하고 다시 분석하세요.");
  }
  lines.push("");
  lines.push("## 7. 면접 예상 질문 & 모범 답변");
  lines.push("");
  pkg.questions.forEach((q, index) => {
    lines.push(`### Q${index + 1}. [${q.category} · ${DIFFICULTY[q.difficulty]}] ${q.question}`);
    lines.push("");
    lines.push(`> 왜 묻는가: ${q.why}`);
    if (q.gap) lines.push(`> 연결 갭: ${q.gap}`);
    lines.push("");
    if (q.answer) {
      lines.push("**모범 답변 스크립트**");
      lines.push("");
      q.answer.split("\n").forEach((line) => lines.push(line));
      lines.push("");
    }
    lines.push(`- **S** ${q.star.situation}`);
    lines.push(`- **T** ${q.star.task}`);
    lines.push(`- **A** ${q.star.action}`);
    lines.push(`- **R** ${q.star.result}`);
    if (q.avoid) {
      lines.push("");
      lines.push(`> 피해야 할 답변: ${q.avoid}`);
    }
    lines.push("");
  });
  lines.push("## 8. 90초 연습 피드백");
  lines.push("");
  const feedback = (pkg.feedback ?? []).slice(0, 5);
  if (feedback.length === 0) {
    lines.push("아직 90초 연습 기록이 없습니다. 결과 화면의 질문 카드에서 ‘시작’을 눌러 답변을 연습하세요.");
  } else {
    for (const item of feedback) {
      lines.push(`### ${item.question}`);
      lines.push(`- 점수: ${item.score}/100 · ${item.seconds}초 · ${item.source === "ai" ? "AI" : "규칙"} 피드백`);
      lines.push(`- 잘한 점: ${item.strengths.join(" / ")}`);
      lines.push(`- 보완할 점: ${item.improvements.join(" / ")}`);
      lines.push(`- 꼬리질문: ${item.followUp}`);
      lines.push("");
    }
  }
  lines.push("");
  lines.push("## 9. 제출 전 체크리스트");
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
  const intro = pkg.intro ?? buildLocalIntro(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match);
  const reverse = pkg.reverse ?? buildLocalReverse(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match);
  lines.push(`# ${pkg.company} ${pkg.role} — 면접 준비 시트`);
  lines.push("");
  lines.push(`적합도 ${pkg.match.score}/100 · ${pkg.match.grade.label} · ${pkg.match.tone.label}`);
  lines.push("");
  lines.push("## 1분 자기소개");
  lines.push(`${pkg.resumeName} · ${pkg.resumeHeadline} · 경력 ${pkg.years}년`);
  lines.push("");
  lines.push(intro.text);
  lines.push("");
  lines.push("## 마지막 역질문");
  reverse.forEach((item, index) => lines.push(`${index + 1}. ${item.question}`));
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

/** 지원 현황 전체를 CSV로 — 엑셀에서 바로 열립니다. */
export function buildPipelineCsv(jobs: HubJob[]): string {
  const cell = (value: string) => {
    const text = value.replace(/\r?\n/g, " ").replace(/"/g, '""').trim();
    return `"${text}"`;
  };
  const header = ["회사", "직무", "상태", "근무지", "경력 조건", "마감", "지원일", "제출 서류", "메모", "공고 링크"];
  const rows = jobs.map((job) => [
    job.job.company,
    job.job.role,
    job.status,
    job.job.location,
    job.job.experience ?? "",
    job.job.deadline,
    job.applied ? new Date(job.applied.at).toLocaleDateString("ko-KR") : "",
    job.applied?.documents.join(" · ") ?? job.documentsChecked.join(" · "),
    job.memo,
    job.applyUrl,
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, text: string) {
  // 엑셀이 한국어를 깨지 않게 BOM을 붙입니다.
  const blob = new Blob([`\ufeff${text}`], { type: "text/csv;charset=utf-8" });
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
