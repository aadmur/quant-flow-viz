import { PHASE_MAP } from '../../core/phases';
import { Bolts, GaugeBar, LeftFace, Leds, Slab, TopFace, Vents } from './IsoParts';
import { ringPath, tickRing } from './shapes';
import type { PartProps } from './CoreParts';

/** 单位空间里的扇形环（用于组合权重盘） */
function sector(cx: number, cy: number, rOut: number, rIn: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + Math.cos(a) * r).toFixed(4)} ${(cy + Math.sin(a) * r).toFixed(4)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(rOut, a0)}A${rOut} ${rOut} 0 ${large} 1 ${p(rOut, a1)}L${p(rIn, a1)}A${rIn} ${rIn} 0 ${large} 0 ${p(rIn, a0)}Z`;
}

const AUX_TONE = 'light' as const;

/* ============================================================
   E1 保险丝座 —— 闸门一断，整台机器降功率
   ============================================================ */
export function BreakerCartridge({ g, snap, live, dim }: PartProps) {
  const accent = PHASE_MAP.e1.accent;
  const util = Math.min(1, snap.risk.utilization);
  const tripped = snap.risk.breaker !== 'closed';

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} tone={AUX_TONE} live={live || tripped} accent={accent} glow>
        <TopFace geom={g}>
          <rect x={0.06} y={0.08} width={0.88} height={0.84} fill="rgba(8,12,18,0.7)" rx={0.03} />
          {/* 保险管 */}
          <rect x={0.14} y={0.2} width={0.72} height={0.16} fill="rgba(140,170,205,0.16)" rx={0.06} />
          <rect
            x={0.16}
            y={0.235}
            width={0.68 * util}
            height={0.09}
            fill={tripped ? accent : '#ffb020'}
            opacity={0.75}
            rx={0.04}
          />
          {/* 闸刀：跳闸时抬起 */}
          <g transform={`rotate(${tripped ? -34 : 0} 0.5 0.78)`}>
            <rect x={0.28} y={0.74} width={0.44} height={0.075} fill="rgba(190,210,232,0.55)" rx={0.03} />
            <circle cx={0.66} cy={0.775} r={0.035} fill="#0d141d" stroke="rgba(200,220,240,0.6)" strokeWidth={0.008} />
          </g>
          <line x1={0.26} y1={0.82} x2={0.3} y2={0.7} stroke={tripped ? accent : 'rgba(120,150,180,0.5)'} strokeWidth={0.012} />
          <Leds u0={0.18} u1={0.82} v={0.58} count={5} values={[util, util, util, util, util]} accent={tripped ? accent : '#ffb020'} r={0.018} />
        </TopFace>
        <LeftFace geom={g}>
          <GaugeBar value={util} u0={0.08} u1={0.92} v={0.3} hh={0.07} color={util > 0.85 ? accent : '#ffb020'} />
          <Vents u0={0.08} u1={0.92} v0={0.52} v1={0.8} count={7} />
        </LeftFace>
      </Slab>
    </g>
  );
}

/* ============================================================
   E2 配重盘 —— 行业暴露的扇区
   ============================================================ */
export function WeightDisc({ g, snap, dim }: PartProps) {
  const accent = PHASE_MAP.e2.accent;
  const slices = snap.exposure.slice(0, 4);
  const total = slices.reduce((s, x) => s + x.weight, 0) || 1;
  let a = -Math.PI / 2;

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} tone={AUX_TONE} accent={accent} glow>
        <TopFace geom={g}>
          <circle cx={0.5} cy={0.5} r={0.42} fill="rgba(8,12,18,0.72)" />
          {slices.map((s, i) => {
            const span = (s.weight / total) * Math.PI * 2;
            const d = sector(0.5, 0.5, 0.4, 0.2, a + 0.02, a + span - 0.02);
            a += span;
            const cols = [accent, '#38e1ff', '#ffb020', '#a78bfa'];
            return <path key={s.sector} d={d} fill={cols[i % 4]} opacity={0.55} />;
          })}
          <path d={ringPath(0.5, 0.5, 0.18, 0.04)} fill="rgba(140,170,205,0.2)" />
          <path d={tickRing(0.5, 0.5, 0.44, 20, 0.03)} stroke="rgba(160,190,220,0.3)" strokeWidth={0.004} />
          <Bolts i={0.03} />
        </TopFace>
        <LeftFace geom={g}>
          {slices.map((s, i) => (
            <GaugeBar
              key={s.sector}
              value={Math.min(1, s.weight / 40)}
              u0={0.08}
              u1={0.92}
              v={0.22 + i * 0.16}
              hh={0.06}
              color={['#34d399', '#38e1ff', '#ffb020', '#a78bfa'][i % 4]}
            />
          ))}
        </LeftFace>
      </Slab>
    </g>
  );
}

/* ============================================================
   E3 故障注入阀 —— 五个口，拧开哪个下游就降级
   ============================================================ */
export function FaultValve({ g, snap, live, dim, clock }: PartProps) {
  const accent = PHASE_MAP.e3.accent;
  const active = snap.activeIncidents.length;
  const wheel = Math.sin(clock * 1.4) * 8;

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} tone={AUX_TONE} live={live || active > 0} accent={accent} glow>
        <TopFace geom={g}>
          <circle cx={0.5} cy={0.5} r={0.44} fill="rgba(8,12,18,0.7)" />
          {/* 五孔法兰 */}
          {Array.from({ length: 5 }, (_, i) => {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            const u = 0.5 + Math.cos(a) * 0.31;
            const v = 0.5 + Math.sin(a) * 0.31;
            const on = active > i;
            return (
              <g key={i}>
                <circle cx={u} cy={v} r={0.065} fill="rgba(6,10,15,0.9)" stroke={on ? accent : 'rgba(140,170,200,0.4)'} strokeWidth={0.009} />
                <circle cx={u} cy={v} r={0.03} fill={on ? accent : 'rgba(90,110,135,0.5)'} opacity={on ? 0.95 : 0.5} />
              </g>
            );
          })}
          {/* 手轮 */}
          <g transform={`rotate(${wheel} 0.5 0.5)`}>
            <path d={ringPath(0.5, 0.5, 0.16, 0.035)} fill="rgba(190,210,232,0.4)" />
            {[0, 60, 120].map((d) => (
              <line
                key={d}
                x1={0.5 - Math.cos((d * Math.PI) / 180) * 0.15}
                y1={0.5 - Math.sin((d * Math.PI) / 180) * 0.15}
                x2={0.5 + Math.cos((d * Math.PI) / 180) * 0.15}
                y2={0.5 + Math.sin((d * Math.PI) / 180) * 0.15}
                stroke="rgba(200,220,240,0.5)"
                strokeWidth={0.014}
              />
            ))}
          </g>
          <circle cx={0.5} cy={0.5} r={0.028} fill="#0b1018" stroke={accent} strokeWidth={0.007} />
        </TopFace>
        <LeftFace geom={g}>
          <rect x={0.06} y={0.2} width={0.88} height={0.6} fill="rgba(8,12,18,0.55)" />
          {Array.from({ length: 7 }, (_, i) => (
            <rect
              key={i}
              x={0.1 + i * 0.115}
              y={0.24}
              width={0.05}
              height={0.52}
              fill={accent}
              opacity={0.18 + (i % 2) * 0.22}
            />
          ))}
        </LeftFace>
      </Slab>
    </g>
  );
}
