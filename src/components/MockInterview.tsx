import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clock, Mic, Pause, Play, RotateCcw, Send, Sparkles, Target, TimerReset } from "lucide-react";
import type { AiConfig, AiStatus, InterviewFeedback, JobPackage } from "../types";
import { evaluateLocalAnswer } from "../lib/coach";
import { requestAiEvaluation } from "../lib/ai";
import { guardText } from "../lib/guard";
import { Card, CopyButton, Eyebrow, Meter, cx, scoreColor } from "./ui";

const LIMIT = 90;

type Phase = "ready" | "running" | "paused" | "review";

const mmss = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function MockInterview({
  pkg,
  aiStatus,
  config,
  onFeedback,
  onNotify,
}: {
  pkg: JobPackage;
  aiStatus: AiStatus;
  config: AiConfig;
  onFeedback: (feedback: InterviewFeedback) => void;
  onNotify: (message: string, tone?: "ok" | "warn" | "err") => void;
}) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [remaining, setRemaining] = useState(LIMIT);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);

  const questions = pkg.questions;
  const base = questions[Math.min(index, Math.max(0, questions.length - 1))];
  const questionText = followUpQuestion ?? base?.question ?? "";
  const live = aiStatus.kind === "live";

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setDeadline(null);
        setPhase("review");
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);

  const start = useCallback(() => {
    setAnswer("");
    setFeedback(null);
    setRemaining(LIMIT);
    setPhase("running");
    setDeadline(Date.now() + LIMIT * 1000);
  }, []);

  const pause = () => {
    if (phase !== "running") return;
    const left = deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : remaining;
    setRemaining(left);
    setDeadline(null);
    setPhase("paused");
  };

  const resume = () => {
    setRemaining((current) => {
      setDeadline(Date.now() + current * 1000);
      return current;
    });
    setPhase("running");
  };

  const reset = () => {
    setDeadline(null);
    setRemaining(LIMIT);
    setPhase("ready");
    setAnswer("");
    setFeedback(null);
  };

  const pickQuestion = (next: number) => {
    setIndex(next);
    setFollowUpQuestion(null);
    setFeedback(null);
    setDeadline(null);
    setRemaining(LIMIT);
    setPhase("ready");
    setAnswer("");
  };

  const sources = useMemo(() => {
    const resume = pkg.resumeSnapshot;
    return [
      questionText,
      answer,
      ...resume.experiences.flatMap((exp) => exp.bullets.map((bullet) => bullet.text)),
      pkg.jobSnapshot.responsibilities,
      pkg.jobSnapshot.requirements,
    ].filter(Boolean);
  }, [answer, pkg.resumeSnapshot, pkg.jobSnapshot, questionText]);

  const submit = async () => {
    if (!questionText) return;
    if (answer.trim().length < 10) {
      onNotify("답변을 10자 이상 적어 주세요. 말한 내용을 그대로 옮겨 적으면 됩니다.", "warn");
      return;
    }
    const seconds = Math.max(1, LIMIT - remaining);
    setDeadline(null);
    setPhase("review");
    setEvaluating(true);

    const local = evaluateLocalAnswer({
      question: questionText,
      answer,
      second: seconds,
      job: pkg.jobSnapshot,
      resume: pkg.resumeSnapshot,
      match: pkg.match,
    });

    let result: InterviewFeedback = { ...local, questionId: base?.id ?? "mock", question: questionText, seconds };

    if (live) {
      try {
        const { data, model } = await requestAiEvaluation({
          question: questionText,
          answer,
          seconds,
          job: pkg.jobSnapshot,
          resume: pkg.resumeSnapshot,
          config,
        });
        const clean = (items: unknown): string[] =>
          (Array.isArray(items) ? items : [])
            .map((item) => (typeof item === "string" ? item.replace(/\s+/g, " ").trim() : ""))
            .filter((item) => item.length > 4 && guardText(item, sources).ok)
            .slice(0, 3);
        const strengths = clean(data.strengths);
        const improvements = clean(data.improvements);
        const followUp = typeof data.followUp === "string" ? data.followUp.replace(/\s+/g, " ").trim() : "";
        if (strengths.length || improvements.length) {
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
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 평가에 실패했습니다";
        onNotify(`${message} — 규칙 기반 피드백으로 대신합니다.`, "warn");
      }
    }

    setFeedback(result);
    onFeedback(result);
    setEvaluating(false);
  };

  const history = (pkg.feedback ?? []).slice(0, 3);

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
            <Mic size={13} className="text-accent" /> 실전 모의면접
          </span>
          <span className={cx("chip px-1.5 py-0.5 text-[9px]", live ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}>
            {live ? "AI 피드백" : "규칙 피드백"}
          </span>
          <span className="text-[9.5px] text-faint">질문당 90초 · 답변 후 강점·보완점·꼬리질문</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => pickQuestion(Math.max(0, index - 1))}
              disabled={index === 0 || phase === "running"}
              className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted disabled:opacity-40"
              aria-label="이전 질문"
            >
              <ChevronLeft size={11} />
            </button>
            <span className="num text-[9.5px] text-faint">
              {questions.length ? index + 1 : 0}/{questions.length}
            </span>
            <button
              type="button"
              onClick={() => pickQuestion(Math.min(questions.length - 1, index + 1))}
              disabled={index >= questions.length - 1 || phase === "running"}
              className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted disabled:opacity-40"
              aria-label="다음 질문"
            >
              <ChevronRight size={11} />
            </button>
          </div>
        </div>

        <div className="grid gap-3 px-3.5 py-3 lg:grid-cols-[minmax(0,1fr)_200px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              {followUpQuestion ? (
                <span className="chip bg-info-soft px-1.5 py-0.5 text-[9px] text-info">꼬리질문</span>
              ) : (
                <>
                  <span className="num text-[9.5px] font-semibold text-faint">Q{String(index + 1).padStart(2, "0")}</span>
                  {base && <span className="chip bg-paper-deep px-1.5 py-0.5 text-[9px] text-muted">{base.category}</span>}
                </>
              )}
            </div>
            <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink" data-testid="mock-question">
              {questionText || "질문이 없습니다. 먼저 지원 패키지를 생성하세요."}
            </p>
            {base && !followUpQuestion && <p className="mt-1 text-[10px] leading-relaxed text-muted">{base.why}</p>}
          </div>

          <div className="rounded-xl border border-line bg-[#fcfcf9] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[9.5px] font-semibold text-muted">
                <Clock size={10} /> 남은 시간
              </span>
              <span
                data-testid="mock-timer"
                data-phase={phase}
                className={cx("num text-[22px] font-semibold leading-none", remaining <= 10 && phase !== "ready" ? "text-risk" : "text-ink")}
              >
                {mmss(remaining)}
              </span>
            </div>
            <Meter value={((LIMIT - remaining) / LIMIT) * 100} height={4} className="mt-2" color={remaining <= 10 ? "#c23b30" : "#0e6a58"} />
            <div className="mt-2 flex flex-wrap gap-1">
              {phase === "ready" || phase === "review" ? (
                <button type="button" onClick={start} className="btn btn-accent h-7 flex-1 px-2 text-[10.5px]" data-testid="mock-start">
                  <Play size={11} /> 90초 시작
                </button>
              ) : phase === "running" ? (
                <button type="button" onClick={pause} className="btn btn-outline h-7 flex-1 px-2 text-[10.5px]">
                  <Pause size={11} /> 일시정지
                </button>
              ) : (
                <button type="button" onClick={resume} className="btn btn-outline h-7 flex-1 px-2 text-[10.5px]">
                  <Play size={11} /> 이어서
                </button>
              )}
              <button type="button" onClick={reset} className="btn btn-ghost h-7 px-1.5 text-[10px] text-muted" aria-label="타이머 초기화">
                <TimerReset size={11} />
              </button>
            </div>
            {phase === "review" && remaining === 0 && (
              <p className="mt-1.5 text-[9.5px] leading-relaxed text-risk">90초가 끝났습니다. 말한 내용을 적고 피드백을 받으세요.</p>
            )}
          </div>
        </div>

        <div className="border-t border-line px-3.5 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted">내 답변 (말한 내용을 그대로 적기)</span>
            <span className="num text-[9.5px] text-faint" data-testid="mock-answer-length">
              {answer.replace(/\s+/g, "").length}자
            </span>
          </div>
          <textarea
            className="field auto-field min-h-[120px] leading-relaxed"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="상황 → 내가 한 일 → 결과 순서로, 90초 분량(약 380~450자)을 적어 보세요. 수치는 원문에 있는 값만."
            data-testid="mock-answer"
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[9.5px] text-faint">
              {live ? "AI가 구조·구체성·수치·직무 연결을 평가합니다." : "규칙 엔진이 구조·분량·수치·주체성을 평가합니다."}
            </span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={evaluating || !questionText}
              className="btn btn-primary ml-auto h-8 px-3 text-[11px]"
              data-testid="mock-submit"
            >
              <Send size={11} /> {evaluating ? "평가 중…" : "답변 제출"}
            </button>
          </div>
        </div>
      </Card>

      {feedback && (
        <Card className="animate-rise overflow-hidden" testId="mock-feedback">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5">
            <Sparkles size={12} className="text-accent" />
            <span className="text-[11.5px] font-semibold">답변 피드백</span>
            <span className={cx("chip px-1.5 py-0.5 text-[9px]", feedback.source === "ai" ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}>
              {feedback.source === "ai" ? `AI${feedback.model ? ` · ${feedback.model}` : ""}` : "규칙"}
            </span>
            <span className="num chip bg-paper-deep px-1.5 py-0.5 text-[9.5px] text-muted">{feedback.seconds}초 사용</span>
            <span className="ml-auto flex items-center gap-1.5">
              <span className="num text-[16px] font-semibold" style={{ color: scoreColor(feedback.score) }} data-testid="mock-score">
                {feedback.score}
              </span>
              <span className="text-[9px] text-faint">/100</span>
            </span>
          </div>
          <div className="grid gap-3 px-3.5 py-3 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-semibold text-ok">잘한 점</div>
              <ul className="mt-1.5 space-y-1.5">
                {feedback.strengths.map((item, index) => (
                  <li key={index} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-2">
                    <Check size={11} className="mt-0.5 shrink-0 text-ok" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-warn">보완할 점</div>
              <ul className="mt-1.5 space-y-1.5">
                {feedback.improvements.map((item, index) => (
                  <li key={index} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-2">
                    <ArrowRight size={11} className="mt-0.5 shrink-0 text-warn" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-line bg-accent-soft/40 px-3.5 py-3">
            <div className="flex items-center gap-1.5">
              <Target size={11} className="text-accent-deep" />
              <span className="text-[10px] font-semibold text-accent-deep">이어지는 꼬리질문</span>
            </div>
            <p className="mt-1 text-[12px] font-medium leading-relaxed text-ink" data-testid="mock-followup">
              {feedback.followUp}
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">{feedback.followUpWhy}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFollowUpQuestion(feedback.followUp);
                  setAnswer("");
                  setRemaining(LIMIT);
                  setFeedback(null);
                  setPhase("ready");
                  setDeadline(null);
                }}
                className="btn btn-accent h-7 px-2.5 text-[10.5px]"
                data-testid="mock-continue"
              >
                <RotateCcw size={11} /> 이 질문으로 이어서
              </button>
              <CopyButton text={`${feedback.question}\n\n${feedback.followUp}`} label="질문 복사" className="h-7 px-2 text-[10.5px]" />
              <button
                type="button"
                onClick={() => {
                  setFollowUpQuestion(null);
                  setFeedback(null);
                  setAnswer("");
                  reset();
                }}
                className="btn btn-ghost h-7 px-2 text-[10.5px] text-muted"
              >
                원래 질문으로
              </button>
            </div>
          </div>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="p-3.5">
          <Eyebrow>Recent drills</Eyebrow>
          <div className="mt-2 space-y-2">
            {history.map((item) => (
              <div key={item.id} className="flex items-start gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                <span className="num mt-0.5 w-7 shrink-0 text-[10px] font-semibold" style={{ color: scoreColor(item.score) }}>
                  {item.score}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10.5px] text-ink-2">{item.question}</p>
                  <p className="mt-0.5 truncate text-[9.5px] text-faint">
                    {item.seconds}초 · {item.source === "ai" ? "AI" : "규칙"} · {item.followUp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
