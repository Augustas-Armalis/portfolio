import { audioGraph, music, resumeAudio } from "@/lib/audio";
import { playPiano, preloadPiano } from "@/lib/piano";

// The sound of the place itself, kept very quiet (the whole bed sits around
// -30 dBFS). Two things only by default:
//   - wind: pink noise, band-limited to roughly 90-600 Hz, moving in slow
//     random gusts (level and cutoff drift together). No bright band, no hiss.
//   - a rare piano note: the real sampled grand, soft and dark, through a
//     long quiet reverb (the samples themselves are short: the reverb is
//     the tail).
// Near the lake and over the sea a low wash is added; in flight the air rises
// a little. Birds, crickets and the bright "grass" band are gone: synthesised
// they sounded like a synthesiser, and nothing is better than that.
// Everything goes through one bus that only ever fades (mute, hidden tab,
// scene inactive), then a gentle low-pass and a safety limiter.
// It starts on the first gesture (browsers require one); the mute choice is
// remembered.

const KEY = "ag-ambience";
let muted = false;
try {
  if (typeof window !== "undefined") muted = window.localStorage.getItem(KEY) === "0";
} catch {
  /* storage blocked */
}

type Scene = { night: number; water: number; speed: number; boost: number; active: boolean };
const scene: Scene = { night: 0, water: 0, speed: 0, boost: 0, active: true };

const DEV = process.env.NODE_ENV !== "production";

// Linear gains, calibrated by measurement (see the numbers in __amb.render).
const LEVEL = {
  wind: 0.3, // about -31 dBFS RMS on average, gusts a few dB either side
  air: 0.2, // flight, at full speed: about -31 dBFS on its own
  water: 0.12, // at water = 1: about -38 dBFS on its own
  piano: 0.085, // a note peaks near -25 dBFS
  wet: 1, // reverb return for the piano
};
const FADE_IN = 0.7; // time constants (s) of the bus fade: about 3 s to settle
const FADE_OUT = 0.28; // about 1.2 s
const LOOP = 19; // seconds of noise; the loop is cross-faded, so it has no seam
const XFADE = 2;

// A value that wanders: every few seconds it leans toward a new random target
// and never arrives abruptly (setTargetAtTime only). Several params can share
// one wander so a gust is both louder and a little brighter.
type Drift = {
  to: { param: AudioParam; lo: number; hi: number }[];
  minGap: number;
  maxGap: number;
  skew: number; // > 1: mostly calm, now and then a swell
  until: number;
};
function drift(to: Drift["to"], minGap: number, maxGap: number, skew = 1): Drift {
  to.forEach(({ param, lo, hi }) => (param.value = lo + (hi - lo) * 0.35));
  return { to, minGap, maxGap, skew, until: 0 };
}
function runDrift(d: Drift, now: number, horizon: number) {
  let t = Math.max(d.until, now);
  while (t < horizon) {
    const gap = d.minGap + Math.random() * (d.maxGap - d.minGap);
    const u = Math.pow(Math.random(), d.skew);
    d.to.forEach(({ param, lo, hi }) => param.setTargetAtTime(lo + (hi - lo) * u, t, gap * 0.4));
    t += gap;
  }
  d.until = t;
}

// Stereo pink noise that loops without a seam: LOOP + XFADE seconds are
// generated and the extra tail is cross-faded (equal power) into the head, so
// the last sample runs straight into the first. Left and right share most of
// the signal (correlation 0.6): wide, not hollow.
function noiseBuffer(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * LOOP);
  const x = Math.floor(sr * XFADE);
  const pink = () => {
    const d = new Float32Array(n + x);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let sum = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      const v = b0 + b1 + b2 + w * 0.1848;
      d[i] = v;
      sum += v * v;
    }
    // fold the tail into the head, then normalise to a known level
    for (let i = 0; i < x; i++) {
      const a = (i / x) * Math.PI * 0.5;
      d[i] = d[i] * Math.sin(a) + d[n + i] * Math.cos(a);
    }
    const k = 0.2 / Math.sqrt(sum / d.length);
    for (let i = 0; i < n; i++) d[i] *= k;
    return d;
  };
  const a = pink();
  const b = pink();
  const buf = ctx.createBuffer(2, n, sr);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    l[i] = (a[i] + 0.5 * b[i]) * 0.894;
    r[i] = (a[i] - 0.5 * b[i]) * 0.894;
  }
  return buf;
}

