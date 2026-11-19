import { useOS } from "@/store";
import { playPiano } from "@/lib/piano";

// The audio manager: every sound of the site goes through this one graph, on
// one AudioContext.
//
//   channel     who plays on it                              reaches
//   music       the headphones player (3D), Records (OS)     analyser -> sink
//   flight      the flight's per-world tracks (two decks)    analyser -> sink
//   piano       the 3D piano, the Piano app, boot/shutdown   analyser -> sink
//   ambience    wind, meadow, forest, water, the bed piano   sink
//   sfx         page turns, shutter, paper plane             sink
//
//   sink -> speakers. The sink is the only node connected to the output: it
//   is 0 while the OS Sound setting is off and while the tab is hidden.
//
// Rules
// - One music owner at a time: "headphones", "records" or "flight". Whoever
//   starts playing becomes the owner; the previous owner fades out (0.8 s) and
//   is then paused. Nothing is ever left playing at zero volume.
// - Hand-overs. Putting the headphones down: fade out 0.9 s, pause. Landing:
//   fade out 2.5 s, pause, release the files. Leaving the room for the OS
//   (boot): the headphones and the flight fade out over 1.2 s; the OS has its
//   own player (Records) and nothing is carried into it. Shut Down / Restart:
//   Records fades out over 0.8 s and is paused, whichever window started it.
// - A media element is routed into the graph exactly once (tapMediaElement
//   is idempotent) and lives in a registry that survives hot reloads, so a
//   reloaded module picks its element up again instead of orphaning it.
// - Every level change is a ramp. Pausing always follows a fade.
// - The scene's mute pill silences every scene voice (ambience, flight,
//   headphones) before the analyser, so the visuals rest too. The OS Sound
//   setting silences everything.
// - Hidden tab: the sink fades, playing elements are paused and the context
//   is suspended; coming back resumes exactly the ones that were playing.
//
// Development: window.__audio (see devHook at the bottom of this file).

export type Channel = "music" | "flight" | "ambience" | "piano" | "sfx";
export type Owner = "headphones" | "records" | "flight";

export type Voice = {
  id: string;
  channel: Channel;
  owner: Owner | null;
  scene: boolean; // belongs to the 3D world: obeys the mute pill
  el: HTMLMediaElement;
  gain: GainNode | null; // the voice's level: fades only
  gate: GainNode | null; // mute pill / Sound setting
  level: number; // where the level is heading
  want: boolean; // meant to be playing
  timer: number; // pending pause after a fade
  resume: boolean; // paused by a hidden tab: play again when it returns
};

type Tracked = { label: string; node: AudioNode };
type State = {
  ctx: AudioContext;
  master: GainNode; // the synth fallback of note()
  analyser: AnalyserNode;
  sink: GainNode;
  channels: Record<Channel, GainNode>;
  voices: Map<string, Voice>;
  byEl: WeakMap<HTMLMediaElement, Voice>;
  owner: Owner | null;
  suspended: boolean; // by a hidden tab
  hideTimer: number;
  nodes: Record<Channel, Set<Tracked>>; // live buffer sources (development)
  played: Set<HTMLMediaElement>; // every element that ever played (development)
};
// Kept apart from the graph so reading the mute choice never opens a context.
type Prefs = { muted: boolean; listeners: Set<() => void>; teardown: (() => void) | null };

const DEV = process.env.NODE_ENV !== "production";
const CHANNELS: Channel[] = ["music", "flight", "ambience", "piano", "sfx"];
const MUTE_KEY = "ag-ambience";
type G = typeof globalThis & { __aosAudio?: State; __aosAudioPrefs?: Prefs };

function prefs(): Prefs {
  const g = globalThis as G;
  if (g.__aosAudioPrefs) return g.__aosAudioPrefs;
  let muted = false;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "0";
  } catch {
    /* storage blocked */
  }
  return (g.__aosAudioPrefs = { muted, listeners: new Set(), teardown: null });
}

const hasAudio = () => typeof window !== "undefined" && typeof AudioContext !== "undefined";
const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
const soundOn = () => {
  try {
    return useOS.getState().sound;
  } catch {
    return true;
  }
};

