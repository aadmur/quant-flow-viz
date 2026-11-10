import { useSnap, useSessionData } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { fmtMoney, fmtPct, fmtSigned, trendColor } from '../../core/format';
import { Dot } from '../ui/Controls';

export function TopBar() {
  const snap = useSnap();
  const session = useSessionData();
  const playing = useSession((s) => s.playing);
  const pending = useSession((s) => s.pending);
  const togglePlay = useSession((s) => s.togglePlay);
  const reseed = useSession((s) => s.reseed);

  const pnl = snap.review.pnl;

  return (
    <header className="topbar" data-testid="topbar">
      <div className="brand">
        <div className="brand-mark">QF</div>
        <div>
          <div className="brand-name">QuantFlow</div>
          <div className="tiny muted" style={{ marginTop: -2 }}>
            量化交易全链路沙盘
          </div>
        </div>
        <span className="brand-sub">demo · 模拟数据</span>
      </div>

      <div className="symbol-badge">
        <span className="code">{session.symbol.code}</span>
        <span className="name">{session.symbol.name}</span>
        <span className="px num" style={{ color: trendColor(snap.changePct) }}>
          {snap.price.toFixed(2)}
        </span>
        <span className="num small" style={{ color: trendColor(snap.changePct) }}>
          {fmtPct(snap.changePct)}
        </span>
      </div>

      <div className="kpi-strip">
        <div className="kpi">
          <div className="kpi-label">总权益</div>
          <div className="kpi-value">{fmtMoney(snap.review.equity)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">浮动盈亏</div>
          <div className="kpi-value" style={{ color: trendColor(pnl) }}>
            {fmtSigned(pnl / 10000, 2)}万
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">持仓</div>
          <div className="kpi-value">
            {Math.round(snap.risk.exposure / 10000)}
            <span className="tiny muted">万</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">风控占用</div>
          <div className="kpi-value" style={{ color: snap.risk.utilization > 0.85 ? 'var(--neg)' : undefined }}>
            {(snap.risk.utilization * 100).toFixed(0)}%
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">市场状态</div>
          <div className="kpi-value" style={{ fontSize: 11.5 }}>
            {snap.regime}
          </div>
        </div>
      </div>

      <div className="spacer" />

      <div className="row" style={{ gap: 6 }}>
        <span className="row tiny" style={{ gap: 5, color: 'var(--text-3)' }}>
          <Dot state={pending ? 'warn' : playing ? 'live' : 'idle'} />
          {pending ? '重算中' : playing ? '实时运行' : '已暂停'}
        </span>
        <button className="btn icon" onClick={() => togglePlay()} title={playing ? '暂停' : '播放'} aria-label={playing ? '暂停' : '播放'}>
          {playing ? (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <rect x="2" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
              <rect x="7" y="1.5" width="3" height="9" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
              <path d="M3 1.6 10.4 6 3 10.4Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button className="btn sm" onClick={reseed} title="换一段行情（保持参数不变）">
          换行情
        </button>
      </div>
    </header>
  );
}
