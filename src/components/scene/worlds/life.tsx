"use client";

import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { useDisposable } from "./common";
import { GLSL_AIR, WORLD_U, rng, type V3 } from "./kit";

// What moves in a world and what burns over it: flocks of birds wheeling, and a sky's own great sun.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------- birds ----------
// Flocks wheeling slowly round a point, each bird two thin wings beating at its own pace, gliding now and
// then. Drawn as dark strokes that the air takes into itself with distance, as he drew them: a small "v".
export type Flock = { c: V3; r: number; n: number; size?: number; speed?: number; spread?: number; climb?: number };
export function Birds({ flocks, tint = [0.12, 0.1, 0.08], seed = 5 }: { flocks: Flock[]; tint?: V3; seed?: number }) {
  const b = useDisposable(() => {
    const r = rng(seed);
    const g = new THREE.InstancedBufferGeometry();
    // nose, tail, left tip, right tip; each wing a triangle from the body line to its tip
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.35, 0, 0, 0.25, -1, 0, 0.12, 1, 0, 0.12], 3));
    g.setIndex([0, 1, 2, 0, 3, 1]);
    const total = flocks.reduce((a, f) => a + f.n, 0);
    const orbit = new Float32Array(total * 4);
    const ph = new Float32Array(total * 4);
    let i = 0;
    const box = new THREE.Box3();
    for (const f of flocks) {
      const spread = f.spread ?? f.r * 0.12;
      const dir = r() < 0.5 ? -1 : 1;
      const phase0 = r() * Math.PI * 2;
      for (let j = 0; j < f.n; j++) {
        // a loose skein: each bird a little off the flock's own ring and a little behind the one before
        orbit.set([f.c[0], f.c[2], f.r + (r() - 0.5) * spread, f.c[1] + (r() - 0.5) * spread * 0.4], i * 4);
        ph.set([phase0 + (j / f.n) * (0.35 + r() * 0.2) * dir * -1, ((f.speed ?? 9) / Math.max(f.r, 1)) * dir * (0.92 + r() * 0.16), 5 + r() * 3, (f.size ?? 1) * (0.75 + r() * 0.5)], i * 4);
        i++;
      }
      box.expandByPoint(new THREE.Vector3(f.c[0] - f.r - spread, f.c[1] - spread, f.c[2] - f.r - spread));
      box.expandByPoint(new THREE.Vector3(f.c[0] + f.r + spread, f.c[1] + spread + (f.climb ?? 0), f.c[2] + f.r + spread));
    }
    g.setAttribute("aOrbit", new THREE.InstancedBufferAttribute(orbit, 4));
    g.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 4));
    g.instanceCount = total;
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) } },
      vertexShader: /* glsl */ `
        attribute vec4 aOrbit; attribute vec4 aPh;
        uniform float uTime;
        varying vec3 vWorld; varying float vSide;
        void main(){
          float a = aPh.x + uTime * aPh.y;
          float rr = aOrbit.z * (1.0 + 0.08 * sin(uTime * 0.05 + aPh.x * 3.0));
          vec3 c = vec3(aOrbit.x + cos(a) * rr, aOrbit.w + sin(uTime * 0.11 + aPh.x * 5.0) * 4.0, aOrbit.y + sin(a) * rr);
          // heading along the ring
          vec3 fwd = normalize(vec3(-sin(a), 0.0, cos(a)) * sign(aPh.y));
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          // beat, and now and then a long glide with the wings held a little up
          float glide = smoothstep(0.55, 0.8, sin(uTime * 0.31 + aPh.x * 11.0));
          float beat = mix(sin(uTime * aPh.z + aPh.x * 17.0), 0.25, glide);
          float s = aPh.w * 1.6;
          vec3 p = position;
          float tip = abs(p.x);
          vec3 w = c + side * p.x * s + fwd * -p.z * s + vec3(0.0, tip * beat * 0.75 * s, 0.0);
          // banked into the turn
          w.y += p.x * s * 0.18 * sign(aPh.y);
          vWorld = (modelMatrix * vec4(w, 1.0)).xyz;
          vSide = tip;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying vec3 vWorld; varying float vSide;
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          vec3 col = uTint * (uSkyCol * 0.6 + 0.08);
          float f = airAmt(vWorld);
          gl_FragColor = vec4(mix(col, airCol(normalize(vWorld - cameraPosition)), f), (1.0 - f * 0.92) * (1.0 - vSide * 0.35));
          ${END}
        }`,
    });
    return { g, mat };
  }, [flocks, seed]);
  return <mesh geometry={b.g} material={b.mat} frustumCulled={false} renderOrder={4} />;
}

