"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { MIRROR_LAYER } from "./Forest";
import { GLSL_HOME_AIR, HLAKE, HOME_U, PLACES, SEA, landH, rng, timed } from "./land";

// The made things of the map, the places a walk or a flight arrives at:
//   behind the desk the footpath runs down through the dunes to a wooden pier
//     with a lantern at its head and a rowing boat moored beside it;
//   a short jetty and a second boat on the lake's near shore;
//   a footbridge where the road crosses the brook that feeds the lake;
//   a wayside shrine (koplytstulpis) by the road, haystacks in the meadow,
//     post-and-rail fences, boulders;
//   far off a village round a white church, a ruined tower on a foothill, and
//     a lighthouse on the coast.
// All of it is one mesh (vertex colours, one small shader): wood, stone,
// plaster and thatch as paint, darker where each thing meets the ground,
// lit like the rest of the land, its windows and lamps warm after dusk.

type V3 = [number, number, number];
class Build {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  aux: number[] = []; // glow, height above its own foot
  idx: number[] = [];
  private o = new THREE.Vector3();
  private rot = 0;
  private foot = 0;
  at(x: number, y: number, z: number, rotY = 0) {
    this.o.set(x, y, z);
    this.rot = rotY;
    this.foot = y;
    return this;
  }
  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: V3, glow: number) {
    const cs = Math.cos(this.rot);
    const sn = Math.sin(this.rot);
    this.pos.push(this.o.x + x * cs + z * sn, this.o.y + y, this.o.z - x * sn + z * cs);
    this.nor.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
    this.col.push(c[0], c[1], c[2]);
    this.aux.push(glow, this.o.y + y - this.foot);
    return this.pos.length / 3 - 1;
  }
  quad(a: V3, b: V3, c: V3, d: V3, col: V3, glow = 0) {
    const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a))).normalize();
    const i = this.v(...a, n.x, n.y, n.z, col, glow);
    this.v(...b, n.x, n.y, n.z, col, glow);
    this.v(...c, n.x, n.y, n.z, col, glow);
    this.v(...d, n.x, n.y, n.z, col, glow);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  // a box by its middle and size; `tz` leans its length up or down (a ramp)
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: V3, glow = 0, tz = 0) {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const y = (z: number, top: boolean) => cy + (top ? sy / 2 : -sy / 2) + (z - cz) * tz;
    this.quad([x0, y(z1, false), z1], [x1, y(z1, false), z1], [x1, y(z1, true), z1], [x0, y(z1, true), z1], col, glow);
    this.quad([x1, y(z0, false), z0], [x0, y(z0, false), z0], [x0, y(z0, true), z0], [x1, y(z0, true), z0], col, glow);
    this.quad([x1, y(z1, false), z1], [x1, y(z0, false), z0], [x1, y(z0, true), z0], [x1, y(z1, true), z1], col, glow);
    this.quad([x0, y(z0, false), z0], [x0, y(z1, false), z1], [x0, y(z1, true), z1], [x0, y(z0, true), z0], col, glow);
    this.quad([x0, y(z1, true), z1], [x1, y(z1, true), z1], [x1, y(z0, true), z0], [x0, y(z0, true), z0], col, glow);
    this.quad([x0, y(z0, false), z0], [x1, y(z0, false), z0], [x1, y(z1, false), z1], [x0, y(z1, false), z1], col, glow);
  }
  // an upright round thing, tapering from r0 to r1 (a cone when r1 is 0), smooth round its side
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, sides: number, col: V3, glow = 0, col1: V3 = col) {
    const base = this.pos.length / 3;
    const slope = (r0 - r1) / h;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const n = new THREE.Vector3(c, slope, s).normalize();
      this.v(cx + c * r0, y0, cz + s * r0, n.x, n.y, n.z, col, glow);
      this.v(cx + c * r1, y0 + h, cz + s * r1, n.x, n.y, n.z, col1, glow);
    }
    for (let i = 0; i < sides; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    if (r1 > 0.001) {
      const c0 = this.v(cx, y0 + h, cz, 0, 1, 0, col1, glow);
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const p = this.v(cx + Math.cos(a0) * r1, y0 + h, cz + Math.sin(a0) * r1, 0, 1, 0, col1, glow);
        const q = this.v(cx + Math.cos(a1) * r1, y0 + h, cz + Math.sin(a1) * r1, 0, 1, 0, col1, glow);
        this.idx.push(c0, q, p);
      }
    }
  }
  // a gabled roof over a box sx by sz, its ridge along z, with eaves
  roof(cx: number, y0: number, cz: number, sx: number, sz: number, h: number, col: V3, wall: V3) {
    const e = 0.25;
    const x0 = cx - sx / 2 - e;
    const x1 = cx + sx / 2 + e;
    const z0 = cz - sz / 2 - e;
    const z1 = cz + sz / 2 + e;
    this.quad([x0, y0, z1], [cx, y0 + h, z1], [cx, y0 + h, z0], [x0, y0, z0], col);
    this.quad([x1, y0, z0], [cx, y0 + h, z0], [cx, y0 + h, z1], [x1, y0, z1], col);
    // the gable ends
    for (const z of [z0 + e, z1 - e]) {
      const n = z > cz ? 1 : -1;
      const i = this.v(cx - sx / 2, y0, z, 0, 0, n, wall, 0);
      this.v(cx + sx / 2, y0, z, 0, 0, n, wall, 0);
      this.v(cx, y0 + h * (sx / (sx + 2 * e)), z, 0, 0, n, wall, 0);
      if (n > 0) this.idx.push(i, i + 1, i + 2);
      else this.idx.push(i, i + 2, i + 1);
    }
  }
  // a rounded stone: a lumpy ball, flattened, sunk a little into the ground
  rock(cx: number, cy: number, cz: number, r: number, seed: number, col: V3) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position;
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.22 * Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.7) + 0.14 * Math.sin(z * 4.3 + seed * 2.3 + x * 2.1);
      const tone = 0.82 + 0.3 * (y * 0.5 + 0.5);
      this.v(cx + x * r * k, cy + y * r * 0.62 * k + r * 0.2, cz + z * r * k * 0.9, x, y * 1.4 + 0.2, z, [col[0] * tone, col[1] * tone, col[2] * tone], 0);
    }
    for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    g.dispose();
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aAux", new THREE.Float32BufferAttribute(this.aux, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const WOOD: V3 = [0.2, 0.15, 0.1];
const WOOD_PALE: V3 = [0.33, 0.27, 0.19];
const WOOD_DARK: V3 = [0.1, 0.075, 0.055];
const STONE: V3 = [0.3, 0.29, 0.27];
const PLASTER: V3 = [0.72, 0.69, 0.62];
const TILE: V3 = [0.36, 0.13, 0.07];
const THATCH: V3 = [0.42, 0.34, 0.16];
const LAMP: V3 = [1.0, 0.72, 0.36];

