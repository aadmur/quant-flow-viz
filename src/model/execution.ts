import { clamp } from '../core/format';
import type { Rng } from '../core/rng';
import type { ChildOrder, ExecutionStats, OrderBook } from '../core/types';
import { LOT_SIZE } from './order';

const PRICE_TICK = 0.01;

export interface FillContext {
  mid: number;
  book: OrderBook;
  /** 本 tick 市场自然成交量（股） */
  naturalVolume: number;
  /** 流动性系数（参数滑块） */
  liquidity: number;
  rng: Rng;
  /** 行情过期：报价不可信，子单直接拒单 */
  staleQuote: boolean;
  /** 流动性枯竭：成交量按比例萎缩 */
  liquidityDry: boolean;
}

export interface FillResult {
  qty: number;
  price: number;
  /** 打穿了几档（用于执行详情展示） */
  levelsConsumed: number;
  /** 是否属于主动吃单 */
  aggressive: boolean;
}

/**
 * 把 bp 偏移折算成带最小价位的绝对限价。
 *
 * 约定：offsetBps 描述「相对中间价赚取/让出的空间」。买单被动挂 → 负偏移 →
 * 限价低于中间价；卖单被动挂 → 负偏移 → 限价高于中间价。符号随方向翻转。
 */
export function resolveLimitPrice(mid: number, offsetBps: number, side: 'buy' | 'sell'): number {
  const sign = side === 'buy' ? 1 : -1;
  const raw = mid * (1 + (sign * offsetBps) / 10000);
  return Math.max(PRICE_TICK, Math.round(raw / PRICE_TICK) * PRICE_TICK);
}

/**
 * 尝试为一个子单撮合出成交。
 *
 * 两条路径：
 *  1) 限价已穿越对手盘 → 按档位逐层吃，价格加权，能用完多少算多少；
 *  2) 未穿越 → 挂在队尾排队，按「本 tick 自然成交量 / 队前挂单量」估算成交概率。
 *
 * 刻意保留「部分成交」：这是理解执行风险的关键，也是 E3 异常处理的触发点。
 */
export function attemptFill(child: ChildOrder, ctx: FillContext): FillResult | null {
  const remaining = child.qty - child.filled;
  if (remaining <= 0) return null;

  const isBuy = child.side === 'buy';
  const opposite = isBuy ? ctx.book.asks : ctx.book.bids;
  const sameSide = isBuy ? ctx.book.bids : ctx.book.asks;
  const liqFactor = ctx.liquidity * (ctx.liquidityDry ? 0.22 : 1);

  // —— 路径 1：主动吃单 ——
  const accessible = opposite.filter((lv) =>
    isBuy ? lv.price <= child.limitPrice + 1e-9 : lv.price >= child.limitPrice - 1e-9,
  );

  if (accessible.length > 0) {
    let need = remaining;
    let notional = 0;
    let got = 0;
    let levels = 0;

    for (const lv of accessible) {
      if (need <= 0) break;
      const available = Math.max(0, lv.size * liqFactor * ctx.rng.range(0.55, 1.05));
      const take = Math.min(need, available);
      if (take <= 0) continue;
      notional += take * lv.price;
      got += take;
      need -= take;
      levels += 1;
    }

    const qty = Math.floor(got / LOT_SIZE) * LOT_SIZE;
    if (qty <= 0) return null;

    // 逐档吃单，均价必然劣于首档
    const avg = notional / got;
    return {
      qty: Math.min(qty, remaining),
      price: Number((Math.round(avg / PRICE_TICK) * PRICE_TICK).toFixed(2)),
      levelsConsumed: levels,
      aggressive: true,
    };
  }

  // —— 路径 2：被动挂单 ——
  //
  // 物理约束：买单挂在最优买价之下时，只有市场价格真的跌到该价位才可能成交。
  // 早期版本只按「自然成交量 / 队前挂单量」给概率，不看限价与中间价的距离，
  // 结果会撮合出「买在中间价下方 1.3%」这种不可能的价格——那会污染整条滑点归因。
  const bestSame = sameSide[0].price;
  const inQueue = isBuy ? child.limitPrice >= bestSame - 1e-9 : child.limitPrice <= bestSame + 1e-9;
  const throughput = ctx.naturalVolume * 0.3 * liqFactor;

  if (!inQueue) {
    // 挂在更深处：等待价格穿越
    const crossed = isBuy
      ? ctx.mid <= child.limitPrice + 1e-9
      : ctx.mid >= child.limitPrice - 1e-9;
    if (!crossed) return null;
    const qty = Math.floor(Math.min(remaining, throughput * ctx.rng.range(0.4, 1.2)) / LOT_SIZE) * LOT_SIZE;
    if (qty <= 0) return null;
    return {
      qty,
      price: child.limitPrice,
      levelsConsumed: 0,
      aggressive: false,
    };
  }

  // 在最优档排队：按「可成交量 / 队前挂单量」估算成交概率
  const queueAhead = sameSide[0].size * 0.55;
  const p = clamp(throughput / (queueAhead + remaining * 0.45 + 1), 0.01, 0.9);

  if (!ctx.rng.chance(p)) return null;

  const capacity = throughput * ctx.rng.range(0.35, 1.15);
  const qty = Math.floor(Math.min(remaining, capacity) / LOT_SIZE) * LOT_SIZE;
  if (qty <= 0) return null;

  return {
    qty,
    price: child.limitPrice,
    levelsConsumed: 0,
    aggressive: false,
  };
}

export const EMPTY_EXEC_STATS: ExecutionStats = {
  fillRate: 0,
  avgSlippageBps: 0,
  worstSlippageBps: 0,
  partialCount: 0,
  cancelCount: 0,
  rejectCount: 0,
  blockedCount: 0,
  avgPrice: 0,
  filledQty: 0,
};

/** 滑点（bp）：买单成交价高于到达价为不利，故取正 */
export function slippageBps(side: 'buy' | 'sell', fillPrice: number, arrival: number): number {
  const raw = ((fillPrice - arrival) / Math.max(arrival, 1e-6)) * 10000;
  return Number((side === 'buy' ? raw : -raw).toFixed(2));
}

export function mergeExecStats(
  stats: ExecutionStats,
  patch: Partial<ExecutionStats>,
): ExecutionStats {
  return { ...stats, ...patch };
}
