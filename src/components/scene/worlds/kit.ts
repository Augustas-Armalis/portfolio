import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { POST_U } from "../Post";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { heightAt, heightGLSL, type Terrain, type WorldDef } from "./voyage";

// The painter's kit the worlds are built from: matte tempera for anything
// sculpted, painted ground, still water, light (halos, drawn suns, sparks),
// soft cloud, and the air that all of it stands in.

export type V3 = [number, number, number];

export function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// value noise and a ridged sum of it, for carving rock in JS
function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
export function ridge2(x: number, y: number, oct = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  let w = 1;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise2(x * f, y * f) * 2 - 1);
    n = n * n * w;
    w = Math.min(1, n * 2);
    v += n * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}

// ---------- air ----------
// Height fog, integrated along the ray, tinted by the sky in that direction:
// far things melt into the sky's own colour, and the feet of things stand in
// more air than their heads. uFogD is density per metre, uFogH how fast it
// thins with height. Shared by every material here; set once per world.
export const WORLD_U = {
  uFogD: { value: 0.001 },
  uFogH: { value: 0.012 },
};
export const GLSL_AIR = /* glsl */ `
uniform float uFogD; uniform float uFogH;
vec3 airCol(vec3 d){ return skyBase(normalize(vec3(d.x, max(d.y, 0.0) * 0.5 + 0.012, d.z))); }
float airAmt(vec3 wpos){
  vec3 dv = wpos - cameraPosition; float dist = length(dv);
  float a = exp(-max(cameraPosition.y, 0.0) * uFogH);
  float t = dv.y * uFogH;
  float integ = abs(t) > 0.001 ? (1.0 - exp(-t)) / t : 1.0;
  return clamp(1.0 - exp(-dist * (uFogD * 0.3 + uFogD * 2.2 * a * integ + uMist)), 0.0, 1.0);
}
vec3 applyAir(vec3 col, vec3 wpos){ return mix(col, airCol(normalize(wpos - cameraPosition)), airAmt(wpos)); }
// the eye is wide open at night: lights are turned down so they glow instead of glaring
float glowK(){ return mix(1.0, 0.36, uNight); }
`;
const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------- sculpting ----------
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();

// Give a part its paint: a colour (optionally blending to another toward its
// top) and how much of its own light it gives off.
export function paint(g: THREE.BufferGeometry, col: V3, glow = 0, top?: V3) {
  const n = g.index ? g.toNonIndexed() : g;
  const pos = n.attributes.position;
  n.computeBoundingBox();
  const y0 = n.boundingBox!.min.y;
  const y1 = Math.max(y0 + 1e-4, n.boundingBox!.max.y);
  const c = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const k = top ? (pos.getY(i) - y0) / (y1 - y0) : 0;
    const t = top ?? col;
    c[i * 4] = col[0] + (t[0] - col[0]) * k;
    c[i * 4 + 1] = col[1] + (t[1] - col[1]) * k;
    c[i * 4 + 2] = col[2] + (t[2] - col[2]) * k;
    c[i * 4 + 3] = glow;
  }
  n.setAttribute("aCol", new THREE.BufferAttribute(c, 4));
  n.deleteAttribute("uv");
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}

