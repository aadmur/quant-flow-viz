import { explainDecision } from '../../model/signal';
import { fmtSigned } from '../../core/format';
import { useSnap, useSessionData } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { Gauge, Sparkline } from '../charts/Charts';
import { Card } from '../ui/Card';
import { Chip, Stat } from '../ui/Controls';

const ACTION_TEXT = { buy: '买入', sell: '卖出', hold: '观望' } as const;

export function ModelPanel() {
  const snap = useSnap();
  const openDetail = useSession((s) => s.openDetail);
  const d = snap.decision;

  return (
    <Card
      phase="m2"
      span={4}
      active={snap.metrics.activePhase === 'm2'}
      pulsing={d.flipped}
      onOpen={() => openDetail('m2')}
      right={
        <Chip kind={d.action === 'buy' ? 'up' : d.action === 'sell' ? 'down' : undefined}>
          {d.action === 'hold' ? '未触发' : '已触发'}
        </Chip>
      }
      footer={<span>{explainDecision(d)}</span>}
    >
      <div className="score-gauge">
        <div className="gauge-wrap">
          <Gauge value={d.score} threshold={d.threshold} />
          <div className="gauge-center" style={{ color: d.score > 0 ? 'var(--up)' : d.score < 0 ? 'var(--down)' : 'var(--text-3)' }}>
            {fmtSigned(d.score, 2)}
          </div>
        </div>
        <div className="decision-badge">
          <span className={`decision-action ${d.action}`}>{ACTION_TEXT[d.action]}</span>
          <span className="tiny muted">
            阈值 ±{d.threshold.toFixed(2)} · 置信度 <b className="num">{(d.confidence * 100).toFixed(0)}%</b>
          </span>
          <div className="meter" style={{ marginTop: 2 }}>
            <i style={{ width: `${d.confidence * 100}%`, background: d.confidence > 0.6 ? 'var(--m2)' : 'var(--border-strong)' }} />
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 6 }}>
        {d.factors.map((f) => {
          const w = Math.abs(f.raw) * 50;
          return (
            <div className="factor-row" key={f.key}>
              <span className="factor-name">
                {f.label}
                <span className="tiny muted" style={{ marginLeft: 3 }}>
                  {(f.weight * 100).toFixed(0)}%
                </span>
              </span>
              <div className="factor-track" title={`原始值 ${f.raw.toFixed(3)} · 贡献 ${f.contribution.toFixed(3)}`}>
                <i
                  className={`factor-fill ${f.raw >= 0 ? 'pos' : 'neg'}`}
                  style={
                    f.raw >= 0
                      ? { left: '50%', width: `${w}%` }
                      : { right: '50%', width: `${w}%` }
                  }
                />
              </div>
              <span
                className="factor-val"
                style={{ color: f.raw > 0.05 ? 'var(--up)' : f.raw < -0.05 ? 'var(--down)' : 'var(--text-3)' }}
              >
                {fmtSigned(f.raw, 2)}
              </span>
            </div>
          );
        })}
      </div>

      <div>
        <div className="row-between tiny muted" style={{ marginBottom: 2 }}>
          <span>综合分轨迹（近 80 tick）</span>
          <span>
            越过 ±{d.threshold.toFixed(2)} 即开仓 · 已翻转 <b className="num">{snap.metrics.decisionFlips}</b> 次
          </span>
        </div>
        <ScoreTrace />
      </div>

      <div className="stat-grid c3">
        <Stat label="决策翻转次数" value={snap.metrics.decisionFlips} small />
        <Stat
          label="本 tick 异动"
          value={snap.anomaliesNow.length}
          small
          color={snap.anomaliesNow.length > 0 ? 'var(--m5)' : undefined}
        />
        <Stat label="置信区间" value={d.confidence > 0.6 ? '强' : d.confidence > 0.35 ? '中' : '弱'} small />
      </div>
    </Card>
  );
}

/** 综合分历史：直接从快照序列取，无需引擎额外存储 */
function ScoreTrace() {
  const session = useSessionData();
  const snap = useSnap();
  const from = Math.max(0, snap.tick - 79);
  const scores = session.snaps.slice(from, snap.tick + 1).map((s) => s.decision.score);
  const th = snap.decision.threshold;

  return (
    <div style={{ position: 'relative' }}>
      <Sparkline values={scores} color="var(--m2)" height={42} strokeWidth={1.3} />
      <div
        className="tiny num"
        style={{
          position: 'absolute',
          right: 0,
          bottom: `calc(${50 + th * 50}% - 8px)`,
          color: 'var(--up)',
          opacity: 0.65,
          fontSize: 8.5,
        }}
      >
        +{th.toFixed(2)}
      </div>
      <div
        className="tiny num"
        style={{
          position: 'absolute',
          right: 0,
          bottom: `calc(${50 - th * 50}% - 8px)`,
          color: 'var(--down)',
          opacity: 0.65,
          fontSize: 8.5,
        }}
      >
        −{th.toFixed(2)}
      </div>
    </div>
  );
}
