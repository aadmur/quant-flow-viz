"""视觉回归：把开场与三课的关键状态各拍一张，并统计控制台错误。

用法：
    python scripts/shot.py shots http://127.0.0.1:4178/

出场顺序与 CinematicIntro 的时间轴对齐（总长 11.8s）：
    p=0.10 街头标题 / p=0.47 纸质凭证飞散 / p=0.78 穿入交易所 / 之后闪白进教学
"""
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots")
URL = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:4178/"
OUT.mkdir(parents=True, exist_ok=True)

CHROME = os.environ.get(
    "QF_CHROME",
    r"C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
)


def drag_slider(page, label: str, ratio: float) -> None:
    """把指定的纸质凭证滑块拖到 0..1 的相对位置（走原生 setter，保证 React 收到 input）。"""
    page.eval_on_selector(
        f'input[aria-label="{label}"]',
        "(el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
        # min/max 是字符串，必须先转数字，否则 '20' + 8 会拼成 '208' 再被浏览器钳到最大值
        " const lo = parseFloat(el.min), hi = parseFloat(el.max);"
        " s.call(el, String(lo + (hi - lo) * v)); el.dispatchEvent(new Event('input',{bubbles:true})); }",
        ratio,
    )
    page.wait_for_timeout(360)


def wait_for_progress(page, target: float, tol: float = 0.02, timeout: int = 20000) -> None:
    """等开场进度条走到 target（0..1）再截图。

    固定 sleep 会漂：截图本身要几百毫秒，而闪白只占 0.03 的进度，
    稍晚一点就拍到 p≈0.88 那层 rgba(255,253,244,.78) 的白雾。
    这里用 Python 轮询而不是 wait_for_function——后者在页面重载后偶发不返回。
    """
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        ratio = page.evaluate(
            "() => { const el = document.querySelector('.cinema-progress i');"
            " if (!el) return null;"
            " const total = el.parentElement.getBoundingClientRect().width;"
            " const w = el.getBoundingClientRect().width;"
            " return total > 0 ? w / total : null; }"
        )
        if ratio is None:      # 开场已经结束，按钮都撤了
            return
        if ratio >= target - tol:
            return
        page.wait_for_timeout(50)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
        page = browser.new_page(viewport={"width": 1680, "height": 1020}, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(URL, wait_until="networkidle")

        # 开场三帧各自独立加载，并且按进度条取帧（闪白只占 0.03 进度，晚一拍就整幅发白）
        # 01 街头：标题 + 纵深
        page.wait_for_timeout(700)
        wait_for_progress(page, 0.1)
        page.screenshot(path=str(OUT / "01-intro-street.png"))
        # 02 纸质凭证被风卷起（p≈0.50，弧线最高处）
        page.reload(wait_until="networkidle")
        wait_for_progress(page, 0.5)
        page.screenshot(path=str(OUT / "02-intro-papers.png"))
        # 03 穿入交易所（p≈0.76，闪白之前）
        page.reload(wait_until="networkidle")
        wait_for_progress(page, 0.76)
        page.screenshot(path=str(OUT / "03-intro-hall.png"))

        # 04 第一课：大单冲击（默认参数）
        page.reload(wait_until="networkidle")
        page.locator(".academy").wait_for(timeout=20000)
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "04-lesson-impact.png"), full_page=True)

        # 教学页比视口高是常态：任何一层给 body 加了 overflow:hidden 都会让底部讲解滚不到，
        # 而 full_page 截图照样完整——所以必须单独探一次能不能滚。
        scroll_ok = page.evaluate(
            "() => { const y0 = window.scrollY; window.scrollBy(0, 240);"
            " const moved = window.scrollY > y0; window.scrollTo(0, 0); return moved; }"
        )
        print("SCROLL_OK:", scroll_ok)

        # 05 同一课换参数：拆成多笔 + 薄盘口
        drag_slider(page, "市场深度", 0.1)
        page.get_by_role("button", name="拆成多笔").click()
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "05-lesson-split.png"), full_page=True)

        # 06 第二课：量化足迹
        page.get_by_role("button", name="02 量化足迹").click()
        page.wait_for_timeout(360)
        page.screenshot(path=str(OUT / "06-lesson-quant.png"), full_page=True)

        # 07 第三课：量价关系（拖到缩量上涨，验证四象限会换）
        page.get_by_role("button", name="03 量价关系").click()
        page.wait_for_timeout(300)
        drag_slider(page, "成交量倍率", 0.05)
        page.screenshot(path=str(OUT / "07-lesson-volume.png"), full_page=True)

        # 08 窄屏
        page.set_viewport_size({"width": 1180, "height": 940})
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "08-narrow.png"), full_page=True)

        # 09 手机屏
        page.set_viewport_size({"width": 720, "height": 900})
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "09-mobile.png"), full_page=True)

        # 10 窄屏开场：容易被忽略，标题和凭证不能溢出
        page.set_viewport_size({"width": 1180, "height": 940})
        page.get_by_role("button", name="重播华尔街开场").click()
        wait_for_progress(page, 0.5)
        page.screenshot(path=str(OUT / "10-intro-narrow.png"))

        print("CONSOLE_ERRORS:", len(errors))
        for e in errors[:12]:
            print(" -", e)
        browser.close()


if __name__ == "__main__":
    main()
