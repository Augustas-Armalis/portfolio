import { audioGraph, audioHushed, channel, compressorGain, deskMusicAsk, deskMusicPrime, fadeParam, MIX, music, onMuteChange, resumeAudio, sceneMuted, setSceneMuted, voice, voicePlay, voicePrime, voiceRoute, voiceStop, type Voice } from "@/lib/audio";
import { playPiano, preloadPiano } from "@/lib/piano";
import { ambienceGain, subscribeSoundSettings } from "@/lib/soundSettings";

// The sound of the place itself: real recordings only (all CC0, see
// CREDITS.md), kept quiet under everything else.
//
//   wind    wind-woods.mp3   binaural wind in a wood (3.6 min), always heard through a low ceiling (under about
//                            1 kHz) so only the airy rush of it is left: whatever lives in that wood (birds far
//                            off, anything else) is above the ceiling and inaudible
//   waves   sea-waves.mp3    waves on a beach (2.9 min)
//   birds   forest-birds.mp3 a forest by day: only in Paradise, whose painting has its white birds, and quietly
//
// The desk and the field round it are an empty field and music: the wind bed alone, a faint air (about -61
// dBFS: it is felt more than heard, and the music is the sound of the field), and once the visitor has clicked,
// the field's own music (the music director's: see deskMusic
// below; the mute pill silences it with everything else in the world). No birds, no meadow, no animals.
//
// How it is put together:
// - Each recording is streamed, never decoded whole: two <audio> elements per
//   recording, routed into the graph (voices of lib/audio.ts), taking turns.
//   The next pass starts a few seconds before the current one runs out and
//   the two cross (equal power), so a loop has no seam; the recording's own
//   fade-in and its last seconds are never played.
// - recording -> high-pass -> low-pass (24 dB/oct each) -> drift -> lean -> bed -> bus
//   The filters are the place's colour: the wood keeps its leaves and far
//   birds, open country is the same wind under a low ceiling (no leaves, no
//   birds), night is darker still. `drift` wanders slowly and at random
//   between about -3 dB and 0, so no two passes sound alike. `lean` follows
//   the plane's speed and the hour. `bed` is the world's own level and only
//   ever moves in 3 s equal-power fades, so one world's air crosses into the
//   next's with no dip.
// - bus -> duck (-7 dB while music plays) -> gentle top low-pass -> limiter -> the manager's "ambience" channel.
// - Levels: the beds sit between -31 dBFS RMS (the wood, the sea) and -42
//   (the funeral night), 7 dB lower again under music (the music itself is
//   near -26). Each was measured silently: the recording rendered through
//   that place's filters and gains in an OfflineAudioContext
//   (__amb.measure() repeats it for any scene).
// - Phones: one bed at a time (the wind or the waves, whichever the place
//   is), no birds; a recording's elements play their moment of
//   silence inside the first tap so they may start on their own later.
// - No synthetic noise anywhere, no crickets, no meadow recording, no animals.
//
// What the scene tells it, once a frame, through ambienceScene({...}):
//   night 0..1, water 0..1 (nearness to open water), speed m/s, boost 0..1,
//   active (false while the OS is on screen), place, world (a flight world id),
//   minimal (phones)

export type Place = "meadow" | "forest" | "sea" | "sky" | "none";
type Scene = { night: number; water: number; speed: number; boost: number; active: boolean; place?: Place; world?: string; minimal?: boolean };
const scene: Scene = { night: 0, water: 0, speed: 0, boost: 0, active: true };

