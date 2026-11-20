"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { useDisposable } from "../common";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_AIR, WORLD_U, rng, type V3 } from "../kit";
import { voyage, type WorldId } from "../voyage";

// What the Fairy Tale, Paradise and the Offering share: a lens that can tell near
// from far a mile off, woods of small round trees, cypresses, sculpted cloud,
// walls of dressed stone, and small lights that walk.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
const v3 = (c: V3) => `vec3(${c.map((x) => x.toFixed(4)).join(", ")})`;

// ---------- the lens ----------
// The desk's camera starts focusing a centimetre from the glass, which leaves a depth buffer that cannot tell two
// surfaces apart at a kilometre unless they are metres from each other: far walls, steps and shores shimmer. While
// one of these worlds is being flown the near plane stands at arm's length instead (forty times the precision), and
// goes back the moment the plane leaves.
const DESK_NEAR = 0.01;
export function useDeepLens(id: WorldId, near = 0.4) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useFrame(() => {
    if (voyage.cur !== id) return;
    const want = voyage.flying ? near : DESK_NEAR;
    if (camera.near !== want) {
      camera.near = want;
      camera.updateProjectionMatrix();
    }
  });
  useEffect(
    () => () => {
      if (camera.near !== DESK_NEAR) {
        camera.near = DESK_NEAR;
        camera.updateProjectionMatrix();
      }
    },
    [camera],
  );
}

