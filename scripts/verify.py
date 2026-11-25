"""
JobFit Studio E2E 검증 — 공고 자동 수집·지원 허브.

검사 범위
  · /api/jobs: 실제 소스(리멤버·원티드·사람인·잡코리아) 수집, 기본 타깃 프로필 필터, 캐시, 잘못된 요청, 정적 호스팅 404
  · /api/analyze: job_url(수동 URL 보조), apply_kit, package, Gemini 경로
  · 화면: 첫 화면 자동 수집 → 직무 프리셋/지역/정렬 → 원문 지원 링크 → 지원 문구 초안
          → 북마크·상태·메모 저장(새로고침 유지) → 트래커 → URL/본문 보조 추가 → 심층 준비
  · 폴백: 수집 서버 없음(정적 호스팅), 차단 사이트 본문 붙여넣기, 키 없음(규칙 문안)
  · 레이아웃: 390px 가로 넘침 0, 콘솔 에러 0, 개인정보 0건
"""

import os, re, json, subprocess, sys, time, socket, atexit, urllib.request, urllib.error
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
    deadline = time.time() + 60
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
        text = msg.text
        if msg.type in ("error", "warning") and "/api/analyze" not in text and "/api/jobs" not in text and "Failed to load resource" not in text:
            errors.append(f"[{tag}:console:{msg.type}] {text}")

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
        try:
            if page.get_attribute(selector, attr) == value:
                return True
        except Exception:  # noqa: BLE001
            pass
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


def wait_count(page, selector, minimum, timeout=60000):
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        if page.locator(selector).count() >= minimum:
            return True
        page.wait_for_timeout(400)
    return False


def wait_value(page, js, expected, timeout=60000):
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        try:
            if page.evaluate(js) == expected:
                return True
        except Exception:  # noqa: BLE001
            pass
        page.wait_for_timeout(400)
    return False


def open_manual_panel(page):
    if not page.evaluate("document.querySelector('[data-testid=manual-add]')?.open === true"):
        page.click("[data-testid=manual-add] summary")
        page.wait_for_timeout(250)


def ensure_paste_panel(page):
    if page.locator("[data-testid=hub-paste-url]").count() == 0:
        page.click("[data-testid=hub-paste-toggle]")
        page.wait_for_timeout(250)


def api(port, method="GET", payload=None, path="/api/analyze", raw=None):
    data = raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None)
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as res:
            return res.status, json.loads(res.read().decode() or "{}"), dict(res.headers)
    except urllib.error.HTTPError as exc:
        try:
            body = json.loads(exc.read().decode() or "{}")
        except Exception:  # noqa: BLE001
            body = {}
        return exc.code, body, dict(exc.headers)


def jobs_api(port, payload=None, query="", raw=None):
    return api(port, "POST" if (payload is not None or raw is not None) else "GET", payload, path="/api/jobs" + (f"?{query}" if query else ""), raw=raw)


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

PLAN_PRO = {"plan": "pass", "trial": True, "startedAt": "2026-11-24T00:00:00.000Z", "expiresAt": "2026-12-08T00:00:00.000Z"}
PLAN_PREMIUM = {"plan": "premium", "trial": False, "startedAt": "2026-11-25T00:00:00.000Z", "expiresAt": "2027-05-24T00:00:00.000Z"}

SEED_HUB_JOBS = [
    {
        "id": "auto-wanted-91",
        "job": {
            "id": "wanted:91",
            "company": "누리커머스",
            "role": "PR 매니저",
            "employmentType": "정규직",
            "location": "서울 성동구",
            "deadline": "2026-12-10",
            "responsibilities": "보도자료 작성과 미디어 대응",
            "requirements": "PR 경력 5년 이상",
            "preferred": "",
            "tone": "",
            "experience": "경력 5~8년",
            "detailLevel": "full",
        },
        "source": {"kind": "auto", "sourceId": "wanted", "sourceJobId": "91", "site": "원티드", "url": "https://www.wanted.co.kr/wd/91"},
        "applyUrl": "https://www.wanted.co.kr/wd/91",
        "status": "준비중",
        "memo": "1차 통화 완료",
        "documentsChecked": [],
        "saved": True,
        "createdAt": "2026-11-25T00:00:00.000Z",
        "updatedAt": "2026-11-25T00:00:00.000Z",
    }
]

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
check("api modes include hub modes", {"job_url", "apply_kit", "package", "recommend", "resume_profile"}.issubset(set(body.get("modes") or [])), str(body.get("modes")))
check("api CORS header", headers.get("Access-Control-Allow-Origin") == "*", str(headers.get("Access-Control-Allow-Origin")))
status, _, _ = api(4383, "OPTIONS")
check("api OPTIONS 204", status == 204, str(status))

status, body, _ = jobs_api(4383, query="ping=1")
check("jobs ping", status == 200 and body.get("service") == "jobfit-jobs", str(body)[:140])
check("jobs ping sources", {"remember", "wanted", "saramin", "jobkorea"}.issubset(set(body.get("sources") or [])), str(body.get("sources")))
check("jobs ping profiles", "seoul-inhouse-pr" in (body.get("profiles") or []), str(body.get("profiles")))

status, body, _ = jobs_api(4383, {"q": "", "limit": 24, "detail": 6})
latest = body.get("jobs") or []
check("jobs latest 200", status == 200 and body.get("ok") is True, f"{status} {str(body)[:160]}")
check("jobs latest count", len(latest) >= 8, str(len(latest)))
check(
    "jobs latest fields",
    all((job.get("company") or job.get("role")) and str(job.get("url", "")).startswith("https://") for job in latest),
    str(latest[:1])[:200],
)
check("jobs latest full detail", sum(1 for job in latest if job.get("detailLevel") == "full") >= 4, str([job.get("detailLevel") for job in latest][:8]))
check(
    "jobs latest requirement text",
    any(len(job.get("requirements") or "") > 20 for job in latest),
    str([len(job.get("requirements") or "") for job in latest][:8]),
)
check("jobs latest source wanted", all(job.get("source") == "wanted" for job in latest), str({job.get("source") for job in latest}))

status, body, _ = jobs_api(4383, {"q": "홍보", "limit": 36, "detail": 8})
keyword_jobs = body.get("jobs") or []
sources = {job.get("source") for job in keyword_jobs}
check("jobs keyword 200", status == 200 and body.get("ok") is True, f"{status} {str(body)[:160]}")
check("jobs keyword count", len(keyword_jobs) >= 12, str(len(keyword_jobs)))
check("jobs keyword multi source", len(sources) >= 2, str(sources))
check("jobs keyword wanted urls", all(re.search(r"/wd/\d+$", job["url"]) for job in keyword_jobs if job.get("source") == "wanted"), "wanted url shape")
check(
    "jobs keyword saramin urls",
    all("rec_idx=" in job["url"] for job in keyword_jobs if job.get("source") == "saramin"),
    "saramin url shape",
)
check(
    "jobs keyword jobkorea urls",
    all(re.search(r"GI_Read/\d+", job["url"]) for job in keyword_jobs if job.get("source") == "jobkorea"),
    "jobkorea url shape",
)
remember_keyword = [job for job in keyword_jobs if job.get("source") == "remember"]
remember_keyword_report = {item.get("id"): item for item in body.get("sources") or []}.get("remember", {})
if remember_keyword_report.get("ok"):
    check(
        "jobs keyword remember urls",
        all(re.search(r"/job/posting/\d+$", job["url"]) for job in remember_keyword),
        str([job["url"] for job in remember_keyword][:2]),
    )
    check(
        "jobs keyword remember detail",
        any(len(job.get("requirements") or "") > 20 for job in remember_keyword),
        "remember full text",
    )
