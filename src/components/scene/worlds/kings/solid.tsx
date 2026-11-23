"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { edgeTable as ET, triTable as TT } from "three/examples/jsm/objects/MarchingCubes.js";
import { KINGS } from "../voyage";
import { BY, GLSL_END, GLSL_KINGS, KINGS_UNIFORMS, R } from "./light";

// The two kings, solid all round, and still his own.
//
// He painted them in profile, bowed toward each other over the little world. A figure seen in profile is cut by
// the picture along its own middle, and the two halves either side of that cut are alike. So each king is raised
// out of the canvas the way a medal is raised from its drawing, to both sides at once: his outline is traced on
// the painting, every point inside it stands out from the canvas by as much as it lies in from the outline (a
// round edge, a full middle), the great sleeve stands prouder than the robe it lies on, the light paint a little
// prouder than the dark, and the same again behind. The result is clay with a skin drawn over it by marching
// cubes: a crowned, hooded head with its beard, a back, a sleeve, a hand, closed everywhere, with no edge to see
// past and nothing behind it to be dark.
//
// The paint is the painting: laid straight onto the side he painted, and through onto the far side (which, of a
// figure in profile, is the same picture turned over). Round the rims, where the surface turns edge-on to the
// canvas and a picture laid flat would smear, it is the painting's own colours with the paint's detail taken off,
// worked over with long strokes that belong to the surface and not to the eye.

const edgeTable = ET as unknown as Int32Array;
const triTable = TT as unknown as Int32Array;

const PW = 1280;
const PH = 1201;
// the middle of his little world on the canvas, and the line it stands on; metres to a pixel
const CX = 616;
const BASE = 940;
const S = (2 * R) / 277;
// the figures bow toward the eye at the picture's sides like the wall of an apse, and lean out over the dome
const APSE = 34;
const LEAN = 22;
// where the canvas stands, behind the little world's middle (metres)
const Z0 = -9;
// the board the outlines and the depths are worked out on: it runs a little past the canvas at the sides (the
// kings do not stop where the picture does) and down to the ground; pixels of canvas to a sample
const G = 2.5;
const X0 = -110;
const Y0 = 280;
const MW = Math.ceil((PW + 220) / G);
const MH = Math.ceil((1345 - Y0) / G);

type Poly = [number, number][];

// (in the painting's own pixels, read off it tile by tile against a grid)
const PALE: Poly = [
  [314, 437], [340, 432], [375, 445], [410, 472], [432, 505], [430, 540], [427, 547], [423, 572], [413, 607], [398, 617], [390, 630], [366, 652], [373, 684], [386, 726],
  [398, 763], [412, 808], [435, 845], [453, 866], [465, 896], [485, 910], [487, 1019], [520, 1030], [570, 1060], [596, 1120], [600, 1345], [-95, 1345], [-88, 960],
  [-64, 860], [-30, 790], [4, 749], [62, 630], [104, 588], [127, 574], [169, 567], [181, 526], [204, 495], [238, 472], [269, 461],
];
const PALE_CROWN: Poly = [
  [314, 437], [343, 374], [361, 413], [378, 404], [390, 432], [407, 424], [417, 451], [432, 443], [444, 468], [458, 463], [469, 483], [483, 478], [494, 490], [513, 481],
  [473, 513], [440, 538], [428, 534], [398, 513], [373, 495], [340, 459],
];
const PALE_SLEEVE: Poly = [
  [200, 640], [300, 700], [400, 800], [470, 890], [487, 910], [487, 1019], [412, 1019], [353, 1000], [300, 960], [230, 880], [170, 780], [160, 700],
];
const DARK: Poly = [
  [797, 495], [802, 516], [812, 535], [827, 562], [847, 570], [858, 585], [868, 595], [872, 624], [881, 666], [885, 707], [887, 781], [880, 805], [862, 824], [830, 832],
  [806, 845], [796, 880], [798, 935], [815, 960], [850, 965], [870, 950], [890, 940], [905, 927], [935, 915], [930, 1000], [880, 1030], [700, 1040], [650, 1060], [636, 1120],
  [632, 1345], [1345, 1345], [1340, 1000], [1300, 800], [1240, 640], [1185, 540], [1140, 470], [1060, 420], [990, 396], [935, 350], [880, 322], [850, 345], [800, 385],
  [760, 430], [740, 470], [770, 490],
];
const DARK_CROWN: Poly = [
  [712, 457], [735, 425], [754, 402], [760, 416], [769, 395], [777, 408], [785, 389], [796, 384], [800, 368], [814, 362], [827, 345], [838, 348], [845, 333], [860, 322],
  [877, 319], [896, 338], [900, 362], [866, 405], [839, 437], [815, 470], [797, 495], [785, 493], [740, 478],
];
const DARK_SLEEVE: Poly = [
  [1135, 727], [1081, 781], [1008, 812], [935, 802], [862, 824], [830, 832], [806, 845], [796, 880], [798, 935], [815, 960], [850, 965], [870, 950], [905, 927], [935, 902],
  [984, 860], [1044, 836], [1129, 781], [1160, 740],
];
const FIGURES = [
  { side: -1, body: PALE, crown: PALE_CROWN, sleeve: PALE_SLEEVE, pivot: [330, 640] as [number, number], trim: [0.03, 0.2] as [number, number] },
  { side: 1, body: DARK, crown: DARK_CROWN, sleeve: DARK_SLEEVE, pivot: [900, 600] as [number, number], trim: [0.14, 0.03] as [number, number] },
];

