import * as THREE from "three";
import { rng, type TreeKind } from "./land";

// The trees of the home world, modelled in code. A tree is a real trunk with
// boughs, and a crown made the way a painter makes one: hundreds of small
// clumps of leaves, each a little card that always faces the eye and carries
// a painted cluster of leaves, set on the skins of the crown's rounded lobes.
// Every clump takes its light from the crown's own roundness (its normal
// leans out from the heart of the crown) and from its own (it is a small
// rounded form, lit on top), and is darker the deeper it sits. So a crown is
// soft and broken at its edge, light above and shaded beneath, with sky
// between the leaves, and nowhere a facet.
//
//   broad    an oak or a lime: a short forking trunk, a wide heaped crown
//   birch    a slender white stem, fine boughs, light airy leaves that hang
//   pine     the Lithuanian pine: a tall bare ochre trunk, flat clouds of needles carried high
//   spruce   tier on tier of drooping boughs to a spire
//   cypress  a dark narrow flame, as in his landscapes and the tower plain
//   bush     hazel and willow at the wood's edge
//
// `rich` 1 is a tree seen close; 0 the same tree in fewer, larger clumps.

type V3 = [number, number, number];
class Mesh {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  fol: number[] = [];
  corner: number[] = [];
  leaf: number[] = [];
  idx: number[] = [];
  get count() {
    return this.pos.length / 3;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("aFol", new THREE.Float32BufferAttribute(this.fol, 1));
    g.setAttribute("aCorner", new THREE.Float32BufferAttribute(this.corner, 2));
    g.setAttribute("aLeaf", new THREE.Float32BufferAttribute(this.leaf, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    // (the cards reach out from their centres)
    if (g.boundingSphere) g.boundingSphere.radius += 2.5;
    return g;
  }
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mixc = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];

// One clump of leaves: a card at `c`, `size` metres from its middle to its edge, wearing cell `cell` of the leaf
// sheet, turned by `turn` (in turns). `n` is the way it faces the light, `inner` 0 (deep in the crown) .. 1 (its skin).
function card(m: Mesh, c: THREE.Vector3, size: number, cell: number, turn: number, n: THREE.Vector3, inner: number, col: V3) {
  const base = m.count;
  for (let i = 0; i < 4; i++) {
    m.pos.push(c.x, c.y, c.z);
    m.nor.push(n.x, n.y, n.z);
    m.col.push(col[0], col[1], col[2]);
    m.fol.push(1);
    m.corner.push(CORNERS[i * 2], CORNERS[i * 2 + 1]);
    m.leaf.push(size, turn, cell, inner);
  }
  m.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// A rounded lobe of a crown: clumps set on its skin (a few a little way in), and a dark heart so no sky shows
// straight through it.
// (heartCell, heartK: the card at a lobe's middle: by default the dense round mass at nearly the lobe's width; a pine's
// flat pads take a sprig of needles at a smaller size, or that middle card would show as a glossy ball)
function lobe(m: Mesh, r: () => number, c: THREE.Vector3, rad: V3, n: number, size: number, cell: number, heart: THREE.Vector3, heartR: number, lo: V3, hi: V3, spin = 1, heartCell = 3, heartK = 0.92) {
  const p = V(0, 0, 0);
  const nn = V(0, 0, 0);
  const d = V(0, 0, 0);
  card(m, c, Math.max(rad[0], rad[2]) * heartK, heartCell, r() * spin, V(0, 0.6, 0).add(c.clone().sub(heart).normalize().multiplyScalar(0.6)).normalize(), 0.12, mixc(lo, hi, 0.15));
  let made = 0;
  let guard = 0;
  while (made < n && guard++ < n * 6) {
    const y = 1 - 2 * r();
    // (few clumps underneath: a crown is hollow and dark below)
    if (y < -0.25 && r() < 0.75) continue;
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - y * y));
    d.set(s * Math.cos(a), y, s * Math.sin(a));
    const u = r();
    const k = 1 - 0.42 * u * u * u;
    p.set(c.x + d.x * rad[0] * k, c.y + d.y * rad[1] * k, c.z + d.z * rad[2] * k);
    nn.copy(p).sub(heart);
    const far = Math.min(1, nn.length() / Math.max(heartR, 1e-3));
    nn.normalize().multiplyScalar(0.62).addScaledVector(d, 0.38);
    nn.y += 0.12;
    nn.normalize();
    const inner = Math.min(1, Math.max(0.2, far * far * 1.05)) * (0.62 + 0.38 * (d.y * 0.5 + 0.5)) * (0.75 + 0.25 * k);
    card(m, p, size * (0.78 + r() * 0.5), cell, (r() - 0.5) * spin, nn, inner, mixc(lo, hi, 0.25 + 0.75 * r()));
    made++;
  }
}

// A tapered limb along a curve, its bark running from one colour to another.
function limb(m: Mesh, pts: THREE.Vector3[], r0: number, r1: number, sides: number, steps: number, c0: V3, c1: V3, fol = 0, flare = 0) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const base = m.count;
  const t = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const X = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const c = curve.getPoint(k);
    curve.getTangent(k, t);
    a.crossVectors(t, Math.abs(t.y) > 0.95 ? X : up).normalize();
    b.crossVectors(t, a).normalize();
    // the foot of a trunk spreads into the ground
    const r = (r0 + (r1 - r0) * Math.pow(k, 0.8)) * (1 + flare * Math.exp(-k * 14));
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      const nx = a.x * Math.cos(ang) + b.x * Math.sin(ang);
      const ny = a.y * Math.cos(ang) + b.y * Math.sin(ang);
      const nz = a.z * Math.cos(ang) + b.z * Math.sin(ang);
      m.pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
      m.nor.push(nx, ny, nz);
      m.col.push(c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k);
      m.fol.push(fol);
      m.corner.push(0, 0);
      m.leaf.push(0, 0, 0, 1);
    }
  }
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < sides; j++) {
      const p0 = base + i * sides + j;
      const p1 = base + i * sides + ((j + 1) % sides);
      m.idx.push(p0, p0 + sides, p1, p1, p0 + sides, p1 + sides);
    }
}

