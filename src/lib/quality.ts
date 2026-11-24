import { useSyncExternalStore } from "react";

// Graphics quality for the 3D world: four presets plus Auto. Auto makes a
// first guess from the device (GPU name, memory, cores, phone or not) and
// then listens to the real frame time, stepping down when frames run long
// and cautiously back up when there is plenty of room, with hysteresis so it
// never flickers. A few sliders override single aspects. Everything is
// remembered in localStorage.
//
// The scene reads `useQuality()`; the OS Settings app can show the same
// control with `useQualityChoice()`, `setQualityChoice()` and
// `setQualityOverride()`.

export type Preset = "low" | "medium" | "high" | "ultra";
export type QualityChoice = Preset | "auto";
export type Quality = {
  preset: Preset;
  dpr: number; // device pixel ratio cap
  grass: number; // blade count multiplier
  trees: number; // 0..1 share of trees and foliage detail
  shadows: number; // shadow map size, 0 = off
  effects: number; // 0..1: mist bands, particles, glow
  far: number; // draw distance multiplier for the flight
  post: number; // the lens: 0 off, 1 bloom and grade, 2 + depth of field, god rays, painterly pass, 3 more taps
  budget: number; // the most pixels drawn, in millions (the resolution setting, or the gear's own)
  fps: number; // the frame rate cap, 0 = none
};

export const PRESETS: Record<Preset, Quality> = {
  low: { preset: "low", dpr: 1, grass: 0.3, trees: 0.5, shadows: 512, effects: 0.3, far: 0.6, post: 0, budget: 1.2, fps: 0 },
  medium: { preset: "medium", dpr: 1.25, grass: 0.6, trees: 0.75, shadows: 1024, effects: 0.6, far: 0.8, post: 1, budget: 1.6, fps: 0 },
  high: { preset: "high", dpr: 1.5, grass: 1, trees: 1, shadows: 2048, effects: 1, far: 1, post: 2, budget: 2.6, fps: 0 },
  ultra: { preset: "ultra", dpr: 2, grass: 1.5, trees: 1, shadows: 4096, effects: 1, far: 1.25, post: 3, budget: 4.2, fps: 0 },
};
// The settings beyond the preset. Choosing a preset sets them to its own; changing any of them makes the choice
// "custom" (the preset row then shows none lit). Resolution caps the pixels drawn (the render scale under it);
// the frame rate cap paces the frame loop (Room.tsx FramePacer); Quality is the gear itself (lens, shadows, grass,
// detail).
export type Res = "auto" | "720" | "1080" | "1440" | "2160";
export const RES_LABELS: Record<Res, string> = { auto: "Auto", "720": "720p", "1080": "1080p", "1440": "1440p", "2160": "4K" };
// (in this order: numeric keys of an object always come first)
export const RES_CHOICES: Res[] = ["auto", "720", "1080", "1440", "2160"];
const RES_MP: Record<Exclude<Res, "auto">, number> = { "720": 0.93, "1080": 2.08, "1440": 3.7, "2160": 8.3 };
export const FPS_CHOICES = [24, 30, 60, 120, 0] as const;
export type Fps = (typeof FPS_CHOICES)[number];
export const FPS_LABELS: Record<Fps, string> = { 24: "24", 30: "30", 60: "60", 120: "120", 0: "Unlimited" };
export const PRESET_LABELS: Record<Preset, string> = { low: "Low", medium: "Medium", high: "High", ultra: "Ultra" };
// The lens a gear draws with. Low has no lens of its own, but on a computer it keeps a light one: the scene through
// the steadying, the glow and the finish, without occlusion, depth of field or rays. Without the steadying every
// edge, leaf and blade crawled at Low as the eye moved (a still view turned a tenth of a pixel a frame: 10-12 % of
// the pixels went there and back, against under 1 % with it), for the cost of three passes over the frame.
// A phone (whose pixels are too small for that flicker to show) still draws Low straight to the screen.
const COARSE = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
export const lensOf = (q: Quality) => (q.post > 0 ? q.post : COARSE ? 0 : 0.5);
const ORDER: Preset[] = ["low", "medium", "high", "ultra"];
export const QUALITY_LABELS: Record<QualityChoice, string> = { auto: "Auto", low: "Low", medium: "Medium", high: "High", ultra: "Ultra" };

