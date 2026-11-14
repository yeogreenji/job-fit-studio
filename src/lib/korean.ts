import type { JobPosting, SectionId } from "../types";

export interface Cluster {
  id: string;
  label: string;
  aliases: string[];
  group: "core" | "industry";
}

/**
 * 채용 공고와 경력 원본에서 함께 찾는 키워드 사전.
 * 라벨은 이력서에 그대로 쓸 수 있는 명사구로 맞췄습니다.
 */
export const CLUSTERS: Cluster[] = [
  {
    id: "media",
    label: "미디어 릴레이션",
    group: "core",
    aliases: ["미디어 릴레이션", "미디어 관계", "언론 대응", "언론사", "기자", "보도자료", "인터뷰", "퍼블리시티", "미디어 커뮤니케이션", "보도", "취재", "미디어"],
  },
  {
    id: "crisis",
    label: "위기 커뮤니케이션",
    group: "core",
    aliases: ["위기 커뮤니케이션", "위기관리", "위기 관리", "위기 대응", "이슈 대응", "리스크 커뮤니케이션", "리스크 관리", "대응 매뉴얼", "이슈 관리", "위기", "이슈 대응 체계"],
  },
  {
    id: "content",
    label: "콘텐츠 기획·제작",
    group: "core",
    aliases: ["콘텐츠", "카드뉴스", "카피라이팅", "카피", "스토리텔링", "뉴스레터", "블로그", "아티클", "영상 콘텐츠", "기사형 콘텐츠"],
  },
  {
    id: "social",
    label: "SNS 채널 운영",
    group: "core",
    aliases: ["SNS", "소셜 미디어", "소셜미디어", "인스타그램", "유튜브", "커뮤니티 운영", "채널 운영", "숏폼", "릴스", "틱톡", "소셜 채널"],
  },
  {
    id: "brand",
    label: "브랜드 커뮤니케이션",
    group: "core",
    aliases: ["브랜드 커뮤니케이션", "브랜딩", "브랜드 캠페인", "톤앤매너", "브랜드 아이덴티티", "브랜드 경험", "브랜드 보이스", "브랜드"],
  },
  {
    id: "performance",
    label: "퍼포먼스 캠페인",
    group: "core",
    aliases: ["퍼포먼스", "퍼포먼스 마케팅", "광고 캠페인", "전환율", "ROAS", "그로스", "퍼널", "광고 소재", "미디어믹스", "매체 집행"],
  },
  {
    id: "data",
    label: "성과 데이터 분석",
    group: "core",
    aliases: ["데이터", "성과 분석", "KPI", "지표", "대시보드", "A/B 테스트", "리포트", "수치", "성과 측정", "데이터 기반", "분석"],
  },
  {
    id: "external",
    label: "대외협력·대관",
    group: "core",
    aliases: ["대외협력", "대관", "파트너십", "정부", "지자체", "업계", "협회", "이해관계자", "정책", "공공", "유관기관"],
  },
  {
    id: "ir",
    label: "IR 커뮤니케이션",
    group: "core",
    aliases: ["IR", "투자자", "기업설명회", "주주", "공시", "투자 유치", "밸류에이션"],
  },
  {
    id: "internal",
    label: "사내 커뮤니케이션",
    group: "core",
    aliases: ["사내 커뮤니케이션", "임직원", "조직문화", "온보딩", "사내 게시판", "전사 공지", "내부 커뮤니케이션"],
  },
  {
    id: "esg",
    label: "ESG 커뮤니케이션",
    group: "core",
    aliases: ["ESG", "지속가능", "사회공헌", "CSR", "친환경", "탄소중립", "임팩트"],
  },
  {
    id: "commerce",
    label: "커머스 마케팅",
    group: "core",
    aliases: ["커머스", "이커머스", "쇼핑", "리테일", "D2C", "자사몰", "브랜드 스토어", "구매 전환"],
  },
  {
    id: "b2b",
    label: "B2B 커뮤니케이션",
    group: "core",
    aliases: ["B2B", "엔터프라이즈", "SaaS", "솔루션", "리드 제너레이션", "화이트페이퍼", "B2B 마케팅", "기업 고객"],
  },
  {
    id: "b2c",
    label: "B2C 커뮤니케이션",
    group: "core",
    aliases: ["B2C", "소비자", "고객 접점", "일반 고객", "라이프스타일"],
  },
  {
    id: "global",
    label: "글로벌 커뮤니케이션",
    group: "core",
    aliases: ["글로벌", "해외", "영어", "영문", "현지", "글로벌 커뮤니케이션", "비즈니스 영어", "해외 파트너"],
  },
  {
    id: "leadership",
    label: "팀 리딩",
    group: "core",
    aliases: ["리더십", "팀 리딩", "팀 관리", "매니징", "육성", "조직 관리", "인원 관리", "주니어", "팀장", "리드"],
  },
  {
    id: "collaboration",
    label: "크로스펑셔널 협업",
    group: "core",
    aliases: ["협업", "크로스펑셔널", "유관부서", "부서 협의", "이해관계 조율", "조율", "협력"],
  },
  {
    id: "strategy",
    label: "커뮤니케이션 전략",
    group: "core",
    aliases: ["전략", "기획", "로드맵", "예산", "실행 계획", "캠페인 기획", "연간 계획", "전략 수립"],
  },
  {
    id: "agency",
    label: "대행사 프로젝트 리드",
    group: "core",
    aliases: ["대행사", "에이전시", "PR 대행", "클라이언트", "광고대행", "에이전시 경험", "대행사 경험"],
  },
  {
    id: "inhouse",
    label: "인하우스 운영",
    group: "core",
    aliases: ["인하우스", "사내 홍보", "자체 운영", "직접 운영", "인하우스 전환"],
  },
  {
    id: "influencer",
    label: "인플루언서 협업",
    group: "core",
    aliases: ["인플루언서", "파트너 마케팅", "체험단", "크리에이터", "콜라보", "협찬", "시딩"],
  },
  {
    id: "event",
    label: "이벤트·런칭 운영",
    group: "core",
    aliases: ["이벤트", "전시", "팝업", "행사", "런칭 행사", "컨퍼런스", "간담회", "기자간담회", "세미나"],
  },
  {
    id: "monitoring",
    label: "미디어 모니터링",
    group: "core",
    aliases: ["모니터링", "클리핑", "여론 조사", "미디어 모니터링", "이슈 모니터링", "여론", "보도 추적"],
  },
  {
    id: "writing",
    label: "보도자료 작성",
    group: "core",
    aliases: ["보도자료 작성", "기획서", "제안서", "문서 작성", "원고", "카피 작성", "작성", "메시지 설계"],
  },
  {
    id: "research",
    label: "시장·경쟁사 리서치",
    group: "core",
    aliases: ["리서치", "시장 조사", "트렌드", "경쟁사 분석", "인사이트", "벤치마킹", "고객 조사"],
  },
  {
    id: "platform",
    label: "디지털 플랫폼 이해",
    group: "core",
    aliases: ["플랫폼", "IT", "테크", "디지털", "앱", "서비스 기획", "테크 기업"],
  },
  {
    id: "budget",
    label: "예산·벤더 관리",
    group: "core",
    aliases: ["예산 관리", "벤더", "외주", "견적", "비용", "발주", "대행사 관리"],
  },
  {
    id: "music",
    label: "엔터테인먼트 콘텐츠",
    group: "industry",
    aliases: ["엔터테인먼트", "아티스트", "팬덤", "음악", "드라마", "예능", "콘텐츠 IP", "팬 커뮤니티"],
  },
  {
    id: "saas",
    label: "B2B SaaS",
    group: "industry",
    aliases: ["B2B SaaS", "SaaS", "엔터프라이즈 소프트웨어", "클라우드 서비스", "소프트웨어 기업", "B2B 소프트웨어"],
  },
  {
    id: "game",
    label: "게임 산업 이해",
    group: "industry",
    aliases: ["게임", "게이머", "퍼블리셔", "게임사", "라이브 서비스"],
  },
  {
    id: "fintech",
    label: "금융·핀테크 이해",
    group: "industry",
    aliases: ["핀테크", "금융", "은행", "보험", "증권", "결제", "자산관리"],
  },
  {
    id: "beauty",
    label: "뷰티 산업 이해",
    group: "industry",
    aliases: ["뷰티", "화장품", "코스메틱", "스킨케어", "향수"],
  },
  {
    id: "food",
    label: "식품·F&B 이해",
    group: "industry",
    aliases: ["식품", "F&B", "외식", "프랜차이즈", "베이커리", "음료"],
  },
  {
    id: "travel",
    label: "여행·레저 이해",
    group: "industry",
    aliases: ["여행", "호텔", "항공", "레저", "숙박", "예약"],
  },
  {
    id: "mobility",
    label: "모빌리티 산업 이해",
    group: "industry",
    aliases: ["모빌리티", "자동차", "주행", "충전", "물류", "배송"],
  },
  {
    id: "education",
    label: "교육 산업 이해",
    group: "industry",
    aliases: ["교육", "에듀테크", "학습", "강의", "학교"],
  },
  {
    id: "healthcare",
    label: "헬스케어 산업 이해",
    group: "industry",
    aliases: ["헬스케어", "바이오", "제약", "의료", "병원", "건강"],
  },
  {
    id: "energy",
    label: "에너지 산업 이해",
    group: "industry",
    aliases: ["에너지", "배터리", "전기차", "재생에너지", "발전"],
  },
];