// One row per place. wind / waves / birds are shares of the calibrated level; hp and lp the colour of the wind in Hz.
type Bed = { wind: number; hp: number; lp: number; waves: number; wavesLp: number; shore: number; birds: number; piano: boolean };
const bed = (o: Partial<Bed>): Bed => ({ wind: 0, hp: 120, lp: 1400, waves: 0, wavesLp: 5000, shore: 0, birds: 0, piano: false, ...o });
// (The wind recording is mostly leaves: nearly all of its level is above 2 kHz. A bed with a low ceiling loses
// most of it, so its share is larger. The figure after each row is the bed's level as measured through these
// settings over the whole recording, in dBFS RMS, before the duck: __amb.measure().)
// The wind's ceiling never rises above WIND_CEIL: the wood in the recording has life in it, and all of that is up
// where the ceiling cuts it off. Only the rush of air is left.
const WIND_CEIL = 1000;
const BEDS: Record<string, Bed> = {
  // home: an empty field. Soft filtered wind, nothing else (and the field's music: see deskMusic below)
  // (a little quieter than it was: about 2.5 dB down by day and at night)
  // (home has no ambience of its own at all: the owner wants only the field music he chose there)
  desk: bed({ wind: 0 }), // about -42.5 by day, -46.5 at night (measured: see the home scene's report)
  avenue: bed({ wind: 0 }), // the wood: the same air, a little more of it
  // the painted worlds
  sun: bed({ wind: 1.6, hp: 150, lp: 950 }), // high open air
  stars: bed({ wind: 0.78, hp: 80, lp: 620 }), // a low breath in the dark: -40
  rex: bed({ wind: 0.5, hp: 110, lp: 900, waves: 0.72, wavesLp: 1900 }), // surf a long way off under a dim sky: -36
  fairy: bed({ wind: 1.6, hp: 140, lp: 1000 }), // light air round the mountain
  paradise: bed({ wind: 1.3, hp: 140, lp: 1000, waves: 0.16, wavesLp: 2600, birds: 0.22 }), // still noon, the lake lapping, his white birds, far and few
  gate: bed({ wind: 1.6, hp: 120, lp: 1000 }), // wind through the pass
  sea: bed({ wind: 0, waves: 1.3, wavesLp: 6500 }), // the waves, nothing else: -32
  funeral: bed({ wind: 0.6, hp: 70, lp: 480 }), // almost silence: the air of a great night: -42
  kings: bed({ wind: 1.9, hp: 90, lp: 1000 }), // the night wood
  // a place without a world of its own
  sky: bed({ wind: 1.6, hp: 150, lp: 950 }),
  none: bed({ wind: 0.6, hp: 90, lp: 700 }),
};
const PLACE_BED: Record<Place, string> = { meadow: "desk", forest: "avenue", sea: "sea", sky: "sky", none: "none" };
const WORLD_BED: Record<string, string> = { home: "desk", desk: "desk", road: "desk", forest: "avenue" };
function bedOf(s: Scene): string {
  if (s.world) {
    const k = WORLD_BED[s.world] ?? s.world;
    if (k && BEDS[k]) return k;
  }
  return PLACE_BED[s.place ?? "meadow"] ?? "desk";
}

const DEV = process.env.NODE_ENV !== "production";

// The recordings. `rms` is the whole file's level as recorded (dBFS, mono sum, measured offline); `gain` brings a
// full share of it to about -32 dBFS. `head` skips the recording's own fade-in, `tail` is left unplayed, `x` is
// how long two passes overlap.
type RecId = "wind" | "waves" | "birds";
// `len` is the true playable length in seconds, measured by decoding the file: the wind and the waves are
// excerpts whose headers still claim the length of the whole original (372 s for 218 s of sound), so the
// element's own `duration` cannot be trusted, and nothing here ever seeks far into them.
const REC: Record<RecId, { file: string; rms: number; gain: number; len: number; head: number; tail: number; x: number }> = {
  wind: { file: "/assets/ambience/wind-woods.mp3", rms: -32.3, gain: 1.05, len: 218.2, head: 9, tail: 9, x: 4 },
  waves: { file: "/assets/ambience/sea-waves.mp3", rms: -15.2, gain: 0.145, len: 173.8, head: 2, tail: 8, x: 4 },
  // the forest: quiet as recorded; its floor is rumble under 900 Hz and hiss over 6 kHz, the birds are between
  birds: { file: "/assets/ambience/forest-birds.mp3", rms: -49.9, gain: 2.6, len: 325.9, head: 0, tail: 3.5, x: 3 },
};
const LEVEL = { piano: 0.04, wet: 0.8 };
// He found the field's air far too loud. Every bed is cut hard from the table's figures: at the desk and in the
// avenue by 9.5 dB (about -52 dBFS by day: barely there, a breath under the field's music), in the painted worlds
// by 6 dB (between -37 and -48).
// Then he could not hear the field's music for the air: at the desk and in the avenue it is taken down another
// 9 dB (about -61 dBFS by day, -65 at night), a faint air under the music and nothing more.
const CUT = { desk: 0.12, world: 0.5 };
const DUCK = 0.45; // the bed under music: -7 dB
const DUCK_IN = 0.5; // time constants (s): about 1.5 s down
const DUCK_OUT = 0.9; // about 2.7 s back up
const XWORLD = 3; // seconds: one place's bed crossing into the next's (equal power)
const LEAN = 0.8; // time constant of the slower leans (hour, colour)
const FADE_IN = 0.7; // the bus: about 2 s to settle
const FADE_OUT = 0.3;
const PHONE = 0.8; // a phone's bed, a little under

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function biquad(ctx: BaseAudioContext, type: BiquadFilterType, f: number, q = 0.707) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  return b;
}
function gainNode(ctx: BaseAudioContext, v: number) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

