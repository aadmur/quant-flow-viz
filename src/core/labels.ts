import type { Action, AnomalyKind, ChildStatus, IncidentKind } from './types';

/** UI 用到的中文标签集中在这里，避免各组件各写一套说法 */

export const INCIDENT_LABELS: Record<IncidentKind, string> = {
  'link-down': '网关断线',
  'order-reject': '交易所拒单',
  'risk-block': '风控拦截',
  'liquidity-dry': '流动性枯竭',
  'stale-quote': '行情过期',
};

export const INJECTABLE: IncidentKind[] = ['link-down', 'order-reject', 'risk-block', 'liquidity-dry', 'stale-quote'];

export const CHILD_LABELS: Record<ChildStatus, string> = {
  pending: '待发',
  active: '在途',
  partial: '部成',
  filled: '已成',
  cancelled: '已撤',
  rejected: '拒单',
  blocked: '被拦',
};

export const ACTION_LABELS: Record<Action, string> = {
  buy: '开多',
  sell: '平多',
  hold: '观望',
};

export const ANOMALY_LABELS: Record<AnomalyKind, string> = {
  breakout: '价格突破',
  'volume-surge': '放量',
  'vol-spike': '波动突变',
  imbalance: '盘口失衡',
  'liquidity-drop': '流动性骤降',
};

export const BREAKER_LABELS: Record<'closed' | 'half-open' | 'open', string> = {
  closed: '正常',
  'half-open': '半开',
  open: '熔断',
};
