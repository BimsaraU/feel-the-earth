import { gsap } from 'gsap';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { engine } from '../audio/engine';
import { KEYS, levelWord, norm, voiceFor, VOICES } from '../audio/mapping';
import { placeName, spokenDate, spokenNumber } from '../assist/answers';
import { canListen, listen, runText, setWake } from '../assist/run';
import { say } from '../assist/speech';
import { personaOf, VOICES_TTS } from '../assist/voices';
import { runTutorial, skipNarration, stopTutorial } from '../assist/tutorial';
import {
  askBeacons, askWhat, askWhere, dateBounds, geo, glideStart, glideStop, moveBy, setDate, setSize, setTravelling, sizeDone, stepDate,
  showLayer, toggleLayer, togglePlay, toggleVoice, type Dir,
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

/** The assistant's name in the chosen voice, upper case for labels (JODI, or GOJO in Gojo's voice). */
const useName = () => personaOf(useApp((s) => s.settings.jodiVoice)).toUpperCase();

/** Hold to speak to JODI (or Enter / K to start and stop; J held anywhere). */
function PushToTalk() {
  const [on, setOn] = useState(false);
  const stop = useRef<() => void>(() => {});
  if (!canListen) return null;
  const start = () => { stop.current = listen(setOn); };
  return (
    <button type="button" aria-pressed={on} onPointerDown={start} onPointerUp={() => stop.current()}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); if (on) stop.current(); else start(); } }}>
      {on ? 'Listening…' : `Hold to talk to ${name}`} <kbd>hold J</kbd>
    </button>
  );
}

/** Example phrases, grouped; tapping one runs it. The full grammar is in assist/commands.ts. */
const SAY: [string, string[]][] = [
  ['Move', ['North', 'Far east', 'Go to Brazil', 'Go to the Pacific Ocean']],
  ['Layers', ['Ocean', 'Lightning', 'Rain', 'Next layer']],
  ['Time', ['Next day', 'Previous month', 'Next year', 'Time travel']],
  ['Window and view', ['Wider', 'Narrower', 'Zoom in', 'Reset zoom']],
  ['Sound', ['Pause', 'Louder', 'Slower', 'Legend']],
];

function CommandBox() {
  const [text, setText] = useState('');
  return (
    <>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { runText(text); setText(''); } }}>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask anything, or a command like go to Peru"
          aria-label="Type a command" enterKeyHint="go" autoComplete="off" />
        <button type="submit">Run</button>
      </form>
      <details className="say">
        <summary>What you can say</summary>
        {SAY.map(([group, phrases]) => (
          <div key={group} className="say-group">
            <p className="label">{group}</p>
            <div className="say-chips">{phrases.map((p) => <button key={p} type="button" onClick={() => runText(p)}>{p}</button>)}</div>
          </div>
        ))}
        <button type="button" className="wide" onClick={() => runText('help')}>Read all commands aloud</button>
      </details>
    </>
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
      <p className="wordmark">Feel the Earth {layers.some((l) => l.demo) && <strong className="demo">Demo data, not NASA data</strong>}</p>
      <h1 ref={title}>{place}</h1>
      <dl className="coords">
        <div><dt>Latitude</dt><dd>{coord(lat, 'N', 'S')}</dd></div>
        <div><dt>Longitude</dt><dd>{coord(lon, 'E', 'W')}</dd></div>
        <div><dt>Window</dt><dd>{Math.round(size * 10) / 10}°</dd></div>
        <div><dt>{travelling ? 'Travelling' : 'Date'}</dt><dd>{spokenDate(date)}</dd></div>
      </dl>
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
      <p className="label">Listening tour, stop {tour.i + 1} of {tour.n}</p>
      <h2 className="tour-title">{tour.title}</h2>
      <p className="tour-text">{tour.text}</p>
      <div className="buttons">
        <button type="button" onClick={skipNarration}>Skip</button>
        <button type="button" onClick={stopTutorial}>End tour <kbd>Esc</kbd></button>
      </div>
    </div>
  );
}

