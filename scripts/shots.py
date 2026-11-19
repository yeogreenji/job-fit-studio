"""README용 화면 캡처 (공고 자동 수집·지원 허브)."""

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
for _ in range(200):
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


def calm(page, ms=900):
    page.mouse.move(900, 8)
    page.wait_for_timeout(ms)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2, locale="ko-KR", accept_downloads=True)
    page = ctx.new_page()
    attach(page)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector("[data-testid=hub-job]", timeout=90000)
    page.wait_for_timeout(2000)
    calm(page)
    page.screenshot(path=f"{OUT}/01-desktop-start.png")

    # 여러 소스가 함께 모인 보드 (PR·홍보 전체 — 에이전시 포함)
    page.click("[data-testid=preset-pr]")
    page.wait_for_timeout(800)
    page.wait_for_selector("[data-testid=collect-run]:not([disabled])", timeout=90000)
    deadline = time.time() + 90
    while time.time() < deadline:
        if page.locator("[data-testid=collect-sources] .chip").count() >= 2 and page.locator("[data-testid=hub-job]").count() >= 12:
            break
        page.wait_for_timeout(500)
    page.wait_for_timeout(1500)
    card = page.locator("[data-testid=hub-job]", has_text="러쉬코리아").first
    if card.count():
        card.click()
        page.wait_for_timeout(1200)
    calm(page)
    page.screenshot(path=f"{OUT}/02-desktop-jobs.png")

    page.locator("[data-testid=hub-requirements]").scroll_into_view_if_needed()
    calm(page)
    page.screenshot(path=f"{OUT}/03-desktop-requirements.png")

    # 이력서를 넣으면 카드마다 지원 문구가 붙습니다.
    page.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
    page.wait_for_selector("[data-testid=resume-status]", timeout=20000)
    page.wait_for_timeout(2500)
    page.locator("[data-testid=hub-apply-kit]").scroll_into_view_if_needed()
    calm(page, 1500)
    page.screenshot(path=f"{OUT}/04-desktop-apply-kit.png")

    page.click("[data-testid=deep-open]")
    page.wait_for_selector("[data-testid=result]", timeout=90000)
    page.wait_for_timeout(3000)
    calm(page)
    page.screenshot(path=f"{OUT}/05-desktop-deep.png")
    page.click("[data-testid=new-job]")
    page.wait_for_timeout(800)

    page.locator("[data-testid=hub-job]").first.click()
    page.wait_for_timeout(600)
    page.click("[data-testid=mark-applied]")
    page.wait_for_timeout(600)
    page.click("[data-testid=nav-tracker]")
    page.wait_for_timeout(1200)
    calm(page)
    page.screenshot(path=f"{OUT}/06-desktop-tracker.png")
    page.click("[data-testid=nav-studio]")
    page.wait_for_timeout(600)
    ctx.close()

    # 모바일 390px
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
    mp = mctx.new_page()
    attach(mp)
    mp.goto(BASE, wait_until="domcontentloaded")
    mp.wait_for_selector("[data-testid=hub-job]", timeout=90000)
    mp.wait_for_timeout(1500)
    mp.screenshot(path=f"{OUT}/07-mobile-start.png")
    mp.locator("[data-testid=hub-list]").scroll_into_view_if_needed()
    mp.wait_for_timeout(600)
    mp.screenshot(path=f"{OUT}/08-mobile-hub.png")
    mp.set_input_files("[data-testid=resume-file]", os.path.join(FIXTURES, "my-resume.txt"))
    mp.wait_for_selector("[data-testid=resume-status]", timeout=20000)
    mp.locator("[data-testid=hub-job]").first.click()
    mp.wait_for_timeout(2000)
    mp.locator("[data-testid=hub-apply-kit]").scroll_into_view_if_needed()
    mp.wait_for_timeout(900)
    mp.screenshot(path=f"{OUT}/09-mobile-apply-kit.png")
    mp.locator("[data-testid=nav-tracker]").click()
    mp.wait_for_timeout(1200)
    mp.screenshot(path=f"{OUT}/10-mobile-tracker.png")
    mctx.close()
    browser.close()

print("errors:", len(errors))
for err in errors[:10]:
    print(err)
