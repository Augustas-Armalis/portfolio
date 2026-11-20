import * as THREE from "three";
import { rng, type TreeKind } from "./land";

// The trees of the home world, modelled in code. Every tree is a real trunk
// with limbs and a crown heaped out of many soft lumps of different sizes
// (never one ball on a stick, never a plain cone): the lumps overlap, sky
// shows between them, each is darker underneath and toward the heart of the
// crown, and their normals lean toward the crown's own so the whole tree
// takes the light as one form with a broken surface.
//
//   broad    an oak or a lime: a short forking trunk, a wide heaped crown
//   birch    a white leaning stem that forks, small airy drooping crowns
//   pine     the Lithuanian pine: a tall bare ochre trunk, flat clouds of needles carried high on branches
//   spruce   tier on tier of drooping boughs, each a ragged skirt, to a spire
//   cypress  a dark narrow flame, as in his landscapes and the tower plain
//   bush     hazel and willow at the wood's edge
//
// `rich` 1 is a tree seen close; 0 the same tree in fewer, coarser pieces.

type V3 = [number, number, number];
class Mesh {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  fol: number[] = [];
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
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------- parts ----------
const ICO: { v: THREE.Vector3[]; f: number[] }[] = [];
function ico(detail: number) {
  if (!ICO[detail]) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    // weld: three's is unindexed
    const p = g.attributes.position;
    const key = new Map<string, number>();
    const v: THREE.Vector3[] = [];
    const f: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      let id = key.get(k);
      if (id === undefined) {
        id = v.length;
        v.push(new THREE.Vector3(x, y, z).normalize());
        key.set(k, id);
      }
      f.push(id);
    }
    g.dispose();
    ICO[detail] = { v, f };
  }
  return ICO[detail];
}

// A soft lump of foliage. `heart` is the middle of the crown it belongs to:
// its normals lean that way out, and it is darker on the side toward it.
function puff(m: Mesh, c: THREE.Vector3, r: V3, seed: number, detail: number, lo: V3, hi: V3, heart: THREE.Vector3, heartR: number, lean = 0.5) {
  const { v, f } = ico(detail);
  const base = m.count;
  const n = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (const d of v) {
    const lump = 1 + 0.2 * Math.sin(d.x * 4.1 + seed) * Math.sin(d.y * 3.7 + seed * 1.7) + 0.12 * Math.sin(d.z * 6.3 + seed * 2.3 + d.x * 2.9);
    // flatter underneath
    const under = d.y < 0 ? 0.74 : 1;
    q.set(c.x + d.x * r[0] * lump, c.y + d.y * r[1] * lump * under, c.z + d.z * r[2] * lump);
    m.pos.push(q.x, q.y, q.z);
    n.set(d.x / r[0], d.y / r[1], d.z / r[2]).normalize();
    const out = q.clone().sub(heart);
    const far = Math.min(1, out.length() / Math.max(heartR, 1e-3));
    out.normalize();
    n.lerp(out, lean).normalize();
    m.nor.push(n.x, n.y, n.z);
    // paint: darker below and inside, lighter above and at the crown's skin
    const up = Math.min(1, Math.max(0, d.y * 0.5 + 0.5));
    const k = Math.min(1, Math.max(0, 0.15 + 0.5 * up + 0.45 * far * far - 0.1));
    const ao = 0.58 + 0.42 * Math.min(1, far * 1.1) * (0.6 + 0.4 * up);
    m.col.push((lo[0] + (hi[0] - lo[0]) * k) * ao, (lo[1] + (hi[1] - lo[1]) * k) * ao, (lo[2] + (hi[2] - lo[2]) * k) * ao);
    m.fol.push(1);
  }
  for (const i of f) m.idx.push(base + i);
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
    }
  }
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < sides; j++) {
      const p0 = base + i * sides + j;
      const p1 = base + i * sides + ((j + 1) % sides);
      m.idx.push(p0, p0 + sides, p1, p1, p0 + sides, p1 + sides);
    }
}

