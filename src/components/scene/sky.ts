import * as THREE from "three";
import { nowS } from "./shared";

// Live sky tied to the visitor's clock. A stylised day (sunrise 06:30, noon
// 13:00, sunset 19:30) so every visitor gets a full cycle whatever the season.
// Dev override: ?time=HH:MM. Every shader shares SKY_U, so one update per
// frame recolours the sky, fog, grass, mountains and lights together.

export const DAY = { rise: 6.5, set: 19.5, maxElev: 52 };

// Time-of-day preview from the control bar (null = live).
let override: number | null = null;
export function setTimeOverride(h: number | null) {
  override = h;
}
export function getTimeOverride() {
  return override;
}

export function clockHours(): number {
  if (override !== null) return override;
  if (typeof window !== "undefined") {
    const m = /[?&]time=(\d{1,2}):(\d{2})/.exec(window.location.search);
    if (m) return Math.min(23.99, +m[1] + +m[2] / 60);
  }
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

// Coming home out of the kings' little world, the field is found at golden hour whatever the hour really
// is: the light the dome was full of. It is held a few breaths, then the day drifts back to the visitor's
// own time over a minute, the short way round the clock. (Choosing an hour by hand ends it.)
export const GOLDEN_HOUR = 19.1;
const ARRIVAL = { hold: 12, drift: 60 };
let arrivedAt: number | null = null;
export function arriveGolden() {
  arrivedAt = nowS();
}
// the hour the home sky should show while that lasts; null when it is simply the clock's
export function arrivalHours(): number | null {
  if (arrivedAt === null) return null;
  const t = (nowS() - arrivedAt - ARRIVAL.hold) / ARRIVAL.drift;
  if (override !== null || t >= 1) {
    arrivedAt = null;
    return null;
  }
  const k = t <= 0 ? 0 : t * t * t * (t * (t * 6 - 15) + 10);
  const delta = ((((clockHours() - GOLDEN_HOUR) % 24) + 36) % 24) - 12;
  return (((GOLDEN_HOUR + delta * k) % 24) + 24) % 24;
}

const deg = Math.PI / 180;
const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

// Sun elevation (degrees) and direction for an hour of the day.
export function sunAt(h: number) {
  const span = DAY.set - DAY.rise;
  const u = (h - DAY.rise) / span; // 0 sunrise .. 1 sunset
  let elev: number;
  if (u >= 0 && u <= 1) elev = Math.sin(Math.PI * u) * DAY.maxElev;
  else {
    // below the horizon: dip to -40 deg at local midnight
    const night = u < 0 ? -u * span : (u - 1) * span; // hours since sunset / before sunrise
    const nightLen = 24 - span;
    const k = Math.min(night, nightLen - night) / (nightLen / 2);
    elev = -Math.sin((Math.PI / 2) * Math.min(1, k)) * 40 - 0.5;
  }
  // azimuth: rises back-right, swings in front (behind the camera) at noon, sets back-left
  const uu = Math.min(1.2, Math.max(-0.2, u));
  const th = -0.3 + uu * (Math.PI + 0.6);
  const e = elev * deg;
  const dir = new THREE.Vector3(Math.cos(th) * Math.cos(e), Math.sin(e), Math.sin(th) * Math.cos(e) - 0.0).normalize();
  // nudge the low sun a little behind the desk so sunsets show in frame
  if (elev < 18) dir.z -= (1 - Math.max(0, elev) / 18) * 0.25;
  dir.normalize();
  return { elev, dir };
}

type Key = {
  e: number;
  zenith: THREE.Color;
  upper: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  amb: THREE.Color;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  night: number;
  exposure: number;
};

// Palettes keyed on sun elevation (degrees). Linear RGB, pre-tonemap.
const KEYS: Key[] = [
  { e: -40, zenith: C(0.002, 0.004, 0.012), upper: C(0.005, 0.009, 0.026), horizon: C(0.016, 0.024, 0.05), glow: C(0, 0, 0), sun: C(0.5, 0.6, 0.9), sunI: 0, amb: C(0.03, 0.045, 0.09), cloudLit: C(0.05, 0.06, 0.1), cloudShade: C(0.012, 0.016, 0.03), night: 1, exposure: 1.5 },
  { e: -14, zenith: C(0.003, 0.006, 0.018), upper: C(0.008, 0.014, 0.038), horizon: C(0.03, 0.04, 0.08), glow: C(0.02, 0.02, 0.04), sun: C(0.5, 0.6, 0.9), sunI: 0, amb: C(0.035, 0.05, 0.1), cloudLit: C(0.06, 0.07, 0.12), cloudShade: C(0.015, 0.02, 0.04), night: 1, exposure: 1.45 },
  { e: -6, zenith: C(0.02, 0.045, 0.13), upper: C(0.06, 0.1, 0.24), horizon: C(0.34, 0.27, 0.4), glow: C(0.55, 0.26, 0.2), sun: C(0.6, 0.5, 0.7), sunI: 0, amb: C(0.1, 0.12, 0.22), cloudLit: C(0.42, 0.28, 0.36), cloudShade: C(0.08, 0.09, 0.16), night: 0.55, exposure: 1.3 },
  { e: 1, zenith: C(0.07, 0.13, 0.32), upper: C(0.24, 0.27, 0.45), horizon: C(1.0, 0.52, 0.28), glow: C(1.0, 0.45, 0.18), sun: C(1.0, 0.48, 0.22), sunI: 1.8, amb: C(0.28, 0.27, 0.4), cloudLit: C(1.2, 0.6, 0.38), cloudShade: C(0.3, 0.26, 0.4), night: 0, exposure: 1.0 },
  { e: 10, zenith: C(0.075, 0.16, 0.38), upper: C(0.22, 0.34, 0.56), horizon: C(0.8, 0.7, 0.6), glow: C(1.0, 0.6, 0.3), sun: C(1.0, 0.7, 0.44), sunI: 2.8, amb: C(0.32, 0.4, 0.56), cloudLit: C(1.15, 0.9, 0.74), cloudShade: C(0.42, 0.46, 0.58), night: 0, exposure: 0.92 },
  { e: 30, zenith: C(0.06, 0.17, 0.44), upper: C(0.17, 0.34, 0.66), horizon: C(0.62, 0.72, 0.82), glow: C(1.0, 0.86, 0.68), sun: C(1.0, 0.93, 0.84), sunI: 3.2, amb: C(0.38, 0.48, 0.66), cloudLit: C(1.25, 1.22, 1.18), cloudShade: C(0.55, 0.6, 0.7), night: 0, exposure: 0.85 },
  { e: 60, zenith: C(0.05, 0.16, 0.45), upper: C(0.15, 0.33, 0.68), horizon: C(0.6, 0.72, 0.84), glow: C(1.0, 0.92, 0.8), sun: C(1.0, 0.96, 0.9), sunI: 3.3, amb: C(0.4, 0.5, 0.7), cloudLit: C(1.3, 1.28, 1.25), cloudShade: C(0.58, 0.63, 0.73), night: 0, exposure: 0.84 },
];

// fx: how much of the sky's own furniture shows: [soft cloud layers, the long bars over the horizon, the sun's disc, stars]
export type SkyState = Omit<Key, "e"> & { elev: number; sunDir: THREE.Vector3; moonDir: THREE.Vector3; keyDir: THREE.Vector3; keyCol: THREE.Color; keyI: number; label: string; fx: [number, number, number, number] };

const tmpA = new THREE.Color();
export function skyState(h: number): SkyState {
  const { elev, dir } = sunAt(h);
  let i = 0;
  while (i < KEYS.length - 2 && elev > KEYS[i + 1].e) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = THREE.MathUtils.clamp((elev - a.e) / (b.e - a.e), 0, 1);
  const s = t * t * (3 - 2 * t);
  const mix = (x: THREE.Color, y: THREE.Color) => x.clone().lerp(y, s);
  const n = (x: number, y: number) => x + (y - x) * s;
  // moon: up at night, opposite-ish to the sun, held where it reads well in frame
  const moonDir = new THREE.Vector3(0.3, 0.3, -0.9).normalize();
  const night = n(a.night, b.night);
  const sunUp = THREE.MathUtils.smoothstep(elev, -3, 2);
  const keyDir = sunUp > 0.5 ? dir.clone() : moonDir.clone();
  if (keyDir.y < 0.08) keyDir.y = 0.08;
  keyDir.normalize();
  const moonCol = C(0.55, 0.66, 1.0);
  const keyCol = sunUp > 0.5 ? mix(a.sun, b.sun) : moonCol;
  const keyI = sunUp > 0.5 ? n(a.sunI, b.sunI) : 0.55 * night;
  const label = elev < -12 ? "Night" : elev < -1 ? "Blue hour" : elev < 12 ? (h < 13 ? "Sunrise" : "Golden hour") : "Day";
  tmpA.set(0, 0, 0);
  return {
    elev,
    sunDir: dir,
    moonDir,
    keyDir,
    keyCol,
    keyI,
    zenith: mix(a.zenith, b.zenith),
    upper: mix(a.upper, b.upper),
    horizon: mix(a.horizon, b.horizon),
    glow: mix(a.glow, b.glow),
    sun: mix(a.sun, b.sun),
    sunI: n(a.sunI, b.sunI),
    amb: mix(a.amb, b.amb),
    cloudLit: mix(a.cloudLit, b.cloudLit),
    cloudShade: mix(a.cloudShade, b.cloudShade),
    night,
    exposure: n(a.exposure, b.exposure),
    label,
    fx: [1, 1, 1, 1],
  };
}

// ---------- the air of a painted world ----------
// In flight every world brings its whole sky with it: not an hour of our day
// but a palette taken from its painting. An Air is written the way you would
// mix it (linear colour, before the lens), and becomes a SkyState.
export type Air = {
  label: string;
  zenith: [number, number, number];
  upper: [number, number, number];
  horizon: [number, number, number];
  glow: [number, number, number];
  amb: [number, number, number]; // the colour of shade
  key: [number, number, number]; // the colour of the light
  keyI: number;
  sunAz: number; // degrees, 0 = straight ahead (-z), positive to the right
  sunEl: number; // degrees above the horizon (below zero: no sun in this sky)
  keyAz?: number; // the light itself, when it is not the sun (a moon, a glow)
  keyEl?: number;
  cloudLit: [number, number, number];
  cloudShade: [number, number, number];
  night: number;
  exposure: number;
  fx: [number, number, number, number];
};
const dirOf = (az: number, el: number) => {
  const a = az * deg;
  const e = el * deg;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
};
export function airState(a: Air): SkyState {
  const sunDir = dirOf(a.sunAz, a.sunEl);
  const keyDir = dirOf(a.keyAz ?? a.sunAz, Math.max(4, a.keyEl ?? a.sunEl));
  return {
    elev: a.sunEl,
    sunDir,
    moonDir: a.sunEl < 0 ? keyDir.clone() : new THREE.Vector3(0.3, 0.3, -0.9).normalize(),
    keyDir,
    keyCol: C(...a.key),
    keyI: a.keyI,
    zenith: C(...a.zenith),
    upper: C(...a.upper),
    horizon: C(...a.horizon),
    glow: C(...a.glow),
    sun: C(...a.key),
    sunI: a.keyI,
    amb: C(...a.amb),
    cloudLit: C(...a.cloudLit),
    cloudShade: C(...a.cloudShade),
    night: a.night,
    exposure: a.exposure,
    label: a.label,
    fx: a.fx,
  };
}
// One sky into another (t 0..1): used only behind closed mist, so the cloud itself changes colour smoothly.
export function mixSky(a: SkyState, b: SkyState, t: number): SkyState {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const c = (x: THREE.Color, y: THREE.Color) => x.clone().lerp(y, t);
  const d = (x: THREE.Vector3, y: THREE.Vector3) => x.clone().lerp(y, t).normalize();
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    elev: n(a.elev, b.elev),
    sunDir: d(a.sunDir, b.sunDir),
    moonDir: d(a.moonDir, b.moonDir),
    keyDir: d(a.keyDir, b.keyDir),
    keyCol: c(a.keyCol, b.keyCol),
    keyI: n(a.keyI, b.keyI),
    zenith: c(a.zenith, b.zenith),
    upper: c(a.upper, b.upper),
    horizon: c(a.horizon, b.horizon),
    glow: c(a.glow, b.glow),
    sun: c(a.sun, b.sun),
    sunI: n(a.sunI, b.sunI),
    amb: c(a.amb, b.amb),
    cloudLit: c(a.cloudLit, b.cloudLit),
    cloudShade: c(a.cloudShade, b.cloudShade),
    night: n(a.night, b.night),
    exposure: n(a.exposure, b.exposure),
    label: t < 0.5 ? a.label : b.label,
    fx: [n(a.fx[0], b.fx[0]), n(a.fx[1], b.fx[1]), n(a.fx[2], b.fx[2]), n(a.fx[3], b.fx[3])],
  };
}