// A room that isn't there: 4 s of decaying noise that darkens as it fades (the piano's tail).
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
      const fc = 900 + 2700 * Math.exp(-t * 1.2);
      const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.min(1, (i - pre) / rise) * Math.exp(-t * 0.85);
    }
    const tail = Math.floor(sr * 1.2);
    for (let i = 0; i < tail; i++) d[len - 1 - i] *= i / tail;
  }
  return buf;
}

// One recording's way through the graph.
type Strip = {
  id: RecId;
  in: GainNode; // the two elements arrive here
  hp: BiquadFilterNode[];
  lp: BiquadFilterNode[];
  drift: GainNode; // wanders at random, slowly
  lean: GainNode; // speed and hour
  bed: GainNode; // the place's level: only ever 3 s equal-power fades
  to: number; // where `bed` is heading
  until: number; // the drift is scheduled up to here
  on: boolean; // its elements are playing
  cur: 0 | 1;
  offAt: number; // performance.now() at which a silent strip's elements are let go
  voices?: [Voice, Voice];
};
type Rig = { ctx: BaseAudioContext; out: GainNode; duck: GainNode; master: GainNode; limiter: DynamicsCompressorNode; strips: Record<RecId, Strip>; piano: GainNode; wet: GainNode; key: string };

const LIMIT = { threshold: -18, knee: 6, ratio: 8, attack: 0.004, release: 0.3 };

function strip(ctx: BaseAudioContext, id: RecId, out: AudioNode): Strip {
  const input = gainNode(ctx, 1);
  const hp = [biquad(ctx, "highpass", id === "birds" ? 900 : 120), biquad(ctx, "highpass", id === "birds" ? 900 : 120)];
  const lp = [biquad(ctx, "lowpass", id === "birds" ? 4800 : 2000), biquad(ctx, "lowpass", id === "birds" ? 4800 : 2000)];
  const drift = gainNode(ctx, 0.85);
  const lean = gainNode(ctx, 1);
  const b = gainNode(ctx, 0);
  input.connect(hp[0]).connect(hp[1]).connect(lp[0]).connect(lp[1]).connect(drift).connect(lean).connect(b).connect(out);
  return { id, in: input, hp, lp, drift, lean, bed: b, to: 0, until: 0, on: false, cur: 0, offAt: 0 };
}

function build(ctx: BaseAudioContext, dest: AudioNode): Rig {
  const out = gainNode(ctx, 0);
  const duck = gainNode(ctx, 1);
  const top = biquad(ctx, "lowpass", 9000, 0.5);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMIT.threshold;
  limiter.knee.value = LIMIT.knee;
  limiter.ratio.value = LIMIT.ratio;
  limiter.attack.value = LIMIT.attack;
  limiter.release.value = LIMIT.release;
  // the browser's compressor adds make-up gain of its own: take it back out
  const master = gainNode(ctx, Math.pow(10, (0.6 * LIMIT.threshold * (1 - 1 / LIMIT.ratio)) / 20));
  void compressorGain(LIMIT).then((k) => k && master.gain.setTargetAtTime(1 / k, ctx.currentTime, 0.05));
  out.connect(duck).connect(top).connect(limiter).connect(master).connect(dest);
  // piano: darkened like a soft touch, dry plus a long quiet reverb
  const piano = gainNode(ctx, 1);
  const soft = biquad(ctx, "lowpass", 2300, 0.5);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx);
  const wet = gainNode(ctx, LEVEL.wet);
  piano.connect(soft);
  soft.connect(out);
  soft.connect(verb).connect(wet).connect(out);
  return { ctx, out, duck, master, limiter, strips: { wind: strip(ctx, "wind", out), waves: strip(ctx, "waves", out), birds: strip(ctx, "birds", out) }, piano, wet, key: "" };
}