// ---------- a great sun ----------
// The sky's own sun, made into one of his: a white-gold disc, a drawn ring, straight rays long and short that
// turn very slowly and carry pulses of light outward, a corona of streamers that never stands still, and a wide
// soft glow. It hangs at the sky's distance in the sky's own sun direction, so the lens's god rays pour from it
// and everything in the world stands in front of it.
export function GreatSun({ size = 0.55, tint = [1, 0.78, 0.36], rays = 18, gain = 1 }: { size?: number; tint?: V3; rays?: number; gain?: number }) {
  const b = useDisposable(() => {
    const g = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, uSize: { value: size }, uTint: { value: new THREE.Color(...tint) }, uRays: { value: rays }, uGain: { value: gain } },
      vertexShader: /* glsl */ `
        uniform vec3 uSunDir; uniform float uSize;
        varying vec2 vUv;
        void main(){
          vec3 c = cameraPosition + normalize(uSunDir) * 2400.0;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * 2400.0 * uSize;
          vUv = position.xy;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform float uRays; uniform float uGain;
        varying vec2 vUv;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        void main(){
          float r = length(vUv);
          if (r > 1.0) discard;
          float ang = atan(vUv.y, vUv.x);
          float t = uTime;
          // the disc, a little darker at its limb, and its drawn ring
          float disc = 1.0 - smoothstep(0.092, 0.1, r);
          float limb = 0.82 + 0.18 * sqrt(max(0.0, 1.0 - (r / 0.1) * (r / 0.1)));
          float ring = smoothstep(0.012, 0.003, abs(r - 0.135)) * (0.8 + 0.2 * sin(t * 0.9));
          // straight rays, long and short by turns, turning very slowly, with light running out along them
          float a2 = ang + t * 0.012;
          float cell = a2 / 6.2832 * uRays;
          float lat = abs(fract(cell) - 0.5) * (6.2832 / uRays) * r;
          float id = floor(cell);
          float longRay = step(0.5, fract(id * 0.5));
          float reach = mix(0.46, 0.92, longRay) * (0.94 + 0.06 * sin(t * 0.7 + id * 2.3));
          float width = mix(0.0045, 0.009, longRay) * (1.0 + r);
          float ray = (1.0 - smoothstep(width * 0.4, width, lat)) * smoothstep(0.16, 0.2, r) * (1.0 - smoothstep(reach * 0.75, reach, r));
          ray *= 0.65 + 0.35 * sin(r * 46.0 - t * 2.2 + id * 1.7);
          // the corona: streamers that are never still
          float cor = fbm(vec2(ang * 3.1831 * 2.0 + 10.0, r * 5.0 - t * 0.12)) * 0.6 + fbm(vec2(ang * 3.1831 * 5.0 - 4.0, r * 9.0 - t * 0.21)) * 0.4;
          float corona = pow(cor, 2.2) * exp(-(r - 0.1) * 9.0) * smoothstep(0.08, 0.11, r) * 1.6;
          float glow = exp(-r * 6.5) * 0.5 + exp(-r * 2.4) * 0.12;
          vec3 hot = vec3(1.0, 0.97, 0.88);
          vec3 col = hot * disc * limb * 7.0 + mix(uTint, hot, 0.4) * ring * 2.4 + uTint * (ray * 1.3 + corona) + uGlow * glow * 1.4;
          float up = smoothstep(-0.06, 0.04, uSunDir.y);
          float edge = 1.0 - smoothstep(0.8, 1.0, r);
          gl_FragColor = vec4(col * edge * up * uGain * (1.0 + uPulse * 0.4), 1.0);
          ${END}
        }`,
    });
    return { g, mat };
  }, [size, rays, gain]);
  return <mesh geometry={b.g} material={b.mat} frustumCulled={false} renderOrder={-4} />;
}
