"""
JobFit Studio E2E 검증 — URL·이력서 중심 재설계.

검사 범위
  · /api/analyze: job_url(수집·차단·사설망·키 없음), recommend, package, interview_eval, Gemini 경로
  · 화면: 이력서 1회 등록(.txt/.md/.pdf) → 공고 URL → 우선순위 → 지원 패키지 → 복사·90초 연습
  · 폴백: 스크래핑 차단 시 본문 붙여넣기, 키 없음, 정적 호스팅(서버 없음)
  · 레이아웃: 390px 가로 넘침 0, 콘솔 에러 0
"""

import os, json, subprocess, sys, time, socket, atexit, urllib.request, urllib.error
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
os.environ["LD_LIBRARY_PATH"] = "/workspace/.libs/usr/lib/x86_64-linux-gnu" + ((":" + os.environ["LD_LIBRARY_PATH"]) if os.environ.get("LD_LIBRARY_PATH") else "")
from playwright.sync_api import sync_playwright

ROOT = "/workspace/projects/job-fit-studio"
NODE = "/workspace/.tools/node-v22.12.0-linux-x64/bin/node"
FIXTURES = os.path.join(ROOT, "scripts/fixtures")

checks = []
errors = []
servers = []


def check(name, cond, detail=""):
    ok = bool(cond)
    checks.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  <{detail}>"), flush=True)


def step(name, fn):
    print(f"── {name}", flush=True)
    try:
        fn()
    except Exception as exc:  # noqa: BLE001
        checks.append((name, False, f"exception: {type(exc).__name__}: {str(exc)[:200]}"))
        print(f"FAIL {name}  <exception: {type(exc).__name__}: {str(exc)[:180]}>", flush=True)


