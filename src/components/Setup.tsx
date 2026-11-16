import { useMemo, useRef } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Building2,
  Check,
  CircleAlert,
  FileText,
  Link2,
  Loader2,
  Mail,
  PenLine,
  RefreshCw,
  Sparkles,
  Target,
  Upload,
  Wallet,
  Wand2,
} from "lucide-react";
import type { AiStatus, JobPosting, JobSource, MasterResume, PriorityId, ResumeRecommendation } from "../types";
import { PRIORITIES } from "../lib/priority";
import { searchLinks } from "../lib/recommend";
import { resumeBulletCount, resumeReady, type ResumeMeta } from "../lib/storage";
import { Card, Eyebrow, SectionHead, cx } from "./ui";

export interface JobFetchError {
  code: string;
  message: string;
  site?: string;
}

export interface SetupProps {
  resume: MasterResume;
  resumeMeta: ResumeMeta | null;
  onResumeFile: (file: File) => void;
  onOpenResume: () => void;
  onSampleResume: () => void;
  resumeBusy: string | null;
  job: JobPosting | null;
  jobSource: JobSource | null;
  jobUrl: string;
  onJobUrl: (value: string) => void;
  onFetchJob: () => void;
  fetching: boolean;
  jobError: JobFetchError | null;
  pasteOpen: boolean;
  onPasteOpen: (open: boolean) => void;
  pasteText: string;
  onPasteText: (value: string) => void;
  onAnalyzePaste: () => void;
  onClearJob: () => void;
  priority: PriorityId | null;
  onPriority: (id: PriorityId) => void;
  targetSalary: number | null;
  onTargetSalary: (value: number | null) => void;
  recommendation: ResumeRecommendation | null;
  onRecommend: (useAi: boolean) => void;
  recommending: boolean;
  onGenerate: () => void;
  generating: boolean;
  aiStatus: AiStatus;
}

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}만원`;

const lineCount = (text: string) => text.split("\n").filter((line) => line.trim().length > 0).length;

function ResumeCard(props: SetupProps) {
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
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">1</span>
        <span className="text-[12px] font-semibold text-ink">내 이력서 — 한 번만 등록</span>
        <span className="ml-auto text-[10px] text-faint">브라우저에 저장 · 다음부터 자동 사용</span>
      </div>

      {ready ? (
        <div className="px-4 py-3.5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[14px] font-semibold text-ink" data-testid="resume-name">
                  {resume.name || "이름 미입력"}
                </span>
                <span className="chip bg-accent-soft text-accent-deep" data-testid="resume-status">
                  <BadgeCheck size={11} /> 등록됨
                </span>
                <span className="chip bg-paper-deep text-muted">{sourceLabel}</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                {[resume.headline, `경력 ${resume.years}년`, `경력 ${resume.experiences.length}개`, `문장 ${bullets}개`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {resume.skills.length > 0 && (
                <p className="mt-1 line-clamp-1 text-[10.5px] text-faint">스킬 · {resume.skills.slice(0, 8).join(", ")}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={props.onOpenResume} className="btn btn-outline h-8 px-2.5 text-[11px]" data-testid="resume-edit">
                <PenLine size={12} /> 편집
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline h-8 px-2.5 text-[11px]" data-testid="resume-replace">
                <Upload size={12} /> 교체
              </button>
              <button type="button" onClick={props.onSampleResume} className="btn btn-ghost h-8 px-2 text-[11px] text-muted">
                샘플
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 py-5">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            이력서를 <strong className="font-semibold">한 번만</strong> 올려 두면, 그다음부터는 공고 URL만 붙여넣으면 됩니다.
            경력·성과 문장이 그대로 원본으로 쓰이고, AI는 여기 없는 경험을 만들지 않습니다.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-accent h-9 px-3 text-[12px]" data-testid="resume-file-btn">
              <Upload size={13} /> 파일로 등록 (.txt · .md · .pdf)
            </button>
            <button type="button" onClick={props.onOpenResume} className="btn btn-outline h-9 px-3 text-[12px]" data-testid="resume-manual">
              <PenLine size={13} /> 직접 입력
            </button>
            <button type="button" onClick={props.onSampleResume} className="btn btn-ghost h-9 px-3 text-[12px] text-muted" data-testid="resume-sample">
              샘플 이력서로 체험
            </button>
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
            PDF는 글자로 된 문서만 읽습니다(스캔 이미지·암호화 PDF는 안내 후 .txt/.md를 권합니다). 샘플은 가상 인물입니다.
          </p>
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
      {resumeBusy && (
        <div className="flex items-center gap-2 border-t border-line bg-paper-deep/60 px-4 py-2 text-[11px] text-muted" data-testid="resume-busy">
          <Loader2 size={12} className="animate-spin" /> {resumeBusy}
        </div>
      )}
    </Card>
  );
}

function JobCard(props: SetupProps) {
  const { job, jobSource, jobUrl, fetching, jobError, pasteOpen, pasteText } = props;
  const isUrl = jobSource?.kind === "url";

  return (
    <Card className="overflow-hidden" testId="job-card">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">2</span>
        <span className="text-[12px] font-semibold text-ink">공고 — URL 한 줄</span>
        <span className="ml-auto text-[10px] text-faint">원티드 · 잡코리아 · 사람인 · 리멤버 · 노션 · 기업 채용페이지</span>
      </div>

      <div className="px-4 py-3.5">
        <div className="flex flex-col gap-1.5 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Link2 size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="field pl-8"
              placeholder="https://www.wanted.co.kr/wd/000000"
              value={jobUrl}
              onChange={(event) => props.onJobUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") props.onFetchJob();
              }}
              data-testid="job-url"
              aria-label="채용 공고 URL"
              inputMode="url"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={props.onFetchJob}
            disabled={fetching}
            className="btn btn-accent h-10 shrink-0 px-4 text-[12.5px]"
            data-testid="job-fetch"
          >
            {fetching ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            {fetching ? "공고 읽는 중" : "공고 불러오기"}
          </button>
        </div>

        {jobError && (
          <div className="mt-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2" data-testid="job-fetch-error">
            <div className="flex items-start gap-1.5">
              <CircleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
              <div className="min-w-0">
                <p className="text-[11.5px] font-medium leading-relaxed text-warn">{jobError.message}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-warn/80">
                  자동 수집이 막힌 사이트에서도, 공고 본문을 붙여넣으면 같은 분석을 받을 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {job && (
          <div className="mt-2.5 rounded-xl border border-line bg-[#fcfcfa] px-3 py-2.5" data-testid="job-preview">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip bg-info-soft text-info">
                {isUrl ? <Link2 size={10} /> : <FileText size={10} />}
                {jobSource?.site || (isUrl ? "URL" : "직접 입력")}
              </span>
              <span className="truncate text-[13px] font-semibold text-ink" data-testid="job-preview-company">
                {job.company || "회사 미확인"}
              </span>
              <span className="chip border border-line bg-surface text-ink-2" data-testid="job-preview-role">
                {job.role || "직무 미확인"}
              </span>
              {job.employmentType && <span className="chip bg-paper-deep text-muted">{job.employmentType}</span>}
              {job.location && <span className="chip bg-paper-deep text-muted">{job.location}</span>}
              <button type="button" onClick={props.onClearJob} className="btn btn-ghost ml-auto h-6 px-1.5 text-[10px] text-muted">
                <RefreshCw size={11} /> 다른 공고
              </button>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted" data-testid="job-preview-summary">
              담당 업무 {lineCount(job.responsibilities)}줄 · 자격 요건 {lineCount(job.requirements)}줄 · 우대 {lineCount(job.preferred)}줄
              {jobSource?.url ? ` · ${jobSource.url.replace(/^https?:\/\//, "").slice(0, 48)}` : ""}
            </p>
            {job.responsibilities && (
              <ul className="mt-1.5 space-y-0.5">
                {job.responsibilities
                  .split("\n")
                  .filter((line) => line.trim())
                  .slice(0, 3)
                  .map((line, index) => (
                    <li key={index} className="truncate text-[10.5px] text-ink-2">
                      · {line}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => props.onPasteOpen(!pasteOpen)}
            className="btn btn-ghost h-7 px-1.5 text-[11px] text-muted"
            data-testid="job-paste-toggle"
            aria-expanded={pasteOpen}
          >
            <FileText size={12} /> {pasteOpen ? "본문 붙여넣기 닫기" : "URL이 막히면 본문 붙여넣기"}
          </button>
          <span className="text-[10px] text-faint">로그인·차단 페이지는 붙여넣기가 더 정확합니다.</span>
        </div>

        {pasteOpen && (
          <div className="mt-2 rounded-xl border border-line bg-paper-deep/40 p-2.5" data-testid="job-paste-panel">
            <textarea
              className="field auto-field min-h-[120px] text-[12px] leading-relaxed"
              placeholder={"공고 본문을 그대로 붙여넣으세요.\n\n예)\n[주요 업무]\n- ...\n\n[자격 요건]\n- ...\n\n[우대 사항]\n- ..."}
              value={pasteText}
              onChange={(event) => props.onPasteText(event.target.value)}
              data-testid="job-paste"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className="num text-[10px] text-faint">{pasteText.replace(/\s+/g, "").length.toLocaleString()}자</span>
              <button
                type="button"
                onClick={props.onAnalyzePaste}
                disabled={pasteText.trim().length < 40}
                className="btn btn-primary ml-auto h-8 px-3 text-[11.5px] disabled:opacity-50"
                data-testid="job-paste-analyze"
              >
                <Sparkles size={12} /> 이 본문으로 분석
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function PriorityCard({ priority, onPriority, targetSalary, onTargetSalary }: SetupProps) {
  const option = PRIORITIES.find((item) => item.id === priority);
  return (
    <Card className="overflow-hidden" testId="priority-card">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">3</span>
        <span className="text-[12px] font-semibold text-ink">이직 우선순위 — 1개만</span>
        <span className="ml-auto hidden text-[10px] text-faint sm:inline">협상 문장과 역질문이 여기에 맞춰 바뀝니다</span>
      </div>
      <div className="px-4 py-3">
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="이직 우선순위">
          {PRIORITIES.map((item) => {
            const active = priority === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onPriority(item.id)}
                data-testid={`priority-${item.id}`}
                className={cx(
                  "flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  active ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span
                  className={cx(
                    "mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border",
                    active ? "border-accent bg-accent text-white" : "border-line-strong",
                  )}
                >
                  {active && <Check size={9} strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className={cx("block text-[11.5px] font-semibold", active ? "text-accent-deep" : "text-ink")}>{item.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-muted">{item.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-paper-deep/50 px-2.5 py-2">
          <span className="flex items-center gap-1 text-[10.5px] font-medium text-muted">
            <Wallet size={11} /> 희망 연봉
          </span>
          <input
            className="field field-sm w-[120px]"
            value={targetSalary ?? ""}
            onChange={(event) => {
              const digits = event.target.value.replace(/[^\d]/g, "");
              onTargetSalary(digits ? Number(digits) : null);
            }}
            placeholder="예: 5500"
            inputMode="numeric"
            data-testid="target-salary"
            aria-label="희망 연봉(만원)"
          />
          <span className="text-[10.5px] text-faint">만원</span>
          {option && (
            <span className="text-[10.5px] text-muted">
              · 협상에서 먼저 꺼낼 카드: <strong className="font-semibold text-ink-2">{option.focus.join(" / ")}</strong>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function RecommendPanel(props: SetupProps) {
  const { resume, recommendation, recommending, aiStatus } = props;
  const ready = resumeReady(resume);
  const linksByTitle = useMemo(
    () => (recommendation?.titles ?? []).map((item) => ({ ...item, links: searchLinks(item.title) })),
    [recommendation],
  );

  return (
    <Card className="overflow-hidden" testId="recommend">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <Target size={13} className="text-accent" />
          <span className="text-[11.5px] font-semibold text-ink">이력서로 찾는 공고 방향</span>
        </div>
        <button
          type="button"
          onClick={() => props.onRecommend(aiStatus.kind === "live")}
          disabled={!ready || recommending}
          className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted disabled:opacity-40"
          data-testid="recommend-refresh"
        >
          {recommending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {recommendation?.source === "ai" ? "AI로 다시" : "다시 계산"}
        </button>
      </div>

      {!ready || !recommendation ? (
        <div className="px-3.5 py-4 text-[11px] leading-relaxed text-muted">
          이력서를 등록하면 지금 경력에 맞는 <strong className="font-semibold text-ink-2">포지션 키워드 3개 · 연봉 참고 범위 · 타깃 기업군 3개</strong>와
          원티드·리멤버·링크드인 검색 링크를 바로 만들어 드립니다.
        </div>
      ) : (
        <div className="divide-y divide-line">
          <div className="px-3.5 py-2.5">
            <Eyebrow>포지션 키워드</Eyebrow>
            <div className="mt-1.5 space-y-2">
              {linksByTitle.map((item, index) => (
                <div key={item.title} data-testid={`recommend-title-${index}`}>
                  <div className="flex items-baseline gap-1.5">
                    <span className="num text-[9.5px] font-semibold text-faint">{String(index + 1).padStart(2, "0")}</span>
                    <span className="text-[12px] font-semibold text-ink">{item.title}</span>
                  </div>
                  <p className="mt-0.5 pl-4 text-[10px] leading-relaxed text-muted">{item.why}</p>
                  <div className="mt-1 flex flex-wrap gap-1 pl-4">
                    {item.links.map((link) => (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="chip border border-line bg-surface text-[9.5px] text-ink-2 hover:border-accent hover:text-accent-deep"
                        title={link.hint}
                        data-testid={`search-${link.label}`}
                      >
                        {link.label} <ArrowUpRight size={9} />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {recommendation.salaryBand && (
            <div className="px-3.5 py-2.5">
              <Eyebrow>연봉 참고 범위 · 추정</Eyebrow>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="num text-[15px] font-semibold text-ink">
                  {won(recommendation.salaryBand.min)} ~ {won(recommendation.salaryBand.max)}
                </span>
                <span className="chip bg-paper-deep text-[9px] text-muted">추정</span>
              </div>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-faint">{recommendation.salaryBand.basis}</p>
            </div>
          )}

          <div className="px-3.5 py-2.5">
            <Eyebrow>타깃 기업군</Eyebrow>
            <ul className="mt-1.5 space-y-1.5">
              {recommendation.targets.map((item, index) => (
                <li key={item.group} className="flex gap-1.5" data-testid={`recommend-target-${index}`}>
                  <Building2 size={11} className="mt-0.5 shrink-0 text-faint" />
                  <div className="min-w-0">
                    <span className="block text-[11px] font-semibold text-ink-2">{item.group}</span>
                    <span className="block text-[9.5px] leading-relaxed text-muted">{item.why}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-1.5 px-3.5 py-2 text-[9.5px] text-faint">
            <Mail size={10} />
            {recommendation.source === "ai" ? `AI 추천${recommendation.model ? ` · ${recommendation.model}` : ""}` : "규칙 기반 추천"}
            <span className="ml-auto">연봉은 확정값이 아닙니다</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export function Setup(props: SetupProps) {
  const ready = resumeReady(props.resume);
  const hasJob = Boolean(props.job && (props.job.responsibilities || props.job.requirements));
  const canGenerate = ready && hasJob && !props.generating;
  const blockedReason = !ready ? "내 이력서를 먼저 등록하세요." : !hasJob ? "공고 URL을 불러오거나 본문을 붙여넣으세요." : "";

  return (
    <div className="space-y-3">
      <section className="grid-paper rounded-2xl border border-line bg-surface px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-[560px]">
            <Eyebrow>Resume first · URL second</Eyebrow>
            <h1 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[26px]">
              이력서는 한 번만.
              <br className="sm:hidden" /> 공고는 URL 한 줄로.
            </h1>
            <p className="mt-2 text-[12px] leading-relaxed text-muted sm:text-[13px]">
              내 이력서를 저장해 두면 공고 주소만 붙여넣어도 회사·담당 업무·자격 요건을 서버가 직접 읽어 옵니다. 그다음 적합도·갭, 1분
              자기소개·경력 하이라이트, 예상 질문 5개와 90초 연습, 역질문·연봉 협상까지 한 화면에서 이어집니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {["공고 URL 읽기", "적합도·갭", "1분 소개", "90초 면접", "연봉 협상"].map((label) => (
              <span key={label} className="chip border border-line bg-paper text-[9.5px] text-muted">
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="min-w-0 space-y-3">
          <ResumeCard {...props} />
          <JobCard {...props} />
          <PriorityCard {...props} />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={props.onGenerate}
              disabled={!canGenerate}
              className="btn btn-primary h-11 flex-1 px-4 text-[13px] disabled:opacity-45"
              data-testid="generate"
            >
              {props.generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {props.generating ? "지원 패키지 만드는 중" : "지원 패키지 만들기"}
              {!props.generating && <ArrowRight size={14} />}
            </button>
            <span className="text-[10.5px] text-faint sm:max-w-[220px]" data-testid="generate-hint">
              {blockedReason || "원문에 없는 경험·수치는 만들지 않습니다."}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <RecommendPanel {...props} />
          {props.aiStatus.kind === "local" && (
            <div className="mt-2 rounded-xl border border-line bg-surface px-3 py-2 text-[10px] leading-relaxed text-muted">
              지금은 <strong className="font-semibold text-ink-2">규칙 엔진</strong>으로 돌고 있습니다. AI 키를 연결하면 같은 결과가 더 자연스러운
              문장으로 나옵니다. URL 수집과 이력서 저장은 AI 키 없이도 동작합니다.
            </div>
          )}
        </div>
      </div>

      <SectionHead
        className="px-1 pt-1"
        eyebrow="How it works"
        title="남이 써도 한 번에 끝나는 순서"
        desc="① 이력서 등록 → ② 공고 URL → ③ 우선순위 → 패키지 생성. 이후에는 공고만 바꿔 반복하면 됩니다."
      />
    </div>
  );
}
