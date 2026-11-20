"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { MIRROR_LAYER } from "./Forest";
import { GLSL_HOME_AIR, HOME_U, rng } from "./land";

// The heaped clouds of the home sky, as he painted them and as the film of
// his paintings modelled them: each a solid rounded thing, a heap of soft
// lumps over a flatter underside, golden where the sun reaches it and the
// blue-violet of shade underneath, hundreds of them standing in two layers of
// air to the horizon and going into its haze. They are real forms in the
// world: the mountains stand behind some and in front of others, the lake
// mirrors them, and they drift.
//
// Their edges are not polygons: toward its rim each lump thins away through a
// fine grain (pastel on a toothed ground), and the same grain breaks the
// silhouette into small billows.

const SPAN = 15000; // the field they drift across, wrapping

function buildCloud(seed: number, detail: number) {
  const r = rng(seed);
  const src = new THREE.IcosahedronGeometry(1, detail);
  const sp = src.attributes.position;
  const pos: number[] = [];
  const nor: number[] = [];
  const aux: number[] = []; // x: shade from its place in the heap (0 deep/under .. 1 open/top)
  const n = 6 + Math.floor(r() * 5);
  // a long low heap: big lumps along the middle, smaller ones round and on top
  const lumps: { c: THREE.Vector3; s: THREE.Vector3 }[] = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const big = i < 3;
    const a = r() * Math.PI * 2;
    const d = big ? (i - 1) * 0.62 : 0.3 + r() * 0.75;
    const w = big ? 0.62 - Math.abs(i - 1) * 0.12 + r() * 0.1 : 0.28 + r() * 0.22;
    const c = big ? new THREE.Vector3(d, 0.05 * r(), (r() - 0.5) * 0.3) : new THREE.Vector3(Math.cos(a) * d * 1.15, (r() - 0.25) * 0.42 + (k > 0.7 ? 0.25 : 0), Math.sin(a) * d * 0.7);
    lumps.push({ c, s: new THREE.Vector3(w * (1.05 + r() * 0.3), w * (0.72 + r() * 0.2), w * (0.95 + r() * 0.25)) });
  }
  const v = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (const L of lumps) {
    const sd = r() * 50;
    for (let i = 0; i < sp.count; i++) {
      v.fromBufferAttribute(sp, i).normalize();
      const bump = 1 + 0.13 * Math.sin(v.x * 3.3 + sd) * Math.sin(v.y * 2.9 + sd * 1.3) + 0.08 * Math.sin(v.z * 5.1 + sd * 0.7 + v.x * 2.2);
      // the underside is flatter
      const under = v.y < 0 ? 0.55 : 1;
      q.set(L.c.x + v.x * L.s.x * bump, L.c.y + v.y * L.s.y * bump * under, L.c.z + v.z * L.s.z * bump);
      pos.push(q.x, q.y, q.z);
      const nn = new THREE.Vector3(v.x / L.s.x, (v.y / L.s.y) * (v.y < 0 ? 1.6 : 1), v.z / L.s.z).normalize();
      nor.push(nn.x, nn.y, nn.z);
      // how buried this point is in the other lumps: creases between lumps are in shade
      let open = 1;
      for (const M of lumps) {
        if (M === L) continue;
        const e = Math.hypot((q.x - M.c.x) / M.s.x, (q.y - M.c.y) / M.s.y, (q.z - M.c.z) / M.s.z);
        open = Math.min(open, THREE.MathUtils.smoothstep(e, 0.85, 1.5));
      }
      aux.push(open);
    }
  }
  src.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aOpen", new THREE.Float32BufferAttribute(aux, 1));
  return g;
}

