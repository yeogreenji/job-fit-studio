import os, json
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", "/workspace/.cache/ms-playwright")
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4183/"
errors = []
checks = []

def attach(page):
    page.on("console", lambda m: errors.append(f"[console:{m.type}] {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

def check(name, cond):
    checks.append((name, bool(cond)))

def packages(page):
    return page.evaluate("JSON.parse(localStorage.getItem('jobfit.packages.v1')||'[]')")

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 960}, locale="ko-KR", accept_downloads=True)
    page = ctx.new_page()
    attach(page)
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(700)

    check("empty state headline", page.get_by_text("지원 패키지가 나옵니다").count() > 0)

    page.get_by_role("button", name="이 공고로 생성").first.click()
    page.wait_for_selector("text=적합도 진단", timeout=20000)
    page.wait_for_timeout(1200)

    check("match tab rendered", page.get_by_text("공고 키워드").count() > 0)
    check("keyword matrix rows", page.locator("text=중요도").count() >= 10)
    check("score ring rendered", page.locator("svg circle").count() >= 1)
    check("package saved", len(packages(page)) == 1)

    # keyword detail
    rows = page.locator("button:has-text('중요도')")
    check("expandable keyword rows", rows.count() >= 10)
    page.get_by_role("button", name="경력 리라이트 10").click()
    page.wait_for_timeout(800)
    check("rewrite tab", page.get_by_text("공고 문구에 맞춘 경력기술서").count() > 0)
    check("summary rewrite", page.get_by_text("지원 요약 프로필").count() > 0)
    check("diff cards", page.locator("text=수정 제안").count() >= 4 or page.locator("text=유지 권장").count() >= 1)

    page.get_by_role("button", name="전체 해제").click()
    page.wait_for_timeout(600)
    after_release = packages(page)[0]["rewrites"]
    check("release all rewrites", all(not r["adopted"] for r in after_release))
    page.get_by_role("button", name="전체 반영").click()
    page.wait_for_timeout(700)
    check("adopt all rewrites", all(r["adopted"] for r in packages(page)[0]["rewrites"]))

    # copy a rewrite
    page.get_by_role("button", name="문장 복사").first.click()
    page.wait_for_timeout(300)

    page.get_by_role("button", name="면접 준비", exact=True).click()
    page.wait_for_timeout(700)
    check("interview questions", page.locator("h3").count() >= 8)
    check("star fields", page.locator("textarea.star-field").count() >= 24)
    page.locator("textarea.star-field").first.fill("팀장님, 이 수치는 6개월간 자체 집계 기준으로 측정했습니다.")
    page.wait_for_timeout(900)
    check("star edited saved", packages(page)[0]["questions"][0]["edited"] is True)

    page.get_by_role("button", name="내보내기").click()
    page.wait_for_timeout(700)
    check("export preview", page.get_by_text("Markdown 미리보기").count() > 0)

    with page.expect_download() as dl:
        page.get_by_role("button", name="job-fit-클라우드플로우.md").click()
    path = dl.value.path()
    content = open(path, encoding="utf-8").read()
    check("markdown exported", len(content) > 3000)
    check("markdown sections", all(t in content for t in ["적합도 요약", "키워드 매칭과 갭", "핵심 어필 포인트", "경력기술서 리라이트", "면접 예상 질문 & STAR", "체크리스트"]))
    check("markdown no real names", "안지현" not in content and "하이브월드와이드" not in content)

    # generate two more packages from samples
    page.get_by_role("button", name="어반모빌리티").first.click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="지원 패키지 생성").click()
    page.wait_for_timeout(2200)
    page.get_by_role("button", name="루미너스커머스").first.click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="지원 패키지 생성").click()
    page.wait_for_timeout(2200)
    pkgs = packages(page)
    check("three packages saved", len(pkgs) == 3)
    check("different scores", len({p["match"]["score"] for p in pkgs}) >= 2)
    check("all fictional", all("가상" not in p["company"] for p in pkgs))

    # history + compare
    page.get_by_role("button", name="패키지 히스토리").first.click()
    page.wait_for_timeout(800)
    check("history rows", page.get_by_title("비교 대상으로 선택").count() == 3)
    picks = page.get_by_title("비교 대상으로 선택")
    picks.nth(0).click()
    picks.nth(1).click()
    page.wait_for_timeout(600)
    check("compare panel", page.get_by_text("지원 건 비교").count() > 0)
    check("compare columns", page.get_by_text("적합도").count() >= 2)

    before = page.get_by_title("비교 대상으로 선택").count()
    page.get_by_label("기록 삭제").first.click()
    page.wait_for_timeout(700)
    check("delete package", page.get_by_title("비교 대상으로 선택").count() == before - 1)
    check("storage after delete", len(packages(page)) == 2)

    # reopen a package
    page.get_by_role("button", name="클라우드플로우", exact=False).first.click()
    page.wait_for_timeout(900)
    check("package reopened", page.get_by_text("적합도 진단").count() > 0)

    # api modal
    page.get_by_role("button", name="LLM 연동").click()
    page.wait_for_timeout(400)
    check("api modal", page.get_by_text("LLM 정밀 보정").count() > 0)
    page.get_by_role("button", name="Anthropic").click()
    page.get_by_role("button", name="취소").click()
    page.wait_for_timeout(300)

    # mobile
    mctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="ko-KR", is_mobile=True, has_touch=True)
    mp = mctx.new_page()
    attach(mp)
    mp.goto(BASE, wait_until="networkidle")
    mp.wait_for_timeout(800)
    check("mobile input first", mp.get_by_text("샘플 공고로 시작").count() > 0)
    mp.get_by_role("button", name="지원 패키지 생성").click()
    mp.wait_for_selector("text=적합도 진단", timeout=20000)
    mp.wait_for_timeout(1200)
    check("mobile match", mp.get_by_text("적합도 진단").count() > 0)
    check("mobile no overflow", mp.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0)
    mp.get_by_role("button", name="면접 준비").last.click()
    mp.wait_for_timeout(600)
    check("mobile interview", mp.get_by_text("압박 면접 예상 질문").count() > 0)
    mp.get_by_role("button", name="현황").last.click()
    mp.wait_for_timeout(600)
    check("mobile rail", mp.get_by_text("지원 현황").count() >= 1)

    browser.close()

print("CHECKS")
for name, ok in checks:
    print(("PASS " if ok else "FAIL ") + name)
print("ERRORS:", len(errors))
for e in errors:
    print(e)
