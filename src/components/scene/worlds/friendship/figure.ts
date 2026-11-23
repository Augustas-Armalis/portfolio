import type * as THREE from "three";
import { HEAD, ORB } from "./shape";
import { surfaceSteps, type Box } from "./surface";

// Her, as distance fields in the world's own metres. She faces -x (toward the orb, across the path of light); the
// eye sees her from the side, as the picture does.
//
//   the head   her profile, drawn as a line (forehead, brow, the nose's root, chin, throat, nape, the back of the
//              skull) and inflated round (a face is narrow only at its outline); the nose and the lips are laid on
//              it as their own small forms, the closed eye pressed in; a knot of hair at the back
//   the arm    shoulder, upper arm, forearm, the open hand under the orb with its fingers along the orb's curve and
//              the thumb up its near side
//   the body   shoulders, breast and the long fall of her robe into the dark of the floor
// Each is its own skin; where one goes into another it is buried in it.

const S = HEAD.h; // the head's height, chin to crown
const sst = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export const HEAD_BOX: Box = { min: [HEAD.x - 0.44 * S, HEAD.y - 1.22 * S, -17], max: [HEAD.x + 0.68 * S, HEAD.y + 0.54 * S, 17] };

// ---------- a profile: signed distance to a closed outline (negative inside) ----------
type P2 = [number, number];
function polyDist(poly: P2[], u: number, v: number) {
  let d = 1e9;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const ex = bx - ax;
    const ey = by - ay;
    const wx = u - ax;
    const wy = v - ay;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    const dx = wx - ex * t;
    const dy = wy - ey * t;
    d = Math.min(d, dx * dx + dy * dy);
    if (ay > v !== by > v && u < ((bx - ax) * (v - ay)) / (by - ay) + ax) inside = !inside;
  }
  return (inside ? -1 : 1) * Math.sqrt(d);
}
// a polyline drawn through a few points, smoothed (Chaikin) so the outline has no corners
function smooth(pts: P2[], rounds = 3): P2[] {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    const q: P2[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    p = q;
  }
  return p;
}

// Her head in side view, in head-heights: u forward (toward the orb), v up, from the middle of the skull. The
// outline goes round without the nose and the lips (they are their own forms): from the crown down the forehead,
// over the brow, straight from the nose's root to under it, down to the chin, the throat, and round by the nape.
const HEAD_LINE: P2[] = smooth([
  [0.0, 0.5],
  [0.14, 0.476],
  [0.24, 0.425],
  [0.3, 0.335],
  [0.33, 0.24],
  [0.345, 0.14],
  [0.352, 0.065],
  [0.34, 0.03],
  [0.336, -0.02],
  [0.338, -0.12],
  [0.34, -0.19],
  [0.336, -0.24],
  [0.33, -0.29],
  [0.326, -0.34],
  [0.312, -0.37],
  [0.322, -0.415],
  [0.31, -0.465],
  [0.27, -0.5],
  [0.19, -0.52],
  [0.13, -0.56],
  [0.1, -0.66],
  [0.09, -0.85],
  [0.11, -1.2],
  [-0.24, -1.2],
  [-0.21, -0.86],
  [-0.2, -0.68],
  [-0.25, -0.52],
  [-0.35, -0.33],
  [-0.41, -0.08],
  [-0.4, 0.16],
  [-0.32, 0.34],
  [-0.18, 0.46],
]);
// the nose, in profile: from its root along the bridge to the tip and back under it
const NOSE_LINE: P2[] = smooth(
  [
    [0.326, 0.03],
    [0.344, -0.02],
    [0.37, -0.09],
    [0.398, -0.15],
    [0.404, -0.168],
    [0.392, -0.186],
    [0.36, -0.198],
    [0.33, -0.2],
    [0.31, -0.12],
  ],
  2,
);

// how wide the head is either side of the middle, at a point of the profile (metres)
function headWidth(u: number, v: number) {
  let w = 13.4;
  // the jaw narrows below the cheekbones, the chin more
  w += (11.2 - w) * sst(-0.12, -0.36, v) * sst(-0.05, 0.15, u);
  w += (6.2 - w) * sst(-0.34, -0.47, v) * sst(0.18, 0.3, u);
  // the neck
  w += (8.4 - w) * sst(-0.5, -0.62, v);
  return w;
}
// the inflation: a form of width W, round at its outline, D metres in from the line to its full width
const inflate = (d2: number, z: number, W: number, D: number) => {
  const t = Math.min(1, Math.max(0, -d2 / D));
  return Math.max(d2, Math.abs(z) - W * Math.sqrt(t * (2 - t)));
};
const ell = (x: number, y: number, z: number, rx: number, ry: number, rz: number) => (Math.hypot(x / rx, y / ry, z / rz) - 1) * Math.min(rx, ry, rz);

