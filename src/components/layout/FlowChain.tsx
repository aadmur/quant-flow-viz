import { CORE_PHASES } from '../../core/phases';
import { fmtMoney, fmtSigned } from '../../core/format';
import type { PhaseId } from '../../core/types';
import { useSnap } from '../../store/selectors';
import { useSession } from '../../store/useSession';

function metricFor(phase: PhaseId, snap: ReturnType<typeof useSnap>): string {
  switch (phase) {
    case 'm1': {
      const recent = snap.anomalyCount;
      return `累计异动 ${recent} 条`;
    }
    case 'm2':
      return `综合分 ${fmtSigned(snap.decision.score, 2)} · 置信 ${(snap.decision.confidence * 100).toFixed(0)}%`;
    case 'm3': {
      const p = snap.parent;
      if (!p) return '等待开仓信号';
      return `母单 ${p.side === 'buy' ? '买' : '卖'} ${p.targetQty} 股 / ${p.children.length} 子单`;
    }
    case 'm4':
      return `成交率 ${(snap.execution.fillRate * 100).toFixed(0)}% · 滑点 ${fmtSigned(snap.execution.avgSlippageBps, 1)}bp`;
    case 'm5':
      return `永久 ${snap.impact.permanentBps.toFixed(1)}bp · 临时 ${snap.impact.temporaryBps.toFixed(1)}bp`;
    case 'm6':
      return `盈亏 ${fmtMoney(snap.review.pnl)} · 回撤 ${snap.review.maxDrawdownPct.toFixed(1)}%`;
    default:
      return '';
  }
}

export function FlowChain() {
  const snap = useSnap();
  const openDetail = useSession((s) => s.openDetail);
  const detail = useSession((s) => s.detail);

  return (
    <nav className="flowchain" aria-label="交易链路">
      {CORE_PHASES.map((p, i) => {
        const isActive = snap.metrics.activePhase === p.id;
        return (
          <div key={p.id} style={{ display: 'contents' }}>
            <button
              className={`flow-node tone-${p.id} ${isActive ? 'is-active is-current' : ''}`}
              onClick={() => openDetail(p.id)}
              aria-current={isActive ? 'step' : undefined}
              aria-pressed={detail === p.id}
            >
              <div className="flow-node-top">
                <span className="flow-node-code">{p.code}</span>
                <span className="flow-node-title">{p.title}</span>
                {isActive && <i className="dot live" style={{ marginLeft: 2 }} />}
              </div>
              <span className="flow-node-metric">{metricFor(p.id, snap)}</span>
              <i className="flow-node-bar" />
            </button>
            {i < CORE_PHASES.length - 1 && (
              <span className="flow-arrow" aria-hidden>
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path
                    d="M3 2.5 7.5 6 3 9.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
