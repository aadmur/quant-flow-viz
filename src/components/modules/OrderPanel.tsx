import { ALGO_HINTS, ALGO_LABELS, ALGO_SHORT, INITIAL_CAPITAL } from '../../model/params';
import type { AlgoKind, ChildStatus } from '../../core/types';
import { fmtSigned } from '../../core/format';
import { useSnap } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { Card } from '../ui/Card';
import { Chip, Empty, Stat } from '../ui/Controls';

const ALGOS: AlgoKind[] = ['twap', 'vwap', 'iceberg', 'sniper'];

const STATUS_CLASS: Record<ChildStatus, string> = {
  pending: '',
  active: 'is-active',
  partial: 'is-past',
  filled: 'is-done',
  cancelled: 'is-cancelled',
  rejected: 'is-blocked',
  blocked: 'is-blocked',
};

const STATUS_TEXT: Record<ChildStatus, string> = {
  pending: '待发',
  active: '在途',
  partial: '部成',
  filled: '已成',
  cancelled: '已撤',
  rejected: '拒单',
  blocked: '拦截',
};

const STATUS_COLOR: Partial<Record<ChildStatus, string>> = {
  rejected: 'var(--neg)',
  blocked: 'var(--neg)',
  cancelled: 'var(--warn)',
  filled: 'var(--down)',
  active: 'var(--m4)',
  partial: 'var(--m4)',
};

export function OrderPanel() {
  const snap = useSnap();
  const params = useSession((s) => s.params);
  const setAlgo = useSession((s) => s.setAlgo);
  const openDetail = useSession((s) => s.openDetail);
  const forceOrder = useSession((s) => s.forceOrder);

  const parent = snap.parent;
  const children = parent?.children ?? [];
  const dispatched = children.filter((c) => c.status !== 'pending').length;
  const maxQty = Math.max(...children.map((c) => c.qty), 1);

  // 队列窗口：以「正在执行 / 最近一条已下发」为锚点，前后各取几条
  const focusIdx = children.findIndex((c) => c.status === 'active' || c.status === 'partial');
  const anchor = focusIdx >= 0 ? focusIdx : Math.max(0, dispatched - 1);
  const ROWS = 12;
  const winStart = Math.max(0, Math.min(anchor - 3, children.length - ROWS));
  const windowRows = children.slice(winStart, winStart + ROWS);

  return (
    <Card
      phase="m3"
      span={4}
      active={snap.metrics.activePhase === 'm3'}
      pulsing={!!parent && parent.createdTick === snap.tick}
      onOpen={() => openDetail('m3')}
      right={
        <Chip phase="m3">
          {ALGO_LABELS[params.algo].split(' ')[0]}
        </Chip>
      }
      footer={
        parent ? (
          <span>
            母单 <b className="num">{parent.id}</b> · 计划跨度{' '}
            <b className="num">
              {children.length > 1 ? children[children.length - 1].scheduledTick - parent.createdTick : 0}
            </b>{' '}
            tick · {parent.status === 'working' ? '执行中' : '已结束'}
          </span>
        ) : (
          <span>尚无母单：综合分越过阈值后会自动拆单下发</span>
        )
      }
    >
      <div className="algo-pick">
        {ALGOS.map((a) => (
          <button
            key={a}
            className="algo-btn"
            aria-pressed={params.algo === a}
            onClick={() => setAlgo(a)}
            title={ALGO_HINTS[a]}
          >
            <div className="algo-name">{a.toUpperCase()}</div>
            <div className="algo-hint">{ALGO_SHORT[a]}</div>
          </button>
        ))}
      </div>

      {parent ? (
        <>
          <div className="stat-grid c4">
            <Stat
              label="方向 / 目标"
              value={`${parent.side === 'buy' ? '买' : '卖'} ${parent.targetQty}`}
              small
              color={parent.side === 'buy' ? 'var(--up)' : 'var(--down)'}
            />
            <Stat label="拆单数" value={children.length} small />
            <Stat label="已下发" value={dispatched} small />
            <Stat
              label="平均单笔"
              value={Math.round(parent.targetQty / Math.max(1, children.length))}
              small
            />
          </div>

          <div className="col" style={{ flex: 'none', gap: 3 }}>
            <div className="row-between tiny muted">
              <span>子单节奏（高度=委托量）</span>
              <span>
                建仓预算 {(INITIAL_CAPITAL * params.capitalPct) / 100 / 10000}万
              </span>
            </div>
            <div className="slice-strip">
              {children.map((c) => (
                <div
                  key={c.id}
                  className={`slice-bar ${STATUS_CLASS[c.status]}`}
                  style={{ height: `${Math.max(14, (c.qty / maxQty) * 100)}%` }}
                  title={`${c.id} · ${c.qty}股 · ${c.status}${c.rejectReason ? ` · ${c.rejectReason}` : ''}`}
                />
              ))}
            </div>
          </div>

          <div className="col" style={{ flex: 1, minHeight: 0, gap: 0, overflow: 'auto' }}>
            <div className="row-between tiny muted" style={{ marginBottom: 3 }}>
              <span>子单队列（窗口 {winStart + 1}-{winStart + windowRows.length} / {children.length}）</span>
              <span>限价偏移 = 相对中间价的 bp</span>
            </div>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>子单</th>
                  <th className="num">计划 tick</th>
                  <th className="num">数量</th>
                  <th className="num">限价偏移</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {windowRows.map((c) => (
                  <tr key={c.id}>
                    <td className="num">{c.id}</td>
                    <td className="num">{c.scheduledTick}</td>
                    <td className="num">{c.qty}</td>
                    <td className="num">{fmtSigned(c.limitOffsetBps, 1)}</td>
                    <td style={{ color: STATUS_COLOR[c.status], fontWeight: 600 }}>
                      {STATUS_TEXT[c.status]}
                      {c.filled > 0 && c.status !== 'filled' ? ` ${c.filled}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
            <Chip>待发 {children.filter((c) => c.status === 'pending').length}</Chip>
            <Chip phase="m4">在途 {children.filter((c) => c.status === 'active' || c.status === 'partial').length}</Chip>
            <Chip kind="down">已成 {children.filter((c) => c.status === 'filled').length}</Chip>
            <Chip kind="warn">撤单 {children.filter((c) => c.status === 'cancelled').length}</Chip>
            <Chip kind="neg">
              拦截 {children.filter((c) => c.status === 'blocked' || c.status === 'rejected').length}
            </Chip>
          </div>
        </>
      ) : (
        <Empty>
          尚未产生母单
          <div className="row" style={{ gap: 6, marginTop: 4 }}>
            <button className="btn sm" onClick={() => forceOrder('buy')}>
              手动买入
            </button>
            <button className="btn sm" onClick={() => forceOrder('sell')}>
              手动卖出
            </button>
          </div>
        </Empty>
      )}
    </Card>
  );
}
