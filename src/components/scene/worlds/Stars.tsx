"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SKY_U } from "../sky";
import { Gallery, Halos, LightGate, LightPath, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, makeTempera, makeWater, pointsGeometry, rng, type Halo, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { linesGeometry, makeCloudPaint, makeLineMaterial, makeRayDiscMaterial, makeSoftMaterial, paintedCloudGeometry, softGeometry, type PCloud, type Seg, type Soft } from "./stars/forms";
import { heroAngel, wingFan } from "./stars/parts";
import { DOOR, DOOR_Z, GREAT, PYRS, SKY_RING, makePyramidMaterial, makeStarBand, pyramidGeometry, pyramidReflectGLSL, skyAt } from "./stars/pyramids";
import { ORIGIN, WORLDS } from "./voyage";
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
  const pyr = PYRS.map((p) => ({ p, geo: pyramidGeometry(p), mat: makePyramidMaterial(p, p === GREAT) }));

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
  k.tube(outline, 2.6, GOLD, { glow: 0.9, seg: 120, sides: 6 });
  k.tube(
    outline.map(([x, y, z]): V3 => [x * 1.12, y * 1.08, z + 3]),
    1.2,
    [0.95, 0.62, 0.3],
    { glow: 0.5, seg: 120, sides: 5 },
  );
  for (let i = 0; i < 3; i++) k.box(190 - i * 34, 3, 70 - i * 14, [0, 1.2 + i * 2.6, DOOR_Z + 70 - i * 14], [0.012, 0.03, 0.046], { top: [0.05, 0.09, 0.11] });
  for (const s of [-1, 1]) {
    k.box(4, 22, 4, [s * (DOOR.half + 26), 11, DOOR_Z + 30], [0.02, 0.04, 0.06], { top: [0.1, 0.14, 0.16] });
    halos.push({ p: [s * (DOOR.half + 26), 25, DOOR_Z + 30], size: 20, col: [1, 0.82, 0.5], k: 1.1 });
  }
  glows.push({ p: [0, 48, DOOR_Z - 6], size: 420, col: [1, 0.7, 0.34], k: 0.8 });
  glows.push({ p: [0, 30, DOOR_Z + 60], size: 260, col: [1, 0.74, 0.4], k: 0.4 });
  // the pyramids' own points, each with its small light
  for (const p of PYRS) if (p !== GREAT) halos.push({ p: [p.x, p.h, p.z], size: 40 + p.h * 0.02, col: [1, 0.92, 0.72], k: 0.9 });

  yield;
  // ----- the sea's mist, in long level bands at the feet of the pyramids -----
  const wisps = buildWisps([
    { x: 0, z: DOOR_Z + 200, w: 2600, d: 620, y: 10, a: 0.5 },
    { x: -1750, z: 1900, w: 1900, d: 800, y: 14, a: 0.45 },
    { x: 1850, z: 1500, w: 2100, d: 800, y: 14, a: 0.45 },
    { x: 0, z: 2600, w: 2600, d: 700, y: 8, a: 0.3 },
    { x: -2300, z: -400, w: 3000, d: 800, y: 16, a: 0.4 },
    { x: 2500, z: -300, w: 3000, d: 800, y: 16, a: 0.4 },
    { x: 0, z: -1800, w: 5000, d: 900, y: 22, a: 0.5 },
    { x: -400, z: 3300, w: 2400, d: 600, y: 8, a: 0.3 },
  ]);

  yield;
  // ----- veils of cloud lying across the faces of the near pyramids -----
  const veils: PCloud[] = [];
  for (const [pi, n] of [
    [0, 16],
    [1, 8],
    [2, 9],
    [3, 6],
    [4, 5],
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
  for (const az of [-150, -100, -58, -14, 30, 74, 118, 160]) {
    const p = skyAt(az, 0, SKY_RING.r * 0.97);
    segs.push({ a: [p[0], SKY_RING.y - SKY_RING.h * 0.4, p[2]], b: [p[0], -20, p[2]], w: 7, col: GOLD });
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
  const setGeo = k.build();
  const skySet = sky.build();
  yield;
  return {
    pyr,
    wisps,
    wispMat: makeWispMaterial(),
    set: setGeo,
    skySet,
    tempera: makeTempera({ amb: 1, key: 0.5, rim: [0.5, 0.42, 0.2], rimPow: 2.5 }),
    wingL: wingFan(-1, AS),
    wingR: wingFan(1, AS),
    AS,
    disc: makeRayDiscMaterial({ col: [1, 0.66, 0.26], hot: [1, 0.86, 0.56], rays: 120, gain: 0.42, disc: 0.2, near: [20, 60] }),
    water: makeWater({
      def,
      lights: [new THREE.Vector3(0, 0, DOOR_Z + 20)],
      lightCol: [1.0, 0.78, 0.44],
      lightLen: 3400,
      lightW: 1.5,
      deep: [0.007, 0.024, 0.036],
      calm: 0.7,
      reflect: pyramidReflectGLSL(),
    }),
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
  const b = useDisposable(() => buildStars(props), [props.mobile, props.effects > 0.5]);
  useEffect(
    () => () => {
      if (madeStars?.v === b) madeStars = null;
    },
    [b],
  );
  useFrame(({ camera }) => {
    const t = SKY_U.uTime.value;
    wings.current.forEach((w, i) => w && (w.rotation.z = (i ? -1 : 1) * (0.05 + 0.06 * Math.sin(t * 0.33))));
    // (the ring of sky goes with the eye, as a sky does)
    if (sky.current) sky.current.position.set(camera.position.x - ORIGIN.x, 0, camera.position.z - ORIGIN.z);
  });
  const tip = GREAT.h;
  const sh: V3 = [GREAT.x, tip - 10 + b.AS * 1.34, GREAT.z - b.AS * 0.1];
  return (
    <>
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[9000, 9000]} />
      </mesh>
      <LightPath id="stars" def={def} tint={[1, 0.92, 0.7]} gain={1.4} effects={props.effects} angels={false} />
      {/* the way on: the door's own sheet of light, and the next world seen in it */}
      <LightGate id="stars" def={def} tint={[1, 0.86, 0.6]} gain={1.1} look="veil" half={DOOR.half} rise={DOOR.top - 32} />
      <Gallery def={def} />
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
      <Comet world="stars" id="stars-comet" from={[-3200, 1500, -1400]} to={[3000, 800, -2000]} seconds={44} after={24} again={80} tail={900} width={44} />
      <Birds flocks={b.flocks} tint={[2.6, 2.3, 1.5]} lit />
      <points geometry={b.dust} material={b.dustMat} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
