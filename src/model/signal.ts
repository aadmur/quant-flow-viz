import { clamp, fmtBps } from '../core/format';
import type { Decision, FactorKey, FactorScore } from '../core/types';
import { FACTOR_LABELS, FACTOR_ORDER, type Params } from './params';

const EPS = 1e-9;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** 最小二乘斜率（按 tick 索引），用于趋势强度 */
function slope(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sx += i;
    sy += xs[i];
    sxy += i * xs[i];
    sxx += i * i;
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < EPS) return 0;
  return (n * sxy - sx * sy) / denom;
}

export interface SignalContext {
  prices: number[];
  volumes: number[];
  returns: number[];
  bookImbalance: number;
  /** 单 tick 波动尺度，用于把绝对值无量纲化 */
  tickSigma: number;
  params: Params;
}

function rawMomentum(ctx: SignalContext): number {
  const { prices, tickSigma } = ctx;
  if (prices.length < 18) return 0;
  const now = prices[prices.length - 1];
  const back = prices[prices.length - 17];
  const ret = (now - back) / back;
  // 以 4 倍单 tick 波动为「满量程」
  return Math.tanh(ret / (tickSigma * 4 + EPS));
}

function rawVolume(ctx: SignalContext): number {
  const { volumes } = ctx;
  if (volumes.length < 21) return 0;
  const recent = mean(volumes.slice(-4));
  const base = mean(volumes.slice(-21, -1));
  if (base < EPS) return 0;
  return Math.tanh((recent / base - 1) * 1.35);
}

function rawImbalance(ctx: SignalContext): number {
  return Math.tanh(ctx.bookImbalance / 0.32);
}

function rawVolatility(ctx: SignalContext): number {
  const { returns } = ctx;
  if (returns.length < 40) return 0;
  const short = std(returns.slice(-8));
  const long = std(returns.slice(-40));
  if (long < EPS) return 0;
  // 波动放大时给动量策略正向支撑，过热时开始惩罚
  const ratio = short / long;
  return Math.tanh((ratio - 1) * 1.4) * (ratio > 2.4 ? 0.45 : 1);
}

function rawTrend(ctx: SignalContext): number {
  const { prices, tickSigma } = ctx;
  if (prices.length < 30) return 0;
  const win = prices.slice(-30);
  const sl = slope(win);
  const norm = (sl / win[win.length - 1]) / (tickSigma * 0.42 + EPS);
  return Math.tanh(norm);
}

const RAW_FNS: Record<FactorKey, (ctx: SignalContext) => number> = {
  momentum: rawMomentum,
  volume: rawVolume,
  imbalance: rawImbalance,
  volatility: rawVolatility,
  trend: rawTrend,
};

/** 把五个因子按用户权重合成综合分 */
export function computeDecision(ctx: SignalContext): Decision {
  const { params } = ctx;
  const rawSum =
    FACTOR_ORDER.reduce((a, k) => a + Math.max(0, params.weights[k]), 0) || 1;

  const factors: FactorScore[] = FACTOR_ORDER.map((key) => {
    const raw = clamp(RAW_FNS[key](ctx), -1, 1);
    const weight = Math.max(0, params.weights[key]) / rawSum;
    return {
      key,
      label: FACTOR_LABELS[key],
      raw,
      weight,
      contribution: raw * weight,
    };
  });

  const score = clamp(
    factors.reduce((a, f) => a + f.contribution, 0),
    -1,
    1,
  );

  // 置信度：|score| 越过 0.2 后快速上升，用于「模型有多确信」
  const confidence = 1 / (1 + Math.exp(-6 * (Math.abs(score) - 0.2)));

  const threshold = params.entryThreshold;
  const action = score > threshold ? 'buy' : score < -threshold ? 'sell' : 'hold';

  return {
    score: Number(score.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    action,
    threshold,
    factors,
    flipped: false,
    trigger: action !== 'hold',
  };
}

/** 给详情面板用的一句话解释 */
export function explainDecision(d: Decision): string {
  const top = [...d.factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
  if (!top) return '因子数据不足';
  const dir = top.contribution >= 0 ? '看多' : '看空';
  if (d.action === 'hold') {
    return `综合分 ${d.score.toFixed(2)} 未达阈值 ±${d.threshold.toFixed(2)}，${top.label}贡献最大（${dir}），继续观望`;
  }
  return `综合分 ${d.score.toFixed(2)} 越过阈值 ±${d.threshold.toFixed(2)}，主因「${top.label}」${dir}，触发${d.action === 'buy' ? '买入' : '卖出'}`;
}

export function scoreToBps(score: number): string {
  return fmtBps(score * 100, 0);
}