export type QualityOverrides = { resolution?: number; grass?: number; effects?: number };
type State = { choice: QualityChoice | "custom"; auto: Preset; ceiling: Preset; overrides: QualityOverrides; res: Res; fps: Fps; level: Preset };

const KEY = "ag-quality";
// what Auto settled on the last time this machine was here: the next visit begins on it
const KEY_AUTO = "ag-quality-auto";

// The card's name. Asking for it used to mean making a whole WebGL context and throwing it away, before anything
// else could begin: on a slowed machine that was over a second of the loader. Now the scene's own context is asked,
// once it exists (noteGpu, from the lens), and the answer is kept for the next visit; on a first visit the guess is
// made without it, and the frames behind the loader correct it if it was too high.
const KEY_GPU = "ag-gpu";
function gpuName() {
  try {
    return window.localStorage.getItem(KEY_GPU) ?? "";
  } catch {
    return "";
  }
}
export function noteGpu(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase() : "";
    if (!name || name === gpuName()) return;
    window.localStorage.setItem(KEY_GPU, name);
    // (a card known to be weak: down at once, behind the loader. Never up in mid-visit: that waits for next time)
    const s = get();
    const p = detectPreset();
    if (s.choice === "auto" && ORDER.indexOf(p) < ORDER.indexOf(s.auto)) {
      s.auto = p;
      s.ceiling = p;
      emit(false);
    }
  } catch {
    /* no name: the guess stands */
  }
}

// First guess, before a single frame has been timed.
export function detectPreset(): Preset {
  if (typeof window === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Mobi|Android|iPhone|iPad/i.test(nav.userAgent) || window.matchMedia("(max-width: 767px)").matches;
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const gpu = gpuName();
  const weak = /swiftshader|llvmpipe|software|mali-4|mali-t|adreno \(tm\) [2-5]|powervr|intel(?!.*(iris|arc|xe))/.test(gpu);
  const strong = /apple m\d|apple gpu|rtx|radeon rx|geforce gtx 1[06-9]|arc a\d/.test(gpu);
  if (weak || mem <= 2 || cores <= 2) return "low";
  if (mobile) return mem >= 6 && cores >= 6 ? "medium" : "low";
  if (strong && mem >= 8 && cores >= 8) return "high";
  // (anything not known to be strong starts at Medium: Auto steps it up within a quarter of a minute if frames are short)
  return "medium";
}

function remembered(): Preset | null {
  try {
    const k = JSON.parse(window.localStorage.getItem(KEY_AUTO) ?? "null") as { gear?: Preset; at?: number } | null;
    // (kept for a month: a machine may have been busy that day, or have a new GPU since)
    if (k && k.gear && ORDER.includes(k.gear) && typeof k.at === "number" && Date.now() - k.at < 30 * 864e5) return k.gear;
  } catch {
    /* nothing kept */
  }
  return null;
}
function remember(gear: Preset) {
  try {
    window.localStorage.setItem(KEY_AUTO, JSON.stringify({ gear, at: Date.now() }));
  } catch {
    /* not kept */
  }
}
function load(): State {
  let auto = detectPreset();
  // The gear is chosen before the scene is shown. First from what this machine could hold last time (never higher
  // than the guess from its hardware); then, behind the loader, from the frames themselves (see `early` below).
  const was = typeof window !== "undefined" ? remembered() : null;
  if (was && ORDER.indexOf(was) < ORDER.indexOf(auto)) auto = was;
  // (Auto may climb to Ultra: it steps up only while frames stay short, and down as soon as they do not)
  const s: State = { choice: "auto", auto, ceiling: "ultra", overrides: {}, res: "auto", fps: 0, level: auto };
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as Partial<State>;
      if (p.choice && (p.choice === "auto" || p.choice === "custom" || ORDER.includes(p.choice))) s.choice = p.choice;
      if (p.overrides && typeof p.overrides === "object") s.overrides = p.overrides;
      if (p.res && p.res in RES_LABELS) s.res = p.res;
      if (typeof p.fps === "number" && (FPS_CHOICES as readonly number[]).includes(p.fps)) s.fps = p.fps as Fps;
      if (p.level && ORDER.includes(p.level)) s.level = p.level;
    }
  } catch {
    /* storage blocked or stale: defaults */
  }
  return s;
}

