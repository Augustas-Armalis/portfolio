import * as THREE from "three";

// The ways of the Fairy Tale, laid once, as smooth curves, and read by everything that needs to know where a way is:
// the ground (which paints it), the grass (which leaves it bare), the trees (which keep off it), the walkers, and the
// plane's own line of flight (which follows them, so what it flies over is what it is led by).
//
//   road A  the track the plane arrives on, through the wood and over the crest, then the pale road across the
//           plain; it goes down the west side of the plain and, at the foot of the mountain, turns once about
//           (a wide bend, never tighter than ~100 m) to meet the way up the mountain where that begins.
//   road B  from a small gate in the mountain's back to the outer gate on the hill: the way out.
//
// Pure numbers and three's curves: no imports from the worlds, so voyage.ts can take the plane's path from here.
export type P2 = [x: number, z: number];

// where the ramp up the mountain begins (fairy/mountain.ts rampLine(2)[0], plus MT); Fairy.tsx checks it
export const RAMP_FOOT: P2 = [-380.46, -112.87];
export const MT0: P2 = [0, -240];
export const GATE: { x: number; z: number; yaw: number } = { x: 646, z: -1335, yaw: -0.363 };

// ---- road A: control points (the first stands behind the plane's entry, the last runs on into the ramp)
const hairC: P2 = [-566, -352];
const hairR = 118;
// (the bend, laid out plainly: left side going up, over the top, down the right side)
const BEND: P2[] = [180, 150, 120, 90, 60, 30, 0].map((d) => {
  const a = (d * Math.PI) / 180;
  return [hairC[0] + Math.cos(a) * hairR, hairC[1] - Math.sin(a) * hairR] as P2;
});
export const ROAD_A: P2[] = [
  [-52.2, 1900],
  [-45, 1840],
  [-37.2, 1790],
  [-24, 1730],
  [-9, 1670],
  [3, 1612],
  [9, 1552],
  [5, 1494],
  [-4, 1436],
  [-20, 1372],
  [-52, 1290],
  [-104, 1188],
  [-186, 1068],
  [-238, 918],
  [-336, 764],
  [-398, 586],
  [-498, 424],
  [-548, 246],
  [-624, 84],
  [-654, -80],
  [-676, -210],
  ...BEND,
  [-440, -262],
  [-424, -206],
  [-405, -160],
  RAMP_FOOT,
  [-371.2, -83.6],
];

// ---- road B: the way out. A long, nearly straight run, swaying a little, that arrives on the gate's own axis
const bEnd: P2 = [GATE.x, GATE.z];
const ax: P2 = [-Math.sin(GATE.yaw), -Math.cos(GATE.yaw)]; // the way the plane goes through the gate
const onAxis = (d: number): P2 => [bEnd[0] + ax[0] * d, bEnd[1] + ax[1] * d];
const B0: P2 = [283, -523];
const B1 = onAxis(-190);
const bAt = (t: number, off: number): P2 => {
  const dx = B1[0] - B0[0];
  const dz = B1[1] - B0[1];
  const L = Math.hypot(dx, dz);
  return [B0[0] + dx * t + (dz / L) * -off, B0[1] + dz * t + (dx / L) * off];
};
export const ROAD_B: P2[] = [
  // (it begins just inside the little gate in the mountain's back, so the road meets the towers and not bare grass)
  [B0[0] - 7, B0[1] + 17],
  B0,
  bAt(0.14, 5),
  bAt(0.28, 11),
  bAt(0.42, 9),
  bAt(0.56, 0),
  bAt(0.7, -8),
  bAt(0.84, -5),
  B1,
  onAxis(-120),
  onAxis(-60),
  bEnd,
  // and on, straight through the arch's opening and out over the far side of the hill, as wide as ever, until it is
  // lost in the haze of the plain, so there is no end to be seen from the arch
  onAxis(60),
  onAxis(130),
  onAxis(210),
  onAxis(300),
  onAxis(380),
];

