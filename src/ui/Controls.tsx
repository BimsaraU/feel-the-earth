import { gsap } from 'gsap';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { KEYS, levelWord, norm, VOICES } from '../audio/mapping';
import { placeName, spokenDate, spokenNumber } from '../assist/answers';
import { say } from '../assist/speech';
import { runTutorial } from '../assist/tutorial';
import { askWhat, askWhere, geo, toggleVoice, glideStart, glideStop, moveBy, setDate, setSize, sizeDone, stepDate, toggleLayer, togglePlay, type Dir } from '../controller';
import type { LayerId } from '../data/types';
import { MAX_SIZE, MIN_SIZE, useApp } from '../state';
import { colour } from './colour';
import { zoomBy } from './Globe';

const DAY = 86400000;
const toDays = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);
const fromDays = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
const coord = (v: number, p: string, n: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? p : n}`;

type Recognition = { lang: string; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; start(): void; stop(): void };
const Rec = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

function PushToTalk() {
  const rec = useRef<Recognition | null>(null);
  const [on, setOn] = useState(false);
  if (!Rec) return null;
  const start = () => {
    const r = new Rec();
    r.lang = 'en-GB';
    r.onresult = (e) => {
      const text = e.results[0][0].transcript.toLowerCase();
      if (/where/.test(text)) askWhere();
      else if (/what|hear|listen/.test(text)) void askWhat();
      else void say('Sorry, ask "where am I" or "what am I hearing".');
    };
    r.start();
    rec.current = r;
    setOn(true);
  };
  const stop = () => { rec.current?.stop(); setOn(false); };
  return (
    <button type="button" className="tool" aria-pressed={on} onPointerDown={start} onPointerUp={stop} onPointerLeave={() => on && stop()}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); if (on) stop(); else start(); } }}>
      {on ? 'Listening…' : 'Hold to ask'}
    </button>
  );
}

/** Big place title, crossfades when the place under the window changes. */
function Brand() {
  const { lat, lon, layers, live, size } = useApp();
  const place = geo ? placeName(geo, lat, lon).replace(/^the /, '') : '';
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (title.current) gsap.fromTo(title.current, { opacity: 0, y: 8, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out' });
  }, [place]);
  return (
    <header className="brand">
      <p className="eyebrow">Feel the Earth {layers.some((l) => l.demo) && <strong className="demo">DEMO DATA, not NASA data</strong>}</p>
      <h1 ref={title}>{place}</h1>
      <p className="coords">{coord(lat, 'N', 'S')} · {coord(lon, 'E', 'W')} · window {Math.round(size * 10) / 10}°</p>
      <p className="caption" role="status" aria-live="polite">{live}</p>
    </header>
  );
}

function Toolbar({ onSettings }: { onSettings: () => void }) {
  const playing = useApp((s) => s.playing);
  const voice = useApp((s) => s.settings.voice);
  return (
    <nav className="tools glass" aria-label="Actions">
      <button type="button" className="tool" onClick={askWhere}>Where am I? <kbd>W</kbd></button>
      <button type="button" className="tool" onClick={() => void askWhat()}>What am I hearing? <kbd>H</kbd></button>
      <button type="button" className="tool" onClick={togglePlay} aria-pressed={playing}>{playing ? 'Pause' : 'Play'} <kbd>Space</kbd></button>
      <button type="button" className="tool" onClick={() => void runTutorial()}>Legend <kbd>T</kbd></button>
      <PushToTalk />
      <button type="button" className="tool" onClick={toggleVoice} aria-pressed={voice}>Voice guide {voice ? 'on' : 'off'} <kbd>V</kbd></button>
      <button type="button" className="tool" onClick={onSettings}>Settings</button>
    </nav>
  );
}

/** Live readout per active layer: window mean, and the 16 scan columns with the scan line lit. */
function Hearing() {
  const { active, layers, means } = useApp();
  const canvases = useRef(new Map<LayerId, HTMLCanvasElement>());
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const step = Math.floor(engine.loopPhase() * 16);
      for (const [id, cv] of canvases.current) {
        const ctx = cv.getContext('2d');
        const steps = engine.voices.get(id)?.current?.steps;
        if (!ctx || !steps) continue;
        const w = cv.width, h = cv.height, bw = w / 16;
        ctx.clearRect(0, 0, w, h);
        steps.forEach((s, i) => {
          const v = Number.isNaN(s.value) ? 0.04 : Math.max(0.04, s.value);
          const [r, g, b] = colour(Number.isNaN(s.value) ? 0 : s.value);
          ctx.fillStyle = i === step ? '#f1fff8' : `rgba(${r},${g},${b},${Number.isNaN(s.value) ? 0.25 : 0.75})`;
          ctx.fillRect(i * bw + 1, h - v * h, bw - 2, v * h);
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <section className="card hearing glass" aria-label="Now hearing">
      <h2>Now hearing</h2>
      {!active.length && <p className="muted">No layer on. Press 1 to 8.</p>}
      {active.map((id) => {
        const l = layers.find((x) => x.id === id);
        const v = VOICES.find((x) => x.layer === id)!;
        if (!l) return null;
        const m = means[id];
        const has = m !== undefined && !Number.isNaN(m);
        return (
          <div key={id} className="reading">
            <p className="label">{l.name} · {v.instrument}</p>
            <p className="value"><Counter value={has ? m : NaN} /> <span className="unit">{has ? l.unit : ''}</span>
              <span className="level">{has ? levelWord(norm(m, l)) : 'no data'}</span></p>
            <canvas aria-hidden="true" width={256} height={36} ref={(c) => { if (c) canvases.current.set(id, c); else canvases.current.delete(id); }} />
          </div>
        );
      })}
    </section>
  );
}

/** Number that glides to its new value. */
function Counter({ value }: { value: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef({ v: value });
  useEffect(() => {
    if (!el.current) return;
    if (Number.isNaN(value)) { el.current.textContent = '–'; shown.current.v = NaN; return; }
    if (Number.isNaN(shown.current.v)) shown.current.v = value;
    gsap.to(shown.current, { v: value, duration: 0.8, ease: 'power2.out', onUpdate: () => { if (el.current) el.current.textContent = spokenNumber(shown.current.v).replace('minus ', '−'); } });
  }, [value]);
  return <span ref={el} />;
}

function Layers() {
  const { layers, active } = useApp();
  return (
    <section className="card layers glass" aria-label="Layers">
      <h2>Layers <span className="muted">keys 1–8 · up to 4</span></h2>
      <div className="chips">
        {VOICES.map((v) => {
          const l = layers.find((x) => x.id === v.layer);
          if (!l) return null;
          const on = active.includes(v.layer);
          return (
            <button key={v.layer} type="button" className="chip" aria-pressed={on} onClick={() => toggleLayer(v.layer)}>
              <kbd>{v.key}</kbd>
              <span>{l.name.replace(/, PM2.5$/, '')}<small>{v.instrument} · {on ? 'on' : 'off'}</small></span>
            </button>
          );
        })}
      </div>
      <Legend />
    </section>
  );
}

function Legend() {
  const { layers, active } = useApp();
  const l = layers.find((x) => x.id === active[active.length - 1]);
  if (!l) return null;
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${colour(t).join(',')}) ${t * 100}%`).join(',');
  return (
    <div className="legend" aria-label={`Colour scale for ${l.name}, ${l.min} to ${l.max} ${l.unitSpoken}`}>
      <span>{l.min}</span>
      <span className="ramp" style={{ background: `linear-gradient(to right, ${stops})` }} />
      <span>{l.max} {l.unit}</span>
      <span className="hatch" aria-hidden="true" /><span>no data</span>
    </div>
  );
}

