import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Loader2,
  Mail,
  MessageSquareQuote,
  Mic,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { ApplyDraft, ApplyPrep, ApplyRecord, CareerKit, DocMatch, HubJob, MasterResume } from "../types";
import { DOC_LABEL } from "../lib/careerKit";
import { buildApplyPacket } from "../lib/applyPacket";
import { speakingSeconds } from "../lib/coach";
import { docItems } from "../lib/apply";
import { ddayOf } from "../lib/collect";
import { CopyButton, cx } from "./ui";

const VIA_LABEL: Record<ApplyRecord["via"], string> = {
  site: "채용 사이트",
  email: "이메일",
  other: "기타 경로",
};

const clockOf = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * 지원 준비 및 접수 드로어.
 *
 * 1) 업로드한 서류와 공고 제출서류를 확인하고 2) 맞춤 문구를 복사해 채용 사이트·이메일로 제출한 뒤
 * 3) ‘지원 완료로 기록’을 누르면 지원완료 칸으로 옮기며 제출 시각·서류·경로를 남깁니다.
 * 채용 사이트 로그인과 지원서 양식은 대신하지 않습니다.
 */
export function ApplyDrawer({
  job,
  kit,
  resume,
  draft,
  docMatch,
  prep,
  prepBusy,
  onPrepare,
  queue,
  onStep,
  onPrev,
  onClose,
  onUpdate,
  onRecord,
  onOpenKit,
}: {
  job: HubJob | null;
  kit: CareerKit;
  resume: MasterResume;
  draft: ApplyDraft | null;
  docMatch: DocMatch | null;
  /** 지원 동기·1분 자기소개·예상 질문을 미리 만들어 둔 묶음 */
  prep: ApplyPrep | null;
  prepBusy: boolean;
  onPrepare: () => void;
  /** 적합 상위 공고를 차례로 준비할 때의 위치 */
  queue: { index: number; total: number } | null;
  onStep: () => void;
  onPrev: () => void;
  onClose: () => void;
  onUpdate: (job: HubJob) => void;
  onRecord: (job: HubJob, via: ApplyRecord["via"], documents: string[], oneLiner: string) => void;
  onOpenKit: () => void;
}) {
  const [via, setVia] = useState<ApplyRecord["via"]>("site");
  const [siteOpened, setSiteOpened] = useState(false);
  const [openQuestion, setOpenQuestion] = useState<number | null>(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  /** 드로어를 열면 그 공고의 1분 자기소개·예상 질문을 바로 준비합니다. */
  useEffect(() => {
    if (!job) return;
    onPrepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  /** 기록하면 확인 패널이 가장 위에 오도록 본문을 올립니다. */
  useEffect(() => {
    if (job?.applied) bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [job?.applied?.at]);

  useEffect(() => {
    if (job) {
      setVia(job.applied?.via ?? "site");
      setSiteOpened(false);
    }
  }, [job?.id, job?.applied?.via]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const packet = useMemo(() => {
    if (!job) return null;
    return buildApplyPacket({ kit, resume, job: job.job, draft });
  }, [draft, job, kit, resume]);

  if (!job || !packet) return null;

  const applied = job.applied;
  const readyRows = packet.documents.filter((row) => row.ready);
  const jdDocs = docItems(job.job);
  const dday = ddayOf(job.job.deadline);
  const checked = job.documentsChecked.filter((doc) => jdDocs.includes(doc));

  const toggleDoc = (doc: string) => {
    const next = job.documentsChecked.includes(doc)
      ? job.documentsChecked.filter((value) => value !== doc)
      : [...job.documentsChecked, doc];
    onUpdate({ ...job, documentsChecked: next, saved: true, updatedAt: new Date().toISOString() });
  };

  const record = () => {
    const documents = [...readyRows.map((row) => row.label), ...checked];
    onRecord(job, via, documents, packet.oneLiner);
  };

  const steps = [
    { label: "맞춤 서류 확인", done: readyRows.length > 0 },
    { label: "채용 페이지·이메일로 제출", done: Boolean(applied) || siteOpened || via !== "site" },
    { label: "지원 완료 기록", done: Boolean(applied) },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        className="animate-rise relative flex h-full w-full max-w-[560px] flex-col border-l border-line bg-surface shadow-2xl"
        data-testid="apply-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="지원 준비 및 접수"
      >
        {/* 머리 */}
        <div className="flex items-start gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="chip bg-ink px-1.5 py-0 text-[9px] font-semibold text-white">원클릭 지원 준비</span>
              {queue && (
                <span className="num text-[9.5px] text-muted" data-testid="apply-queue-pos">
                  {queue.index + 1} / {queue.total}건
                </span>
              )}
            </div>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-ink">지원 준비 및 접수</h2>
            <p className="mt-1 truncate text-[11px] text-muted" data-testid="apply-drawer-job">
              <span className="font-semibold text-ink" data-testid="apply-drawer-company">
                {job.job.company || "회사 미확인"}
              </span>
              <span className="mx-1 text-line-strong">·</span>
              {job.job.role || "직무 미확인"}
              <span className="mx-1 text-line-strong">·</span>
              <span className={cx("chip px-1.5 py-0 text-[9px]", dday.tone === "soon" ? "bg-risk-soft text-risk" : "bg-paper-deep text-muted")}>
                {dday.label}
              </span>
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-faint">로그인과 최종 제출은 채용 사이트에서 직접 — 계정 보호와 최종 확인 때문입니다.</p>
          </div>
          {queue && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onPrev}
                disabled={queue.index === 0}
                className="btn btn-ghost h-7 w-7 px-0 text-muted disabled:opacity-30"
                aria-label="이전 공고"
                data-testid="apply-prev"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={onStep}
                disabled={queue.index >= queue.total - 1}
                className="btn btn-ghost h-7 w-7 px-0 text-muted disabled:opacity-30"
                aria-label="다음 공고"
                data-testid="apply-next"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기" data-testid="apply-close">
            <X size={16} />
          </button>
        </div>

        {/* 단계 */}
        <div className="flex items-center gap-1.5 border-b border-line bg-paper-deep/30 px-4 py-1.5">
          {steps.map((step, index) => (
            <span key={step.label} className="flex min-w-0 items-center gap-1 text-[9.5px]">
              <span
                className={cx(
                  "num grid h-4 w-4 shrink-0 place-items-center rounded text-[8.5px] font-semibold",
                  step.done ? "bg-accent text-white" : "bg-paper-deep text-muted",
                )}
              >
                {step.done ? <Check size={9} strokeWidth={3} /> : index + 1}
              </span>
              <span className={cx("truncate", step.done ? "text-ink-2" : "text-muted")}>{step.label}</span>
              {index < steps.length - 1 && <span className="mx-0.5 h-px w-3 shrink-0 bg-line-strong" />}
            </span>
          ))}
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 scroll-thin">
          {applied && (
            <div className="rounded-lg border border-ok/30 bg-ok-soft/60 px-3 py-2" data-testid="apply-recorded">
              <div className="flex items-center gap-1.5">
                <BadgeCheck size={12} className="text-ok" />
                <span className="text-[10.5px] font-semibold text-ok">지원 완료로 기록됨</span>
                <span className="num ml-auto text-[9.5px] text-ink-2">{clockOf(applied.at)}</span>
              </div>
              <p className="mt-1 text-[9.5px] leading-relaxed text-ink-2">
                {VIA_LABEL[applied.via]} · 제출 서류 {applied.documents.length ? applied.documents.join(" · ") : "기록 없음"}
              </p>
            </div>
          )}
          {applied && queue && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2" data-testid="apply-queue-next-panel">
              {queue.index < queue.total - 1 ? (
                <>
                  <span className="text-[10px] text-ink-2">
                    다음은 {queue.index + 2}번째 공고입니다. 준비 문구가 이미 만들어져 있습니다.
                  </span>
                  <button type="button" onClick={onStep} className="btn btn-primary ml-auto h-7 px-2.5 text-[10.5px]" data-testid="apply-queue-next">
                    다음 공고 이어서 <ChevronRight size={11} />
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-ink-2">
                  적합 상위 {queue.total}건 지원 준비를 모두 마쳤습니다. 지원 현황에서 상태를 관리하세요.
                </span>
              )}
            </div>
          )}

          {/* 적합도·대조 */}
          <div className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-2" data-testid="apply-match">
            <div className="flex flex-wrap items-center gap-1.5">
              <ClipboardCheck size={12} className="text-muted" />
              <span className="text-[10.5px] font-semibold text-ink-2">내 서류와 이 공고</span>
              {docMatch && !docMatch.needsKit ? (
                <span className="num chip bg-accent-soft px-1.5 py-0 text-[9.5px] text-accent-deep" data-testid="apply-match-score">
                  서류 적합 {docMatch.score}%
                </span>
              ) : (
                <button type="button" onClick={onOpenKit} className="chip bg-paper-deep px-1.5 py-0 text-[9.5px] text-muted">
                  서류를 올리면 대조합니다
                </button>
              )}
              <span className="ml-auto text-[9px] text-faint">{docMatch && !docMatch.needsKit ? docMatch.summary : "이력서·자소서·포폴 업로드"}</span>
            </div>
            {docMatch && docMatch.matched.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1" data-testid="apply-match-reasons">
                {docMatch.matched.slice(0, 4).map((item) => (
                  <li key={`${item.doc}-${item.label}`} className="chip border border-line bg-surface text-[9px] text-ink-2">
                    {DOC_LABEL[item.doc]} · {item.label}
                    <span className="ml-0.5 text-faint">{item.where}</span>
                  </li>
                ))}
              </ul>
            )}
            {docMatch && docMatch.gaps.length > 0 && (
              <p className="mt-1 text-[9px] leading-relaxed text-warn" data-testid="apply-match-gaps">
                {docMatch.gaps[0]}
              </p>
            )}
          </div>

          {/* 서류 체크리스트 */}
          <div className="rounded-lg border border-line px-3 py-2">
            <div className="flex items-center gap-1.5">
              <FolderOpen size={12} className="text-muted" />
              <span className="text-[10.5px] font-semibold text-ink-2">제출 서류</span>
              <span className="num text-[9px] text-faint">
                {readyRows.length}/{packet.documents.length}
              </span>
              <button type="button" onClick={onOpenKit} className="ml-auto text-[9px] text-muted underline-offset-2 hover:underline">
                서류 바꾸기
              </button>
            </div>
            <ul className="mt-1 space-y-0.5" data-testid="apply-doc-list">
              {packet.documents.slice(0, 3).map((row) => (
                <li key={row.label} className="flex items-start gap-1.5 text-[10px] leading-relaxed" data-testid="apply-doc-row" data-ready={row.ready ? "true" : "false"}>
                  <span
                    className={cx(
                      "mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded border",
                      row.ready ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-transparent",
                    )}
                  >
                    <Check size={9} strokeWidth={3} />
                  </span>
                  <span className={cx("min-w-0 flex-1", row.ready ? "text-ink-2" : "text-muted")}>
                    <span className="font-semibold">{row.label}</span>
                    <span className="ml-1 text-[9px] text-faint">{row.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            {jdDocs.length > 0 && (
              <div className="mt-1.5 border-t border-line pt-1.5">
                <div className="text-[9px] font-semibold text-muted">공고가 요구하는 서류 — 준비한 것 체크</div>
                <ul className="mt-1 space-y-0.5" data-testid="apply-jd-docs">
                  {jdDocs.slice(0, 6).map((doc) => {
                    const done = checked.includes(doc);
                    return (
                      <li key={doc}>
                        <button
                          type="button"
                          onClick={() => toggleDoc(doc)}
                          aria-pressed={done}
                          data-testid="apply-jd-doc"
                          data-checked={done ? "true" : "false"}
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
                          <span className={cx("text-[10px] leading-relaxed", done ? "text-faint line-through" : "text-ink-2")}>{doc}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* 한 줄 어필 */}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-ink-2">한 줄 어필</span>
              <CopyButton text={packet.oneLiner} label="복사" className="ml-auto h-6 px-1.5 text-[10px]" />
            </div>
            <p className="mt-1 rounded-lg border border-accent/25 bg-accent-soft/40 px-2.5 py-2 text-[12px] font-semibold leading-relaxed text-ink" data-testid="apply-one-liner">
              {packet.oneLiner}
            </p>
          </div>

          {/* 자소서 핵심 문단 = 지원 동기 */}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-ink-2">지원 동기 · 자소서 문단</span>
              <span className="text-[9px] text-faint">서류에 적힌 문장만으로 만듭니다</span>
              <CopyButton text={packet.coverParagraph} label="복사" className="ml-auto h-6 px-1.5 text-[10px]" />
            </div>
            <p className="mt-1 whitespace-pre-line rounded-lg border border-line bg-[#fcfcfa] px-3 py-2.5 text-[11.5px] leading-[1.8] text-ink-2" data-testid="apply-paragraph">
              {packet.coverParagraph}
            </p>
          </div>

          {/* 1분 자기소개 · 면접 예상 질문 — 열면 바로 준비됩니다 */}
          <div className="rounded-xl border border-line" data-testid="apply-prep">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
              <Sparkles size={12} className="text-accent" />
              <span className="text-[10.5px] font-semibold text-ink-2">면접까지 자동 준비</span>
              {prepBusy && (
                <span className="chip bg-paper-deep text-[9px] text-muted" data-testid="apply-prep-busy">
                  <Loader2 size={9} className="animate-spin" /> 만드는 중
                </span>
              )}
              {prep && (
                <span
                  className={cx("chip text-[9px]", prep.source === "ai" ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}
                  data-testid="apply-prep-source"
                >
                  {prep.source === "ai" ? `AI 준비${prep.model ? ` · ${prep.model}` : ""}` : "규칙 준비"}
                </span>
              )}
              {prep && prep.questions.length > 0 && (
                <CopyButton
                  text={[`[1분 자기소개]`, prep.intro, "", `[면접 예상 질문]`, ...prep.questions.map((q, i) => `Q${i + 1}. ${q.question}\n${q.answer}`)].join("\n")}
                  label="전체 복사"
                  className="ml-auto h-6 px-1.5 text-[10px]"
                />
              )}
            </div>

            {/* 1분 자기소개 */}
            <div className="border-b border-line px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <Mic size={11} className="text-muted" />
                <span className="text-[10.5px] font-semibold text-ink-2">1분 자기소개</span>
                {prep?.intro && (
                  <span className="num text-[9px] text-faint">
                    {prep.intro.replace(/\s/g, "").length}자 · 약 {speakingSeconds(prep.intro)}초
                  </span>
                )}
                {prep?.intro && <CopyButton text={prep.intro} label="복사" className="ml-auto h-6 px-1.5 text-[10px]" />}
              </div>
              {prep?.intro ? (
                <p className="mt-1.5 whitespace-pre-line rounded-lg border border-line bg-[#fcfcfa] px-3 py-2.5 text-[11.5px] leading-[1.85] text-ink-2" data-testid="apply-intro">
                  {prep.intro}
                </p>
              ) : prepBusy ? (
                <div className="mt-1.5 space-y-1.5">
                  <div className="skeleton-sweep h-3 w-full rounded bg-paper-deep" />
                  <div className="skeleton-sweep h-3 w-4/5 rounded bg-paper-deep" />
                </div>
              ) : (
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted">이력서를 올리면 지원 동기와 함께 1분 자기소개를 만들어 둡니다.</p>
              )}
            </div>

            {/* 예상 질문 */}
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <MessageSquareQuote size={11} className="text-muted" />
                <span className="text-[10.5px] font-semibold text-ink-2">면접 예상 질문</span>
                {prep && <span className="num text-[9px] text-faint">{prep.questions.length}개 · 답변 스크립트</span>}
              </div>
              {prep && prep.questions.length > 0 ? (
                <ul className="mt-1.5 space-y-1" data-testid="apply-questions">
                  {prep.questions.map((question, index) => {
                    const open = openQuestion === index;
                    return (
                      <li key={`${question.question}-${index}`} className="rounded-lg border border-line bg-surface" data-testid="apply-question">
                        <button
                          type="button"
                          onClick={() => setOpenQuestion(open ? null : index)}
                          aria-expanded={open}
                          className="flex w-full items-start gap-1.5 px-2.5 py-2 text-left"
                        >
                          <span className="num mt-0.5 text-[9px] font-semibold text-accent-deep">Q{index + 1}</span>
                          <span className="min-w-0 flex-1 text-[10.5px] font-semibold leading-relaxed text-ink-2">{question.question}</span>
                          {question.category && <span className="chip bg-paper-deep px-1.5 py-0 text-[8.5px] text-muted">{question.category}</span>}
                          <ChevronDown size={11} className={cx("mt-0.5 shrink-0 text-faint transition-transform", open && "rotate-180")} />
                        </button>
                        {open && (
                          <div className="space-y-1.5 border-t border-line px-2.5 py-2">
                            {question.why && <p className="text-[9px] leading-relaxed text-faint">면접관의 의도 · {question.why}</p>}
                            <p className="whitespace-pre-line text-[10.5px] leading-[1.8] text-ink-2" data-testid="apply-question-answer">
                              {question.answer}
                            </p>
                            {question.avoid && <p className="text-[9px] leading-relaxed text-warn">피해야 할 답변 · {question.avoid}</p>}
                            <CopyButton
                              text={`${question.question}\n\n${question.answer}`}
                              label="질문·답변 복사"
                              className="h-6 px-1.5 text-[9.5px]"
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
                  {prepBusy ? "이 공고와 내 경력을 대조해 질문을 만드는 중입니다." : "이력서를 올리면 공고 요건과 내 경력을 대조한 예상 질문을 만듭니다."}
                </p>
              )}
            </div>
          </div>

          {/* 이메일 지원 */}
          <div className="rounded-lg border border-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Mail size={12} className="text-muted" />
              <span className="text-[10.5px] font-semibold text-ink-2">이메일 지원 패키지</span>
              {packet.emailTo ? (
                <span className="chip bg-info-soft px-1.5 py-0 text-[9px] text-info" data-testid="apply-email-to">
                  {packet.emailTo}
                </span>
              ) : (
                <span className="chip bg-paper-deep px-1.5 py-0 text-[9px] text-muted">공고에 이메일 없음</span>
              )}
              <CopyButton text={`제목: ${packet.emailSubject}\n\n${packet.emailBody}`} label="메일 전체 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
            </div>
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="chip bg-paper-deep px-1.5 py-0 text-[8.5px] text-muted">제목</span>
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-2" data-testid="apply-email-subject">
                  {packet.emailSubject}
                </span>
                <CopyButton text={packet.emailSubject} label="" className="h-5 w-5 px-0" />
              </div>
              <p className="whitespace-pre-line rounded border border-line bg-[#fcfcfa] px-2.5 py-2 text-[10px] leading-relaxed text-ink-2" data-testid="apply-email-body">
                {packet.emailBody}
              </p>
              {packet.emailTo && (
                <a
                  href={`mailto:${packet.emailTo}?subject=${encodeURIComponent(packet.emailSubject)}&body=${encodeURIComponent(packet.emailBody)}`}
                  className="btn btn-outline h-7 px-2 text-[10px]"
                  data-testid="apply-mailto"
                  onClick={() => setVia("email")}
                >
                  <Mail size={11} /> 메일 앱으로 열기
                </a>
              )}
            </div>
          </div>

          {/* 전체 복붙 */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-paper-deep/30 px-3 py-2">
            <FileText size={12} className="text-muted" />
            <span className="text-[10px] text-ink-2">지원서에 붙일 전체 묶음 (한 줄 어필 · 자소서 문단 · 제출 서류)</span>
            <CopyButton text={packet.fullText} label="전체 복사" className="ml-auto h-6 px-2 text-[10px]" />
          </div>

          <ul className="space-y-0.5" data-testid="apply-notes">
            {packet.notes.map((note) => (
              <li key={note} className="flex items-start gap-1 text-[9px] leading-relaxed text-faint">
                <ShieldCheck size={9} className="mt-0.5 shrink-0" /> {note}
              </li>
            ))}
          </ul>

        </div>

        {/* 바닥 · 제출 경로와 실행 */}
        <div className="border-t border-line bg-surface px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9.5px] font-semibold text-muted">제출 경로</span>
            {(["site", "email", "other"] as ApplyRecord["via"][]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setVia(option)}
                aria-pressed={via === option}
                data-testid={`apply-via-${option}`}
                className={cx(
                  "rounded-md border px-2 py-0.5 text-[9.5px] font-semibold transition-colors",
                  via === option ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-line-strong",
                )}
              >
                {VIA_LABEL[option]}
              </button>
            ))}
            <span className="ml-auto text-[9px] text-faint">로그인·양식은 채용 사이트에서 직접 진행합니다</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {job.applyUrl ? (
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-accent h-9 flex-1 px-3 text-[11.5px]"
                data-testid="apply-site"
                onClick={() => {
                  setVia("site");
                  setSiteOpened(true);
                }}
              >
                채용 사이트에서 지원하기 <ArrowUpRight size={13} />
              </a>
            ) : (
              <span className="chip bg-warn-soft px-2 py-1 text-[10px] text-warn">원문 지원 링크가 없습니다</span>
            )}
            <button
              type="button"
              onClick={record}
              disabled={Boolean(applied)}
              className="btn btn-primary h-9 flex-1 px-3 text-[11.5px] disabled:opacity-60"
              data-testid="apply-record"
            >
              <Send size={13} /> {applied ? "기록 완료" : "지원 완료로 기록"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
