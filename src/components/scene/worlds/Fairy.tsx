"use client";

import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, cloudMesh, makeCloudMaterial, makeTempera, rng, type Cloud, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { WORLDS, groundAt } from "./voyage";

// Fairy Tale (Castle Fairy Tale, 1909). A mountain wound round by a road:
// a broad green terrace climbing in a spiral behind a red-brown wall, turn
// above turn, to three violet peaks with a small castle glowing among them
// like a lit lantern. A pale cobbled way falls from it down the right-hand
// slope. The sky is turquoise, set with small cream clouds in rows, and the
// sun stands low to the right in a fan of rays.

const def = WORLDS.fairy;
export const FAIRY_PAL: GroundPalette = { a: [0.06, 0.125, 0.04], b: [0.095, 0.145, 0.045], c: [0.045, 0.105, 0.055] };

// The mountain, measured from its own foot: the wall's rim climbs fifty metres
// a turn while it draws in, so rim after rim lies on the side of a cone.
export const MOUNT = { x: 0, z: -80, turns: 2.25, batter: 4.5, th0: 0 };
const WALL: V3 = [0.5, 0.17, 0.11];
const WALL_LOW: V3 = [0.17, 0.06, 0.1];
const RIM: V3 = [0.56, 0.3, 0.3];
const GREEN: V3 = [0.1, 0.22, 0.06];
const GREEN2: V3 = [0.3, 0.36, 0.09];
const ROAD: V3 = [0.6, 0.47, 0.34];
const SLOPE: V3 = [0.4, 0.42, 0.11];
const ROCK: V3 = [0.25, 0.13, 0.25];
const ROCK_LIT: V3 = [0.84, 0.5, 0.46];

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const thOf = (u: number) => MOUNT.th0 + u * Math.PI * 2;
// the wall's rim: its radius and height at u turns up the spiral
const rhoOf = (u: number) => {
  const r = 172 - 52 * u;
  return r + (44 - r) * sm(MOUNT.turns - 0.3, MOUNT.turns, u);
};
const rimOf = (u: number) => 30 + 50 * u;
// where the terrace of turn v meets the foot of the wall above it (v < 0: the slope the lowest wall stands on)
const innerOf = (v: number) => (v >= 0 ? rimOf(v) + 17.5 : 47.5 + 30 * v);
const footOf = (u: number) => innerOf(u - 1);
const INNER_R = 50;

