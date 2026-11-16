import { useRef } from "react";
import { AlertTriangle, Briefcase, Check, FileText, Upload, X } from "lucide-react";
import type { ParsedImport, ImportKind } from "../lib/import";
import { cx } from "./ui";

export function FilePickButton({
  label,
  onFile,
  className,
  testId,
}: {
  label: string;
  onFile: (file: File) => void;
  className?: string;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} className={className ?? "btn btn-outline h-8 px-2.5 text-[11px]"} data-testid={testId}>
        <Upload size={12} />
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,text/plain,text/markdown"
        className="hidden"
        data-testid={testId ? `${testId}-input` : "file-input"}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </>
  );
}

const KINDS: { id: ImportKind; label: string; desc: string; icon: typeof Briefcase }[] = [
  { id: "job", label: "채용 공고로 넣기", desc: "담당 업무·자격 요건·우대 사항", icon: Briefcase },
  { id: "resume", label: "내 이력서로 넣기", desc: "회사·직함·기간·성과 문장", icon: FileText },
];

export function ImportDialog({
  open,
  fileName,
  text,
  preview,
  kind,
  onKind,
  onApply,
  onClose,
}: {
  open: boolean;
  fileName: string;
  text: string;
  preview: ParsedImport | null;
  kind: ImportKind;
  onKind: (kind: ImportKind) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="animate-rise relative z-10 flex max-h-[90vh] w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="eyebrow">Import file</div>
            <h2 className="mt-1 truncate text-[15px] font-semibold">{fileName || "불러온 파일"}</h2>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              텍스트(.txt)와 마크다운(.md)을 읽습니다. 어디에 넣을지 고르면 항목을 자동으로 나눕니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {KINDS.map((item) => {
              const active = kind === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onKind(item.id)}
                  aria-pressed={active}
                  data-testid={`import-kind-${item.id}`}
                  className={cx(
                    "rounded-xl border px-3 py-2.5 text-left transition-colors",
                    active ? "border-accent/45 bg-accent-soft" : "border-line bg-[#fcfcf9] hover:border-line-strong",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <item.icon size={12} className={active ? "text-accent-deep" : "text-faint"} />
                    <span className={cx("text-[11.5px] font-semibold", active ? "text-accent-deep" : "text-ink")}>{item.label}</span>
                    {active && <Check size={11} className="ml-auto text-accent-deep" />}
                  </span>
                  <span className="mt-0.5 block text-[9.5px] text-muted">{item.desc}</span>
                </button>
              );
            })}
          </div>

          {preview && (
            <div className="mt-3 rounded-xl border border-line bg-[#fcfcf9] px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted">인식 결과</span>
                <span className="num text-[9.5px] text-faint">{text.length.toLocaleString()}자</span>
              </div>
              <p className="mt-1 text-[11.5px] font-medium text-ink" data-testid="import-summary">
                {preview.summary}
              </p>
              {preview.kind === "job" ? (
                <p className="mt-1 text-[10px] leading-relaxed text-muted">
                  {preview.job.company || "(회사 미인식)"} · {preview.job.role || "(직무 미인식)"}
                </p>
              ) : (
                <p className="mt-1 text-[10px] leading-relaxed text-muted">
                  {preview.resume.name} · 경력 {preview.resume.years}년 ·{" "}
                  {preview.resume.experiences.map((exp) => exp.company || "(회사 미입력)").join(", ").slice(0, 60)}
                </p>
              )}
              {preview.warnings.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {preview.warnings.map((warning) => (
                    <li key={warning} className="flex items-start gap-1 text-[9.5px] leading-relaxed text-warn">
                      <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                      {warning}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-3">
            <div className="mb-1 text-[10px] font-semibold text-muted">파일 앞부분</div>
            <pre className="scroll-thin max-h-[160px] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-paper-deep/60 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-ink-2">
              {text.slice(0, 900)}
              {text.length > 900 ? "\n…" : ""}
            </pre>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line bg-[#fcfcfa] px-5 py-3">
          <span className="text-[9.5px] leading-relaxed text-faint">불러온 뒤에도 모든 항목은 직접 고칠 수 있습니다.</span>
          <div className="ml-auto flex gap-1.5">
            <button type="button" onClick={onClose} className="btn btn-ghost h-8 px-2.5 text-[11px]">
              취소
            </button>
            <button type="button" onClick={onApply} className="btn btn-primary h-8 px-3 text-[11px]" data-testid="import-apply">
              <Check size={12} /> 넣기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
