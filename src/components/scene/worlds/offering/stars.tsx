"use client";

import * as THREE from "three";
import { GLSL_SKY, SKY_U } from "../../sky";
import { useDisposable } from "../common";
import { GLSL_AIR, WORLD_U, type V3 } from "../kit";

// The stars he set in the dark cliff: five-pointed, gold, large and small, each drawn whole. Here they are
// lamps of a kind: they breathe, and now and then one flares.
export type Star = { p: V3; size: number };
export function GoldStars({ list, tint = [1, 0.8, 0.36] }: { list: Star[]; tint?: V3 }) {
  const b = useDisposable(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const at = new Float32Array(list.length * 4);
    const box = new THREE.Box3();
    list.forEach((s, i) => {
      at.set([...s.p, s.size], i * 4);
      box.expandByPoint(new THREE.Vector3(...s.p));
    });
    g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
    g.instanceCount = list.length;
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    g.boundingSphere.radius += 20;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) } },
      vertexShader: /* glsl */ `
        attribute vec4 aAt;
        uniform float uTime;
        varying vec2 vUv; varying float vSeed; varying vec3 vWorld; varying float vDist;
        void main(){
          vSeed = fract(aAt.x * 0.137 + aAt.z * 0.291 + aAt.y * 0.071);
          vec4 mv = modelViewMatrix * vec4(aAt.xyz, 1.0);
          vDist = -mv.z;
          float ro = (vSeed - 0.5) * 0.5;
          vec2 pr = vec2(position.x * cos(ro) - position.y * sin(ro), position.x * sin(ro) + position.y * cos(ro));
          // (never smaller than a few pixels: far off it is still a star)
          mv.xy += pr * max(aAt.w, vDist * 0.0035) * 1.6;
          vUv = position.xy * 1.6;
          vWorld = (modelMatrix * vec4(aAt.xyz, 1.0)).xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying vec2 vUv; varying float vSeed; varying vec3 vWorld; varying float vDist;
        ${GLSL_SKY}
        ${GLSL_AIR}
        float star5(vec2 p, float r, float rf){
          const vec2 k1 = vec2(0.809016994375, -0.587785252292);
          const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
          p.x = abs(p.x);
          p -= 2.0 * max(dot(k1, p), 0.0) * k1;
          p -= 2.0 * max(dot(k2, p), 0.0) * k2;
          p.x = abs(p.x);
          p.y -= r;
          vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
          float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
          return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
        }
        void main(){
          float d = star5(vUv, 1.0, 0.42);
          float aa = fwidth(d) * 1.2 + 0.01;
          float body = 1.0 - smoothstep(-aa, aa, d);
          float glow = exp(-max(d, 0.0) * 5.0) * 0.35;
          float breathe = 0.8 + 0.2 * sin(uTime * (0.5 + vSeed) + vSeed * 40.0);
          // now and then one flares
          float flare = pow(max(sin(uTime * 0.21 + vSeed * 60.0), 0.0), 30.0) * 1.6;
          float a = (body * 1.5 + glow) * (breathe + flare) * (1.0 - airAmt(vWorld) * 0.6) * mix(1.0, 0.36, uNight) * smoothstep(1.0, 8.0, vDist);
          gl_FragColor = vec4(mix(uTint, vec3(1.0, 0.96, 0.8), body * 0.35) * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { g, mat };
  }, [list]);
  return <mesh geometry={b.g} material={b.mat} renderOrder={6} />;
}
