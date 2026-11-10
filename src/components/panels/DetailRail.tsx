import type { ReactNode } from 'react';
import type { AlgoKind, FactorKey, Fill, IncidentKind, PhaseId, Side, Snapshot } from '../../core/types';
import { PHASE_MAP } from '../../core/phases';
import { ACTION_LABELS, BREAKER_LABELS, CHILD_LABELS, INJECTABLE, INCIDENT_LABELS } from '../../core/labels';
import { fmtBps, fmtMoney, fmtMoneySigned, fmtPct, fmtPrice, fmtQty } from '../../core/format';
import { ALGO_HINTS, ALGO_LABELS, ALGO_SHORT, FACTOR_LABELS, FACTOR_ORDER, PARAM_SPECS, type ParamKey, type Params } from '../../model/params';
import { Bars, Gantt, Metric, RowBar, Section, Spark, StackBar } from '../ui/Charts';

export interface DetailRailProps {
  snap: Snapshot;
  selected: PhaseId | null;
  hist: Snapshot[];
  fills: Fill[];
  equity: number[];
  params: Params;
  onParam: (k: ParamKey, v: number) => void;
  onWeight: (k: FactorKey, v: number) => void;
  onAlgo: (a: AlgoKind) => void;
  onForce: (side: Side) => void;
  onInject: (k: IncidentKind) => void;
  onSelect: (id: PhaseId | null) => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  hint,
  color = '#38e1ff',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  hint?: string;
  color?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <b className="tabnum" style={{ color }}>
          {display}
        </b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${pct}%`, ['--thumb' as string]: color, ['--thumb-glow' as string]: `${color}99` }}
        aria-label={label}
      />
      {hint && <p className="slider-hint">{hint}</p>}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

/** 每台零件的一句话机械隐喻 + 一句业务机制 */
const NOTES: Record<PhaseId, { metaphor: string; mechanism: string; watch: string }> = {
  m1: {
    metaphor: '雷达盘：先听见，才谈得上动手。',
    mechanism:
      '同时盯着 6 只标的，把价格突破、放量、波动突变、盘口失衡、流动性骤降五类异常各自打分，分数过线才叫醒下游。',
    watch: '盘面上每个光点的亮度就是那只标的的异动强度；外圈刻度是最近 36 个 tick 的扫描节拍。',
  },
  m2: {
    metaphor: '差速齿轮组：五个因子各转各的，合起来才有一个方向。',
    mechanism:
      '五只齿轮的转速等于该因子绝对值，转向等于正负号；按权重加权后合成综合分，指针越过红色阈值线就锁死——这一刻母单诞生。',
    watch: '锁死时所有齿轮瞬间对齐（不是慢慢停下），这是「判别的离散性」在视觉上的表达。',
  },
  m3: {
    metaphor: '分液歧管：一张大单必须被打碎，才咽得下去。',
    mechanism:
      '母单进入入口，按所选算法（TWAP/VWAP/冰山/狙击）切成 N 张子单，每张子单对应一根支管和一个阀门；阀门开启的节拍就是执行节奏。',
    watch: '红色横条是风控闸门落下，此时支管里的液体（委托）根本流不出去。',
  },
  m4: {
    metaphor: '咬合滚筒：成交不是「发生」的，是被咬进去的。',
    mechanism:
      '子单落进两只反向转动的滚筒之间撮合。成交率是咬合精度，滑点是打滑量——盘口越薄，打滑越狠。',
    watch: '底部托盘里的柱子是最近 14 笔成交，红为买、绿为卖，高度是单笔股数。',
  },
  m5: {
    metaphor: '冲击槽：你踩进水里，水面一定会凹下去。',
    mechanism:
      '我们的成交把液面压出涟漪。临时冲击会回弹，永久冲击不会——浮标被推走的距离就是永久冲击，也是真正留在价格里的成本。',
    watch: '槽体前脸两条横条：上为拆单成本，下为「一次性砸盘」成本，同一口径下比一比就知道拆单省了多少。',
  },
  m6: {
    metaphor: '记录鼓：赚了还是亏了，得能拆开算。',
    mechanism:
      '纸带上滚的是权益轨迹。把成交价与决策价之间的差拆成延迟成本、市场漂移、执行成本、机会成本四块，才知道哪一块该改。',
    watch: '如果市场漂移占大头，说明问题在「选时机」；执行成本占大头，才轮到改算法。',
  },
  e1: {
    metaphor: '保险丝座：宁可误断，不可过载。',
    mechanism: '敞口、VaR、回撤、下单速率四条线同时盯着，任一越线就抬闸刀，新单直接不下发。',
    watch: '闸刀抬起时，M3 的支管会被红色闸门压住——风控不是记账，是改变下游行为。',
  },
  e2: {
    metaphor: '配重盘：不是买什么，而是别把重量全压在一侧。',
    mechanism: '持仓按行业分扇区，任一扇区超重就会挤占其他方向的可用敞口。',
    watch: '扇区面积就是行业权重，前二占比越高，组合越像单押。',
  },
  e3: {
    metaphor: '故障注入阀：不主动摔一次，就不知道哪里先断。',
    mechanism: '五个口对应五类真实故障，拧开哪个下游就降级：断线→拒单，闪崩→降量，过期行情→禁用穿价。',
    watch: '注入后看 M4 的成交率与 E3 的处置动作是否对得上——异常必须改变行为，而不是只写一行日志。',
  },
};

export function DetailRail(props: DetailRailProps) {
  const { selected, onSelect } = props;
  const meta = selected ? PHASE_MAP[selected] : null;

  return (
    <aside className={`detailrail ${selected ? 'is-detail' : ''}`}>
      <header className="dr-head">
        {meta ? (
          <>
            <div>
              <span className="eyebrow" style={{ color: meta.accent }}>
                {meta.code} · {meta.subtitle}
              </span>
              <h3>{meta.title}</h3>
            </div>
            <button className="dr-close" onClick={() => onSelect(null)} aria-label="收起详情">
              ✕
            </button>
          </>
        ) : (
          <div>
            <span className="eyebrow">SESSION · PARAMETERS</span>
            <h3>会话与参数台</h3>
          </div>
        )}
      </header>

      <div className="dr-body">
        {!selected && <Overview {...props} />}
        {selected && <Note>{NOTES[selected].metaphor}</Note>}
        {selected === 'm1' && <M1Detail {...props} />}
        {selected === 'm2' && <M2Detail {...props} />}
        {selected === 'm3' && <M3Detail {...props} />}
        {selected === 'm4' && <M4Detail {...props} />}
        {selected === 'm5' && <M5Detail {...props} />}
        {selected === 'm6' && <M6Detail {...props} />}
        {selected === 'e1' && <E1Detail {...props} />}
        {selected === 'e2' && <E2Detail {...props} />}
        {selected === 'e3' && <E3Detail {...props} />}

        {selected && (
          <div className="dr-foot">
            <span className="eyebrow" style={{ color: meta?.accent }}>
              怎么读这块
            </span>
            <p>{NOTES[selected].mechanism}</p>
            <p className="watch">{NOTES[selected].watch}</p>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------------- 总览：参数台 ---------------- */
function Overview({ snap, params, onParam, onAlgo, onForce, fills }: DetailRailProps) {
  return (
    <>
      <Section title="这一局在演什么">
        <div className="ov-grid">
          <Metric label="初始资金" value={fmtMoney(5_000_000)} />
          <Metric label="已成交" value={fmtQty(snap.execution.filledQty)} unit="股" />
          <Metric label="成交笔数" value={String(fills.length)} />
          <Metric label="总滑点" value={fmtBps(snap.review.slippage.total, 1)} tone="warn" />
        </div>
        <Note>
          一台确定性引擎：同样的种子 + 同一套参数，逐 tick 完全一致。所有面板读的是同一条时钟，
          所以拖时间轴时，订单、成交、冲击、权益会一起回到过去。
        </Note>
      </Section>

      <Section title="算法挂挡" extra={<span className="tabnum tiny">{ALGO_SHORT[params.algo]}</span>}>
        <div className="algo-row">
          {(Object.keys(ALGO_LABELS) as AlgoKind[]).map((k) => (
            <button key={k} className={params.algo === k ? 'on' : ''} onClick={() => onAlgo(k)} title={ALGO_HINTS[k]}>
              {ALGO_LABELS[k].split(' ')[0]}
            </button>
          ))}
        </div>
        <p className="slider-hint">{ALGO_HINTS[params.algo]}</p>
      </Section>

      <Section title="参数台">
        {PARAM_SPECS.map((spec) => (
          <Slider
            key={spec.key}
            label={spec.label}
            value={params[spec.key]}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            display={spec.format(params[spec.key])}
            hint={spec.hint}
            color={PHASE_MAP[spec.phase].accent}
            onChange={(v) => onParam(spec.key, v)}
          />
        ))}
      </Section>

      <Section title="手动干预">
        <div className="force-row">
          <button className="force buy" onClick={() => onForce('buy')}>
            强制买入
          </button>
          <button className="force sell" onClick={() => onForce('sell')}>
            强制卖出
          </button>
        </div>
        <p className="slider-hint">在无母单时立即在当前 tick 生成一张母单，用来观察下游零件如何反应。</p>
      </Section>
    </>
  );
}

/* ---------------- M1 ---------------- */
function M1Detail({ snap, hist }: DetailRailProps) {
  const prices = hist.map((s) => s.price);
  const vols = hist.slice(-60).map((s) => s.bars[s.bars.length - 1]?.volume ?? 0);
  const recent = hist.slice(-80).flatMap((s) => s.anomaliesNow).slice(-6).reverse();

  return (
    <>
      <div className="ov-grid">
        <Metric label="现价" value={fmtPrice(snap.price)} unit="" tone={snap.changePct >= 0 ? 'up' : 'down'} />
        <Metric label="涨跌" value={fmtPct(snap.changePct)} tone={snap.changePct >= 0 ? 'up' : 'down'} />
        <Metric label="异动次数" value={String(snap.anomalyCount)} />
        <Metric label="价差" value={`${snap.book.asks[0] ? ((snap.book.asks[0].price - snap.book.bids[0].price) / snap.price * 10000).toFixed(1) : '—'}bp`} />
      </div>

      <Section title="价格与昨收">
        <Spark values={prices} color="#38e1ff" baseline={snap.prevClose} height={78} />
      </Section>

      <Section title="成交量（近 60 tick）">
        <Bars values={vols} color="rgba(56,225,255,0.35)" hot="#38e1ff" height={48} />
      </Section>

      <Section title="观察列表">
        <table className="tbl">
          <thead>
            <tr>
              <th>标的</th>
              <th>现价</th>
              <th>涨跌</th>
              <th>量比</th>
            </tr>
          </thead>
          <tbody>
            {snap.quotes.map((q) => (
              <tr key={q.symbol.code} className={q.symbol.code === '300750' ? 'focus' : ''}>
                <td>
                  <b>{q.symbol.name}</b>
                  <em>{q.symbol.code}</em>
                </td>
                <td className="tabnum">{fmtPrice(q.last)}</td>
                <td className={`tabnum ${q.changePct >= 0 ? 'up' : 'down'}`}>{fmtPct(q.changePct)}</td>
                <td className="tabnum">{q.volumeRatio.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="最近异动">
        {recent.length === 0 && <p className="empty">本段窗口内没有异动</p>}
        <ul className="feed">
          {recent.map((a) => (
            <li key={a.id}>
              <span className={`sev s${a.severity}`} />
              <b>{a.label}</b>
              <em>{a.detail}</em>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/* ---------------- M2 ---------------- */
function M2Detail({ snap, hist, params, onParam, onWeight }: DetailRailProps) {
  const scores = hist.map((s) => s.decision.score);
  const d = snap.decision;
  return (
    <>
      <div className="ov-grid">
        <Metric label="综合分" value={`${d.score >= 0 ? '+' : ''}${d.score.toFixed(2)}`} tone={d.score >= 0 ? 'up' : 'down'} />
        <Metric label="置信度" value={`${(d.confidence * 100).toFixed(0)}%`} />
        <Metric label="动作" value={ACTION_LABELS[d.action]} tone={d.action === 'hold' ? 'mute' : d.action === 'buy' ? 'up' : 'down'} />
        <Metric label="阈值" value={d.threshold.toFixed(2)} tone="warn" />
      </div>

      <Section title="综合分轨迹">
        <Spark values={scores} color="#a78bfa" baseline={d.threshold} height={80} />
      </Section>

      <Section title={`开仓阈值 ${params.entryThreshold.toFixed(2)}`}>
        <Slider
          label="综合分超过它才开仓"
          value={params.entryThreshold}
          min={0.15}
          max={0.8}
          step={0.01}
          display={params.entryThreshold.toFixed(2)}
          color="#a78bfa"
          onChange={(v) => onParam('entryThreshold', v)}
        />
      </Section>

      <Section title="五因子拆解">
        {d.factors.map((f) => (
          <RowBar
            key={f.key}
            label={FACTOR_LABELS[f.key]}
            value={Math.abs(f.contribution)}
            max={0.4}
            color={f.contribution >= 0 ? '#ff4d63' : '#17cf8d'}
            right={`${f.contribution >= 0 ? '+' : ''}${f.contribution.toFixed(2)}`}
          />
        ))}
        <p className="slider-hint">柱长是「权重 × 因子值」，红色推向做多、绿色推向做空。</p>
      </Section>

      <Section title="权重调节">
        {FACTOR_ORDER.map((k) => (
          <Slider
            key={k}
            label={FACTOR_LABELS[k]}
            value={params.weights[k]}
            min={0}
            max={1}
            step={0.02}
            display={params.weights[k].toFixed(2)}
            color="#a78bfa"
            onChange={(v) => onWeight(k, v)}
          />
        ))}
      </Section>
    </>
  );
}

/* ---------------- M3 ---------------- */
function M3Detail({ snap, params, onParam, onAlgo, onForce }: DetailRailProps) {
  const p = snap.parent;
  const rows = (p?.children ?? []).slice(0, 16).map((c) => ({
    key: c.id,
    start: c.scheduledTick,
    end: Math.max(c.scheduledTick + 1, c.expireTick),
    fill: c.qty > 0 ? c.filled / c.qty : 0,
    ok: c.status === 'filled',
  }));

  return (
    <>
      {!p && <p className="empty">还没有母单：把阈值调低、或直接点「强制买入」制造一张。</p>}
      {p && (
        <>
          <div className="ov-grid">
            <Metric label="目标" value={fmtQty(p.targetQty)} unit="股" />
            <Metric label="已成交" value={fmtQty(p.filledQty)} unit="股" />
            <Metric label="子单" value={String(p.children.length)} />
            <Metric label="进度" value={`${((p.filledQty / p.targetQty) * 100).toFixed(0)}%`} tone="warn" />
          </div>

          <Section title={`子单节奏 · ${ALGO_LABELS[p.algo]}`} extra={<span className="tiny tabnum">tick {p.createdTick}</span>}>
            <Gantt rows={rows} total={Math.max(60, snap.tick - p.createdTick + 20)} color="#ffb020" />
            <p className="slider-hint">每行一张子单：浅色是计划窗口，实色是已成交量。</p>
          </Section>

          <Section title="算法挂挡">
            <div className="algo-row">
              {(Object.keys(ALGO_LABELS) as AlgoKind[]).map((k) => (
                <button key={k} className={params.algo === k ? 'on' : ''} onClick={() => onAlgo(k)}>
                  {ALGO_SHORT[k]}
                </button>
              ))}
            </div>
            <p className="slider-hint">{ALGO_HINTS[params.algo]}</p>
          </Section>

          <Section title="拆单节奏">
            <Slider
              label="执行紧急度"
              value={params.urgency}
              min={0.15}
              max={1}
              step={0.01}
              display={params.urgency.toFixed(2)}
              hint="越高：单笔越大、间隔越短、滑点越高"
              color="#ffb020"
              onChange={(v) => onParam('urgency', v)}
            />
            <Slider
              label="投入资金"
              value={params.capitalPct}
              min={4}
              max={60}
              step={1}
              display={`${params.capitalPct}%`}
              color="#ffb020"
              onChange={(v) => onParam('capitalPct', v)}
            />
          </Section>

          <Section title="子单明细">
            <table className="tbl compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>量</th>
                  <th>限价</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {(p.children ?? []).slice(-8).reverse().map((c) => (
                  <tr key={c.id}>
                    <td className="tabnum">{c.seq}</td>
                    <td className="tabnum">{fmtQty(c.qty)}</td>
                    <td className="tabnum">{c.limitPrice.toFixed(2)}</td>
                    <td>
                      <span className={`chip st-${c.status}`}>{CHILD_LABELS[c.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <div className="force-row">
            <button className="force buy" onClick={() => onForce('buy')}>
              再来一张买单
            </button>
            <button className="force sell" onClick={() => onForce('sell')}>
              反向卖出
            </button>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- M4 ---------------- */
function M4Detail({ snap, fills, params, onParam }: DetailRailProps) {
  const recent = fills.slice(-9).reverse();
  return (
    <>
      <div className="ov-grid">
        <Metric label="成交率" value={`${(snap.execution.fillRate * 100).toFixed(1)}%`} tone={snap.execution.fillRate > 0.85 ? 'down' : 'warn'} />
        <Metric label="平均滑点" value={fmtBps(snap.execution.avgSlippageBps, 1)} tone="risk" />
        <Metric label="最差滑点" value={fmtBps(snap.execution.worstSlippageBps, 1)} tone="risk" />
        <Metric label="成交均价" value={fmtPrice(snap.execution.avgPrice)} />
      </div>

      <Section title="成交回报流">
        {recent.length === 0 && <p className="empty">尚未成交</p>}
        <ul className="fills">
          {recent.map((f) => (
            <li key={f.id} className={f.side === 'buy' ? 'buy' : 'sell'}>
              <span className="fill-side">{f.side === 'buy' ? '买' : '卖'}</span>
              <b className="tabnum">{f.price.toFixed(2)}</b>
              <span className="tabnum qty">{fmtQty(f.qty)}</span>
              <span className={`tabnum slip ${f.slippageBps > 0 ? 'neg' : 'pos'}`}>{fmtBps(f.slippageBps, 1)}</span>
              <em className="tabnum">t{f.tick}</em>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="盘口深度">
        <div className="book">
          {snap.book.asks
            .slice()
            .reverse()
            .map((l) => (
              <RowBar key={`a${l.price}`} label={l.price.toFixed(2)} value={l.size} max={Math.max(...snap.book.asks.map((x) => x.size)) * 1.1} color="rgba(255,77,99,0.55)" right={fmtQty(l.size)} />
            ))}
          {snap.book.bids.map((l) => (
            <RowBar key={`b${l.price}`} label={l.price.toFixed(2)} value={l.size} max={Math.max(...snap.book.bids.map((x) => x.size)) * 1.1} color="rgba(23,207,141,0.55)" right={fmtQty(l.size)} />
          ))}
        </div>
      </Section>

      <Section title="盘口流动性">
        <Slider
          label="流动性系数"
          value={params.liquidity}
          min={0.35}
          max={1.6}
          step={0.05}
          display={`${params.liquidity.toFixed(2)}×`}
          hint="调低到 0.5× 试试：成交率掉、滑点涨、冲击槽的液面沉得更深"
          color="#2dd4bf"
          onChange={(v) => onParam('liquidity', v)}
        />
      </Section>
    </>
  );
}

/* ---------------- M5 ---------------- */
function M5Detail({ snap, hist, params, onParam }: DetailRailProps) {
  const imp = snap.impact;
  const curve = hist.map((s) => s.impact.totalBps);
  const saved = imp.oneShotCostBps - imp.avgCostBps;
  const cf = hist.map((s) => s.price - s.impact.counterfactualPrice);

  return (
    <>
      <div className="ov-grid">
        <Metric label="总冲击" value={fmtBps(imp.totalBps, 1)} tone="risk" />
        <Metric label="永久" value={fmtBps(imp.permanentBps, 1)} tone="warn" />
        <Metric label="临时" value={fmtBps(imp.temporaryBps, 1)} tone="warn" />
        <Metric label="成本" value={fmtMoney(imp.costYuan)} tone="risk" />
      </div>

      <Section title="冲击曲线（近段）">
        <Spark values={curve} color="#fb7a3c" height={76} />
      </Section>

      <Section title="拆单 vs 一次性砸盘" extra={<span className={`tiny tabnum ${saved > 0 ? 'pos' : 'neg'}`}>省 {saved.toFixed(1)}bp</span>}>
        <RowBar label="本单拆单" value={imp.avgCostBps} max={Math.max(1, imp.oneShotCostBps)} color="#fb7a3c" right={fmtBps(imp.avgCostBps, 1)} />
        <RowBar label="一次性砸" value={imp.oneShotCostBps} max={Math.max(1, imp.oneShotCostBps)} color="rgba(255,77,99,0.6)" right={fmtBps(imp.oneShotCostBps, 1)} />
        <p className="slider-hint">同起点、同口径。两条的差距就是拆单换来的好处。</p>
      </Section>

      <Section title="我们 vs 没有我们的市场">
        <Spark values={cf} color="#38e1ff" height={64} />
        <p className="slider-hint">纵轴是「实际价 − 反事实价」，也就是我们的成交把价格推走的距离（元）。</p>
      </Section>

      <Section title="冲击系数">
        <Slider
          label="κ 平方根冲击斜率"
          value={params.impactCoeff}
          min={0.3}
          max={2.2}
          step={0.05}
          display={`κ ${params.impactCoeff.toFixed(2)}`}
          hint="调到 2.0 以上，再看 M4 的成交率：价格被自己推走，后面的子单更难成交"
          color="#fb7a3c"
          onChange={(v) => onParam('impactCoeff', v)}
        />
      </Section>
    </>
  );
}

/* ---------------- M6 ---------------- */
function M6Detail({ snap, equity }: DetailRailProps) {
  const r = snap.review;
  const s = r.slippage;
  return (
    <>
      <div className="ov-grid">
        <Metric label="权益" value={fmtMoney(r.equity)} tone={r.pnl >= 0 ? 'up' : 'down'} />
        <Metric label="盈亏" value={fmtMoneySigned(r.pnl)} tone={r.pnl >= 0 ? 'up' : 'down'} />
        <Metric label="vs VWAP" value={fmtBps(r.vsVwapBps, 1)} tone={r.vsVwapBps <= 0 ? 'down' : 'risk'} />
        <Metric label="最大回撤" value={`${r.maxDrawdownPct.toFixed(2)}%`} />
      </div>

      <Section title="权益曲线">
        <Spark values={equity.length > 1 ? equity : [r.equity, r.equity]} color="#f472b6" height={80} />
      </Section>

      <Section title="滑点四分解" extra={<span className="tiny tabnum">{fmtBps(s.total, 1)}</span>}>
        <StackBar
          parts={[
            { label: '延迟', value: s.delay, color: '#f472b6' },
            { label: '市场漂移', value: s.marketDrift, color: '#a78bfa' },
            { label: '执行', value: s.execution, color: '#fb7a3c' },
            { label: '机会', value: s.opportunity, color: '#ffc247' },
          ]}
        />
        <p className="slider-hint">同一笔母单，从决策价到成交价之间到底被谁吃掉了。</p>
      </Section>

      <Section title="其他读数">
        <div className="ov-grid">
          <Metric label="胜率" value={`${(r.winRate * 100).toFixed(0)}%`} />
          <Metric label="夏普(近似)" value={r.sharpeLike.toFixed(2)} />
          <Metric label="决策价" value={r.arrivalPrice.toFixed(2)} />
          <Metric label="VWAP 基准" value={r.vwapBenchmark.toFixed(2)} />
        </div>
      </Section>
    </>
  );
}

/* ---------------- E1 ---------------- */
function E1Detail({ snap, params, onParam }: DetailRailProps) {
  const k = snap.risk;
  return (
    <>
      <div className="ov-grid">
        <Metric label="敞口利用率" value={`${(k.utilization * 100).toFixed(0)}%`} tone={k.utilization > 0.85 ? 'risk' : 'warn'} />
        <Metric label="断路状态" value={BREAKER_LABELS[k.breaker]} tone={k.breaker === 'closed' ? 'down' : 'risk'} />
        <Metric label="通过 / 警告 / 拦截" value={`${k.passed}/${k.warned}/${k.blocked}`} />
        <Metric label="下单速率" value={`${k.orderRate}/min`} />
      </div>

      <Section title="四条闸门">
        <RowBar label="名义敞口" value={k.exposure} max={k.exposureLimit} color="#ff3b4e" right={fmtMoney(k.exposure)} />
        <RowBar label="VaR 95" value={k.var95} max={k.varLimit} color="#ffc247" right={fmtMoney(k.var95)} />
        <RowBar label="当前回撤" value={k.drawdownPct} max={k.drawdownLimitPct} color="#38e1ff" right={`${k.drawdownPct.toFixed(2)}%`} />
        <RowBar label="下单速率" value={k.orderRate} max={k.orderRateLimit} color="#a78bfa" right={`${k.orderRate}/min`} />
      </Section>

      <Section title="敞口上限">
        <Slider
          label="敞口上限"
          value={params.exposureLimitPct}
          min={12}
          max={80}
          step={1}
          display={`${params.exposureLimitPct}%`}
          hint="往左拉到 15% 以下，母单会被拦腰切断——去 M3 看红色闸门落下"
          color="#ff3b4e"
          onChange={(v) => onParam('exposureLimitPct', v)}
        />
      </Section>
    </>
  );
}

/* ---------------- E2 ---------------- */
function E2Detail({ snap }: DetailRailProps) {
  const maxW = Math.max(...snap.exposure.map((e) => e.weight), 10);
  return (
    <>
      <Section title="持仓">
        <table className="tbl compact">
          <thead>
            <tr>
              <th>标的</th>
              <th>市值</th>
              <th>盈亏</th>
              <th>权重</th>
            </tr>
          </thead>
          <tbody>
            {snap.positions.map((p) => (
              <tr key={p.symbol}>
                <td>
                  <b>{p.name}</b>
                </td>
                <td className="tabnum">{fmtMoney(p.marketValue)}</td>
                <td className={`tabnum ${p.pnlPct >= 0 ? 'up' : 'down'}`}>{fmtPct(p.pnlPct)}</td>
                <td className="tabnum">{p.weight.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="行业暴露">
        {snap.exposure.map((e, i) => (
          <RowBar
            key={e.sector}
            label={e.sector}
            value={e.weight}
            max={maxW}
            color={['#34d399', '#38e1ff', '#ffb020', '#a78bfa'][i % 4]}
            right={`${e.weight.toFixed(1)}%`}
          />
        ))}
      </Section>
    </>
  );
}

/* ---------------- E3 ---------------- */
function E3Detail({ snap, onInject }: DetailRailProps) {
  return (
    <>
      <Section title="注入一个故障">
        <div className="inject-grid">
          {INJECTABLE.map((k) => (
            <button key={k} onClick={() => onInject(k)}>
              {INCIDENT_LABELS[k]}
            </button>
          ))}
        </div>
        <p className="slider-hint">注入会立刻在当前 tick 生效，并重算后续所有 tick——下游行为会真的改变。</p>
      </Section>

      <Section title="处置中" extra={<span className="tiny tabnum">{snap.activeIncidents.length}</span>}>
        {snap.activeIncidents.length === 0 && <p className="empty">当前无活跃异常</p>}
        <ul className="incidents">
          {snap.activeIncidents.map((i) => (
            <li key={i.id} className={i.severity}>
              <b>{INCIDENT_LABELS[i.kind]}</b>
              <p>{i.message}</p>
              <em>→ {i.action}</em>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="历史记录">
        {snap.incidents.length === 0 && <p className="empty">还没有发生过异常</p>}
        <ul className="incidents small">
          {snap.incidents.slice(-6).reverse().map((i) => (
            <li key={i.id} className={i.severity}>
              <b>
                t{i.tick} · {INCIDENT_LABELS[i.kind]}
              </b>
              <em>{i.resolvedAt === null ? '未恢复' : `t${i.resolvedAt} 恢复`}</em>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