// ---------- the kinds ----------
const BARK: V3 = [0.085, 0.07, 0.058];
const BARK2: V3 = [0.15, 0.115, 0.085];

function broad(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 10.5 + r() * 3.5;
  const lean = (r() - 0.5) * 0.9;
  const fork = H * (0.26 + r() * 0.07);
  const at = (k: number) => V(lean * k * k + Math.sin(k * 2.2 + seed) * 0.12, fork * k, Math.cos(k * 1.7 + seed) * 0.1);
  limb(m, [at(0), at(0.35), at(0.7), at(1)], 0.34, 0.2, rich ? 9 : 5, rich ? 6 : 2, BARK, BARK2, 0, 0.6);
  const top = at(1);
  const W = H * (0.43 + r() * 0.09);
  // the crown is a broad spreading head, wider than it is tall and never regular: lobes of unlike sizes set loosely on
  // a low dome, some standing out past it, one side fuller than the other
  const mid = H * 0.62;
  const side = r() * 6.28;
  const heart = V(top.x + lean * 0.3, mid, 0);
  const lo: V3 = [0.03, 0.085, 0.03];
  const hi: V3 = [0.075, 0.15, 0.045];
  const rings = rich ? [5, 5, 4, 1] : [3, 3, 1];
  rings.forEach((count, ri) => {
    const t = ri / (rings.length - 1); // 0 the lowest ring .. 1 the top
    const y = H * (0.46 + 0.4 * t);
    const out = W * Math.sqrt(Math.max(0, 1 - Math.pow((y - mid) / (H * 0.36), 2))) * 0.9;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ri * 1.1 + r() * 0.7;
      const d = count === 1 ? out * 0.25 * r() : out * (0.58 + r() * 0.5) * (1 + 0.22 * Math.cos(a - side));
      const w = W * (0.3 + r() * 0.22) * (1 - 0.25 * Math.abs(t - 0.4));
      const c = V(heart.x + Math.cos(a) * d, y + (r() - 0.5) * H * 0.11, heart.z + Math.sin(a) * d);
      // a bough out to each of the lower lobes
      if (ri < 2 && (rich || i % 2 === 0)) limb(m, [top.clone().setY(top.y - 0.3), top.clone().lerp(c, 0.5).add(V(0, H * 0.04, 0)), c.clone().setY(c.y - w * 0.35)], 0.13, 0.03, rich ? 6 : 3, rich ? 4 : 2, BARK2, BARK2);
      lobe(m, r, c, [w * (0.95 + r() * 0.25), w * (0.66 + r() * 0.2), w * (0.9 + r() * 0.25)], rich ? 15 : 6, w * (rich ? 0.44 : 0.64), 0, heart, W * 1.2, lo, hi);
    }
  });
  return m.geometry();
}

