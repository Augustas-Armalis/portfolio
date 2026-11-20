import * as THREE from "three";
import { edgeTable as ET, triTable as TT } from "three/examples/jsm/objects/MarchingCubes.js";
import type { V3 } from "./kit";

// Clay. A figure is modelled the way a sculptor builds one up: rounded lumps
// (balls, and limbs that taper between two ends) pressed into each other so
// they flow together, a few hollows cut back out, and paint laid on last. The
// lumps are a distance field; the skin is drawn over it by marching cubes.
//
// Every vertex carries
//   aCol  rgb, and a (the paint's kind: whatever the material makes of it)
//   aPat  along and across the lump it mostly belongs to, in metres, for
//         patterns that should run with a sleeve or the fall of a robe

const edgeTable = ET as unknown as Int32Array;
const triTable = TT as unknown as Int32Array;

export type Paint = { col: V3; kind: number };
type Lump = {
  a: THREE.Vector3;
  b: THREE.Vector3;
  ra: number;
  rb: number;
  flat: number; // limbs: how much wider in depth (z) than in the picture plane
  ell: { ex: THREE.Vector3; ey: THREE.Vector3; ez: THREE.Vector3; r: V3 } | null;
  mat: number;
  k: number; // how far it flows into its neighbours
  mode: 0 | 1 | 2; // clay, a hollow, paint only
  soft: number;
  s0: number;
  ax: THREE.Vector3;
  perp: THREE.Vector3;
  len: number;
  min: V3;
  max: V3;
};
type Opt = { k?: number; flat?: number; cut?: boolean; paint?: boolean; soft?: number; s0?: number; x?: V3; y?: V3 };

const Z = new THREE.Vector3(0, 0, 1);
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

export class Clay {
  lumps: Lump[] = [];
  constructor(private blend = 4) {}

