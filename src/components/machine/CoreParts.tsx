import type { Fill, Snapshot } from '../../core/types';
import { PHASE_MAP } from '../../core/phases';
import { topEllipse } from '../../core/iso';
import { BoltRing, CapClip, GaugeBar, LeftFace, Leds, Slab, TopFace, Vents, WallPlate, type SlabGeom } from './IsoParts';
import { gearPath, ringPath, tickRing, wedgePath } from './shapes';

export interface PartProps {
  /** 已经算好爆炸偏移的几何 */
  g: SlabGeom & { w: number; dep: number; h: number };
  snap: Snapshot;
  /** 当前 tick 该零件处于活跃阶段 */
  live: boolean;
  selected: boolean;
  /** 0 = 正常，1 = 完全压暗 */
  dim: number;
  /** 装饰性动画秒数（只驱动光效，不参与数据） */
  clock: number;
  onSelect: () => void;
  /** 截至当前 tick 的成交序列（快照只存 fillCount，明细由会话层截断后传入） */
  fills?: Fill[];
  /** 截至当前 tick 的权益序列，用于记录鼓画轨迹 */
  equity?: number[];
  /** 机身形态：圆筒 / 方箱 */
  shape?: 'box' | 'drum';
  /** 筒壁纵向棱数 */
  flutes?: number;
  /** 悬空时的接触阴影强度 0..1 */
  shadow?: number;
  /** 拆解度，用于辉光强度 */
  explode?: number;
}

const BLIP_SPOTS: [number, number][] = [
  [0.66, 0.34],
  [0.36, 0.62],
  [0.57, 0.7],
  [0.42, 0.3],
  [0.72, 0.56],
  [0.3, 0.44],
];

/* ============================================================
   M1 感知阵列 —— 圆筒 + 旋转雷达盘
   ============================================================ */
export function SensorArray({ g, snap, live, dim, clock, shape, flutes, shadow }: PartProps) {
  const accent = PHASE_MAP.m1.accent;
  const sweep = (snap.tick * 9 + clock * 46) % 360;
  const alerts = snap.anomaliesNow.length;
  const vals = snap.quotes.slice(0, 6).map((q) => q.changePct / 3);

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} shape={shape} flutes={flutes} shadow={shadow} tone="dark" live={live} accent={accent} glow>
        <TopFace geom={g}>
          <CapClip>
            {/* 雷达底盘 */}
            <circle cx={0.5} cy={0.5} r={0.42} fill="rgba(8,13,20,0.85)" />
            <path d={ringPath(0.5, 0.5, 0.418, 0.014)} fill="rgba(126,158,190,0.26)" />
            <path d={tickRing(0.5, 0.5, 0.4, 48, 0.026)} stroke="rgba(126,170,205,0.4)" strokeWidth={0.005} fill="none" />
            <path d={ringPath(0.5, 0.5, 0.28, 0.007)} fill="rgba(84,124,164,0.22)" />
            <path d={ringPath(0.5, 0.5, 0.15, 0.007)} fill="rgba(84,124,164,0.22)" />

            {/* 扫描扇形 */}
            <g opacity={live ? 0.6 : 0.32}>
              <path d={wedgePath(0.5, 0.5, 0.41, ((sweep - 30) * Math.PI) / 180, (sweep * Math.PI) / 180)} fill={accent} opacity={0.16} />
              <line
                x1={0.5}
                y1={0.5}
                x2={0.5 + Math.cos((sweep * Math.PI) / 180) * 0.41}
                y2={0.5 + Math.sin((sweep * Math.PI) / 180) * 0.41}
                stroke={accent}
                strokeWidth={0.007}
                opacity={0.9}
              />
            </g>

            {/* 观察列表光点：亮度 = 涨跌幅绝对值 */}
            {snap.quotes.slice(0, 6).map((q, i) => {
              const [u, v] = BLIP_SPOTS[i];
              const mag = Math.min(1, Math.abs(q.changePct) / 3);
              return (
                <g key={q.symbol.code}>
                  <circle cx={u} cy={v} r={0.02 + mag * 0.026} fill={accent} opacity={0.1 + mag * 0.5} />
                  <circle cx={u} cy={v} r={0.008} fill="#e8f6ff" opacity={0.45 + mag * 0.5} />
                </g>
              );
            })}

            {/* 异动报警环 */}
            {alerts > 0 && <circle cx={0.5} cy={0.5} r={0.45} fill="none" stroke="#ffc247" strokeWidth={0.012} opacity={0.85} />}
            <BoltRing count={12} r={0.455} size={0.011} />
          </CapClip>
        </TopFace>

        <WallPlate geom={g}>
          {(w, h) => {
            const slot = (w - 14) / 6;
            return (
              <g>
                {/* 六路上游信号：细长槽灯，不做色块 */}
                {vals.map((v, i) => (
                  <rect
                    key={i}
                    x={7 + i * slot + slot * 0.3}
                    y={h * 0.16}
                    width={2.8}
                    height={h * 0.44}
                    rx={1.4}
                    fill={v >= 0 ? '#ff4d63' : '#17cf8d'}
                    opacity={0.28 + Math.min(0.62, Math.abs(v) * 1.4)}
                  />
                ))}
                <rect x={7} y={h * 0.78} width={w - 14} height={1.6} fill="rgba(8,14,20,0.9)" />
                <rect x={7} y={h * 0.78} width={(w - 14) * Math.min(1, snap.anomalyCount / 12)} height={1.6} fill={accent} />
              </g>
            );
          }}
        </WallPlate>
      </Slab>
    </g>
  );
}

