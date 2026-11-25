import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Sparkles, X } from "lucide-react";
import type { CareerProfile } from "../types";
import { LOCATION_OPTIONS, SUGGESTED_EXCLUDES, SUGGESTED_KEYWORDS, profileFromResume } from "../lib/career";
import type { MasterResume } from "../types";
import { Toggle, cx } from "./ui";

/**
 * 커리어 프로필 편집 창.
 * 적합도는 이 창에 적힌 조건만으로 계산합니다 — 비워 둔 항목은 계산에서 빠집니다.
 */
export function CareerProfileModal({
  open,
  profile,
  saved,
  resume,
  onClose,
  onSave,
}: {
  open: boolean;
  profile: CareerProfile;
  saved: boolean;
  resume: MasterResume;
  onClose: () => void;
  onSave: (profile: CareerProfile) => void;
}) {
  const [role, setRole] = useState(profile.role);
  const [summary, setSummary] = useState(profile.summary ?? "");
  const [years, setYears] = useState(profile.years === null ? "" : String(profile.years));
  const [keywords, setKeywords] = useState<string[]>(profile.keywords);
  const [keywordInput, setKeywordInput] = useState("");
  const [salary, setSalary] = useState(profile.salary === null ? "" : String(profile.salary));
  const [locations, setLocations] = useState<string[]>(profile.locations);
  const [exclude, setExclude] = useState<string[]>(profile.exclude);
  const [excludeInput, setExcludeInput] = useState("");
  const [inhouseOnly, setInhouseOnly] = useState(profile.inhouseOnly);

  useEffect(() => {
    if (!open) return;
    setRole(profile.role);
    setSummary(profile.summary ?? "");
    setYears(profile.years === null ? "" : String(profile.years));
    setKeywords(profile.keywords);
    setKeywordInput("");
    setSalary(profile.salary === null ? "" : String(profile.salary));
    setLocations(profile.locations);
    setExclude(profile.exclude);
    setExcludeInput("");
    setInhouseOnly(profile.inhouseOnly);
  }, [open, profile]);

  const resumeKeywords = useMemo(
    () => [...new Set([...resume.skills, ...resume.industries].map((item) => item.trim()).filter(Boolean))].slice(0, 6),
    [resume.industries, resume.skills],
  );

  if (!open) return null;

  const addKeyword = (value: string) => {
    const items = value
      .split(/[,·\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!items.length) return;
    setKeywords((prev) => [...new Set([...prev, ...items])].slice(0, 12));
    setKeywordInput("");
  };

  const addExclude = (value: string) => {
    const items = value
      .split(/[,·\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!items.length) return;
    setExclude((prev) => [...new Set([...prev, ...items])].slice(0, 12));
    setExcludeInput("");
  };

  const toggle = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const save = () => {
    const pending = keywordInput.trim();
    const nextKeywords = pending ? [...new Set([...keywords, ...pending.split(/[,·]/).map((item) => item.trim()).filter(Boolean)])] : keywords;
    const pendingExclude = excludeInput.trim();
    const nextExclude = pendingExclude ? [...new Set([...exclude, ...pendingExclude.split(/[,·]/).map((item) => item.trim()).filter(Boolean)])] : exclude;
    const parsedYears = years.trim() === "" ? null : Number(years.replace(/[^\d]/g, ""));
    const parsedSalary = salary.trim() === "" ? null : Number(salary.replace(/[^\d]/g, ""));
    onSave({
      role: role.trim().slice(0, 60),
      summary: summary.trim().slice(0, 200),
      years: parsedYears !== null && Number.isFinite(parsedYears) ? parsedYears : null,
      keywords: nextKeywords.slice(0, 12),
      salary: parsedSalary !== null && parsedSalary > 0 ? parsedSalary : null,
      locations,
      exclude: nextExclude.slice(0, 12),
      inhouseOnly,
      updatedAt: new Date().toISOString(),
      origin: "manual",
    });
  };

  const fillFromResume = () => {
    const draft = profileFromResume(resume, salary.trim() ? Number(salary.replace(/[^\d]/g, "")) : null);
    setRole(draft.role);
    setSummary(draft.summary ?? "");
    setYears(draft.years === null ? "" : String(draft.years));
    setKeywords(draft.keywords);
    if (draft.salary !== null) setSalary(String(draft.salary));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6" data-testid="career-modal">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="animate-rise relative z-10 my-auto w-full max-w-[620px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-3.5">
          <div>
            <div className="eyebrow">커리어 프로필</div>
            <h2 className="mt-1 text-[15px] font-semibold text-ink">내 커리어 프로필</h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              여기 적은 조건으로 모든 공고의 적합도를 계산합니다. 비워 둔 항목은 점수에서 빠집니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10.5px] font-semibold text-ink-2">대표 직무</span>
              <input
                className="field field-sm mt-1 text-[12px]"
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="예: 인하우스 PR·홍보"
                data-testid="career-role"
              />
              <span className="mt-0.5 block text-[9px] leading-relaxed text-faint">공고 제목·태그와 단어를 비교합니다 (PR=홍보)</span>
            </label>
            <label className="block">
              <span className="text-[10.5px] font-semibold text-ink-2">경력 연차</span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  className="field field-sm w-[86px] text-right text-[12px]"
                  value={years}
                  onChange={(event) => setYears(event.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  placeholder="8"
                  data-testid="career-years"
                  aria-label="경력 연차"
                />
                <span className="text-[10.5px] text-muted">년</span>
              </div>
              <span className="mt-0.5 block text-[9px] leading-relaxed text-faint">공고의 ‘경력 5~9년’ 같은 표기와 비교합니다</span>
            </label>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-ink-2">한 줄 경력 요약</span>
              <span className="num text-[9px] text-faint">{summary.length}/200</span>
              {profile.origin === "resume" && (
                <span className="chip bg-info-soft px-1.5 py-0 text-[9px] text-info">이력서에서 채움</span>
              )}
            </div>
            <textarea
              className="field field-sm mt-1 min-h-[46px] text-[11.5px] leading-relaxed"
              value={summary}
              onChange={(event) => setSummary(event.target.value.slice(0, 200))}
              placeholder="예: 커머스·엔터 브랜드에서 보도자료와 위기 대응을 맡아 온 8년차 PR"
              data-testid="career-summary-input"
              aria-label="한 줄 경력 요약"
            />
            <span className="mt-0.5 block text-[9px] leading-relaxed text-faint">지원 문구·AI 프롬프트에 참고 문장으로 쓰입니다 (이름·연락처 금지)</span>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-ink-2">핵심 성과·키워드</span>
              <span className="num text-[9px] text-faint">{keywords.length}/12</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {keywords.map((keyword) => (
                <span key={keyword} className="chip border border-accent/25 bg-accent-soft/60 text-[10px] text-accent-deep">
                  {keyword}
                  <button type="button" onClick={() => setKeywords((prev) => prev.filter((item) => item !== keyword))} aria-label={`${keyword} 빼기`} className="ml-0.5 text-accent-deep/70 hover:text-accent-deep">
                    <X size={9} />
                  </button>
                </span>
              ))}
              {!keywords.length && <span className="text-[9.5px] text-faint">아직 없습니다 — 아래에서 눌러 넣으세요</span>}
            </div>
            <input
              className="field field-sm mt-1.5 text-[11.5px]"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addKeyword(keywordInput);
                }
              }}
              onBlur={() => keywordInput.trim() && addKeyword(keywordInput)}
              placeholder="직접 입력 후 Enter (쉼표로 여러 개)"
              data-testid="career-keyword-input"
              aria-label="핵심 키워드 입력"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[...new Set([...resumeKeywords, ...SUGGESTED_KEYWORDS])]
                .filter((keyword) => !keywords.includes(keyword))
                .slice(0, 9)
                .map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => addKeyword(keyword)}
                    className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[9.5px] text-muted hover:border-line-strong hover:text-ink-2"
                  >
                    + {keyword}
                  </button>
                ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="text-[10.5px] font-semibold text-ink-2">선호 지역</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {LOCATION_OPTIONS.map((place) => {
                  const active = locations.includes(place);
                  return (
                    <button
                      key={place}
                      type="button"
                      onClick={() => setLocations((prev) => toggle(prev, place))}
                      aria-pressed={active}
                      className={cx(
                        "rounded-md border px-1.5 py-0.5 text-[10px]",
                        active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-surface text-muted hover:border-line-strong",
                      )}
                    >
                      {place}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block">
              <span className="text-[10.5px] font-semibold text-ink-2">희망 연봉</span>
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  className="field field-sm w-[100px] text-right text-[12px]"
                  value={salary}
                  onChange={(event) => setSalary(event.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  placeholder="5500"
                  data-testid="career-salary"
                  aria-label="희망 연봉(만원)"
                />
                <span className="text-[10.5px] text-muted">만원</span>
              </div>
              <span className="mt-0.5 block text-[9px] leading-relaxed text-faint">공고에 급여가 적힌 경우에만 비교합니다 · 협상 스크립트에도 쓰입니다</span>
            </label>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-ink-2">제외 키워드</span>
              <span className="text-[9px] text-faint">공고에 있으면 점수를 크게 낮춥니다</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {exclude.map((keyword) => (
                <span key={keyword} className="chip border border-risk/25 bg-risk-soft text-[10px] text-risk">
                  {keyword}
                  <button type="button" onClick={() => setExclude((prev) => prev.filter((item) => item !== keyword))} aria-label={`${keyword} 빼기`} className="ml-0.5 text-risk/70 hover:text-risk">
                    <X size={9} />
                  </button>
                </span>
              ))}
              {!exclude.length && <span className="text-[9.5px] text-faint">없음</span>}
            </div>
            <input
              className="field field-sm mt-1.5 text-[11.5px]"
              value={excludeInput}
              onChange={(event) => setExcludeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addExclude(excludeInput);
                }
              }}
              onBlur={() => excludeInput.trim() && addExclude(excludeInput)}
              placeholder="예: 인턴, 계약직, 주말 근무"
              data-testid="career-exclude-input"
              aria-label="제외 키워드 입력"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {SUGGESTED_EXCLUDES.filter((keyword) => !exclude.includes(keyword)).map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => addExclude(keyword)}
                  className="rounded-md border border-line bg-paper px-1.5 py-0.5 text-[9.5px] text-muted hover:border-line-strong hover:text-ink-2"
                >
                  + {keyword}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper-deep/40 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-ink">인하우스 기업만 보기</div>
              <div className="text-[9.5px] leading-relaxed text-muted">에이전시·대행사 공고를 적합도에서 낮게 봅니다</div>
            </div>
            <span className="ml-auto">
              <Toggle checked={inhouseOnly} onChange={setInhouseOnly} label="인하우스만" />
            </span>
          </div>

          {!saved && (
            <div className="flex items-start gap-1.5 rounded-lg border border-info/20 bg-info-soft px-3 py-2 text-[10px] leading-relaxed text-info">
              <Sparkles size={11} className="mt-0.5 shrink-0" />
              아직 저장 전이라 이력서에서 확인되는 값만 초안으로 쓰고 있습니다. 저장하면 공고마다 이 기준으로 점수를 다시 계산합니다.
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-5 py-3">
          <button type="button" onClick={fillFromResume} className="btn btn-ghost h-8 px-2 text-[10.5px] text-muted" data-testid="career-from-resume">
            <RotateCcw size={11} /> 이력서에서 다시 채우기
          </button>
          <span className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={onClose} className="btn btn-outline h-8 px-3 text-[11.5px]">
              취소
            </button>
            <button type="button" onClick={save} className="btn btn-primary h-8 px-3.5 text-[11.5px]" data-testid="career-save">
              저장하고 점수 다시 계산
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