// a rowing boat: a clinker hull drawn up to a stem at each end, two thwarts, a pair of oars shipped
function boat(b: Build, x: number, y: number, z: number, rotY: number, r: () => number) {
  b.at(x, y, z, rotY);
  const L = 3.6;
  const W = 0.68;
  const D = 0.46;
  const NU = 12;
  const NV = 6;
  const pt = (u: number, v: number): V3 => {
    const k = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u * 0.94 + 0.03))), 0.55);
    const sheer = 0.16 * Math.pow(Math.abs(u - 0.5) * 2, 2.2);
    return [v * W * k, (v * v - 1) * D * (0.35 + 0.65 * k) + sheer, (u - 0.5) * L];
  };
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NV; j++) {
      const u0 = i / NU;
      const u1 = (i + 1) / NU;
      const v0 = (j / NV) * 2 - 1;
      const v1 = ((j + 1) / NV) * 2 - 1;
      // outside: tarred dark below, a pale painted strake at the gunwale
      const top = Math.abs((v0 + v1) / 2) > 0.62;
      const c: V3 = top ? [0.5, 0.52, 0.5] : [0.09, 0.075, 0.06];
      const q: [V3, V3, V3, V3] = [pt(u0, v0), pt(u0, v1), pt(u1, v1), pt(u1, v0)];
      // (both faces: the inside is the same boards, paler)
      b.quad(q[0], q[1], q[2], q[3], c);
      const inn = (p: V3): V3 => [p[0] * 0.94, p[1] + 0.03, p[2] * 0.98];
      b.quad(inn(q[3]), inn(q[2]), inn(q[1]), inn(q[0]), WOOD_PALE);
    }
  for (const tz of [-0.55, 0.5]) b.box(0, -0.12, tz, W * 1.7, 0.035, 0.2, WOOD_PALE);
  // oars laid along the thwarts
  for (const sx of [-1, 1]) {
    b.box(sx * 0.2, -0.07, 0.1, 0.035, 0.035, 2.3, WOOD_PALE);
    b.box(sx * 0.2, -0.07, 1.36, 0.11, 0.02, 0.5, WOOD_PALE);
  }
  void r;
}

