"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_HOME_AIR, HOME_U, rng } from "./land";

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
          vec3 col = mix(vec3(0.03, 0.03, 0.035), skyBase(d), 0.4);
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