def start_server(mode, port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            raise RuntimeError(f"port {port} already in use")
    except OSError:
        pass
    proc = subprocess.Popen([NODE, "scripts/e2e-server.mjs", mode, str(port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    servers.append(proc)
    deadline = time.time() + 45
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return proc
        except OSError:
            time.sleep(0.3)
    raise RuntimeError(f"server {mode}:{port} did not start")


def stop_servers():
    for proc in servers:
        proc.terminate()
    for proc in servers:
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


atexit.register(stop_servers)


def attach(page, tag):
    def on_console(msg):
        if msg.type in ("error", "warning") and "/api/analyze" not in msg.text and "Failed to load resource" not in msg.text:
            errors.append(f"[{tag}:console:{msg.type}] {msg.text}")

    page.on("console", on_console)
    page.on("pageerror", lambda exc: errors.append(f"[{tag}:pageerror] {exc}"))


def packages(page):
    return page.evaluate("JSON.parse(localStorage.getItem('jobfit.packages.v1')||'[]')")


def tracker(page):
    return page.evaluate("JSON.parse(localStorage.getItem('jobfit.tracker.v1')||'[]')")


def prefs(page):
    return page.evaluate("JSON.parse(localStorage.getItem('jobfit.prefs.v1')||'{}')")


def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0


def wait_attr(page, selector, attr, value, timeout=15000):
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        got = page.get_attribute(selector, attr)
        if got == value:
            return True
        page.wait_for_timeout(200)
    return False


def api(port, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/analyze", data=data, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode() or "{}"), dict(res.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode() or "{}"), dict(exc.headers)


RESUME_PAYLOAD = {
    "experiences": [
        {
            "company": "노바커머스",
            "role": "브랜드 커뮤니케이션 매니저",
            "period": "2021.03 – 현재",
            "bullets": [
                "브랜드 캠페인 8건을 기획·실행해 자사몰 신규 방문 28% 증가를 만들었습니다.",
                "위기 이슈 2건에 대응해 공식 입장문을 작성하고 24시간 내 배포했습니다.",
            ],
        }
    ]
}

JOB_PAYLOAD = {
    "company": "노바커머스",
    "role": "브랜드 커뮤니케이션 매니저",
    "responsibilities": "브랜드 캠페인 기획과 실행\n인플루언서 협업 운영",
    "requirements": "경력 4년 이상\nSNS 채널 운영 실무",
    "preferred": "커머스 산업 경험",
    "tone": "빠른 실험",
}

AI = "http://127.0.0.1:4383/"
OFFLINE = "http://127.0.0.1:4384/"
NOKEY = "http://127.0.0.1:4385/"
GEMINI = "http://127.0.0.1:4386/"
STRICT = "http://127.0.0.1:4387/"

start_server("ai", 4383)
start_server("offline", 4384)
start_server("nokey", 4385)
start_server("gemini", 4386)
start_server("strict", 4387)

# ─────────────────────────────── API 계약 ───────────────────────────────
print("── API", flush=True)
status, body, headers = api(4383)
check("api GET status", status == 200 and body.get("ok") is True and body.get("ai") is True, str(body)[:120])
check("api modes include job_url", "job_url" in (body.get("modes") or []) and "recommend" in (body.get("modes") or []), str(body.get("modes")))
check("api urlFetch flag", body.get("urlFetch") is True, str(body.get("urlFetch")))
check("api CORS header", headers.get("Access-Control-Allow-Origin") == "*", str(headers.get("Access-Control-Allow-Origin")))
status, _, _ = api(4383, "OPTIONS")
check("api OPTIONS 204", status == 204, str(status))
status, body, _ = api(4383, "POST", {"mode": "nope"})
check("api bad mode 400", status == 400 and body["error"]["code"] == "bad_mode", str(body)[:120])
status, body, _ = api(4383, "POST", {"mode": "package", "job": {"company": "x"}, "resume": {}})
check("api bad job 400", status == 400 and body["error"]["code"] == "bad_job", str(body)[:120])

# job_url — AI 정리
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "https://www.wanted.co.kr/wd/123456"})
job = body.get("job") or {}
check("job_url 200", status == 200 and body.get("ok") is True, f"{status} {str(body)[:140]}")
check("job_url engine ai", body.get("engine") == "ai" and body.get("model"), f"{body.get('engine')} {body.get('model')}")
check("job_url company", job.get("company") == "노바커머스", str(job.get("company")))
check("job_url role", job.get("role") == "브랜드 커뮤니케이션 매니저", str(job.get("role")))
check("job_url responsibilities 4 lines", len([line for line in (job.get("responsibilities") or "").split("\n") if line.strip()]) == 4, str(job.get("responsibilities"))[:120])
check("job_url requirements", "경력 4년 이상" in (job.get("requirements") or ""), str(job.get("requirements"))[:120])
check("job_url meta site", (body.get("meta") or {}).get("site") == "원티드", str(body.get("meta"))[:160])
check("job_url meta chars", (body.get("meta") or {}).get("chars", 0) > 300, str((body.get("meta") or {}).get("chars")))

# job_url — 차단된 사이트
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "https://blocked-careers.example/jobs/1"})
check("job_url blocked 422", status == 422 and body["error"]["code"] == "fetch_blocked", f"{status} {str(body)[:140]}")
check("job_url blocked site", (body.get("error") or {}).get("site") == "blocked-careers.example", str(body.get("error"))[:140])

# job_url — 잘못된 주소와 사설망
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "not-a-url"})
check("job_url bad url", status in (400, 422) and body["error"]["code"] in ("bad_url", "fetch_failed"), f"{status} {str(body)[:120]}")
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "ftp://example.com/x"})
check("job_url bad protocol", status == 400 and body["error"]["code"] == "bad_url", f"{status} {str(body)[:120]}")
status, body, _ = api(4387, "POST", {"mode": "job_url", "jobUrl": "http://127.0.0.1:4383/fixture/job.html"})
check("job_url blocks private host", status == 400 and body["error"]["code"] == "bad_url", f"{status} {str(body)[:140]}")

# job_url — 키 없이 규칙 정리
status, body, _ = api(4385, "POST", {"mode": "job_url", "jobUrl": "https://www.wanted.co.kr/wd/123456"})
check("job_url works without key", status == 200 and body.get("engine") == "rule", f"{status} {str(body)[:140]}")
check("job_url rule company", (body.get("job") or {}).get("company") == "노바커머스", str((body.get("job") or {}).get("company")))
check("job_url rule sections", "브랜드 캠페인" in ((body.get("job") or {}).get("responsibilities") or ""), str((body.get("job") or {}).get("responsibilities"))[:120])

# recommend
status, body, _ = api(4383, "POST", {"mode": "recommend", "resume": RESUME_PAYLOAD, "priorityLabel": "연봉 점프"})
data = body.get("data") or {}
check("recommend 200", status == 200 and len(data.get("titles") or []) == 3, f"{status} {str(body)[:140]}")
check("recommend salary band", (data.get("salaryBand") or {}).get("min", 0) > 0 and (data.get("salaryBand") or {}).get("basis"), str(data.get("salaryBand"))[:120])
check("recommend targets", len(data.get("targets") or []) == 3, str(data.get("targets"))[:120])
status, body, _ = api(4385, "POST", {"mode": "recommend", "resume": RESUME_PAYLOAD})
check("recommend no key 501", status == 501 and body["error"]["code"] == "no_key", f"{status} {str(body)[:120]}")

