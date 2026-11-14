import { useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, ShieldCheck, X } from "lucide-react";
import type { LlmConfig } from "../types";
import { testLlmConnection } from "../lib/llm";
import { Toggle, cx } from "./ui";

export function ApiModal({
  open,
  config,
  onClose,
  onSave,
}: {
  open: boolean;
  config: LlmConfig;
  onClose: () => void;
  onSave: (config: LlmConfig) => void;
}) {
  const [draft, setDraft] = useState<LlmConfig>(config);
  const [test, setTest] = useState<{ status: "idle" | "loading" | "ok" | "error"; message: string }>({ status: "idle", message: "" });
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(config);
      setTest({ status: "idle", message: "" });
      setShowKey(false);
    }
  }, [open, config]);

  if (!open) return null;

  const runTest = async () => {
    setTest({ status: "loading", message: "" });
    try {
      const reply = await testLlmConnection(draft);
      setTest({ status: "ok", message: `연결되었습니다. ${reply.slice(0, 60)}` });
    } catch (error) {
      setTest({ status: "error", message: error instanceof Error ? error.message : "연결에 실패했습니다." });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="animate-rise relative z-10 w-full max-w-[460px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div>
            <div className="eyebrow">Engine</div>
            <h2 className="mt-1 text-[15px] font-semibold">LLM 정밀 보정 (선택)</h2>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">키가 없어도 내장 키워드 엔진으로 모두 동작합니다.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3.5 px-5 py-4">
          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold text-muted">제공자</div>
            <div className="seg w-full">
              {(["openai", "anthropic"] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  data-active={draft.provider === provider}
                  className="seg-item flex-1"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      provider,
                      model: provider === "openai" ? "gpt-4o-mini" : "claude-3-5-haiku-latest",
                    })
                  }
                >
                  {provider === "openai" ? "OpenAI 호환" : "Anthropic"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-semibold text-muted">모델</div>
            <input className="field" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="gpt-4o-mini" />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold text-muted">API 키</span>
              <button type="button" onClick={() => setShowKey(!showKey)} className="text-[9.5px] text-muted hover:text-ink">
                {showKey ? "가리기" : "보기"}
              </button>
            </div>
            <input
              className="field font-mono text-[11.5px]"
              type={showKey ? "text" : "password"}
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-..."
              autoComplete="off"
            />
            <p className="mt-1 flex items-start gap-1 text-[9.5px] leading-relaxed text-faint">
              <ShieldCheck size={10} className="mt-0.5 shrink-0" />
              키는 이 브라우저의 로컬 저장소에만 보관되며, 생성 시 해당 API로 직접 전송됩니다. 서버를 거치지 않습니다.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-[#fcfcf9] px-3 py-2.5">
            <div>
              <div className="text-[11px] font-medium text-ink">생성 시 LLM 보정 사용</div>
              <div className="text-[9.5px] text-faint">어필 포인트·리라이트·질문을 한 번 더 다듬습니다</div>
            </div>
            <Toggle checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} label="LLM 사용" />
          </div>

          {test.status !== "idle" && (
            <div
              className={cx(
                "flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[10px] leading-relaxed",
                test.status === "ok" && "bg-ok-soft text-ok",
                test.status === "error" && "bg-risk-soft text-risk",
                test.status === "loading" && "bg-paper-deep text-muted",
              )}
            >
              {test.status === "loading" && <Loader2 size={11} className="mt-0.5 shrink-0 animate-spin" />}
              {test.status === "ok" && <Check size={11} className="mt-0.5 shrink-0" />}
              {test.status === "error" && <AlertCircle size={11} className="mt-0.5 shrink-0" />}
              {test.status === "loading" ? "연결 확인 중…" : test.message}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line bg-[#fcfcfa] px-5 py-3">
          <button type="button" onClick={runTest} disabled={!draft.apiKey.trim() || test.status === "loading"} className="btn btn-outline h-8 px-2.5 text-[11px]">
            연결 테스트
          </button>
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
