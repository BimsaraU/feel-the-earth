import * as Tone from 'tone';
import type { LayerId, LayerInfo, WindowData } from '../data/types';
import { buildPattern, STEPS, type Pattern, type Step } from './loop';
import { VOICES, type Instrument, type VoiceMapping } from './mapping';

interface Manifest {
  instruments: Record<Instrument, Record<string, string>>;
  oneshots: Record<string, string>;
}

type Buffers = Record<string, Tone.ToneAudioBuffer>;

// Sustained samples get a slower attack and release than struck ones.
const ENVELOPE: Record<Instrument, { attack: number; release: number }> = {
  cello: { attack: 0.06, release: 0.5 }, contrabass: { attack: 0.08, release: 0.6 }, clarinet: { attack: 0.04, release: 0.4 },
  oboe: { attack: 0.04, release: 0.4 }, flute: { attack: 0.01, release: 0.25 }, harp: { attack: 0, release: 1.2 },
  glock: { attack: 0, release: 1.5 }, marimba: { attack: 0, release: 0.8 }, piano: { attack: 0, release: 0.8 },
};

const hz = (midi: number) => Tone.Frequency(midi, 'midi').toFrequency();

/** One data layer's voice: two sampler lanes for equal-power crossfades between loops, per-layer EQ, pan, level. */
export class Voice {
  private lanes: Tone.Sampler[];
  private xfade = new Tone.CrossFade(0);
  private hp: Tone.Filter;
  private lp: Tone.Filter;
  private panner: Tone.Panner;
  private level = new Tone.Gain(0);
  private piano: Tone.Sampler;
  private patterns: (Pattern | null)[] = [null, null];
  private active = 0;
  private pending: Pattern | null = null;
  enabled = false;
  userDb = 0;
  current: Pattern | null = null;

  constructor(readonly map: VoiceMapping, buffers: Buffers, pianoBuffers: Buffers, out: Tone.InputNode, private keyRoot: () => number) {
    const env = ENVELOPE[map.instrument];
    this.lanes = [0, 1].map(() => new Tone.Sampler({ urls: buffers, ...env }));
    this.lanes[0].connect(this.xfade.a);
    this.lanes[1].connect(this.xfade.b);
    this.hp = new Tone.Filter(map.band[0], 'highpass');
    this.lp = new Tone.Filter(map.band[1], 'lowpass');
    this.panner = new Tone.Panner(map.pan);
    this.xfade.chain(this.hp, this.lp, this.panner, this.level, out);
    // The felt piano: soft upright piano notes behind a low-pass, the "no data" pulse.
    const felt = new Tone.Filter(1100, 'lowpass');
    this.piano = new Tone.Sampler({ urls: pianoBuffers, attack: 0.01, release: 0.6 });
    this.piano.chain(felt, this.panner);
  }

  /** Samples arrive pre-decoded, so load only waits for the samplers to settle. */
  async load() {
    await Tone.loaded();
  }

  /** Queue a new loop from window data. It swaps in at the next bar line. */
  render(win: WindowData, layer: LayerInfo) {
    this.pending = buildPattern(win, layer, this.map, this.keyRoot());
    if (!this.current) this.swap(Tone.now());
    return this.pending ?? this.current!;
  }

  /** Drag preview: filter, pan and level follow the data continuously; notes stay until release. */
  scrub(win: WindowData, layer: LayerInfo) {
    const p = buildPattern(win, layer, this.map, this.keyRoot());
    this.lp.frequency.rampTo(p.cutoffHz, 0.1);
    this.panner.pan.rampTo(p.pan, 0.3);
    if (this.enabled) this.level.gain.rampTo(this.gainFor(p), 0.1);
  }

  setLevel(db: number) {
    this.userDb = db;
    this.applyLevel(0.2);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.applyLevel(0.3);
  }

  private gainFor(p: Pattern | null) {
    // Whole-window mean adds up to 3 dB: higher values sit slightly forward in the mix.
    const meanDb = p && !Number.isNaN(p.windowNorm) ? -3 * (1 - p.windowNorm) : -1.5;
    return Tone.dbToGain(this.map.trimDb + this.userDb + meanDb);
  }

  private applyLevel(ramp: number) {
    this.level.gain.rampTo(this.enabled ? this.gainFor(this.current) : 0, ramp);
  }

