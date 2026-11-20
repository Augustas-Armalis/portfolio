"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GEIST, geistReady } from "../font";
import { POST_U } from "../Post";
import { WorldGrass } from "../Grass";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_AIR, Kit, WORLD_U, angel, haloGeometry, makeCanvasMaterial, makeHaloMaterial, makePoints, makePuffMaterial, makeTempera, makeTerrainMaterial, pointsGeometry, puffGeometry, rng, terrainGeometry, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { WORLDS, WORLD_ORDER, gateOf, groundAt, pathOf, voyage, type WorldDef, type WorldId } from "./voyage";

// What every world shares: its ground and grass, the path of light with its
// waymarks and angels, the gate onward, and the paintings standing in their
// gallery of light.

export type WorldProps = { mobile: boolean; effects: number; trees: number; far: number; grass: number; reduced: boolean };

// dispose whatever a useMemo built when it is replaced or the world is let go
export function useDisposable<T>(make: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const v = useMemo(make, deps);
  useEffect(
    () => () => {
      const walk = (x: unknown, depth: number) => {
        if (!x || depth > 3) return;
        if (x instanceof THREE.BufferGeometry || x instanceof THREE.Material || x instanceof THREE.Texture) x.dispose();
        else if (x instanceof THREE.InstancedMesh) {
          x.geometry.dispose();
          x.dispose();
        } else if (Array.isArray(x)) x.forEach((y) => walk(y, depth + 1));
        else if (typeof x === "object" && (x as { dispose?: unknown }).dispose && typeof (x as { dispose: unknown }).dispose === "function" && !(x instanceof THREE.Object3D)) (x as { dispose: () => void }).dispose();
        else if (typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype) Object.values(x as object).forEach((y) => walk(y, depth + 1));
      };
      walk(v, 0);
    },
    [v],
  );
  return v;
}

// ---------- ground ----------
export function Ground({ def, pal, mobile, size = 2400 }: { def: WorldDef; pal: GroundPalette; mobile: boolean; size?: number }) {
  const b = useDisposable(() => ({ geo: terrainGeometry(def.terrain!, size, mobile ? 150 : 250), mat: makeTerrainMaterial(def, pal) }), [def, mobile]);
  return <mesh geometry={b.geo} material={b.mat} renderOrder={-5} />;
}

// ---------- the path of light ----------
// A ribbon of light hanging in the air at the height the plane keeps, with a
// slow pulse running along it toward the gate; at intervals a lantern of
// light trailing a thread, and now and then an angel standing by to show the way.
function ribbonGeometry(pts: THREE.Vector3[], width: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  const side = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    tan.subVectors(b, a).normalize();
    side.set(-tan.z, 0, tan.x).normalize();
    if (i > 0) run += pts[i].distanceTo(pts[i - 1]);
    const p = pts[i];
    pos.push(p.x - side.x * width, p.y - 0.75, p.z - side.z * width, p.x + side.x * width, p.y - 0.75, p.z + side.z * width);
    uv.push(run, -1, run, 1);
    if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geo: g, len: run };
}

// Each world's way is drawn for that world, all of them light and none of them a hard line:
//   0  a ribbon of light with a slow pulse walking along it (the wood, the suns, the mountain gate, the kings)
//   1  a river of small stars, drifting toward the gate and twinkling (Sonata of the Stars)
//   2  a path of flowers: soft petals of light strewn along it, in the colours of the meadow (Fairy Tale, Paradise)
//   3  a causeway of light on the water: broken glints that travel like the sun's road on a sea (Rex, Tranquility)
const PATH_STYLE: Partial<Record<WorldId, 0 | 1 | 2 | 3>> = { stars: 1, fairy: 2, paradise: 2, rex: 3, sea: 3 };
const PATH_WIDTH = [0.9, 1.7, 1.5, 1.3];

