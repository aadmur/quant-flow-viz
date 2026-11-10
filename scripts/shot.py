"""视觉回归：把关键交互状态各拍一张，并统计控制台错误。

用法：
    python scripts/shot.py shots http://127.0.0.1:4178/
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots")
URL = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:4178/"
OUT.mkdir(parents=True, exist_ok=True)

CHROME = os.environ.get(
    "QF_CHROME",
    r"C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
)


def set_explode(page, value: float) -> None:
    page.eval_on_selector(
        "#explode",
        "(el, v) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
        " s.call(el, String(v)); el.dispatchEvent(new Event('input',{bubbles:true})); }",
        value,
    )
    page.wait_for_timeout(620)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
        page = browser.new_page(viewport={"width": 1680, "height": 1020}, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1400)

        # 01 默认播放态
        page.screenshot(path=str(OUT / "01-overview.png"))

        # 02 中段定格：各零件同步到同一 tick
        page.keyboard.press("Space")
        box = page.locator(".tl-track").bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.46, box["y"] + box["height"] / 2)
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "02-mid-timeline.png"))

        # 03 全拆解：结构视图
        set_explode(page, 1.0)
        page.screenshot(path=str(OUT / "03-exploded.png"))
        set_explode(page, 0.42)

        # 04 点开 M5：零件抽离 + 右栏明细
        page.locator('[data-phase="m5"]').first.click()
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "04-detail-impact.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)

        # 05 压力测试预设
        page.locator('.presets button:has-text("压力测试")').click()
        page.wait_for_timeout(1200)
        page.screenshot(path=str(OUT / "05-stress.png"))

        # 06 注入异常：看下游是不是真的降级
        page.locator('[data-phase="e3"]').first.click()
        page.wait_for_timeout(500)
        page.locator('.inject-grid button:has-text("网关断线")').click()
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "06-incident.png"))
        page.keyboard.press("Escape")

        # 07 窄屏
        page.set_viewport_size({"width": 1180, "height": 940})
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "07-narrow.png"))

        print("CONSOLE_ERRORS:", len(errors))
        for e in errors[:12]:
            print(" -", e)
        browser.close()


if __name__ == "__main__":
    main()
