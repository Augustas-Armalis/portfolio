"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SKY_U } from "../sky";
import { FarGround, Gallery, Halos, LightGate, LightPath, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, makePoints, makeTempera, pointsGeometry, terrainGeometry, rng, type Halo, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { linesGeometry, makeCloudPaint, makeLineMaterial, makeRayDiscMaterial, makeSoftMaterial, paintedCloudGeometry, softGeometry, type PCloud, type Seg, type Soft } from "./stars/forms";
import { heroAngel, makePlanet, makePyramidVeil, makeWaveSea, wingFan } from "./stars/parts";
import { GLOBE, buildGarden } from "./stars/garden";
import { Kindling } from "./fairy/shared";
import { useMoment } from "./moments";
import { DOOR, DOOR_Z, GREAT, PYRS, SKY_RING, makePyramidMaterial, makeStarBand, pyramidGeometry, pyramidReflectGLSL, skyAt } from "./stars/pyramids";
import { ORIGIN, WORLDS, heightAt } from "./voyage";
import { buildAngels, type AngelSpot } from "../home/Angels";
const STARS_ANGEL_AIR = { glsl: GLSL_AIR, apply: "applyAir(col, vWorld)", amount: "airAmt(vWorld)", uniforms: WORLD_U, night: { value: 1 } };
import { Comet } from "./stars/comet";
import { buildWisps, makeWispMaterial } from "./sea/water";
import { useDeepLens } from "./fairy/shared";

// Sonata of the Stars (Allegro and Andante, 1908), as one calm night to fly through.
//
// From the Allegro: the great pyramid standing out of the sea with the angel at its point and a pale disc behind
// him, the other pyramids far off on either hand, the level band of gold stars across the whole sky, the gold
// strings that hang from it, and the worlds threaded on them. From the Andante: the pale pyramid on the horizon,
// the veils of cloud across its face, the great blue star.
//
// The way: in low over a black-blue sea, a kilometre and more of it, with the sky of great stars and worlds
// overhead; between two huge dark pyramids that stand close beside the way; and straight on toward the greatest, whose point
// is two kilometres up in the stars and at whose foot a lancet door stands open on the sea, warm with light. The
// door is the way on: the sea beyond it is Rex's.
//
// Built far and large and few: nine pyramids of eight triangles each, one calm sea that mirrors them and the door's
// light, a ring of sky about the eye (the band, the worlds, the great stars), and haze over everything.

const def = WORLDS.stars;
const GOLD: V3 = [1.0, 0.8, 0.44];
// the glow that grows toward the way out, and the one that wakes round the globe (drawn about their own centres)
const DOOR_GLOW: Halo[] = [
  { p: [0, 0, -4], size: 420, col: [1, 0.72, 0.36], k: 0.4 },
  { p: [0, 60, 120], size: 900, col: [1, 0.78, 0.45], k: 0.1 },
  { p: [0, 120, 400], size: 1500, col: [0.9, 0.75, 0.5], k: 0.04 },
];
// The worlds the way goes over: the golden one lies half sunk in the sea and the plane flies over its top, close enough
// to see the small angels who stand there (path in voyage.ts runs over (-120, 1150) at the height of its crown); the
// rest hang or rest nearer and further along, each with its ring of gold.
const SEA_H = (x: number, z: number) => heightAt(def.terrain!, x, z);
const GOLDEN = { x: -120, z: 1150, r: 125 };
const WORLD_SET: { x: number; z: number; r: number; up: number; col: V3; ring?: number; tilt?: number }[] = [
  { x: 520, z: 1750, r: 92, up: 40, col: [0.4, 0.74, 0.62], ring: 1.9, tilt: 0.4 },
  { x: -980, z: 1300, r: 64, up: 130, col: [0.92, 0.5, 0.4], ring: 0, tilt: 0 },
  { x: 380, z: 820, r: 40, up: 150, col: [0.96, 0.72, 0.34], ring: 1.8, tilt: -0.5 },
  { x: -560, z: 640, r: 84, up: 70, col: [0.34, 0.48, 0.92], ring: 1.7, tilt: 0.3 },
];
const GOLDEN_GLOW: Halo[] = [{ p: [0, 0, 0], size: 700, col: [1, 0.7, 0.32], k: 0.14 }];
const GLOBE_GLOW: Halo[] = [{ p: [0, 0, 0], size: 700, col: [0.5, 0.95, 0.75], k: 0.2 }];

// The whole of it, made part by part with a pause after each, so that it can be made a little a frame under the
// closed cloud (worlds/Worlds.tsx hands prepareStars to the plane) instead of all at once in one long frame.
function* starsSteps(props: WorldProps) {
  const r = rng(1908);
  const glows: Halo[] = [];
  const halos: Halo[] = [];
  const skyGlows: Halo[] = [];
  const skyHalos: Halo[] = [];
  const tip = GREAT.h;

  yield;
  // ----- the pyramids -----
  const pyr: { p: (typeof PYRS)[number]; geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }[] = [];
  // the others as the first look had them: veils of pale scalloped cloud, one inside another, each with its edge drawn
  const cone = (p: (typeof PYRS)[number], k2: number) => {
    const c = new THREE.ConeGeometry(p.w * k2 * Math.SQRT2, p.h * k2, 4, 40, true);
    c.translate(0, (p.h * k2) / 2, 0);
    c.rotateY(Math.PI / 4);
    return c;
  };
  const veilPyr: { p: (typeof PYRS)[number]; geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }[] = [];
  // (the greatest too: three veils one inside another, taller and brighter than the rest; the door stands at its foot,
  // where the veils are thin)
  PYRS.forEach((p, i) => {
    const near = i < 3;
    const great = i === 0;
    // (the greatest: two veils, one inside the other, with the light inside it; the near two and the far three one each)
    for (const s2 of great ? [0.7, 1] : [1])
      veilPyr.push({ p, geo: cone(p, s2), mat: makePyramidVeil({ h: p.h * s2, half: p.w * s2, alpha: great ? (s2 < 1 ? 0.4 : 0.55) : near ? 0.5 : 0.62, seed: p.seed, freq: great ? 9 : near ? 7 : 8, edge: s2 === 1 ? (near ? 1 : 0.7) : 0.1, base: great ? 1 : 0 }) });
  });

  yield;
  // ----- what stands on and at the greatest: the angel, the door's moulding, the steps -----
  const k = new Kit();
  const AS = 150;
  heroAngel(k, [GREAT.x, tip - 10, GREAT.z], AS);
  glows.push({ p: [GREAT.x, tip + AS * 0.9, GREAT.z + 6], size: 900, col: [1, 0.7, 0.3], k: 0.5 });
  glows.push({ p: [GREAT.x, tip - 200, GREAT.z], size: 1500, col: [0.5, 0.8, 0.6], k: 0.14 });
  halos.push({ p: [GREAT.x, tip + AS * 1.69, GREAT.z + 8], size: 60, col: [1, 0.95, 0.8], k: 1.3 });
  // the door: a gilt moulding along its edge, a warm light in it, two steps up out of the sea
  const faceZ = (y: number) => GREAT.z + GREAT.w - y * (GREAT.w / GREAT.h) + 2.5;
  const outline: V3[] = [];
  const nA = 14;
  outline.push([-DOOR.half, 0, faceZ(0)], [-DOOR.half, DOOR.spring * 0.5, faceZ(DOOR.spring * 0.5)]);
  for (let i = 0; i <= nA; i++) {
    const a = (i / nA) * Math.PI;
    const x = -DOOR.half * Math.cos(a);
    const y = DOOR.spring + (DOOR.top - DOOR.spring) * Math.sin(a);
    outline.push([x, y, faceZ(y)]);
  }
  outline.push([DOOR.half, DOOR.spring * 0.5, faceZ(DOOR.spring * 0.5)], [DOOR.half, 0, faceZ(0)]);
  k.tube(outline, 3.2, GOLD, { glow: 1.5, seg: 120, sides: 6 });
  k.tube(
    outline.map(([x, y, z]): V3 => [x * 1.12, y * 1.08, z + 3]),
    1.2,
    [0.95, 0.62, 0.3],
    { glow: 0.5, seg: 120, sides: 5 },
  );
  glows.push({ p: [0, 48, DOOR_Z - 6], size: 420, col: [1, 0.7, 0.34], k: 0.8 });
  glows.push({ p: [0, 30, DOOR_Z + 60], size: 260, col: [1, 0.74, 0.4], k: 0.4 });
  // the pyramids' own points, each with its small light
  for (const p of PYRS) if (p !== GREAT) halos.push({ p: [p.x, p.h, p.z], size: 40 + p.h * 0.02, col: [1, 0.92, 0.72], k: 0.9 });

  yield;
  // ----- the sea's mist, in long level bands at the feet of the pyramids -----
  const wisps = buildWisps([
    { x: 0, z: DOOR_Z + 200, w: 2600, d: 620, y: 10, a: 0.14 },
  ]);

  yield;
  // ----- veils of cloud lying across the faces of the near pyramids -----
  const veils: PCloud[] = [];
  for (const [pi, n] of [
    [0, 9],
    [1, 5],
    [2, 6],
  ] as [number, number][]) {
    const p = PYRS[pi];
    for (let i = 0; i < n; i++) {
      const y = p.h * (0.1 + 0.62 * (i / n) + r() * 0.05);
      const reach = p.w * (1 - y / p.h) * 1.05 + 90;
      const a = (Math.floor(r() * 4) * Math.PI) / 2 + (r() - 0.5) * 0.7;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // (on the two faces toward the way in and the one beside it, more than on the far side)
      veils.push({ p: [p.x + sa * reach, y, p.z + ca * reach], w: 260 + r() * 340, seed: r() });
    }
  }

  yield;
  // ----- the sky: worlds hung in it, the great stars, the gold strings from the band -----
  const sky = new Kit();
  const orbs: Soft[] = [];
  const WORLDS_IN_SKY: [az: number, el: number, d: number, rad: number, col: V3, ring: boolean][] = [
    [-38, 27, 4300, 330, [0.95, 0.55, 0.24], true],
    [34, 22, 4300, 240, [0.9, 0.5, 0.46], false],
    [8, 58, 4000, 170, [0.3, 0.46, 0.9], false],
    [-84, 17, 4400, 300, [0.4, 0.72, 0.58], true],
    [76, 40, 4300, 380, [0.92, 0.74, 0.4], true],
    [-142, 32, 4300, 260, [0.95, 0.6, 0.3], false],
    [148, 21, 4400, 300, [0.34, 0.5, 0.92], true],
    [182, 44, 4200, 230, [0.9, 0.55, 0.5], false],
    [-112, 55, 4200, 140, [0.9, 0.78, 0.5], false],
    [112, 61, 4000, 120, [0.5, 0.7, 0.85], false],
  ];
  for (const [az, el, d, rad, col, ring] of WORLDS_IN_SKY) {
    const p = skyAt(az, el, d);
    orbs.push({ p, r: rad, col, glow: 0.28, seed: r() });
    skyGlows.push({ p, size: rad * 4, col, k: 0.35 });
    if (ring) sky.add(new THREE.TorusGeometry(rad * 1.75, rad * 0.028, 5, 96), p, GOLD, { glow: 1.0, rot: [1.15 + r() * 0.5, r() * 3, 0], scale: [1, 1, 0.3] });
  }
  // great stars, drawn as he drew them: long fine strokes crossing, the short ones turned between
  const segs: Seg[] = [];
  const STARS: [az: number, el: number, size: number, col: V3][] = [
    [-62, 38, 330, [0.34, 0.5, 1.0]],
    [22, 47, 230, GOLD],
    [-22, 66, 200, GOLD],
    [66, 55, 250, [0.95, 0.9, 0.8]],
    [-116, 47, 280, GOLD],
    [128, 52, 260, [0.4, 0.56, 1.0]],
    [-170, 34, 220, GOLD],
    [172, 62, 200, [0.95, 0.9, 0.8]],
  ];
  const up = new THREE.Vector3(0, 1, 0);
  for (const [az, el, size, col] of STARS) {
    const c = new THREE.Vector3(...skyAt(az, el, 4500));
    const rad = c.clone().normalize();
    const sx = new THREE.Vector3().crossVectors(up, rad).normalize();
    const sy = new THREE.Vector3().crossVectors(rad, sx).normalize();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 4 + 0.2;
      const L = size * (i % 2 ? 0.62 : 1);
      const d = sx.clone().multiplyScalar(Math.cos(a) * L).addScaledVector(sy, Math.sin(a) * L);
      segs.push({ a: c.clone().sub(d).toArray() as V3, b: c.clone().add(d).toArray() as V3, w: size * 0.035, col });
    }
    skyHalos.push({ p: c.toArray() as V3, size: size * 0.7, col, k: 1.1 });
    skyGlows.push({ p: c.toArray() as V3, size: size * 3, col, k: 0.18 });
  }
  // gold strings hung from the band to the sea
  for (const az of [-130, -58, 30, 118]) {
    const p = skyAt(az, 0, SKY_RING.r * 0.97);
    segs.push({ a: [p[0], SKY_RING.y - SKY_RING.h * 0.4, p[2]], b: [p[0], -20, p[2]], w: 6, col: GOLD });
  }

  yield;
  // ----- the sea's near stars, drifting; birds of light -----
  const dust = pointsGeometry(props.mobile ? 500 : Math.round(900 + 600 * props.effects), (_, q) => [(q() - 0.5) * 3600, 8 + q() * q() * 700, 3600 - q() * 4800, 0.4 + q() * q() * 1.8], 99);
  const flocks: Flock[] = [
    { c: [0, 80, 2000], r: 200, n: props.mobile ? 6 : 12, size: 2.4, speed: 11 },
    { c: [-300, 140, 1100], r: 260, n: props.mobile ? 5 : 10, size: 2.6, speed: 10 },
    { c: [0, 120, 300], r: 300, n: props.mobile ? 6 : 12, size: 3, speed: 12 },
  ];

  yield;
  // ----- the worlds of the way, with their rings, and the angels on the golden one -----
  const near: Soft[] = [];
  const gy0 = SEA_H(GOLDEN.x, GOLDEN.z) - 32 - 0;
  const gc: V3 = [GOLDEN.x, gy0, GOLDEN.z];
  glows.push({ p: [GOLDEN.x, gy0 + GOLDEN.r * 0.6, GOLDEN.z], size: GOLDEN.r * 3.2, col: [1, 0.7, 0.32], k: 0.34 });
  for (const [rk, rr] of [[2.15, 0.012], [2.35, 0.008]] as const) k.add(new THREE.TorusGeometry(GOLDEN.r * rk, GOLDEN.r * rr, 5, 140), gc, GOLD, { glow: 0.9, rot: [Math.PI / 2 - 0.72, 0, 0.12], scale: [1, 1, 0.4] });
  // the angels of the home forest, large and graceful, standing on the crown of the golden world, facing the way the
  // plane comes (and a few turned to one another)
  const spots: AngelSpot[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.5;
    const d = 22 + r() * 48;
    const x = GOLDEN.x + Math.cos(a) * d;
    const z = GOLDEN.z + Math.sin(a) * d;
    spots.push({ x, z, y: gy0 + Math.sqrt(GOLDEN.r * GOLDEN.r - d * d) - 0.5, yaw: i % 3 === 0 ? Math.atan2(GOLDEN.x - x, GOLDEN.z - z) : Math.PI + (r() - 0.5) * 1.1, s: 8 + r() * 4.5, robe: i % 4 });
  }
  for (const w of WORLD_SET) {
    const wy = SEA_H(w.x, w.z) + w.up + w.r * 0.3;
    near.push({ p: [w.x, wy, w.z], r: w.r, col: w.col, glow: 0.12, seed: r() });
    glows.push({ p: [w.x, wy, w.z], size: w.r * 4, col: w.col, k: 0.4 });
    if (w.ring) k.add(new THREE.TorusGeometry(w.r * w.ring, w.r * 0.014, 5, 110), [w.x, wy, w.z], GOLD, { glow: 0.9, rot: [Math.PI / 2 - w.tilt!, 0, w.tilt! * 0.6], scale: [1, 1, 0.4] });
  }
  const nearWorlds = softGeometry(near, props.mobile ? 2 : 3);
  const goldAngels = buildAngels(spots, STARS_ANGEL_AIR);
  yield;
  const garden = buildGarden(props.mobile, props.effects);
  yield;
  const setGeo = k.build();
  const skySet = sky.build();
  yield;
  return {
    pyr,
    veilPyr,
    garden,
    gardenMats: {
      orb: makeSoftMaterial({ shade: [0.35, 0.4, 0.7], under: [0.4, 0.4, 0.6], rim: 1.4, dab: 0.8, amb: 1.2, key: 0.9, sway: 0.4 }),
      thread: makeLineMaterial({ gain: 1.3, minW: 0.0022, flow: 0.6 }),
      figs: makeLineMaterial({ figs: garden.figs.length, gain: 1.6, minW: 0.0018 }),
            motes: makePoints({ a: [1.0, 0.9, 0.62], b: [0.74, 0.88, 1.0], scale: 500, gain: 0, max: 26, drift: 1.8 }),
    },
    wisps,
    wispMat: makeWispMaterial(),
    set: setGeo,
    nearWorlds,
    goldAngels,
    goldGeo: new THREE.SphereGeometry(GOLDEN.r, 72, 48),
    goldMat: makePlanet({ a: [0.5, 0.22, 0.08], b: [0.9, 0.55, 0.22], c: [0.18, 0.4, 0.4], seed: 3.7 }),
    nearMat: makeSoftMaterial({ shade: [0.34, 0.4, 0.66], under: [0.34, 0.34, 0.54], rim: 1.5, dab: 0.8, amb: 1.25, key: 0.95, air: 0.15 }),
    skySet,
    tempera: makeTempera({ amb: 1, key: 0.5, rim: [0.5, 0.42, 0.2], rimPow: 2.5 }),
    wingL: wingFan(-1, AS),
    wingR: wingFan(1, AS),
    AS,
    disc: makeRayDiscMaterial({ col: [1, 0.66, 0.26], hot: [1, 0.86, 0.56], rays: 120, gain: 0.42, disc: 0.2, near: [20, 60] }),
    sea: terrainGeometry(def.terrain!, 24000, props.mobile ? 190 : 300),
    seaMat: makeWaveSea([0, 420, DOOR_Z + 20], pyramidReflectGLSL()),
    band: makeStarBand(),
    orbs: softGeometry(orbs, props.mobile ? 2 : 3),
    orbMat: makeSoftMaterial({ shade: [0.3, 0.38, 0.62], under: [0.3, 0.32, 0.5], rim: 1.3, dab: 0.8, amb: 1.2, key: 0.9, air: 0.2, fade: [9000, 12000] }),
    lines: linesGeometry(segs),
    lineMat: makeLineMaterial({ gain: 1.5, minW: 0.0022, far: [9000, 12000] }),
    veils: paintedCloudGeometry(veils, [0, 100, 300]),
    veilMat: makeCloudPaint({ lit: [0.42, 0.7, 0.62], shade: [0.1, 0.24, 0.32], under: [0.05, 0.09, 0.26], rim: 1.3, self: 0.03, amb: 1.2, key: 0.9, air: 0.7, fade: [4200, 7000], near: [200, 600] }),
    flocks,
    halos,
    glows,
    skyGlows,
    skyHalos,
    dust,
    dustMat: makePoints({ a: [1.0, 0.9, 0.62], b: [0.74, 0.88, 1.0], scale: 300, gain: 0.9, max: 18, drift: 2.4 }),
  };
}
type StarsBuilt = ReturnType<typeof starsSteps> extends Generator<void, infer T, void> ? T : never;
const starsKey = (p: WorldProps) => `${p.mobile}|${p.effects > 0.5}`;
let madeStars: { key: string; v: StarsBuilt } | null = null;
export function prepareStars(props: WorldProps) {
  const key = starsKey(props);
  if (madeStars && madeStars.key !== key) madeStars = null;
  const g = madeStars ? null : starsSteps(props);
  return () => {
    if (!g || madeStars) return true;
    const t0 = performance.now();
    const r = g.next();
    if (process.env.NODE_ENV !== "production") ((window as unknown as { __steps?: Record<string, number[]> }).__steps ??= {}).stars = [...((window as unknown as { __steps: Record<string, number[]> }).__steps.stars ?? []), Math.round(performance.now() - t0)];
    if (r.done) madeStars = { key, v: r.value };
    return !!r.done;
  };
}
function buildStars(props: WorldProps): StarsBuilt {
  if (madeStars && madeStars.key === starsKey(props)) return madeStars.v;
  const g = starsSteps(props);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}