// A room that isn't there: 4 s of decaying noise that darkens as it fades,
// with a short pre-delay and a soft onset so it never slaps.
function impulse(ctx: BaseAudioContext) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 4);
  const pre = Math.floor(sr * 0.022);
  const rise = Math.floor(sr * 0.04);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      // one-pole low-pass sliding from about 3.6 kHz down to 900 Hz
      const fc = 900 + 2700 * Math.exp(-t * 1.2);
      const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp += k * (Math.random() * 2 - 1 - lp);
      const onset = Math.min(1, (i - pre) / rise);
      d[i] = lp * onset * Math.exp(-t * 0.85); // about 7 dB a second, plus the darkening
    }
    // end exactly on silence
    const tail = Math.floor(sr * 1.2);
    for (let i = 0; i < tail; i++) d[len - 1 - i] *= i / tail;
  }
  return buf;
}

function lowpass(ctx: BaseAudioContext, f: number, q = 0.6) {
  const b = ctx.createBiquadFilter();
  b.type = "lowpass";
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}
function highpass(ctx: BaseAudioContext, f: number) {
  const b = ctx.createBiquadFilter();
  b.type = "highpass";
  b.frequency.value = f;
  b.Q.value = 0.6;
  return b;
}
function gainNode(ctx: BaseAudioContext, v: number) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}
function loop(ctx: BaseAudioContext, buf: AudioBuffer, rate: number, offset: number) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.playbackRate.value = rate;
  s.start(0, offset);
  return s;
}

type Rig = {
  ctx: BaseAudioContext;
  out: GainNode; // the bus: 0 or 1, only ever faded
  master: AudioNode; // after the low-pass, limiter and trim
  wind: GainNode;
  gust: GainNode;
  windLp: BiquadFilterNode[];
  air: GainNode;
  airLp: BiquadFilterNode[];
  water: GainNode;
  swell: GainNode;
  piano: GainNode; // send notes here (playPiano's `to`)
  soft: BiquadFilterNode; // the piano after its low-pass (dry)
  wet: GainNode;
  limiter: DynamicsCompressorNode;
  drifts: Drift[];
  sources: AudioBufferSourceNode[];
};

// The whole graph, on any context (the live one, or an OfflineAudioContext
// for measuring), ending at `dest`.
function build(ctx: BaseAudioContext, dest: AudioNode): Rig {
  const noise = noiseBuffer(ctx);

  // bus -> gentle low-pass -> safety limiter -> trim -> out
  const out = gainNode(ctx, 0);
  const top = lowpass(ctx, 6500, 0.5);
  const limiter = ctx.createDynamicsCompressor();
  const threshold = -14;
  const ratio = 20;
  limiter.threshold.value = threshold;
  limiter.knee.value = 0;
  limiter.ratio.value = ratio;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.25;
  // the browser's compressor adds make-up gain of its own (0.6 of the full
  // range reduction, in dB); take it back out so the node is only a ceiling
  const makeup = -0.6 * threshold * (1 - 1 / ratio);
  const master = gainNode(ctx, Math.pow(10, -makeup / 20));
  out.connect(top).connect(limiter).connect(master).connect(dest);

  // wind: pink noise between a 90 Hz high-pass and a 24 dB/oct low-pass that
  // drifts between about 300 and 620 Hz with the gusts
  const windSrc = loop(ctx, noise, 1, 0);
  const windLp = [lowpass(ctx, 400), lowpass(ctx, 400)];
  const gust = gainNode(ctx, 0.6);
  const wind = gainNode(ctx, LEVEL.wind);
  windSrc.connect(highpass(ctx, 90)).connect(windLp[0]).connect(windLp[1]).connect(gust).connect(wind).connect(out);
  const gusts = drift(
    [
      { param: gust.gain, lo: 0.45, hi: 1.05 },
      { param: windLp[0].frequency, lo: 300, hi: 620 },
      { param: windLp[1].frequency, lo: 300, hi: 620 },
    ],
    5,
    12,
    1.5,
  );

  // flight: the same air, a little higher, rising with speed (silent on foot)
  const airSrc = loop(ctx, noise, 1.13, 7.3);
  const airLp = [lowpass(ctx, 520), lowpass(ctx, 520)];
  const air = gainNode(ctx, 0);
  airSrc.connect(highpass(ctx, 140)).connect(airLp[0]).connect(airLp[1]).connect(air).connect(out);

  // water: a low wash that breathes slowly, only near the lake and over the sea
  const waterSrc = loop(ctx, noise, 0.83, 12.9);
  const swell = gainNode(ctx, 0.6);
  const water = gainNode(ctx, 0);
  waterSrc
    .connect(highpass(ctx, 130))
    .connect(lowpass(ctx, 480))
    .connect(lowpass(ctx, 900))
    .connect(swell)
    .connect(water)
    .connect(out);
  const swells = drift([{ param: swell.gain, lo: 0.35, hi: 1.1 }], 3.2, 6.5, 1.2);

  // piano: darkened like a soft touch, dry plus a long quiet reverb
  const piano = gainNode(ctx, 1);
  const soft = lowpass(ctx, 2300, 0.5);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx);
  const wet = gainNode(ctx, LEVEL.wet);
  piano.connect(soft);
  soft.connect(out);
  soft.connect(verb).connect(wet).connect(out);

  return {
    ctx,
    out,
    master,
    wind,
    gust,
    windLp,
    air,
    airLp,
    water,
    swell,
    piano,
    soft,
    wet,
    limiter,
    drifts: [gusts, swells],
    sources: [windSrc, airSrc, waterSrc],
  };
}

