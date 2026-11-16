import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, type LucideIcon } from "lucide-react";
import type { KeywordStatus } from "../types";
import { highlights } from "../lib/korean";

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

export function Card({
  children,
  className,
  as: Tag = "div",
  testId,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "aside" | "article";
  testId?: string;
}) {
  return (
    <Tag className={cx("card", className)} data-testid={testId}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("eyebrow", className)}>{children}</div>;
}

export function SectionHead({
  eyebrow,
  title,
  desc,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  desc?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>}
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
        {desc && <p className="mt-1 text-[12px] leading-relaxed text-muted">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export const scoreColor = (score: number): string => {
  if (score >= 74) return "#0e6a58";
  if (score >= 60) return "#a4680c";
  if (score >= 45) return "#b4482f";
  return "#c23b30";
};

export function ScoreRing({
  score,
  size = 132,
  label,
  sub,
}: {
  score: number;
  size?: number;
  label?: string;
  sub?: string;
}) {
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  const color = scoreColor(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#edece6" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.22,.8,.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num font-semibold leading-none" style={{ fontSize: size * 0.27, color }}>
          {score}
        </span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">{label ?? "match"}</span>
        {sub && <span className="mt-0.5 text-[9.5px] text-muted">{sub}</span>}
      </div>
    </div>
  );
}

export function Meter({
  value,
  color,
  height = 4,
  track = "#eceae4",
  className,
}: {
  value: number;
  color?: string;
  height?: number;
  track?: string;
  className?: string;
}) {
  return (
    <div className={cx("w-full overflow-hidden rounded-full", className)} style={{ height, background: track }}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color ?? scoreColor(value) }}
      />
    </div>
  );
}

const STATUS_STYLE: Record<KeywordStatus, { label: string; className: string; dot: string }> = {
  matched: { label: "매칭", className: "bg-ok-soft text-ok", dot: "#16714f" },
  weak: { label: "보완", className: "bg-warn-soft text-warn", dot: "#a4680c" },
  missing: { label: "미충족", className: "bg-risk-soft text-risk", dot: "#c23b30" },
};

export function StatusChip({ status, label }: { status: KeywordStatus; label?: string }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={cx("chip", style.className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.dot }} />
      {label ?? style.label}
    </span>
  );
}

export function statusDot(status: KeywordStatus) {
  return STATUS_STYLE[status].dot;
}

export function CopyButton({
  text,
  label = "복사",
  className,
  icon: Icon = Copy,
}: {
  text: string;
  label?: string;
  className?: string;
  icon?: LucideIcon;
}) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(timer);
  }, [done]);

  return (
    <button
      type="button"
      className={cx("btn btn-ghost px-2 py-1 text-[11.5px] text-muted hover:text-ink", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check size={13} /> : <Icon size={13} />}
      {done ? "복사됨" : label}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors",
        checked ? "border-accent bg-accent" : "border-line-strong bg-[#e9e8e2]",
      )}
    >
      <span
        className={cx(
          "absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-all",
          checked ? "left-[19px]" : "left-[2px]",
        )}
      />
    </button>
  );
}

export function Highlighted({ text, labels, className }: { text: string; labels: string[]; className?: string }) {
  const parts = highlights(text, labels);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="mark-kw bg-transparent text-ink">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

export function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-center gap-1" title={level === 3 ? "압박 면접 수준" : level === 2 ? "실무 확인" : "기본 확인"}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: n <= level ? (level === 3 ? "#c23b30" : level === 2 ? "#a4680c" : "#0e6a58") : "#e2e1d9" }}
        />
      ))}
    </span>
  );
}

export function DeltaChip({ delta, suffix = "점" }: { delta: number; suffix?: string }) {
  if (delta === 0) return <span className="chip bg-[#f1f0ea] text-muted">변화 없음</span>;
  const good = delta > 0;
  return (
    <span className={cx("num chip", good ? "bg-ok-soft text-ok" : "bg-risk-soft text-risk")}>
      {good ? "+" : ""}
      {delta}
      {suffix}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-line bg-surface px-1.5 py-0.5 text-[9.5px] font-semibold text-muted">
      {children}
    </span>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const char = name.trim().slice(0, 1) || "J";
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-ink font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {char}
    </span>
  );
}
