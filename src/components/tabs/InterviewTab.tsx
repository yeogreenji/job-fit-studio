import { useMemo, useState } from "react";
import { ArrowRight, Info, RotateCcw, ShieldAlert, Target } from "lucide-react";
import type { InterviewQuestion, JobPackage, QuestionCategory, StarAnswer } from "../../types";
import { starToText } from "../../lib/engine";
import { Card, CopyButton, Difficulty, Eyebrow, cx } from "../ui";

const CATEGORY_STYLE: Record<QuestionCategory, string> = {
  전환: "bg-info-soft text-info",
  "성과 검증": "bg-warn-soft text-warn",
  "위기 대응": "bg-risk-soft text-risk",
  직무: "bg-accent-soft text-accent-deep",
  협업: "bg-[#f0efe9] text-ink-2",
  리더십: "bg-[#f1ecf8] text-[#5b4180]",
  "갭 보완": "bg-risk-soft text-risk",
  컬처: "bg-[#eef1f6] text-[#41556e]",
};

const STAR_META: { key: keyof StarAnswer; letter: string; label: string; color: string }[] = [
  { key: "situation", letter: "S", label: "상황", color: "#2f5f8a" },
  { key: "task", letter: "T", label: "과제", color: "#0e6a58" },
  { key: "action", letter: "A", label: "행동", color: "#a4680c" },
  { key: "result", letter: "R", label: "결과", color: "#16714f" },
];

const FILTERS: ("all" | "hard" | QuestionCategory)[] = ["all", "hard", "성과 검증", "갭 보완", "전환", "위기 대응", "컬처"];