// The graph is built once and kept on globalThis: a hot reload of this module
// must not open a second AudioContext next to the first.
function state(): State {
  const g = globalThis as G;
  if (g.__aosAudio) return g.__aosAudio;
  const ctx = new AudioContext();
  const sink = ctx.createGain();
  sink.gain.value = soundOn() && visible() ? 1 : 0;
  sink.connect(ctx.destination);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.82;
  analyser.connect(sink);
  const channels = {} as Record<Channel, GainNode>;
  const nodes = {} as Record<Channel, Set<Tracked>>;
  for (const c of CHANNELS) {
    const n = ctx.createGain();
    n.connect(c === "ambience" || c === "sfx" ? sink : analyser);
    channels[c] = n;
    nodes[c] = new Set();
  }
  const master = ctx.createGain();
  master.gain.value = 0.22;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  master.connect(lp).connect(channels.piano);
  const s: State = {
    ctx,
    master,
    analyser,
    sink,
    channels,
    voices: new Map(),
    byEl: new WeakMap(),
    owner: null,
    suspended: false,
    hideTimer: 0,
    nodes,
    played: new Set(),
  };
  g.__aosAudio = s;
  if (DEV) devHook(s);
  return s;
}

// Shared graph for the other audio modules. Does not resume the context.
export function audioGraph() {
  const s = state();
  return { ctx: s.ctx, master: s.master, analyser: s.analyser };
}

// Where a module connects its output.
export function channel(name: Channel): GainNode {
  return state().channels[name];
}

// Development bookkeeping: lets window.__audio list the live source nodes.
export function track(name: Channel, node: AudioScheduledSourceNode, label: string) {
  if (!DEV) return;
  const set = state().nodes[name];
  const t = { label, node };
  set.add(t);
  node.addEventListener("ended", () => set.delete(t));
}

// Frequency data of the music and piano channels. Safe to call before any
// sound: the context stays suspended until the first gesture.
export function getAnalyser(): AnalyserNode | null {
  if (!hasAudio()) return null;
  return state().analyser;
}

// Wake the output (call from a user gesture: play buttons, the plane taking off).
export function resumeAudio() {
  if (!hasAudio()) return;
  const s = state();
  // a hidden tab stays asleep: it wakes when it is looked at again
  if (s.ctx.state === "suspended" && !s.suspended) void s.ctx.resume().catch(() => {});
}

// ---------------------------------------------------------------------------
// ramps

// Hold a param where it is right now, dropping whatever was scheduled.
function hold(p: AudioParam, t: number) {
  const v = p.value;
  p.cancelScheduledValues(t);
  p.setValueAtTime(v, t);
  return v;
}

// Equal-power fade from wherever the param is to `to` (sine on the way up,
// cosine on the way down, so two voices crossing keep a constant loudness).
export function fadeParam(p: AudioParam, to: number, seconds: number) {
  const { ctx } = state();
  const t = ctx.currentTime;
  const from = hold(p, t);
  if (Math.abs(to - from) < 1e-4) return;
  const N = 8;
  for (let k = 1; k <= N; k++) {
    const x = k / N;
    const sh = to > from ? Math.sin((x * Math.PI) / 2) : 1 - Math.cos((x * Math.PI) / 2);
    p.linearRampToValueAtTime(from + (to - from) * sh, t + Math.max(0.02, seconds) * x);
  }
}

// ---------------------------------------------------------------------------
// voices: media elements in the graph

function gateOf(v: Voice) {
  return v.scene && (prefs().muted || !soundOn()) ? 0 : 1;
}

function applyGates() {
  const s = (globalThis as G).__aosAudio;
  if (!s) return;
  const t = s.ctx.currentTime;
  s.voices.forEach((v) => v.gate?.gain.setTargetAtTime(gateOf(v), t, 0.12));
  s.sink.gain.setTargetAtTime(soundOn() && visible() ? 1 : 0, t, visible() ? 0.18 : 0.06);
}