function birch(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 11.5 + r() * 3.5;
  const lean = (r() - 0.5) * 1.6;
  const at = (k: number) => V(lean * k * k + Math.sin(k * 2.4 + seed) * 0.16, H * k, Math.cos(k * 2 + seed) * 0.14);
  const white: V3 = [0.8, 0.78, 0.72];
  // the white stem runs right up through the crown
  limb(m, [at(0), at(0.25), at(0.5), at(0.75), at(0.98)], 0.115, 0.016, rich ? 8 : 4, rich ? 12 : 4, [0.42, 0.4, 0.37], white, 0.5, 0.4);
  const lo: V3 = [0.075, 0.15, 0.035];
  const hi: V3 = [0.16, 0.25, 0.06];
  const heart = at(0.7);
  // fine boughs that rise a little and then hang; the leaves hang along them in loose strands, so the crown is a
  // narrow airy egg with sky through it, widest two thirds of the way up
  const n = rich ? 15 : 7;
  for (let j = 0; j < n; j++) {
    const k = 0.4 + (j / (n - 1)) * 0.56;
    const o = at(k);
    const a = j * 2.4 + r() * 0.9;
    const reach = H * 0.17 * Math.sin(Math.PI * Math.pow((k - 0.36) / 0.66, 0.8)) * (0.75 + r() * 0.45) + 0.35;
    const dir = V(Math.cos(a), 0, Math.sin(a));
    const tip = o.clone().addScaledVector(dir, reach).add(V(0, -reach * (0.35 + r() * 0.3), 0));
    const midp = o.clone().addScaledVector(dir, reach * 0.55).add(V(0, reach * 0.18, 0));
    if (rich || j % 2 === 0) limb(m, [o, midp, tip], 0.026, 0.006, 4, 3, white, [0.3, 0.26, 0.22], 0.5);
    const cards = rich ? 5 : 2;
    for (let i = 0; i < cards; i++) {
      const t = (i + 0.6 + r() * 0.5) / (cards + 0.6);
      // along the bough, then hanging below it
      const p = o.clone().lerp(midp, Math.min(1, t * 1.8)).lerp(tip, Math.max(0, t * 1.8 - 1) / 0.8);
      p.y -= 0.15 + r() * 0.55;
      p.x += (r() - 0.5) * 0.5;
      p.z += (r() - 0.5) * 0.5;
      const nn = p.clone().sub(heart).normalize();
      nn.y += 0.35;
      nn.normalize();
      const far = Math.min(1, p.distanceTo(heart) / (H * 0.2));
      card(m, p, (rich ? 0.5 : 0.82) * (0.8 + r() * 0.45), 1, (r() - 0.5) * 0.1, nn, 0.5 + 0.5 * far, mixc(lo, hi, 0.2 + 0.8 * r()));
    }
  }
  // the top: a few small sprays
  for (let i = 0; i < (rich ? 5 : 2); i++) {
    const p = at(0.93 + r() * 0.07).add(V((r() - 0.5) * 0.7, (r() - 0.3) * 0.5, (r() - 0.5) * 0.7));
    card(m, p, 0.42 * (0.8 + r() * 0.4), 1, (r() - 0.5) * 0.12, V((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize(), 1, mixc(lo, hi, 0.5 + 0.5 * r()));
  }
  return m.geometry();
}

function pine(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 14 + r() * 4;
  const lean = (r() - 0.5) * 1.5;
  const lz = (r() - 0.5) * 0.8;
  const at = (k: number) => V(lean * k * k + Math.sin(k * 3.1 + seed) * 0.18, H * k, lz * k * k);
  limb(m, [at(0), at(0.3), at(0.6), at(0.85), at(0.97)], 0.24, 0.06, rich ? 9 : 5, rich ? 10 : 4, [0.11, 0.09, 0.08], [0.52, 0.27, 0.12], 0, 0.4);
  // bare stubs where the lower branches broke away
  if (rich)
    for (let i = 0; i < 3; i++) {
      const k = 0.36 + i * 0.1 + r() * 0.05;
      const a = r() * Math.PI * 2;
      const o = at(k);
      limb(m, [o, o.clone().add(V(Math.cos(a) * 0.6, 0.14, Math.sin(a) * 0.6)), o.clone().add(V(Math.cos(a) * 1.1, 0.05, Math.sin(a) * 1.1))], 0.035, 0.008, 4, 2, [0.2, 0.14, 0.1], [0.24, 0.17, 0.12]);
    }
  const lo: V3 = [0.02, 0.06, 0.04];
  const hi: V3 = [0.05, 0.105, 0.055];
  const heart = at(0.84);
  const W = 2.7 + r() * 0.9;
  // the crown: flat clouds of needles carried out on branches in a loose spiral, the whole a broad flat-topped head
  const tiers = rich ? 5 : 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const o = at(0.66 + t * 0.28);
    const w = W * (0.66 - t * 0.2) * (0.85 + r() * 0.3);
    const a = i * 2.4 + r();
    const off = W * (0.78 - t * 0.55) * (0.8 + r() * 0.3);
    const c = V(o.x + Math.cos(a) * off, o.y + 0.6 + r() * 0.5, o.z + Math.sin(a) * off);
    limb(m, [o, o.clone().lerp(c, 0.55).add(V(0, 0.3, 0)), c.clone().setY(c.y - 0.2)], 0.075, 0.02, rich ? 5 : 3, 2, [0.4, 0.22, 0.11], [0.3, 0.19, 0.1]);
    // (the coarse cut too has many smallish cards in a flat pad: a few big ones read as glossy balls)
    lobe(m, r, c, [w, w * 0.4, w * 0.92], rich ? 16 : 11, w * (rich ? 0.36 : 0.38), 2, heart, W * 1.4, lo, hi, 1, 2, 0.62);
  }
  const cap = at(0.99);
  const cw = W * 0.56;
  lobe(m, r, V(cap.x, cap.y + 0.25, cap.z), [cw, cw * 0.45, cw], rich ? 12 : 8, cw * (rich ? 0.4 : 0.42), 2, heart, W * 1.4, lo, hi, 1, 2, 0.62);
  return m.geometry();
}

function spruce(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 13 + r() * 5;
  const bend = (r() - 0.5) * 0.3;
  limb(m, [V(0, 0, 0), V(bend * 0.4, H * 0.5, 0), V(bend, H * 0.99, 0)], 0.19, 0.02, rich ? 7 : 4, rich ? 5 : 2, [0.08, 0.066, 0.058], [0.13, 0.1, 0.085], 0, 0.3);
  const lo: V3 = [0.012, 0.042, 0.03];
  const hi: V3 = [0.032, 0.078, 0.045];
  const n = rich ? 10 : 7;
  const W = H * (0.2 + r() * 0.035);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const y = H * (0.17 + 0.8 * k);
    // widest low down, drawing in to the spire; not a straight cone: a slight belly
    const w = W * (Math.pow(1 - k, 0.82) + 0.05) * (0.9 + r() * 0.2);
    const size = (w * 0.5 + 0.34) * (rich ? 1 : 1.1);
    const count = Math.max(3, Math.round(((Math.PI * 2 * w) / (size * 1.25)) * (rich ? 1 : 0.9)));
    const ph = r() * 6.28;
    // the dark heart of the tier, at the stem
    // (a sprig of needles, not the dense round mass: that, one to a tier, stacked as a column of glossy balls)
    card(m, V(bend * k, y - size * 0.2, 0), w * 0.62 + 0.25, 2, r() * 6.28, V(0, 0.5, 0.2).normalize(), 0.1, mixc(lo, hi, 0.1));
    for (let j = 0; j < count; j++) {
      const a = ph + (j / count) * Math.PI * 2 + (r() - 0.5) * 0.4;
      const rr = w * (0.62 + r() * 0.42);
      // each bough droops toward its tip
      const p = V(bend * k + Math.cos(a) * rr, y - rr * 0.3 - size * 0.25 + (r() - 0.5) * 0.3, Math.sin(a) * rr);
      const nn = V(Math.cos(a), 0.62, Math.sin(a)).normalize();
      card(m, p, size * (0.82 + r() * 0.36), 2, (r() - 0.5) * 0.08, nn, 0.45 + 0.55 * Math.min(1, rr / Math.max(w, 0.01)) * (0.5 + 0.5 * k), mixc(lo, hi, 0.2 + 0.8 * r()));
    }
  }
  // the leader
  limb(m, [V(bend, H * 0.96, 0), V(bend, H * 1.06, 0)], 0.045, 0.004, 4, 1, hi, hi, 0);
  card(m, V(bend, H * 1.0, 0), 0.5, 2, 0, V(0, 1, 0), 1, hi);
  return m.geometry();
}