export const SECTION_LABEL: Record<SectionId, string> = {
  responsibilities: "담당 업무",
  requirements: "자격 요건",
  preferred: "우대 사항",
  tone: "조직 톤",
};

export const SECTION_WEIGHT: Record<SectionId, number> = {
  requirements: 3,
  responsibilities: 2.4,
  preferred: 1.7,
  tone: 1.1,
};

export const TONE_CUES: { id: string; label: string; note: string; cues: string[] }[] = [
  {
    id: "speed",
    label: "실행 속도",
    note: "빠른 판단과 핸즈온 실행을 요구하는 조직",
    cues: ["빠르", "속도", "애자일", "주도", "즉시", "핸즈온", "스타트업", "민첩", "실행력", "자율", "스피드"],
  },
  {
    id: "data",
    label: "데이터 근거",
    note: "수치와 근거로 성과를 설명하는 문화",
    cues: ["데이터", "수치", "KPI", "지표", "분석", "근거", "성과 측정", "리포트", "대시보드", "ROI"],
  },
  {
    id: "external",
    label: "대외관계",
    note: "외부 이해관계자와의 관계가 성과를 좌우",
    cues: ["대외", "파트너", "정부", "지자체", "업계", "관계", "대관", "협회", "이해관계자", "공공"],
  },
  {
    id: "craft",
    label: "브랜드 감수성",
    note: "톤과 디테일에 대한 감각을 중시",
    cues: ["브랜드", "톤", "완성도", "디테일", "감도", "크리에이티브", "스토리", "카피", "감각"],
  },
  {
    id: "system",
    label: "프로세스 체계",
    note: "매뉴얼과 문서화로 안정성을 확보",
    cues: ["프로세스", "체계", "매뉴얼", "규정", "가이드", "안정", "리스크 관리", "컴플라이언스", "문서화", "정합성"],
  },
  {
    id: "global",
    label: "글로벌 환경",
    note: "영어·해외 커뮤니케이션 비중이 높음",
    cues: ["글로벌", "영어", "해외", "영문", "현지", "English"],
  },
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\u00a0/g, " ");
}

