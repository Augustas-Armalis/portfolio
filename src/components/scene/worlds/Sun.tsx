"use client";

import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, GreatSun, type Flock } from "./life";
import { cumulus, makeRayDiscMaterial, makeSoftMaterial, softGeometry, type Soft } from "./stars/forms";
import { beamGeometry, makeBeamMaterial, makeGoldStone, type Beam } from "./sun/gold";
import { SUN_BRIDGES, WORLDS, gateOf, groundAt, pathOf } from "./voyage";

// Sonata of the Sun (Allegro, 1907), built at the size the picture feels: everything in it towers.
//
// What the painting holds, and where each thing is here:
//   - a field and an air of dull gold, laid in pastel with upright strokes   the ground, a gold-green height haze, grain on every form
//   - great blue-grey bells, one behind another, a comb of thin dark spires down a shoulder
//                                                                            BELLS, hundreds of metres tall, and a far ring of them
//   - a sun in a keyhole niche cut into the tallest bell                    the niche on the great bell, lit from within
//   - twin towers on a crown with a half-sun in the notch between them      on the right-hand bell
//   - a low dome at the front with the great sun of the picture on its face  the low bell by the second arch
//   - slim twin-tower gatehouses with an arch and a little sun hung in it   GATEHOUSES, which the path flies through
//   - suns drawn as he drew them (disc, ring, straight rays) in rows like notes on a stave
//                                                                            rows over the field, climbing to the left
//   - far left, a low shelf on the horizon with a comb of strokes, a small temple and a great sun
//   - a long thin wave of line across the top, small birds, bands of cloud  a serpent of light high up, flocks, the sky's bars
//   - a palisade of upright strokes along the foot                           palisades lining the way
// And what it suggests: the light comes from behind the bells (one great sun, low ahead, its rays pouring through
// the arches), and the city goes on (aqueducts crossing the way, receding into the haze).
//
// Zones flown through: the field of flower-suns and the painting; the first gatehouse; under the first aqueduct;
// the second gatehouse and the low dome; through the two-tiered aqueduct; the canyon of bells, their shadows laid
// across the field; and out over the open plain toward the great sun and the gate.

const def = WORLDS.sun;

// (pale gold, lighter toward the top of every form; its shade is turned violet-blue by the paint itself: sun/gold.ts)
const STONE: V3 = [0.86, 0.6, 0.24];
const STONE_TOP: V3 = [1.0, 0.84, 0.5];
const DARK: V3 = [0.34, 0.24, 0.2];
// the low sun the whole world is lit from (the same numbers as the sky's: voyage.ts AIR.sun)
const SUN_DIR = new THREE.Vector3(Math.sin(0.2094) * Math.cos(0.2269), Math.sin(0.2269), -Math.cos(0.2094) * Math.cos(0.2269));
const GOLD: V3 = [1.0, 0.7, 0.22];

// the bells: [x, z, radius at the foot, height] (the near six are the world's obstacles, see voyage.ts)
export const BELLS: [number, number, number, number][] = [
  [30, -190, 84, 470],
  [-92, -120, 62, 330],
  [124, -92, 54, 300],
  [-10, -40, 70, 120],
  [-210, -260, 46, 240],
  [210, -250, 42, 210],
];
const SHADOWS = 12;
// the ground under the bells' shadows: long soft tongues of shade laid away from the sun
const bellU = { uBells: { value: Array.from({ length: SHADOWS }, () => new THREE.Vector4(0, 0, 0, 0)) } };
export const SUN_PAL: GroundPalette = {
  a: [0.4, 0.31, 0.09],
  b: [0.5, 0.37, 0.11],
  c: [0.3, 0.29, 0.12],
  hook: {
    uniforms: bellU,
    decl: /* glsl */ `
      uniform vec4 uBells[${SHADOWS}];
      float bellShade(vec2 p){
        vec2 s = -normalize(uKeyDir.xz + vec2(1e-4));
        float tanE = max(uKeyDir.y, 0.05) / max(length(uKeyDir.xz), 1e-3);
        float sh = 0.0;
        for (int i = 0; i < ${SHADOWS}; i++) {
          vec4 b = uBells[i];
          if (b.z <= 0.0) continue;
          vec2 d = p - b.xy;
          float along = dot(d, s);
          float perp = abs(d.x * s.y - d.y * s.x);
          float L = min(b.w / tanE, 1400.0);
          float u = clamp(along / L, 0.0, 1.0);
          // the bell's own outline laid on the ground: full width near its foot, closing to the point of its crown
          float hw = b.z * sqrt(max(0.0, 1.0 - pow(u, 3.1))) * (1.0 - 0.16 * u);
          float k = (1.0 - smoothstep(hw * 0.7, hw * 1.15 + 6.0, perp)) * smoothstep(-b.z, 0.0, along) * (1.0 - smoothstep(0.85, 1.0, u));
          // softer the further it falls
          sh = max(sh, k * (0.62 - 0.32 * u));
        }
        return sh;
      }`,
    lit: `col *= 1.0 - bellShade(vLocal.xz);`,
  },
};

