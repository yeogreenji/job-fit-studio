import type {
  IntroPitch,
  InterviewFeedback,
  JobPosting,
  MasterResume,
  MatchResult,
  QuestionCategory,
  ReverseQuestion,
  ReverseTone,
  StarAnswer,
} from "../types";
import { countAlias, hasMetric } from "./korean";

/** 문장 하나를 320자 안쪽으로 유지하기 위한 상한 */
const INTRO_MAX = 320;

const CHAR_PER_SECOND = 4.6;

export const speakingSeconds = (text: string) => Math.max(10, Math.round(text.replace(/\s+/g, "").length / CHAR_PER_SECOND));

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

const endSentence = (text: string) => {
  const trimmed = clean(text);
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

interface ScoredBullet {
  company: string;
  role: string;
  period: string;
  text: string;
  score: number;
  metric: boolean;
}

/** 공고 키워드와 성과 수치를 기준으로 자기소개에 인용할 문장을 고릅니다. */
export function rankBullets(resume: MasterResume, match: MatchResult): ScoredBullet[] {
  const labels = match.keywords.filter((k) => k.status !== "missing").map((k) => k.label);
  return resume.experiences
    .flatMap((exp) =>
      exp.bullets
        .filter((bullet) => bullet.text.trim().length > 12)
        .map((bullet) => {
          const hits = labels.reduce((sum, label) => sum + (countAlias(bullet.text, label) > 0 ? 1 : 0), 0);
          const metric = hasMetric(bullet.text);
          return {
            company: exp.company,
            role: exp.role,
            period: exp.period,
            text: clean(bullet.text),
            metric,
            score: hits * 3 + (metric ? 2 : 0) + Math.min(2, Math.floor(bullet.text.length / 90)),
          };
        }),
    )
    .sort((a, b) => b.score - a.score);
}

/**
 * 규칙 기반 1분 자기소개.
 * 지원자가 쓴 경력 문장만 인용하고, 수치는 원문에 있는 값만 옮깁니다.
 */
export function buildLocalIntro(resume: MasterResume, job: JobPosting, match: MatchResult, variant = 0): IntroPitch {
  const ranked = rankBullets(resume, match);
  const rotated = ranked.length > 1 && variant > 0 ? [...ranked.slice(variant % ranked.length), ...ranked.slice(0, variant % ranked.length)] : ranked;
  const topKeywords = match.keywords
    .filter((k) => k.status !== "missing")
    .sort((a, b) => b.weight * b.coverage - a.weight * a.coverage)
    .slice(0, 3)
    .map((k) => k.label);
  const companyLabel = job.company.trim() || "지원 기업";
  const roleLabel = job.role.trim() || resume.headline || "해당 직무";
  const industries = resume.industries.filter(Boolean).slice(0, 2).join("·");
  const hook = endSentence(
    `${resume.name || "지원자"}입니다. ${industries ? `${industries}에서 ` : ""}${resume.headline || roleLabel}로 ${resume.years}년 일해 왔습니다`,
  );

  const proofPool = rotated.slice(0, 6).map((bullet) => endSentence(`${bullet.company ? `${bullet.company}에서 ` : ""}${bullet.text}`));
  const fit = endSentence(
    topKeywords.length
      ? `${companyLabel} ${roleLabel} 공고가 요구한 ${topKeywords.join("·")}는 제가 실제로 해 온 일입니다`
      : `${companyLabel} ${roleLabel}에서 요구하는 업무를 같은 흐름으로 해 왔습니다`,
  );
  const close = endSentence(`${roleLabel}에서 바로 성과로 증명하겠습니다`);

  const text = fitIntroLength({ hook, proofPool, fit, close }, INTRO_MAX);
  const proof = proofPool.slice(0, 3).join(" ");

  return {
    text,
    source: "rule",
    outline: { hook, proof, fit, close },
  };
}

/**
 * 훅·증명·적합·마무리를 250~320자로 맞춥니다.
 * 증명 문장을 하나씩 더 붙여 보며 상한을 넘지 않는 가장 긴 조합을 고릅니다.
 */
function fitIntroLength(parts: { hook: string; proofPool: string[]; fit: string; close: string }, max: number): string {
  const join = (items: string[]) => items.join(" ").replace(/\s+/g, " ").trim();
  // 화면에 보여 주는 글자 수와 같은 기준(공백 제외)으로 맞춥니다.
  const width = (text: string) => text.replace(/\s+/g, "").length;
  const assemble = (items: string[]) => join([parts.hook, ...items, parts.fit, parts.close].filter(Boolean));
  const chosen: string[] = [];
  let total = width(assemble([]));
  // 긴 문장은 건너뛰고 짧은 문장을 채워 상한(320자)에 가장 가깝게 맞춥니다.
  for (const sentence of parts.proofPool) {
    const extra = width(sentence);
    if (total + extra <= max) {
      chosen.push(sentence);
      total += extra;
    }
  }
  return assemble(chosen);
}

/** 규칙 기반 역질문 3개. 공고의 요구·갭·톤에서 뽑습니다. */
export function buildLocalReverse(resume: MasterResume, job: JobPosting, match: MatchResult): ReverseQuestion[] {
  const companyLabel = job.company.trim() || "이 회사";
  const roleLabel = job.role.trim() || "이 자리";
  const firstResponsibility = job.responsibilities
    .split("\n")
    .map((line) => line.replace(/^[\s\-–—•·*]+/, "").trim())
    .filter((line) => line.length > 6)[0];
  const gap = match.keywords.find((k) => k.status === "missing") ?? match.keywords.find((k) => k.status === "weak");
  const toneAxis = [...match.tone.axes].sort((a, b) => b.job - a.job)[0];

  const picks: ReverseQuestion[] = [
    {
      id: "rv-rule-1",
      tone: "성과 기준" as ReverseTone,
      question: firstResponsibility
        ? `“${firstResponsibility.length > 42 ? `${firstResponsibility.slice(0, 41).trimEnd()}…` : firstResponsibility}” 업무를 맡았을 때, 6개월 뒤 잘하고 있다고 판단하시는 기준은 무엇인가요?`
        : `${roleLabel}에서 6개월 뒤 잘하고 있다고 판단하시는 기준은 무엇인가요?`,
      intent: "평가 기준을 먼저 확인하면 입사 후 우선순위를 스스로 정할 수 있고, 면접관에게는 목표 지향으로 읽힙니다.",
      source: "rule",
    },
    {
      id: "rv-rule-2",
      tone: "갭 확인" as ReverseTone,
      question: gap
        ? `공고에 ‘${gap.label}’이 있습니다. 지금 팀은 이 영역을 어디까지 갖고 있고, 제가 들어가면 어디부터 맡으면 될까요?`
        : `${companyLabel}이 이 직무에서 지금 가장 아쉬워하는 부분은 무엇인가요?`,
      intent: "부족한 키워드를 숨기지 않고 질문으로 바꾸면, 갭을 내 약점이 아니라 입사 후 할 일로 만듭니다.",
      source: "rule",
    },
    {
      id: "rv-rule-3",
      tone: "조직 적합" as ReverseTone,
      question: toneAxis
        ? `조직 톤으로 ‘${toneAxis.label}’을 강조하셨습니다. 실제로 그게 잘 작동한 최근 사례를 하나 들려주실 수 있나요?`
        : `${roleLabel}이 속한 팀에서 최근 1년간 가장 크게 바뀐 일은 무엇인가요?`,
      intent: "공고의 언어를 그대로 되물으면 공고를 읽었다는 인상을 주고, 조직의 실제 작동 방식을 확인할 수 있습니다.",
      source: "rule",
    },
  ];

  if (!resume.experiences.length) picks.splice(1, 1);
  return picks.slice(0, 3);
}

interface EvalAxis {
  id: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

const STAR_MARKERS: { key: keyof StarAnswer; label: string; patterns: RegExp }[] = [
  { key: "situation", label: "상황", patterns: /(당시|그때|작년|지난|프로젝트에서|상황|배경|초기)/ },
  { key: "task", label: "과제", patterns: /(맡았|목표|과제|해야|요청|책임|목표치)/ },
  { key: "action", label: "행동", patterns: /(제가|직접|먼저|기획해|설계해|운영해|정리해|만들어|제안해|설득해|조율해)/ },
  { key: "result", label: "결과", patterns: /(결과|그래서|덕분에|늘었|줄었|개선|달성|기록|확보|증가|감소)/ },
];

/**
 * 규칙 기반 모의면접 답변 평가.
 * 답변에 실제로 들어 있는 요소만 근거로 삼고, 없는 사실은 만들지 않습니다.
 */
export function evaluateLocalAnswer(input: {
  question: string;
  answer: string;
  second: number;
  job: JobPosting;
  resume: MasterResume;
  match?: MatchResult | null;
}): InterviewFeedback {
  const answer = input.answer.replace(/\s+/g, " ").trim();
  const length = answer.length;
  const covered = STAR_MARKERS.filter((marker) => marker.patterns.test(answer)).map((marker) => marker.label);
  const metric = hasMetric(answer) || /\d+\s*(배|%|건|명|개월)/.test(answer);
  const jdLabels = (input.match?.keywords ?? []).map((k) => k.label);
  const linked = jdLabels.filter((label) => countAlias(answer, label) > 0).slice(0, 3);
  const agency = /(제가|직접)/.test(answer);

  const axes: EvalAxis[] = [
    {
      id: "structure",
      label: "구조",
      score: Math.round((covered.length / 4) * 28) + (covered.length >= 3 ? 2 : 0),
      max: 30,
      note: covered.length ? `${covered.join("·")}가 드러납니다` : "상황·과제·행동·결과가 구분되지 않습니다",
    },
    {
      id: "volume",
      label: "분량",
      score: length >= 220 && length <= 620 ? 20 : length >= 120 ? 14 : length >= 60 ? 8 : 3,
      max: 20,
      note: `${length}자 · 90초 기준 ${length < 120 ? "너무 짧음" : length > 620 ? "너무 김" : "적정"}`,
    },
    {
      id: "metric",
      label: "수치",
      score: metric ? 20 : 0,
      max: 20,
      note: metric ? "결과를 숫자로 제시했습니다" : "결과 수치가 없습니다",
    },
    { id: "agency", label: "주체성", score: agency ? 15 : 5, max: 15, note: agency ? "본인이 한 일이 드러납니다" : "‘제가’ 한 일이 흐립니다" },
    {
      id: "link",
      label: "직무 연결",
      score: Math.min(15, linked.length * 6),
      max: 15,
      note: linked.length ? `공고 키워드 ${linked.join("·")} 언급` : "공고 키워드와 연결이 약합니다",
    },
  ];
  const score = Math.max(0, Math.min(100, axes.reduce((sum, axis) => sum + axis.score, 0)));

  const strengths: string[] = [];
  if (covered.length >= 3) strengths.push(`답변이 ${covered.join(" → ")} 순서로 정리돼 있어 듣는 사람이 따라가기 쉽습니다.`);
  if (metric) strengths.push("결과를 수치로 제시해 기여도를 확인할 수 있습니다.");
  if (linked.length) strengths.push(`공고가 요구한 ‘${linked.join("·")}’를 답변에서 직접 연결했습니다.`);
  if (agency) strengths.push("‘제가 직접’ 한 일이 드러나 기여 범위가 분명합니다.");
  if (!strengths.length) strengths.push("질문에 바로 답했습니다. 여기에 구조와 수치를 더하면 설득력이 크게 올라갑니다.");

  const improvements: string[] = [];
  if (length < 120) improvements.push(`답변이 ${length}자로 짧습니다. 상황 1문장, 행동 2문장, 결과 1문장으로 4~5문장을 채우세요.`);
  if (length > 620) improvements.push(`답변이 ${length}자로 깁니다. 90초 안에 들어오도록 배경 설명을 줄이고 결과를 앞으로 당기세요.`);
  if (!metric) improvements.push("결과 수치가 없습니다. 원문에 있는 값(%, 건, 명)만 쓰고, 없으면 ‘수치화하지 못했다’고 밝히는 편이 안전합니다.");
  if (!covered.includes("행동")) improvements.push("본인이 직접 한 행동이 드러나지 않습니다. ‘제가 ~했습니다’ 형태로 행동을 2개 이상 쓰세요.");
  if (!covered.includes("결과")) improvements.push("결과 문장이 없습니다. 무엇이 달라졌는지 한 문장으로 맺으세요.");
  if (!linked.length) improvements.push("공고 키워드를 답변에 한두 개 연결하면 직무 적합 신호가 생깁니다.");
  if (!improvements.length) improvements.push("좋습니다. 다만 결과의 측정 기준(기간·비교 대상)을 한 문장 덧붙이면 압박 질문에 강해집니다.");

  const followUp = (() => {
    if (!metric) return "그 결과를 숫자로 확인할 수 있을까요? 무엇을 기준으로, 어느 기간으로 측정하셨나요?";
    if (!covered.includes("행동")) return "그 상황에서 본인이 직접 한 일은 무엇이었나요? 팀이 한 일과 나눠서 말씀해 주세요.";
    if (length < 120) return "조금 더 구체적으로, 당시 상황과 본인이 선택한 행동을 순서대로 말씀해 주세요.";
    if (!linked.length) return "그 경험을 공고의 업무 관점에서 다시 설명해 주시겠어요? 어느 부분이 가장 가깝습니까?";
    if (!covered.includes("결과")) return "그래서 결국 무엇이 달라졌나요? 남은 자산이나 후속 변화까지 말씀해 주세요.";
    return "그 경험을 다시 한다면 무엇을 다르게 하시겠어요? 그 이유도 함께요.";
  })();

  const category = pickCategory(input.question);
  return {
    id: `fb-${Date.now().toString(36)}`,
    questionId: "",
    question: input.question,
    answer,
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    followUp,
    followUpWhy: `${category} 질문의 답변에서 ${axes
      .slice()
      .sort((a, b) => a.score / a.max - b.score / b.max)[0].label}이 가장 약했습니다. 그 지점을 한 번 더 확인하는 질문입니다.`,
    score,
    seconds: input.second,
    source: "rule",
    createdAt: new Date().toISOString(),
  };
}

export function pickCategory(question: string): QuestionCategory {
  if (/위기|이슈|사고|리스크/.test(question)) return "위기 대응";
  if (/수치|측정|검증|근거/.test(question)) return "성과 검증";
  if (/왜|이직|전환|옮기/.test(question)) return "전환";
  if (/팀|협업|갈등|조율/.test(question)) return "협업";
  if (/리드|관리|멘토|이끌/.test(question)) return "리더십";
  if (/부족|없|보완|따라잡/.test(question)) return "갭 보완";
  if (/문화|조직|가치/.test(question)) return "컬처";
  return "직무";
}
