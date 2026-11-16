import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Clock,
  Download,
  Gauge as GaugeIcon,
  Lightbulb,
  Loader2,
  MessageSquareQuote,
  Mic,
  Pause,
  Play,
  Printer,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  ThumbsDown,
  TimerReset,
  Wallet,
} from "lucide-react";
import type { AiConfig, AiStatus, InterviewFeedback, JobPackage, PriorityId } from "../types";
import { evaluateLocalAnswer, speakingSeconds } from "../lib/coach";
import { requestAiEvaluation } from "../lib/ai";
import { guardText } from "../lib/guard";
import { priorityOf } from "../lib/priority";
import { Card, CopyButton, Eyebrow, Meter, ScoreRing, cx, scoreColor } from "./ui";

const LIMIT = 90;
const mmss = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export interface ResultFlowProps {
  pkg: JobPackage;
  aiStatus: AiStatus;
  config: AiConfig;
  priority: PriorityId | null;
  regenerating: boolean;
  onFeedback: (feedback: InterviewFeedback) => void;
  onNotify: (message: string, tone?: "ok" | "warn" | "err") => void;
  onRegenerate: () => void;
  onExport: () => void;
  onPrint: () => void;
  onNewJob: () => void;
  onOpenTracker: () => void;
}

function StrengthRow({ label, text, tone }: { label: string; text: string; tone: "ok" | "warn" }) {
  return (
    <li className="flex items-start gap-1.5">
      <span
        className={cx(
          "mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full",
          tone === "ok" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn",
        )}
      >
        {tone === "ok" ? <Check size={9} strokeWidth={3} /> : <CircleAlert size={9} strokeWidth={3} />}
      </span>
      <div className="min-w-0">
        <span className="text-[11.5px] font-semibold text-ink">{label}</span>
        <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{text}</p>
      </div>
    </li>
  );
}

function fitStrengths(pkg: JobPackage): { label: string; why: string }[] {
  if (pkg.aiFit?.strengths?.length) return pkg.aiFit.strengths.slice(0, 3);
  const items = pkg.match.keywords
    .filter((keyword) => keyword.status === "matched" && keyword.evidence.length > 0)
    .sort((a, b) => b.weight * b.coverage - a.weight * a.coverage)
    .slice(0, 3)
    .map((keyword) => ({
      label: `${keyword.label} · ${keyword.sectionLabel}`,
      why: keyword.evidence[0] ? `“${keyword.evidence[0].text}”` : "공고 키워드와 이력서 문장이 일치합니다.",
    }));
  if (items.length) return items;
  return [
    {
      label: "직무 언어가 겹치는 문장이 있습니다",
      why: "공고 핵심 키워드 중 일부가 이력서에 그대로 나옵니다. 첫 문단에 그 표현을 다시 세우세요.",
    },
  ];
}

function fitGaps(pkg: JobPackage): { label: string; how: string }[] {
  if (pkg.aiFit?.gaps?.length) return pkg.aiFit.gaps.slice(0, 3);
  const missing = pkg.match.keywords.filter((keyword) => keyword.status === "missing").slice(0, 2);
  const weak = pkg.match.keywords.filter((keyword) => keyword.status === "weak").slice(0, 1);
  const items = [...missing, ...weak].slice(0, 2).map((keyword) => ({
    label: `${keyword.label} (${keyword.status === "missing" ? "미충족" : "보완"})`,
    how:
      keyword.status === "missing"
        ? `공고 ${keyword.sectionLabel}의 “${keyword.snippet}”에 대응하는 문장이 이력서에 없습니다. 가장 가까운 인접 경험으로 답하고, 입사 후 90일 계획을 한 줄 붙이세요.`
        : `표현은 있지만 공고 문장과 연결되지 않았습니다. “${keyword.snippet}”의 표현을 경력 문장 앞에 붙이세요.`,
  }));
  if (items.length) return items;
  return [{ label: "뚜렷한 갭이 없습니다", how: "요구 키워드를 대부분 충족합니다. 면접에서는 수치의 측정 기준을 준비하세요." }];
}

