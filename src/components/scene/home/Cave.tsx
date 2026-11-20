"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { ARCH, CAVE, PEAK, caveAt, sst } from "./journey";
import { GLSL_HOME_AIR, HOME_U, landH, rng, timed } from "./land";
import { makeRangeMaterial } from "./Mountains";
import { FOREST_K } from "./Woods";

// The mountain at the forest's end, and the way to the painted worlds cut into it (journey.ts).
//
// A great mountain stands out of the foothills; its south face is a cliff, and at the cliff's foot an arch is
// carved: a pointed lancet as tall as a church, framed by four stepped orders of pale stone, wide steps going up
// into it, a carved sun above it whose rays run out across the rock as threads of gold. Inside, the cave goes deep
// into the mountain and is full of light: the gate's veil hangs in it (worlds/common.tsx, look "veil"), the walls
// carry slow veins of light toward the depth, and the far end is the light itself. In the dark of the forest's
// night the arch glows from far off, and a fan of soft rays stands out of it into the air.
//
// The cliff and the arch are one mesh in the cave's own frame (u across, a into the mountain); the mountain behind
// is a heightfield whose front row is the cliff's top edge, drawn with the ranges' own material (so it reads as one
// with them, and the plane flies over it rather than through it: homeGround.ts leaves the doorway itself open).

const G0 = landH(CAVE.x, CAVE.z);
const W = (u: number, y: number, a: number): [number, number, number] => {
  const p = caveAt(u, a);
  return [p.x, y, p.z];
};
// the arch's half-width at a height over the floor (H: the legs' half-width; 0 above the point)
function archHW(H: number, apex: number, y: number) {
  if (y <= ARCH.spring) return H;
  const s = (y - ARCH.spring) / (1.1547 * (apex - ARCH.spring));
  if (s >= 1) return 0;
  return Math.max(0, H * (2 * Math.cos(Math.asin(s)) - 1));
}
// the arch's outline (u, y over the floor), from the left leg's foot over the point to the right leg's foot
function archLine(H: number, apex: number, foot: number, n = 22): [number, number][] {
  const K = 1.1547 * (apex - ARCH.spring);
  const pts: [number, number][] = [[-H, foot]];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 3);
    pts.push([-(H - 2 * H * (1 - Math.cos(a))), ARCH.spring + K * Math.sin(a)]);
  }
  for (let i = n - 1; i >= 0; i--) {
    const a = (i / n) * (Math.PI / 3);
    pts.push([H - 2 * H * (1 - Math.cos(a)), ARCH.spring + K * Math.sin(a)]);
  }
  pts.push([H, foot]);
  return pts;
}

// ---------- the mountain's height (over the cave's floor) at a point of the cave's frame ----------
const R = rng(53);
const PERM = Array.from({ length: 64 }, () => R());
function vn(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const h = (i: number, j: number) => PERM[(((i * 7 + j * 13) % 64) + 64) % 64];
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return h(ix, iy) * (1 - ux) * (1 - uy) + h(ix + 1, iy) * ux * (1 - uy) + h(ix, iy + 1) * (1 - ux) * uy + h(ix + 1, iy + 1) * ux * uy;
}
function ridged(x: number, y: number) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    const n = 1 - Math.abs(vn(x * f, y * f) * 2 - 1);
    v += n * n * a;
    a *= 0.5;
    f *= 2.03;
  }
  return v;
}
// the peak in the cave's frame
const PK = (() => {
  const dx = PEAK.x - CAVE.x;
  const dz = PEAK.z - CAVE.z;
  const c = Math.cos(CAVE.yaw);
  const s = Math.sin(CAVE.yaw);
  return { u: c * dx - s * dz, a: -s * dx - c * dz };
})();
function massH(u: number, a: number) {
  const dome = Math.exp(-(((u - PK.u) / 190) ** 2) - ((a - PK.a) / 215) ** 2);
  const r = ridged(u * 0.011 + 3.1, a * 0.011 - 1.7);
  const gully = vn(u * 0.035 + 9, a * 0.012) * 0.25;
  const h = PEAK.h * Math.pow(dome, 0.85) * (0.72 + 0.42 * r - gully) - 24 * (1 - dome);
  // (where it runs out it dives well under the land: two surfaces a few metres apart flicker from far off)
  return h - 4 - 60 * (1 - sst(0, 30, h));
}
// how far a point of the cliff (u, y over the floor) is from the arch's outline
function archDist(u: number, y: number) {
  if (y <= ARCH.apex) return Math.abs(u) - archHW(ARCH.half, ARCH.apex, y);
  return Math.hypot(u, y - ARCH.apex);
}
// how far back the cliff's face stands at a point: rough rock leaning back, dressed flat round the arch
function cliffA(u: number, y: number) {
  const carved = 1 - sst(16, 34, archDist(u, y));
  const relief = (vn(u * 0.07 + 2, y * 0.07) - 0.5) * 6 + (vn(u * 0.21, y * 0.19 + 5) - 0.5) * 1.6;
  const lean = 0.16 * Math.max(0, y - 4);
  return (relief + lean) * (1 - carved) + 0.0012 * u * u;
}
const faceTop = (u: number) => massH(u, cliffA(u, 40) * 0.5 + 4);

