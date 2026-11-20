import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noise2, type V3 } from "../kit";
import { Clay, type Paint } from "../sculpt";
import { KINGS, ORIGIN } from "../voyage";
import { BY, GLSL_END, GLSL_KINGS, KINGS_UNIFORMS, R } from "./light";

// The two kings, each built up in clay the size of a hill, from his painting.
//
// Seen from the aisle the pale king stands in profile on the left, facing right: an old, long face under a
// crown of thin red-gold spikes, the brow heavy, the nose long and straight, the eyes closed on what he
// holds; ochre-grey hair in one great fall over the back of the neck, the shoulder and the arm, a pale beard
// down to the forearm; a robe of grey-green cloth with long wavy lines and small dark flowers worked into
// it, the wide sleeve reaching under the dome, a paler cuff, the hand open beneath it. The dark king on the
// right is taller and bowed deeper, his broad face almost in shade, dark hair hanging straight past it, a
// wide yellow-gold crown tipped forward; his robe is nearly black, its sleeve and front banded with ember
// stitching, and his hands rest on the dome's rim.
//
// Cloth is cloth: the folds are in the clay itself (they catch the light and hold shade), the weave and the
// stitching are raised on it, and nothing on them shines by itself. They breathe, very slowly, and the
// heads shift a little.
// Lengths below are in dome radii, heights from the dome's base.

const ROBE = 0;
const SLEEVE = 1;
const CUFF = 2;
const SKIN = 3;
const HAIR = 4;
const LINE = 5;
const BEARD = 6;
const LIP = 7;
const SHIRT = 8;

export type King = {
  geo: THREE.BufferGeometry;
  crown: THREE.BufferGeometry;
  side: -1 | 1;
  neck: V3;
  headDir: V3;
  chest: V3;
  axis: [number, number];
  crownC: V3;
  crownUp: V3;
  headC: V3;
  headF: V3;
  hairDir: [number, number];
};

const M4 = new THREE.Matrix4();
function prim(g: THREE.BufferGeometry, p: THREE.Vector3, col: V3, kind: number, o: { quat?: THREE.Quaternion; scale?: V3; top?: V3 } = {}) {
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y;
  const y1 = Math.max(y0 + 1e-3, g.boundingBox!.max.y);
  const c = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = o.top ? (pos.getY(i) - y0) / (y1 - y0) : 0;
    const e = o.top ?? col;
    c.set([col[0] + (e[0] - col[0]) * t, col[1] + (e[1] - col[1]) * t, col[2] + (e[2] - col[2]) * t, kind], i * 4);
  }
  g.setAttribute("aCol", new THREE.BufferAttribute(c, 4));
  g.deleteAttribute("uv");
  g.applyMatrix4(M4.compose(p, o.quat ?? new THREE.Quaternion(), new THREE.Vector3(...(o.scale ?? [1, 1, 1]))));
  return g;
}

