import * as THREE from "three";
import type { GroundPalette } from "../kit";
import { SUN_BELLS, SUN_BRIDGES, SUN_GARDEN, SUN_ROAD_GLSL, SUN_ROAD_Z } from "./shape";

// The plain of the Sonata of the Sun, painted.
//
// The shared ground lays a field in three tones with brush strokes; this adds what makes a plain a place, all of
// it worked out from the same numbers as the things that stand on it (sun/shape.ts), so nothing floats:
//   - the land laid in long wavy bands of tone, one behind another, each with a pencilled edge (the Andante's hills)
//   - strip fields at a slant: stubble, ploughed umber and pale wheat, each ruled with fine furrows, hedge-lines between
//   - the road: pale trodden earth with two ruts and a darker verge
//   - the garden of the Andante: an oval of dark earth, winding paths of pale gold through it, a drawn rim
//   - drifts of flowers (specks close to, a warmth in the field far off)
//   - shade: each bell's long shadow, the aqueducts' shadows with the light of every arch lying in them, the shade
//     of the groves (a small map of every tree), and the darkness gathered at the foot of every bell and pier
// The same functions thin the blades of grass away from the road, the bare fields and the deep shade.

const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : n.toFixed(4));
const v4 = (a: number[]) => `vec4(${a.map(f).join(", ")})`;
const NB = SUN_BELLS.length;
const NR = SUN_BRIDGES.length;
const G = SUN_GARDEN;
export const GROVE_SPAN = 4600; // metres the map of the groves' shade covers, centred on the world

