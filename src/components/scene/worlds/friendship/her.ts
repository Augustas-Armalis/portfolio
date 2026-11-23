import { ORB } from "./shape";

// Her, sculpted: a distance field built the way a character sculptor blocks a figure, from the skull out. Every
// form is a real anatomical mass (cranium, frontal bosses, brow, the eye in its socket under a closed lid, the
// nose's bridge, tip and wings, the muzzle and the two lips, the cheekbone, the jaw's ramus and body, the chin,
// the ear's rim and bowl and lobe, the neck with its two long muscles, the collarbones, shoulder, breast, the arm,
// the forearm and a hand of five jointed fingers), blended into its neighbours with smooth unions whose radii are
// those of the flesh between them. The hair is a shell over the skull, combed back in locks into a knot.
//
// It is modelled at a woman's own size, in metres, in her head's frame (the ear's opening at the origin, facing
// -x, up +y, her left side toward +z, the side the eye sees), then stood in the cave S times larger, her face where
// the picture has it and her hand under the orb.

export const HER_S = 250;
// the head's frame in the cave: the ear's opening (the picture's nose tip is at 68.6, 164.3)
const OZ = 0.21; // how far in front of her head (toward the eye) the orb hangs, in her metres
export const HER_AT = { x: 68.6 + 0.123 * HER_S, y: 164.3 + 0.024 * HER_S, z: ORB.z - OZ * HER_S };
// the head bows a little toward the orb
const PITCH = -0.06;
const CP = Math.cos(PITCH);
const SP = Math.sin(PITCH);

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V): V => mul(a, 1 / (len(a) || 1));
// a turned about the unit axis k by the angle t (Rodrigues)
const rot = (a: V, k: V, t: number): V => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return add(add(mul(a, c), mul(cross(k, a), s)), mul(k, dot(k, a) * (1 - c)));
};
const comb = (o: V, a: V, ka: number, b: V, kb: number, c: V, kc: number): V => [o[0] + a[0] * ka + b[0] * kb + c[0] * kc, o[1] + a[1] * ka + b[1] * kb + c[1] * kc, o[2] + a[2] * ka + b[2] * kb + c[2] * kc];

