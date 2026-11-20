"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { audioGraph, channel, sceneMuted, track } from "@/lib/audio";
import { GLSL_SKY, SKY_U } from "../sky";
import { useDisposable } from "./common";
import { GLSL_AIR, PLAY_U, WORLD_U, type V3 } from "./kit";
import { originOf, pathOf, voyage, type WorldId } from "./voyage";

// A light, calm way for a world to answer the plane. Nothing here is a game: no score, no timer, nothing to miss.
//
//   <PathLanterns id="sun" />      rings of light hung on the world's path of light, one every 90 m or so. Flown
//                                  through, a ring opens and lets go of its light, a soft shimmer sounds, and the
//                                  whole path brightens for a few seconds. Flying round them is just as good.
//   <Birds scatter={30} ... />     (worlds/life.tsx) a flock that parts round the plane and closes behind it.
//   <PlayFrame />                  once, wherever the worlds are drawn (Worlds.tsx has it): keeps the shared
//                                  uniforms (kit.ts PLAY_U) and draws the flourish.
//   useLight()                     { world, got, of, done } for the flight bar's small mark: how many of this
//                                  world's lanterns have been gathered.
//
// When the last lantern of a world is gathered there is one small flourish: motes of light spiral out from the
// plane, the path stays bright a little longer, three soft notes rise. Then nothing more is asked.

// ---------- what has been gathered ----------
type Light = { world: WorldId | null; got: number; of: number; done: boolean; doneAt: number; v: number };
const light: Light = { world: null, got: 0, of: 0, done: false, doneAt: -1e9, v: 0 };
const subs = new Set<() => void>();
let snap = { world: light.world, got: 0, of: 0, done: false };
const emit = () => {
  snap = { world: light.world, got: light.got, of: light.of, done: light.done };
  subs.forEach((f) => f());
};
const NONE = { world: null as WorldId | null, got: 0, of: 0, done: false };
export const useLight = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => snap,
    () => NONE,
  );

// ---------- the shimmer ----------
// A breath of very high air and one soft partial on top of it: closer to light on glass than to a bell, so it sits
// over whatever music is playing without arguing with its key. Each lantern of a world sounds a step higher.
const STEPS = [880, 987.77, 1108.73, 1318.51, 1479.98, 1760];
let noiseBuf: AudioBuffer | null = null;
function shimmer(step: number, k = 1, when = 0) {
  if (typeof window === "undefined" || sceneMuted()) return;
  try {
    const { ctx } = audioGraph();
    if (ctx.state !== "running") return;
    const out = channel("sfx");
    const t = ctx.currentTime + when;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.round(ctx.sampleRate * 1.2), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 1.1;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(0.03 * k, t + 0.08);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    n.connect(bp).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 1.1);
    track("sfx", n, "shimmer");
    const f = STEPS[((step % STEPS.length) + STEPS.length) % STEPS.length];
    for (const [mul, g] of [
      [1, 0.03],
      [2.005, 0.009],
    ]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(g * k, t + 0.05);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + 1.8);
      track("sfx", o, "shimmer");
    }
  } catch {
    /* no sound: the light is enough */
  }
}

