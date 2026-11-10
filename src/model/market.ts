import { createRng, hashSeed, type Rng } from '../core/rng';
import { clamp } from '../core/format';
import type { Bar, OrderBook, PriceLevel, QuoteRow, SymbolMeta, TapeRow, Side } from '../core/types';
import {
  ADV_SHARES,
  FOCUS_SYMBOL,
  SESSION_VOLUME_SHARE,
  TICK_SECONDS,
  TICK_SIGMA_DIVISOR,
  TOTAL_TICKS,
  WATCHLIST,
  type Params,
} from './params';

const PRICE_TICK = 0.01;

/**
 * 基准行情路径（counterfactual world）。
 *
 * 关键设计：先生成一条「完全没有我方交易」的价格轨迹，引擎再在其上叠加我方
 * 冲击。这样 M5 的反事实对比、以及 M6 的冲击成本归因才有唯一的真值来源，
 * 而不是事后编一个数字。
 */
export interface MarketPath {
  /** 无我方交易时的中间价 */
  baseline: number[];
  /** 每 tick 的自然成交量（股） */
  volume: number[];
  /** 每 tick 主动买卖失衡 [-1, 1] */
  flowBias: number[];
  /** 每 tick 半价差（bp） */
  halfSpreadBps: number[];
  /** 每档基准挂单量（股） */
  levelDepth: number[];
  /** 每 tick 的收益率，供因子计算 */
  returns: number[];
}

export function createMarketPath(params: Params, symbol: SymbolMeta, totalTicks: number): MarketPath {
  const rng = createRng(params.seed);
  const baseline: number[] = [];
  const volume: number[] = [];
  const flowBias: number[] = [];
  const halfSpreadBps: number[] = [];
  const levelDepth: number[] = [];
  const returns: number[] = [];

  // 每 tick 的波动尺度：日波动 → 单 tick 波动
  const tickSigma = (symbol.vol / Math.sqrt(TICK_SIGMA_DIVISOR)) * params.marketVol;

  let price = symbol.basePrice;
  let volState = 1;

  for (let t = 0; t < totalTicks; t += 1) {
    // regime：慢周期趋势，制造可被「趋势强度」因子捕捉的段落
    const slow = Math.sin((t / 178) * Math.PI * 2) * 0.35 + Math.sin((t / 61) * Math.PI * 2) * 0.16;
    const drift = tickSigma * slow * 0.55;

    // 波动率的状态切换：偶尔进入高波动段，用于触发 vol-spike 异动
    volState = 0.82 + 0.55 * Math.abs(Math.sin((t / 97) * Math.PI * 2));
    if (rng.chance(0.018)) {
      volState *= rng.range(1.8, 3.1);
    }

    let r = drift + tickSigma * volState * rng.normal();

    // 低频跳跃：模拟消息面冲击，价格一次性跳空
    if (rng.chance(0.012)) {
      r += tickSigma * rng.range(4, 11) * (rng.chance(0.5) ? 1 : -1);
    }

    price = price * (1 + r);
    price = Math.max(price, symbol.basePrice * 0.72);
    price = Math.round(price / PRICE_TICK) * PRICE_TICK;

    // 自然成交量：以 ADV 的会话份额为基准，与 |收益| 正相关（放量常伴异动）
    const activity = 1 + (Math.abs(r) / tickSigma) * 0.55;
    const tickBaseVolume = (ADV_SHARES * SESSION_VOLUME_SHARE) / TOTAL_TICKS;
    const vol = Math.max(60, tickBaseVolume * activity * rng.range(0.7, 1.35));

    // 主动买卖失衡：跟随当 tick 收益方向，叠加噪声
    const bias = clamp(Math.sign(r) * 0.45 + rng.normal() * 0.42, -1, 1);

    baseline.push(price);
    returns.push(r);
    volume.push(vol);
    flowBias.push(bias);
    halfSpreadBps.push(clamp(1.1 + Math.abs(r) / tickSigma * 0.9 + rng.range(-0.2, 0.4), 0.6, 9));
    levelDepth.push(
      clamp((ADV_SHARES / 2600) * params.liquidity * rng.range(0.72, 1.4), 60, 4200),
    );
  }

  return { baseline, volume, flowBias, halfSpreadBps, levelDepth, returns };
}

/** 生成五档盘口。depthMultiplier < 1 表示我方已吃掉部分深度 */
export function buildBook(
  mid: number,
  halfSpreadBps: number,
  levelDepth: number,
  depthMultiplier: number,
  rng: Rng,
): OrderBook {
  const half = Math.max(PRICE_TICK / 2, (mid * halfSpreadBps) / 10000);
  const bestBid = Math.round((mid - half) / PRICE_TICK) * PRICE_TICK;
  const bestAsk = Math.round((mid + half) / PRICE_TICK) * PRICE_TICK;

  const bids: PriceLevel[] = [];
  const asks: PriceLevel[] = [];
  const mult = clamp(depthMultiplier, 0.06, 1);

  for (let i = 0; i < 5; i += 1) {
    // 越远的档位挂单越多（典型盘口形态）
    const shape = 1 + i * 0.55;
    const noise = rng.range(0.78, 1.24);
    bids.push({
      price: Number((bestBid - i * PRICE_TICK).toFixed(2)),
      size: Math.round(levelDepth * shape * noise * mult),
    });
    asks.push({
      price: Number((bestAsk + i * PRICE_TICK).toFixed(2)),
      size: Math.round(levelDepth * shape * noise * mult),
    });
  }

  return { bids, asks };
}