/* ============================================================
   M2 判别齿轮组 —— 五因子差速环 + 综合分指针
   ============================================================ */
export function DifferentialRings({ g, snap, live, dim, clock, shape, flutes, shadow }: PartProps) {
  const accent = PHASE_MAP.m2.accent;
  const { decision } = snap;
  const radii = [0.365, 0.295, 0.228, 0.163, 0.1];
  const teeth = [30, 26, 22, 16, 12];
  const locked = decision.trigger;
  const needle = -90 + Math.max(-1, Math.min(1, decision.score)) * 68;

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} shape={shape} flutes={flutes} shadow={shadow} live={live || decision.trigger} accent={accent} glow>
        <TopFace geom={g}>
          <CapClip>
            <circle cx={0.5} cy={0.5} r={0.46} fill="rgba(9,13,20,0.6)" />

            {/* 五个因子环：转速 ∝ |raw|，方向 ∝ 符号；开仓时全部锁死 */}
            {decision.factors.map((f, i) => {
              const mag = Math.abs(f.raw);
              const dir = f.raw >= 0 ? 1 : -1;
              const angle = locked ? i * 7 : f.raw * 210 + clock * 26 * mag * dir;
              const r = radii[i] ?? 0.1;
              return (
                <g key={f.key} transform={`rotate(${angle} 0.5 0.5)`}>
                  <path d={gearPath(0.5, 0.5, r, r - 0.03, teeth[i] ?? 14, 0)} fill="rgba(140,170,205,0.2)" />
                  <path
                    d={gearPath(0.5, 0.5, r - 0.004, r - 0.032, teeth[i] ?? 14, 0)}
                    fill="none"
                    stroke={accent}
                    strokeWidth={0.005}
                    opacity={0.25 + mag * 0.55}
                  />
                </g>
              );
            })}

            {/* 刻度盘 + 阈值标记 */}
            <path
              d={`M${0.5 + Math.cos((-158 * Math.PI) / 180) * 0.44} ${0.5 + Math.sin((-158 * Math.PI) / 180) * 0.44}A0.44 0.44 0 0 1 ${
                0.5 + Math.cos((-22 * Math.PI) / 180) * 0.44
              } ${0.5 + Math.sin((-22 * Math.PI) / 180) * 0.44}`}
              fill="none"
              stroke="rgba(150,175,205,0.35)"
              strokeWidth={0.006}
            />
            {[-1, -0.5, 0, 0.5, 1].map((s) => {
              const a = ((-90 + s * 68) * Math.PI) / 180;
              const big = s === 0;
              return (
                <line
                  key={s}
                  x1={0.5 + Math.cos(a) * 0.44}
                  y1={0.5 + Math.sin(a) * 0.44}
                  x2={0.5 + Math.cos(a) * (big ? 0.4 : 0.415)}
                  y2={0.5 + Math.sin(a) * (big ? 0.4 : 0.415)}
                  stroke="rgba(170,195,225,0.5)"
                  strokeWidth={big ? 0.008 : 0.004}
                />
              );
            })}
            {[decision.threshold, -decision.threshold].map((th) => {
              const a = ((-90 + th * 68) * Math.PI) / 180;
              return (
                <line
                  key={th}
                  x1={0.5 + Math.cos(a) * 0.33}
                  y1={0.5 + Math.sin(a) * 0.33}
                  x2={0.5 + Math.cos(a) * 0.46}
                  y2={0.5 + Math.sin(a) * 0.46}
                  stroke="#ff5d6e"
                  strokeWidth={0.011}
                  opacity={0.85}
                />
              );
            })}

            {/* 指针 */}
            <g transform={`rotate(${needle + 90} 0.5 0.5)`}>
              <polygon points="0.5,0.5 0.5,0.08 0.487,0.14 0.513,0.14" fill={accent} opacity={0.95} />
            </g>
            <circle cx={0.5} cy={0.5} r={0.045} fill="#0c111a" stroke={accent} strokeWidth={0.008} />
            <circle cx={0.5} cy={0.5} r={0.018} fill={accent} opacity={locked ? 1 : 0.6} />
            {locked && <circle cx={0.5} cy={0.5} r={0.475} fill="none" stroke={accent} strokeWidth={0.016} opacity={0.9} />}
          </CapClip>
        </TopFace>

        <WallPlate geom={g} w={0.78}>
          {(w, h) => {
            const bar = (w - 18) / 5;
            return (
              <g>
                {/* 五因子权重条：正贡献朝上、负贡献朝下 */}
                {decision.factors.map((f, i) => {
                  const mag = Math.min(1, Math.abs(f.contribution) * 2.2);
                  const up = h * 0.4 * mag;
                  return (
                    <rect
                      key={f.key}
                      x={8 + i * bar + bar * 0.28}
                      y={f.contribution >= 0 ? h * 0.5 - up : h * 0.5}
                      width={3}
                      height={Math.max(1.5, up)}
                      fill={f.contribution >= 0 ? accent : '#ff7a86'}
                      opacity={0.75 + mag * 0.25}
                    />
                  );
                })}
                <rect x={7} y={h * 0.5} width={w - 14} height={1} fill="rgba(190,214,240,0.22)" />
              </g>
            );
          }}
        </WallPlate>
      </Slab>
    </g>
  );
}