function cypress(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 11 + r() * 5;
  limb(m, [V(0, 0, 0), V(0, H * 0.25, 0)], 0.16, 0.1, rich ? 6 : 4, 1, BARK, BARK2, 0, 0.3);
  const lo: V3 = [0.012, 0.038, 0.026];
  const hi: V3 = [0.03, 0.07, 0.036];
  const n = rich ? 12 : 6;
  const W = H * 0.085;
  const heart = V(0, H * 0.5, 0);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const y = H * (0.1 + 0.86 * k);
    // a flame: narrow foot, fullest a third of the way up, drawn to a point
    const w = W * (0.5 + 1.15 * Math.sin(Math.PI * Math.pow(k, 0.62)) * (1 - k * 0.55)) * (0.9 + r() * 0.2);
    const count = rich ? 5 : 3;
    const ph = r() * 6.28;
    for (let j = 0; j < count; j++) {
      const a = ph + (j / count) * Math.PI * 2;
      const p = V(Math.cos(a) * w * 0.55, y + (r() - 0.5) * 0.5, Math.sin(a) * w * 0.55);
      const nn = V(Math.cos(a), 0.3 + 0.5 * k, Math.sin(a)).normalize();
      card(m, p, w * 0.85 * (0.85 + r() * 0.3) * (rich ? 1 : 1.25), 3, (r() - 0.5) * 0.3, nn, 0.55 + 0.45 * k, mixc(lo, hi, 0.2 + 0.8 * r()));
    }
    void heart;
  }
  return m.geometry();
}

