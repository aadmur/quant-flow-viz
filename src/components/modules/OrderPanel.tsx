import { ALGO_HINTS, ALGO_LABELS, ALGO_SHORT, INITIAL_CAPITAL } from '../../model/params';
import type { AlgoKind, ChildStatus } from '../../core/types';
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

          <div>
            <div className="row-between tiny muted" style={{ marginBottom: 3 }}>
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