// (no uniforms of its own but the sky's: the grass's vertex shader can run it too)
export const SUN_LAND_GLSL = /* glsl */ `
${SUN_ROAD_GLSL}
const vec4 SUN_B[${NB}] = vec4[${NB}](${SUN_BELLS.map(v4).join(", ")});
const vec4 SUN_RA[${NR}] = vec4[${NR}](${SUN_BRIDGES.map((b) => v4([b.c[0], b.c[1], b.u[0], b.u[1]])).join(", ")});
const vec4 SUN_RB[${NR}] = vec4[${NR}](${SUN_BRIDGES.map((b) => v4([b.w, b.H, b.n, b.tiers])).join(", ")});
// each bell's own outline laid on the ground, away from the sun: full width near its foot, closing to the point
// of its crown, softer the further it falls
float sunBellShade(vec2 p){
  vec2 s = -normalize(uKeyDir.xz + vec2(1e-4));
  float tanE = max(uKeyDir.y, 0.05) / max(length(uKeyDir.xz), 1e-3);
  float sh = 0.0;
  for (int i = 0; i < ${NB}; i++) {
    vec4 b = SUN_B[i];
    vec2 d = p - b.xy;
    float along = dot(d, s);
    float perp = abs(d.x * s.y - d.y * s.x);
    float L = min(b.w / tanE, 1700.0);
    float u = clamp(along / L, 0.0, 1.0);
    float hw = b.z * sqrt(max(0.0, 1.0 - pow(u, 3.1))) * (1.0 - 0.16 * u);
    float k = (1.0 - smoothstep(hw * 0.72, hw * 1.12 + 8.0 + 40.0 * u, perp)) * smoothstep(-b.z, 0.0, along) * (1.0 - smoothstep(0.8, 1.0, u));
    sh = max(sh, k * (0.78 - 0.4 * u));
  }
  return sh;
}
// an aqueduct's shadow: the wall's, with the light of every arch lying in it
float sunBridgeShade(vec2 p){
  vec2 s = -normalize(uKeyDir.xz + vec2(1e-4));
  float tanE = max(uKeyDir.y, 0.05) / max(length(uKeyDir.xz), 1e-3);
  float sh = 0.0;
  for (int i = 0; i < ${NR}; i++) {
    vec2 c = SUN_RA[i].xy; vec2 u = SUN_RA[i].zw; vec2 nr = vec2(-u.y, u.x);
    float den = dot(s, nr);
    float t = dot(p - c, nr) / den;
    if (t <= 0.0) continue;
    vec2 hit = p - s * t;
    float along = dot(hit - c, u);
    float w = SUN_RB[i].x; float H = SUN_RB[i].y; float n = SUN_RB[i].z;
    float y = t * tanE;
    float e = 0.7 + t * 0.03;
    float inside = 1.0 - smoothstep(n * w * 0.5 - e, n * w * 0.5 + e, abs(along));
    float top = H + 3.4;
    float local = (fract(along / w + 0.5) - 0.5) * w;
    float r = w * 0.34; float spring = H * 0.5;
    float dArch = y < spring ? abs(local) - r : length(vec2(local, y - spring)) - r;
    float wall = (1.0 - smoothstep(top - e, top + e, y)) * smoothstep(-e, e, dArch);
    if (SUN_RB[i].w > 1.5) {
      // the upper tier: three small arches over each great one
      float h2 = H * 0.34; float w2 = w / 3.0; float r2 = w2 * 0.32;
      float yy = y - top; float l2 = (fract(local / w2 + 0.5) - 0.5) * w2;
      float d2 = yy < h2 * 0.5 ? abs(l2) - r2 : length(vec2(l2, yy - h2 * 0.5)) - r2;
      wall = max(wall, step(0.0, yy) * (1.0 - smoothstep(h2 + 2.6 - e, h2 + 2.6 + e, yy)) * smoothstep(-e, e, d2));
    }
    sh = max(sh, wall * inside * (0.7 - 0.3 * smoothstep(0.0, 900.0, t)));
  }
  return sh;
}
// the darkness gathered where a bell or a pier meets the ground
float sunFootAO(vec2 p){
  float a = 0.0;
  for (int i = 0; i < ${NB}; i++) {
    vec4 b = SUN_B[i];
    float d = length(p - b.xy) - b.z * 1.2;
    a = max(a, 0.5 * exp(-max(d, 0.0) / (5.0 + b.z * 0.1)));
  }
  for (int i = 0; i < ${NR}; i++) {
    vec2 c = SUN_RA[i].xy; vec2 u = SUN_RA[i].zw;
    float along = dot(p - c, u); float across = abs(dot(p - c, vec2(-u.y, u.x)));
    float w = SUN_RB[i].x; float n = SUN_RB[i].z;
    if (abs(along) > n * w * 0.5 + 20.0 || across > 60.0) continue;
    float local = abs((fract(along / w + 0.5) - 0.5) * w);
    float thick = 9.0 + w * 0.08;
    float d = length(vec2(max(w * 0.34 - 1.5 - local, 0.0), max(across - thick * 0.5 - 2.0, 0.0)));
    a = max(a, 0.5 * exp(-d / 4.5));
  }
  return a;
}
// how far inside the garden's oval a place is: under 1 inside
float sunGardenD(vec2 p){
  vec2 d = p - vec2(${f(G.x)}, ${f(G.z)});
  d = vec2(d.x * ${f(Math.cos(G.yaw))} + d.y * ${f(Math.sin(G.yaw))}, -d.x * ${f(Math.sin(G.yaw))} + d.y * ${f(Math.cos(G.yaw))});
  return length(d / vec2(${f(G.a)}, ${f(G.b)}));
}
float sunRoadD(vec2 p){ return abs(p.x - sunRoadX(p.y)); }
float sunRoadK(vec2 p){
  return (1.0 - smoothstep(3.6, 5.4, sunRoadD(p) + (vnoise(p * 0.25) - 0.5) * 1.6)) * smoothstep(${f(SUN_ROAD_Z[0])}, ${f(SUN_ROAD_Z[0] + 90)}, p.y) * (1.0 - smoothstep(${f(SUN_ROAD_Z[1] - 90)}, ${f(SUN_ROAD_Z[1])}, p.y));
}
// the strip fields: (which plot: under 0.3 it is left as meadow; metres to its edge; metres across its furrows;
// whether its plot is farmed at all). Whole plots are farmed or left, in broad reaches of the plain. (No noise
// here, only sines and steps: sun/ground.ts works the same sum in JS to keep the trees out of the furrows.)
vec4 sunPlot(vec2 p0){
  // (their lines wander a little: no field is ruled)
  vec2 p = p0 + 16.0 * vec2(sin(p0.y * 0.011 + 1.0), sin(p0.x * 0.013 + 2.0));
  vec2 q = vec2(0.94 * p.x - 0.34 * p.y, 0.34 * p.x + 0.94 * p.y);
  float row = floor(q.y / 130.0);
  float len = 300.0 + 160.0 * fract(row * 0.618034 + 0.31);
  float off = fract(row * 0.7548777 + 0.11) * 420.0;
  float ci = floor((q.x + off) / len);
  vec2 fr = vec2(q.x + off - ci * len, q.y - row * 130.0);
  float edge = min(min(fr.x, len - fr.x), min(fr.y, 130.0 - fr.y));
  vec2 cq = vec2((ci + 0.5) * len - off, (row + 0.5) * 130.0);
  vec2 cp = vec2(0.94 * cq.x + 0.34 * cq.y, -0.34 * cq.x + 0.94 * cq.y);
  float farmed = step(0.12, sin(cp.x * 0.0023 + 1.0) * sin(cp.y * 0.0019 + 0.4) + 0.5 * sin(cp.x * 0.0041 - cp.y * 0.0037 + 2.0));
  return vec4(fract(ci * 0.7548777 + row * 0.5698403 + 0.17), edge, q.y, farmed);
}
// never the garden, the road or the feet of the bells
float sunFieldK(vec2 p, float farmed){
  float k = farmed * smoothstep(1.04, 1.16, sunGardenD(p)) * smoothstep(10.0, 22.0, sunRoadD(p));
  for (int i = 0; i < ${NB}; i++) k *= smoothstep(SUN_B[i].z * 1.3, SUN_B[i].z * 1.3 + 40.0, length(p - SUN_B[i].xy));
  return k;
}
// 1 where grass grows: meadow, out of the deep shade
float sunGrass(vec2 p){
  vec4 pl = sunPlot(p);
  float bare = sunFieldK(p, pl.w) * step(0.3, pl.x) * smoothstep(1.0, 3.0, pl.y);
  float m = (1.0 - bare) * (1.0 - sunRoadK(p)) * smoothstep(0.98, 1.02, sunGardenD(p));
  for (int i = 0; i < ${NB}; i++) m *= smoothstep(SUN_B[i].z * 1.46, SUN_B[i].z * 1.74, length(p - SUN_B[i].xy));
  return m * (1.0 - smoothstep(0.1, 0.3, max(sunBellShade(p), sunBridgeShade(p))));
}
`;

