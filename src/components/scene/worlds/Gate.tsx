"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SKY_U } from "../sky";
import { buildGrove, type Kind, type Tree } from "../Trees";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { GLSL_GROUND_LIFE, Kindling, archGeometry, Procession, RayedSun, RisingFlock, SunShafts, Walkers, boulderGeometry, heapBlobs, heapMesh, makeHeapMaterial, useDeepLens, type Beam, type Heap, type Lamp } from "./fairy/shared";
import { GATE, buildMassif, massifPoint, needleGeometry } from "./offering/rock";
import { GoldStars, type Star } from "./offering/stars";
import { Wings, seraph } from "./paradise/isle";
import { CloudDeck, makeWingMaterial } from "./paradise/life";
import { ORIGIN, WORLDS, gateOf, groundAt, pathOf, voyage } from "./voyage";

// The Offering (Auka, 1909), and the gate of mountains. A long valley of pines climbs to a pass between two
// mountains that lean together until their crests cross a kilometre up, a gate as tall as the sky, the last
// sun burning in it. On the left, a stepped terrace as high as a hill, its dark face set with gold stars, and
// on its edge an angel taller than the pines by fifty times, one arm held out to a ring of pearls that crosses
// the whole sky. On the right, an altar; from its fire a white smoke stands straight up into a pale cloud, and
// a dark one winds across the valley over the plane's head into a great dark cloud behind the angel. Needles
// of rock stand in ranks under the cliffs. Then the gorge: cold shadow, mist, shafts of light let down between
// the leaning walls, stars in the rock, and the way on at its far end.

const def = WORLDS.gate;
const TERRACE = { x: -330, z: 330, w: 220, d: 290, h: 150 };
const ALTAR = { x: 320, z: -40 };
// The citadel's long walls, as lines on the map. Each goes on until it meets rock or is lost in the haze.
const WALLS: { pts: [number, number][]; h: number; every: number; far?: boolean }[] = [
  // out along the ridge to the west, over the hill and on toward the far heights
  { pts: [[-440, 300], [-560, 330], [-690, 380], [-810, 450], [-920, 540], [-1040, 660], [-1180, 800], [-1340, 960], [-1520, 1110], [-1720, 1250], [-1940, 1370]], h: 44, every: 2 },
  // a branch north from the ridge, down to the flank of the left mountain, where it runs into the rock
  { pts: [[-690, 380], [-770, 220], [-810, 40], [-800, -150], [-750, -320], [-690, -430]], h: 40, every: 2 },
  // the wing across the valley, along the eastern height
  { pts: [[560, 120], [690, 270], [800, 450], [880, 660], [980, 880], [1120, 1090], [1300, 1270], [1520, 1420]], h: 40, every: 2 },
  // and far off, on the heights that close the world: walls and towers that are only shapes in the haze
  { pts: [[-2150, 300], [-2230, 0], [-2210, -320], [-2100, -640], [-1930, -930]], h: 60, every: 1, far: true },
  { pts: [[1750, 900], [1980, 640], [2140, 340], [2220, 20], [2200, -320]], h: 60, every: 1, far: true },
  { pts: [[-900, 2050], [-560, 2180], [-200, 2230], [180, 2220], [540, 2150]], h: 60, every: 1, far: true },
];
const nearWall = (x: number, z: number, d: number) =>
  WALLS.some((w) =>
    w.pts.some((p, i) => {
      if (i === 0) return false;
      const [x0, z0] = w.pts[i - 1];
      const dx = p[0] - x0;
      const dz = p[1] - z0;
      const t = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - x0 - dx * t, z - z0 - dz * t) < d;
    }),
  );
