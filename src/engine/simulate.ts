import { clamp, tickToClock } from '../core/format';
import { createRng } from '../core/rng';
import type {
  Anomaly,
  ChildOrder,
  Decision,
  Fill,
  Incident,
  IncidentKind,
  ParentOrder,
  PhaseId,
  SessionData,
  Side,
  Snapshot,
  TapeRow,
  BreakerState,
} from '../core/types';
import { AnomalyDetector } from '../model/anomaly';
import { attemptFill, EMPTY_EXEC_STATS, resolveLimitPrice, slippageBps } from '../model/execution';
import { ImpactModel } from '../model/impact';
import {
  buildBars,
  buildBook,
  buildQuotes,
  bookImbalance,
  createMarketPath,
  inferRegime,
  makeTape,
  type MarketPath,
} from '../model/market';
import { LOT_SIZE, planChildOrders, targetQtyFromCapital } from '../model/order';
import {
  ADV_SHARES,
  FOCUS_SYMBOL,
  INITIAL_CAPITAL,
  TICK_SIGMA_DIVISOR,
  TOTAL_TICKS,
  type Params,
} from '../model/params';
import {
  buildExposure,
  buildPositions,
  deterministicPrice,
  INITIAL_HOLDINGS,
  INITIAL_HOLDINGS_VALUE,
  portfolioVol,
} from '../model/portfolio';
import { computeReview, computeSlippage } from '../model/review';
import { computeRiskState, preTradeCheck } from '../model/risk';
import { computeDecision } from '../model/signal';

export interface SimulateOptions {
  params: Params;
  totalTicks?: number;
  forcedOrders?: { tick: number; side: Side }[];
  injectedIncidents?: { tick: number; kind: IncidentKind }[];
}

const COMMISSION = 0.0003;
const STAMP_TAX = 0.001;
const ENTRY_COOLDOWN = 66;
const DRAWDOWN_LIMIT = 4.5;

const INCIDENT_SPECS: Record<
  IncidentKind,
  { severity: 'info' | 'warn' | 'error'; message: string; duration: number; action: string }
> = {
  'link-down': {
    severity: 'error',
    message: '交易网关连接中断，委托通道不可用',
    duration: 9,
    action: '切换备用网关 SZSE-Block，撤销在途未成交子单',
  },
  'order-reject': {
    severity: 'warn',
    message: '交易所拒单：价格笼子校验失败',
    duration: 3,
    action: '重算限价并重新报单',
  },
  'risk-block': {
    severity: 'warn',
    message: '盘前风控拦截：敞口 / 速率超限',
    duration: 6,
    action: '暂停建仓，等待敞口自然回落',
  },
  'liquidity-dry': {
    severity: 'error',
    message: '盘口流动性骤降，可成交量不足',
    duration: 12,
    action: '降低单笔委托量，延长执行窗口',
  },
  'stale-quote': {
    severity: 'info',
    message: '行情快照超过 3s 未更新',
    duration: 4,
    action: '标记报价为不可信，暂停穿价委托',
  },
};

/** 过去 10 tick（≈1 分钟）内的子单下发数，作为 order/min 速率 */
function orderRateOf(parent: ParentOrder | null, tick: number): number {
  if (!parent) return 0;
  return parent.children.filter((c) => tick - c.scheduledTick <= 10 && c.status !== 'pending').length;
}

/** 依据本 tick 活跃的事件推断链路当前处于哪个阶段 */
function inferActivePhase(a: {
  tick: number;
  fills: number;
  parent: ParentOrder | null;
  anomalies: number;
  decision: Decision;
  impactBps: number;
  incidents: number;
  breaker: BreakerState;
}): PhaseId {
  if (a.incidents > 0) return 'e3';
  if (a.breaker !== 'closed') return 'e1';
  if (a.fills > 0) return 'm4';
  if (a.parent && a.parent.status === 'working') return a.parent.filledQty > 0 ? 'm4' : 'm3';
  if (a.impactBps > 0.5) return 'm5';
  if (a.decision.flipped) return 'm2';
  if (a.anomalies > 0) return 'm1';
  return 'm2';
}

