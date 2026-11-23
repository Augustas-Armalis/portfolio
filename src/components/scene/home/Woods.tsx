"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { voyage } from "../worlds/voyage";
import { farBlock, makeFarMaterial, makeHomeTreeMaterial } from "./Forest";
import { FOREST_LINE, HILL, laneD, riverD, riverW, sst } from "./journey";
import { GLSL_HOME_AIR, HOME_U, PLACES, landH, rng, type HomeTree, type TreeKind } from "./land";
import { buildTree, makeFarTreeTexture, makeLeafTexture } from "./trees";

// The old forest of the journey (journey.ts): from the town's last houses north to the mountain's foot. Tall old
// pines and oaks stand close either side of a lane the plane flies down, under their crowns, along a winding track
// of dark earth (drawn by the ground). It goes to night in here (see JourneyScene): fog lies between the trunks,
// fireflies come out, mushrooms glow at the trees' feet, pale lights drift deeper in, a fox trots ahead of the
// plane down the track and turns off into the trees, a deer lifts its head in a glade, owls on dead trunks turn
// to watch the plane go by.
//
// The trees near the lane are whole and fine (the home world's own trees, Forest.tsx); further out a coarser cut;
// beyond sixty metres the home world's painted cards stand for the wood (land.ts plants those).

// 0..1: how far the forest has gone to night, and how thick its fog is (written by JourneyScene)
export const FOREST_K = { night: { value: 0 }, fog: { value: 0 } };

// ---------- the track (JS: the same line the ground draws, journey.ts GLSL_TRACK) ----------
const NSEG = FOREST_LINE.length - 1;
export function trackAt(al: number) {
  const i = Math.min(NSEG - 1, Math.max(0, Math.floor(al)));
  const t = Math.min(1, Math.max(0, al - i));
  const [ax, az] = FOREST_LINE[i];
  const [bx, bz] = FOREST_LINE[i + 1];
  const dx = bx - ax;
  const dz = bz - az;
  const L = Math.hypot(dx, dz);
  const off = 1.8 * Math.sin(al * 2.3) + 0.9 * Math.sin(al * 5.1 + 1.0);
  const nx = -dz / L;
  const nz = dx / L;
  return { x: ax + dx * t + nx * off, z: az + dz * t + nz * off, cx: ax + dx * t, cz: az + dz * t, nx, nz };
}
// a point beside the flight line: along it (segment units), how far to one side
function beside(al: number, side: number) {
  const p = trackAt(al);
  const x = p.cx + p.nx * side;
  const z = p.cz + p.nz * side;
  return { x, z, y: landH(x, z) };
}

// the creatures' places
const DEER = beside(5.25, 17);
const OWLS = [beside(3.15, -9.5), beside(6.6, 10.5)];
const OWL_H = [5.4, 6.2];

// ---------- planting ----------
type WTree = { x: number; z: number; kind: TreeKind; s: number; rich: boolean; chunk: number; rot: number; tint: number };
function plant(amount: number) {
  const r = rng(6021);
  const out: WTree[] = [];
  const cell = 5.4 / Math.sqrt(Math.max(0.5, amount));
  for (let gx = -470; gx < -220; gx += cell)
    for (let gz = -680; gz < -160; gz += cell) {
      const x = gx + r() * cell;
      const z = gz + r() * cell;
      const u = r();
      const k = r();
      const v = r();
      const { d, along } = laneD(x, z);
      if (d < 7 || d > 62) continue;
      if (along < 0.03 || along > 0.93) continue;
      if (Math.hypot(x - HILL.x, z - HILL.z) < HILL.foot - 6) continue;
      if (Math.hypot(x - PLACES.tower.x, z - PLACES.tower.z) < 14) continue;
      if (Math.hypot(x - DEER.x, z - DEER.z) < 9) continue;
      if (OWLS.some((o) => Math.hypot(x - o.x, z - o.z) < 4)) continue;
      // (none in the river, nor on its banks)
      if (riverD(x, z) < riverW(x) + 3.5) continue;
      if (u > (d < 26 ? 0.85 : 0.75)) continue;
      // by the lane only pines (their crowns are carried high: the plane flies under them), further in oaks and spruce
      const kind: TreeKind = d < 14 ? "pine" : k < 0.5 ? "pine" : k < 0.74 ? "spruce" : k < 0.97 ? "broad" : "birch";
      const s = kind === "pine" ? 1.6 + v * 0.55 : kind === "broad" ? 1.45 + v * 0.4 : kind === "spruce" ? 1.45 + v * 0.45 : 1.2 + v * 0.25;
      out.push({ x, z, kind, s, rich: d < 26, chunk: Math.min(2, Math.floor(along * 3.2)), rot: r() * 6.283, tint: r() });
    }
  return out;
}

