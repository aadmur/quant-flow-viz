"""快速快照：开发迭代时用来「看一眼现在长什么样」。

用法：
    python snap.py out.png [url] [--stop TICK] [--click SELECTOR] [--explode 0.6]
                           [--size 1680x1020] [--full] [--wait 1200]
"""
import argparse
import os
import sys

from playwright.sync_api import sync_playwright

CHROME = os.environ.get(
    "QF_CHROME",
    r"C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("url", nargs="?", default="http://127.0.0.1:5178/")
    ap.add_argument("--stop", type=float, default=None, help="拖时间轴到该 tick 比例 0..1")
    ap.add_argument("--click", default=None, help="点击某个选择器")
    ap.add_argument("--explode", type=float, default=None, help="设置拆解度 0..1")
    ap.add_argument("--size", default="1680x1020")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--wait", type=int, default=1400)
    args = ap.parse_args()

    w, h = (int(v) for v in args.size.split("x"))

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
        page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(args.url, wait_until="networkidle")
        page.wait_for_timeout(args.wait)
        page.keyboard.press("Space")  # 暂停，方便稳定截图
        page.wait_for_timeout(200)

        if args.stop is not None:
            box = page.locator(".tl-track").bounding_box()
            if box:
                page.mouse.click(box["x"] + box["width"] * args.stop, box["y"] + box["height"] / 2)
                page.wait_for_timeout(450)

        if args.explode is not None:
            page.eval_on_selector(
                "#explode",
                "(el, v) => { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, String(v)); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }",
                args.explode,
            )
            page.wait_for_timeout(550)

        if args.click:
            page.locator(args.click).first.click()
            page.wait_for_timeout(550)

        page.screenshot(path=args.out, full_page=args.full)
        print("CONSOLE_ERRORS:", len(errors))
        for e in errors[:10]:
            print(" -", e)
        browser.close()


if __name__ == "__main__":
    main()
