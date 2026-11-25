import { useState } from "react";
import { ArrowLeft, ArrowUpRight, BarChart3, Check, GitCompareArrows, Trash2, X } from "lucide-react";
import type { JobPackage } from "../types";
import { Card, Meter, ScoreRing, SectionHead, cx, scoreColor } from "./ui";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

export function HistoryView({
  packages,
  onLoad,
  onDelete,
  onClear,
  onBack,
}: {
  packages: JobPackage[];
  onLoad: (pkg: JobPackage) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onBack: () => void;
}) {
  const [picks, setPicks] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const togglePick = (id: string) =>
    setPicks((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : prev.length >= 3 ? [...prev.slice(1), id] : [...prev, id]));

  const selected = picks.map((id) => packages.find((p) => p.id === id)).filter((p): p is JobPackage => Boolean(p));
  const average = packages.length ? Math.round(packages.reduce((sum, p) => sum + p.match.score, 0) / packages.length) : 0;
  const best = packages.length ? Math.max(...packages.map((p) => p.match.score)) : 0;

  const handleDelete = (id: string) => {
    setPicks((prev) => prev.filter((p) => p !== id));
    onDelete(id);
  };

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold tracking-[-0.02em]">지원 패키지 히스토리</h1>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              회사별로 만든 패키지의 적합도와 갭을 나란히 비교합니다. 최대 3건까지 선택할 수 있습니다.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-1.5 text-center">
              <div className="text-[9px] text-faint">지원 건</div>
              <div className="num text-[15px] font-semibold text-ink">{packages.length}</div>
            </div>
            <div className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-1.5 text-center">
              <div className="text-[9px] text-faint">평균</div>
              <div className="num text-[15px] font-semibold" style={{ color: scoreColor(average) }}>
                {average}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-1.5 text-center">
              <div className="text-[9px] text-faint">최고</div>
              <div className="num text-[15px] font-semibold" style={{ color: scoreColor(best) }}>
                {best}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          <button type="button" onClick={onBack} className="btn btn-outline h-7 px-2.5 text-[10.5px]">
            <ArrowLeft size={11} /> 스튜디오로
          </button>
          <span className="chip bg-paper-deep px-2 py-0.5 text-[9.5px] text-muted">로컬 저장 · 최대 20건</span>
          <div className="ml-auto">
            {confirmClear ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[10px] text-risk">모두 지울까요?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClear();
                    setPicks([]);
                    setConfirmClear(false);
                  }}
                  className="btn h-6 bg-risk px-2 text-[10px] text-white"
                >
                  삭제
                </button>
                <button type="button" onClick={() => setConfirmClear(false)} className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted">
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={!packages.length}
                className="btn btn-ghost h-6 px-2 text-[10px] text-faint hover:text-risk disabled:opacity-40"
              >
                <Trash2 size={10} /> 전체 삭제
              </button>
            )}
          </div>
        </div>
      </Card>

      {selected.length >= 2 && (
        <Card className="overflow-hidden animate-rise">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <GitCompareArrows size={13} className="text-accent" />
            <span className="text-[12px] font-semibold">지원 건 비교</span>
            <div className="ml-auto flex flex-wrap gap-1">
              {selected.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setPicks(picks.filter((p) => p !== pkg.id))}
                  className="chip bg-paper-deep px-2 py-0.5 text-[9.5px] text-muted hover:text-ink"
                >
                  {pkg.company} <X size={9} />
                </button>
              ))}
            </div>
          </div>
          <div className={cx("grid divide-y divide-line sm:divide-x sm:divide-y-0", selected.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
            {selected.map((pkg) => (
              <div key={pkg.id} className="p-4">
                <div className="flex items-center gap-3">
                  <ScoreRing score={pkg.match.score} size={68} label="fit" />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-ink">{pkg.company}</div>
                    <div className="truncate text-[10px] text-muted">{pkg.role}</div>
                    <div className="mt-1 flex gap-1">
                      <span className="chip bg-ok-soft px-1.5 py-0.5 text-[8.5px] text-ok">매칭 {pkg.match.matchedCount}</span>
                      <span className="chip bg-risk-soft px-1.5 py-0.5 text-[8.5px] text-risk">미충족 {pkg.match.missingCount}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {pkg.match.subs.map((sub) => (
                    <div key={sub.id} className="flex items-center gap-2">
                      <span className="w-[50px] shrink-0 text-[9px] text-muted">{sub.label}</span>
                      <Meter value={sub.score} height={3} />
                      <span className="num w-5 text-right text-[9px] text-ink-2">{sub.score}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-[9px] text-faint">{fmtDate(pkg.createdAt)}</span>
                  <button type="button" onClick={() => onLoad(pkg)} className="flex items-center gap-0.5 text-[9.5px] font-semibold text-accent">
                    열기 <ArrowUpRight size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {packages.length === 0 ? (
        <Card className="grid place-items-center px-6 py-14 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-paper-deep text-faint">
            <BarChart3 size={18} />
          </div>
          <p className="mt-3 text-[13px] font-semibold text-ink">아직 저장된 패키지가 없습니다</p>
          <p className="mt-1 max-w-[320px] text-[11px] leading-relaxed text-muted">
            공고와 경력 원본을 넣고 패키지를 만들면 회사별 점수와 갭이 여기에 쌓입니다.
          </p>
          <button type="button" onClick={onBack} className="btn btn-accent mt-3 h-8 px-3 text-[11.5px]">
            스튜디오로 돌아가기
          </button>
        </Card>
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="text-[12px] font-semibold">지원 목록</span>
              <span className="text-[10px] text-muted">비교할 2~3건을 선택하세요</span>
            </div>
            <div className="divide-y divide-line">
              {packages.map((pkg) => {
                const picked = picks.includes(pkg.id);
                return (
                  <div key={pkg.id} className={cx("group flex items-center gap-2.5 px-4 py-3 transition-colors", picked ? "bg-accent-soft/40" : "hover:bg-[#fbfbf8]")}>
                    <button
                      type="button"
                      onClick={() => togglePick(pkg.id)}
                      aria-pressed={picked}
                      title="비교 대상으로 선택"
                      className={cx(
                        "grid h-4 w-4 shrink-0 place-items-center rounded border text-[8px] font-bold transition-colors",
                        picked ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-transparent hover:border-accent/50",
                      )}
                    >
                      <Check size={9} strokeWidth={3} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-ink">{pkg.company}</span>
                        <span className="truncate text-[10px] text-muted">{pkg.role}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[9px] text-faint">
                        <span>{fmtDate(pkg.createdAt)}</span>
                        <span className="text-line-strong">·</span>
                        <span>{pkg.match.tone.label}</span>
                        <span className="text-line-strong">·</span>
                        <span>매칭 {pkg.match.matchedCount}/{pkg.match.keywords.length}</span>
                      </div>
                    </div>
                    <div className="hidden w-24 shrink-0 sm:block">
                      <Meter value={pkg.match.score} height={4} />
                    </div>
                    <span className="num w-7 shrink-0 text-right text-[12px] font-semibold" style={{ color: scoreColor(pkg.match.score) }}>
                      {pkg.match.score}
                    </span>
                    <button
                      type="button"
                      onClick={() => onLoad(pkg)}
                      className="btn btn-ghost h-6 shrink-0 px-1.5 text-[10px] text-muted hover:text-ink"
                      aria-label={`${pkg.company} 패키지 열기`}
                    >
                      <ArrowUpRight size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(pkg.id)}
                      className="btn btn-ghost h-6 shrink-0 px-1.5 text-[10px] text-faint hover:text-risk"
                      aria-label="기록 삭제"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-3">
            <Card className="p-4">
              <SectionHead eyebrow="적합도" title="회사별 적합도" desc="생성 시점의 키워드 일치 기준" />
              <div className="mt-3 space-y-2.5">
                {[...packages]
                  .sort((a, b) => b.match.score - a.match.score)
                  .map((pkg) => (
                    <button key={pkg.id} type="button" onClick={() => onLoad(pkg)} className="block w-full text-left">
                      <div className="flex items-baseline justify-between">
                        <span className="truncate text-[10.5px] text-ink-2">{pkg.company}</span>
                        <span className="num text-[10px] font-semibold" style={{ color: scoreColor(pkg.match.score) }}>
                          {pkg.match.score}
                        </span>
                      </div>
                      <Meter value={pkg.match.score} height={4} className="mt-1" />
                    </button>
                  ))}
              </div>
            </Card>

            <Card className="p-4">
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">읽는 중</span>
              <h3 className="mt-1 text-[12.5px] font-semibold">어디에 지원할까</h3>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
                점수가 높아도 갭이 ‘자격 요건’에 몰려 있으면 서류에서 먼저 걸립니다. 점수와 미충족 키워드의 위치를 함께 보세요.
              </p>
              <ul className="mt-2.5 space-y-1.5">
                {packages.slice(0, 3).map((pkg) => {
                  const topGap = pkg.match.keywords.find((k) => k.status === "missing");
                  return (
                    <li key={pkg.id} className="flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                      <span>
                        <span className="font-medium text-ink-2">{pkg.company}</span> — {topGap ? `미충족 ‘${topGap.label}’ (${topGap.sectionLabel})` : "미충족 키워드 없음"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
