"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, makeTempera, pointsGeometry, rng, type Halo, type Puff, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { makeCloudPaint, makeRayDiscMaterial, makeSoftMaterial, paintedCloudGeometry, softGeometry, type PCloud, type Soft } from "./stars/forms";
import { beamGeometry, makeBeamMaterial, makeGoldStone, type Beam } from "./sun/gold";
import { SUN_GRASS_MASK, SUN_PAL, groveMap, sunPlotJS } from "./sun/ground";
import { SUN_LIFE_U, bannersGeometry, greatSunMaterial, hungBellGeometry, makeBannerMaterial, makeHungBellMaterial, makeSkeinMaterial, makeSunsMaterial, makeWalkerMaterial, skeinGeometry, sunsGeometry, walkersGeometry, type Banner, type Hung, type KSun, type Skein, type Walker } from "./sun/life";
import { SUN_BELLS, SUN_BRIDGES, SUN_GARDEN, SUN_GATEHOUSES, SUN_ROAD_Z, SUN_SKY, sunRoadX, type SunBridge } from "./sun/shape";
import { ORIGIN, WORLDS, gateOf, groundAt, pathOf, voyage } from "./voyage";
import { useDeepLens } from "./fairy/shared";

// Sonata of the Sun (Allegro, 1907), built as a place to cross: a vast open plain under an amber air, and far
// off on it, hundreds of metres apart, the bells.
//
// What the painting holds, and where each thing is here:
//   - a field and an air of dull gold, laid in pastel                         the plain: bands of tone, strip fields, a road, flowers (sun/ground.ts)
//   - great blue-grey bells, one behind another, a comb of thin dark spires down a shoulder
//                                                                            SUN_BELLS, up to 640 m tall, each standing alone; a far ring of them in the haze
//   - a sun in a keyhole niche cut into the tallest bell                    the niche on the great bell, lit from within as the plane rounds it
//   - twin towers on a crown with a half-sun in the notch between them      on the right-hand bell
//   - a low dome at the front with the great sun of the picture on its face  the low dome that stands alone between the aqueducts
//   - slim twin-tower gatehouses with an arch and a little sun hung in it   the gatehouses over the road
//   - suns drawn as he drew them, in rows like notes on a stave              rows over the plain, climbing to the left; lamps on stems along the road
//   - far left, a low shelf on the horizon with a comb of strokes, a small temple and a great sun
//   - a long thin wave of line across the top, small birds, bands of cloud  a serpent of light high up, flocks and skeins, painted cloud
//   - a palisade of upright strokes along the foot                           palisades running off from the gatehouses across the fields
// From the Andante: the oval garden with its winding gold paths and small dark trees, lying on the plain.
//
// The journey (the plane flies north, toward -z, two and a half kilometres to the city):
//   1. the rise: the whole plain open below, the aqueducts two fine lines of arches across it, the bells in the haze,
//      the great sun standing behind the tallest; a skein of birds crosses the view
//   2. the road: pilgrims walking toward the city, lamps on stems kindling ahead of the plane, the first gatehouse,
//      the garden of the Andante to the left
//   3. the first aqueduct: its shadow laid toward the plane with the light of every arch in it, its suns lighting
//      one by one outward from the middle, the bells in its arches set swinging
//   4. the low dome and its great sun; the second gatehouse
//   5. the tall aqueduct (the wow): through its arch the city stands up, lit from behind, and the suns on the
//      bells' crowns kindle one after another
//   6. among the bells, wide apart: round the great bell past its niche
//   7. out over the open plain beyond, the sun full ahead, a skein of birds across it, and the gate.

const def = WORLDS.sun;

// (the painting's own two colours: forms of violet-blue standing in an air of amber gold, every one of them drawn
// over in fine gold line and edged with the light that comes through it: sun/gold.ts)
const STONE: V3 = [0.28, 0.34, 0.62];
const STONE_TOP: V3 = [0.44, 0.5, 0.78];
const DARK: V3 = [0.13, 0.15, 0.32];
const rad = (d: number) => (d * Math.PI) / 180;
// the low sun the whole world is lit from (the same numbers as the sky's: sun/shape.ts SUN_SKY)
const SUN_DIR = new THREE.Vector3(Math.sin(rad(SUN_SKY.az)) * Math.cos(rad(SUN_SKY.el)), Math.sin(rad(SUN_SKY.el)), -Math.cos(rad(SUN_SKY.az)) * Math.cos(rad(SUN_SKY.el)));
const KEY_DIR = new THREE.Vector3(Math.sin(rad(SUN_SKY.keyAz)) * Math.cos(rad(SUN_SKY.keyEl)), Math.sin(rad(SUN_SKY.keyEl)), -Math.cos(rad(SUN_SKY.keyAz)) * Math.cos(rad(SUN_SKY.keyEl)));
const GOLD: V3 = [1.0, 0.7, 0.22];
const BELLS = SUN_BELLS;

