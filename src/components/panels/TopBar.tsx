import type { Snapshot } from '../../core/types';
import { fmtPct, fmtPrice } from '../../core/format';
import { PRESETS } from '../../model/params';
import { SPEED_STEPS } from '../../store/useSession';

export interface TopBarProps {
  snap: Snapshot;
  code: string;
  name: string;
  playing: boolean;
  speed: number;
  presetId: string;
  pending: boolean;
  onPlay: () => void;
  onSpeed: (s: number) => void;
  onPreset: (id: string) => void;
  onReseed: () => void;
  onReset: () => void;
}

export function TopBar({
  snap,
  code,
  name,
  playing,
  speed,
  presetId,
  pending,
  onPlay,
  onSpeed,
  onPreset,
  onReseed,
  onReset,
}: TopBarProps) {
  const up = snap.changePct >= 0;
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
          <polygon points="13,2 24,8 24,18 13,24 2,18 2,8" fill="none" stroke="#38e1ff" strokeWidth="1.2" opacity="0.85" />
          <polygon points="13,7 19.5,10.6 19.5,17.4 13,21 6.5,17.4 6.5,10.6" fill="rgba(56,225,255,0.16)" />
          <line x1="13" y1="2" x2="13" y2="21" stroke="#ffb020" strokeWidth="1" opacity="0.7" />
        </svg>
        <div className="brand-text">
          <strong>QUANTFLOW</strong>
          <span>交易引擎拆解台 · ENGINE TEARDOWN</span>
        </div>
      </div>

      <div className="sym">
        <div className="sym-id">
          <span className="sym-code mono">{code}</span>
          <span className="sym-name">{name}</span>
        </div>
        <div className={`sym-price tabnum ${up ? 'up' : 'down'}`}>
          {fmtPrice(snap.price)}
          <em>{fmtPct(snap.changePct)}</em>
        </div>
        <span className={`regime ${snap.regime.includes('趋势') ? 'trend' : ''}`}>{snap.regime}</span>
      </div>

      <div className="top-mid">
        <span className="live-dot" data-on={playing} />
        <span className="tabnum">{snap.clock}</span>
        <span className="divider" />
        <button className={`mini-play ${playing ? 'on' : ''}`} onClick={onPlay}>
          {playing ? '暂停' : '播放'}
        </button>
        <div className="speed">
          {SPEED_STEPS.map((s) => (
            <button key={s} className={speed === s ? 'on' : ''} onClick={() => onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        {pending && <span className="pending">重算中…</span>}
      </div>

      <div className="top-right">
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.id} className={presetId === p.id ? 'on' : ''} onClick={() => onPreset(p.id)} title={p.desc}>
              {p.name}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={onReset}>
          重置
        </button>
        <button className="ghost" onClick={onReseed}>
          换种子
        </button>
      </div>
    </header>
  );
}
