import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";
import { FRIEND_U, GLSL_ORB } from "./cave";

// Ferns on the cave's floor, in place of round clumps: each plant a rosette of arching fronds, every frond a strip
// that rises from the crown, arches out and droops at its tip, its edge cut in the shader into the paired leaflets
// of a fern (wide at the frond's middle, small at its tip), with a darker rib down its middle. One instanced mesh;
// it sways a little; it takes the orb's light from the side it faces, and the cave's air.

export type Fern = { p: [number, number, number]; s: number; yaw: number };
const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// one plant, a metre across at scale 1: `fronds` arching strips, `seg` lengths each
function fernPlant(fronds: number, seg: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + Math.sin(f * 7.1) * 0.3;
    const len = 0.85 + 0.25 * Math.sin(f * 3.7);
    const lift = 0.95 + 0.35 * Math.cos(f * 5.3);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      // out along the ground, up, and over at the tip
      const r = len * t;
      const y = len * (lift * Math.sin(t * 2.2) * 0.55 - 0.18 * t * t);
      const w = 0.17 * len * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - 0.35 * t) + 0.01;
      // (the strip lies flat across the frond, tilted a little, so the light catches it)
      const px = -sa * w;
      const pz = ca * w;
      pos.push(ca * r - px, y - 0.03 * w, sa * r - pz, ca * r + px, y + 0.03 * w, sa * r + pz);
      uv.push(t, 0, t, 1);
      if (i < seg) {
        const q = base + i * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function fernGeometry(list: Fern[], mobile: boolean) {
  const g = fernPlant(mobile ? 6 : 8, mobile ? 6 : 9);
  const n = list.length;
  const at = new Float32Array(n * 4);
  const rot = new Float32Array(n * 2);
  list.forEach((f, i) => {
    at.set([f.p[0], f.p[1], f.p[2], f.s], i * 4);
    rot.set([f.yaw, (i * 0.618) % 1], i * 2);
  });
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.setAttribute("aRot", new THREE.InstancedBufferAttribute(rot, 2));
  g.instanceCount = n;
  const box = new THREE.Box3();
  for (const f of list) box.expandByPoint(new THREE.Vector3(...f.p));
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  g.boundingSphere.radius += 20;
  return g;
}

export function makeFernMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    transparent: false,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; attribute vec2 aRot;
      uniform float uTime;
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vN; varying float vSeed;
      void main(){
        float c = cos(aRot.x), s = sin(aRot.x);
        vec3 p = position * aAt.w;
        p = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
        // a slow sway, more at the tips
        float sw = sin(uTime * 0.6 + aRot.y * 20.0 + aAt.x * 0.05) * 0.04 * aAt.w * uv.x * uv.x;
        p.x += sw; p.z += sw * 0.6;
        vec4 wp = modelMatrix * vec4(p + aAt.xyz, 1.0);
        vWorld = wp.xyz; vUv = uv; vSeed = aRot.y;
        // (the frond's face turns up; its normal leans out along it)
        vN = normalize(vec3(c * 0.0, 1.0, 0.0) + normalize(vec3(p.x, 0.0, p.z) + 0.0001) * 0.35);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vN; varying float vSeed;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_ORB}
      void main(){
        // the leaflets: paired, slanting toward the tip, each tapering to a point
        float t = vUv.x;
        float acr = abs(vUv.y * 2.0 - 1.0);
        float k = 14.0;
        float ph = fract(t * k - acr * 0.9);
        float leaf = (1.0 - acr) - abs(ph - 0.5) * 1.6 * (0.35 + 0.65 * acr);
        float rib = 1.0 - smoothstep(0.0, 0.08, acr);
        float a = clamp(leaf * 6.0 + 0.5, 0.0, 1.0) * smoothstep(0.0, 0.04, t);
        a = max(a, rib * step(t, 0.97));
        if (a < 0.02) discard;
        vec3 alb = mix(vec3(0.05, 0.1, 0.05), vec3(0.12, 0.2, 0.08), vnoise(vec2(t * 6.0, vSeed * 40.0)));
        alb = mix(alb, vec3(0.04, 0.06, 0.03), rib * 0.6);
        alb *= 0.7 + 0.5 * t;
        vec3 n = normalize(vN);
        vec3 col = alb * (0.5 + 0.4 * n.y);
        col += alb * orbLight(vWorld, n, 0.6, 140.0).rgb * 1.6;
        col = applyAir(col, vWorld) + orbScatter(vWorld);
        gl_FragColor = vec4(col, a);
        ${END}
      }`,
  });
}
