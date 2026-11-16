import type { Experience, JobPosting, MasterResume } from "../types";
import { parseRawJob } from "./korean";
import { EMPTY_JOB, EMPTY_RESUME } from "./presets";

export type ImportKind = "job" | "resume";

export interface ParsedImport {
  kind: ImportKind;
  job: JobPosting;
  resume: MasterResume;
  summary: string;
  warnings: string[];
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const cleanLine = (line: string) =>
  line
    .replace(/^\s{0,3}#{1,6}\s*/, "")
    .replace(/^\s*[-–—•·*]\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/\u00a0/g, " ")
    .trim();

const isBullet = (line: string) => /^\s*([-–—•·*]|\d+[.)])\s+/.test(line);

const PERIOD = /((?:19|20)\d{2})[.\-/년]?\s*(\d{1,2})?\s*[-–~至]\s*(현재|(?:19|20)\d{2}[.\-/년]?\s*(?:\d{1,2})?)/;

export async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다"));
    reader.readAsText(file, "utf-8");
  });
}

/** 공고처럼 보이는지 판단합니다. */
export function guessKind(text: string): ImportKind {
  const jobSignals = (
    text.match(/(담당\s*업무|주요\s*업무|업무\s*내용|자격\s*요건|지원\s*자격|필수\s*요건|우대\s*사항|모집\s*분야|채용\s*공고|채용\s*포지션|Responsibilities|Requirements|Qualifications)/gi) ?? []
  ).length;
  const resumeSignals = (
    text.match(/(경력\s*사항|경력|학력|보유\s*스킬|스킬|역량|자기\s*소개|이력서|경력기술서|산업|Work Experience|Education|Skills)/gi) ?? []
  ).length;
  const periodBlocks = (text.match(/(?:19|20)\d{2}[.\-/년]?\s*\d{0,2}\s*[-–~]\s*(?:현재|(?:19|20)\d{2})/g) ?? []).length;
  const jobScore = jobSignals;
  const resumeScore = resumeSignals + Math.min(3, periodBlocks);
  return jobScore >= resumeScore ? "job" : "resume";
}

const valueOf = (text: string, keys: string[]): string => {
  for (const key of keys) {
    const match = text.match(new RegExp(`^\\s*${key}\\s*[:：]\\s*(.+)$`, "im"));
    if (match?.[1]) return cleanLine(match[1]);
  }
  return "";
};

/** 채용 공고 텍스트(.txt/.md)를 문단으로 나눕니다. */
export function parseJobText(text: string): { job: JobPosting; warnings: string[] } {
  const warnings: string[] = [];
  const sections = parseRawJob(text);
  const lines = text.split("\n").map(cleanLine).filter(Boolean);

  let company = valueOf(text, ["회사명", "회사", "기업명", "Company"]);
  let role = valueOf(text, ["직무", "포지션", "모집분야", "채용직무", "Position", "Role"]);
  const employmentType = valueOf(text, ["고용\\s*형태", "고용형태", "Employment"]) || "정규직";
  const location = valueOf(text, ["근무지", "근무\\s*지역", "Location"]);
  const deadline = valueOf(text, ["마감", "접수\\s*기간", "마감일", "Deadline"]);

  if (!company || !role) {
    const header = lines.find((line) => line.length <= 60 && /\]\s|\||·|—|–/.test(line) && !/업무|요건|사항|문화/.test(line));
    if (header) {
      const parts = header.split(/\s*[|·—–]\s*|\s*\]\s*/).map((part) => part.replace(/^\[/, "").trim()).filter(Boolean);
      if (!company && parts[0]) company = parts[0];
      if (!role && parts[1]) role = parts[1];
    }
  }
  if (!company) {
    const first = lines.find((line) => line.length <= 40 && !isBullet(line));
    if (first) company = first;
  }
  if (!role) {
    const second = lines.filter((line) => line !== company).find((line) => line.length <= 40 && !isBullet(line));
    if (second) role = second;
  }

  if (!sections.responsibilities && !sections.requirements && !sections.preferred) {
    warnings.push("공고의 문단 제목을 찾지 못해 전체 내용을 ‘담당 업무’에 넣었습니다. 나눠서 고쳐 주세요.");
  }

  const job: JobPosting = {
    ...EMPTY_JOB,
    id: uid("job-import"),
    company: company || "",
    role: role || "",
    employmentType,
    location,
    deadline,
    responsibilities: sections.responsibilities || (!sections.requirements ? text.trim() : ""),
    requirements: sections.requirements,
    preferred: sections.preferred,
    tone: sections.tone,
  };
  return { job, warnings };
}

