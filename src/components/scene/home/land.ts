import * as THREE from "three";
import { HOME_GATE_Z, roadX } from "../flightPath";
import { pathW, pathX } from "../shared";
import { fieldK, GLSL_FIELDS, routeD, sacredH, SACRED, GLSL_SACRED, CHURCH, GLSL_CAVE, GLSL_RIVER, GLSL_TRACK, HILL, TOWN, journeyWood, laneD, riverD, riverLand, riverSlope, riverW, riverZ } from "./journey";

// The land the desk stands in, written once and read by everything that
// stands on it. The desk is at the origin and the visitor looks north (-z).
//
//   the field      level for 70 m round the desk and along the road to the gate
//   the meadows    low knolls rolling away on every side (a few metres high)
//   the lake       north-west of the desk, a hundred metres long, kidney-shaped
//   the hills      rising beyond 300 m to the north, east and west, wooded
//   the mountains  far to the north (their own meshes: see Mountains)
//   the coast      half a kilometre to the south the land runs down a beach into
//                  the sea, which wraps round far to the east and west
//
// The height is a sum of sines (no hashes), so the same few lines give exactly
// the same ground in JavaScript (where trees are stood on it) and in GLSL
// (where the ground mesh and every blade of grass are lifted onto it).
// Where the trees stand is decided here too and baked into two small maps the
// shaders read: a wide one of the woods (for the dark forest floor and the far
// canopy) and a fine one of every crown near the desk (for the shade under
// each tree and the long shadows they lay across the meadow at a low sun).

export const SEA = -9;
export const HLAKE = { x: -40, z: -66, rx: 38, rz: 17, y: -3.2 };
export const CLOUD = { base: 420, height: 250 };
const CLOUD_COVER = 0.4;
// The desk stands on the brow of a meadow. In front (north-west, where it looks) the ground falls a little to the
// lake and the valley, and beyond them the mountains stand. Behind it a short stretch of meadow, dunes, a beach,
// and the ocean. BAY.u is the way downhill from the desk.
export const BAY = { ux: -0.717, uz: -0.697 };
// how far the hillside falls (m), and over what run
const FALL = { drop: 6.5, run: 70 };

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- geography (JS) ----------
export function hLakeK(x: number, z: number) {
  const qx = (x - HLAKE.x) / HLAKE.rx;
  const qz = (z - HLAKE.z) / HLAKE.rz;
  const a = Math.atan2(qz, qx);
  return Math.hypot(qx, qz) / (1 + 0.15 * Math.sin(a * 3 + 0.7) + 0.08 * Math.sin(a * 5 + 2.1) + 0.05 * Math.sin(a * 9 + 4.0));
}
// the shore behind the desk: z of the waterline at x (a long shallow bay, 180 m off at its nearest)
export const coastZ = (x: number) => 150 - 0.0001 * x * x + 24 * Math.sin(x * 0.0041 + 0.9) + 8 * Math.sin(x * 0.0127 + 2.0);
// metres inland from the sea (negative: out at sea)
export const inland = (x: number, z: number) => coastZ(x) - z;
// how level the ground is held: 0 on the field, the road and round the lake; 1 out in the open land
export function landFree(x: number, z: number) {
  const r = Math.hypot(x, z);
  let f = sstep(70, 210, r);
  const rd = Math.abs(x - roadX(z));
  const onRoad = (1 - sstep(14, 60, rd)) * (z < 20 ? 1 : 0) * sstep(HOME_GATE_Z - 150, HOME_GATE_Z - 70, z);
  f *= 1 - onRoad;
  f *= sstep(1.3, 3.0, hLakeK(x, z));
  return f;
}
// The hillside: the desk stands on the brow of a meadow that falls away to the north-west, down to the lake and
// on to the sea. Metres fallen at a point (0 on the desk's own ground, along the road and everywhere east of it).
export function fallK(x: number, z: number) {
  const q = x * BAY.ux + z * BAY.uz;
  const d = Math.max(0, q - 5);
  const west = (roadX(z) - x) / (Math.hypot(x, z) + 6);
  return FALL.drop * (1 - Math.exp(-d / FALL.run)) * sstep(0.02, 0.3, west);
}
export function landH(x: number, z: number) {
  const r = Math.hypot(x, z);
  const wx = x + 18 * Math.sin(z * 0.013 + 1.7);
  const wz = z + 18 * Math.sin(x * 0.011 + 4.1);
  const k1 = Math.sin(wx * 0.021 + 0.6) * Math.sin(wz * 0.017 + 2.2);
  const k2 = Math.sin(wx * 0.047 - 1.1 + wz * 0.012) * Math.sin(wz * 0.039 + 0.4);
  const k3 = Math.sin(wx * 0.0061 + wz * 0.0083 + 3.3);
  const fall = fallK(x, z);
  let h = landFree(x, z) * (2.3 + 1.3 * k1 + 0.6 * k2 + 1.7 * k3) * (1 - 0.045 * fall) - fall;
  const c = inland(x, z); // metres inland
  const hill = sstep(230, 760, r) * sstep(120, 520, c);
  h += hill * (15 + 12 * Math.sin(wx * 0.0023 + wz * 0.0031 + 1.0) + 9 * Math.sin(wx * 0.0052 + 2.0) * Math.sin(wz * 0.0047 + 0.3));
  // the lake lies on a bench of the hillside
  const lk = hLakeK(x, z);
  h += (HLAKE.y + 0.35 - h) * (1 - sstep(1.12, 2.5, lk));
  // the shore: a low dune behind a beach, then down into the sea
  const beach = SEA + 1.5 * sstep(0, 30, c) + (2.4 * Math.exp(-((c - 50) * (c - 50)) / 420) + 1.5 * Math.exp(-((c - 84) * (c - 84)) / 300)) * (0.6 + 0.4 * Math.sin(x * 0.031 + 1.0));
  h = beach + (h - beach) * sstep(40, 118, c);
  h = h + (SEA - 8 - h) * (1 - sstep(-60, 4, c));
  // the river out of the lake's west end, its valley and the town on its banks (journey.ts)
  h = riverLand(h, x, z) + sacredH(x, z);
  // the lake's bed
  h += (HLAKE.y - 1.2 - h) * (1 - sstep(0.86, 1.1, lk));
  h -= 0.5 * (1 - sstep(0.3, 1.7, streamD(x, z)));
  return h;
}

