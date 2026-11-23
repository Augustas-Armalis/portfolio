import * as THREE from "three";
import { buildTree, makeLeafTexture } from "../../home/trees";
import { Kit, makeTempera, rng, type Halo, type V3 } from "../kit";
import { archGeometry, boulderGeometry, leafyMesh, makeLeafyMaterial, type Beam, type Crown } from "../fairy/shared";
import { FRIEND_U, GLSL_ORB } from "./cave";
import type { Fern } from "./ferns";
import { ARCH, CAVE_Z, FRIEND_PATH, ORB, caveAt, clear, floorAt } from "./shape";

// The wood in her cave, in the picture's own green: the painting's ground is upright strokes of green and gold, so
// the cave is full of tall dark trunks going up into the haze, roots hanging from the vault, ferns and mossy stones
// on a soft floor, small glowing mushrooms, shafts of light from far above. The way runs low under the trees and
// opens through an arch of rock into the clearing where she stands. Everything near the orb takes its light.

// the way's x at a given z (straight lines between the path's points)
export function pathX(z: number) {
  const P = FRIEND_PATH;
  if (z >= P[0][1]) return P[0][0];
  for (let i = 1; i < P.length; i++) {
    if (z >= P[i][1]) {
      const t = (z - P[i][1]) / (P[i - 1][1] - P[i][1]);
      return P[i][0] + (P[i - 1][0] - P[i][0]) * t;
    }
  }
  return P[P.length - 1][0];
}
// inside the cave's walls, with a margin
function inside(x: number, z: number, margin: number) {
  if (z < CAVE_Z[0] + 80 || z > CAVE_Z[1] - 30) return false;
  return Math.abs(x) < caveAt(z).w * 0.86 - margin;
}

// Any of the cave's own materials takes the orb's light and its glow in the air: a shared material, its shader
// opened at the one line where its colour meets the air.
export function withOrb<T extends THREE.ShaderMaterial>(m: T, k = 1, reach = 130) {
  m.uniforms = { ...m.uniforms, ...FRIEND_U };
  m.fragmentShader = m.fragmentShader
    .replace("void main(){", `${GLSL_ORB}\nvoid main(){`)
    .replace("col = applyAir(col, vWorld);", `{ vec3 nO = normalize(vN); if (dot(nO, cameraPosition - vWorld) < 0.0) nO = -nO; col += alb * orbLight(vWorld, nO, 0.4, ${reach.toFixed(1)}).rgb * ${k.toFixed(2)}; }\n        col = applyAir(col, vWorld) + orbScatter(vWorld);`);
  m.needsUpdate = true;
  return m;
}

export type Forest = ReturnType<typeof forestDone>;
function forestDone(o: {
  trees: THREE.InstancedMesh[];
  leafy: THREE.ShaderMaterial;
  stone: THREE.BufferGeometry;
  rock: THREE.BufferGeometry;
  rockMat: THREE.ShaderMaterial;
  roots: THREE.BufferGeometry;
  shrooms: THREE.BufferGeometry;
  glows: Halo[];
  beams: Beam[];
  ferns: Fern[];
}) {
  return o;
}

