import * as Tone from 'tone';
import type { LayerId, LayerInfo, WindowData } from '../data/types';
import { fx } from '../fx';
import { Field } from './field';
import { Terrain } from './terrain';
import { loadBuffer, pruneAudioCaches } from './cache';
import { chordAt, type Mood } from './harmony';
import { buildPattern, scanPan, STEPS, type Pattern, type Step } from './loop';
import { scaleNotes, VOICES, type Instrument, type VoiceMapping } from './mapping';

interface Manifest {
  instruments: Record<Instrument, Record<string, string>>;
  oneshots: Record<string, string>;
}

type Buffers = Record<string, Tone.ToneAudioBuffer>;

// Sustained samples get a slower attack and release than struck ones.
const ENVELOPE: Record<Instrument, { attack: number; release: number }> = {
  cello: { attack: 0.06, release: 0.5 }, clarinet: { attack: 0.04, release: 0.4 }, harp: { attack: 0, release: 1.2 },
  glock: { attack: 0, release: 1.5 }, piano: { attack: 0, release: 0.8 },
  cellotrem: { attack: 0.4, release: 1.2 },
};

/** What every voice reads from the conductor: key and the ensemble's mood. */
interface Score { keyRoot: number; mood: Mood }

const hz = (midi: number) => Tone.Frequency(midi, 'midi').toFrequency();

/** One data layer's voice: two sampler lanes for equal-power crossfades between loops, character filters,
 *  an optional recorded texture (wind, rain), pan, level. */
export class Voice {
  private lanes: Tone.Sampler[];
  private xfade = new Tone.CrossFade(0);
  private hp: Tone.Filter;
  private lp: Tone.Filter;
  private panner: Tone.Panner;
  private level = new Tone.Gain(0);
  private texture: Tone.Gain | null = null;
  private patterns: (Pattern | null)[] = [null, null];
  private active = 0;
  private pending: Pattern | null = null;
  enabled = false;
  userDb = 0;
  current: Pattern | null = null;

  constructor(readonly map: VoiceMapping, buffers: Buffers, out: Tone.InputNode, private score: Score, textureBuf?: Tone.ToneAudioBuffer) {
    const env = ENVELOPE[map.instrument];
    this.lanes = [0, 1].map(() => new Tone.Sampler({ urls: buffers, ...env }));
    this.lanes[0].connect(this.xfade.a);
    this.lanes[1].connect(this.xfade.b);
    this.hp = new Tone.Filter(map.timbre.hp[0], 'highpass');
    this.lp = new Tone.Filter(map.timbre.lp[0], 'lowpass');
    this.panner = new Tone.Panner(map.pan);
    this.xfade.chain(this.hp, this.lp, this.panner, this.level, out);
    if (textureBuf) {
      this.texture = new Tone.Gain(0);
      new Tone.Player({ url: textureBuf, loop: true, loopStart: 0.06, loopEnd: textureBuf.duration - 0.06 })
        .chain(this.texture, new Tone.Panner(map.pan), out).start();
    }
  }

  private build(win: WindowData, layer: LayerInfo) {
    return buildPattern(win, layer, this.map, this.score.keyRoot, this.score.mood);
  }

  /** Character filters and texture follow the data; ramps keep every change smooth. */
  private applyCharacter(p: Pattern, ramp: number, time?: number) {
    this.lp.frequency.rampTo(p.lpHz, ramp, time);
    this.lp.Q.rampTo(p.q, ramp, time);
    this.hp.frequency.rampTo(p.hpHz, ramp, time);
    this.texture?.gain.rampTo(this.enabled && p.textureDb > -Infinity ? Tone.dbToGain(p.textureDb + this.userDb) : 0, Math.max(ramp, 0.3), time);
  }

  /** Queue a new loop from window data. It swaps in on the next beat. */
  render(win: WindowData, layer: LayerInfo) {
    this.pending = this.build(win, layer);
    if (!this.current) this.swap(Tone.now());
    return this.pending ?? this.current!;
  }

  /** Drag preview: filter, pan and level follow the data continuously; notes stay until release. */
  scrub(win: WindowData, layer: LayerInfo) {
    const p = this.build(win, layer);
    this.applyCharacter(p, 0.12);
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
    if (this.current) this.applyCharacter(this.current, ramp);
    else if (!this.enabled) this.texture?.gain.rampTo(0, ramp);
  }