// The brook: out of the wood east of the road, under the footbridge, into the lake's east end. z of its bed at x,
// and how far a point is from it (a large number where it does not run).
export const streamZ = (x: number) => -57 + 5 * Math.sin(x * 0.07 + 0.5) - 0.12 * x;
export function streamD(x: number, z: number) {
  if (x < -9 || x > 140) return 99;
  return Math.abs(z - streamZ(x)) + Math.max(0, x - 110) * 0.05 + Math.max(0, -5 - x) * 0.3;
}

// ---------- the places of the map ----------
// Things that stand in the land (made in Props): where they are is decided here, because the woods keep clear of
// them, they shade the grass, and the sounds of the place are hung on them.
function lakeRim(tx: number, tz: number) {
  // the point of the lake's rim on the way from its middle toward (tx, tz)
  const dx = tx - HLAKE.x;
  const dz = tz - HLAKE.z;
  const L = Math.hypot(dx, dz);
  let lo = 0;
  let hi = L;
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2;
    if (hLakeK(HLAKE.x + (dx / L) * m, HLAKE.z + (dz / L) * m) < 1) lo = m;
    else hi = m;
  }
  return { x: HLAKE.x + (dx / L) * lo, z: HLAKE.z + (dz / L) * lo, ux: -dx / L, uz: -dz / L };
}
function shoreZ(x: number) {
  return coastZ(x);
}
export const PLACES = (() => {
  const pierX = 1.45 + 0.85 * Math.sin(170 * 0.15 + 0.35) + 0.6 * Math.sin(170 * 0.043 - 1.1);
  return {
    // the pier at the end of the footpath behind the desk, the boat moored to it, the lantern at its head
    pier: { x: pierX, z0: shoreZ(pierX) - 7, z1: shoreZ(pierX) + 21 },
    // a short jetty on the lake's near shore
    jetty: lakeRim(-6, -30),
    bridge: { x: roadX(streamZ(1.5)), z: streamZ(1.5) },
    shrine: { x: 4.6, z: -27 },
    hay: [[-33, -15], [-44, -21], [-39.5, -28.5], [-57, -11], [-52, -30]] as [number, number][],
    village: { x: -64, z: -420 },
    // a farmstead (sodyba) across the meadow west of the lake: house, granary, well with a sweep, a stork's pole
    farm: { x: -122, z: -30 },
    lighthouse: { x: 150, z: shoreZ(150) - 16 },
    tower: { x: -282, z: -318 },
    fences: [
      [[9, -16], [10.5, -30], [10, -44], [12, -53]],
      [[-70, -2], [-52, -4], [-36, -1], [-24, -6]],
      [[-136, -16], [-123, -12], [-108, -15], [-103, -27]],
      [[14, 40], [26, 58], [30, 78]],
    ] as [number, number][][],
  };
})();
// the middles of the sea, the lake and the nearest woods, for whoever hangs sounds on the map
export const SOUNDS = {
  sea: { x: 0, z: 185, line: (x: number) => coastZ(x) },
  lake: { x: HLAKE.x, z: HLAKE.z, r: HLAKE.rx },
  woods: [[-58, -24], [34, -40], [-110, -150], [60, -160]] as [number, number][],
};

