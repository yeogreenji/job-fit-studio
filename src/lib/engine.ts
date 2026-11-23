import type {
  AppealItem,
  Evidence,
  Grade,
  InterviewQuestion,
  JobPosting,
  KeywordItem,
  KeywordStatus,
  MasterResume,
  MatchResult,
  QuestionCategory,
  RewriteItem,
  SectionId,
  SummaryRewrite,
  StarAnswer,
  SubScore,
  ToneAxis,
  ToneProfile,
} from "../types";
import {
  CLUSTERS,
  SECTION_LABEL,
  SECTION_WEIGHT,
  TONE_CUES,
  countAlias,
  countCluster,
  extractMetric,
  hasMetric,
  parseRequiredYears,
  snippetFor,
} from "./korean";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value);

const resumeCorpus = (resume: MasterResume) =>
  [
    resume.name,
    resume.headline,
    resume.summary,
    resume.industries.join(" "),
    resume.skills.join(" "),
    ...resume.experiences.flatMap((exp) => [exp.company, exp.role, exp.employment, ...exp.bullets.map((b) => b.text)]),
  ]
    .filter(Boolean)
    .join("\n");

const jobSections = (job: JobPosting): { id: SectionId; text: string }[] => [
  { id: "responsibilities", text: job.responsibilities },
  { id: "requirements", text: job.requirements },
  { id: "preferred", text: job.preferred },
  { id: "tone", text: job.tone },
];

export function gradeFor(score: number): Grade {
  if (score >= 86) return { label: "매우 적합", tone: "high", desc: "서류 통과 가능성이 높습니다. 리라이트로 표현만 다듬으면 됩니다." };
  if (score >= 74) return { label: "적합", tone: "high", desc: "핵심 요구를 대부분 충족합니다. 갭 1~2개를 면접에서 보완하세요." };
  if (score >= 60) return { label: "보완 필요", tone: "mid", desc: "절반 이상 맞지만, 빠진 키워드가 서류에서 먼저 걸립니다." };
  if (score >= 45) return { label: "갭 큼", tone: "low", desc: "직무 전환이나 산업 경험이 약합니다. 지원 동기와 보완 계획이 필요합니다." };
  return { label: "재검토", tone: "bad", desc: "공고와 경력의 접점이 적습니다. 다른 공고를 함께 보는 편이 좋습니다." };
}

function buildKeywords(resume: MasterResume, job: JobPosting): KeywordItem[] {
  const sections = jobSections(job);
  const corpus = resumeCorpus(resume);
  const items: KeywordItem[] = [];

  for (const cluster of CLUSTERS) {
    let hits = 0;
    let bestWeight = 0;
    const secIds: SectionId[] = [];
    for (const section of sections) {
      const count = countCluster(section.text, cluster);
      if (count > 0) {
        hits += count;
        bestWeight = Math.max(bestWeight, SECTION_WEIGHT[section.id]);
        secIds.push(section.id);
      }
    }
    if (hits === 0 || bestWeight === 0) continue;

    const weight = bestWeight * (1 + Math.min(0.8, 0.18 * (hits - 1)));
    const resumeHits = countCluster(corpus, cluster);
    const labelHits = countAlias(corpus, cluster.label);
    const base = resumeHits === 0 ? 0 : resumeHits === 1 ? 0.6 : resumeHits === 2 ? 0.85 : 1;
    const coverage = base * (labelHits > 0 ? 1 : 0.9);
    const status: KeywordStatus = coverage === 0 ? "missing" : coverage >= 0.84 ? "matched" : "weak";

    const evidence: Evidence[] = [];
    for (const exp of resume.experiences) {
      for (const bullet of exp.bullets) {
        if (evidence.length >= 2) break;
        if (cluster.aliases.some((alias) => countAlias(bullet.text, alias) > 0)) {
          evidence.push({ bulletId: bullet.id, text: bullet.text, company: exp.company, role: exp.role });
        }
      }
    }

    const firstSection = secIds[0] ?? "responsibilities";
    const snippet =
      snippetFor(sections.find((s) => s.id === firstSection)?.text ?? "", cluster) ||
      snippetFor(sections.map((s) => s.text).join("\n"), cluster);

    items.push({
      id: cluster.id,
      label: cluster.label,
      cluster: cluster.id,
      group: cluster.group,
      weight,
      weightPct: 0,
      sections: secIds,
      sectionLabel: SECTION_LABEL[firstSection],
      snippet,
      hits,
      resumeHits,
      labelHits,
      coverage,
      status,
      evidence,
    });
  }

  const maxWeight = Math.max(...items.map((i) => i.weight), 1);
  return items
    .map((item) => ({ ...item, weightPct: round((item.weight / maxWeight) * 100) }))
    .sort((a, b) => b.weight - a.weight || b.resumeHits - a.resumeHits);
}

