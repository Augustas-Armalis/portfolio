import * as THREE from "three";
import { useSyncExternalStore } from "react";
import { roadX, roadY, HOME_GATE_Z } from "../flightPath";
import { airState, arrivalHours, mixSky, skyState, type Air, type SkyState } from "../sky";

// Angelų takas, the path of angels. The paper plane's flight is a pilgrimage
// along a path of light between worlds, and every world is one painting by
// M. K. Čiurlionis built in the round. Only one world exists at a time: the
// plane passes a gate, cloud closes over it, the world behind is let go, the
// next is built and warmed under the cloud, and the cloud opens on a new sky.
//
// This file is the map and the state of that journey; nothing here draws.
//
// The desk's field is the first world and sits at the origin. Every other
// world is laid out round its own centre, ORIGIN, far enough from the desk
// that neither can see the other (the camera's far plane is 3000 m), near
// enough that 32-bit floats still resolve a quarter of a millimetre.

export type WorldId = "home" | "sun" | "stars" | "rex" | "fairy" | "paradise" | "gate" | "sea" | "funeral" | "kings";
export const WORLD_ORDER: WorldId[] = ["home", "sun", "stars", "rex", "fairy", "paradise", "gate", "sea", "funeral", "kings"];
// Fairy Tale of the Kings: where the two kings stand, and the small lit world they hold between their hands
export const KINGS = { z: -170, domeY: 70, domeR: 30 };
export const ORIGIN = new THREE.Vector3(-2500, 0, -2700);

// ---------- the ground ----------
// One analytic height field per world: a sum of sine waves, round hills (or
// hollows) and a rim. The same numbers are written out as GLSL, so the grass,
// the trees, the landmarks and the plane's clearance all agree to the millimetre.
export type Terrain = {
  base: number;
  sines: [kx: number, kz: number, phase: number, amp: number][];
  bumps: [x: number, z: number, radius: number, height: number][];
  rim: [r0: number, r1: number, height: number];
};
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function heightAt(t: Terrain, x: number, z: number) {
  let h = t.base;
  for (const s of t.sines) h += s[3] * Math.sin(s[0] * x + s[1] * z + s[2]);
  for (const b of t.bumps) {
    const dx = x - b[0];
    const dz = z - b[1];
    h += b[3] * Math.exp(-(dx * dx + dz * dz) / (b[2] * b[2]));
  }
  if (t.rim[2] !== 0) h += t.rim[2] * sstep(t.rim[0], t.rim[1], Math.hypot(x, z));
  return h;
}
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
export function heightGLSL(t: Terrain | null, name = "terrainH") {
  if (!t) return `float ${name}(vec2 p){ return 0.0; }\n`;
  let s = `float ${name}(vec2 p){\n  float h = ${f(t.base)};\n`;
  for (const w of t.sines) s += `  h += ${f(w[3])} * sin(${f(w[0])} * p.x + ${f(w[1])} * p.y + ${f(w[2])});\n`;
  for (const b of t.bumps) s += `  { vec2 d = p - vec2(${f(b[0])}, ${f(b[1])}); h += ${f(b[3])} * exp(-dot(d, d) / ${f(b[2] * b[2])}); }\n`;
  if (t.rim[2] !== 0) s += `  h += ${f(t.rim[2])} * smoothstep(${f(t.rim[0])}, ${f(t.rim[1])}, length(p));\n`;
  return s + "  return h;\n}\n";
}

// ---------- a world ----------
// Everything is in the world's own coordinates (metres from its centre, the
// plane arrives flying toward -z).
export type Obstacle = { x: number; z: number; r: number; h: number; bell?: boolean }; // something tall the plane slides round: radius at the ground, height
export type CanvasSpot = { painting: string; x: number; z: number; yaw: number; h?: number };
export type WorldDef = {
  id: WorldId;
  title: string;
  year: string;
  music: string;
  place: "meadow" | "forest" | "sea" | "sky" | "none";
  air: Air | null; // null: the live sky of the visitor's own hour
  fog: [density: number, heightFalloff: number];
  terrain: Terrain | null;
  water: number | null; // the level of still water, if the world has any
  centre: [number, number];
  radius: number; // beyond this the air turns the plane back
  ceil: number;
  entry: { x: number; z: number; above: number; yaw: number };
  gate: { x: number; z: number; above: number; yaw: number } | null; // the way onward; the last world has none
  path: [x: number, z: number, above: number][]; // the path of light, from the entry to the gate
  loop?: boolean;
  obstacles: Obstacle[];
  canvases: CanvasSpot[];
};

const T0: Terrain = { base: 0, sines: [], bumps: [], rim: [1, 2, 0] };

// Colours below are scene-linear, written before the lens (ACES and the grade) sees them.
// The Sonata of the Sun's aqueducts: each crosses the path of light at `c`, an arch centred on it; `u` runs along
// the bridge, `n` arches of `w` metres, `H` high. Their piers by the path are obstacles (below); worlds/Sun.tsx builds them.
export const SUN_BRIDGES: { c: [number, number]; u: [number, number]; n: number; w: number; H: number; tiers: number }[] = [
  { c: [8, 150], u: [0.9615, -0.2747], n: 9, w: 80, H: 150, tiers: 1 },
  { c: [-80, 15], u: [0.64, -0.768], n: 11, w: 90, H: 200, tiers: 2 },
];