// One tier of a spruce: a ragged skirt of boughs hanging from the trunk, each
// lobe a bough whose tip droops and then lifts a little.
function skirt(m: Mesh, y: number, R: number, drop: number, lobes: number, phase: number, lo: V3, hi: V3, seed: number) {
  const base = m.count;
  const seg = lobes * 2;
  const rings: [number, number, number][] = [
    // radius (of R), height (of drop, downward), shade
    [0.06, -0.55, 0.75],
    [0.55, 0.12, 0.95],
    [1.0, 1.0, 1.0],
  ];
  const rnd = rng(Math.floor(seed * 977) + 3);
  const jit = Array.from({ length: seg }, () => 0.82 + rnd() * 0.36);
  rings.forEach(([rk, hk, shade], ri) => {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2 + phase;
      const tip = j % 2 === 0;
      const rr = R * rk * (ri === 2 ? (tip ? jit[j] : 0.58) : ri === 1 ? (tip ? 1.05 : 0.86) : 1);
      const yy = y - drop * hk * (ri === 2 ? (tip ? 0.82 : 1.0) : 1);
      m.pos.push(Math.cos(a) * rr, yy, Math.sin(a) * rr);
      const n = new THREE.Vector3(Math.cos(a), 0.75 - ri * 0.2, Math.sin(a)).normalize();
      m.nor.push(n.x, n.y, n.z);
      const k = ri === 0 ? 0.35 : ri === 1 ? 0.75 : tip ? 1 : 0.2;
      m.col.push((lo[0] + (hi[0] - lo[0]) * k) * shade, (lo[1] + (hi[1] - lo[1]) * k) * shade, (lo[2] + (hi[2] - lo[2]) * k) * shade);
      m.fol.push(1);
    }
  });
  for (let ri = 0; ri < 2; ri++)
    for (let j = 0; j < seg; j++) {
      const a0 = base + ri * seg + j;
      const a1 = base + ri * seg + ((j + 1) % seg);
      m.idx.push(a0, a1, a0 + seg, a1, a1 + seg, a0 + seg);
    }
  // the dark underside, so a tier is a solid thing from below
  const c = m.count;
  m.pos.push(0, y - drop * 0.55, 0);
  m.nor.push(0, -1, 0);
  m.col.push(lo[0] * 0.5, lo[1] * 0.5, lo[2] * 0.5);
  m.fol.push(1);
  for (let j = 0; j < seg; j++) m.idx.push(c, base + 2 * seg + ((j + 1) % seg), base + 2 * seg + j);
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------- the kinds ----------
const BARK: V3 = [0.085, 0.07, 0.058];
const BARK2: V3 = [0.15, 0.115, 0.085];