function buildTone(resume: MasterResume, job: JobPosting): ToneProfile {
  const jobText = jobSections(job).map((s) => s.text).join("\n");
  const resumeText = resumeCorpus(resume);
  const axes: ToneAxis[] = TONE_CUES.map((axis) => {
    const jobHits = axis.cues.reduce((sum, cue) => sum + countAlias(jobText, cue), 0);
    const resumeHits = axis.cues.reduce((sum, cue) => sum + countAlias(resumeText, cue), 0);
    const jobValue = jobHits === 0 ? 18 : clamp(30 + jobHits * 14, 0, 100);
    const resumeValue = resumeHits === 0 ? 22 : clamp(28 + resumeHits * 13, 0, 100);
    return { id: axis.id, label: axis.label, job: jobValue, resume: resumeValue, note: axis.note };
  });

  const strong = [...axes].filter((a) => a.job >= 40).sort((a, b) => b.job - a.job);
  const label = strong.length
    ? `${strong.slice(0, 2).map((a) => a.label).join(" · ")} 중심`
    : "균형형 조직";
  const summary = strong.length
    ? `${strong
        .slice(0, 2)
        .map((a) => a.label)
        .join("과 ")}이 공고 문장에서 강하게 반복됩니다. 이 두 축을 이력서 첫 문단과 면접 답변의 앞자리에 두세요.`
    : "공고에 조직 톤 설명이 적습니다. 대표 제품과 최근 소식을 보고 톤을 추정하세요.";

  return { label, summary, axes };
}

function buildSubScores(
  resume: MasterResume,
  job: JobPosting,
  keywordScore: number,
  keywords: KeywordItem[],
  tone: ToneProfile,
): { subs: SubScore[]; requiredYears: number | null; industry: string | null; industryMatch: boolean } {
  const requiredYears = parseRequiredYears(`${job.requirements}\n${job.preferred}`);
  let expScore: number;
  if (requiredYears === null) {
    expScore = 78;
  } else if (resume.years >= requiredYears) {
    expScore = 88 + Math.min(12, (resume.years - requiredYears) * 4);
  } else {
    expScore = Math.max(28, 70 - (requiredYears - resume.years) * 11);
  }
  const roleClusters = CLUSTERS.filter((c) => c.group === "core" && countCluster(job.role, c) > 0);
  const roleHit = roleClusters.some((c) => countCluster(resume.headline, c) > 0 || countCluster(resume.summary, c) > 0);
  if (roleHit) expScore = Math.min(100, expScore + 6);

  const industryItems = keywords.filter((k) => k.group === "industry").sort((a, b) => b.weight - a.weight);
  const industry = industryItems[0]?.label ?? null;
  const industryMatch = industryItems.some((k) => k.resumeHits > 0);
  let industryScore = 72;
  if (industry) {
    industryScore = industryMatch ? 92 : 44;
  }

  const relevantToneAxes = tone.axes.filter((a) => a.job >= 40);
  const toneScore = relevantToneAxes.length
    ? round(
        relevantToneAxes.reduce((sum, a) => sum + clamp(100 - Math.abs(a.job - a.resume) * 0.75, 25, 100), 0) /
          relevantToneAxes.length,
      )
    : 76;

  const subs: SubScore[] = [
    {
      id: "keyword",
      label: "키워드 적합",
      score: round(keywordScore),
      weight: 0.55,
      note: `공고 핵심 키워드 ${keywords.length}개 중 ${keywords.filter((k) => k.status === "matched").length}개를 이력서에서 확인`,
    },
    {
      id: "experience",
      label: "경력·직무",
      score: round(expScore),
      weight: 0.18,
      note: requiredYears === null ? `경력 ${resume.years}년 · 공고에 연차 조건 명시 없음` : `공고 ${requiredYears}년 이상 · 원본 ${resume.years}년`,
    },
    {
      id: "industry",
      label: "산업 이해",
      score: industryScore,
      weight: 0.15,
      note: industry ? (industryMatch ? `${industry} 경험이 원본에 있습니다` : `${industry} 경험이 원본에 보이지 않습니다`) : "공고에서 특정 산업을 요구하지 않습니다",
    },
    {
      id: "tone",
      label: "조직 톤",
      score: toneScore,
      weight: 0.12,
      note: `${tone.label} · 공고 문장과 경력 표현의 결 비교`,
    },
  ];
  return { subs, requiredYears, industry, industryMatch };
}

