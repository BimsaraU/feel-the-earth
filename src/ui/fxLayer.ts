// Dramatic visuals that follow the audio beat for beat. Every effect is triggered by a sound (see src/fx.ts):
// the scanned cells flare as their column plays, each note rises as a spark at its pitch height,
// accents ring out, lightning strikes as a bolt, severity tints the screen and the timpani heartbeat pulses it,
// crossings light up the line across the globe and name the hemisphere you entered.

import { gsap } from 'gsap';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { Feature, LineString } from 'geojson';
import { engine } from '../audio/engine';
import { ROWS, STEPS } from '../audio/loop';
import { voiceFor } from '../audio/mapping';
import { geo } from '../controller';
import type { LayerId } from '../data/types';
import { fx, type Fx } from '../fx';
import { LINE_NAMES, type LineId } from '../geo/events';
import { useApp } from '../state';
import { colour } from './colour';

const MAX_MERC = 85.0511;
const LINE_LAT: Partial<Record<LineId, number>> = { equator: 0, tropicOfCancer: 23.44, tropicOfCapricorn: -23.44, arcticCircle: 66.56, antarcticCircle: -66.56 };
const LINE_LON: Partial<Record<LineId, number>> = { primeMeridian: 0, antimeridian: 180 };
/** One hue per voice so the instruments read apart; sea temperature uses the data ramp itself. */
export const HUE: Record<LayerId, string | null> = { sst: null, lightning: '#d6ecff', lights: '#ffd27a', lightschange: '#c9a6ff',
  co2: '#ff8f6b', airtemp: '#ffb36b', precip: '#7fc8ff', ndvi: '#8fe08a', aerosol: '#d9c38a' };

interface Spark { lat: number; lon: number; t0: number; life: number; r: number; rgb: string; dy: number }
interface Ring { lat: number; lon: number; t0: number; life: number; r: number; rgb: string; w: number }
interface Bolt { lat: number; lon: number; topLat: number; t0: number; seed: number }
interface Flash { line: LineId; t0: number }

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

