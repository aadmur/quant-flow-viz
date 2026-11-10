import { clamp } from '../core/format';
import type { BreakerState, RiskState, RiskVerdict } from '../core/types';
import type { Params } from './params';

/** 单日 95% 分位 VaR 的 z 值 */
const Z_95 = 1.645;
/** 熔断触发后的冷却 tick 数 */
export const BREAKER_COOLDOWN = 45;
/** 每分钟最大下发子单数 */
export const ORDER_RATE_LIMIT = 24;

export interface RiskComputeInput {
  exposure: number;
  capital: number;
  drawdownPct: number;
  orderRate: number;
  portfolioVol: number;
  params: Params;
  blocked: number;
  warned: number;
  passed: number;
  breaker: BreakerState;
}

/**
 * E1 的状态汇总。
 * 三个闸门并列：仓位敞口、VaR、回撤熔断。任一突破都会让 breaker 状态改变，
 * 而 breaker 一旦 open，下游所有子单都被拦——这就是「风控在链路上游掐断」。
 */
export function computeRiskState(input: RiskComputeInput): RiskState {
  const exposureLimit = (input.capital * input.params.exposureLimitPct) / 100;
  const var95 = Math.abs(input.exposure) * input.portfolioVol * Z_95;
  const varLimit = exposureLimit * 0.16;
  const drawdownLimitPct = 4.5;

  let breaker: BreakerState = input.breaker;
  if (input.drawdownPct >= drawdownLimitPct) breaker = 'open';
  else if (breaker === 'open' && input.drawdownPct < drawdownLimitPct * 0.72) breaker = 'half-open';

  const utilization = clamp(
    Math.max(
      Math.abs(input.exposure) / Math.max(exposureLimit, 1),
      var95 / Math.max(varLimit, 1),
      input.drawdownPct / drawdownLimitPct,
    ),
    0,
    1.6,
  );

  return {
    exposure: input.exposure,
    exposureLimit,
    var95,
    varLimit,
    drawdownPct: input.drawdownPct,
    drawdownLimitPct,
    orderRate: input.orderRate,
    orderRateLimit: ORDER_RATE_LIMIT,
    breaker,
    blocked: input.blocked,
    warned: input.warned,
    passed: input.passed,
    utilization,
  };
}

export interface ChildRiskCheck {
  verdict: RiskVerdict;
  reason?: string;
}

/** 交易前风控：每张子单下发前必须过这道闸 */
export function preTradeCheck(args: {
  exposure: number;
  notional: number;
  risk: RiskState;
  orderRate: number;
  side: 'buy' | 'sell';
}): ChildRiskCheck {
  const { exposure, notional, risk, orderRate, side } = args;

  if (risk.breaker === 'open') {
    return { verdict: 'block', reason: '熔断已触发，全部下单暂停' };
  }
  if (risk.breaker === 'half-open') {
    return { verdict: 'block', reason: '熔断恢复观察期，仅允许平仓' };
  }
  if (orderRate >= risk.orderRateLimit) {
    return { verdict: 'block', reason: `下单速率 ${orderRate}/min 触及上限` };
  }
  // 只有增加敞口的方向需要校验额度；减仓永远放行
  if (side === 'buy') {
    const projected = Math.abs(exposure + notional);
    if (projected > risk.exposureLimit) {
      return {
        verdict: 'block',
        reason: `建仓后敞口 ${(projected / 10000).toFixed(1)}万 超限 ${(risk.exposureLimit / 10000).toFixed(1)}万`,
      };
    }
    if (projected > risk.exposureLimit * 0.85) {
      return { verdict: 'warn', reason: '敞口已达上限 85%，接近闸门' };
    }
  }
  if (risk.var95 > risk.varLimit * 0.9) {
    return { verdict: 'warn', reason: 'VaR 逼近限额' };
  }
  return { verdict: 'pass' };
}

export function breakerLabel(b: BreakerState): string {
  return b === 'closed' ? '正常' : b === 'half-open' ? '恢复观察' : '已熔断';
}
