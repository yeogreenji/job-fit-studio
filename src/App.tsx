import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import type {
  AiConfig,
  AiStatus,
  ApplyPrep,
  ApplyRecord,
  CareerDocKind,
  CareerKit,
  CareerProfile,
  DocMatch,
  HubJob,
  InterviewFeedback,
  JobPackage,
  MasterResume,
  PlanId,
  PlanState,
  PriorityId,
  ViewId,
} from "./types";
import { EMPTY_RESUME, SAMPLE_RESUMES } from "./lib/presets";
import { enrichWithAi } from "./lib/enrich";
import { AiError, probeAiServer, requestAiApplyKit, requestAiPackage, requestAiResumeProfile } from "./lib/ai";
import { buildLocalAnswerSet } from "./lib/priority";
import { buildMarkdown, buildPipelineCsv, downloadCsv, downloadText, slugForFile } from "./lib/report";
import { guessKind, buildPreview, readFileText } from "./lib/import";
import { extractPdfText } from "./lib/pdf";
import { extractDocxText } from "./lib/docx";
import { applySources, buildLocalApplyKit, mergeAiApplyKit } from "./lib/apply";
import { DOC_LABEL, composeKit, detectDocKind, kitReady, matchJobWithKit, parseDoc, putDoc, removeDocFromKit, searchKeywords } from "./lib/careerKit";
import { mergeProfileFromDraft, mergeProfileFromResume, profileFromResume, profileIsSet, priorityLabel, roleFromResume } from "./lib/career";
import { activatePlan, activateTrial, deactivatePlan, featuresOf, loadPlan, persistPlan, planById } from "./lib/plan";
import { scoreFit } from "./lib/fit";
import { buildLocalPackage } from "./lib/package";
import { fetchMany, hubJobFromOutcome, hubJobFromPaste, splitJobUrls, urlKey, type AddProgress } from "./lib/hub";
import { fetchJobFromUrl } from "./lib/jobUrl";
import { CollectError, isTrackedJob, mergeCollected, requestJobs, type CollectionState } from "./lib/collect";
import { CUSTOM_PRESET, DEFAULT_PRESET, presetById } from "./lib/jobPresets";
import {
  addPackage,
  clearPackages,
  loadAiConfig,
  loadCareerKit,
  loadCareerProfile,
  loadHubJobs,
  loadPackages,
  loadPrefs,
  loadResume,
  loadResumeMeta,
  persistAiConfig,
  persistCareerKit,
  persistCareerProfile,
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
import { ApplyDrawer } from "./components/ApplyDrawer";
import { CareerProfileModal } from "./components/CareerProfileModal";
import { PricingModal } from "./components/PricingModal";
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
  const [careerKit, setCareerKit] = useState<CareerKit>(() => loadCareerKit());
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeBusy, setResumeBusy] = useState<string | null>(null);
  const [collectingDocs, setCollectingDocs] = useState(false);
  const [resumeFlow, setResumeFlow] = useState<{ stage: string; matched: number | null } | null>(null);
  const [applyJob, setApplyJob] = useState<HubJob | null>(null);
  const [applyQueue, setApplyQueue] = useState<string[]>([]);
  const [applyIndex, setApplyIndex] = useState(0);
  const [prepCache, setPrepCache] = useState<Record<string, ApplyPrep>>({});
  const [prepBusyId, setPrepBusyId] = useState<string | null>(null);

  const [hubJobs, setHubJobs] = useState<HubJob[]>(() => loadHubJobs());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionState>({
    preset: DEFAULT_PRESET,
    keyword: "",
    applied: "",
    profile: "",
    filter: null,
    region: "전체",
    years: "전체",
    minFit: 0,
    hideExcluded: true,
    activeSources: [],
    sort: "latest",
    status: "idle",
    sources: [],
    at: null,
    error: "",
    cached: false,
    mode: "auto",
    docKeywords: [],
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
  const [savedProfile, setSavedProfile] = useState<CareerProfile | null>(() => loadCareerProfile());
  const [profileOpen, setProfileOpen] = useState(false);
  const [plan, setPlan] = useState<PlanState>(() => loadPlan());
  const [pricingOpen, setPricingOpen] = useState(false);
  const features = useMemo(() => featuresOf(plan), [plan]);
  const [pkg, setPkg] = useState<JobPackage | null>(null);
  const [saved, setSaved] = useState<JobPackage[]>(() => loadPackages());
  const [deepBusyId, setDeepBusyId] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [aiKit, setAiKit] = useState<{ hubJobId: string; pkg: JobPackage } | null>(null);
  const [kitBusy, setKitBusy] = useState(false);
  const [printPkg, setPrintPkg] = useState<JobPackage | null>(null);

  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [aiStatus, setAiStatus] = useState<AiStatus>(INITIAL_STATUS);
  const [aiOpen, setAiOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; tone: ToastTone } | null>(null);

  const jobsRef = useRef(hubJobs);
  jobsRef.current = hubJobs;
  const collectionRef = useRef(collection);
  collectionRef.current = collection;
  const careerKitRef = useRef(careerKit);
  careerKitRef.current = careerKit;
  const profileRef = useRef<CareerProfile | null>(savedProfile);
  profileRef.current = savedProfile;
  const prepRef = useRef(prepCache);
  prepRef.current = prepCache;
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
    persistCareerKit(careerKit);
  }, [careerKit]);

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
        mode: "auto",
        docKeywords: [],
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

  /* 첫 화면 자동 수집은 ‘내 서류로 수집’ 함수 정의 뒤에서 겁니다 — 이력서가 있으면 그 기준으로 모읍니다. */

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

  /* ── 커리어 서류 3종 (이력서 · 자기소개서 · 포트폴리오) ── */

  const setPortfolioUrl = useCallback((value: string) => {
    setCareerKit((prev) => composeKit({ docs: prev.docs, portfolioUrl: value, role: prev.role, years: prev.years }));
  }, []);

  /** 서류 키워드와 공고를 대조한 결과 — 카드와 상세, 지원 드로어에 함께 씁니다. */
  const docFits = useMemo(() => {
    const map: Record<string, DocMatch> = {};
    for (const job of hubJobs) map[job.id] = matchJobWithKit(careerKit, job.job);
    return map;
  }, [hubJobs, careerKit]);

  /**
   * 내 서류(이력서) 키워드로 네 곳의 공고를 모읍니다.
   * 이력서를 올리면 자동으로도 부르고, 버튼으로도 다시 부를 수 있습니다.
   * 돌려주는 matched는 서류 키워드가 실제로 걸린 공고 수입니다.
   */
  const collectDocs = useCallback(
    async (kitArg?: CareerKit, reason: "manual" | "resume" = "manual"): Promise<{ matched: number; total: number } | null> => {
      const current = kitArg ?? careerKitRef.current;
      if (!kitReady(current)) {
        notify("이력서나 자기소개서를 먼저 올려 주세요. 서류에서 확인된 키워드로 공고를 모읍니다.", "warn");
        return null;
      }
      const keywords = searchKeywords(current, 5);
      if (!keywords.length) {
        notify("서류에서 검색 키워드를 찾지 못했습니다. 이력서에 직무 용어를 한 줄 더 적어 보세요.", "warn");
        return null;
      }
      setCollection((prev) => ({
        ...prev,
        preset: "docs",
        applied: keywords.join(" · "),
        docKeywords: keywords,
        mode: "docs",
        status: "loading",
        error: "",
      }));
      setCollectingDocs(true);
      try {
        const data = await requestJobs({ query: keywords[0] ?? "", keywords, limit: 60, detail: 8 });
        // 이력서를 올려 모을 때는 지금 보고 있던 공고를 지우지 않고 더합니다 (보던 카드가 사라지지 않게).
        setHubJobs((prev) => mergeCollected(prev, data.jobs, data.fetchedAt, true));
        setCollection((prev) => ({
          ...prev,
          status: data.jobs.length ? "ready" : "empty",
          sources: data.sources,
          at: data.fetchedAt,
          cached: Boolean(data.cached),
          filter: data.filter ?? null,
          error: "",
          sort: "doc",
        }));
        const matched = data.jobs.filter((job) => (job.hitKeywords?.length ?? 0) > 0).length;
        if (!data.jobs.length) {
          notify(`내 이력서 키워드(${keywords.join(" · ")})로는 맞는 공고를 찾지 못했습니다. 자소서·포트폴리오를 더 올리거나 키워드를 직접 넣어 보세요.`, "warn");
        } else if (reason === "resume") {
          notify(`내 이력서 기준 맞춤 공고 ${matched}건을 찾았습니다 — 네 곳에서 ${data.jobs.length}건을 모아 대조했습니다.`);
        } else {
          notify(`서류 키워드 ${keywords.length}개로 ${data.jobs.length}건을 모았습니다 — 서류 키워드가 걸린 ${matched}건을 위로 올렸습니다.`);
        }
        return { matched, total: data.jobs.length };
      } catch (error) {
        const message = error instanceof CollectError || error instanceof Error ? error.message : "공고를 모으지 못했습니다.";
        setCollection((prev) => ({ ...prev, status: "error", error: message, sources: [] }));
        notify(message, "warn");
        return null;
      } finally {
        setCollectingDocs(false);
      }
    },
    [notify],
  );

  const collectFromDocs = useCallback(() => void collectDocs(), [collectDocs]);

  /**
   * 첫 화면부터 실제 공고가 보이도록 한 번 모읍니다.
   * 이력서가 이미 있으면 기본 프리셋이 아니라 ‘내 이력서 기준’으로 모읍니다.
   */
  useEffect(() => {
    if (collectedOnce.current) return;
    collectedOnce.current = true;
    const kit = careerKitRef.current;
    if (kitReady(kit) && searchKeywords(kit, 4).length >= 1) {
      void collectDocs(kit);
      return;
    }
    void runCollect({ preset: collectionRef.current.preset || DEFAULT_PRESET });
  }, [collectDocs, runCollect]);

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
        const tracked = jobsRef.current.filter((job) => isTrackedJob(job)).length;
        if (Number.isFinite(features.pipelineLimit) && tracked >= features.pipelineLimit) {
          setPricingOpen(true);
          notify(
            `Free 플랜은 담은 공고 ${features.pipelineLimit}건까지입니다. Pro에서 무제한 추적으로 열립니다.`,
            "warn",
          );
          return;
        }
        patchJob(id, (job) => ({ ...job, saved: true }));
        notify(`${target.job.company || "공고"}를 내 지원에 담았습니다.`);
      }
    },
    [features.pipelineLimit, notify, patchJob],
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
    setPrepCache({});
  }, []);

  const removeDocument = useCallback(
    (kind: CareerDocKind) => {
      setCareerKit((prev) =>
        kind === "resume"
          ? removeDocFromKit(prev, kind, { role: "", years: null, resume: null })
          : removeDocFromKit(prev, kind),
      );
      if (kind === "resume") {
        applyResume(
          { ...EMPTY_RESUME, experiences: EMPTY_RESUME.experiences.map((exp) => ({ ...exp, bullets: exp.bullets.map((bullet) => ({ ...bullet })) })) },
          { source: "none", savedAt: new Date().toISOString(), note: "이력서 뺌" },
        );
        notify("이력서를 서류 허브에서 뺐습니다. 공고 대조와 지원 문구도 초기화됩니다.", "warn");
        return;
      }
      notify(`${kind === "cover" ? "자기소개서" : "포트폴리오"}를 서류 허브에서 뺐습니다.`, "warn");
    },
    [applyResume, notify],
  );

  /** 이력서·자기소개서·포트폴리오 파일을 읽어 서류 허브에 담습니다. */
  /**
   * 이력서 글자 → 프로필 자동 채움 → 맞춤 공고 자동 수집.
   * 파일(PDF·DOCX·TXT·MD)과 직접 붙여넣기가 같은 길을 씁니다.
   */
  const ingestResume = useCallback(
    async (text: string, fileName: string, info: { pages?: number; note?: string } = {}) => {
      const chars = text.replace(/\s/g, "").length;
      const parsedKind = guessKind(text);
      const parsed = buildPreview(text, parsedKind);
      if (parsedKind === "job") {
        notify("이 파일은 공고처럼 보입니다. 공고는 위 ‘공고 모으기’ 칸에 URL이나 본문으로 넣어 주세요.", "warn");
      }

      /** ① 이력서에서 확인되는 값만으로 커리어 프로필을 채웁니다 (이미 넣은 값은 그대로). */
      const merged = mergeProfileFromResume(profileRef.current, parsed.resume);
      let profileNow = merged.profile;
      if (merged.filled.length) {
        setSavedProfile(profileNow);
        persistCareerProfile(profileNow);
        profileRef.current = profileNow;
      }

      let doc = parseDoc({
        kind: "resume",
        text,
        fileName,
        chars,
        pages: info.pages,
        resume: parsed.resume,
        uploadedAt: new Date().toISOString(),
      });
      let nextKit = putDoc(careerKitRef.current, doc, {
        role: roleFromResume(parsed.resume),
        years: parsed.resume.years > 0 ? parsed.resume.years : null,
        resume: parsed.resume,
      });
      setCareerKit(nextKit);
      careerKitRef.current = nextKit;

      const bullets = resumeBulletCount(parsed.resume);
      applyResume(parsed.resume, {
        source: "file",
        fileName,
        savedAt: new Date().toISOString(),
        note: [info.note, parsed.summary, parsed.warnings.length ? parsed.warnings[0] : ""].filter(Boolean).join(" · "),
      });
      setResumeOpen(false);
      const profileNote = merged.filled.length ? ` 프로필 자동 채움 — ${merged.filled.join(" · ")}.` : "";
      notify(
        bullets === 0
          ? `경력 문장을 나누지 못했습니다. 편집 창에서 회사·직함과 문장을 확인해 주세요.${profileNote}`
          : `이력서를 저장했습니다 — 경력 ${parsed.resume.experiences.length}개 · 문장 ${bullets}개 · 서류 키워드 ${doc.keywords.length}개.${profileNote}`,
        bullets === 0 ? "warn" : "ok",
      );

      /** ② AI가 연결돼 있으면 이력서를 읽어 직무·키워드·성과까지 더 정확히 잡습니다. */
      setResumeFlow({ stage: "이력서에서 프로필을 읽는 중", matched: null });
      if (aiStatus.kind === "live") {
        setResumeBusy("AI가 이력서를 읽고 프로필을 채우는 중");
        try {
          const { data } = await requestAiResumeProfile({ text, fileName, config: aiConfig });
          const mergedAi = mergeProfileFromDraft(profileNow, {
            role: data.role,
            years: typeof data.years === "number" ? data.years : null,
            keywords: data.keywords,
            summary: data.summary,
            locations: data.locations,
            salary: data.salary ?? null,
          });
          profileNow = mergedAi.profile;
          if (mergedAi.filled.length) {
            setSavedProfile(profileNow);
            persistCareerProfile(profileNow);
            profileRef.current = profileNow;
          }
          const aiKeywords = (data.keywords ?? []).map((term) => term.trim()).filter(Boolean);
          const achievements = (data.achievements ?? []).map((line) => line.trim()).filter(Boolean);
          if (aiKeywords.length || achievements.length) {
            doc = {
              ...doc,
              keywords: [...new Set([...aiKeywords, ...doc.keywords])].slice(0, 8),
              highlights: [...new Set([...achievements, ...doc.highlights])].slice(0, 3),
              summary: doc.summary || (data.summary ?? "").slice(0, 160),
            };
            nextKit = putDoc(nextKit, doc, {
              role: profileNow.role || roleFromResume(parsed.resume),
              years: profileNow.years,
              resume: parsed.resume,
            });
            setCareerKit(nextKit);
            careerKitRef.current = nextKit;
          }
          if (mergedAi.filled.length) {
            notify(`AI가 이력서를 읽어 프로필을 채웠습니다 — ${mergedAi.filled.join(" · ")}.`);
          }
        } catch {
          notify("AI 읽기는 건너뛰고, 이력서에서 확인되는 값만으로 프로필을 채웠습니다.", "warn");
        } finally {
          setResumeBusy(null);
        }
      }

      /** ③ 그 프로필의 키워드로 공고를 바로 모아 대조합니다. */
      setResumeFlow({ stage: "내 이력서 기준으로 공고를 찾는 중", matched: null });
      const found = await collectDocs(nextKit, "resume");
      setResumeFlow(null);
      if (found && found.matched > 0) {
        setCollection((prev) => ({ ...prev, sort: "doc" }));
      }
    },
    [aiConfig, aiStatus.kind, applyResume, collectDocs, notify],
  );

  const importDoc = useCallback(
    async (file: File, hint?: CareerDocKind) => {
      const lower = file.name.toLowerCase();
      const isPdf = lower.endsWith(".pdf");
      const isDocx = lower.endsWith(".docx");
      setResumeBusy(isPdf ? "PDF에서 글자를 읽는 중" : isDocx ? "Word 파일에서 글자를 읽는 중" : "서류 파일을 읽는 중");
      try {
        let text = "";
        let pages: number | undefined;
        let fileNote = "";
        if (isPdf) {
          const result = await extractPdfText(await file.arrayBuffer());
          if (!result.ok) {
            notify(`${result.reason ?? "PDF를 읽지 못했습니다"} PDF 대신 .txt/.md로 저장해 올리거나 ‘직접 입력’을 사용하세요.`, "err");
            return;
          }
          text = result.text;
          pages = result.pages;
          fileNote = `${result.pages}쪽 · ${text.replace(/\s/g, "").length.toLocaleString("ko-KR")}자`;
        } else if (isDocx) {
          const result = await extractDocxText(await file.arrayBuffer());
          if (!result.ok) {
            notify(`${result.reason ?? "DOCX를 읽지 못했습니다"} PDF나 .txt/.md로 저장해 올리거나 ‘직접 입력’을 사용하세요.`, "err");
            return;
          }
          text = result.text;
          fileNote = `Word 문서 · ${text.replace(/\s/g, "").length.toLocaleString("ko-KR")}자`;
        } else {
          text = await readFileText(file);
        }
        if (text.trim().length < 40) {
          notify("파일이 비어 있습니다. 내용을 확인해 주세요.", "warn");
          return;
        }

        const kind = hint ?? detectDocKind(file.name, text);
        const chars = text.replace(/\s/g, "").length;

        if (kind === "resume") {
          await ingestResume(text, file.name, { pages, note: fileNote });
          return;
        }

        /* ── 자기소개서·포트폴리오: 요약·키워드·대표 문장만 남깁니다 ── */
        const doc = parseDoc({ kind, text, fileName: file.name, chars, pages, uploadedAt: new Date().toISOString() });
        setCareerKit((prev) => putDoc(prev, doc));
        notify(
          `${DOC_LABEL[kind]}를 담았습니다 — 키워드 ${doc.keywords.length}개${doc.highlights.length ? ` · 대표 문장 ${doc.highlights.length}개` : ""}. 공고 대조와 지원 문구에 함께 씁니다.`,
          doc.keywords.length ? "ok" : "warn",
        );
      } catch {
        notify("파일을 읽지 못했습니다. .txt/.md/.pdf/.docx인지 확인해 주세요.", "err");
      } finally {
        setResumeBusy(null);
      }
    },
    [ingestResume, notify],
  );

  /** 이력서 본문 붙여넣기 — 파일 없이 같은 자동 흐름을 탑니다. */
  const importResumeText = useCallback(
    async (text: string) => {
      if (text.trim().length < 40) {
        notify("이력서 내용을 조금 더 붙여넣어 주세요.", "warn");
        return;
      }
      setResumeBusy("붙여넣은 이력서를 읽는 중");
      try {
        await ingestResume(text, "붙여넣은 이력서", {
          note: `직접 붙여넣음 · ${text.replace(/\s/g, "").length.toLocaleString("ko-KR")}자`,
        });
      } finally {
        setResumeBusy(null);
      }
    },
    [ingestResume, notify],
  );

  const useSampleResume = useCallback(() => {
    const sample = SAMPLE_RESUMES[0];
    applyResume(sample, { source: "sample", savedAt: new Date().toISOString(), note: "가상 인물 샘플" });
    const doc = parseDoc({
      kind: "resume",
      text: "",
      fileName: "샘플 이력서",
      chars: sample.experiences.reduce((sum, exp) => sum + exp.bullets.reduce((inner, bullet) => inner + bullet.text.length, 0), 0),
      resume: sample,
    });
    setCareerKit((prev) => putDoc(prev, doc, { role: roleFromResume(sample), years: sample.years > 0 ? sample.years : null, resume: sample }));
    const merged = mergeProfileFromResume(profileRef.current, sample);
    if (merged.filled.length) {
      setSavedProfile(merged.profile);
      persistCareerProfile(merged.profile);
      profileRef.current = merged.profile;
    }
    setPrepCache({});
    setResumeOpen(false);
    notify(
      `가상 인물 ‘서하늘’ 샘플을 넣었습니다.${merged.filled.length ? ` 프로필 자동 채움 — ${merged.filled.join(" · ")}.` : ""} 실제 지원 전에 내 이력서로 바꿔 주세요.`,
      "warn",
    );
  }, [applyResume, notify]);

  /* ── 지원 문구 (AI 다듬기) ── */

  const refineDraft = useCallback(
    async (job: HubJob, manual = false) => {
      if (!features.aiRefine) {
        if (manual) {
          notify("AI 문장 다듬기는 유료 플랜 기능입니다. 요금제에서 14일 무료 체험을 켜면 열립니다.", "warn");
          setPricingOpen(true);
        }
        return;
      }
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
    [aiConfig, features.aiRefine, notify, patchJob, resume],
  );

  /** ‘지원 완료로 기록’ — 지원완료 칸으로 옮기고 제출 시각·서류·경로를 남깁니다. */
  const recordApplication = useCallback(
    (job: HubJob, via: ApplyRecord["via"], documents: string[], oneLiner: string) => {
      const tracked = jobsRef.current.filter((item) => isTrackedJob(item)).length;
      const overLimit = !job.saved && Number.isFinite(features.pipelineLimit) && tracked >= features.pipelineLimit;
      const now = new Date().toISOString();
      const unique = [...new Set(documents.filter(Boolean))];
      const next: HubJob = {
        ...job,
        status: "지원완료",
        saved: true,
        applied: { at: now, via, documents: unique, oneLiner: oneLiner.slice(0, 160) },
        updatedAt: now,
      };
      updateJob(next);
      setApplyJob(next);
      const viaLabel = via === "email" ? "이메일" : via === "site" ? "채용 사이트" : "기타 경로";
      if (overLimit) {
        notify(
          `${job.job.company || "이 공고"} 지원 기록을 남겼습니다 — ${viaLabel} · 서류 ${unique.length}건. 지원한 기록은 지우지 않습니다. Free는 보드에서 ${features.pipelineLimit}건까지 함께 관리합니다.`,
          "warn",
        );
        return;
      }
      notify(`${job.job.company || "이 공고"} 지원을 기록했습니다 — ${viaLabel} · 서류 ${unique.length}건. 지원완료 칸으로 옮겼습니다.`);
    },
    [features.pipelineLimit, notify, updateJob],
  );

  /** 지원 드로어가 보는 최신 공고 (서류 체크·기록이 즉시 반영되도록) */
  const applyTarget = applyJob ? hubJobs.find((job) => job.id === applyJob.id) ?? applyJob : null;

  const selected = useMemo(() => hubJobs.find((job) => job.id === selectedId) ?? hubJobs[0] ?? null, [hubJobs, selectedId]);

  /* ── 커리어 프로필 · 적합도 ── */

  /** 협상 스크립트에 쓸 희망 연봉 — 직접 넣은 값이 우선, 없으면 프로필의 희망 연봉. */
  const targetSalary = prefs.targetSalary ?? savedProfile?.salary ?? null;

  /** 저장한 프로필이 없으면 이력서에서 확인되는 값만으로 초안을 씁니다. */
  const profile = useMemo(
    () => savedProfile ?? profileFromResume(resume, targetSalary),
    [resume, savedProfile, targetSalary],
  );
  /** AI 프롬프트에 넘길 프로필 요약 (이름·연락처 없이 조건만) */
  const profileBrief = useMemo(
    () => ({ role: profile.role, years: profile.years, keywords: profile.keywords, exclude: profile.exclude }),
    [profile],
  );

  const fits = useMemo(() => {
    const active = profileIsSet(profile) ? profile : null;
    const map: Record<string, ReturnType<typeof scoreFit>> = {};
    for (const job of hubJobs) map[job.id] = scoreFit(active, job.job);
    return map;
  }, [hubJobs, profile]);

  const saveProfile = useCallback(
    (next: CareerProfile) => {
      setSavedProfile(next);
      persistCareerProfile(next);
      setProfileOpen(false);
      if (next.salary !== null) setPrefs((prev) => ({ ...prev, targetSalary: next.salary }));
      setAiKit(null);
      notify(
        profileIsSet(next)
          ? `${next.keywords.length}개 키워드 · ${next.years !== null ? `경력 ${next.years}년` : "연차 미입력"} 기준으로 공고 ${hubJobs.length}건의 적합도를 다시 계산했습니다.`
          : "프로필을 저장했습니다. 직무·키워드를 넣으면 적합도가 계산됩니다.",
        profileIsSet(next) ? "ok" : "warn",
      );
    },
    [hubJobs.length, notify],
  );

  /* ── 요금제 (결제 연동 전 데모) ── */

  const openPricing = useCallback(() => setPricingOpen(true), []);

  const choosePlan = useCallback(
    (id: PlanId) => {
      if (id === "free") {
        const next = deactivatePlan();
        setPlan(next);
        persistPlan(next);
        notify("Free 플랜입니다. 담은 공고·이력서·프로필은 그대로 남습니다.", "warn");
      } else {
        const next = activatePlan(id);
        setPlan(next);
        persistPlan(next);
        const months = id === "focus" ? "1개월" : id === "pass" ? "3개월" : "6개월";
        notify(
          `${planById(id).name}(데모)를 켜쉈습니다 — ${months} 동안 지원 패키지 4종·AI 다듬기·무제한 파이프라인이 열립니다.`,
        );
      }
      setPricingOpen(false);
    },
    [notify],
  );

  const toggleTrial = useCallback(
    (on: boolean) => {
      const next = on ? activateTrial() : deactivatePlan();
      setPlan(next);
      persistPlan(next);
      notify(
        on ? "14일 무료 체험을 켰습니다 — 결제 없이 이 브라우저에서만 열립니다." : "무료 체험을 껐습니다. Free로 돌아갑니다.",
        on ? "ok" : "warn",
      );
    },
    [notify],
  );

  /* ── 지원 준비 (1분 자기소개·예상 질문) · 연속 지원 ── */

  /**
   * 지원 드로어가 보는 문구 묶음을 미리 만듭니다.
   * 규칙으로 즉시 만들고, AI가 연결돼 있으면 같은 공고로 한 번 더 다듬어 교체합니다.
   */
  const prepareApply = useCallback(
    async (hubJob: HubJob) => {
      if (prepRef.current[hubJob.id]) return;
      if (!resumeReady(resume)) return;
      setPrepBusyId(hubJob.id);
      try {
        const base = buildLocalPackage({
          resume,
          job: hubJob.job,
          source: hubJob.source,
          priority: prefs.priority ?? undefined,
          targetSalary,
          hubJobId: hubJob.id,
        });
        const local: ApplyPrep = {
          intro: base.intro?.text ?? "",
          questions: base.questions.slice(0, 5).map((question) => ({
            question: question.question,
            why: question.why,
            answer: question.answer ?? "",
            avoid: question.avoid,
            category: question.category,
          })),
          source: "rule",
          at: new Date().toISOString(),
        };
        let next = local;
        if (aiStatus.kind === "live" && features.aiRefine) {
          try {
            const { data, model } = await requestAiPackage({
              job: hubJob.job,
              resume,
              match: base.match,
              config: aiConfig,
              priorityLabel: priorityLabel(prefs.priority),
              targetSalary,
              profile: profileBrief,
            });
            const questions = (data.questions ?? [])
              .slice(0, 5)
              .map((question) => ({
                question: question.question ?? "",
                why: question.why ?? "",
                answer: question.answer ?? "",
                avoid: question.avoid,
                category: question.category,
              }))
              .filter((question) => question.question && question.answer);
            next = {
              intro: data.intro?.text?.trim() || local.intro,
              questions: questions.length ? questions : local.questions,
              source: "ai",
              model,
              at: new Date().toISOString(),
            };
          } catch {
            /* AI가 막히면 규칙 문구를 그대로 둡니다 */
          }
        }
        setPrepCache((prev) => ({ ...prev, [hubJob.id]: next }));
      } finally {
        setPrepBusyId((prev) => (prev === hubJob.id ? null : prev));
      }
    },
    [aiConfig, aiStatus.kind, features.aiRefine, prefs.priority, profileBrief, resume, targetSalary],
  );

  const openApply = useCallback((job: HubJob) => {
    setApplyQueue([]);
    setApplyIndex(0);
    setApplyJob(job);
  }, []);

  /** 적합 상위 공고들을 한 드로어에서 차례로 준비합니다. */
  const openApplyQueue = useCallback((jobs: HubJob[]) => {
    if (!jobs.length) return;
    setApplyQueue(jobs.map((job) => job.id));
    setApplyIndex(0);
    setApplyJob(jobs[0]);
  }, []);

  const queueJobs = useMemo(
    () => applyQueue.map((id) => hubJobs.find((job) => job.id === id)).filter((job): job is HubJob => Boolean(job)),
    [applyQueue, hubJobs],
  );

  const stepQueue = useCallback(
    (index: number) => {
      const job = queueJobs[index];
      if (!job) return;
      setApplyIndex(index);
      setApplyJob(job);
    },
    [queueJobs],
  );

  const closeApply = useCallback(() => {
    setApplyJob(null);
    setApplyQueue([]);
    setApplyIndex(0);
  }, []);

  /* ── 지원 현황 내보내기 (프리미엄) ── */

  const exportPipeline = useCallback(() => {
    const trackedJobs = hubJobs.filter((job) => job.source.kind !== "auto" || isTrackedJob(job));
    if (!trackedJobs.length) {
      notify("내보낼 지원 현황이 없습니다. 공고를 담으면 여기에 쌓입니다.", "warn");
      return;
    }
    const stamp = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    downloadCsv(
      `jobfit-지원현황-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.csv`,
      buildPipelineCsv(trackedJobs),
    );
    notify(`지원 현황 ${trackedJobs.length}건을 CSV로 내려받았습니다 — 엑셀에서 바로 열립니다.`);
  }, [hubJobs, notify]);

  /* ── 지원 패키지 (공고 한 건, 규칙으로 즉시) ── */

  const localKit = useMemo(() => {
    if (!selected || !resumeReady(resume)) return null;
    return buildLocalPackage({
      resume,
      job: selected.job,
      source: selected.source,
      priority: prefs.priority ?? undefined,
      targetSalary,
      hubJobId: selected.id,
    });
  }, [prefs.priority, resume, selected, targetSalary]);

  useEffect(() => {
    setAiKit(null);
  }, [selected?.id, prefs.priority, targetSalary, resume]);

  const kit = aiKit && selected && aiKit.hubJobId === selected.id ? aiKit.pkg : localKit;

  const refineKit = useCallback(async () => {
    if (!kit) return;
    if (!features.aiRefine) {
      notify("AI로 다듬기는 유료 플랜 기능입니다. 요금제에서 14일 무료 체험을 켜면 열립니다.", "warn");
      setPricingOpen(true);
      return;
    }
    setKitBusy(true);
    try {
      const enriched = await enrichWithAi(kit, aiConfig, profileBrief);
      const next: JobPackage = {
        ...enriched.pkg,
        hubJobId: kit.hubJobId,
        questions: buildLocalAnswerSet(enriched.pkg.questions, kit.resumeSnapshot, kit.jobSnapshot),
      };
      setAiKit({ hubJobId: kit.hubJobId ?? "", pkg: next });
      notify(
        enriched.warnings.length
          ? `지원 패키지를 AI로 다듬었습니다 — 근거가 확인되지 않은 항목 ${enriched.warnings.length}건은 규칙 문장으로 두었습니다.`
          : "지원 패키지를 AI로 다듬었습니다.",
        enriched.warnings.length ? "warn" : "ok",
      );
    } catch (error) {
      if (error instanceof AiError && error.code === "no_key") {
        setAiStatus((prev) => ({ ...prev, kind: "local", reason: "no_key", message: "서버에 API 키가 없습니다" }));
      }
      notify(`${error instanceof Error ? error.message : "AI 호출에 실패했습니다"} — 규칙 문장을 유지합니다.`, "warn");
    } finally {
      setKitBusy(false);
    }
  }, [aiConfig, features.aiRefine, kit, notify, profileBrief]);

  const exportKit = useCallback(() => {
    if (!kit) return;
    downloadText(slugForFile(kit.company, kit.createdAt), buildMarkdown(kit));
    notify("지원 패키지를 Markdown으로 내려받았습니다.");
  }, [kit, notify]);

  const printKit = useCallback(() => {
    if (!kit) return;
    setPrintPkg(kit);
    window.setTimeout(() => window.print(), 160);
  }, [kit]);

  useEffect(() => {
    const clear = () => setPrintPkg(null);
    window.addEventListener("afterprint", clear);
    return () => window.removeEventListener("afterprint", clear);
  }, []);

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
    if (aiStatus.kind === "live" && features.aiRefine) void refineDraft({ ...selected, draft: local });
  }, [aiStatus.kind, features.aiRefine, patchJob, refineDraft, resume, selected]);

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
      if (!features.deepPrep) {
        notify("90초 면접 연습과 심층 준비는 유료 플랜 기능입니다. 요금제에서 14일 무료 체험을 켜면 열립니다.", "warn");
        setPricingOpen(true);
        return;
      }
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
        const base = buildLocalPackage({
          resume,
          job,
          source: hubJob.source,
          priority: prefs.priority ?? undefined,
          targetSalary,
          hubJobId: hubJob.id,
        });

        let next = base;
        if (aiStatus.kind === "live" && features.aiRefine) {
          try {
            const enriched = await enrichWithAi(base, aiConfig, profileBrief);
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
    [aiConfig, aiStatus.kind, features.aiRefine, features.deepPrep, notify, prefs.priority, profileBrief, resume, targetSalary],
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
      const enriched = await enrichWithAi(pkg, aiConfig, profileBrief);
      const next = { ...enriched.pkg, questions: buildLocalAnswerSet(enriched.pkg.questions, pkg.resumeSnapshot, pkg.jobSnapshot) };
      setPkg(next);
      setSaved((prev) => updatePackage(prev, next));
      notify(enriched.warnings.length ? `AI 분석 완료 — 근거 미확인 ${enriched.warnings.length}건 제외` : "AI로 다시 분석했습니다.", enriched.warnings.length ? "warn" : "ok");
    } catch (error) {
      notify(`${error instanceof Error ? error.message : "AI 호출 실패"} — 기존 결과를 유지합니다.`, "warn");
    } finally {
      setRegenerating(false);
    }
  }, [aiConfig, notify, pkg, profileBrief, refreshAi]);

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
        setProfileOpen(false);
        setResumeOpen(false);
        setPricingOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** 내 이력서와 실제로 맞는 공고 요약 — 첫 화면에 ‘맞춤 공고 N건’으로 보입니다. */
  const docMatchSummary = useMemo(() => {
    const scored = hubJobs
      .filter((job) => job.source.kind === "auto" && !isTrackedJob(job))
      .map((job) => docFits[job.id])
      .filter((match): match is DocMatch => Boolean(match && !match.needsKit));
    // ‘맞춤’은 내 서류 키워드가 2개 이상 실제로 걸린 공고입니다 (1개만 걸린 우연을 빼기 위해).
    const strong = scored.filter((match) => match.matched.length >= 2);
    return {
      count: strong.length,
      total: scored.length,
      top: strong.length ? Math.max(...strong.map((match) => match.score)) : 0,
    };
  }, [docFits, hubJobs]);

  const hubProps = {
    resume,
    resumeMeta,
    resumeBusy,
    onOpenResume: () => setResumeOpen(true),
    onSampleResume: useSampleResume,
    onResumeText: (text: string) => void importResumeText(text),
    careerKit,
    onDocFile: (file: File, kind?: CareerDocKind) => void importDoc(file, kind),
    onRemoveDoc: removeDocument,
    onPortfolioUrl: setPortfolioUrl,
    onCollectDocs: collectFromDocs,
    collectingDocs,
    resumeFlow,
    docMatchSummary,
    docFits,
    onOpenApply: openApply,
    onOpenApplyQueue: openApplyQueue,
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
    onYears: (value: string) => setCollection((prev) => ({ ...prev, years: value })),
    onMinFit: (value: number) => setCollection((prev) => ({ ...prev, minFit: value })),
    onHideExcluded: (value: boolean) => setCollection((prev) => ({ ...prev, hideExcluded: value })),
    onToggleSource: (sourceId: string) =>
      setCollection((prev) => {
        if (sourceId === "__reset") return { ...prev, activeSources: [] };
        const active = prev.activeSources.includes(sourceId)
          ? prev.activeSources.filter((id) => id !== sourceId)
          : [...prev.activeSources, sourceId];
        return { ...prev, activeSources: active };
      }),
    onSort: (value: "latest" | "deadline" | "fit" | "doc") => setCollection((prev) => ({ ...prev, sort: value })),
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
    targetSalary,
    onTargetSalary: (value: number | null) => setPrefs((prev) => ({ ...prev, targetSalary: value })),
    aiStatus,
    onNotify: notify,
    profile,
    profileSaved: Boolean(savedProfile),
    onEditProfile: () => setProfileOpen(true),
    fits,
    kit,
    kitBusy,
    onKitAi: () => void refineKit(),
    onKitExport: exportKit,
    onKitPrint: printKit,
    plan,
    features,
    onOpenPricing: openPricing,
  };

  return (
    <>
      <div className="min-h-screen bg-paper print:hidden">
        <TopBar
          view={view}
          onChangeView={changeView}
          aiStatus={aiStatus}
          plan={plan}
          onOpenPricing={openPricing}
          onOpenAi={() => setAiOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          hubCount={hubJobs.filter((job) => job.source.kind !== "auto" || isTrackedJob(job)).length}
          appliedCount={hubJobs.filter((job) => job.status === "지원완료" || job.status === "서류합격" || job.status === "면접" || job.status === "오퍼").length}
        />

        <main>
          <div className="mx-auto w-full max-w-[1180px] px-3 pb-16 pt-3 sm:px-5 sm:pt-4">
            {view === "history" ? (
              <HistoryView packages={saved} onLoad={loadPackage} onDelete={deletePackage} onClear={() => setSaved(clearPackages())} onBack={() => changeView("studio")} />
            ) : view === "tracker" ? (
              <TrackerView
                jobs={hubJobs.filter((job) => job.source.kind !== "auto" || isTrackedJob(job))}
                fits={fits}
                onUpdate={updateJob}
                onOpenJob={(id) => {
                  setSelectedId(id);
                  setDeepOpen(false);
                  setView("studio");
                }}
                onOpenStudio={() => changeView("studio")}
                pipelineLimit={features.pipelineLimit}
                onOpenPricing={openPricing}
                canExport={features.deskExport}
                onExport={exportPipeline}
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
          onFile={(file) => void importDoc(file, "resume")}
          onSample={useSampleResume}
          onNotify={notify}
        />

        <CareerProfileModal
          open={profileOpen}
          profile={profile}
          saved={Boolean(savedProfile)}
          resume={resume}
          onClose={() => setProfileOpen(false)}
          onSave={saveProfile}
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

        <PricingModal
          open={pricingOpen}
          state={plan}
          onClose={() => setPricingOpen(false)}
          onSelect={choosePlan}
          onToggleTrial={toggleTrial}
        />

        {applyTarget && (
          <ApplyDrawer
            job={applyTarget}
            kit={careerKit}
            resume={resume}
            draft={applyTarget.draft ?? null}
            docMatch={docFits[applyTarget.id] ?? null}
            prep={prepCache[applyTarget.id] ?? null}
            prepBusy={prepBusyId === applyTarget.id}
            onPrepare={() => void prepareApply(applyTarget)}
            queue={queueJobs.length > 1 ? { index: applyIndex, total: queueJobs.length } : null}
            onStep={() => stepQueue(applyIndex + 1)}
            onPrev={() => stepQueue(applyIndex - 1)}
            onClose={closeApply}
            onUpdate={updateJob}
            onRecord={recordApplication}
            onOpenKit={() => {
              closeApply();
              window.setTimeout(() => document.querySelector("[data-testid=career-strip]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
            }}
          />
        )}

        {helpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={() => setHelpOpen(false)} aria-hidden />
            <div className="animate-rise relative z-10 w-full max-w-[540px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
              <div className="flex items-start justify-between px-5 pt-5">
                <div>
                  <h2 className="text-[15px] font-semibold">이렇게 사용합니다</h2>
                  <p className="mt-1 text-[10.5px] text-muted">이력서 한 장에서 지원 접수까지 이어지는 순서</p>
                </div>
                <button type="button" onClick={() => setHelpOpen(false)} className="rounded-md p-1 text-muted hover:bg-paper-deep" aria-label="닫기">
                  <X size={16} />
                </button>
              </div>
              <ol className="mt-4 max-h-[54vh] space-y-2.5 overflow-y-auto px-5">
                {[
                  "이력서(PDF·Word·TXT·MD)를 올리거나 본문을 붙여넣으면 직무·경력 연차·핵심 키워드·성과 문장을 읽어 커리어 프로필을 자동으로 채웁니다. AI가 연결돼 있으면 한 번 더 정확하게 읽고, 없으면 이력서에 적힌 값만으로 채웁니다.",
                  "프로필이 채워지는 즉시, 그 이력서 기준 키워드로 리멤버·원티드·사람인·잡코리아에서 맞춤 공고를 자동으로 모아 0~100% 적합도와 서류 대조를 매깁니다. 첫 화면 위에 ‘내 이력서 기준 맞춤 공고 N건’이 뜹니다.",
                  "다른 직무도 보고 싶으면 직무 프리셋을 고르거나 키워드를 직접 넣어 다시 모을 수 있습니다. 공고 카드의 점수는 프로필에 저장된 조건으로 계산하며, 근거와 빠진 키워드를 카드와 상세에 그대로 보여 줍니다.",
                  "공고를 고르면 주요 업무·자격 요건·우대 사항·마감일과 원문 지원 링크가 열립니다. 목록 정보만 있는 공고는 ‘원문에서 요건 읽어오기’로 채웁니다.",
                  "‘바로 지원하기’를 누르면 이 공고에 맞춘 한 줄 어필·지원 동기·1분 자기소개·면접 예상 질문 5개와 답변 스크립트가 한 드로어에서 자동으로 만들어집니다. 각 항목은 복사 버튼으로 바로 붙여넣습니다.",
                  "상단의 ‘연속 지원 준비’는 내 이력서와 적합도가 높은 3건을 같은 드로어에서 차례로 준비합니다. 한 건을 기록하면 다음 공고로 넘어갑니다.",
                  "채용 사이트 로그인과 지원서 최종 제출은 직접 해야 합니다. 계정 보안과 최종 확인은 대신 누를 수 없기 때문에, 여기서는 문구 준비와 ‘지원 완료로 기록’(제출 시각·서류·경로)까지만 맡습니다.",
                  "지원 상태는 관심 공고 → 지원 완료 → 서류 합격 → 면접 진행 → 최종 오퍼로 옮기고 메모·마감 D-day를 관리합니다. 프리미엄은 이 현황을 CSV로 내려받아 엑셀에서도 봅니다.",
                  "공고·상태·메모·지원 문구·프로필은 이 브라우저에만 저장됩니다. 서류는 파일 이름·글자 수·추출 요약·키워드만 저장하고 원문은 저장하지 않습니다. 원문에 없는 경험·수치는 AI도 만들지 않습니다.",
                  "오른쪽 위 플랜 배지를 누르면 요금제가 열립니다. 1개월 집중 49,000원 · 3개월 이직 패스 119,000원 · 프리미엄 커리어 패스 249,000원이고, 결제 연동 전이라 ‘14일 무료 체험’으로 확인합니다.",
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

      {(printPkg ?? pkg) && <PrintSheet pkg={(printPkg ?? pkg) as JobPackage} />}
    </>
  );
}
