"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DESK, GLSL_LAKE, GLSL_NOISE, GLSL_PATH, LAKE, MONITOR, lakeK, pathX } from "./shared";
import { GLSL_SKY, SKY_U } from "./sky";

// ---------- sky ----------

// Graded gradient + forward scattering, sun disc with a baked bloom, moon with
// a halo, twinkling stars at night and two drifting cloud layers lit from the
// sun side. Dithered. `env` is the version rendered into the reflection cube:
// darker ground, no stars.
export function makeSkyMaterial(env = false) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    defines: env ? { ENV: 1 } : {},
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      float clouds(vec2 uv, float t){
        return fbm(uv * 0.9 + vec2(t * 0.006, t * 0.002) + 7.3);
      }
      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 col = skyBase(d);
        float sd = dot(d, uSunDir);
        float md = dot(d, uMoonDir);
        float sunVis = smoothstep(-0.03, 0.02, uSunDir.y);
        #ifdef ENV
          float g = smoothstep(0.0, -0.08, d.y);
          col = mix(col, uSkyCol * vec3(0.32, 0.36, 0.18), g);
          col += mix(uGlow, vec3(1.0), 0.4) * 16.0 * smoothstep(0.9985, 0.9995, sd) * sunVis;
        #else
          float h = max(d.y, 0.0);
          // stars
          if (uNight > 0.01) {
            vec2 sp = vec2(atan(d.z, d.x) * 95.0, asin(clamp(d.y, -1.0, 1.0)) * 95.0);
            vec2 cell = floor(sp);
            float r = hash12(cell);
            vec2 c = cell + 0.5 + (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.7;
            float dd = length(sp - c);
            float px = max(fwidth(sp.x), 1e-4);
            float star = step(0.955, r) * smoothstep(px * 1.6, 0.0, dd) * (0.6 + 4.0 * pow(hash12(cell + 1.3), 6.0));
            star *= 0.65 + 0.35 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
            col += vec3(0.85, 0.9, 1.0) * star * uNight * smoothstep(0.02, 0.2, h);
            // faint milky band
            float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.6, -0.74))) * 3.2, 2.0));
            col += vec3(0.02, 0.025, 0.04) * band * fbm(sp * 0.04) * uNight * smoothstep(0.05, 0.3, h);
          }
          // moon: disc with soft maria and a halo
          if (uNight > 0.01) {
            float disc = smoothstep(0.99955, 0.9997, md);
            vec3 tang = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
            vec2 mp = vec2(dot(d, tang), dot(d, cross(tang, uMoonDir))) * 400.0;
            float maria = fbm(mp * 0.25 + 3.0);
            col += vec3(0.9, 0.92, 1.0) * disc * (2.2 - maria * 0.9) * uNight;
            col += vec3(0.4, 0.48, 0.7) * (pow(max(md, 0.0), 400.0) * 0.6 + pow(max(md, 0.0), 30.0) * 0.06) * uNight;
          }
          // two cloud layers: high wispy, lower soft
          vec2 uv = d.xz / (h + 0.09);
          float n1 = clouds(uv * vec2(0.55, 1.1), uTime);
          float n2 = fbm(uv * vec2(0.25, 0.5) * 0.7 - vec2(uTime * 0.003, 0.0) + 31.0);
          float fadeH = smoothstep(0.02, 0.22, h) * (1.0 - smoothstep(0.6, 0.98, h));
          float cov1 = smoothstep(0.58, 0.82, n1) * fadeH * 0.6;
          float cov2 = smoothstep(0.55, 0.78, n2) * fadeH;
          float lit = clamp((n2 - fbm(uv * vec2(0.25, 0.5) * 0.7 - vec2(uTime * 0.003, 0.0) + 31.0 + uSunDir.xz * 0.1)) * 4.0 + 0.5, 0.0, 1.0);
          vec3 cc = mix(uCloudShade, uCloudLit, lit);
          cc += uGlow * pow(max(sd, 0.0), 8.0) * 1.4 * sunVis;
          col = mix(col, mix(uCloudShade, uCloudLit, 0.7), cov1 * 0.55);
          col = mix(col, cc, cov2 * 0.75);
          float cover = max(cov1, cov2);
          // crepuscular rays fanning from a low sun through the haze
          float golden = sunVis * (1.0 - smoothstep(0.06, 0.4, uSunDir.y));
          if (golden > 0.01) {
            vec3 ax = normalize(cross(uSunDir, vec3(0.0, 1.0, 0.0)));
            vec2 rp = vec2(dot(d, ax), dot(d, cross(ax, uSunDir)));
            float ang = atan(rp.y, rp.x);
            float rays = smoothstep(0.35, 0.95, vnoise(vec2(ang * 22.0, uTime * 0.03))) * 0.7 + smoothstep(0.5, 1.0, vnoise(vec2(ang * 57.0, 3.0 + uTime * 0.02))) * 0.3;
            col += uGlow * rays * pow(max(sd, 0.0), 5.0) * 0.42 * golden * smoothstep(-0.04, 0.2, d.y) * (1.0 - cover * 0.5);
          }
          // sun disc + bloom
          float disc = smoothstep(0.99955, 0.99975, sd);
          vec3 sunC = mix(uGlow, vec3(1.0, 0.95, 0.88), 0.55);
          col += sunC * disc * 38.0 * (1.0 - cover * 0.85) * sunVis;
          col += uGlow * (pow(max(sd, 0.0), 900.0) * 5.0 + pow(max(sd, 0.0), 160.0) * 0.8) * sunVis;
        #endif
        col += (hash12(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function Sky() {
  const mat = useMemo(() => makeSkyMaterial(false), []);
  return (
    <mesh material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[1500, 48, 24]} />
    </mesh>
  );
}

// Analytic shadow from the desk top and the display onto anything below them.
export const GLSL_DESK_SHADOW = /* glsl */ `
float rectShadow(vec2 q, vec2 c, vec2 hs, float soft){
  vec2 e = abs(q - c) - hs;
  float d = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
  return 1.0 - smoothstep(-soft, soft, d);
}
float deskShadow(vec3 p){
  float s = 0.0;
  vec3 L = uKeyDir;
  if (p.y < ${DESK.top.toFixed(3)} && L.y > 0.02) {
    float k = (${DESK.top.toFixed(3)} - p.y) / L.y;
    vec2 q = p.xz + L.xz * k;
    s = rectShadow(q, vec2(0.0), vec2(${(DESK.w / 2).toFixed(3)}, ${(DESK.d / 2).toFixed(3)}), 0.02 + k * 0.035);
  }
  float kz = (${MONITOR.z.toFixed(3)} - p.z) / (abs(L.z) > 0.01 ? L.z : 0.01);
  if (kz > 0.0) {
    vec3 q = p + L * kz;
    s = max(s, rectShadow(q.xy, vec2(0.0, ${MONITOR.y.toFixed(3)}), vec2(${(MONITOR.w / 2).toFixed(3)}, ${(MONITOR.h / 2).toFixed(3)}), 0.02 + kz * 0.03));
  }
  return 1.0 - s * 0.85;
}
`;

// ---------- ground ----------

function tex(url: string, repeat: number) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.repeat.set(repeat, repeat);
  return t;
}