// ---------- geography (GLSL: the same lines) ----------
const f1 = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
export const GLSL_LAND = /* glsl */ `
const float SEA = ${f1(SEA)};
const float LAKE_Y = ${f1(HLAKE.y)};
float roadXh(float z){ return 1.45 + 0.6 * sin(z * 0.043 - 1.1) * min(1.0, abs(z) / 40.0); }
float hLakeK(vec2 p){
  vec2 q = (p - vec2(${f1(HLAKE.x)}, ${f1(HLAKE.z)})) / vec2(${f1(HLAKE.rx)}, ${f1(HLAKE.rz)});
  float a = atan(q.y, q.x);
  return length(q) / (1.0 + 0.15 * sin(a * 3.0 + 0.7) + 0.08 * sin(a * 5.0 + 2.1) + 0.05 * sin(a * 9.0 + 4.0));
}
float coastZ(float x){ return 150.0 - 0.0001 * x * x + 24.0 * sin(x * 0.0041 + 0.9) + 8.0 * sin(x * 0.0127 + 2.0); }
float inland(vec2 p){ return coastZ(p.x) - p.y; }
float streamD(vec2 p){
  if (p.x < -9.0 || p.x > 140.0) return 99.0;
  return abs(p.y - (-57.0 + 5.0 * sin(p.x * 0.07 + 0.5) - 0.12 * p.x)) + max(0.0, p.x - 110.0) * 0.05 + max(0.0, -5.0 - p.x) * 0.3;
}
${GLSL_RIVER}
${GLSL_TRACK}
${GLSL_CAVE}
${GLSL_SACRED}
${GLSL_FIELDS}
float landFree(vec2 p){
  float r = length(p);
  float f = smoothstep(70.0, 210.0, r);
  float rd = abs(p.x - roadXh(p.y));
  float onRoad = (1.0 - smoothstep(14.0, 60.0, rd)) * step(p.y, 20.0) * smoothstep(${f1(HOME_GATE_Z - 150)}, ${f1(HOME_GATE_Z - 70)}, p.y);
  f *= 1.0 - onRoad;
  f *= smoothstep(1.3, 3.0, hLakeK(p));
  return f;
}
float fallK(vec2 p){
  float q = dot(p, vec2(${f1(BAY.ux)}, ${f1(BAY.uz)}));
  float d = max(0.0, q - 5.0);
  float west = (roadXh(p.y) - p.x) / (length(p) + 6.0);
  return ${f1(FALL.drop)} * (1.0 - exp(-d / ${f1(FALL.run)})) * smoothstep(0.02, 0.3, west);
}
float landH(vec2 p){
  float r = length(p);
  vec2 w = p + 18.0 * vec2(sin(p.y * 0.013 + 1.7), sin(p.x * 0.011 + 4.1));
  float k1 = sin(w.x * 0.021 + 0.6) * sin(w.y * 0.017 + 2.2);
  float k2 = sin(w.x * 0.047 - 1.1 + w.y * 0.012) * sin(w.y * 0.039 + 0.4);
  float k3 = sin(w.x * 0.0061 + w.y * 0.0083 + 3.3);
  float fall = fallK(p);
  float h = landFree(p) * (2.3 + 1.3 * k1 + 0.6 * k2 + 1.7 * k3) * (1.0 - 0.045 * fall) - fall;
  float c = inland(p);
  float hill = smoothstep(230.0, 760.0, r) * smoothstep(120.0, 520.0, c);
  h += hill * (15.0 + 12.0 * sin(w.x * 0.0023 + w.y * 0.0031 + 1.0) + 9.0 * sin(w.x * 0.0052 + 2.0) * sin(w.y * 0.0047 + 0.3));
  float lk = hLakeK(p);
  h = mix(LAKE_Y + 0.35, h, smoothstep(1.12, 2.5, lk));
  float beach = SEA + 1.5 * smoothstep(0.0, 30.0, c) + (2.4 * exp(-((c - 50.0) * (c - 50.0)) / 420.0) + 1.5 * exp(-((c - 84.0) * (c - 84.0)) / 300.0)) * (0.6 + 0.4 * sin(p.x * 0.031 + 1.0));
  h = mix(beach, h, smoothstep(40.0, 118.0, c));
  h = mix(SEA - 8.0, h, smoothstep(-60.0, 4.0, c));
  h = riverLand(h, p) + sacredH(p);
  h = mix(LAKE_Y - 1.2, h, smoothstep(0.86, 1.1, lk));
  h -= 0.5 * (1.0 - smoothstep(0.3, 1.7, streamD(p)));
  return h;
}
vec3 landN(vec2 p){
  float e = 1.5;
  float h0 = landH(p);
  return normalize(vec3(h0 - landH(p + vec2(e, 0.0)), e, h0 - landH(p + vec2(0.0, e))));
}
`;

// ---------- the maps ----------
// forest: 512 px over +-FOREST_SPAN m. R: how wooded. G: the footpath. B: spare.
// crowns: 1024 px over +-CROWN_SPAN m. R: shade under each crown near the desk.
export const FOREST_SPAN = 1800;
export const CROWN_SPAN = 320;

export const HOME_U = {
  uForestMap: { value: null as THREE.Texture | null },
  uCrownMap: { value: null as THREE.Texture | null },
  uCloudTex: { value: null as THREE.Texture | null },
  // haze at the ground (per metre), its falloff with height, the cloud cover's threshold
  uAirK: { value: new THREE.Vector4(0.00125, 0.0045, 0.56, 0) },
  // a mist the air itself glows toward (rgb, how much): the journey's forest at night is moonlit fog, not darkness
  uFogGlow: { value: new THREE.Vector4(0.1, 0.13, 0.17, 0) },
};

