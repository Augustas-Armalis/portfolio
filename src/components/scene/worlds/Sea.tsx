"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, WORLD_U, makeTempera, makeWater, ridge2, rng, type GroundPalette, type Halo, type Puff } from "./kit";
import { Birds, type Flock } from "./life";
import { SKY_U, airState, mixSky, type SkyState } from "../sky";
import { ORIGIN, WORLDS, voyage } from "./voyage";

// Tranquility (Ramybė, 1904). One hazy field of ochre and grey-green, the sky
// and the water nearly the same; a level horizon; and on it one long dark
// island that is also a creature lying in the sea: a rounded head off to the
// right, a long back sinking away to the left into a thin spit, and at the
// waterline under the head two small lights, each drawn down into the still
// water as a long broken streak. Nothing else.
//
// Built at the size it has in the picture's frame: the island is over a kilometre long and its head stands
// 240 m out of the water, carved with ridges, cliffs and gullies and a thread of light along its crest. The
// plane comes straight out over the bay toward the two lights; as it nears the island the evening deepens into
// night (the sky's own colours turn, the stars come out, the water darkens and mirrors it), mist lies low on the
// water, and the eyes' light comes down the whole bay as two wide glittering paths.

const def = WORLDS.sea;
export const SEA_PAL: GroundPalette = { a: [0.3, 0.27, 0.16], b: [0.36, 0.3, 0.17], c: [0.26, 0.26, 0.17], shore: [0.42, 0.37, 0.24] };

// the island lies along x, its head toward +x; these are shared with the water's mirror of it
export const ISLAND = { x: 40, z: -640, half: 560, top: 240 };
// height of the back at a place along it (-1 the tip of the spit .. +1 the short spit beyond the head), in metres
const profJS = (xn: number) => {
  const d = xn - 0.54;
  const e = Math.exp(-Math.pow(Math.abs(d) / (d < 0 ? 0.47 : 0.15), d < 0 ? 1.45 : 3.0));
  const hk = Math.min(1, e / 0.9);
  const head = hk * hk * (3 - 2 * hk); // a broad, flat crown
  const back = 0.1 * Math.exp(-Math.pow((xn + 0.3) / 0.3, 2));
  const tail = 0.05 * (1 - Math.pow(Math.abs(xn), 6));
  return ISLAND.top * (head * 0.95 + back + tail) * (1 - Math.pow(Math.abs(xn), 12));
};
const PROF_GLSL = /* glsl */ `
float islandProf(float xn){
  float d = xn - 0.54;
  float head = smoothstep(0.0, 0.9, exp(-pow(abs(d) / (d < 0.0 ? 0.47 : 0.15), d < 0.0 ? 1.45 : 3.0)));
  float bq = (xn + 0.3) / 0.3;
  float back = 0.1 * exp(-bq * bq);
  float tail = 0.05 * (1.0 - pow(abs(xn), 6.0));
  return ${ISLAND.top.toFixed(1)} * (head * 0.95 + back + tail) * (1.0 - pow(abs(xn), 12.0));
}`;
const halfWidth = (xn: number) => 10 + profJS(xn) * 0.56;

function buildIsland(mobile: boolean) {
  const g = new THREE.SphereGeometry(1, mobile ? 90 : 150, mobile ? 28 : 44);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const xn = v.x;
    const prof = profJS(xn);
    // the crown of the head is lumpy, like knuckles, or clumps of trees
    const crown = Math.exp(-Math.pow((xn - 0.56) / 0.17, 2));
    const lump = 1 + crown * (0.075 * Math.abs(Math.sin(xn * 34 + 0.6 + v.z * 1.2)) + 0.025 * Math.sin(xn * 97 + v.z * 5)) + 0.025 * Math.sin(xn * 23 + v.z * 7);
    // carved: ridges running down its flanks, gullies between them, a few sheer cliffs where the head meets the sea
    const ridges = ridge2(xn * 9 + 3.1, Math.atan2(v.y, v.z) * 2.2, 4);
    const cliff = Math.exp(-Math.pow((xn - 0.6) / 0.12, 2)) * Math.max(0, 1 - Math.abs(v.y - 0.25) * 2.2);
    const carve = 1 + 0.09 * (ridges - 0.45) + 0.05 * cliff;
    const y = Math.max(v.y, -0.08) * prof * lump * (1 + 0.04 * (ridges - 0.45));
    p.setXYZ(i, xn * ISLAND.half, y, v.z * halfWidth(xn) * (1 + 0.05 * Math.sin(xn * 31 + v.y * 4)) * carve);
    // near-black olive at the head, through plum, to violet-blue at the far tip: the air inside one object
    const k = Math.min(1, Math.max(0, (0.62 - xn) / 1.5));
    const a = k < 0.45 ? [0.016, 0.042, 0.026] : [0.06, 0.075, 0.085];
    const b = k < 0.45 ? [0.06, 0.075, 0.085] : [0.15, 0.18, 0.34];
    const t = k < 0.45 ? k / 0.45 : (k - 0.45) / 0.55;
    let r = a[0] + (b[0] - a[0]) * t;
    let gg = a[1] + (b[1] - a[1]) * t;
    let bb = a[2] + (b[2] - a[2]) * t;
    // the steep right flank and the crown catch a green light
    const lit = Math.max(0, Math.min(1, (xn - 0.6) / 0.14)) * Math.max(0, v.x * 0.2 + v.y * 0.9) + crown * Math.max(0, v.y - 0.72) * 2.2;
    const gl = Math.min(1, lit);
    r += (0.1 - r) * gl;
    gg += (0.27 - gg) * gl;
    bb += (0.11 - bb) * gl;
    col.set([r, gg, bb, 0], i * 4);
  }
  g.setAttribute("aCol", new THREE.BufferAttribute(col, 4));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// where the two eyes are: at the waterline under the head, on the side that faces the way in