type Pt = { p: THREE.Vector3; c: V3 };
// Lay strips of surface between successive cross-sections; each strip shades as one smooth sheet.
function loft(rings: Pt[][][]) {
  const parts: THREE.BufferGeometry[] = [];
  const strips = rings[0].length;
  for (let s = 0; s < strips; s++) {
    const m = rings[0][s].length;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    rings.forEach((ring, i) => {
      for (const q of ring[s]) {
        pos.push(q.p.x, q.p.y, q.p.z);
        col.push(q.c[0], q.c[1], q.c[2], 0);
      }
      if (i < rings.length - 1) for (let j = 0; j < m - 1; j++) idx.push(i * m + j, i * m + j + 1, (i + 1) * m + j, i * m + j + 1, (i + 1) * m + j + 1, (i + 1) * m + j);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  return parts;
}

// The wound mountain: for every step along the spiral, a cross-section from
// the foot of the next wall out across the green terrace and its winding road
// to the parapet, down the leaning wall, and (on the lowest turn) down the
// cobbled slope it stands on.
function spiral(mobile: boolean, foot: (x: number, z: number) => number) {
  const per = mobile ? 72 : 128;
  const n = Math.round(per * MOUNT.turns);
  const at = (u: number, r: number, y: number) => new THREE.Vector3(Math.cos(thOf(u)) * r, y, Math.sin(thOf(u)) * r);
  const rings: Pt[][][] = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * MOUNT.turns;
    const ro = rhoOf(u);
    // at its upper end the wall sinks into its own terrace and turns to the rock it runs into
    const end = sm(MOUNT.turns - 0.32, MOUNT.turns - 0.06, u);
    const rim = rimOf(u) - 2.5 * end;
    const yT = rimOf(u) - 2.5;
    const wallC = mix3(WALL, ROCK, end);
    const lowC = mix3(WALL_LOW, ROCK, end);
    const rimC = mix3(RIM, ROCK, end);
    const ri = u + 1 <= MOUNT.turns ? rhoOf(u + 1) + MOUNT.batter : INNER_R;
    const road = 0.5 + 0.3 * Math.sin(u * Math.PI * 2 * 2.5 + 0.6);
    const terrace: Pt[] = [];
    const M = 12;
    for (let j = 0; j <= M; j++) {
      const t = j / M; // 0 at the parapet, 1 at the foot of the wall above
      const r = ro - 2.6 + (ri + 0.4 - (ro - 2.6)) * t;
      const y = yT + 20 * Math.pow(t, 1.2);
      const patchy = 0.5 + 0.5 * Math.sin(u * 23 + t * 5) * Math.sin(u * 7.3 + t * 11 + 1.3);
      let c = mix3(GREEN2, GREEN, sm(0.0, 0.9, t) * 0.75 + patchy * 0.25);
      c = mix3(c, ROAD, 1 - sm(0.035, 0.085, Math.abs(t - road)));
      terrace.push({ p: at(u, r, y), c });
    }
    const f = footOf(u);
    const ground = u < 1 ? foot(Math.cos(thOf(u)) * (ro + 30), Math.sin(thOf(u)) * (ro + 30)) - 12 : f;
    const skirt: Pt[] = [];
    const drop = Math.max(0, f - ground);
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      // a slope that eases out toward the meadow
      skirt.push({ p: at(u, ro + MOUNT.batter + drop * (1.25 * t + 0.6 * t * t), f - drop * t), c: mix3(SLOPE, [0.13, 0.22, 0.07], t * 0.8 + 0.2 * Math.sin(u * 31)) });
    }
    rings.push([
      terrace,
      [
        { p: at(u, ro - 2.6, yT), c: mix3(rimC, lowC, 0.5) },
        { p: at(u, ro - 2.4, rim), c: rimC },
      ],
      [
        { p: at(u, ro - 2.4, rim), c: rimC },
        { p: at(u, ro - 1.2, rim + 0.5 * (1 - end)), c: mix3(rimC, [0.8, 0.5, 0.42], 0.6 * (1 - end)) },
        { p: at(u, ro + 0.3, rim), c: rimC },
      ],
      [
        { p: at(u, ro + 0.3, rim), c: mix3(wallC, rimC, 0.4) },
        { p: at(u, ro + 0.2, rim - 1.6), c: wallC },
        { p: at(u, ro + MOUNT.batter * 0.5, (rim + f) / 2), c: mix3(wallC, lowC, 0.45) },
        { p: at(u, ro + MOUNT.batter, f), c: lowC },
      ],
      skirt,
    ]);
  }
  const parts = loft(rings);
  // the wall's end where the road begins
  {
    const first = rings[0];
    const pos: number[] = [];
    const col: number[] = [];
    const edge = [...first[0]].reverse().concat(first[2]);
    for (let j = 0; j < edge.length - 1; j++) {
      const a = edge[j].p;
      const b2 = edge[j + 1].p;
      pos.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, a.x, -14, a.z, b2.x, b2.y, b2.z, b2.x, -14, b2.z, a.x, -14, a.z);
      for (let q = 0; q < 6; q++) col.push(...(q === 2 || q >= 4 ? WALL_LOW : WALL), 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
    g.computeVertexNormals();
    parts.push(g);
  }
  // the arcade: a row of tall pointed arches let into the wall, turn after turn
  {
    const pos: number[] = [];
    const col: number[] = [];
    const wallPt = (u: number, k: number, proud: number) => {
      const f = footOf(u);
      return at(u, rhoOf(u) + MOUNT.batter * (1 - k) + proud, f + k * (rimOf(u) - f));
    };
    const spacing = mobile ? 15 : 9.5;
    for (let u = 0.02; u < MOUNT.turns - 0.32; ) {
      const ro = rhoOf(u);
      const du = spacing / (Math.PI * 2 * ro);
      const face = rimOf(u) - footOf(u);
      if (face > 11) {
        const hw = (spacing * 0.3) / (Math.PI * 2 * ro);
        const k0 = 1.5 / face;
        const k1 = 1 - 5 / face;
        const R = 7;
        const lo: V3 = [0.06, 0.035, 0.1];
        const hi: V3 = [0.07, 0.15, 0.2];
        for (let j = 0; j < R; j++) {
          const ta = j / R;
          const tb = (j + 1) / R;
          // straight sides, then two arcs meeting in a point
          const wOf = (t: number) => (t < 0.55 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.55) / 0.45, 1.7))));
          const A = [wallPt(u - hw * wOf(ta), k0 + (k1 - k0) * ta, 0.22), wallPt(u + hw * wOf(ta), k0 + (k1 - k0) * ta, 0.22), wallPt(u - hw * wOf(tb), k0 + (k1 - k0) * tb, 0.22), wallPt(u + hw * wOf(tb), k0 + (k1 - k0) * tb, 0.22)];
          for (const q of [0, 1, 2, 1, 3, 2]) {
            pos.push(A[q].x, A[q].y, A[q].z);
            col.push(...mix3(lo, hi, q < 2 ? ta : tb), 0);
          }
        }
      }
      u += du;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
    g.computeVertexNormals();
    parts.push(g);
  }
  const flat = parts.map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    if (q !== g) g.dispose();
    return q;
  });
  const out = mergeGeometries(flat)!;
  flat.forEach((g) => g.dispose());
  out.computeBoundingSphere();
  return out;
}

