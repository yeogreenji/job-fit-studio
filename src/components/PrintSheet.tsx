import type { JobPackage } from "../types";
import { buildLocalIntro, buildLocalReverse, speakingSeconds } from "../lib/coach";

const dateText = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

export function PrintSheet({ pkg }: { pkg: JobPackage }) {
  const adopted = pkg.rewrites.filter((r) => r.adopted);
  const gaps = pkg.match.keywords.filter((k) => k.status !== "matched");
  const questions = pkg.questions.slice(0, 8);
  const intro = pkg.intro ?? buildLocalIntro(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match);
  const reverse = (pkg.reverse ?? buildLocalReverse(pkg.resumeSnapshot, pkg.jobSnapshot, pkg.match)).slice(0, 3);
  const feedback = (pkg.feedback ?? []).slice(0, 2);

  return (
    <div className="print-sheet" style={{ fontSize: 9.8, lineHeight: 1.5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111", paddingBottom: 8 }}>
        <div style={{ minWidth: 0, paddingRight: 14 }}>
          <div style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", color: "#666" }}>JobFit Studio · Interview prep sheet</div>
          <h1 style={{ fontSize: 20, margin: "4px 0 2px", letterSpacing: "-0.03em", wordBreak: "keep-all" }}>
            {pkg.company} — {pkg.role}
          </h1>
          <div style={{ fontSize: 9.5, color: "#555" }}>
            {pkg.resumeName} · {pkg.resumeHeadline} · 경력 {pkg.years}년 · {pkg.employmentType}
            {pkg.location ? ` · ${pkg.location}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{pkg.match.score}</div>
          <div style={{ fontSize: 9, color: "#555" }}>/100 · {pkg.match.grade.label}</div>
          <div style={{ fontSize: 8.5, color: "#777" }}>{dateText(pkg.createdAt)}</div>
          <div style={{ fontSize: 8, color: "#888" }}>{pkg.engine === "ai" ? `AI 분석${pkg.aiModel ? ` · ${pkg.aiModel}` : ""}` : "규칙 엔진"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 10 }}>
        {pkg.match.subs.map((sub) => (
          <div key={sub.id} style={{ border: "1px solid #ddd", borderRadius: 4, padding: "5px 7px" }}>
            <div style={{ fontSize: 8, color: "#777" }}>{sub.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{sub.score}</div>
            <div style={{ fontSize: 7.5, color: "#888" }}>{sub.note}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 11, margin: "14px 0 5px", borderBottom: "1px solid #ccc", paddingBottom: 3 }}>
        1분 자기소개 <span style={{ fontWeight: 400, fontSize: 8.5, color: "#777" }}>({intro.text.replace(/\s+/g, "").length}자 · 약 {speakingSeconds(intro.text)}초)</span>
      </h2>
      <p style={{ margin: 0, wordBreak: "keep-all" }}>{intro.text}</p>

      <h2 style={{ fontSize: 11, margin: "12px 0 5px", borderBottom: "1px solid #ccc", paddingBottom: 3 }}>마지막 역질문</h2>
      <ol style={{ margin: 0, paddingLeft: 16 }}>
        {reverse.map((item) => (
          <li key={item.id} style={{ marginBottom: 2.5 }}>
            {item.question}
          </li>
        ))}
      </ol>

      <h2 style={{ fontSize: 11, margin: "12px 0 5px", borderBottom: "1px solid #ccc", paddingBottom: 3 }}>핵심 어필</h2>
      <ol style={{ margin: 0, paddingLeft: 16 }}>
        {pkg.appeals.map((appeal) => (
          <li key={appeal.id} style={{ marginBottom: 4 }}>
            <strong>{appeal.title}</strong> — {appeal.body}
          </li>
        ))}
      </ol>

      <h2 style={{ fontSize: 11, margin: "12px 0 5px", borderBottom: "1px solid #ccc", paddingBottom: 3 }}>적합도 · 키워드</h2>
      <div style={{ fontSize: 9.5 }}>
        <div>
          <strong>조직 톤</strong> {pkg.match.tone.label} — {pkg.match.tone.summary}
        </div>
        <div style={{ marginTop: 3 }}>
          <strong>매칭</strong> {pkg.match.keywords.filter((k) => k.status === "matched").map((k) => k.label).join(" · ") || "—"}
        </div>
        <div style={{ marginTop: 2 }}>
          <strong>보완·미충족</strong>{" "}
          {gaps.length ? gaps.map((k) => `${k.label}(${k.status === "weak" ? "보완" : "미충족"})`).join(" · ") : "없음"}
        </div>
      </div>

      {adopted.length > 0 && (
        <>
          <h2 style={{ fontSize: 11, margin: "12px 0 5px", borderBottom: "1px solid #ccc", paddingBottom: 3 }}>경력 하이라이트</h2>
          <ul style={{ margin: 0, paddingLeft: 14 }}>
            {adopted.slice(0, 5).map((rewrite) => (
              <li key={rewrite.id} style={{ marginBottom: 2.5 }}>
                {rewrite.after}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 style={{ fontSize: 11, margin: "12px 0 5px", borderBottom: "1px solid #ccc", paddingBottom: 3 }}>예상 질문 & 답변 포인트</h2>
      <ol style={{ margin: 0, paddingLeft: 16 }}>
        {questions.map((q) => (
          <li key={q.id} style={{ marginBottom: 4 }}>
            <div style={{ fontWeight: 600 }}>
              [{q.category}] {q.question}
            </div>
            <div style={{ fontSize: 9, color: "#444" }}>S {q.star.situation}</div>
            <div style={{ fontSize: 9, color: "#444" }}>A {q.star.action}</div>
            <div style={{ fontSize: 9, color: "#444" }}>R {q.star.result}</div>
          </li>
        ))}
      </ol>

      {feedback.length > 0 && (
        <>
          <h2 style={{ fontSize: 11, margin: "12px 0 5px", borderBottom: "1px solid #ccc", paddingBottom: 3 }}>모의면접 피드백</h2>
          {feedback.map((item) => (
            <div key={item.id} style={{ marginBottom: 5 }}>
              <div style={{ fontWeight: 600 }}>
                {item.score}/100 · {item.seconds}초 · {item.question.slice(0, 60)}
              </div>
              <div style={{ fontSize: 9, color: "#444" }}>보완: {item.improvements.slice(0, 2).join(" / ")}</div>
              <div style={{ fontSize: 9, color: "#444" }}>꼬리질문: {item.followUp}</div>
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop: 14, borderTop: "1px solid #ddd", paddingTop: 6, fontSize: 8, color: "#888" }}>
        JobFit Studio로 생성한 참고 자료입니다. 모든 인물·기업 예시는 가상이며, 지원 전 사실관계와 수치를 다시 확인하세요.
      </div>
    </div>
  );
}