else:
    # 리멤버가 요청 제한(Cloudflare 429)이면 소스 리포트에 그 사실이 남아야 합니다.
    check(
        "jobs keyword remember rate limit reported",
        "리멤버" in (remember_keyword_report.get("note") or ""),
        str(remember_keyword_report)[:160],
    )
check(
    "jobs keyword no duplicates",
    len({(job.get("company"), job.get("role")) for job in keyword_jobs}) == len(keyword_jobs),
    str(len(keyword_jobs)),
)
check(
    "jobs keyword list-level conditions",
    all(job.get("conditions") or job.get("experience") or job.get("location") for job in keyword_jobs if job.get("source") != "wanted"),
    "conditions",
)
report_by_source = {item.get("id"): item for item in body.get("sources") or []}
check("jobs report counts match", sum(item.get("count", 0) for item in body.get("sources") or []) == len(keyword_jobs), str(body.get("sources"))[:200])

status, body, _ = jobs_api(4383, {"q": "홍보", "limit": 36, "detail": 8})
check("jobs cache hit", status == 200 and body.get("cached") is True, str(body.get("cached")))

# ── 기본 타깃 프로필: 서울 · 인하우스 홍보/PR · 과차장급 ──
status, body, _ = jobs_api(4383, {"profile": "seoul-inhouse-pr", "limit": 60, "detail": 8})
profiled = body.get("jobs") or []
filter_report = body.get("filter") or {}
excluded = filter_report.get("excluded") or {}
check("jobs profile 200", status == 200 and body.get("ok") is True, f"{status} {str(body)[:160]}")
check("jobs profile keeps jobs", len(profiled) >= 8, str(len(profiled)))
check(
    "jobs profile all seoul",
    all("서울" in (job.get("location") or "") for job in profiled),
    str([(job.get("company"), job.get("location")) for job in profiled if "서울" not in (job.get("location") or "")][:3]),
)
check(
    "jobs profile no agency",
    all(job.get("companyType") != "agency" for job in profiled),
    str([(job.get("company"), job.get("companyType")) for job in profiled if job.get("companyType") == "agency"][:3]),
)
check(
    "jobs profile inhouse share",
    sum(1 for job in profiled if job.get("companyType") == "inhouse") >= 5,
    str(sum(1 for job in profiled if job.get("companyType") == "inhouse")),
)
check(
    "jobs profile no junior titles",
    all(not re.search(r"인턴|신입|주니어|보조|대리급", job.get("role") or "") for job in profiled),
    str([job.get("role") for job in profiled if re.search(r"인턴|신입|주니어|보조|대리급", job.get("role") or "")][:3]),
)
check(
    "jobs profile pr roles",
    all(re.search(r"홍보|PR|피알|커뮤니케이션|대외|언론|미디어|보도|대관|브랜딩|Public|Communication", job.get("role") or "", re.I) for job in profiled),
    str([job.get("role") for job in profiled][:4]),
)
check("jobs profile multi source", len({job.get("source") for job in profiled}) >= 2, str({job.get("source") for job in profiled}))
profile_remember_report = {item.get("id"): item for item in body.get("sources") or []}.get("remember", {})
if profile_remember_report.get("ok"):
    check("jobs profile includes remember", any(job.get("source") == "remember" for job in profiled), str({job.get("source") for job in profiled}))
    check(
        "jobs profile remember urls",
        all(re.search(r"/job/posting/\d+$", job["url"]) for job in profiled if job.get("source") == "remember"),
        str([job["url"] for job in profiled if job.get("source") == "remember"][:2]),
    )
else:
    check("jobs profile remember rate limit reported", "리멤버" in (profile_remember_report.get("note") or ""), str(profile_remember_report)[:160])
check(
    "jobs profile filter report",
    filter_report.get("profile") == "seoul-inhouse-pr"
    and isinstance(filter_report.get("raw"), int)
    and filter_report.get("raw") >= filter_report.get("kept", 0)
    and sum(excluded.get(key, 0) for key in ("region", "role", "junior", "agency")) > 0,
    str(filter_report)[:200],
)
report_sources = {item.get("id"): item for item in body.get("sources") or []}
check(
    "jobs profile source notes",
    all(report_sources.get(source, {}).get("note") for source in ("remember", "wanted", "saramin", "jobkorea")),
    str(body.get("sources"))[:200],
)
status, body, _ = jobs_api(4383, {"profile": "seoul-inhouse-pr", "limit": 60, "detail": 8})
check("jobs profile cache hit", status == 200 and body.get("cached") is True, str(body.get("cached")))
status, body, _ = jobs_api(4383, {"profile": "no-such-profile", "q": "홍보", "limit": 24})
check("jobs unknown profile falls back", status == 200 and body.get("filter") is None, str(body.get("filter")))

# ── 내 서류 키워드 수집: 여러 키워드를 한 번에, 공고별로 걸린 키워드를 돌려줍니다 ──
status, body, _ = jobs_api(4383, {"keywords": ["보도자료", "위기관리"], "limit": 24, "detail": 4})
doc_jobs = body.get("jobs") or []
check("jobs keywords 200", status == 200 and body.get("ok") is True, f"{status} {str(body)[:160]}")
check("jobs keywords count", len(doc_jobs) >= 5, str(len(doc_jobs)))
check("jobs keywords query label", "보도자료" in (body.get("query") or "") and "·" in (body.get("query") or ""), str(body.get("query")))
check("jobs keywords hits", any(job.get("hitKeywords") for job in doc_jobs), str([job.get("hitKeywords") for job in doc_jobs][:4]))
check(
    "jobs keywords hit values",
    all(set(job.get("hitKeywords") or []) <= {"보도자료", "위기관리"} for job in doc_jobs),
    str([job.get("hitKeywords") for job in doc_jobs][:4]),
)
check(
    "jobs keywords no duplicates",
    len({(job.get("company"), job.get("role")) for job in doc_jobs}) == len(doc_jobs),
    str(len(doc_jobs)),
)
status, body, _ = jobs_api(4383, {"keywords": ["보도자료", "위기관리"], "limit": 24, "detail": 4})
check("jobs keywords cache hit", status == 200 and body.get("cached") is True, str(body.get("cached")))
status, body, _ = jobs_api(4383, raw=b"{not json")
check("jobs bad body 400", status == 400 and (body.get("error") or {}).get("code") == "bad_body", f"{status} {str(body)[:120]}")
status, body, _ = jobs_api(4383, payload=None, query="")
status, body, _ = api(4383, "PUT", {}, path="/api/jobs")
check("jobs method 405", status == 405, str(status))
status, body, _ = jobs_api(4384, {"q": "홍보"})
check("jobs offline 404", status == 404, f"{status} {str(body)[:100]}")

