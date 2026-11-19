"use client";

import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { WORLDS, gateOf, groundAt, pathOf } from "./voyage";

// Sonata of the Sun (Allegro, 1907). A field of dull gold. Out of it rise
// blue-grey bells, one behind another, each with a comb of thin spires down
// one shoulder; slim twin towers joined by an arch stand as gates on the way
// in, each with a sun hung in it; and the suns themselves, drawn the way he
// drew them (a pale disc, a ring, straight rays), hang over the field in
// rows like notes. The light comes from behind the bells, so they stand as
// shade with a thread of gold round every edge.

const def = WORLDS.sun;
export const SUN_PAL: GroundPalette = { a: [0.27, 0.215, 0.07], b: [0.36, 0.27, 0.085], c: [0.17, 0.18, 0.09] };

const STONE: V3 = [0.14, 0.2, 0.33];
const STONE_TOP: V3 = [0.22, 0.3, 0.44];
const DARK: V3 = [0.06, 0.09, 0.19];
const GOLD: V3 = [1.0, 0.7, 0.22];

// the bells: [x, z, radius at the foot, height]
export const BELLS: [number, number, number, number][] = [
  [30, -190, 84, 196],
  [-92, -120, 62, 138],
  [124, -92, 54, 108],
  [-10, -40, 70, 64],
  [-210, -260, 46, 92],
  [210, -250, 42, 80],
];
// a bell's profile: all but upright at the foot, a round shoulder, a crown that almost comes to a point
const bellR = (t: number) => (1 + 0.07 * Math.exp(-t * 9)) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 3.1))) * (1 - 0.16 * t);
function bell(k: Kit, x: number, z: number, R: number, H: number, y0: number, col: V3 = STONE, top: V3 = STONE_TOP, seg = 56) {
  const prof: [number, number][] = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    prof.push([R * bellR(t), -8 + (H + 8) * t]);
  }
  k.lathe(prof, [x, y0, z], col, { top, seg });
}
// a comb of thin spires standing along one shoulder of a bell, tallest at the top
function comb(k: Kit, x: number, z: number, R: number, H: number, y0: number, side: number, n: number, r: () => number) {
  for (let i = 0; i < n; i++) {
    const t = 0.34 + (i / (n - 1)) * 0.56; // height up the bell
    const rr = R * bellR(t) * 0.985;
    const ang = side + (r() - 0.5) * 0.1;
    const h = (7 + 16 * (i / (n - 1)) + r() * 5) * (R / 70);
    const px = x + Math.cos(ang) * rr;
    const pz = z + Math.sin(ang) * rr;
    k.add(new THREE.ConeGeometry(0.5 * (R / 70) + 0.2, h, 5), [px, y0 - 8 + (H + 8) * t + h / 2 - 1, pz], DARK, { top: [0.12, 0.17, 0.3] });
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
    // the tower: a tall shaft, drawn in a little toward the top, on a spreading foot
    const w = 4.6 * s;
    k.lathe(
      [
        [w * 1.5, -6],
        [w * 1.18, 2 * s],
        [w, 7 * s],
        [w * 0.86, H * 0.82],
        [w * 1.04, H * 0.86],
        [w * 1.04, H],
        [w * 0.8, H],
      ],
      at(side * half, 0),
      STONE,
      { top: STONE_TOP, seg: 4, flat: true, rot: [0, yaw + Math.PI / 4, 0] },
    );
    // merlons at the four corners of its crown
    for (const a of [-1, 1]) for (const b of [-1, 1]) k.box(1.5 * s, 4.4 * s, 1.5 * s, at(side * half + a * w * 0.56, H + 2.2 * s, b * w * 0.56), STONE_TOP, { rot: [0, yaw, 0] });
    // a slit of lit window up the shaft
    k.box(0.36 * s, H * 0.26, 0.3, at(side * half, H * 0.52, w * 0.74), GOLD, { glow: 1.1, rot: [0, yaw, 0] });
  }
  // the arch: a flat wall between the towers, cut by a round-headed opening, a pediment above
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
  const wall = new THREE.ExtrudeGeometry(sh, { depth: 2.4 * s, bevelEnabled: false, curveSegments: 20 });
  wall.translate(0, 0, -1.2 * s);
  k.add(wall, at(0, 0), STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
  // a thread of gold round the opening
  const pts: V3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    pts.push(at(Math.cos(a) * (inner - 0.2), spring + Math.sin(a) * (inner - 0.2), 0));
  }
  k.tube([at(inner - 0.2, spring - 6 * s, 0), ...pts, at(-inner + 0.2, spring - 6 * s, 0)], 0.14 * s, GOLD, { glow: 1.2, seg: 60, sides: 5 });
  return { sun: at(0, spring + inner * 0.36, 0), size: inner * 0.9, top: at(0, top + 2 * s, 1.6 * s) };
}

