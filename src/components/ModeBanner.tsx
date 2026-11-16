import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Settings2, WifiOff } from "lucide-react";
import type { AiStatus } from "../types";
import { cx } from "./ui";

const REASON_LABEL: Record<string, string> = {
  no_key: "서버에 GEMINI_API_KEY/OPENAI_API_KEY가 없습니다",
  server_unavailable: "AI 서버(/api/analyze)에 연결되지 않았습니다",
  timeout: "AI 응답 시간이 초과됐습니다",
  upstream: "AI 제공자 응답에 문제가 있었습니다",
  rate_limit: "AI 호출 한도에 걸렸습니다",
  bad_response: "AI 응답 형식을 읽지 못했습니다",
  too_large: "입력이 너무 깁니다",
};

export function ModeBanner({
  status,
  running,
  hasPackage,
  onReanalyze,
  onOpenSettings,
}: {
  status: AiStatus;
  running: boolean;
  hasPackage: boolean;
  onReanalyze: () => void;
  onOpenSettings: () => void;
}) {
  const live = status.kind === "live";
  const checking = status.kind === "checking";
  const reason = status.reason ? REASON_LABEL[status.reason] ?? status.reason : "";

  return (
    <div
      data-testid="mode-banner"
      data-mode={status.kind}
      className={cx(
        "mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl border px-3 py-2",
        live && "border-accent/25 bg-accent-soft",
        checking && "border-line bg-paper-deep",
        !live && !checking && "border-warn/25 bg-warn-soft",
      )}
    >
      <span className="flex items-center gap-1.5">
        {checking && <Loader2 size={13} className="animate-spin text-muted" />}
        {live && <CheckCircle2 size={13} className="text-accent-deep" />}
        {!live && !checking && <WifiOff size={13} className="text-warn" />}
        <span
          data-testid="mode-label"
          className={cx("text-[11.5px] font-semibold", live ? "text-accent-deep" : checking ? "text-muted" : "text-warn")}
        >
          {checking ? "AI 서버 확인 중" : live ? "실시간 AI 분석" : "로컬 규칙 모드"}
        </span>
      </span>

      <span className={cx("line-clamp-2 min-w-0 flex-1 text-[10.5px] leading-relaxed sm:line-clamp-1", live ? "text-accent-deep/80" : checking ? "text-muted" : "text-warn")}>
        {checking
          ? "서버 상태를 확인하고 있습니다. 확인 전에는 규칙 엔진 결과를 보여 줍니다."
          : live
            ? `${status.model ?? "gpt-4o-mini"} · 이력서·공고를 서버에서 분석하고 결과를 원문과 대조합니다.`
            : `${reason || "AI 서버 미연결"} — 내장 규칙 엔진으로 모든 기능이 동작합니다.`}
      </span>

      {live && status.model && (
        <span className="num hidden shrink-0 rounded-md border border-accent/25 bg-white/60 px-1.5 py-0.5 text-[9.5px] font-semibold text-accent-deep sm:inline">
          {status.model}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onReanalyze}
          disabled={running || checking}
          className={cx(
            "btn h-7 px-2 text-[10.5px]",
            live ? "border border-accent/30 bg-white text-accent-deep hover:bg-white" : "border border-warn/30 bg-white/70 text-warn hover:bg-white",
            "disabled:opacity-50",
          )}
          title={hasPackage ? "현재 입력으로 AI 분석을 다시 돌립니다" : "현재 입력으로 패키지를 생성합니다"}
        >
          <RefreshCw size={11} className={running ? "animate-spin" : undefined} />
          {hasPackage ? "AI로 다시 분석" : "AI로 분석"}
        </button>
        {!live && !checking && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="btn h-7 border border-warn/25 bg-white/60 px-2 text-[10.5px] text-warn"
          >
            <Settings2 size={11} />
            <span className="hidden sm:inline">연결 방법</span>
          </button>
        )}
        {live && (
          <button type="button" onClick={onOpenSettings} className="btn btn-ghost h-7 px-1.5 text-[10.5px] text-accent-deep" aria-label="AI 설정">
            <Settings2 size={11} />
          </button>
        )}
      </div>

      {!live && !checking && (
        <div className="flex w-full items-start gap-1.5 border-t border-warn/15 pt-1.5 text-[9.5px] leading-relaxed text-warn/90">
          <AlertTriangle size={10} className="mt-0.5 shrink-0" />
          <span>
            적합도·갭·리라이트·질문은 규칙 엔진이 계산하고, 1분 자기소개·역질문·모의면접 피드백도 규칙으로 생성됩니다. AI를 붙이면 문장 품질과
            꼬리질문이 좋아집니다.
          </span>
        </div>
      )}
    </div>
  );
}
