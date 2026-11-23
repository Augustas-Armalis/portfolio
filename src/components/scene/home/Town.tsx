"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { voyage } from "../worlds/voyage";
import { farBlock, makeFarMaterial, makeHomeTreeMaterial } from "./Forest";
import { CHURCH, HILL, SQUARE, TOWN, hillRoadA, joinD, laneD, riverD, riverSlope, riverW, riverWL, riverZ, routeD, sst } from "./journey";
import { GLSL_HOME_AIR, HOME_U, landH, rng, timed, type HomeTree, type TreeKind } from "./land";
import { buildTree, makeFarTreeTexture, makeLeafTexture } from "./trees";

// The town on the river (journey.ts): a Lithuanian wooden town as at Rumšiškės or in old Kėdainiai, and over it a
// red-brick castle on its hill as at Trakai. Log houses with steep shingled or thatched roofs, carved white window
// surrounds and coloured shutters, crossed horse-head boards (žirgeliai) on the gables; the houses stand along both
// quays and climb the castle hill in terraces. On the south bank the market square with its well and stalls, and the
// white wooden church with its tower; over the river an arched wooden footbridge; at the rapids a watermill whose
// wheel turns; roofed pole shrines (koplytstulpiai) at the town's ends; storks on their nests and in the air;
// smoke from the chimneys; and lanterns that kindle one after another ahead of the plane as it comes down the river.
//
// All the stone, wood and paint is one mesh and one small shader: the logs, boards, shingles, bricks and windows are
// painted at the pixel from each face's own metres (so nothing is laid on anything and nothing can fight for
// depth), and every pattern fades to its average before it is finer than a pixel.

type V3 = [number, number, number];
type M4 = [number, number, number, number];
// kinds of surface (the shader paints each)
export const K = { paint: 0, logs: 1, boards: 2, shingle: 3, trim: 4, lamp: 5, stone: 6, brick: 7, tile: 8, thatch: 9 } as const;

