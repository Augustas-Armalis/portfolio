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
};

export const PRESETS: Record<Preset, Quality> = {
  low: { preset: "low", dpr: 1, grass: 0.3, trees: 0.5, shadows: 512, effects: 0.3, far: 0.6, post: 0 },
  medium: { preset: "medium", dpr: 1.25, grass: 0.6, trees: 0.75, shadows: 1024, effects: 0.6, far: 0.8, post: 1 },
  high: { preset: "high", dpr: 1.5, grass: 1, trees: 1, shadows: 2048, effects: 1, far: 1, post: 2 },
  ultra: { preset: "ultra", dpr: 2, grass: 1.5, trees: 1, shadows: 4096, effects: 1, far: 1.25, post: 3 },
};
const ORDER: Preset[] = ["low", "medium", "high", "ultra"];
export const QUALITY_LABELS: Record<QualityChoice, string> = { auto: "Auto", low: "Low", medium: "Medium", high: "High", ultra: "Ultra" };

export type QualityOverrides = { resolution?: number; grass?: number; effects?: number };
type State = { choice: QualityChoice; auto: Preset; ceiling: Preset; overrides: QualityOverrides };

const KEY = "ag-quality";
// what Auto settled on the last time this machine was here: the next visit begins on it
const KEY_AUTO = "ag-quality-auto";

// First guess, before a single frame has been timed.
export function detectPreset(): Preset {
  if (typeof window === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = /Mobi|Android|iPhone|iPad/i.test(nav.userAgent) || window.matchMedia("(max-width: 767px)").matches;
  const mem = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  let gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* no WebGL info: fall through */
  }
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
  const s: State = { choice: "auto", auto, ceiling: ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(auto) + 1)], overrides: {} };
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (raw) {
      const p = JSON.parse(raw) as Partial<State>;
      if (p.choice && (p.choice === "auto" || ORDER.includes(p.choice))) s.choice = p.choice;
      if (p.overrides && typeof p.overrides === "object") s.overrides = p.overrides;
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
  const base = PRESETS[s.choice === "auto" ? s.auto : s.choice];
  const o = s.overrides;
  return {
    ...base,
    dpr: o.resolution !== undefined ? 0.75 + o.resolution * 1.25 : base.dpr,
    grass: o.grass !== undefined ? 0.2 + o.grass * 1.3 : base.grass,
    effects: o.effects !== undefined ? o.effects : base.effects,
  };
}
function emit(save = true) {
  snapshot = compute();
  if (save) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ choice: get().choice, overrides: get().overrides }));
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
export const getQualityOverrides = () => get().overrides;
export function setQualityChoice(c: QualityChoice) {
  get().choice = c;
  get().overrides = {};
  emit();
}
export function setQualityOverride(k: keyof QualityOverrides, v: number | undefined) {
  get().overrides = { ...get().overrides, [k]: v };
  emit();
}

const SERVER = PRESETS.high;
export function useQuality() {
  return useSyncExternalStore(subscribe, getQuality, () => SERVER);
}
export function useQualityChoice() {
  return useSyncExternalStore(subscribe, getQualityChoice, () => "auto" as QualityChoice);
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
export function reportFrame(dt: number, up = true) {
  const s = get();
  const t = performance.now();
  if (!firstReport) firstReport = t;
  if (t - firstReport < SETTLE_MS) return early(dt, t);
  if (s.choice !== "auto" || dt <= 0 || dt > 0.5) return;
  acc += dt;
  frames++;
  if (acc < 1) return;
  const avg = acc / frames;
  acc = 0;
  frames = 0;
  slowFor = avg > 1 / 38 ? slowFor + 1 : 0;
  fastFor = avg < 1 / 57 ? fastFor + 1 : 0;
  const now = performance.now();
  if (now - lastStep < 8000) return;
  const i = ORDER.indexOf(s.auto);
  if (slowFor >= 3 && i > 0) {
    s.auto = ORDER[i - 1];
    // a step down is remembered as the ceiling for a while: don't bounce
    s.ceiling = s.auto;
    window.setTimeout(() => (get().ceiling = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(get().auto) + 1)]), 60000);
  } else if (up && fastFor >= 12 && i < ORDER.indexOf(s.ceiling)) s.auto = ORDER[i + 1];
  else return;
  lastStep = now;
  slowFor = fastFor = 0;
  remember(s.auto);
  emit(false);
}