// Ground under the blades: textured soil and the dirt path near the desk, a
// painted field further out, all fading into the sky's horizon colour.
export function Ground({ fogDensity }: { fogDensity: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          ...SKY_U,
          uFog: { value: fogDensity },
          uGrassTex: { value: tex("/scene/tex/sparse_grass_diff.jpg", 1) },
          uDirtTex: { value: tex("/scene/tex/stony_dirt_path_diff.jpg", 1) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform float uFog; uniform sampler2D uGrassTex; uniform sampler2D uDirtTex;
          varying vec3 vWorld;
          ${GLSL_NOISE}
          ${GLSL_SKY}
          ${GLSL_DESK_SHADOW}
          ${GLSL_PATH}
          ${GLSL_LAKE}
          void main(){
            float r = length(vWorld.xz);
            float n = fbm(vWorld.xz * 0.08);
            float n2 = vnoise(vWorld.xz * 0.6);
            vec3 soil = texture2D(uGrassTex, vWorld.xz * 0.45).rgb * 0.38;
            vec3 far = mix(vec3(0.11, 0.15, 0.035), vec3(0.2, 0.19, 0.06), smoothstep(0.4, 0.75, n)) * (0.85 + 0.3 * n2);
            vec3 alb = mix(soil, far, smoothstep(2.5, 14.0, r));
            // dirt path
            float px = abs(vWorld.x - pathX(vWorld.z)) / pathW(vWorld.z);
            float edge = 1.0 - smoothstep(0.55 + n2 * 0.35, 1.05 + n2 * 0.3, px);
            vec3 dirt = texture2D(uDirtTex, vWorld.xz * 0.5).rgb * 0.75;
            alb = mix(alb, dirt, edge * (1.0 - smoothstep(30.0, 60.0, abs(vWorld.z))));
            float lk = lakeK(vWorld.xz);
            alb = mix(alb, vec3(0.05, 0.05, 0.04), 1.0 - smoothstep(1.0, 1.25, lk));
            float sh = deskShadow(vWorld);
            vec3 col = alb * (uSkyCol * 0.85 + uKeyCol * max(uKeyDir.y, 0.0) * sh * 0.9);
            float dist = length(vWorld - cameraPosition);
            vec3 fd = normalize(vec3(vWorld.x - cameraPosition.x, 0.015, vWorld.z - cameraPosition.z));
            col = mix(col, skyBase(fd), 1.0 - exp(-dist * uFog));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [fogDensity],
  );
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={-5}>
      <circleGeometry args={[1400, 96]} />
    </mesh>
  );
}

// ---------- mountains ----------

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
// value noise with analytic derivatives
function noised(x: number, y: number): [number, number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const dux = 6 * fx * (1 - fx);
  const duy = 6 * fy * (1 - fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const k1 = b - a;
  const k2 = c - a;
  const k4 = a - b - c + d;
  return [a + k1 * ux + k2 * uy + k4 * ux * uy, dux * (k1 + k4 * uy), duy * (k2 + k4 * ux)];
}
// "eroded" fbm (derivative-damped): sharp ridges, smooth gullies and valleys
function eroded(x: number, y: number, oct: number) {
  let v = 0;
  let amp = 0.55;
  let dx = 0;
  let dy = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < oct; i++) {
    const [n, nx, ny] = noised(px, py);
    dx += nx;
    dy += ny;
    v += (amp * n) / (1 + dx * dx + dy * dy);
    amp *= 0.5;
    const tx = 1.6 * px - 1.2 * py;
    py = 1.2 * px + 1.6 * py;
    px = tx;
  }
  return v;
}
function ridged(x: number, y: number, oct: number) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  let w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noised(x * f, y * f)[0] * 2 - 1);
    n = n * n * w;
    w = Math.min(1, n * 2);
    v += n * a;
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}