function bush(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const lo: V3 = [0.035, 0.09, 0.03];
  const hi: V3 = [0.085, 0.16, 0.045];
  const n = rich ? 4 : 2;
  const heart = V(0, 0.7, 0);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28;
    const d = r() * 1.1;
    const w = 0.85 + r() * 0.6;
    lobe(m, r, V(Math.cos(a) * d, 0.75 + r() * 0.7, Math.sin(a) * d), [w, w * 0.8, w], rich ? 11 : 6, w * (rich ? 0.44 : 0.6), i % 2 ? 0 : 3, heart, 2.3, lo, hi);
  }
  return m.geometry();
}

const BUILD: Record<TreeKind, (seed: number, rich: number) => THREE.BufferGeometry> = { broad, birch, pine, spruce, cypress, bush };
const SEEDS: Record<TreeKind, number[]> = { broad: [13, 57, 91], birch: [7, 23, 41], pine: [11, 29, 47], spruce: [5, 19, 37], cypress: [3, 17, 31], bush: [9, 21, 33] };
export const VARIANTS = 2;

// ---------- the tree library: one for the home field, the journey and the painted worlds ----------
//
//   buildTree(kind, variant, rich)  a whole tree as ONE geometry (trunk, boughs and leaf clumps), origin at its foot,
//                                   about 10 to 18 m tall. kind: broad | birch | pine | spruce | cypress | bush;
//                                   variant 0..VARIANTS-1; rich 1 the full cut (150 to 200 clumps), 0 the coarse one.
//   makeLeafTexture()               the sheet of leaf clumps the geometry's cards wear (the material's uLeafTex).
//   makeFarTreeTexture(), FAR_KIND  one painted card a tree, for woods far off.
//
// All three are made once and shared: every caller gets the same geometry and the same textures, so a wood in the
// journey, the town's lindens and a world's grove cost no second copy on the card and no second build behind the
// loader. (Disposing one is harmless: three puts it back on the card the next time it is drawn.) Draw a tree with
// an InstancedMesh of the geometry and makeHomeTreeMaterial(makeLeafTexture()) from Forest.tsx: instance matrices
// place and scale it, instance colours tint its leaves; it sways, takes the sky's light and the air, and its
// leaf edges are antialiased by coverage. A tree's cut is chosen once, where it stands: nothing switches level as
// the eye moves, so nothing pops.
const GEO = new Map<string, THREE.BufferGeometry>();
export function buildTree(kind: TreeKind, variant: number, rich: number) {
  const v = variant % SEEDS[kind].length;
  const key = `${kind}:${v}:${rich ? 1 : 0}`;
  let g = GEO.get(key);
  if (!g) GEO.set(key, (g = BUILD[kind](SEEDS[kind][v], rich ? 1 : 0)));
  return g;
}
export const TREE_KINDS: TreeKind[] = ["broad", "birch", "pine", "spruce", "cypress", "bush"];
let LEAVES: THREE.Texture | null = null;
let FAR: THREE.Texture | null = null;

