import { audioGraph, resumeAudio } from "@/lib/audio";
import { playPiano, preloadPiano } from "@/lib/piano";

// The sound of the place itself. Nothing recorded: shaped noise for the wind
// in the grass and for water, small synthesised birds by day, crickets after
// dark, and a very sparse piano bed, a few slow notes of D-flat pentatonic on
// the real sampled grand. It starts on the first gesture (browsers require
// one) and can be muted; the choice is remembered.

const KEY = "ag-ambience";
let muted = false;
try {
  if (typeof window !== "undefined") muted = window.localStorage.getItem(KEY) === "0";
} catch {
  /* storage blocked */
}

type Scene = { night: number; water: number; speed: number; boost: number; active: boolean };
const scene: Scene = { night: 0, water: 0, speed: 0, boost: 0, active: true };

type Rig = {
  ctx: AudioContext;
  out: GainNode;
  wind: GainNode;
  windBand: BiquadFilterNode;
  rustle: GainNode;
  water: GainNode;
  crickets: GainNode;
  rush: GainNode;
  rushBand: BiquadFilterNode;
  whoosh: GainNode;
};
let rig: Rig | null = null;
let timer = 0;
let nextBird = 0;
let nextNote = 0;
let lastBoost = 0;
const listeners = new Set<() => void>();

function noise(ctx: AudioContext, seconds: number, pink: boolean) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  let l = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    l = pink ? l * 0.985 + w * 0.12 : w;
    d[i] = pink ? l * 3 : w;
  }
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.loop = true;
  s.start();
  return s;
}

// a slow wandering control signal: two detuned LFOs summed into a param
function wander(ctx: AudioContext, param: AudioParam, base: number, depth: number, f1: number, f2: number) {
  param.value = base;
  [f1, f2].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = depth * (i ? 0.6 : 1);
    o.connect(g).connect(param);
    o.start();
  });
}

function build(): Rig {
  const { ctx } = audioGraph();
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);

  // wind: pink noise through a wide band whose centre and level drift
  const wind = ctx.createGain();
  const windBand = ctx.createBiquadFilter();
  windBand.type = "bandpass";
  windBand.Q.value = 0.45;
  wander(ctx, windBand.frequency, 420, 170, 0.071, 0.113);
  wander(ctx, wind.gain, 0.3, 0.14, 0.053, 0.137);
  noise(ctx, 4, true).connect(windBand).connect(wind).connect(out);

  // the grass: thin, bright, shivering with each gust
  const rustle = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3600;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 8200;
  wander(ctx, rustle.gain, 0.03, 0.022, 0.19, 0.31);
  noise(ctx, 3, false).connect(hp).connect(lp).connect(rustle).connect(out);

  // water: a soft lapping band, only near the lake and over the sea
  const water = ctx.createGain();
  water.gain.value = 0;
  const wb = ctx.createBiquadFilter();
  wb.type = "bandpass";
  wb.Q.value = 0.9;
  wander(ctx, wb.frequency, 950, 380, 0.23, 0.37);
  const lap = ctx.createGain();
  wander(ctx, lap.gain, 0.55, 0.4, 0.17, 0.29);
  noise(ctx, 3, true).connect(wb).connect(lap).connect(water).connect(out);

  // crickets: a high tone chopped into quick trills that come and go
  const crickets = ctx.createGain();
  crickets.gain.value = 0;
  [4350, 4720, 5100].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const chop = ctx.createGain();
    chop.gain.value = 0;
    const trill = ctx.createOscillator();
    trill.type = "square";
    trill.frequency.value = 27 + i * 4;
    const depth = ctx.createGain();
    wander(ctx, depth.gain, 0.012, 0.012, 0.31 + i * 0.13, 0.47 + i * 0.07);
    trill.connect(depth).connect(chop.gain);
    o.connect(chop).connect(crickets);
    o.start();
    trill.start();
  });
  crickets.connect(out);

  // flight: air rushing past, rising with speed, and a whoosh through each streak
  const rush = ctx.createGain();
  rush.gain.value = 0;
  const rushBand = ctx.createBiquadFilter();
  rushBand.type = "bandpass";
  rushBand.Q.value = 0.7;
  rushBand.frequency.value = 500;
  noise(ctx, 3, true).connect(rushBand).connect(rush).connect(out);
  const whoosh = ctx.createGain();
  whoosh.gain.value = 0;
  const wf = ctx.createBiquadFilter();
  wf.type = "bandpass";
  wf.Q.value = 1.4;
  wf.frequency.value = 1300;
  noise(ctx, 2, false).connect(wf).connect(whoosh).connect(out);

  return { ctx, out, wind, windBand, rustle, water, crickets, rush, rushBand, whoosh };
}

