import { useMemo } from 'react';
import type { Fill, PhaseId, Snapshot } from '../../core/types';
import { PHASE_MAP } from '../../core/phases';
import { C30, S30, iso } from '../../core/iso';
import { fmtBps, fmtMoney } from '../../core/format';
import { capRadii, type SlabGeom } from './IsoParts';
import { DifferentialRings, Manifold, SensorArray } from './CoreParts';
import { ImpactTrough, MatchingDrums, RecorderDrum } from './FlowParts';
import { BreakerCartridge, FaultValve, WeightDisc } from './AuxParts';
import { PacketLayer } from './PacketLayer';

/* ============================================================
   装配体几何
   ------------------------------------------------------------
   这是整页的主角：一台被吊起来拆开的机器。
   要把「拆成零部件」讲清楚，靠的不是动画，而是**剪影差异**：
     · 四只直径各异的圆筒（感知盘 / 差速鼓 / 撮合鼓 / 记录鼓）
     · 一只方箱（分液歧管）
     · 一只又宽又浅的槽（冲击槽）
   如果六个零件都是同尺寸方箱，堆起来只会读成「一摞托盘」。
   ============================================================ */
type CoreSpec = { shape: 'box' | 'drum'; w: number; dep: number; h: number; tone: 'base' | 'dark' | 'light' | 'steel'; flutes: number };

const CORE: Record<PhaseId, CoreSpec> = {
  m1: { shape: 'drum', w: 288, dep: 288, h: 104, tone: 'dark', flutes: 26 },
  m2: { shape: 'drum', w: 262, dep: 262, h: 112, tone: 'base', flutes: 30 },
  m3: { shape: 'box', w: 248, dep: 146, h: 88, tone: 'base', flutes: 0 },
  m4: { shape: 'drum', w: 278, dep: 278, h: 130, tone: 'base', flutes: 34 },
  m5: { shape: 'box', w: 330, dep: 190, h: 74, tone: 'steel', flutes: 0 },
  m6: { shape: 'drum', w: 254, dep: 254, h: 106, tone: 'dark', flutes: 24 },
  e1: { shape: 'box', w: 150, dep: 122, h: 44, tone: 'light', flutes: 0 },
  e2: { shape: 'box', w: 150, dep: 122, h: 44, tone: 'light', flutes: 0 },
  e3: { shape: 'box', w: 150, dep: 122, h: 44, tone: 'light', flutes: 0 },
};

const Z_TOP = 830;
const Z_STEP = 166;
const EXPLODE_STEP = 56;

/** 附件机架：右侧挂载的三只小零件 */
const AUX_X = 146;
const AUX_Y = -286;
const AUX_Z = [10, 176, 342];

const CORE_ORDER: PhaseId[] = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
const AUX_ORDER: PhaseId[] = ['e1', 'e2', 'e3'];

/** 每个零件的读数：显示在引线端的小字 */
function readoutOf(id: PhaseId, s: Snapshot): string {
  switch (id) {
    case 'm1':
      return `${s.anomalyCount} 次异动 · 幅度 ${Math.abs(s.changePct).toFixed(2)}%`;
    case 'm2':
      return `综合分 ${s.decision.score >= 0 ? '+' : ''}${s.decision.score.toFixed(2)} / 阈值 ${s.decision.threshold.toFixed(2)}`;
    case 'm3':
      return s.parent ? `${s.parent.children.length} 张子单 · ${fmtMoney(s.parent.targetQty * s.price)}` : '待触发';
    case 'm4':
      return `成交率 ${(s.execution.fillRate * 100).toFixed(1)}% · 滑点 ${fmtBps(s.execution.avgSlippageBps, 1)}`;
    case 'm5':
      return `冲击 ${fmtBps(s.impact.totalBps, 1)} · 成本 ${fmtMoney(s.impact.costYuan)}`;
    case 'm6':
      return `权益 ${fmtMoney(s.review.equity)} · vsVWAP ${fmtBps(s.review.vsVwapBps, 1)}`;
    case 'e1':
      return `敞口 ${(s.risk.utilization * 100).toFixed(0)}% · ${s.risk.breaker === 'closed' ? '闸门闭合' : '已熔断'}`;
    case 'e2':
      return `${s.positions.length} 只持仓 · 前二 ${s.exposure
        .slice(0, 2)
        .reduce((a, b) => a + b.weight, 0)
        .toFixed(0)}%`;
    case 'e3':
      return s.activeIncidents.length > 0 ? `${s.activeIncidents.length} 个异常处置中` : '无异常';
    default:
      return '';
  }
}

