import type { ReactNode } from 'react';
import { C30, S30, boxCorners, leftM, poly, rightM, topM } from '../../core/iso';
/**
 * 等距零件的原子图元。
 *
 * 一个零件 = 一体机身（方箱 / 圆筒）+ 若干在面坐标里画的细节。
 * 面上细节统一用「单位坐标」(0..1) 描述，由 topM/leftM/rightM 矩阵投影，
 * 这样齿轮、雷达盘、液面这些圆形细节不必手算椭圆参数就能贴合透视。
 *
 * 为什么要有圆筒：
 *   六个零件如果全是同尺寸方箱，堆起来只会读成「一摞托盘」。
 *   真实发动机拆开看，是一堆**直径各异的圆筒**（缸体、鼓轮、滤芯）
 *   混着少数方箱（歧管、油底壳）。剪影一变，装配体的身份就成立了。
 */

export interface SlabGeom {
  x: number;
  y: number;
  z: number;
  w: number;
  dep: number;
  h: number;
}

export interface SlabProps extends SlabGeom {
  /** 机身形态：方箱 / 圆筒（圆筒要求 w === dep，顶盖为等距椭圆） */
  shape?: 'box' | 'drum';
  /** 金属明度档位：标准 / 深色底座 / 亮色顶盖 */
  tone?: 'base' | 'dark' | 'light' | 'steel';
  /** 顶部高光描边 */
  edge?: boolean;
  /** 激活时沿棱线走一道光 */
  live?: boolean;
  accent?: string;
  /** 零件下方溢出的同色辉光，制造「部件悬空」的拆解感 */
  glow?: boolean;
  /** 0..1：悬空时在下方投出的接触阴影强度 */
  shadow?: number;
  /** 筒壁上的纵向棱数（0 = 光筒） */
  flutes?: number;
  children?: ReactNode;
  opacity?: number;
}

const TONE = {
  base: { top: '#46586d', left: '#151d27', right: '#222d3a' },
  dark: { top: '#3a4857', left: '#111820', right: '#1b252f' },
  light: { top: '#52647b', left: '#19222c', right: '#27333f' },
  steel: { top: '#5b6d84', left: '#1d2731', right: '#2b3846' },
};

/** 方箱机身 */
export function Slab({ x, y, z, w, dep, h, shape = 'box', tone = 'base', edge = true, live, accent, glow, shadow = 0, flutes = 0, children, opacity }: SlabProps) {
  if (shape === 'drum') return <Drum x={x} y={y} z={z} w={w} dep={dep} h={h} tone={tone} live={live} accent={accent} glow={glow} shadow={shadow} flutes={flutes} opacity={opacity}>{children}</Drum>;

  const c = boxCorners(x, y, z, w, dep, h);
  const t = TONE[tone];
  const bottomPts: [number, number, number][] = [
    [x, y, z],
    [x + w, y, z],
    [x + w, y + dep, z],
    [x, y + dep, z],
  ];
  const bottom = poly(bottomPts);
  return (
    <g opacity={opacity}>
      {/* 底部溢光：拆解状态下每块零件都像被自己的光照亮下方 */}
      {glow && accent && <polygon points={bottom} fill={accent} opacity={0.14} transform="translate(0 6)" />}
      {/* 底沿发光缝：必须画在三个面之前，否则背面那两条棱会透过机身画到正面来 */}
      {accent && <polygon points={bottom} fill="none" stroke={accent} strokeWidth={2.4} opacity={live ? 0.8 : 0.4} strokeLinejoin="round" />}
      <polygon points={poly(c.left)} fill={t.left} />
      <polygon points={poly(c.right)} fill={t.right} />
      {/* 两个侧面的倒角带：顶部略亮，机械加工的「棱」 */}
      <polygon points={poly(chamfer(c.left, h * 0.07))} fill="rgba(196,220,246,0.08)" />
      <polygon points={poly(chamfer(c.right, h * 0.07))} fill="rgba(196,220,246,0.055)" />
      <polygon points={poly(c.top)} fill={t.top} />
      {/* 顶面受光池 */}
      <polygon points={poly(c.top)} fill="url(#toppool)" />
      {accent && (
        <polyline
          points={poly([c.top[3], c.top[0], c.top[1]])}
          fill="none"
          stroke={accent}
          strokeWidth={live ? 2.2 : 1.6}
          opacity={live ? 0.9 : 0.38}
          strokeLinejoin="round"
        />
      )}
      {accent && (
        <polygon points={bottom} fill="none" stroke={accent} strokeWidth={1.1} opacity={live ? 0.7 : 0.3} strokeLinejoin="round" />
      )}
      {edge && (
        <g fill="none" strokeLinejoin="round">
          <polygon points={poly(c.top)} stroke="rgba(160,190,220,0.22)" strokeWidth={1} />
          <polyline points={poly([c.top[3], c.top[2], c.top[1]])} stroke="rgba(206,228,250,0.42)" strokeWidth={1.2} />
          <polyline points={poly([c.top[3], c.left[3], c.right[2]])} stroke="rgba(4,7,11,0.9)" strokeWidth={1} />
        </g>
      )}
      {live && accent && (
        <polygon points={poly(c.top)} fill="none" stroke={accent} strokeWidth={1.4} opacity={0.85} className="edge-live" />
      )}
      {shadow > 0 && <ContactShadow x={x} y={y} z={z} w={w} dep={dep} k={shadow} />}
      {children}
    </g>
  );
}

