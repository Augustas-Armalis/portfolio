import * as THREE from "three";
import { useSyncExternalStore } from "react";
import { roadX, roadY, HOME_GATE_Z } from "../flightPath";
import { airState, mixSky, type Air, type SkyState } from "../sky";

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

export type WorldId = "home" | "sun" | "stars" | "rex" | "fairy" | "paradise" | "gate" | "sea" | "kings";
export const WORLD_ORDER: WorldId[] = ["home", "sun", "stars", "rex", "fairy", "paradise", "gate", "sea", "kings"];
// Fairy Tale of the Kings: where the two kings stand, and the small lit world they hold between their hands
export const KINGS = { z: -170, domeY: 58, domeR: 24 };
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
const AIR: Record<Exclude<WorldId, "home">, Air> = {
  // Sonata of the Sun: one flat field of dull gold, no sun in it but the drawn ones; the forms blue-grey against it
  sun: {
    label: "Sonata of the Sun",
    zenith: [0.4, 0.38, 0.19],
    upper: [0.5, 0.43, 0.17],
    horizon: [0.63, 0.5, 0.18],
    glow: [1.0, 0.72, 0.26],
    amb: [0.44, 0.46, 0.5],
    key: [1.0, 0.82, 0.5],
    keyI: 2.3,
    sunAz: -18,
    sunEl: -25,
    keyAz: -24,
    keyEl: 26,
    cloudLit: [0.7, 0.6, 0.3],
    cloudShade: [0.4, 0.4, 0.26],
    night: 0,
    exposure: 0.95,
    fx: [0.0, 0.55, 0.0, 0],
  },
  // Sonata of the Stars: deep night, ochre and umber in the low sky; the land keeps a light of its own
  stars: {
    label: "Sonata of the Stars",
    zenith: [0.004, 0.008, 0.028],
    upper: [0.016, 0.022, 0.06],
    horizon: [0.1, 0.066, 0.04],
    glow: [0.5, 0.36, 0.16],
    amb: [0.24, 0.22, 0.25],
    key: [1.0, 0.86, 0.6],
    keyI: 0.9,
    sunAz: 0,
    sunEl: -30,
    keyAz: -8,
    keyEl: 58,
    cloudLit: [0.16, 0.13, 0.1],
    cloudShade: [0.03, 0.03, 0.05],
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
    sunAz: -38,
    sunEl: -8,
    keyAz: -30,
    keyEl: 36,
    cloudLit: [0.5, 0.36, 0.24],
    cloudShade: [0.08, 0.065, 0.05],
    night: 0.5,
    exposure: 1.15,
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
  // Tranquility: a calm pale-gold evening, sky and water alike, greener overhead where the first stars show
  sea: {
    label: "Tranquility",
    zenith: [0.2, 0.27, 0.23],
    upper: [0.43, 0.44, 0.28],
    horizon: [0.68, 0.57, 0.31],
    glow: [0.95, 0.62, 0.34],
    amb: [0.42, 0.42, 0.33],
    key: [1.0, 0.86, 0.62],
    keyI: 0.9,
    sunAz: 62,
    sunEl: 3,
    keyAz: 40,
    keyEl: 30,
    cloudLit: [0.74, 0.64, 0.4],
    cloudShade: [0.4, 0.42, 0.32],
    night: 0,
    exposure: 0.95,
    fx: [0.0, 0.0, 0.0, 0.3],
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
    fog: [0.0003, 0.014],
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
      { x: 30, z: -190, r: 84, h: 196, bell: true },
      { x: -92, z: -120, r: 62, h: 138, bell: true },
      { x: 124, z: -92, r: 54, h: 140, bell: true },
      { x: -10, z: -40, r: 70, h: 64, bell: true },
      { x: -210, z: -260, r: 46, h: 92, bell: true },
      { x: 210, z: -250, r: 42, h: 80, bell: true },
      { x: 5.1, z: 206.2, r: 5, h: 58 },
      { x: 34.9, z: 209.8, r: 5, h: 58 },
      { x: -27.3, z: 102.9, r: 5.5, h: 64 },
      { x: 3.3, z: 89.1, r: 5.5, h: 64 },
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
    fog: [0.00035, 0.008],
    terrain: {
      base: 0,
      sines: [
        [0.004, 0.047, 0.3, 7],
        [0.012, 0.021, 2.2, 5],
        [-0.019, 0.009, 1.1, 2.4],
        [0.006, -0.083, 4.0, 1.5],
      ],
      bumps: [[0, -90, 170, 18]],
      rim: [540, 900, 30],
    },
    water: null,
    centre: [0, -40],
    radius: 610,
    ceil: 400,
    entry: { x: 0, z: 470, above: 22, yaw: 0 },
    gate: { x: -130, z: -470, above: 60, yaw: -0.9 },
    // in past the Allegro, by the globe of the Andante, through the veil of the pyramid and up into the river of stars
    path: [
      [0, 470, 22],
      [6, 380, 16],
      [-10, 300, 16],
      [-60, 210, 28],
      [-130, 130, 40],
      [-150, 10, 62],
      [-70, -60, 105],
      [40, -120, 150],
      [130, -190, 180],
      [90, -250, 188],
      [-40, -256, 188],
      [-170, -290, 165],
      [-215, -380, 110],
      [-170, -440, 74],
      [-130, -470, 60],
      [-106, -489, 60],
    ],
    obstacles: [{ x: -250, z: 90, r: 96, h: 150, bell: true }],
    canvases: [
      { painting: "stars-allegro", x: -56, z: 295, yaw: 1.1 },
      { painting: "stars-andante", x: -59, z: 152, yaw: 0.02 },
    ],
  },
  rex: {
    id: "rex",
    title: "Rex",
    year: "1909",
    music: "rex",
    place: "sea",
    air: AIR.rex,
    fog: [0.00014, 0.005],
    terrain: {
      base: -7,
      sines: [
        [0.021, 0.013, 0.2, 0.8],
        [-0.014, 0.027, 1.4, 0.6],
      ],
      bumps: [
        [-78, 372, 64, 14.5],
        [-190, 300, 60, 10.5],
        [210, 330, 70, 11],
      ],
      rim: [1, 2, 0],
    },
    water: 0,
    centre: [0, -110],
    radius: 740,
    ceil: 330,
    entry: { x: 0, z: 520, above: 17, yaw: 0 },
    gate: { x: 290, z: -500, above: 34, yaw: -0.2 },
    // in over the water past the painting to the altar, then once round the king, rising through
    // the shells of his sky one after another to the crown, down across his face and out beyond the arcs
    path: [
      [0, 520, 17],
      [5, 440, 16],
      [16, 360, 15],
      [26, 270, 16],
      [36, 170, 19],
      [52, 70, 24],
      [70, -74, 32],
      [165, -160, 52],
      [188, -290, 80],
      [122, -402, 110],
      [0, -448, 140],
      [-122, -402, 166],
      [-188, -290, 184],
      [-168, -162, 172],
      [-74, -70, 128],
      [50, -72, 88],
      [176, -180, 60],
      [246, -340, 42],
      [290, -500, 34],
      [298, -538, 34],
    ],
    obstacles: [
      { x: 0, z: -260, r: 92, h: 92, bell: true },
      { x: 0, z: -260, r: 66, h: 262 },
    ],
    canvases: [{ painting: "rex", x: -72, z: 372, yaw: 0.72 }],
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
    ceil: 380,
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
    obstacles: [
      { x: 0, z: -80, r: 200, h: 90, bell: true },
      { x: 0, z: -80, r: 150, h: 138, bell: true },
      { x: 0, z: -72, r: 66, h: 205 },
      { x: 6, z: -90, r: 48, h: 322 },
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
    music: "road",
    place: "forest",
    air: AIR.gate,
    fog: [0.00022, 0.02],
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
    ceil: 300,
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
      { x: -188, z: -330, r: 112, h: 300, bell: true },
      { x: 188, z: -330, r: 112, h: 280, bell: true },
      { x: -100, z: -152, r: 44, h: 66 },
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
    fog: [0.00016, 0.004],
    terrain: {
      base: -8,
      sines: [],
      bumps: [
        [-16, 330, 74, 10.6],
        [-62, 300, 40, 2.4],
      ],
      rim: [1, 2, 0],
    },
    water: 0,
    centre: [0, -60],
    radius: 670,
    ceil: 190,
    entry: { x: 10, z: 500, above: 12, yaw: 0 },
    gate: { x: 250, z: -420, above: 30, yaw: -1.2 },
    // in past the painting, to where the picture is seen as he drew it, round the long back's end and on behind the island to the gate
    path: [
      [10, 500, 12],
      [20, 420, 9],
      [24, 340, 8],
      [30, 240, 7],
      [40, 140, 6],
      [84, 10, 6],
      [92, -100, 7],
      [10, -168, 9],
      [-150, -186, 9],
      [-290, -200, 10],
      [-345, -270, 14],
      [-260, -360, 20],
      [-20, -420, 28],
      [250, -420, 30],
      [286, -406, 30],
    ],
    obstacles: [
      { x: 181, z: -260, r: 60, h: 100, bell: true },
      { x: 100, z: -260, r: 44, h: 60, bell: true },
      { x: 20, z: -260, r: 30, h: 30, bell: true },
      { x: -60, z: -260, r: 22, h: 22, bell: true },
    ],
    canvases: [{ painting: "tranquility", x: -15, z: 327, yaw: 0.69 }],
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
    path: [
      [0, 540, 13],
      [6, 460, 14],
      [14, 380, 20],
      [4, 300, 32],
      [-10, 220, 44],
      [-6, 140, 52],
      [4, 60, 56],
      [2, -20, 57],
      [0, -100, 56],
      [0, KINGS.z, KINGS.domeY - 3],
      [0, KINGS.z - 40, KINGS.domeY - 3],
    ],
    obstacles: [
      { x: -118, z: KINGS.z, r: 56, h: 190 },
      { x: 118, z: KINGS.z, r: 56, h: 190 },
    ],
    canvases: [{ painting: "kings", x: -30, z: 428, yaw: 0.56 }],
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
  held: 0, // seconds the cloud has been closed
  skyFrom: null as SkyState | null,
  skyT: 1,
  lastSky: null as SkyState | null,
  throttle: 0.42,
  guide: true, // the "follow the path" assist is allowed to take over
  assist: 0, // 0..1 how much of the steering the assist has right now
  flying: false,
  enteredAt: 0, // performance.now() of the last arrival, for the title card
  onEnter: null as ((id: WorldId) => void) | null,
  // the flight's ending: the plane has flown into the little world the kings hold, and is on its way home
  homing: false,
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
    () => (voyage.guide ? 1 : 0) + (voyage.assist > 0.5 ? 2 : 0),
    () => 1,
  );
export function setGuide(on: boolean) {
  voyage.guide = on;
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
  }
  let s = target;
  if (voyage.skyFrom) {
    // unhurried: the closed cloud is the whole picture while this runs, and a quick change of its colour reads as a flash
    voyage.skyT = Math.min(1, voyage.skyT + dt / 0.8);
    const t = voyage.skyT;
    s = mixSky(voyage.skyFrom, target, t * t * (3 - 2 * t));
    if (t >= 1) voyage.skyFrom = null;
  }
  voyage.lastSky = s;
  return s;
}
export const voyageBusy = () => voyage.cur !== "home" || voyage.skyFrom !== null || voyage.phase !== "open";
