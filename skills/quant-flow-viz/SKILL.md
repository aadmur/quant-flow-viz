---
name: quant-flow-viz
description: 复现 QuantFlow 交易引擎拆解台（React 19 + Vite 7 + TS + Zustand，等距装配体 + 确定性仿真，零后端）。当需要重新初始化/运行/测试/构建该项目，或要按原子提交推送到 GitHub、验证九零件交互与时间轴联动、重出视觉回归图时使用。
---

# QuantFlow · 交易引擎拆解台

一套「把量化交易引擎拆成零部件」的交互式可视化沙盘。本技能保证从零复现到可运行、可验收、可提交。

**核心不变量（改动前先读）**

1. 同 `seed` + 同 `params` → 540 tick 逐 tick 完全一致。**禁止 `Math.random`**，需要随机就走 `src/core/rng.ts`。
2. 快照（`Snapshot`）**不得持有会被后续修改的对象引用**。盘口数组、子单数组入快照前必须深拷，
   否则时间轴倒带是假的。
3. 机身几何只有一处真源：`MachineStage.tsx` 里的 `CORE` 表（形状/宽/深/高）+ `Z_TOP/Z_STEP/EXPLODE_STEP`。
   零件内部**不得**自己算屏幕坐标，一律用 `TopFace / LeftFace / RightFace / WallPlate` 的容器。
4. 圆筒（`shape: 'drum'`）**不能用 `LeftFace`**：那是外接方箱的侧面，细节会飘到筒身外面去。
   筒壁细节走 `WallPlate`（屏幕像素坐标），顶盖细节外面套 `CapClip`。

---

## 1. 固定依赖

| 项 | 版本 / 约束 |
| --- | --- |
| Node | 22.x（本项目在 22.22.2 上验证） |
| 包管理 | npm（`package-lock.json` 已入库，优先 `npm ci`） |
| 运行时依赖 | `react@19` `react-dom@19` `zustand@5` —— 只有这三个 |
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

> 端口必须 `--strictPort`。本机历史问题：旧实例占着 5178 时，Vite 会静默换端口，
> 截图脚本拍到的其实是上一个版本的页面，排查很久才发现。

## 3. 运行 / 测试 / 构建

```bash
npm run dev        # http://127.0.0.1:5178
npm test           # 期望：25 passed（引擎 14 + 界面 11），且无 act 警告
npm run build      # 期望：dist/assets/index-*.js ≈ 332KB (gzip ≈ 108KB)，css ≈ 21KB
npm run preview    # http://127.0.0.1:4178
```

若测试出现 `not wrapped in act(...)`：说明有防抖/定时器的状态更新跑到了 `act` 之外，
把断言改成 `await act(async () => { await new Promise(r => setTimeout(r, 140)) })`，不要手动 `rebuild()` 绕过去。

## 4. 视觉回归

```bash
# 单张：拖到 45% 时间轴、拆解度 0.45
python scripts/snap.py shots/now.png http://127.0.0.1:5178/ --stop 0.45 --explode 0.45

# 七张状态 + 控制台错误统计（交付门槛：CONSOLE_ERRORS: 0）
python scripts/shot.py docs/screenshots http://127.0.0.1:5178/
```

七个状态固定为：`01-overview`（播放态）/ `02-mid-timeline`（中段定格）/
`03-exploded`（全拆解）/ `04-part-detail`（点开 M5）/ `05-stress`（压力测试预设）/
`06-incident`（注入网关断线）/ `07-narrow`（1180×940）。

**排查视觉问题的顺序**（别猜）：
1. Playwright 里量 `getBoundingClientRect()`，确认零件是否被裁出舞台；
2. `document.querySelectorAll('rect')` 筛 `height < 0`，能立刻抓到算错的尺寸；
3. 用 `elementFromPoint` 命中的元素判断那条"莫名其妙的斜线"到底是哪个节点；
4. 最后才裁剪放大目测。

## 5. 演示模式与输入数据

**三种演示态**（验收时逐一走一遍）：

