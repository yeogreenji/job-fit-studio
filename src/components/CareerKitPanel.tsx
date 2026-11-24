import { useRef, useState } from "react";
import {
  BadgeCheck,
  Check,
  FileText,
  FolderOpen,
  Gauge,
  Link2,
  Loader2,
  PenLine,
  Plus,
  Radar,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import type { CareerDocKind, CareerKit, CareerProfile, MasterResume } from "../types";
import { DOC_HINT, docOriginsOf, kitDocCount, kitReady, searchKeywords } from "../lib/careerKit";
import { profileSummary } from "../lib/career";
import { resumeBulletCount, resumeReady, type ResumeMeta } from "../lib/storage";
import { Card, cx } from "./ui";

const ACCEPT = ".txt,.md,.markdown,.pdf,text/plain,application/pdf";

/**
 * 커리어 서류 허브 — 이력서 · 자기소개서 · 포트폴리오를 한 카드에 모읍니다.
 *
 * 세 서류에서 확인된 키워드가 공고 수집 검색어와 공고 대조 근거가 됩니다.
 * 파일은 이 브라우저 안에서만 읽고, 저장하는 것은 파일 이름·글자 수·추출 요약·키워드뿐입니다.
 */
export function CareerKitPanel({
  resume,
  resumeMeta,
  resumeBusy,
  kit,
  profile,
  profileSaved,
  onDocFile,
  onRemoveDoc,
  onPortfolioUrl,
  onOpenResume,
  onSampleResume,
  onOpenProfile,
  onCollectDocs,
  collecting,
}: {
  resume: MasterResume;
  resumeMeta: ResumeMeta | null;
  resumeBusy: string | null;
  kit: CareerKit;
  profile: CareerProfile;
  profileSaved: boolean;
  onDocFile: (file: File, kind?: CareerDocKind) => void;
  onRemoveDoc: (kind: CareerDocKind) => void;
  onPortfolioUrl: (url: string) => void;
  onOpenResume: () => void;
  onSampleResume: () => void;
  onOpenProfile: () => void;
  onCollectDocs: () => void;
  collecting: boolean;
}) {
  const resumeInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const portfolioInput = useRef<HTMLInputElement>(null);
  const multiInput = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const ready = resumeReady(resume);
  const bullets = resumeBulletCount(resume);
  const docCount = kitDocCount(kit);
  const canCollect = kitReady(kit);
  const keywords = searchKeywords(kit, 4);
  const sourceLabel =
    resumeMeta?.source === "file"
      ? resumeMeta.fileName ?? "파일"
      : resumeMeta?.source === "manual"
        ? "직접 입력"
        : resumeMeta?.source === "sample"
          ? "샘플 이력서"
          : "";

  const slotShell = (kind: CareerDocKind) => {
    const doc = kit.docs[kind];
    const readySlot = Boolean(doc) || (kind === "portfolio" && Boolean(kit.portfolioUrl));
    return { doc, readySlot };
  };

  return (
    <Card className="overflow-hidden" testId="career-strip">
      {/* 1행 · 커리어 프로필 + 서류 상태 + 수집 실행 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2">
        <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-md text-white", profileSaved ? "bg-accent" : "bg-ink/75")}>
          <Gauge size={12} />
        </span>
        <button
          type="button"
          onClick={onOpenProfile}
          className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-paper-deep/60"
          data-testid="career-pill"
          title="커리어 프로필 열기"
        >
          <span className="truncate text-[12px] font-semibold tracking-[-0.01em] text-ink" data-testid="career-role-pill">
            {profile.role || "커리어 프로필 설정"}
          </span>
          <span className="shrink-0 text-[10.5px] text-muted">{profile.years !== null ? `경력 ${profile.years}년` : "연차 미입력"}</span>
          <PenLine size={10} className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
        <span className={cx("chip text-[9px]", profileSaved ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")} data-testid="career-source">
          {profileSaved ? "저장됨" : "이력서 초안"}
        </span>
        {profileSaved && profile.origin === "resume" && (
          <span className="chip hidden bg-info-soft text-[9px] text-info sm:inline-flex" data-testid="career-origin">
            이력서에서 채움
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span
            className={cx("chip text-[9.5px]", docCount >= 2 ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}
            data-testid="kit-ready"
            data-docs={docCount}
            title="이력서·자기소개서·포트폴리오 중 준비된 서류"
          >
            <FolderOpen size={10} /> 서류 {docCount}/3
          </span>
          <button
            type="button"
            onClick={onCollectDocs}
            disabled={!canCollect || collecting}
            className="btn btn-accent h-8 px-3 text-[11px] disabled:opacity-50"
            data-testid="kit-collect"
            title={canCollect ? "업로드한 서류에서 뽑은 키워드로 네 곳의 공고를 모읍니다" : "이력서나 자기소개서를 먼저 올려 주세요"}
          >
            {collecting ? <Loader2 size={12} className="animate-spin" /> : <Radar size={12} />}
            {collecting ? "모으는 중" : "내 서류로 공고 수집"}
          </button>
        </div>
      </div>

      {/* 2행 · 서류 3슬롯 */}
      <div
        className={cx("grid gap-2 border-t border-line px-3 py-2.5 sm:grid-cols-3", drag && "bg-accent-soft/50")}
        data-testid="kit-slots"
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          const files = Array.from(event.dataTransfer?.files ?? []);
          files.slice(0, 3).forEach((file) => onDocFile(file));
        }}
        data-drag={drag ? "true" : "false"}
      >
        {/* 이력서 */}
        <div
          className={cx("rounded-lg border p-2", ready ? "border-accent/35 bg-accent-soft/25" : "border-line bg-[#fcfcfa]")}
          data-testid="kit-slot-resume"
          data-ready={ready ? "true" : "false"}
        >
          <div className="flex items-center gap-1.5" data-testid="resume-card">
            <FileText size={11} className="text-muted" />
            <span className="text-[10.5px] font-semibold text-ink">이력서</span>
            {ready ? (
              <span className="chip bg-accent-soft px-1.5 py-0 text-[8.5px] text-accent-deep" data-testid="resume-status">
                <BadgeCheck size={9} /> 등록됨
              </span>
            ) : (
              <span className="chip bg-paper-deep px-1.5 py-0 text-[8.5px] text-muted">필수</span>
            )}
            {ready && <span className="num ml-auto text-[8.5px] text-faint">문장 {bullets}</span>}
          </div>

          {ready ? (
            <>
              <p className="mt-1 truncate text-[11px] font-medium text-ink-2" data-testid="resume-name">
                {resume.name || "이름 미입력"}
              </p>
              <p className="mt-0.5 truncate text-[9px] text-faint" title={kit.docs.resume?.fileName}>
                {sourceLabel || kit.docs.resume?.fileName || "직접 입력"} · 키워드 {kit.docs.resume?.keywords.length ?? 0}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <button type="button" onClick={onOpenResume} className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted" data-testid="resume-edit">
                  <PenLine size={10} /> 편집
                </button>
                <button type="button" onClick={() => resumeInput.current?.click()} className="btn btn-outline h-6 px-1.5 text-[10px]" data-testid="resume-replace">
                  <Upload size={10} /> 교체
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveDoc("resume")}
                  className="btn btn-ghost h-6 px-1 text-[9.5px] text-faint hover:text-risk"
                  data-testid="kit-remove-resume"
                  aria-label="이력서 빼기"
                >
                  <X size={10} /> 빼기
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-[9px] leading-relaxed text-faint">{DOC_HINT.resume}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => resumeInput.current?.click()} className="btn btn-primary h-6 px-2 text-[10px]" data-testid="resume-file-btn">
                  <Upload size={10} /> 올리기
                </button>
                <button type="button" onClick={onOpenResume} className="btn btn-outline h-6 px-1.5 text-[9.5px]" data-testid="resume-manual">
                  직접 입력
                </button>
                <button type="button" onClick={onSampleResume} className="btn btn-ghost h-6 px-1 text-[9.5px] text-faint" data-testid="resume-sample">
                  샘플
                </button>
              </div>
            </>
          )}
          <input
            ref={resumeInput}
            type="file"
            accept={ACCEPT}
            className="hidden"
            data-testid="resume-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onDocFile(file, "resume");
              event.target.value = "";
            }}
          />
        </div>

        {/* 자기소개서 */}
        {(() => {
          const { doc, readySlot } = slotShell("cover");
          return (
            <div
              className={cx("rounded-lg border p-2", readySlot ? "border-accent/35 bg-accent-soft/25" : "border-line bg-[#fcfcfa]")}
              data-testid="kit-slot-cover"
              data-ready={readySlot ? "true" : "false"}
            >
              <div className="flex items-center gap-1.5">
                <PenLine size={11} className="text-muted" />
                <span className="text-[10.5px] font-semibold text-ink">자기소개서</span>
                <span className={cx("chip px-1.5 py-0 text-[8.5px]", readySlot ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}>
                  {readySlot ? "등록됨" : "선택"}
                </span>
                {readySlot && <span className="num ml-auto text-[8.5px] text-faint">키워드 {doc?.keywords.length ?? 0}</span>}
              </div>
              {readySlot && doc ? (
                <>
                  <p className="mt-1 truncate text-[11px] font-medium text-ink-2" data-testid="kit-name-cover" title={doc.fileName}>
                    {doc.fileName}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[9px] leading-relaxed text-faint">{doc.summary || "요약 없음"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <button type="button" onClick={() => coverInput.current?.click()} className="btn btn-outline h-6 px-1.5 text-[10px]" data-testid="kit-upload-cover">
                      <Upload size={10} /> 교체
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveDoc("cover")}
                      className="btn btn-ghost h-6 px-1 text-[9.5px] text-faint hover:text-risk"
                      data-testid="kit-remove-cover"
                    >
                      <X size={10} /> 빼기
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 text-[9px] leading-relaxed text-faint">{DOC_HINT.cover}</p>
                  <button type="button" onClick={() => coverInput.current?.click()} className="btn btn-outline mt-1 h-6 px-2 text-[10px]" data-testid="kit-upload-cover">
                    <Plus size={10} /> 자기소개서 올리기
                  </button>
                </>
              )}
              <input
                ref={coverInput}
                type="file"
                accept={ACCEPT}
                className="hidden"
                data-testid="kit-file-cover"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onDocFile(file, "cover");
                  event.target.value = "";
                }}
              />
            </div>
          );
        })()}

        {/* 포트폴리오 */}
        {(() => {
          const { doc, readySlot } = slotShell("portfolio");
          return (
            <div
              className={cx("rounded-lg border p-2", readySlot ? "border-accent/35 bg-accent-soft/25" : "border-line bg-[#fcfcfa]")}
              data-testid="kit-slot-portfolio"
              data-ready={readySlot ? "true" : "false"}
            >
              <div className="flex items-center gap-1.5">
                <FolderOpen size={11} className="text-muted" />
                <span className="text-[10.5px] font-semibold text-ink">포트폴리오</span>
                <span className={cx("chip px-1.5 py-0 text-[8.5px]", readySlot ? "bg-accent-soft text-accent-deep" : "bg-paper-deep text-muted")}>
                  {readySlot ? "등록됨" : "선택"}
                </span>
                {doc && <span className="num ml-auto text-[8.5px] text-faint">키워드 {doc.keywords.length}</span>}
              </div>
              {doc ? (
                <p className="mt-1 truncate text-[11px] font-medium text-ink-2" data-testid="kit-name-portfolio" title={doc.fileName}>
                  {doc.fileName}
                </p>
              ) : (
                <p className="mt-1 text-[9px] leading-relaxed text-faint">{DOC_HINT.portfolio}</p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => portfolioInput.current?.click()}
                  className={cx("btn h-6 px-1.5 text-[10px]", doc ? "btn-outline" : "btn-ghost text-muted")}
                  data-testid="kit-upload-portfolio"
                >
                  <Upload size={10} /> {doc ? "교체" : "파일"}
                </button>
                {doc && (
                  <button
                    type="button"
                    onClick={() => onRemoveDoc("portfolio")}
                    className="btn btn-ghost h-6 px-1 text-[9.5px] text-faint hover:text-risk"
                    data-testid="kit-remove-portfolio"
                  >
                    <X size={10} /> 빼기
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <Link2 size={9} className="shrink-0 text-faint" />
                <input
                  className="field field-sm h-6 py-0 text-[9.5px]"
                  value={kit.portfolioUrl}
                  onChange={(event) => onPortfolioUrl(event.target.value)}
                  placeholder="포트폴리오 링크 (선택)"
                  inputMode="url"
                  data-testid="kit-portfolio-url"
                  aria-label="포트폴리오 링크"
                />
                {kit.portfolioUrl && <Check size={10} className="shrink-0 text-accent" />}
              </div>
              <input
                ref={portfolioInput}
                type="file"
                accept={ACCEPT}
                className="hidden"
                data-testid="kit-file-portfolio"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onDocFile(file, "portfolio");
                  event.target.value = "";
                }}
              />
            </div>
          );
        })()}
      </div>

      {/* 3행 · 서류에서 뽑은 키워드 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line bg-paper-deep/25 px-3 py-1.5" data-testid="kit-keywords">
        <span className="text-[9px] text-faint">검색 키워드</span>
        {kit.keywords.length ? (
          kit.keywords.slice(0, 8).map((term) => (
            <span
              key={term}
              className="chip border border-line bg-surface text-[9.5px] text-ink-2"
              title={`${docOriginsOf(kit, term)}에서 확인된 말`}
              data-testid="kit-keyword"
            >
              {term}
            </span>
          ))
        ) : (
          <span className="text-[9.5px] text-muted">이력서를 올리면 서류에 적힌 직무 용어로 검색어를 만듭니다.</span>
        )}
        {keywords.length > 0 && (
          <span className="ml-auto hidden items-center gap-1 text-[9px] text-faint sm:flex" data-testid="kit-collect-hint">
            <SlidersHorizontal size={9} /> 실제 검색에는 {keywords.map((term) => `‘${term}’`).join(" · ")}
          </span>
        )}
      </div>

      {resumeBusy && (
        <div className="flex items-center gap-1.5 border-t border-line bg-paper-deep/50 px-3 py-1 text-[10px] text-muted" data-testid="resume-busy">
          <Loader2 size={10} className="animate-spin" /> {resumeBusy}
        </div>
      )}

      {/* 4행 · 프로필 요약 */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-line bg-paper-deep/25 px-3 py-1.5 text-[9.5px] leading-relaxed text-muted">
        <span className="min-w-0 max-w-full truncate" data-testid="career-summary">
          {profile.summary?.trim() || profileSummary(profile)}
        </span>
        {profile.keywords.length > 0 && (
          <span className="hidden min-w-0 truncate text-faint md:inline">
            · {profile.keywords.slice(0, 6).join(" · ")}
            {profile.keywords.length > 6 ? ` +${profile.keywords.length - 6}` : ""}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => multiInput.current?.click()}
            className="btn btn-ghost h-6 px-1.5 text-[9.5px] text-muted"
            data-testid="kit-upload-multi"
            title="이력서·자기소개서·포트폴리오를 한 번에 고르면 파일 이름으로 나눠 담습니다"
          >
            <Upload size={9} /> 서류 한 번에
          </button>
          {profile.exclude.length > 0 && (
            <span className="chip bg-risk-soft px-1.5 py-0 text-[9px] text-risk">
              <X size={8} /> 제외 {profile.exclude.slice(0, 2).join("·")}
            </span>
          )}
          <button type="button" onClick={onOpenProfile} className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted" data-testid="career-edit">
            <SlidersHorizontal size={10} /> {profileSaved ? "프로필 수정" : "프로필 설정"}
          </button>
        </span>
      </div>

      <input
        ref={multiInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        data-testid="kit-file-multi"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).slice(0, 3);
          files.forEach((file) => onDocFile(file));
          event.target.value = "";
        }}
      />

      <div className="border-t border-line px-3 py-1 text-[8.5px] leading-relaxed text-faint">
        서류는 이 브라우저 안에서만 읽습니다. 저장하는 것은 파일 이름·글자 수·추출한 요약과 키워드이고, 원문과 개인정보는 서버로 보내지 않습니다.
        {docCount > 0 && <span> · 서류에서 확인된 말만 지원 문구와 공고 대조에 씁니다.</span>}
      </div>
    </Card>
  );
}