/** Play and pause as a disc; its ring fills as the scan line crosses the window, so one loop is one turn. */
function Transport() {
  const playing = useApp((s) => s.playing);
  const el = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => { el.current?.style.setProperty('--phase', String(engine.loopPhase())); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <button ref={el} type="button" className="transport" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title="Space">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {playing ? <path d="M8 6h3v12H8zM13 6h3v12h-3z" /> : <path d="M8.5 5.5v13l10-6.5z" />}
      </svg>
    </button>
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

/** JODI's stand-in avatar: a small wobbling orange Earth with a face. Listening glows, thinking orbits, speaking bounces. */
function JodiBall() {
  const state = useApp((s) => s.jodi);
  return <span className={`jodi jodi-${state}`} aria-hidden="true"><span className="jodi-face" /></span>;
}

/** The audio assistant: everything that answers in words, on its own button. */
function Assistant() {
  const voice = useApp((s) => s.settings.voice);
  const name = useName();
  return (
    <div className="assistant glass" id="assistant" role="region" aria-label="Audio assistant">
      <h2 className="panel-title">Ask {name}</h2>
      <button type="button" onClick={askWhere}>Where am I? <kbd>W</kbd></button>
      <button type="button" onClick={() => void askWhat()}>What am I hearing? <kbd>H</kbd></button>
      <button type="button" onClick={() => askBeacons('peak')}>Find the peak <kbd>B</kbd></button>
      <button type="button" onClick={() => askBeacons('valley')}>Find the valley <kbd>V</kbd></button>
      <button type="button" onClick={() => void runTutorial()}>Listening tour <kbd>T</kbd></button>
      <button type="button" onClick={() => void runTutorial('assistant')}>How to talk to {name} <kbd>Shift T</kbd></button>
      <button type="button" onClick={toggleVoice} aria-pressed={voice}>Voice guide {voice ? 'on' : 'off'} <kbd>tap J</kbd></button>
      <PushToTalk />
      <CommandBox />
    </div>
  );
}

const short = (v: number) => String(+v.toPrecision(3));

/** Map key: which data the colours on the map are, its scale, and what else is drawn or only heard. */
function MapKey() {
  const { layers, active, date, frames } = useApp();
  const shown = layers.find((x) => x.id === active[active.length - 1]);
  const heard = active.slice(0, -1).map((id) => layers.find((x) => x.id === id)!).filter(Boolean);
  const inRecord = shown && date >= shown.timeRange[0] && date <= shown.timeRange[1];
  const frame = shown && frames[shown.id];
  return (
    <section className="mapkey glass" aria-label="Map key">
      <p className="label">Colour on the map</p>
      {shown ? (
        <>
          <p className="mapkey-name">{shown.name}</p>
          <div className="legend" role="img" aria-label={`Colour scale from ${short(shown.min)} to ${short(shown.max)} ${shown.unitSpoken}`}>
            <span>{short(shown.min)}</span>
            <span className="ramp" style={{ background: rampCss(shown.id) }} />
            <span>{short(shown.max)} {shown.unit}</span>
          </div>
          <p className="muted small">
            Heard as {voiceFor(shown.id).instrument}{!inRecord && frame ? `, nearest record ${spokenDate(frame).replace(/^\d+ /, '')}` : ''}
          </p>
        </>
      ) : <p className="muted small">No data layer. Press 1 to 9 or open the menu.</p>}
      {heard.length > 0 && (
        <div className="mapkey-heard">
          <p className="label">Also playing, not drawn</p>
          {heard.map((l) => <button key={l.id} type="button" onClick={() => showLayer(l.id)} aria-label={`Draw ${l.name} on the map`}>{l.name}</button>)}
        </div>
      )}
      <p className="mapkey-marks muted small"><span className="mk-window" aria-hidden="true" /> listening window <span className="mk-scan" aria-hidden="true" /> scan line</p>
    </section>
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
          ctx.fillStyle = i === step ? '#fff8f1' : `rgba(${r},${g},${b},${Number.isNaN(s.value) ? 0.25 : 0.75})`;
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Date drum: the year on 1 January, the month on the 1st of every other month, plain day ticks between. */
const monthTick = (d: number) => {
  const iso = fromDays(d);
  if (!iso.endsWith('-01')) return null;
  const m = +iso.slice(5, 7);
  return m === 1 ? iso.slice(0, 4) : MONTHS[m - 1];
};

function Time() {
  const { date, layers, travelling } = useApp();
  const [lo, hi] = dateBounds(layers);
  return (
    <div>
      <Wheel label="Date" value={toDays(date)} min={toDays(lo)} max={toDays(hi)} step={1} pxPerStep={5}
        format={(d) => spokenDate(fromDays(d))} onChange={(d) => setDate(fromDays(d), 'quiet')} tick={monthTick} />
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
      <p className="muted small">Time travel moves the date forward one step per bar: a day for sea temperature, ten days for lightning, a year for night lights. All layers share one date; a layer whose record does not reach it plays its nearest record.</p>
    </div>
  );
}

/** Date dial on the home screen. At rest a small pill with the date; touching, scrolling or focusing it rolls out
 *  the full drum (like a camera zoom wheel), and it tucks away again a moment after you let go. */
function HomeTime() {
  const { date, layers } = useApp();
  const [lo, hi] = dateBounds(layers);
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  const engage = () => { clearTimeout(timer.current); setOpen(true); };
  const release = (ms = 1400) => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), ms); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <div className={`home-time${open ? ' open' : ''}`} onPointerDown={engage} onPointerUp={() => release()} onPointerCancel={() => release()}
      onWheel={() => { engage(); release(); }} onFocus={engage} onBlur={() => release(200)} onKeyDown={engage} onKeyUp={() => release()}>
      <Wheel label="Date dial" value={toDays(date)} min={toDays(lo)} max={toDays(hi)} step={1} pxPerStep={5}
        format={(d) => spokenDate(fromDays(d))} onChange={(d) => setDate(fromDays(d), 'quiet')} tick={monthTick} />
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
      <label className="field">Assistant's voice
        <select value={s.jodiVoice} onChange={(e) => { setSettings({ jodiVoice: e.target.value }); void say(`Hi, I'm ${personaOf(e.target.value)}. This is my voice.`); }}>
          {VOICES_TTS.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.note})</option>)}
        </select>
      </label>
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
      <label className="check"><input type="checkbox" checked={s.spatial} onChange={(e) => setSettings({ spatial: e.target.checked })} /> Spatial field: hear each place from its direction (headphones)</label>
      <label className="check"><input type="checkbox" checked={s.probe} onChange={(e) => setSettings({ probe: e.target.checked })} /> Contour ticks (haptic)</label>
      <label className="check"><input type="checkbox" checked={s.navBeacons} onChange={(e) => setSettings({ navBeacons: e.target.checked })} /> Navigation sounds: peak and valley beacons while moving</label>
      {canListen && <label className="check"><input type="checkbox" checked={s.wakeWord} onChange={(e) => setSettings({ wakeWord: e.target.checked })} /> Listen for "Hey Jodi" or "Hey Gojo" (microphone)</label>}
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

