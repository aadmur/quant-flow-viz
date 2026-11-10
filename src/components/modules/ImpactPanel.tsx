import { fmtMoney, fmtSigned } from '../../core/format';
import { useSnap } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { ImpactCurve } from '../charts/Charts';
import { Card } from '../ui/Card';
import { Stat } from '../ui/Controls';

export function ImpactPanel() {
  const snap = useSnap();
  const openDetail = useSession((s) => s.openDetail);

  const im = snap.impact;
  const total = Math.max(im.marginalPermanentBps + im.temporaryBps, 0.001);
  const permPct = (im.marginalPermanentBps / total) * 100;
  const tempPct = (im.temporaryBps / total) * 100;

  const deviation = ((snap.price - im.counterfactualPrice) / im.counterfactualPrice) * 10000;
  const targetQty = snap.parent?.targetQty ?? 0;
  // 一次性砸盘与拆单实付严格同口径：同起点、只算本单增量，差别只在成交节奏
  const oneShotCost = im.oneShotCostBps;
  const saving = oneShotCost - im.avgCostBps;

  return (
    <Card
      phase="m5"
      span={7}
      active={snap.metrics.activePhase === 'm5'}
      pulsing={snap.fillCount > 0 && im.temporaryBps > im.permanentBps * 0.6}
      onOpen={() => openDetail('m5')}
      footer={
        <div className="row-between">
          <span>
            已消耗盘口深度 <b className="num">{im.depthConsumed}</b> 股 · 冲击成本{' '}
            <b className="num" style={{ color: 'var(--neg)' }}>
              {fmtMoney(im.costYuan)}
            </b>{' '}
            元
          </span>
          <span className="muted">
            实际价 {snap.price.toFixed(2)} vs 反事实 {im.counterfactualPrice.toFixed(2)}
          </span>
        </div>
      }
    >
      <div className="impact-split">
        <div className="col" style={{ gap: 10 }}>
          <div className="stat-grid c3">
            <Stat
              label="永久冲击"
              value={`${im.marginalPermanentBps.toFixed(1)}`}
              hint={`bp · 本单 · 累计 ${im.permanentBps.toFixed(1)}`}
              color="var(--m5)"
            />
            <Stat
              label="临时冲击"
              value={`${im.temporaryBps.toFixed(1)}`}
              hint="bp · 会衰减"
              color="var(--warn)"
            />
            <Stat
              label="合计偏离"
              value={`${fmtSigned(deviation, 1)}`}
              hint="bp · 现价 vs 反事实"
              color={deviation > 0 ? 'var(--neg)' : 'var(--pos)'}
            />
          </div>

          <div>
            <div className="row-between tiny muted" style={{ marginBottom: 3 }}>
              <span>冲击结构</span>
              <span>
                永久 {permPct.toFixed(0)}% / 临时 {tempPct.toFixed(0)}%
              </span>
            </div>
            <div className="impact-bar">
              <i className="perm" style={{ width: `${permPct}%` }} />
              <i className="temp" style={{ width: `${tempPct}%` }} />
            </div>
          </div>

          <div className="col" style={{ gap: 4 }}>
            <div className="row-between small">
              <span className="muted">反事实 · 一次性砸盘 {targetQty} 股</span>
              <span className="num" style={{ color: 'var(--neg)' }}>
                {oneShotCost.toFixed(1)}bp
              </span>
            </div>
            <div className="row-between small">
              <span className="muted">实际 · 拆单已成交单位成本</span>
              <span className="num" style={{ color: 'var(--m5)' }}>
                {im.avgCostBps.toFixed(1)}bp
              </span>
            </div>
            <div className="row-between small" style={{ paddingTop: 3, borderTop: '1px dashed var(--border)' }}>
              <span className="muted">拆单节省</span>
              <span className="num" style={{ color: saving > 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 700 }}>
                {fmtSigned(saving, 1)}bp
              </span>
            </div>
            <div className="tiny muted" style={{ lineHeight: 1.5 }}>
              两组数字同起点、同口径，只差成交节奏。永久冲击只取决于总量，
              拆单真正省下的是<b>临时冲击</b>：一次性成交把全部委托量压在冲击峰值上，
              拆开后每笔都在衰减后的水平成交。
            </div>
          </div>
        </div>

        <div>
          <div className="tiny muted" style={{ marginBottom: 2 }}>
            冲击衰减轨迹（近 90 tick）
          </div>
          <ImpactCurve curve={im.curve} permanentBps={im.permanentBps} height={104} />
          <div className="chart-legend" style={{ marginTop: 4 }}>
            <span>
              <i style={{ background: 'var(--m5)' }} />
              合计冲击
            </span>
            <span>
              <i style={{ background: 'var(--neg)' }} />
              永久水平线
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
