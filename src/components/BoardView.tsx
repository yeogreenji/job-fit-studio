import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowRight, Check, ExternalLink, Link2, Loader2, Play, SkipForward, Sparkles, Trash2, X } from "lucide-react";
import type { AiConfig, MasterResume } from "../types";
import {
  BOARD_STATUS_LABEL,
  COLLECTOR_BOOKMARKLET,
  collectTexts,
  collectUrls,
  daysLeft,
  extractUrls,
  splitPostings,
  type BoardFailure,
  type BoardPosting,
  type BoardStatus,
} from "../lib/board";
import { searchLinks } from "../lib/recommend";
import { matchResume, buildSummary } from "../lib/engine";
import { CopyButton, cx, scoreColor } from "./ui";

type Sort = "score" | "deadline" | "recent";
type Filter = BoardStatus | "all";

const STATUS_ORDER: BoardStatus[] = ["new", "interested", "applied", "skip"];

function Dday({ deadline }: { deadline: string }) {
  const d = daysLeft(deadline);
  if (d === null) return deadline ? <span className="text-faint">{deadline}</span> : <span className="text-faint">마감 정보 없음</span>;
  if (d < 0) return <span className="text-faint">마감됨</span>;
  return <span className={cx(d <= 3 ? "font-semibold text-risk" : "text-muted")}>D-{d}</span>;
}

