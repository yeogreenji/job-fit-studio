import { useMemo } from "react";
import { ArrowUpRight, Briefcase, CalendarClock, ClipboardList, ExternalLink, Layers, Target } from "lucide-react";
import type { ApplyStatus, HubJob } from "../types";
import { APPLY_STATUSES, STATUS_DOT } from "../lib/apply";
import { Card, Eyebrow, cx } from "./ui";

const deadlineSort = (a: HubJob, b: HubJob): number => {
  const av = a.job.deadline || "";
  const bv = b.job.deadline || "";
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv);
};

export function TrackerView({
  jobs,
  onUpdate,
  onOpenJob,
  onOpenStudio,
}: {
  jobs: HubJob[];
  onUpdate: (job: HubJob) => void;
  onOpenJob: (id: string) => void;
  onOpenStudio: () => void;
}) {
  const groups = useMemo(
    () => APPLY_STATUSES.map((status) => ({ status, items: jobs.filter((job) => job.status === status).sort(deadlineSort) })),
    [jobs],
  );
  const stats = useMemo(
    () => ({
      total: jobs.length,
      applied: jobs.filter((job) => job.status === "지원완료" || job.status === "서류합격" || job.status === "면접").length,
      passed: jobs.filter((job) => job.status === "서류합격" || job.status === "면접").length,
      interview: jobs.filter((job) => job.status === "면접").length,
    }),
    [jobs],
  );

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <Eyebrow>Application tracker</Eyebrow>
            <h1 className="mt-1 text-[18px] font-semibold tracking-[-0.03em]">지원 현황</h1>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              모은 공고의 지원 상태를 한눈에 봅니다. 카드에서 상태를 바꾸면 허브와 바로 동기화됩니다.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {[
              { label: "모은 공고", value: stats.total, color: "#111418" },
              { label: "지원 완료", value: stats.applied, color: "#2f5f8a" },
              { label: "서류 합격", value: stats.passed, color: "#0e6a58" },
              { label: "면접", value: stats.interview, color: "#16714f" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-1.5 text-center">
                <div className="text-[9px] text-faint">{item.label}</div>
                <div className="num text-[15px] font-semibold" style={{ color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {jobs.length === 0 ? (
        <Card className="grid place-items-center px-6 py-14 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-paper-deep text-faint">
            <ClipboardList size={18} />
          </div>
          <p className="mt-3 text-[13px] font-semibold text-ink">아직 모은 공고가 없습니다</p>
          <p className="mt-1 max-w-[340px] text-[11px] leading-relaxed text-muted">
            공고 허브에서 주소를 여러 개 불러오면 여기에 지원 상태별로 쌓입니다.
          </p>
          <button type="button" onClick={onOpenStudio} className="btn btn-accent mt-3 h-8 px-3 text-[11.5px]">
            <Target size={12} /> 공고 모으러 가기
          </button>
        </Card>
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {groups.map((group) => (
            <Card key={group.status} className="overflow-hidden" testId={`tracker-column-${group.status}`}>
              <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_DOT[group.status] }} />
                <span className="text-[11px] font-semibold text-ink">{group.status}</span>
                <span className="num ml-auto text-[10px] text-faint">{group.items.length}</span>
              </div>
              {group.items.length === 0 ? (
                <p className="px-3 py-4 text-[10px] text-faint">없음</p>
              ) : (
                <ul className="divide-y divide-line">
                  {group.items.map((job) => (
                    <li key={job.id} className="px-3 py-2" data-testid="tracker-card">
                      <button type="button" onClick={() => onOpenJob(job.id)} className="w-full text-left">
                        <span className="block truncate text-[11.5px] font-semibold text-ink">{job.job.company || "회사 미확인"}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-ink-2">{job.job.role || "직무 미확인"}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[9px] text-faint">
                          <CalendarClock size={9} /> {job.job.deadline || "마감 미확인"}
                        </span>
                        {job.memo && <span className="mt-0.5 line-clamp-2 block text-[9px] leading-relaxed text-muted">{job.memo}</span>}
                      </button>
                      <div className="mt-1.5 flex items-center gap-1">
                        <select
                          value={job.status}
                          onChange={(event) => onUpdate({ ...job, status: event.target.value as ApplyStatus, updatedAt: new Date().toISOString() })}
                          aria-label={`${job.job.company} 지원 상태`}
                          className="field field-sm w-[72px] py-0.5 text-[9.5px]"
                        >
                          {APPLY_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        {job.applyUrl && (
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost h-6 px-1 text-[9px] text-muted hover:text-accent-deep"
                            aria-label={`${job.job.company} 원문 지원 링크`}
                          >
                            <ExternalLink size={10} /> 원문
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenJob(job.id)}
                          className={cx("btn btn-ghost ml-auto h-6 px-1 text-[9px] text-muted")}
                          aria-label={`${job.job.company} 허브에서 열기`}
                        >
                          <ArrowUpRight size={10} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {jobs.length > 0 && (
        <Card className="flex flex-wrap items-center gap-2 px-4 py-2.5">
          <Layers size={12} className="text-muted" />
          <span className="text-[10px] leading-relaxed text-muted">
            마감이 가까운 공고부터 지원하세요. 면접·협상 준비가 필요하면 허브에서 공고를 열고 ‘심층 준비 열기’를 누르면 됩니다.
          </span>
          <button type="button" onClick={onOpenStudio} className="btn btn-outline ml-auto h-7 px-2.5 text-[10.5px]">
            <Briefcase size={11} /> 공고 허브
          </button>
        </Card>
      )}
    </div>
  );
}
