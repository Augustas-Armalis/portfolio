import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise2, ridge2, type V3 } from "../kit";
import { loft, type Crown, type Pt } from "./shared";

// The mountain of the Fairy Tale: a cone wound round by one wall that climbs it
// in a spiral, turn above turn. Between the turns the slope is steep and thick
// with small round trees; a pale road winds up it behind the wall; and where the
// wall ends the rock goes on up in peaks, with the castle among them.
//
// Everything is measured from the mountain's own foot (x, z) and the ground there (y = 0).
export const MT = { x: 0, z: -240, th0: Math.PI / 2 + 0.62, turns: 2.3, rho0: 320, dRho: 85, rim0: 80, dRim: 132, wall: 55, batter: 6, core: 72, coreY: 452 };
const TAU = Math.PI * 2;
export const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// u counts turns up the spiral. Seen from the way in (from +z) the wall rises across the front from left to right.
export const thOf = (u: number) => MT.th0 - u * TAU;
// above the wall's end the spiral closes into a level ring round the foot of the peaks
const closing = (u: number) => sm(MT.turns, MT.turns + 0.5, u);
export const rhoOf = (u: number) => (MT.rho0 - MT.dRho * u) * (1 - closing(u)) + MT.core * closing(u);
export const rimOf = (u: number) => (MT.rim0 + MT.dRim * u) * (1 - closing(u)) + MT.coreY * closing(u);
// the wall grows out of the hillside where the road begins, and sinks back into the rock under the castle
export const wallOf = (u: number) => MT.wall * sm(0, 0.32, u) * (1 - sm(MT.turns - 0.4, MT.turns - 0.04, u));
export const footOf = (u: number) => rimOf(u) - wallOf(u);
const kOf = (u: number) => wallOf(u) / MT.wall;
// the slope the lowest turn stands on: the same fall as the terrace above it, so the two are one surface where they meet
const SKIRT = (footOf(1) - rimOf(0)) / (rhoOf(0) - rhoOf(1) - MT.batter);
// the road: how far across the terrace it runs (0 at the parapet, 1 at the foot of the wall above)
export const ROAD = { u0: 0.05, u1: 2.005, half: 4.4 };
export const roadT = (u: number) => 0.5 + 0.27 * Math.sin(u * TAU * 3 + 0.9) * (1 - sm(ROAD.u1 - 0.25, ROAD.u1, u)) + 0.08 * sm(ROAD.u1 - 0.25, ROAD.u1, u);
const at = (u: number, r: number, y: number) => new THREE.Vector3(Math.cos(thOf(u)) * r, y, Math.sin(thOf(u)) * r);
// the terrace of turn u: its outer edge behind the parapet, its inner edge at the foot of the wall a turn above
const terraceEnds = (u: number) => {
  const k = kOf(u);
  return { r0: rhoOf(u) - 3 * k, y0: rimOf(u) - 3.2 * k, r1: rhoOf(u + 1) + MT.batter * kOf(u + 1), y1: footOf(u + 1) };
};
export const terraceAt = (u: number, t: number) => {
  const e = terraceEnds(u);
  return at(u, e.r0 + (e.r1 - e.r0) * t, e.y0 + (e.y1 - e.y0) * t);
};

const FLOOR: V3 = [0.035, 0.075, 0.04];
const VERGE: V3 = [0.11, 0.17, 0.055];
const WAY: V3 = [0.8, 0.72, 0.56];
const STONE_HI: V3 = [0.2, 0.125, 0.3];
const STONE_LO: V3 = [0.055, 0.045, 0.17];
const COPING: V3 = [0.6, 0.36, 0.33];