const AIR: Record<Exclude<WorldId, "home">, Air> = {
  // Sonata of the Sun: a field of dull gold under a gold-green air; one great drawn sun low ahead (the world's
  // GreatSun: the sky's own disc is not drawn) behind the bells and arches, so they stand as shade with a thread of
  // gold round every edge and its rays pour through them
  sun: {
    label: "Sonata of the Sun",
    zenith: [0.3, 0.35, 0.36],
    upper: [0.56, 0.5, 0.27],
    horizon: [0.72, 0.56, 0.22],
    glow: [1.0, 0.72, 0.26],
    amb: [0.42, 0.44, 0.56],
    key: [1.0, 0.82, 0.5],
    keyI: 2.1,
    sunAz: 12,
    sunEl: 13,
    keyAz: 12,
    keyEl: 19,
    cloudLit: [0.7, 0.6, 0.3],
    cloudShade: [0.4, 0.4, 0.26],
    night: 0,
    exposure: 0.86,
    fx: [0.0, 0.55, 0.0, 0],
  },
  // Sonata of the Stars: a deep blue-green night; the light is gold and white, and comes from the pyramid's point
  stars: {
    label: "Sonata of the Stars",
    zenith: [0.003, 0.011, 0.03],
    upper: [0.006, 0.03, 0.05],
    horizon: [0.014, 0.062, 0.07],
    glow: [0.6, 0.52, 0.3],
    amb: [0.13, 0.23, 0.26],
    key: [1.0, 0.9, 0.66],
    keyI: 0.95,
    sunAz: 0,
    sunEl: -30,
    keyAz: 0,
    keyEl: 46,
    cloudLit: [0.1, 0.2, 0.2],
    cloudShade: [0.01, 0.03, 0.05],
    night: 1,
    exposure: 1.3,
    fx: [0.0, 0.0, 0.0, 1],
  },
  // Rex: umber dusk with amber low in it and a green-gold cast in the shade
  rex: {
    label: "Rex",
    zenith: [0.017, 0.015, 0.014],
    upper: [0.07, 0.052, 0.036],
    horizon: [0.33, 0.215, 0.13],
    glow: [0.95, 0.6, 0.3],
    amb: [0.25, 0.225, 0.165],
    key: [1.0, 0.8, 0.52],
    keyI: 1.25,
    sunAz: -40,
    sunEl: 26,
    keyAz: -30,
    keyEl: 36,
    cloudLit: [0.5, 0.36, 0.24],
    cloudShade: [0.08, 0.065, 0.05],
    night: 0.5,
    exposure: 1.0,
    fx: [0.25, 0.6, 0.0, 0.5],
  },
  // Fairy Tale: a high clear afternoon, turquoise, the sun low in a fan of rays
  fairy: {
    label: "Fairy Tale",
    zenith: [0.1, 0.3, 0.42],
    upper: [0.22, 0.47, 0.52],
    horizon: [0.5, 0.6, 0.55],
    glow: [1.0, 0.86, 0.56],
    amb: [0.36, 0.44, 0.52],
    key: [1.0, 0.88, 0.66],
    keyI: 2.9,
    sunAz: 34,
    sunEl: 24,
    cloudLit: [1.2, 1.04, 0.78],
    cloudShade: [0.74, 0.68, 0.64],
    night: 0,
    exposure: 0.88,
    fx: [0.0, 0.25, 1.0, 0],
  },
  // Paradise: yellow-olive noon under rows of cloud
  paradise: {
    label: "Paradise",
    zenith: [0.36, 0.37, 0.2],
    upper: [0.52, 0.5, 0.25],
    horizon: [0.6, 0.55, 0.27],
    glow: [1.0, 0.9, 0.6],
    amb: [0.5, 0.5, 0.4],
    key: [1.0, 0.94, 0.74],
    keyI: 2.5,
    sunAz: 60,
    sunEl: 48,
    cloudLit: [1.0, 0.88, 0.5],
    cloudShade: [0.37, 0.36, 0.25],
    night: 0,
    exposure: 0.9,
    fx: [0.9, 1.5, 0.0, 0],
  },
  // the mountain gate under the sky of "Offering": dull gold going down behind dark rock
  gate: {
    label: "Offering",
    zenith: [0.2, 0.2, 0.15],
    upper: [0.44, 0.37, 0.18],
    horizon: [0.7, 0.52, 0.23],
    glow: [1.0, 0.66, 0.3],
    amb: [0.34, 0.31, 0.36],
    key: [1.0, 0.74, 0.46],
    keyI: 2.2,
    sunAz: 4,
    sunEl: 5,
    keyAz: 14,
    keyEl: 16,
    cloudLit: [0.95, 0.76, 0.46],
    cloudShade: [0.2, 0.17, 0.17],
    night: 0,
    exposure: 0.95,
    fx: [0.6, 1.3, 0.0, 0],
  },
  // Tranquility: a pale, still, greenish-gold evening, the sky and the water nearly one field, a warmth low on the
  // right beyond the island's head
  sea: {
    label: "Tranquility",
    zenith: [0.33, 0.38, 0.29],
    upper: [0.4, 0.43, 0.3],
    horizon: [0.47, 0.48, 0.32],
    glow: [0.66, 0.5, 0.3],
    amb: [0.46, 0.48, 0.38],
    key: [1.0, 0.88, 0.66],
    keyI: 0.8,
    sunAz: 34,
    sunEl: 1,
    keyAz: 30,
    keyEl: 18,
    cloudLit: [0.74, 0.64, 0.4],
    cloudShade: [0.4, 0.42, 0.32],
    night: 0,
    exposure: 0.95,
    fx: [0.0, 0.0, 0.0, 0.3],
  },
  // Funeral Symphony VI: a vast deep-ultramarine night, a thin moon, the procession's hoods catching a faint gold
  funeral: {
    label: "Funeral Symphony VI",
    zenith: [0.006, 0.012, 0.07],
    upper: [0.014, 0.03, 0.14],
    horizon: [0.04, 0.07, 0.2],
    glow: [0.62, 0.55, 0.32],
    amb: [0.07, 0.11, 0.26],
    key: [0.95, 0.84, 0.5],
    keyI: 0.95,
    sunAz: 0,
    sunEl: -24,
    keyAz: 38,
    keyEl: 30,
    cloudLit: [0.12, 0.14, 0.26],
    cloudShade: [0.02, 0.03, 0.08],
    night: 0.8,
    exposure: 1.35,
    fx: [0.0, 0.0, 0.0, 0.55],
  },
  // Fairy Tale of the Kings: a night wood, brown-black and teal; the only strong light is the little world
  kings: {
    label: "Karalių pasaka",
    zenith: [0.004, 0.011, 0.02],
    upper: [0.008, 0.026, 0.036],
    horizon: [0.014, 0.04, 0.046],
    glow: [0.9, 0.45, 0.2],
    amb: [0.06, 0.1, 0.11],
    key: [1.0, 0.68, 0.38],
    keyI: 0.45,
    sunAz: 0,
    sunEl: -30,
    keyAz: 0,
    keyEl: 18,
    cloudLit: [0.03, 0.06, 0.07],
    cloudShade: [0.006, 0.014, 0.018],
    night: 1,
    exposure: 1.3,
    fx: [0.0, 0.0, 0.0, 1],
  },
};