const PAINT = /* glsl */ `
uniform sampler2D uGrove;
vec3 sunPaint(vec3 alb, vec2 p, float h, float gd){
  float px = length(fwidth(p));
  float lum = clamp(dot(alb, vec3(0.34)) / 0.2, 0.75, 1.3);
  // long wavy bands of tone, one behind another, each with a pencilled edge
  float bh = h * 0.2 + fbm(p * 0.0021 + 3.0) * 7.0 + p.y * 0.0035;
  float tone = hash12(vec2(floor(bh), 1.7));
  vec3 a = alb * mix(0.84, 1.12, tone);
  a = mix(a, a * vec3(0.86, 0.96, 1.2), step(0.7, tone) * 0.55);
  a = mix(a, a * vec3(1.12, 0.94, 0.74), step(tone, 0.22) * 0.55);
  float bw = fwidth(bh);
  a *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.03 + bw * 1.5, fract(bh))) * (1.0 - smoothstep(0.3, 0.9, bw));
  // the strip fields
  vec4 pl = sunPlot(p);
  float fk = sunFieldK(p, pl.w);
  float fieldIn = 0.0;
  if (fk > 0.001 && pl.x > 0.3) {
    vec3 fc = pl.x < 0.55 ? vec3(0.46, 0.33, 0.085) : pl.x < 0.78 ? vec3(0.25, 0.16, 0.08) : vec3(0.54, 0.4, 0.11);
    fc *= (0.9 + 0.22 * fract(pl.x * 7.31)) * lum;
    float fl = abs(fract(pl.z / 2.6) - 0.5) * 2.0;
    float fw = px / 2.6;
    float amp = (pl.x < 0.55 ? 0.16 : pl.x < 0.78 ? 0.34 : 0.12) * (1.0 - smoothstep(0.2, 0.7, fw));
    fc *= 1.0 + (smoothstep(0.2, 0.8, fl) - 0.5) * amp;
    fieldIn = fk * smoothstep(1.5, 7.0, pl.y + (vnoise(p * 0.21) - 0.5) * 5.0 + (vnoise(p * 0.05) - 0.5) * 6.0);
    a = mix(a, fc * mix(0.86, 1.1, vnoise(p * 0.02 + 3.0)), fieldIn * 0.62);
    // the hedge-line between plots
    a *= 1.0 - 0.34 * fk * (1.0 - smoothstep(0.5, 2.6, pl.y)) * (1.0 - smoothstep(1.0, 4.0, px));
  }
  // the garden of the Andante
  float gD = sunGardenD(p) + (vnoise(p * 0.03) - 0.5) * 0.04;
  float gdn = 1.0 - smoothstep(0.97, 1.0, gD);
  if (gD < 1.1) {
    vec3 ge = vec3(0.25, 0.165, 0.13) * (0.85 + 0.3 * vnoise(p * 0.05 + 9.0)) * lum;
    vec2 wq = p * 0.011 + vec2(fbm(p * 0.006 + 2.0), fbm(p * 0.006 + 7.0)) * 1.6;
    float wv = abs(vnoise(wq) - 0.5);
    ge = mix(ge, vec3(0.8, 0.6, 0.26), (1.0 - smoothstep(0.016, 0.03, wv)) * smoothstep(1.0, 0.9, gD));
    a = mix(a, ge, gdn);
    a = mix(a, vec3(0.84, 0.64, 0.28), (1.0 - smoothstep(0.004, 0.016, abs(gD - 0.985))) * 0.8);
  }
  // round the foot of every bell a ring of flagged pavement, violet-grey like the bell, its joints running out
  // from the plinth; and beyond it a ring of trodden earth
  for (int i = 0; i < ${NB}; i++) {
    vec2 d = p - SUN_B[i].xy; float R = SUN_B[i].z;
    float dn = length(d) / R;
    if (dn > 1.75) continue;
    float pave = 1.0 - smoothstep(1.4, 1.44, dn + (vnoise(p * 0.3) - 0.5) * 0.02);
    float th = atan(d.y, d.x);
    float ringI = floor((dn - 1.2) * R / 4.5);
    float jr = abs(fract((dn - 1.2) * R / 4.5) - 0.5) * 4.5;
    float ja = abs(fract(th * R * 1.3 / 7.0 + ringI * 0.37) - 0.5) * 7.0;
    float joint = (1.0 - smoothstep(0.08, 0.2 + px, min(2.25 - jr, 3.5 - ja))) * (1.0 - smoothstep(0.4, 1.4, px));
    vec3 flag = vec3(0.3, 0.33, 0.52) * (0.86 + 0.26 * hash12(vec2(ringI, floor(th * R * 1.3 / 7.0 + ringI * 0.37)) + float(i))) * (1.0 - 0.3 * joint);
    float worn = (1.0 - smoothstep(1.44, 1.72, dn + (vnoise(p * 0.07) - 0.5) * 0.12));
    a = mix(a, vec3(0.5, 0.38, 0.17) * (0.85 + 0.3 * vnoise(p * 0.4)), worn * 0.75);
    a = mix(a, flag, pave);
  }
  // the road
  float rd = sunRoadD(p);
  float rk = sunRoadK(p);
  vec3 earth = vec3(0.56, 0.42, 0.19) * (0.86 + 0.26 * vnoise(p * vec2(0.9, 0.12))) * mix(1.0, lum, 0.5);
  earth *= 1.0 - 0.18 * (1.0 - smoothstep(0.22, 0.6, abs(rd - 1.5))) * (1.0 - smoothstep(0.3, 1.0, px));
  a = mix(a, earth, rk);
  a *= 1.0 - 0.14 * (1.0 - rk) * (1.0 - smoothstep(5.0, 12.0, rd)) * smoothstep(${f(SUN_ROAD_Z[0])}, ${f(SUN_ROAD_Z[0] + 90)}, p.y);
  // drifts of flowers: specks close to, a warmth in the field far off
  float dr = smoothstep(0.5, 0.76, vnoise(p * 0.017 + 40.0)) * (1.0 - rk) * (1.0 - gdn) * (1.0 - fieldIn);
  vec2 fq = p * 1.5; vec2 fi = floor(fq); float fh = hash12(fi + 5.0);
  vec2 fo = vec2(hash12(fi + 1.3), hash12(fi + 8.1)) - 0.5;
  float speck = 1.0 - smoothstep(0.04 + 0.05 * fh, 0.08 + 0.08 * fh, length(fract(fq) - 0.5 - fo * 0.7));
  vec3 fcol = fh > 0.84 ? vec3(0.46, 0.5, 0.95) : fh > 0.66 ? vec3(1.0, 0.92, 0.72) : vec3(1.0, 0.7, 0.2);
  float vis = 1.0 - smoothstep(0.05, 0.2, px);
  a = mix(a, fcol, speck * step(0.5, fh) * dr * vis * 0.9);
  a = mix(a, a * vec3(1.14, 1.05, 0.9) + vec3(0.02, 0.016, 0.02), dr * (1.0 - vis) * 0.5);
  return a;
}
`;

