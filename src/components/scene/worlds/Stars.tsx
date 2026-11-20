"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { SKY_U } from "../sky";
import { Gallery, Halos, LightGate, LightPath, Mist, useDisposable, type WorldProps } from "./common";
import { Kit, angel, makePoints, makeTempera, pointsGeometry, rng, terrainGeometry, type Halo, type Puff, type V3 } from "./kit";
import { Birds, LightShafts, type Flock, type Shaft } from "./life";
import { linesGeometry, makeCloudPaint, makeLineMaterial, makeRayDiscMaterial, makeSoftMaterial, paintedCloudGeometry, ribbonGeometry, softGeometry, type PCloud, type Seg, type Soft } from "./stars/forms";
import { FIG_KINDS, constellation, heroAngel, makeGlobeGlass, makePyramidVeil, makeStarRiver, makeWaveBand, makeWaveSea, riverGeometry, wingFan } from "./stars/parts";
import { ORIGIN, WORLDS, groundAt, pathOf } from "./voyage";
import { useDeepLens } from "./fairy/shared";
import { Comet } from "./stars/comet";

// Sonata of the Stars (Allegro and Andante, 1908), built as a cosmos to fly through.
//
// What the two paintings hold, and where each thing is here:
//   - the band of the Milky Way drawn level across the whole picture, dark, sown with gold stars
//                                   RIVER: a river of stars 2.8 km long across the sky, spilling a curtain of stars
//   - the angel who walks along it (Andante), wings folded like a sickle     walking on the river before the pyramid
//   - the angel at the pyramid's point, wings raised in a fan of gold strokes, a pale disc behind (Allegro)
//                                   the hero: 80 m tall on the apex, wings slowly breathing, a disc in fine rays
//   - the pyramid: a veil with scalloped bands of cloud across it, stars drawn on it, small ones far off
//                                   PYR: 700 m, three veils one inside another, a column of light in its heart
//   - the glass globe and its halo, a band of stars wound round it (Andante)   GLOBE, turning, ringed, glowing
//   - the brown ribbon sown with blue stars that winds down from the sky    the path itself climbs it to the river
//   - vertical gold strings from the star band, amber worlds threaded on them     threads of light and their orbs
//   - wave-like bands of blue-green, hatched with fine level lines           the sea of waves, and bands in the air
//   - constellations                 figures of stars that draw themselves, line by line, as the plane comes near
//   - a big blue star, small far figures, the bird                           the blue star, angels on the river, birds of light
//
// Zones flown through: the sea of waves and the two paintings; the globe; the winding climb up the star ribbon
// among the constellations; the river of stars, level across the sky, and the angel who walks on it, with the
// pyramid rising through it; the rising turn; and the straight flight in to the angel and the light behind it.

const def = WORLDS.stars;

export const PYR = { x: 0, z: -420, half: 330, h: 700 };
export const RIVER = { y: 430, z: -290, top: 44, fall: 84 };
export const GLOBE = { x: -330, z: 150, r: 150 };
const GOLD: V3 = [1.0, 0.82, 0.46];

