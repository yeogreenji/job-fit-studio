"""커리어 프로필 · 적합도 · 지원 패키지 · 지원 파이프라인 점검 (가짜 공고 응답으로 화면만 검사).

실제 채용 사이트에 접속하지 않도록 /api/jobs 응답을 가로챕니다.
  python3 scripts/check-v2.py
"""

import json
import os
import socket
import subprocess
import sys
import time
import atexit

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
_lib_dirs = [path for path in ("/workspace/tmp/pwlibs/usr/lib/x86_64-linux-gnu", "/workspace/.libs/usr/lib/x86_64-linux-gnu") if os.path.isdir(path)]
os.environ["LD_LIBRARY_PATH"] = ":".join(_lib_dirs + ([os.environ["LD_LIBRARY_PATH"]] if os.environ.get("LD_LIBRARY_PATH") else []))
from playwright.sync_api import sync_playwright

ROOT = "/workspace/projects/job-fit-studio"
NODE = "/workspace/.tools/node-v22.12.0-linux-x64/bin/node"
FIXTURES = os.path.join(ROOT, "scripts/fixtures")
OUT = "/workspace/tmp/jobfit-v2"
os.makedirs(OUT, exist_ok=True)

checks = []


def check(name, cond, detail=""):
    checks.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  <{detail}>"), flush=True)


DEMO = json.load(open(os.path.join(FIXTURES, "demo-jobs.json"), encoding="utf-8"))
JOBS = DEMO["jobs"]
PROFILE = DEMO["profile"]
PLAN_PRO = {"plan": "pro", "trial": True, "startedAt": "2026-11-24T00:00:00.000Z", "expiresAt": "2026-12-08T00:00:00.000Z"}

def saved_job(index: int, status: str = "준비중", memo: str = "") -> dict:
    job = JOBS[index]
    now = "2026-11-24T00:00:00.000Z"
    return {
        "id": f"auto-{job['source']}-{job['sourceJobId']}",
        "job": {
            "id": job["id"],
            "company": job["company"],
            "role": job["role"],
            "employmentType": job["employmentType"],
            "location": job["location"],
            "deadline": job["deadline"],
            "responsibilities": job["responsibilities"],
            "requirements": job["requirements"],
            "preferred": job["preferred"],
            "documents": job["documents"],
            "applyUrl": job["applyUrl"],
            "applyLabel": "원문 지원",
            "tone": "",
            "experience": job["experience"],
            "salary": job["salary"],
            "tags": job["tags"],
            "conditions": job["conditions"],
            "detailLevel": "full",
            "companyType": job["companyType"],
        },
        "source": {
            "kind": "auto",
            "sourceId": job["source"],
            "sourceJobId": job["sourceJobId"],
            "site": job["sourceName"],
            "url": job["url"],
            "fetchedAt": now,
            "detailLevel": "full",
        },
        "applyUrl": job["applyUrl"],
        "status": status,
        "memo": memo,
        "documentsChecked": [],
        "saved": True,
        "createdAt": now,
        "updatedAt": now,
    }


SAVED_JOBS = [saved_job(index) for index in range(5)]

