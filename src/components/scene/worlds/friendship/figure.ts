import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, rng, type V3 } from "../kit";
import { Clay, type Paint } from "../sculpt";
import { ORIGIN } from "../voyage";
import { FRIEND_U, GLSL_ORB } from "./cave";
import { HER, ORB } from "./shape";

// Her, built up in clay the way the kings are (kings/figures.ts), the size of a hill.
//
// She is seen in profile from the way in, on the right, facing left across it: a calm face with the eye closed,
// the brow smooth, a straight nose, the mouth at rest; the hair drawn back over the head and gathered in a knot
// behind it, a band of gold at the hairline; a long neck, a bare shoulder; the near arm bent, the forearm raised,
// and the open hand under the orb with its four fingers and the thumb curled up round it. Below the shoulders she
// goes down into the dark of the floor.
//
// The orb is her only light. What faces it is ochre and gold, hottest along the very edge of the profile; what is
// turned from it keeps the cave's deep teal. The paint is pastel: long upright strokes on a toothed ground.
//
// From the band a crown of rays streams up and back: fine strands of light, each one a long thread that thins
// toward its end and carries a slow shimmer up its length.
// Lengths below are in her own measure (HER.u: her head is about 1.4 of it tall).

const SKIN = 0;
const HAIR = 1;
const LIP = 2;
const GOLD = 3;

export type Her = {
  geo: THREE.BufferGeometry;
  headC: V3;
  headF: V3;
  up: V3;
  chest: V3;
  hairDir: [number, number];
  band: { c: V3; e1: V3; n: V3; ra: number; rb: number };
};

