import { JobTracker } from "./components/JobTracker";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Gauge as GaugeIcon,
  Mic,
  Package,
  PenLine,
  Printer,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { JobPackage, JobPosting, LlmConfig, MasterResume, StarAnswer, TabId, ViewId } from "./types";
import { DEFAULT_JOB, DEFAULT_RESUME, EMPTY_JOB, SAMPLE_JOBS } from "./lib/presets";
import { analyze, projectMatch } from "./lib/engine";
import { applyEnrichment, enrichPackage } from "./lib/llm";
import { buildMarkdown, downloadText, slugForFile } from "./lib/report";
import {
  addPackage,
  clearPackages,
  loadApiConfig,
  loadPackages,
  loadResume,
  persistApiConfig,
  persistResume,
  removePackage,
  updatePackage,
} from "./lib/storage";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { InputPanel, RUN_STEPS } from "./components/InputPanel";
import { Rail } from "./components/Rail";
import { EmptyState } from "./components/EmptyState";
import { HistoryView } from "./components/HistoryView";
import { ApiModal } from "./components/ApiModal";
import { PrintSheet } from "./components/PrintSheet";
import { MatchTab } from "./components/tabs/MatchTab";
import { RewriteTab } from "./components/tabs/RewriteTab";
import { InterviewTab } from "./components/tabs/InterviewTab";
import { ExportTab } from "./components/tabs/ExportTab";
import { Card, cx, scoreColor } from "./components/ui";

type MobilePanel = "input" | "studio" | "rail";
type ToastTone = "ok" | "warn" | "err";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


