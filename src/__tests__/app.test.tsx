import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';

function enterSchool() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /跳过开场/ }));
}

afterEach(cleanup);

describe('电影开场', () => {
  it('首屏是华尔街开场，可以跳过进入教学页', () => {
    enterSchool();
    expect(screen.getByRole('heading', { name: /看懂价格/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '播放演示' })).toBeTruthy();
  });

  it('可以从教学页重播开场', () => {
    enterSchool();
    fireEvent.click(screen.getByRole('button', { name: /重播华尔街开场/ }));
    expect(screen.getByRole('button', { name: /跳过开场/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /看懂价格/ })).toBeNull();
  });
});

describe('三课与纸质股票滑块', () => {
  it('三个章节都出现在导航中', () => {
    enterSchool();
    expect(screen.getByRole('button', { name: /大单冲击/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /量化足迹/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /量价关系/ })).toBeTruthy();
  });

  it('大单规模滑块实时改值并刷新图纸', () => {
    enterSchool();
    const slider = screen.getByLabelText('大单规模') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '30' } });
    expect(slider.value).toBe('30');
    expect(screen.getByText('30%')).toBeTruthy();
    expect(screen.getByRole('img', { name: /教学行情图/ })).toBeTruthy();
  });

  it('切换拆单后，讲解和按钮状态一起变化', () => {
    enterSchool();
    const split = screen.getByRole('button', { name: '拆成多笔' });
    fireEvent.click(split);
    expect(split.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('把一块巨石，拆成一串涟漪。')).toBeTruthy();
  });

  it('量化课的反应速度与频率都可拖动', () => {
    enterSchool();
    fireEvent.click(screen.getByRole('button', { name: /量化足迹/ }));
    fireEvent.change(screen.getByLabelText('反应速度'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('下单频率'), { target: { value: '30' } });
    expect(screen.getAllByText('20ms').length).toBeGreaterThan(0);
    expect(screen.getByText('30 次')).toBeTruthy();
    expect(screen.getByText('人工执行')).toBeTruthy();
  });

  it('量价课能识别放量下跌并点亮对应象限', () => {
    enterSchool();
    fireEvent.click(screen.getByRole('button', { name: /量价关系/ }));
    fireEvent.change(screen.getByLabelText('价格涨跌'), { target: { value: '-3' } });
    fireEvent.change(screen.getByLabelText('成交量倍率'), { target: { value: '2.5' } });
    expect(screen.getAllByText(/放量下跌/).length).toBeGreaterThan(1);
    const quadrant = screen.getByLabelText('量价四象限');
    expect(quadrant.querySelector('.active')?.textContent).toContain('放量下跌');
  });
});

describe('播放与时间联动', () => {
  it('拖动教学进度会同步当前进度', () => {
    enterSchool();
    fireEvent.change(screen.getByLabelText('教学进度'), { target: { value: '0.4' } });
    expect(screen.getAllByText('40%').length).toBeGreaterThan(0);
  });

  it('播放按钮切换为暂停状态', () => {
    enterSchool();
    fireEvent.click(screen.getByRole('button', { name: '播放演示' }));
    expect(screen.getByRole('button', { name: '暂停演示' })).toBeTruthy();
  });

  it('进度到 0 后仍不越界', () => {
    enterSchool();
    const range = screen.getByLabelText('教学进度') as HTMLInputElement;
    fireEvent.change(range, { target: { value: '0' } });
    fireEvent.change(range, { target: { value: '-0.2' } });
    expect(Number(range.value)).toBeGreaterThanOrEqual(0);
  });
});