// a bell's profile: all but upright at the foot, a round shoulder, a crown that almost comes to a point
const bellR = (t: number) => (1 + 0.07 * Math.exp(-t * 9)) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 3.1))) * (1 - 0.16 * t);
function bell(k: Kit, x: number, z: number, R: number, H: number, y0: number, col: V3 = STONE, top: V3 = STONE_TOP, seg = 64, rows = 40) {
  const prof: [number, number][] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    // a shallow plinth step round the foot, so it stands on the ground rather than in it
    const plinth = t < 0.035 ? 1.05 : 1;
    prof.push([R * bellR(t) * plinth, -8 + (H + 8) * t]);
  }
  k.lathe(prof, [x, y0, z], col, { top, seg });
}
// a comb of thin spires standing along one shoulder of a bell, tallest at the top
function comb(k: Kit, x: number, z: number, R: number, H: number, y0: number, side: number, n: number, r: () => number) {
  for (let i = 0; i < n; i++) {
    const t = 0.3 + (i / (n - 1)) * 0.6;
    const rr = R * bellR(t) * 0.985;
    const ang = side + (r() - 0.5) * 0.12;
    const h = (7 + 16 * (i / (n - 1)) + r() * 5) * (R / 70) * (0.6 + H / 500);
    const px = x + Math.cos(ang) * rr;
    const pz = z + Math.sin(ang) * rr;
    k.add(new THREE.ConeGeometry(0.5 * (R / 70) * (0.7 + H / 700) + 0.2, h, 5), [px, y0 - 8 + (H + 8) * t + h / 2 - 1, pz], DARK, { top: [0.66, 0.48, 0.26] });
  }
}
// gold threads drawn round a bell, as he drew an arc across a form
function threads(k: Kit, x: number, z: number, R: number, H: number, y0: number, ts: number[]) {
  for (const t of ts) {
    const rr = R * bellR(t) + 0.3;
    k.add(new THREE.TorusGeometry(rr, 0.22 + R * 0.0016, 5, 96), [x, y0 - 8 + (H + 8) * t, z], GOLD, { glow: 1.0, rot: [Math.PI / 2, 0, 0] });
  }
}