export default function App() {
  const [view, setView] = useState<ViewId>("studio");
  const [resume, setResume] = useState<MasterResume>(() => loadResume());
  const [job, setJob] = useState<JobPosting>(DEFAULT_JOB);
  const [activeSampleResume, setActiveSampleResume] = useState<string | null>(DEFAULT_RESUME.id);
  const [activeSampleJob, setActiveSampleJob] = useState<string | null>(DEFAULT_JOB.id);
  const [inputTab, setInputTab] = useState<"job" | "resume">("job");

  const [pkg, setPkg] = useState<JobPackage | null>(null);
  const [tab, setTab] = useState<TabId>("match");
  const [saved, setSaved] = useState<JobPackage[]>(() => loadPackages());
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);

  const [apiConfig, setApiConfig] = useState<LlmConfig>(() => loadApiConfig());
  const [apiOpen, setApiOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("input");
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = "ok") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => persistResume(resume), 350);
    return () => clearTimeout(timer);
  }, [resume]);

  useEffect(() => {
    if (!pkg) return;
    const timer = setTimeout(() => setSaved((prev) => updatePackage(prev, pkg)), 500);
    return () => clearTimeout(timer);
  }, [pkg]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [mobilePanel, view]);

  const projection = useMemo(
    () => (pkg ? projectMatch(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.rewrites, pkg.summary) : null),
    [pkg],
  );

  const stale = useMemo(() => {
    if (!pkg) return false;
    const snap = pkg.resumeSnapshot;
    return (
      job.company !== pkg.jobSnapshot.company ||
      job.role !== pkg.jobSnapshot.role ||
      job.responsibilities !== pkg.jobSnapshot.responsibilities ||
      job.requirements !== pkg.jobSnapshot.requirements ||
      job.preferred !== pkg.jobSnapshot.preferred ||
      resume.name !== snap.name ||
      resume.years !== snap.years ||
      JSON.stringify(resume.experiences) !== JSON.stringify(snap.experiences) ||
      JSON.stringify(resume.skills) !== JSON.stringify(snap.skills)
    );
  }, [job, pkg, resume]);

  const generate = useCallback(
    async (override?: { job?: JobPosting; resume?: MasterResume }) => {
      const activeJob = override?.job ?? job;
      const activeResume = override?.resume ?? resume;
      if (!activeJob.company.trim() || !activeJob.role.trim()) {
        notify("회사와 직무를 먼저 입력하세요.", "warn");
        setInputTab("job");
        setMobilePanel("input");
        return;
      }
      if (!activeJob.responsibilities.trim() && !activeJob.requirements.trim()) {
        notify("공고의 담당 업무나 자격 요건을 먼저 넣어 주세요.", "warn");
        setInputTab("job");
        setMobilePanel("input");
        return;
      }
      const bulletCount = activeResume.experiences.reduce((sum, exp) => sum + exp.bullets.filter((b) => b.text.trim().length > 5).length, 0);
      if (bulletCount === 0) {
        notify("경력 원본에 문장을 한 개 이상 넣어 주세요.", "warn");
        setInputTab("resume");
        setMobilePanel("input");
        return;
      }

      setRunning(true);
      setStep(0);
      setView("studio");
      setMobilePanel("studio");
      for (let i = 0; i < RUN_STEPS.length; i += 1) {
        setStep(i);
        await sleep(i === 0 ? 220 : 240);
      }

      const result = analyze(activeResume, activeJob);
      let next: JobPackage = {
        id: `pkg-${Date.now()}`,
        createdAt: new Date().toISOString(),
        company: activeJob.company.trim(),
        role: activeJob.role.trim(),
        employmentType: activeJob.employmentType,
        location: activeJob.location,
        resumeName: activeResume.name,
        resumeHeadline: activeResume.headline,
        years: activeResume.years,
        engine: "heuristic",
        match: result.match,
        summary: result.summary,
        rewrites: result.rewrites,
        appeals: result.appeals,
        questions: result.questions,
        jobKeywords: result.jobKeywords,
        resumeSnapshot: activeResume,
        jobSnapshot: activeJob,
      };

      if (apiConfig.enabled && apiConfig.apiKey.trim()) {
        try {
          const enrichment = await enrichPackage(apiConfig, next);
          next = applyEnrichment(next, enrichment);
          notify("LLM 보정까지 반영했습니다.");
        } catch (error) {
          const message = error instanceof Error ? error.message : "알 수 없는 오류";
          notify(`LLM 호출 실패 — 내장 엔진 결과를 표시합니다. (${message})`, "warn");
        }
      }

      setPkg(next);
      setSaved((prev) => addPackage(prev, next));
      setTab("match");
      setRunning(false);
    },
    [apiConfig, job, notify, resume],
  );

  const handleSampleJob = (sample: JobPosting) => {
    setJob(sample);
    setActiveSampleJob(sample.id);
    setInputTab("job");
    void generate({ job: sample });
  };

  const handleSampleResume = (sample: MasterResume) => {
    setResume(sample);
    setActiveSampleResume(sample.id);
    notify(`경력 원본을 ‘${sample.name}’ 샘플로 바꿨습니다. 다시 생성하면 반영됩니다.`);
  };

  const handleJobChange = (next: JobPosting) => {
    setJob(next);
    setActiveSampleJob(SAMPLE_JOBS.some((s) => s.id === next.id) ? next.id : null);
  };

  const handleResumeChange = (next: MasterResume) => {
    setResume(next);
    setActiveSampleResume(null);
  };

  const resetInputs = () => {
    setResume(DEFAULT_RESUME);
    setJob(DEFAULT_JOB);
    setActiveSampleResume(DEFAULT_RESUME.id);
    setActiveSampleJob(DEFAULT_JOB.id);
    setPkg(null);
    setView("studio");
    notify("샘플 입력으로 초기화했습니다.", "warn");
  };

  const toggleRewrite = (id: string) => {
    setPkg((prev) =>
      prev ? { ...prev, rewrites: prev.rewrites.map((r) => (r.id === id ? { ...r, adopted: !r.adopted } : r)) } : prev,
    );
  };

  const toggleSummary = () => {
    setPkg((prev) => (prev ? { ...prev, summary: { ...prev.summary, adopted: !prev.summary.adopted } } : prev));
  };

  const toggleAll = (adopted: boolean) => {
    setPkg((prev) => (prev ? { ...prev, rewrites: prev.rewrites.map((r) => ({ ...r, adopted })) } : prev));
    notify(adopted ? "모든 리라이트를 반영했습니다." : "모든 리라이트를 해제했습니다.", adopted ? "ok" : "warn");
  };

  const updateStar = (id: string, key: keyof StarAnswer, value: string) => {
    setPkg((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions.map((q) => (q.id === id ? { ...q, edited: true, star: { ...q.star, [key]: value } } : q)),
          }
        : prev,
    );
  };

  const resetStar = (id: string) => {
    setPkg((prev) => {
      if (!prev) return prev;
      const seed = analyze(prev.resumeSnapshot, prev.jobSnapshot).questions.find((q) => q.id === id);
      if (!seed) return prev;
      return { ...prev, questions: prev.questions.map((q) => (q.id === id ? { ...q, edited: false, star: seed.star } : q)) };
    });
    notify("답변을 처음 제안으로 되돌렸습니다.", "warn");
  };

  const loadPackage = (next: JobPackage) => {
    setPkg(next);
    setJob(next.jobSnapshot);
    setActiveSampleJob(null);
    setView("studio");
    setTab("match");
    setMobilePanel("studio");
    notify(`${next.company} 패키지를 열었습니다.`);
  };

  const deletePackage = (id: string) => {
    setSaved((prev) => removePackage(prev, id));
    if (pkg?.id === id) setPkg(null);
    notify("패키지를 삭제했습니다.", "warn");
  };

  const clearAll = () => {
    setSaved(clearPackages());
    setPkg(null);
    notify("히스토리를 모두 비웠습니다.", "warn");
  };

  const saveApi = (config: LlmConfig) => {
    setApiConfig(config);
    persistApiConfig(config);
    setApiOpen(false);
    notify(config.enabled && config.apiKey ? "LLM 보정을 켰습니다." : "LLM 설정을 저장했습니다. (사용 안 함)");
  };

  const exportMarkdown = () => {
    if (!pkg) return;
    downloadText(slugForFile(pkg.company, pkg.createdAt), buildMarkdown(pkg));
    notify("Markdown 패키지를 내려받았습니다.");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!running) void generate();
      }
      if (event.key === "Escape") {
        setApiOpen(false);
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [generate, running]);

  const panelVisible = (panel: MobilePanel) => (mobilePanel === panel ? "block" : "hidden");

  const tabs = useMemo(() => {
    if (!pkg) return [];
    const adopted = pkg.rewrites.filter((r) => r.adopted).length;
    const answered = pkg.questions.filter((q) => q.edited).length;
    const gapCount = pkg.match.keywords.filter((k) => k.status !== "matched").length;
    return [
      { id: "match" as TabId, label: "적합도·갭", icon: GaugeIcon, count: gapCount },
      { id: "rewrite" as TabId, label: "경력 리라이트", icon: PenLine, count: adopted },
      { id: "interview" as TabId, label: "면접 준비", icon: Mic, count: answered },
      { id: "export" as TabId, label: "내보내기", icon: Package, count: 0 },
    ];
  }, [pkg]);

  const railNode = <Rail pkg={pkg} saved={saved} onLoad={loadPackage} onOpenHistory={() => setView("history")} />;

  return (
    <>
      <div className="min-h-screen bg-paper print:hidden">
        <Sidebar
          view={view}
          resumeInitial={resume.name.trim().slice(0, 1) || "J"}
          onChangeView={(next) => {
            setView(next);
            setMobilePanel(next === "history" ? "studio" : "input");
          }}
          onOpenApi={() => setApiOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />

        <TopBar
          view={view}
          company={pkg?.company ?? job.company}
          role={pkg?.role ?? job.role}
          apiEnabled={apiConfig.enabled && Boolean(apiConfig.apiKey)}
          onOpenApi={() => setApiOpen(true)}
          onOpenTracker={() => setView(view === "tracker" ? "studio" : "tracker")}
          onOpenHistory={() => setView(view === "history" ? "studio" : "history")}
          onOpenGuide={() => setHelpOpen(true)}
        />

        <main className="lg:pl-[68px]">
          <div className="mx-auto w-full max-w-[1640px] px-3 pb-24 pt-3 sm:px-5 sm:pt-4 xl:pb-6">
            {view === "tracker" ? (
              <JobTracker company={job.company} role={job.role} onBack={() => setView("studio")} />
            ) : view === "history" ? (
              <HistoryView
                packages={saved}
                onLoad={loadPackage}
                onDelete={deletePackage}
                onClear={clearAll}
                onBack={() => setView("studio")}
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-[338px_minmax(0,1fr)] xl:grid-cols-[338px_minmax(0,1fr)_294px]">
                <div className={cx(panelVisible("input"), "lg:block")}>
                  <div className="lg:sticky lg:top-[72px] lg:h-[calc(100vh-88px)]">
                    <InputPanel
                      job={job}
                      resume={resume}
                      inputTab={inputTab}
                      onInputTab={setInputTab}
                      onJob={handleJobChange}
                      onResume={handleResumeChange}
                      onSampleResume={handleSampleResume}
                      onReset={resetInputs}
                      activeSampleJob={activeSampleJob}
                      activeSampleResume={activeSampleResume}
                      running={running}
                      step={step}
                      onGenerate={() => void generate()}
                      apiEnabled={apiConfig.enabled && Boolean(apiConfig.apiKey)}
                      onOpenApi={() => setApiOpen(true)}
                    />
                  </div>
                </div>

                <div className={cx(panelVisible("studio"), "min-w-0 lg:block")}>
                  {!pkg ? (
                    <EmptyState
                      onSample={handleSampleJob}
                      onBlank={() => {
                        setJob(EMPTY_JOB);
                        setActiveSampleJob(null);
                        setInputTab("job");
                        setMobilePanel("input");
                      }}
                    />
                  ) : (
                    <div className="space-y-3">
                      <Card className="overflow-hidden">
                        <div className="flex flex-wrap items-start gap-3 px-4 py-3.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h1 className="truncate text-[15px] font-semibold tracking-[-0.025em]">{pkg.company}</h1>
                              <span className="chip border border-line bg-surface text-ink-2">{pkg.role}</span>
                              <span className="chip bg-paper-deep text-muted">{pkg.employmentType}</span>
                              {pkg.location && <span className="hidden chip bg-paper-deep text-muted sm:inline-flex">{pkg.location}</span>}
                              <span className="hidden chip bg-paper-deep text-muted sm:inline-flex">{pkg.engine === "llm" ? "LLM 보정" : "키워드 엔진 v1.0"}</span>
                              {pkg.resumeSnapshot.id !== resume.id && <span className="chip bg-info-soft text-info">패키지 기준 · {pkg.resumeName}</span>}
                            </div>
                            <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-muted sm:line-clamp-1">
                              {pkg.match.summaryLine} · {new Date(pkg.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 생성
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button type="button" onClick={exportMarkdown} className="btn btn-outline h-8 px-2.5 text-[11px]">
                              <Download size={12} />
                              <span className="hidden sm:inline">Markdown</span>
                            </button>
                            <button type="button" onClick={() => window.print()} className="btn btn-outline h-8 px-2.5 text-[11px]" title="면접 준비 시트 인쇄">
                              <Printer size={12} />
                            </button>
                            <button type="button" onClick={() => void generate()} className="btn btn-primary h-8 px-2.5 text-[11px]" title="현재 입력으로 다시 생성">
                              <RefreshCw size={12} />
                              <span className="hidden sm:inline">다시 생성</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 overflow-x-auto border-t border-line px-2 py-1.5">
                          {tabs.map((item) => {
                            const active = tab === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setTab(item.id)}
                                className={cx(
                                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors sm:px-2.5 sm:text-[11.5px]",
                                  active ? "bg-ink text-white" : "text-muted hover:bg-paper-deep hover:text-ink",
                                )}
                              >
                                <item.icon size={13} />
                                {item.label}
                                {item.count > 0 && (
                                  <span className={cx("num hidden text-[9.5px] sm:inline", active ? "text-white/60" : "text-faint")}>{item.count}</span>
                                )}
                              </button>
                            );
                          })}
                          <div className="ml-auto hidden shrink-0 items-center gap-1.5 pr-1 sm:flex">
                            <span className="num rounded-md px-1.5 py-0.5 text-[12px] font-semibold" style={{ color: scoreColor(pkg.match.score), background: `${scoreColor(pkg.match.score)}10` }}>
                              {pkg.match.score}
                            </span>
                            <span className="text-[9px] text-faint">/100</span>
                          </div>
                        </div>
                      </Card>

                      {stale && (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/25 bg-warn-soft px-3.5 py-2.5">
                          <span className="text-[11px] font-medium text-warn">공고나 경력 원본이 수정되었습니다. 결과는 마지막 생성 기준입니다.</span>
                          <button
                            type="button"
                            onClick={() => void generate()}
                            className="btn btn-outline ml-auto h-7 border-warn/30 bg-white/70 px-2.5 text-[10.5px] text-warn"
                          >
                            <Sparkles size={11} /> 다시 생성
                          </button>
                        </div>
                      )}

                      <div className="animate-rise">
                        {tab === "match" && <MatchTab match={pkg.match} job={pkg.jobSnapshot} />}
                        {tab === "rewrite" && projection && (
                          <RewriteTab
                            pkg={pkg}
                            projection={projection}
                            onToggle={toggleRewrite}
                            onToggleAll={toggleAll}
                            onToggleSummary={toggleSummary}
                          />
                        )}
                        {tab === "interview" && <InterviewTab pkg={pkg} onStar={updateStar} onReset={resetStar} />}
                        {tab === "export" && <ExportTab pkg={pkg} saved={saved} onLoad={loadPackage} onOpenHistory={() => setView("history")} />}
                      </div>
                    </div>
                  )}
                </div>

                <div className={cx(panelVisible("rail"), "min-w-0 xl:block")}>
                  <div className="xl:sticky xl:top-[72px]">{railNode}</div>
                </div>
              </div>
            )}

            {view === "studio" && (
              <div className={cx("mt-3 lg:hidden", mobilePanel === "rail" ? "block" : "hidden")}>
                <div className="grid gap-3 sm:grid-cols-2">{railNode}</div>
              </div>
            )}
            {view === "studio" && (
              <div className="mt-3 hidden lg:block xl:hidden">
                <div className="grid gap-3 sm:grid-cols-2">{railNode}</div>
              </div>
            )}
          </div>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
          <div className="grid grid-cols-3">
            {[
              { id: "input" as MobilePanel, label: "공고·경력", icon: FileText },
              { id: "studio" as MobilePanel, label: "패키지", icon: Package },
              { id: "rail" as MobilePanel, label: "현황", icon: GaugeIcon },
            ].map((item) => {
              const active = mobilePanel === item.id && view === "studio";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setView("studio");
                    setMobilePanel(item.id);
                  }}
                  className={cx("flex flex-col items-center gap-1 py-2.5", active ? "text-ink" : "text-faint")}
                >
                  <span className="relative">
                    <item.icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                    {item.id === "studio" && pkg && (
                      <span className="num absolute -right-3.5 -top-1.5 rounded-full bg-ink px-1 py-[1px] text-[8px] leading-tight text-white">{pkg.match.score}</span>
                    )}
                  </span>
                  <span className="text-[10px] font-semibold">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <ApiModal open={apiOpen} config={apiConfig} onClose={() => setApiOpen(false)} onSave={saveApi} />

        {helpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={() => setHelpOpen(false)} aria-hidden />
            <div className="animate-rise relative z-10 w-full max-w-[470px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
              <div className="flex items-start justify-between px-5 pt-5">
                <div>
                  <div className="eyebrow">Guide</div>
                  <h2 className="mt-1 text-[15px] font-semibold">이렇게 사용합니다</h2>
                </div>
                <button type="button" onClick={() => setHelpOpen(false)} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
                  <X size={16} />
                </button>
              </div>
              <ol className="mt-4 space-y-2.5 px-5">
                {[
                  "왼쪽 ‘채용 공고’에 회사·직무와 담당 업무·자격 요건을 붙여넣습니다. 원문 입력을 쓰면 문단으로 자동으로 나눕니다.",
                  "‘경력 원본’에서 샘플 3종 중 하나를 고르거나 직접 고칩니다. 문장마다 성과 수치를 넣을수록 리라이트가 좋아집니다.",
                  "‘지원 패키지 생성’을 누르면 적합도·갭, 리라이트 diff, 압박 면접 질문이 동시에 만들어집니다.",
                  "리라이트 카드에서 ‘반영’을 켜면 예상 점수가 실시간으로 바뀝니다. 면접 탭에서 STAR 답변을 채우세요.",
                  "내보내기에서 Markdown 패키지와 면접 준비 시트(인쇄·PDF)를 저장합니다. 모든 기록은 이 브라우저에만 남습니다.",
                ].map((text, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className="num mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded-md bg-paper-deep text-[9.5px] font-semibold text-muted">
                      {index + 1}
                    </span>
                    <span className="text-[11.5px] leading-relaxed text-ink-2">{text}</span>
                  </li>
                ))}
              </ol>
              <div className="mx-5 mt-4 rounded-lg border border-line bg-[#fcfcfa] p-3 text-[10.5px] leading-relaxed text-muted">
                샘플 인물·기업은 모두 가상입니다. 실제 회사 기밀, 타인의 개인정보, 채용 사이트의 비공개 자료는 넣지 마세요. 적합도 점수는 키워드 일치
                기반의 참고값이며 서류 통과를 보장하지 않습니다.
              </div>
              <div className="px-5 py-4">
                <button type="button" onClick={() => setHelpOpen(false)} className="btn btn-primary h-9 w-full text-[12px]">
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="pointer-events-none fixed inset-x-0 bottom-[74px] z-50 flex justify-center px-4 xl:bottom-6">
            <div
              className={cx(
                "animate-rise pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11.5px] font-medium shadow-[0_16px_40px_-20px_rgba(17,20,24,0.5)]",
                toast.tone === "ok" && "border-ink/10 bg-ink text-white",
                toast.tone === "warn" && "border-warn/25 bg-warn-soft text-warn",
                toast.tone === "err" && "border-risk/25 bg-risk-soft text-risk",
              )}
            >
              {toast.tone === "ok" && <Upload size={13} className="opacity-70" />}
              {toast.message}
            </div>
          </div>
        )}
      </div>

      {pkg && <PrintSheet pkg={pkg} />}
    </>
  );
}
