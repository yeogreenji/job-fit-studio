import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  Gauge as GaugeIcon,
  ListChecks,
  Mic,
  Package,
  PenLine,
  Printer,
  Quote,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type {
  AiConfig,
  AiStatus,
  ApplicationEntry,
  InterviewFeedback,
  JobPackage,
  JobPosting,
  MasterResume,
  StarAnswer,
  TabId,
  ViewId,
} from "./types";
import { DEFAULT_JOB, DEFAULT_RESUME, EMPTY_JOB, EMPTY_RESUME, SAMPLE_JOBS } from "./lib/presets";
import { analyze, projectMatch } from "./lib/engine";
import { enrichWithAi } from "./lib/enrich";
import { AiError, probeAiServer } from "./lib/ai";
import { buildLocalIntro, buildLocalReverse } from "./lib/coach";
import { buildMarkdown, downloadText, slugForFile } from "./lib/report";
import { buildPreview, guessKind, readFileText, type ImportKind, type ParsedImport } from "./lib/import";
import {
  addPackage,
  clearPackages,
  loadAiConfig,
  loadPackages,
  loadResume,
  loadTracker,
  makeEntry,
  persistAiConfig,
  persistResume,
  persistTracker,
  removePackage,
  updatePackage,
} from "./lib/storage";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { InputPanel, RUN_STEPS } from "./components/InputPanel";
import { Rail } from "./components/Rail";
import { EmptyState } from "./components/EmptyState";
import { HistoryView } from "./components/HistoryView";
import { TrackerView } from "./components/TrackerView";
import { AiSettingsModal } from "./components/AiSettingsModal";
import { ImportDialog } from "./components/ImportDialog";
import { ModeBanner } from "./components/ModeBanner";
import { PrintSheet } from "./components/PrintSheet";
import { MatchTab } from "./components/tabs/MatchTab";
import { RewriteTab } from "./components/tabs/RewriteTab";
import { InterviewTab } from "./components/tabs/InterviewTab";
import { PitchTab } from "./components/tabs/PitchTab";
import { ExportTab } from "./components/tabs/ExportTab";
import { Card, cx, scoreColor } from "./components/ui";

type MobilePanel = "input" | "studio" | "rail";
type ToastTone = "ok" | "warn" | "err";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const INITIAL_STATUS: AiStatus = {
  kind: "checking",
  reachable: false,
  message: "AI 서버 확인 중",
  checkedAt: new Date().toISOString(),
};

