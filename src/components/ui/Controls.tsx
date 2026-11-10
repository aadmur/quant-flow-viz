import { useId, type ReactNode } from 'react';
import type { PhaseId } from '../../core/types';

/* ---------------- 滑块 ---------------- */

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** 显示值（已格式化） */
  display: string;
  onChange: (v: number) => void;
  /** 归属阶段，用于显示阶段色点 */
  phase?: PhaseId;
  hint?: string;
  disabled?: boolean;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  display,
  onChange,
  phase,
  hint,
  disabled,
}: SliderProps) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <div className="slider">
      <div className="slider-head">
        <label className="slider-label" htmlFor={id} title={hint}>
          {phase && <i className={`phase-dot tone-${phase}`} />}
          {label}
        </label>
        <span className="slider-value">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
        aria-valuetext={display}
      />
    </div>
  );
}

/* ---------------- 分段控件 ---------------- */

export interface SegmentedProps<T extends string | number> {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  phase?: PhaseId;
  ariaLabel?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  phase,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div className={`segmented ${phase ? `tone-${phase}` : ''}`} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- 指标 ---------------- */

export function Stat({
  label,
  value,
  hint,
  color,
  small,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  color?: string;
  small?: boolean;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value num ${small ? 'sm' : ''}`} style={color ? { color } : undefined}>
        {value}
      </span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

/* ---------------- 进度条 ---------------- */

export function Meter({
  value,
  max = 1,
  tone,
}: {
  value: number;
  max?: number;
  tone?: string;
}) {
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max)) * 100;
  return (
    <div className="meter">
      <i style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

export function MeterRow({
  label,
  value,
  max,
  display,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  display: string;
  tone?: string;
}) {
  return (
    <div className="meter-row">
      <span className="dim">{label}</span>
      <Meter value={value} max={max} tone={tone} />
      <span className="meter-val">{display}</span>
    </div>
  );
}

/* ---------------- 徽章 / 状态点 ---------------- */

export function Chip({
  children,
  kind,
  phase,
}: {
  children: ReactNode;
  kind?: 'up' | 'down' | 'warn' | 'neg';
  phase?: PhaseId;
}) {
  return <span className={`chip ${kind ?? ''} ${phase ? `tone tone-${phase}` : ''}`}>{children}</span>;
}

export function Dot({ state = 'idle' }: { state?: 'live' | 'idle' | 'warn' | 'error' }) {
  return <i className={`dot ${state}`} />;
}

export function Sev({ level, phase }: { level: number; phase?: PhaseId }) {
  return (
    <span className={`sev ${phase ? `tone-${phase}` : ''}`} aria-label={`严重度 ${level}`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= level ? 'on' : ''} />
      ))}
    </span>
  );
}

/* ---------------- 空状态 ---------------- */

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ---------------- 按钮 ---------------- */

export function Btn({
  children,
  onClick,
  variant,
  size,
  disabled,
  title,
  active,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  size?: 'sm';
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      className={`btn ${variant ?? ''} ${size ?? ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      style={active ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' } : undefined}
    >
      {children}
    </button>
  );
}