// Layer levels from the scene. Every change is a slow lean toward a target.
function levels(r: Rig, s: Scene, t: number) {
  const night = Math.min(1, Math.max(0, s.night));
  const fly = Math.min(1, Math.max(0, s.speed) / 16);
  const boost = Math.min(1, Math.max(0, s.boost));
  // the wind settles a little after dark
  r.wind.gain.setTargetAtTime(LEVEL.wind * (1 - 0.15 * night), t, 2.5);
  // air: rises with speed, swells a touch through a streak
  r.air.gain.setTargetAtTime(LEVEL.air * fly * fly * (1 + 0.5 * boost), t, 0.5);
  const fc = 480 + fly * 520 + boost * 220;
  r.airLp.forEach((f) => f.frequency.setTargetAtTime(fc, t, 0.5));
  r.water.gain.setTargetAtTime(LEVEL.water * Math.min(1, Math.max(0, s.water)), t, 1.2);
}

let rig: Rig | null = null;
let running = false;
let timer = 0;
let nextNote = 0;
let wasOn = false;
const listeners = new Set<() => void>();

// D-flat major pentatonic in the octave and a half below middle E. Only this
// register: the samples from F#4 up are cut short, these ring for seconds.
const SCALE = [49, 51, 53, 56, 58, 61, 63];
const ROOTS = [37, 44];
let lastIdx = 4;
function pianoVoice(midi: number, level: number, when = 0) {
  if (!rig) return;
  // the fade ends before the sample does
  playPiano(midi, { to: rig.piano, gain: LEVEL.piano * level, attack: 0.012, dur: 4.5, release: 3.4, when });
}
function pianoNote() {
  // a short step from the last note, sometimes a low root under it, now and
  // then a second note answering
  lastIdx = Math.min(SCALE.length - 1, Math.max(0, lastIdx + Math.floor(Math.random() * 5) - 2));
  pianoVoice(SCALE[lastIdx], 0.8 + Math.random() * 0.2);
  if (Math.random() < 0.3) pianoVoice(ROOTS[Math.floor(Math.random() * ROOTS.length)], 0.6, 0.03);
  if (Math.random() < 0.2) {
    const up = SCALE[Math.min(SCALE.length - 1, lastIdx + 2)];
    if (up !== SCALE[lastIdx]) pianoVoice(up, 0.55, 1.8 + Math.random() * 1.2);
  }
}

const isOn = () => running && !muted && scene.active && document.visibilityState === "visible";

