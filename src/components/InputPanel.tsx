import { useState } from "react";
import {
  Briefcase,
  ClipboardPaste,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import type { Experience, JobPosting, MasterResume } from "../types";
import { SAMPLE_JOBS, SAMPLE_JOB_LABELS, SAMPLE_RESUMES } from "../lib/presets";
import { parseRawJob } from "../lib/korean";
import { cx, Kbd } from "./ui";

export const RUN_STEPS = ["공고 키워드 추출", "적합도·갭 계산", "경력 문장 리라이트", "압박 질문 생성"];

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function Label({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-[10.5px] font-semibold text-muted">{children}</span>
      {aside}
    </div>
  );
}

function JobEditor({ job, onJob }: { job: JobPosting; onJob: (job: JobPosting) => void }) {
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState("");
  const set = (patch: Partial<JobPosting>) => onJob({ ...job, ...patch });

  const applyRaw = () => {
    const parsed = parseRawJob(raw);
    if (!parsed.responsibilities && !parsed.requirements && !parsed.preferred) {
      set({ responsibilities: raw });
    } else {
      set(parsed);
    }
    setRawMode(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>샘플 공고로 시작</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {SAMPLE_JOBS.map((sample) => {
            const active = sample.id === job.id;
            return (
              <button
                key={sample.id}
                type="button"
                onClick={() => onJob(sample)}
                className={cx(
                  "rounded-lg border px-2 py-2 text-left transition-colors",
                  active ? "border-accent/40 bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className={cx("block truncate text-[11px] font-semibold", active ? "text-accent-deep" : "text-ink")}>
                  {sample.company}
                </span>
                <span className="mt-0.5 block truncate text-[9.5px] text-muted">{SAMPLE_JOB_LABELS[sample.id]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>회사</Label>
          <input className="field" value={job.company} onChange={(e) => set({ company: e.target.value })} placeholder="예: 클라우드플로우" />
        </div>
        <div>
          <Label>직무</Label>
          <input className="field" value={job.role} onChange={(e) => set({ role: e.target.value })} placeholder="예: 인하우스 PR 매니저" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>고용 형태</Label>
          <input className="field field-sm" value={job.employmentType} onChange={(e) => set({ employmentType: e.target.value })} />
        </div>
        <div>
          <Label>근무지</Label>
          <input className="field field-sm" value={job.location} onChange={(e) => set({ location: e.target.value })} placeholder="서울" />
        </div>
        <div>
          <Label>마감</Label>
          <input className="field field-sm" value={job.deadline} onChange={(e) => set({ deadline: e.target.value })} placeholder="상시" />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <ClipboardPaste size={13} />
          공고 원문을 한 번에 붙여넣기
        </span>
        <button
          type="button"
          onClick={() => setRawMode(!rawMode)}
          className={cx("btn h-6 px-2 text-[10.5px]", rawMode ? "btn-primary" : "btn-outline")}
        >
          {rawMode ? "문단 입력으로" : "원문 입력"}
        </button>
      </div>

      {rawMode ? (
        <div className="space-y-2">
          <textarea
            className="field auto-field min-h-[168px] font-mono text-[11.5px] leading-relaxed"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"담당 업무\n- ...\n\n자격 요건\n- ...\n\n우대 사항\n- ...\n\n조직 문화\n- ..."}
          />
          <button type="button" onClick={applyRaw} className="btn btn-accent h-8 w-full text-[11.5px]">
            <Wand2 size={12} /> 문단으로 자동 나누기
          </button>
          <p className="text-[10px] leading-relaxed text-faint">‘담당 업무 / 자격 요건 / 우대 사항 / 조직 문화’ 제목을 인식해 나눕니다. 나눈 뒤 직접 고칠 수 있습니다.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div>
            <Label aside={<span className="num text-[9.5px] text-faint">{job.responsibilities.length}</span>}>담당 업무</Label>
            <textarea
              className="field auto-field leading-relaxed"
              value={job.responsibilities}
              onChange={(e) => set({ responsibilities: e.target.value })}
              placeholder="미디어 릴레이션, 위기 커뮤니케이션, 대외협력…"
            />
          </div>
          <div>
            <Label aside={<span className="num text-[9.5px] text-faint">{job.requirements.length}</span>}>자격 요건</Label>
            <textarea
              className="field auto-field leading-relaxed"
              value={job.requirements}
              onChange={(e) => set({ requirements: e.target.value })}
              placeholder="경력 5년 이상, B2B 이해, 영어 커뮤니케이션…"
            />
          </div>
          <div>
            <Label aside={<span className="num text-[9.5px] text-faint">{job.preferred.length}</span>}>우대 사항 (선택)</Label>
            <textarea
              className="field auto-field leading-relaxed"
              value={job.preferred}
              onChange={(e) => set({ preferred: e.target.value })}
              placeholder="SaaS 인하우스 경험, 위기 대응 체계 구축…"
            />
          </div>
          <div>
            <Label aside={<span className="text-[9.5px] text-faint">조직 톤 분석에 사용</span>}>조직 톤 · 문화</Label>
            <textarea
              className="field auto-field leading-relaxed"
              value={job.tone}
              onChange={(e) => set({ tone: e.target.value })}
              placeholder="빠른 실행, 데이터 기반, 글로벌 협업…"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ResumeEditor({
  resume,
  onResume,
  activeSample,
  onSample,
}: {
  resume: MasterResume;
  onResume: (resume: MasterResume) => void;
  activeSample: string | null;
  onSample: (resume: MasterResume) => void;
}) {
  const [skillDraft, setSkillDraft] = useState("");
  const [industryDraft, setIndustryDraft] = useState("");
  const set = (patch: Partial<MasterResume>) => onResume({ ...resume, ...patch });
  const setExp = (id: string, patch: Partial<Experience>) =>
    set({ experiences: resume.experiences.map((exp) => (exp.id === id ? { ...exp, ...patch } : exp)) });

  const addSkill = () => {
    const value = skillDraft.trim();
    if (!value || resume.skills.includes(value)) return;
    set({ skills: [...resume.skills, value] });
    setSkillDraft("");
  };
  const addIndustry = () => {
    const value = industryDraft.trim();
    if (!value || resume.industries.includes(value)) return;
    set({ industries: [...resume.industries, value] });
    setIndustryDraft("");
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>샘플 경력 원본</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {SAMPLE_RESUMES.map((sample) => {
            const active = sample.id === activeSample;
            return (
              <button
                key={sample.id}
                type="button"
                onClick={() => onSample(sample)}
                className={cx(
                  "rounded-lg border px-2 py-2 text-left transition-colors",
                  active ? "border-accent/40 bg-accent-soft" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className={cx("block text-[11px] font-semibold", active ? "text-accent-deep" : "text-ink")}>{sample.name}</span>
                <span className="mt-0.5 block truncate text-[9.5px] text-muted">{sample.years}년 · {sample.headline.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_64px] gap-2">
        <div>
          <Label>이름 (가상)</Label>
          <input className="field" value={resume.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <Label>경력</Label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={40}
              className="field field-sm num text-center"
              value={resume.years}
              onChange={(e) => set({ years: Math.max(0, Number(e.target.value) || 0) })}
            />
            <span className="text-[10px] text-muted">년</span>
          </div>
        </div>
      </div>

      <div>
        <Label>한 줄 소개</Label>
        <input className="field" value={resume.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="PR·브랜드 커뮤니케이션 매니저" />
      </div>

      <div>
        <Label aside={<span className="num text-[9.5px] text-faint">{resume.summary.length}</span>}>경력 요약</Label>
        <textarea className="field auto-field leading-relaxed" value={resume.summary} onChange={(e) => set({ summary: e.target.value })} />
      </div>

      <div>
        <Label aside={<span className="text-[9.5px] text-faint">Enter로 추가</span>}>핵심 스킬</Label>
        <div className="flex flex-wrap gap-1.5">
          {resume.skills.map((skill) => (
            <span key={skill} className="chip border border-line bg-surface text-ink-2">
              {skill}
              <button type="button" onClick={() => set({ skills: resume.skills.filter((s) => s !== skill) })} aria-label={`${skill} 삭제`} className="text-faint hover:text-risk">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <input
          className="field field-sm mt-1.5"
          value={skillDraft}
          onChange={(e) => setSkillDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addSkill();
            }
          }}
          onBlur={addSkill}
          placeholder="예: 위기 커뮤니케이션"
        />
      </div>

      <div>
        <Label aside={<span className="text-[9.5px] text-faint">공고 산업 매칭에 사용</span>}>산업 경험</Label>
        <div className="flex flex-wrap gap-1.5">
          {resume.industries.map((industry) => (
            <span key={industry} className="chip bg-paper-deep text-muted">
              {industry}
              <button type="button" onClick={() => set({ industries: resume.industries.filter((i) => i !== industry) })} aria-label={`${industry} 삭제`} className="text-faint hover:text-risk">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <input
          className="field field-sm mt-1.5"
          value={industryDraft}
          onChange={(e) => setIndustryDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addIndustry();
            }
          }}
          onBlur={addIndustry}
          placeholder="예: 커머스"
        />
      </div>

      <div className="hairline" />

      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold text-muted">경력 ({resume.experiences.length})</span>
          <button
            type="button"
            onClick={() =>
              set({
                experiences: [
                  ...resume.experiences,
                  { id: uid("exp"), company: "", role: "", period: "", employment: "정규직", bullets: [{ id: uid("b"), text: "" }] },
                ],
              })
            }
            className="btn btn-outline h-6 px-2 text-[10.5px]"
          >
            <Plus size={11} /> 경력 추가
          </button>
        </div>

        {resume.experiences.map((exp, expIndex) => (
          <div key={exp.id} className="rounded-xl border border-line bg-[#fcfcf9] p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-faint">경력 {expIndex + 1}</span>
              {resume.experiences.length > 1 && (
                <button
                  type="button"
                  onClick={() => set({ experiences: resume.experiences.filter((e) => e.id !== exp.id) })}
                  className="btn btn-ghost h-5 px-1.5 text-[10px] text-faint hover:text-risk"
                  aria-label="경력 삭제"
                >
                  <Trash2 size={11} /> 삭제
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input className="field field-sm" value={exp.company} onChange={(e) => setExp(exp.id, { company: e.target.value })} placeholder="회사" />
              <input className="field field-sm" value={exp.role} onChange={(e) => setExp(exp.id, { role: e.target.value })} placeholder="직함" />
              <input className="field field-sm" value={exp.period} onChange={(e) => setExp(exp.id, { period: e.target.value })} placeholder="2023.03 – 현재" />
              <input className="field field-sm" value={exp.employment} onChange={(e) => setExp(exp.id, { employment: e.target.value })} placeholder="정규직" />
            </div>

            <div className="mt-2 space-y-1.5">
              {exp.bullets.map((bullet, bulletIndex) => (
                <div key={bullet.id} className="flex items-start gap-1">
                  <span className="num mt-2 w-3 shrink-0 text-[9px] text-faint">{bulletIndex + 1}</span>
                  <textarea
                    className="field field-sm auto-field min-h-[46px] leading-relaxed"
                    value={bullet.text}
                    onChange={(e) =>
                      setExp(exp.id, {
                        bullets: exp.bullets.map((b) => (b.id === bullet.id ? { ...b, text: e.target.value } : b)),
                      })
                    }
                    placeholder="성과 수치와 행동을 함께 적어 주세요."
                  />
                  <button
                    type="button"
                    onClick={() => setExp(exp.id, { bullets: exp.bullets.filter((b) => b.id !== bullet.id) })}
                    className="mt-1.5 rounded p-1 text-faint hover:bg-paper-deep hover:text-risk"
                    aria-label="문장 삭제"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setExp(exp.id, { bullets: [...exp.bullets, { id: uid("b"), text: "" }] })}
              className="btn btn-ghost mt-1 h-6 px-1.5 text-[10px] text-muted"
            >
              <Plus size={11} /> 문장 추가
            </button>
          </div>
        ))}
      </div>

      <p className="rounded-lg bg-paper-deep px-2.5 py-2 text-[10px] leading-relaxed text-muted">
        입력한 경력은 이 브라우저에만 저장됩니다. 샘플 인물·기업은 모두 가상이며, 회사 기밀 자료는 넣지 마세요.
      </p>
    </div>
  );
}

export function InputPanel({
  job,
  resume,
  inputTab,
  onInputTab,
  onJob,
  onResume,
  onSampleResume,
  onReset,
  activeSampleJob,
  activeSampleResume,
  running,
  step,
  onGenerate,
  apiEnabled,
  onOpenApi,
}: {
  job: JobPosting;
  resume: MasterResume;
  inputTab: "job" | "resume";
  onInputTab: (tab: "job" | "resume") => void;
  onJob: (job: JobPosting) => void;
  onResume: (resume: MasterResume) => void;
  onSampleResume: (resume: MasterResume) => void;
  onReset: () => void;
  activeSampleJob: string | null;
  activeSampleResume: string | null;
  running: boolean;
  step: number;
  onGenerate: () => void;
  apiEnabled: boolean;
  onOpenApi: () => void;
}) {
  return (
    <div className="card flex h-[calc(100dvh-176px)] flex-col overflow-hidden lg:h-full">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="seg">
          <button type="button" data-active={inputTab === "job"} className="seg-item flex items-center gap-1.5" onClick={() => onInputTab("job")}>
            <Briefcase size={12} /> 채용 공고
          </button>
          <button type="button" data-active={inputTab === "resume"} className="seg-item flex items-center gap-1.5" onClick={() => onInputTab("resume")}>
            <FileText size={12} /> 경력 원본
          </button>
        </div>
        <div className="flex items-center gap-1">
          <span className="chip bg-paper-deep px-1.5 py-0.5 text-[9px] text-faint">{activeSampleJob ? "샘플 공고" : "직접 입력"}</span>
          <button type="button" onClick={onReset} className="btn btn-ghost h-6 px-1.5 text-[10px] text-faint hover:text-ink" title="입력 초기화 (샘플로)">
            초기화
          </button>
        </div>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-3 xl:max-h-[calc(100vh-232px)]">
        {inputTab === "job" ? (
          <JobEditor job={job} onJob={onJob} />
        ) : (
          <ResumeEditor resume={resume} onResume={onResume} activeSample={activeSampleResume} onSample={onSampleResume} />
        )}
      </div>

      <div className="border-t border-line px-3 py-3">
        {running ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink">{RUN_STEPS[step]}…</span>
              <span className="num text-[10px] text-faint">
                {step + 1}/{RUN_STEPS.length}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-paper-deep">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
                style={{ width: `${((step + 1) / RUN_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          <button type="button" onClick={onGenerate} className="btn btn-accent h-10 w-full text-[12.5px]">
            <Wand2 size={15} /> 지원 패키지 생성
          </button>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <button type="button" onClick={onOpenApi} className="flex items-center gap-1 truncate text-[10px] text-muted hover:text-ink">
            <Sparkles size={10} className={apiEnabled ? "text-accent" : "text-faint"} />
            {apiEnabled ? "LLM 정밀 보정 사용 중" : "API 키 없이 내장 엔진으로 동작"}
          </button>
          <span className="flex shrink-0 items-center gap-1 text-[9.5px] text-faint">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