  private swap(time: number) {
    if (!this.pending) return;
    this.active = this.current ? 1 - this.active : this.active;
    this.patterns[this.active] = this.pending;
    this.current = this.pending;
    this.pending = null;
    this.xfade.fade.rampTo(this.active, 0.4, time); // CrossFade is equal-power
    this.applyCharacter(this.current, 0.4, time);
    this.level.gain.rampTo(this.enabled ? this.gainFor(this.current) : 0, 0.4, time);
  }

  /** Called by the transport on every beat. Returns the step played, for accents. */
  playStep(i: number, time: number, stepSec: number): Step | null {
    if (this.pending) this.swap(time); // any beat: the notes follow the window while it moves
    const p = this.patterns[this.active];
    if (!this.enabled || !p) return null;
    const step = p.steps[i];
    // Stereo follows the scan line: west left, east right (snap back quickly at the loop start).
    this.panner.pan.rampTo(scanPan(p.pan, i), i === 0 ? 0.15 : stepSec, time);
    this.trigger(step, time, stepSec, this.lanes[this.active]);
    return step;
  }

  /** Tutorial: play `beats` of a constant-value window with its full character (filters, texture), then restore. */
  demo(win: WindowData, layer: LayerInfo, stepSec: number, beats = 4) {
    const p = this.build(win, layer);
    const t0 = Tone.now() + 0.05;
    this.applyCharacter(p, 0.05, t0);
    this.texture?.gain.rampTo(p.textureDb > -Infinity ? Tone.dbToGain(p.textureDb) : 0, 0.2, t0);
    this.level.gain.rampTo(this.gainFor(p), 0.05, t0);
    return this.playSteps(p.steps.slice(0, beats), stepSec, t0);
  }

  /** Tutorial: play these steps one per beat (with their visuals) outside the loop. Returns seconds. */
  playSteps(steps: Step[], stepSec: number, t0 = Tone.now() + 0.05) {
    steps.forEach((step, k) => {
      const i = Math.round((k * STEPS) / Math.max(steps.length, 1)) % STEPS; // spread over the window, west to east
      this.trigger(step, t0 + k * stepSec, stepSec, this.lanes[this.active]);
      Tone.getDraw().schedule(() => fx.emit({ kind: 'step', layer: this.map.layer, i, step }), t0 + k * stepSec);
    });
    return steps.length * stepSec;
  }

  /** Back to the loop's own character and level after a demo. */
  restore() { this.applyLevel(0.3); }

  /** Play one step outside the loop (tutorial legend). */
  preview(step: Step, time: number, stepSec: number) {
    this.trigger(step, time, stepSec, this.lanes[this.active]);
  }

  private trigger(step: Step, time: number, stepSec: number, lane: Tone.Sampler) {
    if (step.noData) return; // missing data is simply silent for this layer
    for (const n of step.notes) lane.triggerAttackRelease(hz(n.midi), Math.max(0.05, n.dur * stepSec), time + n.offset * stepSec, n.vel);
  }

  dispose() {
    [...this.lanes, this.xfade, this.hp, this.lp, this.panner, this.level].forEach((n) => n.dispose());
  }
}

export type OneShot = 'clave' | 'framedrum' | 'smallbell' | 'gong' | 'cymbal' | 'ratchet' | 'thump' | 'singingbowl' | 'wave' | 'whoosh' | 'windchime' | 'oceanbed' | 'landbed' | 'windbed' | 'rain' | 'timpani';

export interface PlayOpts { rate?: number; db?: number; at?: number; reverse?: boolean; lowpass?: number; music?: boolean }

class AudioEngine {
  ready = false;
  missing: string[] = [];
  voices = new Map<LayerId, Voice>();
  keyRoot = 2; // D
  /** Ensemble severity 0..1 (worst active layer) and the mood it selects. Set by the controller. */
  severity = 0;
  mood: Mood = 0;
  onAccent: (() => void) | null = null;
  /** Called on every bar line, in step with the audio (time travel). */
  onBar: (() => void) | null = null;
  firstLayer: LayerId | null = null;
  /** Surround field around the window (HRTF, level and position only). */
  field: Field | null = null;
  /** Terrain probe: contour steps, slope pull and peak/valley beacons while the window moves. */
  terrain: Terrain | null = null;

