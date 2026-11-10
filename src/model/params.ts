import type { AlgoKind, FactorKey, SymbolMeta } from '../core/types';

/** 沙盘唯一标的：异动最容易被观察到的中等流动性标的 */
export const FOCUS_SYMBOL: SymbolMeta = {
  code: '300750',
  name: '宁德时代',
  sector: '电力设备',
  basePrice: 188.4,
  vol: 0.028,
};

/** 观察列表（M1 用来展示「多个标的里挑一个」的筛选过程） */
export const WATCHLIST: SymbolMeta[] = [
  FOCUS_SYMBOL,
  { code: '600519', name: '贵州茅台', sector: '食品饮料', basePrice: 1642.0, vol: 0.016 },
  { code: '601318', name: '中国平安', sector: '非银金融', basePrice: 52.36, vol: 0.014 },
  { code: '002594', name: '比亚迪', sector: '汽车', basePrice: 246.8, vol: 0.025 },
  { code: '688981', name: '中芯国际', sector: '电子', basePrice: 84.15, vol: 0.033 },
  { code: '000858', name: '五粮液', sector: '食品饮料', basePrice: 138.2, vol: 0.018 },
];

export const INITIAL_CAPITAL = 5_000_000;
/**
 * 标的日均成交量（股）。冲击模型的基准分母，也是「自然成交量」的量纲来源。
 * 取中等流动性水平，使得本策略的单笔母单约占 ADV 0.2%~1%，
 * 冲击量级落在 10~30bp —— 肉眼可见但仍在合理范围。
 */
export const ADV_SHARES = 3_000_000;
/** 会话内成交量占 ADV 的比例（54 分钟 / 240 分钟交易日） */
export const SESSION_VOLUME_SHARE = 0.225;
/** 一个 tick 对应的真实秒数 */
export const TICK_SECONDS = 6;
/**
 * 波动率时间换算分母。
 *
 * 日波动 σ 换算到单 tick：σ_tick = σ_daily / sqrt(DIVISOR)。
 * 若按「2400 tick/交易日」严格取 2400，55 分钟会话只有 1.3% 的波动，
 * 图表会显得过于平淡；取 1200（相当于把会话压缩进半天）让波动落在
 * 1.8%~2% 的可读区间，同时保持冲击/滑点仍小于信号强度。
 */
export const TICK_SIGMA_DIVISOR = 1200;
/** 一次会话的总 tick 数（≈ 54 分钟行情） */
export const TOTAL_TICKS = 540;

export interface Params {
  seed: number;
  /** M2：开仓阈值 */
  entryThreshold: number;
  /** M2：五因子权重 */
  weights: Record<FactorKey, number>;
  /** M3：投入资金占比 % */
  capitalPct: number;
  /** M3：拆单算法 */
  algo: AlgoKind;
  /** M3：紧急度，越高拆得越密 */
  urgency: number;
  /** M5：冲击系数 */
  impactCoeff: number;
  /** 市场波动倍数 */
  marketVol: number;
  /** 盘口深度系数，越低越容易滑点 */
  liquidity: number;
  /** E1：敞口上限 % */
  exposureLimitPct: number;
}

export const DEFAULT_PARAMS: Params = {
  seed: 20261110,
  entryThreshold: 0.42,
  weights: {
    momentum: 0.72,
    volume: 0.58,
    imbalance: 0.46,
    volatility: 0.3,
    trend: 0.64,
  },
  capitalPct: 32,
  algo: 'twap',
  urgency: 0.55,
  impactCoeff: 1,
  marketVol: 1,
  liquidity: 1,
  exposureLimitPct: 28,
};

export type ParamKey =
  | 'entryThreshold'
  | 'capitalPct'
  | 'urgency'
  | 'impactCoeff'
  | 'marketVol'
  | 'liquidity'
  | 'exposureLimitPct';

export interface ParamSpec {
  key: ParamKey;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint: string;
  /** 哪个阶段受影响——滑块旁会显示阶段色点 */
  phase: 'm2' | 'm3' | 'm4' | 'm5' | 'e1';
  format: (v: number) => string;
}