SEED = (
    "localStorage.setItem('jobfit.career.v1', %s); localStorage.setItem('jobfit.plan.v1', %s);"
    % (json.dumps(json.dumps(PROFILE, ensure_ascii=False)), json.dumps(json.dumps(PLAN_PRO)))
)


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def start_server():
    global PORT
    PORT = free_port()
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=0.5):
            raise RuntimeError(f"port {PORT} in use")
    except OSError:
        pass
    proc = subprocess.Popen(
        [NODE, "scripts/e2e-server.mjs", "offline", str(PORT)],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    atexit.register(proc.terminate)
    for _ in range(200):
        try:
            socket.create_connection(("127.0.0.1", PORT), timeout=0.5)
            return proc
        except OSError:
            time.sleep(0.3)
    raise RuntimeError("server did not start")


def route_api(page):
    def handle_jobs(route):
        payload = {
            "ok": True,
            "query": "홍보",
            "jobs": JOBS,
            "sources": [
                {"id": "remember", "name": "리멤버", "ok": True, "count": 2, "full": 2, "ms": 320},
                {"id": "wanted", "name": "원티드", "ok": True, "count": 2, "full": 2, "ms": 410},
                {"id": "saramin", "name": "사람인", "ok": True, "count": 1, "full": 1, "ms": 520},
                {"id": "jobkorea", "name": "잡코리아", "ok": True, "count": 1, "full": 1, "ms": 610},
            ],
            "fetchedAt": "2026-11-24T00:20:00.000Z",
            "filter": {
                "profile": "seoul-inhouse-pr",
                "label": "서울 인하우스 홍보·PR (과차장급)",
                "raw": 9,
                "kept": len(JOBS),
                "excluded": {"region": 1, "role": 1, "junior": 1, "agency": 0},
            },
        }
        route.fulfill(status=200, content_type="application/json", body=json.dumps(payload, ensure_ascii=False))

    page.route("**/api/jobs", handle_jobs)
    page.route("**/api/analyze", lambda route: route.fulfill(
        status=501,
        content_type="application/json",
        body=json.dumps({"ok": False, "error": {"code": "no_key", "message": "규칙 엔진 모드"}}),
    ))


def no_overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0


def main():
    start_server()
    base = f"http://127.0.0.1:{PORT}/"
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR", accept_downloads=True)
        ctx.add_init_script(SEED)
        page = ctx.new_page()
        route_api(page)
        page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))
        page.on("console", lambda m: errors.append(f"[console:{m.type}] {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
        page.goto(base, wait_until="domcontentloaded")
        page.wait_for_selector("[data-testid=hub-job]", timeout=45000)
        page.wait_for_timeout(1200)

        # 1. 프로필이 적합도를 만든다
        check("career strip", page.locator("[data-testid=career-strip]").count() == 1)
        check("career saved badge", "저장됨" in page.inner_text("[data-testid=career-source]"))
        badges = page.locator("[data-testid=fit-badge]")
        check("fit badges rendered", badges.count() >= 4, str(badges.count()))
        scores = page.evaluate("Array.from(document.querySelectorAll('[data-testid=fit-badge]')).map(el => Number(el.dataset.score))")
        check("fit scores differ", len(set(scores)) >= 3, str(scores))
        check("fit keywords on card", page.locator("[data-testid=fit-keywords]").count() >= 3)
        page.screenshot(path=f"{OUT}/01-desktop-fit.png")

        # 2. 적합도순 정렬 · 필터
        page.click("[data-testid=sort-fit]")
        page.wait_for_timeout(400)
        ordered = page.evaluate("Array.from(document.querySelectorAll('[data-testid=hub-job]')).map(el => Number(el.dataset.fit ?? -1))")
        check("sort by fit desc", ordered == sorted(ordered, reverse=True), str(ordered))
        page.click("[data-testid=filter-toggle]")
        page.wait_for_timeout(300)
        check("filter panel opens", page.locator("[data-testid=filter-panel]").count() == 1)
        page.select_option("[data-testid=collect-years]", "5~9년")
        page.wait_for_timeout(300)
        roles = page.inner_text("[data-testid=hub-list]")
        check("year filter keeps 5~9", "홍보 PR 과장" in roles, roles[:120])
        page.select_option("[data-testid=collect-years]", "전체")
        page.select_option("[data-testid=collect-minfit]", "60")
        page.wait_for_timeout(300)
        check("fit filter 60+", page.locator("[data-testid=hub-job]").count() >= 2, str(page.locator("[data-testid=hub-job]").count()))
        page.select_option("[data-testid=collect-minfit]", "0")
        page.click("[data-testid=hide-excluded-on]")
        page.wait_for_timeout(300)
        check("hide excluded toggled", page.locator("[data-testid=hide-excluded-off]").count() == 1)
        page.click("[data-testid=hide-excluded-off]")
        page.click("[data-testid=sort-latest]")

        # 3. 상세: 적합도 근거 · 지원 패키지
        page.locator("[data-testid=hub-job]").first.click()
        page.wait_for_timeout(600)
        check("fit panel", page.locator("[data-testid=hub-fit]").count() == 1)
        check("fit parts", page.locator("[data-testid^=fit-part-]").count() == 5)
        check("fit matched chips", page.locator("[data-testid=fit-matched]").count() >= 1)
        check("fit missing chips", page.locator("[data-testid=fit-missing]").count() >= 1)

        page.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        page.wait_for_selector("[data-testid=resume-status]", timeout=20000)
        page.wait_for_timeout(1200)
        page.locator("[data-testid=hub-kit]").scroll_into_view_if_needed()
        page.wait_for_timeout(400)
        check("kit card", page.locator("[data-testid=hub-kit]").count() == 1)
        check("kit appeals", page.locator("[data-testid=kit-appeal]").count() >= 1, page.inner_text("[data-testid=hub-kit]")[:160])
        page.click("[data-testid=kit-tab-intro]")
        page.wait_for_timeout(250)
        intro = page.inner_text("[data-testid=kit-intro]")
        check("kit intro text", len(intro) > 80, intro[:80])
        page.click("[data-testid=kit-tab-interview]")
        page.wait_for_timeout(250)
        check("kit 5 questions", page.locator("[data-testid=kit-question]").count() == 5, str(page.locator("[data-testid=kit-question]").count()))
        page.click("[data-testid=kit-tab-negotiation]")
        page.wait_for_timeout(250)
        check("kit negotiation", page.locator("[data-testid=kit-negotiation]").count() == 1)
        check("kit salary used", "5,500" in page.inner_text("[data-testid=kit-negotiation]"), page.inner_text("[data-testid=kit-negotiation]")[:120])
        with page.expect_download(timeout=8000) as download_info:
            page.click("[data-testid=kit-export]")
        download = download_info.value
        check("kit md download", download.suggested_filename.endswith(".md"), download.suggested_filename)
        page.screenshot(path=f"{OUT}/02-desktop-kit.png")
        page.click("[data-testid=deep-open]")
        page.wait_for_selector("[data-testid=result]", timeout=30000)
        page.wait_for_timeout(600)
        check("deep result opens", page.locator("[data-testid=section-fit]").count() == 1 and page.locator("[data-testid=section-interview]").count() == 1)
        page.click("[data-testid=new-job]")
        page.wait_for_timeout(600)
        check("deep returns to hub", page.locator("[data-testid=collect-bar]").count() == 1)

        # 4. URL·JD 탭
        page.click("[data-testid=collect-tab-manual]")
        page.wait_for_timeout(400)
        check("manual panel open", page.evaluate("document.querySelector('[data-testid=manual-add]')?.open === true"))
        check("paste panel visible", page.locator("[data-testid=hub-paste-text]").count() == 1)
        page.screenshot(path=f"{OUT}/03-desktop-manual.png")
        page.fill("[data-testid=hub-paste-text]", open(os.path.join(FIXTURES, "my-job.txt"), encoding="utf-8").read())
        page.fill("[data-testid=hub-paste-url]", "https://blocked-careers.example/jobs/9")
        page.click("[data-testid=hub-paste-add]")
        page.wait_for_timeout(900)
        check("pasted job opens detail", page.locator("[data-testid=hub-paste-text]").count() == 0)
        page.locator("[data-testid=hub-list]").scroll_into_view_if_needed()

        # 5. 파이프라인
        page.click("[data-testid=nav-tracker]")
        page.wait_for_timeout(800)
        check("pipeline 5 columns", page.locator("[data-testid^=tracker-column-]").count() == 5, str(page.locator("[data-testid^=tracker-column-]").count()))
        check("pipeline card", page.locator("[data-testid=tracker-card]").count() >= 1)
        check("pipeline dday", page.locator("[data-testid=pipeline-dday]").count() >= 1, page.inner_text("[data-testid=tracker-column-interest]")[:100])
        dday_text = page.evaluate("Array.from(document.querySelectorAll('[data-testid=pipeline-dday]')).map(el => el.innerText).join(' | ')")
        dday_nums = [int(x) for x in __import__("re").findall(r"D-(\d+)", dday_text)]
        check("dday within 60 days", dday_nums and max(dday_nums) <= 60, dday_text)
        before = page.inner_text("[data-testid=tracker-column-interest]")
        page.locator("[data-testid=pipeline-next]").first.click()
        page.wait_for_timeout(500)
        after = page.inner_text("[data-testid=tracker-column-applied]")
        check("pipeline move next", "없음" not in after or "없음" not in before, after[:100])
        page.locator("[data-testid=pipeline-memo-toggle]").first.click()
        page.wait_for_timeout(250)
        check("pipeline memo input", page.locator("[data-testid=pipeline-memo]").count() == 1)
        page.fill("[data-testid=pipeline-memo]", "1차 면접 12/2 14시")
        page.wait_for_timeout(300)
        page.fill("[data-testid=pipeline-search]", "면접")
        page.wait_for_timeout(300)
        check("pipeline search filters", page.locator("[data-testid=tracker-card]").count() == 1, str(page.locator("[data-testid=tracker-card]").count()))
        page.fill("[data-testid=pipeline-search]", "")
        page.wait_for_timeout(200)
        page.screenshot(path=f"{OUT}/04-desktop-pipeline.png")
        check("desktop no overflow", no_overflow(page))

        # 6. 프로필 수정 창
        page.click("[data-testid=nav-studio]")
        page.wait_for_timeout(500)
        page.click("[data-testid=open-pricing]")
        page.wait_for_selector("[data-testid=pricing-modal]", timeout=10000)
        check("pricing modal", page.locator("[data-testid=pricing-modal]").count() == 1)
        check("pricing pro current", page.get_attribute("[data-testid=plan-card-pro]", "data-active") == "true")
        check("pricing matrix rows", page.locator("[data-testid=pricing-matrix] tbody tr").count() >= 8, str(page.locator("[data-testid=pricing-matrix] tbody tr").count()))
        check("pricing plan prices", "19,900" in page.inner_text("[data-testid=pricing-modal]") and "49,000" in page.inner_text("[data-testid=pricing-modal]"))
        page.click("[data-testid=plan-pro-trial]")
        page.wait_for_timeout(300)
        check("trial toggle off -> free", page.get_attribute("[data-testid=plan-pro-trial]", "aria-checked") == "false")
        page.click("[data-testid=plan-pro-trial]")
        page.wait_for_timeout(300)
        check("trial toggle on -> pro", page.get_attribute("[data-testid=plan-pro-trial]", "aria-checked") == "true")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        page.click("[data-testid=career-edit]")
        page.wait_for_timeout(300)
        check("career modal", page.locator("[data-testid=career-modal]").count() == 1)
        check("career role prefilled", page.input_value("[data-testid=career-role]") == PROFILE["role"], page.input_value("[data-testid=career-role]"))
        page.fill("[data-testid=career-years]", "9")
        page.click("[data-testid=career-save]")
        page.wait_for_timeout(500)
        stored = json.loads(page.evaluate("localStorage.getItem('jobfit.career.v1')"))
        check("career saved localStorage", stored.get("years") == 9, json.dumps(stored, ensure_ascii=False)[:120])
        page.screenshot(path=f"{OUT}/05-desktop-profile.png")
        ctx.close()

        # 7. 모바일
        mctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="ko-KR", is_mobile=True, has_touch=True, accept_downloads=True)
        mctx.add_init_script(SEED)
        mp = mctx.new_page()
        route_api(mp)
        mp.goto(base, wait_until="domcontentloaded")
        mp.wait_for_selector("[data-testid=hub-job]", timeout=45000)
        mp.wait_for_timeout(1000)
        mp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        mp.wait_for_selector("[data-testid=resume-status]", timeout=20000)
        mp.wait_for_timeout(800)
        check("mobile no overflow", no_overflow(mp))
        mp.locator("[data-testid=hub-kit]").scroll_into_view_if_needed()
        mp.wait_for_timeout(600)
        mp.screenshot(path=f"{OUT}/06-mobile-kit.png")
        mp.click("[data-testid=nav-tracker]")
        mp.wait_for_timeout(800)
        mp.screenshot(path=f"{OUT}/07-mobile-pipeline.png")
        mctx.close()

        # 8. 이력서 파일 → 커리어 프로필 자동 채움 (프로필이 비어 있는 새 브라우저)
        fctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
        fctx.add_init_script("localStorage.setItem('jobfit.plan.v1', %s);" % json.dumps(json.dumps(PLAN_PRO)))
        fp = fctx.new_page()
        route_api(fp)
        fp.goto(base, wait_until="domcontentloaded")
        fp.wait_for_selector("[data-testid=hub-job]", timeout=45000)
        fp.wait_for_timeout(900)
        check("fresh profile is draft", "이력서 초안" in fp.inner_text("[data-testid=career-source]"), fp.inner_text("[data-testid=career-source]"))
        fp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        fp.wait_for_selector("[data-testid=resume-status]", timeout=20000)
        fp.wait_for_timeout(1400)
        filled = json.loads(fp.evaluate("localStorage.getItem('jobfit.career.v1')") or "{}")
        check("resume fills role", filled.get("role") == "브랜드 커뮤니케이션 매니저", str(filled.get("role")))
        check("resume fills years", filled.get("years") == 6, str(filled.get("years")))
        check("resume fills keywords", len(filled.get("keywords") or []) >= 4, str(filled.get("keywords")))
        check("resume fills summary", "커뮤니케이터" in (filled.get("summary") or ""), str(filled.get("summary")))
        check("resume origin badge", "이력서에서 채움" in fp.inner_text("[data-testid=career-strip]"), fp.inner_text("[data-testid=career-strip]")[:140])
        check("profile saved after autofill", "저장됨" in fp.inner_text("[data-testid=career-source]"))
        check("fit badges after autofill", fp.locator("[data-testid=fit-badge]").count() >= 3, str(fp.locator("[data-testid=fit-badge]").count()))
        fp.screenshot(path=f"{OUT}/08-desktop-autofill.png")
        fctx.close()

        # 9. Free 파이프라인 5건 한도 → 요금제 안내
        lctx = browser.new_context(viewport={"width": 1440, "height": 1000}, locale="ko-KR")
        lctx.add_init_script("localStorage.setItem('jobfit.hub.jobs.v1', %s);" % json.dumps(json.dumps(SAVED_JOBS)))
        lp = lctx.new_page()
        route_api(lp)
        lp.goto(base, wait_until="domcontentloaded")
        lp.wait_for_selector("[data-testid=hub-job]", timeout=45000)
        lp.wait_for_timeout(900)
        lp.click("[data-testid=nav-tracker]")
        lp.wait_for_timeout(700)
        check("free limit shown in tracker", "5/5" in lp.inner_text("[data-testid=pipeline-count]") or lp.locator("[data-testid=pipeline-limit]").count() == 1, lp.inner_text("[data-testid=pipeline-count]"))
        lp.click("[data-testid=nav-studio]")
        lp.wait_for_timeout(700)
        lp.locator("[data-testid=job-save]").first.click()
        lp.wait_for_timeout(600)
        check("free save opens pricing", lp.locator("[data-testid=pricing-modal]").count() == 1)
        toast = lp.inner_text("[data-testid=toast]") if lp.locator("[data-testid=toast]").count() else ""
        check("free limit toast", "5건" in toast, toast[:100])
        lp.keyboard.press("Escape")
        lp.wait_for_timeout(300)
        kept = json.loads(lp.evaluate("localStorage.getItem('jobfit.hub.jobs.v1')||'[]'"))
        check("free limit keeps 5", len(kept) == 5, str(len(kept)))
        lctx.close()
        browser.close()

    print("\nconsole/page errors:", len(errors))
    for error in errors[:8]:
        print("  ", error)
    failed = [name for name, ok, _ in checks if not ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    if failed:
        print("FAILED:", ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
