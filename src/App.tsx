import { useEffect } from 'react';
import { ControlRail } from './components/layout/ControlRail';
import { DetailDrawer } from './components/layout/DetailDrawer';
import { FlowChain } from './components/layout/FlowChain';
import { TopBar } from './components/layout/TopBar';
import { Transport } from './components/layout/Transport';
import { ExecutionPanel } from './components/modules/ExecutionPanel';
import { ImpactPanel } from './components/modules/ImpactPanel';
import { IncidentPanel } from './components/modules/IncidentPanel';
import { MarketPanel } from './components/modules/MarketPanel';
import { ModelPanel } from './components/modules/ModelPanel';
import { OrderPanel } from './components/modules/OrderPanel';
import { PortfolioPanel } from './components/modules/PortfolioPanel';
import { ReviewPanel } from './components/modules/ReviewPanel';
import { RiskPanel } from './components/modules/RiskPanel';
import { advance, useSession } from './store/useSession';

/**
 * 播放循环。
 *
 * 唯一的时间源就是这里的 rAF：它只推进 store 里的 tick，
 * 所有模块再从 tick 取快照——因此「拖动时间轴」和「自动播放」
 * 走的是同一条渲染路径，不存在两套状态需要同步。
 */
function usePlayback() {
  const playing = useSession((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(120, now - last));
      last = now;
      const st = useSession.getState();
      const next = advance(st, dt);

      if (next >= st.session.totalTicks - 1) {
        useSession.setState({ tick: st.session.totalTicks - 1, playing: false });
        return;
      }
      useSession.setState({ tick: next });
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const st = useSession.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        st.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        st.stepTick(e.shiftKey ? -20 : -5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        st.stepTick(e.shiftKey ? 20 : 5);
      } else if (e.code === 'Home') {
        st.setTick(0);
      } else if (e.code === 'End') {
        st.setTick(st.session.totalTicks - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  usePlayback();
  useKeyboard();

  return (
    <div className="app">
      <TopBar />
      <FlowChain />
      <div className="workspace">
        <ControlRail />
        <main className="canvas" aria-label="交易链路模块">
          <MarketPanel />
          <ModelPanel />
          <RiskPanel />
          <OrderPanel />
          <ExecutionPanel />
          <PortfolioPanel />
          <ImpactPanel />
          <ReviewPanel />
          <IncidentPanel />
        </main>
      </div>
      <Transport />
      <DetailDrawer />
    </div>
  );
}
