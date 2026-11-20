"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HOME_GATE_Z } from "../flightPath";
import { GLSL_NOISE, GLSL_PATH } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_DESK_SHADOW } from "../World";
import { CLOUD, GLSL_FIELD, GLSL_HOME_AIR, GLSL_LAND, HOME_U } from "./land";

// The land, the lake and the sea, as one surface. A disc of rings that rides
// with the eye (fine underfoot, each ring a few per cent wider than the last,
// out to the horizon), lifted onto the land's height in the vertex shader and
// never below the water. Each pixel then knows what it is: meadow (the same
// paint as the blades standing on it, so the grass has no edge), the worn
// footpath, forest floor, sand, or water: the lake still and mirroring, the
// sea rolling in with a sun path, glitter and foam on the beach.

function ringGeometry(nA: number, r0: number, rMax: number) {
  const k = 1 + (2 * Math.PI) / nA;
  const radii: number[] = [];
  for (let r = r0; r < rMax * k; r *= k) radii.push(Math.min(r, rMax));
  const pos = new Float32Array((1 + radii.length * nA) * 3);
  const idx: number[] = [];
  let v = 1;
  radii.forEach((r, j) => {
    // every other ring is turned half a step, so the triangles do not line up into spokes
    const turn = j % 2 ? Math.PI / nA : 0;
    for (let i = 0; i < nA; i++, v++) {
      const a = (i / nA) * Math.PI * 2 + turn;
      pos[v * 3] = Math.cos(a) * r;
      pos[v * 3 + 2] = Math.sin(a) * r;
    }
  });
  for (let i = 0; i < nA; i++) idx.push(0, 1 + ((i + 1) % nA), 1 + i);
  for (let j = 0; j < radii.length - 1; j++)
    for (let i = 0; i < nA; i++) {
      const a = 1 + j * nA + i;
      const b = 1 + j * nA + ((i + 1) % nA);
      const c = a + nA;
      const d = b + nA;
      if (j % 2) idx.push(a, b, d, a, d, c);
      else idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
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
    uniforms: { ...SKY_U, ...HOME_U, ...REFLECT_U, uCenter: { value: new THREE.Vector2() }, uSoilTex: { value: soil } },
    vertexShader: /* glsl */ `
      uniform vec2 uCenter;
      varying vec3 vWorld; varying vec3 vN;
      ${GLSL_LAND}
      void main(){
        vec2 p = position.xz + uCenter;
        float h = landH(p);
        float level = hLakeK(p) < 1.15 ? LAKE_Y : SEA;
        vWorld = vec3(p.x, max(h, level), p.y);
        vN = landN(p);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSoilTex; uniform sampler2D uReflTex; uniform mat4 uReflMat; uniform float uReflOn;
      varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_DESK_SHADOW}
      ${GLSL_PATH}
      ${GLSL_LAND}
      ${GLSL_HOME_AIR}
      ${GLSL_FIELD}

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

      void main(){
        vec2 p = vWorld.xz;
        float dist = length(vWorld - cameraPosition);
        float h = landH(p);
        float lk = hLakeK(p);
        bool isLake = lk < 1.15;
        float level = isLake ? LAKE_Y : SEA;
        vec3 V = normalize(cameraPosition - vWorld);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        vec3 col;

        // ----- the land -----
        vec3 N = normalize(vN);
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
          alb += fh * fh * vec3(0.07, 0.06, 0.035) * fd * smoothstep(30.0, 150.0, dist);
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
        {
          float pw = pathW(p.y);
          float px = abs(p.x - pathX(p.y)) / pw;
          float n2 = vnoise(p * 0.9);
          float along = p.y > 0.0 ? 1.0 - smoothstep(22.0, 46.0, p.y) : 1.0 - smoothstep(${(-HOME_GATE_Z + 6).toFixed(1)}, ${(-HOME_GATE_Z + 34).toFixed(1)}, -p.y);
          onPath = (1.0 - smoothstep(0.42 + n2 * 0.3, 1.02 + n2 * 0.34, px)) * along;
          float fine = vnoise(p * 9.0) * 0.6 + vnoise(p * 31.0) * 0.4;
          vec3 earth = vec3(0.37, 0.32, 0.235) * (0.9 + 0.2 * fine);
          earth *= 1.0 + 0.12 * (1.0 - smoothstep(0.0, 0.55, px));
          // small pale pebbles pressed into it
          vec2 pc = p * 11.0; float ph = hash12(floor(pc));
          earth = mix(earth, vec3(0.5, 0.47, 0.41), step(0.955, ph) * (1.0 - smoothstep(0.18, 0.4, length(fract(pc) - 0.5))) * (1.0 - smoothstep(0.03, 0.12, fw)));
          alb = mix(alb, earth, onPath);
        }
        // the soil between the blades, only where the eye is close enough to see between them
        {
          float near = (1.0 - smoothstep(2.5, 15.0, dist)) * (1.0 - onPath);
          alb = mix(alb, texture2D(uSoilTex, p * 0.45).rgb * 0.36, near * 0.8);
        }
        // sand: the dunes, the beach, and the lake's rim
        float c = inland(p);
        float sandK = 1.0 - smoothstep(34.0, 104.0, c + (vnoise(p * 0.035) - 0.5) * 46.0);
        sandK = max(sandK, (1.0 - smoothstep(0.02, 0.4, h - LAKE_Y)) * step(lk, 1.6) * 0.7);
        vec3 sand = mix(vec3(0.36, 0.3, 0.2), vec3(0.47, 0.41, 0.29), vnoise(p * 0.21) * 0.6 + vnoise(p * 2.3) * 0.4);
        sand *= mix(0.62, 1.0, smoothstep(level, level + 0.7, h));
        alb = mix(alb, sand, sandK);

        float sh = deskShadow(vWorld) * treeShade(vWorld) * cloudShade(vWorld);
        float ao = deskAO(vWorld);
        float ndl = max(dot(N, uKeyDir), 0.0);
        vec3 light = uSkyCol * (0.62 * ao) * (0.75 + 0.25 * N.y) + uKeyCol * (0.25 + 0.75 * ndl) * sh * sunUp * mix(0.6, 1.0, ao);
        col = alb * light;
        // the wind's waves run on over the far field as light
        col *= 1.0 + windWave(p) * 0.16 * (1.0 - sandK) * (1.0 - onPath) * smoothstep(20.0, 70.0, dist) * (1.0 - smoothstep(500.0, 1400.0, dist)) * (1.0 - woods);

        // ----- water -----
        if (h < level) {
          float depth = level - h;
          float seaK = isLake ? 0.0 : 1.0;
          vec3 P = vec3(p.x, level, p.y);
          float calm = 1.0 / (1.0 + dist * mix(0.02, 0.0045, seaK));
          float e = 0.5;
          float r0 = ripple(p, seaK);
          float rx = ripple(p + vec2(e, 0.0), seaK);
          float rz = ripple(p + vec2(0.0, e), seaK);
          float amp = mix(0.07, 0.42, seaK) * (0.25 + 0.75 * calm);
          vec3 n = normalize(vec3((r0 - rx) * amp / e, 1.0, (r0 - rz) * amp / e));
          vec3 r = reflect(-V, n);
          r.y = abs(r.y) + 0.003;
          r = normalize(r);
          vec3 mirror = skyMirror(P, r);
          if (isLake && uReflOn > 0.5) {
            // the trees, the hills and the clouds standing in it, loosened by the ripples
            vec4 rc = uReflMat * vec4(P, 1.0);
            vec2 uv = rc.xy / rc.w + n.xz * 0.9 * (0.3 + 0.7 * calm);
            vec3 tex = texture2D(uReflTex, clamp(uv, 0.002, 0.998)).rgb;
            mirror = mix(mirror, tex, 0.92);
          }
          // the sun on the water: a path of light, breaking into glitter
          float sunVis = smoothstep(-0.03, 0.03, uSunDir.y);
          float sd = max(dot(r, uSunDir), 0.0);
          float rough = mix(900.0, 90.0, smoothstep(0.0, 900.0, dist) * seaK);
          vec3 sunC = mix(uGlow, vec3(1.0), 0.45);
          float glint = pow(sd, rough) * mix(26.0, 5.0, smoothstep(0.0, 900.0, dist) * seaK);
          float zone = pow(max(dot(normalize(reflect(-V, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 0.004, 0.0)), uSunDir), 0.0), mix(18.0, 60.0, 1.0 - seaK));
          float tw = texture2D(uCloudTex, p / 2.3 + vec2(uTime * 0.06, -uTime * 0.04)).g * texture2D(uCloudTex, p / 0.9 - vec2(uTime * 0.05, uTime * 0.08)).b;
          float spark = smoothstep(0.33, 0.5, tw) * (1.0 - smoothstep(0.2, 1.4, fw));
          float farSpark = texture2D(uCloudTex, p / 26.0 + vec2(uTime * 0.02, 0.0)).g * (0.6 + 0.4 * sin(uTime * 3.0 + p.x * 0.7));
          mirror += sunC * (glint + zone * (spark * 9.0 + smoothstep(0.55, 0.8, farSpark) * 2.2 * seaK)) * sunVis * cloudShade(P);
          mirror += vec3(0.8, 0.85, 1.0) * (pow(max(dot(r, uMoonDir), 0.0), 700.0) * 9.0 + pow(max(dot(normalize(reflect(-V, vec3(0.0, 1.0, 0.0))), uMoonDir), 0.0), 40.0) * spark * 1.6) * uNight;

          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 wl = uSkyCol * 0.9 + uKeyCol * 0.35 * sunUp;
          vec3 deep = mix(vec3(0.012, 0.022, 0.018), vec3(0.008, 0.035, 0.055), seaK) * wl;
          vec3 shallow = mix(vec3(0.05, 0.07, 0.04), vec3(0.05, 0.19, 0.18), seaK) * wl;
          vec3 body = mix(shallow, deep, 1.0 - exp(-depth * mix(1.6, 0.42, seaK)));
          // the bed shows through the first hand of water
          body = mix(body, col * 0.7, exp(-depth * 4.5) * 0.8);
          vec3 wcol = mix(body, mirror, clamp(fres * 0.94 + 0.05, 0.0, 1.0));
          if (seaK > 0.5) {
            // surf: a line of foam at the sand that comes and goes, and one or two soft lines further out
            float wob = vnoise(p * 0.05 + vec2(0.0, uTime * 0.05)) * 6.2832;
            float wash = 0.5 + 0.5 * sin(uTime * 0.7 + wob);
            float lace = vnoise(p * 1.7 + vec2(uTime * 0.2, 0.0)) * 0.6 + vnoise(p * 5.0 - vec2(0.0, uTime * 0.3)) * 0.4;
            float foam = (1.0 - smoothstep(0.0, 0.16 + 0.3 * wash, depth)) * smoothstep(0.25, 0.6, lace + 0.35 * wash);
            float roll = smoothstep(0.75, 1.0, sin(depth * 3.6 - uTime * 0.9 + wob)) * smoothstep(0.3, 0.7, depth) * (1.0 - smoothstep(1.4, 2.6, depth));
            foam = max(foam, roll * smoothstep(0.35, 0.7, lace) * 0.75);
            wcol = mix(wcol, vec3(0.92, 0.95, 0.96) * (uSkyCol * 0.9 + uKeyCol * 0.6 * sunUp), clamp(foam, 0.0, 1.0) * (1.0 - smoothstep(0.3, 2.0, fw)));
          }
          // a soft edge where water meets land
          col = mix(col, wcol, smoothstep(0.0, isLake ? 0.035 : 0.05, depth));
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

export function Land({ mobile }: { mobile: boolean }) {
  const geo = useMemo(() => ringGeometry(mobile ? 144 : 208, 1.6, LAND_FAR), [mobile]);
  const mat = useMemo(() => makeLandMaterial(), []);
  const mesh = useRef<THREE.Mesh>(null);
  useEffect(
    () => () => {
      geo.dispose();
      mat.uniforms.uSoilTex.value.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(({ camera }) => {
    // at the desk the rings stay centred on it (nothing can swim); away from it they ride with the eye
    const d = Math.hypot(camera.position.x, camera.position.z);
    const k = THREE.MathUtils.smoothstep(d, 40, 90);
    mat.uniforms.uCenter.value.set(camera.position.x * k, camera.position.z * k);
  });
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={-5} frustumCulled={false} />;
}
