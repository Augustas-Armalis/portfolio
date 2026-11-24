"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_HOME_AIR, HOME_U, timed } from "./land";
import { MIRROR_LAYER } from "./Forest";
import { laneD } from "./journey";

// The mountains to the north: three ranges one behind another, each higher
// and paler than the one before, standing from the east round through the
// north to the west and sinking into hills toward the two coasts. They part
// in the north, where the road runs out and the desk looks: a pass, and
// beyond it only air. Eroded ridges with sharp arêtes and smooth gullies,
// wooded feet, bare rock in beds, snow lying where it is high and not too
// steep. Their feet stand in the haze of the low land and their heads clear
// of it, which is what makes them far away and large.

function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
// value noise with analytic derivatives
function noised(x: number, y: number): [number, number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const dux = 6 * fx * (1 - fx);
  const duy = 6 * fy * (1 - fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const k1 = b - a;
  const k2 = c - a;
  const k4 = a - b - c + d;
  return [a + k1 * ux + k2 * uy + k4 * ux * uy, dux * (k1 + k4 * uy), duy * (k2 + k4 * ux)];
}
// derivative-damped fbm: sharp ridges, smooth gullies and valleys
function eroded(x: number, y: number, oct: number) {
  let v = 0;
  let amp = 0.55;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < oct; i++) {
    const [n, nx, ny] = noised(x, y);
    dx += nx;
    dy += ny;
    v += (amp * n) / (1 + dx * dx + dy * dy);
    amp *= 0.5;
    const tx = 1.6 * x - 1.2 * y;
    y = 1.2 * x + 1.6 * y;
    x = tx;
  }
  return v;
}
function ridged(x: number, y: number, oct: number) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  let w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noised(x * f, y * f)[0] * 2 - 1);
    n = n * n * w;
    w = Math.min(1, n * 2);
    v += n * a;
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export type Range = { r0: number; r1: number; height: number; freq: number; seed: number; haze: number; snow: number; pass: [number, number]; span: [number, number]; massif: number; valley?: boolean };