const ROCK = new THREE.IcosahedronGeometry(1, 2);
export class TB {
  // (the vertices go straight into typed arrays that grow in chunks: nothing is allocated per vertex or per quad)
  private cap = 0;
  n = 0;
  private ni = 0;
  pos = new Float32Array(0);
  nor = new Float32Array(0);
  col = new Float32Array(0);
  uv = new Float32Array(0);
  mat = new Float32Array(0);
  ao = new Float32Array(0);
  idx = new Uint32Array(0);
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private c = 1;
  private s = 0;
  // (the ground under the thing being built, found once per thing: the shader's foot-shade only needs it roughly)
  private gy = 0;
  private gx = NaN;
  private gz = NaN;
  private grow(verts: number, inds: number) {
    if (this.n + verts > this.cap) {
      const cap = Math.max(1024, (this.n + verts) * 2);
      const re = (a: Float32Array, k: number) => {
        const b = new Float32Array(cap * k);
        b.set(a.subarray(0, this.n * k));
        return b;
      };
      this.pos = re(this.pos, 3);
      this.nor = re(this.nor, 3);
      this.col = re(this.col, 3);
      this.uv = re(this.uv, 2);
      this.mat = re(this.mat, 4);
      this.ao = re(this.ao, 1);
      this.cap = cap;
    }
    if (this.ni + inds > this.idx.length) {
      const b = new Uint32Array(Math.max(2048, (this.ni + inds) * 2));
      b.set(this.idx.subarray(0, this.ni));
      this.idx = b;
    }
  }
  at(x: number, y: number, z: number, rot = 0) {
    if (x !== this.gx || z !== this.gz) {
      this.gx = x;
      this.gz = z;
      this.gy = landH(x, z);
    }
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
    return this;
  }
  // a local point to the world
  w(p: V3): V3 {
    return [this.ox + p[0] * this.c + p[2] * this.s, this.oy + p[1], this.oz - p[0] * this.s + p[2] * this.c];
  }
  private v(px: number, py: number, pz: number, nx: number, ny: number, nz: number, col: V3, u: number, w: number, m: M4) {
    const i = this.n++;
    const c = this.c;
    const s = this.s;
    const wy = this.oy + py;
    this.pos[i * 3] = this.ox + px * c + pz * s;
    this.pos[i * 3 + 1] = wy;
    this.pos[i * 3 + 2] = this.oz - px * s + pz * c;
    this.nor[i * 3] = nx * c + nz * s;
    this.nor[i * 3 + 1] = ny;
    this.nor[i * 3 + 2] = -nx * s + nz * c;
    this.col[i * 3] = col[0];
    this.col[i * 3 + 1] = col[1];
    this.col[i * 3 + 2] = col[2];
    this.uv[i * 2] = u;
    this.uv[i * 2 + 1] = w;
    this.mat[i * 4] = m[0];
    this.mat[i * 4 + 1] = m[1];
    this.mat[i * 4 + 2] = m[2];
    this.mat[i * 4 + 3] = m[3];
    this.ao[i] = wy - this.gy;
    return i;
  }
  // a quad a b c d, with its uv in metres (by default u along a->b, v along a->d)
  quad(a: V3, b: V3, c: V3, d: V3, col: V3, m: M4, uv?: [number, number][]) {
    this.grow(4, 6);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    let i: number;
    if (uv) {
      i = this.v(a[0], a[1], a[2], nx, ny, nz, col, uv[0][0], uv[0][1], m);
      this.v(b[0], b[1], b[2], nx, ny, nz, col, uv[1][0], uv[1][1], m);
      this.v(c[0], c[1], c[2], nx, ny, nz, col, uv[2][0], uv[2][1], m);
      this.v(d[0], d[1], d[2], nx, ny, nz, col, uv[3][0], uv[3][1], m);
    } else {
      const lu = Math.hypot(ux, uy, uz);
      const lv = Math.hypot(vx, vy, vz);
      i = this.v(a[0], a[1], a[2], nx, ny, nz, col, 0, 0, m);
      this.v(b[0], b[1], b[2], nx, ny, nz, col, lu, 0, m);
      this.v(c[0], c[1], c[2], nx, ny, nz, col, lu, lv, m);
      this.v(d[0], d[1], d[2], nx, ny, nz, col, 0, lv, m);
    }
    const k = this.ni;
    this.idx[k] = i;
    this.idx[k + 1] = i + 1;
    this.idx[k + 2] = i + 2;
    this.idx[k + 3] = i;
    this.idx[k + 4] = i + 2;
    this.idx[k + 5] = i + 3;
    this.ni += 6;
  }
  tri(a: V3, b: V3, c: V3, col: V3, m: M4, uv: [number, number][]) {
    this.grow(3, 3);
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const i = this.v(a[0], a[1], a[2], nx, ny, nz, col, uv[0][0], uv[0][1], m);
    this.v(b[0], b[1], b[2], nx, ny, nz, col, uv[1][0], uv[1][1], m);
    this.v(c[0], c[1], c[2], nx, ny, nz, col, uv[2][0], uv[2][1], m);
    const k = this.ni;
    this.idx[k] = i;
    this.idx[k + 1] = i + 1;
    this.idx[k + 2] = i + 2;
    this.ni += 3;
  }
  // a rounded stone: a lumpy ball, flattened and sunk a little (its lumps from sines, so it is the same every load)
  rock(cx: number, cy: number, cz: number, r: number, seed: number, col: V3) {
    const g = ROCK;
    const p = g.attributes.position;
    const P = (i: number): V3 => {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.22 * Math.sin(x * 3.1 + seed) * Math.sin(y * 2.7 + seed * 1.7) + 0.14 * Math.sin(z * 4.3 + seed * 2.3 + x * 2.1);
      return [cx + x * r * k, cy + y * r * 0.6 * k + r * 0.15, cz + z * r * 0.9 * k];
    };
    // (the icosphere comes unindexed: every three vertices a face)
    for (let t = 0; t < p.count; t += 3) this.tri(P(t), P(t + 1), P(t + 2), col, [K.stone, 0, 0, 0], [[0, 0], [r, 0], [0, r]]);
  }
  // a wall from (x0, z0) to (x1, z1), y0 to y1; windows every `win` m (style: 0 house, 1 church, 2 castle slit, 3 one gable window)
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, col: V3, kind: number, win = 0, accent = 0, style = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], col, [kind, win, len, accent + style * 10]);
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: V3, kind: number = K.paint, top = true) {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const m: M4 = [kind, 0, 0, 0];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, m);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, m);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, m);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, m);
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col, m);
  }
  // an upright round thing r0 -> r1 over h (a cone when r1 is 0); uv: round the girth, up the side
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, sides: number, col: V3, kind: number = K.paint, win = 0, cap = true) {
    const girth = 2 * Math.PI * r0;
    const sl = Math.hypot(h, r0 - r1);
    const p = (a: number, r: number, y: number): V3 => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const u0 = (i / sides) * girth;
      const u1 = ((i + 1) / sides) * girth;
      this.quad(p(a1, r0, y0), p(a0, r0, y0), p(a0, r1, y0 + h), p(a1, r1, y0 + h), col, [kind, win, girth / sides, 20], [
        [u1, 0],
        [u0, 0],
        [u0, sl],
        [u1, sl],
      ]);
    }
    if (cap && r1 > 0.01)
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        this.tri([cx, y0 + h, cz], p(a1, r1, y0 + h), p(a0, r1, y0 + h), col, [kind, 0, 0, 0], [
          [0, 0],
          [r1, 0],
          [0, r1],
        ]);
      }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    const n = this.n;
    g.setAttribute("position", new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3));
    g.setAttribute("aCol", new THREE.BufferAttribute(this.col.slice(0, n * 3), 3));
    g.setAttribute("aUV", new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    g.setAttribute("aMat", new THREE.BufferAttribute(this.mat.slice(0, n * 4), 4));
    g.setAttribute("aAO", new THREE.BufferAttribute(this.ao.slice(0, n), 1));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? this.idx.slice(0, this.ni) : new Uint16Array(this.idx.subarray(0, this.ni)), 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- palette (linear, before the lens) ----------
const LOG: V3 = [0.17, 0.115, 0.075];
const LOG_GREY: V3 = [0.2, 0.18, 0.155];
const WHITE: V3 = [0.78, 0.76, 0.7];
const SHINGLE: V3 = [0.2, 0.18, 0.16];
const THATCH: V3 = [0.3, 0.25, 0.14];
const TILE: V3 = [0.24, 0.095, 0.06];
const STONE: V3 = [0.33, 0.31, 0.28];
const BRICK: V3 = [0.22, 0.095, 0.065];
const DARK: V3 = [0.07, 0.055, 0.045];
const WOOD: V3 = [0.26, 0.2, 0.14];
const PAINTED: V3[] = [
  [0.42, 0.33, 0.16], // ochre
  [0.28, 0.34, 0.28], // pale green
  [0.3, 0.35, 0.4], // pale blue
  [0.46, 0.41, 0.32], // sand
];

const ground = (x: number, z: number) => landH(x, z);
// the fine things of each house (frames, sills, shutters, doors, lamps) go in a mesh of their own, drawn only near
let DET: TB = new TB();
let LAMPS: number[][] = [];
const ACCENT: V3[] = [
  [0.08, 0.2, 0.42],
  [0.1, 0.26, 0.16],
  [0.42, 0.26, 0.06],
  [0.36, 0.08, 0.06],
];
// the windows of a wall, built as the shader places them: frames, sill, carved head, shutters
function windowsOn(b: TB, x0: number, z0: number, x1: number, z1: number, win: number, accent: number, y0 = 0) {
  if (win <= 0) return;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const one = win > 50;
  const n = one ? 1 : Math.max(1, Math.floor((len - 0.8) / win));
  const first = one ? len / 2 : (len - (n - 1) * win) / 2;
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  // (outward: the wall's right hand, walking from 0 to 1)
  const ox = -dz;
  const oz = dx;
  const at = (u: number, v: number, out: number): V3 => [x0 + dx * u + ox * out, y0 + v, z0 + dz * u + oz * out];
  // a slab lying in the wall's plane: centre (u, v), half sizes, standing out from `o0` to `o1`
  const slab = (u: number, v: number, hu: number, hv: number, o0: number, o1: number, col: V3, kind: number = K.paint) => {
    const m: M4 = [kind, 0, 0, 0];
    const a = at(u - hu, v - hv, o1);
    const bq = at(u + hu, v - hv, o1);
    const c = at(u + hu, v + hv, o1);
    const d = at(u - hu, v + hv, o1);
    b.quad(a, bq, c, d, col, m);
    b.quad(at(u - hu, v + hv, o0), d, c, at(u + hu, v + hv, o0), col, m);
    b.quad(at(u - hu, v - hv, o0), at(u + hu, v - hv, o0), bq, a, col, m);
    b.quad(at(u - hu, v - hv, o0), a, d, at(u - hu, v + hv, o0), col, m);
    b.quad(at(u + hu, v - hv, o0), at(u + hu, v + hv, o0), c, bq, col, m);
  };
  for (let i = 0; i < n; i++) {
    const u = first + i * win;
    const v = 1.55;
    // the white frame, its sill, a carved head over it
    slab(u, v + 0.655, 0.53, 0.055, 0, 0.09, WHITE, K.trim);
    slab(u, v - 0.655, 0.53, 0.055, 0, 0.09, WHITE, K.trim);
    slab(u - 0.475, v, 0.055, 0.6, 0, 0.09, WHITE, K.trim);
    slab(u + 0.475, v, 0.055, 0.6, 0, 0.09, WHITE, K.trim);
    slab(u, v - 0.74, 0.62, 0.035, 0, 0.17, WHITE, K.trim);
    slab(u, v + 0.8, 0.64, 0.09, 0, 0.12, WHITE, K.trim);
    const top = at(u, v + 1.12, 0.06);
    b.tri(at(u - 0.6, v + 0.89, 0.06), at(u + 0.6, v + 0.89, 0.06), top, WHITE, [K.trim, 0, 0, 0], [[0, 0], [1.2, 0], [0.6, 0.23]]);
    // the shutters, open, in the house's colour
    if (!one) for (const s of [-1, 1]) slab(u + s * 0.79, v, 0.23, 0.6, 0.02, 0.07, ACCENT[accent % 4], K.boards);
  }
}
// the lowest and highest ground under a footprint (a local box round the builder's origin)
function footRange(b: TB, hx: number, hz: number) {
  let lo = 1e9;
  let hi = -1e9;
  for (const [x, z] of [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
    [0, 0],
    [0, hz],
    [0, -hz],
    [hx, 0],
    [-hx, 0],
  ]) {
    const q = b.w([x, 0, z]);
    const g = ground(q[0], q[2]);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  return { lo, hi };
}

// A wooden house: its long side L along local x, depth D along z (front at +z), walls `h` high, a steep gabled roof.
type HouseOpt = { roof: "shingle" | "thatch" | "tile"; wall: "logs" | "painted" | "grey"; accent: number; porch: boolean; chimney: boolean; horses: boolean; storey?: number };
export function house(b: TB, x: number, z: number, rot: number, L: number, D: number, h: number, o: HouseOpt, det: TB = DET, lamps: number[][] = LAMPS) {
  b.at(x, 0, z, rot);
  const hx = L / 2;
  const hz = D / 2;
  const { lo, hi } = footRange(b, hx + 0.3, hz + 0.3);
  // (on a slope the house is set into it: the uphill side's foot is buried a little, the downhill side stands on stone)
  const c0 = b.w([0, 0, 0]);
  const floor = Math.max(ground(c0[0], c0[2]) + 0.4, hi - 1.3);
  b.at(x, floor, z, rot);
  // the stone footing, down into the lowest ground
  const fh = floor - lo + 0.5;
  b.box(0, -fh / 2, 0, L + 0.3, fh, D + 0.3, STONE, K.stone, false);
  const wallCol = o.wall === "logs" ? LOG : o.wall === "grey" ? LOG_GREY : PAINTED[o.accent % PAINTED.length];
  const wk = o.wall === "painted" ? K.boards : K.logs;
  const H = h * (o.storey ?? 1);
  // walls: the long sides have windows, the gable ends one or two
  b.wall(-hx, hz, hx, hz, 0, H, wallCol, wk, 2.4, o.accent);
  b.wall(hx, -hz, -hx, -hz, 0, H, wallCol, wk, 2.9, o.accent);
  b.wall(hx, hz, hx, -hz, 0, H, wallCol, wk, D > 6.5 ? 2.6 : 99, o.accent);
  b.wall(-hx, -hz, -hx, hz, 0, H, wallCol, wk, 99, o.accent);
  det.at(x, floor, z, rot);
  windowsOn(det, -hx, hz, hx, hz, 2.4, o.accent);
  windowsOn(det, hx, -hz, -hx, -hz, 2.9, o.accent);
  windowsOn(det, hx, hz, hx, -hz, D > 6.5 ? 2.6 : 99, o.accent);
  windowsOn(det, -hx, -hz, -hx, hz, 99, o.accent);
  // the ridge board, and under the eaves at each gable a pair of carved brackets
  det.box(0, H + D * (o.roof === "thatch" ? 0.8 : 0.7) + 0.06, 0, L + (o.roof === "thatch" ? 1.5 : 1.0), 0.14, 0.22, o.roof === "thatch" ? [0.22, 0.18, 0.1] : DARK, K.boards);
  // a door in the front, with its frame, a step and a lamp beside it (kindled as the plane goes by, lit after dusk)
  if (!o.porch) {
    const du = hx * 0.45;
    det.box(du, 1.05, hz + 0.05, 1.1, 2.1, 0.08, [0.16, 0.1, 0.06], K.boards);
    det.box(du, 2.18, hz + 0.08, 1.35, 0.14, 0.14, WHITE, K.trim);
    for (const s of [-1, 1]) det.box(du + s * 0.62, 1.05, hz + 0.08, 0.12, 2.15, 0.14, WHITE, K.trim);
    det.box(du, -0.12, hz + 0.45, 1.5, 0.3, 0.8, STONE, K.stone);
    if (o.accent !== 1) {
      det.box(du + 0.95, 2.05, hz + 0.18, 0.22, 0.3, 0.22, [1.0, 0.72, 0.36], K.lamp);
      det.box(du + 0.95, 2.25, hz + 0.18, 0.3, 0.08, 0.3, DARK);
      const p = det.w([du + 0.95, 2.05, hz + 0.3]);
      lamps.push([...p, 0.45, p[0] + 24]);
      // (the glass kindles with the plane's progress: its key is in the lamp's own aMat.y)
    }
  }
  // log ends standing out at the corners
  if (wk === K.logs)
    for (const [cx, cz] of [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ])
      b.box(cx, H / 2, cz, 0.4, H, 0.4, [wallCol[0] * 0.8, wallCol[1] * 0.8, wallCol[2] * 0.8], K.logs);
  // the roof: steep, the ridge along x, deep eaves
  const rh = D * (o.roof === "thatch" ? 0.8 : 0.7);
  const e = o.roof === "thatch" ? 0.75 : 0.5;
  const rk = o.roof === "thatch" ? K.thatch : o.roof === "tile" ? K.tile : K.shingle;
  const rc = o.roof === "thatch" ? THATCH : o.roof === "tile" ? TILE : SHINGLE;
  const ex = hx + e;
  const ez = hz + e;
  const ey = H - e * (rh / hz);
  const slope = Math.hypot(ez, H + rh - ey);
  const ruv: [number, number][] = [
    [0, 0],
    [2 * ex, 0],
    [2 * ex, slope],
    [0, slope],
  ];
  b.quad([-ex, ey, ez], [ex, ey, ez], [ex, H + rh, 0], [-ex, H + rh, 0], rc, [rk, 0, 0, 0], ruv);
  b.quad([ex, ey, -ez], [-ex, ey, -ez], [-ex, H + rh, 0], [ex, H + rh, 0], rc, [rk, 0, 0, 0], ruv);
  if (o.roof === "thatch") {
    // a thatch is thick: its eaves show
    b.quad([-ex, ey - 0.35, ez], [ex, ey - 0.35, ez], [ex, ey, ez], [-ex, ey, ez], rc, [K.thatch, 0, 0, 0]);
    b.quad([ex, ey - 0.35, -ez], [-ex, ey - 0.35, -ez], [-ex, ey, -ez], [ex, ey, -ez], rc, [K.thatch, 0, 0, 0]);
  }
  // the gables: vertical boards, one small window, white carved barge boards along the roof's edges
  const gc: V3 = o.wall === "painted" ? wallCol : [wallCol[0] * 1.15, wallCol[1] * 1.1, wallCol[2] * 1.05];
  const gt = H + rh * (hz / ez) * 0.98;
  for (const sx of [-1, 1]) {
    const gx = sx * hx;
    const m: M4 = [K.boards, 99, D, o.accent + 30];
    if (sx > 0) b.tri([gx, H, hz], [gx, H, -hz], [gx, gt, 0], gc, m, [[0, 0], [D, 0], [hz, gt - H]]);
    else b.tri([gx, H, -hz], [gx, H, hz], [gx, gt, 0], gc, m, [[0, 0], [D, 0], [hz, gt - H]]);
    const bx = sx * (ex + 0.03);
    for (const sz of [-1, 1]) {
      const a: V3 = [bx, ey - 0.05, sz * (ez + 0.03)];
      const c: V3 = [bx, H + rh + 0.06, 0];
      b.quad(a, c, [c[0], c[1] - 0.34, 0], [a[0], a[1] - 0.34, a[2]], WHITE, [K.trim, 0, 0, 0]);
    }
    // žirgeliai: two boards crossing over the ridge's end, carved as horses' heads looking out
    if (o.horses)
      for (const sz of [-1, 1]) {
        const p0: V3 = [bx, H + rh - 0.7, sz * 0.62];
        const p1: V3 = [bx, H + rh + 0.95, -sz * 0.45];
        b.quad(p0, p1, [p1[0], p1[1] - 0.22, p1[2] + sz * 0.1], [p0[0], p0[1] - 0.22, p0[2] + sz * 0.1], WHITE, [K.trim, 0, 0, 0]);
        b.quad([bx, p1[1] - 0.25, p1[2]], [bx, p1[1] - 0.18, p1[2] - sz * 0.45], [bx, p1[1] + 0.05, p1[2] - sz * 0.5], [bx, p1[1] + 0.08, p1[2]], WHITE, [K.trim, 0, 0, 0]);
      }
  }
  if (o.chimney) {
    b.box(hx * 0.35, H + rh * 0.55 + 0.6, -0.6, 0.75, rh * 1.1 + 1.2, 0.75, WHITE, K.paint);
    b.box(hx * 0.35, H + rh + 1.2, -0.6, 0.95, 0.16, 0.95, DARK, K.paint);
  }
  if (o.porch) {
    // a small porch at the front with carved posts and its own little gable
    const px = -hx * 0.35;
    b.box(px, 0.12, hz + 0.9, 2.2, 0.24, 1.8, WOOD, K.boards);
    for (const sx of [-1, 1]) b.box(px + sx * 0.95, 1.2, hz + 1.65, 0.14, 2.3, 0.14, WHITE, K.trim);
    const ph = 2.35;
    b.quad([px - 1.2, ph, hz + 1.9], [px, ph + 0.9, hz + 1.9], [px, ph + 0.9, hz], [px - 1.2, ph, hz], rc, [rk, 0, 0, 0]);
    b.quad([px, ph + 0.9, hz + 1.9], [px + 1.2, ph, hz + 1.9], [px + 1.2, ph, hz], [px, ph + 0.9, hz], rc, [rk, 0, 0, 0]);
    b.tri([px - 1.1, ph, hz + 1.88], [px + 1.1, ph, hz + 1.88], [px, ph + 0.82, hz + 1.88], WHITE, [K.trim, 0, 0, 0], [[0, 0], [2.2, 0], [1.1, 0.8]]);
  }
  return { floor, top: floor + H + rh };
}

// a lantern on a post; its light (x, y, z, size, the plane's x at which it kindles) goes in `lamps`
function lantern(b: TB, x: number, z: number, lamps: number[][], kindle: number) {
  const g = ground(x, z);
  b.at(x, g - 0.2, z, 0);
  b.cyl(0, 0, 0, 0.16, 0.13, 0.5, 8, DARK);
  b.cyl(0, 0.5, 0, 0.08, 0.06, 2.9, 8, DARK);
  b.cyl(0, 3.35, 0, 0.12, 0.2, 0.08, 8, DARK);
  b.box(0, 3.62, 0, 0.3, 0.44, 0.3, [1.0, 0.72, 0.36], K.lamp);
  for (const [cx, cz] of [
    [-0.16, -0.16],
    [0.16, -0.16],
    [0.16, 0.16],
    [-0.16, 0.16],
  ])
    b.box(cx, 3.62, cz, 0.035, 0.48, 0.035, DARK);
  b.cyl(0, 3.86, 0, 0.27, 0.05, 0.26, 4, DARK);
  b.cyl(0, 4.1, 0, 0.04, 0.0, 0.16, 6, DARK);
  lamps.push([x, g - 0.2 + 3.62, z, 0.9, kindle]);
}

// a roofed pole shrine (koplytstulpis): a carved oak post, on it a little house with a tent roof and an iron sun
function shrine(b: TB, x: number, z: number, rot: number, lamps: number[][]) {
  const g = ground(x, z);
  b.at(x, g - 0.3, z, rot);
  b.box(0, 1.9, 0, 0.32, 3.8, 0.32, [0.24, 0.19, 0.14], K.boards);
  for (let i = 0; i < 3; i++) b.box(0, 1.2 + i * 0.9, 0, 0.42, 0.12, 0.42, [0.3, 0.24, 0.17], K.boards);
  b.box(0, 4.15, 0, 0.9, 0.7, 0.9, [0.27, 0.21, 0.15], K.boards);
  b.quad([-0.25, 3.9, 0.452], [0.25, 3.9, 0.452], [0.25, 4.4, 0.452], [-0.25, 4.4, 0.452], [1.0, 0.75, 0.42], [K.lamp, x + 20, 0, 0]);
  b.cyl(0, 4.5, 0, 0.82, 0.0, 0.85, 4, SHINGLE, K.shingle);
  // the iron sun on top: a cross in a ring of rays
  b.box(0, 5.75, 0, 0.05, 0.9, 0.05, DARK);
  b.box(0, 5.85, 0, 0.5, 0.05, 0.05, DARK);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(Math.cos(a) * 0.24, 5.85 + Math.sin(a) * 0.24, 0, 0.16, 0.025, 0.025, DARK);
  }
  lamps.push([...b.w([0, 4.15, 0.6]), 0.35, x + 20]);
}

// a rowing boat on the water, its axis along the stream
function boat(b: TB, x: number, z: number, rot: number) {
  b.at(x, riverWL(x) + 0.05, z, rot);
  const L = 3.8;
  const W = 0.62;
  const N = 8;
  const wAt = (u: number) => W * Math.pow(Math.sin(Math.PI * (0.04 + u * 0.92)), 0.6);
  for (let i = 0; i < N; i++) {
    const u0 = i / N;
    const u1 = (i + 1) / N;
    const zA = (u0 - 0.5) * L;
    const zB = (u1 - 0.5) * L;
    for (const s of [-1, 1]) b.quad([s * wAt(u0), 0.35, zA], [s * wAt(u1), 0.35, zB], [s * wAt(u1) * 0.55, -0.12, zB], [s * wAt(u0) * 0.55, -0.12, zA], [0.26, 0.19, 0.12], [K.boards, 0, 0, 0]);
    b.quad([-wAt(u0) * 0.55, -0.1, zA], [wAt(u0) * 0.55, -0.1, zA], [wAt(u1) * 0.55, -0.1, zB], [-wAt(u1) * 0.55, -0.1, zB], [0.42, 0.33, 0.22], [K.boards, 0, 0, 0]);
  }
  b.box(0, 0.12, 0.2, W * 1.6, 0.05, 0.28, [0.35, 0.28, 0.19], K.boards);
}

const BRIDGE_X = -258;
const MILL_X = -132;

function* buildTownSteps() {
  const b = new TB();
  DET = new TB();
  LAMPS = [];
  const r = rng(9157);
  const lamps: number[][] = LAMPS;
  const smoke: number[][] = [];
  const nests: V3[] = [];
  const gardens: [number, number, TreeKind, number][] = [];
  const taken: [number, number, number][] = [];
  // (nothing is built within reach of the flight's line: the eye follows the plane close behind it)
  const free = (x: number, z: number, rad: number) => routeD(x, z) > rad + 9 && laneD(x, z).d > rad + 9 && joinD(x, z) > rad + 4 && taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > rad + tr);
  const take = (x: number, z: number, rad: number) => taken.push([x, z, rad]);
  // the river's frame at x: along it (downstream, toward -x) and across it (toward the south bank)
  const frame = (x: number) => {
    const sl = riverSlope(x);
    const n = Math.sqrt(1 + sl * sl);
    return { ax: -1 / n, az: -sl / n, nx: -sl / n, nz: 1 / n };
  };
  const bankPt = (x: number, side: number, off: number): [number, number] => {
    const f = frame(x);
    return [x + f.nx * side * off, riverZ(x) + f.nz * side * off];
  };
  // kept clear: the castle's head, the square, the church, the mill
  take(HILL.x, HILL.z, HILL.top + 3);
  take(SQUARE.x, SQUARE.z, 19);
  take(CHURCH.x, CHURCH.z, 17);

  yield;
  // ----- the castle on the hill (as Trakai's or Kaunas's): an irregular ring of red-brick wall following the hill's
  // head, towers of different heights round it (round ones with tall cones, a square gate tower), the tall round keep
  // with a turret beside it, a small white chapel with its own spire, pennants on the points, warm slit windows
  {
    const gy = ground(HILL.x, HILL.z) - 0.5;
    const rot = Math.atan2(TOWN.x - HILL.x, TOWN.z - HILL.z);
    b.at(HILL.x, gy, HILL.z, rot);
    const wh = 8.5;
    // the ring: six corners at their own distances (local: the gate at +z)
    const ring: [number, number][] = [0.2, 1.15, 2.05, 3.0, 4.05, 5.15].map((a, i) => {
      const rr = [13, 15, 12.5, 14.5, 12, 15.5][i];
      return [Math.sin(a) * rr, Math.cos(a) * rr];
    });
    for (let i = 0; i < ring.length; i++) {
      const [x0, z0] = ring[i];
      const [x1, z1] = ring[(i + 1) % ring.length];
      b.wall(x0, z0, x1, z1, -3, wh, BRICK, K.brick, 0);
      b.wall(x1 * 0.92, z1 * 0.92, x0 * 0.92, z0 * 0.92, -3, wh, BRICK, K.brick, 0);
      b.quad([x0, wh, z0], [x1, wh, z1], [x1 * 0.92, wh, z1 * 0.92], [x0 * 0.92, wh, z0 * 0.92], [0.22, 0.17, 0.13], [K.stone, 0, 0, 0]);
      const n = Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.6);
      for (let k = 0; k < n; k += 2) {
        const t = (k + 0.5) / n;
        b.box(x0 + (x1 - x0) * t, wh + 0.45, z0 + (z1 - z0) * t, 0.75, 0.9, 0.75, BRICK, K.brick);
      }
    }
    // towers on the corners: round, each its own height, tall red cones, a pennant on the point
    const pennant = (x: number, y: number, z: number, col: V3) => {
      b.box(x, y + 1.0, z, 0.06, 2.0, 0.06, DARK);
      b.tri([x, y + 2.0, z], [x, y + 1.4, z], [x + 1.6, y + 1.75, z + 0.3], col, [K.paint, 0, 0, 0], [[0, 0], [0, 0.6], [1.6, 0.3]]);
    };
    ring.forEach(([cx, cz], i) => {
      if (i === 0) return;
      const th = wh + 4 + ((i * 37) % 5) * 1.6;
      const tr = 2.6 + ((i * 13) % 3) * 0.35;
      b.cyl(cx, -3, cz, tr, tr * 0.92, th + 3, 12, BRICK, K.brick, 2.6);
      b.cyl(cx, th - 0.4, cz, tr * 1.12, tr * 1.12, 0.6, 12, [0.2, 0.15, 0.1], K.boards, 0, false);
      b.cyl(cx, th, cz, tr * 1.15, 0.0, tr * 3.2, 12, TILE, K.tile);
      pennant(cx, th + tr * 3.2 - 0.2, cz, i % 2 ? [0.55, 0.08, 0.05] : [0.75, 0.55, 0.1]);
      lamps.push([...b.w([cx * 1.12, th - 2.5, cz * 1.12]), 0.55, HILL.x + 40]);
    });
    // the gate tower over the first corner: square, its pointed arch toward the town
    const [gx, gz] = ring[0];
    b.at(HILL.x, gy, HILL.z, rot);
    b.box(gx, wh / 2 + 3, gz, 6, wh + 12, 5.5, BRICK, K.brick);
    b.cyl(gx, wh + 9, gz, 4.4, 0, 6, 4, TILE, K.tile);
    pennant(gx, wh + 14.6, gz, [0.55, 0.08, 0.05]);
    b.quad([gx - 1.4, -0.5, gz + 2.78], [gx + 1.4, -0.5, gz + 2.78], [gx + 1.4, 3.2, gz + 2.78], [gx - 1.4, 3.2, gz + 2.78], DARK, [K.paint, 0, 0, 0]);
    b.tri([gx - 1.4, 3.2, gz + 2.78], [gx + 1.4, 3.2, gz + 2.78], [gx, 4.8, gz + 2.78], DARK, [K.paint, 0, 0, 0], [[0, 0], [2.8, 0], [1.4, 1.6]]);
    lamps.push([...b.w([gx - 2.2, 3.8, gz + 3.1]), 0.7, HILL.x + 50]);
    lamps.push([...b.w([gx + 2.2, 3.8, gz + 3.1]), 0.7, HILL.x + 50]);
    // the keep: tall and round, a ring of machicolations, its cone, a slimmer turret leaning on it
    b.cyl(-2, -2, -2, 5.2, 4.8, 30, 16, BRICK, K.brick, 2.8);
    b.cyl(-2, 29.5, -2, 5.6, 5.6, 1.0, 16, [0.2, 0.15, 0.1], K.boards, 0, false);
    b.cyl(-2, 30.3, -2, 5.8, 0, 13, 16, TILE, K.tile);
    pennant(-2, 43, -2, [0.75, 0.55, 0.1]);
    // a wooden gallery round the keep's head, on brackets, its own shingled skirt
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      b.box(-2 + Math.cos(a) * 5.9, 27.6, -2 + Math.sin(a) * 5.9, 0.22, 2.4, 0.22, [0.2, 0.15, 0.1], K.boards);
      b.box(-2 + Math.cos(a) * 5.4, 26.2, -2 + Math.sin(a) * 5.4, 0.18, 0.18, 1.2, [0.18, 0.13, 0.09], K.boards);
    }
    b.cyl(-2, 26.4, -2, 6.1, 6.1, 1.2, 18, [0.24, 0.18, 0.12], K.boards, 0, false);
    b.cyl(-2, 28.8, -2, 6.7, 5.4, 0.9, 18, SHINGLE, K.shingle, 0, false);
    b.cyl(2.6, 6, -5.5, 1.9, 1.8, 30, 10, BRICK, K.brick, 2.4);
    b.cyl(2.6, 35.8, -5.5, 2.1, 0, 7, 10, TILE, K.tile);
    // the hall, warm windows along it
    b.box(5, 4.8, 3, 7, 10.5, 12, BRICK, K.brick, false);
    b.wall(1.48, 9, 1.48, -3, 1.5, 9.5, BRICK, K.brick, 2.2, 0, 2);
    b.quad([1.2, 9.5, 9.3], [1.2, 9.5, -3.3], [5, 13.5, -3.3], [5, 13.5, 9.3], TILE, [K.tile, 0, 0, 0]);
    b.quad([8.8, 9.5, -3.3], [8.8, 9.5, 9.3], [5, 13.5, 9.3], [5, 13.5, -3.3], TILE, [K.tile, 0, 0, 0]);
    // the chapel: white plaster, a little shingled spire
    b.box(-6, 3.5, 6, 5, 7, 7.5, WHITE, K.paint, false);
    b.quad([-8.8, 7, 9.9], [-8.8, 7, 2.1], [-6, 10, 2.1], [-6, 10, 9.9], SHINGLE, [K.shingle, 0, 0, 0]);
    b.quad([-3.2, 7, 2.1], [-3.2, 7, 9.9], [-6, 10, 9.9], [-6, 10, 2.1], SHINGLE, [K.shingle, 0, 0, 0]);
    b.box(-6, 11, 9, 1.6, 3, 1.6, WHITE, K.paint);
    b.cyl(-6, 12.5, 9, 1.2, 0, 4, 8, SHINGLE, K.shingle);
    b.box(-6, 17.2, 9, 0.08, 1.4, 0.08, [0.6, 0.5, 0.22]);
    b.box(-6, 17.5, 9, 0.6, 0.08, 0.08, [0.6, 0.5, 0.22]);
    smoke.push([...b.w([5, 14.5, 3]), 1]);
  }

  yield;
  // ----- the houses climbing the hill: loosely, as a town grows, each turned to the view down the slope -----
  for (let tries = 0; tries < 1100; tries++) {
    if (tries % 40 === 39) yield;
    const a = r() * Math.PI * 2;
    const rad = HILL.top + 5 + Math.pow(r(), 0.8) * (HILL.foot - HILL.top - 9);
    // the back of the hill, toward the forest, is left to its trees
    if (Math.sin(a) < -0.5 && Math.cos(a) < 0.3) continue;
    const ra = Math.abs(((a - hillRoadA(rad) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * rad;
    if (ra < 5.5) continue;
    const x = HILL.x + Math.cos(a) * rad;
    const z = HILL.z + Math.sin(a) * rad;
    const L = 6.2 + r() * 4.5;
    const D = 4.8 + r() * 0.9;
    const big = Math.max(L, D) * 0.55 + 0.6;
    if (!free(x, z, big)) continue;
    // (mostly the long side to the view, some gable-on; never quite square to the slope)
    // (on the hill a house stands along the slope, its long side to the view, so little ground falls away under it)
    const rot = Math.PI / 2 - a + (r() < 0.1 ? Math.PI / 2 : 0) + (r() - 0.5) * 0.45;
    // only where the hill gives it a place level enough: a house is not set on a tall stone basement
    b.at(x, 0, z, rot);
    const fr = footRange(b, L / 2 + 0.3, Math.min(D, 5.6) / 2 + 0.3);
    if (fr.hi - fr.lo > 2.3) continue;
    take(x, z, big);
    const u = r();
    const res = house(b, x, z, rot, L, D, 2.8 + r() * 0.5, {
      roof: u < 0.42 ? "shingle" : u < 0.8 ? "tile" : "thatch",
      wall: r() < 0.5 ? "logs" : r() < 0.6 ? "painted" : "grey",
      accent: Math.floor(r() * 4),
      porch: r() < 0.35,
      chimney: r() < 0.7,
      horses: r() < 0.5,
      storey: r() < 0.15 ? 1.7 : 1,
    });
    if (r() < 0.22) smoke.push([...b.w([L * 0.175, res.top - res.floor + 1.3, -0.6]), 0.7 + r() * 0.5]);
    if (r() < 0.3) lantern(b, x + Math.cos(a) * (D * 0.5 + 2.5), z + Math.sin(a) * (D * 0.5 + 2.5), lamps, HILL.x + 60 - rad * 0.3);
  }
  // the gardens in between: fruit trees, birches, bushes
  for (let tries = 0; tries < 520; tries++) {
    if (tries % 80 === 79) yield;
    const a = r() * Math.PI * 2;
    const rad = HILL.top + 3 + r() * (HILL.foot - HILL.top - 4);
    const ra = Math.abs(((a - hillRoadA(rad) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * rad;
    if (ra < 3.5) continue;
    const gx = HILL.x + Math.cos(a) * rad;
    const gz = HILL.z + Math.sin(a) * rad;
    if (!free(gx, gz, 1.9)) continue;
    take(gx, gz, 1.9);
    const u = r();
    gardens.push([gx, gz, u < 0.5 ? "broad" : u < 0.8 ? "birch" : "bush", 0.48 + r() * 0.32]);
  }

  yield;
  // ----- the quays: houses along both banks, a street between them and the water -----
  for (const side of [-1, 1]) {
    let x = -168 - r() * 6;
    while (x > -324) {
      yield;
      const L = 8 + r() * 5;
      const D = 6 + r() * 1.5;
      const gableOn = r() < 0.45;
      const along = gableOn ? D : L;
      const cx = x - along / 2;
      x -= along + 2.0 + r() * 3.0;
      if (Math.abs(cx - BRIDGE_X) < 8 + along / 2) continue;
      if (Math.abs(cx - MILL_X) < 18) continue;
      for (let row = 0; row < 3; row++) {
        const deep = gableOn ? L : D;
        const off = riverW(cx) + 9.5 + deep / 2 + row * (deep + 8) + r() * 1.5;
        const [hx, hz] = bankPt(cx, side, off);
        if (Math.hypot(hx - TOWN.x, hz - TOWN.z) > TOWN.r + 14) continue;
        if (row > 0 && r() < 0.25) continue;
        const rad = Math.max(L, D) * 0.55;
        if (!free(hx, hz, rad)) continue;
        take(hx, hz, rad);
        const f = frame(cx);
        // the front looks across the river
        const rot = Math.atan2(-f.nx * side, -f.nz * side) + (gableOn ? Math.PI / 2 : 0);
        const u = r();
        const res = house(b, hx, hz, rot, gableOn ? D : L, gableOn ? L : D, 3.0 + r() * 0.5, {
          roof: u < 0.45 ? "shingle" : u < 0.8 ? "tile" : "thatch",
          wall: r() < 0.5 ? "painted" : r() < 0.7 ? "logs" : "grey",
          accent: Math.floor(r() * 4),
          porch: !gableOn && r() < 0.5,
          chimney: r() < 0.75,
          horses: r() < 0.5,
          storey: row === 0 && r() < 0.3 ? 1.75 : 1,
        });
        if (r() < 0.22) smoke.push([...b.w([(gableOn ? D : L) * 0.175, res.top - res.floor + 1.3, -0.6]), 0.7 + r() * 0.5]);
        if (r() < 0.45) {
          const [gx, gz] = bankPt(cx + (r() - 0.5) * along, side, off + (gableOn ? L : D) / 2 + 3 + r() * 3);
          if (free(gx, gz, 2)) {
            take(gx, gz, 2);
            gardens.push([gx, gz, r() < 0.6 ? "broad" : "birch", 0.5 + r() * 0.3]);
          }
        }
        if (nests.length < 3 && r() < 0.1) nests.push(b.w([(gableOn ? D : L) * 0.175, res.top - res.floor + 1.35, -0.6]));
      }
      // lanterns along the quay
      if (r() < 0.6) {
        const [lx, lz] = bankPt(cx + along / 2 + 1, side, riverW(cx) + 7.8);
        // (none standing in the way where the quay goes on into the forest)
        if (joinD(lx, lz) > 3.2) lantern(b, lx, lz, lamps, lx + 26);
      }
    }
  }

  yield;
  // ----- the market square: houses round it, a well with a sweep, stalls, lanterns -----
  {
    const f = frame(SQUARE.x);
    const out = Math.atan2(f.nz, f.nx);
    for (let i = 0; i < 11; i++) {
      // round the square's far side (the river side stays open to the bridge)
      const a = out - Math.PI * 0.62 + i * Math.PI * 0.124;
      const x = SQUARE.x + Math.cos(a) * 25;
      const z = SQUARE.z + Math.sin(a) * 25;
      if (riverD(x, z) < riverW(x) + 12) continue;
      const L = 8 + r() * 3;
      if (!free(x, z, L * 0.5)) continue;
      take(x, z, L * 0.5);
      house(b, x, z, Math.atan2(SQUARE.x - x, SQUARE.z - z) - Math.PI / 2, L, 6.5, 3.2, {
        roof: r() < 0.6 ? "tile" : "shingle",
        wall: "painted",
        accent: i % 4,
        porch: false,
        chimney: true,
        horses: false,
        storey: r() < 0.5 ? 1.75 : 1,
      });
    }
    // the well with its sweep
    const g = ground(SQUARE.x, SQUARE.z);
    b.at(SQUARE.x, g - 0.2, SQUARE.z, 0.4);
    b.cyl(0, 0, 0, 0.85, 0.85, 1.0, 10, STONE, K.stone);
    b.cyl(0, 0.95, 0, 0.92, 0.92, 0.12, 10, WOOD, K.boards);
    b.box(2.2, 2.2, 0, 0.22, 4.4, 0.22, WOOD, K.boards);
    b.quad([2.1, 4.3, 0.05], [-3.6, 6.6, 0.05], [-3.6, 6.5, -0.05], [2.1, 4.2, -0.05], WOOD, [K.boards, 0, 0, 0]);
    b.box(0.2, 2.9, 0, 0.04, 3.3, 0.04, DARK);
    // stalls under striped canvas
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.5;
      const sx = SQUARE.x + Math.cos(a) * 10;
      const sz = SQUARE.z + Math.sin(a) * 10;
      b.at(sx, ground(sx, sz) - 0.1, sz, a);
      for (const [px, pz] of [
        [-1.3, -0.9],
        [1.3, -0.9],
        [1.3, 0.9],
        [-1.3, 0.9],
      ])
        b.box(px, 1.1, pz, 0.08, 2.2, 0.08, WOOD, K.boards);
      b.box(0, 0.85, 0, 2.6, 0.08, 1.6, [0.32, 0.25, 0.17], K.boards);
      b.quad([-1.5, 2.15, 1.1], [1.5, 2.15, 1.1], [1.5, 2.6, -1.0], [-1.5, 2.6, -1.0], i % 2 ? [0.62, 0.2, 0.12] : [0.7, 0.62, 0.42], [K.paint, 0, 0, 0]);
      for (let k = 0; k < 3; k++) b.box(-0.8 + k * 0.8, 1.05, 0.1, 0.45, 0.3, 0.45, [0.4 + r() * 0.2, 0.3, 0.12], K.paint);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      lantern(b, SQUARE.x + Math.cos(a) * 17, SQUARE.z + Math.sin(a) * 15, lamps, SQUARE.x + 34 - i * 3);
    }
  }

  yield;
  // ----- the white wooden church on the south bank: nave, apse, tower with a stepped cap -----
  {
    const rot = Math.atan2(SQUARE.x - CHURCH.x, SQUARE.z - CHURCH.z);
    b.at(CHURCH.x, 0, CHURCH.z, rot);
    const fr = footRange(b, 7, 16);
    const fl = fr.hi + 0.4;
    b.at(CHURCH.x, fl, CHURCH.z, rot);
    b.box(0, -(fl - fr.lo + 0.6) / 2, 1.5, 13, fl - fr.lo + 0.6, 30, STONE, K.stone, false);
    const W = 6;
    const H = 7.5;
    b.wall(-W, -12, -W, 10, 0, H, WHITE, K.boards, 3.6, 0, 1);
    b.wall(W, 10, W, -12, 0, H, WHITE, K.boards, 3.6, 0, 1);
    b.wall(-W, 10, W, 10, 0, H, WHITE, K.boards, 0);
    b.wall(W, -12, -W, -12, 0, H, WHITE, K.boards, 0);
    const rh = 7;
    const ex = W + 0.6;
    const ruv: [number, number][] = [
      [0, 0],
      [23, 0],
      [23, 9.6],
      [0, 9.6],
    ];
    b.quad([-ex, H - 0.4, 10.5], [-ex, H - 0.4, -12.5], [0, H + rh, -12.5], [0, H + rh, 10.5], SHINGLE, [K.shingle, 0, 0, 0], ruv);
    b.quad([ex, H - 0.4, -12.5], [ex, H - 0.4, 10.5], [0, H + rh, 10.5], [0, H + rh, -12.5], SHINGLE, [K.shingle, 0, 0, 0], ruv);
    b.tri([-W, H, -12], [W, H, -12], [0, H + rh * 0.95, -12], WHITE, [K.boards, 0, 0, 0], [[0, 0], [12, 0], [6, 7]]);
    // the apse
    b.cyl(0, 0, -12, 4.4, 4.4, H - 1, 8, WHITE, K.boards, 3.2);
    b.cyl(0, H - 1, -12, 5.0, 0.3, 4, 8, SHINGLE, K.shingle);
    // the tower over the door: square, white, stepped; its cap a bell, a lantern, a cross
    const T = 3.4;
    b.box(0, (H + 8) / 2, 12.2, T * 2, H + 8, T * 2, WHITE, K.boards);
    b.quad([-1.0, 0, 15.62], [1.0, 0, 15.62], [1.0, 2.8, 15.62], [-1.0, 2.8, 15.62], [0.16, 0.11, 0.07], [K.boards, 0, 0, 0]);
    b.box(0, H + 8.2, 12.2, T * 2 + 0.7, 0.4, T * 2 + 0.7, SHINGLE, K.shingle);
    b.box(0, H + 10.4, 12.2, T * 1.5, 4.2, T * 1.5, WHITE, K.boards);
    b.cyl(0, H + 12.5, 12.2, 3.2, 1.1, 2.4, 8, SHINGLE, K.shingle);
    b.cyl(0, H + 14.9, 12.2, 1.1, 1.6, 1.0, 8, SHINGLE, K.shingle, 0, false);
    b.cyl(0, H + 15.9, 12.2, 1.6, 0.25, 2.2, 8, SHINGLE, K.shingle);
    b.cyl(0, H + 18.1, 12.2, 0.3, 0.3, 0.8, 6, [0.55, 0.45, 0.2], K.paint);
    b.cyl(0, H + 18.9, 12.2, 0.45, 0.0, 1.0, 6, SHINGLE, K.shingle);
    b.box(0, H + 21.0, 12.2, 0.1, 2.4, 0.1, [0.6, 0.5, 0.22]);
    b.box(0, H + 21.5, 12.2, 1.0, 0.1, 0.1, [0.6, 0.5, 0.22]);
    lamps.push([...b.w([0, 3.2, 16.0]), 0.6, CHURCH.x + 40]);
  }

  yield;
  // ----- the footbridge: an arched wooden deck on trestles, railings, a lantern at each end -----
  {
    const x = BRIDGE_X;
    const f = frame(x);
    const wl = riverWL(x);
    const half = riverW(x) + 4.5;
    const rot = Math.atan2(f.nx, f.nz);
    const N = 18;
    const yAt = (t: number) => wl + 0.62 + 2.3 * Math.sin(Math.PI * t);
    b.at(x, 0, riverZ(x), rot);
    for (let i = 0; i < N; i++) {
      const t0 = i / N;
      const t1 = (i + 1) / N;
      const z0 = -half + 2 * half * t0;
      const z1 = -half + 2 * half * t1;
      b.quad([-1.3, yAt(t0), z0], [1.3, yAt(t0), z0], [1.3, yAt(t1), z1], [-1.3, yAt(t1), z1], [0.3, 0.24, 0.16], [K.boards, 0, 0, 0]);
      b.quad([1.3, yAt(t0) - 0.3, z0], [-1.3, yAt(t0) - 0.3, z0], [-1.3, yAt(t1) - 0.3, z1], [1.3, yAt(t1) - 0.3, z1], DARK, [K.paint, 0, 0, 0]);
      for (const sx of [-1, 1]) {
        b.quad([sx * 1.3, yAt(t0) - 0.3, z0], [sx * 1.3, yAt(t1) - 0.3, z1], [sx * 1.3, yAt(t1), z1], [sx * 1.3, yAt(t0), z0], [0.2, 0.15, 0.1], [K.boards, 0, 0, 0]);
        b.quad([sx * 1.25, yAt(t0) + 0.92, z0], [sx * 1.25, yAt(t1) + 0.92, z1], [sx * 1.25, yAt(t1) + 1.05, z1], [sx * 1.25, yAt(t0) + 1.05, z0], [0.3, 0.24, 0.16], [K.boards, 0, 0, 0]);
        if (i % 3 === 0) b.box(sx * 1.25, yAt(t0) + 0.5, z0, 0.12, 1.1, 0.12, [0.26, 0.2, 0.14], K.boards);
      }
    }
    for (const t of [0.25, 0.5, 0.75])
      for (const sx of [-1, 1]) {
        const z = -half + 2 * half * t;
        b.box(sx * 1.0, (wl - 1.2 + yAt(t)) / 2, z, 0.25, yAt(t) - wl + 1.2, 0.25, [0.14, 0.11, 0.08], K.boards);
      }
    for (const sz of [-1, 1]) {
      b.at(x, 0, riverZ(x), rot);
      const p = b.w([1.6, 0, sz * (half + 0.8)]);
      lantern(b, p[0], p[2], lamps, x + 30);
    }
  }

  yield;
  // ----- the mill at the rapids, on the north bank; its wheel stands in the stream (it turns: see Town) -----
  const f = frame(MILL_X);
  const w = riverW(MILL_X);
  const [mx, mz] = bankPt(MILL_X, -1, w + 7);
  house(b, mx, mz, Math.atan2(f.nx, f.nz) + Math.PI / 2, 10, 7.5, 4.4, { roof: "thatch", wall: "logs", accent: 1, porch: false, chimney: false, horses: true });
  take(mx, mz, 7);
  const [wx, wz] = bankPt(MILL_X, -1, w - 0.8);
  const mill = { x: wx, y: riverWL(MILL_X) + 1.5, z: wz, rot: Math.atan2(f.ax, f.az) };

  yield;
  // ----- roofed pole shrines: where the town begins, by the square, at the forest's edge, at the far quay -----
  {
    const [ax, az] = bankPt(-168, 1, riverW(-168) + 8);
    shrine(b, ax, az, 0.3, lamps);
    shrine(b, SQUARE.x + 14, SQUARE.z - 12, 2.0, lamps);
    shrine(b, -323, -218, -1.2, lamps);
    const [bx, bz] = bankPt(-312, -1, riverW(-312) + 9);
    shrine(b, bx, bz, 1.0, lamps);
  }

  yield;
  // ----- boats moored along the quays -----
  for (const [x, side] of [
    [-196, 1],
    [-232, -1],
    [-284, 1],
    [-302, -1],
  ] as [number, number][]) {
    const ff = frame(x);
    const [bx, bz] = bankPt(x, side, riverW(x) - 1.3);
    boat(b, bx, bz, Math.atan2(ff.ax, ff.az) + (r() - 0.5) * 0.2);
  }

  yield;
  // ----- storks: a nest on a tall pole in the meadow by the mill, and on a few chimneys -----
  {
    const [px, pz] = bankPt(-150, 1, riverW(-150) + 16);
    const g = ground(px, pz);
    b.at(px, g - 0.3, pz, 0);
    b.cyl(0, 0, 0, 0.14, 0.1, 9.5, 6, [0.25, 0.2, 0.15], K.boards);
    nests.push([px, g + 9.2, pz]);
  }
  for (const n of nests) {
    b.at(n[0], n[1], n[2], r() * 6);
    b.cyl(0, -0.2, 0, 0.75, 0.95, 0.5, 9, [0.24, 0.19, 0.12], K.thatch);
    // the stork: white body, black wings folded along its back, long neck, red bill and legs
    const SW: V3 = [0.85, 0.84, 0.8];
    const RED: V3 = [0.7, 0.18, 0.08];
    b.box(0, 0.75, 0, 0.32, 0.3, 0.62, SW);
    b.box(0, 0.86, -0.05, 0.36, 0.14, 0.6, DARK);
    b.box(0, 1.1, 0.3, 0.09, 0.5, 0.09, SW);
    b.box(0, 1.36, 0.36, 0.14, 0.13, 0.2, SW);
    b.box(0, 1.33, 0.6, 0.04, 0.04, 0.32, RED);
    b.box(0.07, 0.42, 0, 0.03, 0.5, 0.03, RED);
    b.box(-0.07, 0.42, 0, 0.03, 0.5, 0.03, RED);
  }

  // (no garden tree stands over a lamp)
  const clearOfLamps = gardens.filter(([x, z]) => lamps.every((l) => Math.hypot(l[0] - x, l[2] - z) > 3.4));
  return { geo: b.geometry(), det: DET.geometry(), lamps, smoke, mill, gardens: clearOfLamps };
}

// ---------- the shader ----------
export function makeTownMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...HOME_U, uFront: { value: 1e4 } },
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute vec2 aUV; attribute vec4 aMat; attribute float aAO;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying vec2 vUV; varying vec4 vMat; varying float vAO;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vN = mat3(modelMatrix) * normal; vCol = aCol; vUV = aUV; vMat = aMat; vAO = aAO;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFront;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying vec2 vUV; varying vec4 vMat; varying float vAO;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      vec3 accentCol(float i){
        i = mod(i, 4.0);
        return i < 0.5 ? vec3(0.08, 0.2, 0.42) : i < 1.5 ? vec3(0.1, 0.26, 0.16) : i < 2.5 ? vec3(0.42, 0.26, 0.06) : vec3(0.36, 0.08, 0.06);
      }
      // a soft-edged box (1 inside), its edge as wide as a pixel
      float boxK(vec2 q, vec2 hw, float aa){ vec2 d = abs(q) - hw; float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); return 1.0 - smoothstep(-aa, aa, sd); }
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        float kind = floor(vMat.x + 0.5);
        vec2 uv = vUV;
        vec2 fwv = fwidth(uv);
        float fw = max(max(fwv.x, fwv.y), 1e-4);
        float aa = fw * 0.75;
        // how much fine pattern a pixel can still carry (each fades to its average before it is finer than a pixel)
        float fine = 1.0 - smoothstep(0.05, 0.2, fw);
        float mid = 1.0 - smoothstep(0.2, 0.6, fw);
        vec3 alb = vCol;
        float glow = 0.0;
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float dusk = smoothstep(0.1, 0.5, uNight + (1.0 - sunUp));
        float g = vnoise(vWorld.xz * 3.0 + vWorld.y * 2.0) * 0.6 + vnoise(vWorld.xy * 11.0 + vWorld.z * 9.0) * 0.4;
        alb *= 0.88 + 0.24 * mix(0.5, g, fine);
        if (kind == 1.0) {
          // logs: rounded, a dark seam between each, grain along them
          float lv = uv.y / 0.27; float row = floor(lv); float f = fract(lv);
          float k = mix(0.5, 1.08, smoothstep(0.0, 0.55, sin(3.14159 * f))) * (0.88 + 0.24 * hash12(vec2(row, floor(uv.x / 3.0))));
          float grain = vnoise(vec2(uv.x * 2.2, row * 5.3)) * 0.2;
          alb *= mix(0.86, k * (0.92 + grain), fine);
        } else if (kind == 2.0) {
          // upright boards with a batten over each joint
          float f = fract(uv.x / 0.19);
          float k = mix(0.72, 1.0, smoothstep(0.0, 0.1, f) * smoothstep(1.0, 0.86, f));
          alb *= mix(0.92, k * (0.95 + 0.1 * hash12(vec2(floor(uv.x / 0.19), 3.0))), fine);
        } else if (kind == 3.0 || kind == 8.0) {
          // shingles, or clay tiles: courses up the slope, staggered, each its own tone; moss low on the roof
          float rh = kind == 3.0 ? 0.26 : 0.32;
          float row = floor(uv.y / rh); float f = fract(uv.y / rh);
          float cw = kind == 3.0 ? 0.16 : 0.26;
          float cell = floor(uv.x / cw + row * 0.5);
          float fx = fract(uv.x / cw + row * 0.5);
          float shade = mix(0.55, 1.0, smoothstep(0.0, 0.35, f));
          if (kind == 8.0) shade *= mix(0.72, 1.06, sin(3.14159 * fx));
          else shade *= mix(0.8, 1.0, smoothstep(0.0, 0.06, fx) * smoothstep(1.0, 0.94, fx));
          alb *= mix(mix(0.86, 0.95, mid), shade * (0.8 + 0.35 * hash12(vec2(cell, row))), fine);
          float moss = smoothstep(0.55, 0.8, vnoise(uv * 0.6 + vWorld.xz * 0.05)) * (1.0 - smoothstep(0.0, 4.0, uv.y)) * 0.6;
          alb = mix(alb, vec3(0.1, 0.13, 0.05), moss * (kind == 3.0 ? 1.0 : 0.5));
        } else if (kind == 9.0) {
          // thatch: long straw down the slope, combed in layers
          float s1 = vnoise(vec2(uv.x * 9.0, uv.y * 0.8)) * 0.6 + vnoise(vec2(uv.x * 23.0, uv.y * 1.5)) * 0.4;
          float layer = smoothstep(0.0, 0.3, fract(uv.y / 0.55));
          alb *= mix(0.9, (0.72 + 0.45 * s1) * mix(0.75, 1.0, layer), fine);
          alb = mix(alb, vec3(0.16, 0.15, 0.08), smoothstep(0.5, 0.85, vnoise(uv * 0.4 + 7.0)) * 0.45);
        } else if (kind == 4.0) {
          // white carving: notches along the board
          float f = fract(uv.x / 0.35);
          alb *= mix(0.95, mix(0.78, 1.0, smoothstep(0.1, 0.3, abs(f - 0.5) * 2.0)), fine);
        } else if (kind == 6.0) {
          // coursed fieldstone
          float row = floor(uv.y / 0.34);
          float cell = floor(uv.x / 0.55 + row * 0.37);
          vec2 f = vec2(fract(uv.x / 0.55 + row * 0.37), fract(uv.y / 0.34));
          float mortar = smoothstep(0.0, 0.3, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
          alb *= mix(0.86, mix(0.6, 0.85 + 0.35 * hash12(vec2(cell, row)), mortar), fine);
        } else if (kind == 7.0) {
          // red brick in Gothic bond, darker headers, a pale mortar line, streaks of weather
          float row = floor(uv.y / 0.09);
          float bw = mod(row, 2.0) < 1.0 ? 0.28 : 0.14;
          float cell = floor(uv.x / bw + row * 0.5);
          vec2 f = vec2(fract(uv.x / bw + row * 0.5), fract(uv.y / 0.09));
          float mortar = smoothstep(0.0, 0.12, min(f.y, 1.0 - f.y)) * smoothstep(0.0, 0.05, min(f.x, 1.0 - f.x));
          vec3 brick = vCol * (0.75 + 0.4 * hash12(vec2(cell, row))) * (mod(cell, 3.0) < 1.0 ? 0.72 : 1.0);
          float bfine = 1.0 - smoothstep(0.012, 0.05, fw);
          alb = mix(alb * 0.92, mix(vec3(0.42, 0.38, 0.33), brick, mortar), bfine);
          alb *= 1.0 - 0.2 * smoothstep(0.5, 0.8, vnoise(vec2(uv.x * 0.7, uv.y * 0.08)));
          // the foot of every wall and tower is grey fieldstone, as at Trakai, the brick laid on it
          float foot = 1.0 - smoothstep(4.0, 4.3 + vnoise(vec2(uv.x * 0.9, 1.0)) * 0.8, uv.y);
          if (foot > 0.001) {
            float row = floor(uv.y / 0.42);
            vec2 f2 = vec2(fract(uv.x / 0.7 + row * 0.41), fract(uv.y / 0.42));
            float mortar = smoothstep(0.0, 0.3, min(min(f2.x, 1.0 - f2.x), min(f2.y, 1.0 - f2.y)));
            vec3 fs = vec3(0.34, 0.32, 0.29) * (0.7 + 0.45 * hash12(vec2(floor(uv.x / 0.7 + row * 0.41), row)));
            alb = mix(alb, mix(vec3(0.3, 0.28, 0.25) * 0.9, mix(fs * 0.65, fs, mortar), bfine), foot);
          }
        } else if (kind == 5.0) {
          // a lamp's glass: kindled ahead of the plane, and after dusk
          float key = vMat.y != 0.0 ? vMat.y : vWorld.x + 24.0;
          float on = max(dusk, smoothstep(key, key - 22.0, uFront));
          glow = on * (0.85 + 0.15 * sin(uTime * 6.0 + vWorld.x));
          alb = vec3(0.3, 0.26, 0.2);
        }
        // windows: a white carved surround, coloured shutters, small panes; warm behind the glass after dusk
        float win = vMat.y;
        if (win > 0.0 && (kind == 1.0 || kind == 2.0 || kind == 7.0)) {
          float len = vMat.z;
          float style = floor(vMat.w / 10.0);
          float accent = mod(vMat.w, 10.0);
          float one = step(50.0, win);
          float nwin = one > 0.5 ? 1.0 : max(1.0, floor((len - 0.8) / win));
          float first = one > 0.5 ? len * 0.5 : (len - (nwin - 1.0) * win) * 0.5;
          float wi = clamp(floor((uv.x - first) / win + 0.5), 0.0, nwin - 1.0);
          float cx = first + wi * win;
          vec2 hw = style < 0.5 ? vec2(0.42, 0.6) : style < 1.5 ? vec2(0.55, 1.45) : style < 2.5 ? vec2(0.22, 0.75) : vec2(0.3, 0.38);
          float cy = style < 0.5 ? 1.55 : style < 1.5 ? 3.4 : style < 2.5 ? 2.0 : 1.1;
          float vy = style > 1.5 && style < 2.5 ? mod(uv.y, 4.2) : uv.y;
          vec2 q = vec2(uv.x - cx, vy - cy);
          float inner = boxK(q, hw, aa);
          // (a church window ends in a round head)
          if (style > 0.5 && style < 1.5) {
            float s = hw.y - hw.x;
            inner = q.y > s ? 1.0 - smoothstep(-aa, aa, length(vec2(q.x, q.y - s)) - hw.x) : boxK(q, hw, aa);
          }
          float frame = clamp(boxK(q, hw + 0.11, aa) - inner, 0.0, 1.0) * (style > 1.5 && style < 2.5 ? 0.0 : 1.0);
          float shut = style < 0.5 ? boxK(vec2(abs(q.x) - hw.x - 0.36, q.y), vec2(0.24, hw.y + 0.02), aa) : 0.0;
          float bars = clamp((1.0 - smoothstep(0.025, 0.025 + aa, abs(q.x))) + (1.0 - smoothstep(0.025, 0.025 + aa, abs(q.y - hw.y * 0.25))), 0.0, 1.0);
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 glass = skyBase(reflect(-V, n)) * 0.3 + vec3(0.02, 0.025, 0.03);
          float someone = step(0.2, hash12(vec2(wi + 3.0, floor(vWorld.x * 0.3) + floor(vWorld.z * 0.3) * 17.0)));
          float on = max(dusk, 0.55 * smoothstep(vWorld.x + 12.0, vWorld.x - 16.0, uFront)) * someone;
          vec3 wc = mix(glass, vec3(1.0, 0.62, 0.28) * 0.5, on);
          wc = mix(wc, vec3(0.8, 0.78, 0.72), bars * fine * (1.0 - on * 0.6));
          glow = max(glow, inner * on * 0.75 * mid);
          alb = mix(alb, vec3(0.78, 0.76, 0.7), frame * mid);
          alb = mix(alb, accentCol(accent) * (0.85 + 0.2 * step(0.5, fract(q.y * 2.5))), shut * mid);
          alb = mix(alb, wc, inner * mid);
          // far off a window is a darker patch of the wall
          alb *= 1.0 - 0.14 * (1.0 - mid) * (1.0 - step(hw.y, abs(vy - cy)));
        }
        float ndl = max(dot(n, uKeyDir), 0.0);
        float ao = mix(0.5, 1.0, smoothstep(0.0, 1.2, vAO)) * mix(0.72, 1.0, n.y * 0.5 + 0.5);
        vec3 col = alb * (uSkyCol * (0.55 + 0.45 * n.y) * ao + uKeyCol * ndl * 0.95 * cloudShade(vWorld) * sunUp * mix(0.75, 1.0, ao));
        // (after dusk the moon and the town's own lamps keep the timber, the shingles and the stone legible)
        col += alb * vec3(0.55, 0.62, 0.8) * 0.18 * dusk * (0.6 + 0.4 * max(dot(n, uKeyDir), 0.0));
        col = mix(col, vec3(1.0, 0.66, 0.32) * (1.0 + glow * 0.8), clamp(glow, 0.0, 1.0) * 0.9);
        col = homeAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// The lamps' light: soft halos facing the eye, kindled with their glass.
function makeHalos(lamps: number[][]) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(lamps.length * 4);
  const key = new Float32Array(lamps.length);
  lamps.forEach((l, i) => {
    at.set([l[0], l[1], l[2], l[3] * 2.4], i * 4);
    key[i] = l[4];
  });
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.setAttribute("aKey", new THREE.InstancedBufferAttribute(key, 1));
  g.instanceCount = lamps.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(TOWN.x, 0, TOWN.z), 260);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...HOME_U, uFront: { value: 1e4 } },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; attribute float aKey; varying vec2 vUv; varying float vK; varying vec3 vAt;
      uniform float uTime; uniform float uNight; uniform vec3 uKeyDir; uniform float uFront;
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float dusk = smoothstep(0.1, 0.5, uNight + (1.0 - smoothstep(-0.02, 0.08, uKeyDir.y)));
        float k = smoothstep(aKey, aKey - 22.0, uFront);
        // (by day a kindled lamp is a small warm glow; after dusk a pool of light)
        vK = max(k * 0.4, dusk) * (0.9 + 0.1 * sin(uTime * 5.0 + aAt.x * 3.0));
        float dist = length(aAt.xyz - cameraPosition);
        // (never smaller than a few pixels: further off it dims instead)
        // (a small glow of fixed size in the world, dimmed with distance and into the air: never a disc on the screen)
        vK *= smoothstep(1.5, 5.0, dist);
        vAt = aAt.xyz;
        vUv = position.xy;
        vec3 wp = aAt.xyz + (R * position.x + U * position.y) * aAt.w * 0.55 * (vK > 0.002 ? 1.0 : 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vK; varying vec3 vAt;
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        float r = length(vUv);
        // (into the land's own air, as the houses are)
        float a = (exp(-r * r * 10.0) * 0.8 + exp(-r * r * 2.6) * 0.25) * (1.0 - smoothstep(0.7, 1.0, r)) * vK * (1.0 - homeAirAmt(vAt));
        gl_FragColor = vec4(vec3(1.0, 0.66, 0.3) * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m };
}

// Under each lamp a soft warm pool of its light on the ground (kindled with the lamp; into the air with distance).
function makePools(lamps: number[][]) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  const at = new Float32Array(lamps.length * 4);
  const key = new Float32Array(lamps.length);
  lamps.forEach((l, i) => {
    at.set([l[0], landH(l[0], l[2]) + 0.12, l[2], Math.min(6, 2 + l[3] * 4)], i * 4);
    key[i] = l[4];
  });
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.setAttribute("aKey", new THREE.InstancedBufferAttribute(key, 1));
  g.instanceCount = lamps.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(TOWN.x, 0, TOWN.z), 260);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    uniforms: { ...SKY_U, ...HOME_U, uFront: { value: 1e4 } },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; attribute float aKey; varying vec2 vUv; varying float vK; varying vec3 vWorld;
      uniform float uNight; uniform vec3 uKeyDir; uniform float uFront;
      void main(){
        float dusk = smoothstep(0.1, 0.5, uNight + (1.0 - smoothstep(-0.02, 0.08, uKeyDir.y)));
        vK = max(smoothstep(aKey, aKey - 22.0, uFront) * 0.25, dusk);
        vUv = position.xz;
        vWorld = aAt.xyz + position * aAt.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vK; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        float r = length(vUv);
        float a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.8, 1.0, r)) * vK * (1.0 - homeAirAmt(vWorld));
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * a * 0.55, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m };
}

