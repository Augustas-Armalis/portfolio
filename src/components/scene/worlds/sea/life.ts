import * as THREE from "three";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";

// The one thing that happens on the glass of Tranquility: after a calm while, a pod of dolphins comes up out of
// the still water beside the plane and goes leaping away across the bay in front of the island, each leap leaving
// two slow rings on the mirror, each dolphin doubled in the glass. Then they are gone, and it is still again.
//
// The pod is let go once (SEA_LIFE_U.uPod: where and which way; uPodT: its seconds). Every dolphin is one small
// mesh carried and bent along its own leap in the vertex shader, so the body follows the arc it flies.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export const SEA_LIFE_U = {
  uPod: { value: new THREE.Vector4(0, 0, 0, -1) }, // where it comes up (x, z) and the way it goes (x, z)
  uPodT: { value: -1 }, // seconds since it came up (-1: not yet)
};
const SPEED = 16;
const LEAP = 1.5; // seconds in the air
const LAST = 44; // seconds the pod stays
const POD_GLSL = /* glsl */ `
  uniform vec4 uPod; uniform float uPodT;
  const float SPEED = ${SPEED.toFixed(1)}; const float LEAP = ${LEAP.toFixed(2)};
  // is this dolphin's present leap one of those it is given (it comes up a moment after the pod does, and stops before it leaves)
  float leaping(float t, float ph, float period){
    float start = t - mod(t + ph, period);
    return step(1.5, start) * step(start, ${(LAST - 3).toFixed(1)}) * step(0.0, uPodT);
  }`;

