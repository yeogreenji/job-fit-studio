import { Check, ChevronRight, CircleDashed, Info } from "lucide-react";
import type { ApplicationEntry, JobPackage } from "../types";
import { Card, Eyebrow, Meter, ScoreRing, SectionHead, cx } from "./ui";

export function Rail({
  pkg,
  saved,
  entries,
  onLoad,
  onOpenHistory,
  onOpenTracker,
}: {
  pkg: JobPackage | null;
  saved: JobPackage[];
  entries: ApplicationEntry[];
  onLoad: (pkg: JobPackage) => void;
  onOpenHistory: () => void;
  onOpenTracker: () => void;
}) {
  const previous = pkg ? saved.find((p) => p.id !== pkg.id && p.company === pkg.company) : null;
  const answered = pkg ? pkg.questions.filter((q) => q.edited).length : 0;
  const adopted = pkg ? pkg.rewrites.filter((r) => r.adopted).length : 0;

  return (
    <div className="space-y-3">
      {pkg ? (
        <>
          <Card className="p-3.5">
            <div className="flex items-center justify-between">
              <Eyebrow>Match score</Eyebrow>
              {previous && (
                <span
                  className={cx(
                    "num chip px-1.5 py-0.5 text-[9px]",
                    pkg.match.score >= previous.match.score ? "bg-ok-soft text-ok" : "bg-risk-soft text-risk",
                  )}
                >
                  {pkg.match.score >= previous.match.score ? "+" : ""}
                  {pkg.match.score - previous.match.score}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <ScoreRing score={pkg.match.score} size={96} label="fit" />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">{pkg.match.grade.label}</div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{pkg.match.summaryLine}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <span className="chip bg-paper-deep px-1.5 py-0.5 text-[8.5px] text-muted">매칭 {pkg.match.matchedCount}</span>
                  <span className="chip bg-warn-soft px-1.5 py-0.5 text-[8.5px] text-warn">보완 {pkg.match.weakCount}</span>
                  <span className="chip bg-risk-soft px-1.5 py-0.5 text-[8.5px] text-risk">미충족 {pkg.match.missingCount}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 border-t border-line pt-2.5">
              {pkg.match.subs.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2">
                  <span className="w-[52px] shrink-0 text-[9.5px] text-muted">{sub.label}</span>
                  <Meter value={sub.score} height={3} />
                  <span className="num w-5 text-right text-[9.5px] font-semibold text-ink-2">{sub.score}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-3.5">
            <div className="flex items-center justify-between">
              <Eyebrow>Application</Eyebrow>
              <span className="num text-[9px] text-faint">{saved.length}건</span>
            </div>
            <div className="mt-2 space-y-2">
              {[
                { label: "리라이트 반영", value: adopted, total: pkg.rewrites.length },
                { label: "STAR 답변", value: answered, total: pkg.questions.length },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-muted">{item.label}</span>
                    <span className="num text-[10px] font-semibold text-ink-2">
                      {item.value}
                      <span className="text-faint">/{item.total}</span>
                    </span>
                  </div>
                  <Meter value={(item.value / Math.max(1, item.total)) * 100} height={3} className="mt-1" />
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-1.5 border-t border-line pt-2.5">
              {[
                { done: pkg.rewrites.length > 0 && adopted === pkg.rewrites.length, text: "리라이트 전체 반영 검토" },
                { done: answered >= 3, text: "STAR 답변 3개 이상 작성" },
                { done: false, text: "Markdown으로 저장" },
                { done: false, text: "면접 시트 인쇄" },
              ].map((item) => (
                <li key={item.text} className="flex items-center gap-1.5">
                  {item.done ? <Check size={10} className="text-accent" /> : <CircleDashed size={10} className="text-faint" />}
                  <span className={cx("text-[9.5px]", item.done ? "text-faint line-through" : "text-muted")}>{item.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <Card className="p-4">
          <Eyebrow>Ready</Eyebrow>
          <p className="mt-2 text-[12px] font-semibold text-ink">공고와 경력 원본을 넣고 생성하세요.</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            점수·갭·리라이트·면접 질문이 한 번에 만들어집니다. 샘플 공고로 먼저 확인해 보세요.
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            {["미디어 릴레이션", "위기 커뮤니케이션", "브랜드 캠페인", "성과 분석"].map((k) => (
              <span key={k} className="chip bg-paper-deep px-1.5 py-0.5 text-[8.5px] text-muted">
                {k}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-3.5 py-2.5">
          <SectionHead eyebrow="Pipeline" title="지원 현황" />
          <button type="button" onClick={onOpenTracker} className="flex items-center gap-0.5 text-[9.5px] text-muted hover:text-ink">
            트래커 <ChevronRight size={11} />
          </button>
        </div>
        <div className="divide-y divide-line border-t border-line">
          {entries.slice(0, 5).map((entry) => {
            const linked = saved.find((item) => item.id === entry.packageId || (item.company === entry.company && item.role === entry.role));
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => (linked ? onLoad(linked) : onOpenTracker())}
                className={cx("flex w-full items-center gap-2 px-3.5 py-2 text-left transition-colors", pkg?.id === entry.packageId ? "bg-accent-soft/50" : "hover:bg-[#fbfbf8]")}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10.5px] font-semibold text-ink">{entry.company}</span>
                  <span className="block truncate text-[9px] text-faint">{entry.role || "직무 미입력"}</span>
                </span>
                <span className="chip shrink-0 bg-paper-deep px-1.5 py-0.5 text-[8.5px] text-muted">{entry.stage}</span>
                {typeof entry.score === "number" ? (
                  <span className="num w-5 text-right text-[10px] font-semibold text-ink-2">{entry.score}</span>
                ) : (
                  <span className="num w-5 text-right text-[10px] text-faint">—</span>
                )}
              </button>
            );
          })}
          {entries.length === 0 && <p className="px-3.5 py-4 text-[10px] leading-relaxed text-faint">패키지를 생성하면 지원 건이 여기에 쌓입니다. 트래커에서 직접 추가할 수도 있습니다.</p>}
        </div>
        {entries.length > 0 && (
          <div className="flex items-center justify-between border-t border-line bg-[#fcfcf9] px-3.5 py-1.5">
            <span className="text-[9px] text-faint">총 {entries.length}건 · 오퍼 {entries.filter((e) => e.stage === "오퍼").length}건</span>
            <button type="button" onClick={onOpenHistory} className="flex items-center gap-0.5 text-[9px] text-muted hover:text-ink">
              패키지 히스토리 <ChevronRight size={10} />
            </button>
          </div>
        )}
      </Card>

      <div className="rounded-xl border border-line bg-[#fcfcf9] px-3.5 py-3">
        <div className="flex items-start gap-2">
          <Info size={12} className="mt-0.5 shrink-0 text-faint" />
          <p className="text-[9.5px] leading-relaxed text-faint">
            점수는 공고 문장과 경력 원본의 키워드 일치로 계산한 참고값입니다. 서류 통과를 보장하지 않으며, 모든 데이터는 이 브라우저에만 저장됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
