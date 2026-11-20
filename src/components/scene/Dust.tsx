"use client";

import { useMemo, type MutableRefObject } from "react";
import * as THREE from "three";
import { SKY_U } from "./sky";

// A little dust knocked up off the desk where something heavy lands: a low ring of fine motes thrown out along
// the wood, lifting a touch and fading in about a second. Eight bursts can be in the air at once.
const SLOTS = 8;
const PER = 28;
export type DustApi = { burst: (x: number, y: number, z: number, w: number) => void };

export function DeskDust({ apiRef }: { apiRef: MutableRefObject<DustApi | null> }) {
  const b = useMemo(() => {
    const n = SLOTS * PER;
    const slot = new Float32Array(n);
    const dir = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < n; i++) {
      slot[i] = Math.floor(i / PER);
      const a = r() * Math.PI * 2;
      const k = 0.5 + r() * 0.5;
      dir.set([Math.cos(a) * k, 0.15 + r() * 0.45, Math.sin(a) * k], i * 3);
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSlot", new THREE.BufferAttribute(slot, 1));
    g.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 3);
    const uP = { value: Array.from({ length: SLOTS }, () => new THREE.Vector4(0, -99, 0, -99)) };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: SKY_U.uTime, uKeyCol: SKY_U.uKeyCol, uSkyCol: SKY_U.uSkyCol, uP },
      vertexShader: /* glsl */ `
        attribute float aSlot; attribute vec3 aDir; attribute float aSeed;
        uniform float uTime; uniform vec4 uP[${SLOTS}];
        varying float vA;
        void main(){
          vec4 P = uP[int(aSlot + 0.5)];
          float age = uTime - P.w;
          float w = clamp(fract(P.w * 0.0) + 1.0, 0.0, 1.0);
          if (age < 0.0 || age > 1.4) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
          // thrown out fast, slowed by the air, drifting up a little and settling
          float reach = (1.0 - exp(-age * 7.0)) * (0.07 + 0.08 * aSeed);
          vec3 p = P.xyz + vec3(aDir.x, 0.0, aDir.z) * reach + vec3(0.0, aDir.y * reach * 0.6 + age * 0.012 - age * age * 0.01, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((0.004 + 0.006 * aSeed) * (1.0 + age * 2.0) * 900.0 / -mv.z, 1.0, 14.0);
          vA = smoothstep(0.0, 0.05, age) * exp(-age * 2.6) * 0.55;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uKeyCol; uniform vec3 uSkyCol;
        varying float vA;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float a = exp(-dot(c, c) * 14.0) * smoothstep(0.5, 0.34, length(c)) * vA;
          vec3 col = vec3(0.86, 0.8, 0.7) * (uSkyCol * 0.7 + uKeyCol * 0.35);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    let next = 0;
    apiRef.current = {
      burst: (x, y, z) => {
        uP.value[next].set(x, y + 0.004, z, SKY_U.uTime.value);
        next = (next + 1) % SLOTS;
      },
    };
    return { g, mat };
  }, [apiRef]);
  return <points geometry={b.g} material={b.mat} frustumCulled={false} renderOrder={8} />;
}
