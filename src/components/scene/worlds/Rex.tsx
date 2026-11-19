"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, makeHaloMaterial, makeTempera, makeWater, haloGeometry, rng, type GroundPalette, type Halo, type V3 } from "./kit";
import { WORLDS, groundAt } from "./voyage";

// Rex (1909). Umber dusk, almost one colour. On a still sea stands a globe,
// dark, with paler lands drifting on it, and in front of it a blade of light
// rises from a small stepped altar; both lie mirrored in the water. Out of the
// globe climbs the throne: tier on tier, crowned, and over all of it a wide
// dark presence with a crown on either shoulder. Behind, great arcs sweep one
// inside another across the whole sky; fires burn in rows along them and
// comets ride them. A sun stands high to the left, a thin moon to the right.

const def = WORLDS.rex;
export const REX_PAL: GroundPalette = { a: [0.17, 0.13, 0.1], b: [0.24, 0.18, 0.13], c: [0.11, 0.09, 0.08], shore: [0.3, 0.23, 0.17], rock: [0.12, 0.095, 0.085] };

export const REX = { x: 0, z: -60, r: 64, cy: 52 };
const DARK: V3 = [0.05, 0.04, 0.036];
const STONE: V3 = [0.22, 0.17, 0.14];
const PALE: V3 = [0.56, 0.44, 0.36];
const FIRE: V3 = [1.0, 0.62, 0.3];

// the tiers of the throne above the globe: [half width, height]; shared with the water's mirror of it
const TIERS: [number, number][] = [
  [30, 96],
  [22, 70],
  [50, 58],
];

function makeGlobeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 q = normalize(vLocal);
        // lands and seas of a dark world: broad pale shapes with torn edges
        vec2 uv = vec2(atan(q.z, q.x) * 1.4, q.y * 2.2);
        float land = fbm(uv * 1.5 + 3.0) * 0.7 + fbm(uv * 4.5 + 9.0) * 0.3;
        float m = smoothstep(0.46, 0.56, land);
        vec3 alb = mix(vec3(0.035, 0.028, 0.026), vec3(0.4, 0.31, 0.26), m);
        float lit = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0);
        vec3 col = alb * (uSkyCol * (0.7 + 0.3 * n.y) + uKeyCol * lit * 0.5);
        // the blade's light on the face it stands before
        float face = max(q.z, 0.0);
        col += vec3(1.0, 0.82, 0.6) * exp(-q.x * q.x * 26.0) * face * face * 0.5 * (0.4 + 0.6 * m) * glowK();
        col += vec3(0.5, 0.36, 0.26) * pow(1.0 - abs(dot(n, V)), 3.0) * 0.25;
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// a broad faint band of the sky between two arcs
function makeArcBand(col: V3, a: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, uCol: { value: new THREE.Color(...col) }, uA: { value: a } },
    vertexShader: /* glsl */ `varying vec3 vLocal; varying vec3 vWorld; void main(){ vLocal = position; vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; uniform float uA;
      varying vec3 vLocal; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float r = length(vLocal.xy);
        float ang = atan(vLocal.y, vLocal.x);
        // hatched like his pencil: fine strokes along the arc, thinning toward the water
        float hatch = 0.6 + 0.4 * vnoise(vec2(ang * 60.0, r * 0.35));
        float a = uA * hatch * smoothstep(0.0, 0.22, sin(ang)) * (1.0 - airAmt(vWorld) * 0.5);
        gl_FragColor = vec4(uCol, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export default function RexWorld({ props }: { props: WorldProps }) {
  const comets = useRef<THREE.Group>(null);
  const b = useDisposable(() => {
    const r = rng(1909);
    const k = new Kit();
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const top = REX.cy + REX.r;

    // the dark ring the globe sits in
    k.add(new THREE.TorusGeometry(REX.r + 20, 9, 14, 80), [REX.x, REX.cy, REX.z - 6], DARK, { top: [0.1, 0.08, 0.07] });
    // the altar before it: six-sided steps, and the blade of light rising from them
    const bz = REX.z + REX.r + 16;
    for (let i = 0; i < 5; i++) k.add(new THREE.CylinderGeometry(15 - i * 2.4, 16 - i * 2.4, 2.6, 6), [REX.x, 1.3 + i * 2.6, bz], DARK, { top: [0.16, 0.12, 0.1], flat: true });
    const blade = new THREE.CylinderGeometry(0.25, 1.5, 78, 6, 12);
    k.add(blade, [REX.x, 13 + 39, bz], [1.0, 0.86, 0.66], { glow: 2.6 });
    glows.push({ p: [REX.x, 44, bz + 1], size: 62, col: [1, 0.78, 0.52], k: 0.5 });
    halos.push({ p: [REX.x, 16, bz + 1], size: 9, col: [1, 0.86, 0.62], k: 1.2 });

    // the throne: three tiers out of the globe, each with its cornice and crown
    let y = top - 10;
    TIERS.forEach(([hw, h], i) => {
      const dark = i === 2;
      const d = dark ? hw * 0.5 : hw;
      k.box(hw * 2, h, d * 2, [REX.x, y + h / 2, REX.z], dark ? DARK : STONE, { top: dark ? [0.085, 0.07, 0.062] : PALE });
      k.box(hw * 2 + 5, 3.4, d * 2 + 5, [REX.x, y + h, REX.z], dark ? DARK : PALE);
      // merlons along the front and back of the cornice
      const n = Math.round(hw / 3.2);
      for (let j = 0; j < n; j++) {
        const x = REX.x - hw + ((j + 0.5) / n) * hw * 2;
        for (const s of [-1, 1]) k.box((hw * 2) / n / 2, 5, 2.6, [x, y + h + 4.2, REX.z + s * d], dark ? DARK : PALE);
      }
      if (i === 0) {
        // tall narrow lights in the lowest tier
        for (let j = 0; j < 5; j++) for (const s of [-1, 1]) k.box(1.3, h * 0.42, 0.6, [REX.x - hw * 0.66 + j * hw * 0.33, y + h * 0.56, REX.z + s * (d + 0.2)], [1, 0.8, 0.56], { glow: 0.9 });
      }
      if (i === 1) {
        // corner turrets with pointed caps
        for (const sx of [-1, 1])
          for (const sz of [-1, 1]) {
            k.add(new THREE.CylinderGeometry(3.6, 4.2, 24, 8), [REX.x + sx * hw, y + h + 6, REX.z + sz * hw], STONE, { top: PALE });
            k.add(new THREE.ConeGeometry(4.6, 14, 8), [REX.x + sx * hw, y + h + 25, REX.z + sz * hw], STONE, { top: PALE });
          }
      }
      if (i === 2) {
        // a crown on either shoulder: a ring of tall points, lit from within
        for (const sx of [-1, 1]) {
          const cx = REX.x + sx * hw * 0.66;
          k.add(new THREE.CylinderGeometry(14, 13, 9, 14, 1, true), [cx, y + h + 9, REX.z], PALE, { glow: 0.2 });
          for (let j = 0; j < 9; j++) {
            const a = (j / 9) * Math.PI * 2;
            k.add(new THREE.ConeGeometry(2.4, 22 + (j % 3 === 0 ? 9 : 0), 5), [cx + Math.cos(a) * 13.4, y + h + 24 + (j % 3 === 0 ? 4.5 : 0), REX.z + Math.sin(a) * 13.4], PALE, { glow: 0.26 });
          }
          glows.push({ p: [cx, y + h + 22, REX.z + 6], size: 58, col: [1, 0.74, 0.5], k: 0.3 });
        }
        // between the crowns the back of the throne rises to a low gable
        k.box(hw * 0.7, 26, d * 1.6, [REX.x, y + h + 13, REX.z], DARK, { top: [0.1, 0.08, 0.07] });
        k.add(new THREE.ConeGeometry(hw * 0.5, 22, 4), [REX.x, y + h + 37, REX.z], DARK, { rot: [0, Math.PI / 4, 0], flat: true });
      }
      y += h;
    });
    const crownY = y;

    // the great arcs, one inside another, and the fires that burn along them
    const arcs = [190, 240, 300, 370, 450];
    const arcZ = REX.z - 70;
    arcs.forEach((R, i) => {
      k.add(new THREE.TorusGeometry(R, 1.3 + i * 0.25, 6, 140, Math.PI), [REX.x, 0, arcZ - i * 8], PALE, { glow: 0.5 });
      if (i === 1 || i === 3) {
        const n = props.mobile ? 26 : 56;
        for (let j = 0; j < n; j++) {
          const a = 0.12 + ((j + 0.5) / n) * (Math.PI - 0.24);
          const px = REX.x + Math.cos(a) * (R + 3);
          const py = Math.sin(a) * (R + 3);
          // each a little crown of three flames
          for (const o of [-1, 0, 1]) k.add(new THREE.ConeGeometry(1.0, o === 0 ? 7 : 4.6, 4), [px + o * 1.7 * Math.sin(a), py + (o === 0 ? 3.5 : 2.3) + Math.abs(o) * 0, arcZ - i * 8 + o * 0.2], FIRE, { glow: 1.5, rot: [0, 0, a - Math.PI / 2] });
        }
      }
    });
    const bandGeos = [0, 2].map((i) => new THREE.RingGeometry(arcs[i], arcs[i + 1], 120, 1, 0, Math.PI));

    // comets riding the arcs: a bright head and a long thin tail, built once and turned slowly as one
    const ck = new Kit();
    const cometHalos: Halo[] = [];
    const nC = props.mobile ? 8 : 14;
    for (let i = 0; i < nC; i++) {
      const R = arcs[1 + (i % 4)] - 12 - r() * 26;
      const a = 0.25 + r() * (Math.PI - 0.5);
      const p: V3 = [Math.cos(a) * R, Math.sin(a) * R, -(i % 4) * 8 + 4];
      const rad = 2.2 + r() * 2.2;
      ck.add(new THREE.SphereGeometry(rad, 12, 10), p, [1, 0.84, 0.62], { glow: 2.0 });
      const len = 30 + r() * 36;
      const dir = a + Math.PI / 2; // the tail streams back along the arc
      ck.add(new THREE.ConeGeometry(rad * 0.9, len, 6, 1, true), [p[0] + Math.cos(dir) * len * 0.5, p[1] + Math.sin(dir) * len * 0.5, p[2]], [0.85, 0.56, 0.36], { glow: 0.6, rot: [0, 0, dir - Math.PI / 2] });
      cometHalos.push({ p, size: rad * 5, col: [1, 0.76, 0.5], k: 0.9 });
    }

    // the sun, high to the left; the thin moon to the right
    const suns: Halo[] = [{ p: [REX.x - 430, 400, arcZ - 160], size: 120, col: [1, 0.84, 0.6], k: 1.4 }];
    const moon = new THREE.TorusGeometry(34, 4.4, 8, 40, Math.PI * 1.15);
    k.add(moon, [REX.x + 440, 410, arcZ - 160], [1, 0.95, 0.84], { glow: 1.6, rot: [0, 0, -2.3] });

    // rocks standing out of the water near the way in
    const rocks: [number, number][] = [
      [-150, 250],
      [170, 300],
      [-250, 60],
      [270, 120],
      [-300, -260],
      [320, -300],
    ];
    for (const [cx, cz] of rocks)
      for (let i = 0; i < (props.mobile ? 3 : 6); i++) {
        const x = cx + (r() - 0.5) * 70;
        const z = cz + (r() - 0.5) * 70;
        const h = 14 + r() * r() * 46;
        const g = new THREE.ConeGeometry(4 + h * 0.16, h, 6, 4);
        const p = g.attributes.position;
        for (let q = 0; q < p.count; q++) {
          const t = (p.getY(q) + h / 2) / h;
          p.setX(q, p.getX(q) * (1 + 0.3 * Math.sin(t * 8 + x)) + t * t * (r() - 0.5) * 3);
        }
        g.computeVertexNormals();
        k.add(g, [x, Math.max(groundAt(def, x, z), -2) + h / 2 - 3, z], DARK, { top: [0.2, 0.15, 0.12], flat: true });
      }

    const lights = [new THREE.Vector3(REX.x, 30, bz)];
    return {
      set: k.build(),
      tempera: makeTempera({ amb: 1, key: 0.5, strata: 0.5, rim: [0.3, 0.2, 0.14], rimPow: 3 }),
      globe: new THREE.SphereGeometry(REX.r, 72, 48),
      globeMat: makeGlobeMaterial(),
      bandGeos,
      bandMats: [makeArcBand([0.34, 0.25, 0.2], 0.22), makeArcBand([0.08, 0.06, 0.055], 0.3)],
      comets: ck.build(),
      cometHalos: haloGeometry(cometHalos),
      cometHaloMat: makeHaloMaterial(0),
      arcZ,
      halos,
      glows,
      suns,
      crownY,
      water: makeWater({
        def,
        lights,
        lightCol: [1.0, 0.84, 0.62],
        lightLen: 700,
        deep: [0.03, 0.026, 0.024],
        calm: 0.3,
        shore: REX_PAL.shore,
        // the globe, its ring and the throne stand mirrored in the water
        reflect: /* glsl */ `
          vec4 worldReflect(vec3 P, vec3 r){
            vec3 c = vec3(${REX.x.toFixed(1)}, ${REX.cy.toFixed(1)}, ${REX.z.toFixed(1)});
            vec3 oc = P - c;
            float bq = dot(oc, r);
            float m = 0.0; vec3 col = vec3(0.028, 0.022, 0.02);
            // the ring (taken as a ball a little larger than the globe)
            float R = ${(REX.r + 26).toFixed(1)};
            float h = bq * bq - (dot(oc, oc) - R * R);
            if (h > 0.0 && -bq > 0.0) m = smoothstep(0.0, 300.0, h);
            // the throne: a tall stepped shape standing on the globe's axis
            vec2 ax = c.xz - P.xz;
            float t0 = dot(ax, r.xz) / max(dot(r.xz, r.xz), 1e-4);
            if (t0 > 0.0) {
              float d = length(P.xz + r.xz * t0 - c.xz);
              float y = r.y * t0 - ${(REX.cy + REX.r - 10).toFixed(1)};
              float hw = y < 0.0 ? 0.0 : y < ${TIERS[0][1].toFixed(1)} ? ${TIERS[0][0].toFixed(1)} : y < ${(TIERS[0][1] + TIERS[1][1]).toFixed(1)} ? ${TIERS[1][0].toFixed(1)} : y < ${(TIERS[0][1] + TIERS[1][1] + TIERS[2][1] + 24).toFixed(1)} ? ${TIERS[2][0].toFixed(1)} : 0.0;
              m = max(m, (1.0 - smoothstep(hw - 2.0, hw + 3.0, d)) * step(0.5, hw));
            }
            return vec4(col * (uSkyCol * 1.6 + 0.2), m * 0.9);
          }`,
      }),
    };
  }, [props.mobile]);
  // the comets creep along their arcs
  useFrame(() => {
    if (comets.current) comets.current.rotation.z = Math.sin(SKY_U.uTime.value * 0.02) * 0.22;
  });
  return (
    <>
      <WorldBase id="rex" def={def} pal={REX_PAL} props={props} grass={false} pathTint={[1, 0.86, 0.66]} pathGain={1.5} groundSize={1500} />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[5200, 5200]} />
      </mesh>
      <mesh geometry={b.set} material={b.tempera} />
      <mesh geometry={b.globe} material={b.globeMat} position={[REX.x, REX.cy, REX.z]} />
      {b.bandGeos.map((g, i) => (
        <mesh key={i} geometry={g} material={b.bandMats[i]} position={[REX.x, 0, b.arcZ - 12 - i * 16]} renderOrder={1} />
      ))}
      <group ref={comets} position={[REX.x, 0, b.arcZ]}>
        <mesh geometry={b.comets} material={b.tempera} />
        <mesh geometry={b.cometHalos} material={b.cometHaloMat} renderOrder={6} />
      </group>
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
      <Halos list={b.suns} kind={1} />
    </>
  );
}