// Chimney smoke: soft puffs that rise, widen and thin, leaning with the wind.
function makeSmoke(src: number[][]) {
  const PER = 7;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(src.length * PER * 4);
  src.forEach((s, i) => {
    for (let k = 0; k < PER; k++) at.set([s[0], s[1], s[2], k / PER + i * 0.37], (i * PER + k) * 4);
  });
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.instanceCount = src.length * PER;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(TOWN.x, 20, TOWN.z), 260);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U, ...HOME_U },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; varying vec2 vUv; varying float vA; varying vec3 vWorld;
      uniform float uTime;
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float t = fract(uTime * 0.045 + aAt.w);
        vec3 c = aAt.xyz + vec3(-0.864 * t * 9.0, t * 11.0, -0.503 * t * 9.0) + vec3(sin(uTime * 0.3 + aAt.w * 9.0), 0.0, cos(uTime * 0.27 + aAt.w * 7.0)) * t * 1.5;
        float size = 0.6 + t * 3.4;
        vA = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.45, 1.0, t)) * 0.26;
        vUv = position.xy;
        vWorld = c + (R * position.x + U * position.y) * size;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vA; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        float r = length(vUv);
        float a = exp(-r * r * 3.2) * (1.0 - smoothstep(0.75, 1.0, r)) * vA;
        vec3 col = vec3(0.75, 0.74, 0.72) * (uSkyCol * 0.9 + uKeyCol * 0.45);
        col = homeAir(col, vWorld);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m };
}

