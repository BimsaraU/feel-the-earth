import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, ImageSource, StyleSpecification } from 'maplibre-gl';
import type { Feature, LineString, Point, Polygon } from 'geojson';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { norm } from '../audio/mapping';
import { dragEnd, dragStart, isGliding, setCenter, setSize, sizeDone } from '../controller';
import { source } from '../data';
import type { BBox, LayerId, LayerInfo } from '../data/types';
import { useApp } from '../state';
import { colour } from './colour';
import { createFx } from './fxLayer';

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
const MINT = '#9ef2c9';
const MIN_ZOOM = 0, MAX_ZOOM = 8;
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
/** Zoom at which the whole planet fits the container with space around it. */
const fitZoom = (el: HTMLElement, lat: number) =>
  Math.log2((0.74 * Math.min(el.clientWidth, el.clientHeight) * Math.PI * Math.cos((lat * Math.PI) / 180)) / 512);

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

/** Layers whose values vary smoothly get contour lines; point-like layers (lightning, lights) would only get noise. */
const CONTOURED = new Set<LayerId>(['sst', 'airtemp', 'co2', 'precip', 'ndvi', 'aerosol']);
export const CONTOUR_LEVELS = 16;
/** Above this zoom a second, screen-resolution patch of the heatmap is drawn over the visible area. */
const DETAIL_ZOOM = 2.5;

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMerc = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;
/** Catmull-Rom weights for the four samples around fraction f. */
const cr = (f: number) => [((-f + 2) * f - 1) * f / 2, ((3 * f - 5) * f * f + 2) / 2, ((-3 * f + 4) * f + 1) * f / 2, (f - 1) * f * f / 2];

/**
 * Paint one layer over a lat/lon box as a W x H Web Mercator image, as sharply as the data allows:
 * the data is read at its own resolution and bicubically (Catmull-Rom) interpolated to every pixel; relief shading
 * from the local gradient (light from the north-west) and a one-pixel contour line at every 1/16 of the layer range
 * turn fronts, ridges and basins into crisp shapes. Edges of the data fade over half a cell; no data is transparent.
 */
async function paint(layer: LayerInfo, date: string, box: BBox, W: number, H: number): Promise<Blob | null> {
  const n = Math.max(8, Math.min(720, Math.ceil(Math.max(box.east - box.west, box.north - box.south) / layer.resolutionDeg)));
  const g = (await source.getWindow(layer.id, box, date, n)).grid;
  const at = (r: number, c: number) => g[Math.max(0, Math.min(n - 1, r)) * n + Math.max(0, Math.min(n - 1, c))];
  const c0 = new Int32Array(W), fx = new Float32Array(W), wx = new Float32Array(W * 4);
  for (let x = 0; x < W; x++) {
    const fc = ((x + 0.5) / W) * n - 0.5;
    c0[x] = Math.floor(fc); fx[x] = fc - c0[x]; wx.set(cr(fx[x]), x * 4);
  }
  // 1. Normalised value and coverage per pixel.
  const T = new Float32Array(W * H), A = new Uint8Array(W * H);
  const yN = mercY(box.north), yS = mercY(box.south);
  for (let y = 0; y < H; y++) {
    const lat = invMerc(yN + ((yS - yN) * (y + 0.5)) / H);
    const fr = ((box.north - lat) / (box.north - box.south)) * n - 0.5, r0 = Math.floor(fr), fy = fr - r0, wy = cr(fy);
    for (let x = 0; x < W; x++) {
      const c = c0[x];
      let v = 0, ok = true;
      for (let j = 0; j < 4 && ok; j++) for (let i = 0; i < 4; i++) {
        const s = at(r0 - 1 + j, c - 1 + i);
        if (Number.isNaN(s)) { ok = false; break; }
        v += s * wy[j] * wx[x * 4 + i];
      }
      let a = 1;
      if (!ok) { // next to missing data: still bicubic, missing samples stand in as the local mean; fade out over the last cell
        let sum = 0, k = 0, w = 0;
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const s = at(r0 + j, c + i);
          if (!Number.isNaN(s)) { sum += s; k++; w += (j ? fy : 1 - fy) * (i ? fx[x] : 1 - fx[x]); }
        }
        v = k ? 0 : NaN;
        for (let j = 0; j < 4 && k; j++) for (let i = 0; i < 4; i++) {
          const s = at(r0 - 1 + j, c - 1 + i);
          v += (Number.isNaN(s) ? sum / k : s) * wy[j] * wx[x * 4 + i];
        }
        a = Math.max(0, Math.min(1, (w - 0.15) / 0.7));
      }
      T[y * W + x] = norm(v, layer);
      A[y * W + x] = Number.isNaN(v) ? 0 : 255 * a;
    }
  }
  // 2. Colour, relief shading, contour lines.
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H), px = img.data;
  const lines = CONTOURED.has(layer.id);
  const k = 3.5 / ((box.east - box.west) / W); // shading strength per unit of (range per degree)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = T[i];
    if (!A[i]) continue;
    const e = x < W - 1 && A[i + 1] ? T[i + 1] : t, s = y < H - 1 && A[i + W] ? T[i + W] : t;
    const shade = Math.max(0.7, Math.min(1.3, 1 + k * (e - t + s - t)));
    const lv = Math.floor(t * CONTOUR_LEVELS);
    const edge = lines && (Math.floor(e * CONTOUR_LEVELS) !== lv || Math.floor(s * CONTOUR_LEVELS) !== lv);
    const c = colour(t, layer.id);
    for (let q = 0; q < 3; q++) px[i * 4 + q] = edge ? c[q] + (255 - c[q]) * 0.5 : Math.min(255, c[q] * shade);
    px[i * 4 + 3] = A[i];
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((res) => canvas.toBlob(res));
}

