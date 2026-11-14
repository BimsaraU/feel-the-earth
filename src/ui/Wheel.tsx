import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
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
  /** Called when a drag, flick, scroll or key press settles. */
  onCommit?: () => void;
  /** Pixels of drag per step; small values make long ranges (dates) flick quickly. */
  pxPerStep?: number;
  /** Label printed on the drum at a value, or null for a plain tick. Default: a number every ~60 px. */
  tick?: (v: number) => string | null;
}

/**
 * A scroll wheel: a drum printed with its own scale that rolls under the pointer. Drag or flick sideways, scroll
 * (mouse wheel or trackpad), or use the arrow keys. The drum moves continuously and clicks into a detent at every
 * step, with a haptic tick on phones. Exposed to assistive technology as a slider.
 */
export function Wheel({ label, value, min, max, step, format, onChange, onCommit, pxPerStep = 14, tick }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const live = useRef({ value, acc: 0, vel: 0, raf: 0, lastX: 0, lastT: 0, dragging: false, clickAt: 0, commit: 0 });
  live.current.value = value;
  const [frac, setFrac] = useState(0); // part of a step the drum has rolled past the current detent
  const [half, setHalf] = useState(160);

  const set = (v: number) => {
    const clamped = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
    const s = live.current, now = performance.now();
    if (clamped !== s.value) {
      // Every step is a detent you can feel and hear: a haptic tick and a dry click, higher going up.
      haptics.pulse('tick');
      if (now - s.clickAt > 28) { s.clickAt = now; engine.detent(clamped > s.value); }
      s.value = clamped;
      onChange(clamped);
    } else if ((v > max || v < min) && now - s.clickAt > 300) {
      // End stop: a dull thud and a nudge of the drum.
      s.clickAt = now;
      engine.play('thump', { db: -12, music: true });
      haptics.pulse('coast');
      el.current?.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${v > clamped ? -5 : 5}px)` }, { transform: 'translateX(0)' }], { duration: 160 });
    }
    return clamped;
  };

  /** Roll by a pixel distance; whole steps are applied, the remainder shows as the drum's position between detents. */
  const nudge = (px: number) => {
    const s = live.current;
    s.acc += px / pxPerStep;
    const whole = Math.trunc(s.acc);
    if (whole) {
      s.acc -= whole;
      const before = s.value;
      if (set(before + whole * step) === before) { s.vel = 0; s.acc = 0; } // hit an end stop
    }
    setFrac(s.acc);
  };

  const settle = () => { const s = live.current; s.acc = 0; setFrac(0); onCommit?.(); };
  const latest = useRef({ nudge, settle });
  latest.current = { nudge, settle };

  useEffect(() => {
    const node = el.current!;
    const ro = new ResizeObserver(() => setHalf(node.clientWidth / 2));
    ro.observe(node);
    // Native, non-passive: scrolling over the drum turns it instead of scrolling the menu.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = live.current;
      cancelAnimationFrame(s.raf);
      latest.current.nudge((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : 1) * 0.5);
      clearTimeout(s.commit);
      s.commit = window.setTimeout(() => latest.current.settle(), 220);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => { ro.disconnect(); node.removeEventListener('wheel', wheel); cancelAnimationFrame(live.current.raf); clearTimeout(live.current.commit); };
  }, []);

  const coast = () => {
    const s = live.current;
    let t = performance.now();
    const tickFn = (now: number) => {
      const dt = (now - t) / 1000;
      t = now;
      s.vel *= Math.exp(-dt * 5); // friction
      if (Math.abs(s.vel) < 30) { s.raf = 0; settle(); return; }
      nudge(s.vel * dt);
      s.raf = requestAnimationFrame(tickFn);
    };
    s.raf = requestAnimationFrame(tickFn);
  };

  // The printed scale: one tick per step around the current value, bent round a drum of radius `half`.
  const idx = Math.round((value - min) / step), last = Math.round((max - min) / step);
  const reach = Math.ceil(half / pxPerStep) + 1;
  const every = Math.max(1, Math.ceil(60 / pxPerStep));
  const marks = [];
  for (let i = Math.max(0, idx - reach); i <= Math.min(last, idx + reach); i++) {
    const x = (i - idx - frac) * pxPerStep;
    if (Math.abs(x) > half) continue;
    const a = (x / half) * (Math.PI / 2) * 0.98;
    const v = min + i * step;
    const text = tick ? tick(v) : i % every === 0 ? String(+v.toFixed(2)) : null;
    marks.push(
      <span key={i} className={`wheel-tick${text ? ' major' : ''}`}
        style={{ transform: `translateX(${half * Math.sin(a)}px) scaleX(${Math.cos(a)})`, opacity: 0.2 + 0.8 * Math.cos(a) }}>
        {text && <b>{text}</b>}
      </span>,
    );
  }

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
        onPointerDown={(e) => {
          const s = live.current;
          cancelAnimationFrame(s.raf);
          el.current!.setPointerCapture(e.pointerId);
          Object.assign(s, { dragging: true, lastX: e.clientX, lastT: performance.now(), vel: 0 });
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
        onPointerCancel={() => { live.current.dragging = false; settle(); }}
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
        <span className="wheel-scale" aria-hidden="true">{marks}</span>
        <span className="wheel-shade" aria-hidden="true" />
        <span className="wheel-mark" aria-hidden="true" />
      </div>
    </div>
  );
}