// Storks in the air over the town: three soaring in slow wide circles, now and then a few slow beats.
function makeStorks() {
  const b = new TB();
  b.at(0, 0, 0, 0);
  const SW: V3 = [0.86, 0.85, 0.8];
  const RED: V3 = [0.7, 0.18, 0.08];
  b.box(0, 0, 0, 0.3, 0.26, 1.0, SW);
  b.box(0, 0.03, -0.75, 0.08, 0.08, 0.6, SW);
  b.box(0, 0.03, -1.2, 0.04, 0.04, 0.34, RED);
  b.box(0, -0.02, 0.85, 0.03, 0.03, 0.7, RED);
  for (const s of [-1, 1]) {
    // the inner wing white, the outer black (aMat.y: how far out, for the beat)
    b.quad([s * 0.14, 0.05, -0.25], [s * 1.0, 0.05, -0.22], [s * 1.0, 0.05, 0.25], [s * 0.14, 0.05, 0.25], SW, [0, 0.5, 0, 0]);
    b.quad([s * 1.0, 0.05, -0.22], [s * 2.0, 0.05, -0.1], [s * 2.05, 0.05, 0.3], [s * 1.0, 0.05, 0.25], DARK, [0, 1.0, 0, 0]);
  }
  const geo = b.geometry();
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = geo.index;
  for (const k of ["position", "normal", "aCol", "aMat"]) ig.setAttribute(k, geo.getAttribute(k));
  ig.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array([0, 2.1, 4.3]), 1));
  ig.instanceCount = 3;
  ig.boundingSphere = new THREE.Sphere(new THREE.Vector3(TOWN.x, 40, TOWN.z), 200);
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...HOME_U },
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute vec4 aMat; attribute float aSeed;
      uniform float uTime;
      varying vec3 vCol; varying vec3 vN; varying vec3 vWorld;
      void main(){
        float t = uTime * 0.09 + aSeed;
        float R = 50.0 + 12.0 * sin(aSeed * 3.0);
        vec3 c = vec3(${TOWN.x.toFixed(1)} + cos(t) * R, 44.0 + 6.0 * sin(t * 0.7 + aSeed) + aSeed * 3.0, ${TOWN.z.toFixed(1)} - 20.0 + sin(t) * R * 0.8);
        vec3 fwd = normalize(vec3(-sin(t), 0.0, cos(t) * 0.8));
        vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
        vec3 up = normalize(vec3(0.0, 1.0, 0.0) + right * 0.35);
        vec3 p = position * 1.3;
        float beat = sin(uTime * 3.2 + aSeed * 5.0) * smoothstep(0.6, 0.9, sin(uTime * 0.21 + aSeed * 2.0));
        p.y += aMat.y * abs(p.x) * 0.45 * beat;
        vec3 wp = c + right * p.x + up * p.y + fwd * -p.z;
        vCol = aCol; vN = up; vWorld = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vCol; varying vec3 vN; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        vec3 col = vCol * (uSkyCol * 0.8 + uKeyCol * (0.4 + 0.6 * abs(dot(normalize(vN), uKeyDir))) * sunUp);
        col = homeAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g: ig, m, geo };
}

