"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLSL_SKY, SKY_U } from "../sky";
import { WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, haloGeometry, makeTempera, rng, type GroundPalette, type Halo, type V3 } from "./kit";
import { HomeWindow } from "./kings/homeWindow";
import { PaintedKings } from "./kings/painted";
import { makeUnderstory } from "./kings/trees";
import { BY, DOME_AT, DOME_U, GLSL_END, GLSL_KINGS, GLSL_KINGS_CORE, KINGS_UNIFORMS, R } from "./kings/light";
import { aisleX, makeWoodMaterial, woodGeometry, type Walk } from "./kings/wood";
import { KINGS, KINGS_WATER, ORIGIN, WORLDS, groundAt, heightGLSL } from "./voyage";

// Fairy Tale of the Kings (Karalių pasaka, 1909). A night wood of enormous
// trunks whose boughs close overhead; small towns and towers live in the
// boughs, their windows lit like stars. In the middle of the wood two kings,
// vast as hills, bow toward each other: the one on the left pale, long-haired,
// in a robe of grey-green; the one on the right dark, in a robe stitched with
// ember. Between their hands they hold a small bright dome, and rays go out
// from it; inside it is a little sunlit homestead. It is the only strong
// light in the picture: everything else is lit by it, from below.
//
// Here the little world they hold is this site's own: the desk in the field.
// The flight ends in it. The plane comes a long way through the wood, the
// light only glimpsed between the trunks; the wood opens, and they are there;
// it goes slowly up to their hands, between them, into the light; the light
// takes the whole frame, and opens on home.
//
// The kings themselves are in kings/figures.ts, the wood in kings/wood.ts,
// the one light and the mist it hangs in in kings/light.ts. Here: the night
// behind, the still water in the hollows, the little world and its rays, and
// everything small that moves.

const def = WORLDS.kings;
// the bell-light: where it hangs (over the clearing, in the plane's way but well above it) and how long its thread is
const BELL: V3 = [30, 52, 372];
const BELL_DROP = 120;
// the world's own tall things (the kings, the painting); the trunks join them whenever the wood is built
const OWN_OBSTACLES = def.obstacles.length;

export const KINGS_PAL: GroundPalette = {
  a: [0.062, 0.05, 0.036],
  b: [0.08, 0.06, 0.038],
  c: [0.034, 0.036, 0.028],
  hook: {
    uniforms: DOME_U,
    decl: GLSL_KINGS_CORE,
    // the floor of the wood: leaf-mould, moss in the damp, a scatter of pale fallen leaves; the little world's light
    // lies on it in a pool (but not straight beneath, where the hands shade it), and the kings' shadows across it
    lit: /* glsl */ `{
      float lf = fwidth(p.x) + fwidth(p.y);
      float near = 1.0 - smoothstep(0.15, 0.7, lf);
      // leaf-mould lying in drifts, darker and lighter; moss wherever it is damp
      vec3 a2 = alb * (0.66 + 0.8 * fbm(p * 0.021 + 9.0));
      float mossG = smoothstep(0.42, 0.74, vnoise(p * 0.03 + 3.0) * 0.6 + vnoise(p * 0.11) * 0.4);
      a2 = mix(a2, vec3(0.036, 0.07, 0.034) * (0.7 + 0.6 * vnoise(p * 0.7)), mossG * 0.6);
      // fallen leaves, pale and russet, each lying its own way
      vec2 lc = p * 0.9; vec2 li = floor(lc);
      vec2 lr = fract(lc) - 0.5 - (vec2(hash12(li + 1.0), hash12(li + 2.0)) - 0.5) * 0.6;
      float la = hash12(li + 5.0) * 3.1416;
      lr = vec2(cos(la) * lr.x - sin(la) * lr.y, sin(la) * lr.x + cos(la) * lr.y);
      float leaf = (1.0 - smoothstep(0.1, 0.17, length(lr * vec2(1.0, 2.0)))) * step(0.62, hash12(li)) * (1.0 - smoothstep(0.2, 0.6, lf));
      a2 = mix(a2, mix(vec3(0.2, 0.1, 0.04), vec3(0.15, 0.13, 0.06), hash12(li + 8.0)), leaf);
      // dropped twigs, and small stones worked up through the mould
      vec2 tc = p * 0.33; vec2 ti = floor(tc); vec2 tf = fract(tc) - 0.5;
      float ta = hash12(ti + 3.0) * 3.1416;
      vec2 tr = vec2(cos(ta) * tf.x - sin(ta) * tf.y, sin(ta) * tf.x + cos(ta) * tf.y);
      float twig = (1.0 - smoothstep(0.012, 0.03, abs(tr.y + 0.04 * sin(tr.x * 9.0)))) * (1.0 - smoothstep(0.26, 0.34, abs(tr.x))) * step(0.55, hash12(ti)) * near;
      a2 = mix(a2, vec3(0.022, 0.015, 0.01), twig * 0.85);
      vec2 pc = p * 1.5; vec2 pj = floor(pc);
      float pd = length(fract(pc) - 0.5 - (vec2(hash12(pj + 1.0), hash12(pj + 2.0)) - 0.5) * 0.6);
      float peb = (1.0 - smoothstep(0.09, 0.15, pd)) * step(0.8, hash12(pj + 7.0)) * near;
      a2 = mix(a2, vec3(0.13, 0.12, 0.105) * (0.7 + 0.6 * hash12(pj)), peb);
      // it is not flat: the mould lies in soft humps, and every leaf and stone stands a little proud of it
      float hgt = (vnoise(p * 0.4) * 0.6 + vnoise(p * 1.2 + 4.0) * 0.4) * 0.6 * near + leaf * 0.07 + peb * 0.14 + twig * 0.05 + mossG * 0.14 * vnoise(p * 2.0) * near;
      n = bumpN(n, vWorld, hgt, 1.0);
      // wet at the water's edge
      float wet = 1.0 - smoothstep(${KINGS_WATER.toFixed(2)}, ${(KINGS_WATER + 1.4).toFixed(2)}, h);
      a2 *= mix(1.0, 0.55, wet);
      // where the two great robes come down to it the ground lies in their shade
      float kc = smoothstep(0.82, 1.5, length((vWorld.xz - uOccC[0].xz) / (uOccR[0].xz * 1.12))) * smoothstep(0.82, 1.5, length((vWorld.xz - uOccC[2].xz) / (uOccR[2].xz * 1.12)));
      vec2 dl = domeLight(vWorld, n);
      float lit = dl.y * domeVis(vWorld) * clamp(dl.x, 0.0, 1.0) * smoothstep(uR * 0.9, uR * 2.6, length(vWorld.xz - uDome.xz));
      col = a2 * (coolFill(n) * 0.9 * mix(0.22, 1.0, kc) + DOME_WARM * lit * 3.6);
      // a wet gleam on the mud by the water, toward the light
      col += DOME_WARM * wet * dl.y * domeVis(vWorld) * pow(max(dot(reflect(-normalize(cameraPosition - vWorld), n), normalize(uDome - vWorld)), 0.0), 14.0) * 0.5;
    }`,
    air: `col = kingsAir(col, vWorld);`,
  },
};