function register(id: string, el: HTMLMediaElement, o: { channel: Channel; owner: Owner | null; scene: boolean }, through?: (ctx: AudioContext) => AudioNode) {
  const s = state();
  const v: Voice = { id, el, gain: null, gate: null, level: 0, want: false, timer: 0, resume: false, ...o };
  try {
    const src = s.ctx.createMediaElementSource(el);
    v.gain = s.ctx.createGain();
    v.gain.gain.value = 0;
    v.gate = s.ctx.createGain();
    v.gate.gain.value = gateOf(v);
    (through ? src.connect(through(s.ctx)) : src).connect(v.gain).connect(v.gate).connect(s.channels[o.channel]);
  } catch {
    // no Web Audio for this element: it plays directly and fades by volume
    v.gain = v.gate = null;
  }
  // Whoever starts playing owns the music. This is how the OS player, which
  // calls el.play() itself, takes over from the 3D world's music.
  el.addEventListener("play", () => {
    window.clearTimeout(v.timer);
    v.want = true;
    v.resume = false;
    if (v.owner) claim(v.owner);
    // started from outside (the OS player): bring its level up
    if (v.level <= 0 && !el.src.startsWith("blob:")) setLevel(v, 1, 0.25);
  });
  el.addEventListener("pause", () => {
    // paused from outside while audible: nothing is left half-faded
    if (!v.resume && !v.timer) v.want = false;
  });
  const old = s.voices.get(id);
  if (old && old.el !== el) retire(old);
  s.voices.set(id, v);
  s.byEl.set(el, v);
  return v;
}

// A voice replaced by a newer element with the same id (hot reload): out.
function retire(v?: Voice) {
  if (!v) return;
  v.want = false;
  window.clearTimeout(v.timer);
  v.gain?.gain.setTargetAtTime(0, state().ctx.currentTime, 0.05);
  v.timer = window.setTimeout(() => v.el.pause(), 300);
}

// A named media element of the manager's own, created on first use and found
// again afterwards (also across hot reloads). No file is assigned here:
// nothing is fetched until the caller sets a source.
export function voice(id: string, o: { channel: Channel; owner?: Owner; scene?: boolean; loop?: boolean }): Voice | null {
  if (!hasAudio()) return null;
  const s = state();
  const found = s.voices.get(id);
  if (found) return found;
  const el = new Audio();
  el.crossOrigin = "anonymous";
  el.preload = "none";
  el.loop = !!o.loop;
  return register(id, el, { channel: o.channel, owner: o.owner ?? null, scene: o.scene ?? true });
}

// Route an <audio>/<video> element of the caller's into the graph so it shows
// up in getAnalyser(). Safe to call again for the same element. An element
// tapped this way is the OS music player: it owns the "records" voice.
export function tapMediaElement(el: HTMLMediaElement, through?: (ctx: AudioContext) => AudioNode) {
  const s = state();
  let v = s.byEl.get(el);
  if (!v) {
    const made = (v = register("records", el, { channel: "music", owner: "records", scene: false }, through));
    // While the manager is fading this element out (Shut Down, Restart), a
    // pause() from the OS waits for the fade to finish instead of cutting it.
    const pause = el.pause.bind(el);
    el.pause = () => {
      if (made.timer && !made.want && made.level === 0) return;
      pause();
    };
  }
  // the OS drives this element directly, so its level simply stays up
  if (v.gain && v.level === 0) {
    v.level = 1;
    v.gain.gain.value = 1;
  }
  return v.gain as AudioNode;
}

function setLevel(v: Voice, level: number, seconds: number) {
  v.level = level;
  if (v.gain) fadeParam(v.gain.gain, level, seconds);
  else v.el.volume = Math.min(1, Math.max(0, level));
}

// The previous owner fades out and is paused.
function claim(owner: Owner) {
  const s = state();
  if (s.owner === owner) return;
  s.owner = owner;
  s.voices.forEach((v) => {
    if (v.owner && v.owner !== owner && (!v.el.paused || v.want)) voiceStop(v, 0.8);
  });
}

// One retry on the next gesture when the browser refuses to start a voice
// without one (Safari).
function retryOnGesture(v: Voice) {
  const go = () => {
    window.removeEventListener("pointerdown", go, true);
    window.removeEventListener("keydown", go, true);
    if (v.want && v.el.paused) void v.el.play().catch(() => (v.want = false));
  };
  window.addEventListener("pointerdown", go, true);
  window.addEventListener("keydown", go, true);
}

// Start (or carry on) a voice and fade it to `level`. Playing a voice that is
// already playing never restarts it.
export function voicePlay(v: Voice | null, { fade = 0.4, level = 1 }: { fade?: number; level?: number } = {}) {
  if (!v) return;
  const s = state();
  window.clearTimeout(v.timer);
  v.timer = 0;
  v.want = true;
  resumeAudio();
  if (v.owner) claim(v.owner);
  setLevel(v, level, fade);
  if (s.suspended) {
    // asked for while the tab is hidden: it starts when the tab returns
    v.resume = true;
    return;
  }
  if (v.el.paused)
    void v.el.play().catch((e: unknown) => {
      if ((e as { name?: string })?.name === "NotAllowedError") retryOnGesture(v);
      else if ((e as { name?: string })?.name !== "AbortError") v.want = false;
    });
}

