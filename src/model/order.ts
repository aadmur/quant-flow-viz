import { clamp, lerp } from '../core/format';
import type { AlgoKind, ChildOrder, Side } from '../core/types';

export const LOT_SIZE = 100;

/** 交易场所池：用于给子单标注路由，也让「异常处理」有对象可打 */
export const VENUES = ['SSE-Prime', 'SZSE-Block', 'DarkPool-A', 'SmartRouter'];

export interface SlicePlanInput {
  parentId: string;
  side: Side;
  targetQty: number;
  algo: AlgoKind;
  urgency: number;
  createdTick: number;
  /** 激活时刻的中间价预期，仅用于 planning 展示；实际价格在激活时重算 */
  arrivalPrice: number;
}

export interface SlicePlanResult {
  children: ChildOrder[];
  /** 计划执行的时间跨度（tick） */
  horizonTicks: number;
  /** 说明文案，供 UI 展示「算法怎么想的」 */
  rationale: string;
}

/** VWAP 的 U 型成交量曲线权重（开盘/收盘重，中间轻） */
function vwapProfile(pos: number, n: number): number {
  if (n <= 1) return 1;
  const x = pos / (n - 1);
  const u = (x - 0.5) * 2; // [-1, 1]
  return 0.42 + 1.3 * u * u;
}

/**
 * 母单拆解：把「买 3100 股」翻译成一串带时间戳的子单。
 *
 * 四种算法的差异被压缩到三个维度上：切片数量、切片间隔、限价激进程度。
 * 这样切换算法时，下游执行与冲击的变化是可解释的，而不是黑箱。
 */
export function planChildOrders(input: SlicePlanInput): SlicePlanResult {
  const { parentId, side, targetQty, algo, urgency, createdTick } = input;

  const lots = Math.max(1, Math.round(targetQty / LOT_SIZE));
  const u = clamp(urgency, 0.15, 1);
  // 紧急度越高，执行窗口越短
  const horizon = Math.round(lerp(132, 22, u));

  let count: number;
  let avgOffsetBps: number;
  let ttl: number;
  let rationale: string;

  switch (algo) {
    case 'twap':
      count = clamp(Math.round(lerp(6, 30, u)), 3, Math.max(3, lots));
      avgOffsetBps = -0.5;
      ttl = 8;
      rationale = `等间隔拆 ${count} 单，每单纯挂单不穿价，执行窗口约 ${horizon} tick`;
      break;
    case 'vwap':
      count = clamp(Math.round(lerp(8, 26, u)), 4, Math.max(4, lots));
      avgOffsetBps = -0.3;
      ttl = 8;
      rationale = `按 U 型成交量曲线分配 ${count} 单，两端加权，贴合市场节奏`;
      break;
    case 'iceberg':
      // 冰山：暴露量小、补单频繁
      count = clamp(Math.round(lots * 0.55), 5, 34);
      avgOffsetBps = -1.4;
      ttl = 5;
      rationale = `冰山模式拆 ${count} 单，单笔仅暴露小额，成交后立即补单`;
      break;
    case 'sniper':
      count = clamp(Math.round(lerp(2, 5, u)), 2, 5);
      avgOffsetBps = 7.5;
      ttl = 2;
      rationale = `狙击模式仅 ${count} 单，穿价主动吃单，追求成交优先`;
      break;
    default:
      count = 6;
      avgOffsetBps = -1;
      ttl = 6;
      rationale = '默认等分拆单';
  }

  const gap = Math.max(1, Math.floor(horizon / count));
  const baseQty = Math.floor((targetQty / count) / LOT_SIZE) * LOT_SIZE;

  const children: ChildOrder[] = [];
  let allocated = 0;

  for (let i = 0; i < count; i += 1) {
    const isLast = i === count - 1;
    let qty: number;

    if (isLast) {
      qty = Math.max(LOT_SIZE, targetQty - allocated);
    } else if (algo === 'vwap') {
      const w = vwapProfile(i, count);
      const totalW = Array.from({ length: count }, (_, k) => vwapProfile(k, count)).reduce(
        (a, b) => a + b,
        0,
      );
      qty = Math.max(LOT_SIZE, Math.round(((targetQty * w) / totalW) / LOT_SIZE) * LOT_SIZE);
    } else if (algo === 'iceberg') {
      qty = Math.max(LOT_SIZE, Math.min(baseQty, 4 * LOT_SIZE));
    } else if (algo === 'sniper') {
      qty = Math.max(LOT_SIZE, Math.round((targetQty / count) / LOT_SIZE) * LOT_SIZE);
    } else {
      qty = baseQty;
    }

    if (allocated + qty > targetQty && !isLast) {
      qty = Math.max(LOT_SIZE, targetQty - allocated);
    }
    if (allocated >= targetQty) break;
    allocated += qty;

    const scheduledTick = createdTick + i * gap;
    // 越靠后的切片略微更激进，模拟「越拖越急」的执行心理与算法补量逻辑
    const drift = (i / Math.max(1, count - 1)) * (algo === 'sniper' ? 3 : 1.4);

    children.push({
      id: `${parentId}-c${String(i + 1).padStart(2, '0')}`,
      parentId,
      seq: i + 1,
      side,
      qty,
      filled: 0,
      limitPrice: 0,
      arrivalPrice: input.arrivalPrice,
      scheduledTick,
      expireTick: scheduledTick + ttl,
      status: 'pending',
      algo,
      avgFillPrice: 0,
      slippageBps: 0,
      venue: VENUES[i % VENUES.length],
      riskVerdict: 'pass',
      hiddenQty: algo === 'iceberg' ? Math.round(qty * 2.5) : undefined,
      limitOffsetBps: Number((avgOffsetBps + drift).toFixed(2)),
    });
  }

  return {
    children,
    horizonTicks: children.length > 0 ? children[children.length - 1].scheduledTick - createdTick : 0,
    rationale,
  };
}

/** 目标股数：资金 → 手数取整 */
export function targetQtyFromCapital(capital: number, price: number): number {
  const raw = capital / price;
  return Math.max(LOT_SIZE, Math.floor(raw / LOT_SIZE) * LOT_SIZE);
}

export type { ChildOrder };