const urls: Record<string, string> = {};
function show(map: maplibregl.Map, id: string, blob: Blob | null, quad: ReturnType<typeof coords>) {
  const src = map.getSource(id) as ImageSource | undefined;
  if (!src) return;
  const old = urls[id];
  urls[id] = blob ? URL.createObjectURL(blob) : '';
  src.updateImage({ url: urls[id] || BLANK, coordinates: quad });
  if (old) setTimeout(() => URL.revokeObjectURL(old), 5000);
}

const topLayer = () => { const st = useApp.getState(); return st.layers.find((l) => l.id === st.active[st.active.length - 1]); };

/** The whole world, four pixels per data cell: what you see with the planet in view. */
let overlaySeq = 0;
async function drawOverlay(map: maplibregl.Map) {
  const seq = ++overlaySeq, layer = topLayer(), date = useApp.getState().date;
  for (const h of HALVES) {
    const N = layer ? Math.min(1440, Math.round(720 / layer.resolutionDeg)) : 0;
    const blob = layer ? await paint(layer, date, { west: h.west, east: h.east, south: -MAX_MERC, north: MAX_MERC }, N, N) : null;
    if (seq !== overlaySeq) return;
    show(map, h.id, blob, coords(h.west, h.east));
  }
  void drawDetail(map);
}

/**
 * Zoomed in: the visible area again at screen resolution (one image pixel per screen pixel), so gradients stay
 * smooth and contour lines stay hair-thin at any zoom. Redrawn when the view settles.
 * ponytail: the patch stops at the antimeridian (the world image shows beyond it); split it in two if that matters.
 */
