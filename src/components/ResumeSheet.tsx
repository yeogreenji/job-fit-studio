import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Plus, Save, Sparkles, Trash2, Upload, X } from "lucide-react";
import type { Experience, MasterResume } from "../types";
import { resumeBulletCount } from "../lib/storage";
import { cx } from "./ui";

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

const csv = (items: string[]) => items.join(", ");
const fromCsv = (value: string) =>
  value
    .split(/[,·/|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 24);

export function ResumeSheet({
  open,
  resume,
  busy,
  onClose,
  onSave,
  onFile,
  onSample,
  onNotify,
}: {
  open: boolean;
  resume: MasterResume;
  busy: string | null;
  onClose: () => void;
  onSave: (resume: MasterResume) => void;
  onFile: (file: File) => void;
  onSample: () => void;
  onNotify: (message: string, tone?: "ok" | "warn" | "err") => void;
}) {
  const [draft, setDraft] = useState<MasterResume>(resume);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setDraft(resume);
  }, [open, resume]);

  if (!open) return null;

  const patch = (next: Partial<MasterResume>) => setDraft((prev) => ({ ...prev, ...next }));

  const patchExp = (id: string, next: Partial<Experience>) =>
    setDraft((prev) => ({ ...prev, experiences: prev.experiences.map((exp) => (exp.id === id ? { ...exp, ...next } : exp)) }));

  const addExperience = () =>
    setDraft((prev) => ({
      ...prev,
      experiences: [
        ...prev.experiences,
        { id: uid("exp"), company: "", role: "", period: "", employment: "정규직", bullets: [{ id: uid("b"), text: "" }] },
      ],
    }));

  const removeExperience = (id: string) =>
    setDraft((prev) => ({ ...prev, experiences: prev.experiences.filter((exp) => exp.id !== id) }));

  const save = () => {
    if (resumeBulletCount(draft) === 0) {
      onNotify("경력 문장을 한 개 이상 넣어 주세요. 이 문장이 AI가 쓰는 유일한 근거입니다.", "warn");
      return;
    }
    onSave(draft);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <div className="eyebrow">My resume</div>
            <h2 className="mt-1 text-[15px] font-semibold text-ink">내 이력서 · 경력 원본</h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">
              여기 적은 문장만 AI가 씁니다. 회사·직함·기간·성과 수치를 그대로 적어 주세요.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-line bg-paper-deep/40 px-4 py-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline h-7 px-2 text-[10.5px]" data-testid="sheet-file">
            <Upload size={11} /> 파일 불러오기
          </button>
          <button type="button" onClick={onSample} className="btn btn-ghost h-7 px-2 text-[10.5px] text-muted" data-testid="sheet-sample">
            <Sparkles size={11} /> 샘플로 채우기
          </button>
          <span className="ml-auto text-[10px] text-faint">
            경력 {draft.experiences.length}개 · 문장 {resumeBulletCount(draft)}개
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,.pdf,text/plain,application/pdf"
            className="hidden"
            data-testid="sheet-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = "";
            }}
          />
        </div>

        {busy && (
          <div className="flex items-center gap-2 border-b border-line bg-accent-soft px-4 py-2 text-[11px] text-accent-deep">
            <Loader2 size={12} className="animate-spin" /> {busy}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold text-muted">이름 (가명 가능)</span>
              <input className="field field-sm" value={draft.name} onChange={(event) => patch({ name: event.target.value })} data-testid="resume-field-name" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold text-muted">한 줄 소개</span>
              <input
                className="field field-sm"
                value={draft.headline}
                placeholder="예: PR·브랜드 커뮤니케이션 매니저"
                onChange={(event) => patch({ headline: event.target.value })}
                data-testid="resume-field-headline"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold text-muted">경력 연차</span>
              <input
                className="field field-sm"
                inputMode="numeric"
                value={draft.years || ""}
                onChange={(event) => patch({ years: Number(event.target.value.replace(/[^\d]/g, "")) || 0 })}
                data-testid="resume-field-years"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold text-muted">스킬 (쉼표로 구분)</span>
              <input
                className="field field-sm"
                value={csv(draft.skills)}
                placeholder="미디어 릴레이션, 위기 커뮤니케이션"
                onChange={(event) => patch({ skills: fromCsv(event.target.value) })}
                data-testid="resume-field-skills"
              />
            </label>
          </div>

          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-semibold text-muted">경력 요약 (없으면 비워도 됩니다)</span>
            <textarea
              className="field auto-field text-[12px] leading-relaxed"
              value={draft.summary}
              onChange={(event) => patch({ summary: event.target.value })}
              data-testid="resume-field-summary"
            />
          </label>

          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] font-semibold text-muted">산업 (쉼표로 구분)</span>
            <input
              className="field field-sm"
              value={csv(draft.industries)}
              placeholder="뷰티, 커머스, B2B SaaS"
              onChange={(event) => patch({ industries: fromCsv(event.target.value) })}
              data-testid="resume-field-industries"
            />
          </label>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ink">경력 사항</span>
            <button type="button" onClick={addExperience} className="btn btn-ghost h-7 px-2 text-[10.5px] text-muted" data-testid="resume-add-exp">
              <Plus size={11} /> 경력 추가
            </button>
          </div>

          <div className="mt-1.5 space-y-2">
            {draft.experiences.map((exp, expIndex) => (
              <div key={exp.id} className="rounded-xl border border-line bg-[#fcfcfa] p-2.5" data-testid={`resume-exp-${expIndex}`}>
                <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_118px_auto]">
                  <input
                    className="field field-sm"
                    placeholder="회사"
                    value={exp.company}
                    onChange={(event) => patchExp(exp.id, { company: event.target.value })}
                    data-testid={`resume-exp-${expIndex}-company`}
                  />
                  <input
                    className="field field-sm"
                    placeholder="직함"
                    value={exp.role}
                    onChange={(event) => patchExp(exp.id, { role: event.target.value })}
                    data-testid={`resume-exp-${expIndex}-role`}
                  />
                  <input
                    className="field field-sm"
                    placeholder="2021.03 – 현재"
                    value={exp.period}
                    onChange={(event) => patchExp(exp.id, { period: event.target.value })}
                    data-testid={`resume-exp-${expIndex}-period`}
                  />
                  <button
                    type="button"
                    onClick={() => removeExperience(exp.id)}
                    className="btn btn-ghost h-8 px-1.5 text-muted"
                    aria-label="경력 삭제"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {exp.bullets.map((bullet, bulletIndex) => (
                    <div key={bullet.id} className="flex items-start gap-1.5">
                      <textarea
                        className={cx("field field-sm min-h-[46px] flex-1 text-[11.5px] leading-relaxed")}
                        placeholder="성과 문장 — 무엇을, 어떻게, 결과가 어떻게 달라졌는지"
                        value={bullet.text}
                        onChange={(event) =>
                          patchExp(exp.id, {
                            bullets: exp.bullets.map((item) => (item.id === bullet.id ? { ...item, text: event.target.value } : item)),
                          })
                        }
                        data-testid={`resume-exp-${expIndex}-bullet-${bulletIndex}`}
                      />
                      <button
                        type="button"
                        onClick={() => patchExp(exp.id, { bullets: exp.bullets.filter((item) => item.id !== bullet.id) })}
                        className="btn btn-ghost mt-1 h-7 px-1 text-muted"
                        aria-label="문장 삭제"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchExp(exp.id, { bullets: [...exp.bullets, { id: uid("b"), text: "" }] })}
                    className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted"
                  >
                    <Plus size={10} /> 문장 추가
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <span className="hidden text-[10px] leading-relaxed text-faint sm:block">
            <FileText size={10} className="mr-1 inline" />
            저장하면 이 브라우저에만 남습니다. 서버에 보관하지 않습니다.
          </span>
          <button type="button" onClick={onClose} className="btn btn-ghost ml-auto h-9 px-3 text-[12px] text-muted">
            취소
          </button>
          <button type="button" onClick={save} className="btn btn-primary h-9 px-4 text-[12px]" data-testid="resume-save">
            <Save size={13} /> 저장
          </button>
        </div>
      </div>
    </div>
  );
}