function broad(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 10.5 + r() * 3.5;
  const lean = (r() - 0.5) * 0.9;
  const fork = H * (0.27 + r() * 0.07);
  const at = (k: number) => V(lean * k * k, fork * k, 0);
  limb(m, [at(0), at(0.5), at(1)], 0.32, 0.21, rich ? 8 : 5, rich ? 5 : 2, BARK, BARK2, 0, 0.55);
  const top = at(1);
  const W = H * (0.36 + r() * 0.07);
  // the crown is a tall rounded heap (an egg standing on its broad end), not a plate: lumps set on a dome from
  // the lowest boughs to the top, biggest in the middle heights
  const mid = H * 0.64;
  const heart = V(top.x + lean * 0.3, mid, 0);
  const lo: V3 = [0.026, 0.07, 0.03];
  const hi: V3 = [0.105, 0.185, 0.06];
  const rings = rich ? [5, 5, 4, 1] : [3, 2, 1];
  rings.forEach((count, ri) => {
    const t = rings.length === 1 ? 0 : ri / (rings.length - 1); // 0 the lowest ring .. 1 the top
    const y = H * (0.44 + 0.5 * t);
    // the dome's radius at this height
    const out = W * Math.sqrt(Math.max(0, 1 - Math.pow((y - mid) / (H * 0.42), 2))) * 0.82;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ri * 1.1 + r() * 0.7;
      const d = count === 1 ? 0 : out * (0.75 + r() * 0.3);
      const w = W * (0.4 + r() * 0.14) * (1 - 0.25 * Math.abs(t - 0.4));
      const c = V(heart.x + Math.cos(a) * d, y + (r() - 0.5) * H * 0.05, heart.z + Math.sin(a) * d);
      // a bough out to each of the lower lumps
      if (ri < 2 && (rich || i % 2 === 0)) limb(m, [top.clone().setY(top.y - 0.3), top.clone().lerp(c, 0.5).add(V(0, H * 0.04, 0)), c.clone().setY(c.y - w * 0.3)], 0.13, 0.035, rich ? 5 : 3, rich ? 4 : 2, BARK2, BARK2);
      puff(m, c, [w, w * (0.86 + r() * 0.2), w * (0.92 + r() * 0.16)], seed + ri * 5.3 + i * 1.7, rich > 1 ? 2 : rich ? 1 : 0, lo, hi, heart, W * 1.25);
    }
  });
  return m.geometry();
}

function birch(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 11 + r() * 3.5;
  const lean = (r() - 0.5) * 1.8;
  const at = (k: number) => V(lean * k * k + Math.sin(k * 2.4 + seed) * 0.16, H * k, Math.cos(k * 2 + seed) * 0.14);
  const white: V3 = [0.8, 0.78, 0.72];
  // the white stem runs right up through the crown
  limb(m, [at(0), at(0.25), at(0.5), at(0.75), at(0.97)], 0.12, 0.02, rich ? 7 : 4, rich ? 10 : 4, [0.42, 0.4, 0.37], white, 0.5, 0.35);
  const lo: V3 = [0.06, 0.125, 0.04];
  const hi: V3 = [0.2, 0.275, 0.085];
  const heart = at(0.72);
  // light airy leaf masses hung round the upper stem in a loose spiral, each a little taller than wide and
  // drooping; larger and further out low down, small at the top
  const n = rich ? 13 : 6;
  for (let j = 0; j < n; j++) {
    const k = 0.42 + (j / (n - 1)) * 0.56;
    const o = at(k);
    const a = j * 2.4 + r() * 0.9;
    const out = (1.5 - (k - 0.42) * 2.0) * (0.6 + r() * 0.5);
    const w = (rich ? 0.62 : 0.85) * (1.25 - (k - 0.42) * 1.1) * (0.8 + r() * 0.4);
    const c = V(o.x + Math.cos(a) * out, o.y - 0.2 - r() * 0.4, o.z + Math.sin(a) * out);
    if (rich && j % 2 === 0) limb(m, [o, o.clone().lerp(c, 0.6).add(V(0, 0.3, 0)), c], 0.028, 0.008, 4, 2, white, [0.5, 0.47, 0.42], 0.5);
    puff(m, c, [w, w * (1.2 + r() * 0.5), w * (0.85 + r() * 0.3)], seed + j * 2.1, rich > 1 ? 2 : rich ? 1 : 0, lo, hi, heart, H * 0.3, 0.35);
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
  limb(m, [at(0), at(0.3), at(0.6), at(0.85), at(0.97)], 0.24, 0.06, rich ? 8 : 5, rich ? 10 : 4, [0.11, 0.09, 0.08], [0.52, 0.27, 0.12], 0, 0.4);
  // bare stubs where the lower branches broke away
  if (rich)
    for (let i = 0; i < 3; i++) {
      const k = 0.36 + i * 0.1 + r() * 0.05;
      const a = r() * Math.PI * 2;
      const o = at(k);
      limb(m, [o, o.clone().add(V(Math.cos(a) * 0.6, 0.14, Math.sin(a) * 0.6)), o.clone().add(V(Math.cos(a) * 1.1, 0.05, Math.sin(a) * 1.1))], 0.035, 0.008, 4, 2, [0.2, 0.14, 0.1], [0.24, 0.17, 0.12]);
    }
  const lo: V3 = [0.022, 0.06, 0.045];
  const hi: V3 = [0.09, 0.155, 0.08];
  const heart = at(0.84);
  const W = 2.6 + r() * 0.9;
  // the crown: clouds of needles carried out on branches in a loose spiral, each a huddle of rounded lumps
  // (never a plate), the whole a broad flat-topped head
  const tiers = rich ? 5 : 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const o = at(0.66 + t * 0.28);
    const w = W * (0.62 - t * 0.2) * (0.85 + r() * 0.3);
    const a = i * 2.4 + r();
    const off = W * (0.75 - t * 0.5) * (0.8 + r() * 0.3);
    const c = V(o.x + Math.cos(a) * off, o.y + 0.6 + r() * 0.5, o.z + Math.sin(a) * off);
    limb(m, [o, o.clone().lerp(c, 0.55).add(V(0, 0.3, 0)), c.clone().setY(c.y - 0.2)], 0.075, 0.02, rich ? 5 : 3, 2, [0.4, 0.22, 0.11], [0.3, 0.19, 0.1]);
    const lumps = rich ? 4 : 2;
    for (let j = 0; j < lumps; j++) {
      const ww = w * (j === 0 ? 1 : 0.55 + r() * 0.3);
      const ja = r() * 6.28;
      const cc = j === 0 ? c : V(c.x + Math.cos(ja) * w * 0.8, c.y + (r() - 0.35) * w * 0.5, c.z + Math.sin(ja) * w * 0.8);
      puff(m, cc, [ww, ww * (0.58 + r() * 0.16), ww * (0.9 + r() * 0.2)], seed + i * 3.3 + j, rich > 1 ? 2 : rich ? 1 : 0, lo, hi, heart, W * 1.5, 0.3);
    }
  }
  const cap = at(0.99);
  for (let j = 0; j < (rich ? 3 : 1); j++) {
    const ja = r() * 6.28;
    const ww = W * (0.4 + r() * 0.14);
    puff(m, V(cap.x + Math.cos(ja) * W * 0.25 * j, cap.y + 0.3 - j * 0.15, cap.z + Math.sin(ja) * W * 0.25 * j), [ww, ww * 0.62, ww], seed + 40 + j, rich > 1 ? 2 : rich ? 1 : 0, lo, hi, heart, W * 1.5, 0.3);
  }
  return m.geometry();
}