// Shared uniforms. Spread into a ShaderMaterial's uniforms: the {value}
// objects are shared, so writing them once updates every material.
export const SKY_U = {
  uSunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  uMoonDir: { value: new THREE.Vector3(0.5, 0.4, -0.7).normalize() },
  uKeyDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  uKeyCol: { value: new THREE.Color(1, 0.8, 0.6) },
  uSkyCol: { value: new THREE.Color(0.3, 0.4, 0.55) },
  uZenith: { value: new THREE.Color() },
  uUpper: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uGlow: { value: new THREE.Color() },
  uCloudLit: { value: new THREE.Color() },
  uCloudShade: { value: new THREE.Color() },
  uNight: { value: 0 },
  uTime: { value: 0 },
  uMist: { value: 0 },
  // 0..1, the energy of whatever music is playing
  uPulse: { value: 0 },
  // clouds, bars, sun disc, stars: see SkyState.fx
  uSkyFx: { value: new THREE.Vector4(1, 1, 1, 1) },
};

export function applySky(s: SkyState) {
  SKY_U.uSunDir.value.copy(s.sunDir);
  SKY_U.uMoonDir.value.copy(s.moonDir);
  SKY_U.uKeyDir.value.copy(s.keyDir);
  SKY_U.uKeyCol.value.copy(s.keyCol).multiplyScalar(s.keyI);
  SKY_U.uSkyCol.value.copy(s.amb);
  SKY_U.uZenith.value.copy(s.zenith);
  SKY_U.uUpper.value.copy(s.upper);
  SKY_U.uHorizon.value.copy(s.horizon);
  SKY_U.uGlow.value.copy(s.glow);
  SKY_U.uCloudLit.value.copy(s.cloudLit);
  SKY_U.uCloudShade.value.copy(s.cloudShade);
  SKY_U.uNight.value = s.night;
  SKY_U.uSkyFx.value.set(s.fx[0], s.fx[1], s.fx[2], s.fx[3]);
}
applySky(skyState(14));

