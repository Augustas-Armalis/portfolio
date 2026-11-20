"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { WORLD_U, haloGeometry, makeHaloMaterial, makeTempera, makeWater, ridge2, rng, type GroundPalette, type Halo, type Puff } from "./kit";
import { SKY_U, airState, mixSky, type SkyState } from "../sky";
import { ORIGIN, WORLDS, voyage } from "./voyage";

// Tranquility (Ramybė, 1904). One pale, still field of greenish gold, the sky and the water nearly the same; a
// level horizon; and lying across it one long, low island that is also a creature asleep in the sea: a thin tail
// far to the left, a back that rises slowly, a rounded rocky head on the right that drops steeply to a short
// spit, and at the waterline under the head two small lights close together, like eyes peering out. Everything
// stands doubled in glassy water; each light drops a long thin path straight down the mirror. Nothing else.
//
// The moment: the plane comes out low over the glass toward the whole island lying in the evening exactly as he
// painted it; as it nears, the light drains out of the sky into a deep green dusk and the two eyes kindle,
// brightening until their paths run down the mirror to the plane. It passes close along the creature's face with
// the eyes beside it, rounds the low spit under the head, and only behind the island, on dark water, is the way on.

const def = WORLDS.sea;
export const SEA_PAL: GroundPalette = { a: [0.3, 0.27, 0.16], b: [0.36, 0.3, 0.17], c: [0.26, 0.26, 0.17] };

// The island lies along x, its head toward +x. Its outline is the painting's own, read off the picture column by
// column (the top of the dark mass above the waterline, 65 steps from the tip of the tail to the end of the spit)
// and scaled so the head stands `top` metres out of the water.
export const ISLAND = { x: 40, z: -640, half: 580, top: 230 };
const PROFILE = [
  0.0, 0.026, 0.054, 0.082, 0.099, 0.108, 0.115, 0.122, 0.14, 0.153, 0.152, 0.146, 0.144, 0.149, 0.159, 0.173, 0.19, 0.208, 0.231, 0.254, 0.273, 0.293, 0.314, 0.329, 0.341, 0.352, 0.359, 0.369, 0.378, 0.381, 0.378, 0.375, 0.378, 0.391, 0.418,
  0.453, 0.485, 0.514, 0.546, 0.577, 0.612, 0.648, 0.685, 0.729, 0.792, 0.866, 0.926, 0.965, 0.991, 1.0, 0.996, 0.978, 0.946, 0.928, 0.884, 0.775, 0.621, 0.446, 0.321, 0.265, 0.224, 0.175, 0.119, 0.059, 0.0,
];
const PN = PROFILE.length - 1;
// height of the back over a place along it (-1 the tip of the tail .. +1 the end of the spit), in metres
const profJS = (xn: number) => {
  const f = Math.min(PN, Math.max(0, ((xn + 1) / 2) * PN));
  const i = Math.min(PN - 1, Math.floor(f));
  const t = f - i;
  const s = t * t * (3 - 2 * t);
  return ISLAND.top * (PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * s);
};
const PROF_GLSL = /* glsl */ `
const float ISL_P[${PROFILE.length}] = float[](${PROFILE.map((v) => v.toFixed(3)).join(", ")});
float islandProf(float xn){
  float f = clamp((xn + 1.0) * 0.5 * ${PN.toFixed(1)}, 0.0, ${PN.toFixed(1)});
  int i = int(min(floor(f), ${(PN - 1).toFixed(1)}));
  float t = f - float(i);
  return ${ISLAND.top.toFixed(1)} * mix(ISL_P[i], ISL_P[i + 1], t * t * (3.0 - 2.0 * t));
}`;
// how far it runs back from its face: a long narrow body, not a dome
const halfDepth = (h: number) => 12 + h * 0.42;
// how far along the head the crown is (the painting's head, between its steep left shoulder and its right cliff)
const crownOf = (xn: number) => Math.exp(-Math.pow((xn - 0.6) / 0.11, 2));

