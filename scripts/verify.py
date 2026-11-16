import os, json, subprocess, sys, time, socket, atexit
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
os.environ["LD_LIBRARY_PATH"] = "/workspace/.libs/usr/lib/x86_64-linux-gnu" + ((":" + os.environ["LD_LIBRARY_PATH"]) if os.environ.get("LD_LIBRARY_PATH") else "")
from playwright.sync_api import sync_playwright

ROOT = "/workspace/projects/job-fit-studio"
NODE = "/workspace/.tools/node-v22.12.0-linux-x64/bin/node"
FIXTURES = os.path.join(ROOT, "scripts/fixtures")
checks = []
errors = []
servers = []


def start_server(mode, port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.5):
            raise RuntimeError(f"port {port} already in use")
    except OSError:
        pass
    proc = subprocess.Popen([NODE, "scripts/e2e-server.mjs", mode, str(port)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    servers.append(proc)
    deadline = time.time() + 40
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


def check(name, cond, detail=""):
    ok = bool(cond)
    checks.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  <{detail}>"), flush=True)


def step(name, fn):
    print(f"── {name}", flush=True)
    try:
        fn()
    except Exception as exc:  # noqa: BLE001
        checks.append((name, False, f"exception: {type(exc).__name__}: {str(exc)[:180]}"))
        print(f"FAIL {name}  <exception: {type(exc).__name__}: {str(exc)[:160]}>", flush=True)


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


def wait_attr(page, selector, attr, value, timeout=15000):
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        got = page.get_attribute(selector, attr)
        if got == value:
            return True
        page.wait_for_timeout(200)
    return False


def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0


AI = "http://127.0.0.1:4383/"
OFFLINE = "http://127.0.0.1:4384/"
NOKEY = "http://127.0.0.1:4385/"
GEMINI = "http://127.0.0.1:4386/"

start_server("ai", 4383)
start_server("offline", 4384)
start_server("nokey", 4385)
start_server("gemini", 4386)


def api(port, method="GET", payload=None):
    import urllib.request, urllib.error
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/analyze", data=data, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, json.loads(res.read().decode() or "{}"), dict(res.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode() or "{}"), dict(exc.headers)


status, body, headers = api(4383)
check("api GET status", status == 200 and body.get("ok") is True and body.get("ai") is True, str(body)[:120])
check("api CORS header", headers.get("Access-Control-Allow-Origin") == "*", str(headers.get("Access-Control-Allow-Origin")))
status, body, _ = api(4383, "OPTIONS")
check("api OPTIONS 204", status == 204, str(status))
status, body, _ = api(4383, "POST", {"mode": "nope"})
check("api bad mode 400", status == 400 and body["error"]["code"] == "bad_mode", str(body)[:120])
status, body, _ = api(4383, "POST", {"mode": "package", "job": {"company": "x"}, "resume": {}})
check("api bad job 400", status == 400 and body["error"]["code"] == "bad_job", str(body)[:120])
status, body, _ = api(4385, "POST", {"mode": "package", "job": {"responsibilities": "위기 대응"}, "resume": {"experiences": [{"bullets": ["위기 이슈 2건을 대응했습니다."]}]}})
check("api no key 501", status == 501 and body["error"]["code"] == "no_key", str(body)[:120])
status, body, _ = api(4385, "GET")
check("api no key probe", status == 200 and body.get("ai") is False and body.get("reason") == "no_key", str(body)[:120])
status, body, _ = api(4385, "POST", {
    "mode": "package",
    "apiKey": "sk-request-fallback-key-000000",
    "job": {"company": "노바커머스", "role": "매니저", "responsibilities": "위기 대응", "requirements": "경력 4년"},
    "resume": {"experiences": [{"company": "노바커머스", "bullets": ["위기 이슈 2건에 대응해 입장문을 배포했습니다."]}]},
})
check("api request key fallback", status == 200 and body.get("ok") is True, f"{status} {str(body)[:100]}")
status, body, _ = api(4384, "GET")
check("offline api 404", status == 404, str(status))

# ───────────────────────────── Gemini(GEMINI_API_KEY) 경로 ────────────────────────
status, body, _ = api(4386)
gemini_status = (
    status == 200
    and body.get("ai") is True
    and body.get("provider") == "gemini"
    and body.get("model") == "gemini-3.5-flash-lite"
)
check("api gemini status", gemini_status, f"{status} {str(body)[:140]}")

status, body, _ = api(4386, "POST", {
    "mode": "package",
    "job": {"company": "노바커머스", "role": "매니저", "responsibilities": "위기 대응", "requirements": "경력 4년"},
    "resume": {"experiences": [{"company": "노바커머스", "bullets": ["위기 이슈 2건에 대응해 입장문을 배포했습니다."]}]},
})
check(
    "api gemini package 200",
    status == 200 and body.get("ok") is True and body.get("provider") == "gemini" and bool((body.get("data") or {}).get("fit")),
    f"{status} {str(body)[:140]}",
)

capture = {}
try:
    with open(os.path.join(ROOT, "scripts/.build/gemini-request.json"), encoding="utf-8") as fp:
        capture = json.load(fp)
except (OSError, ValueError):
    capture = {}
gen = ((capture.get("body") or {}).get("generationConfig") or {})
check(
    "gemini request contract",
    str(capture.get("model") or "").startswith("gemini-3.5-flash-lite")
    and gen.get("responseMimeType") == "application/json"
    and gen.get("temperature") == 0.4
    # Gemini 3.x는 thinking을 끌 수 없어 출력 한도만 넓히고 thinkingConfig는 보내지 않습니다(2400*3+1024).
    and gen.get("maxOutputTokens") == 2400 * 3 + 1024
    and "thinkingConfig" not in gen
    and bool(((capture.get("body") or {}).get("systemInstruction") or {}).get("parts")),
    json.dumps({"model": capture.get("model"), "generationConfig": gen}, ensure_ascii=False)[:220],
)

status, body, _ = api(4386, "POST", {
    "mode": "interview_eval",
    "question": "위기 이슈를 어떻게 대응하나요?",
    "answer": "당시 위기 이슈가 터졌고 제가 먼저 입장문 초안을 작성해 24시간 내 배포했습니다. 이해관계 부서와 문장을 조율했습니다.",
})
check("api gemini eval 200", status == 200 and body.get("provider") == "gemini" and bool((body.get("data") or {}).get("score") is not None), f"{status} {str(body)[:140]}")

# 서버 키가 없고 요청 본문 키가 AIza…이면 Gemini로
status, body, _ = api(4385, "POST", {
    "mode": "package",
    "apiKey": "AIza-request-gemini-key-000000",
    "job": {"company": "노바커머스", "role": "매니저", "responsibilities": "위기 대응", "requirements": "경력 4년"},
    "resume": {"experiences": [{"company": "노바커머스", "bullets": ["위기 이슈 2건에 대응해 입장문을 배포했습니다."]}]},
})
check("api gemini request key fallback", status == 200 and body.get("provider") == "gemini", f"{status} {str(body)[:120]}")

# 최근 Gemini 키는 AQ.로 시작합니다 (sk-가 아니면 Gemini)
status, body, _ = api(4385, "POST", {
    "mode": "package",
    "apiKey": "AQ.real-user-gemini-key-0001",
    "job": {"company": "노바커머스", "role": "매니저", "responsibilities": "위기 대응", "requirements": "경력 4년"},
    "resume": {"experiences": [{"company": "노바커머스", "bullets": ["위기 이슈 2건에 대응해 입장문을 배포했습니다."]}]},
})
check("api gemini AQ key fallback", status == 200 and body.get("provider") == "gemini", f"{status} {str(body)[:120]}")

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ─────────────────────────────── AI 연결 모드 ───────────────────────────────
    ctx = browser.new_context(viewport={"width": 1440, "height": 960}, locale="ko-KR", accept_downloads=True)
    page = ctx.new_page()
    page.set_default_timeout(9000)
    attach(page, "ai")
    page.goto(AI, wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    check("AI banner live", wait_attr(page, "[data-testid=mode-banner]", "data-mode", "live"))

    # 빈 입력 + 파일 불러오기 UX
    check("empty: blank CTA", page.get_by_role("button", name="내 이력서·공고 새로 입력하기").count() > 0)
    check("empty: file CTA", page.get_by_text(".txt / .md 파일 불러오기").count() > 0)
    check("empty: sample separated", page.get_by_text("예시로 테스트하기").count() > 0)

    def blank():
        page.get_by_role("button", name="내 이력서·공고 새로 입력하기").click()
        page.wait_for_timeout(500)
        value = page.locator("input[placeholder='예: 클라우드플로우']").input_value()
        check("blank clears company", value == "", value)
        check("blank clears package", page.get_by_text("내 이력서와 공고를 넣으면").count() > 0)

    step("blank inputs", blank)

    def import_job():
        page.set_input_files("[data-testid='empty-import-input']", os.path.join(FIXTURES, "my-job.txt"))
        page.wait_for_selector("[data-testid=import-summary]", timeout=10000)
        summary = page.inner_text("[data-testid=import-summary]")
        check("job file parsed", "담당 업무 4줄" in summary, summary)
        check("job kind guessed", page.get_attribute("[data-testid=import-kind-job]", "aria-pressed") == "true")
        page.click("[data-testid=import-apply]")
        page.wait_for_timeout(600)
        check("job company filled", page.locator("input[placeholder='예: 클라우드플로우']").input_value() == "노바커머스")
        check("job role filled", page.locator("input[placeholder='예: 인하우스 PR 매니저']").input_value() == "브랜드 커뮤니케이션 매니저")
        duties = page.locator("textarea[placeholder^='미디어 릴레이션']").input_value()
        check("job duties filled", "브랜드 캠페인 기획과 실행" in duties, duties[:60])
        reqs = page.locator("textarea[placeholder^='경력 5년 이상']").input_value()
        check("job requirements filled", "경력 4년 이상" in reqs, reqs[:60])

    step("import job file", import_job)

    def import_resume():
        page.set_input_files("[data-testid='input-import-input']", os.path.join(FIXTURES, "my-resume.txt"))
        page.wait_for_selector("[data-testid=import-summary]", timeout=10000)
        summary = page.inner_text("[data-testid=import-summary]")
        check("resume file parsed", "경력 2개" in summary and "문장 7개" in summary, summary)
        check("resume kind guessed", page.get_attribute("[data-testid=import-kind-resume]", "aria-pressed") == "true")
        page.click("[data-testid=import-apply]")
        page.wait_for_timeout(600)
        values = page.eval_on_selector_all("input", "els => els.map(e => e.value)")
        check("resume name filled", "김하람" in values, str(values[:6]))
        check("resume experience company", "노바커머스" in values)
        check("resume experience period", "2021.03 – 현재" in values)
        skills_text = page.inner_text("body")
        check("resume skills parsed", "인플루언서 마케팅" in skills_text)

    step("import resume file", import_resume)

    def generate_ai():
        page.get_by_role("button", name="지원 패키지 생성").click()
        page.wait_for_selector("text=적합도 진단", timeout=25000)
        page.wait_for_timeout(2500)
        chip = page.inner_text("[data-testid=package-engine]")
        check("AI package engine chip", "AI 분석" in chip, chip)
        pkg = packages(page)
        check("package saved", len(pkg) == 1, str(len(pkg)))
        check("package has ai intro", pkg and pkg[0].get("intro", {}).get("source") == "ai")
        check("package has ai fit", bool(pkg and pkg[0].get("aiFit")))
        check("fabricated rewrite dropped", bool(pkg and all("999억" not in r["after"] for r in pkg[0]["rewrites"])))
        check("guard warning recorded", bool(pkg and pkg[0].get("aiWarnings")), str(pkg[0].get("aiWarnings") if pkg else ""))
        check("no fabricated number on page", "999억" not in page.inner_text("body"))
        check("AI fit card", page.locator("[data-testid=ai-fit]").count() == 1)

    step("generate with AI", generate_ai)

    def match_tab():
        check("score ring", page.locator("svg circle").count() >= 1)
        check("keyword matrix", page.locator("button:has-text('중요도')").count() >= 8)
        check("match tab labelled", page.get_by_text("공고 키워드").count() > 0)

    step("match tab", match_tab)

    def rewrite_tab():
        page.get_by_role("button", name="경력 리라이트").first.click()
        page.wait_for_timeout(900)
        check("rewrite tab", page.get_by_text("공고 문구에 맞춘 경력기술서").count() > 0)
        check("summary rewrite", page.get_by_text("지원 요약 프로필").count() > 0)
        check("diff cards", page.locator("text=수정 제안").count() >= 2 or page.locator("text=유지 권장").count() >= 1)
        before = packages(page)[0]["rewrites"]
        page.get_by_role("button", name="전체 해제").click()
        page.wait_for_timeout(700)
        released = packages(page)[0]["rewrites"]
        check("release all rewrites", all(not r["adopted"] for r in released))
        page.get_by_role("button", name="전체 반영").click()
        page.wait_for_timeout(700)
        check("adopt all rewrites", all(r["adopted"] for r in packages(page)[0]["rewrites"]))
        check("rewrite count stable", len(before) == len(packages(page)[0]["rewrites"]))

    step("rewrite tab", rewrite_tab)

    def pitch_tab():
        page.get_by_role("button", name="1분 소개").first.click()
        page.wait_for_timeout(800)
        source = page.inner_text("[data-testid=intro-source]")
        length = page.inner_text("[data-testid=intro-length]")
        chars = int("".join(ch for ch in length if ch.isdigit()) or 0)
        text = page.inner_text("[data-testid=intro-text]")
        check("pitch tile present", page.get_by_text("1분 자기소개").count() > 0)
        check("intro from AI", "AI 생성" in source, source)
        check("intro length 250-320", 250 <= chars <= 320, f"{chars}자")
        check("intro quotes source", any(token in text for token in ["28%", "4.2만", "24시간"]), text[:80])
        check("reverse questions 3", page.get_by_text("마지막 역질문 3개").count() > 0)
        check("reverse question copy", page.get_by_role("button", name="질문 복사").count() >= 3)
        page.locator("[data-testid=intro-regenerate]").click()
        page.wait_for_timeout(1500)
        check("intro regenerate keeps ai", "AI 생성" in page.inner_text("[data-testid=intro-source]"))

    step("pitch tab", pitch_tab)

    def mock_interview():
        page.get_by_role("button", name="면접", exact=True).first.click()
        page.wait_for_timeout(600)
        page.click("[data-testid=mode-mock]")
        page.wait_for_timeout(500)
        check("mock timer starts at 01:30", page.inner_text("[data-testid=mock-timer]") == "01:30")
        page.click("[data-testid=mock-start]")
        page.wait_for_timeout(2600)
        timer = page.inner_text("[data-testid=mock-timer]")
        left = int(timer.split(":")[0]) * 60 + int(timer.split(":")[1])
        check("mock timer counts down", 0 < left < 90, timer)
        answer = (
            "당시 위기 이슈가 터졌고 제가 먼저 입장문 초안을 작성해 24시간 내 배포했습니다. "
            "이해관계 부서와 문장을 조율했고, 결과적으로 기사 노출이 5건에서 1건으로 줄었습니다. "
            "이후 같은 이슈가 다시 생기지 않도록 대응 매뉴얼을 만들었습니다."
        )
        page.fill("[data-testid=mock-answer]", answer)
        page.click("[data-testid=mock-submit]")
        page.wait_for_selector("[data-testid=mock-feedback]", timeout=20000)
        page.wait_for_timeout(600)
        score = page.inner_text("[data-testid=mock-score]")
        follow = page.inner_text("[data-testid=mock-followup]")
        check("mock feedback score", score.strip().isdigit(), score)
        check("mock follow-up question", len(follow) > 8, follow)
        check("mock fabricated praise dropped", "777억" not in page.inner_text("body"))
        fb = packages(page)[0].get("feedback") or []
        check("feedback saved", len(fb) == 1 and fb[0]["source"] == "ai", str(len(fb)))
        page.click("[data-testid=mock-continue]")
        page.wait_for_timeout(500)
        check("follow-up continues", page.inner_text("[data-testid=mock-timer]") == "01:30")

    step("mock interview", mock_interview)

    def tracker_flow():
        page.get_by_role("button", name="지원 현황").first.click()
        page.wait_for_timeout(700)
        rows = page.locator("[data-testid=tracker-row]")
        check("tracker auto entry", rows.count() == 1, str(rows.count()))
        page.select_option("select[aria-label$='진행 단계']", "1차")
        page.wait_for_timeout(600)
        entry = tracker(page)[0]
        check("tracker stage saved", entry["stage"] == "1차", entry["stage"])
        hope = page.locator("input[aria-label='희망 연봉(만원)']")
        offer = page.locator("input[aria-label='제시 연봉(만원)']")
        hope.fill("5200")
        offer.fill("5500")
        page.wait_for_timeout(700)
        detail = page.inner_text("[data-testid=tracker-detail]")
        check("salary delta shown", "300만원" in detail, detail[:120])
        first = page.locator("[data-testid=negotiation] button").first
        first.click()
        page.wait_for_timeout(600)
        saved = tracker(page)[0]
        check("negotiation saved", saved["negotiation"][0]["done"] is True)
        check("tracker company", saved["company"] == "노바커머스", saved["company"])
        check("tracker score linked", saved["score"] is not None)

    step("tracker flow", tracker_flow)

    def back_to_studio():
        page.get_by_role("button", name="지원 스튜디오").first.click()
        page.wait_for_timeout(600)
        check("studio back", page.locator("[data-testid=mode-banner]").count() == 1)

    step("back to studio", back_to_studio)

    def export_md():
        page.get_by_role("button", name="내보내기").first.click()
        page.wait_for_timeout(800)
        with page.expect_download() as dl:
            page.locator("button:has-text('.md')").first.click()
        content = open(dl.value.path(), encoding="utf-8").read()
        check("markdown exported", len(content) > 3000, str(len(content)))
        for section in ["적합도 요약", "키워드 매칭과 갭", "핵심 어필 포인트", "경력기술서 리라이트", "1분 자기소개 · 역질문", "면접 예상 질문 & STAR", "모의면접 피드백", "제출 전 체크리스트"]:
            check(f"markdown section {section}", section in content)
        check("markdown company", "노바커머스" in content)
        check("markdown no fabricated number", "999억" not in content)

    step("export markdown", export_md)

    def reanalyze():
        page.locator("[data-testid=mode-banner] button:has-text('AI로 다시 분석')").click()
        page.wait_for_timeout(3500)
        chip = page.inner_text("[data-testid=package-engine]")
        check("reanalyze stays AI", "AI 분석" in chip, chip)
        intro_source = packages(page)[0].get("intro", {}).get("source")
        check("reanalyze keeps ai intro", intro_source == "ai", str(intro_source))

    step("AI reanalyze", reanalyze)

    def upstream_failure():
        page.get_by_role("button", name="채용 공고", exact=True).first.click()
        page.wait_for_timeout(300)
        duties = page.locator("textarea[placeholder^='미디어 릴레이션']")
        duties.fill(duties.input_value() + "\nFAIL_UPSTREAM")
        page.wait_for_timeout(300)
        page.get_by_role("button", name="다시 생성").first.click()
        page.wait_for_timeout(5000)
        chip = page.inner_text("[data-testid=package-engine]")
        check("upstream failure falls back to rule", "규칙 엔진" in chip, chip)
        toast = page.inner_text("body")
        check("upstream failure notice", "규칙 엔진 결과를 표시합니다" in toast)

    step("upstream failure fallback", upstream_failure)

    def star_and_storage():
        page.get_by_role("button", name="면접", exact=True).first.click()
        page.wait_for_timeout(600)
        page.get_by_role("button", name="STAR 준비").click()
        page.wait_for_timeout(500)
        fields = page.locator("textarea.star-field")
        check("star fields", fields.count() >= 24, str(fields.count()))
        fields.first.fill("팀장님, 이 수치는 6개월간 자체 집계 기준으로 측정했습니다.")
        page.wait_for_timeout(900)
        check("star edit saved", packages(page)[0]["questions"][0]["edited"] is True)

    step("star editing", star_and_storage)

    def raw_jd():
        page.get_by_role("button", name="채용 공고", exact=True).first.click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name="원문 입력").click()
        page.wait_for_timeout(300)
        page.locator("textarea[placeholder*='담당 업무']").fill("담당 업무\n- 보도자료 작성과 기자 대응\n\n자격 요건\n- PR 경력 5년 이상\n\n우대 사항\n- SaaS 경험\n\n조직 문화\n- 빠른 실행")
        page.get_by_role("button", name="문단으로 자동 나누기").click()
        page.wait_for_timeout(600)
        check("raw jd split", page.locator("textarea[placeholder^='미디어 릴레이션']").input_value().startswith("보도자료 작성"))
        check("raw jd requirements", "PR 경력 5년 이상" in page.locator("textarea[placeholder^='경력 5년 이상']").input_value())
        check("raw jd tone", "빠른 실행" in page.locator("textarea[placeholder^='빠른 실행']").input_value())

    step("raw jd paste", raw_jd)

    def ai_settings():
        page.get_by_role("button", name="AI 연결").first.click()
        page.wait_for_timeout(500)
        check("ai modal", page.get_by_text("AI 분석 연결").count() > 0)
        check("ai modal status", "실시간 AI 분석 연결됨" in page.inner_text("[data-testid=ai-status]"))
        page.fill("[data-testid=ai-key-input]", "sk-personal-key-not-real-0000")
        page.get_by_role("button", name="저장").click()
        page.wait_for_timeout(600)
        cfg = page.evaluate("JSON.parse(localStorage.getItem('jobfit.api.v2')||'{}')")
        check("personal key saved", cfg.get("apiKey", "").startswith("sk-personal") and cfg.get("sendKey") is True, str(cfg))

    step("ai settings modal", ai_settings)

    def history_flow():
        page.get_by_role("button", name="패키지 히스토리").first.click()
        page.wait_for_timeout(800)
        count = len(packages(page))
        check("history rows", page.get_by_title("비교 대상으로 선택").count() == count, f"{count} packages")
        picks = page.get_by_title("비교 대상으로 선택")
        if picks.count() >= 2:
            picks.nth(0).click()
            picks.nth(1).click()
            page.wait_for_timeout(700)
            check("compare panel", page.get_by_text("지원 건 비교").count() > 0)
            before = picks.count()
            page.get_by_label("기록 삭제").first.click()
            page.wait_for_timeout(700)
            check("delete package", page.get_by_title("비교 대상으로 선택").count() == before - 1)
        page.get_by_role("button", name="지원 스튜디오").first.click()
        page.wait_for_timeout(500)

    step("history compare", history_flow)

    # ────────────────────────────── 90초 타이머 만료 ──────────────────────────────
    def timer_expiry():
        ctx2 = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p2 = ctx2.new_page()
        p2.clock.install()
        p2.goto(AI, wait_until="domcontentloaded")
        p2.clock.run_for(2000)
        p2.get_by_role("button", name="이 예시로 생성").first.click()
        p2.clock.run_for(4000)
        p2.wait_for_selector("text=적합도 진단", timeout=20000)
        p2.clock.run_for(6000)
        p2.get_by_role("button", name="면접", exact=True).first.click()
        p2.clock.run_for(1000)
        p2.click("[data-testid=mode-mock]")
        p2.clock.run_for(500)
        p2.click("[data-testid=mock-start]")
        p2.clock.run_for(5000)
        left_text = p2.inner_text("[data-testid=mock-timer]")
        left = int(left_text.split(":")[0]) * 60 + int(left_text.split(":")[1])
        check("fake clock countdown", 80 <= left <= 86, left_text)
        p2.clock.run_for(90000)
        p2.wait_for_timeout(300)
        timer_text = p2.inner_text("[data-testid=mock-timer]")
        body = p2.inner_text("body")
        check("timer ends at 00:00", timer_text == "00:00", timer_text)
        check("time-up notice", "90초가 끝났습니다" in body)
        ctx2.close()

    step("90s timer expiry", timer_expiry)

    # ─────────────────────────────── 서버 키 없음 (501) ───────────────────────────────
    def nokey_mode():
        ctx3 = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p3 = ctx3.new_page()
        attach(p3, "nokey")
        p3.goto(NOKEY, wait_until="domcontentloaded")
        p3.wait_for_timeout(1200)
        check("nokey banner local", wait_attr(p3, "[data-testid=mode-banner]", "data-mode", "local"))
        check("nokey reason", "OPENAI_API_KEY" in p3.inner_text("[data-testid=mode-banner]"))
        p3.get_by_role("button", name="이 예시로 생성").first.click()
        p3.wait_for_selector("text=적합도 진단", timeout=25000)
        p3.wait_for_timeout(1200)
        check("nokey falls back to rule engine", "규칙 엔진" in p3.inner_text("[data-testid=package-engine]"))
        p3.get_by_role("button", name="1분 소개").first.click()
        p3.wait_for_timeout(700)
        check("nokey intro is rule", "규칙 생성" in p3.inner_text("[data-testid=intro-source]"))
        length = p3.inner_text("[data-testid=intro-length]")
        chars = int("".join(ch for ch in length if ch.isdigit()) or 0)
        check("rule intro 250-320", 250 <= chars <= 320, f"{chars}자")
        p3.get_by_role("button", name="면접", exact=True).first.click()
        p3.wait_for_timeout(500)
        p3.click("[data-testid=mode-mock]")
        p3.wait_for_timeout(400)
        p3.fill("[data-testid=mock-answer]", "당시 프로젝트에서 제가 직접 캠페인을 기획해 참여율을 12%에서 18%로 올렸습니다. 팀과 주간으로 지표를 점검했습니다.")
        p3.click("[data-testid=mock-submit]")
        p3.wait_for_selector("[data-testid=mock-feedback]", timeout=15000)
        p3.wait_for_timeout(500)
        fb = packages(p3)[0].get("feedback") or []
        check("nokey feedback is rule", fb and fb[0]["source"] == "rule", str(fb[:1]))
        p3.locator("[data-testid=mode-banner] button:has-text('AI로 다시 분석')").click()
        p3.wait_for_timeout(1500)
        check("nokey reanalyze opens settings", p3.get_by_text("AI 분석 연결").count() > 0)
        ctx3.close()

    step("no-key fallback", nokey_mode)

    # ───────────────────────────────── 정적 호스팅(오프라인) ─────────────────────────────────
    def offline_mode():
        ctx4 = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p4 = ctx4.new_page()
        attach(p4, "offline")
        p4.goto(OFFLINE, wait_until="domcontentloaded")
        p4.wait_for_timeout(1200)
        check("offline banner local", wait_attr(p4, "[data-testid=mode-banner]", "data-mode", "local"))
        p4.get_by_role("button", name="이 예시로 생성").first.click()
        p4.wait_for_selector("text=적합도 진단", timeout=25000)
        p4.wait_for_timeout(1000)
        check("offline works with rule engine", "규칙 엔진" in p4.inner_text("[data-testid=package-engine]"))
        check("offline tracker auto entry", len(tracker(p4)) == 1)
        ctx4.close()

    step("offline hosting", offline_mode)

    # ───────────────────────────── Gemini 서버 키 모드 (UI) ─────────────────────────────
    def gemini_mode():
        ctx6 = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ko-KR")
        p6 = ctx6.new_page()
        attach(p6, "gemini")
        p6.goto(GEMINI, wait_until="domcontentloaded")
        p6.wait_for_timeout(1200)
        check("gemini banner live", wait_attr(p6, "[data-testid=mode-banner]", "data-mode", "live"))
        banner = p6.inner_text("[data-testid=mode-banner]")
        check("gemini banner model", "gemini-3.5-flash-lite" in banner, banner[:100])
        p6.get_by_role("button", name="이 예시로 생성").first.click()
        p6.wait_for_selector("text=적합도 진단", timeout=25000)
        p6.wait_for_timeout(1800)
        check("gemini AI package", "AI 분석" in p6.inner_text("[data-testid=package-engine]"))
        p6.get_by_role("button", name="1분 소개").first.click()
        p6.wait_for_timeout(800)
        check("gemini intro source", "AI 생성" in p6.inner_text("[data-testid=intro-source]"))
        ctx6.close()

    step("gemini server key mode", gemini_mode)

    # ─────────────────────────────────── 모바일 390px ───────────────────────────────────
    def mobile():
        mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
        mp = mctx.new_page()
        attach(mp, "mobile")
        mp.goto(AI, wait_until="domcontentloaded")
        mp.wait_for_timeout(1200)
        check("mobile no overflow (empty)", no_overflow(mp), str(mp.evaluate("document.documentElement.scrollWidth")))
        check("mobile CTA visible", mp.get_by_role("button", name="내 이력서·공고 새로 입력하기").count() > 0)
        mp.get_by_role("button", name="공고·경력").last.click()
        mp.wait_for_timeout(400)
        check("mobile banner visible", mp.locator("[data-testid=mode-banner]").count() == 1)
        mp.get_by_role("button", name="지원 패키지 생성").click()
        mp.wait_for_selector("text=적합도 진단", timeout=25000)
        mp.wait_for_timeout(1800)
        check("mobile no overflow (match)", no_overflow(mp))
        mp.get_by_role("button", name="1분 소개").last.click()
        mp.wait_for_timeout(700)
        check("mobile no overflow (pitch)", no_overflow(mp))
        check("mobile pitch text", mp.locator("[data-testid=intro-text]").count() == 1)
        mp.get_by_role("button", name="면접").last.click()
        mp.wait_for_timeout(600)
        mp.click("[data-testid=mode-mock]")
        mp.wait_for_timeout(500)
        check("mobile no overflow (mock)", no_overflow(mp))
        check("mobile nav has tracker", mp.get_by_role("button", name="지원", exact=True).count() >= 1)
        mp.get_by_role("button", name="지원", exact=True).last.click()
        mp.wait_for_timeout(800)
        check("mobile tracker view", mp.locator("[data-testid=tracker-row]").count() >= 1)
        check("mobile no overflow (tracker)", no_overflow(mp))
        mctx.close()

    step("mobile 390px", mobile)

    browser.close()

print("CHECKS")
for name, ok, detail in checks:
    if ok:
        print("PASS " + name)
    else:
        print("FAIL " + name + (f"  <{detail}>" if detail else ""))
print(f"SUMMARY {sum(1 for _, ok, _ in checks if ok)}/{len(checks)} passed")
print("ERRORS:", len(errors))
for err in errors[:20]:
    print(err)
sys.exit(0 if all(ok for _, ok, _ in checks) and not errors else 1)
