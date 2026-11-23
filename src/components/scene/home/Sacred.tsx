"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { makeHomeTreeMaterial } from "./Forest";
import { FARMSTEAD, MILL, SACRED } from "./journey";
import { GLSL_HOME_AIR, HOME_U, landH, rng, timed } from "./land";
import { K, TB, house, makeTownMaterial } from "./Town";
import { buildTree, makeLeafTexture } from "./trees";

// The sacred hill (alkakalnis) where the old road from the desk ends (journey.ts SACRED). On its crown a great oak,
// Perkūnas's tree, older than anything else in the land; before it the aukuras, an altar of piled fieldstones whose
// fire is never let go out; round them a ring of carved wooden posts (stabai) with suns and crosses on their heads,
// and further out a ring of grey boulders. The fire burns day and night: a soft flame, sparks going up, a thread of
// smoke, and after dusk a warm glow seen from the desk.

type V3 = [number, number, number];
const TOP = { x: SACRED.x, z: SACRED.z, y: landH(SACRED.x, SACRED.z) };
const ALTAR = { x: SACRED.x + 0.5, z: SACRED.z + 10 };
const ALTAR_Y = landH(ALTAR.x, ALTAR.z);
const FIRE: V3 = [ALTAR.x, ALTAR_Y + 1.55, ALTAR.z];

function buildStones() {
  const b = new TB();
  const r = rng(4411);
  const STONE: V3 = [0.33, 0.31, 0.28];
  const WOOD: V3 = [0.22, 0.17, 0.12];
  const DARK: V3 = [0.07, 0.055, 0.045];
  const tone = (c: V3): V3 => [c[0] * (0.8 + r() * 0.3), c[1] * (0.8 + r() * 0.3), c[2] * (0.85 + r() * 0.25)];
  // the aukuras: a low round of piled fieldstones, wider at its foot, a hearth of flat stone on top
  for (let ring = 0; ring < 4; ring++) {
    const rad = 1.7 - ring * 0.28;
    const n = Math.round(rad * 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      b.at(ALTAR.x + Math.cos(a) * rad, ALTAR_Y - 0.25 + ring * 0.38, ALTAR.z + Math.sin(a) * rad, a);
      const s = 0.5 + r() * 0.2;
      b.cyl(0, 0, 0, s * 0.62, s * 0.3, s * 0.75, 6, tone(STONE), K.stone);
    }
  }
  b.at(ALTAR.x, ALTAR_Y, ALTAR.z, 0.3);
  b.cyl(0, 1.25, 0, 1.0, 1.0, 0.18, 10, [0.2, 0.18, 0.16], K.stone);
  // charred logs in the hearth
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.at(ALTAR.x + Math.cos(a) * 0.3, ALTAR_Y + 1.5, ALTAR.z + Math.sin(a) * 0.3, a);
    b.box(0, 0, 0, 0.9, 0.12, 0.14, DARK);
  }
  // the stabai: carved posts in a ring round the oak, each crowned with a rayed sun or a cross of iron
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.35;
    const x = TOP.x + Math.cos(a) * 15;
    const z = TOP.z + Math.sin(a) * 15;
    const h = 3.2 + (i % 3) * 0.6;
    b.at(x, landH(x, z) - 0.4, z, -a + Math.PI / 2);
    b.box(0, h / 2, 0, 0.42, h, 0.42, WOOD, K.boards);
    for (let k = 0; k < 3; k++) b.box(0, 0.9 + k * (h / 3.2), 0, 0.5, 0.14, 0.5, [WOOD[0] * 1.3, WOOD[1] * 1.3, WOOD[2] * 1.3], K.boards);
    b.box(0, h * 0.62, 0.22, 0.24, 0.32, 0.06, [0.14, 0.1, 0.07], K.boards);
    if (i % 2 === 0) {
      b.cyl(0, h + 0.15, 0, 0.36, 0.36, 0.08, 12, [0.55, 0.42, 0.18], K.paint);
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        b.box(Math.cos(t) * 0.5, h + 0.19, Math.sin(t) * 0.5, 0.26, 0.05, 0.06, [0.55, 0.42, 0.18]);
      }
    } else {
      b.box(0, h + 0.35, 0, 0.08, 0.7, 0.08, DARK);
      b.box(0, h + 0.55, 0, 0.6, 0.08, 0.08, DARK);
      b.box(0.24, h + 0.85, 0, 0.08, 0.3, 0.08, DARK);
      b.box(-0.24, h + 0.85, 0, 0.08, 0.3, 0.08, DARK);
    }
  }
  // a ring of grey boulders lower on the hill
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.15;
    const x = TOP.x + Math.cos(a) * 27;
    const z = TOP.z + Math.sin(a) * 27;
    b.at(x, landH(x, z) - 0.35, z, r() * 6);
    const s = 0.9 + r() * 0.7;
    b.cyl(0, 0, 0, s * 0.75, s * 0.32, s * 0.9, 7, tone(STONE), K.stone);
  }
  return b.geometry();
}