// Sky radiance without clouds, sun disc, moon or stars. Used as fog colour.
export const GLSL_SKY = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform vec3 uKeyDir; uniform vec3 uKeyCol; uniform vec3 uSkyCol;
uniform vec3 uZenith; uniform vec3 uUpper; uniform vec3 uHorizon; uniform vec3 uGlow;
uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uNight; uniform float uTime; uniform float uMist; uniform float uPulse; uniform vec4 uSkyFx;
vec3 skyBase(vec3 d){
  float h = d.y;
  float hp = max(h, 0.0);
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 col = mix(uHorizon, uUpper, smoothstep(0.0, 0.3, pow(hp, 0.8)));
  col = mix(col, uZenith, smoothstep(0.2, 0.95, hp));
  float sunVis = smoothstep(-0.35, 0.05, uSunDir.y);
  // warmer along the horizon toward the sun
  float az = pow(sd, 5.0);
  col = mix(col, uGlow * 1.1, az * (1.0 - smoothstep(0.0, 0.32, hp)) * 0.75 * sunVis);
  // cool band opposite the sun
  float anti = pow(max(dot(d, -uSunDir), 0.0), 2.0);
  col = mix(col, uHorizon * vec3(0.85, 0.85, 1.05), anti * (1.0 - smoothstep(0.0, 0.3, hp)) * 0.3);
  // haze below the horizon
  col = mix(col, uHorizon * 0.78, smoothstep(0.0, -0.06, h));
  // forward scattering
  col += uGlow * (pow(sd, 9.0) * 0.22 + pow(sd, 60.0) * 0.75) * sunVis;
  return col;
}
`;
