import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import type { AiConfig, AiStatus, HubJob, InterviewFeedback, JobPackage, MasterResume, PriorityId, ViewId } from "./types";
import { SAMPLE_RESUMES } from "./lib/presets";
import { analyze } from "./lib/engine";
import { enrichWithAi } from "./lib/enrich";
import { AiError, probeAiServer, requestAiApplyKit } from "./lib/ai";
import { buildLocalIntro, buildLocalReverse } from "./lib/coach";
import { buildLocalAnswerSet, buildLocalNegotiation, buildLocalOnePoint } from "./lib/priority";
import { buildMarkdown, downloadText, slugForFile } from "./lib/report";
import { guessKind, buildPreview, readFileText } from "./lib/import";
import { extractPdfText } from "./lib/pdf";
import { applySources, buildLocalApplyKit, mergeAiApplyKit } from "./lib/apply";
import { fetchMany, hubJobFromOutcome, hubJobFromPaste, splitJobUrls, urlKey, type AddProgress } from "./lib/hub";
import { fetchJobFromUrl } from "./lib/jobUrl";
import { CollectError, isTrackedJob, mergeCollected, requestJobs, type CollectionState } from "./lib/collect";
import { CUSTOM_PRESET, DEFAULT_PRESET, presetById } from "./lib/jobPresets";
import {
  addPackage,
  clearPackages,
  loadAiConfig,
  loadHubJobs,
  loadPackages,
  loadPrefs,
  loadResume,
  loadResumeMeta,
  persistAiConfig,
  persistHubJobs,
  persistPrefs,
  persistResume,
  persistResumeMeta,
  removePackage,
  resumeBulletCount,
  resumeReady,
  updatePackage,
  type ResumeMeta,
} from "./lib/storage";
import { TopBar } from "./components/TopBar";
import { Hub } from "./components/Hub";
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

