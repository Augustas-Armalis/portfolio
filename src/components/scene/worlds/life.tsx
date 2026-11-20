"use client";

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { useDisposable } from "./common";
import { GLSL_AIR, PLAY_U, WORLD_U, rng, type V3 } from "./kit";

// What moves in a world and what burns over it: flocks of birds wheeling, and a sky's own great sun.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------- birds ----------
// Flocks wheeling slowly round a point, each bird two thin wings beating at its own pace, gliding now and
// then. Drawn as dark strokes that the air takes into itself with distance, as he drew them: a small "v".
export type Flock = { c: V3; r: number; n: number; size?: number; speed?: number; spread?: number; climb?: number };
// `lit`: pale birds that catch the light (the white birds of Paradise) instead of dark strokes
// `scatter`: metres round the plane within which the birds give way as it passes (they part round it and a little
// upward, beat faster, and close again behind it); 0, the default, leaves them as they were
export function Birds({ flocks, tint = [0.12, 0.1, 0.08], seed = 5, lit = false, scatter = 0 }: { flocks: Flock[]; tint?: V3; seed?: number; lit?: boolean; scatter?: number }) {
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
      uniforms: { ...SKY_U, ...WORLD_U, uPlane: PLAY_U.uPlane, uPlaneTrail: PLAY_U.uPlaneTrail, uScatter: { value: scatter }, uTint: { value: new THREE.Color(...tint) }, uLit: { value: lit ? 1 : 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aOrbit; attribute vec4 aPh;
        uniform float uTime; uniform vec3 uPlane; uniform vec3 uPlaneTrail; uniform float uScatter;
        varying vec3 vWorld; varying float vSide;
        void main(){
          float a = aPh.x + uTime * aPh.y;
          float rr = aOrbit.z * (1.0 + 0.08 * sin(uTime * 0.05 + aPh.x * 3.0));
          vec3 c = vec3(aOrbit.x + cos(a) * rr, aOrbit.w + sin(uTime * 0.11 + aPh.x * 5.0) * 4.0, aOrbit.y + sin(a) * rr);
          // the plane's passing: each bird gives way from where the plane is and from where it just was, each a
          // little differently, and comes back as it goes
          float startle = 0.0;
          if (uScatter > 0.0) {
            vec3 cw = (modelMatrix * vec4(c, 1.0)).xyz;
            vec3 d1 = cw - uPlane; vec3 d2 = cw - uPlaneTrail;
            float k1 = 1.0 - smoothstep(0.0, uScatter, length(d1));
            float k2 = (1.0 - smoothstep(0.0, uScatter * 1.25, length(d2))) * 0.75;
            startle = max(k1, k2);
            startle = startle * startle * (3.0 - 2.0 * startle);
            vec3 away = normalize((k1 > k2 ? d1 : d2) + vec3(sin(aPh.x * 37.0), 0.6 + 0.4 * sin(aPh.x * 91.0), cos(aPh.x * 53.0)) * uScatter * 0.25);
            c += away * startle * uScatter * (0.7 + 0.5 * fract(aPh.x * 7.31));
          }
          // heading along the ring
          vec3 fwd = normalize(vec3(-sin(a), 0.0, cos(a)) * sign(aPh.y));
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
          // beat, and now and then a long glide with the wings held a little up
          float glide = smoothstep(0.55, 0.8, sin(uTime * 0.31 + aPh.x * 11.0));
          float beat = mix(mix(sin(uTime * aPh.z + aPh.x * 17.0), 0.25, glide), sin(uTime * aPh.z * 2.2 + aPh.x * 17.0), startle);
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
        uniform vec3 uTint; uniform float uLit;
        varying vec3 vWorld; varying float vSide;
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          vec3 col = uTint * mix(uSkyCol * 0.6 + 0.08, uSkyCol * 0.9 + uKeyCol * 0.45, uLit);
          float f = airAmt(vWorld);
          gl_FragColor = vec4(mix(col, airCol(normalize(vWorld - cameraPosition)), f), (1.0 - f * 0.92) * (1.0 - vSide * 0.35));
          ${END}
        }`,
    });
    return { g, mat };
  }, [flocks, seed, lit, scatter]);
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

// ---------- painted clouds ----------
// Clouds as he painted them in the Fairy Tale and Paradise: small rounded forms laid in rows, cream, each lobe
// with a bright crescent stroke on its sunward side and a cool shade under it, softly outlined. Each is a quad
// that faces the eye; the shape (a few overlapping round lobes on a flatter base) is drawn in its shader.
export type PaintedCloud = { p: V3; w: number; seed?: number };
export function PaintedClouds({ list, warm = [1.0, 0.93, 0.78], shade = [0.62, 0.74, 0.74], hi = [1.25, 1.1, 0.82], order = 2 }: { list: PaintedCloud[]; warm?: V3; shade?: V3; hi?: V3; order?: number }) {
  const b = useDisposable(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const pos = new Float32Array(list.length * 4);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    list.forEach((c, i) => {
      pos.set([c.p[0], c.p[1], c.p[2], c.w], i * 4);
      box.expandByPoint(v.set(...c.p));
    });
    // (each one's seed rides in the fractional part of its width)
    list.forEach((c, i) => (pos[i * 4 + 3] = Math.floor(c.w) + ((c.seed ?? i * 0.618) % 1)));
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 4));
    g.instanceCount = list.length;
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    g.boundingSphere.radius += 200;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { ...SKY_U, ...WORLD_U, uWarm: { value: new THREE.Color(...warm) }, uShade: { value: new THREE.Color(...shade) }, uHi: { value: new THREE.Color(...hi) } },
      vertexShader: /* glsl */ `
        attribute vec4 aPos;
        uniform vec3 uSunDir; uniform float uTime;
        varying vec2 vUv; varying vec2 vSun; varying float vSeed; varying vec3 vWorld; varying float vNear;
        void main(){
          float w = floor(aPos.w);
          vSeed = fract(aPos.w);
          vec3 c = aPos.xyz + vec3(sin(uTime * 0.01 + vSeed * 40.0) * w * 0.1, 0.0, 0.0);
          vec4 mv = modelViewMatrix * vec4(c, 1.0);
          mv.xy += position.xy * vec2(w, w * 0.62);
          vUv = position.xy;
          // where the sun is, seen on the screen: the side the crescents are painted on
          vec3 sv = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
          vSun = normalize(sv.xy + vec2(1e-4));
          vWorld = (modelMatrix * vec4(c, 1.0)).xyz;
          vNear = smoothstep(w * 0.4, w * 1.4, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uWarm; uniform vec3 uShade; uniform vec3 uHi;
        varying vec2 vUv; varying vec2 vSun; varying float vSeed; varying vec3 vWorld; varying float vNear;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          vec2 p = vUv * vec2(1.0, 0.62);
          float inside = 0.0; float hiK = 0.0; float rimK = 0.0; float shadeK = 0.0;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            float h = fract(sin((vSeed * 13.0 + fi) * 78.233) * 43758.5453);
            vec2 c = vec2(-0.66 + fi * 0.33 + (h - 0.5) * 0.12, -0.04 + 0.16 * sin(fi * 1.7 + vSeed * 9.0) + (fi == 2.0 ? 0.1 : 0.0));
            float r = 0.24 + 0.14 * h + (fi == 2.0 ? 0.06 : 0.0);
            vec2 d = p - c; float l = length(d);
            float a = 1.0 - smoothstep(r - 0.02, r + 0.01, l);
            inside = max(inside, a);
            // the crescent: a bright stroke just inside the rim on the side toward the sun
            float side = dot(d / max(l, 1e-3), vSun);
            hiK = max(hiK, a * smoothstep(0.15, 0.7, side) * smoothstep(r * 0.45, r * 0.85, l) * (1.0 - smoothstep(r * 0.92, r, l) * 0.5));
            rimK = max(rimK, a * smoothstep(r * 0.8, r, l));
            shadeK = max(shadeK, a * smoothstep(0.1, -0.7, side) * smoothstep(r * 0.2, r * 0.9, l));
          }
          // a flatter base
          inside *= smoothstep(-0.3, -0.18, p.y);
          if (inside < 0.01) discard;
          float n = vnoise(vUv * 6.0 + vSeed * 30.0);
          vec3 col = mix(uWarm, uShade, shadeK * 0.75) * (0.92 + 0.12 * n);
          col = mix(col, uShade * 0.8, rimK * 0.25);
          col = mix(col, uHi * (0.95 + 0.1 * n), hiK * 0.9);
          col *= uSkyCol * 0.6 + uCloudLit * 0.55;
          float f = airAmt(vWorld);
          col = mix(col, airCol(normalize(vWorld - cameraPosition)), f * 0.85);
          gl_FragColor = vec4(col, inside * vNear * (1.0 - f * 0.4));
          ${END}
        }`,
    });
    return { g, mat };
  }, [list]);
  return <mesh geometry={b.g} material={b.mat} frustumCulled={false} renderOrder={order} />;
}

// ---------- shafts of light ----------
// Light pouring down through gaps in the cloud: tall soft columns, brightest where they face the eye, streaked
// along their length, fading out at the cloud and before the ground, drifting a little.
export type Shaft = { x: number; z: number; y0: number; y1: number; r: number; k?: number };
export function LightShafts({ list, tint = [1, 0.9, 0.62] }: { list: Shaft[]; tint?: V3 }) {
  const b = useDisposable(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const sh of list) {
      const g = new THREE.CylinderGeometry(sh.r * 0.7, sh.r, sh.y1 - sh.y0, 20, 1, true);
      g.translate(sh.x, (sh.y0 + sh.y1) / 2, sh.z);
      const n = g.attributes.position.count;
      const meta = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) meta.set([sh.y0, sh.y1, sh.k ?? 1, (sh.x * 0.013 + sh.z * 0.007) % 1], i * 4);
      g.setAttribute("aMeta", new THREE.BufferAttribute(meta, 4));
      parts.push(g);
    }
    const g = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    g.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) } },
      vertexShader: /* glsl */ `
        attribute vec4 aMeta;
        varying vec3 vWorld; varying vec3 vN; varying vec4 vMeta; varying vec2 vUv;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vMeta = aMeta; vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying vec3 vWorld; varying vec3 vN; varying vec4 vMeta; varying vec2 vUv;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 n = normalize(vN);
          // a column of light has no surface: brightest through its middle as seen, nothing at its edges
          float face = pow(abs(dot(n, V)), 2.5);
          float h = clamp((vWorld.y - vMeta.x) / max(vMeta.y - vMeta.x, 1.0), 0.0, 1.0);
          float fade = smoothstep(0.0, 0.25, h) * smoothstep(1.0, 0.7, h);
          float streak = vnoise(vec2(vUv.x * 24.0 + vMeta.w * 50.0, h * 1.5 - uTime * 0.03)) * 0.6 + vnoise(vec2(vUv.x * 61.0, h * 3.0 + uTime * 0.02)) * 0.4;
          float breath = 0.8 + 0.2 * sin(uTime * 0.25 + vMeta.w * 30.0);
          float dist = length(vWorld - cameraPosition);
          float a = face * fade * (0.35 + 0.65 * streak) * breath * vMeta.z * smoothstep(10.0, 80.0, dist) * glowK();
          gl_FragColor = vec4(uTint * mix(vec3(1.0), uGlow, 0.4) * a * 0.22, 1.0);
          ${END}
        }`,
    });
    return { g, mat };
  }, [list]);
  return <mesh geometry={b.g} material={b.mat} renderOrder={7} />;
}