# package
status, body, _ = api(4383, "POST", {"mode": "package", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD, "priorityLabel": "연봉 점프", "targetSalary": 5500})
data = body.get("data") or {}
check("package 200", status == 200 and bool(data.get("fit")), f"{status} {str(body)[:140]}")
check("package onePoint", bool((data.get("fit") or {}).get("onePoint", {}).get("body")), str((data.get("fit") or {}).get("onePoint"))[:120])
check("package question answer", bool((data.get("questions") or [{}])[0].get("answer")), str((data.get("questions") or [{}])[0])[:120])
check("package negotiation", "5,500" in ((data.get("negotiation") or {}).get("opener") or ""), str((data.get("negotiation") or {}).get("opener"))[:140])

# interview_eval
status, body, _ = api(4383, "POST", {"mode": "interview_eval", "question": "위기 이슈를 어떻게 대응하나요?", "answer": "당시 위기 이슈가 터졌고 제가 먼저 입장문 초안을 작성해 24시간 내 배포했습니다."})
check("eval 200", status == 200 and (body.get("data") or {}).get("score") is not None, f"{status} {str(body)[:120]}")

# Gemini 경로
status, body, _ = api(4386)
check("gemini status", status == 200 and body.get("provider") == "gemini" and body.get("model") == "gemini-3.5-flash-lite", f"{status} {str(body)[:140]}")
status, body, _ = api(4386, "POST", {"mode": "job_url", "jobUrl": "https://www.wanted.co.kr/wd/123456"})
check("gemini job_url", status == 200 and body.get("provider") == "gemini" and (body.get("job") or {}).get("company") == "노바커머스", f"{status} {str(body)[:140]}")
status, body, _ = api(4385, "POST", {"mode": "package", "apiKey": "AQ.real-user-gemini-key-0001", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD})
check("gemini AQ request key", status == 200 and body.get("provider") == "gemini", f"{status} {str(body)[:120]}")
status, _, _ = api(4384)
check("offline api 404", status == 404, str(status))


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ────────────────────────── 첫 화면 (이력서 없음) ──────────────────────────
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR", accept_downloads=True, permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.set_default_timeout(12000)
    attach(page, "ai")
    page.goto(AI, wait_until="domcontentloaded")
    page.wait_for_timeout(900)

    def first_screen():
        check("banner live", wait_attr(page, "[data-testid=mode-banner]", "data-mode", "live"))
        check("resume not registered", page.locator("[data-testid=resume-file-btn]").count() == 1)
        check("resume prompt copy", page.get_by_text("한 번만").count() > 0)
        check("no recommend before resume", page.get_by_text("이력서를 등록하면").count() > 0)
        check("job url input", page.locator("[data-testid=job-url]").count() == 1)
        check("generate disabled", page.locator("[data-testid=generate]").is_disabled())
        check("hint asks resume", "내 인력서" in page.inner_text("[data-testid=generate-hint]") or "내 이력서" in page.inner_text("[data-testid=generate-hint]"))
        check("priority chips 4", page.get_by_role("radio").count() == 4, str(page.get_by_role("radio").count()))

    step("first screen", first_screen)

    # ────────────────────────── 이력서 1회 등록 ──────────────────────────
    def resume_upload():
        page.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        page.wait_for_selector("[data-testid=resume-status]", timeout=15000)
        page.wait_for_timeout(600)
        check("resume registered", "등록됨" in page.inner_text("[data-testid=resume-status]"))
        check("resume name", page.inner_text("[data-testid=resume-name]") == "김하람")
        meta = page.evaluate("JSON.parse(localStorage.getItem('jobfit.resume.meta.v1')||'{}')")
        check("resume meta file", meta.get("source") == "file" and meta.get("fileName") == "my-resume.txt", str(meta))
        saved = page.evaluate("JSON.parse(localStorage.getItem('jobfit.resume.v1')||'{}')")
        check("resume persisted", isinstance(saved.get("experiences"), list) and len(saved["experiences"]) == 2, str(len(saved.get("experiences") or [])))
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        check("resume reused after reload", page.locator("[data-testid=resume-status]").count() == 1 and page.inner_text("[data-testid=resume-name]") == "김하람")

    step("resume upload", resume_upload)

    def recommend_panel():
        page.wait_for_selector("[data-testid=recommend-title-0]", timeout=12000)
        check("recommend 3 titles", page.locator("[data-testid^=recommend-title-]").count() == 3)
        check("recommend targets", page.locator("[data-testid^=recommend-target-]").count() == 3)
        links = page.locator("[data-testid=search-원티드]")
        check("search links wanted", links.count() == 3 and "wanted.co.kr" in (links.first.get_attribute("href") or ""), links.first.get_attribute("href"))
        linkedin = page.locator("[data-testid=search-링크드인]").first.get_attribute("href") or ""
        check("search links linkedin", "linkedin.com/jobs" in linkedin, linkedin)
        check("salary band labelled estimate", page.get_by_text("추정").count() >= 1)
        page.locator("[data-testid=recommend-refresh]").click()
        page.wait_for_timeout(2500)
        check("recommend AI source", "AI 추천" in page.inner_text("[data-testid=recommend]"), page.inner_text("[data-testid=recommend]")[-80:])

    step("recommend panel", recommend_panel)

    # ────────────────────────── 공고 URL ──────────────────────────
    def job_url():
        page.fill("[data-testid=job-url]", "https://www.wanted.co.kr/wd/123456")
        page.click("[data-testid=job-fetch]")
        page.wait_for_selector("[data-testid=job-preview]", timeout=25000)
        page.wait_for_timeout(500)
        check("job preview company", "노바커머스" in page.inner_text("[data-testid=job-preview-company]"))
        check("job preview role", "브랜드 커뮤니케이션" in page.inner_text("[data-testid=job-preview-role]"))
        check("job preview summary", "담당 업무 4줄" in page.inner_text("[data-testid=job-preview-summary]"), page.inner_text("[data-testid=job-preview-summary]"))
        check("job source site", "원티드" in page.inner_text("[data-testid=job-preview]"))
        check("generate enabled", not page.locator("[data-testid=generate]").is_disabled())

    step("job url fetch", job_url)

    def priority_and_salary():
        page.click("[data-testid=priority-balance]")
        page.wait_for_timeout(300)
        check("priority selected", page.get_attribute("[data-testid=priority-balance]", "aria-checked") == "true")
        check("priority others off", page.get_attribute("[data-testid=priority-salary]", "aria-checked") == "false")
        page.fill("[data-testid=target-salary]", "5500")
        page.wait_for_timeout(400)
        saved = prefs(page)
        check("prefs saved", saved.get("priority") == "balance" and saved.get("targetSalary") == 5500, str(saved))

    step("priority chips", priority_and_salary)

    # ────────────────────────── 지원 패키지 ──────────────────────────
    def generate():
        page.click("[data-testid=generate]")
        page.wait_for_selector("[data-testid=result]", timeout=45000)
        page.wait_for_timeout(2500)
        check("engine chip AI", "AI 분석" in page.inner_text("[data-testid=package-engine]"), page.inner_text("[data-testid=package-engine]"))
        check("source chip", "원티드" in page.inner_text("[data-testid=result-source]"))
        pkg = packages(page)[0]
        check("package saved", len(packages(page)) == 1)
        check("package priority", pkg.get("priority") == "balance", str(pkg.get("priority")))
        check("package source url", (pkg.get("source") or {}).get("kind") == "url", str(pkg.get("source")))
        check("package negotiation target", "5,500" in ((pkg.get("negotiation") or {}).get("opener") or ""), str((pkg.get("negotiation") or {}).get("opener"))[:100])
        check("fabricated rewrite dropped", all("999억" not in r["after"] for r in pkg["rewrites"]))
        check("fabricated number absent", "999억" not in page.inner_text("body"))

    step("generate package", generate)

    def sections():
        check("section fit", page.locator("[data-testid=section-fit]").count() == 1)
        check("section pitch", page.locator("[data-testid=section-pitch]").count() == 1)
        check("section interview", page.locator("[data-testid=section-interview]").count() == 1)
        check("section offer", page.locator("[data-testid=section-offer]").count() == 1)
        check("one point strategy", page.locator("[data-testid=one-point]").count() == 1)
        check("intro ai", "AI 생성" in page.inner_text("[data-testid=intro-source]"), page.inner_text("[data-testid=intro-source]"))
        length_text = page.inner_text("[data-testid=intro-length]")
        chars = int("".join(ch for ch in length_text.split("자")[0] if ch.isdigit()) or 0)
        check("intro length 250-900", 250 <= chars <= 900, length_text)
        check("intro quotes source", any(token in page.inner_text("[data-testid=intro-text]") for token in ["28%", "140건", "4.2만"]), page.inner_text("[data-testid=intro-text]")[:120])
        check("highlight copy", page.get_by_role("button", name="전체 복사").count() >= 1)
        check("score ring", page.locator("svg circle").count() >= 1)

    step("result sections", sections)

    def drills():
        check("5 question cards", page.locator("[data-testid^=drill-]:not([data-testid*=timer]):not([data-testid*=text]):not([data-testid*=start]):not([data-testid*=submit]):not([data-testid*=feedback]):not([data-testid*=score]):not([data-testid*=answer])").count() == 5)
        check("model answer present", page.inner_text("[data-testid=drill-answer-0]").strip() != "")
        check("avoid answer present", "피해야 할 답변" in page.inner_text("[data-testid=drill-0]"))
        pkg = packages(page)[0]
        answers = [q.get("answer") for q in pkg["questions"][:5]]
        check("all questions have script", all(answers) and len(answers) == 5, str([bool(a) for a in answers]))
        check("ai answers used", [q.get("answerSource") for q in pkg["questions"][:5]] == ["ai"] * 5, str([q.get("answerSource") for q in pkg["questions"][:5]]))

    step("question scripts", drills)

    def timer():
        check("timer starts 01:30", page.inner_text("[data-testid=drill-timer-0]") == "01:30")
        page.click("[data-testid=drill-start-0]")
        page.wait_for_timeout(2600)
        timer_text = page.inner_text("[data-testid=drill-timer-0]")
        left = int(timer_text.split(":")[0]) * 60 + int(timer_text.split(":")[1])
        check("timer counts down", 0 < left < 90, timer_text)
        answer = "당시 위기 이슈가 터졌고 제가 먼저 입장문 초안을 작성해 24시간 내 배포했습니다. 이후 대응 매뉴얼을 만들었습니다."
        page.fill("[data-testid=drill-text-0]", answer)
        page.click("[data-testid=drill-submit-0]")
        page.wait_for_selector("[data-testid=drill-feedback-0]", timeout=25000)
        page.wait_for_timeout(500)
        check("feedback score", page.inner_text("[data-testid=drill-score-0]").strip().replace("점", "").isdigit(), page.inner_text("[data-testid=drill-score-0]"))
        check("follow-up question", len(page.inner_text("[data-testid=drill-feedback-0]")) > 40)
        fb = packages(page)[0].get("feedback") or []
        check("feedback saved", len(fb) == 1 and fb[0].get("source") == "ai", str(len(fb)))
        check("fabricated praise dropped", "777억" not in page.inner_text("body"))

    step("90s timer and feedback", timer)

    def offer():
        check("reverse 3", page.locator("[data-testid^=reverse-]").count() == 3)
        check("negotiation block", page.locator("[data-testid=negotiation]").count() == 1)
        text = page.inner_text("[data-testid=negotiation]")
        check("negotiation shows target", "5,500만원" in text, text[:120])
        check("negotiation priority label", "워라밸" in page.inner_text("[data-testid=section-offer]"), page.inner_text("[data-testid=section-offer]")[:120])
        check("non-salary cards", "비연봉 카드" in text)
        check("negotiation copy", page.get_by_role("button", name="전체 복사").count() >= 2)

    step("offer section", offer)

    def copy_button():
        button = page.locator("[data-testid=section-pitch] button:has-text('소개 복사')").first
        clipboard = page.evaluate("navigator.clipboard.writeText('EMPTY')")
        button.click()
        copied = ""
        for _ in range(20):
            copied = page.evaluate("navigator.clipboard.readText()")
            if copied and copied != "EMPTY":
                break
            page.wait_for_timeout(50)
        intro = page.inner_text("[data-testid=intro-text]")
        check("clipboard holds intro", copied.strip()[:40] == intro.strip()[:40], repr(copied[:60]))
        hint = page.locator("[data-testid=section-pitch] button:has-text('복사')").first.inner_text()
        check("copy button keeps label", "복사" in hint, hint)

    step("copy button", copy_button)

    def export_md():
        with page.expect_download() as dl:
            page.click("[data-testid=export-md]")
        content = open(dl.value.path(), encoding="utf-8").read()
        check("markdown length", len(content) > 3000, str(len(content)))
        for section in ["적합도 요약", "원포인트 전략", "1분 자기소개", "처우 · 연봉 협상 스크립트", "모범 답변 스크립트", "피해야 할 답변", "제출 전 체크리스트"]:
            check(f"markdown has {section}", section in content)
        check("markdown source", "원티드" in content)
        check("markdown target salary", "5,500만원" in content)
        check("markdown no fabricated", "999억" not in content)

    step("export markdown", export_md)

    def regenerate():
        page.click("[data-testid=regenerate]")
        page.wait_for_timeout(4000)
        check("regenerate stays AI", "AI 분석" in page.inner_text("[data-testid=package-engine]"))
        check("regenerate keeps intro", packages(page)[0]["intro"]["source"] == "ai")

    step("regenerate with AI", regenerate)

    def tracker_view():
        pending = tracker(page)
        check("tracker auto entry", len(pending) == 1 and pending[0]["company"] == "노바커머스", str(pending)[:120])
        page.click("[data-testid=open-tracker]")
        page.wait_for_timeout(800)
        check("tracker rows", page.locator("[data-testid=tracker-row]").count() == 1)
        page.select_option("select[aria-label$='진행 단계']", "1차")
        page.wait_for_timeout(600)
        check("tracker stage saved", tracker(page)[0]["stage"] == "1차")
        page.locator("input[aria-label='희망 연봉(만원)']").fill("5500")
        page.wait_for_timeout(500)
        check("tracker salary saved", tracker(page)[0]["salary"]["hope"] == 5500, str(tracker(page)[0]["salary"]))
        page.click("[data-testid=nav-studio]")
        page.wait_for_timeout(600)
        check("back to result", page.locator("[data-testid=result]").count() == 1)

    step("tracker view", tracker_view)

    def history_view():
        page.click("[data-testid=nav-history]")
        page.wait_for_timeout(800)
        check("history rows", page.get_by_title("비교 대상으로 선택").count() == 1)
        page.click("[data-testid=nav-studio]")
        page.wait_for_timeout(500)

    step("history view", history_view)

    def new_job():
        page.click("[data-testid=new-job]")
        page.wait_for_timeout(700)
        check("new job keeps resume", page.locator("[data-testid=resume-status]").count() == 1)
        check("new job clears url", page.locator("[data-testid=job-url]").input_value() == "")
        check("new job clears package", page.get_by_text("이력서는 한 번만").count() > 0)

    step("new job flow", new_job)

    # ────────────────────────── 붙여넣기 폴백 ──────────────────────────
    def paste_fallback():
        page.fill("[data-testid=job-url]", "https://blocked-careers.example/jobs/1")
        page.click("[data-testid=job-fetch]")
        page.wait_for_selector("[data-testid=job-fetch-error]", timeout=20000)
        check("blocked error shown", "자동 수집을 막았습니다" in page.inner_text("[data-testid=job-fetch-error]"), page.inner_text("[data-testid=job-fetch-error]")[:120])
        check("paste panel auto opened", page.locator("[data-testid=job-paste]").count() == 1)
        check("paste panel open after block", page.locator("[data-testid=job-paste]").count() == 1)
        with open(os.path.join(FIXTURES, "my-job.txt"), encoding="utf-8") as handle:
            page.fill("[data-testid=job-paste]", handle.read())
        page.click("[data-testid=job-paste-analyze]")
        page.wait_for_selector("[data-testid=job-preview]", timeout=15000)
        page.wait_for_timeout(400)
        check("paste preview company", "노바커머스" in page.inner_text("[data-testid=job-preview-company]"))
        check("paste source label", "붙여넣은 본문" in page.inner_text("[data-testid=job-preview]"), page.inner_text("[data-testid=job-preview]")[:60])
        page.click("[data-testid=generate]")
        page.wait_for_selector("[data-testid=result]", timeout=45000)
        page.wait_for_timeout(1500)
        check("paste package source", "본문 붙여넣기" in page.inner_text("[data-testid=result-source]"))
        page.click("[data-testid=new-job]")
        page.wait_for_timeout(500)

    step("paste fallback", paste_fallback)

    # ────────────────────────── PDF 이력서 ──────────────────────────
    def pdf_resume():
        pdf_ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        pp = pdf_ctx.new_page()
        attach(pp, "pdf")
        pp.goto(AI, wait_until="domcontentloaded")
        pp.wait_for_timeout(900)
        pp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.pdf"))
        pp.wait_for_selector("[data-testid=resume-status]", timeout=20000)
        pp.wait_for_timeout(500)
        check("pdf resume registered", "등록됨" in pp.inner_text("[data-testid=resume-status]"))
        check("pdf resume name", pp.inner_text("[data-testid=resume-name]") == "김하람", pp.inner_text("[data-testid=resume-name]"))
        saved = pp.evaluate("JSON.parse(localStorage.getItem('jobfit.resume.v1')||'{}')")
        bullets = [b["text"] for exp in saved.get("experiences", []) for b in exp.get("bullets", [])]
        check("pdf bullets extracted", any("28%" in b for b in bullets), str(bullets)[:140])
        meta = pp.evaluate("JSON.parse(localStorage.getItem('jobfit.resume.meta.v1')||'{}')")
        check("pdf meta file", meta.get("fileName") == "my-resume.pdf", str(meta)[:120])
        pdf_ctx.close()

    step("pdf resume", pdf_resume)

    # ────────────────────────── 키 없음 (규칙 모드) ──────────────────────────
    def nokey_mode():
        ctx3 = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p3 = ctx3.new_page()
        attach(p3, "nokey")
        p3.goto(NOKEY, wait_until="domcontentloaded")
        p3.wait_for_timeout(1200)
        check("nokey banner local", wait_attr(p3, "[data-testid=mode-banner]", "data-mode", "local"))
        check("nokey note", p3.get_by_text("규칙 엔진").count() > 0)
        p3.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        p3.wait_for_timeout(900)
        p3.fill("[data-testid=job-url]", "https://www.wanted.co.kr/wd/123456")
        p3.click("[data-testid=job-fetch]")
        p3.wait_for_selector("[data-testid=job-preview]", timeout=20000)
        check("nokey url fetch works", "노바커머스" in p3.inner_text("[data-testid=job-preview-company]"))
        p3.fill("[data-testid=target-salary]", "5200")
        p3.click("[data-testid=generate]")
        p3.wait_for_selector("[data-testid=result]", timeout=30000)
        p3.wait_for_timeout(1200)
        check("nokey rule engine", "규칙 엔진" in p3.inner_text("[data-testid=package-engine]"))
        check("nokey rule intro", "규칙 생성" in p3.inner_text("[data-testid=intro-source]"))
        length_text = p3.inner_text("[data-testid=intro-length]")
        chars = int("".join(ch for ch in length_text.split("자")[0] if ch.isdigit()) or 0)
        check("rule intro 250-320", 250 <= chars <= 320, length_text)
        pkg = packages(p3)[0]
        check("nokey questions have script", all(q.get("answer") for q in pkg["questions"][:5]))
        check("nokey negotiation target", "5,200" in ((pkg.get("negotiation") or {}).get("opener") or ""), str((pkg.get("negotiation") or {}).get("opener"))[:100])
        first_opener = pkg["negotiation"]["opener"]
        first_reverse = pkg["reverse"][0]["question"]
        first_intro = pkg["intro"]["text"]
        # 우선순위를 바꾸면 협상·역질문·자기소개 마무리가 달라져야 합니다
        p3.click("[data-testid=new-job]")
        p3.wait_for_timeout(500)
        p3.fill("[data-testid=job-url]", "https://www.wanted.co.kr/wd/123456")
        p3.click("[data-testid=job-fetch]")
        p3.wait_for_selector("[data-testid=job-preview]", timeout=20000)
        p3.click("[data-testid=priority-growth]")
        p3.wait_for_timeout(300)
        p3.click("[data-testid=generate]")
        p3.wait_for_selector("[data-testid=result]", timeout=30000)
        p3.wait_for_timeout(1200)
        second = packages(p3)[0]
        check("priority changes opener", second["negotiation"]["opener"] != first_opener, f"{first_opener[:40]} / {second['negotiation']['opener'][:40]}")
        check("priority changes reverse", second["reverse"][0]["question"] != first_reverse, second["reverse"][0]["question"][:60])
        check("priority changes intro close", second["intro"]["text"] != first_intro)
        check("priority growth wording", "역할" in second["negotiation"]["opener"] or "권한" in second["reverse"][0]["question"], second["negotiation"]["opener"][:60])
        p3.fill("[data-testid=drill-text-0]", "당시 프로젝트에서 제가 직접 캠페인을 기획해 참여율을 12%에서 18%로 올렸습니다.")
        p3.click("[data-testid=drill-submit-0]")
        p3.wait_for_selector("[data-testid=drill-feedback-0]", timeout=20000)
        check("nokey rule feedback", "규칙 피드백" in p3.inner_text("[data-testid=drill-feedback-0]"))
        ctx3.close()

    step("no-key mode", nokey_mode)

    # ────────────────────────── 서버 없음 (정적 호스팅) ──────────────────────────
    def offline_mode():
        ctx4 = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p4 = ctx4.new_page()
        attach(p4, "offline")
        p4.goto(OFFLINE, wait_until="domcontentloaded")
        p4.wait_for_timeout(1200)
        check("offline banner local", wait_attr(p4, "[data-testid=mode-banner]", "data-mode", "local"))
        p4.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        p4.wait_for_timeout(900)
        p4.fill("[data-testid=job-url]", "https://www.wanted.co.kr/wd/123456")
        p4.click("[data-testid=job-fetch]")
        p4.wait_for_selector("[data-testid=job-fetch-error]", timeout=20000)
        check("offline url fetch explains", "서버" in p4.inner_text("[data-testid=job-fetch-error]"), p4.inner_text("[data-testid=job-fetch-error]")[:140])
        check("offline paste panel opens", p4.locator("[data-testid=job-paste]").count() == 1)
        with open(os.path.join(FIXTURES, "my-job.txt"), encoding="utf-8") as handle:
            p4.fill("[data-testid=job-paste]", handle.read())
        p4.click("[data-testid=job-paste-analyze]")
        p4.wait_for_selector("[data-testid=job-preview]", timeout=15000)
        p4.click("[data-testid=generate]")
        p4.wait_for_selector("[data-testid=result]", timeout=30000)
        p4.wait_for_timeout(1000)
        check("offline works with rule engine", "규칙 엔진" in p4.inner_text("[data-testid=package-engine]"))
        check("offline tracker auto entry", len(tracker(p4)) == 1)
        ctx4.close()

    step("offline hosting", offline_mode)

    # ────────────────────────── Gemini 서버 키 모드 ──────────────────────────
    def gemini_mode():
        ctx6 = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p6 = ctx6.new_page()
        attach(p6, "gemini")
        p6.goto(GEMINI, wait_until="domcontentloaded")
        p6.wait_for_timeout(1200)
        check("gemini banner live", wait_attr(p6, "[data-testid=mode-banner]", "data-mode", "live"))
        check("gemini banner model", "gemini-3.5-flash-lite" in p6.inner_text("[data-testid=mode-banner]"))
        p6.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        p6.wait_for_timeout(900)
        p6.fill("[data-testid=job-url]", "https://www.wanted.co.kr/wd/123456")
        p6.click("[data-testid=job-fetch]")
        p6.wait_for_selector("[data-testid=job-preview]", timeout=25000)
        p6.click("[data-testid=generate]")
        p6.wait_for_selector("[data-testid=result]", timeout=40000)
        p6.wait_for_timeout(2000)
        check("gemini package AI", "AI 분석" in p6.inner_text("[data-testid=package-engine]"))
        check("gemini intro AI", "AI 생성" in p6.inner_text("[data-testid=intro-source]"))
        ctx6.close()

    step("gemini mode", gemini_mode)

    # ────────────────────────── 모바일 390px ──────────────────────────
    def mobile():
        mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
        mp = mctx.new_page()
        attach(mp, "mobile")
        mp.goto(AI, wait_until="domcontentloaded")
        mp.wait_for_timeout(1200)
        check("mobile no overflow (setup)", no_overflow(mp), str(mp.evaluate("document.documentElement.scrollWidth")))
        check("mobile resume CTA visible", mp.locator("[data-testid=resume-file-btn]").count() == 1)
        check("mobile url input", mp.locator("[data-testid=job-url]").count() == 1)
        mp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        mp.wait_for_timeout(1000)
        check("mobile no overflow (resume)", no_overflow(mp))
        mp.fill("[data-testid=job-url]", "https://www.wanted.co.kr/wd/123456")
        mp.click("[data-testid=job-fetch]")
        mp.wait_for_selector("[data-testid=job-preview]", timeout=25000)
        mp.wait_for_timeout(500)
        check("mobile no overflow (job)", no_overflow(mp))
        mp.click("[data-testid=generate]")
        mp.wait_for_selector("[data-testid=result]", timeout=40000)
        mp.wait_for_timeout(2000)
        check("mobile no overflow (result)", no_overflow(mp), str(mp.evaluate("document.documentElement.scrollWidth")))
        check("mobile section fit", mp.locator("[data-testid=section-fit]").count() == 1)
        mp.locator("[data-testid=drill-1] button").first.click()
        mp.wait_for_timeout(300)
        mp.click("[data-testid=drill-start-1]")
        mp.wait_for_timeout(600)
        check("mobile no overflow (drill)", no_overflow(mp))
        mp.click("[data-testid=nav-tracker]")
        mp.wait_for_timeout(900)
        check("mobile tracker view", mp.locator("[data-testid=tracker-row]").count() >= 1)
        check("mobile no overflow (tracker)", no_overflow(mp))
        mctx.close()

    step("mobile 390px", mobile)

    browser.close()

