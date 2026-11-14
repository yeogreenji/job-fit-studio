import os
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4183/"
OUT = "/workspace/projects/job-fit-studio/docs/screenshots"
os.makedirs(OUT, exist_ok=True)
errors = []

def attach(page):
    page.on("console", lambda m: errors.append(f"[console:{m.type}] {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

def calm(page, ms=600):
    page.mouse.move(900, 6)
    page.wait_for_timeout(ms)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=2, locale="ko-KR", accept_downloads=True)
    page = ctx.new_page()
    attach(page)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(900)
    calm(page)
    page.screenshot(path=f"{OUT}/01-desktop-empty.png")

    page.get_by_role("button", name="이 공고로 생성").first.click()
    page.wait_for_selector("text=적합도 진단", timeout=20000)
    page.wait_for_timeout(1300)
    calm(page)
    page.screenshot(path=f"{OUT}/02-desktop-match.png")

    # keyword matrix detail: open a missing keyword
    page.locator("button:has-text('B2B 커뮤니케이션')").first.scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    page.locator("button:has-text('B2B 커뮤니케이션')").first.click()
    page.wait_for_timeout(600)
    calm(page)
    page.screenshot(path=f"{OUT}/03-desktop-gap.png")

    page.get_by_role("button", name="경력 리라이트 10").click()
    page.wait_for_timeout(800)
    page.evaluate("window.scrollTo({top:0})")
    calm(page)
    page.screenshot(path=f"{OUT}/04-desktop-rewrite.png")

    page.get_by_role("button", name="경력 리라이트 10").click()
    page.wait_for_timeout(500)
    page.evaluate("window.scrollTo({top: 1040})")
    page.wait_for_timeout(500)
    calm(page)
    page.screenshot(path=f"{OUT}/04b-desktop-diff.png")

    page.get_by_role("button", name="면접 준비", exact=True).click()
    page.wait_for_timeout(800)
    calm(page)
    page.screenshot(path=f"{OUT}/05-desktop-interview.png")

    page.get_by_role("button", name="내보내기").click()
    page.wait_for_timeout(800)
    calm(page)
    page.screenshot(path=f"{OUT}/06-desktop-export.png")

    # more packages for history
    page.get_by_role("button", name="어반모빌리티").first.click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="지원 패키지 생성").click()
    page.wait_for_timeout(2300)
    page.get_by_role("button", name="루미너스커머스").first.click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="지원 패키지 생성").click()
    page.wait_for_timeout(2300)

    page.get_by_role("button", name="패키지 히스토리").first.click()
    page.wait_for_timeout(900)
    picks = page.get_by_title("비교 대상으로 선택")
    picks.nth(0).click()
    picks.nth(1).click()
    page.wait_for_timeout(700)
    calm(page)
    page.screenshot(path=f"{OUT}/07-desktop-history.png")

    # api modal (from studio)
    page.get_by_role("button", name="스튜디오로").first.click()
    page.wait_for_timeout(700)
    page.get_by_role("button", name="LLM 연동").click()
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/08-desktop-api.png")
    page.get_by_role("button", name="취소").click()
    page.wait_for_timeout(300)

    # print sheet
    page.emulate_media(media="print")
    page.wait_for_timeout(500)
    page.screenshot(path=f"{OUT}/09-print-sheet.png", full_page=True)
    page.emulate_media(media="screen")

    # tablet
    page.set_viewport_size({"width": 1024, "height": 820})
    page.wait_for_timeout(700)
    calm(page)
    page.screenshot(path=f"{OUT}/14-tablet.png")

    # mobile
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
    mp = mctx.new_page()
    attach(mp)
    mp.goto(BASE, wait_until="networkidle")
    mp.wait_for_timeout(900)
    mp.screenshot(path=f"{OUT}/10-mobile-input.png")
    mp.get_by_role("button", name="지원 패키지 생성").click()
    mp.wait_for_selector("text=적합도 진단", timeout=20000)
    mp.wait_for_timeout(1300)
    mp.screenshot(path=f"{OUT}/11-mobile-match.png")
    mp.get_by_role("button", name="경력 리라이트").click()
    mp.wait_for_timeout(800)
    mp.screenshot(path=f"{OUT}/12-mobile-rewrite.png")
    mp.get_by_role("button", name="면접 준비").last.click()
    mp.wait_for_timeout(800)
    mp.screenshot(path=f"{OUT}/13-mobile-interview.png")

    browser.close()

print("ERRORS:", len(errors))
for e in errors:
    print(e)
