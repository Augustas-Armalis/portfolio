import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildTree, makeLeafTexture } from "../../home/trees";
import { Kit, makeTempera, noise2, rng, type Halo, type V3 } from "../kit";
import { leafyMesh, makeLeafyMaterial, type Beam, type Crown } from "../fairy/shared";
import { FRIEND_U, GLSL_ORB } from "./cave";
import type { Fern } from "./ferns";
import { CAVE_Z, FRIEND_PATH, HALL, HER_K, ORB, PILLARS, TUNNEL, caveAt, clear, floorAt, herAt, tunnelX } from "./shape";

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
// Mossed rocks, worn: a fine sphere pushed out by several scales of lumps (broad swellings, ledges of strata, small
// pits), flattened below and sunk, dark at the foot and mossed on top. Big ones are finer.
function mossRocks(list: { p: V3; r: number; seed: number; col?: V3 }[], mobile: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const v = new THREE.Vector3();
  for (const b of list) {
    const detail = b.r > 12 ? (mobile ? 2 : 3) : mobile ? 1 : 2;
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute("uv").deleteAttribute("normal"));
    const p = g.attributes.position;
    const c = new Float32Array(p.count * 4);
    const base = b.col ?? [0.07, 0.1, 0.06];
    const sd = b.seed * 17;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const a = Math.atan2(v.z, v.x);
      let lump = 1 + 0.2 * (noise2(v.x * 1.6 + sd, v.z * 1.6 + v.y) - 0.5) * 2;
      lump += 0.08 * (noise2(a * 2.2 + sd, v.y * 3.5) - 0.5) * 2;
      // strata: shallow ledges across the stone
      lump += 0.05 * Math.sin(v.y * 9 + noise2(a * 1.3, sd) * 3);
      lump += 0.03 * (noise2(a * 7 + sd, v.y * 9) - 0.5) * 2;
      const y = v.y * 0.62 - 0.2;
      p.setXYZ(i, b.p[0] + v.x * b.r * lump * 1.2, b.p[1] + y * b.r * lump, b.p[2] + v.z * b.r * lump);
      // moss on the tops, dark rock at the foot and in the ledges
      const t = v.y * 0.5 + 0.5;
      const moss = Math.max(0, Math.min(1, (v.y - 0.15) * 2.2 + (noise2(a * 3 + sd, v.y * 4) - 0.5)));
      const r0 = [0.05, 0.055, 0.045];
      const m0 = [base[0] * 1.6, base[1] * 1.9, base[2] * 1.2];
      for (let k = 0; k < 3; k++) c[i * 4 + k] = (r0[k] + (m0[k] - r0[k]) * moss) * (0.45 + 0.8 * t);
      c[i * 4 + 3] = 0;
    }
    g.setAttribute("aCol", new THREE.BufferAttribute(c, 4));
    g.computeVertexNormals();
    parts.push(g);
  }
  const out = mergeGeometries(parts)!;
  parts.forEach((q) => q.dispose());
  out.computeBoundingSphere();
  return out;
}