export function BoardView({
  resume,
  resumeOk,
  config,
  postings,
  setPostings,
  keywords,
  onOpenResume,
  onCoach,
  onApplied,
  notify,
}: {
  resume: MasterResume;
  resumeOk: boolean;
  config: AiConfig;
  postings: BoardPosting[];
  setPostings: Dispatch<SetStateAction<BoardPosting[]>>;
  keywords: string[];
  onOpenResume: () => void;
  onCoach: (posting: BoardPosting) => void;
  onApplied: (posting: BoardPosting) => void;
  notify: (message: string, tone?: "ok" | "warn" | "err") => void;
}) {
  const [tab, setTab] = useState<"urls" | "text" | "search">("urls");
  const [urlText, setUrlText] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<BoardFailure[]>([]);
  const [paste, setPaste] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<Sort>("score");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<string[] | null>(null);
  const [qi, setQi] = useState(0);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);

  const urls = useMemo(() => extractUrls(urlText), [urlText]);
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: postings.length, new: 0, interested: 0, applied: 0, skip: 0 };
    for (const p of postings) c[p.status] += 1;
    return c;
  }, [postings]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = postings.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (p.score < minScore) return false;
      if (!q) return true;
      return `${p.job.company} ${p.job.role} ${p.job.location}`.toLowerCase().includes(q);
    });
    list.sort((a, b) => {
      if (sort === "score") return b.score - a.score;
      if (sort === "recent") return b.addedAt.localeCompare(a.addedAt);
      const da = daysLeft(a.job.deadline) ?? 9_999;
      const db = daysLeft(b.job.deadline) ?? 9_999;
      return da - db;
    });
    return list;
  }, [postings, filter, minScore, query, sort]);

  const patch = (id: string, change: Partial<BoardPosting>) =>
    setPostings((prev) => prev.map((p) => (p.id === id ? { ...p, ...change } : p)));

  const addPostings = (added: BoardPosting[]) => setPostings((prev) => [...added, ...prev]);

  const runCollect = async () => {
    if (!resumeOk) {
      notify("이력서를 먼저 등록해야 적합도를 계산할 수 있습니다.", "warn");
      onOpenResume();
      return;
    }
    if (urls.length === 0) return;
    setBusy({ done: 0, total: urls.length });
    const result = await collectUrls(urls.slice(0, 30), {
      resume,
      config,
      existing: postings,
      onProgress: (done, total) => setBusy({ done, total }),
    });
    setBusy(null);
    if (result.added.length) addPostings(result.added);
    setFailures((prev) => [...result.failed, ...prev]);
    setUrlText("");
    notify(
      `공고 ${result.added.length}건 추가${result.failed.length ? ` · 읽지 못함 ${result.failed.length}건` : ""}${result.duplicates ? ` · 중복 ${result.duplicates}건 제외` : ""}`,
      result.failed.length && !result.added.length ? "err" : result.failed.length ? "warn" : "ok",
    );
  };

  const runBulkText = () => {
    if (!resumeOk) {
      notify("이력서를 먼저 등록해야 적합도를 계산할 수 있습니다.", "warn");
      onOpenResume();
      return;
    }
    const parts = splitPostings(bulkText);
    if (parts.length === 0) {
      notify("공고 본문을 붙여넣어 주세요. 여러 건은 ‘===’ 줄로 구분합니다.", "warn");
      return;
    }
    addPostings(collectTexts(parts, resume));
    setBulkText("");
    notify(`공고 ${parts.length}건을 추가했습니다.`);
  };

  const rescue = (failure: BoardFailure) => {
    const text = (paste[failure.id] ?? failure.excerpt ?? "").trim();
    if (text.length < 40) {
      notify("공고 본문을 조금 더 붙여넣어 주세요.", "warn");
      return;
    }
    addPostings(collectTexts([text], resume, failure.url));
    setFailures((prev) => prev.filter((f) => f.id !== failure.id));
    notify("본문으로 공고를 추가했습니다.");
  };

  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startQueue = (ids: string[]) => {
    if (ids.length === 0) return;
    setQueue(ids);
    setQi(0);
  };

  const topIds = (n: number) =>
    shown
      .filter((p) => p.status !== "applied" && p.status !== "skip")
      .slice(0, n)
      .map((p) => p.id);

  const current = queue ? postings.find((p) => p.id === queue[qi]) : undefined;
  const nextInQueue = () => {
    if (!queue) return;
    if (qi + 1 >= queue.length) {
      setQueue(null);
      setPicked(new Set());
      notify("지원 큐를 마쳤습니다.");
    } else setQi(qi + 1);
  };

  return (
    <div data-testid="board-view">
      {/* 수집 */}
      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">공고 한꺼번에 모으기</h2>
          <div className="seg ml-auto" role="tablist">
            {(
              [
                ["urls", "URL 여러 개"],
                ["text", "본문 여러 개"],
                ["search", "검색·링크 수집"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" className="seg-item" data-active={tab === id} onClick={() => setTab(id)} data-testid={`collect-tab-${id}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab === "urls" && (
          <div className="mt-3">
            <textarea
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              rows={5}
              className="field text-[12.5px]"
              placeholder={"공고 URL을 여러 줄로 붙여넣으세요. 한 번에 30개까지 읽습니다.\nhttps://www.wanted.co.kr/wd/123456\nhttps://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=…"}
              data-testid="board-urls"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void runCollect()} disabled={urls.length === 0 || Boolean(busy)} className="btn btn-accent h-9 px-3 text-[12px] disabled:opacity-50" data-testid="board-collect">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                {busy ? `읽는 중 ${busy.done}/${busy.total}` : `공고 ${urls.length}건 읽고 점수 매기기`}
              </button>
              <span className="text-[11.5px] text-muted">로그인이 필요하거나 수집을 막는 사이트는 실패 목록에서 본문을 붙여넣어 주세요.</span>
            </div>
          </div>
        )}

        {tab === "text" && (
          <div className="mt-3">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={7}
              className="field text-[12.5px]"
              placeholder={"공고 본문을 붙여넣고, 다음 공고와는 ‘===’만 적은 줄로 구분하세요."}
              data-testid="board-bulk"
            />
            <button type="button" onClick={runBulkText} disabled={bulkText.trim().length < 40} className="btn btn-accent mt-2 h-9 px-3 text-[12px] disabled:opacity-50" data-testid="board-bulk-add">
              <Sparkles size={13} /> 본문으로 추가
            </button>
          </div>
        )}

        {tab === "search" && (
          <div className="mt-3 space-y-3 text-[12px] text-ink-2">
            <p className="leading-relaxed">
              포털의 검색 결과를 서버가 대신 긁으면 약관·차단 문제가 생깁니다. 대신 <b>내 브라우저에서</b> 검색 결과 링크를 한 번에 복사해 붙여넣는 방식을 씁니다.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>
                아래 <b>‘공고 링크 복사’</b> 버튼을 북마크바로 끌어다 놓습니다.
                {" "}
                <a
                  ref={(el) => {
                    (bookmarkRef as { current: HTMLAnchorElement | null }).current = el;
                    if (el) el.setAttribute("href", COLLECTOR_BOOKMARKLET);
                  }}
                  className="btn btn-outline ml-1 inline-flex h-7 px-2 text-[11.5px]"
                  onClick={(e) => e.preventDefault()}
                  draggable
                  data-testid="bookmarklet"
                >
                  공고 링크 복사
                </a>
              </li>
              <li>아래 검색 링크로 포털을 열고, 필터를 걸어 목록을 띄운 뒤 북마크를 누릅니다.</li>
              <li>복사된 링크를 ‘URL 여러 개’ 탭에 붙여넣습니다. 원티드·사람인·잡코리아·링크드인·리멤버·점핏·캐치 주소를 인식합니다.</li>
            </ol>
            {keywords.length > 0 ? (
              <div className="space-y-1.5">
                {keywords.slice(0, 3).map((kw) => (
                  <div key={kw} className="flex flex-wrap items-center gap-1.5">
                    <span className="chip bg-paper-deep text-[11px] text-ink">{kw}</span>
                    {searchLinks(kw).map((l) => (
                      <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="btn btn-outline h-7 px-2 text-[11.5px]">
                        {l.label} <ExternalLink size={11} />
                      </a>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-faint">이력서를 등록하면 포지션 키워드별 검색 링크가 여기에 나옵니다.</p>
            )}
          </div>
        )}
      </section>

      {/* 읽지 못한 공고 */}
      {failures.length > 0 && (
        <section className="card mt-3 p-4" data-testid="board-failures">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-ink">읽지 못한 공고 {failures.length}건</h3>
            <button type="button" className="btn btn-ghost ml-auto h-7 px-2 text-[11.5px] text-muted" onClick={() => setFailures([])}>
              모두 지우기
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {failures.map((f) => (
              <li key={f.id} className="rounded-lg border border-line bg-surface p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                  <a href={f.url} target="_blank" rel="noreferrer" className="max-w-[60%] truncate font-medium text-accent-deep underline">
                    {f.url}
                  </a>
                  <span className="text-muted">{f.message}</span>
                  <button type="button" className="btn btn-ghost ml-auto h-6 px-1.5 text-muted" aria-label="목록에서 지우기" onClick={() => setFailures((p) => p.filter((x) => x.id !== f.id))}>
                    <X size={12} />
                  </button>
                </div>
                <textarea
                  value={paste[f.id] ?? (f.excerpt || "")}
                  onChange={(e) => setPaste((p) => ({ ...p, [f.id]: e.target.value }))}
                  rows={3}
                  className="field mt-1.5 text-[12px]"
                  placeholder="이 공고의 본문을 복사해 붙여넣으세요."
                />
                <button type="button" onClick={() => rescue(f)} className="btn btn-outline mt-1.5 h-7 px-2 text-[11.5px]">
                  본문으로 추가
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 보드 */}
      <section className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">내 공고 보드</h2>
          <div className="flex flex-wrap gap-1">
            {(["all", ...STATUS_ORDER] as Filter[]).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} data-testid={`filter-${f}`} className={cx("chip border text-[11.5px]", filter === f ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted")}>
                {f === "all" ? "전체" : BOARD_STATUS_LABEL[f]} <span className="num ml-1">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-muted">
          <label className="flex items-center gap-1.5">
            최소 점수 <b className="num w-6 text-right text-ink">{minScore}</b>
            <input type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} data-testid="min-score" />
          </label>
          <label className="flex items-center gap-1.5">
            정렬
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="field-sm" data-testid="board-sort">
              <option value="score">적합도순</option>
              <option value="deadline">마감 임박순</option>
              <option value="recent">최근 추가순</option>
            </select>
          </label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="field-sm w-[150px]" placeholder="회사·직무 검색" />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => startQueue(topIds(10))} disabled={topIds(10).length === 0} className="btn btn-primary h-8 px-2.5 text-[11.5px] disabled:opacity-50" data-testid="queue-top">
              <Play size={12} /> 상위 {Math.min(10, topIds(10).length)}건 지원 큐
            </button>
            {picked.size > 0 && (
              <>
                <button type="button" onClick={() => startQueue([...picked])} className="btn btn-outline h-8 px-2.5 text-[11.5px]" data-testid="queue-picked">
                  선택 {picked.size}건 지원 큐
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPostings((prev) => prev.filter((p) => !picked.has(p.id)));
                    setPicked(new Set());
                  }}
                  className="btn btn-ghost h-8 px-2 text-muted"
                  aria-label="선택 삭제"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="card mt-3 p-8 text-center text-[12.5px] text-muted" data-testid="board-empty">
            {postings.length === 0 ? "아직 공고가 없습니다. 위에서 URL이나 본문을 여러 개 붙여넣어 보세요." : "조건에 맞는 공고가 없습니다. 최소 점수나 상태 필터를 낮춰 보세요."}
          </div>
        ) : (
          <ul className="mt-3 space-y-2" data-testid="board-list">
            {shown.map((p) => (
              <li key={p.id} className={cx("card flex flex-wrap items-start gap-3 p-3.5", p.status === "skip" && "opacity-60")} data-testid="board-item">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => togglePick(p.id)} className="mt-1.5" aria-label={`${p.job.company} 선택`} />
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-surface">
                  <div className="text-center leading-none">
                    <div className="num text-[17px] font-semibold" style={{ color: scoreColor(p.score) }} data-testid="item-score">
                      {p.score}
                    </div>
                    <div className="mt-0.5 text-[8.5px] text-faint">{p.gradeLabel}</div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[13.5px] font-semibold text-ink">{p.job.company || "회사명 미확인"}</span>
                    <span className="text-[12.5px] text-ink-2">{p.job.role || "직무 미확인"}</span>
                    <span className="text-[11px]">
                      <Dday deadline={p.job.deadline} />
                    </span>
                    <span className="text-[11px] text-faint">{p.site}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {p.matched.slice(0, 4).map((k) => (
                      <span key={`m-${k}`} className="chip bg-accent-soft text-[10.5px] text-accent-deep">
                        {k}
                      </span>
                    ))}
                    {p.missing.slice(0, 3).map((k) => (
                      <span key={`x-${k}`} className="chip bg-risk-soft text-[10.5px] text-risk">
                        부족 · {k}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <select value={p.status} onChange={(e) => patch(p.id, { status: e.target.value as BoardStatus })} className="field-sm" aria-label="상태" data-testid="item-status">
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {BOARD_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer" className="btn btn-outline h-8 px-2 text-[11.5px]">
                      공고 <ExternalLink size={11} />
                    </a>
                  )}
                  <button type="button" onClick={() => onCoach(p)} className="btn btn-outline h-8 px-2 text-[11.5px]" data-testid="item-coach">
                    상세 코칭 <ArrowRight size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 지원 큐 */}
      {queue && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3" data-testid="apply-queue">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setQueue(null)} aria-hidden />
          <div className="animate-rise relative z-10 flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <QueueCard
              key={current.id}
              posting={current}
              resume={resume}
              step={`${qi + 1} / ${queue.length}`}
              onClose={() => setQueue(null)}
              onDone={() => {
                patch(current.id, { status: "applied", appliedAt: new Date().toISOString() });
                onApplied(current);
                nextInQueue();
              }}
              onLater={() => {
                patch(current.id, { status: "interested" });
                nextInQueue();
              }}
              onSkip={() => {
                patch(current.id, { status: "skip" });
                nextInQueue();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function QueueCard({
  posting,
  resume,
  step,
  onClose,
  onDone,
  onLater,
  onSkip,
}: {
  posting: BoardPosting;
  resume: MasterResume;
  step: string;
  onClose: () => void;
  onDone: () => void;
  onLater: () => void;
  onSkip: () => void;
}) {
  const kit = useMemo(() => {
    const match = matchResume(resume, posting.job);
    const summary = buildSummary(resume, posting.job, match);
    return { summary: summary.after, matched: match.keywords.filter((k) => k.status === "matched").slice(0, 6).map((k) => k.label) };
  }, [resume, posting.job]);
  const [opened, setOpened] = useState(false);

  return (
    <>
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">지원 큐 {step}</div>
          <h3 className="mt-1 text-[15px] font-semibold text-ink">
            {posting.job.company} · {posting.job.role}
          </h3>
          <p className="mt-0.5 text-[11.5px] text-muted">
            적합도 <b className="num" style={{ color: scoreColor(posting.score) }}>{posting.score}</b> · {posting.gradeLabel} · <Dday deadline={posting.job.deadline} />
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
          <X size={16} />
        </button>
      </div>
      <div className="space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-[12.5px] font-semibold text-ink">이 공고용 한 문단 소개</h4>
            <CopyButton text={kit.summary} label="복사" className="ml-auto" />
          </div>
          <p className="mt-1.5 rounded-lg bg-paper-deep p-3 text-[12.5px] leading-relaxed text-ink-2" data-testid="queue-summary">
            {kit.summary}
          </p>
        </div>
        <div>
          <h4 className="text-[12.5px] font-semibold text-ink">서류에 드러낼 강점 키워드</h4>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {kit.matched.length ? kit.matched.map((k) => (
              <span key={k} className="chip bg-accent-soft text-[11px] text-accent-deep">{k}</span>
            )) : <span className="text-[11.5px] text-faint">이력서와 겹치는 키워드가 적습니다.</span>}
          </div>
          {posting.missing.length > 0 && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              공고가 요구하지만 이력서에 근거가 없는 항목: {posting.missing.join(", ")}. 실제 경험이 있을 때만 이력서에 추가하세요.
            </p>
          )}
        </div>
        <p className="rounded-lg border border-line bg-[#fcfcfa] p-2.5 text-[11px] leading-relaxed text-muted">
          지원서 제출은 채용 사이트 로그인·캡차·약관 때문에 자동으로 대신할 수 없습니다. 지원 페이지를 열어 위 문안을 붙여 넣고 제출한 뒤 ‘지원 완료’를 누르세요.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
        {posting.url ? (
          <a href={posting.url} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} className="btn btn-accent h-9 px-3 text-[12px]" data-testid="queue-open">
            지원 페이지 열기 <ExternalLink size={12} />
          </a>
        ) : (
          <span className="text-[11.5px] text-faint">붙여넣은 공고라 링크가 없습니다.</span>
        )}
        <button type="button" onClick={onDone} disabled={Boolean(posting.url) && !opened} className="btn btn-primary h-9 px-3 text-[12px] disabled:opacity-50" data-testid="queue-done">
          <Check size={13} /> 지원 완료
        </button>
        <button type="button" onClick={onLater} className="btn btn-outline h-9 px-3 text-[12px]" data-testid="queue-later">
          나중에
        </button>
        <button type="button" onClick={onSkip} className="btn btn-ghost h-9 px-2 text-[12px] text-muted" data-testid="queue-skip">
          <SkipForward size={13} /> 건너뛰기
        </button>
      </div>
    </>
  );
}