type Opt = { glow?: number; top?: V3; rot?: V3; scale?: V3; flat?: boolean };
export class Kit {
  parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, p: V3, col: V3, o: Opt = {}) {
    const painted = paint(g, col, o.glow ?? 0, o.top);
    if (o.flat) painted.computeVertexNormals();
    E.set(...(o.rot ?? [0, 0, 0]));
    M.compose(new THREE.Vector3(...p), Q.setFromEuler(E), new THREE.Vector3(...(o.scale ?? [1, 1, 1])));
    painted.applyMatrix4(M);
    this.parts.push(painted);
    return this;
  }
  box(w: number, h: number, d: number, p: V3, col: V3, o?: Opt) {
    return this.add(new THREE.BoxGeometry(w, h, d), p, col, o);
  }
  // a solid of revolution from a profile of [radius, height] points
  lathe(profile: [number, number][], p: V3, col: V3, o: Opt & { seg?: number } = {}) {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
      o.seg ?? 40,
    );
    return this.add(g, p, col, o);
  }
  // a round limb along a line of points
  tube(pts: V3[], radius: number, col: V3, o: Opt & { seg?: number; sides?: number; closed?: boolean } = {}) {
    const curve = new THREE.CatmullRomCurve3(
      pts.map((q) => new THREE.Vector3(...q)),
      !!o.closed,
      "centripetal",
    );
    return this.add(new THREE.TubeGeometry(curve, o.seg ?? pts.length * 6, radius, o.sides ?? 6, !!o.closed), [0, 0, 0], col, o);
  }
  build() {
    const g = mergeGeometries(this.parts)!;
    this.parts.forEach((p) => p.dispose());
    g.computeBoundingSphere();
    return g;
  }
}