// The air of the home world: haze that lies in the low land and thins with
// height (Quilez's integrated height fog), in the colour of the sky at the
// horizon behind whatever is looked at, warmer toward the sun. A few metres
// of it are nothing; a kilometre of it is the sky. And the shade of the
// clouds, which drift over all of it.
export const GLSL_HOME_AIR = /* glsl */ `
uniform sampler2D uForestMap; uniform sampler2D uCrownMap; uniform sampler2D uCloudTex; uniform vec4 uAirK; uniform vec4 uFogGlow;
float homeAirAmt(vec3 wpos){
  vec3 dv = wpos - cameraPosition; float dist = length(dv);
  float b = uAirK.y;
  float t = dv.y * b;
  float integ = abs(t) > 0.0005 ? (1.0 - exp(-t)) / t : 1.0;
  float od = dist * (uAirK.x * exp(-max(cameraPosition.y, 0.0) * b) * integ + uAirK.x * 0.06 + uMist);
  return clamp(1.0 - exp(-od), 0.0, 1.0);
}
// (looked down into from above, the air is not the horizon's own blaze but something cooler and quieter)
vec3 homeAirCol(vec3 d){
  vec3 c = skyBase(normalize(vec3(d.x, max(d.y, 0.0) * 0.55 + 0.02, d.z)));
  c = mix(c, mix(uUpper, uHorizon, 0.4) * 0.92, smoothstep(0.0, 0.45, -d.y) * 0.72);
  return mix(c, uFogGlow.rgb, uFogGlow.a);
}
// thin air is blue and adds little; only deep air is the pale horizon itself. So the middle distance keeps its
// colour and its darks, and it is the far land that goes into the sky.
vec3 homeAir(vec3 col, vec3 wpos){
  float a = homeAirAmt(wpos);
  vec3 far = homeAirCol(normalize(wpos - cameraPosition));
  vec3 thin = mix(uUpper, far, 0.35) * 0.82;
  return mix(col, mix(thin, far, smoothstep(0.1, 0.75, a)), a);
}
// the cumulus field (see the sky): how high the cloud stands over a point of the map, 0..1
vec2 cloudDrift(){ return vec2(uTime * 2.6, uTime * 0.9); }
float cloudCov(vec2 xz){
  vec2 q = xz + cloudDrift();
  float a = texture2D(uCloudTex, q / 2300.0).r;
  float b = texture2D(uCloudTex, q / 940.0 + 0.37).g;
  return smoothstep(uAirK.z, uAirK.z + 0.15, a * 0.62 + b * 0.38);
}
// the same field at a chosen blur (inside the sky's march, where the hardware cannot choose one itself)
float cloudCovL(vec2 xz, float lod){
  vec2 q = xz + cloudDrift();
  float a = textureLod(uCloudTex, q / 2300.0, lod).r;
  float b = textureLod(uCloudTex, q / 940.0 + 0.37, lod + 1.3).g;
  return smoothstep(uAirK.z, uAirK.z + 0.15, a * 0.62 + b * 0.38);
}
// the shade the clouds lay on the land (1: in the sun)
float cloudShade(vec3 p){
  vec3 L = uKeyDir;
  vec2 q = p.xz + L.xz / max(L.y, 0.16) * (${f1(CLOUD.base)} + ${f1(CLOUD.height)} * 0.3 - p.y);
  return 1.0 - 0.5 * cloudCov(q) * uCumulus;
}
// the woods, read off the wide map
float forestAt(vec2 p){ return texture2D(uForestMap, p / ${f1(FOREST_SPAN * 2)} + 0.5).r; }
// shade from the crowns: straight under them, and thrown along the sun (longer as it sinks)
float crownAt(vec2 p){
  vec2 uv = p / ${f1(CROWN_SPAN * 2)} + 0.5;
  vec2 e = smoothstep(vec2(0.0), vec2(0.03), uv) * smoothstep(vec2(0.0), vec2(0.03), 1.0 - uv);
  return texture2D(uCrownMap, uv).r * e.x * e.y;
}
float treeShade(vec3 p){
  vec3 L = uKeyDir;
  float under = crownAt(p.xz);
  float reach = min(9.0 / max(L.y, 0.09), 64.0);
  float thrown = crownAt(p.xz + normalize(L.xz + 1e-4) * reach * (1.0 - L.y)) * 0.85 + crownAt(p.xz + normalize(L.xz + 1e-4) * reach * 0.55 * (1.0 - L.y)) * 0.5;
  float woods = forestAt(p.xz);
  return (1.0 - 0.3 * under) * (1.0 - 0.72 * clamp(thrown, 0.0, 1.0)) * (1.0 - 0.35 * smoothstep(0.35, 0.9, woods));
}
`;

// ---------- the meadow's colours ----------
// One function for the paint of the field at any point: the blades take it,
// the ground under them takes it, and so does the land painted to the horizon,
// so nowhere does one end and another begin.
export const GLSL_FIELD = /* glsl */ `
// drifts of wildflowers: where they grow thick (0..1) and which colour leads there
float flowerDrift(vec2 p){
  float a = vnoise(p * 0.035 + 17.0) * 0.65 + vnoise(p * 0.11 + 5.0) * 0.35;
  return smoothstep(0.44, 0.7, a);
}
vec3 flowerHue(vec2 p){
  float k = vnoise(p * 0.021 + 31.0);
  vec3 c = mix(vec3(0.95, 0.93, 0.86), vec3(0.98, 0.78, 0.22), smoothstep(0.38, 0.5, k));
  c = mix(c, vec3(0.7, 0.55, 0.92), smoothstep(0.6, 0.7, k));
  return mix(c, vec3(0.95, 0.45, 0.5), smoothstep(0.8, 0.88, k));
}
// x: dry (0 fresh .. 1 dry), y: clump tone
vec2 fieldMix(vec2 p){
  float clump = vnoise(p * 0.42 + 11.0);
  float patchN = vnoise(p * 0.11 + 3.0);
  float broad = vnoise(p * 0.017 + 41.0);
  float dry = smoothstep(0.42, 0.86, patchN * 0.5 + clump * 0.2 + broad * 0.45);
  return vec2(dry, clamp(clump * 0.6 + patchN * 0.6 - 0.1, 0.0, 1.0));
}
vec3 fieldAlbK(vec2 m){
  vec3 fresh = vec3(0.075, 0.165, 0.036);
  vec3 warm = vec3(0.15, 0.215, 0.046);
  vec3 dry = vec3(0.235, 0.235, 0.075);
  vec3 c = mix(fresh, warm, smoothstep(0.0, 0.6, m.x));
  c = mix(c, dry, smoothstep(0.62, 1.0, m.x));
  return c * mix(0.74, 1.12, m.y);
}
vec3 fieldAlb(vec2 p){ return fieldAlbK(fieldMix(p)); }
// seen from far off a meadow is the tops of its grass: lighter and yellower than the blade's body. The blades and
// the ground under them both take this, so the field is one colour from the desk to the tree line
vec3 fieldFar(vec3 c, float dist){ return c * mix(vec3(1.0), vec3(1.16, 1.09, 0.82), smoothstep(6.0, 45.0, dist)); }
// the light of open ground (sh: 1 in the sun)
vec3 fieldLight(float sh){
  return uSkyCol * 0.62 + uKeyCol * (0.25 + 0.75 * max(uKeyDir.y, 0.0)) * sh * smoothstep(-0.02, 0.08, uKeyDir.y);
}
// the wind's long waves over the grass, the same field everywhere
float windWave(vec2 p){ return smoothstep(0.25, 0.85, vnoise(p * 0.22 - vec2(0.864, 0.503) * uTime * 0.55)); }
`;

