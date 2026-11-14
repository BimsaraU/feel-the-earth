import { useEffect, useRef } from 'react';

/** Small seeded generator so the sky is the same on every resize. */
function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(cv: HTMLCanvasElement) {
  const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rnd = mulberry(7), D = Math.hypot(W, H);
  ctx.fillStyle = '#03040b';
  ctx.fillRect(0, 0, W, H);
  // The galactic band runs from lower left to upper right: nebula clouds, then a denser river of stars along it.
  const band = (u: number, spread: number) => {
    const g = (rnd() + rnd() + rnd() - 1.5) * spread; // roughly gaussian offset across the band
    return [u * W - g * H * 0.55, (1 - u) * H - g * W * 0.55 + (u - 0.5) * H * 0.25] as const;
  };
  ctx.globalCompositeOperation = 'lighter';
  for (const rgb of ['70,45,150', '25,60,150', '130,40,110', '20,90,120', '60,50,140', '30,40,120']) {
    for (let k = 0; k < 3; k++) {
      const [x, y] = band(rnd(), 0.5), r = D * (0.14 + 0.2 * rnd());
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},0.16)`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }
  const count = Math.round((W * H) / 450);
  for (let i = 0; i < count; i++) {
    const [x, y] = i % 3 ? band(rnd(), 0.45) : [rnd() * W, rnd() * H];
    const m = rnd() ** 5, r = 0.3 + 0.9 * m; // most stars are faint
    const tint = rnd() < 0.2 ? '255,214,170' : rnd() < 0.3 ? '170,200,255' : '255,255,255';
    ctx.fillStyle = `rgba(${tint},${0.2 + 0.8 * m})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    if (m > 0.6) { // the few bright ones glow
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      g.addColorStop(0, `rgba(${tint},0.22)`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 5, 0, 6.2832); ctx.fill();
    }
  }
}

/** Galaxy backdrop: the planet floats in it. Drawn once per size, no animation. */
export function Galaxy() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ro = new ResizeObserver(() => draw(cv));
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);
  return <canvas ref={ref} className="galaxy" aria-hidden="true" />;
}
