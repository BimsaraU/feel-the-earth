import { useEffect, useRef } from 'react';
import { haptics } from '../haptics/haptics';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Text shown and spoken for a value. */
  format: (v: number) => string;
  onChange: (v: number) => void;
  /** Called when a drag, flick or key press settles. */
  onCommit?: () => void;
  /** Pixels of drag per step; small values make long ranges (dates) flick quickly. */
  pxPerStep?: number;
}

/**
 * A tactile scroll wheel: drag or flick sideways, scroll, or use the arrow keys. Every step is a detent
 * with a haptic tick on phones. Exposed to assistive technology as a slider.
 */
export function Wheel({ label, value, min, max, step, format, onChange, onCommit, pxPerStep = 14 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const live = useRef({ value, acc: 0, vel: 0, raf: 0, lastX: 0, lastT: 0, dragging: false });
  live.current.value = value;
  const steps = Math.round((value - min) / step);

  const set = (v: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
    if (clamped !== live.current.value) {
      live.current.value = clamped;
      haptics.pulse('tick');
      onChange(clamped);
    }
    return clamped;
  };

  /** Move by a pixel distance; whole steps are applied, the remainder carries over. */
  const nudge = (px: number) => {
    const s = live.current;
    s.acc += px / pxPerStep;
    const whole = Math.trunc(s.acc);
    if (whole) {
      s.acc -= whole;
      const before = s.value;
      if (set(before + whole * step) === before) s.vel = 0; // hit an end stop
    }
  };

  useEffect(() => () => cancelAnimationFrame(live.current.raf), []);

  const coast = () => {
    const s = live.current;
    let t = performance.now();
    const tick = (now: number) => {
      const dt = (now - t) / 1000;
      t = now;
      s.vel *= Math.exp(-dt * 5); // friction
      if (Math.abs(s.vel) < 30) { s.raf = 0; s.acc = 0; onCommit?.(); return; }
      nudge(s.vel * dt);
      s.raf = requestAnimationFrame(tick);
    };
    s.raf = requestAnimationFrame(tick);
  };

  return (
    <div className="wheel-field">
      <div className="wheel-head"><span>{label}</span><output>{format(value)}</output></div>
      <div
        ref={el}
        className="wheel"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        style={{ '--offset': `${-steps * pxPerStep}px`, '--pitch': `${pxPerStep}px` } as React.CSSProperties}
        onPointerDown={(e) => {
          const s = live.current;
          cancelAnimationFrame(s.raf);
          el.current!.setPointerCapture(e.pointerId);
          Object.assign(s, { dragging: true, lastX: e.clientX, lastT: performance.now(), vel: 0, acc: 0 });
        }}
        onPointerMove={(e) => {
          const s = live.current;
          if (!s.dragging) return;
          const now = performance.now(), dx = s.lastX - e.clientX; // drag left = forward, like turning a wheel
          s.vel = 0.8 * s.vel + 0.2 * (dx / Math.max(1, now - s.lastT)) * 1000;
          s.lastX = e.clientX; s.lastT = now;
          nudge(dx);
        }}
        onPointerUp={() => { live.current.dragging = false; coast(); }}
        onPointerCancel={() => { live.current.dragging = false; onCommit?.(); }}
        onWheel={(e) => { nudge((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.5); onCommit?.(); }}
        onKeyDown={(e) => {
          const k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
          if (k) set(live.current.value + k * step);
          else if (e.key === 'Home') set(min);
          else if (e.key === 'End') set(max);
          else return;
          e.preventDefault();
          e.stopPropagation(); // arrows here turn the wheel, not the listening window
        }}
        onKeyUp={() => onCommit?.()}
      >
        <span className="wheel-mark" aria-hidden="true" />
      </div>
    </div>
  );
}
