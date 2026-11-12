/** Input controls: sliders, segmented toggles, and the panel that groups them. */
import type { ReactNode } from 'react';

interface SliderProps {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** How to show the current value, e.g. v => `${(v * 100).toFixed(2)}%` */
  format?: (v: number) => string;
}

export function Slider({ label, value, min, max, step, onChange, format = (v) => String(v) }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <output>{format(value)}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

interface ToggleProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}

export function Toggle<T extends string>({ options, value, onChange, label }: ToggleProps<T>) {
  return (
    <div className="toggle-wrap">
      {label && <span className="toggle-label">{label}</span>}
      <div className="toggle" role="group">
        {options.map((o) => (
          <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)} type="button">
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Controls on the left, chart(s) on the right; stacks on narrow screens. */
export function Playground({ controls, children }: { controls: ReactNode; children: ReactNode }) {
  return (
    <div className="playground">
      <div className="controls">{controls}</div>
      <div className="playground-main">{children}</div>
    </div>
  );
}

/** A row of headline numbers. */
export function Stats({ items }: { items: { label: ReactNode; value: string; hint?: string }[] }) {
  return (
    <div className="stats">
      {items.map((it, i) => (
        <div className="stat" key={i}>
          <div className="stat-label">{it.label}</div>
          <div className="stat-value">{it.value}</div>
          {it.hint && <div className="stat-hint">{it.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// Formatting helpers used across lessons.
export const pct = (v: number, d = 2) => `${(v * 100).toFixed(d)}%`;
export const bp = (v: number, d = 0) => `${(v * 1e4).toFixed(d)}bp`;
export const num = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');
