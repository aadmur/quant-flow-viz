export type LessonId = 'impact' | 'quant' | 'volume';

export interface LessonParams {
  orderSize: number;
  depth: number;
  split: boolean;
  reaction: number;
  frequency: number;
  strategy: 'trend' | 'revert';
  priceChange: number;
  volumeRatio: number;
}

export interface MarketPoint {
  i: number;
  baseline: number;
  primary: number;
  secondary?: number;
  volume: number;
  trade?: boolean;
}

export const DEFAULT_LESSON_PARAMS: LessonParams = {
  orderSize: 14,
  depth: 58,
  split: false,
  reaction: 120,
  frequency: 18,
  strategy: 'trend',
  priceChange: 3.2,
  volumeRatio: 2.1,
};

export const LESSONS: Array<{
  id: LessonId;
  no: string;
  title: string;
  en: string;
  subtitle: string;
  question: string;
}> = [
  {
    id: 'impact',
    no: '01',
    title: '大单冲击',
    en: 'ORDER IMPACT',
    subtitle: '一笔大单，为什么会把价格推开？',
    question: '同样一笔买单，在薄盘口和厚盘口里，会有什么不同？',
  },
  {
    id: 'quant',
    no: '02',
    title: '量化足迹',
    en: 'ALGORITHMIC FOOTPRINT',
    subtitle: '机器交易，在走势上留下了什么？',
    question: '更快、更频繁，不等于更激进：观察订单如何被拆进时间里。',
  },
  {
    id: 'volume',
    no: '03',
    title: '量价关系',
    en: 'PRICE × VOLUME',
    subtitle: '价格说方向，成交量说信心。',
    question: '同样的上涨，放量与缩量为什么值得完全不同地理解？',
  },
];

const N = 96;
const EVENT = 30;

/** 量价课的成交量纵轴上限：必须是固定量纲。
 *  若按当期最大值自适应，拖「成交量倍率」柱高几乎不变——而"缩量 vs 放量"正是这一课的全部意义。
 *  取值 = 28 × 倍率上限3 × 脉冲峰1.18 × 趋势加成1.15 ≈ 114。 */
export const VOLUME_AXIS_MAX = 114;

/** 常态成交量（倍率 = 1.0 时的基准），图上画一条虚线给它，缩量才有参照 */
export const VOLUME_NORMAL = 28;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

function quietPrice(i: number) {
  return 100 + Math.sin(i * 0.19) * 0.075 + Math.sin(i * 0.051) * 0.11;
}

/** 同一组输入始终生成同一组点，教学图不依赖外部行情或随机数。 */
export function buildMarketSeries(id: LessonId, p: LessonParams): MarketPoint[] {
  if (id === 'impact') return buildImpact(p);
  if (id === 'quant') return buildQuant(p);
  return buildVolume(p);
}

function buildImpact(p: LessonParams): MarketPoint[] {
  const impactPct = (p.orderSize / p.depth) * 1.6;
  const duration = 20;
  return Array.from({ length: N }, (_, i) => {
    const baseline = quietPrice(i);
    const age = i - EVENT;
    let lift = 0;
    let volume = 24 + Math.sin(i * 0.41) * 4 + Math.sin(i * 0.13) * 3;
    if (age >= 0) {
      if (p.split) {
        const active = smooth(age / duration);
        const settled = age <= duration ? 0 : 1 - Math.exp(-(age - duration) / 22);
        lift = impactPct * (0.2 * active + 0.44 * settled);
        if (age <= duration) {
          volume += (p.orderSize * 4.2 * Math.sin((Math.PI * age) / duration)) / 2;
        }
      } else {
        lift = impactPct * (0.26 + 0.74 * Math.exp(-age / 15));
        volume += p.orderSize * 8.5 * Math.exp(-(age * age) / 5);
      }
    }
    return { i, baseline, primary: baseline * (1 + lift / 100), volume };
  });
}

function buildQuant(p: LessonParams): MarketPoint[] {
  const delay = Math.max(1, Math.round(p.reaction / 38));
  const manualDelay = 19;
  const spacing = Math.max(1, Math.round(34 / p.frequency));
  const direction = p.strategy === 'trend' ? 1 : -1;
  const target = direction * 2.15;
  return Array.from({ length: N }, (_, i) => {
    const baseline = quietPrice(i);
    const age = i - EVENT;
    const qProgress = age < delay ? 0 : smooth((age - delay) / 36);
    // 机器：多次小步；人工：晚一些、三次大步。目标相同，路径不同。
    const qSteps = age < delay ? 0 : Math.min(1, Math.floor((age - delay) / spacing) / 12);
    const steppedQ = Math.max(qProgress * 0.55, Math.min(1, qSteps));
    const manualSteps = age < manualDelay ? 0 : Math.min(1, Math.floor((age - manualDelay) / 8) / 3);
    const primary = baseline * (1 + (target * steppedQ) / 100);
    const secondary = baseline * (1 + (target * manualSteps) / 100);
    const trade = age >= delay && (age - delay) % spacing === 0 && age - delay <= spacing * 12;
    const volume = 20 + (trade ? 14 + p.frequency * 0.7 : 0) + (age >= manualDelay && (age - manualDelay) % 8 === 0 ? 34 : 0);
    return { i, baseline, primary, secondary, volume, trade };
  });
}