// planks on posts running out over water from (x, z0) to (x, z1), its deck at `y`
function pier(b: Build, x: number, z0: number, z1: number, y: number, bedY: (z: number) => number, r: () => number, w = 1.5) {
  const n = Math.round((z1 - z0) / 0.28);
  for (let i = 0; i < n; i++) {
    const z = z0 + ((i + 0.5) / n) * (z1 - z0);
    const t = 0.78 + r() * 0.4;
    b.at(x, y, z, (r() - 0.5) * 0.03);
    b.box(0, 0, 0, w + (r() - 0.5) * 0.08, 0.045, 0.25, [WOOD_PALE[0] * t, WOOD_PALE[1] * t, WOOD_PALE[2] * t * 0.95]);
  }
  for (let z = z0 + 0.6; z <= z1 + 0.01; z += 2.6) {
    const yb = bedY(z) - 0.4;
    for (const sx of [-1, 1]) {
      b.at(x + sx * (w / 2 - 0.08), yb, z);
      b.cyl(0, 0, 0, 0.085, 0.075, y - yb + (sx > 0 && Math.round(z * 3) % 2 ? 0.5 : 0.04), 7, WOOD_DARK, 0, WOOD);
    }
    b.at(x, y - 0.09, z);
    b.box(0, 0, 0, w, 0.1, 0.1, WOOD);
  }
  // the stringers under the planks
  for (const sx of [-1, 1]) {
    b.at(x + sx * (w / 2 - 0.2), y - 0.07, (z0 + z1) / 2);
    b.box(0, 0, 0, 0.08, 0.1, z1 - z0, WOOD);
  }
}

function lantern(b: Build, x: number, y: number, z: number) {
  b.at(x, y, z);
  b.cyl(0, 0, 0, 0.05, 0.04, 2.1, 6, WOOD_DARK, 0, WOOD);
  b.box(0.16, 2.05, 0, 0.36, 0.035, 0.035, WOOD_DARK);
  b.box(0.3, 1.82, 0, 0.13, 0.2, 0.13, LAMP, 1);
  b.cyl(0.3, 1.92, 0, 0.12, 0, 0.1, 6, WOOD_DARK);
  b.box(0.3, 1.71, 0, 0.15, 0.02, 0.15, WOOD_DARK);
}

function fence(b: Build, pts: [number, number][], r: () => number) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s];
    const [x1, z1] = pts[s + 1];
    const L = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(L / 2.4));
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n;
      const za = z0 + ((z1 - z0) * i) / n;
      const xb = x0 + ((x1 - x0) * (i + 1)) / n;
      const zb = z0 + ((z1 - z0) * (i + 1)) / n;
      const ya = landH(xa, za);
      const yb = landH(xb, zb);
      b.at(xa, ya - 0.1, za, (r() - 0.5) * 0.4);
      b.cyl(0, 0, 0, 0.055, 0.045, 1.15 + r() * 0.12, 6, WOOD_DARK, 0, WOOD_PALE);
      // (now and then a rail is down)
      const len = Math.hypot(xb - xa, zb - za);
      const yaw = Math.atan2(xb - xa, zb - za);
      for (const [hy, drop] of [[0.92, r() < 0.12], [0.5, false]] as [number, boolean][]) {
        b.at((xa + xb) / 2, (ya + yb) / 2 + hy - (drop ? 0.2 : 0), (za + zb) / 2, yaw);
        b.box(0, 0, 0, 0.03, 0.085, len + 0.12, WOOD_PALE, 0, (yb - ya) / len + (drop ? -0.16 : (r() - 0.5) * 0.02));
      }
    }
    if (s === pts.length - 2) {
      b.at(x1, landH(x1, z1) - 0.1, z1);
      b.cyl(0, 0, 0, 0.055, 0.045, 1.18, 6, WOOD_DARK, 0, WOOD_PALE);
    }
  }
}

function house(b: Build, x: number, z: number, rotY: number, sx: number, sz: number, h: number, wall: V3, roofC: V3, r: () => number) {
  const y = Math.min(landH(x - 3, z), landH(x + 3, z), landH(x, z - 3), landH(x, z + 3)) - 0.3;
  b.at(x, y, z, rotY);
  b.box(0, h / 2, 0, sx, h, sz, wall);
  b.roof(0, h, 0, sx, sz, sx * 0.72, roofC, wall);
  b.box(sx * 0.2, h + sx * 0.6, sz * 0.2, 0.5, 1.1, 0.5, [0.3, 0.22, 0.18]);
  // windows on the long sides, a door: dark by day, lit after dusk
  for (const side of [-1, 1])
    for (let i = 0; i < 2; i++) {
      const lit = r() < 0.7 ? 1 : 0.15;
      b.box(side * (sx / 2 + 0.02), h * 0.55, (i - 0.5) * sz * 0.5, 0.05, 0.8, 0.7, [0.05 + 0.5 * lit, 0.05 + 0.32 * lit, 0.06 + 0.1 * lit], lit);
    }
}