function tick() {
  const r = rig;
  if (!r) return;
  const t = r.ctx.currentTime;
  const on = isOn();
  r.out.gain.setTargetAtTime(on ? 1 : 0, t, on ? FADE_IN : FADE_OUT);
  levels(r, scene, t);
  // keep a minute of gusts scheduled ahead
  r.drifts.forEach((d) => {
    if (d.until < t + 30) runDrift(d, t, t + 90);
  });
  const now = performance.now();
  // coming back from silence: no note until the bed has settled
  if (on && !wasOn) nextNote = Math.max(nextNote, now + 7000 + Math.random() * 5000);
  wasOn = on;
  if (!on) return;
  if (now > nextNote) {
    // the piano bed rests while his own music is playing (flight or a record)
    if (scene.speed < 1 && !music.playing) pianoNote();
    nextNote = now + 16000 + Math.random() * 20000;
  }
}

const onVisibility = () => tick();

// Fade out and let go of a rig (hot reload in development would otherwise
// leave the old module's wind playing under the new one). Returns whether it
// was playing, so the module that replaces it can carry on.
function dispose() {
  if (typeof window === "undefined") return false;
  const was = running;
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisibility);
  running = false;
  const r = rig;
  rig = null;
  if (!r) return was;
  delete (window as AmbWindow).__amb;
  r.out.gain.setTargetAtTime(0, r.ctx.currentTime, 0.1);
  window.setTimeout(() => {
    r.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    r.master.disconnect();
  }, 1200);
  return was;
}

type AmbWindow = Window & { __ambDispose?: () => boolean; __amb?: unknown };

// Call from the first user gesture. Safe to call again.
export function startAmbience() {
  if (typeof window === "undefined" || typeof AudioContext === "undefined" || running) return;
  try {
    resumeAudio();
    if (!rig) {
      const { ctx } = audioGraph();
      rig = build(ctx, ctx.destination);
      preloadPiano(36, 64);
      if (DEV) devHook(rig);
    }
    running = true;
    wasOn = false;
    nextNote = performance.now() + 9000 + Math.random() * 6000;
    timer = window.setInterval(tick, 200);
    // a hidden tab throttles timers: fade at once when the page is hidden
    document.addEventListener("visibilitychange", onVisibility);
    tick();
  } catch {
    rig = null;
    running = false;
  }
}

export function stopAmbience() {
  if (typeof window === "undefined") return;
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisibility);
  running = false;
  wasOn = false;
  rig?.out.gain.setTargetAtTime(0, rig.ctx.currentTime, FADE_OUT);
}

if (typeof window !== "undefined") {
  const w = window as AmbWindow;
  const was = w.__ambDispose?.();
  w.__ambDispose = dispose;
  // hot reload: the gesture has already happened, so pick up where it left off
  if (was) window.setTimeout(startAmbience, 0);
}

// What the scene is doing, written once a frame (cheap: plain numbers).
export function ambienceScene(s: Partial<Scene>) {
  const active = scene.active;
  Object.assign(scene, s);
  // going inactive (or back) starts its fade now, not on the next tick
  if (scene.active !== active) tick();
}

