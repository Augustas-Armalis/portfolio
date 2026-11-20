"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildGrove, type Kind, type Tree } from "../Trees";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { Procession, RayedSun, SunShafts, Walkers, heapBlobs, heapMesh, makeHeapMaterial, useDeepLens, type Beam, type Heap } from "./fairy/shared";
import { GATE, buildMassif, massifPoint, needleGeometry } from "./offering/rock";
import { GoldStars, type Star } from "./offering/stars";
import { Wings, seraph } from "./paradise/isle";
import { CloudDeck, makeWingMaterial } from "./paradise/life";
import { WORLDS, groundAt, pathOf } from "./voyage";

// The Offering (Auka, 1909), and the gate of mountains. A long valley of pines climbs to a pass between two
// mountains that lean together until their crests cross a kilometre up, a gate as tall as the sky, the last
// sun burning in it. On the left, a stepped terrace as high as a hill, its dark face set with gold stars, and
// on its edge an angel taller than the pines by fifty times, one arm held out to a ring of pearls that crosses
// the whole sky. On the right, an altar; from its fire a white smoke stands straight up into a pale cloud, and
// a dark one winds across the valley over the plane's head into a great dark cloud behind the angel. Needles
// of rock stand in ranks under the cliffs. Then the gorge: cold shadow, mist, shafts of light let down between
// the leaning walls, stars in the rock, and the way on at its far end.

const def = WORLDS.gate;
export const GATE_PAL: GroundPalette = {
  a: [0.1, 0.135, 0.055],
  b: [0.2, 0.175, 0.07],
  c: [0.065, 0.1, 0.06],
  rock: [0.17, 0.14, 0.15],
  high: [0.2, 0.17, 0.16],
  highAt: [70, 130],
  hook: {
    decl: /* glsl */ `
      float gateRoad(float z){ float t = clamp((z - 950.0) / (20.0 - 950.0), 0.0, 1.0); t = t * t * (3.0 - 2.0 * t); return 60.0 + 245.0 * pow(t, 1.4) + 14.0 * sin(z * 0.011); }
    `,
    lit: /* glsl */ `
      {
        vec3 light = uSkyCol * 0.7 + uKeyCol * (0.22 + 0.5 * max(uKeyDir.y, 0.0)) * sunUp;
        // broad dark drifts where the pines stand, so the valley is never one lawn
        float wood = smoothstep(0.42, 0.62, vnoise(p * 0.0042 + 3.0) * 0.65 + vnoise(p * 0.013) * 0.35) * smoothstep(40.0, 110.0, abs(p.x));
        col = mix(col, vec3(0.03, 0.055, 0.04) * light, wood * 0.75);
        // scree and bare rock at the mountains' feet and all through the gorge
        float md = length(vec2((abs(p.x) - ${GATE.off.toFixed(1)}) / ${GATE.rx.toFixed(1)}, (p.y - (${GATE.z.toFixed(1)})) / ${GATE.rz.toFixed(1)}));
        float scree = 1.0 - smoothstep(0.92, 1.5, md + (vnoise(p * 0.03) - 0.5) * 0.3);
        scree = max(scree, (1.0 - smoothstep(150.0, 240.0, abs(p.x))) * smoothstep(-120.0, -260.0, p.y) * smoothstep(-1240.0, -1120.0, p.y));
        vec3 stone = mix(vec3(0.09, 0.075, 0.1), vec3(0.3, 0.2, 0.13), vnoise(p * 0.11 + 7.0)) * (0.75 + 0.5 * vnoise(p * 0.6));
        col = mix(col, stone * light, scree * 0.9);
        // the pale road of those who come up to the altar
        float way = (1.0 - smoothstep(2.6, 4.4, abs(p.x - gateRoad(p.y)))) * step(20.0, p.y) * step(p.y, 1460.0);
        col = mix(col, vec3(0.5, 0.42, 0.27) * light, way * 0.85);
      }
    `,
  },
};