function spruce(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 13 + r() * 5;
  const bend = (r() - 0.5) * 0.3;
  limb(m, [V(0, 0, 0), V(bend * 0.4, H * 0.5, 0), V(bend, H * 0.99, 0)], 0.19, 0.02, rich ? 7 : 4, rich ? 5 : 2, [0.08, 0.066, 0.058], [0.13, 0.1, 0.085], 0, 0.3);
  const lo: V3 = [0.014, 0.04, 0.034];
  const hi: V3 = [0.05, 0.1, 0.066];
  const n = rich ? 11 : 6;
  const W = H * (0.2 + r() * 0.035);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const y = H * (0.2 + 0.78 * k);
    // widest low down, drawing in to the spire; not a straight cone: a slight belly
    const w = W * (Math.pow(1 - k, 0.82) + 0.06) * (0.9 + r() * 0.2);
    skirt(m, y, w, H * 0.11 * (1 - k * 0.5), rich ? 7 + Math.floor(r() * 3) : 5, r() * 6.28, lo, hi, seed + i);
  }
  // the leader
  limb(m, [V(bend, H * 0.96, 0), V(bend, H * 1.06, 0)], 0.05, 0.004, 4, 1, hi, hi, 1);
  return m.geometry();
}

function cypress(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const H = 11 + r() * 5;
  limb(m, [V(0, 0, 0), V(0, H * 0.25, 0)], 0.16, 0.1, rich ? 6 : 4, 1, BARK, BARK2, 0, 0.3);
  const lo: V3 = [0.012, 0.034, 0.026];
  const hi: V3 = [0.042, 0.085, 0.046];
  const n = rich ? 8 : 4;
  const W = H * 0.085;
  const heart = V(0, H * 0.5, 0);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const y = H * (0.14 + 0.8 * k);
    // a flame: narrow foot, fullest a third of the way up, drawn to a point
    const w = W * (0.55 + 1.1 * Math.sin(Math.PI * Math.pow(k, 0.62)) * (1 - k * 0.55)) * (0.9 + r() * 0.2);
    const c = V((r() - 0.5) * W * 0.5, y, (r() - 0.5) * W * 0.5);
    puff(m, c, [w, (H * 0.8) / n * (0.95 + r() * 0.3), w], seed + i * 1.9, rich > 1 ? 2 : rich ? 1 : 0, lo, hi, heart, H * 0.5, 0.25);
  }
  return m.geometry();
}

