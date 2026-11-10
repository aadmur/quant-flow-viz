import { fmtMoney, fmtMoneySigned, fmtSigned } from '../../core/format';
import { INITIAL_CAPITAL } from '../../model/params';
import { useSnap, useSessionData } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { EquityCurve } from '../charts/Charts';
import { Card } from '../ui/Card';
import { Stat } from '../ui/Controls';

const COMPONENTS = [
  { key: 'delay', label: '延迟成本', hint: '决策 → 子单激活期间价格漂移' },
  { key: 'marketDrift', label: '市场漂移', hint: '子单激活 → 成交期间市场自己走的' },
  { key: 'execution', label: '执行成本', hint: '成交价 vs 成交时中间价，负值=赚到价差' },
  { key: 'opportunity', label: '机会成本', hint: '未成交部分对应的价格变动' },
] as const;

export function ReviewPanel() {
  const snap = useSnap();
  const session = useSessionData();
  const openDetail = useSession((s) => s.openDetail);
  const r = snap.review;
  const sp = r.slippage;

  const values = COMPONENTS.map((c) => sp[c.key]);
  const maxAbs = Math.max(...values.map(Math.abs), Math.abs(sp.total), 1);

  // 真实权益序列（引擎逐 tick 记录），只取最近 90 个点
  const equity = session.equityCurve.slice(Math.max(0, snap.tick - 89), snap.tick + 1);

  return (
    <Card
      phase="m6"
      span={5}
      active={snap.metrics.activePhase === 'm6'}
      onOpen={() => openDetail('m6')}
      footer={
        <div className="row-between">
          <span>
            成交率 <b className="num">{(snap.execution.fillRate * 100).toFixed(0)}%</b> · 其中冲击{' '}
            <b className="num" style={{ color: 'var(--m5)' }}>
              {sp.impact.toFixed(1)}bp
            </b>{' '}
            <span className="tiny">（execution 的组成部分，不重复求和）</span>
          </span>
        </div>
      }
    >
      <div className="stat-grid c4">
        <Stat
          label="盈亏"
          value={fmtMoneySigned(r.pnl)}
          color={r.pnl >= 0 ? 'var(--up)' : 'var(--down)'}
          hint={`权益 ${fmtMoney(r.equity)}`}
        />
        <Stat
          label="总滑点"
          value={`${fmtSigned(sp.total, 1)}bp`}
          color={sp.total > 0 ? 'var(--neg)' : 'var(--pos)'}
        />
        <Stat
          label="vs VWAP"
          value={`${fmtSigned(r.vsVwapBps, 1)}bp`}
          color={r.vsVwapBps > 0 ? 'var(--neg)' : 'var(--pos)'}
          hint={r.vwapBenchmark > 0 ? `基准 ${r.vwapBenchmark.toFixed(2)}` : undefined}
        />
        <Stat label="最大回撤" value={`${r.maxDrawdownPct.toFixed(1)}%`} color="var(--warn)" />
      </div>

      <div>
        <div className="row-between tiny muted" style={{ marginBottom: 4 }}>
          <span>滑点归因（四项相加 = 总滑点）</span>
          <span className="num">合计 {fmtSigned(sp.total, 1)}bp</span>
        </div>
        <div className="waterfall">
          {COMPONENTS.map((c) => {
            const v = sp[c.key];
            const w = (Math.abs(v) / maxAbs) * 50;
            return (
              <div className="wf-row" key={c.key} title={c.hint}>
                <span className="dim">{c.label}</span>
                <div className="wf-track">
                  <i
                    className="wf-bar"
                    style={
                      v >= 0
                        ? { left: '50%', width: `${w}%`, background: 'var(--neg)' }
                        : { right: '50%', width: `${w}%`, background: 'var(--pos)' }
                    }
                  />
                </div>
                <span
                  className="wf-val"
                  style={{ color: v > 0 ? 'var(--neg)' : v < 0 ? 'var(--pos)' : 'var(--text-3)' }}
                >
                  {fmtSigned(v, 1)}
                </span>
              </div>
            );
          })}
          <div className="wf-row" style={{ paddingTop: 3, borderTop: '1px dashed var(--border)', fontWeight: 700 }}>
            <span>总滑点</span>
            <div className="wf-track">
              <i
                className="wf-bar"
                style={
                  sp.total >= 0
                    ? { left: '50%', width: `${(Math.abs(sp.total) / maxAbs) * 50}%`, background: 'var(--neg)' }
                    : { right: '50%', width: `${(Math.abs(sp.total) / maxAbs) * 50}%`, background: 'var(--pos)' }
                }
              />
            </div>
            <span className="wf-val" style={{ color: sp.total > 0 ? 'var(--neg)' : 'var(--pos)' }}>
              {fmtSigned(sp.total, 1)}
            </span>
          </div>
        </div>
      </div>

      <div>
        <div className="row-between tiny muted" style={{ marginBottom: 2 }}>
          <span>权益曲线（虚线 = 初始资金）</span>
          <span>
            类夏普 <b className="num">{r.sharpeLike.toFixed(2)}</b> · 胜率{' '}
            <b className="num">{r.winRate.toFixed(0)}%</b>
          </span>
        </div>
        <EquityCurve values={equity} baseline={INITIAL_CAPITAL} height={62} />
      </div>
    </Card>
  );
}
