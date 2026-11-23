import { edgeTable as ET, triTable as TT } from "three/examples/jsm/objects/MarchingCubes.js";

// A skin drawn over a distance field (negative inside) by marching cubes, as work that can be put down and picked
// up: it yields whenever it has run `budget` milliseconds, so a colossal figure is made a little each frame while
// another world is flown.
//
// The box is open: where the surface leaves it, the skin simply ends, so boxes of different fineness can meet
// (each a voxel into the other) without a lid between them. Normals are the field's own gradient at each vertex
// (not the faces'), so the skin shades as smoothly as the field is; `ao` is how open each point lies, read from
// the field a little way out along the normal.

const edgeTable = ET as unknown as Int32Array;
const triTable = TT as unknown as Int32Array;
export type Box = { min: [number, number, number]; max: [number, number, number] };
export type Skin = { pos: Float32Array; nor: Float32Array; ao: Float32Array; idx: Uint32Array };

export function* surfaceSteps(field: (x: number, y: number, z: number) => number, box: Box, voxel: number, budget = Infinity, aoReach = voxel * 6): Generator<void, Skin, void> {
  let began = performance.now();
  const lap = () => performance.now() - began > budget;
  const o = box.min;
  const nx = Math.max(4, Math.ceil((box.max[0] - o[0]) / voxel) + 1);
  const ny = Math.max(4, Math.ceil((box.max[1] - o[1]) / voxel) + 1);
  const nz = Math.max(4, Math.ceil((box.max[2] - o[2]) / voxel) + 1);
  const nxy = nx * ny;
  const F = new Float32Array(nx * ny * nz);
  // First the field on a lattice C samples apart; then each sample is worked out exactly only where the surface may
  // be near (a distance field changes no faster than the distance itself), elsewhere read from the lattice.
  const C = 4;
  const cx = Math.ceil((nx - 1) / C) + 2;
  const cy = Math.ceil((ny - 1) / C) + 2;
  const cz = Math.ceil((nz - 1) / C) + 2;
  const L = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++) {
      if (lap()) {
        yield;
        began = performance.now();
      }
      for (let i = 0; i < cx; i++) L[i + j * cx + k * cx * cy] = field(o[0] + i * C * voxel, o[1] + j * C * voxel, o[2] + k * C * voxel);
    }
  const band = C * voxel * 0.9 + voxel;
  for (let k = 0; k < nz; k++) {
    const z = o[2] + k * voxel;
    const kz = Math.floor(k / C);
    const tz = k / C - kz;
    for (let j = 0; j < ny; j++) {
      if (lap()) {
        yield;
        began = performance.now();
      }
      const y = o[1] + j * voxel;
      const jy = Math.floor(j / C);
      const ty = j / C - jy;
      let q = j * nx + k * nxy;
      for (let i = 0; i < nx; i++, q++) {
        const ix = Math.floor(i / C);
        const tx = i / C - ix;
        const b = ix + jy * cx + kz * cx * cy;
        const a00 = L[b] + (L[b + 1] - L[b]) * tx;
        const a10 = L[b + cx] + (L[b + cx + 1] - L[b + cx]) * tx;
        const a01 = L[b + cx * cy] + (L[b + cx * cy + 1] - L[b + cx * cy]) * tx;
        const a11 = L[b + cx * cy + cx] + (L[b + cx * cy + cx + 1] - L[b + cx * cy + cx]) * tx;
        const lv = (a00 + (a10 - a00) * ty) * (1 - tz) + (a01 + (a11 - a01) * ty) * tz;
        F[q] = Math.abs(lv) > band ? lv : field(o[0] + i * voxel, y, z);
      }
    }
  }

  const CO = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const EA = [0, 1, 2, 0, 4, 5, 6, 4, 0, 1, 3, 2];
  const EB = [1, 3, 3, 2, 5, 7, 7, 6, 4, 5, 7, 6];
  const BIT = [1, 2, 8, 4, 16, 32, 128, 64];
  let pos = new Float32Array(1 << 16);
  let np = 0;
  let idx = new Uint32Array(1 << 17);
  let ni = 0;
  const seen = new Map<number, number>();
  const ev = new Int32Array(12);
  const vertex = (qa: number, qb: number) => {
    const lo = Math.min(qa, qb);
    const d = Math.abs(qb - qa);
    const key = lo * 3 + (d === 1 ? 0 : d === nx ? 1 : 2);
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
    if (np + 3 > pos.length) {
      const g = new Float32Array(pos.length * 2);
      g.set(pos);
      pos = g;
    }
    pos[np++] = o[0] + (ax + (bx - ax) * t) * voxel;
    pos[np++] = o[1] + (ay + (by - ay) * t) * voxel;
    pos[np++] = o[2] + (az + (bz - az) * t) * voxel;
    const id = np / 3 - 1;
    seen.set(key, id);
    return id;
  };
  for (let k = 0; k < nz - 1; k++) {
    if (lap()) {
      yield;
      began = performance.now();
    }
    for (let j = 0; j < ny - 1; j++) {
      let q = j * nx + k * nxy;
      for (let i = 0; i < nx - 1; i++, q++) {
        let ci = 0;
        for (let c = 0; c < 8; c++) if (F[q + CO[c]] < 0) ci |= BIT[c];
        const bits = edgeTable[ci];
        if (bits === 0) continue;
        for (let e = 0; e < 12; e++) if (bits & (1 << e)) ev[e] = vertex(q + CO[EA[e]], q + CO[EB[e]]);
        for (let t = ci << 4; triTable[t] !== -1; t += 3) {
          const a = ev[triTable[t]];
          const b = ev[triTable[t + 1]];
          const c = ev[triTable[t + 2]];
          if (a === b || b === c || a === c) continue;
          if (ni + 3 > idx.length) {
            const g = new Uint32Array(idx.length * 2);
            g.set(idx);
            idx = g;
          }
          idx[ni++] = a;
          idx[ni++] = b;
          idx[ni++] = c;
        }
      }
    }
  }
  seen.clear();
  // normals from the field itself, and the winding made to agree with them
  const nv = np / 3;
  const nor = new Float32Array(np);
  const e = voxel * 0.35;
  for (let v = 0; v < nv; v++) {
    if ((v & 511) === 0 && lap()) {
      yield;
      began = performance.now();
    }
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const z = pos[v * 3 + 2];
    // (the tetrahedral gradient: four samples)
    const f1 = field(x + e, y - e, z - e);
    const f2 = field(x - e, y - e, z + e);
    const f3 = field(x - e, y + e, z - e);
    const f4 = field(x + e, y + e, z + e);
    const gx = f1 - f2 - f3 + f4;
    const gy = -f1 - f2 + f3 + f4;
    const gz = -f1 + f2 - f3 + f4;
    const gl = Math.hypot(gx, gy, gz) || 1;
    nor[v * 3] = gx / gl;
    nor[v * 3 + 1] = gy / gl;
    nor[v * 3 + 2] = gz / gl;
  }
  for (let t = 0; t < ni; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    const ux = pos[b * 3] - pos[a * 3];
    const uy = pos[b * 3 + 1] - pos[a * 3 + 1];
    const uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[c * 3] - pos[a * 3];
    const vy = pos[c * 3 + 1] - pos[a * 3 + 1];
    const vz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = uy * vz - uz * vy;
    const fy = uz * vx - ux * vz;
    const fz = ux * vy - uy * vx;
    if (fx * (nor[a * 3] + nor[b * 3] + nor[c * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]) < 0) {
      idx[t + 1] = c;
      idx[t + 2] = b;
    }
  }
  // how open each point lies: the field a little way out along its normal, against that distance
  const ao = new Float32Array(nv);
  const AO_D = [aoReach * 0.4, aoReach, aoReach * 2.4];
  for (let v = 0; v < nv; v++) {
    if ((v & 511) === 0 && lap()) {
      yield;
      began = performance.now();
    }
    let s = 0;
    for (const d of AO_D) s += Math.min(1, Math.max(0, field(pos[v * 3] + nor[v * 3] * d, pos[v * 3 + 1] + nor[v * 3 + 1] * d, pos[v * 3 + 2] + nor[v * 3 + 2] * d) / d));
    ao[v] = s / AO_D.length;
  }
  return { pos: pos.slice(0, np), nor, ao, idx: idx.slice(0, ni) };
}