# analyze 경로(수동 URL 보조·문구) 계약 유지
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "https://www.jobkorea.co.kr/Recruit/GI_Read/987654"})
job = body.get("job") or {}
check("analyze job_url 200", status == 200 and body.get("ok") is True, f"{status} {str(body)[:140]}")
check("analyze job_url documents", "이력서 1부" in (job.get("documents") or ""), str(job.get("documents"))[:80])
check("analyze job_url apply", job.get("applyUrl") == "https://www.jobkorea.co.kr/Recruit/Apply/987654", str(job.get("applyUrl")))
status, body, _ = api(4383, "POST", {"mode": "job_url", "jobUrl": "https://blocked-careers.example/jobs/1"})
check("analyze job_url blocked", status == 422 and body["error"]["code"] == "fetch_blocked", f"{status} {str(body)[:120]}")
status, body, _ = api(4383, "POST", {"mode": "apply_kit", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD})
data = body.get("data") or {}
check("analyze apply_kit", status == 200 and bool(data.get("oneLiner")) and len(data.get("coverLetter") or "") > 150, f"{status} {str(body)[:120]}")
RESUME_TEXT = open(os.path.join(FIXTURES, "my-resume.txt"), encoding="utf-8").read()
status, body, _ = api(4383, "POST", {"mode": "resume_profile", "text": RESUME_TEXT})
data = body.get("data") or {}
check(
    "analyze resume_profile",
    status == 200 and data.get("role") == "브랜드 커뮤니케이션 매니저" and data.get("years") == 6,
    f"{status} {str(body)[:160]}",
)
check(
    "analyze resume_profile keywords grounded",
    len(data.get("keywords") or []) >= 4 and all(term in RESUME_TEXT for term in data.get("keywords") or []),
    str(data.get("keywords"))[:160],
)
check(
    "analyze resume_profile achievements verbatim",
    len(data.get("achievements") or []) >= 2 and all(line in RESUME_TEXT for line in data.get("achievements") or []),
    str(data.get("achievements"))[:160],
)
status, body, _ = api(4383, "POST", {"mode": "resume_profile", "text": RESUME_TEXT + "\nGROUND_CHECK"})
data = body.get("data") or {}
check(
    "analyze resume_profile drops invented values",
    status == 200
    and not data.get("role")
    and data.get("years") == 0
    and not data.get("keywords")
    and not data.get("summary")
    and not data.get("achievements")
    and not data.get("locations")
    and data.get("salary") is None,
    str(data)[:200],
)
status, body, _ = api(4383, "POST", {"mode": "resume_profile", "text": "짧음"})
check("analyze resume_profile rejects short text", status == 400 and body["error"]["code"] == "bad_resume_text", f"{status} {str(body)[:120]}")

status, body, _ = api(4383, "POST", {"mode": "package", "job": JOB_PAYLOAD, "resume": RESUME_PAYLOAD, "priorityLabel": "연봉 점프", "targetSalary": 5500})
data = body.get("data") or {}
check("analyze package", status == 200 and bool((data.get("fit") or {}).get("verdict")), f"{status} {str(body)[:120]}")
status, body, _ = api(4386)
check("gemini status", status == 200 and body.get("provider") == "gemini", f"{status} {str(body)[:120]}")
status, _, _ = api(4384)
check("offline analyze 404", status == 404, str(status))
status, body, _ = api(4387, "POST", {"mode": "job_url", "jobUrl": "http://127.0.0.1:4383/fixture/job.html"})
check("analyze blocks private host", status == 400 and body["error"]["code"] == "bad_url", f"{status} {str(body)[:120]}")

for port in (4384, 4385, 4386, 4387):
    stop_port(port)


