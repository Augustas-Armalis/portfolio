import * as THREE from "three";
import { Kit, paint, type V3 } from "../kit";

// The mount of Paradise. He painted a shore curving away, a meadow of flowers behind it and a great flight of
// pale steps climbing out of the picture; here the curve is carried all the way round: a round isle in an
// endless sea, ringed by sand, then by the meadow, then by the steps, which climb from every side to a court
// open to the sky. Measured from the isle's own middle (the world's origin).
export const ISLE = { meadow: 525, tread: 13.5, rise: 4.8, n: 24, base: 9 };
export const TOP_R = ISLE.meadow - ISLE.n * ISLE.tread;
export const TOP_Y = ISLE.base + ISLE.n * ISLE.rise;
// how high the stone stands at a distance from the middle (the ground's own height outside the steps)
export const stoneAt = (r: number) => (r >= ISLE.meadow ? ISLE.base : ISLE.base + Math.min(ISLE.n, Math.floor((ISLE.meadow - r) / ISLE.tread) + 1) * ISLE.rise);

const TREAD: V3 = [0.66, 0.53, 0.24];
const LIP: V3 = [0.92, 0.78, 0.4];
const NOOK: V3 = [0.36, 0.28, 0.14];
const FACE: V3 = [0.46, 0.36, 0.17];
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// The steps: ring within ring. Each tread is palest along its lip and shaded in the nook under the next riser,
// so the flight reads as steps from any distance without a single line being drawn on it.
export function buildSteps(mobile: boolean) {
  const seg = mobile ? 96 : 220;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const ring = (r: number, y: number, c: V3, glow = 0.04) => {
    const b = pos.length / 3;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      col.push(c[0], c[1], c[2], glow);
    }
    return b;
  };
  const band = (a: number, b: number) => {
    for (let s = 0; s < seg; s++) idx.push(a + s, a + s + 1, b + s, a + s + 1, b + s + 1, b + s);
  };
  for (let i = 0; i < ISLE.n; i++) {
    const r0 = ISLE.meadow - i * ISLE.tread;
    const r1 = r0 - ISLE.tread;
    const y0 = ISLE.base + i * ISLE.rise;
    const y1 = y0 + ISLE.rise;
    // every sixth step a shade paler, so the flight has a slow rhythm in it
    const tone = 1 + 0.07 * Math.sin(i * 1.7) + (i % 4 === 3 ? 0.1 : 0);
    const t = (c: V3): V3 => [c[0] * tone, c[1] * tone, c[2] * tone];
    // the riser (the first goes down into the meadow)
    band(ring(r0, y0 - (i === 0 ? 6 : 0), t(mix3(FACE, NOOK, 0.5))), ring(r0, y1, t(FACE)));
    // the tread: lip, field, nook
    const lip = ring(r0, y1, t(LIP));
    const mid = ring(r0 - 2.0, y1, t(TREAD));
    const mid2 = ring(r1 + 3.6, y1, t(TREAD));
    const nook = ring(r1, y1, t(NOOK));
    band(lip, mid);
    band(mid, mid2);
    band(mid2, nook);
  }
  // the court at the top: pale paving in broad rings, down to the rim of the pool
  const rings: [number, V3][] = [
    [TOP_R, LIP],
    [TOP_R - 14, TREAD],
    [150, mix3(TREAD, [0.9, 0.8, 0.56], 0.5)],
    [148, NOOK],
    [126, mix3(TREAD, [0.95, 0.86, 0.6], 0.6)],
    [124, NOOK],
    [92, TREAD],
    [POOL_R + 5, LIP],
  ];
  let prev = -1;
  for (const [r, c] of rings) {
    const b = ring(r, TOP_Y, c);
    if (prev >= 0) band(prev, b);
    prev = b;
  }
  // the pool's kerb
  const k0 = ring(POOL_R + 5, TOP_Y + 1.3, LIP);
  band(prev, k0);
  const k1 = ring(POOL_R, TOP_Y + 1.3, TREAD);
  band(k0, k1);
  band(k1, ring(POOL_R, TOP_Y - 3, NOOK));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
export const POOL_R = 62;
export const COLONNADE = { r: 112, n: 28, h: 46 };

