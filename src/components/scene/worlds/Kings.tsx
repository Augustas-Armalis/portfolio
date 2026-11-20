"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type V3 } from "./kit";
import { Clay, type Paint } from "./sculpt";
import { KINGS, ORIGIN, WORLDS, groundAt, kingsDome } from "./voyage";

// Fairy Tale of the Kings (Karalių pasaka, 1909). A night wood of enormous
// trunks whose boughs close overhead; small towns and towers live in the
// boughs, their windows lit like stars. In the middle of the wood two kings,
// vast as hills, bow toward each other: the one on the left pale, long-haired,
// in a robe of grey-green; the one on the right dark, in a robe stitched with
// ember. Between their hands they hold a small bright dome, and rays go out
// from it; inside it is a little sunlit homestead. It is the only strong
// light in the picture: everything else is lit by it, from below.
//
// Here the little world they hold is this site's own: the desk in the field.
// The flight ends in it. The plane comes up the aisle of the wood, between
// the kings' hands, into the light; the light takes the whole frame, and
// opens on home.

const def = WORLDS.kings;
const R = KINGS.domeR;
// where the little world is, in the scene's own coordinates: every material here is lit from it
const DOME_AT = kingsDome();
const DOME_U = { uDome: { value: new THREE.Vector3(ORIGIN.x, ORIGIN.y + DOME_AT.y, ORIGIN.z + KINGS.z) }, uR: { value: R } };
// the world's own tall things (the kings, the painting); the trunks join them whenever the wood is built
const OWN_OBSTACLES = def.obstacles.length;

// The one light. It falls on whatever faces it (domeLight), and it hangs in the air of the wood: the
// warmth gathered along each line of sight is worked out exactly (the light thins with the square of the
// distance, and that sums to an arctangent), so the glow lies in front of far trunks and behind near ones
// as real haze does, with no lit card anywhere. Where a sight line passes wide of the dome the glow breaks
// into soft shafts that fan out from it.
const GLSL_DOME = /* glsl */ `
uniform vec3 uDome; uniform float uR;
const vec3 DOME_WARM = vec3(1.0, 0.62, 0.31);
vec3 domeGlow(vec3 P){
  vec3 C = uDome + vec3(0.0, uR * 0.4, 0.0);
  vec3 rd = P - cameraPosition; float len = length(rd); rd /= max(len, 0.001);
  vec3 oc = cameraPosition - C; float b = dot(oc, rd);
  vec3 q = oc - rd * b; float p2 = dot(q, q);
  float s = sqrt(p2 + uR * uR * 0.5);
  float gathered = (atan((len + b) / s) - atan(b / s)) / s;
  float pr = sqrt(p2);
  float ang = atan(q.x, q.y);
  float shaft = vnoise(vec2(ang * 6.0 + 3.0, 0.5 + uTime * 0.011)) * 0.62 + vnoise(vec2(ang * 19.0, 4.0 - uTime * 0.017)) * 0.38;
  shaft = smoothstep(0.28, 0.78, shaft);
  float upper = smoothstep(-0.55, 0.3, q.y / max(pr, 1.0));
  float wide = smoothstep(uR * 0.8, uR * 2.8, pr);
  float k = mix(1.0, 0.3 + 1.25 * shaft, wide) * mix(0.22, 1.0, upper) * exp(-p2 / (uR * uR * 30.0));
  return DOME_WARM * gathered * k * uR * 0.085 * (1.0 + uPulse * 0.3);
}
// how strongly it lights a surface at P facing n (x), and how near it is (y)
vec2 domeLight(vec3 P, vec3 n){
  vec3 L = uDome + vec3(0.0, uR * 0.35, 0.0) - P; float d = length(L); L /= max(d, 0.001);
  float att = 1.0 / (1.0 + d * d / (uR * uR * 7.5));
  // it shines up and out: the dish and the hands shade whatever lies below it
  att *= smoothstep(-0.5, 0.12, -L.y);
  return vec2(dot(n, L), att);
}
`;
export const KINGS_PAL: GroundPalette = {
  a: [0.018, 0.03, 0.028],
  b: [0.03, 0.036, 0.026],
  c: [0.012, 0.022, 0.026],
  hook: {
    uniforms: DOME_U,
    decl: GLSL_DOME,
    // a pool of its light on the ground, but not straight beneath, where the hands shade it
    lit: `{ vec2 dl = domeLight(vWorld, n); col += alb * DOME_WARM * dl.y * clamp(dl.x, 0.0, 1.0) * 3.0 * smoothstep(uR * 0.9, uR * 2.6, length(vWorld.xz - uDome.xz)); }`,
    air: `col += domeGlow(vWorld);`,
  },
};

// ---------- sculpting ----------
// kind (aCol.a): 0 a patterned robe, 1 plain (skin, hair, roofs), 2 gold, 3 bark
type Part = THREE.BufferGeometry;
function tint(g: THREE.BufferGeometry, col: V3, kind: number, top?: V3) {
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y;
  const y1 = Math.max(y0 + 1e-3, g.boundingBox!.max.y);
  const c = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = top ? (pos.getY(i) - y0) / (y1 - y0) : 0;
    const e = top ?? col;
    c.set([col[0] + (e[0] - col[0]) * t, col[1] + (e[1] - col[1]) * t, col[2] + (e[2] - col[2]) * t, kind], i * 4);
  }
  g.setAttribute("aCol", new THREE.BufferAttribute(c, 4));
  g.deleteAttribute("uv");
  return g;
}
// a round limb whose thickness changes along it: a trunk, a bough, a body, an arm
function limb(pts: V3[], radii: number[], col: V3, kind: number, o: { top?: V3; sides?: number; seg?: number; twist?: number; flat?: [number, number] } = {}): Part {
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(...p)),
    false,
    "centripetal",
  );
  const seg = o.seg ?? pts.length * 5;
  const sides = o.sides ?? 12;
  const fr = curve.computeFrenetFrames(seg, false);
  const pos: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const rad = (t: number) => {
    const f = t * (radii.length - 1);
    const i = Math.min(radii.length - 2, Math.floor(f));
    const k = f - i;
    const kk = k * k * (3 - 2 * k);
    return radii[i] + (radii[i + 1] - radii[i]) * kk;
  };
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPoint(t, p);
    const r = rad(t);
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2 + (o.twist ?? 0) * t;
      // flat: the section is an ellipse (wider along the normal than the binormal)
      const cn = Math.cos(a) * r * (o.flat?.[0] ?? 1);
      const cb = Math.sin(a) * r * (o.flat?.[1] ?? 1);
      // old trunks are not round: a slow fluting that turns with the height
      const fl = kind === 3 ? 1 + 0.12 * Math.sin(a * 5 + t * 9) + 0.07 * Math.sin(a * 3 - t * 5) + 0.04 * Math.sin(a * 9 + t * 21) : 1;
      pos.push(p.x + (fr.normals[i].x * cn + fr.binormals[i].x * cb) * fl, p.y + (fr.normals[i].y * cn + fr.binormals[i].y * cb) * fl, p.z + (fr.normals[i].z * cn + fr.binormals[i].z * cb) * fl);
    }
    if (i < seg) for (let j = 0; j < sides; j++) idx.push(i * (sides + 1) + j, (i + 1) * (sides + 1) + j, i * (sides + 1) + j + 1, i * (sides + 1) + j + 1, (i + 1) * (sides + 1) + j, (i + 1) * (sides + 1) + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return tint(g, col, kind, o.top);
}
const M = new THREE.Matrix4();
function prim(g: THREE.BufferGeometry, p: V3, col: V3, kind: number, o: { rot?: V3; scale?: V3; top?: V3; quat?: THREE.Quaternion } = {}): Part {
  const q = o.quat ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rot ?? [0, 0, 0])));
  tint(g, col, kind, o.top);
  g.applyMatrix4(M.compose(new THREE.Vector3(...p), q, new THREE.Vector3(...(o.scale ?? [1, 1, 1]))));
  return g;
}

