"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { WORLD_U, haloGeometry, makeHaloMaterial, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type Puff } from "./kit";
import { SKY_U, airState, mixSky, type SkyState } from "../sky";
import { ORIGIN, WORLDS, voyage } from "./voyage";
import { ISLAND_U, buildGrotto, buildIsland, makeGrottoMaterial, makeIslandMaterial } from "./sea/island";
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
    return {
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
    };
  }, []);
  useFrame(({ camera }) => {
    // made ready ahead of time, it waits: the air is still the world's before it
    if (voyage.cur !== "sea") return;
    const now = SKY_U.uTime.value;
    // the head of the island, from the eye
    const d = Math.hypot(camera.position.x - ORIGIN.x - GROTTO.x, camera.position.z - ORIGIN.z - ISLAND.z);
    // evening into a deep green dusk as the island comes near; the air clears as the light goes
    dusk.k = Math.min(1, Math.max(0, (1010 - d) / 640));
    WORLD_U.uFogD.value = 0.00007 - 0.00003 * dusk.k;
    // the eyes kindle with it; they breathe a little, slowly, never in step; and once in a long while one of
    // them closes for a moment
    const kin = 0.1 + 0.9 * THREE.MathUtils.smoothstep(dusk.k, 0.12, 0.85);
    const ca = b.core.getAttribute("aCol") as THREE.InstancedBufferAttribute;
    const ga = b.glow.getAttribute("aCol") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < 2; i++) {
      const breath = 0.9 + 0.1 * Math.sin(now * (0.37 + i * 0.11) + i * 2.1);
      const period = 19 + i * 6.5;
      const ph = (now + i * 7.3) % period;
      const blink = 1 - Math.exp(-Math.pow((ph - period * 0.5) / 0.16, 2));
      const k = kin * breath * blink;
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
      <mesh geometry={b.island} material={b.rock} />
      <mesh geometry={b.grotto} material={b.grottoMat} />
      <mesh geometry={b.post} material={b.postMat} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <mesh geometry={b.wisps} material={b.wispMat} renderOrder={3} />
      <points geometry={b.motes} material={b.moteMat} />
      <mesh geometry={b.glow} material={b.glowMat} renderOrder={6} />
      <mesh geometry={b.core} material={b.coreMat} renderOrder={6} />
    </>
  );
}
