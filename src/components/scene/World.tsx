"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HOME_GATE_Z } from "./flightPath";
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
      vec3 hash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
      vec3 starLayer(vec3 dir, float scale, float density){
        vec3 p = dir * scale; vec3 id = floor(p); vec3 f = fract(p) - 0.5;
        vec3 hh = hash33(id);
        float dd = length(f - (hh - 0.5) * 0.7);
        float px = fwidth(dd) * 1.2;
        float r0 = mix(0.018, 0.055, hh.z * hh.z * hh.z);
        float r = max(r0, px);
        float core = smoothstep(r, 0.0, dd) * (r0 * r0) / (r * r) * 9.0;
        float tw = 0.72 + 0.28 * sin(uTime * (1.0 + hh.x * 3.0) + hh.y * 6.283);
        vec3 tint = mix(vec3(1.0, 0.86, 0.7), vec3(0.74, 0.84, 1.0), hh.y);
        return tint * core * tw * step(1.0 - density, hh.x) * (0.4 + 2.6 * hh.z * hh.z);
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
          // stars: three layers of hash cells on the view direction (no pinching
          // at the zenith), each star never thinner than a pixel so they dim
          // rather than shimmer; the Milky Way is a dusty band with a dense
          // faint layer of its own. All of it swells a little with the music.
          if (uNight > 0.01) {
            float beat = 1.0 + uPulse * 1.3;
            float hz = smoothstep(0.0, 0.16, h);
            vec3 st = (starLayer(d, 70.0, 0.34) + starLayer(d, 150.0, 0.42) * 0.7 + starLayer(d, 330.0, 0.5) * 0.4) * beat;
            vec3 gn = normalize(vec3(0.42, 0.5, -0.76));
            float gb = dot(d, gn);
            float band = exp(-gb * gb * 16.0);
            float dust = fbm(d.xz * 3.0 + d.y * 2.0 + 7.0) * fbm(d.zy * 8.0 + 3.0);
            vec3 mw = mix(vec3(0.05, 0.065, 0.13), vec3(0.2, 0.17, 0.24), dust * 2.0) * band * (0.25 + dust * 2.2);
            st += starLayer(d, 520.0, 0.85) * band * 0.55;
            col += (st + mw * (1.0 + uPulse * 0.6)) * uNight * hz * uSkyFx.w;
          }
          // moon: disc with soft maria and a halo
          if (uNight > 0.01) {
            float disc = smoothstep(0.99955, 0.9997, md);
            vec3 tang = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
            vec2 mp = vec2(dot(d, tang), dot(d, cross(tang, uMoonDir))) * 400.0;
            float maria = fbm(mp * 0.25 + 3.0);
            col += vec3(0.9, 0.92, 1.0) * disc * (2.2 - maria * 0.9) * uNight * uSkyFx.z;
            col += vec3(0.4, 0.48, 0.7) * (pow(max(md, 0.0), 400.0) * 0.7 + pow(max(md, 0.0), 40.0) * 0.1 + pow(max(md, 0.0), 6.0) * 0.035) * uNight * (1.0 + uPulse * 0.5) * uSkyFx.z;
          }
          // two cloud layers: high wispy, lower soft
          vec2 uv = d.xz / (h + 0.09);
          float n1 = clouds(uv * vec2(0.55, 1.1), uTime);
          float n2 = fbm(uv * vec2(0.25, 0.5) * 0.7 - vec2(uTime * 0.003, 0.0) + 31.0);
          float fadeH = smoothstep(0.02, 0.22, h) * (1.0 - smoothstep(0.6, 0.98, h));
          float cov1 = smoothstep(0.58, 0.82, n1) * fadeH * 0.6 * uSkyFx.x;
          float cov2 = smoothstep(0.55, 0.78, n2) * fadeH * uSkyFx.x;
          float lit = clamp((n2 - fbm(uv * vec2(0.25, 0.5) * 0.7 - vec2(uTime * 0.003, 0.0) + 31.0 + uSunDir.xz * 0.1)) * 4.0 + 0.5, 0.0, 1.0);
          vec3 cc = mix(uCloudShade, uCloudLit, lit);
          cc += uGlow * pow(max(sd, 0.0), 8.0) * 1.4 * sunVis;
          col = mix(col, mix(uCloudShade, uCloudLit, 0.7), cov1 * 0.55);
          col = mix(col, cc, cov2 * 0.75);
          // long quiet bars of cloud stacked above the horizon, as he painted them
          float bars = smoothstep(0.52, 0.7, fbm(vec2(atan(d.z, d.x) * 2.2 + uTime * 0.002, h * 26.0 + 2.0))) * smoothstep(0.015, 0.06, h) * (1.0 - smoothstep(0.14, 0.3, h)) * uSkyFx.y;
          col = mix(col, mix(uCloudShade, uCloudLit, 0.55) + uGlow * pow(max(sd, 0.0), 6.0) * 0.8 * sunVis, bars * 0.5);
          float cover = max(max(cov1, cov2), bars * 0.6);
          col += uGlow * uPulse * 0.1 * (1.0 - smoothstep(0.0, 0.5, h));
          // crepuscular rays fanning from a low sun through the haze
          float golden = sunVis * (1.0 - smoothstep(0.06, 0.4, uSunDir.y)) * uSkyFx.z;
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
          col += sunC * disc * 38.0 * (1.0 - cover * 0.85) * sunVis * uSkyFx.z;
          col += uGlow * (pow(max(sd, 0.0), 900.0) * 5.0 + pow(max(sd, 0.0), 160.0) * 0.8) * sunVis * uSkyFx.z;
          // arrival mist
          col = mix(col, uHorizon * 1.05 + uSkyCol * 0.2, clamp(uMist * 3.0, 0.0, 0.9) * (1.0 - smoothstep(0.1, 0.7, h)));
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
  const ref = useRef<THREE.Mesh>(null);
  // the dome travels with the eye: the worlds of the flight lie far from the desk
  useFrame(({ camera }) => ref.current?.position.copy(camera.position));
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
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
            // the same patches of fresh and dry grass the blades are coloured by, so
            // where the blades end the field simply carries on
            float clumpN = vnoise(vWorld.xz * 0.42 + 11.0);
            float patchN = vnoise(vWorld.xz * 0.11 + 3.0);
            float dry = smoothstep(0.5, 0.85, patchN * 0.7 + clumpN * 0.3);
            vec3 far = mix(vec3(0.13, 0.2, 0.05), vec3(0.28, 0.24, 0.095), dry) * mix(0.72, 1.12, clamp(clumpN * 0.6 + patchN * 0.6 - 0.1, 0.0, 1.0)) * 0.8;
            {
              // out along the road the field is painted: broad drifts, long soft strokes, and near the eye short dabs like tufts
              // (none of it round the desk, where the real blades stand thick)
              float away = smoothstep(24.0, 70.0, r);
              float gd = length(vWorld - cameraPosition);
              vec2 gp = vWorld.xz;
              float k = mix(0.86, 1.14, smoothstep(0.3, 0.7, fbm(gp * 0.006 + 21.0)));
              float ga = vnoise(gp * 0.008 + 5.0) * 6.2832;
              vec2 gdir = vec2(cos(ga), sin(ga));
              vec2 gq = vec2(dot(gp, gdir), dot(gp, vec2(-gdir.y, gdir.x)));
              float brush = vnoise(vec2(gq.x * 0.08, gq.y * 0.85)) * 0.6 + vnoise(vec2(gq.x * 0.28, gq.y * 2.4) + 7.0) * 0.4;
              k *= 1.0 + (brush - 0.5) * 0.32 * (1.0 - smoothstep(70.0, 340.0, gd));
              float near = 1.0 - smoothstep(12.0, 64.0, gd);
              vec2 tc = gp * 1.7; vec2 ti = floor(tc); vec2 tf = fract(tc) - 0.5; float th = hash12(ti);
              vec2 off = (vec2(hash12(ti + 3.1), hash12(ti + 7.7)) - 0.5) * 0.6;
              float tuft = (1.0 - smoothstep(0.06, 0.34, length((tf - off) * vec2(2.6, 0.9)))) * step(0.42, th);
              k *= 1.0 + tuft * near * (th > 0.7 ? 0.32 : -0.26);
              far *= mix(1.0, k, away);
            }
            vec3 alb = mix(soil, far, smoothstep(2.5, 14.0, r));
            // dirt path
            float px = abs(vWorld.x - pathX(vWorld.z)) / pathW(vWorld.z);
            float edge = 1.0 - smoothstep(0.55 + n2 * 0.35, 1.05 + n2 * 0.3, px);
            vec3 dirt = texture2D(uDirtTex, vWorld.xz * 0.5).rgb * 0.75;
            alb = mix(alb, mix(dirt, vec3(0.2, 0.16, 0.1), smoothstep(20.0, 60.0, -vWorld.z)), edge * (vWorld.z > 0.0 ? 1.0 - smoothstep(30.0, 60.0, vWorld.z) : 1.0 - smoothstep(${(-HOME_GATE_Z + 6).toFixed(1)}, ${(-HOME_GATE_Z + 34).toFixed(1)}, -vWorld.z)));
            float lk = lakeK(vWorld.xz);
            alb = mix(alb, vec3(0.05, 0.05, 0.04), 1.0 - smoothstep(1.0, 1.25, lk));
            float sh = deskShadow(vWorld);
            vec3 col = alb * (uSkyCol * 0.62 + uKeyCol * (0.25 + 0.75 * max(uKeyDir.y, 0.0)) * sh * smoothstep(-0.02, 0.08, uKeyDir.y));
            float dist = length(vWorld - cameraPosition);
            vec3 fd = normalize(vec3(vWorld.x - cameraPosition.x, 0.015, vWorld.z - cameraPosition.z));
            col = mix(col, skyBase(fd), 1.0 - exp(-dist * (uFog + uMist)));
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

export type Range = { r0: number; r1: number; height: number; freq: number; seed: number; haze: number; snow: number; gap: [number, number] };

export function rangeGeometry(rg: Range, segA: number, segR: number) {
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
      // the hills part where the road runs out (toward -z); the last range opens wide onto the sea
      const dA = Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)));
      const gk = Math.min(1, Math.max(0, (dA - rg.gap[0]) / (rg.gap[1] - rg.gap[0])));
      pos.push(x, rg.height * h * broad * env * gk * gk * (3 - 2 * gk) - 5, z);
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