function Drill({
  index,
  pkg,
  aiStatus,
  config,
  feedback,
  onFeedback,
  onNotify,
  activeIndex,
  onActivate,
}: {
  index: number;
  pkg: JobPackage;
  aiStatus: AiStatus;
  config: AiConfig;
  feedback: InterviewFeedback | null;
  onFeedback: (feedback: InterviewFeedback) => void;
  onNotify: (message: string, tone?: "ok" | "warn" | "err") => void;
  activeIndex: number | null;
  onActivate: (index: number | null) => void;
}) {
  const question = pkg.questions[index];
  const [open, setOpen] = useState(index === 0);
  const [answer, setAnswer] = useState("");
  const [remaining, setRemaining] = useState(LIMIT);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const running = activeIndex === index && deadline !== null;

  useEffect(() => {
    if (activeIndex !== index && deadline !== null) {
      setDeadline(null);
      setRemaining(LIMIT);
    }
  }, [activeIndex, deadline, index]);

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setDeadline(null);
        onActivate(null);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline, onActivate]);

  if (!question) return null;

  const start = () => {
    onActivate(index);
    setRemaining(LIMIT);
    setDeadline(Date.now() + LIMIT * 1000);
  };

  const pause = () => {
    setRemaining(deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : remaining);
    setDeadline(null);
    onActivate(null);
  };

  const submit = async () => {
    if (answer.trim().length < 10) {
      onNotify("답변을 10자 이상 적어 주세요. 말한 내용을 그대로 옮겨 적으면 됩니다.", "warn");
      return;
    }
    const seconds = Math.max(1, LIMIT - remaining);
    setDeadline(null);
    onActivate(null);
    setEvaluating(true);
    const local = evaluateLocalAnswer({
      question: question.question,
      answer,
      second: seconds,
      job: pkg.jobSnapshot,
      resume: pkg.resumeSnapshot,
      match: pkg.match,
    });
    let result: InterviewFeedback = { ...local, questionId: question.id, question: question.question, seconds };
    if (aiStatus.kind === "live") {
      try {
        const { data, model } = await requestAiEvaluation({
          question: question.question,
          answer,
          seconds,
          job: pkg.jobSnapshot,
          resume: pkg.resumeSnapshot,
          config,
        });
        const sources = [
          answer,
          question.question,
          ...pkg.resumeSnapshot.experiences.flatMap((exp) => exp.bullets.map((bullet) => bullet.text)),
          pkg.jobSnapshot.responsibilities,
          pkg.jobSnapshot.requirements,
        ].filter(Boolean);
        const clean = (items: unknown): string[] =>
          (Array.isArray(items) ? items : [])
            .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
            .filter((item) => item.length > 4 && guardText(item, sources).ok)
            .slice(0, 3);
        const strengths = clean(data.strengths);
        const improvements = clean(data.improvements);
        const followUp = typeof data.followUp === "string" ? data.followUp.replace(/\s+/g, " ").trim() : "";
        result = {
          ...result,
          strengths: strengths.length ? strengths : result.strengths,
          improvements: improvements.length ? improvements : result.improvements,
          followUp: followUp.length > 8 && guardText(followUp, [...sources, "90초", "1분"]).ok ? followUp : result.followUp,
          followUpWhy: typeof data.followUpWhy === "string" && data.followUpWhy.trim() ? data.followUpWhy.trim() : result.followUpWhy,
          score: typeof data.score === "number" && Number.isFinite(data.score) ? Math.max(0, Math.min(100, Math.round(data.score))) : result.score,
          source: "ai",
          model,
        };
      } catch (error) {
        onNotify(`${error instanceof Error ? error.message : "AI 평가 실패"} — 규칙 피드백으로 대신합니다.`, "warn");
      }
    }
    setEvaluating(false);
    onFeedback(result);
  };

  return (
    <div className="rounded-xl border border-line bg-surface" data-testid={`drill-${index}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-ink text-[9.5px] font-semibold text-white">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1">
            <span className="chip bg-paper-deep text-[9px] text-muted">{question.category}</span>
            {question.answerSource === "ai" && <span className="chip bg-accent-soft text-[9px] text-accent-deep">AI 답변</span>}
            {feedback && (
              <span className="num chip bg-ok-soft text-[9px] text-ok" data-testid={`drill-score-${index}`}>
                {feedback.score}점
              </span>
            )}
          </span>
          <span className="mt-1 block text-[12.5px] font-semibold leading-snug text-ink">{question.question}</span>
        </span>
        <ChevronDown size={14} className={cx("mt-1 shrink-0 text-faint transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-line px-3 py-2.5">
          <p className="text-[10.5px] leading-relaxed text-muted">{question.why}</p>

          {question.answer && (
            <div className="mt-2 rounded-lg border border-line bg-[#fcfcfa] px-2.5 py-2" data-testid={`drill-answer-${index}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] font-semibold text-accent-deep">
                  <MessageSquareQuote size={11} /> 모범 답변 스크립트
                </span>
                <CopyButton text={question.answer} label="답변 복사" className="h-6 px-1.5 text-[10px]" />
              </div>
              <p className="mt-1 whitespace-pre-line text-[11.5px] leading-relaxed text-ink-2">{question.answer}</p>
              <p className="mt-1 text-[9.5px] text-faint">
                약 {speakingSeconds(question.answer)}초 분량 · 대괄호는 본인 상황으로 채우세요
              </p>
            </div>
          )}

          {question.avoid && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-risk-soft/60 px-2.5 py-2">
              <ThumbsDown size={11} className="mt-0.5 shrink-0 text-risk" />
              <p className="text-[10.5px] leading-relaxed text-risk">
                <span className="font-semibold">피해야 할 답변</span> · {question.avoid}
              </p>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper-deep/40 px-2.5 py-2">
            <span className="flex items-center gap-1 text-[9.5px] font-semibold text-muted">
              <Clock size={10} /> 90초 연습
            </span>
            <span
              className={cx("num text-[18px] font-semibold leading-none", remaining <= 10 && activeIndex === index ? "text-risk" : "text-ink")}
              data-testid={`drill-timer-${index}`}
            >
              {mmss(remaining)}
            </span>
            <Meter value={((LIMIT - remaining) / LIMIT) * 100} height={3} className="min-w-[60px] flex-1" color={remaining <= 10 ? "#c23b30" : "#0e6a58"} />
            {running ? (
              <button type="button" onClick={pause} className="btn btn-outline h-7 px-2 text-[10px]">
                <Pause size={10} /> 정지
              </button>
            ) : (
              <button type="button" onClick={start} className="btn btn-accent h-7 px-2 text-[10px]" data-testid={`drill-start-${index}`}>
                <Play size={10} /> 시작
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDeadline(null);
                setRemaining(LIMIT);
                onActivate(null);
              }}
              className="btn btn-ghost h-7 px-1 text-muted"
              aria-label="타이머 초기화"
            >
              <TimerReset size={11} />
            </button>
          </div>

          <textarea
            className="field auto-field mt-2 min-h-[92px] text-[11.5px] leading-relaxed"
            placeholder="90초 동안 말한 내용을 그대로 적으면 구조·수치·직무 연결을 평가합니다."
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            data-testid={`drill-text-${index}`}
          />
          <div className="mt-1.5 flex items-center gap-2">
            <span className="num text-[9.5px] text-faint">{answer.replace(/\s+/g, "").length}자</span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={evaluating || answer.trim().length < 10}
              className="btn btn-primary ml-auto h-8 px-3 text-[11px] disabled:opacity-50"
              data-testid={`drill-submit-${index}`}
            >
              {evaluating ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              {evaluating ? "평가 중" : "답변 평가"}
            </button>
          </div>

          {feedback && (
            <div className="mt-2 rounded-lg border border-line bg-accent-soft/40 px-2.5 py-2" data-testid={`drill-feedback-${index}`}>
              <div className="flex items-center gap-1.5">
                <Sparkles size={11} className="text-accent" />
                <span className="text-[10px] font-semibold text-accent-deep">
                  {feedback.source === "ai" ? "AI 피드백" : "규칙 피드백"} · {feedback.seconds}초 사용
                </span>
                <span className="num ml-auto text-[13px] font-semibold" style={{ color: scoreColor(feedback.score) }}>
                  {feedback.score}
                </span>
              </div>
              <ul className="mt-1 space-y-1">
                {feedback.strengths.slice(0, 2).map((item, i) => (
                  <li key={`s${i}`} className="flex gap-1 text-[10.5px] leading-relaxed text-ink-2">
                    <Check size={10} className="mt-0.5 shrink-0 text-ok" /> {item}
                  </li>
                ))}
                {feedback.improvements.slice(0, 2).map((item, i) => (
                  <li key={`i${i}`} className="flex gap-1 text-[10.5px] leading-relaxed text-ink-2">
                    <ArrowRight size={10} className="mt-0.5 shrink-0 text-warn" /> {item}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 rounded-md bg-white/70 px-2 py-1.5 text-[10.5px] leading-relaxed text-ink">
                <span className="font-semibold text-accent-deep">꼬리질문</span> · {feedback.followUp}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ResultFlow(props: ResultFlowProps) {
  const { pkg, aiStatus, config, priority, regenerating, onFeedback, onNotify } = props;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const strengths = useMemo(() => fitStrengths(pkg), [pkg]);
  const gaps = useMemo(() => fitGaps(pkg), [pkg]);
  const option = priorityOf(priority);
  const onePoint = pkg.onePoint;
  const intro = pkg.intro;
  const questions = pkg.questions.slice(0, 5);
  const adopted = pkg.rewrites.filter((rewrite) => rewrite.adopted);
  const highlights = (adopted.length ? adopted : pkg.rewrites).slice(0, 4);
  const feedbackOf = useCallback(
    (questionId: string) => (pkg.feedback ?? []).find((item) => item.questionId === questionId) ?? null,
    [pkg.feedback],
  );

  const highlightText = highlights.map((item) => `· ${item.after}`).join("\n");
  const negotiation = pkg.negotiation;
  const sourceLabel = pkg.source?.kind === "url" ? pkg.source.site || "URL" : pkg.source?.kind === "paste" ? "본문 붙여넣기" : "샘플";

  return (
    <div className="space-y-3" data-testid="result">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-2.5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-[16px] font-semibold tracking-[-0.02em] text-ink" data-testid="result-company">
                {pkg.company}
              </h1>
              <span className="chip border border-line bg-surface text-[10.5px] text-ink-2">{pkg.role}</span>
              <span className="chip bg-info-soft text-[10px] text-info" data-testid="result-source">
                {sourceLabel}
              </span>
              <span
                className={cx("chip text-[10px]", pkg.engine === "ai" ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}
                data-testid="package-engine"
              >
                {pkg.engine === "ai" ? `AI 분석${pkg.aiModel ? ` · ${pkg.aiModel}` : ""}` : "규칙 엔진"}
              </span>
              {option && <span className="chip bg-paper-deep text-[10px] text-muted">우선순위 · {option.label}</span>}
              {pkg.aiWarnings && pkg.aiWarnings.length > 0 && (
                <span className="chip bg-warn-soft text-[10px] text-warn" title={pkg.aiWarnings.join("\n")}>
                  근거 확인 제외 {pkg.aiWarnings.length}
                </span>
              )}
            </div>
            <p className="mt-1 text-[10.5px] text-muted">
              {pkg.match.summaryLine} · {new Date(pkg.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 생성
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={props.onExport} className="btn btn-outline h-8 px-2.5 text-[11px]" data-testid="export-md">
              <Download size={12} /> MD
            </button>
            <button type="button" onClick={props.onPrint} className="btn btn-outline h-8 px-2.5 text-[11px]" aria-label="인쇄">
              <Printer size={12} />
            </button>
            <button type="button" onClick={props.onRegenerate} disabled={regenerating} className="btn btn-primary h-8 px-2.5 text-[11px]" data-testid="regenerate">
              {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              다시 분석
            </button>
            <button type="button" onClick={props.onNewJob} className="btn btn-ghost h-8 px-2.5 text-[11px] text-muted" data-testid="new-job">
              다른 공고
            </button>
          </div>
        </div>
      </Card>

      {/* 1. 합격 가능성 & 갭 진단 */}
      <Card className="overflow-hidden" testId="section-fit">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">1</span>
          <span className="text-[12px] font-semibold text-ink">합격 가능성 · 갭 진단</span>
          <span className="ml-auto hidden text-[10px] text-faint sm:inline">점수는 서류 통과를 보장하지 않습니다</span>
        </div>
        <div className="grid gap-3 px-4 py-3 sm:grid-cols-[132px_minmax(0,1fr)]">
          <div className="flex items-center gap-3 sm:flex-col sm:items-start">
            <ScoreRing score={pkg.match.score} size={104} label="fit" />
            <div>
              <span className="chip bg-paper-deep text-[10px] text-ink-2" data-testid="result-grade">
                {pkg.match.grade.label}
              </span>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">{pkg.match.grade.desc}</p>
            </div>
          </div>
          <div className="min-w-0 space-y-2.5">
            {pkg.aiFit?.verdict && (
              <p className="text-[11.5px] leading-relaxed text-ink-2" data-testid="ai-fit">
                {pkg.aiFit.verdict}
              </p>
            )}
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold text-ok">강점 {strengths.length}</div>
                <ul className="mt-1 space-y-1.5">
                  {strengths.map((item) => (
                    <StrengthRow key={item.label} label={item.label} text={item.why} tone="ok" />
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-warn">부족한 점 {gaps.length}</div>
                <ul className="mt-1 space-y-1.5">
                  {gaps.map((item) => (
                    <StrengthRow key={item.label} label={item.label} text={item.how} tone="warn" />
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
        {onePoint && (
          <div className="border-t border-line bg-accent-soft/40 px-4 py-2.5" data-testid="one-point">
            <div className="flex items-center gap-1.5">
              <Lightbulb size={12} className="text-accent-deep" />
              <span className="text-[10.5px] font-semibold text-accent-deep">이 공고에 넣을 때 원포인트 전략</span>
              <span className="ml-auto flex items-center gap-1">
                <CopyButton text={`${onePoint.title}\n${onePoint.body}`} label="복사" className="h-6 px-1.5 text-[10px]" />
              </span>
            </div>
            <p className="mt-1 text-[12px] font-semibold text-ink">{onePoint.title}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-2">{onePoint.body}</p>
          </div>
        )}
      </Card>

      {/* 2. 1분 자기소개 & 경력 하이라이트 */}
      <Card className="overflow-hidden" testId="section-pitch">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">2</span>
          <span className="text-[12px] font-semibold text-ink">1분 자기소개 · 경력 하이라이트</span>
          <span className="ml-auto hidden text-[10px] text-faint sm:inline">그대로 복사해 자소서 첫 문단·이력서 상단에</span>
        </div>
        <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-ink">1분 자기소개</span>
              <span className="chip bg-paper-deep text-[9px] text-muted" data-testid="intro-source">
                {intro?.source === "ai" ? "AI 생성" : "규칙 생성"}
              </span>
              <span className="num text-[9.5px] text-faint" data-testid="intro-length">
                {intro?.text.replace(/\s+/g, "").length ?? 0}자 · 약 {intro ? speakingSeconds(intro.text) : 0}초
              </span>
              <CopyButton text={intro?.text ?? ""} label="소개 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
            </div>
            <p className="mt-1.5 whitespace-pre-line rounded-lg border border-line bg-[#fcfcfa] px-3 py-2.5 text-[12px] leading-[1.75] text-ink-2" data-testid="intro-text">
              {intro?.text ?? "자기소개를 만들지 못했습니다. 다시 분석해 주세요."}
            </p>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] font-semibold text-ink">경력기술서 하이라이트</span>
              <span className="num text-[9.5px] text-faint">반영 {adopted.length}/{pkg.rewrites.length}</span>
              <CopyButton text={highlightText} label="전체 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {highlights.map((item) => (
                <li key={item.id} className="rounded-lg border border-line bg-surface px-2.5 py-1.5">
                  <div className="flex items-start gap-1.5">
                    <span className="num mt-0.5 text-[9px] text-faint">{String(item.order).padStart(2, "0")}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] leading-relaxed text-ink">{item.after}</p>
                      <p className="mt-0.5 text-[9px] text-faint">
                        {item.company} · {item.role} {item.added ? `· ‘${item.added}’ 표현 추가 제안` : ""}
                      </p>
                    </div>
                    <CopyButton text={item.after} label="" className="ml-auto h-5 w-5 shrink-0 px-0 text-[9px]" />
                  </div>
                </li>
              ))}
              {!highlights.length && <li className="text-[10.5px] text-muted">반영할 경력 문장이 없습니다. 이력서에 성과 문장을 추가하세요.</li>}
            </ul>
          </div>
        </div>
      </Card>

      {/* 3. 예상 질문 5 + 모범 답변 + 90초 */}
      <Card className="overflow-hidden" testId="section-interview">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">3</span>
          <span className="text-[12px] font-semibold text-ink">예상 면접 질문 {questions.length}개 · 모범 답변 · 90초 연습</span>
          <span className="ml-auto hidden items-center gap-1 text-[10px] text-faint sm:flex">
            <Mic size={10} /> {aiStatus.kind === "live" ? "AI 피드백" : "규칙 피드백"}
          </span>
        </div>
        <div className="space-y-2 px-3 py-3">
          {questions.map((question, index) => (
            <Drill
              key={question.id}
              index={index}
              pkg={pkg}
              aiStatus={aiStatus}
              config={config}
              feedback={feedbackOf(question.id)}
              onFeedback={onFeedback}
              onNotify={onNotify}
              activeIndex={activeIndex}
              onActivate={setActiveIndex}
            />
          ))}
          {!questions.length && <p className="px-1 text-[11px] text-muted">질문을 만들지 못했습니다. 다시 분석해 주세요.</p>}
        </div>
      </Card>

      {/* 4. 역질문 & 협상 */}
      <Card className="overflow-hidden" testId="section-offer">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[10px] font-semibold text-white">4</span>
          <span className="text-[12px] font-semibold text-ink">면접관에게 할 역질문 · 처우 협상 스크립트</span>
          <span className="ml-auto hidden items-center gap-1 text-[10px] text-faint sm:flex">
            <Wallet size={10} /> {option ? option.label : "우선순위 미선택"}
          </span>
        </div>
        <div className="grid gap-3 px-4 py-3 lg:grid-cols-2">
          <div className="min-w-0">
            <Eyebrow>역질문 3</Eyebrow>
            <ul className="mt-1.5 space-y-2">
              {(pkg.reverse ?? []).map((item, index) => (
                <li key={item.id} className="rounded-lg border border-line bg-[#fcfcfa] px-2.5 py-2" data-testid={`reverse-${index}`}>
                  <div className="flex items-start gap-1.5">
                    <span className="num mt-0.5 text-[9px] text-faint">Q{index + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[11.5px] font-medium leading-relaxed text-ink">{item.question}</p>
                      <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted">{item.intent}</p>
                    </div>
                    <CopyButton text={item.question} label="질문 복사" className="ml-auto h-6 shrink-0 px-1.5 text-[9.5px]" />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-w-0">
            <Eyebrow>처우 · 연봉 협상</Eyebrow>
            {negotiation ? (
              <div className="mt-1.5 space-y-2" data-testid="negotiation">
                <div className="flex items-center gap-1.5">
                  <span className="num text-[14px] font-semibold text-ink">{negotiation.target || "희망 연봉 미입력"}</span>
                  <span className="chip bg-paper-deep text-[9px] text-muted">{negotiation.source === "ai" ? "AI" : "규칙"}</span>
                  <CopyButton
                    text={[negotiation.opener, negotiation.counter, ...negotiation.nonSalary.map((item) => `· ${item}`), ...negotiation.questions.map((item) => `· ${item}`)].join("\n")}
                    label="전체 복사"
                    className="ml-auto h-6 px-1.5 text-[9.5px]"
                  />
                </div>
                <p className="text-[9.5px] text-faint">{negotiation.basis}</p>
                <div className="rounded-lg border border-line bg-[#fcfcfa] px-2.5 py-2">
                  <div className="text-[9.5px] font-semibold text-accent-deep">첫 제안</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-2">{negotiation.opener}</p>
                </div>
                <div className="rounded-lg border border-line bg-[#fcfcfa] px-2.5 py-2">
                  <div className="text-[9.5px] font-semibold text-warn">금액 차이가 있을 때</div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-2">{negotiation.counter}</p>
                </div>
                {negotiation.nonSalary.length > 0 && (
                  <div>
                    <div className="text-[9.5px] font-semibold text-muted">비연봉 카드</div>
                    <ul className="mt-0.5 flex flex-wrap gap-1">
                      {negotiation.nonSalary.map((item) => (
                        <li key={item} className="chip border border-line bg-surface text-[9.5px] text-ink-2">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {negotiation.questions.length > 0 && (
                  <div>
                    <div className="text-[9.5px] font-semibold text-muted">처우 확인 질문</div>
                    <ul className="mt-0.5 space-y-0.5">
                      {negotiation.questions.map((item) => (
                        <li key={item} className="text-[10.5px] leading-relaxed text-ink-2">
                          · {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-1.5 text-[10.5px] text-muted">협상 스크립트가 없습니다. 희망 연봉을 입력하고 다시 분석해 주세요.</p>
            )}
          </div>
        </div>
      </Card>

      {/* 5. 지원 현황 */}
      <Card className="flex flex-wrap items-center gap-2 px-4 py-2.5" testId="section-tracker">
        <ClipboardList size={13} className="text-muted" />
        <span className="text-[11px] text-ink-2">이 공고는 지원 현황에 자동으로 추가됐습니다. 단계·연봉·다음 할 일을 이어서 관리하세요.</span>
        <button type="button" onClick={props.onOpenTracker} className="btn btn-outline ml-auto h-7 px-2.5 text-[10.5px]" data-testid="open-tracker">
          지원 현황 열기 <ArrowUpRight size={11} />
        </button>
      </Card>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[10px] leading-relaxed text-muted">
        <ShieldAlert size={12} className="text-faint" />
        원문에 없는 경험·수치·회사는 쓰지 않습니다. 적합도는 키워드·경력·산업·톤을 합산한 참고값이고, 연봉 참고 범위는 추정입니다.
        <span className="ml-auto flex items-center gap-1">
          <GaugeIcon size={11} /> {pkg.match.score}/100
        </span>
      </div>
    </div>
  );
}
