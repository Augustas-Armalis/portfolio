import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, type V3 } from "../kit";
import { heightGLSL, type Terrain } from "../voyage";
import { SUN_ROAD_GLSL } from "./shape";

// What moves on the plain of the Sonata of the Sun, and what happens as the plane crosses it.
//
//   suns      his drawn suns (disc, ring, straight rays), each asleep as a faint ring until the plane's coming
//             kindles it: the rays run out, it flares once and then burns steadily, its rays slowly turning
//   walkers   pilgrims on the road, in small companies, each carrying a little sun on a staff; they really walk
//   banners   long pennants on the towers and the aqueducts, streaming in the wind
//   bells     bronze bells hung in the arches, which begin to swing as the plane comes near
//   skeins    flocks that cross the whole sky in a line when their moment comes
// One uniform block drives them all: SUN_LIFE_U.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export const SUN_LIFE_U = {
  uFront: { value: 1e5 }, // the furthest north the plane has come (world's own z; it flies toward -z)
  uSkein: { value: new THREE.Vector4(-1, -1, -1, -1) }, // seconds since each skein was let go (-1: not yet)
};

// ---------- suns that kindle ----------
// trig: the plane's z at which it kindles (1e5: it burns from the first)
export type KSun = { p: V3; size: number; col: V3; k?: number; trig?: number };
const QUAD = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
export function sunsGeometry(list: KSun[]) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(QUAD, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const pos = new Float32Array(list.length * 4);
  const col = new Float32Array(list.length * 4);
  const trig = new Float32Array(list.length);
  list.forEach((h, i) => {
    pos.set([...h.p, h.size], i * 4);
    col.set([...h.col, h.k ?? 1], i * 4);
    trig[i] = h.trig ?? 1e5;
  });
  g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 4));
  g.setAttribute("aTrig", new THREE.InstancedBufferAttribute(trig, 1));
  g.instanceCount = list.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
export function makeSunsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, ...SUN_LIFE_U },
    vertexShader: /* glsl */ `
      attribute vec4 aPos; attribute vec4 aCol; attribute float aTrig;
      uniform float uTime; uniform float uMist; uniform float uFront;
      varying vec2 vUv; varying vec4 vCol; varying float vFade; varying float vSeed; varying float vLit;
      void main(){
        vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
        float d = -mv.z;
        vSeed = fract(aPos.x * 0.137 + aPos.z * 0.291 + aPos.y * 0.071);
        // it kindles over a few seconds of the plane's flight, and swells a little as it does
        vLit = clamp((aTrig - uFront) / 90.0, 0.0, 1.0);
        float flare = vLit * (1.0 - vLit) * 4.0;
        float breathe = 1.0 + 0.06 * sin(uTime * (0.6 + vSeed) + vSeed * 40.0) + 0.3 * flare;
        mv.xy += position.xy * aPos.w * breathe;
        vUv = position.xy; vCol = aCol;
        vFade = smoothstep(2.0 + aPos.w * 0.2, 12.0 + aPos.w * 1.1, d) * exp(-d * uMist * 1.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uPulse;
      varying vec2 vUv; varying vec4 vCol; varying float vFade; varying float vSeed; varying float vLit;
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float edge = 1.0 - smoothstep(0.7, 1.0, r);
        float flare = vLit * (1.0 - vLit) * 4.0;
        // the rays turn, each sun at its own slow pace and its own way round
        float ang = atan(vUv.y, vUv.x) + vSeed * 6.283 + uTime * 0.07 * (vSeed - 0.5);
        float rays = 8.0 + floor(vSeed * 3.0) * 2.0;
        float cell = ang / 6.2832 * rays;
        float lat = abs(fract(cell) - 0.5) * (6.2832 / rays) * r;
        float longRay = step(0.5, fract(floor(cell) * 0.5));
        // (they run out from the ring as it kindles)
        float reach = mix(0.58, 0.95, longRay) * mix(0.3, 1.0, smoothstep(0.0, 0.8, vLit));
        float ray = (1.0 - smoothstep(0.006, 0.014, lat)) * smoothstep(0.21, 0.25, r) * (1.0 - smoothstep(reach - 0.1, reach, r));
        // light runs out along them
        ray *= 0.8 + 0.2 * sin(r * 30.0 - uTime * 1.6 + vSeed * 20.0);
        float ring = smoothstep(0.016, 0.004, abs(r - 0.165));
        float disc = (1.0 - smoothstep(0.1, 0.115, r));
        float glow = exp(-r * r * 8.0) * 0.12 * edge + exp(-r * 3.2) * 0.05 * edge;
        float asleep = ring * 0.34 + disc * 0.08;
        float awake = disc * 0.85 + ring * 0.95 + ray * 0.85 + glow;
        float a = mix(asleep, awake, vLit) + flare * (exp(-r * r * 5.0) * 0.5 + ray * 0.6);
        vec3 c = mix(vCol.rgb, vec3(1.0, 0.93, 0.7), disc * 0.5 * vLit + flare * 0.3) * a;
        gl_FragColor = vec4(c * vCol.a * vFade * (1.0 + uPulse * 0.5), 1.0);
        ${END}
      }`,
  });
}

