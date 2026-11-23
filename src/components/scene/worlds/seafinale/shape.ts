import type { Terrain } from "../voyage";

// The sea of the Finale as numbers: the great wave (a ridge of water, bowed like an arm round whoever comes
// toward it), the swell that runs under everything, the way the plane goes, and where the ships ride. Nothing
// here draws, and nothing here reads the journey's map (worlds/voyage.ts reads this).
//
// The wave is the world's own height field (a row of round hills along its crest line), so the plane's
// clearance and the drawn water agree: it can be flown up, and not through. The field stands BASE metres over
// the mean sea, which is the room the moving swell is given under the plane.

type B = [x: number, z: number, radius: number, height: number];

// (It is built at its full height, fifteen hundred metres and more than four kilometres long; the world draws it far
// lower at first and lets it rear as the plane comes: SeaFinale.tsx. WK: how much longer it is than it was first
// built, for everything that was laid out along the first one.)
export const WAVE = { z0: -1150, bend: 0.00012, H: 1800, rho: 650, span: 1950, base: 13 };
export const WK = WAVE.span / 640;
// its crest line: z at a place s (= x) along it, bowed toward whoever comes
export const ridgeZ = (s: number) => WAVE.z0 + WAVE.bend * s * s;
// across the crest at s, toward the wave's face (unit, in x and z)
export const ridgeN = (s: number): [number, number] => {
  const d = 2 * WAVE.bend * s;
  const l = Math.hypot(d, 1);
  return [-d / l, 1 / l];
};
// (a long wall of water, falling away quickly at its two ends)
export const waveH = (s: number) => WAVE.H * Math.exp(-((s / WAVE.span) ** 4));
// how broad the wave is across, by place: slimmer toward its ends as it is lower
export const waveRho = (s: number) => WAVE.rho * (0.45 + (0.55 * waveH(s)) / WAVE.H);

function buildBumps() {
  const out: B[] = [];
  let s = -1060 * WK;
  while (s <= 1060 * WK) {
    const rho = waveRho(s);
    const space = rho * 0.5;
    out.push([s, ridgeZ(s), rho, waveH(s) / ((Math.sqrt(Math.PI) * rho) / space)]);
    s += space;
  }
  return out;
}
const BUMPS = buildBumps();
export const FINALE_TERRAIN: Terrain = { base: WAVE.base, sines: [], bumps: BUMPS, rim: [1, 2, 0] };

// the wave's own height over the mean sea (no swell)
export function bodyAt(x: number, z: number) {
  let h = 0;
  for (const b of BUMPS) {
    const dx = x - b[0];
    const dz = z - b[1];
    const d2 = (dx * dx + dz * dz) / (b[2] * b[2]);
    if (d2 < 12) h += b[3] * Math.exp(-d2);
  }
  return h;
}

// The swell: long seas running in toward the wave and up it. Each: direction (x, z), length, height, speed.
// Written out once here and as GLSL, so the ships ride exactly the water that is drawn.
export const SWELL: [dx: number, dz: number, length: number, amp: number, speed: number][] = [
  // (long slow seas, high and broad, with shorter ones running across them: more water, and all of it moving)
  [0.1, -1, 340, 5.0, 11],
  [-0.38, -0.92, 210, 3.0, 9],
  [0.5, -0.86, 140, 1.8, 7.5],
  [-0.12, -1, 80, 1.0, 6],
  [0.7, -0.7, 460, 3.2, 12],
  [-0.62, -0.78, 55, 0.5, 5],
];
// (it dies away up the wave's face, where the water is drawn up smooth)
export const swellDamp = (body: number) => 1 - Math.min(1, Math.max(0, (body - 12) / 80));
export function swellAt(x: number, z: number, t: number) {
  let h = 0;
  for (const [dx, dz, len, amp, sp] of SWELL) {
    const l = Math.hypot(dx, dz);
    const k = (Math.PI * 2) / len;
    const ph = ((dx * x + dz * z) / l) * k - t * sp * k;
    // sharper at the crest than in the trough
    h += amp * (Math.sin(ph) + 0.22 * Math.sin(2 * ph + 1.2));
  }
  return h;
}
export const SWELL_GLSL = /* glsl */ `
float swellH(vec2 p, float t){
  float h = 0.0;
  ${SWELL.map(([dx, dz, len, amp, sp]) => {
    const l = Math.hypot(dx, dz);
    const k = (Math.PI * 2) / len;
    return `{ float ph = dot(p, vec2(${(dx / l).toFixed(4)}, ${(dz / l).toFixed(4)})) * ${k.toFixed(5)} - t * ${(sp * k).toFixed(5)}; h += ${amp.toFixed(2)} * (sin(ph) + 0.22 * sin(2.0 * ph + 1.2)); }`;
  }).join("\n  ")}
  return h;
}
float swellDamp(float body){ return 1.0 - clamp((body - 12.0) / 80.0, 0.0, 1.0); }
`;