let state: State | null = null;
let snapshot: Quality | null = null;
const subs = new Set<() => void>();
const get = () => (state ??= load());

function compute(): Quality {
  const s = get();
  const base = PRESETS[s.choice === "auto" ? s.auto : s.choice === "custom" ? s.level : s.choice];
  const o = s.overrides;
  return {
    ...base,
    budget: s.res === "auto" ? base.budget : RES_MP[s.res],
    fps: s.fps,
    dpr: o.resolution !== undefined ? 0.75 + o.resolution * 1.25 : base.dpr,
    grass: o.grass !== undefined ? 0.2 + o.grass * 1.3 : base.grass,
    effects: o.effects !== undefined ? o.effects : base.effects,
  };
}
function emit(save = true) {
  snapshot = compute();
  if (save) {
    try {
      const g = get();
      window.localStorage.setItem(KEY, JSON.stringify({ choice: g.choice, overrides: g.overrides, res: g.res, fps: g.fps, level: g.level }));
    } catch {
      /* ignore */
    }
  }
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

export const getQuality = () => (snapshot ??= compute());
export const getQualityChoice = () => get().choice;
export const getQualitySettings = () => ({ res: get().res, fps: get().fps, level: get().choice === "auto" ? get().auto : get().choice === "custom" ? get().level : (get().choice as Preset) });
export const getQualityOverrides = () => get().overrides;
export function setQualityChoice(c: QualityChoice) {
  const s = get();
  s.choice = c;
  s.overrides = {};
  // (a preset sets everything under it: its own resolution budget, no frame cap, its own quality)
  s.res = "auto";
  s.fps = 0;
  s.level = c === "auto" ? s.auto : c;
  emit();
}
// any one setting changed by hand: the choice becomes "custom", keeping the rest as they stand
function custom(f: (s: State) => void) {
  const s = get();
  if (s.choice !== "custom") s.level = s.choice === "auto" ? s.auto : s.choice;
  s.choice = "custom";
  f(s);
  emit();
}
export const setResolution = (r: Res) => custom((s) => (s.res = r));
export const setFrameCap = (f: Fps) => custom((s) => (s.fps = f));
export const setQualityLevel = (l: Preset) => custom((s) => (s.level = l));
export function setQualityOverride(k: keyof QualityOverrides, v: number | undefined) {
  get().overrides = { ...get().overrides, [k]: v };
  emit();
}

const SERVER = PRESETS.high;
export function useQuality() {
  return useSyncExternalStore(subscribe, getQuality, () => SERVER);
}
export function useQualityChoice() {
  return useSyncExternalStore(subscribe, getQualityChoice, () => "auto" as QualityChoice | "custom");
}
let setSnap: ReturnType<typeof getQualitySettings> | null = null;
const SERVER_SET = { res: "auto" as Res, fps: 0 as Fps, level: "high" as Preset };
export function useQualitySettings() {
  return useSyncExternalStore(
    subscribe,
    () => {
      const n = getQualitySettings();
      if (!setSnap || setSnap.res !== n.res || setSnap.fps !== n.fps || setSnap.level !== n.level) setSnap = n;
      return setSnap;
    },
    () => SERVER_SET,
  );
}

// ---- live adaptation (Auto only) ----
// Feed it every frame's delta (seconds). Averages over a window; steps down
// after ~3 s of slow frames, up after ~12 s of fast ones, never more often
// than every 8 s, and never above one step over the device's first guess.
let acc = 0;
let frames = 0;
let slowFor = 0;
let fastFor = 0;
let lastStep = 0;
// `up: false` while flying: a step up mid-flight would rebuild grass, trees and the shadow map in the air (a
// hitch for nothing); it waits for the desk. A step down is still taken, the device needs it.
// The first seconds of a visit are the loader and the arrival. Room times the frames it draws hidden behind the
// loader as well as those of the descent, and they all come here: that is the benchmark. A step UP there would
// rebuild the lens, the grass and the shadows in the middle of the one shot that must be seamless, so there is
// none until the camera has settled. The way DOWN is quick and as far as it needs to be: the middle frame of the
// last sixteen (so a stall while a shader is made does not count) over budget, and the gear drops at once: one
// step if it is a little slow, two under 22 frames a second, three under 14, so a weak machine is on its own
// gear before the loader lifts instead of walking down to it through the descent. Again three quarters of a
// second later if that was not enough. Wherever Auto ends up is remembered for the next visit.
const SETTLE_MS = 16000;
const EARLY = new Float32Array(16);
let earlyN = 0;
let firstReport = 0;
function early(dt: number, t: number) {
  const s = get();
  if (s.choice !== "auto" || dt <= 0) return;
  EARLY[earlyN++ % EARLY.length] = Math.min(dt, 0.5);
  if (earlyN < EARLY.length || t - lastStep < 750) return;
  const mid = Array.from(EARLY).sort((a, b) => a - b)[EARLY.length >> 1];
  const i = ORDER.indexOf(s.auto);
  // (over budget: slower than 34 frames a second, which sixteen such frames make half a second of)
  if (mid <= 1 / 34 || i <= 0) return;
  s.auto = ORDER[Math.max(0, i - (mid > 1 / 14 ? 3 : mid > 1 / 22 ? 2 : 1))];
  remember(s.auto);
  s.ceiling = s.auto;
  window.setTimeout(() => (get().ceiling = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(get().auto) + 1)]), 60000);
  lastStep = t;
  earlyN = 0;
  emit(false);
}
// ---- the card's own time (Auto only) ----
// A frame's length on screen is the display's beat (16.7 ms at 60 Hz) however much room the card has, so the frame
// loop alone cannot tell a gear that holds sixty with room to spare from one that only just does. The lens times
// one frame in twenty to the end of its work on the card (and every fourth one for the first seconds of a visit,
// which is the start-up benchmark behind the loader) and reports it here. Auto aims at 12 ms: over 12.5 it steps
// down at once (two gears over 24), and it climbs only when the next gear up would still be under 12.
const GPU: number[] = [];
const gpuMed = () => {
  if (GPU.length < 5) return 0;
  const b = [...GPU].sort((x, y) => x - y);
  return b[b.length >> 1];
};
export function reportGpu(ms: number) {
  const s = get();
  if (s.choice !== "auto" || ms <= 0 || ms > 250) return;
  GPU.push(ms);
  if (GPU.length > 9) GPU.shift();
  const med = gpuMed();
  const now = performance.now();
  if (!med || now - lastStep < 2500) return;
  const i = ORDER.indexOf(s.auto);
  if (med > 12.5 && i > 0) {
    s.auto = ORDER[Math.max(0, i - (med > 24 ? 2 : 1))];
    s.ceiling = s.auto;
    window.setTimeout(() => (get().ceiling = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(get().auto) + 1)]), 60000);
    lastStep = now;
    slowFor = fastFor = 0;
    GPU.length = 0;
    remember(s.auto);
    emit(false);
  }
}