export function matchResume(resume: MasterResume, job: JobPosting): MatchResult {
  const keywords = buildKeywords(resume, job);
  const totalWeight = keywords.reduce((sum, k) => sum + k.weight, 0) || 1;
  const covered = keywords.reduce((sum, k) => sum + k.weight * k.coverage, 0);
  const keywordScore = (covered / totalWeight) * 100;
  const tone = buildTone(resume, job);
  const { subs, requiredYears, industry, industryMatch } = buildSubScores(resume, job, keywordScore, keywords, tone);
  const score = round(subs.reduce((sum, s) => sum + s.score * s.weight, 0) / subs.reduce((sum, s) => sum + s.weight, 0));

  const matchedCount = keywords.filter((k) => k.status === "matched").length;
  const weakCount = keywords.filter((k) => k.status === "weak").length;
  const missingCount = keywords.filter((k) => k.status === "missing").length;
  const toneScore = subs.find((s) => s.id === "tone")?.score ?? 0;

  return {
    score,
    grade: gradeFor(score),
    subs,
    keywords,
    tone,
    matchedCount,
    weakCount,
    missingCount,
    requiredYears,
    industry,
    industryMatch,
    resumeKeywordCount: keywords.filter((k) => k.resumeHits > 0).length,
    summaryLine: `공고 키워드 ${keywords.length}개 중 ${matchedCount}개 매칭 · 보완 ${weakCount}개 · 미충족 ${missingCount}개 · 톤 적합 ${toneScore}`,
  };
}

const WEAK_VERB = /(담당|참여)(했|하였|해)?(습니다)?\.?$/;

const stripDot = (value: string) => value.replace(/[.。]$/, "").trim();

function rewriteText(text: string): string {
  let next = text.replace(/\s+/g, " ").trim();
  next = next.replace(/^(다양한|각종|주로)\s+/, "");
  next = next.replace(WEAK_VERB, (_, verb: string, mid: string, formal: string) => {
    const mapped = verb === "담당" ? "운영" : "수행";
    return `${mapped}${mid ?? ""}${formal ?? ""}`;
  });

  // 결과 수치가 뒤에 있으면 앞으로 당깁니다. 마지막 연결 어미부터 거꾸로 시도합니다.
  const links = [...next.matchAll(/(?:하여|해서|해)\s+/g)];
  for (let i = links.length - 1; i >= 0; i -= 1) {
    const link = links[i];
    const index = link.index ?? -1;
    if (index < 0) continue;
    const head = next.slice(0, index).trim();
    const tail = next.slice(index + link[0].length).trim();
    if (head.length >= 16 && tail.length >= 10 && hasMetric(tail)) {
      next = `${stripDot(tail)} — ${stripDot(head)}`;
      return next;
    }
  }

  const parts = next.split(/\s*,\s*/);
  if (parts.length === 2 && parts[0] && parts[1] && !hasMetric(parts[0]) && hasMetric(parts[1])) {
    next = `${stripDot(parts[1])} — ${stripDot(parts[0])}`;
  }
  return next;
}

function evidenceFor(resume: MasterResume, focus: string[]): { exp: MasterResume["experiences"][number]; bullet: string } | null {
  let bestExp: MasterResume["experiences"][number] | null = null;
  let bestBullet = "";
  let bestScore = 0;

  for (let expIndex = 0; expIndex < resume.experiences.length; expIndex += 1) {
    const exp = resume.experiences[expIndex];
    for (const bullet of exp.bullets) {
      const hits = CLUSTERS.filter((c) => focus.includes(c.id)).reduce((sum, c) => sum + countCluster(bullet.text, c), 0);
      const score = hits * 3 + (hasMetric(bullet.text) ? 2 : 0) + (expIndex === 0 ? 1 : 0);
      if (score > 0 && score > bestScore) {
        bestScore = score;
        bestExp = exp;
        bestBullet = bullet.text;
      }
    }
  }

  if (bestExp) return { exp: bestExp, bullet: bestBullet };
  const exp = resume.experiences.find((e) => e.bullets.some((b) => b.text.trim()));
  const bullet = exp?.bullets.find((b) => b.text.trim())?.text ?? "";
  return exp ? { exp, bullet } : null;
}

