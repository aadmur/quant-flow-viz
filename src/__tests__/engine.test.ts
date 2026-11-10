import { describe, expect, it } from 'vitest';
import { simulateSession } from '../engine/simulate';
import { DEFAULT_PARAMS } from '../model/params';

const session = simulateSession({ params: DEFAULT_PARAMS });

describe('仿真引擎 · 结构正确性', () => {
  it('生成连续完整的 tick 序列', () => {
    expect(session.snaps.length).toBe(session.totalTicks);
    expect(session.snaps[0].tick).toBe(0);
    expect(session.snaps[session.snaps.length - 1].tick).toBe(session.totalTicks - 1);
  });

  it('价格始终为正且不脱离业务量级', () => {
    for (const s of session.snaps) {
      expect(s.price).toBeGreaterThan(session.prevClose * 0.6);
      expect(s.price).toBeLessThan(session.prevClose * 1.6);
    }
  });

  it('t=0 时盈亏为 0（初始持仓按成本价计）', () => {
    expect(Math.abs(session.snaps[0].review.pnl)).toBeLessThan(1);
  });

  it('权益与盈亏口径自洽：pnl = equity - 初始资金', () => {
    for (const s of session.snaps) {
      expect(Math.abs(s.review.pnl - (s.review.equity - 5_000_000))).toBeLessThan(1);
    }
  });
});

describe('仿真引擎 · 确定性', () => {
  it('同一 seed + 参数 → 逐 tick 完全一致', () => {
    const again = simulateSession({ params: DEFAULT_PARAMS });
    expect(again.snaps.map((s) => s.price)).toEqual(session.snaps.map((s) => s.price));
    expect(again.fills.map((f) => `${f.tick}:${f.price}:${f.qty}`)).toEqual(
      session.fills.map((f) => `${f.tick}:${f.price}:${f.qty}`),
    );
  });

  it('不同 seed → 产生不同行情', () => {
    const other = simulateSession({ params: { ...DEFAULT_PARAMS, seed: 777 } });
    expect(other.snaps.map((s) => s.price)).not.toEqual(session.snaps.map((s) => s.price));
  });

  it('相同 seed 下改动参数会改变轨迹（参数确实生效）', () => {
    const aggressive = simulateSession({
      params: { ...DEFAULT_PARAMS, capitalPct: 58 },
    });
    expect(aggressive.snaps.map((s) => s.price)).not.toEqual(session.snaps.map((s) => s.price));
  });
});

describe('仿真引擎 · 全链路确实串联', () => {
  it('产生了异动、母单、成交与冲击', () => {
    expect(session.anomalies.length).toBeGreaterThan(10);
    expect(session.fills.length).toBeGreaterThan(10);
    const parents = new Set(session.snaps.map((s) => s.parent?.id).filter(Boolean));
    expect(parents.size).toBeGreaterThanOrEqual(2);
    const last = session.snaps[session.snaps.length - 1];
    expect(last.impact.permanentBps).toBeGreaterThan(0);
  });

  it('每一笔成交都能追溯到母单的子单', () => {
    const childIds = new Set<string>();
    for (const s of session.snaps) {
      s.parent?.children.forEach((c) => childIds.add(c.id));
    }
    for (const f of session.fills) {
      expect(childIds.has(f.childId)).toBe(true);
    }
  });

  it('成交时刻晚于母单创建时刻', () => {
    const created = new Map<string, number>();
    for (const s of session.snaps) {
      if (s.parent) created.set(s.parent.id, s.parent.createdTick);
    }
    for (const f of session.fills) {
      const ct = created.get(f.parentId);
      expect(ct).toBeDefined();
      expect(f.tick).toBeGreaterThanOrEqual(ct!);
    }
  });

  it('滑点分解严格闭合：total = delay + marketDrift + execution + opportunity', () => {
    const last = session.snaps[session.snaps.length - 1];
    const sp = last.review.slippage;
    const sum = sp.delay + sp.marketDrift + sp.execution + sp.opportunity;
    expect(Math.abs(sum - sp.total)).toBeLessThan(0.05);
  });

  it('风控拦截数不超过子单总数', () => {
    const totalChildren = session.snaps[session.snaps.length - 1].metrics.totalChildOrders;
    expect(session.snaps[session.snaps.length - 1].risk.blocked).toBeLessThanOrEqual(totalChildren);
  });

  it('冲击使实际价格持续高于/低于基准（存在偏离但量级合理）', () => {
    const last = session.snaps[session.snaps.length - 1];
    const devBps =
      ((last.price - last.impact.counterfactualPrice) / last.impact.counterfactualPrice) * 10000;
    expect(Math.abs(devBps)).toBeGreaterThan(0);
    expect(Math.abs(devBps)).toBeLessThan(120);
  });
});

describe('仿真引擎 · 边界情况', () => {
  it('极小仓位不会崩', () => {
    const tiny = simulateSession({ params: { ...DEFAULT_PARAMS, capitalPct: 4 } });
    expect(tiny.snaps.length).toBe(tiny.totalTicks);
    expect(tiny.fills.length).toBeGreaterThanOrEqual(0);
  });

  it('极高阈值 → 几乎不交易', () => {
    const picky = simulateSession({ params: { ...DEFAULT_PARAMS, entryThreshold: 0.8 } });
    expect(picky.fills.length).toBeLessThanOrEqual(session.fills.length);
  });

  it('低流动性 + 高波动不会产生负价格', () => {
    const stress = simulateSession({
      params: { ...DEFAULT_PARAMS, liquidity: 0.35, marketVol: 2.2, impactCoeff: 2.2 },
    });
    for (const s of stress.snaps) expect(s.price).toBeGreaterThan(0);
  });

  it('手动注入异常会出现在事件流中', () => {
    const injected = simulateSession({
      params: DEFAULT_PARAMS,
      injectedIncidents: [
        { tick: 100, kind: 'link-down' },
        { tick: 100, kind: 'liquidity-dry' },
      ],
    });
    expect(injected.incidents.some((i) => i.tick === 100 && i.kind === 'link-down')).toBe(true);
    expect(injected.incidents.some((i) => i.tick === 100 && i.kind === 'liquidity-dry')).toBe(true);
  });

  it('手动强制下单会立即产生母单', () => {
    const forced = simulateSession({
      params: DEFAULT_PARAMS,
      forcedOrders: [{ tick: 200, side: 'buy' }],
    });
    const snap = forced.snaps[200];
    expect(snap.parent).not.toBeNull();
    expect(snap.parent!.createdTick).toBe(200);
  });
});
