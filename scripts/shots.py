"""README용 화면 캡처 (커리어 프로필·적합도·지원 패키지·지원 파이프라인·요금제).

실제 채용 사이트 대신 고정된 예시 공고(scripts/fixtures/demo-jobs.json)로 화면만 찍습니다.
회사·인물은 모두 가상입니다.
  python3 scripts/shots-v2.py
"""

import json
import os
import socket
import subprocess
import time
import atexit

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
_lib_dirs = [path for path in ("/workspace/tmp/pwlibs/usr/lib/x86_64-linux-gnu", "/workspace/.libs/usr/lib/x86_64-linux-gnu") if os.path.isdir(path)]
os.environ["LD_LIBRARY_PATH"] = ":".join(_lib_dirs + ([os.environ["LD_LIBRARY_PATH"]] if os.environ.get("LD_LIBRARY_PATH") else []))
from playwright.sync_api import sync_playwright

ROOT = "/workspace/projects/job-fit-studio"
NODE = "/workspace/.tools/node-v22.12.0-linux-x64/bin/node"
FIXTURES = os.path.join(ROOT, "scripts/fixtures")
OUT = os.path.join(ROOT, "docs/screenshots")
os.makedirs(OUT, exist_ok=True)

DEMO = json.load(open(os.path.join(FIXTURES, "demo-jobs.json"), encoding="utf-8"))
JOBS = DEMO["jobs"]
PROFILE = DEMO["profile"]

STATUS_BY_INDEX = [("준비중", "담당자 컨택 완료 · 12/1 서류 마감"), ("지원완료", "11/22 제출 · 자소서 3문항"), ("서류합격", "12/2 1차 면접 안내 메일"), ("면접", "12/4 14시 · 사전 과제 준비"), ("오퍼", "처우 협의 1차 통화 완료")]
SAVED = [5, 0, 1, 2, 3]


def hub_job_payload(index, status, memo):
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


SAVED_JOBS = [hub_job_payload(index, *STATUS_BY_INDEX[position]) for position, index in enumerate(SAVED)]


def free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


BASE = ""


def start_server():
    global PORT, BASE
    PORT = free_port()
    BASE = f"http://127.0.0.1:{PORT}/"
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
    page.route("**/api/jobs", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps(payload, ensure_ascii=False)))
    page.route(
        "**/api/analyze",
        lambda route: route.fulfill(status=501, content_type="application/json", body=json.dumps({"ok": False, "error": {"code": "no_key"}})),
    )


def calm(page, ms=800):
    page.mouse.move(1200, 8)
    page.wait_for_timeout(ms)


PLAN = {
    "plan": "pro",
    "trial": True,
    "startedAt": "2026-11-24T00:00:00.000Z",
    "expiresAt": "2026-12-08T00:00:00.000Z",
}


def seed_script(saved: bool, pro: bool = False) -> str:
    parts = ["localStorage.setItem('jobfit.career.v1', %s);" % json.dumps(json.dumps(PROFILE, ensure_ascii=False))]
    if saved:
        parts.append("localStorage.setItem('jobfit.hub.jobs.v1', %s);" % json.dumps(json.dumps(SAVED_JOBS, ensure_ascii=False)))
    if pro:
        parts.append("localStorage.setItem('jobfit.plan.v1', %s);" % json.dumps(json.dumps(PLAN, ensure_ascii=False)))
    return " ".join(parts)


def new_page(browser, mobile: bool, saved: bool, wait: str = "hub-job", pro: bool = False):
    if mobile:
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
    else:
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2, locale="ko-KR")
    ctx.add_init_script(seed_script(saved, pro))
    page = ctx.new_page()
    route_api(page)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector(f"[data-testid={wait}]", timeout=45000)
    page.wait_for_timeout(6200)
    if wait == "hub-job":
        page.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
        page.wait_for_selector("[data-testid=resume-status]", timeout=20000)
        page.wait_for_timeout(6200)
    return ctx, page


def main():
    start_server()
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # 01~03 · 05: 수집된 공고 + 적합도 + 지원 패키지 (담은 공고 없이)
        ctx, page = new_page(browser, mobile=False, saved=False)
        page.click("[data-testid=sort-fit]")
        page.wait_for_timeout(600)
        calm(page, 1200)
        page.screenshot(path=f"{OUT}/01-desktop-start.png")

        page.locator("[data-testid=hub-job]").first.click()
        page.wait_for_timeout(1200)
        page.locator("[data-testid=hub-fit]").scroll_into_view_if_needed()
        calm(page, 900)
        page.screenshot(path=f"{OUT}/02-desktop-fit.png")

        # 요금제 — Free 상태에서 열고, Pro 체험을 켜서 아래 지원 패키지를 연다
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        page.click("[data-testid=open-pricing]")
        page.wait_for_timeout(700)
        calm(page, 600)
        page.screenshot(path=f"{OUT}/09-desktop-pricing.png")
        page.click("[data-testid=plan-select-pro]")
        page.wait_for_timeout(700)

        page.locator("[data-testid=hub-kit]").scroll_into_view_if_needed()
        page.wait_for_timeout(700)
        calm(page, 900)
        page.screenshot(path=f"{OUT}/03-desktop-kit.png")

        page.click("[data-testid=career-edit]")
        page.wait_for_timeout(700)
        calm(page, 600)
        page.screenshot(path=f"{OUT}/05-desktop-profile.png")
        page.keyboard.press("Escape")
        ctx.close()

        # 04: 지원 파이프라인 (단계별로 담아 둔 공고)
        ctx, page = new_page(browser, mobile=False, saved=True, wait="collect-bar")
        page.click("[data-testid=nav-tracker]")
        page.wait_for_timeout(1200)
        calm(page, 900)
        page.screenshot(path=f"{OUT}/04-desktop-pipeline.png")
        ctx.close()

        # 06~07: 모바일 허브 · 지원 패키지
        ctx, mp = new_page(browser, mobile=True, saved=False, pro=True)
        mp.screenshot(path=f"{OUT}/06-mobile-start.png")
        mp.locator("[data-testid=hub-kit]").scroll_into_view_if_needed()
        mp.wait_for_timeout(800)
        mp.screenshot(path=f"{OUT}/07-mobile-kit.png")
        ctx.close()

        # 08: 모바일 파이프라인
        ctx, mp = new_page(browser, mobile=True, saved=True, wait="collect-bar")
        mp.click("[data-testid=nav-tracker]")
        mp.wait_for_timeout(1200)
        mp.screenshot(path=f"{OUT}/08-mobile-pipeline.png")
        ctx.close()
        browser.close()
    print("saved:", sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()
