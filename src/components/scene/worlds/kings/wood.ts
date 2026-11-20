import * as THREE from "three";
import { noise2, rng, type Halo, type V3 } from "../kit";
import { KINGS, WORLDS, groundAt } from "../voyage";
import { BY, GLSL_END, GLSL_KINGS, KINGS_UNIFORMS, R } from "./light";

// The wood. Old trunks thick as towers, fluted and buttressed at the foot, that lean and turn as they rise
// and break into heavy boughs; the boughs arch over and fork and close a vault over the aisle and the kings.
// Roots run out from every foot over the ground and under it. Bark is furrowed along the limb, mossed on
// whatever faces up and low on the weather side, scabbed with lichen.
//
// In the boughs, towns: hundreds of small houses and towers huddled wherever a bough runs level, their
// windows lit; plank bridges slung from town to town, rope ladders let down, small figures standing on the
// boughs and the bridges. Beyond the last trunks the plane can reach, a ring of others going off into the
// mist, so the wood has no visible end.
//
// One geometry, one material, one draw call.

const def = WORLDS.kings;

// where the aisle runs at a given z: the path of light, read off the map
export function aisleX(z: number) {
  const p = def.path;
  if (z >= p[0][1]) return p[0][0];
  for (let i = 0; i < p.length - 1; i++)
    if (z <= p[i][1] && z >= p[i + 1][1]) {
      const t = (p[i][1] - z) / Math.max(1e-3, p[i][1] - p[i + 1][1]);
      const s = t * t * (3 - 2 * t);
      return p[i][0] + (p[i + 1][0] - p[i][0]) * s;
    }
  return p[p.length - 1][0];
}

// kinds (aCol.a): 0 bark, 1 plain dark wood (bridges, rope), 2 a house wall, 3 a roof, 4 a small figure, 5 a rope ladder, 6 a lantern
const BARK = 0;
const PLANK = 1;
const WALL = 2;
const ROOF = 3;
const FIG = 4;
const LADDER = 5;
const LAMP = 6;

