"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, haloGeometry, makeHaloMaterial, makePoints, makeTempera, makeWater, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, GreatSun, type Flock } from "./life";
import { makeCloudPaint, paintedCloudGeometry, type PCloud } from "./stars/forms";
import { ORIGIN, WORLDS, gateOf, pathOf } from "./voyage";
import { Kindling, useDeepLens, type Lamp } from "./fairy/shared";
import { Comet } from "./stars/comet";
import { buildAngels, type AngelSpot } from "../home/Angels";
import { buildWisps, makeWispMaterial } from "./sea/water";

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
// the great arch's opening, as worlds/portal.tsx OPENING.rex has it
const GATE_HALF = 110;
const GATE_RISE = 200;
// (the air the angels of the home forest stand in here: Rex's own, dusk throughout)
const REX_ANGEL_AIR = { glsl: GLSL_AIR, apply: "applyAir(col, vWorld)", amount: "airAmt(vWorld)", uniforms: WORLD_U, night: { value: 0.55 } };
export const REX_PAL: GroundPalette = { a: [0.19, 0.145, 0.1], b: [0.27, 0.2, 0.13], c: [0.12, 0.1, 0.08], shore: [0.33, 0.25, 0.17], rock: [0.12, 0.095, 0.085] };

// Everything is built at the size of the painting's first sketch and then made colossal: the king, his globe
// and the dark sphere that holds it by KS, the shells of the sky by SS (they stand kilometres across: the plane
// flies in through the first and circles the king inside them).
// (the king stands 870 m to the points of his crown; the shells of his sky are three and a half kilometres across)
// (Q: how much larger he is than he was first built: the king stands 1270 m to the points of his crown)
export const Q = 1.42;
const KS = 3.4 * Q;
const SS = 4.4 * Q;
// the globe (R), the dark sphere that holds it (B), and the shells of the sky: all struck from one axis
export const REX = { x: 0, z: -500 * Q, r: 58 * KS, bulb: 82 * KS, portal: 62 * KS };
const REX_CENTRE: V3 = [REX.x, 0, REX.z];
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
  [50, 66],
  [50, 72],
  [48, 74],
  [48, 112],
  [50, 114],
  [50, 118],
  [53, 121],
  [59, 127],
  [62, 138],
  [62, 150],
  [59, 159],
  [53, 165],
  [47, 168],
  [42, 171],
  [41, 176],
  [41, 214],
  [43, 217],
  [48, 224],
  [55, 229],
  [56, 231],
  [56, 236],
  [52, 236],
  [0.1, 236],
];
// his radius at a height (sketch units): for whatever is set on him
const kingRad = (y: number) => (y < 119 ? 48.3 : y < 167 ? 49 + 13 * Math.sin(((y - 119) / 48) * Math.PI) : y < 216 ? 41.3 : 55);
const KING = KING0.map(([r, y]): [number, number] => [r * KS, y * KS]);
const DECK = 236 * KS;
// his half-width at a height, for the water's mirror of him
const kingGLSL = `float kingR0(float y){ return y < 60.0 ? 0.0 : y < 119.0 ? 49.0 : y < 167.0 ? 49.0 + 13.0 * sin((y - 119.0) / 48.0 * 3.1416) : y < 222.0 ? 41.0 : y < 236.0 ? 55.0 : y < 258.0 ? 24.0 : 0.0; }
float kingR(float y){ return kingR0(y / ${KS.toFixed(1)}) * ${KS.toFixed(1)}; }`;


// Painted stone at the size he is. Every mark is drawn in the sketch's own units (world metres / KS), so a tower
// 100 m across carries the same camouflage of olive, grey-green and rose as the king himself, laid by three planes
// (never stretched down a wall), with the long upright strokes of the pastel over it and courses of dressed stone
// whose lines go out before they could shimmer. The deck is paved in rings and spokes inlaid with gilt.
const STONE_GLSL = /* glsl */ `
float st3(vec2 p){ return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.0) * 0.3 + vnoise(p * 4.3 + 13.0) * 0.15; }
vec3 stoneAlb(vec3 P, vec3 n, vec3 base){
  vec3 w = pow(abs(n), vec3(5.0)); w /= (w.x + w.y + w.z);
  float blot = 0.0; float blot2 = 0.0; float stroke = 0.0;
  if (w.x > 0.02) { blot += w.x * st3(P.zy * 0.05 + 1.0); blot2 += w.x * st3(P.zy * 0.13 + 5.0); stroke += w.x * (vnoise(vec2(P.z * 0.55, P.y * 0.05)) * 0.6 + vnoise(vec2(P.z * 1.7 + 3.0, P.y * 0.16)) * 0.4); }
  if (w.z > 0.02) { blot += w.z * st3(P.xy * 0.05 + 9.0); blot2 += w.z * st3(P.xy * 0.13 + 2.0); stroke += w.z * (vnoise(vec2(P.x * 0.55 + 4.0, P.y * 0.05)) * 0.6 + vnoise(vec2(P.x * 1.7, P.y * 0.16 + 3.0)) * 0.4); }
  if (w.y > 0.02) { blot += w.y * st3(P.xz * 0.05 + 4.0); blot2 += w.y * st3(P.xz * 0.13 + 8.0); stroke += w.y * (vnoise(P.xz * 0.5) * 0.6 + vnoise(P.xz * 1.6 + 3.0) * 0.4); }
  // camouflage: dark olive stone with grey-green and rose-umber blotches, as in the painting's body
  vec3 c = base * mix(0.8, 1.35, smoothstep(0.3, 0.7, blot2));
  c = mix(c, vec3(0.085, 0.095, 0.062), smoothstep(0.5, 0.62, blot) * 0.85);
  c = mix(c, vec3(0.15, 0.165, 0.14), smoothstep(0.56, 0.7, blot2) * smoothstep(0.45, 0.6, blot) * 0.7);
  c = mix(c, vec3(0.2, 0.135, 0.12), smoothstep(0.64, 0.76, blot + (blot2 - 0.5) * 0.4) * 0.55);
  c *= 0.82 + (stroke - 0.5) * 0.5;
  // courses of dressed stone up the walls, offset row on row, each block a shade of its own
  float side = 1.0 - smoothstep(0.35, 0.7, abs(n.y));
  float ch = 5.0;
  float cy = P.y / ch; float row = floor(cy);
  float along = P.x * w.z + P.z * w.x;
  float bx = along / 11.0 + row * 0.5; float bi = floor(bx);
  float aa = max(fwidth(cy), fwidth(bx)) * 1.2;
  float fade = 1.0 - smoothstep(0.12, 0.4, aa);
  float lineY = smoothstep(0.035 + aa, 0.0, min(fract(cy), 1.0 - fract(cy)));
  float lineX = smoothstep(0.03 + aa, 0.0, min(fract(bx), 1.0 - fract(bx)));
  float blk = hash12(vec2(bi, row));
  c *= 1.0 + (blk - 0.5) * 0.5 * side * fade;
  c = mix(c, c * 0.45, max(lineY, lineX * step(0.5, side)) * side * fade);
  // (the lip of each course catches the light)
  c += vec3(0.045, 0.03, 0.02) * smoothstep(0.9, 1.0, fract(cy)) * side * fade;
  return c;
}`;
const patchStone = (m: THREE.ShaderMaterial) => {
  m.fragmentShader = m.fragmentShader
    .replace("void main(){", `${STONE_GLSL}\nvoid main(){`)
    .replace("vec3 alb = vCol.rgb * (1.0 + (dab - 0.5) * 0.34 * uDab);", `vec3 alb = mix(stoneAlb(vLocal / ${KS.toFixed(2)}, n, vCol.rgb), vCol.rgb * (1.0 + (dab - 0.5) * 0.3), clamp(vCol.a * 1.6, 0.0, 1.0));`);
  return m;
};

