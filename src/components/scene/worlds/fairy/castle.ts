import * as THREE from "three";
import { Kit, type Halo, type V3 } from "../kit";
import { MT, PEAKS, ROAD, WARDS, footOf, peakRadius, rhoOf, roadT, surfaceY, terraceAt, thOf, wallOf } from "./mountain";

// The castle of the Fairy Tale. It climbs the front of the great peak in three wards, each a drum of pale
// stone standing out of the rock with its ring of slim towers; a hall and a chapel stand on them, a keep above,
// and towers go on up the ridge to the very point. Every window is lit. Measured, like the mountain, from the
// mountain's own foot.

const STONE: V3 = [0.25, 0.13, 0.25];
const STONE_LIT: V3 = [0.9, 0.5, 0.22];
const DARK: V3 = [0.15, 0.1, 0.22];
// roofs: red going to gold, violet, and the green of old copper
const ROOFS: [V3, V3][] = [
  [
    [0.52, 0.17, 0.11],
    [1.0, 0.58, 0.24],
  ],
  [
    [0.2, 0.16, 0.42],
    [0.6, 0.48, 0.78],
  ],
  [
    [0.09, 0.25, 0.3],
    [0.42, 0.7, 0.64],
  ],
];
const LAMP: V3 = [1, 0.56, 0.17];

type Lights = { windows: Halo[]; halos: Halo[]; glows: Halo[] };