export function* kingSteps(side: -1 | 1, coarse: boolean, budget: number): Generator<void, King, void> {
  const pale = side < 0;
  const by = BY;
  const P = (d: number, h: number, w = 0): V3 => [side * d * R, by + h * R, KINGS.z + w * R];
  const sk: [number, number, number, number] = [0, 0, 1, 0];
  const hr: [number, number, number, number] = [0, 0, 0, 1];
  const paints: Paint[] = pale
    ? [
        { col: [0.066, 0.142, 0.138], kind: 0, what: [1, 0, 0, 0], grp: 0 },
        { col: [0.09, 0.196, 0.19], kind: 0, what: [0, 1, 0, 0], grp: 1 },
        { col: [0.2, 0.39, 0.37], kind: 0.9, what: [0, 1, 0, 0], grp: 1 },
        { col: [0.56, 0.31, 0.2], kind: 1, what: sk, grp: 2 },
        { col: [0.34, 0.25, 0.14], kind: 1, what: hr, grp: 3 },
        { col: [0.1, 0.045, 0.03], kind: 1, what: sk, grp: 2 },
        { col: [0.5, 0.45, 0.36], kind: 1, what: hr, grp: 3 },
        { col: [0.4, 0.16, 0.11], kind: 1, what: sk, grp: 2 },
        { col: [0.4, 0.4, 0.35], kind: 1, what: [1, 0, 0, 0], grp: 0 },
      ]
    : [
        { col: [0.046, 0.028, 0.024], kind: 0, what: [1, 0, 0, 0], grp: 0 },
        { col: [0.066, 0.034, 0.026], kind: 0, what: [0, 1, 0, 0], grp: 1 },
        { col: [0.26, 0.11, 0.035], kind: 0.2, what: [0, 1, 0, 0], grp: 1 },
        { col: [0.36, 0.185, 0.115], kind: 1, what: sk, grp: 2 },
        { col: [0.038, 0.026, 0.023], kind: 1, what: hr, grp: 3 },
        { col: [0.05, 0.022, 0.015], kind: 1, what: sk, grp: 2 },
        { col: [0.05, 0.032, 0.026], kind: 1, what: hr, grp: 3 },
        { col: [0.24, 0.1, 0.07], kind: 1, what: sk, grp: 2 },
        { col: [0.2, 0.085, 0.03], kind: 0.3, what: [1, 0, 0, 0], grp: 0 },
      ];
  // the head: bowed, the pale king's by a third of a right angle, the dark king's by nearly two
  const tau = pale ? 0.6 : 0.98;
  const f: V3 = [-side * Math.cos(tau), -Math.sin(tau), 0];
  const up: V3 = [-side * Math.sin(tau), Math.cos(tau), 0];
  const Hc = P(pale ? 1.92 : 1.66, pale ? 2.5 : 2.9);
  const F = (a: number, b: number, w = 0): V3 => [Hc[0] + (f[0] * a + up[0] * b) * R, Hc[1] + (f[1] * a + up[1] * b) * R, Hc[2] + w * R];
  const rr = (x: number, y: number, z: number): V3 => [x * R, y * R, z * R];
  const ax = { x: f, y: up };
  const v = coarse ? 1.5 : 1;

  // ---- the body: robe, shoulders, arms ----
  // The pale king is bent far forward: his crowned head is the highest of him and his back slopes away behind it.
  // The dark king stands more upright, his shoulders as high as his head, and only the head is bowed.
  const body = new Clay(0.28 * R);
  const neck: V3 = pale ? P(2.62, 2.12) : P(2.78, 3.02);
  if (pale) {
    body.limb(P(4.05, -2.7), P(3.72, 0.0), 1.72 * R, 1.36 * R, ROBE, { flat: 1.12, soft: 3, s0: 0 });
    body.limb(P(3.72, 0.0), P(2.98, 1.52), 1.36 * R, 1.0 * R, ROBE, { flat: 1.2, soft: 3, s0: 2.7 * R });
    body.ball(P(2.86, 1.72), rr(0.86, 0.68, 1.42), ROBE, { soft: 3, s0: 3.9 * R });
    body.limb(P(2.7, -0.55), P(1.95, -2.7), 0.9 * R, 1.2 * R, ROBE, { flat: 1.3, soft: 3, s0: 0 });
    // the shirt at his breast, under the beard
    body.ball(P(2.06, 1.2), rr(0.34, 0.6, 0.6), SHIRT, { paint: true, soft: 3 });
  } else {
    body.limb(P(4.1, -2.7), P(3.88, 0.6), 1.78 * R, 1.42 * R, ROBE, { flat: 1.12, soft: 3, s0: 0 });
    body.limb(P(3.88, 0.6), P(3.32, 2.46), 1.42 * R, 1.06 * R, ROBE, { flat: 1.2, soft: 3, s0: 3.3 * R });
    body.ball(P(3.16, 2.74), rr(0.92, 0.72, 1.48), ROBE, { soft: 3, s0: 4.9 * R });
    body.limb(P(3.0, -0.3), P(2.25, -2.7), 0.9 * R, 1.25 * R, ROBE, { flat: 1.3, soft: 3, s0: 0 });
    // a collar worked in gold thread
    body.ball(P(2.72, 2.86), rr(0.5, 0.26, 0.9), SHIRT, { paint: true, soft: 2.4 });
  }
  for (const s of [-1, 1]) {
    if (pale) {
      // down from the shoulder, then level under the dome: the wide sleeve, hanging full beneath the forearm, a paler cuff at the wrist
      body.chain([P(2.82, 1.72, s * 1.22), P(3.22, 0.3, s * 1.46), P(1.32, -0.2, s * 0.62)], [0.56 * R, 0.55 * R, 0.45 * R], SLEEVE, { k: 0.2 * R, soft: 2 });
      body.limb(P(3.0, -0.12, s * 1.36), P(1.9, -0.5, s * 0.86), 0.44 * R, 0.36 * R, SLEEVE, { k: 0.2 * R, soft: 2, s0: 1.7 * R });
      body.ball(P(1.48, -0.19, s * 0.66), rr(0.26, 0.6, 0.6), CUFF, { paint: true, soft: 1.4 });
    } else {
      // from the high shoulder down and in to the rim of the dome
      body.chain([P(3.16, 2.72, s * 1.3), P(3.78, 1.05, s * 1.54), P(1.98, 0.3, s * 0.8)], [0.58 * R, 0.56 * R, 0.4 * R], SLEEVE, { k: 0.2 * R, soft: 2 });
      body.limb(P(3.5, 0.58, s * 1.42), P(2.5, 0.1, s * 1.0), 0.42 * R, 0.34 * R, SLEEVE, { k: 0.2 * R, soft: 2, s0: 2.1 * R });
      body.ball(P(2.08, 0.34, s * 0.84), rr(0.16, 0.5, 0.5), CUFF, { paint: true, soft: 1.2, x: [-0.93 * side, -0.37, 0] });
    }
  }
  // the neck, out from the collar toward the head
  body.limb(neck, F(-0.14, -0.34), 0.46 * R, 0.4 * R, pale ? HAIR : SKIN, { k: 0.12 * R, soft: 1.5 });
  // the folds the cloth hangs in: long, running down the figure, deeper toward the hem, never two alike
  const axis: [number, number] = [side * (pale ? 3.7 : 3.85) * R, KINGS.z];
  const folds = (x: number, y: number, z: number) => {
    const th = Math.atan2(z - axis[1], -side * (x - axis[0]));
    const hem = Math.min(1, Math.max(0, (by + 1.2 * R - y) / (3.6 * R)));
    const a = th * 14.5 + 0.9 * Math.sin(y * 0.043 + th * 2.3) + noise2(th * 3.1 + 7, y * 0.021) * 3.2;
    const g1 = Math.pow(1 - Math.abs(Math.sin(a)), 2.2);
    const g2 = Math.pow(1 - Math.abs(Math.sin(a * 0.47 + 1.7 + noise2(th * 1.3, y * 0.012) * 2.6)), 2);
    // (and the least crumple everywhere, so no stretch of it is smooth as a shell)
    const cr = noise2(x * 0.11 + z * 0.07, y * 0.09 + z * 0.05) - 0.5;
    return g1 * (0.45 + 1.5 * hem) + g2 * (0.5 + 1.9 * hem) + cr * 0.7;
  };

  // ---- the head ----
  // (F is in the head's own measure: forward, up, sideways.) He drew them plainly, like faces on an icon: a long
  // flat cheek, the brow a shelf with shade under it, the nose one straight blade, the mouth a line. So the clay is
  // kept to those planes, and the lines themselves (the lashes of the closed eyes, the mouth, the fold beside it)
  // are drawn on it afterwards with the point of a brush, in the material.
  const head = new Clay(0.08 * R);
  const g = pale ? 1 : 0; // the pale king is gaunt; the dark king's face is broad and heavy
  head.ball(F(-0.06, 0.12), rr(0.5, 0.52, 0.45), SKIN, { ...ax, k: 0.1 * R });
  head.ball(F(0.14, -0.2), rr(0.36, 0.46, 0.3 + 0.04 * (1 - g)), SKIN, { ...ax, k: 0.12 * R });
  head.ball(F(0.16, -0.5), rr(0.26, 0.18, 0.24 + 0.04 * (1 - g)), SKIN, { ...ax, k: 0.1 * R });
  // the brow, a shelf over the eyes
  head.ball(F(0.47, 0.062), rr(0.1, 0.058 + 0.012 * (1 - g), 0.28), SKIN, { ...ax, k: 0.03 * R });
  // the nose: one long straight blade from the brow, the tip and the wings small at its end
  {
    const nd: V3 = [f[0] * 0.555 + up[0] * -0.832, f[1] * 0.555 + up[1] * -0.832, 0];
    const np: V3 = [f[0] * 0.832 + up[0] * 0.555, f[1] * 0.832 + up[1] * 0.555, 0];
    head.ball(F(0.585 - 0.01 * (1 - g), -0.1), rr(0.165, 0.062 + 0.012 * (1 - g), 0.038 + 0.014 * (1 - g)), SKIN, { x: nd, y: np, k: 0.025 * R });
    head.ball(F(0.665 - 0.02 * (1 - g), -0.235), rr(0.045, 0.04, 0.052 + 0.016 * (1 - g)), SKIN, { ...ax, k: 0.02 * R });
  }
  // the lips, thin, and the chin
  head.ball(F(0.5, -0.39), rr(0.085, 0.045, 0.13), SKIN, { ...ax, k: 0.04 * R });
  head.ball(F(0.495, -0.475), rr(0.07, 0.035, 0.1), SKIN, { ...ax, k: 0.035 * R });
  head.ball(F(0.46, -0.65), rr(0.11, 0.09, 0.12 + 0.03 * (1 - g)), SKIN, { ...ax, k: 0.05 * R });
  for (const s of [-1, 1]) {
    head.ball(F(0.6 - 0.015 * (1 - g), -0.25, s * (0.052 + 0.016 * (1 - g))), rr(0.04, 0.03, 0.034), SKIN, { ...ax, k: 0.02 * R });
    // cheekbones, and under them the cheeks fallen in
    head.ball(F(0.3, -0.15, s * 0.28), rr(0.14, 0.08, 0.09), SKIN, { ...ax, k: 0.05 * R });
    head.ball(F(0.36, -0.4, s * 0.42), rr(0.16, 0.17, 0.06 + 0.05 * g), SKIN, { ...ax, cut: true, k: 0.08 * R });
    // the eye: a shallow hollow under the brow, the closed lid lying round in it
    head.ball(F(0.525, -0.05, s * 0.19), rr(0.075, 0.045, 0.1), SKIN, { ...ax, cut: true, k: 0.04 * R });
    head.ball(F(0.43, -0.058, s * 0.18), rr(0.075, 0.05, 0.085), SKIN, { ...ax, k: 0.02 * R });
    // the temple hollowed a little, the ear
    head.ball(F(0.2, 0.1, s * 0.47), rr(0.16, 0.14, 0.05), SKIN, { ...ax, cut: true, k: 0.06 * R });
    if (!pale) head.ball(F(-0.04, -0.12, s * 0.45), rr(0.07, 0.13, 0.05), SKIN, { ...ax, k: 0.03 * R });
  }
  head.limb(F(-0.14, -0.34), neck, 0.4 * R, 0.46 * R, pale ? HAIR : SKIN, { k: 0.1 * R });

  // ---- hair and beard ----
  const hair = new Clay(0.1 * R);
  hair.ball(F(-0.36, 0.1), rr(0.46, 0.56, 0.46), HAIR, { ...ax, k: 0.06 * R });
  if (pale) {
    for (const s of [-1, 1]) {
      // over the shoulder and down the arm
      hair.chain([F(-0.12, 0.08, s * 0.4), P(2.3, 2.7, s * 0.34), P(2.6, 2.3, s * 0.95), P(2.86, 1.66, s * 1.5), P(3.02, 0.9, s * 1.82), P(3.0, 0.28, s * 1.9)], [0.24 * R, 0.3 * R, 0.42 * R, 0.5 * R, 0.4 * R, 0.14 * R], HAIR, { k: 0.12 * R, soft: 1.5 });
    }
    // one great fall from the crown over the back of the neck and the shoulders
    hair.ball(P(2.72, 2.36), rr(0.82, 0.5, 1.2), HAIR, { k: 0.14 * R, soft: 1.5 });
    hair.chain([P(2.9, 2.5), P(3.5, 1.9), P(3.86, 1.0)], [0.5 * R, 0.5 * R, 0.2 * R], HAIR, { k: 0.14 * R, flat: 2.0, soft: 1.5 });
    // the long beard, from under the chin down to the forearm
    hair.chain([F(0.3, -0.72), P(1.74, 1.36), P(1.9, 0.7), P(2.1, 0.26)], [0.21 * R, 0.33 * R, 0.26 * R, 0.09 * R], BEARD, { k: 0.08 * R, flat: 1.5, soft: 1.2 });
    hair.ball(F(0.26, -0.68), rr(0.2, 0.12, 0.26), BEARD, { ...ax, k: 0.06 * R, soft: 0.8 });
  } else {
    // a dark mantle of hair on the shoulders, and to either side of the face a curtain of it hanging straight down
    hair.ball(P(2.96, 3.26), rr(0.8, 0.4, 1.26), HAIR, { k: 0.12 * R, soft: 1.5 });
    for (const s of [-1, 1]) {
      hair.ball(F(-0.12, -0.1, s * 0.46), rr(0.3, 0.42, 0.09), HAIR, { ...ax, k: 0.06 * R, soft: 1 });
      hair.chain([F(-0.1, -0.2, s * 0.5), P(1.98, 2.1, s * 0.52), P(2.0, 1.15, s * 0.5)], [0.2 * R, 0.17 * R, 0.05 * R], HAIR, { k: 0.08 * R, flat: 0.45, soft: 1 });
      hair.chain([F(-0.3, -0.3, s * 0.48), P(2.3, 2.0, s * 0.62), P(2.34, 1.3, s * 0.6)], [0.2 * R, 0.16 * R, 0.05 * R], HAIR, { k: 0.08 * R, flat: 0.45, soft: 1 });
    }
    // a short beard along the jaw
    hair.ball(F(0.24, -0.66), rr(0.22, 0.1, 0.28), BEARD, { ...ax, k: 0.05 * R, soft: 0.8 });
  }
  // it falls in locks: grooves between them, running the way it hangs
  const hd: [number, number] = pale ? [side * 0.5, -0.866] : [side * 0.12, -0.993];
  const locks = (x: number, y: number, z: number) => {
    const along = x * hd[0] + y * hd[1];
    const across = x * -hd[1] + y * hd[0];
    // (broad enough for the clay's own grain to hold: a lock is several samples wide)
    const a = (across * 0.5) / v + 1.2 * Math.sin(along * 0.05 + z * 0.04) + noise2(across * 0.12, along * 0.02) * 2.4;
    const b = (z * 0.52) / v + 1.1 * Math.sin(along * 0.045 + 2) + noise2(z * 0.12 + 5, along * 0.02) * 2.4;
    return (Math.pow(1 - Math.abs(Math.sin(a)), 1.5) + Math.pow(1 - Math.abs(Math.sin(b)), 1.5)) * 0.42;
  };

  // ---- the hands ----
  const hands = new Clay(0.035 * R);
  const finger = (pts: V3[], r0: number) => {
    const n = pts.length;
    hands.chain(
      pts,
      pts.map((_, i) => r0 * (1 - 0.34 * (i / (n - 1))) * R),
      SKIN,
      { k: 0.03 * R },
    );
    // the knuckles stand a little proud
    for (let i = 1; i < n - 1; i++) hands.ball(pts[i], r0 * 1.16 * (1 - 0.3 * (i / (n - 1))) * R, SKIN, { k: 0.025 * R });
  };
  for (const s of [-1, 1]) {
    if (pale) {
      // open beneath the dome and bearing it: the palm flat, the fingers reaching on under it and curling up at their ends
      hands.limb(P(1.5, -0.2, s * 0.64), P(1.02, -0.27, s * 0.48), 0.3 * R, 0.19 * R, SKIN, { k: 0.08 * R });
      hands.ball(P(0.6, -0.31, s * 0.4), rr(0.5, 0.12, 0.3), SKIN, { k: 0.08 * R });
      for (let i = 0; i < 4; i++) {
        const z0 = s * (0.16 + i * 0.145);
        const len = [0.9, 1.0, 0.95, 0.78][i];
        finger([P(0.16, -0.32, z0), P(0.16 - 0.3 * len, -0.335, z0 * 1.02), P(0.16 - 0.56 * len, -0.3, z0 * 1.04), P(0.16 - 0.74 * len, -0.2, z0 * 1.05)], 0.07);
      }
      // the thumb, up round the edge of the dish
      finger([P(0.78, -0.27, s * 0.64), P(0.5, -0.2, s * 0.8), P(0.3, -0.06, s * 0.9), P(0.2, 0.06, s * 0.93)], 0.085);
    } else {
      // resting on its rim, the fingers bent down over the edge
      hands.limb(P(2.02, 0.31, s * 0.82), P(1.62, 0.2, s * 0.7), 0.3 * R, 0.2 * R, SKIN, { k: 0.08 * R });
      hands.ball(P(1.44, 0.165, s * 0.64), rr(0.38, 0.12, 0.3), SKIN, { k: 0.08 * R, x: [-0.96 * side, -0.27, 0] });
      for (let i = 0; i < 4; i++) {
        const z0 = s * (0.4 + i * 0.148);
        const len = [0.9, 1.0, 0.94, 0.76][i];
        finger([P(1.2, 0.115, z0), P(1.1, 0.02, z0), P(1.085, 0.02 - 0.24 * len, z0 * 1.01), P(1.12, 0.02 - 0.46 * len, z0 * 1.02)], 0.07);
      }
      finger([P(1.52, 0.2, s * 0.36), P(1.3, 0.24, s * 0.24), P(1.14, 0.2, s * 0.17), P(1.07, 0.08, s * 0.14)], 0.085);
    }
  }
  const parts = [
    yield* body.meshSteps(1.3 * v, paints, undefined, budget, { detail: folds, band: 3.4 }),
    yield* head.meshSteps(0.42 * v, paints, undefined, budget),
    yield* hair.meshSteps(0.8 * v, paints, undefined, budget, { detail: locks, band: 2 }),
    yield* hands.meshSteps(0.42 * v, paints, undefined, budget),
  ];
  const geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  geo.computeBoundingSphere();

  // ---- the crown ----
  // A broad ring, wider than the head, worn low on the brow and tipped forward with it. The pale king's is red
  // gold: a narrow band, a row of small points and above it long thin spikes, a bead on each. The dark king's is
  // wider and yellower, a deep worked band with a close hedge of shorter points.
  const cp: THREE.BufferGeometry[] = [];
  const upV = new THREE.Vector3(...up);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upV);
  const cc = new THREE.Vector3(...F(0.0, 0.46));
  const gold: V3 = pale ? [0.44, 0.13, 0.035] : [0.4, 0.2, 0.045];
  const goldTop: V3 = pale ? [0.7, 0.3, 0.075] : [0.74, 0.45, 0.11];
  const r0 = (pale ? 0.68 : 0.76) * R;
  const r1 = (pale ? 0.77 : 0.87) * R;
  const bh = (pale ? 0.2 : 0.28) * R;
  const at = (a: number, rad: number, y: number) => new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad).applyQuaternion(quat).add(cc);
  const flat = quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  cp.push(prim(new THREE.CylinderGeometry(r1, r0, bh, 72, 6, true), at(0, 0, bh / 2), gold, 0, { quat, top: goldTop }));
  for (const [rad, y, t] of [
    [r0, 0, 0.03],
    [r1, bh, 0.026],
    [(r0 + r1) / 2, bh / 2, 0.014],
  ])
    cp.push(prim(new THREE.TorusGeometry(rad, t * R, 8, 72), at(0, 0, y), goldTop, 2, { quat: flat }));
  // the dark within the ring
  cp.push(prim(new THREE.CircleGeometry(r0 * 0.985, 40), at(0, 0, bh * 0.25), [0.06, 0.016, 0.012], 1, { quat: quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)) }));
  const nP = pale ? 23 : 34;
  const spike = (a: number, len: number, w: number, flare: number, y0: number, bead: number) => {
    const fl = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)), -flare);
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2);
    const out = Math.sin(flare) * len;
    cp.push(prim(new THREE.ConeGeometry(w * R, len, 4, 3), at(a, r1 + out * 0.5, y0 + len / 2 - 0.2), gold, 3, { quat: quat.clone().multiply(fl).multiply(turn), top: goldTop, scale: [1, 1, 0.4] }));
    if (bead > 0) cp.push(prim(new THREE.SphereGeometry(bead * R, 10, 8), at(a, r1 + out, y0 + len * 0.985), goldTop, 2));
  };
  for (let i = 0; i < nP; i++) {
    const a = (i / nP) * Math.PI * 2;
    const tall = i % 2 === 0;
    // never quite even: he drew each point by hand
    const j = 0.86 + 0.28 * noise2(i * 3.7 + (pale ? 0 : 40), 1.5);
    if (pale) {
      spike(a, (tall ? 0.62 : 0.4) * R * j, 0.052, 0.2 + 0.05 * (j - 1), bh, 0.021);
      spike(a + Math.PI / nP, 0.17 * R, 0.045, 0.3, bh, 0);
    } else {
      spike(a, (tall ? 0.44 : 0.31) * R * j, 0.05, 0.24, bh, tall ? 0.02 : 0.015);
    }
  }
  const crown = mergeGeometries(cp)!;
  cp.forEach((p) => p.dispose());
  crown.computeBoundingSphere();
  return { geo, crown, side, neck, headDir: [(Hc[0] - neck[0]) / R, (Hc[1] - neck[1]) / R, 0], chest: pale ? P(2.9, 1.5) : P(3.2, 2.5), axis, crownC: cc.toArray() as V3, crownUp: up, headC: Hc, headF: f, hairDir: hd };
}