| 模式 | 进入方式 | 该看到什么 |
| --- | --- | --- |
| 装好的整机 | 拆解度 0 | 零件贴合，缝隙透光，主轴不可见 |
| 结构拆解 | 拆解度 0.4–1.0 | 零件沿轴上移、联轴器抽长、跨零件管路露出、引线外扩 |
| 零件剖面 | 点任意零件 / Esc 关闭 | 其余零件压暗，右栏换成该零件的指标 + 专属滑块 |

**输入数据**：不读外部文件。整场会话由 `DEFAULT_PARAMS`（`src/model/params.ts`）生成：

```
seed=20261110, entryThreshold=0.42, capitalPct=32, algo='twap',
urgency=0.55, impactCoeff=1, marketVol=1, liquidity=1, exposureLimitPct=28
TOTAL_TICKS=540, FOCUS_SYMBOL=300750 宁德时代
```

四个预设（均衡 / 保守 / 激进 / 压力测试）是整组参数的快照，点一下即整组替换并重算。
「换种子」只改 `seed`，用来证明"同参数不同行情"和"同行情不同参数"是两回事。

## 6. GitHub 提交流程

仓库：`aadmur/quant-flow-viz`。本机无 `gh` CLI，且 git 走 schannel 会报
`CRYPT_E_NO_REVOCATION_CHECK`，必须带环境变量：

```bash
export GIT_SSL_NO_VERIFY=1
```

提交粒度按**原子功能**，一条提交只做一件事：

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html .gitignore
git commit -m "chore: 锁定依赖与构建配置"

git add src/core src/styles/tokens.css src/styles/base.css
git commit -m "feat(core): 等距投影内核与设计令牌"

git add src/model src/engine
git commit -m "feat(engine): 确定性仿真引擎，seed+params 产出 540 tick 会话"

git add src/__tests__/engine.test.ts
git commit -m "test(engine): 守住确定性与快照隔离等 14 条不变量"

git add src/store
git commit -m "feat(store): Zustand 会话状态机与 90ms 尾部防抖"

git add src/components/machine/IsoParts.tsx src/components/machine/shapes.ts
git commit -m "feat(machine): 方箱与圆筒两类机身原子图元"

git add src/components/machine/CoreParts.tsx src/components/machine/FlowParts.tsx src/components/machine/AuxParts.tsx
git commit -m "feat(machine): 六个主零件与三个附件"

git add src/components/machine/MachineStage.tsx src/components/machine/PacketLayer.tsx
git commit -m "feat(machine): 装配体几何、引线、跨零件管路与订单载荷层"

git add src/components src/styles src/App.tsx src/main.tsx
git commit -m "feat(ui): 三栏布局、九零件剖面与时间轴"

git add src/__tests__/app.test.tsx
git commit -m "test(ui): 交互与联动用例 11 条"

git add scripts docs/screenshots
git commit -m "test(visual): 视觉回归脚本与七张状态图"

git add README.md skills
git commit -m "docs: README 与可复现技能"
```

推送（如需覆盖旧实现，先给旧历史留分支）：

```bash
git push origin <old-sha>:refs/heads/archive/v1-grid
git push --force-with-lease origin main
```

## 7. 验收清单

- [ ] `npm ci` 干净装完，无 peer 警告阻塞
- [ ] `npm test` → 25 passed，无 `act(...)` 警告
- [ ] `npm run build` → 通过，`tsc --noEmit` 零错误
- [ ] `python scripts/shot.py ...` → `CONSOLE_ERRORS: 0`
- [ ] 拖时间轴时：子单在途位置、成交柱、冲击羽流、权益曲线、风控灯**同时**回退
- [ ] 拖拆解度 0 → 1：零件全程不重叠、不出画、引线不压机身
- [ ] 点九个零件都能开出对应剖面，Esc 能收起
- [ ] 压力测试预设下 E1 熔断，M3 出现被拦子单（红色支管）
- [ ] 注入「网关断线」后 E3 亮起，下游 M4 成交率下降
