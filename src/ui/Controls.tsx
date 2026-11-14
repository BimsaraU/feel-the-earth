import { useRef, useState } from 'react';
import { KEYS, VOICES } from '../audio/mapping';
import { spokenDate } from '../assist/answers';
import { say } from '../assist/speech';
import { runTutorial } from '../assist/tutorial';
import { askWhat, askWhere, moveBy, resize, setDate, step, stepDate, toggleLayer, togglePlay } from '../controller';
import { useApp } from '../state';
import { colour } from './colour';

const DAY = 86400000;
const toDays = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);
const fromDays = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);

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
      {on ? 'Listening… release to ask' : 'Hold to ask'}
    </button>
  );
}

function Layers() {
  const { layers, active } = useApp();
  return (
    <fieldset>
      <legend>Layers (keys 1 to 8, up to 4 at once)</legend>
      <div className="grid2">
        {VOICES.map((v) => {
          const l = layers.find((x) => x.id === v.layer);
          if (!l) return null;
          const on = active.includes(v.layer);
          return (
            <button key={v.layer} type="button" aria-pressed={on} className={on ? 'on' : ''} onClick={() => toggleLayer(v.layer)}>
              <span className="kbd">{v.key}</span> {l.name}
              <small>{v.instrument} · {on ? 'on' : 'off'}</small>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Legend() {
  const { layers, active } = useApp();
  const l = layers.find((x) => x.id === active[active.length - 1]);
  if (!l) return <p className="legend">No layer on: no colour overlay.</p>;
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${colour(t).join(',')}) ${t * 100}%`).join(',');
  return (
    <div className="legend" aria-label={`Colour scale for ${l.name}, ${l.min} to ${l.max} ${l.unitSpoken}`}>
      <span>{l.min} {l.unit}</span>
      <span className="ramp" style={{ background: `linear-gradient(to right, ${stops})` }} />
      <span>{l.max} {l.unit}</span>
      <span className="hatch" aria-hidden="true" /> <span>no data</span>
    </div>
  );
}

function Time() {
  const { date, layers } = useApp();
  const [lo, hi] = layers[0]?.timeRange ?? [date, date];
  return (
    <fieldset>
      <legend>Date (comma and full stop; Shift for months)</legend>
      <div className="row">
        <button type="button" onClick={() => stepDate(0, -1)} aria-label="Back one month">«</button>
        <button type="button" onClick={() => stepDate(-1)} aria-label="Back one day">‹</button>
        <span className="date">{spokenDate(date)}</span>
        <button type="button" onClick={() => stepDate(1)} aria-label="Forward one day">›</button>
        <button type="button" onClick={() => stepDate(0, 1)} aria-label="Forward one month">»</button>
      </div>
      <label className="slider">
        <span className="sr-only">Date</span>
        <input type="range" min={toDays(lo)} max={toDays(hi)} value={toDays(date)} aria-valuetext={spokenDate(date)}
          onChange={(e) => setDate(fromDays(Number(e.target.value)))} />
      </label>
    </fieldset>
  );
}

function Move() {
  const { size } = useApp();
  return (
    <fieldset>
      <legend>Listening window ({size}°)</legend>
      <div className="pad">
        <button type="button" style={{ gridArea: 'n' }} onClick={() => step('n')}>N</button>
        <button type="button" style={{ gridArea: 'w' }} onClick={() => step('w')}>W</button>
        <button type="button" style={{ gridArea: 'e' }} onClick={() => step('e')}>E</button>
        <button type="button" style={{ gridArea: 's' }} onClick={() => step('s')}>S</button>
        <button type="button" style={{ gridArea: 'b' }} onClick={() => resize(1)}>Bigger</button>
        <button type="button" style={{ gridArea: 'm' }} onClick={() => resize(-1)}>Smaller</button>
      </div>
      <TouchPad />
    </fieldset>
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
        const { size } = useApp.getState();
        const k = size / 60; // 60 px drag = one window width
        const dx = e.clientX - last.current.x, dy = e.clientY - last.current.y;
        if (Math.hypot(dx, dy) < 15) return;
        last.current = { x: e.clientX, y: e.clientY };
        moveBy(-dy * k, dx * k);
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}>
      Touch pad
    </div>
  );
}

function SettingsPanel() {
  const { settings: s, setSettings, layers } = useApp();
  return (
    <details>
      <summary>Settings</summary>
      <label>Master volume <input type="range" min={0} max={1} step={0.05} value={s.masterVolume} onChange={(e) => setSettings({ masterVolume: +e.target.value })} /></label>
      {VOICES.map((v) => (
        <label key={v.layer}>{layers.find((l) => l.id === v.layer)?.name} volume
          <input type="range" min={-18} max={6} step={1} value={s.layerDb[v.layer] ?? 0} aria-valuetext={`${s.layerDb[v.layer] ?? 0} decibels`}
            onChange={(e) => setSettings({ layerDb: { ...s.layerDb, [v.layer]: +e.target.value } })} />
        </label>
      ))}
      <label>Speech rate <input type="range" min={0.6} max={1.8} step={0.1} value={s.speechRate} onChange={(e) => setSettings({ speechRate: +e.target.value })} /></label>
      <label><input type="checkbox" checked={s.voice} onChange={(e) => setSettings({ voice: e.target.checked })} /> Built-in voice (turn off if your screen reader speaks)</label>
      <label><input type="checkbox" checked={s.haptics} onChange={(e) => setSettings({ haptics: e.target.checked })} /> Haptics</label>
      <label><input type="checkbox" checked={s.hapticAccents} onChange={(e) => setSettings({ hapticAccents: e.target.checked })} /> Pulse on loop accents</label>
      <label>Tempo {s.tempo} bpm <input type="range" min={50} max={110} step={1} value={s.tempo} onChange={(e) => setSettings({ tempo: +e.target.value })} /></label>
      <label>Key (dorian)
        <select value={s.keyRoot} onChange={(e) => setSettings({ keyRoot: +e.target.value })}>
          {KEYS.map((k, i) => <option key={k} value={i}>{k}</option>)}
        </select>
      </label>
      <label><input type="checkbox" checked={s.mono} onChange={(e) => setSettings({ mono: e.target.checked })} /> Mono mix</label>
      <label><input type="checkbox" checked={s.highContrast} onChange={(e) => setSettings({ highContrast: e.target.checked })} /> High contrast</label>
    </details>
  );
}

export function Controls() {
  const { playing, live, layers } = useApp();
  const demo = layers.some((l) => l.demo);
  return (
    <section className="panel" aria-label="Controls">
      <header>
        <h1>Feel the Earth</h1>
        {demo && <strong className="demo">DEMO DATA, not NASA data</strong>}
      </header>
      <p className="caption" aria-live="polite" role="status">{live}</p>
      <div className="row wrap">
        <button type="button" onClick={askWhere}>Where am I? <span className="kbd">W</span></button>
        <button type="button" onClick={() => void askWhat()}>What am I hearing? <span className="kbd">H</span></button>
        <button type="button" onClick={togglePlay} aria-pressed={playing}>{playing ? 'Pause' : 'Play'} <span className="kbd">Space</span></button>
        <button type="button" onClick={() => void runTutorial()}>Audio legend <span className="kbd">T</span></button>
        <PushToTalk />
      </div>
      <Move />
      <Layers />
      <Legend />
      <Time />
      <SettingsPanel />
    </section>
  );
}