/** Press-and-hold glide buttons; keyboard activation does one step. */
function DirButton({ dir, label, area }: { dir: Dir; label: string; area: string }) {
  return (
    <button type="button" className="dir" style={{ gridArea: area }} aria-label={`Move ${label}`}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); glideStart(dir); }}
      onPointerUp={() => glideStop(dir)} onPointerCancel={() => glideStop(dir)}
      onClick={(e) => { if (e.detail === 0) { glideStart(dir); glideStop(dir); } }}>
      {label[0].toUpperCase()}
    </button>
  );
}

function Navigate() {
  const { size, settings, setSettings } = useApp();
  const [open, setOpen] = useState(() => !matchMedia('(max-width: 860px)').matches);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (body.current) gsap.to(body.current, { height: open ? 'auto' : 0, opacity: open ? 1 : 0, duration: 0.45, ease: 'power3.inOut' });
  }, [open]);
  return (
    <section className="card nav glass" aria-label="Navigate">
      <h2><button type="button" className="disclose" aria-expanded={open} onClick={() => setOpen(!open)}>Navigate</button></h2>
      <div ref={body} className="collapse" inert={!open}>
        <label className="field">Window size <output>{Math.round(size * 10) / 10}°</output>
          <input type="range" min={MIN_SIZE} max={MAX_SIZE} step={0.5} value={size} aria-valuetext={`${Math.round(size)} degrees`}
            onChange={(e) => setSize(+e.target.value, false)} onPointerUp={sizeDone} onKeyUp={sizeDone} />
        </label>
        <label className="field">Navigation speed <output>{settings.navSpeed.toFixed(2)} widths/s</output>
          <input type="range" min={0.1} max={2} step={0.05} value={settings.navSpeed} aria-valuetext={`${settings.navSpeed.toFixed(2)} window widths per second`}
            onChange={(e) => setSettings({ navSpeed: +e.target.value })} />
        </label>
        <div className="pad">
          <DirButton dir="n" label="north" area="n" />
          <DirButton dir="w" label="west" area="w" />
          <DirButton dir="e" label="east" area="e" />
          <DirButton dir="s" label="south" area="s" />
          <button type="button" style={{ gridArea: 'zi' }} onClick={() => zoomBy(1)} aria-label="Zoom in">＋</button>
          <button type="button" style={{ gridArea: 'zo' }} onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
        </div>
        <TouchPad />
      </div>
    </section>
  );
}