// ---------- a little sculptor for the creatures: spheres, cones and limbs, each with a colour, a part and a glow ----------
type C3 = [number, number, number];
class Sculpt {
  list: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, col: C3, part = 0, glow = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute("uv");
    g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    const p = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      c.set(col, i * 3);
      p[i * 2] = part;
      p[i * 2 + 1] = glow;
    }
    g.setAttribute("aCol", new THREE.BufferAttribute(c, 3));
    g.setAttribute("aPart", new THREE.BufferAttribute(p, 2));
    this.list.push(g);
    geo.dispose();
  }
  blob(p: C3, s: C3, col: C3, part = 0, rot: C3 = [0, 0, 0], glow = 0, seg = 10) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s));
    this.add(new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.6))), m, col, part, glow);
  }
  limb(a: C3, b: C3, r0: number, r1: number, col: C3, part = 0, sides = 6) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.add(new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), sides, 1, false), m, col, part);
  }
  cone(p: C3, r: number, h: number, col: C3, part = 0, rot: C3 = [0, 0, 0]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1));
    this.add(new THREE.ConeGeometry(r, h, 6), m, col, part);
  }
  geometry() {
    const g = mergeGeometries(this.list)!;
    this.list.forEach((x) => x.dispose());
    g.computeBoundingSphere();
    return g;
  }
}

// The fox (nose toward -z, standing on y 0): parts 1-4 legs (the gait), 5 the head, 6 the brush.
function foxGeometry() {
  const S = new Sculpt();
  const O: C3 = [0.62, 0.24, 0.07];
  const W: C3 = [0.85, 0.82, 0.76];
  const K: C3 = [0.06, 0.04, 0.035];
  S.blob([0, 0.42, 0], [0.17, 0.17, 0.42], O, 0, [0.06, 0, 0], 0, 12);
  S.blob([0, 0.36, -0.22], [0.13, 0.13, 0.18], W, 0);
  S.blob([0, 0.58, -0.46], [0.13, 0.12, 0.13], O, 5);
  S.cone([0, 0.55, -0.64], 0.065, 0.24, O, 5, [-Math.PI / 2, 0, 0]);
  S.blob([0, 0.53, -0.57], [0.09, 0.06, 0.1], W, 5);
  S.blob([0, 0.555, -0.765], [0.022, 0.022, 0.022], K, 5);
  for (const s of [-1, 1]) S.cone([s * 0.07, 0.72, -0.44], 0.045, 0.14, O, 5, [0, 0, -s * 0.2]);
  for (const s of [-1, 1]) S.blob([s * 0.055, 0.61, -0.56], [0.014, 0.014, 0.014], K, 5);
  const legs: C3[] = [
    [-0.09, 0, -0.26],
    [0.09, 0, -0.26],
    [-0.09, 0, 0.26],
    [0.09, 0, 0.26],
  ];
  legs.forEach((p, i) => {
    S.limb([p[0], 0.4, p[2]], [p[0], 0.16, p[2]], 0.045, 0.035, O, i + 1);
    S.limb([p[0], 0.17, p[2]], [p[0], 0.0, p[2] - 0.02], 0.035, 0.025, K, i + 1);
  });
  S.blob([0, 0.42, 0.62], [0.11, 0.11, 0.3], O, 6, [0.35, 0, 0], 0, 12);
  S.blob([0, 0.33, 0.86], [0.08, 0.08, 0.11], W, 6, [0.35, 0, 0]);
  return S.geometry();
}