// ---------- how they are painted and lit ----------
const S = (p: V3) => new THREE.Vector3(ORIGIN.x + p[0], ORIGIN.y + p[1], ORIGIN.z + p[2]);
function kingUniforms(k: King) {
  const hd = new THREE.Vector3(...k.headDir).normalize();
  return {
    uNeck: { value: S(k.neck) },
    uHeadDir: { value: hd },
    uChest: { value: S(k.chest) },
    uHeadC: { value: S(k.headC) },
    uHeadF: { value: new THREE.Vector3(...k.headF) },
    uHairDir: { value: new THREE.Vector2(...k.hairDir) },
    uSide: { value: k.side },
    uAxis: { value: new THREE.Vector2(ORIGIN.x + k.axis[0], ORIGIN.z + k.axis[1]) },
    uCrownC: { value: S(k.crownC) },
    uCrownUp: { value: new THREE.Vector3(...k.crownUp) },
  };
}
// They are alive: a breath every quarter of a minute lifts the back and the shoulders, and the head moves the
// least amount about the neck, never the same way twice. The hands do not move: they hold the world.
const GLSL_ALIVE = /* glsl */ `
uniform vec3 uNeck; uniform vec3 uHeadDir; uniform vec3 uChest; uniform vec3 uHeadC; uniform float uSide;
vec3 alive(vec3 p, float t, float R){
  float w = smoothstep(0.0, R * 0.8, dot(p - uNeck, uHeadDir)) * (1.0 - smoothstep(R * 1.0, R * 1.7, length(p - uHeadC)));
  float a = (sin(t * 0.09 + uSide * 1.7) * 0.6 + sin(t * 0.041 + uSide * 0.6 + 1.3) * 0.4) * 0.017 * w;
  vec3 d = p - uNeck; float c = cos(a); float s = sin(a);
  d.xy = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  p = uNeck + d;
  vec3 e = (p - uChest) / (R * 1.9);
  float br = exp(-dot(e, e)) * (0.5 + 0.5 * sin(t * 0.38 + uSide));
  return p + normalize(vec3(uSide * 0.5, 1.0, 0.0)) * br * 0.95;
}
`;

