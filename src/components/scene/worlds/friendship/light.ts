import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, rng } from "../kit";
import { PORTAL_U, STILL_U } from "../portal";
import { FRIEND_U } from "./cave";
import { ORB, PAINT } from "./shape";

// The light of the cave: the orb itself (and the world seen through it), the motes that drift in the orb's light, and the long faint upright strokes that hang in the air as they
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
export function makeOrbMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, ...PORTAL_U, ...STILL_U, uSunD: { value: SUN_D }, uOpen: { value: 0 }, tMap: { value: map } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunD; uniform float uOpen; uniform sampler2D tMap;
      uniform sampler2D tPortal; uniform float uPortalK; uniform vec2 uPortalRes; uniform float uPortalGain; uniform float uPortalFar;
      uniform sampler2D tStill; uniform mat4 uStillMat; uniform float uStillOn; uniform float uLiveK;
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
        return col * 0.9;
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
        // his own orb: the disc as the eye sees it, read from the picture (its chalk rings, its cream, its ochre
        // edge), given its light; turning very slowly, so the strokes are never quite still
        float ca = cos(t * 0.02), sa = sin(t * 0.02);
        vec2 q = vec2(dot(n, rt), dot(n, up));
        q = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
        vec2 ppx = vec2(${PAINT.cx.toFixed(1)}, ${PAINT.cy.toFixed(1)}) + vec2(q.x, -q.y) * ${(PAINT.r * 0.97).toFixed(1)};
        vec3 paint = texture2D(tMap, vec2(ppx.x / ${PAINT.w.toFixed(1)}, 1.0 - ppx.y / ${PAINT.h.toFixed(1)})).rgb;
        // (her fingers lie over it in the picture: they are hers, on her hand in front; here only the orb's cream)
        paint = mix(vec3(0.95, 0.86, 0.68), paint, smoothstep(0.3, 0.55, dot(paint, vec3(0.3, 0.55, 0.15))));
        float k = 1.05 + 0.35 * (1.0 - smoothstep(0.0, 0.8, r));
        k *= 0.95 + 0.05 * sin(t * 0.55) + 0.02 * sin(t * 1.7 + 1.0);
        // (it is the brightest thing in the cave from the first frame, whatever beat the story is at: warm white at
        // its heart, gold toward its rim, bright enough to bloom)
        vec3 col = paint * k * (1.4 + 0.5 * uOrbK);
        col = mix(col, vec3(1.3, 0.9, 0.46) * (1.2 + 0.4 * uOrbK), smoothstep(0.5, 0.93, r) * 0.45);
        // the fine dark line he drew round it
        col *= 1.0 - 0.72 * smoothstep(0.955, 0.995, r) * (1.0 - inside);
        // the opening: the next world, through the orb's heart
        float open = max(uOpen, inside);
        // (open in its heart from the first sight of it, widening as the plane comes)
        float hole = (1.0 - smoothstep(mix(0.3, 0.8, uOpen * uOpen), mix(0.58, 1.02, uOpen * uOpen), r)) * open;
        hole = max(hole, inside);
        vec3 dir = -V;
        vec3 beyond = painted(dir) * 1.15;
        // (the Sun as the gates' windows show it, worlds/portal.tsx: from afar its still, looked up by the direction from the
        // eye through each point of the orb, carried by the same turn; from about 130 m the live picture comes over it, and
        // the last stretch is the live picture alone. The live target is never read until it has been drawn: before that its
        // sampler is empty, which is black.)
        if (uPortalK > 0.003) {
          vec3 pic = vec3(0.0);
          if (uLiveK > 0.0) pic = texture2D(tPortal, gl_FragCoord.xy / uPortalRes).rgb;
          if (uStillOn > 0.5 && uLiveK < 1.0) {
            vec4 sc = uStillMat * vec4(normalize(vWorld - cameraPosition), 0.0);
            vec2 su = clamp(sc.xy / max(sc.w, 1e-4) * 0.5 + 0.5, 0.0, 1.0);
            pic = mix(texture2D(tStill, su).rgb, pic, uLiveK);
          }
          float have = max(uStillOn, uLiveK);
          pic *= uPortalGain;
          // (from far it must read as a doorway on a golden world in the cream of the orb: its gold deepened, a little
          // darker; gone by the time the picture is live, where it is shown exactly as it will be)
          float pl = dot(pic, vec3(0.2126, 0.7152, 0.0722));
          pic = mix(vec3(pl), pic, 1.0 + 0.9 * uPortalFar) * (1.0 - 0.18 * uPortalFar);
          beyond = mix(beyond, pic, clamp(uPortalK * 1.4, 0.0, 1.0) * have);
        }
        // the lip of the opening, where the orb's light runs round it
        float lip = hole * (1.0 - hole) * 4.0;
        // (the picture is the Sun at the exposure it will have: its gain, as the gates' windows give it, and no more: it was
        // taken at 1.15 with no gain, which showed the Sun about twice as bright as it is the frame the worlds change places)
        col = mix(col, beyond, hole) + vec3(1.2, 0.9, 0.55) * lip * 1.1;
        gl_FragColor = vec4(col, 1.0);
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
// (tint: the colour of the most of them; a falling drip is given a negative rise)
export function makeMotesMaterial(tint?: [number, number, number]) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, uPx: { value: 0.001 }, uK: { value: 1 }, uTint: { value: new THREE.Color(...(tint ?? [1, 0.82, 0.48])) } },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB;
      uniform float uTime; uniform float uPx; uniform vec3 uOrb; uniform float uK; uniform vec3 uTint;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vWorld;
      void main(){
        vec3 p = aA.xyz;
        float ph = aB.x * 6.2832;
        // rising (those that rise), the climb starting again from below with a fade at both ends
        float climb = fract(aB.y + uTime * aB.z / max(aB.w, 1.0));
        p.y += (climb - 0.5) * aB.w * step(0.001, abs(aB.z));
        float life = abs(aB.z) > 0.0 ? smoothstep(0.0, 0.15, climb) * (1.0 - smoothstep(0.8, 1.0, climb)) : 1.0;
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
        vA = uK * dim * life * lit * (0.75 + 0.25 * sin(uTime * (0.8 + aB.x) + ph)) * smoothstep(1.5, 8.0, dist);
        vCol = mix(uTint, vec3(0.62, 0.82, 0.4), aB.y * 0.6);
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
    const x = (r() * 2 - 1) * 1150;
    const z = -2300 + r() * 2600;
    const y = 60 + r() * 900;
    a.set([x, y, z, 24 + r() * 80], i * 4);
    b.set([3 + r() * 8, r(), r(), r()], i * 4);
  }
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 500, -1000), 2600);
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
        gl_FragColor = vec4(vCol * a * 0.03, 1.0);
        ${END}
      }`,
  });
}
