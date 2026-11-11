---
name: quant-flow-viz
description: 复现 QuantFlow 华尔街市场学校（React 19 + Vite 7 + TS，电影式开场 + 三课纸质凭证教学，零后端）。当需要重新初始化/运行/测试/构建该项目，或要按原子提交推送到 GitHub、修开场镜头与纸张飞行、加第四课、重出视觉回归图时使用。
---

# QuantFlow · 华尔街市场学校

一段可跳过的电影式开场（华尔街街口 → 纸质股票被风卷起 → 卷入纽交所 → 白光闪切），
接三节可交互的机制课（大单冲击 / 量化足迹 / 量价关系）。本技能保证从零复现到可运行、可验收、可提交。

**核心不变量（动手前先读）**

1. `src/teaching/lessons.ts` 是**纯函数**：同输入 → 同输出，**禁止 `Math.random`、禁止读外部行情**。
   所有图、指标、讲解文案都从同一份 `MarketPoint[]` 派生，不能各算一套。
2. 采样固定为 **96 点、事件在第 30 点**（`N` / `EVENT`）。改这两个常数会同时影响三课的指标与对照线。
3. `LessonChart` **只吃 `MarketPoint[]`**，不认识业务参数。想加一课：在 `lessons.ts` 加构造函数 +
   在 `LESSONS` 加一条元数据 + 在 `READING_HINTS` 加三条读图提示，图表组件不用动。
4. 滑块必须是**原生 `input[type=range]`**（键盘与无障碍靠它），拇指是 CSS 画的小纸片。
   不要换成 div 拖拽。
5. 开场时间轴只有一处真源：`CinematicIntro.tsx` 的 `DURATION = 11800` 与各段的 `smooth(a,b,p)` 区间。
   图层顺序（z）：街景 0 → 门洞光 12 → 风线 20 → 纸 25 → 字幕 40 → 闪白 80 → 跳过按钮 100。

---

## 1. 固定依赖

| 项 | 版本 / 约束 |
| --- | --- |
| Node | 22.x（本项目在 22.22.2 上验证） |
| 包管理 | npm（`package-lock.json` 已入库，优先 `npm ci`） |
| 运行时依赖 | `react@19` `react-dom@19` —— 教学页**不再需要 zustand**，状态就是 `useState` |
| 构建 | `vite@7` + `typescript@5.6`（`strict`、`noUnusedLocals`、`noUnusedParameters` 全开） |
| 测试 | `vitest@3` + `jsdom@25` + `@testing-library/react@16` + `@testing-library/jest-dom` |
| 视觉回归 | Python 3 + `playwright`（chromium），可选 `Pillow` 用于裁剪放大 |

本机注意：`npm` 直接在 bash 里可能不可用，用 `node node_modules/<pkg>/bin/<cli>` 走；
Playwright 的 chromium 路径用 `QF_CHROME` 覆盖。

## 2. 初始化

```bash
git clone https://github.com/aadmur/quant-flow-viz.git
cd quant-flow-viz
npm ci
```

`package.json` 里的脚本是验收契约，不要改端口以外的内容：

```json
{
  "dev": "vite --host 127.0.0.1 --port 5178",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview --host 127.0.0.1 --port 4178",
  "test": "vitest run"
}
```

> 端口必须 `--strictPort`。本机历史问题：旧实例占着端口时 Vite 会静默换端口，
> 截图脚本拍到的其实是上一个版本的页面，排查很久才发现。

## 3. 运行 / 测试 / 构建

```bash
npm run dev        # http://127.0.0.1:5178
npm test           # 期望：37 passed（lessons 13 + app 10 + engine 14），无 act 警告
npm run build      # 期望：js ≈ 247KB (gzip 79KB)，css ≈ 24.6KB (gzip 7.1KB)
npm run preview    # http://127.0.0.1:4178
```

若测试出现 `not wrapped in act(...)`：说明状态更新跑到了 `act` 之外。用
`await act(async () => { await new Promise(r => setTimeout(r, 140)) })` 包住，不要绕过去。

## 4. 视觉回归

```bash
# 单张快照
python scripts/snap.py shots/now.png http://127.0.0.1:5178/

# 十个状态 + 控制台错误统计（交付门槛：CONSOLE_ERRORS: 0）
python scripts/shot.py docs/screenshots http://127.0.0.1:4178/
```

十个状态固定为：`01-intro-street` / `02-intro-papers` / `03-intro-hall` /
`04-lesson-impact` / `05-lesson-split` / `06-lesson-quant` / `07-lesson-volume` /
`08-narrow`(1180×940) / `09-mobile`(720×900) / `10-intro-narrow`。

**开场三帧必须按进度取帧**，`wait_for_progress(page, 0.5)` 而不是 `sleep(5000)`：
截图本身要几百毫秒，而闪白只占 `0.03` 的进度，晚一拍就拍到一层
`rgba(255,253,244,.78)` 的白雾——看起来像"整幅发白"的渲染 bug，其实是拍到了转场。

