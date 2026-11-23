"use client";

import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, makeTempera, makeWater, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { Procession, RayedSun, RisingFlock, SunShafts, heapBlobs, heapMesh, leafyMesh, makeHeapMaterial, makeLeafyMaterial, useDeepLens, type Beam, type Crown, type Heap } from "./fairy/shared";
import { buildTree, makeLeafTexture } from "../home/trees";
import { COLONNADE, ISLE, POOL_R, RILLS, TERRACES, TOP_R, TOP_Y, Wings, buildColonnade, buildGardens, buildNiches, buildRills, buildSteps, offFlight, seraph, stoneAt } from "./paradise/isle";
import { Blooms, Butterflies, CloudDeck, Ship, makeGardenMaterial, makeRillMaterial, makeWingMaterial, type Bloom, type Flutter } from "./paradise/life";
import { makeSea } from "./paradise/sea";
import { WORLDS, groundAt } from "./voyage";

// Paradise (Rojus, 1909). He painted a shore curving away under a sky of gold and olive cloud: a still sea
// to the left as far as the eye goes, pale sand, a meadow thick with flowers and butterflies, angels standing
// about in it with tall wings of blue, rose, green and yellow, one bending to pick a flower, and a great flight
// of pale steps climbing out of the picture to the right.
//
// Here that curve goes all the way round: a round isle in an endless sea. The plane comes in over the water
// with the sun's road on it, follows the sand round the isle with the meadow and its company on the right,
// then turns inland and goes straight up the great flight, between two ranks of tall angels and a procession
// climbing, to a court of pale columns open to the sky, a still pool in it, and the way on standing in the pool.

const def = WORLDS.paradise;
const SAND: V3 = [0.62, 0.52, 0.27];
export const PARADISE_PAL: GroundPalette = {
  a: [0.1, 0.165, 0.04],
  b: [0.17, 0.2, 0.05],
  c: [0.075, 0.135, 0.045],
  shore: SAND,
  shoreAt: [1.6, 5.4],
  hook: {
    decl: "",
    lit: /* glsl */ `
      {
        // (the sea's own sheet draws everything under the water: see paradise/sea.ts)
        if (h < -0.3) discard;
        float meadow = smoothstep(4.8, 6.2, h);
        vec3 fl = uSkyCol + uKeyCol * 0.34 * sunUp;
        // drifts of flowers seen from far off: the meadow is never one green
        float drift = vnoise(p * 0.028 + 5.0) * 0.6 + vnoise(p * 0.085) * 0.4;
        vec3 dcol = mix(vec3(0.95, 0.84, 0.3), vec3(0.96, 0.92, 0.82), vnoise(p * 0.017 + 9.0));
        dcol = mix(dcol, vec3(0.86, 0.42, 0.4), smoothstep(0.62, 0.8, vnoise(p * 0.021 + 31.0)));
        col = mix(col, dcol * fl * 0.8, smoothstep(0.5, 0.78, drift) * 0.3 * meadow);
        // and nearer, flower by flower: dabs of white, yellow, red and blue (gone before they could swim)
        float nearF = (1.0 - smoothstep(90.0, 320.0, gd)) * meadow * (1.0 - smoothstep(0.3, 1.1, px * 2.4));
        if (nearF > 0.0) {
          vec2 fc = p * 0.5; vec2 fi = floor(fc); float fh = hash12(fi + 17.0);
          vec2 fo = vec2(hash12(fi + 3.1), hash12(fi + 7.7));
          float fd = length(fract(fc) - 0.2 - 0.6 * fo);
          float speck = (1.0 - smoothstep(0.1, 0.17, fd)) * step(0.3, fh);
          vec3 fcol = fh < 0.58 ? vec3(1.0, 0.98, 0.9) : fh < 0.8 ? vec3(1.0, 0.84, 0.2) : fh < 0.9 ? vec3(0.92, 0.18, 0.12) : vec3(0.32, 0.44, 0.98);
          col = mix(col, fcol * fl, speck * nearF);
        }
        // the foot of the great flight stands in its own shade
        col *= mix(0.62, 1.0, smoothstep(525.0, 536.0, length(p)));
        // the sand: clean and pale, faintly ribbed by the water, wet where it has just been
        vec3 light = uSkyCol * 0.7 + uKeyCol * (0.22 + 0.5 * max(uKeyDir.y, 0.0)) * sunUp;
        vec3 sandC = vec3(${SAND.map((x) => x.toFixed(3)).join(", ")}) * (0.94 + 0.12 * vnoise(vec2(length(p) * 0.35 + vnoise(p * 0.03) * 3.0, atan(p.y, p.x) * 40.0))) * light;
        col = mix(sandC, col, smoothstep(2.6, 5.4, h + (vnoise(p * 0.2) - 0.5) * 0.5));
        col *= mix(0.78, 1.0, smoothstep(0.0, 0.7, h));
      }
    `,
  },
};
// (grass in the meadow only: not on the sand, and not under the stone of the steps)
const GRASS_MASK = `return smoothstep(4.6, 6.0, h) * smoothstep(${(ISLE.meadow - 2).toFixed(1)}, ${(ISLE.meadow + 3).toFixed(1)}, length(p));`;