const isAscii = (value: string) => /^[\x20-\x7E]+$/.test(value);

export function countAlias(text: string, alias: string): number {
  if (!text || !alias) return 0;
  const hay = normalize(text);
  const needle = escapeRegExp(normalize(alias)).replace(/\s+/g, "\\s*");
  const pattern = isAscii(alias) ? `(?<![a-z0-9])${needle}(?![a-z0-9])` : needle;
  try {
    return (hay.match(new RegExp(pattern, "gi")) ?? []).length;
  } catch {
    return hay.includes(normalize(alias)) ? 1 : 0;
  }
}

export function countCluster(text: string, cluster: Cluster): number {
  return cluster.aliases.reduce((sum, alias) => sum + countAlias(text, alias), 0);
}

/** 공고 원문에서 해당 키워드가 등장한 문장 한 줄을 뽑습니다. */
export function snippetFor(text: string, cluster: Cluster, max = 96): string {
  const lines = text
    .split(/\n|(?<=[.!?])\s|·\s|•\s/)
    .map((line) => line.replace(/^[\s\-–—•·*0-9.)]+/, "").trim())
    .filter((line) => line.length > 3);
  const hit = lines.find((line) => cluster.aliases.some((alias) => countAlias(line, alias) > 0));
  if (!hit) return "";
  return hit.length > max ? `${hit.slice(0, max - 1).trimEnd()}…` : hit;
}

