import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, type V3 } from "../kit";

// Soft forms and drawn light, shared by the Sonata of the Stars, Rex and the Sonata of the Sun.
//
//   soft forms   thousands of small rounded things drawn in one call: the lobes of painted clouds, round trees,
//                orbs. Each is lit on one side in the light's colour and shaded on the other in a cooler one,
//                laid in with soft dabs, and catches a line of light round its edge when the light is behind it.
//   ribbons      long bands that cross the air (rivers of stars, waves, halos), with metres along and -1..1 across
//   lines        threads of light that always face the eye and never go thinner than a pixel; a figure made of
//                them can draw itself (constellations)
//   ray discs    a pale disc in a ring and a wide fan of fine straight rays, standing in the world

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------- soft forms ----------
export type Soft = { p: V3; r: number; col: V3; sy?: number; seed?: number; glow?: number };
export function softGeometry(list: Soft[], detail = 1) {
  const base = new THREE.IcosahedronGeometry(1, detail);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", base.attributes.position);
  const pos = new Float32Array(list.length * 4);
  const col = new Float32Array(list.length * 4);
  const par = new Float32Array(list.length * 2);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let maxR = 1;
  list.forEach((s, i) => {
    pos.set([s.p[0], s.p[1], s.p[2], s.r], i * 4);
    col.set([s.col[0], s.col[1], s.col[2], s.glow ?? 0], i * 4);
    par.set([s.sy ?? 1, s.seed ?? (i * 0.618) % 1], i * 2);
    box.expandByPoint(v.set(...s.p));
    maxR = Math.max(maxR, s.r);
  });
  g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 4));
  g.setAttribute("aPar", new THREE.InstancedBufferAttribute(par, 2));
  g.instanceCount = list.length;
  g.boundingSphere = list.length ? box.getBoundingSphere(new THREE.Sphere()) : new THREE.Sphere();
  g.boundingSphere.radius += maxR * 1.5 + 10;
  return g;
}
// shade: the colour the unlit side is turned toward. under: the colour of the underside. rim: light caught round
// the edge. flat: how far the underside is pressed flat (clouds). self: light of its own. fade: [from, to] metres
// over which it melts wholly into the sky behind it.
// soft: how far its edges melt into the sky behind (cloud).
export function makeSoftMaterial(o: { shade?: V3; under?: V3; rim?: number; dab?: number; amb?: number; key?: number; flat?: number; sway?: number; self?: number; air?: number; fade?: [number, number]; ao?: number; soft?: number } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      uShade: { value: new THREE.Color(...(o.shade ?? [0.6, 0.62, 0.9])) },
      uUnder: { value: new THREE.Color(...(o.under ?? [0.55, 0.55, 0.75])) },
      uRim: { value: o.rim ?? 1 },
      uDab: { value: o.dab ?? 1 },
      uAmb: { value: o.amb ?? 0.9 },
      uKey: { value: o.key ?? 0.6 },
      uFlat: { value: o.flat ?? 1 },
      uSway: { value: o.sway ?? 0 },
      uSelf: { value: o.self ?? 0 },
      uAirK: { value: o.air ?? 1 },
      uFade: { value: new THREE.Vector2(...(o.fade ?? [1e6, 2e6])) },
      uAO: { value: o.ao ?? 0 },
      uSoft: { value: o.soft ?? 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aPos; attribute vec4 aCol; attribute vec2 aPar;
      uniform float uTime; uniform float uFlat; uniform float uSway;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec3 vO; varying float vSeed;
      void main(){
        vec3 o = position;
        vO = o;
        vN = normalize(vec3(o.x, o.y * 0.85 + 0.15, o.z));
        if (o.y < 0.0) o.y *= uFlat;
        o.y *= aPar.x;
        float ph = aPar.y * 40.0;
        vec3 c = aPos.xyz + vec3(sin(uTime * 0.05 + ph), sin(uTime * 0.04 + ph * 1.7) * 0.4, cos(uTime * 0.045 + ph * 1.3)) * uSway;
        vec4 wp = modelMatrix * vec4(c + o * aPos.w, 1.0);
        vWorld = wp.xyz; vCol = aCol; vSeed = aPar.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uShade; uniform vec3 uUnder; uniform float uRim; uniform float uDab; uniform float uAmb; uniform float uKey;
      uniform float uSelf; uniform float uAirK; uniform vec2 uFade; uniform float uAO; uniform float uSoft;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec3 vO; varying float vSeed;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 dv = vWorld - cameraPosition;
        float dist = length(dv);
        vec3 V = -dv / dist;
        // dabs of the brush: they move the edge between light and shade, and vary the paint a little
        float dab = vnoise(vO.xy * 2.6 + vSeed * 31.0 + vO.z * 1.9) * 0.6 + vnoise(vO.zy * 6.0 + vSeed * 7.0) * 0.4;
        float w = smoothstep(-0.45, 0.7, dot(n, uKeyDir) + (dab - 0.5) * 0.7 * uDab);
        vec3 alb = vCol.rgb * (1.0 + (dab - 0.5) * 0.24 * uDab);
        vec3 amb = uSkyCol * uAmb * (0.75 + 0.25 * n.y);
        vec3 col = mix(alb * uShade * amb, alb * (amb + uKeyCol * uKey), w);
        col = mix(col, alb * uUnder * amb, smoothstep(0.05, -0.85, n.y) * 0.75);
        col *= 1.0 - uAO * smoothstep(0.2, -0.9, vO.y);
        // a line of light round the edge, strongest when the light stands behind the form
        vec3 Ld = uSunDir.y > 0.0 ? uSunDir : uKeyDir;
        float fr = pow(1.0 - max(dot(n, V), 0.0), 2.4);
        float back = pow(max(dot(-V, Ld), 0.0), 5.0);
        col += mix(uGlow, uKeyCol, 0.4) * fr * (0.12 + 1.5 * back) * uRim * (0.4 + 0.6 * w);
        vec3 sky = airCol(-V);
        col = mix(col, sky, airAmt(vWorld) * uAirK);
        col = mix(col, sky + (col - sky) * 0.25, pow(1.0 - max(dot(n, V), 0.0), 1.6) * uSoft);
        col += vCol.rgb * (uSelf + vCol.a) * glowK() * (1.0 - 0.5 * airAmt(vWorld));
        col = mix(col, sky, smoothstep(uFade.x, uFade.y, dist));
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}
// A painted cloud: a row of round lobes on a flat base and a few smaller ones heaped on top of them.
// `long`: drawn out into a band of many small lobes, as he drew cloud in the Sonatas
export function cumulus(out: Soft[], p: V3, s: number, col: V3, r: () => number, o: { lobes?: number; yaw?: number; glow?: number; long?: number; sy?: number } = {}) {
  const long = o.long ?? 1;
  const n = o.lobes ?? Math.round((5 + Math.floor(r() * 4)) * Math.max(1, long * 0.9));
  const yaw = o.yaw ?? r() * Math.PI;
  const seed = r();
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const low = Math.max(2, Math.ceil(n * 0.6));
  for (let i = 0; i < n; i++) {
    const top = i >= low;
    const u = (top ? (r() - 0.5) * 1.2 : (i / (low - 1) - 0.5) * 2.2 + (r() - 0.5) * 0.3) * long;
    const w = (r() - 0.5) * 0.7;
    const rad = s * (top ? 0.42 + r() * 0.22 : 0.58 + r() * 0.3) * (1 - (0.22 * Math.abs(u)) / long);
    const y = top ? s * (0.36 + r() * 0.24) : s * (r() - 0.5) * 0.12;
    const k = 0.92 + r() * 0.16;
    out.push({ p: [p[0] + (c * u + sn * w) * s, p[1] + y, p[2] + (-sn * u + c * w) * s], r: rad, col: [col[0] * k, col[1] * k, col[2] * k], seed, sy: o.sy ?? 0.82, glow: o.glow });
  }
}

// ---------- ribbons ----------
// uv.x: metres along, uv.y: -1..1 across. aT: 0..1 along.
export function ribbonGeometry(pts: THREE.Vector3[], width: number | ((t: number) => number), o: { roll?: (t: number) => number; seg?: number; closed?: boolean; up?: THREE.Vector3 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, !!o.closed, "centripetal");
  const n = o.seg ?? pts.length * 10;
  const pos: number[] = [];
  const uv: number[] = [];
  const at: number[] = [];
  const idx: number[] = [];
  const up = o.up ?? new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  let run = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    curve.getPoint(t, p);
    curve.getTangent(t, tan);
    side.crossVectors(tan, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    if (o.roll) side.applyAxisAngle(tan, o.roll(t));
    const w = (typeof width === "number" ? width : width(t)) / 2;
    if (i > 0) run += p.distanceTo(prev);
    prev.copy(p);
    pos.push(p.x - side.x * w, p.y - side.y * w, p.z - side.z * w, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
    uv.push(run, -1, run, 1);
    at.push(t, t);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(at, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geo: g, len: run };
}

// ---------- lines of light ----------
// fig / t0 / t1: the figure a stroke belongs to and when in that figure's drawing it is laid (0..1)
export type Seg = { a: V3; b: V3; w?: number; col?: V3; fig?: number; t0?: number; t1?: number };
export function linesGeometry(list: Seg[]) {
  const n = list.length;
  const A = new Float32Array(n * 12);
  const B = new Float32Array(n * 12);
  const U = new Float32Array(n * 8);
  const D = new Float32Array(n * 16);
  const C = new Float32Array(n * 12);
  const idx: number[] = [];
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  list.forEach((s, i) => {
    const col = s.col ?? [1, 0.86, 0.55];
    for (let j = 0; j < 4; j++) {
      A.set(s.a, i * 12 + j * 3);
      B.set(s.b, i * 12 + j * 3);
      U.set([j % 2 ? 1 : -1, j < 2 ? 0 : 1], i * 8 + j * 2);
      D.set([s.fig ?? 0, s.t0 ?? 0, s.t1 ?? 0, s.w ?? 0.6], i * 16 + j * 4);
      C.set(col, i * 12 + j * 3);
    }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
    box.expandByPoint(v.set(...s.a));
    box.expandByPoint(v.set(...s.b));
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(A, 3));
  g.setAttribute("aB", new THREE.BufferAttribute(B, 3));
  g.setAttribute("aUv", new THREE.BufferAttribute(U, 2));
  g.setAttribute("aDraw", new THREE.BufferAttribute(D, 4));
  g.setAttribute("aCol", new THREE.BufferAttribute(C, 3));
  g.setIndex(idx);
  g.boundingSphere = n ? box.getBoundingSphere(new THREE.Sphere()) : new THREE.Sphere();
  return g;
}
// figs: how many figures draw themselves (their progress is uProg[i], 0..1, written by whoever owns them)
export function makeLineMaterial(o: { figs?: number; gain?: number; minW?: number; far?: [number, number]; flow?: number } = {}) {
  const figs = Math.max(1, o.figs ?? 0);
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      uProg: { value: new Float32Array(figs).fill(o.figs ? 0 : 1) },
      uGain: { value: o.gain ?? 1 },
      uMinW: { value: o.minW ?? 0.0014 },
      uFar: { value: new THREE.Vector2(...(o.far ?? [1400, 2600])) },
      uFlow: { value: o.flow ?? 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aB; attribute vec2 aUv; attribute vec4 aDraw; attribute vec3 aCol;
      uniform float uProg[${figs}]; uniform float uMinW;
      varying vec2 vUv; varying vec3 vCol; varying float vK; varying vec3 vWorld; varying float vLen;
      void main(){
        float pr = uProg[int(aDraw.x + 0.5)];
        float k = clamp((pr - aDraw.y) / max(aDraw.z - aDraw.y, 1e-4), 0.0, 1.0);
        if (aDraw.z <= 0.0) k = 1.0;
        vec3 B = mix(position, aB, k);
        vec4 va = modelViewMatrix * vec4(position, 1.0);
        vec4 vb = modelViewMatrix * vec4(B, 1.0);
        vec4 v = mix(va, vb, aUv.y);
        vec3 dir = vb.xyz - va.xyz;
        vec3 perp = cross(dir, v.xyz);
        float pl = length(perp);
        perp = pl > 1e-5 ? perp / pl : vec3(0.0);
        float w = max(aDraw.w, -v.z * uMinW) * 0.5 * step(0.001, k);
        v.xyz += perp * aUv.x * w;
        vUv = aUv; vCol = aCol; vK = k; vLen = length(aB - position) * k;
        vWorld = (modelMatrix * vec4(mix(position, B, aUv.y), 1.0)).xyz;
        gl_Position = projectionMatrix * v;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGain; uniform vec2 uFar; uniform float uFlow;
      varying vec2 vUv; varying vec3 vCol; varying float vK; varying vec3 vWorld; varying float vLen;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float a = exp(-vUv.x * vUv.x * 4.0) * (1.0 - vUv.x * vUv.x);
        // the hand that draws it: a bright point where the line is still being laid
        float head = vK < 0.999 ? exp(-(1.0 - vUv.y) * vLen * 0.25) * 2.5 : 0.0;
        // light running along a thread
        float run = uFlow > 0.0 ? 0.7 + 0.5 * sin(vUv.y * vLen * 0.05 - uTime * uFlow + vWorld.x * 0.05) : 1.0;
        float dist = length(vWorld - cameraPosition);
        float fade = smoothstep(3.0, 30.0, dist) * (1.0 - smoothstep(uFar.x, uFar.y, dist)) * (1.0 - airAmt(vWorld) * 0.75) * exp(-dist * uMist * 1.5);
        gl_FragColor = vec4(vCol * a * (1.0 + head) * run * fade * uGain * glowK() * (1.0 + uPulse * 0.5), 1.0);
        ${END}
      }`,
  });
}

// ---------- a disc of light in its rays ----------
// Drawn on a plane of half-size 1 (scale the mesh): a pale disc, a ring round it and a wide fan of fine rays,
// long and short, each with its own brightness, turning very slowly. `near`: it thins away as the eye comes to it.
export function makeRayDiscMaterial(o: { col?: V3; hot?: V3; rays?: number; gain?: number; disc?: number; near?: [number, number] } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      uCol: { value: new THREE.Color(...(o.col ?? [1, 0.8, 0.42])) },
      uHot: { value: new THREE.Color(...(o.hot ?? [1, 0.97, 0.88])) },
      uRays: { value: o.rays ?? 96 },
      uGain: { value: o.gain ?? 1 },
      uDisc: { value: o.disc ?? 0.2 },
      uNear: { value: new THREE.Vector2(...(o.near ?? [20, 120])) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld;
      void main(){ vUv = position.xy; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCol; uniform vec3 uHot; uniform float uRays; uniform float uGain; uniform float uDisc; uniform vec2 uNear;
      varying vec2 vUv; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float ang = atan(vUv.y, vUv.x) + uTime * 0.006;
        float cell = ang / 6.2832 * uRays;
        float id = floor(cell);
        float lat = abs(fract(cell) - 0.5);
        float h1 = hash12(vec2(id, 3.0)); float h2 = hash12(vec2(id, 11.0));
        float reach = mix(0.5, 0.98, h1 * h1);
        float ray = (1.0 - smoothstep(0.1, 0.32, lat)) * smoothstep(uDisc * 1.25, uDisc * 1.5, r) * (1.0 - smoothstep(reach * 0.55, reach, r)) * (0.35 + 0.65 * h2);
        ray *= 0.75 + 0.25 * sin(r * 40.0 - uTime * 1.3 + id * 2.1);
        float disc = 1.0 - smoothstep(uDisc * 0.96, uDisc, r);
        float limb = 0.8 + 0.2 * sqrt(max(0.0, 1.0 - (r / uDisc) * (r / uDisc)));
        float ring = smoothstep(0.012, 0.003, abs(r - uDisc * 1.2));
        float glow = exp(-r * r * 9.0) * 0.55 + exp(-r * 3.2) * 0.18;
        float edge = 1.0 - smoothstep(0.75, 1.0, r);
        vec3 col = uHot * disc * limb * 1.5 + mix(uCol, uHot, 0.5) * ring * 1.6 + uCol * ray * 0.9 + uCol * glow;
        float dist = length(vWorld - cameraPosition);
        float fade = smoothstep(uNear.x, uNear.y, dist) * (1.0 - airAmt(vWorld) * 0.6) * exp(-dist * uMist * 1.5);
        gl_FragColor = vec4(col * edge * fade * uGain * (1.0 + uPulse * 0.4), 1.0);
        ${END}
      }`,
  });
}

// ---------- painted cloud ----------
// Cloud as he painted it, and as the Trail of Angels film builds it: rounded banks heaped on a flat base, gold on
// the side of the light, violet in their shadowed undersides, a line of light round the edge when the sun is
// behind, soft and a little torn at the silhouette. Each cloud is one quad that faces the eye; its body is modelled
// in the shader (seven round lobes joined into one soft form with a real normal, so it is lit like a solid thing),
// its edge eroded with noise. Never a cluster of separate balls.
export type PCloud = { p: V3; w: number; seed?: number; k?: number };
export function paintedCloudGeometry(list: PCloud[], from: V3 = [0, 0, 0]) {
  // far ones first, so the near are laid over them
  const d = (c: PCloud) => Math.hypot(c.p[0] - from[0], c.p[1] - from[1], c.p[2] - from[2]);
  const sorted = [...list].sort((a, b) => d(b) - d(a));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const pos = new Float32Array(sorted.length * 4);
  const par = new Float32Array(sorted.length * 2);
  sorted.forEach((c, i) => {
    pos.set([c.p[0], c.p[1], c.p[2], c.w], i * 4);
    par.set([c.seed ?? (i * 0.618) % 1, c.k ?? 1], i * 2);
  });
  g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute("aPar", new THREE.InstancedBufferAttribute(par, 2));
  g.instanceCount = sorted.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
// lit / shade / under: the paint on its lit side, its shaded side and its underside (each is lit by the world's own
// sky and light). rim: the line of light round it. self: light of its own (a night cloud). fade: metres over which
// it thins away into the distance. near: metres over which it thins as the eye comes up to it.
export function makeCloudPaint(o: { lit: V3; shade: V3; under: V3; rim?: number; self?: number; amb?: number; key?: number; air?: number; fade?: [number, number]; near?: [number, number] }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      uLit: { value: new THREE.Color(...o.lit) },
      uShadeC: { value: new THREE.Color(...o.shade) },
      uUnder: { value: new THREE.Color(...o.under) },
      uRim: { value: o.rim ?? 1 },
      uSelf: { value: o.self ?? 0 },
      uAmb: { value: o.amb ?? 1 },
      uKey: { value: o.key ?? 0.5 },
      uAirK: { value: o.air ?? 0.6 },
      uFade: { value: new THREE.Vector2(...(o.fade ?? [2000, 2900])) },
      uNear: { value: new THREE.Vector2(...(o.near ?? [60, 260])) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aPos; attribute vec2 aPar;
      uniform float uTime; uniform vec3 uSunDir; uniform vec3 uKeyDir; uniform vec2 uNear; uniform vec2 uFade;
      varying vec2 vUv; varying vec3 vL; varying vec2 vSunS; varying float vBack; varying float vSeed; varying vec3 vWorld; varying float vA;
      void main(){
        vSeed = aPar.x;
        vec3 c = aPos.xyz + vec3(sin(uTime * 0.012 + vSeed * 40.0), 0.0, cos(uTime * 0.01 + vSeed * 23.0)) * aPos.w * 0.05;
        vec4 wc = modelMatrix * vec4(c, 1.0);
        vec4 mv = viewMatrix * wc;
        float dist = length(mv.xyz);
        vec3 dir = mv.xyz / dist;
        mv.xy += position.xy * vec2(aPos.w, aPos.w * 0.6);
        vUv = position.xy; vWorld = wc.xyz;
        vL = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
        vec3 sv = (viewMatrix * vec4(uSunDir.y > 0.0 ? uSunDir : uKeyDir, 0.0)).xyz;
        vSunS = normalize(sv.xy + vec2(1e-4));
        vBack = pow(max(dot(dir, sv), 0.0), 4.0);
        vA = aPar.y * smoothstep(uNear.x, uNear.y, dist) * (1.0 - smoothstep(uFade.x, uFade.y, dist));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLit; uniform vec3 uShadeC; uniform vec3 uUnder; uniform float uRim; uniform float uSelf; uniform float uAmb; uniform float uKey; uniform float uAirK;
      varying vec2 vUv; varying vec3 vL; varying vec2 vSunS; varying float vBack; varying float vSeed; varying vec3 vWorld; varying float vA;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        if (vA < 0.004) discard;
        vec2 p = vUv * vec2(1.0, 0.6);
        float n1 = vnoise(p * 3.2 + vSeed * 17.0); float n2 = vnoise(p * 3.2 + vSeed * 29.0 + 5.0);
        p += (vec2(n1, n2) - 0.5) * 0.1;
        float H = 0.0; vec3 N = vec3(0.0, 0.0, 0.02);
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          float h1 = hash12(vec2(vSeed * 91.0 + fi, 1.7)); float h2 = hash12(vec2(vSeed * 57.0 + fi * 3.1, 9.2));
          bool top = i >= 4;
          vec2 c = top ? vec2((h1 - 0.5) * 0.95, 0.1 + 0.14 * h2) : vec2(-0.6 + fi * 0.4 + (h1 - 0.5) * 0.16, -0.1 + 0.07 * h2);
          float r = top ? 0.2 + 0.11 * h1 : 0.27 + 0.1 * h2;
          vec2 d = p - c; float q = 1.0 - dot(d, d) / (r * r);
          if (q > 0.0) { float sq = sqrt(q); float h = sq * r; H = max(H, h); N += vec3(d / r, sq) * h * h * h; }
        }
        // billows on the form, and its torn edge
        float bil = fbm(p * 5.0 + vSeed * 40.0 + uTime * 0.004);
        // (the tearing only eats into the form: outside it there is nothing)
        float e = H + ((bil - 0.5) * 0.15 + (vnoise(p * 19.0 + vSeed * 9.0) - 0.5) * 0.035) * smoothstep(0.0, 0.06, H);
        float base = smoothstep(-0.27, -0.18, p.y + (n1 - 0.5) * 0.05);
        float a = smoothstep(0.0, 0.1, e) * base;
        if (a < 0.004) discard;
        vec3 n = normalize(N + vec3((n1 - 0.5), (n2 - 0.5), 0.0) * 0.5 * H);
        float w = smoothstep(-0.35, 0.7, dot(n, vL) + (bil - 0.5) * 0.5);
        vec3 amb = uSkyCol * uAmb;
        vec3 col = mix(uShadeC * amb, uLit * (amb + uKeyCol * uKey), w);
        // its underside, in shadow, and the flat foot of it
        float und = max(smoothstep(0.15, -0.75, n.y), smoothstep(-0.02, -0.22, p.y) * 0.8);
        col = mix(col, uUnder * amb, und * 0.85);
        // a line of light round it, widest on the side of the sun, and the sun coming through its thin parts
        float thin = 1.0 - smoothstep(0.0, 0.16, e);
        float side = 0.5 + 0.5 * dot(normalize(p + vec2(0.0, 0.05)), vSunS);
        vec3 glowC = mix(uGlow, uKeyCol, 0.35);
        col += glowC * thin * (0.1 + 0.5 * side + 2.2 * vBack) * uRim;
        col += glowC * vBack * (1.0 - smoothstep(0.0, 0.3, H)) * 0.5 * uRim;
        vec3 V = normalize(cameraPosition - vWorld);
        col = mix(col, airCol(-V), airAmt(vWorld) * uAirK);
        col += uLit * uSelf * glowK() * (0.5 + 0.5 * w);
        gl_FragColor = vec4(col, a * vA);
        ${END}
      }`,
  });
}