function buildVolume(p: LessonParams): MarketPoint[] {
  return Array.from({ length: N }, (_, i) => {
    const progress = smooth((i - 8) / 76);
    const baseline = quietPrice(i);
    const wave = Math.sin(i * 0.23) * 0.08 * (1 - Math.abs(p.priceChange) / 14);
    const primary = 100 + (p.priceChange * progress) + wave + Math.sin(i * 0.051) * 0.08;
    const pulse = 1 + 0.12 * Math.sin(i * 0.33) + 0.06 * Math.sin(i * 0.79);
    const volume = Math.max(3, 28 * p.volumeRatio * pulse * (0.75 + progress * 0.4));
    return { i, baseline, primary, volume };
  });
}

export function impactPeak(p: LessonParams) {
  const data = buildImpact(p);
  return Math.max(...data.map((d) => ((d.primary - d.baseline) / d.baseline) * 100));
}

export function firstTradeIndex(p: LessonParams) {
  return buildQuant(p).find((d) => d.trade)?.i ?? -1;
}

export function volumeRegime(priceChange: number, volumeRatio: number) {
  const up = priceChange >= 0.35;
  const down = priceChange <= -0.35;
  const expanded = volumeRatio >= 1.35;
  const contracted = volumeRatio <= 0.8;
  if (up && expanded) return { title: '放量上涨', tag: '趋势获得确认', text: '价格向上，同时有更多成交愿意在高位接手。买盘不仅推高了报价，也带来了真实换手。' };
  if (up && contracted) return { title: '缩量上涨', tag: '上涨仍需验证', text: '价格在涨，但参与的人没有同步增多。可能是惜售，也可能是跟进不足，不能仅凭红线下结论。' };
  if (down && expanded) return { title: '放量下跌', tag: '抛压集中释放', text: '更多筹码选择离场，价格下跌伴随高换手。它既可能延续风险，也可能接近短期出清，需要结合位置判断。' };
  if (down && contracted) return { title: '缩量下跌', tag: '承接意愿不足', text: '成交不活跃，买方不愿主动接盘。并非“卖盘很小所以安全”，而是市场仍在等待新的价格平衡。' };
  return { title: up || down ? '温和量价' : '横向整理', tag: '等待方向选择', text: '价格与成交量都没有出现极端组合。观察下一次放量发生在哪个方向，比预测拐点更重要。' };
}

export function lessonMetrics(id: LessonId, p: LessonParams) {
  if (id === 'impact') {
    const oneShot = impactPeak({ ...p, split: false });
    const split = impactPeak({ ...p, split: true });
    return [
      { label: '峰值冲击', value: `+${impactPeak(p).toFixed(2)}%`, note: '相对无大单路径' },
      { label: '拆单削峰', value: `${Math.max(0, (1 - split / oneShot) * 100).toFixed(0)}%`, note: '同规模、同盘口' },
      { label: '盘口深度', value: `${p.depth}`, note: p.depth < 40 ? '薄，价格更敏感' : '厚，承接更充分' },
    ];
  }
  if (id === 'quant') {
    const data = buildQuant(p);
    return [
      { label: '首次响应', value: `${p.reaction}ms`, note: `第 ${firstTradeIndex(p) - EVENT} 个事件后 tick` },
      { label: '机器下单', value: `${data.filter((d) => d.trade).length} 笔`, note: `人工对照 3 笔` },
      { label: '执行风格', value: p.strategy === 'trend' ? '顺势' : '回归', note: '小步、连续、可复现' },
    ];
  }
  const regime = volumeRegime(p.priceChange, p.volumeRatio);
  return [
    { label: '区间涨跌', value: `${p.priceChange >= 0 ? '+' : ''}${p.priceChange.toFixed(1)}%`, note: '价格方向' },
    { label: '量能倍率', value: `${p.volumeRatio.toFixed(1)}×`, note: '相对常态成交' },
    { label: '当前组合', value: regime.title, note: regime.tag },
  ];
}