function build() {
  const b = new Build();
  const r = rng(2087);
  // --- the pier behind the desk
  const P = PLACES.pier;
  const deck = SEA + 0.95;
  pier(b, P.x, P.z0, P.z1, deck, (z) => landH(P.x, z), r);
  // steps down from the sand
  b.at(P.x, deck - 0.2, P.z0 - 0.3);
  b.box(0, 0, 0, 1.5, 0.05, 0.5, WOOD_PALE);
  lantern(b, P.x - 0.62, deck, P.z1 - 0.3);
  boat(b, P.x + 1.55, SEA + 0.16, P.z1 - 6, 0.12, r);
  // its painter, made fast to a post
  b.at(P.x + 0.8, SEA + 0.5, P.z1 - 4.4, 0.5);
  b.box(0, 0, 0, 0.02, 0.02, 1.3, [0.5, 0.45, 0.35], 0, -0.3);
  // --- the lake's jetty and boat
  const J = PLACES.jetty;
  const yaw = Math.atan2(-J.ux, -J.uz);
  const jd = HLAKE.y + 0.32;
  for (let i = 0; i < 26; i++) {
    const t = -2.2 + i * 0.3;
    const tone = 0.78 + r() * 0.4;
    b.at(J.x - J.ux * t, jd, J.z - J.uz * t, yaw + (r() - 0.5) * 0.04);
    b.box(0, 0, 0, 1.25, 0.04, 0.27, [WOOD_PALE[0] * tone, WOOD_PALE[1] * tone, WOOD_PALE[2] * tone]);
    if (i % 8 === 3)
      for (const sx of [-1, 1]) {
        b.at(J.x - J.ux * t + Math.cos(yaw) * sx * 0.56, HLAKE.y - 1.3, J.z - J.uz * t - Math.sin(yaw) * sx * 0.56);
        b.cyl(0, 0, 0, 0.07, 0.06, 1.3 + 0.36 + (sx > 0 ? 0.35 : 0), 6, WOOD_DARK, 0, WOOD);
      }
  }
  boat(b, J.x - J.ux * 3.2 + Math.cos(yaw) * 1.35, HLAKE.y + 0.15, J.z - J.uz * 3.2 - Math.sin(yaw) * 1.35, yaw + 0.2, r);
  // --- the footbridge over the brook
  const Br = PLACES.bridge;
  const by = landH(Br.x, Br.z - 2.3) + 0.12;
  for (let i = 0; i < 17; i++) {
    const t = (i / 16 - 0.5) * 4.6;
    const tone = 0.8 + r() * 0.35;
    // a slight camber
    b.at(Br.x, by + 0.22 * (1 - Math.pow(t / 2.3, 2)), Br.z + t, (r() - 0.5) * 0.03);
    b.box(0, 0, 0, 1.7, 0.05, 0.27, [WOOD_PALE[0] * tone, WOOD_PALE[1] * tone, WOOD_PALE[2] * tone]);
  }
  for (const sx of [-1, 1]) {
    for (const t of [-2.2, 0, 2.2]) {
      b.at(Br.x + sx * 0.8, by - 0.5, Br.z + t);
      b.cyl(0, 0, 0, 0.06, 0.05, 1.45 + 0.22 * (1 - Math.pow(t / 2.3, 2)), 6, WOOD_DARK, 0, WOOD);
    }
    b.at(Br.x + sx * 0.8, by + 0.95, Br.z);
    b.box(0, 0, 0, 0.05, 0.07, 4.7, WOOD);
    b.at(Br.x + sx * 0.8, by + 0.52, Br.z);
    b.box(0, 0, 0, 0.035, 0.05, 4.6, WOOD);
    b.at(Br.x + sx * 0.72, by - 0.02, Br.z);
    b.box(0, 0, 0, 0.12, 0.16, 4.7, WOOD_DARK);
  }
  // --- the wayside shrine: a carved post under a little shingled roof, a cross on its top
  const S = PLACES.shrine;
  b.at(S.x, landH(S.x, S.z) - 0.1, S.z, 0.5);
  b.cyl(0, 0, 0, 0.1, 0.075, 2.3, 8, WOOD_DARK, 0, WOOD);
  b.box(0, 2.45, 0, 0.34, 0.36, 0.3, WOOD);
  b.box(0, 2.45, 0.156, 0.2, 0.24, 0.01, [0.75, 0.7, 0.55], 0.25);
  b.roof(0, 2.63, 0, 0.5, 0.5, 0.3, WOOD_DARK, WOOD);
  b.box(0, 3.14, 0, 0.035, 0.42, 0.035, WOOD_DARK);
  b.box(0, 3.2, 0, 0.2, 0.035, 0.035, WOOD_DARK);
  for (const [dx, dz, s] of [[0.5, 0.2, 0.22], [-0.42, -0.3, 0.3], [0.1, -0.55, 0.16]] as V3[]) {
    b.at(S.x + dx, landH(S.x + dx, S.z + dz), S.z + dz);
    b.rock(0, 0, 0, s, r() * 9, STONE);
  }
  // --- hay: slim pointed cocks on their poles (kupetos), as they stand in a mown Lithuanian meadow
  for (const [x, z] of PLACES.hay) {
    const k = 0.85 + r() * 0.3;
    b.at(x, landH(x, z) - 0.1, z, r() * 6);
    b.cyl(0, 0, 0, 0.95 * k, 0.8 * k, 0.9 * k, 10, [THATCH[0] * 0.62, THATCH[1] * 0.62, THATCH[2] * 0.6], 0, THATCH);
    b.cyl(0, 0.9 * k, 0, 0.8 * k, 0.12 * k, 1.9 * k, 10, THATCH, 0, [THATCH[0] * 1.25, THATCH[1] * 1.2, THATCH[2] * 1.05]);
    b.cyl(0, 2.7 * k, 0, 0.035, 0.02, 0.95, 5, WOOD_DARK);
  }
  // --- the farmstead: a log house under a steep shingled roof with white window trim, a granary with a porch, a
  // well with its sweep, a stork's nest on a pole, a rail fence round the yard
  {
    const F = PLACES.farm;
    const fy = Math.min(landH(F.x - 5, F.z), landH(F.x + 5, F.z), landH(F.x, F.z - 5), landH(F.x, F.z + 5)) - 0.25;
    const LOG: V3 = [0.2, 0.14, 0.09];
    const SHINGLE: V3 = [0.16, 0.15, 0.14];
    const TRIM: V3 = [0.78, 0.76, 0.7];
    b.at(F.x, fy, F.z, 0.5);
    b.box(0, 1.45, 0, 6.2, 2.9, 11, LOG);
    b.roof(0, 2.9, 0, 6.2, 11, 4.3, SHINGLE, LOG);
    b.box(1.2, 6.2, 1.5, 0.6, 1.5, 0.6, [0.34, 0.2, 0.15]);
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        b.box(side * 3.12, 1.65, -3.2 + i * 3.2, 0.06, 1.25, 1.05, TRIM);
        b.box(side * 3.16, 1.65, -3.2 + i * 3.2, 0.05, 0.95, 0.75, [0.5, 0.36, 0.14], 0.9);
      }
    b.box(0, 1.1, 5.53, 1.0, 2.1, 0.08, [0.12, 0.2, 0.16]);
    // the wind boards crossed at the gable's peak
    for (const zz of [-5.75, 5.75]) for (const sx of [-1, 1]) b.box(sx * 0.18, 7.45, zz, 0.07, 0.9, 0.05, TRIM);
    // the granary (klėtis)
    const gx = F.x + 17;
    const gz = F.z + 13;
    b.at(gx, fy + 0.2, gz, 2.0);
    b.box(0, 1.25, 0, 4.4, 2.2, 5.6, [LOG[0] * 0.85, LOG[1] * 0.85, LOG[2] * 0.85]);
    b.roof(0, 2.45, 0.5, 4.4, 7.0, 2.7, [THATCH[0] * 0.7, THATCH[1] * 0.68, THATCH[2] * 0.6], LOG);
    for (const sx of [-1.9, 0, 1.9]) b.cyl(sx, 0, 3.6, 0.09, 0.08, 2.4, 6, WOOD_DARK, 0, WOOD);
    // the well and its sweep
    b.at(F.x + 7.5, fy, F.z + 7);
    b.cyl(0, 0, 0, 0.75, 0.72, 0.85, 10, WOOD, 0, WOOD_PALE);
    b.cyl(2.3, 0, 0, 0.11, 0.09, 4.2, 6, WOOD_DARK, 0, WOOD);
    b.box(0.6, 4.75, 0, 0.09, 0.09, 6.4, WOOD_PALE);
    b.at(F.x + 7.5, fy, F.z + 7, Math.PI / 2);
    b.box(0, 4.2, -0.6, 0.1, 0.1, 6.6, WOOD, 0, 0.36);
    b.box(0, 2.3, -3.6, 0.03, 3.6, 0.03, WOOD_PALE);
    // the stork's pole: a cartwheel of sticks on top
    b.at(F.x - 9, fy, F.z + 6);
    b.cyl(0, 0, 0, 0.13, 0.1, 8.2, 7, WOOD_DARK, 0, WOOD);
    b.cyl(0, 8.2, 0, 0.5, 0.85, 0.35, 9, [0.17, 0.13, 0.09], 0, [0.24, 0.19, 0.13]);
    b.cyl(0, 8.55, 0, 0.1, 0.07, 0.55, 5, [0.82, 0.82, 0.8]);
    b.box(0.02, 9.12, 0.12, 0.05, 0.05, 0.3, [0.75, 0.2, 0.12]);
  }
  // --- fences
  for (const line of PLACES.fences) fence(b, line, r);
  // --- boulders: by the lake, in the meadow, on the beach
  const stones: V3[] = [[-9, -39, 0.7], [-11.2, -40.5, 0.4], [-71, -46, 0.9], [-73.5, -44.5, 0.5], [-24, 6, 0.55], [17, -9, 0.45], [18.2, -10.4, 0.25], [-14, 22, 0.5], [9, 150, 1.1], [11.5, 152, 0.6], [-22, 163, 0.9], [-5.5, P.z0 + 2, 0.5], [30, 170, 1.3], [-48, 158, 0.7], [-3, -55, 0.4], [5, -60, 0.5]];
  for (const [x, z, s] of stones) {
    b.at(x, landH(x, z), z, r() * 6);
    b.rock(0, 0, 0, s, r() * 20, [STONE[0] * (0.85 + r() * 0.3), STONE[1] * (0.85 + r() * 0.3), STONE[2] * (0.9 + r() * 0.25)]);
  }
  // --- the village: houses loosely round a white church with a dark spire
  const Vg = PLACES.village;
  const cy = landH(Vg.x, Vg.z) - 0.4;
  b.at(Vg.x, cy, Vg.z, 0.25);
  b.box(0, 3.6, 3, 8.5, 7.2, 19, PLASTER);
  b.roof(0, 7.2, 3, 8.5, 19, 5.2, TILE, PLASTER);
  b.box(0, 9, -8.5, 6, 18, 6, PLASTER);
  b.cyl(0, 18, -8.5, 4.3, 0.12, 13.5, 4, [0.17, 0.2, 0.2], 0, [0.2, 0.24, 0.24]);
  b.box(0, 32.3, -8.5, 0.16, 1.9, 0.16, [0.6, 0.5, 0.2], 0.3);
  b.box(0, 32.8, -8.5, 0.9, 0.16, 0.16, [0.6, 0.5, 0.2], 0.3);
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) b.box(side * 4.27, 4.2, -2.5 + i * 3.8, 0.06, 3.2, 1.0, [0.5, 0.36, 0.14], 0.9);
  b.box(0, 13.5, -11.52, 1.3, 2.4, 0.06, [0.08, 0.07, 0.07]);
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2 + r() * 0.4;
    const d = 22 + r() * 30;
    const sx = 5 + r() * 2.5;
    const wall: V3 = r() < 0.72 ? [0.21 + r() * 0.05, 0.15 + r() * 0.03, 0.1] : r() < 0.5 ? [0.5, 0.42, 0.2] : PLASTER;
    house(b, Vg.x + Math.cos(a) * d, Vg.z + Math.sin(a) * d * 0.8, r() * 3.1, sx, sx * (1.3 + r() * 0.5), 2.8 + r() * 0.8, wall, r() < 0.3 ? TILE : r() < 0.5 ? [THATCH[0] * 0.7, THATCH[1] * 0.68, THATCH[2] * 0.6] : [0.17, 0.16, 0.15], r);
  }
  // --- the ruined tower on its foothill
  const T = PLACES.tower;
  const ty = landH(T.x, T.z) - 0.6;
  b.at(T.x, ty, T.z);
  b.cyl(0, 0, 0, 5.4, 4.6, 24, 16, [STONE[0] * 0.7, STONE[1] * 0.7, STONE[2] * 0.7], 0, STONE);
  for (let i = 0; i < 10; i++) {
    if (i === 3 || i === 4 || i === 7) continue; // broken away
    const a = (i / 10) * Math.PI * 2;
    b.at(T.x + Math.cos(a) * 4.5, ty + 24, T.z + Math.sin(a) * 4.5, -a);
    b.box(0, 0.9 + (i % 2) * 0.5, 0, 1.2, 1.8 + (i % 2), 1.9, STONE);
  }
  b.at(T.x, ty, T.z, 0.6);
  b.box(9, 3.2, 0, 13, 6.4, 1.6, [STONE[0] * 0.8, STONE[1] * 0.8, STONE[2] * 0.8]);
  b.box(0, 14, 4.75, 0.9, 2.2, 0.2, [0.04, 0.04, 0.045]);
  // --- the lighthouse on the coast
  const Lh = PLACES.lighthouse;
  const ly = landH(Lh.x, Lh.z) - 0.5;
  b.at(Lh.x, ly, Lh.z);
  // a stone plinth, then the tower in bands of white and red, tapering, its door and small windows
  b.cyl(0, -1, 0, 4.0, 3.7, 2.6, 16, [0.3, 0.29, 0.27], 0, [0.36, 0.34, 0.31]);
  const LH = 26;
  const R0 = 3.15;
  const R1 = 2.05;
  const rAt = (y: number) => R0 + (R1 - R0) * (y / LH);
  const BANDS = 7;
  for (let i = 0; i < BANDS; i++) {
    const y0 = 1.6 + (i / BANDS) * (LH - 1.6);
    const y1 = 1.6 + ((i + 1) / BANDS) * (LH - 1.6);
    const red = i % 2 === 1;
    const c: [number, number, number] = red ? [0.5, 0.12, 0.09] : [0.82, 0.8, 0.76];
    b.cyl(0, y0, 0, rAt(y0), rAt(y1), y1 - y0, 24, c, 0, c);
  }
  b.box(0, 2.9, rAt(2.9) - 0.02, 1.1, 2.3, 0.12, [0.15, 0.1, 0.07]);
  for (let i = 0; i < 4; i++) {
    const y = 7 + i * 5;
    const a = i * 1.7;
    b.at(Lh.x + Math.cos(a) * rAt(y), ly, Lh.z + Math.sin(a) * rAt(y), -a + Math.PI / 2);
    b.box(0, y, 0, 0.55, 0.9, 0.12, [0.08, 0.08, 0.1], 0.3);
  }
  b.at(Lh.x, ly, Lh.z);
  // the gallery: a dark iron platform on corbels, a railing of posts and a rail
  b.cyl(0, LH, 0, 3.3, 3.3, 0.3, 24, [0.12, 0.12, 0.13]);
  b.cyl(0, LH - 0.6, 0, 2.15, 3.3, 0.6, 24, [0.7, 0.68, 0.64]);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    b.box(Math.cos(a) * 3.15, LH + 0.8, Math.sin(a) * 3.15, 0.06, 1.0, 0.06, [0.1, 0.1, 0.11]);
  }
  b.cyl(0, LH + 1.25, 0, 3.18, 3.18, 0.07, 28, [0.1, 0.1, 0.11]);
  // the lantern room: glass in a cage of mullions, the lamp lit within; a dome, a vent ball, a vane
  b.cyl(0, LH + 0.3, 0, 1.7, 1.7, 0.6, 16, [0.12, 0.12, 0.13]);
  b.cyl(0, LH + 0.9, 0, 1.55, 1.55, 2.4, 16, LAMP, 1.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.box(Math.cos(a) * 1.6, LH + 2.1, Math.sin(a) * 1.6, 0.07, 2.4, 0.07, [0.1, 0.1, 0.11]);
  }
  b.cyl(0, LH + 3.3, 0, 1.95, 0.25, 1.5, 16, [0.12, 0.13, 0.13]);
  b.cyl(0, LH + 4.8, 0, 0.25, 0.25, 0.4, 8, [0.12, 0.13, 0.13]);
  b.box(0, LH + 5.6, 0, 0.04, 1.4, 0.04, [0.1, 0.1, 0.1]);
  b.box(0.25, LH + 6.0, 0, 0.6, 0.12, 0.02, [0.1, 0.1, 0.1]);
  // the keeper's house beside it: white walls, a red roof, its chimney, a low wall round the yard
  b.box(6.2, 2.0, 3.2, 6, 4, 7, PLASTER);
  b.roof(6.2, 4, 3.2, 6, 7, 2.8, TILE, PLASTER);
  b.box(7.6, 6.2, 3.2, 0.6, 2.2, 0.6, PLASTER);
  for (const z of [0.6, 3.2, 5.8]) b.box(9.22, 2.2, z, 0.06, 1.1, 0.8, [0.5, 0.36, 0.14], 0.9);
  b.box(3.2, 2.2, 6.72, 0.9, 1.1, 0.06, [0.5, 0.36, 0.14], 0.9);
  for (const [x0, z0, x1, z1] of [
    [-5, -5, 11, -5],
    [11, -5, 11, 9],
    [11, 9, -5, 9],
  ] as [number, number, number, number][]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    b.at(Lh.x + (x0 + x1) / 2, ly, Lh.z + (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2);
    b.box(0, 0.5, 0, len, 1.0, 0.45, [0.34, 0.32, 0.29]);
  }
  return b.geometry();
}

