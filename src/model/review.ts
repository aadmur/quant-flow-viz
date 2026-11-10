import type { Position, ReviewState, Side, SlippageBreakdown } from '../core/types';

export interface SlippageInput {
  /** 决策时刻的中间价（母单到达价） */
  decisionPrice: number;
  /** 所有子单激活时刻的加权平均中间价 */
  avgChildArrival: number;
  /** 成交时中间价的成交量加权均值 */
  avgMidAtFill: number;
  /** 实际成交均价 */
  ourAvgPrice: number;
  /** 冲击模型给出的累计冲击（bp） */
  impactBps: number;
  /** 会话当前价，用于机会成本 */
  currentPrice: number;
  /** 成交比例 0~1 */
  fillRatio: number;
  side: Side;
}

const EMPTY: SlippageBreakdown = {
  delay: 0,
  marketDrift: 0,
  execution: 0,
  opportunity: 0,
  impact: 0,
  total: 0,
};

/**
 * 滑点分解（implementation shortfall 口径），严格闭合：
 *
 *   total = delay + marketDrift + execution + opportunity
 *
 * 关键在于**按目标委托量归一**：已成交部分按成交价算、未成交部分按当前价算，
 * 两者加权才是这笔委托真正的实现缺口。早期版本把「已成交部分的 bp」和
 * 「未成交部分的机会成本」直接相加，等于把两个不同分母混在一起，
 * 会让四项之和 ≠ 总滑点。
 *
 *  - 延迟成本   ：决策 → 子单激活，价格已经漂走的量
 *  - 市场漂移   ：子单激活 → 成交，市场自己的走法（与执行能力无关）
 *  - 执行成本   ：成交价 vs 成交时中间价。负数 = 赚到价差
 *  - 机会成本   ：没成交的那部分，价格跑掉了
 *
 * 冲击成本（impact）是 execution 的组成部分，只作备忘，不参与求和。
 * 符号约定：正数 = 对我不利。
 */
export function computeSlippage(input: SlippageInput): SlippageBreakdown {
  const {
    decisionPrice,
    avgChildArrival,
    avgMidAtFill,
    ourAvgPrice,
    impactBps,
    currentPrice,
    fillRatio,
    side,
  } = input;
  if (decisionPrice <= 0 || ourAvgPrice <= 0) return { ...EMPTY };

  const sign = side === 'buy' ? 1 : -1;
  const r = Math.min(1, Math.max(0, fillRatio));
  const bp = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 10000 * sign : 0);

  const delay = r * bp(avgChildArrival || decisionPrice, decisionPrice);
  const marketDrift = r * bp(avgMidAtFill || avgChildArrival, avgChildArrival || decisionPrice);
  const execution = r * bp(ourAvgPrice, avgMidAtFill || avgChildArrival);
  const opportunity = (1 - r) * bp(currentPrice, decisionPrice);
  const total = delay + marketDrift + execution + opportunity;

  return {
    delay: round2(delay),
    marketDrift: round2(marketDrift),
    execution: round2(execution),
    opportunity: round2(opportunity),
    impact: round2(impactBps),
    total: round2(total),
  };
}

function round2(v: number): number {
  return Number.isFinite(v) ? Number(v.toFixed(2)) : 0;
}

export interface ReviewInput {
  equity: number;
  capital: number;
  equityHistory: number[];
  maxDrawdownPct: number;
  positions: Position[];
  arrivalPrice: number;
  vwapBenchmark: number;
  ourAvgPrice: number;
  slippage: SlippageBreakdown;
  side: Side;
}

export function computeReview(input: ReviewInput): ReviewState {
  const pnl = input.equity - input.capital;
  const vsVwap =
    input.ourAvgPrice > 0 && input.vwapBenchmark > 0
      ? ((input.ourAvgPrice - input.vwapBenchmark) / input.vwapBenchmark) *
        10000 *
        (input.side === 'buy' ? 1 : -1)
      : 0;

  // 类夏普：用权益序列的逐 tick 收益均值 / 标准差
  const eq = input.equityHistory;
  let sharpeLike = 0;
  if (eq.length > 12) {
    const rets: number[] = [];
    for (let i = 1; i < eq.length; i += 1) {
      if (eq[i - 1] > 0) rets.push((eq[i] - eq[i - 1]) / eq[i - 1]);
    }
    const m = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
    const sd = Math.sqrt(
      rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length - 1),
    );
    if (sd > 1e-9) sharpeLike = (m / sd) * Math.sqrt(rets.length);
  }

  const holding = input.positions.filter((p) => p.qty > 0);
  const winRate =
    holding.length > 0 ? holding.filter((p) => p.pnl > 0).length / holding.length : 0;

  return {
    arrivalPrice: round2(input.arrivalPrice),
    vwapBenchmark: round2(input.vwapBenchmark),
    ourAvgPrice: round2(input.ourAvgPrice),
    slippage: input.slippage,
    vsVwapBps: round2(vsVwap),
    pnl: round2(pnl),
    equity: round2(input.equity),
    maxDrawdownPct: round2(input.maxDrawdownPct),
    sharpeLike: Number(sharpeLike.toFixed(2)),
    winRate: Number((winRate * 100).toFixed(1)),
  };
}
