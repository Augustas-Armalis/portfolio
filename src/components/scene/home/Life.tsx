"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_HOME_AIR, GLSL_LAND, HOME_U, rng } from "./land";

// Small lives in the field. By day butterflies wander over the flowers round
// the desk (two wings each, beating, in white, brimstone yellow and blue), and
// a skein of geese crosses high and slow toward the pass; at dusk both are
// gone (the fireflies are the night's: see the room).
export function Butterflies({ count = 46 }: { count?: number }) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    // two wings hinged on the body's line (x = 0); aSide in position.z: -1 left, +1 right
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -1, -1, 0.75, -1, -0.85, -0.6, -1, 0, 0, 1, 1, 0.75, 1, 0.85, -0.6, 1], 3));
    const r = rng(515);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // most within a few metres of the desk, some further out
      const a = r() * Math.PI * 2;
      const d = 1.2 + Math.pow(r(), 1.6) * 16;
      seed.set([Math.cos(a) * d, Math.sin(a) * d, r() * 100, r()], i * 4);
    }
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...HOME_U, uVis: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uTime; uniform float uVis;
        varying vec3 vCol; varying vec3 vWorld; varying vec2 vUv;
        void main(){
          float t = uTime * (0.22 + aSeed.w * 0.14) + aSeed.z;
          // a wandering, dipping flight round its own patch of flowers
          vec2 c = aSeed.xy + vec2(sin(t * 1.3) + sin(t * 0.47 + 1.7) * 1.6, cos(t * 1.1 + 0.6) + sin(t * 0.38) * 1.6) * (0.5 + aSeed.w);
          float y = 0.42 + 0.3 * sin(t * 2.1 + aSeed.z) + 0.22 * sin(t * 5.3) + aSeed.w * 0.5;
          vec2 vel = vec2(cos(t * 1.3) * 1.3 + cos(t * 0.47 + 1.7) * 0.75, -sin(t * 1.1 + 0.6) * 1.1 + cos(t * 0.38) * 0.6);
          vec2 f = normalize(vel + 1e-4);
          // wings beat fast, and close over the back between beats now and then
          float beat = sin(uTime * (17.0 + aSeed.w * 9.0) + aSeed.z * 7.0);
          float ang = (0.25 + 0.95 * (0.5 + 0.5 * beat)) * mix(1.0, 0.15, smoothstep(0.75, 0.95, sin(t * 0.9)));
          float s = 0.021 + aSeed.w * 0.012;
          vec3 right = vec3(-f.y, 0.0, f.x);
          vec3 w = vec3(c.x, y, c.y) + vec3(f.x, 0.0, f.y) * position.y * s + (right * cos(ang) * position.x + vec3(0.0, 1.0, 0.0) * sin(ang) * abs(position.x)) * s * uVis;
          vCol = aSeed.w < 0.4 ? vec3(0.93, 0.92, 0.86) : aSeed.w < 0.75 ? vec3(0.95, 0.83, 0.25) : vec3(0.45, 0.6, 0.95);
          vWorld = w; vUv = position.xy;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying vec3 vWorld; varying vec2 vUv;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_HOME_AIR}
        void main(){
          // a darker edge to the wing, a spot on it
          vec3 alb = vCol * mix(1.0, 0.45, smoothstep(0.62, 0.95, abs(vUv.x))) * mix(1.0, 0.6, 1.0 - smoothstep(0.0, 0.16, length(abs(vUv) - vec2(0.55, 0.25))));
          vec3 col = alb * (uSkyCol * 0.8 + uKeyCol * 0.5 * smoothstep(-0.02, 0.08, uKeyDir.y));
          col = homeAir(col, vWorld);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, [count]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(() => {
    // out in the daytime only
    mat.uniforms.uVis.value = THREE.MathUtils.clamp((SKY_U.uSunDir.value.y - 0.04) * 12, 0, 1);
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

// Geese: one long V, high up, flying north toward the pass, coming round again a few minutes later.
export function Skein() {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.16, -0.62, 0, 0.1, 0, 0, 0.16, 0, 0, -0.16, 0, 0, 0.16, 0.62, 0, 0.1], 3));
    const n = 17;
    const ph = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const arm = i === 0 ? 0 : i % 2 ? 1 : -1;
      const k = Math.ceil(i / 2);
      ph.set([arm * k * 1.5, k * 1.9 + (arm < 0 ? 0.7 : 0), i * 1.37], i * 3);
    }
    g.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 3));
    g.instanceCount = n;
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, uVis: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aPh; uniform float uVis; uniform float uTime; varying vec3 vWorld;
        void main(){
          // along a line from the south-east to the north-west, wrapping every 1.5 km
          float along = mod(uTime * 9.0, 1500.0) - 750.0;
          vec3 fwd = normalize(vec3(-0.35, 0.0, -1.0));
          vec3 side = vec3(-fwd.z, 0.0, fwd.x);
          vec3 lead = vec3(-150.0, 96.0 + sin(uTime * 0.2) * 5.0, -40.0) + fwd * along;
          vec3 p = position;
          p.y += abs(p.x) * sin(uTime * 5.2 + aPh.z) * 0.75;
          vec3 w = lead + side * aPh.x - fwd * aPh.y + vec3(0.0, sin(uTime * 0.7 + aPh.z) * 0.25, 0.0) + (side * p.x + vec3(0.0, p.y, 0.0) + fwd * -p.z) * 1.25 * uVis;
          vWorld = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        ${GLSL_SKY}
        void main(){
          vec3 d = normalize(vWorld - cameraPosition);
          vec3 col = mix(vec3(0.02, 0.02, 0.025) * (uSkyCol * 1.4 + 0.1), skyBase(d), 0.22);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(() => {
    mat.uniforms.uVis.value = SKY_U.uSunDir.value.y > 0.02 ? 1 : 0;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

// Motes: pollen drifting up out of the grass by day, fireflies after dusk.
// Each is a small card that faces the eye and carries a soft round glow that
// falls to nothing well inside its edge (never a square, at any size or
// distance), added to the picture, tested against the depth of the scene (a
// tree, the desk or the display hides it) and never written into it.
export function Motes({ count = 160, still = false }: { count?: number; still?: boolean }) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const r = rng(9173);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seed.set([r(), r(), r(), r()], i * 4);
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, ...HOME_U, uCenter: { value: new THREE.Vector2() }, uStill: { value: still ? 0 : 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uTime; uniform float uNight; uniform vec2 uCenter; uniform float uStill; uniform vec3 uSunDir;
        varying vec2 vUv; varying vec3 vCol; varying float vA;
        ${GLSL_LAND}
        void main(){
          // a tile of them rides with the eye; by day they keep close, at night they are out over the whole meadow
          float night = smoothstep(0.18, 0.4, uNight);
          float T = mix(14.0, 46.0, night);
          vec2 base = (aSeed.xy - 0.5) * T;
          vec2 c = mod(base - uCenter + T * 0.5, T) - T * 0.5 + uCenter;
          float t = uTime * uStill;
          float ph = aSeed.z * 6.2832;
          // pollen: rising slowly, turning in the air, born again at the grass. fireflies: wandering low, pulsing.
          float life = fract(t * (0.035 + 0.03 * aSeed.w) + aSeed.z);
          vec3 day = vec3(c.x + sin(t * 0.3 + ph) * 0.5, 0.25 + life * 2.2, c.y + cos(t * 0.23 + ph * 1.7) * 0.5);
          vec3 fly = vec3(c.x + sin(t * 0.21 + ph) * 1.6 + sin(t * 0.67 + ph * 3.0) * 0.4, 0.35 + 0.9 * aSeed.w + sin(t * 0.5 + ph * 2.0) * 0.3, c.y + cos(t * 0.17 + ph * 1.3) * 1.6);
          vec3 p = mix(day, fly, night);
          p.y += landH(p.xz);
          float dc = length(p.xz - uCenter);
          float edge = 1.0 - smoothstep(T * 0.36, T * 0.5, dc);
          float pulse = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(t * (1.1 + aSeed.w * 1.3) + ph * 5.0), 3.0);
          float dayA = sin(life * 3.14159) * 0.35 * smoothstep(-0.02, 0.1, uSunDir.y);
          vA = mix(dayA, pulse, night) * edge;
          vCol = mix(vec3(1.0, 0.9, 0.7), vec3(0.75, 1.0, 0.42), night);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          // never smaller than a pixel and a half (it dims instead), never a blot
          float size = mix(0.012, 0.05, night) * (0.7 + 0.6 * aSeed.w);
          float px = -mv.z * 0.0011;
          float s = max(size, px);
          vA *= (size * size) / (s * s);
          vUv = position.xy;
          mv.xy += position.xy * s * step(0.002, vA);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vCol; varying float vA;
        void main(){
          float r = length(vUv);
          float a = (exp(-r * r * 7.0) * 0.75 + exp(-r * r * 30.0) * 1.2) * smoothstep(1.0, 0.72, r) * vA;
          gl_FragColor = vec4(vCol * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, [count, still]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(({ camera }) => mat.uniforms.uCenter.value.set(camera.position.x, camera.position.z));
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}

// A flock wheeling high over the lake in daylight: dark birds against the sky (never paler than what is behind
// them), each a body and two wings that bend at the wrist as they beat.
export function Flock() {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    // x: along the wing (0 body .. 1 tip, sign = side), z: fore and aft
    const pos = [0, 0, -0.1, -0.5, 0, -0.02, -0.5, 0, 0.08, 0, 0, -0.1, -0.5, 0, 0.08, 0, 0, 0.1, -0.5, 0, -0.02, -1, 0, 0.1, -0.5, 0, 0.08, 0, 0, -0.1, 0, 0, 0.1, 0.5, 0, 0.08, 0, 0, -0.1, 0.5, 0, 0.08, 0.5, 0, -0.02, 0.5, 0, -0.02, 0.5, 0, 0.08, 1, 0, 0.1, -0.04, 0, -0.22, 0.04, 0, -0.22, 0, 0, 0.26];
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const n = 11;
    const ph = new Float32Array(n * 3);
    const r = rng(9);
    for (let i = 0; i < n; i++) ph.set([r() * 6.28, (r() - 0.5) * 16, (r() - 0.5) * 7], i * 3);
    g.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 3));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...HOME_U, uVis: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aPh; uniform float uVis; uniform float uTime; varying vec3 vWorld;
        void main(){
          float t = uTime * 0.06 + aPh.x * 0.03;
          vec3 c = vec3(-60.0, 46.0 + aPh.z, -120.0);
          float R = 42.0 + aPh.y;
          vec3 pos = c + vec3(cos(t) * R, sin(t * 2.3 + aPh.x) * 2.0, sin(t) * R * 0.7);
          vec3 fwd = normalize(vec3(-sin(t), 0.0, cos(t) * 0.7));
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          vec3 p = position;
          // a few beats, then a glide
          float beat = sin(uTime * 7.5 + aPh.x * 3.0) * smoothstep(-0.3, 0.3, sin(uTime * 0.6 + aPh.x * 2.0));
          float ax = abs(p.x);
          p.y += (min(ax, 0.5) * 0.9 + max(ax - 0.5, 0.0) * 0.35) * beat * 0.7 + ax * 0.12;
          vec3 w = pos + (side * p.x * 0.75 + vec3(0.0, p.y, 0.0) * 0.75 + fwd * p.z * 1.4) * 1.1 * uVis;
          vWorld = w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_HOME_AIR}
        void main(){
          vec3 col = homeAir(vec3(0.016, 0.016, 0.02) * (uSkyCol * 1.4 + uKeyCol * 0.2), vWorld);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(() => {
    mat.uniforms.uVis.value = THREE.MathUtils.clamp(1 - SKY_U.uNight.value * 2, 0, 1) * (SKY_U.uSunDir.value.y > 0.03 ? 1 : 0);
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}