export function Props() {
  const { geo, mat } = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...HOME_U },
      vertexShader: /* glsl */ `
        attribute vec3 aCol; attribute vec2 aAux;
        varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying vec2 vAux;
        void main(){
          vWorld = position; vN = normal; vCol = aCol; vAux = aAux;
          gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying vec2 vAux;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_HOME_AIR}
        void main(){
          vec3 n = normalize(vN);
          if (!gl_FrontFacing) n = -n;
          // the grain of the thing: boards, stone and plaster are never one flat tone
          float g = vnoise(vWorld.xz * 7.0 + vWorld.y * 5.0) * 0.6 + vnoise(vWorld.xy * 23.0 + vWorld.z * 17.0) * 0.4;
          vec3 alb = vCol * (0.82 + 0.36 * g);
          float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
          float ndl = max(dot(n, uKeyDir), 0.0);
          // where it meets the ground it stands in its own shade, and under anything it is darker
          float ao = mix(0.45, 1.0, smoothstep(0.0, 0.7, vAux.y)) * mix(0.62, 1.0, n.y * 0.5 + 0.5);
          vec3 col = alb * (uSkyCol * (0.55 + 0.45 * n.y) * ao + uKeyCol * ndl * 0.95 * cloudShade(vWorld) * sunUp * mix(0.7, 1.0, ao));
          // lamps and windows: plain by day, warm after dusk
          float lit = vAux.x * smoothstep(0.1, 0.5, uNight + (1.0 - sunUp));
          col = mix(col, vCol * (1.4 + 2.2 * vAux.x), clamp(lit, 0.0, 1.0));
          col = homeAir(col, vWorld);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: timed("props", build), mat };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} frustumCulled={false} onUpdate={(m) => m.layers.enable(MIRROR_LAYER)} />;
}

// The lantern's light on the pier, and the lighthouse's lamp turning: two soft glows that are only there after dusk.
export function PropLights() {
  const { geo, mat } = useMemo(() => {
    const P = PLACES.pier;
    const Lh = PLACES.lighthouse;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const S = PLACES.shrine;
    const at = [P.x - 0.32, SEA + 0.95 + 1.82, P.z1 - 0.3, 0.55, Lh.x, landH(Lh.x, Lh.z) - 0.5 + 28.1, Lh.z, 7.0, S.x, landH(S.x, S.z) + 2.35, S.z + 0.2, 0.3];
    g.setAttribute("aAt", new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
    g.instanceCount = 3;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U },
      vertexShader: /* glsl */ `
        attribute vec4 aAt; varying vec2 vUv; varying float vK;
        uniform float uTime; uniform float uNight; uniform vec3 uSunDir;
        void main(){
          vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float on = smoothstep(0.1, 0.5, uNight + (1.0 - smoothstep(-0.02, 0.08, uSunDir.y)));
          // the lighthouse's lamp comes round every eight seconds
          float sweep = aAt.w > 5.0 ? 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 0.785), 6.0) : 0.85 + 0.15 * sin(uTime * 7.0 + aAt.x);
          vK = on * sweep;
          vUv = position.xy;
          vec3 wp = aAt.xyz + (R * position.x + U * position.y) * aAt.w * (vK > 0.001 ? 1.0 : 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vK;
        void main(){
          float r = length(vUv);
          float a = (exp(-r * r * 9.0) * 0.9 + exp(-r * r * 2.2) * 0.22) * smoothstep(1.0, 0.7, r) * vK;
          gl_FragColor = vec4(vec3(1.0, 0.68, 0.32) * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={6} />;
}
