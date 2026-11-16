import type {
  InterviewQuestion,
  JobPosting,
  MasterResume,
  MatchResult,
  NegotiationPlan,
  OnePoint,
  PriorityId,
  PriorityOption,
} from "../types";
import { countAlias, hasMetric } from "./korean";

/**
 * 이직 우선순위. 고른 항목 하나가 자기소개 톤, 역질문, 연봉 협상 문장을 바꿉니다.
 * (지원 패키지 생성 시 AI 프롬프트에도 그대로 전달됩니다)
 */
export const PRIORITIES: PriorityOption[] = [
  {
    id: "salary",
    label: "연봉 점프",
    short: "연봉",
    desc: "지금보다 확실히 올리는 것을 1순위로 둡니다.",
    focus: ["총보상 기준 제시", "사이닝·인센티브로 차액 조정", "6개월 성과 재협상"],
  },
  {
    id: "balance",
    label: "워라밸·재택",
    short: "워라밸",
    desc: "근무 형태와 시간을 먼저 확인합니다.",
    focus: ["재택·유연근무 실제 운영 방식", "코어타임과 야근 빈도", "연차 사용 관행"],
  },
  {
    id: "growth",
    label: "커리어 확장(리드급)",
    short: "성장",
    desc: "역할 범위와 리드 기회를 조건에 넣습니다.",
    focus: ["팀 규모와 의사결정 권한", "직급·타이틀", "교육·컨퍼런스 예산"],
  },
  {
    id: "stability",
    label: "대기업·상장사 안정성",
    short: "안정성",
    desc: "회사의 지속성과 처우 구조를 봅니다.",
    focus: ["사업 안정성과 조직 개편 이력", "보상 패키지 총액", "평가·승진 제도"],
  },
];

export const priorityOf = (id: PriorityId | undefined | null): PriorityOption | null =>
  PRIORITIES.find((item) => item.id === id) ?? null;

