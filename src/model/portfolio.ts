import { hashSeed, createRng } from '../core/rng';
import type { ExposureSlice, Position, SymbolMeta } from '../core/types';
import { deterministicPrice } from './market';
import { WATCHLIST } from './params';

export interface Holding {
  meta: SymbolMeta;
  qty: number;
  /** 成本价 */
  avgCost: number;
}

/** 会话开始时的存量持仓：让 E2 的行业暴露一开始就不是空的 */
export const INITIAL_HOLDINGS: Holding[] = [
  { meta: WATCHLIST[1], qty: 200, avgCost: 1642.0 }, // 贵州茅台
  { meta: WATCHLIST[2], qty: 4000, avgCost: 52.36 }, // 中国平安
  { meta: WATCHLIST[5], qty: 3000, avgCost: 138.2 }, // 五粮液
];

/** 存量持仓的初始市值（tick=0 时按成本价计，保证起始 PnL 为 0） */
export const INITIAL_HOLDINGS_VALUE = INITIAL_HOLDINGS.reduce(
  (a, h) => a + h.qty * h.avgCost,
  0,
);

export { deterministicPrice };

export function buildPositions(args: {
  tick: number;
  focusCode: string;
  focusQty: number;
  focusAvgCost: number;
  focusLast: number;
  holdings: Holding[];
}): Position[] {
  const { tick, focusCode, focusQty, focusAvgCost, focusLast, holdings } = args;

  const rows: Position[] = [];

  for (const h of holdings) {
    const last = h.meta.code === focusCode ? focusLast : deterministicPrice(h.meta, tick);
    const marketValue = h.qty * last;
    const cost = h.qty * h.avgCost;
    rows.push({
      symbol: h.meta.code,
      name: h.meta.name,
      sector: h.meta.sector,
      qty: h.qty,
      avgCost: h.avgCost,
      last,
      marketValue,
      pnl: marketValue - cost,
      pnlPct: cost > 0 ? ((marketValue - cost) / cost) * 100 : 0,
      weight: 0,
    });
  }

  // 动态建仓的重点标的
  const focusMeta = WATCHLIST.find((w) => w.code === focusCode);
  if (focusMeta && focusQty > 0) {
    const marketValue = focusQty * focusLast;
    const cost = focusQty * focusAvgCost;
    rows.unshift({
      symbol: focusMeta.code,
      name: focusMeta.name,
      sector: focusMeta.sector,
      qty: focusQty,
      avgCost: focusAvgCost,
      last: focusLast,
      marketValue,
      pnl: marketValue - cost,
      pnlPct: cost > 0 ? ((marketValue - cost) / cost) * 100 : 0,
      weight: 0,
    });
  }

  const total = rows.reduce((a, r) => a + Math.abs(r.marketValue), 0) || 1;
  return rows.map((r) => ({ ...r, weight: Math.abs(r.marketValue) / total }));
}

export function buildExposure(positions: Position[]): ExposureSlice[] {
  const map = new Map<string, number>();
  for (const p of positions) {
    map.set(p.sector, (map.get(p.sector) ?? 0) + Math.abs(p.marketValue));
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
  return [...map.entries()]
    .map(([sector, value]) => ({ sector, value, weight: value / total }))
    .sort((a, b) => b.value - a.value);
}

/**
 * 相关性矩阵：同行业相关性更高，跨行业偏低。
 * 用确定性生成而非随机，保证每帧一致（否则热力图会跳动）。
 */
export function buildCorrelationMatrix(): { codes: string[]; matrix: number[][] } {
  const codes = WATCHLIST.map((w) => w.code);
  const n = codes.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      if (i === j) {
        matrix[i][j] = 1;
        continue;
      }
      const ri = createRng(hashSeed(`${codes[i]}|${codes[j]}`));
      const sameSector = WATCHLIST[i].sector === WATCHLIST[j].sector;
      const base = sameSector ? ri.range(0.62, 0.88) : ri.range(0.08, 0.46);
      matrix[i][j] = Number(base.toFixed(2));
      matrix[j][i] = Number(base.toFixed(2));
    }
  }
  return { codes, matrix };
}

/** 组合波动率（简化：按权重与平均相关性缩放的加权波动） */
export function portfolioVol(positions: Position[], metas: SymbolMeta[]): number {
  const total = positions.reduce((a, p) => a + Math.abs(p.marketValue), 0) || 1;
  let wSum = 0;
  let varSum = 0;
  for (const p of positions) {
    const meta = metas.find((m) => m.code === p.symbol);
    if (!meta) continue;
    const w = Math.abs(p.marketValue) / total;
    wSum += w;
    varSum += (w * meta.vol) ** 2;
  }
  // 相关性 0.35 的平均拥挤度修正
  return Math.sqrt(varSum + 0.35 * (wSum ** 2) * 0.0004) || 0.02;
}

export function holdingValue(positions: Position[]): number {
  return positions.reduce((a, p) => a + p.marketValue, 0);
}