// ---------- wings ----------
// Wings are kept apart from the figures they belong to, so that they can breathe: each vertex remembers the
// spine it turns about (aPiv: x, z, which side, phase).
export class Wings {
  pos: number[] = [];
  col: number[] = [];
  piv: number[] = [];
  idx: number[] = [];
  // one wing: a tall narrow blade, fullest two thirds of the way up, bowed outward and back, standing well above the head
  add(m: THREE.Matrix4, side: number, open: number, col: V3, tip: V3, glow: number, phase: number) {
    const nu = 9;
    const nv = 3;
    const base = this.pos.length / 3;
    const v = new THREE.Vector3();
    const spine = new THREE.Vector3(0, 0, -0.1).applyMatrix4(m);
    const ca = Math.cos(open);
    const sa = Math.sin(open);
    for (let iu = 0; iu <= nu; iu++) {
      const u = iu / nu;
      const y = 0.22 + 2.2 * u;
      const half = 0.125 * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.35)), 0.7) + 0.01;
      for (let iv = 0; iv <= nv; iv++) {
        const w = iv / nv;
        const out = w * half * 2;
        const x = 0.05 + out;
        const z = -0.03 - out * 0.25 - 0.05 * Math.sin(Math.PI * u) * w + 0.03 * Math.sin(Math.PI * w) + 0.1 * (u - 0.5) * (u - 0.5);
        // turned back about the spine
        v.set(side * (x * ca + z * sa), y, -0.1 + (z * ca - x * sa)).applyMatrix4(m);
        this.pos.push(v.x, v.y, v.z);
        const t = Math.min(1, u * 0.8 + w * 0.3);
        this.col.push(col[0] + (tip[0] - col[0]) * t, col[1] + (tip[1] - col[1]) * t, col[2] + (tip[2] - col[2]) * t, glow);
        this.piv.push(spine.x, spine.z, side, phase);
      }
    }
    const row = nv + 1;
    for (let iu = 0; iu < nu; iu++)
      for (let iv = 0; iv < nv; iv++) {
        const a = base + iu * row + iv;
        this.idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.col, 4));
    g.setAttribute("aPiv", new THREE.Float32BufferAttribute(this.piv, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// An angel as he painted them here: slight, long-robed, a small bowed head, and two tall narrow wings of one
// soft colour standing up behind it well above the head and falling almost to the ground.
//   pose 0 hands folded   1 holding out a flower   2 a hand raised, a butterfly on it   3 arms at rest   4 bending to a flower
export function seraph(k: Kit, wings: Wings, p: V3, s: number, yaw: number, o: { robe: V3; wing: V3; pose?: number; glow?: number; open?: number; phase?: number }) {
  const glow = o.glow ?? 0.1;
  const pose = o.pose ?? 0;
  const bend = pose === 4 ? 1.1 : 0;
  const fig = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
  const WAIST = 0.95;
  const waist = new THREE.Matrix4().makeTranslation(0, WAIST, 0).multiply(new THREE.Matrix4().makeRotationX(bend)).multiply(new THREE.Matrix4().makeTranslation(0, -WAIST, 0));
  const upper = fig.clone().multiply(waist);
  const put = (g: THREE.BufferGeometry, m: THREE.Matrix4, col: V3, gl: number, top?: V3) => {
    const q = paint(g, col, gl, top);
    q.applyMatrix4(m);
    k.parts.push(q);
  };
  const at = (base: THREE.Matrix4, x: number, y: number, z: number, rot?: V3, sc?: V3) =>
    base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot ?? [0, 0, 0]))), new THREE.Vector3(...(sc ?? [1, 1, 1]))));
  const pale: V3 = [Math.min(1, o.robe[0] * 0.45 + 0.6), Math.min(1, o.robe[1] * 0.45 + 0.6), Math.min(1, o.robe[2] * 0.45 + 0.58)];
  const lathe = (pts: [number, number][]) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  // the robe: a long fall with a soft hem, gathered at the waist
  put(
    lathe([
      [0.27, 0],
      [0.255, 0.05],
      [0.2, 0.4],
      [0.16, 0.78],
      [0.14, WAIST],
    ]),
    fig,
    o.robe,
    glow,
    mix3(o.robe, pale, 0.5),
  );
  put(new THREE.SphereGeometry(0.143, 10, 8), at(fig, 0, WAIST, 0), mix3(o.robe, pale, 0.5), glow);
  put(
    lathe([
      [0.14, WAIST],
      [0.145, 1.15],
      [0.175, 1.36],
      [0.175, 1.44],
      [0.11, 1.53],
      [0.062, 1.57],
    ]),
    upper,
    mix3(o.robe, pale, 0.5),
    glow,
    pale,
  );
  // the head, a little bowed, and its hair
  put(new THREE.SphereGeometry(0.105, 12, 10), at(upper, 0, 1.675, 0.015), [0.95, 0.8, 0.68], glow * 1.3);
  put(new THREE.SphereGeometry(0.115, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), at(upper, 0, 1.685, -0.012, [-0.5, 0, 0]), [0.78, 0.56, 0.24], glow, [0.95, 0.76, 0.4]);
  // arms: long sleeves
  const arm = (sd: number, hand: THREE.Vector3) => {
    const sh = new THREE.Vector3(sd * 0.16, 1.42, 0);
    const el = sh.clone().lerp(hand, 0.5).add(new THREE.Vector3(sd * 0.05, -0.1, -0.02));
    const curve = new THREE.CatmullRomCurve3([sh, el, hand]);
    put(new THREE.TubeGeometry(curve, 8, 0.042, 6, false), upper, mix3(o.robe, pale, 0.6), glow, pale);
    put(new THREE.SphereGeometry(0.036, 6, 5), at(upper, hand.x, hand.y, hand.z), [0.95, 0.8, 0.68], glow * 1.3);
  };
  if (pose === 0) for (const sd of [-1, 1]) arm(sd, new THREE.Vector3(sd * 0.03, 1.2, 0.2));
  else if (pose === 1) {
    arm(1, new THREE.Vector3(0.16, 1.26, 0.38));
    arm(-1, new THREE.Vector3(-0.2, 0.92, 0.05));
    // the flower it holds: a pale bloom on a short stem
    put(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 4), at(upper, 0.16, 1.37, 0.39), [0.3, 0.42, 0.14], 0);
    put(new THREE.SphereGeometry(0.06, 8, 6), at(upper, 0.16, 1.5, 0.39, undefined, [1, 0.6, 1]), [1, 0.96, 0.82], 0.9);
  } else if (pose === 2) {
    arm(1, new THREE.Vector3(0.3, 1.78, 0.14));
    arm(-1, new THREE.Vector3(-0.2, 0.92, 0.05));
    // a butterfly settled on the raised hand
    for (const sd of [-1, 1]) put(new THREE.CircleGeometry(0.07, 6), at(upper, 0.3 + sd * 0.045, 1.86, 0.14, [0.3, sd * 0.7, 0]), [1, 0.8, 0.3], 0.8);
  } else if (pose === 4) {
    arm(1, new THREE.Vector3(0.12, 0.72, 0.42));
    arm(-1, new THREE.Vector3(-0.2, 1.0, 0.16));
  } else for (const sd of [-1, 1]) arm(sd, new THREE.Vector3(sd * 0.22, 0.9, 0.04));
  const open = o.open ?? 0.3;
  const tip: V3 = [Math.min(1, o.wing[0] * 0.55 + 0.42), Math.min(1, o.wing[1] * 0.55 + 0.42), Math.min(1, o.wing[2] * 0.55 + 0.42)];
  // bent over, the wings come forward with the back and arch over the figure like a shell
  const wm = pose === 4 ? upper.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.05, 0.05)).multiply(new THREE.Matrix4().makeScale(1.25, 0.95, 1.25)) : fig;
  for (const sd of [-1, 1]) wings.add(wm, sd, open, o.wing, tip, glow, o.phase ?? (p[0] * 0.37 + p[2] * 0.61) % 6.28);
}

