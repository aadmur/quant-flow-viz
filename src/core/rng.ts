/**
 * 确定性伪随机数生成器（mulberry32）。
 *
 * 设计约束：整个沙盘必须在「同一 seed + 同一参数」下产出逐 tick 完全一致的
 * 结果，否则时间轴回放与策略复盘都失去意义。因此全项目禁止使用 Math.random，
 * 一律通过 Rng 实例取值。
 */
export interface Rng {
  /** [0, 1) 均匀分布 */
  next(): number;
  /** [min, max) 均匀分布 */
  range(min: number, max: number): number;
  /** 标准正态分布（Box-Muller），均值 0 方差 1 */
  normal(): number;
  /** 以 p 概率返回 true */
  chance(p: number): boolean;
  /** 从数组中等概率取一个元素 */
  pick<T>(items: readonly T[]): T;
  /** 当前内部状态，用于快照/恢复 */
  state(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let spare: number | null = null;

  const normal = (): number => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = next() * 2 - 1;
      v = next() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * mul;
    return u * mul;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    normal,
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length) % items.length],
    state: () => a,
  };
}

/** 把字符串（如股票代码）稳定地转成数值 seed */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
