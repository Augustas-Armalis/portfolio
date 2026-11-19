"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GEIST, geistReady } from "./font";
import { CANVAS_LEAD, ROUTE, STATIONS, roadX, type Station } from "./flightPath";
import { GLSL_NOISE } from "./shared";
import { GLSL_SKY, SKY_U } from "./sky";
import { makeRangeMaterial } from "./World";

// What the paper plane flies through. Along the road stand the paintings of
// M. K. Čiurlionis, each followed by its world built in the round: the suns
// and gates of the Sonata of the Sun, the star river and the pyramid of the
// Sonata of the Stars, the tower of Rex on its dark globe, the terraced castle
// mountain of the Fairy Tale, the angels on the shore of Paradise. Then two
// mountains leaning into a gate, the sea, and the island of "Tranquility"
// with its two lit eyes.
//
// Every station is one merged mesh with painted vertices (colour + how much
// of its own light it gives off), all sharing a matte tempera material.

type V3 = [number, number, number];
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

function paint(g: THREE.BufferGeometry, col: V3, glow = 0, top?: V3) {
  const n = g.index ? g.toNonIndexed() : g;
  const pos = n.attributes.position;
  n.computeBoundingBox();
  const y0 = n.boundingBox!.min.y;
  const y1 = Math.max(y0 + 1e-4, n.boundingBox!.max.y);
  const c = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const k = top ? (pos.getY(i) - y0) / (y1 - y0) : 0;
    const t = top ?? col;
    c[i * 4] = col[0] + (t[0] - col[0]) * k;
    c[i * 4 + 1] = col[1] + (t[1] - col[1]) * k;
    c[i * 4 + 2] = col[2] + (t[2] - col[2]) * k;
    c[i * 4 + 3] = glow;
  }
  n.setAttribute("aCol", new THREE.BufferAttribute(c, 4));
  n.deleteAttribute("uv");
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}

// A little kit: build a part, place it, paint it.
class Kit {
  parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, p: V3, col: V3, o: { glow?: number; top?: V3; rot?: V3; scale?: V3 } = {}) {
    const painted = paint(g, col, o.glow ?? 0, o.top);
    E.set(...(o.rot ?? [0, 0, 0]));
    M.compose(new THREE.Vector3(...p), Q.setFromEuler(E), new THREE.Vector3(...(o.scale ?? [1, 1, 1])));
    painted.applyMatrix4(M);
    this.parts.push(painted);
    return this;
  }
  box(w: number, h: number, d: number, p: V3, col: V3, o?: { glow?: number; top?: V3; rot?: V3 }) {
    return this.add(new THREE.BoxGeometry(w, h, d), p, col, o);
  }
  build() {
    const g = mergeGeometries(this.parts)!;
    g.computeBoundingSphere();
    return g;
  }
}

