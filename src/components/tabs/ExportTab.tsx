import { useState } from "react";
import { Archive, Check, ChevronRight, Download, FileText, History, Printer, Sparkles } from "lucide-react";
import type { JobPackage } from "../../types";
import { buildMarkdown, downloadText, slugForFile } from "../../lib/report";
import { Card, CopyButton, Eyebrow, Meter, SectionHead, cx } from "../ui";

export function ExportTab({
  pkg,
  saved,
  onLoad,
  onOpenHistory,
}: {
  pkg: JobPackage;
  saved: JobPackage[];
  onLoad: (pkg: JobPackage) => void;
  onOpenHistory: () => void;
}) {
  const [downloads, setDownloads] = useState(0);
  const markdown = buildMarkdown(pkg);
  const adopted = pkg.rewrites.filter((r) => r.adopted);
  const answered = pkg.questions.filter((q) => q.edited).length;
  const allRewrites = pkg.rewrites.length > 0 && adopted.length === pkg.rewrites.length;

  const checklist = [
    { done: allRewrites, label: "리라이트 전체 검토", note: `${adopted.length}/${pkg.rewrites.length}문장 반영` },
    { done: answered > 0, label: "STAR 결과 수치 채우기", note: `${answered}/${pkg.questions.length}개 답변 완성` },
    { done: false, label: "지원 동기를 회사 최근 소식과 연결", note: "한 문단으로 정리" },
    { done: downloads > 0, label: "패키지 파일로 보관", note: downloads > 0 ? "내려받음" : "Markdown으로 저장" },
  ];

  const exportMarkdown = () => {
    downloadText(slugForFile(pkg.company, pkg.createdAt), markdown);
    setDownloads((n) => n + 1);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Card className="flex flex-col p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent-deep">
              <Download size={14} />
            </span>
            <span className="text-[12.5px] font-semibold">Markdown 패키지</span>
          </div>
          <p className="mt-2 flex-1 text-[11px] leading-relaxed text-muted">
            적합도·키워드·리라이트·STAR 답변·체크리스트를 한 파일로. 노션·옵시디언·깃허브에 그대로 붙습니다.
          </p>
          <button type="button" onClick={exportMarkdown} className="btn btn-primary mt-3 h-8 text-[11.5px]">
            <Download size={12} /> {`job-fit-${pkg.company || "package"}.md`}
          </button>
        </Card>

        <Card className="flex flex-col p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-paper-deep text-ink-2">
              <Printer size={14} />
            </span>
            <span className="text-[12.5px] font-semibold">면접 준비 시트</span>
          </div>
          <p className="mt-2 flex-1 text-[11px] leading-relaxed text-muted">
            자기소개 3줄, 예상 질문, 보완 키워드를 A4 1~2장으로. 브라우저 인쇄로 PDF 저장까지.
          </p>
          <button type="button" onClick={() => window.print()} className="btn btn-outline mt-3 h-8 text-[11.5px]">
            <Printer size={12} /> 인쇄 · PDF 저장
          </button>
        </Card>

        <Card className="flex flex-col p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-info-soft text-info">
              <FileText size={14} />
            </span>
            <span className="text-[12.5px] font-semibold">경력기술서 문단</span>
          </div>
          <p className="mt-2 flex-1 text-[11px] leading-relaxed text-muted">
            반영한 문장만 회사·직함·기간 순으로 정리했습니다. 채용 사이트 입력창에 바로 붙이세요.
          </p>
          <CopyButton
            text={`${pkg.resumeName} · ${pkg.resumeHeadline}\n\n${pkg.summary.adopted ? pkg.summary.after : pkg.resumeSnapshot.summary}\n\n${pkg.resumeSnapshot.experiences
              .map((exp) => {
                const items = pkg.rewrites.filter((r) => r.experienceId === exp.id && r.adopted);
                if (!items.length) return "";
                return `${exp.company} | ${exp.role} | ${exp.period}\n${items.map((b) => `- ${b.after}`).join("\n")}`;
              })
              .filter(Boolean)
              .join("\n\n")}`}
            label="문단 전체 복사"
            className="btn btn-outline mt-3 h-8 justify-center text-[11.5px]"
          />
        </Card>

        <Card className="flex flex-col p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-paper-deep text-ink-2">
              <Archive size={14} />
            </span>
            <span className="text-[12.5px] font-semibold">이 지원 건 저장됨</span>
          </div>
          <p className="mt-2 flex-1 text-[11px] leading-relaxed text-muted">
            localStorage에 자동 저장됩니다. 지원 현황에서 점수를 나란히 비교할 수 있습니다.
          </p>
          <button type="button" onClick={onOpenHistory} className="btn btn-outline mt-3 h-8 text-[11.5px]">
            <History size={12} /> 히스토리 열기
          </button>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <Sparkles size={13} className="text-accent" />
            <span className="text-[12px] font-semibold">Markdown 미리보기</span>
            <span className="ml-auto">
              <CopyButton text={markdown} label="전체 복사" />
            </span>
          </div>
          <pre className="scroll-thin max-h-[420px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[10.5px] leading-[1.75] text-ink-2">
            {markdown}
          </pre>
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <SectionHead eyebrow="Before submit" title="제출 전 체크" />
            <ul className="mt-3 space-y-2">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                  <span
                    className={cx(
                      "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                      item.done ? "border-accent bg-accent text-white" : "border-line-strong bg-surface text-transparent",
                    )}
                  >
                    <Check size={10} />
                  </span>
                  <span className="min-w-0">
                    <span className={cx("block text-[11px] leading-snug", item.done ? "text-muted line-through" : "font-medium text-ink-2")}>{item.label}</span>
                    <span className="block text-[9.5px] text-faint">{item.note}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-line pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-muted">준비도</span>
                <span className="num text-[11px] font-semibold text-accent-deep">
                  {Math.round(((adopted.length / Math.max(1, pkg.rewrites.length)) * 50 + (answered / Math.max(1, pkg.questions.length)) * 50))}%
                </span>
              </div>
              <Meter value={(adopted.length / Math.max(1, pkg.rewrites.length)) * 50 + (answered / Math.max(1, pkg.questions.length)) * 50} className="mt-1.5" color="#0e6a58" />
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5">
              <span className="text-[11px] font-semibold text-ink">최근 지원</span>
              <button type="button" onClick={onOpenHistory} className="flex items-center gap-0.5 text-[10px] text-muted hover:text-ink">
                전체 <ChevronRight size={11} />
              </button>
            </div>
            <div className="divide-y divide-line border-t border-line">
              {saved.slice(0, 4).map((item) => (
                <button key={item.id} type="button" onClick={() => onLoad(item)} className="flex w-full items-center gap-2 px-3.5 py-2 text-left hover:bg-[#fbfbf8]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-ink">{item.company}</span>
                    <span className="block truncate text-[9.5px] text-faint">{item.role}</span>
                  </span>
                  <span className="num text-[11px] font-semibold" style={{ color: item.match.score >= 74 ? "#0e6a58" : item.match.score >= 60 ? "#a4680c" : "#c23b30" }}>
                    {item.match.score}
                  </span>
                </button>
              ))}
              {saved.length === 0 && <p className="px-3.5 py-4 text-[10.5px] text-faint">아직 저장된 지원 건이 없습니다.</p>}
            </div>
          </Card>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[10.5px] leading-relaxed text-muted">
        <Eyebrow className="mt-0.5 shrink-0">Note</Eyebrow>
        파일과 기록은 이 브라우저에만 저장됩니다. 다른 기기로 옮기려면 Markdown 파일을 내려받아 보관하세요.
      </p>
    </div>
  );
}
