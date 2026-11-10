import { fmtMoney, fmtSigned } from '../../core/format';
import { buildCorrelationMatrix } from '../../model/portfolio';
import { useSnap } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { Heatmap } from '../charts/Charts';
import { Card } from '../ui/Card';
import { Stat } from '../ui/Controls';

const SECTOR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#d97706', '#db2777', '#0d9488'];

export function PortfolioPanel() {
  const snap = useSnap();
  const openDetail = useSession((s) => s.openDetail);

  const totalPnl = snap.positions.reduce((a, p) => a + p.pnl, 0);
  const heat = buildCorrelationMatrix();

  return (
    <Card
      phase="e2"
      span={3}
      active={snap.metrics.activePhase === 'e2'}
      onOpen={() => openDetail('e2')}
      footer={
        <div className="row-between">
          <span>
            持仓 <b className="num">{snap.positions.length}</b> 只 · 合计盈亏{' '}
            <b className="num" style={{ color: totalPnl >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {fmtMoney(totalPnl)}
            </b>
          </span>
        </div>
      }
    >
      <table className="mini-table">
        <thead>
          <tr>
            <th>标的</th>
            <th style={{ textAlign: 'right' }}>数量</th>
            <th style={{ textAlign: 'right' }}>盈亏</th>
          </tr>
        </thead>
        <tbody>
          {snap.positions.map((p) => (
            <tr key={p.symbol}>
              <td>
                <div style={{ fontWeight: 600, fontSize: 11 }}>{p.name}</div>
                <div className="tiny muted num">
                  {p.symbol} · {(p.weight * 100).toFixed(0)}%
                </div>
              </td>
              <td className="num">{Math.round(p.qty)}</td>
              <td
                className="num"
                style={{ color: p.pnl >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}
              >
                {fmtSigned(p.pnl / 10000, 2)}万
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <div className="tiny muted" style={{ marginBottom: 3 }}>
          行业暴露
        </div>
        <div className="exposure-bar">
          {snap.exposure.map((e, i) => (
            <i
              key={e.sector}
              style={{ width: `${e.weight * 100}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
              title={`${e.sector} ${fmtMoney(e.value)} (${(e.weight * 100).toFixed(1)}%)`}
            />
          ))}
        </div>
        <div className="chart-legend" style={{ marginTop: 4 }}>
          {snap.exposure.map((e, i) => (
            <span key={e.sector}>
              <i style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
              {e.sector} {(e.weight * 100).toFixed(0)}%
            </span>
          ))}
        </div>
      </div>

      <div>
        <div className="tiny muted" style={{ marginBottom: 3 }}>
          相关性矩阵（同行业更高 → 分散化不足）
        </div>
        <Heatmap labels={heat.codes} matrix={heat.matrix} />
      </div>

      <div className="stat-grid c2">
        <Stat label="总市值" value={fmtMoney(snap.positions.reduce((a, p) => a + p.marketValue, 0))} small />
        <Stat
          label="集中度"
          value={`${(Math.max(...snap.positions.map((p) => p.weight), 0) * 100).toFixed(0)}%`}
          small
          color="var(--warn)"
        />
      </div>
    </Card>
  );
}