// the pale columns of the court and the ring they carry
export function buildColonnade(k: Kit) {
  const stone: V3 = [0.56, 0.44, 0.22];
  const lit: V3 = [0.98, 0.84, 0.5];
  for (let i = 0; i < COLONNADE.n; i++) {
    // (the bays to north and south are left open: the way in from the great flight, and the way on)
    if (i === 20 || i === 21 || i === 6 || i === 7) continue;
    const a = ((i + 0.5) / COLONNADE.n) * Math.PI * 2;
    const x = Math.cos(a) * COLONNADE.r;
    const z = Math.sin(a) * COLONNADE.r;
    const h = COLONNADE.h;
    k.lathe(
      [
        [3.4, 0],
        [3.4, 1.4],
        [2.5, 2.2],
        [2.1, 4],
        [1.7, h * 0.94],
        [2.0, h * 0.955],
        [3.0, h * 0.985],
        [3.0, h],
      ],
      [x, TOP_Y, z],
      stone,
      { top: lit, seg: 12, glow: 0.08 },
    );
  }
  // the ring: a slender beam carried round on the capitals, and a finer one above it
  k.add(new THREE.TorusGeometry(COLONNADE.r, 2.2, 6, 120), [0, TOP_Y + COLONNADE.h + 1.6, 0], stone, { top: lit, rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.8], glow: 0.18 });
  k.add(new THREE.TorusGeometry(COLONNADE.r, 0.9, 5, 120), [0, TOP_Y + COLONNADE.h + 5.2, 0], lit, { rot: [Math.PI / 2, 0, 0], glow: 0.5 });
}
