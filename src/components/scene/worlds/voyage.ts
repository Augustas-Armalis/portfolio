import * as THREE from "three";
import { useSyncExternalStore } from "react";
import { roadY } from "../flightPath";
import { CAVE, JOURNEY } from "../home/journey";
import { landH } from "../home/land";
import { homeWater } from "../homeGround";
import { airState, arrivalHours, mixSky, skyState, type Air, type SkyState } from "../sky";
import { FRIEND_CANVAS, FRIEND_ENTRY, FRIEND_GATE, FRIEND_OBSTACLES, FRIEND_PATH, FRIEND_TERRAIN } from "./friendship/shape";
import { funeralLand } from "./funeral/land";
import { GROTTO } from "./sea/shape";
import { FINALE_ENTRY, FINALE_GATE, FINALE_PATH, FINALE_TERRAIN } from "./seafinale/shape";
import { SUN_CANVAS, SUN_ENTRY, SUN_GATE, SUN_OBSTACLES, SUN_PATH, SUN_SKY, SUN_TERRAIN } from "./sun/shape";

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

export type WorldId = "home" | "friendship" | "sun" | "stars" | "rex" | "fairy" | "paradise" | "gate" | "sea" | "seafinale" | "funeral" | "kings";
// (after the gate of Offering: the storm wave of the Finale, out of its curl into the calm of Tranquility, through the
// grotto between the island's eyes and out of a cave mouth into the night of the Funeral Symphony)
// (Friendship first: out of the home cave into hers, and through the orb she holds into the Sun)
export const WORLD_ORDER: WorldId[] = ["home", "friendship", "sun", "stars", "rex", "fairy", "paradise", "gate", "seafinale", "sea", "funeral", "kings"];
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
  fog: [density: number, heightFalloff: number, dissolveFrom?: number, dissolveTo?: number]; // (the last two: see "the far dissolve" in kit.ts)
  terrain: Terrain | null;
  water: number | null; // the level of still water, if the world has any
  centre: [number, number];
  radius: number; // beyond this the air turns the plane back
  ceil: number;
  pace?: number; // a world built several times larger than the rest is flown this many times faster (default 1)
  entry: { x: number; z: number; above: number; yaw: number };
  gate: { x: number; z: number; above: number; yaw: number } | null; // the way onward; the last world has none
  path: [x: number, z: number, above: number][]; // the path of light, from the entry to the gate
  loop?: boolean;
  obstacles: Obstacle[];
  canvases: CanvasSpot[];
};

const T0: Terrain = { base: 0, sines: [], bumps: [], rim: [1, 2, 0] };
const FUNERAL = funeralLand();