// ---------- woods ----------
// A wood as he and the film after him drew it: thousands of small round crowns, each a soft ball lit gold-green
// from the sun's side and blue-green beneath, laid so thick that the ground is not seen. One draw call.
export type Crown = { p: V3; r: number; h?: number; seed?: number };
function crownGeometry(seg: number, rings: number) {
  const g = new THREE.SphereGeometry(1, seg, rings, 0, Math.PI * 2, 0, Math.PI * 0.68);
  g.translate(0, 0.42, 0);
  g.deleteAttribute("uv");
  return g;
}
export type Wood = { a: V3; b: V3; shade: V3; wind?: number; gold?: number };
export function makeCrownMaterial(o: Wood) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, uWind: { value: o.wind ?? 1 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime; uniform float uWind;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vObj; varying float vSeed;
      void main(){
        vec3 p = position;
        // no two crowns the same ball: broad lumps pushed out and in
        float l = sin(p.x * 3.1 + aSeed * 40.0) * sin(p.z * 2.7 + aSeed * 17.0) * 0.13 + sin(p.y * 4.3 + aSeed * 9.0) * 0.06;
        p *= 1.0 + l;
        vec4 ip = instanceMatrix * vec4(p, 1.0);
        // the wind goes over the wood in slow waves
        float sway = sin(uTime * 0.7 + ip.x * 0.045 + ip.z * 0.037 + aSeed * 6.0) * position.y * 0.035 * uWind;
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        ip.x += sway * sc.x; ip.z += sway * 0.6 * sc.x;
        vec4 wp = modelMatrix * ip;
        vWorld = wp.xyz; vObj = position; vSeed = aSeed;
        vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * (normal / (sc * sc))));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec3 vObj; varying float vSeed;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float d = length(cameraPosition - vWorld);
        float near = 1.0 - smoothstep(160.0, 800.0, d);
        // the painter's dabs: clumps of leaf, broad close to and gone far off (so they never swim)
        vec3 q = vObj * 2.6 + vSeed * 31.0;
        float dab = vnoise(q.xz * 1.2 + q.y * 0.9) * 0.6 + vnoise(q.xy * 2.7 - q.z * 2.1) * 0.4;
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float sun = dot(n, uKeyDir) + (dab - 0.5) * 0.8 * near;
        float lit = smoothstep(-0.2, 0.7, sun) * sunUp;
        float up = n.y * 0.5 + 0.5;
        // each tree its own green: most of them the wood's two greens, some gone to gold, some dark and blue
        float k = fract(vSeed * 7.31);
        float k2 = fract(vSeed * 23.17);
        vec3 a = ${v3(o.a)}; vec3 b = ${v3(o.b)}; vec3 sh = ${v3(o.shade)};
        vec3 mid = mix(a, b, k);
        mid = mix(mid, mid * vec3(1.9, 1.35, 0.5), smoothstep(0.84, 0.97, k2) * ${(o.gold ?? 1).toFixed(2)});
        mid = mix(mid, mid * vec3(0.5, 0.74, 1.0), smoothstep(0.24, 0.06, k2) * 0.8);
        vec3 alb = mix(sh, mid, smoothstep(0.2, 0.85, up + (dab - 0.5) * 0.4 * near));
        // shade is the sky's own violet-blue; lit paint is warmer and yellower, as he laid it: gold over green
        vec3 col = alb * uSkyCol * (0.34 + 0.5 * up);
        col += mix(mid, mid * vec3(2.1, 1.55, 0.5) + vec3(0.06, 0.04, 0.0), 0.7) * uKeyCol * lit * 0.5;
        // light coming through the thin edge of a crown that stands against the sun
        float back = pow(max(dot(-V, uKeyDir), 0.0), 2.0) * pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 1.4);
        col += mid * vec3(2.4, 1.8, 0.5) * uKeyCol * back * 0.42 * sunUp;
        // the foot of every crown stands in the shade of its neighbours
        col *= mix(0.36, 1.0, smoothstep(-0.05, 0.6, vObj.y));
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}
export function crownMesh(list: Crown[], mat: THREE.Material, fine = false) {
  const g = fine ? crownGeometry(8, 4) : crownGeometry(6, 2);
  const im = new THREE.InstancedMesh(g, mat, list.length);
  const seeds = new Float32Array(list.length);
  const o = new THREE.Object3D();
  list.forEach((c, i) => {
    const s = c.seed ?? (i * 0.6180339) % 1;
    seeds[i] = s;
    o.position.set(...c.p);
    o.scale.set(c.r * (0.92 + 0.16 * ((s * 13.7) % 1)), c.r * (c.h ?? 1), c.r * (0.92 + 0.16 * ((s * 29.3) % 1)));
    o.rotation.set(0, s * 6.283, 0);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// Cypresses: tall dark flames standing alone in the fields and by the towers.
export function cypressMesh(list: Crown[], mat: THREE.Material) {
  const g = new THREE.ConeGeometry(1, 1, 7, 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  // a flame, not a cone: fullest a third of the way up
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i);
    const w = Math.sin(Math.min(1, t * 1.25 + 0.12) * Math.PI) * 0.9 + 0.12;
    const r0 = Math.max(1e-4, 1 - t);
    p.setXYZ(i, (p.getX(i) / r0) * w * (t >= 1 ? 0 : 1), t, (p.getZ(i) / r0) * w * (t >= 1 ? 0 : 1));
  }
  g.computeVertexNormals();
  g.deleteAttribute("uv");
  const im = new THREE.InstancedMesh(g, mat, list.length);
  const seeds = new Float32Array(list.length);
  const o = new THREE.Object3D();
  list.forEach((c, i) => {
    const s = c.seed ?? (i * 0.6180339) % 1;
    seeds[i] = s;
    o.position.set(...c.p);
    o.scale.set(c.r, c.r * (c.h ?? 6), c.r);
    o.rotation.set(0, s * 6.283, 0);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// ---------- sculpted cloud ----------
// Clouds as the film sculpts them out of his rows of painted ones: each a heap of round lobes on a flat base,
// gold where the sun finds it, lavender in its own shade, with a line of light along every edge that stands
// against the sun. Receding in ranks to the horizon, where the air takes them.
export type Heap = { p: V3; w: number; seed: number; tall?: number };
export function heapBlobs(list: Heap[], seed = 7) {
  const r = rng(seed);
  const out: { p: V3; s: V3; seed: number }[] = [];
  for (const c of list) {
    const q = rng(Math.floor(c.seed * 9973) + 11);
    const n = 4 + Math.floor(q() * 4);
    const tall = c.tall ?? 1;
    for (let i = 0; i < n; i++) {
      // a long low heap: the biggest lobes in the middle, small ones out at the ends
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      const big = 1 - 0.55 * Math.abs(u) + (q() - 0.5) * 0.25;
      const w = c.w * 0.42 * big;
      out.push({
        p: [c.p[0] + u * c.w * 0.62 + (q() - 0.5) * c.w * 0.12, c.p[1] + w * 0.28 * tall + (q() - 0.5) * w * 0.2, c.p[2] + (q() - 0.5) * c.w * 0.5],
        s: [w * (1.05 + q() * 0.3), w * (0.7 + q() * 0.25) * tall, w * (0.9 + q() * 0.3)],
        seed: r() * 10,
      });
    }
    // and a small one riding on top
    if (q() < 0.7) {
      const w = c.w * 0.26;
      out.push({ p: [c.p[0] + (q() - 0.5) * c.w * 0.4, c.p[1] + c.w * 0.3 * tall, c.p[2] + (q() - 0.5) * c.w * 0.2], s: [w * 1.2, w * tall, w], seed: r() * 10 });
    }
  }
  return out;
}
// one lobe: a round lump, fuller above than below, its swellings shaded as swellings
function lobeGeometry(detail: number) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute("uv").deleteAttribute("normal"));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const lump = 1 + 0.16 * Math.sin(v.x * 3.3 + 1) * Math.sin(v.z * 2.9 + 2) + 0.1 * Math.sin(v.x * 6.1 + v.y * 5.3) * Math.sin(v.z * 5.7 - v.y * 2.0) + 0.05 * Math.sin(v.y * 9 + v.x * 7);
    const y = v.y * (0.76 + 0.24 * Math.tanh(v.y * 2.4));
    p.setXYZ(i, v.x * lump, y * lump, v.z * lump);
  }
  g.computeVertexNormals();
  return g;
}
export function makeHeapMaterial(o: { lit?: V3; shade?: V3; rim?: number; drift?: number } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, uLitK: { value: new THREE.Color(...(o.lit ?? [1, 1, 1])) }, uShadeK: { value: new THREE.Color(...(o.shade ?? [1, 1, 1])) }, uRimK: { value: o.rim ?? 1 }, uDrift: { value: o.drift ?? 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec3 vObj; varying float vSeed;
      uniform float uTime; uniform float uDrift;
      void main(){
        vec4 lp = instanceMatrix * vec4(position, 1.0);
        float ph = instanceMatrix[3].x * 0.011 + instanceMatrix[3].z * 0.007;
        // cloud is never quite still: the whole sky drifts a little, each heap breathing in its place
        lp.xyz += vec3(sin(uTime * 0.05 + ph) * 6.0 + uTime * 0.6, sin(uTime * 0.07 + ph * 1.7) * 1.5, cos(uTime * 0.045 + ph * 1.3) * 4.0) * uDrift;
        vec4 wp = modelMatrix * lp;
        vWorld = wp.xyz; vObj = position; vSeed = fract(ph * 3.7);
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vN = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * (normal / (sc * sc))));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLitK; uniform vec3 uShadeK; uniform float uRimK;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vObj; varying float vSeed;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 dv = vWorld - cameraPosition;
        float dist = length(dv);
        vec3 V = -dv / dist;
        float near = 1.0 - smoothstep(500.0, 1800.0, dist);
        // soft dabs of pastel laid along the lobe
        float dab = vnoise(vObj.xz * 2.3 + vObj.y * 1.7 + vSeed * 20.0) * 0.6 + vnoise(vObj.xy * 5.1 + vSeed * 9.0) * 0.4;
        float sun = dot(n, uSunDir);
        float w = smoothstep(-0.7, 0.8, sun * 0.6 + n.y * 0.55 + (dab - 0.5) * 0.4 * near);
        vec3 lit = uCloudLit * uLitK;
        vec3 shade = uCloudShade * uShadeK;
        vec3 col = mix(shade, lit, w);
        // the belly: cooler and deeper, but never hard
        col = mix(col, shade * vec3(0.8, 0.84, 1.0), smoothstep(0.3, -0.9, n.y) * 0.5);
        float ndv = max(dot(n, V), 0.0);
        float edge = pow(clamp(1.0 - ndv, 0.0, 1.0), 1.8);
        vec3 dir = dv / dist;
        // cloud between the eye and the sun is lit through: gold all over, brightest in its thin edges
        float through = pow(max(dot(dir, uSunDir), 0.0), 2.5);
        col += lit * through * (0.3 + 0.9 * edge) * uRimK;
        col += uGlow * edge * (0.1 + 0.9 * pow(through, 2.0)) * uRimK;
        // far off they go into the air's own colour, ranks of them, paler and paler
        col = mix(col, airCol(dir) + uGlow * pow(max(dot(dir, uSunDir), 0.0), 8.0) * 0.25, clamp(airAmt(vWorld) * 0.9 + smoothstep(1500.0, 2900.0, dist) * 0.5, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}
export function heapMesh(blobs: { p: V3; s: V3; seed: number }[], mat: THREE.Material, detail = 2) {
  const im = new THREE.InstancedMesh(lobeGeometry(detail), mat, blobs.length);
  const o = new THREE.Object3D();
  blobs.forEach((c, i) => {
    o.position.set(...c.p);
    o.scale.set(...c.s);
    o.rotation.set(0, c.seed * 2.4, 0);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.frustumCulled = false;
  return im;
}

// ---------- dressed stone ----------
// A wall with its arcade drawn in the stone itself (nothing laid over it, so nothing can shimmer): a row of tall
// pointed niches, deep blue inside with a breath of teal at the foot, a pale moulding round each, a coping along
// the top, and close to, the courses of the masonry.
//   aUv  x: metres along the wall, y: 0 at its foot .. 1 at its top
//   aH   the wall's height there, metres
export function makeMasonry(o: { bay?: number; niche?: V3; foot?: V3; mould?: V3; amb?: number; key?: number; rim?: V3 } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, uBay: { value: o.bay ?? 26 }, uAmbK: { value: o.amb ?? 0.8 }, uKeyK: { value: o.key ?? 0.5 }, uRim: { value: new THREE.Color(...(o.rim ?? [0.5, 0.3, 0.16])) } },
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute vec2 aUv; attribute float aH;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec2 vUv; varying float vH;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol; vUv = aUv; vH = aH;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uBay; uniform float uAmbK; uniform float uKeyK; uniform vec3 uRim;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec2 vUv; varying float vH;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        float dEye = length(cameraPosition - vWorld);
        float y = vUv.y * vH;
        float fx = (fract(vUv.x / uBay) - 0.5) * uBay;
        float bayId = floor(vUv.x / uBay);
        // a tall pointed niche: straight jambs, then two arcs struck from the opposite springing
        float aw = uBay * 0.3;
        float top = vH * 0.8;
        float spring = top - aw * 1.732;
        float d = y < spring ? abs(fx) - aw : length(vec2(abs(fx) + aw, y - spring)) - 2.0 * aw;
        d = max(d, 1.6 - y);
        float aa = max(fwidth(d), 0.02);
        float tall = smoothstep(9.0, 22.0, vH);
        float inside = (1.0 - smoothstep(-aa, aa, d)) * tall;
        float mould = (1.0 - smoothstep(0.5, 0.5 + aa * 1.5, abs(d - 0.7))) * tall;
        float dab = vnoise(vec2(vUv.x * 0.21, y * 0.33)) * 0.6 + vnoise(vec2(vUv.x * 0.9 + 3.0, y * 1.1)) * 0.4;
        vec3 alb = vCol.rgb * (1.0 + (dab - 0.5) * 0.4);
        // courses of stone, close to
        float nearK = 1.0 - smoothstep(60.0, 260.0, dEye);
        float course = fract(y / 1.7);
        float joint = (1.0 - smoothstep(0.0, 0.08, course)) + (1.0 - smoothstep(0.0, 0.035, abs(fract(vUv.x / 3.4 + floor(y / 1.7) * 0.5) - 0.5))) * 0.7;
        alb *= 1.0 - 0.2 * clamp(joint, 0.0, 1.0) * nearK * (1.0 - inside);
        alb *= 0.9 + 0.2 * hash12(vec2(floor(vUv.x / 3.4 + floor(y / 1.7) * 0.5), floor(y / 1.7))) * nearK + 0.1 * (1.0 - nearK);
        // the niche: deep, cool, a little teal coming up from its floor; here and there one holds a lamp
        vec3 niche = mix(${v3(o.foot ?? [0.07, 0.2, 0.24])}, ${v3(o.niche ?? [0.05, 0.04, 0.12])}, smoothstep(0.0, 0.45, (y - 1.6) / max(top, 1.0)));
        alb = mix(alb, niche, inside * 0.86);
        alb = mix(alb, ${v3(o.mould ?? [0.62, 0.42, 0.4])}, mould * 0.7 * (1.0 - inside));
        // the coping: a paler band along the top, and its shadow line beneath
        float cope = smoothstep(vH - 2.6, vH - 2.2, y);
        alb = mix(alb, vCol.rgb * 1.5 + vec3(0.08, 0.04, 0.02), cope * 0.8);
        alb *= 1.0 - 0.35 * smoothstep(vH - 4.4, vH - 2.7, y) * (1.0 - cope);
        // the foot of the wall stands in its own shade
        float ao = mix(0.6, 1.0, smoothstep(0.0, 14.0, y));
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float lit = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0) * sunUp;
        vec3 col = alb * (uSkyCol * (0.68 + 0.32 * n.y) * uAmbK * ao + uKeyCol * lit * uKeyK * (1.0 - inside * 0.7));
        col += uRim * pow(clamp(1.0 - abs(dot(n, V)), 0.0, 1.0), 3.0) * (1.0 - inside);
        col = applyAir(col, vWorld);
        // a lamp in one niche in seven
        float lamp = step(0.86, hash12(vec2(bayId, 3.0))) * inside * exp(-(fx * fx) / (aw * aw * 0.3)) * exp(-(y - 5.0) * (y - 5.0) / 16.0);
        col += vec3(1.0, 0.7, 0.34) * lamp * 1.6 * glowK() * (1.0 - 0.6 * airAmt(vWorld));
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- lofted surfaces ----------
// Strips of surface laid between successive cross-sections; each strip shades as one smooth sheet. A point may
// carry the wall's own coordinates (u: metres along, v: 0..1 up, h: height) for the masonry.
export type Pt = { p: THREE.Vector3; c: V3; g?: number; u?: number; v?: number; h?: number };
export function loft(rings: Pt[][], masonry = false) {
  const m = rings[0].length;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const hh: number[] = [];
  const idx: number[] = [];
  rings.forEach((ring, i) => {
    for (const q of ring) {
      pos.push(q.p.x, q.p.y, q.p.z);
      col.push(q.c[0], q.c[1], q.c[2], q.g ?? 0);
      if (masonry) {
        uv.push(q.u ?? 0, q.v ?? 0);
        hh.push(q.h ?? 1);
      }
    }
    if (i < rings.length - 1) for (let j = 0; j < m - 1; j++) idx.push(i * m + j, i * m + j + 1, (i + 1) * m + j, i * m + j + 1, (i + 1) * m + j + 1, (i + 1) * m + j);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  if (masonry) {
    g.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("aH", new THREE.Float32BufferAttribute(hh, 1));
  }
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- small lights that walk ----------
// A procession seen from far off: one small warm light to each walker, moving along a line of points (a road)
// at walking pace, each bobbing a little. Positions are worked out in the shader from the road's own points,
// held in a small texture.
export function Walkers({ road, n, speed = 1.4, size = 1, col = [1, 0.8, 0.45], seed = 3, lift = 1.6 }: { road: THREE.Vector3[]; n: number; speed?: number; size?: number; col?: V3; seed?: number; lift?: number }) {
  const b = useDisposable(() => {
    const N = road.length;
    const data = new Float32Array(N * 4);
    let len = 0;
    road.forEach((p, i) => {
      if (i > 0) len += p.distanceTo(road[i - 1]);
      data.set([p.x, p.y, p.z, len], i * 4);
    });
    const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    const r = rng(seed);
    const pos = new Float32Array(n * 3);
    const ph = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      // in small companies, with gaps between them
      const company = Math.floor(r() * (n / 5));
      ph.set([(company / (n / 5) + (r() - 0.5) * 0.012 + 1) % 1, r()], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aPh", new THREE.BufferAttribute(ph, 2));
    const box = new THREE.Box3().setFromPoints(road);
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, ...WORLD_U, uRoad: { value: tex }, uN: { value: N }, uLen: { value: len }, uSpeed: { value: speed }, uSize: { value: size }, uCol: { value: new THREE.Color(...col) }, uLift: { value: lift } },
      vertexShader: /* glsl */ `
        attribute vec2 aPh;
        uniform sampler2D uRoad; uniform float uN; uniform float uLen; uniform float uSpeed; uniform float uSize; uniform float uTime; uniform float uLift;
        varying float vTw; varying vec3 vWorld;
        void main(){
          float s = fract(aPh.x + uTime * uSpeed / uLen);
          float f = s * (uN - 1.0); float i0 = floor(f);
          vec3 r0 = texture2D(uRoad, vec2((i0 + 0.5) / uN, 0.5)).xyz;
          vec3 r1 = texture2D(uRoad, vec2((min(i0 + 1.0, uN - 1.0) + 0.5) / uN, 0.5)).xyz;
          vec3 p = mix(r0, r1, f - i0) + vec3((aPh.y - 0.5) * 3.0, uLift + sin(uTime * 2.2 + aPh.y * 40.0) * 0.12, (fract(aPh.y * 7.0) - 0.5) * 3.0);
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vTw = 0.75 + 0.25 * sin(uTime * (1.4 + aPh.y * 2.0) + aPh.y * 50.0);
          // the two ends of the road: they come out of the dark and go into it
          vTw *= smoothstep(0.0, 0.02, s) * smoothstep(1.0, 0.98, s);
          gl_PointSize = clamp(uSize * 620.0 / -mv.z, 1.5, 22.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol;
        varying float vTw; varying vec3 vWorld;
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a = (exp(-dot(c, c) * 60.0) * 1.6 + exp(-dot(c, c) * 14.0) * 0.5) * vTw * (1.0 - airAmt(vWorld) * 0.75);
          gl_FragColor = vec4(uCol * a, 1.0);
          ${END}
        }`,
    });
    return { g, mat, tex };
  }, [road, n, speed, size, seed]);
  return <points geometry={b.g} material={b.mat} renderOrder={6} />;
}

// ---------- the sun ----------
// As he painted it: a small pale disc in a wide fan of fine rays, each ray a row of small dabs. It hangs at the
// sky's distance in the sky's own sun direction; cloud that passes before it hides it.
export function RayedSun({ size = 0.62, gain = 1 }: { size?: number; gain?: number }) {
  const b = useDisposable(() => {
    const g = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, uSize: { value: size }, uGain: { value: gain } },
      vertexShader: /* glsl */ `
        uniform vec3 uSunDir; uniform float uSize;
        varying vec2 vUv;
        void main(){
          vec3 c = cameraPosition + normalize(uSunDir) * 2700.0;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * 2700.0 * uSize;
          vUv = position.xy;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGain;
        varying vec2 vUv;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        void main(){
          float r = length(vUv);
          if (r > 1.0) discard;
          float ang = atan(vUv.y, vUv.x);
          float t = uTime;
          float disc = 1.0 - smoothstep(0.034, 0.042, r);
          // fine rays, long and short, each a row of short strokes of unequal length that walk slowly outward
          float cell = ang / 6.2832 * 120.0;
          float id = floor(cell); float lat = abs(fract(cell) - 0.5);
          float pick = fract(sin(id * 12.9898) * 43758.5453);
          float pick2 = fract(pick * 7.13);
          float reach = mix(0.34, 0.98, pick);
          float s = fract(r * mix(34.0, 66.0, pick2) - t * 0.22 + pick * 40.0);
          float dab = smoothstep(0.16, 0.3, s) * smoothstep(0.94, 0.72, s);
          float ray = (1.0 - smoothstep(0.07, 0.2, lat)) * smoothstep(0.09, 0.2, r) * (1.0 - smoothstep(reach * 0.5, reach, r)) * dab * (0.45 + 0.55 * pick2);
          // broad soft beams under them, turning very slowly, never still
          float beams = pow(0.5 + 0.5 * sin(ang * 11.0 + t * 0.015 + fbm(vec2(ang * 2.0, t * 0.03)) * 2.0), 3.0) * exp(-r * 3.4);
          float glow = exp(-r * r * 24.0) * 0.9 + exp(-r * 5.5) * 0.12;
          vec3 col = vec3(1.0, 0.97, 0.86) * disc * 5.0 + uGlow * (ray * 0.34 + beams * 0.12 + glow);
          float up = smoothstep(-0.06, 0.04, uSunDir.y);
          gl_FragColor = vec4(col * (1.0 - smoothstep(0.8, 1.0, r)) * up * uGain * (1.0 + uPulse * 0.4), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { g, mat };
  }, [size, gain]);
  return <mesh geometry={b.g} material={b.mat} frustumCulled={false} renderOrder={1} />;
}


// ---------- light pouring down ----------
// A shaft of sunlight come through a gap in the cloud: a long soft blade lying along the sun's own direction,
// always turned to the eye, streaked along its length, drifting and breathing. `foot` is where it lands.
export type Beam = { foot: V3; len: number; w: number; k?: number };
export function SunShafts({ list, tint = [1, 0.9, 0.6], dir }: { list: Beam[]; tint?: V3; dir?: V3 }) {
  const b = useDisposable(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const foot = new Float32Array(list.length * 4);
    const meta = new Float32Array(list.length * 3);
    const box = new THREE.Box3();
    list.forEach((s, i) => {
      foot.set([...s.foot, s.len], i * 4);
      meta.set([s.w, s.k ?? 1, (i * 0.618) % 1], i * 3);
      box.expandByPoint(new THREE.Vector3(...s.foot));
    });
    g.setAttribute("aFoot", new THREE.InstancedBufferAttribute(foot, 4));
    g.setAttribute("aMeta", new THREE.InstancedBufferAttribute(meta, 3));
    g.instanceCount = list.length;
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    g.boundingSphere.radius += 1200;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) }, uDir: { value: new THREE.Vector3(...(dir ?? [0, 0, 0])) } },
      vertexShader: /* glsl */ `
        attribute vec4 aFoot; attribute vec3 aMeta;
        uniform vec3 uSunDir; uniform vec3 uDir; uniform float uTime;
        varying vec2 vUv; varying vec3 vMeta; varying float vDist;
        void main(){
          vec3 axis = normalize(dot(uDir, uDir) > 0.0 ? uDir : uSunDir);
          vec3 foot = (modelMatrix * vec4(aFoot.xyz, 1.0)).xyz + vec3(sin(uTime * 0.03 + aMeta.z * 30.0), 0.0, cos(uTime * 0.025 + aMeta.z * 17.0)) * aMeta.x * 0.3;
          vec3 c = foot + axis * aFoot.w * position.y;
          // the blade turns about its own axis to face the eye, and opens a little as it comes down
          vec3 side = normalize(cross(axis, c - cameraPosition));
          vec3 p = c + side * position.x * aMeta.x * (1.25 - 0.5 * position.y);
          vUv = position.xy; vMeta = aMeta; vDist = length(p - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying vec2 vUv; varying vec3 vMeta; varying float vDist;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        void main(){
          float across = exp(-vUv.x * vUv.x * 3.2) * (1.0 - abs(vUv.x));
          float along = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          float streak = vnoise(vec2(vUv.x * 5.0 + vMeta.z * 50.0, vUv.y * 0.7 - uTime * 0.01)) * 0.6 + vnoise(vec2(vUv.x * 17.0 + vMeta.z * 9.0, vUv.y * 1.6)) * 0.4;
          float breath = 0.75 + 0.25 * sin(uTime * 0.2 + vMeta.z * 30.0);
          float a = across * along * (0.3 + 0.7 * streak) * breath * vMeta.y * smoothstep(8.0, 90.0, vDist) * mix(1.0, 0.36, uNight);
          gl_FragColor = vec4(uTint * mix(vec3(1.0), uGlow, 0.5) * a * 0.2, 1.0);
          ${END}
        }`,
    });
    return { g, mat };
  }, [list]);
  return <mesh geometry={b.g} material={b.mat} renderOrder={7} />;
}

// ---------- figures that walk ----------
// A procession: small robed figures going one behind another along a line of points at walking pace, each
// turned the way it goes, swaying a little as it steps. One draw call; they are placed in the shader.
export function Procession({ road, n, speed = 1.3, scale = 2, robe = [0.8, 0.76, 0.66], wing = [0.6, 0.66, 0.8], seed = 4, glow = 0.1 }: { road: THREE.Vector3[]; n: number; speed?: number; scale?: number; robe?: V3; wing?: V3; seed?: number; glow?: number }) {
  const b = useDisposable(() => {
    const N = road.length;
    const data = new Float32Array(N * 4);
    let len = 0;
    road.forEach((p, i) => {
      if (i > 0) len += p.distanceTo(road[i - 1]);
      data.set([p.x, p.y, p.z, len], i * 4);
    });
    const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    // one figure: a robe, a head, two folded wings behind (feet at the origin, facing +z)
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, c: V3) => {
      const q = g.index ? g.toNonIndexed() : g;
      const col = new Float32Array(q.attributes.position.count * 3);
      for (let i = 0; i < q.attributes.position.count; i++) col.set(c, i * 3);
      q.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
      q.deleteAttribute("uv");
      parts.push(q);
    };
    add(new THREE.LatheGeometry([[0.3, 0], [0.2, 0.5], [0.15, 1.0], [0.18, 1.38], [0.07, 1.52]].map(([x, y]) => new THREE.Vector2(x, y)), 7), robe);
    add(new THREE.SphereGeometry(0.11, 6, 5).translate(0, 1.64, 0), [0.92, 0.78, 0.64]);
    for (const sd of [-1, 1]) add(new THREE.ConeGeometry(0.2, 1.7, 4).scale(0.55, 1, 0.22).rotateZ(sd * 0.1).translate(sd * 0.17, 1.25, -0.16), wing);
    const fig = mergeGeometries(parts)!;
    parts.forEach((q) => q.dispose());
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", fig.attributes.position);
    g.setAttribute("normal", fig.attributes.normal);
    g.setAttribute("aCol", fig.attributes.aCol);
    const r = rng(seed);
    const ph = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const company = Math.floor(r() * Math.max(1, n / 6));
      ph.set([(company / Math.max(1, n / 6) + (r() - 0.5) * 0.016 + 1) % 1, r()], i * 2);
    }
    g.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 2));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Box3().setFromPoints(road).getBoundingSphere(new THREE.Sphere());
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...SKY_U, ...WORLD_U, uRoad: { value: tex }, uN: { value: N }, uLen: { value: len }, uSpeed: { value: speed }, uScale: { value: scale }, uGlowK: { value: glow } },
      vertexShader: /* glsl */ `
        attribute vec2 aPh; attribute vec3 aCol;
        uniform sampler2D uRoad; uniform float uN; uniform float uLen; uniform float uSpeed; uniform float uScale; uniform float uTime;
        varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vShow;
        vec3 roadAt(float s){
          float f = clamp(s, 0.0, 1.0) * (uN - 1.0); float i0 = floor(f);
          vec3 a = texture2D(uRoad, vec2((i0 + 0.5) / uN, 0.5)).xyz;
          vec3 b = texture2D(uRoad, vec2((min(i0 + 1.0, uN - 1.0) + 0.5) / uN, 0.5)).xyz;
          return mix(a, b, f - i0);
        }
        void main(){
          float s = fract(aPh.x + uTime * uSpeed / uLen);
          vec3 c = roadAt(s);
          vec3 ahead = roadAt(s + 3.0 / uLen) - c;
          vec2 fw = normalize(ahead.xz + vec2(1e-5));
          float sz = uScale * (0.85 + 0.3 * aPh.y);
          // a slow sway from foot to foot
          float step = sin(uTime * 2.4 * uSpeed / sz * 2.0 + aPh.y * 40.0);
          vec3 p = position * sz;
          p.x += step * 0.05 * sz * position.y;
          vec3 right = vec3(fw.y, 0.0, -fw.x);
          vec3 w = c + right * (p.x + (aPh.y - 0.5) * 5.0) + vec3(0.0, p.y, 0.0) + vec3(fw.x, 0.0, fw.y) * (p.z + (fract(aPh.y * 7.0) - 0.5) * 4.0);
          vN = normalize(right * normal.x + vec3(0.0, normal.y, 0.0) + vec3(fw.x, 0.0, fw.y) * normal.z);
          vShow = smoothstep(0.0, 0.015, s) * smoothstep(1.0, 0.985, s);
          vec4 wp = modelMatrix * vec4(w, 1.0);
          vWorld = wp.xyz; vCol = aCol;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlowK;
        varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vShow;
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          if (vShow < 0.5) discard;
          vec3 n = normalize(vN);
          float lit = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0) * smoothstep(-0.02, 0.08, uKeyDir.y);
          vec3 col = vCol * (uSkyCol * (0.7 + 0.3 * n.y) + uKeyCol * lit * 0.4);
          col = applyAir(col, vWorld) + vCol * uGlowK * glowK();
          gl_FragColor = vec4(col, 1.0);
          ${END}
        }`,
    });
    return { g, mat, tex, fig };
  }, [road, n, speed, scale, seed]);
  return <mesh geometry={b.g} material={b.mat} />;
}