function makeTempera(haze = 1) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, uHaze: { value: haze } },
    vertexShader: /* glsl */ `
      attribute vec4 aCol;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uHaze;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        // chalky tempera: broad dabs and a faint paper grain, no gloss
        float dab = vnoise(vWorld.xz * 0.9 + vWorld.y * 0.7) * 0.6 + vnoise(vWorld.xy * 2.7 + vWorld.z) * 0.4;
        vec3 alb = vCol.rgb * (0.82 + dab * 0.36);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float lit = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0) * sunUp;
        // the colours are written as you'd mix them on a palette; the sun here is several times brighter than paper white
        vec3 col = alb * (uSkyCol * (0.62 + 0.38 * n.y) + uKeyCol * lit * 0.9) * 0.36;
        // its own light: suns, windows, stars; it swells with the music
        float dist = length(vWorld - cameraPosition);
        // from the desk the stations are quiet shapes in the haze; they light up as the plane comes near
        float near = 1.0 - smoothstep(95.0, 215.0, dist);
        col += vCol.rgb * vCol.rgb * vCol.a * 0.8 * near * (1.0 + uPulse * 0.7) * (0.85 + 0.15 * sin(uTime * 1.3 + vWorld.x * 0.2));
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 air = skyBase(normalize(vec3(d.x, max(d.y, 0.0) * 0.5 + 0.012, d.z)));
        float low = exp(-max(vWorld.y, 0.0) * 0.07);
        float f = 1.0 - exp(-dist * (0.0032 * (0.5 + low) * uHaze + uMist));
        col = mix(col, air, clamp(f, 0.0, 1.0) * (1.0 - 0.45 * near * clamp(vCol.a, 0.0, 1.0)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// A sun as he drew them: a disc and thin straight rays.
function sun(k: Kit, p: V3, r: number, rays: number, len: number, glow = 1.5, yaw = 0) {
  const gold: V3 = [1.0, 0.74, 0.3];
  k.add(new THREE.CircleGeometry(r, 28), p, gold, { glow, rot: [0, yaw, 0] });
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const L = len * (i % 2 ? 0.62 : 1);
    const d = r * 1.25 + L / 2;
    k.add(new THREE.BoxGeometry(L, r * 0.07, 0.02), [p[0] + Math.cos(a) * d * Math.cos(yaw), p[1] + Math.sin(a) * d, p[2] - Math.cos(a) * d * Math.sin(yaw)], gold, { glow: glow * 0.7, rot: [0, yaw, a] });
  }
}

function tower(k: Kit, x: number, z: number, w: number, h: number, col: V3, top: V3) {
  k.box(w, h, w, [x, h / 2, z], col, { top });
  const c = w * 0.26;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(c, c * 1.5, c, [x + sx * (w / 2 - c / 2), h + c * 0.75, z + sz * (w / 2 - c / 2)], top);
}

// ---- Sonata of the Sun: gates, towers, rows of suns over a warm field ----
function buildSun() {
  const k = new Kit();
  const stone: V3 = [0.2, 0.26, 0.36];
  const stoneTop: V3 = [0.36, 0.43, 0.52];
  const gold: V3 = [1.0, 0.72, 0.28];
  // three gateways the road runs through, each a little taller
  [6, -13, -32].forEach((z, i) => {
    const h = 13 + i * 3.5;
    const half = 9.5;
    for (const s of [-1, 1]) {
      tower(k, s * half, z, 2.3, h, stone, stoneTop);
      // a narrow lit slit up each pylon
      k.box(0.22, h * 0.6, 0.1, [s * half, h * 0.5, z + 1.2], gold, { glow: 0.9 });
    }
    k.add(new THREE.TorusGeometry(half, 0.5, 8, 28, Math.PI), [0, h, z], gold, { glow: 1.1 });
    sun(k, [0, h + half + 3.2, z], 1.5, 12, 3.4, 1.6);
  });
  // suns standing in rows on thin stems, rising toward the back like notes on a stave
  for (const s of [-1, 1])
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 7; i++) {
        const x = s * (15 + row * 9 + i * 0.8);
        const z = 12 - i * 8.5 - row * 4;
        const h = 4 + i * 1.5 + row * 3;
        k.box(0.09, h, 0.09, [x, h / 2, z], [0.5, 0.42, 0.28]);
        sun(k, [x, h + 1.1, z], 0.95, 10, 1.7, 1.35);
      }
  // domed hills with towers and thin spires, blue-grey against the gold
  [[-44, -6, 20], [46, -22, 24], [-36, -46, 15]].forEach(([x, z, r], i) => {
    k.add(new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), [x, -1, z], [0.17, 0.23, 0.33], { top: [0.34, 0.41, 0.5], scale: [1, 0.72, 1] });
    tower(k, x - r * 0.3, z, 3, r * 0.72 + 9, stone, stoneTop);
    tower(k, x + r * 0.35, z + 2, 2.4, r * 0.6 + 6, stone, stoneTop);
    for (let j = 0; j < 7; j++) k.box(0.14, 5 + (j % 3) * 2, 0.14, [x - r * 0.7 + j * r * 0.22, r * 0.5 + 2, z + (j % 2) * 2], [0.3, 0.36, 0.46]);
    sun(k, [x + (i % 2 ? -4 : 5), r * 0.72 + 16, z + 1], 1.6, 12, 3.2, 1.5);
  });
  // the great sun the road is heading for
  sun(k, [0, 30, -52], 6, 20, 15, 1.7);
  return k.build();
}

// ---- Sonata of the Stars: the pyramid of light, the angel, the star river ----
function buildStars() {
  const k = new Kit();
  const r = rng(808);
  const ochre: V3 = [0.72, 0.56, 0.3];
  // the tall narrow pyramid, pale and faintly lit from within
  k.add(new THREE.ConeGeometry(15, 58, 4, 1, true), [-27, 29, -12], [0.42, 0.33, 0.2], { top: [0.95, 0.82, 0.5], glow: 0.38, rot: [0, Math.PI / 4, 0] });
  // the angel at its tip: a pale robe, a small head, wings spread
  k.add(new THREE.ConeGeometry(1.5, 6.5, 10), [-27, 61.5, -12], [0.95, 0.9, 0.75], { glow: 1.2 });
  k.add(new THREE.SphereGeometry(0.75, 12, 8), [-27, 65.4, -12], [1, 0.95, 0.8], { glow: 1.4 });
  for (const s of [-1, 1]) k.add(new THREE.SphereGeometry(1, 12, 8), [-27 + s * 2.7, 63.4, -12], [1, 0.96, 0.84], { glow: 1.0, scale: [2.7, 1.5, 0.3], rot: [0, 0, s * 0.5] });
  // rays from the angel
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + (i / 8) * 1.8 + Math.PI / 2;
    k.box(15, 0.1, 0.05, [-27 + Math.cos(a) * 12, 65 + Math.sin(a) * 12, -12], [1, 0.9, 0.6], { glow: 0.8, rot: [0, 0, a] });
  }
  // thin golden verticals, like strings
  [-52, -40, -13, 12, 24, 38, 55].forEach((x, i) => k.box(0.16, 70, 0.16, [x, 35, -30 + (i % 3) * 16], [0.95, 0.76, 0.36], { glow: 0.75 }));
  // long waves of colour rolling across, with amber worlds riding them
  for (let w = 0; w < 5; w++) {
    const y = 9 + w * 7.5;
    const z = 4 - w * 13;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) pts.push(new THREE.Vector3(-75 + i * 10.7, y + Math.sin(i * 0.9 + w * 1.7) * 3.4, z + Math.cos(i * 0.6 + w) * 4));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 70, 0.55 + (w % 2) * 0.35, 6, false);
    k.add(tube, [0, 0, 0], w % 2 ? [0.2, 0.26, 0.5] : [0.56, 0.46, 0.26], { glow: 0.28 });
    for (let j = 0; j < 5; j++) {
      const p = curve.getPoint(0.08 + j * 0.2 + r() * 0.06);
      const rad = 0.8 + r() * 1.5;
      k.add(new THREE.SphereGeometry(rad, 14, 10), [p.x, p.y + rad + 0.5, p.z], j % 2 ? [0.85, 0.42, 0.18] : ochre, { glow: 0.75 });
    }
  }
  // two smaller pyramids far to the sides, as in the top of the painting
  k.add(new THREE.ConeGeometry(9, 30, 4, 1, true), [42, 15, -44], [0.36, 0.3, 0.2], { top: [0.8, 0.7, 0.42], glow: 0.25, rot: [0, Math.PI / 4, 0] });
  k.add(new THREE.ConeGeometry(7, 24, 4, 1, true), [-62, 12, -50], [0.36, 0.3, 0.2], { top: [0.8, 0.7, 0.42], glow: 0.25, rot: [0, Math.PI / 4, 0] });
  return k.build();
}

// the star river: a bridge of stars arching over the road, plus a dusting all round
function starRiver() {
  const r = rng(515);
  const n = 2600;
  const pos = new Float32Array(n * 3);
  const sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < 1900) {
      const t = r();
      const a = Math.PI * t;
      const spread = (r() + r() + r() - 1.5) * 5.5;
      pos[i * 3] = -Math.cos(a) * 62 + spread * 0.5;
      pos[i * 3 + 1] = Math.sin(a) * 30 + 1.5 + spread * 0.5;
      pos[i * 3 + 2] = -4 + (r() - 0.5) * 9 + Math.sin(t * 9) * 3;
    } else {
      pos[i * 3] = (r() - 0.5) * 150;
      pos[i * 3 + 1] = 2 + r() * 70;
      pos[i * 3 + 2] = 36 - r() * 110;
    }
    sz[i] = 0.5 + r() * r() * 2.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
  g.computeBoundingSphere();
  return g;
}

// ---- Rex: the tower-throne on its dark globe, ringed by arcs and comets ----
function buildRex() {
  const k = new Kit();
  const r = rng(909);
  const dark: V3 = [0.1, 0.085, 0.075];
  const stone: V3 = [0.3, 0.26, 0.22];
  const pale: V3 = [0.62, 0.55, 0.45];
  const cx = 30;
  const cz = -8;
  // the globe, half sunk, a blade of light standing in it
  k.add(new THREE.SphereGeometry(19, 36, 24), [cx, 7, cz], dark, { top: [0.2, 0.17, 0.14] });
  k.box(0.7, 22, 0.3, [cx, 11, cz + 19.2], [1, 0.92, 0.75], { glow: 1.5 });
  for (let i = 0; i < 5; i++) k.box(9 - i * 1.6, 0.9, 0.5, [cx, 3 + i * 0.9, cz + 19.1], [0.5, 0.44, 0.36], { glow: 0.2 });
  // the tower rising out of it in steps, crowned
  const tiers: [number, number][] = [[15, 16], [11, 15], [7.5, 14], [5, 10]];
  let y = 22;
  tiers.forEach(([w, h], i) => {
    k.box(w, h, w, [cx, y + h / 2, cz], stone, { top: i % 2 ? pale : [0.42, 0.37, 0.3] });
    k.box(w + 1.2, 0.8, w + 1.2, [cx, y + h, cz], pale);
    y += h;
  });
  for (let i = 0; i < 5; i++) k.add(new THREE.ConeGeometry(0.6, 3.4, 4), [cx - 2.4 + i * 1.2, y + 1.9, cz], [1, 0.9, 0.7], { glow: 1.0 });
  // great arcs, one inside another, sweeping over the road
  [34, 44, 55, 67].forEach((rad, i) => k.add(new THREE.TorusGeometry(rad, 0.3 + i * 0.05, 6, 80, Math.PI), [cx, 4, cz - i * 5], pale, { glow: 0.42 }));
  // comets falling along the arcs
  for (let i = 0; i < 12; i++) {
    const a = 0.3 + r() * 2.5;
    const rad = 38 + r() * 30;
    const p: V3 = [cx + Math.cos(a) * rad, 4 + Math.sin(a) * rad, cz - 6 + (r() - 0.5) * 16];
    k.add(new THREE.SphereGeometry(0.7, 10, 8), p, [1, 0.72, 0.4], { glow: 1.5 });
    k.add(new THREE.ConeGeometry(0.5, 7, 6), [p[0] + Math.cos(a + 0.3) * 3.6, p[1] + Math.sin(a + 0.3) * 3.6, p[2]], [0.9, 0.5, 0.25], { glow: 0.6, rot: [0, 0, a + 0.3 - Math.PI / 2] });
  }
  // a second, smaller throne across the road, and the sun and crescent of the painting
  k.add(new THREE.SphereGeometry(9, 24, 16), [-32, 3, -30], dark, { top: [0.2, 0.17, 0.14] });
  k.box(6, 12, 6, [-32, 17, -30], stone, { top: pale });
  k.box(3.6, 9, 3.6, [-32, 27.5, -30], stone, { top: pale });
  sun(k, [-58, 62, -60], 5, 18, 12, 1.2);
  k.add(new THREE.TorusGeometry(6, 0.7, 8, 30, Math.PI * 1.1), [78, 64, -62], [0.95, 0.92, 0.8], { glow: 1.1, rot: [0, 0, -2.2] });
  return k.build();
}

// ---- Fairy Tale: the castle on its mountain, the road winding up behind red walls ----
function buildFairy() {
  const k = new Kit();
  const r = rng(303);
  const wall: V3 = [0.5, 0.2, 0.16];
  const grass: V3 = [0.2, 0.3, 0.1];
  const grassTop: V3 = [0.42, 0.5, 0.18];
  const mount = (cx: number, cz: number, s: number, castle: boolean) => {
    const tiers: [number, number, number][] = [[34, 27, 12], [24, 17, 12], [14, 7.5, 14]];
    let y = 0;
    tiers.forEach(([r0, r1, h]) => {
      k.add(new THREE.CylinderGeometry(r1 * s, r0 * s, h * s, 40, 1), [cx, y + (h * s) / 2, cz], grass, { top: grassTop });
      // the red wall along the lip of each terrace
      k.add(new THREE.CylinderGeometry(r1 * s + 0.5, r1 * s + 0.5, 2.2 * s, 40, 1, true), [cx, y + h * s + 1.1 * s, cz], wall, { top: [0.62, 0.3, 0.2] });
      y += h * s;
    });
    // the peak: a tall purple cone and two lesser ones
    k.add(new THREE.ConeGeometry(7 * s, 26 * s, 9), [cx, y + 13 * s, cz], [0.3, 0.16, 0.24], { top: [0.72, 0.42, 0.4] });
    k.add(new THREE.ConeGeometry(4.6 * s, 16 * s, 8), [cx + 6 * s, y + 7 * s, cz + 2 * s], [0.3, 0.16, 0.24], { top: [0.62, 0.36, 0.36] });
    k.add(new THREE.ConeGeometry(3.6 * s, 12 * s, 8), [cx - 5.5 * s, y + 5 * s, cz + 3 * s], [0.3, 0.16, 0.24], { top: [0.62, 0.36, 0.36] });
    if (castle) {
      // the castle on the shoulder, every window lit
      const cy = y + 1.5;
      k.box(9 * s, 5 * s, 4 * s, [cx, cy + 2.5 * s, cz + 6.2 * s], [0.56, 0.3, 0.2], { top: [0.8, 0.5, 0.3] });
      for (let i = 0; i < 4; i++) {
        const tx = cx - 4.5 * s + i * 3 * s;
        k.box(1.6 * s, (7 + (i % 2) * 2.5) * s, 1.6 * s, [tx, cy + (3.5 + (i % 2) * 1.25) * s, cz + 7 * s], [0.6, 0.32, 0.22]);
        k.add(new THREE.ConeGeometry(1.3 * s, 2.6 * s, 6), [tx, cy + (8.3 + (i % 2) * 2.5) * s, cz + 7 * s], [0.7, 0.3, 0.2]);
      }
      for (let i = 0; i < 9; i++) k.box(0.45 * s, 0.8 * s, 0.1, [cx - 3.6 * s + i * 0.9 * s, cy + (1.6 + (i % 3) * 1.1) * s, cz + 8.25 * s], [1, 0.8, 0.4], { glow: 1.8 });
    }
  };
  mount(44, -10, 1, true);
  mount(-52, -40, 0.62, false);
  // his sky here: small round clouds laid out in rows, like a pattern
  const cream: V3 = [0.95, 0.92, 0.84];
  for (let row = 0; row < 6; row++)
    for (let i = 0; i < 9; i++) {
      const x = -92 + i * 23 + (row % 2) * 11 + (r() - 0.5) * 5;
      const y = 46 + row * 7 + (r() - 0.5) * 2;
      const z = 16 - row * 20;
      const w = 4.5 + r() * 3.5;
      k.add(new THREE.IcosahedronGeometry(1, 1), [x, y, z], [0.72, 0.76, 0.82], { top: cream, glow: 0.2, scale: [w, w * 0.42, w * 0.7] });
    }
  // and the sun breaking through them in a fan of rays
  sun(k, [70, 78, -70], 5, 26, 30, 1.5);
  return k.build();
}

// ---- Paradise: the curved shore, the pale steps, angels in the flowering meadow ----
function buildParadise() {
  const k = new Kit();
  const r = rng(606);
  // still water on the left, a rim of warm sand
  k.add(new THREE.CircleGeometry(58, 64), [-66, 0.12, -6], [0.5, 0.68, 0.62], { glow: 0.22, rot: [-Math.PI / 2, 0, 0] });
  k.add(new THREE.RingGeometry(58, 66, 64), [-66, 0.1, -6], [0.88, 0.74, 0.44], { glow: 0.12, rot: [-Math.PI / 2, 0, 0] });
  // the broad pale steps climbing away on the right
  for (let i = 0; i < 8; i++) k.box(5, 1.5 + i * 1.5, 96, [24 + i * 5, (1.5 + i * 1.5) / 2, -8], [0.86, 0.74, 0.46], { top: [0.98, 0.9, 0.62], glow: 0.08, rot: [0, 0.08, 0] });
  const robes: V3[] = [[0.45, 0.62, 0.84], [0.88, 0.62, 0.68], [0.55, 0.78, 0.62], [0.95, 0.93, 0.86], [0.8, 0.7, 0.9], [0.95, 0.82, 0.5]];
  const angel = (x: number, z: number, s: number, robe: V3, yaw: number, bow = 0) => {
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    k.add(new THREE.ConeGeometry(0.75 * s, 2.7 * s, 12), [x, 1.35 * s, z], robe, { top: [Math.min(1, robe[0] + 0.15), Math.min(1, robe[1] + 0.15), Math.min(1, robe[2] + 0.15)], glow: 0.18, rot: [bow * c, 0, -bow * sn] });
    k.add(new THREE.SphereGeometry(0.3 * s, 10, 8), [x + sn * bow * 1.4 * s, (2.85 - bow * 0.5) * s, z + c * bow * 1.4 * s], [0.96, 0.84, 0.72], { glow: 0.2 });
    for (const w of [-1, 1])
      k.add(new THREE.SphereGeometry(1, 12, 8), [x + c * w * 0.75 * s - sn * 0.35 * s, 2.5 * s, z - sn * w * 0.75 * s - c * 0.35 * s], [1, 0.98, 0.92], { glow: 0.55, scale: [0.42 * s, 1.35 * s, 0.9 * s], rot: [0.25, yaw + w * 0.5, w * 0.3] });
  };
  // a company of them along the shore, larger than life, turning toward the road
  for (let i = 0; i < 12; i++) {
    const side = i % 3 === 0 ? 1 : -1;
    const x = side > 0 ? 9 + r() * 10 : -9 - r() * 14;
    const z = 9 - i * 5.4 + (r() - 0.5) * 3;
    angel(x, z, 2.1 + r() * 0.9, robes[i % robes.length], side > 0 ? -1.1 : 1.1 + (r() - 0.5) * 0.6);
  }
  // the one who bends to pick a flower, wings wide, near the road
  angel(7.5, -8, 3.6, [0.96, 0.94, 0.88], -0.9, 0.5);
  // white birds over the water
  for (let i = 0; i < 7; i++) {
    const p: V3 = [-40 - r() * 50, 22 + r() * 16, 20 - r() * 60];
    for (const w of [-1, 1]) k.box(2.6, 0.12, 0.9, [p[0] + w * 1.2, p[1] + 0.3, p[2]], [1, 1, 0.96], { glow: 0.8, rot: [0, 0, w * 0.4] });
  }
  return k.build();
}

function meadowFlowers() {
  const r = rng(717);
  const n = 1500;
  const pos = new Float32Array(n * 3);
  const sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = -8 + (r() - 0.35) * 46;
    pos[i * 3 + 1] = 0.35 + r() * 0.3;
    pos[i * 3 + 2] = 44 - r() * 96;
    sz[i] = 0.35 + r() * 0.7;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
  g.computeBoundingSphere();
  return g;
}

function makePoints(colA: string, colB: string, scale: number, alwaysOn: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, uA: { value: new THREE.Color(colA) }, uB: { value: new THREE.Color(colB) }, uScale: { value: scale }, uOn: { value: alwaysOn ? 1 : 0 } },
    vertexShader: /* glsl */ `
      attribute float aSize; uniform float uTime; uniform float uScale; uniform float uPulse;
      varying float vK; varying float vTw;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vK = fract(aSize * 7.31);
        vTw = 0.7 + 0.3 * sin(uTime * (1.0 + vK * 3.0) + aSize * 40.0);
        gl_PointSize = min(64.0, aSize * uScale * (1.0 + uPulse * 0.5) / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA; uniform vec3 uB; uniform float uNight; uniform float uOn;
      varying float vK; varying float vTw;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 22.0) * vTw * mix(0.25 + 0.75 * uNight, 1.0, uOn);
        gl_FragColor = vec4(mix(uA, uB, vK) * a, 1.0);
      }`,
  });
}

// ---- the gate: two mountains leaning into each other ----
function buildGate() {
  const peak = (side: number, seed: number) => {
    const g = new THREE.ConeGeometry(46, 128, 40, 22, false);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = (v.y + 64) / 128;
      const a = Math.atan2(v.z, v.x);
      const ridge = 1 + 0.2 * Math.sin(a * 5 + seed + k * 3.0) + 0.1 * Math.sin(a * 11 + seed * 2.0 + k * 9.0);
      const lean = Math.pow(k, 1.6) * 74;
      p.setXYZ(i, v.x * ridge - side * lean + side * 66, v.y + 60, v.z * ridge * 0.86);
    }
    g.computeVertexNormals();
    return g;
  };
  const g = mergeGeometries([peak(-1, 1.3), peak(1, 4.1)])!;
  g.computeBoundingSphere();
  return g;
}

// ---- the sea, and the island of "Tranquility" ----
function makeSea(eyes: THREE.Vector3[]) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, uEyes: { value: eyes }, uShore: { value: ROUTE.shoreZ } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uEyes[2]; uniform float uShore;
      varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(vWorld - cameraPosition);
        vec2 q = vWorld.xz;
        // a long slow swell under fine ripples; flatter with distance, so the far sea is a mirror
        vec2 fl = vec2(uTime * 0.05, uTime * 0.03);
        float e = 0.35;
        float h0 = fbm(q * 0.11 + fl) + 0.35 * fbm(q * 0.7 - fl * 3.0);
        float hx = fbm((q + vec2(e, 0.0)) * 0.11 + fl) + 0.35 * fbm((q + vec2(e, 0.0)) * 0.7 - fl * 3.0);
        float hz = fbm((q + vec2(0.0, e)) * 0.11 + fl) + 0.35 * fbm((q + vec2(0.0, e)) * 0.7 - fl * 3.0);
        float calm = 1.0 / (1.0 + dist * 0.012);
        vec3 n = normalize(vec3((h0 - hx) * 1.3 * calm, 1.0, (h0 - hz) * 1.3 * calm));
        vec3 r = reflect(-V, n);
        r.y = abs(r.y) + 0.002;
        vec3 sky = skyBase(normalize(r));
        float sunVis = smoothstep(-0.03, 0.03, uSunDir.y);
        sky += mix(uGlow, vec3(1.0), 0.5) * pow(max(dot(r, uSunDir), 0.0), 380.0) * 18.0 * sunVis;
        sky += vec3(0.8, 0.85, 1.0) * pow(max(dot(r, uMoonDir), 0.0), 500.0) * 6.0 * uNight;
        float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 deep = vec3(0.02, 0.045, 0.055) * (uSkyCol * 2.2 + 0.15);
        vec3 col = mix(deep, sky, clamp(fres * 0.9 + 0.1, 0.0, 1.0));
        // the two eyes, drawn down into the water as long broken streaks
        for (int i = 0; i < 2; i++) {
          vec3 L = normalize(uEyes[i] - vWorld);
          vec3 rr = reflect(-V, normalize(vec3(n.x * 3.0, 1.0, n.z * 14.0)));
          float s = pow(max(dot(rr, L), 0.0), 1400.0);
          col += vec3(1.0, 0.8, 0.45) * s * 2.6 * (1.0 + uPulse);
        }
        // foam and wet sand where it meets the land
        float shore = smoothstep(uShore - 14.0, uShore - 1.0, vWorld.z + (h0 - 0.6) * 5.0);
        col = mix(col, vec3(0.5, 0.46, 0.34) * (uSkyCol + uKeyCol * 0.3), shore * 0.85);
        col += vec3(0.6) * (uSkyCol + uKeyCol * 0.4) * smoothstep(0.4, 0.5, shore) * smoothstep(0.75, 0.55, shore) * 0.6;
        vec3 fd = normalize(vec3(vWorld.x - cameraPosition.x, 0.012, vWorld.z - cameraPosition.z));
        col = mix(col, skyBase(fd), 1.0 - exp(-dist * (0.0016 + uMist)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function buildIsland() {
  const g = new THREE.SphereGeometry(1, 72, 28);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const xn = v.x; // -1 the long low spit .. +1 the steep head
    const prof = (4 + 30 * Math.exp(-Math.pow((xn - 0.44) / 0.3, 2)) + 5 * Math.exp(-Math.pow((xn + 0.2) / 0.4, 2))) * (1 - Math.pow(Math.abs(xn), 5));
    const lump = 1 + 0.08 * Math.sin(xn * 17 + v.z * 9) + 0.05 * Math.sin(v.z * 23 + xn * 5);
    p.setXYZ(i, xn * 96, Math.max(v.y, -0.12) * prof * lump, v.z * (9 + prof * 0.55) * lump);
    // near-black olive at the head, through plum, to violet-blue at the far tip
    const k = Math.min(1, Math.max(0, (0.5 - xn) / 1.5));
    const a = k < 0.5 ? [0.028, 0.03, 0.02] : [0.1, 0.07, 0.1];
    const b = k < 0.5 ? [0.1, 0.07, 0.1] : [0.15, 0.16, 0.36];
    const t = k < 0.5 ? k * 2 : (k - 0.5) * 2;
    col[i * 4] = a[0] + (b[0] - a[0]) * t;
    col[i * 4 + 1] = a[1] + (b[1] - a[1]) * t;
    col[i * 4 + 2] = a[2] + (b[2] - a[2]) * t;
    col[i * 4 + 3] = 0;
  }
  g.setAttribute("aCol", new THREE.BufferAttribute(col, 4));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// The island turns its head toward whoever comes through the gate.
const ISLAND_YAW = Math.atan2(ROUTE.islandX - 1.5, ROUTE.gateZ - ROUTE.islandZ) + Math.PI / 2 + 0.25;
export function eyePositions() {
  const out: THREE.Vector3[] = [];
  for (const xn of [0.36, 0.56]) {
    const v = new THREE.Vector3(xn * 96, 2.6, 21.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), ISLAND_YAW);
    out.push(v.add(new THREE.Vector3(ROUTE.islandX, 0, ROUTE.islandZ)));
  }
  return out;
}

// ---- the paintings themselves, standing on the left of the road ----
function captionTexture(s: Station) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 160;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = () => {
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(255,255,255,0.96)";
    g.textBaseline = "alphabetic";
    g.font = `600 58px ${GEIST}`;
    (g as unknown as { letterSpacing: string }).letterSpacing = "-2.3px";
    g.fillText(s.title, 4, 70);
    g.font = `400 44px ${GEIST}`;
    (g as unknown as { letterSpacing: string }).letterSpacing = "-0.7px";
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillText(`M. K. Čiurlionis, ${s.year}`, 4, 132);
    tex.needsUpdate = true;
  };
  draw();
  void geistReady().then(draw);
  return tex;
}

function Painting({ s }: { s: Station }) {
  const H = 12.5;
  const W = H * s.aspect;
  const { map, cap, frame } = useMemo(() => {
    const map = new THREE.TextureLoader().load(s.file!);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return {
      map,
      cap: captionTexture(s),
      frame: new THREE.MeshBasicMaterial({ color: "#16110c" }),
    };
  }, [s]);
  useEffect(
    () => () => {
      map.dispose();
      cap.dispose();
      frame.dispose();
    },
    [map, cap, frame],
  );
  const z = s.z + CANVAS_LEAD;
  return (
    <group position={[roadX(z) - 11.5 - W / 2, 0, z]} rotation={[0, 0.5, 0]}>
      {/* two slim posts, a dark frame, the canvas, and a soft light spilling from it */}
      {[-1, 1].map((k) => (
        <mesh key={k} material={frame} position={[k * (W / 2 - 0.5), 2, -0.25]}>
          <boxGeometry args={[0.22, 4, 0.22]} />
        </mesh>
      ))}
      <mesh material={frame} position={[0, 3.6 + H / 2, -0.12]}>
        <boxGeometry args={[W + 0.5, H + 0.5, 0.2]} />
      </mesh>
      <mesh position={[0, 3.6 + H / 2, 0]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={map} toneMapped={false} color="#f4efe6" />
      </mesh>
      <mesh position={[0, 3.6 + H / 2, -0.3]} renderOrder={2}>
        <planeGeometry args={[W * 2.1, H * 1.9]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          vertexShader={`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
          fragmentShader={`varying vec2 vUv; void main(){ vec2 c = (vUv - 0.5) * 2.0; float a = exp(-dot(c, c) * 3.2) * 0.2; gl_FragColor = vec4(vec3(1.0, 0.9, 0.72) * a, 1.0); }`}
        />
      </mesh>
      <mesh position={[-W / 2 + 4.1, 2.35, 0.02]}>
        <planeGeometry args={[8.2, 1.28]} />
        <meshBasicMaterial map={cap} transparent toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Voyage({ mobile }: { mobile: boolean }) {
  const built = useMemo(() => {
    const tempera = makeTempera();
    const eyes = eyePositions();
    const at = (id: string) => {
      const s = STATIONS.find((x) => x.id === id)!;
      return [roadX(s.z), 0, s.z] as V3;
    };
    return {
      tempera,
      // the island keeps its darkness across the water
      dark: makeTempera(0.22),
      eyes,
      at,
      sun: buildSun(),
      stars: buildStars(),
      river: starRiver(),
      riverMat: makePoints("#fff1cf", "#bcd2ff", mobile ? 150 : 210, true),
      rex: buildRex(),
      fairy: buildFairy(),
      paradise: buildParadise(),
      flowers: meadowFlowers(),
      flowerMat: makePoints("#fff6c8", "#ffd0e0", 120, true),
      gate: buildGate(),
      gateMat: makeRangeMaterial({ haze: 0.34, snow: 0.55, height: 190 }),
      sea: makeSea(eyes),
      island: buildIsland(),
      eyeMat: makePoints("#fff4d6", "#f0c070", 5200, true),
      eyeGeo: (() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute([...eyes[0].toArray(), ...eyes[1].toArray(), ...eyes[0].toArray(), ...eyes[1].toArray()], 3));
        g.setAttribute("aSize", new THREE.Float32BufferAttribute([1, 1.13, 0.3, 0.33], 1));
        g.computeBoundingSphere();
        return g;
      })(),
    };
  }, [mobile]);
  useEffect(
    () => () => {
      Object.values(built).forEach((v) => {
        if (v instanceof THREE.BufferGeometry || v instanceof THREE.Material) v.dispose();
      });
    },
    [built],
  );
  const b = built;
  return (
    <>
      <mesh geometry={b.sun} material={b.tempera} position={b.at("sun")} />
      <mesh geometry={b.stars} material={b.tempera} position={b.at("stars")} />
      <points geometry={b.river} material={b.riverMat} position={b.at("stars")} />
      <mesh geometry={b.rex} material={b.tempera} position={b.at("rex")} />
      <mesh geometry={b.fairy} material={b.tempera} position={b.at("fairy")} />
      <mesh geometry={b.paradise} material={b.tempera} position={b.at("paradise")} />
      <points geometry={b.flowers} material={b.flowerMat} position={b.at("paradise")} />
      {STATIONS.filter((s) => s.file).map((s) => (
        <Painting key={s.id} s={s} />
      ))}
      <mesh geometry={b.gate} material={b.gateMat} position={[roadX(ROUTE.gateZ), -6, ROUTE.gateZ]} />
      <mesh material={b.sea} position={[0, 0.06, ROUTE.shoreZ - 1500]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[3600, 3000]} />
      </mesh>
      <mesh geometry={b.island} material={b.dark} position={[ROUTE.islandX, 0, ROUTE.islandZ]} rotation={[0, ISLAND_YAW, 0]} />
      <points geometry={b.eyeGeo} material={b.eyeMat} frustumCulled={false} renderOrder={6} />
    </>
  );
}
