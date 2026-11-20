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
const CTRL: [number, number, number][] = [
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
  [60, -400, 312], // the pass: the two cypresses
  [100, -490, 318], // the mouth of the cave
  [106, -600, 316],
  [84, -720, 312],
  [40, -830, 308],
];
// where along the road (by its control points) things stand
const AT_PASS = 20;
const AT_MOUTH = 21;

// the land the road is laid over: the valley, the walls, the far ranges
const BASE: B[] = [
  // the shoulder the switchbacks climb
  [-40, -700, 520, 290],
  // the north wall, either side of the notch, and the mass behind it
  [-330, -830, 300, 1080],
  [480, -780, 280, 860],
  [70, -1180, 380, 980],
  [-40, -600, 150, 260],
  [250, -590, 150, 280],
  // the tooth across the abyss, and the abyss itself
  [720, 60, 215, 760],
  [800, 330, 180, 420],
  [420, 60, 135, -70],
  // the west side
  [-800, 120, 330, 840],
  [-640, -330, 250, 620],
  [-560, 560, 240, 300],
  // behind the plane as it comes in: low dark hills
  [-200, 900, 260, 90],
  [620, 760, 230, 160],
  // the far ranges
  [-1500, -600, 420, 1200],
  [-1250, 700, 400, 760],
  [1400, -500, 430, 1100],
  [1350, 600, 380, 700],
  [-400, -1700, 480, 1300],
  [700, -1650, 460, 1150],
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
const RIM: Terrain["rim"] = [1250, 2100, 380];

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

  // the path of light: beside the road on its valley side, a little above the hoods; round each turn on the
  // outside, over the drop, looking back at the crowd on the edge; at the pass over their heads and in
  const iIn = ctlI[1] + 6;
  const path: [number, number, number][] = [];
  for (let i = iIn; i <= iGate + 10; i += 10) {
    const p = pts[i];
    const intoCave = sstep(iPass - 30, iPass + 6, i);
    const k = 1 - intoCave;
    const x = p.x;
    const z = p.z + 13 * k;
    const turn = Math.min(1, Math.abs(p.x) / 230);
    const lift = 7.5 + 2.5 * turn * turn * k + 3.5 * intoCave + (1 - sstep(iIn, ctlI[3], i)) * 18;
    path.push([x, z, Math.max(3.5, ys[i] + lift - ground(x, z))]);
  }
  const entry = { x: path[0][0], z: path[0][1], above: path[0][2], yaw: Math.atan2(-tan[iIn][0], -tan[iIn][1]) };
  // the painting stands on the valley floor to the right of the way in
  const iC = ctlI[2] + 4;
  const canvas = { x: pts[iC].x - tan[iC][1] * 74, z: pts[iC].z + tan[iC][0] * 74, yaw: Math.atan2(-tan[iC][0], -tan[iC][1]) - 0.5 };
  const g = pts[iGate];
  const gate = { x: g.x, z: g.z, above: 11 + ys[iGate] - ground(g.x, g.z), yaw: Math.atan2(-tan[iGate][0], -tan[iGate][1]) };

  const cyp = [-1, 1].map((side) => {
    const i = iPass - 4 - (side > 0 ? 5 : 0);
    const d = ROAD_W * 0.5 + 10 + (side > 0 ? 2 : 0);
    const x = pts[i].x - tan[i][1] * side * d;
    const z = pts[i].z + tan[i][0] * side * d;
    return { x, z, y: ground(x, z), h: side > 0 ? 104 : 118 };
  });
  const m = pts[iMouth];
  const mn: [number, number] = [-tan[iMouth][1], tan[iMouth][0]];
  const obstacles: Obstacle[] = [
    ...cyp.map((c) => ({ x: c.x, z: c.z, r: 6, h: c.h })),
    // the rock either side of the cave's mouth
    { x: m.x + mn[0] * 52, z: m.z + mn[1] * 52, r: 26, h: 170 },
    { x: m.x - mn[0] * 52, z: m.z - mn[1] * 52, r: 26, h: 170 },
    // the great walls: the plane leans away from them early
    { x: -330, z: -830, r: 300, h: 1080, bell: true },
    { x: 480, z: -780, r: 270, h: 860, bell: true },
    { x: 720, z: 60, r: 200, h: 760, bell: true },
    { x: -800, z: 120, r: 320, h: 840, bell: true },
  ];

  return { terrain, pts, tan, y: ys, crest, N, STEP, len: (N - 1) * STEP, ground, baseAt, iPass, iMouth, iGate, iEnd, path, entry, gate, canvas, cyp, obstacles };
}

let land: ReturnType<typeof build> | null = null;
export const funeralLand = () => (land ??= build());