  private swap(time: number) {
    if (!this.pending) return;
    this.active = this.current ? 1 - this.active : this.active;
    this.patterns[this.active] = this.pending;
    this.current = this.pending;
    this.pending = null;
    this.xfade.fade.rampTo(this.active, 0.4, time); // CrossFade is equal-power
    this.lp.frequency.rampTo(this.current.cutoffHz, 0.4, time);
    this.panner.pan.rampTo(this.current.pan, 4, time); // slow stereo drift from the gradient
    this.level.gain.rampTo(this.enabled ? this.gainFor(this.current) : 0, 0.4, time);
  }

  /** Called by the transport on every beat. Returns the step played, for accents. */
  playStep(i: number, time: number, stepSec: number): Step | null {
    if (i % 4 === 0 && this.pending) this.swap(time);
    const p = this.patterns[this.active];
    if (!this.enabled || !p) return null;
    const step = p.steps[i];
    this.trigger(step, time, stepSec, this.lanes[this.active]);
    return step;
  }

  /** Play one step outside the loop (tutorial legend). */
  preview(step: Step, time: number, stepSec: number) {
    this.trigger(step, time, stepSec, this.lanes[this.active]);
  }

  private trigger(step: Step, time: number, stepSec: number, lane: Tone.Sampler) {
    if (step.noData) {
      this.piano.triggerAttackRelease(hz(60 + this.keyRoot()), stepSec * 0.5, time, 0.25);
      return;
    }
    for (const n of step.notes) lane.triggerAttackRelease(hz(n.midi), Math.max(0.05, n.dur * stepSec), time + n.offset * stepSec, n.vel);
  }

  dispose() {
    [...this.lanes, this.xfade, this.hp, this.lp, this.panner, this.level, this.piano].forEach((n) => n.dispose());
  }
}

export type OneShot = 'clave' | 'framedrum' | 'smallbell' | 'gong' | 'cymbal' | 'ratchet' | 'thump' | 'singingbowl' | 'wave' | 'whoosh' | 'windchime';

export interface PlayOpts { rate?: number; db?: number; at?: number; reverse?: boolean; lowpass?: number }

class AudioEngine {
  ready = false;
  missing: string[] = [];
  voices = new Map<LayerId, Voice>();
  keyRoot = 2; // D
  onAccent: (() => void) | null = null;
  firstLayer: LayerId | null = null;

  private shots: Buffers = {};
  private reversed: Buffers = {};
  private stack!: Tone.Gain;
  private duck!: Tone.Gain;
  private events!: Tone.Gain;
  private volume!: Tone.Gain;
  private mono!: Tone.Mono;
  private whooshGain!: Tone.Gain;
  private manyTimer = 0;
  private speaking = false;
  private eventUntil = 0;

