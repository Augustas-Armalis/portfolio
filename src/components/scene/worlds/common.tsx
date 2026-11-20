"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GEIST, geistReady } from "../font";
import { POST_U } from "../Post";
import { WorldGrass } from "../Grass";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_AIR, Kit, PLAY_U, WORLD_U, angel, haloGeometry, makeCanvasMaterial, makeHaloMaterial, makePoints, makePuffMaterial, makeTempera, makeTerrainMaterial, pointsGeometry, puffGeometry, rng, terrainGeometry, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { WORLDS, WORLD_ORDER, gateOf, groundAt, originOf, pathOf, voyage, type WorldDef, type WorldId } from "./voyage";

// What every world shares: its ground and grass, the path of light with its
// waymarks and angels, the gate onward, and the painting it was made from,
// floating beside the way.

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
      uniforms: { ...SKY_U, ...WORLD_U, uPathLift: PLAY_U.uPathLift, uTint: { value: new THREE.Color(...tint) }, uGain: { value: gain }, uLen: { value: len }, uStyle: { value: style }, uWide: { value: PATH_WIDTH[style] / 0.9 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld;
        void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform float uGain; uniform float uLen; uniform float uStyle; uniform float uWide; uniform float uPathLift;
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
          // (a lantern flown through lifts the whole way for a few seconds)
          gl_FragColor = vec4((uTint * a + extra) * fade * uGain * glowK() * (1.0 + uPulse * 0.6) * (1.0 + uPathLift * 1.1), 1.0);
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
// the way on. It is a threshold: the sheet inside it is a glimpse of the next
// world's own sky, and its rim, its halo and the motes round it take that
// world's light, so every gate is coloured by where it leads.
//
// `look` says how much of it is drawn (the way through is the same in every case: see passage() in Plane.tsx):
//   "arch"  the whole of it (the default)
//   "veil"  no stone, no mist at its feet: only the sheet of light, the motes and a soft glow, for a world that
//           builds its own opening (a cave mouth, a doorway) and wants the light in it; `half` and `rise` size it
//   "none"  nothing at all: the world draws its own way out
export type GateLook = "arch" | "veil" | "none";
export function LightGate({ id, def, tint = [1, 0.88, 0.62], gain = 1, half = 15, rise = 23, look = "arch" }: { id: WorldId; def: WorldDef; tint?: V3; gain?: number; half?: number; rise?: number; look?: GateLook }) {
  const b = useDisposable(() => {
    const gate = gateOf(id)!;
    const c = Math.cos(gate.yaw);
    const s = Math.sin(gate.yaw);
    const at = (u: number, y: number): V3 => [gate.pos.x + c * u, y, gate.pos.z - s * u];
    const g0 = id === "home" ? 0 : Math.min(groundAt(def, at(-half, 0)[0], at(-half, 0)[2]), groundAt(def, at(half, 0)[0], at(half, 0)[2]));
    const foot = Math.min(g0, def.water ?? g0) - 1.5;
    const top = gate.pos.y + rise;
    const spring = gate.pos.y + 2;
    // where it leads
    const nextId = WORLD_ORDER[WORLD_ORDER.indexOf(id) + 1];
    const na = nextId ? WORLDS[nextId].air : null;
    const nZen = na ? na.zenith : ([0.3, 0.42, 0.62] as V3);
    const nHor = na ? na.horizon : ([0.8, 0.72, 0.6] as V3);
    const nGlow = na ? na.glow : ([1, 0.8, 0.5] as V3);
    // the light of where it leads, kept bright (a dark world's glow is still a light here), halfway to this world's own
    const nMax = Math.max(nGlow[0], nGlow[1], nGlow[2], 0.001);
    const lead: V3 = [(tint[0] + nGlow[0] / nMax) / 2, (tint[1] + nGlow[1] / nMax) / 2, (tint[2] + nGlow[2] / nMax) / 2];
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
      // a thread of brighter light on the inner edge, in the colour of where the gate leads
      k.tube(
        leg(side).map((p, i): V3 => (i === 0 ? p : [p[0] - c * side * 0.5, p[1] - (i > 2 ? 0.3 : 0), p[2] + s * side * 0.5])),
        0.09,
        lead,
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
    const veil = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        ...SKY_U,
        ...WORLD_U,
        uTint: { value: new THREE.Color(...tint) },
        uLead: { value: new THREE.Color(...lead) },
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
        uniform vec3 uTint; uniform vec3 uLead; uniform float uGain; uniform vec3 uSpan;
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
          // (the caustic threads and the rim carry the light of the world beyond)
          vec3 col = mix(glimpse * 0.95, uTint * 0.9 * glowK(), 0.08 + 0.1 * n) + uLead * (caustic * 0.3 + rim * 0.8) * glowK();
          // a fine bright line where the sheet meets the air, so the threshold itself can be seen from far off
          float edge = smoothstep(0.93, 0.995, abs(p.x) / uSpan.x) * (1.0 - smoothstep(0.995, 1.0, abs(p.x) / uSpan.x));
          col += uLead * edge * 0.9 * glowK();
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
    const halos: Halo[] = [{ p: [gate.pos.x, top + 0.6, gate.pos.z], size: 6, col: lead, k: 0.7 * gain }];
    const glow: Halo[] = [{ p: [gate.pos.x, gate.pos.y + 2, gate.pos.z], size: look === "arch" ? 60 : half * 3, col: lead, k: (look === "arch" ? 0.3 : 0.22) * gain }];
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
      moteMat: makePoints({ a: lead, b: [1, 0.96, 0.86], scale: 140, drift: 2.2, gain: 1.1, max: 16 }),
      pos: gate.pos.toArray() as V3,
      yaw: gate.yaw,
    };
  }, [id, half, rise, look]);
  // the moment of going through: a ripple from where the plane crossed, and a flare of light
  useFrame(() => {
    const h = voyage.gateHit;
    const u = b.veil.uniforms;
    if (h && h.world === id) {
      u.uHit.value = (performance.now() - h.at) / 1000;
      (u.uHitP.value as THREE.Vector2).set(h.side, h.up);
    } else u.uHit.value = 99;
  });
  if (look === "none") return null;
  const arch = look === "arch";
  return (
    <>
      {arch && <mesh geometry={b.arch} material={b.tempera} />}
      <points geometry={b.motes} material={b.moteMat} />
      {arch && <mesh geometry={b.puffs} material={b.puffMat} renderOrder={3} />}
      <mesh geometry={b.veilGeo} material={b.veil} position={b.pos} rotation={[0, b.yaw, 0]} renderOrder={5} />
      <mesh geometry={b.glow} material={b.glowMat} renderOrder={6} />
      {arch && <mesh geometry={b.halos} material={b.haloMat} renderOrder={6} />}
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
  [/^funeral/, "funeral"],
  [/^kings/, "kings"],
];
const worldOfPainting = (id: string) => WORLD_OF.find(([re]) => re.test(id))?.[1] ?? null;

// The caption: "Title, year" in one line of Geist, with a soft halo of the opposite tone so it reads against
// whatever lies behind it (it hangs in the open air, not on a wall).
function captionTexture(title: string, year: string, ink: "dark" | "light") {
  const c = document.createElement("canvas");
  c.width = 1536;
  c.height = 236;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const rgb = ink === "dark" ? "30,24,18" : "255,251,240";
  const halo = ink === "dark" ? "rgba(255,248,230,0.55)" : "rgba(10,10,16,0.85)";
  const draw = () => {
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.textBaseline = "alphabetic";
    g.textAlign = "center";
    const spaced = g as unknown as { letterSpacing: string };
    // the title leads, the year follows it a little lighter; a long title steps down a size
    let size = 132;
    const sep = year ? "   " : "";
    do {
      g.font = `500 ${size}px ${GEIST}`;
      spaced.letterSpacing = `${(-size * 0.022).toFixed(1)}px`;
      size -= 4;
    } while (g.measureText(title + sep + year).width > c.width - 60 && size > 56);
    const wt = g.measureText(title + sep).width;
    const wy = year ? g.measureText(year).width : 0;
    const x0 = (c.width - wt - wy) / 2;
    g.textAlign = "left";
    // (the halo is laid down three times, wide to close, so the type has a soft dark ground of its own)
    for (const blur of [44, 22, 9, 0]) {
      g.shadowColor = blur ? halo : "transparent";
      g.shadowBlur = blur;
      g.shadowOffsetY = blur ? 2 : 0;
      g.fillStyle = `rgba(${rgb},0.97)`;
      g.fillText(title, x0, 156);
      if (year) {
        g.fillStyle = `rgba(${rgb},${blur ? 0.97 : 0.72})`;
        g.fillText(year, x0 + wt, 156);
      }
    }
    tex.needsUpdate = true;
  };
  draw();
  void geistReady().then(draw);
  return tex;
}

// The light a floating painting gives off: a hairline of light round its edge and a soft glow that falls away
// into the air. One quad behind the canvas, added to what is there (and never over the canvas itself, which
// keeps its own colours).
function makeAuraMaterial(size: [number, number], half: [number, number], tint: V3, gain: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    uniforms: { ...SKY_U, ...WORLD_U, uLinearOut: POST_U.uLinearOut, uSize: { value: new THREE.Vector2(...size) }, uHalf: { value: new THREE.Vector2(...half) }, uTint: { value: new THREE.Color(...tint) }, uGain: { value: gain }, uShow: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vP; varying vec3 vWorld; uniform vec2 uSize;
      void main(){ vP = (uv - 0.5) * uSize; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uSize; uniform vec2 uHalf; uniform vec3 uTint; uniform float uGain; uniform float uShow; uniform float uLinearOut;
      varying vec2 vP; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec2 q = abs(vP) - uHalf;
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        float o = max(d, 0.0);
        // the hairline: a fine thread hard against the canvas, kept at least a pixel wide however far away
        float w = max(0.07, fwidth(d) * 1.1);
        float hair = (1.0 - smoothstep(w, w * 1.8, o)) * step(0.0, d);
        // the glow: close and bright at the edge, then long and faint, breathing very slowly
        float breath = 0.9 + 0.1 * sin(uTime * 0.45 + vWorld.x * 0.05);
        float glow = (exp(-o * 1.5) * 0.5 + exp(-o * 0.38) * 0.2) * breath * step(0.0, d);
        // nothing reaches the edge of the quad
        glow *= smoothstep(0.0, 2.0, min(uSize.x * 0.5 - abs(vP.x), uSize.y * 0.5 - abs(vP.y)));
        float dist = length(vWorld - cameraPosition);
        float air = (1.0 - 0.75 * airAmt(vWorld)) * exp(-dist * uMist * 1.5);
        // (without the lens the light is added after the tone curve, where a little goes a long way)
        float k = uGain * mix(0.42, 1.0, uLinearOut) * air * uShow;
        vec3 col = uTint * glow * k + mix(uTint, vec3(1.0), 0.5) * hair * (0.85 + 0.6 * k) * air * uShow;
        gl_FragColor = vec4(col, 0.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// How much of its own light the picture gives off in each world (more where the world is dark). Its caption is
// pale everywhere, with a dark halo: the air of these worlds is full of light, which lifts dark ink to the tone of
// whatever is behind it, while pale type stays above it.
const HANG: Record<WorldId, { ink: "dark" | "light"; glow: number }> = {
  home: { ink: "light", glow: 0.3 },
  sun: { ink: "light", glow: 0.34 },
  stars: { ink: "light", glow: 0.5 },
  rex: { ink: "light", glow: 0.5 },
  fairy: { ink: "light", glow: 0.3 },
  paradise: { ink: "light", glow: 0.3 },
  gate: { ink: "light", glow: 0.44 },
  sea: { ink: "light", glow: 0.4 },
  funeral: { ink: "light", glow: 0.55 },
  kings: { ink: "light", glow: 0.5 },
};

const CANVAS_H = 18;
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// A painting, floating. No wall, no plinth, no lamp: the picture itself, upright in the air at the height of
// whoever passes on the path, softly lit from within so its colours are its own, a hairline of light round its
// edge and a faint glow behind it, a few motes drifting round it. It rises and falls a hand's breadth, slowly,
// and turns gently to face whoever comes; its name (title, year) fades in beneath it as they come near.
function CanvasStand({ p, x, z, cy, yaw, world }: { p: PaintingInfo; x: number; z: number; cy: number; yaw: number; world: WorldId }) {
  const aspect = p.width / p.height;
  const H = canvasH(p);
  const W = H * aspect;
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(p.title);
  // "English name (Lithuanian name, 1909)": the label carries his own title
  const lt = /\(([^()]+?),\s*(\d{4})\)\s*$/.exec(p.title);
  const title = lt ? lt[1] : m ? m[1] : p.title;
  const year = lt ? lt[2] : m ? m[2] : "";
  const b = useDisposable(() => {
    const state = { loaded: false, yaw, near: 0, seed: (x * 12.9898 + z * 78.233) % 6.283 };
    const map = new THREE.TextureLoader().load(p.file, () => (state.loaded = true));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const hang = HANG[world];
    const air = WORLDS[world].air;
    const g = air ? air.glow : ([1, 0.86, 0.62] as V3);
    // the light it gives is the world's own light, taken halfway to white
    const tint: V3 = [0.5 + g[0] * 0.5, 0.5 + g[1] * 0.5, 0.5 + g[2] * 0.5];
    const PAD = 9;
    const capW = Math.min(W * 1.05, 17);
    const motes = pointsGeometry(
      34,
      (i, q) => {
        // most of them close round the edge, a few further out
        const side = q() < 0.5;
        const u = (q() - 0.5) * (W + (side ? 7 : 2.5));
        const v = (q() - 0.5) * (H + (side ? 2.5 : 7));
        return [u, v, (q() - 0.5) * 5, 0.5 + q() * 1.1];
      },
      Math.round(Math.abs(x * 7 + z * 13)) + 3,
    );
    return {
      map,
      state,
      canvas: makeCanvasMaterial(map, { twoSided: true }),
      aura: makeAuraMaterial([W + PAD * 2, H + PAD * 2], [W / 2, H / 2], tint, hang.glow),
      auraSize: [W + PAD * 2, H + PAD * 2] as [number, number],
      cap: captionTexture(title, year, hang.ink),
      capMat: new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, fog: false, opacity: 0, color: new THREE.Color(1.35, 1.35, 1.35) }),
      capW,
      capH: capW * (236 / 1536),
      motes,
      moteMat: makePoints({ a: tint, b: [1, 0.97, 0.9], scale: 120, drift: 0.9, gain: 0.8 + hang.glow, max: 9 }),
    };
  }, [p.file, world]);
  b.capMat.map = b.cap;
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st = b.state;
    const u = b.canvas.uniforms.uShow;
    if (st.loaded && u.value < 1) u.value = Math.min(1, u.value + dt / 0.9);
    b.aura.uniforms.uShow.value = u.value;
    const g = group.current;
    if (!g) return;
    // it turns to face whoever comes, slowly, and never quite stops moving
    const o = originOf(world);
    const dx = camera.position.x - (o.x + x);
    const dz = camera.position.z - (o.z + z);
    const dist = Math.hypot(dx, dz);
    const want = dist > 4 ? Math.atan2(dx, dz) : st.yaw;
    st.yaw += wrapPi(want - st.yaw) * (1 - Math.exp(-dt * 1.3));
    const t = SKY_U.uTime.value + st.seed;
    g.rotation.set(Math.sin(t * 0.31) * 0.012, st.yaw + Math.sin(t * 0.23) * 0.02, Math.sin(t * 0.37) * 0.008);
    g.position.y = cy + Math.sin(t * 0.52) * 0.32;
    // its name fades in as they come near
    const near = 1 - THREE.MathUtils.smoothstep(dist, 70, 150);
    st.near += (near - st.near) * (1 - Math.exp(-dt * 3));
    b.capMat.opacity = st.near * u.value;
  });
  return (
    <group ref={group} position={[x, cy, z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0, -0.06]} material={b.aura} renderOrder={3}>
        <planeGeometry args={b.auraSize} />
      </mesh>
      <mesh material={b.canvas}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <points geometry={b.motes} material={b.moteMat} renderOrder={4} />
      <mesh position={[0, -H / 2 - 0.9 - b.capH / 2, 0.02]} material={b.capMat} renderOrder={5}>
        <planeGeometry args={[b.capW, b.capH]} />
      </mesh>
    </group>
  );
}

// Where a painting floats. A world names a place for its picture (`canvases` in voyage.ts); it is hung from the
// path of light near there, so that whoever flies the path always meets it: ahead and a little to one side (the
// side the world chose) for a good while before it is passed, at the height of the eye, clear of the tall things
// and of the ground, and never right at the entry where it would be beside or behind the plane from the first moment.
const canvasH = (p: PaintingInfo) => (p.width / p.height > 1.25 ? CANVAS_H * 0.84 : CANVAS_H);
function hangOnPath(def: WorldDef, spot: { x: number; z: number }, p: PaintingInfo, taken: number[]) {
  const pts = pathOf(def.id).pts;
  const n = pts.length;
  let i0 = 0;
  let bd = 1e12;
  for (let i = 0; i < n; i++) {
    const d = (pts[i].x - spot.x) ** 2 + (pts[i].z - spot.z) ** 2;
    if (d < bd) {
      bd = d;
      i0 = i;
    }
  }
  const tanAt = (i: number) => {
    const a = pts[Math.max(0, i - 2)];
    const b = pts[Math.min(n - 1, i + 2)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return [(b.x - a.x) / l, (b.z - a.z) / l];
  };
  const [tx0, tz0] = tanAt(i0);
  // which side of the way the world put it on, and how far off
  const cross = tx0 * (spot.z - pts[i0].z) - tz0 * (spot.x - pts[i0].x);
  const side = cross >= 0 ? 1 : -1;
  const H = canvasH(p);
  const W = H * (p.width / p.height);
  // (far enough aside that it never stands in front of what the path of light is leading to)
  const lat = THREE.MathUtils.clamp(Math.sqrt(bd), 30, 38) + W * 0.2;
  // (points are 4 m apart) not before 150 m of flight, not in the last 200 m before the gate
  const lo = Math.min(Math.round(150 / 4), Math.round(n * 0.3));
  const hi = Math.max(lo, n - Math.round(200 / 4));
  // Each place it could hang is judged by how it is seen on the way to it: from 60 to 200 m before, how far off
  // the plane's own line it stands (the path bends, and a picture on the outside of a bend is behind the wing
  // before it is ever seen). The world's own side is preferred; the other is taken if it is much the better.
  const seen = (x: number, z: number, i: number) => {
    let sum = 0;
    let k = 0;
    for (let j = i - 50; j <= i - 15; j += 5) {
      if (j < 0) continue;
      const [tx, tz] = tanAt(j);
      const dx = x - pts[j].x;
      const dz = z - pts[j].z;
      sum += Math.abs(Math.atan2(tx * dz - tz * dx, tx * dx + tz * dz));
      k++;
    }
    return k ? sum / k : 0.5;
  };
  let best: { x: number; z: number; i: number; score: number } | null = null;
  for (let i = THREE.MathUtils.clamp(i0, lo, hi), tries = 0; tries < 12 && i <= hi; tries++, i += 6) {
    for (const sd of [side, -side]) {
      const [tx, tz] = tanAt(i);
      const x = pts[i].x - tz * sd * lat;
      const z = pts[i].z + tx * sd * lat;
      const clear = def.obstacles.every((ob) => Math.hypot(ob.x - x, ob.z - z) > ob.r + W * 0.5 + 6);
      const open = groundAt(def, x, z) < pts[i].y - H * 0.5 + 2;
      const apart = taken.every((j) => Math.abs(j - i) > 22);
      // (radians off the line of flight; a blocked place is a last resort, a later place costs a little)
      const score = seen(x, z, i) + (sd === side ? 0 : 0.1) + tries * 0.03 + (clear && open && apart ? 0 : 2);
      if (!best || score < best.score) best = { x, z, i, score };
    }
    // (a picture 36 m aside is about 15 degrees off the line from 130 m back on a straight way: within 22 will do)
    if (best && best.score < 0.38) break;
  }
  const at = best!;
  taken.push(at.i);
  // it begins turned toward where the visitor comes from
  const from = pts[Math.max(0, at.i - 24)];
  const ground = Math.max(groundAt(def, at.x, at.z), def.water ?? -1e9);
  return { x: at.x, z: at.z, yaw: Math.atan2(from.x - at.x, from.z - at.z), cy: Math.max(pts[at.i].y - 0.5, ground + H / 2 + 2.5) };
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
    const out: { p: PaintingInfo; x: number; z: number; yaw: number; cy: number }[] = [];
    const named = new Set(def.canvases.map((c) => c.painting));
    const taken: number[] = [];
    for (const c of def.canvases) {
      const p = list.find((q) => q.id === c.painting);
      if (p) out.push({ p, ...hangOnPath(def, c, p, taken) });
    }
    // late arrivals (a painting added to the folder for this world): hung further along the same way
    const base = def.canvases[def.canvases.length - 1];
    if (base) for (const p of list) if (!named.has(p.id) && worldOfPainting(p.id) === def.id) out.push({ p, ...hangOnPath(def, base, p, taken) });
    // dev: where they hang, for framing stills
    if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") ((window as unknown as { __canvasSpots?: Record<string, unknown> }).__canvasSpots ??= {})[def.id] = out.map((s) => ({ id: s.p.id, x: +s.x.toFixed(1), z: +s.z.toFixed(1), cy: +s.cy.toFixed(1), yaw: +s.yaw.toFixed(2) }));
    return out;
  }, [list, def]);
  return (
    <>
      {stands.map((s) => (
        <CanvasStand key={s.p.id} p={s.p} x={s.x} z={s.z} cy={s.cy} yaw={s.yaw} world={def.id} />
      ))}
    </>
  );
}

// ---------- the whole base of a world ----------
// (`gate`: how the way on is drawn: "arch" the lancet of light (default), "veil" only its sheet of light, sized by
// `gateSize` [half-width, rise], for a world that builds its own opening, "none" nothing; see LightGate)
export function WorldBase({ id, def, pal, props, grass = true, tip, pathTint, pathGain, gateTint, mask, tall, groundSize, angels = true, marks = true, gate = "arch", gateSize }: { id: WorldId; def: WorldDef; pal: GroundPalette; props: WorldProps; grass?: boolean; tip?: V3; pathTint?: V3; pathGain?: number; gateTint?: V3; mask?: string; tall?: number; groundSize?: number; angels?: boolean; marks?: boolean; gate?: GateLook; gateSize?: [number, number] }) {
  return (
    <>
      {def.terrain && <Ground def={def} pal={pal} mobile={props.mobile} size={groundSize} />}
      {grass && def.terrain && <WorldGrass def={def} pal={pal} tip={tip} mobile={props.mobile} density={props.grass} wind={props.reduced ? 0.25 : 1} mask={mask} tall={tall} />}
      <LightPath id={id} def={def} tint={pathTint} gain={pathGain} effects={props.effects} angels={angels} marks={marks} />
      {def.gate && gate !== "none" && <LightGate id={id} def={def} tint={gateTint ?? pathTint} gain={pathGain} look={gate} half={gateSize?.[0]} rise={gateSize?.[1]} />}
      <Gallery def={def} />
    </>
  );
}
