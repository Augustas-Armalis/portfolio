import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, noise2, ridge2 } from "../kit";
import { FUNERAL_U, GLSL_FUNERAL_AIR } from "./air";
import { ROAD_W, funeralLand } from "./land";

// The rock of the Funeral Symphony: the mountains (the world's own height field, carved: gullies down the great
// faces, a sheer cliff cut under each edge of the road), the road itself with its cliffs, and the cave the
// procession goes into. All drawn in deep ultramarine pastel, every crest and silhouette edged in the painting's
// green-blue light, the rock by the road warmed by the gold the procession carries.

const HALF = ROAD_W / 2;
const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// how tall the cliff under the road's edge is, by where along the road
export function cliffD(i: number) {
  return 34 + 30 * noise2(i * 0.013, 3.7) + 16 * noise2(i * 0.05, 9.1);
}
const cliffDrop = (e: number, D: number) => Math.min(D * 1.08, 8 * e) + Math.max(0, e - (D * 1.08) / 8) * 0.85;
// gullies carved down the faces: never on the road, deepest on the great walls
const carveAt = (x: number, z: number, h: number, roadDist: number, fine = 1) => {
  const A = Math.min(110, 6 + Math.max(0, h) * 0.15) * Math.min(1, Math.max(0, (roadDist - 34) / 90));
  if (A <= 0) return 0;
  const wx = x * 0.0038 + noise2(x * 0.0013, z * 0.0013) * 1.8;
  const wz = z * 0.0038 + noise2(z * 0.0013 + 5, x * 0.0013) * 1.8;
  // great buttresses and the gullies between them, and smaller ribs on those
  const r = ridge2(wx, wz, 4);
  const r2 = fine > 0 ? ridge2(wx * 3.7 + 9, wz * 3.7 + 2, 3) : 0;
  return A * (Math.pow(1 - Math.min(1, r * 1.25), 1.5) + 0.22 * fine * Math.pow(1 - Math.min(1, r2 * 1.3), 1.3));
};