const GLOBE_GLSL = /* glsl */ `
vec3 globeAlb(vec3 q){
  // lands and seas of a dark world: broad pale shapes with torn edges
  vec2 uv = vec2(atan(q.z, q.x) * 1.4, q.y * 2.2);
  float land = fbm(uv * 1.5 + 3.0) * 0.7 + fbm(uv * 4.5 + 9.0) * 0.3;
  float m = smoothstep(0.46, 0.55, land);
  return mix(vec3(0.028, 0.036, 0.062), mix(vec3(0.58, 0.43, 0.36), vec3(0.33, 0.4, 0.27), smoothstep(0.55, 0.75, land)), m);
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
      ${STONE_GLSL}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        // (in the sketch's own units: the king is drawn at one size and built at another)
        vec3 L = vLocal / ${KS.toFixed(1)};
        float y = L.y;
        // (the paler king is drawn on his front and on his back; from the side he is all dark stone)
        bool front = L.z > 0.0;
        float s = L.x;
        float u = abs(s);
        // the inner king: a body in two stages, two small towers and a crown
        float w = y < 132.0 ? 27.0 : 23.0;
        float body = (1.0 - smoothstep(w - 0.5, w + 0.5, u)) * smoothstep(73.0, 74.0, y) * (1.0 - smoothstep(165.5, 166.5, y));
        float tw = abs(u - 19.5);
        float tower = (1.0 - smoothstep(3.0, 3.6, tw)) * step(165.5, y) * (1.0 - smoothstep(-0.4, 0.4, y - 172.0 + max(tw - 0.4, 0.0) * 1.9 - 4.6));
        float zig = abs(fract(u * 0.36) - 0.5) * 2.0;
        float crown = (1.0 - smoothstep(8.6, 9.2, u)) * step(165.5, y) * (1.0 - smoothstep(-0.3, 0.3, y - 172.5 - zig * 3.4));
        float m = max(body, max(tower, crown)) * smoothstep(0.35, 0.8, abs(normalize(L.xz).y));
        // patches of cloud, long and level (laid along the arc of his side, never stretched across it)
        float arc = atan(L.x, L.z) * 49.0;
        vec2 pc = vec2(arc * 0.035 + (front ? 0.0 : 17.0), y * 0.1);
        float c1 = fbm(pc + 3.0);
        float c2 = fbm(pc * 1.9 + 11.0);
        vec3 inner = mix(vec3(0.17, 0.23, 0.15), vec3(0.56, 0.4, 0.36), smoothstep(0.4, 0.58, c1));
        inner = mix(inner, vec3(0.1, 0.12, 0.19), smoothstep(0.54, 0.66, c2) * 0.85);
        inner = mix(inner, vec3(0.5, 0.48, 0.4), smoothstep(0.62, 0.7, c1 + (c2 - 0.5) * 0.3) * 0.3);
        inner *= mix(1.0, 0.72, smoothstep(134.0, 131.0, y) * smoothstep(127.0, 131.0, y));
        // the long upright strokes of the pastel, and a fine tooth
        float hatch = vnoise(vec2(arc * 0.9, y * 0.05)) * 0.55 + vnoise(vec2(arc * 3.3, y * 0.22 + 5.0)) * 0.3 + vnoise(vec2(arc * 9.0, y * 0.9)) * 0.15;
        inner *= 0.86 + hatch * 0.3;
        vec3 dark = stoneAlb(L, n, vec3(0.052, 0.049, 0.036));
        // the deck: flagged in rings and spokes, a thread of gilt between
        float onDeck = smoothstep(0.88, 0.97, n.y) * step(234.0, y);
        float rr = length(L.xz);
        float ang = atan(L.x, L.z);
        float daa = fwidth(rr) * 1.4;
        float ring = smoothstep(0.35 + daa, 0.0, abs(fract(rr / 11.0 - 0.5) - 0.5) * 11.0);
        float spoke = smoothstep(0.3 + daa, 0.0, abs(fract(ang * 12.0 / 3.14159 + 0.5) - 0.5) * rr * 0.26) * step(11.0, rr);
        float flag = hash12(floor(vec2(rr / 5.5, ang * rr / 5.5)));
        vec3 deck = dark * (0.8 + flag * 0.7) * mix(vec3(1.0), vec3(1.5, 1.35, 1.05), 0.4);
        deck = mix(deck, vec3(0.95, 0.68, 0.36) * 0.5, max(ring * step(rr, 53.0), spoke) * (1.0 - smoothstep(0.1, 0.5, daa)));
        dark = mix(dark, deck, onDeck);
        vec3 alb = mix(dark, inner, m * (1.0 - onDeck));
        // the foot of him stands in the shade of the water and of his own sphere
        float ao = mix(0.5, 1.0, smoothstep(30.0, 130.0, y));
        float lit = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0);
        // (the key warms the faces turned to it; the shade side takes the cool of the sky)
        vec3 col = alb * (uSkyCol * (0.75 + 0.3 * n.y) * ao + vec3(0.02, 0.026, 0.045) + uKeyCol * lit * lit * 0.62 * mix(1.0, ao, 0.5));
        // the inner king keeps a little light of his own, so he reads at dusk
        col += inner * m * 0.16 * glowK() * 2.0;
        // a thin warm line on the edge of the form against the sky, as he outlined things
        col += vec3(0.3, 0.2, 0.11) * pow(1.0 - abs(dot(n, V)), 4.0) * (1.0 - m) * 0.6;
        // he is so tall the air between the eye and his crown turns cool: far is hazier and bluer
        col = applyAir(col, vWorld);
        col = mix(col, uHorizon * vec3(0.62, 0.66, 0.92) + vec3(0.02, 0.025, 0.05), smoothstep(${(300 * Q).toFixed(1)}, ${(2400 * Q).toFixed(1)}, length(vWorld - cameraPosition)) * 0.45);
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
               vec3 c = mix(vec3(0.5, 0.35, 0.32), vec3(0.68, 0.49, 0.44), smoothstep(0.3, 0.7, n2));
               c = mix(c, vec3(0.2, 0.22, 0.14), smoothstep(0.46, 0.62, n) * 0.8);
               c = mix(c, vec3(0.24, 0.32, 0.22), smoothstep(0.5, 0.7, n2) * smoothstep(0.4, 0.52, n) * 0.6);
               // far mountains at its foot, grey-violet, their feet in mist
               float ridge = 16.0 + 30.0 * f3(vec2(az * 7.0, 3.0)) + 9.0 * vnoise(vec2(az * 31.0, 5.0));
               float mt = 1.0 - smoothstep(-1.5, 1.5, h - ridge);
               c = mix(c, mix(vec3(0.32, 0.31, 0.42), vec3(0.17, 0.18, 0.28), smoothstep(0.0, ridge, h)), mt * 0.9);
               return vec4(c, 0.93);`
            : kind === 1
              ? `float n = f3(vec2(az * 5.0 + f3(vec2(az * 3.0, h * 0.03)) * 1.6, h * 0.09) + 5.0);
               float hatch = vnoise(vec2(az * 40.0, h * 0.2));
               vec3 c = vec3(0.042, 0.046, 0.072) * (0.8 + 0.4 * hatch);
               // long curls of paler cloud
               float curl = smoothstep(0.5, 0.57, n) * (1.0 - smoothstep(0.6, 0.74, n));
               c = mix(c, vec3(0.3, 0.22, 0.2), curl * 0.7);
               c = mix(c, vec3(0.12, 0.13, 0.1), smoothstep(0.6, 0.74, n) * 0.8);
               // comets drawn all over it: a pale head, a long thin tail streaming back up the arc
               vec2 cq = vec2(az * 9.0, h * 0.016); vec2 cc = floor(cq); float ch = hash12(cc + 4.0);
               vec2 cf = fract(cq) - vec2(0.3 + 0.4 * ch, 0.3 + 0.4 * hash12(cc + 9.0));
               float sg = az > 0.0 ? 1.0 : -1.0;
               float head = smoothstep(0.045, 0.015, length(cf * vec2(1.0, 0.5)));
               float tail = smoothstep(0.014, 0.0, abs(cf.y - abs(cf.x) * 0.3)) * step(0.0, -cf.x * sg) * smoothstep(0.5, 0.0, abs(cf.x));
               c += vec3(1.0, 0.78, 0.56) * (head * 1.3 + tail * 0.45) * step(0.45, ch);
               return vec4(c, 0.94);`
              : `// wings: a few rows of long soft feathers, each row shifted half a feather, lost in cloud here and there
               float row = h * 0.034 + f3(vec2(az * 1.5, 1.0)) * 0.8;
               float fx = az * 15.0 + floor(row) * 0.5;
               vec2 fq = vec2(fract(fx) - 0.5, fract(row));
               float feather = smoothstep(0.56, 0.2, length(vec2(fq.x * 1.25, fq.y - 0.08)));
               float n = f3(vec2(az * 3.0, h * 0.07) + 8.0);
               vec3 c = mix(vec3(0.34, 0.3, 0.32), vec3(0.72, 0.56, 0.5), feather * smoothstep(0.3, 0.6, n));
               c = mix(c, vec3(0.18, 0.2, 0.26), smoothstep(0.56, 0.7, 1.0 - n) * 0.55);
               // and winged figures standing in rows among the feathers, as he drew them all over the upper air: a long
               // robe wide at the hem, a head in a ring of light, two tall wings spread from the shoulders with the
               // feathers drawn in them; every edge as wide as the pixel that draws it
               float arow = floor(h * 0.036);
               vec2 aq = vec2(az * 22.0 + arow * 0.5, h * 0.036); vec2 ac = floor(aq); vec2 af = fract(aq) - 0.5;
               float aaw = (fwidth(aq.x) + fwidth(aq.y)) * 0.7;
               float pick = step(0.38, hash12(ac + 2.0)) * (1.0 - smoothstep(0.25, 0.6, aaw));
               float robeW = mix(0.13, 0.045, smoothstep(-0.42, 0.18, af.y));
               float robe = (1.0 - smoothstep(robeW - aaw, robeW + aaw, abs(af.x))) * step(-0.42, af.y) * step(af.y, 0.2);
               float hd = length(vec2(af.x, af.y - 0.27));
               float head = 1.0 - smoothstep(0.045 - aaw, 0.045 + aaw, hd);
               float nimbus = 1.0 - smoothstep(0.01, 0.01 + aaw * 1.5, abs(hd - 0.09));
               vec2 wv = vec2(abs(af.x) - 0.05, af.y - 0.08);
               vec2 wr = vec2(wv.x * 0.82 - wv.y * 0.57, wv.x * 0.57 + wv.y * 0.82);
               float along = wr.y / 0.36;
               float across = wr.x / (0.075 * sin(clamp(along, 0.0, 1.0) * 3.1416) + 0.006);
               float wing = (1.0 - smoothstep(0.8, 1.1, abs(across))) * step(0.0, along) * step(along, 1.0);
               float plume = 0.72 + 0.28 * sin(across * 7.0 + along * 5.0);
               c = mix(c, vec3(0.93, 0.8, 0.68), max(max(robe, head), wing * plume) * pick * 0.85);
               c += vec3(1.0, 0.8, 0.52) * nimbus * pick * 0.45;
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
        float a = p.a * smoothstep(60.0, 520.0, dist) * smoothstep(-2.0, 30.0, h) * (1.0 - airAmt(vWorld) * 0.55) * exp(-dist * uMist * 1.5) * (1.0 - smoothstep(${(2500 * Q).toFixed(1)}, ${(2950 * Q).toFixed(1)}, dist));
        // atmospheric perspective at this size: the far shells go hazier and bluer, the near ones keep their paint
        vec3 c2 = applyAir(col, vWorld);
        c2 = mix(c2, uHorizon * vec3(0.6, 0.66, 0.95) + vec3(0.03, 0.035, 0.07), smoothstep(${(500 * Q).toFixed(1)}, ${(2600 * Q).toFixed(1)}, dist) * 0.6);
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

// The whole of him, made part by part with a pause after each, so that it can be made a little a frame under the
// closed cloud (worlds/Worlds.tsx hands prepareRex to the plane) instead of all at once in one long frame.
function* rexSteps(props: WorldProps) {
    const r = rng(1909);
    const k = new Kit();
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    // (the fires are dark from far off and come alight one after another as the plane nears the king: round the
    // foot of the first shell from the near side to the far, then up its rim from both feet to the top)
    const embers: Lamp[] = [];
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

    yield;
    // his crown: battlements round the brow, a tower at each quarter, the crown itself, and at either hand a pale crown of flames
    // (everything on him is drawn small and many, so the eye has something to measure him by)
    const nM = props.mobile ? 80 : 180;
    for (let i = 0; i < nM; i++) {
      const a = ((i + 0.5) / nM) * Math.PI * 2;
      k.box(3.4, 6.5, 3, [X + Math.sin(a) * 55.3 * KS, DECK + 3.2, Z + Math.cos(a) * 55.3 * KS], DARK, { top: DARK_TOP, rot: [0, a, 0] });
      if (i % 3 === 0) k.box(3.0, 4.6, 2.6, [X + Math.sin(a) * 24.4 * KS, DECK + 6.5 * KS + 2.3, Z + Math.cos(a) * 24.4 * KS], DARK, { top: DARK_TOP, rot: [0, a, 0] });
    }
    // storeys: a ledge round him every forty metres or so, and a walk round his shoulders
    for (let i = 0; i < 20; i++) {
      const yy = 66 + i * 8.4;
      if (yy > 213) continue;
      const rad = kingRad(yy) * KS + 0.8;
      k.add(new THREE.CylinderGeometry(rad, rad, 1.6, props.mobile ? 48 : 96, 1, true), [X, yy * KS, Z], DARK_TOP);
    }
    // watchers on his brow and his shoulders: the home forest's angels (robes that go to mist, wings that breathe), each
    // as tall as a tower and lost on him, turned outward; and two greater still, guarding the arch
    const spots: AngelSpot[] = [];
    const nW = props.mobile ? 6 : 14;
    for (let i = 0; i < nW; i++) {
      const a = ((i + 0.5) / nW) * Math.PI * 2;
      const top = i % 2 === 0;
      const rad = (top ? 52 : 54) * KS;
      if (top && Math.min(a, Math.PI * 2 - a) < 0.5) continue; // (the way in to the arch stays clear)
      spots.push({ x: X + Math.sin(a) * rad, y: top ? DECK : 164.2 * KS, z: Z + Math.cos(a) * rad, yaw: a, s: top ? 19 : 22, robe: i % 4 });
    }
    {
      const G = gateOf("rex")!.pos;
      for (const sx of [-1, 1]) spots.push({ x: X + sx * (GATE_HALF + 62), y: DECK, z: G.z + 30, yaw: sx * 0.35, s: 30, robe: sx > 0 ? 0 : 1 });
    }
    // eight towers round his brow, the two at either hand of his face the tallest, each roofed with a spire
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
      if (i === 6) continue; // (the one at the front: the way over his brow)
      const big = i % 4 === 0 ? 1.5 : 1;
      const p: V3 = [X + Math.sin(a) * 51 * KS, DECK, Z + Math.cos(a) * 51 * KS];
      k.add(new THREE.CylinderGeometry(3.4 * KS * big, 3.9 * KS * big, 20 * KS * big, 12), [p[0], p[1] + 2 * KS * big, p[2]], DARK, { top: DARK_TOP });
      k.add(new THREE.CylinderGeometry(4.3 * KS * big, 3.4 * KS * big, 2 * KS, 12), [p[0], p[1] + (12 * big + 1) * KS, p[2]], DARK_TOP);
      k.add(new THREE.ConeGeometry(4.6 * KS * big, 13 * KS * big, 12), [p[0], p[1] + (12 * big + 2 + 6.5 * big) * KS, p[2]], DARK, { top: [0.5, 0.36, 0.22] });
      for (let j = 0; j < 3; j++) k.box(0.5 * KS, 1.6 * KS, 0.3, [p[0] + Math.sin(a) * 3.7 * KS * big, p[1] + (3 + j * 3) * KS * big, p[2] + Math.cos(a) * 3.7 * KS * big], [1, 0.74, 0.4], { glow: 1.3, rot: [0, a, 0] });
    }

    // the great arch: it stands on his deck before the crown, a lancet of dressed stone as wide as the crown itself,
    // and the plane goes in at its middle (the opening is worlds/portal.tsx OPENING.rex: half width GATE_HALF, GATE_RISE
    // above the gate's height; the stone is drawn exactly round it)
    {
      const G = gateOf("rex")!.pos;
      const wide = GATE_HALF * 1.04;
      const foot = DECK - 2;
      const spring = G.y + 2;
      const head = GATE_RISE * 1.03;
      const outline: V3[] = [[X - wide, foot, G.z]];
      outline.push([X - wide, spring, G.z]);
      for (let i = 1; i < 28; i++) {
        const th = Math.PI - (i / 28) * Math.PI;
        outline.push([X + Math.cos(th) * wide, spring + Math.sin(th) ** 0.9 * head, G.z]);
      }
      outline.push([X + wide, spring, G.z]);
      outline.push([X + wide, foot, G.z]);
      // two mouldings one over the other, the outer broad and dark, a thread of gilt in the angle of the inner
      k.tube(outline, 7.5, DARK, { seg: 220, sides: 10, top: DARK_TOP });
      k.tube(outline.map((q, i): V3 => (i === 0 || i === outline.length - 1 ? [q[0] * 0.97, q[1], q[2] + 6] : [X + (q[0] - X) * 0.955, G.y + (q[1] - G.y) * 0.97, q[2] + 6])), 4.2, DARK_TOP, { seg: 220, sides: 8 });
      k.tube(outline.map((q, i): V3 => (i === 0 || i === outline.length - 1 ? [q[0] * 0.945, q[1], q[2] + 3] : [X + (q[0] - X) * 0.925, G.y + (q[1] - G.y) * 0.945, q[2] + 3])), 1.1, GILT, { seg: 220, sides: 5, glow: 1.3 });
      // piers either side, each a tall block of courses with a pinnacle, and a flight of steps before the whole
      for (const sx of [-1, 1]) {
        k.box(30, 92, 36, [X + sx * (wide + 6), foot + 44, G.z], DARK, { top: DARK_TOP });
        k.box(36, 6, 42, [X + sx * (wide + 6), foot + 93, G.z], DARK_TOP);
        k.add(new THREE.ConeGeometry(11, 46, 4), [X + sx * (wide + 6), foot + 119, G.z], DARK, { top: [0.5, 0.36, 0.22], rot: [0, Math.PI / 4, 0], flat: true });
        glows.push({ p: [X + sx * (wide + 6), foot + 146, G.z], size: 26, col: [1, 0.8, 0.52], k: 0.5 });
        for (let j = 0; j < 4; j++) k.box(2.4, 14, 1, [X + sx * (wide + 6) + sx * 0, foot + 30 + j * 18, G.z + 18.5], [1, 0.74, 0.4], { glow: 1.2 });
      }
      for (let i = 0; i < 3; i++) k.box(2 * wide + 90 - i * 30, 3, 26 - i * 6, [X, foot + 1.5 + i * 3, G.z + 6 + i * 3], DARK_TOP, { top: [0.12, 0.095, 0.07] });
      // the keystone, a crowned boss at the point of the arch
      k.add(new THREE.ConeGeometry(9, 28, 4), [X, G.y + head + 14, G.z], DARK, { top: [0.9, 0.62, 0.32], glow: 0.14, rot: [0, Math.PI / 4, 0], flat: true });
      halos.push({ p: [X, G.y + head + 32, G.z], size: 22, col: [1, 0.84, 0.58], k: 0.9 });
    }
    yield;
    // great buttresses up his body and pilasters up his neck, each ending in a pinnacle: he is built, not turned
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2;
      const sn = Math.sin(a);
      const cs = Math.cos(a);
      k.box(7 * KS, 50 * KS, 5 * KS, [X + sn * 49.5 * KS, 91 * KS, Z + cs * 49.5 * KS], DARK, { top: DARK_TOP, rot: [0, a, 0] });
      k.add(new THREE.ConeGeometry(3.4 * KS, 12 * KS, 4), [X + sn * 50.5 * KS, 122 * KS, Z + cs * 50.5 * KS], DARK_TOP, { rot: [0, a + Math.PI / 4, 0], flat: true });
      k.box(4 * KS, 40 * KS, 3 * KS, [X + sn * 41.6 * KS, 195 * KS, Z + cs * 41.6 * KS], DARK, { top: DARK_TOP, rot: [0, a, 0] });
      // a tall lit lancet between each pair of pilasters
      const a2 = (i / 12) * Math.PI * 2;
      k.box(1.3 * KS, 16 * KS, 0.4, [X + Math.sin(a2) * 41.5 * KS, 198 * KS, Z + Math.cos(a2) * 41.5 * KS], [1, 0.72, 0.4], { glow: 0.9, rot: [0, a2, 0] });
    }
    k.add(new THREE.CylinderGeometry(24.5 * KS, 23.5 * KS, 7 * KS, 36, 1, true), [X, DECK + 3.5 * KS, Z], DARK, { top: DARK_TOP });
    k.add(new THREE.TorusGeometry(24.2 * KS, 0.35 * KS, 6, 96), [X, DECK + 6.6 * KS, Z], GILT, { glow: 0.9, rot: [Math.PI / 2, 0, 0] });
    const nP = 28;
    for (let i = 0; i < nP; i++) {
      const a = (i / nP) * Math.PI * 2;
      // (the front of the crown stands open: the way on goes in there)
      if (Math.min(a, Math.PI * 2 - a) < 0.5) continue;
      const tall = i % 2 === 0;
      k.add(new THREE.ConeGeometry(1.7 * KS, (tall ? 22 : 13) * KS, 4), [X + Math.sin(a) * 23.6 * KS, DECK + (7 + (tall ? 11 : 6.5)) * KS, Z + Math.cos(a) * 23.6 * KS], DARK, { top: [0.9, 0.62, 0.32], glow: 0.12, rot: [0, a + Math.PI / 4, 0], flat: true });
      if (tall) halos.push({ p: [X + Math.sin(a) * 23.6 * KS, DECK + 29.4 * KS, Z + Math.cos(a) * 23.6 * KS], size: 2.2 * KS, col: [1, 0.82, 0.56], k: 0.8 });
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
      embers.push({ p: [p[0], p[1] + 2.2 * KS, p[2]], size: 3.6 * KS, col: FIRE, k: 0.5, at: 620 * Q });
    }

    yield;
    // fires along the rim of the first shell (the arc that faces the way in, and its far twin), and round its foot on the water
    const fire = (p: V3, s: number, lean = 0, at = 1e5) => {
      const n = 6;
      for (let j = 0; j < n; j++) {
        const o = (j - (n - 1) / 2) * 0.95 * s;
        const mid = 1 - Math.abs(j - (n - 1) / 2) / n;
        const h = (3.4 + r() * 4.2 + mid * 5) * s;
        k.add(new THREE.ConeGeometry((0.5 + r() * 0.3) * s, h, 5), [p[0] + o * Math.cos(lean), p[1] + h / 2 - 0.4 + o * Math.sin(lean), p[2] + (r() - 0.5) * 1.4], [0.05, 0.038, 0.03], { top: [0.2, 0.12, 0.06] });
      }
      embers.push({ p: [p[0], p[1] + 1.8 * s, p[2]], size: 4.6 * s, col: FIRE, k: 0.7, at });
    };
    const a0 = Math.asin(DROP / SHELLS[0]) + 0.05;
    const nRim = props.mobile ? 70 : 240;
    for (let i = 0; i < nRim; i++) {
      const a = a0 + ((i + 0.5) / nRim) * (Math.PI - 2 * a0);
      for (const s of [-1, 1]) fire([X + Math.cos(a) * (SHELLS[0] - 1.5 * SS), Math.sin(a) * (SHELLS[0] - 1.5 * SS) - DROP, Z + s * 0.6 * SS], (0.34 + (i % 5 === 0 ? 0.3 : 0)) * SS, a - Math.PI / 2, (1320 - 640 * (1 - Math.abs(a - Math.PI / 2) / (Math.PI / 2 - a0))) * Q);
    }
    const footR = Math.sqrt(SHELLS[0] * SHELLS[0] - DROP * DROP);
    const nFoot = props.mobile ? 50 : 190;
    for (let i = 0; i < nFoot; i++) {
      const a = ((i + 0.5) / nFoot) * Math.PI * 2;
      // none where the plane comes in over the water
      if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) > 0) continue;
      const p: V3 = [X + Math.sin(a) * footR, 0, Z + Math.cos(a) * footR];
      k.add(new THREE.CylinderGeometry(1.1 * SS, 2.0 * SS, 1.0 * SS, 7), [p[0], 0.2 * SS, p[2]], [0.035, 0.03, 0.026], { top: [0.09, 0.07, 0.055] });
      fire([p[0], 0.7 * SS, p[2]], (0.3 + (i % 4 === 0 ? 0.25 : 0)) * SS, 0, (1620 - 880 * (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) / Math.PI)) * Q);
    }

    yield;
    // the wings of the upper air: tall pale angels standing in a row along the third shell, before and behind
    const RA = (SHELLS[1] + SHELLS[2]) / 2 - 3 * SS;
    const nA = props.mobile ? 8 : 18;
    const spots2: AngelSpot[] = [];
    for (let i = 0; i < nA; i++) {
      const a = Math.PI / 2 + (i - (nA - 1) / 2) * (1.5 / nA) * 1.0;
      for (const s of [-1, 1]) spots2.push({ x: X + Math.cos(a) * RA, y: Math.sin(a) * RA - DROP - 4 * SS, z: Z + s * 1.5 * SS, yaw: s > 0 ? 0 : Math.PI, s: (i % 6 === 3 ? 4.6 : 3.2) * SS, robe: (i + (s > 0 ? 0 : 2)) % 4 });
      if (i % 4 === 0) glows.push({ p: [X + Math.cos(a) * RA, Math.sin(a) * RA - DROP, Z], size: 30 * SS, col: [1, 0.82, 0.6], k: 0.1 });
    }

    yield;
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
    // (the moon and the stars ride with the eye, as a sky does: see the group that follows the camera)
    const sk = new Kit();
    const skyHalos: Halo[] = [];
    const skyGlows: Halo[] = [];
    sk.add(crescent(170 * Q), [1150 * Q, 1330 * Q, -1780 * Q], [1, 0.95, 0.82], { glow: 1.6, rot: [0, -0.5, 0.75] });
    skyGlows.push({ p: [1150 * Q, 1330 * Q, -1776 * Q], size: 560 * Q, col: [0.8, 0.8, 0.9], k: 0.14 });
    yield;
    // stars over the outermost shell, drawn as his: small, many, warm
    for (let i = 0; i < (props.mobile ? 40 : 110); i++) {
      const a = r() * Math.PI * 2;
      const el = 0.35 + r() * 1.0;
      const d = 2500 * Q;
      skyHalos.push({ p: [Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d * 0.8, Math.sin(a) * Math.cos(el) * d], size: 6 + r() * 12, col: [1, 0.8, 0.6], k: 0.6 });
    }

    // ----- what gives him his size -----
    const path = pathOf("rex").pts;
    const nearPath = (x: number, y: number, z: number) => {
      let d = 1e9;
      for (let i = 0; i < path.length; i += 8) d = Math.min(d, Math.hypot(path[i].x - x, path[i].y - y, path[i].z - z));
      return d;
    };
    yield;
    // cloud in rounded banks, one layer above another round him, gold where the low sun finds it, violet beneath
    const clouds: PCloud[] = [];
    const layers: [y: number, r0: number, r1: number, w: number, n: number][] = [
      [60 * Q, 800 * Q, 2200 * Q, 80 * Q, 40],
      [280 * Q, 1000 * Q, 2100 * Q, 110 * Q, 20],
    ];
    for (const [y, r0, r1, w, n0] of layers) {
      const n = props.mobile ? Math.round(n0 * 0.5) : Math.round(n0 * (0.7 + 0.5 * props.effects));
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = r0 + r() * (r1 - r0);
        const x = X + Math.sin(a) * d;
        const z = Z + Math.cos(a) * d;
        const yy = y + (r() - 0.5) * w * 0.8;
        const ww = w * (0.7 + r() * 0.8);
        if (nearPath(x, yy, z) < ww + 240) continue;
        clouds.push({ p: [x, yy, z], w: ww, seed: r() });
      }
    }
    yield;
    // lit windows in his dark body, row above row: each one a room
    const nWin = props.mobile ? 700 : 2600;
    const windows = pointsGeometry(
      nWin,
      (_, q) => {
        const row = Math.floor(q() * 70);
        const y = (64 + row * 2.1) * KS + 6;
        const yy = y / KS;
        const rad = kingRad(yy) * KS + 0.6;
        const a = Math.floor(q() * 300) * ((Math.PI * 2) / 300) + (row % 2) * 0.01;
        return [X + Math.sin(a) * rad, y, Z + Math.cos(a) * rad, 0.5 + q() * 1.3];
      },
      77,
    );
    // mist lying on the sea, and standing round the feet of the shells
    const puffs: Puff[] = [];
    for (let i = 0; i < (props.mobile ? 16 : 46); i++) {
      const a = r() * Math.PI * 2;
      const d = (300 + r() * 1500) * Q;
      puffs.push({ p: [X + Math.sin(a) * d, 8 + r() * 30, Z + Math.cos(a) * d], size: (150 + r() * 260) * Q, a: 0.5 });
    }
    yield;
    // great birds wheeling at every height of him, and pale winged ones round his crown
    const flocks: Flock[] = [
      { c: [X + 120 * Q, 40, Z + 900 * Q], r: 160 * Q, n: props.mobile ? 8 : 18, size: 1.3 * Q, speed: 14 },
      { c: [X, 190 * Q, Z], r: 330 * Q, n: props.mobile ? 10 : 30, size: 1.6 * Q, speed: 18 },
      { c: [X, 430 * Q, Z], r: 300 * Q, n: props.mobile ? 10 : 30, size: 1.6 * Q, speed: 18 },
      { c: [X, 700 * Q, Z], r: 280 * Q, n: props.mobile ? 8 : 26, size: 1.5 * Q, speed: 18 },
      { c: [X - 200 * Q, 560 * Q, Z + 380 * Q], r: 220 * Q, n: props.mobile ? 6 : 16, size: 1.4 * Q, speed: 16 },
      { c: [X + 500 * Q, 120 * Q, Z - 300 * Q], r: 240 * Q, n: props.mobile ? 6 : 18, size: 1.4 * Q, speed: 15 },
      { c: [X + 60 * Q, 30, Z + 330 * Q], r: 120 * Q, n: props.mobile ? 6 : 14, size: 1.1 * Q, speed: 12 },
    ];
    const winged: Flock[] = [
      { c: [X, DECK + 70 * Q, Z], r: 250 * Q, n: props.mobile ? 8 : 22, size: 3.2 * Q, speed: 16 },
      { c: [X, DECK + 190 * Q, Z], r: 520 * Q, n: props.mobile ? 6 : 18, size: 4 * Q, speed: 20 },
    ];

    const lights = [new THREE.Vector3(X, 30 * KS, bz)];
    const king = new THREE.LatheGeometry(
      KING.map(([rr, y]) => new THREE.Vector2(rr, y)),
      props.mobile ? 48 : 88,
    );
    const shells = SHELLS.map((R) => new THREE.SphereGeometry(R, props.mobile ? 64 : 96, props.mobile ? 20 : 30, 0, Math.PI * 2, 0, Math.acos(DROP / R) + 0.06));
    // the long view of him is framed: dark crags stand out of the water close on either hand of the way in (near,
    // in shade), and he is lit in the middle distance with his shells fading behind
    for (const [x, z, w, h] of [
      [-52 * Q, 1010 * Q, 15 * Q, 30 * Q],
      [66 * Q, 968 * Q, 11 * Q, 19 * Q],
      [-70 * Q, 640 * Q, 13 * Q, 24 * Q],
      [112 * Q, 560 * Q, 17 * Q, 34 * Q],
    ] as [number, number, number, number][])
      // (each a stand of dark spires leaning together, like the far ones along the water)
      for (const [dx, dz, kh, lean] of [
        [0, 0, 1, 0.04],
        [w * 0.55, w * 0.2, 0.68, -0.1],
        [-w * 0.5, -w * 0.25, 0.5, 0.12],
        [w * 0.1, -w * 0.6, 0.36, 0.06],
      ] as [number, number, number, number][])
        k.add(new THREE.ConeGeometry(w * 0.42 * (0.6 + 0.4 * kh), h * kh, 6), [x + dx, (h * kh) / 2 - 1.5, z + dz], [0.02, 0.017, 0.02], { top: [0.075, 0.06, 0.055], rot: [lean * 0.5, x * 0.1 + dx, lean] });
    yield;
    const setGeo = k.build();
    yield;
    const skyGeo = sk.build();
    yield;
    return {
      set: setGeo,
      tempera: patchStone(makeTempera({ amb: 1, key: 0.55, rim: [0.34, 0.235, 0.13], rimPow: 3, grain: 0.4, ao: 0.4, aoH: 200, wrap: 0.4 })),
      temperaSky: makeTempera({ amb: 1, key: 0.5, rim: [0.34, 0.235, 0.13], rimPow: 3, grain: 1, wrap: 0.4 }),
      king,
      kingMat: makeKingMaterial(),
      globe: new THREE.SphereGeometry(REX.r, 72, 48),
      globeMat: makeGlobeMaterial(),
      shells,
      shellMats: [makeShellMaterial(0), makeShellMaterial(1), makeShellMaterial(2)],
      // mist on the water in long level bands: before the globe at his feet, to either hand of the way in, and far
      // out under the first shell, so he stands in air with the water's edge lost
      wisps: buildWisps([
        { x: REX.x, z: REX.z + 420 * Q, w: 1500 * Q, d: 420 * Q, y: 5, a: 0.5 },
        { x: REX.x - 600 * Q, z: REX.z + 200 * Q, w: 1300 * Q, d: 420 * Q, y: 7, a: 0.4 },
        { x: REX.x + 600 * Q, z: REX.z + 240 * Q, w: 1300 * Q, d: 420 * Q, y: 6, a: 0.4 },
        { x: -300 * Q, z: 700 * Q, w: 1200 * Q, d: 360 * Q, y: 4, a: 0.35 },
        { x: 380 * Q, z: 500 * Q, w: 1200 * Q, d: 360 * Q, y: 5, a: 0.35 },
        { x: REX.x, z: REX.z - 700 * Q, w: 2400 * Q, d: 600 * Q, y: 8, a: 0.4 },
      ]),
      wispMat: makeWispMaterial(),
      angels: buildAngels(spots, REX_ANGEL_AIR),
      angelsFar: buildAngels(spots2, REX_ANGEL_AIR),
      comets: ck.build(),
      cometHalos: haloGeometry(cometHalos),
      cometHaloMat: makeHaloMaterial(0),
      halos,
      glows,
      embers,
      suns,
      sky: skyGeo,
      skyHalos,
      skyGlows,
      clouds: paintedCloudGeometry(clouds, [0, 100, 400]),
      cloudMat: makeCloudPaint({ lit: [0.85, 0.62, 0.54], shade: [0.56, 0.44, 0.46], under: [0.3, 0.32, 0.5], rim: 1.1, amb: 1.25, key: 0.5, air: 0.7, fade: [2200 * Q, 2950 * Q], near: [120, 420] }),
      windows,
      windowMat: makePoints({ a: [1, 0.72, 0.36], b: [1, 0.86, 0.6], scale: 420, gain: 1.6, max: 6 }),
      puffs,
      flocks,
      winged,
      water: makeWater({
        def,
        lights,
        lightCol: [1.0, 0.82, 0.56],
        lightLen: 1700 * Q,
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
}
type RexBuilt = ReturnType<typeof rexSteps> extends Generator<void, infer T, void> ? T : never;
let madeRex: { mobile: boolean; v: RexBuilt } | null = null;
export function prepareRex(props: WorldProps) {
  if (madeRex && madeRex.mobile !== props.mobile) madeRex = null;
  const g = madeRex ? null : rexSteps(props);
  return () => {
    if (!g || madeRex) return true;
    const t0 = performance.now();
    const r = g.next();
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __steps?: Record<string, number[]> }).__steps ??= {}).rex = [...((window as unknown as { __steps: Record<string, number[]> }).__steps.rex ?? []), Math.round(performance.now() - t0)];
    if (r.done) madeRex = { mobile: props.mobile, v: r.value };
    return !!r.done;
  };
}
function buildRex(props: WorldProps): RexBuilt {
  if (madeRex && madeRex.mobile === props.mobile) return madeRex.v;
  const g = rexSteps(props);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

export default function RexWorld({ props }: { props: WorldProps }) {
  // (the near plane at arm's length while this world is flown: far surfaces do not shimmer)
  useDeepLens("rex");
  const comets = useRef<THREE.Group>(null);
  const sky = useRef<THREE.Group>(null);
  // (made ahead of time in slices if the cloud was closing on this world, or here and now)
  const b = useDisposable(() => buildRex(props), [props.mobile]);
  useEffect(
    () => () => {
      if (madeRex?.v === b) madeRex = null;
    },
    [b],
  );
  // the comets creep along their arcs
  useFrame(({ camera }) => {
    if (comets.current) comets.current.rotation.z = Math.sin(SKY_U.uTime.value * 0.02) * 0.1;
    if (sky.current) sky.current.position.set(camera.position.x - ORIGIN.x, 0, camera.position.z - ORIGIN.z);
  });
  return (
    <>
      <GreatSun size={0.6} tint={[1, 0.74, 0.42]} rays={56} gain={0.9} />
      <WorldBase id="rex" def={def} pal={REX_PAL} props={props} grass={false} pathTint={[1, 0.84, 0.6]} pathGain={1.0} angels={false} gate="veil" gateSize={[GATE_HALF, GATE_RISE]} />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[9000, 9000]} />
      </mesh>
      {/* the shells of the sky, the outermost first */}
      {[2, 1, 0].map((i) => (
        <mesh key={i} geometry={b.shells[i]} material={b.shellMats[i]} position={[REX.x, -DROP, REX.z]} renderOrder={-3 + (2 - i)} />
      ))}
      <mesh geometry={b.set} material={b.tempera} />
      <mesh geometry={b.angels.glow} material={b.angels.glowMat} renderOrder={2} frustumCulled={false} />
      <mesh geometry={b.angels.geo} material={b.angels.mat} renderOrder={3} frustumCulled={false} />
      <mesh geometry={b.angelsFar.glow} material={b.angelsFar.glowMat} renderOrder={2} frustumCulled={false} />
      <mesh geometry={b.angelsFar.geo} material={b.angelsFar.mat} renderOrder={3} frustumCulled={false} />
      <mesh geometry={b.wisps} material={b.wispMat} renderOrder={3} />
      <mesh geometry={b.king} material={b.kingMat} position={[REX.x, 0, REX.z]} />
      <mesh geometry={b.globe} material={b.globeMat} position={[REX.x, 0, REX.z]} />
      <group ref={comets} position={[REX.x, -DROP, REX.z]}>
        <mesh geometry={b.comets} material={b.temperaSky} />
        <mesh geometry={b.cometHalos} material={b.cometHaloMat} renderOrder={6} />
      </group>
      <mesh geometry={b.clouds} material={b.cloudMat} frustumCulled={false} renderOrder={2} />
      <points geometry={b.windows} material={b.windowMat} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Birds flocks={b.flocks} tint={[0.07, 0.055, 0.045]} />
      <Birds flocks={b.winged} tint={[0.9, 0.78, 0.62]} seed={9} lit />
      <group ref={sky}>
        <mesh geometry={b.sky} material={b.temperaSky} frustumCulled={false} />
        <Halos list={b.skyGlows} kind={2} />
        <Halos list={b.skyHalos} />
      </group>
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
      <Kindling list={b.embers} centre={REX_CENTRE} />
      {/* and a comet of the lower air crosses before him, a while after the plane has come */}
      <Comet world="rex" id="rex-comet" from={[-1500 * Q, 520 * Q, 0]} to={[1300 * Q, 300 * Q, -500 * Q]} seconds={38} after={28} again={80} tail={900 * Q} width={44 * Q} tint={[1, 0.78, 0.5]} />
      <Halos list={b.suns} kind={1} />
    </>
  );
}