export function hasMetric(text: string): boolean {
  return /\d[\d,.]*\s*(만\s*명|만\s*건|%|％|억|만|천|건|명|곳|배|위|시간|개월|pt|점|일|주|년)/.test(text);
}

export function extractMetric(text: string): string | null {
  const pattern =
    /(\d[\d,.]*\s*(?:만\s*명|만\s*건|%|％|억|만|천|건|명|곳|배|위|시간|개월|pt|점|일|주|년)(?:\s*(?:→|에서)\s*\d[\d,.]*\s*(?:%|％|억|만|천|건|명|배|위|점)?)?)/g;
  const matches = [...text.matchAll(pattern)].map((m) => m[0].trim());
  if (!matches.length) return null;
  // 결과 수치는 보통 문장 뒤쪽에 나옵니다. 뒤에서부터 성과형(%, 배, 점, 억, 만)을 먼저 찾습니다.
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    if (/[%％배점억만]/.test(matches[i])) return matches[i];
  }
  return matches[matches.length - 1];
}

export function parseRequiredYears(text: string): number | null {
  const matches = [...text.matchAll(/(\d{1,2})\s*년\s*(?:이상|이상의|경력)?/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 1 && n <= 20);
  if (!matches.length) return null;
  return Math.min(...matches);
}

export const splitLines = (text: string): string[] =>
  text
    .split(/\n|•|·\s|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^[\s\-–—*0-9.)]+/, "").trim())
    .filter((line) => line.length > 1);

export function parseRawJob(raw: string): Pick<JobPosting, "responsibilities" | "requirements" | "preferred" | "tone"> {
  const buckets: Record<SectionId, string[]> = {
    responsibilities: [],
    requirements: [],
    preferred: [],
    tone: [],
  };
  const headingMap: { test: RegExp; id: SectionId }[] = [
    { test: /(담당\s*업무|주요\s*업무|업무\s*내용|responsibilit|what you.?ll do|R&R|R&amp;R)/i, id: "responsibilities" },
    { test: /(자격\s*요건|지원\s*자격|필수\s*요건|requirements?|qualifications?|must have)/i, id: "requirements" },
    { test: /(우대\s*사항|우대|preferred|nice to have|plus)/i, id: "preferred" },
    { test: /(조직\s*문화|팀\s*소개|우리\s*팀|about (us|the team)|culture)/i, id: "tone" },
  ];
  let current: SectionId | null = null;
  for (const line of raw.split("\n")) {
    const clean = line.trim();
    if (!clean) continue;
    const heading = headingMap.find((h) => h.test.test(clean) && clean.length <= 40);
    if (heading) {
      current = heading.id;
      const rest = clean.replace(/^[#\-*\s\d.)]+/, "").replace(heading.test, "").replace(/^[:\-–—\s]+/, "").trim();
      if (rest) buckets[current].push(rest);
      continue;
    }
    if (current) buckets[current].push(clean.replace(/^[\-–—•·*]\s*/, ""));
    else if (headingMap.some((h) => h.test.test(clean))) continue;
  }
  const join = (lines: string[]) => lines.filter(Boolean).join("\n");
  return {
    responsibilities: join(buckets.responsibilities),
    requirements: join(buckets.requirements),
    preferred: join(buckets.preferred),
    tone: join(buckets.tone),
  };
}

export function highlights(text: string, labels: string[]): { text: string; hit: boolean }[] {
  const unique = [...new Set(labels.filter((label) => label.trim().length > 1))].sort((a, b) => b.length - a.length);
  if (!unique.length) return [{ text, hit: false }];
  const pattern = unique.map((label) => escapeRegExp(label).replace(/\s+/g, "\\s*")).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);
  return parts
    .filter((part) => part !== "")
    .map((part) => ({ text: part, hit: unique.some((label) => new RegExp(`^${escapeRegExp(label).replace(/\s+/g, "\\s*")}$`, "i").test(part)) }));
}
