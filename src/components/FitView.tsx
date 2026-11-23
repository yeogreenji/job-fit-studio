import { Gauge, SlidersHorizontal } from "lucide-react";
import type { CareerProfile, FitResult } from "../types";
import { profileSummary } from "../lib/career";
import { Card, Meter, ScoreRing, cx, scoreColor } from "./ui";

const TONE_STYLE: Record<FitResult["tone"], string> = {
  high: "bg-ok-soft text-ok",
  mid: "bg-accent-soft text-accent-deep",
  low: "bg-warn-soft text-warn",
  bad: "bg-risk-soft text-risk",
};

/** 공고 한 건의 적합도 — 점수·비중·근거를 숨기지 않고 그대로 보여 줍니다. */
export function FitView({
  fit,
  profile,
  saved,
  onEditProfile,
}: {
  fit: FitResult;
  profile: CareerProfile;
  saved: boolean;
  onEditProfile: () => void;
}) {
  return (
    <Card className="overflow-hidden" testId="hub-fit">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">
          <Gauge size={12} />
        </span>
        <span className="text-[12px] font-semibold text-ink">내 프로필 기준 적합도</span>
        <span className={cx("chip text-[9.5px]", TONE_STYLE[fit.tone])} data-testid="fit-label" data-score={fit.score}>
          {fit.needsProfile ? "프로필 필요" : `${fit.score}% · ${fit.label}`}
        </span>
        <button type="button" onClick={onEditProfile} className="btn btn-ghost ml-auto h-7 px-2 text-[10px] text-muted" data-testid="fit-edit-profile">
          <SlidersHorizontal size={11} /> 프로필 {saved ? "수정" : "설정"}
        </button>
      </div>

      {fit.needsProfile ? (
        <div className="px-4 py-4">
          <p className="text-[11.5px] leading-relaxed text-ink-2">
            커리어 프로필에 <strong className="font-semibold">직무·경력 연차·핵심 키워드</strong>를 적으면 이 공고가 얼마나 맞는지 계산해
            보여 줍니다. 이력서와 별개로 ‘지금 찾는 자리’의 조건만 적으면 됩니다.
          </p>
          <button type="button" onClick={onEditProfile} className="btn btn-accent mt-2 h-8 px-3 text-[11.5px]">
            <SlidersHorizontal size={12} /> 프로필 만들기
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 px-4 py-3 sm:grid-cols-[118px_minmax(0,1fr)]">
            <div className="flex items-center gap-3 sm:flex-col sm:items-start">
              <ScoreRing score={fit.score} size={96} label="fit" />
              <div className="min-w-0">
                <p className="text-[10px] leading-relaxed text-muted">{profileSummary(profile)}</p>
                {!saved && <p className="mt-0.5 text-[9px] text-faint">이력서에서 채운 초안 기준</p>}
              </div>
            </div>

            <div className="min-w-0 space-y-1.5">
              {fit.parts.map((part) => (
                <div key={part.id} className="grid grid-cols-[82px_minmax(0,1fr)_30px] items-center gap-2" data-testid={`fit-part-${part.id}`}>
                  <span className={cx("text-[10px]", part.available ? "font-semibold text-ink-2" : "text-faint")}>{part.label}</span>
                  <span className="min-w-0">
                    <Meter value={part.available ? part.score : 0} height={4} color={part.available ? scoreColor(part.score) : "#e2e1d9"} />
                    <span className="mt-0.5 block truncate text-[9px] leading-tight text-faint" title={part.note}>
                      {part.available ? `${Math.round(part.weight * 100)}% 비중 · ${part.note}` : part.note}
                    </span>
                  </span>
                  <span className={cx("num text-right text-[10.5px] font-semibold", part.available ? "text-ink" : "text-faint")}>
                    {part.available ? part.score : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {(fit.matched.length > 0 || fit.missing.length > 0) && (
            <div className="grid gap-2 border-t border-line px-4 py-2.5 sm:grid-cols-2">
              <div>
                <div className="text-[9.5px] font-semibold text-ok">공고에 있는 내 키워드 {fit.matched.length}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {fit.matched.length ? (
                    fit.matched.map((keyword) => (
                      <span key={keyword} className="chip bg-ok-soft text-[9.5px] text-ok" data-testid="fit-matched">
                        {keyword}
                      </span>
                    ))
                  ) : (
                    <span className="text-[9.5px] text-faint">없음</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-[9.5px] font-semibold text-warn">공고에 없는 내 키워드 {fit.missing.length}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {fit.missing.length ? (
                    fit.missing.map((keyword) => (
                      <span key={keyword} className="chip bg-warn-soft text-[9.5px] text-warn" data-testid="fit-missing">
                        {keyword}
                      </span>
                    ))
                  ) : (
                    <span className="text-[9.5px] text-faint">없음</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {fit.excluded.length > 0 && (
            <div className="border-t border-line bg-risk-soft/70 px-4 py-2 text-[10px] leading-relaxed text-risk">
              내가 정한 제외 키워드 <strong className="font-semibold">{fit.excluded.join(" · ")}</strong>가 공고에 있습니다. 점수를 낮춰
              표시했습니다.
            </div>
          )}

          <div className="border-t border-line px-4 py-1.5 text-[9px] leading-relaxed text-faint">
            점수는 프로필과 공고 원문만 비교한 참고값입니다 — 서류 통과를 보장하지 않습니다. 계산에 쓴 비중과 근거를 위에 그대로
            표시합니다.
          </div>
        </>
      )}
    </Card>
  );
}
