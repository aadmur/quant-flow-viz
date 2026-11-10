import { useMemo } from 'react';
import { fmtPct, fmtSigned, clamp } from '../../core/format';
import { ANOMALY_META } from '../../model/anomaly';
import { useSnap, useSessionData } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { PriceChart } from '../charts/Charts';
import { Card } from '../ui/Card';
import { Chip, Empty, Sev } from '../ui/Controls';

export function MarketPanel() {
  const snap = useSnap();
  const session = useSessionData();
  const openDetail = useSession((s) => s.openDetail);

  const visibleFills = useMemo(() => session.fills.slice(0, snap.fillCount), [session.fills, snap.fillCount]);
  const recentAnomalies = useMemo(() => {
    const upto = session.anomalies.filter((a) => a.tick <= snap.tick);
    return upto.slice(-4).reverse();
  }, [session.anomalies, snap.tick]);

  const maxBook = Math.max(
    ...snap.book.bids.map((b) => b.size),
    ...snap.book.asks.map((a) => a.size),
    1,
  );
  const bestBid = snap.book.bids[0];
  const bestAsk = snap.book.asks[0];
  const spread = bestAsk && bestBid ? bestAsk.price - bestBid.price : 0;
  const spreadBps = bestBid ? (spread / bestBid.price) * 10000 : 0;

  const bidSum = snap.book.bids.reduce((a, b) => a + b.size, 0);
  const askSum = snap.book.asks.reduce((a, b) => a + b.size, 0);
  const imbalance = bidSum + askSum > 0 ? (bidSum - askSum) / (bidSum + askSum) : 0;

  return (
    <Card
      phase="m1"
      span={5}
      active={snap.metrics.activePhase === 'm1'}
      pulsing={snap.anomaliesNow.length > 0}
      onOpen={() => openDetail('m1')}
      footer={
        <div className="row-between">
          <span>
            市场状态 <b>{snap.regime}</b> · 累计异动 <b className="num">{snap.anomalyCount}</b> 条
          </span>
          <span className="muted">
            买/卖挂单失衡{' '}
            <b className="num" style={{ color: imbalance > 0 ? 'var(--up)' : 'var(--down)' }}>
              {fmtSigned(imbalance * 100, 1)}%
            </b>
          </span>
        </div>
      }
    >
      <div className="m1-top">
        {/* 观察列表 */}
        <div>
          <div className="tiny muted" style={{ marginBottom: 3 }}>
            观察列表 · {snap.quotes.length} 只
          </div>
          <div className="quote-list">
            {snap.quotes.map((q) => {
              const focus = q.symbol.code === session.symbol.code;
              return (
                <div className={`quote-row ${focus ? 'is-focus' : ''}`} key={q.symbol.code}>
                  <span className="q-code">{q.symbol.code}</span>
                  <span className="q-name">{q.symbol.name}</span>
                  <span className="q-px" style={{ color: q.changePct >= 0 ? 'var(--up)' : 'var(--down)' }}>
                    {q.last.toFixed(2)}
                  </span>
                  <span className="q-chg" style={{ color: q.changePct >= 0 ? 'var(--up)' : 'var(--down)' }}>
                    {fmtPct(q.changePct)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 五档盘口 */}
        <div className="book-col">
          <div className="tiny muted" style={{ marginBottom: 3 }}>
            盘口 L2
          </div>
          <div className="book-ladder">
            {[...snap.book.asks].reverse().map((lv, i) => (
              <div className="book-row ask" key={`a${i}`}>
                <i className="book-bg" style={{ width: `${clamp(lv.size / maxBook, 0, 1) * 100}%` }} />
                <span className="book-px">{lv.price.toFixed(2)}</span>
                <span className="book-sz">{lv.size}</span>
              </div>
            ))}
            <div className="book-spread">
              <span>价差</span>
              <span className="num">{spreadBps.toFixed(1)}bp</span>
            </div>
            {snap.book.bids.map((lv, i) => (
              <div className="book-row bid" key={`b${i}`}>
                <i className="book-bg" style={{ width: `${clamp(lv.size / maxBook, 0, 1) * 100}%` }} />
                <span className="book-px">{lv.price.toFixed(2)}</span>
                <span className="book-sz">{lv.size}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PriceChart
        bars={snap.bars}
        baselinePrices={session.baselinePrices}
        fills={visibleFills}
        tick={snap.tick}
        height={132}
      />

      <div className="chart-legend">
        <span>
          <i style={{ background: 'var(--up)' }} />
          阳线 / 上涨
        </span>
        <span>
          <i style={{ background: 'var(--down)' }} />
          阴线 / 下跌
        </span>
        <span>
          <i style={{ background: 'var(--text-3)' }} />
          无我方交易的反事实价格
        </span>
        <span>
          <i style={{ background: 'var(--accent)', borderRadius: '50%' }} />
          我方成交
        </span>
      </div>

      <div className="anomaly-feed">
        {recentAnomalies.length === 0 ? (
          <Empty>等待异动信号……</Empty>
        ) : (
          recentAnomalies.map((a) => {
            const meta = ANOMALY_META[a.kind];
            return (
              <div
                key={a.id}
                className={`anomaly-item tone-${'m1'} ${a.tick === snap.tick ? 'fresh' : ''}`}
                style={{ ['--tone' as string]: meta.color }}
                title={a.detail}
              >
                <span className="anomaly-code">{meta.code}</span>
                <span className="anomaly-text">{a.label}</span>
                <Sev level={a.severity} />
                <span className="anomaly-tick">{a.tick}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
        {Object.entries(ANOMALY_META).map(([k, m]) => (
          <Chip key={k} phase="m1">
            {m.label}
          </Chip>
        ))}
      </div>
    </Card>
  );
}
