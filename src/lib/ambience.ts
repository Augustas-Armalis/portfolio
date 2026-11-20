import {
  audioGraph,
  audioHushed,
  channel,
  compressorGain,
  MIX,
  music,
  onMuteChange,
  resumeAudio,
  sceneMuted,
  setSceneMuted,
  track,
  voice,
  voicePlay,
  voiceRoute,
  voiceStop,
  type Voice,
} from "@/lib/audio";
import { playPiano, preloadPiano } from "@/lib/piano";

// The sound of the place itself, kept very quiet: the whole bed sits about
// 20 dB under the music (a tenth of its level), and leans further back while
// music plays.
//   - wind: pink noise between a 90 Hz high-pass and low-passes that drift
//     with long, slow gusts; each place gives it a level and a colour.
//   - birds: one forest recording (CC0, see CREDITS.md), very quiet, by day
//     only, a little nearer in wooded places. Filtered to the band the birds
//     live in (see BIRDS below). Streamed through two <audio> elements that
//     hand over to each other; only fetched where there are birds.
//   - water: slow swells of shaped brown noise, over the seas and a little at
//     the lake's shore.
//   - a rare piano note: the real sampled grand, soft and dark, through a
//     long quiet reverb (the samples are short: the reverb is the tail).
//   - in flight the air rises a little with speed.
// No crickets, no meadow recording.
// Everything goes through one bus that only ever fades (mute, hidden tab,
// scene inactive), a duck under the music, a gentle low-pass and a limiter,
// into the "ambience" channel of the audio manager (lib/audio.ts).
// It starts on the first gesture (browsers require one); the mute choice is
// remembered. Every change of place, hour or level is a lean of 2-3 seconds.
//
// What the scene tells it, once a frame, through ambienceScene({...}):
//   night   0..1   how dark it is (lower, darker wind; no birds)
//   water   0..1   how near open water the listener is
//   speed   m/s    the plane's speed (0 on foot)
//   boost   0..1   a streak of speed
//   active  bool   false while the OS is on screen
//   place   "meadow" | "forest" | "sea" | "sky" | "none"   (optional)
//   world   string (optional) a flight world id (worlds/voyage.ts)
// A painted world has a bed of its own (BEDS); at home, and for a world
// without an entry, the place decides. Fields that are left out keep their
// last value.

export type Place = "meadow" | "forest" | "sea" | "sky" | "none";
// `minimal` (phones): only the wind, at a low level. No birds, no water, no piano notes, and the files for
// them are never fetched.
type Scene = { night: number; water: number; speed: number; boost: number; active: boolean; place?: Place; world?: string; minimal?: boolean };
const MINIMAL_WIND = 0.55; // about 5 dB under the desk's ordinary wind
const scene: Scene = { night: 0, water: 0, speed: 0, boost: 0, active: true };