/* ============================================================
   M3 分液歧管 —— 方箱：母单在入口，按算法分成 N 条支管
   ============================================================ */
export function Manifold({ g, snap, live, dim, clock, shape, flutes, shadow }: PartProps) {
  const accent = PHASE_MAP.m3.accent;
  const parent = snap.parent;
  const children = parent?.children ?? [];
  const shown = children.slice(0, 10);
  const streams = Math.max(1, shown.length);
  const blocked = snap.risk.breaker === 'open';

  const statusColor = (s: string) => {
    if (s === 'filled') return '#17cf8d';
    if (s === 'active' || s === 'partial') return accent;
    if (s === 'rejected' || s === 'blocked' || s === 'cancelled') return '#ff4d63';
    return 'rgba(140,165,195,0.4)';
  };

  return (
    <g opacity={1 - dim * 0.62}>
      <Slab {...g} shape={shape} flutes={flutes} shadow={shadow} live={live} accent={accent} glow>
        <TopFace geom={g}>
          <rect x={0.02} y={0.02} width={0.96} height={0.96} fill="rgba(7,11,17,0.66)" rx={0.02} />

          {/* 入口 */}
          <circle cx={0.5} cy={0.07} r={0.05} fill="rgba(6,10,15,0.9)" stroke={accent} strokeWidth={0.008} />
          <circle
            cx={0.5}
            cy={0.07}
            r={0.024}
            fill={accent}
            opacity={parent && parent.status === 'working' ? 0.35 + 0.45 * Math.abs(Math.sin(clock * 3)) : 0.12}
          />

          {/* 一级分液：主管 → 横槽 */}
          <line x1={0.5} y1={0.11} x2={0.5} y2={0.2} stroke="rgba(150,180,212,0.55)" strokeWidth={0.014} />
          <line
            x1={0.5 - (streams - 1) * 0.042}
            y1={0.2}
            x2={0.5 + (streams - 1) * 0.042}
            y2={0.2}
            stroke="rgba(150,180,212,0.55)"
            strokeWidth={0.014}
          />

          {/* 支管 + 阀门 */}
          {Array.from({ length: streams }, (_, i) => {
            const u = 0.5 + (i - (streams - 1) / 2) * 0.084;
            const child = shown[i];
            const color = child ? statusColor(child.status) : 'rgba(140,165,195,0.35)';
            const open = child && (child.status === 'filled' || child.status === 'active' || child.status === 'partial');
            return (
              <g key={i}>
                <line x1={u} y1={0.2} x2={u} y2={0.42} stroke="rgba(140,168,200,0.4)" strokeWidth={0.01} />
                <circle cx={u} cy={0.44} r={0.021} fill="rgba(8,12,18,0.9)" stroke={color} strokeWidth={0.007} />
                <circle cx={u} cy={0.44} r={0.009} fill={color} opacity={open ? 0.95 : 0.3} />
                <line x1={u} y1={0.47} x2={u} y2={0.9} stroke={color} strokeWidth={open ? 0.012 : 0.007} opacity={open ? 0.85 : 0.28} />
                {child?.status === 'filled' && <polygon points={`${u},0.9 ${u - 0.012},0.86 ${u + 0.012},0.86`} fill={color} opacity={0.9} />}
              </g>
            );
          })}

          {/* 风控闸门 */}
          {blocked && (
            <g>
              <rect x={0.16} y={0.18} width={0.68} height={0.05} fill="#ff4d63" opacity={0.35} />
              <rect x={0.16} y={0.18} width={0.68} height={0.05} fill="none" stroke="#ff4d63" strokeWidth={0.008} />
            </g>
          )}

          <g opacity={0.5}>
            {Array.from({ length: snap.parent ? 4 : 0 }, (_, k) => (
              <rect key={k} x={0.74 + k * 0.045} y={0.93} width={0.028} height={0.012} fill={accent} />
            ))}
          </g>
        </TopFace>

        <LeftFace geom={g}>
          <Vents u0={0.03} u1={0.24} v0={0.18} v1={0.74} count={6} />
          <GaugeBar
            value={parent && parent.targetQty > 0 ? parent.filledQty / parent.targetQty : 0}
            u0={0.3}
            u1={0.96}
            v={0.26}
            hh={0.06}
            color={accent}
          />
          <GaugeBar
            value={children.length > 0 ? children.filter((c) => c.status === 'filled').length / children.length : 0}
            u0={0.3}
            u1={0.96}
            v={0.5}
            hh={0.06}
            color="#17cf8d"
          />
          <Leds
            u0={0.32}
            u1={0.94}
            v={0.78}
            count={Math.min(8, Math.max(3, children.length))}
            values={children.slice(0, 8).map((c) => (c.status === 'filled' ? 1 : 0.25))}
            accent={accent}
            r={0.014}
          />
        </LeftFace>
      </Slab>
    </g>
  );
}

/** 供 MachineStage 计算顶面椭圆用（保留导出，避免各零件重复算） */
export function dishOf(w: number, dep: number, r: number) {
  return topEllipse(w, dep, r);
}