// Matte tempera: chalky dabs, coloured shade, no gloss. Painted vertices carry
// colour and their own light (aCol.a, which may run well past 1 for the lens
// to bloom). `rim` draws a thin line of light round every silhouette, the way
// he outlined forms in gold.
export function makeTempera(o: { rim?: V3; rimPow?: number; amb?: number; key?: number; dab?: number; strata?: number } = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      uRim: { value: new THREE.Color(...(o.rim ?? [0, 0, 0])) },
      uRimP: { value: o.rimPow ?? 3 },
      uAmbK: { value: o.amb ?? 0.8 },
      uKeyK: { value: o.key ?? 0.32 },
      uDab: { value: o.dab ?? 1 },
      uStrata: { value: o.strata ?? 0 },
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
      uniform vec3 uRim; uniform float uRimP; uniform float uAmbK; uniform float uKeyK; uniform float uDab; uniform float uStrata;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec3 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        float dab = vnoise(vLocal.xz * 0.23 + vLocal.y * 0.19) * 0.6 + vnoise(vLocal.xy * 0.9 + vLocal.z * 0.7) * 0.4;
        vec3 alb = vCol.rgb * (1.0 + (dab - 0.5) * 0.34 * uDab);
        // rock: level beds of lighter and darker stone, broken by the slope
        if (uStrata > 0.0) {
          float bed = vnoise(vec2(vLocal.y * 0.16 + vnoise(vLocal.xz * 0.02) * 3.0, 1.7)) * 0.65 + vnoise(vec2(vLocal.y * 0.55, vLocal.x * 0.01 + 4.0)) * 0.35;
          alb *= 1.0 + (bed - 0.5) * 0.7 * uStrata * (1.0 - 0.6 * n.y * n.y);
        }
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float lit = clamp(dot(n, uKeyDir) * 0.6 + 0.4, 0.0, 1.0) * sunUp;
        vec3 col = alb * (uSkyCol * (0.68 + 0.32 * n.y) * uAmbK + uKeyCol * lit * uKeyK);
        // what shines is its own light, not lit paint as well
        col *= 1.0 - 0.85 * clamp(vCol.a, 0.0, 1.0);
        float fres = pow(1.0 - abs(dot(n, V)), uRimP);
        col += uRim * fres * (1.0 - clamp(vCol.a, 0.0, 1.0));
        col = applyAir(col, vWorld);
        // its own light, added after the air so a lamp still reads through the haze
        float glow = max(vCol.a, 0.0);
        col += vCol.rgb * glow * glowK() * (1.0 + uPulse * 0.6) * (1.0 - 0.6 * airAmt(vWorld));
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- ground ----------
export type GroundPalette = {
  a: V3; // the grass
  b: V3; // where it is dry
  c: V3; // broad drifts of a third tone
  shore?: V3; // sand at the water's edge
  rock?: V3; // on steep ground
  high?: V3; // on high ground
  highAt?: [number, number];
  bands?: number; // 0..1 contour bands, as in the Sonata of the Stars
};
const v3 = (c: V3) => `vec3(${c.map((x) => x.toFixed(4)).join(", ")})`;
// The colour of the ground at a point: the terrain and the far grass share it exactly.
export function groundGLSL(pal: GroundPalette) {
  return /* glsl */ `
vec3 groundAlb(vec2 p){
  float patchN = vnoise(p * 0.11 + 3.0);
  float clumpN = vnoise(p * 0.42 + 11.0);
  float dry = smoothstep(0.5, 0.85, patchN * 0.7 + clumpN * 0.3);
  vec3 c = mix(${v3(pal.a)}, ${v3(pal.b)}, dry) * mix(0.8, 1.12, clamp(clumpN * 0.6 + patchN * 0.6 - 0.1, 0.0, 1.0));
  return mix(c, ${v3(pal.c)}, smoothstep(0.42, 0.72, vnoise(p * 0.013 + 7.0)) * 0.6);
}
vec3 groundLight(vec3 alb){ return alb * (uSkyCol * 0.7 + uKeyCol * (0.22 + 0.5 * max(uKeyDir.y, 0.0)) * smoothstep(-0.02, 0.08, uKeyDir.y)); }
`;
}

export function terrainGeometry(t: Terrain, size: number, seg: number) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  // the grid is finer toward the middle, where the plane spends its time
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (size / 2);
    const z = p.getZ(i) / (size / 2);
    const wx = (x * (0.45 + 0.55 * x * x) * size) / 2;
    const wz = (z * (0.45 + 0.55 * z * z) * size) / 2;
    p.setXYZ(i, wx, heightAt(t, wx, wz), wz);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function makeTerrainMaterial(def: WorldDef, pal: GroundPalette) {
  const water = def.water ?? -1e4;
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vN = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${groundGLSL(pal)}
      void main(){
        vec3 n = normalize(vN);
        vec2 p = vLocal.xz;
        float h = vLocal.y;
        vec3 alb = groundAlb(p);
        ${pal.high ? `alb = mix(alb, ${v3(pal.high)}, smoothstep(${(pal.highAt ?? [20, 60])[0].toFixed(1)}, ${(pal.highAt ?? [20, 60])[1].toFixed(1)}, h + (vnoise(p * 0.03) - 0.5) * 14.0));` : ""}
        ${pal.rock ? `alb = mix(alb, ${v3(pal.rock)} * (0.8 + 0.4 * vnoise(vec2(h * 0.3, p.x * 0.02))), smoothstep(0.82, 0.62, n.y));` : ""}
        ${
          pal.bands
            ? `{ float bh = h * 0.16 + vnoise(p * 0.012) * 2.2; float bi = floor(bh); float bf = fract(bh);
               float pick = fract(sin(bi * 12.9898) * 43758.5453);
               vec3 band = pick < 0.3 ? ${v3(pal.a)} : pick < 0.55 ? ${v3(pal.b)} : pick < 0.8 ? ${v3(pal.c)} : ${v3(pal.high ?? pal.a)};
               float line = smoothstep(0.0, 0.06, bf) * smoothstep(1.0, 0.94, bf);
               alb = mix(alb, band, ${pal.bands.toFixed(2)}) * mix(1.55, 1.0, line); }`
            : ""
        }
        ${pal.shore ? `alb = mix(alb, ${v3(pal.shore)}, 1.0 - smoothstep(${(water + 0.25).toFixed(2)}, ${(water + 1.3).toFixed(2)}, h + (vnoise(p * 0.2) - 0.5) * 0.5));` : ""}
        alb = mix(alb, alb * vec3(0.5, 0.56, 0.6), 1.0 - smoothstep(${(water - 2.5).toFixed(2)}, ${(water + 0.05).toFixed(2)}, h));
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float ndl = clamp(dot(n, uKeyDir), 0.0, 1.0);
        vec3 col = alb * (uSkyCol * 0.7 + uKeyCol * (0.22 + 0.5 * max(uKeyDir.y, 0.0)) * mix(1.0, ndl / max(uKeyDir.y, 0.2), 0.55) * sunUp);
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- still water ----------
// The sky mirrored with a little fresnel, long slow ripples that flatten with
// distance, and lights drawn down into it as long broken streaks. `reflect`
// is GLSL for anything else that should stand mirrored in it:
//   vec4 worldReflect(vec3 P, vec3 r)  ->  rgb, coverage   (local coordinates)
export function makeWater(o: { def: WorldDef; lights?: THREE.Vector3[]; lightCol?: V3; lightLen?: number; deep?: V3; calm?: number; reflect?: string; shore?: V3; tint?: V3 }) {
  const lights = o.lights ?? [];
  const n = Math.max(1, lights.length);
  const arr = lights.length ? lights : [new THREE.Vector3(0, -999, 0)];
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      uLights: { value: arr },
      uLightCol: { value: new THREE.Color(...(o.lightCol ?? [1, 0.8, 0.45])) },
      uLen: { value: o.lightLen ?? 170 },
      uDeep: { value: new THREE.Color(...(o.deep ?? [0.02, 0.045, 0.055])) },
      uCalm: { value: o.calm ?? 1 },
      uTint: { value: new THREE.Color(...(o.tint ?? [1, 1, 1])) },
      uOrigin: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec2 vCamL;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vLocal = (wp.xyz - modelMatrix[3].xyz); vCamL = cameraPosition.xz - modelMatrix[3].xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLights[${n}]; uniform vec3 uLightCol; uniform float uLen; uniform vec3 uDeep; uniform float uCalm; uniform vec3 uTint;
      varying vec3 vWorld; varying vec3 vLocal; varying vec2 vCamL;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${heightGLSL(o.def.terrain)}
      ${o.reflect ?? "vec4 worldReflect(vec3 P, vec3 r){ return vec4(0.0); }"}
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(vWorld - cameraPosition);
        vec2 q = vLocal.xz;
        vec2 fl = vec2(uTime * 0.04, uTime * 0.025);
        float e = 0.35;
        float h0 = fbm(q * 0.11 + fl) + 0.35 * fbm(q * 0.7 - fl * 3.0);
        float hx = fbm((q + vec2(e, 0.0)) * 0.11 + fl) + 0.35 * fbm((q + vec2(e, 0.0)) * 0.7 - fl * 3.0);
        float hz = fbm((q + vec2(0.0, e)) * 0.11 + fl) + 0.35 * fbm((q + vec2(0.0, e)) * 0.7 - fl * 3.0);
        float calm = uCalm / (1.0 + dist * 0.012);
        vec3 n = normalize(vec3((h0 - hx) * 1.3 * calm, 1.0, (h0 - hz) * 1.3 * calm));
        vec3 r = reflect(-V, n);
        r.y = abs(r.y) + 0.002;
        r = normalize(r);
        vec3 sky = skyBase(r) * uTint;
        float sunVis = smoothstep(-0.03, 0.03, uSunDir.y) * uSkyFx.z;
        sky += mix(uGlow, vec3(1.0), 0.5) * pow(max(dot(r, uSunDir), 0.0), 380.0) * 18.0 * sunVis;
        vec4 wr = worldReflect(vec3(vLocal.x, 0.0, vLocal.z), r);
        sky = mix(sky, wr.rgb, wr.a);
        float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 deep = uDeep * (uSkyCol * 2.2 + 0.15);
        vec3 col = mix(deep, sky, clamp(fres * 0.82 + 0.18, 0.0, 1.0));
        // each light is drawn down toward the eye as a long thin streak, broken by the ripples: it runs
        // from under the light almost to the viewer's feet, so it stands tall in the frame as he painted it
        vec2 cl = vCamL;
        float hc = max(cameraPosition.y, 1.0);
        for (int i = 0; i < ${n}; i++) {
          vec2 F = uLights[i].xz;
          vec2 u = cl - F; float D = length(u); u /= max(D, 0.001);
          vec2 d = q - F;
          float s = dot(d, u);
          float dcam = max(D - s, 0.0);
          float w = max(0.07, dcam * 0.0042);
          float t = dot(d, vec2(-u.y, u.x)) + (h0 - 0.62) * w * 2.2 * smoothstep(0.0, 30.0, s);
          float a = exp(-(t * t) / (w * w)) * smoothstep(-0.4, 1.5, s) * smoothstep(hc * 1.5, hc * 5.5, dcam) * (1.0 - smoothstep(uLen * 0.7, uLen, s));
          float lg = log(max(dcam, 1.0));
          float brk = 0.25 + 0.75 * smoothstep(0.3, 0.72, vnoise(vec2(lg * 13.0 + uTime * 0.22, float(i) * 7.0)) * 0.6 + vnoise(vec2(lg * 41.0 - uTime * 0.3, 3.0)) * 0.4);
          col += uLightCol * a * brk * (0.4 + 0.6 * dcam / max(D, 1.0)) * (1.0 + uPulse * 0.6) * step(-500.0, uLights[i].y);
        }
        ${o.shore ? `{ float th = terrainH(q); col = mix(col, ${v3(o.shore)} * (uSkyCol + uKeyCol * 0.3), smoothstep(-0.9, -0.02, th + (h0 - 0.6) * 0.5) * 0.9); }` : ""}
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- light ----------
// Soft additive halos: a small hot core in a wide, saturated fall-off.
export type Halo = { p: V3; size: number; col: V3; k?: number };
const QUAD = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
export function haloGeometry(list: Halo[]) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(QUAD, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const pos = new Float32Array(list.length * 4);
  const col = new Float32Array(list.length * 4);
  const box = new THREE.Box3();
  list.forEach((h, i) => {
    pos.set([...h.p, h.size], i * 4);
    col.set([...h.col, h.k ?? 1], i * 4);
    box.expandByPoint(new THREE.Vector3(...h.p));
  });
  g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 4));
  g.instanceCount = list.length;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  g.boundingSphere.radius += 60;
  return g;
}
// kind 0: a halo with a hot core. kind 1: a sun as he drew them: a pale disc, a ring, straight rays. kind 2: a wide soft glow, no core.
export function makeHaloMaterial(kind: 0 | 1 | 2 = 0) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aPos; attribute vec4 aCol;
      varying vec2 vUv; varying vec4 vCol; varying float vFade; varying float vSeed;
      uniform float uTime;
      void main(){
        vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
        float d = -mv.z;
        vSeed = fract(aPos.x * 0.137 + aPos.z * 0.291 + aPos.y * 0.071);
        float breathe = 1.0 + 0.06 * sin(uTime * (0.6 + vSeed) + vSeed * 40.0);
        mv.xy += position.xy * aPos.w * breathe;
        vUv = position.xy; vCol = aCol;
        // never a white-out when the plane flies through one
        vFade = smoothstep(2.0 + aPos.w * 0.2, 12.0 + aPos.w * 1.1, d);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uPulse; uniform float uNight;
      varying vec2 vUv; varying vec4 vCol; varying float vFade; varying float vSeed;
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float edge = 1.0 - smoothstep(0.7, 1.0, r);
        ${
          kind === 0
            ? `float a = (exp(-r * r * 26.0) * 2.6 + exp(-r * r * 5.0) * 0.5 + exp(-r * 2.6) * 0.1) * edge;
               vec3 c = mix(vCol.rgb, vec3(1.0, 0.97, 0.9), exp(-r * r * 60.0) * 0.7) * a;`
            : kind === 2
              ? `float a = (exp(-r * r * 5.5) * 0.6 + exp(-r * 3.0) * 0.12) * edge;
               vec3 c = vCol.rgb * a;`
              : `float ang = atan(vUv.y, vUv.x) + vSeed * 6.283 + uTime * 0.02 * (vSeed - 0.5);
               float rays = 8.0 + floor(vSeed * 3.0) * 2.0;
               float cell = ang / 6.2832 * rays;
               // straight thin rays of even width, long and short by turns
               float lat = abs(fract(cell) - 0.5) * (6.2832 / rays) * r;
               float longRay = step(0.5, fract(floor(cell) * 0.5));
               float reach = mix(0.58, 0.95, longRay);
               float ray = (1.0 - smoothstep(0.006, 0.014, lat)) * smoothstep(0.21, 0.25, r) * (1.0 - smoothstep(reach - 0.1, reach, r));
               float ring = smoothstep(0.016, 0.004, abs(r - 0.165));
               float disc = (1.0 - smoothstep(0.1, 0.115, r));
               float a = disc * 0.8 + ring * 0.95 + ray * 0.85 + exp(-r * r * 8.0) * 0.1 * edge;
               vec3 c = mix(vCol.rgb, vec3(1.0, 0.93, 0.7), disc * 0.5) * a;`
        }
        gl_FragColor = vec4(c * vCol.a * vFade * mix(1.0, 0.36, uNight) * (1.0 + uPulse * 0.5), 1.0);
        ${END}
      }`,
  });
}

// Sparks: stars, motes, flowers, fireflies. Each drifts a little round its place.
export function pointsGeometry(n: number, at: (i: number, r: () => number) => [number, number, number, number], seed = 1) {
  const r = rng(seed);
  const pos = new Float32Array(n * 3);
  const sz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const [x, y, z, s] = at(i, r);
    pos.set([x, y, z], i * 3);
    sz[i] = s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
  g.computeBoundingSphere();
  return g;
}
export function makePoints(o: { a: V3; b: V3; scale: number; drift?: number; gain?: number; max?: number; solid?: boolean }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: o.solid ? THREE.NormalBlending : THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, uA: { value: new THREE.Color(...o.a) }, uB: { value: new THREE.Color(...o.b) }, uScale: { value: o.scale }, uDrift: { value: o.drift ?? 0 }, uGain: { value: o.gain ?? 1 }, uMax: { value: o.max ?? 48 } },
    vertexShader: /* glsl */ `
      attribute float aSize; uniform float uTime; uniform float uScale; uniform float uPulse; uniform float uDrift; uniform float uMax;
      varying float vK; varying float vTw; varying vec3 vWorld;
      void main(){
        vK = fract(aSize * 7.31);
        vec3 p = position;
        float ph = aSize * 40.0 + position.x * 0.3;
        p += vec3(sin(uTime * (0.21 + vK * 0.3) + ph), sin(uTime * (0.17 + vK * 0.2) + ph * 1.7) * 0.6, cos(uTime * (0.19 + vK * 0.25) + ph * 1.3)) * uDrift;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        vTw = 0.72 + 0.28 * sin(uTime * (1.0 + vK * 3.0) + aSize * 40.0);
        gl_PointSize = clamp(aSize * uScale * (1.0 + uPulse * 0.4) / -mv.z, 1.0, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA; uniform vec3 uB; uniform float uGain;
      varying float vK; varying float vTw; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        ${
          o.solid
            ? `float a = 1.0 - smoothstep(0.3, 0.5, length(c));
               vec3 col = mix(uA, uB, vK) * (uSkyCol * 0.8 + uKeyCol * 0.3) * uGain;
               gl_FragColor = vec4(applyAir(col, vWorld), a);`
            : `float a = exp(-dot(c, c) * 22.0) * vTw * uGain * (1.0 - airAmt(vWorld) * 0.85);
               gl_FragColor = vec4(mix(uA, uB, vK) * a, 1.0);`
        }
        ${END}
      }`,
  });
}

// ---------- cloud ----------
// A few big soft forms, each a lumpy ellipsoid: a warm lit side, a cool core,
// light caught in the rim when the sun is behind.
export type Cloud = { p: V3; s: V3; seed?: number };
export function cloudGeometry(detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const lump = 1 + 0.2 * Math.sin(v.x * 4.1 + 1) * Math.sin(v.z * 3.7 + 2) + 0.12 * Math.sin(v.x * 9.3 + v.y * 7.1);
    p.setXYZ(i, v.x * lump, (v.y < 0 ? v.y * 0.45 : v.y) * lump, v.z * lump);
    // it shades as one round soft thing, not as its facets
    g.attributes.normal.setXYZ(i, v.x, v.y * 0.8 + 0.2, v.z);
  }
  return g;
}
export function cloudMesh(list: Cloud[], mat: THREE.Material, detail = 2) {
  const im = new THREE.InstancedMesh(cloudGeometry(detail), mat, list.length);
  const o = new THREE.Object3D();
  list.forEach((c, i) => {
    o.position.set(...c.p);
    o.scale.set(...c.s);
    o.rotation.set(0, (c.seed ?? i) * 2.4, 0);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}
export function makeCloudMaterial(o: { lit?: number; alpha?: number; tint?: V3; drift?: number } = {}) {
  return new THREE.ShaderMaterial({
    transparent: (o.alpha ?? 1) < 1,
    uniforms: { ...SKY_U, ...WORLD_U, uLitK: { value: o.lit ?? 1 }, uAlpha: { value: o.alpha ?? 1 }, uTint: { value: new THREE.Color(...(o.tint ?? [1, 1, 1])) }, uDrift: { value: o.drift ?? 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN;
      uniform float uTime; uniform float uDrift;
      void main(){
        vec4 lp = instanceMatrix * vec4(position, 1.0);
        // smoke and cloud are never quite still
        float ph = instanceMatrix[3].x * 0.05 + instanceMatrix[3].y * 0.03;
        lp.xyz += vec3(sin(uTime * 0.21 + ph), sin(uTime * 0.17 + ph * 1.7) * 0.5, cos(uTime * 0.19 + ph * 1.3)) * uDrift;
        vec4 wp = modelMatrix * lp;
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * lp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uLitK; uniform float uAlpha; uniform vec3 uTint;
      varying vec3 vWorld; varying vec3 vN;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float w = smoothstep(-0.4, 0.8, dot(n, uKeyDir));
        vec3 col = mix(uCloudShade, uCloudLit * uLitK, w);
        col += uGlow * pow(1.0 - max(dot(n, V), 0.0), 2.5) * pow(max(dot(V, -uKeyDir), 0.0), 4.0) * 0.9;
        col = mix(col * uTint, airCol(normalize(vWorld - cameraPosition)), airAmt(vWorld) * 0.8);
        gl_FragColor = vec4(col, uAlpha);
        ${END}
      }`,
  });
}