// ---------- the primitives ----------
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);
// an ellipsoid about the origin (iq's bound)
function ell(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  const a = x / rx;
  const b = y / ry;
  const c = z / rz;
  const k0 = Math.sqrt(a * a + b * b + c * c);
  const k1 = Math.sqrt((a * a) / (rx * rx) + (b * b) / (ry * ry) + (c * c) / (rz * rz));
  return k1 < 1e-12 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
// a cone with round ends, from a (radius r1) to b (radius r2) (iq's, exact)
function rcone(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r1: number, r2: number) {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y;
  const qy = pay * l2 - bay * y;
  const qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
// an ellipsoid on its own axes (u, v, w unit and square to each other)
type Ell = { c: V; u: V; v: V; w: V; r: V };
function ellA(x: number, y: number, z: number, e: Ell) {
  const dx = x - e.c[0];
  const dy = y - e.c[1];
  const dz = z - e.c[2];
  return ell(dx * e.u[0] + dy * e.u[1] + dz * e.u[2], dx * e.v[0] + dy * e.v[1] + dz * e.v[2], dx * e.w[0] + dy * e.w[1] + dz * e.w[2], e.r[0], e.r[1], e.r[2]);
}
const axes = (u: V, hint: V) => {
  const uu = nrm(u);
  const w = nrm(cross(uu, hint));
  const v = cross(w, uu);
  return { u: uu, v, w };
};
type Seg = { a: V; b: V; r1: number; r2: number };
const segD = (x: number, y: number, z: number, s: Seg) => rcone(x, y, z, s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], s.r1, s.r2);

// ---------- the arm and hand, posed about the orb ----------
const HEAD_ORB: V = [(ORB.x - HER_AT.x) / HER_S, (ORB.y - HER_AT.y) / HER_S, OZ];
const OR = ORB.r / HER_S;
// (the head's pitch is undone here, so the hand stays on the orb however the head bows)
const unpitch = (p: V): V => [p[0] * CP - p[1] * SP, p[0] * SP + p[1] * CP, p[2]];
const ORB_H = unpitch(HEAD_ORB);

function poseHand() {
  const C = ORB_H;
  // the palm lies under the orb's lower right (as in the picture), turned up and in toward it
  const toPalm = nrm([0.42, -1, 0.16]);
  const n = mul(toPalm, -1); // the palm's normal, toward the orb
  const P0 = add(C, mul(toPalm, OR + 0.001));
  const u = nrm(sub([-1, -0.05, 0.42], mul(n, dot([-1, -0.05, 0.42], n)))); // the fingers' way
  let s = nrm(cross(n, u));
  if (s[2] < 0) s = mul(s, -1); // the thumb's side (her left hand, palm up: toward the eye)
  const W = comb(P0, u, -0.062, s, 0.002, n, -0.016); // the wrist
  const segs: Seg[] = [];
  const knuckles: V[] = [];
  const tips: V[] = [];
  // the four fingers: where each knuckle is, how it fans, its three bones and its radii at each joint
  const F = [
    { o: [0.033, 0.023, -0.001], fan: 0.13, l: [0.042, 0.025, 0.021], r: [0.0094, 0.0081, 0.0071, 0.0061], bend: [0.12, 0.2, 0.14] },
    { o: [0.037, 0.0075, 0.0], fan: 0.03, l: [0.046, 0.028, 0.023], r: [0.0097, 0.0084, 0.0073, 0.0062], bend: [0.1, 0.18, 0.12] },
    { o: [0.034, -0.0085, -0.0015], fan: -0.07, l: [0.043, 0.027, 0.022], r: [0.0091, 0.0079, 0.0069, 0.0059], bend: [0.12, 0.22, 0.14] },
    { o: [0.026, -0.0235, -0.004], fan: -0.19, l: [0.034, 0.021, 0.019], r: [0.008, 0.007, 0.0062, 0.0054], bend: [0.16, 0.26, 0.16] },
  ];
  const hug = (J: V, d0: V, l: number, rj: number, minBend: number): V => {
    // turn the bone toward the orb just enough that its end rests on it (never less than the joint's own ease)
    const toC = sub(C, J);
    let ax = cross(d0, toC);
    if (len(ax) < 1e-9) ax = s;
    ax = nrm(ax);
    let best = rot(d0, ax, minBend);
    const want = OR + rj + 0.0012;
    for (let t = minBend; t < 1.4; t += 0.01) {
      const d = rot(d0, ax, t);
      best = d;
      if (len(sub(add(J, mul(d, l)), C)) <= want) break;
    }
    return best;
  };
  for (const f of F) {
    let J = comb(W, u, f.o[0] + 0.062, s, f.o[1] - 0.002, n, f.o[2] + 0.016 - 0.012);
    knuckles.push(J);
    let d = rot(u, n, -f.fan * 0); // (fanned about the palm's normal, toward the thumb's side positive)
    d = nrm(add(mul(u, Math.cos(f.fan)), mul(s, Math.sin(f.fan))));
    for (let b = 0; b < 3; b++) {
      d = hug(J, d, f.l[b], f.r[b + 1], f.bend[b]);
      const K = add(J, mul(d, f.l[b]));
      segs.push({ a: J, b: K, r1: f.r[b], r2: f.r[b + 1] });
      J = K;
    }
    tips.push(J);
  }
  // the thumb: from the wrist's thumb side, out and up round the orb's near side
  let J = comb(W, u, 0.014, s, 0.02, n, 0.002);
  const thumbBase = J;
  let d = nrm(add(add(mul(u, 0.62), mul(s, 0.62)), mul(n, 0.45)));
  const TL = [0.044, 0.032, 0.027];
  const TR = [0.0125, 0.0102, 0.0088, 0.0072];
  const TB = [0.0, 0.18, 0.16];
  for (let b = 0; b < 3; b++) {
    d = b === 0 ? d : hug(J, d, TL[b], TR[b + 1], TB[b]);
    const K = add(J, mul(d, TL[b]));
    segs.push({ a: J, b: K, r1: TR[b], r2: TR[b + 1] });
    J = K;
  }
  tips.push(J);
  const thumbDir = nrm(sub(segs[segs.length - 3].b, thumbBase));
  // the palm's masses: the ball of the thumb, the heel under the little finger
  const thenar: Ell = { c: comb(W, u, 0.028, s, 0.018, n, 0.009), ...axes(thumbDir, n), r: [0.032, 0.0165, 0.0135] };
  const hypo: Ell = { c: comb(W, u, 0.036, s, -0.024, n, 0.004), ...axes(u, n), r: [0.034, 0.0125, 0.0115] };
  return { C, n, u, s, P0, W, segs, knuckles, tips, thenar, hypo };
}
export const HAND = poseHand();

// the arm: shoulder to elbow to wrist, the elbow found by two bones of a woman's lengths, pointing down and back
const SHOULDER: V = [-0.004, -0.205, 0.15];
function poseArm() {
  const W = HAND.W;
  const L1 = 0.29;
  const L2 = 0.285;
  const dv = sub(W, SHOULDER);
  let D = len(dv);
  const reach = L1 + L2;
  // (a stretched arm keeps a little bend; if the hand is out of reach the bones are lengthened, not the hand moved)
  const k = D > reach * 0.97 ? D / (reach * 0.97) : 1;
  const l1 = L1 * k;
  const l2 = L2 * k;
  D = Math.min(D, l1 + l2 - 1e-6);
  const a = (l1 * l1 - l2 * l2 + D * D) / (2 * D);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const ax = nrm(dv);
  const POLE: V = [0.45, -0.85, 0.25];
  const pole = nrm(sub(POLE, mul(ax, dot(POLE, ax))));
  const E = add(add(SHOULDER, mul(ax, a)), mul(pole, h));
  return { S: SHOULDER, E, W };
}
export const ARM = poseArm();
const ARM_FORE = nrm(sub(ARM.W, ARM.E));
const ARM_UP = nrm(sub(ARM.E, ARM.S));
const FORE_BELLY: Ell = { c: add(add(ARM.E, mul(ARM_FORE, 0.075)), mul(HAND.s, 0.006)), ...axes(ARM_FORE, HAND.n), r: [0.1, 0.039, 0.035] };
const WRIST_E: Ell = { c: add(HAND.W, mul(HAND.u, -0.014)), ...axes(HAND.u, HAND.n), r: [0.024, 0.0175, 0.0285] };
const DELTOID: Ell = { c: add(ARM.S, mul(ARM_UP, 0.035)), ...axes(ARM_UP, [0, 0, 1]), r: [0.075, 0.048, 0.05] };
const BICEPS: Ell = { c: add(add(ARM.S, mul(ARM_UP, 0.15)), mul(nrm(cross(ARM_UP, [0, 0, 1])), -0.008)), ...axes(ARM_UP, [0, 0, 1]), r: [0.095, 0.041, 0.043] };

// ---------- the field ----------
// the skull's own vault (what the hair lies on)
function vault(x: number, y: number, z: number) {
  return smin(ell(x - 0.008, y - 0.032, z, 0.092, 0.095, 0.073), ell(x + 0.05, y - 0.056, z, 0.044, 0.052, 0.052), 0.032);
}
// the head, its features and the neck, in the head's frame (metres); symmetric across z
function skull(x: number, y: number, z: number) {
  const az = Math.abs(z);
  let d = vault(x, y, z);
  // the temples flatten
  d = smax(d, -ell(x + 0.03, y - 0.028, az - 0.082, 0.028, 0.026, 0.014), 0.02);
  // the brow, soft
  d = smin(d, ell(x + 0.082, y - 0.028, az - 0.025, 0.01, 0.007, 0.022), 0.02);
  // the mid-face, cheekbones, the cheeks below them
  d = smin(d, ell(x + 0.06, y + 0.03, z, 0.033, 0.04, 0.034), 0.025);
  d = smin(d, ell(x + 0.056, y + 0.002, az - 0.043, 0.024, 0.014, 0.018), 0.022);
  d = smin(d, ell(x + 0.056, y + 0.034, az - 0.03, 0.024, 0.024, 0.017), 0.025);
  // the muzzle round the mouth
  d = smin(d, ell(x + 0.074, y + 0.056, z, 0.026, 0.026, 0.027), 0.016);
  // the jaw: its rising branch, its body to the chin, and the chin
  d = smin(d, rcone(x, y, az, 0.004, -0.015, 0.054, 0.0, -0.066, 0.046, 0.009, 0.009), 0.018);
  d = smin(d, rcone(x, y, az, 0.0, -0.068, 0.045, -0.07, -0.101, 0.013, 0.008, 0.009), 0.024);
  d = smin(d, ell(x + 0.08, y + 0.097, z, 0.0128, 0.0125, 0.016), 0.02);
  // the eye's socket pressed in under the brow; the eye under its closed lid in it
  d = smax(d, -ell(x + 0.1, y - 0.008, az - 0.032, 0.017, 0.012, 0.017), 0.016);
  const lid = ell(x + 0.0775, y - 0.0055, az - 0.0315, 0.0118, 0.0112, 0.0135);
  d = smin(d, lid, 0.006);
  // the upper lid, a little fuller than the eye, overhanging the line where it closes; the lower lid's soft roll
  d = smin(d, ell(x + 0.0788, y - 0.0088, az - 0.031, 0.0113, 0.0082, 0.0142), 0.003);
  d = smin(d, ell(x + 0.0772, y + 0.0005, az - 0.0315, 0.0104, 0.0058, 0.0128), 0.004);
  // the closed lid's line, a little below the eye's middle, curving down at its middle; and the crease above it
  if (x < -0.07 && az < 0.05 && az > 0.014) {
    const dz = az - 0.031;
    const line = Math.max(Math.abs(lid) - 0.0006, Math.abs(y - 0.001 + 16 * dz * dz) - 0.0008);
    d = smax(d, -line, 0.0014);
  }
  // the nose: the bridge from its root, the tip, the wings, the nostrils
  let nose = rcone(x, y, z, -0.0895, 0.016, 0, -0.108, -0.0145, 0, 0.0054, 0.0064);
  nose = smin(nose, ell(x + 0.106, y + 0.0205, z, 0.0074, 0.0072, 0.008), 0.006);
  nose = smin(nose, ell(x + 0.0995, y + 0.0262, az - 0.0102, 0.0068, 0.0056, 0.0056), 0.0055);
  d = smin(d, nose, 0.006);
  d = smax(d, -ell(x + 0.1025, y + 0.0298, az - 0.0062, 0.0036, 0.0016, 0.0026), 0.0014);
  // the lips, and the line between them; the corners pressed in a little
  const upper = ell(x + 0.0955, y + 0.0485, z, 0.0072, 0.0058, 0.0205);
  const lower = ell(x + 0.0915, y + 0.0607, z, 0.0076, 0.0066, 0.018);
  d = smin(d, smin(upper, lower, 0.002), 0.004);
  d = smax(d, -ell(x + 0.1, y + 0.0548, z, 0.012, 0.0012, 0.02), 0.0012);
  // the chin's fold under the lower lip
  d = smax(d, -ell(x + 0.097, y + 0.075, z, 0.0035, 0.0035, 0.013), 0.006);
  return d;
}
// the ear (the near one and the far one alike): its rim, the bowl inside, the lobe, the little flap before it
function ear(x: number, y: number, z: number) {
  const az = Math.abs(z);
  // in the ear's own frame: tipped back a little, standing out from the head a little
  const ex = x - 0.011;
  const ey = y + 0.003;
  const ez = az - 0.066;
  const c = Math.cos(0.3);
  const sn = Math.sin(0.3);
  const u = ex * c - ey * sn;
  const v = ex * sn + ey * c;
  const w = ez * 0.96 - u * 0.28;
  let d = ell(u, v, w, 0.0155, 0.0285, 0.007);
  d = smin(d, ell(u + 0.002, v + 0.026, w + 0.001, 0.0085, 0.0095, 0.0052), 0.006);
  // the bowl, deepest at its middle; the rim is what is left
  d = smax(d, -ell(u + 0.0015, v + 0.002, w - 0.0058, 0.0115, 0.0215, 0.0062), 0.0025);
  // the flap before the opening
  d = smin(d, ell(u + 0.0145, v + 0.004, w + 0.001, 0.004, 0.006, 0.004), 0.004);
  return d;
}
// the neck: the column, the throat, the two long muscles from behind the ears to the breastbone
function neck(x: number, y: number, z: number) {
  const az = Math.abs(z);
  let d = rcone(x, y, z, 0.012, -0.03, 0, 0.02, -0.2, 0, 0.046, 0.053);
  d = smin(d, ell(x + 0.032, y + 0.13, z, 0.026, 0.052, 0.03), 0.02);
  d = smin(d, rcone(x, y, az, 0.012, -0.04, 0.05, -0.046, -0.2, 0.013, 0.012, 0.011), 0.016);
  return d;
}
// the hair: a shell over the skull, combed back from the brow and over the ears into a knot at the back of the head
const KNOT: V = [0.104, -0.006, 0];
const FLOW = nrm([-0.95, 0.55, 0]); // from the knot toward the brow
export function hairLocks(x: number, y: number, z: number) {
  // locks run from the hairline back into the knot: the angle round the knot-to-brow line
  const px = x - KNOT[0];
  const py = y - KNOT[1];
  const pz = z - KNOT[2];
  const a = px * FLOW[0] + py * FLOW[1] + pz * FLOW[2];
  const qx = px - FLOW[0] * a;
  const qy = py - FLOW[1] * a;
  const qz = pz;
  // (a vector square to FLOW in the side plane, and z: the angle about FLOW)
  const sx = -FLOW[1];
  const sy = FLOW[0];
  const ang = Math.atan2(qz, qx * sx + qy * sy);
  const wob = Math.sin(a * 60 + ang * 3) * 0.35;
  return { ang, a, wob };
}
function hair(x: number, y: number, z: number) {
  // where it grows: behind the hairline at the brow and temple, above and behind the ear, above the nape (inside > 0)
  const h1 = (x + 0.056 + (y - 0.07) * 0.5) / 1.12;
  const h2 = Math.max(y - 0.033, x - 0.034 + (0.033 - y) * 0.25);
  const h3 = y + 0.052;
  const reg = Math.min(h1, h2, h3);
  // it lies on the vault, a full head of hair, fullest at the crown, its edge at the hairline rolled
  const full = 0.0125 + 0.004 * Math.min(1, Math.max(0, (y - 0.03) / 0.07)) + 0.003 * Math.min(1, Math.max(0, x / 0.08));
  let d = smax(vault(x, y, z) - full, -reg, 0.006);
  const t = full;
  // combed into locks: broad ones, and fine strands in them
  if (d < 0.01) {
    const L = hairLocks(x, y, z);
    const g1 = Math.sin(L.ang * 34 + L.wob);
    const g2 = Math.sin(L.ang * 71 + L.wob * 2.0);
    d += Math.min(1, Math.max(0, reg / 0.012)) * (0.0009 * (g1 * 0.5 + 0.5) + 0.0004 * (g2 * 0.5 + 0.5));
  }
  // the knot: a coil of the same hair, its turns going round
  const kx = x - KNOT[0];
  const ky = y - KNOT[1];
  const kz = z - KNOT[2];
  let k = ell(kx, ky, kz, 0.04, 0.044, 0.046);
  if (k < 0.01) {
    const th = Math.atan2(ky, kz);
    const rr = Math.hypot(ky, kz);
    k += 0.0022 * (0.5 + 0.5 * Math.sin(th * 5 + rr * 260 + kx * 90));
  }
  d = smin(d, k, 0.014);
  return d;
}
// the body: the shoulders' slope, the collarbones, the shoulder's cap, chest and breast, going down into the dark
function torso(x: number, y: number, z: number) {
  const az = Math.abs(z);
  let d = ell(x - 0.03, y + 0.35, z, 0.1, 0.15, 0.13);
  // the slope of the shoulders (the near one raised and drawn forward, as the arm reaches out)
  if (z > 0) {
    d = smin(d, rcone(x, y, z, 0.04, -0.16, 0.0, SHOULDER[0] + 0.004, SHOULDER[1] + 0.022, SHOULDER[2] - 0.01, 0.038, 0.032), 0.03);
    d = smin(d, rcone(x, y, z, -0.052, -0.204, 0.017, SHOULDER[0] - 0.012, SHOULDER[1] + 0.012, SHOULDER[2] - 0.006, 0.0085, 0.0095), 0.012);
  } else {
    d = smin(d, rcone(x, y, az, 0.045, -0.165, 0.0, 0.018, -0.218, 0.15, 0.04, 0.031), 0.03);
    d = smin(d, ell(x - 0.012, y + 0.248, az - 0.168, 0.05, 0.056, 0.046), 0.03);
    d = smin(d, rcone(x, y, az, -0.052, -0.206, 0.017, 0.002, -0.213, 0.148, 0.0085, 0.0095), 0.012);
  }
  d = smin(d, ell(x + 0.036, y + 0.272, az - 0.058, 0.04, 0.04, 0.058), 0.03);
  d = smin(d, ell(x + 0.062, y + 0.33, az - 0.072, 0.044, 0.05, 0.048), 0.028);
  d = smin(d, rcone(x, y, z, 0.03, -0.44, 0, 0.03, -0.7, 0, 0.105, 0.1), 0.05);
  // (the notch between the collarbones)
  d = smax(d, -ell(x + 0.06, y + 0.205, z, 0.012, 0.01, 0.012), 0.008);
  return d;
}
function arm(x: number, y: number, z: number) {
  let d = rcone(x, y, z, ARM.S[0], ARM.S[1], ARM.S[2], ARM.E[0], ARM.E[1], ARM.E[2], 0.044, 0.031);
  // the shoulder's cap
  d = smin(d, ellA(x, y, z, DELTOID), 0.02);
  d = smin(d, ellA(x, y, z, BICEPS), 0.02);
  // the elbow, its point behind
  d = smin(d, ell(x - ARM.E[0] - 0.006, y - ARM.E[1] + 0.012, z - ARM.E[2], 0.025, 0.028, 0.025), 0.016);
  // the forearm: round near the elbow, flat at the wrist
  d = smin(d, rcone(x, y, z, ARM.E[0], ARM.E[1], ARM.E[2], ARM.W[0], ARM.W[1], ARM.W[2], 0.033, 0.019), 0.02);
  d = smin(d, ellA(x, y, z, FORE_BELLY), 0.026);
  d = smin(d, ellA(x, y, z, WRIST_E), 0.014);
  return d;
}
const H = HAND;
// the palm: a flat slab in the hand's frame (u along, s across, n out of the palm), narrowing to the wrist
function palm(x: number, y: number, z: number) {
  const dx = x - H.W[0];
  const dy = y - H.W[1];
  const dz = z - H.W[2];
  const lu = dx * H.u[0] + dy * H.u[1] + dz * H.u[2] - 0.044;
  const ls = dx * H.s[0] + dy * H.s[1] + dz * H.s[2] + 0.0005;
  const ln = dx * H.n[0] + dy * H.n[1] + dz * H.n[2] - 0.0035;
  const hw = 0.035 - 0.007 * Math.min(1, Math.max(0, -lu / 0.044));
  const r = 0.0075;
  const qx = Math.abs(lu) - (0.043 - r);
  const qy = Math.abs(ls) - (hw - r);
  const qz = Math.abs(ln) - (0.0095 - r);
  let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  d = smin(d, ellA(x, y, z, H.thenar), 0.012);
  d = smin(d, ellA(x, y, z, H.hypo), 0.01);
  // the knuckles, round on the back of the hand
  for (const k of H.knuckles) d = smin(d, Math.hypot(x - k[0] + H.n[0] * 0.003, y - k[1] + H.n[1] * 0.003, z - k[2] + H.n[2] * 0.003) - 0.0098, 0.008);
  return d;
}
function fingers(x: number, y: number, z: number) {
  let d = 1e9;
  // each finger: its three bones joined softly, so the joints swell a little and the creases stay
  for (let f = 0; f < 5; f++) {
    let fd = 1e9;
    for (let b = 0; b < 3; b++) fd = smin(fd, segD(x, y, z, H.segs[f * 3 + b]), 0.0035);
    d = Math.min(d, fd);
  }
  return d;
}
// bounds (the head's frame): what is far from a part need not ask it
const HB = { c: [0.0, -0.02, 0] as V, r: 0.17 };
const HANDB = { c: add(H.P0, mul(H.u, 0.01)) as V, r: 0.135 };
const dist = (x: number, y: number, z: number, c: V) => Math.hypot(x - c[0], y - c[1], z - c[2]);

// The skin's field (with the hair), in the head's frame. `part` is set to what is nearest: 0 skin, 1 hair.
let lastHair = 1;
let lastSkin = 1;
export function herLocal(x: number, y: number, z: number) {
  let d = 1e9;
  let hd = 1e9;
  const nearHead = dist(x, y, z, HB.c) - HB.r;
  if (nearHead < 0.06) {
    d = skull(x, y, z);
    d = smin(d, ear(x, y, z), 0.005);
    d = smin(d, neck(x, y, z), 0.02);
    hd = hair(x, y, z);
  } else d = nearHead + 0.03;
  // (z > -0.2: only her near side's arm; the far one is lost behind her)
  const t = torso(x, y, z);
  d = smin(d, t, 0.03);
  const nearHand = dist(x, y, z, HANDB.c) - HANDB.r;
  const ad = arm(x, y, z);
  d = smin(d, ad, 0.03);
  if (nearHand < 0.03) {
    let hd2 = palm(x, y, z);
    hd2 = smin(hd2, fingers(x, y, z), 0.006);
    d = smin(d, hd2, 0.012);
  }
  lastSkin = d;
  lastHair = hd;
  return smin(d, hd, 0.004);
}
// (soft across the hairline, so the hair's colour comes in over a few millimetres, not on a triangle's edge)
export const herPart = () => Math.min(1, Math.max(0, 0.5 + (lastSkin - lastHair) / 0.005));

// world → her frame, and the field in the world's own metres
export function toLocal(x: number, y: number, z: number): V {
  const lx = (x - HER_AT.x) / HER_S;
  const ly = (y - HER_AT.y) / HER_S;
  const lz = (z - HER_AT.z) / HER_S;
  // (undo the bow)
  return [lx * CP - ly * SP, lx * SP + ly * CP, lz];
}
export function herField(x: number, y: number, z: number) {
  const p = toLocal(x, y, z);
  return herLocal(p[0], p[1], p[2]) * HER_S;
}
// her frame → world
export function toWorld(p: V): V {
  const x = p[0] * CP + p[1] * SP;
  const y = -p[0] * SP + p[1] * CP;
  return [HER_AT.x + x * HER_S, HER_AT.y + y * HER_S, HER_AT.z + p[2] * HER_S];
}
