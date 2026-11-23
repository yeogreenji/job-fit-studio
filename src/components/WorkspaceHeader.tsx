import { useRef, useState } from "react";
import { BadgeCheck, FileText, Gauge, Loader2, PenLine, SlidersHorizontal, Upload, X } from "lucide-react";
import type { CareerProfile, MasterResume } from "../types";
import { profileSummary } from "../lib/career";
import { resumeBulletCount, resumeReady, type ResumeMeta } from "../lib/storage";
import { Card, cx } from "./ui";

/**
 * 작업대 머리 — 커리어 프로필과 이력서를 한 줄로 접어 둡니다.
 *
 * 예전 화면은 히어로 + 이력서 카드 + 프로필 카드 세 덩어리였습니다. 여기서는
 * ‘프로필 한 줄 + 이력서 한 줄’로 줄여, 첫 화면에서 바로 공고 보드가 보이게 합니다.
 * 이력서 파일을 끌어다 놓아도 같은 등록 절차를 탑니다.
 */
export function WorkspaceHeader({
  resume,
  resumeMeta,
  resumeBusy,
  onResumeFile,
  onOpenResume,
  onSampleResume,
  profile,
  profileSaved,
  onEditProfile,
}: {
  resume: MasterResume;
  resumeMeta: ResumeMeta | null;
  resumeBusy: string | null;
  onResumeFile: (file: File) => void;
  onOpenResume: () => void;
  onSampleResume: () => void;
  profile: CareerProfile;
  profileSaved: boolean;
  onEditProfile: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const ready = resumeReady(resume);
  const bullets = resumeBulletCount(resume);
  const sourceLabel =
    resumeMeta?.source === "file"
      ? resumeMeta.fileName ?? "파일"
      : resumeMeta?.source === "manual"
        ? "직접 입력"
        : resumeMeta?.source === "sample"
          ? "샘플 이력서"
          : "브라우저에 저장됨";

  return (
    <Card className="overflow-hidden" testId="career-strip">
      <div
        className={cx("flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2 transition-colors", drag && "bg-accent-soft/60")}
        data-testid="resume-drop"
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          const file = event.dataTransfer?.files?.[0];
          if (file) onResumeFile(file);
        }}
      >
        <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-md text-white", profileSaved ? "bg-accent" : "bg-ink/75")}>
          <Gauge size={12} />
        </span>
        <button
          type="button"
          onClick={onEditProfile}
          className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-paper-deep/60"
          data-testid="career-pill"
          title="커리어 프로필 열기"
        >
          <span className="truncate text-[12px] font-semibold tracking-[-0.01em] text-ink" data-testid="career-role-pill">
            {profile.role || "커리어 프로필 설정"}
          </span>
          <span className="shrink-0 text-[10.5px] text-muted">{profile.years !== null ? `경력 ${profile.years}년` : "연차 미입력"}</span>
          <span className="hidden shrink-0 text-[10px] text-faint sm:inline">{profile.keywords.length ? `키워드 ${profile.keywords.length}` : "키워드 없음"}</span>
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
        {!profileSaved && (
          <span className="hidden text-[10px] text-muted lg:inline">이력서를 올리면 직무·연차·키워드가 자동으로 채워집니다</span>
        )}

        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1.5" data-testid="resume-card">
          <FileText size={11} className="shrink-0 text-faint" aria-hidden />
          {ready ? (
            <>
              <span className="max-w-[150px] truncate text-[10.5px] font-medium text-ink-2" data-testid="resume-name">
                {resume.name || "이름 미입력"}
              </span>
              <span className="chip bg-accent-soft text-[9px] text-accent-deep" data-testid="resume-status">
                <BadgeCheck size={9} /> 등록됨
              </span>
              <span className="hidden max-w-[190px] truncate text-[9.5px] text-faint xl:inline">
                {sourceLabel} · 문장 {bullets}
              </span>
              <button type="button" onClick={onOpenResume} className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted" data-testid="resume-edit">
                <PenLine size={10} /> 편집
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline h-6 px-1.5 text-[10px]" data-testid="resume-replace">
                <Upload size={10} /> 교체
              </button>
              <button type="button" onClick={onSampleResume} className="btn btn-ghost h-6 px-1 text-[9.5px] text-faint">
                샘플
              </button>
            </>
          ) : (
            <>
              <span className="hidden text-[10px] text-muted sm:inline">이력서 · PDF/TXT를 끌어다 놓거나</span>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-primary h-7 px-2 text-[10.5px]" data-testid="resume-file-btn">
                <Upload size={10} /> 이력서 올리기
              </button>
              <button type="button" onClick={onOpenResume} className="btn btn-outline h-7 px-2 text-[10px]" data-testid="resume-manual">
                직접 입력
              </button>
              <button type="button" onClick={onSampleResume} className="btn btn-ghost h-7 px-1.5 text-[9.5px] text-faint" data-testid="resume-sample">
                샘플
              </button>
            </>
          )}
        </div>
      </div>

      {resumeBusy && (
        <div className="flex items-center gap-1.5 border-t border-line bg-paper-deep/50 px-3 py-1 text-[10px] text-muted" data-testid="resume-busy">
          <Loader2 size={10} className="animate-spin" /> {resumeBusy}
        </div>
      )}

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
          {profile.exclude.length > 0 && (
            <span className="chip bg-risk-soft px-1.5 py-0 text-[9px] text-risk">
              <X size={8} /> 제외 {profile.exclude.slice(0, 2).join("·")}
            </span>
          )}
          <button type="button" onClick={onEditProfile} className="btn btn-ghost h-6 px-1.5 text-[10px] text-muted" data-testid="career-edit">
            <SlidersHorizontal size={10} /> {profileSaved ? "프로필 수정" : "프로필 설정"}
          </button>
        </span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf,text/plain,application/pdf"
        className="hidden"
        data-testid="resume-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onResumeFile(file);
          event.target.value = "";
        }}
      />
    </Card>
  );
}