  /** Must be called synchronously inside the first user gesture. */
  unlock() {
    // Tone.start resumes the context; calling it inside the gesture is what browsers require.
    const started = Tone.start();
    Tone.getContext().lookAhead = 0.05;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void Tone.getContext().resume();
    });
    return started;
  }

  async init() {
    const base = import.meta.env.BASE_URL + 'audio/';
    const manifest: Manifest = await fetch(base + 'manifest.json').then((r) => r.json());
    const load = async (map: Record<string, string>): Promise<Buffers> => {
      const out: Buffers = {};
      await Promise.all(Object.entries(map).map(async ([k, rel]) => {
        try { out[k] = await new Tone.ToneAudioBuffer().load(base + rel); } catch { this.missing.push(rel); }
      }));
      return out;
    };

    // Master chain: stack -> duck -> master -> compressor -> limiter -> volume -> (mono) -> out
    const master = new Tone.Gain(1);
    const comp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.01, release: 0.25 });
    const limiter = new Tone.Limiter(-1);
    this.volume = new Tone.Gain(0.7);
    this.mono = new Tone.Mono();
    master.chain(comp, limiter, this.volume, Tone.getDestination());
    this.mono.connect(Tone.getDestination());
    this.stack = new Tone.Gain(Tone.dbToGain(-6));
    this.duck = new Tone.Gain(1);
    this.stack.chain(this.duck, master);
    this.events = new Tone.Gain(Tone.dbToGain(-4)).connect(master);

    this.shots = await load(manifest.oneshots);
    for (const name of ['clave', 'framedrum', 'smallbell', 'gong', 'cymbal', 'ratchet', 'thump', 'singingbowl', 'wave', 'whoosh', 'windchime']) {
      if (!this.shots[name]) this.missing.push(`oneshots/${name}`);
    }
    if (this.shots.cymbal) {
      const r = new Tone.ToneAudioBuffer().fromArray(this.shots.cymbal.toArray() as Float32Array);
      r.reverse = true;
      this.reversed.cymbal = r;
    }

    const piano = await load(manifest.instruments.piano ?? {});
    await Promise.all(VOICES.map(async (map) => {
      const bufs = await load(manifest.instruments[map.instrument] ?? {});
      if (!Object.keys(bufs).length) { this.missing.push(`instrument ${map.instrument}`); return; }
      const v = new Voice(map, bufs, piano, this.stack, () => this.keyRoot);
      await v.load();
      this.voices.set(map.layer, v);
    }));

    // Window-moving whoosh: a looping field-recording slice, level follows drag speed.
    this.whooshGain = new Tone.Gain(0).connect(this.events);
    if (this.shots.whoosh) {
      new Tone.Player({ url: this.shots.whoosh, loop: true }).chain(new Tone.Filter(1800, 'bandpass'), this.whooshGain).start();
    }

    const transport = Tone.getTransport();
    transport.bpm.value = 72;
    transport.scheduleRepeat((time) => this.beat(time), '4n', 0);
    this.ready = true;
    if (this.missing.length) console.warn('Missing sample slots:', this.missing);
  }

  private beat(time: number) {
    const transport = Tone.getTransport();
    const i = Math.round(transport.getTicksAtTime(time) / transport.PPQ) % STEPS;
    const stepSec = 60 / transport.bpm.value;
    let enabled = 0;
    for (const [id, v] of this.voices) {
      const step = v.playStep(i, time, stepSec);
      if (v.enabled) enabled++;
      if (step?.accent && id === this.firstLayer && this.onAccent) {
        const cb = this.onAccent;
        Tone.getDraw().schedule(cb, time);
      }
    }
    // No layer on: a quiet felt-piano pulse on each bar so the app is never silent.
    if (!enabled && i % 4 === 0) this.voices.get('temperature')?.preview({ notes: [], noData: true, accent: false, value: NaN }, time, stepSec);
  }

  get playing() {
    return Tone.getTransport().state === 'started';
  }

  startLoop() { Tone.getTransport().start('+0.05'); }
  pauseLoop() { Tone.getTransport().pause(); }

  /** Play a recorded one-shot. Starts immediately unless `at` is given. */
  play(name: OneShot, o: PlayOpts = {}) {
    const buf = o.reverse ? this.reversed[name] : this.shots[name];
    if (!buf || !this.ready) return;
    const src = new Tone.ToneBufferSource({ url: buf, playbackRate: o.rate ?? 1 });
    const g = new Tone.Gain(Tone.dbToGain(o.db ?? 0));
    const lp = o.lowpass ? new Tone.Filter(o.lowpass, 'lowpass') : null;
    if (lp) src.chain(lp, g, this.events); else src.chain(g, this.events);
    src.onended = () => { src.dispose(); g.dispose(); lp?.dispose(); };
    src.start(o.at ?? Tone.immediate());
    this.duckForEvent(buf.duration / (o.rate ?? 1));
  }

  private duckForEvent(sec: number) {
    this.eventUntil = Math.max(this.eventUntil, Tone.immediate() + Math.min(sec, 1.5));
    this.applyDuck();
    setTimeout(() => this.applyDuck(), Math.min(sec, 1.5) * 1000 + 30);
  }

  duckSpeech(on: boolean) {
    this.speaking = on;
    this.applyDuck();
  }

  private applyDuck() {
    if (!this.duck) return;
    const db = this.speaking ? -9 : Tone.immediate() < this.eventUntil ? -3 : 0;
    this.duck.gain.rampTo(Tone.dbToGain(db), 0.05);
  }

  /** Many borders: one continuous, soft clave patter instead of single ticks. Runs even while the loop is paused. */
  setManyBorders(on: boolean) {
    clearInterval(this.manyTimer);
    if (!on) return;
    const rates = [1, 1.19, 0.94, 1.12];
    let k = 0;
    this.manyTimer = window.setInterval(() => this.play('clave', { rate: rates[k++ % 4], db: -16 }), 110);
  }

  setMoveSpeed(degPerSec: number) {
    this.whooshGain?.gain.rampTo(Math.min(1, degPerSec / 40) * 0.6, 0.08);
  }

  setMasterVolume(v: number) { this.volume?.gain.rampTo(v, 0.1); }
  setTempo(bpm: number) { Tone.getTransport().bpm.rampTo(bpm, 0.5); }

  setMono(on: boolean) {
    this.volume.disconnect();
    this.volume.connect(on ? this.mono : Tone.getDestination());
  }

  stepSeconds() {
    return 60 / Tone.getTransport().bpm.value;
  }

  now() {
    return Tone.immediate();
  }
}

export const engine = new AudioEngine();