function rangeGeometry(rg: Range, segA: number, segR: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  // angle from north (-z), positive to the west: from one coast round to the other
  const a0 = -rg.span[1] - 0.25;
  const a1 = rg.span[1] + 0.25;
  for (let j = 0; j <= segR; j++) {
    const t = j / segR;
    const r = rg.r0 + (rg.r1 - rg.r0) * t;
    // a steeper face toward the desk, a long back
    const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.8) * 1.12)), 0.8);
    for (let i = 0; i <= segA; i++) {
      const th = a0 + ((a1 - a0) * i) / segA;
      const x = -Math.sin(th) * r;
      const z = -Math.cos(th) * r;
      const wx = x * rg.freq + rg.seed + 2.5 * noised(x * rg.freq * 0.3, z * rg.freq * 0.3)[0];
      const wz = z * rg.freq - rg.seed + 2.5 * noised(z * rg.freq * 0.3 + 9, x * rg.freq * 0.3)[0];
      const h = 0.55 * ridged(wx, wz, 4) + 0.75 * eroded(wx * 0.8, wz * 0.8, 5);
      // single great peaks and low saddles along the range
      const broad = 0.38 + 0.62 * Math.pow(noised(x * rg.freq * 0.24 + 40 + rg.seed, z * rg.freq * 0.24)[0], 1.3) * 1.5;
      // (no pass any more: the greatest of them stand right where the desk looks, a little west of north)
      const pass = sstep(rg.pass[0], rg.pass[1], Math.abs(th - 0.14)) * (1 + rg.massif * Math.exp(-Math.pow((th - 0.55) / 0.5, 2)));
      const ends = 1 - sstep(rg.span[0], rg.span[1], Math.abs(th));
      // (where a range runs out low, toward the coasts and at its feet, it dives well under the land and the sea: two
      // surfaces a few metres apart, seen from kilometres off, flicker against each other)
      // (the foothills open into a long valley where the journey's forest runs north to the mountain: journey.ts)
      const vl = rg.valley ? sstep(55, 230, laneD(x, z).d) : 1;
      const hm = rg.height * h * broad * env * pass * ends * vl;
      pos.push(x, hm - 6 - 80 * (1 - sstep(0, 0.14 * rg.height + 14, hm)), z);
    }
  }
  const row = segA + 1;
  for (let j = 0; j < segR; j++)
    for (let i = 0; i < segA; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// tri: 1 for a mountain with steep faces (the cave's): the rock's grain and gullies are then projected from the side on
// what faces sideways, as well as from above, so a cliff is not streaked; the ranges, all gentle slopes, keep 0
export function makeRangeMaterial(rg: Range, tri = 0) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...HOME_U, uHaze: { value: rg.haze }, uSnow: { value: rg.snow }, uTop: { value: rg.height }, uTri: { value: tri } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uHaze; uniform float uSnow; uniform float uTop; uniform float uTri;
      varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      // fbm whose octaves finer than about two pixels are their own mean (and are not worked out at all): what the
      // pixel cannot hold would only alias, and the far ranges skip a third of their noise
      float fbmL(vec2 p, float fw){
        float v = 0.0; float a = 0.5; float f = 1.0;
        mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 5; i++) {
          float k = smoothstep(0.25, 0.6, fw * f);
          if (k >= 1.0) { v += a * 0.5; }
          else v += a * mix(vnoise(p), 0.5, k);
          p = m * p; a *= 0.5; f *= 2.0;
        }
        return v;
      }
      void main(){
        vec3 n = dot(vN, vN) > 1e-10 ? normalize(vN) : vec3(0.0, 1.0, 0.0);
        // (a range's slopes all face up; a mountain with sheer faces may be built with any winding, so there the normal is
        // turned to the eye, never by up and down, which on a cliff flips it in patches and lights them wrong)
        if (uTri > 0.5) { if (dot(n, cameraPosition - vWorld) < 0.0) n = -n; } else if (n.y < 0.0) n = -n;
        // the rock's own grain: small ribs and gullies the mesh is too coarse to carry
        float fq = 14.0 / uTop;
        // (from above on what faces up, from the sides on what faces sideways, blended: the same grain everywhere)
        vec3 pw = vec3(0.0, 1.0, 0.0);
        if (uTri > 0.5) { pw = pow(abs(n), vec3(4.0)); pw /= (pw.x + pw.y + pw.z); }
        float g0 = 0.0; vec3 pert = vec3(0.0);
        if (pw.y > 0.002) { vec2 q = vWorld.xz * fq; float a = fbm(q); g0 += a * pw.y; pert += vec3(a - fbm(q + vec2(0.35, 0.0)), 0.0, a - fbm(q + vec2(0.0, 0.35))) * pw.y; }
        if (pw.x > 0.002) { vec2 q = vWorld.zy * fq; float a = fbm(q); g0 += a * pw.x; pert += vec3(0.0, a - fbm(q + vec2(0.0, 0.35)), a - fbm(q + vec2(0.35, 0.0))) * pw.x; }
        if (pw.z > 0.002) { vec2 q = vWorld.xy * fq; float a = fbm(q); g0 += a * pw.z; pert += vec3(a - fbm(q + vec2(0.35, 0.0)), a - fbm(q + vec2(0.0, 0.35)), 0.0) * pw.z; }
        n = normalize(n + pert * 2.2 * (1.0 - n.y * 0.5));
        float hN = clamp(vWorld.y / uTop, 0.0, 1.0);
        float steep = 1.0 - n.y;
        float strata = vnoise(vec2(vWorld.y * (9.0 / uTop) + g0 * 2.0, vWorld.x * 0.004));
        vec3 forest = mix(vec3(0.035, 0.07, 0.04), vec3(0.09, 0.115, 0.045), vnoise(vWorld.xz * 0.012));
        vec3 meadow = vec3(0.13, 0.17, 0.06);
        vec3 rock = mix(vec3(0.075, 0.07, 0.085), vec3(0.2, 0.165, 0.135), strata);
        vec3 alb = mix(forest, meadow, smoothstep(0.1, 0.22, hN + (g0 - 0.5) * 0.12));
        alb = mix(alb, rock, smoothstep(0.24, 0.46, hN + steep * 0.45 + (g0 - 0.5) * 0.2));
        // snow: above a ragged line, on anything not too steep; a thin dusting lower in the gullies
        float line = hN + (g0 - 0.5) * 0.3;
        // (on a mountain of sheer faces snow clings higher up the steep, as it does on the ranges' heads)
        float sn = uSnow * smoothstep(0.42 - 0.1 * uTri, 0.56 - 0.1 * uTri, line) * (1.0 - smoothstep(0.3, 0.62, steep - 0.3 * uTri + (1.0 - hN) * 0.25));
        alb = mix(alb, vec3(0.62, 0.66, 0.74), clamp(sn, 0.0, 1.0));
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float ndl = clamp(dot(n, uKeyDir) * 0.75 + 0.25, 0.0, 1.0);
        // (a cloud's shadow falls on what faces up; on a cliff it would only be blotches, so there it fades)
        float cs = mix(1.0, cloudShade(vWorld), 0.7 * (1.0 - uTri));
        vec3 col = alb * (uSkyCol * (0.55 + 0.45 * n.y) + uKeyCol * ndl * ndl * 1.25 * sunUp * cs);
        // their feet stand in the low haze; their heads clear of it
        vec3 d = normalize(vWorld - cameraPosition);
        float low = (1.0 - smoothstep(0.0, uTop * 0.5, vWorld.y)) * 0.3;
        // (the low mist that lies in woods is drawn from a map of where the woods are: on the foot of a tall mountain
        // that map would show through as patches, so for it the air is read from well above the trees)
        float amt = max(homeAirAmt(vec3(vWorld.x, vWorld.y + 60.0 * uTri, vWorld.z)) * mix(0.62, 0.9, smoothstep(0.5, 0.0, vWorld.y / uTop)), clamp(uHaze + low, 0.0, 0.96));
        col = mix(col, homeAirCol(d), amt);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// the range itself (the second of the three): its measure is also the cave's mountain's (Cave.tsx), so that one is
// shaded as one of them, the same rock, strata, snow line and haze in the same world units
export const MAIN_RANGE: Range = { r0: 950, r1: 1900, height: 330, freq: 0.0027, seed: 11.7, haze: 0.0, snow: 0.9, pass: [-1, -0.5], span: [1.25, 1.95], massif: 0.45 };

export function HomeMountains({ mobile }: { mobile: boolean }) {
  const layers = useMemo(() => {
    const ranges: Range[] = [
      // foothills, wooded and green, close enough to read as land you could walk to
      { r0: 430, r1: 900, height: 120, freq: 0.0058, seed: 3.1, haze: 0.0, snow: 0, pass: [-1, -0.5], span: [1.5, 2.2], massif: 0.15, valley: true },
      // the range itself: snow on its heads, standing full in the view
      MAIN_RANGE,
      // and the giants behind it
      { r0: 2100, r1: 4300, height: 760, freq: 0.00125, seed: 27.3, haze: 0.16, snow: 1, pass: [-1, -0.5], span: [1.0, 1.7], massif: 0.5 },
    ];
    const segA = mobile ? 360 : 600;
    return ranges.map((rg) => ({ geo: timed("mountains", () => rangeGeometry(rg, segA, mobile ? 20 : 30)), mat: makeRangeMaterial(rg) }));
  }, [mobile]);
  useEffect(
    () => () =>
      layers.forEach((l) => {
        l.geo.dispose();
        l.mat.dispose();
      }),
    [layers],
  );
  // (drawn after the land, nearest range first: what the land and the nearer ranges hide is never shaded)
  return (
    <>
      {layers.map((l, i) => (
        <mesh key={i} geometry={l.geo} material={l.mat} renderOrder={-4.5 + i * 0.1} frustumCulled={false} onUpdate={(m) => m.layers.enable(MIRROR_LAYER)} />
      ))}
    </>
  );
}
