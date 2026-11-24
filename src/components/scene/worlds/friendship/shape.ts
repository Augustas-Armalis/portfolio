import type { Obstacle, Terrain } from "../voyage";

// Friendship (Draugystė, 1906–1907): the plan of the cave, in the world's own metres (the plane comes in flying
// toward -z). Kept free of runtime imports from voyage.ts, which imports this.
//
// Three places, one after another. The tunnel from home: narrow, dark, dripping. Then it opens a little: a hall
// of fog some four hundred metres across with a wood in it, and enormous shapes glimpsed beyond. Then the throat,
// and the cavern itself: three kilometres across, its walls and its pillars going up out of sight into the haze,
// light falling in shafts from cracks far above, an old forest on its floor. At the far side of it she stands,
// six hundred metres to the crown of her head, in profile, facing left across the way, and on her open hand the
// orb: the core of the earth, the one light of the whole cavern. The orb is the way on: the plane flies into it.

// the orb: where it hangs and how big it is (the gate is at its heart)
// (larger than the gate's own catch: the plane is also taken through when it enters the orb anywhere: Friendship.tsx)
export const ORB = { x: 0, y: 330, z: -1150, r: 85 };
// the picture: its size in pixels, where the orb's centre is in it and its radius (the orb is drawn from it)
export const PAINT = { w: 1280, h: 1481, cx: 252, cy: 785, r: 207, s: 34 / 207 };
// Her (friendship/figure.ts). She is sculpted about a small orb in her own measure, and stood in the cavern two and
// a half times that size, the two orbs made one: so `MODEL` is where things are as she was made, `HER_K` how much
// larger she stands, and `herAt` where a point of her is in the cavern.
export const MODEL = { orb: { x: 0, y: 132, z: -36, r: 34 }, her: { x: 140, y: 187, z: -50, u: 76 } };
export const HER_K = ORB.r / MODEL.orb.r;
export const herAt = (x: number, y: number, z: number): [number, number, number] => [ORB.x + (x - MODEL.orb.x) * HER_K, ORB.y + (y - MODEL.orb.y) * HER_K, ORB.z + (z - MODEL.orb.z) * HER_K];
// the middle of her face, for the lens and the lights
const face = herAt(112, 180, -50);
export const HEAD = { x: face[0], y: face[1], z: face[2], h: 60 * HER_K };

// the floor: nearly level in the tunnel and the hall; in the cavern long swells, a rise under her and a wide hollow
// before her where the mist lies
export const FRIEND_TERRAIN: Terrain = {
  base: 0,
  sines: [
    [0.0071, 0.0043, 0.6, 2.2],
    [-0.0052, 0.0091, 2.1, 1.6],
    [0.019, 0.013, 1.2, 0.5],
  ],
  bumps: [
    [150, 600, 160, 12],
    [-150, 480, 150, -5],
    [-560, -420, 420, 46],
    [640, -260, 380, 34],
    [0, -820, 380, -26],
    [520, -1200, 420, 38],
    [-420, -1560, 520, 60],
    [460, -1980, 520, 44],
  ],
  rim: [1, 2, 0],
};

