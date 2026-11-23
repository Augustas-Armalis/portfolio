import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";

// Sonata of the Stars: the layout of the night and the shaders of its great forms. Nothing here mounts.
//
// A calm black-blue sea under a sky of great stars. Out of the sea stand pyramids: dark, enormous, banded with pale
// veils of cloud and threaded with gold, as in the Allegro. The greatest stands straight ahead and has a door at
// its foot, a tall lancet of warm light on the sea: that is the way on.

export type Pyr = { x: number; z: number; w: number; h: number; seed: number };
// (w: half the base; h: height to the point; all metres. The first is the greatest; the next two flank the way in.)
export const PYRS: Pyr[] = [
  { x: 0, z: -300, w: 900, h: 2300, seed: 1.3 },
  { x: -1750, z: 1900, w: 470, h: 1150, seed: 4.1 },
  { x: 1850, z: 1500, w: 560, h: 1350, seed: 7.7 },
  { x: -3000, z: -1200, w: 900, h: 2200, seed: 2.2 },
  { x: 3300, z: -800, w: 800, h: 1800, seed: 5.5 },
  { x: -1300, z: -2700, w: 1000, h: 2700, seed: 9.1 },
  { x: 1900, z: -3000, w: 1100, h: 3100, seed: 3.3 },
  { x: -4300, z: 700, w: 700, h: 1600, seed: 6.6 },
  { x: 4300, z: 1900, w: 600, h: 1400, seed: 8.4 },
];
export const GREAT = PYRS[0];
// the door in the greatest one's near face: [half width, height where the straight sides end, height of the point]
export const DOOR = { half: 50, spring: 34, top: 112 };
// where its face stands at the foot (the door's sheet of light is hung just inside it)
export const DOOR_Z = GREAT.z + GREAT.w - 14;
export const SKY_RING = { r: 4700, y: 1250, h: 360 };

// a direction in the sky: azimuth (0 = ahead, toward -z, positive to the right), elevation, distance
export const skyAt = (az: number, el: number, d: number): [number, number, number] => {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e) * d, Math.sin(e) * d, -Math.cos(a) * Math.cos(e) * d];
};

export function pyramidGeometry(p: Pyr) {
  const c = new THREE.ConeGeometry(p.w * Math.SQRT2, p.h, 4, 1, true);
  c.translate(0, p.h / 2, 0);
  c.rotateY(Math.PI / 4);
  return c;
}

const DOOR_GLSL = /* glsl */ `
float doorHalf(float y){
  if (y < 0.0 || y > ${DOOR.top.toFixed(1)}) return -1.0;
  if (y < ${DOOR.spring.toFixed(1)}) return ${DOOR.half.toFixed(1)};
  float t = (y - ${DOOR.spring.toFixed(1)}) / ${(DOOR.top - DOOR.spring).toFixed(1)};
  return ${DOOR.half.toFixed(1)} * sqrt(max(1.0 - t * t, 0.0));
}`;

