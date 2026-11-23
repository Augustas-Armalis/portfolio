import * as THREE from "three";
import { CAVE, riverLevel } from "./home/journey";
import { HLAKE, SEA, hLakeK, landH } from "./home/land";

// What the paper plane (and the eye behind it) must stay above at home: the land itself (home/land.ts: the very
// function the ground mesh, the grass and the trees stand on), the lake and the sea where the land goes under
// them, and the mountain ranges.
//
// The ranges are meshes of their own with no height function to ask, so they are read once from the scene: every
// triangle of every range is laid into a grid of heights (12 m cells, 1.9 km each way from the desk, which is
// further than the air lets the plane go), and the grid is read between its cells. A range is known by its
// material (the uniforms uSnow and uTop), or by `userData.ground = true` on any mesh that should be flown over
// rather than through.

const CELL = 12;
const HALF = 1900;
const N = Math.ceil((HALF * 2) / CELL) + 1;
let solid: Float32Array | null = null;
let solidKey = "";

const isSolid = (o: THREE.Object3D): o is THREE.Mesh => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || !m.geometry?.attributes?.position) return false;
  if (m.userData.ground === true) return true;
  const u = (m.material as THREE.ShaderMaterial | undefined)?.uniforms;
  return !!u && "uSnow" in u && "uTop" in u;
};

// Read the ranges out of the scene (cheap to call again: it only works when the meshes have changed).
export function bakeHomeSolids(scene: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if (isSolid(o)) meshes.push(o);
  });
  const key = meshes.map((m) => m.geometry.uuid).join(",");
  if (key === solidKey) return;
  solidKey = key;
  if (!meshes.length) {
    solid = null;
    return;
  }
  const grid = new Float32Array(N * N).fill(-1e4);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.attributes.position;
    const idx = m.geometry.index;
    const tris = (idx ? idx.count : pos.count) / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
      const x0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) + HALF) / CELL));
      const x1 = Math.min(N - 1, Math.floor((Math.max(a.x, b.x, c.x) + HALF) / CELL));
      const z0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) + HALF) / CELL));
      const z1 = Math.min(N - 1, Math.floor((Math.max(a.z, b.z, c.z) + HALF) / CELL));
      if (x0 > x1 || z0 > z1) continue;
      // the triangle's height at each cell corner that lies inside it (barycentric, seen from above)
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(d) < 1e-9) continue;
      for (let iz = z0; iz <= z1; iz++) {
        const pz = iz * CELL - HALF;
        for (let ix = x0; ix <= x1; ix++) {
          const px = ix * CELL - HALF;
          const u = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / d;
          const v = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / d;
          const w = 1 - u - v;
          if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
          const y = u * a.y + v * b.y + w * c.y;
          const k = iz * N + ix;
          if (y > grid[k]) grid[k] = y;
        }
      }
    }
  }
  solid = grid;
}

// The cave's doorway (journey.ts): the mountain over it and the cliff it is cut into are not ground to be climbed
// over. In front of the mouth and down the cave the plane keeps to the land (the cave's floor is the land).
function inDoor(x: number, z: number) {
  const rx = x - CAVE.x;
  const rz = z - CAVE.z;
  const along = -Math.sin(CAVE.yaw) * rx - Math.cos(CAVE.yaw) * rz; // > 0: into the mountain
  const side = Math.cos(CAVE.yaw) * rx - Math.sin(CAVE.yaw) * rz;
  // (and straight on through the mountain behind it: a plane flying fast reads the land far ahead, and must not climb
  // over the mountain it is about to fly into)
  return along > -170 && along < 700 && Math.abs(side) < CAVE.half + 10 + Math.max(0, -along) * 0.25;
}

// the ranges' height at a point (far below everything where there is none)
function solidAt(x: number, z: number) {
  if (!solid || inDoor(x, z)) return -1e4;
  const fx = (x + HALF) / CELL;
  const fz = (z + HALF) / CELL;
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return -1e4;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const k = iz * N + ix;
  const h00 = solid[k];
  const h10 = solid[k + 1];
  const h01 = solid[k + N];
  const h11 = solid[k + N + 1];
  const top = Math.max(h00, h10, h01, h11);
  if (top < -9e3) return -1e4;
  // (at a range's foot some corners are empty: they count as the lowest corner that is not, so the edge has no cliff in it)
  let lo = top;
  if (h00 > -9e3) lo = Math.min(lo, h00);
  if (h10 > -9e3) lo = Math.min(lo, h10);
  if (h01 > -9e3) lo = Math.min(lo, h01);
  if (h11 > -9e3) lo = Math.min(lo, h11);
  const f = (h: number) => (h > -9e3 ? h : lo);
  const y = (f(h00) * (1 - tx) + f(h10) * tx) * (1 - tz) + (f(h01) * (1 - tx) + f(h11) * tx) * tz;
  // (a ridge may stand a little above the line between two cells: a small margin where the ground is steep)
  return y + Math.min(4, (top - lo) * 0.12);
}

// the level of the water over a point: the lake inside its shore, the sea everywhere else
export const homeWater = (x: number, z: number) => Math.max(hLakeK(x, z) < 1.12 ? Math.max(HLAKE.y, SEA) : SEA, riverLevel(x, z));

// the top of whatever is under a point of the home world: land, water or mountain
export function homeGround(x: number, z: number) {
  return Math.max(landH(x, z), homeWater(x, z), solidAt(x, z));
}