  private shots: Buffers = {};
  private reversed: Buffers = {};
  private stack!: Tone.Gain;
  private duck!: Tone.Gain;
  private events!: Tone.Gain;
  private narration!: Tone.Gain;
  private volume!: Tone.Gain;
  private mono!: Tone.Mono;
  private whooshGain!: Tone.Gain;
  private whooshPan!: Tone.Panner;
  /** Motion cue on the whole mix: balance leans towards east/west travel, a high shelf brightens north, darkens south. */
  private motionPan!: Tone.Panner;
  private motionTilt!: Tone.Filter;
  /** While moving, part of the mix is sent through an HRTF panner placed in the direction of travel (front/back too). */
  private motion3d!: Tone.Panner3D;
  private motionDry!: Tone.Gain;
  private motionWet!: Tone.Gain;
  private manyTimer = 0;
  private beds: Record<string, Tone.Gain> = {};
  private drone: Tone.Sampler | null = null;
  private speaking = false;
  private probing = false;
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
    pruneAudioCaches();
    const base = import.meta.env.BASE_URL + 'audio/';
    const manifest: Manifest = await fetch(base + 'manifest.json').then((r) => r.json());
    const load = async (map: Record<string, string>): Promise<Buffers> => {
      const out: Buffers = {};
      await Promise.all(Object.entries(map).map(async ([k, rel]) => {
        try { out[k] = await loadBuffer(base + rel); } catch { this.missing.push(rel); }
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
    this.motionPan = new Tone.Panner(0);
    this.motionTilt = new Tone.Filter({ type: 'highshelf', frequency: 2500, gain: 0 });
    this.motion3d = new Tone.Panner3D({ panningModel: 'HRTF', distanceModel: 'linear', rolloffFactor: 0, positionZ: -1 });
    this.motionDry = new Tone.Gain(1);
    this.motionWet = new Tone.Gain(0);
    this.stack.chain(this.duck, this.motionTilt);
    this.motionTilt.chain(this.motionPan, this.motionDry, master);
    this.motionTilt.chain(this.motion3d, this.motionWet, master);
    this.events = new Tone.Gain(Tone.dbToGain(-4)).connect(master);
    this.narration = new Tone.Gain(1).connect(master);
    this.field = new Field(this.duck, () => this.keyRoot);
    this.terrain = new Terrain(new Tone.Gain(Tone.dbToGain(-3)).connect(master), () => this.keyRoot);

    this.shots = await load(manifest.oneshots);
    for (const name of ['clave', 'framedrum', 'smallbell', 'gong', 'cymbal', 'ratchet', 'thump', 'singingbowl', 'wave', 'whoosh', 'windchime']) {
      if (!this.shots[name]) this.missing.push(`oneshots/${name}`);
    }
    if (this.shots.cymbal) {
      const r = new Tone.ToneAudioBuffer().fromArray(this.shots.cymbal.toArray() as Float32Array);
      r.reverse = true;
      this.reversed.cymbal = r;
    }

    await Promise.all(VOICES.map(async (map) => {
      const bufs = await load(manifest.instruments[map.instrument] ?? {});
      if (!Object.keys(bufs).length) { this.missing.push(`instrument ${map.instrument}`); return; }
      const v = new Voice(map, bufs, this.stack, this, map.texture ? this.shots[map.texture.sample] : undefined);
      this.voices.set(map.layer, v);
    }));

    // Severity drone: tremolo strings on the chord root and fifth, entering as the ensemble gets uneasy.
    const trem = await load(manifest.instruments.cellotrem ?? {});
    if (Object.keys(trem).length) {
      this.drone = new Tone.Sampler({ urls: trem, ...ENVELOPE.cellotrem });
      this.drone.chain(new Tone.Filter(1200, 'lowpass'), new Tone.Gain(Tone.dbToGain(-6)), this.stack);
    } else this.missing.push('instrument cellotrem');

    // Ambience beds: sea wash for water, mountain wind only for high land (recordings). Kept very quiet.
    for (const [name, filter] of [
      ['oceanbed', new Tone.Filter(1400, 'lowpass')],
      ['windbed', new Tone.Filter(600, 'highpass')],
    ] as const) {
      const buf = this.shots[name];
      if (!buf) continue;
      const g = new Tone.Gain(0);
      // Skip the MP3 encoder padding at both ends so the loop has no gap.
      new Tone.Player({ url: buf, loop: true, loopStart: 0.06, loopEnd: buf.duration - 0.06 }).chain(filter, g, this.duck).start();
      this.beds[name] = g;
    }
    // Earth bed for land: a deep, warm ground rumble (brown noise below 180 Hz) with a faint soil grain around 420 Hz.
    // ponytail: synthesized, levels set by ear; swap in a recorded soil/forest-floor bed under the same gain if found.
    const earth = new Tone.Gain(0).connect(this.duck);
    new Tone.Noise('brown').chain(new Tone.Filter(180, 'lowpass'), new Tone.Gain(2.5), earth).start();
    new Tone.Noise('pink').chain(new Tone.Filter({ type: 'bandpass', frequency: 420, Q: 0.8 }), new Tone.Gain(0.1), earth).start();
    this.beds.earthbed = earth;

    // Window-moving whoosh: a looping field-recording slice, level follows drag speed.
    this.whooshPan = new Tone.Panner(0).connect(this.events);
    this.whooshGain = new Tone.Gain(0).connect(this.whooshPan);
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
      if (step) Tone.getDraw().schedule(() => fx.emit({ kind: 'step', layer: id, i, step }), time);
      if (step?.accent && id === this.firstLayer && this.onAccent) {
        const cb = this.onAccent;
        Tone.getDraw().schedule(cb, time);
      }
    }
    // Conductor: the ensemble's severity adds a tremolo drone and, when severe, a timpani heartbeat.
    if (enabled && i % 4 === 0) {
      const root = chordAt(this.mood, i / 4)[0];
      const [low] = scaleNotes(this.keyRoot, 38, 49, [root]);
      if (this.drone && this.severity > 0.34) {
        const v = 0.15 + 0.55 * ((this.severity - 0.34) / 0.66);
        this.drone.triggerAttackRelease([hz(low), hz(low + 7)], 4 * stepSec, time, v);
      }
      if (this.severity > 0.67) this.heartbeat(time, stepSec, (this.severity - 0.67) / 0.33);
    }
    if (i % 4 === 0 && this.onBar) { const cb = this.onBar; Tone.getDraw().schedule(cb, time); }
  }

  /** Timpani heartbeat, strength 0..1, with its visual pulse. */
  private heartbeat(time: number, stepSec: number, strength: number) {
    const db = -16 + 10 * strength;
    this.play('timpani', { at: time, db, lowpass: 900, music: true });
    this.play('timpani', { at: time + 0.3 * stepSec, db: db - 5, rate: 0.94, lowpass: 900, music: true });
    Tone.getDraw().schedule(() => fx.emit({ kind: 'heartbeat', strength }), time);
  }

  /** Tutorial: the severity sounds on their own, drone for two bars, heartbeat in the second. Returns seconds. */
  demoSeverity(): number {
    const stepSec = this.stepSeconds();
    const t = Tone.now() + 0.05;
    const [low] = scaleNotes(this.keyRoot, 38, 49, [chordAt(2, 0)[0]]);
    this.drone?.triggerAttackRelease([hz(low), hz(low + 7)], 8 * stepSec, t, 0.6);
    for (let b = 4; b < 8; b += 2) this.heartbeat(t + b * stepSec, stepSec, 0.8);
    return 8 * stepSec + 1;
  }

  private clips = new Map<string, Tone.ToneAudioBuffer>();

  /** Narration clip (pre-recorded neural voice). Ducks the music while it plays. Rejects if the file is missing. */
  async playClip(url: string): Promise<void> {
    let buf = this.clips.get(url);
    if (!buf) {
      buf = await loadBuffer(url);
      this.clips.set(url, buf);
    }
    const b = buf;
    return new Promise((resolve) => {
      const src = new Tone.ToneBufferSource({ url: b });
      const g = new Tone.Gain(Tone.dbToGain(-1)).connect(this.narration);
      src.connect(g);
      this.duckSpeech(true);
      let done = false;
      const end = () => {
        if (done) return;
        done = true;
        this.clipStop = null;
        this.duckSpeech(false);
        src.dispose(); g.dispose();
        resolve();
      };
      src.onended = end;
      this.clipStop = () => { try { src.stop(); } catch { /* not started */ } end(); };
      src.start(Tone.immediate());
    });
  }

  private clipStop: (() => void) | null = null;
  stopClip() { this.clipStop?.(); }

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
    const bus = o.music ? this.stack : this.events;
    if (lp) src.chain(lp, g, bus); else src.chain(g, bus);
    src.onended = () => { src.dispose(); g.dispose(); lp?.dispose(); };
    src.start(o.at ?? Tone.immediate());
    if (!o.music) this.duckForEvent(buf.duration / (o.rate ?? 1));
  }

  private duckForEvent(sec: number) {
    this.eventUntil = Math.max(this.eventUntil, Tone.immediate() + Math.min(sec, 1.5));
    this.applyDuck();
    setTimeout(() => this.applyDuck(), Math.min(sec, 1.5) * 1000 + 30);
  }

  /** While the window moves the music steps back 5 dB so the terrain probe reads clearly. */
  setProbing(on: boolean) {
    if (this.probing === on) return;
    this.probing = on;
    this.applyDuck();
  }

  duckSpeech(on: boolean) {
    this.speaking = on;
    this.applyDuck();
  }

  private applyDuck() {
    if (!this.duck) return;
    const db = this.speaking ? -9 : this.probing ? -5 : Tone.immediate() < this.eventUntil ? -1.5 : 0;
    this.duck.gain.rampTo(Tone.dbToGain(db), this.probing ? 0.2 : 0.05);
  }

  /** Many borders: one continuous, soft clave patter instead of single ticks. Runs even while the loop is paused. */
  setManyBorders(on: boolean) {
    clearInterval(this.manyTimer);
    if (!on) return;
    const rates = [1, 1.19, 0.94, 1.12];
    let k = 0;
    this.manyTimer = window.setInterval(() => this.play('clave', { rate: rates[k++ % 4], db: -30, lowpass: 2000 }), 110);
  }

  /**
   * Which way the window is travelling, in window widths per second (east, north). Heard three ways, all blended in
   * only while moving and eased over half a second:
   *  - left/right: the stereo balance leans into east/west travel (up to 50 %), the whoosh further;
   *  - ahead/behind: up to half the mix (equal power) moves into an HRTF panner placed in the direction of travel,
   *    north = in front, south = behind, so headphones give a front/back image as well as left/right;
   *  - a 2.5 kHz shelf tilts brighter going north, darker going south (up to 3 dB).
   * At rest the mix is the plain stereo mix. ponytail: tanh curves tuned by reasoning, adjust by ear.
   */
  setMotion(east: number, north: number) {
    if (!this.motionPan) return;
    const T = 0.5, now = Tone.now();
    const speed = Math.hypot(east, north);
    const m = 0.5 * Math.tanh(1.2 * speed); // share of the mix that moves into the 3D panner
    this.motionDry.gain.linearRampTo(Math.cos((m * Math.PI) / 2), T);
    this.motionWet.gain.linearRampTo(Math.sin((m * Math.PI) / 2), T);
    if (speed > 1e-3) {
      this.motion3d.positionX.linearRampToValueAtTime(east / speed, now + T);
      this.motion3d.positionZ.linearRampToValueAtTime(-north / speed, now + T);
    }
    const pan = 0.5 * Math.tanh(1.5 * east);
    this.motionPan.pan.linearRampTo(pan, T);
    this.whooshPan.pan.linearRampTo(Math.max(-1, Math.min(1, pan * 1.6)), T * 0.6);
    this.motionTilt.gain.linearRampTo(3 * Math.tanh(1.5 * north), T); // linear: dB crosses zero
  }

  setMoveSpeed(degPerSec: number) {
    this.whooshGain?.gain.rampTo(Math.min(1, degPerSec / 40) * 0.6, 0.08);
  }

  /**
   * landShare 0 = all water, 1 = all land; height 0 = lowland, 1 = high mountains.
   * Equal-power mixes: sea vs earth; wind joins the earth only with height. Slow ramps so crossings blend.
   */
  setSurface(landShare: number, height: number) {
    const bed = Tone.dbToGain(-20), T = 0.8;
    const land = Math.sin((landShare * Math.PI) / 2);
    this.beds.oceanbed?.gain.linearRampTo(bed * Math.cos((landShare * Math.PI) / 2), T);
    this.beds.earthbed?.gain.linearRampTo(bed * land * (1 - 0.4 * height), T);
    this.beds.windbed?.gain.linearRampTo(bed * 0.9 * land * Math.sin((height * Math.PI) / 2), T);
  }

  /** Position of the scan line in the loop, 0..1 (west to east). */
  loopPhase(): number {
    const t = Tone.getTransport();
    return ((t.ticks / t.PPQ) % STEPS) / STEPS;
  }

  /** Dial detent: a tiny dry click per step, higher going up. Never ducks the music. */
  detent(up: boolean) { this.play('clave', { rate: up ? 2.5 : 2.1, db: -24, lowpass: 5000, music: true }); }

  setMasterVolume(v: number) { this.volume?.gain.rampTo(v, 0.1); }

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