export function LightPath({ id, def, tint = [1, 0.9, 0.68], gain = 1, angels = true, marks = true, effects = 1, from = 0 }: { id: WorldId; def: WorldDef; tint?: V3; gain?: number; angels?: boolean; marks?: boolean; effects?: number; from?: number }) {
  const b = useDisposable(() => {
    const path = pathOf(id);
    const pts = path.pts.slice(Math.round(from / 4));
    const style = PATH_STYLE[id] ?? 0;
    const { geo, len } = ribbonGeometry(pts, PATH_WIDTH[style]);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) }, uGain: { value: gain }, uLen: { value: len }, uStyle: { value: style }, uWide: { value: PATH_WIDTH[style] / 0.9 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld;
        void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform float uGain; uniform float uLen; uniform float uStyle; uniform float uWide;
        varying vec2 vUv; varying vec3 vWorld;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          // (a wider way keeps the same fine thread down its middle)
          float y = vUv.y * uWide;
          float across = exp(-vUv.y * vUv.y * 3.4);
          float core = exp(-y * y * 40.0);
          // a slow pulse walking toward the gate, and a fine grain of sparks
          float wave = 0.5 + 0.5 * sin(vUv.x * 0.21 - uTime * 1.35);
          wave = wave * wave;
          float grain = vnoise(vec2(vUv.x * 2.3 - uTime * 0.8, vUv.y * 3.0));
          float a = across * (0.05 + 0.13 * wave) + core * (0.11 + 0.3 * wave) * (0.5 + 0.9 * grain);
          vec3 extra = vec3(0.0);
          float edge = 1.0 - smoothstep(0.6, 1.0, abs(vUv.y));
          if (uStyle > 0.5 && uStyle < 1.5) {
            // a river of stars: one to a cell, each with its own place, size and twinkle, all drifting on
            vec2 g = vec2(vUv.x * 1.25 - uTime * 0.45, vUv.y * 4.0);
            vec2 c = floor(g);
            float h = hash12(c);
            vec2 o = (vec2(hash12(c + 3.1), hash12(c + 7.7)) - 0.5) * 0.62;
            float d = length(fract(g) - 0.5 - o);
            float tw = 0.45 + 0.55 * sin(uTime * (1.2 + 2.6 * h) + h * 40.0);
            float star = step(0.42, h) * smoothstep(0.05 + 0.13 * h, 0.0, d) * tw;
            extra = mix(vec3(0.82, 0.9, 1.0), uTint, h) * star * edge * 1.5;
            a *= 0.6;
          } else if (uStyle > 1.5 && uStyle < 2.5) {
            // a path of flowers: petals of light, still, a few colours, thinning toward the edges
            vec2 g = vec2(vUv.x * 0.8, vUv.y * 3.0);
            vec2 c = floor(g);
            float h = hash12(c);
            vec2 o = (vec2(hash12(c + 1.7), hash12(c + 5.3)) - 0.5) * 0.6;
            float d = length((fract(g) - 0.5 - o) * vec2(1.0, 1.25));
            float petal = step(0.36, h) * smoothstep(0.2 + 0.1 * h, 0.03, d) * (0.75 + 0.25 * sin(uTime * 0.7 + h * 30.0));
            vec3 pc = h < 0.58 ? vec3(1.0, 0.95, 0.82) : h < 0.8 ? vec3(1.0, 0.72, 0.78) : vec3(1.0, 0.86, 0.42);
            extra = pc * petal * edge * 0.42;
            a *= 0.75;
          } else if (uStyle > 2.5) {
            // a causeway on the water: broken glints that travel, brightest down the middle
            float run = vUv.x * 1.1 - uTime * 0.55 + sin(vUv.y * 2.6 + vUv.x * 0.13) * 0.9;
            float glint = smoothstep(0.55, 1.0, sin(run)) * (0.5 + 0.5 * vnoise(vec2(vUv.x * 0.6, vUv.y * 4.0 + uTime * 0.3)));
            extra = uTint * glint * exp(-vUv.y * vUv.y * 2.4) * 0.5;
          }
          float dist = length(vWorld - cameraPosition);
          float fade = smoothstep(2.0, 16.0, dist) * (1.0 - smoothstep(240.0, 520.0, dist));
          // far off it is a thread; let it keep its light there
          fade *= 1.0 + smoothstep(30.0, 160.0, dist) * 0.8;
          fade *= smoothstep(0.0, 14.0, vUv.x) * smoothstep(uLen, uLen - 14.0, vUv.x);
          fade *= (1.0 - airAmt(vWorld) * 0.7) * exp(-dist * uMist * 1.5);
          // (the fine things on it are for the near and middle distance: far off only the thread is left)
          extra *= 1.0 - smoothstep(110.0, 260.0, dist);
          gl_FragColor = vec4((uTint * a + extra) * fade * uGain * glowK() * (1.0 + uPulse * 0.6), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    // waymarks
    const r = rng(91 + id.length * 7);
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const threads: number[] = [];
    const k = new Kit();
    const step = Math.round(46 / 4);
    const tan = new THREE.Vector3();
    let n = 0;
    for (let i = step; marks && i < pts.length - step; i += step, n++) {
      const p = pts[i];
      const lx = p.x;
      const lz = p.z;
      const g = id === "home" ? 0 : groundAt(def, lx, lz);
      halos.push({ p: [p.x, p.y - 0.75, p.z], size: 2.2, col: tint, k: 0.17 * gain });
      // a fine thread of light falling from it, gone before it reaches the ground
      const h = Math.min(p.y - 0.75 - g - 0.5, 2.4);
      if (h > 1.2) threads.push(p.x, p.y - 0.75, p.z, h);
      if (angels && n % 4 === 3 && effects > 0.25) {
        tan.subVectors(pts[i + 1], pts[i - 1]).normalize();
        const s = n % 8 === 3 ? 1 : -1;
        // in the home wood they stand at the roadside, inside the lane the trees keep clear
        const aside = id === "home" ? 4.8 : 12;
        const ax = p.x - tan.z * s * aside;
        const az = p.z + tan.x * s * aside;
        const gy = id === "home" ? 0 : groundAt(def, ax, az);
        // on open water they stand on the path itself, small and far-seen
        const onWater = def.water !== null && gy <= def.water + 0.05;
        const size = id === "home" ? 1.5 + r() * 0.3 : onWater ? 2.2 : 3.0 + r() * 0.8;
        const robes: V3[] = [
          [0.85, 0.82, 0.74],
          [0.62, 0.7, 0.82],
          [0.86, 0.68, 0.62],
          [0.66, 0.8, 0.7],
        ];
        angel(k, [ax, onWater ? p.y - 0.9 : gy - 0.1, az], size, Math.atan2(tan.z * s * 0.6 - tan.x * 0.8, -tan.x * s * 0.6 - tan.z * 0.8), robes[n % robes.length], { glow: 0.06 * gain });
        glows.push({ p: [ax, (onWater ? p.y - 0.9 : gy) + size * 1.72, az], size: size * 1.3, col: [1, 0.9, 0.7], k: 0.3 * gain });
      }
    }
    // the thread each waymark trails: a soft taper of light, added to what is behind it, faint by day
    const tp: number[] = [];
    const tu: number[] = [];
    const ti: number[] = [];
    for (let i = 0; i < threads.length; i += 4) {
      const [x, y, z, h] = threads.slice(i, i + 4);
      const b0 = tp.length / 3;
      for (const [sx, v] of [
        [-1, 0],
        [1, 0],
        [-1, 1],
        [1, 1],
      ]) {
        tp.push(x, y - v * h, z);
        tu.push(sx, v);
      }
      ti.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
    }
    const threadGeo = new THREE.BufferGeometry();
    threadGeo.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
    threadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(tu, 2));
    threadGeo.setIndex(ti);
    if (tp.length) threadGeo.computeBoundingSphere();
    const threadMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) }, uGain: { value: gain } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vDist;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          // a ribbon that faces the eye, never thinner than a pixel and a half
          mv.x += uv.x * max(0.11, vDist * 0.0016);
          vUv = uv; gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform float uGain;
        varying vec2 vUv; varying float vDist;
        ${GLSL_SKY}
        void main(){
          float a = exp(-vUv.x * vUv.x * 4.0) * (1.0 - abs(vUv.x)) * (1.0 - vUv.y) * (1.0 - vUv.y) * (1.0 - vUv.y);
          a *= smoothstep(5.0, 26.0, vDist) * (1.0 - smoothstep(70.0, 190.0, vDist)) * mix(0.14, 0.2, uNight) * exp(-vDist * uMist * 1.5);
          gl_FragColor = vec4(uTint * a * uGain, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo, mat, threadGeo: tp.length ? threadGeo : null, threadMat, halos: haloGeometry(halos), haloMat: makeHaloMaterial(0), glows: glows.length ? haloGeometry(glows) : null, glowMat: makeHaloMaterial(2), marks: k.parts.length ? k.build() : null, tempera: makeTempera({ amb: 0.9, key: 0.3 }) };
  }, [id, effects > 0.25]);
  return (
    <>
      <mesh geometry={b.geo} material={b.mat} renderOrder={4} />
      {marks && <mesh geometry={b.halos} material={b.haloMat} renderOrder={6} />}
      {b.glows && <mesh geometry={b.glows} material={b.glowMat} renderOrder={6} />}
      {b.marks && <mesh geometry={b.marks} material={b.tempera} />}
      {marks && b.threadGeo && <mesh geometry={b.threadGeo} material={b.threadMat} renderOrder={5} />}
    </>
  );
}

