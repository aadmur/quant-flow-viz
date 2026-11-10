import { create } from 'zustand';
import { simulateSession } from '../engine/simulate';
import type { AlgoKind, FactorKey, IncidentKind, PhaseId, SessionData, Side } from '../core/types';
import { DEFAULT_PARAMS, PRESETS, type Params } from '../model/params';

export const SPEED_STEPS = [0.5, 1, 2, 4, 8] as const;
/** 1× 对应的 tick 速率（tick/秒） */
const TICKS_PER_SECOND = 26;

export interface SessionStore {
  params: Params;
  session: SessionData;
  tick: number;
  playing: boolean;
  speed: number;
  detail: PhaseId | null;
  /** 用户手动注入的事件 */
  forced: { tick: number; side: Side }[];
  injected: { tick: number; kind: IncidentKind }[];
  /** 参数变更后到重算完成之间的短暂窗口 */
  pending: boolean;
  presetId: string;

  setParam: (key: keyof Params, value: number) => void;
  setWeight: (key: FactorKey, value: number) => void;
  setAlgo: (algo: AlgoKind) => void;
  applyPreset: (id: string) => void;
  reseed: () => void;
  resetParams: () => void;

  setTick: (tick: number) => void;
  stepTick: (delta: number) => void;
  togglePlay: (next?: boolean) => void;
  setSpeed: (speed: number) => void;
  /** 立即按当前参数重建会话（不走防抖），供测试与「强制重算」使用 */
  rebuild: () => void;

  openDetail: (phase: PhaseId) => void;
  closeDetail: () => void;

  forceOrder: (side: Side) => void;
  injectIncident: (kind: IncidentKind) => void;
  clearInjected: () => void;
}

// tick 允许小数（播放时平滑推进），索引快照时再取整
const clampTick = (t: number, total: number) => Math.max(0, Math.min(total - 1, t));

let recomputeTimer: ReturnType<typeof setTimeout> | null = null;

function build(
  params: Params,
  forced: { tick: number; side: Side }[],
  injected: { tick: number; kind: IncidentKind }[],
): SessionData {
  return simulateSession({ params, forcedOrders: forced, injectedIncidents: injected });
}

const initial = build(DEFAULT_PARAMS, [], []);

export const useSession = create<SessionStore>((set, get) => {
  /**
   * 参数/事件变更后重算整个会话。
   *
   * 用 90ms 尾随防抖：滑块拖动时一帧重算 540 tick 会掉帧，
   * 而 90ms 的延迟在视觉上感知不到，又能保证拖动过程只算最后一次。
   * 重算在参数变更后是同步的，因此这里额外用 pending 标记驱动"计算中"的视觉提示。
   */
  const scheduleRecompute = (next: Partial<Params>, partial = false) => {
    const state = get();
    const params = partial
      ? { ...state.params, ...(next as Partial<Params>) }
      : (next as Params);

    set({ params, pending: true });

    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => {
      const s = get();
      const session = build(s.params, s.forced, s.injected);
      set({
        session,
        pending: false,
        tick: clampTick(Math.min(s.tick, session.totalTicks - 1), session.totalTicks),
      });
      recomputeTimer = null;
    }, 90);
  };

  const immediateRebuild = (mutate: (draft: SessionStore) => Partial<SessionStore>) => {
    const patch = mutate(get());
    const s = { ...get(), ...patch } as SessionStore;
    const session = build(s.params, s.forced, s.injected);
    set({
      ...patch,
      session,
      pending: false,
      tick: clampTick(s.tick, session.totalTicks),
    });
  };

  return {
    params: DEFAULT_PARAMS,
    session: initial,
    tick: 0,
    playing: true,
    speed: 1,
    detail: null,
    forced: [],
    injected: [],
    pending: false,
    presetId: 'balanced',

    setParam: (key, value) => {
      scheduleRecompute({ [key]: value } as Partial<Params>, true);
    },

    setWeight: (key, value) => {
      const state = get();
      scheduleRecompute({ weights: { ...state.params.weights, [key]: value } } as Partial<Params>, true);
    },

    setAlgo: (algo) => {
      scheduleRecompute({ algo } as Partial<Params>, true);
    },

    applyPreset: (id) => {
      const preset = PRESETS.find((p) => p.id === id);
      if (!preset) return;
      const merged: Params = {
        ...DEFAULT_PARAMS,
        ...preset.patch,
        seed: get().params.seed,
        weights: { ...DEFAULT_PARAMS.weights, ...(preset.patch.weights ?? {}) },
      };
      scheduleRecompute(merged);
      set({ presetId: id });
    },

    reseed: () => {
      const next = (get().params.seed + 7919) % 1_000_000_007;
      scheduleRecompute({ ...get().params, seed: next });
      set({ tick: 0 });
    },

    resetParams: () => {
      scheduleRecompute({ ...DEFAULT_PARAMS, seed: get().params.seed });
      set({ presetId: 'balanced' });
    },

    setTick: (tick) => set({ tick: clampTick(tick, get().session.totalTicks) }),

    stepTick: (delta) =>
      set({ tick: clampTick(get().tick + delta, get().session.totalTicks), playing: false }),

    togglePlay: (next) => set({ playing: next ?? !get().playing }),

    setSpeed: (speed) => set({ speed }),

    rebuild: () => {
      if (recomputeTimer) {
        clearTimeout(recomputeTimer);
        recomputeTimer = null;
      }
      const s = get();
      const session = build(s.params, s.forced, s.injected);
      set({ session, pending: false, tick: clampTick(s.tick, session.totalTicks) });
    },

    openDetail: (phase) => set({ detail: phase }),
    closeDetail: () => set({ detail: null }),

    forceOrder: (side) => {
      const tick = get().tick;
      immediateRebuild((s) => ({ forced: [...s.forced, { tick, side }] }));
    },

    injectIncident: (kind) => {
      const tick = get().tick;
      immediateRebuild((s) => ({ injected: [...s.injected, { tick, kind }] }));
    },

    clearInjected: () => {
      immediateRebuild(() => ({ forced: [], injected: [] }));
    },
  };
});

/** 当前快照（保证索引安全） */
export function currentSnapshot(state: SessionStore) {
  const idx = Math.max(0, Math.min(state.session.snaps.length - 1, Math.floor(state.tick)));
  return state.session.snaps[idx];
}

/** 播放推进：由 rAF 循环调用 */
export function advance(state: SessionStore, dtMs: number): number {
  const tps = TICKS_PER_SECOND * state.speed;
  const next = state.tick + (dtMs / 1000) * tps;
  if (next >= state.session.totalTicks - 1) return state.session.totalTicks - 1;
  return next;
}
