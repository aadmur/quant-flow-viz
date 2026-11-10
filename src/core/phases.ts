import type { PhaseId } from './types';

export interface PhaseMeta {
  id: PhaseId;
  code: string;
  title: string;
  subtitle: string;
  /** 该阶段回答的业务问题——用于详情抽屉的引导文案 */
  question: string;
  /** 主色（hex，供 SVG / 内联样式使用） */
  accent: string;
  group: 'core' | 'ext';
}

/**
 * 阶段顺序即业务因果顺序：行情 → 判别 → 下单 → 执行 → 冲击 → 复盘。
 * 扩展阶段（风控/组合/异常）不作为链路节点，而是横切关注点。
 */
export const PHASES: PhaseMeta[] = [
  {
    id: 'm1',
    code: 'M1',
    title: '行情监控',
    subtitle: 'Market Surveillance',
    question: '市场此刻在发生什么？哪些异动值得交易？',
    accent: '#2563eb',
    group: 'core',
  },
  {
    id: 'm2',
    code: 'M2',
    title: '模型判别',
    subtitle: 'Model Decision',
    question: '多因子怎么看？置信度是否越过开仓阈值？',
    accent: '#7c3aed',
    group: 'core',
  },
  {
    id: 'm3',
    code: 'M3',
    title: '程序化下单',
    subtitle: 'Order Generation',
    question: '用什么算法把母单拆成子单？节奏如何控制？',
    accent: '#0891b2',
    group: 'core',
  },
  {
    id: 'm4',
    code: 'M4',
    title: '订单执行',
    subtitle: 'Execution',
    question: '子单怎么成交的？滑点从哪来？',
    accent: '#0d9488',
    group: 'core',
  },
  {
    id: 'm5',
    code: 'M5',
    title: '市场冲击',
    subtitle: 'Market Impact',
    question: '我们的成交把价格推走了多少？能不能回来？',
    accent: '#d97706',
    group: 'core',
  },
  {
    id: 'm6',
    code: 'M6',
    title: '策略复盘',
    subtitle: 'Post-trade Review',
    question: '赚的还是亏的？成本能拆成哪几块？',
    accent: '#db2777',
    group: 'core',
  },
  {
    id: 'e1',
    code: 'E1',
    title: '风险控制',
    subtitle: 'Risk Control',
    question: '敞口、VaR、熔断是否在闸门之内？',
    accent: '#dc2626',
    group: 'ext',
  },
  {
    id: 'e2',
    code: 'E2',
    title: '组合管理',
    subtitle: 'Portfolio',
    question: '持仓结构如何？行业暴露是否集中？',
    accent: '#059669',
    group: 'ext',
  },
  {
    id: 'e3',
    code: 'E3',
    title: '异常处理',
    subtitle: 'Incident Handling',
    question: '断线、拒单、流动性枯竭时系统怎么降级？',
    accent: '#b45309',
    group: 'ext',
  },
];

export const PHASE_MAP: Record<PhaseId, PhaseMeta> = PHASES.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<PhaseId, PhaseMeta>,
);

export const CORE_PHASES = PHASES.filter((p) => p.group === 'core');
export const EXT_PHASES = PHASES.filter((p) => p.group === 'ext');
