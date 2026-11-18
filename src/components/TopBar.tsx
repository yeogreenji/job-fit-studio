import { CircleHelp, ClipboardList, History, Layers, PlugZap, Sparkles } from "lucide-react";
import type { AiStatus, ViewId } from "../types";
import { cx } from "./ui";

const NAV: { id: ViewId; label: string; icon: typeof Layers }[] = [
  { id: "studio", label: "공고 허브", icon: Layers },
  { id: "tracker", label: "지원 현황", icon: ClipboardList },
  { id: "history", label: "심층 기록", icon: History },
];

export function TopBar({
  view,
  onChangeView,
  aiStatus,
  onOpenAi,
  onOpenHelp,
  hubCount,
  appliedCount,
}: {
  view: ViewId;
  onChangeView: (view: ViewId) => void;
  aiStatus: AiStatus;
  onOpenAi: () => void;
  onOpenHelp: () => void;
  hubCount: number;
  appliedCount: number;
}) {
  const live = aiStatus.kind === "live";
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/92 backdrop-blur-md">
      <div className="mx-auto flex h-[52px] w-full max-w-[1180px] items-center gap-2 px-3 sm:px-5">
        <button type="button" onClick={() => onChangeView("studio")} className="flex items-center gap-1.5" aria-label="JobFit Studio 홈">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-white">
            <Sparkles size={14} />
          </span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-[12.5px] font-semibold tracking-[-0.02em] text-ink">JobFit Studio</span>
            <span className="mt-0.5 text-[9px] text-faint">공고는 알아서 · 지원은 한 곳에서</span>
          </span>
        </button>

        <nav className="ml-2 flex items-center gap-0.5 overflow-x-auto" aria-label="화면 이동">
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
                  "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition-colors",
                  active ? "bg-ink text-white" : "text-muted hover:bg-paper-deep hover:text-ink",
                )}
              >
                <item.icon size={12} />
                {item.label}
                {count > 0 && (
                  <span
                    className={cx(
                      "num rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none",
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
          <span
            data-testid="mode-banner"
            data-mode={aiStatus.kind}
            title={aiStatus.message}
            className={cx(
              "chip hidden text-[9.5px] sm:inline-flex",
              live ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted",
            )}
          >
            <span className={cx("h-1.5 w-1.5 rounded-full", live ? "bg-accent" : "bg-faint")} />
            {live ? `실시간 AI${aiStatus.model ? ` · ${aiStatus.model}` : ""}` : aiStatus.kind === "checking" ? "AI 확인 중" : "규칙 엔진"}
          </span>
          <button type="button" onClick={onOpenAi} className="btn btn-ghost h-8 px-2 text-[11px] text-muted" data-testid="open-ai" aria-label="AI 연결 설정">
            <PlugZap size={13} />
            <span className="hidden sm:inline">AI 연결</span>
          </button>
          <button type="button" onClick={onOpenHelp} className="btn btn-ghost h-8 px-1.5 text-muted" aria-label="사용 안내">
            <CircleHelp size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
