import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, noise2, rng, type V3 } from "../kit";
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
// turned from it keeps the cave's deep teal. The paint is pastel: short strokes laid several ways on a toothed ground.
//
// From the band a crown of rays streams up and back: fine strands of light, each one a long thread that thins
// toward its end and carries a slow shimmer up its length.
// Lengths below are in her own measure (HER.u: her head is about 1.4 of it tall).

const SKIN = 0;
const HAIR = 1;
const LIP = 2;
const GOLD = 3;
const CLOTH = 4;
const SLEEVE = 5;

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
    { col: [0.78, 0.55, 0.16], kind: 3, what: [0, 0, 0, 0], grp: 2 },
    { col: [0.05, 0.128, 0.124], kind: 0, what: [1, 0, 0, 0], grp: 3 },
    { col: [0.058, 0.145, 0.138], kind: 0, what: [0, 1, 0, 0], grp: 4 },
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
  // She wears a robe: over both shoulders, open at the throat, and straight down into the floor. The near arm is
  // in a wide sleeve to the middle of the forearm, and from under the forearm the sleeve falls in a long sheet
  // into the mist; the wrist and the hand are bare.
  const body = new Clay(0.25 * U);
  const ys = Hc[1] - 1.14 * U;
  body.limb([Hc[0] + 0.5 * U, ys - 0.32 * U, Hc[2]], [Hc[0] + 0.72 * U, -70, Hc[2]], 0.52 * U, 0.92 * U, CLOTH, { flat: 1.6, soft: 6 });
  body.ball([Hc[0] + 0.44 * U, ys - 0.16 * U, Hc[2]], rr(0.46, 0.3, 1.04), CLOTH, { soft: 6 });
  for (const s of [-1, 1]) body.ball([Hc[0] + 0.42 * U, ys - 0.24 * U, Hc[2] + s * 0.95 * U], rr(0.35, 0.33, 0.37), CLOTH, { soft: 6 });
  body.limb(F(-0.12, -0.36), neck, 0.24 * U, 0.31 * U, SKIN, { k: 0.16 * U });
  // (the throat and the tops of the shoulders are bare: the robe's edge lies in a wide shallow curve)
  body.ball([Hc[0] + 0.24 * U, ys + 0.03 * U, Hc[2]], rr(0.4, 0.2, 0.7), SKIN, { paint: true, soft: 1.4 });
  // the near arm: down from the shoulder to an elbow held out from her side, the forearm raised to the orb
  const Sh: V3 = [Hc[0] + 0.42 * U, ys - 0.26 * U, Hc[2] + 0.97 * U];
  const El: V3 = [O[0] + 148, 44, Hc[2] + 1.38 * U];
  const Wr: V3 = [O[0] + 43, O[1] - 47.5, O[2] + 8];
  const along = (t: number): V3 => [El[0] + (Wr[0] - El[0]) * t, El[1] + (Wr[1] - El[1]) * t, El[2] + (Wr[2] - El[2]) * t];
  body.limb(Sh, El, 0.3 * U, 0.27 * U, SLEEVE, { k: 0.2 * U, soft: 3 });
  body.limb(El, along(0.76), 0.26 * U, 0.2 * U, SLEEVE, { k: 0.1 * U, soft: 2 });
  body.limb(along(0.3), Wr, 0.17 * U, 0.088 * U, SKIN, { k: 0.05 * U, soft: 1.2 });
  // (the fall of the sleeve: a sheet hanging from under the forearm, thin, longest at the sleeve's mouth)
  for (const t of [0.05, 0.22, 0.39, 0.56, 0.72]) {
    const a = along(t);
    body.limb([a[0], a[1] - 0.1 * U, a[2]], [a[0] + 8 + 30 * (0.72 - t), -55, a[2] + 2 + 8 * t], 0.17 * U, 0.3 * U, SLEEVE, { flat: 0.34, k: 0.24 * U, soft: 3 });
  }
  // (the far arm hangs straight down into the dark, in its sleeve)
  body.limb([Hc[0] + 0.42 * U, ys - 0.26 * U, Hc[2] - 0.97 * U], [Hc[0] + 0.5 * U, -60, Hc[2] - 1.1 * U], 0.3 * U, 0.3 * U, SLEEVE, { k: 0.2 * U, soft: 3 });
  // the folds the cloth hangs in: long, running down her, deeper toward the floor, never two alike
  // (none on the throat, none on the bare forearm and the hand)
  const fax: [number, number] = [Hc[0] + 0.6 * U, Hc[2]];
  const sstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const folds = (x: number, y: number, z: number) => {
    const m = sstep(0.98 * U, 1.3 * U, Math.hypot(x - Hc[0], y - Hc[1], z - Hc[2])) * sstep(58, 92, Math.hypot(x - O[0], y - O[1], z - O[2]));
    if (m <= 0) return 0;
    const th = Math.atan2(z - fax[1], -(x - fax[0]));
    const hem = Math.min(1, Math.max(0, (ys - y) / (1.4 * U)));
    const a = th * 11 + 0.9 * Math.sin(y * 0.012 + th * 2.3) + noise2(th * 3.1 + 7, y * 0.0055) * 3.2;
    const g1 = Math.pow(1 - Math.abs(Math.sin(a)), 2.2);
    const g2 = Math.pow(1 - Math.abs(Math.sin(a * 0.47 + 1.7 + noise2(th * 1.3, y * 0.005) * 2.6)), 2);
    const cr = noise2(x * 0.045 + z * 0.03, y * 0.036 + z * 0.02) - 0.5;
    return (g1 * (0.4 + 0.6 * hem) + g2 * (0.7 + 1.2 * hem) + cr * 0.6) * 3.1 * m;
  };

  // ---- the hand ----
  // Open under the orb, bearing it as lightly as it can be borne: a narrow palm beneath, the heel of the hand
  // toward her, and four long slender fingers going on under it and up, spread like the petals of a lily, each
  // with its three joints, leaving the orb a little at the tips; the thumb lies up round the side the plane comes
  // from, and stays well under the way in.
  const hand = new Clay(0.02 * U);
  const on = (az: number, pol: number, out: number): V3 => {
    const a = (az * Math.PI) / 180;
    const p = (pol * Math.PI) / 180;
    const r = ORB.r + out;
    return [O[0] - Math.sin(p) * Math.cos(a) * r, O[1] - Math.cos(p) * r, O[2] + Math.sin(p) * Math.sin(a) * r];
  };
  const finger = (pts: V3[], r0: number, tip: number) => {
    const n = pts.length;
    const rad = pts.map((_, i) => r0 * (1 - (1 - tip) * Math.pow(i / (n - 1), 0.85)));
    hand.chain(pts, rad, SKIN, { k: 0.016 * U });
    // and a small round pad at the tip
    hand.ball(pts[n - 1], rad[n - 1] * 1.05, SKIN, { k: 0.01 * U });
  };
  hand.limb(Wr, [O[0] + 24, O[1] - ORB.r - 6.2, O[2] + 3.5], 0.088 * U, 0.07 * U, SKIN, { k: 0.07 * U, flat: 1.25 });
  hand.ball([O[0] + 8, O[1] - ORB.r - 4.6, O[2] + 1], [19, 4.3, 15], SKIN, { k: 0.06 * U });
  [-47, -18, 9, 34].forEach((az, i) => {
    const len = [0.8, 0.95, 1.0, 0.93][i];
    // (the bones of the hand run on from the wrist to each knuckle, under the skin of its back)
    hand.limb([O[0] + 20, O[1] - ORB.r - 5.6, O[2] + 2 + az * 0.12], on(az, 13, 2.7), 3.0, 2.6, SKIN, { k: 0.035 * U });
    finger([on(az, 13, 2.7), on(az, 13 + 26 * len, 2.5), on(az * 1.03, 13 + 46 * len, 2.9), on(az * 1.05, 13 + 60 * len, 4.0), on(az * 1.06, 13 + 69 * len, 5.8)], 2.55, 0.5);
  });
  finger([on(150, 26, 3.4), on(122, 27, 3.0), on(96, 31, 3.0), on(76, 36.5, 3.6), on(64, 41, 4.6)], 3.2, 0.52);

  const parts = [
    yield* body.meshSteps(1.15 * v, paints, undefined, budget, far ? {} : { detail: folds, band: 8.5 }),
    yield* head.meshSteps(0.5 * v, paints, undefined, budget),
    yield* hand.meshSteps(0.28 * v, paints, undefined, budget),
  ];
  if (process.env.NODE_ENV !== "production") console.info(`[friendship] her${far ? " (far)" : ""}, triangles: body ${Math.round(parts[0].index!.count / 3)}, head ${Math.round(parts[1].index!.count / 3)}, hand ${Math.round(parts[2].index!.count / 3)}`);
  // (how open each point lies is reckoned point by point, and comes out grainy: it is run together over the skin,
  // so it shades a fold or the hollow of a hand and never speckles a cheek)
  for (const g of parts) {
    const ao = g.attributes.aAO.array as Float32Array;
    const ix = g.index!.array;
    const sum = new Float32Array(ao.length);
    const cnt = new Float32Array(ao.length);
    for (let it = 0; it < 14; it++) {
      sum.fill(0);
      cnt.fill(0);
      for (let i = 0; i < ix.length; i += 3)
        for (let e = 0; e < 3; e++) {
          const a = ix[i + e];
          const b = ix[i + ((e + 1) % 3)];
          sum[a] += ao[b];
          cnt[a]++;
          sum[b] += ao[a];
          cnt[b]++;
        }
      for (let i = 0; i < ao.length; i++) if (cnt[i] > 0) ao[i] = ao[i] * 0.4 + (sum[i] / cnt[i]) * 0.6;
    }
  }
  // (the folds are worked into the clay near its skin, which leaves the clay's own slopes rough there: the cloth
  // takes its facing from the skin itself)
  if (!far) parts[0].computeVertexNormals();
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
      col.set([paints[GOLD].col[0], paints[GOLD].col[1], paints[GOLD].col[2], 3], i * 4);
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
        float clothW = clamp(vWhat.x + vWhat.y, 0.0, 1.0); float skinW = vWhat.z; float hairW = vWhat.w;
        float goldW = smoothstep(2.0, 2.8, vCol.a);
        vec3 alb = vCol.rgb;
        float wf = length(fwidth(vObj));
        float fine = 1.0 - smoothstep(0.25, 1.1, wf);
        // Pastel. The strokes are short and laid three ways, and which of the three has the upper hand changes slowly
        // from place to place: so no two hand's-breadths of her are hatched alike and nothing runs in stripes. (Three
        // fixed ways, weighed: turning one set of strokes by an angle that itself wanders draws rings.) Under them,
        // the tooth of the ground. On cloth they keep nearer to the fall of it.
        // (the finest of it is kept off her skin: at her size it would be pores, not pastel)
        float fineK = fine * mix(1.0, 0.3, skinW) * mix(1.0, 0.5, clothW);
        vec2 q0 = vec2(vObj.x + vObj.z * 0.62, vObj.y + vObj.z * 0.21);
        vec3 ang = mix(vec3(-0.62, 0.3, 1.15), vec3(-0.28, 0.08, 0.42), clothW);
        vec3 wS = vec3(vnoise(vObj.xy * 0.013 + vObj.z * 0.009), vnoise(vObj.xy * 0.013 + vObj.z * 0.009 + 17.0), vnoise(vObj.zy * 0.015 + vObj.x * 0.008 + 31.0));
        wS = wS * wS * wS + 0.02; wS /= wS.x + wS.y + wS.z;
        float stroke = 0.0;
        for (int k = 0; k < 3; k++) {
          float a = k == 0 ? ang.x : k == 1 ? ang.y : ang.z;
          float w = k == 0 ? wS.x : k == 1 ? wS.y : wS.z;
          float ca = cos(a); float sa = sin(a);
          vec2 r = vec2(ca * q0.x - sa * q0.y, sa * q0.x + ca * q0.y) + float(k) * 37.0;
          float broad = vnoise(vec2(r.x * 0.4, r.y * 0.075));
          float thin = vnoise(vec2(r.x * 1.25 + 2.0, r.y * 0.22 + 7.0));
          stroke += w * mix(broad, broad * 0.62 + thin * 0.38, fineK);
        }
        float tooth = vnoise(vObj.xy * 0.45 + vObj.z * 0.32) * 0.65 + vnoise(vObj.xy * 1.2 - vObj.z * 0.8) * 0.35;
        // (and the colour itself wanders: broad soft patches, warmer here, cooler there)
        float tone1 = vnoise(vObj.xy * 0.017 + vObj.z * 0.012 + 11.0);
        float tone2 = vnoise(vObj.zy * 0.026 + vObj.x * 0.019 + 5.0);
        // skin: ochre going to rose and to olive, the strokes quiet
        vec3 skin = alb * mix(vec3(1.08, 0.96, 0.84), vec3(0.93, 1.02, 1.05), tone1) * mix(1.0, 1.08, tone2);
        skin *= 1.0 + (stroke - 0.5) * 0.26 + (tooth - 0.5) * 0.05 * fine;
        // cloth: deep teal with umber worked into it, the strokes plain to see
        vec3 cloth = mix(alb, vec3(0.085, 0.052, 0.03), smoothstep(0.4, 0.75, tone2) * 0.62);
        cloth = mix(cloth, cloth * vec3(0.7, 1.25, 1.35), smoothstep(0.55, 0.85, tone1) * 0.5);
        cloth *= 1.0 + (stroke - 0.5) * 0.7 + (tooth - 0.5) * 0.12 * fine;
        alb = mix(mix(alb * (1.0 + (stroke - 0.5) * 0.14), skin, skinW), cloth, clothW);
        float height = stroke * mix(0.06, 0.22, clothW) + tooth * mix(0.01, 0.04, clothW) * fine;
        // the robe is edged with gold wherever it ends against her skin: at the throat, at the sleeve's mouth
        float seam = clothW * skinW * 4.0;
        float edge = smoothstep(0.45, 0.85, seam);
        float thread = 0.75 + 0.5 * vnoise(vObj.xy * 0.9 + vObj.z * 0.7);
        alb = mix(alb, vec3(0.8, 0.55, 0.15) * thread, edge);
        goldW = max(goldW, edge);
        height += edge * 0.5;
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
        alb *= 1.0 + step(2.5, vCol.a) * (vnoise(vObj.xy * 0.5 + vObj.z * 0.4) - 0.5) * 0.5;
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
          // the socket lies in its own soft shade under the brow; blood in the cheek and the lips
          float socket = (1.0 - smoothstep(0.02, 0.09, abs(fb + 0.04))) * smoothstep(0.06, 0.12, es) * (1.0 - smoothstep(0.32, 0.4, es));
          alb *= 1.0 - skinW * front * socket * 0.2;
          float cheek = 1.0 - smoothstep(0.08, 0.26, length(vec2(fb + 0.24, (es - 0.33) * 0.8)));
          alb = mix(alb, alb * vec3(1.14, 0.84, 0.78), skinW * front * cheek * 0.45);
          alb = mix(alb, vec3(0.09, 0.05, 0.035), drawn * 0.7);
        }
        n = bumpN(n, vWorld, height, 1.0);

        // the orb, and how near it is
        vec3 Lv = uOrb - vWorld; float d = length(Lv); vec3 Ld = Lv / max(d, 0.001);
        float ndl = dot(n, Ld);
        float att = uOrbK / (1.0 + pow(max(d - 20.0, 0.0) / 250.0, 2.0));
        float ao = mix(1.0, vAO, mix(0.5, 0.2, skinW));
        float wk = mix(0.25, 0.32, skinW);
        float wrap = clamp((ndl + wk) / (1.0 + wk), 0.0, 1.0);
        // (she stands in her own light: what lies behind the line of her shoulders has none of it)
        float open = 1.0 - smoothstep(-0.05, 0.75, dot(vObj - uChest, -uHeadF) / uU) * (1.0 - smoothstep(0.2, 1.3, abs(vObj.z - uChest.z) / uU - 0.2));
        // (painted cloth is flat: it takes the light evenly across a fall, and its roundness is left to the folds)
        float lit = mix(wrap * wrap, 0.14 + 0.62 * wrap, 0.55 * clothW) * open;
        // the cave's own colour on whatever is turned from the light: deep teal, a little of the green from the vault
        vec3 fill = vec3(0.035, 0.115, 0.105) * (0.62 + 0.38 * n.y) + vec3(0.03, 0.07, 0.035) * max(n.y, 0.0) * uCracks;
        // (gold keeps a little of its own colour in the shade, and skin near the orb a little of its warmth)
        fill = mix(fill, vec3(0.1, 0.085, 0.04), goldW * 0.8);
        fill += vec3(0.07, 0.026, 0.012) * skinW * min(att, 1.2) * att;
        vec3 warm = orbCol() * att * lit * mix(2.5, 3.6, clothW) * mix(1.0, ao, mix(0.7, 1.0, clothW));
        // light that has gone a little way into skin comes out redder at the edge of the shade
        vec3 sss = vec3(1.0, 0.34, 0.12) * att * skinW * smoothstep(0.0, 0.45, wrap) * (1.0 - smoothstep(0.3, 0.95, wrap)) * 0.6 * open;
        // and thin things let it through: the fingers, the wing of the nose, an ear glow from within where the
        // light stands behind them
        float fres = pow(1.0 - abs(dot(n, V)), 2.4);
        sss += vec3(1.0, 0.3, 0.1) * skinW * att * att * pow(1.0 - abs(dot(n, V)), 1.5) * (1.0 - smoothstep(-0.25, 0.55, ndl)) * 0.85;
        vec3 col = alb * (fill * ao * ao * 2.4 + warm + sss);
        // the very edge that is turned toward the orb burns: the line of fire he drew down her profile
        col += vec3(1.0, 0.5, 0.16) * alb * fres * att * clamp(ndl + 0.3, 0.0, 1.0) * mix(3.4, 2.2, clothW) * ao * open;
        // and on the far side a thread of the cave's green
        col += vec3(0.02, 0.07, 0.055) * fres * clamp(0.35 - ndl, 0.0, 1.0) * ao;
        // hair takes a sheen along its strands, gold a soft one
        {
          vec3 Tg = vec3(uHairDir, 0.0);
          Tg = normalize(Tg - n * dot(Tg, n) + n * (strand - 0.5) * 0.3);
          float th1 = dot(Tg, normalize(Ld + V));
          col += hairW * orbCol() * (alb + 0.02) * att * pow(max(1.0 - th1 * th1, 0.0), 20.0) * 0.5 * clamp(ndl + 0.4, 0.0, 1.0) * ao * (0.5 + strand);
          float nh = max(dot(n, normalize(Ld + V)), 0.0);
          col += goldW * alb * orbCol() * att * (pow(nh, 9.0) * 1.2 + pow(nh, 40.0) * 1.6) * step(0.0, ndl + 0.2);
        }
        // she goes down into the dark of the floor, unevenly, as mist takes a thing
        float low = vnoise(vObj.xz * 0.018 + 3.0) * 0.6 + vnoise(vObj.xy * 0.027 + vObj.z * 0.02) * 0.4;
        float rise = smoothstep(uFloor + 4.0, uFloor + 104.0, vWorld.y + (low - 0.5) * 34.0);
        col *= mix(0.05, 1.0, rise * rise);
        col = mix(col, airCol(normalize(vWorld - cameraPosition)), airAmt(vWorld) * 0.34) + orbScatter(vWorld) * 0.42;
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- the crown of rays ----------
// Strands of light from the band, up into the whole height of the cavern: each one a ribbon a hand wide and
// hundreds of metres long, turned about its own length to face the eye, so it is a thread from wherever it is seen
// and never a card. They open as they rise like a fan, and fall outward a little at their ends; some drift in a
// slow spiral; all of them sway in the cave's slow air, the far ends most, and thin to nothing in the haze. Small
// lights travel up them.
type Strand = { o: V3; d: V3; out: V3; len: number; bend: number; hel: number; w: number; s: V3 };
function strands(h: Her, count: number, seed: number): Strand[] {
  const r = rng(seed);
  const U = HER.u;
  const b = h.band;
  const back: V3 = [-h.headF[0], -h.headF[1], 0];
  const list: Strand[] = [];
  for (let i = 0; i < count; i++) {
    // where on the band it rises: all round, most of them from the brow and the crown of the head
    const a = (r() * 2 - 1) * Math.PI * (0.35 + 0.65 * r());
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const o: V3 = [b.c[0] + b.e1[0] * ca * b.ra * 0.97, b.c[1] + b.e1[1] * ca * b.ra * 0.97, b.c[2] + sa * b.rb * 0.97];
    // which way: up, leaning out from the head's own upright the way it left the band, and back
    const lean = 0.22 + 0.7 * (0.5 - 0.5 * ca) + (r() - 0.5) * 0.7;
    const side = sa * (0.4 + 0.7 * r()) + (r() - 0.5) * 0.3;
    const fwd = ca * (0.16 + 0.34 * r());
    let dx = b.n[0] + back[0] * lean + b.e1[0] * fwd;
    let dy = b.n[1] + back[1] * lean + b.e1[1] * fwd;
    let dz = side;
    const dl = Math.hypot(dx, dy, dz);
    dx /= dl;
    dy /= dl;
    dz /= dl;
    // which way it falls as it goes: outward, the way it was already leaning, and down a little
    let ox = dx - b.n[0] * (dx * b.n[0] + dy * b.n[1]);
    let oy = dy - b.n[1] * (dx * b.n[0] + dy * b.n[1]) - 0.25;
    let oz = dz;
    const ol = Math.hypot(ox, oy, oz) || 1;
    ox /= ol;
    oy /= ol;
    oz /= ol;
    const long = r();
    list.push({
      o,
      d: [dx, dy, dz],
      out: [ox, oy, oz],
      len: U * (2.6 + 5.2 * long + 1.2 * r()),
      bend: 0.03 + 0.2 * r() * r(),
      // (one in five wanders)
      hel: r() < 0.2 ? 7 + 16 * r() : 1.5 * r(),
      w: 0.5 + 1.2 * r() * r(),
      s: [r(), r(), r()],
    });
  }
  return list;
}