export function buildRewrites(resume: MasterResume, match: MatchResult): RewriteItem[] {
  const jdByCluster = new Map(match.keywords.map((k) => [k.cluster, k]));
  const maxWeight = Math.max(...match.keywords.map((k) => k.weight), 1);
  const rewrites: RewriteItem[] = [];

  resume.experiences.forEach((exp, expIndex) => {
    const relevant: RewriteItem[] = [];
    exp.bullets.forEach((bullet) => {
      const text = bullet.text.trim();
      if (!text) return;
      const bulletClusters = CLUSTERS.filter((c) => countCluster(text, c) > 0);
      const jdClusters = bulletClusters
        .map((c) => jdByCluster.get(c.id))
        .filter((item): item is KeywordItem => Boolean(item));
      const kwWeight = jdClusters.reduce((sum, item) => sum + item.weight, 0);
      const metric = hasMetric(text);
      const relevance = round(
        clamp(30 + (kwWeight / maxWeight) * 34 + (metric ? 16 : 0) + (expIndex === 0 ? 5 : 0) + Math.min(6, text.length / 45), 22, 99),
      );

      const META_CLUSTERS = new Set(["leadership", "inhouse", "agency", "collaboration", "strategy", "budget"]);
      const addedItem = [...jdClusters]
        .filter((item) => !META_CLUSTERS.has(item.cluster) && !text.includes(item.label) && item.weightPct >= 55)
        .sort((a, b) => b.weight - a.weight)[0];
      // 공고 키워드를 대괄호로 끼워 넣지 않습니다. 문장은 그대로 두고, 어떤 표현을 더할지는 added로 따로 보여 줍니다.
      const after = rewriteText(text);
      const top = [...jdClusters].sort((a, b) => b.weight - a.weight)[0];

      const reason = addedItem
        ? `공고 ${addedItem.sectionLabel}의 “${addedItem.snippet}” 요구에 맞춰 ‘${addedItem.label}’를 문장 앞에 세웠습니다.`
        : top
          ? `공고 ${top.sectionLabel}의 “${top.snippet}”와 직접 연결되는 경험입니다.${metric ? " 성과 수치를 함께 배치했습니다." : ""}`
          : "공고 키워드와의 직접 접점은 약하지만 경력의 연속성을 보여 주는 문장입니다.";

      relevant.push({
        id: bullet.id,
        experienceId: exp.id,
        company: exp.company,
        role: exp.role,
        period: exp.period,
        order: relevant.length + 1,
        before: text,
        after,
        matched: jdClusters.map((item) => item.label).slice(0, 4),
        added: addedItem?.label ?? null,
        reason,
        relevance,
        adopted: relevance >= 50,
        metric,
        jdQuote: top?.snippet ?? "",
      });
    });
    relevant.sort((a, b) => b.relevance - a.relevance).forEach((item, index) => {
      rewrites.push({ ...item, order: index + 1 });
    });
  });

  return rewrites;
}

export function buildSummary(resume: MasterResume, job: JobPosting, match: MatchResult): SummaryRewrite {
  const strengths = match.keywords
    .filter((item) => item.resumeHits > 0 && APPEAL_TITLES[item.cluster])
    .sort((a, b) => b.weight * b.coverage - a.weight * a.coverage)
    .slice(0, 3);
  const labels = strengths.map((item) => item.label);
  const before = resume.summary.trim();
  const base = before || `${resume.years}년간 ${resume.headline}로 일해 온 지원자입니다.`;
  const focus = labels.length ? labels.join("·") : `${job.role} 실무`;
  const after = `${stripDot(base)} ${job.company}의 ${job.role}에서는 ${resume.years}년간 쌓은 ${focus} 경험을 바탕으로 채널과 메시지를 직접 설계·운영하겠습니다.`;
  return {
    before,
    after,
    added: labels,
    reason: `공고가 반복하는 ${labels.slice(0, 2).join("·")} 표기를 첫 문단에 세워, 서류를 읽는 사람과 검색 필터 모두에게 같은 신호를 보냅니다.`,
    adopted: true,
  };
}

const APPEAL_TITLES: Record<string, string> = {
  media: "기자 네트워크와 보도자료, 직접 뛴 손",
  crisis: "이슈가 터졌을 때 가장 먼저 움직인 경험",
  content: "콘텐츠를 기획하고 끝까지 만든 사람",
  social: "채널을 키워 본 감각",
  brand: "브랜드 톤을 지켜 낸 캠페인 리드",
  performance: "성과로 검증한 캠페인",
  data: "수치로 설명하는 커뮤니케이션",
  external: "대외 이해관계자를 상대해 본 경험",
  ir: "투자자 앞에서 회사를 설명한 경험",
  internal: "조직 안의 메시지를 설계한 경험",
  esg: "ESG 메시지를 실행으로 옮긴 경험",
  commerce: "구매 전환까지 본 커머스 커뮤니케이션",
  b2b: "B2B 고객의 언어로 쓴 콘텐츠",
  b2c: "소비자 접점에서 검증한 메시지",
  global: "영어로 일해 본 글로벌 커뮤니케이션",
  leadership: "주니어를 키우고 프로세스를 남긴 경험",
  collaboration: "유관부서와 끝까지 맞춘 실행력",
  strategy: "전략에서 실행까지 이어 붙인 기획력",
  agency: "대행사에서 다진 클라이언트 대응",
  inhouse: "인하우스로 옮겨 직접 운영한 경험",
  influencer: "인플루언서를 움직인 프로그램 운영",
  event: "런칭과 기자간담회를 운영한 경험",
  monitoring: "이슈를 먼저 발견하는 모니터링",
  writing: "문서로 사람을 설득하는 힘",
  research: "트렌드를 읽는 리서치",
  platform: "테크 서비스를 이해하는 언어",
  budget: "예산과 벤더를 관리한 경험",
  music: "팬덤의 언어를 아는 콘텐츠 감각",
  game: "게임 이용자 커뮤니티 이해",
  fintech: "금융 고객의 신뢰를 다루는 커뮤니케이션",
  beauty: "뷰티 시장의 감도",
  food: "식품 브랜드의 일상 접점",
  travel: "여행 고객의 기대를 읽는 힘",
  mobility: "모빌리티 산업의 이해관계자 지도",
  education: "교육 고객의 언어",
  healthcare: "헬스케어 커뮤니케이션의 신중함",
  energy: "에너지 산업의 정책 커뮤니케이션",
};