const ITEMS = ['Layers', 'Time', 'Window', 'Settings', 'About the data'] as const;

export function Controls() {
  const [panel, setPanel] = useState<'menu' | 'assistant' | null>(null);
  const name = useName();
  const open = panel === 'menu';
  const [item, setItem] = useState<(typeof ITEMS)[number] | null>('Layers');
  const bar = useRef<HTMLElement>(null);
  const hud = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (hud.current) gsap.from(hud.current.querySelectorAll('.brand, .bar, .mapkey'), { opacity: 0, y: 18, filter: 'blur(8px)', duration: 0.9, stagger: 0.1, ease: 'power3.out', clearProps: 'opacity,filter,transform' });
  }, []);
  useLayoutEffect(() => {
    if (!bar.current) return;
    gsap.to(bar.current, { xPercent: open ? 0 : 105, autoAlpha: open ? 1 : 0, duration: 0.5, ease: 'power3.inOut' });
    if (open) bar.current.querySelector<HTMLElement>('.item-head')?.focus();
  }, [open]);
  useEffect(() => {
    const menu = () => setPanel((p) => (p === 'menu' ? null : 'menu'));
    const assistant = () => setPanel((p) => (p === 'assistant' ? null : 'assistant'));
    window.addEventListener('fte-menu', menu);
    window.addEventListener('fte-assistant', assistant);
    return () => { window.removeEventListener('fte-menu', menu); window.removeEventListener('fte-assistant', assistant); };
  }, []);
  const wakeWord = useApp((s) => s.settings.wakeWord);
  useEffect(() => setWake(wakeWord), [wakeWord]);

  const body: Record<(typeof ITEMS)[number], ReactNode> = {
    Layers: <Layers />, Time: <Time />, Window: <WindowControls />, Settings: <Settings />, 'About the data': <About />,
  };
  return (
    <div className="hud" ref={hud}>
      <Brand />
      <TourCard />
      <MapKey />
      <HomeTime />
      <nav className="bar glass" aria-label="Main">
        <Transport />
        <button type="button" aria-expanded={panel === 'assistant'} aria-controls="assistant" onClick={() => setPanel(panel === 'assistant' ? null : 'assistant')}
          className="jodi-btn" aria-label={`${name}, the voice assistant`}>
          <JodiBall /> {name} <kbd>A</kbd>
        </button>
        <button type="button" aria-expanded={open} aria-controls="sidebar" onClick={() => setPanel(open ? null : 'menu')}>
          {open ? 'Close' : 'Menu'} <kbd>M</kbd>
        </button>
      </nav>
      {panel === 'assistant' && <Assistant />}
      <aside id="sidebar" ref={bar} className="sidebar glass" aria-label="Menu" style={{ visibility: 'hidden' }}>
        {ITEMS.map((t) => (
          <Item key={t} title={t} open={item === t} onToggle={() => setItem(item === t ? null : t)}>{body[t]}</Item>
        ))}
      </aside>
    </div>
  );
}