export const PARAM_SPECS: ParamSpec[] = [
  {
    key: 'entryThreshold',
    label: '开仓阈值',
    min: 0.15,
    max: 0.8,
    step: 0.01,
    unit: '',
    hint: '综合分超过该值才开仓；调高→交易变少但更挑',
    phase: 'm2',
    format: (v) => v.toFixed(2),
  },
  {
    key: 'capitalPct',
    label: '投入资金',
    min: 4,
    max: 60,
    step: 1,
    unit: '%',
    hint: '单次建仓占初始资金比例，直接决定冲击大小',
    phase: 'm3',
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    key: 'urgency',
    label: '执行紧急度',
    min: 0.15,
    max: 1,
    step: 0.01,
    unit: '',
    hint: '越高拆单间隔越短、单笔越大，滑点更高',
    phase: 'm3',
    format: (v) => v.toFixed(2),
  },
  {
    key: 'impactCoeff',
    label: '冲击系数 κ',
    min: 0.3,
    max: 2.2,
    step: 0.05,
    unit: '',
    hint: '平方根冲击模型的斜率，越大价格被推得越狠',
    phase: 'm5',
    format: (v) => `κ ${v.toFixed(2)}`,
  },
  {
    key: 'marketVol',
    label: '市场波动',
    min: 0.3,
    max: 2.2,
    step: 0.05,
    unit: '×',
    hint: '放大/压缩标的波动率，影响信号噪声与滑点',
    phase: 'm5',
    format: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: 'liquidity',
    label: '盘口流动性',
    min: 0.35,
    max: 1.6,
    step: 0.05,
    unit: '×',
    hint: '盘口挂单厚度系数，越小越难成交',
    phase: 'm4',
    format: (v) => `${v.toFixed(2)}×`,
  },
  {
    key: 'exposureLimitPct',
    label: '敞口上限',
    min: 12,
    max: 80,
    step: 1,
    unit: '%',
    hint: 'E1 风控闸门；触及后子单被拦截',
    phase: 'e1',
    format: (v) => `${v.toFixed(0)}%`,
  },
];

export const FACTOR_LABELS: Record<FactorKey, string> = {
  momentum: '动量',
  volume: '量能',
  imbalance: '盘口失衡',
  volatility: '波动率',
  trend: '趋势强度',
};

export const FACTOR_ORDER: FactorKey[] = [
  'momentum',
  'volume',
  'imbalance',
  'volatility',
  'trend',
];

export const ALGO_LABELS: Record<AlgoKind, string> = {
  twap: 'TWAP 时间加权',
  vwap: 'VWAP 成交量加权',
  iceberg: 'Iceberg 冰山',
  sniper: 'Sniper 狙击',
};

export const ALGO_HINTS: Record<AlgoKind, string> = {
  twap: '等间隔等量拆单，节奏稳定，冲击可预测',
  vwap: '按历史成交量曲线分配，收盘前加速',
  iceberg: '只暴露小额，成交后补单，隐蔽性强',
  sniper: '穿价主动吃单，成交快但滑点最高',
};

/** 极简标签，用于按钮等空间紧张处 */
export const ALGO_SHORT: Record<AlgoKind, string> = {
  twap: '等间隔',
  vwap: '量价加权',
  iceberg: '隐蔽补单',
  sniper: '穿价主动',
};

export interface Preset {
  id: string;
  name: string;
  desc: string;
  patch: Partial<Params>;
}

export const PRESETS: Preset[] = [
  {
    id: 'balanced',
    name: '均衡',
    desc: '默认参数，冲击与成交率折中',
    patch: { ...DEFAULT_PARAMS },
  },
  {
    id: 'passive',
    name: '保守',
    desc: '低仓位、慢节奏、高阈值',
    patch: {
      entryThreshold: 0.62,
      capitalPct: 12,
      urgency: 0.3,
      impactCoeff: 1,
      exposureLimitPct: 25,
      algo: 'iceberg',
    },
  },
  {
    id: 'aggressive',
    name: '激进',
    desc: '大仓位、高紧急度，冲击显著',
    patch: {
      entryThreshold: 0.28,
      capitalPct: 55,
      urgency: 0.9,
      impactCoeff: 1.4,
      exposureLimitPct: 45,
      algo: 'sniper',
    },
  },
  {
    id: 'stress',
    name: '压力测试',
    desc: '高波动 + 低流动性，考验风控与异常处理',
    patch: {
      entryThreshold: 0.3,
      capitalPct: 48,
      urgency: 0.85,
      impactCoeff: 1.9,
      marketVol: 1.9,
      liquidity: 0.45,
      exposureLimitPct: 35,
      algo: 'twap',
    },
  },
];
