import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import LessonChart from './LessonChart';
import { PaperSlider } from './PaperSlider';
import { buildMarketSeries, DEFAULT_LESSON_PARAMS, LESSONS, lessonMetrics, VOLUME_AXIS_MAX, VOLUME_NORMAL, volumeRegime } from './lessons';
import type { LessonId, LessonParams } from './lessons';

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return <div className="segmented-block"><span>{label}</span><div className="segmented">{options.map((o) => <button key={o.value} className={value === o.value ? 'active' : ''} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div></div>;
}

/** 读图提示：每课三条「该看画面的哪个部分」。既是教学信息，也让右栏不成空洞。
 *  每条控制在一行内（≈22 字），否则 300px 的栏宽会把句尾切成「真。」这种孤字。 */
const READING_HINTS: Record<LessonId, Array<{ k: string; t: string }>> = {
  impact: [
    { k: '事件竖线', t: '大单成交的那一刻，价格从这里开始改写。' },
    { k: '虚线基准', t: '这笔大单缺席时，价格本该走的路径。' },
    { k: '量柱颜色', t: '红买绿卖；竖线处的巨柱就是大单。' },
  ],
  quant: [
    { k: '红色足迹', t: '同一目标被拆成多次小步，落点均匀。' },
    { k: '金色足迹', t: '人工只有三次决策，每次都是一整步。' },
    { k: '两点间距', t: '反应越慢，第一笔越晚出现。' },
  ],
  volume: [
    { k: '价格曲线', t: '先只看方向与幅度，暂不解释原因。' },
    { k: '成交量倍率', t: '相对常态量的倍数，同样涨幅可以不同。' },
    { k: '四象限', t: '量缩价涨，常是少数交易在推动。' },
  ],
};

function ReadingHints({ lesson }: { lesson: LessonId }) {
  return (
    <div className="reading-hints">
      <span className="hints-kicker">HOW TO READ · 读图</span>
      <ul>{READING_HINTS[lesson].map((h) => <li key={h.k}><b>{h.k}</b><span>{h.t}</span></li>)}</ul>
    </div>
  );
}

function Narrative({ lesson, params }: { lesson: LessonId; params: LessonParams }) {
  if (lesson === 'impact') {
    return <>
      <span className="narrative-kicker">READ THE TAPE · 读带</span>
      <h3>{params.split ? '把一块巨石，拆成一串涟漪。' : params.depth < 40 ? '薄盘口里，大单像一块巨石。' : '价格被推高，是因为成交必须向上寻找卖家。'}</h3>
      <p>{params.split ? '拆单把需求分散到时间里，峰值冲击明显下降，但执行时间更长，也要承担等待期间的价格变化。' : `当前大单规模相当于常态成交量的 ${params.orderSize}%。观察事件竖线：价格先跳升，随后部分回落；没有完全回落的部分，是信息被市场重新定价。`}</p>
      <div className="narrative-rule"><b>记住</b><span>冲击 ≠ 永久涨跌。临时冲击来自流动性，永久变化来自信息。</span></div>
    </>;
  }
  if (lesson === 'quant') {
    return <>
      <span className="narrative-kicker">READ THE FOOTPRINT · 读足迹</span>
      <h3>{params.reaction < 100 ? '机器先看到，也先行动。' : '速度可以调慢，纪律不会迟疑。'}</h3>
      <p>红色路径由多次小单构成，金色路径只有三次人工决策。两者目标相同，但机器把执行分散成可重复的规则，因此路径更细密、反应更稳定。</p>
      <div className="narrative-rule"><b>记住</b><span>量化的核心不是“预测必中”，而是速度、纪律、规模化与可复盘。</span></div>
    </>;
  }
  const regime = volumeRegime(params.priceChange, params.volumeRatio);
  return <>
    <span className="narrative-kicker">READ THE CONVICTION · 读信心</span>
    <h3>{regime.title}：{regime.tag}。</h3>
    <p>{regime.text}</p>
    <div className="narrative-rule"><b>记住</b><span>成交量不预测方向，它衡量市场为这个价格付出了多少参与和换手。</span></div>
  </>;
}

export default function TeachingApp({ onReplay }: { onReplay: () => void }) {
  const [lesson, setLesson] = useState<LessonId>('impact');
  const [params, setParams] = useState<LessonParams>(DEFAULT_LESSON_PARAMS);
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const data = useMemo(() => buildMarketSeries(lesson, params), [lesson, params]);
  const metrics = lessonMetrics(lesson, params);
  const meta = LESSONS.find((l) => l.id === lesson)!;
  const patch = <K extends keyof LessonParams>(key: K, value: LessonParams[K]) => setParams((p) => ({ ...p, [key]: value }));

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress((old) => {
        const next = Math.min(1, old + dt / 8200);
        if (next >= 1) window.setTimeout(() => setPlaying(false), 0);
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const replayLesson = () => {
    if (playing) { setPlaying(false); return; }
    if (progress >= 1) setProgress(0);
    setPlaying(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON') return;
      if (e.code === 'Space') { e.preventDefault(); replayLesson(); }
      if (e.key === 'ArrowLeft') { setPlaying(false); setProgress((p) => Math.max(0, p - 0.04)); }
      if (e.key === 'ArrowRight') { setPlaying(false); setProgress((p) => Math.min(1, p + 0.04)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selectLesson = (id: LessonId) => { setLesson(id); setPlaying(false); setProgress(1); };

  return (
    <div className="academy">
      <header className="academy-header">
        <a className="academy-brand" href="#" onClick={(e) => e.preventDefault()} aria-label="Wall Street Market School 首页">
          <span className="brand-seal">W</span>
          <span><b>WALL STREET</b><em>MARKET SCHOOL · 市场机制课</em></span>
        </a>
        <div className="header-center"><i /> INTERACTIVE LEARNING SESSION <span>NO. 001</span></div>
        <button className="replay-intro" onClick={onReplay}>重播华尔街开场 <span>↗</span></button>
      </header>

      <main className="academy-main">
        <section className="academy-hero">
          <div><span className="hero-eyebrow">FROM PAPER TO PRICE · 从凭证到价格</span><h1>看懂价格，<em>如何被交易改写。</em></h1></div>
          <p>拖动一张股票凭证，让市场给你答案。<br /><span>价格 · 订单 · 成交量，在同一个时刻联动。</span></p>
        </section>

        <nav className="lesson-nav" aria-label="教学章节">
          {LESSONS.map((item) => <button key={item.id} className={lesson === item.id ? 'active' : ''} aria-current={lesson === item.id ? 'page' : undefined} onClick={() => selectLesson(item.id)}>
            <span>{item.no}</span><div><b>{item.title}</b><em>{item.en}</em></div><i>↗</i>
          </button>)}
        </nav>

        <section className="lesson-heading">
          <div><span>LESSON {meta.no} / MARKET MECHANICS</span><h2>{meta.subtitle}</h2></div>
          <p>{meta.question}</p>
        </section>

        <div className="workbench">
          <section className="chart-board">
            <div className="chart-board-head">
              <div><span className="stock-avatar">AC</span><span><b>ACME INDUSTRIAL</b><em>教学模拟标的 · NYSE</em></span></div>
              <div className="market-status"><i /> 连续竞价 <span>USD</span></div>
            </div>
            <LessonChart lesson={lesson} data={data} progress={progress} volumeMax={lesson === 'volume' ? VOLUME_AXIS_MAX : undefined} volumeRef={lesson === 'volume' ? VOLUME_NORMAL : undefined} />
            <div className="playback">
              <button className="play-lesson" onClick={replayLesson} aria-label={playing ? '暂停演示' : '播放演示'}>{playing ? 'Ⅱ' : '▶'}</button>
              <div className="playback-track"><input aria-label="教学进度" type="range" min="0" max="1" step="0.005" value={progress} style={{ '--play-fill': `${progress * 100}%` } as CSSProperties} onChange={(e) => { setPlaying(false); setProgress(Number(e.target.value)); }} /><div><span>09:30 开盘</span><span>拖动时间，逐笔观察</span><span>10:00 收盘</span></div></div>
              <button className="restart" onClick={() => { setProgress(0); setPlaying(true); }} aria-label="从头播放">↺</button>
            </div>
            <div className="metric-strip">{metrics.map((m) => <div key={m.label}><span>{m.label}</span><b>{m.value}</b><em>{m.note}</em></div>)}</div>
          </section>

          <aside className="lesson-controls">
            <div className="controls-heading"><span>YOUR STOCK CERTIFICATES</span><h3>拖动凭证，改变市场</h3><p>每张纸都是一个真实变量。</p></div>
            {lesson === 'impact' && <>
              <PaperSlider id="order" label="大单规模" value={params.orderSize} min={2} max={40} unit="%" hint="占常态成交量的比例。纸越大，市场需求越难被原地接住。" onChange={(v) => patch('orderSize', v)} />
              <PaperSlider id="depth" label="市场深度" value={params.depth} min={20} max={100} hint="盘口愿意承接的流动性。越厚，同等订单造成的跳价越小。" onChange={(v) => patch('depth', v)} />
              <Segmented label="执行方式" value={params.split ? 'split' : 'once'} options={[{ value: 'once', label: '一笔砸入' }, { value: 'split', label: '拆成多笔' }]} onChange={(v) => patch('split', v === 'split')} />
            </>}
            {lesson === 'quant' && <>
              <PaperSlider id="reaction" label="反应速度" value={params.reaction} min={20} max={1000} step={10} unit="ms" hint="从信号出现到第一笔订单。向左拖，观察机器足迹提前。" onChange={(v) => patch('reaction', v)} />
              <PaperSlider id="frequency" label="下单频率" value={params.frequency} min={2} max={34} unit=" 次" hint="同一目标被拆成多少个小步。频率越高，路径越细腻。" onChange={(v) => patch('frequency', v)} />
              <Segmented label="策略方向" value={params.strategy} options={[{ value: 'trend', label: '趋势跟随' }, { value: 'revert', label: '均值回归' }]} onChange={(v) => patch('strategy', v as LessonParams['strategy'])} />
            </>}
            {lesson === 'volume' && <>
              <PaperSlider id="change" label="价格涨跌" value={params.priceChange} min={-5} max={8} step={0.1} unit="%" display={`${params.priceChange >= 0 ? '+' : ''}${params.priceChange.toFixed(1)}`} hint="先只决定方向与幅度，再看成交量是否支持这次移动。" onChange={(v) => patch('priceChange', v)} />
              <PaperSlider id="volume" label="成交量倍率" value={params.volumeRatio} min={0.4} max={3} step={0.1} unit="×" display={params.volumeRatio.toFixed(1)} hint="相对过去一段时间的常态成交量，而非单纯比较一根量柱。" onChange={(v) => patch('volumeRatio', v)} />
              <div className="volume-quadrant" aria-label="量价四象限">
                {[{ t: '缩量上涨', p: 1, v: 0 }, { t: '放量上涨', p: 1, v: 1 }, { t: '缩量下跌', p: -1, v: 0 }, { t: '放量下跌', p: -1, v: 1 }].map((q) => {
                  const active = volumeRegime(params.priceChange, params.volumeRatio).title === q.t;
                  return <div key={q.t} className={active ? 'active' : ''}><i className={q.p > 0 ? 'up' : 'down'}>{q.p > 0 ? '↗' : '↘'}</i><span>{q.t}</span></div>;
                })}
              </div>
            </>}
            <ReadingHints lesson={lesson} />
            <div className="controls-cinema-link">
              <span>FROM WALL STREET</span>
              <b>从一张纸，<br />到一次价格发现。</b>
              <button onClick={onReplay}>重播电影开场 ↗</button>
            </div>
          </aside>
        </div>

        <section className="lesson-narrative">
          <div className="narrative-number">{meta.no}<span>/ 03</span></div>
          <div className="narrative-copy"><Narrative lesson={lesson} params={params} /></div>
          <div className="narrative-stamp"><span>VERIFIED</span><b>量价同读</b><em>MARKET SCHOOL</em></div>
        </section>
        <footer className="academy-footer"><span>WALL STREET MARKET SCHOOL · EST. 2026</span><span>空格 播放 / 暂停　← → 逐帧观察</span><span>教学模型，不构成投资建议</span></footer>
      </main>
    </div>
  );
}
