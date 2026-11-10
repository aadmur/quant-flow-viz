---
name: quant-flow-viz
description: 复现 QuantFlow 股票量化交易全链路可视化项目（React 19 + Vite 7 + TS + Zustand，确定性仿真、零后端）。当需要重新初始化/运行/测试/构建该项目，或要按原子提交推送到 GitHub、验证九宫格交互与状态联动时使用。
---

# QuantFlow 复现与运维手册

一个交互式量化交易沙盘：九个面板（M1 行情监控 / M2 模型判别 / M3 程序化下单 / M4 订单执行 /
M5 市场冲击 / M6 策略复盘 + E1 风控 / E2 组合 / E3 异常）由同一个仿真时钟驱动。

**它不是行情回放工具**：没有外部数据源、没有后端、没有密钥。
唯一输入是 `seed + 一套参数`，输出是 540 个 tick 的完整快照序列。

---

## 1. 固定依赖

| 项 | 值 | 说明 |
| --- | --- | --- |
| Node | 20+（实测 22.22.2） | `node -v` 先确认 |
| 包管理 | npm + `package-lock.json` | 用 `npm ci` 复现，不要 `npm install` 升级 |
| react / react-dom | ^19 | 无 UI 框架依赖 |
| zustand | ^5 | 唯一状态库 |
| vite | ^7 | `dev` 绑 127.0.0.1:5178 |
| vitest | ^3 + jsdom + @testing-library/* | 40 条用例 |
| typescript | ^5.6 | strict，`build` 会先 `tsc --noEmit` |
| Python（仅截图） | 3.10+，需 `playwright` + `pillow` | 属于验证工具，不影响构建 |

图表全部手写 SVG，**没有引入 echarts / d3 / recharts**，不要为了改一个图去加图表库。

---

## 2. 三步复现

```bash
git clone https://github.com/aadmur/quant-flow-viz.git
cd quant-flow-viz
npm ci                      # 严格按 lock 安装
npm run dev                 # http://127.0.0.1:5178
```

验证生产可用：

```bash
npm run build               # tsc --noEmit && vite build，产物在 dist/
npm run preview             # 预览 dist/，默认 4173（端口被占会自动 +1，以输出为准）
npm test                    # 期望：2 files / 40 tests 全绿，约 7s
```

Windows 用户可双击根目录 `start-dev.cmd`（纯 ASCII 内容，`%~dp0` 自定位，
不依赖工作目录；缺 `node_modules` 时自动 `npm ci`）。

> **服务必须在用户自己的终端里起。** 由 AI 助手后台代起的 dev server 会在该轮
> 对话结束时被回收，表现为「链接刚才还好好的、现在 502」。这不是项目故障：
> 排查时先 `curl --noproxy '*'` 直接探端口，通了就说明只是进程没了，重起即可。
> 注意本机存在 `http_proxy`，不带 `--noproxy '*'` 的探活会被代理接管并返回 502，
> 很容易误判成服务崩了。

更新日志里的实测数据（改动 UI 后请重新测量，不要照抄）：
`dist/index-*.js ≈ 328 KB（gzip ≈ 104 KB）`、`css ≈ 29 KB（gzip ≈ 6 KB）`，
`tsc` 与 `vite build` 均无警告。

---

## 3. 输入数据与演示模式

**输入**：`src/model/params.ts` 里的 `DEFAULT_PARAMS`

```ts
seed: 20261110        // 确定性种子，换它 = 换一整套行情
entryThreshold: 0.42  // M2 开仓阈值
weights: { momentum, volume, imbalance, volatility, trend }
capitalPct: 32        // M3 投入资金占比
algo: 'twap'          // twap | vwap | iceberg | sniper
urgency: 0.55         // 拆单密度
impactCoeff: 1        // M5 平方根冲击系数 κ
marketVol: 1          // 市场波动倍数
liquidity: 1          // 盘口深度系数
exposureLimitPct: 28  // E1 敞口上限
```

标的固定为 `300750 宁德时代`（`FOCUS_SYMBOL`），观察列表另有 5 只；
`INITIAL_CAPITAL = 5,000,000`，`ADV_SHARES = 3,000,000`，`TOTAL_TICKS = 540`。

**演示模式**（全部内置，不需要额外数据文件）：

| 模式 | 触发方式 | 看什么 |
| --- | --- | --- |
| 默认会话 | 打开页面即自动播放 | 完整一轮：异动 → 触发 → 拆单 → 成交 → 冲击 → 复盘 |
| 中段定格 | 空格暂停 + 拖时间轴到 40% | 各面板同步切到同一 tick，验证状态联动 |
| 参数扫描 | 拖「开仓阈值 / 投入资金 / 紧急度」 | 松手 90ms 后整场重算，M3 子单数、M6 滑点跟着变 |
| 算法对比 | 切 TWAP / VWAP / ICEBERG / SNIPER | 子单数、限价偏移、成交率、滑点的差异 |
| 压力测试 | 预设「压力测试」 | 低流动性 + 高波动 + 高 κ，看风控闸门与熔断 |
| 异常注入 | E3 点任一异常类型 | 断线→拒单、闪崩→降量，下游行为改变而不是只记日志 |
| 手动下单 | 无母单时点「手动买入/卖出」 | 强制在当前 tick 生成母单 |

同一 `seed` + 同一参数必须逐 tick 完全一致——这是可复现的定义，改动模型后要用测试确认它仍成立。

---

## 4. 交付前验证清单

按顺序做完再提交，任何一项不过就不要推：

```bash
npm test                                    # 40 条全绿
npm run build                               # tsc + vite 均无错
npm run preview                             # 起 preview（默认 4173）

# 视觉回归（需要 playwright + pillow）
python scripts/shot.py shots http://127.0.0.1:4173/
python scripts/shot_cards.py shots/cards http://127.0.0.1:4173/
python scripts/shot_full.py shots/full.png http://127.0.0.1:4173/ 1680 1080
```

必须满足：

- `shot.py` 打印 `CONSOLE_ERRORS: 0`（有报错必须解决，不要只截图交差）
- `shot_cards.py` 每张卡都 `overflow=False`（`scrollHeight > clientHeight` 说明内容被卡片裁掉）
- 九个 `.card-code`（M1…M6、E1…E3）全部出现在 DOM 里
- 拖时间轴回到早段时，M3 的子单队列 / M4 的成交数要**跟着变少**（快照存的是副本，不是最终态）
- M5「拆单节省」为正数，且 `avgCostBps < oneShotCostBps`（同起点同口径）

`shot_cards.py` 用 `.card` 元素截图 + 溢出检测，是抓「一大片空白」「内容被切」最快的方式；
`scripts/crop.py <src> <out> x0 y0 x1 y1` 用来 1:1 看某个区域，**不要靠缩略图目测**。

---

## 5. GitHub 提交流程

提交粒度与原子功能对应，一条提交只做一件事，信息写清「改了什么 + 为什么」：

```
feat(model): 五因子信号、四种拆单算法、撮合与平方根冲击
fix(engine): 快照持有母单引用导致回看历史时看到未来状态
test(ui): 界面交互与状态联动用例
```

推荐顺序（本项目实际采用的切分）：

1. `chore:` 工程骨架（Vite + React + TS + 测试环境）
2. `feat(core):` 类型、PRNG、格式化、阶段元数据
3. `feat(model):` 按子域拆多条（行情 / 信号与撮合 / 冲击 / 风控组合复盘）
4. `feat(engine):` 单 tick 编排
5. `test(engine):` 引擎用例
6. `feat(store):` 状态机与防抖
7. `feat(ui):` 令牌 → 原子组件 → 布局 → 九宫格，逐层提交
8. `test(ui):` 界面用例 + 截图脚本
9. `docs:` README / 截图 / 本手册

推送前：

```bash
git status --short          # 确认没有 node_modules / dist / shots 被误加
git diff --numstat          # 用行数判断真实改动，别看 stat 的假阳性
git push
```

**注意（本机代理环境）**：Git 走 schannel 时无法校验证书吊销会直接失败
（`schannel: CRYPT_E_NO_REVOCATION_CHECK`），此时用

```bash
GIT_SSL_NO_VERIFY=1 GIT_TERMINAL_PROMPT=0 git push
```

只有在代理确实阻断了吊销检查时才这样用，并在提交说明里记一笔；
`http.sslBackend=openssl` + `sslCAInfo` 那套在本机反而会报 `error adding trust anchors`。

---

## 6. 常见坑

| 现象 | 原因 / 处理 |
| --- | --- |
| Playwright 报 `Executable doesn't exist … chromium_headless_shell` | 本机只装了 `chromium-1217`，脚本已支持 `QF_CHROME` 环境变量指定 chrome 路径 |
| 控制台报 `<rect> attribute width: A negative value is not valid` | 时间轴用 tick 比例算宽度，上游把 tick 算到 0 以下就会画出负矩形。`advance()` 必须对 dt 与结果都做下界钳制，`posOf()` 再加一层 [0, W]。用 `scripts/find_bad_rect.py` 定位（rAF 采样 + 打印祖先链），别靠读代码猜 |
| 截图里大片空白但卡片高度正常 | 同级最高的卡把行撑高，内容都堆在顶部。让最容易空的一块 `flex: 1`（子单队列、成交回报流、综合分轨迹都这么处理），别再加大 `gap` |
| 数字出现 `-0.0` | `fmtSigned` 已处理四舍五入为 0 的情况；新增格式化函数时要一并考虑 |
| 改一个参数后页面卡顿 | 重算走 90ms 尾随防抖，`scheduleRecompute` 不要改成立即执行；测试里用 `rebuild()` 同步重建 |
| 用 `npm run xxx` 在 Bash 工具里跑不起来 | 直接调 `node node_modules/<pkg>/bin/<cli>`，例如 `node node_modules/vitest/vitest.mjs run` |
| `git status` 报一堆 ` M` 但内容没变 | `core.autocrlf` 的 stat 假阳性，以 `git diff --numstat` 为准 |
| 预览端口不是 4178 | `vite preview` 端口被占会自动 +1，读输出里的 `Local:` 地址再传给截图脚本 |
| 链接刚才还能开，几分钟后 502 | 后台代起的 dev server 被回收，不是代码问题。先 `curl --noproxy '*'` 直连端口确认，再让用户在自己终端 `npm run dev` 或双击 `start-dev.cmd` |
| `curl http://127.0.0.1:xxxx` 恒返回 502 | 本机有 `http_proxy`，请求被代理接管。探本地端口一律加 `--noproxy '*'`，否则一定会误判 |

---

## 7. 扩展点

- **加一个阶段/面板**：`core/phases.ts` 加元数据 → `core/types.ts` 的 `Snapshot` 加字段 → `engine/simulate.ts` 在单 tick 末尾组装 → `components/modules/` 新建面板并挂进 `App.tsx` 九宫格 → 抽屉加一页明细。
- **加一个因子**：`core/types.ts` 的 `FactorKey` → `model/signal.ts` 计算并归一 → `params.ts` 的 `FACTOR_LABELS` / 默认权重 → M2 自动多一行。
- **加一种拆单算法**：`model/params.ts` 的 `ALGO_LABELS` / `ALGO_SHORT` / `ALGO_HINTS` → `model/order.ts` 的 `planChildOrders` 分支（切片数、间隔、`limitOffsetBps`）→ M3 按钮自动出现。
- **加一类异常**：`core/types.ts` 的 `IncidentKind` → `engine/simulate.ts` 的 `spawnIncident` 与影响分支（拒单 / 降速 / 降量）→ E3 的 `INJECTABLE` 自动可注入。

所有新增都遵守两条硬约束：**不能用 `Math.random`**，**不能让快照持有可能被后续修改的对象引用**。