// Colours below are scene-linear, written before the lens (ACES and the grade) sees them.
const AIR: Record<Exclude<WorldId, "home">, Air> = {
  // Friendship: the dim green-gold air of a vast cave; no sky, no sun: the only light is the orb she holds, which
  // stands where the sun would (straight ahead, a little up) so the haze glows round it as round a sun
  friendship: {
    label: "Friendship",
    zenith: [0.012, 0.032, 0.024],
    upper: [0.018, 0.044, 0.03],
    horizon: [0.03, 0.058, 0.034],
    // (the air toward the orb takes this colour: kept low, or the whole cave goes to cream)
    glow: [0.2, 0.15, 0.075],
    amb: [0.07, 0.11, 0.085],
    key: [0.9, 0.95, 0.62],
    keyI: 0.7,
    // (no sun in this sky: the glow of the orb in the air is its own, worked out along every ray: friendship/cave.ts;
    // the key light is the pale light that comes down the shafts from far above, onto the tops of the trees)
    sunAz: 0,
    sunEl: -30,
    keyAz: 20,
    keyEl: 70,
    cloudLit: [0.1, 0.12, 0.08],
    cloudShade: [0.02, 0.03, 0.025],
    night: 0.25,
    exposure: 1.25,
    fx: [0, 0, 0, 0],
  },
  // Sonata of the Sun: a field of dull gold under a gold-green air; one great drawn sun low ahead (the world's
  // GreatSun: the sky's own disc is not drawn) behind the bells and arches, so they stand as shade with a thread of
  // gold round every edge and its rays pour through them
  sun: {
    label: "Sonata of the Sun",
    zenith: [0.3, 0.29, 0.2],
    upper: [0.5, 0.39, 0.15],
    horizon: [0.72, 0.49, 0.15],
    glow: [0.92, 0.6, 0.18],
    amb: [0.46, 0.44, 0.52],
    key: [1.0, 0.78, 0.42],
    keyI: 2.1,
    sunAz: SUN_SKY.az,
    sunEl: SUN_SKY.el,
    keyAz: SUN_SKY.keyAz,
    keyEl: SUN_SKY.keyEl,
    cloudLit: [0.7, 0.6, 0.3],
    cloudShade: [0.4, 0.4, 0.26],
    night: 0,
    exposure: 0.8,
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
    zenith: [0.013, 0.016, 0.028],
    upper: [0.062, 0.05, 0.058],
    horizon: [0.37, 0.225, 0.17],
    glow: [1.0, 0.6, 0.3],
    amb: [0.25, 0.225, 0.19],
    key: [1.0, 0.8, 0.54],
    keyI: 1.3,
    sunAz: -32,
    sunEl: 30,
    keyAz: -26,
    keyEl: 36,
    cloudLit: [0.5, 0.36, 0.28],
    cloudShade: [0.07, 0.07, 0.09],
    night: 0.5,
    exposure: 1.0,
    fx: [0.25, 0.6, 0.0, 0.5],
  },
  // Fairy Tale: a high gold afternoon over the plain, turquoise between ranks of gilded cloud; the sun stands just
  // over the mountain's point as the plane comes in, so the whole of it is violet shade edged with light
  fairy: {
    label: "Castle Fairy Tale",
    zenith: [0.1, 0.27, 0.44],
    upper: [0.24, 0.45, 0.52],
    horizon: [0.58, 0.58, 0.46],
    glow: [0.92, 0.72, 0.4],
    amb: [0.3, 0.34, 0.52],
    key: [1.0, 0.84, 0.58],
    keyI: 3.2,
    sunAz: 12,
    sunEl: 31,
    cloudLit: [1.05, 0.74, 0.3],
    cloudShade: [0.4, 0.36, 0.5],
    night: 0,
    exposure: 0.87,
    fx: [0.0, 0.2, 0.0, 0],
  },
  // Paradise: a gold and olive noon under ranks of cloud, the sun out over the sea to the left
  paradise: {
    label: "Paradise",
    zenith: [0.2, 0.28, 0.25],
    upper: [0.4, 0.43, 0.26],
    horizon: [0.62, 0.55, 0.28],
    glow: [0.8, 0.62, 0.3],
    amb: [0.4, 0.43, 0.4],
    key: [1.0, 0.9, 0.64],
    keyI: 2.9,
    sunAz: -66,
    sunEl: 36,
    cloudLit: [1.0, 0.82, 0.34],
    cloudShade: [0.2, 0.235, 0.23],
    night: 0,
    exposure: 0.85,
    fx: [0.0, 0.6, 0.0, 0],
  },
  // the mountain gate under the sky of "Offering": dull gold banded with olive, the last sun low in the pass
  gate: {
    label: "The Offering",
    zenith: [0.17, 0.19, 0.15],
    upper: [0.42, 0.36, 0.17],
    horizon: [0.72, 0.52, 0.2],
    glow: [1.0, 0.64, 0.26],
    amb: [0.3, 0.29, 0.36],
    key: [1.0, 0.72, 0.42],
    keyI: 2.5,
    sunAz: 1.5,
    sunEl: 8,
    keyAz: 10,
    keyEl: 20,
    cloudLit: [0.95, 0.74, 0.4],
    cloudShade: [0.2, 0.18, 0.17],
    night: 0,
    exposure: 0.92,
    fx: [0.4, 1.2, 0.0, 0],
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
  // Sonata of the Sea, Finale: a pale warm sky in level bands, ochre and amber; the sun low and straight ahead,
  // behind the great wave, so the water is lit through
  seafinale: {
    label: "Sonata of the Sea: Finale",
    zenith: [0.15, 0.1, 0.05],
    upper: [0.36, 0.26, 0.12],
    horizon: [0.62, 0.47, 0.22],
    glow: [1.0, 0.74, 0.32],
    amb: [0.36, 0.38, 0.27],
    key: [1.0, 0.84, 0.5],
    keyI: 1.25,
    sunAz: -4,
    sunEl: 12,
    keyAz: -4,
    keyEl: 17,
    cloudLit: [1.0, 0.86, 0.56],
    cloudShade: [0.5, 0.42, 0.3],
    night: 0,
    exposure: 0.8,
    fx: [0.0, 0.7, 0.0, 0],
  },
  // Funeral Symphony VI: a vast night of ultramarine pastel, the sky the lightest thing in it; a thin moon with
  // fine rays low over the far wall, its light cold on the rock; the gold is the procession's own
  funeral: {
    label: "Funeral Symphony VI",
    zenith: [0.011, 0.027, 0.165],
    upper: [0.019, 0.05, 0.25],
    horizon: [0.028, 0.076, 0.3],
    glow: [0.5, 0.6, 0.6],
    amb: [0.06, 0.1, 0.27],
    key: [0.72, 0.92, 0.88],
    keyI: 0.9,
    sunAz: 0,
    sunEl: -24,
    keyAz: 45,
    keyEl: 26,
    cloudLit: [0.3, 0.42, 0.62],
    cloudShade: [0.03, 0.06, 0.2],
    night: 0.8,
    exposure: 1.08,
    fx: [0.0, 0.0, 0.0, 0.5],
  },
  // Fairy Tale of the Kings: a night wood, brown-black and teal; the only strong light is the little world
  kings: {
    label: "Fairy Tale of the Kings",
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
    // (room to explore: the plane may wander well over a kilometre from the avenue, and high, before the air leans it back)
    centre: [0, -160],
    radius: 1300,
    ceil: 170,
    entry: { x: 1.4, z: -40, above: 6, yaw: 0 },
    // the way on is in the cave at the forest's end (home/journey.ts): deep inside it, in its carved frame
    gate: { x: CAVE.x - Math.sin(CAVE.yaw) * CAVE.gateIn, z: CAVE.z - Math.cos(CAVE.yaw) * CAVE.gateIn, above: landH(CAVE.x, CAVE.z) + CAVE.floor + CAVE.above, yaw: CAVE.yaw },
    path: [], // the journey: up the road, over the lake, down the river through the town, the forest, the cave (see pathOf())
    obstacles: [],
    canvases: [],
  },
  friendship: {
    id: "friendship",
    title: "Friendship",
    year: "1906–1907",
    music: "friendship",
    place: "none",
    air: AIR.friendship,
    // (a cavern three kilometres across: its air is thick enough to lose the far wall and the vault, thin enough that
    // she is seen, a shape in the haze, from the throat a kilometre and a half away)
    fog: [0.00027, 0.0006, 2700, 4300],
    // the cave's floor; the cave itself, the figure and the orb are built (worlds/friendship/)
    terrain: FRIEND_TERRAIN,
    water: null,
    // (the air leans the plane back from the cavern's walls; the tunnel it came in by is inside the round)
    centre: [0, -640],
    radius: 1720,
    ceil: 470,
    // (a world several times the size of the rest: flown the faster for it)
    pace: 2.0,
    entry: FRIEND_ENTRY,
    // in the heart of the orb she holds out: the plane flies into its light, and through it into the Sun
    gate: FRIEND_GATE,
    path: FRIEND_PATH,
    obstacles: [...FRIEND_OBSTACLES],
    canvases: [{ painting: "friendship", x: FRIEND_CANVAS.x, z: FRIEND_CANVAS.z, yaw: FRIEND_CANVAS.yaw }],
  },
  sun: {
    id: "sun",
    title: "Sonata of the Sun",
    year: "1907",
    music: "sun",
    place: "sky",
    air: AIR.sun,
    // (thin air: the bells are first seen from two and a half kilometres, and must stand in the haze, not be lost in it)
    fog: [0.00011, 0.0042],
    // a vast open plain, the road across it, the aqueducts and the far city of bells: the land, the way and what
    // the plane flies round are worked out together in sun/shape.ts
    terrain: SUN_TERRAIN,
    water: null,
    centre: [0, -40],
    radius: 2060,
    ceil: 520,
    pace: 1.8,
    entry: SUN_ENTRY,
    gate: SUN_GATE,
    path: SUN_PATH,
    obstacles: [...SUN_OBSTACLES],
    canvases: [{ painting: "sun-allegro", x: SUN_CANVAS.x, z: SUN_CANVAS.z, yaw: SUN_CANVAS.yaw }],
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
    pace: 2.4,
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
      // (well along the way: nothing hangs in the first view of the pyramid)
      { painting: "stars-allegro", x: -150, z: 330, yaw: 1.1 },
      { painting: "stars-andante", x: -170, z: 120, yaw: 0.02 },
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
    pace: 2.8,
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
    title: "Castle Fairy Tale",
    year: "1909",
    music: "fairy",
    place: "sky",
    air: AIR.fairy,
    fog: [0.00016, 0.0022],
    // a wide plain of woods and fields, low hills far off; the mountain itself is built, not ground (worlds/fairy/mountain.ts)
    terrain: {
      base: 0,
      sines: [
        [0.0031, 0.0022, 0.5, 5],
        [-0.0024, 0.0041, 2.3, 4],
        [0.0071, 0.0052, 1.3, 1.6],
      ],
      bumps: [
        // the rise the plane comes in over: the plain opens below it and the mountain stands beyond
        [0, 1500, 320, 46],
        [-900, 500, 380, 34],
        [950, 300, 420, 40],
        [-800, -900, 420, 46],
        // the hill of the way on
        [660, -1370, 340, 110],
      ],
      rim: [1900, 2800, 140],
    },
    water: null,
    centre: [0, 50],
    radius: 1560,
    ceil: 660,
    entry: { x: -45, z: 1840, above: 7.5, yaw: -0.155 },
    gate: { x: 646, z: -1335, above: 70, yaw: -0.363 },
    // in low under the trees of a wood, along a winding track (Fairy.tsx trackX), the castle only glimpsed
    // through the leaves; up off the track where the wood opens, over the crest of the rise, and the whole plain
    // and the mountain are there at once. Then down off the rise and low over the fields; then a long climb straight at the castle, the mountain rising to
    // fill the sky, to pass close under its towers by its right flank and the slim peak beside it; and away over
    // the plain beyond, down toward the sun
    path: [
      [-45, 1840, 7.5],
      [-31, 1800, 7.5],
      [-4, 1760, 7.5],
      [24, 1720, 7.5],
      [43, 1680, 8],
      [44, 1640, 10],
      [28, 1600, 16],
      [8, 1560, 24],
      [0, 1500, 38],
      [3, 1380, 43],
      [6, 1260, 45],
      [10, 1130, 52],
      [16, 1010, 59],
      [30, 880, 102],
      [50, 700, 164],
      [72, 500, 228],
      [94, 300, 289],
      [114, 110, 347],
      [136, -60, 401],
      [174, -170, 424],
      [204, -270, 439],
      [240, -450, 428],
      [335, -700, 375],
      [470, -1000, 260],
      [646, -1335, 70],
      [659, -1369, 69],
    ],
    // the mountain as a stack of drums, wide at the foot and narrow under the castle (worlds/fairy/mountain.ts MT),
    // then the castle's wards and the peaks about it
    obstacles: [
      { x: 0, z: -240, r: 395, h: 60 },
      { x: 0, z: -240, r: 340, h: 110 },
      { x: 0, z: -240, r: 307, h: 160 },
      { x: 0, z: -240, r: 275, h: 210 },
      { x: 0, z: -240, r: 243, h: 260 },
      { x: 0, z: -240, r: 210, h: 310 },
      { x: 0, z: -240, r: 178, h: 360 },
      { x: 0, z: -240, r: 150, h: 420 },
      { x: 0, z: -144, r: 96, h: 590 },
      { x: 0, z: -180, r: 70, h: 650 },
      { x: 4, z: -250, r: 60, h: 830 },
      { x: 104, z: -224, r: 54, h: 700 },
      { x: -100, z: -246, r: 40, h: 640 },
      { x: -18, z: -334, r: 48, h: 660 },
      { x: 58, z: -320, r: 36, h: 610 },
      // the gate of the way on (Fairy.tsx): the piers of its arch and the two towers beside them, the opening left free
      ...[-1, 1].flatMap((sd) => [
        { x: 646 + Math.cos(-0.363) * sd * 23, z: -1335 - Math.sin(-0.363) * sd * 23, r: 5, h: 104 },
        { x: 646 + Math.cos(-0.363) * sd * 34, z: -1335 - Math.sin(-0.363) * sd * 34, r: 9.5, h: 118 },
      ]),
    ],
    canvases: [{ painting: "fairy-tale", x: -46, z: 1290, yaw: 0.5 }],
  },
  paradise: {
    id: "paradise",
    title: "Paradise",
    year: "1909",
    music: "paradise",
    place: "meadow",
    air: AIR.paradise,
    fog: [0.00009, 0.006],
    // a round isle in an endless sea: the meadow stands nine metres over the water and falls away through the
    // sand to the sea's bed (the shore is a circle of about 720 m); the steps and the court on them are built,
    // not ground (worlds/paradise/isle.ts)
    terrain: {
      base: 9,
      sines: [
        [0.013, 0.009, 0.6, 0.3],
        [-0.011, 0.019, 2.0, 0.25],
      ],
      bumps: [],
      rim: [600, 1050, -50],
    },
    water: 0,
    centre: [-100, 0],
    radius: 1050,
    ceil: 300,
    entry: { x: -1040, z: 150, above: 30, yaw: -1.39 },
    gate: { x: 0, z: 111, above: 131, yaw: Math.PI },
    // in over the sea straight at the isle, the whole mount ahead with its terraces and falling water; then left
    // along the shore with the meadow on the right, inland, and straight up the great flight to the court, over
    // its pool, and out through the portal in the colonnade's far side
    path: [
      [-1040, 150, 30],
      [-940, 132, 26],
      [-850, 104, 21],
      [-770, 56, 17],
      [-705, -14, 14],
      [-655, -95, 13],
      [-616, -175, 13],
      [-589, -249, 13],
      [-528, -361, 13],
      [-446, -459, 13],
      [-346, -539, 13],
      [-232, -597, 13],
      [-130, -622, 14],
      [-50, -596, 17],
      [2, -510, 34],
      [8, -440, 68],
      [8, -360, 95],
      [6, -280, 124],
      [3, -200, 142],
      [0, -100, 141],
      [0, 0, 137],
      [0, 111, 131],
      [0, 148, 131],
    ],
    // the mount of steps as a stack of drums (worlds/paradise/isle.ts ISLE)
    obstacles: [
      { x: 0, z: 0, r: 520, h: 5 },
      { x: 0, z: 0, r: 475, h: 20 },
      { x: 0, z: 0, r: 446, h: 44 },
      { x: 0, z: 0, r: 430, h: 36 },
      { x: 0, z: 0, r: 385, h: 52 },
      { x: 0, z: 0, r: 340, h: 68 },
      { x: 0, z: 0, r: 338, h: 82 },
      { x: 0, z: 0, r: 295, h: 84 },
      { x: 0, z: 0, r: 250, h: 100 },
      { x: 0, z: 0, r: 205, h: 114 },
      // the court's colonnade, column by column (isle.ts COLONNADE: the bays north and south stand open), and the
      // two piers of the portal in its far side: the plane goes between them, not round the whole ring
      ...Array.from({ length: 28 }, (_, i) => i)
        .filter((i) => i !== 20 && i !== 21 && i !== 6 && i !== 7)
        .map((i) => ({ x: Math.cos(((i + 0.5) / 28) * Math.PI * 2) * 112, z: Math.sin(((i + 0.5) / 28) * Math.PI * 2) * 112, r: 3.4, h: 162 })),
      { x: -19, z: 111, r: 4, h: 166 },
      { x: 19, z: 111, r: 4, h: 166 },
    ],
    canvases: [{ painting: "paradise", x: -668, z: 54, yaw: -1.67 }],
  },
  gate: {
    id: "gate",
    title: "The Offering",
    year: "1909",
    music: "gate",
    place: "forest",
    air: AIR.gate,
    fog: [0.00015, 0.003],
    // a long valley between wooded heights, climbing to the pass; the terrace on the left, the altar on the right
    terrain: {
      base: 0,
      sines: [
        [0.006, 0.0035, 0.9, 4],
        [-0.0045, 0.0085, 2.6, 3],
        [0.0135, 0.0095, 0.3, 1.2],
      ],
      bumps: [
        [-800, 560, 440, 120],
        [820, 470, 460, 110],
        [-330, 330, 170, 22],
        [0, -700, 520, 64],
        [0, 1560, 320, 34],
      ],
      rim: [1700, 2600, 150],
    },
    water: null,
    centre: [0, 200],
    radius: 1450,
    ceil: 420,
    entry: { x: 0, z: 1480, above: 36, yaw: 0 },
    gate: { x: 0, z: -720, above: 48, yaw: 0 },
    // up the valley, under the ring of pearls and the dark smoke, between the terrace and the altar, to the pass;
    // then the whole length of the gorge between the leaning mountains
    path: [
      [0, 1480, 36],
      [-12, 1250, 30],
      [14, 1000, 26],
      [26, 760, 26],
      [10, 520, 28],
      [-8, 280, 30],
      [0, 40, 34],
      [0, -200, 42],
      [0, -430, 52],
      [2, -580, 54],
      [0, -720, 48],
      [0, -758, 48],
    ],
    obstacles: [
      // the two leaning mountains (worlds/offering/rock.ts GATE): their feet, and the walls that lean over the gorge
      ...[-1, 1].flatMap((sd) => [
        { x: sd * 445, z: -300, r: 300, h: 640, bell: true },
        { x: sd * 445, z: -650, r: 300, h: 640, bell: true },
        { x: sd * 445, z: -1000, r: 300, h: 640, bell: true },
        { x: sd * 300, z: -470, r: 190, h: 760 },
        { x: sd * 300, z: -830, r: 190, h: 760 },
      ]),
      // the terrace with its angel, and the altar
      { x: -330, z: 330, r: 180, h: 330 },
      // the citadel it belongs to: the wall running back to the mountain, the lower terraces down the valley
      { x: -318, z: 70, r: 70, h: 260 },
      { x: -330, z: -70, r: 70, h: 260 },
      { x: -410, z: 570, r: 175, h: 110 },
      { x: -480, z: 770, r: 150, h: 70 },
      // towers of its long walls, west and east of the valley
      { x: -690, z: 380, r: 34, h: 130 },
      { x: -920, z: 540, r: 34, h: 130 },
      { x: -810, z: 40, r: 34, h: 130 },
      { x: 800, z: 450, r: 34, h: 130 },
      { x: 980, z: 880, r: 34, h: 130 },
      { x: 320, z: -40, r: 56, h: 90 },
      // the two needles the way on stands between, where the plane meets them (they lean together overhead)
      { x: -41, z: -720, r: 7, h: 140 },
      { x: 41, z: -720, r: 7, h: 140 },
    ],
    canvases: [{ painting: "offering", x: -44, z: 1300, yaw: 0.42 }],
  },
  sea: {
    id: "sea",
    title: "Tranquility",
    year: "1904",
    music: "sea",
    place: "sea",
    air: AIR.sea,
    fog: [0.00011, 0.004],
    // no land at all: the glass of the bay, and the island (worlds/Sea.tsx) lying across it
    terrain: null,
    water: 0,
    centre: [200, 180],
    radius: 1900,
    ceil: 260,
    // (it comes in a kilometre and a half from the island's head: a long while over the glass with the whole of it in view)
    // (the way in is laid toward the island's head, not its middle: on a tall narrow screen the head and its two
    // eyes are then in the frame from the first, the long back running off to the left)
    entry: { x: 292, z: 1560, above: 14, yaw: -0.07 },
    // between the island's two eyes, at the waterline: the mouth, and a vault running into the rock; deep in it, where
    // the vault has narrowed to the width of the Funeral Symphony's cave, the way on (no arch of light: worlds/Sea.tsx)
    gate: { x: GROTTO.x, z: GROTTO.z - 128, above: 9, yaw: 0 },
    // out over the glass toward the island's head, the whole of it lying broadside to the left; then in under the
    // head as night falls, down the eyes' paths and between them
    path: [
      [292, 1560, 14],
      [296, 1440, 13],
      [301, 1320, 13],
      [304, 1200, 12],
      [303, 1080, 12],
      [300, 960, 12],
      [306, 830, 12],
      [312, 770, 12],
      [322, 640, 11],
      [328, 510, 10],
      [326, 380, 9],
      [316, 250, 9],
      [300, 130, 9],
      [292, 10, 9],
      [300, -110, 9],
      [330, -220, 9],
      [384, -320, 9],
      [GROTTO.x - 40, GROTTO.z + 110, 9],
      [GROTTO.x - 8, GROTTO.z + 36, 9],
      [GROTTO.x, GROTTO.z - 30, 9],
      [GROTTO.x, GROTTO.z - 128, 9],
      [GROTTO.x, GROTTO.z - 166, 9],
    ],
    // the island (worlds/sea/island.ts), as bells along it: the head stands either side of the grotto
    obstacles: [
      { x: GROTTO.x - 135, z: -625, r: 100, h: 270, bell: true },
      { x: GROTTO.x + 135, z: -625, r: 100, h: 250, bell: true },
      { x: 150, z: -640, r: 110, h: 180, bell: true },
      { x: -60, z: -640, r: 90, h: 120, bell: true },
      { x: -280, z: -640, r: 70, h: 100, bell: true },
      { x: -500, z: -640, r: 50, h: 60, bell: true },
      { x: 720, z: -640, r: 55, h: 70, bell: true },
    ],
    canvases: [{ painting: "tranquility", x: 250, z: 420, yaw: 0.8 }],
  },
  seafinale: {
    id: "seafinale",
    title: "Sonata of the Sea: Finale",
    year: "1908",
    music: "seafinale",
    place: "sea",
    air: AIR.seafinale,
    fog: [0.00006, 0.006],
    // all water: the great wave is this world's own height field (seafinale/shape.ts), standing a little over
    // the mean sea so the swell has room to run under the plane
    terrain: FINALE_TERRAIN,
    water: null,
    centre: [-500, 350],
    radius: 3300,
    ceil: 1950,
    pace: 3.0,
    entry: FINALE_ENTRY,
    // at the wave's far end, in the hanging lace of its crest: out through it, into calm (no arch of light)
    gate: FINALE_GATE,
    path: FINALE_PATH,
    obstacles: [],
    // (hung early on the way in, over the quiet sea: nothing stands before the wave once the weather turns)
    canvases: [{ painting: "sea-finale", x: 360, z: 1720, yaw: -0.34 }],
  },
  funeral: {
    id: "funeral",
    title: "Funeral Symphony VI",
    year: "1903",
    music: "funeral",
    place: "none",
    air: AIR.funeral,
    // (thicker air than before: the ranges stand one behind another, each paler, and the far ones are only a breath)
    fog: [0.00027, 0.0042],
    // colossal mountains, and the fin of rock the procession's road climbs in three switchbacks to the cave: the
    // land, the road, the path of light beside it and the way in are all worked out together in funeral/land.ts
    terrain: FUNERAL.terrain,
    water: null,
    centre: [0, 180],
    radius: 1320,
    ceil: 430,
    entry: FUNERAL.entry,
    // inside the cave's mouth, where the procession goes into the mountain (no arch of light: worlds/Funeral.tsx)
    gate: FUNERAL.gate,
    path: FUNERAL.path,
    // the two cypresses at the pass, the rock either side of the cave, the great walls
    obstacles: [...FUNERAL.obstacles],
    canvases: [{ painting: "funeral-vi", x: FUNERAL.canvas.x, z: FUNERAL.canvas.z, yaw: FUNERAL.canvas.yaw }],
  },
  kings: {
    id: "kings",
    title: "Fairy Tale of the Kings",
    year: "1909",
    music: "kings",
    place: "none",
    air: AIR.kings,
    // (the wood has its own mist: worlds/kings/light.ts)
    fog: [0.00002, 0.003],
    terrain: {
      base: 0,
      sines: [
        [0.017, 0.011, 0.4, 1.6],
        [-0.012, 0.021, 1.9, 1.2],
        [0.041, 0.033, 2.7, 0.4],
      ],
      // the rise the kings stand on; then hollows, which hold water: a stream wandering down the aisle from pool to
      // pool, a wider one in the clearing, and the still pool before the kings that the little world lies mirrored in
      bumps: [
        [0, KINGS.z, 150, 5],
        [-10, 655, 34, -3.2],
        [-76, 578, 30, -3],
        [-70, 500, 34, -3.3],
        [-26, 432, 30, -3],
        [44, 352, 62, -4.2],
        [60, 284, 30, -3],
        [32, 220, 32, -3.2],
        [-8, 158, 30, -3],
        [0, 70, 42, -3.4],
        [0, -30, 86, -4.6],
      ],
      rim: [760, 1200, 30],
    },
    water: null,
    centre: [0, 200],
    radius: 620,
    ceil: 150,
    entry: { x: 0, z: 700, above: 14, yaw: 0 },
    gate: null,
    // a long way in: the path winds wide between the great trunks, so that from the entry the kings are hidden and
    // their light is only glimpsed through the wood, now on one side, now on the other;
    // then it straightens into the glade, low, so the kings stand over the plane like hills for the whole of the
    // approach; only at the last does it climb to their hands, and between them into the light
    path: [
      [0, 700, 14],
      [-30, 632, 14],
      [-66, 560, 15],
      [-62, 490, 15],
      [-22, 420, 16],
      [36, 350, 16],
      [52, 285, 17],
      [30, 222, 19],
      [6, 156, 22],
      [0, 80, 27],
      [0, 20, 34],
      [0, -40, 46],
      [0, -85, 58],
      [0, -112, 68],
      [0, KINGS.z + KINGS.domeR + 5, KINGS.domeY + KINGS.domeR * 0.3],
      [0, KINGS.z, KINGS.domeY + KINGS.domeR * 0.28],
      [0, KINGS.z - 40, KINGS.domeY + KINGS.domeR * 0.28],
    ],
    obstacles: [
      { x: -114, z: KINGS.z, r: 60, h: 190 },
      { x: 114, z: KINGS.z, r: 60, h: 190 },
    ],
    canvases: [{ painting: "kings", x: -66, z: 648, yaw: 0.5 }],
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
// (briskly through the outer wood, easing as the light grows, slowest of all under the kings; the last of it a glide)
export const kingsPace = (ahead: number) => 0.42 + 0.3 * smooth01((ahead - 270) / 170) + 0.38 * smooth01((ahead - 520) / 220) + 0.08 * smooth01((90 - ahead) / 60);
// the level of the still water that lies in the wood's hollows
export const KINGS_WATER = -1.3;
// The eye is raised from the plane's own line toward the middle of the picture (between the dome and the
// crowns) and the lens opens a little as they come near, so both crowned heads stay in the frame until the
// plane is almost at their hands; then it comes down to the light.
export function kingsView(y: number, ahead: number) {
  const w = smooth01((500 - ahead) / 170) * (1 - smooth01((100 - ahead) / 60));
  const mid = kingsDome().y + KINGS.domeR * (1.85 + 0.25 * smooth01((230 - ahead) / 130));
  // how far above level the eye should look, and how much of that it has taken up
  const elev = Math.atan2(mid - y, Math.max(ahead, 30));
  // (a tall narrow screen sees less to either side: there the lens opens further, so both kings are still in it)
  const tall = typeof window !== "undefined" && window.innerHeight > window.innerWidth * 1.15;
  const fov = 50 + (tall ? 30 : 16) * smooth01((330 - ahead) / 190) - (tall ? 16 : 10) * smooth01((95 - ahead) / 60);
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
    // off the desk as the road climbs, then over the land and the water at the height each point asks for
    JOURNEY.forEach(([x, z, a], i) => ctl.push(new THREE.Vector3(x, i < 2 ? roadY(z) : Math.max(landH(x, z), homeWater(x, z)) + a, z)));
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
  // work the next world needs done before it is swapped in (a few milliseconds a call; true when it is finished): set by
  // worlds/Worlds.tsx when the cloud begins to close on a world that was not made ready, run by the plane under the cloud
  prep: null as (() => boolean) | null,
  quick: false, // this crossing arrived in a world that was ready: the cloud need not wait for it
  held: 0, // seconds the cloud has been closed
  skyFrom: null as SkyState | null,
  skyT: 1,
  lastSky: null as SkyState | null,
  throttle: 0.2, // one of SPEED_STEPS: Space and Shift (and the bar) step it
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
  // coming down to the desk (set by Room as the landing begins, cleared at take-off): nowhere else can be picked now
  landing: false,
  // where the plane went through the last gate, for the gate's ripple (side and height from its middle, metres)
  gateHit: null as { world: WorldId; side: number; up: number; at: number } | null,
  skyMod: null as ((s: SkyState) => SkyState) | null,
  warm: 0, // 0..1 the closing cloud is that world's light instead of the air's colour
  onHome: null as (() => void) | null,
  // where the plane is (world space) and how fast, written by Plane.tsx every frame of the flight: for whatever in a
  // world answers to its passing (worlds/play.tsx: lanterns, birds that part)
  planePos: new THREE.Vector3(0, -1e4, 0),
  planeSpeed: 0,
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
// A pick is always taken, whatever the cloud is doing, and the last one wins:
//   open air                      the cloud closes and leads there;
//   the cloud closing             it leads there instead (picking the world not yet left opens it again);
//   shut over a world just made,  the cloud closes again at once and that world is let go.
//   or opening on it
// The crossing itself is Plane.tsx's passage(): "closing" with `next` set is all it needs, from any phase.
// False only when there is nothing to do: not in the air, coming in to land, or already there (or on the way there).
export function travelTo(id: WorldId) {
  if (!voyage.flying || voyage.landing || voyage.homing) return false;
  if (id === travelDest()) return false;
  if (id === voyage.cur) {
    // (only while the cloud is still closing on the way somewhere else: stay)
    voyage.next = null;
    voyage.phase = "opening";
  } else {
    voyage.next = id;
    voyage.phase = "closing";
  }
  emit();
  return true;
}
// where the plane will be when the cloud next opens: the world it is in, unless the cloud is closing toward another
export const travelDest = () => (voyage.phase === "closing" && voyage.next ? voyage.next : voyage.cur);
// (a step is counted from where the plane is already going, so three quick presses go three worlds on)
export function travelStep(dir: 1 | -1) {
  const i = WORLD_ORDER.indexOf(travelDest());
  const j = Math.min(WORLD_ORDER.length - 1, Math.max(0, i + dir));
  return travelTo(WORLD_ORDER[j]);
}
// the world a pick is on its way to, for the list to mark; null in open air and once the plane has arrived
export const useTravel = () => useSyncExternalStore(subscribe, () => (voyage.phase === "closing" ? voyage.next : null), () => null);
// The speed, in six even steps from a slow drift to fast (Plane.tsx speedOf turns a step into metres a second).
// Space steps it up, Shift down; the flight bar shows the same six.
export const SPEED_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1];
export const speedStepOf = (thr: number) => SPEED_STEPS.reduce((best, v, i) => (Math.abs(v - thr) < Math.abs(SPEED_STEPS[best] - thr) ? i : best), 0);
export function setSpeedStep(i: number) {
  voyage.throttle = SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, Math.max(0, i))];
  emit();
}
export const stepSpeed = (dir: 1 | -1) => setSpeedStep(speedStepOf(voyage.throttle) + dir);
export const useSpeedStep = () => useSyncExternalStore(subscribe, () => speedStepOf(voyage.throttle), () => 1);
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