// ---------- the gate ----------
// A tall lancet of pale light standing on the path, a slow veil of mist and
// light inside it: the brightest thing in its world, so the eye always knows
// the way on.
export function LightGate({ id, def, tint = [1, 0.88, 0.62], gain = 1, half = 15, rise = 23 }: { id: WorldId; def: WorldDef; tint?: V3; gain?: number; half?: number; rise?: number }) {
  const b = useDisposable(() => {
    const gate = gateOf(id)!;
    const c = Math.cos(gate.yaw);
    const s = Math.sin(gate.yaw);
    const at = (u: number, y: number): V3 => [gate.pos.x + c * u, y, gate.pos.z - s * u];
    const g0 = id === "home" ? 0 : Math.min(groundAt(def, at(-half, 0)[0], at(-half, 0)[2]), groundAt(def, at(half, 0)[0], at(half, 0)[2]));
    const foot = Math.min(g0, def.water ?? g0) - 1.5;
    const top = gate.pos.y + rise;
    const spring = gate.pos.y + 2;
    const k = new Kit();
    // the lancet: two long legs leaning a breath inward, meeting in a point
    const leg = (side: number): V3[] => {
      const pts: V3[] = [at(side * (half + 0.9), foot), at(side * half, spring - 8), at(side * half, spring)];
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        // a pointed arch: each side is an arc struck from the far springing
        const a = (t * Math.PI) / 3;
        pts.push(at(side * (half - 2 * half * (1 - Math.cos(a))), spring + 2 * half * Math.sin(a) * ((top - spring) / (half * 1.732))));
      }
      return pts;
    };
    const stone: V3 = [0.78 * tint[0], 0.74 * tint[1], 0.66 * tint[2]];
    for (const side of [-1, 1]) {
      k.tube(leg(side), 0.42, stone, { glow: 0.5 * gain, seg: 60, sides: 7 });
      // a thread of brighter light on the inner edge
      k.tube(
        leg(side).map((p, i): V3 => (i === 0 ? p : [p[0] - c * side * 0.5, p[1] - (i > 2 ? 0.3 : 0), p[2] + s * side * 0.5])),
        0.09,
        tint,
        { glow: 2.6 * gain, seg: 60, sides: 4 },
      );
    }
    // the veil inside
    const shape = new THREE.Shape();
    shape.moveTo(-half, foot - gate.pos.y);
    shape.lineTo(-half, spring - gate.pos.y);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const a = (t * Math.PI) / 3;
      shape.lineTo(-half + 2 * half * (1 - Math.cos(a)), spring - gate.pos.y + 2 * half * Math.sin(a) * ((top - spring) / (half * 1.732)));
    }
    for (let i = 11; i >= 0; i--) {
      const t = i / 12;
      const a = (t * Math.PI) / 3;
      shape.lineTo(half - 2 * half * (1 - Math.cos(a)), spring - gate.pos.y + 2 * half * Math.sin(a) * ((top - spring) / (half * 1.732)));
    }
    shape.lineTo(half, foot - gate.pos.y);
    const veilGeo = new THREE.ShapeGeometry(shape, 8);
    // The threshold itself: a breathing sheet of light you can half see through, and through it, warped as if by
    // water or old glass, a glimpse of the next world's own sky (its horizon, its zenith, the glow of its light).
    // When the plane goes through, a ripple runs out from where it crossed and the light flares (uHit).
    const nextId = WORLD_ORDER[WORLD_ORDER.indexOf(id) + 1];
    const na = nextId ? WORLDS[nextId].air : null;
    const nZen = na ? na.zenith : ([0.3, 0.42, 0.62] as V3);
    const nHor = na ? na.horizon : ([0.8, 0.72, 0.6] as V3);
    const nGlow = na ? na.glow : ([1, 0.8, 0.5] as V3);
    const veil = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        ...SKY_U,
        ...WORLD_U,
        uTint: { value: new THREE.Color(...tint) },
        uGain: { value: gain },
        uSpan: { value: new THREE.Vector3(half, foot - gate.pos.y, top - gate.pos.y) },
        uNZen: { value: new THREE.Color(...nZen) },
        uNHor: { value: new THREE.Color(...nHor) },
        uNGlow: { value: new THREE.Color(...nGlow) },
        uHit: { value: 99 },
        uHitP: { value: new THREE.Vector2(0, 0) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vLocal; varying vec3 vWorld;
        void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform float uGain; uniform vec3 uSpan;
        uniform vec3 uNZen; uniform vec3 uNHor; uniform vec3 uNGlow; uniform float uHit; uniform vec2 uHitP;
        varying vec3 vLocal; varying vec3 vWorld;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          vec2 p = vLocal.xy;
          float t = uTime;
          // the slow breath of the whole gate
          float breath = 0.86 + 0.14 * sin(t * 0.7) + 0.05 * sin(t * 1.9 + 1.3);
          // refraction: the glimpse is seen through moving glass
          vec2 w = p + (vec2(fbm(p * 0.07 + vec2(t * 0.04, 0.0)), fbm(p * 0.07 + vec2(5.2, -t * 0.035))) - 0.5) * 7.0;
          // the ripple from where the plane went through
          float age = uHit;
          vec2 dh = p - uHitP; float rd = length(dh);
          float ring = sin(rd * 0.55 - age * 13.0) * exp(-age * 1.3) * exp(-rd * 0.025) * step(0.0, age) * smoothstep(age * 16.0 + 6.0, age * 16.0 - 2.0, rd);
          w += (dh / max(rd, 0.001)) * ring * 3.0;
          // looking through: the next world's sky, its horizon at the plane's own height, a glow of its light up and to one side
          float hy = w.y / max(uSpan.z, 1.0);
          vec3 glimpse = mix(uNHor, uNZen, smoothstep(-0.05, 0.95, hy));
          // and its land: a far line of hills under that sky
          float hill = (fbm(vec2(w.x * 0.035 + 3.0, 1.0)) - 0.5) * 0.22 + 0.02;
          glimpse = mix(glimpse, uNHor * 0.42 + uNZen * 0.12, smoothstep(hill + 0.01, hill - 0.02, hy));
          glimpse += uNGlow * (exp(-length(w - vec2(uSpan.x * 0.28, uSpan.z * 0.3)) * 0.12) * 0.9 + exp(-abs(hy - 0.0) * 9.0) * 0.18);
          // the glass: caustic threads of brighter light moving through it
          float n = fbm(vec2(w.x * 0.09 + t * 0.02, w.y * 0.05 - t * 0.05)) * 0.7 + fbm(w * 0.22 + vec2(-t * 0.03, t * 0.02)) * 0.3;
          float caustic = pow(1.0 - abs(sin((n * 3.0 + w.y * 0.02) * 6.2832)), 22.0);
          // brightest at the plane's own height, thinning up into the point and down into the mist
          float up = smoothstep(uSpan.z, 0.0, p.y);
          float down = smoothstep(uSpan.y, min(uSpan.y * 0.2, -4.0), p.y);
          float side = 1.0 - smoothstep(0.55, 1.0, abs(p.x) / uSpan.x) * 0.5;
          // the rim of the sheet, where it meets the arch, is brightest
          float rim = smoothstep(0.7, 1.0, abs(p.x) / uSpan.x) + smoothstep(uSpan.z * 0.7, uSpan.z, p.y);
          float flare = exp(-max(age, 0.0) * 2.2) * step(0.0, age);
          vec3 col = mix(glimpse * 0.95, uTint * 0.9 * glowK(), 0.08 + 0.1 * n) + uTint * (caustic * 0.25 + rim * 0.8) * glowK();
          col *= uGain * breath * (1.0 + flare * 2.6 + abs(ring) * 1.2);
          float a = (0.6 + 0.15 * smoothstep(0.25, 0.75, n) + caustic * 0.1 + rim * 0.3) * up * (0.4 + 0.6 * down) * side;
          float dist = length(vWorld - cameraPosition);
          gl_FragColor = vec4(col * (1.0 + uPulse * 0.4), clamp(a * 0.9 + flare * 0.3, 0.0, 0.94) * smoothstep(0.5, 6.0, dist) * exp(-dist * uMist * 1.5));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    // light drifting round the gate: motes rising along its legs and hanging in the air before it
    const motes = pointsGeometry(
      140,
      (i, q) => {
        const u = (q() - 0.5) * half * 3.2;
        const y = foot + q() * (top - foot + 8);
        const w = (q() - 0.5) * 14;
        return [gate.pos.x + c * u + s * w, y, gate.pos.z - s * u + c * w, 0.5 + q() * 1.4];
      },
      31,
    );
    const halos: Halo[] = [{ p: [gate.pos.x, top + 0.6, gate.pos.z], size: 6, col: tint, k: 0.7 * gain }];
    const glow: Halo[] = [{ p: [gate.pos.x, gate.pos.y + 2, gate.pos.z], size: 60, col: tint, k: 0.3 * gain }];
    const puffs: Puff[] = [];
    const r = rng(17);
    for (let i = 0; i < 7; i++) puffs.push({ p: at((r() - 0.5) * half * 3.4, Math.max(foot + 3, gate.pos.y - 12) + r() * 5), size: 16 + r() * 16, a: 0.8 });
    return {
      arch: k.build(),
      tempera: makeTempera({ amb: 0.9, key: 0.3, rim: tint, rimPow: 3 }),
      veilGeo,
      veil,
      halos: haloGeometry(halos),
      haloMat: makeHaloMaterial(0),
      glow: haloGeometry(glow),
      glowMat: makeHaloMaterial(2),
      puffs: puffGeometry(puffs),
      puffMat: makePuffMaterial(),
      motes,
      moteMat: makePoints({ a: tint, b: [1, 0.96, 0.86], scale: 140, drift: 2.2, gain: 1.1, max: 16 }),
      pos: gate.pos.toArray() as V3,
      yaw: gate.yaw,
    };
  }, [id]);
  // the moment of going through: a ripple from where the plane crossed, and a flare of light
  useFrame(() => {
    const h = voyage.gateHit;
    const u = b.veil.uniforms;
    if (h && h.world === id) {
      u.uHit.value = (performance.now() - h.at) / 1000;
      (u.uHitP.value as THREE.Vector2).set(h.side, h.up);
    } else u.uHit.value = 99;
  });
  return (
    <>
      <mesh geometry={b.arch} material={b.tempera} />
      <points geometry={b.motes} material={b.moteMat} />
      <mesh geometry={b.puffs} material={b.puffMat} renderOrder={3} />
      <mesh geometry={b.veilGeo} material={b.veil} position={b.pos} rotation={[0, b.yaw, 0]} renderOrder={5} />
      <mesh geometry={b.glow} material={b.glowMat} renderOrder={6} />
      <mesh geometry={b.halos} material={b.haloMat} renderOrder={6} />
    </>
  );
}