// A deer standing (nose toward -z): part 5 the neck and head (it lifts and turns).
function deerGeometry() {
  const S = new Sculpt();
  const B: C3 = [0.36, 0.22, 0.12];
  const L: C3 = [0.5, 0.36, 0.22];
  const W: C3 = [0.78, 0.74, 0.66];
  const K: C3 = [0.06, 0.045, 0.035];
  const A: C3 = [0.42, 0.36, 0.28];
  S.blob([0, 1.1, 0], [0.27, 0.3, 0.68], B, 0, [0, 0, 0], 0, 14);
  S.blob([0, 1.02, 0.12], [0.24, 0.24, 0.5], L, 0);
  S.blob([0, 1.12, 0.64], [0.12, 0.13, 0.08], W, 0);
  for (const [x, z] of [
    [-0.15, -0.45],
    [0.15, -0.45],
    [-0.15, 0.48],
    [0.15, 0.48],
  ]) {
    S.limb([x, 1.0, z], [x, 0.5, z + 0.03], 0.07, 0.045, B);
    S.limb([x, 0.52, z + 0.03], [x, 0.0, z], 0.035, 0.028, K);
  }
  S.limb([0, 1.25, -0.5], [0, 1.75, -0.72], 0.13, 0.09, B, 5, 8);
  S.blob([0, 1.82, -0.8], [0.1, 0.11, 0.17], B, 5, [0.5, 0, 0]);
  S.blob([0, 1.74, -0.95], [0.05, 0.05, 0.06], K, 5);
  for (const s of [-1, 1]) {
    S.blob([s * 0.12, 1.94, -0.72], [0.07, 0.03, 0.12], B, 5, [0, s * 0.8, 0]);
    const base: C3 = [s * 0.06, 1.92, -0.78];
    const a1: C3 = [s * 0.24, 2.3, -0.7];
    S.limb(base, a1, 0.03, 0.022, A, 5, 4);
    S.limb(a1, [s * 0.34, 2.62, -0.58], 0.022, 0.012, A, 5, 4);
    S.limb(a1, [s * 0.2, 2.5, -0.92], 0.018, 0.01, A, 5, 4);
    S.limb([s * 0.29, 2.48, -0.64], [s * 0.45, 2.66, -0.78], 0.015, 0.008, A, 5, 4);
  }
  return S.geometry();
}

// An owl on a broken trunk (looking toward -z at rest): part 5 the head, glow on its eyes.
function owlGeometry(stump: number) {
  const S = new Sculpt();
  const T: C3 = [0.14, 0.12, 0.1];
  S.limb([0, -0.4, 0], [0.05, stump, 0.03], 0.45, 0.3, [0.12, 0.1, 0.085], 0, 9);
  S.limb([0.02, stump - 0.6, 0], [0.9, stump + 0.2, 0.2], 0.08, 0.04, [0.12, 0.1, 0.085], 0, 5);
  S.blob([0.05, stump + 0.02, 0.03], [0.32, 0.08, 0.32], [0.09, 0.12, 0.05], 0);
  const y = stump + 0.08;
  S.blob([0.05, y + 0.32, 0], [0.2, 0.3, 0.18], T, 0, [0, 0, 0], 0, 12);
  S.blob([0.05, y + 0.28, -0.08], [0.14, 0.22, 0.1], [0.32, 0.27, 0.2], 0);
  S.blob([0.05, y + 0.68, 0], [0.19, 0.17, 0.17], T, 5, [0, 0, 0], 0, 12);
  S.blob([0.05, y + 0.66, -0.1], [0.15, 0.12, 0.08], [0.3, 0.26, 0.2], 5);
  for (const s of [-1, 1]) {
    S.blob([0.05 + s * 0.075, y + 0.69, -0.17], [0.045, 0.045, 0.02], [1.0, 0.66, 0.15], 5, [0, 0, 0], 1);
    S.cone([0.05 + s * 0.11, y + 0.86, 0], 0.04, 0.13, T, 5, [0, 0, -s * 0.35]);
  }
  S.cone([0.05, y + 0.6, -0.19], 0.025, 0.06, [0.25, 0.22, 0.15], 5, [-Math.PI / 2, 0, 0]);
  return S.geometry();
}