// ---------- pilgrims on the road ----------
// One small robed figure with a staff and a little sun at its head; each instance is carried along the road in
// the vertex shader (the same road the ground paints), stepping, and comes round again at the far end.
function figureGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const tint = (g: THREE.BufferGeometry, part: number) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute("uv");
    n.computeVertexNormals();
    n.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count).fill(part), 1));
    parts.push(n);
  };
  // the robe: a long bell of cloth, the shoulders, the head under a hood
  const robe = new THREE.LatheGeometry(
    [
      [0.34, 0],
      [0.3, 0.12],
      [0.24, 0.7],
      [0.21, 1.15],
      [0.25, 1.36],
      [0.15, 1.5],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    7,
  );
  tint(robe, 0);
  const head = new THREE.IcosahedronGeometry(0.135, 0);
  head.translate(0, 1.62, 0.02);
  tint(head, 1);
  const staff = new THREE.CylinderGeometry(0.018, 0.022, 2.1, 4);
  staff.translate(0.3, 1.05, 0.12);
  tint(staff, 2);
  const lamp = new THREE.OctahedronGeometry(0.1, 0);
  lamp.translate(0.3, 2.2, 0.12);
  tint(lamp, 3);
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}
export type Walker = { z: number; side: number; speed: number; seed: number; size?: number };
export function walkersGeometry(list: Walker[]) {
  const base = figureGeometry();
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", base.attributes.position);
  g.setAttribute("normal", base.attributes.normal);
  g.setAttribute("aPart", base.attributes.aPart);
  const w = new Float32Array(list.length * 4);
  const s = new Float32Array(list.length);
  list.forEach((p, i) => {
    w.set([p.z, p.side, p.speed, p.seed], i * 4);
    s[i] = p.size ?? 1;
  });
  g.setAttribute("aW", new THREE.InstancedBufferAttribute(w, 4));
  g.setAttribute("aSize", new THREE.InstancedBufferAttribute(s, 1));
  g.instanceCount = list.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
export function makeWalkerMaterial(terrain: Terrain, span: [number, number]) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aW; attribute float aSize; attribute float aPart;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying float vPart; varying float vSeed; varying float vY;
      ${heightGLSL(terrain)}
      ${SUN_ROAD_GLSL}
      void main(){
        float z0 = ${span[0].toFixed(1)}; float z1 = ${span[1].toFixed(1)};
        // northward, toward the bells, and round again
        float z = z1 - mod(z1 - aW.x + uTime * aW.z, z1 - z0);
        float x = sunRoadX(z) + aW.y;
        float dxdz = (sunRoadX(z - 1.0) - sunRoadX(z + 1.0)) * 0.5;
        vec2 fwd = normalize(vec2(dxdz, -1.0));
        vec2 side = vec2(-fwd.y, fwd.x);
        // a step is two beats: the body rises on each, and leans a little side to side
        float ph = uTime * (aW.z * 2.6) + aW.w * 40.0;
        vec3 p = position * aSize;
        p.y += abs(sin(ph)) * 0.045 * step(aPart, 1.5);
        p.x += sin(ph) * 0.03 * p.y;
        // the staff is set down every other step
        if (aPart > 1.5) p.z += sin(ph) * 0.1 * (2.0 - p.y);
        vec3 w = vec3(x, terrainH(vec2(x, z)), z) + vec3(side.x, 0.0, side.y) * p.x + vec3(0.0, p.y, 0.0) + vec3(fwd.x, 0.0, fwd.y) * p.z;
        vec3 n = normalize(vec3(side.x, 0.0, side.y) * normal.x + vec3(0.0, normal.y, 0.0) + vec3(fwd.x, 0.0, fwd.y) * normal.z);
        vec4 wp = modelMatrix * vec4(w, 1.0);
        vWorld = wp.xyz; vN = n; vPart = aPart; vSeed = aW.w; vY = position.y;
        // (they go out at the two ends of the road, never pop)
        float ends = smoothstep(z0, z0 + 40.0, z) * (1.0 - smoothstep(z1 - 40.0, z1, z));
        gl_Position = projectionMatrix * viewMatrix * vec4(mix(wp.xyz - vec3(0.0, 4.0, 0.0), wp.xyz, ends), 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying float vPart; varying float vSeed; varying float vY;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        // robes of chalk white, pale gold, the bells' violet and umber
        vec3 robe = vSeed < 0.3 ? vec3(0.8, 0.76, 0.66) : vSeed < 0.55 ? vec3(0.72, 0.52, 0.2) : vSeed < 0.8 ? vec3(0.3, 0.34, 0.6) : vec3(0.34, 0.22, 0.14);
        vec3 alb = vPart < 0.5 ? robe : vPart < 1.5 ? robe * 0.85 : vec3(0.2, 0.15, 0.1);
        float w = smoothstep(-0.5, 0.7, dot(n, uKeyDir));
        vec3 amb = uSkyCol * (0.7 + 0.3 * n.y);
        vec3 col = mix(alb * vec3(0.8, 0.84, 1.0) * amb, alb * (amb + uKeyCol * 0.5), w);
        // each stands in its own shade at the hem
        col *= mix(0.6, 1.0, smoothstep(0.0, 0.5, vY));
        // a line of the low sun down the side that faces it
        vec3 V = normalize(cameraPosition - vWorld);
        col += uGlow * pow(1.0 - max(dot(n, V), 0.0), 2.4) * pow(max(dot(-V, uSunDir), 0.0), 3.0) * 0.9;
        col = applyAir(col, vWorld);
        if (vPart > 2.5) col += vec3(1.0, 0.78, 0.36) * 2.6 * glowK() * (1.0 - 0.6 * airAmt(vWorld));
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- banners ----------
// A long pennant from a pole's head: p the head of the pole, len and wide in metres, col its cloth.
export type Banner = { p: V3; len: number; wide: number; col: V3; seed?: number };
export function bannersGeometry(list: Banner[]) {
  const seg = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  // a strip tapering to a swallow tail: x along (0..1), y across (-0.5..0.5)
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pos.push(t, 0.5 * (1 - 0.55 * t), 0, t, -0.5 * (1 - 0.55 * t), 0);
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const a = new Float32Array(list.length * 4);
  const b = new Float32Array(list.length * 4);
  const c = new Float32Array(list.length * 3);
  list.forEach((h, i) => {
    a.set([...h.p, h.len], i * 4);
    b.set([h.wide, h.seed ?? (i * 0.618) % 1, 0, 0], i * 4);
    c.set(h.col, i * 3);
  });
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  g.setAttribute("aC", new THREE.InstancedBufferAttribute(c, 3));
  g.instanceCount = list.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
export function makeBannerMaterial(wind: [number, number] = [0.92, 0.38]) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute vec3 aC;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vCol; varying float vT; varying float vWave;
      void main(){
        float t = position.x; float seed = aB.y;
        vec2 wd = normalize(vec2(${wind[0].toFixed(3)}, ${wind[1].toFixed(3)}));
        // the cloth streams down the wind, a wave running along it that grows toward the tail, and it sags a little
        float ph = t * 7.0 - uTime * (2.4 + seed) + seed * 30.0;
        float wave = sin(ph) * 0.5 + sin(ph * 2.3 + 1.0) * 0.2;
        float amp = t * (0.16 + 0.1 * sin(uTime * 0.3 + seed * 9.0));
        vec3 along = vec3(wd.x, 0.0, wd.y);
        vec3 across = vec3(-wd.y, 0.0, wd.x);
        vec3 w = aA.xyz + along * t * aA.w + across * wave * amp * aA.w * 0.5 + vec3(0.0, position.y * aB.x - t * t * aA.w * 0.16 + cos(ph) * amp * aB.x * 0.3, 0.0);
        vec4 wp = modelMatrix * vec4(w, 1.0);
        vWorld = wp.xyz; vCol = aC; vT = t; vWave = wave;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vCol; varying float vT; varying float vWave;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        // folds of light and shade along the cloth; the low sun comes through it
        float fold = 0.5 + 0.5 * vWave;
        vec3 col = vCol * (uSkyCol * (0.62 + 0.3 * fold) + uKeyCol * 0.3 * fold);
        vec3 V = normalize(cameraPosition - vWorld);
        col += vCol * uGlow * pow(max(dot(-V, uSunDir), 0.0), 2.0) * 0.8;
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- bells hung in the arches ----------
// p: where it hangs from. size: its height in metres. axis: the way the arch runs (it swings through the arch).
export type Hung = { p: V3; size: number; axis: [number, number]; seed?: number };
export function hungBellGeometry(list: Hung[]) {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, part: number) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute("uv");
    n.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count).fill(part), 1));
    parts.push(n);
  };
  // hung one unit below its pivot: a yoke rod, the bell (one unit tall), its clapper
  const rod = new THREE.CylinderGeometry(0.035, 0.035, 1, 5);
  rod.translate(0, -0.5, 0);
  add(rod, 0);
  const prof: [number, number][] = [
    [0.02, -1.0],
    [0.16, -1.02],
    [0.26, -1.12],
    [0.3, -1.3],
    [0.33, -1.6],
    [0.42, -1.86],
    [0.52, -2.0],
    [0.5, -2.0],
    [0.4, -1.88],
  ];
  add(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14), 1);
  const clap = new THREE.SphereGeometry(0.09, 6, 5);
  clap.translate(0, -1.96, 0);
  add(clap, 2);
  const base = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", base.attributes.position);
  g.setAttribute("normal", base.attributes.normal);
  g.setAttribute("aPart", base.attributes.aPart);
  const a = new Float32Array(list.length * 4);
  const b = new Float32Array(list.length * 4);
  list.forEach((h, i) => {
    a.set([...h.p, h.size], i * 4);
    b.set([h.axis[0], h.axis[1], h.seed ?? (i * 0.618) % 1, 0], i * 4);
  });
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = list.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
export function makeHungBellMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute float aPart;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying float vPart; varying float vY;
      void main(){
        vec4 pivot = modelMatrix * vec4(aA.xyz, 1.0);
        // asleep it barely stirs; as the plane comes near it is set swinging, the great ones slowly
        float wake = 1.0 - smoothstep(180.0, 620.0, distance(pivot.xyz, cameraPosition));
        float om = 2.6 / sqrt(max(aA.w, 1.0));
        float th = (0.03 + 0.5 * wake) * sin(uTime * om + aB.z * 20.0);
        // (the clapper lags, and so strikes)
        float th2 = aPart > 1.5 ? th - 0.3 * wake * sin(uTime * om + aB.z * 20.0 + 1.1) : th;
        float c = cos(th2); float s = sin(th2);
        vec3 ax = normalize(vec3(aB.x, 0.0, aB.y));
        vec3 sw = vec3(-ax.z, 0.0, ax.x);
        // in the frame (ax, up, sw): rotate about ax
        vec3 p = position * aA.w * 0.5;
        vec3 q = ax * p.x + vec3(0.0, 1.0, 0.0) * (p.y * c - p.z * s) + sw * (p.y * s + p.z * c);
        vec3 n = ax * normal.x + vec3(0.0, 1.0, 0.0) * (normal.y * c - normal.z * s) + sw * (normal.y * s + normal.z * c);
        vec4 wp = modelMatrix * vec4(aA.xyz + q, 1.0);
        vWorld = wp.xyz; vN = normalize(n); vPart = aPart; vY = position.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying float vPart; varying float vY;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        // old gold: dark in its own shade, the sky's colour laid over it, and a flash where it mirrors the sun
        vec3 alb = vPart < 0.5 ? vec3(0.2, 0.17, 0.2) : vec3(0.62, 0.42, 0.14);
        // (bands cast round it at the shoulder and the lip)
        alb *= 1.0 - 0.3 * (smoothstep(0.03, 0.0, abs(vY + 1.3)) + smoothstep(0.03, 0.0, abs(vY + 1.9))) * step(0.5, vPart);
        float w = smoothstep(-0.5, 0.7, dot(n, uKeyDir));
        vec3 col = alb * mix(uSkyCol * vec3(0.7, 0.74, 0.95), uSkyCol + uKeyCol * 0.5, w);
        vec3 R = reflect(-V, n);
        float sp = max(dot(R, uKeyDir), 0.0);
        col += vec3(1.0, 0.8, 0.4) * uKeyCol * (pow(sp, 24.0) * 1.6 + pow(sp, 4.0) * 0.25) * step(0.5, vPart);
        col += uGlow * pow(1.0 - max(dot(n, V), 0.0), 2.4) * pow(max(dot(-V, uSunDir), 0.0), 2.5) * 0.8;
        if (!gl_FrontFacing) col *= 0.45;
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- skeins ----------
// A flock that crosses the sky in a loose line when its moment comes (SUN_LIFE_U.uSkein[which] counts its seconds).
// from: where its leader starts. vel: its flight, metres a second. n birds, each `size` across.
export type Skein = { from: V3; vel: V3; n: number; size: number; which: 0 | 1 | 2 | 3 };
export function skeinGeometry(list: Skein[]) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.35, 0, 0, 0.25, -1, 0, 0.12, 1, 0, 0.12], 3));
  g.setIndex([0, 1, 2, 0, 3, 1]);
  const total = list.reduce((a, s) => a + s.n, 0);
  const a = new Float32Array(total * 4);
  const b = new Float32Array(total * 4);
  const c = new Float32Array(total * 4);
  let i = 0;
  let seed = 7;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (const s of list) {
    const sp = Math.hypot(s.vel[0], s.vel[2]);
    const fx = s.vel[0] / sp;
    const fz = s.vel[2] / sp;
    for (let j = 0; j < s.n; j++) {
      // a ragged V: each bird a little behind and to one side of the one before
      const rank = Math.ceil(j / 2);
      const wing = j % 2 ? 1 : -1;
      const back = rank * s.size * 2.6 + r() * s.size * 2;
      const out = wing * rank * s.size * 1.9 + (r() - 0.5) * s.size * 2;
      a.set([s.from[0] - fx * back - fz * out, s.from[1] + (r() - 0.5) * s.size * 3, s.from[2] - fz * back + fx * out, s.size * (0.8 + r() * 0.4)], i * 4);
      b.set([s.vel[0], s.vel[1], s.vel[2], s.which], i * 4);
      c.set([r(), 4.5 + r() * 2.5, 0, 0], i * 4);
      i++;
    }
  }
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  g.setAttribute("aC", new THREE.InstancedBufferAttribute(c, 4));
  g.instanceCount = total;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}