// The fire: three crossed sheets of flame turned to the eye about the upright, a halo, sparks going up.
function makeFire() {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const quad = (pts: [number, number][], k: number, sx = 1, sy = 1) => {
    const base = pos.length / 3;
    for (const [x, y] of pts) {
      pos.push(x * sx, y * sy, 0);
      uv.push(x, y, k);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const flame: [number, number][] = [
    [-1, 0],
    [1, 0],
    [1, 1],
    [-1, 1],
  ];
  const sq: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (let k = 0; k < 3; k++) quad(flame, k, 0.85 - k * 0.15, 2.3 - k * 0.4);
  quad(sq, 3);
  for (let i = 0; i < 28; i++) quad(sq, 4 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(...FIRE), 30);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, uAt: { value: new THREE.Vector3(...FIRE) } },
    vertexShader: /* glsl */ `
      attribute vec3 aUv; uniform vec3 uAt; uniform float uTime;
      varying vec3 vUv; varying float vDist; varying float vK;
      void main(){
        vUv = aUv;
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp;
        vK = 1.0;
        if (aUv.z < 2.5) {
          // a sheet of flame: upright, turned to the eye about the vertical, swaying
          vec3 Rh = normalize(vec3(R.x, 0.0, R.z) + 1e-5);
          float sway = sin(uTime * 2.1 + aUv.z * 2.0) * 0.12 * position.y;
          wp = uAt + Rh * (position.x + sway + (aUv.z - 1.0) * 0.12) + vec3(0.0, position.y, 0.0);
        } else if (aUv.z < 3.5) {
          wp = uAt + vec3(0.0, 0.9, 0.0) + (R * position.x + U * position.y) * 4.5;
        } else {
          // a spark: rises, drifts, dims
          float i = aUv.z - 4.0;
          float t = fract(uTime * (0.22 + fract(i * 0.37) * 0.2) + i * 0.137);
          vec3 c = uAt + vec3(sin(i * 3.1 + uTime * 0.7) * 0.8 * t, 0.6 + t * 7.0, cos(i * 2.3 + uTime * 0.6) * 0.8 * t);
          vK = (1.0 - t) * smoothstep(0.0, 0.08, t);
          wp = c + (R * position.x + U * position.y) * 0.05;
        }
        vDist = length(wp - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vUv; varying float vDist; varying float vK;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        float k = vUv.z;
        float dusk = smoothstep(0.1, 0.5, uNight + (1.0 - smoothstep(-0.02, 0.08, uKeyDir.y)));
        vec3 col;
        if (k < 2.5) {
          vec2 p = vUv.xy;
          float n = fbm(vec2(p.x * 2.2 + k * 3.0, p.y * 3.0 - uTime * 2.6));
          float shape = (1.0 - p.y) * (1.0 - smoothstep(0.2, 1.0, abs(p.x) * (1.2 + p.y * 1.4))) + (n - 0.5) * 0.7;
          float f = smoothstep(0.18, 0.55, shape);
          vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.62, 0.18), smoothstep(0.2, 0.6, shape));
          c = mix(c, vec3(1.0, 0.92, 0.7), smoothstep(0.6, 0.95, shape));
          col = c * f * 1.6 * (1.0 - k * 0.2);
        } else if (k < 3.5) {
          float r = length(vUv.xy);
          col = vec3(1.0, 0.5, 0.18) * exp(-r * r * 5.0) * (0.06 + 0.32 * dusk) * (0.9 + 0.1 * sin(uTime * 7.0));
        } else {
          float r = length(vUv.xy);
          col = vec3(1.0, 0.6, 0.25) * (1.0 - smoothstep(0.3, 1.0, r)) * vK * 2.0;
        }
        // (into the air with distance: far off it is a small warm point)
        col *= exp(-vDist * 0.0012);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m };
}

// a thread of smoke going up from the fire, leaning with the wind
function makeSmoke() {
  const N = 14;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute("aPh", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: N }, (_, i) => i / N)), 1));
  g.instanceCount = N;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(FIRE[0], FIRE[1] + 15, FIRE[2]), 40);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U, ...HOME_U, uAt: { value: new THREE.Vector3(...FIRE) } },
    vertexShader: /* glsl */ `
      attribute float aPh; uniform vec3 uAt; uniform float uTime;
      varying vec2 vUv; varying float vA; varying vec3 vWorld;
      void main(){
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float t = fract(uTime * 0.05 + aPh);
        vec3 c = uAt + vec3(-0.864 * t * 14.0 + sin(uTime * 0.3 + aPh * 9.0) * t * 2.0, 2.0 + t * 24.0, -0.503 * t * 14.0);
        float size = 0.7 + t * 5.5;
        vA = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.35, 1.0, t)) * 0.2;
        vUv = position.xy;
        vWorld = c + (R * position.x + U * position.y) * size;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vA; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        float r = length(vUv);
        float a = exp(-r * r * 3.0) * (1.0 - smoothstep(0.75, 1.0, r)) * vA;
        vec3 col = homeAir(vec3(0.7, 0.68, 0.66) * (uSkyCol * 0.9 + uKeyCol * 0.4), vWorld);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { g, m };
}

