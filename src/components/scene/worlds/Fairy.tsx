"use client";

import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, cloudMesh, makeCloudMaterial, makeTempera, rng, type Cloud, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { WORLDS, groundAt } from "./voyage";

// Fairy Tale (Castle Fairy Tale, 1909). A mountain wound round by a road:
// a broad green terrace climbing in a spiral behind a red-brown wall, turn
// above turn, to three violet peaks with a small castle glowing among them
// like a lit lantern. A pale cobbled way falls from it down the right-hand
// slope. The sky is turquoise, set with small cream clouds in rows, and the
// sun stands low to the right in a fan of rays.

const def = WORLDS.fairy;
export const FAIRY_PAL: GroundPalette = { a: [0.085, 0.18, 0.05], b: [0.17, 0.23, 0.065], c: [0.06, 0.14, 0.075] };

export const MOUNT = { x: 0, z: -80, r0: 156, r1: 48, h: 156, turns: 2.5, wall: 6 };
const WALL: V3 = [0.4, 0.14, 0.1];
const WALL_LOW: V3 = [0.13, 0.055, 0.07];
const GREEN: V3 = [0.14, 0.27, 0.07];
const GREEN2: V3 = [0.28, 0.36, 0.1];
const PATH: V3 = [0.52, 0.44, 0.27];

const rOut = (u: number) => MOUNT.r0 - (MOUNT.r0 - MOUNT.r1) * Math.pow(Math.min(1, Math.max(0, u / MOUNT.turns)), 0.88);
const yOf = (u: number) => MOUNT.h * Math.pow(Math.min(1, Math.max(0, u / MOUNT.turns)), 0.94);