export function Clouds({ mobile, amount = 1 }: { mobile: boolean; amount?: number }) {
  const { meshes, mat, geos } = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...SKY_U, ...HOME_U },
      vertexShader: /* glsl */ `
        attribute float aOpen; attribute vec4 aPlace; attribute vec4 aSize;
        uniform float uTime; uniform float uNight;
        varying vec3 vWorld; varying vec3 vN; varying float vOpen; varying vec3 vLocal; varying float vSeed;
        void main(){
          // the cloud's place drifts with the wind and wraps round the field, centred on the eye
          vec2 c = aPlace.xz + vec2(uTime * 2.6, uTime * 0.9) * (0.8 + 0.4 * aSize.w);
          c = mod(c - cameraPosition.xz + ${(SPAN / 2).toFixed(1)}, ${SPAN.toFixed(1)}) - ${(SPAN / 2).toFixed(1)} + cameraPosition.xz;
          float cs = cos(aPlace.w); float sn = sin(aPlace.w);
          // after dark most of them are gone and the rest are smaller: the night is for the stars
          float nightK = aSize.w > 0.38 ? 1.0 - smoothstep(0.35, 0.8, uNight) : 1.0 - 0.35 * uNight;
          vec3 p = position * aSize.xyz * nightK;
          p = vec3(p.x * cs + p.z * sn, p.y, -p.x * sn + p.z * cs);
          vec3 n = normalize(normal / aSize.xyz);
          vN = vec3(n.x * cs + n.z * sn, n.y, -n.x * sn + n.z * cs);
          vWorld = vec3(c.x, aPlace.y, c.y) + p;
          vLocal = position; vOpen = aOpen; vSeed = aSize.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vN; varying float vOpen; varying vec3 vLocal; varying float vSeed;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_HOME_AIR}
        float n3(vec3 p){ return vnoise(p.xz + p.y * 0.71) * 0.6 + vnoise(p.xy * 1.9 + p.z * 1.3) * 0.4; }
        void main(){
          vec3 n = normalize(vN);
          vec3 V = normalize(cameraPosition - vWorld);
          float dist = length(vWorld - cameraPosition);
          // small billows on the skin: the smooth lump broken into many soft ones
          vec3 lp = vLocal * 5.5 + vSeed * 17.0;
          float b0 = n3(lp);
          vec3 bg = vec3(n3(lp + vec3(0.3, 0.0, 0.0)), n3(lp + vec3(0.0, 0.3, 0.0)), n3(lp + vec3(0.0, 0.0, 0.3))) - b0;
          float fine = 1.0 - smoothstep(4000.0, 11000.0, dist);
          n = normalize(n - bg * 1.7 * fine);
          // the rim: thinning away through a grain, and broken by the billows
          float facing = abs(dot(normalize(vN), V));
          float edge = smoothstep(0.0, 0.2, facing + (b0 - 0.5) * 0.2 * fine);
          // a cloud the eye is about to enter thins to nothing round it (the white it becomes is the air's)
          edge *= smoothstep(140.0, 520.0, dist + (b0 - 0.5) * 120.0);
          float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (edge < grain * 0.985 + 0.015) discard;

          vec3 L = normalize(mix(uMoonDir, vec3(uSunDir.x, max(uSunDir.y, 0.02), uSunDir.z), smoothstep(-0.14, -0.03, uSunDir.y)));
          float keyUp = mix(0.42 * uNight, 1.0, smoothstep(-0.14, -0.03, uSunDir.y));
          float ndl = dot(n, L);
          float lit = smoothstep(-0.3, 0.85, ndl) * (0.45 + 0.55 * vOpen);
          float up = n.y * 0.5 + 0.5;
          // shade: the sky's own blue-violet from above, darker and a little warmer (the land's light) underneath
          vec3 col = uCloudShade * (0.52 + 0.5 * up) * (0.72 + 0.28 * vOpen);
          col += uHorizon * 0.12 * (1.0 - up);
          col += uCloudLit * lit * keyUp;
          // a low sun reaches in under them: the bellies on its side take its colour
          float lowSun = (1.0 - smoothstep(0.08, 0.34, uSunDir.y)) * smoothstep(-0.12, 0.0, uSunDir.y);
          col += uCloudLit * 0.42 * max(-n.y, 0.0) * lowSun * smoothstep(-0.5, 0.7, dot(normalize(n.xz + 1e-4), normalize(L.xz + 1e-4))) * (0.5 + 0.5 * vOpen);
          // light through the thin rim toward the sun, and a glow round it
          float sd = max(dot(-V, uSunDir), 0.0);
          col += uGlow * ((pow(sd, 5.0) * 0.5 + pow(sd, 30.0) * 1.3) * (1.0 - edge * 0.75) + pow(sd, 3.0) * 0.22) * keyUp * smoothstep(-0.1, 0.02, uSunDir.y);
          // the far ones go into the horizon's air
          vec3 d = -V;
          float a = max(homeAirAmt(vWorld), 1.0 - exp(-dist * 0.00011));
          col = mix(col, skyBase(normalize(vec3(d.x, max(d.y, 0.0) + 0.012, d.z))), clamp(a, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const R = rng(2024);
    // two cuts: the great ones in fine pieces, the many small and far ones in coarser
    const total = Math.round((mobile ? 90 : 250) * amount);
    const geos = mobile ? [buildCloud(101, 2), buildCloud(138, 2)] : [buildCloud(101, 3), buildCloud(138, 3), buildCloud(175, 2), buildCloud(212, 2)];
    const kinds = geos.length;
    const meshes = geos.map((src, k) => {
      const great = !mobile && k < 2;
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute("position", src.attributes.position);
      g.setAttribute("normal", src.attributes.normal);
      g.setAttribute("aOpen", src.attributes.aOpen);
      g.setIndex(src.index);
      const count = Math.round(mobile ? total / kinds : great ? total * 0.14 : total * 0.36);
      const place = new Float32Array(count * 4);
      const size = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        // two layers of air: most in the lower, a scatter of smaller ones higher and further
        const high = !great && R() < 0.4;
        const s = great ? 360 + R() * 330 : (high ? 190 : 150) * (0.7 + R() * 1.1);
        place[i * 4] = (R() - 0.5) * SPAN;
        place[i * 4 + 1] = (high ? 1300 : 640) + R() * 220 + s * 0.2;
        place[i * 4 + 2] = (R() - 0.5) * SPAN;
        place[i * 4 + 3] = R() * 6.283;
        size[i * 4] = s * (1 + R() * 0.5);
        size[i * 4 + 1] = s * (0.62 + R() * 0.3);
        size[i * 4 + 2] = s * (0.9 + R() * 0.4);
        size[i * 4 + 3] = R();
      }
      g.setAttribute("aPlace", new THREE.InstancedBufferAttribute(place, 4));
      g.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 4));
      g.instanceCount = count;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.renderOrder = -7;
      m.layers.enable(MIRROR_LAYER);
      void k;
      return m;
    });
    return { meshes, mat, geos };
  }, [mobile, amount]);
  useEffect(
    () => () => {
      meshes.forEach((m) => m.geometry.dispose());
      geos.forEach((g) => g.dispose());
      mat.dispose();
    },
    [meshes, mat, geos],
  );
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