export function makeRangeMaterial(rg: { haze: number; snow: number; height: number; forest?: [number, number, number]; rock?: [number, number, number] }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SKY_U,
      uHaze: { value: rg.haze },
      uSnow: { value: rg.snow },
      uTop: { value: rg.height },
      uForestK: { value: new THREE.Color(...(rg.forest ?? [1, 1, 1])) },
      uRockK: { value: new THREE.Color(...(rg.rock ?? [1, 1, 1])) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uHaze; uniform float uSnow; uniform float uTop; uniform vec3 uForestK; uniform vec3 uRockK;
      varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        vec3 n = normalize(vN);
        float hN = clamp(vWorld.y / uTop, 0.0, 1.0);
        float strata = vnoise(vec2(vWorld.y * 0.35, vWorld.x * 0.01));
        vec3 forest = mix(vec3(0.045, 0.075, 0.04), vec3(0.1, 0.105, 0.045), vnoise(vWorld.xz * 0.02)) * uForestK;
        vec3 rock = mix(vec3(0.1, 0.1, 0.105), vec3(0.16, 0.145, 0.13), strata) * uRockK;
        vec3 alb = mix(forest, rock, smoothstep(0.12, 0.45, hN + (1.0 - n.y) * 0.35));
        float sn = uSnow * smoothstep(0.32, 0.5, hN + (vnoise(vWorld.xz * 0.08) - 0.5) * 0.22) * smoothstep(0.35, 0.7, n.y);
        alb = mix(alb, vec3(0.86, 0.89, 0.94), sn);
        float ndl = clamp(dot(n, uKeyDir) * 0.7 + 0.3, 0.0, 1.0);
        vec3 col = alb * (uSkyCol * (0.6 + 0.4 * n.y) + uKeyCol * ndl * 0.95);
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 air = skyBase(normalize(vec3(d.x, max(d.y, 0.0) * 0.6 + 0.01, d.z)));
        float haze = clamp(uHaze + (1.0 - smoothstep(0.0, uTop * 0.55, vWorld.y)) * 0.34, 0.0, 0.95);
        // the arrival mist (and the veil at a gate) lies between the eye and the ridge like any other air:
        // a ridge is never darker than the trees standing in front of it
        col = mix(col, air, max(haze, 1.0 - exp(-length(vWorld - cameraPosition) * uMist)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function Mountains({ mobile }: { mobile: boolean }) {
  const layers = useMemo(() => {
    const ranges: Range[] = [
      // layered like his hills: each ridge paler than the one before it
      { r0: 152, r1: 222, height: 24, freq: 0.017, seed: 3.1, haze: 0.2, snow: 0, gap: [0.2, 0.5] },
      { r0: 250, r1: 380, height: 62, freq: 0.0105, seed: 11.7, haze: 0.4, snow: 0.3, gap: [0.15, 0.4] },
      { r0: 460, r1: 690, height: 150, freq: 0.006, seed: 27.3, haze: 0.56, snow: 0.9, gap: [0.1, 0.34] },
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

// ---------- mist ----------

// Bands of low mist lying across the land, one behind another: the bases of
// the trees and hills dissolve into them and every layer reads as a separate
// plane of depth. Soft quads, coloured by the sky, thinning as you fly in.
export function MistBands({ mobile = false }: { mobile?: boolean }) {
  const { geo, mat, bands } = useMemo(() => {
    const r = rng(404);
    const bands: { x: number; y: number; z: number; w: number; h: number; ry: number; seed: number }[] = [];
    const n = mobile ? 9 : 16;
    for (let i = 0; i < n; i++) {
      const z = -46 - i * (500 / n) - r() * 12;
      bands.push({ x: (r() - 0.5) * 120, y: 0, z, w: 220 + r() * 220, h: 9 + r() * 9, ry: (r() - 0.5) * 0.25, seed: r() * 50 });
    }
    // and to the sides of the desk
    bands.push({ x: -70, y: 0, z: -8, w: 200, h: 8, ry: 1.2, seed: 3 }, { x: 78, y: 0, z: 6, w: 200, h: 8, ry: -1.25, seed: 9 }, { x: 0, y: 0, z: 74, w: 260, h: 9, ry: 0, seed: 14 });
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, uSeed: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld;
        void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform float uSeed;
        varying vec2 vUv; varying vec3 vWorld;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        void main(){
          float n = fbm(vec2(vUv.x * 5.0 + uSeed + uTime * 0.012, vUv.y * 1.4 + uSeed));
          float a = smoothstep(0.0, 0.14, vUv.y) * pow(1.0 - vUv.y, 1.7) * 2.2;
          a *= smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x) * smoothstep(0.25, 0.75, n);
          float dist = length(vWorld - cameraPosition);
          a *= smoothstep(14.0, 60.0, dist) * 0.34;
          vec3 d = normalize(vWorld - cameraPosition);
          vec3 col = skyBase(normalize(vec3(d.x, 0.03, d.z))) * 1.06 + uGlow * pow(max(dot(d, uSunDir), 0.0), 6.0) * 0.25 * smoothstep(-0.05, 0.05, uSunDir.y);
          gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), mat: m, bands };
  }, [mobile]);
  const mats = useMemo(() => bands.map((b) => {
    const c = mat.clone();
    Object.assign(c.uniforms, SKY_U);
    c.uniforms.uSeed = { value: b.seed };
    return c;
  }), [bands, mat]);
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
    mats.forEach((m) => m.dispose());
  }, [geo, mat, mats]);
  return (
    <>
      {bands.map((b, i) => (
        <mesh key={i} geometry={geo} material={mats[i]} position={[b.x, b.y, b.z]} rotation={[0, b.ry, 0]} scale={[b.w, b.h, 1]} renderOrder={3} frustumCulled={false} />
      ))}
    </>
  );
}

// ---------- lake ----------

// Still water: the sky reflected with fresnel, the tree line and the ridges mirrored in it, soft ripples, a sun or moon glint.
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
          const vec2 LAKE_C = vec2(${LAKE.x.toFixed(1)}, ${LAKE.z.toFixed(1)});
          const vec2 LAKE_R = vec2(${LAKE.rx.toFixed(1)}, ${LAKE.rz.toFixed(1)});
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
            // The wood behind the far shore and the ridges beyond it stand in the water too: dark, hazed
            // by the air between, their edges loosened by the ripples. Where the mirrored ray leaves the
            // lake it meets the tree line a little way back (north and west the wood comes down to the
            // water; toward the desk it is far off across the meadow), and above that the hills.
            vec2 rd = normalize(r.xz + vec2(1e-5));
            float tanEl = r.y / max(length(r.xz), 1e-3);
            vec2 lp = (vWorld.xz - LAKE_C) / LAKE_R;
            vec2 ld = rd / LAKE_R;
            float qa = dot(ld, ld), qb = dot(lp, ld), qc = dot(lp, lp) - 1.0;
            float water = max((-qb + sqrt(max(qb * qb - qa * qc, 0.0))) / qa, 0.0);
            float D = water + mix(9.0, 75.0, smoothstep(-0.15, 0.55, rd.y));
            vec2 hit = vWorld.xz + rd * D;
            // stands of single trees, as they are on the land: a crown on a bare stem, sky between them
            float along = hit.x * 0.42 + hit.y * 0.19;
            float stand = smoothstep(0.28, 0.5, vnoise(hit * 0.075 + 3.7));
            float tree = smoothstep(0.4, 0.62, vnoise(vec2(along, 7.3))) * stand;
            float top = 9.0 + 6.0 * vnoise(vec2(along * 0.6, 1.7));
            float up = tanEl * D;
            float crown = smoothstep(top * 0.36, top * 0.52, up) * (1.0 - smoothstep(top * 0.86, top * 1.06, up));
            float stem = (1.0 - smoothstep(top * 0.36, top * 0.52, up)) * smoothstep(0.7, 0.86, vnoise(vec2(along * 3.4, 2.0)));
            float wood = tree * clamp(crown + stem * 0.45, 0.0, 1.0);
            float ridge = 0.05 + 0.15 * fbm(vec2(atan(rd.x, -rd.y) * 2.6 + 11.0, 0.5));
            float hill = 1.0 - smoothstep(ridge * 0.9, ridge * 1.1, tanEl);
            vec3 airC = skyBase(normalize(vec3(rd.x, 0.02, rd.y)));
            vec3 hillC = mix(vec3(0.07, 0.085, 0.09) * (uSkyCol * 1.5 + uKeyCol * 0.4), airC, 0.62);
            vec3 woodC = mix(vec3(0.035, 0.06, 0.04) * (uSkyCol * 1.6 + uKeyCol * 0.35), airC, clamp(1.0 - exp(-D * 0.012), 0.0, 0.7));
            // long slivers of sky lie across the mirror where the ripples tilt
            float sliver = smoothstep(0.52, 0.8, vnoise(vec2(q.x * 0.16 + uTime * 0.04, q.y * 2.6 - uTime * 0.02)));
            vec3 mirror = mix(mix(sky, hillC, hill * 0.8), woodC, wood * 0.8);
            sky = mix(mirror, sky, sliver * 0.45);
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
            col = mix(col, skyBase(fd), 1.0 - exp(-dist * (uFog + uMist)));
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