// Where everything is heading for a scene: plain numbers.
function targets(s: Scene) {
  const key = bedOf(s);
  const b = BEDS[key];
  const night = clamp01(s.night);
  const fly = clamp01(Math.max(0, s.speed) / 16);
  // birds are a thing of the day: gone by dusk, back after dawn
  const day = 1 - smooth(0.3, 0.6, night);
  const home = key === "desk" || key === "avenue";
  // (every bed is taken well down from the figures in the table: see CUT)
  const cut = home ? CUT.desk : CUT.world;
  // (what stands near the listener is added to the place's own air)
  const near = nearSources();
  let wind = b.wind + near.wind;
  let waves = Math.max(b.waves, b.shore * clamp01(s.water)) + near.waves;
  let birds = (b.birds + near.birds) * day * (1 - 0.4 * fly);
  const birdShare = b.birds + near.birds;
  if (s.minimal) {
    // a phone: one bed at a time
    if (waves > wind) wind = 0;
    else waves = 0;
    birds = 0;
    wind *= PHONE;
    waves *= PHONE;
  }
  return {
    key,
    day,
    // (the place's own levels: these move only when the place does)
    bed: { wind: wind * REC.wind.gain * cut, waves: waves * REC.waves.gain * cut, birds: birds > 0.02 ? REC.birds.gain * birdShare * cut : 0 },
    // the wind settles after dark; in the air it rises a little with speed
    lean: { wind: (1 - 0.3 * night * (home ? 1 : 0)) * (1 + 0.45 * fly * fly), waves: 1 - 0.25 * fly, birds: birdShare > 0 ? birds / birdShare : 0 },
    // at home the night wind is darker and loses its birds; a fast plane hears a little more of the top
    hp: b.hp,
    lp: Math.min(WIND_CEIL, b.lp * (home ? 1 - 0.3 * smooth(0.25, 0.7, night) : 1) * (1 + 0.25 * fly)),
    wavesLp: b.wavesLp,
    birdsLp: 4200 + 1400 * b.birds,
    piano: b.piano && !s.minimal,
  };
}

let rig: Rig | null = null;
let running = false;
let timer = 0;
let nextNote = 0;
let wasOn = false;
let held = false; // development: the scene is being driven by hand
let offSound: (() => void) | null = null;
let lastMusic = -1e9;
const DUCK_HOLD = 800; // ms the bed waits after the music stops before it returns
function ducked() {
  const now = performance.now();
  if (music.playing) lastMusic = now;
  return now - lastMusic < DUCK_HOLD;
}

// ---- the streams ----
function voicesOf(s: Strip): [Voice, Voice] | null {
  if (s.voices) return s.voices;
  const o = { channel: "ambience", scene: true } as const;
  const a = voice(`amb-${s.id}-a`, o);
  const b = voice(`amb-${s.id}-b`, o);
  if (!a || !b) return null;
  // (routed once: the elements live on across hot reloads, the strip they play into is this rig's)
  voiceRoute(a, s.in);
  voiceRoute(b, s.in);
  return (s.voices = [a, b]);
}
function begin(v: Voice, id: RecId, fade: number, at: number) {
  const r = REC[id];
  if (v.el.getAttribute("src") !== r.file) v.el.src = r.file;
  const go = () => {
    try {
      v.el.currentTime = at;
    } catch {
      /* from the top, then */
    }
  };
  if (Math.abs(v.el.currentTime - at) < 0.3) {
    /* already there */
  } else if (v.el.readyState >= 1) go();
  else if (at > 0) v.el.addEventListener("loadedmetadata", go, { once: true });
  voicePlay(v, { fade });
}
// Start, hand over and stop one recording's two elements.
function stream(s: Strip, want: boolean) {
  if (!want && !s.on) return;
  const v = voicesOf(s);
  if (!v) return;
  const r = REC[s.id];
  if (!want) {
    // (kept running for a moment after its bed has faded, then let go)
    if (!s.offAt) s.offAt = performance.now() + XWORLD * 1000 + 400;
    else if (performance.now() > s.offAt) {
      s.on = false;
      s.offAt = 0;
      v.forEach((x) => voiceStop(x, 0.4));
    }
    return;
  }
  s.offAt = 0;
  const cur = v[s.cur];
  if (!s.on) {
    s.on = true;
    // (it carries on from where it was last left, if it was heard before: a place never opens on the same gust twice)
    const at = cur.el.getAttribute("src") === r.file && cur.el.currentTime > r.head && cur.el.currentTime < r.len - r.tail - r.x - 20 && !cur.el.ended ? cur.el.currentTime : r.head;
    begin(cur, s.id, 0.6, at);
    return;
  }
  const d = Math.min(Number.isFinite(cur.el.duration) ? cur.el.duration : r.len, r.len);
  if (cur.el.ended || cur.el.currentTime > d - r.tail - r.x) {
    const next = v[1 - s.cur];
    begin(next, s.id, r.x, r.head);
    voiceStop(cur, r.x);
    s.cur = (1 - s.cur) as 0 | 1;
  } else if (cur.el.paused && !cur.want) begin(cur, s.id, 0.6, r.head);
}

