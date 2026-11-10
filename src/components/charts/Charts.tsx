import { useId } from 'react';
import type { Bar, Fill } from '../../core/types';

const FONT = 'var(--font-mono)';

/* ---------------- 迷你走势 ---------------- */

export function Sparkline({
  values,
  color = 'var(--accent)',
  height = 34,
  fill = true,
  strokeWidth = 1.4,
}: {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, '');
  if (values.length < 2) return <div style={{ height }} />;

  const W = 120;
  const H = height;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 3 - ((v - min) / span) * (H - 6);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#sp-${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- 价格 K 线 + 反事实对比 ---------------- */

export function PriceChart({
  bars,
  baselinePrices,
  fills,
  tick,
  showCounterfactual = true,
  height = 168,
}: {
  bars: Bar[];
  baselinePrices: number[];
  fills: Fill[];
  tick: number;
  showCounterfactual?: boolean;
  height?: number;
}) {
  const W = 520;
  const H = height;
  const padTop = 8;
  const padBottom = 20;
  const volH = 22;
  /**
   * 固定槽位而非按当前 bar 数均分。
   * 否则会话刚开始只有几根 K 线时，每根会被拉成几十像素宽的色块，
   * 看起来像"图表坏了"；固定 64 槽 + 右对齐能保证任何时刻形态一致。
   */
  const SLOTS = 64;

  if (bars.length < 2) return <div style={{ height: H }} />;

  const series: number[] = [];
  for (const b of bars) {
    series.push(b.high, b.low);
    if (showCounterfactual) {
      const cf = baselinePrices[Math.min(b.t, baselinePrices.length - 1)];
      if (cf) series.push(cf);
    }
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const pad = span * 0.08;

  const plotH = H - padTop - padBottom - volH;
  const y = (v: number) => padTop + plotH - ((v - (min - pad)) / (span + pad * 2)) * plotH;
  const bandW = W / SLOTS;
  const bw = Math.max(1.8, bandW * 0.6);
  const offset = SLOTS - bars.length;
  const centerX = (i: number) => (offset + i) * bandW + bandW / 2;
  const maxVol = Math.max(...bars.map((b) => b.volume), 1);

  const cfPath = bars
    .map((b, i) => {
      const cf = baselinePrices[Math.min(b.t, baselinePrices.length - 1)];
      return `${i === 0 ? 'M' : 'L'}${centerX(i).toFixed(2)},${y(cf).toFixed(2)}`;
    })
    .join(' ');

  // 可见区间内的成交标记
  const firstTick = bars[0].t;
  const visibleFills = fills.filter((f) => f.tick >= firstTick);
  const tickToX = (t: number) => {
    const idx = offset + (t - firstTick) / 6;
    return Math.max(0, Math.min(W, idx * bandW + bandW / 2));
  };

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const up = last.close >= prev.close;
  const lastY = y(last.close);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} preserveAspectRatio="none" role="img" aria-label="价格走势">
      {/* 网格 */}
      {[0, 0.25, 0.5, 0.75, 1].map((r) => {
        const gy = padTop + plotH * r;
        return (
          <line key={r} x1={0} x2={W} y1={gy} y2={gy} stroke="var(--grid)" strokeWidth={1} />
        );
      })}

      {/* 成交量 */}
      {bars.map((b, i) => {
        const h = (b.volume / maxVol) * volH;
        return (
          <rect
            key={`v${i}`}
            x={(offset + i) * bandW + (bandW - bw) / 2}
            y={H - padBottom - h}
            width={bw}
            height={h}
            fill={b.close >= b.open ? 'var(--up)' : 'var(--down)'}
            opacity={0.13}
          />
        );
      })}

      {/* 反事实（无我方冲击） */}
      {showCounterfactual && (
        <path
          d={cfPath}
          fill="none"
          stroke="var(--text-3)"
          strokeWidth={1.2}
          strokeDasharray="3 3"
          opacity={0.85}
        />
      )}

      {/* K 线 */}
      {bars.map((b, i) => {
        const cx = centerX(i);
        const isUp = b.close >= b.open;
        const color = isUp ? 'var(--up)' : 'var(--down)';
        const yo = y(b.open);
        const yc = y(b.close);
        return (
          <g key={`c${i}`}>
            <line x1={cx} x2={cx} y1={y(b.high)} y2={y(b.low)} stroke={color} strokeWidth={1} opacity={0.8} />
            <rect
              x={cx - bw / 2}
              y={Math.min(yo, yc)}
              width={bw}
              height={Math.max(1, Math.abs(yc - yo))}
              fill={isUp ? 'var(--up)' : 'var(--down)'}
              opacity={isUp ? 0.85 : 0.85}
              rx={0.8}
            />
          </g>
        );
      })}

      {/* 我方成交标记 */}
      {visibleFills.slice(-40).map((f) => (
        <g key={f.id}>
          <circle
            cx={tickToX(f.tick)}
            cy={y(f.price)}
            r={f.side === 'buy' ? 2.6 : 2.2}
            fill={f.side === 'buy' ? 'var(--accent)' : 'var(--accent)'}
            stroke="#fff"
            strokeWidth={0.8}
            opacity={0.95}
          />
        </g>
      ))}

      {/* 现价线 */}
      <line x1={0} x2={W} y1={lastY} y2={lastY} stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={0.9} strokeDasharray="5 4" opacity={0.55} />
      <rect x={0} y={lastY - 7} width={44} height={14} rx={3} fill={up ? 'var(--up)' : 'var(--down)'} opacity={0.92} />
      <text x={22} y={lastY + 3.4} textAnchor="middle" fontSize={9} fill="#fff" fontFamily={FONT} fontWeight={700}>
        {last.close.toFixed(2)}
      </text>

      {/* 当前 tick 光标 */}
      <line x1={tickToX(tick)} x2={tickToX(tick)} y1={padTop} y2={H - padBottom} stroke="var(--accent)" strokeWidth={1} opacity={0.35} />
    </svg>
  );
}

