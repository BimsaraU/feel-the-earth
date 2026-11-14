import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, ImageSource, StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { norm } from '../audio/mapping';
import { dragEnd, dragStart, isGliding, setCenter, setSize, sizeDone } from '../controller';
import { source } from '../data';
import type { LayerId } from '../data/types';
import { useApp, type Halo } from '../state';
import { colour } from './colour';
import { createFx, HUE } from './fxLayer';

maplibregl.setWorkerUrl(workerUrl); // bundled app: tell MapLibre where its worker file landed

const BASE = import.meta.env.BASE_URL;
const MAX_MERC = 85.0511;
const HALVES = [
  { id: 'ovW', west: -180, east: 0 },
  { id: 'ovE', west: 0, east: 180 },
] as const;
const coords = (w: number, e: number): [[number, number], [number, number], [number, number], [number, number]] =>
  [[w, MAX_MERC], [e, MAX_MERC], [e, -MAX_MERC], [w, -MAX_MERC]];
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const wrap = (d: number) => ((d + 540) % 360) - 180;
const MINT = '#9ef2c9';

export function windowOutline(lat: number, lon: number, size: number): Feature<Polygon> {
  const h = size / 2, n = Math.min(90, lat + h), s = Math.max(-90, lat - h), w = lon - h, e = lon + h;
  const ring: [number, number][] = [];
  const steps = Math.max(4, Math.ceil(size));
  for (let i = 0; i <= steps; i++) ring.push([w + (size * i) / steps, n]);
  for (let i = 1; i <= steps; i++) ring.push([e, n - ((n - s) * i) / steps]);
  for (let i = 1; i <= steps; i++) ring.push([e - (size * i) / steps, s]);
  for (let i = 1; i <= steps; i++) ring.push([w, s + ((n - s) * i) / steps]);
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

const line = (lon: number, s: number, n: number): Feature<LineString> =>
  ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[lon, s], [lon, (s + n) / 2], [lon, n]] } });
const point = (lat: number, lon: number): Feature<Point> => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } });

const MERC_Y_MAX = Math.log(Math.tan(Math.PI / 4 + (MAX_MERC * Math.PI) / 360));