export const GATE_PAL: GroundPalette = {
  a: [0.1, 0.135, 0.055],
  b: [0.2, 0.175, 0.07],
  c: [0.065, 0.1, 0.06],
  rock: [0.17, 0.14, 0.15],
  high: [0.2, 0.17, 0.16],
  highAt: [70, 130],
  hook: {
    decl: /* glsl */ `
      ${GLSL_GROUND_LIFE}
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
        // heather and yellow flowers in drifts, stones, strokes of turf: the open valley is never one lawn
        col = groundLife(col, p, gd, px, light, (1.0 - scree) * (1.0 - wood * 0.8) * (1.0 - way), vec3(0.62, 0.4, 0.7), vec3(0.95, 0.72, 0.24));
        // what stands on the ground shades it: the terrace, the altar
        { vec2 q = abs(p - vec2(${TERRACE.x.toFixed(1)}, ${TERRACE.z.toFixed(1)})) - vec2(${(TERRACE.w / 2).toFixed(1)}, ${(TERRACE.d / 2).toFixed(1)}); col *= mix(0.45, 1.0, smoothstep(0.0, 34.0, length(max(q, 0.0)))); }
        { vec2 q = abs(p - vec2(-316.0, -6.0)) - vec2(22.0, 196.0); col *= mix(0.5, 1.0, smoothstep(0.0, 30.0, length(max(q, 0.0)))); }
        { vec2 q = abs(p - vec2(-400.0, 565.0)) - vec2(150.0, 105.0); col *= mix(0.5, 1.0, smoothstep(0.0, 30.0, length(max(q, 0.0)))); }
        { vec2 q = abs(p - vec2(-470.0, 772.0)) - vec2(135.0, 104.0); col *= mix(0.5, 1.0, smoothstep(0.0, 30.0, length(max(q, 0.0)))); }
        { vec2 q = abs(p - vec2(${ALTAR.x.toFixed(1)}, ${ALTAR.z.toFixed(1)})) - vec2(43.0); col *= mix(0.5, 1.0, smoothstep(0.0, 18.0, length(max(q, 0.0)))); }
      }
    `,
  },
};