export type Way = { pts: THREE.Vector2[]; len: number };
export function lay(ctl: P2[], step = 4): Way {
  const c = new THREE.CatmullRomCurve3(
    ctl.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const len = c.getLength();
  const pts = c.getSpacedPoints(Math.max(8, Math.round(len / step))).map((v) => new THREE.Vector2(v.x, v.z));
  return { pts, len };
}
export const wayA = lay(ROAD_A);
export const wayB = lay(ROAD_B);

// the least turning radius of a way (m), looking at points `span` metres apart: for the check in the corner
export function minRadius(w: Way, span = 24) {
  const k = Math.max(1, Math.round(span / 4));
  let r = 1e9;
  for (let i = k; i < w.pts.length - k; i++) {
    const a = w.pts[i - k];
    const b = w.pts[i];
    const c = w.pts[i + k];
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const bc = Math.hypot(c.x - b.x, c.y - b.y);
    const ac = Math.hypot(c.x - a.x, c.y - a.y);
    const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    if (area2 > 1e-6) r = Math.min(r, (ab * bc * ac) / (2 * area2));
  }
  return r;
}

// ---- where is the nearest way?
const CELL = 24;
const cells = new Map<number, number[]>();
type Seg = [ax: number, az: number, bx: number, bz: number];
const segs: Seg[] = [];
const key = (i: number, j: number) => i * 4096 + j;
for (const w of [wayA, wayB]) {
  for (let i = 0; i < w.pts.length - 1; i++) {
    const a = w.pts[i];
    const b = w.pts[i + 1];
    const n = segs.push([a.x, a.y, b.x, b.y]) - 1;
    const i0 = Math.floor((Math.min(a.x, b.x) - 60) / CELL);
    const i1 = Math.floor((Math.max(a.x, b.x) + 60) / CELL);
    const j0 = Math.floor((Math.min(a.y, b.y) - 60) / CELL);
    const j1 = Math.floor((Math.max(a.y, b.y) + 60) / CELL);
    for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
      const k = key(ci + 1024, cj + 1024);
      let l = cells.get(k);
      if (!l) cells.set(k, (l = []));
      l.push(n);
    }
  }
}
const segDist = (s: Seg, x: number, z: number) => {
  const dx = s[2] - s[0];
  const dz = s[3] - s[1];
  const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (s[0] + dx * t), z - (s[1] + dz * t));
};
// distance (m) from a point to the nearest way; 999 when none is within 60 m
export function wayDist(x: number, z: number) {
  const l = cells.get(key(Math.floor(x / CELL) + 1024, Math.floor(z / CELL) + 1024));
  if (!l) return 999;
  let d = 999;
  for (const n of l) d = Math.min(d, segDist(segs[n], x, z));
  return d;
}
// does a tree whose crown has radius r stand clear of every way? (`pad`: the open ground left each side)
export const clearOfWays = (x: number, z: number, r: number, pad = 8) => wayDist(x, z) >= pad + r * 0.8;

// x of road A at z, for the part of it that runs down the page (the wood, the crest, the plain)
const A_TOP = 1920;
const A_STEP = 12;
const A_N = 166;
export const roadAx: number[] = (() => {
  const out: number[] = [];
  const p = wayA.pts;
  let j = 0;
  for (let i = 0; i < A_N; i++) {
    const z = A_TOP - i * A_STEP;
    while (j < p.length - 2 && p[j + 1].y > z) j++;
    const a = p[j];
    const b = p[j + 1];
    const t = Math.min(1, Math.max(0, (a.y - z) / (a.y - b.y || 1)));
    out.push(a.x + (b.x - a.x) * t);
  }
  return out;
})();
export const roadAxAt = (z: number) => {
  const f = Math.min(A_N - 1.001, Math.max(0, (A_TOP - z) / A_STEP));
  const i = Math.floor(f);
  return roadAx[i] + (roadAx[i + 1] - roadAx[i]) * (f - i);
};
export const GLSL_ROAD_AX = `const float RAX[${A_N}] = float[${A_N}](${roadAx.map((v) => v.toFixed(2)).join(",")});`;
export const ROAD_AX = { top: A_TOP, step: A_STEP, n: A_N };