function buildIsland(mobile: boolean) {
  const NX = mobile ? 150 : 300;
  const NV = mobile ? 30 : 56;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NX; i++) {
    const xn = -1 + (2 * i) / NX;
    const h = profJS(xn);
    const w = halfDepth(h);
    const crown = crownOf(xn);
    for (let j = 0; j <= NV; j++) {
      // -1.08 .. 1.08 across: the last step each side is the skirt under the water
      const v = -1.08 + (2.16 * j) / NV;
      const av = Math.min(1, Math.abs(v));
      // rounded across, a little fuller toward the face so the head reads as a block of rock, not a mound
      let y = av >= 1 ? -5 : h * Math.pow(1 - Math.pow(av, 2.4), 0.55);
      // carved: gullies running down the flanks between rounded ribs, and on the crown a row of knuckles
      // (the ribs wander: their spacing and their run down the slope change along the body, so they never pleat)
      const rib = ridge2(xn * 17 + Math.sin(xn * 5.3) * 2.2 + v * 0.9 + 4.2, v * 2.4 + xn * 3.1 + (v > 0 ? 0 : 9), 4);
      // (soft on the steep right face, where a rib seen edge-on reads as a pleat)
      y += (rib - 0.42) * Math.min(16, h * 0.06) * (1 - av * av) * (v > 0 ? 1 : 0.6) * (1 - 0.75 * Math.max(0, Math.min(1, (xn - 0.68) / 0.08)));
      // (only on the crown itself: lower down the steep faces they would read as pleats)
      const crest = Math.max(0, Math.min(1, (1 - av * av - 0.55) / 0.35));
      y += crown * h * 0.045 * Math.pow(Math.abs(Math.sin(xn * 41 + v * 3.4 + 0.4)), 0.8) * crest;
      if (av < 1) y = Math.max(y, 0.4);
      const z = ISLAND.z + v * w * (1 + 0.04 * Math.sin(xn * 37 + v * 3));
      pos.push(ISLAND.x + xn * ISLAND.half, y, z);
      // dark green at the head, through grey-green, to a pale grey-violet at the far tip (the air inside one object)
      const far = Math.min(1, Math.max(0, (0.5 - xn) / 1.5));
      let r = 0.07 + (0.15 - 0.07) * far;
      let g = 0.12 + (0.155 - 0.12) * far;
      let b = 0.075 + (0.17 - 0.075) * far;
      // the crown and the face of the head catch the last light: a lighter, yellower green
      const top = crown * Math.max(0, Math.min(1, (y / Math.max(h, 1) - 0.72) / 0.22));
      const fk = Math.max(0, 1 - Math.abs(xn - 0.76) / 0.16);
      const face = fk * fk * (3 - 2 * fk) * (v > 0 ? 1 : 0.3);
      const lit = Math.min(1, top * 1.2 + face * 0.35);
      r += (0.2 - r) * lit;
      g += (0.32 - g) * lit;
      b += (0.13 - b) * lit;
      // the gullies hold darker paint
      const dk = 0.82 + 0.3 * rib;
      col.push(r * dk, g * dk, b * dk, 0);
    }
  }
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      const b = a + NV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Where the two eyes are: at the waterline on the island's face, under the head, close together (the painting
// sets them at 0.50 and 0.67 of the way from the middle to the end of the spit).
export function eyes() {
  return [0.5, 0.665].map((xn) => {
    const h = profJS(xn);
    const y = 9;
    // the face at that height
    const av = Math.pow(1 - Math.pow(y / h, 1 / 0.55), 1 / 2.4);
    return new THREE.Vector3(ISLAND.x + xn * ISLAND.half, y, ISLAND.z + av * halfDepth(h) + 5);
  });
}