// ---------- lanterns on the path ----------
// One instanced quad per lantern, standing across the way: a fine ring, a faint veil inside it, a few sparks
// riding the ring. aHit is when it was flown through (seconds of the sky's clock; far in the past if never).
const RING_VERT = /* glsl */ `
  attribute vec4 aAt; attribute float aHit;
  uniform float uTime; uniform float uR;
  varying vec2 vP; varying float vAge; varying vec3 vWorld; varying float vSeed;
  void main(){
    vAge = uTime - aHit;
    // flown through, it opens: half as wide again, and is gone in a breath
    float open = 1.0 + 0.55 * (1.0 - exp(-max(vAge, 0.0) * 3.0)) * step(0.0, vAge);
    float c = cos(aAt.w), s = sin(aAt.w);
    vec3 p = vec3(position.x * c, position.y, -position.x * s) * uR * open * 1.5;
    p.y += sin(uTime * 0.6 + aAt.x * 0.13) * 0.25;
    vP = position.xy * 1.5 / 1.0;
    vSeed = fract(aAt.x * 0.137 + aAt.z * 0.071);
    vec4 wp = modelMatrix * vec4(aAt.xyz + p, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const RING_FRAG = /* glsl */ `
  uniform vec3 uTint; uniform float uGain;
  varying vec2 vP; varying float vAge; varying vec3 vWorld; varying float vSeed;
  ${GLSL_SKY}
  ${GLSL_AIR}
  void main(){
    float r = length(vP);
    float ang = atan(vP.y, vP.x);
    // the ring: a hairline with a soft shoulder, never quite even round its length
    float line = exp(-pow((r - 1.0) * 26.0, 2.0)) + exp(-pow((r - 1.0) * 7.0, 2.0)) * 0.22;
    line *= 0.72 + 0.28 * sin(ang * 3.0 + uTime * 0.5 + vSeed * 20.0);
    // a few sparks riding it
    float sp = pow(max(sin(ang * 5.0 - uTime * (0.6 + vSeed) + vSeed * 40.0), 0.0), 40.0) * exp(-pow((r - 1.0) * 9.0, 2.0));
    // the veil inside: very faint, a little brighter toward the rim
    float veil = smoothstep(1.0, 0.2, r) * smoothstep(0.0, 1.0, r) * 0.05 * step(r, 1.0);
    float a = line * 0.6 + sp * 1.4 + veil;
    // flown through: a flash, then a ghost of the ring is left so the way already taken can be told
    float hit = step(0.0, vAge);
    float flash = hit * exp(-max(vAge, 0.0) * 3.2);
    float left = mix(1.0, 0.1 + 0.9 * exp(-max(vAge, 0.0) * 1.6), hit);
    a = a * left + flash * (line * 2.4 + smoothstep(1.0, 0.0, r) * 0.35);
    float dist = length(vWorld - cameraPosition);
    // seen from a long way as a point of light, gone into the air beyond that; nothing right at the lens
    float fade = smoothstep(1.5, 8.0, dist) * (1.0 - smoothstep(320.0, 620.0, dist)) * (1.0 - airAmt(vWorld) * 0.8) * exp(-dist * uMist * 1.5);
    gl_FragColor = vec4(uTint * a * fade * uGain * glowK() * (0.9 + 0.1 * sin(uTime * 0.9 + vSeed * 30.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function PathLanterns({ id, every = 90, from = 70, to, radius = 6, tint = [1, 0.9, 0.66], gain = 1, sound = true }: { id: WorldId; every?: number; from?: number; to?: number; radius?: number; tint?: V3; gain?: number; sound?: boolean }) {
  const b = useDisposable(() => {
    const pts = pathOf(id).pts;
    const step = Math.max(2, Math.round(every / 4));
    const last = Math.min(pts.length - 3, Math.round((to ?? pts.length * 4 - 130) / 4));
    const at: number[] = [];
    for (let i = Math.max(2, Math.round(from / 4)); i <= last; i += step) {
      const p = pts[i];
      const a = pts[i - 2];
      const c = pts[i + 2];
      // the quad stands across the way: its normal is the path's own direction
      at.push(p.x, p.y - 0.4, p.z, Math.atan2(c.x - a.x, c.z - a.z));
    }
    const n = at.length / 4;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute("aAt", new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
    const hit = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1e9), 1);
    hit.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aHit", hit);
    g.instanceCount = n;
    const box = new THREE.Box3();
    for (let i = 0; i < n; i++) box.expandByPoint(new THREE.Vector3(at[i * 4], at[i * 4 + 1], at[i * 4 + 2]));
    g.boundingSphere = n ? box.getBoundingSphere(new THREE.Sphere()) : new THREE.Sphere();
    g.boundingSphere.radius += radius * 3;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) }, uGain: { value: gain }, uR: { value: radius } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
    });
    return { g, mat, at, hit, n, got: new Uint8Array(n) };
  }, [id, every, from, to, radius]);
  // this world's lanterns are the ones being counted while it stands
  useEffect(() => {
    Object.assign(light, { world: id, got: 0, of: b.n, done: false });
    emit();
    return () => {
      if (light.world === id) {
        Object.assign(light, { world: null, got: 0, of: 0, done: false });
        emit();
      }
    };
  }, [id, b]);
  useFrame(() => {
    if (!voyage.flying || voyage.cur !== id || voyage.phase !== "open" || light.world !== id) return;
    const o = originOf(id);
    const px = voyage.planePos.x - o.x;
    const py = voyage.planePos.y;
    const pz = voyage.planePos.z - o.z;
    // (a fast plane covers some metres a frame: the ring's own depth is given that much grace)
    const reach = radius + voyage.planeSpeed * 0.02;
    for (let i = 0; i < b.n; i++) {
      if (b.got[i]) continue;
      const dx = px - b.at[i * 4];
      const dy = py - b.at[i * 4 + 1];
      const dz = pz - b.at[i * 4 + 2];
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      b.got[i] = 1;
      b.hit.setX(i, SKY_U.uTime.value);
      b.hit.needsUpdate = true;
      light.got++;
      PLAY_U.uPathLift.value = Math.max(PLAY_U.uPathLift.value, 1);
      if (sound) shimmer(light.got - 1);
      if (light.got >= light.of && !light.done) {
        // the last of them: one small flourish
        light.done = true;
        light.doneAt = performance.now();
        PLAY_U.uPathLift.value = 1.7;
        if (sound) [2, 4, 5].forEach((s, k) => shimmer(s, 0.8, 0.35 + k * 0.22));
      }
      emit();
    }
  });
  return <mesh geometry={b.g} material={b.mat} frustumCulled={b.n === 0} renderOrder={6} />;
}