export const WORLDS: Record<WorldId, WorldDef> = {
  home: {
    id: "home",
    title: "Angelų takas",
    year: "",
    music: "road",
    place: "meadow",
    air: null,
    fog: [0.004, 0.05],
    terrain: T0,
    water: null,
    centre: [0, -120],
    radius: 300,
    ceil: 70,
    entry: { x: 1.4, z: -40, above: 6, yaw: 0 },
    gate: { x: roadX(HOME_GATE_Z), z: HOME_GATE_Z, above: roadY(HOME_GATE_Z), yaw: 0 },
    path: [], // follows the road: see pathOf()
    obstacles: [],
    canvases: [],
  },
  sun: {
    id: "sun",
    title: "Sonata of the Sun",
    year: "1907",
    music: "sun",
    place: "sky",
    air: AIR.sun,
    fog: [0.0005, 0.011],
    terrain: {
      base: 2,
      sines: [
        [0.011, 0.004, 0.4, 5],
        [-0.006, 0.013, 1.9, 4],
        [0.023, 0.017, 3.1, 1.6],
        [0.031, -0.027, 0.7, 0.9],
      ],
      bumps: [
        [0, -150, 190, 16],
        [-260, 120, 150, 10],
        [280, 40, 160, 12],
      ],
      rim: [520, 900, 40],
    },
    water: null,
    centre: [0, -40],
    radius: 610,
    ceil: 260,
    entry: { x: 0, z: 470, above: 16, yaw: 0 },
    gate: { x: 150, z: -470, above: 20, yaw: -0.25 },
    path: [
      [0, 470, 16],
      [4, 390, 14],
      [8, 310, 13],
      [18, 250, 14],
      [20, 208, 15],
      [8, 150, 15],
      [-12, 96, 17],
      [-50, 40, 22],
      [-110, -10, 30],
      [-180, -90, 40],
      [-172, -192, 48],
      [-120, -320, 50],
      [40, -345, 42],
      [120, -400, 28],
      [150, -470, 20],
      [158, -502, 20],
    ],
    obstacles: [
      // the bells (see worlds/Sun.tsx BELLS)
      { x: 30, z: -190, r: 84, h: 470, bell: true },
      { x: -92, z: -120, r: 62, h: 330, bell: true },
      { x: 124, z: -92, r: 54, h: 300, bell: true },
      { x: -10, z: -40, r: 70, h: 120, bell: true },
      { x: -210, z: -260, r: 46, h: 240, bell: true },
      { x: 210, z: -250, r: 42, h: 210, bell: true },
      // the towers of the two gatehouses on the way in (Sun.tsx GATEHOUSES)
      { x: 55.7, z: 203.7, r: 13, h: 132 },
      { x: -15.7, z: 212.3, r: 13, h: 132 },
      { x: 23.6, z: 80.1, r: 14, h: 142 },
      { x: -47.6, z: 111.9, r: 14, h: 142 },
      // the piers either side of the way through each aqueduct
      ...SUN_BRIDGES.flatMap((b) => [-1, 1].map((sd) => ({ x: b.c[0] + b.u[0] * sd * b.w * 0.5, z: b.c[1] + b.u[1] * sd * b.w * 0.5, r: b.w * 0.14 + 2, h: b.H + 12 }))),
    ],
    canvases: [{ painting: "sun-allegro", x: -31, z: 302, yaw: 0.65 }],
  },
  stars: {
    id: "stars",
    title: "Sonata of the Stars",
    year: "1908",
    music: "stars",
    place: "none",
    air: AIR.stars,
    fog: [0.00042, 0.0055],
    // a sea of long waves; the pyramid stands on a swell of it (worlds/Stars.tsx PYR)
    terrain: {
      base: 0,
      sines: [
        [0.004, 0.031, 0.3, 8],
        [0.009, 0.017, 2.2, 6],
        [-0.014, 0.007, 1.1, 3],
        [0.005, -0.06, 4.0, 1.6],
      ],
      bumps: [[0, -420, 380, 26]],
      rim: [1200, 1800, 60],
    },
    water: null,
    centre: [0, -150],
    radius: 1000,
    ceil: 760,
    entry: { x: 0, z: 760, above: 34, yaw: 0 },
    // at the pyramid's point, in the pale disc behind the angel (worlds/Stars.tsx)
    gate: { x: 90, z: -520, above: 850, yaw: 0.0555 },
    // in over the waves past the two paintings, round the glass globe of the Andante, then up the winding river of
    // stars to where it runs level across the sky; along it past the angel who walks there, the pyramid rising
    // through it from below; out and round in a rising turn, and straight in to the angel at the point and the light
    path: [
      [0, 760, 34],
      [6, 670, 20],
      [-10, 590, 17],
      [-60, 500, 26],
      [-130, 420, 38],
      [-155, 300, 52],
      [-150, 140, 72],
      [-230, -40, 110],
      [-420, -110, 165],
      [-620, -40, 225],
      [-810, -80, 290],
      [-920, -190, 345],
      [-880, -280, 395],
      [-720, -292, 428],
      [-520, -290, 438],
      [-300, -286, 440],
      [-90, -262, 444],
      [60, -240, 452],
      [220, -200, 484],
      [360, -90, 544],
      [380, 80, 612],
      [270, 205, 676],
      [130, 200, 728],
      [118, 0, 786],
      [105, -250, 832],
      [90, -520, 850],
      [88, -562, 850],
    ],
    obstacles: [
      { x: -330, z: 150, r: 150, h: 220, bell: true },
      { x: 0, z: -420, r: 34, h: 1000 },
    ],
    canvases: [
      { painting: "stars-allegro", x: -56, z: 585, yaw: 1.1 },
      { painting: "stars-andante", x: -59, z: 442, yaw: 0.02 },
    ],
  },
  rex: {
    id: "rex",
    title: "Rex",
    year: "1909",
    music: "rex",
    place: "sea",
    air: AIR.rex,
    fog: [0.00019, 0.0028],
    terrain: {
      base: -7,
      sines: [
        [0.021, 0.013, 0.2, 0.8],
        [-0.014, 0.027, 1.4, 0.6],
      ],
      bumps: [
        [-78, 962, 64, 14.5],
        [-190, 890, 60, 10.5],
        [210, 920, 70, 11],
      ],
      rim: [1, 2, 0],
    },
    water: 0,
    centre: [0, -400],
    radius: 1750,
    ceil: 720,
    entry: { x: 0, z: 1150, above: 22, yaw: 0 },
    // high beyond his crown, where the path leaves through the upper shells
    gate: { x: -380, z: -1380, above: 740, yaw: 0.611 },
    // in low over the water for more than a kilometre, the whole of him standing in the haze ahead; past the
    // painting to the altar and the blade of light; then once round him, rising all the way, past the globe at his
    // feet, his body and his shoulders, through the shells of his sky one after another; across his face, close
    // round the crown and its flames, and out behind him through the upper air
    path: [
      [0, 1150, 22],
      [5, 1040, 18],
      [16, 930, 16],
      [26, 820, 16],
      [36, 600, 18],
      [44, 380, 20],
      [56, 160, 26],
      [80, -30, 36],
      [150, -140, 52],
      [297, -203, 80],
      [414, -427, 150],
      [381, -677, 225],
      [210, -864, 300],
      [-37, -918, 380],
      [-270, -822, 455],
      [-406, -609, 530],
      [-395, -356, 605],
      [-241, -156, 680],
      [-22, -81, 745],
      [172, -254, 800],
      [290, -422, 845],
      [272, -627, 880],
      [150, -760, 890],
      [-60, -960, 860],
      [-240, -1180, 800],
      [-380, -1380, 740],
      [-403, -1413, 740],
    ],
    // the dark sphere and the king (worlds/Rex.tsx KS)
    obstacles: [
      { x: 0, z: -500, r: 279, h: 279, bell: true },
      { x: 0, z: -500, r: 210, h: 884 },
    ],
    canvases: [{ painting: "rex", x: -72, z: 962, yaw: 0.72 }],
  },
  fairy: {
    id: "fairy",
    title: "Fairy Tale",
    year: "1909",
    music: "fairy",
    place: "sky",
    air: AIR.fairy,
    fog: [0.0003, 0.017],
    terrain: {
      base: 4,
      sines: [
        [0.009, 0.006, 0.5, 7],
        [-0.007, 0.012, 2.3, 6],
        [0.021, 0.015, 1.3, 2.2],
        [0.033, -0.024, 3.7, 1.0],
      ],
      bumps: [
        [0, -80, 210, 14],
        [-330, 120, 140, 20],
        [330, 200, 150, 16],
        // the headland the plane comes in over: the mountain is first seen from its height, across the valley
        [10, 440, 185, 132],
      ],
      rim: [520, 900, -70],
    },
    water: null,
    centre: [0, -40],
    radius: 620,
    ceil: 470,
    entry: { x: 0, z: 480, above: 30, yaw: 0 },
    gate: { x: -170, z: -460, above: 40, yaw: 0.3 },
    // in past the painting, then round the mountain the way its own road winds, climbing to the castle, and down again to the gate
    path: [
      [0, 480, 30],
      [8, 400, 24],
      [-12, 320, 40],
      [-76, 226, 98],
      [-186, 104, 104],
      [-232, -70, 118],
      [-150, -240, 150],
      [10, -292, 178],
      [160, -200, 196],
      [180, -40, 186],
      [100, 70, 150],
      [-50, 60, 110],
      [-170, -90, 80],
      [-205, -300, 56],
      [-170, -460, 40],
      [-161, -490, 40],
    ],
    // (heights raised with the mountain: worlds/Fairy.tsx LIFT)
    obstacles: [
      { x: 0, z: -80, r: 200, h: 119, bell: true },
      { x: 0, z: -80, r: 150, h: 182, bell: true },
      { x: 0, z: -72, r: 66, h: 271 },
      { x: 6, z: -90, r: 48, h: 425 },
    ],
    canvases: [{ painting: "fairy-tale", x: 44, z: 372, yaw: -0.5 }],
  },
  paradise: {
    id: "paradise",
    title: "Paradise",
    year: "1909",
    music: "paradise",
    place: "meadow",
    air: AIR.paradise,
    fog: [0.0002, 0.01],
    // the lake is one round hollow: its shore is a circle of 302 m about (-200, 100), and the steps are struck from the same centre
    terrain: {
      base: 4,
      sines: [
        [0.013, 0.009, 0.6, 0.3],
        [-0.011, 0.019, 2.0, 0.25],
        [0.037, 0.021, 1.2, 0.1],
      ],
      bumps: [
        [-200, 100, 270, -14],
        [-520, 60, 260, -5],
        [470, -40, 150, 34],
        [330, -400, 200, 16],
      ],
      rim: [600, 950, 30],
    },
    water: 0,
    centre: [0, -40],
    radius: 625,
    ceil: 220,
    entry: { x: 60, z: 480, above: 16, yaw: 0 },
    gate: { x: -30, z: -470, above: 22, yaw: 0.15 },
    // down the meadow to the water, along the great curve of the shore past the one who bends to the flower, over the foot of the steps and on
    path: [
      [60, 480, 16],
      [62, 410, 13],
      [72, 340, 11],
      [100, 270, 10],
      [132, 190, 9],
      [146, 100, 9],
      [138, 10, 10],
      [112, -80, 12],
      [74, -160, 16],
      [34, -250, 24],
      [-8, -350, 26],
      [-30, -470, 22],
      [-36, -502, 22],
    ],
    obstacles: [],
    canvases: [{ painting: "paradise", x: 110, z: 392, yaw: -0.7 }],
  },
  gate: {
    id: "gate",
    title: "Offering",
    year: "1909",
    music: "gate",
    place: "forest",
    air: AIR.gate,
    fog: [0.00012, 0.016],
    terrain: {
      base: 0,
      sines: [
        [0.012, 0.007, 0.9, 3.4],
        [-0.009, 0.017, 2.6, 2.6],
        [0.027, 0.019, 0.3, 1.0],
      ],
      bumps: [
        [0, -330, 230, 26],
        [-300, 150, 180, 48],
        [300, 170, 180, 44],
        [-96, -150, 60, 8],
        [74, -236, 40, 10],
      ],
      rim: [560, 900, 50],
    },
    water: null,
    centre: [0, 0],
    radius: 520,
    ceil: 340,
    entry: { x: 0, z: 430, above: 20, yaw: 0 },
    gate: { x: 0, z: -330, above: 40, yaw: 0 },
    path: [
      [0, 430, 20],
      [-8, 340, 16],
      [16, 250, 14],
      [22, 150, 16],
      [-4, 50, 20],
      [-16, -70, 26],
      [-4, -200, 34],
      [0, -330, 40],
      [0, -372, 40],
    ],
    obstacles: [
      // the two leaning mountains (Gate.tsx PEAKS): the plane meets only their feet
      { x: -250, z: -330, r: 165, h: 300, bell: true },
      { x: 250, z: -330, r: 165, h: 280, bell: true },
      // the terrace and its colossal angel
      { x: -100, z: -152, r: 44, h: 140 },
      { x: 74, z: -236, r: 14, h: 24 },
    ],
    canvases: [{ painting: "offering", x: -30, z: 268, yaw: 0.42 }],
  },
  sea: {
    id: "sea",
    title: "Tranquility",
    year: "1904",
    music: "sea",
    place: "sea",
    air: AIR.sea,
    fog: [0.00022, 0.004],
    // no land at all: the glass of the bay, and the island (worlds/Sea.tsx) lying across it
    terrain: null,
    water: 0,
    centre: [200, -260],
    radius: 960,
    ceil: 260,
    entry: { x: 10, z: 500, above: 12, yaw: 0 },
    // behind the island, on dark water: not seen until the plane has rounded the spit under the head
    gate: { x: 520, z: -900, above: 22, yaw: Math.PI / 2 },
    // out over the glass toward the whole island, down the eyes' paths to its face, along the face under the
    // head with the eyes beside the plane, round the low spit and back behind it to the way on
    path: [
      [10, 500, 12],
      [24, 400, 10],
      [50, 260, 9],
      [100, 100, 9],
      [170, -60, 10],
      [250, -230, 12],
      [330, -380, 14],
      [440, -470, 15],
      [580, -520, 16],
      [720, -590, 18],
      [790, -700, 20],
      [760, -820, 21],
      [650, -890, 22],
      [520, -900, 22],
      [470, -900, 22],
    ],
    // the island (worlds/Sea.tsx ISLAND): its head, its back and its spit, as bells along it
    obstacles: [
      { x: 400, z: -640, r: 125, h: 235, bell: true },
      { x: 260, z: -640, r: 95, h: 160, bell: true },
      { x: 90, z: -640, r: 70, h: 95, bell: true },
      { x: -120, z: -640, r: 55, h: 70, bell: true },
      { x: -330, z: -640, r: 40, h: 40, bell: true },
      { x: 540, z: -640, r: 55, h: 70, bell: true },
    ],
    canvases: [{ painting: "tranquility", x: -26, z: 330, yaw: 0.6 }],
  },
  funeral: {
    id: "funeral",
    title: "Laidotuvių simfonija VI",
    year: "1903",
    music: "funeral",
    place: "none",
    air: AIR.funeral,
    fog: [0.0005, 0.016],
    // dark hills the road winds over and along, a great dark mountain to the left and a cliff to the right, as in the picture
    terrain: {
      base: 2,
      sines: [
        [0.009, 0.006, 0.4, 9],
        [-0.007, 0.011, 2.1, 7],
        [0.019, 0.014, 1.2, 2.6],
        [0.031, -0.023, 3.3, 1.1],
      ],
      bumps: [
        [-420, -160, 230, 150],
        [430, -40, 200, 120],
        [-300, 300, 150, 40],
        [260, 320, 150, 34],
        [0, -470, 110, 40],
      ],
      rim: [600, 950, 60],
    },
    water: null,
    centre: [0, 0],
    radius: 640,
    ceil: 220,
    entry: { x: 0, z: 500, above: 18, yaw: 0 },
    gate: { x: 0, z: -470, above: 16, yaw: 0 },
    // low along the road, over the procession, as it snakes over the hills and along the cliff edges to the pass
    path: [
      [0, 500, 18],
      [30, 400, 15],
      [-50, 310, 14],
      [-150, 240, 14],
      [-130, 140, 14],
      [-10, 90, 14],
      [120, 40, 14],
      [170, -60, 14],
      [80, -150, 15],
      [-70, -180, 15],
      [-150, -270, 16],
      [-90, -370, 16],
      [0, -430, 16],
      [0, -470, 16],
      [0, -505, 16],
    ],
    // the two cypresses at the pass and the rock of the cave (worlds/Funeral.tsx)
    obstacles: [
      { x: -22, z: -440, r: 4, h: 44 },
      { x: 22, z: -446, r: 4, h: 40 },
    ],
    canvases: [{ painting: "funeral-vi", x: -46, z: 430, yaw: 0.6 }],
  },
  kings: {
    id: "kings",
    title: "Karalių pasaka",
    year: "1909",
    music: "kings",
    place: "none",
    air: AIR.kings,
    fog: [0.00042, 0.003],
    terrain: {
      base: 0,
      sines: [
        [0.017, 0.011, 0.4, 1.6],
        [-0.012, 0.021, 1.9, 1.2],
        [0.041, 0.033, 2.7, 0.4],
      ],
      bumps: [[0, KINGS.z, 150, 5]],
      rim: [620, 1000, 30],
    },
    water: null,
    centre: [0, 120],
    radius: 520,
    ceil: 150,
    entry: { x: 0, z: 540, above: 13, yaw: 0 },
    gate: null,
    // up the aisle between the great trunks, rising to the height of the kings' hands, and between them into the light
    // low and straight, so the kings stand over the plane like hills for the whole of the approach; only at the
    // last does it climb to their hands
    path: [
      [0, 540, 13],
      [5, 470, 14],
      [10, 400, 15],
      [6, 330, 16],
      [0, 260, 18],
      [0, 190, 20],
      [0, 120, 24],
      [0, 50, 31],
      [0, -20, 42],
      [0, -70, 55],
      [0, -108, 68],
      [0, KINGS.z + KINGS.domeR + 5, KINGS.domeY + KINGS.domeR * 0.3],
      [0, KINGS.z, KINGS.domeY + KINGS.domeR * 0.28],
      [0, KINGS.z - 40, KINGS.domeY + KINGS.domeR * 0.28],
    ],
    obstacles: [
      { x: -114, z: KINGS.z, r: 60, h: 190 },
      { x: 114, z: KINGS.z, r: 60, h: 190 },
    ],
    canvases: [{ painting: "kings", x: -30, z: 372, yaw: 0.46 }],
  },
};

