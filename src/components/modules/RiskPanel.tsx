import { fmtMoney, fmtSigned } from '../../core/format';
import { breakerLabel } from '../../model/risk';
import { useSnap } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { Card } from '../ui/Card';
import { Chip, Meter, Stat } from '../ui/Controls';

function ratio(v: number, limit: number): number {
  return limit > 0 ? v / limit : 0;
}

export function RiskPanel() {
  const snap = useSnap();
  const openDetail = useSession((s) => s.openDetail);
  const r = snap.risk;

  // 被闸门拦下或告警的子单（最新 3 条），体现「风控在上游」
  const riskActions = (snap.parent?.children ?? [])
    .filter((c) => c.riskVerdict !== 'pass')
    .slice(-3);

  const gates = [
    {
      name: '单票敞口',
      v: Math.abs(r.exposure),
      limit: r.exposureLimit,
      display: `${(Math.abs(r.exposure) / 10000).toFixed(0)} / ${(r.exposureLimit / 10000).toFixed(0)}万`,
      unit: '元',
    },
    {
      name: '95% VaR',
      v: r.var95,
      limit: r.varLimit,
      display: `${(r.var95 / 10000).toFixed(1)} / ${(r.varLimit / 10000).toFixed(1)}万`,
      unit: '元',
    },
    {
      name: '回撤熔断',
      v: r.drawdownPct,
      limit: r.drawdownLimitPct,
      display: `${r.drawdownPct.toFixed(1)} / ${r.drawdownLimitPct.toFixed(1)}%`,
      unit: '%',
    },
    {
      name: '下单速率',
      v: r.orderRate,
      limit: r.orderRateLimit,
      display: `${r.orderRate} / ${r.orderRateLimit} 笔`,
      unit: '笔/min',
    },
  ];

  return (
    <Card
      phase="e1"
      span={3}
      active={snap.metrics.activePhase === 'e1'}
      pulsing={r.breaker !== 'closed'}
      onOpen={() => openDetail('e1')}
      right={
        <Chip kind={r.breaker === 'closed' ? 'down' : r.breaker === 'open' ? 'neg' : 'warn'}>
          {breakerLabel(r.breaker)}
        </Chip>
      }
      footer={
        <div className="row-between">
          <span>
            放行 <b className="num">{r.passed}</b> · 告警 <b className="num">{r.warned}</b> · 拦截{' '}
            <b className="num" style={{ color: r.blocked > 0 ? 'var(--neg)' : undefined }}>
              {r.blocked}
            </b>
          </span>
        </div>
      }
    >
      <div className="col" style={{ gap: 5 }}>
        {gates.map((g) => {
          const rt = ratio(g.v, g.limit);
          const cls = rt >= 1 ? 'blocked' : rt > 0.85 ? 'warn' : '';
          return (
            <div className={`gate ${cls}`} key={g.name} title={`${g.name} ${g.display} ${g.unit}`}>
              <i
                className="dot"
                style={{ background: rt >= 1 ? 'var(--neg)' : rt > 0.85 ? 'var(--warn)' : 'var(--pos)' }}
              />
              <span className="gate-name">{g.name}</span>
              <span className="gate-val">{g.display}</span>
            </div>
          );
        })}
      </div>

      <div>
        <div className="row-between tiny muted" style={{ marginBottom: 3 }}>
          <span>综合占用</span>
          <span className="num">{(r.utilization * 100).toFixed(0)}%</span>
        </div>
        <Meter
          value={Math.min(1, r.utilization)}
          tone={r.utilization >= 1 ? 'var(--neg)' : r.utilization > 0.85 ? 'var(--warn)' : 'var(--e1)'}
        />
      </div>

      <div className="stat-grid c2">
        <Stat label="名义敞口" value={fmtMoney(Math.abs(r.exposure))} small />
        <Stat
          label="未实现盈亏"
          value={fmtSigned(snap.review.pnl / 10000, 2) + '万'}
          small
          color={snap.review.pnl >= 0 ? 'var(--up)' : 'var(--down)'}
        />
      </div>

      <div className="col" style={{ gap: 4 }}>
        <div className="row-between tiny muted">
          <span>敞口构成</span>
          <span>占组合权重</span>
        </div>
        {snap.positions.map((p) => (
          <div className="row" key={p.symbol} style={{ gap: 6, alignItems: 'center' }}>
            <span className="tiny" style={{ width: 50, flexShrink: 0, color: 'var(--text-2)' }}>
              {p.name}
            </span>
            <div className="meter" style={{ flex: 1 }}>
              <i
                style={{
                  width: `${(p.weight / Math.max(...snap.positions.map((x) => x.weight), 0.001)) * 100}%`,
                  background: 'var(--e1)',
                }}
              />
            </div>
            <span className="tiny num" style={{ width: 38, textAlign: 'right' }}>
              {(p.weight * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <div className="col" style={{ gap: 3 }}>
        <div className="row-between tiny muted">
          <span>最近风控动作</span>
          <span>
            告警 {r.warned} · 拦截 {r.blocked}
          </span>
        </div>
        {riskActions.length === 0 ? (
          <div className="tiny muted">暂无告警或拦截记录</div>
        ) : (
          riskActions.map((c) => (
            <div className="row" key={c.id} style={{ gap: 6, alignItems: 'center' }}>
              <span
                className="tiny"
                style={{
                  color: c.riskVerdict === 'block' ? 'var(--neg)' : 'var(--warn)',
                  fontWeight: 600,
                  width: 26,
                  flexShrink: 0,
                }}
              >
                {c.riskVerdict === 'block' ? '拦截' : '告警'}
              </span>
              <span className="tiny num" style={{ flexShrink: 0 }}>
                {c.id}
              </span>
              <span
                className="tiny muted"
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={c.rejectReason ?? '接近风控阈值'}
              >
                {c.rejectReason ?? '接近风控阈值'}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="tiny muted" style={{ lineHeight: 1.55, marginTop: 'auto' }}>
        风控位于链路<b>上游</b>：子单下发前先过闸门，被拦截的委托根本不会进入撮合，
        因此会直接表现为成交率下降与机会成本上升。
      </div>
    </Card>
  );
}