// ---------- mist ----------
export function Mist({ puffs }: { puffs: Puff[] }) {
  const b = useDisposable(() => ({ geo: puffGeometry(puffs), mat: makePuffMaterial() }), [puffs]);
  return <mesh geometry={b.geo} material={b.mat} renderOrder={3} />;
}
export function Halos({ list, kind = 0 }: { list: Halo[]; kind?: 0 | 1 | 2 | 3 }) {
  const b = useDisposable(() => ({ geo: haloGeometry(list), mat: makeHaloMaterial(kind) }), [list, kind]);
  return <mesh geometry={b.geo} material={b.mat} renderOrder={6} />;
}

// ---------- the paintings ----------
export type PaintingInfo = { id: string; file: string; title: string; width: number; height: number };
let paintingsP: Promise<PaintingInfo[]> | null = null;
export function loadPaintings() {
  return (paintingsP ??= fetch("/assets/ciurlionis/paintings.json")
    .then((r) => r.json() as Promise<PaintingInfo[]>)
    .catch(() => {
      paintingsP = null;
      return [];
    }));
}
// a canvas that arrives later than the code finds its world by its name
const WORLD_OF: [RegExp, WorldId][] = [
  [/^sun/, "sun"],
  [/^stars|^pyramid/, "stars"],
  [/^rex/, "rex"],
  [/^fairy/, "fairy"],
  [/^paradise|^angel|^spring/, "paradise"],
  [/^offering/, "gate"],
  [/^sea|^tranquil/, "sea"],
  [/^kings/, "kings"],
];
const worldOfPainting = (id: string) => WORLD_OF.find(([re]) => re.test(id))?.[1] ?? null;

