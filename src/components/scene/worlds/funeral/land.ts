import * as THREE from "three";
import type { Obstacle, Terrain } from "../voyage";

// The land of the Funeral Symphony, worked out once, as numbers: nothing here draws, and nothing here reads the
// journey's map (worlds/voyage.ts reads this, not the other way about).
//
// The procession's road is a flat-topped fin of rock that winds up out of the valley in three great switchbacks,
// a sheer drop on either hand, to a notch in the north wall where it goes into the mountain. The whole of it is
// one analytic height field (round hills, as every world's ground is), so the plane's clearance, the path of
// light and the drawn rock agree: the fin is two rows of round hills laid along the road, one either side of its
// middle, whose heights are solved so that the crest between them follows the road's own climb; where the land
// is already higher than the road (the north wall) the same rows come out as hollows and cut the notch.

type B = [x: number, z: number, radius: number, height: number];

export const ROAD_W = 22; // metres across: seventeen souls abreast
const RHO = 40; // the round of each hill in the rows
const OFF = RHO / Math.SQRT2; // rows this far either side of the middle give a crest that is level across
const SPACE = 30;

// the road: x, z and how high its crest stands
// (it begins far inside the southern mountain: the first three hundred metres of it lie in a cutting so deep that
// it is roofed over, the cave the procession and the plane come out of)
const CTRL: [number, number, number][] = [
  [352, 1320, 2],
  [346, 1180, 2],
  [330, 1040, 2],
  [290, 940, 4],
  [232, 800, 9],
  [150, 640, 20],
  [60, 520, 40],
  [-90, 420, 62],
  [-200, 360, 82],
  [-250, 280, 97], // the first turn, west
  [-190, 205, 112],
  [-50, 180, 132],
  [100, 160, 152],
  [210, 105, 170],
  [255, 20, 184], // the second turn, east: the headland over the abyss
  [195, -60, 198],
  [60, -90, 218],
  [-90, -110, 238],
  [-195, -160, 256],
  [-235, -240, 268], // the third turn, west
  [-175, -310, 282],
  [-40, -345, 298],
  [60, -400, 312], // the pass: the two cypresses, and the parting of the ways
  // (the crowd turns left here, toward the great tree and the door in it; the plane goes on, to the right)
  [-5, -505, 316], // the door in the tree
  [-45, -620, 314],
  [-60, -740, 310],
  [-70, -850, 306],
];
// where along the road (by its control points) things stand
const AT_PASS = 22;
const AT_MOUTH = 23;

// the land the road is laid over: the valley, the walls, the far ranges
const BASE: B[] = [
  // the shoulder the switchbacks climb, and the great tree standing on it
  [-40, -700, 560, 300],
  [-40, -600, 170, 270],
  // the north wall, west of the tree, and the colossal mass behind it
  [-420, -900, 390, 1550],
  [0, -1500, 560, 1700],
  // the north-east wall: well to the right of the way on, so that between it and the pass there is only air
  [660, -980, 340, 1300],
  // the abyss: the valley's edge falls away to the east of the road, a long way down into mist
  [440, -320, 270, -330],
  [390, 170, 240, -300],
  [540, 560, 250, -260],
  // the tooth across the abyss, and the wall beyond it
  [880, 40, 270, 1050],
  [960, 400, 230, 640],
  // the west side
  [-900, 100, 390, 1150],
  [-740, -380, 310, 860],
  [-620, 600, 290, 440],
  // behind the plane as it comes in: low dark hills, and the great mass the cave goes into
  [-200, 900, 260, 90],
  [620, 760, 230, 160],
  // the far ranges
  [-1550, -600, 440, 1500],
  [-1300, 700, 420, 960],
  [1450, -500, 450, 1400],
  [1400, 600, 400, 900],
  [-400, -1750, 500, 1600],
  [700, -1700, 480, 1450],
  [0, 1650, 500, 520],
  [-900, 1500, 380, 640],
  [1000, 1450, 400, 600],
];
const SINES: Terrain["sines"] = [
  [0.0052, 0.0031, 0.4, 4],
  [-0.0041, 0.0063, 2.1, 3],
  [0.019, 0.014, 1.2, 0.9],
  [0.031, -0.023, 3.3, 0.45],
];
const RIM: Terrain["rim"] = [1250, 2100, 640];

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function sum(bumps: B[], x: number, z: number) {
  let h = 0;
  for (const b of bumps) {
    const dx = x - b[0];
    const dz = z - b[1];
    const d2 = (dx * dx + dz * dz) / (b[2] * b[2]);
    if (d2 < 12) h += b[3] * Math.exp(-d2);
  }
  return h;
}
function baseAt(x: number, z: number) {
  let h = 0;
  for (const s of SINES) h += s[3] * Math.sin(s[0] * x + s[1] * z + s[2]);
  h += sum(BASE, x, z);
  return h + RIM[2] * sstep(RIM[0], RIM[1], Math.hypot(x, z));
}

