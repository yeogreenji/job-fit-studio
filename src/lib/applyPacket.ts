import type { ApplyDraft, ApplyPacket, CareerKit, JobPosting, MasterResume } from "../types";
import { DOC_LABEL, kitReady } from "./careerKit";
import { buildLocalApplyKit, docItems, linesOf } from "./apply";
import { quotedJosa } from "./josa";

/**
 * ‘바로 지원하기’의 제출용 묶음.
 *
 * 한 줄 어필·자소서 핵심 문단·이메일 본문을 **업로드한 서류와 공고 원문의 문장만으로** 만듭니다.
 * 채용 사이트 로그인·지원서 양식은 대신하지 않는다는 사실을 화면과 문구에 그대로 적습니다.
 */

const clean = (text: string): string => text.replace(/\s+/g, " ").trim();

const end = (text: string): string => {
  const trimmed = clean(text);
  if (!trimmed) return "";
  return /[.!?。]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const firstLine = (text: string | undefined, max = 60): string => {
  const line = linesOf(text, 6)[0] ?? "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
};

/** 공고 본문에서 지원 이메일을 찾습니다 (없으면 빈 문자열 — 만들어 넣지 않습니다). */
export function emailFromJob(job: JobPosting): string {
  const text = [job.responsibilities, job.requirements, job.preferred, job.documents ?? "", job.conditions ?? "", job.tone]
    .filter(Boolean)
    .join("\n");
  const found = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return found ? found[0].replace(/[.,)]$/, "") : "";
}

/** 제출 서류 목록 — 업로드한 서류 + 공고가 요구하는 서류 체크 상태 */
export function readyDocuments(
  kit: CareerKit,
  job: JobPosting,
  checked: string[] = [],
): { label: string; ready: boolean; note: string }[] {
  const rows: { label: string; ready: boolean; note: string }[] = [
    {
      label: DOC_LABEL.resume,
      ready: Boolean(kit.docs.resume),
      note: kit.docs.resume?.fileName ?? "업로드하지 않았습니다",
    },
    {
      label: DOC_LABEL.cover,
      ready: Boolean(kit.docs.cover),
      note: kit.docs.cover?.fileName ?? "업로드하지 않았습니다",
    },
    {
      label: DOC_LABEL.portfolio,
      ready: Boolean(kit.docs.portfolio || kit.portfolioUrl),
      note: kit.docs.portfolio?.fileName ?? kit.portfolioUrl ?? "업로드하지 않았습니다",
    },
  ];

  for (const doc of docItems(job)) {
    rows.push({ label: doc, ready: checked.includes(doc), note: checked.includes(doc) ? "체크함" : "공고 요구 서류 — 체크해서 준비 상태를 남기세요" });
  }
  return rows;
}

export function buildApplyPacket({
  kit,
  resume,
  job,
  draft,
}: {
  kit: CareerKit;
  resume: MasterResume;
  job: JobPosting;
  draft: ApplyDraft | null;
}): ApplyPacket {
  const local = draft ?? buildLocalApplyKit(resume, job);
  const company = job.company.trim() || "귀사";
  const role = job.role.trim() || "이 포지션";
  const duty = firstLine(job.responsibilities);
  // 연차·학력·고용형태 줄이 아니라 실제 업무 요건을 인용합니다.
  const requirementLine =
    linesOf(job.requirements, 6).find((line) => !/경력\s*\d|경력\s*(?:무관|이상|이하)|학력|전공|정규직|계약직|근무|급여|연봉|복리후생/.test(line)) ??
    linesOf(job.requirements, 6)[0] ??
    "";
  const requirement = requirementLine.length > 60 ? `${requirementLine.slice(0, 60)}…` : requirementLine;
  const name = resume.name.trim() || "지원자";

  const portfolioDoc = kit.docs.portfolio;
  const coverDoc = kit.docs.cover;
  const highlight =
    portfolioDoc?.highlights[0] ??
    coverDoc?.highlights[0] ??
    local.keyPoints[0] ??
    resume.experiences.flatMap((exp) => exp.bullets.map((bullet) => bullet.text))[0] ??
    "";
  const portfolioTitle = portfolioDoc?.projects?.[0] ?? "";
  const keyword = kit.keywords[0] ?? resume.skills[0] ?? "";

  const motive = end(
    `${company}의 ${role} 공고에서 ${duty ? quotedJosa(duty, "을") : "맡을 업무를"} 확인하고 지원했습니다`,
  );
  const proof = highlight
    ? end(`${portfolioDoc ? (portfolioTitle ? `포트폴리오의 ‘${portfolioTitle}’ 작업에서 ` : "포트폴리오에서 정리한 작업 가운데 ") : ""}${highlight.replace(/[.。]$/, "")}`)
    : "";
  const fitLine = requirement
    ? end(`공고의 자격 요건인 ‘${requirement.replace(/[.。]$/, "")}’에 맞춰 ${keyword || "같은 업무"} 경험을 먼저 말씀드리겠습니다`)
    : "";
  const close = end(
    `입사하면 ${role}의 ${keyword || "업무"} 기준을 먼저 확인하고, 실행과 성과 확인을 반복하며 팀에 필요한 결과를 만들겠습니다`,
  );

  const coverParagraph = [[motive, proof].filter(Boolean).join(" "), [fitLine, close].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join("\n\n");

  const documents = readyDocuments(kit, job);
  const attachments = [kit.docs.resume?.fileName, kit.docs.cover?.fileName, kit.docs.portfolio?.fileName, kit.portfolioUrl]
    .filter((value): value is string => Boolean(value));

  const emailSubject = `[지원] ${company} ${role} — ${name}`;
  const attachmentLines = documents
    .filter((row) => row.ready)
    .map((row) => `- ${row.label}${row.note && row.note !== "체크함" ? ` (${row.note})` : ""}`);
  const emailBody = [
    `안녕하세요, ${company} 채용 담당자님.`,
    "",
    `${role} 포지션에 지원하는 ${name}입니다.`,
    "",
    coverParagraph,
    "",
    "제출 서류는 아래와 같습니다.",
    ...(attachmentLines.length ? attachmentLines : ["- 제출 서류는 채용 페이지 안내에 따라 첨부하겠습니다."]),
    "",
    "읽어 주셔서 감사합니다.",
    `${name} 드림`,
  ].join("\n");

  const fullText = [
    "[한 줄 어필]",
    local.oneLiner,
    "",
    "[자소서 핵심 문단]",
    coverParagraph,
    "",
    "[제출 서류]",
    ...documents.filter((row) => row.ready).map((row) => `- ${row.label}${row.note && row.note !== "체크함" ? ` (${row.note})` : ""}`),
    ...(attachments.length ? ["", "[첨부 파일]", ...attachments.map((file) => `- ${file}`)] : []),
    "",
    `[지원 링크] ${job.applyUrl ?? ""}`.trim(),
  ]
    .join("\n")
    .trim();

  const notes = [
    "채용 사이트 로그인과 지원서 양식은 직접 진행합니다. 여기서는 문구와 제출 기록을 준비합니다.",
    "문장과 첨부 파일은 제출 전에 한 번 더 확인하세요.",
  ];
  if (!kitReady(kit)) notes.push("서류를 올리면 지원 문단에 포트폴리오·자소서 근거가 함께 들어갑니다.");

  return {
    oneLiner: local.oneLiner,
    coverParagraph,
    emailSubject,
    emailBody,
    emailTo: emailFromJob(job),
    documents,
    attachments,
    fullText,
    notes,
  };
}
