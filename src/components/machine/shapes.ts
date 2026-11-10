/**
 * 面坐标（单位正方形）里的机械形状生成器。
 * 全部返回 path / points 字符串，交给 IsoParts 的 TopFace/LeftFace 矩阵投影，
 * 因此这里的坐标系一律是 [0,1]²，不要写成像素。
 */

/** 齿轮：外圈方齿 + 中心轴孔，phase 控制初始咬合角 */
export function gearPath(
  cx: number,
  cy: number,
  rOut: number,
  rIn: number,
  teeth: number,
  phase = 0,
): string {
  const step = (Math.PI * 2) / teeth;
  const half = step * 0.34;
  const parts: string[] = [];
  for (let i = 0; i < teeth; i += 1) {
    const a = i * step + phase;
    const pts: [number, number][] = [
      [cx + Math.cos(a - half) * rIn, cy + Math.sin(a - half) * rIn],
      [cx + Math.cos(a - half * 0.9) * rOut, cy + Math.sin(a - half * 0.9) * rOut],
      [cx + Math.cos(a + half * 0.9) * rOut, cy + Math.sin(a + half * 0.9) * rOut],
      [cx + Math.cos(a + half) * rIn, cy + Math.sin(a + half) * rIn],
    ];
    pts.forEach(([px, py], k) => {
      parts.push(`${i === 0 && k === 0 ? 'M' : 'L'}${px.toFixed(4)} ${py.toFixed(4)}`);
    });
  }
  parts.push('Z');
  return parts.join(' ');
}

/** 圆环（用 path 画，避免椭圆缩放误差）：返回带孔环的 path */
export function ringPath(cx: number, cy: number, r: number, thickness: number): string {
  const ri = r - thickness;
  return [
    `M${cx + r} ${cy}`,
    `A${r} ${r} 0 1 1 ${cx - r} ${cy}`,
    `A${r} ${r} 0 1 1 ${cx + r} ${cy}`,
    `Z`,
    `M${cx + ri} ${cy}`,
    `A${ri} ${ri} 0 1 0 ${cx - ri} ${cy}`,
    `A${ri} ${ri} 0 1 0 ${cx + ri} ${cy}`,
    `Z`,
  ].join(' ');
}

/** 环形刻度带 */
export function tickRing(
  cx: number,
  cy: number,
  r: number,
  count: number,
  len: number,
  phase = 0,
): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + phase;
    const x0 = cx + Math.cos(a) * r;
    const y0 = cy + Math.sin(a) * r;
    const x1 = cx + Math.cos(a) * (r - len);
    const y1 = cy + Math.sin(a) * (r - len);
    parts.push(`M${x0.toFixed(4)} ${y0.toFixed(4)}L${x1.toFixed(4)} ${y1.toFixed(4)}`);
  }
  return parts.join(' ');
}

/** 扇形（雷达扫描） */
export function wedgePath(cx: number, cy: number, r: number, from: number, to: number): string {
  const x0 = cx + Math.cos(from) * r;
  const y0 = cy + Math.sin(from) * r;
  const x1 = cx + Math.cos(to) * r;
  const y1 = cy + Math.sin(to) * r;
  return `M${cx} ${cy}L${x0.toFixed(4)} ${y0.toFixed(4)}A${r} ${r} 0 0 1 ${x1.toFixed(4)} ${y1.toFixed(4)}Z`;
}

/** 波浪液面：在 [u0,u1]×v 上叠加 amp 振幅的正弦 */
export function liquidPath(
  u0: number,
  u1: number,
  v: number,
  amp: number,
  waves: number,
  phase: number,
): string {
  const steps = 26;
  const top: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = u0 + (u1 - u0) * t;
    const y = v + Math.sin(t * Math.PI * 2 * waves + phase) * amp;
    top.push(`${i === 0 ? 'M' : 'L'}${u.toFixed(4)} ${y.toFixed(4)}`);
  }
  return `${top.join(' ')}L${u1.toFixed(4)} ${(v + amp * 2.2).toFixed(4)}L${u0.toFixed(4)} ${(
    v +
    amp * 2.2
  ).toFixed(4)}Z`;
}

/** 一条折线：把任意数值序列映射到面坐标窗口 */
export function tracePath(values: number[], u0: number, v0: number, w: number, h: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((val, i) => {
      const u = u0 + (i / (values.length - 1)) * w;
      const v = v0 + (1 - (val - min) / span) * h;
      return `${i === 0 ? 'M' : 'L'}${u.toFixed(4)} ${v.toFixed(4)}`;
    })
    .join(' ');
}

/** 矩形（面坐标） */
export function rectPath(u: number, v: number, w: number, h: number): string {
  return `M${u} ${v}h${w}v${h}h${-w}Z`;
}