// The label: title, painter, year, set small in Geist. Dark ink on a pale wall, pale on a dark one.
// (`line`: the whole label as one larger line, "Title, year", for a picture hung without a wall)
function captionTexture(title: string, year: string, ink: "dark" | "light", line = false) {
  const c = document.createElement("canvas");
  c.width = 1536;
  c.height = line ? 236 : 384;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const rgb = ink === "dark" ? "34,28,22" : "255,250,238";
  const draw = () => {
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.textBaseline = "alphabetic";
    const spaced = g as unknown as { letterSpacing: string };
    g.fillStyle = `rgba(${rgb},0.94)`;
    if (line) {
      const text = year ? `${title}, ${year}` : title;
      let size = 156;
      do {
        g.font = `500 ${size}px ${GEIST}`;
        spaced.letterSpacing = `${(-size * 0.022).toFixed(1)}px`;
        size -= 4;
      } while (g.measureText(text).width > c.width - 24 && size > 60);
      g.textAlign = "center";
      g.fillText(text, c.width / 2, 164);
      tex.needsUpdate = true;
      return;
    }
    // a long title steps down a size rather than running off the wall
    let size = 104;
    do {
      g.font = `500 ${size}px ${GEIST}`;
      spaced.letterSpacing = `${(-size * 0.03).toFixed(1)}px`;
      size -= 4;
    } while (g.measureText(title).width > c.width - 16 && size > 52);
    g.fillText(title, 6, 112);
    g.font = `400 68px ${GEIST}`;
    spaced.letterSpacing = "-0.6px";
    g.fillStyle = `rgba(${rgb},0.8)`;
    g.fillText("M. K. Čiurlionis", 6, 222);
    g.fillStyle = `rgba(${rgb},0.6)`;
    if (year) g.fillText(year, 6, 318);
    tex.needsUpdate = true;
  };
  draw();
  void geistReady().then(draw);
  return tex;
}

