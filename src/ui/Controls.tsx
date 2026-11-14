import { gsap } from 'gsap';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { engine } from '../audio/engine';
import { KEYS, levelWord, norm, VOICES } from '../audio/mapping';
import { placeName, spokenDate, spokenNumber } from '../assist/answers';
import { say } from '../assist/speech';
import { runTutorial, skipNarration, stopTutorial } from '../assist/tutorial';
import {
  askWhat, askWhere, dateBounds, geo, glideStart, glideStop, moveBy, setDate, setSize, setTravelling, sizeDone, stepDate,
  toggleLayer, togglePlay, toggleVoice, type Dir,
} from '../controller';
import type { LayerId } from '../data/types';
import { haptics } from '../haptics/haptics';
import { MAX_SIZE, MIN_SIZE, useApp } from '../state';
import { colour, rampCss } from './colour';
import { zoomBy } from './Globe';
import { Wheel } from './Wheel';

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
    <button type="button" aria-pressed={on} onPointerDown={start} onPointerUp={stop} onPointerLeave={() => on && stop()}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); if (on) stop(); else start(); } }}>
      {on ? 'Listening…' : 'Hold to ask'}
    </button>
  );
}

/** Place title over the map, crossfades when the place under the window changes. */
function Brand() {
  const { lat, lon, layers, live, size, date, travelling } = useApp();
  const place = geo ? placeName(geo, lat, lon).replace(/^the /, '') : '';
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (title.current) gsap.fromTo(title.current, { opacity: 0, y: 8, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out' });
  }, [place]);
  return (
    <header className="brand">
      <p className="eyebrow">Feel the Earth · NASA EIC data {layers.some((l) => l.demo) && <strong className="demo">DEMO DATA, not NASA data</strong>}</p>
      <h1 ref={title}>{place}</h1>
      <p className="coords">{coord(lat, 'N', 'S')} · {coord(lon, 'E', 'W')} · window {Math.round(size * 10) / 10}°</p>
      <p className="when-line">{spokenDate(date)}{travelling ? ' · time travel' : ''}</p>
      <p className="caption" role="status" aria-live="polite">{live}</p>
    </header>
  );
}

/** Listening tour card: where you are in the tour and what is being said. The caption carries the live text. */
function TourCard() {
  const tour = useApp((s) => s.tour);
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (card.current) gsap.fromTo(card.current, { opacity: 0, y: 14, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out' });
  }, [tour?.i]);
  if (!tour) return null;
  return (
    <div ref={card} className="tour glass" role="region" aria-label="Listening tour">
      <div className="tour-progress" aria-hidden="true"><span style={{ width: `${((tour.i + 1) / tour.n) * 100}%` }} /></div>
      <p className="eyebrow">Listening tour · {tour.i + 1} of {tour.n}</p>
      <h2 className="tour-title">{tour.title}</h2>
      <p className="tour-text">{tour.text}</p>
      <div className="buttons">
        <button type="button" onClick={skipNarration}>Skip</button>
        <button type="button" onClick={stopTutorial}>End tour <kbd>Esc</kbd></button>
      </div>
    </div>
  );
}

/** One collapsible sidebar item. */
function Item({ title, children, open, onToggle }: { title: string; children: ReactNode; open: boolean; onToggle: () => void }) {
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (body.current) gsap.to(body.current, { height: open ? 'auto' : 0, opacity: open ? 1 : 0, duration: 0.4, ease: 'power3.inOut' });
  }, [open]);
  return (
    <section className="item">
      <h2><button type="button" className="item-head" aria-expanded={open} onClick={onToggle}>{title}<span className="sign" aria-hidden="true">{open ? '−' : '+'}</span></button></h2>
      <div ref={body} className="collapse" inert={!open} style={{ height: 0, opacity: 0 }}>{children}</div>
    </section>
  );
}

function Listen() {
  const playing = useApp((s) => s.playing);
  const voice = useApp((s) => s.settings.voice);
  return (
    <div className="buttons">
      <button type="button" onClick={askWhere}>Where am I? <kbd>W</kbd></button>
      <button type="button" onClick={() => void askWhat()}>What am I hearing? <kbd>H</kbd></button>
      <button type="button" onClick={togglePlay} aria-pressed={playing}>{playing ? 'Pause' : 'Play'} <kbd>Space</kbd></button>
      <button type="button" onClick={() => void runTutorial()}>Listening tour <kbd>T</kbd></button>
      <button type="button" onClick={toggleVoice} aria-pressed={voice}>Voice guide {voice ? 'on' : 'off'} <kbd>V</kbd></button>
      <PushToTalk />
    </div>
  );
}

