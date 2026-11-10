import { FACTOR_LABELS, FACTOR_ORDER, PARAM_SPECS, PRESETS, type ParamKey } from '../../model/params';
import type { AlgoKind } from '../../core/types';
import { ALGO_HINTS, ALGO_SHORT } from '../../model/params';
import { useSession } from '../../store/useSession';
import { Slider } from '../ui/Controls';

const ALGOS: AlgoKind[] = ['twap', 'vwap', 'iceberg', 'sniper'];

const GROUPS: { title: string; hint: string; keys: ParamKey[] }[] = [
  { title: '模型判别 · M2', hint: '改变开仓的严格程度', keys: ['entryThreshold'] },
  { title: '执行下单 · M3', hint: '决定拆单规模与节奏', keys: ['capitalPct', 'urgency'] },
  { title: '市场环境 · M4 / M5', hint: '改变撮合难度与冲击强度', keys: ['marketVol', 'liquidity', 'impactCoeff'] },
  { title: '风控闸门 · E1', hint: '敞口上限，触及即拦截', keys: ['exposureLimitPct'] },
];

export function ControlRail() {
  const params = useSession((s) => s.params);
  const presetId = useSession((s) => s.presetId);
  const applyPreset = useSession((s) => s.applyPreset);
  const setParam = useSession((s) => s.setParam);
  const setWeight = useSession((s) => s.setWeight);
  const setAlgo = useSession((s) => s.setAlgo);
  const resetParams = useSession((s) => s.resetParams);

  return (
    <aside className="rail" aria-label="参数控制台">
      <section className="rail-section">
        <div className="rail-title">
          <span>场景预设</span>
          <button className="card-action" onClick={resetParams}>
            重置
          </button>
        </div>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="preset"
              aria-pressed={presetId === p.id}
              onClick={() => applyPreset(p.id)}
              title={p.desc}
            >
              <div className="preset-name">{p.name}</div>
              <div className="preset-desc">{p.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {GROUPS.map((g) => (
        <section className="rail-section" key={g.title}>
          <div className="rail-title">
            <span>{g.title}</span>
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {g.hint}
            </span>
          </div>
          <div className="col" style={{ gap: 9 }}>
            {g.keys.map((key) => {
              const spec = PARAM_SPECS.find((p) => p.key === key);
              if (!spec) return null;
              return (
                <Slider
                  key={key}
                  label={spec.label}
                  value={params[key]}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  display={spec.format(params[key])}
                  onChange={(v) => setParam(key, v)}
                  phase={spec.phase}
                  hint={spec.hint}
                />
              );
            })}
            {g.title.startsWith('执行下单') && (
              <div style={{ marginTop: 2 }}>
                <div className="tiny muted" style={{ marginBottom: 5 }}>
                  拆单算法
                </div>
                <div className="algo-pick" style={{ gridTemplateColumns: '1fr 1fr' }}>
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
              </div>
            )}
          </div>
        </section>
      ))}

      <section className="rail-section">
        <div className="rail-title">
          <span>因子权重 · M2</span>
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>加权后归一</span>
        </div>
        <div className="col" style={{ gap: 7 }}>
          {FACTOR_ORDER.map((k) => (
            <Slider
              key={k}
              label={FACTOR_LABELS[k]}
              value={params.weights[k]}
              min={0}
              max={1}
              step={0.01}
              display={params.weights[k].toFixed(2)}
              onChange={(v) => setWeight(k, v)}
              phase="m2"
            />
          ))}
        </div>
      </section>

      <section className="rail-section">
        <div className="rail-title">
          <span>数据来源</span>
        </div>
        <div className="tiny muted" style={{ lineHeight: 1.6 }}>
          全部数据由确定性 PRNG 生成（seed {params.seed}）。
          同一 seed + 同一组参数，每次运行逐 tick 完全一致，
          因此时间轴回放与复盘结论都可复现。
        </div>
      </section>
    </aside>
  );
}