// ---------- building ----------
type Buf = { pos: number[]; loc: number[]; kind: number[]; idx: number[] };
const newBuf = (): Buf => ({ pos: [], loc: [], kind: [], idx: [] });
function vert(b: Buf, p: [number, number, number], loc: [number, number, number], kind: number) {
  b.pos.push(...p);
  b.loc.push(...loc);
  b.kind.push(kind);
  return b.pos.length / 3 - 1;
}
function finish(b: Buf) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute("aLoc", new THREE.Float32BufferAttribute(b.loc, 3));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(b.kind, 1));
  g.setIndex(b.idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
// lines across the cliff: fine round the arch, wider and wider out to the sides
function lines(lo: number, hi: number, fineLo: number, fineHi: number, step: number, grow: number) {
  const out: number[] = [];
  for (let v = fineLo; v <= fineHi + 1e-6; v += step) out.push(v);
  let s = step;
  for (let v = fineHi; v < hi - 1e-6; ) {
    s *= grow;
    v = Math.min(hi, v + s);
    out.push(v);
  }
  s = step;
  for (let v = fineLo; v > lo + 1e-6; ) {
    s *= grow;
    v = Math.max(lo, v - s);
    out.unshift(v);
  }
  return out;
}

function buildCliff() {
  const b = newBuf();
  const us = lines(-210, 210, -26, 26, 1.0, 1.13);
  const ys = lines(-12, 42, -12, 42, 1.0, 1);
  const top = us.map((u) => Math.max(faceTop(u), -14));
  // rows: the fine ones up to 42 m, then fractions toward the top edge (one lattice: no cracks)
  const rows: ((i: number) => number)[] = ys.map((y) => (i: number) => Math.min(y, top[i]));
  for (let k = 1; k <= 12; k++) rows.push((i: number) => Math.min(42 + (k / 12) * (top[i] - 42), top[i]));
  const ids: number[][] = rows.map((row) =>
    us.map((u, i) => {
      const y = row(i);
      const a = cliffA(u, y);
      return vert(b, W(u, G0 + y, a), [u, y, a], archDist(u, y) < 34 ? 1 : 0);
    }),
  );
  for (let j = 0; j < rows.length - 1; j++)
    for (let i = 0; i < us.length - 1; i++) {
      if (top[i] < -4 && top[i + 1] < -4) continue;
      // the arch's opening (the innermost order of stone covers the cut's ragged edge)
      const cu = (us[i] + us[i + 1]) / 2;
      const cy = (rows[j](i) + rows[j + 1](i)) / 2;
      if (archDist(cu, cy) < 0.3 && cy < ARCH.apex + 1) continue;
      const a = ids[j][i];
      const bb = ids[j][i + 1];
      const c = ids[j + 1][i + 1];
      const d = ids[j + 1][i];
      b.idx.push(a, bb, c, a, c, d);
    }
  return finish(b);
}

// the mountain behind the cliff: its front row is the cliff's top edge
function buildMass() {
  const pos: number[] = [];
  const idx: number[] = [];
  const us = lines(-330, 330, -26, 26, 1.0, 1.13).filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
  const as: number[] = [];
  for (let a = 0, s = 3; a < 600; a += s, s = Math.min(14, s * 1.08)) as.push(a);
  for (let j = 0; j < as.length; j++)
    for (const u of us) {
      const t = Math.max(faceTop(u), -14);
      const a0 = cliffA(u, t);
      const a = j === 0 ? a0 : a0 + as[j];
      const y = j === 0 ? t : Math.max(massH(u, a), t - 6 * j);
      pos.push(...W(u, G0 + y, a));
    }
  const row = us.length;
  for (let j = 0; j < as.length - 1; j++)
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// the orders of the arch, the steps, the cave's walls, its floor and its far end
const FLOOR_Y = -0.6 + 8 * 0.27;
function buildArch() {
  const b = newBuf();
  const quad = (p: [number, number, number][], loc: [number, number, number][], kind: number) => {
    const i = p.map((q, k) => vert(b, q, loc[k], kind));
    b.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]);
  };
  // four orders of stone, each standing further out from the cliff the nearer it is to the opening
  for (let k = 0; k < 4; k++) {
    const hin = ARCH.half - 0.5 + k * 1.7;
    const hout = hin + 1.7 + (k === 3 ? 0.6 : 0);
    const apexIn = ARCH.apex + k * 2.6 - 0.8;
    const apexOut = apexIn + 2.6 + (k === 3 ? 0.9 : 0);
    const front = -(3.4 - k * 0.8);
    const back = 0.8;
    const inner = archLine(hin, apexIn, -2.5);
    const outer = archLine(hout, apexOut, -2.5);
    const kind = 2 + k * 0.1;
    for (let i = 0; i < inner.length - 1; i++) {
      const [u0, y0] = inner[i];
      const [u1, y1] = inner[i + 1];
      const [U0, Y0] = outer[i];
      const [U1, Y1] = outer[i + 1];
      quad([W(u0, G0 + y0, front), W(U0, G0 + Y0, front), W(U1, G0 + Y1, front), W(u1, G0 + y1, front)], [[u0, y0, front], [U0, Y0, front], [U1, Y1, front], [u1, y1, front]], kind);
      quad([W(u0, G0 + y0, back), W(u0, G0 + y0, front), W(u1, G0 + y1, front), W(u1, G0 + y1, back)], [[u0, y0, back], [u0, y0, front], [u1, y1, front], [u1, y1, back]], kind);
      quad([W(U0, G0 + Y0, front), W(U0, G0 + Y0, back), W(U1, G0 + Y1, back), W(U1, G0 + Y1, front)], [[U0, Y0, front], [U0, Y0, back], [U1, Y1, back], [U1, Y1, front]], kind);
    }
  }
  // steps up into the cave
  for (let i = 0; i < 8; i++) {
    const a0 = -18 + i * 2.2;
    const a1 = a0 + 2.2;
    const y = -0.6 + (i + 1) * 0.27;
    const hw = ARCH.half + 6 - i * 0.6;
    quad([W(-hw, G0 + y, a0), W(hw, G0 + y, a0), W(hw, G0 + y, a1 + 0.02), W(-hw, G0 + y, a1 + 0.02)], [[-hw, y, a0], [hw, y, a0], [hw, y, a1], [-hw, y, a1]], 3);
    quad([W(-hw, G0 + y - 1.5, a0), W(hw, G0 + y - 1.5, a0), W(hw, G0 + y, a0), W(-hw, G0 + y, a0)], [[-hw, y - 1.5, a0], [hw, y - 1.5, a0], [hw, y, a0], [-hw, y, a0]], 3);
    for (const s of [-1, 1]) quad([W(s * hw, G0 + y - 1.6, a0), W(s * hw, G0 + y - 1.6, a1), W(s * hw, G0 + y, a1), W(s * hw, G0 + y, a0)], [[s * hw, y - 1.6, a0], [s * hw, y - 1.6, a1], [s * hw, y, a1], [s * hw, y, a0]], 3);
  }
  // the cave: the arch's own shape carried deep into the mountain, its floor, the light at its end
  const prof = archLine(ARCH.half, ARCH.apex, FLOOR_Y - 0.05, 18);
  const as: number[] = [];
  for (let a = -0.2; a < ARCH.depth; a += 6) as.push(a);
  as.push(ARCH.depth);
  for (let j = 0; j < as.length - 1; j++) {
    for (let i = 0; i < prof.length - 1; i++) {
      const [u0, y0] = prof[i];
      const [u1, y1] = prof[i + 1];
      quad([W(u0, G0 + y0, as[j]), W(u1, G0 + y1, as[j]), W(u1, G0 + y1, as[j + 1]), W(u0, G0 + y0, as[j + 1])], [[u0, y0, as[j]], [u1, y1, as[j]], [u1, y1, as[j + 1]], [u0, y0, as[j + 1]]], 4);
    }
    quad([W(-ARCH.half, G0 + FLOOR_Y, as[j]), W(-ARCH.half, G0 + FLOOR_Y, as[j + 1]), W(ARCH.half, G0 + FLOOR_Y, as[j + 1]), W(ARCH.half, G0 + FLOOR_Y, as[j])], [[-ARCH.half, FLOOR_Y, as[j]], [-ARCH.half, FLOOR_Y, as[j + 1]], [ARCH.half, FLOOR_Y, as[j + 1]], [ARCH.half, FLOOR_Y, as[j]]], 5);
  }
  const end = prof.map(([u, y]) => vert(b, W(u * 1.01, G0 + y, ARCH.depth), [u, y, ARCH.depth], 6));
  const mid = vert(b, W(0, G0 + ARCH.spring, ARCH.depth), [0, ARCH.spring, ARCH.depth], 6);
  for (let i = 0; i < end.length - 1; i++) b.idx.push(mid, end[i], end[i + 1]);
  return finish(b);
}