export default function StarsWorld({ props }: { props: WorldProps }) {
  // (the near plane at arm's length while this world is flown: far surfaces do not shimmer)
  useDeepLens("stars");
  const wings = useRef<(THREE.Group | null)[]>([]);
  const walker = useRef<THREE.Group>(null);
  const globe = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const b = useDisposable(() => {
    const r = rng(1908);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const fine = !props.mobile;
    const k = new Kit();
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const path = pathOf("stars").pts;
    const nearPath = (x: number, y: number, z: number) => {
      let d = 1e9;
      for (let i = 0; i < path.length; i += 8) d = Math.min(d, Math.hypot(path[i].x - x, path[i].y - y, path[i].z - z));
      return d;
    };

    // ----- the pyramid -----
    const py0 = g(PYR.x, PYR.z) - 8;
    const cone = (k2: number, seg: number) => {
      const c = new THREE.ConeGeometry(PYR.half * k2 * Math.SQRT2, PYR.h * k2, 4, seg, true);
      c.translate(0, (PYR.h * k2) / 2, 0);
      c.rotateY(Math.PI / 4);
      return c;
    };
    const tip = py0 + PYR.h;
    // the angel at its point, the light it stands in, and the pale disc in its rays behind
    const AS = 46;
    heroAngel(k, [PYR.x, tip - 6, PYR.z], AS);
    glows.push({ p: [PYR.x, tip + AS * 0.9, PYR.z + 4], size: 210, col: [1, 0.7, 0.3], k: 0.4 });
    glows.push({ p: [PYR.x, tip - 30, PYR.z], size: 420, col: [0.6, 0.8, 0.6], k: 0.16 });
    halos.push({ p: [PYR.x, tip + AS * 1.69, PYR.z + 3], size: 16, col: [1, 0.95, 0.8], k: 1.3 });
    // (one soft shaft in the great pyramid, and none in the far ones: a tall bright column in every pyramid was too much)
    const shafts: Shaft[] = [{ x: PYR.x, z: PYR.z, y0: py0 - 20, y1: tip + 10, r: 30, k: 0.45 }];
    // two smaller pyramids far off to either hand, as at the top of the Allegro, each with its light
    const farPyr: { p: V3; s: number }[] = [
      { p: [-1150, g(-1150, -900) - 6, -900], s: 0.62 },
      { p: [1050, g(1050, -1050) - 6, -1050], s: 0.74 },
      { p: [1500, g(1500, 100) - 6, 100], s: 0.5 },
    ];
    for (const f of farPyr) {
      glows.push({ p: [f.p[0], f.p[1] + PYR.h * f.s, f.p[2]], size: 260 * f.s, col: [1, 0.86, 0.56], k: 0.5 });
      halos.push({ p: [f.p[0], f.p[1] + PYR.h * f.s, f.p[2]], size: 30 * f.s, col: [1, 0.95, 0.8], k: 1.2 });

    }

    // ----- the river of stars -----
    const bandY = (x: number) => g(x, RIVER.z) + RIVER.y - 8;
    const river = riverGeometry(-1500, 1500, bandY, RIVER.z, RIVER.top, RIVER.fall, props.mobile ? 90 : 180);
    // star dust drifting over it and falling from its brink
    const riverDust = pointsGeometry(
      props.mobile ? 900 : Math.round(1600 + 1600 * props.effects),
      (_, q) => {
        const x = (q() - 0.5) * 2900;
        const sp = q() + q() + q() - 1.5;
        const fall = q() < 0.3 ? q() * q() * 150 : 0;
        return [x, bandY(x) + 3 + Math.abs(sp) * 16 - fall, RIVER.z + sp * 22 + (fall > 0 ? RIVER.top / 2 + q() * 5 : 0), 0.5 + q() * q() * 2.6];
      },
      515,
    );
    // the angel who walks along it, and far along it a long file of small ones (built about the walker's own feet)
    const wk = new Kit();
    angel(wk, [0, 0, 0], 30, Math.PI / 2, [0.22, 0.4, 0.8], { glow: 1.3, wing: [0.5, 0.74, 1], open: 0.26 });
    const file = props.mobile ? 14 : 34;
    for (let i = 0; i < file; i++) {
      const x = -1380 + (i / (file - 1)) * 2760 + (r() - 0.5) * 30;
      if (Math.abs(x - 40) < 120) continue;
      const s = 4.5 + r() * 3.5;
      angel(k, [x, bandY(x) + 0.2, RIVER.z + (r() - 0.5) * 22], s, Math.PI / 2 + (r() - 0.5) * 0.3, r() < 0.5 ? [0.3, 0.5, 0.8] : [0.95, 0.66, 0.3], { glow: 1.5, wing: r() < 0.5 ? [0.6, 0.8, 1] : [1, 0.8, 0.5] });
      glows.push({ p: [x, bandY(x) + s * 1.7, RIVER.z], size: s * 2.4, col: [0.8, 0.9, 1], k: 0.3 });
    }

    // ----- the gold strings from the river, and the worlds threaded on them -----
    const threads: Seg[] = [];
    const orbs: Soft[] = [];
    const nT = props.mobile ? 6 : 9;
    for (let i = 0; i < nT; i++) {
      const x = -1280 + (i / (nT - 1)) * 2560 + (r() - 0.5) * 60;
      const z = RIVER.z + RIVER.top / 2 + 1;
      const y1 = bandY(x) - RIVER.fall * 0.5;
      const y0 = g(x, z) - 4;
      threads.push({ a: [x, y1, z], b: [x, y0, z], w: 1.3, col: GOLD });
      const n = 2 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const y = y0 + 40 + r() * (y1 - y0 - 80);
        const rad = 5 + r() * r() * 22;
        const pick = r();
        const col: V3 = pick < 0.5 ? [0.95, 0.5, 0.2] : pick < 0.75 ? [0.9, 0.72, 0.36] : pick < 0.9 ? [0.86, 0.5, 0.5] : [0.3, 0.46, 0.9];
        orbs.push({ p: [x, y, z], r: rad, col, glow: 0.22, seed: r() });
        glows.push({ p: [x, y, z], size: rad * 4.2, col, k: 0.5 });
        // some wear a ring
        if (rad > 14 && fine) k.add(new THREE.TorusGeometry(rad * 1.7, rad * 0.045, 5, 56), [x, y, z], [1, 0.86, 0.56], { glow: 1.1, rot: [1.2 + r() * 0.5, r() * 3, 0], scale: [1, 1, 0.3] });
      }
    }
    // free worlds hanging in the deep, small and many near, vast and few far off
    for (let i = 0; i < (props.mobile ? 20 : 44); i++) {
      const a = r() * Math.PI * 2;
      const d = 240 + r() * 1300;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 200;
      const y = g(x, z) + 60 + r() * 760;
      const rad = 2.5 + r() * r() * 11;
      if (nearPath(x, y, z) < rad + 26) continue;
      const pick = r();
      const col: V3 = pick < 0.45 ? [0.95, 0.56, 0.24] : pick < 0.7 ? [0.92, 0.8, 0.5] : pick < 0.85 ? [0.5, 0.82, 0.7] : [0.36, 0.5, 0.95];
      orbs.push({ p: [x, y, z], r: rad, col, glow: 0.3, seed: r() });
      if (i % 2 === 0) glows.push({ p: [x, y, z], size: rad * 4.5, col, k: 0.42 });
    }
    const giants: Soft[] = [];
    for (const [x, y, z, rad, cr, cg, cb] of [
      [-1500, 520, -700, 150, 0.8, 0.46, 0.2],
      [1350, 300, -420, 110, 0.3, 0.6, 0.56],
      [900, 760, -1500, 190, 0.86, 0.7, 0.4],
      [-700, 240, -1650, 120, 0.3, 0.4, 0.8],
      [1700, 620, 500, 130, 0.8, 0.5, 0.42],
      [-1700, 300, 500, 100, 0.5, 0.7, 0.5],
    ]) {
      giants.push({ p: [x, y, z], r: rad, col: [cr, cg, cb], glow: 0.1, seed: r() });
      glows.push({ p: [x, y, z], size: rad * 2.8, col: [cr, cg, cb], k: 0.2 });
      k.add(new THREE.TorusGeometry(rad * 1.75, rad * 0.03, 5, 90), [x, y, z], [1, 0.86, 0.56], { glow: 0.9, rot: [1.25, x * 0.01, 0], scale: [1, 1, 0.3] });
    }
    // the great blue star of the Andante, high to the left
    halos.push({ p: [-1100, 1250, -1500], size: 150, col: [0.3, 0.42, 1.0], k: 1.3 });
    glows.push({ p: [-1100, 1250, -1500], size: 520, col: [0.2, 0.3, 0.9], k: 0.3 });

    // ----- the globe of the Andante -----
    const gy = g(GLOBE.x, GLOBE.z) + GLOBE.r * 0.44;
    glows.push({ p: [GLOBE.x, gy + 10, GLOBE.z], size: GLOBE.r * 2.5, col: [0.5, 0.9, 0.64], k: 0.3 });
    glows.push({ p: [GLOBE.x, gy, GLOBE.z], size: GLOBE.r * 0.9, col: [1, 0.88, 0.5], k: 0.5 });
    // its halo: a broad level ring of fine threads, and the band of stars wound round it
    const ring = (rad: number, tilt: THREE.Euler, wobble: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(a * 2) * wobble, Math.sin(a) * rad).applyEuler(tilt));
      }
      return pts;
    };
    const haloRing = ribbonGeometry(ring(GLOBE.r * 1.75, new THREE.Euler(0.16, 0, 0.1), 0), 80, { closed: true, seg: 160 });
    const starRing = ribbonGeometry(ring(GLOBE.r * 1.07, new THREE.Euler(0.62, 0.3, 0.5), 9), 30, { closed: true, seg: 160, roll: () => Math.PI / 2 });

    // ----- the ribbon of stars the path climbs from the globe to the river -----
    const nearest = (x: number, z: number) => {
      let bi = 0;
      for (let i = 0; i < path.length; i++) if (Math.hypot(path[i].x - x, path[i].z - z) < Math.hypot(path[bi].x - x, path[bi].z - z)) bi = i;
      return bi;
    };
    const i0 = nearest(-155, 300);
    const i1 = nearest(-720, -292);
    const sp: THREE.Vector3[] = [];
    for (let i = i0; i <= i1; i += 6) sp.push(new THREE.Vector3(path[i].x, path[i].y - 9, path[i].z));
    const serpent = ribbonGeometry(sp, (t) => 34 * Math.min(1, t * 9, (1 - t) * 9) + 2, { seg: sp.length * 3 });

    // ----- bands of pale blue-green crossing the air -----
    const bands: { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }[] = [];
    const nB = props.mobile ? 3 : 5;
    for (let w = 0; w < nB; w++) {
      const y = 90 + w * 62 + r() * 40;
      const z = 520 - w * 190 + r() * 80;
      const amp = 20 + r() * 40;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const x = -1700 + i * 212;
        pts.push(new THREE.Vector3(x, y + Math.sin(i * 0.7 + w * 1.7) * amp + Math.sin(i * 0.23 + w) * amp, z + Math.cos(i * 0.41 + w) * 90));
      }
      const wide = 70 + r() * 110;
      const { geo } = ribbonGeometry(pts, (t) => wide * (0.5 + 0.5 * Math.sin(t * Math.PI)), { seg: 160, roll: (t) => 0.9 + Math.sin(t * 5 + w) * 0.5 });
      const green = w % 3 !== 2;
      bands.push({ geo, mat: makeWaveBand({ a: green ? [0.04, 0.3, 0.26] : [0.08, 0.14, 0.42], b: green ? [0.3, 0.6, 0.42] : [0.3, 0.44, 0.8], thread: w % 2 ? [0.95, 0.86, 0.5] : [0.6, 0.95, 0.8], lines: 5 + (w % 3) * 2, seed: w * 1.37, gain: 0.8 }) });
    }

    // ----- clouds: rounded, layered, lit gold-green on the side of the light, receding to the horizon -----
    // (the low ones are the painting's own ochre and umber cloud; the high ones are blue-green and far)
    const warm: PCloud[] = [];
    const cool: PCloud[] = [];
    const nC = props.mobile ? 30 : Math.round(44 + 26 * props.effects);
    for (let i = 0; i < nC; i++) {
      const a = r() * Math.PI * 2;
      const low = i % 4 !== 0;
      const d = low ? 560 + r() * 1400 : 1300 + r() * 1100;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 200;
      const w = low ? 44 + r() * 60 + d * 0.02 : 200 + r() * 200;
      const y = low ? g(x, z) + 30 + r() * 110 + w * 0.2 : 600 + r() * 700;
      if (nearPath(x, y, z) < w + 120) continue;
      (low && i % 3 !== 0 ? warm : cool).push({ p: [x, y, z], w, seed: r() });
    }
    // mist lying in the troughs of the waves
    const puffs: Puff[] = [];
    for (let i = 0; i < (props.mobile ? 8 : 18); i++) {
      const x = (r() - 0.5) * 2400;
      const z = 800 - r() * 2000;
      puffs.push({ p: [x, g(x, z) + 6 + r() * 14, z], size: 90 + r() * 140, a: 0.5 });
    }

    // ----- constellations: they draw themselves as the plane comes near -----
    const segs: Seg[] = [];
    const figs: { c: THREE.Vector3; size: number }[] = [];
    const figStars: V3[] = [];
    const nF = props.mobile ? 6 : 9;
    const tan = new THREE.Vector3();
    for (let i = 0; i < nF; i++) {
      const pi = Math.floor((0.05 + (i / nF) * 0.86) * (path.length - 2));
      const p = path[pi];
      tan.subVectors(path[pi + 1], p).normalize();
      const side = i % 2 ? 1 : -1;
      const off = 250 + r() * 240;
      const size = 80 + r() * 80;
      const c = new THREE.Vector3(p.x - tan.z * side * off, 0, p.z + tan.x * side * off);
      c.y = Math.max(g(c.x, c.z) + size + 50, p.y + (r() - 0.25) * 260);
      // (not inside the pyramid, where its veils would hide it)
      if (Math.abs(c.x - PYR.x) + Math.abs(c.z - PYR.z) < PYR.half * 1.1) c.x += side * 420;
      const pick = r();
      constellation(i % FIG_KINDS, figs.length, c, p, size, segs, figStars, pick < 0.6 ? [1, 0.86, 0.52] : pick < 0.85 ? [0.92, 0.96, 1] : [0.55, 0.72, 1]);
      figs.push({ c, size });
    }
    for (const s of figStars) halos.push({ p: s, size: 7 + r() * 7, col: [1, 0.95, 0.82], k: 0.75 });

    // ----- stars near at hand, drifting through everything -----
    const dust = pointsGeometry(props.mobile ? 500 : Math.round(1100 * props.effects + 600), (_, q) => [(q() - 0.5) * 2600, 10 + q() * 1000, 900 - q() * 2400, 0.4 + q() * q() * 1.8], 99);

    // birds of light: over the globe, along the river, round the angel
    const flocks: Flock[] = [
      { c: [GLOBE.x, gy + GLOBE.r + 40, GLOBE.z], r: 190, n: props.mobile ? 6 : 12, size: 1.6, speed: 11 },
      { c: [-300, RIVER.y + 60, RIVER.z + 40], r: 110, n: props.mobile ? 5 : 10, size: 1.5, speed: 10 },
      { c: [PYR.x, tip + 90, PYR.z], r: 150, n: props.mobile ? 6 : 14, size: 2.2, speed: 13 },
      { c: [0, 60, 560], r: 80, n: 7, size: 1.0, speed: 8 },
    ];

    return {
      sea: terrainGeometry(def.terrain!, 4200, props.mobile ? 130 : 220),
      seaMat: makeWaveSea([PYR.x, 520, PYR.z]),
      veils: [0.5, 0.76, 1].map((s, i) => ({ geo: cone(s, 40), mat: makePyramidVeil({ h: PYR.h * s, half: PYR.half * s, alpha: [0.34, 0.34, 0.46][i], seed: i * 2.3 + 1, freq: [0.022, 0.017, 0.013][i], edge: i === 2 ? 1 : 0.12 }) })),
      farVeil: cone(1, 16),
      farPyr,
      farVeilMat: makePyramidVeil({ h: PYR.h, half: PYR.half, alpha: 0.7, seed: 9, freq: 0.012, edge: 0.8 }),
      py0,
      tip,
      AS,
      set: k.build(),
      tempera: makeTempera({ amb: 1, key: 0.5, rim: [0.5, 0.42, 0.2], rimPow: 2.5 }),
      wingL: wingFan(-1, AS),
      wingR: wingFan(1, AS),
      walker: wk.build(),
      disc: makeRayDiscMaterial({ col: [1, 0.66, 0.26], hot: [1, 0.84, 0.5], rays: 120, gain: 0.6, disc: 0.17, near: [60, 420] }),
      river: river.geo,
      riverMat: makeStarRiver({ width: river.width, top: river.top, base: [0.006, 0.012, 0.045], warm: 0.7, flow: 2.2, alpha: 0.84 }),
      riverDust,
      riverDustMat: makePoints({ a: [1.0, 0.92, 0.7], b: [0.7, 0.84, 1.0], scale: 420, gain: 0.9, max: 30, drift: 1.2 }),
      serpent: serpent.geo,
      serpentMat: makeStarRiver({ width: 34, top: 1, base: [0.05, 0.026, 0.014], warm: 0.15, flow: 1.4, alpha: 0.7 }),
      threads: linesGeometry(threads),
      threadMat: makeLineMaterial({ gain: 1.3, minW: 0.0022, flow: 0.6 }),
      orbs: softGeometry(orbs, fine ? 2 : 1),
      giants: softGeometry(giants, 3),
      orbMat: makeSoftMaterial({ shade: [0.35, 0.4, 0.7], under: [0.4, 0.4, 0.6], rim: 1.4, dab: 0.8, amb: 1.2, key: 0.9 }),
      giantMat: makeSoftMaterial({ shade: [0.3, 0.4, 0.7], under: [0.4, 0.4, 0.6], rim: 1.2, dab: 1, amb: 1.1, key: 0.7, fade: [1500, 3000] }),
      warm: paintedCloudGeometry(warm, [0, 100, 300]),
      warmMat: makeCloudPaint({ lit: [1.0, 0.7, 0.34], shade: [0.5, 0.26, 0.12], under: [0.14, 0.12, 0.3], rim: 1.5, self: 0.05, amb: 1.2, key: 1.0, air: 0.7, fade: [1500, 2700], near: [90, 320] }),
      cool: paintedCloudGeometry(cool, [0, 100, 300]),
      coolMat: makeCloudPaint({ lit: [0.4, 0.74, 0.66], shade: [0.12, 0.28, 0.36], under: [0.06, 0.1, 0.3], rim: 1.3, self: 0.03, amb: 1.2, key: 0.9, air: 0.7, fade: [1500, 2700], near: [90, 320] }),
      globeGeo: new THREE.SphereGeometry(GLOBE.r, 72, 48),
      globeMat: makeGlobeGlass(GLOBE.r),
      gy,
      haloRing: haloRing.geo,
      haloRingMat: makeWaveBand({ a: [0.1, 0.4, 0.3], b: [0.5, 0.8, 0.5], thread: [1, 0.9, 0.55], lines: 9, seed: 4.2, gain: 1.3 }),
      starRing: starRing.geo,
      starRingMat: makeStarRiver({ width: 30, top: 1, base: [0.06, 0.03, 0.015], warm: 0.1, flow: 0.8, alpha: 0.85 }),
      bands,
      lines: linesGeometry(segs),
      lineMat: makeLineMaterial({ figs: figs.length, gain: 1.6, minW: 0.0018 }),
      figs,
      puffs,
      shafts,
      flocks,
      halos,
      glows,
      dust,
      dustMat: makePoints({ a: [1.0, 0.9, 0.62], b: [0.74, 0.88, 1.0], scale: 300, gain: 0.9, max: 18, drift: 2.4 }),
    };
  }, [props.mobile, props.effects > 0.5]);

  useFrame(({ camera }) => {
    const t = SKY_U.uTime.value;
    const dt = Math.min(0.25, Math.max(0, t - clock.current));
    clock.current = t;
    // a figure begins to draw itself when the plane comes within sight of it, and once drawn it stays
    const prog = b.lineMat.uniforms.uProg.value as Float32Array;
    const cx = camera.position.x - ORIGIN.x;
    const cy = camera.position.y - ORIGIN.y;
    const cz = camera.position.z - ORIGIN.z;
    b.figs.forEach((f, i) => {
      if (prog[i] > 0 || Math.hypot(f.c.x - cx, f.c.y - cy, f.c.z - cz) < 520 + f.size) prog[i] = Math.min(1, prog[i] + dt / 5 + 1e-4);
    });
    wings.current.forEach((w, i) => w && (w.rotation.z = (i ? -1 : 1) * (0.05 + 0.06 * Math.sin(t * 0.33))));
    if (walker.current) {
      const x = 40 + Math.sin(t * 0.04) * 50;
      walker.current.position.set(x, groundAt(def, x, RIVER.z) + RIVER.y - 8 + Math.abs(Math.sin(t * 1.3)) * 0.5, RIVER.z);
      walker.current.rotation.z = Math.sin(t * 1.3) * 0.015;
    }
    if (globe.current) globe.current.rotation.y = t * 0.012;
  });

  const sh: V3 = [PYR.x, b.tip - 6 + b.AS * 1.34, PYR.z - b.AS * 0.1];
  return (
    <>
      <mesh geometry={b.sea} material={b.seaMat} renderOrder={-5} />
      <LightPath id="stars" def={def} tint={[1, 0.92, 0.7]} gain={1.4} effects={props.effects} angels={false} />
      {/* the way on: only a sheet of light in the pale disc behind the angel (no arch, no pillar) */}
      <LightGate id="stars" def={def} tint={[1, 0.92, 0.7]} gain={1.1} look="veil" />
      <Gallery def={def} />
      <mesh geometry={b.cool} material={b.coolMat} frustumCulled={false} renderOrder={1.2} />
      <mesh geometry={b.warm} material={b.warmMat} frustumCulled={false} renderOrder={1.3} />
      <mesh geometry={b.orbs} material={b.orbMat} frustumCulled={false} />
      <mesh geometry={b.giants} material={b.giantMat} frustumCulled={false} />
      <mesh geometry={b.set} material={b.tempera} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      {/* the pyramids: veils, innermost first */}
      {b.veils.map((v, i) => (
        <mesh key={i} geometry={v.geo} material={v.mat} position={[PYR.x, b.py0, PYR.z]} renderOrder={2 + i * 0.1} />
      ))}
      {b.farPyr.map((f, i) => (
        <mesh key={i} geometry={b.farVeil} material={b.farVeilMat} position={f.p} scale={f.s} renderOrder={1} />
      ))}
      <LightShafts list={b.shafts} tint={[1, 0.9, 0.6]} />
      {/* the angel's wings, breathing, and the disc of light behind */}
      {[-1, 1].map((s, i) => (
        <group key={s} position={[sh[0] + s * b.AS * 0.16, sh[1], sh[2]]} ref={(el) => void (wings.current[i] = el)}>
          <mesh geometry={s < 0 ? b.wingL : b.wingR} material={b.tempera} />
        </group>
      ))}
      <mesh material={b.disc} position={[PYR.x + 40, b.tip + 110, PYR.z - 130]} scale={640} renderOrder={1.5}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      {/* the river of stars and all that hangs from it */}
      <mesh geometry={b.river} material={b.riverMat} renderOrder={3} />
      <points geometry={b.riverDust} material={b.riverDustMat} renderOrder={4} />
      <group ref={walker}>
        <mesh geometry={b.walker} material={b.tempera} />
      </group>
      <mesh geometry={b.serpent} material={b.serpentMat} renderOrder={3} />
      <mesh geometry={b.threads} material={b.threadMat} renderOrder={5} frustumCulled={false} />
      {/* the globe */}
      <group ref={globe} position={[GLOBE.x, b.gy, GLOBE.z]}>
        <mesh geometry={b.starRing} material={b.starRingMat} renderOrder={3.2} />
        <mesh geometry={b.haloRing} material={b.haloRingMat} renderOrder={4} />
      </group>
      <mesh geometry={b.globeGeo} material={b.globeMat} position={[GLOBE.x, b.gy, GLOBE.z]} renderOrder={3} />
      {b.bands.map((w, i) => (
        <mesh key={i} geometry={w.geo} material={w.mat} renderOrder={4} />
      ))}
      <mesh geometry={b.lines} material={b.lineMat} renderOrder={5} frustumCulled={false} />
      {/* a comet crosses the whole sky, slowly, a while after the plane has come; and another much later, higher */}
      <Comet world="stars" id="stars-comet" from={[-1250, 430, -150]} to={[900, 300, -820]} seconds={30} after={24} again={70} tail={620} width={30} />
      <Comet world="stars" id="stars-comet-high" from={[900, 980, 300]} to={[-1100, 760, -600]} seconds={34} after={105} tail={700} width={34} tint={[0.8, 0.9, 1]} />
      <Birds flocks={b.flocks} tint={[2.6, 2.3, 1.5]} lit />
      <points geometry={b.dust} material={b.dustMat} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
