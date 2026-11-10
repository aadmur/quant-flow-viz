"""截图脚本：验证 QuantFlow 页面渲染与交互状态。

用法：
    python shot.py <输出目录> [url]
"""
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots")
URL = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:4178/"
OUT.mkdir(parents=True, exist_ok=True)

# 本机 Playwright 版本与已下载浏览器版本不一致，允许显式指定 chrome 路径
CHROME = os.environ.get(
    "QF_CHROME",
    r"C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
)


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROME if os.path.exists(CHROME) else None
        )
        page = browser.new_page(viewport={"width": 1680, "height": 1020}, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1200)

        page.screenshot(path=str(OUT / "01-overview.png"), full_page=False)

        # 暂停并拖到中段，验证联动
        page.keyboard.press("Space")
        page.wait_for_timeout(200)
        tl = page.locator(".timeline").bounding_box()
        if tl:
            page.mouse.click(tl["x"] + tl["width"] * 0.42, tl["y"] + 20)
            page.wait_for_timeout(500)
            page.screenshot(path=str(OUT / "02-mid-timeline.png"))

        # 打开 M5 详情抽屉
        page.locator('.flow-node:has-text("市场冲击")').click()
        page.wait_for_timeout(450)
        page.screenshot(path=str(OUT / "03-drawer-impact.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)

        # 切到压力测试预设
        page.locator('.preset:has-text("压力测试")').click()
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "04-stress.png"))

        # 注入异常
        page.locator('button:has-text("网关断线")').click()
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "05-incident.png"))

        # 窄屏
        page.set_viewport_size({"width": 1180, "height": 900})
        page.wait_for_timeout(400)
        page.screenshot(path=str(OUT / "06-narrow.png"))

        print("CONSOLE_ERRORS:", len(errors))
        for e in errors[:12]:
            print(" -", e)
        browser.close()


if __name__ == "__main__":
    main()
