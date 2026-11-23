import type { Obstacle, Terrain } from "../voyage";

// Friendship (Draugystė, 1906–1907): the plan of the cave, in the world's own metres (the plane comes in flying
// toward -z). Kept free of runtime imports from voyage.ts, which imports this.
//
// A passage opens into a chamber some 900 m across and 480 m high. Far down it, she stands on the right:
// a colossal figure seen in profile, facing left across the way, her body dissolving into the dark of the floor,
// a crown of rays streaming up and back from her head. Her open hand holds the orb out over the path of light at
// the height of her face. The orb is the way on: the plane flies into it.

// the orb: where it hangs and how big it is (the gate is at its heart)
// (larger than the gate's own catch: the plane is also taken through when it enters the orb anywhere: Friendship.tsx)
// (it hangs a little behind the picture's plane, so her painted fingers lie in front of it)
export const ORB = { x: 0, y: 132, z: -36, r: 34 };
// the picture laid over her: its size in pixels, where the orb's centre is in it and its radius, and metres a pixel
// (so the painted orb and the real one are the same)
export const PAINT = { w: 1280, h: 1481, cx: 252, cy: 785, r: 207, s: 34 / 207 };
// where things of the picture stand in the cave (metres)
const px = (x: number, y: number) => ({ x: ORB.x + (x - PAINT.cx) * PAINT.s, y: ORB.y + (PAINT.cy - y) * PAINT.s });
// her head (the middle of her face, in the picture), for the lens and the lights
export const HEAD = { ...px(800, 560), z: -4, h: 40 };

// the floor of the cave: nearly level, a long low swell under her and a hollow before her where the mist lies
export const FRIEND_TERRAIN: Terrain = {
  base: 0,
  sines: [
    [0.0071, 0.0043, 0.6, 2.2],
    [-0.0052, 0.0091, 2.1, 1.6],
    [0.019, 0.013, 1.2, 0.5],
  ],
  bumps: [
    [150, 10, 160, 18],
    [-150, -60, 150, -6],
    [-260, 320, 180, 22],
    [280, 420, 160, 16],
  ],
  rim: [1, 2, 0],
};

const sst = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// The cave's cross-section at z: its half-width at the widest, and the height of the vault's crown. The far end is
// closed in a rounded wall, the passage behind the entry too (it is never seen: the plane comes out of the cloud
// flying away from it).
// (the way in is the home mountain's own tunnel going on: as narrow and dark as the cave the plane entered there,
// home/journey.ts MOUTH, for two hundred metres; then it opens, and the cavern is beyond)
export const CAVE_Z: [number, number] = [-520, 1040];
export const TUNNEL = { z0: 780, half: 22, top: 34 };
export function caveAt(z: number) {
  // the cavern, the throat where the tunnel opens into it, the tunnel
  const open = sst(TUNNEL.z0, 520, z);
  let w = TUNNEL.half + (440 - TUNNEL.half) * open * open;
  let top = TUNNEL.top + (480 - TUNNEL.top) * open;
  // (the chamber swells a little toward its middle, where she stands)
  w *= 1 + 0.06 * Math.exp(-(((z - 60) / 260) ** 2));
  // the ends close as the inside of a dome
  const far = Math.max(0, (z - CAVE_Z[0]) / 200);
  const near = Math.max(0, (CAVE_Z[1] - z) / 40);
  const k = Math.sqrt(Math.min(1, far * (2 - Math.min(far, 1)))) * Math.sqrt(Math.min(1, near * (2 - Math.min(near, 1))));
  w *= Math.max(0.02, k);
  top = Math.min(top, 30) + (top - Math.min(top, 30)) * Math.max(0.02, k);
  return { w, top };
}

// out of the low passage into the chamber, a little to the left so she is seen across the way and her face turns
// toward the plane; then rising, straight at the orb, to its heart
// (the floor's height, as voyage.ts reckons it: the path is planned in heights over the cave's datum, and the
// orb's heart must be exactly where the gate is)
export function floorAt(x: number, z: number) {
  const t = FRIEND_TERRAIN;
  let h = t.base;
  for (const s of t.sines) h += s[3] * Math.sin(s[0] * x + s[1] * z + s[2]);
  for (const b of t.bumps) h += b[3] * Math.exp(-((x - b[0]) ** 2 + (z - b[1]) ** 2) / (b[2] * b[2]));
  return h;
}
const over = (pts: [number, number, number][]) => pts.map(([x, z, y]): [number, number, number] => [x, z, y - floorAt(x, z)]);
// (in low under the trees, winding a little between the trunks; out through the arch of rock where the wood opens
// and she stands across the clearing; then up, straight at the orb)
export const FRIEND_PATH: [number, number, number][] = over([
  [0, 975, 13],
  [0, 900, 13],
  [1, 820, 14],
  [-2, 740, 16],
  [-14, 640, 17],
  [-4, 560, 17],
  [6, 480, 18],
  [0, 400, 20],
  [-4, 330, 24],
  [6, 250, 62],
  [22, 170, 96],
  [20, 100, 118],
  [9, 45, 129],
  [0, ORB.z, ORB.y],
  [0, ORB.z - 40, ORB.y],
]);
// the arch of rock the way passes under as the wood opens
export const ARCH = { x: -3, z: 345 };
// the clearing she stands in, where no tree grows (an ellipse round the picture), and the lane the way keeps open
export function clear(x: number, z: number, pathX: (z: number) => number) {
  // (in front of her only: behind her the wood stands close, dark trunks going up into the haze as his strokes do)
  const inClearing = ((x - 55) / 200) ** 2 + ((z - 150) / 215) ** 2 < 1 || (z > -40 && z < 150 && x > -110 && x < 200);
  const inLane = z > -60 && Math.abs(x - pathX(z)) < 20;
  return inClearing || inLane;
}
export const FRIEND_ENTRY = { x: 0, z: 975, above: FRIEND_PATH[0][2], yaw: 0 };
export const FRIEND_GATE = { x: ORB.x, z: ORB.z, above: ORB.y - floorAt(ORB.x, ORB.z), yaw: 0 };
export const FRIEND_CANVAS = { x: -40, z: 600, yaw: 0.6 };

// what the plane slides round: her body, her head, the arm she holds out (the hand under the orb is below the way)
export const FRIEND_OBSTACLES: Obstacle[] = [
  { x: 115, z: -10, r: 58, h: 270 },
  { x: 62, z: 0, r: 26, h: 120 },
];
