import { describe, expect, it } from 'vitest';
import { simulateSession } from '../engine/simulate';
import { DEFAULT_PARAMS, TOTAL_TICKS, type Params } from '../model/params';
import type { SessionData } from '../core/types';

function run(patch: Partial<Params> = {}, extra: { forced?: { tick: number; side: 'buy' | 'sell' }[]; injected?: { tick: number; kind: 'link-down' }[] } = {}): SessionData {
  return simulateSession({
    params: { ...DEFAULT_PARAMS, ...patch },
    forcedOrders: extra.forced,
    injectedIncidents: extra.injected,
  });
}

/** 找到第一张母单出现后的快照 */
function firstWorking(s: SessionData) {
  return s.snaps.find((x) => x.parent && x.parent.status === 'working');
}

describe('引擎：确定性与结构', () => {
  it('同一 seed + 同一参数逐 tick 完全一致', () => {
    const a = run();
    const b = run();
    expect(a.snaps.length).toBe(TOTAL_TICKS);
    for (let i = 0; i < a.snaps.length; i += 37) {
      expect(b.snaps[i].price).toBe(a.snaps[i].price);
      expect(b.snaps[i].decision.score).toBe(a.snaps[i].decision.score);
      expect(b.snaps[i].impact.totalBps).toBe(a.snaps[i].impact.totalBps);
    }
  });

  it('换 seed 会换掉整套行情', () => {
    const a = run({ seed: 20261110 });
    const b = run({ seed: 20261111 });
    const diff = a.snaps.filter((s, i) => Math.abs(s.price - b.snaps[i].price) > 1e-9).length;
    expect(diff).toBeGreaterThan(TOTAL_TICKS * 0.9);
  });

  it('权益曲线长度与 tick 数一致，且时钟单调递增', () => {
    const s = run();
    expect(s.equityCurve.length).toBe(TOTAL_TICKS);
    expect(s.snaps[0].clock < s.snaps[1].clock).toBe(true);
    expect(s.snaps[TOTAL_TICKS - 2].clock < s.snaps[TOTAL_TICKS - 1].clock).toBe(true);
  });
});

describe('快照是只读切片，不是最终态', () => {
  it('早期 tick 看不到后面的母单', () => {
    const s = run();
    const early = s.snaps[20];
    const late = s.snaps[s.snaps.length - 1];
    expect(early.parent).toBeNull();
    expect(late.parent).not.toBeNull();
  });

  it('不同 tick 的母单是各自独立的副本', () => {
    const s = run();
    const a = firstWorking(s);
    const later = s.snaps.filter((x) => x.parent).pop();
    expect(a && later).toBeTruthy();
    expect(a!.parent).not.toBe(later!.parent);
    expect(a!.parent!.children).not.toBe(later!.parent!.children);
  });

  it('改一个快照的盘口不会污染相邻快照', () => {
    const s = run();
    const before = s.snaps[100].book.bids[0].size;
    s.snaps[100].book.bids[0].size = -1;
    expect(s.snaps[101].book.bids[0].size).toBe(before >= 0 ? s.snaps[101].book.bids[0].size : before);
    expect(s.snaps[101].book.bids[0].size).toBeGreaterThan(0);
  });

  it('回看早段时成交过的子单少于末段', () => {
    const s = run();
    const withParent = s.snaps.filter((x) => x.parent);
    expect(withParent.length).toBeGreaterThan(10);
    // 子单数量在下单时就已规划完毕，随 tick 增长的是「已成交」的数量
    const first = withParent[0].parent!;
    const last = withParent[withParent.length - 1].parent!;
    const filledAt = (p: typeof first) => p.children.filter((c) => c.status === 'filled').length;
    expect(filledAt(first)).toBeLessThan(filledAt(last));
    expect(filledAt(first)).toBeLessThanOrEqual(first.children.length);
  });
});

describe('链路衔接', () => {
  it('母单出现后才会产生成交', () => {
    const s = run();
    expect(s.fills.length).toBeGreaterThan(0);
    const firstFill = s.fills[0];
    const parent = firstWorking(s)?.parent;
    expect(parent).toBeTruthy();
    expect(firstFill.tick).toBeGreaterThanOrEqual(parent!.createdTick);
  });

  it('成交率与滑点落在合理区间', () => {
    const last = run().snaps[TOTAL_TICKS - 1];
    expect(last.execution.fillRate).toBeGreaterThanOrEqual(0);
    expect(last.execution.fillRate).toBeLessThanOrEqual(1);
    expect(Number.isFinite(last.execution.avgSlippageBps)).toBe(true);
  });

  it('拆单成本低于同口径的一次性砸盘', () => {
    const s = run();
    const last = s.snaps[TOTAL_TICKS - 1];
    expect(last.impact.oneShotCostBps).toBeGreaterThan(0);
    expect(last.impact.avgCostBps).toBeLessThan(last.impact.oneShotCostBps);
  });

  it('冲击会推高价格：实际价不低于反事实价，且峰值处严格高于', () => {
    const s = run();
    // 任何时刻「我们成交后的价格」都不应低于「我们没成交的反事实价格」（买入方向）
    const bad = s.snaps.filter((x) => x.parent?.side === 'buy' && x.price < x.impact.counterfactualPrice - 1e-6);
    expect(bad.length).toBe(0);
    const peak = s.snaps.reduce((a, b) => (b.impact.totalBps > a.impact.totalBps ? b : a), s.snaps[0]);
    expect(peak.impact.totalBps).toBeGreaterThan(2);
    expect(peak.price).toBeGreaterThan(peak.impact.counterfactualPrice);
  });
});

describe('风控与异常会改变下游行为', () => {
  it('敞口上限压到最低时出现被拦子单', () => {
    const s = run({ exposureLimitPct: 12 });
    const last = s.snaps[TOTAL_TICKS - 1];
    expect(last.risk.blocked).toBeGreaterThan(0);
  });

  it('注入网关断线会留下异常记录并标记恢复', () => {
    const s = run({}, { injected: [{ tick: 200, kind: 'link-down' }] });
    const inc = s.incidents.find((i) => i.kind === 'link-down');
    expect(inc).toBeTruthy();
    expect(inc!.tick).toBe(200);
    expect(inc!.action.length).toBeGreaterThan(0);
  });

  it('手动下单会在指定 tick 生成母单', () => {
    const s = run({}, { forced: [{ tick: 120, side: 'buy' }] });
    const at = s.snaps[120];
    expect(at.parent).toBeTruthy();
    expect(at.parent!.createdTick).toBe(120);
    expect(at.parent!.side).toBe('buy');
  });
});