// a painting's standing wall is a thing to fly round, like any other
for (const def of Object.values(WORLDS)) for (const c of def.canvases) def.obstacles.push({ x: c.x, z: c.z, r: 12, h: 36 });

export const originOf = (id: WorldId) => (id === "home" ? ZERO : ORIGIN);
const ZERO = new THREE.Vector3();

// ground (or water) height under a point given in a world's own coordinates
export function groundAt(def: WorldDef, x: number, z: number) {
  const h = def.terrain ? heightAt(def.terrain, x, z) : 0;
  return def.water !== null ? Math.max(h, def.water) : h;
}

// ---------- the kings' wood: how the plane comes to them ----------
// All in the world's own coordinates; `ahead` is how far the kings still are.
const smooth01 = (t: number) => sstep(0, 1, t);
export const kingsDome = () => {
  const y = groundAt(WORLDS.kings, 0, KINGS.z) + KINGS.domeY;
  return { x: 0, y, z: KINGS.z, heart: y + KINGS.domeR * 0.3 };
};
// It goes slowly here, and slowest where the whole picture stands in the frame.
export const kingsPace = (ahead: number) => 0.4 + 0.35 * smooth01((ahead - 330) / 150) + 0.12 * smooth01((110 - ahead) / 80);
// The eye is raised from the plane's own line toward the middle of the picture (between the dome and the
// crowns) and the lens opens a little as they come near, so both crowned heads stay in the frame until the
// plane is almost at their hands; then it comes down to the light.
export function kingsView(y: number, ahead: number) {
  const w = smooth01((500 - ahead) / 170) * (1 - smooth01((100 - ahead) / 60));
  const mid = kingsDome().y + KINGS.domeR * (1.85 + 0.25 * smooth01((230 - ahead) / 130));
  // how far above level the eye should look, and how much of that it has taken up
  const elev = Math.atan2(mid - y, Math.max(ahead, 30));
  const fov = 50 + 16 * smooth01((330 - ahead) / 190) - 10 * smooth01((95 - ahead) / 60);
  return { w, elev, fov };
}
// How much of the frame the little world's light has taken: nothing until the plane is close, all of it at the glass.
export function kingsBloom(x: number, y: number, z: number) {
  const c = kingsDome();
  const d = Math.hypot(x - c.x, y - c.heart, z - c.z);
  const b = smooth01((KINGS.domeR * 3.2 - d) / (KINGS.domeR * 2.1));
  return { d, veil: b * b * 0.62 };
}

