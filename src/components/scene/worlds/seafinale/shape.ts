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
// to the left and along its face, climbing into the hollow under the crest, the roof of water curling overhead;
// and along that tube, level and straight, to its far end, where the way on is carved into the water: a pointed
// doorway standing in the wave's end, its sides in the water and the curl over its head. The last half
// kilometre is one straight line, through the middle of the doorway and on.
// the doorway: at the far end of the tube (where the roof of the curl is still high over it), at the height the way flies in the tube
export const EXIT = { s: -640 * WK, f: 1.25, y: 400 };
// the doorway, as a pointed arch: half its width, how far its point stands over the way, how far its sides go down
// (under the water: it is carved into the wave, its feet in the sea and in the face)
export const FINALE_OPENING: [half: number, rise: number, reach: number] = [230, 440, 300];
const terrainY = (x: number, z: number) => FINALE_TERRAIN.base + bodyAt(x, z);
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
  ];
  // The turn and the climb: one long easy curve. From the quiet sea the way bends left along the wave in a single
  // arc (its heading eased from start to end, so no bend is sharper than the one before), comes onto the line of
  // the tube a long way short of the doorway, and goes straight through it. The arc's length is found so that it
  // joins that line exactly. The way rises in one smooth swell, never steeper than a climb the plane can hold at its
  // fastest (about sixteen degrees), to a little over the doorway's height, and settles down to it.
  const g = onFace(EXIT.s, EXIT.f);
  const a0 = onFace(EXIT.s + 40, EXIT.f);
  const a1 = onFace(EXIT.s - 40, EXIT.f);
  const tl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
  const dx = (a1[0] - a0[0]) / tl;
  const dz = (a1[1] - a0[1]) / tl;
  const sm = (t: number) => {
    const u = Math.min(1, Math.max(0, t));
    return u * u * (3 - 2 * u);
  };
  const P0 = [200, 710];
  const H0 = Math.atan2(-0.17, -0.985);
  const H1 = Math.atan2(dx, dz);
  // the arc's point after l metres of an arc L long
  const arc = (L: number, l = L, n = 240) => {
    let x = P0[0];
    let z = P0[1];
    for (let i = 0; i < n; i++) {
      const h = H0 + (H1 - H0) * sm(((i + 0.5) / n) * (l / L));
      x += (Math.sin(h) * l) / n;
      z += (Math.cos(h) * l) / n;
    }
    return [x, z];
  };
  // (the arc's end stands off the doorway's line by this much, sideways: found by bisection on the length)
  const off = (L: number) => {
    const [x, z] = arc(L);
    return (x - g[0]) * dz - (z - g[1]) * dx;
  };
  let lo = 1200;
  let hi = 2600;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (off(lo) * off(mid) <= 0) hi = mid;
    else lo = mid;
  }
  const LA = (lo + hi) / 2;
  const [ex, ez] = arc(LA);
  const rest = Math.hypot(g[0] - ex, g[1] - ez);
  const total = LA + rest;
  const Y0 = 36;
  const YPK = 500;
  const yAt = (l: number) => (l < LA + 120 ? Y0 + (YPK - Y0) * (0.4 * sm(l / (LA + 120)) + 0.6 * (1 - (1 - Math.min(1, l / (LA + 120))) ** 2.6)) : YPK - (YPK - EXIT.y) * sm((l - LA - 120) / (total - LA - 120)));
  const put = (x: number, z: number, l: number) => path.push([x, z, Math.max(l > 500 ? 64 : 24, yAt(l) - terrainY(x, z))]);
  for (let l = 175; l < LA - 60; l += 175) {
    const [x, z] = arc(LA, l);
    put(x, z, l);
  }
  // (the arc's end, and on along the line to the doorway)
  put(ex, ez, LA);
  for (const back of [0.66, 0.33]) put(g[0] - (g[0] - ex) * back, g[1] - (g[1] - ez) * back, LA + rest * (1 - back));
  path.push([g[0], g[1], EXIT.y - terrainY(g[0], g[1])]);
  path.push([g[0] + dx * 200, g[1] + dz * 200, EXIT.y - terrainY(g[0] + dx * 200, g[1] + dz * 200)]);
  const yaw = Math.atan2(-dx, -dz);
  return { path, gate: { x: g[0], z: g[1], above: EXIT.y - terrainY(g[0], g[1]), yaw } };
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