// a bell's profile: all but upright at the foot, a round shoulder, a crown that almost comes to a point
const bellR = (t: number) => (1 + 0.07 * Math.exp(-t * 9)) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 3.1))) * (1 - 0.16 * t);
// It stands on a stepped plinth, three courses each set in from the one below, the lowest sunk well into the
// ground: so the foot of a giant meets the plain as built stone, never as a curve cutting the grass.
function bell(k: Kit, x: number, z: number, R: number, H: number, y0: number, col: V3 = STONE, top: V3 = STONE_TOP, seg = 64, rows = 40) {
  const s = R / 100;
  const prof: [number, number][] = [
    [R * 1.2, -14],
    [R * 1.2, 5 * s],
    [R * 1.14, 5.2 * s],
    [R * 1.14, 11 * s],
    [R * 1.09, 11.2 * s],
    [R * 1.09, 17 * s],
  ];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = -8 + (H + 8) * t;
    if (y <= 17.4 * s) continue;
    prof.push([R * bellR(t), y]);
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
    k.add(new THREE.ConeGeometry(0.5 * (R / 70) * (0.7 + H / 700) + 0.2, h, 5), [px, y0 - 8 + (H + 8) * t + h / 2 - 1, pz], DARK, { top: [0.3, 0.34, 0.58] });
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

// An aqueduct of great arches, one bay at a time: piers on stepped footings, a string course at the springing, a
// gold thread round each arch, a second tier of smaller arches above where it is two-tiered, a coping with
// merlons; in its arches by turns a drawn sun and a hung bell; a tower closing each end. `near`: one the plane
// flies through (finer, with its bells and banners, its suns asleep until the plane comes).
function aqueduct(k: Kit, suns: KSun[], hung: Hung[], banners: Banner[], b: SunBridge, near: boolean) {
  const yaw = Math.atan2(-b.u[1], b.u[0]);
  const thick = 9 + b.w * 0.08;
  const mid = (b.n - 1) / 2;
  const r = b.w * 0.34;
  const spring = b.H * 0.5;
  const hw = b.w / 2;
  const h2 = b.H * 0.34;
  const top = b.H + 3.4 + (b.tiers > 1 ? h2 + 2.6 : 0);
  for (let i = 0; i < b.n; i++) {
    const a = (i - mid) * b.w;
    const x = b.c[0] + b.u[0] * a;
    const z = b.c[1] + b.u[1] * a;
    const y0 = Math.min(groundAt(def, x - b.u[0] * hw, z - b.u[1] * hw), groundAt(def, x + b.u[0] * hw, z + b.u[1] * hw)) - 1;
    const fine = near && Math.abs(i - mid) <= 4;
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
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: fine ? 24 : 12 });
    g.translate(0, 0, -thick / 2);
    k.add(g, [x, y0, z], STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
    const at = (u: number, y: number, w = 0): V3 => [x + b.u[0] * u - b.u[1] * w, y0 + y, z + b.u[1] * u + b.u[0] * w];
    // the string course at the springing and the coping, standing proud of the wall
    k.box(b.w, 2.6, thick + 2.4, at(0, spring - 1.3), STONE_TOP, { rot: [0, yaw, 0] });
    k.box(b.w, 3.4, thick + 3, at(0, b.H + 1.7), STONE_TOP, { rot: [0, yaw, 0] });
    // the stepped footing of each pier, sunk into the ground
    for (const sd of i === b.n - 1 ? [-1, 1] : [-1]) {
      const px = x + b.u[0] * sd * hw;
      const pz = z + b.u[1] * sd * hw;
      const gy = groundAt(def, px, pz);
      k.box(2 * (hw - r) + 7, 9, thick + 8, [px, gy - 0.5, pz], STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
      k.box(2 * (hw - r) + 3.4, 5, thick + 4, [px, gy + 6.4, pz], STONE_TOP, { rot: [0, yaw, 0] });
    }
    if (near) {
      // pilasters on the pier faces
      if (Math.abs(i - mid) > 5) for (const f of [-1, 1]) k.box(4.2, spring - 2, 1.6, at(-hw, (spring - 2) / 2, f * (thick / 2 + 0.6)), STONE_TOP, { rot: [0, yaw, 0] });
      // the gold thread round the arch, on both faces
      for (const f of [-1, 1]) {
        const pts: V3[] = [at(r - 0.3, 0, f * (thick / 2 + 0.25))];
        for (let j = 0; j <= 28; j++) {
          const t = (j / 28) * Math.PI;
          pts.push(at(Math.cos(t) * (r - 0.3), spring + Math.sin(t) * (r - 0.3), f * (thick / 2 + 0.25)));
        }
        pts.push(at(-r + 0.3, 0, f * (thick / 2 + 0.25)));
        k.tube(pts, 0.32, GOLD, { glow: 1.25, seg: fine ? 80 : 40, sides: 4 });
      }
      if (Math.abs(i - mid) <= 5) {
        // on each face of the pier a tall blind niche, a darker panel with a round head drawn round in gold; and
        // over the crown of each arch a ring of gold, a sun not yet lit
        const pw = (hw - r) * 0.42;
        const p0 = 13;
        const p1 = spring - 8 - pw;
        const ns = new THREE.Shape();
        ns.moveTo(-pw, p0);
        ns.lineTo(-pw, p1);
        ns.absarc(0, p1, pw, Math.PI, 0, true);
        ns.lineTo(pw, p0);
        ns.lineTo(-pw, p0);
        for (const f of [-1, 1]) {
          k.add(new THREE.ShapeGeometry(ns, 10), at(-hw, 0, f * (thick / 2 + 0.12)), [0.17, 0.2, 0.42], { top: [0.24, 0.28, 0.52], rot: [0, yaw + (f < 0 ? Math.PI : 0), 0] });
          const np: V3[] = [at(-hw - pw, p0, f * (thick / 2 + 0.3))];
          for (let j = 0; j <= 12; j++) {
            const t = Math.PI - (j / 12) * Math.PI;
            np.push(at(-hw + Math.cos(t) * pw, p1 + Math.sin(t) * pw, f * (thick / 2 + 0.3)));
          }
          np.push(at(-hw + pw, p0, f * (thick / 2 + 0.3)));
          k.tube(np, 0.14, GOLD, { glow: 0.9, seg: 30, sides: 3 });
          const cy = spring + r + (b.H - spring - r) * 0.5;
          k.add(new THREE.TorusGeometry(Math.min(3.2, (b.H - spring - r) * 0.3), 0.2, 4, 20), at(0, cy, f * (thick / 2 + 0.3)), GOLD, { glow: 0.9, rot: [0, yaw, 0] });
        }
      }
    }
    // the second tier: three small arches over each great one
    if (b.tiers > 1) {
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
        const g2 = new THREE.ExtrudeGeometry(s2, { depth: thick * 0.7, bevelEnabled: false, curveSegments: fine ? 10 : 6 });
        g2.translate(0, 0, -thick * 0.35);
        k.add(g2, at(0, b.H + 3.4), STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
      }
      k.box(b.w, 2.6, thick * 0.7 + 2, at(0, b.H + 3.4 + h2 + 1.3), STONE_TOP, { rot: [0, yaw, 0] });
    }
    // merlons along the top
    for (let m = 0; m < 4; m++) k.box(2.6, 5, 3, at(-hw + (m + 0.5) * (b.w / 4), top + 2.5), STONE_TOP, { rot: [0, yaw, 0] });
    // in the arches by turns a drawn sun and a hung bell; the suns of a near one light one by one outward from the
    // middle as the plane comes
    if ((i - mid) % 2 === 0) suns.push({ p: at(0, spring + r * 0.45, 0), size: r * 0.62, col: GOLD, k: 0.8, trig: near ? b.c[1] + 560 - Math.abs(i - mid) * 44 : 1e5 });
    else if (near) hung.push({ p: at(0, spring + r - 0.4, 0), size: r * 0.55, axis: b.u });
    // a pennant on a pole over every third pier
    if (near && i % 3 === 1) {
      k.box(0.5, 20, 0.5, at(-hw, top + 10), DARK, { top: STONE });
      banners.push({ p: at(-hw, top + 19.4), len: 20 + b.H * 0.05, wide: 4.4, col: i % 2 ? [0.86, 0.62, 0.2] : [0.82, 0.8, 0.74] });
    }
  }
  // a square tower closing each end, on its own splayed foot
  for (const sd of [-1, 1]) {
    const a = sd * (b.n * hw + 8);
    const x = b.c[0] + b.u[0] * a;
    const z = b.c[1] + b.u[1] * a;
    const y0 = groundAt(def, x, z);
    const w = 11 + b.w * 0.05;
    const H = top + 26;
    k.lathe(
      [
        [w * 1.5, -8],
        [w * 1.2, 3],
        [w, 9],
        [w * 0.95, H * 0.6],
        [w, H * 0.62],
        [w * 0.9, H * 0.9],
        [w * 1.06, H * 0.93],
        [w * 1.06, H],
        [w * 0.8, H],
      ],
      [x, y0, z],
      STONE,
      { top: STONE_TOP, seg: 4, flat: true, rot: [0, yaw + Math.PI / 4, 0] },
    );
    k.add(new THREE.ConeGeometry(w * 0.6, H * 0.2, 4), [x, y0 + H + H * 0.1, z], DARK, { top: STONE, rot: [0, yaw + Math.PI / 4, 0] });
    suns.push({ p: [x, y0 + H + H * 0.2 + 10, z], size: 16, col: GOLD, k: 0.8, trig: near ? b.c[1] + 300 : 1e5 });
  }
}

export default function SunWorld({ props }: { props: WorldProps }) {
  // (the near plane at arm's length while this world is flown: far surfaces do not shimmer)
  useDeepLens("sun");
  const b = useDisposable(() => {
    const r = rng(1907);
    const k = new Kit();
    const far = new Kit();
    const props3 = new Kit(); // small things of the ground: stones, stems, shrines
    const suns: KSun[] = [];
    const glows: Halo[] = [];
    const puffs: Puff[] = [];
    const hung: Hung[] = [];
    const banners: Banner[] = [];
    const g = (x: number, z: number) => groundAt(def, x, z);
    const win: number[] = [];
    const discs: { p: V3; s: number; ry: number }[] = [];
    const pts = pathOf("sun").pts;
    const onRoad = (z: number) => z > SUN_ROAD_Z[0] && z < SUN_ROAD_Z[1];

    // ----- the bells, their combs and threads -----
    // (the suns on their crowns kindle one after another as the plane comes through the tall aqueduct)
    const crownTrig = [150, 330, 250, 1180, 70, -10, -110];
    BELLS.forEach(([x, z, R, H], i) => {
      const y0 = g(x, z) - 2;
      // a lamp in every third arch of every arcade (the arcades are drawn by the paint: sun/gold.ts)
      for (let m = 0; 60 * m + 50 < y0 + H * 0.9; m++) {
        const y = 60 * m + 49.5;
        const t = (y - (y0 - 8)) / (H + 8);
        if (t < 0.06) continue;
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
      suns.push({ p: [x, y0 + H + R * 0.12, z], size: R * 0.34, col: GOLD, k: 0.9, trig: crownTrig[i] });
      // a warm breath of light behind each crown, where the sun stands behind it
      glows.push({ p: [x, y0 + H * 0.92, z - R * 0.4], size: R * 2.4, col: [1, 0.7, 0.28], k: 0.1 });
    });
    // the keyhole niche in the great bell, facing the way the path comes round it, with a sun lit inside
    {
      const [x, z, R, H] = BELLS[0];
      const y0 = g(x, z) - 2;
      const t = 0.42;
      const ang = Math.atan2(-760 - z, -150 - x); // toward where the path passes
      const rr = R * bellR(t);
      const nx = Math.cos(ang);
      const nz = Math.sin(ang);
      const cy = y0 - 8 + (H + 8) * t;
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
      suns.push({ p: [x + nx * (rr + 6), cy + nh * 0.25, z + nz * (rr + 6)], size: nw * 0.95, col: GOLD, k: 0.95, trig: -330 });
      discs.push({ p: [x + nx * (rr + 3), cy + nh * 0.25, z + nz * (rr + 3)], s: nw * 2.6, ry: Math.atan2(nx, nz) });
      glows.push({ p: [x + nx * (rr + 20), cy, z + nz * (rr + 20)], size: nw * 3.2, col: [1, 0.66, 0.24], k: 0.2 });
    }
    // the low dome carries the great sun of the picture on its face, turned to the road
    {
      const [x, z, R, H] = BELLS[3];
      const y0 = g(x, z) - 2;
      const t = 0.42;
      const ang = Math.atan2(620 - z, sunRoadX(620) - x);
      const rr = R * bellR(t);
      const nx = Math.cos(ang);
      const nz = Math.sin(ang);
      const cy = y0 - 8 + (H + 8) * t;
      suns.push({ p: [x + nx * (rr + 4), cy, z + nz * (rr + 4)], size: 54, col: GOLD, k: 0.8, trig: 1160 });
      discs.push({ p: [x + nx * (rr + 2.5), cy, z + nz * (rr + 2.5)], s: 92, ry: Math.atan2(nx, nz) });
      glows.push({ p: [x + nx * (rr + 30), cy, z + nz * (rr + 30)], size: 80, col: [1, 0.66, 0.24], k: 0.14 });
    }
    // twin towers standing on the crown of the right-hand bell, a sun in the notch between them
    {
      const [x, z, , H] = BELLS[2];
      const y0 = g(x, z) + H - 36;
      const gh = gatehouse(k, x, z, 0.5, y0, 1.6);
      suns.push({ p: gh.sun, size: gh.size * 2.2, col: GOLD, k: 0.8, trig: 250 });
      glows.push({ p: gh.sun, size: gh.size * 5, col: [1, 0.68, 0.26], k: 0.12 });
    }
    // ----- the gatehouses over the road, each with a little sun hung in its arch, pennants on its towers, and a
    // palisade of upright strokes running off either side across the fields -----
    const pennant = (x: number, z: number, yaw: number, y0: number, s: number) => {
      for (const side of [-1, 1]) {
        const px = x + Math.cos(yaw) * side * 15 * s;
        const pz = z - Math.sin(yaw) * side * 15 * s;
        const topY = y0 + 52 * s * 1.28 + 2 * s;
        k.box(0.3 * s, 7 * s, 0.3 * s, [px, topY + 3 * s, pz], DARK, { top: STONE });
        banners.push({ p: [px, topY + 6.2 * s, pz], len: 9 * s, wide: 1.9 * s, col: side > 0 ? [0.88, 0.62, 0.2] : [0.84, 0.82, 0.76] });
      }
    };
    for (const [x, z, yaw, s] of SUN_GATEHOUSES) {
      const y0 = g(x, z) - 1;
      const gh = gatehouse(k, x, z, yaw, y0, s);
      suns.push({ p: gh.sun, size: gh.size, col: GOLD, k: 0.8, trig: z + 430 });
      glows.push({ p: gh.sun, size: gh.size * 3, col: [1, 0.68, 0.26], k: 0.08 });
      pennant(x, z, yaw, y0, s);
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      for (const side of [-1, 1])
        for (let i = 0; i < (props.mobile ? 30 : 84); i++) {
          const u = side * (15 * s + 12 + i * 3.1);
          const px = x + c * u + (r() - 0.5) * 0.8;
          const pz = z - sn * u + (r() - 0.5) * 0.8;
          const h = 7 + r() * 5 + (i % 5 === 0 ? 4 : 0);
          k.add(new THREE.CylinderGeometry(0.28, 0.45, h, 4), [px, g(px, pz) + h / 2 - 0.9, pz], DARK, { top: STONE });
        }
    }
    // the last pair, either side of the way out
    {
      const gate = gateOf("sun")!;
      const y0 = g(gate.pos.x, gate.pos.z) - 1;
      const gh = gatehouse(k, gate.pos.x, gate.pos.z, gate.yaw, y0, 2.4);
      suns.push({ p: [gh.top[0], gh.top[1] + 22, gh.top[2]], size: 26, col: GOLD, k: 0.7, trig: -1150 });
      pennant(gate.pos.x, gate.pos.z, gate.yaw, y0, 2.4);
    }
    // ----- the aqueducts the road passes under, each crossing the whole plain -----
    for (const br of SUN_BRIDGES) aqueduct(k, suns, hung, banners, br, true);
    // and more of them, far off, receding into the haze: the city goes on
    const farBridges: SunBridge[] = [
      { c: [-300, -2560], u: [0.995, 0.1], n: 21, w: 130, H: 280, tiers: 2 },
      { c: [2380, -700], u: [0.25, 0.968], n: 15, w: 120, H: 240, tiers: 1 },
      { c: [-2380, -400], u: [0.2, -0.98], n: 15, w: 120, H: 220, tiers: 2 },
    ];
    for (const br of farBridges) aqueduct(far, suns, hung, banners, br, false);

    // ----- suns -----
    // lamps on tall stems either side of the road: they kindle a little ahead of the plane, one after another
    for (let z = 1720, i = 0; z > -560; z -= 46, i++) {
      const side = i % 2 ? 1 : -1;
      const x = sunRoadX(z) + side * (8.5 + r() * 1.5);
      const y = g(x, z);
      const h = 6.5 + r() * 2;
      props3.add(new THREE.CylinderGeometry(0.05, 0.11, h, 5), [x, y + h / 2 - 0.3, z], [0.3, 0.24, 0.14]);
      props3.add(new THREE.CylinderGeometry(0.36, 0.5, 0.5, 6), [x, y + 0.1, z], [0.42, 0.4, 0.5]);
      suns.push({ p: [x, y + h + 0.9, z], size: 2.5 + r() * 0.6, col: GOLD, k: 0.85, trig: z + 290 + r() * 30 });
    }
    // rows over the plain that climb to the left like notes on a stave: asleep until the plane is near
    const rows = props.mobile ? 2 : 4;
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < 8; i++) {
        const x = -760 + i * 84 + row * 66 + (r() - 0.5) * 30;
        const z = 1280 - i * 130 - row * 120 + (r() - 0.5) * 40;
        const y = g(x, z) + 70 + i * 22 + row * 46 + (r() - 0.5) * 16;
        const size = 24 + r() * 18 + (i === 3 ? 16 : 0);
        suns.push({ p: [x, y, z], size, col: GOLD, k: 0.75, trig: z + 620 + i * 20 });
      }
    for (let i = 0; i < 8; i++) {
      const x = 420 + i * 90 + (r() - 0.5) * 30;
      const z = 900 - i * 150;
      suns.push({ p: [x, g(x, z) + 150 + i * 28, z], size: 28 + r() * 14, col: GOLD, k: 0.8, trig: z + 640 });
    }
    // where nothing may be planted
    const clear = (x: number, z: number, m = 0) =>
      def.canvases.every((c) => Math.hypot(x - c.x, z - c.z) > 34 + m) &&
      BELLS.every(([bx, bz, R]) => Math.hypot(x - bx, z - bz) > R * 1.22 + 5 + m) &&
      SUN_BRIDGES.every((br) => Math.abs((x - br.c[0]) * br.u[1] - (z - br.c[1]) * br.u[0]) > 14 + m || Math.abs((x - br.c[0]) * br.u[0] + (z - br.c[1]) * br.u[1]) > br.n * br.w * 0.5 + 30) &&
      SUN_GATEHOUSES.every(([gx, gz, , s]) => Math.hypot(x - gx, z - gz) > 22 * s + m) &&
      (!onRoad(z) || Math.abs(x - sunRoadX(z)) > 7.5 + m);
    // suns on stems in the grass, like flowers, in drifts beside the road
    const drifts = props.mobile ? 14 : 36;
    for (let d = 0; d < drifts; d++) {
      const z0 = 1700 - ((d + 0.5) / drifts) * 2200;
      const side = d % 2 ? 1 : -1;
      const cx = sunRoadX(z0) + side * (26 + r() * 70);
      const n = 3 + Math.floor(r() * (props.mobile ? 3 : 6));
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 30;
        const z = z0 + (r() - 0.5) * 30;
        if (!clear(x, z) || sunPlotJS(x, z).farmed) continue;
        const h = 2.6 + r() * 4.4;
        const y = g(x, z);
        props3.add(new THREE.CylinderGeometry(0.014, 0.04, h, 4, 1, true), [x, y + h / 2 - 0.1, z], [0.34, 0.28, 0.12], { rot: [(r() - 0.5) * 0.16, 0, (r() - 0.5) * 0.16] });
        suns.push({ p: [x, y + h + 0.7, z], size: 1.8 + r() * 1.3, col: GOLD, k: 0.75, trig: z + 330 + r() * 60 });
      }
    }
    // a few scattered through the whole air, large and small, always alight: the far ones are how deep the air is
    for (let i = 0; i < (props.mobile ? 22 : 54); i++) {
      const a = r() * Math.PI * 2;
      const d = 500 + Math.sqrt(r()) * 2600;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 300;
      const y = g(x, z) + 120 + r() * r() * 700;
      if (BELLS.some(([bx, bz, R]) => Math.hypot(x - bx, z - bz) < R + 40) || pts.some((q, j) => j % 8 === 0 && Math.hypot(q.x - x, q.y - y, q.z - z) < 160)) continue;
      const size = 14 + r() * r() * 60;
      suns.push({ p: [x, y, z], size, col: GOLD, k: 0.7, trig: d > 1500 ? 1e5 : z + 700 });
    }

    // ----- wayside shrines along the road: a small pillar on two steps, a lit niche, a drawn sun over it -----
    for (let z = 1560, i = 0; z > -400; z -= 330, i++) {
      const side = i % 2 ? -1 : 1;
      const x = sunRoadX(z) + side * 13;
      const y = g(x, z);
      props3.box(3.4, 0.6, 3.4, [x, y + 0.1, z], [0.4, 0.4, 0.52]);
      props3.box(2.4, 0.6, 2.4, [x, y + 0.7, z], [0.44, 0.44, 0.58]);
      props3.box(1.3, 3.6, 1.3, [x, y + 2.8, z], [0.36, 0.4, 0.62], { top: [0.5, 0.54, 0.78] });
      props3.add(new THREE.ConeGeometry(1.25, 1.5, 4), [x, y + 5.35, z], [0.2, 0.22, 0.4], { rot: [0, Math.PI / 4, 0] });
      props3.box(0.5, 0.9, 0.08, [x - side * 0.67, y + 3.5, z], [1, 0.74, 0.3], { glow: 1.6, rot: [0, Math.PI / 2, 0] });
      suns.push({ p: [x, y + 7.6, z], size: 1.6, col: GOLD, k: 0.8, trig: z + 300 });
    }
    // ----- stones: by the road, at the corners of the fields, in the meadow; each half sunk in the ground -----
    const stoneCols: V3[] = [
      [0.34, 0.36, 0.5],
      [0.42, 0.4, 0.46],
      [0.48, 0.4, 0.3],
      [0.3, 0.3, 0.42],
    ];
    for (let i = 0; i < (props.mobile ? 120 : 420); i++) {
      const byRoad = i % 3 === 0;
      const z = byRoad ? 1760 - r() * 2300 : (r() - 0.5) * 3600 - 100;
      const x = byRoad ? sunRoadX(z) + (r() < 0.5 ? -1 : 1) * (8 + r() * r() * 40) : (r() - 0.5) * 3000;
      if (!clear(x, z, 1) || (!byRoad && sunPlotJS(x, z).farmed)) continue;
      const s = 0.5 + r() * r() * (byRoad ? 2.2 : 4.6);
      props3.add(new THREE.IcosahedronGeometry(s, 1), [x, g(x, z) - s * 0.22, z], stoneCols[i % 4], { top: [0.56, 0.54, 0.6], rot: [r() * 3, r() * 6, r() * 3], scale: [1, 0.55 + r() * 0.25, 0.75 + r() * 0.4], flat: true });
    }

    // ----- far bells, paler with every row: a whole ring of them, colossal, going into the haze -----
    const ring = props.mobile ? 9 : 18;
    for (let i = 0; i < ring; i++) {
      const a = -Math.PI + (i / ring) * Math.PI * 2 + (r() - 0.5) * 0.12;
      // (not behind the entry: the way in stays open)
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.5) continue;
      const d = 2650 + r() * 750;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 200;
      const R = 110 + r() * 100;
      const H = R * (2.6 + r() * 1.0);
      bell(far, x, z, R, H, g(x, z) - 6, STONE, STONE_TOP, 40, 26);
      comb(far, x, z, R, H, g(x, z) - 6, a + 2.2, 9, r);
      threads(far, x, z, R, H, g(x, z) - 6, [0.2, 0.55]);
      suns.push({ p: [x + R * 0.3, g(x, z) + H * (0.5 + 0.3 * r()), z], size: 50 + R * 0.25, col: GOLD, k: 0.85 });
      suns.push({ p: [x, g(x, z) + H + R * 0.1, z], size: R * 0.3, col: GOLD, k: 0.8 });
    }
    // the far strip at the upper left of the picture: a long low shelf of land on the horizon, a comb of thin
    // strokes along it, a small temple, and its own row of drawn suns with a great one at the end
    {
      const sx = -2100;
      const sz = -1100;
      const yaw = Math.atan2(sx, sz + 40) + Math.PI;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const sy = g(sx, sz) + 60;
      const S = 4.2;
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
      suns.push({ p: L(-150, 40, 6), size: 260, col: GOLD, k: 0.9 });
      discs.push({ p: L(-150, 40, 8), s: 560, ry: yaw });
      glows.push({ p: L(-150, 40, 6), size: 700, col: [1, 0.7, 0.3], k: 0.1 });
      for (let i = 0; i < 5; i++) suns.push({ p: L(-70 + i * 44, 50 + (i % 2) * 9, 6), size: 70, col: GOLD, k: 0.85 });
    }
    // the long thin wave of line across the top of the picture: a serpent of light high over the city
    {
      const wave: V3[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        wave.push([-3200 + t * 6400, 1050 + Math.sin(t * Math.PI * 3.2) * 110 + Math.sin(t * 17) * 18, -2900 + Math.sin(t * Math.PI * 1.3) * 400]);
      }
      far.tube(wave, 5, [1, 0.86, 0.6], { glow: 1.1, seg: 260, sides: 5 });
    }
    // low mist lying in the plain's hollows, far apart
    for (let i = 0; i < (props.mobile ? 8 : 20); i++) {
      const x = (r() - 0.5) * 2600;
      const z = 1500 - r() * 2600;
      puffs.push({ p: [x, g(x, z) + 5 + r() * 8, z], size: 110 + r() * 150, a: 0.4 });
    }

    // ----- a sky of painted cloud: rounded banks, gold where the sun finds them and violet beneath, receding to the horizon -----
    const pclouds: PCloud[] = [];
    const nCl = props.mobile ? 34 : Math.round(60 + 40 * props.effects);
    for (let i = 0; i < nCl; i++) {
      const a = r() * Math.PI * 2;
      const d = 400 + Math.sqrt(r()) * 4600;
      pclouds.push({ p: [Math.cos(a) * d, 860 + r() * 320 + d * 0.05, Math.sin(a) * d - 300], w: 150 + r() * r() * 520, seed: r() });
    }
    // and smaller ones adrift among the bells, below their shoulders
    for (let i = 0; i < (props.mobile ? 4 : 9); i++) {
      const a = r() * Math.PI * 2;
      const d = 300 + r() * 900;
      const x = 150 + Math.cos(a) * d;
      const z = -900 + Math.sin(a) * d;
      const y = 240 + r() * 260;
      if (pts.some((q, j) => j % 6 === 0 && Math.hypot(q.x - x, q.y - y, q.z - z) < 230) || BELLS.some(([bx, bz, R]) => Math.hypot(x - bx, z - bz) < R + 110)) continue;
      pclouds.push({ p: [x, y, z], w: 60 + r() * 70, seed: r() });
    }

    // ----- small round trees and slim cypresses: in groves on the meadow, in lines along the hedges of the fields,
    // thick in the garden; the measure of everything -----
    const treesNear: Soft[] = [];
    const trees: Soft[] = [];
    const treesFar: Soft[] = [];
    const shade: { x: number; z: number; r: number; h: number }[] = [];
    const nearPath = (x: number, z: number, d: number) => pts.some((q, j) => j % 8 === 0 && Math.hypot(q.x - x, q.z - z) < d);
    const plant = (x: number, z: number, tall: boolean, big = 1, dark = false) => {
      const pick = r();
      const rd = (tall ? 1.0 + r() * 0.9 : 1.5 + r() * 2.2) * big;
      const sy = tall ? 3.2 + r() * 1.8 : 0.9 + r() * 0.4;
      const col: V3 = dark ? (pick < 0.5 ? [0.1, 0.1, 0.2] : [0.16, 0.14, 0.24]) : tall ? (pick < 0.6 ? [0.09, 0.13, 0.17] : [0.12, 0.13, 0.24]) : pick < 0.45 ? [0.32, 0.3, 0.09] : pick < 0.75 ? [0.42, 0.3, 0.07] : [0.56, 0.42, 0.11];
      // (sunk a little: the foot of every tree is in the ground, never on it)
      (nearPath(x, z, 90) ? treesNear : nearPath(x, z, 300) ? trees : treesFar).push({ p: [x, g(x, z) + rd * sy * 0.8, z], r: rd, col, sy, seed: r() });
      shade.push({ x, z, r: rd, h: rd * sy * 1.8 });
    };
    const nTr = props.mobile ? 1100 : Math.round(2200 + 2800 * props.trees);
    let gx = 0;
    let gz = 0;
    let gs = 20;
    for (let i = 0; i < nTr; i++) {
      if (i % 16 === 0) {
        if ((i >> 4) % 3 === 0) {
          // every third grove stands near the way: there is always something of known size close by
          const q = pts[Math.floor(r() * (pts.length - 1))];
          const a = r() * Math.PI * 2;
          const d = 50 + r() * 330;
          gx = q.x + Math.cos(a) * d;
          gz = q.z + Math.sin(a) * d;
        } else {
          const a = r() * Math.PI * 2;
          const d = 60 + Math.pow(r(), 0.75) * 2500;
          gx = Math.cos(a) * d;
          gz = Math.sin(a) * d - 100;
        }
        gs = 7 + r() * r() * 34;
      }
      const x = gx + (r() - 0.5) * gs * 2;
      const z = gz + (r() - 0.5) * gs * 2;
      if (!clear(x, z, 3) || sunPlotJS(x, z).farmed) continue;
      plant(x, z, r() < 0.42, Math.hypot(x, z) > 1400 ? 1.7 : 1);
    }
    // the hedges: a line of trees along the edges of the farmed plots
    for (let i = 0; i < (props.mobile ? 9000 : 30000); i++) {
      const x = (r() - 0.5) * 4400;
      const z = (r() - 0.5) * 4400 - 100;
      const pl = sunPlotJS(x, z);
      if (!pl.plot || pl.edge > 2.2 || !clear(x, z, 3)) continue;
      plant(x, z, r() < 0.25, 0.9);
    }
    // the garden: small dark trees between its winding paths
    {
      const G = SUN_GARDEN;
      for (let i = 0; i < (props.mobile ? 60 : 170); i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 0.9;
        const u = Math.cos(a) * d * G.a;
        const v = Math.sin(a) * d * G.b;
        plant(G.x + u * Math.cos(G.yaw) - v * Math.sin(G.yaw), G.z + u * Math.sin(G.yaw) + v * Math.cos(G.yaw), false, 1.5, true);
      }
    }

    // ----- pilgrims on the road, in small companies -----
    const walkers: Walker[] = [];
    const companies = props.mobile ? 14 : 34;
    for (let c = 0; c < companies; c++) {
      const z0 = SUN_ROAD_Z[0] + 120 + r() * (SUN_ROAD_Z[1] - SUN_ROAD_Z[0] - 400);
      const speed = 1.15 + r() * 0.35;
      const n = 2 + Math.floor(r() * (props.mobile ? 4 : 8));
      for (let i = 0; i < n; i++) walkers.push({ z: z0 + (r() - 0.5) * (4 + n * 1.6), side: (r() - 0.5) * 5.2, speed: speed + (r() - 0.5) * 0.04, seed: r(), size: 0.9 + r() * 0.22 });
    }

    // ----- skeins of birds, each let go in its moment (see the frame loop below) -----
    const skeins: Skein[] = [
      { from: [-760, g(-700, 1100) + 150, 1120], vel: [22, 0.3, -6], n: props.mobile ? 16 : 34, size: 2.4, which: 0 },
      { from: [-290, g(-260, 820) + 30, 830], vel: [18, 2.5, -7], n: props.mobile ? 12 : 26, size: 2.0, which: 1 },
      { from: [843, 290, -2163], vel: [-20, 0, 3], n: props.mobile ? 18 : 40, size: 3, which: 2 },
    ];

    // ----- shafts of sunlight: through the arches of the aqueducts near the road, and broad ones between the bells -----
    const beams: Beam[] = [];
    for (const br of SUN_BRIDGES)
      for (let i = 0; i < br.n; i++) {
        const off = Math.abs(i - (br.n - 1) / 2);
        if (off > 7 || (props.mobile && i % 3)) continue;
        const a = (i - (br.n - 1) / 2) * br.w;
        const x = br.c[0] + br.u[0] * a;
        const z = br.c[1] + br.u[1] * a;
        const rd = br.w * 0.34;
        const h = br.H * 0.5 + rd * 0.3;
        beams.push({ from: [x, g(x, z) + h, z], r: rd * 0.8, len: Math.min(900, (h + 8) / KEY_DIR.y), k: 0.9 });
      }
    for (const [x, y, z, rd] of [
      [-110, 420, -700, 50],
      [300, 380, -640, 46],
      [-440, 330, -820, 44],
      [400, 340, -1010, 48],
      [-260, 300, -1260, 46],
      [180, 360, -1330, 44],
    ])
      beams.push({ from: [x, y, z], r: rd, len: Math.min(1500, y / KEY_DIR.y), k: 0.6 });

    // flocks wheeling over the garden, the dome, round the great bell's crown and by the gate
    const flocks: Flock[] = [
      { c: [SUN_GARDEN.x, g(SUN_GARDEN.x, SUN_GARDEN.z) + 60, SUN_GARDEN.z], r: 130, n: props.mobile ? 8 : 16, size: 1.2, speed: 10 },
      { c: [BELLS[0][0], 520, BELLS[0][1]], r: 230, n: props.mobile ? 10 : 22, size: 2.4, speed: 15 },
      { c: [BELLS[3][0], 190, BELLS[3][1]], r: 140, n: props.mobile ? 6 : 12, size: 1.3, speed: 9 },
      { c: [BELLS[1][0], 360, BELLS[1][1]], r: 160, n: props.mobile ? 6 : 14, size: 1.9, speed: 12 },
      { c: [600, 110, -1700], r: 90, n: props.mobile ? 5 : 10, size: 1.2, speed: 8 },
    ];

    return {
      city: k.build(),
      far: far.build(),
      props: props3.build(),
      grove: groveMap(shade, KEY_DIR),
      tempera: makeGoldStone({ shade: [0.82, 0.86, 1.0], amb: 0.95, key: 0.42, through: 0.6, orn: 1, grain: 1, ao: 0.42, aoH: 46 }),
      farMat: makeGoldStone({ shade: [0.82, 0.86, 1.0], amb: 0.95, key: 0.4, through: 0.6, orn: 0.8, grain: 0, ao: 0.2, aoH: 140, grad: [0, 620] }),
      propMat: makeTempera({ amb: 0.95, key: 0.5, dab: 0.6, grain: 0.6, ao: 0.5, aoH: 2.2, wrap: 0.5 }),
      clouds: paintedCloudGeometry(pclouds, [0, 100, 1780]),
      cloudMat: makeCloudPaint({ lit: [1.0, 0.8, 0.42], shade: [1.0, 0.66, 0.36], under: [0.44, 0.4, 0.74], rim: 1.3, amb: 1.15, key: 0.45, air: 0.45, fade: [4000, 5600], near: [120, 420] }),
      treesNear: softGeometry(treesNear, props.mobile ? 1 : 2),
      trees: softGeometry(trees, 1),
      treesFar: softGeometry(treesFar, 0),
      treeMat: makeSoftMaterial({ shade: [0.72, 0.7, 0.96], under: [0.6, 0.56, 0.7], rim: 0.9, dab: 1.5, amb: 1.1, key: 0.42, ao: 0.6 }),
      beams: beamGeometry(beams, KEY_DIR),
      beamMat: makeBeamMaterial([1, 0.84, 0.5]),
      discs,
      discMat: makeRayDiscMaterial({ col: [1, 0.7, 0.26], hot: [1, 0.9, 0.62], rays: 72, gain: 0.8, disc: 0.2, near: [20, 120] }),
      windows: (() => {
        let i = 0;
        return pointsGeometry(win.length / 3, (_, q) => [win[i++], win[i++], win[i++], 0.7 + q() * 0.9], 3);
      })(),
      windowMat: makePoints({ a: [1, 0.8, 0.4], b: [1, 0.92, 0.7], scale: 520, gain: 1.6, max: 7 }),
      suns: sunsGeometry(suns),
      sunMat: makeSunsMaterial(),
      walkers: walkersGeometry(walkers),
      walkerMat: makeWalkerMaterial(def.terrain!, SUN_ROAD_Z),
      banners: bannersGeometry(banners),
      bannerMat: makeBannerMaterial(),
      hung: hungBellGeometry(hung),
      hungMat: makeHungBellMaterial(),
      skeins: skeinGeometry(skeins),
      skeinMat: makeSkeinMaterial(),
      greatSun: greatSunMaterial({ size: 0.8, tint: [1, 0.76, 0.32], rays: 64, gain: 1.0 }),
      glows,
      puffs,
      flocks,
      // dust in the light, along the whole way
      motes: pointsGeometry(
        props.mobile ? 320 : Math.round(1800 * props.effects),
        (_, q) => {
          const p = pts[Math.floor(q() * (pts.length - 1))];
          return [p.x + (q() - 0.5) * 520, g(p.x, p.z) + 4 + q() * q() * 240, p.z + (q() - 0.5) * 520, 0.4 + q() * 1.4];
        },
        77,
      ),
      moteMat: makePoints({ a: [1, 0.82, 0.42], b: [1, 0.92, 0.7], scale: 260, drift: 3.2, gain: 0.9, max: 22 }),
    };
  }, [props.mobile, props.effects > 0.5]);

  // The journey's events. The plane's furthest progress north kindles the suns ahead of it; the skeins are let go
  // in their moments: one across the first view, one up from the garden over the first aqueduct, one across the
  // open sun on the way out. All of it begins again each time the world is entered.
  const ev = useRef({ t: 0, on: false });
  useFrame(({ camera }, dt) => {
    const e = ev.current;
    const here = voyage.cur === "sun";
    if (!here || !e.on) {
      e.on = here;
      e.t = 0;
      SUN_LIFE_U.uFront.value = 1e5;
      SUN_LIFE_U.uSkein.value.set(-1, -1, -1, -1);
      if (!here) return;
    }
    const d = Math.min(dt, 0.1);
    if (voyage.phase !== "hold") e.t += d;
    const x = camera.position.x - ORIGIN.x;
    const z = camera.position.z - ORIGIN.z;
    SUN_LIFE_U.uFront.value = Math.min(SUN_LIFE_U.uFront.value, z);
    const front = SUN_LIFE_U.uFront.value;
    const s = SUN_LIFE_U.uSkein.value;
    const run = (v: number, go: boolean) => (v >= 0 ? v + d : go ? 0 : -1);
    s.x = run(s.x, e.t > 3);
    s.y = run(s.y, front < 1250);
    s.z = run(s.z, front < -1170 && x > 180);
  });
  return (
    <>
      <mesh material={b.greatSun} frustumCulled={false} renderOrder={-4}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <WorldBase id="sun" def={def} pal={SUN_PAL} props={props} tip={[1.0, 0.7, 0.18]} pathTint={[1, 0.86, 0.56]} groundSize={8800} mask={SUN_GRASS_MASK} gate="veil" gateSize={[17, 18]} />
      <mesh geometry={b.city} material={b.tempera} />
      <mesh geometry={b.far} material={b.farMat} />
      <mesh geometry={b.props} material={b.propMat} />
      <mesh geometry={b.treesNear} material={b.treeMat} frustumCulled={false} />
      <mesh geometry={b.trees} material={b.treeMat} frustumCulled={false} />
      <mesh geometry={b.treesFar} material={b.treeMat} frustumCulled={false} />
      <mesh geometry={b.walkers} material={b.walkerMat} frustumCulled={false} />
      <mesh geometry={b.hung} material={b.hungMat} frustumCulled={false} />
      <mesh geometry={b.banners} material={b.bannerMat} frustumCulled={false} />
      <mesh geometry={b.clouds} material={b.cloudMat} frustumCulled={false} renderOrder={2} />
      <points geometry={b.windows} material={b.windowMat} />
      <mesh geometry={b.beams} material={b.beamMat} renderOrder={7} />
      {b.discs.map((d, i) => (
        <mesh key={i} material={b.discMat} position={d.p} rotation={[0, d.ry, 0]} scale={d.s} renderOrder={6}>
          <planeGeometry args={[2, 2]} />
        </mesh>
      ))}
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Birds flocks={b.flocks} tint={[0.1, 0.11, 0.16]} />
      <mesh geometry={b.skeins} material={b.skeinMat} frustumCulled={false} renderOrder={4} />
      <Halos list={b.glows} kind={2} />
      <mesh geometry={b.suns} material={b.sunMat} frustumCulled={false} renderOrder={5} />
      <points geometry={b.motes} material={b.moteMat} />
    </>
  );
}
