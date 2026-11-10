"""逐卡截图：按 .card 元素裁剪，1:1 复核每张卡片内部排版。

用法：python scripts/shot_cards.py <输出目录> [url]
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots/cards")
URL = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:4178/"

CHROME = os.environ.get(
    "QF_CHROME",
    r"C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
        page = browser.new_page(viewport={"width": 1680, "height": 1240}, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(500)
        # 停在会话中段：各模块都有数据且状态稳定
        page.keyboard.press("Space")
        page.wait_for_timeout(120)
        page.keyboard.press("Space")
        page.wait_for_timeout(300)

        codes = page.locator(".card .card-code").all()
        for el in codes:
            code = el.inner_text().strip()
            card = page.locator(".card", has=page.locator(f'.card-code:text-is("{code}")')).first
            card.scroll_into_view_if_needed()
            page.wait_for_timeout(120)
            card.screenshot(path=str(OUT / f"{code}.png"))
            box = card.bounding_box()
            # 卡片内是否有内容被自身裁掉
            overflow = page.evaluate(
                "(el) => el.scrollHeight > el.clientHeight + 2", card.element_handle()
            )
            print(f"CARD {code} {round(box['width'])}x{round(box['height'])} overflow={overflow}")
        print("CONSOLE_ERRORS:", len(errors))
        browser.close()


if __name__ == "__main__":
    main()