// a place on the wave's face: s along the crest, f across it in widths of the wave (0 the crest line, about 2 its foot)
export const onFace = (s: number, f: number): [number, number] => {
  const n = ridgeN(s);
  const d = f * waveRho(s);
  return [s + n[0] * d, ridgeZ(s) + n[1] * d];
};

// The way: in low over the swell toward the middle of the wave, the ships ahead on its lower slope; then round
// to the left and along its face, climbing, the crest curling overhead; and at its far end out to the left
// through the hanging lace of the crest, into calm.
const FACE: [number, number, number][] = (
  [
    [20, 1.9, 16],
    [-50, 1.6, 16],
    [-130, 1.32, 16],
    [-220, 1.1, 16],
    [-310, 0.96, 16],
    [-400, 0.9, 17],
    [-480, 0.9, 20],
    [-550, 0.92, 28],
    [-602, 0.97, 40],
  ] as [number, number, number][]
).map(([s, f, a]) => [s * WK, f, a]);
// (the way runs straight through the end: at the pace this world is flown a turn there would carry the plane wide)
export const EXIT = { s: -640 * WK, f: 1.03, above: 48 };
// the gate is the whole curl of the wave's end: a lancet as wide as the curl and as tall (half width, height above the way)
export const FINALE_OPENING: [half: number, rise: number] = [430, 640];
function buildPath() {
  // (a long way in over a quiet sea before the water begins to stand up)
  const path: [number, number, number][] = [
    [330, 1900, 24],
    [322, 1700, 22],
    [308, 1500, 20],
    [290, 1300, 19],
    [266, 1100, 18],
    [236, 900, 17],
    [200, 710, 17],
    [160, 530, 17],
    [118, 370, 17],
    [84, 230, 17],
  ];
  for (const [s, f, a] of FACE) path.push([...onFace(s, f), a]);
  const g = onFace(EXIT.s, EXIT.f);
  const last = FACE[FACE.length - 1];
  const from = onFace(last[0], last[1]);
  // (the last stretch is one straight line, through the gate's middle and on: the gate stands square to it)
  const dx = g[0] - from[0];
  const dz = g[1] - from[1];
  const dl = Math.hypot(dx, dz);
  path.push([from[0] + (dx / dl) * (dl - 400), from[1] + (dz / dl) * (dl - 400), EXIT.above * 0.7 + last[2] * 0.3]);
  path.push([g[0], g[1], EXIT.above]);
  path.push([g[0] + (dx / dl) * 160, g[1] + (dz / dl) * 160, EXIT.above]);
  const yaw = Math.atan2(-dx, -dz);
  return { path, gate: { x: g[0], z: g[1], above: EXIT.above, yaw } };
}
const P = buildPath();
export const FINALE_PATH = P.path;
export const FINALE_GATE = P.gate;
export const FINALE_ENTRY = { x: 330, z: 1900, above: 24, yaw: Math.atan2(8, 200) };

// where the ships ride: on the band of foam at the wave's foot and a little way up its slope (along the crest,
// across it in the wave's widths, heading, size)
export const SHIPS: [number, number, number, number][] = [
  [150, 2.35, 0.5, 1.0],
  [64, 2.0, -0.2, 0.9],
  [-36, 2.5, 0.9, 0.82],
  [-128, 1.85, 0.3, 1.1],
  [236, 1.95, -0.5, 0.86],
  [-250, 2.2, 0.7, 0.78],
  [20, 1.62, 0.2, 0.74],
];