// (set up in the face now, a fifth of the way up the head, where they look out over the bay)
export function eyes() {
  return [0.5, 0.64].map((xn) => {
    const prof = profJS(xn);
    const y = prof * 0.2;
    const vy = y / Math.max(prof, 1);
    return new THREE.Vector3(ISLAND.x + xn * ISLAND.half, y, ISLAND.z + halfWidth(xn) * Math.sqrt(Math.max(0, 1 - vy * vy)) + 2);
  });
}

// the night the evening turns into near the island
const NIGHT = airState({
  label: "Tranquility",
  zenith: [0.008, 0.016, 0.04],
  upper: [0.024, 0.04, 0.08],
  horizon: [0.11, 0.1, 0.12],
  glow: [0.75, 0.5, 0.3],
  amb: [0.1, 0.12, 0.17],
  key: [0.62, 0.7, 0.92],
  keyI: 0.55,
  sunAz: 62,
  sunEl: -12,
  keyAz: -30,
  keyEl: 40,
  cloudLit: [0.2, 0.2, 0.24],
  cloudShade: [0.05, 0.06, 0.08],
  night: 1,
  exposure: 1.25,
  fx: [0.0, 0.0, 0.0, 1],
});
const dusk = { k: 0, keyK: -1, sky: null as SkyState | null };