// One row per place. Levels are shares of the calibrated full level (LEVEL).
type Bed = {
  wind: number; // level
  tone: number; // colour: the wind's upper cutoff in Hz (low = dark)
  birds: number; // 0 = none; 1 = as near as they get (day only)
  water: number; // swells that are always there
  shore: number; // swells that come with nearness to water (scene.water)
  piano: boolean; // the rare bed note may sound here
};
const BEDS: Record<string, Bed> = {
  // home
  desk: { wind: 1, tone: 620, birds: 0.55, water: 0, shore: 0.3, piano: true }, // soft wind, distant birds
  avenue: { wind: 0.9, tone: 540, birds: 1, water: 0, shore: 0.2, piano: false }, // the wood: birds a touch closer
  // the painted worlds
  sun: { wind: 0.8, tone: 820, birds: 0, water: 0, shore: 0, piano: false }, // high bright air
  stars: { wind: 0.5, tone: 240, birds: 0, water: 0, shore: 0, piano: true }, // very low dark wind, nothing else
  rex: { wind: 0.65, tone: 380, birds: 0, water: 0.7, shore: 0, piano: false }, // swells under a dim sky
  fairy: { wind: 0.7, tone: 700, birds: 0.4, water: 0, shore: 0, piano: false }, // light air, a few far birds
  paradise: { wind: 0.6, tone: 760, birds: 0.8, water: 0.25, shore: 0, piano: false }, // day birds over still water
  gate: { wind: 0.85, tone: 480, birds: 0.9, water: 0, shore: 0, piano: false }, // the wooded mountain
  sea: { wind: 0.5, tone: 440, birds: 0, water: 1, shore: 0, piano: true }, // slow swells, no birds
  kings: { wind: 0.3, tone: 200, birds: 0, water: 0, shore: 0, piano: true }, // the night wood: almost nothing, a low breath, a rare deep note
  // a place without a world of its own
  sky: { wind: 1, tone: 760, birds: 0, water: 0, shore: 0.3, piano: false },
  none: { wind: 0.35, tone: 260, birds: 0, water: 0, shore: 0, piano: false },
};
const PLACE_BED: Record<Place, string> = { meadow: "desk", forest: "avenue", sea: "sea", sky: "sky", none: "none" };
const WORLD_BED: Record<string, string> = { home: "", desk: "desk", road: "desk", forest: "avenue" };
function bedOf(s: Scene): string {
  if (s.world) {
    const k = WORLD_BED[s.world] ?? s.world;
    if (k && BEDS[k]) return k;
  }
  return PLACE_BED[s.place ?? "meadow"] ?? "desk";
}

const FOREST = "/assets/ambience/forest-birds.mp3";

const DEV = process.env.NODE_ENV !== "production";

// The reference: a recording at full scale is about -22 dBFS RMS (measured
// offline, see FILE_TRIM in lib/audio.ts). The bed's target is a tenth of
// that, about -42 dBFS. Linear gains below; the level each one gives was
// measured by rendering the layer alone in an OfflineAudioContext
// (__amb.mix() repeats the measurement for whatever is playing).
const LEVEL = {
  wind: 0.08, // desk by day: about -42 dBFS RMS averaged over the gusts (-41 to -43)
  air: 0.06, // flight: about -42 dBFS at full speed in ordinary air, -49 at a cruise
  water: 0.2, // open sea: about -42 dBFS averaged over the swells
  piano: 0.03, // a bed note peaks near -34 dBFS (the samples peak at -3)
  wet: 0.8, // reverb return for the piano
  birds: 2, // +6 dB at their nearest: about -49.5 dBFS RMS, phrases near -44
};
// The forest recording, measured offline (afconvert to PCM, whole file):
//   as it is: -49.7 dBFS RMS; its quietest tenth is -55.5 dBFS and that floor
//   lies below 2 kHz (rumble, about -62 dBFS per octave) and above 6 kHz
//   (hiss, flat near -70 dBFS per band, the same in quiet and loud passages:
//   nothing but noise). The birds are between 1 and 6 kHz.
//   So: 24 dB/oct high-pass at 900 Hz, 24 dB/oct low-pass at 4.2-5.6 kHz
//   (nearer birds are brighter). After that: -55.5 dBFS RMS (-56.0 at
//   4.2 kHz), floor -61, bird phrases (95th percentile of 1 s windows) -50.
//   With at most +6 dB of gain the floor stays under -55 dBFS, well beneath
//   the wind. The last seconds of the file hold a click (its only peak above
//   -20 dBFS): the hand-over ends before it.
const BIRDS = { hp: 900, lpFar: 4200, lpNear: 5600, rmsFar: -56, rmsNear: -55.5 };
const DUCK = 0.5; // the bed under music: -6 dB
const DUCK_IN = 0.5; // time constants (s): about 1.5 s down
const DUCK_OUT = 0.9; // about 2.7 s back up
const LEAN = 0.9; // every layer's lean toward a new level: about 2.7 s
const FOREST_X = 3; // seconds the forest's two passes overlap
const FOREST_END = 3.5; // seconds left unplayed at the end of the file
const FADE_IN = 0.7; // time constants (s) of the bus fade: about 2 s to settle
const FADE_OUT = 0.3; // about 1 s
const LOOP = 23; // seconds of noise; the loop is cross-faded, so it has no seam
const XFADE = 2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

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