// The path of light as a smooth curve in the world's own coordinates.
const pathCache = new Map<WorldId, { curve: THREE.CatmullRomCurve3; pts: THREE.Vector3[]; len: number }>();
export function pathOf(id: WorldId) {
  let p = pathCache.get(id);
  if (p) return p;
  const def = WORLDS[id];
  const ctl: THREE.Vector3[] = [];
  if (id === "home") {
    // out along the road through the avenue to the first gate
    for (let z = -14; z >= HOME_GATE_Z - 36; z -= 12) ctl.push(new THREE.Vector3(roadX(z), roadY(z), z));
  } else for (const [x, z, a] of def.path) ctl.push(new THREE.Vector3(x, groundAt(def, x, z) + a, z));
  const curve = new THREE.CatmullRomCurve3(ctl, !!def.loop, "centripetal");
  const len = curve.getLength();
  const pts = curve.getSpacedPoints(Math.max(8, Math.round(len / 4)));
  p = { curve, pts, len };
  pathCache.set(id, p);
  return p;
}
export function gateOf(id: WorldId) {
  const def = WORLDS[id];
  if (!def.gate) return null;
  const g = def.gate;
  const y = id === "home" ? g.above : groundAt(def, g.x, g.z) + g.above;
  return { pos: new THREE.Vector3(g.x, y, g.z), yaw: g.yaw };
}
export function entryOf(id: WorldId) {
  const def = WORLDS[id];
  const e = def.entry;
  return { pos: new THREE.Vector3(e.x, groundAt(def, e.x, e.z) + e.above, e.z), yaw: e.yaw };
}