/** Direct-touch surface: relative drag like a trackpad, for screen-reader users whose gestures are intercepted. */
function TouchPad() {
  const last = useRef<{ x: number; y: number } | null>(null);
  return (
    <div className="touchpad" role="application" tabIndex={-1}
      aria-label="Touch pad. Drag to move the listening window. With VoiceOver, use direct touch."
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); last.current = { x: e.clientX, y: e.clientY }; }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const k = useApp.getState().size / 120; // 120 px drag = one window width
        const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
        if (Math.hypot(dx, dy) < 8) return;
        last.current = { x: e.clientX, y: e.clientY };
        moveBy(-dy * k, dx * k);
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}>
      touch pad
    </div>
  );
}

function TimeBar() {
  const { date, layers } = useApp();
  const [lo, hi] = layers[0]?.timeRange ?? [date, date];
  return (
    <section className="timebar glass" aria-label="Date">
      <button type="button" onClick={() => stepDate(0, -1)} aria-label="Back one month">«</button>
      <button type="button" onClick={() => stepDate(-1)} aria-label="Back one day">‹</button>
      <div className="when">
        <span className="date">{spokenDate(date)}</span>
        <label className="slider"><span className="sr-only">Date</span>
          <input type="range" min={toDays(lo)} max={toDays(hi)} value={toDays(date)} aria-valuetext={spokenDate(date)}
            onChange={(e) => setDate(fromDays(Number(e.target.value)))} />
        </label>
      </div>
      <button type="button" onClick={() => stepDate(1)} aria-label="Forward one day">›</button>
      <button type="button" onClick={() => stepDate(0, 1)} aria-label="Forward one month">»</button>
    </section>
  );
}

function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings: s, setSettings, layers } = useApp();
  const el = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!el.current) return;
    gsap.to(el.current, { xPercent: open ? 0 : 110, autoAlpha: open ? 1 : 0, duration: 0.5, ease: 'power3.inOut' });
    if (open) el.current.querySelector<HTMLElement>('button')?.focus();
  }, [open]);
  return (
    <aside ref={el} className="drawer glass" aria-label="Settings" style={{ visibility: 'hidden' }}>
      <h2>Settings <button type="button" className="tool" onClick={onClose}>Close</button></h2>
      <label className="field">Master volume <input type="range" min={0} max={1} step={0.05} value={s.masterVolume} onChange={(e) => setSettings({ masterVolume: +e.target.value })} /></label>
      {VOICES.map((v) => (
        <label key={v.layer} className="field">{layers.find((l) => l.id === v.layer)?.name}
          <input type="range" min={-18} max={6} step={1} value={s.layerDb[v.layer] ?? 0} aria-valuetext={`${s.layerDb[v.layer] ?? 0} decibels`}
            onChange={(e) => setSettings({ layerDb: { ...s.layerDb, [v.layer]: +e.target.value } })} />
        </label>
      ))}
      <label className="field">Speech rate <input type="range" min={0.6} max={1.8} step={0.1} value={s.speechRate} onChange={(e) => setSettings({ speechRate: +e.target.value })} /></label>
      <label className="check"><input type="checkbox" checked={s.voice} onChange={(e) => setSettings({ voice: e.target.checked })} /> Voice guide: spoken help (off if your screen reader speaks)</label>
      <label className="check"><input type="checkbox" checked={s.haptics} onChange={(e) => setSettings({ haptics: e.target.checked })} /> Haptics</label>
      <label className="check"><input type="checkbox" checked={s.hapticAccents} onChange={(e) => setSettings({ hapticAccents: e.target.checked })} /> Pulse on loop accents</label>
      <label className="field">Tempo {s.tempo} bpm <input type="range" min={50} max={110} step={1} value={s.tempo} onChange={(e) => setSettings({ tempo: +e.target.value })} /></label>
      <label className="field">Key
        <select value={s.keyRoot} onChange={(e) => setSettings({ keyRoot: +e.target.value })}>
          {KEYS.map((k, i) => <option key={k} value={i}>{k}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={s.mono} onChange={(e) => setSettings({ mono: e.target.checked })} /> Mono mix</label>
      <label className="check"><input type="checkbox" checked={s.highContrast} onChange={(e) => setSettings({ highContrast: e.target.checked })} /> High contrast</label>
    </aside>
  );
}

export function Controls() {
  const [settings, setSettingsOpen] = useState(false);
  const hud = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (hud.current) gsap.from(hud.current.querySelectorAll('.brand, .tools, .card, .timebar'), { opacity: 0, y: 18, filter: 'blur(8px)', duration: 0.9, stagger: 0.07, ease: 'power3.out' });
  }, []);
  return (
    <div className="hud" ref={hud}>
      <Brand />
      <Toolbar onSettings={() => setSettingsOpen(!settings)} />
      <div className="sheet">
        <Navigate />
        <div className="side">
          <Layers />
          <Hearing />
        </div>
        <TimeBar />
      </div>
      <SettingsDrawer open={settings} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