**排查视觉问题的顺序**（别猜）：
1. Playwright 量 `getBoundingClientRect()`，确认元素是否被裁出视口；
2. 读 `getComputedStyle().opacity` —— 发白/发灰先怀疑叠层透明度（闪白、门洞光），不要先怀疑滤镜；
3. 拖滑块时用原生 setter（`HTMLInputElement.prototype.value` 的 `set` + 派发 `input`），
   **`el.min`/`el.max` 是字符串**，先 `parseFloat` 再算，否则 `'20' + 8` 拼成 `'208'` 被钳到最大值；
4. 最后才裁剪放大目测。

## 5. 演示模式与输入数据

**三种演示态**（验收时逐一走一遍）：

| 模式 | 进入方式 | 该看到什么 |
| --- | --- | --- |
| 电影开场 | 首屏自动 / 顶部「重播华尔街开场」 | 镜头推进 → 纸被卷起 → 门洞亮 → 白光闪切 → 教学页；全程可「跳过开场」 |
| 三课教学 | 01 / 02 / 03 章节 | 拖凭证，价格线 + 量柱 + 三个指标 + 底部讲解同帧更新 |
| 参数对照 | 01 课「一笔砸入 ↔ 拆成多笔」、02 课「趋势 ↔ 回归」 | 同一目标的两种路径形状，指标条同步换值 |

**输入数据**：不读外部文件。默认参数在 `DEFAULT_LESSON_PARAMS`：

```
orderSize=14, depth=58, split=false,
reaction=120, frequency=18, strategy='trend',
priceChange=3.2, volumeRatio=2.1
```

判定阈值（改动前先确认文案还成立）：涨跌 `±0.35%`、放量 `≥1.35×`、缩量 `≤0.8×`。

场景图是两张 AI 生成的实拍风格 WebP（`public/assets/wall-street.webp`、`exchange-hall.webp`），
纸张、风线、闪白全部是 CSS/DOM 实时合成，没有视频文件。

## 6. GitHub 提交流程

仓库：`aadmur/quant-flow-viz`。本机无 `gh` CLI，且 git 走 schannel 会报
`CRYPT_E_NO_REVOCATION_CHECK`，必须带环境变量：

```bash
export GIT_SSL_NO_VERIFY=1
```

本次改版的原子提交序列（一条提交只做一件事）：

```bash
git add public/assets
git commit -m "feat(cinema): 华尔街与交易所两张场景底图"

git add src/cinema
git commit -m "feat(cinema): 电影式开场（镜头推进 / 纸张飞行 / 门洞透光 / 白光闪切）"

git add src/teaching/lessons.ts src/__tests__/lessons.test.ts
git commit -m "feat(teaching): 三课纯函数模型与判定阈值 + 13 条用例"

git add src/teaching/LessonChart.tsx src/teaching/PaperSlider.tsx
git commit -m "feat(teaching): 走势图与纸质凭证滑块"

git add src/teaching/TeachingApp.tsx src/styles/academy.css
git commit -m "feat(teaching): 章节、证书栏、指标条、讲解区与读图提示"

git add src/App.tsx src/main.tsx index.html src/__tests__/app.test.tsx
git commit -m "feat(app): 首屏改为开场 + 教学页，旧看板不再挂载"

git add scripts
git commit -m "test(visual): 十状态回归脚本，开场按进度取帧"

git add README.md skills docs/screenshots
git commit -m "docs: README、可复现技能与生产构建截图"
```

推送（覆盖旧实现前先给旧历史留分支，除非分支已存在）：

```bash
git push origin <old-sha>:refs/heads/archive/v1-grid   # 已存在则跳过
git push origin main
```

## 7. 验收清单

- [ ] `npm ci` 干净装完，无 peer 警告阻塞
- [ ] `npm test` → 37 passed，无 `act(...)` 警告
- [ ] `npm run build` → 通过，`tsc --noEmit` 零错误
- [ ] `python scripts/shot.py ...` → `CONSOLE_ERRORS: 0`
- [ ] 开场：标题浮起 → 纸被卷向门洞（不是悬在半空）→ 门洞亮起 → 闪白 → 教学页
- [ ] 开场任意时刻「跳过开场」都能立刻进教学页；教学页「重播」能从头再放
- [ ] 01 课拖「市场深度」到最小：峰值冲击变大、盘口深度标注变「薄，价格更敏感」
- [ ] 01 课切「拆成多笔」：价格从一步跳升变成一串涟漪，标题变「把一块巨石，拆成一串涟漪」
- [ ] 02 课拖「反应速度」：首次响应数值变，红色足迹的第一笔跟着提前/推后
- [ ] 03 课把量能拖到最小：四象限高亮切到「缩量上涨」，底部结论同步改写
- [ ] 1180 与 720 宽下无横向滚动条，底部讲解是整段横排（不是被切成窄列）
