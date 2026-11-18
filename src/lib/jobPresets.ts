import type { JobPreset } from "../types";

/**
 * 첫 화면의 직무 프리셋.
 *
 * 프리셋을 고르면 그 키워드로 원티드·사람인·잡코리아를 한 번에 조회합니다.
 * 비어 있는 query("전체")는 키워드 없이 최신 공고를 받아 옵니다.
 */
export const JOB_PRESETS: JobPreset[] = [
  { id: "all", label: "전체 최신", query: "", hint: "직무를 고르면 사람인·잡코리아까지 함께 모읍니다" },
  { id: "pr", label: "PR·홍보", query: "홍보", hint: "보도자료·언론 대응·커뮤니케이션" },
  { id: "marketing", label: "마케팅", query: "마케팅", hint: "퍼포먼스·그로스·CRM" },
  { id: "content", label: "콘텐츠", query: "콘텐츠", hint: "콘텐츠 기획·SNS·크리에이터" },
  { id: "brand", label: "브랜드", query: "브랜드", hint: "브랜드 마케팅·브랜딩" },
  { id: "planning", label: "기획·전략", query: "기획", hint: "서비스·사업·전략 기획" },
  { id: "design", label: "디자인", query: "디자이너", hint: "UI·UX·그래픽·브랜드 디자인" },
  { id: "dev", label: "개발", query: "개발자", hint: "프론트·백엔드·모바일" },
  { id: "data", label: "데이터", query: "데이터", hint: "데이터 분석·엔지니어링" },
  { id: "sales", label: "영업", query: "영업", hint: "B2B·B2C 영업·세일즈" },
  { id: "support", label: "경영지원", query: "경영지원", hint: "인사·재무·총무" },
];

/** 직접 입력한 키워드를 쓰는 상태의 프리셋 id */
export const CUSTOM_PRESET = "custom";

export const presetById = (id: string): JobPreset | undefined => JOB_PRESETS.find((preset) => preset.id === id);