// the mill's wheel: two rims, spokes, paddles across them
function makeWheel() {
  const b = new TB();
  b.at(0, 0, 0, 0);
  const R = 2.3;
  const col: V3 = [0.2, 0.15, 0.1];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    b.quad([-0.6, s * R, c * R], [0.6, s * R, c * R], [0.6, s * (R - 0.7), c * (R - 0.7)], [-0.6, s * (R - 0.7), c * (R - 0.7)], col, [K.boards, 0, 0, 0]);
    if (i % 2 === 0) for (const x of [-0.55, 0.55]) b.quad([x, 0, 0], [x, 0.1 * c, -0.1 * s], [x, s * R + 0.1 * c, c * R - 0.1 * s], [x, s * R, c * R], col, [K.boards, 0, 0, 0]);
  }
  for (const x of [-0.55, 0.55])
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2;
      const a1 = ((i + 1) / 24) * Math.PI * 2;
      b.quad([x, Math.sin(a0) * R, Math.cos(a0) * R], [x, Math.sin(a1) * R, Math.cos(a1) * R], [x, Math.sin(a1) * (R - 0.25), Math.cos(a1) * (R - 0.25)], [x, Math.sin(a0) * (R - 0.25), Math.cos(a0) * (R - 0.25)], col, [K.boards, 0, 0, 0]);
    }
  return b.geometry();
}

