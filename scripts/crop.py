"""从整页截图里裁剪局部区域，便于 1:1 目视复核。

用法：python scripts/crop.py <src.png> <out.png> x0 y0 x1 y1
坐标基于原图像素（左上为原点），不做任何缩放。
"""

import sys
from PIL import Image


def main() -> None:
    if len(sys.argv) < 3:
        print('usage: crop.py <src> <out> [x0 y0 x1 y1]')
        return
    src, out = sys.argv[1], sys.argv[2]
    im = Image.open(src)
    if len(sys.argv) >= 7:
        box = tuple(int(v) for v in sys.argv[3:7])
        im = im.crop(box)
        print(f'{im.size[0]}x{im.size[1]} from box={box}')
    else:
        print(f'{im.size[0]}x{im.size[1]}')
    im.save(out)


if __name__ == '__main__':
    main()