export function makeKingMaterial(k: King) {
  const pale = k.side < 0;
  return new THREE.ShaderMaterial({
    uniforms: { ...KINGS_UNIFORMS, ...kingUniforms(k) },
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute vec2 aPat; attribute vec4 aWhat; attribute float aAO;
      uniform float uTime; uniform float uR;
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vN; varying vec4 vCol; varying vec2 vPat; varying vec4 vWhat; varying float vAO;
      ${GLSL_ALIVE}
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vObj = wp.xyz;
        wp.xyz = alive(wp.xyz, uTime, uR);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol; vPat = aPat; vWhat = aWhat; vAO = aAO;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vN; varying vec4 vCol; varying vec2 vPat; varying vec4 vWhat; varying float vAO;
      uniform vec2 uAxis; uniform float uSide; uniform vec3 uHeadC; uniform vec3 uHeadF; uniform vec3 uCrownUp; uniform vec2 uHairDir;
      ${GLSL_KINGS}
      float lineAA(float x, float w, float fw){ return 1.0 - smoothstep(w - fw, w + fw, abs(x)); }
      ${
        pale
          ? `// the pale king's cloth: long wavy lines in pairs running with it, and small dark flowers strewn over it.
             // x: a line, y: a flower, z: its heart, w: how far the stitching stands up
             vec4 clothPat(vec2 uv, float rich){
               float fw = max(fwidth(uv.x), fwidth(uv.y));
               float soft = 1.0 - smoothstep(0.5, 1.7, fw);
               float x = uv.x + sin(uv.y * 0.085 + vnoise(uv * 0.03) * 3.0) * 2.4;
               float cell = (fract(x / 7.0) - 0.5) * 7.0;
               float line = lineAA(abs(cell) - 0.9, 0.3, fw) * soft;
               vec2 fc = uv / 10.5; vec2 fi = floor(fc);
               vec2 ff = (fract(fc) - 0.5 - (vec2(hash12(fi + 1.3), hash12(fi + 4.1)) - 0.5) * 0.5) * 10.5;
               float pick = step(0.5, hash12(fi));
               float rr = length(ff);
               float petal = 1.9 + 0.55 * cos(atan(ff.y, ff.x) * 5.0 + hash12(fi) * 6.0);
               float flower = (1.0 - smoothstep(petal - 0.4, petal + fw, rr)) * pick * soft;
               float heart = (1.0 - smoothstep(0.35, 0.6 + fw, rr)) * pick * soft;
               return vec4(line, flower, heart, line * 0.5 + flower * 0.6 + heart * 0.4);
             }`
          : `// the dark king's: bands that run with the cloth, each worked differently: a row of short stitches, a zigzag,
             // a row of knots, a fine edge. rgb: the thread, a: how much of it
             vec4 clothPat(vec2 uv, float rich){
               float fw = max(fwidth(uv.x), fwidth(uv.y));
               float soft = 1.0 - smoothstep(0.16, 0.55, fw);
               float c = uv.x + vnoise(vec2(uv.y * 0.02, 2.0)) * 1.6 + (vnoise(uv * 0.35) - 0.5) * 0.5; float s = uv.y + (vnoise(uv * 0.23 + 7.0) - 0.5) * 1.3;
               float bw = 4.6; float bi = floor(c / bw); float bf = fract(c / bw);
               float bk = hash12(vec2(bi, 3.0));
               float row = lineAA((bf - 0.17) * bw, 0.4, fw);
               float stitch = lineAA((fract(s * 0.5 + bk * 7.0) - 0.5) * 2.0, 0.55, fw);
               float zz = abs(fract(s * 0.15 + bk) - 0.5) * 2.0;
               float zig = lineAA((bf - 0.43 - 0.26 * zz) * bw, 0.2, fw);
               float knot = lineAA(length(vec2((fract(s * 0.3) - 0.5) / 0.3, (bf - 0.74) * bw)), 0.4, fw) * step(bk, 0.45);
               float edge = lineAA(min(bf, 1.0 - bf) * bw, 0.09, fw);
               vec3 thread = mix(vec3(0.5, 0.13, 0.03), vec3(0.64, 0.35, 0.08), hash12(vec2(bi, floor(s * 0.5))));
               float sleeveP = clamp(row * stitch * 0.9 + zig * step(0.35, bk) * 0.85 + knot * 0.9 + edge * 0.45, 0.0, 1.0);
               float bodyP = lineAA((bf - 0.5) * bw, 0.2, fw) * lineAA((fract(s * 0.36 + bk * 5.0) - 0.5) * 2.0, 0.5, fw) * step(0.55, bk) * 0.6;
               // (far off the stitches run together into the colour they make of the cloth)
               float amt = mix(mix(0.03, 0.26, rich), mix(bodyP, sleeveP, rich), soft);
               return vec4(thread, amt);
             }`
      }
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float robeW = vWhat.x; float sleeveW = vWhat.y; float skinW = vWhat.z; float hairW = vWhat.w;
        float clothW = clamp(robeW + sleeveW, 0.0, 1.0);
        float patterned = clothW * (1.0 - clamp(vCol.a, 0.0, 1.0));
        vec3 alb = vCol.rgb;
        // where on the cloth: round the body and down it, or along and across a sleeve
        vec2 bq = vObj.xz - uAxis;
        float th = atan(bq.y, -uSide * bq.x);
        vec2 uvB = vec2(th * 40.0, vObj.y);
        vec2 uvS = vec2(vPat.y, vPat.x);
        float sl = sleeveW / max(clothW, 1e-3);
        float height = 0.0;
        vec3 thread = vec3(0.0); float stitched = 0.0;
        ${
          pale
            ? `vec4 pt = mix(clothPat(uvB, 0.0), clothPat(uvS, 1.0), sl) * patterned;
               alb = mix(alb, alb * 0.34 + vec3(0.012, 0.009, 0.004), pt.x * 0.85);
               alb = mix(alb, vec3(0.02, 0.034, 0.1), pt.y * 0.85);
               alb = mix(alb, vec3(0.32, 0.23, 0.1), pt.z * 0.9);
               height = pt.w * 0.3;`
            : `// richest on the sleeves and down the front of him
               float front = smoothstep(1.25, 0.35, abs(th)) * 0.85;
               float rich = max(smoothstep(0.25, 0.8, sl), front);
               vec4 tb = clothPat(uvB, rich); vec4 ts = clothPat(uvS, 1.0);
               vec4 tp = mix(tb, ts, smoothstep(0.35, 0.65, sl));
               stitched = tp.a * patterned; thread = tp.rgb;
               alb = mix(alb, thread, stitched);
               height = stitched * 0.3;`
        }
        // the weave
        float wf = length(fwidth(vObj));
        float wk = (1.0 - smoothstep(0.045, 0.15, wf)) * clothW;
        // (threads crossing in the world's own measure, on whichever way the cloth faces, so they never ring a rounded end)
        vec3 tw = pow(abs(normalize(vN)), vec3(4.0)); tw /= tw.x + tw.y + tw.z;
        vec3 sw = sin(vObj * 6.4);
        float weave = sw.y * sw.z * tw.x + sw.x * sw.z * tw.y + sw.x * sw.y * tw.z;
        alb *= 1.0 + weave * 0.14 * wk;
        height += weave * 0.05 * wk;
        // hair: long strands running the way it falls
        // (laid in the world's own measure, the way it hangs, so it never swirls where two locks meet)
        float hAlong = dot(vObj.xy, uHairDir);
        float hAcross = dot(vObj.xy, vec2(-uHairDir.y, uHairDir.x));
        float hs = mix(hAcross, vObj.z, smoothstep(0.35, 0.75, abs(n.x * uHairDir.y - n.y * uHairDir.x)));
        float sf = fwidth(hs);
        float strand = vnoise(vec2(hs * 1.5, hAlong * 0.045)) * 0.6 + vnoise(vec2(hs * 4.4 + 7.0, hAlong * 0.11)) * 0.4;
        strand = mix(0.5, strand, 1.0 - smoothstep(0.12, 0.5, sf));
        alb *= 1.0 + hairW * (strand - 0.5) * 1.25;
        height += hairW * strand * 0.4;
        // skin: old, the paint dragged over it
        float age = vnoise(vObj.xy * 0.6 + vObj.z * 0.33) * 0.6 + vnoise(vObj.xy * 1.9 - vObj.z * 0.8) * 0.4;
        alb *= 1.0 + skinW * (age - 0.5) * 0.3;
        // (and the strokes it was laid in with, down the face)
        alb *= 1.0 + skinW * (vnoise(vec2(vObj.x * 0.9 + vObj.z * 0.7, vObj.y * 0.16)) - 0.5) * 0.3;
        height += skinW * age * 0.07;
        // drawn on the face with the point of a brush: the lashes of each closed eye, the mouth, the fold beside it, a nostril
        {
          vec3 hp = (vObj - uHeadC) / uR;
          float fa = dot(hp, uHeadF); float fb = dot(hp, uCrownUp); float fz = abs(hp.z);
          float lw = fwidth(fb) + fwidth(fz);
          float front = smoothstep(0.22, 0.34, fa);
          float lash = lineAA(fb + 0.09 + 2.2 * (fz - 0.18) * (fz - 0.18), 0.014, lw) * smoothstep(0.06, 0.1, fz) * (1.0 - smoothstep(0.27, 0.31, fz));
          float mouth = lineAA(fb + 0.432 + 1.2 * fz * fz, 0.011, lw) * (1.0 - smoothstep(0.13, 0.17, fz)) * smoothstep(0.38, 0.46, fa);
          float foldW = 0.07 + 0.11 * clamp((-0.27 - fb) / 0.2, 0.0, 1.0);
          float fold = lineAA(fz - foldW, 0.01, lw) * smoothstep(-0.52, -0.45, fb) * (1.0 - smoothstep(-0.3, -0.26, fb)) * 0.55 * smoothstep(0.36, 0.46, fa);
          float nostril = 1.0 - smoothstep(0.008, 0.022, length(vec2(fb + 0.272, (fz - 0.04) * 0.7)));
          nostril *= smoothstep(0.54, 0.6, fa);
          float drawn = clamp(lash + mouth + fold + nostril * 0.45, 0.0, 1.0) * front * skinW;
          alb = mix(alb, vec3(${pale ? "0.1, 0.04, 0.028" : "0.045, 0.02, 0.014"}), drawn * 0.9);
          // a flush of blood in the cheek and the lip, a shadow of colour round the eye
          alb = mix(alb, alb * vec3(1.12, 0.8, 0.74), skinW * front * (1.0 - smoothstep(0.03, 0.09, abs(fb + 0.432))) * (1.0 - smoothstep(0.1, 0.16, fz)) * 0.7);
          alb = mix(alb, alb * vec3(0.8, 0.7, 0.72), skinW * front * (1.0 - smoothstep(0.05, 0.13, length(vec2(fb + 0.06, fz - 0.18)))) * 0.5);
        }
        alb *= 1.0 + (dabs(vObj) - 0.5) * 0.18;
        n = bumpN(n, vWorld, height, 1.0);

        // the one light, wrapped a little round the form (further round skin); creases keep their shade
        vec3 Ld = normalize(uDome + vec3(0.0, uR * 0.35, 0.0) - vWorld);
        vec2 dl = domeLight(vWorld, n);
        float att = dl.y;
        float ao = mix(1.0, vAO, 0.9);
        float wk2 = mix(0.3, 0.55, skinW);
        float wrap = clamp((dl.x + wk2) / (1.0 + wk2), 0.0, 1.0);
        vec3 warm = DOME_WARM * att * wrap * wrap * 3.7 * mix(1.0, ao, 0.7);
        // light that has gone a little way into skin comes out redder at the edge of the shade
        vec3 sss = vec3(1.0, 0.3, 0.13) * att * skinW * smoothstep(0.0, 0.45, wrap) * (1.0 - smoothstep(0.3, 0.95, wrap)) * 1.6;
        vec3 col = alb * (coolFill(n) * ao * ao + warm + sss);
        // every edge turned toward it takes the light: the nap of the cloth, the down on a cheek, a sleeve's hem
        float fres = pow(1.0 - abs(dot(n, V)), 2.6);
        col += DOME_WARM * alb * fres * att * clamp(dl.x + 0.5, 0.0, 1.0) * (1.5 + 0.5 * skinW + 1.2 * hairW) * ao;
        // and on the far side a thread of the night's blue
        col += vec3(0.016, 0.042, 0.07) * fres * clamp(0.35 - dl.x, 0.0, 1.0) * ao * (0.5 + alb.g * 4.0);
        // hair takes a sheen along its strands
        {
          vec3 Tg = vec3(uHairDir, 0.0);
          Tg = normalize(Tg - n * dot(Tg, n) + n * (strand - 0.5) * 0.3);
          float th1 = dot(Tg, normalize(Ld + V));
          float th2 = dot(Tg, normalize(vec3(0.0, 1.0, 0.0) + V));
          col += hairW * (DOME_WARM * alb * att * pow(max(1.0 - th1 * th1, 0.0), 22.0) * 5.0 * clamp(dl.x + 0.4, 0.0, 1.0) + vec3(0.02, 0.045, 0.07) * pow(max(1.0 - th2 * th2, 0.0), 30.0) * 0.5) * ao * (0.5 + strand);
        }
        // silk thread: a soft light of its own colour where it lies toward the dome (never brighter than the dome makes it)
        col += thread * stitched * (0.01 + att * (0.25 + 0.9 * pow(max(dot(n, normalize(Ld + V)), 0.0), 10.0)) * clamp(dl.x + 0.3, 0.0, 1.0));
        // the bodies go down into the dark
        col *= mix(0.28, 1.0, smoothstep(uDome.y - uR * 2.6, uDome.y - uR * 0.3, vWorld.y));
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}

// Worked gold: a chased band, a row of stones, beaded rims; it takes the dome's light broadly and gives back
// soft glints that wander as the eye moves, and no sparkle.
export function makeCrownMaterial(k: King) {
  const pale = k.side < 0;
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...KINGS_UNIFORMS, ...kingUniforms(k) },
    vertexShader: /* glsl */ `
      attribute vec4 aCol;
      uniform float uTime; uniform float uR;
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vN; varying vec4 vCol;
      ${GLSL_ALIVE}
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vObj = wp.xyz;
        wp.xyz = alive(wp.xyz, uTime, uR);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vObj; varying vec3 vN; varying vec4 vCol;
      uniform vec3 uCrownC; uniform vec3 uCrownUp;
      ${GLSL_KINGS}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 alb = vCol.rgb;
        // (the inside of the band is seen through the ring: gold in shade)
        if (!gl_FrontFacing) { n = -n; alb *= 0.4; }
        float kind = vCol.a; // 0 the band, 1 the dark inside, 2 rims and beads, 3 the points
        float band = 1.0 - step(0.5, kind);
        float inner = step(0.5, kind) * (1.0 - step(1.5, kind));
        // round the ring, and up it
        vec3 rel = vObj - uCrownC;
        float hh = dot(rel, uCrownUp);
        vec3 flatv = rel - uCrownUp * hh;
        vec3 e1 = normalize(cross(uCrownUp, vec3(0.0, 0.0, 1.0)));
        float ang = atan(dot(flatv, vec3(0.0, 0.0, 1.0)), dot(flatv, e1));
        float u = ang * length(flatv); float bandH = ${(pale ? 0.2 : 0.28).toFixed(2)} * uR;
        float fw = fwidth(u) + fwidth(hh);
        float fine = 1.0 - smoothstep(0.12, 0.5, fw);
        // chased work: a lattice of small bosses, and along the middle a row of stones in their collets
        vec2 lc = vec2(u, hh) * ${pale ? "1.5" : "1.25"};
        float lattice = sin(lc.x + lc.y) * sin(lc.x - lc.y);
        float h = lattice * 0.12 * fine * band;
        float su = u / ${pale ? "3.4" : "2.9"}; float si = floor(su);
        vec2 sp = vec2((fract(su) - 0.5) * ${pale ? "3.4" : "2.9"}, hh - bandH * 0.5);
        float sr = length(sp);
        float stone = (1.0 - smoothstep(0.62, 0.82, sr)) * band;
        float collet = (1.0 - smoothstep(0.82, 1.08, sr)) * band - stone;
        h += (collet * 0.25 + stone * (0.5 - sr * sr * 0.6)) * (1.0 - smoothstep(0.2, 0.7, fw));
        // the points: a ridge down each, hammered
        float hm = vnoise(vObj.xy * 1.3 + vObj.z * 0.9);
        h += (hm - 0.5) * 0.1 * (1.0 - band) * fine;
        n = bumpN(n, vWorld, h, 1.0);
        alb *= mix(1.0, 0.62 + 0.6 * smoothstep(-0.6, 0.6, lattice), fine * band);
        alb *= 0.8 + 0.4 * hm;
        vec3 gem = hash12(vec2(si, 7.0)) < 0.5 ? vec3(0.34, 0.025, 0.02) : vec3(0.03, 0.09, 0.11);
        alb = mix(alb, gem, stone);

        vec3 Ld = normalize(uDome + vec3(0.0, uR * 0.35, 0.0) - vWorld);
        vec2 dl = domeLight(vWorld, n);
        float att = dl.y;
        float wrap = clamp(dl.x * 0.75 + 0.25, 0.0, 1.0);
        vec3 col = alb * (coolFill(n) + DOME_WARM * att * wrap * wrap * 3.2);
        // metal: a broad sheen and a softer, tighter glint inside it; the stones a small deep light
        vec3 Hh = normalize(Ld + V);
        float nh = max(dot(n, Hh), 0.0);
        float metal = 1.0 - inner;
        float glint = pow(nh, 9.0) * 0.9 + pow(nh, 46.0) * (0.5 + 0.5 * vnoise(vObj.xy * 0.7 + vObj.z * 0.5)) * 1.3;
        col += mix(alb * 4.5, vec3(1.0, 0.78, 0.5), 0.2) * glint * att * metal * step(0.0, dl.x + 0.2) * mix(1.0, 1.6, stone);
        // and the night, thinly, on whatever is turned from the light
        float fres = pow(1.0 - abs(dot(n, V)), 3.0);
        col += (DOME_WARM * alb * 2.2 * att * clamp(dl.x + 0.5, 0.0, 1.0) + vec3(0.012, 0.03, 0.05) * clamp(0.4 - dl.x, 0.0, 1.0)) * fres * metal;
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}