// While this is on nothing of the world is drawn: the scene's programs are being compiled off the main thread
// behind the loader (see the room), and a draw would force each one to finish there and then.
export const HOLD = { on: false };

// While the desk is simply being looked at, the two shadow passes (the sun's map and the contact shadows) take
// turns, a frame each: nothing on the desk moves faster than that can follow.
export const CALM = { on: false, frame: 0 };

// how long each part of the world took to make (ms), for whoever is measuring the load: window.__gen
export function timed<T>(name: string, fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  const g = ((globalThis as unknown as { __gen?: Record<string, number> }).__gen ??= {});
  g[name] = Math.round(((g[name] ?? 0) + performance.now() - t0) * 10) / 10;
  return out;
}

// ---------- noise (JS) ----------
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, oct = 4) {
  let v = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x, y);
    const nx = 1.6 * x - 1.2 * y;
    y = 1.2 * x + 1.6 * y;
    x = nx;
    a *= 0.5;
  }
  return v;
}
export function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---------- where the woods are ----------
// 0..1: how wooded the land is at a point. Big masses of forest with ragged
// edges and small groves between, on every side; open meadow round the desk,
// a clear lane from the desk to the lake and the pass in the mountains, the
// road's own avenue, nothing on the beach or in water.
export function forestD(x: number, z: number) {
  const r = Math.hypot(x, z);
  const c = inland(x, z);
  if (c < 100) return 0;
  const lk = hLakeK(x, z);
  if (lk < 1.22) return 0;
  const big = fbm(x * 0.0042 + 3.1, z * 0.0042 - 7.7, 4);
  const mid = fbm(x * 0.013 - 11.0, z * 0.013 + 5.3, 3);
  let d = sstep(0.47, 0.6, big * 0.72 + mid * 0.28) + 0.55 * sstep(0.6, 0.72, mid) * sstep(0.36, 0.46, big);
  // thicker toward the hills, a belt of wood before the dunes
  d += 0.35 * sstep(500, 1100, r) * sstep(0.4, 0.5, big);
  // the meadow round the desk
  d *= sstep(52, 150, r);
  // the lane the desk looks down: toward the lake and the pass
  const ang = Math.atan2(-x, -z); // 0 north, + to the west (left of the view)
  const lane = Math.exp(-((ang - 0.42) * (ang - 0.42)) / 0.03) * (1 - sstep(140, 330, r));
  d *= 1 - 0.9 * lane;
  // the visitor's own side: a lane left open down the middle (the arrival comes down it, and the desk is come to
  // across a meadow), woods standing either side of it
  if (z > 4) d *= sstep(16, 64, Math.abs(x) + Math.max(0, 60 - z) * 0.2);
  // the road is lined, not overgrown
  if (z < 10 && z > HOME_GATE_Z - 80) {
    const rd = Math.abs(x - roadX(z));
    d *= sstep(6.5, 9.5, rd);
    // the avenue: a wood standing either side of the road, from a little way out
    d = Math.max(d, (1 - sstep(26, 70, rd)) * sstep(7.5, 10, rd) * sstep(-30, -70, z) * (0.55 + 0.45 * vnoise(x * 0.05, z * 0.03)));
  }
  // the old forest of the journey, from the town's edge to the mountain (journey.ts)
  d = Math.max(d, journeyWood(x, z) * (0.82 + 0.18 * mid));
  d *= sstep(100, 170, c) * sstep(1.22, 1.9, lk + mid * 0.5);
  // the town's ground and the river's banks are open
  d *= sstep(SACRED.foot - 6, SACRED.foot + 20, Math.hypot(x - SACRED.x, z - SACRED.z));
  // the farmland east of the road is open
  d *= 1 - 0.92 * fieldK(x, z);
  d *= sstep(TOWN.r - 18, TOWN.r + 26, Math.hypot(x - TOWN.x, z - TOWN.z)) * sstep(HILL.foot - 18, HILL.foot + 8, Math.hypot(x - HILL.x, z - HILL.z));
  const rd = riverD(x, z);
  if (rd < 40) d *= sstep(riverW(x) + 2, riverW(x) + 22, rd);
  d *= sstep(22, 44, Math.hypot(x - PLACES.farm.x, z - PLACES.farm.z)) * sstep(34, 70, Math.hypot(x - PLACES.village.x, z - PLACES.village.z)) * sstep(10, 26, Math.hypot(x - PLACES.tower.x, z - PLACES.tower.z)) * sstep(1.5, 5, streamD(x, z));
  return Math.min(1, d);
}