export function simulateSession(options: SimulateOptions): SessionData {
  const { params } = options;
  const totalTicks = options.totalTicks ?? TOTAL_TICKS;
  const symbol = FOCUS_SYMBOL;

  const rng = createRng(params.seed ^ 0x9e3779b9);
  const path: MarketPath = createMarketPath(params, symbol, totalTicks);
  const detector = new AnomalyDetector();
  const tickSigma = (symbol.vol / Math.sqrt(TICK_SIGMA_DIVISOR)) * params.marketVol;
  const impact = new ImpactModel({
    impactCoeff: params.impactCoeff,
    sigma: symbol.vol * params.marketVol,
  });

  const prevClose = symbol.basePrice;
  // 现金 = 初始总权益 - 存量持仓市值，保证 t=0 时 PnL 恰好为 0
  let cash = INITIAL_CAPITAL - INITIAL_HOLDINGS_VALUE;
  let focusQty = 0;
  let focusAvgCost = 0;
  let peakEquity = INITIAL_CAPITAL;
  let maxDrawdownPct = 0;

  let parent: ParentOrder | null = null;
  let lastEntryTick = -999;

  const fills: Fill[] = [];
  const anomalies: Anomaly[] = [];
  const incidents: Incident[] = [];
  const snaps: Snapshot[] = [];
  const equityHistory: number[] = [];
  const actualPrices: number[] = [];

  let prevAction: Decision['action'] = 'hold';
  let decisionFlips = 0;
  let blocked = 0;
  let warned = 0;
  let passed = 0;
  let partialCount = 0;
  let cancelCount = 0;
  let rejectCount = 0;
  let worstSlippage = -Infinity;
  let slipNum = 0;
  let slipDen = 0;
  let midFillNum = 0;
  let breaker: BreakerState = 'closed';
  let breakerOpenAt = -1;
  let incidentSeq = 0;

  let benchPv = 0;
  let benchV = 0;
  let benchStartTick = -1;
  let childArrivalSum = 0;
  let childArrivalCount = 0;
  let parentArrival = 0;
  let parentSide: Side = 'buy';

  const forced = new Map<number, Side[]>();
  for (const f of options.forcedOrders ?? []) {
    forced.set(f.tick, [...(forced.get(f.tick) ?? []), f.side]);
  }
  const injected = new Map<number, IncidentKind[]>();
  for (const inc of options.injectedIncidents ?? []) {
    injected.set(inc.tick, [...(injected.get(inc.tick) ?? []), inc.kind]);
  }

  const spawnIncident = (tick: number, kind: IncidentKind): void => {
    const spec = INCIDENT_SPECS[kind];
    incidentSeq += 1;
    incidents.push({
      id: `inc-${incidentSeq}`,
      tick,
      kind,
      severity: spec.severity,
      message: spec.message,
      duration: spec.duration,
      resolvedAt: null,
      action: spec.action,
    });
  };

  const isActive = (kind: IncidentKind, tick: number): boolean => {
    for (let i = incidents.length - 1; i >= 0; i -= 1) {
      const inc = incidents[i];
      if (inc.kind !== kind) continue;
      if (tick >= inc.tick && tick < inc.tick + inc.duration) return true;
    }
    return false;
  };

  for (let t = 0; t < totalTicks; t += 1) {
    // —— 1. 价格：基准 × 冲击因子 ——
    impact.decay();
    const mid = Number((path.baseline[t] * impact.priceFactor()).toFixed(2));
    actualPrices.push(mid);

    // —— 2. 盘口 ——
    const depletion = clamp(1 - impact.cumulativeQty / (ADV_SHARES * 0.012), 0.28, 1);
    const book = buildBook(mid, path.halfSpreadBps[t], path.levelDepth[t], depletion, rng);
    const imb = bookImbalance(book);

    // —— 3. 逐笔 ——
    const naturalVolume = path.volume[t];
    const tape: TapeRow[] = makeTape(
      t,
      mid,
      naturalVolume,
      path.flowBias[t],
      path.halfSpreadBps[t],
      rng,
    );

    // —— 4. M1 异动 ——
    const refDepth = path.levelDepth[t] * 12.5;
    const newAnomalies = detector.push({
      tick: t,
      price: mid,
      volume: naturalVolume,
      ret: path.returns[t],
      book,
      symbol: symbol.code,
      refDepth,
    });
    if (newAnomalies.length) anomalies.push(...newAnomalies);

    for (const kind of injected.get(t) ?? []) spawnIncident(t, kind);
    if (t > 8 && rng.chance(0.014)) {
      spawnIncident(t, rng.chance(0.5) ? 'order-reject' : 'stale-quote');
    }
    if (t > 40 && rng.chance(0.005)) spawnIncident(t, 'link-down');

    const linkDown = isActive('link-down', t);
    const staleQuote = isActive('stale-quote', t);
    const liquidityDry = isActive('liquidity-dry', t) || depletion < 0.42;

    // —— 5. M2 判别 ——
    const decision = computeDecision({
      prices: actualPrices,
      volumes: path.volume.slice(0, t + 1),
      returns: path.returns.slice(0, t + 1),
      bookImbalance: imb,
      tickSigma,
      params,
    });
    decision.flipped = decision.action !== prevAction;
    if (decision.flipped) decisionFlips += 1;
    prevAction = decision.action;

    // —— 6. M3 母单 ——
    const forcedSides = forced.get(t) ?? [];
    const parentIdle = parent === null || parent.status === 'done';
    const canOpen =
      parentIdle &&
      (decision.trigger || forcedSides.length > 0) &&
      t - lastEntryTick > ENTRY_COOLDOWN &&
      !linkDown;

    if (canOpen) {
      let side: Side | null = null;
      const forcedSide = forcedSides[0];
      if (forcedSide) side = forcedSide;
      else if (decision.action === 'buy') side = 'buy';
      else if (decision.action === 'sell' && focusQty >= LOT_SIZE) side = 'sell';

      if (side) {
        const budget = (INITIAL_CAPITAL * params.capitalPct) / 100;
        let targetQty = targetQtyFromCapital(
          side === 'sell' ? Math.min(budget, focusQty * mid) : budget,
          mid,
        );
        if (side === 'sell') targetQty = Math.min(targetQty, focusQty);
        targetQty = Math.max(LOT_SIZE, Math.floor(targetQty / LOT_SIZE) * LOT_SIZE);

        const parentId = `PO-${String(t).padStart(3, '0')}`;
        const plan = planChildOrders({
          parentId,
          side,
          targetQty,
          algo: params.algo,
          urgency: params.urgency,
          createdTick: t,
          arrivalPrice: mid,
        });

        parent = {
          id: parentId,
          symbol: symbol.code,
          side,
          targetQty,
          algo: params.algo,
          createdTick: t,
          arrivalPrice: mid,
          children: plan.children,
          filledQty: 0,
          avgPrice: 0,
          status: 'working',
          triggerScore: decision.score,
        };
        lastEntryTick = t;
        parentArrival = mid;
        parentSide = side;
        benchPv = 0;
        benchV = 0;
        benchStartTick = t;
        childArrivalSum = 0;
        childArrivalCount = 0;
        // 执行类指标按「当前母单」重置，避免跨母单混算
        slipNum = 0;
        slipDen = 0;
        midFillNum = 0;
        worstSlippage = -Infinity;
        partialCount = 0;
        cancelCount = 0;
        impact.resetCost();
      }
    }

    // —— 7. M4 激活与撮合 ——
    const fillsThisTick: Fill[] = [];

    if (parent) {
      for (const child of parent.children) {
        if (child.status !== 'pending' || child.scheduledTick > t) continue;

        child.arrivalPrice = mid;
        child.limitPrice = resolveLimitPrice(mid, child.limitOffsetBps, child.side);
        child.scheduledTick = t;

        if (staleQuote) {
          child.status = 'rejected';
          child.rejectReason = '行情过期，拒绝穿价委托';
          rejectCount += 1;
          continue;
        }
        if (linkDown) {
          child.status = 'rejected';
          child.rejectReason = '交易网关不可用';
          rejectCount += 1;
          continue;
        }

        const rate = orderRateOf(parent, t);
        const riskSnapshot = computeRiskState({
          exposure: focusQty * mid,
          capital: INITIAL_CAPITAL,
          drawdownPct: maxDrawdownPct,
          orderRate: rate,
          portfolioVol: 0.026,
          params,
          blocked,
          warned,
          passed,
          breaker,
        });
        const check = preTradeCheck({
          exposure: focusQty * mid,
          notional: child.qty * mid,
          risk: riskSnapshot,
          orderRate: rate,
          side: child.side,
        });

        child.riskVerdict = check.verdict;
        if (check.verdict === 'block') {
          child.status = 'blocked';
          child.rejectReason = check.reason;
          blocked += 1;
          if (!incidents.some((i) => i.kind === 'risk-block' && t - i.tick < 24)) {
            spawnIncident(t, 'risk-block');
          }
          continue;
        }
        if (check.verdict === 'warn') warned += 1;
        else passed += 1;

        child.status = 'active';
        childArrivalSum += mid;
        childArrivalCount += 1;
      }

      for (const child of parent.children) {
        if (child.status !== 'active' && child.status !== 'partial') continue;

        const result = attemptFill(child, {
          mid,
          book,
          naturalVolume,
          liquidity: params.liquidity,
          rng,
          staleQuote: false,
          liquidityDry,
        });

        if (result) {
          const wasPartial = child.status === 'partial';
          child.filled += result.qty;
          child.avgFillPrice =
            child.avgFillPrice > 0
              ? (child.avgFillPrice * (child.filled - result.qty) + result.price * result.qty) /
                child.filled
              : result.price;
          child.slippageBps = slippageBps(child.side, child.avgFillPrice, child.arrivalPrice);

          const fillImpact = impact.registerFill(result.qty, mid);
          // 执行成本必须相对「成交时的中间价」，而不是到达价，
          // 否则会把市场漂移误记为执行能力
          const slip = slippageBps(child.side, result.price, mid);

          const fill: Fill = {
            id: `F-${fills.length + 1}`,
            tick: t,
            childId: child.id,
            parentId: child.parentId,
            price: result.price,
            qty: result.qty,
            side: child.side,
            midAtFill: mid,
            slippageBps: slip,
            impactBps: Number(fillImpact.toFixed(2)),
            venue: child.venue,
          };
          fills.push(fill);
          fillsThisTick.push(fill);

          slipNum += slip * result.qty;
          slipDen += result.qty;
          midFillNum += mid * result.qty;
          worstSlippage = Math.max(worstSlippage, slip);

          if (child.side === 'buy') {
            const newQty = focusQty + result.qty;
            focusAvgCost =
              newQty > 0 ? (focusAvgCost * focusQty + result.price * result.qty) / newQty : 0;
            focusQty = newQty;
            cash -= result.price * result.qty * (1 + COMMISSION);
          } else {
            const sellQty = Math.min(result.qty, focusQty);
            focusQty -= sellQty;
            cash += result.price * sellQty * (1 - COMMISSION - STAMP_TAX);
          }

          if (child.filled >= child.qty) child.status = 'filled';
          else {
            child.status = 'partial';
            if (!wasPartial) partialCount += 1;
          }
        }

        if (t > child.expireTick && (child.status === 'active' || child.status === 'partial')) {
          if (child.qty - child.filled > 0) {
            child.status = 'cancelled';
            cancelCount += 1;
          }
        }
      }

      parent.filledQty = parent.children.reduce((a, c) => a + c.filled, 0);
      const notionalSum = parent.children.reduce((a, c) => a + c.filled * c.avgFillPrice, 0);
      parent.avgPrice = parent.filledQty > 0 ? notionalSum / parent.filledQty : 0;
      const allDone = parent.children.every((c) => c.status !== 'pending' && c.status !== 'active' && c.status !== 'partial');
      if (allDone) parent.status = 'done';
    }

    // —— 8. 基准 VWAP & 权益 ——
    if (benchStartTick >= 0) {
      benchPv += mid * naturalVolume;
      benchV += naturalVolume;
    }

    const positions = buildPositions({
      tick: t,
      focusCode: symbol.code,
      focusQty,
      focusAvgCost,
      focusLast: mid,
      holdings: INITIAL_HOLDINGS,
    });
    const exposure = buildExposure(positions);
    const mv = positions.reduce((a, p) => a + p.marketValue, 0);
    const equity = cash + mv;
    equityHistory.push(equity);

    peakEquity = Math.max(peakEquity, equity);
    const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, dd);

    if (dd >= DRAWDOWN_LIMIT && breaker === 'closed') {
      breaker = 'open';
      breakerOpenAt = t;
    } else if (breaker === 'open' && t - breakerOpenAt > 40 && dd < 3.2) {
      breaker = 'half-open';
    } else if (breaker === 'half-open' && dd < 1.8) {
      breaker = 'closed';
    }

    const rate = orderRateOf(parent, t);
    const risk = computeRiskState({
      exposure: focusQty * mid,
      capital: INITIAL_CAPITAL,
      drawdownPct: dd,
      orderRate: rate,
      portfolioVol: portfolioVol(positions, INITIAL_HOLDINGS.map((h) => h.meta)),
      params,
      blocked,
      warned,
      passed,
      breaker,
    });
    risk.breaker = breaker;

    // —— 9. M6 复盘 ——
    const fillRatio = parent && parent.targetQty > 0 ? Math.min(1, parent.filledQty / parent.targetQty) : 0;
    const avgChildArrival = childArrivalCount > 0 ? childArrivalSum / childArrivalCount : mid;
    const avgMidAtFill = slipDen > 0 ? midFillNum / slipDen : mid;
    const slippage = parent
      ? computeSlippage({
          decisionPrice: parentArrival,
          avgChildArrival,
          avgMidAtFill,
          ourAvgPrice: parent.avgPrice || mid,
          impactBps: impact.totalBps(),
          currentPrice: mid,
          fillRatio,
          side: parentSide,
        })
      : { delay: 0, marketDrift: 0, execution: 0, opportunity: 0, impact: 0, total: 0 };

    const review = computeReview({
      equity,
      capital: INITIAL_CAPITAL,
      equityHistory: equityHistory.slice(-80),
      maxDrawdownPct,
      positions,
      arrivalPrice: parent ? parentArrival : mid,
      vwapBenchmark: benchV > 0 ? benchPv / benchV : mid,
      ourAvgPrice: parent ? parent.avgPrice : 0,
      slippage,
      side: parentSide,
    });

    const activeIncidents = incidents.filter((i) => t >= i.tick && t < i.tick + i.duration);

    const execStats = {
      ...EMPTY_EXEC_STATS,
      fillRate: parent ? fillRatio : 0,
      avgSlippageBps: slipDen > 0 ? slipNum / slipDen : 0,
      worstSlippageBps: Number.isFinite(worstSlippage) ? worstSlippage : 0,
      partialCount,
      cancelCount,
      rejectCount,
      blockedCount: blocked,
      avgPrice: parent ? parent.avgPrice : 0,
      filledQty: parent ? parent.filledQty : 0,
    };

    const activePhase = inferActivePhase({
      tick: t,
      fills: fillsThisTick.length,
      parent,
      anomalies: newAnomalies.length,
      decision,
      impactBps: impact.totalBps(),
      incidents: activeIncidents.length,
      breaker,
    });

    const tapeWithOurs: TapeRow[] = [
      ...tape,
      ...fillsThisTick.map((f) => ({
        tick: t,
        price: f.price,
        qty: f.qty,
        side: f.side,
        ours: true,
      })),
    ].slice(-8);

    snaps.push({
      tick: t,
      clock: tickToClock(t),
      price: mid,
      prevClose,
      changePct: ((mid - prevClose) / prevClose) * 100,
      bars: buildBars(actualPrices, path.volume, t, 6, 64),
      book,
      tape: tapeWithOurs,
      quotes: buildQuotes(t, mid, prevClose),
      anomaliesNow: newAnomalies,
      anomalyCount: anomalies.length,
      decision,
      // 母单每 tick 都在原地变化（子单状态、成交量），快照必须存副本：
      // 否则拖时间轴回到过去时，看到的是这单最终的样子
      parent: parent
        ? { ...parent, children: parent.children.map((c) => ({ ...c })) }
        : null,
      fillCount: fills.length,
      execution: execStats,
      impact: {
        permanentBps: Number(impact.permanentBps.toFixed(2)),
        temporaryBps: Number(impact.temporaryBps.toFixed(2)),
        totalBps: Number(impact.totalBps().toFixed(2)),
        depthConsumed: impact.cumulativeQty,
        counterfactualPrice: path.baseline[t],
        costYuan: Number(impact.costYuan.toFixed(0)),
        avgCostBps: Number(impact.avgCostBps().toFixed(2)),
        marginalPermanentBps: Number(impact.marginalPermanentBps().toFixed(2)),
        oneShotCostBps: Number(impact.oneShotCostBps(parent?.targetQty ?? 0).toFixed(2)),
        curve: [...impact.curve],
      },
      positions,
      exposure,
      risk,
      incidents: [...incidents],
      activeIncidents,
      review,
      metrics: {
        tickCount: t + 1,
        anomalyCount: anomalies.length,
        decisionFlips,
        totalChildOrders: parent ? parent.children.length : 0,
        totalFills: fills.length,
        filledQty: parent ? parent.filledQty : 0,
        incidentCount: incidents.length,
        activePhase,
      },
      regime: inferRegime(actualPrices, t, tickSigma),
    });
  }

  // 收尾：标记已恢复的异常
  for (const inc of incidents) {
    if (inc.resolvedAt === null && inc.tick + inc.duration <= totalTicks) {
      inc.resolvedAt = inc.tick + inc.duration;
    }
  }

  const last = snaps[snaps.length - 1];
  const totalPnl = last.review.pnl;
  const impactCost = snaps.reduce((a, s) => a + s.impact.costYuan, 0);

  return {
    seed: params.seed,
    symbol,
    totalTicks,
    prevClose,
    snaps,
    fills,
    anomalies,
    incidents,
    baselinePrices: path.baseline,
    equityCurve: equityHistory,
    summary: {
      totalPnl: Number(totalPnl.toFixed(2)),
      totalSlippageBps: Number((last.execution.avgSlippageBps ?? 0).toFixed(2)),
      impactCostYuan: Number(impactCost.toFixed(0)),
      fillRate: Number((last.execution.fillRate * 100).toFixed(1)),
      durationTicks: totalTicks,
    },
  };
}