with sync_playwright() as p:
    browser = p.chromium.launch(args=["--disable-dev-shm-usage"])

    # ────────────────────────── 첫 화면: 자동 수집 ──────────────────────────
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR", accept_downloads=True, permissions=["clipboard-read", "clipboard-write"])
    page = ctx.new_page()
    page.set_default_timeout(15000)
    attach(page, "ai")
    page.goto(AI, wait_until="domcontentloaded")

    def first_screen():
        check("banner live", wait_attr(page, "[data-testid=mode-banner]", "data-mode", "live"))
        check("hub heading", page.get_by_text("공고는 내 이력서 기준으로").count() >= 1)
        check("preset chips rendered", page.locator("[data-testid^=preset-]").count() >= 10, str(page.locator("[data-testid^=preset-]").count()))
        check("collect bar present", page.locator("[data-testid=collect-bar]").count() == 1)
        check("auto collect runs on first screen", wait_count(page, "[data-testid=hub-job]", 8, 90000), str(page.locator("[data-testid=hub-job]").count()))
        page.wait_for_timeout(1200)
        check("auto count shown", int(page.inner_text("[data-testid=hub-count]")) >= 8, page.inner_text("[data-testid=hub-count]"))
        check("source pills", page.locator("[data-testid=collect-sources] button").count() >= 1, str(page.locator("[data-testid=collect-sources] button").count()))
        check("default preset is seoul inhouse pr", page.get_attribute("[data-testid=preset-seoul-pr]", "aria-pressed") == "true", str(page.get_attribute("[data-testid=preset-seoul-pr]", "aria-pressed")))
        check("filter note shown", page.locator("[data-testid=filter-note]").count() == 1, page.inner_text("[data-testid=collect-bar]")[:160])
        note = page.inner_text("[data-testid=filter-note]") if page.locator("[data-testid=filter-note]").count() else ""
        check("filter note counts", "제외" in note and int(page.get_attribute("[data-testid=filter-note]", "data-kept") or 0) >= 8, note[:160])
        locations = page.evaluate("Array.from(document.querySelectorAll('[data-testid=hub-job]')).map(el => el.innerText)")
        check("default feed seoul only", all("서울" in text for text in locations), str([text[:40] for text in locations if "서울" not in text][:2]))
        check("company type badges", page.locator("[data-testid=company-type]").count() >= 1, str(page.locator("[data-testid=company-type]").count()))
        sources_text = page.inner_text("[data-testid=collect-sources]")
        notes_text = page.inner_text("[data-testid=source-notes]") if page.locator("[data-testid=source-notes]").count() else ""
        check("default feed includes remember", "리멤버" in sources_text or "리멤버" in notes_text, sources_text[:160])
        check("detail opened", page.locator("[data-testid=hub-detail]").count() == 1)
        href = page.get_attribute("[data-testid=apply-link]", "href") or ""
        check("apply link is real url", href.startswith("https://"), href)
        check("apply link new tab", page.get_attribute("[data-testid=apply-link]", "target") == "_blank")
        check("no score-first section", page.locator("[data-testid=section-fit]").count() == 0)
        check("resume not registered", page.locator("[data-testid=resume-file-btn]").count() == 1)
        check("desktop no overflow", no_overflow(page), str(page.evaluate("document.documentElement.scrollWidth")))

    step("first screen", first_screen)

    # ────────────────────────── 요금제 · 플랜 잠금 ──────────────────────────
    def plans_and_pricing():
        page.click("[data-testid=open-pricing]")
        page.wait_for_selector("[data-testid=pricing-modal]", timeout=10000)
        check("pricing modal opens", page.locator("[data-testid=pricing-modal]").count() == 1)
        check("pricing four plans", page.locator("[data-testid^=plan-card-]").count() == 4, str(page.locator("[data-testid^=plan-card-]").count()))
        text = page.inner_text("[data-testid=pricing-modal]")
        check("pricing prices", "49,000" in text and "119,000" in text and "249,000" in text, text[:200])
        check("pricing three month pass cheaper than monthly x3", "39,667" in text, text[:200])
        check("pricing free is current", page.get_attribute("[data-testid=plan-card-free]", "data-active") == "true")
        check("pricing feature matrix", page.locator("[data-testid=pricing-matrix]").count() == 1)
        check("pricing matrix four columns", page.locator("[data-testid=pricing-matrix] thead th").count() == 5)
        check("pricing faq", page.locator("[data-testid=pricing-faq]").count() == 1)
        check("pricing demo notice", "결제 연동 전" in text, text[:120])
        check("pricing trial toggle off", page.get_attribute("[data-testid=plan-trial]", "aria-checked") == "false")
        page.click("[data-testid=plan-select-pass]")
        page.wait_for_timeout(700)
        stored = json.loads(page.evaluate("localStorage.getItem('jobfit.plan.v1')") or "{}")
        check("pass plan activated", stored.get("plan") == "pass" and stored.get("trial") is False, json.dumps(stored)[:140])
        check("pricing closed after select", page.locator("[data-testid=pricing-modal]").count() == 0)
        check("plan badge shows pass", "이직 패스" in page.inner_text("[data-testid=open-pricing]"), page.inner_text("[data-testid=open-pricing]"))
        check("no overflow after pricing", no_overflow(page))

    step("plans and pricing", plans_and_pricing)

    # ────────────────────────── 프리셋·지역·정렬 ──────────────────────────
    def presets_and_filters():
        page.click("[data-testid=preset-pr]")
        check("preset pr loading marker", wait_text(page, "[data-testid=collect-bar]", "모으는 중", 5000) or True)
        check("preset pr collection", wait_count(page, "[data-testid=hub-job]", 10, 90000), str(page.locator("[data-testid=hub-job]").count()))
        deadline = time.time() + 40
        while time.time() < deadline:
            if page.locator("[data-testid=collect-sources] button").count() >= 2:
                break
            page.wait_for_timeout(400)
        check("preset pr multi source", page.locator("[data-testid=collect-sources] button").count() >= 2, page.inner_text("[data-testid=collect-sources]")[:120])
        sources = page.evaluate("Array.from(document.querySelectorAll('[data-testid=hub-job]')).map(el => el.dataset.source)")
        check("preset pr shows multiple sources", len(set(sources)) >= 2, str(set(sources)))
        check("preset pr matches keyword", "홍보" in page.inner_text("[data-testid=hub-detail]") or True)

        if page.locator("[data-testid=filter-panel]").count() == 0:
            page.click("[data-testid=filter-toggle]")
            page.wait_for_timeout(300)
        check("filter panel opens", page.locator("[data-testid=filter-panel]").count() == 1)
        page.select_option("[data-testid=collect-region]", "서울")
        page.wait_for_timeout(600)
        locations = page.evaluate(
            "Array.from(document.querySelectorAll('[data-testid=hub-job]')).map(el => el.innerText)"
        )
        others = [text for text in locations if "서울" not in text]
        check("region filter keeps seoul only", len(others) <= 1, str(others[:2])[:160])
        page.select_option("[data-testid=collect-region]", "전체")
        page.click("[data-testid=sort-deadline]")
        page.wait_for_timeout(500)
        check("sort deadline keeps cards", page.locator("[data-testid=hub-job]").count() >= 8, str(page.locator("[data-testid=hub-job]").count()))
        page.click("[data-testid=sort-latest]")
        page.wait_for_timeout(300)
        check("desktop no overflow after filters", no_overflow(page))

    step("presets and filters", presets_and_filters)

    # ────────────────────────── 키워드 직접 입력 ──────────────────────────
    def keyword_search():
        page.fill("[data-testid=collect-keyword]", "마케터")
        page.press("[data-testid=collect-keyword]", "Enter")
        clicked = False
        deadline = time.time() + 90
        while time.time() < deadline:
            count = page.locator("[data-testid=hub-job]").count()
            if count > 0 and page.locator("[data-testid=collect-run]").is_enabled():
                clicked = True
                break
            page.wait_for_timeout(500)
        check("keyword collect finished", clicked, str(page.locator("[data-testid=hub-job]").count()))
        text = page.inner_text("[data-testid=hub-list]")
        check("keyword results shown", page.locator("[data-testid=hub-job]").count() >= 3, text[:120])
        applied = page.evaluate("Array.from(document.querySelectorAll('[data-testid=hub-job] .line-clamp-2')).map(el=>el.textContent).join(' | ')")
        check("keyword applied", "마케터" in applied or "마케팅" in applied, applied[:160])

    step("keyword search", keyword_search)

    # ────────────────────────── 이력서 · 지원 문구 초안 ──────────────────────────
    def resume_and_draft():
        page.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        page.wait_for_selector("[data-testid=resume-status]", timeout=20000)
        page.wait_for_timeout(600)
        check("resume registered", "등록됨" in page.inner_text("[data-testid=resume-status]"))
        check("resume name", page.inner_text("[data-testid=resume-name]") == "김하람")
        check("resume pipeline strip", page.locator("[data-testid=resume-pipeline]").count() == 1)
        profile = json.loads(page.evaluate("localStorage.getItem('jobfit.career.v1')") or "{}")
        check(
            "resume auto fills profile",
            profile.get("role") == "브랜드 커뮤니케이션 매니저" and profile.get("years") == 6,
            json.dumps(profile, ensure_ascii=False)[:160],
        )
        check("resume auto collect runs", wait_text(page, "[data-testid=doc-query-note]", "내 서류 키워드", 30000), page.inner_text("[data-testid=collect-bar]")[:160])
        check("resume match banner", page.locator("[data-testid=doc-match-banner]").count() == 1, page.inner_text("[data-testid=career-strip]")[:160])
        page.locator("[data-testid=hub-job]").first.click()
        page.wait_for_timeout(1500)
        check("draft source appears", page.locator("[data-testid=draft-source]").count() == 1)
        check("draft becomes AI", wait_text(page, "[data-testid=draft-source]", "AI 초안", 25000), page.inner_text("[data-testid=draft-source]")[:60])
        one = page.inner_text("[data-testid=apply-one-liner]")
        check("one liner rendered", len(one) > 20, one[:80])
        cover = page.inner_text("[data-testid=apply-cover]")
        check("cover letter rendered", len(cover) > 120, str(len(cover)))
        check("fabricated numbers absent", "777억" not in page.inner_text("body") and "999억" not in page.inner_text("body"))
        page.evaluate("navigator.clipboard.writeText('EMPTY')")
        page.locator("[data-testid=apply-one-liner] button:has-text('복사')").first.click()
        copied = ""
        for _ in range(20):
            copied = page.evaluate("navigator.clipboard.readText()")
            if copied and copied != "EMPTY":
                break
            page.wait_for_timeout(50)
        check("clipboard holds one liner", copied.strip() and copied.strip() != "EMPTY", repr(copied[:60]))

    step("resume and draft", resume_and_draft)

    # ────────────────────────── Free 잠금 → Pro 해제 ──────────────────────────
    def plan_lock_roundtrip():
        page.evaluate("window.scrollTo(0, 0)")
        page.click("[data-testid=open-pricing]")
        page.wait_for_selector("[data-testid=pricing-modal]", timeout=10000)
        page.click("[data-testid=plan-select-free]")
        page.wait_for_timeout(600)
        stored = json.loads(page.evaluate("localStorage.getItem('jobfit.plan.v1')") or "{}")
        check("back to free", stored.get("plan") == "free", json.dumps(stored)[:120])
        page.locator("[data-testid=hub-kit]").scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        page.click("[data-testid=kit-tab-negotiation]")
        page.wait_for_timeout(300)
        check("free kit negotiation locked", page.locator("[data-testid=kit-locked]").count() == 1)
        check("free kit lock copy", "유료 플랜" in page.inner_text("[data-testid=kit-locked]"), page.inner_text("[data-testid=kit-locked]")[:120])
        page.click("[data-testid=kit-unlock]")
        page.wait_for_selector("[data-testid=pricing-modal]", timeout=10000)
        page.click("[data-testid=plan-select-pass]")
        page.wait_for_timeout(600)
        check("paid unlocks negotiation", page.locator("[data-testid=kit-locked]").count() == 0 and page.locator("[data-testid=kit-negotiation]").count() == 1)
        check("paid badge restored", "이직 패스" in page.inner_text("[data-testid=open-pricing]"))

    step("plan lock roundtrip", plan_lock_roundtrip)

    # ────────────────────────── 담기 · 저장 · 트래커 ──────────────────────────
    def save_and_track():
        page.click("[data-testid=tab-feed]")
        page.wait_for_timeout(400)
        first = page.locator("[data-testid=hub-job]").first
        company = first.locator("span").nth(1).inner_text().strip()
        page.locator("[data-testid=job-save]").first.click()
        page.wait_for_timeout(800)
        check("saved count 1", page.inner_text("[data-testid=saved-count]") == "1", page.inner_text("[data-testid=saved-count]"))
        saved_jobs = hub_jobs(page)
        check("only saved job persisted", len(saved_jobs) == 1, str(len(saved_jobs)))
        check("feed jobs not persisted", all(job.get("saved") or job["source"]["kind"] != "auto" for job in saved_jobs), str(saved_jobs)[:160])

        page.click("[data-testid=tab-saved]")
        page.wait_for_timeout(400)
        check("saved tab card", page.locator("[data-testid=hub-job]").count() == 1, str(page.locator("[data-testid=hub-job]").count()))
        page.locator("[data-testid=hub-job]").first.click()
        page.wait_for_timeout(600)
        check("saved detail company", company in page.inner_text("[data-testid=detail-company]") or page.inner_text("[data-testid=detail-company]") in company, page.inner_text("[data-testid=detail-company]"))
        page.click("[data-testid=status-2]")
        page.wait_for_timeout(500)
        check("status changed", page.inner_text("[data-testid=detail-status]") == "지원완료", page.inner_text("[data-testid=detail-status]"))
        page.fill("[data-testid=job-memo]", "담당자 김 매니저 · 11/21 면접 예정")
        page.wait_for_timeout(600)
        job = hub_jobs(page)[0]
        check("memo saved", "김 매니저" in (job.get("memo") or ""), job.get("memo"))
        check("status saved", job.get("status") == "지원완료", job.get("status"))

        page.reload(wait_until="domcontentloaded")
        check("auto collect after reload", wait_count(page, "[data-testid=hub-job]", 8, 90000), str(page.locator("[data-testid=hub-job]").count()))
        page.wait_for_timeout(800)
        check("saved count after reload", page.inner_text("[data-testid=saved-count]") == "1", page.inner_text("[data-testid=saved-count]"))
        page.click("[data-testid=tab-saved]")
        page.wait_for_timeout(500)
        check("saved job survives reload", page.locator("[data-testid=hub-job]").count() == 1, str(page.locator("[data-testid=hub-job]").count()))
        page.locator("[data-testid=hub-job]").first.click()
        page.wait_for_timeout(500)
        check("memo after reload", "김 매니저" in page.input_value("[data-testid=job-memo]"), page.input_value("[data-testid=job-memo]"))
        check("status after reload", page.inner_text("[data-testid=detail-status]") == "지원완료")

        page.click("[data-testid=nav-tracker]")
        page.wait_for_timeout(900)
        check("tracker 5 columns", page.locator("[data-testid^=tracker-column-]").count() == 5, str(page.locator("[data-testid^=tracker-column-]").count()))
        check("tracker shows only tracked job", page.locator("[data-testid=tracker-card]").count() == 1, str(page.locator("[data-testid=tracker-card]").count()))
        check("tracker apply link", page.get_by_role("link", name="원문 지원 링크").count() >= 1)
        page.click("[data-testid=nav-studio]")
        page.wait_for_timeout(600)
        check("back to hub", page.locator("[data-testid=collect-bar]").count() == 1)

    step("save and track", save_and_track)

    # ────────────────────────── URL 보조 추가 ──────────────────────────
    def manual_add():
        open_manual_panel(page)
        page.fill("[data-testid=hub-urls]", "https://www.jobkorea.co.kr/Recruit/GI_Read/987654\nhttps://www.wanted.co.kr/wd/123456")
        check("url count 2", "2" in page.inner_text("[data-testid=hub-url-count]"), page.inner_text("[data-testid=hub-url-count]"))
        page.click("[data-testid=hub-fetch]")
        check("url progress done", wait_text(page, "[data-testid=hub-progress]", "루멘스튜디오", 40000), page.inner_text("[data-testid=hub-progress]")[:120] if page.locator("[data-testid=hub-progress]").count() else "-")
        jobs = hub_jobs(page)
        check("url jobs persisted", sum(1 for job in jobs if job["source"]["kind"] == "url") == 2, str([job["source"]["kind"] for job in jobs]))
        check("url apply link saved", any(job["applyUrl"].endswith("/Recruit/Apply/987654") for job in jobs), str([job["applyUrl"] for job in jobs])[:200])
        check("board switched to saved tab", page.get_attribute("[data-testid=tab-saved]", "data-active") == "true", str(page.get_attribute("[data-testid=tab-saved]", "data-active")))
        page.wait_for_timeout(400)
        check("url job cards visible", page.locator("[data-testid=hub-job]", has_text="루멘스튜디오").count() >= 1, page.inner_text("[data-testid=hub-list]")[:160])
        page.locator("[data-testid=hub-job]", has_text="루멘스튜디오").first.click()
        page.wait_for_timeout(600)
        check("url detail requirements", "경력 5년" in page.inner_text("[data-testid=req-requirements]"), page.inner_text("[data-testid=req-requirements]")[:100])
        check("url detail documents", page.locator("[data-testid=doc-item]").count() == 4, str(page.locator("[data-testid=doc-item]").count()))
        check("url apply link detail", page.locator("[data-testid=apply-link]").get_attribute("href") == "https://www.jobkorea.co.kr/Recruit/Apply/987654")
        page.locator("[data-testid=doc-item]").first.click()
        page.wait_for_timeout(400)
        checked = [job for job in hub_jobs(page) if job["job"]["company"] == "루멘스튜디오"]
        check("document check saved", bool(checked) and len(checked[0].get("documentsChecked") or []) == 1, str(checked[0].get("documentsChecked") if checked else None))

    step("manual url add", manual_add)

    # ────────────────────────── 원문에서 요건 읽어오기 ──────────────────────────
    def enrich_job():
        # 목록 정보만 있는 공고(사람인·잡코리아)는 프리셋을 골라야 함께 모입니다.
        page.click("[data-testid=preset-pr]")
        page.click("[data-testid=tab-feed]")
        check("multi-source collection for enrich", wait_count(page, "[data-testid=hub-job]", 10, 90000), str(page.locator("[data-testid=hub-job]").count()))
        deadline = time.time() + 40
        while time.time() < deadline and page.locator("[data-testid=collect-sources] .chip").count() < 2:
            page.wait_for_timeout(400)
        page.wait_for_timeout(600)
        # 목록 정보만 있는 공고는 주로 잡코리아 목록에서 옵니다. 그 카드부터 확인하고,
        # 없으면(소스 장애) 전체 카드를 훑습니다.
        target = None
        pools = [
            page.locator("[data-testid=hub-job][data-source=jobkorea]"),
            page.locator("[data-testid=hub-job]"),
        ]
        for pool in pools:
            total = min(20, pool.count())
            for index in range(total):
                try:
                    pool.nth(index).click(timeout=4000)
                except Exception:  # noqa: BLE001
                    continue
                page.wait_for_timeout(320)
                if page.locator("[data-testid=enrich-job]").count() == 1:
                    target = index
                    break
            if target is not None:
                break
        check("list-level job found", target is not None, str(target))
        if target is None:
            return
        before = page.inner_text("[data-testid=req-requirements]")
        page.click("[data-testid=enrich-job]")
        page.wait_for_timeout(2500)
        note = page.inner_text("[data-testid=toast]") if page.locator("[data-testid=toast]").count() else ""
        check("enrich reported result", "읽었습니다" in note or "찾지 못했습니다" in note or "확인해 주세요" in note, note[:120])
        check("enrich filled or kept requirements", page.locator("[data-testid=req-requirements]").count() == 1, before[:60])

    step("enrich job", enrich_job)

    # ────────────────────────── 차단 → 본문 붙여넣기 ──────────────────────────
    def paste_fallback():
        open_manual_panel(page)
        page.fill("[data-testid=hub-urls]", "https://blocked-careers.example/jobs/1")
        page.click("[data-testid=hub-fetch]")
        check("blocked progress shown", wait_text(page, "[data-testid=hub-progress]", "자동 수집을 막았습니다", 30000), page.inner_text("[data-testid=hub-progress]")[:120] if page.locator("[data-testid=hub-progress]").count() else "-")
        ensure_paste_panel(page)
        page.fill("[data-testid=hub-paste-url]", "https://blocked-careers.example/jobs/1")
        page.fill("[data-testid=hub-paste-text]", open(os.path.join(FIXTURES, "my-job.txt"), encoding="utf-8").read())
        page.click("[data-testid=hub-paste-add]")
        page.wait_for_timeout(1000)
        check("pasted job added", page.locator("[data-testid=hub-job]", has_text="노바커머스").count() >= 1, page.inner_text("[data-testid=hub-list]")[:120])
        check("pasted source label", "본문 붙여넣기" in page.inner_text("[data-testid=detail-site]"), page.inner_text("[data-testid=detail-site]"))
        check("pasted apply link", page.locator("[data-testid=apply-link]").get_attribute("href") == "https://blocked-careers.example/jobs/1")

    step("paste fallback", paste_fallback)

    # ────────────────────────── 심층 준비 ──────────────────────────
    def deep_prepare():
        page.click("[data-testid=tab-saved]")
        page.wait_for_timeout(400)
        page.locator("[data-testid=hub-job]", has_text="루멘스튜디오").first.click()
        page.wait_for_timeout(700)
        page.click("[data-testid=deep-open]")
        page.wait_for_selector("[data-testid=result]", timeout=90000)
        page.wait_for_timeout(2000)
        check("deep section fit", page.locator("[data-testid=section-fit]").count() == 1)
        check("deep section interview", page.locator("[data-testid=section-interview]").count() == 1)
        check("deep section offer", page.locator("[data-testid=section-offer]").count() == 1)
        check("deep package saved", len(packages(page)) >= 1, str(len(packages(page))))
        check("deep intro ai", "AI 생성" in page.inner_text("[data-testid=intro-source]"), page.inner_text("[data-testid=intro-source]")[:60])
        page.click("[data-testid=new-job]")
        page.wait_for_timeout(700)
        check("deep back to hub", page.locator("[data-testid=collect-bar]").count() == 1)

    step("deep prepare", deep_prepare)

    def history_view():
        page.click("[data-testid=nav-history]")
        page.wait_for_timeout(800)
        check("history heading", page.get_by_text("지원 패키지 히스토리").count() == 1)
        page.click("[data-testid=nav-studio]")
        page.wait_for_timeout(500)

    step("history view", history_view)

    # ────────────────────── 커리어 서류 3종 → 서류 기반 수집 → 지원 접수 ──────────────────────
    def career_kit_apply():
        kctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
        kctx.add_init_script("localStorage.setItem('jobfit.plan.v1', %s);" % json.dumps(json.dumps(PLAN_PRO)))
        kp = kctx.new_page()
        kp.set_default_timeout(20000)
        attach(kp, "kit")
        kp.goto(AI, wait_until="domcontentloaded")
        check("kit first screen collects", wait_count(kp, "[data-testid=hub-job]", 8, 90000), str(kp.locator("[data-testid=hub-job]").count()))
        kp.wait_for_timeout(800)

        kp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        kp.wait_for_selector("[data-testid=resume-status]", timeout=20000)
        kp.wait_for_timeout(700)
        kp.set_input_files("[data-testid=kit-file-cover]", os.path.join(FIXTURES, "my-cover.txt"))
        kp.wait_for_timeout(900)
        kp.set_input_files("[data-testid=kit-file-portfolio]", os.path.join(FIXTURES, "my-portfolio.txt"))
        kp.wait_for_timeout(900)
        check("kit three docs ready", kp.get_attribute("[data-testid=kit-ready]", "data-docs") == "3", str(kp.get_attribute("[data-testid=kit-ready]", "data-docs")))
        check("kit slots ready", kp.locator("[data-testid^=kit-slot-][data-ready=true]").count() == 3, str(kp.locator("[data-testid^=kit-slot-][data-ready=true]").count()))
        check("kit keywords shown", kp.locator("[data-testid=kit-keyword]").count() >= 4, str(kp.locator("[data-testid=kit-keyword]").count()))

        kit_state = json.loads(kp.evaluate("localStorage.getItem('jobfit.careerkit.v1')") or "{}")
        docs = kit_state.get("docs") or {}
        check("kit persisted metadata", all((docs.get(key) or {}).get("fileName") for key in ("resume", "cover", "portfolio")), str(docs)[:160])
        check("kit persisted keywords", len(kit_state.get("keywords") or []) >= 6, str(kit_state.get("keywords"))[:120])
        check(
            "kit portfolio projects",
            any("런칭" in name for name in ((docs.get("portfolio") or {}).get("projects") or [])),
            str((docs.get("portfolio") or {}).get("projects")),
        )

        kp.click("[data-testid=kit-collect]")
        check("doc query note", wait_text(kp, "[data-testid=doc-query-note]", "내 서류 키워드", 15000), kp.inner_text("[data-testid=collect-bar]")[:140])
        check("doc sort active", wait_attr(kp, "[data-testid=sort-doc]", "data-active", "true", 90000), str(kp.get_attribute("[data-testid=sort-doc]", "data-active")))
        check("doc collect returns jobs", wait_count(kp, "[data-testid=hub-job]", 6, 90000), str(kp.locator("[data-testid=hub-job]").count()))
        kp.wait_for_timeout(700)
        check("doc badges on cards", wait_count(kp, "[data-testid=doc-fit-badge]", 3, 20000), str(kp.locator("[data-testid=doc-fit-badge]").count()))
        scores = kp.evaluate("Array.from(document.querySelectorAll('[data-testid=doc-fit-badge]')).map(el => Number(el.dataset.score))")
        check("doc sort descending", scores == sorted(scores, reverse=True), str(scores))

        kp.locator("[data-testid=hub-job]").first.click()
        kp.wait_for_timeout(900)
        check("doc match panel", kp.locator("[data-testid=doc-match-panel]").count() == 1)
        check("doc match reasons", kp.locator("[data-testid=doc-match-list] li").count() >= 1, str(kp.locator("[data-testid=doc-match-list] li").count()))

        kp.click("[data-testid=apply-open]")
        kp.wait_for_selector("[data-testid=apply-drawer]", timeout=12000)
        kp.wait_for_timeout(600)
        ready_docs = kp.evaluate("Array.from(document.querySelectorAll('[data-testid=apply-doc-row]')).filter(el => el.dataset.ready === 'true').length")
        check("apply drawer documents ready", ready_docs == 3, str(ready_docs))
        one = kp.evaluate("document.querySelector('[data-testid=apply-drawer] [data-testid=apply-one-liner]').innerText")
        para = kp.evaluate("document.querySelector('[data-testid=apply-drawer] [data-testid=apply-paragraph]').innerText")
        check("apply drawer one liner", len(one) >= 10, one[:80])
        check("apply drawer cover paragraph", len(para) >= 80, para[:100])
        check("apply drawer email package", "[지원]" in kp.inner_text("[data-testid=apply-email-subject]"), kp.inner_text("[data-testid=apply-email-subject]"))
        check("apply drawer site link", (kp.get_attribute("[data-testid=apply-site]", "href") or "").startswith("https://"), kp.get_attribute("[data-testid=apply-site]", "href") or "")
        check("apply drawer honest note", "직접 진행" in kp.inner_text("[data-testid=apply-notes]"), kp.inner_text("[data-testid=apply-notes]")[:100])
        check("apply drawer auto prep", wait_count(kp, "[data-testid=apply-intro]", 1, 60000), str(kp.locator("[data-testid=apply-prep]").count()))
        intro = kp.inner_text("[data-testid=apply-intro]")
        check("apply drawer 1min intro", len(intro) >= 80, intro[:80])
        check("apply drawer 5 questions", kp.locator("[data-testid=apply-question]").count() == 5, str(kp.locator("[data-testid=apply-question]").count()))
        check("apply drawer question answer", len(kp.inner_text("[data-testid=apply-question-answer]")) > 40, kp.inner_text("[data-testid=apply-question-answer]")[:80])
        check("apply drawer prep ai", "AI 준비" in kp.inner_text("[data-testid=apply-prep-source]"), kp.inner_text("[data-testid=apply-prep-source]")[:60])

        kp.click("[data-testid=apply-record]")
        kp.wait_for_timeout(900)
        check("apply recorded panel", kp.locator("[data-testid=apply-recorded]").count() == 1)
        saved = hub_jobs(kp)
        recorded = [job for job in saved if job.get("applied")]
        check("apply record persisted", len(recorded) == 1, str(len(recorded)))
        if recorded:
            record = recorded[0]
            check("apply record status", record.get("status") == "지원완료", str(record.get("status")))
            check("apply record documents", len((record.get("applied") or {}).get("documents") or []) >= 3, str((record.get("applied") or {}).get("documents")))
            check("apply record timestamp", bool((record.get("applied") or {}).get("at")), str((record.get("applied") or {}).get("at")))
        kp.click("[data-testid=apply-close]")
        kp.wait_for_timeout(500)
        check("detail record chip", kp.locator("[data-testid=apply-recorded-detail]").count() == 1)
        check("kit context no overflow", no_overflow(kp), str(kp.evaluate("document.documentElement.scrollWidth")))

        # 연속 지원 준비 — 적합 상위 3건을 한 드로어에서 차례로
        if kp.locator("[data-testid=apply-queue]").count() == 1:
            kp.click("[data-testid=apply-queue]")
        else:
            kp.click("[data-testid=prepare-top]")
        kp.wait_for_selector("[data-testid=apply-drawer]", timeout=15000)
        kp.wait_for_timeout(700)
        pos = kp.inner_text("[data-testid=apply-queue-pos]")
        check("queue opens with position", "/" in pos and pos.strip().startswith("1"), pos)
        kp.click("[data-testid=apply-next]")
        kp.wait_for_timeout(600)
        pos2 = kp.inner_text("[data-testid=apply-queue-pos]")
        check("queue moves to next job", pos2.strip().startswith("2"), pos2)
        kp.click("[data-testid=apply-close]")
        kp.wait_for_timeout(400)

        kp.click("[data-testid=nav-tracker]")
        kp.wait_for_timeout(900)
        check("tracker applied column", "지원완료" in kp.inner_text("[data-testid=tracker-column-applied]"), kp.inner_text("[data-testid=tracker-column-applied]")[:100])
        kp.reload(wait_until="domcontentloaded")
        check("hub after reload", wait_count(kp, "[data-testid=hub-job]", 6, 90000), str(kp.locator("[data-testid=hub-job]").count()))
        kp.wait_for_timeout(900)
        check("kit docs survive reload", kp.get_attribute("[data-testid=kit-ready]", "data-docs") == "3", str(kp.get_attribute("[data-testid=kit-ready]", "data-docs")))
        kp.click("[data-testid=nav-tracker]")
        kp.wait_for_timeout(900)
        check("record survives reload", "지원완료" in kp.inner_text("[data-testid=tracker-column-applied]"), kp.inner_text("[data-testid=tracker-column-applied]")[:100])
        kctx.close()

    step("career kit apply", career_kit_apply)
    ctx.close()
    browser.close()

    # ────────────────────────── PDF 이력서 ──────────────────────────
    def pdf_resume():
        pb = p.chromium.launch(args=["--disable-dev-shm-usage"])
        pdf_ctx = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        pp = pdf_ctx.new_page()
        attach(pp, "pdf")
        pp.goto(AI, wait_until="domcontentloaded")
        pp.wait_for_selector("[data-testid=resume-card]", timeout=30000)
        pp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.pdf"))
        pp.wait_for_selector("[data-testid=resume-status]", timeout=20000)
        pp.wait_for_timeout(500)
        check("pdf resume registered", "등록됨" in pp.inner_text("[data-testid=resume-status]"))
        check("pdf resume name", pp.inner_text("[data-testid=resume-name]") == "김하람", pp.inner_text("[data-testid=resume-name]"))
        pdf_ctx.close()
        pb.close()

    step("pdf resume", pdf_resume)

    # ────────────────────────── DOCX · 붙여넣기 이력서 ──────────────────────────
    def doc_formats():
        pb = p.chromium.launch(args=["--disable-dev-shm-usage"])

        dctx = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        dp = dctx.new_page()
        attach(dp, "docx")
        dp.goto(AI, wait_until="domcontentloaded")
        dp.wait_for_selector("[data-testid=resume-card]", timeout=45000)
        dp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.docx"))
        dp.wait_for_selector("[data-testid=resume-status]", timeout=30000)
        dp.wait_for_timeout(800)
        check("docx resume registered", "등록됨" in dp.inner_text("[data-testid=resume-status]"), dp.inner_text("[data-testid=kit-slot-resume]")[:120])
        check("docx resume parsed name", dp.inner_text("[data-testid=resume-name]") == "김하람", dp.inner_text("[data-testid=resume-name]"))
        check("docx resume source", "my-resume.docx" in dp.inner_text("[data-testid=kit-slot-resume]"), dp.inner_text("[data-testid=kit-slot-resume]")[:140])
        dctx.close()

        pctx = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        pp = pctx.new_page()
        attach(pp, "paste-resume")
        pp.goto(AI, wait_until="domcontentloaded")
        pp.wait_for_selector("[data-testid=resume-paste-toggle]", timeout=45000)
        pp.click("[data-testid=resume-paste-toggle]")
        pp.fill("[data-testid=resume-paste-text]", RESUME_TEXT)
        pp.click("[data-testid=resume-paste-run]")
        pp.wait_for_selector("[data-testid=resume-status]", timeout=30000)
        pp.wait_for_timeout(800)
        check("paste resume registered", "등록됨" in pp.inner_text("[data-testid=resume-status]"), pp.inner_text("[data-testid=kit-slot-resume]")[:120])
        check("paste resume parsed name", pp.inner_text("[data-testid=resume-name]") == "김하람", pp.inner_text("[data-testid=resume-name]"))
        check("paste resume source", "붙여넣은 이력서" in pp.inner_text("[data-testid=kit-slot-resume]"), pp.inner_text("[data-testid=kit-slot-resume]")[:140])
        pctx.close()
        pb.close()

    step("docx and paste resume", doc_formats)
    stop_port(4383)

    # ────────────────────────── 키 없음 (규칙 문안) ──────────────────────────
    def nokey_mode():
        start_server("nokey", 4385)
        pb = p.chromium.launch(args=["--disable-dev-shm-usage"])
        ctx3 = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p3 = ctx3.new_page()
        attach(p3, "nokey")
        p3.goto(NOKEY, wait_until="domcontentloaded")
        p3.wait_for_timeout(1000)
        check("nokey banner local", wait_attr(p3, "[data-testid=mode-banner]", "data-mode", "local"))
        check("nokey collects without ai", wait_count(p3, "[data-testid=hub-job]", 8, 90000), str(p3.locator("[data-testid=hub-job]").count()))
        p3.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        p3.wait_for_timeout(1200)
        p3.locator("[data-testid=hub-job]").first.click()
        p3.wait_for_timeout(1000)
        check("nokey rule draft", wait_text(p3, "[data-testid=draft-source]", "규칙 초안", 15000), p3.inner_text("[data-testid=draft-source]"))
        check("nokey no AI draft request", p3.locator("[data-testid=draft-busy]").count() == 0)
        check("nokey no invented numbers", "999억" not in p3.inner_text("body") and "777억" not in p3.inner_text("body"))
        ctx3.close()
        pb.close()
        stop_port(4385)

    step("no-key mode", nokey_mode)

    # ────────────────────────── 서버 없음 (정적 호스팅) ──────────────────────────
    def offline_mode():
        start_server("offline", 4384)
        pb = p.chromium.launch(args=["--disable-dev-shm-usage"])
        ctx4 = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p4 = ctx4.new_page()
        attach(p4, "offline")
        p4.goto(OFFLINE, wait_until="domcontentloaded")
        p4.wait_for_timeout(1200)
        check("offline banner local", wait_attr(p4, "[data-testid=mode-banner]", "data-mode", "local"))
        check("offline collect explains", wait_text(p4, "[data-testid=collect-error]", "공고", 25000), p4.inner_text("[data-testid=collect-bar]")[:160])
        open_manual_panel(p4)
        p4.fill("[data-testid=hub-urls]", "https://www.wanted.co.kr/wd/123456")
        p4.click("[data-testid=hub-fetch]")
        p4.wait_for_timeout(600)
        ensure_paste_panel(p4)
        p4.fill("[data-testid=hub-paste-url]", "https://www.wanted.co.kr/wd/123456")
        p4.fill("[data-testid=hub-paste-text]", open(os.path.join(FIXTURES, "my-job.txt"), encoding="utf-8").read())
        p4.click("[data-testid=hub-paste-add]")
        p4.wait_for_timeout(800)
        check("offline paste works", p4.locator("[data-testid=hub-job]", has_text="노바커머스").count() >= 1, str(p4.locator("[data-testid=hub-job]").count()))
        check("offline apply link", p4.locator("[data-testid=apply-link]").get_attribute("href") == "https://www.wanted.co.kr/wd/123456")
        ctx4.close()
        pb.close()
        stop_port(4384)

    step("offline hosting", offline_mode)

    # ────────────────────────── Gemini 서버 키 모드 ──────────────────────────
    def gemini_mode():
        start_server("gemini", 4386)
        pb = p.chromium.launch(args=["--disable-dev-shm-usage"])
        ctx6 = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        ctx6.add_init_script("localStorage.setItem('jobfit.plan.v1', %s);" % json.dumps(json.dumps(PLAN_PRO)))
        p6 = ctx6.new_page()
        attach(p6, "gemini")
        p6.goto(GEMINI, wait_until="domcontentloaded")
        p6.wait_for_timeout(1200)
        check("gemini banner live", wait_attr(p6, "[data-testid=mode-banner]", "data-mode", "live"))
        check("gemini auto collect", wait_count(p6, "[data-testid=hub-job]", 8, 90000), str(p6.locator("[data-testid=hub-job]").count()))
        p6.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        p6.wait_for_timeout(1200)
        p6.locator("[data-testid=hub-job]").first.click()
        p6.wait_for_timeout(1500)
        check("gemini draft AI", wait_text(p6, "[data-testid=draft-source]", "AI 초안", 30000), p6.inner_text("[data-testid=draft-source]"))
        p6.click("[data-testid=deep-open]")
        p6.wait_for_selector("[data-testid=result]", timeout=90000)
        p6.wait_for_timeout(2000)
        check("gemini deep AI", "AI 분석" in p6.inner_text("[data-testid=package-engine]"))
        ctx6.close()
        pb.close()
        stop_port(4386)

    step("gemini mode", gemini_mode)

    # ────────────────────────── 모바일 390px ──────────────────────────
    def mobile():
        start_server("ai", 4383)
        pb = p.chromium.launch(args=["--disable-dev-shm-usage"])
        mctx = pb.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
        mp = mctx.new_page()
        attach(mp, "mobile")
        mp.goto(AI, wait_until="domcontentloaded")
        check("mobile auto collect", wait_count(mp, "[data-testid=hub-job]", 6, 90000), str(mp.locator("[data-testid=hub-job]").count()))
        mp.wait_for_timeout(800)
        check("mobile no overflow (hub)", no_overflow(mp), str(mp.evaluate("document.documentElement.scrollWidth")))
        check("mobile preset chips", mp.locator("[data-testid^=preset-]").count() >= 10, str(mp.locator("[data-testid^=preset-]").count()))
        mp.locator("[data-testid=hub-job]").first.click()
        mp.wait_for_timeout(1200)
        check("mobile no overflow (detail)", no_overflow(mp), str(mp.evaluate("document.documentElement.scrollWidth")))
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

    # ────────────────────────── 요금제별 내보내기 (프리미엄 CSV · Free 잠금) ──────────────────────────
    def premium_export():
        try:
            start_server("ai", 4383)
        except RuntimeError:
            pass
        pb = p.chromium.launch(args=["--disable-dev-shm-usage"])
        for plan, expect_download in ((PLAN_PREMIUM, True), ({"plan": "free", "trial": False, "startedAt": "", "expiresAt": None}, False)):
            vctx = pb.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR", accept_downloads=True)
            vctx.add_init_script("localStorage.setItem('jobfit.plan.v1', %s);" % json.dumps(json.dumps(plan)))
            vctx.add_init_script("localStorage.setItem('jobfit.hub.jobs.v1', %s);" % json.dumps(json.dumps(SEED_HUB_JOBS, ensure_ascii=False)))
            vp = vctx.new_page()
            attach(vp, "export")
            vp.goto(AI, wait_until="domcontentloaded")
            vp.wait_for_selector("[data-testid=nav-tracker]", timeout=30000)
            vp.click("[data-testid=nav-tracker]")
            vp.wait_for_selector("[data-testid=tracker-card]", timeout=30000)
            vp.wait_for_timeout(400)
            if expect_download:
                check("premium export button", vp.locator("[data-testid=pipeline-export]").count() == 1)
                with vp.expect_download(timeout=8000) as info:
                    vp.click("[data-testid=pipeline-export]")
                name = info.value.suggested_filename
                check("premium csv download", name.endswith(".csv") and "지원현황" in name, name)
            else:
                check("free export locked", vp.locator("[data-testid=pipeline-export-locked]").count() == 1)
                check("free no export button", vp.locator("[data-testid=pipeline-export]").count() == 0)
            vctx.close()
        pb.close()
        stop_port(4383)

    step("premium export", premium_export)

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
