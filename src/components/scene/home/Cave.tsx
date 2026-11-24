"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { ARCH, CAVE, GATE_NARROW, MOUTH, PEAK, archHW, caveAt, sst } from "./journey";
import { GLSL_HOME_AIR, HOME_U, landH, rng, timed } from "./land";
import { MAIN_RANGE, makeRangeMaterial } from "./Mountains";
import { FOREST_K } from "./Woods";

// The mountain at the forest's end, and the cave in it (journey.ts).
//
// A great mountain stands out of the foothills, its south face a cliff of rough rock, and at the cliff's foot the
// dark mouth of a cave with a little warm light far inside it. The plane flies in: the rock closes round, the
// cave opens into a high chamber, and there, carved out of the living rock, stands a pointed arch of four stepped
// orders, and in it the way to the painted worlds: the gate's veil of light (worlds/common.tsx, look "veil"), the
// next world faintly seen through it, its light falling warm over the chamber's walls, motes of light drifting.
//
// All of it is built in the cave's own frame (u across, a into the mountain, y over the land at the mouth). The
// mountain behind the cliff is a heightfield whose front row is the cliff's top edge, drawn with the ranges' own
// material, so it reads as one with them and the plane flies over it rather than through it (homeGround.ts leaves
// the cave itself open).

const G0 = landH(CAVE.x, CAVE.z);
const FLOOR = CAVE.floor;
const W = (u: number, y: number, a: number): [number, number, number] => {
  const p = caveAt(u, a);
  return [p.x, G0 + y, p.z];
};

// ---------- noise ----------
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

// ---------- the mountain ----------
const PK = (() => {
  const dx = PEAK.x - CAVE.x;
  const dz = PEAK.z - CAVE.z;
  const c = Math.cos(CAVE.yaw);
  const s = Math.sin(CAVE.yaw);
  return { u: c * dx - s * dz, a: -s * dx - c * dz };
})();
function massH(u: number, a: number) {
  const dome = Math.exp(-(((u - PK.u) / 190) ** 2) - ((a - PK.a) / 215) ** 2);
  // (ridges and gullies on the ranges' own scale, hundreds of metres across: finer and the walls go sheer)
  const r = ridged(u * 0.0045 + 3.1, a * 0.0045 - 1.7);
  const gully = vn(u * 0.012 + 9, a * 0.005) * 0.25;
  const h = PEAK.h * Math.pow(dome, 0.85) * (0.72 + 0.42 * r - gully) - 24 * (1 - dome);
  // (where it runs out it dives well under the land: two surfaces a few metres apart flicker from far off)
  return h - 4 - 60 * (1 - sst(0, 30, h));
}

// ---------- the mouth: the gate's own pointed arch, as rock wears it: a natural lancet, a little rough ----------
const MID = 14;
function mouthHW(y: number) {
  // (the roughness is broad and slow, never a zigzag: the edge is worn, not chipped)
  const n = (vn(y * 0.22 + 4, 1.3) - 0.5) * 1.6 + (vn(y * 0.5, 7.7) - 0.5) * 0.5;
  const t = Math.min(1, Math.max(0, (y - ARCH.spring) / (MOUTH.top - ARCH.spring)));
  return Math.max(0, archHW(y) + n * (1 - t) * 0.8 + 0.8 * (1 - sst(-4, 4, y)));
}
function mouthDist(u: number, y: number) {
  if (y < MOUTH.top) return Math.abs(u) - mouthHW(y);
  return Math.hypot(u, y - MOUTH.top);
}
// the outline of the mouth (u, y), from the left foot over the top to the right foot
function mouthLine(n = 60): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const y = -3 + (MOUTH.top + 3) * Math.sin((i / n) * Math.PI * 0.5);
    out.push([-mouthHW(y), y]);
  }
  for (let i = n - 1; i >= 0; i--) {
    const y = -3 + (MOUTH.top + 3) * Math.sin((i / n) * Math.PI * 0.5);
    out.push([mouthHW(y), y]);
  }
  return out;
}
// how far back the cliff stands at a point: rough rock leaning back, curling in toward the mouth
function cliffA(u: number, y: number) {
  // (broad buttresses and gullies running down it, as the ranges' faces have them, kept off the mouth's own rim)
  const gully = (ridged(u * 0.022 + 7, y * 0.012) - 0.55) * 26 * sst(10, 34, mouthDist(u, y)) * sst(6, 26, y);
  const relief = (vn(u * 0.07 + 2, y * 0.07) - 0.5) * 6 + (vn(u * 0.21, y * 0.19 + 5) - 0.5) * 1.8 + gully;
  // (the face leans back, and more as it climbs, curving into the mountain's own slope: no brow where it ends)
  const lean = 0.16 * Math.max(0, y - 4) + 0.0042 * Math.max(0, y - 24) ** 2;
  const curl = 3.5 * Math.exp(-Math.max(0, mouthDist(u, y)) / 7);
  return relief + lean + curl + 0.0012 * u * u;
}
const faceTop = (u: number) => massH(u, cliffA(u, 40) * 0.5 + 4);