// Play a file on a voice. The file it already holds simply carries on; a
// different one is swapped in under a short dip, never cut.
export function voicePlayUrl(v: Voice | null, url: string, o: { fade?: number; level?: number } = {}) {
  if (!v) return;
  if (v.el.getAttribute("src") === url) return voicePlay(v, o);
  window.clearTimeout(v.timer);
  const go = () => {
    v.timer = 0;
    v.el.src = url;
    voicePlay(v, o);
  };
  if (v.el.paused) return go();
  v.want = true;
  setLevel(v, 0, 0.15);
  v.timer = window.setTimeout(go, 190);
}

// Fade a voice out, then pause it. `release` also lets go of the file.
export function voiceStop(v: Voice | null, fade = 0.6, release = false) {
  if (!v) return;
  // already on its way out: the first fade stands
  if (!release && !v.want && v.level === 0 && v.timer) return;
  window.clearTimeout(v.timer);
  v.want = false;
  v.resume = false;
  if (v.el.paused && !release) {
    v.timer = 0;
    setLevel(v, 0, 0.05);
    return;
  }
  setLevel(v, 0, fade);
  v.timer = window.setTimeout(
    () => {
      v.timer = 0;
      v.el.pause();
      if (release) {
        v.el.removeAttribute("src");
        v.el.load();
      }
    },
    fade * 1000 + 80,
  );
}

// Send a voice somewhere else than straight into its channel (the ambience
// passes its recordings through its own filter and bus). Safe to call again.
export function voiceRoute(v: Voice | null, to: AudioNode) {
  if (!v?.gate) return;
  v.gate.disconnect();
  v.gate.connect(to);
}

// Change a voice's level without starting or stopping it.
export function voiceLevel(v: Voice | null, level: number, seconds: number) {
  if (v) setLevel(v, level, seconds);
}

// Who has the music right now, if anyone is audible.
export function musicOwner(): Owner | null {
  if (!hasAudio() || !(globalThis as G).__aosAudio) return null;
  return audible() ? state().owner : null;
}

export function stopOwner(owner: Owner, fade: number, release = false) {
  if (!hasAudio() || !(globalThis as G).__aosAudio) return;
  const s = state();
  s.voices.forEach((v) => v.owner === owner && voiceStop(v, fade, release));
  if (s.owner === owner) s.owner = null;
}

// ---------------------------------------------------------------------------
// the mute pill

// True when the 3D world is silent: the pill is off, or the OS Sound setting is.
export function sceneMuted() {
  if (typeof window === "undefined") return false;
  return prefs().muted || !soundOn();
}
export function setSceneMuted(m: boolean) {
  if (typeof window === "undefined") return;
  const s = prefs();
  s.muted = m;
  try {
    window.localStorage.setItem(MUTE_KEY, m ? "0" : "1");
  } catch {
    /* ignore */
  }
  // asking for sound in the world also turns the system's sound back on
  if (!m && !soundOn()) useOS.getState().setSound(true);
  applyGates();
  s.listeners.forEach((l) => l());
}
export function onMuteChange(l: () => void) {
  if (typeof window === "undefined") return () => {};
  const s = prefs();
  s.listeners.add(l);
  return () => {
    s.listeners.delete(l);
  };
}

// ---------------------------------------------------------------------------
// life cycle: hidden tab, Sound setting, room <-> OS

function onVisibility() {
  const s = (globalThis as G).__aosAudio;
  if (!s) return;
  window.clearTimeout(s.hideTimer);
  if (!visible()) {
    applyGates();
    // after the short fade: stop the elements and put the context to sleep
    s.hideTimer = window.setTimeout(() => {
      if (visible()) return;
      s.voices.forEach((v) => {
        if (!v.el.paused) {
          v.resume = true;
          v.el.pause();
        }
      });
      if (s.ctx.state === "running") {
        s.suspended = true;
        void s.ctx.suspend().catch(() => {});
      }
    }, 320);
    return;
  }
  if (s.suspended) {
    s.suspended = false;
    void s.ctx.resume().catch(() => {});
  }
  s.voices.forEach((v) => {
    if (!v.resume) return;
    v.resume = false;
    if (v.want) void v.el.play().catch(() => (v.want = false));
  });
  applyGates();
}

