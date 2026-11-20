"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type V3 } from "./kit";
import { KINGS, ORIGIN, WORLDS, groundAt } from "./voyage";

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
export const KINGS_PAL: GroundPalette = { a: [0.018, 0.03, 0.028], b: [0.03, 0.036, 0.026], c: [0.012, 0.022, 0.026] };

const DOME = new THREE.Vector3(0, KINGS.domeY, KINGS.z);
const WARM: V3 = [1.0, 0.66, 0.34];
// the world's own tall things (the kings, the painting's wall); the trunks join them whenever the wood is built
const OWN_OBSTACLES = def.obstacles.length;

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
      const fl = kind === 3 ? 1 + 0.09 * Math.sin(a * 5 + t * 9) + 0.05 * Math.sin(a * 3 - t * 5) : 1;
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

// Everything in the wood is lit by the little world: a warm light from one
// point, low between the kings, falling off with distance; beyond its reach
// only the teal of the night. Robes carry their bands of pattern; bark its
// long streaks.
function makeEmberLit(pattern: 0 | 1 | 2) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, uDome: { value: DOME.clone().add(ORIGIN) } },
    vertexShader: /* glsl */ `
      attribute vec4 aCol;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec4 vCol;
      void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDome;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec4 vCol;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 L = uDome - vWorld; float d = length(L); L /= max(d, 0.001);
        vec3 alb = vCol.rgb;
        float kind = vCol.a;
        float robe = 1.0 - step(0.5, kind);
        float bark = step(2.5, kind);
        float gold = step(1.5, kind) * (1.0 - bark);
        float h = vLocal.y;
        float across = vLocal.z * 0.8 + vLocal.x * 0.6;
        ${
          pattern === 0
            ? `// the pale king: level bands of fine wavy lines, and here and there a small dark flower
               float wave = sin(h * 1.05 + sin(across * 0.21) * 2.2 + vnoise(vec2(across * 0.08, h * 0.05)) * 5.0);
               float band = smoothstep(0.35, 0.6, vnoise(vec2(h * 0.045, 3.0)));
               alb = mix(alb, alb * 1.4 + vec3(0.01, 0.02, 0.02), smoothstep(0.55, 0.95, wave) * 0.4 * band * robe);
               alb = mix(alb, alb * 0.5, smoothstep(0.6, 1.0, -wave) * band * 0.5 * robe);
               vec2 fc = vec2(across, h) * 0.085; vec2 fi = floor(fc); vec2 ff = fract(fc) - 0.5;
               float pick = step(0.7, hash12(fi));
               alb = mix(alb, vec3(0.05, 0.075, 0.14), (1.0 - smoothstep(0.12, 0.2, length(ff))) * pick * 0.8 * robe);`
            : pattern === 1
              ? `// the dark king: broad bands that follow the fall of the robe, stitched with ember and gold
               float fall = h * 0.062 + sin(across * 0.05) * 0.9 + vnoise(vec2(across * 0.03, h * 0.02)) * 1.6;
               float bf = fract(fall);
               float edge = smoothstep(0.0, 0.05, bf) * (1.0 - smoothstep(0.2, 0.25, bf));
               float stitch = step(0.5, fract(across * 0.42 + floor(fall) * 0.37)) * (0.5 + 0.5 * step(0.35, fract(h * 0.6)));
               vec3 thread = mix(vec3(0.5, 0.17, 0.05), vec3(0.6, 0.42, 0.12), hash12(vec2(floor(fall), floor(across * 0.42))));
               alb = mix(alb, thread * 0.8, edge * stitch * 0.8 * robe);
               alb *= 1.0 - 0.3 * robe * smoothstep(0.5, 0.9, bf);`
              : `// bark: long streaks running with the grain
               float grain = vnoise(vec2(across * 0.5, h * 0.035)) * 0.6 + vnoise(vec2(across * 1.7, h * 0.11)) * 0.4;
               alb *= mix(1.0, 0.55 + 0.9 * grain, bark);`
        }
        float dab = vnoise(vLocal.xz * 0.23 + h * 0.19) * 0.6 + vnoise(vLocal.xy * 0.9 + vLocal.z * 0.7) * 0.4;
        alb *= 1.0 + (dab - 0.5) * 0.3;
        // the one light: soft, wrapped a little round the form, gone by the far trunks
        float att = 1.0 / (1.0 + d * d / 7000.0);
        float wrap = clamp(dot(n, L) * 0.72 + 0.28, 0.0, 1.0);
        vec3 warm = vec3(1.0, 0.64, 0.32);
        vec3 col = alb * (uSkyCol * (0.6 + 0.4 * n.y) * 0.85 + warm * att * wrap * wrap * 3.4);
        // and it catches every edge that is turned toward it
        float rim = pow(1.0 - abs(dot(n, V)), 2.6) * clamp(dot(n, L) + 0.45, 0.0, 1.0);
        col += warm * rim * att * (0.5 + 1.6 * gold + alb.r * 2.0);
        col += alb * gold * (0.08 + att * 1.6);
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// The sky of the little world, seen through the dome: gold at its rim, a pale clear blue above.
function makeDomeSky() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `varying vec3 vLocal; void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal;
      ${GLSL_SKY}
      void main(){
        float h = clamp(normalize(vLocal).y, 0.0, 1.0);
        vec3 col = mix(vec3(1.9, 1.3, 0.7), vec3(1.5, 1.32, 1.0), smoothstep(0.0, 0.35, h));
        col = mix(col, vec3(0.95, 1.12, 1.3), smoothstep(0.3, 0.95, h));
        gl_FragColor = vec4(col * (1.0 + uPulse * 0.25), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// The glass of it from outside: nothing in the middle, a bright line at the limb.
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
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW))), 2.4);
        float dist = length(cameraPosition - vW);
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.4) * f * 0.9 * smoothstep(4.0, 30.0, dist), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// Rays: fine straight lines of light going out from the dome, long and short, each a little broken, as he drew them.
function raysGeometry(n: number, seed: number) {
  const r = rng(seed);
  const pos: number[] = [];
  const dat: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    // over the upper half, thickest toward the zenith
    const a = (r() - 0.5) * Math.PI * 1.06;
    const tiltZ = (r() - 0.5) * 0.9;
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(tiltZ), Math.cos(a) * Math.cos(tiltZ), Math.sin(tiltZ)).normalize();
    const r0 = KINGS.domeR * (1.03 + r() * 0.1);
    const r1 = KINGS.domeR * (1.9 + r() * r() * 5.2);
    const b = pos.length / 3;
    for (const [t, s] of [
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 1],
    ]) {
      const d = t ? r1 : r0;
      pos.push(dir.x * d, dir.y * d, dir.z * d);
      dat.push(dir.x, dir.y, dir.z, s, t, r(), 0.1 + r() * 0.16, r1 - r0);
    }
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const ib = new THREE.InterleavedBuffer(new Float32Array(dat), 8);
  g.setAttribute("aDir", new THREE.InterleavedBufferAttribute(ib, 4, 0));
  g.setAttribute("aRay", new THREE.InterleavedBufferAttribute(ib, 4, 4));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), KINGS.domeR * 8);
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
        wp.xyz += side * aDir.w * max(aRay.z, dist * 0.0011);
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
        float dash = smoothstep(0.2, 0.42, abs(fract(vUv.y * vRay.z * 0.16 + vRay.x * 9.0 - uTime * 0.02) - 0.5) * 2.0);
        float a = across * across * (1.0 - vUv.y) * (1.0 - vUv.y) * (0.3 + 0.7 * dash) * smoothstep(0.0, 0.04, vUv.y);
        float tw = 0.75 + 0.25 * sin(uTime * (0.4 + vRay.x) + vRay.x * 40.0);
        float dist = length(vWorld - cameraPosition);
        vec3 col = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.86, 0.6), (1.0 - vUv.y) * (1.0 - vUv.y));
        gl_FragColor = vec4(col * a * tw * 1.5 * (1.0 + uPulse * 0.5) * smoothstep(3.0, 26.0, dist) * exp(-dist * uMist * 1.5), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export default function KingsWorld({ props }: { props: WorldProps }) {
  const bird = useRef<THREE.Mesh>(null);
  const b = useDisposable(() => {
    const r = rng(1909 + 7);
    const gy = (x: number, z: number) => groundAt(def, x, z);
    const halos: Halo[] = []; // windows
    const stars: Halo[] = [];
    const glows: Halo[] = [];
    const crownLights: Halo[] = [];

    // ---------- the wood ----------
    const wood: Part[] = [];
    const towns = new Kit();
    const BARK: V3 = [0.05, 0.036, 0.026];
    const BARK_TOP: V3 = [0.028, 0.03, 0.03];
    const trunks: { x: number; z: number; R: number; H: number }[] = [];
    const tryTrunk = (x: number, z: number, R: number, H: number) => {
      // none where the kings stand, none in the aisle, none on the painting
      if (Math.abs(x) < 34 + R) return;
      if (Math.abs(z - KINGS.z) < 96 && Math.abs(x) < 215) return;
      if (Math.hypot(x + 30, z - 428) < 44) return;
      for (const t of trunks) if (Math.hypot(t.x - x, t.z - z) < (t.R + R) * 2.6) return;
      trunks.push({ x, z, R, H });
    };
    // the aisle: two uneven rows of the greatest trunks, then the wood thickening to either side and beyond the kings
    for (let z = 500; z > -470; z -= 74) for (const s of [-1, 1]) tryTrunk(s * (62 + r() * 26), z + (r() - 0.5) * 40, 11 + r() * 5.5, 250 + r() * 70);
    const nOuter = props.mobile ? 16 : Math.round(34 * Math.max(0.6, props.trees));
    for (let i = 0; i < nOuter * 3 && trunks.length < 26 + nOuter; i++) tryTrunk((r() < 0.5 ? -1 : 1) * (120 + r() * 330), 560 - r() * 1080, 7 + r() * 7, 200 + r() * 110);
    // close behind the kings, as in the picture
    for (const [x, z] of [
      [-52, -118],
      [58, -128],
      [-150, -112],
      [160, -124],
      [0, -190],
    ] as const)
      trunks.push({ x, z: KINGS.z + z, R: 10 + r() * 4, H: 280 + r() * 40 });

    for (const t of trunks) {
      const g0 = gy(t.x, t.z);
      const lean = (r() - 0.5) * 0.16;
      const leanZ = (r() - 0.5) * 0.12;
      const sway = (r() - 0.5) * 26;
      const at = (k: number): V3 => [t.x + lean * t.H * k + Math.sin(k * 3.6 + t.x) * sway * k, g0 - 6 + (t.H + 6) * k, t.z + leanZ * t.H * k + Math.cos(k * 2.9 + t.z) * sway * 0.6 * k];
      wood.push(limb([at(0), at(0.08), at(0.3), at(0.55), at(0.8), at(1)], [t.R * 1.75, t.R * 1.12, t.R, t.R * 0.86, t.R * 0.62, t.R * 0.3], BARK, 3, { top: BARK_TOP, sides: 12, seg: 22, twist: 1.6 }));
      // boughs: thick at the fork, long, rising and then levelling, closing the vault over the aisle
      const nB = 2 + Math.floor(r() * 2.4);
      for (let j = 0; j < nB; j++) {
        const k0 = 0.26 + r() * 0.46;
        const p0 = at(k0);
        // most reach toward the aisle
        const toAisle = Math.atan2(-p0[0], 0.001) + (r() - 0.5) * 2.2;
        const a = r() < 0.62 ? toAisle : r() * Math.PI * 2;
        const len = 70 + r() * 80;
        const rise = 26 + r() * 50;
        const bend = (r() - 0.5) * 0.9;
        const q = (u: number, up: number): V3 => [p0[0] + Math.cos(a + bend * u) * len * u, p0[1] + rise * up, p0[2] + Math.sin(a + bend * u) * len * u];
        const pts = [p0, q(0.22, 0.42), q(0.5, 0.8), q(0.78, 0.96), q(1, 0.9)];
        const br = t.R * (0.44 - j * 0.05);
        wood.push(limb(pts, [br, br * 0.74, br * 0.5, br * 0.3, br * 0.1], BARK_TOP, 3, { sides: 8, seg: 16 }));
        // twigs off its end
        for (let w = 0; w < 2; w++) {
          const e = q(0.62 + w * 0.2, 0.9);
          const ta = a + (w ? 1 : -1) * (0.7 + r() * 0.5);
          wood.push(limb([e, [e[0] + Math.cos(ta) * 22, e[1] + 10, e[2] + Math.sin(ta) * 22], [e[0] + Math.cos(ta) * 44, e[1] + 12 + r() * 10, e[2] + Math.sin(ta) * 44]], [br * 0.3, br * 0.16, br * 0.04], BARK_TOP, 3, { sides: 6, seg: 8 }));
        }
        // a small town on the bough: a huddle of houses and towers, dark against the sky, their windows lit
        if (r() < 0.8) {
          const c = q(0.42 + r() * 0.3, 0.8);
          const along: V3 = [Math.cos(a), 0, Math.sin(a)];
          const nH = 4 + Math.floor(r() * 5);
          for (let hI = 0; hI < nH; hI++) {
            const o = (hI - (nH - 1) / 2) * (3.2 + r() * 1.2);
            const tall = r() < 0.3;
            const w = 2.4 + r() * 2;
            const hh = tall ? 9 + r() * 9 : 3 + r() * 3.6;
            const px = c[0] + along[0] * o;
            const pz = c[2] + along[2] * o;
            const py = c[1] + br * 0.5;
            const dark: V3 = [0.012, 0.018, 0.022];
            towns.box(w, hh, w, [px, py + hh / 2, pz], dark, { rot: [0, -a, 0] });
            if (tall) towns.add(new THREE.ConeGeometry(w * 0.72, 4 + r() * 5, 4), [px, py + hh + 2.4, pz], dark, { rot: [0, -a + Math.PI / 4, 0] });
            else towns.add(new THREE.ConeGeometry(w * 0.86, 2.2, 4), [px, py + hh + 1.1, pz], dark, { rot: [0, -a + Math.PI / 4, 0], scale: [1, 1, 0.8] });
            if (r() < 0.85) halos.push({ p: [px + (r() - 0.5) * 1.6, py + hh * (0.35 + r() * 0.4), pz + (r() - 0.5) * 1.6], size: 2.2 + r() * 1.8, col: r() < 0.75 ? [1, 0.74, 0.4] : [1, 0.5, 0.24], k: 0.9 + r() * 0.8 });
          }
        }
      }
    }
    // lights hung far up among the boughs, as many as stars
    const nStar = props.mobile ? 70 : 170;
    for (let i = 0; i < nStar; i++) {
      const t = trunks[Math.floor(r() * trunks.length)];
      const a = r() * Math.PI * 2;
      const d = 14 + r() * 70;
      stars.push({ p: [t.x + Math.cos(a) * d, 70 + r() * 200, t.z + Math.sin(a) * d], size: 2.4 + r() * 3, col: r() < 0.6 ? [0.86, 0.92, 1.0] : [1, 0.82, 0.56], k: 0.5 + r() * 0.9 });
    }

    // ---------- the kings ----------
    const left: Part[] = [];
    const right: Part[] = [];
    const g0 = gy(0, KINGS.z);
    const king = (side: -1 | 1, out: Part[]) => {
      // u: how far from the middle, on this king's own side
      const P = (u: number, y: number, z = 0): V3 => [side * u, g0 + y, KINGS.z + z];
      const pale = side < 0;
      const robe: V3 = pale ? [0.1, 0.165, 0.16] : [0.06, 0.036, 0.03];
      const robeTop: V3 = pale ? [0.2, 0.27, 0.24] : [0.1, 0.055, 0.04];
      const skin: V3 = pale ? [0.42, 0.3, 0.22] : [0.28, 0.17, 0.11];
      // the body: a long robe, standing, bowed deep from the waist toward the light
      out.push(limb([P(122, -8), P(121, 40), P(114, 84), P(100, 122), P(82, 148), P(66, 160)], [50, 42, 35, 30, 26, 14], robe, 0, { top: robeTop, sides: 26, seg: 44, flat: [1, 1.12] }));
      // the hem's long folds: shallow ridges down the skirt
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        const fx = Math.cos(a);
        const fz = Math.sin(a) * 1.12;
        out.push(limb([P(122 + fx * 47, -8, fz * 47), P(120 + fx * 40, 44, fz * 40), P(111 + fx * 31, 96, fz * 31)], [4.2, 3.2, 0.8], robe, 0, { top: robeTop, sides: 6, seg: 12 }));
      }
      // head, bowed over the light
      const tilt = 1.12; // from upright, toward the middle
      const up = new THREE.Vector3(-side * Math.sin(tilt), Math.cos(tilt), 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      const head = new THREE.Vector3(...P(55, 163));
      out.push(prim(new THREE.SphereGeometry(15.5, 28, 22), head.toArray() as V3, skin, 1, { quat, scale: [0.9, 1.18, 0.98] }));
      // the brow and the long nose: one plain ridge, no more of a face than that
      const face = head.clone().addScaledVector(up, -3).add(new THREE.Vector3(-side * Math.cos(tilt) * 12.5, -Math.sin(tilt) * 12.5, 0));
      out.push(prim(new THREE.ConeGeometry(3.2, 12, 8), face.toArray() as V3, skin, 1, { quat, scale: [1.3, 1, 0.7] }));
      if (pale) {
        // long pale hair down the back and over the shoulder
        out.push(limb([P(46, 177), P(64, 176), P(90, 154), P(110, 116), P(120, 78), P(124, 54)], [8, 14, 16, 14, 10, 3], [0.4, 0.33, 0.24], 1, { top: [0.5, 0.42, 0.3], sides: 14, seg: 30, flat: [0.8, 1.35] }));
        for (const sz of [-1, 1]) out.push(limb([P(42, 170, sz * 10), P(40, 146, sz * 17), P(52, 118, sz * 22), P(64, 92, sz * 21)], [4.6, 7, 5.6, 1.4], [0.4, 0.33, 0.24], 1, { top: [0.5, 0.42, 0.3], sides: 8, seg: 18 }));
      } else {
        // a dark hood of hair close about the head
        out.push(limb([P(42, 175), P(60, 176), P(78, 160), P(88, 136)], [7.5, 14, 14, 5], [0.05, 0.035, 0.03], 1, { sides: 12, seg: 18, flat: [0.85, 1.3] }));
      }
      // the crown: a band and a ring of tall points, leaning with the head, a small light on every point
      const gold: V3 = [0.5, 0.24, 0.07];
      const goldTop: V3 = [0.85, 0.52, 0.16];
      const cc = head.clone().addScaledVector(up, 12.5);
      out.push(prim(new THREE.CylinderGeometry(16.6, 14.6, 7, 30, 1, true), cc.toArray() as V3, gold, 2, { quat, top: goldTop }));
      const nP = 13;
      for (let i = 0; i < nP; i++) {
        const a = (i / nP) * Math.PI * 2;
        const tall = i % 2 === 0;
        const len = tall ? 17 : 11;
        const base = new THREE.Vector3(Math.cos(a) * 16.8, 3.2 + len / 2, Math.sin(a) * 16.8).applyQuaternion(quat).add(cc);
        // each point flares a little outward
        const flare = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -0.16);
        out.push(prim(new THREE.ConeGeometry(2.5, len, 4), base.toArray() as V3, gold, 2, { quat: quat.clone().multiply(flare).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 4)), top: goldTop }));
        const tip = new THREE.Vector3(Math.cos(a) * 18.2, 3.2 + len + 0.6, Math.sin(a) * 18.2).applyQuaternion(quat).add(cc);
        crownLights.push({ p: tip.toArray() as V3, size: tall ? 3.4 : 2.4, col: [1, 0.72, 0.36], k: tall ? 0.95 : 0.6 });
      }
      // arms: from the shoulder down and in, the sleeves wide; the hands about the light
      for (const sz of [-1, 1]) {
        out.push(limb([P(78, 146, sz * 25), P(84, 118, sz * 36), P(66, 88, sz * 33), P(44, 70, sz * 24), P(pale ? 27 : 32, pale ? 51 : 62, sz * 16)], [12, 14.5, 13.5, 11.5, 7], robe, 0, { top: robeTop, sides: 14, seg: 30 }));
        if (pale) {
          // his hands lie open under it: a palm, and the fingers reaching past the middle
          out.push(prim(new THREE.SphereGeometry(1, 16, 12), P(17, KINGS.domeY - 9.2, sz * 11), skin, 1, { scale: [11, 4.4, 8], rot: [0, 0, side * 0.08] }));
          for (let f = 0; f < 4; f++) out.push(limb([P(10, KINGS.domeY - 9, sz * (5 + f * 4)), P(0, KINGS.domeY - 8.4, sz * (4.6 + f * 4.2)), P(-9, KINGS.domeY - 7, sz * (4.4 + f * 4.3))], [2.3, 2.0, 1.1], skin, 1, { sides: 6, seg: 8 }));
        } else {
          // the dark king's hands stand at its side, the fingers curled in beneath
          out.push(prim(new THREE.SphereGeometry(1, 16, 12), P(KINGS.domeR + 7, KINGS.domeY + 1, sz * 12), skin, 1, { scale: [5, 12, 8.6], rot: [0, 0, side * 0.3] }));
          for (let f = 0; f < 4; f++) out.push(limb([P(KINGS.domeR + 5.4, KINGS.domeY - 6, sz * (6 + f * 4.1)), P(KINGS.domeR + 2.6, KINGS.domeY - 13.5, sz * (5.6 + f * 4.2)), P(KINGS.domeR - 3, KINGS.domeY - 15.5 + f * 0.5, sz * (5.3 + f * 4.3))], [2.2, 1.9, 1.0], skin, 1, { sides: 6, seg: 10 }));
        }
      }
    };
    king(-1, left);
    king(1, right);

    // ---------- the little world ----------
    const R = KINGS.domeR;
    const k = new Kit();
    const DP = (x: number, y: number, z: number): V3 => [DOME.x + x, g0 + DOME.y + y, DOME.z + z];
    const GL = 2.6; // its own light (lights are turned down at night; this is the one that is not)
    // the dish it stands on, dark beneath
    k.add(new THREE.CylinderGeometry(R + 2.4, R - 5, 4.6, 48), DP(0, -2.6, 0), [0.05, 0.03, 0.02], { top: [0.16, 0.09, 0.04] });
    // the field: sunlit grass, paler toward the rim, and the path that leaves the desk
    k.add(new THREE.CylinderGeometry(R - 0.3, R - 0.3, 0.5, 56), DP(0, -0.2, 0), [0.5, 0.56, 0.2], { glow: GL * 0.5 });
    k.box(1.3, 0.12, R * 1.5, DP(1.6, 0.14, -R * 0.2), [0.86, 0.68, 0.42], { glow: GL * 0.5, rot: [0, 0.1, 0] });
    // the desk, the display on it
    k.box(3.2, 0.2, 1.6, DP(0, 1.7, 2), [0.5, 0.3, 0.16], { glow: GL * 0.5 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.16, 1.6, 0.16, DP(sx * 1.4, 0.8, 2 + sz * 0.6), [0.36, 0.2, 0.1], { glow: GL * 0.4 });
    k.box(1.5, 0.9, 0.08, DP(0, 2.5, 1.7), [0.06, 0.06, 0.07], { glow: 0 });
    k.box(1.36, 0.76, 0.02, DP(0, 2.5, 1.75), [0.7, 0.82, 1.0], { glow: GL * 0.5 });
    // pines and birches round it, the farther ones bluer; a rise of ground behind
    const tr = rng(77);
    for (let i = 0; i < 22; i++) {
      const a = 0.5 + (i / 22) * (Math.PI * 2 - 1.0) + Math.PI / 2;
      const d = R * (0.5 + tr() * 0.42);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 2;
      const far = Math.max(0, -z / R);
      if (i % 3 === 0) {
        const s = 2.2 + tr() * 1.6;
        k.add(new THREE.CylinderGeometry(0.1, 0.14, 4.6, 5), DP(x, 2.3, z), [0.9, 0.86, 0.76], { glow: GL * 0.45 });
        k.add(new THREE.SphereGeometry(s, 10, 8), DP(x, 5.6, z), [0.5 - far * 0.1, 0.56, 0.2 + far * 0.18], { glow: GL * 0.45, scale: [1, 1.2, 1], top: [0.8, 0.74, 0.3] });
      } else {
        const h = 6.5 + tr() * 5.5;
        k.add(new THREE.ConeGeometry(1.5 + h * 0.12, h, 8), DP(x, h / 2 + 0.6, z), [0.12, 0.26 + far * 0.08, 0.14 + far * 0.2], { glow: GL * 0.4, top: [0.5, 0.52, 0.22] });
      }
    }
    k.add(new THREE.SphereGeometry(R * 0.5, 24, 12), DP(-R * 0.3, -R * 0.33, -R * 0.62), [0.36, 0.46, 0.36], { glow: GL * 0.45, scale: [1.5, 0.9, 0.7] });
    glows.push({ p: DP(0, 6, 0), size: 110, col: WARM, k: 0.75 }, { p: DP(0, 10, 0), size: 300, col: [1, 0.56, 0.26], k: 0.2 });
    // a pool of its light on the ground beneath
    glows.push({ p: [0, g0 + 6, KINGS.z], size: 170, col: [0.9, 0.5, 0.24], k: 0.1 });

    // embers drifting up through the wood
    const embers = pointsGeometry(
      props.mobile ? 160 : Math.round(420 * Math.max(0.4, props.effects)),
      (_i, q) => {
        const a = q() * Math.PI * 2;
        const d = 20 + Math.pow(q(), 0.7) * 330;
        return [Math.cos(a) * d * 0.7, 6 + q() * 230, KINGS.z + 110 + Math.sin(a) * d, 0.5 + q() * 1.2];
      },
      404,
    );
    // one bird, far up, crossing
    const birdG = new THREE.BufferGeometry();
    birdG.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, -5.2, 1.5, 1.6, -2.2, 0.2, -0.7, 0, 0, 0, 2.2, 0.2, -0.7, 5.2, 1.5, 1.6], 3));

    // the plane is eased round every trunk
    def.obstacles.length = OWN_OBSTACLES;
    for (const t of trunks) def.obstacles.push({ x: t.x, z: t.z, r: t.R + 5, h: t.H });

    const woodG = mergeGeometries(wood)!;
    wood.forEach((g) => g.dispose());
    const leftG = mergeGeometries(left)!;
    left.forEach((g) => g.dispose());
    const rightG = mergeGeometries(right)!;
    right.forEach((g) => g.dispose());
    return {
      wood: woodG,
      bark: makeEmberLit(2),
      left: leftG,
      leftMat: makeEmberLit(0),
      right: rightG,
      rightMat: makeEmberLit(1),
      towns: towns.parts.length ? towns.build() : null,
      dark: makeTempera({ amb: 0.7, key: 0.05, dab: 0.4 }),
      little: k.build(),
      lit: makeTempera({ amb: 0.5, key: 0.2, dab: 0.5 }),
      domeGeo: new THREE.SphereGeometry(R, 56, 22, 0, Math.PI * 2, 0, Math.PI / 2),
      domeSky: makeDomeSky(),
      domeGlass: makeDomeGlass(),
      rays: raysGeometry(props.mobile ? 90 : 170, 5),
      raysMat: makeRays(),
      embers,
      emberMat: makePoints({ a: [1, 0.5, 0.18], b: [1, 0.76, 0.4], scale: 520, drift: 5, gain: 1.5, max: 14 }),
      birdG,
      birdMat: new THREE.MeshBasicMaterial({ color: "#020506", side: THREE.DoubleSide, fog: false }),
      halos,
      stars,
      glows,
      crownLights,
      domeY: g0 + DOME.y,
    };
  }, [props.mobile, props.trees, props.effects > 0.5]);

  useFrame(() => {
    const m = bird.current;
    if (m) {
      // every half minute or so it crosses the gap between the crowns
      const t = (SKY_U.uTime.value * 0.033) % 1;
      m.position.set(-260 + t * 520, 236 + Math.sin(t * 9) * 5, KINGS.z + 50 - t * 70);
      m.rotation.set(0, -Math.PI / 2 + 0.14, Math.sin(SKY_U.uTime.value * 2.2) * 0.1);
      m.scale.setScalar(1.5);
    }
  });
  return (
    <>
      <WorldBase id="kings" def={def} pal={KINGS_PAL} props={props} grass={false} pathTint={[1, 0.78, 0.5]} pathGain={0.55} angels={false} marks={false} groundSize={2600} />
      <mesh geometry={b.wood} material={b.bark} />
      {b.towns && <mesh geometry={b.towns} material={b.dark} />}
      <mesh geometry={b.left} material={b.leftMat} />
      <mesh geometry={b.right} material={b.rightMat} />
      <mesh geometry={b.little} material={b.lit} />
      <mesh geometry={b.domeGeo} material={b.domeSky} position={[DOME.x, b.domeY, DOME.z]} />
      <mesh geometry={b.domeGeo} material={b.domeGlass} position={[DOME.x, b.domeY, DOME.z]} renderOrder={5} />
      <mesh geometry={b.rays} material={b.raysMat} position={[DOME.x, b.domeY, DOME.z]} renderOrder={6} />
      <points geometry={b.embers} material={b.emberMat} renderOrder={6} />
      <mesh ref={bird} geometry={b.birdG} material={b.birdMat} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.stars} />
      <Halos list={b.halos} />
      <Halos list={b.crownLights} />
    </>
  );
}