// a gate: two slim towers with crowns of merlons, an arch between them
function gatehouse(k: Kit, x: number, z: number, yaw: number, y0: number, s: number) {
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const at = (u: number, y: number, w = 0): V3 => [x + c * u + sn * w, y0 + y, z - sn * u + c * w];
  const half = 15 * s;
  const H = 52 * s;
  for (const side of [-1, 1]) {
    const w = 4.6 * s;
    k.lathe(
      [
        [w * 1.5, -6],
        [w * 1.18, 2 * s],
        [w, 7 * s],
        [w * 0.94, H * 0.5],
        [w * 1.0, H * 0.52],
        [w * 0.86, H * 0.82],
        [w * 1.04, H * 0.86],
        [w * 1.04, H],
        [w * 0.8, H],
      ],
      at(side * half, 0),
      STONE,
      { top: STONE_TOP, seg: 4, flat: true, rot: [0, yaw + Math.PI / 4, 0] },
    );
    for (const a of [-1, 1]) for (const b of [-1, 1]) k.box(1.5 * s, 4.4 * s, 1.5 * s, at(side * half + a * w * 0.56, H + 2.2 * s, b * w * 0.56), STONE_TOP, { rot: [0, yaw, 0] });
    // slits of lit window up the shaft, and a spire on the crown
    for (const f of [0.3, 0.52, 0.7]) k.box(0.36 * s, H * 0.1, 0.3, at(side * half, H * f, w * 0.74), GOLD, { glow: 1.4, rot: [0, yaw, 0] });
    k.add(new THREE.ConeGeometry(w * 0.5, H * 0.28, 4), at(side * half, H + H * 0.14 + 2 * s), DARK, { top: STONE, rot: [0, yaw + Math.PI / 4, 0] });
  }
  const sh = new THREE.Shape();
  const top = H * 0.74;
  const spring = H * 0.34;
  const inner = half - 5.2 * s;
  sh.moveTo(-half, spring - 6 * s);
  sh.lineTo(-half, top);
  sh.lineTo(0, top + 7 * s);
  sh.lineTo(half, top);
  sh.lineTo(half, spring - 6 * s);
  sh.lineTo(inner, spring - 6 * s);
  sh.lineTo(inner, spring);
  sh.absarc(0, spring, inner, 0, Math.PI, false);
  sh.lineTo(-inner, spring - 6 * s);
  sh.lineTo(-half, spring - 6 * s);
  const wall = new THREE.ExtrudeGeometry(sh, { depth: 2.4 * s, bevelEnabled: false, curveSegments: 28 });
  wall.translate(0, 0, -1.2 * s);
  k.add(wall, at(0, 0), STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
  const pts: V3[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI;
    pts.push(at(Math.cos(a) * (inner - 0.2), spring + Math.sin(a) * (inner - 0.2), 0));
  }
  k.tube([at(inner - 0.2, spring - 6 * s, 0), ...pts, at(-inner + 0.2, spring - 6 * s, 0)], 0.16 * s, GOLD, { glow: 1.3, seg: 90, sides: 5 });
  return { sun: at(0, spring + inner * 0.62, 0), size: inner * 0.62, top: at(0, top + 2 * s, 1.6 * s) };
}
// the gatehouses on the way in: [x, z, yaw, scale] (their towers are obstacles in voyage.ts)
const GATEHOUSES: [number, number, number, number][] = [
  [20, 208, 0.12, 2.4],
  [-12, 96, 0.42, 2.6],
];

// An aqueduct of great arches, one bay at a time: piers with a string course at the springing, a gold thread
// round each arch, a second tier of smaller arches above where it is two-tiered, a coping with merlons, and a
// drawn sun hung in every other arch. A bay that would run into a bell is left out (the bridge lands on it).
function aqueduct(k: Kit, suns: Halo[], b: (typeof SUN_BRIDGES)[number], bells: [number, number, number, number][], fine: boolean) {
  const yaw = Math.atan2(-b.u[1], b.u[0]);
  const thick = 9 + b.w * 0.08;
  for (let i = 0; i < b.n; i++) {
    const a = (i - (b.n - 1) / 2) * b.w;
    const x = b.c[0] + b.u[0] * a;
    const z = b.c[1] + b.u[1] * a;
    if (bells.some(([bx, bz, R]) => Math.hypot(x - bx, z - bz) < R + b.w * 0.55)) continue;
    const y0 = Math.min(groundAt(def, x - b.u[0] * b.w * 0.5, z - b.u[1] * b.w * 0.5), groundAt(def, x + b.u[0] * b.w * 0.5, z + b.u[1] * b.w * 0.5)) - 1;
    const r = b.w * 0.34;
    const spring = b.H * 0.5;
    const hw = b.w / 2;
    const sh = new THREE.Shape();
    sh.moveTo(-hw, -8);
    sh.lineTo(-hw, b.H);
    sh.lineTo(hw, b.H);
    sh.lineTo(hw, -8);
    sh.lineTo(r, -8);
    sh.lineTo(r, spring);
    sh.absarc(0, spring, r, 0, Math.PI, false);
    sh.lineTo(-r, -8);
    sh.lineTo(-hw, -8);
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: fine ? 24 : 14 });
    g.translate(0, 0, -thick / 2);
    k.add(g, [x, y0, z], STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
    const at = (u: number, y: number, w = 0): V3 => [x + b.u[0] * u - b.u[1] * w, y0 + y, z + b.u[1] * u + b.u[0] * w];
    // the string course at the springing and the coping, standing proud of the wall
    k.box(b.w, 2.6, thick + 2.4, at(0, spring - 1.3), STONE_TOP, { rot: [0, yaw, 0] });
    k.box(b.w, 3.4, thick + 3, at(0, b.H + 1.7), STONE_TOP, { rot: [0, yaw, 0] });
    // pilasters on the pier faces
    for (const sd of [-1, 1]) for (const f of [-1, 1]) k.box(4.2, spring - 2, 1.6, at(sd * hw, (spring - 2) / 2, f * (thick / 2 + 0.6)), STONE_TOP, { rot: [0, yaw, 0] });
    // the gold thread round the arch, on both faces
    for (const f of [-1, 1]) {
      const pts: V3[] = [at(r - 0.3, 0, f * (thick / 2 + 0.25))];
      for (let j = 0; j <= 28; j++) {
        const t = (j / 28) * Math.PI;
        pts.push(at(Math.cos(t) * (r - 0.3), spring + Math.sin(t) * (r - 0.3), f * (thick / 2 + 0.25)));
      }
      pts.push(at(-r + 0.3, 0, f * (thick / 2 + 0.25)));
      k.tube(pts, 0.32, GOLD, { glow: 1.25, seg: 80, sides: 4 });
    }
    // merlons along the top
    for (let m = 0; m < 4; m++) k.box(2.6, 5, 3, at(-hw + (m + 0.5) * (b.w / 4), b.H + 5.9), STONE_TOP, { rot: [0, yaw, 0] });
    // the second tier: three small arches over each great one
    if (b.tiers > 1) {
      const h2 = b.H * 0.34;
      const w2 = b.w / 3;
      for (let m = 0; m < 3; m++) {
        const r2 = w2 * 0.32;
        const s2 = new THREE.Shape();
        const cx = -hw + (m + 0.5) * w2;
        s2.moveTo(cx - w2 / 2, 0);
        s2.lineTo(cx - w2 / 2, h2);
        s2.lineTo(cx + w2 / 2, h2);
        s2.lineTo(cx + w2 / 2, 0);
        s2.lineTo(cx + r2, 0);
        s2.lineTo(cx + r2, h2 * 0.5);
        s2.absarc(cx, h2 * 0.5, r2, 0, Math.PI, false);
        s2.lineTo(cx - r2, 0);
        s2.lineTo(cx - w2 / 2, 0);
        const g2 = new THREE.ExtrudeGeometry(s2, { depth: thick * 0.7, bevelEnabled: false, curveSegments: 10 });
        g2.translate(0, 0, -thick * 0.35);
        k.add(g2, at(0, b.H + 3.4), STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
      }
      k.box(b.w, 2.6, thick * 0.7 + 2, at(0, b.H + 3.4 + h2 + 1.3), STONE_TOP, { rot: [0, yaw, 0] });
    }
    // a drawn sun hung in every other arch (and always in the one the path flies through)
    if (i % 2 === (b.n - 1) / 2 % 2) suns.push({ p: at(0, spring + r * 0.45, 0), size: r * 0.62, col: GOLD, k: 0.8 });
  }
}

export default function SunWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const r = rng(1907);
    const k = new Kit();
    const far = new Kit();
    const suns: Halo[] = [];
    const glows: Halo[] = [];
    const puffs: Puff[] = [];
    const g = (x: number, z: number) => groundAt(def, x, z);
    const fine = !props.mobile;
    const win: number[] = [];
    const discs: { p: V3; s: number; ry: number }[] = [];

    // the near bells, their combs and threads
    BELLS.forEach(([x, z, R, H], i) => {
      const y0 = g(x, z) - 2;
      // a lamp in every third arch of every arcade (the arcades are drawn by the paint: sun/gold.ts)
      for (let m = 0; 60 * m + 50 < y0 + H * 0.9; m++) {
        const y = 60 * m + 49.5;
        const t = (y - (y0 - 8)) / (H + 8);
        if (t < 0.04) continue;
        const rr = R * bellR(t) + 0.5;
        for (let j = (m + i) % 3; j < 40; j += 3) {
          const th = ((j + 0.5) / 40) * Math.PI * 2;
          win.push(x + Math.cos(th) * rr, y, z + Math.sin(th) * rr);
        }
      }
      bell(k, x, z, R, H, y0);
      threads(k, x, z, R, H, y0, i === 3 ? [0.3, 0.62] : [0.12, 0.38, 0.62]);
      comb(k, x, z, R, H, y0, i % 2 ? 2.3 : 0.75, props.mobile ? 10 : 22, r);
      comb(k, x, z, R, H, y0, i % 2 ? 0.2 : 2.6, props.mobile ? 6 : 14, r);
      // a warm breath of light behind each crown, where the sun stands behind it
      glows.push({ p: [x, y0 + H * 0.92, z - R * 0.4], size: R * 2.4, col: [1, 0.7, 0.28], k: 0.1 });
    });
    // the keyhole niche in the great bell, facing the way the path comes round it, with a sun lit inside
    {
      const [x, z, R, H] = BELLS[0];
      const y0 = g(x, z) - 2;
      const t = 0.6;
      const ang = Math.atan2(-192 - z, -172 - x); // toward where the path passes
      const rr = R * bellR(t);
      const nx = Math.cos(ang);
      const nz = Math.sin(ang);
      const cy = y0 - 8 + (H + 8) * t;
      // the niche: a deep dark-gold recess (a flattened disc set into the face) with a round head
      const sh = new THREE.Shape();
      const nw = rr * 0.34;
      const nh = H * 0.13;
      sh.moveTo(-nw, -nh);
      sh.lineTo(-nw, nh * 0.4);
      sh.absarc(0, nh * 0.4, nw, Math.PI, 0, true);
      sh.lineTo(nw, -nh);
      sh.lineTo(-nw, -nh);
      const ng = new THREE.ShapeGeometry(sh, 24);
      k.add(ng, [x + nx * (rr + 0.8), cy, z + nz * (rr + 0.8)], [0.9, 0.55, 0.18], { glow: 0.55, rot: [0, Math.atan2(nx, nz), 0] });
      suns.push({ p: [x + nx * (rr + 6), cy + nh * 0.25, z + nz * (rr + 6)], size: nw * 0.95, col: GOLD, k: 0.95 });
      discs.push({ p: [x + nx * (rr + 3), cy + nh * 0.25, z + nz * (rr + 3)], s: nw * 2.6, ry: Math.atan2(nx, nz) });
      glows.push({ p: [x + nx * (rr + 20), cy, z + nz * (rr + 20)], size: nw * 3.2, col: [1, 0.66, 0.24], k: 0.2 });
    }
    // the low dome at the front carries the great sun of the picture on its face
    {
      const [x, z, R, H] = BELLS[3];
      const y0 = g(x, z);
      suns.push({ p: [x - 10, y0 + H * 0.45, z + R * 0.98], size: 52, col: GOLD, k: 0.8 });
      discs.push({ p: [x - 10, y0 + H * 0.45, z + R * 0.99], s: 90, ry: 0 });
      glows.push({ p: [x - 10, y0 + H * 0.45, z + R * 1.5], size: 70, col: [1, 0.66, 0.24], k: 0.14 });
    }
    // twin towers standing on the crown of the right-hand bell, a sun in the notch between them
    {
      const [x, z, , H] = BELLS[2];
      const y0 = g(x, z) + H - 30;
      const gh = gatehouse(k, x, z, 0.5, y0, 1.3);
      suns.push({ p: gh.sun, size: gh.size * 2.2, col: GOLD, k: 0.8 });
      glows.push({ p: gh.sun, size: gh.size * 5, col: [1, 0.68, 0.26], k: 0.12 });
    }
    // the gatehouses on the way in, each with a little sun hung in its arch
    for (const [x, z, yaw, s] of GATEHOUSES) {
      const gh = gatehouse(k, x, z, yaw, g(x, z) - 1, s);
      suns.push({ p: gh.sun, size: gh.size, col: GOLD, k: 0.8 });
      glows.push({ p: gh.sun, size: gh.size * 3, col: [1, 0.68, 0.26], k: 0.14 });
      // a palisade of upright strokes running off either side of it
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      for (const side of [-1, 1])
        for (let i = 0; i < (props.mobile ? 20 : 46); i++) {
          const u = side * (15 * s + 14 + i * 3.1);
          const px = x + c * u + (r() - 0.5) * 0.8;
          const pz = z - sn * u + (r() - 0.5) * 0.8;
          const h = 7 + r() * 5 + (i % 5 === 0 ? 4 : 0);
          k.add(new THREE.CylinderGeometry(0.28, 0.45, h, 4), [px, g(px, pz) + h / 2 - 0.6, pz], DARK, { top: STONE });
        }
    }
    // the last pair, either side of the way out
    {
      const gate = gateOf("sun")!;
      const gh = gatehouse(k, gate.pos.x, gate.pos.z, gate.yaw, g(gate.pos.x, gate.pos.z) - 1, 1.5);
      suns.push({ p: [gh.top[0], gh.top[1] + 16, gh.top[2]], size: 20, col: GOLD, k: 0.7 });
    }
    // the aqueducts the path flies through
    for (const br of SUN_BRIDGES) aqueduct(k, suns, br, BELLS, fine);
    // and more of them, far off, receding into the haze: the city goes on
    const farBridges: (typeof SUN_BRIDGES)[number][] = [
      { c: [-160, -720], u: [0.995, 0.1], n: 15, w: 110, H: 250, tiers: 2 },
      { c: [620, -260], u: [0.25, 0.97], n: 9, w: 100, H: 210, tiers: 1 },
      { c: [-640, -160], u: [0.2, -0.98], n: 9, w: 96, H: 190, tiers: 2 },
    ];
    for (const br of farBridges) aqueduct(far, suns, br, [], false);

    // the suns over the field: rows that climb to the left like notes on a stave, big now, and high
    const rows = props.mobile ? 2 : 4;
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < 8; i++) {
        const x = -420 + i * 52 + row * 40 + (r() - 0.5) * 20;
        const z = 220 - i * 64 - row * 80 + (r() - 0.5) * 30;
        const y = g(x, z) + 70 + i * 22 + row * 46 + (r() - 0.5) * 16;
        const size = 22 + r() * 18 + (i === 3 ? 16 : 0);
        suns.push({ p: [x, y, z], size, col: GOLD, k: 0.75 });
        if (i % 3 === 0) glows.push({ p: [x, y, z], size: size * 2.6, col: [1, 0.72, 0.3], k: 0.07 });
      }
    for (let i = 0; i < 8; i++) {
      const x = 220 + i * 60 + (r() - 0.5) * 30;
      const z = 120 - i * 90;
      suns.push({ p: [x, g(x, z) + 150 + i * 26, z], size: 26 + r() * 14, col: GOLD, k: 0.8 });
    }
    // suns on stems in the grass, like flowers, in drifts all along the path
    const pts = pathOf("sun").pts;
    const clear = (x: number, z: number) =>
      def.canvases.every((c) => Math.hypot(x - c.x, z - c.z) > 34) && BELLS.every(([bx, bz, R]) => Math.hypot(x - bx, z - bz) > R + 6) && SUN_BRIDGES.every((br) => Math.abs((x - br.c[0]) * br.u[1] - (z - br.c[1]) * br.u[0]) > 12);
    const drifts = props.mobile ? 16 : 44;
    for (let d = 0; d < drifts; d++) {
      const p = pts[Math.floor(((d + 0.5) / drifts) * (pts.length - 12))];
      const side = d % 2 ? 1 : -1;
      const cx = p.x + side * (20 + r() * 40);
      const cz = p.z + (r() - 0.5) * 24;
      const n = 3 + Math.floor(r() * (props.mobile ? 3 : 6));
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 30;
        const z = cz + (r() - 0.5) * 30;
        if (!clear(x, z)) continue;
        const h = 2.6 + r() * 4.4;
        const y = g(x, z);
        k.add(new THREE.CylinderGeometry(0.014, 0.04, h, 4, 1, true), [x, y + h / 2, z], [0.34, 0.28, 0.12], { rot: [(r() - 0.5) * 0.16, 0, (r() - 0.5) * 0.16] });
        suns.push({ p: [x, y + h + 0.7, z], size: 1.8 + r() * 1.3, col: GOLD, k: 0.75 });
      }
    }
    // stands of thin dark spires on the plain, fanned like his trees: the same comb the bells wear
    const stands = props.mobile ? 12 : Math.round(40 * props.trees);
    for (let d = 0; d < stands; d++) {
      const a = r() * Math.PI * 2;
      const dist = 90 + r() * 480;
      const cx = Math.cos(a) * dist;
      const cz = Math.sin(a) * dist - 40;
      const n = 5 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) {
        // tallest in the middle of the stand, leaning out a little either side: a fan
        const f = (i - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
        const x = cx + f * n * 1.6 * Math.cos(a + 1.2) + (r() - 0.5) * 2;
        const z = cz + f * n * 1.6 * Math.sin(a + 1.2) + (r() - 0.5) * 2;
        if (!clear(x, z) || pts.some((q, j) => j % 4 === 0 && Math.hypot(q.x - x, q.z - z) < 14)) continue;
        const h = (16 + r() * 14) * (1 - 0.45 * f * f);
        k.add(new THREE.ConeGeometry(0.6 + h * 0.018, h, 5), [x, g(x, z) + h / 2 - 0.5, z], DARK, { top: [0.66, 0.48, 0.26], rot: [0, 0, -f * 0.12] });
      }
    }

    // far bells, paler with every row: a whole ring of them, colossal, going into the haze
    const ring = props.mobile ? 10 : 22;
    for (let i = 0; i < ring; i++) {
      const a = -Math.PI + (i / ring) * Math.PI * 2 + (r() - 0.5) * 0.12;
      // (not straight behind the entry: the way in stays open)
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.28) continue;
      const d = 760 + r() * 420;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 60;
      const R = 110 + r() * 150;
      const H = R * (2.4 + r() * 1.6);
      bell(far, x, z, R, H, g(x, z) - 10, STONE, STONE_TOP, 40, 26);
      comb(far, x, z, R, H, g(x, z) - 10, a + 2.2, 9, r);
      threads(far, x, z, R, H, g(x, z) - 10, [0.2, 0.55]);
      if (i % 3 === 0) suns.push({ p: [x + R * 0.3, g(x, z) + H * 0.6, z], size: 60 + R * 0.2, col: GOLD, k: 0.85 });
    }
    // the far strip at the upper left of the picture: a long low shelf of land on the horizon, a comb of thin
    // strokes along it, a small temple, and its own row of drawn suns with a great one at the end
    {
      const sx = -560;
      const sz = -380;
      const yaw = Math.atan2(sx, sz + 40) + Math.PI;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const sy = g(sx, sz) + 30;
      const S = 1.8;
      const L = (u: number, y: number, w = 0): V3 => [sx + c * u * S + sn * w * S, sy + y * S, sz - sn * u * S + c * w * S];
      far.box(300 * S, 5 * S, 26 * S, L(0, 0), DARK, { top: STONE, rot: [0, yaw, 0] });
      far.box(330 * S, 200 * S, 34 * S, L(0, -102), DARK, { top: DARK, rot: [0, yaw, 0] });
      for (let i = 0; i < 40; i++) {
        const u = -140 + i * 4.8 + (r() - 0.5) * 2;
        if (Math.abs(u - 62) < 26) continue;
        const h = 9 + r() * 12;
        far.add(new THREE.ConeGeometry(1.0 * S, h * S, 4), L(u, 2.5 + h / 2), DARK, { top: STONE });
      }
      far.box(34 * S, 3 * S, 16 * S, L(62, 4), STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
      for (let i = 0; i < 6; i++) far.add(new THREE.CylinderGeometry(1.1 * S, 1.3 * S, 17 * S, 8), L(62 - 13.5 + i * 5.4, 14, 5), STONE, { top: STONE_TOP });
      far.box(32 * S, 2.4 * S, 14 * S, L(62, 23.6), STONE_TOP, { rot: [0, yaw, 0] });
      far.add(new THREE.CylinderGeometry(8 * S, 8 * S, 32 * S, 3, 1, false, Math.PI / 2), L(62, 27.2), STONE, { rot: [0, yaw, Math.PI / 2], scale: [0.6, 1, 1] });
      suns.push({ p: L(-150, 40, 6), size: 110, col: GOLD, k: 0.9 });
      discs.push({ p: L(-150, 40, 8), s: 240, ry: yaw });
      glows.push({ p: L(-150, 40, 6), size: 300, col: [1, 0.7, 0.3], k: 0.12 });
      for (let i = 0; i < 5; i++) suns.push({ p: L(-70 + i * 44, 50 + (i % 2) * 9, 6), size: 30, col: GOLD, k: 0.85 });
    }
    // the long thin wave of line across the top of the picture: a serpent of light high over the city
    {
      const wave: V3[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        wave.push([-1100 + t * 2200, 560 + Math.sin(t * Math.PI * 3.2) * 46 + Math.sin(t * 17) * 8, -900 + Math.sin(t * Math.PI * 1.3) * 160]);
      }
      far.tube(wave, 2.6, [1, 0.86, 0.6], { glow: 1.1, seg: 260, sides: 5 });
    }
    // low mist where the path runs between the gates, and lying in the hollows of the field
    for (let i = 0; i < (props.mobile ? 10 : 26); i++) puffs.push({ p: [(r() - 0.5) * 700, g(0, 150) + 4 + r() * 8, 420 - r() * 820], size: 50 + r() * 70, a: 0.55 });

    // ----- a sky of rounded cloud, gold where the sun finds it and violet beneath, receding to the horizon -----
    const cloudsNear: Soft[] = [];
    const cloudsFar: Soft[] = [];
    const nCl = props.mobile ? 70 : Math.round(150 + 110 * props.effects);
    for (let i = 0; i < nCl; i++) {
      const a = r() * Math.PI * 2;
      const d = 150 + Math.sqrt(r()) * 2400;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 100;
      const sz = 40 + r() * 60;
      cumulus(d < 900 ? cloudsNear : cloudsFar, [x, 560 + r() * 190 + d * 0.05, z], sz, [1.0, 0.82, 0.5], r, { long: 1 + r() * 1.4, yaw: (r() - 0.5) * 0.8, glow: 0.16 });
    }
    // and small ones adrift among the bells, below their shoulders
    for (let i = 0; i < (props.mobile ? 8 : 26); i++) {
      const a = r() * Math.PI * 2;
      const d = 240 + r() * 700;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 120;
      const y = 150 + r() * 230;
      if (pts.some((q, j) => j % 6 === 0 && Math.hypot(q.x - x, q.y - y, q.z - z) < 110) || BELLS.some(([bx, bz, R]) => Math.hypot(x - bx, z - bz) < R + 60)) continue;
      cumulus(cloudsNear, [x, y, z], 16 + r() * 18, [1.0, 0.86, 0.6], r, { long: 1.4 + r() * 1.6, glow: 0.16 });
    }

    // ----- thousands of small round trees over the plain, in groves and rows: the measure of everything -----
    const trees: Soft[] = [];
    const nTr = props.mobile ? 1300 : Math.round(2400 + 3200 * props.trees);
    let gx = 0;
    let gz = 0;
    let gs = 20;
    for (let i = 0; i < nTr; i++) {
      if (i % 16 === 0) {
        const a = r() * Math.PI * 2;
        const d = 50 + Math.pow(r(), 0.7) * 1150;
        gx = Math.cos(a) * d;
        gz = Math.sin(a) * d - 60;
        gs = 12 + r() * 46;
      }
      // (a grove is a clump; now and then a row along a field's edge)
      const row = (i >> 4) % 4 === 0;
      const x = gx + (row ? ((i % 16) - 8) * gs * 0.3 : (r() - 0.5) * gs * 2);
      const z = gz + (row ? (r() - 0.5) * 3 : (r() - 0.5) * gs * 2);
      if (!clear(x, z) || pts.some((q, j) => j % 4 === 0 && Math.hypot(q.x - x, q.z - z) < 34)) continue;
      const far2 = Math.hypot(x, z) > 600 ? 1.8 : 1;
      const pick = r();
      // slim cypresses like his upright strokes, and round bushes of gold and olive between them
      const tall = r() < 0.42;
      const rad = (tall ? 0.7 + r() * 0.6 : 1.0 + r() * 1.4) * far2;
      const sy = tall ? 3.2 + r() * 1.8 : 0.9 + r() * 0.4;
      const col: V3 = tall ? (pick < 0.6 ? [0.3, 0.33, 0.1] : [0.38, 0.3, 0.08]) : pick < 0.45 ? [0.52, 0.44, 0.1] : pick < 0.75 ? [0.6, 0.38, 0.08] : [0.78, 0.56, 0.14];
      trees.push({ p: [x, g(x, z) + rad * sy * 0.85, z], r: rad, col, sy, seed: r() });
    }

    // ----- shafts of sunlight: through every arch of the aqueducts, and broad ones between the bells -----
    const beams: Beam[] = [];
    for (const br of SUN_BRIDGES)
      for (let i = 0; i < br.n; i++) {
        if (props.mobile && i % 3) continue;
        const a = (i - (br.n - 1) / 2) * br.w;
        const x = br.c[0] + br.u[0] * a;
        const z = br.c[1] + br.u[1] * a;
        if (BELLS.some(([bx, bz, R]) => Math.hypot(x - bx, z - bz) < R + br.w * 0.55)) continue;
        const rad = br.w * 0.34;
        const h = br.H * 0.5 + rad * 0.3;
        beams.push({ from: [x, g(x, z) + h, z], r: rad * 0.8, len: Math.min(820, (h + 8) / SUN_DIR.y), k: 0.9 });
      }
    for (const [x, y, z, rad] of [
      [-28, 320, -150, 34],
      [84, 270, -130, 30],
      [168, 230, -170, 28],
      [-150, 250, -190, 32],
      [-250, 190, -210, 30],
      [262, 170, -200, 26],
    ])
      beams.push({ from: [x, y, z], r: rad, len: Math.min(1000, y / SUN_DIR.y), k: 0.6 });

    // the shadows the bells lay across the field
    const all: [number, number, number, number][] = [...BELLS];
    BELLS.forEach(([x, z, R, H], i) => bellU.uBells.value[i].set(x, z, R, H));
    for (let i = all.length; i < SHADOWS; i++) bellU.uBells.value[i].set(0, 0, 0, 0);

    // flocks wheeling over the field and round the crowns of the bells
    const flocks: Flock[] = [
      { c: [0, 70, 300], r: 90, n: props.mobile ? 8 : 16, size: 1.2, speed: 10 },
      { c: [30, 300, -190], r: 150, n: props.mobile ? 8 : 18, size: 2.2, speed: 14 },
      { c: [-150, 110, 40], r: 70, n: props.mobile ? 6 : 12, size: 1.1, speed: 9 },
      { c: [-260, 160, -260], r: 120, n: props.mobile ? 6 : 14, size: 1.8, speed: 12 },
      { c: [160, 60, -420], r: 60, n: props.mobile ? 5 : 10, size: 1.0, speed: 8 },
    ];

    return {
      city: k.build(),
      far: far.build(),
      tempera: makeGoldStone({ shade: [0.7, 0.72, 1.0], amb: 1.08, key: 0.34, through: 0.75, orn: 1, grain: 1, ao: 0.3, aoH: 70 }),
      farMat: makeGoldStone({ shade: [0.7, 0.72, 1.0], amb: 1.05, key: 0.3, through: 0.8, orn: 0.8, grain: 0, ao: 0.2, aoH: 140, grad: [0, 620] }),
      cloudsNear: softGeometry(cloudsNear, 1),
      cloudsFar: softGeometry(cloudsFar, 1),
      cloudMat: makeSoftMaterial({ shade: [1.0, 0.92, 0.84], under: [0.74, 0.68, 0.94], rim: 3, dab: 1.3, amb: 1.2, key: 0.5, flat: 0.3, sway: 3, soft: 0.8, fade: [2000, 2900], air: 0.5 }),
      trees: softGeometry(trees, 1),
      treeMat: makeSoftMaterial({ shade: [0.72, 0.7, 0.96], under: [0.6, 0.56, 0.7], rim: 2.6, dab: 1.5, amb: 1.15, key: 0.45, ao: 0.4 }),
      beams: beamGeometry(beams, SUN_DIR),
      beamMat: makeBeamMaterial([1, 0.84, 0.5]),
      discs,
      discMat: makeRayDiscMaterial({ col: [1, 0.7, 0.26], hot: [1, 0.9, 0.62], rays: 72, gain: 0.8, disc: 0.2, near: [20, 120] }),
      windows: (() => {
        let i = 0;
        return pointsGeometry(win.length / 3, (_, q) => [win[i++], win[i++], win[i++], 0.7 + q() * 0.9], 3);
      })(),
      windowMat: makePoints({ a: [1, 0.8, 0.4], b: [1, 0.92, 0.7], scale: 520, gain: 1.6, max: 7 }),
      suns,
      glows,
      puffs,
      flocks,
      motes: pointsGeometry(
        props.mobile ? 320 : Math.round(1800 * props.effects),
        (_, q) => [(q() - 0.5) * 900, 4 + q() * q() * 220, 520 - q() * 1100, 0.4 + q() * 1.4],
        77,
      ),
      moteMat: makePoints({ a: [1, 0.82, 0.42], b: [1, 0.92, 0.7], scale: 260, drift: 3.2, gain: 0.9, max: 22 }),
    };
  }, [props.mobile, props.effects > 0.5]);
  return (
    <>
      <GreatSun size={0.8} tint={[1, 0.76, 0.32]} rays={64} gain={1.15} />
      <WorldBase id="sun" def={def} pal={SUN_PAL} props={props} tip={[0.95, 0.72, 0.24]} pathTint={[1, 0.86, 0.56]} />
      <mesh geometry={b.city} material={b.tempera} />
      <mesh geometry={b.far} material={b.farMat} />
      <mesh geometry={b.trees} material={b.treeMat} frustumCulled={false} />
      <mesh geometry={b.cloudsFar} material={b.cloudMat} frustumCulled={false} />
      <mesh geometry={b.cloudsNear} material={b.cloudMat} frustumCulled={false} />
      <points geometry={b.windows} material={b.windowMat} />
      <mesh geometry={b.beams} material={b.beamMat} renderOrder={7} />
      {b.discs.map((d, i) => (
        <mesh key={i} material={b.discMat} position={d.p} rotation={[0, d.ry, 0]} scale={d.s} renderOrder={6}>
          <planeGeometry args={[2, 2]} />
        </mesh>
      ))}
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Birds flocks={b.flocks} tint={[0.1, 0.11, 0.16]} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.suns} kind={1} />
      <points geometry={b.motes} material={b.moteMat} />
    </>
  );
}
