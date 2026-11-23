import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";
import { FRIEND_U, GLSL_ORB } from "./cave";
import { TUNNEL, floorAt } from "./shape";

// The cave's water: a stream that comes out of the dark beside the tunnel's mouth and winds down the cavern beside
// the way to the pool at her feet, and small pools on the tunnel's floor where the drips from its roof fall, each
// ringed by the ripples they make. Dark teal, flowing, the orb's light lying on it in a broken path. One mesh.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export function waterGeometry(pathX: (z: number) => number, mobile: boolean) {
  const pos: number[] = [];
  const uv: number[] = [];
  const kind: number[] = [];
  const idx: number[] = [];
  // the stream: from beside the tunnel's mouth to the pool before her
  const N = mobile ? 90 : 160;
  const z0 = 600;
  const z1 = 70;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = z0 + (z1 - z0) * t;
    const x = pathX(z) + 34 + 14 * Math.sin(t * 9.0) + 6 * Math.sin(t * 23.0) + t * 10;
    const w = 3.2 + 2.6 * Math.sin(t * 5.0 + 1) ** 2 + t * 3;
    const dx = Math.cos(t * 9.0) * 14 * 9 + Math.cos(t * 23) * 6 * 23 + 10;
    const dz = z1 - z0;
    const l = Math.hypot(dx, dz) || 1;
    const sx = -dz / l;
    const sz = dx / l;
    for (const s of [-1, 1]) {
      const px = x + sx * w * s;
      const pz = z + sz * w * s;
      pos.push(px, floorAt(px, pz) + 0.35, pz);
      uv.push(t * 60, s);
      kind.push(0);
    }
    if (i < N) {
      const q = i * 2;
      idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
    }
  }
  // pools on the tunnel's floor
  const R = 20;
  for (let p = 0; p < 6; p++) {
    const cz = TUNNEL.z0 + 30 + p * 38 + (p % 2) * 9;
    const cx = (p % 2 ? 1 : -1) * (5 + (p % 3) * 3);
    const r = 3.5 + (p % 3) * 1.6;
    const base = pos.length / 3;
    pos.push(cx, floorAt(cx, cz) + 0.25, cz);
    uv.push(0, 0);
    kind.push(1);
    for (let i = 0; i <= R; i++) {
      const a = (i / R) * Math.PI * 2;
      const x = cx + Math.cos(a) * r * (1 + 0.15 * Math.sin(a * 3 + p));
      const z = cz + Math.sin(a) * r;
      pos.push(x, floorAt(cx, cz) + 0.25, z);
      uv.push(1, a);
      kind.push(1);
      if (i < R) idx.push(base, base + 1 + i + 1, base + 1 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U },
    vertexShader: /* glsl */ `
      attribute float aKind;
      varying vec2 vUv; varying float vKind; varying vec3 vWorld;
      void main(){
        vUv = uv; vKind = aKind;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vKind; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_ORB}
      void main(){
        float t = uTime;
        vec3 V = normalize(cameraPosition - vWorld);
        vec2 slope;
        float edge;
        if (vKind < 0.5) {
          // the stream: flowing down its length, faster in its middle
          float across = vUv.y;
          float sp = 1.0 - across * across * 0.7;
          vec2 q = vec2(vUv.x - t * 1.6 * sp, across * 3.0);
          slope = vec2(vnoise(q * vec2(1.3, 2.0)) - vnoise(q * vec2(1.3, 2.0) + 0.7), vnoise(q * vec2(4.0, 5.0)) - 0.5) * 0.35;
          edge = smoothstep(1.0, 0.7, abs(across));
        } else {
          // a pool: rings going out from where the drop fell, and fading
          float r = vUv.x;
          float ph = fract(t * 0.35 + floor(vWorld.z * 0.1) * 0.37);
          float ring = sin((r - ph) * 40.0) * exp(-abs(r - ph) * 6.0) * (1.0 - ph);
          slope = vec2(ring * 0.25, ring * 0.12);
          edge = smoothstep(1.0, 0.75, r);
        }
        vec3 n = normalize(vec3(slope.x, 1.0, slope.y));
        float fr = 0.03 + 0.28 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        // the orb mirrored: where the eye's reflected ray points at it, a broken path of its light
        vec3 rd = reflect(-V, n);
        vec3 toOrb = normalize(uOrb - vWorld);
        float glint = pow(max(dot(rd, toOrb), 0.0), 60.0) * 2.2 + pow(max(dot(rd, toOrb), 0.0), 8.0) * 0.25;
        vec3 deep = vec3(0.004, 0.016, 0.016);
        vec3 col = deep + airCol(rd) * fr * 0.7 + vec3(1.0, 0.8, 0.5) * glint * uOrbK * 1.4;
        col += orbLight(vWorld, vec3(0.0, 1.0, 0.0), 0.3, 140.0).rgb * 0.06;
        col = applyAir(col, vWorld) + orbScatter(vWorld);
        gl_FragColor = vec4(col, edge * 0.92);
        ${END}
      }`,
  });
}