const sst = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// The cave's cross-section at z: its half-width at the widest, and the height of the vault's crown. Both ends are
// closed in a rounded wall (the near one is never seen: the plane comes out of the cloud flying away from it).
// (the way in is the home mountain's own tunnel going on: as narrow and dark as the cave the plane entered there,
// home/journey.ts MOUTH, for two hundred and sixty metres; then the hall, then the throat, then the cavern)
export const CAVE_Z: [number, number] = [-2900, 1040];
export const TUNNEL = { z0: 780, half: 22, top: 34 };
export const HALL = { z1: 330, half: 195, top: 215 };
export const CAVERN = { half: 1500, top: 1700 };
// The tunnel is a passage the water made, not a pipe: it bends a little one way and then the other, it is wide in
// places and close in others, and its roof comes low and then goes up into the dark. (Nothing of this at its mouth,
// which is as it was.) `tunnelX` is where its middle runs; the way through it runs there too.
const tunnelU = (z: number) => (z - TUNNEL.z0) / (CAVE_Z[1] - TUNNEL.z0);
export function tunnelX(z: number) {
  const u = tunnelU(z);
  if (u <= 0 || u >= 1) return 0;
  return 8.5 * Math.sin(u * Math.PI * 2) * sst(0, 0.14, u) * (1 - sst(0.86, 1, u));
}
export function caveAt(z: number) {
  const a = sst(TUNNEL.z0, 560, z);
  let w = TUNNEL.half + (HALL.half - TUNNEL.half) * a * a;
  let top = TUNNEL.top + (HALL.top - TUNNEL.top) * a;
  const u = tunnelU(z);
  if (u > 0) {
    const env = sst(0, 0.12, u);
    w *= 1 + env * (0.34 * Math.sin(u * 8.2 + 0.5) + 0.14 * Math.sin(u * 19.5 + 2));
    const hi = 0.5 + 0.5 * Math.sin(u * 5.6 + 3.6);
    top = top * (1 - env) + env * (25 + 32 * Math.pow(hi, 1.3) + 2.5 * Math.sin(u * 17 + 1));
  }
  // (the throat: the hall's far end opens out and up all at once)
  const h = sst(HALL.z1 + 40, -330, z);
  w += (CAVERN.half - HALL.half) * h * h;
  top += (CAVERN.top - HALL.top) * Math.pow(h, 1.3);
  // the ends close as the inside of a dome
  const far = Math.max(0, (z - CAVE_Z[0]) / 760);
  const near = Math.max(0, (CAVE_Z[1] - z) / 40);
  const k = Math.sqrt(Math.min(1, far * (2 - Math.min(far, 1)))) * Math.sqrt(Math.min(1, near * (2 - Math.min(near, 1))));
  w *= Math.max(0.02, k);
  top = Math.min(top, 30) + (top - Math.min(top, 30)) * Math.max(0.02, k);
  return { w, top };
}

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
// Low through the tunnel; low under the trees of the hall, winding a little; out of the throat and up over the
// forest's tops, a long way down the cavern a little to the left of her, so that she is seen whole and from far,
// and grows; then rising, straight at the orb, to its heart.
export const FRIEND_PATH: [number, number, number][] = over([
  ...[975, 945, 915, 885, 855, 825, 800].map((z): [number, number, number] => [tunnelX(z), z, 13 + (975 - z) * 0.008]),
  [-2, 740, 16],
  [-12, 650, 20],
  [-4, 560, 26],
  [8, 470, 34],
  [0, 390, 46],
  [-12, 300, 76],
  [-44, 150, 118],
  [-74, -50, 156],
  [-84, -300, 190],
  [-64, -560, 228],
  [-34, -790, 268],
  [-10, -980, 306],
  [0, ORB.z, ORB.y],
  [0, ORB.z - 110, ORB.y],
]);
// the great pillars of the cavern: where each stands and how thick it is at its waist (they go up to the vault)
export const PILLARS: [number, number, number][] = [
  [-540, 60, 86],
  [470, 110, 104],
  [-800, -430, 124],
  [860, -360, 98],
  [-470, -860, 78],
  [-1010, -1180, 132],
  [1040, -1360, 118],
  [-330, -1900, 112],
  [560, -2140, 146],
  [-1190, -640, 96],
  [1220, -820, 108],
];
// where no tree grows: where she herself stands and where her sleeve falls, round every pillar's foot, and the
// lane the way keeps open while it is low
const body = herAt(190, 0, -50);
export function clear(x: number, z: number, pathX: (z: number) => number) {
  const inHer = ((x - body[0]) / (135 * HER_K)) ** 2 + ((z - body[2]) / (165 * HER_K)) ** 2 < 1;
  const inLane = z > HALL.z1 - 60 && Math.abs(x - pathX(z)) < 20;
  let atPillar = false;
  for (const p of PILLARS) if ((x - p[0]) ** 2 + (z - p[1]) ** 2 < (p[2] * 2.1) ** 2) atPillar = true;
  return inHer || inLane || atPillar;
}
export const FRIEND_ENTRY = { x: tunnelX(975), z: 975, above: FRIEND_PATH[0][2], yaw: 0 };
export const FRIEND_GATE = { x: ORB.x, z: ORB.z, above: ORB.y - floorAt(ORB.x, ORB.z), yaw: 0 };
export const FRIEND_CANVAS = { x: -40, z: 600, yaw: 0.6 };

// what the plane slides round: her body, the arm she holds out (the hand under the orb is below the way), the pillars
const arm = herAt(100, 0, 8);
export const FRIEND_OBSTACLES: Obstacle[] = [
  { x: herAt(180, 0, -50)[0], z: body[2], r: 92 * HER_K, h: 270 * HER_K },
  { x: arm[0], z: arm[2], r: 34 * HER_K, h: 96 * HER_K },
  ...PILLARS.map((p) => ({ x: p[0], z: p[1], r: p[2] * 1.5, h: 1200 })),
];