// the road's samples, bucketed, to find the nearest from anywhere
function roadIndex() {
  const L = funeralLand();
  const CELL = 80;
  const map = new Map<number, number[]>();
  const key = (cx: number, cz: number) => (cx + 512) * 4096 + (cz + 512);
  for (let i = 0; i < L.N; i++) {
    const k = key(Math.floor(L.pts[i].x / CELL), Math.floor(L.pts[i].z / CELL));
    let a = map.get(k);
    if (!a) map.set(k, (a = []));
    a.push(i);
  }
  const out = { i: -1, d: 1e9, v: 0 };
  return (x: number, z: number) => {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let best = -1;
    let bd = 170 * 170;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++) {
        const list = map.get(key(cx + a, cz + b));
        if (!list) continue;
        for (const i of list) {
          const d = (L.pts[i].x - x) ** 2 + (L.pts[i].z - z) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
    out.i = best;
    if (best < 0) {
      out.d = 1e9;
      return out;
    }
    const dx = x - L.pts[best].x;
    const dz = z - L.pts[best].z;
    // signed: + to the right of the way they walk
    out.v = -L.tan[best][1] * dx + L.tan[best][0] * dz;
    const al = L.tan[best][0] * dx + L.tan[best][1] * dz;
    out.d = best === 0 || best === L.N - 1 ? Math.sqrt(bd) : Math.abs(out.v) + Math.max(0, Math.abs(al) - 2.5);
    return out;
  };
}

// the mouth of the cave: half its width at a height above the road
export const CAVE = { half: 21, wall: 20, top: 47 };
// the opening at the cave's far end, in metres from the road's floor (it is the gate's window: see worlds/portal.tsx OPENING)
export const PORTAL = { half: 15, foot: -0.5, spring: 11, top: 37.8, rise: 28, reach: 9.5 };
const archHalf = (y: number) => (y <= CAVE.wall ? CAVE.half * (1 + 0.04 * Math.sin(y * 0.3)) : CAVE.half * Math.sqrt(Math.max(0, 1 - ((y - CAVE.wall) / (CAVE.top - CAVE.wall)) ** 2)));
// a point on its outline: a 0 (the left foot) .. 1 (the right foot), over the top
function archPoint(a: number): [number, number] {
  const wallLen = CAVE.wall;
  const arcLen = (Math.PI * (CAVE.half + (CAVE.top - CAVE.wall))) / 2;
  const total = wallLen * 2 + arcLen;
  const s = a * total;
  if (s < wallLen) return [-archHalf(s), s];
  if (s > total - wallLen) return [archHalf(total - s), total - s];
  const t = ((s - wallLen) / arcLen) * Math.PI;
  return [-CAVE.half * Math.cos(t), CAVE.wall + (CAVE.top - CAVE.wall) * Math.sin(t)];
}

// (made in steps: the mountains' grid a few rows at a time, then the road, then the caves; so it can be made a
// little a frame under the closed cloud instead of in one long frame. prepareFuneralRock hands out the stepper.)
function* rockSteps(mobile: boolean, budget: number) {
  let t0 = performance.now();
  const L = funeralLand();
  const near = roadIndex();
  const mouth = L.pts[L.iMouth];
  const mt = L.tan[L.iMouth];
  const omouth = L.pts[L.iOut];
  const ot = L.tan[L.iOut];

  // ---------- the mountains ----------
  const SEG = mobile ? 230 : 340;
  const INNER = 1000;
  const OUTER = 2750;
  const warp = (u: number) => {
    const a = Math.abs(u);
    const k = 0.74;
    if (a < k) return Math.sign(u) * (a / k) * INNER;
    // beyond the middle the cells grow, from the size they were
    const t = (a - k) / (1 - k);
    const c0 = (INNER / k) * (1 - k);
    return Math.sign(u) * (INNER + c0 * t + (OUTER - INNER - c0) * t * t);
  };
  const NV = SEG + 1;
  const pos = new Float32Array(NV * NV * 3);
  const attr = new Float32Array(NV * NV * 3); // crest light, the procession's gold, (spare)
  const CZ = 60;
  for (let j = 0; j < NV; j++) {
    if ((j & 3) === 0 && performance.now() - t0 > budget) {
      yield;
      t0 = performance.now();
    }
    for (let i = 0; i < NV; i++) {
      const x = warp((i / SEG) * 2 - 1);
      const z = warp((j / SEG) * 2 - 1) + CZ;
      let h = L.ground(x, z);
      const q = near(x, z);
      let gold = 0;
      if (q.i >= 0) {
        const ri = q.i;
        const ry = L.y[ri];
        const e = q.d - HALF;
        const side = q.v > 0 ? 1 : 0;
        const c = L.crest[ri * 2 + side];
        const beyond = mt[0] * (x - mouth.x) + mt[1] * (z - mouth.z);
        // (and the same over the cave the road comes out of, at its southern end)
        const before = -(ot[0] * (x - omouth.x) + ot[1] * (z - omouth.z));
        if ((ri >= L.iMouth - 1 && beyond > 0) || (ri <= L.iOut + 1 && before > 0)) {
          // over the cave: the mountain as it would be had no notch been cut, but for the slot the tunnel lies in
          if (q.d < 41) h = Math.min(h, ry - 3);
          else h = L.baseAt(x, z) - carveAt(x, z, L.baseAt(x, z), q.d + 60);
        } else {
          if (e < -3) h = Math.min(h, ry - 2.5);
          else {
            const target = ry - 2.5 + (1 - c) * Math.max(0, e - 0.5) * 2.5 - c * cliffDrop(e + 3, cliffD(ri));
            // (the cliff and the scree under it are drawn over this, finer than this grid could: it lies a little under them)
            h = Math.min(h, target) - 3.2 * c * (1 - Math.min(1, Math.max(0, (e - 60) / 26)));
          }
          h -= carveAt(x, z, h, q.d);
          gold = Math.exp(-Math.max(e, 0) / 26) * (ri < L.iMouth ? 1 : 0) * Math.min(1, Math.max(0, (ri - L.iOut) / 20));
        }
      } else h -= carveAt(x, z, h, 1e6, Math.min(1, Math.max(0, (1250 - Math.max(Math.abs(x), Math.abs(z - CZ))) / 250)));
      const o = (j * NV + i) * 3;
      pos[o] = x;
      pos[o + 1] = h;
      pos[o + 2] = z;
      attr[o + 1] = gold;
      // (no line of light along the cut under the road's edge: the road's own cliff is drawn over it)
      attr[o + 2] = q.i >= 0 ? Math.min(1, Math.max(0, (150 - q.d) / 50)) : 0;
    }
  }
  yield;
  // how much each point stands proud of its neighbours (a crest) or lies under them (a gully)
  for (let j = 1; j < SEG; j++)
    for (let i = 1; i < SEG; i++) {
      const o = (j * NV + i) * 3;
      const dx = 0.5 * (pos[o + 3] - pos[o - 3]);
      const dz = 0.5 * (pos[o + NV * 3 + 2] - pos[o - NV * 3 + 2]);
      const lap = (pos[o + 4] + pos[o - 2] - 2 * pos[o + 1]) / (dx * dx) + (pos[o + NV * 3 + 1] + pos[o - NV * 3 + 1] - 2 * pos[o + 1]) / (dz * dz);
      attr[o] = Math.max(-1, Math.min(1, -lap * 14)) * (1 - attr[o + 2]);
      attr[o + 2] = 0;
    }
  // (softened, so the line of light follows the form and not the grid)
  {
    const tmp = new Float32Array(NV * NV);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 1; j < SEG; j++)
        for (let i = 1; i < SEG; i++) {
          const o = (j * NV + i) * 3;
          tmp[j * NV + i] = (attr[o] * 4 + (attr[o - 3] + attr[o + 3] + attr[o - NV * 3] + attr[o + NV * 3]) * 2 + attr[o - NV * 3 - 3] + attr[o - NV * 3 + 3] + attr[o + NV * 3 - 3] + attr[o + NV * 3 + 3]) / 16;
        }
      for (let j = 1; j < SEG; j++) for (let i = 1; i < SEG; i++) attr[(j * NV + i) * 3] = tmp[j * NV + i];
    }
  }
  const idx = new Uint32Array(SEG * SEG * 6);
  let n = 0;
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < SEG; i++) {
      const a = j * NV + i;
      const b = a + NV;
      idx[n++] = a;
      idx[n++] = b;
      idx[n++] = a + 1;
      idx[n++] = b;
      idx[n++] = b + 1;
      idx[n++] = a + 1;
    }
  const land = new THREE.BufferGeometry();
  land.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  land.setAttribute("aK", new THREE.BufferAttribute(attr, 3));
  land.setIndex(new THREE.BufferAttribute(idx, 1));
  land.computeVertexNormals();
  land.computeBoundingSphere();

  yield;
  // ---------- the road and its cliffs ----------
  // across: the road (5), then down each side the cliff under its edge
  const SK: [number, number][] = [
    [0, 0],
    [1.3, -0.5],
    [2.1, -4.5],
    [3.0, -0.22],
    [4.4, -0.5],
    [6.3, -0.8],
    [8.4, -1.05],
    // the scree below it, lying on the mountain's own flank, and going under it at last
    [8.4, 0],
    [13, 0],
    [20, 0],
    [30, 0],
    [42, 0],
    [54, 0],
    [64, 0],
  ];
  const CLIFF = 7;
  const lp: number[] = [];
  const lk: number[] = [];
  const li: number[] = [];
  const ROADC = [-1, -0.5, 0, 0.5, 1];
  const PER = ROADC.length + SK.length * 2;
  const iLast = L.iEnd;
  for (let i = 0; i <= iLast; i++) {
    const p = L.pts[i];
    const nx = -L.tan[i][1];
    const nz = L.tan[i][0];
    const y = L.y[i];
    for (const u of ROADC) {
      lp.push(p.x + nx * u * HALF, y, p.z + nz * u * HALF);
      lk.push(0, u, 0, i * L.STEP);
    }
    for (const side of [-1, 1]) {
      const inCave = i >= L.iMouth - 2 || i <= L.iOut + 2;
      const c = inCave ? 0 : L.crest[i * 2 + (side > 0 ? 1 : 0)];
      const D = cliffD(i);
      SK.forEach(([e, d], k) => {
        if (k === CLIFF) {
          // (the foot of the cliff again, as the head of the scree)
          const o = lp.length - 3;
          lp.push(lp[o], lp[o + 1], lp[o + 2]);
          if (i >= L.iMouth - 3) lk.push(3, Math.max(0, (i - L.iMouth) / (iLast - L.iMouth)), 0.02, 0);
          else if (i <= L.iOut + 3) lk.push(3, Math.max(0, (L.iOut - i) / L.iOut), 0.02, 1);
          else lk.push(5, side, 1, i * L.STEP);
          return;
        }
        if (k > CLIFF) {
          const x = p.x + nx * side * (HALF + e);
          const z = p.z + nz * side * (HALF + e);
          const g = L.ground(x, z);
          const last = k === SK.length - 1;
          const yy = i >= L.iMouth - 3 || i <= L.iOut + 3 ? y - 0.45 - Math.max(0, e - 13) * 0.6 : c < 0.03 ? g - 4 : Math.min(y - c * (D * 1.05 + (e - 8.4) * 0.78), g + 0.7) - (last ? 7 : 0);
          lp.push(x, yy, z);
          // (inside a cave the ground by the road is the cave's own floor)
          if (i >= L.iMouth - 3) lk.push(3, Math.max(0, (i - L.iMouth) / (iLast - L.iMouth)), 0.02, 0);
          else if (i <= L.iOut + 3) lk.push(3, Math.max(0, (L.iOut - i) / L.iOut), 0.02, 1);
          else lk.push(5, side, 1, i * L.STEP);
          return;
        }
        const drop = k < 3 ? d : d * D;
        // the face is not a wall but rock: it stands out and in along its length, fluted down its height
        // (and stands in upright ribs, like the pipes of an organ, each a few metres across)
        const pipe = (noise2(i * 1.9 + side * 31, 0.5) - 0.5) * 3.4 + (noise2(i * 0.83 + side * 11, 4.5) - 0.5) * 2.2;
        const rough = k < 2 ? 0 : (noise2(i * 0.16 + side * 7, k * 0.9) - 0.5) * 3.2 + pipe * Math.min(1, (k - 1) * 0.4);
        // (where the land does not fall away there is no cliff: it is folded in under the road)
        const out = c < 0.03 ? HALF - 0.6 : HALF + (e + rough) * (0.25 + 0.75 * c);
        lp.push(p.x + nx * side * out, y + drop * c - (c < 0.03 ? 0.5 : 0), p.z + nz * side * out);
        if (i >= L.iMouth - 3) lk.push(3, Math.max(0, (i - L.iMouth) / (iLast - L.iMouth)), 0.02, 0);
        else if (i <= L.iOut + 3) lk.push(3, Math.max(0, (L.iOut - i) / L.iOut), 0.02, 1);
        else lk.push(1, side, Math.min(1, -drop / (D * 1.05) + (1 - Math.min(1, c * 3))), i * L.STEP);
      });
    }
    if (i < iLast) {
      const a = i * PER;
      const b = a + PER;
      for (let k = 0; k < ROADC.length - 1; k++) li.push(a + k, b + k, a + k + 1, b + k, b + k + 1, a + k + 1);
      for (let s = 0; s < 2; s++) {
        const o = ROADC.length + s * SK.length;
        for (let k = 0; k < SK.length - 1; k++) {
          if (s === 0) li.push(a + o + k, a + o + k + 1, b + o + k, b + o + k, a + o + k + 1, b + o + k + 1);
          else li.push(a + o + k, b + o + k, a + o + k + 1, b + o + k, b + o + k + 1, a + o + k + 1);
        }
      }
    }
  }
  const ledge = new THREE.BufferGeometry();
  ledge.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
  ledge.setAttribute("aK", new THREE.Float32BufferAttribute(lk, 4));
  ledge.setIndex(li);
  ledge.computeVertexNormals();
  ledge.computeBoundingSphere();

  yield;
  // ---------- the caves ----------
  // Two of them, built the same way: the one in the north wall that the procession goes into (lit from within), and
  // the one in the southern mountain that it, and the plane, come out of (dark, the night's blue at its mouth).
  // (everything is laid out on the road's own frame at the mouth: u across, y up, w along the way in)
  const cp: number[] = [];
  const ck: number[] = [];
  const ci: number[] = [];
  // iM: the road's sample at the mouth. sg: which way along the road is into the rock. iFar: where the vault ends.
  const tunnel = (iM: number, sg: 1 | -1, iFar: number, dark: boolean) => {
  const mouth = L.pts[iM];
  const mt: [number, number] = [L.tan[iM][0] * sg, L.tan[iM][1] * sg];
  const flag = dark ? 1 : 0;
  const mx = -mt[1];
  const mz = mt[0];
  const my = L.y[iM];
  const put = (u: number, y: number, w: number, kind: number, a: number, b: number) => {
    cp.push(mouth.x + mx * u + mt[0] * w, my + y, mouth.z + mz * u + mt[1] * w);
    ck.push(kind, a, b, flag);
  };
  // the face of the mountain round the mouth: rings from the arch out to the rock on either side and above
  {
    const NA = 72;
    const NR = 18;
    const base = cp.length / 3;
    const WIDE = 150;
    for (let a = 0; a <= NA; a++) {
      const t = a / NA;
      const [au, ay] = archPoint(t);
      // where this spoke ends: round the outside of the face, from the left foot up and over to the right
      const ang = Math.PI * (1 - t);
      const ou = Math.cos(ang) * WIDE * 1.05;
      const topY = L.baseAt(mouth.x + mx * ou * 0.8, mouth.z + mz * ou * 0.8) - my + 14;
      const oy = -8 + Math.sin(ang) * Math.max(120, topY + 8);
      for (let r = 0; r <= NR; r++) {
        const k = Math.pow(r / NR, 1.35);
        const u = au + (ou - au) * k;
        const y = ay + (oy - ay) * k;
        // the rock stands proud round the mouth (a lip), leans back as it climbs, and is carved all over
        const lip = Math.exp(-k * 9) * 5;
        const lean = -Math.max(0, y) * 0.16;
        const carve = (ridge2(u * 0.02 + 3, y * 0.02 + 1, 4) - 0.4) * 13 * Math.min(1, k * 5) + (noise2(u * 0.11, y * 0.11) - 0.5) * 2.5 * Math.min(1, k * 8);
        put(u, y, -(lip + carve) - 2 - lean, 2, k, y / 160);
      }
    }
    for (let a = 0; a < NA; a++)
      for (let r = 0; r < NR; r++) {
        const p0 = base + a * (NR + 1) + r;
        const p1 = p0 + NR + 1;
        ci.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
      }
  }
  // the way in: a vault of rock following the road into the mountain, lit from far inside
  {
    const NA = 28;
    const base = cp.length / 3;
    const i0 = iM - 2 * sg;
    const rows = Math.abs(iFar - i0);
    for (let st = 0; st <= rows; st++) {
      const i = i0 + st * sg;
      const p = L.pts[i];
      const nx = -L.tan[i][1];
      const nz = L.tan[i][0];
      const deep = Math.max(0, ((i - iM) * sg) / Math.abs(iFar - iM));
      for (let a = 0; a <= NA; a++) {
        const [au, ay] = archPoint(a / NA);
        const rough = 1 + (noise2(a * 0.5, i * 0.21) - 0.5) * 0.16 + (noise2(a * 1.7 + 4, i * 0.6) - 0.5) * 0.05;
        const y = a === 0 || a === NA ? -1.5 : ay * rough;
        cp.push(p.x + nx * au * rough, L.y[i] + y, p.z + nz * au * rough);
        ck.push(3, deep, ay / CAVE.top, flag);
      }
    }
    for (let r = 0; r < rows; r++)
      for (let a = 0; a < NA; a++) {
        const p0 = base + r * (NA + 1) + a;
        const p1 = p0 + NA + 1;
        ci.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
      }
    // a collar of rock round the mouth, so the vault does not end in an edge
    {
      const c0 = cp.length / 3;
      for (const [di, sc] of [
        [0, 1.0],
        [0, 1.34],
        [5, 1.42],
      ] as const) {
        const i = i0 + di * sg;
        const p = L.pts[i];
        const nx = -L.tan[i][1];
        const nz = L.tan[i][0];
        for (let a = 0; a <= NA; a++) {
          const [au, ay] = archPoint(a / NA);
          const rough = sc === 1 ? 1 + (noise2(a * 0.5, i * 0.21) - 0.5) * 0.16 + (noise2(a * 1.7 + 4, i * 0.6) - 0.5) * 0.05 : 1 + (noise2(a * 0.31 + 2, sc * 9) - 0.5) * 0.12;
          const u = au * rough * (sc === 1 ? 1 : sc);
          const y = a === 0 || a === NA ? -1.5 : 16 + (ay - 16) * rough * (sc === 1 ? 1 : sc);
          cp.push(p.x + nx * u, L.y[i] + y, p.z + nz * u);
          ck.push(2, sc === 1 ? 0.03 : 0.3, ay / 160, flag);
        }
      }
      for (let rr = 0; rr < 2; rr++)
        for (let a = 0; a < NA; a++) {
          const p0 = c0 + rr * (NA + 1) + a;
          const p1 = p0 + NA + 1;
          ci.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
        }
    }
    // its far end
    const e0 = cp.length / 3;
    const p = L.pts[iFar];
    const nx = -L.tan[iFar][1];
    const nz = L.tan[iFar][0];
    const tx = L.tan[iFar][0] * sg;
    const tz = L.tan[iFar][1] * sg;
    if (dark) {
      // (where the road comes out of the rock: only dark)
      cp.push(p.x, L.y[iFar] + 18, p.z);
      ck.push(3, 1, 0, flag);
      for (let a = 0; a <= NA; a++) {
        const [au, ay] = archPoint(a / NA);
        cp.push(p.x + nx * au * 1.1, L.y[iFar] + ay * 1.1 - 2, p.z + nz * au * 1.1);
        ck.push(3, 1, 1, flag);
      }
      for (let a = 0; a < NA; a++) ci.push(e0, e0 + 1 + a, e0 + 2 + a);
      ci.push(e0, e0 + 1 + NA, e0 + 1);
    } else {
      // The portal at the cave's end: a wall of the cave's own rock closes the vault, and in it the opening (the
      // lancet the gate's window fills, worlds/portal.tsx), set back a little in a reveal of rock; behind it, if the
      // window is not drawn, the light itself.
      const PH = PORTAL.half * 1.04 * 0.985;
      const spring = PORTAL.spring;
      const top = PORTAL.top;
      const hole = (t: number): [number, number] => {
        // 0..1 round the opening: left foot, up the straight, over the head, down the right
        const side = PORTAL.foot;
        const straight = spring - side;
        const head = top - spring;
        const arc = (Math.PI * (PH + head)) / 2;
        const total = straight * 2 + arc;
        const s = t * total;
        if (s < straight) return [-PH, side + s];
        if (s > total - straight) return [PH, side + (total - s)];
        const q = ((s - straight) / arc) * Math.PI;
        return [-PH * Math.cos(q), spring + head * Math.sin(q)];
      };
      const base = cp.length / 3;
      const W0 = 0.6; // the wall's plane, just behind the window's
      const REV = 1.6; // how far back the opening is set
      for (let a = 0; a <= NA; a++) {
        const t = a / NA;
        const [ou, oy] = archPoint(t);
        const [hu, hy] = hole(t);
        // the outer edge meets the vault; then the face of the wall; then the opening's lip; then back into the reveal
        const rows: [number, number, number, number][] = [
          [ou * 1.0, a === 0 || a === NA ? -1.5 : oy * 1.0, W0, 1],
          [(ou + hu) * 0.5, (oy + hy) * 0.5, W0, 0.55],
          [hu * 1.05, hy + (hy > spring ? 0.7 : 0), W0, 0.12],
          [hu, hy, W0 + REV, 0],
        ];
        for (const [u, y, w, k] of rows) {
          cp.push(p.x + nx * u + tx * w, L.y[iFar] + y, p.z + nz * u + tz * w);
          ck.push(6, k, t, flag);
        }
      }
      for (let a = 0; a < NA; a++)
        for (let r = 0; r < 3; r++) {
          const p0 = base + a * 4 + r;
          const p1 = p0 + 4;
          ci.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
        }
      // the light behind it
      const pl = cp.length / 3;
      cp.push(p.x + tx * (W0 + REV + 4), L.y[iFar] + 16, p.z + tz * (W0 + REV + 4));
      ck.push(4, 1, 0, flag);
      for (let a = 0; a <= NA; a++) {
        const [hu, hy] = hole(a / NA);
        cp.push(p.x + nx * hu + tx * (W0 + REV + 4), L.y[iFar] + hy, p.z + nz * hu + tz * (W0 + REV + 4));
        ck.push(4, 1, 1, flag);
      }
      for (let a = 0; a < NA; a++) ci.push(pl, pl + 1 + a, pl + 2 + a);
      ci.push(pl, pl + 1 + NA, pl + 1);
    }
  }
  // the roof over the slot the tunnel lies in, seen only from above
  {
    const base = cp.length / 3;
    const COLS = 9;
    const i0 = iM - sg;
    const rows = Math.abs(iFar - i0);
    for (let st = 0; st <= rows; st++) {
      const i = i0 + st * sg;
      const p = L.pts[i];
      const nx = -L.tan[i][1];
      const nz = L.tan[i][0];
      for (let c = 0; c < COLS; c++) {
        const u = ((c / (COLS - 1)) * 2 - 1) * 44;
        const x = p.x + nx * u;
        const z = p.z + nz * u;
        const b = L.baseAt(x, z);
        cp.push(x, b - carveAt(x, z, b, 200) + 1.2 - Math.abs(u) * 0.05, z);
        ck.push(2, 1, 1, flag);
      }
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < COLS - 1; c++) {
        const p0 = base + r * COLS + c;
        const p1 = p0 + COLS;
        ci.push(p0, p1, p0 + 1, p1, p1 + 1, p0 + 1);
      }
  }
  };
  tunnel(L.iMouth, 1, iLast, false);
  tunnel(L.iOut, -1, 0, true);
  const cave = new THREE.BufferGeometry();
  cave.setAttribute("position", new THREE.Float32BufferAttribute(cp, 3));
  cave.setAttribute("aK", new THREE.Float32BufferAttribute(ck, 4));
  cave.setIndex(ci);
  cave.computeVertexNormals();
  cave.computeBoundingSphere();

  return { land, ledge, cave };
}
type Rock = ReturnType<typeof rockSteps> extends Generator<void, infer T, void> ? T : never;
let madeRock: { mobile: boolean; v: Rock } | null = null;
export function prepareFuneralRock(mobile: boolean, budget = 5) {
  if (madeRock && madeRock.mobile !== mobile) madeRock = null;
  const g = madeRock ? null : rockSteps(mobile, budget);
  return () => {
    if (!g || madeRock) return true;
    const r = g.next();
    if (r.done) madeRock = { mobile, v: r.value };
    return !!r.done;
  };
}
export function dropFuneralRock(v: unknown) {
  if (madeRock?.v === v) madeRock = null;
}
export function buildFuneralRock(mobile: boolean): Rock {
  if (madeRock && madeRock.mobile === mobile) return madeRock.v;
  const g = rockSteps(mobile, Infinity);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

// ---------- the paint ----------
const ROCK_GLSL = /* glsl */ `
  // deep ultramarine laid in pastel: two blues in broad soft drifts, green-black in the depths
  vec3 rockAlb(vec2 p, float h, vec3 n){
    float n1 = fbm(p * 0.0036 + 3.0);
    float n2 = vnoise(p * 0.03 + h * 0.02);
    vec3 alb = mix(vec3(0.011, 0.026, 0.15), vec3(0.016, 0.05, 0.19), smoothstep(0.32, 0.7, n1));
    alb = mix(vec3(0.003, 0.018, 0.028), alb, smoothstep(-60.0, 240.0, h + (n1 - 0.5) * 150.0));
    // steep rock: indigo beds, lighter and darker
    float steep = 1.0 - n.y;
    float bed = vnoise(vec2(h * 0.07 + n2 * 2.4, p.x * 0.008 + p.y * 0.006));
    alb = mix(alb, vec3(0.016, 0.02, 0.11) * (0.6 + 0.8 * bed), smoothstep(0.3, 0.72, steep) * 0.6);
    return alb;
  }
  // the long slanting strokes of the chalk, and its grain on the toothed paper: both gone before they could shimmer
  float chalk(vec3 l, float dist){
    float nearK = 1.0 - smoothstep(60.0, 700.0, dist);
    float farK = 1.0 - smoothstep(500.0, 2200.0, dist);
    float s1 = vnoise(vec2((l.x + l.y * 0.8) * 0.16, (l.z - l.y * 0.5) * 0.012));
    float s2 = vnoise(vec2((l.x - l.z) * 0.02 + l.y * 0.03, (l.x + l.z) * 0.0016 + 7.0));
    float tooth = vnoise(l.xz * 1.7 + l.y * 1.1) * 0.5 + vnoise(l.xy * 3.9 - l.z * 2.7) * 0.5;
    return 1.0 + (s1 - 0.5) * 0.7 * nearK + (s2 - 0.5) * 0.8 * farK + (tooth - 0.5) * 0.4 * (1.0 - smoothstep(20.0, 160.0, dist));
  }
  const vec3 TEAL = vec3(0.05, 0.36, 0.33);
  const vec3 GOLD = vec3(1.0, 0.74, 0.3);
`;

export function makeRockMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, ...FUNERAL_U },
    vertexShader: /* glsl */ `
      attribute vec3 aK;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec3 vK;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vN = normalize(mat3(modelMatrix) * normal); vK = aK;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec3 vK;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_FUNERAL_AIR}
      ${ROCK_GLSL}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(vWorld - cameraPosition);
        // The faces are not smooth: great ribs run down them and beds lie across, as his strokes model the rock.
        // A height worked out from the place on the mountain turns the light by its slope (the surface's own
        // derivatives); it is given up where a pixel could no longer carry it, so nothing crawls far off.
        vec3 l = vLocal;
        float steep = smoothstep(0.15, 0.6, 1.0 - n.y);
        float ribN = vnoise(vec2((l.x + l.z * 0.6) * 0.03 + vnoise(l.xz * 0.004) * 3.0, l.y * 0.005));
        float rib = abs(ribN - 0.5) * 2.0;
        float bedN = fract(l.y * 0.02 + vnoise(l.xz * 0.006) * 1.5);
        float bed = smoothstep(0.0, 0.25, bedN) * (1.0 - smoothstep(0.85, 1.0, bedN));
        float relief = (rib * 1.5 + bed * 0.45) * steep;
        float rk = (1.0 - smoothstep(900.0, 2600.0, dist)) * (1.0 - smoothstep(0.2, 0.6, fwidth(relief)));
        if (rk > 0.01) {
          vec3 sx = dFdx(vWorld); vec3 sy = dFdy(vWorld);
          vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(relief) * r1 + dFdy(relief) * r2);
          n = normalize(abs(det) * n - grad * 5.0 * rk);
        }
        vec3 alb = rockAlb(vLocal.xz, vLocal.y, n) * chalk(vLocal, dist);
        alb *= mix(1.0, mix(0.66, 1.16, smoothstep(0.05, 0.6, rib)), steep * rk);
        float lam = clamp(dot(n, uKeyDir) * 0.55 + 0.45, 0.0, 1.0);
        vec3 col = alb * (uSkyCol * (0.72 + 0.28 * n.y) * 1.25 + uKeyCol * lam * lam * 0.75);
        // his green-blue line of light along every crest, and a breath of it where a form turns from the eye
        float crest = smoothstep(0.16, 0.75, vK.x);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
        float toMoon = smoothstep(-0.2, 0.7, dot(n, uKeyDir));
        col += TEAL * (crest * 0.72 * (0.25 + 0.75 * toMoon) + fres * 0.14 * toMoon) * (0.6 + 0.8 * vnoise(vLocal.xz * 0.05 + vLocal.y * 0.03));
        // the gullies hold darker chalk
        col *= 1.0 - 0.4 * smoothstep(0.04, 0.5, -vK.x);
        // the gold the procession carries, on the rock beside it
        col += GOLD * vK.y * vK.y * vK.y * 0.04 * (0.4 + 0.8 * vnoise(vLocal.xz * 0.12 + vLocal.y * 0.1));
        col = funeralAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// the road, its cliffs, and the cave: aK.x says which (0 the road, 1 a cliff, 2 the mountain's face round the
// mouth, 3 the vault inside, 4 the light at its end)
export function makeLedgeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...FUNERAL_U },
    vertexShader: /* glsl */ `
      attribute vec4 aK;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec4 vK;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vN = normalize(mat3(modelMatrix) * normal); vK = aK;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec4 vK;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_FUNERAL_AIR}
      ${ROCK_GLSL}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(n, V) < 0.0) n = -n;
        float dist = length(vWorld - cameraPosition);
        float kind = vK.x;
        vec3 col;
        if (kind < 0.5) {
          // the road: worn pale by the feet, lit from within the crowd by what they carry: a ground of dull gold,
          // brighter in soft pools that drift slowly along it, darker toward its edges
          float pool = vnoise(vec2(vK.w * 0.045 - uTime * 0.02, vK.y * 1.6)) * 0.6 + vnoise(vec2(vK.w * 0.21, vK.y * 4.0 + 3.0)) * 0.4;
          float dab = vnoise(vLocal.xz * 0.9) * 0.5 + vnoise(vLocal.xz * 2.6 + 9.0) * 0.5;
          vec3 alb = mix(vec3(0.02, 0.03, 0.1), vec3(0.05, 0.055, 0.1), 0.4 + 0.6 * dab);
          // (inside the cave it comes out of the road is almost black: only where the night reaches in does it take its blue)
          col = alb * (uSkyCol * 1.2 + uKeyCol * 0.16) * mix(0.16, 1.0, smoothstep(uBorn + 10.0, uBorn + 90.0, vK.w));
          float mid = 1.0 - smoothstep(0.55, 1.0, abs(vK.y));
          // (no gold where no one walks yet: far inside the cave the road comes out of it is bare dark rock)
          col += GOLD * (0.04 + 0.2 * smoothstep(0.25, 0.8, pool) + 0.5 * bellAt(vK.w)) * (0.45 + 0.55 * dab) * mid * glowK() * 2.2 * smoothstep(uBorn - 6.0, uBorn + 40.0, vK.w);
        } else if (kind < 1.5) {
          // the cliff under the road's edge: dark indigo rock drawn in long upright strokes, its lip catching the
          // gold from above, its foot going down into green-black
          float depth = vK.z;
          float stroke = vnoise(vec2(vK.w * 0.42 + vK.y * 9.0, depth * 1.6)) * 0.6 + vnoise(vec2(vK.w * 1.7, depth * 4.0 + 4.0)) * 0.4;
          stroke = smoothstep(0.2, 0.8, stroke);
          vec3 alb = mix(vec3(0.014, 0.022, 0.12), vec3(0.004, 0.012, 0.03), smoothstep(0.05, 0.9, depth)) * (0.16 + 2.0 * stroke * stroke);
          alb *= chalk(vLocal, dist);
          float lam = clamp(dot(n, uKeyDir) * 0.55 + 0.45, 0.0, 1.0);
          col = alb * (uSkyCol * 1.2 + uKeyCol * lam * lam * 0.3);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
          col += TEAL * fres * 0.12 * smoothstep(-0.3, 0.6, dot(n, uKeyDir));
          // the gold spilling over the edge: a bright line at the lip, running a little way down the strokes
          col += GOLD * (exp(-depth * 90.0) * 0.14 + exp(-depth * 7.0) * 0.03 * stroke) * glowK() * 2.0;
        } else if (kind > 5.5) {
          // the wall that closes the cave over the portal: the cave's rock, dressed; the light of the other world on the lip of the opening
          float rib = vnoise(vec2(vLocal.x * 0.2 + vLocal.z * 0.2, vLocal.y * 0.12)) * 0.6 + vnoise(vLocal.xz * 0.7 + vLocal.y) * 0.4;
          float bed = vnoise(vec2(vLocal.y * 0.5 + rib * 3.0, (vLocal.x + vLocal.z) * 0.03));
          vec3 alb = vec3(0.016, 0.024, 0.085) * (0.45 + rib) * (0.6 + 0.8 * bed);
          col = alb * (uSkyCol * 1.3);
          float lip = exp(-vK.y * 9.0);
          col += mix(vec3(1.0, 0.8, 0.45), vec3(0.45, 0.8, 0.7), 0.35 + 0.3 * vnoise(vec2(vK.z * 30.0, uTime * 0.2))) * (lip * 0.55 + exp(-vK.y * 2.2) * 0.12) * (0.85 + 0.15 * sin(uTime * 0.5)) * glowK() * 2.0;
        } else if (kind > 4.5) {
          // the scree under the cliff: the mountain's own rock
          vec3 alb = rockAlb(vLocal.xz, vLocal.y, n) * chalk(vLocal, dist);
          float lam = clamp(dot(n, uKeyDir) * 0.55 + 0.45, 0.0, 1.0);
          col = alb * (uSkyCol * (0.72 + 0.28 * n.y) * 1.25 + uKeyCol * lam * lam * 0.42);
          col += GOLD * exp(-max(vLocal.y, 0.0) * 0.0) * 0.0;
        } else if (kind < 2.5) {
          // the mountain's face round the mouth: carved rock, and the light from inside coming out over its lip
          vec3 alb = rockAlb(vLocal.xz, vLocal.y, n) * chalk(vLocal, dist) * (0.75 + 0.5 * vnoise(vLocal.xy * 0.06 + vLocal.z * 0.05));
          float lam = clamp(dot(n, uKeyDir) * 0.55 + 0.45, 0.0, 1.0);
          col = alb * (uSkyCol * 1.15 + uKeyCol * lam * 0.42);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
          col += TEAL * fres * 0.45 * smoothstep(-0.3, 0.6, dot(n, uKeyDir));
          col += GOLD * exp(-vK.y * 18.0) * 0.22 * (0.7 + 0.3 * sin(uTime * 0.4)) * glowK() * 2.0 * uCaveK * (1.0 - vK.w);
        } else if (kind < 3.5) {
          // inside: dark rock, the light of whatever lies at the end growing along the vault, pulsing very slowly
          float deep = vK.y;
          float rib = vnoise(vec2(vLocal.x * 0.2 + vLocal.z * 0.2, vLocal.y * 0.12)) * 0.6 + vnoise(vLocal.xz * 0.7 + vLocal.y) * 0.4;
          float bed = vnoise(vec2(vLocal.y * 0.5 + rib * 3.0, (vLocal.x + vLocal.z) * 0.03));
          vec3 alb = vec3(0.012, 0.018, 0.07) * (0.35 + rib) * (0.6 + 0.8 * bed);
          if (vK.w > 0.5) {
            // the cave the road comes out of: black rock, and only the night's own blue reaching in from the mouth,
            // along the wet beds of the vault, less and less
            float reach = exp(-deep * 4.2);
            col = alb * uSkyCol * (0.1 + 3.4 * reach);
            col += vec3(0.03, 0.09, 0.3) * reach * reach * (0.25 + 1.6 * rib * bed) * 0.5;
            // the feet of the walls take a little gold from the lights that go by
            col += GOLD * exp(-vK.z * 9.0) * 0.012 * smoothstep(0.55, 0.2, deep) * glowK() * 2.0;
            // and far inside, the sheet of light it came through (the still sea's pale green-gold) on the vault round it
            col += vec3(0.2, 0.25, 0.15) * exp(-(1.0 - deep) * 5.5) * (0.3 + 1.5 * rib * bed) * 0.45;
          } else {
            // a built gallery of dressed rock: an arch of heavier stone every sixteen metres, the beds of the rock between
            // them, blue-black, and the light of the portal at the far end growing along the vault, cream with the wood's teal in it
            float rp = fract(deep * 15.5);
            float archK = smoothstep(0.0, 1.0, 1.0 - abs(rp - 0.5) * 2.0 / 0.34);
            float stone = (0.35 + rib) * (0.6 + 0.8 * bed) * (1.0 + 0.7 * archK);
            vec3 sal = vec3(0.011, 0.02, 0.075) * stone;
            vec3 pcol = mix(vec3(1.0, 0.82, 0.5), vec3(0.45, 0.85, 0.75), 0.3 + 0.25 * vnoise(vec2(vLocal.y * 0.1, uTime * 0.15)));
            float lightK = pow(deep, 2.2) * (0.25 + 0.9 * clamp(dot(n, V) * 0.0 + 0.5 + 0.5 * (1.0 - vK.z), 0.0, 1.0));
            col = sal * (uSkyCol * 0.9 + pcol * lightK * 2.6 * (0.6 + 0.4 * sin(uTime * 0.33)) * min(uCaveK, 1.4));
            col += pcol * lightK * 0.03 * (0.4 + archK * 1.4) * glowK() * 2.0;
            // (the wet beds of the rock hold a thread of that light)
            col += pcol * 0.02 * deep * smoothstep(0.55, 0.75, bed) * glowK() * 2.0;
            col += GOLD * exp(-vK.z * 7.0) * 0.03 * glowK() * 2.0 * uCaveK;
            // the floor at the road's sides: dark flags, the glow of the portal only a breath on them
            float flr = 1.0 - smoothstep(0.0, 0.07, vK.z);
            col = mix(col, sal * uSkyCol * 1.0 + pcol * lightK * 0.05 * glowK() * 2.0, flr);
          }
        } else {
          col = vec3(1.0, 0.8, 0.45) * mix(1.6, 0.25, vK.z) * (0.85 + 0.15 * sin(uTime * 0.33)) * glowK() * 2.0 * uCaveK;
        }
        if (kind < 2.5 || (kind > 4.5 && kind < 5.5)) col = funeralAir(col, vWorld);
        else if (vK.w < 0.5) col = mix(col, vec3(1.0, 0.7, 0.34) * 0.05 * glowK() * 2.0, (1.0 - exp(-dist * 0.004)) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}