export interface MachineStageProps {
  snap: Snapshot;
  fills: Fill[];
  equity: number[];
  tick: number;
  explode: number;
  selected: PhaseId | null;
  onSelect: (id: PhaseId | null) => void;
  clock: number;
}

export function MachineStage({ snap, fills, equity, tick, explode, selected, onSelect, clock }: MachineStageProps) {
  const parts = useMemo(
    () =>
      CORE_ORDER.map((id, i) => {
        const spec = CORE[id];
        // 爆炸：越靠上的零件往上走、越靠下的往下走，符号不能反（反了会把零件压到一起）
        // 爆炸只往上长：最底下那只零件始终坐在托板上，画面不会掉出下边缘
        const z = Z_TOP - i * Z_STEP + explode * (CORE_ORDER.length - 1 - i) * EXPLODE_STEP;
        const g: SlabGeom = { x: -spec.w / 2, y: -spec.dep / 2, z, w: spec.w, dep: spec.dep, h: spec.h };
        return { id, g, spec };
      }),
    [explode],
  );

  const dimOf = (id: PhaseId) => (selected && selected !== id ? 1 : 0);
  const livePhase = snap.metrics.activePhase;

  const common = (id: PhaseId) => ({
    snap,
    live: livePhase === id,
    selected: selected === id,
    dim: dimOf(id),
    clock,
    onSelect: () => onSelect(selected === id ? null : id),
    fills,
    equity,
    explode,
  });

  const scale = 1 - explode * 0.4;

  return (
    <svg
      className="machine-svg"
      viewBox="0 0 1140 1140"
      preserveAspectRatio="xMidYMid meet"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
      role="img"
      aria-label="交易引擎装配体：六个主零件与三个附件"
    >
      <defs>
        <radialGradient id="groundFade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.82)" />
          <stop offset="62%" stopColor="rgba(0,0,0,0.34)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <radialGradient id="dropFade" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,0.7)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="spindle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56,225,255,0.9)" />
          <stop offset="55%" stopColor="rgba(255,176,32,0.75)" />
          <stop offset="100%" stopColor="rgba(244,114,182,0.65)" />
        </linearGradient>
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56,225,255,0.1)" />
          <stop offset="100%" stopColor="rgba(56,225,255,0)" />
        </linearGradient>
        {/* 顶面受光池：所有零件共用，靠一个斜向高光把机加工面打亮 */}
        <linearGradient id="toppool" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="rgba(214,232,250,0.17)" />
          <stop offset="46%" stopColor="rgba(214,232,250,0.03)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
        </linearGradient>
        {/* 筒身柱面明暗：左前受光、右侧回光、两缘压暗，一眼读成圆筒 */}
        <linearGradient id="cylShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#080d13" />
          <stop offset="13%" stopColor="#243040" />
          <stop offset="32%" stopColor="#3e4f63" />
          <stop offset="52%" stopColor="#2b3745" />
          <stop offset="78%" stopColor="#18212b" />
          <stop offset="100%" stopColor="#070b10" />
        </linearGradient>
        <radialGradient id="capShade" cx="36%" cy="26%" r="76%">
          <stop offset="0%" stopColor="rgba(228,242,255,0.18)" />
          <stop offset="48%" stopColor="rgba(228,242,255,0.035)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
        </radialGradient>
        <linearGradient id="shaft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0a1017" />
          <stop offset="34%" stopColor="#48596d" />
          <stop offset="100%" stopColor="#101822" />
        </linearGradient>
        <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="4.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* 圆筒顶盖的裁剪窗：所有顶面细节都被切在筒口以内 */}
        <clipPath id="capClip" clipPathUnits="userSpaceOnUse">
          <circle cx="0.5" cy="0.5" r="0.497" />
        </clipPath>
      </defs>

      {/* 背景：背光光柱 + 台面网格 + 地平线 */}
      <g pointerEvents="none">
        <polygon points="380,16 632,16 810,1024 200,1024" fill="url(#haze)" opacity={0.78} />
        <FloorGrid />
        <ellipse cx={450} cy={1024} rx={430} ry={58} fill="url(#groundFade)" opacity={0.92} />
        <line x1={10} y1={1024} x2={1130} y2={1024} stroke="rgba(120,160,200,0.15)" strokeWidth={1} />
      </g>

      <g transform="translate(450 1024)">
        <g transform={`scale(${scale})`}>
          {/* 底座托板 */}
          <polygon points={isoRect(-206, -126, -10, 412, 252)} fill="#0b1119" stroke="rgba(120,150,185,0.22)" strokeWidth={1} />
          <polygon points={isoRect(-190, -112, -8, 380, 224)} fill="none" stroke="rgba(120,150,185,0.1)" strokeWidth={1} />
          {(
            [
              [-190, -112],
              [190, -112],
              [190, 112],
              [-190, 112],
            ] as [number, number][]
          ).map(([bx, by], i) => {
            const p = iso(bx, by, -8);
            return <circle key={i} cx={p.x} cy={p.y} r={2.8} fill="none" stroke="rgba(150,175,205,0.32)" strokeWidth={1} />;
          })}

          {/* 缝隙透光：每个间隙都被内部的光打亮，拆解时才看得出「里面有能量在跑」 */}
          {parts.slice(0, -1).map((p, i) => {
            const gapTop = parts[i + 1].g.z + parts[i + 1].g.h;
            const mid = (p.g.z + gapTop) / 2;
            return (
              <ellipse
                key={`glow-${p.id}`}
                cx={0}
                cy={-mid}
                rx={128}
                ry={40}
                fill={PHASE_MAP[p.id].accent}
                opacity={0.16 + explode * 0.14}
                filter="url(#softGlow)"
                pointerEvents="none"
              />
            );
          })}

          {/* 主轴：只在零件之间的空隙里可见；拉长时串成一节节联轴器 */}
          {parts.slice(0, -1).map((p, i) => (
            <Shaft key={p.id} z0={p.g.z} z1={parts[i + 1].g.z + parts[i + 1].g.h} accent={PHASE_MAP[p.id].accent} explode={explode} />
          ))}

          {/* 跨零件管路：真正让装配体读成「一台机器」的东西——零件之间有东西连着 */}
          {parts.slice(0, -1).map((p, i) => {
            const z0 = p.g.z + 12;
            const z1 = parts[i + 1].g.z + parts[i + 1].g.h - 12;
            const r = Math.min(p.g.w, parts[i + 1].g.w) / 2;
            const side = i % 2 === 0 ? 1 : -1;
            return (
              <Pipe
                key={`pipe-${p.id}`}
                from={[side * r * 0.5, r * 0.34, z0]}
                via={[side * r * 1.02, r * 1.32, (z0 + z1) / 2]}
                to={[side * r * 0.44, r * 0.36, z1]}
                color={PHASE_MAP[p.id].accent}
              />
            );
          })}

          {/* 附件机架 */}
          <Rack explode={explode} />

          {AUX_ORDER.map((id, i) => {
            const spec = CORE[id];
            const g: SlabGeom = { x: AUX_X - spec.w / 2, y: AUX_Y - spec.dep / 2, z: AUX_Z[i], w: spec.w, dep: spec.dep, h: spec.h };
            const p = { ...common(id), g };
            return (
              <g
                key={id}
                onClick={p.onSelect}
                style={{ cursor: 'pointer' }}
                data-phase={id}
                role="button"
                aria-label={`${PHASE_MAP[id].code} ${PHASE_MAP[id].title}`}
              >
                {id === 'e1' && <BreakerCartridge {...p} />}
                {id === 'e2' && <WeightDisc {...p} />}
                {id === 'e3' && <FaultValve {...p} />}
                <Leader id={id} g={g} snap={snap} selected={selected === id} side="right" shape="box" />
              </g>
            );
          })}

          {/* 六个主零件 */}
          {parts.map(({ id, g, spec }) => {
            const p = { ...common(id), g, shape: spec.shape, flutes: spec.flutes, shadow: explode };
            return (
              <g
                key={id}
                onClick={p.onSelect}
                style={{ cursor: 'pointer' }}
                data-phase={id}
                role="button"
                aria-label={`${PHASE_MAP[id].code} ${PHASE_MAP[id].title}`}
              >
                {id === 'm1' && <SensorArray {...p} />}
                {id === 'm2' && <DifferentialRings {...p} />}
                {id === 'm3' && <Manifold {...p} />}
                {id === 'm4' && <MatchingDrums {...p} />}
                {id === 'm5' && <ImpactTrough {...p} />}
                {id === 'm6' && <RecorderDrum {...p} />}
                <Stencil id={id} g={g} dim={dimOf(id)} shape={spec.shape} />
                <Leader id={id} g={g} snap={snap} selected={selected === id} side="left" shape={spec.shape} />
              </g>
            );
          })}

          {/* 订单载荷 */}
          <PacketLayer snap={snap} tick={tick} explode={explode} parts={parts.map((p) => p.g)} fills={fills} />
        </g>
      </g>
    </svg>
  );
}