export default function StarsWorld({ props }: { props: WorldProps }) {
  useDeepLens("stars");
  const wings = useRef<(THREE.Group | null)[]>([]);
  const sky = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const doorGlow = useRef<THREE.Group>(null);
  const globeGlow = useRef<THREE.Group>(null);
  const goldGlow = useRef<THREE.Group>(null);
  const clock = useRef(0);
  // the beats of the journey: star-motes begin to stream along the way; the globe wakes as the plane comes to it;
  // a soft glow grows toward the door as the way out comes near
  const motes = useMoment("stars", { id: "motes", after: 2, ease: 6 });
  const globeM = useMoment("stars", { id: "globe", at: [GLOBE.x, 60, GLOBE.z], within: 800, ease: 5 });
  // the golden world wakes (its glow rises and its light spills over the sea) as the plane comes to fly over it
  const goldM = useMoment("stars", { id: "golden", at: [GOLDEN.x, 100, GOLDEN.z], within: 1000, ease: 5 });
  const welcome = useMoment("stars", { id: "welcome", at: [0, 30, DOOR_Z], within: 1800, ease: 9 });
  const b = useDisposable(() => buildStars(props), [props.mobile, props.effects > 0.5]);
  useEffect(
    () => () => {
      if (madeStars?.v === b) madeStars = null;
    },
    [b],
  );
  useFrame(({ camera }) => {
    const t = SKY_U.uTime.value;
    const g = b.garden;
    const dt = Math.min(0.25, Math.max(0, t - clock.current));
    clock.current = t;
    b.gardenMats.motes.uniforms.uGain.value = 1.1 * motes.k.value;
    if (doorGlow.current) doorGlow.current.scale.setScalar(0.25 + 1.05 * welcome.k.value);
    if (goldGlow.current) goldGlow.current.scale.setScalar(0.3 + 1.1 * goldM.k.value);
    if (globeGlow.current) globeGlow.current.scale.setScalar(0.4 + 0.9 * globeM.k.value);
    // the hanging worlds' rings turn slowly, each its own way
    g.rings.forEach((rg, i) => {
      const m = rings.current[i];
      if (m) m.rotation.set(rg.tilt, t * 0.05 * (i % 2 ? 1 : -1) + i, 0);
    });
    // a figure draws itself when the plane comes within sight of it, and once drawn it stays
    const prog = b.gardenMats.figs.uniforms.uProg.value as Float32Array;
    const cx = camera.position.x - ORIGIN.x;
    const cy = camera.position.y - ORIGIN.y;
    const cz = camera.position.z - ORIGIN.z;
    g.figs.forEach((f, i) => {
      if (prog[i] > 0 || Math.hypot(f.c.x - cx, f.c.y - cy, f.c.z - cz) < 900 + f.size) prog[i] = Math.min(1, prog[i] + dt / 5 + 1e-4);
    });
    wings.current.forEach((w, i) => w && (w.rotation.z = (i ? -1 : 1) * (0.05 + 0.06 * Math.sin(t * 0.33))));
    // (the ring of sky goes with the eye, as a sky does)
    if (sky.current) sky.current.position.set(camera.position.x - ORIGIN.x, 0, camera.position.z - ORIGIN.z);
  });
  const tip = GREAT.h;
  const sh: V3 = [GREAT.x, tip - 10 + b.AS * 1.34, GREAT.z - b.AS * 0.1];
  return (
    <>
      <mesh geometry={b.sea} material={b.seaMat} renderOrder={-5} />
      <FarGround id="stars" def={def} pal={{ a: [0.006, 0.022, 0.034], b: [0.006, 0.022, 0.034], c: [0.006, 0.022, 0.034] }} />
      <LightPath id="stars" def={def} tint={[1, 0.92, 0.7]} gain={1.4} effects={props.effects} angels={false} />
      {/* the way on: the door's own sheet of light, and the next world seen in it */}
      <LightGate id="stars" def={def} tint={[1, 0.86, 0.6]} gain={1.1} look="veil" half={DOOR.half} rise={DOOR.top - 32} />
      <Gallery def={def} />
      {b.veilPyr.map((v, i) => (
        <mesh key={`v${i}`} geometry={v.geo} material={v.mat} position={[v.p.x, 0, v.p.z]} renderOrder={2 + (i % 2) * 0.1} />
      ))}
      <mesh geometry={b.garden.globeGeo} material={b.garden.globeMat} position={[GLOBE.x, b.garden.gy, GLOBE.z]} renderOrder={3} />
      <group position={[GLOBE.x, b.garden.gy, GLOBE.z]}>
        <mesh geometry={b.garden.starRing} material={b.garden.starRingMat} renderOrder={3.2} />
        <mesh geometry={b.garden.haloRing} material={b.garden.haloRingMat} renderOrder={4} />
      </group>
      <Kindling list={b.garden.globeLamps} centre={b.garden.globeCentre} />
      <group ref={globeGlow} position={[GLOBE.x, b.garden.gy, GLOBE.z]}>
        <Halos list={GLOBE_GLOW} kind={2} />
      </group>
      <mesh geometry={b.garden.threads} material={b.gardenMats.thread} renderOrder={5} frustumCulled={false} />
      <mesh geometry={b.goldGeo} material={b.goldMat} position={[GOLDEN.x, SEA_H(GOLDEN.x, GOLDEN.z) - 32, GOLDEN.z]} renderOrder={1} />
      <mesh geometry={b.goldAngels.glow} material={b.goldAngels.glowMat} renderOrder={2} frustumCulled={false} />
      <mesh geometry={b.goldAngels.geo} material={b.goldAngels.mat} renderOrder={3} frustumCulled={false} />
      <mesh geometry={b.nearWorlds} material={b.nearMat} frustumCulled={false} />
      <group ref={goldGlow} position={[GOLDEN.x, SEA_H(GOLDEN.x, GOLDEN.z) + 60, GOLDEN.z]}>
        <Halos list={GOLDEN_GLOW} kind={2} />
      </group>
      <mesh geometry={b.garden.orbs} material={b.gardenMats.orb} frustumCulled={false} />
      {b.garden.rings.map((rg, i) => (
        <mesh key={`r${i}`} ref={(el) => void (rings.current[i] = el)} geometry={b.garden.ringGeo} material={b.tempera} position={rg.p} scale={[rg.rad, rg.rad, rg.rad * 0.3]} />
      ))}
      {b.garden.bands.map((w, i) => (
        <mesh key={`b${i}`} geometry={w.geo} material={w.mat} renderOrder={4} />
      ))}
      <mesh geometry={b.garden.lines} material={b.gardenMats.figs} renderOrder={5} frustumCulled={false} />
      <points geometry={b.garden.motes} material={b.gardenMats.motes} renderOrder={5} />
      <Halos list={b.garden.glows} kind={2} />
      <Halos list={b.garden.halos} />
      <group ref={doorGlow} position={[0, 40, DOOR_Z]}>
        <Halos list={DOOR_GLOW} kind={2} />
      </group>
      {b.pyr.map((p, i) => (
        <mesh key={i} geometry={p.geo} material={p.mat} position={[p.p.x, 0, p.p.z]} />
      ))}
      <mesh geometry={b.set} material={b.tempera} />
      {[-1, 1].map((s, i) => (
        <group key={s} position={[sh[0] + s * b.AS * 0.16, sh[1], sh[2]]} ref={(el) => void (wings.current[i] = el)}>
          <mesh geometry={s < 0 ? b.wingL : b.wingR} material={b.tempera} />
        </group>
      ))}
      <mesh material={b.disc} position={[GREAT.x + 30, tip + 260, GREAT.z - 500]} scale={1700} renderOrder={-2}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh geometry={b.wisps} material={b.wispMat} renderOrder={3} />
      <group ref={sky} scale={2}>
        <mesh material={b.band} position={[0, SKY_RING.y, 0]} renderOrder={-3} frustumCulled={false}>
          <cylinderGeometry args={[SKY_RING.r, SKY_RING.r, SKY_RING.h, 160, 1, true]} />
        </mesh>
        <mesh geometry={b.orbs} material={b.orbMat} frustumCulled={false} renderOrder={-2} />
        <mesh geometry={b.skySet} material={b.tempera} frustumCulled={false} renderOrder={-2} />
        <mesh geometry={b.lines} material={b.lineMat} frustumCulled={false} renderOrder={-1} />
        <Halos list={b.skyGlows} kind={2} />
        <Halos list={b.skyHalos} />
      </group>
      <Comet world="stars" id="stars-comet-2" from={[3200, 1100, -900]} to={[-2800, 600, -1700]} seconds={46} after={60} again={90} tail={800} width={40} tint={[0.8, 0.9, 1]} />
      <Comet world="stars" id="stars-comet" from={[-3200, 1500, -1400]} to={[3000, 800, -2000]} seconds={44} after={24} again={80} tail={900} width={44} />
      <Birds flocks={b.flocks} tint={[2.6, 2.3, 1.5]} lit />
      <points geometry={b.dust} material={b.dustMat} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
