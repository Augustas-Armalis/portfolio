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
// A wooden town on both banks. On the south bank the market square and the white wooden church; on the north bank
// the town climbs a hill in terraces, and on the hill's head stands the red-brick castle (as Trakai, or Kaunas's).
export const TOWN = { x: -246, z: riverZ(-246), r: 92 };
export const SQUARE = { x: -262, z: riverZ(-262) + 34 };
export const CHURCH = { x: -270, z: riverZ(-270) + 60 };
export const HILL = { x: -212, z: riverZ(-212) - 92, h: 22, top: 20, foot: 82, step: 4.5, terr: 0.9 };
// the street that winds up the hill from the quay to the castle's gate: its angle round the hill at a radius
export const hillRoadA = (r: number) => Math.atan2(TOWN.z - HILL.z, TOWN.x - HILL.x) + (r - HILL.top) * 0.045;
// the hill's own height over the valley floor: a dome, its flanks gently terraced so houses stand on the flats
export function hillH(x: number, z: number) {
  const r = Math.hypot(x - HILL.x, z - HILL.z);
  if (r >= HILL.foot) return 0;
  const H = HILL.h * (1 - sst(HILL.top, HILL.foot, r));
  return H - (HILL.terr * HILL.step * Math.sin((2 * Math.PI * H) / HILL.step)) / (2 * Math.PI);
}

