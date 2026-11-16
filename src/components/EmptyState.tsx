import { ArrowRight, Briefcase, FileText, Gauge, Mic, PenLine, PlayCircle, Sparkles, Upload } from "lucide-react";
import type { JobPosting } from "../types";
import { SAMPLE_JOBS, SAMPLE_JOB_LABELS } from "../lib/presets";
import { Card, Eyebrow, cx } from "./ui";
import { FilePickButton } from "./ImportDialog";

const STEPS = [
  { icon: Gauge, title: "적합도·갭", desc: "키워드 매칭과 톤 비교" },
  { icon: PenLine, title: "경력 리라이트", desc: "공고 문구에 맞춘 diff" },
  { icon: Mic, title: "모의면접", desc: "90초 타이머·꼬리질문" },
  { icon: FileText, title: "1분 소개", desc: "자기소개·역질문" },
];

export function EmptyState({
  onSample,
  onBlank,
  onFile,
}: {
  onSample: (job: JobPosting) => void;
  onBlank: () => void;
  onFile: (file: File) => void;
}) {
  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="grid-paper relative px-5 pb-6 pt-7 sm:px-7">
          <div className="pointer-events-none absolute right-5 top-5 hidden h-16 w-16 rounded-2xl border border-accent/20 bg-accent-soft/70 sm:block">
            <div className="flex h-full items-center justify-center">
              <span className="num text-[20px] font-semibold text-accent-deep">JF</span>
            </div>
          </div>
          <Eyebrow>Job-fit package studio</Eyebrow>
          <h1 className="mt-2 max-w-[560px] text-[24px] font-semibold leading-[1.22] tracking-[-0.035em] text-ink sm:text-[27px]">
            내 이력서와 공고를 넣으면,
            <br className="hidden sm:block" /> 지원 패키지가 나옵니다.
          </h1>
          <p className="mt-2.5 max-w-[520px] text-[12px] leading-relaxed text-muted">
            적합도·갭 분석 → 공고 문구에 맞춘 경력기술서 리라이트 → 1분 자기소개·역질문 → 90초 모의면접 피드백 → 지원 현황·처우 협상까지.
            AI가 연결되면 서버에서 분석하고, 없으면 내장 엔진으로 그대로 동작합니다.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onBlank} className="btn btn-accent h-10 flex-1 text-[12.5px]" data-testid="start-blank">
              <FileText size={15} />
              내 이력서·공고 새로 입력하기
            </button>
            <FilePickButton
              label=".txt / .md 파일 불러오기"
              onFile={onFile}
              testId="empty-import"
              className="btn btn-outline h-10 flex-1 justify-center px-3 text-[12px]"
            />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[9.5px] leading-relaxed text-faint">
            <Upload size={10} className="shrink-0" />
            새로 입력하기를 누르면 예시가 모두 비워집니다. 입력한 내용은 이 브라우저에만 저장됩니다.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            {STEPS.map((step, index) => (
              <div key={step.title} className="rounded-xl border border-line bg-surface/85 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <step.icon size={12} className="text-accent" />
                  <span className="num text-[9px] font-semibold text-faint">0{index + 1}</span>
                  <span className="text-[10.5px] font-semibold text-ink">{step.title}</span>
                </div>
                <p className="mt-1 text-[9.5px] leading-relaxed text-muted">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-line px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
              <PlayCircle size={12} className="text-muted" /> 예시로 테스트하기
            </span>
            <span className="text-[9.5px] text-faint">가상 인물·기업 샘플입니다. 내 자료가 아니어도 전체 기능을 볼 수 있습니다.</span>
            <button type="button" onClick={onBlank} className="ml-auto btn btn-ghost h-6 px-2 text-[10px] text-muted">
              빈 공고로 직접 입력 <ArrowRight size={10} />
            </button>
          </div>

          <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
            {SAMPLE_JOBS.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => onSample(job)}
                className={cx(
                  "group rounded-xl border border-line bg-[#fcfcf9] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-[0_12px_30px_-24px_rgba(17,20,24,0.5)]",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <Briefcase size={11} className="text-faint group-hover:text-accent" />
                  <span className="chip bg-paper-deep px-1.5 py-0.5 text-[8.5px] text-muted">{SAMPLE_JOB_LABELS[job.id]}</span>
                </div>
                <div className="mt-1.5 text-[12px] font-semibold tracking-tight text-ink">{job.company}</div>
                <div className="text-[10.5px] text-muted">{job.role}</div>
                <div className="mt-1.5 flex items-center gap-1 text-[9px] text-faint">
                  {job.employmentType} · {job.location} · {job.deadline}
                </div>
                <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100">
                  이 예시로 생성 <ArrowRight size={10} />
                </div>
              </button>
            ))}
          </div>

          <p className="mt-3 text-[9.5px] leading-relaxed text-faint">
            예시를 눌러도 경력 원본은 지금 저장된 내 이력서를 그대로 씁니다. 왼쪽 ‘경력 원본’ 탭에서 예시 3종으로 바꿀 수 있습니다.
          </p>
        </div>
      </Card>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {[
          { title: "왜 키워드인가", body: "서류는 사람이 읽기 전에 검색과 필터를 지납니다. 공고가 반복하는 단어가 첫 관문입니다." },
          { title: "왜 리라이트인가", body: "같은 경험도 공고의 언어로 쓰면 읽는 사람의 판단이 달라집니다. 사실은 그대로 두고 순서만 바꿉니다." },
          { title: "왜 90초인가", body: "실전 면접의 답변은 길면 끊깁니다. 90초 안에 상황·행동·결과를 넣는 연습이 합격을 바꿉니다." },
        ].map((card) => (
          <Card key={card.title} className="p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
              <Sparkles size={11} className="text-accent" />
              {card.title}
            </div>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted">{card.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