// (the two outlines are flat: their distances are worked out once for each point of the side view, not for every
// depth of the block)
function headField(voxel: number) {
  const nx = Math.ceil((HEAD_BOX.max[0] - HEAD_BOX.min[0]) / voxel) + 2;
  const ny = Math.ceil((HEAD_BOX.max[1] - HEAD_BOX.min[1]) / voxel) + 2;
  const D2 = new Float32Array(nx * ny).fill(NaN);
  const DN = new Float32Array(nx * ny).fill(NaN);
  return (x: number, y: number, z: number) => {
    const u = (HEAD.x - x) / S;
    const v = (y - HEAD.y) / S;
    const q = Math.round((x - HEAD_BOX.min[0]) / voxel) + Math.round((y - HEAD_BOX.min[1]) / voxel) * nx;
    if (Number.isNaN(D2[q])) {
      D2[q] = polyDist(HEAD_LINE, u, v) * S;
      DN[q] = polyDist(NOSE_LINE, u, v) * S;
    }
    return headAt(x, y, z, u, v, D2[q], DN[q]);
  };
}
function headAt(x: number, y: number, z: number, u: number, v: number, d2: number, dn: number) {
  let f = inflate(d2, z, headWidth(u, v), 14);
  // the nose: narrow at its bridge, its wings widest at the bottom
  const wn = 1.5 + 1.9 * sst(-0.04, -0.17, v);
  f = smin(f, inflate(dn, z, wn, 2.2), 1.3);
  // the lips: two soft rolls that follow the face's curve round
  const zz = z * z * 0.018;
  f = smin(f, ell(x - (HEAD.x - 0.34 * S) - zz, y - (HEAD.y - 0.252 * S), z, 1.25, 1.05, 4.6), 0.8);
  f = smin(f, ell(x - (HEAD.x - 0.338 * S) - zz, y - (HEAD.y - 0.315 * S), z, 1.3, 1.15, 4.2), 0.8);
  // the line of the mouth
  f = smax(f, -ell(x - (HEAD.x - 0.345 * S) - zz, y - (HEAD.y - 0.284 * S), z, 1.0, 0.22, 4.6), 0.35);
  // the closed eyes, under the brow: a shallow hollow, and the lid's roll in it
  for (const sd of [-1, 1]) {
    const ex = x - (HEAD.x - 0.295 * S);
    const ey = y - (HEAD.y - 0.005 * S);
    const ez = z - sd * 5.6;
    f = smax(f, -ell(ex + 1.6, ey, ez, 3.4, 2.0, 3.4), 1.0);
    f = smin(f, ell(ex + 0.3, ey + 0.2, ez, 1.7, 1.25, 2.2), 0.6);
  }
  // the knot of hair at the back of her head
  f = smin(f, ell(x - (HEAD.x + 0.47 * S), y - (HEAD.y + 0.03 * S), z, 0.17 * S, 0.19 * S, 0.17 * S), 3.0);
  return f;
}