// ---------- the night ----------
// Behind the wood, as he laid it in: long level strokes of blue low between the trunks, darker overhead, and through
// the gaps of the vault a few true stars. The mist and the dome's glow hang in front of it like everything else.
function makeNight() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      ${GLSL_KINGS}
      vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
      // stars that dim instead of flickering when they are smaller than a pixel
      float starLayer(vec3 dir, float scale, float density){
        vec3 p = dir * scale; vec3 id = floor(p); vec3 f = fract(p) - 0.5;
        vec3 h = hash33(id);
        float d = length(f - (h - 0.5) * 0.7);
        float r = max(mix(0.03, 0.075, h.z * h.z), fwidth(d) * 1.2);
        float core = smoothstep(r, 0.0, d) * min(1.0, (0.045 * 0.045) / (r * r));
        float tw = 0.82 + 0.18 * sin(uTime * (0.5 + h.x * 1.5) + h.y * 6.283);
        return core * tw * step(1.0 - density, h.x);
      }
      void main(){
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 col = nightBands(d);
        float up = smoothstep(0.02, 0.3, d.y);
        float st = starLayer(d, 46.0, 0.3) + 0.6 * starLayer(d, 110.0, 0.4);
        col += mix(vec3(0.8, 0.88, 1.0), vec3(1.0, 0.9, 0.74), step(0.6, fract(st * 37.0))) * st * up * 0.8 * uEvt.z;
        // and the large soft white ones he dotted over the whole upper picture, a few to every gap in the vault
        {
          vec3 p = d * 17.0; vec3 id = floor(p); vec3 h = hash33(id);
          float dd = length(fract(p) - 0.5 - (h - 0.5) * 0.6);
          // (they come out one by one as the plane goes in under the vault: each has its own moment)
          float big = exp(-dd * dd * 420.0) * step(0.42, h.x) * (0.6 + 0.4 * sin(uTime * (0.2 + h.y * 0.4) + h.z * 6.283)) * smoothstep(h.y - 0.12, h.y + 0.12, uEvt.z * 1.24 - 0.12);
          col += vec3(0.62, 0.74, 0.86) * big * smoothstep(0.06, 0.3, d.y) * 0.75;
        }
        gl_FragColor = vec4(kingsAir(col, cameraPosition + d * 1400.0), 1.0);
        ${GLSL_END}
      }`,
  });
}

// ---------- still water ----------
// It lies wherever the ground dips below its level: a stream from pool to pool down the aisle, and the wide pool
// before the kings. Black and nearly still; it holds the night, the mist, the little world and its glow, and the
// two kings as great dark shapes either side of it.
function makeWater() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `varying vec3 vWorld; varying vec3 vLocal; void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal;
      ${GLSL_KINGS}
      ${heightGLSL(def.terrain, "terrainH")}
      float rayEll(vec3 ro, vec3 rd, vec3 c, vec3 rad){
        vec3 o = (ro - c) / rad; vec3 d = rd / rad;
        float a = dot(d, d); float b = dot(o, d); float h = b * b - a * (dot(o, o) - 1.0);
        return h < 0.0 ? -1.0 : (-b - sqrt(h)) / a;
      }
      void main(){
        float depth = ${KINGS_WATER.toFixed(2)} - terrainH(vLocal.xz);
        float shore = smoothstep(0.0, 0.5, depth);
        if (shore <= 0.001) discard;
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition - vWorld);
        // the least movement on it, flattening with distance
        vec2 rp = vLocal.xz * 0.3 + vec2(uTime * 0.045, uTime * 0.028);
        float n0 = vnoise(rp) + vnoise(rp * 2.3 - uTime * 0.03) * 0.5;
        float nx = vnoise(rp + vec2(0.5, 0.0)) + vnoise((rp + vec2(0.5, 0.0)) * 2.3 - uTime * 0.03) * 0.5;
        float nz = vnoise(rp + vec2(0.0, 0.5)) + vnoise((rp + vec2(0.0, 0.5)) * 2.3 - uTime * 0.03) * 0.5;
        float k = 0.05 / (1.0 + dist * 0.012);
        vec3 N = normalize(vec3((n0 - nx) * k, 1.0, (n0 - nz) * k));
        vec3 rd = reflect(-V, N); rd.y = abs(rd.y) + 0.003; rd = normalize(rd);
        vec3 camM = vec3(cameraPosition.x, 2.0 * vWorld.y - cameraPosition.y, cameraPosition.z);
        vec3 hit = nightBands(rd);
        float tHit = 1400.0;
        for (int i = 0; i < 4; i++) {
          float t = rayEll(vWorld, rd, uOccC[i], uOccR[i]);
          if (t > 0.0 && t < tHit) {
            tHit = t;
            vec3 hp = vWorld + rd * t;
            vec3 hn = normalize((hp - uOccC[i]) / (uOccR[i] * uOccR[i]));
            vec2 dl = domeLight(hp, hn);
            vec3 base = i < 2 ? vec3(0.07, 0.15, 0.14) : vec3(0.075, 0.036, 0.024);
            hit = base * (coolFill(hn) + DOME_WARM * dl.y * pow(clamp(dl.x * 0.7 + 0.3, 0.0, 1.0), 2.0) * 3.2);
          }
        }
        // the little world itself: not its shape but its light, drawn out long down the water as light on water is,
        // and broken softly by what little the water moves
        float gold = 0.0;
        {
          vec3 C = uDome + vec3(0.0, uR * 0.45, 0.0);
          vec3 oc = vWorld - C; float tb = -dot(oc, rd);
          vec3 q = oc + rd * tb;
          float side = length(q.xz) / uR; float up = q.y / uR;
          gold = exp(-side * side * 1.5 - up * up * 0.22) * step(0.0, tb) * (tb < tHit + uR ? 1.0 : 0.25);
          gold *= 0.55 + 0.9 * smoothstep(0.2, 0.8, vnoise(vec2(vLocal.x * 0.5, vLocal.z * 0.09) + vec2(uTime * 0.05, -uTime * 0.11)));
        }
        vec3 refl = airFrom(hit, camM, vWorld + rd * tHit) + vec3(1.0, 0.7, 0.4) * gold * 0.85 * exp(-dist * uFogK.x * 0.35);
        float F = mix(0.2, 1.0, pow(1.0 - max(dot(N, V), 0.0), 3.0));
        vec3 col = mix(kingsAir(vec3(0.004, 0.011, 0.013), vWorld), refl, F);
        gl_FragColor = vec4(col, shore);
        ${GLSL_END}
      }`,
  });
}

// ---------- the little world ----------
// Its sky, seen through the glass: pale, the colour of cream where it is highest, rose-gold toward its rim.
function makeDomeSky() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { ...SKY_U, uEvt: DOME_U.uEvt },
    vertexShader: /* glsl */ `varying vec3 vLocal; void main(){ vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vLocal;
      uniform vec4 uEvt;
      ${GLSL_SKY}
      void main(){
        vec3 d = normalize(vLocal);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(vec3(1.5, 0.8, 0.5), vec3(1.6, 1.16, 0.8), smoothstep(0.0, 0.26, h));
        col = mix(col, vec3(1.66, 1.46, 1.2), smoothstep(0.2, 0.85, h));
        // the low sun of that country, a little to one side
        col += vec3(1.0, 0.8, 0.5) * pow(max(dot(d, normalize(vec3(-0.35, 0.3, -0.9))), 0.0), 9.0) * 0.9;
        // its thin day moon, as he put it, high on the left
        vec3 m = normalize(vec3(-0.3, 0.6, -0.74));
        float moon = (1.0 - smoothstep(0.05, 0.056, distance(d, m))) * smoothstep(0.046, 0.052, distance(d, normalize(m + vec3(0.03, 0.012, 0.0))));
        col = mix(col, vec3(2.4, 2.3, 2.1), moon);
        gl_FragColor = vec4(col * (1.0 + uPulse * 0.2) * (0.9 + 0.1 * uEvt.x), 1.0);
        ${GLSL_END}
      }`,
  });
}
// The glass of it from outside: nothing in the middle, a soft line of red gold at the limb.
function makeDomeGlass() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      ${GLSL_SKY}
      void main(){
        float f = 1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vW)));
        float dist = length(cameraPosition - vW);
        vec3 col = vec3(1.0, 0.5, 0.22) * pow(f, 2.4) * 0.8 + vec3(1.0, 0.8, 0.5) * pow(f, 7.0) * 1.0;
        gl_FragColor = vec4(col * smoothstep(4.0, 34.0, dist), 1.0);
        ${GLSL_END}
      }`,
  });
}
// Its rays: a burst of fine straight lines ruled out from the dome, long and short, each a little broken: pale gold
// where they leave the glass, red by their ends. Drawn as he drew them, flat on the picture: one sheet that turns to
// face the eye, each line as wide as it should be or one pixel, whichever is more, and fainter for it, so they
// never shimmer; they lie over whatever is behind the dome and under whatever is before it.
function makeRays() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `
      uniform vec3 uDome; uniform float uR;
      varying vec2 vP; varying float vFade;
      void main(){
        vec3 toCam = cameraPosition - uDome;
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        vec3 wp = uDome + (right * position.x + vec3(0.0, 1.0, 0.0) * position.y) * uR * 4.4;
        vP = position.xy * 4.4;
        vFade = smoothstep(uR * 1.6, uR * 5.0, length(toCam));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vP; varying float vFade;
      uniform float uPulse; uniform float uTime;
      float hash11(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
      void main(){
        float r = length(vP);
        float ang = atan(vP.x, vP.y);
        const float FAN = 3.5; const float N = 164.0;
        float cell = (ang / FAN + 0.5) * N;
        float id = floor(cell);
        float h1 = hash11(id + 1.0); float h2 = hash11(id + 57.0);
        float f = fract(cell) - 0.5 + (h2 - 0.5) * 0.5;
        float reach = mix(1.5, 2.3, h1) + step(0.7, h2) * mix(0.7, 1.9, h1);
        // across the line, in dome radii
        float lat = abs(f) * (FAN / N) * r;
        float px = fwidth(lat);
        float w = max(0.0045, px * 0.9);
        float line = (1.0 - smoothstep(w * 0.4, w, lat)) * (0.0045 / w);
        float along = smoothstep(1.02, 1.09, r) * (1.0 - smoothstep(reach * 0.5, reach, r));
        float dash = 0.5 + 0.5 * smoothstep(0.2, 0.5, abs(fract(r * mix(2.0, 5.0, h2) + h1 * 9.0) - 0.5) * 2.0);
        float fan = 1.0 - smoothstep(FAN * 0.44, FAN * 0.5, abs(ang));
        float breath = 0.9 + 0.1 * sin(uTime * 0.31 + h1 * 6.283);
        vec3 col = mix(vec3(1.0, 0.24, 0.07), vec3(1.0, 0.84, 0.56), pow(clamp(1.0 - (r - 1.0) / max(reach - 1.0, 0.1), 0.0, 1.0), 2.4));
        gl_FragColor = vec4(col * line * along * dash * fan * breath * vFade * 1.15 * (1.0 + uPulse * 0.4), 1.0);
        ${GLSL_END}
      }`,
  });
}