class Build {
  pos: number[] = [];
  col: number[] = [];
  tex: number[] = [];
  idx: number[] = [];
  seams: number[] = [];
  private p = new THREE.Vector3();
  vert(x: number, y: number, z: number, c: V3, kind: number, u: number, v: number) {
    this.pos.push(x, y, z);
    this.col.push(c[0], c[1], c[2], kind);
    this.tex.push(u, v);
    return this.pos.length / 3 - 1;
  }
  // a round limb whose thickness changes along it; `flute` makes its section lobed (buttresses at a trunk's foot)
  tube(pts: V3[], radii: number[], c0: V3, c1: V3, kind: number, o: { sides: number; seg: number; twist?: number; flute?: (t: number) => number; ph?: number; cap?: boolean }) {
    const curve = new THREE.CatmullRomCurve3(
      pts.map((q) => new THREE.Vector3(...q)),
      false,
      "centripetal",
    );
    const { sides, seg } = o;
    const fr = curve.computeFrenetFrames(seg, false);
    const base = this.pos.length / 3;
    const uRef = Math.PI * 2 * radii[0];
    const ph = o.ph ?? 0;
    const rad = (t: number) => {
      const f = t * (radii.length - 1);
      const i = Math.min(radii.length - 2, Math.floor(f));
      const k = f - i;
      return radii[i] + (radii[i + 1] - radii[i]) * (k * k * (3 - 2 * k));
    };
    let arc = 0;
    let px = 0;
    let py = 0;
    let pz = 0;
    const p = this.p;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      curve.getPointAt(t, p);
      if (i > 0) arc += Math.hypot(p.x - px, p.y - py, p.z - pz);
      px = p.x;
      py = p.y;
      pz = p.z;
      const r = rad(t);
      const fl = o.flute ? o.flute(t) : 0;
      const c: V3 = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
      const N = fr.normals[i];
      const B = fr.binormals[i];
      for (let j = 0; j <= sides; j++) {
        const a0 = (j / sides) * Math.PI * 2;
        const a = a0 + (o.twist ?? 0) * t;
        const lobes = fl ? 1 + fl * (0.6 * Math.sin(a0 * 5 + t * 7 + ph) + 0.4 * Math.sin(a0 * 3 - t * 4 + ph * 2.3) + 0.25 * Math.sin(a0 * 9 + t * 15 + ph * 0.7)) : 1;
        const cn = Math.cos(a) * r * lobes;
        const cb = Math.sin(a) * r * lobes;
        this.vert(p.x + N.x * cn + B.x * cb, p.y + N.y * cn + B.y * cb, p.z + N.z * cn + B.z * cb, c, kind, (j / sides) * uRef + ph * 3, arc);
      }
      this.seams.push(base + i * (sides + 1), base + i * (sides + 1) + sides);
      if (i < seg) for (let j = 0; j < sides; j++) this.idx.push(base + i * (sides + 1) + j, base + (i + 1) * (sides + 1) + j, base + i * (sides + 1) + j + 1, base + i * (sides + 1) + j + 1, base + (i + 1) * (sides + 1) + j, base + (i + 1) * (sides + 1) + j + 1);
    }
    return curve;
  }
  quad(a: V3, b: V3, c: V3, d: V3, col: V3, kind: number, uv: [number, number, number, number]) {
    const i0 = this.vert(a[0], a[1], a[2], col, kind, uv[0], uv[1]);
    this.vert(b[0], b[1], b[2], col, kind, uv[2], uv[1]);
    this.vert(c[0], c[1], c[2], col, kind, uv[2], uv[3]);
    this.vert(d[0], d[1], d[2], col, kind, uv[0], uv[3]);
    this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  // four walls on a footprint turned by `yaw` (their windows are drawn by the material, from u along the wall and v up it)
  walls(cx: number, y: number, cz: number, w: number, h: number, d: number, yaw: number, col: V3, kind: number, seed: number) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const k = (lx: number, lz: number, yy: number): V3 => [cx + lx * c - lz * s, yy, cz + lx * s + lz * c];
    const hw = w / 2;
    const hd = d / 2;
    const cn: [number, number][] = [
      [-hw, hd],
      [hw, hd],
      [hw, -hd],
      [-hw, -hd],
    ];
    let u = seed * 97;
    for (let i = 0; i < 4; i++) {
      const a = cn[i];
      const b = cn[(i + 1) % 4];
      const len = i % 2 === 0 ? w : d;
      this.quad(k(a[0], a[1], y), k(b[0], b[1], y), k(b[0], b[1], y + h), k(a[0], a[1], y + h), col, kind, [u, 0, u + len, h]);
      u += len + 3.1;
    }
    return k;
  }
  roof(cx: number, y: number, cz: number, w: number, d: number, h: number, yaw: number, col: V3) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const k = (lx: number, lz: number, yy: number): V3 => [cx + lx * c - lz * s, yy, cz + lx * s + lz * c];
    const hw = w * 0.58;
    const hd = d * 0.58;
    const cn: [number, number][] = [
      [-hw, hd],
      [hw, hd],
      [hw, -hd],
      [-hw, -hd],
    ];
    const top = k(0, 0, y + h);
    for (let i = 0; i < 4; i++) {
      const a = k(cn[i][0], cn[i][1], y);
      const b = k(cn[(i + 1) % 4][0], cn[(i + 1) % 4][1], y);
      const i0 = this.vert(a[0], a[1], a[2], col, ROOF, 0, 0);
      this.vert(b[0], b[1], b[2], col, ROOF, 1, 0);
      this.vert(top[0], top[1], top[2], col, ROOF, 0.5, 1);
      this.idx.push(i0, i0 + 1, i0 + 2);
    }
  }
  // a small faceted lump (a head, a lantern, a boulder when it is pulled about)
  lump(c: V3, r: V3, col: V3, kind: number, detail = 0, rough = 0, seed = 0) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position;
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + rough * (noise2(x * 1.7 + seed, y * 1.7 + z * 1.3 + seed) - 0.5) * 2;
      this.vert(c[0] + x * r[0] * k, c[1] + y * r[1] * k, c[2] + z * r[2] * k, col, kind, Math.atan2(z, x) * r[0] + seed, y * r[1]);
    }
    for (let i = 0; i < p.count; i += 3) this.idx.push(base + i, base + i + 1, base + i + 2);
    g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("aCol", new THREE.Float32BufferAttribute(this.col, 4));
    g.setAttribute("aTex", new THREE.Float32BufferAttribute(this.tex, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    // a limb is closed on itself: the two ends of each ring share one normal
    const n = g.attributes.normal;
    for (let i = 0; i < this.seams.length; i += 2) {
      const a = this.seams[i];
      const b = this.seams[i + 1];
      const x = n.getX(a) + n.getX(b);
      const y = n.getY(a) + n.getY(b);
      const z = n.getZ(a) + n.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l);
      n.setXYZ(b, x / l, y / l, z / l);
    }
    g.computeBoundingSphere();
    return g;
  }
}

export type Trunk = { x: number; z: number; R: number; H: number; fork?: number; aim?: number; far?: boolean };
export type Walk = { a: V3; b: V3 };
export type WoodBuilt = { geo: THREE.BufferGeometry; trunks: Trunk[]; lamps: Halo[]; stars: Halo[]; walks: Walk[] };

