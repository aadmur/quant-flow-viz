import { ADV_SHARES } from './params';

/** 临时冲击的衰减时间常数（tick）。越大回撤越慢 */
export const TEMP_DECAY_TAU = 9.5;
/** 临时冲击相对永久冲击的放大倍数 */
const TEMP_MULTIPLIER = 1.45;

/**
 * 市场冲击模型（平方根律）。
 *
 *   impact(return) = κ · σ · sqrt(Q / ADV)
 *
 * 注意这里对「累积成交量」求值，再取相邻两次的**增量**作为本次成交的冲击。
 * 这是平方根律的关键：冲击对总量呈次线性，拆单之所以有效正是因为这一点。
 * 若按单笔线性累加，会得到完全不合理的巨大冲击。
 */
export class ImpactModel {
  /** 永久冲击（bp），不会回撤 */
  permanentBps = 0;
  /** 临时冲击（bp），按指数衰减 */
  temporaryBps = 0;
  /** 累积成交股数 */
  cumulativeQty = 0;
  /** 冲击曲线（最近 N 个 tick 的 totalBps） */
  curve: number[] = [];
  /** 冲击造成的额外成本（元） */
  costYuan = 0;

  private coeff: number;
  private sigma: number;

  constructor(params: { impactCoeff: number; sigma: number }) {
    this.coeff = params.impactCoeff;
    this.sigma = params.sigma;
  }

  setCoeff(coeff: number): void {
    this.coeff = coeff;
  }

  private totalFor(qty: number): number {
    if (qty <= 0) return 0;
    return this.coeff * this.sigma * Math.sqrt(qty / ADV_SHARES) * 10000;
  }

  /**
   * 登记一笔成交，返回该笔成交带来的瞬时冲击增量（bp）。
   */
  registerFill(qty: number, midPrice: number): number {
    const before = this.totalFor(this.cumulativeQty);
    this.cumulativeQty += qty;
    const after = this.totalFor(this.cumulativeQty);
    const delta = Math.max(0, after - before);

    this.permanentBps = after;
    this.temporaryBps += delta * TEMP_MULTIPLIER;

    // 额外成本 = 成交金额 × 冲击比例（用当前中间价近似）
    this.costYuan += qty * midPrice * ((this.permanentBps + this.temporaryBps) / 10000) * 0.5;

    return delta;
  }

  /** 每 tick 调用一次：临时冲击衰减 */
  decay(): void {
    this.temporaryBps *= Math.exp(-1 / TEMP_DECAY_TAU);
    if (this.temporaryBps < 0.01) this.temporaryBps = 0;

    const total = this.totalBps();
    this.curve.push(total);
    if (this.curve.length > 90) this.curve.shift();
  }

  totalBps(): number {
    return this.permanentBps + this.temporaryBps;
  }

  /** 价格倍率：1 + totalBps/10000 */
  priceFactor(): number {
    return 1 + this.totalBps() / 10000;
  }

  reset(): void {
    this.permanentBps = 0;
    this.temporaryBps = 0;
    this.cumulativeQty = 0;
    this.curve = [];
    this.costYuan = 0;
  }
}

/**
 * 反事实断言：若一次性把 qty 全部砸向市场，冲击会有多大？
 * 用于在 UI 上对比「拆单 vs 一次性」的差距。
 */
export function oneShotImpactBps(qty: number, impactCoeff: number, sigma: number): number {
  if (qty <= 0) return 0;
  return impactCoeff * sigma * Math.sqrt(qty / ADV_SHARES) * 10000;
}
