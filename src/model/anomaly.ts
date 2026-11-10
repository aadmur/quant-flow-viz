import { clamp } from '../core/format';
import type { Anomaly, AnomalyKind, OrderBook } from '../core/types';

export interface AnomalyMeta {
  label: string;
  code: string;
  color: string;
  desc: string;
}

export const ANOMALY_META: Record<AnomalyKind, AnomalyMeta> = {
  breakout: {
    label: '价格突破',
    code: 'BRK',
    color: '#2563eb',
    desc: '价格突破近 20 tick 极值，趋势可能启动',
  },
  'volume-surge': {
    label: '量能突增',
    code: 'VOL',
    color: '#7c3aed',
    desc: '成交量显著高于近期均值，资金异动',
  },
  'vol-spike': {
    label: '波动率跳升',
    code: 'VSP',
    color: '#d97706',
    desc: '单 tick 收益偏离超过 2.5 倍标准差',
  },
  imbalance: {
    label: '盘口失衡',
    code: 'IMB',
    color: '#0891b2',
    desc: '五档买卖挂单量严重失衡，短期方向性强',
  },
  'liquidity-drop': {
    label: '流动性枯竭',
    code: 'LIQ',
    color: '#dc2626',
    desc: '盘口厚度骤降，成交难度与滑点同时上升',
  },
};

/** 单类异动的最小触发间隔，避免同一事件刷屏 */
const COOLDOWN: Record<AnomalyKind, number> = {
  breakout: 18,
  'volume-surge': 22,
  'vol-spike': 16,
  imbalance: 14,
  'liquidity-drop': 40,
};

/**
 * M1 的核心：滚动窗口统计 + 阈值判定。
 * 用一个有状态检测器而非纯函数，因为「近 20 tick 极值」「冷却期」本质是历史依赖。
 */
export class AnomalyDetector {
  private prices: number[] = [];
  private volumes: number[] = [];
  private returns: number[] = [];
  private depths: number[] = [];
  private lastFire: Record<string, number> = {};
  private seq = 0;

  reset(): void {
    this.prices = [];
    this.volumes = [];
    this.returns = [];
    this.depths = [];
    this.lastFire = {};
    this.seq = 0;
  }

  private cooling(kind: AnomalyKind, tick: number): boolean {
    const last = this.lastFire[kind];
    if (last === undefined) return true;
    return tick - last >= COOLDOWN[kind];
  }

  private fire(kind: AnomalyKind, tick: number): void {
    this.lastFire[kind] = tick;
  }

