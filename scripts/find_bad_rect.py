"""采样所有 SVG rect 的宽度，抓出瞬时出现的负值/异常值。

用法：python scripts/find_bad_rect.py [url]
"""
import os
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5178/"
CHROME = os.environ.get(
    "QF_CHROME",
    r"C:\Users\Administrator\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe",
)

INIT = """
window.__bad = [];
const chainOf = (el) => {
  const out = [];
  let n = el;
  while (n && n !== document.body) {
    out.push(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\\s+/).join('.') : ''));
    n = n.parentElement;
  }
  return out;
};
const scan = () => {
  for (const el of document.querySelectorAll('rect,line')) {
    const w = el.getAttribute('width') || el.getAttribute('x2');
    if (w === null) continue;
    const v = Number(w);
    if (Number.isFinite(v) && v < 0 && window.__bad.length < 6) {
      window.__bad.push({ tag: el.tagName, attr: el.getAttribute('width') !== null ? 'width' : 'x2', val: v, html: el.outerHTML.slice(0, 140), chain: chainOf(el) });
    }
  }
};
const loop = () => { scan(); requestAnimationFrame(loop); };
requestAnimationFrame(loop);
"""


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME if os.path.exists(CHROME) else None)
        page = browser.new_page(viewport={"width": 1680, "height": 1020})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.add_init_script(INIT)
        page.goto(URL, wait_until="networkidle")
        page.wait_for_timeout(1500)

        tl = page.locator(".timeline").bounding_box()
        if tl:
            for frac in (0.0, 0.01, 0.5, 0.99, 1.0):
                page.mouse.move(tl["x"] + tl["width"] * frac, tl["y"] + 20)
                page.mouse.down()
                page.mouse.move(tl["x"] - 30, tl["y"] + 20)
                page.wait_for_timeout(80)
                page.mouse.move(tl["x"] + tl["width"] * frac, tl["y"] + 20)
                page.mouse.up()
                page.wait_for_timeout(200)

        bad = page.evaluate("() => window.__bad")
        print("BAD:", len(bad))
        for b in bad:
            print(" -", b["attr"], b["val"], b["html"])
            print("   chain:", " < ".join(b["chain"][:7]))
        print("CONSOLE_ERRORS:", len(errors))
        for e in errors[:5]:
            print(" -", e)
        browser.close()


if __name__ == "__main__":
    main()