export type TreeKind = "broad" | "birch" | "pine" | "spruce" | "cypress" | "bush";
// lod: -1 the few nearest the desk (finest), 0 whole trees near by, 1 whole trees further off, 2 the far woods
export type HomeTree = { x: number; y: number; z: number; s: number; kind: TreeKind; v: number; rot: number; tint: number; lod: -1 | 0 | 1 | 2 };

// Every tree of the home world. Near the desk and the road they are whole
// trees (lod 0 the few nearest, 1 the rest); beyond, the wood is thousands of
// small soft crowns (lod 2).
export function plantHome(amount: number): HomeTree[] {
  const r = rng(4177);
  const trees: HomeTree[] = [];
  const kindAt = (x: number, z: number): TreeKind => {
    const wet = 1 - sstep(1.2, 4.5, hLakeK(x, z));
    const north = sstep(-80, -520, z);
    const k = vnoise(x * 0.009 + 50, z * 0.009 - 20);
    const u = r();
    if (wet > 0.35) return u < 0.55 ? "birch" : u < 0.9 ? "broad" : "bush";
    if (k < 0.34) return u < 0.62 ? "pine" : u < 0.82 ? "birch" : u < 0.94 ? "spruce" : "bush";
    if (k > 0.63 || north > 0.6) return u < 0.6 ? "spruce" : u < 0.86 ? "pine" : u < 0.96 ? "broad" : "bush";
    return u < 0.52 ? "broad" : u < 0.74 ? "birch" : u < 0.9 ? "pine" : "bush";
  };
  const push = (x: number, z: number, kind: TreeKind, s: number, lod: 0 | 1 | 2) => {
    trees.push({ x, y: landH(x, z), z, s, kind, v: Math.floor(r() * 3), rot: r() * 6.283, tint: r(), lod: lod === 0 && Math.hypot(x, z) < 82 ? -1 : lod });
  };
  const near = (x: number, z: number): 0 | 1 => (Math.hypot(x, z) < 115 || (z < 0 && Math.abs(x - roadX(z)) < 24 && z > HOME_GATE_Z - 20) ? 0 : 1);

  // 1. framing the view from the desk, placed by hand: tall trees left and right, a birch by the lake
  const hand: [number, number, TreeKind, number][] = [
    [-27, -33, "birch", 1.05], [-31, -38, "birch", 0.92], [-23, -40, "birch", 1.12], [-36, -30, "broad", 1.0],
    [27, -36, "pine", 1.15], [33, -44, "pine", 1.3], [22, -47, "pine", 1.05], [38, -31, "spruce", 1.0], [44, -40, "spruce", 1.2],
    [-58, -22, "broad", 1.25], [-66, -31, "broad", 1.05], [-52, -12, "bush", 1.0], [56, -8, "broad", 1.2], [62, -19, "birch", 1.1],
    [-44, 24, "broad", 1.15], [-52, 33, "birch", 1.0], [48, 30, "pine", 1.1], [57, 22, "broad", 1.0], [-30, 46, "bush", 1.1], [34, 52, "birch", 1.05],
    [-38, 62, "broad", 1.3], [-47, 71, "broad", 1.05], [-29, 74, "birch", 1.1], [-58, 55, "pine", 1.15], [-66, 66, "spruce", 1.1], [-24, 96, "broad", 1.2], [-35, 108, "pine", 1.2], [-78, 84, "broad", 1.25],
    [42, 68, "pine", 1.2], [51, 77, "pine", 1.35], [36, 84, "birch", 1.05], [63, 60, "broad", 1.2], [72, 72, "spruce", 1.2], [29, 104, "broad", 1.3], [46, 118, "birch", 1.1], [84, 92, "broad", 1.15],
    [-22, 58, "bush", 1.0], [25, 61, "bush", 1.1], [-88, 40, "birch", 1.1], [92, 36, "pine", 1.1], [18, 70, "cypress", 0.9], [-19, 132, "cypress", 1.2], [23, 141, "cypress", 1.05],
    [-12, -118, "cypress", 1.0], [-17, -124, "cypress", 1.25], [-9, -127, "cypress", 0.85], [72, -74, "cypress", 1.1], [-96, 18, "cypress", 1.15], [-101, 12, "cypress", 0.9], [84, 64, "cypress", 1.0],
  ];
  for (const [x, z, k, s] of hand) if (hLakeK(x, z) > 1.25 && inland(x, z) > 96) push(x, z, k, s, 0);

  // 1b. the town's trees (journey.ts): birches and willow-like broad crowns along the river's banks, lindens round
  // the church. (Kept off the mill, the footbridge and the quays the houses stand back from.)
  for (let x = -92; x > -336; x -= 10 + r() * 7) {
    const sl = riverSlope(x);
    const nn = Math.sqrt(1 + sl * sl);
    for (const side of [-1, 1]) {
      const u = r();
      const off = riverW(x) + 4.5 + r() * 4;
      if (u < 0.3 || Math.abs(x + 128) < 16 || Math.abs(x + 262) < 12 || Math.abs(x + 214) < 7) continue;
      const tx = x - (side * off * sl) / nn;
      const tz = riverZ(x) + (side * off) / nn;
      push(tx, tz, u < 0.62 ? "birch" : u < 0.9 ? "broad" : "bush", 0.78 + r() * 0.3, 1);
    }
  }
  for (let i = 0; i < 5; i++) {
    const a = 0.6 + i * 1.25 + r() * 0.3;
    push(CHURCH.x + Math.cos(a) * 25, CHURCH.z + Math.sin(a) * 21, "broad", 1.15 + r() * 0.25, 1);
  }

  // 2. whole trees out to 330 m: a jittered grid, kept where the wood is
  const cell = 5.2;
  for (let gx = -330; gx < 330; gx += cell)
    for (let gz = -420; gz < 330; gz += cell) {
      const x = gx + r() * cell;
      const z = gz + r() * cell;
      const u = r();
      const u2 = r();
      const d = forestD(x, z);
      const rr = Math.hypot(x, z);
      if (rr > 240 && !(z < 0 && Math.abs(x - roadX(z)) < 80 && z > HOME_GATE_Z - 90)) continue;
      if (u > d * d * 0.8 * amount) {
        // a lone tree or a bush out in the meadow, now and then
        if (!(u2 < 0.0035 && rr > 34 && d < 0.2 && hLakeK(x, z) > 1.3 && inland(x, z) > 120 && !(z > 4 && Math.abs(x) < 16) && !(z < 10 && Math.abs(x - roadX(z)) < 9))) continue;
        push(x, z, u2 < 0.0012 ? "cypress" : u2 < 0.0022 ? "broad" : "bush", 0.85 + r() * 0.4, near(x, z));
        continue;
      }
      if (rr < 26) continue;
      // bigger at the heart of a wood, smaller at its edge
      push(x, z, kindAt(x, z), (0.72 + 0.5 * d) * (0.85 + r() * 0.35), near(x, z));
    }

  // 3. the far woods: small soft crowns to the edge of sight
  const cell2 = 8.8 / Math.sqrt(Math.max(0.35, amount));
  for (let gx = -1700; gx < 1700; gx += cell2)
    for (let gz = -1700; gz < 900; gz += cell2) {
      const x = gx + r() * cell2;
      const z = gz + r() * cell2;
      const u = r();
      const rr = Math.hypot(x, z);
      if (rr < 240 || rr > 1700) continue;
      if (z < 0 && Math.abs(x - roadX(z)) < 80 && z > HOME_GATE_Z - 90) continue;
      // (the journey's own forest is planted whole, by its own hand: see JourneyWoods)
      if (journeyWood(x, z) > 0.02 && laneD(x, z).d < 62) continue;
      const d = forestD(x, z);
      // (inside a wood the trees stand shoulder to shoulder: a mass, not a scatter)
      if (u > sstep(0.08, 0.5, d) * 0.97) {
        if (u < 0.9985 || d > 0.2 || inland(x, z) < 120) continue;
        push(x, z, "cypress", 1.1 + r() * 0.6, 2);
        continue;
      }
      // (near the flight's way over the open land a tree is seen from close by: a whole one, not a painted card)
      push(x, z, kindAt(x, z), (0.85 + 0.5 * d) * (0.85 + r() * 0.4), routeD(x, z) < 130 || (z < 0 && z > -380 && Math.abs(x - roadX(z)) < 110) ? 1 : 2);
    }
  return trees;
}