  push(args: {
    tick: number;
    price: number;
    volume: number;
    ret: number;
    book: OrderBook;
    symbol: string;
    /** 盘口厚度的参照基准（用于 liquidity-drop 判定） */
    refDepth: number;
  }): Anomaly[] {
    const { tick, price, volume, ret, book, symbol, refDepth } = args;
    const out: Anomaly[] = [];

    this.prices.push(price);
    this.volumes.push(volume);
    this.returns.push(ret);
    const depth = book.bids.reduce((a, l) => a + l.size, 0) + book.asks.reduce((a, l) => a + l.size, 0);
    this.depths.push(depth);

    const win = 20;
    if (this.prices.length <= win) return out;

    const prevPrices = this.prices.slice(-win - 1, -1);
    const prevVols = this.volumes.slice(-win - 1, -1);
    const prevRets = this.returns.slice(-win - 1, -1);

    const hi = Math.max(...prevPrices);
    const lo = Math.min(...prevPrices);
    const meanVol = prevVols.reduce((a, b) => a + b, 0) / prevVols.length;
    const stdRet = Math.sqrt(
      prevRets.reduce((a, b) => a + b * b, 0) / prevRets.length,
    );

    // 1) 价格突破
    const breakUp = price > hi;
    const breakDown = price < lo;
    if ((breakUp || breakDown) && this.cooling('breakout', tick)) {
      const ref = breakUp ? hi : lo;
      const strengthBps = (Math.abs(price - ref) / ref) * 10000;
      if (strengthBps > 3) {
        this.fire('breakout', tick);
        this.seq += 1;
        out.push({
          id: `an-${this.seq}`,
          tick,
          kind: 'breakout',
          symbol,
          severity: strengthBps > 18 ? 3 : strengthBps > 8 ? 2 : 1,
          value: Number(strengthBps.toFixed(1)),
          threshold: 3,
          label: breakUp ? '向上突破 20T 高点' : '向下跌破 20T 低点',
          detail: `超出近 20 tick ${breakUp ? '最高' : '最低'}价 ${strengthBps.toFixed(1)}bp`,
        });
      }
    }

    // 2) 量能突增
    const volRatio = meanVol > 0 ? volume / meanVol : 1;
    if (volRatio > 2.1 && this.cooling('volume-surge', tick)) {
      this.fire('volume-surge', tick);
      this.seq += 1;
      out.push({
        id: `an-${this.seq}`,
        tick,
        kind: 'volume-surge',
        symbol,
        severity: volRatio > 4 ? 3 : volRatio > 3 ? 2 : 1,
        value: Number(volRatio.toFixed(2)),
        threshold: 2.1,
        label: `量能达 ${volRatio.toFixed(1)}× 均量`,
        detail: `本 tick 成交 ${Math.round(volume)} 股，近 20 tick 均量 ${Math.round(meanVol)} 股`,
      });
    }

    // 3) 波动率跳升
    if (stdRet > 0 && Math.abs(ret) > stdRet * 2.5 && this.cooling('vol-spike', tick)) {
      this.fire('vol-spike', tick);
      this.seq += 1;
      const z = Math.abs(ret) / stdRet;
      out.push({
        id: `an-${this.seq}`,
        tick,
        kind: 'vol-spike',
        symbol,
        severity: z > 4.5 ? 3 : z > 3.4 ? 2 : 1,
        value: Number(z.toFixed(2)),
        threshold: 2.5,
        label: `收益偏离 ${z.toFixed(1)}σ`,
        detail: `单 tick 波动 ${(ret * 10000).toFixed(1)}bp，为近 20 tick 标准差的 ${z.toFixed(1)} 倍`,
      });
    }

    // 4) 盘口失衡
    const bidSum = book.bids.reduce((a, l) => a + l.size, 0);
    const askSum = book.asks.reduce((a, l) => a + l.size, 0);
    const imb = bidSum + askSum > 0 ? (bidSum - askSum) / (bidSum + askSum) : 0;
    if (Math.abs(imb) > 0.32 && this.cooling('imbalance', tick)) {
      this.fire('imbalance', tick);
      this.seq += 1;
      out.push({
        id: `an-${this.seq}`,
        tick,
        kind: 'imbalance',
        symbol,
        severity: Math.abs(imb) > 0.55 ? 3 : Math.abs(imb) > 0.42 ? 2 : 1,
        value: Number((imb * 100).toFixed(1)),
        threshold: 32,
        label: imb > 0 ? '买盘挂单占优' : '卖盘挂单占优',
        detail: `五档买卖失衡 ${(imb * 100).toFixed(1)}%，买 ${bidSum} / 卖 ${askSum} 股`,
      });
    }

    // 5) 流动性枯竭
    if (refDepth > 0 && depth / refDepth < 0.52 && this.cooling('liquidity-drop', tick)) {
      this.fire('liquidity-drop', tick);
      this.seq += 1;
      out.push({
        id: `an-${this.seq}`,
        tick,
        kind: 'liquidity-drop',
        symbol,
        severity: depth / refDepth < 0.3 ? 3 : 2,
        value: Number(((depth / refDepth) * 100).toFixed(0)),
        threshold: 52,
        label: '盘口厚度骤降',
        detail: `五档总量仅为基准的 ${((depth / refDepth) * 100).toFixed(0)}%，滑点风险上升`,
      });
    }

    // 只保留窗口所需的历史，避免长会话内存膨胀
    if (this.prices.length > 200) {
      this.prices = this.prices.slice(-120);
      this.volumes = this.volumes.slice(-120);
      this.returns = this.returns.slice(-120);
      this.depths = this.depths.slice(-120);
    }

    return out;
  }

  /** 供 UI 展示的「近 N tick 异动强度」 */
  static aggregateScore(anomalies: Anomaly[], tick: number, window = 20): number {
    const recent = anomalies.filter((a) => tick - a.tick <= window);
    if (recent.length === 0) return 0;
    return clamp(recent.reduce((a, x) => a + x.severity, 0) / (window * 0.35), 0, 1);
  }
}