// the slow random wander of a strip's level: about -3 dB to 0, a new target every 7 to 16 s
function wander(s: Strip, now: number, horizon: number) {
  let t = Math.max(s.until, now);
  while (t < horizon) {
    const gap = 7 + Math.random() * 9;
    s.drift.gain.setTargetAtTime(0.7 + 0.3 * Math.pow(Math.random(), 0.8), t, gap * 0.4);
    t += gap;
  }
  s.until = t;
}

// D-flat major pentatonic in the octave and a half below middle E (those samples ring for seconds).
const SCALE = [49, 51, 53, 56, 58, 61, 63];
const ROOTS = [37, 44];
let lastIdx = 4;
function pianoVoice(midi: number, level: number, when = 0) {
  if (!rig) return;
  playPiano(midi, { to: rig.piano, gain: LEVEL.piano * level, attack: 0.012, dur: 4.5, release: 3.4, when });
}
function pianoNote() {
  lastIdx = Math.min(SCALE.length - 1, Math.max(0, lastIdx + Math.floor(Math.random() * 5) - 2));
  pianoVoice(SCALE[lastIdx], 0.8 + Math.random() * 0.2);
  if (Math.random() < 0.2) pianoVoice(ROOTS[Math.floor(Math.random() * ROOTS.length)], 0.6, 0.03);
  if (Math.random() < 0.12) {
    const up = SCALE[Math.min(SCALE.length - 1, lastIdx + 2)];
    if (up !== SCALE[lastIdx]) pianoVoice(up, 0.55, 1.8 + Math.random() * 1.2);
  }
}

const isOn = () => running && !sceneMuted() && scene.active && document.visibilityState === "visible";

// ---- the desk's music ----
// The field has music of its own once the visitor has clicked. What it is belongs to the music director
// (lib/musicDirector.ts: the Village in a Mountain Pass embed, and nothing else); here it is only asked for and sent away:
// asked for at the desk and in the avenue when nothing else is playing and the plane is not in the air, sent away
// (over 2.5 s) the moment anything else plays, the plane takes off or the OS is on screen.
let deskOn = false;
function deskMusic(on: boolean, key: string) {
  const want = on && (key === "desk" || key === "avenue") && scene.speed < 1 && !music.playing;
  if (want === deskOn) return;
  deskOn = want;
  deskMusicAsk(want, want ? 4 : 2.5);
}