export function buildAppeals(resume: MasterResume, job: JobPosting, match: MatchResult): AppealItem[] {
  const ranked = match.keywords
    .filter((item) => item.status !== "missing" && APPEAL_TITLES[item.cluster])
    .sort((a, b) => b.weight * b.coverage - a.weight * a.coverage)
    .slice(0, 6);

  // 같은 경력 문장을 두 번 인용하면 ‘3선’이 아니라 반복이 됩니다. 아직 안 쓴 문장을 먼저 고릅니다.
  const usedBullets = new Set<string>();
  const appeals: AppealItem[] = [];
  for (const item of ranked) {
    if (appeals.length >= 3) break;
    const candidates = item.evidence
      .map((evidence) => {
        const exp = resume.experiences.find((e) => e.bullets.some((b) => b.id === evidence.bulletId));
        const bullet = exp?.bullets.find((b) => b.id === evidence.bulletId)?.text ?? "";
        return { exp, bullet, id: evidence.bulletId };
      })
      .filter((entry) => entry.bullet.trim().length > 8);
    const picked = candidates.find((entry) => !usedBullets.has(entry.id)) ?? candidates[0];
    if (!picked) continue;
    usedBullets.add(picked.id);
    const short = picked.bullet.length > 72 ? `${picked.bullet.slice(0, 71).trimEnd()}…` : picked.bullet;
    const quote = item.snippet.length > 58 ? `${item.snippet.slice(0, 57).trimEnd()}…` : item.snippet;
    appeals.push({
      id: `appeal-${item.cluster}`,
      title: APPEAL_TITLES[item.cluster],
      body: `${job.company} ${job.role}의 ${item.sectionLabel} “${quote}”에 대해, ${picked.exp ? `${picked.exp.company}에서 ` : ""}${short}`,
      keywords: [item.label, ...item.evidence.slice(0, 2).map((e) => e.company).filter(Boolean)],
      evidence: picked.exp ? `${picked.exp.company} · ${picked.exp.role}` : "",
    });
  }

  // 키워드가 3개 미만으로 겹쳐도 빈자리를 남기지 않고, 아직 안 쓴 성과 문장으로 채웁니다.
  if (appeals.length < 3) {
    for (const exp of resume.experiences) {
      for (const bullet of exp.bullets) {
        if (appeals.length >= 3) break;
        if (usedBullets.has(bullet.id) || bullet.text.trim().length < 10) continue;
        usedBullets.add(bullet.id);
        appeals.push({
          id: `appeal-extra-${bullet.id}`,
          title: "같은 기준으로 보여 줄 성과",
          body: `${exp.company}에서 ${bullet.text}`,
          keywords: [],
          evidence: `${exp.company} · ${exp.role}`,
        });
      }
    }
  }

  if (!appeals.length) {
    const fallback = resume.experiences[0]?.bullets[0]?.text ?? "";
    appeals.push({
      id: "appeal-generic",
      title: "경력의 연속성으로 승부",
      body: `공고 키워드와 직접 겹치는 문장이 적습니다. ${fallback.slice(0, 70)}… 경험을 ${job.role}의 업무 순서에 맞춰 재배열하는 전략이 필요합니다.`,
      keywords: [],
      evidence: resume.headline,
    });
  }
  return appeals;
}

interface QuestionSeed {
  category: QuestionCategory;
  question: string;
  why: string;
  difficulty: 1 | 2 | 3;
  focus: string[];
  gap?: string;
  hint: string;
  task: string;
}