// where a strand is at t along it, at a time (the ribbon and the lights that climb it are both laid on this)
const GLSL_STRAND = /* glsl */ `
vec3 strandAt(vec3 o, vec3 d, vec3 outw, vec4 P, float seed, float t, float time){
  float len = P.x;
  vec3 p = o + d * len * t + outw * P.y * t * t * len;
  vec3 n1 = normalize(cross(d, vec3(0.0, 0.0, 1.0)) + vec3(1e-4, 0.0, 0.0)); vec3 n2 = cross(d, n1);
  float ph = seed * 6.2832;
  float a = t * (4.0 + 6.0 * fract(seed * 7.13)) + ph - time * 0.06;
  p += (n1 * cos(a) + n2 * sin(a)) * P.z * pow(t, 1.4);
  float sw = pow(t, 1.6) * len * 0.034;
  p += vec3(sin(time * 0.13 + ph + t * 2.4), 0.3 * sin(time * 0.09 + ph * 1.7 + t * 1.3), cos(time * 0.1 + ph * 0.6 + t * 1.9)) * sw;
  return p;
}
`;

export function raysGeometry(h: Her, count: number, seed = 17) {
  const SEG = 26;
  const pos: number[] = [];
  const dir: number[] = [];
  const out: number[] = [];
  const par: number[] = [];
  const dat: number[] = [];
  const rnd: number[] = [];
  const idx: number[] = [];
  for (const s of strands(h, count, seed)) {
    const base = pos.length / 3;
    for (let k = 0; k <= SEG; k++) {
      // (more of the knots near the root, where it bends least but is seen closest)
      const t = Math.pow(k / SEG, 1.15);
      for (const e of [-1, 1]) {
        pos.push(...s.o);
        dir.push(...s.d);
        out.push(...s.out);
        par.push(s.len, s.bend, s.hel, s.w);
        dat.push(e, t);
        rnd.push(...s.s);
      }
      if (k < SEG) {
        const q = base + k * 2;
        idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aDir", new THREE.Float32BufferAttribute(dir, 3));
  g.setAttribute("aOut", new THREE.Float32BufferAttribute(out, 3));
  g.setAttribute("aPar", new THREE.Float32BufferAttribute(par, 4));
  g.setAttribute("aDat", new THREE.Float32BufferAttribute(dat, 2));
  g.setAttribute("aRnd", new THREE.Float32BufferAttribute(rnd, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(h.headC[0] + 60, h.headC[1] + 240, h.headC[2]), 760);
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
      attribute vec3 aDir; attribute vec3 aOut; attribute vec4 aPar; attribute vec2 aDat; attribute vec3 aRnd;
      uniform float uTime; uniform float uPx;
      varying float vE; varying float vT; varying float vDim; varying vec3 vRnd; varying vec3 vWorld; varying float vLen; varying float vWide;
      ${GLSL_STRAND}
      void main(){
        float t = aDat.y;
        vec3 p = strandAt(position, aDir, aOut, aPar, aRnd.x, t, uTime);
        vec3 p2 = strandAt(position, aDir, aOut, aPar, aRnd.x, t + 0.02, uTime);
        vec3 wc = (modelMatrix * vec4(p, 1.0)).xyz;
        vec3 tg = normalize(mat3(modelMatrix) * (p2 - p));
        vec3 toEye = cameraPosition - wc;
        float dist = length(toEye);
        vec3 side = normalize(cross(tg, toEye));
        // a strand thins to nothing toward its end; never thinner than a pixel and a third (then it dims instead).
        // The ribbon itself is three times the thread: the rest of it is the thread's own soft glow.
        float w = aPar.w * (1.0 - 0.7 * t);
        float minW = dist * uPx * 1.3;
        vDim = clamp(w / max(minW, 1e-4), 0.0, 1.0);
        float core = max(w, minW);
        vWide = clamp((w * 3.0) / core, 1.0, 3.0);
        wc += side * aDat.x * core * vWide;
        vE = aDat.x; vT = t; vRnd = aRnd; vWorld = wc; vLen = aPar.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(wc, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vE; varying float vT; varying float vDim; varying vec3 vRnd; varying vec3 vWorld; varying float vLen; varying float vWide;
      uniform float uOrbK;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float e = vE * vWide;
        float across = exp(-e * e * 3.2) + 0.16 * exp(-vE * vE * 2.4) * step(1.05, vWide);
        // out of the band at once, a long slow dying toward the end
        float along = smoothstep(0.0, 0.02, vT) * pow(1.0 - vT, 1.25) * (0.45 + 0.55 * exp(-vT * 3.0));
        float s = vT * vLen;
        // a slow shimmer climbing each strand in its own time, and the strand itself never quite even
        float run = 0.6 + 0.4 * sin(s * 0.03 - uTime * (0.45 + 0.5 * vRnd.x) + vRnd.y * 6.28);
        float grain = 0.65 + 0.7 * vnoise(vec2(s * 0.03 + vRnd.z * 40.0, vRnd.x * 17.0));
        // small lights travel up it, one after another
        float bead = pow(0.5 + 0.5 * sin(s * 0.055 - uTime * (0.9 + 0.8 * vRnd.y) + vRnd.z * 6.28), 40.0);
        // gold, and the picture's yellow-green, and now and then a thread of ember
        vec3 c = vRnd.z < 0.5 ? vec3(1.0, 0.76, 0.3) : vRnd.z < 0.86 ? vec3(0.62, 0.95, 0.38) : vec3(1.0, 0.44, 0.16);
        c = mix(c, vec3(1.0, 0.86, 0.5), 0.2 * (1.0 - smoothstep(0.0, 0.12, vT)));
        float a = across * along * (run * grain + bead * 2.6 * (1.0 - vT)) * vDim * (0.55 + 0.45 * uOrbK) * (1.0 - 0.6 * airAmt(vWorld));
        gl_FragColor = vec4(c * a * 0.26, 1.0);
        ${END}
      }`,
  });
}

// The lights that climb the strands: each belongs to one strand and goes up it again and again, fading in above
// the band and out before the strand's end. Larger than the thread they ride, soft, never hard points.
export function rayMotesGeometry(h: Her, count: number, n: number, seed = 17) {
  const list = strands(h, count, seed);
  const r = rng(seed + 5);
  const base = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.attributes.position);
  const o = new Float32Array(n * 3);
  const d = new Float32Array(n * 3);
  const out = new Float32Array(n * 3);
  const par = new Float32Array(n * 4);
  const mo = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = list[Math.floor(r() * list.length)];
    o.set(s.o, i * 3);
    d.set(s.d, i * 3);
    out.set(s.out, i * 3);
    par.set([s.len, s.bend, s.hel, s.s[0]], i * 4);
    // where it starts, how fast it climbs (metres a second), how large it is, its own time
    mo.set([r(), 7 + 16 * r(), 0.7 + 1.5 * r() * r(), r()], i * 4);
  }
  g.setAttribute("aO", new THREE.InstancedBufferAttribute(o, 3));
  g.setAttribute("aDir", new THREE.InstancedBufferAttribute(d, 3));
  g.setAttribute("aOut", new THREE.InstancedBufferAttribute(out, 3));
  g.setAttribute("aPar", new THREE.InstancedBufferAttribute(par, 4));
  g.setAttribute("aMo", new THREE.InstancedBufferAttribute(mo, 4));
  g.instanceCount = n;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(h.headC[0] + 60, h.headC[1] + 240, h.headC[2]), 760);
  return g;
}

export function makeRayMotesMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, uPx: { value: 0.001 } },
    vertexShader: /* glsl */ `
      attribute vec3 aO; attribute vec3 aDir; attribute vec3 aOut; attribute vec4 aPar; attribute vec4 aMo;
      uniform float uTime; uniform float uPx; uniform float uOrbK;
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vWorld;
      ${GLSL_STRAND}
      void main(){
        float t = fract(aMo.x + uTime * aMo.y / aPar.x);
        vec3 p = strandAt(aO, aDir, aOut, vec4(aPar.xyz, 0.0), aPar.w, t, uTime);
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        float size = aMo.z;
        float minS = dist * uPx * 1.6;
        float dim = clamp(size / max(minS, 1e-4), 0.0, 1.0);
        size = max(size, minS);
        mv.xy += position.xy * size;
        vUv = position.xy;
        float life = smoothstep(0.0, 0.06, t) * pow(1.0 - t, 1.4);
        vA = dim * dim * life * (0.7 + 0.3 * sin(uTime * (1.1 + aMo.w) + aMo.w * 40.0)) * (0.55 + 0.45 * uOrbK);
        vCol = aMo.w < 0.6 ? vec3(1.0, 0.8, 0.38) : vec3(0.7, 0.98, 0.45);
        vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vA; varying vec3 vCol; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float r = length(vUv);
        float a = (exp(-r * r * 9.0) + 0.25 * exp(-r * r * 2.5)) * (1.0 - smoothstep(0.75, 1.0, r)) * vA;
        a *= 1.0 - 0.8 * airAmt(vWorld);
        gl_FragColor = vec4(vCol * a * 0.9, 1.0);
        ${END}
      }`,
  });
}
