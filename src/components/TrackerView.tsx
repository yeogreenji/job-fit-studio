import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Briefcase,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Lock,
  GripVertical,
  Search,
  Target,
  X,
} from "lucide-react";
import type { ApplyStatus, FitResult, HubJob } from "../types";
import { STATUS_CHIP } from "../lib/apply";
import { ddayOf } from "../lib/collect";
import { Card, cx, scoreColor } from "./ui";

/**
 * 지원 파이프라인 — 관심 공고 → 지원 완료 → 서류 합격 → 면접 진행 → 최종 오퍼.
 *
 * 카드는 끌어 옮기거나 화살표로 단계를 바꿉니다. 허브의 공고 카드와 같은 데이터를
 * 쓰기 때문에 상태·메모가 즉시 동기화되고, 마감 D-day와 적합도가 카드에 함께 보입니다.
 */

interface Column {
  id: string;
  label: string;
  statuses: ApplyStatus[];
  /** 이 칸으로 옮길 때 넣는 상태 */
  target: ApplyStatus;
  tone: string;
  hint: string;
}

const COLUMNS: Column[] = [
  { id: "interest", label: "관심 공고", statuses: ["지원 전", "준비중"], target: "준비중", tone: "#a4680c", hint: "담아 두고 준비 중" },
  { id: "applied", label: "지원 완료", statuses: ["지원완료"], target: "지원완료", tone: "#2f5f8a", hint: "제출했다" },
  { id: "docs", label: "서류 합격", statuses: ["서류합격"], target: "서류합격", tone: "#0e6a58", hint: "면접 준비 시작" },
  { id: "interview", label: "면접 진행", statuses: ["면접"], target: "면접", tone: "#16714f", hint: "질문·협상 준비" },
  { id: "offer", label: "최종 오퍼", statuses: ["오퍼"], target: "오퍼", tone: "#5b3b9b", hint: "처우 협의" },
];

const columnOf = (status: ApplyStatus): Column => COLUMNS.find((column) => column.statuses.includes(status)) ?? COLUMNS[0];

const DDAY_STYLE: Record<ReturnType<typeof ddayOf>["tone"], string> = {
  over: "bg-paper-deep text-faint",
  soon: "bg-risk-soft text-risk",
  ok: "bg-paper-deep text-muted",
  none: "bg-paper-deep text-faint",
};

function FitChip({ fit }: { fit: FitResult | undefined }) {
  if (!fit || fit.needsProfile) return null;
  return (
    <span
      className="num chip bg-surface text-[9px]"
      style={{ color: scoreColor(fit.score), border: "1px solid currentColor" }}
      title={fit.reasons.join(" · ")}
      data-testid="pipeline-fit"
    >
      {fit.score}%
    </span>
  );
}