/* ---------------- 圆筒 ---------------- */

/** 侧面上沿的一条窄带（把顶面四点上移 dz 后与原点围成的四边形） */
function chamfer(face: [number, number, number][], dz: number): [number, number, number][] {
  const up = (p: [number, number, number]): [number, number, number] => [p[0], p[1], p[2] - dz];
  return [face[0], face[1], up(face[1]), up(face[0])];
}

/** 方形足迹的圆筒：顶盖是轴对齐等距椭圆，半轴只与半径有关 */
export function capRadii(w: number) {
  const r = w / 2;
  return { r, rx: C30 * Math.SQRT2 * r, ry: S30 * Math.SQRT2 * r };
}

function Drum({
  x,
  y,
  z,
  w,
  h,
  tone = 'base',
  live,
  accent,
  glow,
  shadow = 0,
  flutes = 0,
  opacity,
  children,
}: SlabProps) {
  const { rx, ry } = capRadii(w);
  // 圆心是足迹中心 (x+w/2, y+w/2)，不是角点——差半步会让整个筒体错位
  const mx = x + w / 2;
  const my = y + w / 2;
  const cx = (mx - my) * C30;
  const cyTop = (mx + my) * S30 - (z + h);
  const cyBot = cyTop + h;
  const t = TONE[tone];

  // 筒壁：顶盖下半弧 → 两侧竖直 → 底盖下半弧
  const wall = `M${cx - rx} ${cyTop}L${cx - rx} ${cyBot}A${rx} ${ry} 0 0 0 ${cx + rx} ${cyBot}L${cx + rx} ${cyTop}A${rx} ${ry} 0 0 1 ${cx - rx} ${cyTop}Z`;

  // 纵向棱：φ∈(0,π) 是朝向观众的那半圈，越靠中间越正对光源
  const ribs = Array.from({ length: flutes }, (_, i) => {
    const phi = (Math.PI * i) / Math.max(1, flutes - 1);
    const px = cx + rx * Math.cos(phi);
    const pyTop = cyTop + ry * Math.sin(phi);
    return { px, pyTop, pyBot: pyTop + h, k: Math.sin(phi) };
  });

  // 底沿的一点椭圆弧，用于「底面着地」的暗线
  const foot = `M${cx - rx} ${cyBot}A${rx} ${ry} 0 0 0 ${cx + rx} ${cyBot}`;

  return (
    <g opacity={opacity}>
      {glow && accent && <ellipse cx={cx} cy={cyBot + 8} rx={rx * 0.9} ry={ry * 0.9} fill={accent} opacity={0.16} />}
      {accent && <path d={foot} fill="none" stroke={accent} strokeWidth={2.4} opacity={live ? 0.8 : 0.4} strokeLinecap="round" />}
      <path d={wall} fill="url(#cylShade)" />
      {/* 筒身明暗底：让暗档位也能被一眼认成金属 */}
      <path d={wall} fill={t.left} opacity={0.42} />
      {/* 纵向棱 */}
      {ribs.map((r, i) => (
        <line
          key={i}
          x1={r.px}
          y1={r.pyTop + 1}
          x2={r.px}
          y2={r.pyBot - 1}
          stroke="rgba(4,7,11,0.55)"
          strokeWidth={1.4}
          opacity={r.k}
        />
      ))}
      {ribs.map((r, i) => (
        <line key={`h${i}`} x1={r.px + 1} y1={r.pyTop + 1} x2={r.px + 1} y2={r.pyBot - 1} stroke="rgba(196,220,244,0.13)" strokeWidth={1} opacity={r.k} />
      ))}
      {/* 上下两道箍 */}
      <path d={foot} fill="none" stroke="rgba(4,7,11,0.85)" strokeWidth={1.2} />
      <path d={`M${cx - rx} ${cyTop}A${rx} ${ry} 0 0 0 ${cx + rx} ${cyTop}`} fill="none" stroke="rgba(6,10,15,0.5)" strokeWidth={1.4} />
      {accent && <path d={foot} fill="none" stroke={accent} strokeWidth={1.1} opacity={live ? 0.7 : 0.32} />}
      {/* 顶盖 */}
      <ellipse cx={cx} cy={cyTop} rx={rx} ry={ry} fill={t.top} />
      <ellipse cx={cx} cy={cyTop} rx={rx} ry={ry} fill="url(#capShade)" />
      {/* 顶盖倒角：内缩一圈的细环，读作「盖板嵌进筒口」 */}
      <ellipse cx={cx} cy={cyTop} rx={rx * 0.965} ry={ry * 0.965} fill="none" stroke="rgba(206,228,250,0.26)" strokeWidth={1.1} />
      <path
        d={`M${cx - rx * 0.99} ${cyTop}A${rx * 0.99} ${ry * 0.99} 0 0 1 ${cx} ${cyTop - ry * 0.99}`}
        fill="none"
        stroke="rgba(226,242,255,0.55)"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <ellipse cx={cx} cy={cyTop - 1.6} rx={rx * 0.985} ry={ry * 0.985} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
      {accent && (
        <path
          d={`M${cx - rx * 0.99} ${cyTop}A${rx * 0.99} ${ry * 0.99} 0 0 0 ${cx + rx * 0.99} ${cyTop}`}
          fill="none"
          stroke={accent}
          strokeWidth={live ? 2.6 : 1.8}
          opacity={live ? 0.95 : 0.4}
          strokeLinecap="round"
        />
      )}
      {shadow > 0 && <SoftShadow cx={cx} cy={cyBot + 6} rx={rx * 1.02} ry={ry * 1.02} k={shadow} />}
      {children}
    </g>
  );
}

