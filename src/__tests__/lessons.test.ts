import { describe, expect, it } from 'vitest';
import { buildMarketSeries, DEFAULT_LESSON_PARAMS, firstTradeIndex, impactPeak, VOLUME_AXIS_MAX, volumeRegime } from '../teaching/lessons';

const p = DEFAULT_LESSON_PARAMS;

describe('大单冲击模型', () => {
  it('同一输入逐点一致', () => {
    expect(buildMarketSeries('impact', p)).toEqual(buildMarketSeries('impact', p));
  });

  it('一笔砸入的峰值高于拆单执行', () => {
    expect(impactPeak({ ...p, split: false })).toBeGreaterThan(impactPeak({ ...p, split: true }));
  });

  it('盘口越深，峰值冲击越小', () => {
    expect(impactPeak({ ...p, depth: 90 })).toBeLessThan(impactPeak({ ...p, depth: 30 }));
  });

  it('订单越大，冲击越强', () => {
    expect(impactPeak({ ...p, orderSize: 32 })).toBeGreaterThan(impactPeak({ ...p, orderSize: 8 }));
  });

  it('大单出现前，实际路径与基准完全一致', () => {
    for (const point of buildMarketSeries('impact', p).slice(0, 30)) expect(point.primary).toBe(point.baseline);
  });
});

describe('量化执行模型', () => {
  it('反应越快，第一笔订单越早', () => {
    expect(firstTradeIndex({ ...p, reaction: 20 })).toBeLessThan(firstTradeIndex({ ...p, reaction: 800 }));
  });

  it('频率越高，留下的机器订单点越多', () => {
    const low = buildMarketSeries('quant', { ...p, frequency: 3 }).filter((d) => d.trade).length;
    const high = buildMarketSeries('quant', { ...p, frequency: 30 }).filter((d) => d.trade).length;
    expect(high).toBeGreaterThan(low);
  });

  it('趋势与均值回归给出相反的执行方向', () => {
    const trend = buildMarketSeries('quant', { ...p, strategy: 'trend' }).at(-1)!;
    const revert = buildMarketSeries('quant', { ...p, strategy: 'revert' }).at(-1)!;
    expect(trend.primary).toBeGreaterThan(trend.baseline);
    expect(revert.primary).toBeLessThan(revert.baseline);
  });
});

describe('量价关系', () => {
  it.each([
    [3, 2, '放量上涨'],
    [3, 0.5, '缩量上涨'],
    [-3, 2, '放量下跌'],
    [-3, 0.5, '缩量下跌'],
  ])('价格 %s、量能 %s → %s', (price, volume, title) => {
    expect(volumeRegime(price, volume).title).toBe(title);
  });

  it('量能倍率会真实改变整组成交量', () => {
    const low = buildMarketSeries('volume', { ...p, volumeRatio: 0.5 });
    const high = buildMarketSeries('volume', { ...p, volumeRatio: 2.5 });
    expect(high[50].volume).toBeGreaterThan(low[50].volume * 3);
  });

  it('成交量轴是固定量纲，缩量在图上真的矮一截', () => {
    // 轴若按当期最大值自适应，拖倍率柱高不变——这一课就没有可看的东西了
    const low = Math.max(...buildMarketSeries('volume', { ...p, volumeRatio: 0.4 }).map((d) => d.volume));
    const high = Math.max(...buildMarketSeries('volume', { ...p, volumeRatio: 3 }).map((d) => d.volume));
    expect(high).toBeLessThanOrEqual(VOLUME_AXIS_MAX);
    expect(low / VOLUME_AXIS_MAX).toBeLessThan(0.25);
  });
});
