import type { ReactNode } from 'react';
import type { PhaseId } from '../../core/types';
import { PHASE_MAP } from '../../core/phases';

export interface CardProps {
  phase: PhaseId;
  title?: string;
  /** 右上角自定义内容 */
  right?: ReactNode;
  /** 12 栅格跨度 */
  span?: number;
  /** 当前 tick 该阶段是否被点亮 */
  active?: boolean;
  /** 本 tick 是否有事件触发 → 播放一次脉冲描边 */
  pulsing?: boolean;
  footer?: ReactNode;
  onOpen?: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * 阶段卡片：统一的阶段色 / 标题 / 下钻入口。
 * 「下钻」不做成嵌套菜单——点标题区即开详情抽屉，避免交互层级过深。
 */
export function Card({
  phase,
  title,
  right,
  span = 4,
  active = false,
  pulsing = false,
  footer,
  onOpen,
  children,
  className = '',
}: CardProps) {
  const meta = PHASE_MAP[phase];

  return (
    <section
      className={`card tone-${phase} span-${span} ${active ? 'is-active' : ''} ${
        pulsing ? 'is-pulsing' : ''
      } ${className}`}
      aria-label={title ?? meta.title}
    >
      <header className="card-head">
        <span className="card-code">{meta.code}</span>
        <div style={{ minWidth: 0 }}>
          <div className="card-title">{title ?? meta.title}</div>
          <div className="card-sub">{meta.subtitle}</div>
        </div>
        <div className="spacer" />
        {right}
        {onOpen && (
          <button className="card-action" onClick={onOpen} aria-label={`查看${meta.title}详情`}>
            详情 →
          </button>
        )}
      </header>
      <div className="card-body">{children}</div>
      {footer && <div className="card-foot">{footer}</div>}
    </section>
  );
}
