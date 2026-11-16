import os
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
os.environ["LD_LIBRARY_PATH"] = "/workspace/.libs/usr/lib/x86_64-linux-gnu" + ((":" + os.environ["LD_LIBRARY_PATH"]) if os.environ.get("LD_LIBRARY_PATH") else "")
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4183/"
ROOT = "/workspace/projects/job-fit-studio"
OUT = os.path.join(ROOT, "docs/screenshots")
os.makedirs(OUT, exist_ok=True)
errors = []


def attach(page):
    page.on("console", lambda m: errors.append(f"[console:{m.type}] {m.text}") if m.type in ("error", "warning") and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))


def calm(page, ms=650):
    page.mouse.move(900, 8)
    page.wait_for_timeout(ms)


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 960}, device_scale_factor=2, locale="ko-KR", accept_downloads=True)
    page = ctx.new_page()
    attach(page)
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(1400)
    calm(page)
    page.screenshot(path=f"{OUT}/01-desktop-empty.png")

    # 파일 불러오기 확인 창
    page.set_input_files("[data-testid='empty-import-input']", os.path.join(ROOT, "scripts/fixtures/my-job.txt"))
    page.wait_for_selector("[data-testid=import-summary]", timeout=10000)
    calm(page, 500)
    page.screenshot(path=f"{OUT}/02-desktop-import.png")
    page.click("[data-testid=import-apply]")
    page.wait_for_timeout(700)
    page.set_input_files("[data-testid='input-import-input']", os.path.join(ROOT, "scripts/fixtures/my-resume.txt"))
    page.wait_for_selector("[data-testid=import-summary]", timeout=10000)
    page.click("[data-testid=import-apply]")
    page.wait_for_timeout(800)

    page.get_by_role("button", name="지원 패키지 생성").click()
    page.wait_for_selector("text=적합도 진단", timeout=30000)
    page.wait_for_timeout(3000)
    calm(page)
    page.screenshot(path=f"{OUT}/03-desktop-match.png")

    page.locator("button:has-text('중요도')").first.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    page.locator("button:has-text('중요도')").first.click()
    page.wait_for_timeout(600)
    calm(page)
    page.screenshot(path=f"{OUT}/04-desktop-gap.png")

    page.get_by_role("button", name="경력 리라이트").first.click()
    page.wait_for_timeout(900)
    page.evaluate("window.scrollTo({top:0})")
    calm(page)
    page.screenshot(path=f"{OUT}/05-desktop-rewrite.png")

    page.get_by_role("button", name="면접", exact=True).first.click()
    page.wait_for_timeout(700)
    calm(page)
    page.screenshot(path=f"{OUT}/06-desktop-interview.png")

    page.click("[data-testid=mode-mock]")
    page.wait_for_timeout(500)
    page.click("[data-testid=mock-start]")
    page.wait_for_timeout(4000)
    page.fill(
        "[data-testid=mock-answer]",
        "당시 위기 이슈가 터졌고 제가 먼저 공식 입장문 초안을 작성해 24시간 안에 배포했습니다. "
        "이해관계 부서와 문장을 조율했고, 그 결과 기사 노출이 5건에서 1건으로 줄었습니다. "
        "이후 같은 이슈가 반복되지 않도록 대응 매뉴얼을 만들었습니다.",
    )
    page.click("[data-testid=mock-submit]")
    page.wait_for_selector("[data-testid=mock-feedback]", timeout=20000)
    page.wait_for_timeout(900)
    page.locator("[data-testid=mock-feedback]").scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    calm(page)
    page.screenshot(path=f"{OUT}/07-desktop-mock.png")

    page.get_by_role("button", name="1분 소개").first.click()
    page.wait_for_timeout(900)
    calm(page)
    page.screenshot(path=f"{OUT}/08-desktop-pitch.png")

    page.get_by_role("button", name="지원 현황").first.click()
    page.wait_for_timeout(800)
    page.locator("input[aria-label='희망 연봉(만원)']").fill("5200")
    page.locator("input[aria-label='제시 연봉(만원)']").fill("5500")
    page.wait_for_timeout(700)
    page.locator("[data-testid=negotiation] button").nth(0).click()
    page.locator("[data-testid=negotiation] button").nth(1).click()
    page.wait_for_timeout(600)
    calm(page)
    page.screenshot(path=f"{OUT}/09-desktop-tracker.png")

    page.get_by_role("button", name="지원 스튜디오").first.click()
    page.wait_for_timeout(700)
    page.get_by_role("button", name="내보내기").first.click()
    page.wait_for_timeout(800)
    calm(page)
    page.screenshot(path=f"{OUT}/10-desktop-export.png")

    page.get_by_role("button", name="AI 연결").first.click()
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/11-desktop-ai-modal.png")
    page.get_by_role("button", name="취소").click()
    page.wait_for_timeout(400)

    page.emulate_media(media="print")
    page.wait_for_timeout(600)
    page.screenshot(path=f"{OUT}/12-print-sheet.png", full_page=True)
    page.emulate_media(media="screen")

    page.set_viewport_size({"width": 1024, "height": 820})
    page.wait_for_timeout(800)
    calm(page)
    page.screenshot(path=f"{OUT}/13-tablet.png")

    # 히스토리 (예시 공고 두 건 추가)
    page.set_viewport_size({"width": 1440, "height": 960})
    page.get_by_role("button", name="지원 스튜디오").first.click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="채용 공고", exact=True).first.click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="어반모빌리티").first.click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="지원 패키지 생성").click()
    page.wait_for_timeout(4000)
    page.get_by_role("button", name="패키지 히스토리").first.click()
    page.wait_for_timeout(900)
    picks = page.get_by_title("비교 대상으로 선택")
    picks.nth(0).click()
    picks.nth(1).click()
    page.wait_for_timeout(800)
    calm(page)
    page.screenshot(path=f"{OUT}/14-desktop-history.png")

    # 모바일
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
    mp = mctx.new_page()
    attach(mp)
    mp.goto(BASE, wait_until="domcontentloaded")
    mp.wait_for_timeout(1500)
    mp.screenshot(path=f"{OUT}/15-mobile-empty.png")
    mp.get_by_role("button", name="이 예시로 생성").first.click()
    mp.wait_for_selector("text=적합도 진단", timeout=30000)
    mp.wait_for_timeout(3000)
    mp.evaluate("window.scrollTo(0, 0)")
    mp.wait_for_timeout(400)
    mp.screenshot(path=f"{OUT}/16-mobile-match.png")
    mp.locator("nav.fixed button").nth(0).click()
    mp.wait_for_timeout(700)
    mp.evaluate("window.scrollTo(0, 0)")
    mp.wait_for_timeout(400)
    mp.screenshot(path=f"{OUT}/17-mobile-input.png")
    mp.locator("nav.fixed button").nth(1).click()
    mp.wait_for_timeout(600)
    mp.get_by_role("button", name="1분 소개").last.click()
    mp.wait_for_timeout(900)
    mp.evaluate("window.scrollTo(0, 0)")
    mp.wait_for_timeout(400)
    mp.screenshot(path=f"{OUT}/18-mobile-pitch.png")
    mp.get_by_role("button", name="면접").last.click()
    mp.wait_for_timeout(700)
    mp.click("[data-testid=mode-mock]")
    mp.wait_for_timeout(700)
    mp.evaluate("window.scrollTo(0, 640)")
    mp.wait_for_timeout(600)
    mp.screenshot(path=f"{OUT}/19-mobile-mock.png")
    mp.locator("nav.fixed button").nth(3).click()
    mp.wait_for_timeout(900)
    mp.screenshot(path=f"{OUT}/20-mobile-tracker.png")

    browser.close()

print("ERRORS:", len(errors))
for err in errors:
    print(err)
