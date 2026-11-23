import { CircleHelp, ClipboardList, CreditCard, History, Layers, PlugZap, Sparkles } from "lucide-react";
import type { AiStatus, PlanState, ViewId } from "../types";
import { daysLeft, planLabel } from "../lib/plan";
import { cx } from "./ui";

const NAV: { id: ViewId; label: string; short: string; icon: typeof Layers }[] = [
  { id: "studio", label: "공고 허브", short: "공고", icon: Layers },
  { id: "tracker", label: "지원 현황", short: "지원", icon: ClipboardList },
  { id: "history", label: "심층 기록", short: "기록", icon: History },
];

export function TopBar({
  view,
  onChangeView,
  aiStatus,
  plan,
  onOpenPricing,
  onOpenAi,
  onOpenHelp,
  hubCount,
  appliedCount,
}: {
  view: ViewId;
  onChangeView: (view: ViewId) => void;
  aiStatus: AiStatus;
  plan: PlanState;
  onOpenPricing: () => void;
  onOpenAi: () => void;
  onOpenHelp: () => void;
  hubCount: number;
  appliedCount: number;
}) {
  const live = aiStatus.kind === "live";
  const label = planLabel(plan);
  const paid = plan.plan !== "free";
  const left = daysLeft(plan);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto flex h-[50px] w-full max-w-[1180px] items-center gap-2 px-3 sm:px-5">
        <button type="button" onClick={() => onChangeView("studio")} className="flex items-center gap-1.5" aria-label="JobFit Studio 홈">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-white">
            <Sparkles size={13} />
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-[12px] font-semibold tracking-[-0.02em] text-ink">JobFit Studio</span>
            <span className="mt-0.5 text-[8.5px] text-faint">공고는 알아서 · 지원은 한 곳에서</span>
          </span>
        </button>

        <nav className="ml-1.5 flex items-center gap-0.5 overflow-x-auto" aria-label="화면 이동">
          {NAV.map((item) => {
            const active = view === item.id;
            const count = item.id === "studio" ? hubCount : item.id === "tracker" ? appliedCount : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeView(item.id)}
                data-testid={`nav-${item.id}`}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
                  active ? "bg-ink text-white" : "text-muted hover:bg-paper-deep hover:text-ink",
                )}
              >
                <item.icon size={11} />
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {count > 0 && (
                  <span
                    className={cx(
                      "num rounded px-1 py-0.5 text-[8.5px] font-semibold leading-none",
                      active ? "bg-white/15 text-white" : "bg-paper-deep text-muted",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenPricing}
            data-testid="open-pricing"
            data-plan={plan.plan}
            title={paid && left !== null ? `${label} · ${left}일 남음 — 요금제 보기` : "요금제 보기"}
            className={cx(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9.5px] font-semibold transition-colors",
              paid ? "border-accent/35 bg-accent-soft text-accent-deep hover:border-accent" : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink-2",
            )}
          >
            <CreditCard size={10} />
            {label}
            {paid && left !== null && <span className="num hidden text-[8.5px] opacity-70 sm:inline">D-{left}</span>}
          </button>
          <span
            data-testid="mode-banner"
            data-mode={aiStatus.kind}
            title={aiStatus.message}
            className={cx("chip hidden text-[9px] sm:inline-flex", live ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}
          >
            <span className={cx("h-1 w-1 rounded-full", live ? "bg-accent" : "bg-faint")} />
            {live ? `AI${aiStatus.model ? ` · ${aiStatus.model}` : ""}` : aiStatus.kind === "checking" ? "AI 확인 중" : "규칙 엔진"}
          </span>
          <button type="button" onClick={onOpenAi} className="btn btn-ghost h-7 px-1.5 text-[10.5px] text-muted" data-testid="open-ai" aria-label="AI 연결 설정">
            <PlugZap size={12} />
            <span className="hidden sm:inline">AI 연결</span>
          </button>
          <button type="button" onClick={onOpenHelp} className="btn btn-ghost hidden h-7 px-1 text-muted sm:inline-flex" aria-label="사용 안내" data-testid="open-help">
            <CircleHelp size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}