// Everything in the wood is lit by the little world: warm where it faces the
// dome, the cold teal of the night elsewhere. The kings' robes carry their
// patterns, laid along the fall of the cloth (aPat); bark its long streaks;
// the crowns their red stones.
function makeEmberLit(pattern: "pale" | "dark" | "plain") {
  const figure = pattern !== "plain";
  return new THREE.ShaderMaterial({
    side: figure ? THREE.FrontSide : THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...DOME_U },
    vertexShader: /* glsl */ `
      attribute vec4 aCol; ${figure ? "attribute vec2 aPat;" : ""}
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec4 vCol; varying vec2 vPat;
      void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol; vPat = ${figure ? "aPat" : "vec2(0.0)"}; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec4 vCol; varying vec2 vPat;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_DOME}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 alb = vCol.rgb;
        float kind = vCol.a;
        float robe = 1.0 - clamp(kind, 0.0, 1.0);
        float bark = step(2.5, kind);
        float gold = step(1.5, kind) * (1.0 - bark);
        float hair = ${figure ? "smoothstep(1.04, 1.24, kind)" : "0.0"};
        float h = vLocal.y;
        float ember = 0.0;
        vec3 thread = vec3(0.0);
        ${
          pattern === "pale"
            ? `// the pale king: long wavy lines running with the cloth, and small dark flowers strewn over it
               float s = vPat.x; float c = vPat.y;
               float wave = sin(c * 0.62 + sin(s * 0.085) * 1.5 + vnoise(vec2(s * 0.03, c * 0.06)) * 2.6);
               alb = mix(alb, alb * 0.42, smoothstep(0.8, 0.97, wave) * 0.8 * robe);
               alb = mix(alb, alb * 1.4 + vec3(0.004, 0.012, 0.012), smoothstep(0.55, 1.0, -wave) * 0.4 * robe);
               // the long folds the cloth hangs in
               float fold = sin(c * 0.21 + vnoise(vec2(s * 0.012, c * 0.03)) * 2.4);
               alb *= 1.0 + 0.22 * fold * robe;
               vec2 fc = vec2(s, c) * 0.1; vec2 fi = floor(fc);
               vec2 ff = fract(fc) - 0.5 - (vec2(hash12(fi + 1.3), hash12(fi + 4.1)) - 0.5) * 0.46;
               float pick = step(0.56, hash12(fi));
               float petal = 0.17 + 0.055 * cos(atan(ff.y, ff.x) * 5.0 + hash12(fi) * 6.0);
               float flower = (1.0 - smoothstep(petal - 0.05, petal, length(ff))) * pick;
               alb = mix(alb, vec3(0.022, 0.04, 0.11), flower * 0.8 * robe);
               alb = mix(alb, vec3(0.26, 0.2, 0.1), (1.0 - smoothstep(0.025, 0.055, length(ff))) * pick * robe * 0.8);`
            : pattern === "dark"
              ? `// the dark king: on the sleeves, bands that run with the arm, rows of ember stitches and a zigzag between them;
               // on the body only a few long lines of stitches going down into the dark
               float s = vPat.x; float c = vPat.y + vnoise(vec2(s * 0.02, 2.0)) * 1.2;
               float rich = smoothstep(0.72, 0.98, robe);
               float bw = 4.6; float bi = floor(c / bw); float bf = fract(c / bw);
               float bk = hash12(vec2(bi, 3.0));
               float row = smoothstep(0.03, 0.1, bf) * (1.0 - smoothstep(0.24, 0.31, bf));
               float stitch = step(0.45, fract(s * 0.5 + bk * 7.0));
               float zz = abs(fract(s * 0.15 + bk) - 0.5) * 2.0;
               float zig = 1.0 - smoothstep(0.03, 0.075, abs(bf - 0.56 - 0.26 * zz));
               float dots = (1.0 - smoothstep(0.09, 0.18, length(vec2(fract(s * 0.3) - 0.5, (bf - 0.7) * 2.4)))) * step(bk, 0.4);
               thread = mix(vec3(0.5, 0.13, 0.03), vec3(0.62, 0.34, 0.08), hash12(vec2(bi, floor(s * 0.5))));
               float sleeveP = clamp(row * stitch * 0.9 + zig * step(0.4, bk) * 0.8 + dots * 0.85, 0.0, 1.0);
               float bodyP = (1.0 - smoothstep(0.05, 0.11, abs(bf - 0.5))) * step(0.5, fract(s * 0.36 + bk * 5.0)) * step(0.55, bk);
               ember = mix(bodyP * 0.5 * step(0.05, robe), sleeveP, rich);
               alb = mix(alb, thread, ember);
               float fold = sin(c * 0.2 + vnoise(vec2(s * 0.012, c * 0.03)) * 2.4);
               alb *= 1.0 + 0.24 * fold * step(0.05, robe);`
              : `// bark: long streaks running with the grain; the crowns: worked gold, a red stone here and there
               float across = vLocal.z * 0.8 + vLocal.x * 0.6;
               float grain = vnoise(vec2(across * 0.5, h * 0.035)) * 0.6 + vnoise(vec2(across * 1.7, h * 0.11)) * 0.4;
               alb *= mix(1.0, 0.5 + 1.0 * grain, bark);
               float chased = vnoise(vLocal.xy * 1.1 + vLocal.z * 0.7);
               alb = mix(alb, alb * (0.55 + 0.9 * chased), gold);
               { vec2 jc = vLocal.xy * 0.75 + vLocal.z * 0.41; vec2 ji = floor(jc); vec2 jf = fract(jc) - 0.5 - (vec2(hash12(ji + 2.0), hash12(ji + 5.0)) - 0.5) * 0.4;
                 alb = mix(alb, vec3(0.4, 0.03, 0.018), (1.0 - smoothstep(0.14, 0.24, length(jf))) * step(0.7, hash12(ji)) * gold * 0.85); }`
        }
        float dab = vnoise(vLocal.xz * 0.23 + h * 0.19) * 0.6 + vnoise(vLocal.xy * 0.9 + vLocal.z * 0.7) * 0.4;
        alb *= 1.0 + (dab - 0.5) * ${figure ? "0.14" : "0.34"};
        // hair: long strands running the way it falls
        alb *= 1.0 + hair * ((vnoise(vec2(vPat.y * 1.5, vPat.x * 0.045)) * 0.6 + vnoise(vec2(vPat.y * 4.0, vPat.x * 0.11)) * 0.4) - 0.5) * 1.1;
        // the one light: soft, wrapped a little round the form
        vec2 dl = domeLight(vWorld, n);
        float att = dl.y;
        float wrap = clamp(dl.x * 0.7 + 0.3, 0.0, 1.0);
        // and the night: teal from all round, a breath of colder blue from above
        vec3 cool = uSkyCol * (0.62 + 0.38 * n.y) * 0.9 + vec3(0.012, 0.03, 0.056) * clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
        vec3 col = alb * (cool + DOME_WARM * att * wrap * wrap * 3.7);
        // it catches every edge that is turned toward it
        float rim = pow(1.0 - abs(dot(n, V)), 2.6) * clamp(dl.x + 0.45, 0.0, 1.0);
        col += DOME_WARM * rim * att * (0.3 + 0.9 * gold + alb.r * 2.0);
        col += alb * gold * (0.05 + att * 0.35);
        // the ember stitches hold a little light of their own
        col += thread * ember * (0.012 + att * 0.5);
        ${figure ? `// the bodies go down into the dark\n        col *= mix(0.1, 1.0, smoothstep(uDome.y - uR * 2.5, uDome.y - uR * 0.2, vWorld.y));` : ""}
        col = applyAir(col, vWorld);
        col += domeGlow(vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// The night behind the wood, as he laid it in: long level strokes of blue, lighter and darker, low between
// the trunks; darker overhead. The dome's glow hangs in front of it like everything else.
function makeNight() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { ...SKY_U, ...DOME_U },
    vertexShader: /* glsl */ `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_DOME}
      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        float e = asin(clamp(d.y, -1.0, 1.0));
        float az = atan(d.x, -d.z);
        vec3 col = mix(vec3(0.012, 0.03, 0.042), vec3(0.003, 0.008, 0.014), smoothstep(0.1, 0.9, e));
        // strokes: long along the horizon, a few brush-widths high
        float st = vnoise(vec2(az * 3.4, e * 92.0)) * 0.5 + vnoise(vec2(az * 9.0 + 3.0, e * 210.0 + 7.0)) * 0.32 + vnoise(vec2(az * 24.0, e * 520.0)) * 0.18;
        float low = smoothstep(-0.03, 0.04, e) * (1.0 - smoothstep(0.3, 0.95, e));
        vec3 blue = mix(vec3(0.013, 0.032, 0.052), vec3(0.026, 0.058, 0.088), smoothstep(0.52, 0.76, st));
        col = mix(col, blue, smoothstep(0.44, 0.6, st) * low * 0.9);
        col = mix(col, vec3(0.004, 0.008, 0.01), smoothstep(0.0, -0.06, e));
        col += domeGlow(cameraPosition + d * 1400.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// The sky of the little world, seen through the dome: pale, the colour of cream where it is highest, rose-gold toward its rim.
function makeDomeSky() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `varying vec3 vLocal; void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal;
      ${GLSL_SKY}
      void main(){
        vec3 d = normalize(vLocal);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(vec3(2.1, 1.22, 0.84), vec3(2.2, 1.7, 1.28), smoothstep(0.0, 0.3, h));
        col = mix(col, vec3(2.3, 2.05, 1.75), smoothstep(0.2, 0.8, h));
        // the low sun of that country, a little to one side
        col += vec3(1.0, 0.8, 0.5) * pow(max(dot(d, normalize(vec3(-0.35, 0.3, -0.9))), 0.0), 8.0) * 0.8;
        gl_FragColor = vec4(col * (1.0 + uPulse * 0.25), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// The glass of it from outside: nothing in the middle, a glowing line of red gold at the limb.
function makeDomeGlass() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      ${GLSL_SKY}
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW)));
        float dist = length(cameraPosition - vW);
        vec3 col = vec3(1.0, 0.5, 0.22) * pow(f, 2.2) * 1.1 + vec3(1.0, 0.8, 0.5) * pow(f, 7.0) * 1.6;
        gl_FragColor = vec4(col * smoothstep(4.0, 34.0, dist), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// Rays: a burst of fine straight lines going out from the dome, long and short, each a little broken, as he ruled them:
// pale gold where they leave the glass, red by their ends.
function raysGeometry(n: number, seed: number) {
  const r = rng(seed);
  const pos: number[] = [];
  const dat: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    // a fan over the upper half, evenly ruled with a little unevenness, mostly in the plane the picture is seen in
    const a = ((i + r() * 0.8) / n - 0.5) * Math.PI * 1.1;
    const tiltZ = (r() - 0.5) * 0.7;
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(tiltZ), Math.cos(a) * Math.cos(tiltZ), Math.sin(tiltZ)).normalize();
    const r0 = R * (1.02 + r() * 0.05);
    const long = r() < 0.3;
    const r1 = R * (long ? 2.3 + r() * 1.5 : 1.45 + r() * 0.9);
    const b = pos.length / 3;
    for (const [t, s] of [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
    ]) {
      const d = t ? r1 : r0;
      pos.push(dir.x * d, dir.y * d, dir.z * d);
      dat.push(dir.x, dir.y, dir.z, s, t, r(), 0.08 + r() * 0.12, r1 - r0);
    }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const ib = new THREE.InterleavedBuffer(new Float32Array(dat), 8);
  g.setAttribute("aDir", new THREE.InterleavedBufferAttribute(ib, 4, 0));
  g.setAttribute("aRay", new THREE.InterleavedBufferAttribute(ib, 4, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 5);
  return g;
}
function makeRays() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aDir; attribute vec4 aRay;
      varying vec2 vUv; varying vec3 vRay; varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 wd = normalize(mat3(modelMatrix) * aDir.xyz);
        // each ray is a hair-thin ribbon turned to face the eye
        vec3 side = normalize(cross(wd, wp.xyz - cameraPosition));
        float dist = length(wp.xyz - cameraPosition);
        wp.xyz += side * aDir.w * max(aRay.z, dist * 0.00085);
        vUv = vec2(aDir.w, aRay.x); vRay = aRay.yzw; vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vRay; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float across = 1.0 - abs(vUv.x);
        // short dashes, thinning as the ray goes out
        float dash = smoothstep(0.16, 0.4, abs(fract(vUv.y * vRay.z * 0.2 + vRay.x * 9.0 - uTime * 0.015) - 0.5) * 2.0);
        float a = across * across * pow(1.0 - vUv.y, 1.5) * (0.22 + 0.78 * dash) * smoothstep(0.0, 0.03, vUv.y);
        float tw = 0.78 + 0.22 * sin(uTime * (0.4 + vRay.x) + vRay.x * 40.0);
        float dist = length(vWorld - cameraPosition);
        vec3 col = mix(vec3(1.0, 0.3, 0.1), vec3(1.0, 0.84, 0.56), pow(1.0 - vUv.y, 2.2));
        gl_FragColor = vec4(col * a * tw * 1.7 * (1.0 + uPulse * 0.5) * smoothstep(3.0, 26.0, dist) * exp(-dist * uMist * 1.5), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------- the kings ----------
// Each is built up in clay the size of a hill, from his painting: seen from the aisle the pale king stands in
// profile on the left, facing right, his long hair and beard down over shoulder and arm, his sleeve reaching
// under the dome and the hand cupped beneath it; the dark king on the right, taller, his head bowed deeper,
// his banded sleeve coming down to the hand that rests on the dome's rim. Faces are only suggested: a brow,
// a long nose, the line of a lowered lid. Lengths below are in dome radii, heights from the dome's base.
const ROBE = 0;
const SLEEVE = 1;
const CUFF = 2;
const SKIN = 3;
const HAIR = 4;
const LINE = 5;
function buildKing(side: -1 | 1, coarse: boolean) {
  const pale = side < 0;
  const by = DOME_AT.y;
  const P = (d: number, h: number, w = 0): V3 => [side * d * R, by + h * R, KINGS.z + w * R];
  const paints: Paint[] = pale
    ? [
        { col: [0.075, 0.155, 0.15], kind: 0 },
        { col: [0.1, 0.215, 0.205], kind: 0.25 },
        { col: [0.2, 0.4, 0.38], kind: 0.85 },
        { col: [0.56, 0.3, 0.185], kind: 1 },
        { col: [0.4, 0.36, 0.29], kind: 1.25 },
        { col: [0.09, 0.04, 0.025], kind: 1 },
      ]
    : [
        { col: [0.05, 0.03, 0.026], kind: 0.3 },
        { col: [0.07, 0.036, 0.028], kind: 0 },
        { col: [0.3, 0.13, 0.04], kind: 0.2 },
        { col: [0.37, 0.19, 0.115], kind: 1 },
        { col: [0.04, 0.027, 0.024], kind: 1.25 },
        { col: [0.05, 0.024, 0.016], kind: 1 },
      ];
  // the head: bowed, the pale king's by a third of a right angle, the dark king's by nearly two
  const tau = pale ? 0.6 : 0.98;
  const f: V3 = [-side * Math.cos(tau), -Math.sin(tau), 0];
  const up: V3 = [-side * Math.sin(tau), Math.cos(tau), 0];
  const Hc = P(pale ? 1.92 : 1.66, pale ? 2.5 : 2.9);
  const F = (a: number, b: number, w = 0): V3 => [Hc[0] + (f[0] * a + up[0] * b) * R, Hc[1] + (f[1] * a + up[1] * b) * R, Hc[2] + w * R];
  const rr = (x: number, y: number, z: number): V3 => [x * R, y * R, z * R];
  const ax = { x: f, y: up };

  // ---- the body: robe, shoulders, arms, the hair that lies on them ----
  // The pale king is bent far forward: his crowned head is the highest of him and his back slopes away behind it.
  // The dark king stands more upright, his shoulders as high as his head, and only the head is bowed.
  const body = new Clay(0.28 * R);
  const neck: V3 = pale ? P(2.62, 2.12) : P(2.78, 3.02);
  if (pale) {
    body.limb(P(4.05, -2.7), P(3.72, 0.0), 1.72 * R, 1.36 * R, ROBE, { flat: 1.12, soft: 3, s0: 0 });
    body.limb(P(3.72, 0.0), P(2.98, 1.52), 1.36 * R, 1.0 * R, ROBE, { flat: 1.2, soft: 3, s0: 2.7 * R });
    body.ball(P(2.86, 1.72), rr(0.86, 0.68, 1.42), ROBE, { soft: 3, s0: 3.9 * R });
    body.limb(P(2.7, -0.55), P(1.95, -2.7), 0.9 * R, 1.2 * R, ROBE, { flat: 1.3, soft: 3, s0: 0 });
  } else {
    body.limb(P(4.1, -2.7), P(3.88, 0.6), 1.78 * R, 1.42 * R, ROBE, { flat: 1.12, soft: 3, s0: 0 });
    body.limb(P(3.88, 0.6), P(3.32, 2.46), 1.42 * R, 1.06 * R, ROBE, { flat: 1.2, soft: 3, s0: 3.3 * R });
    body.ball(P(3.16, 2.74), rr(0.92, 0.72, 1.48), ROBE, { soft: 3, s0: 4.9 * R });
    body.limb(P(3.0, -0.3), P(2.25, -2.7), 0.9 * R, 1.25 * R, ROBE, { flat: 1.3, soft: 3, s0: 0 });
  }
  for (const s of [-1, 1]) {
    if (pale) {
      // down from the shoulder, then level under the dome: the wide sleeve, a paler cuff at the wrist
      body.chain([P(2.82, 1.72, s * 1.22), P(3.22, 0.3, s * 1.46), P(1.32, -0.2, s * 0.62)], [0.56 * R, 0.53 * R, 0.45 * R], SLEEVE, { k: 0.2 * R, soft: 2 });
      body.ball(P(1.46, -0.19, s * 0.66), rr(0.24, 0.6, 0.6), CUFF, { paint: true, soft: 1.4 });
      // his hair, over the shoulder and down the arm
      body.chain([P(2.3, 2.7, s * 0.34), P(2.6, 2.3, s * 0.95), P(2.86, 1.66, s * 1.5), P(3.02, 0.9, s * 1.82), P(3.0, 0.28, s * 1.9)], [0.3 * R, 0.42 * R, 0.5 * R, 0.4 * R, 0.14 * R], HAIR, { k: 0.12 * R, soft: 1.5 });
    } else {
      // from the high shoulder down and in to the rim of the dome
      body.chain([P(3.16, 2.72, s * 1.3), P(3.78, 1.05, s * 1.54), P(1.98, 0.3, s * 0.8)], [0.58 * R, 0.55 * R, 0.4 * R], SLEEVE, { k: 0.2 * R, soft: 2 });
      body.ball(P(2.08, 0.34, s * 0.84), rr(0.16, 0.5, 0.5), CUFF, { paint: true, soft: 1.2, x: [-0.93 * side, -0.37, 0] });
    }
  }
  if (pale) {
    // hair in one great fall from the crown over the back of the neck and the shoulders, and the long beard down to the forearm
    body.ball(P(2.72, 2.36), rr(0.82, 0.5, 1.2), HAIR, { k: 0.14 * R, soft: 1.5 });
    body.chain([P(2.9, 2.5), P(3.5, 1.9), P(3.86, 1.0)], [0.5 * R, 0.5 * R, 0.2 * R], HAIR, { k: 0.14 * R, flat: 2.0, soft: 1.5 });
    body.chain([F(0.24, -0.7), P(1.74, 1.36), P(1.9, 0.7), P(2.1, 0.26)], [0.2 * R, 0.33 * R, 0.26 * R, 0.09 * R], HAIR, { k: 0.08 * R, flat: 1.5, soft: 1.2 });
  } else {
    // a dark mantle of hair on the shoulders, and two locks hanging forward past the face
    body.ball(P(2.96, 3.26), rr(0.8, 0.4, 1.26), HAIR, { k: 0.12 * R, soft: 1.5 });
    for (const s of [-1, 1]) body.chain([F(-0.16, -0.2, s * 0.5), P(2.06, 2.0, s * 0.56), P(2.1, 1.1, s * 0.54)], [0.15 * R, 0.12 * R, 0.04 * R], HAIR, { k: 0.06 * R, soft: 1 });
  }
  // the neck, out from the collar to the head
  body.limb(neck, F(-0.14, -0.34), 0.46 * R, 0.4 * R, pale ? HAIR : SKIN, { k: 0.12 * R, soft: 1.5 });

  // ---- the head ----
  // (F is in the head's own measure: forward, up, sideways; the head is a fifth larger than a dome radius is long)
  const head = new Clay(0.08 * R);
  head.ball(F(0, 0), rr(0.52, 0.64, 0.47), SKIN, { ...ax, k: 0.1 * R });
  head.ball(F(0.14, -0.36), rr(0.38, 0.35, 0.36), SKIN, { ...ax, k: 0.14 * R });
  // brow, the long straight nose, cheekbone, mouth and chin
  head.ball(F(0.45, 0.12), rr(0.1, 0.075, 0.35), SKIN, { ...ax, k: 0.04 * R });
  head.limb(F(0.5, 0.08), F(0.71, -0.22), 0.05 * R, 0.07 * R, SKIN, { k: 0.03 * R });
  head.ball(F(0.34, -0.2), rr(0.14, 0.12, 0.38), SKIN, { ...ax, k: 0.07 * R });
  head.ball(F(0.47, -0.43), rr(0.11, 0.075, 0.2), SKIN, { ...ax, k: 0.035 * R });
  head.ball(F(0.4, -0.62), rr(0.15, 0.12, 0.2), SKIN, { k: 0.06 * R });
  head.limb(F(-0.14, -0.34), neck, 0.4 * R, 0.46 * R, pale ? HAIR : SKIN, { k: 0.1 * R });
  head.ball(F(-0.34, 0.1), rr(0.5, 0.64, 0.5), HAIR, { ...ax, k: 0.06 * R });
  for (const s of [-1, 1]) {
    if (pale) head.chain([F(-0.05, 0.1, s * 0.42), P(2.3, 2.7, s * 0.34), P(2.6, 2.3, s * 0.95)], [0.32 * R, 0.3 * R, 0.42 * R], HAIR, { k: 0.1 * R });
    else head.limb(F(-0.16, -0.2, s * 0.5), P(2.06, 2.0, s * 0.56), 0.15 * R, 0.12 * R, HAIR, { k: 0.06 * R });
  }
  if (pale) {
    // the beard begins under the chin
    head.limb(F(0.24, -0.7), P(1.74, 1.36), 0.2 * R, 0.33 * R, HAIR, { k: 0.06 * R, flat: 1.5 });
  }

  // drawn on the face, as with the point of a brush: the line of each lowered lid, and the closed mouth
  const marks: Part[] = [];
  const draw = (dirs: [number, number, number][], rad: number) => {
    const c = F(0, -0.05);
    const pts = dirs.map(([a, bb, w]): V3 => {
      const out = F(a * 2.2, -0.05 + (bb + 0.05) * 2.2, w * 2.2);
      const hit = head.drop(out, c);
      const n = new THREE.Vector3(out[0] - c[0], out[1] - c[1], out[2] - c[2]).normalize();
      return [hit[0] + n.x * rad * 0.3, hit[1] + n.y * rad * 0.3, hit[2] + n.z * rad * 0.3];
    });
    marks.push(limb(pts, [rad * 0.4, rad, rad, rad * 0.4], paints[LINE].col, 1, { sides: 5, seg: 14 }));
  };
  for (const s of [-1, 1])
    draw(
      [
        [0.6, -0.1, s * 0.2],
        [0.54, -0.125, s * 0.31],
        [0.45, -0.125, s * 0.41],
        [0.35, -0.095, s * 0.48],
      ],
      0.016 * R,
    );
  draw(
    [
      [0.5, -0.5, -0.2],
      [0.58, -0.5, -0.07],
      [0.58, -0.5, 0.07],
      [0.5, -0.5, 0.2],
    ],
    0.013 * R,
  );

  // ---- the hands ----
  const hands = new Clay(0.035 * R);
  for (const s of [-1, 1]) {
    if (pale) {
      // open beneath the dome, the fingers reaching past its middle and curling up at their ends
      hands.limb(P(1.5, -0.2, s * 0.64), P(1.05, -0.26, s * 0.5), 0.3 * R, 0.2 * R, SKIN, { k: 0.08 * R });
      hands.ball(P(0.5, -0.31, s * 0.38), rr(0.72, 0.13, 0.33), SKIN, { k: 0.08 * R });
      for (let i = 0; i < 4; i++) hands.chain([P(-0.05, -0.31, s * (0.12 + i * 0.16)), P(-0.62, -0.26, s * (0.1 + i * 0.17)), P(-0.98, -0.1, s * (0.1 + i * 0.175))], [0.078 * R, 0.066 * R, 0.048 * R], SKIN);
      hands.chain([P(0.72, -0.26, s * 0.66), P(0.3, -0.14, s * 0.82), P(0.02, 0.02, s * 0.88)], [0.09 * R, 0.07 * R, 0.05 * R], SKIN);
    } else {
      // resting on its rim, the fingers bent down over the edge
      hands.limb(P(2.02, 0.31, s * 0.82), P(1.62, 0.2, s * 0.7), 0.3 * R, 0.2 * R, SKIN, { k: 0.08 * R });
      hands.ball(P(1.46, 0.16, s * 0.66), rr(0.4, 0.13, 0.31), SKIN, { k: 0.08 * R, x: [-0.96 * side, -0.27, 0] });
      for (let i = 0; i < 4; i++) hands.chain([P(1.16, 0.1, s * (0.44 + i * 0.15)), P(1.09, -0.22, s * (0.43 + i * 0.155)), P(1.13, -0.5, s * (0.43 + i * 0.16))], [0.078 * R, 0.066 * R, 0.048 * R], SKIN);
      hands.chain([P(1.5, 0.2, s * 0.36), P(1.2, 0.24, s * 0.22), P(1.06, 0.1, s * 0.16)], [0.09 * R, 0.07 * R, 0.05 * R], SKIN);
    }
  }
  const v = coarse ? 1.5 : 1;
  const parts = [body.mesh(1.55 * v, paints), head.mesh(0.6 * v, paints), hands.mesh(0.5 * v, paints)];
  const geo = mergeGeometries(parts)!;
  parts.forEach((g) => g.dispose());

  // ---- the crown ----
  // A broad ring, wider than the head, worn low on the brow and tipped forward with it; a band, a ring of tall
  // narrow points flaring a little outward. The pale king's is red gold with long points; the dark king's is
  // wider and yellower, its points closer and shorter.
  const crown: Part[] = [...marks];
  const lights: Halo[] = [];
  const upV = new THREE.Vector3(...up);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upV);
  const cc = new THREE.Vector3(...F(0.0, 0.46));
  const gold: V3 = pale ? [0.44, 0.12, 0.03] : [0.4, 0.19, 0.04];
  const goldTop: V3 = pale ? [0.7, 0.29, 0.07] : [0.74, 0.44, 0.1];
  const r0 = (pale ? 0.68 : 0.76) * R;
  const r1 = (pale ? 0.77 : 0.87) * R;
  const bh = (pale ? 0.2 : 0.26) * R;
  const at = (a: number, rad: number, y: number) => new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad).applyQuaternion(quat).add(cc);
  crown.push(prim(new THREE.CylinderGeometry(r1, r0, bh, 44, 1, true), at(0, 0, bh / 2).toArray() as V3, gold, 2, { quat, top: goldTop }));
  for (const [rad, y] of [
    [r0, 0],
    [r1, bh],
  ])
    crown.push(prim(new THREE.TorusGeometry(rad, 0.022 * R, 6, 44), at(0, 0, y).toArray() as V3, goldTop, 2, { quat: quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)) }));
  // the dark within the ring
  crown.push(prim(new THREE.CircleGeometry(r0 * 0.99, 36), at(0, 0, bh * 0.2).toArray() as V3, [0.1, 0.02, 0.016], 1, { quat: quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)) }));
  const nP = pale ? 23 : 31;
  for (let i = 0; i < nP; i++) {
    const a = (i / nP) * Math.PI * 2;
    const tall = i % 2 === 0;
    const len = (pale ? (tall ? 0.6 : 0.4) : tall ? 0.42 : 0.3) * R;
    const flare = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -0.2);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
    const out = Math.sin(0.2) * len;
    crown.push(prim(new THREE.ConeGeometry((pale ? 0.06 : 0.055) * R, len, 4), at(a, r1 + out * 0.5, bh + len / 2 - 0.2).toArray() as V3, gold, 2, { quat: quat.clone().multiply(flare).multiply(turn), top: goldTop, scale: [1, 1, 0.42] }));
    const tip = at(a, r1 + out, bh + len * 0.98);
    crown.push(prim(new THREE.SphereGeometry(0.02 * R, 8, 6), tip.toArray() as V3, goldTop, 2));
    if (tall) lights.push({ p: tip.toArray() as V3, size: 2.6, col: [1, 0.66, 0.3], k: 0.5 });
  }
  return { geo, crown, lights };
}