// One pyramid. Dark teal-blue stone; across it pale veils of cloud with a scalloped lower edge, each edge drawn in
// a thread of gold; small gold stars set on its faces; the four ridges lit by a line of light; its point alight.
// The greatest has the door cut in its near face, and within it a warm light (the back of the faces seen through).
export function makePyramidMaterial(p: Pyr, door: boolean) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, uH: { value: p.h }, uW: { value: p.w }, uSeed: { value: p.seed }, uDoor: { value: door ? 1 : 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal;
      void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uH; uniform float uW; uniform float uSeed; uniform float uDoor;
      varying vec3 vWorld; varying vec3 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${DOOR_GLSL}
      void main(){
        vec3 p = vLocal; float y = p.y;
        if (uDoor > 0.5 && p.z > 0.0 && abs(p.x) < doorHalf(y)) discard;
        vec3 col;
        float dist = length(vWorld - cameraPosition);
        if (!gl_FrontFacing) {
          // the inside of the faces: dark, or in the greatest, the warm light that fills it
          col = uDoor > 0.5 ? vec3(1.0, 0.72, 0.36) * (0.35 + 0.9 * exp(-y * 0.018)) * glowK() * 1.4 : vec3(0.004, 0.011, 0.018);
          gl_FragColor = vec4(applyAir(col, vWorld), 1.0);
        } else {
          vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
          float yk = clamp(y / uH, 0.0, 1.0);
          float s = abs(p.z) > abs(p.x) ? p.x : p.z;
          vec3 body = mix(vec3(0.008, 0.02, 0.033), vec3(0.022, 0.05, 0.07), pow(yk, 0.55));
          // veils: layers of pale cloud lying on the face, their lower edges scalloped and drawn in gold
          float wob = fbm(vec2(s * 0.0014 + uSeed, y * 0.0009 + uSeed * 0.3));
          float by = yk * 12.0 + (wob - 0.5) * 2.0 + sin(s * 0.0026 + uSeed * 3.0) * 0.3;
          float bi = floor(by); float bf = fract(by);
          float on = 0.35 + 0.65 * hash12(vec2(bi, uSeed));
          float aw = fwidth(by);
          float fade = 1.0 - smoothstep(0.12, 0.5, aw);
          float veil = smoothstep(0.0, max(0.04, aw), bf) * pow(1.0 - bf, 1.6) * on;
          body += mix(vec3(0.07, 0.11, 0.1), vec3(0.16, 0.15, 0.1), yk) * veil * (0.3 + 0.2 * fade);
          float thread = (1.0 - smoothstep(0.0, max(0.016, aw * 1.4), abs(bf - 0.02))) * on * fade;
          body += vec3(0.5, 0.36, 0.14) * thread * 0.26;
          // small stars set on the faces
          vec2 sc = vec2(s, y) / 150.0; vec2 si = floor(sc); vec2 sf = fract(sc) - 0.5;
          float sh = hash12(si + uSeed); vec2 off = (vec2(hash12(si + 3.1), hash12(si + 7.9)) - 0.5) * 0.5;
          float sr = max(0.05, fwidth(sc.x) * 1.4);
          float star = (1.0 - smoothstep(sr * 0.5, sr, length(sf - off))) * step(0.94, sh) * min(1.0, 0.05 / sr) * (0.7 + 0.3 * sin(uTime * 0.8 + sh * 50.0));
          body += vec3(1.0, 0.82, 0.48) * star * 0.9;
          float sunUp = 1.0;
          float lit = max(dot(n, uKeyDir), 0.0);
          col = body * (uSkyCol * 1.0 + 0.06 + uKeyCol * lit * 0.4 * sunUp);
          // the four ridges, each a line of light
          float rd = abs(abs(p.x) - abs(p.z));
          float rw = max(1.2, fwidth(rd) * 1.3);
          col += vec3(0.55, 0.42, 0.2) * (1.0 - smoothstep(0.0, rw, rd)) * 0.22 * (0.4 + 0.6 * yk) * min(1.0, 3.0 / max(rw, 1.0));
          // its point alight, and a soft light on the faces below it
          col += vec3(1.0, 0.78, 0.42) * pow(yk, 9.0) * 0.55 * glowK();
          col = applyAir(col, vWorld);
          // its feet in the mist of the sea
          col = mix(col, airCol(normalize(vWorld - cameraPosition)), mistBelow(vWorld, 260.0, 260.0) * 0.8);
          gl_FragColor = vec4(col, 1.0);
        }
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// the pyramids as they stand mirrored in the sea (a ray against each one's four planes: the sea's `worldReflect`)
export function pyramidReflectGLSL() {
  return /* glsl */ `
vec4 worldReflect(vec3 P, vec3 r){
  float best = 1e9; vec3 hit = vec3(0.0); float hH = 1.0; float hs = 0.0;
  ${PYRS.map(
    (p) => `{
    vec3 o = P - vec3(${p.x.toFixed(1)}, 0.0, ${p.z.toFixed(1)}); float t0 = 0.0; float t1 = 1e9; bool ok = true;
    for (int i = 0; i < 4; i++) {
      vec2 sd = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
      float den = (sd.x * r.x + sd.y * r.z) / ${p.w.toFixed(1)} + r.y / ${p.h.toFixed(1)};
      float num = 1.0 - (sd.x * o.x + sd.y * o.z) / ${p.w.toFixed(1)};
      if (den > 1e-6) t1 = min(t1, num / den); else if (den < -1e-6) t0 = max(t0, num / den); else if (num < 0.0) ok = false;
    }
    if (ok && t0 >= 0.0 && t0 < t1 && t0 < best) { best = t0; hit = P + r * t0; hH = ${p.h.toFixed(1)}; hs = ${p.seed.toFixed(2)}; }
  }`,
  ).join("\n")}
  if (best > 1e8) return vec4(0.0);
  float yk = clamp(hit.y / hH, 0.0, 1.0);
  vec3 body = mix(vec3(0.011, 0.027, 0.042), vec3(0.03, 0.066, 0.088), pow(yk, 0.55));
  body += vec3(0.07, 0.1, 0.09) * smoothstep(0.55, 0.9, sin(yk * 75.0 + hs));
  vec3 col = body * (uSkyCol * 1.5 + 0.1);
  col = mix(col, skyBase(r) * 0.9, 1.0 - exp(-best * 0.00024));
  return vec4(col, 1.0);
}`;
}

// The band of stars that runs level round the whole sky, as in both paintings: a dark ribbon sown with gold
// eight-pointed stars, its edges thin gold lines. A great ring about the eye, far beyond everything.
export function makeStarBand() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vP;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      float starAt(vec2 q, float sz){
        // eight points: a cross and a turned cross, fine strokes, a hot heart
        vec2 a = abs(q); vec2 d = abs(vec2(q.x + q.y, q.x - q.y)) * 0.7071;
        float r = length(q);
        float k1 = (1.0 - smoothstep(0.0, 0.07, min(a.x, a.y))) * (1.0 - smoothstep(0.0, sz, r));
        float k2 = (1.0 - smoothstep(0.0, 0.07, min(d.x, d.y))) * (1.0 - smoothstep(0.0, sz * 0.62, r));
        return max(k1, k2 * 0.8) + (1.0 - smoothstep(0.0, sz * 0.2, r));
      }
      void main(){
        float u = vUv.x * 260.0; float v = (vUv.y - 0.5) * 2.0;
        float edge = 1.0 - smoothstep(0.78, 1.0, abs(v + (vnoise(vec2(u * 0.11, 2.0)) - 0.5) * 0.12));
        vec3 col = vec3(0.012, 0.008, 0.012);
        vec3 gold = vec3(1.0, 0.8, 0.44);
        float st = 0.0;
        for (int j = 0; j < 2; j++) {
          vec2 g = vec2(u * (j == 0 ? 1.0 : 1.7) + float(j) * 3.0, v * 2.6 + float(j) * 5.0);
          vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          float h = hash12(id + float(j) * 17.0);
          vec2 off = (vec2(hash12(id + 3.7), hash12(id + 9.1)) - 0.5) * 0.4;
          st += starAt(f - off, 0.2 + 0.28 * h) * step(0.3, h) * (0.6 + 0.4 * sin(uTime * (0.5 + h) + h * 40.0));
        }
        col += gold * st * 1.5;
        // a thin gold line along each edge
        float ln = 1.0 - smoothstep(0.0, 0.025, abs(abs(v) - 0.92));
        col += gold * ln * 0.45;
        float a = edge * (0.82 + 0.18 * fbm(vec2(u * 0.4, v)));
        gl_FragColor = vec4(col * mix(1.0, 0.36, uNight) * 1.2, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