const splitSkills = (value: string): string[] =>
  value
    .split(/[,·/|]|\s{2,}/)
    .map((item) => cleanLine(item))
    .filter((item) => item.length > 1 && item.length < 24)
    .slice(0, 20);

const estimateYears = (periods: string[]): number => {
  const spans: { start: number; end: number }[] = [];
  for (const period of periods) {
    const match = period.match(PERIOD);
    if (!match) continue;
    const start = Number(match[1]) + (match[2] ? (Number(match[2]) - 1) / 12 : 0);
    const end = match[3] === "현재" ? new Date().getFullYear() : Number((match[3].match(/(?:19|20)\d{2}/) ?? ["0"])[0]);
    if (start > 1900 && end >= start) spans.push({ start, end });
  }
  if (!spans.length) return 0;
  const min = Math.min(...spans.map((span) => span.start));
  const max = Math.max(...spans.map((span) => span.end));
  return Math.max(0, Math.round(max - min));
};

/** 이력서(.txt/.md)에서 회사·직함·기간·성과 문장을 뽑습니다. */
export function parseResumeText(text: string): { resume: MasterResume; warnings: string[] } {
  const warnings: string[] = [];
  const rawLines = text.split("\n");
  const lines = rawLines.map(cleanLine);

  const name = valueOf(text, ["이름", "성명", "Name"]) || "";
  const headline = valueOf(text, ["한\\s*줄\\s*소개", "직함", "희망\\s*직무", "Headline"]) || "";
  const summary = valueOf(text, ["경력\\s*요약", "자기\\s*소개", "소개", "Summary"]);

  // 섹션 경계
  const sectionOf = (line: string): "career" | "skills" | "summary" | "industries" | null => {
    if (!line || line.length > 24) return null;
    if (/(보유\s*스킬|스킬|역량|skills)/i.test(line) && !/[:：]/.test(line)) return "skills";
    if (/(산업|업종|industries)/i.test(line) && !/[:：]/.test(line)) return "industries";
    if (/(자기\s*소개|소개|경력\s*요약|프로필|summary|profile)/i.test(line) && !/[:：]/.test(line)) return "summary";
    if (/(경력\s*사항|경력|업무\s*경력|주요\s*경력|work experience|experience)/i.test(line) && !/[:：]/.test(line)) return "career";
    return null;
  };

  let section: "career" | "skills" | "summary" | "industries" = "career";
  const blocks: { header: string; bullets: string[] }[] = [];
  const skills: string[] = [];
  const industries: string[] = [];
  const summaryLines: string[] = [];
  const headerLines: string[] = [];
  let current: { header: string; bullets: string[] } | null = null;

  const pushBlock = () => {
    if (current && (current.header || current.bullets.length)) blocks.push(current);
    current = null;
  };

  for (const line of lines) {
    if (!line) continue;
    const next = sectionOf(line);
    if (next) {
      pushBlock();
      section = next;
      continue;
    }
    if (section === "skills") {
      skills.push(...splitSkills(line));
      continue;
    }
    if (section === "industries") {
      industries.push(...splitSkills(line));
      continue;
    }
    if (section === "summary") {
      summaryLines.push(line);
      continue;
    }
    if (section !== "career") continue;
    if (/^[가-힣A-Za-z ]{2,12}\s*[:：]/.test(line)) continue;
    if (line.length <= 30 && /^\[?(회사|경력|프로젝트|Company|Project)/i.test(line)) continue;

    if (!isBullet(line) && PERIOD.test(line) && line.length <= 110) {
      pushBlock();
      const periodMatch = line.match(PERIOD);
      const period = periodMatch?.[0]?.replace(/\s+/g, " ") ?? "";
      const rest = periodMatch ? line.replace(periodMatch[0], "").replace(/[()\[\]]/g, " ").trim() : line;
      const parts = rest.split(/\s*[|·]\s*|\s{2,}|\s+[–—]\s+/).map((part) => part.trim()).filter(Boolean);
      current = { header: `${parts[0] ?? ""}||${parts[1] ?? ""}||${period}`, bullets: [] };
      continue;
    }

    if (!isBullet(line) && line.length <= 60 && PERIOD.test(line) === false && current && current.bullets.length > 0 && !/[.!?다요]$/.test(line)) {
      // 기간이 없는 회사명 줄이 새 블록을 시작하는 경우
      pushBlock();
      const parts = line.split(/\s*[|·]\s*|\s{2,}/).map((part) => part.trim()).filter(Boolean);
      current = { header: `${parts[0] ?? ""}||${parts[1] ?? ""}||`, bullets: [] };
      continue;
    }

    if (!current) {
      const looksLikeHeader = !isBullet(line) && line.length <= 60 && !/[.!?다요]$/.test(line);
      if (looksLikeHeader) {
        headerLines.push(line);
        const parts = line.split(/\s*[|·]\s*|\s{2,}/).map((part) => part.trim()).filter(Boolean);
        current = { header: `${parts[0] ?? ""}||${parts[1] ?? ""}||`, bullets: [] };
        continue;
      }
      current = { header: "||", bullets: [] };
    }
    current.bullets.push(line);
  }
  pushBlock();

  const experiences: Experience[] = blocks.map((block) => {
    const [company = "", role = "", period = ""] = block.header.split("||").map((part) => part.trim());
    return {
      id: uid("exp"),
      company,
      role,
      period,
      employment: "정규직",
      bullets: block.bullets.length ? block.bullets.map((text) => ({ id: uid("b"), text })) : [{ id: uid("b"), text: "" }],
    };
  });

  const filled = experiences.filter((exp) => exp.bullets.some((bullet) => bullet.text.trim()));
  const finalExperiences = filled.length
    ? filled
    : [
        {
          ...EMPTY_RESUME.experiences[0],
          id: uid("exp"),
          bullets: lines.filter((line) => line.length > 10).map((line) => ({ id: uid("b"), text: line })),
        },
      ];

  if (!filled.length) warnings.push("경력 덩어리를 나누지 못해 문장 전체를 한 경력으로 넣었습니다. 회사·직함·기간을 직접 채워 주세요.");
  if (finalExperiences.every((exp) => !exp.company)) warnings.push("회사명을 찾지 못했습니다. ‘경력’ 항목을 직접 고쳐 주세요.");

  const periods = finalExperiences.map((exp) => exp.period).filter(Boolean);
  const yearMatch = text.match(/경력\s*[:：]?\s*(\d{1,2})\s*년/);
  const years = yearMatch ? Number(yearMatch[1]) : estimateYears(periods);

  const resume: MasterResume = {
    ...EMPTY_RESUME,
    id: uid("resume-import"),
    name: name || headerLines[0]?.replace(/(이력서|경력기술서|Resume)/gi, "").trim() || "지원자",
    headline: headline || headerLines[1] || "",
    years,
    summary: summary || summaryLines.join(" "),
    experiences: finalExperiences,
    skills: [...new Set(skills)],
    industries: [...new Set([...splitSkills(valueOf(text, ["산업", "업종", "Industries"])), ...industries])],
  };
  return { resume, warnings };
}

export function buildPreview(text: string, kind: ImportKind): ParsedImport {
  if (kind === "job") {
    const { job, warnings } = parseJobText(text);
    const count = (value: string) => value.split("\n").filter((line) => line.trim()).length;
    return {
      kind,
      job,
      resume: EMPTY_RESUME,
      summary: `담당 업무 ${count(job.responsibilities)}줄 · 자격 요건 ${count(job.requirements)}줄 · 우대 ${count(job.preferred)}줄`,
      warnings,
    };
  }
  const { resume, warnings } = parseResumeText(text);
  const bulletCount = resume.experiences.reduce((sum, exp) => sum + exp.bullets.filter((b) => b.text.trim()).length, 0);
  return {
    kind,
    job: EMPTY_JOB,
    resume,
    summary: `경력 ${resume.experiences.length}개 · 문장 ${bulletCount}개 · 스킬 ${resume.skills.length}개`,
    warnings,
  };
}
