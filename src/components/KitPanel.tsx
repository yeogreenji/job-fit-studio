import { useState } from "react";
import { Download, FileText, Loader2, Lock, Mic, Package, Printer, Sparkles, Wallet, Wand2 } from "lucide-react";
import type { AiStatus, FitResult, JobPackage, PriorityId } from "../types";
import { PRIORITIES } from "../lib/priority";
import { appealText, introText, interviewText, kitText, negotiationText } from "../lib/package";
import { speakingSeconds } from "../lib/coach";
import { Card, CopyButton, cx } from "./ui";

type KitTab = "appeal" | "intro" | "interview" | "negotiation";

const TABS: { id: KitTab; label: string; hint: string; pro: boolean }[] = [
  { id: "appeal", label: "① 어필 3선", hint: "경력기술서·자소서에 그대로", pro: false },
  { id: "intro", label: "② 1분 자기소개", hint: "면접 첫 질문 대비", pro: true },
  { id: "interview", label: "③ 면접 질문 5", hint: "질문 · 의도 · 모범 답변", pro: true },
  { id: "negotiation", label: "④ 연봉 협상", hint: "첫 제안 · 대응 · 확인 질문", pro: true },
];

/**
 * 공고 한 건의 지원 패키지 — ① 경력기술서 어필 3선 ② 1분 자기소개
 * ③ 예상 면접 질문 5개와 답변 전략 ④ 연봉 협상 스크립트를 한 카드에 모읍니다.
 * 문장은 모두 저장된 이력서와 공고 원문에서만 나옵니다.
 */