export function* woodGeometry(o: { mobile: boolean; trees: number }, budget: number): Generator<void, WoodBuilt, void> {
  let began = performance.now();
  const r = rng(1909 + 7);
  const gy = (x: number, z: number) => groundAt(def, x, z);
  const b = new Build();
  const lamps: Halo[] = [];
  const stars: Halo[] = [];
  const walks: Walk[] = [];
  const by = BY;
  const lo = o.mobile;
  const BARK_C: V3 = [0.1, 0.07, 0.048];
  const BARK_TOP: V3 = [0.055, 0.056, 0.054];
  const WALL_C: V3 = [0.026, 0.026, 0.03];
  const ROOF_C: V3 = [0.016, 0.014, 0.017];
  const DARK: V3 = [0.012, 0.014, 0.017];

  const trunks: Trunk[] = [];
  const ahead = (z: number) => z - KINGS.z;
  const sm = (a: number, c: number, x: number) => THREE.MathUtils.smoothstep(x, a, c);
  // the aisle the plane comes up is narrow between the trunks, opens once into a clearing by the water, and widens
  // into the glade before the kings, so nothing stands between them and the eye
  const clear = (z: number) => 44 + 146 * sm(0, 280, 350 - ahead(z)) + 30 * Math.exp(-(((ahead(z) - 520) / 70) ** 2));
  const tryTrunk = (x: number, z: number, rad: number, H: number, o2: Partial<Trunk> = {}) => {
    if (Math.abs(x - aisleX(z)) < clear(z) + rad && ahead(z) > -70) return false;
    if (Math.abs(ahead(z)) < 80 && Math.abs(x) < 228) return false;
    for (const c of def.canvases) if (Math.hypot(x - c.x, z - c.z) < 44) return false;
    for (const t of trunks) if (Math.hypot(t.x - x, t.z - z) < (t.R + rad) * 2.4) return false;
    trunks.push({ x, z, R: rad, H, ...o2 });
    return true;
  };
  // close behind the kings and beside them, as in the picture: these are the ones the light falls on
  for (const [x, z, rad] of [
    [-76, -112, 14],
    [82, -124, 15],
    [-168, -104, 15],
    [176, -116, 16],
    [-128, -210, 13],
    [134, -220, 14],
    [-212, -300, 16],
    [206, -320, 16],
    [-262, -40, 17],
    [268, -52, 17],
    [-236, 96, 16],
    [240, 110, 16],
    [-20, -330, 15],
    [40, -420, 16],
    [-330, -180, 17],
    [338, -200, 17],
  ] as const)
    trunks.push({ x, z: KINGS.z + z, R: rad, H: 300 + r() * 40, fork: 0.56 + r() * 0.08 });
  // the aisle: two uneven rows of the greatest trunks, and the arches they throw across it
  const pairs: [number, number][] = [];
  const zTop = def.path[0][1] + 70;
  for (let z = zTop; z > KINGS.z + 150; z -= 60) {
    const pr: number[] = [];
    for (const s of [-1, 1]) {
      const zz = z + (r() - 0.5) * 30;
      if (tryTrunk(aisleX(zz) + s * (clear(zz) + 15 + r() * 18), zz, 12 + r() * 6, 270 + r() * 60, { fork: 0.5 + r() * 0.12 })) pr.push(trunks.length - 1);
    }
    if (pr.length === 2) pairs.push([pr[0], pr[1]]);
  }
  // a second, looser rank behind them
  for (let z = zTop + 20; z > KINGS.z - 60; z -= 74) for (const s of [-1, 1]) tryTrunk(aisleX(z) + s * (clear(z) + 80 + r() * 90), z + (r() - 0.5) * 50, 9 + r() * 7, 240 + r() * 90);
  // and the wood thickening to either side and beyond
  const nOuter = lo ? 16 : Math.round(46 * Math.max(0.6, o.trees));
  const core = trunks.length;
  for (let i = 0; i < nOuter * 5 && trunks.length < core + nOuter; i++) tryTrunk((r() < 0.5 ? -1 : 1) * (150 + r() * 420), zTop + 60 - r() * 1320, 8 + r() * 8, 220 + r() * 110);
  const near = trunks.length;
  // beyond where the plane can go: plain trunks standing off into the mist, ring behind ring
  const nFar = lo ? 90 : 240;
  for (let i = 0; i < nFar; i++) {
    const a = r() * Math.PI * 2;
    const d = 640 + Math.pow(r(), 0.8) * 820;
    const x = Math.cos(a) * d;
    const z = 150 + Math.sin(a) * d;
    let ok = true;
    for (let j = 0; j < near && ok; j++) if (Math.hypot(trunks[j].x - x, trunks[j].z - z) < 60) ok = false;
    if (ok) trunks.push({ x, z, R: 9 + r() * 9, H: 240 + r() * 120, far: true });
  }

  // ---------- towns ----------
  const townAt: { p: V3; along: V3 }[] = [];
  const house = (px: number, py: number, pz: number, a: number, sc: number) => {
    const kind = r();
    const seed = r();
    if (kind < 0.16) {
      // a small figure: some stand, some lift their arms
      const fh = (3.2 + r() * 1.5) * sc;
      b.tube(
        [
          [px, py, pz],
          [px, py + fh * 0.55, pz],
          [px, py + fh, pz],
        ],
        [0.6 * sc, 0.42 * sc, 0.26 * sc],
        DARK,
        DARK,
        FIG,
        { sides: 5, seg: 2 },
      );
      b.lump([px, py + fh + 0.42 * sc, pz], [0.5 * sc, 0.55 * sc, 0.5 * sc], DARK, FIG);
      if (r() < 0.5) {
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        for (const sx of [-1, 1])
          b.tube(
            [
              [px + ca * sx * 0.4 * sc, py + fh * 0.86, pz + sa * sx * 0.4 * sc],
              [px + ca * sx * 0.95 * sc, py + fh * 1.2, pz + sa * sx * 0.95 * sc],
              [px + ca * sx * 1.1 * sc, py + fh * 1.56, pz + sa * sx * 1.1 * sc],
            ],
            [0.15 * sc, 0.12 * sc, 0.09 * sc],
            DARK,
            DARK,
            FIG,
            { sides: 4, seg: 2 },
          );
      }
      // now and then one carries a light
      if (r() < 0.3) {
        b.lump([px + 0.9 * sc, py + fh * 0.6, pz], [0.3 * sc, 0.36 * sc, 0.3 * sc], [1, 0.62, 0.26], LAMP);
        lamps.push({ p: [px + 0.9 * sc, py + fh * 0.6, pz], size: 2.4 * sc, col: [1, 0.66, 0.3], k: 0.7 });
      }
      return;
    }
    const tall = kind > 0.74;
    const w = (3.2 + r() * 2.6) * sc;
    const d = w * (0.75 + r() * 0.4);
    const hh = (tall ? 12 + r() * 14 : 4 + r() * 4.6) * sc;
    const yaw = -a + (r() - 0.5) * 0.3;
    const wv = 0.75 + r() * 0.5;
    const wc: V3 = [WALL_C[0] * wv, WALL_C[1] * wv, WALL_C[2] * wv];
    if (tall) {
      b.walls(px, py - 0.6, pz, w * 0.7, hh + 0.6, w * 0.7, yaw, wc, WALL, seed);
      const sp = (5 + r() * 9) * sc;
      b.roof(px, py + hh, pz, w * 0.7, w * 0.7, sp, yaw, ROOF_C);
      // some towers carry an onion dome under the spire, or a lantern at the top
      if (r() < 0.3) b.lump([px, py + hh + w * 0.2, pz], [w * 0.52, w * 0.6, w * 0.52], ROOF_C, ROOF, 1);
      if (r() < 0.5) lamps.push({ p: [px, py + hh * (0.6 + r() * 0.3), pz], size: 2.2 * Math.sqrt(sc), col: r() < 0.7 ? [1, 0.72, 0.38] : [1, 0.5, 0.22], k: 0.6 + r() * 0.5 });
    } else {
      b.walls(px, py - 0.6, pz, w, hh + 0.6, d, yaw, wc, WALL, seed);
      b.roof(px, py + hh, pz, w, d, (2.2 + r() * 1.6) * sc, yaw, ROOF_C);
      // a chimney
      if (r() < 0.4) b.walls(px + w * 0.22, py + hh, pz, 0.7 * sc, 2.6 * sc, 0.7 * sc, yaw, ROOF_C, ROOF, seed);
      if (r() < 0.36) lamps.push({ p: [px + (r() - 0.5) * w * 0.4, py + hh * 0.5, pz + (r() - 0.5) * w * 0.4], size: (1.6 + r() * 1.0) * Math.sqrt(sc), col: r() < 0.7 ? [1, 0.72, 0.38] : [1, 0.5, 0.22], k: 0.5 + r() * 0.5 });
    }
  };
  // a huddle of houses and towers on a bough: two uneven rows of them along it, as close as they will stand
  const town = (c: V3, a: number, n: number, sc: number, top: number) => {
    const al: V3 = [Math.cos(a), 0, Math.sin(a)];
    let o1 = -(n * 4.6 * sc) / 2;
    for (let i = 0; i < n; i++) {
      const step = (3.6 + r() * 2.2) * sc;
      o1 += step;
      const side = (i % 2 ? 1 : -1) * (0.3 + r() * 0.5) * top;
      house(c[0] + al[0] * o1 - al[2] * side, c[1] - Math.abs(side) * 0.25, c[2] + al[2] * o1 + al[0] * side, a, sc * (0.85 + r() * 0.35));
    }
    const half = (n * 4.6 * sc) / 2;
    townAt.push({ p: c, along: al });
    walks.push({ a: [c[0] - al[0] * half, c[1] + 0.2, c[2] - al[2] * half], b: [c[0] + al[0] * half, c[1] + 0.2, c[2] + al[2] * half] });
  };

  // ---------- trees ----------
  const SIDES = lo ? 9 : 14;
  // a bough: thick where it leaves, arching up and over, wandering
  const bough = (p0: V3, a: number, len: number, rise: number, rad: number, depth: number, sides: number) => {
    const ph = r() * 6.28;
    const bend = (r() - 0.5) * 1.1;
    const wob = len * 0.075;
    const droop = r() * 0.25;
    const q = (u: number): V3 => {
      const aa = a + bend * u;
      const w = Math.sin(u * 5.2 + ph) * wob * u;
      return [p0[0] + Math.cos(aa) * len * Math.pow(u, 1.12) - Math.sin(aa) * w, p0[1] + rise * (1 - (1 - u) * (1 - u)) - rise * droop * u * u * u + Math.cos(u * 4.1 + ph) * wob * 0.6 * u, p0[2] + Math.sin(aa) * len * Math.pow(u, 1.12) + Math.cos(aa) * w];
    };
    b.tube([p0, q(0.14), q(0.32), q(0.52), q(0.74), q(1)], [rad, rad * 0.86, rad * 0.68, rad * 0.5, rad * 0.3, rad * 0.08], BARK_TOP, BARK_TOP, BARK, { sides, seg: depth ? (lo ? 9 : 13) : lo ? 14 : 22, twist: 1.2, ph, flute: () => 0.06 });
    return q;
  };
  const forkOf: (V3 | null)[] = [];
  const tree = (t: Trunk) => {
    const g0 = gy(t.x, t.z);
    const fork = t.fork ?? 0.44 + r() * 0.14;
    const Hf = t.H * fork;
    const leanA = r() * 6.28;
    const lean = 0.03 + r() * 0.08;
    const sway = (0.55 + r() * 0.6) * t.R * 1.7;
    const ph = r() * 6.28;
    const at = (k: number): V3 => [t.x + Math.cos(leanA) * lean * Hf * k + Math.sin(k * 4.4 + ph) * sway * Math.min(1, k * 2), g0 - 8 + (Hf + 8) * k, t.z + Math.sin(leanA) * lean * Hf * k + Math.cos(k * 3.7 + ph) * sway * 0.8 * Math.min(1, k * 2)];
    if (t.far) {
      // far off: a plain bole and two bare boughs are all the mist lets through
      b.tube([at(0), at(0.3), at(0.65), at(1)], [t.R * 1.5, t.R, t.R * 0.9, t.R * 0.8], BARK_C, BARK_TOP, BARK, { sides: 6, seg: 6, ph });
      const p0 = at(1);
      for (let j = 0; j < 2; j++) {
        const a = r() * 6.28;
        const len = 70 + r() * 60;
        const rise = (t.H - Hf) * (0.6 + r() * 0.4);
        b.tube([p0, [p0[0] + Math.cos(a) * len * 0.4, p0[1] + rise * 0.6, p0[2] + Math.sin(a) * len * 0.4], [p0[0] + Math.cos(a) * len, p0[1] + rise, p0[2] + Math.sin(a) * len]], [t.R * 0.6, t.R * 0.36, t.R * 0.06], BARK_TOP, BARK_TOP, BARK, { sides: 5, seg: 5 });
      }
      forkOf.push(null);
      return;
    }
    // the foot spreads into buttresses; the bole swells and narrows, and swells again under the fork
    const burl = (k: number) => 1 + 0.09 * Math.sin(k * 13 + ph) + 0.05 * Math.sin(k * 29 + ph * 2);
    const ks = [0, 0.05, 0.14, 0.3, 0.48, 0.66, 0.85, 1];
    const rs = [2.5, 1.55, 1.12, 1.0, 0.95, 0.92, 1.0, 0.9];
    b.tube(
      ks.map(at),
      rs.map((x, i) => x * t.R * (i > 1 ? burl(ks[i]) : 1)),
      BARK_C,
      BARK_TOP,
      BARK,
      { sides: SIDES, seg: lo ? 20 : 30, twist: 2.4, ph, flute: (k) => 0.3 * Math.pow(1 - k, 3) + 0.1 },
    );
    // roots: out over the ground from between the buttresses, and under
    const nR = lo ? 3 : 4 + Math.floor(r() * 3);
    for (let j = 0; j < nR; j++) {
      const a = (j / nR) * 6.28 + r() * 0.8;
      const len = t.R * (2.6 + r() * 3.2);
      const wig = (r() - 0.5) * 1.2;
      const q = (u: number, up: number): V3 => {
        const aa = a + wig * u;
        const x = t.x + Math.cos(aa) * (t.R * 1.1 + len * u);
        const z = t.z + Math.sin(aa) * (t.R * 1.1 + len * u);
        return [x, gy(x, z) + up, z];
      };
      b.tube([q(0, t.R * 0.7), q(0.25, t.R * 0.22), q(0.6, t.R * 0.08), q(1, -t.R * 0.5)], [t.R * 0.62, t.R * 0.44, t.R * 0.3, t.R * 0.12], BARK_C, BARK_C, BARK, { sides: lo ? 5 : 7, seg: lo ? 6 : 9, ph: ph + j, flute: () => 0.08 });
    }
    const p0 = at(1);
    forkOf.push(p0);
    const nB = 2 + (r() < 0.65 ? 1 : 0);
    // most reach toward the aisle and the kings
    const zt = KINGS.z + ahead(t.z) * 0.75;
    const a0 = t.aim ?? (r() < 0.75 ? Math.atan2(zt - t.z, aisleX(zt) - t.x) + (r() - 0.5) * 0.9 : r() * 6.28);
    const grow = (from: V3, a: number, len: number, rise: number, rad: number) => {
      const q = bough(from, a, len, rise, rad, 0, lo ? 7 : 9);
      // it forks again, and ends in a few twigs
      const u1 = 0.36 + r() * 0.16;
      const a2 = a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6);
      const q2 = bough(q(u1), a2, len * (0.5 + r() * 0.2), rise * 0.5 + 14, rad * 0.5, 1, lo ? 5 : 7);
      for (const [qq, u, k] of [
        [q, 0.72, 0.2],
        [q, 0.96, 0.12],
        [q2, 0.8, 0.12],
      ] as const) {
        const e = qq(u);
        const ta = a + (r() - 0.5) * 2.6;
        b.tube([e, [e[0] + Math.cos(ta) * 18, e[1] + 9, e[2] + Math.sin(ta) * 18], [e[0] + Math.cos(ta) * 40, e[1] + 12 + r() * 14, e[2] + Math.sin(ta) * 40]], [rad * k, rad * k * 0.55, rad * 0.03], BARK_TOP, BARK_TOP, BARK, { sides: 4, seg: 5 });
      }
      // towns live where a bough runs level
      for (const [qq, rr2, aa] of [
        [q, rad * 0.42, a],
        [q2, rad * 0.26, a2],
      ] as const)
        if (r() < (lo ? 0.6 : 0.9)) {
          const u = 0.48 + r() * 0.34;
          const c = qq(u);
          const d = qq(u + 0.04);
          void aa;
          town([c[0], c[1] + rr2 * 0.85, c[2]], Math.atan2(d[2] - c[2], d[0] - c[0]), (lo ? 4 : 6) + Math.floor(r() * (lo ? 4 : 8)), 1, Math.max(1.6, rr2 * 1.2));
        }
    };
    for (let j = 0; j < nB; j++) grow(p0, a0 + (j * Math.PI * 2) / nB + (r() - 0.5) * 0.7, (j === 0 ? 96 : 70) + r() * 60, (t.H - Hf) * (0.6 + r() * 0.4), t.R * (0.66 - j * 0.07));
    // a lower limb or two, leaving the bole well under the fork
    if (!lo) for (let j = 0; j < 1 + (r() < 0.4 ? 1 : 0); j++) grow(at(0.55 + r() * 0.25), a0 + 1.6 + r() * 3, 46 + r() * 40, 30 + r() * 30, t.R * 0.34);
  };
  for (const t of trunks) {
    tree(t);
    if (performance.now() - began > budget) {
      yield;
      began = performance.now();
    }
  }
  // the vault: from fork to fork across the aisle a rib arches over, and a street of houses runs along its back
  pairs.forEach(([i, j], n) => {
    const a = forkOf[i];
    const c = forkOf[j];
    if (!a || !c || (lo && n % 2)) return;
    const up = 34 + r() * 26;
    const m = (u: number, lift: number): V3 => [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u + up * lift, a[2] + (c[2] - a[2]) * u + Math.sin(u * 3.14) * (r() - 0.5) * 30];
    const rad = 4.6 + r() * 1.6;
    b.tube([a, m(0.2, 0.62), m(0.5, 1), m(0.8, 0.62), c], [rad * 1.5, rad, rad * 0.9, rad, rad * 1.5], BARK_TOP, BARK_TOP, BARK, { sides: lo ? 7 : 9, seg: lo ? 14 : 22, twist: 1, ph: n, flute: () => 0.07 });
    const mid = m(0.5, 1);
    if (n % 2 === 0 || !lo) town([mid[0], mid[1] + rad * 0.85, mid[2]], Math.atan2(c[2] - a[2], c[0] - a[0]), lo ? 7 : 10 + Math.floor(r() * 6), 1.15, rad * 1.3);
  });
  // great boughs slung from trunk to trunk behind the kings: on them the towns that show between the two bowed
  // heads and against the bands of the sky, as he put them
  const span = (a: V3, c: V3, sag: number, rad: number, n: number, sc: number) => {
    const mid: V3 = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2 - sag, (a[2] + c[2]) / 2];
    const q1: V3 = [(a[0] * 3 + c[0]) / 4, (a[1] * 3 + c[1]) / 4 - sag * 0.8, (a[2] * 3 + c[2]) / 4];
    const q3: V3 = [(a[0] + c[0] * 3) / 4, (a[1] + c[1] * 3) / 4 - sag * 0.8, (a[2] + c[2] * 3) / 4];
    b.tube([a, q1, mid, q3, c], [rad * 1.2, rad, rad * 0.9, rad, rad * 1.2], BARK_TOP, BARK_TOP, BARK, { sides: 9, seg: 20, twist: 1, flute: () => 0.07 });
    town([mid[0], mid[1] + rad * 0.85, mid[2]], Math.atan2(c[2] - a[2], c[0] - a[0]), n, sc, rad * 1.3);
  };
  const KZ = KINGS.z;
  span([-168, by + 4.6 * R, KZ - 104], [-76, by + 5.3 * R, KZ - 112], 14, 5.5, 10, 1.3);
  span([82, by + 5.0 * R, KZ - 124], [176, by + 4.4 * R, KZ - 116], 12, 5.5, 10, 1.3);
  span([-262, by + 2.2 * R, KZ - 40], [-168, by + 2.9 * R, KZ - 104], 8, 5, 11, 1.4);
  span([176, by + 3.0 * R, KZ - 116], [268, by + 2.3 * R, KZ - 52], 8, 5, 10, 1.4);
  span([-128, by + 3.7 * R, KZ - 210], [134, by + 4.1 * R, KZ - 220], 16, 5.5, 16, 1.5);
  span([-212, by + 5.6 * R, KZ - 300], [-20, by + 6.1 * R, KZ - 330], 18, 5.5, 12, 1.5);
  span([-20, by + 6.0 * R, KZ - 330], [206, by + 5.5 * R, KZ - 320], 18, 5.5, 12, 1.5);
  yield;
  began = performance.now();

  // ---------- bridges and ladders ----------
  // a plank bridge sags between two towns that stand near each other, a rope either side for the hand
  let nBridge = 0;
  const used = new Map<number, number>();
  const maxB = lo ? 12 : 44;
  for (let i = 0; i < townAt.length && nBridge < maxB; i++)
    for (let j = i + 1; j < townAt.length && nBridge < maxB; j++) {
      const A = townAt[i].p;
      const C = townAt[j].p;
      const d = Math.hypot(A[0] - C[0], A[2] - C[2]);
      if (d < 24 || d > 78 || Math.abs(A[1] - C[1]) > 20 || (used.get(i) ?? 0) > 1 || (used.get(j) ?? 0) > 1) continue;
      used.set(i, (used.get(i) ?? 0) + 1);
      used.set(j, (used.get(j) ?? 0) + 1);
      nBridge++;
      const sag = d * 0.12;
      const N = 10;
      const sx = -(C[2] - A[2]) / d;
      const sz = (C[0] - A[0]) / d;
      const pt = (u: number, off: number, upY: number): V3 => [A[0] + (C[0] - A[0]) * u + sx * off, A[1] + (C[1] - A[1]) * u - sag * 4 * u * (1 - u) + upY, A[2] + (C[2] - A[2]) * u + sz * off];
      for (let k = 0; k < N; k++) {
        const u0 = k / N;
        const u1 = (k + 1) / N;
        b.quad(pt(u0, -0.8, 0), pt(u0, 0.8, 0), pt(u1, 0.8, 0), pt(u1, -0.8, 0), DARK, PLANK, [0, u0 * d, 1.6, u1 * d]);
      }
      for (const off of [-0.85, 0.85]) {
        const pts: V3[] = [];
        for (let k = 0; k <= 6; k++) pts.push(pt(k / 6, off, 1.25));
        b.tube(pts, [0.2, 0.2], DARK, DARK, PLANK, { sides: 3, seg: 10 });
      }
      walks.push({ a: pt(0.04, 0, 0.1), b: pt(0.96, 0, 0.1) });
      // a lantern at each end
      for (const u of [0.02, 0.98]) {
        const L = pt(u, 0.85, 2.3);
        b.lump(L, [0.34, 0.42, 0.34], [1, 0.6, 0.25], LAMP);
        lamps.push({ p: L, size: 2.6, col: [1, 0.64, 0.3], k: 0.75 });
      }
    }
  // rope ladders let down from a town toward the ground or the next bough below
  townAt.forEach((t, i) => {
    if (r() > (lo ? 0.15 : 0.32)) return;
    const len = 26 + r() * 46;
    const dx = (r() - 0.5) * 5;
    const dz = (r() - 0.5) * 5;
    const sx = t.along[0] * 0.65;
    const sz = t.along[2] * 0.65;
    const p = t.p;
    b.quad([p[0] - sx + dx, p[1] - len, p[2] - sz + dz], [p[0] + sx + dx, p[1] - len, p[2] + sz + dz], [p[0] + sx, p[1], p[2] + sz], [p[0] - sx, p[1], p[2] - sz], DARK, LADDER, [0, 0, 1, len]);
    void i;
  });

  // boulders by the path and the water, under moss
  if (!lo)
    for (let i = 0; i < 46; i++) {
      const z = zTop - r() * (zTop - KINGS.z - 60);
      const x = aisleX(z) + (r() < 0.5 ? -1 : 1) * (10 + r() * (clear(z) + 30));
      const s = 2.5 + r() * r() * 9;
      b.lump([x, gy(x, z) + s * 0.25, z], [s * (1 + r() * 0.5), s * (0.55 + r() * 0.3), s * (1 + r() * 0.5)], [0.04, 0.042, 0.04], BARK, 1, 0.22, i * 3.1);
    }

  // white lights hung far up among the boughs, small as stars
  const nStar = lo ? 70 : 170;
  for (let i = 0; i < nStar; i++) {
    const x = (r() - 0.5) * 1100;
    const z = KINGS.z + 420 - r() * 980;
    const y = by + 30 + Math.pow(r(), 0.8) * 250;
    if (Math.abs(x) < 190 && Math.abs(z - KINGS.z) < 90 && y < by + 5.6 * R) continue;
    stars.push({ p: [x, y, z], size: 1.5 + r() * 1.5, col: r() < 0.72 ? [0.86, 0.92, 1.0] : [1, 0.86, 0.64], k: 0.45 + r() * 0.5 });
  }
  yield;
  const geo = b.build();
  return { geo, trunks: trunks.filter((t) => !t.far), lamps, stars, walks };
}