export function buildMountain(mobile: boolean, ground: (x: number, z: number) => number) {
  const per = mobile ? 110 : 200;
  const T = MT.turns;
  const soil: THREE.BufferGeometry[] = [];
  // ---- the terraces, the road cut into them
  {
    const n = Math.round(per * (T + 0.5));
    const rings: Pt[][] = [];
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * (T + 0.5);
      const e = terraceEnds(u);
      const width = Math.max(1, Math.hypot(e.r1 - e.r0, e.y1 - e.y0));
      const on = sm(ROAD.u0, ROAD.u0 + 0.05, u) * (1 - sm(ROAD.u1 - 0.01, ROAD.u1 + 0.02, u));
      const tr = roadT(u);
      const hw = Math.min(0.12, ROAD.half / width);
      const soft = Math.min(0.05, 1.4 / width);
      const ts: number[] = [];
      for (let j = 0; j < 5; j++) ts.push(((tr - hw - soft) * j) / 4);
      ts.push(tr - hw, tr + hw);
      for (let j = 0; j < 5; j++) ts.push(tr + hw + soft + ((1 - tr - hw - soft) * j) / 4);
      rings.push(
        ts.map((t, j) => {
          const road = j === 5 || j === 6;
          const patchy = noise2(u * 37 + t * 3, t * 9 + u * 5);
          const green = mix3(VERGE, FLOOR, sm(0, 0.25, t) * 0.8 + patchy * 0.2);
          return { p: at(u, e.r0 + (e.r1 - e.r0) * t, e.y0 + (e.y1 - e.y0) * t), c: road ? mix3(green, WAY, on) : green };
        }),
      );
    }
    soil.push(loft(rings));
  }
  // ---- the parapet: a low wall along the rim, a coping on it
  {
    const n = Math.round(per * T);
    const rings: Pt[][] = [];
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * T;
      const k = kOf(u);
      const ro = rhoOf(u);
      const rim = rimOf(u);
      rings.push([
        { p: at(u, ro - 3 * k, rim - 3.2 * k), c: mix3(STONE_LO, COPING, 0.35) },
        { p: at(u, ro - 3 * k, rim), c: COPING },
        { p: at(u, ro - 1.5 * k, rim + 0.7 * k), c: mix3(COPING, [0.95, 0.66, 0.5], 0.6) },
        { p: at(u, ro + 0.4 * k, rim), c: COPING },
      ]);
    }
    soil.push(loft(rings));
  }
  // ---- the slope the lowest turn stands on, running out under the wood of the plain
  {
    const n = Math.round(per);
    const rings: Pt[][] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const r0 = rhoOf(u) + MT.batter * kOf(u);
      const f = footOf(u);
      const th = thOf(u);
      const g = ground(Math.cos(th) * (r0 + f / SKIRT), Math.sin(th) * (r0 + f / SKIRT)) - 7;
      const ring: Pt[] = [];
      for (let j = 0; j <= 7; j++) {
        const y = f + (g - f) * (j / 7);
        ring.push({ p: at(u, r0 + (f - y) / SKIRT, y), c: mix3(FLOOR, VERGE, 0.25 + 0.3 * noise2(u * 41, j * 1.7)) });
      }
      rings.push(ring);
    }
    soil.push(loft(rings));
  }
  // ---- the wall itself, dressed and arcaded (see makeMasonry)
  let wall: THREE.BufferGeometry;
  {
    const n = Math.round(per * T);
    const rings: Pt[][] = [];
    let run = 0;
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * T;
      const k = kOf(u);
      const top = at(u, rhoOf(u) + 0.4 * k, rimOf(u));
      if (prev) run += top.distanceTo(prev);
      prev = top;
      const h = Math.max(0.01, wallOf(u));
      rings.push([
        { p: top, c: STONE_HI, u: run, v: 1, h },
        { p: at(u, rhoOf(u) + MT.batter * k, footOf(u)), c: STONE_LO, u: run, v: 0, h },
      ]);
    }
    wall = loft(rings, true);
  }
  const flat = soil.map((g) => {
    const q = g.toNonIndexed();
    g.dispose();
    return q;
  });
  const ground3 = mergeGeometries(flat)!;
  flat.forEach((g) => g.dispose());
  ground3.computeBoundingSphere();
  wall.computeBoundingSphere();
  return { soil: ground3, wall };
}

// The way up from the plain: a ramp climbing across the lowest slope to where the road begins behind the wall.
export const RAMP = { u0: -0.1, u1: 0.09 };
const sideAt = (u: number, y: number) => {
  if (u < 0) {
    const v = u + 1;
    return at(u, rhoOf(v) + MT.batter * kOf(v) + (footOf(v) - y) / SKIRT, y);
  }
  const e = terraceEnds(u);
  return at(u, e.r0 + ((e.r1 - e.r0) * (y - e.y0)) / (e.y1 - e.y0), y);
};
export function rampLine(n = 64) {
  const end = terraceAt(RAMP.u1, roadT(RAMP.u1));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    pts.push(sideAt(RAMP.u0 + (RAMP.u1 - RAMP.u0) * s, -4 + (end.y + 4) * s));
  }
  return pts;
}
export function buildRamp() {
  const end = terraceAt(RAMP.u1, roadT(RAMP.u1));
  const rings: Pt[][] = [];
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const u = RAMP.u0 + (RAMP.u1 - RAMP.u0) * s;
    const y = -4 + (end.y + 4) * s;
    const out = new THREE.Vector3(Math.cos(thOf(u)) * 0.7, 0.7, Math.sin(thOf(u)) * 0.7);
    rings.push([-3.4, -2.2, 2.2, 3.4].map((dy, j) => ({ p: sideAt(u, y + dy).add(out), c: j === 0 || j === 3 ? mix3(WAY, VERGE, 0.6) : WAY })));
  }
  const g = loft(rings);
  g.computeBoundingSphere();
  return g;
}

