import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, noise2, ridge2 } from "../kit";

// The island of Tranquility: one long, low body lying across the water, a thin tail far to the left, a back that
// rises slowly, a rounded rocky head on the right that drops steeply to a short spit. Its outline is the
// painting's own, read off the picture column by column. This file is its numbers, its rock and its paint; no
// part of it reads the journey's map (worlds/voyage.ts reads this).

import { GROTTO, ISLAND, EYES, halfDepth, profJS } from "./shape";

const crownOf = (xn: number) => Math.exp(-Math.pow((xn - 0.6) / 0.11, 2));

export function buildIsland(mobile: boolean) {
  const NX = mobile ? 180 : 360;
  const NV = mobile ? 36 : 66;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NX; i++) {
    const xn = -1 + (2 * i) / NX;
    const h = profJS(xn);
    const w = halfDepth(h);
    const crown = crownOf(xn);
    for (let j = 0; j <= NV; j++) {
      // across: closer together toward the water on either side, where the faces are steep; the last step each
      // side is the skirt under the water
      const t = -1 + (2 * j) / NV;
      const skirt = j === 0 || j === NV;
      const tt = Math.min(1, Math.abs(t) * (NV / (NV - 2)));
      const av = skirt ? 1 : 1 - Math.pow(1 - tt, 1.7);
      const v = Math.sign(t) * av;
      // rounded across, fuller toward the faces so the head reads as a block of rock, not a mound
      let y = h * Math.pow(Math.max(0, 1 - Math.pow(av, 2.4)), 0.55);
      const soft = 1 - av * av;
      // carved by weather, without any rhythm: broad lumps, wandering gullies, small breaks
      const lump = noise2(xn * 5.3 + 1.7, v * 1.4 + 3.1) - 0.5;
      const gully = ridge2(xn * 7.1 + noise2(xn * 2.3, v) * 1.9 + 4.2, v * 2.1 + xn * 1.3 + (v > 0 ? 0 : 9), 4) - 0.42;
      const fine = noise2(xn * 43 + 7, v * 9 + 2) - 0.5;
      y += (lump * h * 0.16 + gully * Math.min(22, h * 0.09) + fine * Math.min(5, h * 0.02)) * soft;
      // on the crown a few rounded knuckles of rock, as he drew them
      const crest = Math.max(0, Math.min(1, (soft - 0.55) / 0.35));
      y += crown * h * 0.05 * Math.pow(noise2(xn * 34 + 0.4, 1.5 + v * 0.8), 1.6) * 2 * crest;
      if (skirt) y = -7;
      else y = Math.max(y, 0.3);
      // the faces stand in and out along the body
      // (but not where the eyes and the grotto are: there the face is where they expect it)
      const flat = v > 0 ? 1 - Math.exp(-Math.pow((ISLAND.x + xn * ISLAND.half - GROTTO.x) / 130, 2)) : 1;
      const bulge = 1 + (0.1 * (noise2(xn * 9.3 + 2, v * 1.2 + 7) - 0.5) * 2 + 0.035 * (noise2(xn * 31, v * 4) - 0.5) * 2) * flat;
      const z = ISLAND.z + v * w * bulge * (skirt ? 1.03 : 1);
      pos.push(ISLAND.x + xn * ISLAND.half, y, z);
      // deep green at the head, through grey-green, to a pale grey-violet at the far tip (the air inside one object)
      const far = Math.min(1, Math.max(0, (0.5 - xn) / 1.5));
      let r = 0.03 + (0.115 - 0.03) * far;
      let g = 0.122 + (0.15 - 0.122) * far;
      let b = 0.05 + (0.15 - 0.05) * far;
      // the crown and the face of the head catch the last light: a lighter, yellower green
      const top = crown * Math.max(0, Math.min(1, (y / Math.max(h, 1) - 0.7) / 0.24));
      const fk = Math.max(0, 1 - Math.abs(xn - 0.76) / 0.16);
      const face = fk * fk * (3 - 2 * fk) * (v > 0 ? 1 : 0.3);
      const lit = Math.min(1, top * 1.2 + face * 0.3);
      r += (0.13 - r) * lit;
      g += (0.34 - g) * lit;
      b += (0.085 - b) * lit;
      // the gullies hold darker paint
      const dk = 0.86 + 0.5 * gully;
      col.push(r * dk, g * dk, b * dk, far);
    }
  }
  for (let i = 0; i < NX; i++)
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j;
      const b = a + NV + 1;
      // (wound so its faces look outward)
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// the grotto: a low vault of wet rock running in from the face, and a plate of rock behind the face round it
export function buildGrotto() {
  const NA = 26;
  const pos: number[] = [];
  const k: number[] = [];
  const idx: number[] = [];
  const arch = (a: number, s: number): [number, number] => {
    const t = (a / NA) * Math.PI;
    return [-Math.cos(t) * GROTTO.half * s, Math.sin(t) * GROTTO.top * s];
  };
  // (the first ring stands a little proud of the island's own face, wherever that is, as the lip of the mouth;
  // the second is just behind the face)
  const rings: [number, number][] = [
    [3, 1.03],
    [-6, 1.02],
  ];
  const STEPS = 14;
  for (let i = 1; i <= STEPS; i++) rings.push([GROTTO.z - 10 - (i / STEPS) * GROTTO.deep, 1.02 - 0.36 * Math.pow(i / STEPS, 1.6)]);
  rings.forEach(([z, s], ri) => {
    for (let a = 0; a <= NA; a++) {
      const [u, y] = arch(a, s * (ri > 1 ? 1 + (noise2(a * 0.7, ri * 0.9) - 0.5) * 0.22 : 1));
      const x = GROTTO.x + u;
      const zz = ri < 2 ? ISLAND.z + halfDepth(profJS((x - ISLAND.x) / ISLAND.half)) + z : z;
      pos.push(x, a === 0 || a === NA ? -2 : y, zz);
      k.push(ri < 2 ? 0 : (ri - 1) / STEPS, y / GROTTO.top, 0);
    }
  });
  for (let r = 0; r < rings.length - 1; r++)
    for (let a = 0; a < NA; a++) {
      const p0 = r * (NA + 1) + a;
      const p1 = p0 + NA + 1;
      idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
    }
  // its end is closed: only the glimmer is there
  {
    const last = (rings.length - 1) * (NA + 1);
    const c = pos.length / 3;
    let mx = 0;
    for (let a = 0; a <= NA; a++) mx += pos[(last + a) * 3] / (NA + 1);
    pos.push(mx, GROTTO.top * 0.3, rings[rings.length - 1][0] - 6);
    k.push(1.25, 0, 0);
    for (let a = 0; a < NA; a++) idx.push(c, last + a, last + a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aK", new THREE.Float32BufferAttribute(k, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
export const ISLAND_U = {
  uEyes: { value: EYES.map((e) => new THREE.Vector3(...e)) },
  // how far the eyes have kindled (each its own, 0..1)
  uEyeK: { value: new THREE.Vector2(0, 0) },
  uOriginL: { value: new THREE.Vector3() },
};
const GROTTO_GLSL = /* glsl */ `
  const vec4 GRT = vec4(${GROTTO.x.toFixed(1)}, ${GROTTO.z.toFixed(1)}, ${GROTTO.half.toFixed(1)}, ${GROTTO.top.toFixed(1)});
  // > 0 inside the grotto's mouth as seen on the face (x across, y up), in metres from its edge
  float grottoIn(vec3 l){
    float u = (l.x - GRT.x) / GRT.z;
    float hgt = GRT.w * sqrt(max(0.0, 1.0 - u * u));
    return abs(u) < 1.0 ? hgt - l.y : -abs(l.x - GRT.x) + GRT.z;
  }`;

// The island's paint: matte green rock in the evening, a wet dark line where it meets the glass, moss on what
// faces the sky; and at dusk the two eyes' own warm light on the rock round them.
export function makeIslandMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, ...ISLAND_U },
    vertexShader: /* glsl */ `
      attribute vec4 aCol;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec4 vCol;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uEyes[2]; uniform vec2 uEyeK;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec4 vCol;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GROTTO_GLSL}
      void main(){
        // the way in: cut out of the face
        float gin = vLocal.z > ${(ISLAND.z + 20).toFixed(1)} ? grottoIn(vLocal) : -99.0;
        if (gin > 0.0) discard;
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(vWorld - cameraPosition);
        vec3 l = vLocal;
        // Close to, the rock has relief of its own: level beds that stand out a little, a few upright cracks, pitted
        // faces. It is a height worked out from the place on the rock, and the light is turned by its slope
        // (the surface's own derivatives), so ledges catch the sky and cracks hold shade as the eye passes.
        float nearK = 1.0 - smoothstep(50.0, 420.0, dist);
        vec3 n0 = n;
        // (broad beds, nearly level, only a little wandering; a few upright cracks; soft pitting: never a net of lines)
        float ledge = fract(l.y * 0.05 + vnoise(l.xz * 0.012) * 1.3);
        float bedH = smoothstep(0.0, 0.3, ledge) * (1.0 - smoothstep(0.8, 1.0, ledge));
        float crackN = vnoise(vec2(l.x * 0.11 + l.z * 0.09 + vnoise(l.xy * 0.03) * 1.5, l.y * 0.016));
        float crack = (1.0 - smoothstep(0.0, 0.03, abs(crackN - 0.5))) * smoothstep(0.55, 0.75, vnoise(l.xz * 0.02 + 4.0));
        float pit = vnoise(l.xy * 0.5 + l.z * 0.4) * 0.6 + vnoise(l.xz * 1.3 + l.y * 1.1) * 0.4;
        float steep0 = smoothstep(0.2, 0.6, 1.0 - n.y);
        float relief = (bedH * 0.9 - crack * 1.2) * steep0 + pit * 0.35;
        if (nearK > 0.01) {
          vec3 sx = dFdx(vWorld); vec3 sy = dFdy(vWorld);
          vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(relief) * r1 + dFdy(relief) * r2);
          n = normalize(abs(det) * n - grad * 0.7 * nearK);
        }
        // rock, laid in soft dabs: level beds broken by the slope, long stains running down the steep faces
        float steep = 1.0 - n.y;
        float dab = vnoise(l.xz * 0.11 + l.y * 0.09) * 0.6 + vnoise(l.xy * 0.37 + l.z * 0.3) * 0.4;
        float bed = vnoise(vec2(l.y * 0.11 + vnoise(l.xz * 0.012) * 3.0, 1.7)) * 0.6 + vnoise(vec2(l.y * 0.37, l.x * 0.006 + 4.0)) * 0.4;
        float stain = vnoise(vec2(l.x * 0.16 + l.z * 0.05, l.y * 0.012)) * 0.6 + vnoise(vec2(l.x * 0.5, l.y * 0.03 + 2.0)) * 0.4;
        vec3 alb = vCol.rgb * (0.8 + 0.4 * dab);
        alb *= 1.0 + ((bed - 0.5) * 0.5 + (stain - 0.5) * 0.5) * smoothstep(0.25, 0.7, steep);
        // moss and low growth on what faces the sky, yellower where the evening still finds it
        float moss = smoothstep(0.5, 0.82, n.y) * smoothstep(0.35, 0.7, vnoise(l.xz * 0.045 + 5.0) * 0.6 + dab * 0.4);
        alb = mix(alb, vCol.rgb * vec3(1.5, 1.6, 0.9) + vec3(0.01, 0.02, 0.0), moss * 0.55);
        // the cracks are dark, the lips of the ledges pale and dry; lichen in small pale and ochre spots
        alb *= 1.0 - 0.4 * crack * steep0 * nearK;
        alb *= 1.0 - 0.16 * (1.0 - bedH) * steep0 * nearK;
        float lich = smoothstep(0.7, 0.86, vnoise(l.xy * 0.55 + l.z * 0.45 + 9.0)) * smoothstep(0.45, 0.65, pit) * nearK;
        alb = mix(alb, mix(vec3(0.2, 0.24, 0.17), vec3(0.3, 0.24, 0.1), step(0.5, vnoise(l.xz * 0.13 + 2.0))), lich * 0.55);
        // the grain of the chalk, close to
        float near = 1.0 - smoothstep(40.0, 420.0, dist);
        float tooth = vnoise(l.xz * 1.9 + l.y * 1.3) * 0.5 + vnoise(l.xy * 4.3 - l.z * 3.1) * 0.5;
        alb *= 1.0 + (tooth - 0.5) * 0.3 * near;
        // where it stands in the glass: wet, darker, with a hair of light on the very edge of the water
        float wet = 1.0 - smoothstep(1.0, 9.0 + 5.0 * stain, l.y);
        alb *= 1.0 - 0.5 * wet;
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float lam = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0) * sunUp;
        // (the foot of the whole island stands in its own shade)
        float ao = mix(0.62, 1.0, smoothstep(-4.0, 70.0, l.y)) * mix(0.8, 1.0, smoothstep(0.3, 0.6, dab));
        vec3 col = alb * (uSkyCol * (0.66 + 0.34 * n.y) * 0.95 * ao + uKeyCol * lam * 0.4 * mix(1.0, ao, 0.5));
        // the last of the evening comes round the head from behind: a thin warm line on its edges
        float fres = pow(1.0 - abs(dot(n, V)), 3.4);
        float back = pow(max(dot(-V, uKeyDir), 0.0), 2.0);
        col += (uGlow * 0.5 + uHorizon * 0.5) * fres * (0.1 + 0.5 * back) * (1.0 - 0.6 * uNight);
        // the eyes' own light on the rock round them, and deep in the lip of the grotto
        for (int i = 0; i < 2; i++) {
          vec3 dv = uEyes[i] - l;
          float d2 = dot(dv, dv);
          float k = i == 0 ? uEyeK.x : uEyeK.y;
          float facing = clamp(dot(mix(n0, n, 0.35), normalize(dv)) * 0.6 + 0.4, 0.0, 1.0);
          vec3 warm = mix(alb, vec3(dot(alb, vec3(0.3, 0.5, 0.2))), 0.7) * vec3(1.0, 0.7, 0.34);
          col += (warm * 3.4 + 0.004) * k * facing * 200.0 / (d2 + 200.0) * (0.4 + 0.6 * exp(-d2 * 0.0006));
        }
        // the dark of the grotto shades the rock round its mouth
        col *= 1.0 - 0.55 * smoothstep(-9.0, 0.0, gin) * step(${(ISLAND.z + 20).toFixed(1)}, vLocal.z);
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// inside the grotto: wet black-green rock; the eyes' light just reaches its lip; and far in, round the bend, a
// faint blue glimmer: the ultramarine night of the Funeral Symphony, which lies beyond the rock
export function makeGrottoMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...ISLAND_U },
    vertexShader: /* glsl */ `
      attribute vec3 aK;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vK;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vK = aK;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uEyeK;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vK;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float deep = vK.x;
        float rib = vnoise(vec2(vLocal.x * 0.3 + vLocal.z * 0.21, vLocal.y * 0.22)) * 0.6 + vnoise(vLocal.xz * 0.9 + vLocal.y * 0.8) * 0.4;
        vec3 alb = vec3(0.022, 0.042, 0.034) * (0.45 + 1.2 * rib);
        vec3 col = alb * uSkyCol * (1.0 - 0.85 * smoothstep(0.0, 0.35, deep));
        // the eyes' light on the lip
        col += alb * vec3(1.0, 0.7, 0.34) * (uEyeK.x + uEyeK.y) * 0.7 * exp(-deep * 9.0);
        // and the glimmer from within: a cold blue, moving like light off water on the vault
        float shimmer = vnoise(vec2(vLocal.x * 0.09 + uTime * 0.07, vLocal.z * 0.07 - uTime * 0.05)) * vnoise(vec2(vLocal.z * 0.13 + uTime * 0.04, vLocal.y * 0.2 + 3.0));
        // the sheet of light that stands inside lights the wet rock round it, most where it stands
        col += vec3(0.16, 0.26, 0.42) * exp(-pow((deep - 0.25) * 4.5, 2.0)) * (0.35 + 1.1 * rib) * 0.3 * glowK();
        // (its closed end is a soft pool of the same light, brightest at its heart)
        float end = step(1.1, deep);
        col += mix(vec3(0.05, 0.16, 0.42), vec3(0.16, 0.34, 0.9), smoothstep(0.75, 1.25, deep)) * deep * deep * mix(0.02 + 0.3 * shimmer, 0.05, end) * (0.5 + 0.5 * rib) * glowK() * 1.6;
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}