/* ---------------- 冲击衰减曲线 ---------------- */

export function ImpactCurve({
  curve,
  permanentBps,
  height = 92,
}: {
  curve: number[];
  permanentBps: number;
  height?: number;
}) {
  const W = 240;
  const H = height;
  if (curve.length < 2) return <div style={{ height: H }} />;

  const max = Math.max(...curve, permanentBps, 1) * 1.15;
  const x = (i: number) => (i / Math.max(1, curve.length - 1)) * W;
  const y = (v: number) => H - 4 - (v / max) * (H - 10);

  const line = curve.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H - 4} L0,${H - 4} Z`;
  const permY = y(permanentBps);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} preserveAspectRatio="none" aria-label="冲击衰减曲线">
      <defs>
        <linearGradient id="impact-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--m5)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--m5)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.33, 0.66].map((r) => (
        <line key={r} x1={0} x2={W} y1={4 + (H - 10) * r} y2={4 + (H - 10) * r} stroke="var(--grid)" />
      ))}
      <path d={area} fill="url(#impact-grad)" />
      <path d={line} fill="none" stroke="var(--m5)" strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={0} x2={W} y1={permY} y2={permY} stroke="var(--neg)" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
      <text x={W - 2} y={permY - 3} textAnchor="end" fontSize={8.5} fill="var(--neg)" fontFamily={FONT}>
        永久 {permanentBps.toFixed(1)}bp
      </text>
    </svg>
  );
}

/* ---------------- 权益曲线 ---------------- */

export function EquityCurve({
  values,
  baseline,
  height = 64,
}: {
  values: number[];
  baseline: number;
  height?: number;
}) {
  const W = 200;
  const H = height;
  if (values.length < 2) return <div style={{ height: H }} />;

  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const up = values[values.length - 1] >= baseline;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} preserveAspectRatio="none" aria-label="权益曲线">
      <line x1={0} x2={W} y1={y(baseline)} y2={y(baseline)} stroke="var(--border-strong)" strokeDasharray="3 3" />
      <path d={line} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- 综合分仪表 ---------------- */

export function Gauge({
  value,
  threshold,
  width = 92,
  height = 62,
}: {
  value: number;
  threshold: number;
  width?: number;
  height?: number;
}) {
  const W = width;
  const H = height;
  const cx = W / 2;
  const cy = H - 6;
  const r = W / 2 - 8;
  const toAngle = (v: number) => Math.PI + ((v + 1) / 2) * Math.PI;
  const arc = (from: number, to: number, radius: number) => {
    const a1 = toAngle(from);
    const a2 = toAngle(to);
    const x1 = cx + Math.cos(a1) * radius;
    const y1 = cy + Math.sin(a1) * radius;
    const x2 = cx + Math.cos(a2) * radius;
    const y2 = cy + Math.sin(a2) * radius;
    const large = Math.abs(a2 - a1) > Math.PI ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };

  const clamped = Math.max(-1, Math.min(1, value));
  const needleA = toAngle(clamped);
  const nx = cx + Math.cos(needleA) * (r - 3);
  const ny = cy + Math.sin(needleA) * (r - 3);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-label="综合分仪表">
      <path d={arc(-1, 1, r)} fill="none" stroke="var(--surface-3)" strokeWidth={7} strokeLinecap="round" />
      <path d={arc(-1, -threshold, r)} fill="none" stroke="var(--down)" strokeWidth={7} strokeLinecap="round" opacity={0.75} />
      <path d={arc(threshold, 1, r)} fill="none" stroke="var(--up)" strokeWidth={7} strokeLinecap="round" opacity={0.75} />
      <path d={arc(-threshold, threshold, r)} fill="none" stroke="var(--border)" strokeWidth={7} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text-1)" strokeWidth={2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2.6} fill="var(--text-1)" />
    </svg>
  );
}

/* ---------------- 相关性热力图 ---------------- */

export function Heatmap({
  labels,
  matrix,
}: {
  labels: string[];
  matrix: number[][];
}) {
  const color = (v: number) => {
    // 0 → 冷灰蓝，1 → 品红
    const alpha = 0.08 + v * 0.72;
    const hue = 220 - v * 160;
    return `hsl(${hue} 72% ${88 - v * 34}% / ${alpha})`;
  };

  return (
    <div
      className="heatmap"
      style={{ gridTemplateColumns: `28px repeat(${labels.length}, minmax(0, 1fr))` }}
      role="img"
      aria-label="标的相关性矩阵"
    >
      <div />
      {labels.map((l) => (
        <div key={`h-${l}`} style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 8 }}>
          {l.slice(2)}
        </div>
      ))}
      {matrix.map((row, i) => (
        <div key={`r-${i}`} style={{ display: 'contents' }}>
          <div style={{ color: 'var(--text-3)', fontSize: 8, display: 'grid', placeItems: 'center' }}>
            {labels[i].slice(2)}
          </div>
          {row.map((v, j) => (
            <div
              key={`c-${i}-${j}`}
              className="heat-cell"
              style={{ background: i === j ? 'var(--surface-3)' : color(v) }}
              title={`${labels[i]} × ${labels[j]} = ${v}`}
            >
              {i === j ? '—' : v.toFixed(2).slice(1)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