// The sea: one swell every 9 to 14 seconds. It gathers over the first third
// (louder and a little brighter as it comes in) and draws back over the rest.
type Swell = { level: AudioParam; tone: AudioParam; until: number };
function runSwell(w: Swell, now: number, horizon: number) {
  let t = Math.max(w.until, now);
  while (t < horizon) {
    const period = 9 + Math.random() * 5;
    const peak = 0.7 + Math.random() * 0.4;
    const rise = period * 0.36;
    w.level.setTargetAtTime(peak, t, rise / 3);
    w.tone.setTargetAtTime(300 + 420 * peak, t, rise / 3);
    w.level.setTargetAtTime(0.2, t + rise, (period - rise) / 3);
    w.tone.setTargetAtTime(260, t + rise, (period - rise) / 3);
    t += period;
  }
  w.until = t;
}

// Stereo noise that loops without a seam: LOOP + XFADE seconds are generated
// and the extra tail is cross-faded (equal power) into the head, so the last
// sample runs straight into the first. Left and right share most of the
// signal (correlation 0.6): wide, not hollow. Pink for the air, brown (6 dB
// an octave darker) for the water.
function noiseBuffer(ctx: BaseAudioContext, kind: "pink" | "brown") {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * LOOP);
  const x = Math.floor(sr * XFADE);
  const make = () => {
    const d = new Float32Array(n + x);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let br = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") {
        // a leaky integrator: no drift, nothing below about 12 Hz
        br = 0.9985 * br + w * 0.04;
        d[i] = br;
      } else {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = b0 + b1 + b2 + w * 0.1848;
      }
    }
    // fold the tail into the head, then normalise to a known level
    for (let i = 0; i < x; i++) {
      const a = (i / x) * Math.PI * 0.5;
      d[i] = d[i] * Math.sin(a) + d[n + i] * Math.cos(a);
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += d[i] * d[i];
    const k = 0.2 / Math.sqrt(sum / n);
    for (let i = 0; i < n; i++) d[i] *= k;
    return d;
  };
  const a = make();
  const b = make();
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
  duck: GainNode; // 1, or DUCK while music plays
  master: GainNode; // after the low-pass, limiter and trim
  wind: GainNode;
  gust: GainNode;
  windLp: BiquadFilterNode[];
  windTone: BiquadFilterNode; // the place's colour
  air: GainNode;
  airLp: BiquadFilterNode[];
  water: GainNode;
  swell: GainNode;
  swellLp: BiquadFilterNode;
  piano: GainNode; // send notes here (playPiano's `to`)
  soft: BiquadFilterNode; // the piano after its low-pass (dry)
  wet: GainNode;
  limiter: DynamicsCompressorNode;
  birds: GainNode; // the forest voices arrive here
  birdsLp: BiquadFilterNode[];
  birdsOut: AudioNode; // the birds after their filters
  drifts: Drift[];
  swells: Swell;
  sources: AudioBufferSourceNode[];
};

// The ceiling of the bed: a bird calling close to the microphone, or a note
// over a gust, is leaned on instead of standing out.
const LIMIT = { threshold: -28, knee: 6, ratio: 10, attack: 0.003, release: 0.25 };