// ---------- the painted sheets ----------
function sheet(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, size, size);
  return { c, g };
}
function finish(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.premultiplyAlpha = false;
  t.flipY = false;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// Four clumps of leaves, 2 x 2: broad leaves, a hanging birch spray, a tuft of needles, a dense round mass.
// Alpha is the leaves; the green channel is each leaf's own tone (those on top are lighter).
export function makeLeafTexture() {
  if (LEAVES) return LEAVES;
  const S = 256;
  const { c, g } = sheet(S * 2);
  const r = rng(733);
  const leaf = (x: number, y: number, rx: number, ry: number, rot: number, v: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const tone = Math.round(255 * v);
    g.fillStyle = `rgb(${tone},${tone},${tone})`;
    g.beginPath();
    // a leaf: pointed at both ends
    g.moveTo(-rx, 0);
    g.quadraticCurveTo(0, -ry * 1.5, rx, 0);
    g.quadraticCurveTo(0, ry * 1.5, -rx, 0);
    g.fill();
    g.restore();
  };
  const cell = (i: number, draw: (cx: number, cy: number) => void) => {
    g.save();
    const ox = (i % 2) * S;
    const oy = Math.floor(i / 2) * S;
    g.beginPath();
    g.rect(ox, oy, S, S);
    g.clip();
    draw(ox + S / 2, oy + S / 2);
    g.restore();
  };
  // 0: broad leaves, a ragged round clump
  cell(0, (cx, cy) => {
    for (let i = 0; i < 95; i++) {
      const a = r() * 6.283;
      const d = 100 * Math.pow(r(), 0.62);
      if (d > 66 && r() < (d - 66) / 52) continue;
      leaf(cx + Math.cos(a) * d * 0.98, cy + Math.sin(a) * d * 0.94, 15 + r() * 9, 7 + r() * 4, r() * 6.283, 0.45 + 0.55 * (i / 95) * (0.7 + 0.3 * r()));
    }
  });
  // 1: a birch spray: small leaves hanging, with air between
  cell(1, (cx, cy) => {
    for (let i = 0; i < 64; i++) {
      const x = (r() - 0.5) * 2;
      const y = (r() - 0.5) * 2;
      if (x * x * 1.5 + y * y > 0.92 + r() * 0.2) continue;
      leaf(cx + x * 92, cy + y * 108, 11 + r() * 6, 6.5 + r() * 3, Math.PI / 2 + (r() - 0.5) * 1.1, 0.5 + 0.5 * (i / 64) * (0.7 + 0.3 * r()));
    }
  });
  // 2: needles: sprigs fanning out from the middle
  cell(2, (cx, cy) => {
    g.lineCap = "round";
    for (let i = 0; i < 34; i++) {
      const a = r() * 6.283;
      const d = 78 * Math.pow(r(), 0.7);
      const sx = cx + Math.cos(a) * d;
      const sy = cy + Math.sin(a) * d * 0.92;
      const out = a + (r() - 0.5) * 1.2;
      const tone = Math.round(255 * (0.45 + 0.55 * (i / 34) * (0.7 + 0.3 * r())));
      g.strokeStyle = `rgb(${tone},${tone},${tone})`;
      for (let j = 0; j < 9; j++) {
        const fa = out + (j / 8 - 0.5) * 1.9;
        const len = 20 + r() * 14;
        g.lineWidth = 3.4 + r() * 1.8;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(fa) * len, sy + Math.sin(fa) * len);
        g.stroke();
      }
    }
  });
  // 3: a dense round mass (the heart of a lobe, a cypress, a hedge)
  cell(3, (cx, cy) => {
    for (let i = 0; i < 150; i++) {
      const a = r() * 6.283;
      const d = 104 * Math.pow(r(), 0.55);
      if (d > 86 && r() < (d - 86) / 26) continue;
      leaf(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 12 + r() * 6, 8 + r() * 4, r() * 6.283, 0.4 + 0.6 * (i / 150) * (0.7 + 0.3 * r()));
    }
  });
  return (LEAVES = finish(c));
}

