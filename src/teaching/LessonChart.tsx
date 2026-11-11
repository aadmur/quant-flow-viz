import { useId, useMemo, useState } from 'react';
import type { LessonId, MarketPoint } from './lessons';

const W = 900;
const H = 430;
const M = { l: 58, r: 24, t: 28, b: 42 };
const PRICE_BOTTOM = 284;
const VOLUME_TOP = 326;
const VOLUME_BOTTOM = 384;
const plotW = W - M.l - M.r;

function pathOf(points: MarketPoint[], key: 'baseline' | 'primary' | 'secondary', x: (i: number) => number, y: (v: number) => number) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${x(p.i).toFixed(2)},${y(p[key] ?? p.primary).toFixed(2)}`).join(' ');
}

export default function LessonChart({ lesson, data, progress, volumeMax, volumeRef }: { lesson: LessonId; data: MarketPoint[]; progress: number; volumeMax?: number; volumeRef?: number }) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const count = Math.max(2, Math.min(data.length, Math.ceil(progress * (data.length - 1)) + 1));
  const visible = data.slice(0, count);
  const current = data[count - 1];
  const x = (i: number) => M.l + (i / (data.length - 1)) * plotW;
  const [min, max] = useMemo(() => {
    const values = data.flatMap((d) => [d.baseline, d.primary, d.secondary ?? d.primary]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max(0.3, (hi - lo) * 0.18);
    return [lo - pad, hi + pad];
  }, [data]);
  const y = (v: number) => M.t + ((max - v) / (max - min)) * (PRICE_BOTTOM - M.t);
  // 有外部量纲就用它（量价课必须固定轴，否则拖倍率柱高不变，这一课就白讲了）
  const maxVolume = volumeMax ?? Math.max(...data.map((d) => d.volume));
  const vy = (v: number) => VOLUME_BOTTOM - (v / maxVolume) * (VOLUME_BOTTOM - VOLUME_TOP);
  const primaryPath = pathOf(visible, 'primary', x, y);
  const areaPath = `${primaryPath} L${x(current.i)},${PRICE_BOTTOM} L${x(visible[0].i)},${PRICE_BOTTOM} Z`;
  const barW = Math.max(2.2, plotW / data.length - 2.2);
  const hoverPoint = hover === null ? null : data[Math.max(0, Math.min(count - 1, hover))];

  const onPointer = (clientX: number, target: SVGSVGElement) => {
    const rect = target.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    setHover(Math.round(((sx - M.l) / plotW) * (data.length - 1)));
  };

  return (
    <div className="lesson-chart-wrap">
      <div className="chart-legend">
        <span><i className="legend-primary" />{lesson === 'quant' ? '量化执行' : lesson === 'impact' ? '有大单的价格路径' : '价格'}</span>
        {lesson === 'quant' && <span><i className="legend-secondary" />人工执行</span>}
        <span><i className="legend-baseline" />{lesson === 'volume' ? '前收基准' : '无交易干扰'}</span>
        <span className="chart-live"><i /> LIVE MODEL</span>
      </div>
      <svg
        className="lesson-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="教学行情图，价格与成交量随滑块实时变化"
        onPointerMove={(e) => onPointer(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ef6464" stopOpacity=".26" />
            <stop offset="1" stopColor="#ef6464" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {Array.from({ length: 5 }, (_, i) => {
          const value = max - ((max - min) * i) / 4;
          const py = M.t + ((PRICE_BOTTOM - M.t) * i) / 4;
          return <g key={i}><line x1={M.l} x2={W - M.r} y1={py} y2={py} className="chart-grid" /><text x={M.l - 12} y={py + 4} textAnchor="end" className="chart-axis">{value.toFixed(2)}</text></g>;
        })}
        {[0, 24, 48, 72, 95].map((i) => <text key={i} x={x(i)} y={H - 14} textAnchor="middle" className="chart-axis">{`09:${String(30 + Math.floor(i / 12)).padStart(2, '0')}`}</text>)}
        <line x1={M.l} x2={W - M.r} y1={VOLUME_TOP - 14} y2={VOLUME_TOP - 14} className="chart-grid" />
        <text x={M.l - 12} y={VOLUME_TOP - 20} textAnchor="end" className="chart-axis">VOL</text>

        {data.map((d, i) => i < count && (
          <rect key={d.i} x={x(d.i) - barW / 2} y={vy(d.volume)} width={barW} height={VOLUME_BOTTOM - vy(d.volume)} rx={1} className={d.primary >= (data[i - 1]?.primary ?? d.primary) ? 'vol-up' : 'vol-down'} opacity={0.28 + (d.volume / maxVolume) * 0.55} />
        ))}

        {/* 常态量基准：固定量纲下"矮"才有参照物。标签放左侧刻度槽，压在柱子上读不出来 */}
        {volumeRef && (
          <g pointerEvents="none">
            <line x1={M.l} x2={W - M.r} y1={vy(volumeRef)} y2={vy(volumeRef)} className="volume-ref" />
            <text x={M.l - 12} y={vy(volumeRef) + 3} textAnchor="end" className="volume-ref-label">常态</text>
          </g>
        )}

        <path d={pathOf(data, 'baseline', x, y)} className="line-baseline" />
        {lesson === 'quant' && <path d={pathOf(visible, 'secondary', x, y)} className="line-secondary" />}
        <path d={areaPath} fill={`url(#area-${uid})`} />
        <path d={primaryPath} className="line-primary" filter={`url(#glow-${uid})`} />

        {lesson === 'impact' && current.i >= 30 && <g className="event-pin" transform={`translate(${x(30)} ${M.t + 4})`}><line y1={0} y2={PRICE_BOTTOM - M.t - 4} /><rect x={-42} y={-3} width={84} height={22} rx={11} /><text y={12} textAnchor="middle">大单进入</text></g>}
        {lesson === 'quant' && visible.filter((d) => d.trade).map((d) => <circle key={d.i} cx={x(d.i)} cy={y(d.primary)} r={3.2} className="trade-dot" />)}
        <line x1={x(current.i)} x2={x(current.i)} y1={M.t} y2={VOLUME_BOTTOM} className="chart-cursor" />
        <circle cx={x(current.i)} cy={y(current.primary)} r={5} className="current-dot" />
        {hoverPoint && <g className="chart-tooltip" transform={`translate(${Math.min(W - 180, Math.max(M.l + 4, x(hoverPoint.i) + 12))} ${Math.max(12, y(hoverPoint.primary) - 64)})`}><rect width={154} height={52} rx={4} /><text x={10} y={19}>T+{hoverPoint.i} · {hoverPoint.primary.toFixed(2)}</text><text x={10} y={38}>成交量 {hoverPoint.volume.toFixed(0)} 手</text></g>}
      </svg>
      <div className="chart-current">
        <span>当前价格 <b>{current.primary.toFixed(2)}</b></span>
        <span>基准偏离 <b className={current.primary >= current.baseline ? 'up' : 'down'}>{((current.primary / current.baseline - 1) * 100).toFixed(2)}%</b></span>
        <span>进度 <b>{Math.round(progress * 100)}%</b></span>
      </div>
    </div>
  );
}
