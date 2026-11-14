import { useState } from "react";
import { ChevronRight, Info, Lightbulb, Sparkles } from "lucide-react";
import type { JobPosting, MatchResult } from "../../types";
import { Card, ScoreRing, StatusChip, Meter, cx, SectionHead, Eyebrow } from "../ui";

const STATUS_LABEL = { matched: "매칭", weak: "보완", missing: "미충족" } as const;

function Suggestion({ status, label }: { status: "matched" | "weak" | "missing"; label: string }) {
  const text =
    status === "matched"
      ? `‘${label}’은 이력서에서 충분히 확인됩니다. 경력기술서 상단과 자기소개 첫 문단에 그대로 두세요.`
      : status === "weak"
        ? `‘${label}’이 한 문장에서만 보입니다. 다른 경력에서 두 번째 근거를 한 줄 추가하면 서류 검색에서 안정적입니다.`
        : `‘${label}’은 공고가 요구하지만 원본에 없습니다. 가장 가까운 인접 경험으로 보완하거나, 면접에서 학습·실행 계획으로 답하세요.`;
  return (
    <div className="flex items-start gap-2 rounded-lg bg-paper-deep/70 px-2.5 py-2">
      <Lightbulb size={12} className="mt-0.5 shrink-0 text-warn" />
      <p className="text-[11px] leading-relaxed text-ink-2">{text}</p>
    </div>
  );
}

