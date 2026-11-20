import * as THREE from "three";
import { noise2, ridge2, type V3 } from "../kit";

// The gate of the Offering: two mountains, each a long wall of rock, that lean toward one another as they
// climb until their crests cross far over the pass. Between their feet is a gorge, and the way on stands at
// its far end. Measured from the middle of the pass (x = 0, z = GATE.z).
export const GATE = { z: -650, off: 430, rx: 300, rz: 540, h: 1020, lean: 600 };
const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// a point of one mountain's skin: a is round it, k up it (0 at the foot, 1 at the crest)
export function massifPoint(side: number, seed: number, a: number, k: number, out = new THREE.Vector3()) {
  const y = -24 + (GATE.h + 24) * Math.pow(k, 0.95);
  const kk = Math.max(0, y / GATE.h);
  // the axis leans in, further the higher it goes; the two crests pass one before the other, like crossed blades
  const cx = side * (GATE.off - GATE.lean * Math.pow(kk, 1.35)) + Math.sin(k * 7 + seed) * 10 * k;
  const cz = side * -90 * kk * kk + Math.cos(k * 5 + seed) * 8;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const rib = ridge2(ca * 2.3 + seed, sa * 2.3 + k * 1.6 - seed, 5);
  const fine = ridge2(ca * 6.1 - seed, sa * 6.1 + k * 4.0 + seed, 3);
  const bed = noise2(k * 30 + seed, a * 0.7);
  // cliffs: the beds step in and out as they climb
  const step = Math.pow(Math.abs(Math.sin(k * 26 + bed * 3 + seed)), 6) * 0.07;
  const cut = 1 + 0.4 * (rib - 0.42) + 0.14 * (fine - 0.4) + 0.08 * (bed - 0.5) + step;
  const end = k >= 1 ? 0.02 : 1;
  out.set(cx + ca * GATE.rx * Math.pow(1 - k, 0.82) * cut * end, y, cz + sa * GATE.rz * Math.pow(1 - k, 0.55) * cut * end);
  return { p: out, rib, fine, bed, k };
}

export function buildMassif(side: number, seed: number, mobile: boolean) {
  const nA = mobile ? 96 : 176;
  const nH = mobile ? 56 : 112;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base: V3 = [0.075, 0.06, 0.105];
  const mid: V3 = [0.2, 0.145, 0.15];
  const top: V3 = [0.66, 0.43, 0.24];
  const v = new THREE.Vector3();
  for (let j = 0; j <= nH; j++) {
    const k = j / nH;
    for (let i = 0; i <= nA; i++) {
      const a = (i / nA) * Math.PI * 2;
      const q = massifPoint(side, seed, a, k, v);
      pos.push(v.x, v.y, v.z);
      const t = Math.min(1, Math.max(0, k * 1.2 + (q.rib - 0.4) * 0.4 + (q.fine - 0.4) * 0.15));
      let c = t < 0.55 ? mix3(base, mid, t / 0.55) : mix3(mid, top, (t - 0.55) / 0.45);
      // beds of paler and darker stone, here and there a rust of orange, a vein of plum
      const band = 0.7 + 0.55 * noise2(k * 38 + seed * 3 + q.bed * 1.5, a * 0.3);
      const hue = noise2(k * 9 + seed, a * 1.3 + seed);
      c = mix3(c, [c[0] * 1.5 + 0.03, c[1] * 0.95, c[2] * 0.6], Math.max(0, hue - 0.55) * 1.6);
      // the face that looks into the gorge is the darkest and coolest thing in the world
      const inward = Math.max(0, -Math.cos(a) * side) * (1 - k * 0.7);
      c = mix3(c, [0.05, 0.055, 0.09], inward * 0.55);
      col.push(c[0] * band, c[1] * band, c[2] * band, 0);
    }
  }
  const row = nA + 1;
  for (let j = 0; j < nH; j++)
    for (let i = 0; i < nA; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// a needle of rock: tall, thin, a little bent, ribbed like a bundle of reeds, as they stand in ranks in the picture
export function needleGeometry(h: number, w: number, seed: number, col: V3, tip: V3) {
  const g = new THREE.ConeGeometry(w, h, 7, 8);
  const p = g.attributes.position;
  const bend = (noise2(seed, 3.1) - 0.5) * w * 2.2;
  const c = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    // a shoulder two thirds of the way up, then the point
    const sw = 1 + 0.3 * Math.sin(t * 8 + seed) + (t > 0.55 && t < 0.75 ? 0.25 : 0);
    p.setX(i, p.getX(i) * sw + bend * t * t);
    p.setZ(i, p.getZ(i) * (1 + 0.22 * Math.cos(t * 6 + seed * 2)));
    const k = Math.min(1, t * 1.15);
    const band = 0.8 + 0.4 * noise2(t * 14 + seed, seed * 0.3);
    c.set([(col[0] + (tip[0] - col[0]) * k) * band, (col[1] + (tip[1] - col[1]) * k) * band, (col[2] + (tip[2] - col[2]) * k) * band, 0], i * 4);
  }
  g.setAttribute("aCol", new THREE.BufferAttribute(c, 4));
  g.deleteAttribute("uv");
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}