const worldX = (px: number) => (px - CX) * S;
const worldY = (py: number) => BY + (BASE - py) * S;
// how far the canvas itself stands forward at a place (the apse and the lean), and how that changes across and up
const bend = (x: number, y: number) => {
  const up = Math.max(0, y - BY) / 130;
  return APSE * (x / 135) * (x / 135) + LEAN * up * up;
};
const bendDx = (x: number) => (2 * APSE * x) / (135 * 135);
const bendDy = (y: number) => (y > BY ? (2 * LEAN * (y - BY)) / (130 * 130) : 0);

// three passes of a box come very near a gaussian; `r` in samples
function blur(a: Float32Array, w: number, h: number, r: number) {
  if (r < 1) return a;
  const b = new Float32Array(a.length);
  const pass = (src: Float32Array, dst: Float32Array, n: number, stride: number, lines: number, step: number) => {
    for (let l = 0; l < lines; l++) {
      const o = l * step;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[o + Math.min(n - 1, Math.max(0, i)) * stride];
      for (let i = 0; i < n; i++) {
        dst[o + i * stride] = acc / (2 * r + 1);
        acc += src[o + Math.min(n - 1, i + r + 1) * stride] - src[o + Math.max(0, i - r) * stride];
      }
    }
  };
  for (let k = 0; k < 3; k++) {
    pass(a, b, w, 1, h, w);
    pass(b, a, h, w, w, 1);
  }
  return a;
}