export const ambienceMuted = () => muted;
export function setAmbienceMuted(m: boolean) {
  muted = m;
  try {
    window.localStorage.setItem(KEY, m ? "0" : "1");
  } catch {
    /* ignore */
  }
  tick();
  listeners.forEach((l) => l());
}
export function onAmbienceChange(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// ---------------------------------------------------------------------------
// Development only: window.__amb, for inspecting and measuring the graph from
// the console (never present in a production build).
//
//   __amb.ctx                 the shared AudioContext
//   __amb.state()             { ctx: "running" | "suspended", running, muted, on, scene }
//   __amb.gains()             current value of every level/cutoff param in the graph
//   __amb.nodes               the rig's AudioNodes (out = the bus, master = final node)
//   __amb.analyser            AnalyserNode on the final output (after the limiter)
//   __amb.taps                AnalyserNodes per layer, before the bus: wind, air, water, piano
//   await __amb.meter(n?)     n snapshots (0.68 s each) -> { master, wind, air, water, piano }
//                             each { rms, peak } in dBFS
//   await __amb.render(sec, scene?, opts?)
//                             the noise layers through the same graph in an
//                             OfflineAudioContext -> { sampleRate, left, right }
//                             (Float32Array); opts.events = [{ at, on }] fades the
//                             bus exactly as mute / hide / inactive do, opts.raw
//                             skips the bus fade-in (bus held at 1)
//   __amb.note(midi?)         play one bed note now (through the reverb)
//   __amb.mute(bool)          same as the speaker button (setAmbienceMuted)
//   __amb.scene({...})        same as ambienceScene (Room rewrites all but `active` every frame)
//   __amb.LEVEL               the calibration constants
// ---------------------------------------------------------------------------
function devHook(r: Rig) {
  const ctx = r.ctx as AudioContext;
  const tap = (from: AudioNode) => {
    const a = ctx.createAnalyser();
    a.fftSize = 32768;
    from.connect(a);
    return a;
  };
  const analyser = tap(r.master);
  const pianoSum = gainNode(ctx, 1);
  // the piano as it reaches the bus: dry (after the soft low-pass) plus reverb
  r.soft.connect(pianoSum);
  r.wet.connect(pianoSum);
  const taps = { wind: tap(r.wind), air: tap(r.air), water: tap(r.water), piano: tap(pianoSum) };
  const db = (v: number) => (v > 0 ? Math.round(200 * Math.log10(v)) / 10 : -Infinity);
  const read = (a: AnalyserNode, acc: { sum: number; n: number; peak: number }) => {
    const d = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(d);
    for (let i = 0; i < d.length; i++) {
      acc.sum += d[i] * d[i];
      acc.peak = Math.max(acc.peak, Math.abs(d[i]));
    }
    acc.n += d.length;
  };
  const all: Record<string, AnalyserNode> = { master: analyser, ...taps };
  (window as AmbWindow).__amb = {
    ctx,
    LEVEL,
    nodes: r,
    analyser,
    taps,
    state: () => ({ ctx: ctx.state, running, muted, on: isOn(), scene: { ...scene } }),
    gains: () => ({
      out: r.out.gain.value,
      wind: r.wind.gain.value,
      gust: r.gust.gain.value,
      windCutoff: r.windLp[0].frequency.value,
      air: r.air.gain.value,
      airCutoff: r.airLp[0].frequency.value,
      water: r.water.gain.value,
      swell: r.swell.gain.value,
      pianoWet: r.wet.gain.value,
      limiterReduction: r.limiter.reduction,
    }),
    meter: async (n = 4) => {
      const acc: Record<string, { sum: number; n: number; peak: number }> = {};
      Object.keys(all).forEach((k) => (acc[k] = { sum: 0, n: 0, peak: 0 }));
      for (let i = 0; i < n; i++) {
        await new Promise((res) => setTimeout(res, 700));
        Object.entries(all).forEach(([k, a]) => read(a, acc[k]));
      }
      const res: Record<string, { rms: number; peak: number }> = {};
      Object.entries(acc).forEach(([k, v]) => (res[k] = { rms: db(Math.sqrt(v.sum / v.n)), peak: db(v.peak) }));
      return res;
    },
    render: async (
      seconds = 20,
      s: Partial<Scene> = {},
      opts: { events?: { at: number; on: boolean }[]; raw?: boolean } = {},
    ) => {
      const off = new OfflineAudioContext(2, Math.floor(48000 * seconds), 48000);
      const o = build(off, off.destination);
      const sc = { ...scene, ...s };
      levels(o, sc, 0);
      // the scene is constant for the render: start at its levels
      o.wind.gain.value = LEVEL.wind * (1 - 0.15 * Math.min(1, Math.max(0, sc.night)));
      const fly = Math.min(1, Math.max(0, sc.speed) / 16);
      o.air.gain.value = LEVEL.air * fly * fly * (1 + 0.5 * Math.min(1, Math.max(0, sc.boost)));
      o.water.gain.value = LEVEL.water * Math.min(1, Math.max(0, sc.water));
      o.drifts.forEach((d) => runDrift(d, 0, seconds));
      if (opts.raw) o.out.gain.value = 1;
      else o.out.gain.setTargetAtTime(1, 0, FADE_IN);
      (opts.events ?? []).forEach((e) => o.out.gain.setTargetAtTime(e.on ? 1 : 0, e.at, e.on ? FADE_IN : FADE_OUT));
      const buf = await off.startRendering();
      return { sampleRate: buf.sampleRate, left: buf.getChannelData(0), right: buf.getChannelData(1) };
    },
    note: (midi?: number) => (midi ? pianoVoice(midi, 1) : pianoNote()),
    mute: setAmbienceMuted,
    scene: ambienceScene,
  };
}
