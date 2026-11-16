import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload, X } from "lucide-react";
import type {
  AiConfig,
  AiStatus,
  ApplicationEntry,
  InterviewFeedback,
  JobPackage,
  JobPosting,
  JobSource,
  MasterResume,
  PriorityId,
  ResumeRecommendation,
  ViewId,
} from "./types";
import { SAMPLE_RESUMES } from "./lib/presets";
import { analyze } from "./lib/engine";
import { enrichWithAi } from "./lib/enrich";
import { AiError, probeAiServer, requestAiRecommendation } from "./lib/ai";
import { buildLocalIntro, buildLocalReverse } from "./lib/coach";
import { buildLocalAnswerSet, buildLocalNegotiation, buildLocalOnePoint, priorityOf } from "./lib/priority";
import { recommendLocal } from "./lib/recommend";
import { buildMarkdown, downloadText, slugForFile } from "./lib/report";
import { buildPreview, guessKind, parseJobText, readFileText } from "./lib/import";
import { extractPdfText } from "./lib/pdf";
import { fetchJobFromUrl, JobUrlError } from "./lib/jobUrl";
import { guardText } from "./lib/guard";
import {
  addPackage,
  clearPackages,
  loadAiConfig,
  loadPackages,
  loadPrefs,
  loadResume,
  loadResumeMeta,
  loadTracker,
  makeEntry,
  persistAiConfig,
  persistPrefs,
  persistResume,
  persistResumeMeta,
  persistTracker,
  removePackage,
  resumeBulletCount,
  resumeReady,
  updatePackage,
  type ResumeMeta,
} from "./lib/storage";
import { TopBar } from "./components/TopBar";
import { Setup, type JobFetchError } from "./components/Setup";
import { ResumeSheet } from "./components/ResumeSheet";
import { ResultFlow } from "./components/ResultFlow";
import { TrackerView } from "./components/TrackerView";
import { HistoryView } from "./components/HistoryView";
import { AiSettingsModal } from "./components/AiSettingsModal";
import { PrintSheet } from "./components/PrintSheet";
import { cx } from "./components/ui";

type ToastTone = "ok" | "warn" | "err";

const INITIAL_STATUS: AiStatus = {
  kind: "checking",
  reachable: false,
  message: "AI 서버 확인 중",
  checkedAt: new Date().toISOString(),
};

const DESCRIPTION_LIMIT = 6_000;