// ---------- the journey's state ----------
type Phase = "open" | "closing" | "hold" | "opening";
export const voyage = {
  cur: "home" as WorldId, // the world that exists now
  next: null as WorldId | null, // where the closing cloud leads
  phase: "open" as Phase,
  veil: 0, // 0..1 the cloud over the lens; exactly 1 at the frame the world changes
  mist: 0, // extra air density for every shader (SKY_U.uMist), rises with the veil
  frames: 0, // frames drawn since the world last changed
  ready: null as WorldId | null, // the next world, made ready ahead of time while this one is flown (worlds/Worlds.tsx)
  quick: false, // this crossing arrived in a world that was ready: the cloud need not wait for it
  held: 0, // seconds the cloud has been closed
  skyFrom: null as SkyState | null,
  skyT: 1,
  lastSky: null as SkyState | null,
  throttle: 0.42,
  guide: true, // the "follow the path" assist is allowed to take over
  cruise: false, // while the quiet hand flies, it flies slowly: time to look about
  lockView: false, // the eye stays where it was turned instead of easing back behind the plane
  gyro: false, // the phone itself is the eye: turning it looks about
  assist: 0, // 0..1 how much of the steering the assist has right now
  flying: false,
  enteredAt: 0, // performance.now() of the last arrival, for the title card
  onEnter: null as ((id: WorldId) => void) | null,
  // the flight's ending: the plane has flown into the little world the kings hold, and is on its way home
  homing: false,
  // where the plane went through the last gate, for the gate's ripple (side and height from its middle, metres)
  gateHit: null as { world: WorldId; side: number; up: number; at: number } | null,
  skyMod: null as ((s: SkyState) => SkyState) | null,
  warm: 0, // 0..1 the closing cloud is that world's light instead of the air's colour
  onHome: null as (() => void) | null,
};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
export const useWorld = () => useSyncExternalStore(subscribe, () => voyage.cur, () => "home" as WorldId);
export const useVoyageTick = () => useSyncExternalStore(subscribe, () => voyage.enteredAt, () => 0);
export const useFlightFlags = () =>
  useSyncExternalStore(
    subscribe,
    () => (voyage.guide ? 1 : 0) + (voyage.assist > 0.5 ? 2 : 0) + (voyage.cruise ? 4 : 0) + (voyage.lockView ? 8 : 0) + (voyage.gyro ? 16 : 0),
    () => 1,
  );