// ---------- baking ----------
function dataTex(data: Uint8Array, n: number, filter = true) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = filter ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = filter;
  t.needsUpdate = true;
  return t;
}

export function bakeForestMap() {
  // (14 m a texel: the woods' edges are soft anyway, and it is a quarter of the work behind the loader)
  const n = 256;
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n - 0.5) * FOREST_SPAN * 2;
      const z = ((j + 0.5) / n - 0.5) * FOREST_SPAN * 2;
      const k = (j * n + i) * 4;
      data[k] = Math.round(255 * forestD(x, z));
      data[k + 1] = 0;
      data[k + 2] = 0;
      data[k + 3] = 255;
    }
  return dataTex(data, n);
}

// a soft disc under every whole tree, as wide as its crown
const CROWN_R: Record<TreeKind, number> = { broad: 4.6, birch: 2.6, pine: 3.3, spruce: 2.4, cypress: 1.3, bush: 1.7 };
export function bakeCrownMap(trees: HomeTree[]) {
  const n = 1024;
  const acc = new Float32Array(n * n);
  const px = n / (CROWN_SPAN * 2);
  for (const t of trees) {
    if (t.lod === 2 || Math.abs(t.x) > CROWN_SPAN || Math.abs(t.z) > CROWN_SPAN) continue;
    const R = CROWN_R[t.kind] * t.s * px;
    const cx = (t.x + CROWN_SPAN) * px;
    const cz = (t.z + CROWN_SPAN) * px;
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(n - 1, Math.ceil(cx + R));
    const z0 = Math.max(0, Math.floor(cz - R));
    const z1 = Math.min(n - 1, Math.ceil(cz + R));
    for (let j = z0; j <= z1; j++)
      for (let i = x0; i <= x1; i++) {
        const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) / R;
        if (d >= 1) continue;
        const a = (1 - d * d) * (1 - d * d) * (t.kind === "birch" ? 0.6 : 0.9);
        const k = j * n + i;
        acc[k] = 1 - (1 - acc[k]) * (1 - a);
      }
  }
  // the haystacks, the shrine and the bridge lay their shade too
  const blot = (x: number, z: number, rad: number, a: number) => {
    const R = rad * px;
    const cx = (x + CROWN_SPAN) * px;
    const cz = (z + CROWN_SPAN) * px;
    for (let j = Math.max(0, Math.floor(cz - R)); j <= Math.min(n - 1, Math.ceil(cz + R)); j++)
      for (let i = Math.max(0, Math.floor(cx - R)); i <= Math.min(n - 1, Math.ceil(cx + R)); i++) {
        const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cz) / R;
        if (d < 1) acc[j * n + i] = 1 - (1 - acc[j * n + i]) * (1 - a * (1 - d * d));
      }
  };
  for (const [x, z] of PLACES.hay) blot(x, z, 2.1, 0.95);
  blot(PLACES.shrine.x, PLACES.shrine.z, 0.7, 0.8);
  blot(PLACES.bridge.x, PLACES.bridge.z, 1.6, 0.7);
  const data = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    data[k * 4] = Math.round(255 * acc[k]);
    data[k * 4 + 3] = 255;
  }
  return dataTex(data, n);
}

