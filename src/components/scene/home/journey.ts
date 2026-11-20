// The opening flight of the home world, written once and read by everything on its way.
//
// From the desk the plane goes north up the road, swings LEFT over the lake and finds the river where it leaves
// the lake's west end. It follows the river downstream, low over the water, past the mill at the rapids and
// through the wooden town that stands on both banks. Beyond the last houses it turns RIGHT, north, into the old
// forest: pines and oaks, deep fog, the light going to night as it goes deeper. The forest ends at the foot of the
// mountain, where a great arch is carved into the cliff, and in it the way to the painted worlds.
//
// The river and the town's ground are part of the land's height (land.ts): the river's lines are sums of sines so
// that JavaScript (trees, houses, the plane) and GLSL (the ground, the grass, the water) agree to the millimetre.

export const sst = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- the river ----------
// It runs from the lake's west end (x -60) west and a little north, to where it goes in under the forest (x -560).
export const RIVER = { x0: -60, x1: -560, lake: -3.2 };
export const riverZ = (x: number) => -45.3 + 0.328 * x - 0.000278 * x * x + 6 * Math.sin(x * 0.045 + 1.0);
export const riverSlope = (x: number) => 0.328 - 0.000556 * x + 0.27 * Math.cos(x * 0.045 + 1.0);
// half its width
export const riverW = (x: number) => 4.4 + 0.9 * Math.sin(x * 0.07 + 0.3) + 1.2 * sst(-200, -320, x);
// the water's level: the lake's at its mouth, down a run of rapids (the mill stands there) to the town's reach, and
// on, slower, toward the forest
export const riverWL = (x: number) => RIVER.lake - 2.3 * sst(-82, -165, x) - 0.9 * sst(-300, -540, x);
// how far a point is from the river's middle (metres, square to its course; a large number where it does not run)
export function riverD(x: number, z: number) {
  if (x > RIVER.x0 || x < RIVER.x1) return 99;
  const s = riverSlope(x);
  return Math.abs(z - riverZ(x)) / Math.sqrt(1 + s * s);
}

// ---------- the town ----------
// A wooden town on both banks: its market square on the south bank, the church on a rise on the north bank.
export const TOWN = { x: -246, z: riverZ(-246), r: 92 };
export const CHURCH = { x: -238, z: riverZ(-238) - 46 };
export const SQUARE = { x: -262, z: riverZ(-262) + 34 };

// The land of the river valley and the town, given the land's own height there. Near the river the ground is a
// low bank a metre above the water, the bed a metre under it; in the town it is a gently rising terrace, the
// church's rise on the north bank.
export function riverLand(h: number, x: number, z: number) {
  if (x > RIVER.x0 - 2 || x < RIVER.x1) return h;
  const d = riverD(x, z);
  const tw = Math.hypot(x - TOWN.x, z - TOWN.z);
  const wv = Math.max(1 - sst(26, 70, d), 1 - sst(TOWN.r, TOWN.r + 55, tw));
  if (wv <= 0) return h;
  const w = riverW(x);
  const wl = riverWL(x);
  const bank = wl + 1.15 * sst(w, w + 3.5, d) + 0.03 * Math.max(0, d - w - 3.5);
  const bed = wl - 1.05 * (1 - (d / w) * (d / w));
  const ch = Math.hypot(x - CHURCH.x, z - CHURCH.z);
  const rise = 3.4 * Math.exp(-(ch * ch) / 900);
  let v = (d < w ? bed : bank) + rise;
  // (out at the valley's edge it rises with the land; the river's own cut always wins near the water)
  v = h + (v - h) * wv;
  return Math.min(v, d < w + 3.5 ? bank : 1e9);
}