function starFor(resume: MasterResume, seed: QuestionSeed, company: string): StarAnswer {
  const ev = evidenceFor(resume, seed.focus);
  const metric = ev ? extractMetric(ev.bullet) : null;
  return {
    situation: ev ? `${ev.exp.company} ${ev.exp.role}(${ev.exp.period})에서` : "[상황: 언제, 어느 조직에서]",
    task: seed.task.replace("{company}", company),
    action: ev?.bullet ? ev.bullet : "[행동: 내가 직접 한 일과 판단]",
    result: metric ? `${metric} — 수치의 측정 기준과 기간을 함께 말하세요.` : "[결과: 수치·변화·남긴 자산]",
  };
}

export function buildQuestions(resume: MasterResume, job: JobPosting, match: MatchResult): InterviewQuestion[] {
  const jdText = jobSections(job).map((s) => s.text).join("\n");
  const hasCrisis = countCluster(jdText, CLUSTERS.find((c) => c.id === "crisis")!) > 0;
  const hasExternal = countCluster(jdText, CLUSTERS.find((c) => c.id === "external")!) > 0;
  const hasLeadership = countCluster(jdText, CLUSTERS.find((c) => c.id === "leadership")!) > 0;
  const agencyClusters = CLUSTERS.find((c) => c.id === "agency")!;
  const inhouseClusters = CLUSTERS.find((c) => c.id === "inhouse")!;
  const isAgency = countCluster(resumeCorpus(resume), agencyClusters) > 0;
  const wantsInhouse = countCluster(jdText, inhouseClusters) > 0;
  const topMissing = match.keywords.filter((k) => k.status === "missing").slice(0, 3);
  const topWeak = match.keywords.filter((k) => k.status === "weak").slice(0, 2);
  const topKeyword = match.keywords.find((k) => k.status !== "missing") ?? match.keywords[0];
  const metricBullet = resume.experiences.flatMap((e) => e.bullets).find((b) => hasMetric(b.text) && b.text.length > 30);
  const perfectMetric = match.keywords.find((k) => k.status === "matched" && k.evidence.length) ?? topKeyword;

  const seeds: QuestionSeed[] = [];

  seeds.push({
    category: "컬처",
    question: `왜 ${job.company}의 ${job.role}이어야 한다고 생각합니까? 다른 지원자와 다른 이유를 말해 주세요.`,
    why: "지원동기는 거의 모든 면접의 첫 질문입니다. 회사·직무·나의 접점을 한 문장씩 연결하지 못하면 이후 답변의 신뢰도가 떨어집니다.",
    difficulty: 2,
    focus: topKeyword ? [topKeyword.cluster] : [],
    hint: "회사 ① 최근 소식 ② 이 직무가 풀어야 할 문제 ③ 내 경험 중 가장 가까운 증거, 세 문장으로.",
    task: `${job.company}의 ${job.role}에서 첫 90일 동안 무엇을 만들지 설명하기`,
  });

  if (isAgency && wantsInhouse) {
    seeds.push({
      category: "전환",
      question: `${resume.experiences.find((e) => countCluster(`${e.company} ${e.role}`, agencyClusters) > 0)?.company ?? "대행사"}에서 ${job.company}로 옮기는 이유를 설명해 주세요. 대행사와 인하우스의 차이를 어떻게 이해하고 있습니까?`,
      why: "대행사 출신 지원자에게 가장 자주 나오는 압박 질문입니다. '클라이언트를 떠나고 싶어서'로 들리면 감점입니다.",
      difficulty: 3,
      focus: ["agency", "inhouse", "strategy"],
      hint: "대행사에서 얻은 것(속도·미디어 관계) → 인하우스에서 하고 싶은 것(소유권·장기 브랜드) → 첫 90일 계획 순으로.",
      task: "전환의 동기와 인하우스에서의 첫 90일 계획을 한 흐름으로 설명하기",
    });
  }

  if (metricBullet) {
    seeds.push({
      category: "성과 검증",
      question: `이력서에 “${metricBullet.text.length > 66 ? `${metricBullet.text.slice(0, 65)}…` : metricBullet.text}”라고 쓰셨습니다. 이 수치는 어떻게 측정했고, 본인이 없었다면 어떻게 달라졌을까요?`,
      why: "수치를 쓴 지원자는 반드시 측정 방식과 기여도를 추궁받습니다. 답이 흐리면 수치 전체의 신뢰가 깎입니다.",
      difficulty: 3,
      focus: perfectMetric ? [perfectMetric.cluster] : [],
      hint: "측정 기준 · 기간 · 비교 대상 · 내가 직접 한 일 · 팀의 도움을 구분해서.",
      task: "성과 수치의 측정 방식과 나의 기여도를 증명하기",
    });
  }

  for (const gap of [...topMissing, ...topWeak].slice(0, 2)) {
    seeds.push({
      category: "갭 보완",
      question: `공고는 ‘${gap.label}’을 요구합니다. 경험이 부족하다면 무엇으로 따라잡을 수 있습니까?`,
      why: `이력서에서 ‘${gap.label}’ 키워드가 확인되지 않았습니다. 없다고 답하면 끝이고, 보완 계획을 보여 주면 성장 가능성으로 바뀝니다.`,
      difficulty: 3,
      focus: gap.status === "weak" ? [gap.cluster] : [gap.cluster, "collaboration"],
      gap: gap.label,
      hint: "인정 → 가장 가까운 인접 경험 → 입사 후 90일 학습·실행 계획. 모르는 것은 모른다고 먼저 말하세요.",
      task: `${gap.label} 역량을 어떤 순서로 채울지 계획으로 보여 주기`,
    });
  }

  if (hasCrisis) {
    seeds.push({
      category: "위기 대응",
      question: `입사 후 ${job.company}에서 이슈가 터졌습니다. 첫 24시간에 무엇을, 어떤 순서로 하시겠습니까?`,
      why: "공고에 위기 커뮤니케이션이 포함되어 있습니다. 실제 사례보다 판단 순서를 보려는 질문입니다.",
      difficulty: 3,
      focus: ["crisis", "monitoring", "media"],
      hint: "사실 확인 → 내부 정렬 → 1차 입장 → 모니터링 → 후속 커뮤니케이션. '확인 전 추측 금지'를 먼저.",
      task: "첫 24시간 대응 순서와 판단 기준을 설명하기",
    });
  }

  seeds.push({
    category: "직무",
    question: `${job.role}의 성과를 어떤 지표로 측정하고, 어떻게 보고하시겠습니까?`,
    why: "공고가 성과 리포트와 데이터를 반복해서 요구합니다. 지표를 스스로 정의할 수 있는지 확인하는 질문입니다.",
    difficulty: 2,
    focus: ["data", "strategy", "writing"],
    hint: "노출·메시지 비중·리드/전환·평판 지표 중 이 직무에 맞는 2~3개를 고르고, 리포트 주기와 독자를 말하세요.",
    task: "직무 성과 지표와 리포트 구조를 정의하기",
  });

  if (hasExternal) {
    seeds.push({
      category: "직무",
      question: `정부·지자체·업계처럼 이해관계자가 첨예한 상대와 협상해야 합니다. 본인의 접근 방식은 무엇입니까?`,
      why: "공고의 대외협력 요구가 구체적입니다. 관계 구축 방식과 이해관계자 지도를 그릴 수 있는지 봅니다.",
      difficulty: 3,
      focus: ["external", "collaboration", "crisis"],
      hint: "이해관계자 지도 → 공통 이익 → 사전 비공식 접촉 → 문서화. 한 사례를 붙여서.",
      task: "이해관계자 지도를 그리고 합의점을 만드는 방식 설명하기",
    });
  }

  if (hasLeadership || resume.years >= 6) {
    seeds.push({
      category: "리더십",
      question: "팀원이 같은 실수를 반복할 때 어떻게 관리하시겠습니까? 실제 사례가 있다면 함께 말해 주세요.",
      why: "연차와 공고상 리딩 요구를 고려하면 조직 관리 질문이 나옵니다. '이해해 줬다'로 끝나면 관리 역량이 의심됩니다.",
      difficulty: 2,
      focus: ["leadership", "internal", "collaboration"],
      hint: "원인 파악 → 기대치 재정의 → 프로세스·체크포인트 → 결과 확인. 감정이 아니라 구조로.",
      task: "반복 실수를 구조로 해결한 경험 설명하기",
    });
  }

  seeds.push({
    category: "협업",
    question: "유관부서가 반대하는 캠페인을 밀어붙여야 할 때, 어떻게 설득하시겠습니까?",
    why: "커뮤니케이션 직무는 대부분 유관부서와의 조율로 성과가 갈립니다. 갈등 상황의 기본기를 봅니다.",
    difficulty: 2,
    focus: ["collaboration", "strategy", "data"],
    hint: "반대의 이유를 먼저 정확히 듣기 → 공동 목표로 재정의 → 작은 실험 → 데이터로 합의.",
    task: "반대를 설득해 캠페인을 실행한 과정 설명하기",
  });

  seeds.push({
    category: "성과 검증",
    question: "가장 크게 실패한 캠페인은 무엇이고, 그 뒤에 무엇을 바꾸셨습니까?",
    why: "실패를 다루는 방식은 자기 인식과 개선 루프를 보여 줍니다. 성공담만 준비한 지원자는 여기서 막힙니다.",
    difficulty: 3,
    focus: ["crisis", "research", "data"],
    hint: "실패를 인정 → 원인을 내 판단에서 찾기 → 바꾼 프로세스 → 이후 결과.",
    task: "실패의 원인과 바꾼 프로세스를 설명하기",
  });

  seeds.push({
    category: "컬처",
    question: `우리 조직은 ‘${match.tone.axes.filter((a) => a.job >= 40).sort((a, b) => b.job - a.job)[0]?.label ?? "실행 속도"}’를 중시합니다. 본인의 일하는 방식과 어떻게 맞습니까?`,
    why: "공고의 조직 톤 문장을 그대로 인용한 질문입니다. 문화 적합도는 결국 행동 사례로 확인됩니다.",
    difficulty: 2,
    focus: ["collaboration", "strategy"],
    hint: "조직의 톤을 인정 → 내 방식의 구체적 습관 → 그 방식이 만든 결과.",
    task: "조직의 일하는 방식과 내 습관이 맞는 지점을 사례로 보여 주기",
  });

  seeds.push({
    category: "직무",
    question: `${job.role}로 입사해 첫 90일 동안 무엇을 하시겠습니까?`,
    why: "지원동기 다음으로 자주 나오는 질문입니다. 직무를 얼마나 구체적으로 이해하는지 드러납니다.",
    difficulty: 1,
    focus: [topKeyword?.cluster ?? "strategy", "collaboration"],
    hint: "30일: 파악(이해관계자·자산·지표) / 60일: 작은 실행 / 90일: 구조와 리포트.",
    task: "첫 90일 계획을 30·60·90일로 나눠 설명하기",
  });

  seeds.push({
    category: "직무",
    question: `우대사항에 있는 ${match.keywords.filter((k) => k.sections.includes("preferred"))[0]?.label ?? "추가 역량"}은 어느 정도 수준입니까? 스스로 평가해 주세요.`,
    why: "우대사항은 '있으면 좋은 것'이지만, 과장하면 면접에서 바로 드러납니다. 수준을 정직하게 말하는지 봅니다.",
    difficulty: 2,
    focus: [match.keywords.filter((k) => k.sections.includes("preferred"))[0]?.cluster ?? "strategy"],
    hint: "상·중·하로 말하고 근거 한 줄, 부족한 부분의 보완 계획 한 줄.",
    task: "역량 수준을 근거와 함께 정직하게 평가하기",
  });

  const seen = new Set<string>();
  const questions: InterviewQuestion[] = [];
  for (const seed of seeds) {
    if (seen.has(seed.question)) continue;
    seen.add(seed.question);
    questions.push({
      id: `q-${questions.length + 1}-${seed.category}`,
      category: seed.category,
      question: seed.question,
      why: seed.why,
      difficulty: seed.difficulty,
      gap: seed.gap ?? null,
      edited: false,
      star: starFor(resume, seed, job.company),
      hint: seed.hint,
    });
  }

  return questions.slice(0, 12).map((q, index) => ({ ...q, id: `q-${index + 1}` }));
}