function makeCreatureMaterial(pivot: C3) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...HOME_U, uGait: { value: 0 }, uStride: { value: 0 }, uHead: { value: new THREE.Vector2(0, 0) }, uPivot: { value: new THREE.Vector3(...pivot) }, uNightK: FOREST_K.night },
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute vec2 aPart;
      uniform float uGait; uniform float uStride; uniform vec2 uHead; uniform vec3 uPivot;
      varying vec3 vCol; varying vec3 vN; varying vec3 vWorld; varying float vGlow;
      mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
      mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
      void main(){
        vec3 p = position; vec3 n = normal;
        float part = floor(aPart.x + 0.5);
        // a leg swings from its hip, diagonal pairs together (a trot); the paw lifts on the swing forward
        if (part >= 1.0 && part <= 4.0) {
          float ph = (part == 1.0 || part == 4.0) ? 0.0 : 3.14159;
          float a = sin(uGait + ph) * uStride;
          vec3 hip = vec3(p.x, 0.4, sign(p.z) * 0.26);
          mat3 R = rotX(a);
          p = hip + R * (p - hip); n = R * n;
          p.y += max(0.0, cos(uGait + ph)) * uStride * 0.12 * step(p.y, 0.2);
        }
        p.y += abs(sin(uGait)) * uStride * 0.05;
        // the head turns and lifts about the neck
        if (part == 5.0) { mat3 R = rotY(uHead.x) * rotX(uHead.y); p = uPivot + R * (p - uPivot); n = R * n; }
        // the brush sways
        if (part == 6.0) p.x += sin(uGait * 0.5 + 1.0) * 0.25 * (0.3 + uStride) * max(0.0, p.z - 0.35);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vCol = aCol; vGlow = aPart.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNightK;
      varying vec3 vCol; varying vec3 vN; varying vec3 vWorld; varying float vGlow;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        vec3 n = normalize(vN);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        vec3 V = normalize(cameraPosition - vWorld);
        // fur: soft wrapped light, a rim where it turns from the eye (the fireflies' light at night)
        float w = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
        vec3 col = vCol * (uSkyCol * (0.6 + 0.4 * n.y) + uKeyCol * w * 0.5 * sunUp);
        col += vCol * vec3(0.55, 0.65, 0.4) * rim * (0.25 + 0.6 * uNightK);
        col = mix(col, vCol * 2.6, vGlow * (0.4 + 0.6 * uNightK));
        col = homeAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// soft points of light: fireflies (small, blinking, green-gold) and wisps (larger, pale blue, slow, deeper in)
function makeLights(fly: boolean, count: number) {
  const r = rng(fly ? 311 : 523);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const al = 0.3 + r() * (NSEG - 0.8);
    const side = (r() < 0.5 ? -1 : 1) * (fly ? Math.pow(r(), 1.6) * 34 : 14 + r() * 40);
    const p = beside(al, side);
    at.set([p.x, p.y + (fly ? 0.4 + Math.pow(r(), 1.5) * 7 : 1.2 + r() * 4), p.z, r() * 100], i * 4);
  }
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-345, 0, -420), 320);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, uNightK: FOREST_K.night },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; varying vec2 vUv; varying float vK;
      uniform float uTime; uniform float uNightK;
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float ph = aAt.w;
        float t = uTime * ${fly ? "0.35" : "0.08"};
        vec3 c = aAt.xyz + vec3(sin(t + ph) * ${fly ? "1.6" : "4.0"} + sin(t * 2.3 + ph * 1.7) * 0.6, sin(t * 1.3 + ph * 2.1) * ${fly ? "0.7" : "1.2"}, cos(t * 0.9 + ph) * ${fly ? "1.6" : "4.0"});
        ${fly ? "float blink = smoothstep(0.35, 0.95, sin(uTime * (1.3 + fract(ph) * 1.4) + ph * 7.0)) * 0.85 + 0.15;" : "float blink = 0.65 + 0.35 * sin(uTime * 0.6 + ph);"}
        float dist = length(c - cameraPosition);
        // (far off a light is never smaller than a couple of pixels: it dims instead, and fades into the fog)
        float grow = max(1.0, dist * ${fly ? "0.012" : "0.004"});
        vK = blink * uNightK / grow * (1.0 - smoothstep(${fly ? "70.0, 140.0" : "120.0, 260.0"}, dist));
        vUv = position.xy;
        vec3 wp = c + (R * position.x + U * position.y) * ${fly ? "0.14" : "1.1"} * grow * (vK > 0.003 ? 1.0 : 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vK;
      void main(){
        float r = length(vUv);
        float a = (exp(-r * r * 9.0) * 0.9 + exp(-r * r * 2.5) * 0.25) * (1.0 - smoothstep(0.7, 1.0, r)) * vK;
        gl_FragColor = vec4(${fly ? "vec3(0.95, 1.0, 0.45) * 2.2" : "vec3(0.55, 0.75, 1.0) * 0.9"} * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m };
}

// mushrooms in rings at the trees' feet near the lane: their caps glow after dark (teal, pale blue, a few amber)
function makeMushrooms(count: number) {
  const S = new Sculpt();
  S.limb([0, 0, 0], [0, 0.22, 0], 0.035, 0.028, [0.75, 0.72, 0.62]);
  S.blob([0, 0.24, 0], [0.12, 0.07, 0.12], [1, 1, 1], 0, [0, 0, 0], 1, 8);
  const geo = S.geometry();
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ["position", "normal", "aCol", "aPart"]) g.setAttribute(k, geo.getAttribute(k));
  const r = rng(889);
  const at = new Float32Array(count * 4);
  const tint = new Float32Array(count * 3);
  let i = 0;
  while (i < count) {
    const c = beside(0.4 + r() * (NSEG - 1.0), (r() < 0.5 ? -1 : 1) * (6 + r() * 16));
    const hue = r();
    const col = hue < 0.55 ? [0.25, 0.95, 0.85] : hue < 0.85 ? [0.45, 0.65, 1.0] : [1.0, 0.6, 0.25];
    const n = 3 + Math.floor(r() * 6);
    for (let k = 0; k < n && i < count; k++, i++) {
      const a = r() * 6.283;
      const d = 0.2 + r() * 1.1;
      const x = c.x + Math.cos(a) * d;
      const z = c.z + Math.sin(a) * d;
      at.set([x, landH(x, z) - 0.03, z, 0.55 + r() * 0.9], i * 4);
      tint.set(col, i * 3);
    }
  }
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-345, 0, -420), 320);
  const m = new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...HOME_U, uNightK: FOREST_K.night },
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute vec2 aPart; attribute vec4 aAt; attribute vec3 aTint;
      varying vec3 vCol; varying vec3 vN; varying vec3 vWorld; varying float vGlow; varying vec3 vTint;
      void main(){
        vec3 wp = aAt.xyz + position * aAt.w;
        vWorld = wp; vN = normal; vCol = aCol; vGlow = aPart.y; vTint = aTint;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNightK;
      varying vec3 vCol; varying vec3 vN; varying vec3 vWorld; varying float vGlow; varying vec3 vTint;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 alb = mix(vCol, vec3(0.6, 0.5, 0.38), vGlow);
        vec3 col = alb * (uSkyCol * (0.6 + 0.4 * n.y) + uKeyCol * max(dot(n, uKeyDir), 0.0) * 0.4);
        float pulse = 0.8 + 0.2 * sin(uTime * 1.1 + vWorld.x * 0.7 + vWorld.z);
        col = mix(col, vTint * 1.7 * pulse, vGlow * (0.15 + 0.85 * uNightK) * (0.6 + 0.4 * n.y));
        col = homeAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m, geo };
}

