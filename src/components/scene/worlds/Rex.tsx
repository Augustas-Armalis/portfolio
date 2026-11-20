"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, angel, haloGeometry, makeHaloMaterial, makeTempera, makeWater, rng, type GroundPalette, type Halo, type V3 } from "./kit";
import { GreatSun } from "./life";
import { WORLDS } from "./voyage";

// Rex (1909). Umber dusk, almost one colour. On a still sea a globe lies half
// in the water, dark, with paler lands drifting on it; before it a blade of
// light rises from a stepped altar, and both stand mirrored. The globe is
// held in a dark sphere, and out of that sphere rises the king: one great
// dark figure, round-shouldered, crowned, with a paler king drawn inside him
// like a thought. Behind and over him the sky is built of spheres one inside
// another: a pale shell of cloud whose rim is set with fires, a dark shell
// where comets ride, a pale shell of wings, and past them the stars, a sun
// high to the left and a thin moon to the right. The plane comes in low over
// the water, circles the king and rises through the shells one by one.

const def = WORLDS.rex;
export const REX_PAL: GroundPalette = { a: [0.19, 0.145, 0.1], b: [0.27, 0.2, 0.13], c: [0.12, 0.1, 0.08], shore: [0.33, 0.25, 0.17], rock: [0.12, 0.095, 0.085] };

// Everything is built at the size of the painting's first sketch and then made colossal: the king, his globe
// and the dark sphere that holds it by KS, the shells of the sky by SS (they stand kilometres across: the plane
// flies in through the first and circles the king inside them).
const KS = 2;
const SS = 2.6;
// the globe (R), the dark sphere that holds it (B), and the shells of the sky: all struck from one axis
export const REX = { x: 0, z: -260, r: 58 * KS, bulb: 82 * KS, portal: 62 * KS };
const DROP = 197 * SS; // the shells' common centre lies this far under the water
const SHELLS = [321 * SS, 379 * SS, 405 * SS];
const DARK: V3 = [0.045, 0.037, 0.031];
const DARK_TOP: V3 = [0.085, 0.07, 0.056];
const PALE: V3 = [0.62, 0.5, 0.4];
const GILT: V3 = [0.95, 0.68, 0.36];
const FIRE: V3 = [1.0, 0.6, 0.26];

// the king's outline, as [radius, height above the water]
const KING0: [number, number][] = [
  [36, 34],
  [47, 60],
  [49, 70],
  [49, 117],
  [51.5, 121],
  [57, 127],
  [60, 138],
  [60, 151],
  [57.5, 160],
  [52, 166],
  [49.5, 169],
  [49.5, 227],
  [53, 229.5],
  [53, 236],
  [50, 236],
  [0.1, 236],
];
const KING = KING0.map(([r, y]): [number, number] => [r * KS, y * KS]);
const DECK = 236 * KS;
// his half-width at a height, for the water's mirror of him
const kingGLSL = `float kingR0(float y){ return y < 60.0 ? 0.0 : y < 119.0 ? 49.0 : y < 167.0 ? 49.0 + 11.0 * sin((y - 119.0) / 48.0 * 3.1416) : y < 236.0 ? 49.5 : y < 252.0 ? 21.0 : 0.0; }
float kingR(float y){ return kingR0(y / ${KS.toFixed(1)}) * ${KS.toFixed(1)}; }`;

const GLOBE_GLSL = /* glsl */ `
vec3 globeAlb(vec3 q){
  // lands and seas of a dark world: broad pale shapes with torn edges
  vec2 uv = vec2(atan(q.z, q.x) * 1.4, q.y * 2.2);
  float land = fbm(uv * 1.5 + 3.0) * 0.7 + fbm(uv * 4.5 + 9.0) * 0.3;
  float m = smoothstep(0.46, 0.55, land);
  return mix(vec3(0.03, 0.025, 0.022), mix(vec3(0.44, 0.33, 0.24), vec3(0.34, 0.33, 0.22), smoothstep(0.55, 0.75, land)), m);
}`;

function makeGlobeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLOBE_GLSL}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 q = normalize(vLocal);
        vec3 alb = globeAlb(q);
        float lit = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0);
        vec3 col = alb * (uSkyCol * (0.75 + 0.25 * n.y) + uKeyCol * lit * 0.45);
        // the blade's light on the faces it stands before
        float face = abs(q.z);
        col += vec3(1.0, 0.8, 0.52) * exp(-q.x * q.x * 22.0) * face * face * (0.16 + 0.5 * alb.r) * glowK() * step(0.0, q.z);
        col += vec3(0.5, 0.36, 0.22) * pow(1.0 - abs(dot(n, V)), 3.0) * 0.22;
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// The king: dark stone, and on each of his four faces the paler king within,
// drawn in drifting patches of rose and olive like the sky seen through him.
function makeKingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        // (in the sketch's own units: the king is drawn at one size and built at another)
        vec3 L = vLocal / ${KS.toFixed(1)};
        float y = L.y;
        bool front = abs(L.x) < abs(L.z);
        float s = front ? L.x : L.z;
        float u = abs(s);
        // the inner king: a body in two stages, two small towers and a crown
        float w = y < 132.0 ? 27.0 : 23.0;
        float body = (1.0 - smoothstep(w - 0.5, w + 0.5, u)) * smoothstep(73.0, 74.0, y) * (1.0 - smoothstep(165.5, 166.5, y));
        float tw = abs(u - 19.5);
        float tower = (1.0 - smoothstep(3.0, 3.6, tw)) * step(165.5, y) * (1.0 - smoothstep(-0.4, 0.4, y - 172.0 + max(tw - 0.4, 0.0) * 1.9 - 4.6));
        float zig = abs(fract(u * 0.36) - 0.5) * 2.0;
        float crown = (1.0 - smoothstep(8.6, 9.2, u)) * step(165.5, y) * (1.0 - smoothstep(-0.3, 0.3, y - 172.5 - zig * 3.4));
        float m = max(body, max(tower, crown));
        // patches of cloud, long and level
        vec2 pc = vec2(s * 0.035 + (front ? 0.0 : 17.0), y * 0.1);
        float c1 = fbm(pc + 3.0);
        float c2 = fbm(pc * 1.9 + 11.0);
        vec3 inner = mix(vec3(0.2, 0.195, 0.14), vec3(0.4, 0.325, 0.26), smoothstep(0.4, 0.58, c1));
        inner = mix(inner, vec3(0.1, 0.085, 0.065), smoothstep(0.54, 0.66, c2) * 0.85);
        inner *= mix(1.0, 0.72, smoothstep(134.0, 131.0, y) * smoothstep(127.0, 131.0, y));
        float dab = vnoise(L.xz * 0.21 + y * 0.17) * 0.6 + vnoise(vec2(s, y) * 0.8) * 0.4;
        // level beds in the dark stone, and the long upright strokes of the pastel over them
        float bed = vnoise(vec2(y * 0.2 + vnoise(L.xz * 0.03) * 2.0, 1.7));
        float stroke = vnoise(vec2(s * 0.9, y * 0.05)) * 0.6 + vnoise(vec2(s * 3.1, y * 0.2 + 5.0)) * 0.4;
        dab = mix(dab, stroke, 0.45);
        vec3 dark = vec3(0.045, 0.037, 0.031) * (0.8 + 0.5 * bed);
        vec3 alb = mix(dark, inner, m) * (1.0 + (dab - 0.5) * 0.3);
        float lit = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0);
        vec3 col = alb * (uSkyCol * (0.7 + 0.3 * n.y) + uKeyCol * lit * 0.5);
        // the inner king keeps a little light of his own, so he reads at dusk
        col += inner * m * 0.16 * glowK() * 2.0;
        col += vec3(0.36, 0.25, 0.14) * pow(1.0 - abs(dot(n, V)), 3.0) * (1.0 - m);
        // he is so tall the air between the eye and his crown turns cool: far is hazier and bluer
        col = applyAir(col, vWorld);
        col = mix(col, uHorizon * vec3(0.62, 0.66, 0.9) + vec3(0.02, 0.025, 0.05), smoothstep(250.0, 1500.0, length(vWorld - cameraPosition)) * 0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// A shell of the sky, seen from within (and, from outside, through its near
// side): 0 the pale cloud with far mountains at its foot, 1 the dark where
// the comets ride, 2 the pale shell of wings.
function makeShellMaterial(kind: 0 | 1 | 2) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `varying vec3 vLocal; varying vec3 vWorld; void main(){ vLocal = position; vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      float f3(vec2 p){ return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.0) * 0.3 + vnoise(p * 4.3 + 13.0) * 0.15; }
      // the pattern along the shell at an angle round it and a height above the water
      vec4 paint(float az, float h){
        ${
          kind === 0
            ? `float n = f3(vec2(az * 3.6, h * 0.085) + 2.0);
               float n2 = f3(vec2(az * 9.0, h * 0.16) + 9.0);
               vec3 c = mix(vec3(0.43, 0.34, 0.27), vec3(0.56, 0.45, 0.37), smoothstep(0.3, 0.7, n2));
               c = mix(c, vec3(0.2, 0.165, 0.125), smoothstep(0.46, 0.62, n) * 0.8);
               c = mix(c, vec3(0.27, 0.255, 0.18), smoothstep(0.5, 0.7, n2) * smoothstep(0.4, 0.52, n) * 0.5);
               // far mountains at its foot, grey-violet, their feet in mist
               float ridge = 16.0 + 30.0 * f3(vec2(az * 7.0, 3.0)) + 9.0 * vnoise(vec2(az * 31.0, 5.0));
               float mt = 1.0 - smoothstep(-1.5, 1.5, h - ridge);
               c = mix(c, mix(vec3(0.3, 0.26, 0.25), vec3(0.19, 0.165, 0.17), smoothstep(0.0, ridge, h)), mt * 0.9);
               return vec4(c, 0.93);`
            : kind === 1
              ? `float n = f3(vec2(az * 5.0 + f3(vec2(az * 3.0, h * 0.03)) * 1.6, h * 0.09) + 5.0);
               float hatch = vnoise(vec2(az * 40.0, h * 0.2));
               vec3 c = vec3(0.058, 0.047, 0.038) * (0.8 + 0.4 * hatch);
               // long curls of paler cloud
               float curl = smoothstep(0.5, 0.57, n) * (1.0 - smoothstep(0.6, 0.74, n));
               c = mix(c, vec3(0.25, 0.19, 0.135), curl * 0.7);
               c = mix(c, vec3(0.13, 0.1, 0.075), smoothstep(0.6, 0.74, n) * 0.8);
               return vec4(c, 0.94);`
              : `// wings: a few rows of long soft feathers, each row shifted half a feather, lost in cloud here and there
               float row = h * 0.034 + f3(vec2(az * 1.5, 1.0)) * 0.8;
               float fx = az * 15.0 + floor(row) * 0.5;
               vec2 fq = vec2(fract(fx) - 0.5, fract(row));
               float feather = smoothstep(0.56, 0.2, length(vec2(fq.x * 1.25, fq.y - 0.08)));
               float n = f3(vec2(az * 3.0, h * 0.07) + 8.0);
               vec3 c = mix(vec3(0.33, 0.275, 0.22), vec3(0.6, 0.5, 0.41), feather * smoothstep(0.3, 0.6, n));
               c = mix(c, vec3(0.2, 0.17, 0.135), smoothstep(0.56, 0.7, 1.0 - n) * 0.55);
               return vec4(c, 0.9);`
        }
      }
      void main(){
        vec3 q = normalize(vLocal);
        // (the pattern is drawn in the sketch's units: the shells are built SS times larger)
        float h = (vLocal.y - ${DROP.toFixed(1)}) / ${SS.toFixed(2)};
        float az = atan(q.x, q.z);
        // the seam lies behind the king: the pattern is carried across it
        vec4 p = paint(az, h);
        float seam = smoothstep(2.6, 3.1, abs(az));
        if (seam > 0.0) p = mix(p, paint(az - sign(az) * 6.2832, h), seam * 0.5);
        vec3 col = p.rgb * (uSkyCol * 1.25 + vec3(0.2, 0.175, 0.16) + uHorizon * 0.22);
        float dist = length(vWorld - cameraPosition);
        // it thins to nothing where the plane goes through it, and its foot stands in the sea's mist
        float a = p.a * smoothstep(20.0, 220.0, dist) * smoothstep(-2.0, 30.0, h) * (1.0 - airAmt(vWorld) * 0.55) * exp(-dist * uMist * 1.5);
        // atmospheric perspective at this size: the far shells go hazier and bluer, the near ones keep their paint
        vec3 c2 = applyAir(col, vWorld);
        c2 = mix(c2, uHorizon * vec3(0.6, 0.66, 0.95) + vec3(0.03, 0.035, 0.07), smoothstep(500.0, 2200.0, dist) * 0.5);
        gl_FragColor = vec4(c2, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// a thin moon: the sliver left between two circles
function crescent(R: number) {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, -Math.PI * 0.62, Math.PI * 0.62, false);
  const d = R * 0.42;
  const r2 = Math.hypot(R * Math.cos(Math.PI * 0.62) - d, R * Math.sin(Math.PI * 0.62));
  const a2 = Math.atan2(R * Math.sin(Math.PI * 0.62), R * Math.cos(Math.PI * 0.62) - d);
  s.absarc(d, 0, r2, a2, -a2, true);
  return new THREE.ShapeGeometry(s, 40);
}

export default function RexWorld({ props }: { props: WorldProps }) {
  const comets = useRef<THREE.Group>(null);
  const b = useDisposable(() => {
    const r = rng(1909);
    const k = new Kit();
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const embers: Halo[] = [];
    const X = REX.x;
    const Z = REX.z;

    // the dark sphere that holds the globe: open to the front and the back in a great round window
    const th0 = Math.asin(REX.portal / REX.bulb);
    const bulb = new THREE.SphereGeometry(REX.bulb, 72, 30, 0, Math.PI * 2, th0, Math.PI - 2 * th0);
    bulb.rotateX(Math.PI / 2);
    k.add(bulb, [X, 0, Z], DARK, { top: DARK_TOP });
    const pz = Math.cos(th0) * REX.bulb;
    for (const s of [-1, 1]) {
      // the window's edge: a broad dark moulding, and a thread of gilt inside it
      k.add(new THREE.TorusGeometry(REX.portal + 2.2 * KS, 2.6 * KS, 10, 120), [X, 0, Z + s * (pz - 0.6 * KS)], DARK_TOP);
      k.add(new THREE.TorusGeometry(REX.portal - 0.5 * KS, 0.34 * KS, 6, 160), [X, 0, Z + s * (pz + 0.9 * KS)], GILT, { glow: 0.85 });
    }

    // the altar before him: six-sided steps, and the blade of light that rises from them
    const bz = Z + REX.bulb + 13 * KS;
    for (let i = 0; i < 5; i++) k.add(new THREE.CylinderGeometry((21 - i * 3.6) * KS, (22.2 - i * 3.6) * KS, 2.3 * KS, 6), [X, (0.9 + i * 2.3) * KS, bz], [0.03, 0.025, 0.022], { top: [0.1, 0.08, 0.06], flat: true });
    const bladeY = 11.5 * KS;
    // the blade of light: a needle that rises far above the altar into the dusk
    k.add(new THREE.CylinderGeometry(0.1, 1.0 * KS, 62 * KS * 1.6, 6, 8), [X, bladeY + 31 * KS * 1.6, bz], [1.0, 0.88, 0.66], { glow: 2.4 });
    k.add(new THREE.CylinderGeometry(0.05, 0.42 * KS, 40 * KS * 1.6, 5, 4), [X, bladeY + 20 * KS * 1.6, bz], [1.0, 0.95, 0.82], { glow: 3.4 });
    for (let i = 0; i < 6; i++) glows.push({ p: [X, bladeY + (6 + i * 15) * KS, bz + 1], size: (38 - i * 5) * KS, col: [1, 0.76, 0.46], k: 0.28 - i * 0.035 });
    halos.push({ p: [X, bladeY + 2.5 * KS, bz + 1], size: 8 * KS, col: [1, 0.86, 0.6], k: 1.1 });

    // his crown: battlements round the brow, a tower at each quarter, the crown itself, and at either hand a pale crown of flames
    const nM = 30;
    for (let i = 0; i < nM; i++) {
      const a = ((i + 0.5) / nM) * Math.PI * 2;
      k.box(5.0 * KS, 4.6 * KS, 3.2 * KS, [X + Math.sin(a) * 51.2 * KS, DECK + 2.3 * KS, Z + Math.cos(a) * 51.2 * KS], DARK, { top: DARK_TOP, rot: [0, a, 0] });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 2;
      const p: V3 = [X + Math.sin(a) * 46.5 * KS, DECK, Z + Math.cos(a) * 46.5 * KS];
      k.add(new THREE.CylinderGeometry(3.3 * KS, 3.7 * KS, 9 * KS, 10), [p[0], p[1] + 4.5 * KS, p[2]], DARK, { top: DARK_TOP });
      k.add(new THREE.ConeGeometry(4.4 * KS, 8 * KS, 10), [p[0], p[1] + 13 * KS, p[2]], DARK_TOP);
    }
    k.add(new THREE.CylinderGeometry(21 * KS, 20 * KS, 6.5 * KS, 28, 1, true), [X, DECK + 3.25 * KS, Z], DARK, { top: DARK_TOP });
    const nP = 14;
    for (let i = 0; i < nP; i++) {
      const a = (i / nP) * Math.PI * 2;
      const tall = i % 2 === 0;
      k.add(new THREE.ConeGeometry(2.7 * KS, (tall ? 14 : 9.5) * KS, 4), [X + Math.sin(a) * 20.4 * KS, DECK + (6.5 + (tall ? 7 : 4.75)) * KS, Z + Math.cos(a) * 20.4 * KS], DARK_TOP, { rot: [0, a + Math.PI / 4, 0], flat: true });
    }
    glows.push({ p: [X, DECK + 9 * KS, Z], size: 78 * KS, col: [0.9, 0.6, 0.32], k: 0.2 });
    for (const sx of [-1, 1]) {
      const cx = X + sx * 34 * KS;
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * Math.PI * 2;
        const tall = j % 3 === 0;
        k.add(new THREE.ConeGeometry(1.5 * KS, (tall ? 13 : 8.5) * KS, 4), [cx + Math.sin(a) * 5.6 * KS, DECK + (tall ? 6.5 : 4.25) * KS, Z + Math.cos(a) * 5.6 * KS], [0.92, 0.8, 0.66], { glow: 0.5, top: [1, 0.9, 0.76], flat: true });
      }
      glows.push({ p: [cx, DECK + 7 * KS, Z], size: 36 * KS, col: [1, 0.76, 0.5], k: 0.3 });
    }
    // small fires on his shoulders
    const nS = 20;
    for (let i = 0; i < nS; i++) {
      const a = ((i + 0.5) / nS) * Math.PI * 2;
      const p: V3 = [X + Math.sin(a) * 53.5 * KS, 166.5 * KS, Z + Math.cos(a) * 53.5 * KS];
      k.add(new THREE.ConeGeometry(0.8 * KS, 3.6 * KS, 4), [p[0], p[1] + 1.8 * KS, p[2]], FIRE, { glow: 1.6 });
      embers.push({ p: [p[0], p[1] + 2.2 * KS, p[2]], size: 3.6 * KS, col: FIRE, k: 0.5 });
    }

    // fires along the rim of the first shell (the arc that faces the way in, and its far twin), and round its foot on the water
    const fire = (p: V3, s: number, lean = 0) => {
      const n = 6;
      for (let j = 0; j < n; j++) {
        const o = (j - (n - 1) / 2) * 0.95 * s;
        const mid = 1 - Math.abs(j - (n - 1) / 2) / n;
        const h = (3.4 + r() * 4.2 + mid * 5) * s;
        k.add(new THREE.ConeGeometry((0.5 + r() * 0.3) * s, h, 5), [p[0] + o * Math.cos(lean), p[1] + h / 2 - 0.4 + o * Math.sin(lean), p[2] + (r() - 0.5) * 1.4], [0.05, 0.038, 0.03], { top: [0.2, 0.12, 0.06] });
      }
      embers.push({ p: [p[0], p[1] + 1.8 * s, p[2]], size: 4.6 * s, col: FIRE, k: 0.7 });
    };
    const a0 = Math.asin(DROP / SHELLS[0]) + 0.05;
    const nRim = props.mobile ? 26 : 60;
    for (let i = 0; i < nRim; i++) {
      const a = a0 + ((i + 0.5) / nRim) * (Math.PI - 2 * a0);
      for (const s of [-1, 1]) fire([X + Math.cos(a) * (SHELLS[0] - 1.5 * SS), Math.sin(a) * (SHELLS[0] - 1.5 * SS) - DROP, Z + s * 0.6 * SS], 1.15 * SS, a - Math.PI / 2);
    }
    const footR = Math.sqrt(SHELLS[0] * SHELLS[0] - DROP * DROP);
    const nFoot = props.mobile ? 20 : 44;
    for (let i = 0; i < nFoot; i++) {
      const a = ((i + 0.5) / nFoot) * Math.PI * 2;
      // none where the plane comes in over the water
      if (Math.abs(Math.sin(a)) < 0.2 && Math.cos(a) > 0) continue;
      const p: V3 = [X + Math.sin(a) * footR, 0, Z + Math.cos(a) * footR];
      k.add(new THREE.CylinderGeometry(2.6 * SS, 4.2 * SS, 2.4 * SS, 7), [p[0], 0.5 * SS, p[2]], [0.035, 0.03, 0.026], { top: [0.09, 0.07, 0.055] });
      fire([p[0], 1.6 * SS, p[2]], 0.9 * SS);
    }

    // the wings of the upper air: tall pale angels standing in a row along the third shell, before and behind
    const nA = props.mobile ? 7 : 13;
    const RA = (SHELLS[1] + SHELLS[2]) / 2 - 3 * SS;
    for (let i = 0; i < nA; i++) {
      const a = Math.PI / 2 + (i - (nA - 1) / 2) * 0.085;
      for (const s of [-1, 1]) {
        const p: V3 = [X + Math.cos(a) * RA, Math.sin(a) * RA - DROP - 18 * SS, Z + s * 1.5 * SS];
        angel(k, p, 10.5 * SS, s > 0 ? 0 : Math.PI, [0.66, 0.56, 0.44], { glow: 0.2, wing: [0.86, 0.76, 0.62], open: 0.5 });
      }
      glows.push({ p: [X + Math.cos(a) * RA, Math.sin(a) * RA - DROP, Z], size: 30 * SS, col: [1, 0.82, 0.6], k: 0.12 });
    }

    // comets riding the dark shell: a bright head and a long thin tail, built once and turned slowly as one
    const ck = new Kit();
    const cometHalos: Halo[] = [];
    const nC = props.mobile ? 7 : 12;
    const a1 = Math.asin(DROP / SHELLS[1]) + 0.12;
    for (let i = 0; i < nC; i++) {
      const side = i % 2 === 0 ? 1 : -1; // falling away to either hand
      const R = SHELLS[0] + 12 * SS + r() * (SHELLS[1] - SHELLS[0] - 24 * SS);
      const a = Math.PI / 2 + side * (0.14 + (Math.floor(i / 2) + r() * 0.7) * ((Math.PI / 2 - a1 - 0.14) / Math.ceil(nC / 2)));
      const p: V3 = [Math.cos(a) * R, Math.sin(a) * R, ((i % 3) - 1) * SS];
      const rad = (1.7 + r() * 1.5) * SS;
      ck.add(new THREE.SphereGeometry(rad, 12, 10), p, [1, 0.86, 0.66], { glow: 2.0 });
      const len = (34 + r() * 40) * SS;
      const dir = a - side * (Math.PI / 2 + 0.1); // the tail streams back up the arc
      ck.add(new THREE.ConeGeometry(rad * 0.82, len, 7, 1, true), [p[0] + Math.cos(dir) * len * 0.5, p[1] + Math.sin(dir) * len * 0.5, p[2]], [0.8, 0.52, 0.3], { glow: 0.42, rot: [0, 0, dir - Math.PI / 2] });
      cometHalos.push({ p, size: rad * 5.5, col: [1, 0.76, 0.48], k: 0.9 });
    }

    // the sun, high to the left in its rays; the thin moon to the right
    // (the sun is the sky's own, high to the left: see GreatSun below)
    const suns: Halo[] = [];
    const moon = crescent(100);
    k.add(moon, [X + 1500, 1400, Z - 1300], [1, 0.95, 0.82], { glow: 1.5, rot: [0, -0.5, 0.75] });
    glows.push({ p: [X + 1500, 1400, Z - 1296], size: 380, col: [0.9, 0.78, 0.6], k: 0.1 });
    // stars over the outermost shell, drawn as his: small, many, warm
    for (let i = 0; i < (props.mobile ? 40 : 110); i++) {
      const a = r() * Math.PI * 2;
      const el = 0.35 + r() * 1.0;
      const d = 2300;
      halos.push({ p: [X + Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d * 0.7, Z + Math.sin(a) * Math.cos(el) * d], size: 5 + r() * 9, col: [1, 0.8, 0.6], k: 0.55 });
    }

    const lights = [new THREE.Vector3(X, 30 * KS, bz)];
    const king = new THREE.LatheGeometry(
      KING.map(([rr, y]) => new THREE.Vector2(rr, y)),
      props.mobile ? 48 : 88,
    );
    const shells = SHELLS.map((R) => new THREE.SphereGeometry(R, props.mobile ? 64 : 96, props.mobile ? 20 : 30, 0, Math.PI * 2, 0, Math.acos(DROP / R) + 0.06));
    return {
      set: k.build(),
      tempera: makeTempera({ amb: 1, key: 0.5, rim: [0.34, 0.235, 0.13], rimPow: 3, grain: 1, ao: 0.35, aoH: 120, gold: 0.25, wrap: 0.4 }),
      king,
      kingMat: makeKingMaterial(),
      globe: new THREE.SphereGeometry(REX.r, 72, 48),
      globeMat: makeGlobeMaterial(),
      shells,
      shellMats: [makeShellMaterial(0), makeShellMaterial(1), makeShellMaterial(2)],
      comets: ck.build(),
      cometHalos: haloGeometry(cometHalos),
      cometHaloMat: makeHaloMaterial(0),
      halos,
      glows,
      embers,
      suns,
      water: makeWater({
        def,
        lights,
        lightCol: [1.0, 0.82, 0.56],
        lightLen: 760,
        deep: [0.034, 0.028, 0.022],
        calm: 0.3,
        shore: REX_PAL.shore,
        // the globe in its dark sphere and the king above them stand mirrored in the water
        reflect: /* glsl */ `
          ${kingGLSL}
          ${GLOBE_GLSL}
          vec4 worldReflect(vec3 P, vec3 r){
            vec3 c = vec3(${X.toFixed(1)}, 0.0, ${Z.toFixed(1)});
            vec3 oc = P - c;
            float bq = dot(oc, r);
            float m = 0.0; vec3 col = vec3(0.026, 0.021, 0.018);
            float R = ${REX.bulb.toFixed(1)};
            float h = bq * bq - (dot(oc, oc) - R * R);
            if (h > 0.0 && -bq > 0.0) {
              m = smoothstep(0.0, 260.0, h);
              // through the round window, the globe
              vec3 e = normalize(oc + r * (-bq - sqrt(h)));
              float hg = bq * bq - (dot(oc, oc) - ${(REX.r * REX.r).toFixed(1)});
              if (abs(e.z) > ${Math.cos(th0).toFixed(3)} && hg > 0.0) {
                vec3 q = normalize(oc + r * (-bq - sqrt(hg)));
                col = mix(col, globeAlb(q) * 0.8, smoothstep(0.0, 120.0, hg));
              }
            }
            // the king: a tall figure standing on the globe's axis
            vec2 ax = c.xz - P.xz;
            float t0 = dot(ax, r.xz) / max(dot(r.xz, r.xz), 1e-4);
            if (t0 > 0.0) {
              float d = length(P.xz + r.xz * t0 - c.xz);
              float hw = kingR(r.y * t0);
              m = max(m, (1.0 - smoothstep(hw - 2.0, hw + 3.0, d)) * step(0.5, hw));
            }
            return vec4(col * (uSkyCol * 1.6 + 0.2), m * 0.92);
          }`,
      }),
    };
  }, [props.mobile]);
  // the comets creep along their arcs
  useFrame(() => {
    if (comets.current) comets.current.rotation.z = Math.sin(SKY_U.uTime.value * 0.02) * 0.1;
  });
  return (
    <>
      <GreatSun size={0.5} tint={[1, 0.74, 0.42]} rays={30} gain={0.8} />
      <WorldBase id="rex" def={def} pal={REX_PAL} props={props} grass={false} pathTint={[1, 0.84, 0.6]} pathGain={1.4} groundSize={1500} angels={false} />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[5200, 5200]} />
      </mesh>
      {/* the shells of the sky, the outermost first */}
      {[2, 1, 0].map((i) => (
        <mesh key={i} geometry={b.shells[i]} material={b.shellMats[i]} position={[REX.x, -DROP, REX.z]} renderOrder={-3 + (2 - i)} />
      ))}
      <mesh geometry={b.set} material={b.tempera} />
      <mesh geometry={b.king} material={b.kingMat} position={[REX.x, 0, REX.z]} />
      <mesh geometry={b.globe} material={b.globeMat} position={[REX.x, 0, REX.z]} />
      <group ref={comets} position={[REX.x, -DROP, REX.z]}>
        <mesh geometry={b.comets} material={b.tempera} />
        <mesh geometry={b.cometHalos} material={b.cometHaloMat} renderOrder={6} />
      </group>
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
      <Halos list={b.embers} />
      <Halos list={b.suns} kind={1} />
    </>
  );
}
