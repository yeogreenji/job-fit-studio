import { useMemo, useRef } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
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
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  Wallet,
} from "lucide-react";
import type { AiStatus, HubJob, MasterResume, PriorityId } from "../types";
import { APPLY_STATUSES, STATUS_CHIP, STATUS_DOT, docItems, linesOf } from "../lib/apply";
import { NO_DOCUMENTS_HINT, splitJobUrls, type AddProgress } from "../lib/hub";
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

const deadlineLabel = (deadline: string): string => {
  if (!deadline) return "마감일 미확인";
  return /^\d{4}-\d{2}-\d{2}/.test(deadline) ? deadline.slice(0, 10) : deadline;
};

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
              한 번만 올려 두면, 모은 공고마다 <strong className="font-semibold text-ink-2">내 경력으로 만든 지원 문구</strong>가 바로 나옵니다.
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

function AddBar(props: HubProps) {
  const urlCount = splitJobUrls(props.urlsText).length;
  const active = props.progress.filter((item) => item.state !== "waiting");

  return (
    <Card className="overflow-hidden" testId="hub-add">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">
          <Layers size={12} />
        </span>
        <span className="text-[12px] font-semibold text-ink">공고 모으기 — 여러 개를 한 번에</span>
        <span className="ml-auto text-[10px] text-faint">
          원티드 · 잡코리아 · 사람인 · 리멤버 · 링크드인 · 기업 채용페이지
        </span>
      </div>

      <div className="px-3.5 py-3">
        <textarea
          className="field min-h-[74px] text-[12px] leading-relaxed"
          placeholder={"공고 주소를 한 줄에 하나씩 붙여넣으세요.\nhttps://www.wanted.co.kr/wd/000000\nhttps://www.jobkorea.co.kr/Recruit/GI_Read/0000000\nhttps://careers.example.com/jobs/000"}
          value={props.urlsText}
          onChange={(event) => props.onUrlsText(event.target.value)}
          data-testid="hub-urls"
          aria-label="공고 URL 여러 개"
          spellCheck={false}
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => props.onPasteOpen(!props.pasteOpen)}
            className="btn btn-ghost h-7 px-1.5 text-[10.5px] text-muted"
            data-testid="hub-paste-toggle"
            aria-expanded={props.pasteOpen}
          >
            <FileText size={12} /> {props.pasteOpen ? "본문 붙여넣기 닫기" : "URL이 막히면 본문 붙여넣기"}
          </button>
          <span className="num text-[10px] text-faint" data-testid="hub-url-count">
            {urlCount ? `주소 ${urlCount}개 인식` : "주소를 붙여넣으면 개수를 셉니다"}
          </span>
          <button
            type="button"
            onClick={props.onAddUrls}
            disabled={props.adding || urlCount === 0}
            className="btn btn-accent ml-auto h-9 px-3.5 text-[12px] disabled:opacity-50"
            data-testid="hub-fetch"
          >
            {props.adding ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
            {props.adding ? "공고 읽는 중" : urlCount > 1 ? `공고 ${urlCount}개 불러오기` : "공고 불러오기"}
          </button>
        </div>

        {props.pasteOpen && (
          <div className="mt-2 rounded-xl border border-line bg-paper-deep/40 p-2.5" data-testid="hub-paste-panel">
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
              className="field min-h-[100px] text-[12px] leading-relaxed"
              placeholder={"공고 본문을 그대로 붙여넣으세요.\n\n[주요 업무]\n- ...\n\n[자격 요건]\n- ...\n\n[우대 사항]\n- ...\n\n[제출서류]\n- ..."}
              value={props.pasteText}
              onChange={(event) => props.onPasteText(event.target.value)}
              data-testid="hub-paste-text"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-[10px] leading-relaxed text-faint">로그인·차단 페이지는 본문 붙여넣기가 더 정확합니다.</span>
              <button
                type="button"
                onClick={props.onAddPaste}
                disabled={props.pasteText.trim().length < 40}
                className="btn btn-primary ml-auto h-8 px-3 text-[11.5px] disabled:opacity-50"
                data-testid="hub-paste-add"
              >
                <Sparkles size={12} /> 이 본문으로 추가
              </button>
            </div>
          </div>
        )}

        {active.length > 0 && (
          <ul className="mt-2 space-y-1" data-testid="hub-progress">
            {props.progress
              .filter((item) => item.state !== "waiting")
              .map((item, index) => (
                <li key={`${item.url}-${index}`} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed">
                  {item.state === "loading" && <Loader2 size={11} className="mt-0.5 shrink-0 animate-spin text-muted" />}
                  {item.state === "done" && <Check size={11} className="mt-0.5 shrink-0 text-ok" strokeWidth={3} />}
                  {item.state === "failed" && <CircleAlert size={11} className="mt-0.5 shrink-0 text-warn" />}
                  <span className={cx("min-w-0 truncate", item.state === "failed" ? "text-warn" : "text-muted")} title={item.url}>
                    {item.state === "done" ? item.message : item.state === "failed" ? `${hostOf(item.url)} — ${item.message}` : `${hostOf(item.url)} 읽는 중`}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function JobList(props: HubProps) {
  return (
    <Card className="overflow-hidden" testId="hub-list">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <ClipboardList size={13} className="text-muted" />
        <span className="text-[11.5px] font-semibold text-ink">모은 공고</span>
        <span className="num chip bg-paper-deep text-[9.5px] text-muted" data-testid="hub-count">
          {props.jobs.length}
        </span>
        <span className="ml-auto text-[9.5px] text-faint">카드를 고르면 지원 내용이 열립니다</span>
      </div>
      {props.jobs.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-paper-deep text-faint">
            <Layers size={16} />
          </div>
          <p className="mt-2 text-[12px] font-semibold text-ink">아직 모은 공고가 없습니다</p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
            위 칸에 공고 주소를 여러 개 붙여넣고 한 번에 불러오세요. 하나씩 추가해도 됩니다.
          </p>
        </div>
      ) : (
        <ul className="max-h-[560px] divide-y divide-line overflow-y-auto scroll-thin">
          {props.jobs.map((item) => {
            const active = props.selected?.id === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => props.onSelect(item.id)}
                  data-testid="hub-job"
                  data-job-id={item.id}
                  data-active={active ? "true" : "false"}
                  className={cx(
                    "flex w-full items-start gap-2 px-3.5 py-2.5 text-left transition-colors",
                    active ? "bg-accent-soft/45" : "hover:bg-[#fbfbf8]",
                  )}
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[item.status] }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-ink">{item.job.company || "회사 미확인"}</span>
                      {item.draft && <Sparkles size={9} className="shrink-0 text-accent" />}
                    </span>
                    <span className="mt-0.5 block truncate text-[10.5px] text-ink-2">{item.job.role || "직무 미확인"}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] text-faint">
                      <span>{item.source.site || hostOf(item.source.url ?? "")}</span>
                      <span>·</span>
                      <span>{item.job.deadline || "마감 미확인"}</span>
                    </span>
                  </span>
                  <span className={cx("chip mt-0.5 shrink-0 px-1.5 py-0.5 text-[9px]", STATUS_CHIP[item.status])}>{item.status}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {props.jobs.length > 0 && (
        <div className="border-t border-line px-3.5 py-1.5 text-[9px] text-faint">
          지원 여부·메모·문구는 이 브라우저에 자동 저장됩니다.
        </div>
      )}
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
  if (!docs.length) return <p className="mt-1 text-[10px] leading-relaxed text-faint">{NO_DOCUMENTS_HINT}</p>;
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
            이력서를 등록하면 <strong className="font-semibold">이 공고의 요구와 내 경력 문장을 연결한</strong> 한 줄 어필·지원서 초안이 바로
            만들어집니다.
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
              <CopyButton
                text={draft.coverLetter}
                label="전체 복사"
                className="ml-auto h-6 px-1.5 text-[10px]"
              />
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

          <p className="text-[9px] leading-relaxed text-faint">
            이력서 원문에 없는 경험·수치·회사는 만들지 않습니다. 지원서 양식에 맞춰 문장을 다듬어 붙여넣으세요.
          </p>
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

  const requirementText = useMemo(
    () =>
      [
        `■ ${job.company || "회사 미확인"} — ${job.role || "직무 미확인"}`,
        `· 근무: ${[job.employmentType, job.location].filter(Boolean).join(" / ") || "미확인"}`,
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
        ...(docs.length ? docs.map((line) => `- ${line}`) : [NO_DOCUMENTS_HINT]),
        "",
        `지원 링크: ${item.applyUrl || "원문 링크 없음"}`,
      ].join("\n"),
    [docs, duties, item.applyUrl, job.company, job.deadline, job.employmentType, job.location, job.role, preferred, requirements],
  );

  const markApplied = () => {
    props.onUpdate({ ...item, status: "지원완료", updatedAt: new Date().toISOString() });
    props.onNotify(`${job.company || "이 공고"}를 지원완료로 표시했습니다.`);
  };

  return (
    <div className="space-y-3" data-testid="hub-detail">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5">
          <span className="chip bg-info-soft text-[9.5px] text-info" data-testid="detail-site">
            <Link2 size={10} /> {item.source.site || hostOf(item.source.url ?? "")}
          </span>
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
          <Eyebrow>Application hub</Eyebrow>
          <h1 className="mt-1 text-[20px] font-semibold leading-tight tracking-[-0.03em] text-ink" data-testid="detail-company">
            {job.company || "회사 미확인"}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2" data-testid="detail-role">
            {job.role || "직무 미확인"}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1" role="group" aria-label="지원 상태">
            {APPLY_STATUSES.map((status, index) => {
              const active = item.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => props.onUpdate({ ...item, status, updatedAt: new Date().toISOString() })}
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
                이 공고에 직접 지원하기 <ArrowUpRight size={14} />
              </a>
            ) : (
              <span className="chip bg-warn-soft text-[10.5px] text-warn">
                <CircleAlert size={11} /> 원문 지원 링크를 찾지 못했습니다. 공고 본문에서 확인하세요.
              </span>
            )}
            {(item.status === "지원 전" || item.status === "준비중") && (
              <button type="button" onClick={markApplied} className="btn btn-outline h-10 px-3 text-[11.5px]" data-testid="mark-applied">
                <Check size={13} /> 지원완료로 표시
              </button>
            )}
            <button type="button" onClick={() => props.onRemoveJob(item.id)} className="btn btn-ghost h-10 px-2 text-[10.5px] text-faint hover:text-risk" data-testid="job-remove">
              <Trash2 size={12} /> 빼기
            </button>
          </div>

          <p className="mt-1.5 truncate text-[9.5px] text-faint" title={item.applyUrl}>
            지원 링크 · {item.applyUrl || "없음"}
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
            onChange={(event) => props.onUpdate({ ...item, memo: event.target.value, updatedAt: new Date().toISOString() })}
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
          <span className="text-[9.5px] text-faint">공고 원문에서 읽은 내용만 표시합니다</span>
          <CopyButton text={requirementText} label="요건 전체 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
        </div>
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
          <div data-testid="req-responsibilities">
            <RequirementBlock title="주요 업무" items={duties} empty="원문에 주요 업무 항목이 없습니다." />
          </div>
          <div data-testid="req-requirements">
            <RequirementBlock title="자격 요건" items={requirements} empty="원문에 자격 요건 항목이 없습니다." />
          </div>
          <div data-testid="req-preferred">
            <RequirementBlock title="우대 사항" items={preferred} empty="원문에 우대 사항 항목이 없습니다." />
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
  return (
    <div className="space-y-3">
      <section className="grid-paper rounded-2xl border border-line bg-surface px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-[640px]">
            <Eyebrow>Collect · prepare · apply</Eyebrow>
            <h1 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[26px]">
              공고는 여러 개,
              <br className="sm:hidden" /> 지원은 한 곳에서.
            </h1>
            <p className="mt-2 text-[12px] leading-relaxed text-muted sm:text-[13px]">
              공고 주소를 한 번에 여러 개 붙여넣으면 <strong className="font-semibold text-ink-2">주요 업무·자격 요건·우대 사항·제출서류·마감일·원문 지원 링크</strong>
              를 모아 옵니다. 카드를 고르면 내 이력서로 만든 지원 문구가 바로 나오고, 원문으로 넘어가 직접 지원합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {["여러 URL 동시 수집", "지원 요건 요약", "지원 문구·자소서 초안", "원문 지원 링크"].map((label) => (
              <span key={label} className="chip border border-line bg-paper text-[9.5px] text-muted">
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <ResumeStrip {...props} />
      <AddBar {...props} />

      <div className="grid items-start gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 lg:sticky lg:top-[60px]">
          <JobList {...props} />
        </div>
        <div className="min-w-0">
          {props.selected ? (
            <JobDetail {...props} item={props.selected} />
          ) : (
            <Card className="grid place-items-center px-6 py-16 text-center">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-paper-deep text-faint">
                <ClipboardList size={19} />
              </div>
              <p className="mt-3 text-[13px] font-semibold text-ink">공고를 모으면 여기에 지원 내용이 열립니다</p>
              <p className="mt-1 max-w-[380px] text-[11px] leading-relaxed text-muted">
                지원 요건, 제출서류 체크, 내 이력서로 만든 지원 문구, 원문 직접 지원 버튼, 지원 상태·메모가 한 화면에 모입니다.
              </p>
            </Card>
          )}
        </div>
      </div>

      {props.aiStatus.kind === "local" && (
        <div className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[10px] leading-relaxed text-muted">
          지금은 <strong className="font-semibold text-ink-2">규칙 엔진</strong>으로 지원 문구를 만듭니다. AI 키를 연결하면 같은 내용이 더 자연스러운
          문장으로 다듬어집니다. 공고 수집과 직접 지원은 AI 키 없이도 동작합니다.
        </div>
      )}
    </div>
  );
}
