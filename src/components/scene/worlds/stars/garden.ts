import * as THREE from "three";
import { Kit, angel, pointsGeometry, rng, type Halo, type V3 } from "../kit";
import type { Lamp } from "../fairy/shared";
import { pathOf } from "../voyage";
import { linesGeometry, ribbonGeometry, softGeometry, type Seg, type Soft } from "./forms";
import { FIG_KINDS, constellation, makeGlobeGlass, makeStarRiver, makeWaveBand, riverGeometry } from "./parts";

// The first look of the Stars, brought back and placed: the glass globe and its halo and band of stars, the river
// of stars with the angel who walks on it, the gold strings with their worlds threaded on them, the bands of
// blue-green wave in the air, and the constellations that draw themselves. All at the size they were made, as
// things of a known measure standing beside the pyramids, in a deliberate order along the way and always to one
// side of it, so nothing crowds the route:
//   the globe, to the left of the first stretch; the strings and their worlds, a loose row beyond it; the river of
//   stars across the sky ahead, over the way, with the angel walking on it; the bands drifting at either hand;
//   the constellations well out to the sides.
export const GLOBE = { x: -640, z: 2350, r: 150 };
export const RIVER = { y: 440, z: 900, top: 44, fall: 84, x0: -1150, x1: 1150 };
const GOLD: V3 = [1.0, 0.82, 0.46];
const bandY = () => RIVER.y;