const emptyJob = (): JobPosting => ({ ...EMPTY_JOB, id: uid("job-custom") });
const emptyResume = (): MasterResume => ({
  ...EMPTY_RESUME,
  id: uid("resume-custom"),
  experiences: EMPTY_RESUME.experiences.map((exp) => ({
    ...exp,
    id: uid("exp"),
    bullets: exp.bullets.map((bullet) => ({ ...bullet, id: uid("b") })),
  })),
});

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
  const [regenerating, setRegenerating] = useState(false);
  const [step, setStep] = useState(0);
  const [introVariant, setIntroVariant] = useState(0);

  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [aiStatus, setAiStatus] = useState<AiStatus>(INITIAL_STATUS);
  const [probing, setProbing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("studio");
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);
  const [tracker, setTracker] = useState<ApplicationEntry[]>(() => loadTracker());
  const [importState, setImportState] = useState<{ fileName: string; text: string; kind: ImportKind; preview: ParsedImport } | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = "ok") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => persistResume(resume), 350);
    return () => clearTimeout(timer);
  }, [resume]);

  useEffect(() => {
    persistTracker(tracker);
  }, [tracker]);

  useEffect(() => {
    if (!pkg) return;
    const timer = setTimeout(() => setSaved((prev) => updatePackage(prev, pkg)), 500);
    return () => clearTimeout(timer);
  }, [pkg]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [mobilePanel, view]);

  const refreshAi = useCallback(async (): Promise<AiStatus> => {
    setProbing(true);
    setAiStatus((prev) => ({ ...prev, kind: "checking", message: "AI 서버 확인 중" }));
    const result = await probeAiServer();
    const status: AiStatus = {
      kind: result.ai ? "live" : "local",
      reachable: result.reachable,
      model: result.model,
      reason: result.reason,
      message: result.message,
      checkedAt: new Date().toISOString(),
    };
    setAiStatus(status);
    setProbing(false);
    return status;
  }, []);

  useEffect(() => {
    void refreshAi();
  }, [refreshAi]);

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

  const upsertTracker = useCallback((next: JobPackage) => {
    setTracker((prev) => {
      const found = prev.find((entry) => entry.packageId === next.id || (entry.company === next.company && entry.role === next.role));
      if (found) {
        return prev.map((entry) =>
          entry.id === found.id
            ? {
                ...entry,
                packageId: next.id,
                score: next.match.score,
                deadline: entry.deadline || next.jobSnapshot.deadline,
                updatedAt: new Date().toISOString(),
              }
            : entry,
        );
      }
      return [
        makeEntry({
          company: next.company,
          role: next.role,
          packageId: next.id,
          score: next.match.score,
          deadline: next.jobSnapshot.deadline,
        }),
        ...prev,
      ];
    });
  }, []);

  const generate = useCallback(
    async (override?: { job?: JobPosting; resume?: MasterResume; forceAi?: boolean }) => {
      const activeJob = override?.job ?? job;
      const activeResume = override?.resume ?? resume;
      if (!activeJob.company.trim() || !activeJob.role.trim()) {
        notify("회사와 직무를 먼저 입력하세요.", "warn");
        setInputTab("job");
        setView("studio");
        setMobilePanel("input");
        return;
      }
      if (!activeJob.responsibilities.trim() && !activeJob.requirements.trim()) {
        notify("공고의 담당 업무나 자격 요건을 먼저 넣어 주세요.", "warn");
        setInputTab("job");
        setView("studio");
        setMobilePanel("input");
        return;
      }
      const bulletCount = activeResume.experiences.reduce((sum, exp) => sum + exp.bullets.filter((b) => b.text.trim().length > 5).length, 0);
      if (bulletCount === 0) {
        notify("경력 원본에 문장을 한 개 이상 넣어 주세요.", "warn");
        setInputTab("resume");
        setView("studio");
        setMobilePanel("input");
        return;
      }

      setRunning(true);
      setStep(0);
      setView("studio");
      setMobilePanel("studio");
      for (let i = 0; i < RUN_STEPS.length; i += 1) {
        setStep(i);
        await sleep(i === 0 ? 200 : 160);
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
        engine: "rule",
        match: result.match,
        summary: result.summary,
        rewrites: result.rewrites,
        appeals: result.appeals,
        questions: result.questions,
        jobKeywords: result.jobKeywords,
        resumeSnapshot: activeResume,
        jobSnapshot: activeJob,
        intro: buildLocalIntro(activeResume, activeJob, result.match, introVariant),
        reverse: buildLocalReverse(activeResume, activeJob, result.match),
        feedback: [],
      };

      if (aiStatus.kind === "live" || override?.forceAi) {
        try {
          const enriched = await enrichWithAi(next, aiConfig);
          next = enriched.pkg;
          if (enriched.warnings.length) {
            notify(`AI 분석 완료 — 근거가 확인되지 않은 항목 ${enriched.warnings.length}건을 제외했습니다.`, "warn");
          } else {
            notify("실시간 AI 분석을 반영했습니다.");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "AI 호출에 실패했습니다";
          notify(`${message} — 규칙 엔진 결과를 표시합니다.`, "warn");
          if (error instanceof AiError && error.code === "no_key") {
            setAiStatus((prev) => ({ ...prev, kind: "local", reason: "no_key", message: "서버에 API 키가 없습니다" }));
          }
        }
      }

      setPkg(next);
      setSaved((prev) => addPackage(prev, next));
      upsertTracker(next);
      setTab("match");
      setRunning(false);
    },
    [aiConfig, aiStatus.kind, introVariant, job, notify, resume, upsertTracker],
  );

  const reanalyzeWithAi = useCallback(async () => {
    const status = await refreshAi();
    if (status.kind !== "live") {
      notify("AI 서버에 연결되지 않았습니다. AI 연결 설정에서 키를 확인하세요. 규칙 엔진 결과는 그대로 유지됩니다.", "warn");
      setAiOpen(true);
      return;
    }
    if (!pkg) {
      await generate({ forceAi: true });
      return;
    }
    setRegenerating(true);
    try {
      const enriched = await enrichWithAi(pkg, aiConfig);
      setPkg(enriched.pkg);
      setSaved((prev) => updatePackage(prev, enriched.pkg));
      notify(
        enriched.warnings.length ? `AI 분석 완료 — 근거가 확인되지 않은 항목 ${enriched.warnings.length}건을 제외했습니다.` : "AI로 다시 분석했습니다.",
        enriched.warnings.length ? "warn" : "ok",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 호출에 실패했습니다";
      notify(`${message} — 기존 결과를 유지합니다.`, "warn");
      if (error instanceof AiError && error.code === "no_key") {
        setAiStatus((prev) => ({ ...prev, kind: "local", reason: "no_key", message: "서버에 API 키가 없습니다" }));
      }
    } finally {
      setRegenerating(false);
    }
  }, [aiConfig, generate, notify, pkg, refreshAi]);

  const regenerateIntro = useCallback(async () => {
    if (!pkg) return;
    const variant = introVariant + 1;
    setIntroVariant(variant);
    if (aiStatus.kind === "live") {
      setRegenerating(true);
      try {
        const enriched = await enrichWithAi(pkg, aiConfig);
        setPkg(enriched.pkg);
        setSaved((prev) => updatePackage(prev, enriched.pkg));
        notify("AI로 1분 자기소개를 다시 만들었습니다.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 호출에 실패했습니다";
        notify(`${message} — 규칙 엔진으로 대신 만들었습니다.`, "warn");
        setPkg({ ...pkg, intro: buildLocalIntro(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match, variant) });
      } finally {
        setRegenerating(false);
      }
      return;
    }
    setPkg({ ...pkg, intro: buildLocalIntro(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match, variant) });
    notify("규칙 엔진으로 다시 만들었습니다. AI를 연결하면 문장이 더 자연스러워집니다.", "warn");
  }, [aiConfig, aiStatus.kind, introVariant, notify, pkg]);

  const handleSampleJob = (sample: JobPosting) => {
    setJob(sample);
    setActiveSampleJob(sample.id);
    setInputTab("job");
    void generate({ job: sample });
  };

  const handleSampleResume = (sample: MasterResume) => {
    setResume(sample);
    setActiveSampleResume(sample.id);
    notify(`경력 원본을 ‘${sample.name}’ 예시로 바꿨습니다. 다시 생성하면 반영됩니다.`);
  };

  const handleJobChange = (next: JobPosting) => {
    setJob(next);
    setActiveSampleJob(SAMPLE_JOBS.some((s) => s.id === next.id) ? next.id : null);
  };

  const handleResumeChange = (next: MasterResume) => {
    setResume(next);
    setActiveSampleResume(null);
  };

  const blankInputs = () => {
    setResume(emptyResume());
    setJob(emptyJob());
    setActiveSampleResume(null);
    setActiveSampleJob(null);
    setPkg(null);
    setView("studio");
    setInputTab("job");
    setMobilePanel("input");
    notify("예시를 비웠습니다. 내 공고와 이력서를 넣어 주세요.", "warn");
  };

  const openImport = useCallback(
    async (file: File) => {
      try {
        const text = await readFileText(file);
        if (!text.trim()) {
          notify("파일이 비어 있습니다.", "warn");
          return;
        }
        const kind = guessKind(text);
        setImportState({ fileName: file.name, text, kind, preview: buildPreview(text, kind) });
      } catch {
        notify("파일을 읽지 못했습니다. .txt 또는 .md 파일인지 확인하세요.", "err");
      }
    },
    [notify],
  );

  const changeImportKind = (kind: ImportKind) =>
    setImportState((prev) => (prev ? { ...prev, kind, preview: buildPreview(prev.text, kind) } : prev));

  const applyImport = () => {
    if (!importState) return;
    const parsed = importState.preview;
    setImportState(null);
    setView("studio");
    setMobilePanel("input");
    if (parsed.kind === "job") {
      setJob(parsed.job);
      setActiveSampleJob(null);
      setInputTab("job");
      notify(`공고를 불러왔습니다 — ${parsed.summary}`, parsed.warnings.length ? "warn" : "ok");
    } else {
      setResume(parsed.resume);
      setActiveSampleResume(null);
      setInputTab("resume");
      notify(`이력서를 불러왔습니다 — ${parsed.summary}`, parsed.warnings.length ? "warn" : "ok");
    }
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

  const addFeedback = (feedback: InterviewFeedback) => {
    setPkg((prev) => (prev ? { ...prev, feedback: [feedback, ...(prev.feedback ?? [])].slice(0, 5) } : prev));
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

  const saveAi = (config: AiConfig) => {
    setAiConfig(config);
    persistAiConfig(config);
    setAiOpen(false);
    notify(config.sendKey && config.apiKey.trim() ? "개인 키를 저장했습니다. 서버 키가 없을 때만 사용합니다." : "AI 설정을 저장했습니다.");
    void refreshAi();
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
        setAiOpen(false);
        setHelpOpen(false);
        setImportState(null);
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
      { id: "match" as TabId, label: "적합도·갭", short: "적합도", icon: GaugeIcon, count: gapCount },
      { id: "rewrite" as TabId, label: "경력 리라이트", short: "리라이트", icon: PenLine, count: adopted },
      { id: "interview" as TabId, label: "면접", short: "면접", icon: Mic, count: answered },
      { id: "pitch" as TabId, label: "1분 소개", short: "1분 소개", icon: Quote, count: 0 },
      { id: "export" as TabId, label: "내보내기", short: "내보내기", icon: Package, count: 0 },
    ];
  }, [pkg]);

  const railNode = (
    <Rail
      pkg={pkg}
      saved={saved}
      entries={tracker}
      onLoad={loadPackage}
      onOpenHistory={() => setView("history")}
      onOpenTracker={() => setView("tracker")}
    />
  );

  const mobileNav: { id: "input" | "studio" | "rail" | "tracker"; label: string; icon: typeof FileText }[] = [
    { id: "input", label: "공고·경력", icon: FileText },
    { id: "studio", label: "패키지", icon: Package },
    { id: "rail", label: "현황", icon: GaugeIcon },
    { id: "tracker", label: "지원", icon: ListChecks },
  ];

  return (
    <>
      <div className="min-h-screen bg-paper print:hidden">
        <Sidebar
          view={view}
          resumeInitial={resume.name.trim().slice(0, 1) || "J"}
          onChangeView={(next) => {
            setView(next);
            if (next === "studio") setMobilePanel("input");
          }}
          onOpenApi={() => setAiOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />

        <TopBar
          view={view}
          company={pkg?.company ?? job.company}
          role={pkg?.role ?? job.role}
          mode={aiStatus.kind}
          model={aiStatus.model}
          onOpenAi={() => setAiOpen(true)}
          onOpenHistory={() => setView(view === "history" ? "studio" : "history")}
          onOpenTracker={() => setView("tracker")}
          onOpenGuide={() => setHelpOpen(true)}
        />

        <main className="lg:pl-[68px]">
          <div className="mx-auto w-full max-w-[1640px] px-3 pb-24 pt-3 sm:px-5 sm:pt-4 xl:pb-6">
            {view === "history" ? (
              <HistoryView
                packages={saved}
                onLoad={loadPackage}
                onDelete={deletePackage}
                onClear={clearAll}
                onBack={() => setView("studio")}
              />
            ) : view === "tracker" ? (
              <TrackerView
                entries={tracker}
                packages={saved}
                onUpdate={(entry) => setTracker((prev) => prev.map((item) => (item.id === entry.id ? entry : item)))}
                onAdd={(company, role, deadline) => {
                  setTracker((prev) => [makeEntry({ company, role, deadline }), ...prev]);
                  notify(`${company} 지원 건을 추가했습니다.`);
                }}
                onDelete={(id) => setTracker((prev) => prev.filter((entry) => entry.id !== id))}
                onLoadPackage={loadPackage}
                onOpenStudio={() => setView("studio")}
              />
            ) : (
              <>
                <ModeBanner
                  status={aiStatus}
                  running={running || regenerating}
                  hasPackage={Boolean(pkg)}
                  onReanalyze={() => void reanalyzeWithAi()}
                  onOpenSettings={() => setAiOpen(true)}
                />

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
                        onBlank={blankInputs}
                        onFile={(file) => void openImport(file)}
                        activeSampleJob={activeSampleJob}
                        activeSampleResume={activeSampleResume}
                        running={running}
                        step={step}
                        onGenerate={() => void generate()}
                        aiStatus={aiStatus}
                        onOpenApi={() => setAiOpen(true)}
                      />
                    </div>
                  </div>

                  <div className={cx(panelVisible("studio"), "min-w-0 lg:block")}>
                    {!pkg ? (
                      <EmptyState
                        onSample={handleSampleJob}
                        onBlank={blankInputs}
                        onFile={(file) => void openImport(file)}
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
                                <span
                                  className={cx("hidden chip sm:inline-flex", pkg.engine === "ai" ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}
                                  data-testid="package-engine"
                                >
                                  {pkg.engine === "ai" ? `AI 분석${pkg.aiModel ? ` · ${pkg.aiModel}` : ""}` : "규칙 엔진"}
                                </span>
                                {pkg.aiWarnings && pkg.aiWarnings.length > 0 && (
                                  <span className="chip bg-warn-soft text-warn" title={pkg.aiWarnings.join("\n")}>
                                    근거 확인 제외 {pkg.aiWarnings.length}
                                  </span>
                                )}
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
                                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[10.5px] font-semibold transition-colors sm:px-2.5 sm:text-[11.5px]",
                                    active ? "bg-ink text-white" : "text-muted hover:bg-paper-deep hover:text-ink",
                                  )}
                                >
                                  <item.icon size={13} />
                                  <span className="sm:hidden">{item.short}</span>
                                  <span className="hidden sm:inline">{item.label}</span>
                                  {item.count > 0 && (
                                    <span className={cx("num hidden text-[9.5px] sm:inline", active ? "text-white/60" : "text-faint")}>{item.count}</span>
                                  )}
                                </button>
                              );
                            })}
                            <div className="ml-auto hidden shrink-0 items-center gap-1.5 pr-1 sm:flex">
                              <span
                                className="num rounded-md px-1.5 py-0.5 text-[12px] font-semibold"
                                style={{ color: scoreColor(pkg.match.score), background: `${scoreColor(pkg.match.score)}10` }}
                              >
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
                          {tab === "match" && <MatchTab match={pkg.match} job={pkg.jobSnapshot} aiFit={pkg.aiFit} />}
                          {tab === "rewrite" && projection && (
                            <RewriteTab
                              pkg={pkg}
                              projection={projection}
                              onToggle={toggleRewrite}
                              onToggleAll={toggleAll}
                              onToggleSummary={toggleSummary}
                            />
                          )}
                          {tab === "interview" && (
                            <InterviewTab
                              pkg={pkg}
                              aiStatus={aiStatus}
                              config={aiConfig}
                              onStar={updateStar}
                              onReset={resetStar}
                              onFeedback={addFeedback}
                              onNotify={notify}
                            />
                          )}
                          {tab === "pitch" && (
                            <PitchTab pkg={pkg} aiStatus={aiStatus} regenerating={regenerating} onRegenerate={() => void regenerateIntro()} />
                          )}
                          {tab === "export" && <ExportTab pkg={pkg} saved={saved} onLoad={loadPackage} onOpenHistory={() => setView("history")} />}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className={cx(panelVisible("rail"), "min-w-0 xl:block")}>
                    <div className="xl:sticky xl:top-[72px]">{railNode}</div>
                  </div>
                </div>
              </>
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
          <div className="grid grid-cols-4">
            {mobileNav.map((item) => {
              const active = item.id === "tracker" ? view === "tracker" : mobilePanel === item.id && view === "studio";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === "tracker") {
                      setView("tracker");
                      return;
                    }
                    setView("studio");
                    setMobilePanel(item.id as MobilePanel);
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

        <AiSettingsModal
          open={aiOpen}
          status={aiStatus}
          config={aiConfig}
          probing={probing}
          onClose={() => setAiOpen(false)}
          onSave={saveAi}
          onReprobe={() => void refreshAi()}
        />

        <ImportDialog
          open={Boolean(importState)}
          fileName={importState?.fileName ?? ""}
          text={importState?.text ?? ""}
          preview={importState?.preview ?? null}
          kind={importState?.kind ?? "job"}
          onKind={changeImportKind}
          onApply={applyImport}
          onClose={() => setImportState(null)}
        />

        {helpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={() => setHelpOpen(false)} aria-hidden />
            <div className="animate-rise relative z-10 w-full max-w-[500px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
              <div className="flex items-start justify-between px-5 pt-5">
                <div>
                  <div className="eyebrow">Guide</div>
                  <h2 className="mt-1 text-[15px] font-semibold">이렇게 사용합니다</h2>
                </div>
                <button type="button" onClick={() => setHelpOpen(false)} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
                  <X size={16} />
                </button>
              </div>
              <ol className="mt-4 max-h-[52vh] space-y-2.5 overflow-y-auto px-5">
                {[
                  "‘내 이력서·공고 새로 입력하기’로 예시를 비우고, 내 공고와 이력서를 붙여넣습니다. .txt/.md 파일은 불러와서 문단으로 자동 분리합니다.",
                  "‘지원 패키지 생성’을 누르면 적합도·갭, 리라이트, 1분 자기소개·역질문, 압박 질문이 한 번에 만들어집니다.",
                  "1분 소개 탭에서 250~320자 자기소개와 마지막 역질문 3개를 복사합니다. 수치는 원문에 있는 값만 씁니다.",
                  "면접 탭 → ‘모의면접 90초’에서 답변을 적고 제출하면 강점·보완점·꼬리질문이 나옵니다. 꼬리질문으로 이어서 연습하세요.",
                  "지원 현황 탭에서 회사별 단계(준비중→서류→1차→2차→최종→오퍼)와 연봉·처우 협상 체크리스트를 관리합니다. 패키지를 만들면 자동 추가됩니다.",
                  "AI가 연결되지 않아도 모든 기능이 규칙 엔진으로 동작합니다. 상단 배너에서 현재 모드를 확인하고 ‘AI로 다시 분석’을 누르세요.",
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
                예시 인물·기업은 모두 가상입니다. 실제 회사 기밀, 타인의 개인정보, 채용 사이트의 비공개 자료는 넣지 마세요. 적합도 점수는 키워드
                일치 기반의 참고값이며 서류 통과를 보장하지 않습니다.
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