// the road of those who bring the offering: up the valley and across to the altar's foot
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const roadX = (z: number) => 60 + 245 * Math.pow(sm(950, 20, z), 1.4) + 14 * Math.sin(z * 0.011);
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
    // (where the citadel stands: the terrace, the wall behind it, the lower terraces, the ridge wall)
    const inCitadel = (x: number, z: number) =>
      (x < -236 && x > -660 && z > -200 && z < 890) || (x < -220 && x > -450 && Math.abs(z - TERRACE.z) < TERRACE.d / 2 + 16) || nearWall(x, z, 44) || (x < -380 && x > -620 && z > 860 && z < 1110) || (x > -300 && x < -186 && Math.abs(z - 128) < 40);
    const GT = def.gate!;
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
    // ---- the citadel the terrace is the prow of: a great wall running back to the mountain with stepped towers on
    // it and a gate in it, lower terraces going down the valley and into the hill, a wall out along the ridge,
    // and stairs from the valley floor up to the angel's platform
    const ochreLo: V3 = [0.34, 0.27, 0.1];
    const ochreHi: V3 = [0.62, 0.5, 0.2];
    const slab = (x: number, z: number, w: number, d: number, yTop: number, yaw = 0, frieze = true) => {
      const cs = Math.cos(yaw);
      const sn = Math.sin(yaw);
      let gy = 1e9;
      for (const [u, v] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ])
        gy = Math.min(gy, g(x + (cs * u * w) / 2 + (sn * v * d) / 2, z - (sn * u * w) / 2 + (cs * v * d) / 2));
      gy -= 30;
      if (yTop - gy < 4) return;
      k.box(w, yTop - gy, d, [x, (yTop + gy) / 2, z], [0.02, 0.035, 0.05], { top: dark, rot: [0, yaw, 0] });
      // (its paving stands a hand above the block's own top, so the two never lie in one plane)
      if (frieze) k.box(w + 4, 5.6, d + 4, [x, yTop - 2.2, z], ochreLo, { top: ochreHi, glow: 0.06, rot: [0, yaw, 0] });
    };
    // a stepped tower, tier on tier, a lamp in its crown
    const ziggurat = (x: number, z: number, base: number, y0: number, h: number, tiers = 4) => {
      for (let i = 0; i < tiers; i++) {
        const w = base * (1 - (i / tiers) * 0.72);
        slab(x, z, w, w, y0 + (h * (i + 1)) / tiers, 0, true);
      }
      k.box(base * 0.14, base * 0.2, base * 0.14, [x, y0 + h + base * 0.1, z], [1, 0.74, 0.36], { glow: 1.2 });
      halos.push({ p: [x, y0 + h + base * 0.12, z], size: base * 0.34, col: [1, 0.78, 0.42], k: 0.6 });
    };
    const WALL_TOP = ty + 96;
    // the wall back to the mountain, a narrower walk on top of it
    for (const [x, z, len] of [
      [-305, 120, 136],
      [-316, -8, 136],
      [-332, -132, 124],
    ] as const) {
      slab(x, z, 36, len, WALL_TOP);
      slab(x - 6, z, 16, len - 8, WALL_TOP + 22);
    }
    ziggurat(-312, 52, 60, WALL_TOP, 140);
    ziggurat(-326, -78, 54, WALL_TOP, 118);
    // its gate, toward the valley: a deep pointed arch with the light of the inner court in it, and a broad stair up to it
    {
      const gx = -305 + 18;
      const gz = 128;
      const gy = g(gx + 30, gz);
      k.add(archGeometry(24, 54, 10, 16), [gx + 4, gy + 12, gz], ochreLo, { top: ochreHi, rot: [0, Math.PI / 2, 0], glow: 0.08 });
      k.add(archGeometry(21, 51.5, 1.6, 18), [gx + 4, gy + 12, gz], [0.1, 0.16, 0.14], { top: ochreLo, rot: [0, Math.PI / 2, 0], glow: 0.04 });
      k.box(1.2, 50, 20.5, [gx + 0.8, gy + 12 + 25, gz], [1, 0.56, 0.18], { top: [0.14, 0.06, 0.07], glow: 0.7 });
      for (let i = 0; i < 9; i++) k.box(7.4, 14 - i * 1.5 + 30, 44 - i, [gx + 14 + i * 7, gy + 12 - i * 1.5 - (14 - i * 1.5 + 30) / 2, gz], [0.16, 0.13, 0.08], { top: ochreHi });
      glows.push({ p: [gx + 16, gy + 30, gz], size: 60, col: [1, 0.66, 0.3], k: 0.4 });
    }
    // lower terraces going down the valley and back into the hill
    slab(-400, 565, 300, 210, ty + 95);
    slab(-476, 560, 160, 180, ty + 124);
    slab(-470, 772, 270, 208, ty + 52);
    slab(-540, 772, 140, 170, ty + 78);
    ziggurat(-520, 560, 46, ty + 124, 96, 3);
    // the long walls: each follows its ridge, rising and falling with it, a stepped tower at every second turn,
    // and ends in a tower or in the rock, never in a cut block
    for (const w of WALLS) {
      const thick = w.far ? 40 : 22;
      for (let i = 0; i < w.pts.length - 1; i++) {
        const [x0, z0] = w.pts[i];
        const [x1, z1] = w.pts[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        // (in two lengths, so the wall's top steps with the ground instead of standing level over a hollow)
        for (const [ta, tb] of [
          [0, 0.5],
          [0.5, 1],
        ]) {
          const ax = x0 + (x1 - x0) * ta;
          const az = z0 + (z1 - z0) * ta;
          const bx = x0 + (x1 - x0) * tb;
          const bz = z0 + (z1 - z0) * tb;
          slab((ax + bx) / 2, (az + bz) / 2, len / 2 + 8, thick, Math.max(g(ax, az), g(bx, bz)) + w.h, Math.atan2(-(z1 - z0), x1 - x0), !w.far);
        }
        // (a wall that does not spring from the citadel itself begins in a tower too)
        if (i === 0 && (w.far || w === WALLS[2])) ziggurat(x0, z0, w.far ? 100 : 44, g(x0, z0) + w.h - 6, w.far ? 220 : 96, 4);
        if (i > 0 && i % w.every === 0) ziggurat(x0, z0, w.far ? 90 : 36, g(x0, z0) + w.h - 6, w.far ? 190 : 72, 3);
      }
      // its end: a greater tower, unless it ends in the mountain
      const [ex, ez] = w.pts[w.pts.length - 1];
      const inRock = Math.hypot((Math.abs(ex) - GATE.off) / GATE.rx, (ez - GATE.z) / GATE.rz) < 1.05;
      if (!inRock) ziggurat(ex, ez, w.far ? 110 : 48, g(ex, ez) + w.h - 6, w.far ? 240 : 104, 4);
    }
    // the lower terraces end by stepping down into the valley, a tower on each outer corner
    slab(-500, 936, 230, 130, ty + 28);
    slab(-520, 1050, 170, 110, ty + 10);
    ziggurat(-338, 872, 40, ty + 52, 70, 3);
    ziggurat(-388, 996, 34, ty + 28, 56, 3);
    ziggurat(-252, 462, 40, ty + 95, 64, 3);
    // stairs: up the lower terrace's face from the valley floor, then along the platform's south side to its top
    {
      const g0 = g(-238, 690);
      const nA = Math.ceil((ty + 95 - g0) / 5);
      for (let i = 0; i < nA; i++) {
        const yT = Math.min(ty + 95, g0 + (i + 1) * 5);
        k.box(26, yT - g0 + 24, 9.2, [-237, (yT + g0 - 24) / 2, 672 + nA * 4.5 - i * 9], [0.16, 0.13, 0.08], { top: ochreHi });
      }
      for (let i = 0; i < 11; i++) k.box(9.2, (i + 1) * 5 + 2, 26, [-258 - i * 9, ty + 95 + ((i + 1) * 5 - 2) / 2, TERRACE.z + TERRACE.d / 2 + 13], [0.16, 0.13, 0.08], { top: ochreHi });
    }
    // stars in the citadel's dark faces as well
    for (let i = 0; i < (props.mobile ? 20 : 54); i++) {
      const onWall = i % 3 !== 0;
      const size = 2 + r() * r() * 4.5;
      if (onWall) {
        const z = 186 - r() * 376;
        if (Math.abs(z - 128) < 30 || Math.abs(z - 52) < 32 || Math.abs(z + 78) < 29) continue;
        stars.push({ p: [z > 56 ? -286.4 : z > -72 ? -297.4 : -313.4, ty + 16 + r() * 70, z], size });
      }
      else stars.push({ p: [-249, ty + 12 + r() * 74, 468 + r() * 190], size });
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
    // the way on, at the far end of the gorge: a great soft light about it (from the valley it is the one bright thing in the pass), and a lesser one in its point
    glows.push({ p: [GT.x, g(GT.x, GT.z) + GT.above + 40, GT.z], size: 340, col: [1, 0.86, 0.52], k: 0.5 });
    glows.push({ p: [GT.x, g(GT.x, GT.z) + GT.above + 110, GT.z], size: 120, col: [1, 0.95, 0.78], k: 0.45 });

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
    const fire: Lamp[] = [
      { p: [ALTAR.x, fireY + 6, ALTAR.z], size: 34, col: [1, 0.6, 0.24], k: 1.2, at: 1e5 },
      { p: [ALTAR.x - 4, fireY + 11, ALTAR.z + 3], size: 20, col: [1, 0.74, 0.34], k: 0.9, at: 1e5 },
      { p: [ALTAR.x + 5, fireY + 9, ALTAR.z - 4], size: 16, col: [1, 0.5, 0.18], k: 0.9, at: 1e5 },
    ];
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
    const HEAD: V3 = [dEnd[0] - 110, dEnd[1] + 40, dEnd[2] + 30];
    // the great dark cloud behind the angel: its back stays; its face, toward whoever comes up the valley, will part
    const darkFace: Heap[] = [];
    for (let i = 0; i < (props.mobile ? 22 : 46); i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 380;
      const front = i % 2 === 0;
      lobes(front ? darkFace : darkS, HEAD[0] + Math.cos(a) * d * 1.1, HEAD[1] + (r() - 0.5) * 130, HEAD[2] + (front ? 70 : -110) + Math.sin(a) * d * 0.3, 150 + r() * 170 - d * 0.15, 0.75, 4);
    }
    // and in the heart of it, between the two, stars: seen when the cloud's face draws apart
    const heart: Star[] = [];
    for (let i = 0; i < (props.mobile ? 30 : 70); i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 210;
      heart.push({ p: [HEAD[0] + Math.cos(a) * d, HEAD[1] + Math.sin(a) * d * 0.5, HEAD[2] - 20 + (r() - 0.5) * 30], size: 3 + r() * r() * 11 });
    }
    const smokeW = makeHeapMaterial({ lit: [1.18, 1.3, 1.7], shade: [2.6, 2.8, 2.7], rim: 0.8, drift: 0.15, rise: 1 });
    const smokeD = makeHeapMaterial({ lit: [0.2, 0.2, 0.34], shade: [0.2, 0.22, 0.34], rim: 0.55, drift: 0.15, rise: 1 });
    const smokeF = makeHeapMaterial({ lit: [0.2, 0.2, 0.34], shade: [0.2, 0.22, 0.34], rim: 0.55, drift: 0.15, rise: 1 });
    (smokeF.uniforms.uPart.value as THREE.Vector4).set(HEAD[0], HEAD[2], 0, 0);

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
      if (Math.abs(x) < 60 || nearPath(x, z, 46) || inCitadel(x, z) || Math.hypot(x - GT.x, z - GT.z) < 70) continue;
      needle(x, z, h);
      i++;
    }
    // the way on stands in the narrow of the gorge: the light between two tall needles that lean together like the mountains
    {
      const gt = gateOf("gate")!;
      for (const sd of [-1, 1]) {
        const h = 150;
        const geo = needleGeometry(h, 9, sd > 0 ? 7.3 : 2.1, [0.1, 0.075, 0.12], [0.6, 0.38, 0.2]);
        geo.rotateZ(sd * 0.17);
        geo.translate(sd * 37, g(sd * 37, gt.pos.z) + h / 2 - 6, gt.pos.z);
        needles.push(geo);
      }
    }
    const needleGeo = mergeGeometries(needles)!;
    needles.forEach((q) => q.dispose());
    needleGeo.computeBoundingSphere();

    // ---- stones: fallen from the mountains, lying about their feet and all through the gorge, a few far down the valley
    const stones: { p: V3; r: number; seed: number; col?: V3 }[] = [];
    for (let i = 0, guard = 0; i < (props.mobile ? 90 : 260) && guard < 3000; guard++) {
      const inGorge = r() < 0.45;
      const x = inGorge ? (r() - 0.5) * 260 : (r() - 0.5) * 1500;
      const z = inGorge ? GATE.z + 560 - r() * 1150 : 1300 - r() * 1500;
      if (nearPath(x, z, inGorge ? 14 : 24) || Math.abs(x - roadX(z)) < 8) continue;
      const md = Math.hypot((Math.abs(x) - GATE.off) / GATE.rx, (z - GATE.z) / GATE.rz);
      if (md < 0.9 || inCitadel(x, z) || Math.hypot(x - GT.x, z - GT.z) < 60) continue;
      if (!inGorge && md > 1.7 && r() < 0.75) continue;
      const rad = 1.2 + r() * r() * (inGorge ? 9 : 6);
      stones.push({ p: [x, g(x, z), z], r: rad, seed: r(), col: r() < 0.5 ? [0.2, 0.15, 0.17] : [0.3, 0.2, 0.13] });
      i++;
    }

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
        if (inCitadel(x, z)) continue;
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
      if (Math.abs(z - GT.z) < 70) continue;
      puffs.push({ p: [(r() - 0.5) * 170, g(0, z) + 8 + r() * r() * 120, z], size: 46 + r() * 70, a: 0.5 });
    }
    for (let i = 0; i < (props.mobile ? 10 : 26); i++) puffs.push({ p: [(r() - 0.5) * 1100, 0, 1300 - r() * 1400], size: 90 + r() * 110, a: 0.5 });
    for (const p of puffs) if (p.p[1] === 0) p.p[1] = g(p.p[0], p.p[2]) + 12 + r() * 16;
    // air in layers: a long bank across the valley before the pass (the mountains stand up out of it), mist about
    // the citadel's foot and among the needles, and banks behind the far walls so they go back in steps
    for (let i = 0; i < (props.mobile ? 10 : 22); i++) {
      const x = -820 + (i / 21) * 1640 + (r() - 0.5) * 50;
      const z = 150 + (r() - 0.5) * 220;
      if (Math.abs(x) < 80) continue;
      puffs.push({ p: [x, g(x, z) + 16 + r() * 22, z], size: 150 + r() * 120, a: 0.5 });
    }
    for (let i = 0; i < (props.mobile ? 6 : 14); i++) {
      const z = 880 - r() * 760;
      puffs.push({ p: [-210 - r() * 60, g(-220, z) + 10 + r() * 30, z], size: 90 + r() * 80, a: 0.42 });
    }
    for (let i = 0; i < (props.mobile ? 8 : 18); i++) {
      const a = (i / 18) * Math.PI * 2;
      const d = 1500 + r() * 500;
      puffs.push({ p: [Math.cos(a) * d, g(Math.cos(a) * d, Math.sin(a) * d) + 30 + r() * 50, Math.sin(a) * d], size: 300 + r() * 220, a: 0.5 });
    }
    // ---- light let down into the gorge between the leaning walls
    const beams: Beam[] = [];
    for (let i = 0; i < (props.mobile ? 6 : 12); i++) {
      const z = GATE.z + 420 - (i / 11) * 900 + (r() - 0.5) * 40;
      if (Math.abs(z - GT.z) < 60) continue;
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
      flockY: g(150, -150) + 40,
      left: buildMassif(-1, SEEDS[0], props.mobile),
      right: buildMassif(1, SEEDS[1], props.mobile),
      rock: makeTempera({ amb: 0.74, key: 0.6, strata: 1.1, dab: 1.4, grain: 1.2, wrap: 0.5, rim: [0.3, 0.17, 0.07], rimPow: 4 }),
      // (the two great mountains: their rim of light is gentler, so no fold of the skin is ever drawn as a thin bright thread)
      massif: makeTempera({ amb: 0.74, key: 0.6, strata: 1.1, dab: 1.4, grain: 1.2, wrap: 0.5, rim: [0.1, 0.06, 0.03], rimPow: 5 }),
      // (the stones are one mesh with the needles: the same rock, one draw)
      rocks: (() => {
        const st = boulderGeometry(stones);
        const flat = st.toNonIndexed();
        st.dispose();
        const all = mergeGeometries([needleGeo, flat])!;
        needleGeo.dispose();
        flat.dispose();
        all.computeBoundingSphere();
        return all;
      })(),
      set: k.build(),
      tempera: makeTempera({ amb: 0.9, key: 0.4, strata: 0.5, grain: 1, wrap: 0.5, rim: [0.5, 0.36, 0.16], rimPow: 3 }),
      wings: wings.build(),
      wingMat: makeWingMaterial(),
      white: heapMesh(heapBlobs(white, 3), smokeW, 2),
      dark: heapMesh(heapBlobs(darkS, 7), smokeD, 2),
      face: heapMesh(heapBlobs(darkFace, 17), smokeF, 2),
      smokeF,
      heart,
      far: heapMesh(heapBlobs(far, 11), makeHeapMaterial({}), 1),
      smokeW,
      smokeD,
      grove,
      puffs,
      beams,
      flocks,
      stars,
      fire,
      halos,
      glows,
      road,
      sparks: pointsGeometry(props.mobile ? 60 : 160, (_, q) => [ALTAR.x + (q() - 0.5) * 26, fireY + 4 + q() * q() * 150, ALTAR.z + (q() - 0.5) * 26, 0.6 + q() * 1.2], 21),
      sparkMat: makePoints({ a: [1, 0.6, 0.2], b: [1, 0.86, 0.5], scale: 260, drift: 5, gain: 1.2, max: 14 }),
    };
  }, [props.mobile, props.trees, props.far, props.grass, props.reduced, props.effects > 0.5]);
  // The dark cloud's face draws apart as the plane comes up the valley under it, and the stars in its heart are seen.
  const camera = useThree((st) => st.camera);
  const clock = useRef(0);
  useFrame(() => {
    // (the world's own clock, so that it keeps time with everything else that moves here)
    const now = SKY_U.uTime.value;
    const dt = Math.min(0.2, Math.max(0, now - clock.current));
    clock.current = now;
    if (voyage.cur !== "gate") return;
    const z = camera.position.z - ORIGIN.z;
    const want = 250 * Math.min(1, Math.max(0, (1150 - z) / 520));
    const u = b.smokeF.uniforms.uPart.value as THREE.Vector4;
    u.z += (want - u.z) * Math.min(1, dt * 0.5);
  });
  return (
    <>
      <WorldBase id="gate" def={def} pal={GATE_PAL} props={b.base} tip={[0.4, 0.36, 0.14]} pathTint={[1, 0.86, 0.6]} groundSize={12000} angels={false} mask={GRASS_MASK} gate="arch" gateSize={[35, 93]} />
      <RayedSun size={0.5} gain={0.9} />
      <CloudDeck y={1500} size={20000} alpha={0.45} />
      <group position={[0, 0, GATE.z]}>
        <mesh geometry={b.left} material={b.massif} />
        <mesh geometry={b.right} material={b.massif} />
      </group>
      <mesh geometry={b.rocks} material={b.rock} />
      <mesh geometry={b.set} material={b.tempera} />
      <mesh geometry={b.wings} material={b.wingMat} />
      <primitive object={b.white} />
      <primitive object={b.dark} />
      <primitive object={b.face} />
      <primitive object={b.far} />
      {b.grove.sets.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
      <Procession road={b.road} n={props.mobile ? 30 : 80} speed={1.2} scale={3.2} robe={[0.2, 0.17, 0.2]} wing={[0.16, 0.13, 0.16]} glow={0.02} seed={12} />
      <Walkers road={b.road} n={props.mobile ? 30 : 80} speed={1.2} size={1.0} seed={12} lift={4.4} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <GoldStars list={b.stars} />
      <GoldStars list={b.heart} tint={[1, 0.86, 0.5]} />
      <Kindling list={b.fire} centre={[ALTAR.x, 60, ALTAR.z]} />
      {/* dark birds burst from the needles at the mouth of the gorge as the plane comes to it */}
      <RisingFlock origin={[150, b.flockY, -150]} n={props.mobile ? 24 : 64} reach={230} size={2.0} tint={[0.1, 0.08, 0.08]} away={[-0.3, 0.95]} seed={9} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
      <points geometry={b.sparks} material={b.sparkMat} />
      <SunShafts list={b.beams} tint={[1, 0.84, 0.54]} dir={[0.07, 1, 0.1]} />
      <Birds flocks={b.flocks} tint={[0.1, 0.08, 0.08]} />
    </>
  );
}
