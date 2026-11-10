import { useCallback, useMemo, useRef } from 'react';
import { fmtMoney } from '../../core/format';
import { tickToClock, tickToDuration } from '../../core/format';
import { useSession, SPEED_STEPS } from '../../store/useSession';
import { useSnap, useSessionData } from '../../store/selectors';
import { Segmented } from '../ui/Controls';

const W = 1000;

export function Transport() {
  const session = useSessionData();
  const tick = useSession((s) => s.tick);
  const playing = useSession((s) => s.playing);
  const speed = useSession((s) => s.speed);
  const setTick = useSession((s) => s.setTick);
  const stepTick = useSession((s) => s.stepTick);
  const togglePlay = useSession((s) => s.togglePlay);
  const setSpeed = useSession((s) => s.setSpeed);

  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const total = session.totalTicks;
  const snap = useSnap();

  const posOf = useCallback((t: number) => (t / (total - 1)) * W, [total]);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // jsdom 等环境下宽度为 0，直接返回避免 NaN 污染 tick
      if (rect.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setTick(ratio * (total - 1));
    },
    [setTick, total],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    togglePlay(false);
    seekFromEvent(e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    seekFromEvent(e.clientX);
  };

  const endDrag = () => {
    dragging.current = false;
  };

  // 事件标记：母单 / 成交 / 异动 / 异常
  const markers = useMemo(() => {
    const parents: { tick: number; side: 'buy' | 'sell' }[] = [];
    const seen = new Set<string>();
    for (const s of session.snaps) {
      if (s.parent && !seen.has(s.parent.id)) {
        seen.add(s.parent.id);
        parents.push({ tick: s.parent.createdTick, side: s.parent.side });
      }
    }
    return {
      parents,
      fills: session.fills,
      anomalies: session.anomalies,
      incidents: session.incidents,
    };
  }, [session]);

  const jumpToNextEvent = () => {
    const cur = Math.floor(tick);
    const candidates = [
      ...markers.parents.map((p) => p.tick),
      ...markers.fills.map((f) => f.tick),
      ...markers.anomalies.map((a) => a.tick),
      ...markers.incidents.map((i) => i.tick),
    ].filter((t) => t > cur);
    if (candidates.length === 0) return;
    setTick(Math.min(...candidates));
    togglePlay(false);
  };

  const labels = useMemo(() => {
    const step = 100;
    const out: { tick: number; text: string }[] = [];
    for (let t = 0; t < total; t += step) out.push({ tick: t, text: tickToClock(t).slice(0, 5) });
    return out;
  }, [total]);

  return (
    <footer className="transport" aria-label="时间轴与播放控制">
      <div className="transport-top">
        <div className="row" style={{ gap: 5 }}>
          <button className="btn icon" onClick={() => stepTick(-1)} title="退一 tick" aria-label="后退一步">
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path d="M9 2 3.5 6 9 10Z" fill="currentColor" />
            </svg>
          </button>
          <button
            className="btn primary"
            data-testid="transport-play"
            onClick={() => {
              if (tick >= total - 1) setTick(0);
              togglePlay();
            }}
            title={playing ? '暂停' : '播放'}
          >
            {playing ? '暂停' : tick >= total - 1 ? '重播' : '播放'}
          </button>
          <button className="btn icon" onClick={() => stepTick(1)} title="进一 tick" aria-label="前进一步">
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 2 8.5 6 3 10Z" fill="currentColor" />
            </svg>
          </button>
          <button className="btn sm" onClick={jumpToNextEvent} title="跳到下一个事件（成交/异动/异常/下单）">
            下一事件
          </button>
        </div>

        <Segmented
          options={SPEED_STEPS.map((s) => ({ value: s, label: `${s}×` }))}
          value={speed}
          onChange={setSpeed}
          ariaLabel="播放速度"
        />

        <div className="tick-readout">
          <span className="tick-clock">{snap.clock}</span>
          <span className="tick-idx">
            tick {Math.floor(tick)} / {total - 1} · {tickToDuration(Math.floor(tick))}
          </span>
        </div>

        <div className="spacer" />

        <div className="row small" style={{ gap: 12 }}>
          <span className="muted">
            当前阶段 <b style={{ color: 'var(--text-1)' }}>{snap.metrics.activePhase.toUpperCase()}</b>
          </span>
          <span className="muted">
            已成交 <b className="num" style={{ color: 'var(--text-1)' }}>{snap.execution.filledQty}</b> 股
          </span>
          <span className="muted">
            盈亏 <b className="num" style={{ color: snap.review.pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtMoney(snap.review.pnl)}</b>
          </span>
        </div>
      </div>

      <div
        className="timeline"
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="slider"
        tabIndex={0}
        aria-label="时间轴"
        aria-valuemin={0}
        aria-valuemax={total - 1}
        aria-valuenow={Math.floor(tick)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') stepTick(-5);
          if (e.key === 'ArrowRight') stepTick(5);
          if (e.key === 'Home') setTick(0);
          if (e.key === 'End') setTick(total - 1);
        }}
      >
        <svg
          viewBox={`0 0 ${W} 46`}
          width="100%"
          height="46"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          aria-hidden
        >
          <rect x={0} y={21} width={W} height={4} rx={2} fill="var(--surface-3)" stroke="var(--border)" />
          <rect x={0} y={21} width={posOf(tick)} height={4} rx={2} fill="url(#tl-grad)" />
          <defs>
            <linearGradient id="tl-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--m1)" />
              <stop offset="20%" stopColor="var(--m2)" />
              <stop offset="40%" stopColor="var(--m3)" />
              <stop offset="60%" stopColor="var(--m4)" />
              <stop offset="80%" stopColor="var(--m5)" />
              <stop offset="100%" stopColor="var(--m6)" />
            </linearGradient>
          </defs>

          {/* 异动 */}
          {markers.anomalies.map((a) => (
            <rect key={a.id} x={posOf(a.tick)} y={15} width={1} height={5} fill="var(--m5)" opacity={0.55} />
          ))}
          {/* 成交 */}
          {markers.fills.map((f) => (
            <rect
              key={f.id}
              x={posOf(f.tick)}
              y={27}
              width={1}
              height={4}
              fill="var(--m4)"
              opacity={0.5}
            />
          ))}
          {/* 异常 */}
          {markers.incidents.map((i) => (
            <rect
              key={i.id}
              x={posOf(i.tick)}
              y={11}
              width={Math.max(1.5, (i.duration / (total - 1)) * W)}
              height={5}
              rx={1}
              fill="var(--neg)"
              opacity={0.5}
            />
          ))}
          {/* 母单 */}
          {markers.parents.map((p, i) => (
            <g key={`p-${i}`}>
              <rect x={posOf(p.tick) - 1} y={7} width={2.5} height={30} rx={1} fill="var(--accent)" opacity={0.75} />
            </g>
          ))}

          {/* 播放头 */}
          <line x1={posOf(tick)} x2={posOf(tick)} y1={4} y2={40} stroke="var(--accent)" strokeWidth={1.4} />
          <circle cx={posOf(tick)} cy={23} r={4.5} fill="#fff" stroke="var(--accent)" strokeWidth={2.2} />
        </svg>

        <div className="timeline-ticklabels">
          {labels.map((l) => (
            <span key={l.tick} style={{ left: `${(l.tick / (total - 1)) * 100}%` }}>
              {l.text}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