// ---------- the frame's own upkeep, and the flourish ----------
// Motes that leave the plane in a widening spiral when a world's last lantern is gathered, and are gone in three
// seconds. Drawn round the plane itself, wherever it has got to by then.
const BURST = 54;
export function PlayFrame() {
  const pts = useRef<THREE.Points>(null);
  const b = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(BURST * 3);
    for (let i = 0; i < BURST; i++) seed.set([i / BURST, Math.random(), Math.random()], i * 3);
    g.setAttribute("position", new THREE.BufferAttribute(seed, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, uAge: { value: 9 }, uAt: { value: new THREE.Vector3() }, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        uniform float uAge; uniform vec3 uAt; uniform float uScale;
        varying float vA;
        void main(){
          float t = uAge;
          float a = position.x * 6.2831853 * 3.0 + t * (1.2 + position.y);
          float r = (1.0 - exp(-t * 1.6)) * (5.0 + 9.0 * position.y);
          vec3 p = uAt + vec3(cos(a) * r, (position.z - 0.35) * 7.0 * (1.0 - exp(-t * 1.2)) + t * 0.8, sin(a) * r);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vA = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(1.4, 3.0, t)) * (0.5 + 0.5 * position.z);
          gl_PointSize = clamp((0.5 + position.y) * uScale / -mv.z, 1.0, 14.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        ${GLSL_SKY}
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a = exp(-dot(c, c) * 20.0) * vA;
          gl_FragColor = vec4(vec3(1.0, 0.93, 0.72) * a * mix(1.0, 0.5, uNight), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { g, mat };
  }, []);
  useEffect(
    () => () => {
      b.g.dispose();
      b.mat.dispose();
    },
    [b],
  );
  useFrame(({ size }, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    // the path's lift falls away; the plane's place, and where it was a moment ago
    PLAY_U.uPathLift.value *= Math.exp(-dt / 2.6);
    if (PLAY_U.uPathLift.value < 0.002) PLAY_U.uPathLift.value = 0;
    const p = voyage.planePos;
    const trail = PLAY_U.uPlaneTrail.value;
    if (trail.distanceToSquared(p) > 400 * 400) trail.copy(p);
    else trail.lerp(p, 1 - Math.exp(-dt * 1.4));
    PLAY_U.uPlane.value.copy(p);
    const age = (performance.now() - light.doneAt) / 1000;
    if (pts.current) pts.current.visible = age < 3.2;
    if (age < 3.2) {
      b.mat.uniforms.uAge.value = age;
      (b.mat.uniforms.uAt.value as THREE.Vector3).copy(p);
      b.mat.uniforms.uScale.value = size.height * 0.4;
    }
  });
  return <points ref={pts} geometry={b.g} material={b.mat} frustumCulled={false} renderOrder={7} visible={false} />;
}

// Development: window.__play = { light, lift() } for reading what was gathered.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __play: { light, U: PLAY_U, shimmer } });