// The wound mountain: every step along the spiral lays a strip of terrace
// (grass, the pale road down its middle, grass), the parapet at its lip, and
// the wall falling to the turn below.
function spiral(mobile: boolean) {
  const per = mobile ? 56 : 96;
  const n = Math.round(per * MOUNT.turns);
  const pos: number[] = [];
  const col: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: V3, cb: V3) => {
    // a, b on the earlier step (inner, outer); c, d on the later one
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
    col.push(...ca, 0, ...cb, 0, ...ca, 0, ...cb, 0, ...cb, 0, ...ca, 0);
  };
  const at = (u: number, r: number, y: number) => {
    const th = u * Math.PI * 2 + 0.9;
    return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r);
  };
  const ring = (u: number) => {
    const ro = rOut(u);
    const ri = u + 1 <= MOUNT.turns ? rOut(u + 1) : MOUNT.r1 * 0.86;
    const y = yOf(u);
    const below = u >= 1 ? yOf(u - 1) : -14;
    const rm = (ri + ro) / 2;
    const pw = Math.min(4.2, (ro - ri) * 0.16);
    return [
      at(u, ri, y + 0.6),
      at(u, rm - pw, y + 0.1),
      at(u, rm + pw, y + 0.1),
      at(u, ro - 2.4, y + 0.3),
      at(u, ro - 2.4, y + MOUNT.wall),
      at(u, ro, y + MOUNT.wall),
      at(u, ro * 1.012 + 0.6, (y + MOUNT.wall + below) * 0.5),
      at(u, ro * 1.03 + 1.6, below),
    ];
  };
  let prev = ring(0);
  for (let i = 1; i <= n; i++) {
    const u = (i / n) * MOUNT.turns;
    const cur = ring(u);
    const dry = 0.5 + 0.5 * Math.sin(u * 9.0);
    const grass: V3 = [GREEN[0] + (GREEN2[0] - GREEN[0]) * dry, GREEN[1] + (GREEN2[1] - GREEN[1]) * dry, GREEN[2] + (GREEN2[2] - GREEN[2]) * dry];
    quad(prev[0], prev[1], cur[0], cur[1], [grass[0] * 0.7, grass[1] * 0.7, grass[2] * 0.7], grass);
    quad(prev[1], prev[2], cur[1], cur[2], PATH, PATH);
    quad(prev[2], prev[3], cur[2], cur[3], grass, [grass[0] * 0.8, grass[1] * 0.8, grass[2] * 0.8]);
    quad(prev[3], prev[4], cur[3], cur[4], [WALL[0] * 0.6, WALL[1] * 0.6, WALL[2] * 0.6], WALL);
    quad(prev[4], prev[5], cur[4], cur[5], [0.56, 0.24, 0.15], [0.56, 0.24, 0.15]);
    quad(prev[5], prev[6], cur[5], cur[6], WALL, [0.26, 0.09, 0.08]);
    quad(prev[6], prev[7], cur[6], cur[7], [0.26, 0.09, 0.08], WALL_LOW);
    prev = cur;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
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

    // pilasters down the wall, turn after turn: the rhythm of its arcade
    const per = props.mobile ? 22 : 40;
    for (let i = 0; i < per * MOUNT.turns; i++) {
      const u = (i + 0.5) / per;
      const th = u * Math.PI * 2 + 0.9;
      const ro = rOut(u) * 1.014 + 1.2;
      const top = yOf(u) + MOUNT.wall;
      const below = u >= 1 ? yOf(u - 1) : -10;
      const h = (top - below) * 0.82;
      k.box(1.5, h, 1.8, P(Math.cos(th) * ro, top - h / 2 - 1.2, Math.sin(th) * ro), [0.5, 0.2, 0.13], { top: [0.6, 0.27, 0.16], rot: [0, -th, 0] });
    }
    // the summit: a small green crown of land, three violet peaks
    const top = MOUNT.h;
    k.add(new THREE.CylinderGeometry(MOUNT.r1 * 0.9, MOUNT.r1 * 0.98, 6, 40), P(0, top - 2.4, 0), GREEN, { top: GREEN2 });
    // the core the last turn of the road winds round
    const coreFrom = yOf(MOUNT.turns - 1.1);
    k.add(new THREE.CylinderGeometry(MOUNT.r1 * 0.88, MOUNT.r1 * 0.96, top - coreFrom, 40, 1, true), P(0, (top + coreFrom) / 2 - 2, 0), [0.26, 0.09, 0.08], { top: WALL });
    const peak = (x: number, z: number, R: number, H: number, seg = 9) => {
      const prof: [number, number][] = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        prof.push([R * Math.pow(1 - t, 1.3) + 0.01, H * t]);
      }
      k.lathe(prof, P(x, top - 2, z), [0.2, 0.1, 0.19], { top: [0.78, 0.46, 0.44], seg, flat: true, rot: [0, x, 0] });
    };
    peak(10, -12, 31, 132);
    peak(31, 8, 19, 82, 8);
    peak(-22, -18, 16, 62, 7);
    peak(-6, -30, 12, 44, 7);

    // the castle among them: a crowd of small towers, every window lit
    const cx = -14;
    const cz = 18;
    const stone: V3 = [0.62, 0.34, 0.24];
    const roof: V3 = [0.5, 0.17, 0.14];
    const tower = (x: number, z: number, rad: number, h: number) => {
      k.add(new THREE.CylinderGeometry(rad * 0.92, rad, h, 9), P(x, top + h / 2, z), stone, { top: [0.9, 0.58, 0.36], glow: 0.14 });
      k.add(new THREE.ConeGeometry(rad * 1.25, rad * 2.8, 9), P(x, top + h + rad * 1.4, z), roof, { top: [0.72, 0.3, 0.2] });
      // windows, facing every way
      for (let j = 0; j < 4; j++) {
        const a = j * 1.57 + x;
        for (let q = 0; q < Math.floor(h / 7); q++) k.box(0.55, 1.3, 0.25, P(x + Math.cos(a) * rad * 0.97, top + 4 + q * 6.2, z + Math.sin(a) * rad * 0.97), [1, 0.78, 0.36], { glow: 2.6, rot: [0, -a + Math.PI / 2, 0] });
      }
    };
    tower(cx, cz, 5.2, 30);
    const nT = props.mobile ? 8 : 15;
    for (let i = 0; i < nT; i++) {
      const a = (i / nT) * Math.PI * 2;
      const d = 9 + (i % 3) * 5 + r() * 2;
      tower(cx + Math.cos(a) * d * 1.25, cz + Math.sin(a) * d * 0.8, 1.8 + r() * 1.7, 10 + r() * 15 + (i % 4 === 0 ? 8 : 0));
    }
    // a curtain wall round it
    k.add(new THREE.CylinderGeometry(25, 26, 7, 40, 1, true), P(cx, top + 3.5, cz), stone, { top: [0.86, 0.54, 0.34], glow: 0.1, scale: [1.2, 1, 0.85] });
    glows.push({ p: P(cx, top + 18, cz + 6), size: 90, col: [1, 0.66, 0.3], k: 0.4 });
    halos.push({ p: P(cx, top + 14, cz + 12), size: 10, col: [1, 0.8, 0.5], k: 0.6 });

    // thin cypresses standing along the road
    const nC = props.mobile ? 18 : Math.round(46 * props.trees);
    for (let i = 0; i < nC; i++) {
      const u = 0.1 + r() * (MOUNT.turns - 0.15);
      const th = u * Math.PI * 2 + 0.9;
      const ro = rOut(u);
      const ri = u + 1 <= MOUNT.turns ? rOut(u + 1) : MOUNT.r1 * 0.86;
      const rr = ri + (ro - ri) * (r() < 0.5 ? 0.2 : 0.8);
      const h = 7 + r() * 9;
      k.add(new THREE.ConeGeometry(1.1 + h * 0.05, h, 6), P(Math.cos(th) * rr, yOf(u) + h / 2, Math.sin(th) * rr), [0.04, 0.1, 0.06], { top: [0.1, 0.2, 0.09] });
    }
    // the pale cobbled way falling down the right-hand slope
    const way: THREE.Vector3[] = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const x = MOUNT.x + 60 + t * 250;
      const z = MOUNT.z + 70 + t * 150 + Math.sin(t * 3) * 14;
      const lift = Math.pow(1 - t, 2.6) * 62;
      way.push(new THREE.Vector3(x, Math.max(g(x, z) + 0.4, y0 + lift), z));
    }
    const wp: number[] = [];
    const wc: number[] = [];
    for (let i = 0; i < way.length - 1; i++) {
      const a = way[i];
      const c = way[i + 1];
      const side = new THREE.Vector3(-(c.z - a.z), 0, c.x - a.x).normalize().multiplyScalar(11 + i * 0.5);
      const A = [a.clone().sub(side), a.clone().add(side), c.clone().sub(side), c.clone().add(side)];
      wp.push(A[0].x, A[0].y - 3, A[0].z, A[1].x, A[1].y - 3, A[1].z, A[2].x, A[2].y - 3, A[2].z, A[1].x, A[1].y - 3, A[1].z, A[3].x, A[3].y - 3, A[3].z, A[2].x, A[2].y - 3, A[2].z);
      const shade = 0.82 + 0.18 * Math.sin(i * 2.1);
      for (let q = 0; q < 6; q++) wc.push(0.5 * shade, 0.56 * shade, 0.3 * shade, 0);
    }
    const wayGeo = new THREE.BufferGeometry();
    wayGeo.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
    wayGeo.setAttribute("aCol", new THREE.Float32BufferAttribute(wc, 4));
    wayGeo.computeVertexNormals();
    wayGeo.computeBoundingSphere();

    // his sky: small round clouds laid out in rows, like a pattern on cloth
    const clouds: Cloud[] = [];
    const rows = props.mobile ? 6 : 11;
    const cols = props.mobile ? 8 : 14;
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < cols; i++) {
        const x = -820 + i * (1640 / cols) + (row % 2) * 60 + (r() - 0.5) * 44;
        const z = 420 - row * 120 + (r() - 0.5) * 40;
        if (Math.hypot(x - MOUNT.x, z - MOUNT.z) < 120) continue; // the peaks stand clear
        const w = 30 + r() * 26;
        clouds.push({ p: [x, 292 + row * 5 + (r() - 0.5) * 24, z], s: [w, w * 0.4, w * 0.72], seed: r() * 9 });
      }
    // a few lying low about the mountain's foot, as if it stood above them
    const puffs: Puff[] = [];
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = 330 + r() * 240;
      puffs.push({ p: [Math.cos(a) * d, 26 + r() * 18, MOUNT.z + Math.sin(a) * d], size: 70 + r() * 70, a: 0.7 });
    }
    // the sun low to the right, in a fan of rays
    const air = def.air!;
    const sa = (air.sunAz * Math.PI) / 180;
    const se = (air.sunEl * Math.PI) / 180;
    const sunP: V3 = [Math.sin(sa) * Math.cos(se) * 1500, Math.sin(se) * 1500, -Math.cos(sa) * Math.cos(se) * 1500];

    const cloudMat = makeCloudMaterial({ lit: 1 });
    return {
      mount: spiral(props.mobile),
      set: k.build(),
      way: wayGeo,
      tempera: makeTempera({ amb: 0.95, key: 0.34, dab: 1.2 }),
      y0,
      clouds: cloudMesh(clouds, cloudMat, props.mobile ? 1 : 2),
      cloudMat,
      puffs,
      halos,
      glows,
      suns: [{ p: sunP, size: 760, col: [1, 0.9, 0.62] as V3, k: 0.5 }],
    };
  }, [props.mobile, props.trees]);
  return (
    <>
      <WorldBase id="fairy" def={def} pal={FAIRY_PAL} props={props} tip={[0.44, 0.5, 0.16]} pathTint={[1, 0.92, 0.7]} />
      <mesh geometry={b.mount} material={b.tempera} position={[MOUNT.x, b.y0, MOUNT.z]} />
      <mesh geometry={b.set} material={b.tempera} />
      <mesh geometry={b.way} material={b.tempera} />
      <primitive object={b.clouds} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.suns} kind={1} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
