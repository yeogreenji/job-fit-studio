import { useMemo, useState } from "react";
import { ArrowRight, Clock, MessageCircleQuestion, Quote, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import type { AiStatus, JobPackage } from "../../types";
import { buildLocalIntro, buildLocalReverse, speakingSeconds } from "../../lib/coach";
import { Card, CopyButton, Eyebrow, SectionHead, cx } from "../ui";

const TONE_STYLE: Record<string, string> = {
  "성과 기준": "bg-info-soft text-info",
  "갭 확인": "bg-warn-soft text-warn",
  "조직 적합": "bg-[#eef1f6] text-[#41556e]",
};

export function PitchTab({
  pkg,
  aiStatus,
  regenerating,
  onRegenerate,
}: {
  pkg: JobPackage;
  aiStatus: AiStatus;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  const [showOutline, setShowOutline] = useState(false);

  const intro = useMemo(
    () => pkg.intro ?? buildLocalIntro(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match),
    [pkg.intro, pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match],
  );
  const reverse = useMemo(
    () => pkg.reverse ?? buildLocalReverse(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match),
    [pkg.reverse, pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match],
  );
  const chars = intro.text.replace(/\s+/g, "").length;
  const seconds = speakingSeconds(intro.text);
  const live = aiStatus.kind === "live";

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <Eyebrow>First 60 seconds</Eyebrow>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">1분 자기소개 · 마지막 역질문</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              {pkg.company} {pkg.role} 공고와 내 경력 문장만으로 만듭니다. 원문에 없는 수치·회사는 넣지 않습니다.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              data-testid="intro-source"
              className={cx("chip", intro.source === "ai" ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}
            >
              {intro.source === "ai" ? <Sparkles size={10} /> : null}
              {intro.source === "ai" ? `AI 생성${intro.model ? ` · ${intro.model}` : ""}` : "규칙 생성"}
            </span>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              className="btn btn-outline h-8 px-2.5 text-[11px]"
              data-testid="intro-regenerate"
            >
              <RefreshCw size={12} className={regenerating ? "animate-spin" : undefined} />
              {regenerating ? "생성 중…" : live ? "AI로 다시 만들기" : "다시 만들기"}
            </button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <Quote size={13} className="text-accent" />
          <span className="text-[12px] font-semibold">1분 자기소개</span>
          <span className="num chip bg-paper-deep px-1.5 py-0.5 text-[9.5px] text-muted" data-testid="intro-length">
            {chars}자
          </span>
          <span className="chip bg-paper-deep px-1.5 py-0.5 text-[9.5px] text-muted">
            <Clock size={9} /> 약 {seconds}초
          </span>
          <span className="ml-auto">
            <CopyButton text={intro.text} label="복사" />
          </span>
        </div>
        <div className="px-4 py-4">
          <p className="text-[13.5px] leading-[1.85] text-ink-2" data-testid="intro-text">
            {intro.text}
          </p>
          <p className="mt-3 text-[9.5px] leading-relaxed text-faint">
            250~320자가 1분 분량입니다. 실제로 소리 내어 읽고 60초를 넘으면 증명 문장 하나를 덜어내세요. 수치는 원문에 적힌 값만 씁니다.
          </p>
        </div>
        {intro.outline && (intro.outline.hook || intro.outline.proof) && (
          <div className="border-t border-line">
            <button
              type="button"
              onClick={() => setShowOutline(!showOutline)}
              className="flex w-full items-center gap-1.5 px-4 py-2 text-[10.5px] font-semibold text-accent hover:underline"
            >
              <ArrowRight size={11} /> 4문장 구조 {showOutline ? "닫기" : "보기"}
            </button>
            {showOutline && (
              <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2">
                {[
                  { label: "훅 · 누구인가", value: intro.outline.hook },
                  { label: "증명 · 무엇을 했나", value: intro.outline.proof },
                  { label: "적합 · 왜 이 공고인가", value: intro.outline.fit },
                  { label: "마무리 · 무엇을 하겠나", value: intro.outline.close },
                ]
                  .filter((item) => item.value)
                  .map((item) => (
                    <div key={item.label} className="rounded-lg border border-line bg-[#fcfcf9] px-2.5 py-2">
                      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-faint">{item.label}</div>
                      <p className="mt-1 text-[10.5px] leading-relaxed text-ink-2">{item.value}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <div>
        <SectionHead
          eyebrow="Ask them back"
          title={`마지막 역질문 ${reverse.length}개`}
          desc="면접 끝에 “궁금한 점 있으세요?”가 오면 이 순서로 하나만 고르세요."
          action={
            <span className="chip bg-paper-deep px-2 py-0.5 text-[9.5px] text-muted">
              <MessageCircleQuestion size={10} /> {reverse[0]?.source === "ai" ? "AI 제안" : "규칙 제안"}
            </span>
          }
          className="px-1"
        />
        <div className="mt-2 grid gap-2.5 lg:grid-cols-3">
          {reverse.map((item, index) => (
            <Card key={item.id} className="flex flex-col p-3.5">
              <div className="flex items-center gap-1.5">
                <span className="num text-[9.5px] font-semibold text-faint">Q{index + 1}</span>
                <span className={cx("chip px-1.5 py-0.5 text-[9px]", TONE_STYLE[item.tone] ?? "bg-paper-deep text-muted")}>{item.tone}</span>
              </div>
              <p className="mt-2 flex-1 text-[12px] font-medium leading-relaxed text-ink">{item.question}</p>
              <p className="mt-2 border-t border-line pt-2 text-[10px] leading-relaxed text-muted">{item.intent}</p>
              <div className="mt-1.5 flex justify-end">
                <CopyButton text={item.question} label="질문 복사" className="h-6 px-1.5 text-[10px]" />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <Wand2 size={11} className="text-accent" /> 1분 구성 (60초)
          </div>
          <ul className="mt-1.5 space-y-1 text-[10.5px] leading-relaxed text-muted">
            <li>0~10초 · 지금 하는 일과 연차 한 문장</li>
            <li>10~45초 · 가장 가까운 성과 2개 (수치 포함)</li>
            <li>45~55초 · 이 공고의 요구와 내 경험을 잇는 한 문장</li>
            <li>55~60초 · 입사 후 첫 과제와 마무리</li>
          </ul>
        </Card>
        <Card className="p-3.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <MessageCircleQuestion size={11} className="text-accent" /> 역질문 주의
          </div>
          <ul className="mt-1.5 space-y-1 text-[10.5px] leading-relaxed text-muted">
            <li>연봉·연차·재택은 첫 면접에서 먼저 꺼내지 않습니다. 최종 단계에서 처우 협상 탭으로 정리하세요.</li>
            <li>공고에 이미 적힌 내용을 그대로 묻지 않습니다.</li>
            <li>“없습니다”보다 하나는 준비합니다. 질문은 지원 동기의 연장입니다.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
