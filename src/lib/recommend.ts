import type { MasterResume, ResumeRecommendation } from "../types";
import { CLUSTERS, countAlias, countCluster } from "./korean";

interface Family {
  id: string;
  label: string;
  /** 이 직군을 판별하는 키워드 클러스터 */
  clusters: string[];
  /** 3년차 기준 하한(만원) */
  base: number;
  /** 연차 1년당 올라가는 폭(만원) */
  step: number;
  titles: string[];
  /** 기업군 제안 */
  targets: string[];
}

const FAMILIES: Family[] = [
  {
    id: "pr",
    label: "PR·커뮤니케이션",
    clusters: ["media", "crisis", "external", "ir", "internal"],
    base: 3900,
    step: 260,
    titles: ["PR 매니저", "커뮤니케이션 매니저", "대외협력·위기관리 담당"],
    targets: ["상장사·중견기업 커뮤니케이션팀", "PR 대행사 시니어(AE~AD)", "B2B SaaS 인하우스 커뮤니케이션"],
  },
  {
    id: "brand",
    label: "브랜드·콘텐츠 마케팅",
    clusters: ["brand", "content", "social", "b2c"],
    base: 3600,
    step: 240,
    titles: ["브랜드 커뮤니케이션 매니저", "브랜드 마케터", "콘텐츠 마케팅 매니저"],
    targets: ["뷰티·커머스 브랜드 인하우스", "엔터·콘텐츠 기업", "종합광고대행사 AE"],
  },
  {
    id: "growth",
    label: "퍼포먼스·그로스 마케팅",
    clusters: ["performance", "data", "commerce"],
    base: 3800,
    step: 280,
    titles: ["퍼포먼스 마케터", "그로스 마케터", "CRM·리텐션 마케터"],
    targets: ["커머스·D2C 브랜드", "여행·플랫폼 서비스", "시리즈 B 이후 스타트업 그로스팀"],
  },
  {
    id: "b2b",
    label: "B2B 테크 마케팅",
    clusters: ["b2b", "global", "content", "data"],
    base: 4000,
    step: 300,
    titles: ["B2B 콘텐츠 마케터", "테크 커뮤니케이션 매니저", "프로덕트 마케팅 매니저"],
    targets: ["B2B SaaS 기업", "IT 솔루션·클라우드 기업", "글로벌 테크 기업 한국 지사"],
  },
  {
    id: "external",
    label: "대외협력·정책 커뮤니케이션",
    clusters: ["external", "ir", "crisis"],
    base: 4200,
    step: 280,
    titles: ["대외협력 매니저", "정책·대관 담당", "공공 커뮤니케이션 매니저"],
    targets: ["모빌리티·에너지 기업 대관팀", "공공기관·협회", "상장사 IR·공시 담당"],
  },
  {
    id: "inside",
    label: "사내 커뮤니케이션",
    clusters: ["internal", "leadership", "collaboration"],
    base: 3700,
    step: 230,
    titles: ["사내 커뮤니케이션 매니저", "HR 커뮤니케이션 담당", "조직문화 프로그램 매니저"],
    targets: ["구성원 300명 이상 테크 기업", "대기업 인사·커뮤니케이션 조직", "조직문화 컨설팅사"],
  },
];

const corpusOf = (resume: MasterResume): string =>
  [
    resume.headline,
    resume.summary,
    resume.industries.join(" "),
    resume.skills.join(" "),
    ...resume.experiences.flatMap((exp) => [exp.company, exp.role, ...exp.bullets.map((bullet) => bullet.text)]),
  ]
    .filter(Boolean)
    .join("\n");

const clusterById = (id: string) => CLUSTERS.find((cluster) => cluster.id === id);

const hitCount = (corpus: string, ids: string[]): number =>
  ids.reduce((sum, id) => {
    const cluster = clusterById(id);
    return cluster ? sum + countCluster(corpus, cluster) : sum;
  }, 0);

const levelPrefix = (years: number): string => (years >= 10 ? "시니어·리드 " : years >= 7 ? "시니어 " : "");