// `far`: the same figure in coarser clay, for when she is small in the haze (about a third of the triangles)
export function* herSteps(coarse: boolean, budget: number, far = false): Generator<void, Her, void> {
  const U = HER.u;
  const sk: [number, number, number, number] = [0, 0, 1, 0];
  const hr: [number, number, number, number] = [0, 0, 0, 1];
  const paints: Paint[] = [
    { col: [0.6, 0.43, 0.24], kind: 1, what: sk, grp: 0 },
    { col: [0.07, 0.07, 0.05], kind: 1, what: hr, grp: 1 },
    { col: [0.56, 0.3, 0.2], kind: 1, what: sk, grp: 0 },
    { col: [0.78, 0.55, 0.16], kind: 1, what: [1, 0, 0, 0], grp: 2 },
  ];
  // the head: level, bowed the least bit toward what she holds
  const tau = 0.13;
  const f: V3 = [-Math.cos(tau), -Math.sin(tau), 0];
  const up: V3 = [-Math.sin(tau), Math.cos(tau), 0];
  const Hc: V3 = [HER.x, HER.y, HER.z];
  const F = (a: number, b: number, w = 0): V3 => [Hc[0] + (f[0] * a + up[0] * b) * U, Hc[1] + (f[1] * a + up[1] * b) * U, Hc[2] + w * U];
  const rr = (x: number, y: number, z: number): V3 => [x * U, y * U, z * U];
  const ax = { x: f, y: up };
  const v = (coarse ? 1.5 : 1) * (far ? 1.9 : 1) * (U / 30);
  const O: V3 = [ORB.x, ORB.y, ORB.z];

  // ---- the head ----
  // (F is in the head's own measure: forward, up, sideways.) The kings' heads, made young and at rest: the same
  // planes (a full forehead coming down to a soft brow, one straight blade of a nose, a long cheek), with nothing
  // fallen in and nothing lined. The closed eye and the mouth are drawn on afterwards, in the material.
  const head = new Clay(0.08 * U);
  head.ball(F(-0.06, 0.12), rr(0.5, 0.52, 0.45), SKIN, { ...ax, k: 0.1 * U });
  head.ball(F(0.14, -0.2), rr(0.36, 0.46, 0.32), SKIN, { ...ax, k: 0.12 * U });
  head.ball(F(0.15, -0.47), rr(0.25, 0.17, 0.24), SKIN, { ...ax, k: 0.12 * U });
  head.ball(F(0.16, 0.2), rr(0.33, 0.3, 0.38), SKIN, { ...ax, k: 0.1 * U });
  head.ball(F(0.44, 0.045), rr(0.078, 0.05, 0.25), SKIN, { ...ax, k: 0.09 * U });
  // the nose: one straight line on from the forehead, as he drew it, widening a little to a small round tip
  head.limb(F(0.5, 0.0), F(0.625, -0.2), 0.03 * U, 0.05 * U, SKIN, { k: 0.06 * U, flat: 0.72 });
  head.limb(F(0.46, 0.02), F(0.56, -0.22), 0.07 * U, 0.085 * U, SKIN, { k: 0.1 * U, flat: 0.9 });
  // (the face comes forward under it: the upper jaw, so the nose grows out of a face and is not set on one)
  head.ball(F(0.3, -0.3), rr(0.21, 0.22, 0.24), SKIN, { ...ax, k: 0.15 * U });
  // the lips, full and closed, and a small round chin
  head.ball(F(0.482, -0.375), rr(0.06, 0.036, 0.105), LIP, { ...ax, k: 0.045 * U });
  head.ball(F(0.474, -0.446), rr(0.056, 0.037, 0.092), LIP, { ...ax, k: 0.04 * U });
  head.ball(F(0.4, -0.6), rr(0.088, 0.08, 0.11), SKIN, { ...ax, k: 0.1 * U });
  for (const s of [-1, 1]) {
    head.ball(F(0.578, -0.215, s * 0.043), rr(0.03, 0.022, 0.024), SKIN, { ...ax, k: 0.03 * U });
    // the cheekbone, and under it a full cheek
    head.ball(F(0.3, -0.14, s * 0.28), rr(0.14, 0.09, 0.09), SKIN, { ...ax, k: 0.07 * U });
    head.ball(F(0.33, -0.36, s * 0.26), rr(0.15, 0.16, 0.085), SKIN, { ...ax, k: 0.14 * U });
    // the closed eye under its lid
    head.ball(F(0.432, -0.035, s * 0.118), rr(0.064, 0.058, 0.07), SKIN, { ...ax, k: 0.07 * U });
    head.ball(F(0.2, 0.1, s * 0.47), rr(0.16, 0.14, 0.03), SKIN, { ...ax, cut: true, k: 0.07 * U });
    head.ball(F(-0.05, -0.12, s * 0.445), rr(0.06, 0.12, 0.045), SKIN, { ...ax, k: 0.03 * U });
  }
  // a long neck
  const neck: V3 = [Hc[0] + 0.3 * U, Hc[1] - 1.14 * U, Hc[2]];
  head.limb(F(-0.12, -0.36), neck, 0.24 * U, 0.3 * U, SKIN, { k: 0.14 * U });
  // the hair: drawn back smooth over the whole head from the brow and the temples, and gathered behind in a knot
  head.ball(F(-0.2, 0.16), rr(0.6, 0.6, 0.53), HAIR, { ...ax, k: 0.06 * U, soft: 0.7 });
  for (const s of [-1, 1]) head.ball(F(-0.1, -0.02, s * 0.4), rr(0.28, 0.38, 0.13), HAIR, { ...ax, k: 0.06 * U, soft: 0.6 });
  head.limb(F(-0.55, 0.02), F(-0.86, -0.14), 0.26 * U, 0.24 * U, HAIR, { k: 0.1 * U, soft: 0.8 });
  head.ball(F(-0.92, -0.16), rr(0.31, 0.3, 0.3), HAIR, { ...ax, k: 0.08 * U, soft: 0.8 });
  // the band: a plain hoop of gold lying on the hair, low on the brow and rising toward the back of the head
  const beta = 0.27;
  const e1: V3 = [f[0] * Math.cos(beta) - up[0] * Math.sin(beta), f[1] * Math.cos(beta) - up[1] * Math.sin(beta), 0];
  const bn: V3 = [up[0] * Math.cos(beta) + f[0] * Math.sin(beta), up[1] * Math.cos(beta) + f[1] * Math.sin(beta), 0];
  const bc = F(-0.12, 0.37);
  const ra = 0.63 * U;
  const rb = 0.55 * U;
  // (everything above the band is hair: the hairline is the band itself)
  head.ball([bc[0] + bn[0] * 0.03 * U, bc[1] + bn[1] * 0.03 * U, bc[2]], rr(0.645, 0.4, 0.565), HAIR, { x: e1, y: bn, k: 0.03 * U, soft: 0.5 });
  // ---- the body ----
  // Shoulders, the top of the chest, and the near arm; all of it one smooth clay, going down into the floor.
  const body = new Clay(0.25 * U);
  const ys = Hc[1] - 1.14 * U;
  body.limb([Hc[0] + 0.5 * U, ys - 0.32 * U, Hc[2]], [Hc[0] + 0.66 * U, -70, Hc[2]], 0.5 * U, 0.8 * U, SKIN, { flat: 1.6, soft: 6 });
  body.ball([Hc[0] + 0.44 * U, ys - 0.16 * U, Hc[2]], rr(0.44, 0.28, 1.02), SKIN, { soft: 6 });
  for (const s of [-1, 1]) body.ball([Hc[0] + 0.42 * U, ys - 0.24 * U, Hc[2] + s * 0.95 * U], rr(0.33, 0.31, 0.35), SKIN, { soft: 6 });
  body.limb(F(-0.12, -0.36), neck, 0.24 * U, 0.31 * U, SKIN, { k: 0.16 * U });
  // the near arm: down from the shoulder to an elbow held out from her side, the forearm raised to the orb
  const Sh: V3 = [Hc[0] + 0.42 * U, ys - 0.26 * U, Hc[2] + 0.97 * U];
  const El: V3 = [O[0] + 152, 12, Hc[2] + 1.42 * U];
  const Wr: V3 = [O[0] + 50, O[1] - 49, O[2] + 9];
  body.limb(Sh, El, 0.27 * U, 0.22 * U, SKIN, { k: 0.2 * U, soft: 3 });
  body.limb(El, Wr, 0.225 * U, 0.125 * U, SKIN, { k: 0.12 * U, soft: 3 });
  // (the far arm hangs straight down into the dark)
  body.limb([Hc[0] + 0.42 * U, ys - 0.26 * U, Hc[2] - 0.97 * U], [Hc[0] + 0.5 * U, -60, Hc[2] - 1.1 * U], 0.27 * U, 0.24 * U, SKIN, { k: 0.2 * U, soft: 3 });

  // ---- the hand ----
  // Open under the orb and bearing it: the heel of the hand toward her, the palm beneath, four fingers going on
  // under it and curling up round its far side, the thumb up round the side the plane comes from (it stays well
  // under the way in).
  const hand = new Clay(0.035 * U);
  const rho = ORB.r + 4.2;
  const on = (az: number, pol: number, out = 0): V3 => {
    const a = (az * Math.PI) / 180;
    const p = (pol * Math.PI) / 180;
    const r = rho + out;
    return [O[0] - Math.sin(p) * Math.cos(a) * r, O[1] - Math.cos(p) * r, O[2] + Math.sin(p) * Math.sin(a) * r];
  };
  const finger = (pts: V3[], r0: number) => {
    const n = pts.length;
    hand.chain(
      pts,
      pts.map((_, i) => r0 * (1 - 0.34 * (i / (n - 1)))),
      SKIN,
      { k: 0.03 * U },
    );
    for (let i = 1; i < n - 1; i++) hand.ball(pts[i], r0 * 1.14 * (1 - 0.3 * (i / (n - 1))), SKIN, { k: 0.025 * U });
  };
  hand.limb(Wr, [O[0] + 22, O[1] - ORB.r - 7, O[2] + 3], 0.125 * U, 0.1 * U, SKIN, { k: 0.1 * U });
  hand.ball([O[0] + 5, O[1] - ORB.r - 5.5, O[2]], [22, 5.8, 20], SKIN, { k: 0.1 * U });
  [-38, -13, 12, 37].forEach((az, i) => {
    const len = [0.86, 0.98, 1.0, 0.92][i];
    finger([on(az, 23, 0.6), on(az, 23 + 22 * len), on(az * 1.04, 23 + 41 * len), on(az * 1.06, 23 + 55 * len, -0.4)], 3.5);
  });
  finger([on(120, 16, 1.2), on(106, 29), on(98, 41), on(94, 51, -0.4)], 4.1);

  const parts = [
    yield* body.meshSteps(1.4 * v, paints, undefined, budget),
    yield* head.meshSteps(0.5 * v, paints, undefined, budget),
    yield* hand.meshSteps(0.4 * v, paints, undefined, budget),
  ];
  if (process.env.NODE_ENV !== "production") console.info(`[friendship] her${far ? " (far)" : ""}, triangles: body ${Math.round(parts[0].index!.count / 3)}, head ${Math.round(parts[1].index!.count / 3)}, hand ${Math.round(parts[2].index!.count / 3)}`);
  // the band: a turned hoop, not clay
  {
    const t = new THREE.TorusGeometry(1, 0.05, 10, 96);
    t.deleteAttribute("uv");
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...e1).multiplyScalar(ra), new THREE.Vector3(0, 0, rb), new THREE.Vector3(...bn).multiplyScalar(ra * 0.8));
    m.setPosition(bc[0], bc[1], bc[2]);
    t.applyMatrix4(m);
    const n = t.attributes.position.count;
    const col = new Float32Array(n * 4);
    const what = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col.set([paints[GOLD].col[0], paints[GOLD].col[1], paints[GOLD].col[2], 1], i * 4);
      what[i * 4] = 1;
    }
    t.setAttribute("aCol", new THREE.BufferAttribute(col, 4));
    t.setAttribute("aPat", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    t.setAttribute("aWhat", new THREE.BufferAttribute(what, 4));
    t.setAttribute("aAO", new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    parts.push(t);
  }
  const geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  geo.computeBoundingSphere();
  return { geo, headC: Hc, headF: f, up, chest: [Hc[0] + 0.4 * U, ys - 0.3 * U, Hc[2]], hairDir: [-f[0], -f[1]], band: { c: bc, e1, n: bn, ra, rb } };
}

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
const S = (p: V3) => new THREE.Vector3(ORIGIN.x + p[0], ORIGIN.y + p[1], ORIGIN.z + p[2]);

