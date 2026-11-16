"""README용 화면 캡처 (새 URL·이력서 중심 흐름)."""

import os, socket, subprocess, time, atexit
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
os.environ["LD_LIBRARY_PATH"] = "/workspace/.libs/usr/lib/x86_64-linux-gnu" + ((":" + os.environ["LD_LIBRARY_PATH"]) if os.environ.get("LD_LIBRARY_PATH") else "")
from playwright.sync_api import sync_playwright

ROOT = "/workspace/projects/job-fit-studio"
NODE = "/workspace/.tools/node-v22.12.0-linux-x64/bin/node"
OUT = os.path.join(ROOT, "docs/screenshots")
PORT = 4183
FIXTURES = os.path.join(ROOT, "scripts/fixtures")
os.makedirs(OUT, exist_ok=True)

proc = subprocess.Popen([NODE, "scripts/e2e-server.mjs", "ai", str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(lambda: proc.terminate())
for _ in range(150):
    try:
        socket.create_connection(("127.0.0.1", PORT), timeout=0.5)
        break
    except OSError:
        time.sleep(0.3)

BASE = f"http://127.0.0.1:{PORT}/"
errors = []


def attach(page):
    page.on("console", lambda m: errors.append(f"[console:{m.type}] {m.text}") if m.type in ("error", "warning") and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))


def calm(page, ms=700):
    page.mouse.move(900, 8)
    page.wait_for_timeout(ms)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2, locale="ko-KR", accept_downloads=True)
    page = ctx.new_page()
    attach(page)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(1400)
    calm(page)
    page.screenshot(path=f"{OUT}/01-desktop-start.png")

    page.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
    page.wait_for_selector("[data-testid=resume-status]", timeout=15000)
    page.wait_for_timeout(900)
    calm(page)
    page.screenshot(path=f"{OUT}/02-desktop-resume.png")

    page.fill("[data-testid=job-url]", "https://www.wanted.co.kr/wd/123456")
    page.click("[data-testid=job-fetch]")
    page.wait_for_selector("[data-testid=job-preview]", timeout=25000)
    page.fill("[data-testid=target-salary]", "5500")
    page.click("[data-testid=priority-balance]")
    page.wait_for_timeout(900)
    calm(page)
    page.screenshot(path=f"{OUT}/03-desktop-job.png")

    page.click("[data-testid=generate]")
    page.wait_for_selector("[data-testid=result]", timeout=45000)
    page.wait_for_timeout(3000)
    calm(page)
    page.screenshot(path=f"{OUT}/04-desktop-fit.png")

    page.locator("[data-testid=section-pitch]").scroll_into_view_if_needed()
    calm(page)
    page.screenshot(path=f"{OUT}/05-desktop-pitch.png")

    page.locator("[data-testid=section-interview]").scroll_into_view_if_needed()
    calm(page)
    page.screenshot(path=f"{OUT}/06-desktop-interview.png")

    page.locator("[data-testid=section-offer]").scroll_into_view_if_needed()
    calm(page)
    page.screenshot(path=f"{OUT}/07-desktop-offer.png")

    page.click("[data-testid=open-tracker]")
    page.wait_for_timeout(1000)
    calm(page)
    page.screenshot(path=f"{OUT}/08-desktop-tracker.png")

    page.click("[data-testid=nav-history]")
    page.wait_for_timeout(900)
    calm(page)
    page.screenshot(path=f"{OUT}/09-desktop-history.png")

    page.click("[data-testid=open-ai]")
    page.wait_for_timeout(700)
    calm(page)
    page.screenshot(path=f"{OUT}/10-desktop-ai.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
    mp = mctx.new_page()
    attach(mp)
    mp.goto(BASE, wait_until="domcontentloaded")
    mp.wait_for_timeout(1400)
    calm(mp)
    mp.screenshot(path=f"{OUT}/11-mobile-start.png")
    mp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
    mp.wait_for_selector("[data-testid=resume-status]", timeout=15000)
    mp.fill("[data-testid=job-url]", "https://www.wanted.co.kr/wd/123456")
    mp.click("[data-testid=job-fetch]")
    mp.wait_for_selector("[data-testid=job-preview]", timeout=25000)
    calm(mp)
    mp.screenshot(path=f"{OUT}/12-mobile-job.png", full_page=True)
    mp.click("[data-testid=generate]")
    mp.wait_for_selector("[data-testid=result]", timeout=45000)
    mp.wait_for_timeout(2500)
    calm(mp)
    mp.screenshot(path=f"{OUT}/13-mobile-fit.png")
    mp.locator("[data-testid=section-interview]").scroll_into_view_if_needed()
    calm(mp)
    mp.screenshot(path=f"{OUT}/14-mobile-interview.png")
    mp.click("[data-testid=nav-tracker]")
    mp.wait_for_timeout(1000)
    calm(mp)
    mp.screenshot(path=f"{OUT}/15-mobile-tracker.png")
    mctx.close()

    browser.close()

print("errors:", len(errors))
for err in errors[:10]:
    print(err)