export function createFx(map: MlMap, host: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const vignette = document.createElement('div');
  vignette.className = 'fx-vignette';
  vignette.setAttribute('aria-hidden', 'true');
  // Visual only: the same news is already spoken / announced in the live region.
  const banner = document.createElement('div');
  banner.className = 'fx-banner';
  banner.setAttribute('aria-hidden', 'true');
  banner.innerHTML = '<span class="fx-banner-sub"></span><span class="fx-banner-title"></span>';
  host.append(canvas, vignette, banner);
  const ctx = canvas.getContext('2d')!;

  const flare = new Map<LayerId, Float32Array>();
  let sparks: Spark[] = [];
  let rings: Ring[] = [];
  let bolts: Bolt[] = [];
  let flashes: Flash[] = [];
  let countryFlash = { id: 0, t0: -1e9 };
  let heart = 0;
  let timeFlash = 0;
  let last = performance.now();

  const onLoad = () => {
    map.addSource('fx-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'fx-country', type: 'fill', source: 'countries', filter: ['==', ['get', 'id'], -1], paint: { 'fill-color': '#9ef2c9', 'fill-opacity': 0 } }, 'win-fill');
    map.addLayer({ id: 'fx-line-glow', type: 'line', source: 'fx-lines', paint: { 'line-color': ['get', 'c'], 'line-width': ['*', 22, ['get', 'a']], 'line-blur': 14, 'line-opacity': ['get', 'a'] } }, 'win-fill');
    map.addLayer({ id: 'fx-line', type: 'line', source: 'fx-lines', paint: { 'line-color': '#ffffff', 'line-width': 1.8, 'line-opacity': ['get', 'a'] } }, 'win-fill');
  };
  if (map.style?._loaded) onLoad(); else map.once('style.load', onLoad); // never 'load': the scan source updates every frame

  const win = () => {
    const s = useApp.getState();
    const h = s.size / 2;
    return { s, west: s.lon - h, east: s.lon + h, south: Math.max(-MAX_MERC, s.lat - h), north: Math.min(MAX_MERC, s.lat + h) };
  };

  const showBanner = (title: string, sub: string) => {
    (banner.firstChild as HTMLElement).textContent = sub;
    (banner.lastChild as HTMLElement).textContent = title;
    gsap.killTweensOf(banner);
    gsap.fromTo(banner, { autoAlpha: 0, scale: reduced ? 1 : 1.12, letterSpacing: reduced ? '0.3em' : '0.6em' },
      { autoAlpha: 1, scale: 1, letterSpacing: '0.3em', duration: 0.9, ease: 'expo.out' });
    gsap.to(banner, { autoAlpha: 0, duration: 1.2, delay: 2.2, ease: 'power2.in' });
  };

  const shake = (px: number) => {
    if (reduced) return;
    gsap.fromTo(host, { x: 0, y: 0 }, { duration: 0.35, ease: 'none', clearProps: 'transform',
      keyframes: [{ x: px, y: -px * 0.6 }, { x: -px * 0.8, y: px * 0.5 }, { x: px * 0.4, y: px * 0.3 }, { x: 0, y: 0 }] });
  };

  const centreRing = (rgb: string, r: number, life: number, w = 3) => {
    const { s } = win();
    rings.push({ lat: s.lat, lon: s.lon, t0: performance.now(), life, r, rgb, w });
  };

  const on = (f: Fx) => {
    const now = performance.now();
    const w = win();
    switch (f.kind) {
      case 'step': {
        const fl = flare.get(f.layer) ?? new Float32Array(STEPS);
        flare.set(f.layer, fl);
        fl[f.i] = 1;
        const v = voiceFor(f.layer);
        const [lo, hi] = v.register;
        const lon = w.west + ((f.i + 0.5) / STEPS) * (w.east - w.west);
        for (const n of f.step.notes) {
          const lat = w.south + ((n.midi - lo) / Math.max(1, hi - lo)) * (w.north - w.south);
          const rgb = HUE[f.layer] ? rgbOf(HUE[f.layer]!) : colour(f.step.value, f.layer).join(',');
          sparks.push({ lat, lon, t0: now + n.offset * 400, life: 900 + 1400 * n.dur * 0.25, r: 3 + 14 * n.vel, rgb, dy: 0 });
          if (f.layer === 'lightning') bolts.push({ lat, lon, topLat: w.north, t0: now, seed: Math.random() * 1000 });
        }
        if (f.step.accent && !f.step.noData) {
          const rgb = HUE[f.layer] ? rgbOf(HUE[f.layer]!) : colour(f.step.value, f.layer).join(',');
          rings.push({ lat: (w.north + w.south) / 2, lon, t0: now, life: 900, r: 70, rgb, w: 2 });
        }
        break;
      }
      case 'heartbeat':
        heart = Math.max(heart, 0.5 + 0.5 * f.strength);
        shake(2 + 3 * f.strength);
        break;
      case 'line': {
        flashes.push({ line: f.line, t0: now });
        const name = LINE_NAMES[f.line].replace(/^the /, '');
        const title = f.line === 'equator' ? (f.lat >= 0 ? 'Northern hemisphere' : 'Southern hemisphere')
          : f.line === 'primeMeridian' ? (f.lon >= 0 ? 'Eastern hemisphere' : 'Western hemisphere')
          : f.line === 'antimeridian' ? 'Across the date line' : name;
        showBanner(title, f.line === 'equator' || f.line === 'primeMeridian' ? `Crossed ${name}` : 'Crossed');
        centreRing('255,255,255', 260, 1600, 2);
        break;
      }
      case 'border':
        countryLive = false; // re-apply the filter for the new country
        countryFlash = { id: geo?.countryId(f.lat, f.lon) ?? 0, t0: now };
        centreRing('158,242,201', 120, 900, 2);
        break;
      case 'coast':
        if (f.to === 'sea') { centreRing('95,211,255', 180, 1400, 4); centreRing('95,211,255', 110, 1100, 2); }
        else centreRing('224,176,112', 140, 1000, 5);
        break;
      case 'pole':
        centreRing('255,255,255', 420, 2000, 6);
        shake(8);
        break;
      case 'time':
        timeFlash = f.big ? 1 : 0.6;
        break;
      case 'demo': {
        const rgb = HUE[f.layer] ? rgbOf(HUE[f.layer]!) : colour(f.t, f.layer).join(',');
        for (let i = 0; i < 6 + 18 * f.t; i++) {
          sparks.push({ lat: w.south + Math.random() * (w.north - w.south), lon: w.west + Math.random() * (w.east - w.west),
            t0: now + i * 25, life: 1400, r: 3 + 12 * f.t, rgb, dy: 0 });
        }
        break;
      }
    }
  };
  const off = fx.on(on);

  const proj = (lat: number, lon: number) => map.project([lon, lat]);

  const lineFeature = (fl: Flash, a: number): Feature<LineString> => {
    const lat = LINE_LAT[fl.line];
    const coords: [number, number][] = [];
    if (lat !== undefined) for (let x = -180; x <= 180; x += 2) coords.push([x, lat]);
    else { const lon = LINE_LON[fl.line]!; for (let y = -MAX_MERC; y <= MAX_MERC; y += 2) coords.push([lon, y]); }
    const c = fl.line === 'equator' ? '#ffe6a6' : fl.line === 'antimeridian' ? '#ff9ec7' : fl.line === 'primeMeridian' ? '#a6d8ff' : '#c6ffe4';
    return { type: 'Feature', properties: { a, c }, geometry: { type: 'LineString', coordinates: coords } };
  };

  let linesLive = false;
  let countryLive = false;
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = host.clientWidth, H = host.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const w = win();
    const active = w.s.active;

    // ---- the window: cells of the loudest-on-screen layer flare as the scan plays their column ----
    const top = active[active.length - 1];
    const pat = top ? engine.voices.get(top)?.current : null;
    const decay = Math.exp(-dt * 3.2);
    for (const fl of flare.values()) for (let i = 0; i < STEPS; i++) fl[i] *= decay;
    if (pat) {
      const fl = flare.get(top!) ?? new Float32Array(STEPS);
      const pts: { x: number; y: number }[] = [];
      for (let r = 0; r <= ROWS; r++) for (let s = 0; s <= STEPS; s++) {
        pts.push(proj(w.north - (r / ROWS) * (w.north - w.south), w.west + (s / STEPS) * (w.east - w.west)));
      }
      const P = (r: number, s: number) => pts[r * (STEPS + 1) + s];
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < ROWS; r++) for (let s = 0; s < STEPS; s++) {
        const t = pat.cells[r * STEPS + s];
        if (Number.isNaN(t)) continue;
        const a = 0.05 + 0.08 * t + fl[s] * (0.25 + 0.6 * t);
        if (a < 0.02) continue;
        const [cr, cg, cb] = colour(t, top);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
        ctx.beginPath();
        const p0 = P(r, s), p1 = P(r, s + 1), p2 = P(r + 1, s + 1), p3 = P(r + 1, s);
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
      }
      // Time step: the window frame flashes.
      if (timeFlash > 0.01) {
        ctx.strokeStyle = `rgba(255,255,255,${timeFlash})`;
        ctx.lineWidth = 2 + 6 * timeFlash;
        ctx.shadowColor = '#9ef2c9'; ctx.shadowBlur = 24 * timeFlash;
        ctx.beginPath();
        const ring = [P(0, 0), P(0, STEPS), P(ROWS, STEPS), P(ROWS, 0)];
        ring.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath(); ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    timeFlash *= Math.exp(-dt * 4);

    // ---- lightning bolts: a jagged strike from the top of the window down to the note ----
    ctx.globalCompositeOperation = 'lighter';
    bolts = bolts.filter((b) => now - b.t0 < 220);
    for (const b of bolts) {
      const a = 1 - (now - b.t0) / 220;
      const p0 = proj(b.topLat, b.lon), p1 = proj(b.lat, b.lon);
      const n = 7;
      ctx.strokeStyle = `rgba(214,236,255,${a})`;
      ctx.lineWidth = 1.5 + 2 * a;
      ctx.shadowColor = '#bfe2ff'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < n; i++) {
        const k = i / n, j = Math.sin(b.seed + i * 12.9898) * 43758.5453;
        ctx.lineTo(p0.x + (p1.x - p0.x) * k + ((j - Math.floor(j)) - 0.5) * 22, p0.y + (p1.y - p0.y) * k);
      }
      ctx.lineTo(p1.x, p1.y); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ---- sparks: each note rises from its pitch height and fades ----
    sparks = sparks.filter((p) => now - p.t0 < p.life);
    if (sparks.length > 400) sparks = sparks.slice(-400);
    for (const p of sparks) {
      const k = (now - p.t0) / p.life;
      if (k < 0) continue;
      const q = proj(p.lat, p.lon);
      const y = q.y - (reduced ? 0 : 40 * k);
      const a = (1 - k) ** 1.6;
      const r = p.r * (0.6 + 0.8 * Math.sqrt(k));
      const g = ctx.createRadialGradient(q.x, y, 0, q.x, y, r * 2.2);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.25, `rgba(${p.rgb},${a * 0.8})`);
      g.addColorStop(1, `rgba(${p.rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(q.x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // ---- rings: accents, coasts, borders, crossings ----
    rings = rings.filter((r) => now - r.t0 < r.life);
    for (const r of rings) {
      const k = (now - r.t0) / r.life;
      if (k < 0) continue; // scheduled for a later audio beat
      const q = proj(r.lat, r.lon);
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - k) ** 2})`;
      ctx.lineWidth = r.w * (1 - k) + 0.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, 6 + r.r * (1 - (1 - k) ** 3), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ---- severity: the edges of the screen warm from calm to amber to red; the heartbeat pulses them ----
    const sev = active.length ? engine.severity : 0;
    heart *= Math.exp(-dt * 3.5);
    const hue = sev < 0.34 ? '158,242,201' : sev < 0.67 ? '233,170,80' : '235,70,60';
    vignette.style.boxShadow = `inset 0 0 ${120 + 120 * heart}px ${20 + 60 * sev + 50 * heart}px rgba(${hue},${0.06 + 0.3 * sev + 0.35 * heart})`;

    // ---- map layers: crossed lines glow across the globe, a newly entered country lights up ----
    if (map.getSource('fx-lines')) {
      flashes = flashes.filter((f) => now - f.t0 < 3000);
      if (flashes.length || linesLive) {
        const feats = flashes.map((f) => lineFeature(f, (1 - (now - f.t0) / 3000) ** 1.5));
        (map.getSource('fx-lines') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats });
        linesLive = flashes.length > 0;
      }
      const ca = Math.max(0, 1 - (now - countryFlash.t0) / 1200);
      if (ca > 0 || countryLive) {
        if (!countryLive) map.setFilter('fx-country', ['==', ['get', 'id'], countryFlash.id]);
        map.setPaintProperty('fx-country', 'fill-opacity', 0.4 * ca ** 2);
        countryLive = ca > 0;
      }
    }
  }

  return {
    frame,
    dispose() { off(); canvas.remove(); vignette.remove(); banner.remove(); },
  };
}
