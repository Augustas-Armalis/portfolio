"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { HOME_GATE_Z } from "../flightPath";
import { GLSL_NOISE, GLSL_PATH } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_DESK_SHADOW } from "../World";
import { GLSL_PATHS } from "./journey";
import { CLOUD, GLSL_FIELD, GLSL_HOME_AIR, GLSL_LAND, HOME_U } from "./land";

// The land, the lake and the sea, as one surface. Nested square grids that move
// with the eye in whole steps of their own lattice (fine underfoot, each level
// twice as coarse, out to the horizon), lifted onto the land's height in the vertex shader and
// never below the water. Each pixel then knows what it is: meadow (the same
// paint as the blades standing on it, so the grass has no edge), the worn
// footpath, forest floor, sand, or water: the lake still and mirroring, the
// sea rolling in with a sun path, glitter and foam on the beach.

// One level of the land's clipmap: a square grid of (2n)x(2n) cells of one unit, centred on the origin; with `hole`,
// the cells within `hole` of the middle are left out (the finer level covers them).
function levelGeometry(n: number, hole: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  const at = new Map<number, number>();
  const W = 2 * n + 1;
  const v = (i: number, j: number) => {
    const k = (j + n) * W + (i + n);
    let x = at.get(k);
    if (x === undefined) {
      x = pos.length / 3;
      pos.push(i, 0, j);
      at.set(k, x);
    }
    return x;
  };
  for (let j = -n; j < n; j++)
    for (let i = -n; i < n; i++) {
      if (hole > 0 && i >= -hole && i < hole && j >= -hole && j < hole) continue;
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i, j + 1);
      const d = v(i + 1, j + 1);
      // (the diagonal of every cell one way: a morphed rim is then exactly the coarser level's own triangles)
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

export const LAND_FAR = 11500;

// the lake's mirror, when there is one (see Water): a texture and the matrix that finds a point in it
export const REFLECT_U = {
  uReflTex: { value: null as THREE.Texture | null },
  uReflMat: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
};

export function makeLandMaterial() {
  const soil = new THREE.TextureLoader().load("/scene/tex/sparse_grass_diff.jpg");
  soil.wrapS = soil.wrapT = THREE.RepeatWrapping;
  soil.colorSpace = THREE.SRGBColorSpace;
  soil.anisotropy = 8;
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...HOME_U, ...REFLECT_U, uCenter: { value: new THREE.Vector2() }, uEye: { value: new THREE.Vector2() }, uCell: { value: 1 }, uMorph: { value: 1e9 }, uHole: { value: 0 }, uSoilTex: { value: soil } },
    vertexShader: /* glsl */ `
      uniform vec2 uCenter; uniform vec2 uEye; uniform float uCell; uniform float uMorph;
      varying vec3 vWorld; varying vec3 vN; varying float vCav;
      ${GLSL_LAND}
      void main(){
        // (a lattice point of the world: the level's grid is moved only by whole steps of two cells, so every vertex
        // stands on the same spot of land while the eye moves and nothing swims; toward the level's rim every other
        // vertex slides onto its even neighbour, so the rim is the next level's own grid and the two meet exactly)
        vec2 g = position.xz;
        vec2 p = g * uCell + uCenter;
        vec2 dd = abs(p - uEye);
        float m = clamp((max(dd.x, dd.y) / uCell - uMorph) / 4.0, 0.0, 1.0);
        p -= mod(g, 2.0) * uCell * m;
        float h = landH(p);
        // how hollow the ground is here (the mean of the land round about, less this point): creases and the feet of
        // slopes gather a soft shade, brows and crests stay open to the sky
        float e = 7.0 + uCell * 0.6;
        vCav = ((landH(p + vec2(e, 0.0)) + landH(p - vec2(e, 0.0)) + landH(p + vec2(0.0, e)) + landH(p - vec2(0.0, e))) * 0.25 - h) / e;
        float level = max(hLakeK(p) < 1.15 ? LAKE_Y : SEA, riverLevel(p));
        vWorld = vec3(p.x, max(h, level), p.y);
        vN = landN(p);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSoilTex; uniform sampler2D uReflTex; uniform mat4 uReflMat; uniform float uReflOn;
      varying vec3 vWorld; varying vec3 vN; varying float vCav;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_DESK_SHADOW}
      ${GLSL_PATH}
      ${GLSL_LAND}
      ${GLSL_HOME_AIR}
      ${GLSL_FIELD}
      ${GLSL_PATHS}

      // what the water mirrors where there is no mirror texture: the sky, and the clouds standing in it
      vec3 skyMirror(vec3 P, vec3 r){
        vec3 sky = skyBase(r);
        if (r.y > 0.015 && uCumulus > 0.01) {
          float t = (${CLOUD.base.toFixed(1)} + ${CLOUD.height.toFixed(1)} * 0.2 - P.y) / r.y;
          float cov = cloudCov(P.xz + r.xz * t);
          float lit = 0.55 + 0.45 * smoothstep(-0.2, 0.6, dot(r, uSunDir));
          vec3 cc = mix(uCloudShade, uCloudLit, lit * (0.45 + 0.55 * cov));
          sky = mix(sky, cc, cov * 0.85 * exp(-t * 0.00022) * uCumulus);
        }
        return sky;
      }
      float ripple(vec2 q, float k){
        float t = uTime;
        float a = texture2D(uCloudTex, q / 43.0 + vec2(t * 0.011, t * 0.006)).b;
        float b = texture2D(uCloudTex, q / 15.0 - vec2(t * 0.019, t * 0.004)).b;
        float c = texture2D(uCloudTex, q / 4.7 + vec2(t * 0.024, -t * 0.031)).g;
        return a * 1.3 + b * 0.6 + c * 0.22 * k;
      }

      uniform vec2 uEye; uniform float uHole;
      void main(){
        vec2 p = vWorld.xz;
        // (the finer level draws this part of the land)
        vec2 de = abs(p - uEye);
        if (max(de.x, de.y) < uHole) discard;
        float dist = length(vWorld - cameraPosition);
        float h = landH(p);
        float lk = hLakeK(p);
        bool isLake = lk < 1.15;
        float level = isLake ? LAKE_Y : SEA;
        // the river (journey.ts): still water like the lake's, running west, with no mirror of its own
        float rLev = riverLevel(p);
        bool isRiver = rLev > level;
        if (isRiver) level = rLev;
        bool still = isLake || isRiver;
        vec3 V = normalize(cameraPosition - vWorld);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        vec3 col;

        // ----- the land -----
        // (found here, at the pixel: the mesh rides with the eye, and a normal carried by its sliding vertices makes the
        // light crawl over the hills in flight)
        vec3 N = landN(p);
        vec2 fm = fieldMix(p);
        vec3 alb = fieldAlbK(fm);
        float fw = max(fwidth(p.x), fwidth(p.y));
        // the field's nap: broad drifts, long strokes, and nearer by short dabs like tufts (each fading before it could shimmer)
        {
          float ga = vnoise(p * 0.008 + 5.0) * 6.2832;
          vec2 gdir = vec2(cos(ga), sin(ga));
          vec2 gq = vec2(dot(p, gdir), dot(p, vec2(-gdir.y, gdir.x)));
          float brush = vnoise(vec2(gq.x * 0.08, gq.y * 0.85)) * 0.6 + vnoise(vec2(gq.x * 0.28, gq.y * 2.4) + 7.0) * 0.4;
          float k = 1.0 + (brush - 0.5) * 0.3 * (1.0 - smoothstep(0.25, 1.1, fw));
          vec2 tc = p * 1.7; vec2 ti = floor(tc); vec2 tf = fract(tc) - 0.5; float th = hash12(ti);
          vec2 off = (vec2(hash12(ti + 3.1), hash12(ti + 7.7)) - 0.5) * 0.6;
          float tuft = (1.0 - smoothstep(0.06, 0.34, length((tf - off) * vec2(2.6, 0.9)))) * step(0.42, th);
          k *= 1.0 + tuft * (1.0 - smoothstep(0.08, 0.3, fw)) * (th > 0.7 ? 0.26 : -0.2) * smoothstep(10.0, 30.0, dist);
          alb *= k;
        }
        // wildflowers: specks where the real ones leave off, and far away only the colour of their drifts
        float fd = flowerDrift(p);
        {
          vec2 g = p * 2.7; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          float hh = hash12(id);
          vec2 off = (vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5) * 0.62;
          float dotK = 1.0 - smoothstep(0.07, 0.19, length(f - off));
          float on = step(1.0 - 0.3 * fd - 0.01, hh);
          vec3 hue = flowerHue(p + (hash12(id + 1.7) - 0.5) * 30.0);
          float speck = dotK * on * smoothstep(9.0, 20.0, dist) * (1.0 - smoothstep(0.1, 0.34, fw * 2.7));
          alb = mix(alb, hue * 0.8, speck * 0.9);
          vec3 fh = flowerHue(p);
          alb = mix(alb, alb * 0.6 + fh * fh * vec3(0.2, 0.18, 0.12), fd * 0.36 * smoothstep(24.0, 120.0, dist));
        }
        // under the trees: leaf litter and moss, and far off the canopy itself
        float woods = forestAt(p);
        {
          float canopy = vnoise(p * 0.11) * 0.6 + vnoise(p * 0.31 + 9.0) * 0.4;
          vec3 floorC = mix(vec3(0.04, 0.062, 0.032), vec3(0.075, 0.1, 0.04), canopy);
          alb = mix(alb, floorC, smoothstep(0.22, 0.75, woods) * 0.82);
        }
        // the footpath: worn sandy earth, a little paler down the middle, grass closing in softly from both sides
        float onPath = 0.0;
        vec3 pathEarth = vec3(0.0);
        float c0p = inland(p);
        {
          float pw = pathW(p.y);
          float px = abs(p.x - pathX(p.y)) / pw;
          float n2 = vnoise(p * 0.9);
          // (northward it goes only as far as where the paths part: the main path turns left to the town there)
          float along = p.y > 0.0 ? smoothstep(2.0, 14.0, c0p) : 1.0 - smoothstep(1.0, 3.0, -p.y);
          onPath = (1.0 - smoothstep(0.42 + n2 * 0.3, 1.02 + n2 * 0.34, px)) * along;
          float fine = vnoise(p * 9.0) * 0.6 + vnoise(p * 31.0) * 0.4;
          vec3 earth = vec3(0.37, 0.32, 0.235) * (0.9 + 0.2 * fine);
          // (the main path from the desk is this same path running on: measured the same way, one worn middle)
          px = min(px, deskPk(p));
          earth *= 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.55, px));
          // small pale pebbles pressed into it
          vec2 pc = p * 11.0; float ph = hash12(floor(pc));
          earth = mix(earth, vec3(0.5, 0.47, 0.41), step(0.955, ph) * (1.0 - smoothstep(0.18, 0.4, length(fract(pc) - 0.5))) * (1.0 - smoothstep(0.03, 0.12, fw)));
          pathEarth = earth;
          alb = mix(alb, earth, onPath);
        }
        // the town's streets (journey.ts): cobbles set in packed earth, worn smooth down the middle
        {
          float st = townStreet(p);
          if (st > 0.001) {
            vec2 cq = p * 2.6; vec2 ci = floor(cq + vec2(0.0, floor(cq.x) * 0.5)); vec2 cf = fract(cq + vec2(0.0, floor(cq.x) * 0.5)) - 0.5;
            float cob = 1.0 - smoothstep(0.28, 0.48, length(cf));
            float keepC = 1.0 - smoothstep(0.06, 0.2, fw);
            vec3 stone = vec3(0.33, 0.31, 0.28) * (0.75 + 0.45 * hash12(ci));
            vec3 earthS = vec3(0.3, 0.25, 0.18) * (0.85 + 0.3 * vnoise(p * 0.7));
            // (each cobble a little dome: lit on top, dark in the joints, so the paving has relief)
            float dome = 1.0 - smoothstep(0.0, 0.48, length(cf));
            vec3 sc = mix(earthS * 0.7, stone * (0.75 + 0.45 * dome), cob * keepC * 0.8);
            sc = mix(sc, (earthS + stone) * 0.5, 1.0 - keepC);
            float edge = st * (1.0 - smoothstep(0.35, 0.75, vnoise(p * 1.4) * 0.5 + (1.0 - st)));
            alb = mix(alb, sc, clamp(st * 1.15 - 0.1 + edge * 0.0, 0.0, 1.0));
            onPath = max(onPath, st);
          }
          // the farmland east of the road: strips of rye, flax and potatoes in furrows, grass headlands between
          vec3 fp = fieldPlot(p);
          if (fp.z > 0.001) {
            float fur = 0.5 + 0.5 * sin(fp.y * 6.2832 / 0.9);
            float keepF = 1.0 - smoothstep(0.15, 0.6, fw);
            vec3 fc = fp.x < 0.5 ? mix(vec3(0.34, 0.27, 0.1), vec3(0.46, 0.37, 0.16), vnoise(p * 0.3))
                    : fp.x < 1.5 ? mix(vec3(0.12, 0.19, 0.1), vec3(0.17, 0.22, 0.2), vnoise(p * 0.25))
                    : mix(vec3(0.1, 0.13, 0.05), vec3(0.2, 0.15, 0.09), fur * keepF + 0.5 * (1.0 - keepF));
            fc *= mix(1.0, 0.82 + 0.3 * fur, keepF * (fp.x < 0.5 ? 0.5 : 1.0));
            alb = mix(alb, fc, fp.z * 0.85);
            onPath = max(onPath, fp.z * 0.7);
          }
          // the paths from the desk: the main one to the town in the footpath's own worn earth, the hidden one to the
          // grove a narrow dark trace half under the grass
          vec2 hp = homePaths(p);
          if (hp.x + hp.y > 0.001) {
            alb = mix(alb, pathEarth, hp.x);
            vec3 earthS = mix(vec3(0.13, 0.1, 0.07), vec3(0.08, 0.1, 0.05), vnoise(p * 2.1));
            alb = mix(alb, earthS, hp.y * 0.55);
            onPath = max(onPath, max(hp.x, hp.y * 0.6));
          }
          // the forest's track: dark earth, needles, moss creeping in from its edges
          float tr = forestTrack(p);
          if (tr > 0.001) {
            vec3 tc = mix(vec3(0.09, 0.065, 0.045), vec3(0.16, 0.11, 0.07), vnoise(p * 1.9)) * (0.8 + 0.3 * vnoise(p * 7.0));
            tc = mix(tc, vec3(0.05, 0.08, 0.03), smoothstep(0.5, 0.8, vnoise(p * 0.9 + 4.0)) * 0.6);
            // (off the quay it is the quay's packed earth, laid over the cobbles as they thin out, and darkens to
            // the forest's earth over the next thirty metres)
            vec3 worn = vec3(0.3, 0.25, 0.18) * (0.85 + 0.3 * vnoise(p * 0.7));
            tc = mix(worn, tc, smoothstep(-300.0, -332.0, p.x));
            alb = mix(alb, tc, tr * 0.92 * smoothstep(-286.0, -302.0, p.x));
            onPath = max(onPath, tr);
          }
        }
        // the soil between the blades, only where the eye is close enough to see between them
        {
          float near = (1.0 - smoothstep(2.5, 15.0, dist)) * (1.0 - onPath);
          alb = mix(alb, texture2D(uSoilTex, p * 0.45).rgb * 0.36, near * 0.8);
        }
        // the brook: a ribbon of bright water over pebbles, dark wet earth either side
        float brook = 0.0;
        {
          float sdB = streamD(p);
          if (sdB < 3.0) {
            alb = mix(alb, vec3(0.1, 0.085, 0.06), (1.0 - smoothstep(0.7, 1.7, sdB)) * 0.85);
            brook = 1.0 - smoothstep(0.42, 0.72, sdB + (vnoise(p * 1.3) - 0.5) * 0.3);
          }
        }
        // sand: the dunes, the beach, and the lake's rim
        float c = inland(p);
        float sandK = 1.0 - smoothstep(34.0, 104.0, c + (vnoise(p * 0.035) - 0.5) * 46.0);
        sandK = max(sandK, (1.0 - smoothstep(0.02, 0.4, h - LAKE_Y)) * step(lk, 1.6) * 0.7);
        vec3 sand = mix(vec3(0.36, 0.3, 0.2), vec3(0.47, 0.41, 0.29), vnoise(p * 0.21) * 0.6 + vnoise(p * 2.3) * 0.4);
        sand *= mix(0.62, 1.0, smoothstep(level, level + 0.7, h));
        alb = mix(alb, sand, sandK);

        // far off, the field is the tops of its grass, and reads as grass: fine strokes standing along the line of sight
        {
          float grassK = (1.0 - sandK) * (1.0 - onPath) * (1.0 - smoothstep(0.3, 0.8, woods));
          // (strokes fixed in the land, lying with the wind: each scale fades before it is finer than a pixel)
          const vec2 vd = vec2(0.864, 0.503);
          vec2 sq = vec2(dot(p, vec2(-vd.y, vd.x)), dot(p, vd));
          float streak = (vnoise(sq * vec2(0.9, 0.16)) - 0.5) * 0.26 * (1.0 - smoothstep(0.35, 1.3, fw));
          float streak2 = (vnoise(sq * vec2(2.6, 0.45) + 9.0) - 0.5) * 0.16 * (1.0 - smoothstep(0.12, 0.5, fw));
          float streak3 = (vnoise(sq * vec2(0.22, 0.05) + 3.0) - 0.5) * 0.2 * (1.0 - smoothstep(1.5, 6.0, fw));
          alb = mix(alb, fieldFar(alb, dist) * (1.0 + (streak + streak2 + streak3) * smoothstep(10.0, 40.0, dist)), grassK);
        }
        float sh = deskShadow(vWorld) * treeShade(vWorld) * cloudShade(vWorld);
        float ao = deskAO(vWorld) * (1.0 - 0.34 * smoothstep(0.0, 0.07, vCav)) * (1.0 + 0.08 * smoothstep(0.0, 0.06, -vCav));
        float ndl = max(dot(N, uKeyDir), 0.0);
        vec3 light = uSkyCol * (0.62 * ao) * (0.75 + 0.25 * N.y) + uKeyCol * (0.25 + 0.75 * ndl) * sh * sunUp * mix(0.6, 1.0, ao);
        col = alb * light;
        // the wind's waves run on over the far field as light
        col *= 1.0 + windWave(p) * 0.16 * (1.0 - sandK) * (1.0 - onPath) * smoothstep(20.0, 70.0, dist) * (1.0 - smoothstep(500.0, 1400.0, dist)) * (1.0 - woods);

        // ----- water -----
        if (h < level) {
          float depth = level - h;
          float seaK = still ? 0.0 : 1.0;
          vec3 P = vec3(p.x, level, p.y);
          // how much of the wave pattern a pixel can still carry: beyond that it is averaged, never sampled (no sparkle of
          // aliasing, no crawling), so the water is still at any distance and from any height
          // (and by distance: the wave sheet repeats every few metres, which from the sky is a pattern of tiles; far water is
          // the sky's mirror, darkened in broad slow patches where the wind lies on it)
          float keep1 = (1.0 - smoothstep(0.6, 3.5, fw)) * (1.0 - smoothstep(50.0, 260.0, dist));   // ripples (metres)
          float keep2 = (1.0 - smoothstep(4.0, 22.0, fw)) * (1.0 - smoothstep(260.0, 1300.0, dist));  // chop and swell
          // two scales of travelling waves, and on the sea a long swell coming in to the beach
          vec2 pf = isRiver ? p + vec2(uTime * 0.42, -uTime * 0.42 * riverSlope(p.x)) : p;
          vec2 w1 = pf / 3.1 + vec2(uTime * 0.021, uTime * 0.013);
          vec2 w2 = pf / 11.0 - vec2(uTime * 0.012, -uTime * 0.008);
          vec2 w3 = p / 47.0 + vec2(uTime * 0.006, uTime * 0.004);
          const float E = 0.012;
          float a0 = texture2D(uCloudTex, w1).b, b0 = texture2D(uCloudTex, w2).b, c0 = texture2D(uCloudTex, w3).b;
          vec2 g1 = vec2(texture2D(uCloudTex, w1 + vec2(E, 0.0)).b - a0, texture2D(uCloudTex, w1 + vec2(0.0, E)).b - a0);
          vec2 g2 = vec2(texture2D(uCloudTex, w2 + vec2(E, 0.0)).b - b0, texture2D(uCloudTex, w2 + vec2(0.0, E)).b - b0);
          vec2 g3 = vec2(texture2D(uCloudTex, w3 + vec2(E, 0.0)).b - c0, texture2D(uCloudTex, w3 + vec2(0.0, E)).b - c0);
          vec2 slope = g1 * mix(1.4, 3.2, seaK) * keep1 + g2 * mix(0.8, 4.2, seaK) * keep2 + g3 * 5.0 * seaK * keep2;
          float cst = coastZ(p.x) - p.y; // (negative out at sea)
          // (only near by: from high up a regular swell is rings drawn on the sea)
          float swell = sin(cst * 0.21 + uTime * 0.55 + c0 * 5.0 + b0 * 3.0) * seaK * keep2 * smoothstep(-260.0, -8.0, cst) * (1.0 - smoothstep(70.0, 420.0, dist));
          slope += vec2(0.0, 1.0) * swell * 0.05;
          vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
          vec3 r = reflect(-V, n);
          // a rough sea does not mirror the horizon: at a grazing look its facets show the sky higher up, so it is
          // darker and bluer than the air above it
          r.y = abs(r.y) + 0.003 + 0.16 * seaK * (1.0 - keep1 * 0.5);
          r = normalize(r);
          vec3 mirror = skyMirror(P, r);
          if (isLake && uReflOn > 0.5) {
            // the trees and the mountains standing in it, loosened by the ripples
            vec4 rc = uReflMat * vec4(P, 1.0);
            vec2 uv = rc.xy / rc.w + slope * 0.035;
            vec2 ts = vec2(1.6 / 480.0, 1.6 / 270.0);
            vec2 uc = clamp(uv, 0.004, 0.996);
            vec4 tex = (texture2D(uReflTex, uc + ts * vec2(0.5, 0.5)) + texture2D(uReflTex, uc + ts * vec2(-0.5, 0.5)) + texture2D(uReflTex, uc + ts * vec2(0.5, -0.5)) + texture2D(uReflTex, uc - ts * vec2(0.5, 0.5))) * 0.25;
            // (toward the picture's edge it gives way to the water's own sky, so no hard line shows where it ends)
            tex.a *= smoothstep(0.0, 0.05, uv.x) * smoothstep(0.0, 0.05, 1.0 - uv.x) * smoothstep(0.0, 0.05, uv.y) * smoothstep(0.0, 0.05, 1.0 - uv.y);
            mirror = mix(mirror, tex.rgb, tex.a * 0.94);
          }
          // the sun on the water: a path of light, breaking into glitter near by (the glitter is a slow pattern that
          // fades before its grains are smaller than a pixel)
          float sunVis = smoothstep(-0.03, 0.03, uSunDir.y);
          vec3 flatR = normalize(reflect(-V, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.004, 0.0));
          vec3 sunC = mix(uGlow, vec3(1.0), 0.45);
          float lobeW = mix(140.0, 26.0, seaK);
          float sunPath = pow(max(dot(flatR, uSunDir), 0.0), lobeW);
          float moonPath = pow(max(dot(flatR, uMoonDir), 0.0), lobeW * 1.4);
          float gl = texture2D(uCloudTex, p / 2.6 + vec2(uTime * 0.03, -uTime * 0.02)).g * texture2D(uCloudTex, p / 1.1 - vec2(uTime * 0.025, uTime * 0.04)).b;
          float spark = smoothstep(0.3, 0.5, gl) * (1.0 - smoothstep(0.03, 0.22, fw));
          float glintN = pow(max(dot(r, uSunDir), 0.0), mix(240.0, 90.0, seaK)) * mix(7.0, 3.5, seaK) * (1.0 - smoothstep(0.1, 0.9, fw));
          mirror += sunC * (glintN + sunPath * (0.7 + spark * 7.0 + (b0 - 0.4) * 1.6 * keep2)) * sunVis * cloudShade(P);
          mirror += vec3(0.8, 0.86, 1.0) * moonPath * (0.5 + spark * 4.0 + (b0 - 0.4) * 1.2 * keep2) * uNight;

          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          fres = mix(fres, min(fres, 0.72), seaK);
          vec3 wl = uSkyCol * 0.9 + uKeyCol * 0.4 * sunUp;
          // clear over the sand, turquoise in the shallows, deep blue beyond
          vec3 deep = mix(vec3(0.012, 0.024, 0.02), vec3(0.006, 0.03, 0.062), seaK) * wl;
          vec3 shallow = mix(vec3(0.05, 0.075, 0.045), vec3(0.03, 0.2, 0.2), seaK) * wl;
          vec3 body = mix(shallow, deep, 1.0 - exp(-depth * mix(1.5, 0.3, seaK)));
          // the bed shows through the first hand of water
          body = mix(body, col * mix(vec3(0.7), vec3(0.62, 0.86, 0.8), seaK), exp(-depth * mix(4.5, 1.6, seaK)) * 0.85);
          vec3 wcol = mix(body, mirror, clamp(fres * 0.94 + 0.05, 0.0, 1.0));
          wcol *= 1.0 - 0.14 * seaK * smoothstep(0.35, 0.7, vnoise(p * 0.0037 + vec2(uTime * 0.004, 0.0))) * smoothstep(200.0, 900.0, dist);
          // the swell's backs are a little lighter, its troughs darker
          wcol *= 1.0 + swell * 0.07;
          if (seaK > 0.5) {
            // surf: a line of foam at the sand that comes and goes, and two soft lines of breaking swell further out
            float wob = vnoise(p * 0.05 + vec2(0.0, uTime * 0.05)) * 6.2832;
            float wash = 0.5 + 0.5 * sin(uTime * 0.7 + wob);
            float lace = vnoise(p * 1.7 + vec2(uTime * 0.2, 0.0)) * 0.6 + vnoise(p * 5.0 - vec2(0.0, uTime * 0.3)) * 0.4;
            lace = mix(0.5, lace, 1.0 - smoothstep(0.1, 0.5, fw));
            float foam = (1.0 - smoothstep(0.0, 0.16 + 0.3 * wash, depth)) * smoothstep(0.25, 0.6, lace + 0.35 * wash);
            float roll = smoothstep(0.75, 1.0, sin(depth * 3.6 - uTime * 0.9 + wob)) * smoothstep(0.3, 0.7, depth) * (1.0 - smoothstep(1.4, 2.6, depth));
            foam = max(foam, roll * smoothstep(0.35, 0.7, lace) * 0.75);
            wcol = mix(wcol, vec3(0.92, 0.95, 0.96) * (uSkyCol * 0.9 + uKeyCol * 0.6 * sunUp), clamp(foam, 0.0, 1.0) * (1.0 - smoothstep(0.8, 5.0, fw)));
          }
          // a soft edge where water meets land, and the sand dark with wet beside it
          col = mix(col * mix(0.72, 1.0, smoothstep(0.0, 0.12, -depth + 0.12)), wcol, smoothstep(0.0, still ? 0.035 : 0.06, depth));
        } else {
          // wet sand and earth along any waterline
          col *= mix(0.74, 1.0, smoothstep(0.0, 0.22, h - level));
        }

        if (brook > 0.001) {
          float run = texture2D(uCloudTex, vec2(p.x * 0.31 - uTime * 0.22, p.y * 0.9)).g;
          vec3 rB = reflect(-V, normalize(vec3((run - 0.5) * 0.5, 1.0, 0.0)));
          rB.y = abs(rB.y) + 0.02;
          float fB = 0.04 + 0.96 * pow(1.0 - max(V.y, 0.0), 5.0);
          vec3 wB = mix(vec3(0.05, 0.07, 0.05) * (uSkyCol + uKeyCol * 0.4 * sunUp), skyBase(normalize(rB)), clamp(fB + 0.25, 0.0, 1.0));
          wB += vec3(1.0, 0.95, 0.85) * uKeyCol * smoothstep(0.62, 0.8, run) * 0.25 * sunUp * (1.0 - smoothstep(0.2, 1.2, fw));
          col = mix(col, wB, brook);
        }
        col = homeAir(col, vWorld);
        // the last of the sea goes into the sky before the surface ends
        col = mix(col, homeAirCol(-V), smoothstep(${(LAND_FAR * 0.42).toFixed(1)}, ${(LAND_FAR * 0.94).toFixed(1)}, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// The land is drawn as a clipmap (nested square grids, each twice as coarse as the one inside it, each moved only by
// whole steps of its own lattice). It used to be a disc of rings riding smoothly with the eye: then every vertex slid
// over the land as the eye moved, the land's own shape was sampled somewhere new each frame, and the ground swam:
// the shore most of all (the land's height against the water's is a sharp crease, and the drawn water's edge
// wobbled up and down the beach as you came near), and far hills and coast rippled in flight.
const CELLS = 48; // half the width of a level, in its own cells
const HOLE = 20; // half the width of the hole in a coarser level, in its cells (well inside the finer level's rim)
export function Land({ mobile }: { mobile: boolean }) {
  const n = mobile ? 32 : CELLS;
  const hole = mobile ? 12 : HOLE;
  const cell0 = mobile ? 0.5 : 0.25;
  const levels = Math.ceil(Math.log2(LAND_FAR / (cell0 * n))) + 1;
  const geo = useMemo(() => ({ full: levelGeometry(n, 0), ring: levelGeometry(n, hole) }), [n, hole]);
  const mat = useMemo(() => makeLandMaterial(), []);
  const mats = useMemo(
    () =>
      Array.from({ length: levels }, (_, l) => {
        const m = l === 0 ? mat : mat.clone();
        // (one set of uniforms for every level but its own lattice)
        if (l > 0) m.uniforms = { ...mat.uniforms, uCenter: { value: new THREE.Vector2() }, uCell: { value: 1 }, uMorph: { value: 1e9 }, uHole: { value: 0 } };
        m.uniforms.uCell.value = cell0 * 2 ** l;
        // (the rim begins to morph eight cells in from the edge: whatever the snap, it is whole before the edge)
        m.uniforms.uMorph.value = l === levels - 1 ? 1e9 : n - 8;
        // (inside this, the finer level draws: two and a half of its cells in from its own edge, where it is fully morphed)
        m.uniforms.uHole.value = l === 0 ? 0 : (n - 2.5) * cell0 * 2 ** (l - 1);
        return m;
      }),
    [mat, levels, cell0, n],
  );
  useEffect(
    () => () => {
      geo.full.dispose();
      geo.ring.dispose();
      mat.uniforms.uSoilTex.value.dispose();
      mats.forEach((m) => m.dispose());
    },
    [geo, mat, mats],
  );
  useFrame(({ camera }) => {
    mat.uniforms.uEye.value.set(camera.position.x, camera.position.z);
    for (const m of mats) {
      const s = m.uniforms.uCell.value * 2;
      m.uniforms.uCenter.value.set(Math.round(camera.position.x / s) * s, Math.round(camera.position.z / s) * s);
    }
  });
  return (
    <>
      {mats.map((m, l) => (
        <mesh key={l} geometry={l === 0 ? geo.full : geo.ring} material={m} renderOrder={-5} frustumCulled={false} />
      ))}
    </>
  );
}
