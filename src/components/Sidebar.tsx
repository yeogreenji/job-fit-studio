import { History, LifeBuoy, Settings2, Target } from "lucide-react";
import type { ViewId } from "../types";
import { cx } from "./ui";

function NavButton({
  active,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative grid h-10 w-10 place-items-center rounded-xl transition-colors",
        active ? "bg-white/12 text-white" : "text-white/45 hover:bg-white/8 hover:text-white/80",
      )}
    >
      {active && <span className="absolute -left-[14px] h-4 w-[2px] rounded-full bg-white/80" />}
      {children}
      <span className="pointer-events-none absolute left-[calc(100%+10px)] z-50 hidden whitespace-nowrap rounded-md bg-[#1b2026] px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover:block">
        {label}
      </span>
    </button>
  );
}

export function Sidebar({
  view,
  resumeInitial,
  onChangeView,
  onOpenApi,
  onOpenHelp,
}: {
  view: ViewId;
  resumeInitial: string;
  onChangeView: (v: ViewId) => void;
  onOpenApi: () => void;
  onOpenHelp: () => void;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[68px] flex-col items-center bg-[#101418] py-4 lg:flex">
      <div className="mb-7 flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/12 bg-white/6">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 19V5h9.4a4.1 4.1 0 0 1 0 8.2H6" stroke="white" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M11.2 13.2 17.8 19" stroke="#5FD3B4" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="6" cy="5" r="1.2" fill="#5FD3B4" />
        </svg>
      </div>

      <nav className="flex flex-col items-center gap-1.5">
        <NavButton active={view === "studio"} label="지원 스튜디오" onClick={() => onChangeView("studio")}>
          <Target size={18} strokeWidth={1.9} />
        </NavButton>
        <NavButton active={view === "history"} label="패키지 히스토리" onClick={() => onChangeView("history")}>
          <History size={18} strokeWidth={1.9} />
        </NavButton>
        <div className="my-2 h-px w-6 bg-white/10" />
        <NavButton label="엔진·API 설정" onClick={onOpenApi}>
          <Settings2 size={18} strokeWidth={1.9} />
        </NavButton>
        <NavButton label="도움말" onClick={onOpenHelp}>
          <LifeBuoy size={18} strokeWidth={1.9} />
        </NavButton>
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3">
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.18em] text-white/25">local</span>
        <div className="grid h-8 w-8 place-items-center rounded-full bg-white text-[11px] font-bold text-ink" title="지원자 프로필">
          {resumeInitial}
        </div>
      </div>
    </aside>
  );
}