/** Data overlay as two Web Mercator images: each canvas row is sampled at its Mercator latitude. */
async function drawOverlay(map: maplibregl.Map, layerId: LayerId | undefined, date: string) {
  const layer = useApp.getState().layers.find((l) => l.id === layerId);
  const n = 360; // half a degree per pixel; the raster layer interpolates linearly between them
  for (const h of HALVES) {
    const src = map.getSource(h.id) as ImageSource | undefined;
    if (!src) continue;
    if (!layer) { src.updateImage({ url: BLANK, coordinates: coords(h.west, h.east) }); continue; }
    const win = await source.getWindow(layer.id, { west: h.west, east: h.east, south: -MAX_MERC, north: MAX_MERC }, date, n);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      const lat = (Math.atan(Math.sinh(MERC_Y_MAX * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI;
      const row = Math.min(n - 1, Math.max(0, Math.floor(((MAX_MERC - lat) / (2 * MAX_MERC)) * n)));
      for (let x = 0; x < n; x++) {
        const t = norm(win.grid[row * n + x], layer);
        const [r, g, b, a] = Number.isNaN(t) ? [0, 0, 0, 0] : [...colour(t, layer.id), 255]; // no data: just the Earth
        img.data.set([r, g, b, a], (y * n + x) * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
    src.updateImage({ url: canvas.toDataURL(), coordinates: coords(h.west, h.east) });
  }
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
const box = (w: number, s: number, e: number, n: number): Polygon => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

/**
 * Data around the window as 3D blocks on the real globe. Every block is one cell of the halo map with its exact
 * geographic bounds. Each active layer floats on its own translucent plate, stacked upwards in switch-on order; block
 * height follows the value (signed layers rise above the plate for gains and hang below it for losses).
 * Heights scale with the window so the stack keeps its proportions at every size.
 */
export function holoFeatures(h: Halo | null): FeatureCollection {
  const feats: Feature[] = [];
  const st = useApp.getState();
  if (!h) return { type: 'FeatureCollection', features: feats };
  const span = h.size * 111_000; // window width in metres
  const G = span * 0.014, H = span * 0.012; // plate spacing, full-range block height: kept subtle
  const { box: b, n } = h;
  const dLat = (b.north - b.south) / n, dLon = (b.east - b.west) / n, gap = 0.04;
  st.active.forEach((id, k) => {
    const layer = st.layers.find((l) => l.id === id), grid = h.grids[id];
    if (!layer || !grid) return;
    const plate = G * (k + 1);
    const tint = HUE[id] ?? MINT;
    const signed = layer.min < 0 && -layer.min >= 0.25 * layer.max;
    const t0 = signed ? norm(0, layer) : 0;
    feats.push({ type: 'Feature', properties: { kind: 'plate', c: tint, b: plate - G * 0.015, h: plate }, geometry: box(b.west, b.south, b.east, b.north) });
    // Local contrast: 35 % absolute value + 65 % stretched over this neighbourhood, so the colour range shows local
    // structure (e.g. 26 vs 29 °C) instead of one flat hue. The globe overlay and the legend stay absolute.
    let lo = 1, hi = 0;
    for (const v of grid) { const t = norm(v, layer); if (t < lo) lo = t; if (t > hi) hi = t; }
    const local = (t: number) => (signed ? t : 0.35 * t + 0.65 * ((t - lo) / Math.max(0.04, hi - lo)));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const t = norm(grid[r * n + c], layer);
      if (Number.isNaN(t)) continue;
      const tl = local(t);
      const top = plate + (signed ? (t - t0) * H * 1.6 : Math.max(0.03, tl) * H);
      const col = '#' + colour(tl, id).map(hex2).join('');
      const n0 = b.north - r * dLat, w0 = b.west + c * dLon;
      feats.push({ type: 'Feature', properties: { kind: 'cell', c: col, b: Math.min(plate, top), h: Math.max(plate, top) },
        geometry: box(w0 + gap * dLon, n0 - (1 - gap) * dLat, w0 + (1 - gap) * dLon, n0 - gap * dLat) });
    }
  });
  return { type: 'FeatureCollection', features: feats };
}

let mapRef: maplibregl.Map | null = null;

export function Globe() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = useApp.getState();
    const style: StyleSpecification = {
      version: 8,
      // Globe when zoomed out, a flat map that fills the screen when zoomed in.
      projection: { type: ['interpolate', ['linear'], ['zoom'], 3, 'vertical-perspective', 4, 'mercator'] },
      sky: {
        'sky-color': '#06120f', 'horizon-color': '#1b4d40', 'fog-color': '#0a1a16',
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 4, 0.4, 6, 0],
      },
      sources: {
        earth: { type: 'raster', tiles: [`${BASE}tiles/{z}/{x}/{y}.jpg`], tileSize: 256, maxzoom: 5 },
        countries: { type: 'geojson', data: `${BASE}data/geo/countries.geojson` },
        window: { type: 'geojson', data: windowOutline(s.lat, s.lon, s.size) },
        scan: { type: 'geojson', data: line(s.lon, s.lat - s.size / 2, s.lat + s.size / 2) },
        centre: { type: 'geojson', data: point(s.lat, s.lon) },
        holo: { type: 'geojson', data: holoFeatures(s.halo), buffer: 0, tolerance: 0 },
        ...Object.fromEntries(HALVES.map((h) => [h.id, { type: 'image', url: BLANK, coordinates: coords(h.west, h.east) }])),
      },
      layers: [
        { id: 'space', type: 'background', paint: { 'background-color': '#071311' } },
        // NASA Blue Marble, slightly muted so the holographic overlay and lines read on top.
        { id: 'earth', type: 'raster', source: 'earth', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.12, 'raster-brightness-max': 0.82, 'raster-fade-duration': 0 } },
        ...HALVES.map((h) => ({ id: h.id, type: 'raster' as const, source: h.id, paint: { 'raster-opacity': 0.4, 'raster-fade-duration': 250, 'raster-resampling': 'linear' as const } })),
        // Sharp, glowing coastlines and borders over the imagery (Natural Earth, true geography).
        { id: 'coast-glow', type: 'line', source: 'countries', paint: { 'line-color': '#5cffc0', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 3, 6, 7], 'line-blur': 3, 'line-opacity': 0.22 } },
        { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': '#dcfff0', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 6, 1.4] } },
        // Stacked data layers around the window, in 3D.
        { id: 'holo-plates', type: 'fill-extrusion', source: 'holo', filter: ['==', ['get', 'kind'], 'plate'],
          paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.08 } },
        { id: 'holo-cells', type: 'fill-extrusion', source: 'holo', filter: ['==', ['get', 'kind'], 'cell'],
          paint: { 'fill-extrusion-color': ['get', 'c'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.7, 'fill-extrusion-vertical-gradient': true } },
        { id: 'win-fill', type: 'fill', source: 'window', paint: { 'fill-color': MINT, 'fill-opacity': 0.07 } },
        { id: 'win-glow', type: 'line', source: 'window', paint: { 'line-color': MINT, 'line-width': 8, 'line-blur': 7, 'line-opacity': 0.35 } },
        { id: 'win-line', type: 'line', source: 'window', paint: { 'line-color': '#e9fff4', 'line-width': 1.4, 'line-dasharray': [3, 2] } },
        { id: 'scan-glow', type: 'line', source: 'scan', paint: { 'line-color': MINT, 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.5 } },
        { id: 'scan-line', type: 'line', source: 'scan', paint: { 'line-color': '#f1fff8', 'line-width': 1.6 } },
        { id: 'centre', type: 'circle', source: 'centre', paint: { 'circle-radius': 4, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#f1fff8', 'circle-stroke-width': 1.5 } },
      ],
    };
    const map = new maplibregl.Map({
      container: el.current!, style, center: [s.lon, s.lat], zoom: 1.9, pitch: 28, maxPitch: 70, interactive: false, attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true }, // the bloom pass copies each frame
    });
    mapRef = map;
    if (import.meta.env.DEV) (window as unknown as { map: maplibregl.Map }).map = map; // console debugging
    // Bloom: a quarter-size copy of each rendered frame, thresholded and blurred, screened over the map.
    const bloom = document.createElement('canvas');
    bloom.className = 'bloom-canvas';
    bloom.setAttribute('aria-hidden', 'true');
    el.current!.append(bloom);
    const bctx = bloom.getContext('2d')!;
    const canFilter = 'filter' in bctx;
    map.on('render', () => {
      if (!canFilter) return;
      const src = map.getCanvas(), w = Math.max(1, src.width >> 2), h = Math.max(1, src.height >> 2);
      if (bloom.width !== w || bloom.height !== h) { bloom.width = w; bloom.height = h; }
      bctx.filter = 'brightness(0.6) contrast(3) saturate(1.4)'; // keeps only the bright parts (lines, data, lights)
      bctx.clearRect(0, 0, w, h);
      bctx.drawImage(src, 0, 0, w, h);
    });
    const effects = createFx(map, el.current!);

    const overlayLayer = () => { const a = useApp.getState().active; return a[a.length - 1]; };
    // 'style.load', not 'load': the scan line's per-frame setData means the map is never fully "loaded".
    map.once('style.load', () => {
      void drawOverlay(map, overlayLayer(), useApp.getState().date);
      (map.getSource('holo') as GeoJSONSource).setData(holoFeatures(useApp.getState().halo)); // halo may predate the style
    });

    // Resize handle on the window's north-east corner.
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.setAttribute('aria-hidden', 'true'); // keyboard and screen readers use + and - or the size slider
    const marker = new maplibregl.Marker({ element: handle, draggable: true }).setLngLat([s.lon + s.size / 2, s.lat + s.size / 2]).addTo(map);
    let resizing = false;
    marker.on('dragstart', () => { resizing = true; dragStart(); });
    marker.on('drag', () => {
      const ll = marker.getLngLat(), st = useApp.getState();
      setSize(2 * Math.max(Math.abs(ll.lat - st.lat), Math.abs(wrap(ll.lng - st.lon))), false);
    });
    marker.on('dragend', () => { resizing = false; dragEnd(); sizeDone(); });

    let overlayTimer = 0;
    const unsub = useApp.subscribe((st, prev) => {
      if (st.lat !== prev.lat || st.lon !== prev.lon || st.size !== prev.size) {
        (map.getSource('window') as GeoJSONSource | undefined)?.setData(windowOutline(st.lat, st.lon, st.size));
        (map.getSource('centre') as GeoJSONSource | undefined)?.setData(point(st.lat, st.lon));
        if (!resizing) marker.setLngLat([st.lon + st.size / 2, Math.min(MAX_MERC, st.lat + st.size / 2)]);
      }
      // Blocks are geographic, so they can stay put while the window glides; refresh once it comes to rest.
      if (st.halo !== prev.halo && !st.dragging) (map.getSource('holo') as GeoJSONSource | undefined)?.setData(holoFeatures(st.halo));
      if (st.date !== prev.date || st.active !== prev.active || st.layers !== prev.layers) {
        clearTimeout(overlayTimer);
        overlayTimer = window.setTimeout(() => void drawOverlay(map, overlayLayer(), st.date), 120);
      }
    });

    // ---- gestures: one finger moves the window, two fingers rotate and pinch ----
    const c = el.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let mode: 'none' | 'pending' | 'window' | 'globe' = 'none';
    let grace = 0;
    let offset = { lat: 0, lon: 0 };
    let start = { lat: 0, lon: 0 };
    let last = { x: 0, y: 0, d: 0 };
    let spin = false; // two-finger touch: the globe turns under the fingers, the window stays at the touch point

    // Per frame: move the scan line and keep the window in view with a gentle camera chase.
    let raf = 0, lastFrame = performance.now();
    const frame = (now: number) => {
      effects.frame(now);
      const st = useApp.getState();
      const west = st.lon - st.size / 2;
      (map.getSource('scan') as GeoJSONSource | undefined)?.setData(
        line(west + st.size * engine.loopPhase(), Math.max(-MAX_MERC, st.lat - st.size / 2), Math.min(MAX_MERC, st.lat + st.size / 2)));
      // Only a keyboard or button glide moves the camera. Touch never moves the globe with one finger.
      // Continuous eased follow (frame-rate independent), so the globe glides with the window instead of lurching.
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      if (mode === 'none' && isGliding() && !st.globeMode && !resizing) {
        const ctr = map.getCenter(), k = 1 - Math.exp(-dt * 3.5);
        map.jumpTo({ center: [ctr.lng + wrap(st.lon - ctr.lng) * k, ctr.lat + (st.lat - ctr.lat) * k] });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const local = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const measure = () => {
      const p = [...pts.values()];
      const x = p.reduce((a, q) => a + q.x, 0) / p.length, y = p.reduce((a, q) => a + q.y, 0) / p.length;
      return { x, y, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
    };
    const beginWindow = (p: { x: number; y: number }, touch: boolean) => {
      const st = useApp.getState();
      const ll = map.unproject([p.x, p.y]);
      start = { lat: st.lat, lon: st.lon };
      // Touch: the window centre sits exactly under the fingertip, so the contact point is the probe
      // and land/water crossings under the finger give haptics. Mouse keeps its grab offset.
      offset = touch ? { lat: 0, lon: 0 } : { lat: st.lat - ll.lat, lon: wrap(st.lon - ll.lng) };
      mode = 'window';
      dragStart();
      if (touch) setCenter(ll.lat, ll.lng, false);
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
        if (e.button === 2 || e.shiftKey) { mode = 'globe'; last = measure(); } else beginWindow(local(e), false);
        return;
      }
      if (pts.size === 1) {
        mode = 'pending';
        grace = window.setTimeout(() => { if (pts.size === 1 && mode === 'pending') beginWindow([...pts.values()][0], true); }, 80);
      } else {
        clearTimeout(grace);
        if (mode !== 'window') dragStart();
        mode = 'globe';
        spin = true;
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
        if (m.d && last.d) map.setZoom(Math.max(0.8, Math.min(8, map.getZoom() + Math.log2(m.d / last.d))));
        last = m;
        if (spin) {
          const ll = map.unproject([m.x, m.y]);
          setCenter(ll.lat, ll.lng, false);
        }
      }
    };
    const up = (e: PointerEvent) => {
      if (!pts.delete(e.pointerId)) return;
      if (mode === 'pending' && pts.size === 0) {
        clearTimeout(grace);
        const p = local(e);
        const ll = map.unproject([p.x, p.y]);
        setCenter(ll.lat, ll.lng, true); // a quick tap places the window
      }
      if (pts.size === 0) {
        if (mode === 'window' || spin) dragEnd();
        spin = false;
        mode = 'none';
      } else if (mode === 'globe') last = measure();
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      map.setZoom(Math.max(0.8, Math.min(8, map.getZoom() - e.deltaY / 400)));
    };
    const noMenu = (e: Event) => e.preventDefault();
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('contextmenu', noMenu);

    return () => {
      cancelAnimationFrame(raf);
      effects.dispose();
      unsub();
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('contextmenu', noMenu);
      map.remove();
      mapRef = null;
    };
  }, []);

  return (
    <div
      ref={el}
      className="globe"
      role="application"
      tabIndex={0}
      aria-roledescription="globe"
      aria-label="Globe with listening window. Arrow keys glide the window, plus and minus resize it, W says where you are, H says what you hear, M opens the menu. One finger moves the window under your fingertip; two fingers spin and zoom the globe while the window stays under your fingers."
    />
  );
}

/** Rotate the globe camera (G mode arrows). */
export function rotateGlobe(dLat: number, dLon: number) {
  if (!mapRef) return;
  const c = mapRef.getCenter();
  mapRef.easeTo({ center: [c.lng + dLon, Math.max(-80, Math.min(80, c.lat + dLat))], duration: 400 });
}

export function zoomBy(d: number) {
  if (!mapRef) return;
  mapRef.easeTo({ zoom: Math.max(0.8, Math.min(8, mapRef.getZoom() + d)), duration: 450 });
}
