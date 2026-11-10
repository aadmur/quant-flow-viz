/**
 * 领域模型类型定义。
 *
 * 整个应用围绕一条「事件流 + 快照序列」组织：
 *   Params ──simulate()──▶ SessionData{ snaps[i], fills[], anomalies[] ... }
 * 每个 Snapshot 是对第 i 个 tick 时刻全链路状态的只读切片，
 * 所有模块组件都只消费 Snapshot，不自行计时、不自行计算行情。
 */

export type Side = 'buy' | 'sell';
export type PhaseId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'e1' | 'e2' | 'e3';

/** ---------------- 行情 ---------------- */

export interface SymbolMeta {
  code: string;
  name: string;
  sector: string;
  basePrice: number;
  /** 该标的的波动率基准（年化近似） */
  vol: number;
}

export interface PriceLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: PriceLevel[];
  asks: PriceLevel[];
}

export interface Bar {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TapeRow {
  tick: number;
  price: number;
  qty: number;
  side: Side;
  /** 该笔成交是否来自本策略（用于在逐笔流里高亮「我方脚印」） */
  ours: boolean;
}

export interface QuoteRow {
  symbol: SymbolMeta;
  last: number;
  changePct: number;
  spreadBps: number;
  volumeRatio: number;
  /** 当日累计成交额（万元） */
  turnover: number;
  /** 相对开盘的偏离（bp） */
  driftBps: number;
}

/** ---------------- M1 异动识别 ---------------- */

export type AnomalyKind =
  | 'breakout'
  | 'volume-surge'
  | 'vol-spike'
  | 'imbalance'
  | 'liquidity-drop';

export interface Anomaly {
  id: string;
  tick: number;
  kind: AnomalyKind;
  symbol: string;
  severity: 1 | 2 | 3;
  /** 实测值 */
  value: number;
  /** 触发阈值 */
  threshold: number;
  label: string;
  detail: string;
}

/** ---------------- M2 模型判别 ---------------- */

export type FactorKey = 'momentum' | 'volume' | 'imbalance' | 'volatility' | 'trend';

export interface FactorScore {
  key: FactorKey;
  label: string;
  /** 原始因子值，落在 [-1, 1] */
  raw: number;
  /** 归一化后的权重占比 */
  weight: number;
  /** raw * weight，用于归因展示 */
  contribution: number;
}

export type Action = 'buy' | 'sell' | 'hold';

export interface Decision {
  /** 加权综合分 [-1, 1] */
  score: number;
  /** 置信度 [0, 1]，由综合分经 Sigmoid 压缩 */
  confidence: number;
  action: Action;
  threshold: number;
  factors: FactorScore[];
  /** 与上一 tick 相比是否发生动作翻转 */
  flipped: boolean;
  /** 本 tick 是否满足开仓条件 */
  trigger: boolean;
}

/** ---------------- M3 程序化下单 ---------------- */

export type AlgoKind = 'twap' | 'vwap' | 'iceberg' | 'sniper';

export type ChildStatus =
  | 'pending'
  | 'active'
  | 'partial'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'blocked';

export type RiskVerdict = 'pass' | 'warn' | 'block';

export interface ChildOrder {
  id: string;
  parentId: string;
  seq: number;
  side: Side;
  qty: number;
  filled: number;
  /** 限价（sniper 为穿价，其他为挂价） */
  limitPrice: number;
  /** 该子单下达时的市场中间价 */
  arrivalPrice: number;
  scheduledTick: number;
  expireTick: number;
  status: ChildStatus;
  algo: AlgoKind;
  avgFillPrice: number;
  slippageBps: number;
  venue: string;
  riskVerdict: RiskVerdict;
  rejectReason?: string;
  /** 冰山单隐藏量 */
  hiddenQty?: number;
  /**
   * 限价相对激活时中间价的偏移（bp）。
   * 正数 = 更激进（买单往上穿价）；负数 = 更被动（挂深一点）。
   * 规划阶段还不知道未来价格，所以存偏移量、激活时再折算成绝对价格。
   */
  limitOffsetBps: number;
}

export interface ParentOrder {
  id: string;
  symbol: string;
  side: Side;
  targetQty: number;
  algo: AlgoKind;
  createdTick: number;
  arrivalPrice: number;
  children: ChildOrder[];
  filledQty: number;
  avgPrice: number;
  status: 'working' | 'done' | 'cancelled';
  /** 触发该母单的综合分 */
  triggerScore: number;
}

/** ---------------- M4 订单执行 ---------------- */

export interface Fill {
  id: string;
  tick: number;
  childId: string;
  parentId: string;
  price: number;
  qty: number;
  side: Side;
  /** 成交时的市场中间价，用于计算执行成本 */
  midAtFill: number;
  /** 相对「成交时中间价」的执行滑点（bp，正数为不利） */
  slippageBps: number;
  /** 该笔成交自身产生的瞬时冲击（bp） */
  impactBps: number;
  venue: string;
}

export interface ExecutionStats {
  fillRate: number;
  avgSlippageBps: number;
  worstSlippageBps: number;
  partialCount: number;
  cancelCount: number;
  rejectCount: number;
  blockedCount: number;
  /** 成交均价 */
  avgPrice: number;
  filledQty: number;
}

/** ---------------- M5 市场冲击 ---------------- */

export interface ImpactState {
  /** 永久冲击（不会回撤），累积 bp */
  permanentBps: number;
  /** 临时冲击（指数衰减），当前 bp */
  temporaryBps: number;
  totalBps: number;
  /** 已被消耗的盘口深度（股） */
  depthConsumed: number;
  /** 反事实价格：假如我们没下单，价格会是多少 */
  counterfactualPrice: number;
  /** 当前母单的冲击成本（元） */
  costYuan: number;
  /** 当前母单的冲击成本（单位成交金额的 bp），可与一次性砸盘直接对比 */
  avgCostBps: number;
  /** 当 tick 冲击曲线（用于绘制衰减轨迹），最近 60 点 */
  curve: number[];
}

/** ---------------- E1 风险 / E2 组合 ---------------- */

export type BreakerState = 'closed' | 'half-open' | 'open';

export interface RiskState {
  /** 名义敞口（元） */
  exposure: number;
  exposureLimit: number;
  var95: number;
  varLimit: number;
  drawdownPct: number;
  drawdownLimitPct: number;
  /** 每分钟下单笔数 */
  orderRate: number;
  orderRateLimit: number;
  breaker: BreakerState;
  blocked: number;
  warned: number;
  passed: number;
  utilization: number;
}

export interface Position {
  symbol: string;
  name: string;
  sector: string;
  qty: number;
  avgCost: number;
  last: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  weight: number;
}

export interface ExposureSlice {
  sector: string;
  value: number;
  weight: number;
}

/** ---------------- E3 异常处理 ---------------- */

export type IncidentKind =
  | 'link-down'
  | 'order-reject'
  | 'risk-block'
  | 'liquidity-dry'
  | 'stale-quote';

export interface Incident {
  id: string;
  tick: number;
  kind: IncidentKind;
  severity: 'info' | 'warn' | 'error';
  message: string;
  /** 恢复所需 tick 数 */
  duration: number;
  resolvedAt: number | null;
  /** 处置动作描述 */
  action: string;
}

/** ---------------- M6 复盘 ---------------- */

export interface SlippageBreakdown {
  /** 延迟成本：决策价 → 子单激活价的漂移 */
  delay: number;
  /** 市场漂移：子单激活 → 成交时刻的中间价变化（与我方执行能力无关） */
  marketDrift: number;
  /** 执行成本：成交价 vs 成交时中间价（负数 = 赚到价差） */
  execution: number;
  /** 机会成本：未成交部分对应的价格变动 */
  opportunity: number;
  /** 其中：冲击成本（execution 的组成部分，仅作备忘，不参与求和） */
  impact: number;
  /** 总滑点：相对决策价 */
  total: number;
}

export interface ReviewState {
  arrivalPrice: number;
  vwapBenchmark: number;
  ourAvgPrice: number;
  slippage: SlippageBreakdown;
  /** 相对 VWAP 的执行优劣（bp，负数=优于基准） */
  vsVwapBps: number;
  pnl: number;
  equity: number;
  maxDrawdownPct: number;
  sharpeLike: number;
  winRate: number;
}

/** ---------------- 会话指标 / 快照 ---------------- */

export interface SessionMetrics {
  /** 当日行情 tick 数 */
  tickCount: number;
  anomalyCount: number;
  decisionFlips: number;
  totalChildOrders: number;
  totalFills: number;
  filledQty: number;
  incidentCount: number;
  /** 当前链路所处阶段（用于流程高亮） */
  activePhase: PhaseId;
}

export interface Snapshot {
  tick: number;
  /** 展示用时钟，如 "09:41:07" */
  clock: string;
  /** 标的当前中间价 */
  price: number;
  prevClose: number;
  changePct: number;
  /** 图表用 K 线（滚动窗口） */
  bars: Bar[];
  book: OrderBook;
  tape: TapeRow[];
  quotes: QuoteRow[];
  /** 本 tick 新增异动（不是全量） */
  anomaliesNow: Anomaly[];
  anomalyCount: number;
  decision: Decision;
  /** 当前（或最近一笔）母单 */
  parent: ParentOrder | null;
  /** 全量成交，按 tick 递增；用 fillCount 截断 */
  fillCount: number;
  execution: ExecutionStats;
  impact: ImpactState;
  positions: Position[];
  exposure: ExposureSlice[];
  risk: RiskState;
  incidents: Incident[];
  activeIncidents: Incident[];
  review: ReviewState;
  metrics: SessionMetrics;
  /** 市场状态标签，如「震荡」「趋势上行」 */
  regime: string;
}

export interface SessionData {
  seed: number;
  symbol: SymbolMeta;
  totalTicks: number;
  prevClose: number;
  snaps: Snapshot[];
  fills: Fill[];
  anomalies: Anomaly[];
  incidents: Incident[];
  /** 每 tick 的「无我方交易」价格轨迹，用于冲击反事实对比 */
  baselinePrices: number[];
  /** 每 tick 的账户权益，供权益曲线使用（真实值，非插值） */
  equityCurve: number[];
  /** 摘要：一次会话的最终结论 */
  summary: {
    totalPnl: number;
    totalSlippageBps: number;
    impactCostYuan: number;
    fillRate: number;
    durationTicks: number;
  };
}