// The whole graph, on any context (the live one, or an OfflineAudioContext
// for measuring), ending at `dest`.
function build(ctx: BaseAudioContext, dest: AudioNode): Rig {
  const pink = noiseBuffer(ctx, "pink");
  const brown = noiseBuffer(ctx, "brown");

  // bus -> duck -> gentle low-pass -> limiter -> trim -> out
  const out = gainNode(ctx, 0);
  const duck = gainNode(ctx, 1);
  const top = lowpass(ctx, 6500, 0.5);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMIT.threshold;
  limiter.knee.value = LIMIT.knee;
  limiter.ratio.value = LIMIT.ratio;
  limiter.attack.value = LIMIT.attack;
  limiter.release.value = LIMIT.release;
  // the browser's compressor adds make-up gain of its own: take it back out
  // (the hard-knee formula first, the measured figure when it arrives)
  const master = gainNode(ctx, Math.pow(10, (0.6 * LIMIT.threshold * (1 - 1 / LIMIT.ratio)) / 20));
  void compressorGain(LIMIT).then((k) => {
    if (!k) return;
    if (ctx.currentTime === 0) master.gain.value = 1 / k;
    else master.gain.setTargetAtTime(1 / k, ctx.currentTime, 0.05);
  });
  out.connect(duck).connect(top).connect(limiter).connect(master).connect(dest);

  // wind: pink noise between a 90 Hz high-pass and a 24 dB/oct low-pass that
  // drifts between about 300 and 620 Hz with long gusts, then the place's
  // own colour (a third low-pass)
  const windSrc = loop(ctx, pink, 1, 0);
  const windLp = [lowpass(ctx, 400), lowpass(ctx, 400)];
  const windTone = lowpass(ctx, BEDS.desk.tone, 0.5);
  const gust = gainNode(ctx, 0.6);
  const wind = gainNode(ctx, 0);
  windSrc.connect(highpass(ctx, 90)).connect(windLp[0]).connect(windLp[1]).connect(windTone).connect(gust).connect(wind).connect(out);
  const gusts = drift(
    [
      { param: gust.gain, lo: 0.5, hi: 1 },
      { param: windLp[0].frequency, lo: 300, hi: 620 },
      { param: windLp[1].frequency, lo: 300, hi: 620 },
    ],
    9,
    20,
    1.5,
  );

  // flight: the same air, a little higher, rising with speed (silent on foot)
  const airSrc = loop(ctx, pink, 1.13, 7.3);
  const airLp = [lowpass(ctx, 520), lowpass(ctx, 520)];
  const air = gainNode(ctx, 0);
  airSrc.connect(highpass(ctx, 140)).connect(airLp[0]).connect(airLp[1]).connect(air).connect(out);

  // water: brown noise, a low-pass that opens as each swell comes in
  const waterSrc = loop(ctx, brown, 1, 12.9);
  const swellLp = lowpass(ctx, 300, 0.5);
  const swell = gainNode(ctx, 0.3);
  const water = gainNode(ctx, 0);
  waterSrc.connect(highpass(ctx, 55)).connect(swellLp).connect(lowpass(ctx, 1400, 0.5)).connect(swell).connect(water).connect(out);
  const swells: Swell = { level: swell.gain, tone: swellLp.frequency, until: 0 };

  // piano: darkened like a soft touch, dry plus a long quiet reverb
  const piano = gainNode(ctx, 1);
  const soft = lowpass(ctx, 2300, 0.5);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx);
  const wet = gainNode(ctx, LEVEL.wet);
  piano.connect(soft);
  soft.connect(out);
  soft.connect(verb).connect(wet).connect(out);

  // birds: the forest recording between its rumble and its hiss
  const birds = gainNode(ctx, 0);
  const birdsLp = [lowpass(ctx, BIRDS.lpFar, 0.707), lowpass(ctx, BIRDS.lpFar, 0.707)];
  const hp = [highpass(ctx, BIRDS.hp), highpass(ctx, BIRDS.hp)];
  hp.forEach((f) => (f.Q.value = 0.707));
  birds.connect(hp[0]).connect(hp[1]).connect(birdsLp[0]).connect(birdsLp[1]).connect(out);

  return {
    ctx,
    out,
    duck,
    master,
    wind,
    gust,
    windLp,
    windTone,
    air,
    airLp,
    water,
    swell,
    swellLp,
    piano,
    soft,
    wet,
    limiter,
    birds,
    birdsLp,
    birdsOut: birdsLp[1],
    drifts: [gusts],
    swells,
    sources: [windSrc, airSrc, waterSrc],
  };
}

