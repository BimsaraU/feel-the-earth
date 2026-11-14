import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, ImageSource, StyleSpecification } from 'maplibre-gl';
import type { Feature, Polygon } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { norm } from '../audio/mapping';
import { dragEnd, dragStart, setCenter } from '../controller';
import { source } from '../data';
import type { LayerId } from '../data/types';
import { useApp } from '../state';
import { colour } from './colour';

maplibregl.setWorkerUrl(workerUrl); // bundled app: tell MapLibre where its worker file landed

const BASE = import.meta.env.BASE_URL;
const MAX_MERC = 85;
const HALVES = [
  { id: 'ovW', west: -180, east: 0 },
  { id: 'ovE', west: 0, east: 180 },
] as const;
const coords = (w: number, e: number): [[number, number], [number, number], [number, number], [number, number]] =>
  [[w, MAX_MERC], [e, MAX_MERC], [e, -MAX_MERC], [w, -MAX_MERC]];
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wrap = (d: number) => ((d + 540) % 360) - 180;

export function windowOutline(lat: number, lon: number, size: number): Feature<Polygon> {
  const h = size / 2, n = Math.min(90, lat + h), s = Math.max(-90, lat - h), w = lon - h, e = lon + h;
  const ring: [number, number][] = [];
  const steps = Math.ceil(size);
  for (let i = 0; i <= steps; i++) ring.push([w + (size * i) / steps, n]);
  for (let i = 1; i <= steps; i++) ring.push([e, n - ((n - s) * i) / steps]);
  for (let i = 1; i <= steps; i++) ring.push([e - (size * i) / steps, s]);
  for (let i = 1; i <= steps; i++) ring.push([w, s + ((n - s) * i) / steps]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

async function drawOverlay(map: maplibregl.Map, layerId: LayerId | undefined, date: string) {
  const layer = useApp.getState().layers.find((l) => l.id === layerId);
  for (const h of HALVES) {
    const src = map.getSource(h.id) as ImageSource | undefined;
    if (!src) continue;
    if (!layer) { src.updateImage({ url: BLANK, coordinates: coords(h.west, h.east) }); continue; }
    const n = 180;
    const win = await source.getWindow(layer.id, { west: h.west, east: h.east, south: -MAX_MERC, north: MAX_MERC }, date, n);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const t = norm(win.grid[i], layer);
      const x = i % n, y = Math.floor(i / n);
      // No data: grey hatching, so it is not shown by colour alone.
      const [r, g, b, a] = Number.isNaN(t) ? ((x + y) % 6 < 2 ? [200, 200, 200, 200] : [0, 0, 0, 0]) : [...colour(t), 255];
      img.data.set([r, g, b, a], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    src.updateImage({ url: canvas.toDataURL(), coordinates: coords(h.west, h.east) });
  }
}

export function Globe() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = useApp.getState();
    const style: StyleSpecification = {
      version: 8,
      projection: { type: 'globe' },
      sources: {
        countries: { type: 'geojson', data: `${BASE}data/geo/countries.geojson` },
        window: { type: 'geojson', data: windowOutline(s.lat, s.lon, s.size) },
        ...Object.fromEntries(HALVES.map((h) => [h.id, { type: 'image', url: BLANK, coordinates: coords(h.west, h.east) }])),
      },
      layers: [
        { id: 'ocean', type: 'background', paint: { 'background-color': '#14365c' } },
        { id: 'land', type: 'fill', source: 'countries', paint: { 'fill-color': '#3b4a3f' } },
        ...HALVES.map((h) => ({ id: h.id, type: 'raster' as const, source: h.id, paint: { 'raster-opacity': 0.72, 'raster-fade-duration': 0 } })),
        { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': '#e8eef5', 'line-width': 0.7 } },
        { id: 'win-fill', type: 'fill', source: 'window', paint: { 'fill-color': '#ffd166', 'fill-opacity': 0.12 } },
        { id: 'win-line', type: 'line', source: 'window', paint: { 'line-color': '#ffd166', 'line-width': 3 } },
      ],
    };
    const map = new maplibregl.Map({
      container: el.current!, style, center: [s.lon, s.lat], zoom: 1.8, interactive: false, attributionControl: false,
    });
    (window as unknown as { __map: maplibregl.Map }).__map = map;

    const overlayLayer = () => { const a = useApp.getState().active; return a[a.length - 1]; };
    map.on('load', () => void drawOverlay(map, overlayLayer(), useApp.getState().date));

    let overlayTimer = 0;
    const unsub = useApp.subscribe((st, prev) => {
      if (st.lat !== prev.lat || st.lon !== prev.lon || st.size !== prev.size) {
        (map.getSource('window') as GeoJSONSource | undefined)?.setData(windowOutline(st.lat, st.lon, st.size));
        const c = map.getCenter();
        const far = Math.abs(wrap(st.lon - c.lng)) > 35 || Math.abs(st.lat - c.lat) > 30;
        if (!st.dragging && !st.globeMode && far) map.easeTo({ center: [st.lon, st.lat], duration: reducedMotion() ? 0 : 400 });
      }
      if (st.date !== prev.date || st.active !== prev.active || st.layers !== prev.layers) {
        clearTimeout(overlayTimer);
        overlayTimer = window.setTimeout(() => void drawOverlay(map, overlayLayer(), st.date), 120);
      }
    });

    // ---- gestures: one finger moves the window, two fingers rotate and pinch the globe ----
    const c = el.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let mode: 'none' | 'pending' | 'window' | 'globe' = 'none';
    let grace = 0;
    let offset = { lat: 0, lon: 0 };
    let start = { lat: 0, lon: 0 };
    let last = { x: 0, y: 0, d: 0 };

    const local = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const measure = () => {
      const p = [...pts.values()];
      const x = p.reduce((a, q) => a + q.x, 0) / p.length, y = p.reduce((a, q) => a + q.y, 0) / p.length;
      return { x, y, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
    };
    const beginWindow = (p: { x: number; y: number }) => {
      const ll = map.unproject([p.x, p.y]);
      const st = useApp.getState();
      offset = { lat: st.lat - ll.lat, lon: wrap(st.lon - ll.lng) };
      start = { lat: st.lat, lon: st.lon };
      mode = 'window';
      dragStart();
    };
    const rotate = (dx: number, dy: number) => {
      const k = 360 / (512 * 2 ** map.getZoom());
      const ctr = map.getCenter();
      map.jumpTo({ center: [ctr.lng - dx * k, Math.max(-80, Math.min(80, ctr.lat + dy * k))] });
    };

    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (e.pointerType === 'mouse') {
        if (e.button === 2 || e.shiftKey) { mode = 'globe'; last = measure(); } else beginWindow(local(e));
        return;
      }
      if (pts.size === 1) {
        mode = 'pending';
        grace = window.setTimeout(() => { if (pts.size === 1 && mode === 'pending') beginWindow([...pts.values()][0]); }, 80);
      } else {
        clearTimeout(grace);
        if (mode === 'window') { setCenter(start.lat, start.lon, true); dragEnd(); } // second finger cancels the window drag
        mode = 'globe';
        last = measure();
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      if (mode === 'window') {
        const p = local(e);
        const ll = map.unproject([p.x, p.y]);
        setCenter(ll.lat + offset.lat, ll.lng + offset.lon, false);
      } else if (mode === 'globe') {
        const m = measure();
        rotate(m.x - last.x, m.y - last.y);
        if (m.d && last.d) map.setZoom(Math.max(0.5, Math.min(6, map.getZoom() + Math.log2(m.d / last.d))));
        last = m;
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (mode === 'pending' && pts.size === 0) {
        // A quick tap places the window where the finger was.
        clearTimeout(grace);
        const p = local(e);
        const ll = map.unproject([p.x, p.y]);
        setCenter(ll.lat, ll.lng, true);
      }
      if (pts.size === 0) {
        if (mode === 'window') dragEnd();
        mode = 'none';
      } else if (mode === 'globe') last = measure();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      map.setZoom(Math.max(0.5, Math.min(6, map.getZoom() - e.deltaY / 400)));
    };
    const noMenu = (e: Event) => e.preventDefault();
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('contextmenu', noMenu);

    return () => {
      unsub();
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('contextmenu', noMenu);
      map.remove();
    };
  }, []);

  return (
    <div
      ref={el}
      className="globe"
      role="application"
      tabIndex={0}
      aria-roledescription="globe"
      aria-label="Globe with listening window. Arrow keys move the window, plus and minus resize it, W says where you are, H says what you hear. Drag with one finger to move the window, two fingers to turn the globe."
    />
  );
}

/** Rotate the globe camera (G mode arrows). */
export function rotateGlobe(dLat: number, dLon: number) {
  const map = (window as unknown as { __map?: maplibregl.Map }).__map;
  if (!map) return;
  const c = map.getCenter();
  map.easeTo({ center: [c.lng + dLon, Math.max(-80, Math.min(80, c.lat + dLat))], duration: reducedMotion() ? 0 : 300 });
}