export function makeHerMaterial(h: Her) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      ...FRIEND_U,
      uHeadC: { value: S(h.headC) },
      uHeadF: { value: new THREE.Vector3(...h.headF) },
      uUp: { value: new THREE.Vector3(...h.up) },
      uChest: { value: S(h.chest) },
      uHairDir: { value: new THREE.Vector2(...h.hairDir) },
      uU: { value: HER.u },
      uFloor: { value: ORIGIN.y },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute vec4 aWhat; attribute float aAO;
      uniform float uTime; uniform float uU; uniform vec3 uChest;
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vN; varying vec4 vCol; varying vec4 vWhat; varying float vAO;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vObj = wp.xyz;
        // she breathes, very slowly: the shoulders and the chest the least bit up and back (the hand does not move)
        vec3 e = (wp.xyz - uChest) / (uU * 1.5);
        wp.xyz += vec3(0.25, 1.0, 0.0) * exp(-dot(e, e)) * (0.5 + 0.5 * sin(uTime * 0.36)) * 1.1;
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol; vWhat = aWhat; vAO = aAO;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vN; varying vec4 vCol; varying vec4 vWhat; varying float vAO;
      uniform vec3 uHeadC; uniform vec3 uHeadF; uniform vec3 uUp; uniform vec2 uHairDir; uniform float uU; uniform float uFloor; uniform vec3 uChest;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_ORB}
      float lineAA(float x, float w, float fw){ return 1.0 - smoothstep(w - fw, w + fw, abs(x)); }
      // a height drawn on a surface pushes its normal about (from the screen's own derivatives)
      vec3 bumpN(vec3 n, vec3 P, float h, float k){
        vec3 dpx = dFdx(P); vec3 dpy = dFdy(P);
        float hx = dFdx(h); float hy = dFdy(h);
        vec3 r1 = cross(dpy, n); vec3 r2 = cross(n, dpx);
        float det = dot(dpx, r1);
        vec3 g = (r1 * hx + r2 * hy) * sign(det) / max(abs(det), 1e-7);
        return normalize(n - g * k);
      }
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float goldW = vWhat.x; float skinW = vWhat.z; float hairW = vWhat.w;
        vec3 alb = vCol.rgb;
        float wf = length(fwidth(vObj));
        float fine = 1.0 - smoothstep(0.25, 1.1, wf);
        // pastel: long upright strokes laid side by side, and the tooth of the ground under them
        float hatch = vnoise(vec2(vObj.x * 0.26 + vObj.z * 0.19, vObj.y * 0.022)) * 0.6 + vnoise(vec2(vObj.x * 0.8 - vObj.z * 0.6 + 5.0, vObj.y * 0.06)) * 0.4;
        float tooth = vnoise(vObj.xy * 0.7 + vObj.z * 0.5) * 0.6 + vnoise(vObj.xy * 2.1 - vObj.z * 1.3) * 0.4;
        alb *= 1.0 + (hatch - 0.5) * 0.2 * (1.0 - 0.5 * hairW) + (tooth - 0.5) * 0.2 * fine;
        float height = hatch * 0.22 + tooth * 0.07 * fine;
        // hair: long strands running the way it is drawn back, and the broader locks they lie in
        float hAlong = dot(vObj.xy, uHairDir);
        float hAcross = dot(vObj.xy, vec2(-uHairDir.y, uHairDir.x));
        float hW = smoothstep(0.55, 0.95, hairW);
        float strand = 0.5 * (vnoise(vec2(hAcross * 0.6, hAlong * 0.018)) + vnoise(vec2(vObj.z * 0.6 + 9.0, hAlong * 0.018)));
        strand = mix(strand, 0.5 * (vnoise(vec2(hAcross * 1.5 + 7.0, hAlong * 0.04)) + vnoise(vec2(vObj.z * 1.5 + 3.0, hAlong * 0.04))), 0.4 * fine);
        float lockN = 0.5 * (vnoise(vec2(hAcross * 0.17 + 3.0, hAlong * 0.007)) + vnoise(vec2(vObj.z * 0.17 + 5.0, hAlong * 0.007)));
        strand = mix(strand, lockN, 0.5);
        alb *= 1.0 + hW * (strand - 0.5) * 1.6;
        height += hW * strand * 0.5;
        // the band is worked: small bosses all along it
        alb *= 1.0 + goldW * (vnoise(vObj.xy * 0.5 + vObj.z * 0.4) - 0.5) * 0.5;
        // drawn on the face with the point of a brush: the lashes of the closed eye and the crease over it, the
        // brow, the mouth, a nostril
        {
          vec3 hp = (vObj - uHeadC) / uU;
          float fa = dot(hp, uHeadF); float fb = dot(hp, uUp); float fz = abs(hp.z);
          float lw = fwidth(fb) + fwidth(fz);
          float front = smoothstep(0.16, 0.26, fa);
          // (the eye is one long arc from beside the nose round onto the side of the face, so it is there in profile)
          float es = mix(0.27 + (0.46 - fa), fz, smoothstep(0.43, 0.49, fa));
          float lash = lineAA(fb + 0.09 + 2.2 * (es - 0.24) * (es - 0.24), 0.011, lw) * smoothstep(0.11, 0.16, es) * (1.0 - smoothstep(0.33, 0.39, es));
          lash += lineAA(fb + 0.05 + 2.4 * (es - 0.24) * (es - 0.24), 0.005, lw) * smoothstep(0.12, 0.17, es) * (1.0 - smoothstep(0.3, 0.36, es)) * 0.35;
          float browL = lineAA(fb - 0.075 + 1.6 * (es - 0.24) * (es - 0.24), 0.011, lw) * smoothstep(0.09, 0.15, es) * (1.0 - smoothstep(0.34, 0.43, es)) * 0.4;
          float mouth = lineAA(fb + 0.414 - 0.35 * fz * fz, 0.008, lw) * (1.0 - smoothstep(0.17, 0.22, fz)) * smoothstep(0.36, 0.44, fa);
          float nostril = 1.0 - smoothstep(0.008, 0.02, length(vec2(fb + 0.262, (fz - 0.038) * 0.7)));
          nostril *= smoothstep(0.54, 0.6, fa);
          float drawn = clamp(lash + browL + mouth * 0.8 + nostril * 0.4, 0.0, 1.0) * front * skinW;
          // the socket lies in its own soft shade under the brow
          float socket = (1.0 - smoothstep(0.02, 0.09, abs(fb + 0.04))) * smoothstep(0.06, 0.12, es) * (1.0 - smoothstep(0.32, 0.4, es));
          alb *= 1.0 - skinW * front * socket * 0.2;
          alb = mix(alb, vec3(0.09, 0.05, 0.035), drawn * 0.7);
        }
        n = bumpN(n, vWorld, height, 1.0);

        // the orb, and how near it is
        vec3 Lv = uOrb - vWorld; float d = length(Lv); vec3 Ld = Lv / max(d, 0.001);
        float ndl = dot(n, Ld);
        float att = uOrbK / (1.0 + pow(max(d - 20.0, 0.0) / 250.0, 2.0));
        float ao = mix(1.0, vAO, mix(0.85, 0.3, skinW));
        float wk = mix(0.25, 0.32, skinW);
        float wrap = clamp((ndl + wk) / (1.0 + wk), 0.0, 1.0);
        // (she stands in her own light: what lies behind the line of her shoulders and the back of her head has none of it)
        float open = 1.0 - smoothstep(-0.05, 0.75, dot(vObj - uChest, -uHeadF) / uU) * (1.0 - smoothstep(0.2, 1.3, abs(vObj.z - uChest.z) / uU - 0.2));
        float lit = wrap * wrap * open;
        // the cave's own colour on whatever is turned from the light: deep teal, a little of the green from the vault
        vec3 fill = vec3(0.035, 0.115, 0.105) * (0.62 + 0.38 * n.y) + vec3(0.03, 0.07, 0.035) * max(n.y, 0.0) * uCracks;
        // (gold keeps a little of its own colour in the shade)
        fill = mix(fill, vec3(0.1, 0.085, 0.04), goldW * 0.8);
        vec3 warm = orbCol() * att * lit * 2.5 * mix(1.0, ao, 0.7);
        // light that has gone a little way into skin comes out redder at the edge of the shade
        vec3 sss = vec3(1.0, 0.34, 0.12) * att * skinW * smoothstep(0.0, 0.45, wrap) * (1.0 - smoothstep(0.3, 0.95, wrap)) * 0.55 * open;
        vec3 col = alb * (fill * ao * ao * 2.4 + warm + sss);
        // the very edge that is turned toward the orb burns: the line of fire he drew down her profile
        float fres = pow(1.0 - abs(dot(n, V)), 2.4);
        col += vec3(1.0, 0.5, 0.16) * alb * fres * att * clamp(ndl + 0.3, 0.0, 1.0) * 3.4 * ao * open;
        // and on the far side a thread of the cave's green
        col += vec3(0.02, 0.07, 0.055) * fres * clamp(0.35 - ndl, 0.0, 1.0) * ao;
        // hair takes a sheen along its strands, the band a soft one
        {
          vec3 Tg = vec3(uHairDir, 0.0);
          Tg = normalize(Tg - n * dot(Tg, n) + n * (strand - 0.5) * 0.3);
          float th1 = dot(Tg, normalize(Ld + V));
          col += hairW * orbCol() * (alb + 0.02) * att * pow(max(1.0 - th1 * th1, 0.0), 20.0) * 0.5 * clamp(ndl + 0.4, 0.0, 1.0) * ao * (0.5 + strand);
          float nh = max(dot(n, normalize(Ld + V)), 0.0);
          col += goldW * alb * orbCol() * att * (pow(nh, 9.0) * 1.2 + pow(nh, 40.0) * 1.6) * step(0.0, ndl + 0.2);
        }
        // she goes down into the dark of the floor
        float rise = smoothstep(uFloor + 8.0, uFloor + 112.0, vWorld.y + (hatch - 0.5) * 30.0);
        col *= mix(0.05, 1.0, rise * rise);
        col = mix(col, airCol(normalize(vWorld - cameraPosition)), airAmt(vWorld) * 0.34) + orbScatter(vWorld) * 0.42;
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- the crown of rays ----------
// Strands of light from the band, up and back: each a ribbon a hand wide and hundreds of metres long, turned
// about its own length to face the eye, so it is a thread from wherever it is seen and never a card.
export function raysGeometry(h: Her, count: number, seed = 17) {
  const r = rng(seed);
  const U = HER.u;
  const SEG = 14;
  const pos: number[] = [];
  const tan: number[] = [];
  const dat: number[] = [];
  const rnd: number[] = [];
  const idx: number[] = [];
  const b = h.band;
  const back: V3 = [-h.headF[0], -h.headF[1], 0];
  for (let i = 0; i < count; i++) {
    // where on the band it rises: all round, most of them from the brow and the crown of the head
    const a = (r() * 2 - 1) * Math.PI * (0.35 + 0.65 * r());
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const o: V3 = [b.c[0] + b.e1[0] * ca * b.ra * 0.97, b.c[1] + b.e1[1] * ca * b.ra * 0.97, b.c[2] + sa * b.rb * 0.97];
    // which way: up, and the further back on the head the further back it leans; out to the sides a little
    // (a fan that opens as it rises: every strand leans out from the head's own upright, the way it left the band)
    const lean = 0.22 + 0.55 * (0.5 - 0.5 * ca) + (r() - 0.5) * 0.5;
    const side = sa * (0.3 + 0.35 * r()) + (r() - 0.5) * 0.14;
    const out = ca * (0.12 + 0.2 * r());
    let dx = b.n[0] + back[0] * lean + b.e1[0] * out;
    let dy = b.n[1] + back[1] * lean + b.e1[1] * out;
    let dz = side;
    const dl = Math.hypot(dx, dy, dz);
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const len = U * (0.9 + 3.0 * r() * r() + 0.9 * r());
    const curl = (r() - 0.35) * 0.22;
    const w = 0.35 + 0.9 * r() * r();
    const s0 = r();
    const s1 = r();
    const s2 = r();
    const base = pos.length / 3;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      // it bends back a little as it goes, like hair in a slow wind
      const bx = back[0] * curl * t * t * len;
      const by = back[1] * curl * t * t * len - 0.04 * t * t * len * Math.abs(curl);
      const px = o[0] + dx * len * t + bx;
      const py = o[1] + dy * len * t + by;
      const pz = o[2] + dz * len * t;
      const tx = dx + back[0] * curl * 2 * t;
      const ty = dy + back[1] * curl * 2 * t;
      const tl = Math.hypot(tx, ty, dz);
      for (const e of [-1, 1]) {
        pos.push(px, py, pz);
        tan.push(tx / tl, ty / tl, dz / tl);
        dat.push(e, t, w, len);
        rnd.push(s0, s1, s2);
      }
      if (k < SEG) {
        const q = base + k * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aTan", new THREE.Float32BufferAttribute(tan, 3));
  g.setAttribute("aDat", new THREE.Float32BufferAttribute(dat, 4));
  g.setAttribute("aRnd", new THREE.Float32BufferAttribute(rnd, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function makeRaysMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, uPx: { value: 0.001 } },
    vertexShader: /* glsl */ `
      attribute vec3 aTan; attribute vec4 aDat; attribute vec3 aRnd;
      uniform float uTime; uniform float uPx;
      varying float vE; varying float vT; varying float vDim; varying vec3 vRnd; varying vec3 vWorld; varying float vLen;
      void main(){
        vec4 wc = modelMatrix * vec4(position, 1.0);
        // (the whole crown sways the least bit, the far ends most)
        wc.xyz += vec3(sin(uTime * 0.11 + aRnd.x * 6.28), 0.0, cos(uTime * 0.09 + aRnd.y * 6.28)) * aDat.y * aDat.y * 5.0;
        vec3 toEye = cameraPosition - wc.xyz;
        float dist = length(toEye);
        vec3 side = normalize(cross(normalize(mat3(modelMatrix) * aTan), toEye));
        // a strand thins to nothing toward its end; never thinner than a pixel and a third (then it dims instead)
        float w = aDat.z * (1.0 - 0.75 * aDat.y);
        float minW = dist * uPx * 1.3;
        vDim = clamp(w / max(minW, 1e-4), 0.0, 1.0);
        w = max(w, minW);
        wc.xyz += side * aDat.x * w;
        vE = aDat.x; vT = aDat.y; vRnd = aRnd; vWorld = wc.xyz; vLen = aDat.w;
        gl_Position = projectionMatrix * viewMatrix * wc;
      }`,
    fragmentShader: /* glsl */ `
      varying float vE; varying float vT; varying float vDim; varying vec3 vRnd; varying vec3 vWorld; varying float vLen;
      uniform float uOrbK;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float across = exp(-vE * vE * 3.2);
        // out of the band at once, a long slow dying toward the end
        float along = smoothstep(0.0, 0.03, vT) * pow(1.0 - vT, 1.5);
        // a slow shimmer climbing each strand in its own time, and the strand itself never quite even
        float s = vT * vLen;
        float run = 0.62 + 0.38 * sin(s * 0.05 - uTime * (0.5 + 0.5 * vRnd.x) + vRnd.y * 6.28);
        float grain = 0.7 + 0.6 * vnoise(vec2(s * 0.035 + vRnd.z * 40.0, vRnd.x * 17.0));
        // gold, and the picture's yellow-green, and now and then a thread of ember
        vec3 c = vRnd.z < 0.5 ? vec3(1.0, 0.76, 0.3) : vRnd.z < 0.86 ? vec3(0.62, 0.95, 0.38) : vec3(1.0, 0.44, 0.16);
        // (whiter at the root, where it is brightest)
        c = mix(c, vec3(1.0, 0.86, 0.5), 0.2 * (1.0 - smoothstep(0.0, 0.2, vT)));
        float a = across * along * run * grain * vDim * (0.55 + 0.45 * uOrbK) * (1.0 - 0.75 * airAmt(vWorld));
        gl_FragColor = vec4(c * a * 0.2, 1.0);
        ${END}
      }`,
  });
}