export function makeWoodMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute vec2 aTex;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec2 vTex;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vCol = aCol; vTex = aTex; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec2 vTex;
      ${GLSL_KINGS}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        float kind = vCol.a;
        float isBark = 1.0 - step(0.5, kind);
        float isWall = step(1.5, kind) * (1.0 - step(2.5, kind));
        float isLadder = step(4.5, kind) * (1.0 - step(5.5, kind));
        float isLamp = step(5.5, kind);
        vec3 alb = vCol.rgb;
        float fw = fwidth(vTex.x) + fwidth(vTex.y);
        float fine = 1.0 - smoothstep(0.3, 1.5, fw);

        // a rope ladder: two rails and the rungs between them, air between the rungs
        {
          float rail = step(0.84, abs(vTex.x * 2.0 - 1.0));
          float rung = 1.0 - smoothstep(0.1, 0.16, abs(fract(vTex.y / 1.6) - 0.5));
          if (isLadder > 0.5 && fw < 0.7 && rail + rung < 0.5) discard;
        }

        // bark: deep furrows running with the limb, plates between them, broken across here and there
        vec2 q = vec2(vTex.x * 0.4 + vnoise(vec2(vTex.x * 0.09, vTex.y * 0.028)) * 2.4, vTex.y * 0.042);
        float r1 = 1.0 - abs(vnoise(q) * 2.0 - 1.0);
        float r2 = 1.0 - abs(vnoise(q * vec2(2.7, 2.3) + 9.0) * 2.0 - 1.0);
        float groove = smoothstep(0.6, 0.93, r1 * 0.62 + r2 * 0.38) * fine * isBark;
        float rough = vnoise(vTex * vec2(1.4, 0.36));
        float h = (-groove * 0.9 + (rough - 0.5) * 0.3 * fine) * isBark;
        alb *= mix(1.0, mix(1.0, 0.34, groove) * (0.72 + 0.56 * vnoise(vec2(vTex.x * 0.2, vTex.y * 0.02) + 4.0)), isBark);
        // moss on whatever faces up and low on the weather side; pale scabs of lichen
        float mossN = vnoise(vWorld.xz * 0.05 + vWorld.y * 0.03) * 0.6 + vnoise(vTex * vec2(0.3, 0.12)) * 0.4;
        float moss = smoothstep(0.44, 0.72, mossN + n.y * 0.45 + (1.0 - smoothstep(0.0, 60.0, vWorld.y)) * 0.2 - 0.12) * (1.0 - groove * 0.5) * isBark;
        alb = mix(alb, vec3(0.03, 0.085, 0.045) * (0.7 + 0.6 * vnoise(vTex * 1.1)), moss * 0.85);
        float lichen = smoothstep(0.78, 0.87, vnoise(vTex * vec2(0.5, 0.42) + 20.0)) * fine * isBark;
        alb = mix(alb, vec3(0.085, 0.105, 0.09), lichen * 0.5);
        h += moss * 0.22 * vnoise(vTex * 2.3) * fine;
        alb *= 1.0 + (dabs(vWorld) - 0.5) * 0.3;

        // a wall: its windows, some of them lit, each candle a little unsteady
        vec2 wc = vec2(vTex.x / 2.0, vTex.y / 2.7);
        vec2 wi = floor(wc); vec2 wf = fract(wc) - 0.5;
        float wfw = fw * 0.45;
        float win = (1.0 - smoothstep(0.19 - wfw, 0.19 + wfw, abs(wf.x))) * (1.0 - smoothstep(0.2 - wfw, 0.2 + wfw, abs(wf.y + 0.04)));
        float mull = max(1.0 - smoothstep(0.015, 0.035, abs(wf.x)), 1.0 - smoothstep(0.015, 0.035, abs(wf.y + 0.04)));
        float litW = step(0.52, hash12(wi + 3.7));
        float crisp = 1.0 - smoothstep(0.35, 1.5, fw);
        float candle = 0.84 + 0.16 * sin(uTime * (0.6 + hash12(wi) * 0.8) + hash12(wi + 1.0) * 40.0);
        float glowW = mix(0.016, win * litW * (1.0 - mull * 0.6 * crisp), crisp) * isWall * candle;
        vec3 emit = mix(vec3(1.0, 0.56, 0.22), vec3(1.0, 0.74, 0.4), hash12(wi + 9.0)) * glowW * 1.25;
        alb = mix(alb, alb * 0.5, win * (1.0 - litW) * crisp * isWall);
        emit += vCol.rgb * isLamp * 2.2;
        alb *= 1.0 - isLamp;

        n = bumpN(n, vWorld, h, 1.0);
        vec2 dl = domeLight(vWorld, n);
        float att = dl.y * domeVis(vWorld);
        float wrap = clamp(dl.x * 0.7 + 0.3, 0.0, 1.0);
        // the feet of the wood stand in their own shade
        float foot = mix(0.5, 1.0, smoothstep(0.0, 16.0, vWorld.y)) * mix(1.0, 0.45, groove);
        vec3 col = alb * (coolFill(n) * foot + DOME_WARM * att * wrap * wrap * 3.7);
        // every edge turned to the light takes it; the far edge keeps a thread of the night's blue, and stands off the mist
        float fres = pow(1.0 - abs(dot(n, V)), 2.6);
        col += DOME_WARM * alb * fres * att * clamp(dl.x + 0.45, 0.0, 1.0) * 2.4;
        col += vec3(0.01, 0.026, 0.042) * fres * clamp(0.4 - dl.x, 0.0, 1.0) * 0.55;
        // damp moss gives the light back a little
        col += DOME_WARM * vec3(0.5, 0.9, 0.4) * moss * att * pow(max(dot(n, normalize(normalize(uDome - vWorld) + V)), 0.0), 8.0) * 0.12;
        col += emit;
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}