// ---------- the arm and the hand ----------
type V = [number, number, number];
const cap = (x: number, y: number, z: number, a: V, b: V, ra: number, rb: number) => {
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const px = x - a[0];
  const py = y - a[1];
  const pz = z - a[2];
  const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz)));
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - (ra + (rb - ra) * t);
};
// a point on the orb's curve, `out` metres outside it, at polar angles (from straight down, and round from -x)
const onOrb = (down: number, round: number, out: number): V => {
  const r = ORB.r + out;
  return [ORB.x - Math.sin(down) * Math.cos(round) * r, ORB.y - Math.cos(down) * r, ORB.z + Math.sin(down) * Math.sin(round) * r];
};
export const ARM = {
  shoulder: [HEAD.x + 18, HEAD.y - 48, 24] as V,
  elbow: [HEAD.x - 16, HEAD.y - 84, 22] as V,
  wrist: [ORB.x + 17, ORB.y - 27, 6] as V,
  palm: [ORB.x + 4, ORB.y - 23.4, 2.5] as V,
};
type Seg = { a: V; b: V; ra: number; rb: number };
const FINGERS: Seg[][] = [];
{
  // four fingers from the palm's edge along the orb's under-curve toward -x, a little apart, curling up its side
  const spread = [-0.34, -0.08, 0.17, 0.42];
  const reach = [0.94, 1.02, 0.98, 0.84];
  spread.forEach((sp, i) => {
    const base = onOrb(0.34, Math.PI * 0.0 + sp * 0.9, 1.6);
    const mid = onOrb(0.34 + 0.42 * reach[i], sp * 0.75, 1.35);
    const tip = onOrb(0.34 + 0.74 * reach[i], sp * 0.62, 1.2);
    const r0 = i === 3 ? 1.25 : 1.5;
    FINGERS.push([
      { a: [ARM.palm[0] - 3.5, ARM.palm[1] + 0.4, ARM.palm[2] + sp * 9], b: base, ra: r0 + 0.2, rb: r0 },
      { a: base, b: mid, ra: r0, rb: r0 * 0.86 },
      { a: mid, b: tip, ra: r0 * 0.86, rb: r0 * 0.66 },
    ]);
  });
  // the thumb, up the near side of the orb
  const t0: V = [ARM.palm[0] + 3, ARM.palm[1] + 0.5, ARM.palm[2] + 6.5];
  const t1 = onOrb(0.72, 1.62, 1.7);
  const t2 = onOrb(0.98, 1.5, 1.4);
  FINGERS.push([
    { a: t0, b: t1, ra: 2.0, rb: 1.6 },
    { a: t1, b: t2, ra: 1.6, rb: 1.2 },
  ]);
}
export function armField(x: number, y: number, z: number) {
  let f = cap(x, y, z, ARM.shoulder, ARM.elbow, 8.2, 6.6);
  f = smin(f, cap(x, y, z, ARM.elbow, ARM.wrist, 6.4, 4.3), 3);
  // the palm: broad and flat, cupped
  const px = x - ARM.palm[0];
  const py = y - ARM.palm[1];
  const pz = z - ARM.palm[2];
  const palm = ell(px, py + (px * px + pz * pz) * -0.008, pz, 8.4, 2.5, 7.4);
  f = smin(f, palm, 2.4);
  for (const fing of FINGERS) {
    let g = 1e9;
    for (const s of fing) g = smin(g, cap(x, y, z, s.a, s.b, s.ra, s.rb), 0.9);
    f = smin(f, g, 1.4);
  }
  return f;
}
export const ARM_BOX: Box = { min: [ORB.x - 22, ARM.elbow[1] - 10, -8], max: [ARM.shoulder[0] + 11, ORB.y - 4, 36] };

// ---------- the body: shoulders, breast, and the robe falling to the floor ----------
const B = (() => {
  const cx = HEAD.x;
  const cy = HEAD.y;
  return {
    sh: [[cx + 18, cy - 46, -24] as V, [cx + 18, cy - 46, 24] as V],
    neck: [[cx + 8, cy - 36, 0] as V, [cx + 14, cy - 52, 0] as V],
    breast: [cx + 20, cy - 80, 0] as V,
    robe: [[cx + 22, cy - 92, 0] as V, [cx + 52, -20, 6] as V],
    robe2: [[cx + 40, cy - 70, -10] as V, [cx + 92, -20, -24] as V],
    fold: [[cx - 6, cy - 110, 26] as V, [cx + 6, -20, 46] as V],
  };
})();
export function bodyField(x: number, y: number, z: number) {
  // the shoulders and the root of the neck
  let f = cap(x, y, z, B.sh[0], B.sh[1], 11, 11);
  f = smin(f, cap(x, y, z, B.neck[0], B.neck[1], 9, 12), 6);
  // breast and back, leaning a little toward the orb
  f = smin(f, ell(x - B.breast[0], y - B.breast[1], z, 25, 40, 30), 12);
  // the robe: it widens as it falls and goes into the floor
  f = smin(f, cap(x, y, z, B.robe[0], B.robe[1], 30, 62), 18);
  f = smin(f, cap(x, y, z, B.robe2[0], B.robe2[1], 22, 46), 16);
  // a deep fold or two down the front of the robe
  f = smax(f, -cap(x, y, z, B.fold[0], B.fold[1], 6, 12), 6);
  return f;
}
export const BODY_BOX: Box = { min: [HEAD.x - 30, -24, -78], max: [HEAD.x + 160, HEAD.y - 30, 82] };

// The three skins, made a few milliseconds at a time.
export type Figure = { head: THREE.BufferGeometry; arm: THREE.BufferGeometry; body: THREE.BufferGeometry };
export function* figureSteps(mobile: boolean, budget: number): Generator<void, Figure, void> {
  const hv = mobile ? 0.9 : 0.55;
  const head = yield* surfaceSteps(headField(hv), HEAD_BOX, hv, budget);
  const arm = yield* surfaceSteps(armField, ARM_BOX, mobile ? 1.0 : 0.62, budget);
  const body = yield* surfaceSteps(bodyField, BODY_BOX, mobile ? 3.2 : 2.2, budget);
  return { head, arm, body };
}