export function KitPanel({
  pkg,
  fit,
  aiStatus,
  busy,
  priority,
  onPriority,
  targetSalary,
  onTargetSalary,
  onAiRefine,
  onExport,
  onPrint,
  onOpenDeep,
  resumeReady,
  unlocked,
  onOpenPricing,
}: {
  pkg: JobPackage | null;
  resumeReady: boolean;
  fit: FitResult | null;
  aiStatus: AiStatus;
  busy: boolean;
  priority: PriorityId | null;
  onPriority: (id: PriorityId) => void;
  targetSalary: number | null;
  onTargetSalary: (value: number | null) => void;
  onAiRefine: () => void;
  onExport: () => void;
  onPrint: () => void;
  onOpenDeep: () => void;
  /** 유료 플랜이면 4종 전체, Free는 ①번만 */
  unlocked: boolean;
  onOpenPricing: () => void;
}) {
  const [tab, setTab] = useState<KitTab>("appeal");
  const tabMeta = TABS.find((item) => item.id === tab) ?? TABS[0];
  const locked = tabMeta.pro && !unlocked;

  return (
    <Card className="overflow-hidden" testId="hub-kit">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Package size={13} className="text-muted" />
        <span className="text-[12px] font-semibold text-ink">지원 패키지</span>
        <span className="hidden text-[9.5px] text-faint sm:inline">어필 3선 · 자기소개 · 면접 5문 · 연봉 협상</span>
        {fit && !fit.needsProfile && (
          <span className="chip bg-paper-deep text-[9.5px] text-ink-2" data-testid="kit-fit">
            적합도 {fit.score}%
          </span>
        )}
        {pkg && (
          <span className={cx("chip text-[9.5px]", pkg.engine === "ai" ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")} data-testid="kit-engine">
            {pkg.engine === "ai" ? `AI${pkg.aiModel ? ` · ${pkg.aiModel}` : ""}` : "규칙 엔진"}
          </span>
        )}
        {pkg && (
          <span className="ml-auto flex flex-wrap items-center gap-1">
            <CopyButton text={kitText(pkg)} label="전체 복사" className="h-7 px-2 text-[10.5px]" />
            <button type="button" onClick={onExport} className="btn btn-outline h-7 px-2 text-[10.5px]" data-testid="kit-export">
              <Download size={11} /> MD
            </button>
            <button type="button" onClick={onPrint} className="btn btn-outline h-7 px-2 text-[10.5px]" data-testid="kit-print" aria-label="지원 패키지 인쇄">
              <Printer size={11} />
            </button>
            {aiStatus.kind === "live" &&
              (unlocked ? (
                <button
                  type="button"
                  onClick={onAiRefine}
                  disabled={busy}
                  className="btn btn-ghost h-7 px-2 text-[10.5px] text-muted disabled:opacity-50"
                  data-testid="kit-ai"
                  title="Gemini로 같은 내용을 더 자연스러운 문장으로 다듬습니다"
                >
                  {busy ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} AI로 다듬기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOpenPricing}
                  className="btn btn-ghost h-7 px-2 text-[10.5px] text-muted"
                  data-testid="kit-ai"
                  data-locked="true"
                  title="유료 플랜 기능 — 요금제에서 열기"
                >
                  <Lock size={10} /> AI로 다듬기
                  <span className="rounded bg-ink px-1 py-0.5 text-[8px] font-semibold leading-none text-white">패스</span>
                </button>
              ))}
          </span>
        )}
      </div>

      {!pkg ? (
        resumeReady ? (
          <div className="flex items-center gap-2 px-4 py-5 text-[11px] text-muted">
            <Loader2 size={12} className="animate-spin" /> 이력서와 공고로 지원 패키지를 만드는 중입니다.
          </div>
        ) : (
          <div className="px-4 py-4">
            <p className="text-[11.5px] leading-relaxed text-ink-2">
              이력서를 등록하면 이 공고의 <strong className="font-semibold">어필 3선 · 1분 자기소개 · 면접 질문 5 · 연봉 협상</strong>을
              한 번에 만듭니다.
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-faint">위 ‘내 이력서’에서 파일을 올리거나 직접 입력하세요.</p>
          </div>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-paper-deep/35 px-3 py-1.5">
            <span className="text-[9.5px] font-semibold text-muted">협상 기준</span>
            {PRIORITIES.map((option) => {
              const active = priority === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onPriority(option.id)}
                  aria-pressed={active}
                  data-testid={`kit-priority-${option.id}`}
                  className={cx(
                    "rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold transition-colors",
                    active ? "border-accent bg-accent-soft text-accent-deep" : "border-line bg-surface text-muted hover:border-line-strong",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
            <span className="ml-1 flex items-center gap-1 text-[9.5px] text-muted">
              <Wallet size={10} /> 희망
            </span>
            <input
              className="field field-sm w-[74px] text-right text-[10.5px]"
              value={targetSalary ?? ""}
              onChange={(event) => {
                const digits = event.target.value.replace(/[^\d]/g, "");
                onTargetSalary(digits ? Number(digits) : null);
              }}
              placeholder="5500"
              inputMode="numeric"
              data-testid="kit-target-salary"
              aria-label="희망 연봉(만원)"
            />
            <span className="text-[9px] text-faint">만원</span>
          </div>

          <div className="flex flex-wrap gap-1 px-3 pt-2.5">
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-pressed={active}
                  data-testid={`kit-tab-${item.id}`}
                  data-locked={item.pro && !unlocked ? "true" : undefined}
                  className={cx(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-semibold transition-colors",
                    active ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink-2",
                    item.pro && !unlocked && !active && "text-faint",
                  )}
                  title={item.pro && !unlocked ? `${item.hint} · 유료 플랜 기능` : item.hint}
                >
                  {item.pro && !unlocked && <Lock size={9} />}
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={unlocked ? onOpenDeep : onOpenPricing}
              className="btn btn-ghost ml-auto h-7 px-2 text-[10px] text-muted"
              data-testid="deep-open"
              title={unlocked ? "90초 답변 연습과 역질문" : "유료 플랜 기능 — 요금제에서 열기"}
            >
              {unlocked ? <Mic size={11} /> : <Lock size={10} />} 90초 면접 연습
            </button>
          </div>

          <div className="px-3 py-2.5" data-testid={`kit-body-${tab}`}>
            {locked && (
              <div className="rounded-lg border border-line bg-[#fcfcfa] px-3 py-3" data-testid="kit-locked">
                <div className="flex items-center gap-1.5">
                  <Lock size={12} className="text-accent" />
                  <span className="text-[11.5px] font-semibold text-ink">{tabMeta.label}은 Pro에서 열립니다</span>
                  <span className="chip ml-auto bg-ink px-1.5 py-0 text-[8.5px] text-white">패스</span>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
                  지원 패키지 4종(어필 3선 · 1분 자기소개 · 면접 질문 5 · 연봉 협상)과 AI 문장 다듬기는 유료 플랜 기능입니다. Free에서는
                  ①경력 어필 3선과 바로 쓰는 지원 문구까지 쓸 수 있습니다.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={onOpenPricing} className="btn btn-primary h-7 px-2.5 text-[10.5px]" data-testid="kit-unlock">
                    14일 무료 체험 켜기
                  </button>
                  <span className="text-[9px] text-faint">결제 없이 이 브라우저에서 바로 열립니다</span>
                </div>
              </div>
            )}
            {!locked && tab === "appeal" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-ink-2">경력기술서에 넣을 어필 포인트</span>
                  <span className="num text-[9px] text-faint">{pkg.appeals.length}</span>
                  <CopyButton text={appealText(pkg)} label="3선 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
                </div>
                {pkg.appeals.map((appeal, index) => (
                  <div key={appeal.id} className="rounded-lg border border-line bg-[#fcfcfa] px-2.5 py-2" data-testid="kit-appeal">
                    <div className="flex items-start gap-1.5">
                      <span className="num mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded bg-ink text-[8.5px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11.5px] font-semibold text-ink">{appeal.title}</p>
                        <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-2">{appeal.body}</p>
                        {appeal.evidence && <p className="mt-0.5 text-[9px] text-faint">근거 · {appeal.evidence}</p>}
                      </div>
                      <CopyButton text={`${appeal.title}\n${appeal.body}`} label="" className="h-5 w-5 shrink-0 px-0 text-[9px]" />
                    </div>
                  </div>
                ))}
                <p className="text-[9px] leading-relaxed text-faint">이력서 원문에 있는 문장만 인용했습니다. 수치·회사는 그대로 두고 지원서 양식에 맞춰 다듬으세요.</p>
              </div>
            )}

            {!locked && tab === "intro" && (
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-ink-2">1분 자기소개</span>
                  <span className="num text-[9.5px] text-faint">
                    {introText(pkg).replace(/\s+/g, "").length}자 · 약 {speakingSeconds(introText(pkg))}초
                  </span>
                  <CopyButton text={introText(pkg)} label="소개 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
                </div>
                <p className="mt-1 whitespace-pre-line rounded-lg border border-line bg-[#fcfcfa] px-3 py-2.5 text-[11.5px] leading-[1.8] text-ink-2" data-testid="kit-intro">
                  {introText(pkg)}
                </p>
                {pkg.intro?.outline && (
                  <ul className="mt-1.5 space-y-0.5 text-[9.5px] leading-relaxed text-muted">
                    <li>
                      <span className="font-semibold text-ink-2">훅</span> {pkg.intro.outline.hook}
                    </li>
                    <li>
                      <span className="font-semibold text-ink-2">증명</span> {pkg.intro.outline.proof}
                    </li>
                    <li>
                      <span className="font-semibold text-ink-2">적합</span> {pkg.intro.outline.fit}
                    </li>
                    <li>
                      <span className="font-semibold text-ink-2">마무리</span> {pkg.intro.outline.close}
                    </li>
                  </ul>
                )}
                <p className="mt-1 text-[9px] leading-relaxed text-faint">
                  소리 내어 {speakingSeconds(introText(pkg))}초 안에 읽히는지 확인하세요. 길면 ‘증명’ 문장을 하나 줄입니다.
                </p>
              </div>
            )}

            {!locked && tab === "interview" && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-ink-2">예상 질문 {Math.min(5, pkg.questions.length)}개 · 답변 전략</span>
                  <CopyButton text={interviewText(pkg)} label="전체 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
                </div>
                {pkg.questions.slice(0, 5).map((question, index) => (
                  <details key={question.id} className="group rounded-lg border border-line bg-[#fcfcfa]" data-testid="kit-question" open={index === 0}>
                    <summary className="flex cursor-pointer list-none items-start gap-1.5 px-2.5 py-2">
                      <span className="num mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded bg-ink text-[8.5px] font-semibold text-white">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="chip bg-paper-deep px-1.5 py-0 text-[8.5px] text-muted">{question.category}</span>
                        <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug text-ink">{question.question}</span>
                      </span>
                    </summary>
                    <div className="border-t border-line px-2.5 py-2">
                      <p className="text-[10px] leading-relaxed text-muted">
                        <span className="font-semibold text-ink-2">의도</span> · {question.why}
                      </p>
                      {question.answer && (
                        <p className="mt-1 whitespace-pre-line text-[10.5px] leading-relaxed text-ink-2">{question.answer}</p>
                      )}
                      {question.avoid && (
                        <p className="mt-1 rounded bg-risk-soft/60 px-2 py-1 text-[9.5px] leading-relaxed text-risk">
                          <span className="font-semibold">피하기</span> · {question.avoid}
                        </p>
                      )}
                      <span className="mt-1 flex justify-end">
                        <CopyButton
                          text={[`Q. ${question.question}`, question.answer ?? "", question.avoid ? `피해야 할 답변: ${question.avoid}` : ""].filter(Boolean).join("\n")}
                          label="답변 복사"
                          className="h-5 px-1 text-[9px]"
                        />
                      </span>
                    </div>
                  </details>
                ))}
              </div>
            )}

            {!locked && tab === "negotiation" && (
              <div className="space-y-1.5" data-testid="kit-negotiation">
                <div className="flex items-center gap-1.5">
                  <span className="num text-[14px] font-semibold text-ink">{pkg.negotiation?.target || "희망 연봉 미입력"}</span>
                  <span className="text-[9px] text-faint">{pkg.negotiation?.basis}</span>
                  <CopyButton text={negotiationText(pkg)} label="스크립트 복사" className="ml-auto h-6 px-1.5 text-[10px]" />
                </div>
                {pkg.negotiation ? (
                  <>
                    <div className="rounded-lg border border-line bg-[#fcfcfa] px-2.5 py-2">
                      <div className="text-[9.5px] font-semibold text-accent-deep">첫 제안</div>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-2">{pkg.negotiation.opener}</p>
                    </div>
                    <div className="rounded-lg border border-line bg-[#fcfcfa] px-2.5 py-2">
                      <div className="text-[9.5px] font-semibold text-warn">금액 차이가 있을 때</div>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-2">{pkg.negotiation.counter}</p>
                    </div>
                    {pkg.negotiation.nonSalary.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[9.5px] font-semibold text-muted">비연봉 카드</span>
                        {pkg.negotiation.nonSalary.map((item) => (
                          <span key={item} className="chip border border-line bg-surface text-[9px] text-ink-2">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                    {pkg.negotiation.questions.length > 0 && (
                      <ul className="space-y-0.5">
                        {pkg.negotiation.questions.map((item) => (
                          <li key={item} className="flex items-start gap-1 text-[9.5px] leading-relaxed text-ink-2">
                            <FileText size={9} className="mt-1 shrink-0 text-faint" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[9px] leading-relaxed text-faint">
                      금액은 입력한 희망 연봉만 씁니다. 공고에 급여가 없으면 추정하지 않고 ‘미입력’으로 둡니다.
                    </p>
                  </>
                ) : (
                  <p className="text-[10.5px] text-muted">협상 스크립트를 만들지 못했습니다. 희망 연봉을 입력해 주세요.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 border-t border-line px-3.5 py-1.5 text-[9px] leading-relaxed text-faint">
            <Sparkles size={10} />
            원문에 없는 경험·수치·회사는 만들지 않습니다. 제출 전에 본인이 한 번 더 확인하세요.
          </div>
        </>
      )}
    </Card>
  );
}
