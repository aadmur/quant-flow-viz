import type { ReactNode } from 'react';

/**
 * 仪器风格图表原子。全部是手写 SVG，不引图表库：
 * 这些图的信息密度很低（一条线、几根柱），引库反而拿不到想要的刻度与描边质感。
 */

export function Spark({
  values,
  color = '#38e1ff',
  height = 64,
  fill = true,
  baseline,
  format,
}: {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  /** 参考线（如基准价、阈值），画一条虚线 */
  baseline?: number;
  format?: (v: number) => string;
}) {
  const W = 300;
  const H = height;
  if (values.length < 2) {
    return <div className="chart-empty" style={{ height }}>样本不足</div>;
  }
  const min = Math.min(...values, baseline ?? Infinity);
  const max = Math.max(...values, baseline ?? -Infinity);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${d} L${W} ${H} L0 ${H} Z`;
  const last = values[values.length - 1];

  return (
    <div className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" height={height} width="100%">
        <defs>
          <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {baseline !== undefined && (
          <line x1={0} x2={W} y1={y(baseline)} y2={y(baseline)} stroke="rgba(255,93,110,0.5)" strokeDasharray="3 3" strokeWidth={1} />
        )}
        {fill && <path d={area} fill={`url(#sg-${color.replace('#', '')})`} />}
        <path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <circle cx={x(values.length - 1)} cy={y(last)} r={2.6} fill={color} />
      </svg>
      {format && (
        <div className="spark-scale">
          <span>{format(max)}</span>
          <span>{format(min)}</span>
        </div>
      )}
    </div>
  );
}

export function Bars({
  values,
  color = 'rgba(160,190,220,0.55)',
  height = 56,
  hot,
}: {
  values: number[];
  color?: string;
  height?: number;
  /** 高亮最后一根 */
  hot?: string;
}) {
  const W = 300;
  const max = Math.max(...values, 0.0001);
  const bw = W / Math.max(1, values.length);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} className="bars">
      {values.map((v, i) => {
        const h = Math.max(1, (v / max) * (height - 6));
        const isLast = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * bw + bw * 0.18}
            y={height - h}
            width={bw * 0.64}
            height={h}
            fill={isLast && hot ? hot : color}
          />
        );
      })}
    </svg>
  );
}

export function Metric({
  label,
  value,
  unit,
  tone,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'up' | 'down' | 'warn' | 'risk' | 'mute';
  hint?: string;
}) {
  return (
    <div className={`metric ${tone ? `t-${tone}` : ''}`} title={hint}>
      <span className="metric-label">{label}</span>
      <span className="metric-value tabnum">
        {value}
        {unit && <em>{unit}</em>}
      </span>
    </div>
  );
}

export function RowBar({
  label,
  value,
  max,
  color,
  right,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  right: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="rowbar">
      <span className="rowbar-label">{label}</span>
      <span className="rowbar-track">
        <span className="rowbar-fill" style={{ width: `${pct}%`, background: color }} />
      </span>
      <span className="rowbar-val tabnum">{right}</span>
    </div>
  );
}

/** 子单甘特：每行一条计划窗口，实体段为已成交 */
export function Gantt({
  rows,
  total,
  color = '#ffb020',
}: {
  rows: { key: string; start: number; end: number; fill: number; ok: boolean }[];
  total: number;
  color?: string;
}) {
  const W = 300;
  const rh = 9;
  const H = Math.max(rh, rows.length * rh);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={Math.min(160, H)} className="gantt">
      {rows.map((r, i) => {
        const x0 = (r.start / total) * W;
        const w = Math.max(1.5, ((r.end - r.start) / total) * W);
        const wf = w * Math.min(1, r.fill);
        return (
          <g key={r.key}>
            <rect x={x0} y={i * rh + 1} width={w} height={rh - 3} fill="rgba(120,150,185,0.18)" />
            <rect x={x0} y={i * rh + 1} width={wf} height={rh - 3} fill={r.ok ? color : '#ff4d63'} />
          </g>
        );
      })}
    </svg>
  );
}

/** 堆叠条：滑点分解、成本构成 */
export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + Math.abs(p.value), 0) || 1;
  return (
    <div className="stackbar">
      <div className="stackbar-track">
        {parts.map((p) => (
          <span
            key={p.label}
            style={{ width: `${(Math.abs(p.value) / total) * 100}%`, background: p.color }}
            title={`${p.label} ${p.value.toFixed(2)}`}
          />
        ))}
      </div>
      <div className="stackbar-legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label}
            <em className="tabnum">{p.value.toFixed(1)}</em>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="sect">
      <header className="sect-head">
        <h4>{title}</h4>
        {extra}
      </header>
      {children}
    </section>
  );
}