const manwon = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}만원`;

const short = (text: string, max = 70) => {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
};

/** 아직 값이 없을 때 문장에 남기는 자리. 값을 지어내지 않습니다. */
const TARGET_SLOT = "[희망 연봉]";

function evidenceLine(resume: MasterResume, match: MatchResult): string {
  const top = match.keywords.find((keyword) => keyword.evidence.length > 0);
  const evidence = top?.evidence[0];
  if (!evidence) return resume.experiences[0]?.bullets[0]?.text ? short(resume.experiences[0].bullets[0].text, 60) : "";
  return `${evidence.company ? `${evidence.company}에서 ` : ""}${short(evidence.text, 60)}`;
}

/** 이 공고에 넣을 때의 원포인트 전략 (규칙 엔진). */
export function buildLocalOnePoint(resume: MasterResume, job: JobPosting, match: MatchResult, priority?: PriorityId): OnePoint {
  const missing = match.keywords.find((keyword) => keyword.status === "missing");
  const weak = match.keywords.find((keyword) => keyword.status === "weak");
  const strong = match.keywords.find((keyword) => keyword.status === "matched" && keyword.evidence.length > 0) ?? match.keywords[0];
  const option = priorityOf(priority);
  const company = job.company.trim() || "이 회사";
  const role = job.role.trim() || "이 자리";
  const evidence = evidenceLine(resume, match);

  const title = missing
    ? `‘${missing.label}’을 첫 문단에서 먼저 인정하세요`
    : weak
      ? `‘${weak.label}’을 성과 문장 앞에 세우세요`
      : `‘${strong?.label ?? "핵심 경험"}’ 하나로 서류를 시작하세요`;

  const body = [
    missing
      ? `${company} ${role} 공고는 ${missing.sectionLabel}에서 ‘${missing.label}’을 요구하는데, 지금 이력서에는 그 단어가 보이지 않습니다. 숨기지 말고 지원 요약 첫 문단에서 “${missing.label}은 OO 방식으로 접근해 봤고, 이 자리에서는 이렇게 하겠습니다”로 한 줄 인정한 뒤 ${strong?.label ?? "가장 강한 경험"}으로 넘어가세요.`
      : weak
        ? `‘${weak.label}’은 이력서에 있지만 공고 문장과 붙어 있지 않습니다. ${evidence ? `“${evidence}” 문장을` : "가장 가까운 문장을"} ${weak.label} 뒤에 붙여, 공고가 읽는 순서대로 다시 배열하세요.`
        : `공고의 핵심 요구(‘${strong?.label ?? "직무 핵심"}’)를 이미 갖고 있습니다. ${evidence ? `“${evidence}”를` : "가장 강한 성과 문장을"} 지원 요약과 경력 첫 줄에 같은 표현으로 두 번 반복하세요.`,
    option
      ? `면접에서는 ${option.label} 기준으로 “${option.focus[0]}”을 첫 역질문으로 꺼내, 이 자리의 조건을 먼저 확인하세요.`
      : "면접에서는 ‘6개월 뒤 잘하고 있다고 판단하는 기준’을 첫 역질문으로 꺼내 우선순위를 확인하세요.",
    match.requiredYears !== null && resume.years < match.requiredYears
      ? `경력 ${resume.years}년으로 공고의 ${match.requiredYears}년 조건에 못 미치므로, 연차 대신 같은 기간에 맡았던 범위와 결과로 설득해야 합니다.`
      : `적합도 ${match.score}점 · 미충족 ${match.missingCount}개의 갭은 서류에서 늘리지 말고 면접 답변에서만 보완하세요.`,
  ]
    .filter(Boolean)
    .join(" ");

  return { title, body };
}

/** 처우·연봉 협상 스크립트 (규칙 엔진). 수치는 입력한 희망 연봉만 씁니다. */
export function buildLocalNegotiation(input: {
  job: JobPosting;
  match: MatchResult;
  priority?: PriorityId;
  targetSalary?: number | null;
}): NegotiationPlan {
  const { job, match, priority, targetSalary } = input;
  const option = priorityOf(priority);
  const target = typeof targetSalary === "number" && targetSalary > 0 ? manwon(targetSalary) : "";
  const targetText = target || TARGET_SLOT;
  const company = job.company.trim() || "이 회사";
  const role = job.role.trim() || "이 자리";
  const strength = match.keywords.find((keyword) => keyword.status === "matched" && keyword.evidence.length > 0)?.label;
  const missing = match.keywords.find((keyword) => keyword.status === "missing");

  const openerByPriority: Record<PriorityId, string> = {
    salary: `먼저 처우 이야기해 주셔서 감사합니다. 지금 총보상과 이 직무의 범위를 함께 봤을 때 ${targetText}을 기준으로 협의하고 싶습니다. ${strength ? `${strength} 경험으로 바로 성과를 낼 수 있는 자리라고 이해했습니다.` : ""}`,
    balance: `제안해 주신 조건 감사합니다. ${role}에서 오래 일하고 싶어 근무 방식부터 확인하고 싶습니다. 처우는 ${targetText} 선에서 함께 조정하되, 재택·유연근무의 실제 운영 방식도 같이 이야기하고 싶습니다.`,
    growth: `감사합니다. 이 자리에서 맡을 역할 범위와 의사결정 권한을 알고 싶습니다. ${strength ? `${strength} 경험을 살려 ${role}의 기준을 만드는 역할까지 맡고 싶고,` : ""} 처우는 ${targetText}을 기준으로 협의하고 싶습니다.`,
    stability: `감사합니다. ${company}에서 길게 일하고 싶어 보상 구조 전체를 이해하고 싶습니다. 베이스는 ${targetText}을 기준으로, 평가·승진 제도와 복지까지 포함해 함께 보고 싶습니다.`,
  };

  const counter = `${company}에서 제시해 주신 금액과 ${targetText} 사이에 차이가 있습니다. 무리하게 올려 달라는 요청은 아니고, 세 가지 중 조정 가능한 방법이 있으면 좋겠습니다. 첫째 사이닝 보너스나 첫해 인센티브, 둘째 연차·재택·교육 예산 같은 비연봉 조건, 셋째 6개월 뒤 성과 기준을 정해 재협상하는 방식입니다. 어느 쪽이 이 조직에서 가능한지 알려 주시면 맞추겠습니다.`;

  const nonSalaryBase = [
    "사이닝 보너스 또는 첫해 성과 인센티브",
    "입사 첫해 연차와 연차 사용 관행",
    "재택·유연근무의 실제 운영 방식과 코어타임",
    "교육·컨퍼런스·장비 예산",
    "직급·타이틀과 역할 범위의 문서화",
    "평가 주기와 승진 기준",
  ];
  const priorityCards = option ? option.focus : [];
  const nonSalary = [...new Set([...priorityCards, ...nonSalaryBase])].slice(0, 5);

  const questions = [
    `${role}에서 6개월 뒤 “잘하고 있다”고 판단하는 기준은 무엇인가요?`,
    missing
      ? `공고에 ‘${missing.label}’이 있는데, 지금 팀은 이 영역을 어디까지 갖고 있고 제가 들어가면 어디부터 맡으면 될까요?`
      : `${company}이 이 직무에서 지금 가장 아쉬워하는 부분은 무엇인가요?`,
    option?.id === "balance"
      ? "팀의 실제 출퇴근·재택 패턴과 야근이 몰리는 시기를 알려 주실 수 있나요?"
      : option?.id === "growth"
        ? "이 역할의 의사결정 범위와 함께 일하는 팀 구성을 알려 주실 수 있나요?"
        : option?.id === "stability"
          ? "최근 2년 조직 개편과 이 팀의 자리 변동을 알려 주실 수 있나요?"
          : "처우 협의가 보통 어느 단계에서, 어떤 방식으로 진행되나요?",
  ];

  return {
    target: target || "",
    basis: target ? "내가 입력한 희망 연봉" : "희망 연봉을 입력하면 문장이 그 값으로 바뀝니다",
    opener: openerByPriority[option?.id ?? "salary"],
    counter,
    nonSalary,
    questions,
    source: "rule",
  };
}

const AVOID_BY_CATEGORY: Record<string, string> = {
  전환: "“클라이언트를 떠나고 싶어서”, “이제는 안정적으로 일하고 싶어서”처럼 전환을 도피로 들리게 하는 답변. 대행사에서 얻은 것을 먼저 말하지 않으면 감점입니다.",
  "성과 검증": "수치를 말한 뒤 측정 기준을 모른다고 답하는 것. “대략”, “아마”로 시작하는 추정 수치는 그 수치 전체의 신뢰를 깎습니다.",
  "위기 대응": "첫 문장이 “일단 보도자료를 쓰겠습니다”인 답변. 사실 확인과 내부 정렬 없이 나가는 메시지는 2차 이슈를 만듭니다.",
  직무: "직무를 회사 소개로 대신하는 답변. 지표·산출물·협업 대상이 하나도 나오지 않으면 준비가 안 된 것으로 읽힙니다.",
  협업: "“설득해서 잘 진행했습니다”로 끝나는 답변. 반대한 사람의 이유를 어떻게 들었는지가 빠지면 협업 역량이 보이지 않습니다.",
  리더십: "“이해해 줬다”, “분위기를 만들었다”만 말하는 답변. 기대치 재정의와 프로세스 변경이 없으면 관리 역량이 의심됩니다.",
  "갭 보완": "“배우면 됩니다”, “열심히 하겠습니다”만 말하는 답변. 가장 가까운 인접 경험과 90일 계획이 없으면 성장 가능성으로도 안 읽힙니다.",
  컬처: "회사 홈페이지 문구를 그대로 읽는 답변. 자기 습관과 그 회사의 일하는 방식이 맞닿는 사례가 없으면 준비하지 않은 것입니다.",
};

const CLOSING: Record<string, string> = {
  전환: "그래서 이 자리에서는 대행사에서 익힌 속도를 그대로 쓰되, 브랜드의 기준을 직접 소유하는 쪽으로 일하고 싶습니다.",
  "성과 검증": "수치의 측정 기준과 제가 한 일의 범위를 함께 말씀드렸고, 다음에는 같은 결과를 반복할 방법으로 남기겠습니다.",
  "위기 대응": "제 대응 순서는 사실 확인 → 내부 정렬 → 1차 입장 → 모니터링이고, 확인되지 않은 것은 먼저 말하지 않습니다.",
  직무: "이 직무의 성과는 결국 지표로 확인되므로, 제가 맡으면 어떤 지표를 어떤 주기로 볼지 먼저 합의하겠습니다.",
  협업: "반대하는 사람의 이유를 먼저 정확히 듣고, 공동 목표로 다시 정의한 뒤 작은 실험으로 확인하는 순서로 일합니다.",
  리더십: "반복되는 실수는 개인 문제가 아니라 구조 문제로 보고, 기대치와 체크포인트를 다시 만드는 쪽으로 해결합니다.",
  "갭 보완": "부족한 부분은 인정하고, 가장 가까운 인접 경험에서 시작해 90일 안에 확인 가능한 결과로 채우겠습니다.",
  컬처: "제 일하는 방식은 속도보다 기준을 먼저 맞추는 쪽이고, 그래서 같은 일을 두 번 하지 않는 편입니다.",
};

/**
 * 규칙 기반 말하기 스크립트. 원문 문장을 그대로 인용하고, 채워야 하는 자리만 대괄호로 남깁니다.
 * (AI가 연결되면 같은 질문에 완성된 문단이 붙습니다)
 */
export function buildLocalAnswer(question: InterviewQuestion, resume: MasterResume, job: JobPosting): string {
  const { star } = question;
  const metric = star.result.includes("]") ? "" : star.result;
  const lead =
    question.category === "컬처"
      ? `제가 ${job.company || "이 회사"}의 ${job.role || "이 자리"}에 지원한 이유는 ${star.situation || "[어느 조직에서]"} 해 온 일을 이 자리에서 더 크게 하고 싶기 때문입니다.`
      : question.category === "갭 보완"
        ? "먼저 부족한 부분부터 말씀드리면, 이 영역은 제가 주력으로 해 본 경험은 아닙니다."
        : question.category === "위기 대응"
          ? "이슈가 터졌을 때 저는 사실 확인과 내부 정렬을 먼저 합니다."
          : "제 경험에서 가장 가까운 사례부터 말씀드리면 다음과 같습니다.";

  const parts = [
    lead,
    `[상황] ${star.situation || "[언제, 어느 조직에서]"}`,
    `[과제] ${star.task || "[무엇을 맡았는지]"}`,
    `[행동] ${star.action || "[내가 직접 한 일]"}`,
    metric ? `[결과] ${metric}` : `[결과] ${resume.experiences[0]?.bullets.find((bullet) => hasMetric(bullet.text))?.text ?? "[수치·변화 — 원문에 있는 값만]"}`,
    CLOSING[question.category] ?? CLOSING["직무"],
  ];
  return parts.filter(Boolean).join("\n");
}

export function buildLocalAnswerSet(questions: InterviewQuestion[], resume: MasterResume, job: JobPosting): InterviewQuestion[] {
  return questions.map((question) => ({
    ...question,
    answer: question.answer || buildLocalAnswer(question, resume, job),
    answerSource: question.answerSource ?? ("rule" as const),
    avoid: question.avoid || AVOID_BY_CATEGORY[question.category] || AVOID_BY_CATEGORY["직무"],
  }));
}

/** 화면에서 키워드 강조에 쓰는 헬퍼 */
export const keywordHit = (text: string, label: string): boolean => countAlias(text, label) > 0;