// The cloud field: a tiling texture of rounded cells. R: broad cumulus masses
// (soft noise carved by round cells), G: the billows on them, B: plain soft
// noise. Sampled a few times per sky pixel, which is far cheaper than hashing.
export function bakeCloudTex() {
  // (a phone bakes it at half the size: a quarter of the work behind the loader, and the shaders read it by position, not by texel)
  const n = typeof window !== "undefined" && window.innerWidth < 768 ? 128 : 256;
  const data = new Uint8Array(n * n * 4);
  const R = rng(99);
  const cells = (count: number) => {
    const pts = new Float32Array(count * count * 2);
    for (let i = 0; i < count * count; i++) {
      pts[i * 2] = R();
      pts[i * 2 + 1] = R();
    }
    // distance to the nearest point, cells wrapping at the edges, as 1 at a centre falling to 0 between
    return (u: number, v: number) => {
      const x = u * count;
      const y = v * count;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      let best = 9;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const cx = (((ix + dx) % count) + count) % count;
          const cy = (((iy + dy) % count) + count) % count;
          const k = (cy * count + cx) * 2;
          const d = Math.hypot(ix + dx + pts[k] - x, iy + dy + pts[k + 1] - y);
          if (d < best) best = d;
        }
      // (a dome over each point, not a cone: the clouds heaped from these are round on top)
      return Math.max(0, 1 - best * best * 1.25);
    };
  };
  // tiling value noise
  const grid = (count: number) => {
    const g = new Float32Array(count * count);
    for (let i = 0; i < g.length; i++) g[i] = R();
    return (u: number, v: number) => {
      const x = u * count;
      const y = v * count;
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      const at = (a: number, b: number) => g[(((b % count) + count) % count) * count + (((a % count) + count) % count)];
      return at(ix, iy) * (1 - ux) * (1 - uy) + at(ix + 1, iy) * ux * (1 - uy) + at(ix, iy + 1) * (1 - ux) * uy + at(ix + 1, iy + 1) * ux * uy;
    };
  };
  const w4 = cells(4);
  const w8 = cells(8);
  const w16 = cells(16);
  const w32 = cells(32);
  const n3 = grid(3);
  const n6 = grid(6);
  const n12 = grid(12);
  const n24 = grid(24);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const v = (j + 0.5) / n;
      const soft = n3(u, v) * 0.5 + n6(u, v) * 0.3 + n12(u, v) * 0.2;
      const round = w4(u, v) * 0.55 + w8(u, v) * 0.3 + w16(u, v) * 0.15;
      const k = (j * n + i) * 4;
      data[k] = Math.round(255 * Math.min(1, Math.max(0, soft * 0.7 + round * 0.5 - 0.12)));
      data[k + 1] = Math.round(255 * Math.min(1, w8(u, v) * 0.45 + w16(u, v) * 0.35 + w32(u, v) * 0.2 + 0.1));
      data[k + 2] = Math.round(255 * (n6(u, v) * 0.5 + n12(u, v) * 0.3 + n24(u, v) * 0.2));
      data[k + 3] = 255;
    }
  // how much of the sky the clouds take: the field's level above which about two fifths of it lies
  const fs: number[] = [];
  for (let i = 0; i < 30000; i++) {
    const u = R();
    const v = R();
    const u2 = (u * (2300 / 940) + 0.37) % 1;
    const v2 = (v * (2300 / 940) + 0.37) % 1;
    fs.push((data[(Math.floor(v * n) * n + Math.floor(u * n)) * 4] * 0.62 + data[(Math.floor(v2 * n) * n + Math.floor(u2 * n)) * 4 + 1] * 0.38) / 255);
  }
  fs.sort((x, y) => x - y);
  HOME_U.uAirK.value.z = fs[Math.floor(fs.length * (1 - CLOUD_COVER))] - 0.03;
  const t = dataTex(data, n);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Made once, the first time the home world is drawn.
let made: { trees: HomeTree[]; amount: number } | null = null;
export function homeLand(amount = 1) {
  if (!made || made.amount !== amount) {
    const trees = timed("plant", () => plantHome(amount));
    HOME_U.uForestMap.value?.dispose();
    HOME_U.uCrownMap.value?.dispose();
    HOME_U.uForestMap.value = timed("forestMap", bakeForestMap);
    HOME_U.uCrownMap.value = timed("crownMap", () => bakeCrownMap(trees));
    HOME_U.uCloudTex.value ??= timed("cloudTex", bakeCloudTex);
    made = { trees, amount };
  }
  return made;
}
export function cloudTex() {
  return (HOME_U.uCloudTex.value ??= timed("cloudTex", bakeCloudTex));
}

// the footpath (shared with the old ground): where it runs and how wide
export { pathW, pathX };