// Low drifts of mist: big soft discs that face the eye, thin enough to stack.
export type Puff = { p: V3; size: number; a?: number };
export function puffGeometry(list: Puff[]) {
  return haloGeometry(list.map((p) => ({ p: p.p, size: p.size, col: [1, 1, 1] as V3, k: p.a ?? 1 })));
}
export function makePuffMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aPos; attribute vec4 aCol;
      varying vec2 vUv; varying float vA; varying vec3 vWorld; varying float vSeed;
      uniform float uTime;
      void main(){
        vSeed = fract(aPos.x * 0.137 + aPos.z * 0.291);
        vec3 c = aPos.xyz + vec3(sin(uTime * 0.03 + vSeed * 30.0), 0.0, cos(uTime * 0.027 + vSeed * 17.0)) * aPos.w * 0.12;
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        float d = -mv.z;
        mv.xy += position.xy * aPos.w * vec2(1.0, 0.34);
        vUv = position.xy;
        vWorld = (modelMatrix * vec4(c, 1.0)).xyz;
        vA = aCol.a * smoothstep(aPos.w * 0.5, aPos.w * 1.6, d);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vA; varying vec3 vWorld; varying float vSeed;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float r = length(vUv);
        float n = vnoise(vUv * 2.2 + vSeed * 40.0 + uTime * 0.01);
        float a = smoothstep(1.0, 0.1, r + (n - 0.5) * 0.5) * vA * 0.42;
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 col = airCol(d) * 1.05 + uGlow * pow(max(dot(d, uSunDir), 0.0), 6.0) * 0.2 * smoothstep(-0.05, 0.05, uSunDir.y);
        gl_FragColor = vec4(col, a);
        ${END}
      }`,
  });
}

// ---------- a painting ----------
// Display-referred: into the lens' linear target it goes as linear light with
// alpha 0, so the grade passes it through untouched.
export function makeCanvasMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -80,
    uniforms: { uMap: { value: map }, uLinearOut: POST_U.uLinearOut, uShow: { value: 0 }, uLit: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uLinearOut; uniform float uShow; uniform float uLit;
      varying vec2 vUv;
      void main(){
        // the texture is sRGB-decoded on sampling: encode back to what the file holds
        vec3 lin = texture2D(uMap, vUv).rgb;
        // a soft wash of light from above, and the unlit ground of the canvas until the picture has arrived
        float wash = mix(0.9, 1.04, smoothstep(0.0, 1.0, vUv.y)) * uLit;
        lin = mix(vec3(0.12, 0.1, 0.085), lin * wash, uShow);
        if (uLinearOut > 0.5) { gl_FragColor = vec4(lin, 0.0); }
        else { vec3 c = mix(lin * 12.92, 1.055 * pow(max(lin, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin)); gl_FragColor = vec4(c, 1.0); }
      }`,
  });
}

