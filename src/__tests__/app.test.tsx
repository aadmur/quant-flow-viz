import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { useSession } from '../store/useSession';

/**
 * 界面用例只验证「联动」——点击、拖动、键盘是否真的改变了状态，
 * 不去断言像素。像素由 scripts/shot*.py 的视觉回归负责。
 */

beforeEach(() => {
  const s = useSession.getState();
  s.togglePlay(false);
  s.setTick(120);
  s.closeDetail();
});

afterEach(() => {
  cleanup();
  useSession.getState().togglePlay(false);
});

describe('装配体：九个零件都在，且能被点开', () => {
  it('六主零件 + 三附件的引线标签齐全', () => {
    render(<App />);
    ['M1 行情监控', 'M2 模型判别', 'M3 程序化下单', 'M4 订单执行', 'M5 市场冲击', 'M6 策略复盘', 'E1 风险控制', 'E2 组合管理', 'E3 异常处理'].forEach(
      (label) => {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      },
    );
  });

  it('点开 M5 会在右栏抽出冲击明细', () => {
    const { container } = render(<App />);
    const part = container.querySelector('[data-phase="m5"]');
    expect(part).toBeTruthy();
    fireEvent.click(part!);
    expect(useSession.getState().detail).toBe('m5');
    expect(screen.getByRole('heading', { name: '市场冲击' })).toBeTruthy();
    expect(screen.getByText('拆单 vs 一次性砸盘')).toBeTruthy();
  });

  it('再点一次同一个零件就收起', () => {
    const { container } = render(<App />);
    const part = container.querySelector('[data-phase="m3"]')!;
    fireEvent.click(part);
    expect(useSession.getState().detail).toBe('m3');
    fireEvent.click(part);
    expect(useSession.getState().detail).toBeNull();
  });

  it('点附件 E3 会切到异常处理，并列出可注入的故障', () => {
    const { container } = render(<App />);
    fireEvent.click(container.querySelector('[data-phase="e3"]')!);
    expect(useSession.getState().detail).toBe('e3');
    expect(screen.getByText('注入一个故障')).toBeTruthy();
    expect(screen.getByText('网关断线')).toBeTruthy();
  });
});

describe('时间轴与播放', () => {
  it('键盘右移会推进 tick', () => {
    render(<App />);
    const before = useSession.getState().tick;
    const track = screen.getByRole('slider', { name: '时间轴' });
    fireEvent.keyDown(track, { key: 'ArrowRight' });
    expect(useSession.getState().tick).toBeGreaterThan(before);
  });

  it('左移到 0 后再左移不会越界', async () => {
    render(<App />);
    const track = screen.getByRole('slider', { name: '时间轴' });
    await act(async () => {
      useSession.getState().setTick(0);
    });
    fireEvent.keyDown(track, { key: 'ArrowLeft' });
    expect(useSession.getState().tick).toBe(0);
  });

  it('播放/暂停按钮切换状态', () => {
    render(<App />);
    const btn = screen.getAllByRole('button', { name: /^(播放|暂停)$/ })[0];
    const before = useSession.getState().playing;
    fireEvent.click(btn);
    expect(useSession.getState().playing).toBe(!before);
  });
});

describe('参数与预设', () => {
  it('切到压力测试预设会改参数', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '压力测试' }));
    const s = useSession.getState();
    expect(s.presetId).toBe('stress');
    expect(s.params.marketVol).toBeGreaterThan(1.5);
    expect(s.params.liquidity).toBeLessThan(0.6);
  });

  it('拖开仓阈值滑块会写入参数', () => {
    render(<App />);
    const slider = screen.getByLabelText('开仓阈值') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.66' } });
    expect(useSession.getState().params.entryThreshold).toBeCloseTo(0.66, 5);
  });

  it('切换拆单算法会重算会话', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Iceberg' }));
    expect(useSession.getState().params.algo).toBe('iceberg');
    // 参数改动走 90ms 尾随防抖，等它自己落地（而不是手动 rebuild）
    await act(async () => {
      await new Promise((r) => setTimeout(r, 140));
    });
    expect(useSession.getState().session.snaps.length).toBeGreaterThan(100);
  });
});

describe('拆解度是大屏上的主交互', () => {
  it('滑块存在且可改变', () => {
    render(<App />);
    const slider = screen.getByLabelText('拆解度') as HTMLInputElement;
    expect(slider).toBeTruthy();
    fireEvent.change(slider, { target: { value: '0.9' } });
    expect((screen.getByLabelText('拆解度') as HTMLInputElement).value).toBe('0.9');
  });
});