export function buildCastle(mobile: boolean, r: () => number) {
  const k = new Kit();
  const L: Lights = { windows: [], halos: [], glows: [] };
  const tips: V3[] = [];
  let nWin = 0;

  // a tower: a shaft drawn in toward its top, a gallery corbelled out, a steep hat with hollow sides, a needle
  const tower = (x: number, y: number, z: number, R: number, H: number, o: { roof?: number; rh?: number; turrets?: boolean } = {}) => {
    const seg = R > 7 ? 14 : 10;
    k.lathe(
      [
        [R * 1.16, 0],
        [R, H * 0.05],
        [R * 0.9, H * 0.84],
        [R * 0.9, H * 0.9],
        [R * 1.14, H * 0.935],
        [R * 1.14, H],
        [R * 0.6, H + 0.01],
      ],
      [x, y, z],
      STONE,
      { top: STONE_LIT, seg, glow: 0.14 },
    );
    const rh = o.rh ?? R * (3.8 + r() * 1.4);
    const [lo, hi] = ROOFS[o.roof ?? 0];
    k.lathe(
      [
        [R * 1.28, 0],
        [R * 0.76, rh * 0.2],
        [R * 0.42, rh * 0.5],
        [R * 0.17, rh * 0.8],
        [0.05, rh],
      ],
      [x, y + H, z],
      lo,
      { top: hi, seg, glow: 0.14 },
    );
    k.add(new THREE.CylinderGeometry(0.05, R * 0.05 + 0.08, R * 1.5, 4), [x, y + H + rh + R * 0.7, z], [1, 0.84, 0.5], { glow: 0.9 });
    tips.push([x, y + H + rh + R * 1.4, z]);
    // lancets, lit, on every other face, row above row
    const rows = Math.max(1, Math.floor((H * 0.74) / (R * 2.3 + 3)));
    const apo = Math.cos(Math.PI / seg);
    for (let f = 0; f < seg; f += 2) {
      const phi = ((f + 0.5) / seg) * Math.PI * 2;
      for (let q = 0; q < rows; q++) {
        const yy = H * 0.14 + ((q + 0.5) / rows) * H * 0.66 + ((f / 2) % 2) * R * 0.5;
        const rr = (R - (R * 0.1 * yy) / (H * 0.84)) * apo - 0.22;
        const w = Math.max(0.5, R * 0.17);
        const h = Math.max(1.6, R * 0.62);
        // a lancet: its glass set in the wall, a pointed hood over it and a sill under it
        k.box(w, h, 0.7, [x + Math.sin(phi) * rr, y + yy, z + Math.cos(phi) * rr], [1.0, 0.5, 0.14], { top: [0.5, 0.2, 0.08], glow: 0.8, rot: [0, phi, 0] });
        k.add(new THREE.ConeGeometry(w * 0.95, w * 1.5, 4), [x + Math.sin(phi) * (rr + 0.2), y + yy + h / 2 + w * 0.6, z + Math.cos(phi) * (rr + 0.2)], STONE, { top: STONE_LIT, rot: [0, phi + Math.PI / 4, 0], glow: 0.05 });
        k.box(w * 1.7, w * 0.3, 1.1, [x + Math.sin(phi) * (rr + 0.1), y + yy - h / 2 - w * 0.15, z + Math.cos(phi) * (rr + 0.1)], STONE_LIT, { rot: [0, phi, 0], glow: 0.05 });
        if (nWin++ % (mobile ? 6 : 2) === 0) L.windows.push({ p: [x + Math.sin(phi) * (rr + 1.2), y + yy, z + Math.cos(phi) * (rr + 1.2)], size: Math.min(5, Math.max(2.4, R * 0.5)), col: [1, 0.7, 0.34], k: 0.5 });
      }
    }
    if (o.turrets) {
      // four small turrets hung on its corners under the roof
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        const tx = x + Math.sin(a) * R * 1.02;
        const tz = z + Math.cos(a) * R * 1.02;
        const tr = R * 0.26;
        k.lathe(
          [
            [0.05, 0],
            [tr, tr * 2.2],
            [tr, H * 0.3],
            [tr * 1.2, H * 0.3 + 0.01],
          ],
          [tx, y + H * 0.74, tz],
          STONE,
          { top: STONE_LIT, seg: 8, glow: 0.06 },
        );
        k.add(new THREE.ConeGeometry(tr * 1.3, tr * 6, 8), [tx, y + H * 1.04 + tr * 3, tz], lo, { top: hi, glow: 0.14 });
        tips.push([tx, y + H * 1.04 + tr * 6.2, tz]);
      }
    }
  };

  // What a tower stands on: a round bastion of the same stone carried down into the ground under it, a corbel
  // ring where the two meet. No tower hangs.
  const seated = (x: number, top: number, z: number, R: number) => {
    const foot = surfaceY(x, z) - 8;
    if (top - foot < 3) return;
    k.lathe(
      [
        [R * 1.3, 0],
        [R * 1.16, (top - foot) * 0.12],
        [R * 1.1, top - foot - R * 0.5],
        [R * 1.24, top - foot - R * 0.2],
        [R * 1.24, top - foot],
      ],
      [x, foot, z],
      DARK,
      { top: STONE, seg: R > 7 ? 14 : 10, glow: 0.02 },
    );
  };
  // A pointed arch as a shape: w wide, h high, springing where its sides end.
  const archShape = (w: number, h: number, x0 = 0) => {
    const half = w / 2;
    const spring = Math.max(h * 0.3, h - half * 1.5);
    const sh = new THREE.Shape();
    sh.moveTo(x0 - half, 0);
    sh.lineTo(x0 - half, spring);
    sh.quadraticCurveTo(x0 - half, h * 0.94, x0, h);
    sh.quadraticCurveTo(x0 + half, h * 0.94, x0 + half, spring);
    sh.lineTo(x0 + half, 0);
    sh.lineTo(x0 - half, 0);
    return sh;
  };
  // A real opening: a surround standing proud of the wall with a second order set back in it, and behind them the
  // lit depth of the passage (or, for a window, the glass), deep amber low down and dark at its head. (x, y, z) is
  // the middle of its sill on the wall's face; it looks out along yaw.
  const archway = (x: number, y: number, z: number, yaw: number, w: number, h: number, depth: number, light = 1) => {
    const t = Math.max(0.6, w * 0.2);
    const put = (g: THREE.BufferGeometry, back: number, col: V3, top: V3, glow: number) =>
      k.add(g, [x - Math.sin(yaw) * back, y, z - Math.cos(yaw) * back], col, { top, rot: [0, yaw, 0], glow });
    const outer = archShape(w + t * 2, h + t);
    outer.holes.push(archShape(w, h));
    put(new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 7 }), 0, STONE, STONE_LIT, 0.08);
    const inner = archShape(w, h);
    inner.holes.push(archShape(w * 0.76, h * 0.9));
    put(new THREE.ExtrudeGeometry(inner, { depth: depth * 0.5, bevelEnabled: false, curveSegments: 7 }), 0, DARK, STONE, 0.04);
    // the light within: seen past both orders, so it lies deep
    put(new THREE.ShapeGeometry(archShape(w * 0.78, h * 0.91), 7), -0.25, [1.0, 0.52, 0.15], [0.16, 0.06, 0.07], 0.75 * light);
    // a sill, so it stands on something
    k.box(w + t * 2.6, t * 0.8, depth + t, [x + Math.sin(yaw) * depth * 0.5, y - t * 0.4, z + Math.cos(yaw) * depth * 0.5], STONE, { top: STONE_LIT, rot: [0, yaw, 0], glow: 0.05 });
  };

  // A flight of steps wound on a drum's face, from bearing a0 at height y0 to bearing a1 at y1: each step a
  // slab let into the wall and carried on a corbel, a low parapet on its open side. It begins and ends on
  // something real (a landing, a court, a door).
  const perron = (w: { x: number; z: number; R: number }, a0: number, y0: number, a1: number, y1: number, width = 9) => {
    const n = Math.max(5, Math.round(Math.abs(y1 - y0) / 1.5));
    const rr = w.R + width / 2 - 0.6;
    const seg = (Math.abs(a1 - a0) * (w.R + width / 2)) / n + 0.7;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * (i + 0.5)) / n;
      const yT = y0 + ((y1 - y0) * (i + 1)) / n;
      const px = w.x + Math.sin(a) * rr;
      const pz = w.z + Math.cos(a) * rr;
      k.box(seg, 5, width, [px, yT - 2.5, pz], mixc(STONE, STONE_LIT, 0.35), { top: STONE_LIT, rot: [0, a, 0], glow: 0.06 });
      k.box(seg, 1.5, 0.9, [w.x + Math.sin(a) * (w.R + width - 1), yT + 0.75, w.z + Math.cos(a) * (w.R + width - 1)], STONE_LIT, { rot: [0, a, 0], glow: 0.06 });
      // its corbel: a wedge of stone going back into the wall under it
      if (i % 2 === 0) k.add(new THREE.CylinderGeometry(width * 0.62, 0.4, 9, 4, 1), [w.x + Math.sin(a) * (w.R + 1), yT - 9.4, w.z + Math.cos(a) * (w.R + 1)], DARK, { top: STONE, rot: [0, a + Math.PI / 4, 0], glow: 0.02 });
    }
  };

  // a ward: a drum of stone standing out of the rock, buttressed, with its curtain wall and towers on the open side
  WARDS.forEach((w0, wi) => {
    // (the drum is carried down to below the lowest ground its rim stands over: no part of it hangs)
    let low = w0.y;
    for (let i = 0; i < 24; i++) low = Math.min(low, surfaceY(w0.x + Math.sin((i / 24) * Math.PI * 2) * (w0.R + 8), w0.z + Math.cos((i / 24) * Math.PI * 2) * (w0.R + 8)));
    const w = { ...w0, body: w0.y - low + 14 };
    k.add(new THREE.CylinderGeometry(w.R, w.R + 9, w.body, 56, 1), [w.x, w.y - w.body / 2, w.z], DARK, { top: STONE, glow: 0.01 });
    // a coping round its head, under the wall
    for (const dy of [-1.2]) k.add(new THREE.TorusGeometry(w.R + 0.6 - (dy * 9) / w.body, dy > -2 ? 1.4 : 1.0, 5, 72), [w.x, w.y + dy, w.z], STONE, { top: STONE_LIT, rot: [Math.PI / 2, 0, 0], glow: 0.05 });
    // the court: paved, a little green
    k.add(new THREE.CylinderGeometry(w.R - 2, w.R - 2, 0.6, 48, 1), [w.x, w.y + 0.1, w.z], [0.36, 0.3, 0.28], { glow: 0.02 });
    const A = wi === 0 ? 2.2 : 2.05;
    // buttresses down the drum, broad and few
    const nb = wi === 0 ? 10 : 7;
    for (let i = 0; i <= nb; i++) {
      const a = -A * 0.92 + (i / nb) * A * 1.84;
      const h = w.body * 0.92;
      k.add(new THREE.CylinderGeometry(2.4, 5.2, h, 5), [w.x + Math.sin(a) * (w.R + 2.6), w.y - h / 2 - 3, w.z + Math.cos(a) * (w.R + 2.6)], mixc(DARK, STONE, 0.3), { top: mixc(STONE, STONE_LIT, 0.4), rot: [0, a, 0], glow: 0.02 });
    }
    // between the buttresses, tall lancets let into the drum, lit from the vaults behind them
    for (let i = 0; i < nb; i++) {
      const a = -A * 0.92 + ((i + 0.5) / nb) * A * 1.84;
      // (not where the great door and its stairs are)
      if (wi === 0 && Math.abs(a) < 0.34) continue;
      archway(w.x + Math.sin(a) * (w.R + 2.2), w.y - (wi === 0 ? 66 : 48), w.z + Math.cos(a) * (w.R + 2.2), a, wi === 0 ? 4.6 : 3.6, wi === 0 ? 24 : 18, 2, 0.8);
    }
    // a gallery of small corbels all round under the coping
    const nc = Math.round((w.R * A * 2) / 4.4);
    for (let i = 0; i < nc; i++) {
      const a = -A + ((i + 0.5) / nc) * A * 2;
      k.box(1.7, 2.6, 2.4, [w.x + Math.sin(a) * (w.R + 0.9), w.y - 3.6, w.z + Math.cos(a) * (w.R + 0.9)], STONE, { top: STONE_LIT, rot: [0, a, 0], glow: 0.05 });
    }
    // the curtain wall and its battlements
    const wh = wi === 0 ? 17 : 13;
    k.add(new THREE.CylinderGeometry(w.R - 0.5, w.R + 0.5, wh, 64, 1, true, -A, A * 2), [w.x, w.y + wh / 2, w.z], mixc(STONE, STONE_LIT, 0.4), { top: STONE_LIT, glow: 0.1 });
    const nm = Math.round((w.R * A * 2) / 5.2);
    for (let i = 0; i < nm; i += 2) {
      const a = -A + ((i + 0.5) / nm) * A * 2;
      k.box(2.8, 2.6, 1.7, [w.x + Math.sin(a) * w.R, w.y + wh + 1.2, w.z + Math.cos(a) * w.R], STONE_LIT, { glow: 0.05, rot: [0, a, 0] });
    }
    // towers along it, tall and short by turns, the roofs red, violet and green
    const nt = wi === 0 ? 12 : wi === 1 ? 10 : 8;
    for (let i = 0; i <= nt; i++) {
      const a = -A + (i / nt) * A * 2;
      const mid = Math.abs(i - nt / 2) < 0.75;
      // (the gate stands between the two middle towers of the lowest ward)
      if (wi === 0 && i === nt / 2) continue;
      const R = (wi === 0 ? 8.6 : wi === 1 ? 7.2 : 5.8) * (0.85 + r() * 0.35) * (mid ? 1.15 : 1);
      const H = (wi === 0 ? 66 : wi === 1 ? 60 : 52) * (0.78 + r() * 0.5) + (i % 2 ? 13 : 0) + (mid ? 16 : 0);
      tower(w.x + Math.sin(a) * w.R, w.y - 10, w.z + Math.cos(a) * w.R, R, H, { roof: (i + wi) % 3 === 2 ? 1 : (i + wi) % 5 === 3 ? 2 : 0, turrets: i % 4 === 1 });
      seated(w.x + Math.sin(a) * w.R, w.y - 9, w.z + Math.cos(a) * w.R, R);
    }
  });

  // the gatehouse at the front of the lowest ward: two great towers, a block between them, the portal lit from within
  {
    const w = WARDS[0];
    const gz = w.z + w.R - 1;
    k.box(42, 64, 18, [w.x, w.y + 22, gz], STONE, { top: STONE_LIT, glow: 0.1 });
    // (the block stands on a pier of its own, down into the slope)
    const under = surfaceY(w.x, gz + 10) - 12;
    k.lathe(
      [
        [34, 0],
        [29, (w.y - 9 - under) * 0.2],
        [26, w.y - 9 - under - 6],
        [29, w.y - 9 - under - 2],
        [29, w.y - 9 - under],
      ],
      [w.x, under, gz - 6],
      DARK,
      { top: STONE, seg: 24, glow: 0.01 },
    );
    for (const sx of [-1, 1]) {
      tower(w.x + sx * 24.5, w.y - 14, gz + 1, 12.5, 108, { roof: 0, rh: 60, turrets: true });
      seated(w.x + sx * 24.5, w.y - 13, gz + 1, 12.5);
    }
    // the great door: a deep pointed arch opening on a round balcony carried on a corbel, a rose over it
    archway(w.x, w.y - 4, gz + 9, 0, 15, 30, 7);
    k.lathe(
      [
        [3, 0],
        [12, 9],
        [25, 17],
        [25, 20],
        [26.5, 20.01],
        [26.5, 23],
      ],
      [w.x, w.y - 27, gz + 6],
      DARK,
      { top: STONE_LIT, seg: 20, glow: 0.04 },
    );
    k.add(new THREE.CylinderGeometry(5.8, 5.8, 1.2, 24), [w.x, w.y + 43, gz + 8.9], [1, 0.62, 0.22], { top: [1, 0.82, 0.5], glow: 0.8, rot: [Math.PI / 2, 0, 0] });
    k.add(new THREE.TorusGeometry(6.3, 1.1, 6, 28), [w.x, w.y + 43, gz + 9.2], STONE, { top: STONE_LIT, glow: 0.06 });
    k.add(new THREE.CylinderGeometry(0.001, 1, 1, 4, 1), [w.x, w.y + 54 + 11, gz], ROOFS[1][0], { top: ROOFS[1][1], glow: 0.1, scale: [31, 22, 14], rot: [0, Math.PI / 4, 0] });
    L.glows.push({ p: [w.x, w.y + 12, gz + 20], size: 54, col: [1, 0.7, 0.34], k: 0.4 });
    L.halos.push({ p: [w.x, w.y + 43, gz + 11], size: 10, col: [1, 0.84, 0.52], k: 0.6 });
    // where the road arrives: its own door, in the drum's flank, exactly where the road meets the stone
    let u = 1.6;
    let door = terraceAt(u, roadT(u));
    for (; u < ROAD.u1; u += 0.004) {
      door = terraceAt(u, roadT(u));
      if (Math.hypot(door.x - w.x, door.z - w.z) < w.R + 2) break;
    }
    const a = Math.atan2(door.x - w.x, door.z - w.z);
    archway(w.x + Math.sin(a) * (w.R + 1.5), door.y - 0.5, w.z + Math.cos(a) * (w.R + 1.5), a, 11, 20, 5);
    // from the road's door two flights wind up the drum's face to the landing before the great door: the left
    // one from the road itself, the right one from a round lookout that answers it on the other side
    const aL = a + 0.2;
    perron(w, aL, door.y, -0.5, w.y - 4.5);
    perron(w, -aL, door.y, 0.5, w.y - 4.5);
    // each arrives at a door in the flank of a gate tower, and through the tower at the landing
    for (const sx of [-1, 1]) archway(w.x + sx * (24.5 + 12.2), w.y - 4.5, gz + 3, (sx * Math.PI) / 2, 5, 10, 2.2);
    {
      const lx = w.x + Math.sin(-aL + 0.06) * (w.R + 9);
      const lz = w.z + Math.cos(-aL + 0.06) * (w.R + 9);
      const foot = surfaceY(lx, lz) - 10;
      k.lathe(
        [
          [17, 0],
          [14.5, (door.y - foot) * 0.2],
          [13, door.y - foot - 4],
          [15, door.y - foot - 1],
          [15, door.y - foot],
          [14, door.y - foot + 0.01],
          [14, door.y - foot + 1.8],
          [15, door.y - foot + 1.8],
        ],
        [lx, foot, lz],
        DARK,
        { top: STONE_LIT, seg: 18, glow: 0.03 },
      );
      L.windows.push({ p: [lx, door.y + 4, lz], size: 4, col: [1, 0.7, 0.34], k: 0.5 });
    }
    L.glows.push({ p: [w.x + Math.sin(a) * (w.R + 10), door.y + 8, w.z + Math.cos(a) * (w.R + 10)], size: 26, col: [1, 0.72, 0.36], k: 0.4 });
  }
  // from the lower court two flights wind up the middle drum to a gate in its wall
  {
    const w = WARDS[1];
    perron(w, -1.2, WARDS[0].y, -0.16, w.y - 1, 7);
    perron(w, 1.2, WARDS[0].y, 0.16, w.y - 1, 7);
    archway(w.x, w.y, w.z + w.R - 0.6, 0, 7, 11.5, 3);
  }
  // the hall on the middle ward: a long roof, a row of tall windows, a flèche
  {
    const w = WARDS[1];
    archway(w.x, w.y, w.z + 10, 0, 6, 12, 2.4);
    k.box(66, 36, 28, [w.x, w.y + 18, w.z - 4], STONE, { top: STONE_LIT, glow: 0.1 });
    k.add(new THREE.CylinderGeometry(0.001, 1, 1, 4, 1), [w.x, w.y + 36 + 14, w.z - 4], ROOFS[0][0], { top: ROOFS[0][1], glow: 0.1, scale: [48, 28, 21], rot: [0, Math.PI / 4, 0] });
    for (let i = -4; i <= 4; i++) {
      if (i !== 0) archway(w.x + i * 6.8, w.y + 6, w.z + 10, 0, 3.0, 23, 1.6);
      else archway(w.x, w.y + 16, w.z + 10, 0, 3.0, 13, 1.6);
      if (i % 2 === 0) L.windows.push({ p: [w.x + i * 6.8, w.y + 17, w.z + 13], size: 9, col: [1, 0.72, 0.36], k: 0.5 });
    }
    tower(w.x, w.y + 46, w.z - 4, 3.6, 16, { roof: 2, rh: 42 });
    L.glows.push({ p: [w.x, w.y + 20, w.z + 22], size: 84, col: [1, 0.68, 0.32], k: 0.4 });
  }
  // the chapel on the upper ward, a rose window in its gable
  {
    const w = WARDS[2];
    k.box(32, 34, 20, [w.x, w.y + 17, w.z - 6], STONE, { top: STONE_LIT, glow: 0.1 });
    k.add(new THREE.CylinderGeometry(0.001, 1, 1, 4, 1), [w.x, w.y + 34 + 13, w.z - 6], ROOFS[1][0], { top: ROOFS[1][1], glow: 0.1, scale: [24, 26, 15.5], rot: [0, Math.PI / 4, 0] });
    k.add(new THREE.CylinderGeometry(4.8, 4.8, 1.2, 22), [w.x, w.y + 23, w.z + 4.1], [1, 0.62, 0.22], { top: [1, 0.8, 0.5], glow: 0.8, rot: [Math.PI / 2, 0, 0] });
    k.add(new THREE.TorusGeometry(5.2, 0.9, 6, 24), [w.x, w.y + 23, w.z + 4.3], STONE, { top: STONE_LIT, glow: 0.06 });
    for (const sx of [-1, 1]) archway(w.x + sx * 9.2, w.y + 4, w.z + 4, 0, 2.6, 14, 1.4);
    archway(w.x, w.y, w.z + 4, 0, 5, 11, 2.2);
    L.halos.push({ p: [w.x, w.y + 23, w.z + 7], size: 11, col: [1, 0.86, 0.56], k: 0.7 });
  }
  // the keep, standing in the rock above the wards
  // (its foot is in the rock of the great peak behind the upper ward; it comes out of the stone as it climbs)
  tower(WARDS[2].x + 1, WARDS[2].y - 3, 6, 15, 153, { roof: 0, rh: 70, turrets: true });
  L.glows.push({ p: [3, 660, 44], size: 120, col: [1, 0.7, 0.36], k: 0.32 });
  // towers on up the two front ridges of the great peak, and one on its very point
  const P = PEAKS[0];
  for (const [a, y, R, H] of [
    [0.62, 626, 6.0, 34],
    [0.5, 654, 5.2, 28],
    [0.74, 678, 4.4, 24],
    [2.5, 618, 6.0, 34],
    [2.62, 648, 5.0, 28],
    [2.44, 674, 4.2, 24],
    [1.57, 692, 4.6, 20],
  ] as const) {
    const rr = peakRadius(P, y) * 0.86;
    tower(P.x + Math.cos(a) * rr, y - 24, P.z + Math.sin(a) * rr, R, H + 16, { roof: (Math.round(y) % 3) as 0 | 1 | 2 });
  }
  // (each tower on a peak starts where the rock is as wide as itself, so its foot is in the stone)
  const seatOn = (pk: (typeof PEAKS)[number], R: number) => pk.y1 - (pk.y1 - pk.y0) * Math.pow((R * 1.25) / pk.R, 1 / (pk.pow ?? 1.12));
  tower(P.x, seatOn(P, 7) - 3, P.z, 7, 44 + (P.y1 - 14 - seatOn(P, 7)) + 3, { roof: 0, rh: 48, turrets: true });
  L.halos.push({ p: [P.x, P.y1 + 86, P.z], size: 14, col: [1, 0.88, 0.6], k: 0.8 });
  // a watchtower on each of the lesser peaks
  PEAKS.slice(1).forEach((p, i) => {
    const R = 5.4 - i * 0.2;
    const ys = seatOn(p, R);
    const kk = (ys - p.y0) / (p.y1 - p.y0);
    tower(p.x + (p.lean?.[0] ?? 0) * kk * kk, ys - 3, p.z + (p.lean?.[1] ?? 0) * kk * kk, R, 30 + (p.y1 - 10 - ys) + 3, { roof: i % 3 });
  });
  // a bridge thrown from the middle ward to the slim peak on the right: a deck on two round arches
  {
    const a0 = new THREE.Vector3(WARDS[1].x + 50, WARDS[1].y + 4, WARDS[1].z + 2);
    const a1 = new THREE.Vector3(PEAKS[1].x - 16, WARDS[1].y + 4, PEAKS[1].z + 6);
    const d = a1.clone().sub(a0);
    const len = d.length();
    const yaw = Math.atan2(-d.z, d.x);
    const mid = a0.clone().add(a1).multiplyScalar(0.5);
    k.box(len + 8, 3, 6.4, [mid.x, mid.y, mid.z], STONE, { top: STONE_LIT, rot: [0, yaw, 0], glow: 0.03 });
    for (const sd of [-1, 1]) k.box(len + 8, 1.8, 0.8, [mid.x + sd * Math.sin(yaw) * 3.1, mid.y + 2.3, mid.z + sd * Math.cos(yaw) * 3.1], STONE_LIT, { rot: [0, yaw, 0], glow: 0.05 });
    for (let i = 0; i < 2; i++) {
      const c = a0.clone().addScaledVector(d, (i + 0.5) / 2);
      const rad = len / 4 - 1.6;
      k.add(new THREE.TorusGeometry(rad, 1.8, 6, 14, Math.PI), [c.x, c.y - 1.6, c.z], DARK, { top: STONE, rot: [0, yaw, 0], glow: 0.02, scale: [1, 1.6, 2.4] });
    }
    for (let i = 0; i <= 2; i++) {
      const c = a0.clone().addScaledVector(d, i / 2);
      k.box(3.8, 90, 5.4, [c.x, c.y - 46, c.z], DARK, { top: STONE, rot: [0, yaw, 0], glow: 0.02 });
    }
  }
  // behind the peaks: a postern wall with its own few towers, so the castle has no blind side
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + 0.4 + (i / 6) * (Math.PI - 0.8);
    const rr = 96 + (i % 2) * 10;
    const sy = surfaceY(Math.cos(a) * (rr + 8), Math.sin(a) * (rr + 8)) - 8;
    tower(Math.cos(a) * rr, sy, Math.sin(a) * rr, 6 + r() * 2, 46 + r() * 26 + Math.max(0, 428 - sy), { roof: i % 3 });
  }
  // the town under the castle: tall narrow houses and small towers crowding the highest terrace, every window lit
  {
    const nHouse = mobile ? 30 : 84;
    for (let i = 0, guard = 0; i < nHouse && guard < 600; guard++) {
      const u = 1.42 + r() * 1.0;
      const t = 0.14 + r() * 0.74;
      const p = terraceAt(u, t);
      if (u < ROAD.u1 && Math.abs(t - roadT(u)) < 0.13) continue;
      if (WARDS.some((w) => Math.hypot(p.x - w.x, p.z - w.z) < w.R + 14)) continue;
      if (PEAKS.some((pk) => Math.hypot(p.x - pk.x, p.z - pk.z) < peakRadius(pk, p.y) + 6)) continue;
      i++;
      const yaw = Math.atan2(p.x, p.z);
      if (i % 6 === 0) {
        tower(p.x, p.y - 14, p.z, 3.4 + r() * 1.6, 34 + r() * 18, { roof: i % 3 });
        continue;
      }
      const w = 7 + r() * 5;
      const h = 12 + r() * 12;
      const dp = 7 + r() * 3;
      k.box(w, h + 10, dp, [p.x, p.y + h / 2 - 5, p.z], mixc(STONE, [0.5, 0.36, 0.34], r()), { top: mixc(STONE_LIT, [0.98, 0.8, 0.6], r()), rot: [0, yaw, 0], glow: 0.03 });
      const [lo, hi] = ROOFS[i % 3];
      k.add(new THREE.CylinderGeometry(0.001, 1, 1, 4, 1), [p.x, p.y + h + h * 0.34, p.z], lo, { top: hi, scale: [w * 0.8, h * 0.7, dp * 0.8], rot: [0, yaw + Math.PI / 4, 0], glow: 0.1 });
      // its windows, toward the valley
      const rows = Math.max(1, Math.floor(h / 5));
      for (let q = 0; q < rows; q++)
        for (const sx of [-1, 1]) k.box(1.0, 2.0, 0.8, [p.x + Math.sin(yaw) * (dp / 2) + Math.cos(yaw) * sx * w * 0.24, p.y + 3 + q * 4.6, p.z + Math.cos(yaw) * (dp / 2) - Math.sin(yaw) * sx * w * 0.24], LAMP, { glow: 0.85, rot: [0, yaw, 0] });
      if (i % 3 === 0) L.windows.push({ p: [p.x + Math.sin(yaw) * (dp / 2 + 1.5), p.y + 5, p.z + Math.cos(yaw) * (dp / 2 + 1.5)], size: 5, col: [1, 0.7, 0.34], k: 0.45 });
    }
  }
  // turrets standing in the great wall itself, all the way up it, and two where it rises out of the hillside
  {
    let u = 0.3;
    let n = 0;
    while (u < MT.turns - 0.42) {
      const th = thOf(u);
      const R = 5 + (n % 3 === 0 ? 1.6 : 0);
      const rr = rhoOf(u) + 2.5;
      tower(Math.cos(th) * rr, footOf(u) - 18, Math.sin(th) * rr, R, wallOf(u) + 32 + (n % 3 === 0 ? 14 : 0), { roof: n % 3 });
      u += (u > 1.3 ? 70 : 104) / (Math.PI * 2 * rhoOf(u));
      n++;
    }
  }
  L.glows.push({ p: [0, 560, 70], size: 380, col: [1, 0.66, 0.3], k: 0.3 });
  return { geo: k.build(), ...L, tips };
}
const mixc = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
