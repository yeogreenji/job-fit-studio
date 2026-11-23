import type { JobPackage, JobPosting, JobSource, MasterResume, PriorityId } from "../types";
import { analyze } from "./engine";
import { buildLocalAnswerSet, buildLocalNegotiation, buildLocalOnePoint } from "./priority";
import { buildLocalIntro, buildLocalReverse } from "./coach";

/**
 * 규칙 엔진만으로 만드는 지원 패키지.
 *
 * 심층 준비(면접 연습)와 지원 패키지 미리보기가 같은 결과를 쓰도록 한 곳에서 만듭니다.
 * AI는 이 패키지 위에 문장만 다듬습니다(src/lib/enrich.ts) — 여기서는 원문 인용만 합니다.
 */
export function buildLocalPackage(input: {
  resume: MasterResume;
  job: JobPosting;
  source?: JobSource;
  priority?: PriorityId;
  targetSalary?: number | null;
  hubJobId?: string;
  id?: string;
}): JobPackage {
  const { resume, job, source, priority, targetSalary, hubJobId } = input;
  const result = analyze(resume, job);
  return {
    id: input.id ?? `pkg-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    hubJobId,
    company: job.company.trim() || "회사 미확인",
    role: job.role.trim() || "직무 미확인",
    employmentType: job.employmentType,
    location: job.location,
    resumeName: resume.name,
    resumeHeadline: resume.headline,
    years: resume.years,
    engine: "rule",
    match: result.match,
    summary: result.summary,
    rewrites: result.rewrites,
    appeals: result.appeals,
    questions: buildLocalAnswerSet(result.questions, resume, job),
    jobKeywords: result.jobKeywords,
    resumeSnapshot: resume,
    jobSnapshot: job,
    intro: buildLocalIntro(resume, job, result.match, 0, priority),
    reverse: buildLocalReverse(resume, job, result.match, priority),
    feedback: [],
    source,
    priority,
    targetSalary: targetSalary ?? null,
    onePoint: buildLocalOnePoint(resume, job, result.match, priority),
    negotiation: buildLocalNegotiation({ job, match: result.match, priority, targetSalary }),
  };
}

/** 패키지의 ① 어필 포인트 3선을 복사용 텍스트로 */
export function appealText(pkg: JobPackage): string {
  return pkg.appeals
    .map((appeal, index) => `${index + 1}. ${appeal.title}\n${appeal.body}${appeal.keywords.length ? `\n(연결 키워드: ${appeal.keywords.join(", ")})` : ""}`)
    .join("\n\n");
}

/** ② 1분 자기소개 */
export const introText = (pkg: JobPackage): string => pkg.intro?.text ?? "";

/** ③ 예상 질문 5개 + 답변 전략 */
export function interviewText(pkg: JobPackage): string {
  return pkg.questions
    .slice(0, 5)
    .map((question, index) => {
      const lines = [`Q${index + 1}. [${question.category}] ${question.question}`, `면접관의 의도: ${question.why}`];
      if (question.answer) lines.push("", "모범 답변:", question.answer);
      if (question.avoid) lines.push("", `피해야 할 답변: ${question.avoid}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** ④ 연봉 협상 스크립트 */
export function negotiationText(pkg: JobPackage): string {
  const plan = pkg.negotiation;
  if (!plan) return "";
  const lines = [
    `희망 연봉: ${plan.target || "미입력"} (${plan.basis})`,
    "",
    `[첫 제안] ${plan.opener}`,
    "",
    `[금액 차이가 있을 때] ${plan.counter}`,
  ];
  if (plan.nonSalary.length) lines.push("", `[비연봉 카드] ${plan.nonSalary.join(" / ")}`);
  if (plan.questions.length) lines.push("", ...plan.questions.map((question) => `[확인 질문] ${question}`));
  return lines.join("\n");
}

/** 4개 블록 전체를 한 번에 복사할 때 */
export function kitText(pkg: JobPackage): string {
  return [
    `${pkg.company} — ${pkg.role} 지원 패키지`,
    "",
    "① 경력기술서 어필 포인트 3선",
    appealText(pkg),
    "",
    "② 1분 자기소개",
    introText(pkg),
    "",
    "③ 예상 면접 질문 5개 · 답변 전략",
    interviewText(pkg),
    "",
    "④ 연봉 협상 스크립트",
    negotiationText(pkg),
  ].join("\n");
}
