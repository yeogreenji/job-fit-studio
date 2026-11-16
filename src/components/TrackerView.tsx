import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Briefcase,
  Check,
  ClipboardList,
  Plus,
  Save,
  Target,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { ApplicationEntry, JobPackage, Stage } from "../types";
import { NEGOTIATION_TEMPLATE, STAGES } from "../lib/storage";
import { Card, Eyebrow, Meter, SectionHead, cx, scoreColor } from "./ui";

const STAGE_STYLE: Record<Stage, string> = {
  준비중: "bg-paper-deep text-muted",
  서류: "bg-info-soft text-info",
  "1차": "bg-accent-soft text-accent-deep",
  "2차": "bg-[#f1ecf8] text-[#5b4180]",
  최종: "bg-warn-soft text-warn",
  오퍼: "bg-ok-soft text-ok",
};

const won = (value: number | null) => (value === null || Number.isNaN(value) ? "—" : `${value.toLocaleString()}만원`);

export function TrackerView({
  entries,
  packages,
  onUpdate,
  onAdd,
  onDelete,
  onLoadPackage,
  onOpenStudio,
}: {
  entries: ApplicationEntry[];
  packages: JobPackage[];
  onUpdate: (entry: ApplicationEntry) => void;
  onAdd: (company: string, role: string, deadline: string) => void;
  onDelete: (id: string) => void;
  onLoadPackage: (pkg: JobPackage) => void;
  onOpenStudio: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const [draft, setDraft] = useState({ company: "", role: "", deadline: "" });

  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0] ?? null;
  const stats = useMemo(() => {
    const interviewing = entries.filter((entry) => ["1차", "2차", "최종"].includes(entry.stage)).length;
    const offers = entries.filter((entry) => entry.stage === "오퍼").length;
    const scored = entries.filter((entry) => typeof entry.score === "number");
    const average = scored.length ? Math.round(scored.reduce((sum, entry) => sum + (entry.score ?? 0), 0) / scored.length) : 0;
    return { total: entries.length, interviewing, offers, average };
  }, [entries]);

  const patch = (entry: ApplicationEntry, next: Partial<ApplicationEntry>) =>
    onUpdate({ ...entry, ...next, updatedAt: new Date().toISOString() });

  const linkPackage = (entry: ApplicationEntry) => packages.find((pkg) => pkg.id === entry.packageId || (pkg.company === entry.company && pkg.role === entry.role));

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <Eyebrow>Application tracker</Eyebrow>
            <h1 className="mt-1 text-[18px] font-semibold tracking-[-0.03em]">지원 현황 트래커</h1>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              회사별 진행 단계와 연봉·처우 협상 포인트를 한 곳에서 관리합니다. 패키지를 만들면 자동으로 추가됩니다.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {[
              { label: "지원 건", value: stats.total, color: "#111418" },
              { label: "면접 중", value: stats.interviewing, color: "#2f5f8a" },
              { label: "오퍼", value: stats.offers, color: "#0e6a58" },
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

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[9.5px] font-semibold text-muted">회사</div>
            <input
              className="field field-sm"
              value={draft.company}
              onChange={(event) => setDraft({ ...draft, company: event.target.value })}
              placeholder="예: 클라우드플로우"
              data-testid="tracker-company"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[9.5px] font-semibold text-muted">직무</div>
            <input
              className="field field-sm"
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
              placeholder="예: 인하우스 PR 매니저"
              data-testid="tracker-role"
            />
          </div>
          <div className="w-[110px]">
            <div className="mb-1 text-[9.5px] font-semibold text-muted">마감</div>
            <input className="field field-sm" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} placeholder="상시" />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!draft.company.trim()) return;
              onAdd(draft.company.trim(), draft.role.trim(), draft.deadline.trim());
              setDraft({ company: "", role: "", deadline: "" });
            }}
            disabled={!draft.company.trim()}
            className="btn btn-primary h-8 px-3 text-[11px] disabled:opacity-50"
            data-testid="tracker-add"
          >
            <Plus size={12} /> 추가
          </button>
        </div>
      </Card>

      {entries.length === 0 ? (
        <Card className="grid place-items-center px-6 py-14 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-paper-deep text-faint">
            <ClipboardList size={18} />
          </div>
          <p className="mt-3 text-[13px] font-semibold text-ink">아직 지원 건이 없습니다</p>
          <p className="mt-1 max-w-[340px] text-[11px] leading-relaxed text-muted">
            공고와 이력서로 패키지를 만들면 이 회사가 자동으로 추가됩니다. 직접 추가해도 됩니다.
          </p>
          <button type="button" onClick={onOpenStudio} className="btn btn-accent mt-3 h-8 px-3 text-[11.5px]">
            <Target size={12} /> 스튜디오로 돌아가기
          </button>
        </Card>
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="overflow-hidden" testId="tracker-list">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="text-[12px] font-semibold">지원 목록</span>
              <span className="text-[10px] text-muted">단계를 바꾸면 바로 저장됩니다</span>
            </div>
            <div className="divide-y divide-line">
              {entries.map((entry) => {
                const active = selected?.id === entry.id;
                return (
                  <div
                    key={entry.id}
                    className={cx("flex flex-wrap items-center gap-2 px-3.5 py-2.5 transition-colors", active ? "bg-accent-soft/40" : "hover:bg-[#fbfbf8]")}
                    data-testid="tracker-row"
                  >
                    <button type="button" onClick={() => setSelectedId(entry.id)} className="min-w-0 flex-1 text-left">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-ink">{entry.company}</span>
                        <span className="truncate text-[10px] text-muted">{entry.role || "직무 미입력"}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] text-faint">
                        {entry.deadline && <span>{entry.deadline}</span>}
                        {entry.nextAction && <span>· 다음: {entry.nextAction}</span>}
                        {!entry.deadline && !entry.nextAction && <span>메모 없음</span>}
                      </span>
                    </button>
                    <span className={cx("chip shrink-0 px-1.5 py-0.5 text-[9px]", STAGE_STYLE[entry.stage])}>{entry.stage}</span>
                    <select
                      value={entry.stage}
                      onChange={(event) => patch(entry, { stage: event.target.value as Stage })}
                      aria-label={`${entry.company} 진행 단계`}
                      className="field field-sm w-[74px] shrink-0 py-1 text-[10.5px]"
                    >
                      {STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                    {typeof entry.score === "number" ? (
                      <span className="num w-7 shrink-0 text-right text-[11px] font-semibold" style={{ color: scoreColor(entry.score) }}>
                        {entry.score}
                      </span>
                    ) : (
                      <span className="num w-7 shrink-0 text-right text-[10px] text-faint">—</span>
                    )}
                    {linkPackage(entry) && (
                      <button
                        type="button"
                        onClick={() => {
                          const pkg = linkPackage(entry);
                          if (pkg) onLoadPackage(pkg);
                        }}
                        className="btn btn-ghost h-6 shrink-0 px-1.5 text-[10px] text-muted hover:text-ink"
                        aria-label={`${entry.company} 패키지 열기`}
                      >
                        <ArrowUpRight size={11} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(entry.id);
                        if (selected?.id === entry.id) setSelectedId(null);
                      }}
                      className="btn btn-ghost h-6 shrink-0 px-1.5 text-[10px] text-faint hover:text-risk"
                      aria-label="지원 건 삭제"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>

          {selected && (
            <div className="space-y-3" data-testid="tracker-detail">
              <Card className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Eyebrow>Detail</Eyebrow>
                    <h2 className="mt-1 truncate text-[14px] font-semibold">{selected.company}</h2>
                    <p className="truncate text-[10.5px] text-muted">{selected.role || "직무 미입력"}</p>
                  </div>
                  {typeof selected.score === "number" && (
                    <span className="num shrink-0 rounded-md px-2 py-1 text-[13px] font-semibold" style={{ color: scoreColor(selected.score), background: `${scoreColor(selected.score)}12` }}>
                      {selected.score}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <div className="mb-1.5 text-[9.5px] font-semibold text-muted">진행 단계</div>
                  <div className="flex flex-wrap gap-1">
                    {STAGES.map((stage, index) => {
                      const done = STAGES.indexOf(selected.stage) >= index;
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => patch(selected, { stage })}
                          aria-pressed={selected.stage === stage}
                          className={cx(
                            "rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors",
                            selected.stage === stage ? "border-ink bg-ink text-white" : done ? "border-accent/30 bg-accent-soft text-accent-deep" : "border-line bg-surface text-muted hover:border-line-strong",
                          )}
                        >
                          {stage}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {[
                    { key: "current" as const, label: "현재 연봉" },
                    { key: "hope" as const, label: "희망 연봉" },
                    { key: "offered" as const, label: "제시 연봉" },
                  ].map((field) => (
                    <div key={field.key}>
                      <div className="mb-1 text-[9px] font-semibold text-muted">{field.label}</div>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={100}
                        className="field field-sm num text-right text-[11px]"
                        value={selected.salary[field.key] ?? ""}
                        placeholder="만원"
                        onChange={(event) => {
                          const value = event.target.value === "" ? null : Math.max(0, Math.round(Number(event.target.value)));
                          patch(selected, { salary: { ...selected.salary, [field.key]: value } });
                        }}
                        aria-label={`${field.label}(만원)`}
                      />
                    </div>
                  ))}
                </div>
                {selected.salary.hope !== null && selected.salary.offered !== null && (
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted">
                    <TrendingUp size={10} className="text-accent" />
                    제시가 희망보다 {won(selected.salary.offered - selected.salary.hope)}
                    {selected.salary.offered - selected.salary.hope === 0 ? " (일치)" : ""}
                    {selected.salary.offered - selected.salary.hope > 0 ? " 높습니다" : " 낮습니다"}
                  </p>
                )}

                <div className="mt-3 grid gap-1.5">
                  <div>
                    <div className="mb-1 text-[9px] font-semibold text-muted">다음 할 일</div>
                    <input
                      className="field field-sm"
                      value={selected.nextAction}
                      onChange={(event) => patch(selected, { nextAction: event.target.value })}
                      placeholder="예: 11/20 1차 면접 준비, 포트폴리오 3장 정리"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[9px] font-semibold text-muted">메모</div>
                    <textarea
                      className="field field-sm min-h-[64px] leading-relaxed"
                      value={selected.memo}
                      onChange={(event) => patch(selected, { memo: event.target.value })}
                      placeholder="면접관 이름, 물어본 내용, 느낌"
                    />
                  </div>
                </div>
                <p className="mt-2 flex items-center gap-1 text-[9px] text-faint">
                  <Save size={9} /> 자동 저장 · {new Date(selected.updatedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </p>
              </Card>

              <Card className="p-4" testId="negotiation">
                <SectionHead eyebrow="Negotiation" title="처우 협상 체크리스트" desc="오퍼 단계에서 하나씩 확인하세요." />
                <ul className="mt-3 space-y-1.5">
                  {NEGOTIATION_TEMPLATE.map((template) => {
                    const item = selected.negotiation.find((entry) => entry.id === template.id);
                    const done = Boolean(item?.done);
                    return (
                      <li key={template.id}>
                        <button
                          type="button"
                          onClick={() =>
                            patch(selected, {
                              negotiation: selected.negotiation.map((entry) => (entry.id === template.id ? { ...entry, done: !entry.done } : entry)),
                            })
                          }
                          aria-pressed={done}
                          className="flex w-full items-start gap-2 text-left"
                        >
                          <span
                            className={cx(
                              "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                              done ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-transparent",
                            )}
                          >
                            <Check size={10} />
                          </span>
                          <span className={cx("text-[10.5px] leading-snug", done ? "text-faint line-through" : "text-ink-2")}>{template.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 border-t border-line pt-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-muted">협상 준비도</span>
                    <span className="num text-[11px] font-semibold text-accent-deep">
                      {Math.round((selected.negotiation.filter((item) => item.done).length / NEGOTIATION_TEMPLATE.length) * 100)}%
                    </span>
                  </div>
                  <Meter
                    value={(selected.negotiation.filter((item) => item.done).length / NEGOTIATION_TEMPLATE.length) * 100}
                    className="mt-1.5"
                    color="#0e6a58"
                  />
                </div>
                <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-paper-deep px-2.5 py-2">
                  <Wallet size={11} className="mt-0.5 shrink-0 text-muted" />
                  <p className="text-[9.5px] leading-relaxed text-muted">
                    제시 연봉을 받으면 총액만 보지 말고 베이스·인센티브·사이닝·스톡 비중을 나눠 비교하세요. 구두 합의는 오퍼레터 문장으로
                    확인되기 전까지 확정이 아닙니다.
                  </p>
                </div>
              </Card>

              <Card className="p-3.5">
                <div className="flex items-center gap-2">
                  <Briefcase size={12} className="text-accent" />
                  <span className="text-[11px] font-semibold">연결된 패키지</span>
                  <span className="ml-auto">
                    {linkPackage(selected) ? (
                      <button
                        type="button"
                        onClick={() => {
                          const pkg = linkPackage(selected);
                          if (pkg) onLoadPackage(pkg);
                        }}
                        className="btn btn-outline h-7 px-2 text-[10.5px]"
                      >
                        <ArrowUpRight size={11} /> 열기
                      </button>
                    ) : (
                      <button type="button" onClick={onOpenStudio} className="btn btn-outline h-7 px-2 text-[10.5px]">
                        <Target size={11} /> 패키지 만들기
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-1 text-[9.5px] leading-relaxed text-faint">
                  {linkPackage(selected) ? "이 지원 건에 연결된 지원 패키지가 있습니다." : "아직 이 회사로 만든 패키지가 없습니다. 스튜디오에서 공고를 넣고 생성하세요."}
                </p>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