// Travel straight to any world (the flight's Worlds list, and [ / ] with a keyboard): the cloud closes as at a
// gate, the world is made under it (or simply shown, if it was made ready) and the cloud opens on its entry.
export function travelTo(id: WorldId) {
  if (!voyage.flying || voyage.phase !== "open" || voyage.homing || id === voyage.cur) return false;
  voyage.next = id;
  voyage.phase = "closing";
  return true;
}
export function travelStep(dir: 1 | -1) {
  const i = WORLD_ORDER.indexOf(voyage.cur);
  const j = Math.min(WORLD_ORDER.length - 1, Math.max(0, i + dir));
  return travelTo(WORLD_ORDER[j]);
}
export function setGuide(on: boolean) {
  voyage.guide = on;
  emit();
}
export function setFlight(o: Partial<Pick<typeof voyage, "cruise" | "lockView" | "gyro">>) {
  Object.assign(voyage, o);
  emit();
}
let assistShown = false;
export function noteAssist() {
  const on = voyage.assist > 0.5;
  if (on !== assistShown) {
    assistShown = on;
    emit();
  }
}

// The world changes: only ever called with the cloud fully closed.
export function swapWorld(id: WorldId) {
  if (voyage.cur === id) return;
  voyage.skyFrom = voyage.lastSky;
  voyage.skyT = 0;
  voyage.cur = id;
  voyage.ready = null;
  voyage.frames = 0;
  voyage.enteredAt = performance.now();
  emit();
  voyage.onEnter?.(id);
}
export const markEntered = () => {
  voyage.enteredAt = performance.now();
  emit();
};

