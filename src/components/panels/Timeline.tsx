import { useMemo, useRef } from 'react';
import type { SessionData } from '../../core/types';
import { PHASE_MAP } from '../../core/phases';
import { tickToClock } from '../../core/format';

export interface Segment {
  phase: keyof typeof PHASE_MAP;
  from: number;
  to: number;
}

/** 把逐 tick 的 activePhase 压成连续色带 */
export function buildSegments(session: SessionData): Segment[] {
  const out: Segment[] = [];
  session.snaps.forEach((s, i) => {
    const prev = out[out.length - 1];
    if (prev && prev.phase === s.metrics.activePhase) prev.to = i;
    else out.push({ phase: s.metrics.activePhase, from: i, to: i });
  });
  return out;
}

export interface TimelineProps {
  session: SessionData;
  tick: number;
  playing: boolean;
  segments: Segment[];
  onSeek: (tick: number) => void;
  onPlay: () => void;
  onStep: (delta: number) => void;
  explode: number;
  onExplode: (v: number) => void;
}

export function Timeline({ session, tick, playing, segments, onSeek, onPlay, onStep, explode, onExplode }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const total = session.totalTicks;

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onSeek(ratio * (total - 1));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromEvent(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    seekFromEvent(e.clientX);
  };

  /* 事件标记：母单、首笔成交、冲击峰值、熔断、异常 */
  const marks = useMemo(() => {
    const list: { tick: number; label: string; color: string; kind: string }[] = [];
    const firstParent = session.snaps.find((s) => s.parent);
    if (firstParent) list.push({ tick: firstParent.parent!.createdTick, label: '母单创建', color: '#ffb020', kind: 'order' });
    const firstFill = session.fills[0];
    if (firstFill) list.push({ tick: firstFill.tick, label: '首笔成交', color: '#17cf8d', kind: 'fill' });
    let peak = { tick: 0, v: 0 };
    session.snaps.forEach((s) => {
      if (s.impact.totalBps > peak.v) peak = { tick: s.tick, v: s.impact.totalBps };
    });
    if (peak.v > 0) list.push({ tick: peak.tick, label: `冲击峰值 ${peak.v.toFixed(1)}bp`, color: '#fb7a3c', kind: 'impact' });
    const breaker = session.snaps.find((s) => s.risk.breaker !== 'closed');
    if (breaker) list.push({ tick: breaker.tick, label: '风控熔断', color: '#ff3b4e', kind: 'risk' });
    session.incidents.slice(0, 3).forEach((inc) =>
      list.push({ tick: inc.tick, label: inc.kind, color: '#ffc247', kind: 'incident' }),
    );
    return list.filter((m) => m.tick >= 0 && m.tick < total);
  }, [session, total]);

  /* 成交流量条：每 6 个 tick 聚合一次 */
  const flow = useMemo(() => {
    const buckets = new Array(Math.ceil(total / 6)).fill(0) as number[];
    session.fills.forEach((f) => {
      const b = Math.floor(f.tick / 6);
      if (b < buckets.length) buckets[b] += 1;
    });
    return buckets;
  }, [session, total]);

  const pos = (t: number) => `${(t / (total - 1)) * 100}%`;
  const snap = session.snaps[Math.max(0, Math.min(total - 1, Math.floor(tick)))];

  return (
    <div className="timeline">
      <div className="tl-left">
        <button className={`play-btn ${playing ? 'on' : ''}`} onClick={onPlay} aria-label={playing ? '暂停' : '播放'}>
          {playing ? (
            <svg width="12" height="13" viewBox="0 0 12 13">
              <rect x="1" y="1" width="3.4" height="11" rx="1" fill="currentColor" />
              <rect x="7.2" y="1" width="3.4" height="11" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 13 13">
              <path d="M2 1.4 11.4 6.5 2 11.6Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="tl-step">
          <button onClick={() => onStep(-6)} aria-label="后退">
            −
          </button>
          <button onClick={() => onStep(6)} aria-label="前进">
            +
          </button>
        </div>
        <div className="tl-clock">
          <span className="tabnum">{snap.clock}</span>
          <em>
            tick {Math.floor(tick)} / {total}
          </em>
        </div>
      </div>

      <div className="tl-track-wrap">
        <div
          className="tl-track"
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          role="slider"
          tabIndex={0}
          aria-label="时间轴"
          aria-valuemin={0}
          aria-valuemax={total - 1}
          aria-valuenow={Math.floor(tick)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') onSeek(Math.max(0, tick - 3));
            if (e.key === 'ArrowRight') onSeek(Math.min(total - 1, tick + 3));
          }}
        >
          {/* 阶段色带 */}
          <div className="tl-bands">
            {segments.map((sg, i) => {
              const w = ((sg.to - sg.from + 1) / total) * 100;
              const left = (sg.from / total) * 100;
              const meta = PHASE_MAP[sg.phase];
              return (
                <span
                  key={i}
                  className={`tl-band g-${meta.group}`}
                  style={{ left: `${left}%`, width: `${w}%`, background: meta.accent }}
                  title={`${meta.code} ${meta.title}`}
                />
              );
            })}
          </div>

          {/* 成交流量 */}
          <div className="tl-flow">
            {flow.map((v, i) => {
              const max = Math.max(...flow, 1);
              return <span key={i} style={{ height: `${(v / max) * 100}%` }} />;
            })}
          </div>

          {/* 已播放遮罩 */}
          <div className="tl-elapsed" style={{ width: pos(tick) }} />

          {/* 事件标记 */}
          {marks.map((m, i) => (
            <span
              key={i}
              className={`tl-mark ${m.kind}`}
              style={{ left: pos(m.tick), background: m.color }}
              title={`${m.label} @ tick ${m.tick}`}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(m.tick);
              }}
            />
          ))}

          {/* 游标 */}
          <div className="tl-head" style={{ left: pos(tick) }}>
            <span className="tl-head-grip" />
            <span className="tl-head-time tabnum">{snap.clock}</span>
          </div>
        </div>

        <div className="tl-ruler">
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <span key={r} style={{ left: `${r * 100}%` }}>
              {tickToClock(Math.round(r * (total - 1)))}
            </span>
          ))}
        </div>
      </div>

      <div className="tl-right">
        <div className="explode-ctl">
          <label htmlFor="explode">拆解度</label>
          <input
            id="explode"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explode}
            onChange={(e) => onExplode(Number(e.target.value))}
            style={{ ['--fill' as string]: `${explode * 100}%`, ['--thumb' as string]: '#9fd8ff', ['--thumb-glow' as string]: 'rgba(56,225,255,.8)' }}
          />
          <span className="tabnum">{Math.round(explode * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