const TERRACE = { x: -330, z: 330, w: 220, d: 290, h: 150 };
// the road of those who bring the offering: up the valley and across to the altar's foot
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const roadX = (z: number) => 60 + 245 * Math.pow(sm(950, 20, z), 1.4) + 14 * Math.sin(z * 0.011);
const ALTAR = { x: 320, z: -40 };
const SEEDS = [1.3, 4.1];
// (grass in the open valley only: not on the scree, thin under the pines)
const GRASS_MASK = `float md = length(vec2((abs(p.x) - ${GATE.off.toFixed(1)}) / ${GATE.rx.toFixed(1)}, (p.y - (${GATE.z.toFixed(1)})) / ${GATE.rz.toFixed(1)})); float scree = max(1.0 - smoothstep(0.92, 1.5, md), (1.0 - smoothstep(150.0, 240.0, abs(p.x))) * smoothstep(-120.0, -260.0, p.y) * smoothstep(-1240.0, -1120.0, p.y)); float wood = smoothstep(0.42, 0.62, vnoise(p * 0.0042 + 3.0) * 0.65 + vnoise(p * 0.013) * 0.35) * smoothstep(40.0, 110.0, abs(p.x)); return (1.0 - scree) * (1.0 - wood * 0.85);`;

export default function GateWorld({ props }: { props: WorldProps }) {
  useDeepLens("gate");
  const b = useDisposable(() => {
    const r = rng(1909);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const pts = pathOf("gate").pts;
    const nearPath = (x: number, z: number, d: number) => pts.some((q, j) => j % 3 === 0 && Math.hypot(q.x - x, q.z - z) < d);
    const k = new Kit();
    const wings = new Wings();
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const stars: Star[] = [];

    // ---- the terrace: a great block with tiers stepping away behind it, a frieze along its edge
    const ty = g(TERRACE.x, TERRACE.z);
    const top = ty + TERRACE.h;
    const dark: V3 = [0.035, 0.07, 0.08];
    k.box(TERRACE.w, TERRACE.h + 40, TERRACE.d, [TERRACE.x, top - (TERRACE.h + 40) / 2, TERRACE.z], [0.02, 0.035, 0.05], { top: dark });
    k.box(TERRACE.w + 5, 7, TERRACE.d + 5, [TERRACE.x, top - 3.5, TERRACE.z], [0.34, 0.27, 0.1], { top: [0.62, 0.5, 0.2], glow: 0.06 });
    for (let i = 0; i < Math.round(TERRACE.d / 9); i++) k.box(1.6, 5, 4.5, [TERRACE.x + TERRACE.w / 2 + 2.6, top - 3.4, TERRACE.z - TERRACE.d / 2 + 4.5 + i * 9], [0.1, 0.16, 0.14], { glow: 0.02 });
    for (let i = 0; i < Math.round(TERRACE.w / 9); i++) k.box(4.5, 5, 1.6, [TERRACE.x - TERRACE.w / 2 + 4.5 + i * 9, top - 3.4, TERRACE.z + TERRACE.d / 2 + 2.6], [0.1, 0.16, 0.14], { glow: 0.02 });
    for (let i = 1; i <= 6; i++) {
      const w = TERRACE.w - 30 * i;
      k.box(w, 26, TERRACE.d - 16 * i, [TERRACE.x - 15 * i - 20, top + 26 * (i - 0.5), TERRACE.z - 6 * i], [0.1, 0.085, 0.06], { top: [0.3, 0.25, 0.12] });
      k.box(w + 3, 2.6, TERRACE.d - 16 * i + 3, [TERRACE.x - 15 * i - 20, top + 26 * i - 1.3, TERRACE.z - 6 * i], [0.36, 0.3, 0.12], { top: [0.56, 0.46, 0.2], glow: 0.04 });
    }
    // the stars set in its dark face: toward the valley, and toward whoever comes up it
    for (let i = 0; i < (props.mobile ? 30 : 70); i++) {
      const v = ty + 18 + Math.pow(r(), 0.8) * (TERRACE.h - 34);
      const size = 2.2 + r() * r() * 5;
      if (i % 3 !== 0) stars.push({ p: [TERRACE.x + TERRACE.w / 2 + 1.2, v, TERRACE.z + (r() - 0.5) * (TERRACE.d - 14)], size });
      else stars.push({ p: [TERRACE.x + (r() - 0.5) * (TERRACE.w - 14), v, TERRACE.z + TERRACE.d / 2 + 1.2], size });
    }
    // the angel on its edge: colossal, pale, broad-winged, one arm held out to the ring
    const AS = 62;
    const ax = TERRACE.x + TERRACE.w / 2 - 22;
    const az = TERRACE.z + 70;
    seraph(k, wings, [ax, top, az], AS, Math.PI / 2, { robe: [0.8, 0.77, 0.7], wing: [0.74, 0.72, 0.7], pose: 5, glow: 0.14, open: 0.55, wide: 2.7, phase: 1.2 });
    const hand = new THREE.Vector3(ax + 0.52 * AS, top + 1.5 * AS, az - 0.13 * AS);
    glows.push({ p: [ax, top + AS * 1.7, az], size: 110, col: [1, 0.92, 0.74], k: 0.3 });

    // ---- the ring of pearls that crosses the whole sky, through the angel's hand
    const RING = 900;
    const ru = new THREE.Vector3(1, 0, 0);
    const rv = new THREE.Vector3(0, 0.94, -0.34);
    const th = Math.PI + 0.75;
    const rc = hand.clone().addScaledVector(ru, -Math.cos(th) * RING).addScaledVector(rv, -Math.sin(th) * RING);
    const pearlGeo = new THREE.SphereGeometry(1, 8, 6);
    const nP = props.mobile ? 180 : 340;
    for (let i = 0; i < nP; i++) {
      const t = (i / nP) * Math.PI * 2;
      const p = rc.clone().addScaledVector(ru, Math.cos(t) * RING).addScaledVector(rv, Math.sin(t) * RING);
      if (p.y < g(p.x, p.z) - 4) continue;
      const big = i % 6 === 0;
      k.add(pearlGeo.clone(), [p.x, p.y, p.z], [0.98, 0.84, 0.56], { glow: 0.85, scale: big ? [6.4, 6.4, 6.4] : [4.2, 4.2, 4.2] });
      if (i % 3 === 0) halos.push({ p: [p.x, p.y, p.z], size: big ? 22 : 13, col: [1, 0.84, 0.54], k: 0.42 });
    }
    pearlGeo.dispose();

    // ---- the altar: three great steps, the fire on it
    const ay = g(ALTAR.x, ALTAR.z);
    const steps: [number, number][] = [
      [86, 26],
      [64, 22],
      [44, 20],
    ];
    let sy = ay - 4;
    for (const [w, h] of steps) {
      k.box(w, h, w, [ALTAR.x, sy + h / 2, ALTAR.z], [0.13, 0.08, 0.1], { top: [0.42, 0.24, 0.14] });
      k.box(w + 2.4, 2.2, w + 2.4, [ALTAR.x, sy + h - 1.1, ALTAR.z], [0.4, 0.22, 0.1], { top: [0.7, 0.42, 0.16], glow: 0.05 });
      sy += h;
    }
    const fireY = sy;
    k.box(18, 2.4, 18, [ALTAR.x, fireY + 1.2, ALTAR.z], [1, 0.58, 0.2], { glow: 1.7 });
    halos.push({ p: [ALTAR.x, fireY + 6, ALTAR.z], size: 34, col: [1, 0.6, 0.24], k: 1.2 });
    glows.push({ p: [ALTAR.x, fireY + 20, ALTAR.z], size: 170, col: [1, 0.62, 0.28], k: 0.5 });

    // ---- the two smokes
    const white: Heap[] = [];
    const darkS: Heap[] = [];
    const lobes = (list: Heap[], x: number, y: number, z: number, w: number, tall = 1, n?: number) => list.push({ p: [x, y, z], w, seed: r(), tall, lobes: n });
    const nW = props.mobile ? 34 : 70;
    for (let i = 0; i < nW; i++) {
      const t = i / (nW - 1);
      // the white one stands straight up, a slim stem...
      lobes(white, ALTAR.x + Math.sin(t * 9) * 9 * t + (r() - 0.5) * 6, fireY + 10 + t * 640, ALTAR.z - t * 60 + Math.cos(t * 7) * 8, 44 + t * 60 + r() * 16, 1.4, 1);
    }
    // ...and opens into a wide pale cloud
    for (let i = 0; i < (props.mobile ? 16 : 34); i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 250;
      lobes(white, ALTAR.x - 40 + Math.cos(a) * d * 1.3, fireY + 700 + (r() - 0.3) * 150 - d * 0.2, ALTAR.z - 100 + Math.sin(a) * d * 0.7, 120 + r() * 150 - d * 0.2, 0.8, 4);
    }
    const nD = props.mobile ? 40 : 84;
    const darkAt = (t: number): V3 => [ALTAR.x - 760 * Math.pow(t, 1.15) + Math.sin(t * 10) * (30 + 70 * t), fireY + 8 + 560 * Math.pow(t, 0.8) + Math.sin(t * 7) * 30, ALTAR.z + 330 * t + Math.cos(t * 8) * 40];
    for (let i = 0; i < nD; i++) {
      const t = i / (nD - 1);
      const p = darkAt(t);
      // the dark one winds across the valley, thickening as it goes
      lobes(darkS, p[0] + (r() - 0.5) * 8, p[1], p[2] + (r() - 0.5) * 8, 40 + t * 130 + r() * 22, 1.1, 1);
    }
    const dEnd = darkAt(1);
    for (let i = 0; i < (props.mobile ? 22 : 46); i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 380;
      lobes(darkS, dEnd[0] - 110 + Math.cos(a) * d * 1.1, dEnd[1] + 40 + (r() - 0.5) * 130, dEnd[2] + 30 + Math.sin(a) * d * 0.6, 150 + r() * 170 - d * 0.15, 0.75, 4);
    }
    const smokeW = makeHeapMaterial({ lit: [1.18, 1.3, 1.7], shade: [2.6, 2.8, 2.7], rim: 0.8, drift: 0.15, rise: 1 });
    const smokeD = makeHeapMaterial({ lit: [0.2, 0.2, 0.34], shade: [0.2, 0.22, 0.34], rim: 0.55, drift: 0.15, rise: 1 });

    // ---- needles of rock in ranks: under the terrace's starry face, at the mountains' feet, by the altar
    const needles: THREE.BufferGeometry[] = [];
    const needle = (x: number, z: number, h: number) => {
      const y = g(x, z);
      const kind = r();
      const col: V3 = kind < 0.4 ? [0.3, 0.13, 0.06] : kind < 0.7 ? [0.11, 0.075, 0.13] : [0.17, 0.12, 0.06];
      const tip: V3 = kind < 0.4 ? [0.74, 0.36, 0.13] : kind < 0.7 ? [0.36, 0.24, 0.38] : [0.56, 0.4, 0.16];
      const geo = needleGeometry(h, 2.6 + h * 0.062, r() * 100, col, tip);
      geo.translate(x, y + h / 2 - 3, z);
      needles.push(geo);
    };
    const nN = props.mobile ? 110 : 300;
    for (let i = 0, guard = 0; i < nN && guard < nN * 8; guard++) {
      const zone = r();
      let x: number;
      let z: number;
      let h: number;
      if (zone < 0.3) {
        // before the terrace, thick, tall and short together
        x = TERRACE.x + TERRACE.w / 2 + 8 + r() * r() * 130;
        z = TERRACE.z - TERRACE.d / 2 - 40 + r() * (TERRACE.d + 150);
        h = 30 + r() * r() * 110;
      } else if (zone < 0.82) {
        const side = r() < 0.5 ? -1 : 1;
        const a = side > 0 ? -0.9 + r() * 2.9 : Math.PI - 2.0 + r() * 2.9;
        const d = 0.9 + r() * 0.5;
        x = side * GATE.off + Math.cos(a) * GATE.rx * d;
        z = GATE.z + Math.sin(a) * GATE.rz * d + 40;
        h = 40 + r() * r() * 190;
      } else {
        const a = r() * Math.PI * 2;
        x = ALTAR.x + Math.cos(a) * (60 + r() * 90);
        z = ALTAR.z + Math.sin(a) * (60 + r() * 90);
        h = 24 + r() * 70;
      }
      if (Math.abs(x) < 60 || nearPath(x, z, 46)) continue;
      needle(x, z, h);
      i++;
    }
    const needleGeo = mergeGeometries(needles)!;
    needles.forEach((q) => q.dispose());
    needleGeo.computeBoundingSphere();

    // ---- stars in the rock of the gorge itself, on the faces that look in
    for (let i = 0; i < (props.mobile ? 60 : 170); i++) {
      const side = i % 2 ? 1 : -1;
      const a = side > 0 ? Math.PI + (r() - 0.5) * 1.5 : (r() - 0.5) * 1.5;
      const q = massifPoint(side, SEEDS[side > 0 ? 1 : 0], a, 0.03 + Math.pow(r(), 1.3) * 0.36);
      const inward = -Math.sign(q.p.x);
      stars.push({ p: [q.p.x + inward * 2.5, q.p.y + 8, q.p.z + GATE.z], size: 1.6 + r() * r() * 4.5 });
    }

    // ---- pines and spruces along the valley, in stands, dark against the mist
    const trees: (Tree & { y: number })[] = [];
    const stands = props.mobile ? 44 : Math.round(120 * props.trees);
    for (let s = 0; s < stands; s++) {
      const side = s % 2 ? 1 : -1;
      const cz = 1500 - r() * 1600;
      const cx = side * (46 + Math.pow(r(), 1.5) * 780 * Math.min(1, props.far + 0.1));
      const kinds: Kind[] = s % 3 === 0 ? ["spruce", "spruce", "pine"] : s % 3 === 1 ? ["pine", "pine", "spruce"] : ["pine", "spruce", "spruce"];
      const n = props.mobile ? 3 : 5 + Math.floor(r() * 7);
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 44;
        const z = cz + (r() - 0.5) * 40;
        if (nearPath(x, z, 14) || def.canvases.some((c) => Math.hypot(x - c.x, z - c.z) < 34)) continue;
        if (Math.abs(x - TERRACE.x) < TERRACE.w / 2 + 30 && Math.abs(z - TERRACE.z) < TERRACE.d / 2 + 16) continue;
        if (Math.hypot(x - ALTAR.x, z - ALTAR.z) < 62) continue;
        if (Math.hypot((Math.abs(x) - GATE.off) / GATE.rx, (z - GATE.z) / GATE.rz) < 0.95) continue;
        if (Math.abs(x - roadX(z)) < 9) continue;
        trees.push({ x, z, y: g(x, z), s: 1.5 + r() * 1.4, kind: kinds[Math.floor(r() * kinds.length)], v: Math.floor(r() * 2), rot: r() * 6.28, tint: r() });
      }
    }
    const grove = buildGrove(trees, { mobile: true, fog: 0.0009, cell: 420, tint: [0.66, 0.7, 0.78] });

    // ---- mist: lying in the gorge and rolling out of it, and low along the valley
    const puffs: Puff[] = [];
    for (let i = 0; i < (props.mobile ? 16 : 40); i++) {
      const z = GATE.z + 620 - r() * 1100;
      puffs.push({ p: [(r() - 0.5) * 170, g(0, z) + 8 + r() * r() * 120, z], size: 46 + r() * 70, a: 0.5 });
    }
    for (let i = 0; i < (props.mobile ? 10 : 26); i++) puffs.push({ p: [(r() - 0.5) * 1100, 0, 1300 - r() * 1400], size: 90 + r() * 110, a: 0.5 });
    for (const p of puffs) if (p.p[1] === 0) p.p[1] = g(p.p[0], p.p[2]) + 12 + r() * 16;
    // ---- light let down into the gorge between the leaning walls
    const beams: Beam[] = [];
    for (let i = 0; i < (props.mobile ? 6 : 12); i++) {
      const z = GATE.z + 420 - (i / 11) * 900 + (r() - 0.5) * 40;
      beams.push({ foot: [(r() - 0.5) * 110, g(0, z) - 6, z], len: 640, w: 16 + r() * 26, k: 0.7 + r() * 0.6 });
    }
    // a low rank of gilded cloud far beyond the pass and to the sides
    const far: Heap[] = [];
    for (let i = 0; i < (props.mobile ? 20 : 54); i++) {
      const a = r() * Math.PI * 2;
      const d = 1700 + r() * 1000;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.abs(x) < 520 && z < 0) continue;
      far.push({ p: [x, 420 + r() * 380, z], w: 220 + r() * 260, seed: r(), tall: 0.6 });
    }
    const flocks: Flock[] = [
      { c: [0, 460, GATE.z + 430], r: 150, n: props.mobile ? 8 : 18, size: 3.4, speed: 14 },
      { c: [0, 250, GATE.z + 560], r: 110, n: props.mobile ? 6 : 12, size: 2.4, speed: 12 },
      { c: [ALTAR.x, 420, ALTAR.z], r: 110, n: props.mobile ? 5 : 10, size: 2.2, speed: 10 },
      { c: [0, 120, 800], r: 170, n: props.mobile ? 6 : 12, size: 1.6, speed: 11 },
    ];
    // ---- those who bring the offering: a road up the valley to the altar, small figures on it, each with a light
    const road: THREE.Vector3[] = [];
    for (let z = 1440; z > 24; z -= 4) road.push(new THREE.Vector3(roadX(z), g(roadX(z), z), z));
    return {
      base: { ...props, grass: props.grass * 0.6 },
      left: buildMassif(-1, SEEDS[0], props.mobile),
      right: buildMassif(1, SEEDS[1], props.mobile),
      rock: makeTempera({ amb: 0.74, key: 0.6, strata: 1.1, dab: 1.4, grain: 1.2, wrap: 0.5, rim: [0.3, 0.17, 0.07], rimPow: 4 }),
      needles: needleGeo,
      set: k.build(),
      tempera: makeTempera({ amb: 0.9, key: 0.4, strata: 0.5, grain: 1, wrap: 0.5, rim: [0.5, 0.36, 0.16], rimPow: 3 }),
      wings: wings.build(),
      wingMat: makeWingMaterial(),
      white: heapMesh(heapBlobs(white, 3), smokeW, 2),
      dark: heapMesh(heapBlobs(darkS, 7), smokeD, 2),
      far: heapMesh(heapBlobs(far, 11), makeHeapMaterial({}), 1),
      smokeW,
      smokeD,
      grove,
      puffs,
      beams,
      flocks,
      stars,
      halos,
      glows,
      road,
      sparks: pointsGeometry(props.mobile ? 60 : 160, (_, q) => [ALTAR.x + (q() - 0.5) * 26, fireY + 4 + q() * q() * 150, ALTAR.z + (q() - 0.5) * 26, 0.6 + q() * 1.2], 21),
      sparkMat: makePoints({ a: [1, 0.6, 0.2], b: [1, 0.86, 0.5], scale: 260, drift: 5, gain: 1.2, max: 14 }),
    };
  }, [props.mobile, props.trees, props.far, props.grass, props.reduced, props.effects > 0.5]);
  return (
    <>
      <WorldBase id="gate" def={def} pal={GATE_PAL} props={b.base} tip={[0.4, 0.36, 0.14]} pathTint={[1, 0.86, 0.6]} groundSize={5600} angels={false} mask={GRASS_MASK} />
      <RayedSun size={0.5} gain={0.9} />
      <CloudDeck y={1500} size={9000} />
      <group position={[0, 0, GATE.z]}>
        <mesh geometry={b.left} material={b.rock} />
        <mesh geometry={b.right} material={b.rock} />
      </group>
      <mesh geometry={b.needles} material={b.rock} />
      <mesh geometry={b.set} material={b.tempera} />
      <mesh geometry={b.wings} material={b.wingMat} />
      <primitive object={b.white} />
      <primitive object={b.dark} />
      <primitive object={b.far} />
      {b.grove.sets.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
      <Procession road={b.road} n={props.mobile ? 30 : 80} speed={1.2} scale={3.2} robe={[0.2, 0.17, 0.2]} wing={[0.16, 0.13, 0.16]} glow={0.02} seed={12} />
      <Walkers road={b.road} n={props.mobile ? 30 : 80} speed={1.2} size={1.0} seed={12} lift={4.4} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <GoldStars list={b.stars} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
      <points geometry={b.sparks} material={b.sparkMat} />
      <SunShafts list={b.beams} tint={[1, 0.84, 0.54]} dir={[0.07, 1, 0.1]} />
      <Birds flocks={b.flocks} tint={[0.1, 0.08, 0.08]} />
    </>
  );
}