/** 盘口失衡：买卖五档挂单量之差 / 和 */
export function bookImbalance(book: OrderBook): number {
  const sum = (levels: PriceLevel[]) => levels.reduce((a, l) => a + l.size, 0);
  const b = sum(book.bids);
  const a = sum(book.asks);
  if (a + b === 0) return 0;
  return (b - a) / (a + b);
}

/**
 * 滚动 K 线：每 6 个 tick 合成一根。
 * 返回最近 maxBars 根（含当前未完成的一根）。
 */
export function buildBars(
  prices: number[],
  volumes: number[],
  tick: number,
  bucket = 6,
  maxBars = 64,
): Bar[] {
  const bars: Bar[] = [];
  const lastTick = Math.min(tick, prices.length - 1);
  const closedBuckets = Math.floor(lastTick / bucket);

  for (let b = Math.max(0, closedBuckets - maxBars); b <= closedBuckets; b += 1) {
    const from = b * bucket;
    const to = Math.min(from + bucket - 1, lastTick);
    if (from > to) continue;
    let high = -Infinity;
    let low = Infinity;
    let vol = 0;
    for (let i = from; i <= to; i += 1) {
      high = Math.max(high, prices[i]);
      low = Math.min(low, prices[i]);
      vol += volumes[i] ?? 0;
    }
    bars.push({
      t: from,
      open: prices[from],
      high,
      low,
      close: prices[to],
      volume: vol,
    });
  }

  return bars.slice(-maxBars);
}

/** 逐笔成交：把当 tick 的自然成交量拆成若干笔 */
export function makeTape(
  tick: number,
  mid: number,
  naturalVolume: number,
  bias: number,
  halfSpreadBps: number,
  rng: Rng,
  maxRows = 6,
): TapeRow[] {
  const rows: TapeRow[] = [];
  const count = Math.min(maxRows, 2 + Math.floor(Math.abs(bias) * 5));
  const half = (mid * halfSpreadBps) / 10000;

  for (let i = 0; i < count; i += 1) {
    const side: Side = rng.next() < 0.5 + bias * 0.45 ? 'buy' : 'sell';
    const price =
      side === 'buy' ? mid + half * rng.range(0.2, 1.6) : mid - half * rng.range(0.2, 1.6);
    rows.push({
      tick,
      price: Number((Math.round(price / PRICE_TICK) * PRICE_TICK).toFixed(2)),
      qty: Math.round((naturalVolume / count) * rng.range(0.35, 1.7)),
      side,
      ours: false,
    });
  }
  return rows;
}

/**
 * 非重点标的的确定性报价。
 *
 * 必须是 tick 的纯函数：时间轴 seek 时不能依赖"从 0 重放"，否则拖动会卡。
 * 同时要求 tick=0 时恰为 basePrice，这样会话起始权益可以精确等于初始资金，
 * 避免出现凭空的浮盈。
 */
export function deterministicPrice(meta: SymbolMeta, tick: number): number {
  const s = hashSeed(meta.code) % 1000;
  const p1 = 37 + (s % 23);
  const p2 = 11 + (s % 7);
  const wave = Math.sin(tick / p1) * 0.55 + Math.sin(tick / p2) * 0.2;
  return Number((meta.basePrice * (1 + wave * meta.vol * 1.6)).toFixed(2));
}

/**
 * 观察列表报价。
 */
export function buildQuotes(tick: number, focusPrice: number, focusPrevClose: number): QuoteRow[] {
  return WATCHLIST.map((meta) => {
    if (meta.code === FOCUS_SYMBOL.code) {
      const changePct = ((focusPrice - focusPrevClose) / focusPrevClose) * 100;
      return {
        symbol: meta,
        last: focusPrice,
        changePct,
        spreadBps: 1.2,
        volumeRatio: 1 + Math.abs(changePct) * 0.18,
        turnover: focusPrice * ADV_SHARES * 0.001,
        driftBps: changePct * 100,
      };
    }
    const last = deterministicPrice(meta, tick);
    const changePct = ((last - meta.basePrice) / meta.basePrice) * 100;
    return {
      symbol: meta,
      last,
      changePct,
      spreadBps: 1 + Math.abs(changePct) * 0.35,
      volumeRatio: 1 + Math.abs(changePct) * 0.32,
      turnover: last * ADV_SHARES * 0.0009,
      driftBps: changePct * 100,
    };
  });
}

/** 市场状态标签：用 40 tick 滚动收益 + 波动水平推断 */
export function inferRegime(prices: number[], index: number, tickSigma: number): string {
  const back = Math.max(0, index - 40);
  const ret = (prices[index] - prices[back]) / prices[back];
  const recentVol = Math.abs(ret) / Math.max(1, index - back);
  if (recentVol > tickSigma * 0.35) return '高波动';
  if (ret > 0.004) return '趋势上行';
  if (ret < -0.004) return '趋势下行';
  return '区间震荡';
}

export const SESSION_LENGTH = TOTAL_TICKS;
export const BAR_SECONDS = TICK_SECONDS * 6;
