import { PHASE_MAP } from '../../core/phases';
import { Bolts, CapClip, GaugeBar, LeftFace, Slab, TopFace, Vents, WallPlate } from './IsoParts';
import { gearPath, liquidPath, ringPath, tickRing } from './shapes';
import type { PartProps } from './CoreParts';

/* ============================================================
   M4 撮合鼓 —— 圆筒机身 + 两只反向滚筒咬住子单，成交落进托盘
   ============================================================ */
export function MatchingDrums({ g, snap, live, dim, clock, fills, shape, flutes, shadow }: PartProps) {
  const accent = PHASE_MAP.m4.accent;
  const list = fills ?? [];
  const last = list.length > 0 ? list[list.length - 1] : null;
  const sinceFill = last ? snap.tick - last.tick : 99;
  const flash = sinceFill >= 0 && sinceFill <= 2 ? 1 - sinceFill / 3 : 0;
  const spin = snap.tick * 14 + clock * 30;
  const recent = list.slice(-14);

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} shape={shape} flutes={flutes} shadow={shadow} live={live} accent={accent} glow>
        <TopFace geom={g}>
          <CapClip>
            <circle cx={0.5} cy={0.5} r={0.46} fill="rgba(7,11,17,0.68)" />
            {/* 咬合的两只滚筒 */}
            {[
              { cx: 0.34, dir: 1 },
              { cx: 0.66, dir: -1 },
            ].map(({ cx, dir }) => (
              <g key={cx} transform={`rotate(${spin * dir} ${cx} 0.5)`}>
                <path d={gearPath(cx, 0.5, 0.2, 0.155, 22, 0)} fill="rgba(140,170,205,0.2)" />
                <path d={gearPath(cx, 0.5, 0.195, 0.16, 22, 0)} fill="none" stroke={accent} strokeWidth={0.005} opacity={0.4} />
                <path d={ringPath(cx, 0.5, 0.1, 0.018)} fill="rgba(120,150,185,0.24)" />
                <path d={tickRing(cx, 0.5, 0.085, 8, 0.03)} stroke="rgba(160,190,220,0.4)" strokeWidth={0.004} />
              </g>
            ))}
            {/* 咬合点：成交闪烁 */}
            <circle cx={0.5} cy={0.5} r={0.05} fill="#eaf7ff" opacity={0.1 + flash * 0.75} />
            <circle cx={0.5} cy={0.5} r={0.05 + flash * 0.07} fill="none" stroke={accent} strokeWidth={0.01} opacity={flash} />

            {/* 落料托盘：最近成交堆成柱 */}
            {recent.map((f, i) => {
              const u = 0.24 + i * 0.038;
              const hh = 0.05 + Math.min(0.26, f.qty / 4000);
              return (
                <rect
                  key={f.id}
                  x={u}
                  y={0.86 - hh}
                  width={0.026}
                  height={hh}
                  fill={f.side === 'buy' ? '#ff4d63' : '#17cf8d'}
                  opacity={0.35 + (i / recent.length) * 0.55}
                />
              );
            })}
            <line x1={0.2} y1={0.865} x2={0.8} y2={0.865} stroke="rgba(160,190,220,0.3)" strokeWidth={0.006} />
          </CapClip>
        </TopFace>

        <WallPlate geom={g} w={0.76}>
          {(w, h) => (
            <g>
              <rect x={7} y={h * 0.16} width={w - 14} height={2} fill="rgba(8,14,20,0.9)" />
              <rect x={7} y={h * 0.16} width={(w - 14) * Math.min(1, snap.execution.fillRate)} height={2} fill={accent} />
              <rect x={7} y={h * 0.3} width={w - 14} height={2} fill="rgba(8,14,20,0.9)" />
              <rect x={7} y={h * 0.3} width={(w - 14) * Math.min(1, snap.execution.filledQty / 120000)} height={2} fill="#ffb020" />
              {/* 每笔成交一盏小灯，最近的走最右 */}
              {Array.from({ length: 10 }, (_, i) => {
                const f = recent[recent.length - 10 + i];
                const step = (w - 14) / 10;
                return (
                  <circle
                    key={i}
                    cx={7 + i * step + step / 2}
                    cy={h * 0.62}
                    r={1.9}
                    fill={f ? (f.side === 'buy' ? '#ff4d63' : '#17cf8d') : 'rgba(120,145,175,0.22)'}
                    opacity={f ? 0.9 : 0.4}
                  />
                );
              })}
            </g>
          )}
        </WallPlate>
      </Slab>
    </g>
  );
}

/* ============================================================
   M5 冲击槽 —— 又宽又浅的方槽：液面被我们的成交压出涟漪
   ============================================================ */