// how far every sample that is `on` lies from the nearest that is not (in samples; Felzenszwalb's two sweeps)
function distance(on: Uint8Array, w: number, h: number) {
  const INF = 1e12;
  const d = new Float32Array(w * h);
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const out = new Float64Array(n);
  const sweep = (len: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = 0;
      for (;;) {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
        if (s > z[k]) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const p = v[k];
      out[q] = (q - p) * (q - p) + f[p];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = on[x + y * w] ? INF : 0;
    sweep(h);
    for (let y = 0; y < h; y++) d[x + y * w] = out[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = d[x + y * w];
    sweep(w);
    for (let x = 0; x < w; x++) d[x + y * w] = Math.sqrt(out[x]);
  }
  return d;
}

const sst = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// A crown is a ring. He painted the near side of it, seen a little from below: a band with its points, running
// along the brow. So the ring is stood on the head with the canvas through its middle, as long as the painted band
// and as deep as the head, and its wall is as tall at every place along it as he painted it there: the near wall is
// his picture of it exactly, the far wall the same, and round the ends the points come one behind another.
type Ring = { ox: number; oy: number; bx: number; by: number; ax: number; ay: number; uc: number; rc: number; rz: number; top: Float32Array; bot: Float32Array; col: [number, number, number] };
const RING_N = 160;
function ringOf(poly: Poly, trim: [number, number], rz: number): Ring {
  const pts = poly.map(([x, y]) => [worldX(x), worldY(y)]);
  let A = pts[0];
  let B = pts[1];
  let best = 0;
  for (const p of pts)
    for (const q of pts) {
      const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (dd > best && p[0] < q[0]) {
        best = dd;
        A = p;
        B = q;
      }
    }
  const L = Math.sqrt(best);
  const bx = (B[0] - A[0]) / L;
  const by = (B[1] - A[1]) / L;
  let ax = -by;
  let ay = bx;
  if (ay < 0) {
    ax = -ax;
    ay = -ay;
  }
  const loc = pts.map((p) => [(p[0] - A[0]) * bx + (p[1] - A[1]) * by, (p[0] - A[0]) * ax + (p[1] - A[1]) * ay]);
  const umin = Math.min(...loc.map((p) => p[0]));
  const umax = Math.max(...loc.map((p) => p[0]));
  const ua = umin + trim[0] * (umax - umin);
  const ub = umax - trim[1] * (umax - umin);
  const top = new Float32Array(RING_N);
  const bot = new Float32Array(RING_N);
  for (let k = 0; k < RING_N; k++) {
    const u = ua + ((ub - ua) * k) / (RING_N - 1);
    let lo = 1e9;
    let hi = -1e9;
    for (let i = 0; i < loc.length; i++) {
      const p = loc[i];
      const q = loc[(i + 1) % loc.length];
      if (p[0] - u > 0 === q[0] - u > 0) continue;
      const a = p[1] + ((q[1] - p[1]) * (u - p[0])) / (q[0] - p[0]);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
    top[k] = hi;
    bot[k] = lo;
  }
  return { ox: A[0], oy: A[1], bx, by, ax, ay, uc: (ua + ub) / 2, rc: (ub - ua) / 2, rz, top, bot, col: [0.5, 0.2, 0.08] };
}

type Fig = { hf: Float32Array; hb: Float32Array; d: Float32Array; trust: Float32Array; side: number; pivot: [number, number]; ring: Ring };
type Maps = { paint: THREE.Texture; under: THREE.DataTexture; figs: Fig[] };

// The board: for each king how far he stands out of the canvas before and behind at every point, and the
// painting's colours with its detail taken off (for the rims, and for what lies past the picture's edge).
function* boardSteps(img: HTMLImageElement): Generator<void, Maps, void> {
  const c = document.createElement("canvas");
  c.width = MW;
  c.height = MH;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, MW, MH);
  g.drawImage(img, 0, 0, PW, PH, -X0 / G, -Y0 / G, PW / G, PH / G);
  const px = g.getImageData(0, 0, MW, MH).data;
  const N = MW * MH;
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) lum[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.55 + px[i * 4 + 2] * 0.15) / 255;
  blur(lum, MW, MH, 1);
  // (the light of the paint against the light of the paint round it: what stands proud is a stroke, not a whole pale robe)
  const wide = blur(lum.slice(), MW, MH, 7);
  yield;

  const fill = (poly: Poly) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, MW, MH);
    g.fillStyle = "#fff";
    g.beginPath();
    poly.forEach(([x, y], i) => (i ? g.lineTo((x - X0) / G, (y - Y0) / G) : g.moveTo((x - X0) / G, (y - Y0) / G)));
    g.closePath();
    g.fill();
    const m = g.getImageData(0, 0, MW, MH).data;
    const a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = m[i * 4] / 255;
    return a;
  };
  const all = new Float32Array(N);
  const figs: Maps["figs"] = [];
  for (const F of FIGURES) {
    const body = fill(F.body);
    const crown = fill(F.crown);
    const sleeve = blur(fill(F.sleeve), MW, MH, 5);
    const on = new Uint8Array(N);
    const off = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      on[i] = body[i] > 0.5 ? 1 : 0;
      off[i] = 1 - on[i];
      // (the crown's own paint is no part of what the head under it is painted with)
      if (on[i] && crown[i] < 0.5) all[i] = 1;
    }
    // the crown's colour, taken as a whole
    const ring = ringOf(F.crown, F.trim, 12.5);
    {
      let r = 0;
      let gg = 0;
      let b = 0;
      let n = 0;
      for (let i = 0; i < N; i++) {
        if (crown[i] < 0.5) continue;
        const l = px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2];
        // (its lit strokes, not the dark between them)
        const wgt = l * l;
        r += px[i * 4] * wgt;
        gg += px[i * 4 + 1] * wgt;
        b += px[i * 4 + 2] * wgt;
        n += wgt;
      }
      const c = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
      ring.col = [c.r, c.g, c.b];
    }
    yield;
    const din = distance(on, MW, MH);
    yield;
    const dout = distance(off, MW, MH);
    yield;
    // metres in from the outline (out of it: negative), with the corners of the tracing taken off
    const d = new Float32Array(N);
    for (let i = 0; i < N; i++) d[i] = (on[i] ? din[i] - 0.5 : 0.5 - dout[i]) * G * S;
    blur(d, MW, MH, 1);
    const crownSoft = blur(crown, MW, MH, 2);
    const trust = new Float32Array(N);
    for (let i = 0; i < N; i++) trust[i] = d[i] * (1 - sst(0.2, 0.7, crownSoft[i]));
    const hf = new Float32Array(N);
    const hb = new Float32Array(N);
    const RR = 15;
    for (let i = 0; i < N; i++) {
      const di = d[i];
      if (di <= 0) {
        hf[i] = hb[i] = di;
        continue;
      }
      // a round edge, a full middle
      const t = 1 - Math.min(di, RR) / RR;
      let h = RR * Math.sqrt(1 - t * t) + 0.22 * Math.max(0, di - RR);
      h = Math.min(h, 25);
      // the sleeve lies on the robe
      h += 6.5 * sleeve[i] * sst(0, 5, di);
      const inCanvas = sst(0, 12, (i % MW) * G + X0) * sst(0, 12, PW - ((i % MW) * G + X0)) * sst(0, 16, PH * 0.985 - (Math.floor(i / MW) * G + Y0));
      const proud = (lum[i] - wide[i]) * 9 * sst(1.5, 7, di) * inCanvas;
      hf[i] = h + proud;
      hb[i] = h + proud * 0.6;
    }
    figs.push({ hf, hb, d, trust, side: F.side, pivot: F.pivot, ring });
    yield;
  }

  // the underpainting: the colour of the figure about each place, with nothing of the wood behind it mixed in
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i % MW) * G + X0;
    const y = Math.floor(i / MW) * G + Y0;
    w[i] = all[i] && x > 10 && x < PW - 14 && y < PH * 0.975 ? 1 : 0;
  }
  const under = new Uint8Array(N * 4);
  const near: Float32Array[] = [];
  const far: Float32Array[] = [];
  for (let ch = 0; ch < 3; ch++) {
    const a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = (px[i * 4 + ch] / 255) * w[i];
    far.push(blur(a.slice(), MW, MH, 22));
    near.push(blur(a, MW, MH, 4));
    yield;
  }
  const wn = blur(w.slice(), MW, MH, 4);
  const wf = blur(w.slice(), MW, MH, 22);
  for (let i = 0; i < N; i++) {
    const k = sst(0.04, 0.3, wn[i]);
    for (let ch = 0; ch < 3; ch++) {
      const a = wn[i] > 1e-3 ? near[ch][i] / wn[i] : 0;
      const b = wf[i] > 1e-4 ? far[ch][i] / wf[i] : [0.05, 0.04, 0.03][ch];
      under[i * 4 + ch] = Math.round(255 * Math.min(1, b + (a - b) * k));
    }
    under[i * 4 + 3] = 255;
  }
  const ut = new THREE.DataTexture(under, MW, MH, THREE.RGBAFormat);
  ut.colorSpace = THREE.SRGBColorSpace;
  ut.magFilter = ut.minFilter = THREE.LinearFilter;
  ut.needsUpdate = true;

  const paint = new THREE.Texture(img);
  paint.colorSpace = THREE.SRGBColorSpace;
  paint.flipY = false;
  paint.wrapS = paint.wrapT = THREE.ClampToEdgeWrapping;
  paint.anisotropy = 8;
  paint.needsUpdate = true;
  return { paint, under: ut, figs };
}

