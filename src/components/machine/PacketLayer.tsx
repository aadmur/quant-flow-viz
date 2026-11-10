import type { ReactNode } from 'react';
import type { Fill, Snapshot } from '../../core/types';
import type { SlabGeom } from './IsoParts';
import { clamp } from '../../core/format';

type Geom = SlabGeom & { w: number; dep: number; h: number };

/**
 * 订单载荷层。
 *
 * 机身坐标里所有零件的中心都在 (0,0,z)，投影后落在屏幕的 x=0 竖线上，
 * 所以「订单流」就是沿这条竖线上下移动的光胶囊：
 *   母单从 M2 落进 M3 → 在 M3 分液成 N 颗子胶囊 → 落进 M4 被咬合成交。
 * 这一层画在零件之上，读作「透过机壳看到的内部物流」。
 */
export function PacketLayer({
  snap,
  tick,
  parts,
  fills,
  explode,
}: {
  snap: Snapshot;
  tick: number;
  parts: Geom[];
  fills: Fill[];
  explode: number;
}) {
  const zTop = (i: number) => parts[i].z + parts[i].h;
  const zBot = (i: number) => parts[i].z;
  const yOf = (z: number) => -z;

  const nodes: ReactNode[] = [];
  const parent = snap.parent;

  /* ---- 母单：M2 底部 → M3 顶部 ---- */
  if (parent) {
    const age = tick - parent.createdTick;
    const t = clamp(age / 7, 0, 1);
    const y0 = yOf(zBot(1));
    const y1 = yOf(zTop(2));
    const y = y0 + (y1 - y0) * t;
    const done = t >= 1;
    nodes.push(
      <g key="mother" opacity={done ? 0.35 : 1}>
        <line x1={0} y1={y - 16} x2={0} y2={y} stroke="#ffb020" strokeWidth={1.6} opacity={0.35} />
        <rect x={-6} y={y - 5} width={12} height={18} rx={4} fill="#ffb020" opacity={0.92} filter="url(#softGlow)" />
        <rect x={-3} y={y - 2} width={6} height={12} rx={2} fill="#fff4dd" opacity={0.85} />
      </g>,
    );
  }

  /* ---- 子单：M3 底部 → M4 顶部，横向按序号分开 ---- */
  if (parent) {
    const kids = parent.children.slice(0, 16);
    const n = Math.max(1, kids.length);
    kids.forEach((c, i) => {
      if (c.scheduledTick > tick) return;
      const span = Math.max(4, Math.min(26, c.expireTick - c.scheduledTick));
      const age = tick - c.scheduledTick;
      const raw = clamp(age / span, 0, 1);
      const stuck = c.status === 'rejected' || c.status === 'blocked' || c.status === 'cancelled';
      const t = stuck ? Math.min(raw, 0.55) : raw;
      const y0 = yOf(zBot(2));
      const y1 = yOf(zTop(3));
      const spread = (i - (n - 1) / 2) * (14 - Math.min(8, n * 0.25));
      // 分液时先横向散开，再收拢进滚筒（用一条二次曲线近似）
      const x = spread * Math.sin(Math.PI * clamp(t, 0, 1)) * 1.15;
      const y = y0 + (y1 - y0) * t;
      const filled = c.status === 'filled';
      const color = stuck ? '#ff4d63' : filled ? '#17cf8d' : '#ffd089';
      const fade = filled ? clamp(1 - (age - span) / 4, 0.15, 1) : 1;
      nodes.push(
        <g key={c.id} opacity={fade}>
          <rect
            x={x - 3.4}
            y={y - 3}
            width={6.8}
            height={11}
            rx={3}
            fill={color}
            opacity={0.9}
            filter={filled ? 'url(#softGlow)' : undefined}
          />
          {filled && <circle cx={x} cy={y + 5} r={7} fill="none" stroke={color} strokeWidth={1.2} opacity={0.6} />}
        </g>,
      );
    });
  }

  /* ---- 成交火花：M4 咬合点 ---- */
  const recent = fills.filter((f) => tick - f.tick >= 0 && tick - f.tick <= 3);
  recent.forEach((f) => {
    const k = 1 - (tick - f.tick) / 4;
    const y = yOf(zBot(3)) - parts[3].h * 0.5;
    nodes.push(
      <g key={`spark-${f.id}`} opacity={k}>
        <circle cx={0} cy={y} r={4 + (1 - k) * 16} fill="none" stroke="#eaf7ff" strokeWidth={1.6} />
        <circle cx={0} cy={y} r={2.4} fill="#ffffff" />
        <text
          x={12 + (1 - k) * 26}
          y={y - 4}
          fill="#17cf8d"
          fontSize={10}
          opacity={k}
          style={{ fontFamily: 'var(--f-mono)' }}
        >
          +{f.qty}
        </text>
      </g>,
    );
  });

  /* ---- 冲击羽流：M5 顶部往上的扰动 ---- */
  const imp = Math.min(1, snap.impact.totalBps / 34);
  if (imp > 0.02) {
    const base = yOf(zTop(4));
    [0, 1, 2].forEach((k) => {
      const wob = Math.sin((tick + k * 4) * 0.3) * 7;
      nodes.push(
        <path
          key={`plume-${k}`}
          d={`M${-14 + k * 14} ${base} q ${wob} -14 ${wob * 0.4} -26`}
          fill="none"
          stroke="#fb7a3c"
          strokeWidth={1.4}
          opacity={0.15 + imp * 0.5}
          strokeLinecap="round"
        />,
      );
    });
  }

  return (
    <g className="packet-layer" pointerEvents="none" opacity={1 - explode * 0.25}>
      {nodes}
    </g>
  );
}
