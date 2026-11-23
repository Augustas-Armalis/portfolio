import type { Obstacle, Terrain } from "../voyage";

// Friendship (Draugystė, 1906–1907): the plan of the cave, in the world's own metres (the plane comes in flying
// toward -z). Kept free of runtime imports from voyage.ts, which imports this.
//
// A passage opens into a chamber some 900 m across and 480 m high. Far down it, she stands on the right:
// a colossal figure seen in profile, facing left across the way, her body dissolving into the dark of the floor,
// a crown of rays streaming up and back from her head. Her open hand holds the orb out over the path of light at
// the height of her face. The orb is the way on: the plane flies into it.

// the orb: where it hangs and how big it is (the gate is at its heart)
export const ORB = { x: 0, y: 150, z: 0, r: 20 };
// her head: the centre of the skull, and its height from chin to crown (the orb's diameter, as in the picture)
export const HEAD = { x: 64, y: 156, z: 0, h: 42 };

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
export const CAVE_Z: [number, number] = [-520, 1010];
export function caveAt(z: number) {
  // the chamber, the throat where the passage opens into it, the passage
  const open = sst(730, 500, z);
  let w = 110 + (440 - 110) * open;
  let top = 160 + (480 - 160) * open;
  // (the chamber swells a little toward its middle, where she stands)
  w *= 1 + 0.06 * Math.exp(-(((z - 60) / 260) ** 2));
  // the ends close as the inside of a dome
  const far = Math.max(0, (z - CAVE_Z[0]) / 200);
  const near = Math.max(0, (CAVE_Z[1] - z) / 70);
  const k = Math.sqrt(Math.min(1, far * (2 - Math.min(far, 1)))) * Math.sqrt(Math.min(1, near * (2 - Math.min(near, 1))));
  w *= Math.max(0.02, k);
  top = 30 + (top - 30) * Math.max(0.02, k);
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
export const FRIEND_PATH: [number, number, number][] = over([
  [0, 880, 28],
  [-6, 780, 32],
  [-20, 660, 44],
  [-40, 520, 68],
  [-36, 390, 92],
  [-24, 270, 116],
  [-11, 160, 136],
  [-3, 70, 147],
  [0, 0, ORB.y],
  [0, -40, ORB.y],
]);
export const FRIEND_ENTRY = { x: 0, z: 880, above: FRIEND_PATH[0][2], yaw: 0 };
export const FRIEND_GATE = { x: ORB.x, z: ORB.z, above: ORB.y - floorAt(ORB.x, ORB.z), yaw: 0 };
export const FRIEND_CANVAS = { x: 46, z: 700, yaw: -0.6 };

// what the plane slides round: her body, her head, the arm she holds out (the hand under the orb is below the way)
export const FRIEND_OBSTACLES: Obstacle[] = [
  { x: 118, z: 0, r: 70, h: 120, bell: true },
  { x: 70, z: 0, r: 30, h: 196 },
  { x: 52, z: 18, r: 14, h: 104 },
  { x: 30, z: 12, r: 12, h: 120 },
];