// The light a painting stands in: a soft wash down the wall from a lamp held
// out above the frame, and the pool it leaves on the floor. Added to what is
// there, and never over the canvas itself, which keeps its own colours.
function makePoolMaterial(kind: "wall" | "floor", size: [number, number], hole: [number, number, number, number]) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -40,
    uniforms: { ...SKY_U, ...WORLD_U, uLinearOut: POST_U.uLinearOut, uSize: { value: new THREE.Vector2(...size) }, uHole: { value: new THREE.Vector4(...hole) } },
    vertexShader: /* glsl */ `
      varying vec2 vP; varying vec3 vWorld;
      uniform vec2 uSize;
      void main(){ vP = uv * uSize - vec2(uSize.x * 0.5, 0.0); vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uSize; uniform vec4 uHole; uniform float uLinearOut;
      varying vec2 vP; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float a;
        ${
          kind === "wall"
            ? `// uHole: the canvas (x half-width, y0, y1), w: the lamp's height
               float dx = vP.x / (uHole.x * 1.5);
               float below = max(uHole.w - vP.y, 0.0);
               float above = max(vP.y - uHole.w, 0.0);
               a = exp(-dx * dx * (1.0 + below * 0.012)) * exp(-below / (uHole.w * 0.62)) * exp(-above * above * 0.22);
               a *= smoothstep(0.5, 0.36, abs(vP.x) / uSize.x) * smoothstep(0.0, 0.08, vP.y / uSize.y);
               // the canvas itself is left alone
               a *= 1.0 - step(abs(vP.x), uHole.x) * step(uHole.y, vP.y) * step(vP.y, uHole.z);`
            : `vec2 q = vec2(vP.x / (uSize.x * 0.42), (vP.y - uSize.y * 0.16) / (uSize.y * 0.6));
               a = exp(-dot(q, q) * 2.2) * 0.62 * smoothstep(0.5, 0.3, abs(vP.x) / uSize.x) * smoothstep(1.0, 0.7, vP.y / uSize.y);`
        }
        float dist = length(vWorld - cameraPosition);
        // by day a breath of warmth, at night a lamp
        // (without the lens the light is added after the tone curve, where a little goes a long way)
        float k = mix(0.36, 0.3, uNight) * mix(0.3, 1.0, uLinearOut) * (1.0 - 0.7 * airAmt(vWorld)) * exp(-dist * uMist * 1.5);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.64) * a * k, 0.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// How each world hangs its painting: the stone of the wall (it is lit by that
// world's own sky, so it belongs there) and the ink of the label.
const HANG: Record<WorldId, { wall: V3; ink: "dark" | "light"; plain?: boolean }> = {
  home: { wall: [0.6, 0.58, 0.54], ink: "dark" },
  sun: { wall: [0.62, 0.64, 0.68], ink: "dark" },
  stars: { wall: [0.2, 0.19, 0.25], ink: "light" },
  rex: { wall: [0.3, 0.25, 0.22], ink: "light" },
  fairy: { wall: [1.0, 0.8, 0.56], ink: "dark" },
  paradise: { wall: [0.86, 0.78, 0.5], ink: "dark" },
  gate: { wall: [0.3, 0.26, 0.26], ink: "light" },
  sea: { wall: [0.28, 0.28, 0.22], ink: "light" },
  kings: { wall: [0.2, 0.26, 0.27], ink: "light", plain: true },
};

const CANVAS_H = 18;
// a picture hung in the dark is given more of its lamp
const lit = (m: THREE.ShaderMaterial, k: number) => {
  m.uniforms.uLit.value = k;
  return m;
};
function CanvasStand({ p, x, z, y, yaw, world, lift }: { p: PaintingInfo; x: number; z: number; y: number; yaw: number; world: WorldId; lift: number }) {
  const aspect = p.width / p.height;
  const H = aspect > 1.25 ? CANVAS_H * 0.84 : CANVAS_H;
  const W = H * aspect;
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(p.title);
  // "English name (Lithuanian name, 1909)": the label carries his own title
  const lt = /\(([^()]+?),\s*(\d{4})\)\s*$/.exec(p.title);
  const title = lt ? lt[1] : m ? m[1] : p.title;
  const year = lt ? lt[2] : m ? m[2] : "";
  const b = useDisposable(() => {
    const state = { loaded: false };
    const map = new THREE.TextureLoader().load(p.file, () => (state.loaded = true));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const k = new Kit();
    const hang = HANG[world];
    const wall = hang.wall;
    // In the kings' wood there is no wall: the picture stands in a plain dark frame on two posts, a slim lamp
    // over it, its name beneath in one line.
    if (hang.plain) {
      const dk: V3 = [0.075, 0.058, 0.048];
      const B = 0.62;
      const cy = lift + H / 2;
      for (const sy of [-1, 1]) k.box(W + B * 2, B, 0.7, [0, cy + sy * (H / 2 + B / 2), 0.1], dk, { glow: 0.12 });
      for (const sx of [-1, 1]) k.box(B, H, 0.7, [sx * (W / 2 + B / 2), cy, 0.1], dk, { glow: 0.12 });
      // a hair of dull gold against the canvas, so the dark picture has an edge in the dark
      for (const sy of [-1, 1]) k.box(W + 0.12, 0.06, 0.1, [0, cy + sy * (H / 2 + 0.03), 0.42], [0.5, 0.34, 0.14], { glow: 0.1 });
      for (const sx of [-1, 1]) k.box(0.06, H + 0.12, 0.1, [sx * (W / 2 + 0.03), cy, 0.42], [0.5, 0.34, 0.14], { glow: 0.1 });
      k.box(W + 0.3, H + 0.3, 0.3, [0, cy, -0.1], [0.02, 0.018, 0.016]);
      for (const sx of [-1, 1]) k.box(0.5, lift + 8, 0.5, [sx * (W / 2 - 1.4), (lift - 8) / 2, -0.2], dk);
      const ly = cy + H / 2 + B + 1.3;
      k.box(W * 0.46, 0.1, 0.18, [0, ly, 2.1], [1, 0.86, 0.62], { glow: 0.55 });
      for (const sx of [-1, 1]) k.box(0.06, 0.06, 2.1, [sx * W * 0.16, ly + 0.06, 1.05], dk);
      const capH = (W + B * 2) * (236 / 1536);
      return {
        map,
        state,
        canvas: lit(makeCanvasMaterial(map), 1.7),
        cap: captionTexture(title, year, hang.ink, true),
        stand: k.build(),
        tempera: makeTempera({ amb: 1, key: 0.3, dab: 0.5 }),
        wallPool: null,
        floorPool: null,
        cy,
        WW: W + B * 2,
        WH: 0,
        FD: 0,
        capX: 0,
        capY: lift - B - 0.25 - capH / 2,
        capW: W + B * 2,
        capH,
      };
    }
    const mul = (c: V3, f: number): V3 => [c[0] * f, c[1] * f, c[2] * f];
    const gilt: V3 = [0.8, 0.58, 0.25];
    const mat: V3 = [0.86, 0.82, 0.72];
    const MAT = 1.15; // the mat round the canvas
    const BAR = 0.3; // the gilt moulding round the mat
    const side = 4.4; // bare wall either side of the frame
    const base = lift; // the canvas' lower edge above the floor
    const WW = W + (MAT + BAR + side) * 2;
    const WH = base + H + MAT + BAR + 5.2;
    const cy = base + H / 2;
    // the floor: one broad low step of the same stone, its foot well down in the ground
    const FD = 12;
    k.box(WW + 9, 7, FD, [0, -3.2, FD / 2 - 3.2], mul(wall, 0.8), { top: mul(wall, 0.94) });
    // the wall: a plain standing slab, a shadow gap where it meets the floor
    k.box(WW - 0.5, 0.5, 1.0, [0, 0.55, -0.7], mul(wall, 0.3));
    k.box(WW, WH - 0.8, 1.5, [0, 0.8 + (WH - 0.8) / 2, -0.75], mul(wall, 0.9), { top: wall });
    // the frame: a thin gilt moulding, a broad pale mat set back in it, a fine gilt fillet against the canvas
    const fw = W + (MAT + BAR) * 2;
    const fh = H + (MAT + BAR) * 2;
    for (const sy of [-1, 1]) {
      k.box(fw, BAR, 0.46, [0, cy + sy * (fh / 2 - BAR / 2), 0.23], gilt, { glow: 0.1, top: mul(gilt, 1.15) });
      k.box(W + 0.14, 0.07, 0.12, [0, cy + sy * (H / 2 + 0.035), 0.2], gilt, { glow: 0.14 });
    }
    for (const sx of [-1, 1]) {
      k.box(BAR, fh, 0.46, [sx * (fw / 2 - BAR / 2), cy, 0.23], gilt, { glow: 0.1 });
      k.box(0.07, H + 0.14, 0.12, [sx * (W / 2 + 0.035), cy, 0.2], gilt, { glow: 0.14 });
    }
    k.box(W + MAT * 2, H + MAT * 2, 0.16, [0, cy, 0.08], mat);
    // the lamp: a slim bar held out over the frame on two fine arms
    const ly = cy + fh / 2 + 1.5;
    k.box(W * 0.5, 0.12, 0.2, [0, ly, 1.9], [1, 0.9, 0.72], { glow: 1.1 });
    k.box(W * 0.5 + 0.3, 0.07, 0.3, [0, ly + 0.1, 1.9], mul(gilt, 0.5));
    for (const sx of [-1, 1]) k.box(0.06, 0.06, 1.9, [sx * W * 0.17, ly + 0.08, 0.95], mul(gilt, 0.5));
    return {
      map,
      state,
      canvas: makeCanvasMaterial(map),
      cap: captionTexture(title, year, hang.ink),
      stand: k.build(),
      tempera: makeTempera({ amb: 1, key: 0.34, dab: 0.5 }),
      wallPool: makePoolMaterial("wall", [WW, WH], [W / 2, base, base + H, ly]),
      floorPool: makePoolMaterial("floor", [WW + 9, FD - 2.6], [0, 0, 0, 0]),
      cy,
      WW,
      WH,
      FD,
      capX: -fw / 2 + 6,
      capY: base - (MAT + BAR) - 2.3,
      capW: 12,
      capH: 3,
    };
  }, [p.file, world, lift]);
  useFrame((_, dt) => {
    const u = b.canvas.uniforms.uShow;
    if (b.state.loaded && u.value < 1) u.value = Math.min(1, u.value + Math.min(dt, 0.1) / 0.9);
  });
  return (
    <group position={[x, y, z]} rotation={[0, yaw, 0]}>
      <mesh geometry={b.stand} material={b.tempera} />
      <mesh position={[0, b.cy, 0.2]} material={b.canvas}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh position={[b.capX, b.capY, 0.02]} renderOrder={2}>
        <planeGeometry args={[b.capW, b.capH]} />
        <meshBasicMaterial map={b.cap} transparent toneMapped={false} depthWrite={false} fog={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-80} />
      </mesh>
      {b.wallPool && (
        <mesh position={[0, b.WH / 2, 0.5]} material={b.wallPool} renderOrder={3}>
          <planeGeometry args={[b.WW, b.WH]} />
        </mesh>
      )}
      {b.floorPool && (
        <mesh position={[0, 0.32, (b.FD - 2.6) / 2 + 0.05]} rotation={[-Math.PI / 2, 0, 0]} material={b.floorPool} renderOrder={3}>
          <planeGeometry args={[b.WW + 9, b.FD - 2.6]} />
        </mesh>
      )}
    </group>
  );
}

// the floor a painting stands on clears the ground under the whole of it, so no grass comes up through the stone
function floorAt(def: WorldDef, x: number, z: number, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let h = groundAt(def, x, z);
  for (const [u, v] of [
    [-18, -3],
    [18, -3],
    [-18, 9],
    [18, 9],
    [0, 9],
  ])
    h = Math.max(h, groundAt(def, x + c * u + s * v, z - s * u + c * v));
  return Math.max(h, (def.water ?? -99) + 0.4);
}
// The canvas hangs so that its middle is level with the eye of whoever passes on the path of light.
function liftOf(def: WorldDef, x: number, z: number, yaw: number, p: PaintingInfo) {
  const H = p.width / p.height > 1.25 ? CANVAS_H * 0.84 : CANVAS_H;
  let eye = 0;
  let best = 1e9;
  for (const q of pathOf(def.id).pts) {
    const d = Math.hypot(q.x - x, q.z - z);
    if (d < best) {
      best = d;
      eye = q.y;
    }
  }
  return THREE.MathUtils.clamp(eye - 1 - floorAt(def, x, z, yaw) - H / 2, 5.6, 10.5);
}

export function Gallery({ def }: { def: WorldDef }) {
  const [list, setList] = useState<PaintingInfo[]>([]);
  useEffect(() => {
    let on = true;
    void loadPaintings().then((l) => on && setList(l));
    return () => {
      on = false;
    };
  }, []);
  const stands = useMemo(() => {
    const out: { p: PaintingInfo; x: number; z: number; yaw: number }[] = [];
    const named = new Set(def.canvases.map((c) => c.painting));
    for (const c of def.canvases) {
      const p = list.find((q) => q.id === c.painting);
      if (p) out.push({ p, x: c.x, z: c.z, yaw: c.yaw });
    }
    // late arrivals: stood in a row beside the world's own canvas, each a little further along
    const base = def.canvases[def.canvases.length - 1];
    if (base) {
      let n = 0;
      for (const p of list) {
        if (named.has(p.id) || worldOfPainting(p.id) !== def.id) continue;
        n++;
        const side = base.yaw > 0 ? -1 : 1; // away from the path
        const step = 34 * n;
        out.push({ p, x: base.x + Math.cos(base.yaw) * side * step - Math.sin(base.yaw) * 6 * n, z: base.z - Math.sin(base.yaw) * side * step - Math.cos(base.yaw) * 6 * n, yaw: base.yaw + side * -0.12 * n });
      }
    }
    return out;
  }, [list, def]);
  return (
    <>
      {stands.map((s) => (
        <CanvasStand key={s.p.id} p={s.p} x={s.x} z={s.z} y={floorAt(def, s.x, s.z, s.yaw)} yaw={s.yaw} world={def.id} lift={liftOf(def, s.x, s.z, s.yaw, s.p)} />
      ))}
    </>
  );
}

// ---------- the whole base of a world ----------
export function WorldBase({ id, def, pal, props, grass = true, tip, pathTint, pathGain, gateTint, mask, tall, groundSize, angels = true, marks = true }: { id: WorldId; def: WorldDef; pal: GroundPalette; props: WorldProps; grass?: boolean; tip?: V3; pathTint?: V3; pathGain?: number; gateTint?: V3; mask?: string; tall?: number; groundSize?: number; angels?: boolean; marks?: boolean }) {
  return (
    <>
      {def.terrain && <Ground def={def} pal={pal} mobile={props.mobile} size={groundSize} />}
      {grass && def.terrain && <WorldGrass def={def} pal={pal} tip={tip} mobile={props.mobile} density={props.grass} wind={props.reduced ? 0.25 : 1} mask={mask} tall={tall} />}
      <LightPath id={id} def={def} tint={pathTint} gain={pathGain} effects={props.effects} angels={angels} marks={marks} />
      {def.gate && <LightGate id={id} def={def} tint={gateTint ?? pathTint} gain={pathGain} />}
      <Gallery def={def} />
    </>
  );
}