export function buildGarden(mobile: boolean, effects: number) {
  const r = rng(1908);
  const path = pathOf("stars").pts;
  const halos: Halo[] = [];
  const glows: Halo[] = [];
  const gy = GLOBE.r * 0.44;
  // ----- the globe, its halo, its girdle of lamps (they wake as the plane comes near) -----
  glows.push({ p: [GLOBE.x, gy + 10, GLOBE.z], size: GLOBE.r * 2.5, col: [0.5, 0.9, 0.64], k: 0.3 });
  glows.push({ p: [GLOBE.x, gy, GLOBE.z], size: GLOBE.r * 0.9, col: [1, 0.88, 0.5], k: 0.5 });
  const ring = (rad: number, tilt: THREE.Euler, wobble: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(a * 2) * wobble, Math.sin(a) * rad).applyEuler(tilt));
    }
    return pts;
  };
  const haloRing = ribbonGeometry(ring(GLOBE.r * 1.75, new THREE.Euler(0.16, 0, 0.1), 0), 80, { closed: true, seg: 160 });
  const globeLamps: Lamp[] = [{ p: [GLOBE.x, gy, GLOBE.z], size: GLOBE.r * 1.5, col: [0.5, 0.95, 0.8], k: 0.22, at: 900 }];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    globeLamps.push({ p: [GLOBE.x + Math.cos(a) * GLOBE.r * 1.02, gy + Math.sin(a * 2) * 6, GLOBE.z + Math.sin(a) * GLOBE.r * 1.02], size: 8, col: [1, 0.9, 0.6], k: 0.8, at: 820 - i * 16 });
  }

  // ----- worlds hanging in the air in a loose row beyond the globe (no strings: they hang of themselves) -----
  const threads: Seg[] = [];
  const orbs: Soft[] = [];
  const rings: { p: V3; rad: number; tilt: number }[] = [];
  const nT = mobile ? 5 : 8;
  for (let i = 0; i < nT; i++) {
    const x = -1100 + (i / (nT - 1)) * 2200 + (r() - 0.5) * 60;
    if (Math.abs(x) < 220) continue;
    const z = RIVER.z + RIVER.top / 2 + 1;
    const y1 = RIVER.y - RIVER.fall * 0.5;
    const n = 2 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) {
      const y = 50 + r() * (y1 - 110);
      const rad = 6 + r() * r() * 22;
      const pick = r();
      const col: V3 = pick < 0.5 ? [0.95, 0.5, 0.2] : pick < 0.75 ? [0.9, 0.72, 0.36] : pick < 0.9 ? [0.86, 0.5, 0.5] : [0.3, 0.46, 0.9];
      orbs.push({ p: [x, y, z], r: rad, col, glow: 0.22, seed: r() });
      glows.push({ p: [x, y, z], size: rad * 4.2, col, k: 0.5 });
      if (rad > 14) rings.push({ p: [x, y, z], rad: rad * 1.7, tilt: 1.2 + r() * 0.5 });
    }
  }
  // free worlds hanging out to either hand, small and many near, larger far off
  for (let i = 0; i < (mobile ? 12 : 26); i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (500 + r() * 1700);
    const z = 3000 - r() * 3400;
    const y = 80 + r() * 700;
    const rad = 3 + r() * r() * 12;
    if (Math.abs(x) < 260 && z > 400) continue;
    const pick = r();
    const col: V3 = pick < 0.45 ? [0.95, 0.56, 0.24] : pick < 0.7 ? [0.92, 0.8, 0.5] : pick < 0.85 ? [0.5, 0.82, 0.7] : [0.36, 0.5, 0.95];
    orbs.push({ p: [x, y, z], r: rad, col, glow: 0.3, seed: r() });
    if (i % 2 === 0) glows.push({ p: [x, y, z], size: rad * 4.5, col, k: 0.42 });
  }

  // ----- bands of pale blue-green crossing the air at either hand -----
  const bands: { geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial }[] = [];
  const nB = mobile ? 3 : 5;
  for (let w = 0; w < nB; w++) {
    const side = w % 2 ? 1 : -1;
    const y = 120 + w * 55 + r() * 30;
    const z = 2800 - w * 380;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(side * (420 + i * 150), y + Math.sin(i * 0.7 + w * 1.7) * 30, z + Math.cos(i * 0.41 + w) * 90));
    const wide = 60 + r() * 80;
    const { geo } = ribbonGeometry(pts, (t) => wide * (0.5 + 0.5 * Math.sin(t * Math.PI)), { seg: 120, roll: (t) => 0.9 + Math.sin(t * 5 + w) * 0.5 });
    const green = w % 3 !== 2;
    bands.push({ geo, mat: makeWaveBand({ a: green ? [0.04, 0.3, 0.26] : [0.08, 0.14, 0.42], b: green ? [0.3, 0.6, 0.42] : [0.3, 0.44, 0.8], thread: w % 2 ? [0.95, 0.86, 0.5] : [0.6, 0.95, 0.8], lines: 5 + (w % 3) * 2, seed: w * 1.37, gain: 0.8 }) });
  }

  // ----- constellations well out at the sides: they draw themselves as the plane comes near -----
  const segs: Seg[] = [];
  const figs: { c: THREE.Vector3; size: number }[] = [];
  const figStars: V3[] = [];
  const nF = mobile ? 5 : 8;
  const tan = new THREE.Vector3();
  for (let i = 0; i < nF; i++) {
    const pi = Math.floor((0.04 + (i / nF) * 0.8) * (path.length - 2));
    const p = path[pi];
    tan.subVectors(path[pi + 1], p).normalize();
    const side = i % 2 ? 1 : -1;
    const off = 700 + r() * 500;
    const size = 90 + r() * 80;
    const c = new THREE.Vector3(p.x - tan.z * side * off, 260 + r() * 360, p.z + tan.x * side * off);
    const pick = r();
    constellation(i % FIG_KINDS, figs.length, c, p, size, segs, figStars, pick < 0.6 ? [1, 0.86, 0.52] : pick < 0.85 ? [0.92, 0.96, 1] : [0.55, 0.72, 1]);
    figs.push({ c, size });
  }
  for (const s of figStars) halos.push({ p: s, size: 8 + r() * 8, col: [1, 0.95, 0.82], k: 0.75 });

  // ----- star-motes streaming along the way, toward the door -----
  const motes = pointsGeometry(
    mobile ? 300 : 700,
    (i, q) => {
      const t = q();
      const p = path[Math.min(path.length - 1, Math.floor(t * (path.length - 1)))];
      return [p.x + (q() - 0.5) * 70, p.y + 4 + q() * 40, p.z + (q() - 0.5) * 70, 0.8 + q() * 1.6];
    },
    4242,
  );

  return {
    threads: linesGeometry(threads),
    orbs: softGeometry(orbs, mobile ? 1 : 2),
    rings,
    ringGeo: new THREE.TorusGeometry(1, 0.03, 5, 72),
    globeGeo: new THREE.SphereGeometry(GLOBE.r, 64, 40),
    globeMat: makeGlobeGlass(GLOBE.r),
    haloRing: haloRing.geo,
    haloRingMat: makeWaveBand({ a: [0.1, 0.4, 0.3], b: [0.5, 0.8, 0.5], thread: [1, 0.9, 0.55], lines: 9, seed: 4.2, gain: 1.3 }),
    bands,
    lines: linesGeometry(segs),
    figs,
    globeLamps,
    globeCentre: [GLOBE.x, gy, GLOBE.z] as V3,
    gy,
    motes,
    halos,
    glows,
  };
}