export function Sacred({ mobile }: { mobile: boolean }) {
  const s = useMemo(
    () =>
      timed("sacred", () => {
        // the oak: the home world's own broad tree, as old and as wide as three of them
        const oakMat = makeHomeTreeMaterial(makeLeafTexture());
        const oak = new THREE.InstancedMesh(buildTree("broad", 0, mobile ? 0 : 1), oakMat, 1);
        const o = new THREE.Object3D();
        o.position.set(TOP.x, TOP.y - 0.3, TOP.z);
        o.rotation.set(0, 0.7, 0);
        o.scale.set(3.3, 2.7, 3.3);
        o.updateMatrix();
        oak.setMatrixAt(0, o.matrix);
        oak.setColorAt(0, new THREE.Color(0.82, 0.92, 0.86));
        oak.instanceMatrix.needsUpdate = true;
        if (oak.instanceColor) oak.instanceColor.needsUpdate = true;
        oak.computeBoundingSphere();
        return { stones: buildStones(), mat: makeTownMaterial(), oak, oakMat, fire: makeFire(), smoke: makeSmoke() };
      }),
    [mobile],
  );
  useEffect(
    () => () => {
      for (const x of [s.stones, s.mat, s.oakMat, s.fire.g, s.fire.m, s.smoke.g, s.smoke.m]) x.dispose();
      s.oak.dispose();
    },
    [s],
  );
  // (the town material's lamps kindle by the plane's progress; nothing here needs it)
  useFrame(() => {
    s.mat.uniforms.uFront.value = -1e4;
  });
  return (
    <>
      <mesh geometry={s.stones} material={s.mat} />
      <primitive object={s.oak} />
      <mesh geometry={s.fire.g} material={s.fire.m} renderOrder={6} />
      <mesh geometry={s.smoke.g} material={s.smoke.m} renderOrder={5} />
    </>
  );
}

