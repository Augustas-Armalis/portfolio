import * as THREE from "three";
import { Kit, type Halo, type V3 } from "../kit";
import { MT, PEAKS, ROAD, WARDS, footOf, peakRadius, rhoOf, rimOf, roadT, terraceAt, thOf, wallOf } from "./mountain";

// The castle of the Fairy Tale. It climbs the front of the great peak in three wards, each a drum of pale
// stone standing out of the rock with its ring of slim towers; a hall and a chapel stand on them, a keep above,
// and towers go on up the ridge to the very point. Every window is lit. Measured, like the mountain, from the
// mountain's own foot.

const STONE: V3 = [0.3, 0.17, 0.31];
const STONE_LIT: V3 = [0.86, 0.46, 0.3];
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
      { top: STONE_LIT, seg, glow: 0.1 },
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
        k.box(w, h, 1.0, [x + Math.sin(phi) * rr, y + yy, z + Math.cos(phi) * rr], LAMP, { glow: 1.7, rot: [0, phi, 0] });
        if (nWin++ % (mobile ? 9 : 4) === 0) L.windows.push({ p: [x + Math.sin(phi) * (rr + 1.2), y + yy, z + Math.cos(phi) * (rr + 1.2)], size: Math.max(2.6, R * 0.8), col: [1, 0.7, 0.34], k: 0.5 });
      }
    }
    // the gallery's own row of small lights
    for (let f = 0; f < seg; f++) {
      const phi = ((f + 0.5) / seg) * Math.PI * 2;
      k.box(R * 0.13, R * 0.2, 0.8, [x + Math.sin(phi) * (R * 1.14 * apo - 0.2), y + H * 0.968, z + Math.cos(phi) * (R * 1.14 * apo - 0.2)], LAMP, { glow: 1.4, rot: [0, phi, 0] });
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

  // a ward: a drum of stone standing out of the rock, buttressed, with its curtain wall and towers on the open side
  WARDS.forEach((w, wi) => {
    k.add(new THREE.CylinderGeometry(w.R, w.R + 6, w.body, 56, 1), [w.x, w.y - w.body / 2, w.z], DARK, { top: STONE, glow: 0.01 });
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
    // tall blind lancets let into the drum between them, each with a light low in it
    for (let i = 0; i < nb; i++) {
      const a = -A * 0.92 + ((i + 0.5) / nb) * A * 1.84;
      const h = w.body * 0.5;
      k.box(3.2, h, 1.6, [w.x + Math.sin(a) * (w.R + 1.1), w.y - h / 2 - 12, w.z + Math.cos(a) * (w.R + 1.1)], [0.07, 0.05, 0.14], { top: [0.1, 0.2, 0.26], rot: [0, a, 0] });
      k.box(1.6, 4.2, 1.9, [w.x + Math.sin(a) * (w.R + 1.2), w.y - h - 6, w.z + Math.cos(a) * (w.R + 1.2)], LAMP, { glow: 1.6, rot: [0, a, 0] });
    }
    // the curtain wall and its battlements
    const wh = wi === 0 ? 17 : 13;
    k.add(new THREE.CylinderGeometry(w.R - 0.5, w.R + 0.5, wh, 64, 1, true, -A, A * 2), [w.x, w.y + wh / 2, w.z], mixc(STONE, STONE_LIT, 0.4), { top: STONE_LIT, glow: 0.1 });
    const nm = Math.round((w.R * A * 2) / 5.2);
    for (let i = 0; i < nm; i += 2) {
      const a = -A + ((i + 0.5) / nm) * A * 2;
      k.box(2.8, 2.6, 1.7, [w.x + Math.sin(a) * w.R, w.y + wh + 1.2, w.z + Math.cos(a) * w.R], STONE_LIT, { glow: 0.05, rot: [0, a, 0] });
    }
    // a row of lit loops along the wall
    for (let i = 1; i < nm; i += 3) {
      const a = -A + ((i + 0.5) / nm) * A * 2;
      k.box(0.9, 3.4, 1.2, [w.x + Math.sin(a) * (w.R + 0.2), w.y + wh * 0.5, w.z + Math.cos(a) * (w.R + 0.2)], LAMP, { glow: 1.6, rot: [0, a, 0] });
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
    }
  });

  // the gatehouse at the front of the lowest ward: two great towers, a block between them, the portal lit from within
  {
    const w = WARDS[0];
    const gz = w.z + w.R - 1;
    k.box(42, 64, 18, [w.x, w.y + 22, gz], STONE, { top: STONE_LIT, glow: 0.1 });
    for (const sx of [-1, 1]) tower(w.x + sx * 24.5, w.y - 14, gz + 1, 12.5, 108, { roof: 0, rh: 60, turrets: true });
    // the portal: a tall pointed arch of light, and a rose over it
    k.box(15, 23, 1.4, [w.x, w.y + 3.5, gz + 8.6], LAMP, { glow: 1.6 });
    k.add(new THREE.ConeGeometry(10.6, 16, 4), [w.x, w.y + 23, gz + 8.6], LAMP, { glow: 1.6, scale: [1, 1, 0.1], rot: [0, Math.PI / 4, 0] });
    k.add(new THREE.CylinderGeometry(5.8, 5.8, 1.2, 24), [w.x, w.y + 43, gz + 8.7], [1, 0.82, 0.5], { glow: 1.5, rot: [Math.PI / 2, 0, 0] });
    for (const sx of [-1, 1]) for (let q = 0; q < 3; q++) k.box(1.5, 8, 1.2, [w.x + sx * (9 + q * 3.6), w.y + 30 - q * 2, gz + 8.6], LAMP, { glow: 1.6 });
    k.add(new THREE.CylinderGeometry(0.001, 1, 1, 4, 1), [w.x, w.y + 54 + 11, gz], ROOFS[1][0], { top: ROOFS[1][1], glow: 0.1, scale: [31, 22, 14], rot: [0, Math.PI / 4, 0] });
    L.glows.push({ p: [w.x, w.y + 16, gz + 18], size: 64, col: [1, 0.7, 0.34], k: 0.5 });
    L.halos.push({ p: [w.x, w.y + 43, gz + 11], size: 12, col: [1, 0.84, 0.52], k: 0.7 });
    // a great stair falling from the portal to the terrace
    for (let i = 0; i < 16; i++) k.box(19 - i * 0.3, 3.2, 5.4, [w.x, w.y - 10 - i * 3, gz + 9 + i * 3.4], mixc(STONE, STONE_LIT, 0.5), { top: STONE_LIT, glow: 0.03 });
    // where the road arrives: a lesser gate in the drum's left flank
    const a = -1.92;
    k.box(11, 20, 1.6, [w.x + Math.sin(a) * (w.R + 3.4), w.y - 14, w.z + Math.cos(a) * (w.R + 3.4)], LAMP, { glow: 1.5, rot: [0, a, 0] });
    L.glows.push({ p: [w.x + Math.sin(a) * (w.R + 10), w.y - 14, w.z + Math.cos(a) * (w.R + 10)], size: 30, col: [1, 0.72, 0.36], k: 0.45 });
  }
  // the hall on the middle ward: a long roof, a row of tall windows, a flèche
  {
    const w = WARDS[1];
    k.box(66, 36, 28, [w.x, w.y + 18, w.z - 4], STONE, { top: STONE_LIT, glow: 0.1 });
    k.add(new THREE.CylinderGeometry(0.001, 1, 1, 4, 1), [w.x, w.y + 36 + 14, w.z - 4], ROOFS[0][0], { top: ROOFS[0][1], glow: 0.1, scale: [48, 28, 21], rot: [0, Math.PI / 4, 0] });
    for (let i = -4; i <= 4; i++) {
      k.box(3.0, 20, 1.2, [w.x + i * 6.8, w.y + 17, w.z + 10.3], LAMP, { glow: 1.7 });
      k.add(new THREE.ConeGeometry(2.1, 4, 4), [w.x + i * 6.8, w.y + 28.6, w.z + 10.3], LAMP, { glow: 1.7, scale: [1, 1, 0.2], rot: [0, Math.PI / 4, 0] });
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
    k.add(new THREE.CylinderGeometry(4.8, 4.8, 1.2, 22), [w.x, w.y + 23, w.z + 4.3], [1, 0.8, 0.5], { glow: 1.6, rot: [Math.PI / 2, 0, 0] });
    for (const sx of [-1, 1]) k.box(2.5, 13, 1.2, [w.x + sx * 9.2, w.y + 11, w.z + 4.3], LAMP, { glow: 1.6 });
    L.halos.push({ p: [w.x, w.y + 23, w.z + 7], size: 11, col: [1, 0.86, 0.56], k: 0.7 });
  }
  // the keep, standing in the rock above the wards
  tower(3, 596, 26, 15, 112, { roof: 0, rh: 70, turrets: true });
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
    tower(P.x + Math.cos(a) * rr, y - 8, P.z + Math.sin(a) * rr, R, H, { roof: (Math.round(y) % 3) as 0 | 1 | 2 });
  }
  tower(P.x, P.y1 - 14, P.z, 7, 44, { roof: 0, rh: 48, turrets: true });
  L.halos.push({ p: [P.x, P.y1 + 86, P.z], size: 14, col: [1, 0.88, 0.6], k: 0.8 });
  // a watchtower on each of the lesser peaks
  PEAKS.slice(1).forEach((p, i) => {
    const lx = p.x + (p.lean?.[0] ?? 0);
    const lz = p.z + (p.lean?.[1] ?? 0);
    tower(lx, p.y1 - 10, lz, 5.4 - i * 0.2, 30, { roof: i % 3 });
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
    tower(Math.cos(a) * rr, 428 - (i % 2) * 10, Math.sin(a) * rr, 6 + r() * 2, 46 + r() * 26, { roof: i % 3 });
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
        tower(p.x, p.y - 8, p.z, 3.4 + r() * 1.6, 28 + r() * 18, { roof: i % 3 });
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
        for (const sx of [-1, 1]) k.box(1.0, 2.0, 0.8, [p.x + Math.sin(yaw) * (dp / 2) + Math.cos(yaw) * sx * w * 0.24, p.y + 3 + q * 4.6, p.z + Math.cos(yaw) * (dp / 2) - Math.sin(yaw) * sx * w * 0.24], LAMP, { glow: 1.6, rot: [0, yaw, 0] });
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
      tower(Math.cos(th) * rr, footOf(u) - 6, Math.sin(th) * rr, R, wallOf(u) + 20 + (n % 3 === 0 ? 14 : 0), { roof: n % 3 });
      u += (u > 1.3 ? 70 : 104) / (Math.PI * 2 * rhoOf(u));
      n++;
    }
    void rimOf;
  }
  L.glows.push({ p: [0, 560, 70], size: 380, col: [1, 0.66, 0.3], k: 0.3 });
  return { geo: k.build(), ...L, tips };
}
const mixc = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