// The road as a line of evenly spaced points, for whatever walks it.
export function roadLine(step = 6) {
  const pts: THREE.Vector3[] = rampLine(56);
  let u = RAMP.u1 + 0.004;
  while (u < ROAD.u1) {
    pts.push(terraceAt(u, roadT(u)));
    u += step / (TAU * Math.max(60, rhoOf(u)));
  }
  return pts;
}

// The mountain's wood: small round crowns on every terrace and down the lowest slope, none on the road.
export function mountainCrowns(n: number, r: () => number, ground: (x: number, z: number) => number, skip: (p: THREE.Vector3) => boolean) {
  const out: Crown[] = [];
  const T = MT.turns;
  let guard = 0;
  while (out.length < n && guard++ < n * 6) {
    const onSkirt = r() < 0.3;
    let p: THREE.Vector3;
    let size: number;
    if (onSkirt) {
      const u = r();
      const r0 = rhoOf(u) + MT.batter * kOf(u);
      const f = footOf(u);
      const th = thOf(u);
      const g = ground(Math.cos(th) * (r0 + f / SKIRT), Math.sin(th) * (r0 + f / SKIRT));
      const v = Math.pow(r(), 0.8);
      const y = f + (g - f) * v;
      if (f - y < 4) continue;
      p = at(u, r0 + (f - y) / SKIRT, y);
      size = 6.5 + r() * 4.5;
    } else {
      // (more of them where the turns are wide)
      const u = (T + 0.42) * (1 - Math.sqrt(r()) * 0.999);
      const e = terraceEnds(u);
      const width = Math.hypot(e.r1 - e.r0, e.y1 - e.y0);
      if (width < 14) continue;
      // (clear of the parapet below and of the wall above)
      const t = 0.1 + r() * 0.8;
      const dRoad = Math.abs(t - roadT(u)) * width;
      if (u > ROAD.u0 && u < ROAD.u1 && dRoad < ROAD.half + 5) continue;
      p = terraceAt(u, t);
      size = (5.2 + r() * 4.4) * (1 - 0.22 * sm(1.2, 2.6, u));
    }
    if (skip(p)) continue;
    out.push({ p: [p.x, p.y - size * 0.12, p.z], r: size, h: 0.95 + r() * 0.5, seed: r() });
  }
  return out;
}