// the same in GLSL (land.ts includes it before its own landH)
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
export const GLSL_RIVER = /* glsl */ `
float sst(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float riverZ(float x){ return -45.3 + 0.328 * x - 0.000278 * x * x + 6.0 * sin(x * 0.045 + 1.0); }
float riverSlope(float x){ return 0.328 - 0.000556 * x + 0.27 * cos(x * 0.045 + 1.0); }
float riverW(float x){ return 4.4 + 0.9 * sin(x * 0.07 + 0.3) + 1.2 * sst(-200.0, -320.0, x); }
float riverWL(float x){ return ${f(RIVER.lake)} - 2.3 * sst(-82.0, -165.0, x) - 0.9 * sst(-300.0, -540.0, x); }
float riverD(vec2 p){
  if (p.x > ${f(RIVER.x0)} || p.x < ${f(RIVER.x1)}) return 99.0;
  float s = riverSlope(p.x);
  return abs(p.y - riverZ(p.x)) / sqrt(1.0 + s * s);
}
float riverLand(float h, vec2 p){
  if (p.x > ${f(RIVER.x0 - 2)} || p.x < ${f(RIVER.x1)}) return h;
  float d = riverD(p);
  float tw = length(p - vec2(${f(TOWN.x)}, ${f(TOWN.z)}));
  float wv = max(1.0 - sst(26.0, 70.0, d), 1.0 - sst(${f(TOWN.r)}, ${f(TOWN.r + 55)}, tw));
  if (wv <= 0.0) return h;
  float w = riverW(p.x);
  float wl = riverWL(p.x);
  float bank = wl + 1.15 * sst(w, w + 3.5, d) + 0.03 * max(0.0, d - w - 3.5);
  float bed = wl - 1.05 * (1.0 - (d / w) * (d / w));
  vec2 cq = p - vec2(${f(CHURCH.x)}, ${f(CHURCH.z)});
  float rise = 3.4 * exp(-dot(cq, cq) / 900.0);
  float v = (d < w ? bed : bank) + rise;
  v = h + (v - h) * wv;
  return min(v, d < w + 3.5 ? bank : 1e9);
}
// the river's surface over a point (-1e4 where there is none)
float riverLevel(vec2 p){ return riverD(p) < riverW(p.x) + 0.6 ? riverWL(p.x) : -1e4; }
`;
export const riverLevel = (x: number, z: number) => (riverD(x, z) < riverW(x) + 0.6 ? riverWL(x) : -1e4);

// ---------- the forest and the mountain ----------
// The cave: its mouth's middle on the ground, and the way it faces (the plane flies in toward -z, yaw as the gates')
export const CAVE = { x: -366, z: -668, yaw: 0.06, half: 12.5, rise: 25, above: 9 };
// the mountain the cave is cut into: its heart, how high its head stands over the cave's floor
export const PEAK = { x: -392, z: -812, h: 205 };
// The forest's flight line: from the town's last houses north to the cave. The forest stands either side of it
// and keeps a lane open along it, under the crowns.
export const FOREST_LINE: [number, number][] = [
  [-316, -176],
  [-334, -214],
  [-343, -262],
  [-342, -318],
  [-336, -376],
  [-344, -436],
  [-356, -494],
  [-362, -552],
  [-365, -606],
  [-366, -650],
];
function segD(x: number, z: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return { d: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), t };
}
// distance from the forest's flight line, and how far along it (0 at the town, 1 at the cave)
export function laneD(x: number, z: number) {
  let best = 1e9;
  let along = 0;
  const n = FOREST_LINE.length - 1;
  for (let i = 0; i < n; i++) {
    const s = segD(x, z, FOREST_LINE[i], FOREST_LINE[i + 1]);
    if (s.d < best) {
      best = s.d;
      along = (i + s.t) / n;
    }
  }
  return { d: best, along };
}
// how much of the old forest stands at a point (0..1): thick either side of the lane from the town's edge to the
// mountain's foot
export function journeyWood(x: number, z: number) {
  if (x > -200 || x < -560 || z > -150 || z < -700) return 0;
  const { d, along } = laneD(x, z);
  if (d > 150) return 0;
  const ends = sst(0.0, 0.08, along) * (1 - sst(0.9, 0.99, along));
  return (1 - sst(70, 150, d)) * ends;
}

// ---------- the path of light ----------
// [x, z, metres above whatever is under it (land or water)]; the first two climb off the desk as the old road did
// (their height is the road's, see voyage.ts).
export const JOURNEY: [number, number, number][] = [
  [1.5, -14, 0],
  [1.3, -30, 0],
  [-3, -50, 5.2],
  [-16, -70, 6.4],
  [-38, -84, 6.8],
  [-62, -84, 6.6],
  [-90, -80, 6.2],
  [-118, -86, 6.0],
  [-146, -98, 6.0],
  [-172, -114, 6.2],
  [-198, -128, 6.4],
  [-222, -135, 6.6],
  [-246, -142, 6.8],
  [-270, -150, 6.8],
  [-292, -160, 6.8],
  ...FOREST_LINE.map(([x, z], i): [number, number, number] => [x, z, i < 2 ? 7.2 : 7.0]),
  [-367, -690, 9],
  [-368, -712, 9],
];