function bush(seed: number, rich: number) {
  const r = rng(seed);
  const m = new Mesh();
  const lo: V3 = [0.03, 0.075, 0.03];
  const hi: V3 = [0.11, 0.18, 0.06];
  const n = rich ? 6 : 3;
  const heart = V(0, 0.9, 0);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28;
    const d = r() * 1.2;
    const w = 0.8 + r() * 0.7;
    puff(m, V(Math.cos(a) * d, 0.7 + r() * 1.0, Math.sin(a) * d), [w, w * (0.75 + r() * 0.3), w], seed + i * 2.3, rich > 1 ? 2 : rich ? 1 : 0, lo, hi, heart, 2.2, 0.4);
  }
  return m.geometry();
}

const BUILD: Record<TreeKind, (seed: number, rich: number) => THREE.BufferGeometry> = { broad, birch, pine, spruce, cypress, bush };
const SEEDS: Record<TreeKind, number[]> = { broad: [13, 57, 91], birch: [7, 23, 41], pine: [11, 29, 47], spruce: [5, 19, 37], cypress: [3, 17, 31], bush: [9, 21, 33] };
export const VARIANTS = 2;
export function buildTree(kind: TreeKind, variant: number, rich: number) {
  return BUILD[kind](SEEDS[kind][variant % SEEDS[kind].length], rich);
}

