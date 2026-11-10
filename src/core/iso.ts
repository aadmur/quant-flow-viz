/**
 * 等距投影（isometric projection）工具。
 *
 * 拆解台里的每个零件都是「一块被投影到屏幕的立方体」：
 *   iso(x, y, z) = ((x - y)·cos30, (x + y)·sin30 - z)
 * x 轴向右下、y 轴向左下、z 轴向上。屏幕坐标原点在装配体中心轴的底端。
 *
 * 除了点投影，这里还导出三个「面矩阵」：把 [0,1]² 的单位正方形映射到
 * 立方体某个可见面上。有了它，齿轮、雷达盘、液面这些圆形/曲线细节
 * 就可以直接在单位空间里画，由矩阵负责压扁成等距椭圆，
 * 不需要为每个面手算椭圆的 rx/ry/旋转角。
 */

export const C30 = Math.cos(Math.PI / 6);
export const S30 = 0.5;

export interface Pt {
  x: number;
  y: number;
}

export function iso(x: number, y: number, z: number): Pt {
  return { x: (x - y) * C30, y: (x + y) * S30 - z };
}

/** 一组三维点 → SVG polygon 的 points 字符串 */
export function poly(points: [number, number, number][]): string {
  return points
    .map(([x, y, z]) => {
      const p = iso(x, y, z);
      return `${round(p.x)},${round(p.y)}`;
    })
    .join(' ');
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 轴对齐立方体的八个顶点 */
export function boxCorners(x: number, y: number, z: number, w: number, dep: number, h: number) {
  const x1 = x + w;
  const y1 = y + dep;
  const z1 = z + h;
  return {
    top: [
      [x, y, z1],
      [x1, y, z1],
      [x1, y1, z1],
      [x, y1, z1],
    ] as [number, number, number][],
    /** 朝向 +y 的侧面（屏幕左前） */
    left: [
      [x, y1, z1],
      [x1, y1, z1],
      [x1, y1, z],
      [x, y1, z],
    ] as [number, number, number][],
    /** 朝向 +x 的侧面（屏幕右侧） */
    right: [
      [x1, y1, z1],
      [x1, y, z1],
      [x1, y, z],
      [x1, y1, z],
    ] as [number, number, number][],
  };
}

/**
 * 顶面矩阵：把 (u,v) ∈ [0,1]² 映射到 z = z+h 的顶面。
 * 用法：<g transform={topM(...)}> 里面按 0..1 坐标画图。
 */
export function topM(x: number, y: number, z: number, w: number, dep: number, h: number): string {
  const e = (x - y) * C30;
  const f = (x + y) * S30 - (z + h);
  return `matrix(${n(w * C30)} ${n(w * S30)} ${n(-dep * C30)} ${n(dep * S30)} ${n(e)} ${n(f)})`;
}

/** 左前侧面矩阵：u 沿 +x，v 沿 +z（v=0 在底部） */
export function leftM(x: number, y: number, z: number, w: number, dep: number, h: number): string {
  const y1 = y + dep;
  const e = (x - y1) * C30;
  const f = (x + y1) * S30 - z;
  return `matrix(${n(w * C30)} ${n(w * S30)} 0 ${n(-h)} ${n(e)} ${n(f)})`;
}

/** 右侧面矩阵：u 沿 +y，v 沿 +z */
export function rightM(x: number, y: number, z: number, w: number, dep: number, h: number): string {
  const x1 = x + w;
  const e = (x1 - y) * C30;
  const f = (x1 + y) * S30 - z;
  return `matrix(${n(-dep * C30)} ${n(dep * S30)} 0 ${n(-h)} ${n(e)} ${n(f)})`;
}

function n(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** 顶面上任意点（单位坐标）→ 屏幕点，用于引线端点计算 */
export function topPoint(x: number, y: number, z: number, w: number, dep: number, h: number, u: number, v: number): Pt {
  return iso(x + u * w, y + v * dep, z + h);
}

/** 一条竖直线段（用于主轴、导管），返回屏幕坐标两端 */
export function vert(x: number, y: number, z0: number, z1: number): { a: Pt; b: Pt } {
  return { a: iso(x, y, z0), b: iso(x, y, z1) };
}

/** 在顶面单位空间里画一个「圆」——直接给出 ellipse 的 rx/ry 与倾斜角 */
export function topEllipse(w: number, dep: number, r: number) {
  // 单位圆在顶面矩阵下的像是一个椭圆：半径 r 沿两条基向量
  const ax = w * C30;
  const ay = w * S30;
  const bx = -dep * C30;
  const by = dep * S30;
  const rx = Math.hypot(ax, ay) * r;
  const ry = Math.hypot(bx, by) * r;
  // 主轴方向取两基向量夹角平分线
  const ang = (Math.atan2(ay, ax) + Math.atan2(by, bx)) / 2;
  return { rx, ry, rotate: (ang * 180) / Math.PI };
}

/** 折线路径 */
export function linePath(points: Pt[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join(' ');
}

/** 三次贝塞尔：用于胶囊沿主轴的飞行轨迹 */
export function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}
