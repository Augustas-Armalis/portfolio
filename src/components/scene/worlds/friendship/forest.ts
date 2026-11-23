import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildTree, makeLeafTexture } from "../../home/trees";
import { Kit, makeTempera, noise2, rng, type Halo, type V3 } from "../kit";
import { leafyMesh, makeLeafyMaterial, type Beam, type Crown } from "../fairy/shared";
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
// A natural arch of worn rock (in place of a cut one): a thick band of stone bent over the way, heavier at its feet,
// its section a rounded lump that the water has worn, ridged in strata and pitted, sunk into the floor at both ends.
// `w` the outer width, `h` the height, `t` the band's thickness, `depth` its depth along the way.
function wornArch(w: number, h: number, t: number, depth: number, seed: number, seg = 56, sides = 20) {
  const a = (w - t) / 2;
  const b = h - t / 2;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    // (from a little under the floor on one side, over, to under it on the other)
    const th = -0.12 + (Math.PI + 0.24) * (i / seg);
    const cx = -Math.cos(th) * a;
    const cy = Math.sin(th) * b;
    // the frame: across the band in the arch's plane, and along the way
    let nx = -Math.cos(th) / a;
    let ny = Math.sin(th) / b;
    const nl = Math.hypot(nx, ny);
    nx /= nl;
    ny /= nl;
    const up = Math.sin(Math.max(0, th) );
    const feet = 1 + 0.55 * (1 - Math.min(1, up * 1.4));
    for (let j = 0; j < sides; j++) {
      const ph = (j / sides) * Math.PI * 2;
      const u = Math.cos(ph);
      const v = Math.sin(ph);
      // worn: broad swellings, strata across the band, small pits
      const q = i / seg;
      let r = 1 + 0.22 * (noise2(q * 6 + seed, ph * 0.9 + seed * 3) - 0.5) + 0.1 * (noise2(q * 22 + seed * 2, ph * 2.3) - 0.5) + 0.05 * Math.sin((cy + v * depth * 0.3) * 0.9 + noise2(q * 9, ph) * 3);
      r *= feet;
      const rx = (t / 2) * r;
      const rz = (depth / 2) * r * (0.9 + 0.2 * noise2(q * 4 + 7, seed));
      pos.push(cx + nx * u * rx, cy + ny * u * rx, v * rz);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < sides; j++) {
      const p0 = i * sides + j;
      const p1 = i * sides + ((j + 1) % sides);
      const p2 = p0 + sides;
      const p3 = p1 + sides;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
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

// A dressed stone gone old: a block with rounded arrises (a superellipsoid), its faces worn hollow and chipped.
function wornBlock(w: number, h: number, d: number, seed: number, detail = 3) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute("uv").deleteAttribute("normal"));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const e = 0.45;
  const sp = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), e);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const wear = 1 + 0.1 * (noise2(v.x * 2.5 + seed, v.y * 2.5 + v.z * 2) - 0.5) * 2 + 0.04 * (noise2(v.z * 8 + seed, v.x * 8) - 0.5) * 2;
    p.setXYZ(i, sp(v.x) * (w / 2) * wear, sp(v.y) * (h / 2) * wear, sp(v.z) * (d / 2) * wear);
  }
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
  const N = Math.round(820 * few);
  for (let i = 0, made = 0; i < N * 6 && made < N; i++) {
    const x = (r() * 2 - 1) * 680;
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
  const stone = mossRocks(stones, mobile);
  yield* lap();

  // ---- rock: the arch the way goes under, a second fallen across the clearing's far side, and ledges
  const glowsArch: Halo[] = [];
  const k = new Kit();
  const rockLo: V3 = [0.03, 0.05, 0.04];
  const ay = g(ARCH.x, ARCH.z);
  // (moss lies thick on their tops; small lights grow in their cracks)
  const moss: V3 = [0.12, 0.2, 0.07];
  const arches: [number, number, number, number, number, number, number][] = [
    [ARCH.x, ay - 2, ARCH.z, 0.06, 62, 64, 18],
    [-170, g(-170, -60) - 4, -60, 0.9, 92, 72, 24],
    [210, g(210, 160) - 4, 160, -1.1, 72, 57, 20],
  ];
  arches.forEach(([x, y, z, yaw, w, h, t], n) => {
    k.add(wornArch(w, h, t, t * 1.35, n * 3.7 + 1, mobile ? 36 : 56, mobile ? 12 : 20), [x, y, z], rockLo, { top: moss, rot: [0, yaw, 0] });
    for (let i = 0; i < 5; i++) {
      const th = 0.35 + (i / 4) * (Math.PI - 0.7);
      const lx = -Math.cos(th) * (w - t) * 0.5;
      const ly = Math.sin(th) * (h - t * 0.5) + t * 0.45;
      const col: V3 = i % 2 ? [0.3, 0.9, 0.75] : [1.0, 0.75, 0.35];
      glowsArch.push({ p: [x + lx * Math.cos(yaw), y + ly, z - lx * Math.sin(yaw)], size: 9, col, k: 0.14 });
    }
  });
  const rockMat = makeTempera({ amb: 1.1, key: 0.35, strata: 0.8, grain: 1.0, ao: 0.6, aoH: 40, rim: [0.04, 0.07, 0.05], rimPow: 3 });
  // someone lived here once: a ring of standing stones where the way comes out from under the arch, a sign cut in
  // each that still glows a little; and worn steps going up from the clearing to the rocks she rises from
  const stoneCol: V3 = [0.06, 0.07, 0.055];
  for (let i = 0; i < 7; i++) {
    const a = -1.15 + (i / 6) * 2.3;
    const z = ARCH.z - 70 - Math.cos(a) * 30;
    const x = pathX(z) + Math.sin(a) * 62;
    const h = 14 + r() * 9;
    const yaw = Math.atan2(pathX(z) - x, 0.0001) + (r() - 0.5) * 0.3;
    k.add(wornBlock(5 + r() * 2, h, 2.6 + r(), i * 5.3, mobile ? 2 : 3), [x, g(x, z) + h * 0.42, z], stoneCol, { top: moss, rot: [(r() - 0.5) * 0.12, yaw, (r() - 0.5) * 0.1] });
    glowsArch.push({ p: [x - Math.sin(a) * 2, g(x, z) + h * 0.62, z], size: 5.5, col: [0.35, 0.95, 0.8], k: 0.16 });
  }
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const x = 52 + t * 34;
    const z = 128 - t * 84;
    const top = g(52, 128) + 1 + t * 26;
    const slab = top - g(x, z) + 2;
    k.add(wornBlock(24 - t * 4, slab, 8, 40 + i, mobile ? 2 : 3), [x, g(x, z) + slab / 2 - 2, z], stoneCol, { top: [0.1, 0.12, 0.08], rot: [0, -0.38 + (r() - 0.5) * 0.08, 0] });
  }
  const rock = k.build();
  yield* lap();

  // ---- roots hanging from the vault, long and slack, swaying (their sway is in the shader: see the component)
  const rk = new Kit();
  const NR = Math.round(160 * few);
  for (let i = 0; i < NR; i++) {
    const z = -300 + r() * 1100;
    const x = (r() * 2 - 1) * caveAt(z).w * 0.75;
    const top = caveAt(z).top * (0.86 + r() * 0.1);
    const len = 120 + r() * 420;
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
  // (and a way of them: clusters along both sides of the path from the arch to her clearing, lighting it)
  const lane: [number, number][] = [];
  for (let z = ARCH.z - 30, s = 1; z > 110; z -= 24, s = -s) lane.push([pathX(z) + s * (13 + r() * 6), z]);
  for (let c = 0; c < NM + lane.length; c++) {
    const onLane = c >= NM;
    const z = onLane ? lane[c - NM][1] : -100 + r() * 1000;
    const x = onLane ? lane[c - NM][0] : pathX(z) + (r() * 2 - 1) * (15 + r() * 200);
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
    beams.push({ foot: [x, g(x, z), z], len: 780, w: 6 + r() * 14, k: 0.5 + r() * 0.6 });
  }
  // and the one that stands behind her, as in the picture's top
  beams.push({ foot: [60, g(60, -60), -60], len: 780, w: 26, k: 0.7 });
  void ORB;
  return forestDone({ trees, leafy, stone, rock, rockMat, roots, shrooms, glows: [...glows, ...glowsArch], beams, ferns });
}