export default function FairyWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const r = rng(303);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const y0 = g(MOUNT.x, MOUNT.z) - 4;
    const k = new Kit();
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const P = (x: number, y: number, z: number): V3 => [MOUNT.x + x, y0 + y, MOUNT.z + z];

    // buttresses between the arches: slim fins of lighter stone
    const spacing = props.mobile ? 15 : 9.5;
    for (let u = 0.02; u < MOUNT.turns - 0.32; ) {
      const ro = rhoOf(u);
      const du = spacing / (Math.PI * 2 * ro);
      const ub = u + du / 2;
      const face = rimOf(ub) - footOf(ub);
      if (face > 11) {
        const th = thOf(ub);
        const rr = rhoOf(ub) + MOUNT.batter * 0.55 + 0.5;
        k.add(new THREE.CylinderGeometry(0.5, 1.5, face - 1.2, 4), P(Math.cos(th) * rr, footOf(ub) + (face - 1.2) / 2, Math.sin(th) * rr), [0.36, 0.13, 0.12], { top: [0.74, 0.34, 0.2], rot: [0, -th + Math.PI / 4, 0] });
      }
      u += du;
    }

    // the heart of the mountain: green shoulders going up into violet rock
    const cone = (x: number, z: number, R: number, yb: number, yt: number, lo: V3, hi: V3, pow = 1.25, seg = 28) => {
      const prof: [number, number][] = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        prof.push([R * Math.pow(1 - t, pow) + 0.01, (yt - yb) * t]);
      }
      k.lathe(prof, P(x, yb, z), lo, { top: hi, seg });
    };
    k.lathe(
      [
        [64, 0],
        [54, 30],
        [41, 58],
        [30, 80],
        [18, 100],
        [0.1, 104],
      ],
      P(0, 92, 0),
      [0.15, 0.25, 0.08],
      { top: [0.4, 0.24, 0.36], seg: 44 },
    );
    cone(8, -24, 40, 150, 312, ROCK, ROCK_LIT, 1.3, 32);
    cone(40, 6, 30, 128, 240, [0.24, 0.16, 0.28], [0.88, 0.58, 0.5], 1.25);
    cone(-38, -10, 27, 130, 222, [0.2, 0.12, 0.24], [0.72, 0.46, 0.52], 1.25);
    cone(-8, -52, 24, 132, 210, [0.2, 0.1, 0.22], [0.6, 0.38, 0.46], 1.2);
    

    // the castle: three tiers of pale wall stepping up the front of the peak, a
    // crowd of slim towers with tall spires, every window lit, and towers on up the ridge to the very top
    const stone: V3 = [0.6, 0.42, 0.5];
    const stoneLit: V3 = [0.94, 0.68, 0.56];
    const spire: V3 = [0.92, 0.56, 0.3];
    const tower = (x: number, y: number, z: number, rad: number, h: number, tall = 5) => {
      k.add(new THREE.CylinderGeometry(rad * 0.88, rad, h, 10), P(x, y + h / 2, z), stone, { top: stoneLit, glow: 0.1 });
      k.add(new THREE.ConeGeometry(rad * 1.18, rad * tall, 10), P(x, y + h + (rad * tall) / 2, z), [0.6, 0.26, 0.2], { top: spire, glow: 0.3 });
      const rows = Math.max(1, Math.floor(h / 6));
      for (let j = 0; j < 3; j++) {
        const a = 0.5 + j * 1.05 + x * 0.3;
        for (let q = 0; q < rows; q++) k.box(0.5, 1.5, 0.3, P(x + Math.cos(a) * rad * 0.95, y + 3 + q * 5.4, z + Math.sin(a) * rad * 0.95), [1, 0.8, 0.4], { glow: 2.4, rot: [0, -a + Math.PI / 2, 0] });
      }
    };
    // the shelf it stands on, where the road arrives
    k.add(new THREE.CylinderGeometry(35, 39, 64, 36), P(0, 162 - 32, 20), [0.3, 0.17, 0.28], { top: [0.22, 0.3, 0.1] });
    const tiers: [R: number, zc: number, y: number, h: number][] = [
      [32, 20, 161, 8],
      [24, 16, 176, 8],
      [16, 12, 192, 9],
    ];
    const every = props.mobile ? 2 : 1;
    tiers.forEach(([R, zc, y, h], ti) => {
      k.add(new THREE.CylinderGeometry(R, R + 0.7, h, 36, 1, true, -1.75, 3.5), P(0, y + h / 2, zc), stone, { top: stoneLit, glow: 0.12 });
      const nT = Math.round(R / 2.6);
      for (let i = 0; i <= nT; i += 1) {
        const a = -1.75 + (i / nT) * 3.5;
        const x = Math.sin(a) * R;
        const z = zc + Math.cos(a) * R;
        // battlements between, a tower at every other step
        k.box(1.3, 1.5, 1.0, P(Math.sin(a + 0.06) * (R + 0.2), y + h + 0.7, zc + Math.cos(a + 0.06) * (R + 0.2)), stoneLit, { glow: 0.14, rot: [0, a, 0] });
        if (i % (2 * every) === 0) tower(x, y - 2, z, 1.7 + r() * 1.1 + (ti === 0 ? 0.5 : 0), h + 7 + r() * 9 + (i === Math.round(nT / 2) ? 5 : 0), 4.6 + r() * 1.6);
      }
    });
    // the gate, lit from within
    k.box(4.6, 7.4, 0.5, P(0, 161 + 3.2, 20 + 32.4), [1, 0.78, 0.36], { glow: 1.9 });
    k.add(new THREE.ConeGeometry(3.3, 4.4, 4), P(0, 161 + 9.0, 20 + 32.3), [1, 0.78, 0.36], { glow: 1.9, scale: [1, 1, 0.12], rot: [0, Math.PI / 4, 0] });
    // the keep and its needle
    tower(0, 196, 10, 4.4, 30, 5.4);
    tower(-9, 194, 13, 2.4, 20, 6);
    tower(9, 194, 12, 2.6, 23, 6);
    // on up the ridge, and one on the summit itself
    for (const [x, y, z, rad, h] of [
      [8, 230, -7, 1.7, 9],
      [8, 254, -13, 1.5, 8],
      [8, 279, -19, 1.3, 7],
      [8, 304, -24, 1.2, 9],
    ] as const)
      tower(x, y, z, rad, h, 7);
    glows.push({ p: P(0, 196, 26), size: 130, col: [1, 0.66, 0.3], k: 0.42 });
    halos.push({ p: P(0, 250, 10), size: 8, col: [1, 0.86, 0.56], k: 0.5 }, { p: P(8, 323, -24), size: 9, col: [1, 0.86, 0.56], k: 0.6 }, { p: P(0, 166, 53), size: 9, col: [1, 0.8, 0.46], k: 0.5 });

    // thin cypresses and round bushes along the road
    const nC = props.mobile ? 26 : Math.round(90 * props.trees);
    for (let i = 0; i < nC; i++) {
      const u = 0.06 + r() * (MOUNT.turns - 0.1);
      const th = thOf(u);
      const ro = rhoOf(u) - 2.6;
      const ri = u + 1 <= MOUNT.turns ? rhoOf(u + 1) + MOUNT.batter : INNER_R;
      const t = r() < 0.5 ? 0.06 + r() * 0.2 : 0.62 + r() * 0.32;
      const rr = ro + (ri - ro) * t;
      const y = rimOf(u) - 2.5 + 20 * Math.pow(t, 1.2) - 0.4;
      if (i % 3 === 0) {
        const h = 8 + r() * 9;
        k.add(new THREE.ConeGeometry(1.0 + h * 0.06, h, 7), P(Math.cos(th) * rr, y + h / 2, Math.sin(th) * rr), [0.03, 0.08, 0.06], { top: [0.1, 0.2, 0.1] });
      } else {
        const s = 1.6 + r() * 2.2;
        k.add(new THREE.SphereGeometry(s, 8, 6), P(Math.cos(th) * rr, y + s * 0.5, Math.sin(th) * rr), [0.06, 0.15, 0.05], { top: [0.34, 0.42, 0.1], scale: [1, 0.8, 1] });
      }
    }

    // his sky: small round clouds laid out in rows, like a pattern on cloth
    const clouds: Cloud[] = [];
    // near rows overhead, and row behind row going down to the horizon
    // how many rows go out toward the horizon follows the quality's draw distance
    const rows = Math.round((props.mobile ? 9 : 16) * Math.min(1.15, Math.max(0.6, props.far)));
    let z = 520;
    for (let row = 0; row < rows; row++) {
      const gap = 110 + row * (props.mobile ? 34 : 15);
      z -= gap;
      const half = 760 + (520 - z) * 0.55;
      const stepX = (props.mobile ? 190 : 120) + row * 9;
      for (let x = -half + (row % 2) * stepX * 0.5; x < half; x += stepX) {
        const cx = x + (r() - 0.5) * stepX * 0.36;
        const cz = z + (r() - 0.5) * gap * 0.34;
        if (Math.hypot(cx - MOUNT.x, cz - MOUNT.z) < 170) continue; // the peaks stand clear
        const w = (30 + r() * 24) * (1 + row * 0.05);
        clouds.push({ p: [cx, 300 + (r() - 0.5) * 22 - row * 3, cz], s: [w, w * 0.42, w * 0.7], seed: r() * 9 });
      }
    }
    // a few lying low about the mountain's foot, as if it stood above them
    const puffs: Puff[] = [];
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = 360 + r() * 220;
      puffs.push({ p: [Math.cos(a) * d, 44 + r() * 18, MOUNT.z + Math.sin(a) * d], size: 70 + r() * 70, a: 0.6 });
    }
    // the sun low to the right, in a fan of rays
    const air = def.air!;
    const sa = (air.sunAz * Math.PI) / 180;
    const se = (air.sunEl * Math.PI) / 180;
    const sunP: V3 = [Math.sin(sa) * Math.cos(se) * 1500, Math.sin(se) * 1500, -Math.cos(sa) * Math.cos(se) * 1500];

    const cloudMat = makeCloudMaterial({ lit: 1 });
    return {
      mount: spiral(props.mobile, (x, z) => g(MOUNT.x + x, MOUNT.z + z) - y0),
      set: k.build(),
      tempera: makeTempera({ amb: 0.95, key: 0.34, dab: 1.2 }),
      y0,
      clouds: cloudMesh(clouds, cloudMat, props.mobile ? 1 : 3),
      cloudMat,
      puffs,
      halos,
      glows,
      suns: [{ p: sunP, size: 900, col: [1, 0.9, 0.62] as V3, k: 0.4 }],
    };
  }, [props.mobile, props.trees, props.far]);
  return (
    <>
      <WorldBase id="fairy" def={def} pal={FAIRY_PAL} props={props} tip={[0.44, 0.5, 0.16]} pathTint={[1, 0.92, 0.7]} />
      <mesh geometry={b.mount} material={b.tempera} position={[MOUNT.x, b.y0, MOUNT.z]} />
      <mesh geometry={b.set} material={b.tempera} />
      <primitive object={b.clouds} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.suns} kind={3} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