// ---------- building ----------
type Buf = { pos: number[]; loc: number[]; kind: number[]; idx: number[] };
const newBuf = (): Buf => ({ pos: [], loc: [], kind: [], idx: [] });
function vert(b: Buf, u: number, y: number, a: number, kind: number) {
  b.pos.push(...W(u, y, a));
  b.loc.push(u, y, a);
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
// lines across the cliff: fine round the mouth, wider and wider out to the sides
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
  const us = lines(-210, 210, -30, 30, 1.0, 1.13);
  const ys = lines(-12, 44, -12, 44, 1.0, 1);
  const top = us.map((u) => Math.max(faceTop(u), -14));
  // rows: the fine ones, then fractions toward the top edge (one lattice: no cracks)
  const rows: ((i: number) => number)[] = ys.map((y) => (i: number) => Math.min(y, top[i]));
  for (let k = 1; k <= 12; k++) rows.push((i: number) => Math.min(44 + (k / 12) * (top[i] - 44), top[i]));
  // where rows run into the top edge they share one vertex per column, and squashed quads are left out
  const topId: (number | undefined)[] = [];
  const at = (u: number, y: number, i: number) => {
    if (y >= top[i] - 1e-4) return (topId[i] ??= vert(b, u, top[i], cliffA(u, top[i]), 0));
    return vert(b, u, y, cliffA(u, y), 0);
  };
  const ids: number[][] = rows.map((row) => us.map((u, i) => at(u, row(i), i)));
  for (let j = 0; j < rows.length - 1; j++)
    for (let i = 0; i < us.length - 1; i++) {
      if (top[i] < -4 && top[i + 1] < -4) continue;
      if (ids[j][i] === ids[j + 1][i] && ids[j][i + 1] === ids[j + 1][i + 1]) continue;
      // the mouth (the rock lip round it covers the cut's ragged edge)
      const cu = (us[i] + us[i + 1]) / 2;
      const cy = (rows[j](i) + rows[j + 1](i)) / 2;
      if (mouthDist(cu, cy) < 0.4 && cy < MOUTH.top + 1) continue;
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
  // (the cliff's own columns, so its top edge and the mountain's front row are the same vertices; rows deep enough
  // that its outline against the sky is a ridge, not a row of facets)
  const us = lines(-330, 330, -30, 30, 1.0, 1.13);
  const as: number[] = [];
  for (let a = 0, s = 2; a < 600; a += s, s = Math.min(5, s * 1.03)) as.push(a);
  for (let j = 0; j < as.length; j++)
    for (const u of us) {
      const t = Math.max(faceTop(u), -14);
      const a0 = cliffA(u, t);
      const a = a0 + as[j];
      // (from the cliff's top the surface climbs smoothly into the mountain's own height, over a hundred metres or so:
      // not a wall where the cliff ends and the mountain, far higher, begins)
      const mh = massH(u, a);
      const y = j === 0 ? t : mh >= t ? t + (mh - t) * sst(0, 110, as[j]) : Math.max(mh, t - 6 * j);
      pos.push(...W(u, y, a));
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

// how wide the cave is at a depth, against its mouth: it narrows, then opens into the high chamber, then closes
const caveScale = (a: number) => 1 - (1 - GATE_NARROW) * sst(0, CAVE.gateIn, a) + 0.3 * sst(CAVE.gateIn + 8, CAVE.gateIn + 30, a) - 0.9 * sst(86, MOUTH.depth, a);

function buildCave() {
  const b = newBuf();
  const quad = (i0: number, i1: number, i2: number, i3: number) => b.idx.push(i0, i1, i2, i0, i2, i3);
  // the lip of rock round the mouth: a rough roll that stands a little out of the cliff
  const line = mouthLine(120);
  const SIDES = 12;
  const rim: number[][] = [];
  line.forEach(([u, y], i) => {
    const p = line[Math.max(0, i - 1)];
    const q = line[Math.min(line.length - 1, i + 1)];
    let nu = -(q[1] - p[1]);
    let ny = q[0] - p[0];
    const L = Math.hypot(nu, ny) || 1;
    nu /= L;
    ny /= L;
    // (the normal points out of the opening)
    if (nu * u + ny * (y - MID) < 0) {
      nu = -nu;
      ny = -ny;
    }
    const rad = 1.6 + 1.2 * vn(i * 0.09, 3.1);
    const ring: number[] = [];
    for (let k = 0; k < SIDES; k++) {
      const th = (k / SIDES) * Math.PI * 2;
      const out = 0.7 + rad * Math.cos(th);
      ring.push(vert(b, u + nu * out, y + ny * out, cliffA(u, y) - 0.8 + rad * 1.2 * Math.sin(th), 0));
    }
    rim.push(ring);
  });
  for (let i = 0; i < rim.length - 1; i++) for (let k = 0; k < SIDES; k++) quad(rim[i][k], rim[i][(k + 1) % SIDES], rim[i + 1][(k + 1) % SIDES], rim[i + 1][k]);
  // the cave: the mouth's outline carried in, rough, narrowing and opening into the chamber; its far end the light
  // (fine rings and many points round each: the rock between the lip and the gate is seen close, and must be smooth)
  const prof = mouthLine(56);
  const as: number[] = [];
  for (let a = -0.5; a < CAVE.gateIn + 16; a += 1.25) as.push(a);
  for (let a = CAVE.gateIn + 16; a < MOUTH.depth; a += 4) as.push(a);
  as.push(MOUTH.depth);
  const rings = as.map((a) => {
    const sc = Math.max(0.12, caveScale(a));
    return prof.map(([u, y], i) => {
      const ny = Math.max(y, FLOOR - 0.2);
      // (broad swellings of the rock, smooth along and round the passage)
      const s = i / prof.length;
      const rough = (vn(s * 9 + a * 0.05, a * 0.04 + 2) - 0.5) * 1.4 + (vn(s * 21 + 4, a * 0.12) - 0.5) * 0.35;
      const k = 1 + rough / Math.max(10, Math.hypot(u, ny - FLOOR));
      // (the passage begins inside the cliff's face, which leans back: where the face stands deeper than this ring,
      // the ring is drawn at the face, so no shell of the passage stands out of the rock in front of it)
      return vert(b, u * sc * k, FLOOR - 0.2 + (ny - FLOOR + 0.2) * sc * k, Math.max(a, Math.min(CAVE.gateIn - 1.5, cliffA(u, y) - 1.5)), 4);
    });
  });
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < prof.length - 1; i++) quad(rings[j][i], rings[j][i + 1], rings[j + 1][i + 1], rings[j + 1][i]);
  const last = rings[rings.length - 1];
  const mid = vert(b, 0, FLOOR + 4, MOUTH.depth + 2, 6);
  for (let i = 0; i < last.length - 1; i++) b.idx.push(mid, last[i], last[i + 1]);
  // the floor: worn rock, a low threshold at the mouth
  const fa: number[] = [];
  for (let a = -9; a <= MOUTH.depth; a += a < CAVE.gateIn + 16 ? 1.25 : 4) fa.push(a);
  const floor = fa.map((a) => {
    const hw = (MOUTH.half + 2.5) * Math.max(0.3, caveScale(Math.max(a, 0)));
    const y = a < 0 ? -0.6 + (FLOOR + 0.6) * sst(-9, 0, a) : FLOOR;
    return [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map((s) => vert(b, s * hw, y + (vn(s * 3 + 5, a * 0.15) - 0.5) * 0.2 * sst(-2, 4, a), a, 5));
  });
  for (let j = 0; j < floor.length - 1; j++) for (let i = 0; i < 8; i++) quad(floor[j][i], floor[j + 1][i], floor[j + 1][i + 1], floor[j][i + 1]);
  // the carved frame round the portal: four orders of stone standing out of the rock, each a step further in
  const archLine = (H: number, apex: number, foot: number, n = 22): [number, number][] => {
    const K = 1.1547 * (apex - ARCH.spring);
    const pts: [number, number][] = [[-H, foot]];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * (Math.PI / 3);
      pts.push([-(H - 2 * H * (1 - Math.cos(t))), ARCH.spring + K * Math.sin(t)]);
    }
    for (let i = n - 1; i >= 0; i--) {
      const t = (i / n) * (Math.PI / 3);
      pts.push([H - 2 * H * (1 - Math.cos(t)), ARCH.spring + K * Math.sin(t)]);
    }
    pts.push([H, foot]);
    return pts;
  };
  // (no frame round the way on: the cave simply goes deeper, and the next world's own tunnel is seen through it)
  return finish(b);
}

// from far off the mouth is backed by one dark warm sheet a few metres in (the cave itself is not drawn there)
function buildPlug() {
  const b = newBuf();
  const line = mouthLine(30);
  const c = vert(b, 0, MOUTH.top * 0.4, CAVE.gateIn + 1.5, 4);
  const ids = line.map(([u, y]) => vert(b, u * 1.08, Math.max(y, FLOOR - 0.5), CAVE.gateIn + 1.5, 4));
  for (let i = 0; i < ids.length - 1; i++) b.idx.push(c, ids[i], ids[i + 1]);
  b.idx.push(c, ids[ids.length - 1], ids[0]);
  return finish(b);
}

// light drifting in the chamber: soft motes that rise and wander, warm
function buildMotes(count: number) {
  const r = rng(808);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = -3 + r() * (CAVE.gateIn - 4);
    const sc = caveScale(a);
    at.set([...W((r() - 0.5) * 2 * MOUTH.half * sc * 0.8, FLOOR + 1 + r() * MOUTH.top * sc * 0.75, a), r() * 100], i * 4);
  }
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...W(0, 20, 4)), 40);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; varying vec2 vUv; varying float vK;
      uniform float uTime;
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float ph = aAt.w;
        float t = uTime * 0.12;
        vec3 c = aAt.xyz + vec3(sin(t + ph) * 2.5, mod(uTime * 0.6 + ph * 3.0, 14.0) - 7.0, cos(t * 0.8 + ph) * 2.5);
        float dist = length(c - cameraPosition);
        float grow = max(1.0, dist * 0.01);
        vK = (0.55 + 0.45 * sin(uTime * 1.3 + ph * 5.0)) / grow * smoothstep(3.0, 10.0, dist);
        vUv = position.xy;
        gl_Position = projectionMatrix * viewMatrix * vec4(c + (R * position.x + U * position.y) * 0.22 * grow, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vK;
      void main(){
        float r = length(vUv);
        float a = (exp(-r * r * 8.0) * 0.9 + exp(-r * r * 2.2) * 0.3) * (1.0 - smoothstep(0.7, 1.0, r)) * vK;
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.5) * 1.6 * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m };
}