// fog lying low between the trunks: broad soft sheets that drift, thicker as the night comes
function makeMist(count: number) {
  const r = rng(144);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const p = beside(0.2 + r() * (NSEG - 0.5), (r() - 0.5) * 70);
    at.set([p.x, p.y + 1.2 + r() * 1.6, p.z, 9 + r() * 9], i * 4);
  }
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-345, 0, -420), 320);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U, ...HOME_U, uFogK: FOREST_K.fog },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; varying vec2 vUv; varying float vA; varying vec3 vWorld;
      uniform float uTime; uniform float uFogK;
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 c = aAt.xyz + vec3(sin(uTime * 0.05 + aAt.w) * 3.0, 0.0, cos(uTime * 0.04 + aAt.w * 1.3) * 3.0);
        float dist = length(c - cameraPosition);
        // (a sheet is never met up close: it thins as the eye comes near)
        vA = uFogK * 0.32 * smoothstep(8.0, 24.0, dist) * (1.0 - smoothstep(160.0, 240.0, dist));
        vUv = position.xy;
        // upright, turned to the eye about the vertical only, so they lie along the ground
        vec3 Rh = normalize(vec3(R.x, 0.0, R.z) + 1e-5);
        vWorld = c + Rh * position.x * aAt.w + vec3(0.0, 1.0, 0.0) * position.y * aAt.w * 0.32;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vA; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        float r = length(vUv);
        float n = vnoise(vWorld.xz * 0.12 + uTime * 0.03) * 0.5 + 0.5;
        float a = exp(-r * r * 2.6) * (1.0 - smoothstep(0.75, 1.0, r)) * vA * n;
        vec3 col = mix(homeAirCol(normalize(vWorld - cameraPosition)), vec3(0.5, 0.6, 0.7) * (uSkyCol + 0.05), 0.4);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m };
}

