import { useState } from "react";

const storageKey = "jobfit.application-tracker.v1";
const stages = ["검토 중", "지원 예정", "지원 완료", "면접", "종료"] as const;
const statuses = ["미확인", "충족", "미충족"] as const;
const criteria = ["직무", "출퇴근", "연봉", "재택"] as const;
type Status = typeof statuses[number];
type Job = {
  id: string; company: string; role: string; url: string; deadline: string;
  stage: typeof stages[number]; notes: string; checks: Status[];
};

const field = "field w-full p-2 text-sm";
function load(): Job[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

export function JobTracker({ company, role, onBack }: { company: string; role: string; onBack: () => void }) {
  const [jobs, setJobs] = useState(load);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState(company);
  const [jobRole, setJobRole] = useState(role);
  const [url, setUrl] = useState("");

  function save(next: Job[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setJobs(next);
      setMessage("");
      return true;
    } catch {
      setMessage("브라우저에 저장할 수 없습니다. 저장 공간과 설정을 확인해 주세요.");
      return false;
    }
  }
  const update = (id: string, changes: Partial<Job>) =>
    save(jobs.map((job) => job.id === id ? { ...job, ...changes } : job));
  const visible = jobs.filter((job) => !filter || job.stage === filter)
    .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));

  return <section className="mx-auto max-w-5xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-bold">지원 공고 관리</h1>
      <button type="button" className="btn btn-outline" onClick={onBack}>지원 스튜디오</button>
    </div>
    <p className="text-sm text-muted">공고별로 내 조건과 지원 진행 상태를 기록하세요. 입력한 내용은 이 브라우저에 저장됩니다.</p>
    <form className="grid gap-2 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      if (!name.trim() || !jobRole.trim()) return;
      const link = safeUrl(url.trim());
      if (url.trim() && !link) { setMessage("공고 링크를 http 또는 https 주소로 입력해 주세요."); return; }
      if (link && jobs.some((job) => job.url === link)) { setMessage("이미 등록한 공고 링크입니다."); return; }
      const job: Job = { id: crypto.randomUUID(), company: name.trim(), role: jobRole.trim(), url: link,
        deadline: "", stage: "검토 중", notes: "", checks: criteria.map(() => "미확인") };
      if (save([...jobs, job])) { setName(""); setJobRole(""); setUrl(""); setFilter(""); }
    }}>
      <label className="text-sm">회사<input className={field} required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="text-sm">직무<input className={field} required value={jobRole} onChange={(event) => setJobRole(event.target.value)} /></label>
      <label className="text-sm">공고 링크 (선택)<input className={field} type="url" value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      <button className="btn btn-accent self-end" type="submit">공고 등록</button>
    </form>
    {message && <p role="status" className="text-sm">{message}</p>}
    <label className="block max-w-48 text-sm">진행 상태 필터<select className={field} value={filter} onChange={(event) => setFilter(event.target.value)}>
      <option value="">전체</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}
    </select></label>
    {!visible.length && <p className="text-sm text-muted">표시할 공고가 없습니다.</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {visible.map((job) => <article key={job.id} className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <h2 className="font-semibold">{job.company} · {job.role}</h2>
        {safeUrl(job.url) && <a className="text-sm underline" href={safeUrl(job.url)} target="_blank" rel="noreferrer">공고 원문</a>}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">진행 상태<select className={field} value={job.stage} onChange={(event) => update(job.id, { stage: event.target.value as Job["stage"] })}>
            {stages.map((stage) => <option key={stage}>{stage}</option>)}
          </select></label>
          <label className="text-xs">지원 마감<input type="date" className={field} value={job.deadline} onChange={(event) => update(job.id, { deadline: event.target.value })} /></label>
          {criteria.map((criterion, index) => <label key={criterion} className="text-xs">{criterion}<select className={field} value={job.checks[index]} onChange={(event) => {
            update(job.id, { checks: job.checks.map((status, position) => position === index ? event.target.value as Status : status) });
          }}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>)}
        </div>
        <label className="block text-xs">확인 근거·메모<textarea className={field} value={job.notes} rows={2} onChange={(event) => update(job.id, { notes: event.target.value })} /></label>
        <button type="button" className="btn btn-outline" onClick={() => {
          if (window.confirm(`${job.company} 공고를 삭제할까요?`)) save(jobs.filter((item) => item.id !== job.id));
        }}>공고 삭제</button>
      </article>)}
    </div>
  </section>;
}
