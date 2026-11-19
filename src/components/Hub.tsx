import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  CircleAlert,
  ClipboardList,
  FileText,
  Layers,
  Link2,
  Loader2,
  MapPin,
  Mic,
  NotebookPen,
  PenLine,
  Radar,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Wallet,
  Wand2,
} from "lucide-react";
import type { AiStatus, HubJob, MasterResume, PriorityId } from "../types";
import { APPLY_STATUSES, STATUS_CHIP, STATUS_DOT, docItems, linesOf } from "../lib/apply";
import { NO_DOCUMENTS_HINT, splitJobUrls, type AddProgress } from "../lib/hub";
import { JOB_PRESETS, presetById } from "../lib/jobPresets";
import {
  REGION_FILTERS,
  deadlineRank,
  isTrackedJob,
  matchesRegion,
  type CollectionState,
} from "../lib/collect";
import { PRIORITIES } from "../lib/priority";
import { resumeBulletCount, resumeReady, type ResumeMeta } from "../lib/storage";
import { Card, CopyButton, Eyebrow, cx } from "./ui";

export interface HubProps {
  resume: MasterResume;
  resumeMeta: ResumeMeta | null;
  resumeBusy: string | null;
  onResumeFile: (file: File) => void;
  onOpenResume: () => void;
  onSampleResume: () => void;
  jobs: HubJob[];
  selected: HubJob | null;
  onSelect: (id: string) => void;
  collection: CollectionState;
  onPreset: (id: string) => void;
  onKeyword: (value: string) => void;
  onCollect: () => void;
  onRegion: (value: string) => void;
  onSort: (value: "latest" | "deadline") => void;
  onToggleSave: (id: string) => void;
  onEnrich: (id: string) => void;
  enrichBusyId: string | null;
  /** URL·본문으로 공고를 직접 추가하면 올라가는 신호 — 보드를 ‘내 지원’으로 돌립니다. */
  savedSignal: number;
  /* URL·본문 보조 입력 */
  urlsText: string;
  onUrlsText: (value: string) => void;
  onAddUrls: () => void;
  adding: boolean;
  progress: AddProgress[];
  pasteOpen: boolean;
  onPasteOpen: (open: boolean) => void;
  pasteText: string;
  onPasteText: (value: string) => void;
  pasteUrl: string;
  onPasteUrl: (value: string) => void;
  onAddPaste: () => void;
  onRemoveJob: (id: string) => void;
  onUpdate: (job: HubJob) => void;
  onAiDraft: (id: string) => void;
  aiDraftBusyId: string | null;
  onOpenDeep: (job: HubJob) => void;
  deepBusyId: string | null;
  priority: PriorityId | null;
  onPriority: (id: PriorityId) => void;
  targetSalary: number | null;
  onTargetSalary: (value: number | null) => void;
  aiStatus: AiStatus;
  onNotify: (message: string, tone?: "ok" | "warn" | "err") => void;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const clockOf = (iso: string | null): string => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const deadlineLabel = (deadline: string): string => {
  if (!deadline) return "마감 미확인";
  return /^\d{4}-\d{2}-\d{2}/.test(deadline) ? deadline.slice(0, 10) : deadline;
};

const emptyDocsHint = (job: HubJob["job"]): string =>
  job.detailLevel === "list"
    ? "제출서류는 원문에서 확인하세요. 이 공고는 목록 정보만 모았습니다."
    : NO_DOCUMENTS_HINT;

function ResumeStrip(props: HubProps) {
  const { resume, resumeMeta, resumeBusy } = props;
  const ready = resumeReady(resume);
  const fileRef = useRef<HTMLInputElement>(null);
  const bullets = resumeBulletCount(resume);
  const sourceLabel =
    resumeMeta?.source === "file"
      ? `파일 등록${resumeMeta.fileName ? ` · ${resumeMeta.fileName}` : ""}`
      : resumeMeta?.source === "manual"
        ? "직접 입력"
        : resumeMeta?.source === "sample"
          ? "샘플 이력서"
          : "이 브라우저에 저장됨";

  return (
    <Card className="overflow-hidden" testId="resume-card">
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">
          <FileText size={12} />
        </span>
        <span className="text-[11.5px] font-semibold text-ink">내 이력서</span>
        {ready ? (
          <>
            <span className="chip bg-accent-soft text-accent-deep" data-testid="resume-status">
              <BadgeCheck size={11} /> 등록됨
            </span>
            <span className="truncate text-[11.5px] text-ink-2" data-testid="resume-name">
              {resume.name || "이름 미입력"}
            </span>
            <span className="hidden text-[10px] text-muted sm:inline">
              {[resume.headline, `${resume.years}년`, `경력 ${resume.experiences.length}개 · 문장 ${bullets}개`].filter(Boolean).join(" · ")}
            </span>
            <span className="chip hidden bg-paper-deep text-[9.5px] text-muted md:inline-flex">{sourceLabel}</span>
            <span className="ml-auto flex items-center gap-1">
              <button type="button" onClick={props.onOpenResume} className="btn btn-outline h-7 px-2 text-[10.5px]" data-testid="resume-edit">
                <PenLine size={11} /> 편집
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline h-7 px-2 text-[10.5px]" data-testid="resume-replace">
                <Upload size={11} /> 교체
              </button>
              <button type="button" onClick={props.onSampleResume} className="btn btn-ghost h-7 px-1.5 text-[10px] text-muted">
                샘플
              </button>
            </span>
          </>
        ) : (
          <>
            <span className="text-[11px] leading-relaxed text-muted">
              한 번만 올려 두면, 모아 온 공고마다 <strong className="font-semibold text-ink-2">내 경력으로 만든 지원 문구</strong>가 바로 나옵니다.
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-accent h-7 px-2.5 text-[11px]" data-testid="resume-file-btn">
                <Upload size={11} /> 이력서 등록 (.txt · .md · .pdf)
              </button>
              <button type="button" onClick={props.onOpenResume} className="btn btn-outline h-7 px-2 text-[10.5px]" data-testid="resume-manual">
                <PenLine size={11} /> 직접 입력
              </button>
              <button type="button" onClick={props.onSampleResume} className="btn btn-ghost h-7 px-1.5 text-[10px] text-muted" data-testid="resume-sample">
                샘플
              </button>
            </span>
          </>
        )}
      </div>
      {resumeBusy && (
        <div className="flex items-center gap-2 border-t border-line bg-paper-deep/60 px-3.5 py-1.5 text-[10.5px] text-muted" data-testid="resume-busy">
          <Loader2 size={11} className="animate-spin" /> {resumeBusy}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf,text/plain,application/pdf"
        className="hidden"
        data-testid="resume-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) props.onResumeFile(file);
          event.target.value = "";
        }}
      />
    </Card>
  );
}

const COMPANY_TYPE_LABEL: Record<string, string> = {
  inhouse: "인하우스",
  searchfirm: "헤드헌팅",
  agency: "에이전시",
};

const COMPANY_TYPE_HINT: Record<string, string> = {
  inhouse: "기업 자체 홍보·커뮤니케이션 조직",
  searchfirm: "서치펌이 올린 공고 — 고용주는 원문에서 확인",
  agency: "PR 에이전시·대행사 공고",
};

function CompanyTypeChip({ type }: { type?: string }) {
  const label = type ? COMPANY_TYPE_LABEL[type] : "";
  if (!label) return null;
  return (
    <span
      className={cx(
        "chip px-1.5 py-0 text-[9px]",
        type === "inhouse" ? "bg-accent-soft text-accent-deep" : type === "searchfirm" ? "bg-info-soft text-info" : "bg-warn-soft text-warn",
      )}
      title={type ? COMPANY_TYPE_HINT[type] : undefined}
      data-testid="company-type"
      data-company-type={type}
    >
      {label}
    </span>
  );
}

function FilterNote({ collection }: { collection: CollectionState }) {
  const filter = collection.filter;
  if (!filter) return null;
  const { excluded } = filter;
  const cut = excluded.region + excluded.role + excluded.junior + excluded.agency;
  return (
    <div
      className="mt-2 rounded-lg border border-line bg-paper-deep/50 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted"
      data-testid="filter-note"
      data-raw={filter.raw}
      data-kept={filter.kept}
    >
      <span className="font-semibold text-ink-2">{filter.label}</span> 기준 · 수집 {filter.raw}건 중 <span className="num">{cut}</span>건 제외({" "}
      지방·경기 <span className="num">{excluded.region}</span> · 직무 불일치 <span className="num">{excluded.role}</span> · 신입·주니어{" "}
      <span className="num">{excluded.junior}</span> · 에이전시·대행사 <span className="num">{excluded.agency}</span>) →{" "}
      <span className="num font-semibold text-accent-deep">{collection.status === "loading" ? "…" : filter.kept}</span>건
    </div>
  );
}

function SourcePills({ collection }: { collection: CollectionState }) {
  if (!collection.sources.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="collect-sources">
      {collection.sources.map((source) => (
        <span
          key={source.id}
          className={cx("chip border text-[9.5px]", source.ok ? "border-line bg-paper text-muted" : "border-warn/25 bg-warn-soft text-warn")}
          title={source.note ?? `${source.name}에서 ${source.count}건`}
          data-source={source.id}
          data-count={source.count}
        >
          {source.ok ? <Check size={9} strokeWidth={3} /> : <CircleAlert size={9} />}
          {source.name} <span className="num">{source.count}</span>
          {source.full > 0 && <span className="text-faint">· 요건 {source.full}</span>}
        </span>
      ))}
    </div>
  );
}

function CollectionBar(props: HubProps) {
  const { collection } = props;
  const loading = collection.status === "loading";
  const preset = presetById(collection.preset);
  const activeHint = preset?.hint ?? "내가 입력한 키워드로 모읍니다";

  return (
    <Card className="overflow-hidden" testId="collect-bar">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[10px] font-semibold text-white">
          <Radar size={12} />
        </span>
        <span className="text-[12px] font-semibold text-ink">공고 자동 수집</span>
        <span className="text-[10px] text-muted">리멤버 · 원티드 · 사람인 · 잡코리아</span>
        <span className="ml-auto flex items-center gap-1.5 text-[9.5px] text-faint">
          {loading ? (
            <>
              <Loader2 size={11} className="animate-spin" /> 네 곳에서 모으는 중
            </>
          ) : collection.at ? (
            <>
              <RefreshCw size={10} /> {clockOf(collection.at)} 기준 · 실제 공고
            </>
          ) : (
            "아직 모으지 않았습니다"
          )}
        </span>
      </div>

      <div className="px-3.5 py-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="직무 프리셋">
          {JOB_PRESETS.map((item) => {
            const active = collection.preset === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => props.onPreset(item.id)}
                data-testid={`preset-${item.id}`}
                aria-pressed={active}
                className={cx(
                  "rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition-colors",
                  active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink-2",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <FilterNote collection={collection} />

        <div className="mt-2 flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="field field-sm pl-7 text-[12px]"
              placeholder="직접 입력: 보도자료, 브랜드 마케팅…"
              value={collection.keyword}
              onChange={(event) => props.onKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  props.onCollect();
                }
              }}
              data-testid="collect-keyword"
              aria-label="공고 검색 키워드"
            />
          </div>
          <button
            type="button"
            onClick={props.onCollect}
            disabled={loading}
            className="btn btn-accent h-8 shrink-0 px-3 text-[11.5px] disabled:opacity-60"
            data-testid="collect-run"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {loading ? "모으는 중" : "공고 모으기"}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <select
            className="field field-sm w-[92px] py-1 text-[11px]"
            value={collection.region}
            onChange={(event) => props.onRegion(event.target.value)}
            data-testid="collect-region"
            aria-label="지역"
          >
            {REGION_FILTERS.map((region) => (
              <option key={region} value={region}>
                {region === "전체" ? "지역 전체" : region}
              </option>
            ))}
          </select>
          <div className="seg" role="group" aria-label="정렬">
            <button
              type="button"
              className="seg-item text-[10.5px]"
              data-active={collection.sort === "latest" ? "true" : "false"}
              data-testid="sort-latest"
              onClick={() => props.onSort("latest")}
            >
              최신순
            </button>
            <button
              type="button"
              className="seg-item text-[10.5px]"
              data-active={collection.sort === "deadline" ? "true" : "false"}
              data-testid="sort-deadline"
              onClick={() => props.onSort("deadline")}
            >
              마감 임박
            </button>
          </div>
          <span className="min-w-0 truncate text-[9.5px] text-faint" data-testid="collect-hint">
            {activeHint}
          </span>
          <SourcePills collection={collection} />
        </div>

        {collection.sources.some((source) => !source.ok && source.note) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px] leading-relaxed text-warn" data-testid="source-notes">
            <CircleAlert size={10} className="shrink-0" />
            {collection.sources
              .filter((source) => !source.ok && source.note)
              .map((source) => (
                <span key={source.id} data-source={source.id}>
                  {source.name} — {source.note}
                </span>
              ))}
          </div>
        )}

        {collection.status === "error" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-warn/25 bg-warn-soft px-2.5 py-2 text-[10.5px] leading-relaxed text-warn" data-testid="collect-error">
            <CircleAlert size={12} className="shrink-0" />
            <span className="min-w-0 flex-1">{collection.error}</span>
            <button type="button" onClick={props.onCollect} className="btn btn-outline h-6 px-2 text-[10px]">
              다시 시도
            </button>
          </div>
        )}

        <details className="mt-2 group" data-testid="manual-add">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] text-muted hover:text-ink-2">
            <Link2 size={11} /> 공고 URL·본문으로 직접 추가
            <span className="text-faint">(자동 수집이 막힌 공고용)</span>
          </summary>
          <div className="mt-2 rounded-xl border border-line bg-paper-deep/40 p-2.5">
            <textarea
              className="field min-h-[64px] text-[12px] leading-relaxed"
              placeholder={"공고 주소를 한 줄에 하나씩 붙여넣으세요.\nhttps://www.wanted.co.kr/wd/000000"}
              value={props.urlsText}
              onChange={(event) => props.onUrlsText(event.target.value)}
              data-testid="hub-urls"
              aria-label="공고 URL 여러 개"
              spellCheck={false}
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="num text-[10px] text-faint" data-testid="hub-url-count">
                {splitJobUrls(props.urlsText).length ? `주소 ${splitJobUrls(props.urlsText).length}개 인식` : "주소를 붙여넣으면 개수를 셉니다"}
              </span>
              <button
                type="button"
                onClick={() => props.onPasteOpen(!props.pasteOpen)}
                className="btn btn-ghost h-7 px-1.5 text-[10.5px] text-muted"
                data-testid="hub-paste-toggle"
                aria-expanded={props.pasteOpen}
              >
                <FileText size={12} /> {props.pasteOpen ? "본문 붙여넣기 닫기" : "본문 붙여넣기"}
              </button>
              <button
                type="button"
                onClick={props.onAddUrls}
                disabled={props.adding || splitJobUrls(props.urlsText).length === 0}
                className="btn btn-outline ml-auto h-7 px-2.5 text-[11px] disabled:opacity-50"
                data-testid="hub-fetch"
              >
                {props.adding ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                {props.adding ? "읽는 중" : "URL로 추가"}
              </button>
            </div>

            {props.pasteOpen && (
              <div className="mt-2 rounded-lg border border-line bg-surface p-2" data-testid="hub-paste-panel">
                <input
                  className="field field-sm mb-1.5"
                  placeholder="공고 주소 (선택 — 직접 지원 링크로 씁니다)"
                  value={props.pasteUrl}
                  onChange={(event) => props.onPasteUrl(event.target.value)}
                  data-testid="hub-paste-url"
                  aria-label="붙여넣는 공고의 URL"
                  inputMode="url"
                />
                <textarea
                  className="field min-h-[92px] text-[12px] leading-relaxed"
                  placeholder={"공고 본문을 그대로 붙여넣으세요.\n\n[주요 업무]\n- …\n\n[자격 요건]\n- …\n\n[우대 사항]\n- …"}
                  value={props.pasteText}
                  onChange={(event) => props.onPasteText(event.target.value)}
                  data-testid="hub-paste-text"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[9.5px] leading-relaxed text-faint">로그인·차단 페이지는 본문 붙여넣기가 더 정확합니다.</span>
                  <button
                    type="button"
                    onClick={props.onAddPaste}
                    disabled={props.pasteText.trim().length < 40}
                    className="btn btn-primary ml-auto h-7 px-2.5 text-[11px] disabled:opacity-50"
                    data-testid="hub-paste-add"
                  >
                    <Sparkles size={12} /> 이 본문으로 추가
                  </button>
                </div>
              </div>
            )}

            {props.progress.length > 0 && (
              <ul className="mt-1.5 space-y-0.5" data-testid="hub-progress">
                {props.progress
                  .filter((item) => item.state !== "waiting")
                  .map((item, index) => (
                    <li key={`${item.url}-${index}`} className="flex items-start gap-1.5 text-[10px] leading-relaxed">
                      {item.state === "loading" && <Loader2 size={10} className="mt-0.5 shrink-0 animate-spin text-muted" />}
                      {item.state === "done" && <Check size={10} className="mt-0.5 shrink-0 text-ok" strokeWidth={3} />}
                      {item.state === "failed" && <CircleAlert size={10} className="mt-0.5 shrink-0 text-warn" />}
                      <span className={cx("min-w-0 truncate", item.state === "failed" ? "text-warn" : "text-muted")} title={item.url}>
                        {item.state === "done" ? item.message : item.state === "failed" ? `${hostOf(item.url)} — ${item.message}` : `${hostOf(item.url)} 읽는 중`}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </details>
      </div>
    </Card>
  );
}

function JobCard({ item, active, onSelect, onToggleSave }: { item: HubJob; active: boolean; onSelect: () => void; onToggleSave: () => void }) {
  const saved = Boolean(item.saved);
  return (
    <li className="flex items-stretch" data-testid="hub-job-row" data-job-id={item.id}>
      <button
        type="button"
        onClick={onSelect}
        data-testid="hub-job"
        data-job-id={item.id}
        data-active={active ? "true" : "false"}
        data-source={item.source.sourceId ?? item.source.kind}
        className={cx("min-w-0 flex-1 px-3.5 py-2.5 text-left transition-colors", active ? "bg-accent-soft/45" : "hover:bg-[#fbfbf8]")}
      >
        <span className="flex items-center gap-1.5">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[item.status] }} />
          <span className="min-w-0 truncate text-[12px] font-semibold text-ink">{item.job.company || "회사 미확인"}</span>
          <CompanyTypeChip type={item.job.companyType} />
          <span className="chip ml-auto shrink-0 bg-paper-deep px-1.5 py-0.5 text-[9px] text-faint">{item.source.site || "직접 추가"}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-ink-2">{item.job.role || "직무 미확인"}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1 text-[9px] text-faint">
          {item.status !== "지원 전" && <span className={cx("chip px-1.5 py-0 text-[9px]", STATUS_CHIP[item.status])}>{item.status}</span>}
          {item.job.experience && <span className="chip bg-paper px-1.5 py-0 text-[9px] text-muted">{item.job.experience}</span>}
          {item.job.location && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin size={8} /> {item.job.location}
            </span>
          )}
          <span className="ml-auto">{item.job.deadline ? deadlineLabel(item.job.deadline) : "마감 미확인"}</span>
        </span>
        {item.job.tags && item.job.tags.length > 0 && (
          <span className="mt-1 block truncate text-[9px] text-accent-deep/80">{item.job.tags.slice(0, 3).join(" · ")}</span>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleSave}
        className={cx("grid w-8 shrink-0 place-items-center border-l border-line text-[13px] transition-colors", saved ? "text-accent" : "text-faint hover:text-ink-2")}
        data-testid="job-save"
        data-saved={saved ? "true" : "false"}
        aria-label={saved ? "담은 공고에서 빼기" : "내 지원에 담기"}
        title={saved ? "담은 공고에서 빼기" : "내 지원에 담기"}
      >
        {saved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
      </button>
    </li>
  );
}

function JobList(props: HubProps) {
  const [tab, setTab] = useState<"feed" | "saved">("feed");

  useEffect(() => {
    if (props.savedSignal > 0) setTab("saved");
  }, [props.savedSignal]);
  const feed = useMemo(() => {
    const items = props.jobs.filter((job) => job.source.kind === "auto" && !isTrackedJob(job));
    const filtered = items.filter((job) => matchesRegion(job.job.location, props.collection.region));
    if (props.collection.sort === "deadline") {
      return [...filtered].sort((a, b) => deadlineRank(a.job.deadline) - deadlineRank(b.job.deadline));
    }
    return filtered;
  }, [props.jobs, props.collection.region, props.collection.sort]);
  const saved = useMemo(
    () =>
      props.jobs
        .filter((job) => job.source.kind !== "auto" || isTrackedJob(job))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [props.jobs],
  );
  const shown = tab === "feed" ? feed : saved;
  const loading = props.collection.status === "loading";
  const query = props.collection.applied;

  return (
    <Card className="overflow-hidden" testId="hub-list">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
        <ClipboardList size={13} className="text-muted" />
        <span className="text-[11.5px] font-semibold text-ink">공고 보드</span>
        <div className="seg ml-auto" role="group" aria-label="보드 구분">
          <button type="button" className="seg-item text-[10.5px]" data-active={tab === "feed" ? "true" : "false"} data-testid="tab-feed" onClick={() => setTab("feed")}>
            자동 수집 <span className="num" data-testid="hub-count">{feed.length}</span>
          </button>
          <button type="button" className="seg-item text-[10.5px]" data-active={tab === "saved" ? "true" : "false"} data-testid="tab-saved" onClick={() => setTab("saved")}>
            내 지원 <span className="num" data-testid="saved-count">{saved.length}</span>
          </button>
        </div>
      </div>

      {tab === "feed" && shown.length > 0 && shown.length < 6 && (
        <div className="border-b border-line bg-warn-soft/60 px-3.5 py-2 text-[10px] leading-relaxed text-warn" data-testid="few-results">
          조건에 맞는 공고가 {shown.length}건뿐입니다. 위에서 다른 직무를 고르거나 키워드를 조금 넓혀 보세요.
        </div>
      )}

      {loading && shown.length === 0 ? (
        <ul className="divide-y divide-line">
          {[0, 1, 2, 3].map((index) => (
            <li key={index} className="px-3.5 py-3">
              <div className="skeleton-sweep h-3 w-24 rounded bg-paper-deep" />
              <div className="skeleton-sweep mt-2 h-3 w-3/4 rounded bg-paper-deep" />
              <div className="skeleton-sweep mt-2 h-2.5 w-1/2 rounded bg-paper-deep" />
            </li>
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-paper-deep text-faint">
            {tab === "feed" ? <Radar size={16} /> : <Bookmark size={16} />}
          </div>
          <p className="mt-2 text-[12px] font-semibold text-ink">{tab === "feed" ? "이 조건의 공고를 찾지 못했습니다" : "아직 담은 공고가 없습니다"}</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            {tab === "feed"
              ? query
                ? `‘${query}’ 조건을 바꾸거나 다른 직무를 골라 다시 모아 보세요.`
                : "위에서 직무를 고르면 리멤버·원티드·사람인·잡코리아에서 공고를 모아 옵니다."
              : "공고 카드의 북마크를 누르면 여기에 남고, 지원 상태·메모와 함께 저장됩니다."}
          </p>
        </div>
      ) : (
        <ul className="max-h-[620px] divide-y divide-line overflow-y-auto scroll-thin">
          {shown.map((item) => (
            <JobCard
              key={item.id}
              item={item}
              active={props.selected?.id === item.id}
              onSelect={() => props.onSelect(item.id)}
              onToggleSave={() => props.onToggleSave(item.id)}
            />
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line px-3.5 py-1.5 text-[9px] text-faint">
        <span>{tab === "feed" ? "실제 채용 사이트에서 방금 모은 공고입니다." : "담은 공고·상태·메모는 이 브라우저에 저장됩니다."}</span>
        <span className="num">{shown.length}</span>
      </div>
    </Card>
  );
}

function RequirementBlock({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-ink-2">{title}</span>
        <span className="num text-[9px] text-faint">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="mt-1 space-y-0.5">
          {items.map((line, index) => (
            <li key={`${title}-${index}`} className="flex items-start gap-1 text-[10.5px] leading-relaxed text-ink-2">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-line-strong" />
              <span className="min-w-0">{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[10px] leading-relaxed text-faint">{empty}</p>
      )}
    </div>
  );
}

function DocumentChecklist({ item, onUpdate }: { item: HubJob; onUpdate: (job: HubJob) => void }) {
  const docs = docItems(item.job);
  if (!docs.length) return <p className="mt-1 text-[10px] leading-relaxed text-faint">{emptyDocsHint(item.job)}</p>;
  return (
    <ul className="mt-1 space-y-0.5" data-testid="doc-checklist">
      {docs.map((doc) => {
        const done = item.documentsChecked.includes(doc);
        return (
          <li key={doc}>
            <button
              type="button"
              onClick={() =>
                onUpdate({
                  ...item,
                  documentsChecked: done ? item.documentsChecked.filter((value) => value !== doc) : [...item.documentsChecked, doc],
                  updatedAt: new Date().toISOString(),
                })
              }
              data-testid="doc-item"
              data-checked={done ? "true" : "false"}
              aria-pressed={done}
              className="flex w-full items-start gap-1.5 text-left"
            >
              <span
                className={cx(
                  "mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded border",
                  done ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-transparent",
                )}
              >
                <Check size={9} strokeWidth={3} />
              </span>
              <span className={cx("text-[10.5px] leading-relaxed", done ? "text-faint line-through" : "text-ink-2")}>{doc}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ApplyKitBlock(props: HubProps & { item: HubJob }) {
  const { item } = props;
  const draft = item.draft;
  const busy = props.aiDraftBusyId === item.id;
  const ready = resumeReady(props.resume);

  return (
    <Card className="overflow-hidden" testId="hub-apply-kit">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[10px] font-semibold text-white">
          <Sparkles size={12} />
        </span>
        <span className="text-[12px] font-semibold text-ink">바로 쓰는 지원 문구</span>
        {draft && (
          <span
            className={cx("chip text-[9.5px]", draft.source === "ai" ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}
            data-testid="draft-source"
          >
            {draft.source === "ai" ? `AI 초안${draft.model ? ` · ${draft.model}` : ""}` : "규칙 초안"}
          </span>
        )}
        {busy && (
          <span className="chip bg-paper-deep text-[9.5px] text-muted" data-testid="draft-busy">
            <Loader2 size={10} className="animate-spin" /> AI가 다듬는 중
          </span>
        )}
        {draft && typeof draft.warnings === "number" && draft.warnings > 0 && (
          <span className="chip bg-warn-soft text-[9px] text-warn">근거 확인 제외 {draft.warnings}</span>
        )}
        {ready && (
          <button
            type="button"
            onClick={() => props.onAiDraft(item.id)}
            disabled={busy || props.aiStatus.kind !== "live"}
            className="btn btn-ghost ml-auto h-7 px-2 text-[10px] text-muted disabled:opacity-40"
            data-testid="draft-ai"
            title={props.aiStatus.kind === "live" ? "Gemini로 문장을 다시 다듬습니다" : "AI 서버가 연결되면 사용할 수 있습니다"}
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} AI로 다시
          </button>
        )}
      </div>

      {!ready ? (
        <div className="px-4 py-4">
          <p className="text-[11.5px] leading-relaxed text-ink-2">
            이력서를 등록하면 <strong className="font-semibold">이 공고의 요구와 내 경력 문장을 연결한</strong> 한 줄 어필·지원서 초안이 바로 만들어집니다.
          </p>
          <button type="button" onClick={props.onOpenResume} className="btn btn-outline mt-2 h-8 px-3 text-[11px]">
            <PenLine size={12} /> 이력서 등록하기
          </button>
        </div>
      ) : !draft ? (
        <div className="flex items-center gap-2 px-4 py-4 text-[11px] text-muted">
          <Loader2 size={12} className="animate-spin" /> 이력서 문장으로 지원 문구를 만드는 중입니다.
        </div>
      ) : (
        <div className="space-y-3 px-4 py-3">
          {item.job.detailLevel === "list" && (
            <p className="rounded-lg border border-line bg-paper-deep/50 px-2.5 py-1.5 text-[9.5px] leading-relaxed text-muted">
              아직 공고 요건을 읽지 않아 직무 키워드 중심으로 만들었습니다. ‘원문에서 요건 읽어오기’를 누르면 더 정확해집니다.
            </p>
          )}
          <div data-testid="apply-one-liner">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-ink-2">한 줄 어필</span>
              <CopyButton text={draft.oneLiner} label="복사" className="ml-auto h-6 px-1.5 text-[10px]" />
            </div>
            <p className="mt-1 rounded-lg border border-accent/25 bg-accent-soft/40 px-2.5 py-2 text-[12px] font-semibold leading-relaxed text-ink">
              {draft.oneLiner}
            </p>
          </div>

          <div data-testid="apply-cover">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-ink-2">지원서 본문 초안</span>
              <span className="text-[9px] text-faint">문단 단위로 자유롭게 고쳐 쓰세요</span>
              <CopyButton text={draft.coverLetter} label="전체 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
            </div>
            <p className="mt-1 whitespace-pre-line rounded-lg border border-line bg-[#fcfcfa] px-3 py-2.5 text-[11.5px] leading-[1.8] text-ink-2">
              {draft.coverLetter}
            </p>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-ink-2">강조할 경력 문장</span>
              <span className="num text-[9px] text-faint">{draft.keyPoints.length}</span>
            </div>
            <ul className="mt-1 space-y-1">
              {draft.keyPoints.map((point, index) => (
                <li key={`${point.slice(0, 12)}-${index}`} className="flex items-start gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5">
                  <span className="num mt-0.5 text-[9px] text-faint">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 text-[10.5px] leading-relaxed text-ink-2">{point}</span>
                  <CopyButton text={point} label="" className="ml-auto h-5 w-5 shrink-0 px-0 text-[9px]" />
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[9px] leading-relaxed text-faint">이력서 원문에 없는 경험·수치·회사는 만들지 않습니다. 지원서 양식에 맞춰 문장을 다듬어 붙여넣으세요.</p>
        </div>
      )}
    </Card>
  );
}

function DeepPrepBlock(props: HubProps & { item: HubJob }) {
  const busy = props.deepBusyId === props.item.id;
  return (
    <Card className="overflow-hidden" testId="hub-deep">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Mic size={12} className="text-muted" />
        <span className="text-[11.5px] font-semibold text-ink">면접 · 처우 협상 준비</span>
        <span className="ml-auto text-[9.5px] text-faint">필요할 때만 여는 보조 도구</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-[10.5px] leading-relaxed text-muted">
          예상 질문 5개와 모범 답변·90초 연습, 역질문 3개, 연봉 협상 스크립트를 이 공고로 만듭니다. 지원 문구와 별도로 저장됩니다.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {PRIORITIES.map((option) => {
            const active = props.priority === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => props.onPriority(option.id)}
                data-testid={`deep-priority-${option.id}`}
                aria-pressed={active}
                className={cx(
                  "rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors",
                  active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-surface text-muted hover:border-line-strong",
                )}
              >
                {option.label}
              </button>
            );
          })}
          <span className="ml-1 flex items-center gap-1 text-[9.5px] text-muted">
            <Wallet size={10} /> 희망 연봉
          </span>
          <input
            className="field field-sm w-[86px] text-right text-[11px]"
            value={props.targetSalary ?? ""}
            onChange={(event) => {
              const digits = event.target.value.replace(/[^\d]/g, "");
              props.onTargetSalary(digits ? Number(digits) : null);
            }}
            placeholder="5500"
            inputMode="numeric"
            data-testid="deep-target-salary"
            aria-label="희망 연봉(만원)"
          />
          <span className="text-[9.5px] text-faint">만원</span>
          <button
            type="button"
            onClick={() => props.onOpenDeep(props.item)}
            disabled={busy}
            className="btn btn-outline ml-auto h-8 px-2.5 text-[11px]"
            data-testid="deep-open"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Briefcase size={12} />}
            {busy ? "준비하는 중" : "심층 준비 열기"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function JobDetail(props: HubProps & { item: HubJob }) {
  const { item } = props;
  const job = item.job;
  const duties = linesOf(job.responsibilities, 12);
  const requirements = linesOf(job.requirements, 12);
  const preferred = linesOf(job.preferred, 8);
  const docs = docItems(job);
  const checked = item.documentsChecked.filter((doc) => docs.includes(doc)).length;
  const enrichBusy = props.enrichBusyId === item.id;
  const thin = !duties.length && !requirements.length;
  const saved = Boolean(item.saved);

  const requirementText = useMemo(
    () =>
      [
        `■ ${job.company || "회사 미확인"} — ${job.role || "직무 미확인"}`,
        `· 근무: ${[job.employmentType, job.location].filter(Boolean).join(" / ") || "미확인"}`,
        `· 경력: ${job.experience || "미확인"}`,
        `· 마감: ${deadlineLabel(job.deadline)}`,
        "",
        "[주요 업무]",
        ...(duties.length ? duties.map((line) => `- ${line}`) : ["- 원문에 항목이 없습니다"]),
        "",
        "[자격 요건]",
        ...(requirements.length ? requirements.map((line) => `- ${line}`) : ["- 원문에 항목이 없습니다"]),
        "",
        "[우대 사항]",
        ...(preferred.length ? preferred.map((line) => `- ${line}`) : ["- 원문에 항목이 없습니다"]),
        "",
        "[제출서류]",
        ...(docs.length ? docs.map((line) => `- ${line}`) : [emptyDocsHint(job)]),
        "",
        `지원 링크: ${item.applyUrl || "원문 링크 없음"}`,
      ].join("\n"),
    [docs, duties, item.applyUrl, job.company, job.deadline, job.employmentType, job.experience, job.location, job.role, preferred, requirements],
  );

  const markApplied = () => {
    props.onUpdate({ ...item, status: "지원완료", saved: true, updatedAt: new Date().toISOString() });
    props.onNotify(`${job.company || "이 공고"}를 지원완료로 표시했습니다.`);
  };

  return (
    <div className="space-y-3" data-testid="hub-detail">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
          <span className="chip bg-info-soft text-[9.5px] text-info" data-testid="detail-site">
            <Link2 size={10} /> {item.source.site || hostOf(item.source.url ?? "")}
          </span>
          <CompanyTypeChip type={job.companyType} />
          {job.experience && <span className="chip bg-paper-deep text-[9.5px] text-muted">{job.experience}</span>}
          {job.employmentType && <span className="chip bg-paper-deep text-[9.5px] text-muted">{job.employmentType}</span>}
          {job.location && (
            <span className="chip bg-paper-deep text-[9.5px] text-muted">
              <MapPin size={9} /> {job.location}
            </span>
          )}
          <span className="chip bg-paper-deep text-[9.5px] text-muted" data-testid="detail-deadline">
            <CalendarClock size={9} /> {deadlineLabel(job.deadline)}
          </span>
          <span className={cx("chip ml-auto text-[9.5px]", STATUS_CHIP[item.status])} data-testid="detail-status">
            {item.status}
          </span>
        </div>

        <div className="px-4 pt-3">
          <Eyebrow>{item.source.kind === "auto" ? `${item.source.site ?? "자동 수집"} · 자동 수집` : "Application hub"}</Eyebrow>
          <h1 className="mt-1 text-[20px] font-semibold leading-tight tracking-[-0.03em] text-ink" data-testid="detail-company">
            {job.company || "회사 미확인"}
          </h1>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2" data-testid="detail-role">
            {job.role || "직무 미확인"}
          </p>

          {job.tags && job.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {job.tags.slice(0, 6).map((tag) => (
                <span key={tag} className="chip bg-accent-soft/60 px-1.5 py-0 text-[9px] text-accent-deep">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1" role="group" aria-label="지원 상태">
            {APPLY_STATUSES.map((status, index) => {
              const active = item.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => props.onUpdate({ ...item, status, saved: true, updatedAt: new Date().toISOString() })}
                  data-testid={`status-${index}`}
                  data-status={status}
                  aria-pressed={active}
                  className={cx(
                    "rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors",
                    active ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-line-strong",
                  )}
                >
                  {status}
                </button>
              );
            })}
            <span className="ml-1 text-[9px] text-faint">상태는 직접 바꿉니다</span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {item.applyUrl ? (
              <a
                href={item.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-accent h-10 px-4 text-[12.5px]"
                data-testid="apply-link"
                data-url={item.applyUrl}
              >
                원문에서 지원하기 <ArrowUpRight size={14} />
              </a>
            ) : (
              <span className="chip bg-warn-soft text-[10.5px] text-warn">
                <CircleAlert size={11} /> 원문 지원 링크를 찾지 못했습니다. 공고 본문에서 확인하세요.
              </span>
            )}
            {thin && item.applyUrl && item.source.sourceId !== "saramin" && (
              <button
                type="button"
                onClick={() => props.onEnrich(item.id)}
                disabled={enrichBusy}
                className="btn btn-outline h-10 px-3 text-[11.5px]"
                data-testid="enrich-job"
              >
                {enrichBusy ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                {enrichBusy ? "요건 읽는 중" : "원문에서 요건 읽어오기"}
              </button>
            )}
            {thin && item.source.sourceId === "saramin" && (
              <span className="chip bg-paper-deep text-[10px] leading-relaxed text-muted" data-testid="enrich-manual-note">
                사람인 상세는 로그인 후 본문이 열립니다 — 원문에서 확인하세요
              </span>
            )}
            {item.status === "지원 전" && (
              <button
                type="button"
                onClick={() => {
                  props.onUpdate({ ...item, status: "준비중", saved: true, updatedAt: new Date().toISOString() });
                  props.onNotify("지원 준비를 시작했습니다. 아래 지원 문구를 다듬어 지원서에 붙여넣으세요.");
                  window.setTimeout(() => document.querySelector("[data-testid=hub-apply-kit]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
                }}
                className="btn btn-outline h-10 px-3 text-[11.5px]"
                data-testid="prepare-start"
              >
                <Sparkles size={13} /> 지원 준비
              </button>
            )}
            {(item.status === "지원 전" || item.status === "준비중") && (
              <button type="button" onClick={markApplied} className="btn btn-outline h-10 px-3 text-[11.5px]" data-testid="mark-applied">
                <Check size={13} /> 지원완료로 표시
              </button>
            )}
            <button
              type="button"
              onClick={() => props.onToggleSave(item.id)}
              className={cx("btn h-10 px-2.5 text-[10.5px]", saved ? "btn-outline text-accent-deep" : "btn-ghost text-muted")}
              data-testid="detail-save"
              data-saved={saved ? "true" : "false"}
              aria-pressed={saved}
            >
              <Star size={12} /> {saved ? "담음" : "담기"}
            </button>
            <button type="button" onClick={() => props.onRemoveJob(item.id)} className="btn btn-ghost h-10 px-2 text-[10.5px] text-faint hover:text-risk" data-testid="job-remove">
              <Trash2 size={12} /> 빼기
            </button>
          </div>

          <p className="mt-1.5 truncate text-[9.5px] text-faint" title={item.applyUrl}>
            원문 · {item.applyUrl || "없음"}
          </p>
        </div>

        <div className="mt-3 border-t border-line bg-paper-deep/40 px-4 py-2">
          <div className="flex items-center gap-1.5">
            <NotebookPen size={11} className="text-muted" />
            <span className="text-[10px] font-semibold text-ink-2">지원 메모</span>
            <span className="ml-auto text-[9px] text-faint">자동 저장</span>
          </div>
          <textarea
            className="field field-sm mt-1 min-h-[52px] leading-relaxed"
            value={item.memo}
            onChange={(event) => props.onUpdate({ ...item, memo: event.target.value, saved: true, updatedAt: new Date().toISOString() })}
            placeholder="예: 담당자 이름, 제출한 서류, 연락 온 날짜"
            data-testid="job-memo"
          />
        </div>
      </Card>

      <Card className="overflow-hidden" testId="hub-requirements">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">
            <Building2 size={12} />
          </span>
          <span className="text-[12px] font-semibold text-ink">지원 요건 핵심</span>
          <span className="text-[9.5px] text-faint">{job.detailLevel === "full" ? "공고 원문에서 읽은 내용만 표시합니다" : "목록에서 읽은 조건입니다"}</span>
          <CopyButton text={requirementText} label="요건 전체 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
        </div>

        {job.conditions && (
          <div className="flex flex-wrap items-center gap-1 border-b border-line bg-paper-deep/40 px-4 py-1.5">
            <span className="text-[9.5px] font-semibold text-muted">공고 조건</span>
            <span className="text-[10px] text-ink-2">{job.conditions}</span>
            {job.salary && <span className="chip bg-paper text-[9px] text-muted">급여 {job.salary}</span>}
          </div>
        )}

        <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <div data-testid="req-responsibilities">
            <RequirementBlock title="주요 업무" items={duties} empty={job.detailLevel === "list" ? "목록에는 담당 업무가 없습니다. 아래에서 원문 요건을 읽어오세요." : "원문에 주요 업무 항목이 없습니다."} />
          </div>
          <div data-testid="req-requirements">
            <RequirementBlock title="자격 요건" items={requirements} empty={job.detailLevel === "list" ? job.experience || "원문에서 확인하세요." : "원문에 자격 요건 항목이 없습니다."} />
          </div>
          <div data-testid="req-preferred">
            <RequirementBlock title="우대 사항" items={preferred} empty={job.detailLevel === "list" ? "우대 사항은 원문에서 확인하세요." : "원문에 우대 사항 항목이 없습니다."} />
          </div>
          <div data-testid="req-documents">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-ink-2">제출서류 체크</span>
              <span className="num text-[9px] text-faint">
                {checked}/{docs.length}
              </span>
            </div>
            <DocumentChecklist item={item} onUpdate={props.onUpdate} />
          </div>
        </div>
        {job.tone && (
          <div className="border-t border-line px-4 py-2">
            <span className="text-[9.5px] font-semibold text-muted">조직 문화 </span>
            <span className="text-[10px] leading-relaxed text-ink-2">{linesOf(job.tone, 3).join(" · ")}</span>
          </div>
        )}
      </Card>

      <ApplyKitBlock {...props} item={item} />
      <DeepPrepBlock {...props} item={item} />
    </div>
  );
}

export function Hub(props: HubProps) {
  const total = props.jobs.length;
  const feedCount = props.jobs.filter((job) => job.source.kind === "auto" && !isTrackedJob(job)).length;
  const savedCount = total - feedCount;
  const closingSoon = props.jobs.filter((job) => {
    const rank = deadlineRank(job.job.deadline);
    return rank > 0 && rank < Number.MAX_SAFE_INTEGER - 1 && rank - Date.now() < 3 * 86_400_000;
  }).length;

  return (
    <div className="space-y-3">
      <section className="grid-paper overflow-hidden rounded-2xl border border-line bg-surface px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-[640px]">
            <Eyebrow>Auto collect · Prepare · Apply</Eyebrow>
            <h1 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[26px]">
              공고는 알아서 모으고,
              <br className="sm:hidden" /> 지원은 여기서.
            </h1>
            <p className="mt-2 text-[12px] leading-relaxed text-muted sm:text-[13px]">
              첫 화면은 <strong className="font-semibold text-ink-2">리멤버·원티드·사람인·잡코리아</strong>에서 서울 인하우스 홍보·PR 과차장급만 모아 옵니다. 카드를 고르면 내 이력서로 만든
              지원 문구가 바로 나오고, 원문으로 넘어가 직접 지원합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="chip border border-line bg-paper text-[9.5px] text-muted">실시간 자동 수집</span>
            <span className="chip border border-line bg-paper text-[9.5px] text-muted">실제 공고만</span>
            <span className="chip border border-line bg-paper text-[9.5px] text-muted">원문 지원 링크</span>
            <span className="chip border border-line bg-paper text-[9.5px] text-muted">자소서 초안</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-[10px] text-muted">
          <span>
            수집된 공고 <strong className="num text-ink">{feedCount}</strong>
          </span>
          <span>
            담은 공고 <strong className="num text-ink">{savedCount}</strong>
          </span>
          <span>
            마감 3일 이내 <strong className="num text-ink">{closingSoon}</strong>
          </span>
          <span className="ml-auto hidden text-[9.5px] text-faint sm:inline">공고 원문에 없는 내용은 만들지 않습니다</span>
        </div>
      </section>

      <ResumeStrip {...props} />
      <CollectionBar {...props} />

      <div className="grid items-start gap-3 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="min-w-0 lg:sticky lg:top-[60px]">
          <JobList {...props} />
        </div>
        <div className="min-w-0">
          {props.selected ? (
            <JobDetail {...props} item={props.selected} />
          ) : (
            <Card className="grid place-items-center px-6 py-16 text-center">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-paper-deep text-faint">
                <Layers size={19} />
              </div>
              <p className="mt-3 text-[13px] font-semibold text-ink">공고를 고르면 지원 내용이 열립니다</p>
              <p className="mt-1 max-w-[380px] text-[11px] leading-relaxed text-muted">
                지원 요건, 제출서류 체크, 내 이력서로 만든 지원 문구, 원문 직접 지원 버튼, 지원 상태·메모가 한 화면에 모입니다.
              </p>
            </Card>
          )}
        </div>
      </div>

      {props.aiStatus.kind === "local" && (
        <div className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[10px] leading-relaxed text-muted">
          지금은 <strong className="font-semibold text-ink-2">규칙 엔진</strong>으로 지원 문구를 만듭니다. AI 키를 연결하면 같은 내용이 더 자연스러운 문장으로 다듬어집니다.
          공고 수집과 원문 지원은 AI 키 없이도 동작합니다.
        </div>
      )}
    </div>
  );
}
