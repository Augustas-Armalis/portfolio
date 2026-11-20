import type { Obstacle, Terrain } from "../voyage";

// The Sonata of the Sun as numbers: a vast open plain, a road across it, two aqueducts that cross the whole of it,
// and the city of bells standing far off, each bell hundreds of metres from the next. Nothing here draws, and
// nothing here reads the journey's map (worlds/voyage.ts reads this), so the land, the road, the path of light
// and the things the plane must fly round are all worked out together.
//
// The plane comes in over a rise at the plain's southern edge (z = +1780) and flies north (toward -z): two and a
// half kilometres of open field with the bells in the haze ahead and the great sun behind them, under the first
// aqueduct, past the low dome, through the tall aqueduct, and only then in among the giants.

// the sun stands low behind the great bell as the plane arrives (degrees; the sky's own numbers: voyage.ts AIR.sun)
export const SUN_SKY = { az: 7, el: 13, keyAz: 6, keyEl: 17 };

export const SUN_TERRAIN: Terrain = {
  base: 3,
  // long low swells: nothing on this plain is steep
  sines: [
    [0.0031, 0.0012, 0.4, 7],
    [-0.0019, 0.0037, 1.9, 6],
    [0.0071, 0.0053, 3.1, 2.4],
    [0.0127, -0.0098, 0.7, 1.1],
  ],
  bumps: [
    // the rise the plane comes in over: the whole plain is first seen from its height
    [-60, 1960, 430, 54],
    // the swell the city stands on
    [150, -900, 640, 22],
    [-950, 760, 520, 24],
    [1050, 320, 560, 20],
    [-1150, -720, 540, 28],
    [1250, -1350, 620, 26],
  ],
  // far hills all round, in the haze
  rim: [2500, 3700, 130],
};

// The road: it wanders a little, and the path of light follows it as far as the tall aqueduct.
export const sunRoadX = (z: number) => 60 * Math.sin(z * 0.0021 + 0.5) + 28 * Math.sin(z * 0.0053 + 2.0);
const roadSlope = (z: number) => 60 * 0.0021 * Math.cos(z * 0.0021 + 0.5) + 28 * 0.0053 * Math.cos(z * 0.0053 + 2.0);
export const SUN_ROAD_GLSL = /* glsl */ `float sunRoadX(float z){ return 60.0 * sin(z * 0.0021 + 0.5) + 28.0 * sin(z * 0.0053 + 2.0); }`;
// (it runs from the rise to the foot of the great bell)
export const SUN_ROAD_Z: [number, number] = [-640, 2150];

// the bells: [x, z, radius at the foot, height]. The first is the great bell with the keyhole niche, the third
// carries the twin towers, the fourth is the low dome with the great drawn sun on its face.
export const SUN_BELLS: [number, number, number, number][] = [
  [140, -900, 120, 640],
  [-360, -520, 82, 410],
  [440, -430, 72, 370],
  [-290, 330, 96, 150],
  [-560, -1080, 68, 330],
  [640, -1020, 62, 300],
  [-60, -1420, 92, 450],
];

// The aqueducts: each crosses the road at `c`, an arch centred on it; `u` runs along the bridge, `n` arches (odd)
// of `w` metres, `H` high. worlds/Sun.tsx builds them; their shadows are laid on the ground from the same numbers.
export type SunBridge = { c: [number, number]; u: [number, number]; n: number; w: number; H: number; tiers: number };
const unit = (x: number, z: number): [number, number] => [x / Math.hypot(x, z), z / Math.hypot(x, z)];
export const SUN_BRIDGES: SunBridge[] = [
  { c: [sunRoadX(640), 640], u: unit(0.9925, -0.122), n: 15, w: 100, H: 96, tiers: 1 },
  { c: [sunRoadX(-60), -60], u: unit(0.97, -0.243), n: 9, w: 120, H: 230, tiers: 2 },
];

// the gatehouses that stand over the road: [x, z, yaw, scale]
const gateAt = (z: number, s: number): [number, number, number, number] => [sunRoadX(z), z, Math.atan(roadSlope(z)), s];
export const SUN_GATEHOUSES: [number, number, number, number][] = [gateAt(1200, 1.9), gateAt(230, 2.4)];

// The way: down off the rise and along the road, low, the whole plain open on either hand; under the first
// aqueduct and through the tall one; then up among the bells, round the great one past its niche, and out over
// the open plain beyond toward the sun.
const APPROACH: [number, number][] = [
  [1780, 30],
  [1660, 30],
  [1520, 34],
  [1360, 36],
  [1200, 26],
  [1050, 26],
  [900, 24],
  [770, 26],
  [640, 30],
  [500, 34],
  [360, 40],
  [230, 44],
  [80, 54],
  [-60, 62],
];
const CITY: [number, number, number][] = [
  [18, -200, 80],
  [-60, -400, 105],
  [-130, -600, 135],
  [-150, -810, 170],
  [-110, -1040, 200],
  [60, -1190, 205],
  [300, -1170, 180],
  [470, -1340, 130],
  [560, -1540, 80],
  [610, -1740, 44],
  [622, -1790, 44],
];
export const SUN_PATH: [number, number, number][] = [...APPROACH.map(([z, a]): [number, number, number] => [sunRoadX(z), z, a]), ...CITY];
export const SUN_ENTRY = { x: sunRoadX(1780), z: 1780, above: 30, yaw: Math.atan2(roadSlope(1780), 1) };
export const SUN_GATE = { x: 610, z: -1740, above: 44, yaw: Math.atan2(-50, 200) };
export const SUN_CANVAS = { x: sunRoadX(1470) - 96, z: 1470, yaw: 0.7 };

export const SUN_OBSTACLES: Obstacle[] = [
  ...SUN_BELLS.map(([x, z, R, H]) => ({ x, z, r: R, h: H, bell: true })),
  // the towers of the two gatehouses over the road
  ...SUN_GATEHOUSES.flatMap(([x, z, yaw, s]) => [-1, 1].map((sd) => ({ x: x + Math.cos(yaw) * sd * 15 * s, z: z - Math.sin(yaw) * sd * 15 * s, r: 5 * s + 1, h: 68 * s }))),
  // the piers either side of the way through each aqueduct
  ...SUN_BRIDGES.flatMap((b) => [-1, 1].map((sd) => ({ x: b.c[0] + b.u[0] * sd * b.w * 0.5, z: b.c[1] + b.u[1] * sd * b.w * 0.5, r: b.w * 0.14 + 2, h: b.H * (b.tiers > 1 ? 1.4 : 1) + 12 }))),
];

// the garden of the Andante: an oval of dark earth on the plain, winding paths of pale gold through it and small
// dark trees between them (centre, half-axes, the turn of its long axis)
export const SUN_GARDEN = { x: -420, z: 1010, a: 250, b: 130, yaw: 0.32 };