// ---- the ways as a field the ground can read: signed distance to the nearest way centre (+ on the right of its
// direction), in a byte, 0.5 = on it, saturating at +-20 m
export const FIELD = { x0: -820, z0: -1820, w: 1700, h: 3800, res: 2.5, range: 20 };
export function makeWayField() {
  const W = Math.ceil(FIELD.w / FIELD.res);
  const H = Math.ceil(FIELD.h / FIELD.res);
  const best = new Float32Array(W * H).fill(1e9);
  const sd = new Float32Array(W * H);
  const band = FIELD.range + FIELD.res * 1.5;
  for (const s of segs) {
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const L2 = dx * dx + dz * dz || 1;
    const i0 = Math.max(0, Math.floor((Math.min(s[0], s[2]) - band - FIELD.x0) / FIELD.res));
    const i1 = Math.min(W - 1, Math.ceil((Math.max(s[0], s[2]) + band - FIELD.x0) / FIELD.res));
    const j0 = Math.max(0, Math.floor((Math.min(s[1], s[3]) - band - FIELD.z0) / FIELD.res));
    const j1 = Math.min(H - 1, Math.ceil((Math.max(s[1], s[3]) + band - FIELD.z0) / FIELD.res));
    for (let j = j0; j <= j1; j++) {
      const z = FIELD.z0 + (j + 0.5) * FIELD.res;
      for (let i = i0; i <= i1; i++) {
        const x = FIELD.x0 + (i + 0.5) * FIELD.res;
        const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / L2));
        const d = Math.hypot(x - (s[0] + dx * t), z - (s[1] + dz * t));
        const k = j * W + i;
        if (d < best[k]) {
          best[k] = d;
          // which side: the cross of the direction with the offset (z is down the page, so this is +x of a way going -z)
          sd[k] = dx * (z - s[1]) - dz * (x - s[0]) > 0 ? d : -d;
        }
      }
    }
  }
  // two channels: R the signed distance (exact near a way's middle), G the plain distance (never flips sign far from a
  // way, where the nearest-segment sign changes along lines that must not be seen as ways)
  const data = new Uint8Array(W * H * 2);
  for (let k = 0; k < W * H; k++) {
    const far = best[k] > 1e8;
    const v = far ? FIELD.range : Math.max(-FIELD.range, Math.min(FIELD.range, sd[k]));
    data[k * 2] = Math.round((0.5 + v / (2 * FIELD.range)) * 255);
    data[k * 2 + 1] = Math.round(Math.min(1, (far ? 1e3 : best[k]) / FIELD.range) * 255);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
export const GLSL_WAYS = /* glsl */ `
uniform sampler2D tWays;
// signed distance (m) to the nearest way, + to the right of the way's direction; 20 or more when none is near
float waySD(vec2 p){
  vec2 uv = (p - vec2(${FIELD.x0.toFixed(1)}, ${FIELD.z0.toFixed(1)})) / vec2(${FIELD.w.toFixed(1)}, ${FIELD.h.toFixed(1)});
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return ${FIELD.range.toFixed(1)};
  vec2 t = texture2D(tWays, uv).rg;
  float ad = t.g * ${FIELD.range.toFixed(1)};
  float sg = (t.r - 0.5) * ${(2 * FIELD.range).toFixed(1)};
  // (the signed value only close to a way's middle; farther off the plain distance, whose sign is never read)
  return ad > 4.0 ? ad : sg;
}`;

// ---- the plane's line of flight
// Laid as smooth curves of the distance along the way, never as hand-set heights, so the plane does not zigzag: low
// and gently rising through the wood, lifted over the crest so the whole plain and the mountain arrive together, a
// long level glide, one long even climb to the castle, and a long easing descent to the gate. `ground(x, z)` is the
// world's own height there; the result is [x, z, height above the ground] for each control point of the path.
const S3 = (t: number) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};
// a cubic from 0 (t = 0) to 1 (t = 1) whose slopes at the ends are m0 and m1 (in units of the whole rise per unit t)
const herm = (t: number, m0: number, m1: number) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return -2 * t3 + 3 * t2 + (t3 - 2 * t2 + t) * m0 + (t3 - t2) * m1;
};
// the wood and the crest, as heights of the plane (not above the ground: the ground there is a long even slope that
// peaks at the crest and falls away, and a plane that followed it would rise and fall with it): low over the track,
// lifted over the crest so the whole plain and the mountain arrive at once, then held, then easing to the long glide
const LOW: [z: number, y: number][] = [
  [1920, 9],
  [1850, 11.5],
  [1800, 19.5],
  [1750, 26.5],
  [1700, 34.5],
  [1650, 43.5],
  [1600, 54],
  [1550, 67.5],
  [1500, 76],
  [1450, 83.5],
  [1400, 87],
  [1350, 87],
  [1300, 85],
  [1250, 81],
  [1200, 77],
  [1150, 75],
  [1100, 74.5],
];
const lowY = (z: number) => {
  let i = 0;
  while (i < LOW.length - 2 && LOW[i + 1][0] > z) i++;
  const a = LOW[i];
  const b = LOW[i + 1];
  const slope = (k: number) => (k <= 0 ? (LOW[1][1] - LOW[0][1]) / (LOW[1][0] - LOW[0][0]) : k >= LOW.length - 1 ? (LOW[k][1] - LOW[k - 1][1]) / (LOW[k][0] - LOW[k - 1][0]) : (LOW[k + 1][1] - LOW[k - 1][1]) / (LOW[k + 1][0] - LOW[k - 1][0]));
  const h = b[0] - a[0];
  const t = Math.min(1, Math.max(0, (z - a[0]) / h));
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * h * slope(i) + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * h * slope(i + 1);
};
export const FLIGHT = { gateRise: 70, low: 17 };
// The castle's orbit: the plane comes on to the front of the mountain, swings left (west) round it in a wide spiral that
// shows its left flank, its back and its far right, and peels off to the way out where that begins behind it, going
// down all the while, until it is low over the road the souls walk to the gate. Compass bearings from the castle's
// middle, clockwise as seen from above (0 = the front, 270 = west, 180 = behind); the radius gives the plane room
// over the drums of the mountain (worlds/voyage.ts obstacles) and every ward, tower and peak.
const ORB: P2 = [0, -230];
// [bearing (deg), radius (m)], coming round from the front (the plane is close to 0 as it comes on)
const RING: [number, number][] = [
  [352, 520],
  [340, 430],
  [320, 350],
  [300, 305],
  [280, 280],
  [258, 268],
  [235, 262],
  [210, 266],
  [185, 282],
  [162, 318],
  [150, 360],
];
const ring = ([b, r]: [number, number]): P2 => [ORB[0] + Math.sin((b * Math.PI) / 180) * r, ORB[1] + Math.cos((b * Math.PI) / 180) * r];
export function flightPlan(ground: (x: number, z: number) => number): [x: number, z: number, above: number][] {
  const pick = (w: THREE.Vector2[], step: number, from = 0, to = w.length) => {
    const o: P2[] = [];
    let acc = 1e9;
    for (let i = from; i < to; i++) {
      if ((acc += 4) >= step) {
        o.push([w[i].x, w[i].y]);
        acc = 0;
      }
    }
    return o;
  };
  const fly: P2[] = [];
  // the wood and the crest: the plane rides the track (the first stretch of road A, down to the crest)
  const rideA = wayA.pts.filter((p) => p.y <= 1900 && p.y >= 1450);
  // (leaving the entry on its own heading, so a plane arriving from Rex, turned to it, flies straight on)
  fly.push([-45, 1840], [-38.8, 1800.5], ...pick(rideA, 58).filter((p) => p[1] < 1775 && p[1] > 1450));
  // then straight at the castle's front, over the plain
  fly.push([-1, 1385], [4, 1290], [11, 1190], [20, 1075], [14, 905], [9, 705], [3, 520]);
  // the orbit (the first point of the ring is just left of the front, where the line is already bending)
  const iRing = fly.length;
  for (const q of RING) fly.push(ring(q));
  // and on, out over the way out's first reach, and along road B to the gate and a little beyond it
  const iOut = fly.length;
  fly.push([262, -586], [330, -664]);
  const bw = wayB.pts.filter((p) => p.y <= -700);
  fly.push(...pick(bw, 76).filter((p) => p[1] < -716 && p[1] > GATE.z + 60));
  const iGate = fly.length;
  fly.push([GATE.x - Math.sin(GATE.yaw) * 0, GATE.z], [GATE.x - Math.sin(GATE.yaw) * 52, GATE.z - Math.cos(GATE.yaw) * 52]);
  const s: number[] = [0];
  for (let i = 1; i < fly.length; i++) s.push(s[i - 1] + Math.hypot(fly[i][0] - fly[i - 1][0], fly[i][1] - fly[i - 1][1]));
  const sAt = (z: number) => {
    for (let i = 1; i < fly.length; i++) if (fly[i][1] <= z) return s[i - 1] + ((s[i] - s[i - 1]) * (fly[i - 1][1] - z)) / (fly[i - 1][1] - fly[i][1] || 1);
    return s[s.length - 1];
  };
  const sLevel = sAt(1150);
  // The height. The plain's level glide, then a long even climb that meets the castle's own level as the plane turns on
  // to its flank (a monotone cubic through stations: distance along, height), held a little round the back; then ONE long
  // fall, eased in and out with a steady run between, that is low as the way out reaches its middle; level there; and
  // eased up again to the gate's own height. Once it is down, the height is a height above the ground, which rises with
  // the hill, so the plane stays low over the road all the way up to the gate.
  const iDown = iRing + 5;
  const sDown = s[iDown];
  const sRoadLow = s[iOut + 2 + Math.round((iGate - iOut - 2) * 0.5)];
  const sGate = s[iGate];
  const ORBIT_Y = 452;
  const air: [s: number, y: number][] = [
    [sLevel, 75],
    [s[iRing], 330],
    [s[iRing + 2], 415],
    [s[iRing + 4], 448],
    [sDown, ORBIT_Y],
  ];
  const ys = air.map((q) => q[1]);
  const xs = air.map((q) => q[0]);
  const sl = ys.map((_, i) => {
    if (i === 0 || i === ys.length - 1) return 0;
    const a = (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
    const b = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  const yAir = (si: number) => {
    let i = 0;
    while (i < air.length - 2 && xs[i + 1] < si) i++;
    const h = xs[i + 1] - xs[i];
    const t = Math.min(1, Math.max(0, (si - xs[i]) / h));
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * sl[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * sl[i + 1];
  };
  // 0 to 1 with a quarter of it spent easing in and a quarter easing out: the steepest part is a third more than the mean
  const trap = (t: number) => {
    const e = 0.25;
    const v = 1 / (1 - e);
    const u = Math.min(1, Math.max(0, t));
    if (u < e) return (v * u * u) / (2 * e);
    if (u > 1 - e) return 1 - (v * (1 - u) * (1 - u)) / (2 * e);
    return (v * e) / 2 + v * (u - e);
  };
  const above0 = ORBIT_Y - ground(...fly[iDown]);
  return fly.map(([x, z], i) => {
    const si = s[i];
    if (si < sLevel) return [x, z, lowY(z) - ground(x, z)] as [number, number, number];
    if (si <= sDown) return [x, z, yAir(si) - ground(x, z)] as [number, number, number];
    let a: number;
    if (si < sRoadLow) a = above0 + (FLIGHT.low - above0) * trap((si - sDown) / (sRoadLow - sDown));
    else a = FLIGHT.low + (FLIGHT.gateRise - FLIGHT.low) * S3((si - (sGate - 380)) / 380);
    return [x, z, a] as [number, number, number];
  });
}
// While the plane goes round the castle its eye turns toward it, as a camera on a boom would: the plane flies its own
// line (the eye leads it by a little), and the castle stays in the frame. Where the plane is (the world's own
// coordinates), how much of the turn to take (0 off the orbit, easing in and out) and the bearing and elevation of the
// castle's body from there; Plane.tsx chase() reads it for this world only.
export function castleGlance(x: number, y: number, z: number) {
  const dx = x - ORB[0];
  const dz = z - ORB[1];
  const rho = Math.hypot(dx, dz);
  const psi = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
  const w = rho > 500 || rho < 120 ? 0 : S3((358 - psi) / 36) * S3((psi - 152) / 26) * S3((500 - rho) / 60);
  return { w, yaw: Math.atan2(dx, dz), pitch: Math.atan2(560 - y, rho) };
}
const lerpY = (a: number, b: number, t: number) => a + (b - a) * t;