// the dusk the evening drains into near the island: a deep green, not a navy night
const NIGHT = airState({
  label: "Tranquility",
  zenith: [0.01, 0.02, 0.026],
  upper: [0.026, 0.044, 0.046],
  horizon: [0.085, 0.1, 0.08],
  glow: [0.45, 0.3, 0.16],
  amb: [0.08, 0.1, 0.1],
  key: [0.6, 0.72, 0.7],
  keyI: 0.4,
  sunAz: 34,
  sunEl: -9,
  keyAz: 10,
  keyEl: 30,
  cloudLit: [0.1, 0.12, 0.11],
  cloudShade: [0.03, 0.04, 0.04],
  night: 0.85,
  exposure: 1.3,
  fx: [0.0, 0.0, 0.0, 0.8],
});
const dusk = { k: 0, keyK: -1, sky: null as SkyState | null };
// the eyes: how far they have kindled (0..1)
const EYE_CORE: [number, number] = [4.6, 1.9];
const EYE_GLOW: [number, number] = [22, 0.34];
const EYE_SPILL: [number, number] = [70, 0.06];

export default function SeaWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const e = eyes();
    const r = rng(1904);
    const core: Halo[] = [];
    const glows: Halo[] = [];
    for (const p of e) {
      core.push({ p: [p.x, p.y, p.z + 0.4], size: EYE_CORE[0], col: [1.0, 0.92, 0.72], k: EYE_CORE[1] });
      glows.push({ p: [p.x, p.y, p.z + 0.6], size: EYE_GLOW[0], col: [0.95, 0.74, 0.42], k: EYE_GLOW[1] });
      // a little of their light on the rock round them
      glows.push({ p: [p.x, p.y + 6, p.z - 2], size: EYE_SPILL[0], col: [0.9, 0.62, 0.3], k: EYE_SPILL[1] });
    }
    // the one upright mark in the picture: a thin post beyond the tip of the tail
    const post = new THREE.BufferGeometry();
    {
      const tip = ISLAND.x - ISLAND.half * 1.17;
      const q = new THREE.BoxGeometry(0.5, 16, 0.5).translate(tip, 6, ISLAND.z + 20);
      const bar = new THREE.BoxGeometry(3.4, 0.4, 0.4).translate(tip, 12, ISLAND.z + 20);
      const pos = [...(q.toNonIndexed().attributes.position.array as Float32Array), ...(bar.toNonIndexed().attributes.position.array as Float32Array)];
      post.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      post.setAttribute("aCol", new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 4).fill(0).map((_, i) => (i % 4 === 3 ? 0 : 0.08)), 4));
      post.computeVertexNormals();
    }
    const puffs: Puff[] = [];
    // a breath of mist lying along the island's foot, and a few thin banks far out on the water
    for (let i = 0; i < 16; i++) puffs.push({ p: [ISLAND.x - ISLAND.half * (0.95 - r() * 1.6), 3 + r() * 4, ISLAND.z + 130 + r() * 60], size: 60 + r() * 70, a: 0.32 });
    for (let i = 0; i < 10; i++) puffs.push({ p: [(r() - 0.5) * 1100, 2 + r() * 3, 200 - r() * 600], size: 50 + r() * 60, a: 0.22 });
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2;
      const d = 1300 + r() * 400;
      puffs.push({ p: [200 + Math.cos(a) * d, 8 + r() * 12, -250 + Math.sin(a) * d], size: 240 + r() * 200, a: 0.4 });
    }
    const water = makeWater({
      def,
      lights: e,
      lightCol: [1.0, 0.88, 0.62],
      lightLen: 1700,
      lightW: 1.25,
      deep: [0.12, 0.14, 0.11],
      calm: 0.16,
      tint: [0.9, 0.97, 0.93],
      // the island doubled in the still water: where the mirrored ray crosses the island's long axis, under its
      // outline (drawn a fifth longer, as he drew it, the head's reflection running far down toward the eye)
      reflect: /* glsl */ `
        ${PROF_GLSL}
        vec4 worldReflect(vec3 P, vec3 r){
          float dz = ${ISLAND.z.toFixed(1)} - P.z;
          if (abs(r.z) < 1e-4 || dz / r.z < 0.0) return vec4(0.0);
          float t = dz / r.z;
          float xn = (P.x + r.x * t - ${ISLAND.x.toFixed(1)}) / ${ISLAND.half.toFixed(1)};
          if (abs(xn) > 1.0) return vec4(0.0);
          float y = r.y * t;
          float h = islandProf(xn) * 1.2 + 2.0;
          float m = smoothstep(-1.0, 2.0 + t * 0.01, h - y);
          float far = clamp((0.5 - xn) / 1.5, 0.0, 1.0);
          vec3 c = mix(vec3(0.05, 0.085, 0.055), vec3(0.13, 0.14, 0.15), far);
          // the long soft upright strokes of the reflection, and a little more light where it meets the waterline
          c *= 0.86 + 0.24 * vnoise(vec2(P.x * 0.09, P.z * 0.004)) + 0.25 * exp(-y * 0.05);
          c *= uSkyCol * 1.1 + 0.08;
          return vec4(c, m * (0.95 - 0.25 * far));
        }`,
    });
    return {
      island: buildIsland(props.mobile),
      post,
      rock: makeTempera({ amb: 0.95, key: 0.42, dab: 0.8, grain: 0.8, ao: 0.35, aoH: 50, rim: [0.32, 0.4, 0.22], rimPow: 4, wrap: 0.45 }),
      core: haloGeometry(core),
      coreMat: makeHaloMaterial(0),
      glow: haloGeometry(glows),
      glowMat: makeHaloMaterial(2),
      puffs,
      water,
      light0: (water.uniforms.uLightCol.value as THREE.Color).clone(),
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
    };
  }, []);
  useFrame(({ camera }) => {
    // made ready ahead of time, it waits: the air is still the world's before it
    if (voyage.cur !== "sea") return;
    const now = SKY_U.uTime.value;
    // the head of the island, from the eye
    const d = Math.hypot(camera.position.x - ORIGIN.x - (ISLAND.x + ISLAND.half * 0.6), camera.position.z - ORIGIN.z - ISLAND.z);
    WORLD_U.uFogD.value = 0.00014;
    // evening into a deep green dusk as the island comes near
    dusk.k = Math.min(1, Math.max(0, (1060 - d) / 760));
    // the eyes kindle with it, and breathe a little, slowly, never in step
    const kin = 0.12 + 0.88 * THREE.MathUtils.smoothstep(dusk.k, 0.15, 0.85);
    const ca = b.core.getAttribute("aCol") as THREE.InstancedBufferAttribute;
    const ga = b.glow.getAttribute("aCol") as THREE.InstancedBufferAttribute;
    for (let i = 0; i < 2; i++) {
      const breath = 0.9 + 0.1 * Math.sin(now * (0.37 + i * 0.11) + i * 2.1);
      ca.setW(i, EYE_CORE[1] * kin * breath);
      ga.setW(i * 2, EYE_GLOW[1] * kin * breath);
      ga.setW(i * 2 + 1, EYE_SPILL[1] * kin * kin * breath);
    }
    ca.needsUpdate = true;
    ga.needsUpdate = true;
    (b.water.uniforms.uLightCol.value as THREE.Color).copy(b.light0).multiplyScalar(0.08 + 1.0 * kin);
  });
  return (
    <>
      <WorldBase id="sea" def={def} pal={SEA_PAL} props={props} grass={false} pathTint={[1, 0.92, 0.74]} pathGain={0.14} gateTint={[0.9, 0.95, 0.84]} angels={false} marks={false} />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[6400, 6400]} />
      </mesh>
      <mesh geometry={b.island} material={b.rock} />
      <mesh geometry={b.post} material={b.rock} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <mesh geometry={b.glow} material={b.glowMat} renderOrder={6} />
      <mesh geometry={b.core} material={b.coreMat} renderOrder={6} />
    </>
  );
}