// the gardens' trees: the home world's own trees (Forest.tsx), small, one instanced draw per kind
function makeGardens(list: [number, number, TreeKind, number][], mobile: boolean) {
  const leaves = makeLeafTexture();
  const mat = makeHomeTreeMaterial(leaves);
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  const r = rng(77);
  const meshes: THREE.InstancedMesh[] = [];
  for (const kind of ["broad", "birch", "bush"] as TreeKind[]) {
    const mine = list.filter((g) => g[2] === kind);
    if (!mine.length) continue;
    // (two cuts of the same trees: the fine one while the eye is in the town, the coarse one from afar)
    const fine = new THREE.InstancedMesh(buildTree(kind, 1, mobile ? 0 : 1), mat, mine.length);
    const coarse = new THREE.InstancedMesh(buildTree(kind, 1, 0), mat, mine.length);
    mine.forEach(([x, z, , s], i) => {
      o.position.set(x, landH(x, z) - 0.06, z);
      o.rotation.set(0, r() * 6.28, 0);
      o.scale.setScalar(s);
      o.updateMatrix();
      col.setRGB(0.9 + r() * 0.2, 0.95 + r() * 0.1, 0.85 + r() * 0.1);
      for (const im of [fine, coarse]) {
        im.setMatrixAt(i, o.matrix);
        im.setColorAt(i, col);
      }
    });
    for (const im of [fine, coarse]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      meshes.push(im);
    }
    fine.userData.cut = "fine";
    coarse.userData.cut = "coarse";
    coarse.visible = false;
  }
  // and from afar, one painted card a tree
  const farMat = makeFarMaterial(makeFarTreeTexture());
  const cards = farBlock(
    list.map(([x, z, kind, s]): HomeTree => ({ x, y: landH(x, z), z, s: s * 0.9, kind, v: 0, rot: 0, tint: 0.5, lod: 2 })),
    farMat,
  );
  cards.visible = false;
  return { meshes, mat, leaves, farMat, cards };
}

