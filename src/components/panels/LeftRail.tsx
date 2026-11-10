import type { Snapshot } from '../../core/types';
import { fmtBps, fmtMoney, fmtMoneySigned, fmtPct, fmtQty } from '../../core/format';

export function LeftRail({ snap }: { snap: Snapshot }) {
  const pnl = snap.review.pnl;
  const base = snap.review.equity - pnl;
  const retPct = base > 0 ? (pnl / base) * 100 : 0;
  const util = snap.risk.utilization;
  const breakerOn = snap.risk.breaker !== 'closed';

  return (
    <aside className="leftrail">
      <div className="rail-block equity">
        <span className="eyebrow">账户权益 / EQUITY</span>
        <strong className="tabnum">{fmtMoney(snap.review.equity)}</strong>
        <div className={`equity-delta ${pnl >= 0 ? 'up' : 'down'}`}>
          <span className="tabnum">{fmtMoneySigned(pnl)}</span>
          <em className="tabnum">{fmtPct(retPct)}</em>
        </div>
      </div>

      <div className="rail-block">
        <span className="eyebrow">敞口闸门 / EXPOSURE</span>
        <div className="util">
          <div className="util-bar">
            <span className="util-fill" style={{ width: `${Math.min(100, util * 100)}%`, background: util > 0.85 ? '#ff3b4e' : '#38e1ff' }} />
            <span className="util-limit" style={{ left: '100%' }} title="敞口上限" />
          </div>
          <div className="util-legend">
            <span className="tabnum">{fmtMoney(snap.risk.exposure)}</span>
            <em className="tabnum">上限 {fmtMoney(snap.risk.exposureLimit)}</em>
          </div>
        </div>
      </div>

      <div className="rail-grid">
        <div>
          <span className="eyebrow">VaR 95</span>
          <b className="tabnum">{fmtMoney(snap.risk.var95)}</b>
        </div>
        <div>
          <span className="eyebrow">回撤</span>
          <b className={`tabnum ${snap.risk.drawdownPct > 2 ? 'down' : ''}`}>{snap.risk.drawdownPct.toFixed(2)}%</b>
        </div>
        <div>
          <span className="eyebrow">下单速率</span>
          <b className="tabnum">{snap.risk.orderRate}/min</b>
        </div>
        <div>
          <span className="eyebrow">被拦子单</span>
          <b className="tabnum">{snap.risk.blocked}</b>
        </div>
      </div>

      <div className={`breaker ${breakerOn ? 'on' : ''}`}>
        <span className="led" />
        <div>
          <b>{breakerOn ? '熔断已触发' : '风控闸门闭合'}</b>
          <em>{breakerOn ? '新单暂停下发，等待敞口回落' : `${snap.risk.passed} 张子单通过校验`}</em>
        </div>
      </div>

      <div className="rail-block">
        <span className="eyebrow">会话账本 / LEDGER</span>
        <ul className="ledger">
          <li>
            <span>异动</span>
            <b className="tabnum">{snap.anomalyCount}</b>
          </li>
          <li>
            <span>信号翻转</span>
            <b className="tabnum">{snap.metrics.decisionFlips}</b>
          </li>
          <li>
            <span>子单</span>
            <b className="tabnum">{snap.metrics.totalChildOrders}</b>
          </li>
          <li>
            <span>成交笔数</span>
            <b className="tabnum">{snap.metrics.totalFills}</b>
          </li>
          <li>
            <span>成交股数</span>
            <b className="tabnum">{fmtQty(snap.metrics.filledQty)}</b>
          </li>
          <li>
            <span>异常</span>
            <b className={`tabnum ${snap.metrics.incidentCount > 0 ? 'warnc' : ''}`}>{snap.metrics.incidentCount}</b>
          </li>
        </ul>
      </div>

      <div className="rail-block muted">
        <span className="eyebrow">均价 / 基准</span>
        <div className="pair">
          <span className="tabnum">{snap.review.ourAvgPrice.toFixed(2)}</span>
          <em>vs VWAP {fmtBps(snap.review.vsVwapBps, 1)}</em>
        </div>
      </div>

      <p className="rail-hint">
        点零件抽出详情 · 拖「拆解度」看结构 · 拖时间轴回放整条链路
      </p>
    </aside>
  );
}
