import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";
import { ISLAND_U } from "./island";
import { GROTTO, ISLAND, PROF_GLSL } from "./shape";

// The water of Tranquility: glass. The whole sky stands in it, and at night every star and the river of stars
// (drawn by the sky's own arithmetic, so the mirror is exact); the island stands in it doubled, a fifth longer
// than it is, as he drew it; each eye drops a long thin path of light straight down it toward whoever looks.
// It is never quite dead: the longest, slowest swell passes under the mirror, and now and then, far off, a ring
// opens where something rose.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export function makeGlass() {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      ...ISLAND_U,
      uDeep: { value: new THREE.Color(0.1, 0.125, 0.1) },
      uTint: { value: new THREE.Color(0.9, 0.97, 0.93) },
      uLightCol: { value: new THREE.Color(1.0, 0.88, 0.62) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec2 vCamL;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vLocal = (wp.xyz - modelMatrix[3].xyz); vCamL = cameraPosition.xz - modelMatrix[3].xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uEyes[2]; uniform vec2 uEyeK; uniform vec3 uDeep; uniform vec3 uTint; uniform vec3 uLightCol; uniform float uOpen; uniform float uMagic;
      varying vec3 vWorld; varying vec3 vLocal; varying vec2 vCamL;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${PROF_GLSL}
      // (the sky's stars, exactly: see World.tsx)
      vec3 hash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
      vec3 starLayer(vec3 dir, float scale, float density){
        vec3 p = dir * scale; vec3 id = floor(p); vec3 f = fract(p) - 0.5;
        vec3 hh = hash33(id);
        float dd = length(f - (hh - 0.5) * 0.7);
        float px = fwidth(dd) * 1.2;
        float r0 = mix(0.018, 0.055, hh.z * hh.z * hh.z);
        float r = max(r0, px);
        float core = smoothstep(r, 0.0, dd) * (r0 * r0) / (r * r) * 9.0;
        float tw = 0.72 + 0.28 * sin(uTime * (1.0 + hh.x * 3.0) + hh.y * 6.283);
        vec3 tint = mix(vec3(1.0, 0.86, 0.7), vec3(0.74, 0.84, 1.0), hh.y);
        return tint * core * tw * step(1.0 - density, hh.x) * (0.4 + 2.6 * hh.z * hh.z);
      }
      // the island doubled: where the mirrored ray crosses the island's long axis, under its outline
      vec4 islandMirror(vec2 P, vec3 r){
        float dz = ${ISLAND.z.toFixed(1)} - P.y;
        if (abs(r.z) < 1e-4 || dz / r.z < 0.0) return vec4(0.0);
        float t = dz / r.z;
        float xn = (P.x + r.x * t - ${ISLAND.x.toFixed(1)}) / ${ISLAND.half.toFixed(1)};
        if (abs(xn) > 1.0) return vec4(0.0);
        float y = r.y * t;
        float h = islandProf(xn) * 1.2 + 2.0;
        float m = smoothstep(-1.0, 2.5 + t * 0.012, h - y);
        float far = clamp((0.5 - xn) / 1.5, 0.0, 1.0);
        vec3 c = mix(vec3(0.026, 0.066, 0.036), vec3(0.1, 0.115, 0.13), far);
        // the long soft upright strokes of the reflection, and a little more light where it meets the waterline
        c *= 0.84 + 0.26 * vnoise(vec2(P.x * 0.07, P.y * 0.004)) + 0.2 * exp(-y * 0.04);
        c *= uSkyCol * 0.95 + 0.04;
        return vec4(c, m * (0.97 - 0.25 * far));
      }
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(vWorld - cameraPosition);
        vec2 q = vLocal.xz;
        // glass, with the longest and slowest of swells under it; flat as a table far off
        vec2 fl = vec2(uTime * 0.012, uTime * 0.008);
        float e = 0.8;
        float h0 = fbm(q * 0.03 + fl) + 0.3 * vnoise(q * 0.22 - fl * 4.0);
        float hx = fbm((q + vec2(e, 0.0)) * 0.03 + fl) + 0.3 * vnoise((q + vec2(e, 0.0)) * 0.22 - fl * 4.0);
        float hz = fbm((q + vec2(0.0, e)) * 0.03 + fl) + 0.3 * vnoise((q + vec2(0.0, e)) * 0.22 - fl * 4.0);
        float calm = 0.16 / (1.0 + dist * 0.016);
        vec2 slope = vec2(h0 - hx, h0 - hz) * 1.5 * calm;
        // rings where something rose, far apart in place and time, opening slowly and dying as they go
        for (int i = 0; i < 4; i++) {
          float fi = float(i);
          float period = 23.0 + fi * 7.0;
          float turn = floor(uTime / period + fi * 0.37);
          float age = fract(uTime / period + fi * 0.37);
          vec2 c = vec2(-160.0 + 330.0 * hash12(vec2(turn, fi)) + fi * 60.0, 330.0 - 620.0 * hash12(vec2(fi + 3.0, turn)));
          vec2 dv = q - c; float d = length(dv);
          float rad = age * 70.0;
          float w = sin((d - rad) * 0.8) * exp(-pow((d - rad) / 5.0, 2.0)) * (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.04, age);
          slope += dv / max(d, 0.01) * w * 0.05;
        }
        vec3 n = normalize(vec3(slope.x, 1.0, slope.y));
        vec3 r = reflect(-V, n);
        r.y = abs(r.y) + 0.002;
        r = normalize(r);
        vec3 sky = skyBase(r) * uTint;
        if (uNight > 0.01) {
          float hz2 = smoothstep(0.0, 0.16, r.y);
          vec3 st = starLayer(r, 70.0, 0.34) + starLayer(r, 150.0, 0.42) * 0.7 + starLayer(r, 330.0, 0.5) * 0.4;
          vec3 gn = normalize(vec3(0.42, 0.5, -0.76));
          float gb = dot(r, gn);
          float band = exp(-gb * gb * 16.0);
          float dust = fbm(r.xz * 3.0 + r.y * 2.0 + 7.0) * fbm(r.zy * 8.0 + 3.0);
          vec3 mw = mix(vec3(0.05, 0.065, 0.13), vec3(0.2, 0.17, 0.24), dust * 2.0) * band * (0.25 + dust * 2.2);
          st += starLayer(r, 520.0, 0.85) * band * 0.55;
          sky += (st + mw) * uNight * hz2 * uSkyFx.w * 0.9;
        }
        vec4 wr = islandMirror(q, r);
        sky = mix(sky, wr.rgb, wr.a);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 deep = uDeep * (uSkyCol * 2.2 + 0.12);
        vec3 col = mix(deep, sky, clamp(fres * 0.8 + 0.2, 0.0, 1.0));
        // each eye's light is drawn down the glass toward the eye that looks: a long thin path from under the
        // light almost to the viewer's feet, hardly broken, wider and softer as it comes
        float hc = max(cameraPosition.y, 1.0);
        for (int i = 0; i < 2; i++) {
          float kin = i == 0 ? uEyeK.x : uEyeK.y;
          vec2 F = uEyes[i].xz;
          vec2 u = vCamL - F; float D = length(u); u /= max(D, 0.001);
          vec2 d = q - F;
          float s = dot(d, u);
          float dcam = max(D - s, 0.0);
          float w = max(0.09, dcam * 0.005);
          float t = dot(d, vec2(-u.y, u.x)) + (h0 - 0.62) * w * 2.0 * smoothstep(0.0, 30.0, s);
          float a = exp(-(t * t) / (w * w)) * smoothstep(-0.4, 1.5, s) * smoothstep(hc * 1.2, hc * 4.5, dcam) * (1.0 - smoothstep(1200.0, 1900.0, s));
          float lg = log(max(dcam, 1.0));
          float brk = 0.45 + 0.55 * smoothstep(0.25, 0.7, vnoise(vec2(lg * 13.0 + uTime * 0.12, float(i) * 7.0)) * 0.6 + vnoise(vec2(lg * 41.0 - uTime * 0.17, 3.0)) * 0.4);
          col += uLightCol * a * brk * (0.4 + 0.6 * dcam / max(D, 1.0)) * (0.06 + 1.1 * kin);
          // and a soft pool of it on the water at the eye's foot
          float pd = length(d);
          col += uLightCol * vec3(1.0, 0.8, 0.55) * exp(-pd * 0.045) * 0.16 * kin;
        }
        // the grotto's own water is dark
        {
          float u = abs(q.x - ${GROTTO.x.toFixed(1)}) / ${(GROTTO.half * 1.05).toFixed(1)};
          float inn = smoothstep(${(GROTTO.z + 6).toFixed(1)}, ${(GROTTO.z - 10).toFixed(1)}, q.y) * (1.0 - smoothstep(0.8, 1.15, u));
          col *= 1.0 - 0.88 * inn * uOpen;
        }
        // the magic of the night: a soft light kindles on the glass before the island's head, slow pools of pale
        // sea-green, and in them points that brighten and fade, each in its own time
        if (uMagic > 0.003) {
          float near = 1.0 - smoothstep(330.0, 900.0, length(q - vec2(${GROTTO.x.toFixed(1)}, ${(ISLAND.z + 150).toFixed(1)})));
          float pool = smoothstep(0.42, 0.8, fbm(q * 0.011 + vec2(uTime * 0.01, -uTime * 0.008)));
          vec2 cq = q * 0.2; vec2 ci = floor(cq); float ch = hash12(ci);
          vec2 cf = fract(cq) - 0.5 - (vec2(hash12(ci + 3.0), hash12(ci + 7.0)) - 0.5) * 0.6;
          float keep = 1.0 - smoothstep(0.25, 1.0, length(fwidth(cq)));
          float pt = exp(-dot(cf, cf) * 70.0) * step(0.55, ch) * (0.5 + 0.5 * sin(uTime * (0.35 + ch) + ch * 40.0)) * keep;
          col += vec3(0.2, 0.52, 0.44) * uMagic * near * (pool * 0.045 + pt * (0.2 + 0.5 * pool));
        }
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// Low mist on the water: long level bands that are only there when seen along the water, and are nothing from
// above or close to. Flat sheets a little over the surface, each with its own slow drift.
export function buildWisps(list: { x: number; z: number; w: number; d: number; y: number; a: number }[]) {
  const pos: number[] = [];
  const meta: number[] = [];
  const idx: number[] = [];
  list.forEach((s, i) => {
    const b = pos.length / 3;
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      pos.push(s.x + (u * s.w) / 2, s.y, s.z + (v * s.d) / 2);
      meta.push(u, v, i * 0.618 + 0.13, s.a);
    }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aM", new THREE.Float32BufferAttribute(meta, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
export function makeWispMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aM;
      varying vec3 vWorld; varying vec3 vLocal; varying vec4 vM;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vLocal = position; vM = aM; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec4 vM;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 dv = vWorld - cameraPosition; float dist = length(dv); vec3 d = dv / dist;
        vec2 p = vLocal.xz;
        float n = fbm(p * vec2(0.0035, 0.013) + vM.z * 17.0 + vec2(uTime * 0.005, 0.0)) * 0.7 + vnoise(p * vec2(0.012, 0.05) + vM.z * 5.0 - vec2(uTime * 0.008, 0.0)) * 0.3;
        float band = smoothstep(0.42, 0.72, n);
        float edge = (1.0 - smoothstep(0.55, 1.0, abs(vM.x))) * (1.0 - smoothstep(0.4, 1.0, abs(vM.y)));
        // only along the water
        float graze = 1.0 - smoothstep(0.02, 0.16, abs(d.y));
        float a = band * edge * graze * smoothstep(40.0, 220.0, dist) * vM.w;
        vec3 col = airCol(d) * 1.06 + uGlow * pow(max(dot(d, uSunDir), 0.0), 6.0) * 0.12 * smoothstep(-0.2, 0.05, uSunDir.y);
        gl_FragColor = vec4(col, a * 0.5 * (1.0 - airAmt(vWorld) * 0.5));
        ${END}
      }`,
  });
}