// One dolphin, a metre long, nose toward +z: a spindle of rings, a dorsal fin, flukes, two flippers.
function dolphinGeometry() {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const RINGS = 13;
  const SIDES = 8;
  const rad = (t: number) => {
    // tail stock, belly, shoulders, the melon and the beak
    const body = 0.118 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.85);
    const beak = t > 0.9 ? 0.03 * (1 - (t - 0.9) / 0.1) + 0.012 : 0;
    return Math.max(body, beak, 0.012);
  };
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const z = -0.5 + t;
    const r = rad(t);
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      pos.push(Math.cos(a) * r * 0.9, Math.sin(a) * r * 1.1, z);
      nor.push(Math.cos(a), Math.sin(a), 0);
    }
  }
  for (let i = 0; i < RINGS; i++)
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      idx.push(a, b, a + SIDES, b, b + SIDES, a + SIDES);
    }
  const tri = (p: number[][], n: number[]) => {
    const o = pos.length / 3;
    for (const q of p) {
      pos.push(q[0], q[1], q[2]);
      nor.push(n[0], n[1], n[2]);
    }
    idx.push(o, o + 1, o + 2);
  };
  // the dorsal fin, swept back
  tri(
    [
      [0, 0.1, 0.1],
      [0, 0.105, -0.06],
      [0, 0.235, -0.085],
    ],
    [1, 0.4, 0],
  );
  // the flukes
  for (const s of [-1, 1])
    tri(
      [
        [0, 0, -0.47],
        [s * 0.15, 0, -0.56],
        [0, 0, -0.52],
      ],
      [0, 1, 0],
    );
  // the flippers
  for (const s of [-1, 1])
    tri(
      [
        [s * 0.08, -0.05, 0.2],
        [s * 0.09, -0.06, 0.11],
        [s * 0.2, -0.13, 0.07],
      ],
      [0, 1, 0],
    );
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// side: metres to the side of the pod's line. back: metres behind its leader. size: its length.
export type Dolphin = { side: number; back: number; size: number; phase: number; period: number; high: number };
export function dolphinsGeometry(list: Dolphin[]) {
  const base = dolphinGeometry();
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", base.attributes.position);
  g.setAttribute("normal", base.attributes.normal);
  g.setIndex(base.index);
  const a = new Float32Array(list.length * 4);
  const b = new Float32Array(list.length * 2);
  list.forEach((d, i) => {
    a.set([d.side, -d.back, d.phase, d.size], i * 4);
    b.set([d.period, d.high], i * 2);
  });
  g.setAttribute("aD", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aE", new THREE.InstancedBufferAttribute(b, 2));
  g.instanceCount = list.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
// `mirror`: the same dolphins as the glass shows them, drawn under the water's face (see Sea.tsx for the order)
export function makeDolphinMaterial(mirror = false) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: !mirror,
    depthFunc: mirror ? THREE.GreaterDepth : THREE.LessEqualDepth,
    uniforms: { ...SKY_U, ...WORLD_U, ...SEA_LIFE_U, uMirror: { value: mirror ? -1 : 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aD; attribute vec2 aE;
      uniform float uMirror; uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying float vUp; varying float vY; varying float vBody;
      ${POD_GLSL}
      void main(){
        float t = uPodT;
        vec2 fwd = normalize(uPod.zw + vec2(1e-5));
        vec2 side = vec2(-fwd.y, fwd.x);
        float size = aD.w;
        float tau = mod(t + aD.z, aE.x);
        // each part of the body is at its own moment of the leap, so the spine lies along the arc
        float u = (tau + position.z * size / SPEED) / LEAP;
        float on = leaping(t, aD.z, aE.x);
        float arc = aE.y * 4.0 * u * (1.0 - u) - 0.3;
        float y = mix(-4.0, max(arc, -4.0), on);
        float th = atan(aE.y * 4.0 * (1.0 - 2.0 * u) / (SPEED * LEAP)) * on;
        // (it rolls a little as it goes over the top)
        float roll = sin(u * 3.1416) * 0.35 * (fract(aD.z * 7.3) - 0.5);
        vec3 p = position * size;
        p.xy = vec2(p.x * cos(roll) - p.y * sin(roll), p.x * sin(roll) + p.y * cos(roll));
        float along = aD.y + SPEED * t + p.z - p.y * sin(th);
        vec2 xz = uPod.xy + fwd * along + side * (aD.x + p.x);
        vec3 w = vec3(xz.x, (y + p.y * cos(th)) * uMirror, xz.y);
        vec3 n = normalize(vec3(side.x, 0.0, side.y) * normal.x + vec3(0.0, 1.0, 0.0) * normal.y);
        if (uMirror < 0.0) w.x += sin(w.y * 2.6 + uTime * 1.7) * 0.07 * min(1.0, -w.y);
        vec4 wp = modelMatrix * vec4(w, 1.0);
        vWorld = wp.xyz; vN = n; vUp = normal.y; vY = y + p.y * cos(th); vBody = position.z;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uMirror;
      varying vec3 vWorld; varying vec3 vN; varying float vUp; varying float vY; varying float vBody;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        // only what is out of the water
        if (vY < 0.0) discard;
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        // slate on the back, pale on the belly, a darker cape along the spine
        vec3 alb = mix(vec3(0.3, 0.33, 0.31), vec3(0.045, 0.06, 0.075), smoothstep(-0.5, 0.35, vUp));
        vec3 col = alb * uSkyCol * (0.7 + 0.3 * n.y) + alb * uKeyCol * 0.3 * clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
        // wet: the sky stands on it, and a gleam of the low light runs down the back
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 R = reflect(-V, n); R.y = abs(R.y);
        col = mix(col, skyBase(normalize(R)), 0.12 + 0.5 * fres);
        col += uKeyCol * pow(max(dot(reflect(-V, n), uKeyDir), 0.0), 30.0) * 0.5 + uGlow * fres * pow(max(dot(-V, uSunDir), 0.0), 2.0) * 0.5;
        // water sheeting off it close to the surface
        col = mix(col, uHorizon * 1.1, (1.0 - smoothstep(0.0, 0.25, vY)) * 0.35);
        col = applyAir(col, vWorld);
        float a = 1.0;
        if (uMirror < 0.0) {
          // in the glass: darker, and going soft with depth
          col *= 0.62;
          a = 0.7 * (1.0 - smoothstep(1.5, 4.0, vY)) * smoothstep(0.0, 0.15, vY);
        }
        gl_FragColor = vec4(col, a);
        ${END}
      }`,
  });
}

// The rings a leap leaves: one where the dolphin came out, one where it went in, each staying where it was made
// and opening slowly on the glass. (Two instances a dolphin: aR.x = 0 out, 1 in.)
export function ringsGeometry(list: Dolphin[]) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  const a = new Float32Array(list.length * 2 * 4);
  const b = new Float32Array(list.length * 2 * 3);
  list.forEach((d, i) => {
    for (let k = 0; k < 2; k++) {
      a.set([d.side, -d.back, d.phase, d.size], (i * 2 + k) * 4);
      b.set([d.period, d.high, k], (i * 2 + k) * 3);
    }
  });
  g.setAttribute("aD", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aE", new THREE.InstancedBufferAttribute(b, 3));
  g.instanceCount = list.length * 2;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
export function makeRingMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, ...SEA_LIFE_U },
    vertexShader: /* glsl */ `
      attribute vec4 aD; attribute vec3 aE;
      varying vec2 vUv; varying float vAge; varying float vOn; varying vec3 vWorld;
      ${POD_GLSL}
      void main(){
        float t = uPodT;
        vec2 fwd = normalize(uPod.zw + vec2(1e-5));
        vec2 side = vec2(-fwd.y, fwd.x);
        float tau = mod(t + aD.z, aE.x);
        // when this ring was made: at the start of the present leap, or at the end of the present or the last one
        float t0 = t - tau + aE.z * LEAP - (aE.z > 0.5 && tau < LEAP ? aE.x : 0.0);
        vAge = t - t0;
        vOn = step(1.5, t0 - aE.z * LEAP) * step(t0 - aE.z * LEAP, ${(LAST - 3).toFixed(1)}) * step(0.0, uPodT);
        float R = 10.0;
        vec2 c = uPod.xy + fwd * (aD.y + SPEED * t0) + side * aD.x;
        vec4 wp = modelMatrix * vec4(c.x + position.x * R, 0.04, c.y + position.z * R, 1.0);
        vUv = position.xz * R; vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vAge; varying float vOn; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        if (vOn < 0.5 || vAge < 0.0 || vAge > 5.0) discard;
        float r = length(vUv);
        float rad = 0.4 + vAge * 1.8;
        float life = (1.0 - vAge / 5.0);
        // two fine rings going out, the second behind the first, and a moment of white where the water broke
        float ring = exp(-pow((r - rad) / 0.14, 2.0)) + 0.6 * exp(-pow((r - rad * 0.62) / 0.12, 2.0));
        float foam = exp(-r * r * 1.4) * exp(-vAge * 2.6) * 1.6;
        float a = (ring * life * life + foam) * (1.0 - smoothstep(8.0, 10.0, r));
        vec3 col = (uHorizon * 0.9 + uSkyCol * 0.5 + 0.05) * a * 0.55 * (1.0 - airAmt(vWorld) * 0.6);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}