type Built = ReturnType<typeof buildTownSteps> extends Generator<unknown, infer R, unknown> ? R : never;

// The town is built a few milliseconds at a time (a step of the builder per slice, the slices handed out by the
// browser's own timer), so making it never holds a frame: behind the loader it is long done before the world is
// shown, and on a slow phone it simply takes a few more slices.
export function Town({ mobile = false }: { mobile?: boolean }) {
  const [built, setBuilt] = useState<Built | null>(null);
  useEffect(() => {
    let dead = false;
    const it = buildTownSteps();
    let spent = 0;
    const slice = () => {
      if (dead) return;
      const t0 = performance.now();
      let r = it.next();
      while (!r.done && performance.now() - t0 < 5) r = it.next();
      spent += performance.now() - t0;
      if (r.done) {
        const g = ((globalThis as unknown as { __gen?: Record<string, number> }).__gen ??= {});
        g.town = Math.round(spent * 10) / 10;
        setBuilt(r.value);
      } else window.setTimeout(slice, 0);
    };
    slice();
    return () => {
      dead = true;
    };
  }, []);
  return built ? <TownBuilt built={built} mobile={mobile} /> : null;
}

function TownBuilt({ built, mobile }: { built: Built; mobile: boolean }) {
  const t = useMemo(() => ({ ...built, mat: makeTownMaterial(), halos: makeHalos(built.lamps), pools: makePools(built.lamps), smoke: makeSmoke(built.smoke), storks: makeStorks(), wheel: makeWheel(), garden: makeGardens(built.gardens, mobile) }), [built, mobile]);
  useEffect(
    () => () => {
      for (const x of [t.geo, t.det, t.mat, t.halos.g, t.halos.m, t.pools.g, t.pools.m, t.smoke.g, t.smoke.m, t.storks.g, t.storks.m, t.storks.geo, t.wheel, t.garden.mat, t.garden.farMat, t.garden.cards.geometry]) x.dispose();
      // (the trees' geometry and the leaf sheet are the shared library's: trees.ts)
      t.garden.meshes.forEach((m) => m.dispose());
    },
    [t],
  );
  const wheel = useRef<THREE.Mesh>(null);
  const det = useRef<THREE.Mesh>(null);
  const front = useRef(1e4);
  const frames = useRef(0);
  const far = useRef(false);
  const storks = useRef<THREE.Mesh>(null);
  useFrame(({ camera }, dt) => {
    // (the houses' fine things only near: from the desk they would be a few pixels fighting the walls for depth)
    const dTown = Math.hypot(camera.position.x - TOWN.x, camera.position.z - TOWN.z);
    // (for its first frames, behind the loader, everything is drawn once, so nothing is first sent to the GPU mid-flight)
    const warm = ++frames.current < 90;
    if (det.current) det.current.visible = warm || dTown < 190;
    const near = t.garden.meshes[0]?.visible ? dTown < 240 : dTown < 210;
    // (from far off, as from the desk, the gardens are painted cards, and the storks and the wheel are not drawn)
    far.current = far.current ? dTown > 230 : dTown > 260;
    for (const m of t.garden.meshes) m.visible = warm || (!far.current && (m.userData.cut === "fine") === near);
    t.garden.cards.visible = warm || far.current;
    if (storks.current) storks.current.visible = warm || !far.current;
    if (wheel.current) wheel.current.visible = warm || !far.current;
    // the plane's furthest progress down the river (west), for the lamps; reset while it is not flying at home
    const flying = voyage.cur === "home" && voyage.flying && voyage.planePos.y > -100;
    front.current = flying ? Math.min(front.current, voyage.planePos.x) : 1e4;
    t.mat.uniforms.uFront.value = front.current;
    t.halos.m.uniforms.uFront.value = front.current;
    t.pools.m.uniforms.uFront.value = front.current;
    if (wheel.current) wheel.current.rotation.x -= Math.min(dt, 0.1) * 0.55;
  });
  return (
    <>
      <mesh geometry={t.geo} material={t.mat} />
      <mesh ref={det} geometry={t.det} material={t.mat} />
      <group position={[t.mill.x, t.mill.y, t.mill.z]} rotation={[0, t.mill.rot + Math.PI / 2, 0]}>
        <mesh ref={wheel} geometry={t.wheel} material={t.mat} />
      </group>
      <mesh geometry={t.halos.g} material={t.halos.m} renderOrder={6} />
      <mesh geometry={t.pools.g} material={t.pools.m} renderOrder={4} />
      <mesh geometry={t.smoke.g} material={t.smoke.m} renderOrder={5} />
      <mesh ref={storks} geometry={t.storks.g} material={t.storks.m} />
      <primitive object={t.garden.cards} />
      {t.garden.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