// a small bird: two or three quick falling or rising chirps, far off to one side
function bird(r: Rig) {
  const { ctx, out } = r;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(pan).connect(out);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.connect(g);
  const base = 2300 + Math.random() * 1900;
  const n = 2 + Math.floor(Math.random() * 3);
  let t = ctx.currentTime + 0.05;
  const vol = 0.012 + Math.random() * 0.016;
  for (let i = 0; i < n; i++) {
    const up = Math.random() > 0.4;
    const len = 0.06 + Math.random() * 0.07;
    o.frequency.setValueAtTime(base * (up ? 0.86 : 1.15), t);
    o.frequency.exponentialRampToValueAtTime(base * (up ? 1.18 : 0.85) * (1 + i * 0.04), t + len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    t += len + 0.05 + Math.random() * 0.09;
  }
  o.start();
  o.stop(t + 0.1);
}

// D-flat major pentatonic, low to high
const SCALE = [49, 56, 61, 63, 65, 68, 70, 73, 75, 77];
let lastIdx = 3;
function pianoNote() {
  // a short step from the last note, sometimes with a low root under it
  lastIdx = Math.min(SCALE.length - 1, Math.max(2, lastIdx + Math.floor(Math.random() * 5) - 2));
  playPiano(SCALE[lastIdx], { vel: 0.16 + Math.random() * 0.1, dur: 7 });
  if (Math.random() < 0.3) playPiano(SCALE[Math.floor(Math.random() * 2)], { vel: 0.14, dur: 8, when: 0.02 });
  if (Math.random() < 0.25) playPiano(SCALE[Math.min(SCALE.length - 1, lastIdx + 2)], { vel: 0.12, dur: 6, when: 0.9 + Math.random() * 0.6 });
}

function tick() {
  const r = rig;
  if (!r) return;
  const t = r.ctx.currentTime;
  const on = !muted && scene.active && document.visibilityState === "visible";
  r.out.gain.setTargetAtTime(on ? 1 : 0, t, 0.6);
  r.water.gain.setTargetAtTime(scene.water * 0.2, t, 0.8);
  r.crickets.gain.setTargetAtTime(scene.night > 0.6 ? 0.9 : 0, t, 2);
  const fly = Math.min(1, scene.speed / 16);
  r.rush.gain.setTargetAtTime(fly * fly * 0.42, t, 0.3);
  r.rushBand.frequency.setTargetAtTime(380 + fly * 900, t, 0.3);
  // the edge of a streak: a quick swell
  if (scene.boost > 0.25 && lastBoost <= 0.25) {
    r.whoosh.gain.cancelScheduledValues(t);
    r.whoosh.gain.setValueAtTime(r.whoosh.gain.value, t);
    r.whoosh.gain.linearRampToValueAtTime(0.16, t + 0.18);
    r.whoosh.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
  }
  lastBoost = scene.boost;
  if (!on) return;
  const now = performance.now();
  if (scene.night < 0.35 && now > nextBird) {
    bird(r);
    nextBird = now + 2600 + Math.random() * 7000;
  }
  // the piano bed rests while his own music is playing (flight or headphones)
  if (now > nextNote) {
    if (scene.speed < 1) pianoNote();
    nextNote = now + 5200 + Math.random() * 7800;
  }
}

// Call from the first user gesture. Safe to call again.
export function startAmbience() {
  if (typeof window === "undefined" || typeof AudioContext === "undefined" || rig) return;
  try {
    resumeAudio();
    rig = build();
    preloadPiano(48, 78);
    nextBird = performance.now() + 3000;
    nextNote = performance.now() + 6000;
    timer = window.setInterval(tick, 200);
    tick();
  } catch {
    rig = null;
  }
}

export function stopAmbience() {
  window.clearInterval(timer);
  rig?.out.gain.setTargetAtTime(0, rig.ctx.currentTime, 0.2);
}

// What the scene is doing, written once a frame (cheap: plain numbers).
export function ambienceScene(s: Partial<Scene>) {
  Object.assign(scene, s);
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