// Where every layer is heading for a scene: plain numbers, so the same table
// drives the live graph, the offline measurement and the mix report.
function targets(s: Scene) {
  const key = bedOf(s);
  const b = BEDS[key];
  const night = clamp01(s.night);
  const fly = clamp01(Math.max(0, s.speed) / 16);
  const boost = clamp01(s.boost);
  // birds are a thing of the day: gone by dusk, back after dawn
  const day = 1 - smooth(0.3, 0.6, night);
  if (s.minimal)
    return {
      key,
      wind: LEVEL.wind * b.wind * (1 - 0.45 * night) * MINIMAL_WIND,
      windTone: b.tone * (1 - 0.3 * night),
      air: LEVEL.air * b.wind * fly * fly * MINIMAL_WIND,
      airTone: 480 + fly * 420,
      water: 0,
      birds: 0,
      birdsTone: BIRDS.lpFar,
      day,
      piano: false,
    };
  return {
    key,
    // the wind settles and darkens after dark
    wind: LEVEL.wind * b.wind * (1 - 0.45 * night),
    windTone: b.tone * (1 - 0.3 * night),
    // air: rises with speed, swells a touch through a streak; thin air
    // (the stars) carries less of it
    air: LEVEL.air * b.wind * fly * fly * (1 + 0.5 * boost),
    airTone: 480 + fly * 520 + boost * 220,
    water: LEVEL.water * Math.max(b.water, b.shore * clamp01(s.water)),
    // thinner from a plane
    birds: LEVEL.birds * b.birds * day * (1 - 0.35 * fly),
    birdsTone: BIRDS.lpFar + (BIRDS.lpNear - BIRDS.lpFar) * b.birds,
    day,
    piano: b.piano,
  };
}

// Lean every layer toward its target (or put it there at once, for a render).
function levels(r: Rig, s: Scene, t: number, now = false) {
  const g = targets(s);
  const to = (p: AudioParam, v: number, tc: number) => (now ? (p.value = v) : p.setTargetAtTime(v, t, tc));
  to(r.wind.gain, g.wind, LEAN);
  to(r.windTone.frequency, g.windTone, LEAN);
  to(r.air.gain, g.air, 0.6);
  r.airLp.forEach((f) => to(f.frequency, g.airTone, 0.6));
  to(r.water.gain, g.water, LEAN);
  to(r.birds.gain, g.birds, LEAN);
  r.birdsLp.forEach((f) => to(f.frequency, g.birdsTone, LEAN));
  return g;
}

let rig: Rig | null = null;
let running = false;
let timer = 0;
let nextNote = 0;
let wasOn = false;
let held = false; // development: the scene is being driven by hand
let lastMusic = -1e9; // performance.now() when music was last playing
const DUCK_HOLD = 800; // ms the bed waits after the music stops before it returns
function ducked() {
  const now = performance.now();
  if (music.playing) lastMusic = now;
  return now - lastMusic < DUCK_HOLD;
}

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
  if (Math.random() < 0.2) pianoVoice(ROOTS[Math.floor(Math.random() * ROOTS.length)], 0.6, 0.03);
  if (Math.random() < 0.12) {
    const up = SCALE[Math.min(SCALE.length - 1, lastIdx + 2)];
    if (up !== SCALE[lastIdx]) pianoVoice(up, 0.55, 1.8 + Math.random() * 1.2);
  }
}

const isOn = () => running && !sceneMuted() && scene.active && document.visibilityState === "visible";

// The birds: two streaming elements taking turns, the next starting FOREST_X
// seconds before the current one is let go. Only created where there are
// birds, and only by day.
const forest = { on: false, cur: 0 };
function forestVoices(r: Rig): [Voice, Voice] | null {
  const o = { channel: "ambience", scene: true } as const;
  const a = voice("forest-a", o);
  const b = voice("forest-b", o);
  if (!a || !b) return null;
  voiceRoute(a, r.birds);
  voiceRoute(b, r.birds);
  return [a, b];
}
function forestTick(r: Rig, want: boolean) {
  if (!want && !forest.on) return;
  const v = forestVoices(r);
  if (!v) return;
  if (!want) {
    forest.on = false;
    v.forEach((x) => voiceStop(x, 3));
    return;
  }
  const cur = v[forest.cur];
  if (!forest.on) {
    forest.on = true;
    if (!cur.el.getAttribute("src")) cur.el.src = FOREST;
    voicePlay(cur, { fade: 3 });
    return;
  }
  const d = cur.el.duration;
  if (Number.isFinite(d) && d > 30 && cur.el.currentTime > d - FOREST_END - FOREST_X) {
    const next = v[1 - forest.cur];
    if (!next.el.getAttribute("src")) next.el.src = FOREST;
    else next.el.currentTime = 0;
    voicePlay(next, { fade: FOREST_X });
    voiceStop(cur, FOREST_X);
    forest.cur = 1 - forest.cur;
  }
}