let detailSeq = 0;
async function drawDetail(map: maplibregl.Map) {
  const seq = ++detailSeq, layer = topLayer(), z = map.getZoom(), el = map.getContainer();
  const blank = coords(-1, 1);
  if (!layer || z < DETAIL_ZOOM) { show(map, 'ovD', null, blank); return; }
  const c = map.getCenter(), lng = ((c.lng + 540) % 360) - 180, pad = 1.5, k = pad / (512 * 2 ** z);
  const halfLon = 180 * el.clientWidth * k, halfY = Math.PI * el.clientHeight * k;
  const box = { west: Math.max(-180, lng - halfLon), east: Math.min(180, lng + halfLon),
    north: Math.min(MAX_MERC, invMerc(mercY(c.lat) + halfY)), south: Math.max(-MAX_MERC, invMerc(mercY(c.lat) - halfY)) };
  const W = Math.min(2048, Math.round((el.clientWidth * pad * (box.east - box.west)) / (2 * halfLon)));
  const H = Math.min(2048, Math.round((el.clientHeight * pad * (mercY(box.north) - mercY(box.south))) / (2 * halfY)));
  if (W < 8 || H < 8) { show(map, 'ovD', null, blank); return; }
  const blob = await paint(layer, useApp.getState().date, box, W, H);
  if (seq !== detailSeq) return;
  show(map, 'ovD', blob, [[box.west, box.north], [box.east, box.north], [box.east, box.south], [box.west, box.south]]);
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
        'sky-color': '#05060f', 'horizon-color': '#27356e', 'fog-color': '#0a0d1e',
        'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 4, 0.4, 6, 0],
      },
      sources: {
        earth: { type: 'raster', tiles: [`${BASE}tiles/{z}/{x}/{y}.jpg`], tileSize: 256, maxzoom: 5 },
        // Sharper Blue Marble from NASA GIBS when online and zoomed in; the bundled tiles stay underneath for offline use.
        earthHi: { type: 'raster', tiles: [`${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`], tileSize: 256, minzoom: 5, maxzoom: 8 },
        countries: { type: 'geojson', data: `${BASE}data/geo/countries.geojson` },
        window: { type: 'geojson', data: windowOutline(s.lat, s.lon, s.size) },
        scan: { type: 'geojson', data: line(s.lon, s.lat - s.size / 2, s.lat + s.size / 2) },
        centre: { type: 'geojson', data: point(s.lat, s.lon) },
        ...Object.fromEntries(HALVES.map((h) => [h.id, { type: 'image', url: BLANK, coordinates: coords(h.west, h.east) }])),
        ovD: { type: 'image', url: BLANK, coordinates: coords(-1, 1) },
      },
      layers: [
        { id: 'space', type: 'background', paint: { 'background-color': '#05070f' } },
        // NASA Blue Marble, slightly muted so the heatmap and lines read on top.
        { id: 'earth', type: 'raster', source: 'earth', paint: { 'raster-saturation': -0.25, 'raster-contrast': 0.1, 'raster-brightness-max': 0.78, 'raster-fade-duration': 0 } },
        { id: 'earthHi', type: 'raster', source: 'earthHi', minzoom: 5, paint: { 'raster-saturation': -0.25, 'raster-contrast': 0.1, 'raster-brightness-max': 0.78 } },
        ...[...HALVES, { id: 'ovD' }].map((h) => ({ id: h.id, type: 'raster' as const, source: h.id, paint: { 'raster-opacity': h.id === 'ovD' ? 1 : 0.9, 'raster-fade-duration': 0, 'raster-resampling': 'linear' as const } })),
        // Sharp, glowing coastlines and borders over the imagery (Natural Earth, true geography).
        { id: 'coast-glow', type: 'line', source: 'countries', paint: { 'line-color': '#8fb4ff', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2, 6, 5], 'line-blur': 2, 'line-opacity': 0.14 } },
        { id: 'borders', type: 'line', source: 'countries', paint: { 'line-color': '#f2f6ff', 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1.3] } },
        { id: 'win-fill', type: 'fill', source: 'window', paint: { 'fill-color': MINT, 'fill-opacity': 0.05 } },
        { id: 'win-glow', type: 'line', source: 'window', paint: { 'line-color': MINT, 'line-width': 8, 'line-blur': 7, 'line-opacity': 0.35 } },
        { id: 'win-line', type: 'line', source: 'window', paint: { 'line-color': '#e9fff4', 'line-width': 1.4, 'line-dasharray': [3, 2] } },
        { id: 'scan-glow', type: 'line', source: 'scan', paint: { 'line-color': MINT, 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.5 } },
        { id: 'scan-line', type: 'line', source: 'scan', paint: { 'line-color': '#f1fff8', 'line-width': 1.6 } },
        { id: 'centre', type: 'circle', source: 'centre', paint: { 'circle-radius': 4, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#f1fff8', 'circle-stroke-width': 1.5 } },
      ],
    };
    // Navigation as in NASA Eyes on the Earth: drag spins the globe with inertia, wheel and pinch zoom smoothly,
    // double-click zooms in, north stays up. The listening window is locked to the centre of the view, so turning the
    // globe is how you move through the data.
    const map = new maplibregl.Map({
      container: el.current!, style, center: [s.lon, s.lat], zoom: fitZoom(el.current!, s.lat), minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM,
      attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, keyboard: false, boxZoom: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef = map;
    const effects = createFx(map, el.current!);

    // 'style.load', not 'load': the scan line's per-frame setData means the map is never fully "loaded".
    map.once('style.load', () => void drawOverlay(map));
    let detailTimer = 0;
    map.on('moveend', () => { clearTimeout(detailTimer); detailTimer = window.setTimeout(() => void drawDetail(map), 150); });

    // ---- the window follows the view centre ----
    // Camera moves we cause ourselves (following a keyboard glide) are "syncing" and do not move the window back.
    let moving = false, syncing = false;
    map.on('movestart', () => { if (syncing || isGliding()) return; moving = true; dragStart(); });
    map.on('move', () => {
      if (!moving) return;
      const c = map.getCenter();
      setCenter(c.lat, c.lng, false);
    });
    map.on('moveend', () => {
      if (!moving) return;
      moving = false;
      const c = map.getCenter();
      setCenter(c.lat, c.lng, true); // commit: borders crossed, "Now over"
      dragEnd();
    });
    // A click (no drag) glides the view, and the window with it, to that place.
    map.on('click', (e) => map.easeTo({ center: e.lngLat, duration: 900, easing: (t) => 1 - (1 - t) ** 3 }));

    // Resize handle on the window's north-east corner.
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.setAttribute('aria-hidden', 'true'); // keyboard and screen readers use + and - or the size slider
    const marker = new maplibregl.Marker({ element: handle, draggable: true }).setLngLat([s.lon + s.size / 2, s.lat + s.size / 2]).addTo(map);
    let resizing = false;
    const wrap = (d: number) => ((d + 540) % 360) - 180;
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
        // Moved from elsewhere (keys, tour, pole clamp): bring the view along unless the user is turning the globe.
        if (!moving) {
          const c = map.getCenter();
          if (Math.abs(c.lat - st.lat) > 1e-7 || Math.abs(c.lng - st.lon) > 1e-7) {
            syncing = true;
            // On the globe, MapLibre's zoom is relative to the centre latitude: compensate so the planet keeps its size.
            const z = map.getZoom(), rad = Math.PI / 180;
            map.jumpTo({ center: [st.lon, st.lat], zoom: z < 3 ? Math.max(MIN_ZOOM, z + Math.log2(Math.cos(st.lat * rad) / Math.cos(c.lat * rad))) : z });
            syncing = false;
          }
        }
      }
      if (st.date !== prev.date || st.active !== prev.active || st.layers !== prev.layers) {
        clearTimeout(overlayTimer);
        overlayTimer = window.setTimeout(() => void drawOverlay(map), 120);
      }
    });

    // Per frame: move the scan line.
    let raf = 0;
    const frame = (now: number) => {
      effects.frame(now);
      const st = useApp.getState();
      const west = st.lon - st.size / 2;
      (map.getSource('scan') as GeoJSONSource | undefined)?.setData(
        line(west + st.size * engine.loopPhase(), Math.max(-MAX_MERC, st.lat - st.size / 2), Math.min(MAX_MERC, st.lat + st.size / 2)));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      effects.dispose();
      unsub();
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
      aria-label="Globe. The listening window is the centre of the view. Drag to turn the globe, scroll or pinch to zoom, click a place to glide there. Arrow keys glide, plus and minus resize the window, W says where you are, H says what you hear, B finds the nearest peak and valley, A opens the audio assistant, M opens the menu."
    />
  );
}

/** Rotate the globe camera (G mode arrows). The window follows the view centre. */
export function rotateGlobe(dLat: number, dLon: number) {
  if (!mapRef) return;
  const c = mapRef.getCenter();
  mapRef.easeTo({ center: [c.lng + dLon, Math.max(-80, Math.min(80, c.lat + dLat))], duration: 400 });
}

export function zoomBy(d: number) {
  if (!mapRef) return;
  mapRef.easeTo({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, mapRef.getZoom() + d)), duration: 450 });
}
