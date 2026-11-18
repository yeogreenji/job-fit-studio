"""
JobFit Studio E2E 검증 — 공고 수집·직접 지원 허브.

검사 범위
  · /api/analyze: job_url(수집·제출서류·지원 링크·차단·사설망·키 없음), apply_kit, package, recommend, Gemini 경로
  · 화면: 여러 공고 URL 한 번에 수집 → 요건·제출서류·지원 문구 → 원문 직접 지원 링크 → 상태·메모 → 트래커
  · 보조: 면접·협상 심층 준비(패키지), 히스토리
  · 폴백: 차단 사이트 본문 붙여넣기, 키 없음(규칙 문안), 정적 호스팅(서버 없음)
  · 레이아웃: 390px 가로 넘침 0, 콘솔 에러 0, 개인정보 0건
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
server_by_port = {}


def check(name, cond, detail=""):
    ok = bool(cond)
    checks.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  <{detail}>"), flush=True)


def step(name, fn):
    started = time.time()
    print(f"── {name}", flush=True)
    try:
        fn()
    except Exception as exc:  # noqa: BLE001
        checks.append((name, False, f"exception: {type(exc).__name__}: {str(exc)[:240]}"))
        print(f"FAIL {name}  <exception: {type(exc).__name__}: {str(exc)[:200]}>", flush=True)
    finally:
        print(f"   ({time.time() - started:.1f}s)", flush=True)


def start_server(mode, port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            raise RuntimeError(f"port {port} already in use")
    except OSError:
        pass
    proc = subprocess.Popen([NODE, "scripts/e2e-server.mjs", mode, str(port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    servers.append(proc)
    server_by_port[port] = proc
    deadline = time.time() + 45
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return proc
        except OSError:
            time.sleep(0.3)
    raise RuntimeError(f"server {mode}:{port} did not start")


def stop_port(port):
    proc = server_by_port.pop(port, None)
    if not proc:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:
        proc.kill()
    if proc in servers:
        servers.remove(proc)


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


def hub_jobs(page):
    return page.evaluate("JSON.parse(localStorage.getItem('jobfit.hub.jobs.v1')||'[]')")


def packages(page):
    return page.evaluate("JSON.parse(localStorage.getItem('jobfit.packages.v1')||'[]')")


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


def wait_text(page, selector, needle, timeout=20000):
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        try:
            if needle in page.inner_text(selector):
                return True
        except Exception:  # noqa: BLE001
            pass
        page.wait_for_timeout(250)
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
    "company": "루멘스튜디오",
    "role": "PR 매니저",
    "responsibilities": "브랜드·작품 보도자료 작성과 언론 대응\n위기 이슈 대응 메시지와 공식 입장문 작성",
    "requirements": "PR 또는 커뮤니케이션 경력 5년 이상\n보도자료 작성과 미디어 대응 실무 경험",
    "preferred": "엔터테인먼트 산업 경험",
    "documents": "이력서 1부\n경력기술서 1부",
    "tone": "작품과 사람을 먼저 보는 팀",
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
check(
    "api modes include hub modes",
    {"job_url", "apply_kit", "package", "recommend"}.issubset(set(body.get("modes") or [])),
    str(body.get("modes")),
)
check("api urlFetch flag", body.get("urlFetch") is True, str(body.get("urlFetch")))
check("api CORS header", headers.get("Access-Control-Allow-Origin") == "*", str(headers.get("Access-Control-Allow-Origin")))
status, _, _ = api(4383, "OPTIONS")
check("api OPTIONS 204", status == 204, str(status))
status, body, _ = api(4383, "POST", {"mode": "nope"})
check("api bad mode 400", status == 400 and body["error"]["code"] == "bad_mode", str(body)[:120])
status, body, _ = api(4383, "POST", {"mode": "package", "job": {"company": "x"}, "resume": {}})
check("api bad job 400", status == 400 and body["error"]["code"] == "bad_job", str(body)[:120])

# job_url — 원티드(AI 정리, 지원 링크=공고 URL)
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "https://www.wanted.co.kr/wd/123456"})
job = body.get("job") or {}
check("job_url wanted 200", status == 200 and body.get("ok") is True, f"{status} {str(body)[:140]}")
check("job_url wanted engine ai", body.get("engine") == "ai" and body.get("model"), f"{body.get('engine')} {body.get('model')}")
check("job_url wanted company", job.get("company") == "노바커머스", str(job.get("company")))
check("job_url wanted role", job.get("role") == "브랜드 커뮤니케이션 매니저", str(job.get("role")))
check("job_url wanted responsibilities", "브랜드 캠페인" in (job.get("responsibilities") or ""), str(job.get("responsibilities"))[:120])
check("job_url wanted apply url fallback", job.get("applyUrl") == "https://www.wanted.co.kr/wd/123456", str(job.get("applyUrl")))
check("job_url wanted site", (body.get("meta") or {}).get("site") == "원티드", str(body.get("meta"))[:160])

# job_url — 잡코리아(제출서류·원문 지원 링크)
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "https://www.jobkorea.co.kr/Recruit/GI_Read/987654"})
job = body.get("job") or {}
check("job_url jobkorea 200", status == 200 and body.get("ok") is True, f"{status} {str(body)[:140]}")
check("job_url jobkorea company", job.get("company") == "루멘스튜디오", str(job.get("company")))
check("job_url jobkorea role", job.get("role") == "PR 매니저", str(job.get("role")))
check("job_url jobkorea documents", "이력서 1부" in (job.get("documents") or "") and "포트폴리오" in (job.get("documents") or ""), str(job.get("documents"))[:140])
check("job_url jobkorea requirements", "경력 5년 이상" in (job.get("requirements") or ""), str(job.get("requirements"))[:120])
check("job_url jobkorea deadline", "2026-11-30" in (job.get("deadline") or ""), str(job.get("deadline")))
check("job_url jobkorea apply url", job.get("applyUrl") == "https://www.jobkorea.co.kr/Recruit/Apply/987654", str(job.get("applyUrl")))
check("job_url jobkorea apply label", job.get("applyLabel") == "입사지원", str(job.get("applyLabel")))
check("job_url jobkorea site", (body.get("meta") or {}).get("site") == "잡코리아", str(body.get("meta"))[:160])

# job_url — 차단·잘못된 주소·사설망
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "https://blocked-careers.example/jobs/1"})
check("job_url blocked 422", status == 422 and body["error"]["code"] == "fetch_blocked", f"{status} {str(body)[:140]}")
check("job_url blocked site", (body.get("error") or {}).get("site") == "blocked-careers.example", str(body.get("error"))[:140])
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "not-a-url"})
check("job_url bad url", status in (400, 422) and body["error"]["code"] in ("bad_url", "fetch_failed"), f"{status} {str(body)[:120]}")
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "ftp://example.com/x"})
check("job_url bad protocol", status == 400 and body["error"]["code"] == "bad_url", f"{status} {str(body)[:120]}")
status, body, _ = api(4387, "POST", {"mode": "job_url", "jobUrl": "http://127.0.0.1:4383/fixture/job.html"})
check("job_url blocks private host", status == 400 and body["error"]["code"] == "bad_url", f"{status} {str(body)[:140]}")

# job_url — 키 없이 규칙 정리
status, body, _ = api(4385, "POST", {"mode": "job_url", "jobUrl": "https://www.jobkorea.co.kr/Recruit/GI_Read/987654"})
check("job_url works without key", status == 200 and body.get("engine") == "rule", f"{status} {str(body)[:140]}")
check("job_url rule documents", "이력서 1부" in (((body.get("job") or {}).get("documents")) or ""), str((body.get("job") or {}).get("documents"))[:120])
check("job_url rule apply url", (body.get("job") or {}).get("applyUrl") == "https://www.jobkorea.co.kr/Recruit/Apply/987654", str((body.get("job") or {}).get("applyUrl")))

# apply_kit
status, body, _ = api(4383, "POST", {"mode": "apply_kit", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD})
data = body.get("data") or {}
check("apply_kit 200", status == 200 and bool(data.get("oneLiner")), f"{status} {str(body)[:140]}")
check("apply_kit cover letter", len(data.get("coverLetter") or "") > 150, str(len(data.get("coverLetter") or "")))
check("apply_kit key points", len(data.get("keyPoints") or []) == 3, str(data.get("keyPoints"))[:120])
status, body, _ = api(4385, "POST", {"mode": "apply_kit", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD})
check("apply_kit no key 501", status == 501 and body["error"]["code"] == "no_key", f"{status} {str(body)[:120]}")

# package / recommend (심층 준비 계약 유지)
status, body, _ = api(4383, "POST", {"mode": "package", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD, "priorityLabel": "연봉 점프", "targetSalary": 5500})
data = body.get("data") or {}
check("package 200", status == 200 and bool(data.get("fit")), f"{status} {str(body)[:140]}")
check("package onePoint", bool((data.get("fit") or {}).get("onePoint", {}).get("body")), str((data.get("fit") or {}).get("onePoint"))[:120])
check("package question answer", bool((data.get("questions") or [{}])[0].get("answer")), str((data.get("questions") or [{}])[0])[:120])
check("package negotiation", "5,500" in ((data.get("negotiation") or {}).get("opener") or ""), str((data.get("negotiation") or {}).get("opener"))[:140])
status, body, _ = api(4383, "POST", {"mode": "recommend", "resume": RESUME_PAYLOAD, "priorityLabel": "연봉 점프"})
data = body.get("data") or {}
check("recommend 200", status == 200 and len(data.get("titles") or []) == 3, f"{status} {str(body)[:140]}")
status, body, _ = api(4386)
check("gemini status", status == 200 and body.get("provider") == "gemini" and body.get("model") == "gemini-3.5-flash-lite", f"{status} {str(body)[:140]}")
status, body, _ = api(4386, "POST", {"mode": "apply_kit", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD})
check("gemini apply_kit", status == 200 and body.get("provider") == "gemini" and bool((body.get("data") or {}).get("oneLiner")), f"{status} {str(body)[:140]}")
status, body, _ = api(4385, "POST", {"mode": "apply_kit", "apiKey": "AQ.real-user-gemini-key-0001", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD})
check("gemini request key apply_kit", status == 200 and body.get("provider") == "gemini", f"{status} {str(body)[:120]}")
status, _, _ = api(4384)
check("offline api 404", status == 404, str(status))

# 브라우저 단계에서는 서버를 하나씩만 띄워 프로세스 한도를 넘지 않게 합니다.
for port in (4384, 4385, 4386, 4387):
    stop_port(port)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ────────────────────────── 첫 화면 ──────────────────────────
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR", accept_downloads=True, permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.set_default_timeout(12000)
    attach(page, "ai")
    page.goto(AI, wait_until="domcontentloaded")
    page.wait_for_timeout(900)

    def first_screen():
        check("banner live", wait_attr(page, "[data-testid=mode-banner]", "data-mode", "live"))
        check("hub heading", page.get_by_text("지원은 한 곳에서").count() >= 1)
        check("multi url textarea", page.locator("[data-testid=hub-urls]").count() == 1)
        check("hub empty count", page.inner_text("[data-testid=hub-count]") == "0")
        check("hub fetch disabled when empty", page.locator("[data-testid=hub-fetch]").is_disabled())
        check("resume not registered", page.locator("[data-testid=resume-file-btn]").count() == 1)
        check("no score-first section", page.locator("[data-testid=section-fit]").count() == 0)
        check("no score wording", page.get_by_text("합격 가능성").count() == 0)
        check("detail empty state", page.get_by_text("공고를 모으면 여기에 지원 내용이 열립니다").count() == 1)

    step("first screen", first_screen)

    # ────────────────────────── 이력서 1회 등록 ──────────────────────────
    def resume_upload():
        page.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        page.wait_for_selector("[data-testid=resume-status]", timeout=15000)
        page.wait_for_timeout(600)
        check("resume registered", "등록됨" in page.inner_text("[data-testid=resume-status]"))
        check("resume name", page.inner_text("[data-testid=resume-name]") == "김하람")
        saved = page.evaluate("JSON.parse(localStorage.getItem('jobfit.resume.v1')||'{}')")
        check("resume persisted", len(saved.get("experiences") or []) == 2, str(len(saved.get("experiences") or [])))
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        check("resume reused after reload", page.inner_text("[data-testid=resume-name]") == "김하람")

    step("resume upload", resume_upload)

    # ────────────────────────── 여러 공고 한 번에 ──────────────────────────
    def multi_add():
        page.fill("[data-testid=hub-urls]", "https://www.jobkorea.co.kr/Recruit/GI_Read/987654\nhttps://www.wanted.co.kr/wd/123456")
        check("url count 2", "2" in page.inner_text("[data-testid=hub-url-count]"), page.inner_text("[data-testid=hub-url-count]"))
        page.click("[data-testid=hub-fetch]")
        page.wait_for_selector("[data-testid=hub-detail]", timeout=40000)
        deadline = time.time() + 30
        while time.time() < deadline and page.locator("[data-testid=hub-job]").count() < 2:
            page.wait_for_timeout(300)
        check("two job cards", page.locator("[data-testid=hub-job]").count() == 2, str(page.locator("[data-testid=hub-job]").count()))
        check("hub count 2", page.inner_text("[data-testid=hub-count]") == "2")
        jobs = hub_jobs(page)
        check("hub saved 2", len(jobs) == 2, str(len(jobs)))
        companies = {job["job"]["company"] for job in jobs}
        check("hub companies distinct", companies == {"루멘스튜디오", "노바커머스"}, str(companies))
        check("hub default status", all(job["status"] == "지원 전" for job in jobs), str([job["status"] for job in jobs]))
        check("hub apply urls saved", any(job["applyUrl"].endswith("/Recruit/Apply/987654") for job in jobs), str([job["applyUrl"] for job in jobs]))
        check("hub documents saved", any("이력서 1부" in (job["job"].get("documents") or "") for job in jobs), str([job["job"].get("documents") for job in jobs]))

    step("multi url add", multi_add)

    def jobkorea_detail():
        page.locator("[data-testid=hub-job]", has_text="루멘스튜디오").first.click()
        page.wait_for_timeout(500)
        check("detail company", page.inner_text("[data-testid=detail-company]") == "루멘스튜디오", page.inner_text("[data-testid=detail-company]"))
        check("detail role", "PR 매니저" in page.inner_text("[data-testid=detail-role]"), page.inner_text("[data-testid=detail-role]"))
        check("detail site", "잡코리아" in page.inner_text("[data-testid=detail-site]"), page.inner_text("[data-testid=detail-site]"))
        check("detail deadline", "2026-11-30" in page.inner_text("[data-testid=detail-deadline]"), page.inner_text("[data-testid=detail-deadline]"))
        check("req duties", "보도자료" in page.inner_text("[data-testid=req-responsibilities]"), page.inner_text("[data-testid=req-responsibilities]")[:100])
        check("req requirements", "경력 5년" in page.inner_text("[data-testid=req-requirements]"), page.inner_text("[data-testid=req-requirements]")[:100])
        check("req preferred", "엔터테인먼트" in page.inner_text("[data-testid=req-preferred]"), page.inner_text("[data-testid=req-preferred]")[:100])
        check("req documents list", page.locator("[data-testid=doc-item]").count() == 4, str(page.locator("[data-testid=doc-item]").count()))
        link = page.locator("[data-testid=apply-link]")
        check("apply link href", link.get_attribute("href") == "https://www.jobkorea.co.kr/Recruit/Apply/987654", str(link.get_attribute("href")))
        check("apply link new tab", link.get_attribute("target") == "_blank")

    step("jobkorea detail", jobkorea_detail)

    def apply_kit():
        check("draft source appears", page.locator("[data-testid=draft-source]").count() == 1)
        check("draft becomes AI", wait_text(page, "[data-testid=draft-source]", "AI 초안", 20000), page.inner_text("[data-testid=draft-source]"))
        one = page.inner_text("[data-testid=apply-one-liner]")
        check("one liner rendered", len(one) > 20, one[:80])
        cover = page.inner_text("[data-testid=apply-cover]")
        check("cover letter rendered", "루멘스튜디오" in cover or "보도자료" in cover, cover[:120])
        check("key points rendered", page.locator("[data-testid=apply-cover] ~ div li").count() >= 2 or page.get_by_text("강조할 경력 문장").count() == 1)
        check("grounding warning shown", "근거 확인 제외" in page.inner_text("[data-testid=hub-apply-kit]"), page.inner_text("[data-testid=hub-apply-kit]")[:160])
        body_text = page.inner_text("body")
        check("fabricated numbers absent", "777억" not in body_text and "999억" not in body_text)
        draft = next(job["draft"] for job in hub_jobs(page) if job["job"]["company"] == "루멘스튜디오")
        check("AI draft saved", draft.get("source") == "ai" and draft.get("model"), str(draft.get("source")))
        check("AI draft has cover", len(draft.get("coverLetter") or "") > 150, str(len(draft.get("coverLetter") or "")))
        check("AI draft warnings kept", (draft.get("warnings") or 0) > 0, str(draft.get("warnings")))

    step("apply kit", apply_kit)

    def copy_and_checklist():
        page.evaluate("navigator.clipboard.writeText('EMPTY')")
        page.locator("[data-testid=apply-one-liner] button:has-text('복사')").first.click()
        copied = ""
        for _ in range(20):
            copied = page.evaluate("navigator.clipboard.readText()")
            if copied and copied != "EMPTY":
                break
            page.wait_for_timeout(50)
        expected = page.inner_text("[data-testid=apply-one-liner]").replace("복사", "").strip()
        check("clipboard holds one liner", copied.strip() and copied.strip() in expected, repr(copied[:80]))
        page.locator("[data-testid=doc-item]").first.click()
        page.wait_for_timeout(400)
        job = next(job for job in hub_jobs(page) if job["job"]["company"] == "루멘스튜디오")
        check("document check saved", len(job.get("documentsChecked") or []) == 1, str(job.get("documentsChecked")))
        check("document check visual", page.locator("[data-testid=doc-item]").first.get_attribute("data-checked") == "true")

    step("copy and checklist", copy_and_checklist)

    def status_and_memo():
        page.click("[data-testid=status-2]")
        page.wait_for_timeout(500)
        check("status changed", page.inner_text("[data-testid=detail-status]") == "지원완료", page.inner_text("[data-testid=detail-status]"))
        job = next(job for job in hub_jobs(page) if job["job"]["company"] == "루멘스튜디오")
        check("status saved", job["status"] == "지원완료", job["status"])
        page.fill("[data-testid=job-memo]", "담당자 김 매니저 · 11/20 서류 결과 연락 예정")
        page.wait_for_timeout(500)
        job = next(job for job in hub_jobs(page) if job["job"]["company"] == "루멘스튜디오")
        check("memo saved", "김 매니저" in (job.get("memo") or ""), job.get("memo"))
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        check("hub persisted after reload", page.locator("[data-testid=hub-job]").count() == 2, str(page.locator("[data-testid=hub-job]").count()))
        check("detail after reload", page.inner_text("[data-testid=detail-company]") == "루멘스튜디오", page.inner_text("[data-testid=detail-company]"))
        check("memo after reload", "김 매니저" in page.input_value("[data-testid=job-memo]"), page.input_value("[data-testid=job-memo]"))
        check("status after reload", page.inner_text("[data-testid=detail-status]") == "지원완료")
        check("draft after reload", "AI 초안" in page.inner_text("[data-testid=draft-source]"))

    step("status and memo", status_and_memo)

    def second_job():
        page.locator("[data-testid=hub-job]", has_text="노바커머스").first.click()
        page.wait_for_timeout(1200)
        check("second detail company", page.inner_text("[data-testid=detail-company]") == "노바커머스", page.inner_text("[data-testid=detail-company]"))
        href = page.locator("[data-testid=apply-link]").get_attribute("href")
        check("second apply link", href == "https://www.wanted.co.kr/wd/123456", str(href))
        check("second draft exists", page.locator("[data-testid=apply-cover]").count() == 1)
        check("second no document checklist", page.locator("[data-testid=doc-checklist]").count() == 0)
        check("second documents hint", "제출서류 항목이 없습니다" in page.inner_text("[data-testid=req-documents]"), page.inner_text("[data-testid=req-documents]")[:100])
        check("mark applied shown", page.locator("[data-testid=mark-applied]").count() == 1 if page.inner_text("[data-testid=detail-status]") == "지원 전" else True)

    step("second job detail", second_job)

    # ────────────────────────── 심층 준비 (보조) ──────────────────────────
    def deep_prepare():
        page.click("[data-testid=deep-open]")
        page.wait_for_selector("[data-testid=result]", timeout=60000)
        page.wait_for_timeout(2500)
        check("deep section fit", page.locator("[data-testid=section-fit]").count() == 1)
        check("deep section interview", page.locator("[data-testid=section-interview]").count() == 1)
        check("deep section offer", page.locator("[data-testid=section-offer]").count() == 1)
        check("deep package saved", len(packages(page)) >= 1, str(len(packages(page))))
        check("deep intro ai", "AI 생성" in page.inner_text("[data-testid=intro-source]"), page.inner_text("[data-testid=intro-source]")[:60])
        page.click("[data-testid=new-job]")
        page.wait_for_timeout(700)
        check("deep back to hub", page.locator("[data-testid=hub-urls]").count() == 1)
        check("hub still has jobs", page.locator("[data-testid=hub-job]").count() == 2, str(page.locator("[data-testid=hub-job]").count()))

    step("deep prepare", deep_prepare)

    # ────────────────────────── 차단 → 본문 붙여넣기 ──────────────────────────
    def paste_fallback():
        page.fill("[data-testid=hub-urls]", "https://blocked-careers.example/jobs/1")
        page.click("[data-testid=hub-fetch]")
        page.wait_for_selector("[data-testid=hub-paste-panel]", timeout=30000)
        check("blocked progress shown", wait_text(page, "[data-testid=hub-progress]", "자동 수집을 막았습니다", 15000), page.inner_text("[data-testid=hub-progress]")[:120])
        page.fill("[data-testid=hub-paste-url]", "https://blocked-careers.example/jobs/1")
        page.fill("[data-testid=hub-paste-text]", open(os.path.join(FIXTURES, "my-job.txt"), encoding="utf-8").read())
        page.click("[data-testid=hub-paste-add]")
        page.wait_for_timeout(1000)
        check("pasted job added", page.locator("[data-testid=hub-job]").count() == 3, str(page.locator("[data-testid=hub-job]").count()))
        check("pasted source label", "본문 붙여넣기" in page.inner_text("[data-testid=detail-site]"), page.inner_text("[data-testid=detail-site]"))
        check("pasted apply link", page.locator("[data-testid=apply-link]").get_attribute("href") == "https://blocked-careers.example/jobs/1")
        check("pasted preview duties", "브랜드 캠페인" in page.inner_text("[data-testid=req-responsibilities]"), page.inner_text("[data-testid=req-responsibilities]")[:100])
        page.click("[data-testid=mark-applied]")
        page.wait_for_timeout(500)
        check("mark applied works", page.inner_text("[data-testid=detail-status]") == "지원완료", page.inner_text("[data-testid=detail-status]"))
        check("mark applied persisted", any(job["status"] == "지원완료" and job["source"]["kind"] == "paste" for job in hub_jobs(page)))

    step("paste fallback", paste_fallback)

    # ────────────────────────── 지원 현황 트래커 ──────────────────────────
    def tracker_view():
        page.click("[data-testid=nav-tracker]")
        page.wait_for_timeout(900)
        check("tracker 5 columns", page.locator("[data-testid^=tracker-column-]").count() == 5, str(page.locator("[data-testid^=tracker-column-]").count()))
        check("tracker 3 cards", page.locator("[data-testid=tracker-card]").count() == 3, str(page.locator("[data-testid=tracker-card]").count()))
        page.select_option("select[aria-label$='지원 상태']", "면접", timeout=10000)
        page.wait_for_timeout(700)
        check("tracker status saved", any(job["status"] == "면접" for job in hub_jobs(page)), str([job["status"] for job in hub_jobs(page)]))
        check("tracker apply link", page.get_by_role("link", name="원문 지원 링크").count() >= 1)
        page.click("[data-testid=nav-studio]")
        page.wait_for_timeout(700)
        check("back to hub from tracker", page.locator("[data-testid=hub-urls]").count() == 1)

    step("tracker view", tracker_view)

    def history_view():
        page.click("[data-testid=nav-history]")
        page.wait_for_timeout(800)
        check("history heading", page.get_by_text("지원 패키지 히스토리").count() == 1)
        check("history rows", page.get_by_title("비교 대상으로 선택").count() >= 1)
        page.click("[data-testid=nav-studio]")
        page.wait_for_timeout(500)
        check("history back to hub", page.locator("[data-testid=hub-urls]").count() == 1)

    step("history view", history_view)
    ctx.close()
    browser.close()

    # ────────────────────────── PDF 이력서 ──────────────────────────
    def pdf_resume():
        pb = p.chromium.launch()
        pdf_ctx = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
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
        pdf_ctx.close()
        pb.close()

    step("pdf resume", pdf_resume)
    stop_port(4383)

    # ────────────────────────── 키 없음 (규칙 문안) ──────────────────────────
    def nokey_mode():
        start_server("nokey", 4385)
        pb = p.chromium.launch()
        ctx3 = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p3 = ctx3.new_page()
        attach(p3, "nokey")
        p3.goto(NOKEY, wait_until="domcontentloaded")
        p3.wait_for_timeout(1200)
        check("nokey banner local", wait_attr(p3, "[data-testid=mode-banner]", "data-mode", "local"))
        check("nokey note", p3.get_by_text("규칙 엔진").count() > 0)
        p3.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        p3.wait_for_timeout(900)
        p3.fill("[data-testid=hub-urls]", "https://www.jobkorea.co.kr/Recruit/GI_Read/987654")
        p3.click("[data-testid=hub-fetch]")
        p3.wait_for_selector("[data-testid=hub-detail]", timeout=30000)
        p3.wait_for_timeout(1200)
        check("nokey job added", p3.locator("[data-testid=hub-job]").count() == 1)
        check("nokey rule draft", wait_text(p3, "[data-testid=draft-source]", "규칙 초안", 10000), p3.inner_text("[data-testid=draft-source]"))
        check("nokey no AI draft request", p3.locator("[data-testid=draft-busy]").count() == 0)
        cover = p3.inner_text("[data-testid=apply-cover]")
        check("nokey cover grounded", "보도자료" in cover or "루멘스튜디오" in cover, cover[:120])
        check("nokey apply link", p3.locator("[data-testid=apply-link]").get_attribute("href") == "https://www.jobkorea.co.kr/Recruit/Apply/987654")
        draft = hub_jobs(p3)[0].get("draft") or {}
        check("nokey draft saved rule", draft.get("source") == "rule", str(draft.get("source")))
        check("nokey no invented numbers", "999억" not in p3.inner_text("body") and "777억" not in p3.inner_text("body"))
        ctx3.close()
        pb.close()
        stop_port(4385)

    step("no-key mode", nokey_mode)

    # ────────────────────────── 서버 없음 (정적 호스팅) ──────────────────────────
    def offline_mode():
        start_server("offline", 4384)
        pb = p.chromium.launch()
        ctx4 = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p4 = ctx4.new_page()
        attach(p4, "offline")
        p4.goto(OFFLINE, wait_until="domcontentloaded")
        p4.wait_for_timeout(1200)
        check("offline banner local", wait_attr(p4, "[data-testid=mode-banner]", "data-mode", "local"))
        p4.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        p4.wait_for_timeout(900)
        p4.fill("[data-testid=hub-urls]", "https://www.wanted.co.kr/wd/123456")
        p4.click("[data-testid=hub-fetch]")
        p4.wait_for_selector("[data-testid=hub-paste-panel]", timeout=30000)
        check("offline fetch explains", wait_text(p4, "[data-testid=hub-progress]", "서버", 15000), p4.inner_text("[data-testid=hub-progress]")[:140])
        p4.fill("[data-testid=hub-paste-url]", "https://www.wanted.co.kr/wd/123456")
        p4.fill("[data-testid=hub-paste-text]", open(os.path.join(FIXTURES, "my-job.txt"), encoding="utf-8").read())
        p4.click("[data-testid=hub-paste-add]")
        p4.wait_for_timeout(1000)
        check("offline paste works", p4.locator("[data-testid=hub-job]").count() == 1, str(p4.locator("[data-testid=hub-job]").count()))
        check("offline rule draft", wait_text(p4, "[data-testid=draft-source]", "규칙 초안", 10000), p4.inner_text("[data-testid=draft-source]"))
        check("offline apply link", p4.locator("[data-testid=apply-link]").get_attribute("href") == "https://www.wanted.co.kr/wd/123456", str(p4.locator("[data-testid=apply-link]").count()))
        ctx4.close()
        pb.close()
        stop_port(4384)

    step("offline hosting", offline_mode)

    # ────────────────────────── Gemini 서버 키 모드 ──────────────────────────
    def gemini_mode():
        start_server("gemini", 4386)
        pb = p.chromium.launch()
        ctx6 = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p6 = ctx6.new_page()
        attach(p6, "gemini")
        p6.goto(GEMINI, wait_until="domcontentloaded")
        p6.wait_for_timeout(1200)
        check("gemini banner live", wait_attr(p6, "[data-testid=mode-banner]", "data-mode", "live"))
        check("gemini banner model", "gemini-3.5-flash-lite" in p6.inner_text("[data-testid=mode-banner]"))
        p6.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        p6.wait_for_timeout(900)
        p6.fill("[data-testid=hub-urls]", "https://www.jobkorea.co.kr/Recruit/GI_Read/987654")
        p6.click("[data-testid=hub-fetch]")
        p6.wait_for_selector("[data-testid=hub-detail]", timeout=30000)
        check("gemini draft AI", wait_text(p6, "[data-testid=draft-source]", "AI 초안", 25000), p6.inner_text("[data-testid=draft-source]"))
        p6.click("[data-testid=deep-open]")
        p6.wait_for_selector("[data-testid=result]", timeout=60000)
        p6.wait_for_timeout(2000)
        check("gemini deep AI", "AI 분석" in p6.inner_text("[data-testid=package-engine]"))
        check("gemini deep intro AI", "AI 생성" in p6.inner_text("[data-testid=intro-source]"))
        ctx6.close()
        pb.close()
        stop_port(4386)

    step("gemini mode", gemini_mode)

    # ────────────────────────── 모바일 390px ──────────────────────────
    def mobile():
        start_server("ai", 4383)
        pb = p.chromium.launch()
        mctx = pb.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
        mp = mctx.new_page()
        attach(mp, "mobile")
        mp.goto(AI, wait_until="domcontentloaded")
        mp.wait_for_timeout(1200)
        check("mobile no overflow (hub)", no_overflow(mp), str(mp.evaluate("document.documentElement.scrollWidth")))
        check("mobile url textarea", mp.locator("[data-testid=hub-urls]").count() == 1)
        mp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        mp.wait_for_timeout(1000)
        mp.fill("[data-testid=hub-urls]", "https://www.jobkorea.co.kr/Recruit/GI_Read/987654")
        mp.click("[data-testid=hub-fetch]")
        mp.wait_for_selector("[data-testid=hub-detail]", timeout=30000)
        mp.wait_for_timeout(1200)
        check("mobile no overflow (detail)", no_overflow(mp), str(mp.evaluate("document.documentElement.scrollWidth")))
        check("mobile requirements", mp.locator("[data-testid=req-documents]").count() == 1)
        check("mobile apply link", mp.locator("[data-testid=apply-link]").count() == 1)
        mp.click("[data-testid=status-1]")
        mp.wait_for_timeout(400)
        check("mobile no overflow (status)", no_overflow(mp))
        mp.click("[data-testid=nav-tracker]")
        mp.wait_for_timeout(900)
        check("mobile tracker cards", mp.locator("[data-testid=tracker-card]").count() >= 1)
        check("mobile no overflow (tracker)", no_overflow(mp), str(mp.evaluate("document.documentElement.scrollWidth")))
        mctx.close()
        pb.close()
        stop_port(4383)

    step("mobile 390px", mobile)

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