export function ImpactTrough({ g, snap, live, dim, clock, shape, flutes, shadow }: PartProps) {
  const accent = PHASE_MAP.m5.accent;
  const imp = snap.impact;
  const amp = Math.min(0.05, 0.006 + Math.abs(imp.temporaryBps) / 900);
  const heat = Math.min(1, imp.totalBps / 40);
  const liquid = `rgb(${Math.round(90 + heat * 165)}, ${Math.round(200 - heat * 130)}, ${Math.round(190 - heat * 90)})`;

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} shape={shape} flutes={flutes} shadow={shadow} tone="steel" live={live} accent={accent} glow>
        <TopFace geom={g}>
          {/* 槽口内壁：先一圈窄的亮边，才有「挖下去」的厚度 */}
          <rect x={0.02} y={0.04} width={0.96} height={0.92} fill="rgba(96,120,148,0.5)" rx={0.02} />
          <rect x={0.045} y={0.09} width={0.91} height={0.82} fill="rgba(4,8,13,0.94)" rx={0.015} />
          {/* 液面：振幅 = 临时冲击，波数固定，相位随 tick 前进 */}
          <rect x={0.062} y={0.5} width={0.876} height={0.4} fill={liquid} opacity={0.34} />
          <path d={liquidPath(0.06, 0.94, 0.5, amp, 2.2, snap.tick * 0.22 + clock * 0.6)} fill={liquid} opacity={0.62} />
          <path
            d={liquidPath(0.06, 0.94, 0.5, amp * 0.6, 2.2, snap.tick * 0.22 + clock * 0.6)}
            fill="none"
            stroke="#dff8ff"
            strokeWidth={0.005}
            opacity={0.55}
          />
          {/* 涟漪环 */}
          {[0, 1, 2].map((k) => {
            const t = (snap.tick * 0.05 + k / 3 + clock * 0.05) % 1;
            return (
              <ellipse
                key={k}
                cx={0.5}
                cy={0.5}
                rx={0.06 + t * 0.42}
                ry={0.045 + t * 0.3}
                fill="none"
                stroke={liquid}
                strokeWidth={0.006}
                opacity={(1 - t) * 0.5}
              />
            );
          })}
          {/* 浮标：被冲走多远 = 永久冲击 */}
          <g transform={`translate(${Math.min(0.4, imp.permanentBps / 80)}, ${-amp * 1.6})`}>
            <rect x={0.46} y={0.46} width={0.08} height={0.08} fill="#0d1520" stroke={liquid} strokeWidth={0.007} />
            <line x1={0.5} y1={0.46} x2={0.5} y2={0.35} stroke={liquid} strokeWidth={0.005} />
          </g>
          {/* 刻度：两侧像量杯一样 */}
          {[0.18, 0.34, 0.5, 0.66, 0.82].map((v) => (
            <line key={v} x1={0.06} y1={v} x2={0.1} y2={v} stroke="rgba(170,200,228,0.35)" strokeWidth={0.005} />
          ))}
        </TopFace>

        <LeftFace geom={g}>
          <Vents u0={0.03} u1={0.18} v0={0.2} v1={0.72} count={4} />
          {/* 拆单成本 vs 一次性砸盘成本（同口径） */}
          <GaugeBar
            value={Math.min(1, imp.avgCostBps / Math.max(1, imp.oneShotCostBps))}
            u0={0.24}
            u1={0.96}
            v={0.24}
            hh={0.07}
            color={accent}
          />
          <GaugeBar value={1} u0={0.24} u1={0.96} v={0.44} hh={0.07} color="rgba(255,93,110,0.8)" />
          <GaugeBar value={Math.min(1, imp.depthConsumed / 160000)} u0={0.24} u1={0.96} v={0.72} hh={0.04} color="rgba(200,220,240,0.5)" />
          <Bolts i={0.03} color="rgba(150,172,198,0.22)" />
        </LeftFace>
      </Slab>
    </g>
  );
}

/* ============================================================
   M6 记录鼓 —— 圆筒机身，正面嵌一块走纸示波屏
   ============================================================ */
export function RecorderDrum({ g, snap, live, dim, clock, equity, shape, flutes, shadow }: PartProps) {
  const accent = PHASE_MAP.m6.accent;
  const series = (equity ?? []).slice(-80);
  const spin = snap.tick * 3 + clock * 12;

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} shape={shape} flutes={flutes} shadow={shadow} tone="dark" live={live} accent={accent} glow>
        <TopFace geom={g}>
          <CapClip>
            <circle cx={0.5} cy={0.5} r={0.45} fill="rgba(8,12,19,0.6)" />
            <g transform={`rotate(${spin} 0.5 0.5)`}>
              <path d={ringPath(0.5, 0.5, 0.36, 0.055)} fill="rgba(130,160,195,0.2)" />
              <path d={tickRing(0.5, 0.5, 0.31, 28, 0.032)} stroke="rgba(170,195,225,0.42)" strokeWidth={0.005} />
              <path d={gearPath(0.5, 0.5, 0.11, 0.065, 10, 0)} fill={accent} opacity={0.5} />
            </g>
            <circle cx={0.5} cy={0.5} r={0.022} fill="#0b1018" stroke={accent} strokeWidth={0.006} />
          </CapClip>
        </TopFace>

        <WallPlate geom={g} w={0.82} v0={0.14} v1={0.86}>
          {(w, h) => {
            const plotH = h * 0.62;
            return (
              <g>
                {/* 走纸窗口 */}
                <rect x={6} y={6} width={w - 12} height={plotH} rx={1.5} fill="rgba(3,7,11,0.9)" stroke="rgba(140,172,206,0.16)" strokeWidth={0.8} />
                {[0.25, 0.5, 0.75].map((k) => (
                  <line key={k} x1={6} y1={6 + plotH * k} x2={w - 6} y2={6 + plotH * k} stroke="rgba(120,160,200,0.1)" strokeWidth={0.7} />
                ))}
                {series.length > 1 && (
                  <path
                    d={screenTrace(series, 8, 8, w - 16, plotH - 4)}
                    fill="none"
                    stroke={accent}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    opacity={0.9}
                  />
                )}
                {/* 胜率条 */}
                <rect x={6} y={h - 8} width={w - 12} height={2.4} fill="rgba(8,14,20,0.9)" />
                <rect x={6} y={h - 8} width={(w - 12) * Math.min(1, snap.review.winRate)} height={2.4} fill={accent} opacity={0.9} />
              </g>
            );
          }}
        </WallPlate>
      </Slab>
    </g>
  );
}

/** 像素坐标版的折线（表板用，不做面投影） */
function screenTrace(values: number[], x0: number, y0: number, w: number, h: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((v, i) => {
      const x = x0 + (i / (values.length - 1)) * w;
      const y = y0 + (1 - (v - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}