function QuestionCard({
  question,
  index,
  onStar,
  onReset,
}: {
  question: InterviewQuestion;
  index: number;
  onStar: (id: string, key: keyof StarAnswer, value: string) => void;
  onReset: (id: string) => void;
}) {
  const [showHint, setShowHint] = useState(false);
  const filled = STAR_META.filter((meta) => question.star[meta.key].trim() && !question.star[meta.key].trim().startsWith("[")).length;
  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="num text-[9.5px] font-semibold text-faint">Q{String(index + 1).padStart(2, "0")}</span>
          <span className={cx("chip px-2 py-0.5 text-[9.5px]", CATEGORY_STYLE[question.category])}>{question.category}</span>
          <span className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5">
            <Difficulty level={question.difficulty} />
            <span className="text-[9px] font-medium text-muted">{question.difficulty === 3 ? "압박" : question.difficulty === 2 ? "실무" : "기본"}</span>
          </span>
          {question.gap && <span className="chip bg-risk-soft px-2 py-0.5 text-[9px] text-risk">갭 · {question.gap}</span>}
          <span className="ml-auto num text-[9px] text-faint">{filled}/4</span>
        </div>
        <h3 className="mt-2 text-[13px] font-semibold leading-snug tracking-[-0.01em] text-ink">{question.question}</h3>
        <p className="mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-muted">
          <Info size={11} className="mt-0.5 shrink-0 text-faint" />
          {question.why}
        </p>
      </div>

      <div className="grid gap-2 border-t border-line bg-[#fbfbf8] px-3.5 py-3 sm:grid-cols-2">
        {STAR_META.map((meta) => (
          <div key={meta.key} className={cx(meta.key === "action" || meta.key === "result" ? "sm:col-span-1" : "")}>
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className="num grid h-4 w-4 place-items-center rounded text-[8.5px] font-bold text-white"
                style={{ background: meta.color }}
              >
                {meta.letter}
              </span>
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-faint">{meta.label}</span>
              <span className="num ml-auto text-[8.5px] text-faint">{question.star[meta.key].length}</span>
            </div>
            <textarea
              className="star-field min-h-[64px]"
              rows={meta.key === "situation" ? 2 : 3}
              value={question.star[meta.key]}
              onChange={(e) => onStar(question.id, meta.key, e.target.value)}
              placeholder={`${meta.label}을 한두 문장으로`}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2">
        <button type="button" onClick={() => setShowHint(!showHint)} className="flex items-center gap-1 text-[10px] font-medium text-accent hover:underline">
          <Target size={10} /> 답변 프레임 {showHint ? "닫기" : "보기"}
        </button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => onReset(question.id)} className="btn btn-ghost h-6 px-1.5 text-[10px] text-faint hover:text-ink" title="처음 제안으로 되돌리기">
            <RotateCcw size={10} /> 초기화
          </button>
          <CopyButton text={starToText(question)} label="답변 복사" className="h-6 px-1.5 text-[10px]" />
        </span>
      </div>
      {showHint && (
        <div className="border-t border-line bg-accent-soft/40 px-3.5 py-2">
          <p className="text-[10.5px] leading-relaxed text-accent-deep">{question.hint}</p>
        </div>
      )}
    </Card>
  );
}

export function InterviewTab({
  pkg,
  onStar,
  onReset,
}: {
  pkg: JobPackage;
  onStar: (id: string, key: keyof StarAnswer, value: string) => void;
  onReset: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "hard" | QuestionCategory>("all");

  const questions = useMemo(() => {
    if (filter === "all") return pkg.questions;
    if (filter === "hard") return pkg.questions.filter((q) => q.difficulty === 3);
    return pkg.questions.filter((q) => q.category === filter);
  }, [filter, pkg.questions]);

  const answered = pkg.questions.filter((q) => q.edited).length;
  const hard = pkg.questions.filter((q) => q.difficulty === 3).length;
  const categories = [...new Set(pkg.questions.map((q) => q.category))];

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0">
            <Eyebrow>Interview room</Eyebrow>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">압박 면접 예상 질문 {pkg.questions.length}개</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              공고의 갭·전환·성과 수치에서 뽑은 질문입니다. STAR 카드에 답을 채우면 면접 준비 시트로 인쇄할 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-1.5 text-center">
              <div className="text-[9px] text-faint">압박 질문</div>
              <div className="num text-[15px] font-semibold text-risk">{hard}</div>
            </div>
            <div className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-1.5 text-center">
              <div className="text-[9px] text-faint">답변 완성</div>
              <div className="num text-[15px] font-semibold text-accent-deep">
                {answered}
                <span className="text-[10px] text-faint">/{pkg.questions.length}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-0.5">
          {FILTERS.filter((f) => f === "all" || f === "hard" || categories.includes(f)).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cx(
                "shrink-0 rounded-lg px-2.5 py-1 text-[10.5px] font-semibold transition-colors",
                filter === id ? "bg-ink text-white" : "text-muted hover:bg-paper-deep hover:text-ink",
              )}
            >
              {id === "all" ? "전체" : id === "hard" ? "압박만" : id}
            </button>
          ))}
          <span className="ml-auto hidden items-center gap-1 text-[9.5px] text-faint sm:flex">
            <ShieldAlert size={11} />
            난이도 ●●● = 꼬리 질문이 이어지는 질문
          </span>
        </div>
      </Card>

      <div className="space-y-2.5">
        {questions.map((question, index) => (
          <QuestionCard key={question.id} question={question} index={pkg.questions.indexOf(question) >= 0 ? pkg.questions.indexOf(question) : index} onStar={onStar} onReset={onReset} />
        ))}
        {questions.length === 0 && (
          <Card className="p-6 text-center text-[12px] text-muted">이 필터에 해당하는 질문이 없습니다.</Card>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-3">
        <ArrowRight size={13} className="mt-0.5 shrink-0 text-accent" />
        <p className="text-[10.5px] leading-relaxed text-muted">
          모든 답변은 경력 원본의 사실로만 채우세요. 수치를 모르면 “[확인 필요]”로 남기고 지원 전에 실제 값으로 바꾸는 편이 안전합니다.
          답변을 채운 뒤 <span className="font-semibold text-ink-2">내보내기 → 면접 준비 시트</span>로 인쇄하면 한 장으로 들고 갈 수 있습니다.
        </p>
      </div>
    </div>
  );
}