type Range = { r0: number; r1: number; height: number; freq: number; seed: number; haze: number; snow: number };

function rangeGeometry(rg: Range, segA: number, segR: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    const r = rg.r0 + (rg.r1 - rg.r0) * t;
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.2)), 0.75);
    for (let i = 0; i <= segA; i++) {
      const a = (i / segA) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const wx = x * rg.freq + rg.seed + 2.5 * noised(x * rg.freq * 0.3, z * rg.freq * 0.3)[0];
      const wz = z * rg.freq - rg.seed + 2.5 * noised(z * rg.freq * 0.3 + 9, x * rg.freq * 0.3)[0];
      const h = 0.55 * ridged(wx, wz, 5) + 0.75 * eroded(wx * 0.8, wz * 0.8, 6);
      const broad = 0.5 + 0.5 * noised(x * rg.freq * 0.22 + 40 + rg.seed, z * rg.freq * 0.22)[0];
      pos.push(x, rg.height * h * broad * env - 5, z);
    }
  }
  const row = segA + 1;
  for (let j = 0; j < segR; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeRangeMaterial(rg: Range) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, uHaze: { value: rg.haze }, uSnow: { value: rg.snow }, uTop: { value: rg.height } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uHaze; uniform float uSnow; uniform float uTop;
      varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        vec3 n = normalize(vN);
        float hN = clamp(vWorld.y / uTop, 0.0, 1.0);
        float strata = vnoise(vec2(vWorld.y * 0.35, vWorld.x * 0.01));
        vec3 forest = vec3(0.03, 0.05, 0.032);
        vec3 rock = mix(vec3(0.1, 0.095, 0.09), vec3(0.15, 0.135, 0.12), strata);
        vec3 alb = mix(forest, rock, smoothstep(0.12, 0.45, hN + (1.0 - n.y) * 0.35));
        float sn = uSnow * smoothstep(0.32, 0.5, hN + (vnoise(vWorld.xz * 0.08) - 0.5) * 0.22) * smoothstep(0.35, 0.7, n.y);
        alb = mix(alb, vec3(0.86, 0.89, 0.94), sn);
        float ndl = max(dot(n, uKeyDir), 0.0);
        vec3 col = alb * (uSkyCol * (0.5 + 0.5 * n.y) + uKeyCol * ndl * 1.1);
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 air = skyBase(normalize(vec3(d.x, max(d.y, 0.0) * 0.6 + 0.01, d.z)));
        float haze = clamp(uHaze + (1.0 - smoothstep(0.0, uTop * 0.6, vWorld.y)) * 0.16, 0.0, 0.95);
        col = mix(col, air, haze);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function Mountains({ mobile }: { mobile: boolean }) {
  const layers = useMemo(() => {
    const ranges: Range[] = [
      { r0: 110, r1: 175, height: 20, freq: 0.02, seed: 3.1, haze: 0.16, snow: 0 },
      { r0: 210, r1: 340, height: 60, freq: 0.011, seed: 11.7, haze: 0.3, snow: 0.35 },
      { r0: 430, r1: 660, height: 150, freq: 0.006, seed: 27.3, haze: 0.42, snow: 1 },
    ];
    const segA = mobile ? 540 : 900;
    return ranges.map((rg) => ({ geo: rangeGeometry(rg, segA, mobile ? 22 : 34), mat: makeRangeMaterial(rg) }));
  }, [mobile]);
  useEffect(
    () => () =>
      layers.forEach((l) => {
        l.geo.dispose();
        l.mat.dispose();
      }),
    [layers],
  );
  return (
    <>
      {layers.map((l, i) => (
        <mesh key={i} geometry={l.geo} material={l.mat} renderOrder={-8 + i} frustumCulled={false} />
      ))}
    </>
  );
}

// ---------- trees and rocks ----------

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Tall slender trees in the spirit of Čiurlionis: dark pines and white-stemmed
// birches standing in loose groups on the far field and along the lake,
// swaying gently. Instanced, one draw call per species.
function withWind(mat: THREE.MeshStandardMaterial, amount: number) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = SKY_U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
        #else
          float ph = 0.0;
        #endif
        float sway = sin(uTime * 0.9 + ph) * 0.6 + sin(uTime * 2.1 + ph * 1.7) * 0.25;
        transformed.x += sway * ${amount.toFixed(3)} * max(position.y, 0.0) * max(position.y, 0.0);`,
      );
  };
  return mat;
}

export function Trees() {
  const data = useMemo(() => {
    // pine: thin trunk, stacked narrow cones
    const pineParts = [new THREE.CylinderGeometry(0.06, 0.11, 2.2, 6).translate(0, 1.1, 0)];
    [0, 1, 2, 3].forEach((i) => pineParts.push(new THREE.ConeGeometry(0.95 - i * 0.18, 2.3 - i * 0.25, 8).translate(0, 2.0 + i * 1.35, 0)));
    const pine = mergeGeometries(pineParts.map((g) => g.toNonIndexed()))!;
    pine.computeVertexNormals();
    // birch: pale slender trunk, a few loose crowns
    const trunk = new THREE.CylinderGeometry(0.05, 0.09, 6.5, 7).translate(0, 3.25, 0);
    const crowns = [
      [0.0, 5.6, 0.0, 1.1],
      [0.35, 4.6, 0.2, 0.8],
      [-0.3, 4.9, -0.2, 0.75],
    ].map(([x, y, z, r]) => {
      const g = new THREE.IcosahedronGeometry(r, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const k = 1 + 0.22 * (noised(v.x * 2.3 + x * 5, v.y * 2.3 + v.z * 1.7)[0] - 0.5) * 2;
        p.setXYZ(i, v.x * k, v.y * k * 1.25, v.z * k);
      }
      return g.translate(x, y, z);
    });
    const birchCrown = mergeGeometries(crowns.map((g) => g.toNonIndexed()))!;
    birchCrown.computeVertexNormals();
    const r = rng(77);
    const pines: { x: number; z: number; s: number }[] = [];
    const birches: { x: number; z: number; s: number }[] = [];
    const groves: [number, number, number, "p" | "b"][] = [
      [-62, -92, 26, "p"],
      [-22, -108, 30, "p"],
      [24, -112, 28, "p"],
      [66, -90, 24, "p"],
      [-100, -44, 22, "p"],
      [96, -40, 22, "p"],
      [-88, 58, 26, "p"],
      [84, 66, 24, "p"],
      [LAKE.x - 24, LAKE.z - 16, 12, "b"],
      [LAKE.x + 6, LAKE.z - 20, 14, "b"],
      [-70, 10, 10, "b"],
    ];
    groves.forEach(([gx, gz, spread, kind]) => {
      const n = kind === "p" ? 14 + Math.floor(r() * 10) : 7 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        const x = gx + (r() - 0.5) * spread * 1.6;
        const z = gz + (r() - 0.5) * spread * 0.5;
        if (lakeK(x, z) < 1.2 || Math.abs(x - pathX(z)) < 2) continue;
        (kind === "p" ? pines : birches).push({ x, z, s: kind === "p" ? 1.6 + r() * 1.6 : 0.9 + r() * 0.5 });
      }
    });
    return {
      pine,
      trunk,
      birchCrown,
      pines,
      birches,
      matPine: withWind(new THREE.MeshStandardMaterial({ color: "#1d2a1f", roughness: 1 }), 0.0015),
      matTrunk: withWind(new THREE.MeshStandardMaterial({ color: "#e4e1d8", roughness: 0.8 }), 0.002),
      matCrown: withWind(new THREE.MeshStandardMaterial({ color: "#58702f", roughness: 1 }), 0.002),
    };
  }, []);
  const refP = useRef<THREE.InstancedMesh>(null);
  const refT = useRef<THREE.InstancedMesh>(null);
  const refC = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const o = new THREE.Object3D();
    data.pines.forEach((t, i) => {
      o.position.set(t.x, 0, t.z);
      o.scale.set(t.s * 0.9, t.s * (1.1 + (i % 5) * 0.06), t.s * 0.9);
      o.rotation.set(0, i * 2.3, 0);
      o.updateMatrix();
      refP.current?.setMatrixAt(i, o.matrix);
    });
    data.birches.forEach((t, i) => {
      o.position.set(t.x, 0, t.z);
      o.scale.set(t.s, t.s * (1 + (i % 4) * 0.08), t.s);
      o.rotation.set(0, i * 1.9, (i % 3 - 1) * 0.04);
      o.updateMatrix();
      refT.current?.setMatrixAt(i, o.matrix);
      refC.current?.setMatrixAt(i, o.matrix);
    });
    [refP, refT, refC].forEach((r) => r.current && (r.current.instanceMatrix.needsUpdate = true));
  }, [data]);
  return (
    <>
      <instancedMesh ref={refP} args={[data.pine, data.matPine, data.pines.length]} frustumCulled={false} castShadow={false} />
      <instancedMesh ref={refT} args={[data.trunk, data.matTrunk, data.birches.length]} frustumCulled={false} />
      <instancedMesh ref={refC} args={[data.birchCrown, data.matCrown, data.birches.length]} frustumCulled={false} />
    </>
  );
}

// ---------- lake ----------

// Still water: the sky reflected with fresnel, soft ripples, a sun or moon glint.
export function Lake({ fogDensity }: { fogDensity: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...SKY_U, uFog: { value: fogDensity } },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform float uFog;
          varying vec3 vWorld;
          ${GLSL_NOISE}
          ${GLSL_SKY}
          ${GLSL_LAKE}
          void main(){
            float lk = lakeK(vWorld.xz);
            if (lk > 1.04) discard;
            vec3 V = normalize(cameraPosition - vWorld);
            vec2 q = vWorld.xz;
            float e = 0.15;
            float h0 = fbm(q * 0.9 + vec2(uTime * 0.12, uTime * 0.05));
            float hx = fbm(q * 0.9 + vec2(e, 0.0) + vec2(uTime * 0.12, uTime * 0.05));
            float hz = fbm(q * 0.9 + vec2(0.0, e) + vec2(uTime * 0.12, uTime * 0.05));
            vec3 n = normalize(vec3((h0 - hx) * 0.35, 1.0, (h0 - hz) * 0.35));
            vec3 r = reflect(-V, n);
            r.y = abs(r.y) + 0.002;
            vec3 sky = skyBase(normalize(r));
            float sunVis = smoothstep(-0.03, 0.03, uSunDir.y);
            sky += mix(uGlow, vec3(1.0), 0.5) * pow(max(dot(r, uSunDir), 0.0), 600.0) * 30.0 * sunVis;
            sky += vec3(0.8, 0.85, 1.0) * pow(max(dot(r, uMoonDir), 0.0), 800.0) * 8.0 * uNight;
            float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
            vec3 deep = vec3(0.015, 0.03, 0.04) * (uSkyCol * 2.0 + 0.2);
            vec3 col = mix(deep, sky, clamp(fres * 0.92 + 0.08, 0.0, 1.0));
            // soft shore
            col = mix(col, vec3(0.04, 0.045, 0.03) * (uSkyCol + uKeyCol * 0.3), smoothstep(0.92, 1.04, lk));
            float dist = length(vWorld - cameraPosition);
            vec3 fd = normalize(vec3(vWorld.x - cameraPosition.x, 0.015, vWorld.z - cameraPosition.z));
            col = mix(col, skyBase(fd), 1.0 - exp(-dist * uFog));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [fogDensity],
  );
  return (
    <mesh position={[LAKE.x, 0.015, LAKE.z]} rotation={[-Math.PI / 2, 0, 0]} scale={[LAKE.rx * 1.06, LAKE.rz * 1.06, 1]} material={mat} renderOrder={-4}>
      <circleGeometry args={[1, 96]} />
    </mesh>
  );
}

export function Rocks() {
  const { geo, mat, items } = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = 1 + 0.35 * (eroded(v.x * 1.4 + 5, v.z * 1.4 + v.y * 0.9, 4) - 0.25);
      p.setXYZ(i, v.x * k, v.y * k * 0.45, v.z * k);
    }
    g.computeVertexNormals();
    const loader = new THREE.TextureLoader();
    const map = loader.load("/scene/tex/rock_face_diff.jpg");
    map.colorSpace = THREE.SRGBColorSpace;
    const nor = loader.load("/scene/tex/rock_face_nor.jpg");
    const m = new THREE.MeshStandardMaterial({ map, normalMap: nor, color: "#9a9c9c", roughness: 0.95 });
    const r = rng(311);
    const items: { x: number; z: number; s: number; ry: number }[] = [];
    while (items.length < 12) {
      const a = r() * Math.PI * 2;
      const d = 4 + r() * 26;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.abs(x - pathX(z)) < 1.4) continue;
      if (z > 0 && Math.abs(x) < 4) continue; // keep the foreground clear
      items.push({ x, z, s: 0.2 + r() * r() * 0.8, ry: r() * 6 });
    }
    return { geo: g, mat: m, items };
  }, []);
  return (
    <>
      {items.map((it, i) => (
        <mesh key={i} geometry={geo} material={mat} position={[it.x, it.s * 0.05, it.z]} scale={it.s} rotation={[0, it.ry, 0]} castShadow receiveShadow />
      ))}
    </>
  );
}

// ---------- birds ----------

// A loose flock wheeling far off in daylight. Two-triangle wings flapped in
// the vertex shader.
export function Birds() {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.12, -0.5, 0, 0.08, 0, 0, 0.12, 0, 0, -0.12, 0, 0, 0.12, 0.5, 0, 0.08], 3));
    const n = 9;
    const ph = new Float32Array(n * 3);
    const r = rng(9);
    for (let i = 0; i < n; i++) {
      ph[i * 3] = r() * 6.28;
      ph[i * 3 + 1] = (r() - 0.5) * 9;
      ph[i * 3 + 2] = (r() - 0.5) * 3;
    }
    g.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 3));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, uVis: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aPh; uniform float uVis; varying vec3 vWorld;
        uniform float uTime;
        void main(){
          float t = uTime * 0.07 + aPh.x * 0.02;
          vec3 c = vec3(-24.0, 17.0 + aPh.z, -58.0);
          float R = 16.0 + aPh.y;
          vec3 pos = c + vec3(cos(t) * R, sin(t * 2.3 + aPh.x) * 1.2, sin(t) * R * 0.6);
          vec3 fwd = normalize(vec3(-sin(t), 0.0, cos(t) * 0.6));
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          vec3 p = position;
          p.y += abs(p.x) * sin(uTime * 9.0 + aPh.x * 3.0) * 0.9;
          vec3 w = pos + (side * p.x + vec3(0.0, p.y, 0.0) + fwd * p.z) * 0.7 * uVis;
          vWorld = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        ${GLSL_SKY}
        void main(){
          vec3 d = normalize(vWorld - cameraPosition);
          vec3 col = mix(vec3(0.03, 0.03, 0.035), skyBase(d), 0.45);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, []);
  useFrame(() => {
    mat.uniforms.uVis.value = THREE.MathUtils.clamp(1 - SKY_U.uNight.value * 2, 0, 1) * (SKY_U.uSunDir.value.y > 0.03 ? 1 : 0);
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}