/** Layer toggles with a live readout: window mean and the 16 scan columns, scan position lit. */
function Layers() {
  const { layers, active, means } = useApp();
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
          const [r, g, b] = colour(Number.isNaN(s.value) ? 0 : s.value, id);
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
    <div className="layer-list">
      {VOICES.map((v) => {
        const l = layers.find((x) => x.id === v.layer);
        if (!l) return null;
        const on = active.includes(v.layer);
        const m = means[v.layer];
        const has = on && m !== undefined && !Number.isNaN(m);
        return (
          <div key={v.layer} className={`layer ${on ? 'on' : ''}`}>
            <button type="button" className="chip" aria-pressed={on} onClick={() => toggleLayer(v.layer)}>
              <kbd>{v.key}</kbd>
              <span>{l.name}<small>{v.instrument} · {spokenDate(l.timeRange[0]).replace(/^\d+ /, '')} to {spokenDate(l.timeRange[1]).replace(/^\d+ /, '')}</small></span>
            </button>
            {on && (
              <div className="reading">
                <p className="value"><Counter value={has ? m! : NaN} /> <span className="unit">{has ? l.unit : ''}</span>
                  <span className="level">{has ? levelWord(norm(m!, l)) : 'no data at this date'}</span></p>
                <canvas aria-hidden="true" width={256} height={30} ref={(c) => { if (c) canvases.current.set(v.layer, c); else canvases.current.delete(v.layer); }} />
              </div>
            )}
          </div>
        );
      })}
      <Legend />
    </div>
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

function Legend() {
  const { layers, active } = useApp();
  const l = layers.find((x) => x.id === active[active.length - 1]);
  if (!l) return null;
  return (
    <div className="legend" aria-label={`Colour scale for ${l.name}, ${l.min} to ${l.max} ${l.unitSpoken}`}>
      <span>{l.min}</span>
      <span className="ramp" style={{ background: rampCss(l.id) }} />
      <span>{l.max} {l.unit}</span>
      <span className="hatch" aria-hidden="true" /><span>no data</span>
    </div>
  );
}

function Time() {
  const { date, layers, travelling } = useApp();
  const [lo, hi] = dateBounds(layers);
  return (
    <div>
      <Wheel label="Date" value={toDays(date)} min={toDays(lo)} max={toDays(hi)} step={1} pxPerStep={5}
        format={(d) => spokenDate(fromDays(d))} onChange={(d) => setDate(fromDays(d), 'quiet')} />
      <div className="buttons row">
        <button type="button" onClick={() => stepDate(0, -12)} aria-label="Back one year">−1 y</button>
        <button type="button" onClick={() => stepDate(0, -1)} aria-label="Back one month">−1 m</button>
        <button type="button" onClick={() => stepDate(-1)} aria-label="Back one day">−1 d</button>
        <button type="button" onClick={() => stepDate(1)} aria-label="Forward one day">+1 d</button>
        <button type="button" onClick={() => stepDate(0, 1)} aria-label="Forward one month">+1 m</button>
        <button type="button" onClick={() => stepDate(0, 12)} aria-label="Forward one year">+1 y</button>
      </div>
      <button type="button" className="wide" aria-pressed={travelling} onClick={() => setTravelling(!travelling)}>
        Time travel {travelling ? 'on' : 'off'} <kbd>Y</kbd>
      </button>
      <p className="muted small">Time travel moves the date forward one step per bar: a day for sea temperature, ten days for lightning, a year for night lights.</p>
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

function WindowControls() {
  const { size, settings, setSettings } = useApp();
  return (
    <div>
      <Wheel label="Window size" value={size} min={MIN_SIZE} max={MAX_SIZE} step={0.5} format={(v) => `${v} degrees`}
        onChange={(v) => setSize(v, false)} onCommit={sizeDone} />
      <Wheel label="Navigation speed" value={settings.navSpeed} min={0.1} max={2} step={0.05}
        format={(v) => `${v.toFixed(2)} window widths per second`} onChange={(v) => setSettings({ navSpeed: Math.round(v * 100) / 100 })} />
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

function Settings() {
  const { settings: s, setSettings, layers } = useApp();
  return (
    <div>
      <Wheel label="Master volume" value={s.masterVolume} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)} percent`}
        onChange={(v) => setSettings({ masterVolume: v })} />
      {VOICES.map((v) => (
        <Wheel key={v.layer} label={`${layers.find((l) => l.id === v.layer)?.name ?? v.layer} volume`} value={s.layerDb[v.layer] ?? 0}
          min={-18} max={6} step={1} format={(x) => `${x > 0 ? '+' : ''}${x} dB`}
          onChange={(x) => setSettings({ layerDb: { ...useApp.getState().settings.layerDb, [v.layer]: x } })} />
      ))}
      <Wheel label="Speech rate" value={s.speechRate} min={0.6} max={1.8} step={0.1} format={(v) => `${v.toFixed(1)} times`}
        onChange={(v) => setSettings({ speechRate: Math.round(v * 10) / 10 })} />
      <label className="check"><input type="checkbox" checked={s.haptics} onChange={(e) => setSettings({ haptics: e.target.checked })} /> Haptics</label>
      <button type="button" className="wide" onClick={() => { haptics.pulse('test'); void say(`Haptics use ${haptics.describe()}.`); }}>Test haptics</button>
      <label className="check"><input type="checkbox" checked={s.hapticAccents} onChange={(e) => setSettings({ hapticAccents: e.target.checked })} /> Pulse on loop accents</label>
      <label className="field">Key
        <select value={s.keyRoot} onChange={(e) => setSettings({ keyRoot: +e.target.value })}>
          {KEYS.map((k, i) => <option key={k} value={i}>{k}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={s.mono} onChange={(e) => setSettings({ mono: e.target.checked })} /> Mono mix</label>
      <label className="check"><input type="checkbox" checked={s.spatial} onChange={(e) => setSettings({ spatial: e.target.checked })} /> Surround field (headphones)</label>
      <label className="check"><input type="checkbox" checked={s.highContrast} onChange={(e) => setSettings({ highContrast: e.target.checked })} /> High contrast</label>
    </div>
  );
}

function About() {
  const layers = useApp((s) => s.layers);
  return (
    <div className="about">
      {layers.map((l) => <p key={l.id}><strong>{l.name}.</strong> {l.sourceText}</p>)}
      <p className="muted small">Values are recovered from the colours of NASA Scientific Visualization Studio movies made for the Earth Information Center. They are relative where the units say "index".</p>
    </div>
  );
}

const ITEMS = ['Listen', 'Layers', 'Time', 'Window', 'Settings', 'About the data'] as const;

export function Controls() {
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<(typeof ITEMS)[number] | null>('Layers');
  const bar = useRef<HTMLElement>(null);
  const hud = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (hud.current) gsap.from(hud.current.querySelectorAll('.brand, .menu-button'), { opacity: 0, y: 18, filter: 'blur(8px)', duration: 0.9, stagger: 0.1, ease: 'power3.out', clearProps: 'opacity,filter,transform' });
  }, []);
  useLayoutEffect(() => {
    if (!bar.current) return;
    gsap.to(bar.current, { xPercent: open ? 0 : 105, autoAlpha: open ? 1 : 0, duration: 0.5, ease: 'power3.inOut' });
    if (open) bar.current.querySelector<HTMLElement>('.item-head')?.focus();
  }, [open]);
  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener('fte-menu', toggle);
    return () => window.removeEventListener('fte-menu', toggle);
  }, []);

  const body: Record<(typeof ITEMS)[number], ReactNode> = {
    Listen: <Listen />, Layers: <Layers />, Time: <Time />, Window: <WindowControls />, Settings: <Settings />, 'About the data': <About />,
  };
  return (
    <div className="hud" ref={hud}>
      <Brand />
      <TourCard />
      <button type="button" className="menu-button glass" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)}>
        {open ? 'Close' : 'Menu'} <kbd>M</kbd>
      </button>
      <aside id="sidebar" ref={bar} className="sidebar glass" aria-label="Menu" style={{ visibility: 'hidden' }}>
        {ITEMS.map((t) => (
          <Item key={t} title={t} open={item === t} onToggle={() => setItem(item === t ? null : t)}>{body[t]}</Item>
        ))}
      </aside>
    </div>
  );
}