export default function App() {
  const [view, setView] = useState<ViewId>("studio");
  const [resume, setResume] = useState<MasterResume>(() => loadResume());
  const [resumeMeta, setResumeMeta] = useState<ResumeMeta | null>(() => loadResumeMeta());
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeBusy, setResumeBusy] = useState<string | null>(null);

  const [job, setJob] = useState<JobPosting | null>(null);
  const [jobSource, setJobSource] = useState<JobSource | null>(null);
  const [jobUrl, setJobUrl] = useState("");
  const [jobError, setJobError] = useState<JobFetchError | null>(null);
  const [fetching, setFetching] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [recommendation, setRecommendation] = useState<ResumeRecommendation | null>(null);
  const [recommending, setRecommending] = useState(false);

  const [pkg, setPkg] = useState<JobPackage | null>(null);
  const [saved, setSaved] = useState<JobPackage[]>(() => loadPackages());
  const [tracker, setTracker] = useState<ApplicationEntry[]>(() => loadTracker());
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [aiStatus, setAiStatus] = useState<AiStatus>(INITIAL_STATUS);
  const [aiOpen, setAiOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);

  const notify = useCallback((message: string, tone: ToastTone = "ok") => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => persistResume(resume), 300);
    return () => clearTimeout(timer);
  }, [resume]);

  useEffect(() => {
    persistPrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    persistTracker(tracker);
  }, [tracker]);

  useEffect(() => {
    if (!pkg) return;
    const timer = setTimeout(() => setSaved((prev) => updatePackage(prev, pkg)), 400);
    return () => clearTimeout(timer);
  }, [pkg]);

  const refreshAi = useCallback(async (): Promise<AiStatus> => {
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
    return status;
  }, []);

  useEffect(() => {
    void refreshAi();
  }, [refreshAi]);

  /* ── 이력서 기반 추천 (규칙) ── */
  useEffect(() => {
    if (!resumeReady(resume)) {
      setRecommendation(null);
      return;
    }
    setRecommendation((prev) => (prev?.source === "ai" ? prev : recommendLocal(resume)));
  }, [resume]);

  const applyResume = useCallback(
    (next: MasterResume, meta: ResumeMeta) => {
      setResume(next);
      setResumeMeta(meta);
      persistResume(next);
      persistResumeMeta(meta);
    },
    [],
  );

  const importResumeFile = useCallback(
    async (file: File) => {
      setResumeBusy(file.name.toLowerCase().endsWith(".pdf") ? "PDF에서 글자를 읽는 중" : "이력서 파일을 읽는 중");
      try {
        let text = "";
        if (file.name.toLowerCase().endsWith(".pdf")) {
          const result = await extractPdfText(await file.arrayBuffer());
          if (!result.ok) {
            notify(`${result.reason ?? "PDF를 읽지 못했습니다"} PDF 대신 .txt/.md로 저장해 올리거나 ‘직접 입력’을 사용하세요.`, "err");
            return;
          }
          text = result.text;
        } else {
          text = await readFileText(file);
        }
        if (text.trim().length < 40) {
          notify("파일이 비어 있습니다. 내용을 확인해 주세요.", "warn");
          return;
        }
        const kind = guessKind(text);
        const parsed = buildPreview(text, kind);
        if (kind === "job") {
          notify("이 파일은 공고처럼 보입니다. 공고는 URL이나 아래 ‘본문 붙여넣기’로 넣어 주세요.", "warn");
        }
        const bullets = resumeBulletCount(parsed.resume);
        if (bullets === 0) {
          applyResume(parsed.resume, { source: "file", fileName: file.name, savedAt: new Date().toISOString(), note: "문장을 찾지 못함" });
          setResumeOpen(true);
          notify("경력 문장을 나누지 못했습니다. 편집 창에서 회사·직함과 문장을 확인해 주세요.", "warn");
          return;
        }
        applyResume(parsed.resume, {
          source: "file",
          fileName: file.name,
          savedAt: new Date().toISOString(),
          note: `${parsed.summary}${parsed.warnings.length ? ` · ${parsed.warnings[0]}` : ""}`,
        });
        setResumeOpen(false);
        notify(`이력서를 저장했습니다 — 경력 ${parsed.resume.experiences.length}개 · 문장 ${bullets}개`, parsed.warnings.length ? "warn" : "ok");
      } catch {
        notify("파일을 읽지 못했습니다. .txt/.md/.pdf인지 확인해 주세요.", "err");
      } finally {
        setResumeBusy(null);
      }
    },
    [applyResume, notify],
  );

  const useSampleResume = useCallback(() => {
    const sample = SAMPLE_RESUMES[0];
    applyResume(sample, { source: "sample", savedAt: new Date().toISOString(), note: "가상 인물 샘플" });
    setResumeOpen(false);
    notify("가상 인물 ‘서하늘’ 샘플을 넣었습니다. 실제 지원 전에 내 이력서로 바꿔 주세요.", "warn");
  }, [applyResume, notify]);

  /* ── 공고 URL ── */
  const fetchJob = useCallback(async () => {
    if (!jobUrl.trim()) {
      notify("공고 URL을 붙여넣어 주세요.", "warn");
      return;
    }
    setFetching(true);
    setJobError(null);
    try {
      const result = await fetchJobFromUrl(jobUrl, aiConfig);
      setJob(result.job);
      setJobSource({
        kind: "url",
        url: result.meta.url,
        site: result.meta.site,
        fetchedAt: new Date().toISOString(),
        note: result.meta.note,
      });
      const duties = result.job.responsibilities.split("\n").filter(Boolean).length;
      const reqs = result.job.requirements.split("\n").filter(Boolean).length;
      notify(
        `${result.meta.site}에서 공고를 읽었습니다 — 담당 업무 ${duties}줄 · 자격 요건 ${reqs}줄${result.engine === "rule" ? " (규칙 정리)" : ""}`,
        duties + reqs === 0 ? "warn" : "ok",
      );
    } catch (error) {
      const failure = error instanceof JobUrlError ? error : new JobUrlError("unknown", "공고를 불러오지 못했습니다.");
      setJobError({ code: failure.code, message: failure.message, site: failure.site });
      setPasteOpen(true);
      if (failure.excerpt && !pasteText.trim()) setPasteText(failure.excerpt.slice(0, DESCRIPTION_LIMIT));
      notify(failure.message, "err");
    } finally {
      setFetching(false);
    }
  }, [aiConfig, jobUrl, notify, pasteText]);

  const analyzePaste = useCallback(() => {
    if (pasteText.trim().length < 40) {
      notify("공고 본문을 조금 더 붙여넣어 주세요.", "warn");
      return;
    }
    const parsed = parseJobText(pasteText);
    const filled = Boolean(parsed.job.responsibilities || parsed.job.requirements || parsed.job.preferred);
    setJob(parsed.job);
    setJobSource({ kind: "paste", site: "붙여넣은 본문", fetchedAt: new Date().toISOString() });
    setJobError(null);
    setPasteOpen(false);
    notify(
      filled
        ? `본문을 문단으로 나눴습니다 — 담당 업무 ${parsed.job.responsibilities.split("\n").filter(Boolean).length}줄`
        : "문단 제목을 찾지 못해 전체 본문을 담당 업무로 넣었습니다. 편하게 분석해 보세요.",
      filled ? "ok" : "warn",
    );
  }, [notify, pasteText]);

  const clearJob = useCallback(() => {
    setJob(null);
    setJobSource(null);
    setJobUrl("");
    setJobError(null);
    setPasteText("");
    setPasteOpen(false);
    setPkg(null);
  }, []);

  /* ── 패키지 생성 ── */
  const buildPackage = useCallback(
    async (options?: { forceAi?: boolean }) => {
      if (!job) {
        notify("공고를 먼저 불러와 주세요.", "warn");
        return;
      }
      if (!resumeReady(resume)) {
        notify("내 이력서를 먼저 등록해 주세요.", "warn");
        setResumeOpen(true);
        return;
      }
      if (!job.responsibilities.trim() && !job.requirements.trim()) {
        notify("공고의 담당 업무나 자격 요건이 비어 있습니다. URL을 다시 불러오거나 본문을 붙여넣어 주세요.", "warn");
        setPasteOpen(true);
        return;
      }

      setGenerating(true);
      try {
        const result = analyze(resume, job);
        const base: JobPackage = {
          id: `pkg-${Date.now().toString(36)}`,
          createdAt: new Date().toISOString(),
          company: job.company.trim() || "회사 미확인",
          role: job.role.trim() || "직무 미확인",
          employmentType: job.employmentType,
          location: job.location,
          resumeName: resume.name,
          resumeHeadline: resume.headline,
          years: resume.years,
          engine: "rule",
          match: result.match,
          summary: result.summary,
          rewrites: result.rewrites,
          appeals: result.appeals,
          questions: buildLocalAnswerSet(result.questions, resume, job),
          jobKeywords: result.jobKeywords,
          resumeSnapshot: resume,
          jobSnapshot: job,
          intro: buildLocalIntro(resume, job, result.match, 0, prefs.priority ?? undefined),
          reverse: buildLocalReverse(resume, job, result.match, prefs.priority ?? undefined),
          feedback: [],
          source: jobSource ?? undefined,
          priority: prefs.priority ?? undefined,
          targetSalary: prefs.targetSalary,
          onePoint: buildLocalOnePoint(resume, job, result.match, prefs.priority ?? undefined),
          negotiation: buildLocalNegotiation({ job, match: result.match, priority: prefs.priority ?? undefined, targetSalary: prefs.targetSalary }),
        };

        let next = base;
        if (aiStatus.kind === "live" || options?.forceAi) {
          try {
            const enriched = await enrichWithAi(base, aiConfig);
            next = enriched.pkg;
            next.questions = buildLocalAnswerSet(next.questions, resume, job);
            notify(
              enriched.warnings.length
                ? `AI 분석 완료 — 근거가 확인되지 않은 항목 ${enriched.warnings.length}건을 제외했습니다.`
                : "AI 분석을 반영했습니다.",
              enriched.warnings.length ? "warn" : "ok",
            );
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
        setTracker((prev) => {
          const found = prev.find((entry) => entry.company === next.company && entry.role === next.role);
          if (found) {
            return prev.map((entry) =>
              entry.id === found.id
                ? { ...entry, packageId: next.id, score: next.match.score, deadline: entry.deadline || next.jobSnapshot.deadline, updatedAt: new Date().toISOString() }
                : entry,
            );
          }
          return [makeEntry({ company: next.company, role: next.role, packageId: next.id, score: next.match.score, deadline: next.jobSnapshot.deadline }), ...prev];
        });
        setView("studio");
      } finally {
        setGenerating(false);
      }
    },
    [aiConfig, aiStatus.kind, job, jobSource, notify, prefs.priority, prefs.targetSalary, resume],
  );

  const regenerate = useCallback(async () => {
    if (!pkg) return;
    setRegenerating(true);
    try {
      const status = await refreshAi();
      if (status.kind !== "live") {
        notify("AI 서버에 연결되지 않았습니다. 규칙 엔진 결과는 그대로 유지됩니다.", "warn");
        setAiOpen(true);
        return;
      }
      const enriched = await enrichWithAi(pkg, aiConfig);
      const next = { ...enriched.pkg, questions: buildLocalAnswerSet(enriched.pkg.questions, pkg.resumeSnapshot, pkg.jobSnapshot) };
      setPkg(next);
      setSaved((prev) => updatePackage(prev, next));
      notify(enriched.warnings.length ? `AI 분석 완료 — 근거 미확인 ${enriched.warnings.length}건 제외` : "AI로 다시 분석했습니다.", enriched.warnings.length ? "warn" : "ok");
    } catch (error) {
      notify(`${error instanceof Error ? error.message : "AI 호출 실패"} — 기존 결과를 유지합니다.`, "warn");
    } finally {
      setRegenerating(false);
    }
  }, [aiConfig, notify, pkg, refreshAi]);

  const recommend = useCallback(
    async (useAi: boolean) => {
      if (!resumeReady(resume)) return;
      if (!useAi || aiStatus.kind !== "live") {
        setRecommendation(recommendLocal(resume));
        notify("이력서에서 포지션·연봉 범위·타깃 기업군을 다시 계산했습니다.");
        return;
      }
      setRecommending(true);
      try {
        const { data, model } = await requestAiRecommendation({
          resume,
          config: aiConfig,
          priorityLabel: priorityOf(prefs.priority)?.label ?? "",
        });
        const sources = [
          resume.headline,
          resume.summary,
          resume.skills.join(" "),
          resume.industries.join(" "),
          ...resume.experiences.flatMap((exp) => [exp.company, exp.role, ...exp.bullets.map((bullet) => bullet.text)]),
        ].filter(Boolean);
        const titles = (data.titles ?? [])
          .map((item) => ({ title: (item.title ?? "").trim(), why: (item.why ?? "").trim() }))
          .filter((item) => item.title.length > 2 && item.why.length > 4 && guardText(item.why, sources).ok)
          .slice(0, 3);
        const targets = (data.targets ?? [])
          .map((item) => ({ group: (item.group ?? "").trim(), why: (item.why ?? "").trim() }))
          .filter((item) => item.group.length > 2 && item.why.length > 4 && guardText(item.why, sources).ok)
          .slice(0, 3);
        const min = typeof data.salaryBand?.min === "number" ? Math.max(2_000, Math.min(20_000, Math.round(data.salaryBand.min))) : 0;
        const max = typeof data.salaryBand?.max === "number" ? Math.max(min + 200, Math.min(20_000, Math.round(data.salaryBand.max))) : 0;
        const fallback = recommendLocal(resume);
        const next: ResumeRecommendation = {
          titles: titles.length >= 2 ? titles : fallback.titles,
          salaryBand:
            min > 0 && max > min
              ? { min, max, basis: (data.salaryBand?.basis ?? "").trim() || fallback.salaryBand?.basis || "추정" }
              : fallback.salaryBand,
          targets: targets.length >= 2 ? targets : fallback.targets,
          source: "ai",
          model,
        };
        setRecommendation(next);
        notify("AI가 이력서를 읽고 추천 방향을 다시 잡았습니다.");
      } catch (error) {
        notify(`${error instanceof Error ? error.message : "AI 추천 실패"} — 규칙 추천을 유지합니다.`, "warn");
      } finally {
        setRecommending(false);
      }
    },
    [aiConfig, aiStatus.kind, notify, prefs.priority, resume],
  );

  const addFeedback = useCallback((feedback: InterviewFeedback) => {
    setPkg((prev) => (prev ? { ...prev, feedback: [feedback, ...(prev.feedback ?? [])].slice(0, 8) } : prev));
  }, []);

  const loadPackage = (next: JobPackage) => {
    setPkg(next);
    setJob(next.jobSnapshot);
    setJobSource(next.source ?? { kind: "paste", site: "저장된 공고" });
    setPrefs((prev) => ({ ...prev, priority: next.priority ?? prev.priority, targetSalary: next.targetSalary ?? prev.targetSalary }));
    setView("studio");
    notify(`${next.company} 패키지를 열었습니다.`);
  };

  const deletePackage = (id: string) => {
    setSaved((prev) => removePackage(prev, id));
    if (pkg?.id === id) setPkg(null);
    notify("패키지를 삭제했습니다.", "warn");
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

  const startNewJob = () => {
    clearJob();
    setView("studio");
    notify("새 공고를 넣을 수 있습니다. 등록한 이력서는 그대로 남아 있습니다.");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAiOpen(false);
        setHelpOpen(false);
        setResumeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setupProps = useMemo(
    () => ({
      resume,
      resumeMeta,
      onResumeFile: (file: File) => void importResumeFile(file),
      onOpenResume: () => setResumeOpen(true),
      onSampleResume: useSampleResume,
      resumeBusy,
      job,
      jobSource,
      jobUrl,
      onJobUrl: setJobUrl,
      onFetchJob: () => void fetchJob(),
      fetching,
      jobError,
      pasteOpen,
      onPasteOpen: setPasteOpen,
      pasteText,
      onPasteText: setPasteText,
      onAnalyzePaste: analyzePaste,
      onClearJob: clearJob,
      priority: prefs.priority,
      onPriority: (id: PriorityId) => setPrefs((prev) => ({ ...prev, priority: id })),
      targetSalary: prefs.targetSalary,
      onTargetSalary: (value: number | null) => setPrefs((prev) => ({ ...prev, targetSalary: value })),
      recommendation,
      onRecommend: (useAi: boolean) => void recommend(useAi),
      recommending,
      onGenerate: () => void buildPackage(),
      generating,
      aiStatus,
    }),
    [
      aiStatus,
      analyzePaste,
      buildPackage,
      clearJob,
      fetchJob,
      fetching,
      generating,
      importResumeFile,
      job,
      jobError,
      jobSource,
      jobUrl,
      pasteOpen,
      pasteText,
      prefs.priority,
      prefs.targetSalary,
      recommend,
      recommendation,
      recommending,
      resume,
      resumeBusy,
      resumeMeta,
      useSampleResume,
    ],
  );

  return (
    <>
      <div className="min-h-screen bg-paper print:hidden">
        <TopBar
          view={view}
          onChangeView={setView}
          aiStatus={aiStatus}
          onOpenAi={() => setAiOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          hasPackage={Boolean(pkg)}
        />

        <main>
          <div className="mx-auto w-full max-w-[1180px] px-3 pb-16 pt-3 sm:px-5 sm:pt-4">
            {view === "history" ? (
              <HistoryView packages={saved} onLoad={loadPackage} onDelete={deletePackage} onClear={() => setSaved(clearPackages())} onBack={() => setView("studio")} />
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
            ) : pkg ? (
              <ResultFlow
                pkg={pkg}
                aiStatus={aiStatus}
                config={aiConfig}
                priority={pkg.priority ?? prefs.priority}
                regenerating={regenerating}
                onFeedback={addFeedback}
                onNotify={notify}
                onRegenerate={() => void regenerate()}
                onExport={exportMarkdown}
                onPrint={() => window.print()}
                onNewJob={startNewJob}
                onOpenTracker={() => setView("tracker")}
              />
            ) : (
              <Setup {...setupProps} />
            )}
          </div>
        </main>

        <ResumeSheet
          open={resumeOpen}
          resume={resume}
          busy={resumeBusy}
          onClose={() => setResumeOpen(false)}
          onSave={(next) => {
            applyResume(next, { source: "manual", savedAt: new Date().toISOString() });
            setResumeOpen(false);
            notify(`이력서를 저장했습니다 — 경력 ${next.experiences.length}개 · 문장 ${resumeBulletCount(next)}개`);
          }}
          onFile={(file) => void importResumeFile(file)}
          onSample={useSampleResume}
          onNotify={notify}
        />

        <AiSettingsModal
          open={aiOpen}
          status={aiStatus}
          config={aiConfig}
          probing={aiStatus.kind === "checking"}
          onClose={() => setAiOpen(false)}
          onSave={saveAi}
          onReprobe={() => void refreshAi()}
        />

        {helpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={() => setHelpOpen(false)} aria-hidden />
            <div className="animate-rise relative z-10 w-full max-w-[520px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
              <div className="flex items-start justify-between px-5 pt-5">
                <div>
                  <div className="eyebrow">Guide</div>
                  <h2 className="mt-1 text-[15px] font-semibold">이렇게 사용합니다</h2>
                </div>
                <button type="button" onClick={() => setHelpOpen(false)} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
                  <X size={16} />
                </button>
              </div>
              <ol className="mt-4 max-h-[54vh] space-y-2.5 overflow-y-auto px-5">
                {[
                  "‘파일로 등록’으로 이력서(.txt/.md/.pdf)를 한 번 올립니다. 경력·문장이 원본으로 저장되고 다음부터는 자동으로 쓰입니다.",
                  "공고는 URL을 붙여넣고 ‘공고 불러오기’를 누르면 서버가 회사·담당 업무·자격 요건·우대 사항을 직접 읽어 옵니다.",
                  "로그인이 필요하거나 자동 수집을 막는 사이트는 안내와 함께 본문 붙여넣기 칸이 열립니다. 공고 본문을 붙여넣으면 같은 분석을 받습니다.",
                  "이직 우선순위를 고르고 희망 연봉을 적으면 협상 문장과 처우 확인 질문이 그 기준으로 바뀝니다.",
                  "결과는 위에서 아래로 읽으면 됩니다 — ① 적합도·갭 ② 1분 소개·경력 하이라이트 ③ 예상 질문 5개·모범 답변·90초 연습 ④ 역질문·연봉 협상.",
                  "각 블록의 복사 버튼으로 자소서·이력서·메모에 바로 붙여넣고, 지원 현황에서 단계와 연봉을 이어서 관리하세요.",
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
                예시 인물·기업은 모두 가상입니다. 실제 회사 기밀, 타인의 개인정보, 채용 사이트의 비공개 자료는 넣지 마세요. 적합도 점수는 참고값이며
                서류 통과를 보장하지 않고, 연봉 참고 범위는 추정입니다.
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
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
            <div
              className={cx(
                "animate-rise pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[11.5px] font-medium shadow-[0_16px_40px_-20px_rgba(17,20,24,0.5)]",
                toast.tone === "ok" && "border-ink/10 bg-ink text-white",
                toast.tone === "warn" && "border-warn/25 bg-warn-soft text-warn",
                toast.tone === "err" && "border-risk/25 bg-risk-soft text-risk",
              )}
              data-testid="toast"
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
