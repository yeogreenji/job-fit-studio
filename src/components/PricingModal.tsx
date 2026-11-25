import { Check, ChevronDown, Info, Minus, ShieldCheck, X } from "lucide-react";
import type { PlanId, PlanState } from "../types";
import { FAQ, FEATURES, PLANS, daysLeft, featuresOf, planById } from "../lib/plan";
import { cx, Toggle } from "./ui";

/**
 * 요금제 화면.
 * 결제(PG) 연동 전이라 카드 결제는 일어나지 않습니다. 대신 ‘14일 무료 체험’으로
 * 실제 잠금이 풀리는 것을 그대로 확인할 수 있게 두었고, 그 사실을 화면에 명시합니다.
 */
export function PricingModal({
  open,
  state,
  onClose,
  onSelect,
  onToggleTrial,
}: {
  open: boolean;
  state: PlanState;
  onClose: () => void;
  onSelect: (plan: PlanId) => void;
  onToggleTrial: (on: boolean) => void;
}) {
  const features = featuresOf(state);
  const left = daysLeft(state);
  const current = planById(state.plan);
  const isTrial = state.trial;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6" data-testid="pricing-modal">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="animate-rise relative z-10 my-auto flex max-h-[92vh] w-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">요금제</h2>
            <p className="mt-1 max-w-[600px] text-[11.5px] leading-relaxed text-muted">
              이력서 한 장으로 맞춤 공고를 모으고 지원서까지 끝내는 기간제 상품입니다. 공고 수집과 적합도는 계속 무료입니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip border border-line bg-paper text-[10px] text-ink-2" data-testid="pricing-current">
              현재 {current.name}
              {isTrial && left !== null ? ` · ${left}일 남음` : ""}
            </span>
            <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-paper-deep/30 px-5 py-2 text-[10px] text-muted">
            <span className="font-semibold text-ink-2">모두 1회 결제 · 부가세 포함</span>
            <span>자동 갱신 없음</span>
            <span>기간이 끝나면 Free로 전환</span>
            <span className="ml-auto text-faint">지금은 결제 연동 전 — 데모 활성화만 됩니다</span>
          </div>

          <div className="grid gap-2.5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => {
              const active = state.plan === plan.id;
              return (
                <section
                  key={plan.id}
                  className={cx(
                    "relative flex flex-col rounded-xl border p-4 transition-colors",
                    plan.popular ? "border-ink/80 bg-[#fcfcfa] shadow-[0_1px_3px_rgba(17,20,24,0.06)]" : "border-line bg-surface",
                  )}
                  data-testid={`plan-card-${plan.id}`}
                  data-active={active ? "true" : "false"}
                  data-price={plan.price}
                >
                  {plan.popular && (
                    <span className="absolute -top-2 left-4 rounded bg-ink px-1.5 py-0.5 text-[9px] font-semibold text-white">가장 많이 고름</span>
                  )}
                  <div className="flex items-baseline justify-between gap-1">
                    <h3 className="text-[13.5px] font-semibold text-ink">{plan.name}</h3>
                    {plan.badge && !plan.popular && <span className="text-[9px] text-faint">{plan.badge}</span>}
                    {active && <span className="chip bg-accent-soft px-1.5 py-0 text-[9px] text-accent-deep">현재</span>}
                  </div>
                  <div className="mt-2 flex items-end gap-1">
                    <span className="num text-[25px] font-semibold leading-none tracking-[-0.04em] text-ink">{plan.priceLabel}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-faint">{plan.period}</p>
                  <p className="mt-2 min-h-[32px] text-[11px] leading-relaxed text-ink-2">{plan.tagline}</p>

                  <ul className="mt-3 space-y-1.5">
                    {plan.bullets.map((item) => (
                      <li key={item} className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-2">
                        <Check size={11} className="mt-[3px] shrink-0 text-accent" strokeWidth={3} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-3">
                    <button
                      type="button"
                      onClick={() => onSelect(plan.id)}
                      data-testid={`plan-select-${plan.id}`}
                      className={cx(
                        "btn h-9 w-full text-[11.5px]",
                        plan.popular ? "btn-primary" : "btn-outline",
                        active && "opacity-60",
                      )}
                      aria-pressed={active}
                    >
                      {active ? (plan.id === "free" ? "무료로 사용 중" : "사용 중") : plan.cta}
                    </button>
                    {plan.id !== "free" && (
                      <p className="mt-1.5 flex items-start gap-1 text-[9px] leading-relaxed text-faint">
                        <Info size={9} className="mt-[2px] shrink-0" />
                        결제 연동 전 — 누르면 이 브라우저에서만 {plan.period.split(" · ")[0]} 열립니다.
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="px-5 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-semibold text-ink">기능 비교</span>
              <span className="text-[9.5px] text-faint">지금 이 브라우저에 적용되는 기준</span>
            </div>
            <div className="mt-2 overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[660px] border-collapse text-left" data-testid="pricing-matrix">
                <thead>
                  <tr className="bg-paper-deep/50 text-[9.5px] text-muted">
                    <th className="px-3 py-2 font-semibold">기능</th>
                    <th className="px-2 py-2 text-center font-semibold">Free</th>
                    <th className="px-2 py-2 text-center font-semibold">1개월 집중</th>
                    <th className="px-2 py-2 text-center font-semibold">3개월 패스</th>
                    <th className="px-2 py-2 text-center font-semibold">프리미엄</th>
                  </tr>
                </thead>
                <tbody>
                  {FEATURES.map((row, index) => (
                    <tr key={row.label} className={cx("text-[10.5px] text-ink-2", index % 2 === 1 && "bg-[#fcfcfa]")}>
                      <td className="border-t border-line px-3 py-1.5">
                        <span className="font-medium text-ink">{row.label}</span>
                        <span className="ml-1.5 text-[9px] text-faint">{row.hint}</span>
                      </td>
                      {[row.free, row.focus, row.pass, row.premium].map((value, cell) => (
                        <td key={cell} className="border-t border-line px-2 py-1.5 text-center">
                          {value === "—" ? (
                            <Minus size={10} className="mx-auto text-faint" />
                          ) : value === "포함" ? (
                            <Check size={11} className="mx-auto text-accent" strokeWidth={3} />
                          ) : (
                            <span className={cx("text-[9.5px]", cell === 0 ? "text-faint" : "text-ink-2")}>{value}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="px-5 py-3">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-muted" />
              <span className="text-[11.5px] font-semibold text-ink">자주 묻는 질문</span>
            </div>
            <div className="mt-1.5 divide-y divide-line rounded-lg border border-line" data-testid="pricing-faq">
              {FAQ.map((item) => (
                <details key={item.q} className="group px-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 py-2 text-[10.5px] font-medium text-ink-2">
                    <ChevronDown size={11} className="shrink-0 text-faint transition-transform group-open:rotate-180" />
                    {item.q}
                  </summary>
                  <p className="pb-2 pl-[18px] pr-2 text-[10px] leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-paper-deep/40 px-5 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold text-ink">14일 무료 체험 (결제 연동 전 데모)</div>
              <p className="mt-0.5 text-[9.5px] leading-relaxed text-muted">
                켜면 14일 동안 유료 기능이 이 브라우저에서 열립니다. 카드 정보는 받지 않고, 어떤 결제도 일어나지 않습니다.
              </p>
            </div>
            <span data-testid="pricing-trial-state" data-trial={isTrial ? "on" : "off"} className="hidden" aria-hidden>
              {isTrial ? "on" : "off"}
            </span>
            <Toggle checked={isTrial} onChange={onToggleTrial} label="무료 체험" testId="plan-trial" />
            <button type="button" onClick={onClose} className="btn btn-outline h-8 px-3 text-[11px]">
              닫기
            </button>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-faint">
            표시 금액은 부가세 포함가입니다. 지금은 결제 연동 전 데모 상태이며, 실제 과금·환불 규정은 결제 도입 시 이 화면과 약관에 명시합니다.
            이 브라우저의 요금제 상태는 {features.fullKit ? "유료 기능 열림" : "Free 상태"}로 기록되어 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
