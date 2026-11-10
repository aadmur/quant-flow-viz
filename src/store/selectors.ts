import { useSession, currentSnapshot } from './useSession';
import type { SessionData, Snapshot } from '../core/types';

/** 当前快照。tick 为小数时向下取整，避免索引越界 */
export function useSnap(): Snapshot {
  return useSession((s) => currentSnapshot(s));
}

/** 浮点 tick（用于时间轴平滑推进） */
export function useTickRaw(): number {
  return useSession((s) => s.tick);
}

export function useSessionData(): SessionData {
  return useSession((s) => s.session);
}

/** 当前 tick 内该阶段是否应点亮 */
export function usePhaseSignal() {
  return useSession((s) => {
    const snap = currentSnapshot(s);
    return { active: snap.metrics.activePhase, tick: snap.tick };
  });
}