// the deer and each owl face the lane
const towardLane = (p: { x: number; z: number }, al: number) => {
  const t = trackAt(al);
  return Math.atan2(-(t.x - p.x), -(t.z - p.z));
};
const DEER_YAW = towardLane(DEER, 5.25) + 0.9;
const OWL_YAW = [towardLane(OWLS[0], 3.15), towardLane(OWLS[1], 6.6)];

export function Woods({ amount, mobile, effects }: { amount: number; mobile: boolean; effects: number }) {
  const w = useMemo(() => {
    const t0 = performance.now();
    const trees = plant(amount);
    const leaves = makeLeafTexture();
    const mat = makeHomeTreeMaterial(leaves);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    const meshes: THREE.InstancedMesh[] = [];
    const geos = new Map<string, THREE.BufferGeometry>();
    let tris = 0;
    // (the fine trees near the lane have a coarse twin, drawn instead while the eye is far from their stretch of
    // the wood: from the desk the whole forest is a few hundred thousand triangles lighter)
    const twins: { fine: THREE.InstancedMesh; coarse: THREE.InstancedMesh; at: THREE.Vector3 }[] = [];
    const pending = new Map<string, THREE.InstancedMesh>();
    for (const kind of ["pine", "spruce", "broad", "birch"] as TreeKind[])
      for (const [rich, cut] of [[true, 1], [true, 0], [false, 0]] as [boolean, number][])
        for (let c = 0; c < 3; c++) {
          const list = trees.filter((t) => t.kind === kind && t.rich === rich && t.chunk === c);
          if (!list.length) continue;
          const key = `${kind}${rich}${cut}`;
          if (!geos.has(key)) geos.set(key, buildTree(kind, 1, cut && !mobile ? 1 : 0));
          const geo = geos.get(key)!;
          const im = new THREE.InstancedMesh(geo, mat, list.length);
          list.forEach((t, i) => {
            o.position.set(t.x, landH(t.x, t.z) - 0.08, t.z);
            o.rotation.set(0, t.rot, 0);
            o.scale.set(t.s * (0.92 + t.tint * 0.16), t.s * (0.95 + t.tint * 0.1), t.s * (0.92 + t.tint * 0.16));
            o.updateMatrix();
            im.setMatrixAt(i, o.matrix);
            // an old forest: deeper, cooler greens than the meadow's trees
            im.setColorAt(i, col.setRGB(0.7 + t.tint * 0.2, 0.82 + t.tint * 0.12, 0.86 - t.tint * 0.1));
          });
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          im.computeBoundingSphere();
          if (rich) {
            const tk = `${kind}${c}`;
            const other = pending.get(tk);
            if (other) {
              const fine = cut ? im : other;
              const coarse = cut ? other : im;
              twins.push({ fine, coarse, at: fine.boundingSphere!.center.clone() });
              coarse.visible = false;
            } else pending.set(tk, im);
          }
          if (!(rich && !cut)) tris += ((geo.index?.count ?? 0) / 3) * list.length;
          im.userData.chunk = c;
          im.userData.lod = !rich ? "mid" : cut ? "fine" : "coarse";
          meshes.push(im);
        }
    // Far off, each stretch of the wood is the home world's painted cards (one card a tree): seen from the desk the
    // whole forest is a few thousand triangles and three draws, and the trees themselves come in as the eye nears.
    const farMat = makeFarMaterial(makeFarTreeTexture());
    const cards = [0, 1, 2].map((c) => {
      const list: HomeTree[] = trees.filter((t) => t.chunk === c).map((t) => ({ x: t.x, y: landH(t.x, t.z), z: t.z, s: t.s, kind: t.kind, v: 0, rot: t.rot, tint: t.tint, lod: 2 }));
      const m = farBlock(list, farMat);
      const at = new THREE.Vector3();
      list.forEach((t) => at.add(new THREE.Vector3(t.x, t.y, t.z)));
      at.divideScalar(Math.max(1, list.length));
      return { mesh: m, at, far: false };
    });
    const fox = foxGeometry();
    const deer = deerGeometry();
    const owls = OWL_H.map((h) => owlGeometry(h));
    const cmats = [makeCreatureMaterial([0, 0.5, -0.38]), makeCreatureMaterial([0, 1.3, -0.55]), ...OWL_H.map((h) => makeCreatureMaterial([0.05, h + 0.6, 0]))];
    const flies = makeLights(true, mobile ? 260 : Math.round(520 * Math.max(0.5, effects)));
    const wisps = makeLights(false, mobile ? 24 : 44);
    const shrooms = makeMushrooms(mobile ? 160 : 320);
    const mist = makeMist(mobile ? 40 : 70);
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __woods: { trees: trees.length, tris: Math.round(tris), draws: meshes.length } });
    const g = ((globalThis as unknown as { __gen?: Record<string, number> }).__gen ??= {});
    g.woods = Math.round(performance.now() - t0);
    return { meshes, twins, cards, farMat, mat, fox, deer, owls, cmats, flies, wisps, shrooms, mist };
  }, [amount, mobile, effects]);
  useEffect(
    () => () => {
      // (the trees' geometry and the leaf sheets are the shared library's: trees.ts)
      w.meshes.forEach((m) => m.dispose());
      w.cards.forEach((c) => c.mesh.geometry.dispose());
      for (const x of [w.farMat, w.mat, w.fox, w.deer, ...w.owls, ...w.cmats, w.flies.g, w.flies.m, w.wisps.g, w.wisps.m, w.shrooms.g, w.shrooms.m, w.shrooms.geo, w.mist.g, w.mist.m]) x.dispose();
    },
    [w],
  );

  const fox = useRef<THREE.Mesh>(null);
  const st = useRef({ al: 1.15, gait: 0, x: 0, z: 0, yaw: 0, init: false, frames: 0 });
  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const s = st.current;
    // (for its first frames, behind the loader, both cuts are drawn once, so neither is first sent to the GPU mid-flight)
    const warm = ++s.frames < 90;
    // each stretch: far off its cards, nearer the coarse cut, near the fine trees by the lane
    for (const c of w.cards) {
      const d = camera.position.distanceTo(c.at);
      c.far = c.far ? d > 350 : d > 390;
      c.mesh.visible = warm || c.far;
    }
    for (const t of w.twins) {
      const d = camera.position.distanceTo(t.at);
      const fine = t.fine.visible && !warm ? d < 280 : d < 250;
      const far = w.cards[t.fine.userData.chunk].far && !warm;
      t.fine.visible = warm || (fine && !far);
      t.coarse.visible = warm || (!fine && !far);
    }
    for (const m of w.meshes) if (m.userData.lod === "mid") m.visible = warm || !w.cards[m.userData.chunk].far;
    const pp = voyage.planePos;
    const inHome = voyage.cur === "home" && voyage.flying && pp.y > -100;
    const L = inHome ? laneD(pp.x, pp.z) : { d: 1e9, along: 0 };
    const planeAl = L.d < 60 ? L.along * NSEG : -1;
    // ---- the fox waits at the forest's edge; as the plane comes it trots on ahead down the track, and near the
    // middle of the wood it turns off between the trees
    let want = s.al;
    if (planeAl > 0.2 && planeAl < 5.6) want = Math.max(s.al, Math.min(5.9, planeAl + 0.9));
    if (!inHome) want = 1.15;
    const prev = s.al;
    s.al = want < s.al ? want : s.al + Math.min(want - s.al, dt * 0.3);
    const moved = Math.abs(s.al - prev) / Math.max(dt, 1e-3);
    const p = trackAt(s.al);
    const off = sst(5.2, 5.9, s.al) * 22;
    const x = p.x + p.nx * off;
    const z = p.z + p.nz * off;
    if (!s.init) {
      s.x = x;
      s.z = z;
      s.init = true;
    }
    const vx = x - s.x;
    const vz = z - s.z;
    s.x = x;
    s.z = z;
    if (Math.hypot(vx, vz) > 0.002) s.yaw = Math.atan2(-vx, -vz);
    const stride = Math.min(1, moved * 6) * 0.55;
    s.gait += dt * (4 + moved * 22);
    if (fox.current) {
      fox.current.position.set(x, landH(x, z) + 0.02, z);
      fox.current.rotation.y = s.yaw;
      const fm = w.cmats[0].uniforms;
      fm.uGait.value = s.gait;
      fm.uStride.value = THREE.MathUtils.damp(fm.uStride.value, stride, 6, dt);
      // (waiting, it looks about)
      fm.uHead.value.x = THREE.MathUtils.damp(fm.uHead.value.x, stride < 0.05 ? 0.5 * Math.sin(performance.now() * 0.0004) : 0, 3, dt);
    }
    // ---- the deer and the owls turn their heads toward the plane while it is near
    const look = (m: THREE.ShaderMaterial, at: { x: number; z: number }, yaw0: number, lift: number) => {
      const dx = pp.x - at.x;
      const dz = pp.z - at.z;
      const near = inHome ? 1 - sst(40, 90, Math.hypot(dx, dz)) : 0;
      let a = Math.atan2(-dx, -dz) - yaw0;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const u = m.uniforms.uHead.value;
      u.x = THREE.MathUtils.damp(u.x, Math.max(-1.4, Math.min(1.4, a)) * near, 2.5, dt);
      u.y = THREE.MathUtils.damp(u.y, -lift * near, 2.0, dt);
    };
    look(w.cmats[1], DEER, DEER_YAW, 0.35);
    OWLS.forEach((o, i) => look(w.cmats[2 + i], o, OWL_YAW[i], 0));
  });

  return (
    <>
      {w.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      {w.cards.map((c, i) => (
        <primitive key={`c${i}`} object={c.mesh} />
      ))}
      <mesh ref={fox} geometry={w.fox} material={w.cmats[0]} scale={1.15} />
      <mesh geometry={w.deer} material={w.cmats[1]} position={[DEER.x, DEER.y - 0.05, DEER.z]} rotation={[0, DEER_YAW, 0]} />
      {OWLS.map((o, i) => (
        <mesh key={i} geometry={w.owls[i]} material={w.cmats[2 + i]} position={[o.x, o.y - 0.2, o.z]} rotation={[0, OWL_YAW[i], 0]} />
      ))}
      <mesh geometry={w.shrooms.g} material={w.shrooms.m} />
      <mesh geometry={w.mist.g} material={w.mist.m} renderOrder={4} />
      <mesh geometry={w.wisps.g} material={w.wisps.m} renderOrder={6} />
      <mesh geometry={w.flies.g} material={w.flies.m} renderOrder={6} />
    </>
  );
}
