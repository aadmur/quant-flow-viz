/** 数值/时间格式化工具。UI 里所有数字展示都应走这里，保证口径一致。 */

const NBSP = '\u2009';

export function fmtPrice(v: number, digits = 2): string {
  return v.toFixed(digits);
}

export function fmtSigned(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}` : s;
}

export function fmtPct(v: number, digits = 2): string {
  return `${fmtSigned(v, digits)}%`;
}

export function fmtBps(v: number, digits = 1): string {
  return `${fmtSigned(v, digits)}${NBSP}bp`;
}

/** 金额：自动切换 万 / 亿 */
export function fmtMoney(v: number, digits = 2): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(digits)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(digits)}万`;
  return `${Math.round(v)}元`;
}

export function fmtMoneySigned(v: number, digits = 2): string {
  const s = fmtMoney(v, digits);
  return v > 0 ? `+${s}` : s;
}

export function fmtQty(v: number): string {
  return Math.round(v).toLocaleString('zh-CN');
}

export function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return v.toFixed(0);
}

/** tick → 展示时钟。一个 tick 视为 6 秒，从 09:30:00 起 */
export const TICK_SECONDS = 6;
export const SESSION_START = 9 * 3600 + 30 * 60;

export function tickToClock(tick: number): string {
  const total = SESSION_START + tick * TICK_SECONDS;
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function tickToDuration(tick: number): string {
  const total = tick * TICK_SECONDS;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 涨红跌绿（A 股惯例）→ 返回 CSS 变量名 */
export function trendColor(v: number): string {
  if (v > 0) return 'var(--up)';
  if (v < 0) return 'var(--down)';
  return 'var(--text-3)';
}

/**
 * 成本类指标取色：正数 = 不利（红），负数 = 有利（绿）。
 * 注意与「涨红跌绿」区分——这里红绿表达的是好处/坏处，不是涨跌方向。
 */
export function costColor(v: number): string {
  if (v > 0) return 'var(--neg)';
  if (v < 0) return 'var(--pos)';
  return 'var(--text-3)';
}