// ---------- small lights ----------
// Windows, lanterns, and the white lights far up in the boughs: each a soft round of light and nothing more. One
// that would be smaller than a pixel is drawn a pixel wide and fainter, so none of them flickers, and the mist
// between takes its share of every one.
function makeLamps() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `
      attribute vec4 aPos; attribute vec4 aCol;
      uniform float uTime; uniform float uMist; uniform vec4 uFogK;
      varying vec2 vUv; varying vec4 vCol;
      void main(){
        vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
        float d = -mv.z;
        float seed = fract(aPos.x * 0.137 + aPos.z * 0.291 + aPos.y * 0.071);
        float size = max(aPos.w, d * 0.0026);
        float k = aPos.w / size;
        mv.xy += position.xy * size;
        vUv = position.xy;
        float breathe = 0.86 + 0.14 * sin(uTime * (0.35 + seed * 0.5) + seed * 40.0);
        vCol = vec4(aCol.rgb, aCol.a * k * k * breathe * smoothstep(3.0, 16.0, d) * exp(-d * (uFogK.x * 0.5 + uMist * 1.5)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec4 vCol;
      void main(){
        float r2 = dot(vUv, vUv);
        if (r2 > 1.0) discard;
        float a = (exp(-r2 * 9.0) * 0.55 + exp(-r2 * 46.0) * 1.1) * (1.0 - smoothstep(0.6, 1.0, r2));
        gl_FragColor = vec4(vCol.rgb * a * vCol.a * 0.8, 1.0);
        ${GLSL_END}
      }`,
  });
}
// Motes: fireflies over the water and the roots (they wander, and each goes dark and kindles again in its own
// time), and a few embers going slowly up the shafts of the light.
function motesGeometry(n: number, at: (i: number, r: () => number) => [number, number, number, number], seed: number) {
  const r = rng(seed);
  const pos = new Float32Array(n * 3);
  const sd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y, z, s] = at(i, r);
    pos.set([x, y, z], i * 3);
    sd[i] = s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
  g.computeBoundingSphere();
  g.boundingSphere!.radius += 80;
  return g;
}
function makeMotes(o: { col: V3; col2: V3; size: number; wander: number; rise: number; blink: number }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...KINGS_UNIFORMS, uA: { value: new THREE.Color(...o.col) }, uB: { value: new THREE.Color(...o.col2) }, uP: { value: new THREE.Vector4(o.size, o.wander, o.rise, o.blink) } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform vec4 uP; uniform vec4 uFogK; uniform float uMist;
      varying float vA; varying float vK;
      void main(){
        float s = aSeed; vK = fract(s * 7.31);
        vec3 p = position;
        float t = uTime * (0.6 + vK * 0.8);
        p += vec3(sin(t * 0.23 + s * 40.0) + 0.5 * sin(t * 0.61 + s * 13.0), (sin(t * 0.31 + s * 21.0) + 0.5 * sin(t * 0.83 + s * 5.0)) * 0.45, cos(t * 0.19 + s * 33.0) + 0.5 * cos(t * 0.53 + s * 9.0)) * uP.y;
        // rising, and beginning again below
        p.y += mod(uTime * uP.z * (0.5 + vK) + s * 97.0, 120.0) * step(0.001, uP.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        float blink = mix(1.0, smoothstep(0.1, 0.75, sin(uTime * (0.5 + vK * 0.7) + s * 57.0) * 0.5 + 0.5 * sin(uTime * 0.13 + s * 11.0)), uP.w);
        float px = uP.x * 620.0 / max(d, 1.0);
        float sz = max(px, 1.6);
        vA = blink * (px / sz) * (px / sz) * smoothstep(1.5, 9.0, d) * exp(-d * (uFogK.x * 0.5 + uMist * 1.5)) * (1.0 - step(0.001, uP.z) * smoothstep(60.0, 118.0, mod(uTime * uP.z * (0.5 + vK) + s * 97.0, 120.0)));
        gl_PointSize = min(sz, 22.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA; uniform vec3 uB; varying float vA; varying float vK;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c) * 4.0;
        float a = exp(-r2 * 5.0) * 0.6 + exp(-r2 * 30.0);
        gl_FragColor = vec4(mix(uA, uB, vK) * a * vA * 0.9, 1.0);
        ${GLSL_END}
      }`,
  });
}

// Leaves coming down through the wood, one here, one there, turning over as they fall; lit like everything else.
function leavesGeometry(n: number, seed: number) {
  const r = rng(seed);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, -1, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const at = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const z = def.path[0][1] - r() * (def.path[0][1] - KINGS.z + 40);
    at.set([aisleX(z) + (r() - 0.5) * 240, r(), z, 0.4 + r() * 0.5], i * 4);
  }
  g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 80, 260), 760);
  return g;
}
function makeLeaves() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying float vK; varying vec2 vUv;
      void main(){
        float s = aAt.y; vK = fract(s * 13.7);
        float fall = mod(uTime * (1.4 + vK * 1.2) + s * 170.0, 170.0);
        vec3 c = vec3(aAt.x, 172.0 - fall, aAt.z);
        float t = uTime * (0.5 + vK * 0.6) + s * 60.0;
        c.x += sin(t * 0.7) * 5.0 + sin(t * 0.23) * 9.0;
        c.z += cos(t * 0.6) * 5.0;
        // turning over as it comes
        float a = t * 1.9; float b2 = t * 1.3 + s * 9.0;
        vec3 ax = normalize(vec3(cos(b2), 0.35, sin(b2)));
        vec3 up = normalize(cross(ax, vec3(sin(a), cos(a), 0.3)));
        vec3 p = c + (ax * position.x + up * position.y * (1.0 - 0.5 * position.x * position.x)) * aAt.w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vN = normalize(cross(ax, up)); vUv = position.xy;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying float vK; varying vec2 vUv;
      ${GLSL_KINGS}
      void main(){
        // a leaf's shape: pointed at both ends
        if (abs(vUv.y) > 0.5 * (1.0 - vUv.x * vUv.x)) discard;
        vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
        vec3 alb = mix(vec3(0.1, 0.06, 0.025), vec3(0.07, 0.075, 0.03), vK) * (1.0 - 0.4 * smoothstep(0.0, 0.08, 0.08 - abs(vUv.y)));
        vec2 dl = domeLight(vWorld, n);
        // (thin: the light comes through it as well as falling on it)
        vec3 col = alb * (coolFill(n) + DOME_WARM * dl.y * domeVis(vWorld) * (abs(dl.x) * 0.8 + 0.2) * 3.4);
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}

// Small figures going to and fro along the boughs and over the bridges, each with a lantern.
function walkersGeometry(walks: Walk[], n: number, seed: number) {
  const r = rng(seed);
  const fig = new THREE.CylinderGeometry(0.22, 0.52, 3.2, 5, 1).translate(0, 1.6, 0).toNonIndexed();
  const head = new THREE.IcosahedronGeometry(0.42, 0).translate(0, 3.5, 0);
  const lamp = new THREE.IcosahedronGeometry(0.26, 0).translate(0.75, 1.9, 0);
  const pos: number[] = [];
  const glow: number[] = [];
  for (const [g, k] of [
    [fig, 0],
    [head, 0],
    [lamp, 1],
  ] as const) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      glow.push(k);
    }
    g.dispose();
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aGlow", new THREE.Float32BufferAttribute(glow, 1));
  g.computeVertexNormals();
  const count = Math.min(n, walks.length);
  const a = new Float32Array(count * 4);
  const b = new Float32Array(count * 4);
  const pick = walks.map((w, i) => [r(), i] as const).sort((x, y) => x[0] - y[0]);
  const box = new THREE.Box3();
  for (let i = 0; i < count; i++) {
    const w = walks[pick[i][1]];
    a.set([...w.a, r()], i * 4);
    b.set([...w.b, 0.8 + r() * 0.7], i * 4);
    box.expandByPoint(new THREE.Vector3(...w.a)).expandByPoint(new THREE.Vector3(...w.b));
  }
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = count;
  g.boundingSphere = count ? box.getBoundingSphere(new THREE.Sphere()) : new THREE.Sphere();
  return g;
}
function makeWalkers() {
  return new THREE.ShaderMaterial({
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute float aGlow; uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying float vGlow;
      void main(){
        vec3 ab = aB.xyz - aA.xyz; float len = max(length(ab), 1.0);
        // there and back, slowing to turn
        float u = 0.5 - 0.5 * cos(uTime * 1.1 * aB.w / len * 3.1416 + aA.w * 6.283);
        vec3 c = aA.xyz + ab * u;
        // a step in it
        c.y += abs(sin(uTime * 2.6 * aB.w + aA.w * 30.0)) * 0.16;
        vec3 f = ab / len; vec3 s = normalize(vec3(-f.z, 0.0, f.x));
        vec3 p = c + s * position.x + vec3(0.0, 1.0, 0.0) * position.y + f * position.z;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vN = normalize(s * normal.x + vec3(0.0, 1.0, 0.0) * normal.y + f * normal.z); vGlow = aGlow;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying float vGlow;
      ${GLSL_KINGS}
      void main(){
        vec3 n = normalize(vN);
        vec2 dl = domeLight(vWorld, n);
        vec3 col = vec3(0.016, 0.017, 0.02) * (coolFill(n) + DOME_WARM * dl.y * clamp(dl.x * 0.7 + 0.3, 0.0, 1.0) * 3.4);
        // its own lantern on it
        col += vec3(0.05, 0.028, 0.01) * (1.0 - vGlow);
        col = mix(col, vec3(1.0, 0.62, 0.26) * 2.2, vGlow);
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}

// An owl: broad wings, a round head, dark against whatever light is behind it.
function owlGeometry() {
  const g = new THREE.BufferGeometry();
  // body, then each wing as two panels (shoulder to wrist, wrist to tip); aWing: 0 body, 1 wrist, 2 tip (signed by side)
  const P: number[] = [];
  const W: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    for (const v of [a, b, c]) {
      P.push(v[0], v[1], v[2]);
      W.push(v[3]);
    }
  };
  // body: a blunt wedge, head forward (+z), a short fanned tail
  tri([0, 0.5, 1.5, 0], [-0.9, 0, 0.2, 0], [0.9, 0, 0.2, 0]);
  tri([0, -0.5, 1.2, 0], [0.9, 0, 0.2, 0], [-0.9, 0, 0.2, 0]);
  tri([-0.9, 0, 0.2, 0], [0, 0.3, -1.6, 0], [0.9, 0, 0.2, 0]);
  tri([-0.8, 0, -1.9, 0], [0.8, 0, -1.9, 0], [0, 0.2, -0.8, 0]);
  for (const s of [-1, 1]) {
    tri([s * 0.6, 0.1, 0.9, 0], [s * 0.6, 0.1, -0.9, 0], [s * 3.2, 0.1, 1.0, s]);
    tri([s * 0.6, 0.1, -0.9, 0], [s * 3.2, 0.1, -0.8, s], [s * 3.2, 0.1, 1.0, s]);
    tri([s * 3.2, 0.1, 1.0, s], [s * 3.2, 0.1, -0.8, s], [s * 5.9, 0.1, 0.5, s * 2]);
    tri([s * 3.2, 0.1, -0.8, s], [s * 5.6, 0.1, -0.9, s * 2], [s * 5.9, 0.1, 0.5, s * 2]);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("aWing", new THREE.Float32BufferAttribute(W, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  return g;
}
function makeOwl() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...KINGS_UNIFORMS, uFlap: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aWing; uniform float uFlap; varying vec3 vWorld;
      void main(){
        vec3 p = position;
        float w = abs(aWing);
        // slow deep beats: the wrist leads, the tip follows
        p.y += sin(uFlap - w * 0.7) * w * w * 0.62 + sin(uFlap) * w * 0.3;
        p.x *= 1.0 - 0.1 * w * (0.5 - 0.5 * sin(uFlap - 0.6));
        vec4 wp = modelMatrix * vec4(p, 1.0); vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld;
      ${GLSL_KINGS}
      void main(){
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec2 dl = domeLight(vWorld, n);
        vec3 col = vec3(0.03, 0.026, 0.022) * (coolFill(n) + DOME_WARM * dl.y * (abs(dl.x) * 0.7 + 0.3) * 3.0);
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}

// The whole of the wood and everything in it, as work that can be put down and picked up (see prepareKings): the
// kings and their wood are the heaviest thing in the whole flight to make, so they can be made ahead of time, a few
// milliseconds a frame, while the plane is still over the sea; the world then takes them ready-made.
function* woodSteps(props: Pick<WorldProps, "mobile" | "trees" | "effects">, budget: number) {
  const by = BY;
  const wood = yield* woodGeometry({ mobile: props.mobile, trees: props.trees }, budget);
  yield;
  // ---------- the little world ----------
  // His own homestead under the glass, in the light of that picture: warm earth, a pale path, low houses with red
  // roofs, small dark trees against a cream sky (round ones, slim poplars), a thin tower, blue hills behind, a day
  // moon. In the middle of it, where he put a white fountain of a tree, the desk, and the display on it alight.
  const k = new Kit();
  const DP = (x: number, y: number, z: number): V3 => [DOME_AT.x + x, by + y, KINGS.z + z];
  const GL = 2.0; // its own light (lights are turned down at night; this is the one that is not)
  // the dish it stands on, dark beneath, a worked rim
  k.add(new THREE.CylinderGeometry(R + 0.9, R - 6, 3.6, 72), DP(0, -1.95, 0), [0.045, 0.026, 0.018], { top: [0.2, 0.1, 0.04] });
  k.add(new THREE.TorusGeometry(R + 0.5, 0.4, 8, 96), DP(0, 0.05, 0), [1, 0.62, 0.3], { glow: 1.0, rot: [Math.PI / 2, 0, 0] });
  k.add(new THREE.TorusGeometry(R - 2.6, 0.7, 8, 72), DP(0, -3.2, 0), [0.12, 0.06, 0.03], { rot: [Math.PI / 2, 0, 0] });
  // the ground: warm earth, paler in the middle where the light lies
  k.add(new THREE.CylinderGeometry(R - 0.3, R - 0.3, 0.5, 64), DP(0, -0.2, 0), [0.8, 0.5, 0.27], { glow: GL * 0.46 });
  k.add(new THREE.CylinderGeometry(R * 0.55, R * 0.62, 0.3, 48), DP(0, 0.0, 1), [1.0, 0.82, 0.52], { glow: GL * 0.5 });
  // the path: in from the near rim, round the desk and away between the houses
  for (const [x, z, len, rot] of [
    [3.4, 16, 13, 0.2],
    [1.6, 6, 9, -0.25],
    [3.2, -3, 11, 0.42],
    [7.6, -13, 12, 0.3],
  ] as const)
    k.box(1.7, 0.14, len, DP(x, 0.2, z), [1, 0.93, 0.78], { glow: GL * 0.6, rot: [0, rot, 0] });
  // blue hills along the far rim
  k.add(new THREE.SphereGeometry(R * 0.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), DP(-R * 0.34, 0, -R * 0.62), [0.56, 0.52, 0.76], { glow: GL * 0.44, scale: [1.3, 0.3, 0.5] });
  k.add(new THREE.SphereGeometry(R * 0.4, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), DP(R * 0.4, 0, -R * 0.66), [0.64, 0.54, 0.7], { glow: GL * 0.44, scale: [1.3, 0.34, 0.5] });
  // the desk, the display on it alight (the brightest thing in that country), the keyboard, a chair's worth of shadow
  k.box(5.6, 0.32, 2.7, DP(0, 2.7, 3), [0.52, 0.28, 0.15], { glow: GL * 0.44 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.26, 2.6, 0.26, DP(sx * 2.5, 1.3, 3 + sz * 1.05), [0.36, 0.19, 0.1], { glow: GL * 0.36 });
  k.box(2.9, 1.8, 0.14, DP(0, 4.3, 2.4), [0.08, 0.06, 0.07], { glow: 0 });
  k.box(2.66, 1.56, 0.04, DP(0, 4.3, 2.5), [1.0, 0.9, 0.76], { glow: GL * 1.1 });
  k.box(0.34, 0.9, 0.22, DP(0, 3.3, 2.4), [0.1, 0.08, 0.08], { glow: 0 });
  k.box(1.9, 0.1, 0.6, DP(0, 2.92, 3.5), [0.9, 0.86, 0.8], { glow: GL * 0.5 });
  // houses with red roofs, in two huddles either side of the path
  for (const [x, z, w, rot] of [
    [-10, -5, 5.2, 0.3],
    [-15.5, 0, 4.0, -0.2],
    [-7, -11, 3.6, 0.1],
    [11, -8, 4.6, -0.4],
    [16.5, -2, 3.8, 0.5],
    [14, -14, 3.4, 0.2],
  ] as const) {
    k.box(w, 2.6, w * 0.72, DP(x, 1.3, z), [0.98, 0.82, 0.62], { glow: GL * 0.46, rot: [0, rot, 0] });
    k.add(new THREE.ConeGeometry(w * 0.8, 2.4, 4), DP(x, 3.8, z), [0.72, 0.19, 0.12], { glow: GL * 0.44, rot: [0, rot + Math.PI / 4, 0], scale: [1, 1, 0.74] });
    k.box(0.5, 0.8, 0.06, DP(x + Math.sin(rot) * w * 0.37, 1.2, z + Math.cos(rot) * w * 0.37), [0.2, 0.1, 0.07], { glow: 0, rot: [0, rot, 0] });
  }
  // trees: many and small and dark against the sky, round ones in clumps, slim poplars standing over them
  const tr = rng(77);
  const clumps: [number, number, number][] = [
    [-12, -9, 7],
    [12, -11, 7],
    [-19, 3, 5],
    [20, 4, 5],
    [0, -19, 9],
    [-21, -10, 4],
    [22, -9, 4],
    [-9, 13, 3],
    [11, 14, 3],
  ];
  for (const [cx, cz, n] of clumps)
    for (let i = 0; i < n; i++) {
      const x = cx + (tr() - 0.5) * 9;
      const z = cz + (tr() - 0.5) * 7;
      if (Math.hypot(x, z) > R - 3.5) continue;
      if (tr() < 0.24) {
        const h = 7.5 + tr() * 6.5;
        k.add(new THREE.ConeGeometry(0.95, h, 7), DP(x, h / 2 + 0.3, z), [0.22, 0.1, 0.08], { glow: GL * 0.3, top: [0.4, 0.2, 0.12] });
      } else {
        const s = 1.5 + tr() * 1.5;
        const rose = tr() < 0.55;
        k.add(new THREE.CylinderGeometry(0.14, 0.2, 2.2, 5), DP(x, 1.1, z), [0.3, 0.14, 0.09], { glow: GL * 0.3 });
        k.add(new THREE.SphereGeometry(s, 12, 9), DP(x, 2.0 + s * 0.85, z), rose ? [0.46, 0.17, 0.12] : [0.5, 0.27, 0.11], { glow: GL * 0.36, scale: [1, 0.9, 1], top: rose ? [0.86, 0.42, 0.28] : [0.9, 0.6, 0.26] });
      }
    }
  k.box(0.9, 13, 0.9, DP(15, 6.5, -15), [0.26, 0.12, 0.1], { glow: GL * 0.3 });
  k.add(new THREE.ConeGeometry(0.9, 3.0, 4), DP(15, 14.4, -15), [0.26, 0.12, 0.1], { glow: GL * 0.3, rot: [0, Math.PI / 4, 0] });

  // fireflies over the water and among the roots, all down the aisle and thick in the glade
  const fx = Math.max(0.4, props.effects);
  const fireflies = motesGeometry(
    props.mobile ? 110 : Math.round(300 * fx),
    (_i, q) => {
      const glade = q() < 0.4;
      const z = glade ? KINGS.z + 30 + q() * 230 : def.path[0][1] - q() * (def.path[0][1] - KINGS.z - 200);
      const x = aisleX(z) + (q() - 0.5) * (glade ? 300 : 150);
      return [x, groundAt(def, x, z) + 1.2 + q() * q() * 16, z, q()];
    },
    404,
  );
  // embers going up from round the little world
  const embers = motesGeometry(
    props.mobile ? 30 : Math.round(70 * fx),
    (_i, q) => {
      const a = q() * Math.PI * 2;
      const d = R * (1.3 + q() * 4.5);
      return [Math.cos(a) * d, by - 10 + q() * 30, KINGS.z + Math.sin(a) * d * 0.8, q()];
    },
    405,
  );
  // one bird, far up, crossing
  const birdG = new THREE.BufferGeometry();
  birdG.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.9, -6.4, 1.9, 1.9, -2.6, 0.3, -0.9, 0, 0, 0.9, 2.6, 0.3, -0.9, 6.4, 1.9, 1.9, 0, 0, 1.6, -0.7, 0, -0.4, 0.7, 0, -0.4], 3));

  // the plane is eased round every trunk
  def.obstacles.length = OWN_OBSTACLES;
  for (const t of wood.trunks) def.obstacles.push({ x: t.x, z: t.z, r: t.R + 6, h: t.H });
  yield;
  return {
    woodChunks: wood.chunks,
    under: makeUnderstory({ mobile: props.mobile, trees: props.trees }),
    bark: makeWoodMaterial(),
    little: k.build(),
    lit: makeTempera({ amb: 0.5, key: 0.2, dab: 0.5 }),
    domeGeo: new THREE.SphereGeometry(R, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    domeSky: makeDomeSky(),
    domeGlass: makeDomeGlass(),
    raysGeo: new THREE.PlaneGeometry(2, 2),
    raysMat: makeRays(),
    nightGeo: new THREE.SphereGeometry(1400, 48, 24),
    nightMat: makeNight(),
    waterGeo: new THREE.PlaneGeometry(2800, 2800, 1, 1).rotateX(-Math.PI / 2).translate(0, KINGS_WATER, 0),
    waterMat: makeWater(),
    lampGeo: haloGeometry([...wood.lamps, ...wood.stars] as Halo[]),
    lampMat: makeLamps(),
    fireflies,
    fireflyMat: makeMotes({ col: [0.75, 1.0, 0.42], col2: [1.0, 0.86, 0.4], size: 0.62, wander: 3.2, rise: 0, blink: 1 }),
    embers,
    emberMat: makeMotes({ col: [1, 0.5, 0.18], col2: [1, 0.76, 0.4], size: 0.42, wander: 2.2, rise: 1.6, blink: 0.3 }),
    leaves: leavesGeometry(props.mobile ? 90 : Math.round(240 * fx), 31),
    leafMat: makeLeaves(),
    walkers: walkersGeometry(wood.walks, props.mobile ? 26 : 80, 9),
    walkerMat: makeWalkers(),
    bellThread: new THREE.CylinderGeometry(0.16, 0.16, BELL_DROP, 4),
    bellCage: new THREE.ConeGeometry(2.2, 2.0, 6, 1, true),
    bellLamp: new THREE.SphereGeometry(1.5, 14, 10),
    bellDark: new THREE.MeshBasicMaterial({ color: "#050505", side: THREE.DoubleSide, fog: false }),
    bellGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.92, 0.4), fog: false }),
    owlG: owlGeometry(),
    owlMat: makeOwl(),
    birdG,
    birdMat: new THREE.MeshBasicMaterial({ color: "#020506", side: THREE.DoubleSide, fog: false }),
  };
}
type Wood = ReturnType<typeof woodSteps> extends Generator<void, infer T, void> ? T : never;
const woodKey = (p: Pick<WorldProps, "mobile" | "trees" | "effects">) => `${p.mobile}|${p.trees}|${p.effects > 0.5}`;
let madeWood: { key: string; wood: Wood } | null = null;

export default function KingsWorld({ props }: { props: WorldProps }) {
  const bird = useRef<THREE.Mesh>(null);
  const owl = useRef<THREE.Mesh>(null);
  const night = useRef<THREE.Mesh>(null);
  const chunkRefs = useRef<(THREE.Mesh | null)[]>([]);
  const bell = useRef<THREE.Group>(null);
  const swing = useRef(0);
  const b = useDisposable(() => {
    // made ahead of time while the plane was over the sea, or here and now
    // (it stays where it was put until this world is let go: a render that React begins and then begins again must
    // find it there both times, or the second would make the whole wood over again on the spot)
    if (madeWood && madeWood.key === woodKey(props)) return madeWood.wood;
    const g = woodSteps(props, Infinity);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }, [props.mobile, props.trees, props.effects > 0.5]);

  useEffect(
    () => () => {
      if (madeWood?.wood === b) madeWood = null;
    },
    [b],
  );
  useFrame(({ camera }, delta) => {
    // the night stands round the eye wherever it goes (this group sits at the world's own centre)
    night.current?.position.copy(camera.position).sub(ORIGIN);
    const time = SKY_U.uTime.value;
    // what is far off in the mist is drawn plainly: a piece of the wood without its small things, the kings in coarse clay
    const cx = camera.position.x - ORIGIN.x;
    const cy = camera.position.y - ORIGIN.y;
    const cz = camera.position.z - ORIGIN.z;
    b.woodChunks.forEach((c, i) => {
      const m = chunkRefs.current[i];
      const bs = c.geo.boundingSphere;
      if (!m || !bs) return;
      const d = Math.hypot(bs.center.x - cx, bs.center.y - cy, bs.center.z - cz) - bs.radius;
      const count = d > 240 ? c.essential : Infinity;
      if (c.geo.drawRange.count !== count) c.geo.setDrawRange(0, count);
    });
    const dk = Math.hypot(cx, cy - DOME_AT.y, cz - KINGS.z);
    // what happens on the way: the stars come out as the plane goes in under the vault; when it is near, the kings
    // lean the least bit closer over what they hold, and its light answers
    const ev = DOME_U.uEvt.value;
    const k1 = 1 - Math.exp(-delta * 0.5);
    const sm = (t: number) => THREE.MathUtils.smoothstep(t, 0, 1);
    ev.z += (0.25 + 0.75 * sm((760 - dk) / 420) - ev.z) * k1;
    ev.y += (sm((300 - dk) / 190) - ev.y) * k1;
    ev.x = 1 + 0.2 * ev.y;
    // the bell-light: one great lantern let down from the vault over the clearing. It hangs still until the plane
    // comes by, swings slowly while it passes beneath, and settles again behind it
    const bl = bell.current;
    if (bl) {
      const want = 0.34 * sm(1 - Math.abs(cz - BELL[2] - 40) / 230);
      swing.current += (want - swing.current) * (1 - Math.exp(-delta * 0.35));
      bl.rotation.z = Math.sin(time * 0.52) * swing.current;
      bl.rotation.x = Math.sin(time * 0.52 * 0.93 + 1.1) * swing.current * 0.35;
    }
    const m = bird.current;
    if (m) {
      // every half minute or so it crosses above the two crowns
      const t = (time * 0.03 + 0.3) % 1;
      m.position.set(-300 + t * 600, DOME_AT.y + R * 4.0 + Math.sin(t * 9) * 6, KINGS.z + 70 - t * 60);
      m.rotation.set(0, -Math.PI / 2 + 0.14, Math.sin(time * 2.2) * 0.1);
      m.scale.setScalar(1.7);
    }
    const ow = owl.current;
    if (ow) {
      // the owl: every three quarters of a minute it comes out of the trunks on one side, crosses the aisle some way
      // ahead of the eye on slow wings, and is gone among the trunks on the other
      const period = 44;
      const n = Math.floor(time / period);
      const t = (time - n * period) / 16;
      const dir = n % 2 ? 1 : -1;
      ow.visible = t < 1 && cz - 150 > KINGS.z + 190;
      if (ow.visible) {
        const z = cz - 150 + dir * (t - 0.5) * 36;
        const x = aisleX(z) + dir * (t - 0.5) * 380;
        ow.position.set(x, groundAt(def, x, z) + 34 + Math.sin(t * 3.1) * 12 - t * 6, z);
        ow.rotation.set(0, dir > 0 ? Math.PI / 2 - 0.1 : -Math.PI / 2 + 0.1, 0);
        ow.scale.setScalar(1.25);
        (b.owlMat.uniforms.uFlap as THREE.IUniform<number>).value = time * 3.4;
      }
    }
  });
  const at: V3 = [DOME_AT.x, DOME_AT.y, KINGS.z];
  return (
    <>
      <mesh ref={night} geometry={b.nightGeo} material={b.nightMat} renderOrder={-9} frustumCulled={false} />
      <WorldBase id="kings" def={def} pal={KINGS_PAL} props={props} grass={false} pathTint={[1, 0.8, 0.52]} pathGain={0.05} angels={false} marks={false} groundSize={3400} />
      <mesh geometry={b.waterGeo} material={b.waterMat} renderOrder={1} />
      {b.woodChunks.map((c, i) => (
        <mesh
          key={i}
          ref={(m) => {
            chunkRefs.current[i] = m;
          }}
          geometry={c.geo}
          material={b.bark}
        />
      ))}
      {b.under.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <PaintedKings />
      <mesh geometry={b.little} material={b.lit} />
      <mesh geometry={b.domeGeo} material={b.domeSky} position={at} />
      <HomeWindow mobile={props.mobile} />
      <mesh geometry={b.domeGeo} material={b.domeGlass} position={at} renderOrder={5} />
      <mesh geometry={b.raysGeo} material={b.raysMat} renderOrder={6} frustumCulled={false} />
      <group ref={bell} position={[BELL[0], BELL[1] + BELL_DROP, BELL[2]]}>
        <mesh geometry={b.bellThread} material={b.bellDark} position={[0, -BELL_DROP / 2, 0]} />
        <mesh geometry={b.bellCage} material={b.bellDark} position={[0, -BELL_DROP + 2.3, 0]} />
        <mesh geometry={b.bellLamp} material={b.bellGlow} position={[0, -BELL_DROP, 0]} />
      </group>
      <mesh geometry={b.walkers} material={b.walkerMat} />
      <mesh geometry={b.leaves} material={b.leafMat} />
      <mesh geometry={b.lampGeo} material={b.lampMat} renderOrder={6} />
      <points geometry={b.fireflies} material={b.fireflyMat} renderOrder={7} />
      <points geometry={b.embers} material={b.emberMat} renderOrder={7} />
      <mesh ref={owl} geometry={b.owlG} material={b.owlMat} visible={false} />
      <mesh ref={bird} geometry={b.birdG} material={b.birdMat} />
    </>
  );
}

// Development: how long the whole of it takes to make, and the longest single piece of that work (the hitch a frame
// would feel while it is made ahead of time): window.__kingsBuild({ mobile, trees, effects }, budget).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production")
  Object.assign(window, {
    __kingsBuild: (props: Pick<WorldProps, "mobile" | "trees" | "effects"> = { mobile: false, trees: 0.75, effects: 0.6 }, budget = 5) => {
      const g = woodSteps(props, budget);
      let longest = 0;
      let steps = 0;
      const t0 = performance.now();
      for (;;) {
        const t = performance.now();
        const r = g.next();
        longest = Math.max(longest, performance.now() - t);
        steps++;
        if (r.done) {
          const w = r.value as Record<string, unknown>;
          const chunks = w.woodChunks as { geo: THREE.BufferGeometry; essential: number }[];
          const out = {
            totalMs: Math.round(performance.now() - t0),
            longestStepMs: Math.round(longest),
            steps,
            wood: chunks.reduce((a, c) => a + Math.round((c.geo.index?.count ?? 0) / 3), 0),
            woodFar: chunks.reduce((a, c) => a + Math.round(c.essential / 3), 0),
            pieces: chunks.length,
          };
          letGo(w);
          return out;
        }
      }
    },
  });

// Returns a step to call once a frame until it says it is done.
export function prepareKings(props: Pick<WorldProps, "mobile" | "trees" | "effects">, budget = 5) {
  const key = woodKey(props);
  if (madeWood && madeWood.key !== key) dropKings();
  const g = madeWood ? null : woodSteps(props, budget);
  return () => {
    if (!g || madeWood) return true;
    const r = g.next();
    if (r.done) madeWood = { key, wood: r.value };
    return !!r.done;
  };
}
// a flight that ends before the kings lets go of whatever was made for them
export function dropKings() {
  const w = madeWood?.wood as Record<string, unknown> | undefined;
  madeWood = null;
  if (w) letGo(w);
}
function letGo(w: Record<string, unknown>) {
  for (const v of Object.values(w)) {
    if (v instanceof THREE.BufferGeometry || v instanceof THREE.Material || v instanceof THREE.Texture) v.dispose();
    else if (Array.isArray(v)) for (const c of v) (c as { geo?: THREE.BufferGeometry }).geo?.dispose();
    else if (v && typeof v === "object" && Array.isArray((v as { meshes?: unknown }).meshes)) (v as { dispose: () => void }).dispose();
  }
}