function tick() {
  const r = rig;
  if (!r) return;
  const t = r.ctx.currentTime;
  const on = isOn();
  // (the visitor's own ambience level, from Settings: lib/soundSettings.ts)
  r.out.gain.setTargetAtTime(on ? ambienceGain() : 0, t, on ? FADE_IN : FADE_OUT);
  const under = ducked();
  r.duck.gain.setTargetAtTime(under ? DUCK : 1, t, under ? DUCK_IN : DUCK_OUT);
  const g = targets(scene);
  const moved = g.key !== r.key;
  r.key = g.key;
  (Object.keys(r.strips) as RecId[]).forEach((id) => {
    const s = r.strips[id];
    const to = g.bed[id];
    // a new place: its bed crosses in over three seconds, equal power; within a place the level only leans
    if (Math.abs(to - s.to) > 1e-4) {
      fadeParam(s.bed.gain, to, moved || s.to === 0 || to === 0 ? XWORLD : 1.5);
      s.to = to;
    }
    s.lean.gain.setTargetAtTime(g.lean[id], t, id === "birds" ? LEAN : 0.6);
    const lp = id === "wind" ? g.lp : id === "waves" ? g.wavesLp : g.birdsLp;
    // (a place's colour arrives with its bed; the hour's and the speed's lean slowly)
    s.lp.forEach((f) => f.frequency.setTargetAtTime(lp, t, moved ? XWORLD / 3 : LEAN));
    if (id === "wind") s.hp.forEach((f) => f.frequency.setTargetAtTime(g.hp, t, moved ? XWORLD / 3 : LEAN));
    if (s.until < t + 30) wander(s, t, t + 90);
    stream(s, on && to > 0);
  });
  deskMusic(on, g.key);
  const now = performance.now();
  // coming back from silence: no note until the bed has settled
  if (on && !wasOn) nextNote = Math.max(nextNote, now + 20000 + Math.random() * 20000);
  wasOn = on;
  if (!on) return;
  if (now > nextNote) {
    if (g.piano && scene.speed < 1 && !under && !music.playing) pianoNote();
    nextNote = now + 45000 + Math.random() * 55000;
  }
}

const onVisibility = () => tick();

function silence(r: Rig) {
  (Object.keys(r.strips) as RecId[]).forEach((id) => {
    const s = r.strips[id];
    if (!s.on) return;
    s.on = false;
    s.offAt = 0;
    voicesOf(s)?.forEach((x) => voiceStop(x, 1));
  });
}

// Fade out and let go of a rig (a hot reload would otherwise leave the old module's bed under the new one).
function dispose() {
  if (typeof window === "undefined") return false;
  const was = running;
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisibility);
  offSound?.();
  offSound = null;
  running = false;
  const r = rig;
  rig = null;
  if (!r) return was;
  delete (window as AmbWindow).__amb;
  silence(r);
  if (deskOn) {
    deskOn = false;
    deskMusicAsk(false, 0.5);
  }
  r.out.gain.setTargetAtTime(0, r.ctx.currentTime, 0.1);
  window.setTimeout(() => r.master.disconnect(), 1500);
  return was;
}

type AmbWindow = Window & { __ambDispose?: () => boolean; __amb?: unknown };