export interface Analysis {
  match: MatchResult;
  summary: SummaryRewrite;
  rewrites: RewriteItem[];
  appeals: AppealItem[];
  questions: InterviewQuestion[];
  jobKeywords: string[];
}

export function analyze(resume: MasterResume, job: JobPosting): Analysis {
  const match = matchResume(resume, job);
  return {
    match,
    summary: buildSummary(resume, job, match),
    rewrites: buildRewrites(resume, match),
    appeals: buildAppeals(resume, job, match),
    questions: buildQuestions(resume, job, match),
    jobKeywords: match.keywords.map((k) => k.label),
  };
}

/** 반영한 리라이트만 적용한 경력 원본으로 적합도를 다시 계산합니다. */
export function projectMatch(
  resume: MasterResume,
  job: JobPosting,
  rewrites: RewriteItem[],
  summary?: SummaryRewrite,
): MatchResult {
  const byBullet = new Map(rewrites.map((r) => [r.id, r]));
  const projected: MasterResume = {
    ...resume,
    summary: summary?.adopted ? summary.after : resume.summary,
    experiences: resume.experiences.map((exp) => ({
      ...exp,
      bullets: exp.bullets.map((bullet) => {
        const rewrite = byBullet.get(bullet.id);
        if (rewrite?.adopted) return { ...bullet, text: rewrite.after };
        return bullet;
      }),
    })),
  };
  return matchResume(projected, job);
}

export function starToText(q: InterviewQuestion): string {
  return [
    `Q. ${q.question}`,
    `S · ${q.star.situation}`,
    `T · ${q.star.task}`,
    `A · ${q.star.action}`,
    `R · ${q.star.result}`,
  ].join("\n");
}