export function TrackerView({
  jobs,
  fits,
  onUpdate,
  onOpenJob,
  onOpenStudio,
  pipelineLimit,
  onOpenPricing,
  canExport,
  onExport,
}: {
  jobs: HubJob[];
  fits: Record<string, FitResult>;
  onUpdate: (job: HubJob) => void;
  onOpenJob: (id: string) => void;
  onOpenStudio: () => void;
  pipelineLimit?: number;
  onOpenPricing?: () => void;
  /** 프리미엄 — 지원 현황 CSV 내보내기 */
  canExport?: boolean;
  onExport?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [soonOnly, setSoonOnly] = useState(false);
  const [fitOnly, setFitOnly] = useState(false);
  const [source, setSource] = useState("전체");
  const [memoOpen, setMemoOpen] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const sourceOptions = useMemo(() => {
    const names = jobs.map((job) => job.source.site).filter((name): name is string => Boolean(name));
    return ["전체", ...new Set(names)];
  }, [jobs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (needle) {
        const haystack = `${job.job.company} ${job.job.role} ${job.memo}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (source !== "전체" && job.source.site !== source) return false;
      if (soonOnly) {
        const dday = ddayOf(job.job.deadline);
        if (dday.days === null || dday.days < 0 || dday.days > 7) return false;
      }
      if (fitOnly) {
        const fit = fits[job.id];
        if (!fit || fit.needsProfile || fit.score < 60) return false;
      }
      return true;
    });
  }, [fits, fitOnly, jobs, query, soonOnly, source]);

  const groups = useMemo(
    () =>
      COLUMNS.map((column) => ({
        column,
        items: filtered
          .filter((job) => column.statuses.includes(job.status))
          .sort((a, b) => {
            const ad = ddayOf(a.job.deadline).days;
            const bd = ddayOf(b.job.deadline).days;
            if (ad === null && bd === null) return 0;
            if (ad === null) return 1;
            if (bd === null) return -1;
            return ad - bd;
          }),
      })),
    [filtered],
  );

  const stats = useMemo(
    () => ({
      total: jobs.length,
      applied: jobs.filter((job) => job.status === "지원완료" || job.status === "서류합격" || job.status === "면접" || job.status === "오퍼").length,
      passed: jobs.filter((job) => job.status === "서류합격" || job.status === "면접" || job.status === "오퍼").length,
      interview: jobs.filter((job) => job.status === "면접").length,
      offer: jobs.filter((job) => job.status === "오퍼").length,
    }),
    [jobs],
  );

  const moveTo = (job: HubJob, columnId: string) => {
    const column = COLUMNS.find((item) => item.id === columnId);
    if (!column || job.status === column.target) return;
    onUpdate({ ...job, status: column.target, saved: true, updatedAt: new Date().toISOString() });
  };

  const moveBy = (job: HubJob, delta: number) => {
    const index = COLUMNS.findIndex((column) => column.id === columnOf(job.status).id);
    const next = COLUMNS[Math.min(COLUMNS.length - 1, Math.max(0, index + delta))];
    if (next) moveTo(job, next.id);
  };

  const activeFilters = Boolean(query.trim() || soonOnly || fitOnly || source !== "전체");

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold tracking-[-0.02em]">지원 파이프라인</h1>
            <p className="mt-1 max-w-[520px] text-[11.5px] leading-relaxed text-muted">
              관심 공고부터 최종 오퍼까지 다섯 단계로 관리합니다. 카드를 끌어 옮기면 허브의 공고 상태도 바로 바뀝니다.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {[
              { label: "모은 공고", value: stats.total, color: "#111418" },
              { label: "지원 완료", value: stats.applied, color: "#2f5f8a" },
              { label: "서류 합격", value: stats.passed, color: "#0e6a58" },
              { label: "면접", value: stats.interview, color: "#16714f" },
              { label: "오퍼", value: stats.offer, color: "#5b3b9b" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-line bg-[#fcfcfa] px-2.5 py-1.5 text-center">
                <div className="text-[9px] text-faint">{item.label}</div>
                <div className="num text-[15px] font-semibold" style={{ color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
          <div className="relative min-w-[160px] flex-1">
            <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="field field-sm pl-7 text-[11px]"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="회사·직무·메모로 찾기"
              data-testid="pipeline-search"
              aria-label="파이프라인 검색"
            />
          </div>
          <select
            className="field field-sm w-[104px] py-1 text-[10.5px]"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            data-testid="pipeline-source"
            aria-label="공고 출처"
          >
            {sourceOptions.map((name) => (
              <option key={name} value={name}>
                {name === "전체" ? "출처 전체" : name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSoonOnly((prev) => !prev)}
            aria-pressed={soonOnly}
            data-testid="pipeline-soon"
            className={cx(
              "rounded-lg border px-2 py-1 text-[10px] font-semibold",
              soonOnly ? "border-risk/30 bg-risk-soft text-risk" : "border-line bg-surface text-muted hover:border-line-strong",
            )}
          >
            <CalendarClock size={10} className="mr-1 inline" /> 마감 7일 이내
          </button>
          <button
            type="button"
            onClick={() => setFitOnly((prev) => !prev)}
            aria-pressed={fitOnly}
            data-testid="pipeline-fit-only"
            className={cx(
              "rounded-lg border px-2 py-1 text-[10px] font-semibold",
              fitOnly ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-surface text-muted hover:border-line-strong",
            )}
          >
            적합도 60%+
          </button>
          {activeFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSoonOnly(false);
                setFitOnly(false);
                setSource("전체");
              }}
              className="btn btn-ghost h-7 px-1.5 text-[10px] text-muted"
            >
              <X size={10} /> 초기화
            </button>
          )}
          {canExport ? (
            <button
              type="button"
              onClick={onExport}
              className="btn btn-outline h-7 px-2 text-[10px]"
              data-testid="pipeline-export"
              title="회사·직무·상태·마감·메모를 CSV로 내려받습니다"
            >
              <Download size={10} /> CSV 내보내기
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenPricing}
              className="btn btn-ghost h-7 px-2 text-[10px] text-muted"
              data-testid="pipeline-export-locked"
              title="프리미엄 커리어 패스에서 열립니다"
            >
              <Lock size={10} /> CSV · 프리미엄
            </button>
          )}
          <span className="num ml-auto text-[9.5px] text-faint" data-testid="pipeline-count">
            {filtered.length}/{jobs.length}
          </span>
          {pipelineLimit !== undefined && Number.isFinite(pipelineLimit) && (
            <span className="flex items-center gap-1 text-[9px] text-faint" data-testid="pipeline-limit" data-limit={pipelineLimit}>
              Free {pipelineLimit}건 한도
              <button
                type="button"
                onClick={onOpenPricing}
                className="rounded bg-ink px-1.5 py-0.5 text-[8.5px] font-semibold text-white"
                data-testid="pipeline-upgrade"
              >
                {jobs.length >= pipelineLimit ? "무제한으로" : "업그레이드"}
              </button>
            </span>
          )}
        </div>
      </Card>

      {jobs.length === 0 ? (
        <Card className="grid place-items-center px-6 py-14 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-paper-deep text-faint">
            <ClipboardList size={18} />
          </div>
          <p className="mt-3 text-[13px] font-semibold text-ink">아직 담은 공고가 없습니다</p>
          <p className="mt-1 max-w-[340px] text-[11px] leading-relaxed text-muted">
            공고 허브에서 카드의 북마크를 누르면 관심 공고로 들어와 여기서 단계를 관리할 수 있습니다.
          </p>
          <button type="button" onClick={onOpenStudio} className="btn btn-accent mt-3 h-8 px-3 text-[11.5px]">
            <Target size={12} /> 공고 모으러 가기
          </button>
        </Card>
      ) : (
        <div className="-mx-1 flex snap-x items-start gap-2.5 overflow-x-auto px-1 pb-2 scroll-thin xl:grid xl:grid-cols-5 xl:overflow-visible">
          {groups.map(({ column, items }) => (
            <Card
              key={column.id}
              className="min-w-[258px] shrink-0 snap-start overflow-hidden xl:min-w-0"
              testId={`tracker-column-${column.id}`}
              as="section"
            >
              <div
                className="flex items-center gap-1.5 border-b border-line px-3 py-2"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  const job = jobs.find((item) => item.id === dragId);
                  if (job) moveTo(job, column.id);
                  setDragId(null);
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: column.tone }} />
                <span className="text-[11px] font-semibold text-ink">{column.label}</span>
                <span className="num ml-auto rounded-full bg-paper-deep px-1.5 py-0.5 text-[9.5px] text-muted">{items.length}</span>
              </div>

              {items.length === 0 ? (
                <div className="px-3 py-5 text-center">
                  <p className="text-[10px] text-faint">없음</p>
                  <p className="mt-0.5 text-[9px] text-faint">{column.hint}</p>
                </div>
              ) : (
                <ul className="space-y-1.5 p-2">
                  {items.map((job) => {
                    const dday = ddayOf(job.job.deadline);
                    return (
                      <li
                        key={job.id}
                        draggable
                        onDragStart={() => setDragId(job.id)}
                        onDragEnd={() => setDragId(null)}
                        data-testid="tracker-card"
                        data-job-id={job.id}
                        className={cx(
                          "rounded-lg border border-line bg-surface p-2 transition-shadow",
                          dragId === job.id && "opacity-60",
                        )}
                      >
                        <div className="flex items-start gap-1">
                          <GripVertical size={11} className="mt-0.5 shrink-0 cursor-grab text-faint" aria-hidden />
                          <button type="button" onClick={() => onOpenJob(job.id)} className="min-w-0 flex-1 text-left">
                            <span className="block truncate text-[11.5px] font-semibold text-ink">{job.job.company || "회사 미확인"}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-ink-2">{job.job.role || "직무 미확인"}</span>
                          </button>
                          <FitChip fit={fits[job.id]} />
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className={cx("chip px-1.5 py-0 text-[9px]", DDAY_STYLE[dday.tone])} data-testid="pipeline-dday">
                            <CalendarClock size={8} /> {dday.label}
                          </span>
                          <span className={cx("chip px-1.5 py-0 text-[9px]", STATUS_CHIP[job.status])}>{job.status}</span>
                        </div>

                        {memoOpen === job.id ? (
                          <textarea
                            className="field field-sm mt-1 min-h-[52px] text-[10px] leading-relaxed"
                            value={job.memo}
                            autoFocus
                            onChange={(event) => onUpdate({ ...job, memo: event.target.value, updatedAt: new Date().toISOString() })}
                            placeholder="면접 일정, 담당자, 준비할 것"
                            data-testid="pipeline-memo"
                          />
                        ) : (
                          job.memo && <p className="mt-1 line-clamp-2 text-[9px] leading-relaxed text-muted">{job.memo}</p>
                        )}

                        <div className="mt-1 flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveBy(job, -1)}
                            className="btn btn-ghost h-6 px-1 text-[9px] text-muted"
                            aria-label={`${job.job.company} 이전 단계`}
                            data-testid="pipeline-prev"
                          >
                            <ChevronLeft size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBy(job, 1)}
                            className="btn btn-ghost h-6 px-1 text-[9px] text-muted"
                            aria-label={`${job.job.company} 다음 단계`}
                            data-testid="pipeline-next"
                          >
                            <ChevronRight size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMemoOpen((prev) => (prev === job.id ? null : job.id))}
                            className={cx("btn btn-ghost h-6 px-1 text-[9px]", memoOpen === job.id ? "text-accent-deep" : "text-muted")}
                            data-testid="pipeline-memo-toggle"
                          >
                            메모
                          </button>
                          <span className="ml-auto flex items-center gap-0.5">
                            {job.applyUrl && (
                              <a
                                href={job.applyUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-ghost h-6 px-1 text-[9px] text-muted hover:text-accent-deep"
                                aria-label={`${job.job.company} 원문 지원 링크`}
                              >
                                <ExternalLink size={10} />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpenJob(job.id)}
                              className="btn btn-ghost h-6 px-1 text-[9px] text-muted"
                              aria-label={`${job.job.company} 허브에서 열기`}
                            >
                              <ArrowUpRight size={10} />
                            </button>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {jobs.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <Briefcase size={12} className="text-muted" />
          <span className="text-[10px] leading-relaxed text-muted">
            면접·협상 준비는 허브에서 공고를 열고 ‘지원 패키지’에서 바로 만듭니다. 단계를 바꾸면 허브의 공고 상태도 함께 바뀝니다.
          </span>
          <button type="button" onClick={onOpenStudio} className="btn btn-outline ml-auto h-7 px-2.5 text-[10.5px]">
            <Briefcase size={11} /> 공고 허브
          </button>
        </Card>
      )}
    </div>
  );
}