// Call from the first user gesture. Safe to call again.
export function startAmbience() {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
  if (running) {
    // called again from a later gesture: a context the browser would not wake on the first touch is woken now
    // (and the field's music, if it was refused for want of a gesture, is asked for again inside this one)
    resumeAudio();
    deskMusicPrime();
    return;
  }
  try {
    resumeAudio();
    if (!rig) {
      const { ctx } = audioGraph();
      rig = build(ctx, channel("ambience"));
      if (!scene.minimal) preloadPiano(36, 64);
      if (DEV) devHook(rig);
    }
    // inside the gesture: the wind's and the waves' elements play their moment of silence, so each may begin its
    // recording later without one (a phone refuses a first play() that comes from a timer)
    for (const id of ["wind", "waves"] as RecId[]) voicesOf(rig.strips[id])?.forEach((v) => voicePrime(v));
    deskMusicPrime();
    running = true;
    wasOn = false;
    nextNote = performance.now() + 20000 + Math.random() * 20000;
    timer = window.setInterval(tick, 200);
    document.addEventListener("visibilitychange", onVisibility);
    offSound?.();
    offSound = subscribeSoundSettings(tick);
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
  offSound?.();
  offSound = null;
  running = false;
  wasOn = false;
  rig?.out.gain.setTargetAtTime(0, rig.ctx.currentTime, FADE_OUT);
  if (rig) silence(rig);
  if (deskOn) {
    deskOn = false;
    deskMusicAsk(false, 2.5);
  }
}

if (typeof window !== "undefined") {
  const w = window as AmbWindow;
  const was = w.__ambDispose?.();
  w.__ambDispose = dispose;
  // hot reload: the gesture has already happened, so pick up where it left off
  if (was) window.setTimeout(startAmbience, 0);
}

// ---- sources: sound that grows as the plane comes near ----
// A place in the world can have a sound of its own, from the recordings there already are: surf by a shore, wind in
// a wood, the forest's birds by a lake. It is heard from `radius` metres off, barely, and grows smoothly to its
// level (a share of that recording's calibrated bed, about 1 for "as loud as a world's own bed"; it is cut with
// everything else) as the listener reaches it; it is added to whatever the place itself sounds like and moves with
// the same slow fades. Register it when the thing is mounted and take it away when it goes:
//
//   useEffect(() => ambienceSource("home-lake", { kind: "waves", at: [-17, 0, -34], radius: 120, level: 0.5 }), []);
//
// (ambienceSource returns the function that removes it.) `at` is in world space. The listener is the plane in
// flight (Plane.tsx tells us where it is) and the eye otherwise.
export type SoundSource = { kind: "wind" | "waves" | "birds"; at: [number, number, number]; radius: number; level: number };
const sources = new Map<string, SoundSource>();
const ear = { x: 0, y: 0, z: 0, set: false };
export function ambienceSource(id: string, src: SoundSource) {
  sources.set(id, src);
  return () => {
    if (sources.get(id) === src) sources.delete(id);
  };
}
export function ambienceListener(x: number, y: number, z: number) {
  ear.x = x;
  ear.y = y;
  ear.z = z;
  ear.set = true;
}
function nearSources() {
  const out = { wind: 0, waves: 0, birds: 0 };
  if (!ear.set) return out;
  sources.forEach((s) => {
    const d = Math.hypot(s.at[0] - ear.x, s.at[1] - ear.y, s.at[2] - ear.z);
    const k = clamp01(1 - d / Math.max(s.radius, 1));
    // (slow at the rim, fuller close in: it is noticed late and never jumps)
    out[s.kind] += s.level * k * k * (3 - 2 * k) * k;
  });
  return out;
}

// What the scene is doing, written once a frame (cheap: plain numbers).
export function ambienceScene(s: Partial<Scene>) {
  const active = scene.active;
  // development: while the scene is held by hand only `active` gets through
  if (held) scene.active = s.active ?? scene.active;
  else Object.assign(scene, s);
  if (scene.active !== active) tick();
}

// The mute pill. The choice lives in the audio manager, because it silences
// the flight's and the headphones' music as well.
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
// Development only: window.__amb. Nothing here needs to be heard: load the
// page with ?mute=1 and read the numbers.
//
//   __amb.state()            { ctx, running, on, bed, held, scene, streams }
//   __amb.gains()            every level and cutoff in the graph, now
//   __amb.targets(scene?)    where they are heading
//   __amb.hold({...} | null) drive the scene by hand; null hands it back
//   await __amb.measure(scene?, seconds?)
//                            the bed of a scene, COMPUTED: each recording it uses is fetched,
//                            passed through that scene's filters and gains in an
//                            OfflineAudioContext, and its RMS read (dBFS), alone and summed,
//                            before and after the duck and the manager's trim
//   __amb.note(midi?), .mute(bool), .scene({...}), .BEDS, .REC
// ---------------------------------------------------------------------------
function devHook(r: Rig) {
  const ctx = r.ctx as AudioContext;
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const db = (v: number) => (v > 0 ? Math.round(200 * Math.log10(v)) / 10 : -Infinity);
  const cache = new Map<string, Promise<AudioBuffer>>();
  const SR = 22050;
  const decode = (file: string) => {
    let p = cache.get(file);
    if (!p) cache.set(file, (p = fetch(file).then((x) => x.arrayBuffer()).then((b) => new OfflineAudioContext(2, 1, SR).decodeAudioData(b))));
    return p;
  };
  (window as AmbWindow).__amb = {
    ctx,
    BEDS,
    REC,
    nodes: r,
    state: () => ({
      ctx: ctx.state,
      running,
      muted: sceneMuted(),
      hushed: audioHushed(),
      on: isOn(),
      bed: bedOf(scene),
      deskMusic: deskOn,
      held,
      scene: { ...scene },
      streams: Object.fromEntries((Object.keys(r.strips) as RecId[]).map((id) => [id, { on: r.strips[id].on, cur: r.strips[id].cur, els: r.strips[id].on ? voicesOf(r.strips[id])?.map((v) => ({ t: r3(v.el.currentTime), paused: v.el.paused, gain: v.gain ? r3(v.gain.gain.value) : null })) : [] }])),
    }),
    gains: () => ({
      out: r3(r.out.gain.value),
      duck: r3(r.duck.gain.value),
      master: r3(r.master.gain.value),
      limiterReduction: r3(r.limiter.reduction),
      ...Object.fromEntries((Object.keys(r.strips) as RecId[]).map((id) => [id, { bed: r3(r.strips[id].bed.gain.value), to: r3(r.strips[id].to), lean: r3(r.strips[id].lean.gain.value), drift: r3(r.strips[id].drift.gain.value), hp: Math.round(r.strips[id].hp[0].frequency.value), lp: Math.round(r.strips[id].lp[0].frequency.value) }])),
    }),
    targets: (s: Partial<Scene> = {}) => targets({ ...scene, ...s }),
    measure: async (s: Partial<Scene> = {}, seconds = 160) => {
      const sc = { ...scene, ...s };
      const g = targets(sc);
      const res: Record<string, unknown> = { bed: g.key };
      let sum = 0;
      for (const id of Object.keys(REC) as RecId[]) {
        const level = g.bed[id] * g.lean[id] * 0.87; // (0.87: the drift's mean)
        if (level <= 0) continue;
        const buf = await decode(REC[id].file);
        const off = new OfflineAudioContext(2, SR * seconds, SR);
        const src = off.createBufferSource();
        src.buffer = buf;
        const st = strip(off, id, off.destination);
        const lp = id === "wind" ? g.lp : id === "waves" ? g.wavesLp : g.birdsLp;
        st.lp.forEach((f) => (f.frequency.value = Math.min(lp, SR * 0.45)));
        if (id === "wind") st.hp.forEach((f) => (f.frequency.value = g.hp));
        st.drift.gain.value = 1;
        st.bed.gain.value = level;
        src.connect(st.in);
        src.start(0, REC[id].head);
        const out = await off.startRendering();
        let acc = 0;
        let n = 0;
        for (let c = 0; c < 2; c++) {
          const d = out.getChannelData(c);
          for (let i = SR; i < d.length; i += 2) acc += d[i] * d[i];
          n += (d.length - SR) / 2;
        }
        const rms = Math.sqrt(acc / n);
        sum += rms * rms;
        // where its energy lies: under 250 Hz, 250 Hz to 1 kHz, above (two one-pole splits over the left channel), and its loudest 50 ms
        const d0 = out.getChannelData(0);
        const a1 = 1 - Math.exp((-2 * Math.PI * 250) / SR);
        const a2 = 1 - Math.exp((-2 * Math.PI * 1000) / SR);
        let l1 = 0;
        let l2 = 0;
        let eLow = 0;
        let eMid = 0;
        let eHigh = 0;
        let win = 0;
        let peak = 0;
        const W = Math.round(SR * 0.05);
        for (let i = SR; i < d0.length; i++) {
          l1 += a1 * (d0[i] - l1);
          l2 += a2 * (d0[i] - l2);
          eLow += l1 * l1;
          eMid += (l2 - l1) * (l2 - l1);
          eHigh += (d0[i] - l2) * (d0[i] - l2);
          win += d0[i] * d0[i];
          if ((i - SR) % W === W - 1) {
            peak = Math.max(peak, win / W);
            win = 0;
          }
        }
        const eAll = eLow + eMid + eHigh || 1;
        res[id] = { gain: r3(level), hp: id === "wind" ? g.hp : st.hp[0].frequency.value, lp: Math.round(lp), dBFS: db(rms), loudest50ms_dBFS: db(Math.sqrt(peak)), under250Hz: Math.round((100 * eLow) / eAll) + "%", to1kHz: Math.round((100 * eMid) / eAll) + "%", above1kHz: Math.round((100 * eHigh) / eAll) + "%" };
      }
      const trim = channel("ambience").gain.value * MIX.ambience;
      res.total_dBFS = db(Math.sqrt(sum) * trim);
      res.underMusic_dBFS = db(Math.sqrt(sum) * trim * DUCK);
      res.computed = "offline render of each recording through this scene's filters and gains (drift at its mean), x the ambience trim; then x the duck";
      return res;
    },
    hold: (s: Partial<Scene> | null) => {
      held = !!s;
      if (s) Object.assign(scene, s);
      tick();
    },
    note: (midi?: number) => (midi ? pianoVoice(midi, 1) : pianoNote()),
    mute: setAmbienceMuted,
    scene: ambienceScene,
  };
}