// ---------- on the sea behind the desk: a few small sailing boats going slowly along the coast, rocking ----------
const SAILS = [
  { x: -260, off: 150, speed: 1.6, sail: [0.86, 0.82, 0.72] as V3 },
  { x: 40, off: 230, speed: -1.1, sail: [0.7, 0.36, 0.2] as V3 },
  { x: 300, off: 120, speed: 1.2, sail: [0.86, 0.82, 0.72] as V3 },
  { x: -90, off: 85, speed: 0.8, sail: [0.86, 0.82, 0.72] as V3 },
  { x: 180, off: 70, speed: -0.7, sail: [0.55, 0.2, 0.12] as V3 },
];
function buildBoat(sail: V3) {
  const b = new TB();
  b.at(0, 0, 0, 0);
  const L = 7;
  const W = 1.3;
  const N = 10;
  const wAt = (u: number) => W * Math.pow(Math.sin(Math.PI * (0.04 + u * 0.92)), 0.55);
  for (let i = 0; i < N; i++) {
    const u0 = i / N;
    const u1 = (i + 1) / N;
    const zA = (u0 - 0.5) * L;
    const zB = (u1 - 0.5) * L;
    for (const s of [-1, 1]) b.quad([s * wAt(u0), 0.9, zA], [s * wAt(u1), 0.9, zB], [s * wAt(u1) * 0.45, -0.5, zB], [s * wAt(u0) * 0.45, -0.5, zA], [0.2, 0.15, 0.1], [K.boards, 0, 0, 0]);
    b.quad([-wAt(u0) * 0.9, 0.7, zA], [wAt(u0) * 0.9, 0.7, zA], [wAt(u1) * 0.9, 0.7, zB], [-wAt(u1) * 0.9, 0.7, zB], [0.36, 0.28, 0.19], [K.boards, 0, 0, 0]);
  }
  b.box(0, 4.6, -0.6, 0.12, 8, 0.12, [0.25, 0.19, 0.13], K.boards);
  b.tri([0, 8.4, -0.55], [0, 1.4, -0.55], [0, 1.6, 3.2], sail, [K.paint, 0, 0, 0], [[0, 7], [0, 0], [3.8, 0.2]]);
  b.tri([0, 7.2, -0.7], [0, 1.6, -3.4], [0, 1.4, -0.7], sail, [K.paint, 0, 0, 0], [[0, 5.6], [2.7, 0], [0, 0]]);
  return b.geometry();
}
export function SeaBoats() {
  const s = useMemo(() => ({ geos: SAILS.map((b) => buildBoat(b.sail)), mat: makeTownMaterial() }), []);
  useEffect(
    () => () => {
      s.geos.forEach((g) => g.dispose());
      s.mat.dispose();
    },
    [s],
  );
  const refs = useMemo(() => SAILS.map(() => ({ current: null as THREE.Mesh | null })), []);
  useFrame(() => {
    const t = SKY_U.uTime.value;
    s.mat.uniforms.uFront.value = -1e4;
    SAILS.forEach((b, i) => {
      const m = refs[i].current;
      if (!m) return;
      // along the coast and back, slowly (a long sine: they turn far off where nobody sees them)
      const x = b.x + Math.sin(t * 0.004 * b.speed + i) * 260;
      const vx = Math.cos(t * 0.004 * b.speed + i) * b.speed;
      const z = 150 - 0.0001 * x * x + 24 * Math.sin(x * 0.0041 + 0.9) + 8 * Math.sin(x * 0.0127 + 2.0) + b.off;
      m.position.set(x, -9 + Math.sin(t * 0.9 + i) * 0.15, z);
      m.rotation.set(Math.sin(t * 0.7 + i) * 0.05, vx > 0 ? -Math.PI / 2 : Math.PI / 2, Math.sin(t * 0.55 + i * 2) * 0.07);
    });
  });
  return (
    <>
      {s.geos.map((g, i) => (
        <mesh key={i} ref={(m) => void (refs[i].current = m)} geometry={g} material={s.mat} />
      ))}
    </>
  );
}