export function MatchTab({ match, job }: { match: MatchResult; job: JobPosting }) {
  const [filter, setFilter] = useState<"all" | "matched" | "weak" | "missing">("all");
  const [openId, setOpenId] = useState<string | null>(match.keywords[0]?.id ?? null);

  const rows = match.keywords.filter((k) => filter === "all" || k.status === filter);
  const gaps = match.keywords.filter((k) => k.status === "missing").slice(0, 3);
  const axisTop = [...match.tone.axes].sort((a, b) => b.job - a.job);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="p-4">
          <SectionHead eyebrow="Fit score" title="적합도 진단" desc={`${job.company || "지원 기업"} · ${job.role || "직무"}`} />
          <div className="mt-4 flex items-center gap-4">
            <ScoreRing score={match.score} label="fit" sub={`${match.score}/100`} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[17px] font-semibold tracking-tight text-ink">{match.grade.label}</span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{match.grade.desc}</p>
              <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                키워드 {match.resumeKeywordCount}개 보유 · 공고 요구 {match.keywords.length}개
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            {match.subs.map((sub) => (
              <div key={sub.id}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium text-ink-2">{sub.label}</span>
                  <span className="num text-[10.5px] text-muted">
                    <span className="font-semibold text-ink">{sub.score}</span> · {Math.round(sub.weight * 100)}%
                  </span>
                </div>
                <Meter value={sub.score} height={4} className="mt-1" />
                <p className="mt-1 text-[9.5px] leading-snug text-faint">{sub.note}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <SectionHead
            eyebrow="Tone profile"
            title={match.tone.label}
            desc={match.tone.summary}
            action={<span className="chip bg-paper-deep text-muted">공고 ↔ 내 경력</span>}
          />
          <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {axisTop.map((axis) => (
              <div key={axis.id} title={axis.note}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium text-ink-2">{axis.label}</span>
                  <span className="num text-[10px] text-faint">
                    {axis.job} <span className="text-line-strong">/</span> {axis.resume}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-8 text-[8.5px] text-faint">공고</span>
                    <Meter value={axis.job} height={5} color="#0e6a58" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-8 text-[8.5px] text-faint">경력</span>
                    <Meter value={axis.resume} height={5} color="#a9b3ae" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-[#fcfcf9] px-3 py-2.5">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[11px] leading-relaxed text-muted">
              두 축의 간격이 벌어진 곳이 면접에서 가장 먼저 파고들 지점입니다. 경력 쪽 막대가 낮은 축은 관련 문장을 한 줄 보강하거나,
              답변에서 “내 방식은 이렇게 다르다”를 선제적으로 꺼내세요.
            </p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="min-w-0">
            <Eyebrow>Keyword matrix</Eyebrow>
            <h2 className="mt-1 text-[14px] font-semibold tracking-tight">공고 키워드 {match.keywords.length}개 분석</h2>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {(["all", "matched", "weak", "missing"] as const).map((id) => {
              const count =
                id === "all"
                  ? match.keywords.length
                  : match.keywords.filter((k) => k.status === id).length;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cx(
                    "rounded-lg px-2 py-1 text-[10.5px] font-semibold transition-colors",
                    filter === id ? "bg-ink text-white" : "text-muted hover:bg-paper-deep hover:text-ink",
                  )}
                >
                  {id === "all" ? "전체" : STATUS_LABEL[id]}
                  <span className={cx("num ml-1 text-[9px]", filter === id ? "text-white/60" : "text-faint")}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-line px-4 py-2.5">
          <div className="flex h-1.5 overflow-hidden rounded-full">
            <span style={{ width: `${match.keywords.length ? (match.matchedCount / match.keywords.length) * 100 : 0}%`, background: "#16714f" }} />
            <span style={{ width: `${match.keywords.length ? (match.weakCount / match.keywords.length) * 100 : 0}%`, background: "#a4680c" }} />
            <span style={{ width: `${match.keywords.length ? (match.missingCount / match.keywords.length) * 100 : 0}%`, background: "#c23b30" }} />
          </div>
          <p className="mt-1.5 text-[10px] text-muted">
            매칭 {match.matchedCount} · 보완 {match.weakCount} · 미충족 {match.missingCount} — 가중치는 자격요건 3 · 담당업무 2.4 · 우대 1.7 · 조직 톤 1.1
          </p>
        </div>

        <div className="divide-y divide-line border-t border-line">
          {rows.map((keyword) => {
            const open = openId === keyword.id;
            return (
              <div key={keyword.id} className={cx("transition-colors", open ? "bg-[#fbfbf8]" : "hover:bg-[#fbfbf8]")}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : keyword.id)}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: keyword.status === "matched" ? "#16714f" : keyword.status === "weak" ? "#a4680c" : "#c23b30" }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-ink">{keyword.label}</span>
                      <span className="chip bg-paper-deep px-1.5 py-0.5 text-[9px] font-medium text-muted">{keyword.sectionLabel}</span>
                      {keyword.group === "industry" && <span className="chip bg-info-soft px-1.5 py-0.5 text-[9px] text-info">산업</span>}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1 w-20 overflow-hidden rounded-full bg-paper-deep sm:w-28">
                        <span className="block h-full rounded-full bg-ink/25" style={{ width: `${keyword.weightPct}%` }} />
                      </span>
                      <span className="num text-[9px] text-faint">중요도 {keyword.weightPct}</span>
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-[10px] text-faint sm:block">근거 {keyword.evidence.length}건</span>
                  <StatusChip status={keyword.status} />
                  <ChevronRight size={13} className={cx("shrink-0 text-faint transition-transform", open && "rotate-90")} />
                </button>

                {open && (
                  <div className="space-y-2.5 px-4 pb-3.5 pl-[26px]">
                    {keyword.snippet && (
                      <div className="border-l-2 border-accent/30 pl-2.5">
                        <div className="eyebrow mb-1">공고 문장</div>
                        <p className="text-[11.5px] leading-relaxed text-ink-2">“{keyword.snippet}”</p>
                      </div>
                    )}
                    <div>
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="eyebrow">이력서 근거</span>
                        <span className={cx("chip px-1.5 py-0.5 text-[8.5px]", keyword.labelHits > 0 ? "bg-ok-soft text-ok" : "bg-paper-deep text-muted")}>
                          {keyword.labelHits > 0 ? "공고 표기 그대로 있음" : "공고 표기 그대로는 없음"}
                        </span>
                      </div>
                      {keyword.evidence.length ? (
                        <ul className="space-y-1">
                          {keyword.evidence.map((ev) => (
                            <li key={ev.bulletId} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                              <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                              <span>
                                <span className="font-medium text-ink-2">{ev.company}</span> — {ev.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-faint">원본에서 이 키워드가 확인되지 않았습니다.</p>
                      )}
                    </div>
                    <Suggestion status={keyword.status} label={keyword.label} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-4">
          <SectionHead eyebrow="Gap priority" title="먼저 메울 갭" desc="공고 가중치가 높은데 이력서에 없는 순서입니다." />
          <div className="mt-3 space-y-2">
            {gaps.length ? (
              gaps.map((gap, index) => (
                <div key={gap.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    <span className="num grid h-5 w-5 place-items-center rounded-md bg-risk-soft text-[10px] font-semibold text-risk">{index + 1}</span>
                    <span className="text-[12px] font-semibold text-ink">{gap.label}</span>
                    <span className="ml-auto num text-[9.5px] text-faint">중요도 {gap.weightPct}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">“{gap.snippet}”</p>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-2">
                    <span className="font-semibold">행동:</span> 인접 경험 1줄 추가 → 면접에서 90일 보완 계획. 없는 경험을 만들지 마세요.
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-lg bg-ok-soft px-3 py-2.5 text-[11.5px] text-ok">미충족 키워드가 없습니다. 리라이트와 면접 답변만 다듬으면 됩니다.</p>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <SectionHead eyebrow="Reading" title="이 공고를 읽는 법" />
          <ul className="mt-3 space-y-2.5">
            {[
              `자격 요건에서 가장 무거운 키워드는 ‘${match.keywords[0]?.label ?? "-"}’입니다. 첫 문단에 두세요.`,
              match.requiredYears ? `경력 ${match.requiredYears}년 이상을 명시했습니다. ${match.subs.find((s) => s.id === "experience")?.note ?? ""}` : "연차 조건이 명시되지 않았습니다. 성과로 증명하세요.",
              match.industry ? (match.industryMatch ? `${match.industry} 경험이 원본에 있습니다. 산업 맥락을 한 문장으로 연결하세요.` : `${match.industry} 경험이 보이지 않습니다. 인접 산업 경험을 산업 언어로 번역하세요.`) : "특정 산업 요구가 없습니다. 직무 역량에 집중하세요.",
              `조직 톤은 ‘${match.tone.label}’입니다. 답변의 예시도 같은 결로 고르세요.`,
            ].map((line, index) => (
              <li key={index} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                <Info size={12} className="mt-0.5 shrink-0 text-faint" />
                {line}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