// Four whole trees for the far woods, 2 x 2, each standing on the bottom of its cell: a broad crown, a pine, a
// spruce, a narrow flame. Red is which way the form faces across (left 0 .. right 1), green how much it looks up
// (the tops of its lumps are light, their undersides dark), blue 1 for leaves and 0 for bark.
export function makeFarTreeTexture() {
  if (FAR) return FAR;
  const S = 256;
  const { c, g } = sheet(S * 2);
  const r = rng(1291);
  // soft: 1 a lump with a lit top and a dark underside (the broad crowns' big lumps); below 1 a flat tuft that only
  // takes its tone from where it sits, so a drift of many reads as foliage, never as a heap of glossy beads
  const blob = (x: number, y: number, rad: number, nx: number, top: number, soft = 1) => {
    const R = Math.round(255 * Math.min(1, Math.max(0, nx * 0.5 + 0.5)));
    if (soft < 0.5) {
      // a flat tuft: one tone, set by where it sits (its `top`), so where tufts overlap there is no rim and no bead: a
      // spruce's tier or a pine's pad is one mass of needles, lit on its upper side and dark under it
      g.fillStyle = `rgb(${R},${Math.round(255 * Math.min(1, Math.max(0, top)))},255)`;
      g.beginPath();
      g.arc(x, y, rad, 0, 6.2832);
      g.fill();
      return;
    }
    const gr = g.createRadialGradient(x, y - rad * 0.55 * soft, rad * 0.1, x, y, rad);
    const hi = Math.round(255 * Math.min(1, top + 0.22 * soft));
    const lo = Math.round(255 * Math.max(0, top - 0.42 * soft));
    gr.addColorStop(0, `rgb(${R},${hi},255)`);
    gr.addColorStop(0.55, `rgb(${R},${Math.round((hi + lo) / 2)},255)`);
    gr.addColorStop(1, `rgb(${R},${lo},255)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, rad, 0, 6.2832);
    g.fill();
  };
  const trunk = (x: number, y0: number, y1: number, w0: number, w1: number, bend = 0) => {
    g.fillStyle = "rgb(128,110,0)";
    g.beginPath();
    g.moveTo(x - w0, y0);
    g.quadraticCurveTo(x - w1 + bend, (y0 + y1) / 2, x - w1 + bend * 0.6, y1);
    g.lineTo(x + w1 + bend * 0.6, y1);
    g.quadraticCurveTo(x + w1 + bend, (y0 + y1) / 2, x + w0, y0);
    g.fill();
  };
  const at = (i: number, draw: (ox: number, oy: number) => void) => {
    g.save();
    const ox = (i % 2) * S;
    const oy = Math.floor(i / 2) * S;
    g.beginPath();
    g.rect(ox, oy, S, S);
    g.clip();
    draw(ox, oy);
    g.restore();
  };
  // a heap of lumps inside an outline, the lower ones drawn first so the upper lie over them
  const heap = (ox: number, oy: number, cx: number, cy: number, rx: number, ry: number, n: number, rad: [number, number], flat = 1, soft = 1) => {
    const list: [number, number, number][] = [];
    let guard = 0;
    while (list.length < n && guard++ < n * 20) {
      const x = (r() - 0.5) * 2;
      const y = (r() - 0.5) * 2;
      if (x * x + y * y > 1) continue;
      list.push([x, y, rad[0] + r() * (rad[1] - rad[0])]);
    }
    list.sort((a, b) => b[1] - a[1]);
    for (const [x, y, rr] of list) blob(ox + cx + x * rx, oy + cy + y * ry * flat, rr, x * 0.95, 0.5 - y * 0.42 + (r() - 0.5) * (soft < 0.5 ? 0.035 : 0.12), soft);
  };
  // 0: a broad crown on a short trunk: one heaped, uneven mass of fine flat tufts that comes down low (never a ball on a
  // stick, never a cluster of glossy balls): lit on its upper side, dark under its lower lobes
  at(0, (ox, oy) => {
    trunk(ox + 128, oy + 256, oy + 196, 10, 7, 3);
    heap(ox, oy, 128, 150, 108, 84, 190, [8, 14], 1, 0.3);
    heap(ox, oy, 92, 104, 58, 52, 90, [7, 12], 1, 0.3);
    heap(ox, oy, 162, 92, 56, 56, 90, [7, 12], 1, 0.3);
    heap(ox, oy, 124, 62, 52, 38, 60, [6, 11], 1, 0.3);
  });
  // 1: a pine: bare trunk, a flat-topped head
  at(1, (ox, oy) => {
    trunk(ox + 128, oy + 256, oy + 70, 6, 3.5, 6);
    // (flat clouds of needles, each a drift of many small overlapping tufts: from far off, a flat pad with a ragged
    // edge, never a heap of balls)
    heap(ox, oy, 134, 56, 74, 26, 90, [5.5, 9.5], 1, 0.3);
    heap(ox, oy, 100, 84, 44, 15, 44, [5, 8.5], 1, 0.3);
    heap(ox, oy, 162, 94, 38, 12, 34, [4.5, 8], 1, 0.3);
    heap(ox, oy, 116, 120, 26, 8, 16, [4.5, 7.5], 1, 0.3);
  });
  // 2: a spruce: drooping tiers narrowing to a spire, each a skirt of overlapping fine tufts (never a row of balls):
  // the tuft spacing is far inside its size, so what is seen is one fringed tier lying over the one below it
  at(2, (ox, oy) => {
    trunk(ox + 128, oy + 256, oy + 204, 5, 4);
    const tiers = 12;
    for (let i = 0; i < tiers; i++) {
      const k = i / (tiers - 1);
      const y = 222 - k * 190;
      const w = 64 * Math.pow(1 - k, 0.9) + 4;
      const n = Math.max(2, Math.round(w / 3.2));
      for (let j = 0; j < n; j++) {
        const x = n === 1 ? 0 : (j / (n - 1)) * 2 - 1;
        // (the skirt droops toward its edges, its fringe ragged)
        const droop = Math.pow(Math.abs(x), 1.3) * (13 - k * 5);
        const dy = droop + (r() - 0.5) * 4;
        // (lit across the upper part of the tier, darker toward its drooping edge, and a little lighter near the top of the tree)
        blob(ox + 128 + x * w + (r() - 0.5) * 2.5, oy + y + dy, 5.5 + (1 - k) * 3 + r() * 2.5, x * 0.95, 0.78 - 0.03 * dy + k * 0.08 - Math.abs(x) * 0.06, 0.3);
      }
    }
  });
  // 3: a narrow flame (a cypress, or far off a birch): a leafy column of fine tufts, fuller in the middle
  at(3, (ox, oy) => {
    trunk(ox + 128, oy + 256, oy + 214, 4, 3);
    for (let i = 0; i < 26; i++) {
      const k = i / 25;
      const y = 232 - k * 214;
      const w = 30 * (0.45 + 1.1 * Math.sin(Math.PI * Math.pow(k, 0.62)) * (1 - k * 0.55));
      const n = Math.max(3, Math.round(w / 3.4));
      for (let j = 0; j < n; j++) {
        const x = (j / (n - 1)) * 2 - 1;
        blob(ox + 128 + x * w * 0.62 + (r() - 0.5) * 3, oy + y + (r() - 0.5) * 7, 4.8 + w * 0.09 + r() * 2.2, x * 0.9, 0.55 + k * 0.2 + (r() - 0.5) * 0.14, 0.3);
      }
    }
  });
  return (FAR = finish(c));
}

// what a far tree is: which drawing it wears, how wide and tall, its two greens
export const FAR_KIND: Record<TreeKind, { cell: number; w: number; h: number; lo: V3; hi: V3 }> = {
  broad: { cell: 0, w: 11.5, h: 12.5, lo: [0.03, 0.085, 0.03], hi: [0.075, 0.15, 0.045] },
  birch: { cell: 3, w: 5.2, h: 12.5, lo: [0.075, 0.15, 0.035], hi: [0.16, 0.25, 0.06] },
  pine: { cell: 1, w: 12, h: 15.5, lo: [0.02, 0.06, 0.04], hi: [0.05, 0.105, 0.055] },
  spruce: { cell: 2, w: 9, h: 15, lo: [0.012, 0.042, 0.03], hi: [0.032, 0.078, 0.045] },
  cypress: { cell: 3, w: 4.6, h: 13, lo: [0.012, 0.038, 0.026], hi: [0.03, 0.07, 0.036] },
  bush: { cell: 0, w: 4.4, h: 3.2, lo: [0.035, 0.09, 0.03], hi: [0.085, 0.16, 0.045] },
};
