import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, type V3 } from "../kit";

// The Sonata of the Sun's own paint and light.
//
//   gold stone   what the bells, towers and arches are made of: pale gold laid in soft washes, warm where the
//                light falls and violet-blue in the shade, lighter toward the top; the light comes through its
//                edges when the sun stands behind it; and it is drawn over with fine gold line (a course at
//                every storey, an arcade of small arches under each great course, a little sun between) that
//                catches the light as leaf does. No dabs, no patches.
//   beams        shafts of sunlight through the arches and between the bells: soft columns of lit dust, strongest
//                looking up them toward the sun (forward scattering), streaked along their length.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export function makeGoldStone(o: { shade?: V3; amb?: number; key?: number; through?: number; orn?: number; grain?: number; ao?: number; aoH?: number; grad?: [number, number] } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      uShade: { value: new THREE.Color(...(o.shade ?? [0.62, 0.66, 1.0])) },
      uAmbK: { value: o.amb ?? 1 },
      uKeyK: { value: o.key ?? 0.4 },
      uThrough: { value: o.through ?? 1 },
      uOrn: { value: o.orn ?? 1 },
      uGrain: { value: o.grain ?? 1 },
      uAO: { value: new THREE.Vector2(o.ao ?? 0.3, o.aoH ?? 60) },
      uGrad: { value: new THREE.Vector2(...(o.grad ?? [0, 380])) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aCol;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec3 vLocal;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uShade; uniform float uAmbK; uniform float uKeyK; uniform float uThrough; uniform float uOrn; uniform float uGrain; uniform vec2 uAO; uniform vec2 uGrad;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec3 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 dv = vWorld - cameraPosition; float dist = length(dv); vec3 V = -dv / dist;
        float glowA = clamp(vCol.a, 0.0, 1.0);
        float th = abs(n.y) > 0.999 ? 0.0 : atan(n.z, n.x);
        vec3 alb = vCol.rgb;
        // the tooth of the paper, close to; and long soft washes, never a blotch
        float tooth = vnoise(vLocal.xz * 1.7 + vLocal.y * 1.3) * 0.5 + vnoise(vLocal.xy * 4.1 - vLocal.z * 2.9) * 0.5;
        alb *= 1.0 + (tooth - 0.5) * 0.07 * uGrain * (1.0 - smoothstep(30.0, 300.0, dist));
        alb *= 0.93 + 0.14 * fbm(vec2(th * 1.1 + vLocal.x * 0.003, vLocal.y * 0.005));
        float up = smoothstep(uGrad.x, uGrad.y, vLocal.y);
        float w = smoothstep(-0.55, 0.65, dot(n, uKeyDir));
        vec3 amb = uSkyCol * uAmbK * (0.72 + 0.28 * n.y);
        vec3 col = mix(alb * uShade * amb, alb * (amb + uKeyCol * uKeyK), w);
        col *= mix(0.8, 1.16, up) * mix(1.0 - uAO.x, 1.0, smoothstep(-4.0, uAO.y, vLocal.y));
        // the light comes through it: round the edges of a form that stands before the sun, and faintly through its body
        float back = pow(max(dot(-V, uSunDir), 0.0), 2.5);
        float thin = pow(1.0 - abs(dot(n, V)), 1.6);
        col += uGlow * alb * (thin * (0.22 + 1.7 * back) + 0.12 * back) * uThrough * (1.0 - glowA);
        if (uOrn > 0.0 && abs(n.y) < 0.8) {
          float y = vLocal.y; float fy = fwidth(y);
          float curved = smoothstep(0.0004, 0.002, fwidth(th) / max(fy, 1e-5));
          // a fine course every storey, a great one every five
          float c1 = abs(fract(y / 12.0 + 0.5) - 0.5) * 12.0;
          float l1 = (1.0 - smoothstep(0.08 + fy * 0.6, 0.2 + fy * 1.4, c1)) * (1.0 - smoothstep(1.2, 4.0, fy));
          float c2 = abs(fract(y / 60.0 + 0.5) - 0.5) * 60.0;
          float l2 = (1.0 - smoothstep(0.25 + fy * 0.6, 0.55 + fy * 1.4, c2)) * (1.0 - smoothstep(4.0, 12.0, fy));
          // under each great course an arcade of small arches, and midway a row of little suns
          float by = fract(y / 60.0) * 60.0; float bi = floor(y / 60.0);
          float cell = th / 6.2832 * 40.0; float cx = (fract(cell) - 0.5) * 9.0; float ci = floor(cell);
          float fa = max(fy, fwidth(cx));
          vec2 q = vec2(cx, by - 46.0);
          float d = q.y > 5.2 ? abs(length(vec2(q.x, q.y - 5.2)) - 3.0) : abs(abs(q.x) - 3.0);
          float arch = (1.0 - smoothstep(0.1 + fa * 0.6, 0.26 + fa * 1.4, d)) * step(0.0, q.y) * step(q.y, 8.4) * (1.0 - smoothstep(0.8, 2.6, fa)) * curved;
          float sr = length(vec2(cx, by - 23.0));
          float sun = ((1.0 - smoothstep(0.6, 0.9 + fa, sr)) + (1.0 - smoothstep(0.08 + fa * 0.5, 0.22 + fa, abs(sr - 1.8)))) * step(0.5, fract((ci + bi) * 0.5)) * (1.0 - smoothstep(0.6, 2.0, fa)) * curved;
          float orn = clamp(l1 * 0.3 + l2 * 0.75 + arch * 0.9 + sun * 0.9, 0.0, 1.0) * uOrn * (1.0 - glowA);
          // leaf: it takes the sky's gold, and flashes where it mirrors the light
          vec3 R = reflect(-V, n);
          float sp = max(dot(R, uKeyDir), 0.0);
          vec3 leaf = vec3(1.0, 0.78, 0.36) * (uSkyCol * 0.5 + uGlow * (0.55 + 0.6 * back) + uKeyCol * (pow(sp, 20.0) * 3.0 + pow(sp, 3.0) * 0.5));
          col = mix(col, leaf, orn * 0.85);
        }
        col = applyAir(col, vWorld);
        col += vCol.rgb * max(vCol.a, 0.0) * glowK() * (1.0 + uPulse * 0.6) * (1.0 - 0.6 * airAmt(vWorld)) * exp(-dist * uMist * 1.5);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- beams ----------
// from: where the light comes through (the middle of an opening). r: its half-width there. len: how far it runs.
export type Beam = { from: V3; r: number; len: number; k?: number };
export function beamGeometry(list: Beam[], sunDir: THREE.Vector3) {
  const parts: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir.clone().negate().normalize());
  list.forEach((b, i) => {
    const g = new THREE.CylinderGeometry(b.r, b.r * 1.45, b.len, 16, 1, true);
    g.translate(0, -b.len / 2, 0);
    g.applyQuaternion(q);
    g.translate(...b.from);
    const n = g.attributes.position.count;
    const meta = new Float32Array(n * 2);
    for (let j = 0; j < n; j++) meta.set([b.k ?? 1, (i * 0.618) % 1], j * 2);
    g.setAttribute("aMeta", new THREE.BufferAttribute(meta, 2));
    parts.push(g);
  });
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  return g;
}
export function makeBeamMaterial(tint: V3 = [1, 0.84, 0.5]) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) } },
    vertexShader: /* glsl */ `
      attribute vec2 aMeta;
      varying vec3 vWorld; varying vec3 vN; varying vec2 vMeta; varying vec2 vUv;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vMeta = aMeta; vUv = uv; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying vec3 vWorld; varying vec3 vN; varying vec2 vMeta; varying vec2 vUv;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 dv = vWorld - cameraPosition; float dist = length(dv); vec3 V = -dv / dist;
        // a column of lit dust has no surface: full through its middle as seen, nothing at its edges
        float face = pow(abs(dot(normalize(vN), V)), 2.2);
        float h = vUv.y;
        float fade = smoothstep(0.0, 0.3, h) * smoothstep(1.0, 0.94, h);
        float streak = vnoise(vec2(vUv.x * 22.0 + vMeta.y * 50.0, h * 1.6 - uTime * 0.02)) * 0.6 + vnoise(vec2(vUv.x * 57.0, h * 4.0 + uTime * 0.015)) * 0.4;
        // dust scatters light forward: a shaft is brightest looking up it toward the sun (Henyey-Greenstein, g = 0.55)
        float mu = dot(-V, uSunDir);
        float hg = 0.6975 / pow(max(1.3025 - 1.1 * mu, 1e-3), 1.5);
        float a = face * fade * (0.35 + 0.65 * streak) * vMeta.x * (0.12 + 0.22 * hg) * smoothstep(8.0, 80.0, dist) * (1.0 - airAmt(vWorld) * 0.5) * exp(-dist * uMist * 1.5);
        gl_FragColor = vec4(uTint * mix(vec3(1.0), uGlow, 0.5) * a * 0.3 * (1.0 + uPulse * 0.3), 1.0);
        ${END}
      }`,
  });
}
