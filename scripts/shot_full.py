"""整屏截图：用高视口把九宫格一次性展开，便于逐卡复核。

用法：python scripts/shot_full.py <输出路径> [url] [宽] [高]
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots/full.png")
URL = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:4178/"
W = int(sys.argv[3]) if len(sys.argv) > 3 else 1680
H = int(sys.argv[4]) if len(sys.argv) > 4 else 1560

CHROME = os.environ.get(
    "QF_CHROME",
    r"C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(600)
        # 暂停在会话中段，此时各模块都有数据
        page.keyboard.press("Space")
        page.wait_for_timeout(150)
        page.keyboard.press("Space")
        page.wait_for_timeout(300)
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=str(OUT))
        # 画布内部滚动到底，检查下半部分模块（M5/M6/E3）
        page.evaluate("() => { const c = document.querySelector('.canvas'); if (c) c.scrollTop = c.scrollHeight; }")
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT.with_name(OUT.stem + '-bottom' + OUT.suffix)))
        # 页面各卡片实际高度，用于判断是否溢出
        info = page.evaluate(
            """() => [...document.querySelectorAll('.card')].map(c => {
                const t = c.querySelector('.card-code')?.textContent || '?';
                return [t, Math.round(c.getBoundingClientRect().height),
                        c.scrollHeight > c.clientHeight + 2];
            })"""
        )
        for row in info:
            print("CARD", row)
        print("CONSOLE_ERRORS:", len(errors))
        browser.close()


if __name__ == "__main__":
    main()
