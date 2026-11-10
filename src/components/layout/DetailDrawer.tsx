import { useEffect } from 'react';
import { PHASE_MAP } from '../../core/phases';
import { fmtBps, fmtMoney, fmtSigned } from '../../core/format';
import { ANOMALY_META } from '../../model/anomaly';
import { ALGO_HINTS, ALGO_LABELS, FOCUS_SYMBOL } from '../../model/params';
import { oneShotImpactBps } from '../../model/impact';
import { useSnap, useSessionData } from '../../store/selectors';
import { useSession } from '../../store/useSession';
import { Heatmap, ImpactCurve, PriceChart } from '../charts/Charts';
import { buildCorrelationMatrix } from '../../model/portfolio';
import { Chip, Empty, Stat } from '../ui/Controls';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="col" style={{ gap: 7 }}>
      <div className="drawer-section-title">{title}</div>
      {children}
    </section>
  );
}

export function DetailDrawer() {
  const detail = useSession((s) => s.detail);
  const close = useSession((s) => s.closeDetail);
  const snap = useSnap();
  const session = useSessionData();

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, close]);

  if (!detail) return null;
  const meta = PHASE_MAP[detail];

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className={`drawer tone-${detail}`} role="dialog" aria-modal="true" aria-label={`${meta.title}详情`}>
        <header className="drawer-head">
          <span className="card-code" style={{ marginTop: 2 }}>
            {meta.code}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{meta.title}</div>
            <div className="small muted" style={{ marginTop: 1 }}>
              {meta.question}
            </div>
          </div>
          <button className="btn icon" onClick={close} aria-label="关闭详情">
            ✕
          </button>
        </header>
        <div className="drawer-body">
          {detail === 'm1' && <M1Detail />}
          {detail === 'm2' && <M2Detail />}
          {detail === 'm3' && <M3Detail />}
          {detail === 'm4' && <M4Detail />}
          {detail === 'm5' && <M5Detail />}
          {detail === 'm6' && <M6Detail />}
          {detail === 'e1' && <E1Detail />}
          {detail === 'e2' && <E2Detail />}
          {detail === 'e3' && <E3Detail />}
        </div>
      </aside>
    </>
  );

  /* ---------------- 各阶段明细 ---------------- */

  function M1Detail() {
    const upto = session.anomalies.filter((a) => a.tick <= snap.tick);
    const byKind = new Map<string, number>();
    for (const a of upto) byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1);

    return (
      <>
        <Section title="识别概况">
          <div className="stat-grid c3">
            <Stat label="累计异动" value={upto.length} />
            <Stat label="本 tick 新增" value={snap.anomaliesNow.length} />
            <Stat label="市场状态" value={snap.regime} small />
          </div>
          <div className="row" style={{ gap: 5, flexWrap: 'wrap' }}>
            {[...byKind.entries()].map(([k, v]) => (
              <Chip key={k} phase="m1">
                {ANOMALY_META[k as keyof typeof ANOMALY_META].label} {v}
              </Chip>
            ))}
          </div>
        </Section>

        <Section title="检测规则">
          <dl className="kv">
            <dt>价格突破</dt>
            <dd>超出近 20 tick 极值 &gt; 3bp</dd>
            <dt>量能突增</dt>
            <dd>成交量为 20 tick 均量 &gt; 2.1×</dd>
            <dt>波动跳升</dt>
            <dd>单 tick 收益 / σ &gt; 2.5</dd>
            <dt>盘口失衡</dt>
            <dd>五档买卖差 &gt; 32%</dd>
            <dt>流动性枯竭</dt>
            <dd>五档总量 &lt; 基准 52%</dd>
          </dl>
        </Section>

        <Section title="异动明细（最近 12 条）">
          {upto.length === 0 ? (
            <Empty>暂无</Empty>
          ) : (
            <table className="mini-table">
              <thead>
                <tr>
                  <th>tick</th>
                  <th>类型</th>
                  <th>实测 / 阈值</th>
                  <th>严重度</th>
                </tr>
              </thead>
              <tbody>
                {upto.slice(-12).reverse().map((a) => (
                  <tr key={a.id}>
                    <td className="num">{a.tick}</td>
                    <td>{ANOMALY_META[a.kind].label}</td>
                    <td className="num">
                      {a.value} / {a.threshold}
                    </td>
                    <td>{'●'.repeat(a.severity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="价格与成交脚印">
          <PriceChart
            bars={snap.bars}
            baselinePrices={session.baselinePrices}
            fills={session.fills.slice(0, snap.fillCount)}
            tick={snap.tick}
            height={140}
          />
        </Section>
      </>
    );
  }

  function M2Detail() {
    const d = snap.decision;
    return (
      <>
        <Section title="判别结果">
          <div className="stat-grid c3">
            <Stat label="综合分" value={fmtSigned(d.score, 3)} color={d.score > 0 ? 'var(--up)' : 'var(--down)'} />
            <Stat label="置信度" value={`${(d.confidence * 100).toFixed(0)}%`} />
            <Stat
              label="动作"
              value={d.action === 'buy' ? '买入' : d.action === 'sell' ? '卖出' : '观望'}
              color={d.action === 'buy' ? 'var(--up)' : d.action === 'sell' ? 'var(--down)' : undefined}
            />
          </div>
        </Section>

        <Section title="因子分解">
          <table className="mini-table">
            <thead>
              <tr>
                <th>因子</th>
                <th style={{ textAlign: 'right' }}>原始值</th>
                <th style={{ textAlign: 'right' }}>权重</th>
                <th style={{ textAlign: 'right' }}>贡献</th>
              </tr>
            </thead>
            <tbody>
              {d.factors.map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td className="num">{f.raw.toFixed(3)}</td>
                  <td className="num">{(f.weight * 100).toFixed(1)}%</td>
                  <td
                    className="num"
                    style={{ color: f.contribution > 0 ? 'var(--up)' : f.contribution < 0 ? 'var(--down)' : undefined }}
                  >
                    {f.contribution.toFixed(3)}
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>合计</td>
                <td className="num">—</td>
                <td className="num">100%</td>
                <td className="num">{d.score.toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
          <div className="tiny muted">
            阈值 ±{d.threshold.toFixed(2)}：综合分需越过该值才开仓。把阈值调高 → 交易更少更挑；
            调低 → 更频繁触发，但噪声交易与冲击成本同步上升。
          </div>
        </Section>

        <Section title="因子口径">
          <dl className="kv">
            <dt>动量</dt>
            <dd>近 16 tick 收益 / 4σ</dd>
            <dt>量能</dt>
            <dd>近 4 tick 均量 / 20 tick 均量</dd>
            <dt>盘口失衡</dt>
            <dd>(买五档 − 卖五档) / 合计</dd>
            <dt>波动率</dt>
            <dd>近 8 tick σ / 近 40 tick σ</dd>
            <dt>趋势强度</dt>
            <dd>近 30 tick 最小二乘斜率</dd>
          </dl>
        </Section>
      </>
    );
  }

  function M3Detail() {
    const p = snap.parent;
    if (!p) return <Empty>尚未产生母单。可在「E3 异常处理」区域下方或 M3 卡片中手动触发一笔。</Empty>;
    return (
      <>
        <Section title="母单">
          <dl className="kv">
            <dt>编号</dt>
            <dd>{p.id}</dd>
            <dt>方向</dt>
            <dd style={{ color: p.side === 'buy' ? 'var(--up)' : 'var(--down)' }}>
              {p.side === 'buy' ? '买入' : '卖出'}
            </dd>
            <dt>目标数量</dt>
            <dd>{p.targetQty} 股</dd>
            <dt>已成交</dt>
            <dd>{p.filledQty} 股</dd>
            <dt>成交均价</dt>
            <dd>{p.avgPrice > 0 ? p.avgPrice.toFixed(3) : '—'}</dd>
            <dt>到达价</dt>
            <dd>{p.arrivalPrice.toFixed(2)}</dd>
            <dt>算法</dt>
            <dd>{ALGO_LABELS[p.algo]}</dd>
            <dt>触发综合分</dt>
            <dd>{p.triggerScore.toFixed(3)}</dd>
          </dl>
          <div className="banner">{ALGO_HINTS[p.algo]}</div>
        </Section>

        <Section title={`子单明细（${p.children.length}）`}>
          <table className="mini-table">
            <thead>
              <tr>
                <th>#</th>
                <th style={{ textAlign: 'right' }}>量</th>
                <th style={{ textAlign: 'right' }}>限价</th>
                <th style={{ textAlign: 'right' }}>已成</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {p.children.map((c) => (
                <tr key={c.id}>
                  <td className="num">{c.seq}</td>
                  <td className="num">{c.qty}</td>
                  <td className="num">{c.limitPrice > 0 ? c.limitPrice.toFixed(2) : '—'}</td>
                  <td className="num">{c.filled}</td>
                  <td>
                    <span className={`child-status st-${c.status}`}>{c.status}</span>
                    {c.rejectReason && <div className="tiny muted">{c.rejectReason}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </>
    );
  }

  function M4Detail() {
    const fills = session.fills.filter((f) => f.tick <= snap.tick);
    const e = snap.execution;
    return (
      <>
        <Section title="执行质量">
          <div className="stat-grid c3">
            <Stat label="成交率" value={`${(e.fillRate * 100).toFixed(1)}%`} />
            <Stat label="平均滑点" value={fmtBps(e.avgSlippageBps)} color="var(--neg)" />
            <Stat label="最差滑点" value={fmtBps(e.worstSlippageBps)} color="var(--neg)" />
          </div>
          <div className="stat-grid c4">
            <Stat label="成交笔数" value={fills.length} small />
            <Stat label="部成次数" value={e.partialCount} small />
            <Stat label="撤单" value={e.cancelCount} small />
            <Stat label="拒单/拦截" value={e.rejectCount + e.blockedCount} small />
          </div>
        </Section>

        <Section title={`成交回报（${fills.length} 笔）`}>
          {fills.length === 0 ? (
            <Empty>暂无成交</Empty>
          ) : (
            <table className="mini-table">
              <thead>
                <tr>
                  <th>tick</th>
                  <th>方向</th>
                  <th style={{ textAlign: 'right' }}>价格</th>
                  <th style={{ textAlign: 'right' }}>数量</th>
                  <th style={{ textAlign: 'right' }}>滑点</th>
                  <th>通道</th>
                </tr>
              </thead>
              <tbody>
                {[...fills].slice(-24).reverse().map((f) => (
                  <tr key={f.id}>
                    <td className="num">{f.tick}</td>
                    <td style={{ color: f.side === 'buy' ? 'var(--up)' : 'var(--down)' }}>
                      {f.side === 'buy' ? '买' : '卖'}
                    </td>
                    <td className="num">{f.price.toFixed(2)}</td>
                    <td className="num">{f.qty}</td>
                    <td className="num" style={{ color: f.slippageBps > 0 ? 'var(--neg)' : 'var(--pos)' }}>
                      {fmtSigned(f.slippageBps, 1)}
                    </td>
                    <td className="tiny muted">{f.venue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </>
    );
  }

  function M5Detail() {
    const im = snap.impact;
    const params = useSession.getState().params;
    const oneShot = oneShotImpactBps(
      snap.parent?.targetQty ?? 0,
      params.impactCoeff,
      FOCUS_SYMBOL.vol * params.marketVol,
    );
    return (
      <>
        <Section title="冲击分解">
          <div className="stat-grid c3">
            <Stat label="永久" value={`${im.permanentBps.toFixed(2)}bp`} color="var(--m5)" />
            <Stat label="临时" value={`${im.temporaryBps.toFixed(2)}bp`} color="var(--warn)" />
            <Stat label="成本" value={fmtMoney(im.costYuan)} color="var(--neg)" />
          </div>
          <ImpactCurve curve={im.curve} permanentBps={im.permanentBps} height={110} />
        </Section>

        <Section title="模型">
          <div className="banner" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            impact = κ · σ · √(Q / ADV)
          </div>
          <dl className="kv">
            <dt>κ 冲击系数</dt>
            <dd>{params.impactCoeff.toFixed(2)}</dd>
            <dt>σ 日波动</dt>
            <dd>{(FOCUS_SYMBOL.vol * params.marketVol * 100).toFixed(1)}%</dd>
            <dt>Q 累计成交</dt>
            <dd>{im.depthConsumed} 股</dd>
            <dt>ADV</dt>
            <dd>300 万股</dd>
            <dt>一次性砸盘估计</dt>
            <dd style={{ color: 'var(--neg)' }}>{oneShot.toFixed(1)}bp</dd>
            <dt>拆单实际永久冲击</dt>
            <dd style={{ color: 'var(--m5)' }}>{im.permanentBps.toFixed(1)}bp</dd>
          </dl>
          <div className="tiny muted" style={{ lineHeight: 1.6 }}>
            冲击对<b>累积成交量</b>取平方根，因此拆单的收益是次线性的：
            分成 19 笔执行时，总冲击约为一次性砸盘的 1/√19。这就是算法交易存在的根本理由。
          </div>
        </Section>

        <Section title="反事实价格">
          <dl className="kv">
            <dt>实际中间价</dt>
            <dd>{snap.price.toFixed(2)}</dd>
            <dt>无我方交易</dt>
            <dd>{im.counterfactualPrice.toFixed(2)}</dd>
            <dt>偏离</dt>
            <dd style={{ color: 'var(--neg)' }}>
              {(((snap.price - im.counterfactualPrice) / im.counterfactualPrice) * 10000).toFixed(1)}bp
            </dd>
          </dl>
        </Section>
      </>
    );
  }

  function M6Detail() {
    const r = snap.review;
    const sp = r.slippage;
    return (
      <>
        <Section title="盈亏">
          <div className="stat-grid c3">
            <Stat label="盈亏" value={fmtMoney(r.pnl)} color={r.pnl >= 0 ? 'var(--up)' : 'var(--down)'} />
            <Stat label="权益" value={fmtMoney(r.equity)} />
            <Stat label="最大回撤" value={`${r.maxDrawdownPct.toFixed(2)}%`} color="var(--warn)" />
          </div>
        </Section>

        <Section title="滑点四分解">
          <dl className="kv">
            <dt>延迟成本</dt>
            <dd style={{ color: sp.delay > 0 ? 'var(--neg)' : 'var(--pos)' }}>{fmtBps(sp.delay)}</dd>
            <dt>市场漂移</dt>
            <dd style={{ color: sp.marketDrift > 0 ? 'var(--neg)' : 'var(--pos)' }}>
              {fmtBps(sp.marketDrift)}
            </dd>
            <dt>执行成本</dt>
            <dd style={{ color: sp.execution > 0 ? 'var(--neg)' : 'var(--pos)' }}>
              {fmtBps(sp.execution)}
            </dd>
            <dt>机会成本</dt>
            <dd style={{ color: sp.opportunity > 0 ? 'var(--neg)' : 'var(--pos)' }}>
              {fmtBps(sp.opportunity)}
            </dd>
            <dt style={{ fontWeight: 700 }}>总滑点</dt>
            <dd style={{ fontWeight: 700, color: sp.total > 0 ? 'var(--neg)' : 'var(--pos)' }}>
              {fmtBps(sp.total)}
            </dd>
          </dl>
          <div className="tiny muted" style={{ lineHeight: 1.6 }}>
            四项按<b>目标委托量</b>归一后相加恰好等于总滑点。冲击 {fmtBps(sp.impact)} 是执行成本的组成部分，
            只做备忘，再单独加一次就是重复计量。
          </div>
        </Section>

        <Section title="基准对比">
          <dl className="kv">
            <dt>决策到达价</dt>
            <dd>{r.arrivalPrice.toFixed(3)}</dd>
            <dt>市场 VWAP</dt>
            <dd>{r.vwapBenchmark.toFixed(3)}</dd>
            <dt>我方成交均价</dt>
            <dd>{r.ourAvgPrice > 0 ? r.ourAvgPrice.toFixed(3) : '—'}</dd>
            <dt>vs VWAP</dt>
            <dd style={{ color: r.vsVwapBps > 0 ? 'var(--neg)' : 'var(--pos)' }}>{fmtBps(r.vsVwapBps)}</dd>
            <dt>类夏普</dt>
            <dd>{r.sharpeLike.toFixed(2)}</dd>
            <dt>持仓胜率</dt>
            <dd>{r.winRate.toFixed(1)}%</dd>
          </dl>
        </Section>
      </>
    );
  }

  function E1Detail() {
    const r = snap.risk;
    const blocked = (snap.parent?.children ?? []).filter((c) => c.status === 'blocked' || c.status === 'rejected');
    return (
      <>
        <Section title="闸门状态">
          <dl className="kv">
            <dt>熔断状态</dt>
            <dd>{r.breaker}</dd>
            <dt>名义敞口</dt>
            <dd>
              {fmtMoney(Math.abs(r.exposure))} / {fmtMoney(r.exposureLimit)}
            </dd>
            <dt>95% VaR</dt>
            <dd>
              {fmtMoney(r.var95)} / {fmtMoney(r.varLimit)}
            </dd>
            <dt>当前回撤</dt>
            <dd>
              {r.drawdownPct.toFixed(2)}% / {r.drawdownLimitPct.toFixed(1)}%
            </dd>
            <dt>下单速率</dt>
            <dd>
              {r.orderRate} / {r.orderRateLimit} 笔每分钟
            </dd>
            <dt>放行 / 告警 / 拦截</dt>
            <dd>
              {r.passed} / {r.warned} / {r.blocked}
            </dd>
          </dl>
        </Section>

        <Section title="被拦截子单">
          {blocked.length === 0 ? (
            <Empty>本次会话暂未被拦截</Empty>
          ) : (
            <table className="mini-table">
              <thead>
                <tr>
                  <th>子单</th>
                  <th style={{ textAlign: 'right' }}>数量</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                {blocked.map((c) => (
                  <tr key={c.id}>
                    <td className="num">{c.id}</td>
                    <td className="num">{c.qty}</td>
                    <td className="tiny">{c.rejectReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="熔断逻辑">
          <div className="tiny muted" style={{ lineHeight: 1.7 }}>
            回撤 ≥ 4.5% → <b>熔断</b>，全部下单暂停；
            回撤回落至 3.2% 以下且持续 40 tick → <b>恢复观察</b>，仅允许平仓；
            回撤 &lt; 1.8% → <b>正常</b>。
            熔断期间母单不会被取消，但所有待发子单都会在激活时被拦下。
          </div>
        </Section>
      </>
    );
  }

  function E2Detail() {
    const heat = buildCorrelationMatrix();
    const totalMv = snap.positions.reduce((a, p) => a + p.marketValue, 0);
    return (
      <>
        <Section title="持仓">
          <table className="mini-table">
            <thead>
              <tr>
                <th>标的</th>
                <th style={{ textAlign: 'right' }}>数量</th>
                <th style={{ textAlign: 'right' }}>成本</th>
                <th style={{ textAlign: 'right' }}>现价</th>
                <th style={{ textAlign: 'right' }}>盈亏</th>
              </tr>
            </thead>
            <tbody>
              {snap.positions.map((p) => (
                <tr key={p.symbol}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div className="tiny muted num">{p.symbol}</div>
                  </td>
                  <td className="num">{Math.round(p.qty)}</td>
                  <td className="num">{p.avgCost.toFixed(2)}</td>
                  <td className="num">{p.last.toFixed(2)}</td>
                  <td className="num" style={{ color: p.pnl >= 0 ? 'var(--up)' : 'var(--down)' }}>
                    {fmtSigned(p.pnl / 10000, 2)}万
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>合计</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">{fmtMoney(totalMv)}</td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section title="行业暴露">
          <dl className="kv">
            {snap.exposure.map((e) => (
              <div key={e.sector} style={{ display: 'contents' }}>
                <dt>{e.sector}</dt>
                <dd>
                  {fmtMoney(e.value)} · {(e.weight * 100).toFixed(1)}%
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="相关性矩阵">
          <Heatmap labels={heat.codes} matrix={heat.matrix} />
          <div className="tiny muted">
            同行业相关性 0.62~0.88，跨行业 0.08~0.46。相关性高的持仓不能算作分散。
          </div>
        </Section>
      </>
    );
  }

  function E3Detail() {
    const all = session.incidents.filter((i) => i.tick <= snap.tick);
    return (
      <>
        <Section title="异常统计">
          <div className="stat-grid c3">
            <Stat label="累计" value={all.length} />
            <Stat label="进行中" value={snap.activeIncidents.length} color="var(--neg)" />
            <Stat label="拦截子单" value={snap.execution.blockedCount} small />
          </div>
        </Section>

        <Section title="事件流">
          {all.length === 0 ? (
            <Empty>暂无</Empty>
          ) : (
            <table className="mini-table">
              <thead>
                <tr>
                  <th>tick</th>
                  <th>事件</th>
                  <th>处置</th>
                </tr>
              </thead>
              <tbody>
                {[...all].reverse().slice(0, 20).map((i) => (
                  <tr key={i.id}>
                    <td className="num">{i.tick}</td>
                    <td>
                      <div>{i.message}</div>
                      <div className="tiny muted">持续 {i.duration} tick</div>
                    </td>
                    <td className="tiny">{i.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="降级路径">
          <div className="tiny muted" style={{ lineHeight: 1.7 }}>
            <b>网关断线</b>：委托通道不可用，子单激活即拒单，等待通道恢复后剩余子单继续。
            <br />
            <b>流动性枯竭</b>：撮合可用量降至 22%，被动单排队概率骤降，表现为大量部成与超时撤单。
            <br />
            <b>行情过期</b>：报价标记不可信，穿价委托被拒绝，避免在错误价格上成交。
            <br />
            <b>风控拦截</b>：子单不进入撮合，直接计入 blocked，并通过机会成本体现代价。
          </div>
        </Section>
      </>
    );
  }
}