// ---------- the farmstead (sodyba) among the fields, and the post windmill on its rise ----------
function buildFarm() {
  const b = new TB();
  const r = rng(707);
  const F = FARMSTEAD;
  // (the houses' window frames and door lamps go to a builder of their own: the town's are not to be written into)
  const det = new TB();
  const lamps: number[][] = [];
  const WOOD: V3 = [0.22, 0.17, 0.12];
  const THATCH: V3 = [0.3, 0.25, 0.14];
  // the dwelling house, the barn across the yard, the granary (klėtis) raised on stones with its porch
  house(b, F.x, F.z, 0.3, 11, 7, 3.0, { roof: "thatch", wall: "logs", accent: 0, porch: true, chimney: true, horses: true }, det, lamps);
  house(b, F.x + 4, F.z - 22, 0.3 + Math.PI, 16, 9, 4.2, { roof: "thatch", wall: "grey", accent: 1, porch: false, chimney: false, horses: false }, det, lamps);
  house(b, F.x - 16, F.z - 9, 0.3 + Math.PI / 2, 6, 5, 2.6, { roof: "shingle", wall: "logs", accent: 2, porch: true, chimney: false, horses: true }, det, lamps);
  // the well with its sweep
  const wx = F.x + 9;
  const wz = F.z - 10;
  const wy = landH(wx, wz) - 0.2;
  b.at(wx, wy, wz, 0.8);
  b.cyl(0, 0, 0, 0.8, 0.8, 0.95, 10, [0.32, 0.3, 0.27], K.stone);
  b.box(2.1, 2.1, 0, 0.2, 4.2, 0.2, WOOD, K.boards);
  b.quad([2.0, 4.1, 0.05], [-3.4, 6.4, 0.05], [-3.4, 6.3, -0.05], [2.0, 4.0, -0.05], WOOD, [K.boards, 0, 0, 0]);
  b.box(0.15, 2.8, 0, 0.04, 3.2, 0.04, [0.07, 0.055, 0.045]);
  // a picket fence round the yard and a stork's nest on a tall pole by the barn
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push([F.x - 3 + Math.cos(a) * 27, F.z - 10 + Math.sin(a) * 21]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    if (i === 9 || i === 10) continue; // the gate
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    b.at(mx, landH(mx, mz) - 0.1, mz, Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2);
    b.box(0, 0.55, 0, len, 0.1, 0.06, [0.3, 0.24, 0.17], K.boards);
    b.box(0, 0.95, 0, len, 0.1, 0.06, [0.3, 0.24, 0.17], K.boards);
    for (let k = 0; k < 4; k++) b.box(-len / 2 + (k + 0.5) * (len / 4), 0.6, 0.04, 0.09, 1.2, 0.04, [0.34, 0.27, 0.19], K.boards);
  }
  const px = F.x + 16;
  const pz = F.z - 24;
  b.at(px, landH(px, pz) - 0.3, pz, 0);
  b.cyl(0, 0, 0, 0.14, 0.1, 10, 6, WOOD, K.boards);
  b.cyl(0, 9.8, 0, 0.75, 0.95, 0.5, 9, [0.24, 0.19, 0.12], K.thatch);
  b.box(0, 10.6, 0, 0.32, 0.3, 0.62, [0.85, 0.84, 0.8]);
  b.box(0, 10.72, -0.05, 0.36, 0.14, 0.6, [0.07, 0.055, 0.045]);
  b.box(0, 11.0, 0.3, 0.09, 0.5, 0.09, [0.85, 0.84, 0.8]);
  b.box(0, 11.2, 0.55, 0.04, 0.04, 0.32, [0.7, 0.18, 0.08]);
  // haystacks (kūgiai) out in the meadow, each round a pole
  for (let i = 0; i < 7; i++) {
    const hx = F.x + 40 + r() * 70;
    const hz = F.z + 10 - r() * 60;
    b.at(hx, landH(hx, hz) - 0.2, hz, r() * 6);
    b.cyl(0, 0, 0, 2.1, 0.3, 4.2, 12, THATCH, K.thatch);
    b.box(0, 4.6, 0, 0.08, 1.2, 0.08, WOOD, K.boards);
  }
  // the post windmill: a timber body on a trestle, a gabled roof; its sails turn (Farm below)
  const my = landH(MILL.x, MILL.z);
  b.at(MILL.x, my - 0.3, MILL.z, 0.9);
  for (const [x, z] of [
    [-2.2, -2.2],
    [2.2, -2.2],
    [2.2, 2.2],
    [-2.2, 2.2],
  ])
    b.cyl(x * 0.4, 0, z * 0.4, 0.22, 0.18, 3.2, 6, WOOD, K.boards);
  for (const [x, z] of [
    [-2.4, 0],
    [2.4, 0],
    [0, -2.4],
    [0, 2.4],
  ])
    b.box(x / 2, 0.4, z / 2, Math.abs(x) + 0.3, 0.3, Math.abs(z) + 0.3, [0.32, 0.3, 0.27], K.stone);
  b.cyl(0, 0, 0, 0.35, 0.32, 4.5, 8, WOOD, K.boards);
  b.wall(-2.6, 3.2, 2.6, 3.2, 3.8, 11, [0.3, 0.24, 0.17], K.boards, 9, 1);
  b.wall(2.6, -3.2, -2.6, -3.2, 3.8, 11, [0.3, 0.24, 0.17], K.boards, 0);
  b.wall(2.6, 3.2, 2.6, -3.2, 3.8, 11, [0.3, 0.24, 0.17], K.boards, 0);
  b.wall(-2.6, -3.2, -2.6, 3.2, 3.8, 11, [0.3, 0.24, 0.17], K.boards, 0);
  b.quad([-3.0, 11, 3.5], [0, 13.6, 3.5], [0, 13.6, -3.5], [-3.0, 11, -3.5], [0.2, 0.18, 0.16], [K.shingle, 0, 0, 0]);
  b.quad([0, 13.6, 3.5], [3.0, 11, 3.5], [3.0, 11, -3.5], [0, 13.6, -3.5], [0.2, 0.18, 0.16], [K.shingle, 0, 0, 0]);
  b.tri([-2.6, 11, 3.2], [2.6, 11, 3.2], [0, 13.4, 3.2], [0.3, 0.24, 0.17], [K.boards, 0, 0, 0], [[0, 0], [5.2, 0], [2.6, 2.4]]);
  b.tri([2.6, 11, -3.2], [-2.6, 11, -3.2], [0, 13.4, -3.2], [0.3, 0.24, 0.17], [K.boards, 0, 0, 0], [[0, 0], [5.2, 0], [2.6, 2.4]]);
  // a ladder and a tail pole down to the ground
  b.quad([-0.6, 0, -9], [0.6, 0, -9], [0.6, 4.2, -3.2], [-0.6, 4.2, -3.2], WOOD, [K.boards, 0, 0, 0]);
  return b.geometry();
}
// the sails: four lattice arms on a shaft, turned about the mill's own axis
function buildSails() {
  const b = new TB();
  b.at(0, 0, 0, 0);
  const W: V3 = [0.78, 0.74, 0.66];
  const WOOD: V3 = [0.24, 0.18, 0.12];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const P = (u: number, v: number): V3 => [c * u - s * v, s * u + c * v, 0];
    b.quad(P(0, -0.12), P(9.5, -0.12), P(9.5, 0.12), P(0, 0.12), WOOD, [K.boards, 0, 0, 0]);
    // the sail cloth over the lattice, on one side of the arm
    b.quad(P(1.6, 0.15), P(9.2, 0.15), P(9.2, 1.7), P(1.6, 1.5), W, [K.paint, 0, 0, 0]);
    for (let i = 0; i < 6; i++) b.quad(P(1.6 + i * 1.5, 0.12), P(1.7 + i * 1.5, 0.12), P(1.7 + i * 1.5, 1.75), P(1.6 + i * 1.5, 1.75), WOOD, [K.boards, 0, 0, 0]);
  }
  b.cyl(0, -0.3, 0, 0.35, 0.35, 0.6, 8, WOOD, K.boards);
  return b.geometry();
}
export function Farm() {
  const s = useMemo(() => timed("farm", () => ({ farm: buildFarm(), sails: buildSails(), mat: makeTownMaterial() })), []);
  useEffect(
    () => () => {
      for (const x of [s.farm, s.sails, s.mat]) x.dispose();
    },
    [s],
  );
  const sails = useMemo(() => ({ current: null as THREE.Mesh | null }), []);
  useFrame((_, dt) => {
    s.mat.uniforms.uFront.value = -1e4;
    if (sails.current) sails.current.rotation.z -= Math.min(dt, 0.1) * 0.35;
  });
  const my = landH(MILL.x, MILL.z);
  return (
    <>
      <mesh geometry={s.farm} material={s.mat} />
      <group position={[MILL.x, my + 10.2, MILL.z]} rotation={[0, 0.9, 0]}>
        <group position={[0, 0, 3.7]}>
          <mesh ref={(m) => void (sails.current = m)} geometry={s.sails} material={s.mat} />
        </group>
      </group>
    </>
  );
}