// ---------- the far woods ----------
// Thousands of small crowns in one geometry: a soft lump (or a little ragged
// cone) each, coloured and sized by its kind, with the same attributes as the
// whole trees plus its own root (for the wind and the foot's shade).
export function buildFarWood(trees: { x: number; y: number; z: number; s: number; kind: TreeKind; rot: number; tint: number }[]) {
  const { v, f } = ico(0);
  const per: Record<TreeKind, { lo: V3; hi: V3; w: number; h: number; lift: number; cone: boolean }> = {
    broad: { lo: [0.026, 0.07, 0.03], hi: [0.1, 0.18, 0.06], w: 4.4, h: 8.4, lift: 2.0, cone: false },
    birch: { lo: [0.058, 0.12, 0.04], hi: [0.19, 0.265, 0.085], w: 2.8, h: 8.6, lift: 3.0, cone: false },
    pine: { lo: [0.022, 0.06, 0.045], hi: [0.085, 0.15, 0.08], w: 3.6, h: 7.0, lift: 6.5, cone: false },
    spruce: { lo: [0.014, 0.04, 0.034], hi: [0.048, 0.098, 0.066], w: 2.9, h: 13.5, lift: 1.8, cone: true },
    cypress: { lo: [0.012, 0.034, 0.026], hi: [0.04, 0.082, 0.046], w: 1.5, h: 12, lift: 1.0, cone: true },
    bush: { lo: [0.03, 0.075, 0.03], hi: [0.105, 0.175, 0.06], w: 2.2, h: 1.8, lift: 1.2, cone: false },
  };
  const CONE = 6;
  let nv = 0;
  let ni = 0;
  for (const t of trees) {
    const p = per[t.kind];
    nv += p.cone ? CONE * 2 + 1 : v.length;
    ni += p.cone ? CONE * 9 : f.length;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const fol = new Float32Array(nv);
  const root = new Float32Array(nv * 3);
  const idx = new Uint32Array(ni);
  let a = 0;
  let b = 0;
  for (const t of trees) {
    const p = per[t.kind];
    const cs = Math.cos(t.rot);
    const sn = Math.sin(t.rot);
    const warm = 0.88 + t.tint * 0.28;
    const cool = 0.9 - t.tint * 0.14;
    const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, k: number, shade: number) => {
      pos[a * 3] = t.x + (x * cs + z * sn) * t.s;
      pos[a * 3 + 1] = t.y + y * t.s;
      pos[a * 3 + 2] = t.z + (-x * sn + z * cs) * t.s;
      nor[a * 3] = nx * cs + nz * sn;
      nor[a * 3 + 1] = ny;
      nor[a * 3 + 2] = -nx * sn + nz * cs;
      col[a * 3] = (p.lo[0] + (p.hi[0] - p.lo[0]) * k) * shade * warm;
      col[a * 3 + 1] = (p.lo[1] + (p.hi[1] - p.lo[1]) * k) * shade * (0.92 + t.tint * 0.14);
      col[a * 3 + 2] = (p.lo[2] + (p.hi[2] - p.lo[2]) * k) * shade * cool;
      fol[a] = 1;
      root[a * 3] = t.x;
      root[a * 3 + 1] = t.y;
      root[a * 3 + 2] = t.z;
      a++;
    };
    const base = a;
    if (p.cone) {
      // two ragged rings and a tip
      for (let ring = 0; ring < 2; ring++)
        for (let j = 0; j < CONE; j++) {
          const ang = (j / CONE) * Math.PI * 2 + ring * 0.5;
          const rr = p.w * (ring === 0 ? (j % 2 ? 0.72 : 1) : 0.55) * (t.kind === "cypress" && ring === 0 ? 0.7 : 1);
          const yy = p.lift + (ring === 0 ? 0 : p.h * 0.42);
          put(Math.cos(ang) * rr, yy, Math.sin(ang) * rr, Math.cos(ang) * 0.8, 0.6, Math.sin(ang) * 0.8, ring === 0 ? 0.25 : 0.7, ring === 0 ? 0.62 : 0.9);
        }
      put(0, p.lift + p.h, 0, 0, 1, 0, 1, 1);
      for (let j = 0; j < CONE; j++) {
        const j1 = (j + 1) % CONE;
        idx[b++] = base + j;
        idx[b++] = base + CONE + j;
        idx[b++] = base + j1;
        idx[b++] = base + j1;
        idx[b++] = base + CONE + j;
        idx[b++] = base + CONE + j1;
        idx[b++] = base + CONE + j;
        idx[b++] = base + CONE * 2;
        idx[b++] = base + CONE + j1;
      }
    } else {
      const seed = t.tint * 40;
      for (const d of v) {
        const lump = 1 + 0.22 * Math.sin(d.x * 4.1 + seed) * Math.sin(d.y * 3.7 + seed * 1.7);
        const under = d.y < 0 ? 0.6 : 1;
        const up = d.y * 0.5 + 0.5;
        put(d.x * p.w * lump, p.lift + d.y * p.h * 0.5 * lump * under + p.h * 0.3, d.z * p.w * lump, d.x, d.y * 0.8 + 0.3, d.z, 0.15 + 0.85 * up, 0.55 + 0.45 * up);
      }
      for (const i of f) idx[b++] = base + i;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aFol", new THREE.BufferAttribute(fol, 1));
  g.setAttribute("aRoot", new THREE.BufferAttribute(root, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