const groveU = { uGrove: { value: null as THREE.Texture | null } };
export const SUN_PAL: GroundPalette = {
  // a soft dull gold, greener in its hollows, paler where it is dry
  a: [0.36, 0.25, 0.055],
  b: [0.5, 0.33, 0.07],
  c: [0.27, 0.23, 0.085],
  hook: {
    uniforms: groveU,
    decl: SUN_LAND_GLSL + PAINT,
    lit: /* glsl */ `{
      vec3 Lg = col / max(alb, vec3(1e-3));
      vec3 a2 = sunPaint(alb, p, h, gd);
      float sh = max(sunBellShade(p), sunBridgeShade(p));
      sh = max(sh, texture2D(uGrove, p / ${f(GROVE_SPAN)} + 0.5).r * 0.62);
      // shade is violet, as his is
      col = a2 * Lg * mix(vec3(1.0), vec3(0.36, 0.42, 0.74), sh) * (1.0 - sunFootAO(p));
    }`,
  },
};
// the grass keeps to the meadow (see Grass.tsx: this closes its mask and stands the plain's own in its place)
export const SUN_GRASS_MASK = `return 1.0; }\n${SUN_LAND_GLSL}\n#define grassMask(p, h) sunGrass(p)\nfloat sunGrassUnused(vec2 p){ return 1.0;`;