// a wall of arches, one after another, running out across the field
function arcade(k: Kit, x0: number, z0: number, x1: number, z1: number, n: number, H: number) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const w = len / n;
  const sh = new THREE.Shape();
  sh.moveTo(0, -8);
  sh.lineTo(0, H);
  sh.lineTo(len, H);
  sh.lineTo(len, -8);
  sh.lineTo(0, -8);
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * w;
    const r = w * 0.36;
    const hole = new THREE.Path();
    hole.moveTo(cx - r, -4);
    hole.lineTo(cx - r, H * 0.52);
    hole.absarc(cx, H * 0.52, r, Math.PI, 0, true);
    hole.lineTo(cx + r, -4);
    hole.lineTo(cx - r, -4);
    sh.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 3.2, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -1.6);
  const y0 = Math.min(groundAt(def, x0, z0), groundAt(def, x1, z1));
  k.add(g, [x0, y0, z0], STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
  // a coping, and a merlon over every pier
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    k.box(2.2, 3.6, 3.6, [x0 + (x1 - x0) * t, y0 + H + 1.8, z0 + (z1 - z0) * t], STONE_TOP, { rot: [0, yaw, 0] });
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

    // the bells, and the combs of spires on their shoulders
    BELLS.forEach(([x, z, R, H], i) => {
      const y0 = g(x, z) - 2;
      bell(k, x, z, R, H, y0);
      // threads of gold drawn round it, as he drew an arc across a form
      for (const t of i === 3 ? [0.3] : [0.16, 0.5]) {
        const rr = R * bellR(t) + 0.25;
        k.add(new THREE.TorusGeometry(rr, 0.16 + R * 0.0012, 5, 72), [x, y0 - 8 + (H + 8) * t, z], GOLD, { glow: 1.0, rot: [Math.PI / 2, 0, 0] });
      }
      comb(k, x, z, R, H, y0, i % 2 ? 2.3 : 0.75, props.mobile ? 9 : 15, r);
      if (i < 4) comb(k, x, z, R, H, y0, i % 2 ? 0.2 : 2.6, props.mobile ? 5 : 9, r);
    });
    // the low bell at the front carries the great sun of the picture on its face
    {
      const [x, z, R, H] = BELLS[3];
      const y0 = g(x, z);
      suns.push({ p: [x - 8, y0 + H * 0.5, z + R * 0.96], size: 38, col: GOLD, k: 0.7 });
      glows.push({ p: [x - 8, y0 + H * 0.5, z + R * 1.5], size: 44, col: [1, 0.66, 0.24], k: 0.12 });
    }
    // twin towers standing on the crown of the right-hand bell, a sun in the notch between them
    {
      const [x, z, , H] = BELLS[2];
      const y0 = g(x, z) + H - 14;
      const gh = gatehouse(k, x, z, 0.5, y0, 0.62);
      suns.push({ p: gh.sun, size: gh.size * 1.5, col: GOLD, k: 0.75 });
    }
    // the gates on the way in
    const gates: [number, number, number, number][] = [
      [20, 208, 0.12, 1],
      [-12, 96, 0.42, 1.12],
    ];
    for (const [x, z, yaw, s] of gates) {
      const gh = gatehouse(k, x, z, yaw, g(x, z) - 1, s);
      suns.push({ p: gh.sun, size: gh.size, col: GOLD, k: 0.75 });
      glows.push({ p: gh.sun, size: gh.size * 3, col: [1, 0.68, 0.26], k: 0.14 });
    }
    // and the last pair, either side of the way out
    {
      const gate = gateOf("sun")!;
      const gh = gatehouse(k, gate.pos.x, gate.pos.z, gate.yaw, g(gate.pos.x, gate.pos.z) - 1, 1.5);
      suns.push({ p: [gh.top[0], gh.top[1] + 16, gh.top[2]], size: 20, col: GOLD, k: 0.7 });
    }
    // arcades running out from the first gate
    if (!props.mobile) {
      arcade(k, 46, 214, 186, 250, 7, 30);
      arcade(k, -8, 204, -150, 176, 7, 30);
    } else arcade(k, 46, 214, 146, 240, 5, 30);

    // the suns over the field: rows that climb to the left like notes on a stave
    const rows = props.mobile ? 2 : 3;
    for (let row = 0; row < rows; row++)
      for (let i = 0; i < 7; i++) {
        const x = -330 + i * 44 + row * 30 + (r() - 0.5) * 16;
        const z = 150 - i * 52 - row * 60 + (r() - 0.5) * 20;
        const y = g(x, z) + 46 + i * 11 + row * 22 + (r() - 0.5) * 10;
        const size = 13 + r() * 9 + (i === 3 ? 8 : 0);
        suns.push({ p: [x, y, z], size, col: GOLD, k: 0.7 });
      }
    // a few to the right, higher and further
    for (let i = 0; i < 6; i++) {
      const x = 200 + i * 46 + (r() - 0.5) * 20;
      const z = 60 - i * 70;
      suns.push({ p: [x, g(x, z) + 90 + i * 14, z], size: 16 + r() * 8, col: GOLD, k: 0.75 });
    }
    // suns on stems in the grass, like flowers, in drifts all along the path
    const pts = pathOf("sun").pts;
    const clear = (x: number, z: number) => def.canvases.every((c) => Math.hypot(x - c.x, z - c.z) > 34) && BELLS.every(([bx, bz, R]) => Math.hypot(x - bx, z - bz) > R + 6);
    const drifts = props.mobile ? 14 : 34;
    for (let d = 0; d < drifts; d++) {
      const p = pts[Math.floor(((d + 0.5) / drifts) * (pts.length - 12))];
      const side = d % 2 ? 1 : -1;
      const cx = p.x + side * (22 + r() * 30);
      const cz = p.z + (r() - 0.5) * 20;
      const n = 3 + Math.floor(r() * (props.mobile ? 3 : 5));
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 26;
        const z = cz + (r() - 0.5) * 26;
        if (!clear(x, z)) continue;
        // a hair of a stem: the sun should read as a flower of light, not a lamp on a post
        const h = 2.6 + r() * 3.4;
        const y = g(x, z);
        k.add(new THREE.CylinderGeometry(0.012, 0.035, h, 4, 1, true), [x, y + h / 2, z], [0.34, 0.28, 0.12], { rot: [(r() - 0.5) * 0.16, 0, (r() - 0.5) * 0.16] });
        suns.push({ p: [x, y + h + 0.6, z], size: 1.7 + r() * 1.0, col: GOLD, k: 0.75 });
      }
    }
    // stands of thin dark spires on the plain, the same comb the bells wear, grown as trees
    const stands = props.mobile ? 10 : Math.round(26 * props.trees);
    for (let d = 0; d < stands; d++) {
      const a = r() * Math.PI * 2;
      const dist = 90 + r() * 380;
      const cx = Math.cos(a) * dist;
      const cz = Math.sin(a) * dist - 40;
      const n = 4 + Math.floor(r() * 6);
      for (let i = 0; i < n; i++) {
        const x = cx + (i - n / 2) * (3.2 + r() * 2) * Math.cos(a + 1.2) + (r() - 0.5) * 3;
        const z = cz + (i - n / 2) * (3.2 + r() * 2) * Math.sin(a + 1.2) + (r() - 0.5) * 3;
        if (!clear(x, z) || pts.some((q, j) => j % 4 === 0 && Math.hypot(q.x - x, q.z - z) < 12)) continue;
        const h = 9 + r() * 15;
        k.add(new THREE.ConeGeometry(0.55 + h * 0.02, h, 5), [x, g(x, z) + h / 2 - 0.5, z], DARK, { top: [0.13, 0.19, 0.33] });
      }
    }

    // far bells, paler with every row: the city goes on
    for (let i = 0; i < (props.mobile ? 8 : 16); i++) {
      const a = -2.6 + (i / 15) * 3.9 + (r() - 0.5) * 0.15;
      const d = 640 + r() * 330;
      const x = Math.sin(a) * d;
      const z = -Math.cos(a) * d - 60;
      const R = 50 + r() * 60;
      const H = R * (1.7 + r() * 0.9);
      bell(far, x, z, R, H, g(x, z) - 6, STONE, STONE_TOP, 28);
      comb(far, x, z, R, H, g(x, z) - 6, a + 2.2, 7, r);
      if (i % 3 === 0) suns.push({ p: [x + R * 0.3, g(x, z) + R * 3.2, z], size: 30, col: GOLD, k: 0.9 });
    }
    // the far strip at the upper left of the picture: a long low shelf of land on the horizon, a comb of
    // thin strokes along it, a small temple, and its own row of drawn suns with a great one at the end
    {
      const sx = -470;
      const sz = -300;
      const yaw = Math.atan2(sx, sz + 40) + Math.PI; // broadside to the middle of the world
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const sy = g(sx, sz) + 5;
      const L = (u: number, y: number, w = 0): V3 => [sx + c * u + sn * w, sy + y, sz - sn * u + c * w];
      far.box(300, 5, 26, L(0, 0), DARK, { top: STONE, rot: [0, yaw, 0] });
      far.box(330, 30, 34, L(0, -16), DARK, { top: DARK, rot: [0, yaw, 0] });
      for (let i = 0; i < 26; i++) {
        const u = -140 + i * 7.2 + (r() - 0.5) * 2;
        if (Math.abs(u - 62) < 26) continue;
        const h = 9 + r() * 12;
        far.add(new THREE.ConeGeometry(1.0, h, 4), L(u, 2.5 + h / 2), DARK, { top: STONE });
      }
      // the temple: a plinth, a row of columns, a pediment
      far.box(34, 3, 16, L(62, 4), STONE, { top: STONE_TOP, rot: [0, yaw, 0] });
      for (let i = 0; i < 6; i++) far.add(new THREE.CylinderGeometry(1.1, 1.3, 17, 8), L(62 - 13.5 + i * 5.4, 14, 5), STONE, { top: STONE_TOP });
      far.box(32, 2.4, 14, L(62, 23.6), STONE_TOP, { rot: [0, yaw, 0] });
      far.add(new THREE.CylinderGeometry(8, 8, 32, 3, 1, false, Math.PI / 2), L(62, 27.2), STONE, { rot: [0, yaw, Math.PI / 2], scale: [0.6, 1, 1] });
      suns.push({ p: L(-150, 34, 6), size: 62, col: GOLD, k: 0.85 });
      for (let i = 0; i < 5; i++) suns.push({ p: L(-70 + i * 44, 44 + (i % 2) * 9, 6), size: 17, col: GOLD, k: 0.8 });
    }
    // low mist where the path runs between the gates
    for (let i = 0; i < 9; i++) puffs.push({ p: [(r() - 0.5) * 240, g(0, 150) + 5 + r() * 5, 60 + r() * 330], size: 40 + r() * 40, a: 0.6 });

    return {
      city: k.build(),
      far: far.build(),
      tempera: makeTempera({ rim: [1.5, 0.95, 0.3], rimPow: 5, amb: 1.2, key: 0.12 }),
      suns,
      glows,
      puffs,
      motes: pointsGeometry(
        props.mobile ? 260 : Math.round(900 * props.effects),
        (_, q) => [(q() - 0.5) * 520, 6 + q() * q() * 110, 480 - q() * 800, 0.4 + q() * 1.1],
        77,
      ),
      moteMat: makePoints({ a: [1, 0.82, 0.42], b: [1, 0.92, 0.7], scale: 240, drift: 2.4, gain: 0.8, max: 20 }),
    };
  }, [props.mobile, props.effects > 0.5]);
  return (
    <>
      <WorldBase id="sun" def={def} pal={SUN_PAL} props={props} tip={[0.78, 0.6, 0.2]} pathTint={[1, 0.86, 0.56]} />
      <mesh geometry={b.city} material={b.tempera} />
      <mesh geometry={b.far} material={b.tempera} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
      <Halos list={b.suns} kind={1} />
      <points geometry={b.motes} material={b.moteMat} />
    </>
  );
}
