import * as THREE from "three";
import type { UserId } from "@/content";

// Real-world scale, metres. The desk sits at the origin, top surface at DESK.top.
export const DESK = { w: 1.4, d: 0.7, top: 0.74, t: 0.036 };

// Studio-style 27" display. Active area is 16:9.
export const MONITOR = { w: 0.6232, h: 0.3627, d: 0.0168, aw: 0.5966, ah: 0.3356, tilt: -0.07, y: 1.035, z: -0.11 };
// Phone (mobile only), leaning on a small stand.
export const PHONE = { w: 0.0716, h: 0.1476, d: 0.0083, r: 0.0105, aw: 0.0672, ah: 0.1432, ar: 0.0088, lean: -0.26 };


// The boot frame, in CSS px from the viewport centre (y down). The 3D screen
// shader and the DOM veil both draw from these numbers, so the hand-off is exact.
export const BOOT = {
  markY: -26,
  markH: 42,
  markW: 34,
  stroke: 4.2,
  barY: 46,
  barW: 156,
  barH: 4,
};

// Monotonic seconds. R3F resets its clock when the frameloop is paused and
// resumed (the scene sleeps under the OS), so timing never uses it.
export const nowS = () => performance.now() / 1000;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);

// Damped spring step response, 0 -> 1. zeta < 1 gives a small overshoot.
export function spring(t: number, omega: number, zeta: number) {
  if (t <= 0) return 0;
  if (zeta >= 1) return 1 - Math.exp(-omega * t) * (1 + omega * t);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
}

// Boot progress over time (s): quick start, a short think, then a clean finish.
export const BOOT_T = { power: 0.25, total: 2.0 };
export function bootProgress(t: number) {
  const a = clamp01((t - 0.35) / 0.55);
  const b = clamp01((t - 1.05) / 0.8);
  return 0.38 * smooth(a) + 0.62 * easeInOutCubic(b);
}

export type ObjKind = "keys" | "headphones" | "sketchbook" | "book" | "camera";
export type Placement = { kind: ObjKind; target: UserId; label: string; pos: [number, number, number]; rot: number; from: [number, number, number]; spin: number };

export const LAYOUT: Record<"desktop" | "mobile", Placement[]> = {
  // styled like a product shot: display centre-back, keys in front of it,
  // sketchbook front-left, the novel left-back, headphones standing right,
  // camera front-right turned toward the viewer, plane front-centre-right
  desktop: [
    { kind: "keys", target: "art", label: "Art", pos: [0.0, 0, 0.15], rot: 0.07, from: [0, 0.55, 0.5], spin: 0.25 },
    { kind: "book", target: "art", label: "Art", pos: [-0.47, 0, -0.15], rot: -0.2, from: [-0.6, 0.6, -0.1], spin: -0.6 },
    { kind: "sketchbook", target: "engineer", label: "Product engineer", pos: [-0.42, 0, 0.13], rot: 0.3, from: [-0.6, 0.55, 0.45], spin: 0.5 },
    { kind: "headphones", target: "art", label: "Art", pos: [0.45, 0, -0.08], rot: -0.6, from: [0.6, 0.6, 0.45], spin: -0.55 },
    { kind: "camera", target: "founder", label: "Founder", pos: [0.44, 0, 0.19], rot: -0.62, from: [0.6, 0.6, -0.1], spin: 0.6 },
  ],
  mobile: [
    { kind: "keys", target: "art", label: "Art", pos: [0, 0, 0.215], rot: 0, from: [0, 0.5, 0.4], spin: 0.25 },
    { kind: "book", target: "art", label: "Art", pos: [-0.205, 0, -0.07], rot: 0.18, from: [-0.4, 0.55, -0.1], spin: -0.6 },
    { kind: "sketchbook", target: "engineer", label: "Product engineer", pos: [-0.2, 0, 0.07], rot: -0.3, from: [-0.4, 0.5, 0.3], spin: 0.5 },
    { kind: "headphones", target: "art", label: "Art", pos: [0.2, 0, 0.06], rot: -0.6, from: [0.4, 0.55, 0.3], spin: -0.55 },
    { kind: "camera", target: "founder", label: "Founder", pos: [0.19, 0, -0.13], rot: -0.5, from: [0.4, 0.55, -0.1], spin: 0.6 },
  ],
};

// Orbit rig: spherical coordinates around a target. Angles in radians;
// polar is measured from straight up.
export type RigCfg = {
  target: [number, number, number];
  az: number;
  pol: number;
  r: number;
  fov: number;
  azMin: number;
  azMax: number;
  polMin: number;
  polMax: number;
  rMin: number;
  rMax: number;
};
export const RIG: Record<"desktop" | "mobile", RigCfg> = {
  desktop: { target: [0.04, 0.98, 0], az: 0.34, pol: 1.47, r: 2.0, fov: 36, azMin: -0.95, azMax: 0.95, polMin: 1.12, polMax: 1.5, rMin: 1.45, rMax: 2.7 },
  mobile: { target: [0, 0.9, 0.02], az: 0.22, pol: 1.3, r: 1.5, fov: 50, azMin: -0.85, azMax: 0.85, polMin: 1.0, polMax: 1.45, rMin: 1.1, rMax: 2.0 },
};

// ---------- shared GLSL ----------

export const GLSL_NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}
`;

export { GLSL_SKY } from "./sky";

// A dirt path that winds past the right side of the desk and away toward the
// mountains. Same curve in JS (grass scatter) and GLSL (ground paint).
export const pathX = (z: number) => 1.45 + 0.85 * Math.sin(z * 0.15 + 0.35) + 0.6 * Math.sin(z * 0.043 - 1.1);
export const pathW = (z: number) => 0.32 + Math.abs(z) * 0.006;
export const GLSL_PATH = /* glsl */ `
float pathX(float z){ return 1.45 + 0.85 * sin(z * 0.15 + 0.35) + 0.6 * sin(z * 0.043 - 1.1); }
float pathW(float z){ return 0.32 + abs(z) * 0.006; }
`;

// Where the paper plane rests on the desk (desk-top coordinates).
export const PLANE_SPOT: Record<"desktop" | "mobile", { pos: [number, number, number]; rot: number }> = {
  desktop: { pos: [0.255, 0, 0.255], rot: -0.42 },
  mobile: { pos: [0.205, 0, 0.27], rot: -0.35 },
};

// A still lake off to the back left: it reflects the sky.
export const LAKE = { x: -17, z: -34, rx: 19, rz: 7.5 };
export const lakeK = (x: number, z: number) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
export const GLSL_LAKE = /* glsl */ `
float lakeK(vec2 p){ return length(vec2((p.x - ${LAKE.x.toFixed(1)}) / ${LAKE.rx.toFixed(1)}, (p.y - ${LAKE.z.toFixed(1)}) / ${LAKE.rz.toFixed(1)})); }
`;
