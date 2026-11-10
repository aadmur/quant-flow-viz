import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { DEFAULT_PARAMS } from '../model/params';
import { useSession } from '../store/useSession';

/** 把 store 复位到「静止 + 默认参数」的确定状态 */
function resetStore(patch: Partial<ReturnType<typeof useSession.getState>> = {}) {
  useSession.setState({
    playing: false,
    tick: 0,
    detail: null,
    params: DEFAULT_PARAMS,
    forced: [],
    injected: [],
    presetId: 'balanced',
    speed: 1,
    ...patch,
  });
  useSession.getState().rebuild();
}

beforeEach(() => {
  resetStore();
});

describe('页面渲染', () => {
  it('九个模块全部挂载，且阶段编号齐全', () => {
    render(<App />);
    for (const code of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'E1', 'E2', 'E3']) {
      expect(screen.getAllByText(code).length).toBeGreaterThan(0);
    }
    for (const title of ['行情监控', '模型判别', '程序化下单', '订单执行', '市场冲击', '策略复盘', '风险控制', '组合管理', '异常处理']) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });

  it('顶栏展示标的、价格与权益', () => {
    render(<App />);
    const bar = screen.getByTestId('topbar');
    expect(within(bar).getByText('宁德时代')).toBeInTheDocument();
    expect(within(bar).getByText('总权益')).toBeInTheDocument();
  });

  it('渲染时无控制台报错（React 告警会被 vitest 捕获为失败）', () => {
    expect(() => render(<App />)).not.toThrow();
  });
});

describe('时间轴与播放', () => {
  it('点击播放会置为 playing，再点一次暂停', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('transport-play'));
    expect(useSession.getState().playing).toBe(true);
    await user.click(screen.getByTestId('transport-play'));
    expect(useSession.getState().playing).toBe(false);
  });

  it('键盘方向键推进 tick 并自动暂停', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      useSession.setState({ playing: true });
    });
    await user.keyboard('{ArrowRight}');
    expect(useSession.getState().tick).toBe(5);
    expect(useSession.getState().playing).toBe(false);
  });

  it('tick 不会越界（拖到 0 之后仍为非负）', () => {
    render(<App />);
    act(() => {
      useSession.getState().setTick(-999);
    });
    expect(useSession.getState().tick).toBe(0);
    act(() => {
      useSession.getState().setTick(999999);
    });
    expect(useSession.getState().tick).toBe(useSession.getState().session.totalTicks - 1);
  });

  it('「下一事件」按钮会把 tick 推到之后的某个事件点', async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = useSession.getState().tick;
    await user.click(screen.getByRole('button', { name: '下一事件' }));
    expect(useSession.getState().tick).toBeGreaterThan(before);
  });
});

describe('详情抽屉', () => {
  it('点击链路节点打开详情，Esc 关闭', async () => {
    const user = userEvent.setup();
    render(<App />);
    const nodes = screen.getAllByRole('button', { name: /市场冲击/ });
    await user.click(nodes[0]);
    expect(useSession.getState().detail).toBe('m5');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(useSession.getState().detail).toBeNull();
  });

  it('详情内容包含该阶段的业务问题', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      useSession.getState().openDetail('m2');
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/多因子怎么看/)).toBeInTheDocument();
    expect(within(dialog).getByText('因子分解')).toBeInTheDocument();
    void user;
  });
});

describe('参数联动', () => {
  it('切换拆单算法会更新参数并触发重算', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sniper = screen.getAllByRole('button', { name: /SNIPER/i })[0];
    await user.click(sniper);
    expect(useSession.getState().params.algo).toBe('sniper');

    act(() => {
      useSession.getState().rebuild();
    });
    const st = useSession.getState();
    const parent = st.session.snaps.find((s) => s.parent)?.parent;
    expect(parent).toBeTruthy();
    // 狙击模式拆单数显著少于 TWAP
    expect(parent!.children.length).toBeLessThanOrEqual(6);
  });

  it('应用「压力测试」预设会同步多个参数', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /压力测试/ }));
    const p = useSession.getState().params;
    expect(p.marketVol).toBeCloseTo(1.9, 1);
    expect(p.liquidity).toBeCloseTo(0.45, 1);
    expect(useSession.getState().presetId).toBe('stress');
  });

  it('参数变更后 pending 会被重算清除', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /保守/ }));
    act(() => {
      useSession.getState().rebuild();
    });
    expect(useSession.getState().pending).toBe(false);
    expect(useSession.getState().params.entryThreshold).toBeGreaterThan(0.5);
  });
});

describe('异常注入与状态联动', () => {
  it('注入网关闭线后事件流出现该条记录', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      useSession.getState().setTick(120);
    });
    const before = useSession.getState().session.incidents.length;
    await user.click(screen.getByRole('button', { name: /网关断线/ }));

    const st = useSession.getState();
    expect(st.session.incidents.length).toBeGreaterThan(before);
    expect(st.session.incidents.some((i) => i.tick === 120 && i.kind === 'link-down')).toBe(true);
  });

  it('注入后受影响 tick 的成交应当减少或为 0', () => {
    act(() => {
      useSession.getState().setTick(150);
    });
    // 无异常基线
    const baseline = useSession.getState().session.fills.filter(
      (f) => f.tick >= 150 && f.tick < 160,
    ).length;
    act(() => {
      useSession.getState().injectIncident('link-down');
    });
    const after = useSession.getState().session.fills.filter(
      (f) => f.tick >= 150 && f.tick < 160,
    ).length;
    expect(after).toBeLessThanOrEqual(baseline);
  });
});

describe('手动下单', () => {
  it('手动买入会在当前 tick 生成母单', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => {
      useSession.getState().setTick(200);
    });
    // M3 卡片在无母单时提供手动入口；若已有母单则直接用 store
    const entry = screen.queryAllByRole('button', { name: '手动买入' });
    if (entry.length > 0) {
      await user.click(entry[0]);
    } else {
      act(() => {
        useSession.getState().forceOrder('buy');
      });
    }
    const snap = useSession.getState().session.snaps[200];
    expect(snap.parent?.createdTick).toBe(200);
  });
});
