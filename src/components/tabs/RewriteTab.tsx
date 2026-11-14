import { useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, Info, Minus, Plus, Quote, Sparkles } from "lucide-react";
import type { JobPackage, MatchResult, RewriteItem } from "../../types";
import { Card, CopyButton, DeltaChip, Eyebrow, Highlighted, cx, scoreColor } from "../ui";

function assemblyText(pkg: JobPackage, adoptedOnly: boolean): string {
  const summary = pkg.summary.adopted ? pkg.summary.after : pkg.summary.before || pkg.resumeSnapshot.summary;
  const lines: string[] = [`${pkg.resumeName} · ${pkg.resumeHeadline} (경력 ${pkg.years}년)`, "", summary, ""];
  for (const exp of pkg.resumeSnapshot.experiences) {
    const bullets = pkg.rewrites.filter((r) => r.experienceId === exp.id && (!adoptedOnly || r.adopted));
    if (!bullets.length) continue;
    lines.push(`${exp.company} | ${exp.role} | ${exp.period}`);
    bullets.forEach((b) => lines.push(`- ${b.after}`));
    lines.push("");
  }
  return lines.join("\n").trim();
}

function DiffCard({
  rewrite,
  labels,
  onToggle,
}: {
  rewrite: RewriteItem;
  labels: string[];
  onToggle: (id: string) => void;
}) {
  const changed = rewrite.after !== rewrite.before;
  return (
    <div className={cx("overflow-hidden rounded-xl border transition-colors", rewrite.adopted ? "border-accent/25" : "border-line")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#fbfbf8] px-3 py-2">
        <span className="num text-[9.5px] font-semibold text-faint">#{String(rewrite.order).padStart(2, "0")}</span>
        <span className="flex items-center gap-1.5">
          <span className="text-[9.5px] text-faint">관련도</span>
          <span className="h-1 w-16 overflow-hidden rounded-full bg-paper-deep">
            <span className="block h-full rounded-full" style={{ width: `${rewrite.relevance}%`, background: scoreColor(rewrite.relevance) }} />
          </span>
          <span className="num text-[9.5px] font-semibold" style={{ color: scoreColor(rewrite.relevance) }}>
            {rewrite.relevance}
          </span>
        </span>
        {rewrite.metric && <span className="chip bg-info-soft px-1.5 py-0.5 text-[9px] text-info">수치 포함</span>}
        <button
          type="button"
          onClick={() => onToggle(rewrite.id)}
          className={cx(
            "chip ml-auto border px-2 py-1 text-[10px] transition-colors",
            rewrite.adopted ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-muted hover:text-ink",
          )}
          aria-pressed={rewrite.adopted}
        >
          {rewrite.adopted ? <Check size={10} /> : <Plus size={10} />}
          {rewrite.adopted ? "반영됨" : "반영"}
        </button>
      </div>

      <div className="diff-grid">
        <div className="border-b border-line px-3 py-2.5 sm:border-b-0 sm:border-r">
          <div className="eyebrow mb-1.5">원문</div>
          <p className="text-[11.5px] leading-[1.7] text-muted">{rewrite.before}</p>
        </div>
        <div className={cx("px-3 py-2.5", rewrite.adopted && changed ? "bg-accent-soft/45" : "bg-[#fcfcfa]")}>
          <div className={cx("eyebrow mb-1.5 flex items-center gap-1", changed ? "text-accent" : "text-muted")}>
            {changed ? "수정 제안" : "유지 권장 · 이미 공고 문구와 맞음"}
            {rewrite.added && <span className="chip bg-accent px-1.5 py-0.5 text-[8.5px] text-white">+ {rewrite.added}</span>}
          </div>
          <p className="text-[12px] leading-[1.7] text-ink">
            <Highlighted text={rewrite.after} labels={labels} />
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2 border-t border-line px-3 py-2">
        <Info size={11} className="mt-1 shrink-0 text-faint" />
        <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-muted">{rewrite.reason}</p>
        <CopyButton text={rewrite.after} label="문장 복사" className="h-6 shrink-0 px-1.5 text-[10px]" />
      </div>
    </div>
  );
}

export function RewriteTab({
  pkg,
  projection,
  onToggle,
  onToggleAll,
  onToggleSummary,
}: {
  pkg: JobPackage;
  projection: MatchResult;
  onToggle: (id: string) => void;
  onToggleAll: (adopted: boolean) => void;
  onToggleSummary: () => void;
}) {
  const [openAssembly, setOpenAssembly] = useState(false);
  const adopted = pkg.rewrites.filter((r) => r.adopted);
  const labels = [...new Set(pkg.rewrites.flatMap((r) => [...r.matched, ...(r.added ? [r.added] : [])]))];
  const delta = projection.score - pkg.match.score;
  const adoptedRatio = pkg.rewrites.length ? Math.round((adopted.length / pkg.rewrites.length) * 100) : 0;
  const groups = pkg.resumeSnapshot.experiences
    .map((exp) => ({ exp, items: pkg.rewrites.filter((r) => r.experienceId === exp.id) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <Eyebrow>Rewritten for {pkg.company}</Eyebrow>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em]">공고 문구에 맞춘 경력기술서</h2>
            <p className="mt-1 text-[11px] text-muted">원문의 사실과 수치는 그대로 두고, 순서·동사·앞머리 키워드만 공고에 맞췄습니다.</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-1.5 text-center">
              <div className="text-[9px] text-faint">현재</div>
              <div className="num text-[14px] font-semibold text-muted">{pkg.match.score}</div>
            </div>
            <ArrowRight size={14} className="text-faint" />
            <div className="rounded-lg border border-accent/25 bg-accent-soft px-3 py-1.5 text-center">
              <div className="text-[9px] text-accent-deep/70">반영 시</div>
              <div className="num text-[16px] font-semibold text-accent-deep">{projection.score}</div>
            </div>
            <DeltaChip delta={delta} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#fbfbf8] px-4 py-2">
          <span className="text-[10.5px] text-muted">
            문장 {adopted.length}/{pkg.rewrites.length} 반영 · 매칭 {pkg.match.matchedCount}→{projection.matchedCount}
            <span className="text-line-strong"> · </span>
            정확 표기 {pkg.match.keywords.filter((k) => k.labelHits > 0).length}→{projection.keywords.filter((k) => k.labelHits > 0).length}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => onToggleAll(true)} className="btn btn-outline h-7 px-2 text-[10.5px]">
              <Check size={11} /> 전체 반영
            </button>
            <button type="button" onClick={() => onToggleAll(false)} className="btn btn-ghost h-7 px-2 text-[10.5px]">
              <Minus size={11} /> 전체 해제
            </button>
            <CopyButton text={assemblyText(pkg, true)} label="경력기술서 복사" className="btn btn-outline h-7 border-line-strong bg-surface px-2 text-[10.5px] text-ink-2" />
          </div>
        </div>
        {delta <= 2 && (
          <div className="flex items-start gap-2 border-t border-line bg-warn-soft/50 px-4 py-2">
            <Info size={11} className="mt-0.5 shrink-0 text-warn" />
            <p className="text-[10px] leading-relaxed text-warn">
              점수 상승이 작은 이유 — 남은 갭({pkg.match.keywords.filter((k) => k.status === "missing").slice(0, 3).map((k) => k.label).join("·") || "없음"})은 문장을 다듬어 만들 수 없는 경험입니다.
              면접 탭에서 보완 계획으로 다루고, 서류에는 있는 경험을 더 선명하게 남기세요.
            </p>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#fbfbf8] px-3.5 py-2">
          <Sparkles size={12} className="text-accent" />
          <span className="text-[11.5px] font-semibold text-ink">지원 요약 프로필</span>
          <span className="chip bg-paper-deep px-1.5 py-0.5 text-[9px] text-muted">자소서 첫 문단</span>
          <button
            type="button"
            onClick={onToggleSummary}
            className={cx(
              "chip ml-auto border px-2 py-1 text-[10px] transition-colors",
              pkg.summary.adopted ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-muted hover:text-ink",
            )}
            aria-pressed={pkg.summary.adopted}
          >
            {pkg.summary.adopted ? <Check size={10} /> : <Plus size={10} />}
            {pkg.summary.adopted ? "반영됨" : "반영"}
          </button>
        </div>
        <div className="space-y-2 px-3.5 py-3">
          <div>
            <div className="eyebrow mb-1">원문 요약</div>
            <p className="text-[11px] leading-[1.7] text-muted">{pkg.summary.before || "요약이 비어 있습니다."}</p>
          </div>
          <div className={cx("rounded-lg px-3 py-2.5", pkg.summary.adopted ? "bg-accent-soft/55" : "bg-[#fcfcfa]")}>
            <div className="eyebrow mb-1 text-accent">공고 맞춤 요약</div>
            <p className="text-[12px] leading-[1.75] text-ink">
              <Highlighted text={pkg.summary.after} labels={labels} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2">
          <Info size={11} className="shrink-0 text-faint" />
          <p className="min-w-0 flex-1 text-[10.5px] leading-relaxed text-muted">{pkg.summary.reason}</p>
          <CopyButton text={pkg.summary.after} label="요약 복사" className="h-6 shrink-0 px-1.5 text-[10px]" />
        </div>
      </Card>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {pkg.appeals.map((appeal, index) => (
          <Card key={appeal.id} className="relative overflow-hidden p-3.5">
            <span className="num absolute right-3 top-2 text-[28px] font-semibold leading-none text-paper-deep">{index + 1}</span>
            <Eyebrow>Core appeal {index + 1}</Eyebrow>
            <h3 className="relative mt-1.5 pr-6 text-[12.5px] font-semibold leading-snug tracking-tight text-ink">{appeal.title}</h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{appeal.body}</p>
            {appeal.keywords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {appeal.keywords.slice(0, 3).map((keyword) => (
                  <span key={keyword} className="chip bg-paper-deep px-1.5 py-0.5 text-[9px] font-medium text-muted">
                    {keyword}
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2">
        <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <span className="h-2 w-2 rounded-sm bg-accent/15 ring-1 ring-inset ring-accent/25" /> 공고 키워드 반영
        </span>
        <span className="text-[10px] text-faint">|</span>
        <span className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <span className="h-2 w-2 rounded-sm bg-paper-deep ring-1 ring-inset ring-line-strong" /> 원문 유지
        </span>
        <span className="ml-auto text-[9.5px] text-faint">반영 {adoptedRatio}%</span>
      </div>

      {groups.map(({ exp, items }) => {
        const adoptedHere = items.filter((i) => i.adopted).length;
        return (
          <section key={exp.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 px-1">
              <span className="text-[12.5px] font-semibold text-ink">{exp.company || "회사 미입력"}</span>
              <span className="text-[11px] text-muted">{exp.role}</span>
              <span className="num text-[10px] text-faint">{exp.period}</span>
              <span className="ml-auto chip bg-surface text-[9.5px] text-muted ring-1 ring-inset ring-line">
                반영 {adoptedHere}/{items.length}
              </span>
            </div>
            {items.map((rewrite) => (
              <DiffCard key={rewrite.id} rewrite={rewrite} labels={labels} onToggle={onToggle} />
            ))}
          </section>
        );
      })}

      <Card className="overflow-hidden">
        <button type="button" onClick={() => setOpenAssembly(!openAssembly)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
          <Sparkles size={14} className="text-accent" />
          <span className="text-[12.5px] font-semibold text-ink">완성된 경력기술서 미리보기</span>
          <span className="text-[10px] text-muted">반영한 문장만 공고 순서대로</span>
          <ChevronDown size={14} className={cx("ml-auto text-faint transition-transform", openAssembly && "rotate-180")} />
        </button>
        {openAssembly && (
          <div className="border-t border-line">
            <div className="flex items-center justify-between bg-[#fbfbf8] px-4 py-2">
              <span className="text-[10px] text-muted">{adopted.length}문장 · 붙여넣으면 그대로 제출 양식으로 쓸 수 있습니다</span>
              <div className="flex items-center gap-1">
                <CopyButton text={assemblyText(pkg, true)} label="전체 복사" />
                <CopyButton text={assemblyText(pkg, false)} label="원문 포함 복사" icon={Copy} />
              </div>
            </div>
            <pre className="scroll-thin max-h-[360px] overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-[11.5px] leading-[1.8] text-ink-2">
              {assemblyText(pkg, true)}
            </pre>
            <p className="flex items-start gap-1.5 border-t border-line px-4 py-2 text-[10px] leading-relaxed text-faint">
              <Quote size={10} className="mt-0.5 shrink-0" />
              수치와 사실은 원문 그대로입니다. 지원 전에 회사명·기간·직함만 실제 정보로 확인하세요.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
