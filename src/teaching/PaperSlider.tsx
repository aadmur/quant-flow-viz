import type { CSSProperties } from 'react';

interface PaperSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  display?: string;
  hint: string;
  onChange: (value: number) => void;
}

/** 原生 range 保证键盘可用；拇指做成一张小型纸质股票，而不是普通圆点。 */
export function PaperSlider({ id, label, value, min, max, step = 1, unit = '', display, hint, onChange }: PaperSliderProps) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="paper-slider">
      <span className="paper-perf" aria-hidden="true" />
      <div className="paper-head">
        <span>MARKET NOTE · {id.toUpperCase()}</span>
        <span>№ {String(Math.round(value * 100)).padStart(5, '0')}</span>
      </div>
      <div className="paper-title">
        <label htmlFor={`slider-${id}`}>{label}</label>
        <output htmlFor={`slider-${id}`}>{display ?? value}{unit}</output>
      </div>
      <input
        id={`slider-${id}`}
        className="paper-range"
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--paper-fill': `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="paper-scale" aria-hidden="true"><span>{min}{unit}</span><span>{max}{unit}</span></div>
      <p>{hint}</p>
    </div>
  );
}