export function makeSkeinMaterial(tint: V3 = [0.1, 0.1, 0.16]) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U, ...WORLD_U, ...SUN_LIFE_U, uTint: { value: new THREE.Color(...tint) } },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute vec4 aC;
      uniform float uTime; uniform vec4 uSkein;
      varying vec3 vWorld; varying float vSide; varying float vOn;
      void main(){
        int wh = int(aB.w + 0.5);
        float t = wh == 0 ? uSkein.x : wh == 1 ? uSkein.y : wh == 2 ? uSkein.z : uSkein.w;
        vOn = step(0.0, t) * smoothstep(0.0, 3.0, t) * (1.0 - smoothstep(70.0, 90.0, t));
        vec3 c = aA.xyz + aB.xyz * max(t, 0.0);
        c.y += sin(uTime * 0.4 + aC.x * 30.0) * aA.w * 1.5;
        vec3 fwd = normalize(vec3(aB.x, 0.0, aB.z));
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
        float glide = smoothstep(0.5, 0.8, sin(uTime * 0.27 + aC.x * 11.0));
        float beat = mix(sin(uTime * aC.y + aC.x * 17.0), 0.25, glide);
        float s = aA.w;
        vec3 p = position; float tip = abs(p.x);
        vec3 w = c + side * p.x * s + fwd * -p.z * s + vec3(0.0, tip * beat * 0.75 * s, 0.0);
        vWorld = (modelMatrix * vec4(w, 1.0)).xyz; vSide = tip;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying vec3 vWorld; varying float vSide; varying float vOn;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        if (vOn < 0.01) discard;
        vec3 col = uTint * (uSkyCol * 0.6 + 0.08);
        float f = airAmt(vWorld) * 0.7;
        gl_FragColor = vec4(mix(col, airCol(normalize(vWorld - cameraPosition)), f), (1.0 - f * 0.9) * (1.0 - vSide * 0.35) * vOn);
        ${END}
      }`,
  });
}

// ---------- the great sun ----------
// The world's one great sun, as he drew them: a white-gold disc, a drawn ring, straight rays long and short that
// turn slowly and carry pulses of light outward, a corona that never stands still. It hangs far beyond everything
// that is built (the shared GreatSun hangs at 2400 m, which on this plain would put it in front of the far bells),
// so every bell, however distant, stands before it as shade.
export function greatSunMaterial(o: { size?: number; tint?: V3; rays?: number; gain?: number; dist?: number } = {}) {
  const dist = (o.dist ?? 9000).toFixed(1);
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, uSize: { value: o.size ?? 0.8 }, uTint: { value: new THREE.Color(...(o.tint ?? [1, 0.76, 0.32])) }, uRays: { value: o.rays ?? 64 }, uGain: { value: o.gain ?? 1 } },
    vertexShader: /* glsl */ `
      uniform vec3 uSunDir; uniform float uSize;
      varying vec2 vUv;
      void main(){
        vec3 c = cameraPosition + normalize(uSunDir) * ${dist};
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * ${dist} * uSize;
        vUv = position.xy;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint; uniform float uRays; uniform float uGain;
      varying vec2 vUv;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float ang = atan(vUv.y, vUv.x);
        float t = uTime;
        float disc = 1.0 - smoothstep(0.092, 0.1, r);
        float limb = 0.82 + 0.18 * sqrt(max(0.0, 1.0 - (r / 0.1) * (r / 0.1)));
        float ring = smoothstep(0.012, 0.003, abs(r - 0.135)) * (0.8 + 0.2 * sin(t * 0.9));
        // straight rays, long and short by turns, turning slowly, with light running out along them
        float a2 = ang + t * 0.02;
        float cell = a2 / 6.2832 * uRays;
        float lat = abs(fract(cell) - 0.5) * (6.2832 / uRays) * r;
        float id = floor(cell);
        float longRay = step(0.5, fract(id * 0.5));
        float reach = mix(0.46, 0.92, longRay) * (0.94 + 0.06 * sin(t * 0.7 + id * 2.3));
        float width = mix(0.0045, 0.009, longRay) * (1.0 + r);
        float ray = (1.0 - smoothstep(width * 0.4, width, lat)) * smoothstep(0.16, 0.2, r) * (1.0 - smoothstep(reach * 0.75, reach, r));
        ray *= 0.65 + 0.35 * sin(r * 46.0 - t * 2.2 + id * 1.7);
        float cor = fbm(vec2(ang * 3.1831 * 2.0 + 10.0, r * 5.0 - t * 0.12)) * 0.6 + fbm(vec2(ang * 3.1831 * 5.0 - 4.0, r * 9.0 - t * 0.21)) * 0.4;
        float corona = pow(cor, 2.2) * exp(-(r - 0.1) * 9.0) * smoothstep(0.08, 0.11, r) * 1.6;
        float glow = exp(-r * 6.5) * 0.5 + exp(-r * 2.4) * 0.12;
        vec3 hot = vec3(1.0, 0.97, 0.88);
        vec3 col = hot * disc * limb * 7.0 + mix(uTint, hot, 0.4) * ring * 2.4 + uTint * (ray * 1.3 + corona) + uGlow * glow * 1.4;
        float edge = 1.0 - smoothstep(0.8, 1.0, r);
        gl_FragColor = vec4(col * edge * uGain * (1.0 + uPulse * 0.4), 1.0);
        ${END}
      }`,
  });
}