// the same plots in JS: is this place inside a farmed plot's furrows, and how far is its edge
export function sunPlotJS(x0: number, z0: number) {
  const fr = (v: number) => v - Math.floor(v);
  const x = x0 + 16 * Math.sin(z0 * 0.011 + 1.0);
  const z = z0 + 16 * Math.sin(x0 * 0.013 + 2.0);
  const qx = 0.94 * x - 0.34 * z;
  const qy = 0.34 * x + 0.94 * z;
  const row = Math.floor(qy / 130);
  const len = 300 + 160 * fr(row * 0.618034 + 0.31);
  const off = fr(row * 0.7548777 + 0.11) * 420;
  const ci = Math.floor((qx + off) / len);
  const fx = qx + off - ci * len;
  const fy = qy - row * 130;
  const edge = Math.min(fx, len - fx, fy, 130 - fy);
  const cqx = (ci + 0.5) * len - off;
  const cqy = (row + 0.5) * 130;
  const cx = 0.94 * cqx + 0.34 * cqy;
  const cz = -0.34 * cqx + 0.94 * cqy;
  const farmed = Math.sin(cx * 0.0023 + 1.0) * Math.sin(cz * 0.0019 + 0.4) + 0.5 * Math.sin(cx * 0.0041 - cz * 0.0037 + 2.0) > 0.12;
  const id = fr(ci * 0.7548777 + row * 0.5698403 + 0.17);
  return { farmed: farmed && id > 0.3, edge, plot: farmed };
}

// The shade of the groves: every tree's own darkness under it and its shadow laid away from the sun, in one small map.
export function groveMap(trees: { x: number; z: number; r: number; h: number }[], keyDir: THREE.Vector3) {
  const N = 2048;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, N, N);
  const mpp = GROVE_SPAN / N;
  const sl = Math.hypot(keyDir.x, keyDir.z);
  const sx = -keyDir.x / sl;
  const sz = -keyDir.z / sl;
  const tanE = keyDir.y / sl;
  g.fillStyle = "#fff";
  for (const t of trees) {
    const px = (t.x / GROVE_SPAN + 0.5) * N;
    const pz = (t.z / GROVE_SPAN + 0.5) * N;
    if (px < 0 || pz < 0 || px >= N || pz >= N) continue;
    const reach = Math.min(t.h / tanE, 26);
    const steps = Math.max(2, Math.ceil(reach / (t.r * 1.2)));
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      g.globalAlpha = i === 0 ? 0.85 : 0.55 * (1 - 0.6 * u);
      g.beginPath();
      g.arc(px + (sx * reach * u) / mpp, pz + (sz * reach * u) / mpp, Math.max(0.55, (t.r * (1.15 - 0.3 * u)) / mpp), 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  groveU.uGrove.value = tex;
  return tex;
}