export default function App() {
  const [view, setView] = useState<ViewId>("studio");
  const [deepOpen, setDeepOpen] = useState(false);

  const [resume, setResume] = useState<MasterResume>(() => loadResume());
  const [resumeMeta, setResumeMeta] = useState<ResumeMeta | null>(() => loadResumeMeta());
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeBusy, setResumeBusy] = useState<string | null>(null);

  const [hubJobs, setHubJobs] = useState<HubJob[]>(() => loadHubJobs());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionState>({
    preset: DEFAULT_PRESET,
    keyword: "",
    applied: "",
    profile: "",
    filter: null,
    region: "전체",
    sort: "latest",
    status: "idle",
    sources: [],
    at: null,
    error: "",
    cached: false,
  });
  const [urlsText, setUrlsText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState<AddProgress[]>([]);
  const [aiDraftBusyId, setAiDraftBusyId] = useState<string | null>(null);
  const [enrichBusyId, setEnrichBusyId] = useState<string | null>(null);
  const [savedSignal, setSavedSignal] = useState(0);

  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [pkg, setPkg] = useState<JobPackage | null>(null);
  const [saved, setSaved] = useState<JobPackage[]>(() => loadPackages());
  const [deepBusyId, setDeepBusyId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [aiStatus, setAiStatus] = useState<AiStatus>(INITIAL_STATUS);
  const [aiOpen, setAiOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);

  const jobsRef = useRef(hubJobs);
  jobsRef.current = hubJobs;
  const collectionRef = useRef(collection);
  collectionRef.current = collection;
  const collectedOnce = useRef(false);

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
    persistHubJobs(hubJobs);
  }, [hubJobs]);

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

  const updateJob = useCallback((next: HubJob) => {
    setHubJobs((prev) =>
      prev.map((job) => (job.id === next.id ? { ...next, updatedAt: next.updatedAt || new Date().toISOString() } : job)),
    );
  }, []);

  const patchJob = useCallback((id: string, patch: (job: HubJob) => HubJob) => {
    setHubJobs((prev) => prev.map((job) => (job.id === id ? { ...patch(job), updatedAt: new Date().toISOString() } : job)));
  }, []);

  /* ── 공고 자동 수집 ── */

  const runCollect = useCallback(
    async (override?: { preset?: string; keyword?: string }) => {
      const current = collectionRef.current;
      const presetId = override?.preset ?? current.preset;
      const keyword = override?.keyword ?? current.keyword;
      const preset = presetById(presetId);
      const query = preset ? preset.query : keyword.trim();
      const profile = preset?.profile ?? "";
      if (!preset && !query) {
        notify("직무를 고르거나 키워드를 입력해 주세요.", "warn");
        return;
      }
      setCollection((prev) => ({
        ...prev,
        preset: presetId,
        keyword: preset ? prev.keyword : keyword,
        applied: query,
        profile,
        status: "loading",
        error: "",
      }));
      try {
        const data = await requestJobs({ query, limit: profile ? 60 : 36, detail: profile ? 8 : 12, profile: profile || undefined });
        setHubJobs((prev) => mergeCollected(prev, data.jobs, data.fetchedAt));
        setCollection((prev) => ({
          ...prev,
          status: data.jobs.length ? "ready" : "empty",
          sources: data.sources,
          at: data.fetchedAt,
          cached: Boolean(data.cached),
          filter: data.filter ?? null,
          error: "",
        }));
        if (!data.jobs.length) {
          notify("이 조건에 맞는 공고를 찾지 못했습니다. 다른 직무·키워드로 시도해 보세요.", "warn");
        } else if (data.filter) {
          const excluded = data.filter.excluded;
          const cut = excluded.region + excluded.role + excluded.junior + excluded.agency;
          notify(
            `${data.filter.label} 기준으로 ${data.jobs.length}건을 남겼습니다. 수집 ${data.filter.raw}건 중 ${cut}건은 조건 밖이라 뺐습니다.`,
          );
        } else {
          const label = preset && preset.id !== "all" ? preset.label : query ? `‘${query}’` : "최신";
          notify(`${label} 공고 ${data.jobs.length}건을 실제 채용 사이트에서 모았습니다.`);
        }
      } catch (error) {
        const message = error instanceof CollectError || error instanceof Error ? error.message : "공고를 모으지 못했습니다.";
        setCollection((prev) => ({ ...prev, status: "error", error: message, sources: [] }));
        notify(message, "warn");
      }
    },
    [notify],
  );

  /** 첫 화면부터 실제 공고가 보이도록 한 번 자동으로 모읍니다. */
  useEffect(() => {
    if (collectedOnce.current) return;
    collectedOnce.current = true;
    void runCollect({ preset: collectionRef.current.preset || DEFAULT_PRESET });
  }, [runCollect]);

  const pickPreset = useCallback(
    (id: string) => {
      setCollection((prev) => ({ ...prev, preset: id }));
      void runCollect({ preset: id });
    },
    [runCollect],
  );

  const collectKeyword = useCallback(() => {
    const keyword = collectionRef.current.keyword.trim();
    if (!keyword) {
      notify("찾고 싶은 직무나 키워드를 입력해 주세요.", "warn");
      return;
    }
    setCollection((prev) => ({ ...prev, preset: CUSTOM_PRESET }));
    void runCollect({ preset: CUSTOM_PRESET, keyword });
  }, [notify, runCollect]);

  const toggleSaveJob = useCallback(
    (id: string) => {
      const target = jobsRef.current.find((job) => job.id === id);
      if (!target) return;
      if (target.saved) {
        const stillTracked = target.status !== "지원 전" || Boolean(target.memo.trim()) || target.documentsChecked.length > 0;
        patchJob(id, (job) => ({ ...job, saved: false }));
        notify(
          stillTracked ? "북마크는 뺐습니다. 지원 상태·메모가 있어 보드에 남습니다." : "내 지원에서 뺐습니다.",
          "warn",
        );
      } else {
        patchJob(id, (job) => ({ ...job, saved: true }));
        notify(`${target.job.company || "공고"}를 내 지원에 담았습니다.`);
      }
    },
    [notify, patchJob],
  );

  /** 목록 정보만 있는 공고의 요건을 원문에서 읽어 채웁니다. */
  const enrichJob = useCallback(
    async (id: string) => {
      const target = jobsRef.current.find((job) => job.id === id);
      const url = target?.applyUrl || target?.source.url;
      if (!target || !url) {
        notify("공고 원문 주소가 없습니다. URL을 직접 추가해 주세요.", "warn");
        return;
      }
      setEnrichBusyId(id);
      try {
        const result = await fetchJobFromUrl(url, aiConfig);
        // 채용 사이트 이름이 회사명으로 읽히면 원문을 잘못 읽은 것이므로 버립니다.
        const PORTAL = /^(?:사람인|잡코리아|원티드|링크드인|점핏|로켓펀치|인크루트)$/;
        const company = PORTAL.test(result.job.company.trim()) ? "" : result.job.company;
        const hasBody = Boolean(result.job.responsibilities || result.job.requirements);
        patchJob(id, (job) => ({
          ...job,
          job: {
            ...job.job,
            company: company || job.job.company,
            role: result.job.role || job.job.role,
            employmentType: result.job.employmentType || job.job.employmentType,
            location: result.job.location || job.job.location,
            deadline: result.job.deadline || job.job.deadline,
            responsibilities: result.job.responsibilities || job.job.responsibilities,
            requirements: result.job.requirements || job.job.requirements,
            preferred: result.job.preferred || job.job.preferred,
            documents: result.job.documents || job.job.documents,
            tone: result.job.tone || job.job.tone,
            detailLevel: hasBody ? "full" : job.job.detailLevel,
          },
          applyUrl: result.job.applyUrl || job.applyUrl,
          saved: true,
          draft: undefined,
        }));
        notify(
          hasBody
            ? `${company || "공고"}의 요건을 원문에서 읽었습니다. 지원 문구를 다시 만듭니다.`
            : "원문에서 요건 글자를 찾지 못했습니다. 공고 본문을 붙여넣어 주세요.",
          hasBody ? "ok" : "warn",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "요건을 읽지 못했습니다.";
        notify(`${message} 원문에서 직접 확인해 주세요.`, "warn");
      } finally {
        setEnrichBusyId(null);
      }
    },
    [aiConfig, notify, patchJob],
  );

  /* ── 이력서 ── */

  const applyResume = useCallback((next: MasterResume, meta: ResumeMeta) => {
    setResume(next);
    setResumeMeta(meta);
    persistResume(next);
    persistResumeMeta(meta);
    // 이력서가 바뀌면 예전 이력서로 만든 지원 문구는 지우고 다시 만듭니다.
    setHubJobs((prev) => prev.map((job) => (job.draft ? { ...job, draft: undefined } : job)));
  }, []);

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
          notify("이 파일은 공고처럼 보입니다. 공고는 위 ‘공고 모으기’ 칸에 URL이나 본문으로 넣어 주세요.", "warn");
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

  /* ── 지원 문구 (AI 다듬기) ── */

  const refineDraft = useCallback(
    async (job: HubJob, manual = false) => {
      const local = job.draft ?? buildLocalApplyKit(resume, job.job);
      const sources = applySources(resume, job.job);
      const bullets = resume.experiences.flatMap((exp) => exp.bullets.map((bullet) => bullet.text));
      setAiDraftBusyId(job.id);
      try {
        const { data, model } = await requestAiApplyKit({ job: job.job, resume, config: aiConfig });
        // 기다리는 사이 이력서가 바뀌어 초안이 지워졌다면 낡은 결과를 붙이지 않습니다.
        if (!jobsRef.current.find((item) => item.id === job.id)?.draft) return;
        const merged = mergeAiApplyKit(local, data, sources, bullets, model);
        patchJob(job.id, (current) => ({ ...current, draft: merged.draft }));
        if (manual) {
          notify(
            merged.warnings > 0
              ? `지원 문구를 AI로 다듬었습니다 — 근거가 확인되지 않은 항목 ${merged.warnings}건은 규칙 문장으로 두었습니다.`
              : "지원 문구를 AI로 다듬었습니다.",
            merged.warnings > 0 ? "warn" : "ok",
          );
        }
      } catch (error) {
        if (error instanceof AiError && error.code === "no_key") {
          setAiStatus((prev) => ({ ...prev, kind: "local", reason: "no_key", message: "서버에 API 키가 없습니다" }));
        }
        if (manual) {
          const message = error instanceof Error ? error.message : "AI 호출에 실패했습니다";
          notify(`${message} — 규칙 문장을 유지합니다.`, "warn");
        }
      } finally {
        setAiDraftBusyId(null);
      }
    },
    [aiConfig, notify, patchJob, resume],
  );

  const selected = useMemo(() => hubJobs.find((job) => job.id === selectedId) ?? hubJobs[0] ?? null, [hubJobs, selectedId]);

  /** 수집 결과가 바뀌어 고른 공고가 사라지면, 새로 모인 첫 공고를 고릅니다. */
  useEffect(() => {
    if (!hubJobs.length) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (selectedId && hubJobs.some((job) => job.id === selectedId)) return;
    const first = hubJobs.find((job) => job.source.kind === "auto" && !isTrackedJob(job)) ?? hubJobs[0];
    setSelectedId(first.id);
  }, [hubJobs, selectedId]);

  /** 카드를 고르면 규칙 문구를 즉시 만들고, AI가 연결돼 있으면 한 번 더 다듬습니다. */
  useEffect(() => {
    if (!selected) return;
    if (!resumeReady(resume)) return;
    if (selected.draft) return;
    const local = buildLocalApplyKit(resume, selected.job);
    patchJob(selected.id, (job) => ({ ...job, draft: local }));
    if (aiStatus.kind === "live") void refineDraft({ ...selected, draft: local });
  }, [aiStatus.kind, patchJob, refineDraft, resume, selected]);

  /* ── 공고 모으기 ── */

  const addUrls = useCallback(async () => {
    const all = splitJobUrls(urlsText);
    if (!all.length) {
      notify("공고 주소를 붙여넣어 주세요.", "warn");
      return;
    }
    const existing = new Set(jobsRef.current.flatMap((job) => [urlKey(job.applyUrl), urlKey(job.source.url)].filter(Boolean)));
    const urls = all.filter((url) => !existing.has(urlKey(url)));
    if (!urls.length) {
      notify("이미 모은 공고입니다. 다른 주소를 넣어 주세요.", "warn");
      return;
    }
    setAdding(true);
    setProgress(urls.map((url) => ({ url, state: "waiting" })));
    try {
      const outcomes = await fetchMany(urls, aiConfig, (index, state, message) => {
        setProgress((prev) => prev.map((item, i) => (i === index ? { ...item, state, message } : item)));
      });
      const added: HubJob[] = [];
      const failed: string[] = [];
      const known = new Map(jobsRef.current.flatMap((job) => [urlKey(job.applyUrl), urlKey(job.source.url)].filter(Boolean).map((key) => [key, true] as const)));
      for (const outcome of outcomes) {
        if (outcome.ok && outcome.result) {
          const next = hubJobFromOutcome(outcome.url, outcome.result);
          if (known.has(urlKey(next.applyUrl)) || added.some((job) => urlKey(job.applyUrl) === urlKey(next.applyUrl))) {
            continue;
          }
          added.push(next);
        } else {
          failed.push(outcome.error?.message ?? "공고를 불러오지 못했습니다.");
        }
      }
      if (failed.length) {
        // 막힌 주소는 붙여넣기 칸에 미리 넣어 두어 바로 본문을 붙일 수 있게 합니다.
        const failedUrl = urls.filter((_, index) => !outcomes[index]?.ok)[0];
        if (failedUrl && !pasteUrl) setPasteUrl(failedUrl);
        setPasteOpen(true);
      }
      if (added.length) {
        setHubJobs((prev) => [...added, ...prev]);
        setSelectedId(added[0].id);
        setSavedSignal((value) => value + 1);
        setUrlsText(failed.length ? urls.filter((_, index) => !outcomes[index]?.ok).join("\n") : "");
        notify(
          failed.length
            ? `공고 ${added.length}개를 모았습니다. ${failed.length}개는 불러오지 못해 주소를 남겨 두었습니다 — 본문 붙여넣기로 추가할 수 있습니다.`
            : `공고 ${added.length}개를 모았습니다. 카드를 골라 지원 내용을 확인하세요.`,
          failed.length ? "warn" : "ok",
        );
      } else {
        notify(failed[0] ?? "새로 추가한 공고가 없습니다.", "err");
        setPasteOpen(true);
      }
    } finally {
      setAdding(false);
      window.setTimeout(() => setProgress([]), 12000);
    }
  }, [aiConfig, notify, pasteUrl, urlsText]);

  const addPaste = useCallback(() => {
    if (pasteText.trim().length < 40) {
      notify("공고 본문을 조금 더 붙여넣어 주세요.", "warn");
      return;
    }
    const next = hubJobFromPaste(pasteText, pasteUrl);
    setHubJobs((prev) => [next, ...prev]);
    setSelectedId(next.id);
    setSavedSignal((value) => value + 1);
    setPasteText("");
    setPasteUrl("");
    setPasteOpen(false);
    notify(`${next.job.company || "공고"}를 본문으로 추가했습니다 — 담당 업무 ${next.job.responsibilities.split("\n").filter(Boolean).length}줄`);
  }, [notify, pasteText, pasteUrl]);

  const removeJob = useCallback(
    (id: string) => {
      const target = jobsRef.current.find((job) => job.id === id);
      setHubJobs((prev) => prev.filter((job) => job.id !== id));
      if (selectedId === id) setSelectedId(null);
      notify(`${target?.job.company ?? "공고"}를 허브에서 뺐습니다.`, "warn");
    },
    [notify, selectedId],
  );

  /* ── 심층 준비 (면접·협상) ── */

  const openDeep = useCallback(
    async (hubJob: HubJob) => {
      if (!resumeReady(resume)) {
        notify("내 이력서를 먼저 등록해 주세요.", "warn");
        setResumeOpen(true);
        return;
      }
      const job = hubJob.job;
      if (!job.responsibilities.trim() && !job.requirements.trim()) {
        notify("공고의 담당 업무나 자격 요건이 비어 있습니다. URL을 다시 불러오거나 본문을 붙여넣어 주세요.", "warn");
        setPasteOpen(true);
        return;
      }
      setDeepBusyId(hubJob.id);
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
          source: hubJob.source,
          priority: prefs.priority ?? undefined,
          targetSalary: prefs.targetSalary,
          onePoint: buildLocalOnePoint(resume, job, result.match, prefs.priority ?? undefined),
          negotiation: buildLocalNegotiation({ job, match: result.match, priority: prefs.priority ?? undefined, targetSalary: prefs.targetSalary }),
        };

        let next = base;
        if (aiStatus.kind === "live") {
          try {
            const enriched = await enrichWithAi(base, aiConfig);
            next = enriched.pkg;
            next.questions = buildLocalAnswerSet(next.questions, resume, job);
            notify(
              enriched.warnings.length
                ? `AI 분석 완료 — 근거가 확인되지 않은 항목 ${enriched.warnings.length}건을 제외했습니다.`
                : "면접·협상 준비를 AI로 만들었습니다.",
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
        setDeepOpen(true);
        setView("studio");
      } finally {
        setDeepBusyId(null);
      }
    },
    [aiConfig, aiStatus.kind, notify, prefs.priority, prefs.targetSalary, resume],
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

  const addFeedback = useCallback((feedback: InterviewFeedback) => {
    setPkg((prev) => (prev ? { ...prev, feedback: [feedback, ...(prev.feedback ?? [])].slice(0, 8) } : prev));
  }, []);

  const loadPackage = (next: JobPackage) => {
    setPkg(next);
    setPrefs((prev) => ({ ...prev, priority: next.priority ?? prev.priority, targetSalary: next.targetSalary ?? prev.targetSalary }));
    setDeepOpen(true);
    setView("studio");
    notify(`${next.company} 심층 준비를 열었습니다.`);
  };

  const deletePackage = (id: string) => {
    setSaved((prev) => removePackage(prev, id));
    if (pkg?.id === id) {
      setPkg(null);
      setDeepOpen(false);
    }
    notify("심층 준비 기록을 삭제했습니다.", "warn");
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

  const closeDeep = () => {
    setDeepOpen(false);
    setPkg(null);
    setView("studio");
    notify("공고 허브로 돌아왔습니다.");
  };

  const changeView = (next: ViewId) => {
    setView(next);
    setDeepOpen(false);
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

  const hubProps = {
    resume,
    resumeMeta,
    resumeBusy,
    onResumeFile: (file: File) => void importResumeFile(file),
    onOpenResume: () => setResumeOpen(true),
    onSampleResume: useSampleResume,
    jobs: hubJobs,
    selected,
    onSelect: (id: string) => {
      setSelectedId(id);
      // 모바일에서는 목록 아래에 상세가 열리므로 그쪽으로 이동합니다.
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        window.setTimeout(() => document.querySelector("[data-testid=hub-detail]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 90);
      }
    },
    collection,
    onPreset: pickPreset,
    onKeyword: (value: string) => setCollection((prev) => ({ ...prev, keyword: value })),
    onCollect: collectKeyword,
    onRegion: (value: string) => setCollection((prev) => ({ ...prev, region: value })),
    onSort: (value: "latest" | "deadline") => setCollection((prev) => ({ ...prev, sort: value })),
    onToggleSave: toggleSaveJob,
    onEnrich: (id: string) => void enrichJob(id),
    enrichBusyId,
    savedSignal,
    urlsText,
    onUrlsText: setUrlsText,
    onAddUrls: () => void addUrls(),
    adding,
    progress,
    pasteOpen,
    onPasteOpen: setPasteOpen,
    pasteText,
    onPasteText: setPasteText,
    pasteUrl,
    onPasteUrl: setPasteUrl,
    onAddPaste: addPaste,
    onRemoveJob: removeJob,
    onUpdate: updateJob,
    onAiDraft: (id: string) => {
      const target = jobsRef.current.find((job) => job.id === id);
      if (target) void refineDraft(target, true);
    },
    aiDraftBusyId,
    onOpenDeep: (job: HubJob) => void openDeep(job),
    deepBusyId,
    priority: prefs.priority,
    onPriority: (id: PriorityId) => setPrefs((prev) => ({ ...prev, priority: id })),
    targetSalary: prefs.targetSalary,
    onTargetSalary: (value: number | null) => setPrefs((prev) => ({ ...prev, targetSalary: value })),
    aiStatus,
    onNotify: notify,
  };

  return (
    <>
      <div className="min-h-screen bg-paper print:hidden">
        <TopBar
          view={view}
          onChangeView={changeView}
          aiStatus={aiStatus}
          onOpenAi={() => setAiOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          hubCount={hubJobs.filter((job) => job.source.kind !== "auto" || isTrackedJob(job)).length}
          appliedCount={hubJobs.filter((job) => job.status === "지원완료" || job.status === "서류합격" || job.status === "면접").length}
        />

        <main>
          <div className="mx-auto w-full max-w-[1180px] px-3 pb-16 pt-3 sm:px-5 sm:pt-4">
            {view === "history" ? (
              <HistoryView packages={saved} onLoad={loadPackage} onDelete={deletePackage} onClear={() => setSaved(clearPackages())} onBack={() => changeView("studio")} />
            ) : view === "tracker" ? (
              <TrackerView
                jobs={hubJobs.filter((job) => job.source.kind !== "auto" || isTrackedJob(job))}
                onUpdate={updateJob}
                onOpenJob={(id) => {
                  setSelectedId(id);
                  setDeepOpen(false);
                  setView("studio");
                }}
                onOpenStudio={() => changeView("studio")}
              />
            ) : deepOpen && pkg ? (
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
                onNewJob={closeDeep}
                onOpenTracker={() => changeView("tracker")}
              />
            ) : (
              <Hub {...hubProps} />
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
            <div className="animate-rise relative z-10 w-full max-w-[540px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
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
                  "첫 화면에서는 리멤버·원티드·사람인·잡코리아에서 서울 인하우스 홍보·PR 과차장급 공고를 자동으로 모아 옵니다. 다른 직무 프리셋을 고르거나 키워드를 직접 넣어도 됩니다.",
                  "카드를 고르면 주요 업무·자격 요건·우대 사항·마감일과 원문 지원 링크가 열립니다. 목록 정보만 있는 공고는 ‘원문에서 요건 읽어오기’로 채웁니다.",
                  "이력서를 한 번 등록해 두면 공고마다 내 경력 문장으로 만든 한 줄 어필·지원서 초안이 바로 나옵니다. 복사해서 지원서에 붙여넣으세요.",
                  "‘원문에서 지원하기’를 누르면 실제 공고가 새 탭으로 열립니다. 지원 후 상태를 지원 전 → 준비중 → 지원완료 → 서류합격 → 면접으로 바꾸고 메모를 남기세요.",
                  "카드의 북마크를 누르면 ‘내 지원’에 남아 다음 방문에도 유지됩니다. 제출서류 체크도 함께 저장됩니다.",
                  "공고·상태·메모·지원 문구는 이 브라우저에 저장됩니다. 원문에 없는 경험·수치는 AI도 만들지 않습니다.",
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
                예시 인물·기업은 모두 가상입니다. 실제 회사 기밀, 타인의 개인정보, 채용 사이트의 비공개 자료는 넣지 마세요. 지원 문구는 초안이며
                제출 전에 본인이 확인해야 합니다.
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