// a fan of soft rays standing out of the arch into the air
function buildRays() {
  const r = rng(61);
  const pos: number[] = [];
  const ray: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < 15; i++) {
    const th = -0.1 + (i / 14) * (Math.PI + 0.2) + (r() - 0.5) * 0.08;
    const len = 45 + r() * 55;
    const w1 = 7 + r() * 8;
    const dx = Math.cos(th);
    const dy = Math.sin(th);
    const p = (t: number, s: number): [number, number, number] => {
      const w = 2.5 + (w1 - 2.5) * t;
      return W(dx * (10 + len * t) - dy * w * s, G0 + ARCH.spring + 6 + dy * (10 + len * t) + dx * w * s, -14 - 10 * t);
    };
    const base = pos.length / 3;
    for (const [t, s] of [
      [0, -1],
      [0, 1],
      [1, 1],
      [1, -1],
    ]) {
      pos.push(...p(t, s));
      ray.push(t, s, i + r());
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aRay", new THREE.Float32BufferAttribute(ray, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const LEAD = new THREE.Color(1.0, 0.82, 0.5);
const f2 = (n: number) => n.toFixed(2);

function makeStoneMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...HOME_U, uNightK: FOREST_K.night, uLead: { value: LEAD } },
    vertexShader: /* glsl */ `
      attribute vec3 aLoc; attribute float aKind;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vLoc; varying float vKind;
      void main(){
        vWorld = position; vN = normal; vLoc = aLoc; vKind = aKind;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNightK; uniform vec3 uLead;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vLoc; varying float vKind;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      // how far a point of the cliff (u, y over the floor) is from the arch's outline
      float archD(vec2 q){
        float K = 1.1547 * (${f2(ARCH.apex)} - ${f2(ARCH.spring)});
        float hw = q.y <= ${f2(ARCH.spring)} ? ${f2(ARCH.half)} : ${f2(ARCH.half)} * (2.0 * cos(asin(clamp((q.y - ${f2(ARCH.spring)}) / K, 0.0, 1.0))) - 1.0);
        return q.y <= ${f2(ARCH.apex)} ? abs(q.x) - hw : length(q - vec2(0.0, ${f2(ARCH.apex)}));
      }
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        float kind = vKind;
        vec2 q = vLoc.xy;
        vec2 fw2 = fwidth(q); float fw = max(max(fw2.x, fw2.y), fwidth(vLoc.z));
        float fine = 1.0 - smoothstep(0.06, 0.25, fw);
        float night = max(uNight, uNightK);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        // the rock: the ranges' colours (dark lilac-grey, ochre beds), its grain
        float strata = vnoise(vec2(vWorld.y * 0.06 + fbm(vWorld.xz * 0.02) * 2.0, vWorld.x * 0.004));
        vec3 rock = mix(vec3(0.075, 0.07, 0.085), vec3(0.2, 0.165, 0.135), strata) * (0.8 + 0.4 * fbm(vWorld.xz * 0.15 + vWorld.y * 0.1));
        // the carved stone: pale and warm, laid in courses, worn
        vec2 bq = vec2(q.x + vLoc.z * 0.6 + floor(q.y / 0.7) * 0.55, q.y);
        vec2 bf = fract(bq / vec2(1.4, 0.7));
        float joint = smoothstep(0.0, 0.06, min(min(bf.x, 1.0 - bf.x), min(bf.y, 1.0 - bf.y) * 2.0));
        vec3 stone = vec3(0.42, 0.38, 0.36) * (0.85 + 0.25 * hash12(floor(bq / vec2(1.4, 0.7)))) * mix(1.0, mix(0.72, 1.0, joint), fine);
        stone *= 0.85 + 0.25 * vnoise(q * 0.4);
        float d = archD(q);
        vec3 alb = rock;
        float glow = 0.0;
        if (kind > 0.5 && kind < 1.5) {
          // the cliff round the arch: the rock dressed smooth as it nears the opening
          alb = mix(stone * vec3(0.95, 0.92, 0.95), rock, smoothstep(14.0, 32.0, d));
          // the carved sun over the point, and its rays running out through the stone as threads of light
          vec2 c = q - vec2(0.0, ${(ARCH.apex + 15).toFixed(1)});
          float r = length(c);
          float aa = fw * 1.5;
          float ring = (1.0 - smoothstep(0.14, 0.14 + aa, abs(r - 6.0))) + (1.0 - smoothstep(0.1, 0.1 + aa, abs(r - 4.2))) * 0.7 + (1.0 - smoothstep(2.6, 2.6 + aa, r));
          float th = atan(c.y, c.x);
          // (distance in metres from the nearest of 24 rays)
          float dr = abs(fract(th * 24.0 / 6.2832 + 0.5) - 0.5) * 6.2832 / 24.0 * r;
          float rays = (1.0 - smoothstep(0.18, 0.18 + aa * 2.0, dr)) * smoothstep(7.5, 9.0, r) * (1.0 - smoothstep(16.0, 30.0, r)) * step(-5.0, c.y);
          float flow = 0.55 + 0.45 * sin(r * 0.5 - uTime * 1.2);
          ring = clamp(ring, 0.0, 1.0);
          alb *= 1.0 - 0.35 * ring * fine;
          glow += (ring * mix(0.5, 1.0, fine) + rays * flow * fine) * (0.15 + 0.9 * night);
        } else if (kind > 1.5 && kind < 2.95) {
          // the orders of the arch: dressed stone, paler outward
          alb = stone * (1.0 + (kind - 2.0) * 0.4);
        } else if (kind > 2.95 && kind < 3.5) {
          alb = stone * 0.92;
        } else if (kind > 3.5 && kind < 4.5) {
          // the cave's walls: dark rock, veins of light flowing in toward the depth
          alb = rock * 0.8;
          float vein = vnoise(vec2(q.x * 0.35 + q.y * 0.2, vLoc.z * 0.06 - uTime * 0.25)) * 0.6 + vnoise(vec2(q.y * 0.5, vLoc.z * 0.12 - uTime * 0.4)) * 0.4;
          glow += pow(1.0 - abs(vein - 0.5) * 2.0, 10.0) * (0.35 + 0.65 * smoothstep(0.0, ${ARCH.depth.toFixed(1)}, vLoc.z)) * 1.2;
        } else if (kind > 4.5 && kind < 5.5) {
          alb = stone * 0.7;
        }
        // the cave's light falls out over everything near the opening, warmer and stronger at night
        float into = clamp(vLoc.z / ${ARCH.depth.toFixed(1)}, 0.0, 1.0);
        float inside = (kind > 3.5 && kind < 5.5) ? 1.0 : 0.0;
        float near = exp(-max(d, 0.0) / 9.0);
        float caveL = inside > 0.5 ? 0.25 + 0.9 * into * into : near * 0.6;
        float ndl = max(dot(n, uKeyDir), 0.0);
        vec3 col = alb * (uSkyCol * (0.6 + 0.4 * n.y) + uKeyCol * ndl * 0.9 * sunUp * cloudShade(vWorld));
        col += alb * uLead * caveL * (0.5 + 1.2 * night);
        col += uLead * glow * 1.6;
        if (kind > 5.5) col = mix(uLead * 1.4, vec3(1.0, 0.95, 0.85) * 2.0, smoothstep(0.0, 1.0, 1.0 - length(q - vec2(0.0, ${f2(ARCH.spring)})) / 20.0));
        // (inside the cave there is no air of the land; outside it is the land's)
        col = mix(homeAir(col, vWorld), col, kind > 3.5 ? smoothstep(4.0, 20.0, vLoc.z) : 0.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function makeRayMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, uNightK: FOREST_K.night, uLead: { value: LEAD } },
    vertexShader: /* glsl */ `
      attribute vec3 aRay; varying vec3 vRay; varying vec3 vWorld;
      void main(){ vRay = aRay; vWorld = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uNightK; uniform vec3 uLead; uniform float uTime; uniform float uNight;
      varying vec3 vRay; varying vec3 vWorld;
      void main(){
        float t = vRay.x;
        float a = pow(1.0 - abs(vRay.y), 2.6) * (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.15, t);
        // each ray breathes on its own, slowly
        a *= 0.55 + 0.45 * sin(uTime * 0.35 + vRay.z * 2.3);
        float night = max(uNight, uNightK);
        // (only after dusk, and only near: from far off they would be thin lines fighting the rock for depth)
        float dist = length(vWorld - cameraPosition);
        a *= 0.2 * smoothstep(0.3, 0.9, night) * smoothstep(10.0, 60.0, dist) * (1.0 - smoothstep(240.0, 380.0, dist));
        gl_FragColor = vec4(uLead * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function Cave() {
  const m = useMemo(
    () =>
      timed("cave", () => ({
        cliff: buildCliff(),
        mass: buildMass(),
        arch: buildArch(),
        rays: buildRays(),
        mat: makeStoneMaterial(),
        massMat: makeRangeMaterial({ r0: 0, r1: 0, height: PEAK.h, freq: 0, seed: 0, haze: 0, snow: 0.22, pass: [0, 0], span: [0, 0], massif: 0 }),
        rayMat: makeRayMaterial(),
      })),
    [],
  );
  useEffect(
    () => () => {
      for (const x of [m.cliff, m.mass, m.arch, m.rays, m.mat, m.massMat, m.rayMat]) x.dispose();
    },
    [m],
  );
  return (
    <>
      <mesh geometry={m.mass} material={m.massMat} />
      <mesh geometry={m.cliff} material={m.mat} />
      <mesh geometry={m.arch} material={m.mat} />
      <mesh geometry={m.rays} material={m.rayMat} renderOrder={6} />
    </>
  );
}