const LEAD = new THREE.Color(1.0, 0.8, 0.5);
// Behind the veil, the world beyond: layered sheets of slow flowing light, gold going to rose, each further in and
// moving at its own pace, so the portal has depth and life when looked into.
function buildBeyond() {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const quad = (p: [number, number, number][], q: [number, number, number][]) => {
    const b = pos.length / 3;
    p.forEach((v, i) => {
      pos.push(...v);
      uv.push(...q[i]);
    });
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const H = ARCH.half * 1.15;
  const top = ARCH.apex + 3;
  for (let k = 0; k < 5; k++) {
    const a = CAVE.gateIn + 2.5 + k * 7;
    quad([W(-H, FLOOR - 0.5, a), W(H, FLOOR - 0.5, a), W(H, top, a), W(-H, top, a)], [[-H, FLOOR - 0.5, k], [H, FLOOR - 0.5, k], [H, top, k], [-H, top, k]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
function makeBeyondMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, uNightK: FOREST_K.night },
    vertexShader: /* glsl */ `
      attribute vec3 aUv; varying vec3 vUv; varying vec3 vWorld;
      void main(){ vUv = aUv; vWorld = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uNightK;
      varying vec3 vUv; varying vec3 vWorld;
      ${GLSL_NOISE}
      void main(){
        float dist = length(vWorld - cameraPosition);
        // (seen only from in front of the mountain and inside it: from far off it would be a sliver fighting the rock)
        float near = (1.0 - smoothstep(55.0, 115.0, dist)) * exp(-dist * 0.006);
        if (vUv.z < 9.5) {
          float k = vUv.z;
          vec2 p = vUv.xy;
          // inside the arch's outline (a little soft): the sheet is only seen through the opening
          float K = 1.1547 * (${f2(ARCH.apex)} - ${f2(ARCH.spring)});
          float hw = p.y <= ${f2(ARCH.spring)} ? ${f2(ARCH.half)} : ${f2(ARCH.half)} * (2.0 * cos(asin(clamp((p.y - ${f2(ARCH.spring)}) / K, 0.0, 1.0))) - 1.0);
          float inside = 1.0 - smoothstep(-2.0, 1.5, abs(p.x) - hw * (1.05 + k * 0.05));
          float t = uTime * (0.05 + k * 0.015);
          vec2 q = p * (0.06 + k * 0.012) + vec2(k * 3.7, -t);
          vec2 w = vec2(fbm(q + vec2(t * 0.6, 0.0)), fbm(q + vec2(5.2, t * 0.4)));
          float n = fbm(q * 1.6 + w * 2.2 + vec2(0.0, -t * 1.5));
          float veins = pow(1.0 - abs(n - 0.5) * 2.0, 6.0);
          vec3 gold = vec3(1.0, 0.78, 0.42);
          vec3 rose = vec3(1.0, 0.55, 0.5);
          vec3 col = mix(gold, rose, smoothstep(0.3, 0.8, w.x)) * (0.18 + 0.55 * veins) * (1.0 - k * 0.12);
          // brightest low and in the middle, where the way goes
          col *= 0.6 + 0.6 * exp(-pow((p.y - ${f2(ARCH.spring)}) / 12.0, 2.0));
          gl_FragColor = vec4(col * inside * near * 0.38, 1.0);
        } else {
          // a shaft: soft across, fading out toward the mouth, breathing slowly
          float a = pow(1.0 - abs(vUv.x), 2.4) * (1.0 - vUv.y) * smoothstep(0.0, 0.12, vUv.y);
          a *= 0.55 + 0.45 * sin(uTime * 0.4 + vUv.z * 1.7);
          a *= smoothstep(3.0, 14.0, dist) * near;
          gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * a * (0.06 + 0.06 * uNightK), 1.0);
        }
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

const f2 = (n: number) => n.toFixed(2);

// the cliff's top edge and the mountain's front row are the same line of points; their normals are taken together
// there (each mesh alone would give the edge its own, a crease the light shows as a hard seam)
function joinSeam(cliff: THREE.BufferGeometry, mass: THREE.BufferGeometry) {
  const key = (a: THREE.BufferAttribute, i: number) => `${a.getX(i).toFixed(2)},${a.getY(i).toFixed(2)},${a.getZ(i).toFixed(2)}`;
  const cp = cliff.attributes.position as THREE.BufferAttribute;
  const cn = cliff.attributes.normal as THREE.BufferAttribute;
  const mp = mass.attributes.position as THREE.BufferAttribute;
  const mn = mass.attributes.normal as THREE.BufferAttribute;
  const at = new Map<string, number>();
  for (let i = 0; i < mp.count; i++) at.set(key(mp, i), i);
  const v = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++) {
    const j = at.get(key(cp, i));
    if (j === undefined) continue;
    v.set(cn.getX(i) + mn.getX(j), cn.getY(i) + mn.getY(j), cn.getZ(i) + mn.getZ(j)).normalize();
    cn.setXYZ(i, v.x, v.y, v.z);
    mn.setXYZ(j, v.x, v.y, v.z);
  }
  return { cliff, mass };
}

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
      void main(){
        // (a squashed triangle has no normal: normalize(0) is NaN and drew as black)
        vec3 n = dot(vN, vN) > 1e-10 ? normalize(vN) : vec3(0.0, 0.0, -1.0);
        if (!gl_FrontFacing) n = -n;
        float kind = vKind;
        vec3 L = vLoc;
        vec2 fw2 = fwidth(L.xy); float fw = max(max(fw2.x, fw2.y), fwidth(L.z));
        float fine = 1.0 - smoothstep(0.08, 0.3, fw);
        float night = max(uNight, uNightK);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        // the rock: the ranges' colours (dark lilac-grey, ochre beds), cracked and grained
        vec3 P = vWorld * vec3(1.0, 1.0, 1.0);
        // (the ranges' strata, in the same world units: their beds 9 / 330 to the metre)
        float strata = vnoise(vec2(P.y * ${(9 / MAIN_RANGE.height).toFixed(5)} + fbm(P.xz * ${(14 / MAIN_RANGE.height).toFixed(5)}) * 2.0, P.x * 0.004));
        float grain = fbm(P.xz * 0.15 + P.y * 0.12) * 0.6 + fbm(vec2(P.x + P.z, P.y) * 0.5) * 0.4 * mix(0.5, 1.0, fine);
        vec3 rock = mix(vec3(0.075, 0.07, 0.085), vec3(0.2, 0.165, 0.135), strata) * (0.75 + 0.5 * grain);
        // out in the daylight the cliff is the pale weathered rock of the ranges seen across the land (as a sheer
        // face turned from the low sun it otherwise read as a black cut-out); in the cave it stays dark
        // (the cliff face and the lip round the mouth are kind 0: always out in the land's light and air, however far
        // back the rock leans; only the cave's own walls, floor and carving are inside)
        float caveIn = kind < 0.5 ? 0.0 : smoothstep(-2.0, 6.0, L.z);
        // (pale weathered rock by day; by night the face is dark, only the portal's glow on it)
        // (out in the land the rock is the ranges' own rock, lit and hazed as they are, below)
        vec3 alb = rock;
        if (kind > 1.5 && kind < 2.95) {
          // the carved orders: pale stone, cut clean, a little paler outward, worn
          alb = vec3(0.4, 0.37, 0.36) * (1.0 + (kind - 2.0) * 0.35) * (0.85 + 0.25 * vnoise(L.xy * 0.5));
        } else if (kind > 3.5 && kind < 4.5) {
          // the passage's walls: damp, darker where water runs down them in streaks
          float wet = smoothstep(0.35, 0.75, vnoise(vec2(L.x * 0.35 + L.z * 0.05, L.y * 0.04)));
          alb = rock * mix(0.85, 0.6, wet);
        } else if (kind > 4.5 && kind < 5.5) {
          alb = mix(rock * 0.7, vec3(0.1, 0.085, 0.07), 0.45);
        }
        // the portal's light: warm, falling off from the veil in its frame, over the whole chamber and out of the mouth
        vec3 src = vec3(0.0, ${f2(ARCH.spring)}, ${f2(CAVE.gateIn)});
        float dl = length(L - src);
        float fromFront = smoothstep(${f2(CAVE.gateIn + 6)}, ${f2(CAVE.gateIn - 2)}, L.z);
        vec3 toSrc = normalize(src - L);
        float lam = 0.35 + 0.65 * max(dot(n, toSrc), 0.0);
        // (in the cave the land's coordinates: L.z over 0 is inside; outside only a spill near the mouth)
        float inside = caveIn;
        // (the gate stands just inside the mouth now, close to the walls: its light is a glow on damp dark rock,
        // strongest on what faces it, never a floodlight that bleaches the stone)
        float portal = (1.1 / (1.0 + dl * dl / 140.0)) * pow(lam, 1.6) * mix(0.25, 1.0, fromFront);
        float spill = exp(-max(length(L.xy - vec2(0.0, 14.0)) - 18.0, 0.0) / 8.0) * smoothstep(-14.0, 0.0, L.z) * (1.0 - inside);
        float ndl = max(dot(n, uKeyDir), 0.0);
        vec3 sky = (uSkyCol * (0.6 + 0.4 * n.y) + uKeyCol * ndl * 0.9 * sunUp * cloudShade(vWorld)) * (1.0 - inside * 0.85);
        // inside: the portal's warm light spills along the floor and up the walls toward the mouth, and a dim cool
        // light comes down from cracks in the roof (brighter in patches, on what faces up), so the rock reads as rock
        float crack = 0.35 + 0.65 * smoothstep(0.62, 0.82, vnoise(vec2(L.x * 0.09, L.z * 0.05) + 3.7));
        vec3 cool = vec3(0.32, 0.4, 0.55) * 0.55 * crack * (0.45 + 0.55 * max(n.y, 0.0));
        float spillIn = (0.35 + 0.65 * smoothstep(-2.0, ${CAVE.gateIn.toFixed(1)}, L.z)) * (0.6 + 0.4 * max(n.y, 0.0));
        vec3 col = alb * (sky + uLead * (portal * 1.6 * inside + spillIn * 0.18 * inside + spill * 0.22 * (0.4 + night)) + cool * 0.5 * inside);
        // the far end of the cave: the light itself, soft
        if (kind > 5.5) col = uLead * 1.6;
        // a sheen on wet rock where it faces the light
        vec3 V = normalize(cameraPosition - vWorld);
        // (damp all over, wetter in streaks: a broad soft gleam and a tighter one)
        float gloss = 0.5 + 0.5 * smoothstep(0.35, 0.75, vnoise(vec2(L.x * 0.35 + L.z * 0.05, L.y * 0.04)));
        float rv = max(dot(reflect(-V, n), toSrc), 0.0);
        col += uLead * (pow(rv, 10.0) * 0.22 + pow(rv, 40.0) * 0.5) * gloss * inside * (0.4 + 0.6 * fine) * (kind < 1.5 || (kind > 3.5 && kind < 5.5) ? 1.0 : 0.3);
        // (inside the cave there is no air of the land)
        // (the cave's inside takes the land's air only while the eye is outside: from the forest it goes into the fog
        // with the mountain, and once in, it is clear and lit by the way on)
        vec2 cq = cameraPosition.xz - vec2(${CAVE.x.toFixed(1)}, ${CAVE.z.toFixed(1)});
        float camIn = smoothstep(-4.0, 8.0, -sin(${CAVE.yaw.toFixed(3)}) * cq.x - cos(${CAVE.yaw.toFixed(3)}) * cq.y);
        // out in the land: lit as the ranges are lit, and in their haze (the feet of the mountain in the low haze,
        // as theirs), so the cliff, the mountain over it and the ranges behind read as one
        float ndlR = clamp(dot(n, uKeyDir) * 0.75 + 0.25, 0.0, 1.0);
        vec3 outCol = alb * (uSkyCol * (0.55 + 0.45 * n.y) + uKeyCol * ndlR * ndlR * 1.25 * sunUp * mix(1.0, cloudShade(vWorld), 0.7)) + alb * uLead * spill * 0.22 * (0.4 + night);
        vec3 dR = normalize(vWorld - cameraPosition);
        float top = ${f2(MAIN_RANGE.height)};
        float lowR = (1.0 - smoothstep(0.0, top * 0.5, vWorld.y)) * 0.3;
        float amtR = max(homeAirAmt(vWorld) * mix(0.62, 0.9, smoothstep(0.5, 0.0, vWorld.y / top)), clamp(lowR, 0.0, 0.96));
        outCol = mix(outCol, homeAirCol(dR), amtR);
        col = mix(outCol, col, inside);
        col = mix(homeAir(col, vWorld), col, inside * camIn);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function Cave() {
  const m = useMemo(
    () =>
      timed("cave", () => ({
        ...joinSeam(buildCliff(), buildMass()),
        cave: buildCave(),
        plug: buildPlug(),
        beyond: buildBeyond(),
        beyondMat: makeBeyondMaterial(),
        motes: buildMotes(70),
        mat: makeStoneMaterial(),
        // (the range's own material and measure: one of them, not a mountain pasted in front)
        massMat: makeRangeMaterial(MAIN_RANGE, 1),
      })),
    [],
  );
  // the cave's inside (its walls, the frame, the light in it) is only drawn when the eye is near enough to see into it
  const inner = useRef<THREE.Group>(null);
  const plug = useRef<THREE.Mesh>(null);
  const frames = useRef(0);
  useFrame(({ camera }) => {
    const g = inner.current;
    if (!g) return;
    const near = Math.hypot(camera.position.x - CAVE.x, camera.position.z - CAVE.z) < (g.visible ? 330 : 300);
    g.visible = ++frames.current < 90 || near;
    if (plug.current) plug.current.visible = !g.visible;
  });
  useEffect(
    () => () => {
      for (const x of [m.cliff, m.mass, m.cave, m.plug, m.beyond, m.beyondMat, m.motes.g, m.motes.m, m.mat, m.massMat]) x.dispose();
    },
    [m],
  );
  return (
    <>
      <mesh geometry={m.mass} material={m.massMat} />
      <mesh geometry={m.cliff} material={m.massMat} />
      <mesh ref={plug} geometry={m.plug} material={m.mat} visible={false} />
      <group ref={inner}>
      <mesh geometry={m.cave} material={m.mat} />
      <mesh geometry={m.motes.g} material={m.motes.m} renderOrder={6} />

      </group>
    </>
  );
}
