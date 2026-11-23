import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, rng } from "../kit";
import { PORTAL_U } from "../portal";
import { FRIEND_U } from "./cave";
import { HEAD, ORB } from "./shape";

// The light of the cave: the orb itself (and the world seen through it), the crown of rays streaming from her
// head, the motes that drift in the orb's light, and the long faint upright strokes that hang in the air as they
// hang over the whole picture.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------- the orb ----------
// From afar a pale disc of light drawn in pastel: cream at its heart, warmer to its edge, ringed with circles of
// pink and ochre chalk the way he drew it, and a fine dark line round it. As the plane comes near its heart opens:
// through it is the next world itself (worlds/portal.tsx draws it), and the light of the orb runs round the
// opening like the lip of a lens. Inside it there is only that world. On a phone, or before that world is ready,
// the opening shows its sky painted: a gold air over a dull gold plain and a great low sun.
const SUN_D = new THREE.Vector3(Math.sin((7 * Math.PI) / 180) * Math.cos((13 * Math.PI) / 180), Math.sin((13 * Math.PI) / 180), -Math.cos((7 * Math.PI) / 180) * Math.cos((13 * Math.PI) / 180)).normalize();
export function makeOrbMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, ...PORTAL_U, uSunD: { value: SUN_D }, uOpen: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunD; uniform float uOpen;
      uniform sampler2D tPortal; uniform float uPortalK; uniform vec2 uPortalRes;
      varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      uniform vec3 uOrb; uniform float uOrbK;
      // the Sonata of the Sun's air, painted, for when its world cannot be drawn here
      vec3 painted(vec3 d){
        float hp = max(d.y, 0.0);
        vec3 col = mix(vec3(0.72, 0.49, 0.15), vec3(0.5, 0.39, 0.15), smoothstep(0.0, 0.3, pow(hp, 0.8)));
        col = mix(col, vec3(0.3, 0.29, 0.2), smoothstep(0.2, 0.95, hp));
        float s = max(dot(d, uSunD), 0.0);
        col += vec3(0.92, 0.6, 0.18) * (pow(s, 9.0) * 0.3 + pow(s, 60.0) * 0.9);
        // the sun, a pale disc with a ring of fine rays
        float a = acos(clamp(s, -1.0, 1.0));
        col += vec3(1.0, 0.92, 0.7) * (1.0 - smoothstep(0.045, 0.05, a)) * 2.0;
        // the plain: dull gold, strips of field going away to the horizon
        if (d.y < 0.0) {
          vec2 g = d.xz / max(-d.y, 0.02) * 30.0;
          float strip = vnoise(vec2(g.x * 0.02, g.y * 0.004));
          vec3 land = mix(vec3(0.36, 0.25, 0.09), vec3(0.5, 0.36, 0.13), strip);
          col = mix(land, vec3(0.62, 0.45, 0.16), smoothstep(-0.12, 0.0, d.y));
        }
        // far bells in the haze, blue-grey, along the horizon
        float az = atan(d.x, -d.z);
        float bell = 0.0;
        for (int i = 0; i < 5; i++) {
          float c = -0.5 + float(i) * 0.26 + 0.05 * sin(float(i) * 4.1);
          float hgt = 0.05 + 0.04 * fract(sin(float(i) * 12.9) * 43.7);
          float x = (az - c) / (hgt * 0.7);
          bell = max(bell, hgt * sqrt(max(1.0 - x * x, 0.0)));
        }
        col = mix(col, vec3(0.34, 0.34, 0.36), step(d.y, bell) * step(-0.004, d.y) * 0.7);
        return col * 1.25;
      }
      void main(){
        vec3 n = normalize(vN);
        vec3 toEye = cameraPosition - vWorld;
        vec3 V = normalize(toEye);
        float camD = length(cameraPosition - uOrb);
        float inside = 1.0 - step(${ORB.r.toFixed(1)}, camD);
        if (!gl_FrontFacing) n = -n;
        float ndv = clamp(dot(n, V), 0.0, 1.0);
        // where on the disc: 0 at its heart, 1 at its edge
        float r = sqrt(1.0 - ndv * ndv);
        // round the disc, measured against the world's own up (so the rings never turn as the plane banks)
        vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), V) + vec3(0.0001));
        vec3 up = cross(V, rt);
        float ang = atan(dot(n, up), dot(n, rt));
        float t = uTime;
        // chalk rings: circles laid by hand, none quite round, drifting very slowly outward
        float wob = vnoise(vec2(ang * 2.2, r * 3.0 + 1.0)) * 0.6 + vnoise(vec2(ang * 5.0 + 3.0, r * 6.0)) * 0.4;
        float rr = r * 11.0 + wob * 0.9 - t * 0.05;
        float ring = smoothstep(0.55, 0.95, abs(sin(rr * 3.14159)));
        float fw = fwidth(rr);
        ring = mix(ring, 0.35, smoothstep(0.25, 0.7, fw));
        vec3 cream = vec3(1.0, 0.95, 0.84);
        vec3 warm = vec3(1.0, 0.78, 0.52);
        vec3 col = mix(cream, warm, smoothstep(0.2, 0.95, r));
        col = mix(col, vec3(0.98, 0.7, 0.58), ring * 0.28 * smoothstep(0.05, 0.4, r));
        // the heart is brightest, the light gathers again just inside the rim
        float k = 1.7 + 0.7 * (1.0 - smoothstep(0.0, 0.75, r)) + 0.25 * smoothstep(0.75, 0.92, r);
        // it breathes
        k *= 0.95 + 0.05 * sin(t * 0.55) + 0.02 * sin(t * 1.7 + 1.0);
        col *= k * uOrbK;
        // the fine dark line he drew round it
        col *= 1.0 - 0.72 * smoothstep(0.955, 0.995, r) * (1.0 - inside);
        // the opening: the next world, through the orb's heart
        float open = max(uOpen, inside);
        float hole = (1.0 - smoothstep(mix(0.5, 1.02, uOpen * uOpen), mix(0.12, 0.8, uOpen * uOpen), r)) * open;
        hole = max(hole, inside);
        vec3 dir = -V;
        vec3 beyond = painted(dir);
        if (uPortalK > 0.003) beyond = mix(beyond, texture2D(tPortal, gl_FragCoord.xy / uPortalRes).rgb, clamp(uPortalK * 1.4, 0.0, 1.0));
        // the lip of the opening, where the orb's light runs round it
        float lip = hole * (1.0 - hole) * 4.0;
        col = mix(col, beyond, hole) + vec3(1.0, 0.86, 0.6) * lip * 0.9;
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- the crown of rays ----------
// Long strokes from the crown of her head, up and back, fanning out: green, yellow-green, gold, a few dark, each
// broken as a pastel stroke is broken, and along every one a slow brightening runs outward. Each stroke is a strip
// that turns about its own line to face the eye, never thinner on the screen than a pixel and a half (thinner, it
// dims instead).
export function raysGeometry(n: number, seed = 7) {
  const r = rng(seed);
  const SEG = 18;
  const pos: number[] = [];
  const tan: number[] = [];
  const at: number[] = [];
  const idx: number[] = [];
  const S = HEAD.h;
  for (let i = 0; i < n; i++) {
    // where it rises from: along the crown, from the hairline over the top to the back
    const a = r();
    const ang = Math.PI * (0.18 + a * 0.62); // round the crown, from the brow (forward) to the back
    const ru = Math.cos(ang) * 0.37;
    const rv = Math.sin(ang) * 0.47 + 0.02;
    const z = (r() - 0.5) * 22 * Math.sin(ang);
    const root = new THREE.Vector3(HEAD.x - ru * S, HEAD.y + rv * S, z);
    // which way it goes: up from the brow, back and up from the crown, lower toward the back
    const phi = ((1 - a) * 86 + a * 16 + (r() - 0.5) * 16) * (Math.PI / 180);
    const dir = new THREE.Vector3(Math.cos(phi), Math.sin(phi), (r() - 0.5) * 0.5 + z * 0.012).normalize();
    const len = 60 + Math.pow(r(), 0.7) * 190 * (0.55 + 0.45 * Math.sin(a * Math.PI));
    const bend = (r() - 0.35) * 0.18;
    const w = 0.7 + r() * 2.2;
    const col = r();
    const sd = r();
    const b0 = pos.length / 3;
    const p = new THREE.Vector3();
    const prev = new THREE.Vector3();
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      // (sunk a little into the hair at its root; curving upward as it goes)
      p.copy(root)
        .addScaledVector(dir, (t - 0.03) * len)
        .add(new THREE.Vector3(0, bend * t * t * len, 0));
      const d = s === 0 ? dir : p.clone().sub(prev).normalize();
      for (const side of [-1, 1]) {
        pos.push(p.x, p.y, p.z);
        tan.push(d.x, d.y, d.z);
        at.push(t, side, w, Math.floor(col * 4) + sd * 0.999);
      }
      prev.copy(p);
      if (s < SEG) {
        const q = b0 + s * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aTan", new THREE.Float32BufferAttribute(tan, 3));
  g.setAttribute("aAt", new THREE.Float32BufferAttribute(at, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
export function makeRaysMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, uPx: { value: 0.001 } },
    vertexShader: /* glsl */ `
      attribute vec3 aTan; attribute vec4 aAt;
      uniform float uPx;
      varying vec4 vAt; varying float vDim; varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 toEye = cameraPosition - wp.xyz;
        float dist = length(toEye);
        vec3 side = normalize(cross(aTan, toEye / dist));
        // the stroke tapers at both ends
        float taper = smoothstep(0.0, 0.08, aAt.x) * (1.0 - 0.6 * aAt.x);
        float w = aAt.z * taper;
        // never under a pixel and a half: wider, and dimmer by as much
        float minW = dist * uPx * 1.5;
        vDim = clamp(w / max(minW, 0.0001), 0.0, 1.0);
        w = max(w, minW);
        wp.xyz += side * aAt.y * w;
        vAt = aAt; vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec4 vAt; varying float vDim; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float t = vAt.x;
        float kind = floor(vAt.w);
        float seed = fract(vAt.w);
        float across = exp(-vAt.y * vAt.y * 2.6);
        // broken as chalk is: gaps along it, and a grain across
        float brk = smoothstep(0.25, 0.55, vnoise(vec2(t * 9.0 + seed * 40.0, seed * 7.0)));
        float grain = 0.75 + 0.25 * vnoise(vec2(t * 60.0, vAt.y * 3.0 + seed * 9.0));
        float ends = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.55 + 0.3 * seed, 1.0, t));
        // a slow brightening running outward along it
        float run = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(t * 7.0 - uTime * 0.7 + seed * 6.2832), 3.0);
        vec3 col = kind < 1.0 ? vec3(0.22, 0.5, 0.2) : kind < 2.0 ? vec3(0.6, 0.7, 0.18) : kind < 3.0 ? vec3(1.0, 0.72, 0.28) : vec3(0.3, 0.42, 0.5);
        // nearer her head the strokes are warmer, the orb's light on them
        col = mix(col, vec3(1.0, 0.62, 0.24), (1.0 - smoothstep(0.0, 0.25, t)) * 0.5);
        float a = across * brk * grain * ends * run * vDim;
        a *= 1.0 - 0.85 * airAmt(vWorld);
        gl_FragColor = vec4(col * a * 0.55, 1.0);
        ${END}
      }`,
  });
}

// ---------- motes, and the hanging strokes ----------
// Points of light: each a soft round dab on a quad that faces the eye (instanced), never under a pixel and a half
// on the screen (smaller, it dims). They drift on slow currents; those near the orb rise round it and are gone at
// the top of their climb, and come again from below.
export type MoteSet = { c: [number, number, number]; r: [number, number, number]; n: number; size: [number, number]; rise: number };
export function motesGeometry(sets: MoteSet[], seed = 3) {
  const r = rng(seed);
  const base = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.attributes.position);
  const total = sets.reduce((s, m) => s + m.n, 0);
  const a = new Float32Array(total * 4);
  const b = new Float32Array(total * 4);
  let i = 0;
  for (const m of sets)
    for (let k = 0; k < m.n; k++, i++) {
      // (inside an ellipsoid, thicker toward its middle)
      let x = 0;
      let y = 0;
      let z = 0;
      do {
        x = r() * 2 - 1;
        y = r() * 2 - 1;
        z = r() * 2 - 1;
      } while (x * x + y * y + z * z > 1);
      const s = Math.pow(r(), 0.6);
      a.set([m.c[0] + x * m.r[0] * s, m.c[1] + y * m.r[1] * s, m.c[2] + z * m.r[2] * s, m.size[0] + r() * (m.size[1] - m.size[0])], i * 4);
      b.set([r(), r(), m.rise, m.r[1] * 2], i * 4);
    }
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = total;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 200, 200), 1400);
  return g;
}
export function makeMotesMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, uPx: { value: 0.001 } },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB;
      uniform float uTime; uniform float uPx; uniform vec3 uOrb;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vWorld;
      void main(){
        vec3 p = aA.xyz;
        float ph = aB.x * 6.2832;
        // rising (those that rise), the climb starting again from below with a fade at both ends
        float climb = fract(aB.y + uTime * aB.z / max(aB.w, 1.0));
        p.y += (climb - 0.5) * aB.w * step(0.001, aB.z);
        float life = aB.z > 0.0 ? smoothstep(0.0, 0.15, climb) * (1.0 - smoothstep(0.8, 1.0, climb)) : 1.0;
        // slow currents
        p += vec3(sin(uTime * 0.11 + ph + p.y * 0.01), sin(uTime * 0.07 + ph * 1.3) * 0.5, cos(uTime * 0.09 + ph * 0.7 + p.x * 0.01)) * (3.0 + aA.w * 2.0);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vec4 mv = viewMatrix * wp;
        float dist = -mv.z;
        float size = aA.w;
        float minS = dist * uPx * 1.5;
        float dim = clamp(size / max(minS, 0.0001), 0.0, 1.0);
        dim *= dim;
        size = max(size, minS);
        mv.xy += position.xy * size;
        vUv = position.xy;
        // brighter in the orb's light
        float od = length(wp.xyz - uOrb);
        float lit = 0.35 + 1.4 / (1.0 + pow(od / 90.0, 2.0));
        vA = dim * life * lit * (0.75 + 0.25 * sin(uTime * (0.8 + aB.x) + ph)) * smoothstep(1.5, 8.0, dist);
        vCol = mix(vec3(1.0, 0.82, 0.48), vec3(0.62, 0.82, 0.4), aB.y);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float r = length(vUv);
        float a = exp(-r * r * 7.0) * (1.0 - smoothstep(0.72, 1.0, r)) * vA;
        a *= 1.0 - 0.8 * airAmt(vWorld);
        gl_FragColor = vec4(vCol * a, 1.0);
        ${END}
      }`,
  });
}

// The upright strokes: tall, faint, soft-ended, turned about the upright to face the eye, drifting down very slowly
// and breathing in and out of sight. As thin as a stroke of chalk; never thinner than a pixel and a half.
export function streaksGeometry(n: number, seed = 11) {
  const r = rng(seed);
  const base = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.attributes.position);
  const a = new Float32Array(n * 4);
  const b = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // through the chamber, more toward her and the orb, none in the passage
    const x = (r() * 2 - 1) * 380;
    const z = -420 + r() * 900;
    const y = 30 + r() * 380;
    a.set([x, y, z, 10 + r() * 40], i * 4);
    b.set([0.5 + r() * 1.3, r(), r(), r()], i * 4);
  }
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 200, 0), 900);
  return g;
}
export function makeStreaksMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, uPx: { value: 0.001 } },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB;
      uniform float uTime; uniform float uPx; uniform vec3 uOrb;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vWorld;
      void main(){
        vec3 c = aA.xyz;
        c.y -= fract(aB.y + uTime * 0.004) * 60.0 - 30.0;
        vec4 wc = modelMatrix * vec4(c, 1.0);
        vec3 toEye = cameraPosition - wc.xyz;
        float dist = length(toEye);
        vec3 side = normalize(vec3(toEye.z, 0.0, -toEye.x) + vec3(0.0001));
        float w = aB.x;
        float minW = dist * uPx * 1.5;
        float dim = clamp(w / max(minW, 0.0001), 0.0, 1.0);
        w = max(w, minW);
        vec3 wp = wc.xyz + side * position.x * w + vec3(0.0, position.y * aA.w, 0.0);
        vUv = position.xy;
        float od = length(wc.xyz - uOrb);
        float lit = 0.4 + 1.2 / (1.0 + pow(od / 160.0, 2.0));
        // each breathes in and out of sight on its own slow time
        float breath = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(uTime * (0.05 + 0.08 * aB.z) + aB.w * 6.2832));
        vA = dim * lit * breath * smoothstep(20.0, 60.0, dist);
        vCol = aB.z < 0.55 ? vec3(0.55, 0.72, 0.28) : aB.z < 0.85 ? vec3(0.9, 0.75, 0.38) : vec3(0.32, 0.5, 0.62);
        vWorld = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float a = exp(-vUv.x * vUv.x * 3.0) * (1.0 - smoothstep(0.4, 1.0, abs(vUv.y))) * vA;
        a *= 1.0 - 0.75 * airAmt(vWorld);
        gl_FragColor = vec4(vCol * a * 0.09, 1.0);
        ${END}
      }`,
  });
}