// The skin over one king, at a given fineness (metres between samples).
type Skin = { pos: number[]; nor: number[]; dep: number[]; idx: number[] };
function* skinSteps(f: Fig, voxel: number, budget: number): Generator<void, Skin, void> {
  let began = performance.now();
  // where he is on the board
  let i0 = MW;
  let i1 = 0;
  let j0 = MH;
  let j1 = 0;
  let hmax = 0;
  for (let j = 0; j < MH; j++)
    for (let i = 0; i < MW; i++) {
      const q = i + j * MW;
      if (f.d[q] <= 0) continue;
      i0 = Math.min(i0, i);
      i1 = Math.max(i1, i);
      j0 = Math.min(j0, j);
      j1 = Math.max(j1, j);
      hmax = Math.max(hmax, f.hf[q], f.hb[q]);
    }
  const xa = worldX(i0 * G + X0) - voxel * 2;
  const xb = worldX(i1 * G + X0) + voxel * 2;
  // (not below the ground: nothing of him is seen there)
  const ya = Math.max(-3, worldY(j1 * G + Y0) - voxel * 2);
  const yb = worldY(j0 * G + Y0) + voxel * 2;
  const nx = Math.ceil((xb - xa) / voxel) + 1;
  const ny = Math.ceil((yb - ya) / voxel) + 1;
  const za = -(hmax + voxel * 2);
  const nz = Math.ceil((2 * (hmax + voxel * 2)) / voxel) + 1;
  // the board read between its samples, onto the net the skin is drawn on
  const HF = new Float32Array(nx * ny);
  const HB = new Float32Array(nx * ny);
  const DD = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const fy = Math.min(MH - 1.001, Math.max(0, (BASE - (ya + j * voxel - BY) / S - Y0) / G));
    const jy = Math.floor(fy);
    const ty = fy - jy;
    for (let i = 0; i < nx; i++) {
      const fx = Math.min(MW - 1.001, Math.max(0, ((xa + i * voxel) / S + CX - X0) / G));
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const q = ix + jy * MW;
      const rd = (a: Float32Array) => (a[q] * (1 - tx) + a[q + 1] * tx) * (1 - ty) + (a[q + MW] * (1 - tx) + a[q + MW + 1] * tx) * ty;
      const c = i + j * nx;
      HF[c] = rd(f.hf);
      HB[c] = rd(f.hb);
      DD[c] = rd(f.trust);
    }
  }
  yield;

  const nxy = nx * ny;
  const CO = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const CC = [0, 1, nx, nx + 1, 0, 1, nx, nx + 1];
  const CK = [0, 0, 0, 0, 1, 1, 1, 1];
  const EA = [0, 1, 2, 0, 4, 5, 6, 4, 0, 1, 3, 2];
  const EB = [1, 3, 3, 2, 5, 7, 7, 6, 4, 5, 7, 6];
  const BIT = [1, 2, 8, 4, 16, 32, 128, 64];
  const pos: number[] = [];
  const nor: number[] = [];
  const dep: number[] = [];
  const idx: number[] = [];
  const seen = new Map<number, number>();
  const fv = new Float32Array(8);
  const ev = new Int32Array(12);
  const at = (c: number, k: number) => {
    const z = za + k * voxel;
    return Math.max(z - HF[c], -z - HB[c]);
  };
  const ga = [0, 0, 0];
  const gb = [0, 0, 0];
  const grad = (c: number, k: number, out: number[]) => {
    const z = za + k * voxel;
    const front = z - HF[c] > -z - HB[c];
    const H = front ? HF : HB;
    const i = c % nx;
    const j = (c - i) / nx;
    const l = i > 0 ? c - 1 : c;
    const r = i < nx - 1 ? c + 1 : c;
    const dn = j > 0 ? c - nx : c;
    const u = j < ny - 1 ? c + nx : c;
    out[0] = -(H[r] - H[l]) / ((r - l) * voxel || 1);
    out[1] = -(H[u] - H[dn]) / (((u - dn) / nx) * voxel || 1);
    out[2] = front ? 1 : -1;
  };
  const vertex = (ca: number, ka: number, cb: number, kb: number, fa: number, fb: number) => {
    const qa = ca + ka * nxy;
    const qb = cb + kb * nxy;
    const lo = Math.min(qa, qb);
    const key = lo * 3 + (ka !== kb ? 2 : Math.abs(ca - cb) === 1 ? 0 : 1);
    const had = seen.get(key);
    if (had !== undefined) return had;
    const t = Math.abs(fa - fb) > 1e-9 ? fa / (fa - fb) : 0.5;
    const ax = ca % nx;
    const ay = (ca - ax) / nx;
    const bx = cb % nx;
    const by = (cb - bx) / nx;
    const x = xa + (ax + (bx - ax) * t) * voxel;
    const y = ya + (ay + (by - ay) * t) * voxel;
    const z = za + (ka + (kb - ka) * t) * voxel;
    grad(ca, ka, ga);
    grad(cb, kb, gb);
    let gx = ga[0] + (gb[0] - ga[0]) * t;
    let gy = ga[1] + (gb[1] - ga[1]) * t;
    const gz = ga[2] + (gb[2] - ga[2]) * t;
    // the canvas is not flat: the skin goes with it, and what faces along the canvas turns with its bow
    gx -= gz * bendDx(x);
    gy -= gz * bendDy(y);
    const gl = Math.hypot(gx, gy, gz) || 1;
    pos.push(x, y, KINGS.z + Z0 + z + bend(x, y));
    nor.push(gx / gl, gy / gl, gz / gl);
    dep.push(DD[ca] + (DD[cb] - DD[ca]) * t);
    const id = pos.length / 3 - 1;
    seen.set(key, id);
    return id;
  };
  for (let j = 0; j < ny - 1; j++) {
    if (performance.now() - began > budget) {
      yield;
      began = performance.now();
    }
    for (let i = 0; i < nx - 1; i++) {
      const c = i + j * nx;
      const hfM = Math.max(HF[c], HF[c + 1], HF[c + nx], HF[c + nx + 1]);
      const hbM = Math.max(HB[c], HB[c + 1], HB[c + nx], HB[c + nx + 1]);
      if (hfM + hbM <= 0) continue;
      const k0 = Math.max(0, Math.floor((-hbM - za) / voxel) - 1);
      const k1 = Math.min(nz - 2, Math.ceil((hfM - za) / voxel));
      for (let k = k0; k <= k1; k++) {
        let ci = 0;
        for (let n = 0; n < 8; n++) {
          fv[n] = at(c + CC[n], k + CK[n]);
          if (fv[n] < 0) ci |= BIT[n];
        }
        const bits = edgeTable[ci];
        if (bits === 0) continue;
        for (let e = 0; e < 12; e++) if (bits & (1 << e)) ev[e] = vertex(c + CC[EA[e]], k + CK[EA[e]], c + CC[EB[e]], k + CK[EB[e]], fv[EA[e]], fv[EB[e]]);
        for (let t = ci << 4; triTable[t] !== -1; t += 3) {
          const a = ev[triTable[t]];
          const b = ev[triTable[t + 1]];
          const d = ev[triTable[t + 2]];
          if (a === b || b === d || a === d) continue;
          const ux = pos[b * 3] - pos[a * 3];
          const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
          const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
          const vx = pos[d * 3] - pos[a * 3];
          const vy = pos[d * 3 + 1] - pos[a * 3 + 1];
          const vz = pos[d * 3 + 2] - pos[a * 3 + 2];
          const fx = uy * vz - uz * vy;
          const fy = uz * vx - ux * vz;
          const fz = ux * vy - uy * vx;
          if (fx * (nor[a * 3] + nor[b * 3] + nor[d * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[d * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[d * 3 + 2]) >= 0) idx.push(a, b, d);
          else idx.push(a, d, b);
        }
      }
    }
  }
  void CO;
  return { pos, nor, dep, idx };
}

// The skin over a crown: a small block of clay worked through and through, much finer than the king under it.
function* crownSteps(g: Ring, voxel: number, budget: number): Generator<void, Skin, void> {
  let began = performance.now();
  const tw = Math.max(1.5, voxel * 2.3);
  let lo = [1e9, 1e9];
  let hi = [-1e9, -1e9];
  let a0 = 1e9;
  let a1 = -1e9;
  for (let k = 0; k < RING_N; k++)
    if (g.top[k] > g.bot[k]) {
      a0 = Math.min(a0, g.bot[k]);
      a1 = Math.max(a1, g.top[k]);
    }
  for (const u of [g.uc - g.rc - tw, g.uc + g.rc + tw])
    for (const a of [a0, a1]) {
      const x = g.ox + u * g.bx + a * g.ax;
      const y = g.oy + u * g.by + a * g.ay;
      lo = [Math.min(lo[0], x), Math.min(lo[1], y)];
      hi = [Math.max(hi[0], x), Math.max(hi[1], y)];
    }
  const pad = voxel * 2;
  const xa = lo[0] - pad;
  const ya = lo[1] - pad;
  const za = -(g.rz + tw + pad);
  const nx = Math.ceil((hi[0] - lo[0] + pad * 2) / voxel) + 1;
  const ny = Math.ceil((hi[1] - lo[1] + pad * 2) / voxel) + 1;
  const nz = Math.ceil((-2 * za) / voxel) + 1;
  const nxy = nx * ny;
  const F = new Float32Array(nxy * nz);
  for (let k = 0; k < nz; k++) {
    if (performance.now() - began > budget) {
      yield;
      began = performance.now();
    }
    const zz = (za + k * voxel) / g.rz;
    for (let j = 0; j < ny; j++) {
      const y = ya + j * voxel - g.oy;
      for (let i = 0; i < nx; i++) {
        const x = xa + i * voxel - g.ox;
        const u = x * g.bx + y * g.by - g.uc;
        const av = x * g.ax + y * g.ay;
        const uu = u / g.rc;
        const rho = Math.hypot(uu, zz);
        const gr = Math.hypot(uu / g.rc, zz / g.rz) / Math.max(rho, 1e-3);
        const dw = Math.abs(rho - 1) / Math.max(gr, 1e-4) - tw / 2;
        const t = Math.min(RING_N - 1.001, Math.max(0, ((u + g.rc) / (2 * g.rc)) * (RING_N - 1)));
        const it = Math.floor(t);
        const ft = t - it;
        const top = g.top[it] + (g.top[it + 1] - g.top[it]) * ft;
        const bot = g.bot[it] + (g.bot[it + 1] - g.bot[it]) * ft;
        F[i + j * nx + k * nxy] = Math.max(dw, bot - av, av - top);
      }
    }
  }
  const CO = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const EA = [0, 1, 2, 0, 4, 5, 6, 4, 0, 1, 3, 2];
  const EB = [1, 3, 3, 2, 5, 7, 7, 6, 4, 5, 7, 6];
  const BIT = [1, 2, 8, 4, 16, 32, 128, 64];
  const pos: number[] = [];
  const nor: number[] = [];
  const dep: number[] = [];
  const idx: number[] = [];
  const seen = new Map<number, number>();
  const ev = new Int32Array(12);
  const total = F.length;
  const ga = [0, 0, 0];
  const gb = [0, 0, 0];
  const grad = (q: number, out: number[]) => {
    out[0] = (q + 1 < total ? F[q + 1] : F[q]) - (q >= 1 ? F[q - 1] : F[q]);
    out[1] = (q + nx < total ? F[q + nx] : F[q]) - (q >= nx ? F[q - nx] : F[q]);
    out[2] = (q + nxy < total ? F[q + nxy] : F[q]) - (q >= nxy ? F[q - nxy] : F[q]);
  };
  const vertex = (qa: number, qb: number) => {
    const key = Math.min(qa, qb) * 3 + (Math.abs(qa - qb) === 1 ? 0 : Math.abs(qa - qb) === nx ? 1 : 2);
    const had = seen.get(key);
    if (had !== undefined) return had;
    const fa = F[qa];
    const fb = F[qb];
    const t = Math.abs(fa - fb) > 1e-9 ? fa / (fa - fb) : 0.5;
    const ax = qa % nx;
    const ay = Math.floor(qa / nx) % ny;
    const az = Math.floor(qa / nxy);
    const bx = qb % nx;
    const by = Math.floor(qb / nx) % ny;
    const bz = Math.floor(qb / nxy);
    const x = xa + (ax + (bx - ax) * t) * voxel;
    const y = ya + (ay + (by - ay) * t) * voxel;
    const z = za + (az + (bz - az) * t) * voxel;
    grad(qa, ga);
    grad(qb, gb);
    let gx = ga[0] + (gb[0] - ga[0]) * t;
    let gy = ga[1] + (gb[1] - ga[1]) * t;
    const gz = ga[2] + (gb[2] - ga[2]) * t;
    gx -= gz * bendDx(x);
    gy -= gz * bendDy(y);
    const gl = Math.hypot(gx, gy, gz) || 1;
    pos.push(x, y, KINGS.z + Z0 + z + bend(x, y));
    nor.push(gx / gl, gy / gl, gz / gl);
    dep.push(20);
    const id = pos.length / 3 - 1;
    seen.set(key, id);
    return id;
  };
  for (let k = 0; k < nz - 1; k++) {
    if (performance.now() - began > budget) {
      yield;
      began = performance.now();
    }
    for (let j = 0; j < ny - 1; j++) {
      let q = j * nx + k * nxy;
      for (let i = 0; i < nx - 1; i++, q++) {
        let ci = 0;
        for (let n = 0; n < 8; n++) if (F[q + CO[n]] < 0) ci |= BIT[n];
        const bits = edgeTable[ci];
        if (bits === 0) continue;
        for (let e = 0; e < 12; e++) if (bits & (1 << e)) ev[e] = vertex(q + CO[EA[e]], q + CO[EB[e]]);
        for (let t = ci << 4; triTable[t] !== -1; t += 3) {
          const a = ev[triTable[t]];
          const b = ev[triTable[t + 1]];
          const d = ev[triTable[t + 2]];
          if (a === b || b === d || a === d) continue;
          const ux = pos[b * 3] - pos[a * 3];
          const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
          const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
          const vx = pos[d * 3] - pos[a * 3];
          const vy = pos[d * 3 + 1] - pos[a * 3 + 1];
          const vz = pos[d * 3 + 2] - pos[a * 3 + 2];
          const fx = uy * vz - uz * vy;
          const fy = uz * vx - ux * vz;
          const fz = ux * vy - uy * vx;
          if (fx * (nor[a * 3] + nor[b * 3] + nor[d * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[d * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[d * 3 + 2]) >= 0) idx.push(a, b, d);
          else idx.push(a, d, b);
        }
      }
    }
  }
  return { pos, nor, dep, idx };
}

// king and crown as one thing to draw
function join(body: Skin, crown: Skin) {
  const nb = body.pos.length / 3;
  const nc = crown.pos.length / 3;
  const pos = new Float32Array((nb + nc) * 3);
  pos.set(body.pos);
  pos.set(crown.pos, nb * 3);
  const nor = new Float32Array((nb + nc) * 3);
  nor.set(body.nor);
  nor.set(crown.nor, nb * 3);
  const dep = new Float32Array(nb + nc);
  dep.set(body.dep);
  dep.set(crown.dep, nb);
  const kind = new Float32Array(nb + nc);
  kind.fill(1, nb);
  const idx = new Uint32Array(body.idx.length + crown.idx.length);
  idx.set(body.idx);
  for (let i = 0; i < crown.idx.length; i++) idx[body.idx.length + i] = crown.idx[i] + nb;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("aDeep", new THREE.BufferAttribute(dep, 1));
  geo.setAttribute("aCrown", new THREE.BufferAttribute(kind, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.boundingSphere!.radius += 8;
  return geo;
}

function makeSkin(maps: Maps, side: number, pivot: [number, number], crownCol: [number, number, number]) {
  const pvx = worldX(pivot[0]);
  const pvy = worldY(pivot[1]);
  return new THREE.ShaderMaterial({
    uniforms: {
      ...KINGS_UNIFORMS,
      tPaint: { value: maps.paint },
      tUnder: { value: maps.under },
      uSide: { value: side },
      uPivot: { value: new THREE.Vector2(pvx, pvy) },
      uCrownCol: { value: new THREE.Vector3(...crownCol) },
    },
    vertexShader: /* glsl */ `
      attribute float aDeep; attribute float aCrown; varying float vCrown;
      uniform float uSide; uniform vec2 uPivot; uniform float uTime; uniform vec4 uEvt;
      varying vec3 vWorld; varying vec3 vN; varying vec2 vPx; varying float vDeep;
      void main(){
        vec3 p = position;
        // where on his canvas this point of the skin lies (before anything moves)
        vPx = vec2(p.x / ${S.toFixed(6)} + ${CX}.0, ${BASE}.0 - (p.y - ${BY.toFixed(4)}) / ${S.toFixed(6)});
        vDeep = aDeep; vCrown = aCrown;
        vN = normal;
        // they breathe, very slowly: the whole figure the least bit fuller and back
        p.z += normal.z * sin(uTime * 0.38 + uSide) * 0.5 * smoothstep(0.0, 9.0, aDeep);
        // the head moves the least amount about the neck, and bows a little closer over the light when the plane is near
        vec2 d = p.xy - uPivot;
        float w = 1.0 - smoothstep(34.0, 80.0, length(d));
        float ang = uSide * ((sin(uTime * 0.09 + uSide * 1.7) * 0.6 + sin(uTime * 0.041 + 1.3) * 0.4) * 0.012 + 0.028 * uEvt.y) * w;
        float c = cos(ang); float s = sin(ang);
        p.xy = uPivot + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tPaint; uniform sampler2D tUnder; uniform float uSide; uniform vec3 uCrownCol; varying float vCrown;
      varying vec3 vWorld; varying vec3 vN; varying vec2 vPx; varying float vDeep;
      ${GLSL_KINGS}
      float lumOf(vec3 c){ return dot(c, vec3(0.3, 0.55, 0.15)); }
      // long strokes of a loaded brush, laid along q.y
      float strokes(vec2 q){
        float a = vnoise(vec2(q.x * 0.5, q.y * 0.06) + 3.1);
        float b = vnoise(vec2(q.x * 1.6 + a * 2.0, q.y * 0.2));
        float c = vnoise(q * vec2(4.6, 0.8) + 9.0);
        return a * 0.5 + b * 0.32 + c * 0.18;
      }
      void main(){
        vec3 n = normalize(vN);
        // (the photograph of the canvas has its frame's edge along the bottom and the sides: never read that far)
        vec2 uv = vec2(clamp(vPx.x / ${PW}.0, 0.006, 0.994), min(vPx.y / ${PH}.0, 0.986));
        vec2 uu = (vPx - vec2(${X0}.0, ${Y0}.0)) / (${G.toFixed(2)} * vec2(${MW}.0, ${MH}.0));
        vec3 paint = texture2D(tPaint, uv).rgb;
        vec3 soft = texture2D(tPaint, uv, 2.5).rgb;
        vec3 under = texture2D(tUnder, uu).rgb;
        // how far the painting itself can be trusted here: on what faces along the canvas, well inside his outline, on the canvas
        float inside = smoothstep(0.5, 3.2, vDeep)
          * smoothstep(0.0, 14.0, vPx.x) * smoothstep(0.0, 14.0, ${PW}.0 - vPx.x) * smoothstep(0.0, 18.0, ${PH}.0 * 0.985 - vPx.y);
        float wF = smoothstep(0.1, 0.48, n.z) * inside;
        float wB = smoothstep(0.1, 0.48, -n.z) * inside;
        // the strokes belong to the surface: laid on it from three sides, each where it faces
        vec3 P = vWorld - uDome;
        vec3 aw = pow(abs(n), vec3(4.0)); aw /= aw.x + aw.y + aw.z;
        float br = strokes(vec2(P.z, P.y)) * aw.x + strokes(vec2(P.z + P.x * 0.3, P.x * 2.0)) * aw.y + strokes(vec2(P.x, P.y)) * aw.z;
        // (the crown's own rims are its own colour: gold gone red in that light)
        vec3 rim = mix(under, uCrownCol * (0.55 + 0.5 * vnoise(P.xy * 0.9 + P.z * 0.7)), step(0.5, vCrown)) * (0.66 + 0.7 * br);
        // the far side is the same picture, quieter: the paint's large forms and its colours, less of its detail
        vec3 back = mix(soft, paint, 0.7) * (0.84 + 0.3 * br);
        vec3 alb = rim * (1.0 - wF - wB) + paint * wF + back * wB;
        // below the picture's own edge the robes go on down into the dark
        alb = mix(alb, vec3(0.013, 0.012, 0.011), smoothstep(${Math.round(PH * 0.93)}.0, ${Math.round(PH * 1.03)}.0, vPx.y) * 0.95);
        // close to, the tooth of his canvas
        float dist = length(cameraPosition - vWorld);
        float tooth = (vnoise(vWorld.xy * 2.6 + vWorld.z) - 0.5) * 0.6 + (vnoise(vec2(vWorld.x * 9.0, vWorld.y * 1.2 + vWorld.z * 3.0)) - 0.5) * 0.4;
        alb *= 1.0 + tooth * 0.22 * (1.0 - smoothstep(60.0, 220.0, dist));
        // the brushwork stands in the light: where the paint is lighter it is a little proud
        float l0 = lumOf(paint);
        float lx = lumOf(texture2D(tPaint, uv + vec2(1.6 / ${PW}.0, 0.0)).rgb);
        float ly = lumOf(texture2D(tPaint, uv + vec2(0.0, 1.6 / ${PH}.0)).rgb);
        n = normalize(n + (vec3(1.0, 0.0, 0.0) * (l0 - lx) + vec3(0.0, 1.0, 0.0) * (ly - l0)) * 2.4 * (wF + wB));
        // the picture holds its own light already; the little world's is laid over it softly, and breathes
        vec2 dl = domeLight(vWorld, n);
        float wrap = clamp(dl.x * 0.6 + 0.4, 0.0, 1.0);
        // (what is turned from the eye's side of the canvas is in his own shade)
        float shade = mix(0.74, 0.5, smoothstep(0.0, 0.6, -n.z));
        // (and the night's own little light gives a turned back its roundness)
        vec3 col = alb * (shade + coolFill(n) * 2.2 * smoothstep(0.2, -0.4, n.z) + DOME_WARM * dl.y * wrap * 1.5) * 1.12;
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}

export type KingsSolid = { maps: Maps; kings: { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }[] };

// the fineness of the skin: finer where the machine can carry it
export const kingsVoxel = (p: { mobile: boolean; trees: number }) => (p.mobile || p.trees < 0.7 ? 2.6 : p.trees < 0.95 ? 2 : 1.6);

function* solidSteps(img: HTMLImageElement, voxel: number, budget: number): Generator<void, KingsSolid, void> {
  const maps = yield* boardSteps(img);
  yield;
  const kings: KingsSolid["kings"] = [];
  for (const f of maps.figs) {
    const body = yield* skinSteps(f, voxel, budget);
    yield;
    const crown = yield* crownSteps(f.ring, voxel * 0.45, budget);
    kings.push({ geo: join(body, crown), mat: makeSkin(maps, f.side, f.pivot, f.ring.col) });
    yield;
  }
  return { maps, kings };
}

// Made ahead of time with the wood (see prepareKings), a little each frame, or by the world itself when it is
// come upon unprepared. One at a time: the same work is never begun twice.
let img: HTMLImageElement | null = null;
let imgState: "none" | "loading" | "ready" | "failed" = "none";
let job: { voxel: number; g: Generator<void, KingsSolid, void> } | null = null;
let made: { voxel: number; solid: KingsSolid } | null = null;

const letGo = (s: KingsSolid) => {
  s.maps.paint.dispose();
  s.maps.under.dispose();
  for (const k of s.kings) {
    k.geo.dispose();
    k.mat.dispose();
  }
};
// call once a frame until it says it is done (true also when the painting cannot be had: the world goes on without)
export function stepKingsSolid(voxel: number, budget = 5): boolean {
  if (typeof window === "undefined") return true;
  if (made && made.voxel === voxel) return true;
  if (imgState === "none") {
    imgState = "loading";
    const im = new Image();
    im.onload = () => {
      img = im;
      imgState = "ready";
    };
    im.onerror = () => (imgState = "failed");
    im.src = "/assets/ciurlionis/kings.jpg";
  }
  if (imgState === "failed") return true;
  if (imgState !== "ready" || !img) return false;
  if (made) {
    letGo(made.solid);
    made = null;
  }
  if (!job || job.voxel !== voxel) job = { voxel, g: solidSteps(img, voxel, budget) };
  const t0 = performance.now();
  for (;;) {
    const r = job.g.next();
    if (r.done) {
      made = { voxel, solid: r.value };
      job = null;
      return true;
    }
    if (performance.now() - t0 > budget) return false;
  }
}
export function dropKingsSolid() {
  job = null;
  if (made) letGo(made.solid);
  made = null;
}

export function SolidKings({ mobile, trees }: { mobile: boolean; trees: number }) {
  const voxel = kingsVoxel({ mobile, trees });
  const [b, setB] = useState<KingsSolid | null>(() => (made && made.voxel === voxel ? made.solid : null));
  const mine = useRef<{ voxel: number; solid: KingsSolid | null }>({ voxel, solid: b });
  useFrame(() => {
    const m = mine.current;
    if (m.solid && m.voxel === voxel) return;
    if (stepKingsSolid(voxel, 8) && made && made.voxel === voxel) {
      mine.current = { voxel, solid: made.solid };
      setB(made.solid);
    }
  });
  useEffect(
    () => () => {
      // (it goes with the world that showed it)
      if (made && made.solid === mine.current.solid) dropKingsSolid();
    },
    [],
  );
  if (process.env.NODE_ENV !== "production" && b) Object.assign(window, { __kingsSolid: { tris: b.kings.map((k) => (k.geo.index?.count ?? 0) / 3), voxel, solid: b } });
  if (!b) return null;
  return (
    <>
      {b.kings.map((k, i) => (
        <mesh key={k.geo.uuid + i} geometry={k.geo} material={k.mat} />
      ))}
    </>
  );
}