function tick() {
  const r = rig;
  if (!r) return;
  const t = r.ctx.currentTime;
  const on = isOn();
  r.out.gain.setTargetAtTime(on ? 1 : 0, t, on ? FADE_IN : FADE_OUT);
  // the bed leans back under music (the headphones, the flight, a record)
  // and stays back through the breath between two recordings
  const under = ducked();
  r.duck.gain.setTargetAtTime(under ? DUCK : 1, t, under ? DUCK_IN : DUCK_OUT);
  const g = levels(r, scene, t);
  // keep a minute of gusts and swells scheduled ahead
  r.drifts.forEach((d) => {
    if (d.until < t + 30) runDrift(d, t, t + 90);
  });
  if (r.swells.until < t + 30) runSwell(r.swells, t, t + 90);
  // birds where there are birds, by day (a little hysteresis around dusk)
  forestTick(r, on && g.birds > 0 && BEDS[g.key].birds > 0 && g.day > (forest.on ? 0.02 : 0.2));
  const now = performance.now();
  // coming back from silence: no note until the bed has settled
  if (on && !wasOn) nextNote = Math.max(nextNote, now + 20000 + Math.random() * 20000);
  wasOn = on;
  if (!on) return;
  if (now > nextNote) {
    // the piano bed rests in the air and while his own music is playing
    if (g.piano && scene.speed < 1 && !under && !music.playing) pianoNote();
    nextNote = now + 45000 + Math.random() * 55000;
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
  if (forest.on) forestTick(r, false);
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
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
  if (running) {
    // called again from a later gesture: a context the browser would not wake on the first touch is woken now
    resumeAudio();
    return;
  }
  try {
    resumeAudio();
    if (!rig) {
      const { ctx } = audioGraph();
      rig = build(ctx, channel("ambience"));
      rig.sources.forEach((s, i) => track("ambience", s, ["wind", "air", "water"][i]));
      if (!scene.minimal) preloadPiano(36, 64);
      if (DEV) devHook(rig);
    }
    running = true;
    wasOn = false;
    nextNote = performance.now() + 20000 + Math.random() * 20000;
    timer = window.setInterval(tick, 200);
    // a hidden tab throttles timers: fade at once when the page is hidden
    document.addEventListener("visibilitychange", onVisibility);
    tick();
  } catch (e) {
    if (DEV) console.warn("ambience failed to start", e);
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
  if (rig) forestTick(rig, false);
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
  // development: while the scene is held by hand only `active` gets through
  if (held) scene.active = s.active ?? scene.active;
  else Object.assign(scene, s);
  // going inactive (or back) starts its fade now, not on the next tick
  if (scene.active !== active) tick();
}

// The mute pill. The choice lives in the audio manager, because it silences
// the flight's and the headphones' music as well; true also while the OS
// Sound setting is off.
export const ambienceMuted = () => sceneMuted();
export function setAmbienceMuted(m: boolean) {
  setSceneMuted(m);
  tick();
}
export function onAmbienceChange(l: () => void) {
  return onMuteChange(() => {
    tick();
    l();
  });
}

// ---------------------------------------------------------------------------
// Development only: window.__amb, for inspecting and measuring the graph from
// the console (never present in a production build). Nothing here needs to be
// heard: load the page with ?mute=1 and read the numbers.
//
//   __amb.state()             { ctx, running, muted, hushed, on, bed, held, forest, scene }
//   __amb.gains()             current value of every level/cutoff param in the graph
//   __amb.targets(scene?)     where the layers are heading (for the live scene, or any other)
//   await __amb.mix(sec?)     the mix of the live scene: per layer the gain now, the
//                             target, and the level in dBFS, COMPUTED (not heard):
//                             noise layers are rendered alone, at their target, in an
//                             OfflineAudioContext; the birds are the recording's
//                             offline-measured RMS times their gain; then times bus,
//                             duck and the manager's ambience trim
//   await __amb.render(sec, scene?, opts?)
//                             the noise layers through the same graph in an
//                             OfflineAudioContext -> { sampleRate, left, right }
//                             (Float32Array); opts.events = [{ at, on }] fades the
//                             bus exactly as mute / hide / inactive do, opts.raw
//                             skips the bus fade-in (bus held at 1)
//   __amb.hold({...} | null)  drive the scene by hand (Room rewrites it every frame
//                             otherwise); null hands it back
//   __amb.settle()            jump every live param to its target (skip the 2-3 s lean)
//   __amb.nodes / .analyser / .taps / await .meter(n)   the live graph, for metering
//   __amb.note(midi?)         play one bed note now (through the reverb)
//   __amb.mute(bool)          same as the speaker button (setAmbienceMuted)
//   __amb.scene({...})        same as ambienceScene
//   __amb.LEVEL, .BEDS, .BIRDS  the calibration and the table of places
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
  const taps = { wind: tap(r.wind), air: tap(r.air), water: tap(r.water), piano: tap(pianoSum), birds: tap(r.birdsOut) };
  const db = (v: number) => (v > 0 ? Math.round(200 * Math.log10(v)) / 10 : -Infinity);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
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
  // wind, air and water of a scene, each alone, at their targets: RMS in dBFS
  const solo = async (sc: Scene, seconds: number) => {
    const sr = 24000; // nothing in these layers lives above 2 kHz
    const off = new OfflineAudioContext(6, Math.floor(sr * seconds), sr);
    const o = build(off, off.createGain());
    levels(o, sc, 0, true);
    o.drifts.forEach((d) => runDrift(d, 0, seconds));
    runSwell(o.swells, 0, seconds);
    const merge = off.createChannelMerger(6);
    [o.wind, o.air, o.water].forEach((n, i) => {
      const split = off.createChannelSplitter(2);
      n.connect(split);
      split.connect(merge, 0, i * 2);
      split.connect(merge, 1, i * 2 + 1);
    });
    merge.connect(off.destination);
    const buf = await off.startRendering();
    const rms = (i: number) => {
      let sum = 0;
      let n = 0;
      for (const c of [i * 2, i * 2 + 1]) {
        const d = buf.getChannelData(c);
        // skip the first second (filters settling)
        for (let k = sr; k < d.length; k++) sum += d[k] * d[k];
        n += d.length - sr;
      }
      return Math.sqrt(sum / n);
    };
    return { wind: rms(0), air: rms(1), water: rms(2) };
  };
  (window as AmbWindow).__amb = {
    ctx,
    LEVEL,
    BEDS,
    BIRDS,
    nodes: r,
    analyser,
    taps,
    state: () => ({ ctx: ctx.state, running, muted: sceneMuted(), hushed: audioHushed(), on: isOn(), bed: bedOf(scene), held, forest: { ...forest }, scene: { ...scene } }),
    gains: () => ({
      out: r.out.gain.value,
      duck: r.duck.gain.value,
      master: r.master.gain.value,
      wind: r.wind.gain.value,
      gust: r.gust.gain.value,
      windCutoff: r.windLp[0].frequency.value,
      windTone: r.windTone.frequency.value,
      air: r.air.gain.value,
      airCutoff: r.airLp[0].frequency.value,
      water: r.water.gain.value,
      swell: r.swell.gain.value,
      swellCutoff: r.swellLp.frequency.value,
      pianoWet: r.wet.gain.value,
      birds: r.birds.gain.value,
      birdsCutoff: r.birdsLp[0].frequency.value,
      limiterReduction: r.limiter.reduction,
    }),
    targets: (s: Partial<Scene> = {}) => targets({ ...scene, ...s }),
    mix: async (seconds = 40) => {
      const g = targets(scene);
      const on = isOn();
      const bus = on ? 1 : 0;
      const duck = ducked() ? DUCK : 1;
      const trim = (channel("ambience").gain.value * MIX.ambience) as number;
      const k = bus * duck * trim;
      const m = await solo(scene, seconds);
      const near = (g.birdsTone - BIRDS.lpFar) / (BIRDS.lpNear - BIRDS.lpFar);
      const birdsOn = BEDS[g.key].birds > 0 && g.day > 0.02;
      const birds = birdsOn ? g.birds * Math.pow(10, (BIRDS.rmsFar + (BIRDS.rmsNear - BIRDS.rmsFar) * near) / 20) : 0;
      const layer = (target: number, now: number, rms: number) => ({ target: r3(target), now: r3(now), dBFS: db(rms * k) });
      const total = Math.sqrt(m.wind ** 2 + m.air ** 2 + m.water ** 2 + birds ** 2) * k;
      return {
        bed: g.key,
        night: r3(clamp01(scene.night)),
        on,
        bus: { target: bus, now: r3(r.out.gain.value) },
        duck: { target: duck, now: r3(r.duck.gain.value), dB: db(duck) },
        trim,
        wind: { ...layer(g.wind, r.wind.gain.value, m.wind), tone: Math.round(g.windTone) },
        air: layer(g.air, r.air.gain.value, m.air),
        water: layer(g.water, r.water.gain.value, m.water),
        birds: { ...layer(birdsOn ? g.birds : 0, r.birds.gain.value, birds), tone: Math.round(g.birdsTone), playing: forest.on },
        piano: { bed: g.piano && scene.speed < 1 && !music.playing, notePeak_dBFS: db(LEVEL.piano * 0.7 * k) },
        total_dBFS: db(total),
        computed: "offline render of each noise layer at its target gain; birds = offline-measured RMS of the filtered recording x gain; x bus x duck x trim",
      };
    },
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
    render: async (seconds = 20, s: Partial<Scene> = {}, opts: { events?: { at: number; on: boolean }[]; raw?: boolean } = {}) => {
      const off = new OfflineAudioContext(2, Math.floor(48000 * seconds), 48000);
      const o = build(off, off.destination);
      // the scene is constant for the render: start at its levels
      levels(o, { ...scene, ...s }, 0, true);
      o.drifts.forEach((d) => runDrift(d, 0, seconds));
      runSwell(o.swells, 0, seconds);
      if (opts.raw) o.out.gain.value = 1;
      else o.out.gain.setTargetAtTime(1, 0, FADE_IN);
      (opts.events ?? []).forEach((e) => o.out.gain.setTargetAtTime(e.on ? 1 : 0, e.at, e.on ? FADE_IN : FADE_OUT));
      const buf = await off.startRendering();
      return { sampleRate: buf.sampleRate, left: buf.getChannelData(0), right: buf.getChannelData(1) };
    },
    hold: (s: Partial<Scene> | null) => {
      held = !!s;
      if (s) Object.assign(scene, s);
      tick();
    },
    settle: () => {
      const t = ctx.currentTime;
      const g = targets(scene);
      const put = (p: AudioParam, v: number) => {
        p.cancelScheduledValues(t);
        p.setValueAtTime(v, t);
      };
      put(r.out.gain, isOn() ? 1 : 0);
      put(r.duck.gain, ducked() ? DUCK : 1);
      put(r.wind.gain, g.wind);
      put(r.windTone.frequency, g.windTone);
      put(r.air.gain, g.air);
      put(r.water.gain, g.water);
      put(r.birds.gain, g.birds);
      r.birdsLp.forEach((f) => put(f.frequency, g.birdsTone));
    },
    note: (midi?: number) => (midi ? pianoVoice(midi, 1) : pianoNote()),
    mute: setAmbienceMuted,
    scene: ambienceScene,
  };
}