// Made a piece at a time (worlds/Worlds.tsx prepares it while home is flown).
export function* forestSteps(mobile: boolean, budget: number): Generator<void, Forest, void> {
  let t0 = performance.now();
  const lap = function* () {
    if (performance.now() - t0 > budget) {
      yield;
      t0 = performance.now();
    }
  };
  const r = rng(1906);
  const few = mobile ? 0.45 : 1;
  const g = floorAt;

  // ---- the trees: tall pines and spruces, a few broad ones low in the clearing's edge; nearest the way the finest
  const lists: Record<string, Crown[]> = {};
  const add = (kind: string, c: Crown) => (lists[kind] ??= []).push(c);
  const N = Math.round(560 * few);
  for (let i = 0, made = 0; i < N * 6 && made < N; i++) {
    const x = (r() * 2 - 1) * 460;
    const z = CAVE_Z[0] + r() * (CAVE_Z[1] - CAVE_Z[0]);
    if (!inside(x, z, 20) || clear(x, z, pathX)) continue;
    // (thicker near the way, so it is flown through a wood, not over a lawn)
    const near = Math.abs(x - pathX(z));
    if (near > 140 && r() < 0.45) continue;
    const kindR = r();
    const kind = kindR < 0.55 ? "pine" : kindR < 0.88 ? "spruce" : "broad";
    // a tree here is 40 to 75 m tall: the scale of a wood that a giant stands in
    const sc = kind === "broad" ? 2.2 + r() * 1.2 : 2.8 + r() * 1.8;
    const rich = near < 110 && !mobile ? "r" : "c";
    add(`${kind}${made % 2}${rich}`, { p: [x, g(x, z) - 0.6, z], r: sc * 5, h: 1 + r() * 0.15, seed: r() });
    made++;
    yield* lap();
  }
  // ferns: low and thick along the way and round the clearing's edge (real fronds: friendship/ferns.ts)
  const ferns: Fern[] = [];
  const NF = Math.round(1000 * few);
  for (let i = 0, made = 0; i < NF * 4 && made < NF; i++) {
    const z = -120 + r() * 1000;
    const x = pathX(z) + (r() * 2 - 1) * (40 + r() * 260);
    if (!inside(x, z, 10)) continue;
    if (Math.abs(x - pathX(z)) < 7) continue;
    ferns.push({ p: [x, g(x, z) - 0.2, z], s: 1.6 + Math.pow(r(), 1.5) * 3.2, yaw: r() * 6.283 });
    made++;
  }
  yield* lap();
  const leaves = makeLeafTexture();
  const leafy = withOrb(makeLeafyMaterial(leaves, { lit: [1.05, 1.1, 0.7], shade: [0.8, 1.05, 0.8] }), 1.4, 150);
  const trees: THREE.InstancedMesh[] = [];
  for (const [key, list] of Object.entries(lists)) {
    const kind = key.replace(/[0-9].*$/, "") as "pine" | "spruce" | "broad" | "bush";
    const v = +key.replace(/^[a-z]+/, "")[0];
    const rich = key.endsWith("r") ? 1 : 0;
    trees.push(leafyMesh(list, buildTree(kind, v, rich), leafy));
    yield* lap();
  }

  // ---- stones: mossy, half sunk, in drifts along the way and round her feet
  const stones: { p: V3; r: number; seed: number; col?: V3 }[] = [];
  for (let i = 0; i < Math.round(260 * few); i++) {
    const z = -200 + r() * 1150;
    const x = pathX(z) + (r() * 2 - 1) * (25 + r() * 300);
    if (!inside(x, z, 10) || Math.abs(x - pathX(z)) < 10) continue;
    const s = 1.2 + Math.pow(r(), 2.5) * 9;
    stones.push({ p: [x, g(x, z), z], r: s, seed: r(), col: [0.07 + r() * 0.03, 0.11 + r() * 0.04, 0.06] });
  }
  // the ledges she rises out of: great mossed rocks under the fall of her robe
  for (let i = 0; i < 26; i++) {
    const x = 20 + r() * 170;
    const z = -30 + r() * 60;
    const big = 1 - Math.abs(x - 110) / 110;
    stones.push({ p: [x, g(x, z) + 6 + big * 14, z], r: 14 + r() * 14 + big * 22, seed: r(), col: [0.05, 0.075, 0.05] });
  }
  const stone = boulderGeometry(stones);
  yield* lap();

  // ---- rock: the arch the way goes under, a second fallen across the clearing's far side, and ledges
  const k = new Kit();
  const rockLo: V3 = [0.03, 0.05, 0.04];
  const rockHi: V3 = [0.09, 0.12, 0.07];
  const ay = g(ARCH.x, ARCH.z);
  k.add(archGeometry(58, 62, 16, 22), [ARCH.x, ay - 2, ARCH.z], rockLo, { top: rockHi, rot: [0, 0.06, 0] });
  k.add(archGeometry(90, 70, 22, 30), [-170, g(-170, -60) - 4, -60], rockLo, { top: rockHi, rot: [0, 0.9, 0] });
  k.add(archGeometry(70, 55, 18, 26), [210, g(210, 160) - 4, 160], rockLo, { top: rockHi, rot: [0, -1.1, 0] });
  const rockMat = makeTempera({ amb: 1.1, key: 0.35, strata: 0.8, grain: 1.0, ao: 0.6, aoH: 40, rim: [0.04, 0.07, 0.05], rimPow: 3 });
  const rock = k.build();
  yield* lap();

  // ---- roots hanging from the vault, long and slack, swaying (their sway is in the shader: see the component)
  const rk = new Kit();
  const NR = Math.round(160 * few);
  for (let i = 0; i < NR; i++) {
    const z = -300 + r() * 1100;
    const x = (r() * 2 - 1) * caveAt(z).w * 0.75;
    const top = caveAt(z).top * (0.86 + r() * 0.1);
    const len = 80 + r() * 220;
    const pts: V3[] = [];
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      pts.push([x + Math.sin(t * 3 + i) * 3 * t, top - len * t, z + Math.cos(t * 2.3 + i) * 3 * t]);
    }
    // (never down into the way)
    if (top - len < 60 && Math.abs(x - pathX(z)) < 30) continue;
    rk.tube(pts, 0.5 + r() * 1.3, [0.03, 0.035, 0.025], { seg: 10, sides: 5, top: [0.05, 0.06, 0.04] });
  }
  const roots = rk.build();
  yield* lap();

  // ---- small glowing mushrooms in clusters on the floor, in the hollows and at the trees' feet
  const mk = new Kit();
  const glows: Halo[] = [];
  const NM = Math.round(120 * few);
  for (let c = 0; c < NM; c++) {
    const z = -100 + r() * 1000;
    const x = pathX(z) + (r() * 2 - 1) * (15 + r() * 200);
    if (!inside(x, z, 10) || Math.abs(x - pathX(z)) < 6) continue;
    const teal = r() < 0.6;
    const col: V3 = teal ? [0.3, 0.9, 0.75] : [1.0, 0.72, 0.3];
    for (let j = 0; j < 3 + Math.floor(r() * 5); j++) {
      const mx = x + (r() - 0.5) * 6;
      const mz = z + (r() - 0.5) * 6;
      const s = 0.6 + r() * 1.6;
      const at: V3 = [mx, g(mx, mz) - 0.05, mz];
      mk.lathe(
        [
          [0.13, 0],
          [0.1, 0.6],
          [0.02, 0.6],
        ],
        at,
        [0.16, 0.18, 0.14],
        { seg: 7, scale: [s, s, s] },
      );
      mk.lathe(
        [
          [0.08, 0.56],
          [0.55, 0.6],
          [0.48, 0.76],
          [0.0, 0.84],
        ],
        at,
        col,
        { seg: 9, scale: [s, s, s], glow: 1.3 },
      );
    }
    glows.push({ p: [x, g(x, z) + 1.6, z], size: 7, col, k: 0.18 });
  }
  const shrooms = mk.build();
  yield* lap();

  // ---- shafts of light from far above, falling through the trees to the floor
  const beams: Beam[] = [];
  for (let i = 0; i < Math.round(26 * few); i++) {
    const z = -250 + r() * 1100;
    const x = (r() * 2 - 1) * caveAt(z).w * 0.6;
    beams.push({ foot: [x, g(x, z), z], len: 420, w: 6 + r() * 14, k: 0.5 + r() * 0.6 });
  }
  // and the one that stands behind her, as in the picture's top
  beams.push({ foot: [60, g(60, -60), -60], len: 420, w: 26, k: 0.7 });
  void ORB;
  return forestDone({ trees, leafy, stone, rock, rockMat, roots, shrooms, glows, beams, ferns });
}
