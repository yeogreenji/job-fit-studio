import { useEffect, useState } from "react";
import { AlertCircle, Check, ExternalLink, Loader2, RefreshCw, ServerCog, ShieldCheck, X } from "lucide-react";
import type { AiConfig, AiStatus } from "../types";
import { Toggle, cx } from "./ui";

export function AiSettingsModal({
  open,
  status,
  config,
  probing,
  onClose,
  onSave,
  onReprobe,
}: {
  open: boolean;
  status: AiStatus;
  config: AiConfig;
  probing: boolean;
  onClose: () => void;
  onSave: (config: AiConfig) => void;
  onReprobe: () => void;
}) {
  const [draft, setDraft] = useState<AiConfig>(config);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(config);
      setShowKey(false);
    }
  }, [open, config]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="animate-rise relative z-10 w-full max-w-[500px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <div className="eyebrow">AI 연결</div>
            <h2 className="mt-1 text-[15px] font-semibold">AI 분석 연결</h2>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
              서버리스 함수(/api/analyze)가 OpenAI로 분석합니다. 키가 없으면 규칙 엔진으로 자동 전환됩니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div
            data-testid="ai-status"
            className={cx(
              "flex items-start gap-2 rounded-xl border px-3 py-2.5",
              status.kind === "live" && "border-accent/25 bg-accent-soft",
              status.kind === "checking" && "border-line bg-paper-deep",
              status.kind === "local" && "border-warn/25 bg-warn-soft",
            )}
          >
            <span className="mt-0.5 shrink-0">
              {status.kind === "checking" ? <Loader2 size={13} className="animate-spin text-muted" /> : status.kind === "live" ? <Check size={13} className="text-accent-deep" /> : <AlertCircle size={13} className="text-warn" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={cx("text-[11.5px] font-semibold", status.kind === "live" ? "text-accent-deep" : status.kind === "local" ? "text-warn" : "text-muted")}>
                {status.kind === "live" ? "실시간 AI 분석 연결됨" : status.kind === "checking" ? "확인 중" : "로컬 규칙 모드"}
              </div>
              <p className={cx("mt-0.5 text-[10px] leading-relaxed", status.kind === "live" ? "text-accent-deep/80" : "text-warn")}>
                {status.message}
                {status.model ? ` · ${status.model}` : ""}
              </p>
            </div>
            <button type="button" onClick={onReprobe} disabled={probing} className="btn btn-outline h-6 shrink-0 px-1.5 text-[10px]">
              <RefreshCw size={10} className={probing ? "animate-spin" : undefined} /> 다시 확인
            </button>
          </div>

          <div className="rounded-xl border border-line bg-[#fcfcf9] px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <ServerCog size={12} className="text-ink-2" />
              <span className="text-[11px] font-semibold text-ink">권장: 서버 환경변수로 설정</span>
            </div>
            <ol className="mt-1.5 space-y-1 text-[10.5px] leading-relaxed text-muted">
              <li>1. Vercel 프로젝트 → Settings → Environment Variables</li>
              <li>
                2.{" "}
                <code className="rounded bg-paper-deep px-1 font-mono text-[10px]">GEMINI_API_KEY</code> (권장, 무료 키) 또는{" "}
                <code className="rounded bg-paper-deep px-1 font-mono text-[10px]">OPENAI_API_KEY</code> 에 발급한 키 입력 (선택:{" "}
                <code className="rounded bg-paper-deep px-1 font-mono text-[10px]">GEMINI_MODEL</code>·{" "}
                <code className="rounded bg-paper-deep px-1 font-mono text-[10px]">OPENAI_MODEL</code>)
              </li>
              <li>3. 재배포하면 이 화면의 상태가 ‘실시간 AI 분석’으로 바뀝니다.</li>
            </ol>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent hover:underline"
              >
                Gemini 키 발급 페이지 <ExternalLink size={9} />
              </a>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent hover:underline"
              >
                OpenAI 키 발급 페이지 <ExternalLink size={9} />
              </a>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold text-muted">개인 키로 바로 쓰기 (선택)</span>
              <button type="button" onClick={() => setShowKey(!showKey)} className="text-[9.5px] text-muted hover:text-ink">
                {showKey ? "가리기" : "보기"}
              </button>
            </div>
            <input
              className="field font-mono text-[11.5px]"
              type={showKey ? "text" : "password"}
              value={draft.apiKey}
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value, sendKey: event.target.value.trim().length > 0 })}
              placeholder="sk-... 또는 Gemini 키(AQ.... / AIza...)"
              autoComplete="off"
              data-testid="ai-key-input"
            />
            <p className="mt-1 flex items-start gap-1 text-[9.5px] leading-relaxed text-faint">
              <ShieldCheck size={10} className="mt-0.5 shrink-0" />
              키는 이 브라우저에만 저장되고, 분석 요청 1회에만 본문에 실려 전송됩니다. 서버에는 저장하지 않으며 4xx/5xx 응답에도 남기지 않습니다.
            </p>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold text-muted">모델</div>
            <input className="field" value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="gpt-4o-mini" />
            <p className="mt-1 text-[9.5px] text-faint">허용: gpt-4o-mini · gpt-4o · gpt-4.1-mini · gpt-4.1, Gemini는 gemini-3.5-flash-lite 등 (그 외 값은 서버 기본값 사용)</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-[#fcfcf9] px-3 py-2.5">
            <div>
              <div className="text-[11px] font-medium text-ink">개인 키를 요청에 실어 보내기</div>
              <div className="text-[9.5px] text-faint">서버 환경변수(GEMINI_API_KEY·OPENAI_API_KEY)가 있으면 서버 키가 우선입니다</div>
            </div>
            <Toggle
              checked={draft.sendKey && draft.apiKey.trim().length > 0}
              onChange={(sendKey) => setDraft({ ...draft, sendKey })}
              label="개인 키 사용"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line bg-[#fcfcfa] px-5 py-3">
          <span className="text-[9.5px] text-faint">입력한 이력서·공고는 저장되지 않고 요청 처리 후 폐기됩니다.</span>
          <div className="ml-auto flex gap-1.5">
            <button type="button" onClick={onClose} className="btn btn-ghost h-8 px-2.5 text-[11px]">
              취소
            </button>
            <button type="button" onClick={() => onSave(draft)} className="btn btn-primary h-8 px-3 text-[11px]">
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
