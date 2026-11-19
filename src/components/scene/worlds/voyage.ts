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

export type WorldId = "home" | "sun" | "stars" | "rex" | "fairy" | "paradise" | "gate" | "sea";
export const WORLD_ORDER: WorldId[] = ["home", "sun", "stars", "rex", "fairy", "paradise", "gate", "sea"];
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
  // Sonata of the Stars: deep night, ochre and umber in the low sky
  stars: {
    label: "Sonata of the Stars",
    zenith: [0.006, 0.01, 0.03],
    upper: [0.02, 0.026, 0.06],
    horizon: [0.11, 0.075, 0.04],
    glow: [0.5, 0.36, 0.16],
    amb: [0.1, 0.105, 0.15],
    key: [0.95, 0.82, 0.6],
    keyI: 0.75,
    sunAz: 0,
    sunEl: -30,
    keyAz: 0,
    keyEl: 55,
    cloudLit: [0.16, 0.13, 0.1],
    cloudShade: [0.03, 0.03, 0.05],
    night: 1,
    exposure: 1.35,
    fx: [0.0, 0.0, 0.0, 1],
  },
  // Rex: umber dusk, almost monochrome
  rex: {
    label: "Rex",
    zenith: [0.022, 0.017, 0.016],
    upper: [0.06, 0.044, 0.036],
    horizon: [0.3, 0.2, 0.15],
    glow: [0.85, 0.6, 0.42],
    amb: [0.2, 0.17, 0.16],
    key: [1.0, 0.82, 0.66],
    keyI: 1.1,
    sunAz: -34,
    sunEl: -6,
    keyAz: -30,
    keyEl: 32,
    cloudLit: [0.5, 0.36, 0.28],
    cloudShade: [0.08, 0.06, 0.055],
    night: 0.55,
    exposure: 1.2,
    fx: [0.35, 0.9, 0.0, 0.5],
  },
  // Fairy Tale: a high clear afternoon, turquoise, the sun low in a fan of rays
  fairy: {
    label: "Fairy Tale",
    zenith: [0.1, 0.3, 0.42],
    upper: [0.22, 0.47, 0.52],
    horizon: [0.7, 0.72, 0.56],
    glow: [1.0, 0.86, 0.56],
    amb: [0.36, 0.44, 0.52],
    key: [1.0, 0.88, 0.66],
    keyI: 2.9,
    sunAz: 34,
    sunEl: 24,
    cloudLit: [1.15, 1.02, 0.82],
    cloudShade: [0.46, 0.5, 0.56],
    night: 0,
    exposure: 0.88,
    fx: [0.0, 0.25, 1.0, 0],
  },
  // Paradise: yellow-olive noon under rows of cloud
  paradise: {
    label: "Paradise",
    zenith: [0.36, 0.37, 0.2],
    upper: [0.52, 0.5, 0.25],
    horizon: [0.78, 0.7, 0.34],
    glow: [1.0, 0.9, 0.6],
    amb: [0.5, 0.5, 0.4],
    key: [1.0, 0.94, 0.74],
    keyI: 2.5,
    sunAz: 60,
    sunEl: 48,
    cloudLit: [1.0, 0.86, 0.5],
    cloudShade: [0.46, 0.42, 0.26],
    night: 0,
    exposure: 0.9,
    fx: [0.9, 1.5, 0.0, 0],
  },
  // the mountain gate: a cold blue hour, mist in the pass
  gate: {
    label: "The mountain gate",
    zenith: [0.05, 0.1, 0.24],
    upper: [0.16, 0.24, 0.42],
    horizon: [0.56, 0.52, 0.56],
    glow: [1.0, 0.62, 0.42],
    amb: [0.26, 0.31, 0.44],
    key: [1.0, 0.72, 0.52],
    keyI: 2.0,
    sunAz: 8,
    sunEl: 7,
    cloudLit: [0.95, 0.7, 0.6],
    cloudShade: [0.3, 0.32, 0.46],
    night: 0.12,
    exposure: 1.0,
    fx: [0.7, 1.0, 0.0, 0.4],
  },
  // Tranquility: one hazy field of ochre and grey-green, sky and water alike
  sea: {
    label: "Tranquility",
    zenith: [0.33, 0.36, 0.25],
    upper: [0.45, 0.45, 0.27],
    horizon: [0.6, 0.53, 0.3],
    glow: [0.9, 0.6, 0.34],
    amb: [0.42, 0.42, 0.34],
    key: [1.0, 0.86, 0.64],
    keyI: 0.9,
    sunAz: 62,
    sunEl: 3,
    keyAz: 40,
    keyEl: 30,
    cloudLit: [0.7, 0.62, 0.4],
    cloudShade: [0.4, 0.42, 0.32],
    night: 0,
    exposure: 0.95,
    fx: [0.0, 0.0, 0.0, 0],
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
    radius: 520,
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
    canvases: [{ painting: "sun-allegro", x: -44, z: 300, yaw: 0.62 }],
  },
  stars: {
    id: "stars",
    title: "Sonata of the Stars",
    year: "1908",
    music: "stars",
    place: "none",
    air: AIR.stars,
    fog: [0.0009, 0.01],
    terrain: {
      base: 0,
      sines: [
        [0.004, 0.047, 0.3, 7],
        [0.012, 0.021, 2.2, 5],
        [-0.019, 0.009, 1.1, 2.4],
        [0.006, -0.083, 4.0, 1.5],
      ],
      bumps: [[0, -90, 150, 20]],
      rim: [540, 900, 30],
    },
    water: null,
    centre: [0, -40],
    radius: 520,
    ceil: 300,
    entry: { x: 0, z: 470, above: 22, yaw: 0 },
    gate: { x: -130, z: -470, above: 60, yaw: 0.2 },
    path: [
      [0, 470, 22],
      [10, 380, 20],
      [36, 300, 22],
      [70, 200, 30],
      [130, 80, 44],
      [150, -70, 62],
      [80, -220, 86],
      [-60, -250, 100],
      [-150, -150, 96],
      [-190, -280, 80],
      [-150, -400, 66],
      [-130, -470, 60],
      [-124, -500, 60],
    ],
    obstacles: [],
    canvases: [
      { painting: "stars-allegro", x: -58, z: 300, yaw: 0.6 },
      { painting: "stars-andante", x: 96, z: 248, yaw: -0.75 },
    ],
  },
  rex: {
    id: "rex",
    title: "Rex",
    year: "1909",
    music: "rex",
    place: "sea",
    air: AIR.rex,
    fog: [0.0012, 0.014],
    terrain: {
      base: -6,
      sines: [
        [0.021, 0.013, 0.2, 0.8],
        [-0.014, 0.027, 1.4, 0.6],
      ],
      bumps: [
        [-40, 330, 60, 13],
        [-150, 250, 70, 15],
        [170, 300, 80, 16],
      ],
      rim: [1, 2, 0],
    },
    water: 0,
    centre: [0, -40],
    radius: 520,
    ceil: 320,
    entry: { x: 0, z: 480, above: 18, yaw: 0 },
    gate: { x: 180, z: -460, above: 26, yaw: -0.3 },
    path: [
      [0, 480, 18],
      [0, 400, 16],
      [30, 330, 16],
      [70, 240, 20],
      [140, 120, 30],
      [190, -40, 44],
      [140, -200, 60],
      [0, -270, 70],
      [-150, -200, 60],
      [-190, -40, 44],
      [-120, 90, 36],
      [0, 130, 30],
      [110, 60, 30],
      [200, -120, 34],
      [220, -320, 30],
      [180, -460, 26],
      [172, -490, 26],
    ],
    obstacles: [],
    canvases: [{ painting: "rex", x: -46, z: 322, yaw: 0.55 }],
  },
  fairy: {
    id: "fairy",
    title: "Fairy Tale",
    year: "1909",
    music: "fairy",
    place: "sky",
    air: AIR.fairy,
    fog: [0.0008, 0.016],
    terrain: {
      base: 4,
      sines: [
        [0.009, 0.006, 0.5, 9],
        [-0.007, 0.012, 2.3, 7],
        [0.021, 0.015, 1.3, 2.5],
        [0.033, -0.024, 3.7, 1.2],
      ],
      bumps: [
        [0, -80, 170, 26],
        [-300, 160, 140, 22],
        [300, 220, 150, 18],
      ],
      rim: [560, 950, -60],
    },
    water: null,
    centre: [0, -40],
    radius: 520,
    ceil: 330,
    entry: { x: 0, z: 480, above: 26, yaw: 0 },
    gate: { x: -170, z: -460, above: 40, yaw: 0.3 },
    path: [
      [0, 480, 26],
      [8, 400, 22],
      [-20, 320, 20],
      [-70, 230, 30],
      [-170, 110, 60],
      [-220, -60, 110],
      [-150, -230, 160],
      [10, -290, 190],
      [170, -200, 200],
      [200, -40, 170],
      [110, 80, 120],
      [-40, 60, 90],
      [-170, -100, 70],
      [-200, -300, 52],
      [-170, -460, 40],
      [-164, -490, 40],
    ],
    obstacles: [],
    canvases: [{ painting: "fairy-tale", x: 58, z: 322, yaw: -0.6 }],
  },
  paradise: {
    id: "paradise",
    title: "Paradise",
    year: "1909",
    music: "paradise",
    place: "meadow",
    air: AIR.paradise,
    fog: [0.0011, 0.012],
    terrain: {
      base: 2.2,
      sines: [
        [0.013, 0.009, 0.6, 1.1],
        [-0.011, 0.019, 2.0, 0.8],
        [0.037, 0.021, 1.2, 0.3],
      ],
      bumps: [
        [-330, -60, 300, -9.5],
        [-560, -160, 260, -5],
        [330, -60, 190, 22],
        [260, -360, 200, 16],
      ],
      rim: [600, 950, 30],
    },
    water: 0,
    centre: [0, -40],
    radius: 520,
    ceil: 200,
    entry: { x: 40, z: 480, above: 16, yaw: 0 },
    gate: { x: -40, z: -470, above: 22, yaw: 0.1 },
    path: [
      [40, 480, 16],
      [44, 400, 13],
      [30, 320, 11],
      [10, 230, 10],
      [-10, 130, 9],
      [10, 30, 9],
      [70, -50, 12],
      [150, -120, 20],
      [170, -230, 26],
      [90, -320, 26],
      [-10, -390, 24],
      [-40, -470, 22],
      [-44, -500, 22],
    ],
    obstacles: [],
    canvases: [{ painting: "paradise", x: 96, z: 318, yaw: -0.62 }],
  },
  gate: {
    id: "gate",
    title: "The mountain gate",
    year: "",
    music: "road",
    place: "forest",
    air: AIR.gate,
    fog: [0.0016, 0.02],
    terrain: {
      base: 0,
      sines: [
        [0.012, 0.007, 0.9, 4],
        [-0.009, 0.017, 2.6, 3],
        [0.027, 0.019, 0.3, 1.2],
      ],
      bumps: [
        [-330, -40, 190, 70],
        [330, -40, 190, 70],
        [-230, 300, 170, 36],
        [240, 320, 170, 32],
      ],
      rim: [600, 900, 50],
    },
    water: null,
    centre: [0, 0],
    radius: 470,
    ceil: 230,
    entry: { x: 0, z: 430, above: 20, yaw: 0 },
    gate: { x: 0, z: -330, above: 46, yaw: 0 },
    path: [
      [0, 430, 20],
      [-8, 340, 16],
      [14, 240, 14],
      [20, 140, 16],
      [-6, 40, 22],
      [-14, -80, 30],
      [0, -200, 40],
      [0, -330, 46],
      [0, -370, 46],
    ],
    obstacles: [],
    canvases: [{ painting: "offering", x: -46, z: 250, yaw: 0.6 }],
  },
  sea: {
    id: "sea",
    title: "Tranquility",
    year: "1904",
    music: "sea",
    place: "sea",
    air: AIR.sea,
    fog: [0.0009, 0.006],
    terrain: {
      base: -8,
      sines: [],
      bumps: [[-10, 330, 62, 9.4]],
      rim: [1, 2, 0],
    },
    water: 0,
    centre: [0, -60],
    radius: 560,
    ceil: 160,
    entry: { x: 0, z: 480, above: 14, yaw: 0 },
    gate: null,
    path: [
      [0, 480, 14],
      [16, 400, 10],
      [40, 320, 8],
      [10, 230, 7],
      [-40, 130, 6],
      [-60, 20, 6],
      [-10, -80, 9],
      [110, -170, 16],
      [250, -260, 24],
      [330, -400, 30],
      [230, -520, 34],
      [60, -540, 34],
      [-120, -500, 30],
      [-280, -420, 26],
      [-330, -280, 22],
      [-250, -150, 16],
      [-130, -60, 9],
      [-60, 20, 6],
    ],
    loop: true,
    obstacles: [],
    canvases: [{ painting: "tranquility", x: -52, z: 318, yaw: 0.6 }],
  },
};

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
    voyage.skyT = Math.min(1, voyage.skyT + dt / 0.5);
    const t = voyage.skyT;
    s = mixSky(voyage.skyFrom, target, t * t * (3 - 2 * t));
    if (t >= 1) voyage.skyFrom = null;
  }
  voyage.lastSky = s;
  return s;
}
export const voyageBusy = () => voyage.cur !== "home" || voyage.skyFrom !== null || voyage.phase !== "open";