if (typeof window !== "undefined") {
  const p = prefs();
  // a reloaded module replaces the old module's listeners
  p.teardown?.();
  const unsub = useOS.subscribe((s, prev) => {
    if (s.sound !== prev.sound) {
      applyGates();
      p.listeners.forEach((l) => l());
    }
    if (!(globalThis as G).__aosAudio) return;
    if (s.phase !== prev.phase) {
      if (s.phase === "room") stopOwner("records", 0.8);
      else if (prev.phase === "room") {
        stopOwner("headphones", 1.2);
        stopOwner("flight", 1.2, true);
      }
    }
    if (s.restarting && !prev.restarting) stopOwner("records", 0.8);
  });
  document.addEventListener("visibilitychange", onVisibility);
  p.teardown = () => {
    unsub();
    document.removeEventListener("visibilitychange", onVisibility);
  };
  const live = (globalThis as G).__aosAudio;
  if (DEV && live) devHook(live);
  // a hot reload can rebuild the store without a phase change ever being
  // seen: whatever belongs to the other side of the glass stops now
  if (live) {
    if (useOS.getState().phase === "room") stopOwner("records", 0.8);
    else {
      stopOwner("headphones", 0.8);
      stopOwner("flight", 0.8, true);
    }
  }
}

// ---------------------------------------------------------------------------
// what the music is doing, for the world to listen to

// The sky leans toward evening while something plays and breathes with its
// energy. `playing` is true while a music voice (headphones, flight, Records)
// is audible; `level` and `bass` (0..1) are smoothed in sampleMusic, once a
// frame, from the shared analyser.
function audible() {
  if (!hasAudio() || !(globalThis as G).__aosAudio) return false;
  const s = state();
  for (const v of s.voices.values()) {
    if (v.owner && !v.el.paused && v.level > 0 && gateOf(v) > 0 && !(v.el.muted || v.el.volume === 0)) return true;
  }
  return false;
}
export const music = {
  get playing() {
    return audible();
  },
  level: 0,
  bass: 0,
};
let fbuf: Uint8Array<ArrayBuffer> | null = null;
export function sampleMusic(dt: number) {
  let lvl = 0;
  let bass = 0;
  if (music.playing) {
    const { analyser } = state();
    fbuf ??= new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(fbuf);
    let a = 0;
    for (let i = 1; i <= 96; i++) a += fbuf[i];
    let b = 0;
    for (let i = 1; i <= 8; i++) b += fbuf[i];
    lvl = Math.min(1, (a / 96 / 255) * 2.2);
    bass = Math.min(1, (b / 8 / 255) * 1.25);
  }
  const k = (cur: number, to: number) => cur + (to - cur) * (1 - Math.exp(-dt * (to > cur ? 14 : 2.4)));
  music.level = k(music.level, lvl);
  music.bass = k(music.bass, bass);
}

// ---------------------------------------------------------------------------
// the Piano app's notes

export function note(midi: number, when = 0, dur = 1.8, vel = 0.8) {
  if (!useOS.getState().sound) return;
  // real sampled grand (lib/piano.ts); the synth below is only a fallback
  resumeAudio();
  if (playPiano(midi, { when, vel, dur: Math.max(dur, 1.2) })) return;
  const { ctx, master } = audioGraph();
  const t = ctx.currentTime + when;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  const partials: [OscillatorType, number, number][] = [
    ["triangle", 1, 1],
    ["sine", 2, 0.22],
    ["sine", 3, 0.06],
  ];
  for (const [type, mult, amp] of partials) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * amp, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
    track("piano", o, `synth ${midi}`);
  }
}

// A slow placeholder progression for the Records app (D♭ major, 60 bpm).
const CHORDS = [
  [49, 56, 61, 65, 68],
  [46, 53, 58, 61, 65],
  [42, 54, 58, 61, 66],
  [44, 56, 60, 63, 68],
];

export function playSketch(): { stop: () => void; length: number } {
  if (!useOS.getState().sound) return { stop: () => {}, length: 0 };
  const timers: number[] = [];
  const bar = 2;
  CHORDS.concat(CHORDS).forEach((chord, i) => {
    chord.forEach((m, j) => {
      const delay = i * bar + (j === 0 ? 0 : 0.35 * j);
      timers.push(window.setTimeout(() => note(m, 0, j === 0 ? 3.2 : 2.4, j === 0 ? 0.7 : 0.45), delay * 1000));
    });
  });
  return { stop: () => timers.forEach(clearTimeout), length: CHORDS.length * 2 * bar };
}