export default function SeaWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const e = eyes();
    const r = rng(1904);
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    for (const p of e) {
      // a hot small core, a halo, and a wide soft bloom: they are the brightest things in the world
      halos.push({ p: [p.x, p.y, p.z + 0.4], size: 9, col: [1.0, 0.9, 0.66], k: 1.8 });
      glows.push({ p: [p.x, p.y, p.z + 0.6], size: 46, col: [0.95, 0.72, 0.38], k: 0.32 });
      glows.push({ p: [p.x, p.y, p.z + 1], size: 140, col: [0.9, 0.62, 0.32], k: 0.09 });
    }
    // a thin post at the very tip of the spit, the one upright mark in the picture
    const k = new Kit();
    const tip = ISLAND.x - ISLAND.half * 0.985;
    k.box(0.35, 13, 0.35, [tip, 5.5, ISLAND.z], [0.05, 0.05, 0.07]);
    k.box(2.6, 0.3, 0.3, [tip, 9.6, ISLAND.z], [0.05, 0.05, 0.07]);
    const puffs: Puff[] = [];
    // mist lying low on the water: along the island's foot, and in drifting banks across the bay
    for (let i = 0; i < 22; i++) puffs.push({ p: [ISLAND.x - ISLAND.half * (0.9 - r() * 1.8), 4 + r() * 6, ISLAND.z + 150 + (r() - 0.5) * 160], size: 70 + r() * 90, a: 0.55 });
    for (let i = 0; i < 18; i++) puffs.push({ p: [(r() - 0.5) * 900, 3 + r() * 5, 380 - r() * 760], size: 60 + r() * 80, a: 0.4 });
    // a soft band of mist lying along the horizon all round
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2;
      const d = 1000 + r() * 500;
      puffs.push({ p: [Math.cos(a) * d, 10 + r() * 16, -60 + Math.sin(a) * d], size: 230 + r() * 200, a: 0.55 });
    }
    // far sails: three small pale marks on the horizon, each with its dark hull
    const sk = new Kit();
    for (const [x, z, h] of [
      [-520, -640, 17],
      [-610, -470, 13],
      [-420, -300, 11],
      [640, -520, 15],
      [760, -260, 19],
    ] as const) {
      const sail = new THREE.BufferGeometry();
      sail.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, h * 0.42, 0, 0, 0, h, 0, 0, 0, 0, 0, h * 0.86, 0, -h * 0.2, 0, 0], 3));
      sail.computeVertexNormals();
      sk.add(sail, [x, 1.6, z], [0.62, 0.6, 0.5]);
      sk.box(h * 0.72, 1.3, 1.6, [x + h * 0.08, 0.9, z], [0.07, 0.08, 0.07]);
    }
    // a few birds, far and high: no more than strokes of the brush
    const bk = new Kit();
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BufferGeometry();
      const w = 3.4 + r() * 1.6;
      g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, -w, w * 0.34, 0.5, -w * 0.5, 0.02, -0.5, 0, 0, 0, w * 0.5, 0.02, -0.5, w, w * 0.34, 0.5], 3));
      g.computeVertexNormals();
      bk.add(g, [(i - 2) * 16 + r() * 10, r() * 12, (i % 2) * 22 + r() * 14], [0.07, 0.08, 0.075], { rot: [0, r() * 0.4, 0] });
    }
    return {
      island: buildIsland(props.mobile),
      dark: makeTempera({ amb: 0.85, key: 0.5, dab: 1.2, grain: 1, ao: 0.4, aoH: 60, rim: [0.55, 0.62, 0.42], rimPow: 4, wrap: 0.5 }),
      flocks: [
        { c: [ISLAND.x + 320, 120, ISLAND.z + 120], r: 260, n: props.mobile ? 6 : 12, size: 2.2, speed: 11 },
        { c: [-200, 60, -100], r: 150, n: props.mobile ? 4 : 8, size: 1.4, speed: 9 },
      ] as Flock[],
      post: k.build(),
      sails: sk.build(),
      birds: bk.build(),
      halos,
      glows,
      puffs,
      water: makeWater({
        def,
        lights: e,
        lightCol: [1.0, 0.86, 0.56],
        lightLen: 1600,
        lightW: 5,
        deep: [0.1, 0.11, 0.075],
        calm: 0.55,
        tint: [0.97, 0.99, 0.96],
        shore: SEA_PAL.shore,
        // the island stands mirrored in the still water: its outline against the sky, read where the mirrored ray crosses the island's long axis
        reflect: /* glsl */ `
          ${PROF_GLSL}
          vec4 worldReflect(vec3 P, vec3 r){
            float dz = ${ISLAND.z.toFixed(1)} - P.z;
            if (abs(r.z) < 1e-4 || dz / r.z < 0.0) return vec4(0.0);
            float t = dz / r.z;
            float xn = (P.x + r.x * t - ${ISLAND.x.toFixed(1)}) / ${ISLAND.half.toFixed(1)};
            if (abs(xn) > 1.0) return vec4(0.0);
            float y = r.y * t;
            float h = islandProf(xn);
            float m = smoothstep(-1.5, 3.0 + t * 0.012, h - y);
            // darker and softer than the island itself; nearly black under the head, bluer down the back
            float k = clamp((0.62 - xn) / 1.5, 0.0, 1.0);
            vec3 c = mix(vec3(0.012, 0.026, 0.018), vec3(0.08, 0.095, 0.15), smoothstep(0.2, 1.0, k)) * (uSkyCol * 1.4 + 0.2);
            return vec4(c, m * (0.94 - 0.3 * smoothstep(0.3, 1.0, k)));
          }`,
      }),
    };
  }, [props.mobile]);
  // The long approach: far out the island is two lights and a shape in the haze; the air clears as the plane
  // comes in, and thickens again behind it. The birds drift in a slow wide circle beyond the head.
  const birds = useRef<THREE.Group>(null);
  const clear = useRef(0);
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
  const last = useRef(0);
  useFrame(({ camera }) => {
    // made ready ahead of time, it waits: the air is still the world's before it
    if (voyage.cur !== "sea") return;
    // the scene's own clock (it is the one the dev stills step)
    const now = SKY_U.uTime.value;
    const dt = Math.min(Math.max(now - last.current, 0), 0.1);
    last.current = now;
    const d = Math.hypot(camera.position.x - ORIGIN.x - (ISLAND.x + ISLAND.half * 0.5), camera.position.z - ORIGIN.z - ISLAND.z);
    const want = 1 - Math.min(1, Math.max(0, (d - 400) / 700));
    clear.current += (want - clear.current) * (1 - Math.exp(-dt * 0.5));
    const k = clear.current * clear.current * (3 - 2 * clear.current);
    WORLD_U.uFogD.value = def.fog[0] * (4.2 - 3.4 * k);
    // evening into night, smoothly, with the distance to the island (from the painting at the way in to the head)
    dusk.k = Math.min(1, Math.max(0, (1180 - d) / 760));
    if (birds.current) {
      const t = now * 0.03;
      birds.current.position.set(ISLAND.x + 260 + Math.cos(t) * 300, 150 + Math.sin(t * 3.1) * 12, ISLAND.z - 240 + Math.sin(t) * 220);
      birds.current.rotation.y = -t + Math.PI;
    }
  });
  return (
    <>
      <WorldBase id="sea" def={def} pal={SEA_PAL} props={props} tip={[0.5, 0.47, 0.26]} pathTint={[1, 0.9, 0.7]} pathGain={0.24} tall={1.5} groundSize={900} angels={false} marks={false} />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[5200, 5200]} />
      </mesh>
      <mesh geometry={b.island} material={b.dark} position={[ISLAND.x, 0, ISLAND.z]} />
      <mesh geometry={b.post} material={b.dark} />
      <mesh geometry={b.sails} material={b.dark} />
      <group ref={birds}>
        <mesh geometry={b.birds} material={b.dark} />
      </group>
      <Birds flocks={b.flocks} tint={[0.06, 0.07, 0.07]} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