/** 悬空时的接触阴影：落在下方某个假想面上的一团暗 */
function ContactShadow({ x, y, z, w, dep, k }: { x: number; y: number; z: number; w: number; dep: number; k: number }) {
  const a = (x + w / 2 - (y + dep / 2)) * C30;
  const b = (x + w / 2 + y + dep / 2) * S30 - z;
  return <SoftShadow cx={a} cy={b + 30} rx={w * 0.66} ry={dep * 0.32} k={k} />;
}

function SoftShadow({ cx, cy, rx, ry, k }: { cx: number; cy: number; rx: number; ry: number; k: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#dropFade)" opacity={0.8 * k} pointerEvents="none" />;
}

/** 顶面坐标容器：children 用 0..1 的 u/v 画 */
export function TopFace({ geom, children }: { geom: SlabGeom; children: ReactNode }) {
  const { x, y, z, w, dep, h } = geom;
  return <g transform={topM(x, y, z, w, dep, h)}>{children}</g>;
}

/** 圆筒顶盖裁剪：任何越出筒口的细节都会被切掉，看起来才像「嵌进盖板」 */
export function CapClip({ children }: { children: ReactNode }) {
  return <g clipPath="url(#capClip)">{children}</g>;
}

/**
 * 圆筒正面的表板。
 *
 * 圆筒没有平面可用，leftM/rightM 算出来的是外接方箱的侧面，
 * 细节会飘到筒身外面去。所以在筒壁上嵌一块面板，把指示灯、条形表
 * 直接画成屏幕像素（不做透视压缩）——这正是真实机组的做法。
 * children 收到面板的 px 宽高，用像素坐标绘制。
 */
export function WallPlate({
  geom,
  w = 0.56,
  v0 = 0.3,
  v1 = 0.9,
  children,
}: {
  geom: SlabGeom;
  w?: number;
  v0?: number;
  v1?: number;
  children: (w: number, h: number) => ReactNode;
}) {
  const { rx } = capRadii(geom.w);
  const cyTop = -geom.z - geom.h;
  const W = rx * 2 * w;
  const H = geom.h * (v1 - v0);
  const x0 = -W / 2;
  const y0 = cyTop + geom.h * v0;
  return (
    <g transform={`translate(${x0} ${y0})`}>
      <rect x={0} y={0} width={W} height={H} rx={3} fill="rgba(5,9,14,0.62)" stroke="rgba(150,180,212,0.2)" strokeWidth={0.9} />
      <rect x={1} y={1} width={W - 2} height={1.4} fill="rgba(196,222,248,0.14)" />
      {children(W, H)}
    </g>
  );
}

/** 左前侧面容器：u 沿 +x（0..1），v 沿 +z（0 底部） */
export function LeftFace({ geom, children }: { geom: SlabGeom; children: ReactNode }) {
  const { x, y, z, w, dep, h } = geom;
  return <g transform={leftM(x, y, z, w, dep, h)}>{children}</g>;
}

/** 右侧面容器：u 沿 +y，v 沿 +z */
export function RightFace({ geom, children }: { geom: SlabGeom; children: ReactNode }) {
  const { x, y, z, w, dep, h } = geom;
  return <g transform={rightM(x, y, z, w, dep, h)}>{children}</g>;
}

/** 顶面四角螺钉（位置在顶面内侧留边） */
export function Bolts({ i = 0.045, color = 'rgba(150,172,198,0.45)' }: { i?: number; color?: string }) {
  const pts: [number, number][] = [
    [i, i],
    [1 - i, i],
    [1 - i, 1 - i],
    [i, 1 - i],
  ];
  return (
    <g>
      {pts.map(([u, v], k) => (
        <circle key={k} cx={u} cy={v} r={0.014} fill="none" stroke={color} strokeWidth={0.004} />
      ))}
    </g>
  );
}

/** 一圈螺钉：沿单位圆均布，用于筒体顶盖 */
export function BoltRing({ count = 8, r = 0.44, size = 0.013, color = 'rgba(178,200,226,0.5)' }: { count?: number; r?: number; size?: number; color?: string }) {
  return (
    <g>
      {Array.from({ length: count }, (_, k) => {
        const a = (k / count) * Math.PI * 2;
        return <circle key={k} cx={0.5 + Math.cos(a) * r} cy={0.5 + Math.sin(a) * r} r={size} fill="none" stroke={color} strokeWidth={0.004} />;
      })}
    </g>
  );
}

/** 侧面散热格栅：v 方向的细长槽 */
export function Vents({
  u0 = 0.06,
  u1 = 0.94,
  v0 = 0.18,
  v1 = 0.78,
  count = 14,
  color = 'rgba(8,12,17,0.55)',
}: {
  u0?: number;
  u1?: number;
  v0?: number;
  v1?: number;
  count?: number;
  color?: string;
}) {
  const step = (u1 - u0) / count;
  return (
    <g>
      {Array.from({ length: count }, (_, k) => (
        <rect key={k} x={u0 + k * step + step * 0.3} y={v0} width={step * 0.34} height={v1 - v0} fill={color} />
      ))}
    </g>
  );
}

/** 面上一行状态灯 */
export function Leds({
  u0 = 0.06,
  u1 = 0.94,
  v = 0.86,
  count = 6,
  values,
  accent = '#38e1ff',
  r = 0.022,
}: {
  u0?: number;
  u1?: number;
  v?: number;
  count?: number;
  values: number[];
  accent?: string;
  r?: number;
}) {
  const step = (u1 - u0) / Math.max(1, count - 1);
  return (
    <g>
      {Array.from({ length: count }, (_, k) => {
        const val = values[k] ?? 0;
        const on = Math.abs(val);
        return <circle key={k} cx={u0 + k * step} cy={v} r={r} fill={accent} opacity={0.12 + Math.min(0.85, on * 1.6)} />;
      })}
    </g>
  );
}

/** 面上的一条细长刻度带（用于进度/仓位等） */
export function GaugeBar({
  value,
  u0 = 0.06,
  u1 = 0.94,
  v = 0.9,
  hh = 0.028,
  color = '#38e1ff',
  track = 'rgba(6,10,15,0.75)',
}: {
  value: number;
  u0?: number;
  u1?: number;
  v?: number;
  hh?: number;
  color?: string;
  track?: string;
}) {
  const w = (u1 - u0) * Math.max(0, Math.min(1, value));
  return (
    <g>
      <rect x={u0} y={v} width={u1 - u0} height={hh} fill={track} />
      <rect x={u0} y={v} width={w} height={hh} fill={color} opacity={0.92} />
    </g>
  );
}

/** 面上的文字（会自动被投影压扁，只用于极短标签） */
export function FaceLabel({
  u,
  v,
  text,
  size = 0.055,
  fill = 'rgba(200,216,235,0.65)',
  anchor = 'middle',
}: {
  u: number;
  v: number;
  text: string;
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <text x={u} y={v} fontSize={size} fill={fill} textAnchor={anchor} style={{ fontFamily: 'var(--f-mono)', letterSpacing: '0.02em' }}>
      {text}
    </text>
  );
}
