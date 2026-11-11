import { useEffect, useMemo, useRef, useState } from 'react';
import './cinema.css';

const DURATION = 11800;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

interface PaperSpec { x: number; y: number; r: number; delay: number; drift: number; size: number }

export default function CinematicIntro({ onComplete }: { onComplete: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const done = useRef(false);
  const papers = useMemo<PaperSpec[]>(() => Array.from({ length: 13 }, (_, i) => ({
    // 起点铺在街面左下那一摞附近，散开到 14%~40%，才像「一摞纸被风掀起」而不是几个点
    x: 14 + (i % 5) * 6.4,
    y: 77 + (i % 3) * 3.2,
    r: -18 + i * 7,
    delay: (i % 7) * 0.018,
    drift: Math.sin(i * 2.17) * 13,
    size: 0.78 + (i % 4) * 0.12,
  })), []);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onComplete();
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = Math.min(DURATION, now - start);
      setElapsed(t);
      if (t >= DURATION && !done.current) {
        done.current = true;
        onComplete();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  const p = elapsed / DURATION;
  const turn = smooth(0.29, 0.56, p);
  const enter = smooth(0.61, 0.85, p);
  const hall = smooth(0.66, 0.82, p);
  const flash = Math.exp(-Math.pow((p - 0.865) / 0.026, 2));
  const titleOpacity = smooth(0.02, 0.08, p) * (1 - smooth(0.25, 0.36, p));
  const paperTitle = smooth(0.37, 0.45, p) * (1 - smooth(0.63, 0.72, p));
  const enterTitle = smooth(0.71, 0.77, p) * (1 - smooth(0.83, 0.86, p));
  // 纸被吸进门洞的那一刻，门里先亮起来——白光闪切才有来处，不是凭空一闪
  const doorGlow = smooth(0.5, 0.74, p);

  return (
    <section className="cinema" aria-label="华尔街电影式开场">
      <div
        className="cinema-street"
        style={{ transform: `scale(${1.035 + p * 0.53 + enter * 0.35}) translate3d(${turn * 2.5}%, ${turn * -1.5}%, 0) rotate(${turn * -2.4}deg)` }}
      />
      <div className="cinema-door-glow" style={{ opacity: doorGlow * 0.8 }} />
      <div className="cinema-ghost cinema-ghost-left" style={{ transform: `translateX(${-turn * 12}%)` }} />
      <div className="cinema-ghost cinema-ghost-right" style={{ transform: `translateX(${turn * 12}%)` }} />
      <div
        className="cinema-hall"
        style={{ opacity: hall, transform: `scale(${1.18 - enter * 0.12})` }}
      />
      <div className="cinema-vignette" />
      <div className="cinema-grain" />

      <div className="cinema-title" style={{ opacity: titleOpacity, transform: `translateY(${(1 - titleOpacity) * 24}px)` }}>
        <span>NEW YORK · 08:47 AM</span>
        <h1>WALL<br />STREET</h1>
        <p>每一场全球市场的风暴，<br />都曾从一张纸开始。</p>
      </div>

      <div className="cinema-paper-story" style={{ opacity: paperTitle }}>
        <span>THE CERTIFICATE BECOMES A SIGNAL</span>
        <strong>让股票，带你进入交易。</strong>
      </div>

      <div className="wind-lines" style={{ opacity: smooth(0.34, 0.43, p) * (1 - smooth(0.7, 0.8, p)) }} aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ top: `${28 + i * 7}%`, animationDelay: `${i * -0.23}s` }} />)}
      </div>

      <div className="paper-flight" aria-hidden="true">
        {papers.map((spec, i) => {
          const t = clamp((p - 0.33 - spec.delay) / 0.37);
          const arc = Math.sin(Math.PI * t);
          // 终点取「镜头推到最近时」门洞在视口里的位置（约 51% / 77%）：
          // 街景层自己带 scale，固定在 50%/70% 会让纸停在柱廊半腰，看起来像飘在半空。
          const x = spec.x + (51 - spec.x) * t + arc * spec.drift;
          const y = spec.y + (77 - spec.y) * t - arc * (26 + (i % 3) * 7);
          const scale = spec.size * (1 - t * 0.9);
          return (
            <div
              key={i}
              className="flying-certificate"
              style={{
                left: `${x}%`, top: `${y}%`, opacity: p < 0.31 ? 0.92 : t > 0 ? 1 - smooth(0.87, 1, t) : 0.92,
                transform: `translate(-50%, -50%) rotate(${spec.r + t * (510 + i * 23)}deg) scale(${scale})`,
                zIndex: 10 + i,
              }}
            >
              <span>UNITED STATES</span><b>STOCK</b><em>CERTIFICATE</em><i>{100 + i * 50} SHARES</i>
            </div>
          );
        })}
      </div>

      <div className="cinema-enter-title" style={{ opacity: enterTitle }}>
        <span>NEW YORK STOCK EXCHANGE</span>
        <strong>市场，不是一条线。<br />是无数笔交易。</strong>
      </div>

      <div className="cinema-flash" style={{ opacity: flash }} />
      <button className="cinema-skip" onClick={onComplete}>跳过开场 <span>↗</span></button>
      <div className="cinema-footer">
        <span>AN INTERACTIVE MARKET FILM</span>
        <div className="cinema-progress"><i style={{ width: `${p * 100}%` }} /></div>
        <span>{String(Math.min(3, Math.floor(p * 4) + 1)).padStart(2, '0')} / 03</span>
      </div>
    </section>
  );
}
