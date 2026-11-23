"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LightGate, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, WORLD_U, haloGeometry, makeHaloMaterial, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type Puff } from "./kit";
import { GLSL_SKY, SKY_U, airState, mixSky, type SkyState } from "../sky";
import { Birds, type Flock } from "./life";
import { useMoment } from "./moments";
import { useDeepLens } from "./fairy/shared";
import { SEA_LIFE_U, dolphinsGeometry, makeDolphinMaterial, makeRingMaterial, ringsGeometry, type Dolphin } from "./sea/life";
import { ORIGIN, WORLDS, voyage } from "./voyage";
import { ISLAND_U, buildGrotto, buildIsland, makeGrottoMaterial, makeIslandMaterial } from "./sea/island";
import { noise2 } from "./kit";
import { EYES, GROTTO, ISLAND } from "./sea/shape";
import { buildWisps, makeGlass, makeWispMaterial } from "./sea/water";

// Tranquility (Ramybė, 1904). One pale, still field of greenish gold, the sky and the water nearly the same; a
// level horizon; and lying across it one long, low island that is also a creature asleep in the sea: a thin tail
// far to the left, a back that rises slowly, a rounded rocky head on the right that drops steeply to a short
// spit, and at the waterline under the head two small lights close together, like eyes peering out. Everything
// stands doubled in glassy water; each light drops a long thin path straight down the mirror. Nothing else.
//
// The way through it is one long look at the island, which never leaves the frame. The plane comes out low over
// the glass with the whole island lying in the evening exactly as he painted it, drifts a little aside so it
// lies broadside, then turns in toward the head. As it nears, the light drains out of the sky into a deep green
// dusk, the stars come out above and in the water, and the two eyes kindle, brightening until their paths run
// down the mirror to the plane; it goes in along them, the eyes on either hand, and between them, at the
// waterline, a low dark grotto takes it into the rock: the way on (no gate of light on this water).
//
// What happens on the way, and only once: after a calm while a pod of dolphins comes up beside the plane and goes
// leaping away across the bay before the island, doubled in the glass, leaving slow rings; and as the dusk falls
// the two eyes, shut until then, blink awake: a peep, shut, another, and then they open and burn.

const def = WORLDS.sea;
export const SEA_PAL: GroundPalette = { a: [0.3, 0.27, 0.16], b: [0.36, 0.3, 0.17], c: [0.26, 0.26, 0.17] };

// the dusk the evening drains into near the island: a deep green, not a navy night
const NIGHT = airState({
  label: "Tranquility",
  zenith: [0.008, 0.018, 0.024],
  upper: [0.02, 0.038, 0.04],
  horizon: [0.07, 0.092, 0.07],
  glow: [0.45, 0.3, 0.16],
  amb: [0.075, 0.1, 0.095],
  key: [0.6, 0.72, 0.7],
  keyI: 0.4,
  sunAz: 34,
  sunEl: -9,
  keyAz: 10,
  keyEl: 30,
  cloudLit: [0.1, 0.12, 0.11],
  cloudShade: [0.03, 0.04, 0.04],
  night: 0.9,
  exposure: 1.3,
  fx: [0.0, 0.0, 0.0, 0.9],
});
const dusk = { k: 0, keyK: -1, sky: null as SkyState | null };
const EYE_CORE: [number, number] = [5.4, 1.9];
const EYE_GLOW: [number, number] = [30, 0.3];