// ---------- figures ----------
// An angel as he painted them: a slim robe, a small head, two tall narrow
// wings rising well above it like the blades of a closed fan.
let wingGeo: THREE.BufferGeometry | null = null;
function wing() {
  if (wingGeo) return wingGeo;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.3, 0.45, 0.44, 1.3, 0.17, 2.2);
  s.bezierCurveTo(0.1, 1.7, -0.04, 1.0, -0.09, 0.45);
  s.bezierCurveTo(-0.12, 0.25, -0.06, 0.08, 0, 0);
  wingGeo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: false, curveSegments: 10 });
  return wingGeo;
}
export function angel(k: Kit, p: V3, s: number, yaw: number, robe: V3, o: { bow?: number; glow?: number; wing?: V3; open?: number } = {}) {
  const bow = o.bow ?? 0;
  const glow = o.glow ?? 0.12;
  const pale: V3 = [Math.min(1, robe[0] * 0.5 + 0.55), Math.min(1, robe[1] * 0.5 + 0.55), Math.min(1, robe[2] * 0.5 + 0.55)];
  const place = (g: THREE.BufferGeometry, lp: V3, lr: V3, col: V3, gl: number, top?: V3, sc: V3 = [1, 1, 1]) => {
    // local (figure) space -> bowed -> turned -> placed
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...lp), new THREE.Quaternion().setFromEuler(new THREE.Euler(...lr)), new THREE.Vector3(...sc));
    const fig = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(bow, yaw, 0, "YXZ")), new THREE.Vector3(s, s, s));
    const painted = paint(g, col, gl, top);
    painted.applyMatrix4(fig.multiply(m));
    k.parts.push(painted);
  };
  // robe: narrow at the shoulder, falling to a soft hem
  const robeProfile: [number, number][] = [
    [0.36, 0],
    [0.33, 0.06],
    [0.25, 0.5],
    [0.19, 1.0],
    [0.17, 1.3],
    [0.2, 1.42],
    [0.13, 1.52],
    [0.07, 1.56],
  ];
  place(new THREE.LatheGeometry(robeProfile.map(([r, y]) => new THREE.Vector2(r * 1.15, y)), 14), [0, 0, 0], [0, 0, 0], robe, glow, [robe[0] * 0.6 + pale[0] * 0.4, robe[1] * 0.6 + pale[1] * 0.4, robe[2] * 0.6 + pale[2] * 0.4]);
  place(new THREE.SphereGeometry(0.115, 12, 10), [0, 1.68, 0.01], [0, 0, 0], [0.94, 0.8, 0.68], glow * 1.2);
  const wc = o.wing ?? [0.9 * 0.7 + pale[0] * 0.3, 0.88 * 0.7 + pale[1] * 0.3, 0.8 * 0.7 + pale[2] * 0.3];
  const open = o.open ?? 0.36;
  for (const w of [-1, 1]) place(wing().clone(), [w * 0.1, 1.16, -0.13], [-0.1, -w * open, -w * 0.1], wc, glow * 0.9, undefined, [w, 1, 1]);
}