/* ---------------- 台面网格 ---------------- */
function FloorGrid() {
  const xs = Array.from({ length: 13 }, (_, i) => -300 + i * 50);
  return (
    <g stroke="rgba(120,160,205,0.1)" strokeWidth={0.8} fill="none">
      {xs.map((v) => {
        const a = iso(v, -300, -8);
        const b = iso(v, 300, -8);
        return <line key={`x${v}`} x1={450 + a.x} y1={1024 + a.y} x2={450 + b.x} y2={1045 + b.y} opacity={v === 0 ? 0.7 : 0.42} />;
      })}
      {xs.map((v) => {
        const a = iso(-300, v, -8);
        const b = iso(300, v, -8);
        return <line key={`y${v}`} x1={450 + a.x} y1={1024 + a.y} x2={450 + b.x} y2={1045 + b.y} opacity={v === 0 ? 0.7 : 0.42} />;
      })}
    </g>
  );
}

/* ---------------- 跨零件管路 ---------------- */
type P3 = [number, number, number];

/** 三维二次贝塞尔采样后投影成屏幕路径：管路要绕过机身，所以用曲线而不是直线 */
function Pipe({ from, via, to, color }: { from: P3; via: P3; to: P3; color: string }) {
  const pt = (t: number) => {
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    return {
      x: a * from[0] + b * via[0] + c * to[0],
      y: a * from[1] + b * via[1] + c * to[1],
      z: a * from[2] + b * via[2] + c * to[2],
    };
  };
  const pts = Array.from({ length: 17 }, (_, k) => {
    const p = pt(k / 16);
    const s = iso(p.x, p.y, p.z);
    return `${k === 0 ? 'M' : 'L'}${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
  }).join(' ');
  return (
    <g pointerEvents="none" fill="none" strokeLinecap="round">
      <path d={pts} stroke="rgba(4,8,12,0.95)" strokeWidth={13} />
      <path d={pts} stroke="#2b3947" strokeWidth={10} />
      <path d={pts} stroke="rgba(168,198,228,0.28)" strokeWidth={10} opacity={0.5} transform="translate(0 -3)" />
      <path d={pts} stroke={color} strokeWidth={2.2} opacity={0.55} />
      {[0.18, 0.5, 0.82].map((t) => {
        const p = pt(t);
        const s = iso(p.x, p.y, p.z);
        return <circle key={t} cx={s.x} cy={s.y} r={7} fill="#141d27" stroke="rgba(180,206,234,0.35)" strokeWidth={2} />;
      })}
      <circle cx={iso(to[0], to[1], to[2]).x} cy={iso(to[0], to[1], to[2]).y} r={3} fill={color} opacity={0.9} />
    </g>
  );
}

/* ---------------- 主轴 + 联轴器 ---------------- */
function Shaft({ z0, z1, accent, explode }: { z0: number; z1: number; accent: string; explode: number }) {
  const { rx } = capRadii(52);
  // z0 是上方零件的底、z1 是下方零件的顶；屏幕 y 与 z 反向
  const top = -z0;
  const bot = -z1;
  const mid = (top + bot) / 2;
  const collars = explode > 0.12 ? 2 : 1;
  return (
    <g pointerEvents="none">
      <rect x={-rx} y={top} width={rx * 2} height={bot - top} fill="url(#cylShade)" opacity={0.95} />
      <rect x={-rx} y={top} width={rx * 2} height={bot - top} fill="none" stroke="rgba(150,180,215,0.18)" strokeWidth={0.8} />
      {Array.from({ length: collars }, (_, k) => {
        const y = collars === 1 ? mid : mid + (k === 0 ? -1 : 1) * Math.min(26, (bot - top) * 0.22);
        return (
          <g key={k}>
            <rect x={-rx * 1.55} y={y - 4} width={rx * 3.1} height={8} rx={1.5} fill="#2a3644" stroke="rgba(160,190,220,0.22)" strokeWidth={0.8} />
            <rect x={-rx * 1.55} y={y - 4} width={rx * 3.1} height={2} fill="rgba(200,225,250,0.22)" />
          </g>
        );
      })}
      <line x1={0} y1={top} x2={0} y2={bot} stroke="url(#spindle)" strokeWidth={2.6} opacity={0.6} strokeLinecap="round" />
      <circle cx={0} cy={mid} r={3.6} fill={accent} opacity={0.95} filter="url(#softGlow)" />
      <circle cx={0} cy={mid} r={9} fill="none" stroke={accent} strokeWidth={1} opacity={0.35} />
    </g>
  );
}

/* ---------------- 附件机架 ---------------- */
function Rack({ explode }: { explode: number }) {
  const x0 = AUX_X - 76;
  const x1 = AUX_X + 76;
  const yb = AUX_Y - 62;
  const zTop = AUX_Z[2] + 44 + 16;
  const p = (x: number, y: number, z: number) => iso(x, y, z);
  const a = p(x0, yb, -8);
  const b = p(x1, yb, -8);
  const a2 = p(x0, yb, zTop);
  const b2 = p(x1, yb, zTop);
  const pad = isoRect(x0 - 26, yb - 30, -9, x1 - x0 + 52, 96);
  return (
    <g pointerEvents="none" opacity={0.85}>
      <polygon points={pad} fill="#0c131c" stroke="rgba(120,150,185,0.18)" strokeWidth={1} />
      <line x1={a.x} y1={a.y} x2={a2.x} y2={a2.y} stroke="rgba(140,168,200,0.3)" strokeWidth={3.2} strokeLinecap="round" />
      <line x1={b.x} y1={b.y} x2={b2.x} y2={b2.y} stroke="rgba(140,168,200,0.3)" strokeWidth={3.2} strokeLinecap="round" />
      <line x1={a.x + 1} y1={a.y} x2={a2.x + 1} y2={a2.y} stroke="rgba(196,220,246,0.16)" strokeWidth={1} />
      <line x1={b.x + 1} y1={b.y} x2={b2.x + 1} y2={b2.y} stroke="rgba(196,220,246,0.16)" strokeWidth={1} />
      {AUX_Z.map((z) => {
        const s = p(x0, yb, z);
        const e = p(x1, yb, z);
        return <line key={z} x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="rgba(120,150,185,0.22)" strokeWidth={1.4} />;
      })}
      {/* 与主底座之间的一条搭接线 */}
      <line
        x1={iso(190, 112, -8).x}
        y1={iso(190, 112, -8).y}
        x2={iso(x0 - 20, yb + 80, -8).x}
        y2={iso(x0 - 20, yb + 80, -8).y}
        stroke="rgba(120,150,185,0.18)"
        strokeWidth={1}
        strokeDasharray="4 5"
        opacity={1 - explode * 0.4}
      />
    </g>
  );
}

function isoRect(x: number, y: number, z: number, w: number, dep: number): string {
  return (
    [
      [x, y, z],
      [x + w, y, z],
      [x + w, y + dep, z],
      [x, y + dep, z],
    ] as [number, number, number][]
  )
    .map(([px, py, pz]) => {
      const p = iso(px, py, pz);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');
}

/** 机身上的零件编号（屏幕空间绘制，沿面斜 30° 贴上去） */
function Stencil({ id, g, dim, shape }: { id: PhaseId; g: SlabGeom; dim: number; shape: 'box' | 'drum' }) {
  const meta = PHASE_MAP[id];
  const { rx } = capRadii(g.w);
  const c =
    shape === 'drum'
      ? { x: 0, y: -g.z - g.h * 0.5 }
      : iso(g.x + g.w * 0.5, g.y + g.dep, g.z + g.h * 0.5);
  const w = shape === 'drum' ? Math.min(28, rx * 0.42) : 13;
  return (
    <g transform={`translate(${c.x} ${c.y}) rotate(30)`} pointerEvents="none" opacity={(1 - dim * 0.62) * 0.6}>
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={shape === 'drum' ? 12 : 11}
        fill="rgba(206,226,246,0.6)"
        style={{ fontFamily: 'var(--f-mono)', letterSpacing: '0.26em' }}
      >
        {meta.code}
      </text>
      <rect x={-w} y={shape === 'drum' ? 10 : 9} width={w * 2} height={1.6} fill={meta.accent} opacity={0.8} />
    </g>
  );
}

/* ---------------- 引线 + 标签 ---------------- */
const COL_L = -262;
const COL_R = 500;

function Leader({
  id,
  g,
  snap,
  selected,
  side,
  shape,
}: {
  id: PhaseId;
  g: SlabGeom;
  snap: Snapshot;
  selected: boolean;
  side: 'left' | 'right';
  shape: 'box' | 'drum';
}) {
  const meta = PHASE_MAP[id];
  // 锚点取零件左上缘：圆筒是顶盖最左点，方箱是顶面左后角
  const { rx } = capRadii(g.w);
  const corner = iso(g.x, g.y + g.dep, g.z + g.h);
  const ax = shape === 'drum' ? -rx : corner.x;
  const ay = shape === 'drum' ? -g.z - g.h : corner.y;
  const dir = side === 'left' ? -1 : 1;
  // 引出臂走 30°（与等距轴同向），读作技术制图的引出线
  const d = 46;
  const p1x = ax + dir * d * C30;
  const p1y = ay - d * S30;
  const colX = side === 'left' ? COL_L : COL_R;
  const tx = colX - dir * 8;
  return (
    <g className={`leader ${selected ? 'is-on' : ''}`} pointerEvents="none">
      <polyline
        points={`${ax},${ay} ${p1x},${p1y} ${colX},${p1y}`}
        fill="none"
        stroke={selected ? meta.accent : 'rgba(122,150,183,0.4)'}
        strokeWidth={selected ? 1.4 : 1}
      />
      <circle cx={ax} cy={ay} r={3.2} fill={meta.accent} opacity={selected ? 1 : 0.65} />
      <rect x={colX - dir * 1.8} y={p1y - 5} width={3.4} height={10} fill={meta.accent} opacity={selected ? 1 : 0.55} />
      <text
        x={tx}
        y={p1y + 1.5}
        textAnchor={side === 'left' ? 'end' : 'start'}
        fill={selected ? meta.accent : 'rgba(214,229,244,0.9)'}
        fontSize={17}
        fontWeight={600}
        style={{ letterSpacing: '0.02em' }}
      >
        {meta.code} {meta.title}
      </text>
      <text
        x={tx}
        y={p1y + 19}
        textAnchor={side === 'left' ? 'end' : 'start'}
        fill="rgba(140,166,196,0.9)"
        fontSize={13.5}
        style={{ fontFamily: 'var(--f-mono)' }}
      >
        {readoutOf(id, snap)}
      </text>
    </g>
  );
}