// ---------------------------------------------------------------------------
// Development only: window.__audio, for checking the life cycle from the
// console (never present in a production build).
//
//   __audio.report()   { ctx, visible, sound, muted, owner, sink, channels,
//                        voices: [{ id, owner, channel, paused, t, src, level
//                        (gain now), target, gate, want }],
//                        elements: every media element that ever played, with
//                        the voice it belongs to (null = an orphan),
//                        sources: live buffer/oscillator nodes per channel,
//                        music: { playing, level, bass }, analyser: mean 0..1 }
//   __audio.check()    { ok, problems[] }: at most one music owner audible,
//                        no orphan element playing, no voice playing at zero
//   __audio.voices     the registry (Map)
//   __audio.stop(owner, fade)
// ---------------------------------------------------------------------------
function devHook(s: State) {
  const proto = HTMLMediaElement.prototype as HTMLMediaElement & { __aosWrapped?: boolean };
  if (!proto.__aosWrapped) {
    proto.__aosWrapped = true;
    const play = proto.play;
    proto.play = function (this: HTMLMediaElement) {
      (globalThis as G).__aosAudio?.played.add(this);
      return play.call(this);
    };
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const file = (el: HTMLMediaElement) => (el.currentSrc || el.src || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 80);
  const report = () => {
    const bins = new Uint8Array(s.analyser.frequencyBinCount);
    s.analyser.getByteFrequencyData(bins);
    let sum = 0;
    for (let i = 1; i <= 96; i++) sum += bins[i];
    return {
      ctx: s.ctx.state,
      visible: visible(),
      sound: soundOn(),
      muted: prefs().muted,
      owner: s.owner,
      sink: r3(s.sink.gain.value),
      channels: Object.fromEntries(CHANNELS.map((c) => [c, r3(s.channels[c].gain.value)])),
      voices: [...s.voices.values()].map((v) => ({
        id: v.id,
        owner: v.owner,
        channel: v.channel,
        paused: v.el.paused,
        t: r3(v.el.currentTime),
        src: file(v.el),
        level: v.gain ? r3(v.gain.gain.value) : r3(v.el.volume),
        target: v.level,
        gate: v.gate ? r3(v.gate.gain.value) : 1,
        want: v.want,
      })),
      elements: [...s.played].map((el) => ({ voice: s.byEl.get(el)?.id ?? null, paused: el.paused, t: r3(el.currentTime), src: file(el) })),
      sources: Object.fromEntries(CHANNELS.map((c) => [c, [...s.nodes[c]].map((n) => n.label)])),
      music: { playing: music.playing, level: r3(music.level), bass: r3(music.bass) },
      analyser: r3(sum / 96 / 255),
    };
  };
  const check = () => {
    const problems: string[] = [];
    const live = [...s.voices.values()].filter((v) => v.owner && !v.el.paused);
    const loud = live.filter((v) => (v.gain ? v.gain.gain.value : v.el.volume) > 0.02);
    // an owner on its way out (fading, pause pending) may overlap the next one
    const owners = new Set(loud.filter((v) => v.want).map((v) => v.owner));
    if (owners.size > 1) problems.push(`several music owners audible: ${[...owners].join(", ")}`);
    const settled = live.filter((v) => !v.want && !v.timer);
    settled.forEach((v) => problems.push(`${v.id} is playing but nobody wants it`));
    [...s.voices.values()].forEach((v) => {
      if (!v.el.paused && v.level === 0 && !v.timer) problems.push(`${v.id} is playing at zero with no pause pending`);
    });
    s.played.forEach((el) => {
      const v = s.byEl.get(el);
      if (!el.paused && (!v || s.voices.get(v.id) !== v)) problems.push(`orphan element playing: ${file(el)}`);
    });
    return { ok: problems.length === 0, problems, audible: loud.map((v) => `${v.id}@${r3(v.gain ? v.gain.gain.value : v.el.volume)}`) };
  };
  Object.assign(window, { __audio: { report, check, voices: s.voices, state: s, stop: stopOwner, mute: setSceneMuted } });
}