export function reportFrame(dt: number, up = true) {
  const s = get();
  const t = performance.now();
  if (!firstReport) firstReport = t;
  if (t - firstReport < SETTLE_MS) return early(dt, t);
  if (s.choice !== "auto" || dt <= 0 || dt > 0.5) return;
  // (a frame cap makes frames long on purpose: Auto does not read them while one is set)
  if (s.fps > 0) return;
  acc += dt;
  frames++;
  if (acc < 1) return;
  const avg = acc / frames;
  acc = 0;
  frames = 0;
  // (Auto holds about sixty frames a second: under 48 for three seconds is a step down)
  slowFor = avg > 1 / 48 ? slowFor + 1 : 0;
  fastFor = avg < 1 / 57 ? fastFor + 1 : 0;
  const now = performance.now();
  if (now - lastStep < 8000) return;
  const i = ORDER.indexOf(s.auto);
  if (slowFor >= 3 && i > 0) {
    s.auto = ORDER[i - 1];
    // a step down is remembered as the ceiling for a while: don't bounce
    s.ceiling = s.auto;
    window.setTimeout(() => (get().ceiling = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(get().auto) + 1)]), 60000);
  } else if (up && fastFor >= 12 && i < ORDER.indexOf(s.ceiling) && (!gpuMed() || gpuMed() * 1.45 < 12)) {
    s.auto = ORDER[i + 1];
    GPU.length = 0;
  } else return;
  lastStep = now;
  slowFor = fastFor = 0;
  remember(s.auto);
  emit(false);
}

