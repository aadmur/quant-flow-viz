import { ADV_SHARES } from './params';

/** 临时冲击的衰减时间常数（tick）。越大回撤越慢 */
export const TEMP_DECAY_TAU = 9.5;
/** 临时冲击相对永久冲击的放大倍数 */
export const TEMP_MULTIPLIER = 1.45;

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
  /** 冲击造成的额外成本（元）——按当前母单累计 */
  costYuan = 0;
  /** 当前母单的成交金额，用于把成本换算成单位 bp */
  notional = 0;

  private coeff: number;
  private sigma: number;
  /** 母单开始时的永久冲击存量：本单成本只算它之后的增量 */
  private basePermanentBps = 0;
  /** 母单开始时的累积成交量：一次性砸盘的反事实从同一起点出发 */
  private baseQty = 0;

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

    // 该笔成交是在「当时的冲击峰值」上成交的，多付的钱就是成本
    // 只计入本单自身造成的增量，母单开始前已有的冲击属于上一单的成本
    const amount = qty * midPrice;
    this.notional += amount;
    this.costYuan += amount * ((this.permanentBps - this.basePermanentBps + this.temporaryBps) / 10000);

    return delta;
  }

  /** 当前母单自身带来的永久冲击增量（已扣除母单开始前的存量） */
  marginalPermanentBps(): number {
    return Math.max(0, this.permanentBps - this.basePermanentBps);
  }

  /** 当前母单的冲击成本（单位成交金额的 bp）——可与「一次性砸盘」公平对比 */
  avgCostBps(): number {
    if (this.notional <= 0) return 0;
    return (this.costYuan / this.notional) * 10000;
  }

  /**
   * 反事实：若在母单起点把 qty 一次性砸向市场，单位成本会是多少（bp）。
   *
   * 与 avgCostBps 严格同口径——同样的起点、同样只算本单增量，
   * 差别只在「一次性成交时全部委托量都压在冲击峰值上」。
   */
  oneShotCostBps(qty: number): number {
    if (qty <= 0) return 0;
    const delta = this.totalFor(this.baseQty + qty) - this.totalFor(this.baseQty);
    return delta * (1 + TEMP_MULTIPLIER);
  }

  /** 新母单开始时重置成本口径与冲击基线，避免跨母单混算 */
  resetCost(): void {
    this.costYuan = 0;
    this.notional = 0;
    this.basePermanentBps = this.permanentBps;
    this.baseQty = this.cumulativeQty;
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
    this.notional = 0;
    this.basePermanentBps = 0;
    this.baseQty = 0;
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