// The sky of wherever the plane is: the live sky at home, the painting's own
// air elsewhere, and under closed cloud a glide from the one to the other.
const airCache = new Map<WorldId, SkyState>();
export function voyageSky(live: SkyState, dt: number): SkyState {
  const def = WORLDS[voyage.cur];
  let target = live;
  if (def.air) {
    let a = airCache.get(def.id);
    if (!a) airCache.set(def.id, (a = airState(def.air)));
    target = a;
  } else {
    // home, just come to out of the kings' light: golden hour, whatever the clock (or the music's evening) says
    const h = arrivalHours();
    if (h !== null) target = skyState(h);
  }
  let s = target;
  if (voyage.skyFrom) {
    // unhurried: the closed cloud is the whole picture while this runs, and a quick change of its colour reads as a flash
    voyage.skyT = Math.min(1, voyage.skyT + dt / (voyage.quick ? 0.6 : 0.8));
    const t = voyage.skyT;
    s = mixSky(voyage.skyFrom, target, t * t * (3 - 2 * t));
    if (t >= 1) voyage.skyFrom = null;
  }
  // a world may turn its own sky as the plane moves through it (Tranquility deepens into night toward the island)
  if (voyage.skyMod && !voyage.skyFrom) s = voyage.skyMod(s);
  voyage.lastSky = s;
  return s;
}
// ---------- how long a crossing takes ----------
// Measured from the gate to open air on the far side: seconds of flight under each part of the cloud, and the
// hitch: the longest single frame while the cloud was shut, which is where a world not made ahead of time is made.
// Development: every crossing is logged and kept in window.__crossings.
export type Crossing = { from: WorldId; to: WorldId; close: number; hold: number; open: number; total: number; buildMs: number; warm: boolean };
const xing = { on: false, from: "home" as WorldId, to: "home" as WorldId, close: 0, hold: 0, open: 0, lastAt: 0, buildMs: 0, warm: false };
export const crossings: Crossing[] = [];
export function crossingStep(dt: number, warm = false) {
  if (voyage.phase === "open") {
    if (!xing.on) return;
    xing.on = false;
    const c: Crossing = { from: xing.from, to: xing.to, close: +xing.close.toFixed(2), hold: +xing.hold.toFixed(2), open: +xing.open.toFixed(2), total: +(xing.close + xing.hold + xing.open).toFixed(2), buildMs: Math.round(xing.buildMs), warm: xing.warm };
    crossings.push(c);
    if (process.env.NODE_ENV !== "production") console.info(`[voyage] ${c.from} -> ${c.to}: ${c.total} s (cloud closing ${c.close}, closed ${c.hold}, opening ${c.open}); longest frame under the cloud ${c.buildMs} ms${c.warm ? " (the world was ready)" : " (the world was made under the cloud)"}`);
    return;
  }
  if (!xing.on) Object.assign(xing, { on: true, from: voyage.cur, to: voyage.next ?? voyage.cur, close: 0, hold: 0, open: 0, lastAt: performance.now(), buildMs: 0, warm });
  const now = performance.now();
  if (voyage.phase === "hold") xing.buildMs = Math.max(xing.buildMs, now - xing.lastAt);
  xing.lastAt = now;
  if (voyage.phase === "closing") {
    xing.close += dt;
    xing.to = voyage.next ?? xing.to;
    xing.warm = warm;
  } else if (voyage.phase === "hold") {
    xing.hold += dt;
  } else xing.open += dt;
}
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __crossings: crossings });

export const voyageBusy = () => voyage.cur !== "home" || voyage.skyFrom !== null || voyage.phase !== "open" || arrivalHours() !== null;