/** 이력서만으로 만드는 추천 방향 (규칙 엔진). 연봉은 추정 범위임을 함께 남깁니다. */
export function recommendLocal(resume: MasterResume): ResumeRecommendation {
  const corpus = corpusOf(resume);
  const ranked = FAMILIES.map((family) => ({ family, score: hitCount(corpus, family.clusters) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  const primary = ranked[0]?.family ?? FAMILIES[0];
  const secondary = ranked[1]?.family;

  const evidenceLabel = (family: Family): string => {
    const labels = family.clusters
      .map(clusterById)
      .filter((cluster): cluster is NonNullable<ReturnType<typeof clusterById>> => Boolean(cluster))
      .filter((cluster) => countCluster(corpus, cluster) > 0)
      .slice(0, 2)
      .map((cluster) => cluster.label);
    return labels.join("·");
  };

  const titles: ResumeRecommendation["titles"] = [];
  const pushTitle = (family: Family, index: number) => {
    const title = `${levelPrefix(resume.years)}${family.titles[index] ?? family.titles[0]}`.trim();
    if (titles.some((item) => item.title === title)) return;
    titles.push({
      title,
      why: `${family.label} 신호(${evidenceLabel(family) || family.label})가 이력서에서 ${resume.experiences.length}개 경력에 걸쳐 확인됩니다.`,
    });
  };
  pushTitle(primary, 0);
  pushTitle(primary, 1);
  if (secondary) pushTitle(secondary, 0);
  while (titles.length < 3) pushTitle(primary, titles.length);

  const yearsOver = Math.max(0, resume.years - 3);
  const floor = Math.round((primary.base + yearsOver * primary.step * 0.85) / 100) * 100;
  const ceiling = Math.round((primary.base + yearsOver * primary.step * 1.3) / 100) * 100;
  const salaryBand = {
    min: Math.min(12_000, Math.max(3_000, floor)),
    max: Math.min(12_000, Math.max(floor + 400, ceiling)),
    basis: `${resume.years}년차 ${primary.label} 기준 추정 · 공고의 실제 연봉 표기와 다를 수 있습니다`,
  };

  const industries = [...resume.industries, corpus].join(" ");
  const industryTargets: { group: string; why: string }[] = [];
  const addTarget = (group: string, why: string) => {
    if (!industryTargets.some((item) => item.group === group)) industryTargets.push({ group, why });
  };
  if (/뷰티|화장품|코스메틱/.test(industries)) addTarget("뷰티·코스메틱 브랜드 인하우스", "이력서의 뷰티 산업 경험과 브랜드 캠페인 문장이 그대로 읽히는 기업군입니다.");
  if (/커머스|이커머스|쇼핑|리테일|D2C/.test(industries)) addTarget("커머스·D2C 브랜드", "구매 전환·자사몰 지표를 다뤄 본 기록이 있어 성과 언어가 맞습니다.");
  if (/엔터|콘텐츠|아티스트|팬덤/.test(industries)) addTarget("엔터·콘텐츠 기업", "콘텐츠 기획·팬덤 커뮤니케이션 경험이 이 산업의 실제 업무와 겹칩니다.");
  if (/SaaS|B2B|엔터프라이즈|IT|테크/.test(industries)) addTarget("B2B SaaS·테크 기업", "B2B 커뮤니케이션 문장이 있어 인하우스 1인 체제에 바로 맞습니다.");
  if (/금융|핀테크|은행|보험/.test(industries)) addTarget("핀테크·금융", "신뢰가 중요한 산업이라 커뮤니케이션 경험의 무게가 큽니다.");
  if (/식품|F&B|푸드/.test(industries)) addTarget("식품·F&B 브랜드", "식품 카테고리 경험이 있어 제품 커뮤니케이션을 바로 맡을 수 있습니다.");
  for (const group of primary.targets) {
    addTarget(group, `${primary.label} 경력이 이 기업군의 채용 기준과 가장 가깝습니다.`);
    if (industryTargets.length >= 3) break;
  }
  if (secondary) addTarget(secondary.targets[1] ?? secondary.targets[0], `${secondary.label} 경험이 두 번째 축으로 확인됩니다.`);

  return { titles: titles.slice(0, 3), salaryBand, targets: industryTargets.slice(0, 3), source: "rule" };
}

export interface SearchLink {
  label: string;
  hint: string;
  href: string;
  /** 검색어를 직접 입력해야 하는 사이트 */
  manual?: boolean;
}

/** 포지션 키워드로 바로 검색되는 링크. (원티드·링크드인은 검색어가 URL에 들어갑니다) */
export function searchLinks(keyword: string): SearchLink[] {
  const query = encodeURIComponent(keyword.trim());
  return [
    { label: "원티드", hint: `‘${keyword}’ 검색 결과`, href: `https://www.wanted.co.kr/search?query=${query}` },
    {
      label: "리멤버",
      hint: `공고 목록에서 ‘${keyword}’ 검색`,
      href: "https://career.rememberapp.co.kr/job/postings",
      manual: true,
    },
    {
      label: "링크드인",
      hint: `‘${keyword}’ · 대한민국`,
      href: `https://www.linkedin.com/jobs/search/?keywords=${query}&location=South%20Korea`,
    },
  ];
}

export const keywordMention = (text: string, keyword: string): number => countAlias(text, keyword);