// ---- render scale ----
// Each gear draws at most this many pixels (millions). At 1280 x 720 and 1920 x 1080 every gear above Low draws
// every pixel; on a big screen the lower gears draw fewer and the picture is laid on the screen smoothly (the
// steadying keeps edges calm): a 2560 x 1440 window is 3.7 million pixels, which at Medium is a third more work in
// every pass than the gear is meant for.
export const PIXEL_BUDGET: Record<Preset, number> = { low: 1.2, medium: 2.2, high: 2.6, ultra: 4.2 };
// Under that, a dynamic scale: a fallback for a view the gear cannot hold. Changing it resizes every target of the
// lens (a long frame), so it moves rarely and never in flight: a step down after four seconds of frames slower than
// 45 a second, a step up after eight seconds faster than 75, at least six seconds between steps, and while the
// plane is in the air it holds whatever it was (it stepped up and down every second or two before: the stutter).
const dyn = { k: 1, acc: 0, n: 0, slow: 0, fast: 0, last: 0 };
export function dynamicScale(dt: number, flying = false) {
  if (dt <= 0 || dt > 0.25) return dyn.k;
  dyn.acc += dt;
  dyn.n++;
  if (dyn.acc < 1) return dyn.k;
  const avg = dyn.acc / dyn.n;
  dyn.acc = 0;
  dyn.n = 0;
  dyn.slow = avg > 1 / 45 ? dyn.slow + 1 : 0;
  dyn.fast = avg < 1 / 75 ? dyn.fast + 1 : 0;
  const now = performance.now();
  if (flying || now - dyn.last < 6000) return dyn.k;
  if (dyn.slow >= 4 && dyn.k > 0.7) {
    dyn.k = Math.max(0.7, dyn.k - 0.15);
    dyn.slow = 0;
    dyn.last = now;
  } else if (dyn.fast >= 8 && dyn.k < 1) {
    dyn.k = Math.min(1, dyn.k + 0.15);
    dyn.fast = 0;
    dyn.last = now;
  }
  return dyn.k;
}
// the pixel ratio to draw at: the device's, within the gear's cap, under the gear's budget and the dynamic scale
export function drawRatio(q: Quality, cssW: number, cssH: number, mobile: boolean) {
  const native = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const base = Math.max(Math.min(1, q.dpr), Math.min(native, q.dpr, mobile ? 1.5 : 2));
  const px = Math.max(1, cssW * cssH * base * base);
  const budget = Math.min(1, Math.sqrt((q.budget * 1e6) / px));
  return base * budget * dyn.k;
}