export default function KingsWorld({ props }: { props: WorldProps }) {
  const bird = useRef<THREE.Mesh>(null);
  const night = useRef<THREE.Mesh>(null);
  const b = useDisposable(() => {
    const r = rng(1909 + 7);
    const gy = (x: number, z: number) => groundAt(def, x, z);
    const halos: Halo[] = []; // windows
    const stars: Halo[] = [];
    const by = DOME_AT.y;

    // ---------- the wood ----------
    // Old trunks, thick as towers, that lean and turn as they rise and break into two or three heavy boughs;
    // the boughs arch over and fork again, and close a vault over the kings.
    const wood: Part[] = [];
    const towns = new Kit();
    const BARK: V3 = [0.052, 0.036, 0.026];
    const BARK_TOP: V3 = [0.026, 0.03, 0.031];
    const DARK: V3 = [0.007, 0.011, 0.014];
    type Trunk = { x: number; z: number; R: number; H: number; fork?: number; aim?: number };
    const trunks: Trunk[] = [];
    const ahead = (z: number) => z - KINGS.z;
    // the aisle the plane comes up widens into a glade before the kings, so nothing stands between them and the eye
    const clear = (z: number) => 66 + 124 * THREE.MathUtils.smoothstep(330 - ahead(z), 0, 260);
    const tryTrunk = (x: number, z: number, rad: number, H: number, o: Partial<Trunk> = {}) => {
      if (Math.abs(x) < clear(z) + rad && ahead(z) > -70) return;
      if (Math.abs(ahead(z)) < 80 && Math.abs(x) < 228) return;
      for (const c of def.canvases) if (Math.hypot(x - c.x, z - c.z) < 50) return;
      for (const t of trunks) if (Math.hypot(t.x - x, t.z - z) < (t.R + rad) * 2.5) return;
      trunks.push({ x, z, R: rad, H, ...o });
    };
    // close behind the kings and beside them, as in the picture: these are the ones the light falls on
    for (const [x, z, rad] of [
      [-76, -112, 14],
      [82, -124, 15],
      [-168, -104, 15],
      [176, -116, 16],
      [-128, -210, 13],
      [134, -220, 14],
      [-212, -300, 16],
      [206, -320, 16],
      [-262, -40, 17],
      [268, -52, 17],
      [-236, 96, 16],
      [240, 110, 16],
    ] as const)
      trunks.push({ x, z: KINGS.z + z, R: rad, H: 300 + r() * 40, fork: 0.56 + r() * 0.08 });
    // the aisle: two uneven rows of the greatest trunks
    for (let z = 520; z > KINGS.z + 150; z -= 76) for (const s of [-1, 1]) tryTrunk(s * (clear(z) + 16 + r() * 22), z + (r() - 0.5) * 36, 12 + r() * 5, 270 + r() * 60, { fork: 0.52 + r() * 0.12 });
    // and the wood thickening to either side and beyond
    const nOuter = props.mobile ? 14 : Math.round(30 * Math.max(0.6, props.trees));
    for (let i = 0; i < nOuter * 4 && trunks.length < 29 + nOuter; i++) tryTrunk((r() < 0.5 ? -1 : 1) * (130 + r() * 340), 560 - r() * 1100, 8 + r() * 8, 220 + r() * 110);

    // a huddle of houses and towers on a bough, dark against the sky, a few windows lit; now and then small figures
    const town = (c: V3, a: number, n: number, sc: number) => {
      const along: V3 = [Math.cos(a), 0, Math.sin(a)];
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * (4.6 + r() * 1.6) * sc;
        const px = c[0] + along[0] * o;
        const pz = c[2] + along[2] * o;
        const py = c[1];
        const kind = r();
        if (kind < 0.24) {
          // a small figure: some stand, some lift their arms
          const fh = (3.4 + r() * 1.6) * sc;
          towns.add(new THREE.CylinderGeometry(0.32 * sc, 0.62 * sc, fh, 6), [px, py + fh / 2, pz], DARK);
          towns.add(new THREE.SphereGeometry(0.52 * sc, 8, 6), [px, py + fh + 0.4 * sc, pz], DARK);
          if (r() < 0.6) for (const sx of [-1, 1]) towns.box(0.22 * sc, 2.0 * sc, 0.22 * sc, [px + along[0] * sx * 0.8 * sc, py + fh * 0.98, pz + along[2] * sx * 0.8 * sc], DARK, { rot: [Math.sin(a) * sx * 0.55, 0, -Math.cos(a) * sx * 0.55] });
          continue;
        }
        const tall = kind > 0.72;
        const w = (3.2 + r() * 2.6) * sc;
        const hh = (tall ? 12 + r() * 13 : 4 + r() * 4.4) * sc;
        towns.box(w * (tall ? 0.72 : 1), hh, w * (tall ? 0.72 : 1), [px, py + hh / 2, pz], DARK, { rot: [0, -a, 0] });
        if (tall) {
          const sp = (5 + r() * 8) * sc;
          towns.add(new THREE.ConeGeometry(w * 0.56, sp, 4), [px, py + hh + sp / 2, pz], DARK, { rot: [0, -a + Math.PI / 4, 0] });
          if (r() < 0.35) towns.add(new THREE.SphereGeometry(w * 0.5, 8, 6), [px, py + hh + 0.6, pz], DARK, { scale: [1, 1.25, 1] });
        } else towns.add(new THREE.ConeGeometry(w * 0.88, 2.8 * sc, 4), [px, py + hh + 1.4 * sc, pz], DARK, { rot: [0, -a + Math.PI / 4, 0], scale: [1, 1, 0.8] });
        const nW = tall ? 2 : 1;
        for (let wI = 0; wI < nW; wI++) if (r() < 0.86) halos.push({ p: [px + (r() - 0.5) * w * 0.5, py + hh * (0.3 + r() * 0.5), pz + (r() - 0.5) * w * 0.5], size: (1.9 + r() * 1.5) * Math.sqrt(sc), col: r() < 0.7 ? [1, 0.72, 0.38] : [1, 0.46, 0.2], k: 0.9 + r() * 0.8 });
      }
    };
    // a bough: thick where it leaves, arching up and over, wandering a little
    const bough = (p0: V3, a: number, len: number, rise: number, rad: number, depth: number, sides = 9) => {
      const ph = r() * 6.28;
      const bend = (r() - 0.5) * 0.9;
      const wob = len * 0.05;
      const q = (u: number): V3 => {
        const aa = a + bend * u;
        const w = Math.sin(u * 5.2 + ph) * wob * u;
        return [p0[0] + Math.cos(aa) * len * Math.pow(u, 1.12) - Math.sin(aa) * w, p0[1] + rise * (1 - (1 - u) * (1 - u)) + Math.cos(u * 4.1 + ph) * wob * 0.5 * u, p0[2] + Math.sin(aa) * len * Math.pow(u, 1.12) + Math.cos(aa) * w];
      };
      wood.push(limb([p0, q(0.14), q(0.32), q(0.52), q(0.74), q(1)], [rad, rad * 0.86, rad * 0.68, rad * 0.5, rad * 0.3, rad * 0.08], BARK_TOP, 3, { sides, seg: depth ? 14 : 22, twist: 1.2 }));
      return q;
    };
    const tree = (t: Trunk) => {
      const g0 = gy(t.x, t.z);
      const fork = t.fork ?? 0.44 + r() * 0.14;
      const Hf = t.H * fork;
      const leanA = r() * 6.28;
      const lean = 0.03 + r() * 0.07;
      const sway = (0.5 + r() * 0.5) * t.R * 1.5;
      const ph = r() * 6.28;
      const at = (k: number): V3 => [t.x + Math.cos(leanA) * lean * Hf * k + Math.sin(k * 4.4 + ph) * sway * Math.min(1, k * 2), g0 - 7 + (Hf + 7) * k, t.z + Math.sin(leanA) * lean * Hf * k + Math.cos(k * 3.7 + ph) * sway * 0.8 * Math.min(1, k * 2)];
      // the foot spreads into the ground; the bole swells again under the fork
      wood.push(limb([at(0), at(0.07), at(0.2), at(0.42), at(0.66), at(0.86), at(1)], [t.R * 2.1, t.R * 1.36, t.R * 1.04, t.R * 0.96, t.R * 0.92, t.R * 0.98, t.R * 0.9], BARK, 3, { top: BARK_TOP, sides: 14, seg: 30, twist: 2.4 }));
      const p0 = at(1);
      const nB = 2 + (r() < 0.6 ? 1 : 0);
      // most reach toward the aisle and the kings
      const a0 = t.aim ?? (r() < 0.75 ? Math.atan2(-(t.z - (KINGS.z + ahead(t.z) * 0.75)), -t.x) + (r() - 0.5) * 0.9 : r() * 6.28);
      for (let j = 0; j < nB; j++) {
        const a = a0 + (j * Math.PI * 2) / nB + (r() - 0.5) * 0.7;
        const len = (j === 0 ? 96 : 70) + r() * 60;
        const rise = (t.H - Hf) * (0.6 + r() * 0.4);
        const rad = t.R * (0.66 - j * 0.07);
        const q = bough(p0, a, len, rise, rad, 0);
        // it forks again, and ends in a few twigs
        const u1 = 0.36 + r() * 0.16;
        const q2 = bough(q(u1), a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), len * (0.5 + r() * 0.2), rise * 0.5 + 14, rad * 0.5, 1, 7);
        for (const [qq, u, k] of [
          [q, 0.72, 0.2],
          [q, 0.96, 0.12],
          [q2, 0.8, 0.12],
        ] as const) {
          const e = qq(u);
          const ta = a + (r() - 0.5) * 2.6;
          wood.push(limb([e, [e[0] + Math.cos(ta) * 18, e[1] + 9, e[2] + Math.sin(ta) * 18], [e[0] + Math.cos(ta) * 40, e[1] + 12 + r() * 14, e[2] + Math.sin(ta) * 40]], [rad * k, rad * k * 0.55, rad * 0.02], BARK_TOP, 3, { sides: 5, seg: 8 }));
        }
        // towns live where a bough runs level
        for (const [qq, rr2] of [
          [q, rad * 0.42],
          [q2, rad * 0.26],
        ] as const)
          if (r() < 0.72) {
            const u = 0.5 + r() * 0.34;
            const c = qq(u);
            const d = qq(u + 0.04);
            town([c[0], c[1] + rr2 * 0.8, c[2]], Math.atan2(d[2] - c[2], d[0] - c[0]), 4 + Math.floor(r() * 5), 1);
          }
      }
    };
    for (const t of trunks) tree(t);
    // three great boughs slung from trunk to trunk behind the kings: on them the towns that show between the
    // two bowed heads and against the bands of the sky, as he put them
    const span = (a: V3, c: V3, sag: number, rad: number, n: number, sc: number) => {
      const mid: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - sag, (a[2] + c[2]) / 2];
      const q1: V3 = [(a[0] * 3 + c[0]) / 4, (a[1] * 3 + c[1]) / 4 - sag * 0.8, (a[2] * 3 + c[2]) / 4];
      const q3: V3 = [(a[0] + c[0] * 3) / 4, (a[1] + c[1] * 3) / 4 - sag * 0.8, (a[2] + c[2] * 3) / 4];
      wood.push(limb([a, q1, mid, q3, c], [rad * 1.2, rad, rad * 0.9, rad, rad * 1.2], BARK_TOP, 3, { sides: 9, seg: 20, twist: 1 }));
      const ang = Math.atan2(c[2] - a[2], c[0] - a[0]);
      town([mid[0], mid[1] + rad * 0.8, mid[2]], ang, n, sc);
    };
    const KZ = KINGS.z;
    span([-76, by + 2.5 * R, KZ - 112], [82, by + 2.9 * R, KZ - 124], 12, 5, 11, 1.25);
    span([-168, by + 4.6 * R, KZ - 104], [-76, by + 5.3 * R, KZ - 112], 14, 5.5, 8, 1.3);
    span([82, by + 5.0 * R, KZ - 124], [176, by + 4.4 * R, KZ - 116], 12, 5.5, 8, 1.3);
    span([-262, by + 2.2 * R, KZ - 40], [-168, by + 2.9 * R, KZ - 104], 8, 5, 9, 1.4);
    span([176, by + 3.0 * R, KZ - 116], [268, by + 2.3 * R, KZ - 52], 8, 5, 8, 1.4);
    span([-128, by + 3.7 * R, KZ - 210], [134, by + 4.1 * R, KZ - 220], 16, 5.5, 12, 1.5);

    // white lights hung far up among the boughs, as many as stars
    const nStar = props.mobile ? 80 : 190;
    for (let i = 0; i < nStar; i++) {
      const x = (r() - 0.5) * 900;
      const z = KINGS.z + 260 - r() * 760;
      const y = by + 10 + Math.pow(r(), 0.8) * 270;
      if (Math.abs(x) < 150 && Math.abs(z - KINGS.z) < 70 && y < by + 5.2 * R) continue;
      stars.push({ p: [x, y, z], size: 2.6 + r() * 3.4, col: r() < 0.72 ? [0.88, 0.93, 1.0] : [1, 0.84, 0.6], k: 0.55 + r() * 0.9 });
    }

    // ---------- the kings ----------
    const left = buildKing(-1, props.mobile);
    const right = buildKing(1, props.mobile);
    wood.push(...left.crown, ...right.crown);
    const crownLights = [...left.lights, ...right.lights];

    // ---------- the little world ----------
    // His own homestead under the glass, in the light of that picture: a pale field, a path, low roofs, round
    // trees gone rose and gold in a low sun, a poplar or two, blue hills behind. In the middle of it the desk.
    const k = new Kit();
    const DP = (x: number, y: number, z: number): V3 => [DOME_AT.x + x, by + y, KINGS.z + z];
    const GL = 2.7; // its own light (lights are turned down at night; this is the one that is not)
    // the dish it stands on, dark beneath
    k.add(new THREE.CylinderGeometry(R + 0.9, R - 6, 3.6, 56), DP(0, -1.95, 0), [0.045, 0.026, 0.018], { top: [0.2, 0.1, 0.04] });
    k.add(new THREE.TorusGeometry(R + 0.5, 0.4, 6, 72), DP(0, 0.05, 0), [1, 0.62, 0.3], { glow: 1.4, rot: [Math.PI / 2, 0, 0] });
    // the field and the path that leaves the desk
    k.add(new THREE.CylinderGeometry(R - 0.3, R - 0.3, 0.5, 64), DP(0, -0.2, 0), [0.98, 0.78, 0.5], { glow: GL * 0.5 });
    k.box(2.2, 0.14, R * 1.5, DP(2.4, 0.12, -R * 0.1), [1, 0.9, 0.72], { glow: GL * 0.56, rot: [0, 0.16, 0] });
    k.add(new THREE.SphereGeometry(R * 0.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), DP(-R * 0.3, 0, -R * 0.5), [0.72, 0.6, 0.74], { glow: GL * 0.42, scale: [1.3, 0.4, 0.6] });
    k.add(new THREE.SphereGeometry(R * 0.4, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), DP(R * 0.42, 0, -R * 0.58), [0.8, 0.62, 0.66], { glow: GL * 0.42, scale: [1.3, 0.4, 0.6] });
    // the desk, the display on it
    k.box(5.2, 0.3, 2.5, DP(0, 2.6, 5), [0.5, 0.27, 0.15], { glow: GL * 0.42 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.24, 2.5, 0.24, DP(sx * 2.3, 1.25, 5 + sz * 0.95), [0.36, 0.19, 0.1], { glow: GL * 0.36 });
    k.box(2.5, 1.5, 0.12, DP(0, 3.9, 4.5), [0.08, 0.06, 0.07], { glow: 0 });
    k.box(2.3, 1.3, 0.03, DP(0, 3.9, 4.58), [1.0, 0.86, 0.7], { glow: GL * 0.6 });
    // roofs
    for (const [x, z, w, rot] of [
      [-9, -6, 6.4, 0.3],
      [-15.5, -1, 4.6, -0.2],
      [10, -9, 5.4, -0.4],
    ] as const) {
      k.box(w, 3.0, w * 0.72, DP(x, 1.5, z), [0.98, 0.8, 0.6], { glow: GL * 0.46, rot: [0, rot, 0] });
      k.add(new THREE.ConeGeometry(w * 0.8, 2.6, 4), DP(x, 4.3, z), [0.78, 0.24, 0.15], { glow: GL * 0.44, rot: [0, rot + Math.PI / 4, 0], scale: [1, 1, 0.74] });
    }
    // round trees, rose and ochre; slim dark poplars; a thin tower
    const tr = rng(77);
    for (let i = 0; i < 20; i++) {
      const a = 0.62 + (i / 20) * (Math.PI * 2 - 1.24) + Math.PI / 2;
      const d = R * (0.46 + tr() * 0.44);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 3;
      if (i % 5 === 2) {
        const h = 11 + tr() * 6;
        k.add(new THREE.ConeGeometry(1.5, h, 7), DP(x, h / 2 + 0.4, z), [0.3, 0.14, 0.12], { glow: GL * 0.3, top: [0.5, 0.26, 0.16] });
      } else {
        const s = 3.2 + tr() * 2.4;
        const rose = tr() < 0.6;
        k.add(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 5), DP(x, 1.7, z), [0.34, 0.16, 0.1], { glow: GL * 0.3 });
        k.add(new THREE.SphereGeometry(s, 12, 9), DP(x, 3.2 + s * 0.8, z), rose ? [0.72, 0.3, 0.2] : [0.76, 0.46, 0.2], { glow: GL * 0.4, scale: [1, 0.92, 1], top: rose ? [0.95, 0.52, 0.36] : [0.98, 0.7, 0.34] });
      }
    }
    k.box(1.1, 15, 1.1, DP(15, 7.5, -13), [0.34, 0.16, 0.13], { glow: GL * 0.3 });
    k.add(new THREE.ConeGeometry(1.1, 3.4, 4), DP(15, 16.6, -13), [0.34, 0.16, 0.13], { glow: GL * 0.3, rot: [0, Math.PI / 4, 0] });

    // embers drifting up through the wood
    const embers = pointsGeometry(
      props.mobile ? 110 : Math.round(260 * Math.max(0.4, props.effects)),
      (_i, q) => {
        const a = q() * Math.PI * 2;
        const d = 30 + Math.pow(q(), 0.7) * 300;
        return [Math.cos(a) * d * 0.7, 8 + q() * 240, KINGS.z + 90 + Math.sin(a) * d, 0.5 + q() * 1.1];
      },
      404,
    );
    // one bird, far up, crossing
    const birdG = new THREE.BufferGeometry();
    birdG.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.9, -6.4, 1.9, 1.9, -2.6, 0.3, -0.9, 0, 0, 0.9, 2.6, 0.3, -0.9, 6.4, 1.9, 1.9, 0, 0, 1.6, -0.7, 0, -0.4, 0.7, 0, -0.4], 3));

    // the plane is eased round every trunk
    def.obstacles.length = OWN_OBSTACLES;
    for (const t of trunks) def.obstacles.push({ x: t.x, z: t.z, r: t.R + 6, h: t.H });

    const woodG = mergeGeometries(wood)!;
    wood.forEach((g) => g.dispose());
    return {
      wood: woodG,
      bark: makeEmberLit("plain"),
      left: left.geo,
      leftMat: makeEmberLit("pale"),
      right: right.geo,
      rightMat: makeEmberLit("dark"),
      towns: towns.parts.length ? towns.build() : null,
      dark: makeTempera({ amb: 0.7, key: 0.05, dab: 0.4 }),
      little: k.build(),
      lit: makeTempera({ amb: 0.5, key: 0.2, dab: 0.5 }),
      domeGeo: new THREE.SphereGeometry(R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      domeSky: makeDomeSky(),
      domeGlass: makeDomeGlass(),
      rays: raysGeometry(props.mobile ? 150 : 280, 5),
      raysMat: makeRays(),
      nightGeo: new THREE.SphereGeometry(1400, 48, 24),
      nightMat: makeNight(),
      embers,
      emberMat: makePoints({ a: [1, 0.5, 0.18], b: [1, 0.76, 0.4], scale: 480, drift: 5, gain: 1.3, max: 12 }),
      birdG,
      birdMat: new THREE.MeshBasicMaterial({ color: "#020506", side: THREE.DoubleSide, fog: false }),
      halos,
      stars,
      crownLights,
    };
  }, [props.mobile, props.trees, props.effects > 0.5]);

  useFrame(({ camera }) => {
    // the night stands round the eye wherever it goes (this group sits at the world's own centre)
    night.current?.position.copy(camera.position).sub(ORIGIN);
    const m = bird.current;
    if (m) {
      // every half minute or so it crosses above the two crowns
      const t = (SKY_U.uTime.value * 0.03 + 0.3) % 1;
      m.position.set(-300 + t * 600, DOME_AT.y + R * 4.5 + Math.sin(t * 9) * 6, KINGS.z + 30 - t * 70);
      m.rotation.set(0, -Math.PI / 2 + 0.14, Math.sin(SKY_U.uTime.value * 2.2) * 0.1);
      m.scale.setScalar(1.7);
    }
  });
  const at: V3 = [DOME_AT.x, DOME_AT.y, KINGS.z];
  return (
    <>
      <mesh ref={night} geometry={b.nightGeo} material={b.nightMat} renderOrder={-9} frustumCulled={false} />
      <WorldBase id="kings" def={def} pal={KINGS_PAL} props={props} grass={false} pathTint={[1, 0.78, 0.5]} pathGain={0.5} angels={false} marks={false} groundSize={2600} />
      <mesh geometry={b.wood} material={b.bark} />
      {b.towns && <mesh geometry={b.towns} material={b.dark} />}
      <mesh geometry={b.left} material={b.leftMat} />
      <mesh geometry={b.right} material={b.rightMat} />
      <mesh geometry={b.little} material={b.lit} />
      <mesh geometry={b.domeGeo} material={b.domeSky} position={at} />
      <mesh geometry={b.domeGeo} material={b.domeGlass} position={at} renderOrder={5} />
      <mesh geometry={b.rays} material={b.raysMat} position={at} renderOrder={6} />
      <points geometry={b.embers} material={b.emberMat} renderOrder={6} />
      <mesh ref={bird} geometry={b.birdG} material={b.birdMat} />
      <Halos list={b.stars} />
      <Halos list={b.halos} />
      <Halos list={b.crownLights} />
    </>
  );
}