  private push(l: Omit<Lump, "ax" | "perp" | "len" | "min" | "max">) {
    const ax = l.ell ? l.ell.ey.clone() : l.b.clone().sub(l.a);
    const len = l.ell ? l.ell.r[1] * 2 : ax.length();
    if (len > 1e-6 && !l.ell) ax.divideScalar(len);
    const perp = new THREE.Vector3().crossVectors(ax, Z);
    if (perp.lengthSq() < 0.01) perp.set(1, 0, 0);
    perp.normalize();
    let min: V3;
    let max: V3;
    if (l.ell) {
      const e = l.ell;
      const ext = [0, 1, 2].map((i) => Math.abs(e.ex.getComponent(i)) * e.r[0] + Math.abs(e.ey.getComponent(i)) * e.r[1] + Math.abs(e.ez.getComponent(i)) * e.r[2]);
      min = [l.a.x - ext[0], l.a.y - ext[1], l.a.z - ext[2]];
      max = [l.a.x + ext[0], l.a.y + ext[1], l.a.z + ext[2]];
    } else {
      const r = Math.max(l.ra, l.rb);
      min = [Math.min(l.a.x, l.b.x) - r, Math.min(l.a.y, l.b.y) - r, Math.min(l.a.z, l.b.z) - r * l.flat];
      max = [Math.max(l.a.x, l.b.x) + r, Math.max(l.a.y, l.b.y) + r, Math.max(l.a.z, l.b.z) + r * l.flat];
    }
    this.lumps.push({ ...l, ax, perp, len, min, max });
    return this;
  }
  // a limb: round, tapering from one end to the other
  limb(a: V3, b: V3, ra: number, rb: number, mat: number, o: Opt = {}) {
    return this.push({ a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), ra, rb, flat: o.flat ?? 1, ell: null, mat, k: o.k ?? this.blend, mode: o.cut ? 1 : o.paint ? 2 : 0, soft: o.soft ?? 1.2, s0: o.s0 ?? 0 });
  }
  // a chain of limbs through several points
  chain(pts: V3[], radii: number[], mat: number, o: Opt = {}) {
    let s = o.s0 ?? 0;
    for (let i = 0; i < pts.length - 1; i++) {
      this.limb(pts[i], pts[i + 1], radii[i], radii[i + 1], mat, { ...o, s0: s });
      s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    }
    return this;
  }
  // a ball, or an egg with its own three radii (x and y are its own axes; they need not be the world's)
  ball(c: V3, r: number | V3, mat: number, o: Opt = {}) {
    const rr: V3 = typeof r === "number" ? [r, r, r] : r;
    const ex = new THREE.Vector3(...(o.x ?? [1, 0, 0])).normalize();
    const ey = new THREE.Vector3(...(o.y ?? [0, 1, 0]));
    ey.addScaledVector(ex, -ey.dot(ex)).normalize();
    const ez = new THREE.Vector3().crossVectors(ex, ey);
    const c3 = new THREE.Vector3(...c);
    return this.push({ a: c3, b: c3, ra: 0, rb: 0, flat: 1, ell: { ex, ey, ez, r: rr }, mat, k: o.k ?? this.blend, mode: o.cut ? 1 : o.paint ? 2 : 0, soft: o.soft ?? 1.2, s0: o.s0 ?? 0 });
  }

  private dist(l: Lump, x: number, y: number, z: number) {
    const px = x - l.a.x;
    const py = y - l.a.y;
    const pz = z - l.a.z;
    if (l.ell) {
      const e = l.ell;
      const qx = (px * e.ex.x + py * e.ex.y + pz * e.ex.z) / e.r[0];
      const qy = (px * e.ey.x + py * e.ey.y + pz * e.ey.z) / e.r[1];
      const qz = (px * e.ez.x + py * e.ez.y + pz * e.ez.z) / e.r[2];
      return (Math.sqrt(qx * qx + qy * qy + qz * qz) - 1) * Math.min(e.r[0], e.r[1], e.r[2]);
    }
    const f = l.flat;
    const pzf = pz / f;
    const bx = l.b.x - l.a.x;
    const by = l.b.y - l.a.y;
    const bz = (l.b.z - l.a.z) / f;
    const bb = bx * bx + by * by + bz * bz;
    const t = bb > 1e-9 ? Math.min(1, Math.max(0, (px * bx + py * by + pzf * bz) / bb)) : 0;
    const dx = px - bx * t;
    const dy = py - by * t;
    const dz = pzf - bz * t;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - (l.ra + (l.rb - l.ra) * t);
  }

  // how far a point is from the clay (inside is negative)
  field(x: number, y: number, z: number) {
    let f = 1e3;
    for (const l of this.lumps) if (l.mode === 0) f = smin(f, this.dist(l, x, y, z), l.k);
    for (const l of this.lumps) if (l.mode === 1) f = -smin(-f, this.dist(l, x, y, z), l.k);
    return f;
  }
  // where a line from outside first meets the clay, for laying a drawn line on the surface
  drop(from: V3, to: V3): V3 {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const dz = to[2] - from[2];
    const len = Math.hypot(dx, dy, dz);
    let t = 0;
    for (let i = 0; i < 80 && t < len; i++) {
      const d = this.field(from[0] + (dx / len) * t, from[1] + (dy / len) * t, from[2] + (dz / len) * t);
      if (d < 0.02) break;
      t += d * 0.8;
    }
    return [from[0] + (dx / len) * t, from[1] + (dy / len) * t, from[2] + (dz / len) * t];
  }

  // The skin, at a given fineness (metres between samples). `box` keeps only a part of the figure.
  mesh(voxel: number, paints: Paint[], box?: { min: V3; max: V3 }) {
    const g = this.meshSteps(voxel, paints, box);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }
  // The same, as work that can be put down and picked up: it yields whenever it has run for `budget` milliseconds,
  // so a figure can be made a little each frame while something else is on screen.
  *meshSteps(voxel: number, paints: Paint[], box?: { min: V3; max: V3 }, budget = Infinity): Generator<void, THREE.BufferGeometry, void> {
    let began = performance.now();
    const solid = this.lumps.filter((l) => l.mode !== 2);
    const lo: V3 = [1e9, 1e9, 1e9];
    const hi: V3 = [-1e9, -1e9, -1e9];
    for (const l of solid) {
      if (l.mode !== 0) continue;
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], l.min[i]);
        hi[i] = Math.max(hi[i], l.max[i]);
      }
    }
    if (box)
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.max(lo[i], box.min[i]);
        hi[i] = Math.min(hi[i], box.max[i]);
      }
    const pad = voxel * 3;
    const n = [0, 1, 2].map((i) => Math.max(4, Math.ceil((hi[i] - lo[i] + pad * 2) / voxel) + 1));
    const [nx, ny, nz] = n;
    const o: V3 = [lo[0] - pad, lo[1] - pad, lo[2] - pad];
    const field = new Float32Array(nx * ny * nz).fill(1e3);
    const nxy = nx * ny;
    // each lump is pressed into the block only where it can matter
    for (const pass of [0, 1] as const)
      for (const l of solid) {
        if (l.mode !== pass) continue;
        const m = l.k + voxel * 2.5;
        const grow = l.ell ? 1 + m / Math.min(...l.ell.r) : 1;
        const cx = (l.min[0] + l.max[0]) / 2;
        const cy = (l.min[1] + l.max[1]) / 2;
        const cz = (l.min[2] + l.max[2]) / 2;
        const hx = l.ell ? ((l.max[0] - l.min[0]) / 2) * grow : (l.max[0] - l.min[0]) / 2 + m;
        const hy = l.ell ? ((l.max[1] - l.min[1]) / 2) * grow : (l.max[1] - l.min[1]) / 2 + m;
        const hz = l.ell ? ((l.max[2] - l.min[2]) / 2) * grow : (l.max[2] - l.min[2]) / 2 + m * l.flat;
        const i0 = Math.max(0, Math.floor((cx - hx - o[0]) / voxel));
        const i1 = Math.min(nx - 1, Math.ceil((cx + hx - o[0]) / voxel));
        const j0 = Math.max(0, Math.floor((cy - hy - o[1]) / voxel));
        const j1 = Math.min(ny - 1, Math.ceil((cy + hy - o[1]) / voxel));
        const k0 = Math.max(0, Math.floor((cz - hz - o[2]) / voxel));
        const k1 = Math.min(nz - 1, Math.ceil((cz + hz - o[2]) / voxel));
        if (performance.now() - began > budget) {
          yield;
          began = performance.now();
        }
        for (let k = k0; k <= k1; k++) {
          const z = o[2] + k * voxel;
          for (let j = j0; j <= j1; j++) {
            const y = o[1] + j * voxel;
            let q = i0 + j * nx + k * nxy;
            for (let i = i0; i <= i1; i++, q++) {
              const d = this.dist(l, o[0] + i * voxel, y, z);
              field[q] = pass === 0 ? smin(field[q], d, l.k) : -smin(-field[q], d, l.k);
            }
          }
        }
      }

    // marching cubes, the corners and edges numbered as three's own tables number them
    const CO = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
    const EA = [0, 1, 2, 0, 4, 5, 6, 4, 0, 1, 3, 2];
    const EB = [1, 3, 3, 2, 5, 7, 7, 6, 4, 5, 7, 6];
    const BIT = [1, 2, 8, 4, 16, 32, 128, 64];
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const seen = new Map<number, number>();
    const total = field.length;
    const grad = (q: number, out: number[]) => {
      const f = field;
      out[0] = (q + 1 < total ? f[q + 1] : f[q]) - (q >= 1 ? f[q - 1] : f[q]);
      out[1] = (q + nx < total ? f[q + nx] : f[q]) - (q >= nx ? f[q - nx] : f[q]);
      out[2] = (q + nxy < total ? f[q + nxy] : f[q]) - (q >= nxy ? f[q - nxy] : f[q]);
    };
    const ga = [0, 0, 0];
    const gb = [0, 0, 0];
    const ev = new Int32Array(12);
    const vertex = (qa: number, qb: number) => {
      const key = qa < qb ? qa * 8 + (qb - qa === 1 ? 0 : qb - qa === nx ? 1 : 2) : qb * 8 + (qa - qb === 1 ? 0 : qa - qb === nx ? 1 : 2);
      const had = seen.get(key);
      if (had !== undefined) return had;
      const fa = field[qa];
      const fb = field[qb];
      const t = Math.abs(fa - fb) > 1e-9 ? fa / (fa - fb) : 0.5;
      const ax = qa % nx;
      const ay = Math.floor(qa / nx) % ny;
      const az = Math.floor(qa / nxy);
      const bx = qb % nx;
      const by = Math.floor(qb / nx) % ny;
      const bz = Math.floor(qb / nxy);
      pos.push(o[0] + (ax + (bx - ax) * t) * voxel, o[1] + (ay + (by - ay) * t) * voxel, o[2] + (az + (bz - az) * t) * voxel);
      grad(qa, ga);
      grad(qb, gb);
      const gx = ga[0] + (gb[0] - ga[0]) * t;
      const gy = ga[1] + (gb[1] - ga[1]) * t;
      const gz = ga[2] + (gb[2] - ga[2]) * t;
      const gl = Math.hypot(gx, gy, gz) || 1;
      nor.push(gx / gl, gy / gl, gz / gl);
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
          for (let c = 0; c < 8; c++) if (field[q + CO[c]] < 0) ci |= BIT[c];
          const bits = edgeTable[ci];
          if (bits === 0) continue;
          for (let e = 0; e < 12; e++) if (bits & (1 << e)) ev[e] = vertex(q + CO[EA[e]], q + CO[EB[e]]);
          for (let t = ci << 4; triTable[t] !== -1; t += 3) {
            const a = ev[triTable[t]];
            const b = ev[triTable[t + 1]];
            const c = ev[triTable[t + 2]];
            if (a === b || b === c || a === c) continue;
            // wound so that it faces the way the clay's surface does
            const ux = pos[b * 3] - pos[a * 3];
            const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
            const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
            const vx = pos[c * 3] - pos[a * 3];
            const vy = pos[c * 3 + 1] - pos[a * 3 + 1];
            const vz = pos[c * 3 + 2] - pos[a * 3 + 2];
            const fx = uy * vz - uz * vy;
            const fy = uz * vx - ux * vz;
            const fz = ux * vy - uy * vx;
            if (fx * (nor[a * 3] + nor[b * 3] + nor[c * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]) >= 0) idx.push(a, b, c);
            else idx.push(a, c, b);
          }
        }
      }
    }

    // paint: every vertex takes the colour of the lumps it lies on, run together where they meet
    const nv = pos.length / 3;
    const col = new Float32Array(nv * 4);
    const pat = new Float32Array(nv * 2);
    const painted = this.lumps.filter((l) => l.mode !== 1);
    for (let v = 0; v < nv; v++) {
      if ((v & 255) === 0 && performance.now() - began > budget) {
        yield;
        began = performance.now();
      }
      const x = pos[v * 3];
      const y = pos[v * 3 + 1];
      const z = pos[v * 3 + 2];
      let w = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let kd = 0;
      let ps = 0;
      let pc = 0;
      for (const l of painted) {
        const m = l.k + l.soft * 4 + 1;
        if (x < l.min[0] - m || x > l.max[0] + m || y < l.min[1] - m || y > l.max[1] + m || z < l.min[2] - m * l.flat || z > l.max[2] + m * l.flat) continue;
        const d = this.dist(l, x, y, z);
        // paint lies over clay
        const wt = Math.exp(-Math.max(d, -l.soft * 3) / l.soft) * (l.mode === 2 ? 6 : 1);
        if (wt < 1e-4) continue;
        const p = paints[l.mat];
        w += wt;
        r += p.col[0] * wt;
        g += p.col[1] * wt;
        b += p.col[2] * wt;
        kd += p.kind * wt;
        const dx = x - l.a.x;
        const dy = y - l.a.y;
        const dz = z - l.a.z;
        ps += (l.s0 + (l.ell ? l.ell.r[1] : 0) + dx * l.ax.x + dy * l.ax.y + dz * l.ax.z) * wt;
        pc += (dx * l.perp.x + dy * l.perp.y + dz * l.perp.z) * wt;
      }
      if (w > 0) {
        col[v * 4] = r / w;
        col[v * 4 + 1] = g / w;
        col[v * 4 + 2] = b / w;
        col[v * 4 + 3] = kd / w;
        pat[v * 2] = ps / w;
        pat[v * 2 + 1] = pc / w;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("aCol", new THREE.BufferAttribute(col, 4));
    geo.setAttribute("aPat", new THREE.BufferAttribute(pat, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }
}
