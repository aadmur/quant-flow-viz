import { useMemo } from 'react';
import { fmtSigned } from '../../core/format';
import type { ChildStatus } from '../../core/types';
import { useSnap, useSessionData } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { Card } from '../ui/Card';
import { Empty, Meter, Stat } from '../ui/Controls';

const STATUS_TEXT: Record<ChildStatus, string> = {
  pending: '待发',
  active: '在途',
  partial: '部成',
  filled: '已成',
  cancelled: '已撤',
  rejected: '拒单',
  blocked: '拦截',
};

export function ExecutionPanel() {
  const snap = useSnap();
  const session = useSessionData();
  const openDetail = useSession((s) => s.openDetail);

  const visibleFills = useMemo(
    () => session.fills.filter((f) => f.tick <= snap.tick),
    [session.fills, snap.tick],
  );

  const parent = snap.parent;
  const liveChildren = useMemo(
    () => (parent?.children ?? []).filter((c) => c.status !== 'pending').slice(-7),
    [parent],
  );

  const e = snap.execution;

  return (
    <Card
      phase="m4"
      span={5}
      active={snap.metrics.activePhase === 'm4'}
      pulsing={visibleFills.length > 0 && visibleFills[visibleFills.length - 1]?.tick === snap.tick}
      onOpen={() => openDetail('m4')}
      footer={
        <div className="row-between">
          <span>
            累计成交 <b className="num">{visibleFills.length}</b> 笔 / <b className="num">{e.filledQty}</b> 股
          </span>
          <span className="muted">
            部成 <b className="num">{e.partialCount}</b> · 撤单 <b className="num">{e.cancelCount}</b> · 拒单{' '}
            <b className="num">{e.rejectCount}</b>
          </span>
        </div>
      }
    >
      <div className="stat-grid c4">
        <Stat
          label="成交率"
          value={`${(e.fillRate * 100).toFixed(0)}%`}
          small
          color={e.fillRate < 0.8 ? 'var(--warn)' : undefined}
          hint={parent ? `目标 ${parent.targetQty}` : undefined}
        />
        <Stat label="成交均价" value={e.avgPrice > 0 ? e.avgPrice.toFixed(2) : '—'} small />
        <Stat
          label="平均滑点"
          value={`${fmtSigned(e.avgSlippageBps, 1)}bp`}
          small
          color={e.avgSlippageBps > 0 ? 'var(--neg)' : 'var(--pos)'}
        />
        <Stat
          label="最差滑点"
          value={`${fmtSigned(e.worstSlippageBps, 1)}bp`}
          small
          color="var(--neg)"
        />
      </div>

      <div>
        <div className="tiny muted" style={{ marginBottom: 3 }}>
          子单执行状态（条形 = 成交进度）
        </div>
        {liveChildren.length === 0 ? (
          <Empty>暂无在途子单</Empty>
        ) : (
          <div className="order-ladder">
            {liveChildren.map((c) => (
              <div
                className={`child-row ${c.status === 'active' || c.status === 'partial' ? 'is-live' : ''}`}
                key={c.id}
                title={`${c.id} · 限价 ${c.limitPrice.toFixed(2)} · 到达 ${c.arrivalPrice.toFixed(2)} · ${c.venue}${
                  c.rejectReason ? ` · ${c.rejectReason}` : ''
                }`}
              >
                <span className="child-seq">#{c.seq}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="row-between tiny" style={{ marginBottom: 1 }}>
                    <span className="num">
                      {c.filled}/{c.qty}
                    </span>
                    <span className="muted num">{c.limitPrice.toFixed(2)}</span>
                  </div>
                  <Meter value={c.filled} max={c.qty} tone="var(--m4)" />
                </div>
                <span className={`child-status st-${c.status}`}>{STATUS_TEXT[c.status]}</span>
                <span
                  className="num tiny"
                  style={{
                    textAlign: 'right',
                    color: c.slippageBps > 0 ? 'var(--neg)' : c.slippageBps < 0 ? 'var(--pos)' : 'var(--text-3)',
                  }}
                >
                  {c.filled > 0 ? `${fmtSigned(c.slippageBps, 0)}bp` : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="col" style={{ flex: 1, minHeight: 0, gap: 3, overflow: 'hidden' }}>
        <div className="tiny muted">
          成交回报流（成交量加权，bp 为相对成交时中间价）
        </div>
        <div className="fill-feed">
          {visibleFills.length === 0 ? (
            <Empty>等待成交……</Empty>
          ) : (
            [...visibleFills]
              .slice(-16)
              .reverse()
              .map((f) => (
                <div className="fill-row" key={f.id}>
                  <span className="f-side" style={{ color: f.side === 'buy' ? 'var(--up)' : 'var(--down)' }}>
                    {f.side === 'buy' ? 'B' : 'S'}
                  </span>
                  <span className="f-px">{f.price.toFixed(2)}</span>
                  <span className="f-qty">{f.qty}</span>
                  <span
                    className="f-slip num"
                    style={{ color: f.slippageBps > 0 ? 'var(--neg)' : 'var(--pos)' }}
                  >
                    {fmtSigned(f.slippageBps, 1)}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </Card>
  );
}