const WING_COLS: V3[] = [
  [0.16, 0.36, 0.78],
  [0.8, 0.34, 0.44],
  [0.2, 0.56, 0.36],
  [0.86, 0.7, 0.2],
  [0.5, 0.36, 0.78],
  [0.22, 0.6, 0.64],
  [0.9, 0.86, 0.74],
  [0.9, 0.52, 0.26],
];
const ROBES: V3[] = [
  [0.82, 0.8, 0.72],
  [0.6, 0.7, 0.86],
  [0.86, 0.68, 0.66],
  [0.66, 0.8, 0.68],
  [0.88, 0.82, 0.6],
];

export default function ParadiseWorld({ props }: { props: WorldProps }) {
  useDeepLens("paradise");
  const b = useDisposable(() => {
    const r = rng(606);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const polar = (a: number, d: number): [number, number] => [Math.cos(a) * d, Math.sin(a) * d];
    const k = new Kit();
    const wings = new Wings();
    const glows: Halo[] = [];
    const halos: Halo[] = [];
    let n = 0;
    const angelAt = (x: number, z: number, s: number, yaw: number, pose?: number, o: { wing?: V3; robe?: V3; open?: number; glow?: number } = {}) => {
      const rr = Math.hypot(x, z);
      const y = rr >= ISLE.meadow ? g(x, z) - 0.05 : stoneAt(rr, Math.atan2(z, x));
      seraph(k, wings, [x, y, z], s, yaw, { robe: o.robe ?? ROBES[n % ROBES.length], wing: o.wing ?? WING_COLS[(n * 3 + 1) % WING_COLS.length], pose: pose ?? [0, 3, 1, 0, 2, 3][n % 6], glow: o.glow ?? 0.07, open: o.open ?? 0.3 + r() * 0.3 });
      n++;
      return y;
    };
    const W = Math.PI; // where the plane meets the shore: the isle's west

    // ---- the company of the picture, where the plane first comes to the sand
    {
      // the one who bends to the flower: larger and nearer, the wings arched over like a shell
      const [bx, bz] = polar(W + 0.2, 612);
      const yaw = Math.atan2(-bx, -bz) + 2.2;
      const by = angelAt(bx, bz, 7.4, yaw, 4, { wing: [0.92, 0.8, 0.34], robe: [0.86, 0.8, 0.66], open: 0.5, glow: 0.09 });
      glows.push({ p: [bx, by + 6, bz], size: 26, col: [1, 0.94, 0.74], k: 0.16 });
      const fx = bx + Math.sin(yaw) * 7.4 * 0.66;
      const fz = bz + Math.cos(yaw) * 7.4 * 0.66;
      k.add(new THREE.SphereGeometry(0.4, 8, 6), [fx, g(fx, fz) + 0.75, fz], [1, 0.98, 0.9], { glow: 0.9, scale: [1, 0.6, 1] });
      k.add(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 4), [fx, g(fx, fz) + 0.35, fz], [0.2, 0.3, 0.08]);
      // a close group of four behind it, their wings blue, rose, green and rose again
      const [gx, gz] = polar(W + 0.29, 590);
      for (let i = 0; i < 4; i++) {
        const x = gx + Math.cos(i * 1.7 + 0.4) * 5.2;
        const z = gz + Math.sin(i * 1.7 + 0.4) * 5.2;
        angelAt(x, z, 4.6 + r() * 0.8, Math.atan2(gx - x, gz - z), [0, 3, 1, 0][i], { wing: WING_COLS[[0, 1, 2, 1][i]] });
      }
      // two apart from them: one in blue under yellow wings, one with a flower held out
      const [ax, az] = polar(W + 0.36, 566);
      angelAt(ax, az, 5.2, Math.atan2(-ax, -az) + 2.6, 3, { wing: WING_COLS[3], robe: ROBES[1] });
      angelAt(ax + 9, az - 12, 4.8, Math.atan2(-ax, -az) + 3.4, 1, { wing: WING_COLS[0] });
      // three small and far off at the meadow's edge, greenish
      for (let i = 0; i < 3; i++) {
        const [x, z] = polar(W + 0.5 + i * 0.012, 668 - i * 6);
        angelAt(x, z, 3.6, Math.atan2(-x, -z) + 3, 3, { wing: WING_COLS[2] });
      }
    }
    // ---- companies all round the meadow, in twos and threes, turned to one another
    const groups = props.mobile ? 12 : 26;
    for (let gi = 0; gi < groups; gi++) {
      const a = W + 0.62 + (gi / groups) * (Math.PI * 2 - 0.75) + (r() - 0.5) * 0.1;
      const [cx, cz] = polar(a, gi % 4 === 3 ? 664 + r() * 16 : 545 + r() * 70);
      // (the foot of the great flight is kept clear for the procession)
      if (Math.abs(cx) < 40 && cz < 0) continue;
      const m = 2 + (gi % 3 === 0 ? 2 : gi % 2);
      for (let i = 0; i < m; i++) {
        const x = cx + Math.cos(i * 2.2 + gi) * 4.6;
        const z = cz + Math.sin(i * 2.2 + gi) * 4.6;
        angelAt(x, z, 4.2 + r() * 1.6, Math.atan2(cx - x, cz - z) + (r() - 0.5) * 0.6);
      }
    }
    // ---- on the steps themselves: sitting companies low down (as in the picture), single figures higher, looking out to sea
    for (let i = 0; i < (props.mobile ? 16 : 44); i++) {
      const st = 1 + Math.floor(Math.pow(r(), 1.4) * (ISLE.n - 3));
      const a = r() * Math.PI * 2;
      const [x, z] = polar(a, ISLE.meadow - st * ISLE.tread - 4.5);
      if (Math.abs(x) < 56 && z < 0) continue;
      angelAt(x, z, 4.4 + r() * 1.4, Math.atan2(x, z) + (r() - 0.5) * 1.4);
    }
    // ---- the great flight's two ranks: tall angels facing one another across the way up, flowers held out
    for (let i = 0; i < 8; i++) {
      const st = 1 + i * 3;
      const rr = ISLE.meadow - st * ISLE.tread - 4.5;
      for (const sd of [-1, 1]) {
        const x = sd * 44;
        const z = -Math.sqrt(rr * rr - x * x);
        const s = 13 + (i % 2) * 3;
        const y = angelAt(x, z, s, sd > 0 ? -Math.PI / 2 : Math.PI / 2, i % 3 === 0 ? 1 : i % 3 === 1 ? 0 : 2, { open: 0.5, glow: 0.12 });
        glows.push({ p: [x, y + s * 1.7, z], size: s * 1.3, col: [1, 0.95, 0.76], k: 0.2 });
      }
    }
    // ---- the court: colossal angels round its rim, facing out over the sea; lesser ones about the pool
    const nG = props.mobile ? 6 : 10;
    for (let i = 0; i < nG; i++) {
      // (none stands before the way in or behind the way on)
      const a = (i / nG) * Math.PI * 2;
      const [x, z] = polar(a, TOP_R - 22);
      const s = 25 + (i % 2) * 5;
      angelAt(x, z, s, Math.atan2(x, z), i % 2 ? 0 : 3, { open: 0.62, glow: 0.16 });
      glows.push({ p: [x, TOP_Y + s * 1.72, z], size: s * 1.5, col: [1, 0.95, 0.75], k: 0.2 });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.39;
      const [x, z] = polar(a, POOL_R + 12);
      angelAt(x, z, 7.5, Math.atan2(-x, -z), i % 2 ? 1 : 0, { glow: 0.12 });
    }
    buildColonnade(k);
    buildNiches(k, props.mobile);
    // ---- the garden terraces: dark cypresses and trees in blossom along them, lamps on the parapet, tall angels
    // looking out to sea, and a pylon with a light on it where each ends at the great flight
    const cyp: Crown[] = [];
    const bloss: Crown[] = [];
    // a tree in blossom (the shared trees' own broad tree, its leaves turned to blossom): where it stands, how big
    const blossom = (x: number, y: number, z: number, sz: number) => bloss.push({ p: [x, y - 0.3, z], r: sz, h: 0.95 + r() * 0.2, seed: r() });
    const clearOf = (a: number, by: number) => RILLS.every((q) => Math.abs(Math.atan2(Math.sin(a - q), Math.cos(a - q))) > by);
    TERRACES.forEach((t, ti) => {
      const a0 = -Math.PI / 2 + t.gap;
      const a1 = -Math.PI / 2 + Math.PI * 2 - t.gap;
      const nC = Math.round(((a1 - a0) * t.r1) / (props.mobile ? 44 : 21));
      for (let i = 0; i < nC; i++) {
        const a = a0 + ((i + 0.5) / nC) * (a1 - a0);
        if (!clearOf(a, 9 / t.r1)) continue;
        // cypresses in threes before the hedge, a tree in blossom between each three
        if (i % 4 !== 3) cyp.push({ p: [Math.cos(a) * (t.r1 + 13.5), t.y1 - 0.3, Math.sin(a) * (t.r1 + 13.5)], r: 6 + r() * 1.8, h: 1.05 + r() * 0.2, seed: r() });
        else {
          const rr = t.r0 - 15 - r() * 4;
          const sz = 6.2 + r() * 2.2;
          const [x, z] = [Math.cos(a) * rr, Math.sin(a) * rr];
          blossom(x, t.y1, z, sz);
        }
      }
      const nL = Math.round(((a1 - a0) * t.r0) / (props.mobile ? 60 : 27));
      for (let i = 0; i <= nL; i++) {
        const a = a0 + (i / nL) * (a1 - a0);
        const [x, z] = polar(a, t.r0 - 0.6);
        k.add(new THREE.CylinderGeometry(0.5, 0.75, 3.2, 6), [x, t.y1 + 3.1, z], [0.6, 0.48, 0.24], { top: [0.98, 0.84, 0.5], glow: 0.08 });
        k.add(new THREE.SphereGeometry(0.85, 8, 6), [x, t.y1 + 5.3, z], [1, 0.9, 0.62], { glow: 0.9 });
        halos.push({ p: [x, t.y1 + 5.3, z], size: 5.5, col: [1, 0.88, 0.58], k: 0.5 });
      }
      const nA = props.mobile ? 6 : ti === 0 ? 16 : 12;
      for (let i = 0; i < nA; i++) {
        const a = a0 + ((i + 0.5) / nA) * (a1 - a0) + (r() - 0.5) * 0.08;
        if (!clearOf(a, 14 / t.r0)) continue;
        const [x, z] = polar(a, t.r0 - 6);
        const s = 10 + (i % 3) * 2;
        const y = angelAt(x, z, s, Math.atan2(x, z) + (r() - 0.5) * 0.5, i % 2 ? 0 : 3, { open: 0.5, glow: 0.12 });
        glows.push({ p: [x, y + s * 1.7, z], size: s * 1.3, col: [1, 0.95, 0.76], k: 0.18 });
      }
      for (const a of [a0, a1]) {
        const [x, z] = polar(a, t.r0 - 4);
        k.box(8, t.y1 - t.y0 + 10, 8, [x, (t.y1 + t.y0) / 2 + 4.4, z], [0.5, 0.4, 0.19], { top: [0.98, 0.84, 0.5], rot: [0, -a, 0], glow: 0.06 });
        k.add(new THREE.SphereGeometry(2.6, 10, 8), [x, t.y1 + 12.4, z], [1, 0.9, 0.6], { glow: 0.9 });
        glows.push({ p: [x, t.y1 + 12.4, z], size: 26, col: [1, 0.86, 0.54], k: 0.5 });
      }
    });
    // trees in blossom at the foot of the steps too, all round the meadow's inner edge (but not across the great flight)
    for (let i = 0; i < (props.mobile ? 30 : 76); i++) {
      const a = (i / 76) * Math.PI * 2 + (r() - 0.5) * 0.03;
      if (offFlight(a) < 0.2 || !clearOf(a, 0.03)) continue;
      const [x, z] = polar(a, ISLE.meadow + 7 + r() * 9);
      const sz = 5.6 + r() * 2.6;
      blossom(x, g(x, z) - 0.4, z, sz);
    }
    for (let i = 0; i < COLONNADE.n; i += 2) {
      const a = ((i + 0.5) / COLONNADE.n) * Math.PI * 2;
      halos.push({ p: [Math.cos(a) * COLONNADE.r, TOP_Y + COLONNADE.h + 8, Math.sin(a) * COLONNADE.r], size: 7, col: [1, 0.9, 0.6], k: 0.55 });
    }
    glows.push({ p: [0, TOP_Y + 30, 0], size: 200, col: [1, 0.9, 0.6], k: 0.1 });

    // ---- flowers: the big ones of his foreground, thick where the plane goes by and up to the foot of the flight
    const blooms: Bloom[] = [];
    const nB = props.mobile ? 3200 : Math.round(11000 * (0.5 + 0.5 * props.effects));
    for (let i = 0; i < nB; i++) {
      const side = r();
      const a = side < 0.74 ? W - 0.25 + r() * 1.85 : r() * Math.PI * 2;
      const d = 529 + Math.pow(r(), 0.7) * 150;
      const [x, z] = polar(a, d);
      const y = g(x, z);
      if (y < 4.6) continue;
      blooms.push({ p: [x, y + 0.55 + r() * 0.5, z], size: 0.5 + r() * r() * 1.1, seed: r() });
    }
    // butterflies over the meadow, and some settled on the sand as in the picture
    const flutter: Flutter[] = [];
    for (let i = 0; i < (props.mobile ? 110 : 320); i++) {
      const a = W - 0.2 + r() * 1.8;
      const onSand = i % 6 === 0;
      const [x, z] = polar(a, onSand ? 690 + r() * 22 : 535 + r() * 150);
      flutter.push({ p: [x, Math.max(g(x, z), 0.1) + (onSand ? 0.12 : 1.4 + r() * 5), z], roam: onSand ? 0 : 3 + r() * 6, size: 0.45 + r() * 0.5, seed: r() });
    }
    // ---- the sky: long low heaps of gold and olive cloud in ranks to the horizon, and one great bank behind the isle
    const near: Heap[] = [];
    const far: Heap[] = [];
    const reach = 2500 * Math.min(1.1, Math.max(0.7, props.far + 0.2));
    for (let z = 2000; z > -reach; z -= 300) {
      const row = Math.round((2000 - z) / 300);
      for (let x = -reach - 400 + (row % 2) * 230; x < reach; x += 460) {
        const cx = x + (r() - 0.5) * 260;
        const cz = z + (r() - 0.5) * 130;
        if (r() < 0.12) continue;
        const w = 220 + r() * 220;
        const h: Heap = { p: [cx, 640 + (r() - 0.5) * 120, cz], w, seed: r(), tall: 0.7 + r() * 0.3 };
        (Math.hypot(cx + 300, cz) < 1200 ? near : far).push(h);
        if (r() < 0.45) far.push({ p: [cx + 200, 900 + (r() - 0.5) * 100, cz + 150], w: w * 0.8, seed: r(), tall: 0.5 });
      }
    }
    for (let i = 0; i < 7; i++) far.push({ p: [500 + i * 150 + (r() - 0.5) * 80, 520 + i * 70 + r() * 60, -900 + (r() - 0.5) * 500 + i * 60], w: 520 - i * 30, seed: r(), tall: 1.25 });
    const heapMat = makeHeapMaterial({});

    // ---- light pouring down through the gaps: on the sea, on the meadow where the company stands, on the flight and the court
    const beams: Beam[] = [];
    const beam = (x: number, z: number, y: number, w: number, kk: number) => beams.push({ foot: [x, y, z], len: 760, w: w * 0.6, k: kk * 0.62 });
    beam(0, 0, TOP_Y, 120, 1.0);
    beam(30, -330, 70, 60, 0.8);
    beam(-20, -470, 20, 46, 0.7);
    beam(...polar(W + 0.22, 620), 6, 70, 0.8);
    for (let i = 0; i < (props.mobile ? 5 : 11); i++) {
      const a = W - 1.0 + r() * 2.6;
      const [x, z] = polar(a, 800 + r() * 900);
      beam(x, z, 0, 50 + r() * 90, 0.45 + r() * 0.4);
    }
    // white birds over the water and round the court
    const flocks: Flock[] = [
      { c: [-900, 60, 300], r: 190, n: props.mobile ? 6 : 12, size: 2.6, speed: 11 },
      { c: [-760, 90, -260], r: 150, n: props.mobile ? 5 : 9, size: 3.0, speed: 10 },
      { c: [-300, 110, -820], r: 170, n: props.mobile ? 5 : 9, size: 2.6, speed: 10 },
      { c: [0, TOP_Y + 100, 0], r: 180, n: props.mobile ? 6 : 14, size: 2.8, speed: 12 },
    ];
    // the procession: two files going up the great flight, step by step
    const files = [-15, 15].map((x) => {
      const pts: THREE.Vector3[] = [];
      for (let d = 600; d > TOP_R - 30; d -= 2.25) {
        const z = -Math.sqrt(d * d - x * x);
        pts.push(new THREE.Vector3(x, d >= ISLE.meadow ? g(x, z) : stoneAt(d), z));
      }
      return pts;
    });
    // haze lying far out on the sea
    const puffs: Puff[] = [];
    // air in layers: banks of mist lying on the sea beyond the shore (the isle is seen across them), a soft wreath
    // about the foot of the great flight and another half-way up it, so the court stands clear above
    for (let i = 0; i < (props.mobile ? 10 : 26); i++) {
      const a = r() * Math.PI * 2;
      const d = 900 + r() * 500;
      puffs.push({ p: [Math.cos(a) * d, 7 + r() * 16, Math.sin(a) * d], size: 170 + r() * 150, a: 0.5 });
    }
    for (let i = 0; i < (props.mobile ? 8 : 20); i++) {
      const a = (i / 20) * Math.PI * 2 + r() * 0.2;
      // (the way up the flight itself is left clear)
      if (Math.abs(a - Math.PI * 1.5) < 0.22) continue;
      puffs.push({ p: [Math.cos(a) * (500 + r() * 50), 20 + r() * 16, Math.sin(a) * (500 + r() * 50)], size: 90 + r() * 70, a: 0.42 });
      if (i % 2 === 0) puffs.push({ p: [Math.cos(a) * (350 + r() * 40), 70 + r() * 18, Math.sin(a) * (350 + r() * 40)], size: 80 + r() * 60, a: 0.34 });
    }
    for (let i = 0; i < (props.mobile ? 8 : 18); i++) {
      const a = r() * Math.PI * 2;
      const d = 1500 + r() * 900;
      puffs.push({ p: [Math.cos(a) * d, 18 + r() * 20, Math.sin(a) * d], size: 200 + r() * 200, a: 0.45 });
    }
    const leaves = makeLeafTexture();
    const cypressGeo = buildTree("cypress", 0, props.mobile ? 0 : 1);
    const broadGeo = buildTree("broad", 1, props.mobile ? 0 : 1);
    const cypM = leafyMesh(cyp, cypressGeo, makeLeafyMaterial(leaves, { lit: [1.3, 1.16, 0.8], shade: [1.25, 1.3, 0.95] }));
    const blossM = leafyMesh(bloss, broadGeo, makeLeafyMaterial(leaves, { lit: [1.08, 1.0, 0.94], shade: [1.05, 0.92, 0.98], bloom: [0.84, 0.36, 0.48] }));
    cypressGeo.dispose();
    broadGeo.dispose();
    return {
      base: props,
      set: k.build(),
      wings: wings.build(),
      wingMat: makeWingMaterial(),
      steps: buildSteps(props.mobile, g),
      cyp: cypM,
      bloss: blossM,
      leaves,
      gardens: buildGardens(props.mobile),
      gardenMat: makeGardenMaterial(),
      rills: buildRills(),
      rillMat: makeRillMaterial(),
      tempera: makeTempera({ amb: 0.84, key: 0.5, dab: 0.8, grain: 0.7, wrap: 0.6, irid: 0.14, rim: [0.5, 0.45, 0.25], rimPow: 3 }),
      stone: makeTempera({ amb: 0.8, key: 0.62, dab: 0.9, wrap: 0.3 }),
      sea: makeSea({ def, sand: SAND, deep: [0.05, 0.1, 0.09], shallow: [0.22, 0.34, 0.2], tint: [0.95, 1.0, 1.02], calm: 0.45 }),
      pool: makeWater({ def, deep: [0.06, 0.12, 0.12], calm: 0.25, tint: [1.0, 1.02, 1.05] }),
      blooms,
      flutter,
      near: heapMesh(heapBlobs(near, 5), heapMat, props.mobile ? 1 : 2),
      far: heapMesh(heapBlobs(far, 9), heapMat, 1),
      heapMat,
      beams,
      flocks,
      files,
      glows,
      halos,
      puffs,
      motes: pointsGeometry(props.mobile ? 200 : Math.round(900 * props.effects), (_, q) => [(q() - 0.5) * 420, TOP_Y * q() + 20 + q() * 120, -620 * q() + 120, 0.5 + q() * 1.3], 9),
      moteMat: makePoints({ a: [1, 0.9, 0.56], b: [1, 0.97, 0.84], scale: 300, drift: 3, gain: 0.7, max: 14 }),
    };
  }, [props.mobile, props.effects > 0.5, props.trees, props.far, props.grass, props.reduced]);
  return (
    <>
      <WorldBase id="paradise" def={def} pal={PARADISE_PAL} props={b.base} tip={[0.44, 0.48, 0.14]} pathTint={[1, 0.95, 0.76]} tall={0.8} mask={GRASS_MASK} groundSize={2600} angels={false} gate="veil" gateSize={[13.5, 21]} />
      <RayedSun size={0.46} gain={0.45} />
      <CloudDeck size={20000} />
      <mesh material={b.sea} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[30000, 30000]} />
      </mesh>
      <mesh geometry={b.steps} material={b.stone} />
      <mesh material={b.pool} rotation={[-Math.PI / 2, 0, 0]} position={[0, TOP_Y + 0.5, 0]}>
        <circleGeometry args={[POOL_R + 0.5, 64]} />
      </mesh>
      <mesh geometry={b.set} material={b.tempera} />
      <mesh geometry={b.gardens} material={b.gardenMat} />
      <mesh geometry={b.rills} material={b.rillMat} renderOrder={1} />
      <primitive object={b.cyp} />
      <primitive object={b.bloss} />
      <mesh geometry={b.wings} material={b.wingMat} />
{/* a boat puts out from the sand as the plane comes to the shore; two more are far out already */}
      <Ship from={[-742, 0.2, 40]} heading={-1.9} reach={380} />
      <Ship from={[-1500, 0.2, -700]} heading={-2.3} sailing scale={1.3} />
      <Ship from={[-900, 0.2, -1500]} heading={-2.6} sailing scale={1.3} />
      {/* white birds go up from the sand as it passes */}
      <RisingFlock origin={[-700, 2, -150]} n={props.mobile ? 20 : 46} reach={170} size={1.7} tint={[1, 1, 0.97]} lit away={[-0.9, -0.4]} seed={7} />
            <Blooms list={b.blooms} />
      <Butterflies list={b.flutter} />
      {b.files.map((f, i) => (
        <Procession key={i} road={f} n={props.mobile ? 14 : 34} speed={1.1} scale={2.7} seed={4 + i} robe={[0.86, 0.82, 0.7]} wing={i ? [0.62, 0.7, 0.9] : [0.92, 0.7, 0.72]} glow={0.12} />
      ))}
      <primitive object={b.near} />
      <primitive object={b.far} />
      <SunShafts list={b.beams} tint={[1, 0.93, 0.66]} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
      <Birds flocks={b.flocks} tint={[1, 1, 0.97]} lit />
      <points geometry={b.motes} material={b.moteMat} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
    </>
  );
}