// One of the cavern's pillars: a column the water built, as thick as a hill, spreading wide at its foot and again
// where it meets the vault, fluted and lumped all the way up.
function pillarGeometry(r: number, h: number, seed: number, sides: number, rings: number, drift = 1) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    // (rings closer together near the foot, where it is seen)
    const y = h * Math.pow(t, 1.5);
    const ty = y / h;
    const rr = r * (1 + 2.1 * Math.exp(-ty / 0.05) + 1.7 * Math.exp(-(1 - ty) / 0.09) + 0.12 * Math.sin(ty * 21 + seed));
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const flute = 0.1 * Math.sin(a * 9 + noise2(a * 1.3 + seed, y * 0.003) * 4);
      const lump = 0.3 * (noise2(a * 1.5 + seed * 3, y * 0.0045) - 0.5) * 2 + 0.1 * (noise2(a * 4 + seed, y * 0.014) - 0.5) * 2;
      const rad = rr * (1 + flute + lump);
      pos.push(Math.cos(a) * rad + 40 * drift * Math.sin(ty * 2.4 + seed) * ty, y, Math.sin(a) * rad + 30 * drift * Math.cos(ty * 1.9 + seed * 2) * ty);
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < sides; i++) {
      const a = j * sides + i;
      const b = j * sides + ((i + 1) % sides);
      idx.push(a, a + sides, b, b, a + sides, b + sides);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
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

export type Fall = { x: number; z: number; top: number; foot: number; w: number };
export type Forest = ReturnType<typeof forestDone>;
function forestDone(o: {
  trees: THREE.InstancedMesh[];
  leafy: THREE.ShaderMaterial;
  stone: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  rock: THREE.BufferGeometry;
  rockMat: THREE.ShaderMaterial;
  roots: THREE.BufferGeometry;
  shrooms: THREE.BufferGeometry;
  glows: Halo[];
  beams: Beam[];
  ferns: Fern[];
  falls: Fall[];
  tunnelLights: { p: V3; col: V3 }[];
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
  const inHall = (z: number) => z > HALL.z1 - 20;

  // ---- the trees. In the hall of fog a wood the way goes under: pines and spruces forty to seventy metres tall.
  // In the cavern an old forest, its trees twice that, standing thick under the way for a quarter of a mile to
  // either side: the plane flies over their tops, and she stands in them to her waist.
  const lists: Record<string, Crown[]> = {};
  const add = (kind: string, c: Crown) => (lists[kind] ??= []).push(c);
  const N = Math.round(760 * few);
  for (let i = 0, made = 0; i < N * 8 && made < N; i++) {
    const hall = r() < 0.3;
    const z = hall ? HALL.z1 - 20 + r() * (TUNNEL.z0 - HALL.z1) : -1750 + r() * (HALL.z1 + 1750);
    const x = hall ? (r() * 2 - 1) * 200 : pathX(z) + (r() * 2 - 1) * 460;
    if (!inside(x, z, 20) || clear(x, z, pathX)) continue;
    const kindR = r();
    const kind = kindR < 0.5 ? "pine" : kindR < 0.86 ? "spruce" : "broad";
    const old = hall ? 1 : 1.75 + r() * 0.5;
    const sc = (kind === "broad" ? 2.2 + r() * 1.2 : 2.8 + r() * 1.8) * old;
    const rich = hall && Math.abs(x - pathX(z)) < 110 && !mobile ? "r" : "c";
    add(`${kind}${made % 2}${rich}`, { p: [x, g(x, z) - 0.6, z], r: sc * 5, h: 1 + r() * 0.15, seed: r() });
    made++;
    yield* lap();
  }
  // ferns: low and thick along the way through the hall (real fronds: friendship/ferns.ts); the cavern has none,
  // nothing there is small
  const ferns: Fern[] = [];
  const NF = Math.round(800 * few);
  for (let i = 0, made = 0; i < NF * 4 && made < NF; i++) {
    const z = HALL.z1 - 40 + r() * (TUNNEL.z0 + 40 - HALL.z1);
    const x = pathX(z) + (r() * 2 - 1) * (30 + r() * 150);
    if (!inside(x, z, 10)) continue;
    if (Math.abs(x - pathX(z)) < 7) continue;
    ferns.push({ p: [x, g(x, z) - 0.2, z], s: 1.6 + Math.pow(r(), 1.5) * 3.2, yaw: r() * 6.283 });
    made++;
  }
  yield* lap();
  const leaves = makeLeafTexture();
  const leafy = withOrb(makeLeafyMaterial(leaves, { lit: [1.05, 1.1, 0.7], shade: [0.8, 1.05, 0.8] }), 1.4, 900);
  const trees: THREE.InstancedMesh[] = [];
  for (const [key, list] of Object.entries(lists)) {
    const kind = key.replace(/[0-9].*$/, "") as "pine" | "spruce" | "broad" | "bush";
    const v = +key.replace(/^[a-z]+/, "")[0];
    const rich = key.endsWith("r") ? 1 : 0;
    trees.push(leafyMesh(list, buildTree(kind, v, rich), leafy));
    yield* lap();
  }
  // the rest of the forest, out to the cavern's walls: the same trees as shapes only (a cone on a stem), which is
  // all the haze leaves of them
  const fk = new Kit();
  const NFar = Math.round(2600 * few);
  for (let i = 0, made = 0; i < NFar * 5 && made < NFar; i++) {
    const z = -2500 + r() * (HALL.z1 + 2400);
    const x = (r() * 2 - 1) * 1450;
    if (!inside(x, z, 60) || clear(x, z, pathX) || Math.abs(x - pathX(z)) < 440) continue;
    const h = 80 + r() * 90;
    const rad = h * (0.13 + r() * 0.07);
    const y = g(x, z);
    const dark = 0.7 + r() * 0.5;
    fk.add(new THREE.ConeGeometry(rad, h * 0.84, 6, 1, true), [x, y + h * 0.58, z], [0.022 * dark, 0.05 * dark, 0.036 * dark], { top: [0.05 * dark, 0.1 * dark, 0.05 * dark] });
    made++;
  }
  const far = fk.build();
  yield* lap();

  // ---- stones: mossy, half sunk, in drifts along the way through the hall
  const stones: { p: V3; r: number; seed: number; col?: V3 }[] = [];
  for (let i = 0; i < Math.round(150 * few); i++) {
    const z = HALL.z1 - 30 + r() * (TUNNEL.z0 - HALL.z1);
    const x = pathX(z) + (r() * 2 - 1) * (25 + r() * 160);
    if (!inside(x, z, 10) || Math.abs(x - pathX(z)) < 10) continue;
    const s = 1.2 + Math.pow(r(), 2.5) * 9;
    stones.push({ p: [x, g(x, z), z], r: s, seed: r(), col: [0.07 + r() * 0.03, 0.11 + r() * 0.04, 0.06] });
  }
  // the ledges she rises out of: mossed rocks the size of hills under the fall of her robe
  for (let i = 0; i < 30; i++) {
    const at = herAt(20 + r() * 230, 0, -80 + r() * 70 + (r() < 0.3 ? 90 : 0));
    const big = 1 - Math.abs(at[0] - herAt(120, 0, 0)[0]) / (120 * HER_K);
    stones.push({ p: [at[0], g(at[0], at[2]) + (5 + big * 12) * HER_K, at[2]], r: (13 + r() * 13 + Math.max(0, big) * 20) * HER_K, seed: r(), col: [0.05, 0.075, 0.05] });
  }
  // and great fallen blocks here and there on the cavern's floor, at the feet of the pillars
  for (const p of PILLARS)
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.283;
      const d = p[2] * (1.6 + r() * 1.6);
      const x = p[0] + Math.cos(a) * d;
      const z = p[1] + Math.sin(a) * d;
      stones.push({ p: [x, g(x, z) + 4, z], r: 22 + r() * 46, seed: r(), col: [0.045, 0.07, 0.048] });
    }
  const stone = mossRocks(stones, mobile);
  yield* lap();

  // ---- rock: the pillars, and the stone that hangs from the vault
  const k = new Kit();
  const rockLo: V3 = [0.03, 0.05, 0.04];
  const moss: V3 = [0.1, 0.15, 0.06];
  PILLARS.forEach((p, n) => {
    const h = caveAt(p[1]).top * 1.02;
    k.add(pillarGeometry(p[2], h, n * 2.7 + 1, mobile ? 16 : 24, mobile ? 22 : 34), [p[0], g(p[0], p[1]) - 30, p[1]], rockLo, { top: [0.05, 0.075, 0.06] });
  });
  // (stalactites: long teeth of stone, the longest of them hundreds of metres, none over her or over the way)
  const NS = Math.round(90 * few);
  for (let i = 0; i < NS; i++) {
    const z = -2400 + r() * (HALL.z1 + 2300);
    const c = caveAt(z);
    const x = (r() * 2 - 1) * c.w * 0.8;
    const len = 140 + Math.pow(r(), 1.8) * 620;
    const rad = len * (0.05 + r() * 0.05);
    const top = c.top * (0.9 - 0.25 * Math.pow(Math.abs(x) / Math.max(c.w, 1), 2));
    const nearWay = Math.abs(x - pathX(z)) < 200 && top - len < 560;
    const overHer = x > herAt(-40, 0, 0)[0] && x < herAt(330, 0, 0)[0] && z > ORB.z - 520 && z < ORB.z + 420;
    if (nearWay || overHer) continue;
    k.add(new THREE.ConeGeometry(rad, len, 7, 3), [x, top - len / 2 + 12, z], rockLo, { top: moss, rot: [Math.PI, r() * 6.283, 0] });
  }
  // (and in the hall of fog smaller ones, close overhead)
  for (let i = 0; i < Math.round(36 * few); i++) {
    const z = HALL.z1 + r() * (TUNNEL.z0 - 60 - HALL.z1);
    const c = caveAt(z);
    const x = (r() * 2 - 1) * c.w * 0.7;
    const len = 16 + r() * 50;
    if (Math.abs(x - pathX(z)) < 24 && c.top * 0.8 - len < 60) continue;
    k.add(new THREE.ConeGeometry(len * 0.12, len, 6, 2), [x, c.top * 0.86 - len / 2, z], rockLo, { rot: [Math.PI, r() * 6.283, 0] });
  }
  // (and in the tunnel a few small ones, dark, along the roof)
  for (let i = 0; i < Math.round(34 * few); i++) {
    const z = TUNNEL.z0 + 8 + r() * (CAVE_Z[1] - 30 - TUNNEL.z0);
    const c = caveAt(z);
    const off = (r() * 2 - 1) * c.w * 0.72;
    const x = tunnelX(z) + off;
    // (short where the roof is low, and none right over the way)
    const len = Math.min(0.8 + Math.pow(r(), 2) * 5.5, Math.max(0.8, (c.top - 22) * 0.45));
    const roof = c.top * 0.34 + c.top * 0.66 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(off) / c.w, 1.28)), 0.78);
    if (Math.abs(off) < 4.5) continue;
    k.add(new THREE.ConeGeometry(len * (0.1 + r() * 0.08), len, 6, 2), [x, roof - len / 2 + 0.9, z], [0.022, 0.02, 0.021], { rot: [Math.PI + (r() - 0.5) * 0.12, r() * 6.283, (r() - 0.5) * 0.12] });
  }
  // (in the tunnel, too: a few columns where a stalactite has come down to the floor, close to the walls, and
  // blocks fallen from the roof lying at the walls' feet; the middle of the passage is clear)
  // (the owner finds the thin standing columns read as goblets or bones: none in the tunnel)
  ([] as number[]).forEach((z, n) => {
    const c = caveAt(z);
    if (c.w < 17) return;
    const sd = n % 2 ? 1 : -1;
    const off = sd * (c.w - 5.5);
    const x = tunnelX(z) + off;
    const roof = c.top * 0.34 + c.top * 0.66 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(off) / c.w, 1.28)), 0.78);
    k.add(pillarGeometry(1.5 + (n % 3) * 0.45, roof + 5, n * 3.1 + 2, 12, 16, 0.03), [x, g(x, z) - 2, z], [0.03, 0.027, 0.027]);
  });
  for (let i = 0; i < 11; i++) {
    const z = TUNNEL.z0 + 14 + ((i * 53.7) % (CAVE_Z[1] - 60 - TUNNEL.z0));
    const c = caveAt(z);
    const sd = i % 2 ? 1 : -1;
    const sz = 1.5 + ((i * 7) % 5) * 0.55;
    const x = tunnelX(z) + sd * Math.max(7.5, c.w - 3 - sz * 1.2);
    k.add(new THREE.DodecahedronGeometry(1, 0), [x, g(x, z) + sz * 0.3, z], [0.034, 0.03, 0.03], { rot: [i * 1.3, i * 2.1, i * 0.7], scale: [sz * 1.35, sz * 0.8, sz], flat: true });
  }
  const rock = k.build();
  const rockMat = withOrb(makeTempera({ amb: 1.1, key: 0.35, strata: 0.8, grain: 1.0, ao: 0.6, aoH: 220, rim: [0.04, 0.07, 0.05], rimPow: 3 }), 1.0, 1100);
  yield* lap();

  // ---- roots hanging from the vault: the roots of whatever grows on the mountain above, as thick as trees, long
  // and slack, swaying (their sway is in the shader: see the component)
  const rk = new Kit();
  const NR = Math.round(150 * few);
  for (let i = 0; i < NR; i++) {
    const hall = r() < 0.25;
    const z = hall ? HALL.z1 + r() * (TUNNEL.z0 - 40 - HALL.z1) : -2300 + r() * (HALL.z1 + 2300);
    const c = caveAt(z);
    const x = (r() * 2 - 1) * c.w * 0.75;
    const top = c.top * (0.86 + r() * 0.1);
    const len = hall ? 40 + r() * 110 : 260 + r() * 900;
    const rad = hall ? 0.5 + r() * 1.2 : 2.2 + r() * 6;
    const pts: V3[] = [];
    for (let q = 0; q <= 7; q++) {
      const t = q / 7;
      const wob = hall ? 3 : 26;
      pts.push([x + Math.sin(t * 3 + i) * wob * t, top - len * t, z + Math.cos(t * 2.3 + i) * wob * t]);
    }
    // (never down into the way, and none through her, her crown, or the air before her face and the orb)
    if (top - len < (hall ? 60 : 620) && Math.abs(x - pathX(z)) < (hall ? 30 : 240)) continue;
    if (x > herAt(-90, 0, 0)[0] && x < herAt(420, 0, 0)[0] && z > ORB.z - 700 && z < ORB.z + 560) continue;
    rk.tube(pts, rad, [0.03, 0.035, 0.025], { seg: 12, sides: 5, top: [0.05, 0.06, 0.04] });
  }
  const roots = rk.build();
  yield* lap();

  // ---- what glows. In the hall small mushrooms in clusters at the trees' feet and along the way. In the cavern
  // fungi as tall as houses, standing in groves among the trees and climbing the pillars' feet, and crystals:
  // sheaves of long six-sided spars, teal and gold, alight from within.
  const mk = new Kit();
  const glows: Halo[] = [];
  const shroom = (at: V3, s: number, col: V3, glow: number) => {
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
        [0.5, 0.74],
        [0.3, 0.9],
        [0.0, 0.97],
      ],
      at,
      col,
      { seg: 9, scale: [s, s, s], glow },
    );
  };
  const NM = Math.round(90 * few);
  const lane: [number, number][] = [];
  for (let z = TUNNEL.z0 - 60, sd = 1; z > HALL.z1; z -= 24, sd = -sd) lane.push([pathX(z) + sd * (13 + r() * 6), z]);
  for (let c = 0; c < NM + lane.length; c++) {
    const onLane = c >= NM;
    const z = onLane ? lane[c - NM][1] : HALL.z1 - 20 + r() * (TUNNEL.z0 - HALL.z1);
    const x = onLane ? lane[c - NM][0] : pathX(z) + (r() * 2 - 1) * (15 + r() * 160);
    if (!inside(x, z, 10) || Math.abs(x - pathX(z)) < 6) continue;
    const teal = r() < 0.6;
    const col: V3 = teal ? [0.3, 0.9, 0.75] : [1.0, 0.72, 0.3];
    for (let j = 0; j < 3 + Math.floor(r() * 5); j++) {
      const mx = x + (r() - 0.5) * 6;
      const mz = z + (r() - 0.5) * 6;
      shroom([mx, g(mx, mz) - 0.05, mz], 0.6 + r() * 1.6, col, 1.3);
    }
    glows.push({ p: [x, g(x, z) + 1.6, z], size: 7, col, k: 0.18 });
  }
  // (a few in the tunnel too, at the feet of its walls: the first light met on the way in; the rock near each
  // takes a little of it: see the cave's material)
  const tunnelLights: { p: V3; col: V3 }[] = [];
  for (let c = 0; c < Math.round(9 * few); c++) {
    const z = TUNNEL.z0 + 20 + r() * (CAVE_Z[1] - 70 - TUNNEL.z0);
    const sd = r() < 0.5 ? -1 : 1;
    const x = tunnelX(z) + sd * (Math.min(caveAt(z).w, TUNNEL.half) * (0.5 + r() * 0.26));
    const col: V3 = r() < 0.6 ? [0.3, 0.9, 0.75] : [1.0, 0.72, 0.3];
    for (let j = 0; j < 3 + Math.floor(r() * 4); j++) {
      const mx = x + (r() - 0.5) * 3;
      const mz = z + (r() - 0.5) * 4;
      shroom([mx, g(mx, mz) - 0.05, mz], 0.4 + r() * 0.9, col, 1.3);
    }
    glows.push({ p: [x, g(x, z) + 1.0, z], size: 5, col, k: 0.2 });
    tunnelLights.push({ p: [x, g(x, z) + 1.2, z], col });
  }
  const groves = Math.round(70 * few);
  for (let c = 0; c < groves; c++) {
    const z = -2100 + r() * (HALL.z1 + 2000);
    const x = (r() * 2 - 1) * 1100;
    if (!inside(x, z, 80) || clear(x, z, pathX)) continue;
    const teal = r() < 0.62;
    const col: V3 = teal ? [0.25, 0.8, 0.68] : [0.95, 0.66, 0.26];
    const n = 3 + Math.floor(r() * 5);
    for (let j = 0; j < n; j++) {
      const mx = x + (r() - 0.5) * 110;
      const mz = z + (r() - 0.5) * 110;
      // (dark domes from above, the plane's side of them; their light is under them, on the mist)
      shroom([mx, g(mx, mz) - 1, mz], 22 + r() * 46, [0.03 + col[0] * 0.07, 0.04 + col[1] * 0.07, 0.035 + col[2] * 0.07], 0.1);
    }
    glows.push({ p: [x, g(x, z) + 22, z], size: 170, col, k: 0.09 });
  }
  const sheaves = Math.round(46 * few);
  for (let c = 0; c < sheaves; c++) {
    // (most of them at the feet of the pillars and along the walls)
    const p = PILLARS[c % PILLARS.length];
    const a = r() * 6.283;
    const atP = r() < 0.6;
    const x = atP ? p[0] + Math.cos(a) * p[2] * (1.5 + r() * 1.2) : (r() * 2 - 1) * 1150;
    const z = atP ? p[1] + Math.sin(a) * p[2] * (1.5 + r() * 1.2) : -2100 + r() * 2200;
    if (!inside(x, z, 60) || Math.abs(x - pathX(z)) < 120) continue;
    const teal = r() < 0.55;
    const col: V3 = teal ? [0.22, 0.75, 0.72] : [1.0, 0.72, 0.28];
    const n = 4 + Math.floor(r() * 5);
    for (let j = 0; j < n; j++) {
      const len = 26 + r() * 74;
      const rad = len * (0.07 + r() * 0.04);
      const tilt: V3 = [(r() - 0.5) * 1.1, r() * 6.283, (r() - 0.5) * 1.1];
      const at: V3 = [x + (r() - 0.5) * 30, g(x, z) + len * 0.3, z + (r() - 0.5) * 30];
      mk.add(new THREE.CylinderGeometry(rad * 0.82, rad, len * 0.78, 6, 1), at, [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6], { glow: 0.3, rot: tilt, flat: true });
      const up = new THREE.Vector3(0, len * 0.39 + len * 0.11, 0).applyEuler(new THREE.Euler(...tilt));
      mk.add(new THREE.ConeGeometry(rad * 0.82, len * 0.22, 6, 1), [at[0] + up.x, at[1] + up.y, at[2] + up.z], [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], { glow: 0.45, rot: tilt, flat: true });
    }
    glows.push({ p: [x, g(x, z) + 46, z], size: 170, col, k: 0.11 });
  }
  const shrooms = mk.build();
  yield* lap();

  // ---- shafts of light from cracks far above, falling the whole height of the cavern to its floor; thin ones in
  // the hall
  const beams: Beam[] = [];
  for (let i = 0; i < Math.round(40 * few); i++) {
    const z = -2300 + r() * (HALL.z1 + 2200);
    const x = (r() * 2 - 1) * caveAt(z).w * 0.62;
    beams.push({ foot: [x, g(x, z), z], len: 1650, w: 16 + r() * 60, k: 0.45 + r() * 0.6 });
  }
  for (let i = 0; i < Math.round(9 * few); i++) {
    const z = HALL.z1 + r() * (TUNNEL.z0 - 80 - HALL.z1);
    const x = (r() * 2 - 1) * caveAt(z).w * 0.6;
    beams.push({ foot: [x, g(x, z), z], len: 230, w: 5 + r() * 9, k: 0.5 + r() * 0.5 });
  }
  // and the one that stands behind her, as in the picture's top
  const hb = herAt(60, 0, -60);
  beams.push({ foot: [hb[0], g(hb[0], hb[2]), hb[2]], len: 1650, w: 70, k: 0.7 });

  // ---- water falling: down the sides of four of the pillars from high in the haze, into mist
  const falls: Fall[] = [0, 2, 4, 6, 9].map((n) => {
    const p = PILLARS[n];
    // (on the side of it that faces the way)
    const s = p[0] < 0 ? 1 : -1;
    const x = p[0] + s * p[2] * 1.12;
    return { x, z: p[1] + p[2] * 0.3, top: 620 + ((n * 97) % 360), foot: g(x, p[1]) - 4, w: 26 + ((n * 13) % 30) };
  });
  return forestDone({ trees, leafy, stone, far, rock, rockMat, roots, shrooms, glows, beams, ferns, falls, tunnelLights });
}