// A peak of rock: rings climbing to a point, ribbed and gullied, a little different on every side, painted
// violet in its feet and rose where the height takes the light.
export function rockPeak(o: { x: number; z: number; y0: number; y1: number; R: number; seed: number; pow?: number; lean?: [number, number]; lo?: V3; hi?: V3; nA?: number; nH?: number }) {
  const nA = o.nA ?? 56;
  const nH = o.nH ?? 34;
  const lo = o.lo ?? [0.1, 0.06, 0.16];
  const mid: V3 = o.lo ? mix3(o.lo, o.hi ?? o.lo, 0.5) : [0.3, 0.15, 0.27];
  const hi = o.hi ?? [0.8, 0.44, 0.38];
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const H = o.y1 - o.y0;
  for (let j = 0; j <= nH; j++) {
    const k = j / nH;
    const y = o.y0 + H * k;
    const cx = o.x + (o.lean?.[0] ?? 0) * k * k + Math.sin(k * 6 + o.seed) * o.R * 0.04 * k;
    const cz = o.z + (o.lean?.[1] ?? 0) * k * k + Math.cos(k * 5 + o.seed) * o.R * 0.04 * k;
    const rr = o.R * Math.pow(1 - k, o.pow ?? 1.12);
    for (let i = 0; i <= nA; i++) {
      const a = (i / nA) * TAU;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // ribs that run down the peak, and beds that run across it
      const rib = ridge2(ca * 1.9 + o.seed, sa * 1.9 + k * 1.1 - o.seed, 4);
      const fine = ridge2(ca * 5.3 - o.seed, sa * 5.3 + k * 3.1 + o.seed, 3);
      const bed = noise2(k * 22 + o.seed, a * 0.8);
      // (cliffs: the beds step in and out as they climb)
      const step = Math.pow(Math.abs(Math.sin(k * 19 + bed * 2.5 + o.seed)), 6) * 0.07;
      const cut = 1 + 0.52 * (rib - 0.42) + 0.16 * (fine - 0.4) + 0.1 * (bed - 0.5) + step;
      const r = rr * cut * (j === nH ? 0.02 : 1);
      pos.push(cx + ca * r, y, cz + sa * r);
      const t = Math.min(1, Math.max(0, k * 1.05 + (rib - 0.4) * 0.5 + (fine - 0.4) * 0.2));
      const c = t < 0.5 ? mix3(lo, mid, t / 0.5) : mix3(mid, hi, (t - 0.5) / 0.5);
      // beds of paler and darker stone lying across it, and its gullies dark
      const band = 0.72 + 0.5 * noise2(k * 34 + o.seed * 3 + bed * 1.5, a * 0.35) + 0.25 * (rib - 0.4);
      col.push(c[0] * band, c[1] * band, c[2] * band, 0);
    }
  }
  const row = nA + 1;
  for (let j = 0; j < nH; j++)
    for (let i = 0; i < nA; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// how far out the rock of such a peak reaches at a height (without its ribs)
export const peakRadius = (o: { y0: number; y1: number; R: number; pow?: number }, y: number) => (y >= o.y1 ? 0 : o.R * Math.pow(1 - Math.max(0, (y - o.y0) / (o.y1 - o.y0)), o.pow ?? 1.12));

// the peaks about the castle: the great one it climbs, a tall slim one to its right, lesser ones left and behind
export const PEAKS = [
  // (each stands well down in the slope under it, so none shows its foot)
  { x: 4, z: -10, y0: 380, y1: 724, R: 114, seed: 2.1, pow: 1.4 },
  { x: 106, z: 16, y0: 318, y1: 640, R: 66, seed: 5.3, pow: 1.3, lean: [-8, -4] as [number, number] },
  { x: -100, z: -6, y0: 330, y1: 582, R: 58, seed: 8.7, pow: 1.28, lean: [6, 0] as [number, number] },
  { x: -18, z: -94, y0: 340, y1: 612, R: 66, seed: 11.9, pow: 1.3 },
  { x: 58, z: -80, y0: 345, y1: 562, R: 50, seed: 14.2, pow: 1.25 },
];
// the castle's three wards: drums of stone standing out of the front of the great peak (worlds/fairy/castle.ts)
export const WARDS = [
  { x: 0, z: 96, R: 76, y: 436, body: 100 },
  { x: 0, z: 64, R: 55, y: 498, body: 74 },
  { x: 2, z: 38, R: 37, y: 558, body: 66 },
];
export function buildPeaks(mobile: boolean) {
  const parts = PEAKS.map((p, i) => rockPeak({ ...p, nA: mobile ? 36 : i === 0 ? 72 : 48, nH: mobile ? 22 : i === 0 ? 44 : 30 }));
  // crags breaking out of the wood on the terraces and down the lowest slope
  const q = (i: number) => {
    const x = Math.sin(i * 127.1 + 3.3) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < (mobile ? 16 : 44); i++) {
    const u = 0.1 + q(i) * (MT.turns + 0.1);
    const t = 0.3 + q(i + 50) * 0.62;
    if (Math.abs(t - roadT(u)) < 0.16) continue;
    const p = terraceAt(u, t);
    if (WARDS.some((w) => Math.hypot(p.x - w.x, p.z - w.z) < w.R + 26)) continue;
    const R = 7 + q(i + 100) * 13;
    const H = R * (1.6 + q(i + 150) * 2.2);
    parts.push(rockPeak({ x: p.x, z: p.z, y0: p.y - R * 0.9, y1: p.y + H, R, seed: i * 1.7, pow: 0.9 + q(i + 200) * 0.5, lean: [(q(i + 250) - 0.5) * R, (q(i + 300) - 0.5) * R], lo: [0.08, 0.06, 0.13], hi: [0.6, 0.36, 0.34], nA: 14, nH: 9 }));
  }
  // the rock the peaks stand on, closing the top of the spiral
  const cap = new THREE.CylinderGeometry(MT.core * 0.72, MT.core + 3, 34, 40, 2);
  cap.translate(0, MT.coreY - 2, 0);
  const pc = new Float32Array(cap.attributes.position.count * 4);
  for (let i = 0; i < cap.attributes.position.count; i++) pc.set([0.2, 0.12, 0.22, 0], i * 4);
  cap.setAttribute("aCol", new THREE.BufferAttribute(pc, 4));
  cap.deleteAttribute("uv");
  const all = [...parts, cap].map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    if (q !== g) g.dispose();
    q.deleteAttribute("uv");
    return q;
  });
  const g = mergeGeometries(all)!;
  all.forEach((x) => x.dispose());
  g.computeBoundingSphere();
  return g;
}
