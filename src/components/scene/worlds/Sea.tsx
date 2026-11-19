"use client";

import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makeTempera, makeWater, rng, type GroundPalette, type Halo, type Puff } from "./kit";
import { WORLDS } from "./voyage";

// Tranquility (Ramybė, 1904). One hazy field of ochre and grey-green, the sky
// and the water nearly the same; a level horizon; and on it one long dark
// island that is also a creature lying in the sea: a rounded head off to the
// right, a long back sinking away to the left into a thin spit, and at the
// waterline under the head two small lights, each drawn down into the still
// water as a long broken streak. Nothing else.

const def = WORLDS.sea;
export const SEA_PAL: GroundPalette = { a: [0.3, 0.27, 0.16], b: [0.36, 0.3, 0.17], c: [0.26, 0.26, 0.17], shore: [0.42, 0.37, 0.24] };

// the island lies along x, its head toward +x; these are shared with the water's mirror of it
export const ISLAND = { x: 40, z: -260, half: 262, top: 98 };
// height of the back at a place along it (-1 the tip of the spit .. +1 the short spit beyond the head), in metres
const profJS = (xn: number) => {
  const d = xn - 0.54;
  const e = Math.exp(-Math.pow(Math.abs(d) / (d < 0 ? 0.34 : 0.16), d < 0 ? 1.9 : 3.2));
  const hk = Math.min(1, e / 0.9);
  const head = hk * hk * (3 - 2 * hk); // a broad, flat crown
  const back = 0.17 * Math.exp(-Math.pow((xn + 0.26) / 0.4, 2));
  const tail = 0.05 * (1 - Math.pow(Math.abs(xn), 6));
  return ISLAND.top * (head * 0.95 + back + tail) * (1 - Math.pow(Math.abs(xn), 12));
};
const PROF_GLSL = /* glsl */ `
float islandProf(float xn){
  float d = xn - 0.54;
  float head = smoothstep(0.0, 0.9, exp(-pow(abs(d) / (d < 0.0 ? 0.34 : 0.16), d < 0.0 ? 1.9 : 3.2)));
  float bq = (xn + 0.26) / 0.4;
  float back = 0.17 * exp(-bq * bq);
  float tail = 0.05 * (1.0 - pow(abs(xn), 6.0));
  return ${ISLAND.top.toFixed(1)} * (head * 0.95 + back + tail) * (1.0 - pow(abs(xn), 12.0));
}`;
const halfWidth = (xn: number) => 7 + profJS(xn) * 0.56;

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
    const lump = 1 + crown * (0.05 * Math.sin(xn * 56 + 1.0 + v.z * 1.5) + 0.03 * Math.sin(xn * 97 + v.z * 5)) + 0.03 * Math.sin(xn * 23 + v.z * 7);
    const y = Math.max(v.y, -0.08) * prof * lump;
    p.setXYZ(i, xn * ISLAND.half, y, v.z * halfWidth(xn) * (1 + 0.05 * Math.sin(xn * 31 + v.y * 4)));
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
export function eyes() {
  return [0.5, 0.665].map((xn) => new THREE.Vector3(ISLAND.x + xn * ISLAND.half, 1.5, ISLAND.z + halfWidth(xn) * 0.985));
}

export default function SeaWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const e = eyes();
    const r = rng(1904);
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    for (const p of e) {
      halos.push({ p: [p.x, p.y, p.z + 0.4], size: 3.4, col: [1.0, 0.9, 0.66], k: 1.4 });
      glows.push({ p: [p.x, p.y, p.z + 0.6], size: 15, col: [0.95, 0.72, 0.38], k: 0.22 });
    }
    // a thin post at the very tip of the spit, the one upright mark in the picture
    const k = new Kit();
    const tip = ISLAND.x - ISLAND.half * 0.985;
    k.box(0.35, 13, 0.35, [tip, 5.5, ISLAND.z], [0.05, 0.05, 0.07]);
    k.box(2.6, 0.3, 0.3, [tip, 9.6, ISLAND.z], [0.05, 0.05, 0.07]);
    const puffs: Puff[] = [];
    for (let i = 0; i < 10; i++) puffs.push({ p: [ISLAND.x - ISLAND.half * (0.3 + r() * 0.9), 5 + r() * 4, ISLAND.z + (r() - 0.5) * 120], size: 50 + r() * 60, a: 0.5 });
    return {
      island: buildIsland(props.mobile),
      dark: makeTempera({ amb: 0.85, key: 0.5, dab: 1.2 }),
      post: k.build(),
      halos,
      glows,
      puffs,
      water: makeWater({
        def,
        lights: e,
        lightCol: [1.0, 0.86, 0.56],
        lightLen: 900,
        deep: [0.1, 0.11, 0.075],
        calm: 0.4,
        tint: [0.95, 0.99, 0.96],
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
  return (
    <>
      <WorldBase id="sea" def={def} pal={SEA_PAL} props={props} tip={[0.5, 0.47, 0.26]} pathTint={[1, 0.9, 0.7]} pathGain={0.24} tall={1.5} groundSize={900} angels={false} marks={false} />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[5200, 5200]} />
      </mesh>
      <mesh geometry={b.island} material={b.dark} position={[ISLAND.x, 0, ISLAND.z]} />
      <mesh geometry={b.post} material={b.dark} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
