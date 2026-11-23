import * as THREE from "three";
import { edgeTable as ET, triTable as TT } from "three/examples/jsm/objects/MarchingCubes.js";

// A skin drawn over any distance field (negative inside), by marching cubes, as work that can be put down and
// picked up: it yields whenever it has run `budget` milliseconds, so a colossal figure is made a little each frame
// while another world is flown. (The same method as sculpt.ts, for fields that are not made of lumps: a face drawn
// as a profile and inflated, a cave.)
//
// Every vertex carries `aAO`: how open it lies (1 in the open, toward 0 in creases), read from the field itself.

const edgeTable = ET as unknown as Int32Array;
const triTable = TT as unknown as Int32Array;
export type Box = { min: [number, number, number]; max: [number, number, number] };

export function* surfaceSteps(field: (x: number, y: number, z: number) => number, box: Box, voxel: number, budget = Infinity): Generator<void, THREE.BufferGeometry, void> {
  let began = performance.now();
  const lap = () => performance.now() - began > budget;
  const o = box.min;
  const nx = Math.max(4, Math.ceil((box.max[0] - o[0]) / voxel) + 1);
  const ny = Math.max(4, Math.ceil((box.max[1] - o[1]) / voxel) + 1);
  const nz = Math.max(4, Math.ceil((box.max[2] - o[2]) / voxel) + 1);
  const nxy = nx * ny;
  const F = new Float32Array(nx * ny * nz);
  // First the field on a lattice four samples apart; then each sample is worked out exactly only where the surface
  // may be near (a distance field changes no faster than the distance itself), elsewhere read from the lattice.
  const C = 4;
  const cx = Math.ceil((nx - 1) / C) + 1;
  const cy = Math.ceil((ny - 1) / C) + 1;
  const cz = Math.ceil((nz - 1) / C) + 1;
  const L = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++) {
      if (lap()) {
        yield;
        began = performance.now();
      }
      for (let i = 0; i < cx; i++) L[i + j * cx + k * cx * cy] = field(o[0] + i * C * voxel, o[1] + j * C * voxel, o[2] + k * C * voxel);
    }
  const band = C * voxel * 1.8;
  for (let k = 0; k < nz; k++) {
    const z = o[2] + k * voxel;
    const kz = Math.min(cz - 2, Math.floor(k / C));
    const tz = k / C - kz;
    for (let j = 0; j < ny; j++) {
      if (lap()) {
        yield;
        began = performance.now();
      }
      const y = o[1] + j * voxel;
      const jy = Math.min(cy - 2, Math.floor(j / C));
      const ty = j / C - jy;
      let q = j * nx + k * nxy;
      for (let i = 0; i < nx; i++, q++) {
        const ix = Math.min(cx - 2, Math.floor(i / C));
        const tx = i / C - ix;
        const b = ix + jy * cx + kz * cx * cy;
        const a00 = L[b] + (L[b + 1] - L[b]) * tx;
        const a10 = L[b + cx] + (L[b + cx + 1] - L[b + cx]) * tx;
        const a01 = L[b + cx * cy] + (L[b + cx * cy + 1] - L[b + cx * cy]) * tx;
        const a11 = L[b + cx * cy + cx] + (L[b + cx * cy + cx + 1] - L[b + cx * cy + cx]) * tx;
        const lv = (a00 + (a10 - a00) * ty) * (1 - tz) + (a01 + (a11 - a01) * ty) * tz;
        const v = Math.abs(lv) > band ? lv : field(o[0] + i * voxel, y, z);
        // (the block's own faces are outside: the skin is always closed)
        F[q] = i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1 ? Math.max(voxel, v) : v;
      }
    }
  }

  const CO = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const EA = [0, 1, 2, 0, 4, 5, 6, 4, 0, 1, 3, 2];
  const EB = [1, 3, 3, 2, 5, 7, 7, 6, 4, 5, 7, 6];
  const BIT = [1, 2, 8, 4, 16, 32, 128, 64];
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const seen = new Map<number, number>();
  const total = F.length;
  const grad = (q: number, out: number[]) => {
    out[0] = (q + 1 < total ? F[q + 1] : F[q]) - (q >= 1 ? F[q - 1] : F[q]);
    out[1] = (q + nx < total ? F[q + nx] : F[q]) - (q >= nx ? F[q - nx] : F[q]);
    out[2] = (q + nxy < total ? F[q + nxy] : F[q]) - (q >= nxy ? F[q - nxy] : F[q]);
  };
  const ga = [0, 0, 0];
  const gb = [0, 0, 0];
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
  // how open each point of the skin lies: the field a little way out along its normal, against that distance
  const nv = pos.length / 3;
  const ao = new Float32Array(nv);
  const sample = (x: number, y: number, z: number) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - o[0]) / voxel));
    const fy = Math.min(ny - 1.001, Math.max(0, (y - o[1]) / voxel));
    const fz = Math.min(nz - 1.001, Math.max(0, (z - o[2]) / voxel));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const ty = fy - iy;
    const tz = fz - iz;
    const q = ix + iy * nx + iz * nxy;
    const a = F[q] + (F[q + 1] - F[q]) * tx;
    const b = F[q + nx] + (F[q + nx + 1] - F[q + nx]) * tx;
    const c = F[q + nxy] + (F[q + nxy + 1] - F[q + nxy]) * tx;
    const d = F[q + nxy + nx] + (F[q + nxy + nx + 1] - F[q + nxy + nx]) * tx;
    return a + (b - a) * ty + (c + (d - c) * ty - a - (b - a) * ty) * tz;
  };
  const AO_D = [voxel * 2, voxel * 5, voxel * 11];
  for (let v = 0; v < nv; v++) {
    if ((v & 1023) === 0 && lap()) {
      yield;
      began = performance.now();
    }
    let s = 0;
    for (const d of AO_D) s += Math.min(1, Math.max(0, sample(pos[v * 3] + nor[v * 3] * d, pos[v * 3 + 1] + nor[v * 3 + 1] * d, pos[v * 3 + 2] + nor[v * 3 + 2] * d) / d));
    ao[v] = s / AO_D.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aAO", new THREE.BufferAttribute(ao, 1));
  geo.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