# ─────────────────────────────── 개인정보 0건 ───────────────────────────────
print("── 개인정보 검사", flush=True)
forbidden = ["안지현", "yeoseo", "@gmail.com", "010-7180", "하이브월드와이드", "드림어스", "비마이프렌즈", "천호동", "지현"]
privacy_hits = []
scan_roots = [os.path.join(ROOT, "src"), os.path.join(ROOT, "api"), os.path.join(ROOT, "public"), os.path.join(ROOT, "index.html"), os.path.join(ROOT, "README.md")]
for root in scan_roots:
    targets = [root] if os.path.isfile(root) else [os.path.join(dp, f) for dp, _, fs in os.walk(root) for f in fs]
    for path in targets:
        if not path.endswith((".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".md", ".json")):
            continue
        try:
            text = open(path, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError):
            continue
        for token in forbidden:
            if token in text:
                privacy_hits.append(f"{os.path.relpath(path, ROOT)}: {token}")
check("no personal data in shipped code", not privacy_hits, "; ".join(privacy_hits[:5]))

print("CHECKS")
failed = [name for name, ok, _ in checks if not ok]
for name, ok, detail in checks:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  <{detail}>"))
print(f"SUMMARY {len(checks) - len(failed)}/{len(checks)} passed")
print("ERRORS:", len(errors))
for err in errors[:20]:
    print(err)
sys.exit(0 if not failed and not errors else 1)