function build() {
  const curve = new THREE.CatmullRomCurve3(
    CTRL.map(([x, z, h]) => new THREE.Vector3(x, h, z)),
    false,
    "centripetal",
  );
  const len = curve.getLength();
  const STEP = 4;
  const n = Math.round(len / STEP);
  const pts = curve.getSpacedPoints(n); // n + 1 points, 4 m apart
  const N = pts.length;
  const tan: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(N - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    tan.push([(b.x - a.x) / l, (b.z - a.z) / l]);
  }
  // arc length (in samples) of each control point
  const ctlI = CTRL.map(([x, z]) => {
    let best = 0;
    let bd = 1e9;
    for (let i = 0; i < N; i++) {
      const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  });

  // the two rows of hills, each walked at its own pace so a turn neither crowds nor thins them
  const chain: { x: number; z: number; i: number }[] = [];
  for (const side of [-1, 1]) {
    let run = SPACE;
    let px = 0;
    let pz = 0;
    for (let i = 0; i < N; i++) {
      const x = pts[i].x - tan[i][1] * side * OFF;
      const z = pts[i].z + tan[i][0] * side * OFF;
      if (i > 0) run += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
      if (run >= SPACE) {
        run -= SPACE;
        chain.push({ x, z, i });
      }
    }
  }
  // their heights: stations along the road, solved so the crest follows the road's climb
  const SI = Math.round(SPACE / STEP);
  const K = Math.ceil(N / SI) + 1;
  const amp = new Float32Array(K);
  const ampAt = (i: number) => {
    const f = Math.min(K - 1.001, i / SI);
    const k = Math.floor(f);
    return amp[k] + (amp[k + 1] - amp[k]) * (f - k);
  };
  const bumps = (): B[] => chain.map((c) => [c.x, c.z, RHO, ampAt(c.i)]);
  const gain = 2 * Math.exp(-0.5) * ((Math.sqrt(Math.PI) * RHO) / SPACE);
  for (let it = 0; it < 14; it++) {
    const cb = bumps();
    const next = new Float32Array(K);
    for (let k = 0; k < K; k++) {
      const p = pts[Math.min(N - 1, k * SI)];
      const h = baseAt(p.x, p.z) + sum(cb, p.x, p.z);
      next[k] = amp[k] + ((p.y - h) / gain) * 0.8;
    }
    amp.set(next);
  }
  const all: B[] = [...BASE, ...bumps().filter((b) => Math.abs(b[3]) > 0.4)];
  const terrain: Terrain = { base: 0, sines: SINES, bumps: all, rim: RIM };
  const chainB = bumps();
  const ground = (x: number, z: number) => baseAt(x, z) + sum(chainB, x, z);

  // the road as it lies: level across, at the lowest the land is under it (so the drawn road is never above the
  // ground the plane reads), smoothed along its length
  const y = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let m = 1e9;
    for (const v of [-1, -0.5, 0, 0.5, 1]) m = Math.min(m, ground(pts[i].x - tan[i][1] * v * ROAD_W * 0.5, pts[i].z + tan[i][0] * v * ROAD_W * 0.5));
    y[i] = m;
  }
  const ys = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    let w = 0;
    for (let j = -4; j <= 4; j++) {
      const q = Math.min(N - 1, Math.max(0, i + j));
      s += y[q];
      w++;
    }
    ys[i] = Math.min(y[i], s / w) - 0.15;
  }
  // how much of a crest the road stands on, each side (1: the land falls away, a cliff; 0: it rises, a cutting)
  const crest = new Float32Array(N * 2);
  for (let i = 0; i < N; i++)
    for (const [k, side] of [
      [0, -1],
      [1, 1],
    ]) {
      const g = ground(pts[i].x - tan[i][1] * side * 46, pts[i].z + tan[i][0] * side * 46);
      crest[i * 2 + k] = Math.min(1, Math.max(0, (ys[i] - g - 12) / 26));
    }

  const iPass = ctlI[AT_PASS];
  const iMouth = ctlI[AT_MOUTH];
  const iGate = iMouth + 9; // 36 m inside
  const iEnd = Math.min(N - 1, iMouth + 62);

  // the cave it comes out of: as far along the road as the mountain still stands high enough over it to be a roof
  let iOut = 0;
  while (iOut < N - 1 && baseAt(pts[iOut + 1].x, pts[iOut + 1].z) - ys[iOut + 1] > 62) iOut++;

  // the path of light: out of the cave over the road's middle, rising as the valley opens so the whole climb is
  // seen at once; then down beside the road on its valley side, a little above the hoods; round each turn on the
  // outside, over the drop, looking back at the crowd on the edge; at the pass over their heads and in
  // (the plane arrives a little way inside the mouth: a few seconds of dark with the night's blue ahead, not a long tunnel)
  // (a long way in the dark, over the water, with the boats: the cave the souls are brought through)
  const iIn = Math.max(8, iOut - 66);
  const path: [number, number, number][] = [];
  const iFork = iPass - 14;
  for (let i = iIn; i <= iFork; i += 10) {
    const p = pts[i];
    const out = sstep(iOut - 4, iOut + 26, i);
    const k = out;
    const x = p.x;
    const z = p.z + 13 * k;
    const turn = Math.min(1, Math.abs(p.x) / 230);
    const lift = 7.5 + 2.5 * turn * turn * k + 6.5 * (1 - out) + out * (1 - sstep(iOut + 30, ctlI[5], i)) * 34;
    path.push([x, z, Math.max(3.5, ys[i] + lift - ground(x, z))]);
  }
  // the parting of the ways: the crowd goes left, round the bend and up to the tree; the plane goes straight on, over
  // the edge, to a gate standing in the air over the abyss
  const pp = pts[iPass];
  const pa = pts[iPass - 36];
  const dl = Math.hypot(pp.x - pa.x, pp.z - pa.z);
  const d1: [number, number] = [(pp.x - pa.x) / dl, (pp.z - pa.z) / dl];
  const fy = ys[iFork] + 12;
  const last = path[path.length - 1];
  const along = (m: number): [number, number] => [pp.x + d1[0] * m, pp.z + d1[1] * m];
  for (const m of [-6, 50, 110, 175]) {
    const [x, z] = along(m);
    // (levels off, and rises a little as the land falls away under it)
    path.push([x, z, Math.max(16, fy + 4 + Math.max(0, m) * 0.04 - ground(x, z))]);
  }
  void last;
  const gp = along(235);
  const gateY = fy + 11;
  const gate = { x: gp[0], z: gp[1], above: Math.max(16, gateY - ground(gp[0], gp[1])), yaw: Math.atan2(-d1[0], -d1[1]) };
  const gp2 = along(262);
  path.push([gp[0], gp[1], gate.above], [gp2[0], gp2[1], gate.above]);
  const entry = { x: path[0][0], z: path[0][1], above: path[0][2], yaw: Math.atan2(-tan[iIn][0], -tan[iIn][1]) };
  // (well up the first climb: nothing hangs in the mouth of the cave the plane comes out of)
  const iC = ctlI[7] + 4;
  const canvas = { x: pts[iC].x - tan[iC][1] * 74, z: pts[iC].z + tan[iC][0] * 74, yaw: Math.atan2(-tan[iC][0], -tan[iC][1]) - 0.5 };
  // (the two cypresses of the picture stand at the parting of the ways, side by side, on the crowd's side)
  const cyp = [0, 1].map((n) => {
    const i = iPass + 1 - n * 4;
    const d = ROAD_W * 0.5 + 12 + n * 17;
    const x = pts[i].x + tan[i][1] * d;
    const z = pts[i].z - tan[i][0] * d;
    return { x, z, y: ground(x, z), h: n ? 104 : 118 };
  });
  const m = pts[iMouth];
  const mn: [number, number] = [-tan[iMouth][1], tan[iMouth][0]];
  const obstacles: Obstacle[] = [
    ...cyp.map((c) => ({ x: c.x, z: c.z, r: 6, h: c.h })),
    // the rock either side of the cave's mouth
    { x: m.x + mn[0] * 52, z: m.z + mn[1] * 52, r: 26, h: 170 },
    { x: m.x - mn[0] * 52, z: m.z - mn[1] * 52, r: 26, h: 170 },
    // the rock either side of the mouth it comes out of
    { x: pts[iOut].x - tan[iOut][1] * 54, z: pts[iOut].z + tan[iOut][0] * 54, r: 28, h: 120 },
    { x: pts[iOut].x + tan[iOut][1] * 54, z: pts[iOut].z - tan[iOut][0] * 54, r: 28, h: 120 },
    // the great walls: the plane leans away from them early
    { x: -420, z: -900, r: 330, h: 1250, bell: true },
    { x: 660, z: -980, r: 290, h: 1050, bell: true },
    { x: 880, z: 40, r: 230, h: 850, bell: true },
    { x: -900, z: 120, r: 340, h: 900, bell: true },
  ];

  return { terrain, pts, tan, y: ys, crest, N, STEP, len: (N - 1) * STEP, ground, baseAt, iPass, iMouth, iGate, iEnd, iOut, iIn, iFork, path, entry, gate, canvas, cyp, obstacles };
}

let land: ReturnType<typeof build> | null = null;
export const funeralLand = () => (land ??= build());