export default function SeaWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const r = rng(1904);
    const core: Halo[] = [];
    const glows: Halo[] = [];
    for (const p of EYES) {
      core.push({ p: [p[0], p[1], p[2] + 0.4], size: EYE_CORE[0], col: [1.0, 0.92, 0.72], k: EYE_CORE[1] });
      glows.push({ p: [p[0], p[1], p[2] + 0.6], size: EYE_GLOW[0], col: [0.95, 0.74, 0.42], k: EYE_GLOW[1] });
    }
    // the one upright mark in the picture: a thin post beyond the tip of the tail
    const post = new THREE.BufferGeometry();
    {
      const tip = ISLAND.x - ISLAND.half * 1.17;
      const q = new THREE.BoxGeometry(0.6, 20, 0.6).translate(tip, 8, ISLAND.z + 20);
      const bar = new THREE.BoxGeometry(4.2, 0.5, 0.5).translate(tip, 15, ISLAND.z + 20);
      const pos = [...(q.toNonIndexed().attributes.position.array as Float32Array), ...(bar.toNonIndexed().attributes.position.array as Float32Array)];
      post.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      post.setAttribute("aCol", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 4).fill(0).map((_, i) => (i % 4 === 3 ? 0 : 0.08)), 4));
      post.computeVertexNormals();
    }
    // far banks of haze where the water meets the sky, all the way round
    const puffs: Puff[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2;
      const d = 1500 + r() * 500;
      puffs.push({ p: [200 + Math.cos(a) * d, 8 + r() * 14, -250 + Math.sin(a) * d], size: 260 + r() * 220, a: 0.4 });
    }
    // low mist: level bands on the water before the island's foot, out across the bay, and beyond its tail
    const wisps: Parameters<typeof buildWisps>[0] = [];
    for (let i = 0; i < 9; i++) wisps.push({ x: ISLAND.x - ISLAND.half * 0.9 + r() * ISLAND.half * 1.9, z: ISLAND.z + 190 + r() * 260, w: 700 + r() * 500, d: 110 + r() * 120, y: 2.5 + r() * 5, a: 0.55 + r() * 0.3 });
    for (let i = 0; i < 7; i++) wisps.push({ x: -500 + r() * 1300, z: 300 - r() * 420, w: 600 + r() * 500, d: 120 + r() * 120, y: 2 + r() * 4, a: 0.35 + r() * 0.25 });
    for (let i = 0; i < 5; i++) wisps.push({ x: -700 + r() * 1700, z: ISLAND.z - 380 - r() * 300, w: 900 + r() * 500, d: 200, y: 4 + r() * 8, a: 0.5 });
    // a few sparks of the eyes' light adrift over the water before them
    const motes = pointsGeometry(
      props.mobile ? 40 : 110,
      (i, q) => {
        const e = EYES[i % 2];
        const a = q() * Math.PI;
        const d = 6 + q() * q() * 90;
        return [e[0] + Math.cos(a) * d * 0.8, 1.5 + q() * 16, e[2] + 4 + Math.sin(a) * d, 0.5 + q() * 1.2];
      },
      43,
    );
    // the pod: seven, two of them young, each with its own beat
    const pod: Dolphin[] = [];
    for (let i = 0; i < 7; i++) pod.push({ side: (r() - 0.2) * 26, back: i * 7 + r() * 5, size: i > 4 ? 2.4 : 3.6 + r() * 0.8, phase: r() * 5, period: 4.1 + r() * 1.6, high: i > 4 ? 2.2 : 3.0 + r() * 1.4 });
    // skerries: a few low rocks awash off the tip of the tail and beyond the spit, each standing in the glass
    const skerries = new THREE.BufferGeometry();
    {
      const parts: number[] = [];
      const cols: number[] = [];
      const spots: [number, number, number][] = [
        [ISLAND.x - ISLAND.half * 1.06, ISLAND.z + 34, 11],
        [ISLAND.x - ISLAND.half * 1.1, ISLAND.z + 6, 7],
        [ISLAND.x - ISLAND.half * 0.98, ISLAND.z + 64, 5],
        [ISLAND.x + ISLAND.half * 1.04, ISLAND.z + 30, 9],
        [ISLAND.x + ISLAND.half * 1.09, ISLAND.z + 52, 5],
        [ISLAND.x + ISLAND.half * 0.9, ISLAND.z + 96, 6],
      ];
      for (const [x, z, s] of spots) {
        const g0 = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
        const p = g0.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const nx = p.getX(i);
          const ny = p.getY(i);
          const nz = p.getZ(i);
          const k = 0.8 + 0.5 * noise2(nx * 1.7 + x, nz * 1.7 + z) + 0.2 * noise2(nx * 5 + 3, ny * 5 + z);
          parts.push(x + nx * s * 1.5 * k, Math.max(-1.5, ny * s * 0.42 * k + s * 0.06), z + nz * s * k);
          cols.push(0.07, 0.11, 0.075, 0.5);
        }
        g0.dispose();
      }
      skerries.setAttribute("position", new THREE.Float32BufferAttribute(parts, 3));
      skerries.setAttribute("aCol", new THREE.Float32BufferAttribute(cols, 4));
      skerries.computeVertexNormals();
    }
    // gulls wheeling far off over the tail, small in the evening
    const flocks: Flock[] = [
      { c: [ISLAND.x - ISLAND.half * 0.7, 70, ISLAND.z + 120], r: 170, n: props.mobile ? 5 : 9, size: 1.5, speed: 8 },
      { c: [ISLAND.x + ISLAND.half * 0.2, 240, ISLAND.z], r: 120, n: props.mobile ? 4 : 7, size: 1.4, speed: 7 },
    ];
    // the magic in the air: small lights adrift over the water before the head, kindled once night has fallen
    const spirits = pointsGeometry(
      props.mobile ? 120 : 320,
      (_, q) => {
        const a = q() * Math.PI;
        const d = 30 + Math.sqrt(q()) * 560;
        return [GROTTO.x + Math.cos(a) * d * 0.9 - 60, 2 + q() * q() * 46, ISLAND.z + 120 + Math.sin(a) * d, 0.5 + q() * 1.3];
      },
      57,
    );
    return {
      spirits,
      spiritMat: makePoints({ a: [0.5, 0.95, 0.8], b: [1, 0.9, 0.6], scale: 150, drift: 3.4, gain: 0, max: 9 }),
      pod: dolphinsGeometry(pod),
      podMat: makeDolphinMaterial(),
      podMirror: makeDolphinMaterial(true),
      rings: ringsGeometry(pod),
      ringMat: makeRingMaterial(),
      skerries,
      skerryMirror: new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        side: THREE.DoubleSide,
        uniforms: { ...SKY_U, ...WORLD_U },
        vertexShader: `varying vec3 vWorld; varying float vY; void main(){ vY = position.y; vec4 wp = modelMatrix * vec4(position.x, -position.y * 1.15, position.z, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `varying vec3 vWorld; varying float vY;
${GLSL_SKY}
${GLSL_AIR}
void main(){ if (vY < 0.0) discard; vec3 col = applyAir(vec3(0.03, 0.06, 0.04) * (uSkyCol * 0.95 + 0.04), vWorld); gl_FragColor = vec4(col, 0.9);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
      }),
      flocks,
      island: buildIsland(props.mobile),
      grotto: buildGrotto(),
      post,
      rock: makeIslandMaterial(),
      grottoMat: makeGrottoMaterial(),
      postMat: makeTempera({ amb: 0.95, key: 0.4 }),
      core: haloGeometry(core),
      coreMat: makeHaloMaterial(0),
      glow: haloGeometry(glows),
      glowMat: makeHaloMaterial(2),
      puffs,
      wisps: buildWisps(wisps),
      wispMat: makeWispMaterial(),
      motes,
      moteMat: makePoints({ a: [1, 0.74, 0.36], b: [1, 0.94, 0.7], scale: 120, drift: 2.4, gain: 0, max: 8 }),
      water: makeGlass(),
    };
  }, [props.mobile]);
  // the world's own sky turns with the plane's distance to the island (re-blended only when the step changes)
  useEffect(() => {
    voyage.skyMod = (s) => {
      if (voyage.cur !== "sea" || dusk.k <= 0.002) return s;
      const q = Math.round(dusk.k * 160) / 160;
      if (q !== dusk.keyK || !dusk.sky) {
        dusk.keyK = q;
        const e = q * q * (3 - 2 * q);
        dusk.sky = mixSky(s, NIGHT, e);
      }
      return dusk.sky;
    };
    return () => {
      voyage.skyMod = null;
      dusk.k = 0;
      dusk.sky = null;
      dusk.keyK = -1;
      ISLAND_U.uEyeK.value.set(0, 0);
      ISLAND_U.uOpen.value = 0;
      ISLAND_U.uMagic.value = 0;
      SEA_LIFE_U.uPodT.value = -1;
    };
  }, []);
  const ev = useRef({ on: false, wake: -1, pod: false, podT0: -1, magic: 0, open: 0 });
  // (a moment of the flight: worlds/moments.tsx; in development __moments.fire("dolphins") brings them at once)
  const pod = useMoment("sea", { id: "dolphins", after: 18, at: [322, 9, 400], within: 270, ease: 1, hold: 44, out: 1 });
  useDeepLens("sea");
  useFrame(({ camera }) => {
    // made ready ahead of time, it waits: the air is still the world's before it
    const e = ev.current;
    if (voyage.cur !== "sea") {
      e.on = false;
      return;
    }
    const now = SKY_U.uTime.value;
    if (!e.on) {
      // each coming is the first: the eyes are shut, the pod has not been
      e.on = true;
      e.wake = -1;
      e.podT0 = -1;
      e.magic = 0;
      e.open = 0;
    }
    // the pod comes up once, after a calm while, close ahead and to the right, and goes with the plane toward the island for a while
    // (the moment says when; its seconds are counted on the sky's own clock, which is the one the water runs on)
    if (pod.on && !e.pod) {
      SEA_LIFE_U.uPod.value.set(camera.position.x - ORIGIN.x + 24, camera.position.z - ORIGIN.z - 62, -0.08, -0.997);
      e.podT0 = now;
    }
    e.pod = pod.on;
    SEA_LIFE_U.uPodT.value = e.podT0 >= 0 && now - e.podT0 < 52 ? now - e.podT0 : -1;
    // the head of the island, from the eye
    const d = Math.hypot(camera.position.x - ORIGIN.x - GROTTO.x, camera.position.z - ORIGIN.z - ISLAND.z);
    // evening into a deep green dusk as the island comes near; the air clears as the light goes
    // (night first: it has fallen well before the plane is close; then the magic; then the mouth opens)
    dusk.k = Math.min(1, Math.max(0, (1330 - d) / 560));
    const sm = THREE.MathUtils.smoothstep;
    e.magic = Math.max(e.magic, sm(760 - d, 0, 300));
    e.open = Math.max(e.open, sm(500 - d, 0, 270));
    ISLAND_U.uMagic.value = e.magic;
    ISLAND_U.uOpen.value = e.open;
    b.spiritMat.uniforms.uGain.value = 0.8 * e.magic;
    WORLD_U.uFogD.value = 0.00007 - 0.00003 * dusk.k;
    // the eyes kindle with it; they breathe a little, slowly, never in step; and once in a long while one of
    // them closes for a moment
    // (shut until the dusk has begun; then they blink awake, the second a moment after the first)
    // (the two eyes are there to be seen the whole way, small and steady in the evening; as night falls they blink
    // once and then burn brighter)
    if (e.wake < 0 && dusk.k > 0.3) e.wake = now;
    const kin = 0.34 + 0.66 * THREE.MathUtils.smoothstep(dusk.k, 0.25, 0.9);
    const waking = (tw: number) => (e.wake < 0 || tw < 0 ? 0.75 : tw < 0.25 ? 0.1 : tw < 0.6 ? 0.9 : tw < 0.85 ? 0.15 : Math.min(1, 0.6 + (tw - 0.85) * 0.5));
    const ca = b.core.getAttribute("aCol") as THREE.InstancedBufferAttribute;
    const ga = b.glow.getAttribute("aCol") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < 2; i++) {
      const breath = 0.9 + 0.1 * Math.sin(now * (0.37 + i * 0.11) + i * 2.1);
      const period = 19 + i * 6.5;
      const ph = (now + i * 7.3) % period;
      const blink = 1 - Math.exp(-Math.pow((ph - period * 0.5) / 0.16, 2));
      const k = kin * breath * blink * waking(now - e.wake - i * 0.45);
      ca.setW(i, EYE_CORE[1] * k);
      ga.setW(i, EYE_GLOW[1] * k);
      ISLAND_U.uEyeK.value.setComponent(i, k);
    }
    ca.needsUpdate = true;
    ga.needsUpdate = true;
    b.moteMat.uniforms.uGain.value = 0.55 * kin * kin;
  });
  return (
    <>
      <WorldBase id="sea" def={def} pal={SEA_PAL} props={props} grass={false} arch={false} pathTint={[1, 0.92, 0.74]} pathGain={0.12} angels={false} marks={false} />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[6400, 6400]} />
      </mesh>
      <mesh geometry={b.skerries} material={b.skerryMirror} renderOrder={-3} />
      <mesh geometry={b.pod} material={b.podMirror} frustumCulled={false} renderOrder={-3} />
      <mesh geometry={b.pod} material={b.podMat} frustumCulled={false} renderOrder={-2} />
      <mesh geometry={b.rings} material={b.ringMat} frustumCulled={false} renderOrder={-1} />
      <mesh geometry={b.island} material={b.rock} />
      <mesh geometry={b.skerries} material={b.rock} />
      <Birds flocks={b.flocks} tint={[0.07, 0.08, 0.07]} />
      <mesh geometry={b.grotto} material={b.grottoMat} />
      {/* inside the grotto, the way on: a soft sheet of light, the night beyond faintly in it (no arch: the rock is the door) */}
      <LightGate id="sea" def={def} look="veil" half={13} rise={12} gain={0.85} tint={[0.82, 0.9, 1]} />
      <mesh geometry={b.post} material={b.postMat} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <mesh geometry={b.wisps} material={b.wispMat} renderOrder={3} />
      <points geometry={b.motes} material={b.moteMat} />
      <points geometry={b.spirits} material={b.spiritMat} />
      <mesh geometry={b.glow} material={b.glowMat} renderOrder={6} />
      <mesh geometry={b.core} material={b.coreMat} renderOrder={6} />
    </>
  );
}
