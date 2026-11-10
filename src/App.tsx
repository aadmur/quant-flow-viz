import { useEffect, useMemo, useRef, useState } from 'react';
import { advance, currentSnapshot, useSession } from './store/useSession';
import { FOCUS_SYMBOL } from './model/params';
import { MachineStage } from './components/machine/MachineStage';
import { TopBar } from './components/panels/TopBar';
import { LeftRail } from './components/panels/LeftRail';
import { DetailRail } from './components/panels/DetailRail';
import { Timeline, buildSegments } from './components/panels/Timeline';
import { PHASE_MAP } from './core/phases';

/** 视觉刷新节流：数据 25fps 足够顺滑，再高只是烧 CPU */
const FRAME_MS = 40;

export default function App() {
  const store = useSession();
  const snap = currentSnapshot(store);
  const session = store.session;

  const [explode, setExplode] = useState(0.42);
  const [clock, setClock] = useState(0);
  const clockRef = useRef(0);

  /* ---- 唯一时钟：播放推进 + 装饰性动画相位 ---- */
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let acc = 0;

    const loop = (now: number) => {
      if (!last) last = now;
      const dt = now - last;
      last = now;
      acc += dt;

      if (acc >= FRAME_MS) {
        const s = useSession.getState();
        if (s.playing) {
          const next = advance(s, acc);
          if (next >= s.session.totalTicks - 1) {
            s.setTick(s.session.totalTicks - 1);
            s.togglePlay(false);
          } else {
            s.setTick(next);
          }
        }
        clockRef.current = now / 1000;
        setClock(clockRef.current);
        acc = 0;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---- 键盘：空格播放/暂停，←/→ 步进 ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const s = useSession.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        s.togglePlay();
      } else if (e.key === 'ArrowLeft') {
        s.stepTick(-4);
      } else if (e.key === 'ArrowRight') {
        s.stepTick(4);
      } else if (e.key === 'Escape') {
        s.closeDetail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tick = Math.floor(store.tick);
  const hist = useMemo(() => session.snaps.slice(Math.max(0, tick - 90), tick + 1), [session, tick]);
  const equity = useMemo(() => session.equityCurve.slice(0, tick + 1), [session, tick]);
  const fills = useMemo(() => session.fills.filter((f) => f.tick <= tick), [session, tick]);
  const segments = useMemo(() => buildSegments(session), [session]);

  const meta = snap.metrics.activePhase ? PHASE_MAP[snap.metrics.activePhase] : null;

  return (
    <div className={`app ${store.detail ? 'focused' : ''}`}>
      <TopBar
        snap={snap}
        code={FOCUS_SYMBOL.code}
        name={FOCUS_SYMBOL.name}
        playing={store.playing}
        speed={store.speed}
        presetId={store.presetId}
        pending={store.pending}
        onPlay={() => store.togglePlay()}
        onSpeed={(s) => store.setSpeed(s)}
        onPreset={(id) => store.applyPreset(id)}
        onReseed={() => store.reseed()}
        onReset={() => store.resetParams()}
      />

      <main className="stage">
        <MachineStage
          snap={snap}
          fills={fills}
          equity={equity}
          tick={store.tick}
          explode={explode}
          selected={store.detail}
          onSelect={(id) => (id ? store.openDetail(id) : store.closeDetail())}
          clock={clock}
        />

        {/* 舞台底部：当前阶段一句话 */}
        <div className="stage-caption" style={{ ['--ph' as string]: meta?.accent ?? '#38e1ff' }}>
          <span className="hud-dot" />
          <b>
            {meta?.code} · {meta?.title}
          </b>
          <span className="cap-q">{meta?.question}</span>
        </div>

        <div className="stage-legend">
          <span>
            <i style={{ background: '#ffb020' }} /> 母单
          </span>
          <span>
            <i style={{ background: '#ffd089' }} /> 子单在途
          </span>
          <span>
            <i style={{ background: '#17cf8d' }} /> 已成交
          </span>
          <span>
            <i style={{ background: '#ff4d63' }} /> 拦截 / 拒单
          </span>
        </div>
      </main>

      <LeftRail snap={snap} />

      <DetailRail
        snap={snap}
        selected={store.detail}
        hist={hist}
        fills={fills}
        equity={equity}
        params={store.params}
        onParam={(k, v) => store.setParam(k, v)}
        onWeight={(k, v) => store.setWeight(k, v)}
        onAlgo={(a) => store.setAlgo(a)}
        onForce={(side) => store.forceOrder(side)}
        onInject={(k) => store.injectIncident(k)}
        onSelect={(id) => (id ? store.openDetail(id) : store.closeDetail())}
      />

      <Timeline
        session={session}
        tick={store.tick}
        playing={store.playing}
        segments={segments}
        onSeek={(t) => {
          store.setTick(t);
          store.togglePlay(false);
        }}
        onPlay={() => store.togglePlay()}
        onStep={(d) => store.stepTick(d)}
        explode={explode}
        onExplode={setExplode}
      />
    </div>
  );
}