// The land of the river valley and the town, given the land's own height there. Near the river the ground is a
// low bank a metre above the water, the bed a metre under it; in the town it is a gently rising terrace, the
// church's rise on the north bank.
export function riverLand(h: number, x: number, z: number) {
  if (x > RIVER.x0 - 2 || x < RIVER.x1) return h;
  const d = riverD(x, z);
  const tw = Math.hypot(x - TOWN.x, z - TOWN.z);
  // (it comes in over twenty metres out of the lake: no step where it begins)
  const wv = Math.max(1 - sst(26, 70, d), 1 - sst(TOWN.r, TOWN.r + 55, tw)) * sst(RIVER.x0 - 2, RIVER.x0 - 22, x);
  if (wv <= 0) return h + hillH(x, z);
  const w = riverW(x);
  const wl = riverWL(x);
  const bank = wl + 1.0 * sst(w - 0.4, w + 8, d) + 0.03 * Math.max(0, d - w - 8);
  const bed = wl - 1.05 * (1 - (d / w) * (d / w));
  let v = d < w ? bed : bank;
  // (out at the valley's edge it rises with the land; the river's own cut always wins near the water)
  v = h + (v - h) * wv + hillH(x, z);
  return d < w + 8 ? h + (Math.min(v, bank) - h) * sst(RIVER.x0 - 2, RIVER.x0 - 22, x) : v;
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
float hillH(vec2 p){
  float r = length(p - vec2(${f(HILL.x)}, ${f(HILL.z)}));
  if (r >= ${f(HILL.foot)}) return 0.0;
  float H = ${f(HILL.h)} * (1.0 - sst(${f(HILL.top)}, ${f(HILL.foot)}, r));
  return H - ${f(HILL.terr)} * ${f(HILL.step)} * sin(6.2831853 * H / ${f(HILL.step)}) / 6.2831853;
}
// the town's streets (0..1): the quays along both banks, the market square, the street winding up the castle hill
float townStreet(vec2 p){
  if (length(p - vec2(${f(TOWN.x)}, ${f(TOWN.z)})) > ${f(TOWN.r + 40)}) return 0.0;
  float k = 0.0;
  float d = riverD(p);
  float w = riverW(p.x);
  // the quays: the north one from the mill west to the town's last houses, where it goes on as the forest's track;
  // the south one from where the path from the desk comes in, past the square and the bridge, to the town's end
  float north = step(p.y, riverZ(p.x));
  float reach = north > 0.5 ? sst(-122.0, -134.0, p.x) * (1.0 - sst(-298.0, -310.0, p.x)) : sst(-176.0, -188.0, p.x) * (1.0 - sst(-294.0, -306.0, p.x));
  k = max(k, (1.0 - sst(1.5, 2.5, abs(d - w - 5.4))) * reach);
  vec2 sq = p - vec2(${f(SQUARE.x)}, ${f(SQUARE.z)});
  k = max(k, 1.0 - sst(17.0, 20.0, length(sq * vec2(1.0, 1.12))));
  vec2 hq = p - vec2(${f(HILL.x)}, ${f(HILL.z)});
  float r = length(hq);
  float a0 = atan(${f(TOWN.z)} - ${f(HILL.z)}, ${f(TOWN.x)} - ${f(HILL.x)}) + (r - ${f(HILL.top)}) * 0.045;
  float da = abs(mod(atan(hq.y, hq.x) - a0 + 3.14159265, 6.2831853) - 3.14159265) * r;
  k = max(k, (1.0 - sst(1.8, 2.8, da)) * step(${f(HILL.top - 4)}, r) * (1.0 - sst(${f(HILL.foot - 4)}, ${f(HILL.foot + 6)}, r)));
  return k;
}
float riverLand(float h, vec2 p){
  if (p.x > ${f(RIVER.x0 - 2)} || p.x < ${f(RIVER.x1)}) return h;
  float d = riverD(p);
  float tw = length(p - vec2(${f(TOWN.x)}, ${f(TOWN.z)}));
  float wv = max(1.0 - sst(26.0, 70.0, d), 1.0 - sst(${f(TOWN.r)}, ${f(TOWN.r + 55)}, tw)) * sst(${f(RIVER.x0 - 2)}, ${f(RIVER.x0 - 22)}, p.x);
  if (wv <= 0.0) return h + hillH(p);
  float w = riverW(p.x);
  float wl = riverWL(p.x);
  float bank = wl + 1.0 * sst(w - 0.4, w + 8.0, d) + 0.03 * max(0.0, d - w - 8.0);
  float bed = wl - 1.05 * (1.0 - (d / w) * (d / w));
  float v = d < w ? bed : bank;
  v = h + (v - h) * wv + hillH(p);
  return d < w + 8.0 ? h + (min(v, bank) - h) * sst(${f(RIVER.x0 - 2)}, ${f(RIVER.x0 - 22)}, p.x) : v;
}
// the river's surface over a point (-1e4 where there is none)
float riverLevel(vec2 p){ return riverD(p) < riverW(p.x) + 0.6 ? riverWL(p.x) : -1e4; }
`;
export const riverLevel = (x: number, z: number) => (riverD(x, z) < riverW(x) + 0.6 ? riverWL(x) : -1e4);

// ---------- the forest and the mountain ----------
// The cave: its mouth's middle on the ground, and the way it faces (the plane flies in toward -z, yaw as the gates')
export const CAVE = { x: -366, z: -668, yaw: 0.06, half: 12.5, rise: 25, above: 9, floor: 1.2, gateIn: 46 };
// the mountain the cave is cut into: its heart, how high its head stands over the cave's floor
export const PEAK = { x: -392, z: -812, h: 185 };
// the arch cut into the cliff: its half-width at the legs, where the arch springs and where its point stands, over
// the cave's floor (the veil inside is the gate's own: CAVE.half, CAVE.rise)
// the cave's mouth (a rough natural opening), how deep it goes, and the carved frame round the portal inside it
export const MOUTH = { half: 19, top: 36, depth: 108 };
export const ARCH = { half: 14, spring: CAVE.floor + CAVE.above + 2, apex: CAVE.floor + CAVE.above + CAVE.rise + 2.5, depth: MOUTH.depth };
// the cave's frame: a point by its distance across (u, + to the right looking in) and into the mountain (a)
export const caveAt = (u: number, a: number) => {
  const c = Math.cos(CAVE.yaw);
  const s = Math.sin(CAVE.yaw);
  return { x: CAVE.x + c * u - s * a, z: CAVE.z - s * u - c * a };
};
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
// where the town's north quay ends, at its west end (the forest's track begins there)
const QN: [number, number] = (() => {
  const x = -304;
  const sl = riverSlope(x);
  const n = Math.sqrt(1 + sl * sl);
  const off = riverW(x) + 5.4;
  return [x + (sl / n) * off, riverZ(x) - off / n];
})();
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
  ...[18, CAVE.gateIn, 82].map((a): [number, number, number] => {
    const p = caveAt(0, a);
    return [p.x, p.z, CAVE.floor + CAVE.above + 0.4];
  }),
];

// the forest's track (GLSL): a path of dark earth and needles winding along the flight line from the town's edge to the
// mountain's foot (0..1). Included by land.ts after GLSL_RIVER.
const segLines = FOREST_LINE.slice(0, -1)
  .map(([ax, az], i) => {
    const [bx, bz] = FOREST_LINE[i + 1];
    return `  { vec2 a = vec2(${f(ax)}, ${f(az)}); vec2 ab = vec2(${f(bx - ax)}, ${f(bz - az)}); vec2 q = p - a; float t = clamp(dot(q, ab) / dot(ab, ab), 0.0, 1.0); vec2 e = q - ab * t; float d = length(e); if (d < best) { best = d; sd = sign(ab.x * q.y - ab.y * q.x) * d; al = ${f(i)} + t; } }`;
  })
  .join("\n");
export const GLSL_TRACK = /* glsl */ `
float forestTrack(vec2 p){
  if (p.x > -250.0 || p.x < -420.0 || p.y > -160.0 || p.y < -690.0) return 0.0;
  float best = 1e9; float sd = 0.0; float al = 0.0;
${segLines}
  if (best > 8.0) return 0.0;
  float off = 1.8 * sin(al * 2.3) + 0.9 * sin(al * 5.1 + 1.0);
  float ends = 1.0 - sst(8.2, 8.9, al);
  float tr = (1.0 - sst(1.1, 2.0, abs(sd - off))) * ends;
  // (it begins where the town's north quay ends: a short way joins the two)
  vec2 ca = vec2(${f(QN[0])}, ${f(QN[1])}); vec2 cb = vec2(${f(FOREST_LINE[0][0])}, ${f(FOREST_LINE[0][1])});
  vec2 cq = p - ca; vec2 cab = cb - ca; float ct = clamp(dot(cq, cab) / dot(cab, cab), 0.0, 1.0);
  return max(tr, 1.0 - sst(1.1, 2.0, length(cq - cab * ct)));
}
`;

// the cave's floor and the steps up to it keep the grass out (GLSL)
export const GLSL_CAVE = /* glsl */ `
float caveIn(vec2 p){
  vec2 q = p - vec2(${f(CAVE.x)}, ${f(CAVE.z)});
  float c = cos(${f(CAVE.yaw)}), s = sin(${f(CAVE.yaw)});
  float u = c * q.x - s * q.y;
  float a = -s * q.x - c * q.y;
  return (1.0 - sst(${f(MOUTH.half + 4)}, ${f(MOUTH.half + 8)}, abs(u))) * sst(-8.0, -3.0, a) * (1.0 - sst(${f(MOUTH.depth + 2)}, ${f(MOUTH.depth + 6)}, a));
}
`;

// how far a point is from the flight's way over the open land (the road, the lake, the river and the town: the
// forest's stretch has its own trees), for whoever plants whole trees near it instead of painted cards
const OPEN_WAY = JOURNEY.slice(2, 16);
const OPEN_BOX = (() => {
  const xs = JOURNEY.slice(2, 16).map((p) => p[0]);
  const zs = JOURNEY.slice(2, 16).map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
})();
export function routeD(x: number, z: number) {
  // (most of the land is far from it: those are answered without walking the line)
  const bx = Math.max(OPEN_BOX.x0 - x, 0, x - OPEN_BOX.x1);
  const bz = Math.max(OPEN_BOX.z0 - z, 0, z - OPEN_BOX.z1);
  if (bx * bx + bz * bz > 300 * 300) return 1e9;
  let best = 1e9;
  for (let i = 0; i < OPEN_WAY.length - 1; i++) {
    const [ax, az] = OPEN_WAY[i];
    const [bx, bz] = OPEN_WAY[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

// ---------- the sacred grove (alkas): a low rise deep in a wood north-east of the desk ----------
// A round green hill at the end of the avenue the desk looks down, a great oak on its crown, an aukuras (a stone
// altar with its fire kept burning) before the oak, carved wooden posts round them, a ring of stones.
export const SACRED = { x: 36, z: -232, h: 4, top: 8, foot: 30 };
export function sacredH(x: number, z: number) {
  const r = Math.hypot(x - SACRED.x, z - SACRED.z);
  if (r >= SACRED.foot) return 0;
  return SACRED.h * (1 - sst(SACRED.top, SACRED.foot, r));
}
export const GLSL_SACRED = /* glsl */ `
float sacredH(vec2 p){
  float r = length(p - vec2(${f(SACRED.x)}, ${f(SACRED.z)}));
  if (r >= ${f(SACRED.foot)}) return 0.0;
  return ${f(SACRED.h)} * (1.0 - sst(${f(SACRED.top)}, ${f(SACRED.foot)}, r));
}
`;

// ---------- the farmland east of the road ----------
// Strip fields on a slightly skewed grid: rye (gold), flax (blue-green), potatoes (dark), some left to meadow. A
// farmstead (sodyba) in among them and a post windmill on a knoll (Sacred.tsx builds them).
export const FARM = { x0: 105, x1: 430, z0: -330, z1: 30, rot: 0.32, cw: 44, cd: 19 };
export const FARMSTEAD = { x: 150, z: -120 };
export const MILL = { x: 236, z: -205 };
// how much a point is farmland (JS, for the trees: they keep off the fields but stand along their edges)
export function fieldK(x: number, z: number) {
  if (x < FARM.x0 || x > FARM.x1 || z < FARM.z0 || z > FARM.z1) return 0;
  const edge = sst(FARM.x0, FARM.x0 + 30, x) * (1 - sst(FARM.x1 - 40, FARM.x1, x)) * sst(FARM.z0, FARM.z0 + 30, z) * (1 - sst(FARM.z1 - 30, FARM.z1, z));
  const away = sst(60, 90, Math.hypot(x, z)) * sst(40, 70, Math.hypot(x - SACRED.x, z - SACRED.z));
  return edge * away;
}
export const GLSL_FIELDS = /* glsl */ `
// a field plot under a point: x the crop (0 rye, 1 flax, 2 potatoes, 3 meadow), y across its furrows (m), z how much
vec3 fieldPlot(vec2 p){
  if (p.x < ${f(FARM.x0)} || p.x > ${f(FARM.x1)} || p.y < ${f(FARM.z0)} || p.y > ${f(FARM.z1)}) return vec3(3.0, 0.0, 0.0);
  float c = cos(${f(FARM.rot)}), s = sin(${f(FARM.rot)});
  vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vec2 cell = floor(q / vec2(${f(FARM.cw)}, ${f(FARM.cd)}));
  vec2 inC = fract(q / vec2(${f(FARM.cw)}, ${f(FARM.cd)})) * vec2(${f(FARM.cw)}, ${f(FARM.cd)});
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float crop = h < 0.32 ? 0.0 : h < 0.52 ? 1.0 : h < 0.74 ? 2.0 : 3.0;
  // a grass headland between plots
  float head = smoothstep(0.8, 2.2, min(min(inC.x, ${f(FARM.cw)} - inC.x), min(inC.y, ${f(FARM.cd)} - inC.y)));
  float edge = sst(${f(FARM.x0)}, ${f(FARM.x0 + 30)}, p.x) * (1.0 - sst(${f(FARM.x1 - 40)}, ${f(FARM.x1)}, p.x)) * sst(${f(FARM.z0)}, ${f(FARM.z0 + 30)}, p.y) * (1.0 - sst(${f(FARM.z1 - 30)}, ${f(FARM.z1)}, p.y));
  float away = sst(60.0, 90.0, length(p)) * sst(40.0, 70.0, length(p - vec2(${f(SACRED.x)}, ${f(SACRED.z)}))) * sst(22.0, 34.0, length(p - vec2(${f(FARMSTEAD.x)}, ${f(FARMSTEAD.z)}))) * sst(12.0, 20.0, length(p - vec2(${f(MILL.x)}, ${f(MILL.z)})));
  // (no field across the road)
  float road = sst(10.0, 22.0, abs(p.x - 1.45 - 0.6 * sin(p.y * 0.043 - 1.1)));
  return vec3(crop, inC.y, head * edge * away * road * step(crop, 2.5));
}
`;

// ---------- the paths from the desk ----------
// The main path, the one anybody sees: from the desk it turns LEFT, along the lake's south shore past the old
// farmstead, and down the river's south bank into the town's quay street. And a second one that hardly shows: a
// narrow overgrown track branching off to the RIGHT into the wood, to the sacred grove and its fire.
const bankZ = (x: number, off: number) => {
  const sl = 0.328 - 0.000556 * x + 0.27 * Math.cos(x * 0.045 + 1.0);
  return riverZ(x) + off * Math.sqrt(1 + sl * sl);
};
export const MAIN_PATH: [number, number][] = [
  [1.00, -1.5],
  [0.67, -4],
  [0.31, -7],
  [-2.5, -15],
  [-8, -21],
  [-16, -28],
  [-29, -36],
  [-46, -38],
  [-64, -41],
  [-80, -47],
  [-93, -57],
  ...[-104, -116, -128, -140, -152, -164, -176, -188].map((x): [number, number] => [x, bankZ(x, riverW(x) + 5.4)]),
];
export const SIDE_PATH: [number, number][] = [
  [1.1, -12],
  [2.0, -19],
  [2.6, -27],
  [4.5, -44],
  [9, -68],
  [15.5, -96],
  [22, -126],
  [28, -158],
  [32.5, -188],
  [35, -214],
];
function polyD(line: [number, number][], x: number, z: number) {
  let best = 1e9;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i];
    const [bx, bz] = line[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
export const mainPathD = (x: number, z: number) => (x > 12 || x < -200 || z > 2 || z < -140 ? 1e9 : polyD(MAIN_PATH, x, z));
export const sidePathD = (x: number, z: number) => (x > 50 || x < -10 || z > -10 || z < -230 ? 1e9 : polyD(SIDE_PATH, x, z));
// the sacred grove's wood: thick round the clearing and along the hidden path (0..1, the path itself kept open)
export function groveWood(x: number, z: number) {
  const r = Math.hypot(x - SACRED.x, z - SACRED.z);
  const sd = sidePathD(x, z);
  const round = (1 - sst(70, 110, r)) * sst(11, 17, r);
  const along = (1 - sst(18, 34, sd)) * sst(-40, -70, z);
  return Math.max(round, along) * sst(1.6, 3.2, sd);
}
const segCode = (line: [number, number][], name: string) =>
  line
    .slice(0, -1)
    .map(([ax, az], i) => {
      const [bx, bz] = line[i + 1];
      return `  { vec2 a = vec2(${f(ax)}, ${f(az)}); vec2 ab = vec2(${f(bx - ax)}, ${f(bz - az)}); vec2 q = p - a; float t = clamp(dot(q, ab) / dot(ab, ab), 0.0, 1.0); ${name} = min(${name}, length(q - ab * t)); }`;
    })
    .join("\n");
export const GLSL_PATHS = /* glsl */ `
// how much of the main path (x) and of the hidden one (y) lies at a point
vec2 homePaths(vec2 p){
  float dm = 1e9; float ds = 1e9;
  if (p.x < 12.0 && p.x > -200.0 && p.y < 2.0 && p.y > -140.0) {
${segCode(MAIN_PATH, "dm")}
  }
  if (p.x < 50.0 && p.x > -10.0 && p.y < -10.0 && p.y > -230.0) {
${segCode(SIDE_PATH, "ds")}
  }
  // (the main path as wide as the old footpath; the hidden one narrow, half lost under the grass)
  // (as narrow as the footpath at the desk, opening gradually through the turn into a proper way to the town)
  float hw = 0.34 + 0.8 * sst(-2.0, -70.0, p.y);
  float m = 1.0 - sst(hw, hw + 0.25 + 0.35 * sst(-2.0, -40.0, p.y), dm + (vnoise(p * 0.9) - 0.5) * 0.3);
  float s = (1.0 - sst(0.2, 0.55, ds + (vnoise(p * 1.3) - 0.5) * 0.4)) * sst(0.4, 0.65, vnoise(p * 0.22 + 3.0)) * 0.7;
  return vec2(m, s);
}
`;
