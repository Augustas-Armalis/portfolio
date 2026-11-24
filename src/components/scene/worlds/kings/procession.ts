import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Kit, rng, type V3 } from "../kit";
import { WORLDS, groundAt } from "../voyage";
import { GLSL_END, GLSL_KINGS, KINGS_UNIFORMS, TREE, TREE_Y } from "./light";

// The start of the wood. The souls of the blue world come out of the cave they went into (the mouth of it stands here,
// in the forest, at the end of the aisle) and walk on, in the same slow procession, down a road under the great trunks
// to a white fountain of a tree that stands alone in a clearing: a slim trunk, a crown that goes up white and falls back in
// streams, tier on tier. As each reaches its foot it gives up its body and goes up the tree as a light, into the crown.
// That tree is the first thing the eye is given on arriving, and the souls are the way to it.

const def = WORLDS.kings;

// ---------- where things are ----------
// the cave's mouth (the plane comes in from here and never looks back), and the road from it to the tree's foot
export const MOUTH = { x: 0, z: 770 };
const ROAD_XZ: [number, number][] = [
  [0, 788],
  [0, 752],
  [1, 712],
  [6, 670],
  [18, 630],
  [32, 592],
  [40, 560],
  [42, 551],
];
const STEP = 3;
const MAXN = 96;
const ROAD_W = 6.6;
// (the road as points a few metres apart, once)
function roadPoints() {
  const curve = new THREE.CatmullRomCurve3(
    ROAD_XZ.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const len = curve.getLength();
  const n = Math.min(MAXN - 1, Math.ceil(len / STEP) + 1);
  const pts = curve.getSpacedPoints(n - 1);
  return { len, pts, n, step: len / (n - 1) };
}
const ROAD = roadPoints();
// Is a point in the way of the road or the clearing of the tree? (the wood keeps its trunks out of both)
export function inGlade(x: number, z: number, pad = 0) {
  if (Math.hypot(x - TREE.x, z - TREE.z) < 80 + pad) return true;
  for (let i = 0; i < ROAD.pts.length; i += 2) if (Math.hypot(x - ROAD.pts[i].x, z - ROAD.pts[i].z) < 30 + pad) return true;
  return Math.abs(x - MOUTH.x) < 62 + pad && z > MOUTH.z - 40 - pad;
}

// ---------- the sculpted things: the tree, and the rock round the cave ----------
// drawn with one material: colour and an amount of its own light per vertex (aCol: rgb, glow), lit by the one light, the
// tree's light, and the mist
function makeSculptMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `
      attribute vec4 aCol; uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol;
      void main(){
        vec3 p = position;
        // (the crown stirs, the least)
        float up = max(p.y - ${(TREE_Y + 30).toFixed(1)}, 0.0) * step(${(TREE.x - 60).toFixed(1)}, p.x) * step(p.x, ${(TREE.x + 60).toFixed(1)}) * step(${(TREE.z - 60).toFixed(1)}, p.z) * step(p.z, ${(TREE.z + 60).toFixed(1)});
        p.x += sin(uTime * 0.37 + p.y * 0.06) * 0.012 * up;
        p.z += cos(uTime * 0.31 + p.y * 0.05) * 0.012 * up;
        vec4 wp = modelMatrix * vec4(p, 1.0); vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal); vCol = aCol;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol;
      ${GLSL_KINGS}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        float d = dabs(vWorld * 1.7);
        vec3 alb = vCol.rgb * (0.82 + 0.36 * d);
        float glow = vCol.a;
        vec2 dl = domeLight(vWorld, n);
        vec3 col = alb * (coolFill(n) * 0.9 + DOME_WARM * dl.y * domeVis(vWorld) * clamp(dl.x, 0.0, 1.0) * 2.4 + treeLight(vWorld, n) * 0.8);
        // its own light: the crown is the pale thing in this country, brightest on what faces up and out, a little in each stream
        float lam = 0.6 + 0.4 * n.y;
        float breathe = 0.93 + 0.07 * sin(uTime * 0.5 + vWorld.y * 0.12 + vWorld.x * 0.05);
        col += alb * glow * lam * breathe * uTree.w;
        col += TREE_COL * glow * pow(1.0 - abs(dot(n, V)), 2.4) * 0.18 * uTree.w;
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}

// a rough boulder: a sphere pushed about
function rock(k: Kit, p: V3, rad: V3, seed: number, col: V3, o: { glow?: number; top?: V3 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + 0.2 * Math.sin(x * 3.1 + seed * 7) * Math.cos(z * 2.7 + seed * 3) + 0.12 * Math.sin(y * 5.3 + x * 2.2 + seed) + 0.07 * Math.sin((x + z) * 9.0 + seed * 5);
    pos.setXYZ(i, x * n, y * n, z * n);
  }
  k.add(g, p, col, { scale: rad, flat: true, glow: o.glow ?? 0, top: o.top });
}

function sculpt(mobile: boolean) {
  const k = new Kit();
  const kt = new Kit();
  const gy = (x: number, z: number) => groundAt(def, x, z);
  const TX = TREE.x;
  const TZ = TREE.z;
  const g0 = TREE_Y;
  // ----- the tree: a slim leaning trunk, and a crown that goes up white and falls back in streams, like a fountain -----
  // (the trunk and the lobes of the crown are solids; the streams are ribbons, each an arc that leaves the crown, rises a
  // little, and falls out and down, tapering, to the ground: a few hundred of them in three tiers, the longest outermost)
  const white: V3 = [0.97, 0.94, 0.86];
  const cream: V3 = [0.9, 0.82, 0.66];
  const TH = 40; // the trunk's height; the crown stands on it
  kt.add(new THREE.CylinderGeometry(0.5, 1.5, TH, 12, 4), [TX + 0.8, g0 + TH / 2 - 0.5, TZ], [0.42, 0.34, 0.26], { glow: 0.28, top: [0.75, 0.68, 0.56], rot: [0.0, 0, -0.04] });
  kt.add(new THREE.CylinderGeometry(1.5, 3.4, 2.4, 14), [TX, g0 + 0.8, TZ], [0.36, 0.28, 0.22], { glow: 0.2 });
  // the crown's heart: soft overlapping lobes, brightest on top
  for (const [x, y, z, rr] of [
    [0, 44.5, 0, 6.2],
    [3.4, 43, 1.5, 4.4],
    [-3.2, 42.6, -1.8, 4.6],
    [0.6, 48.4, -0.6, 4.0],
    [-1.4, 41.6, 3.4, 3.8],
    [1.8, 41.2, -3.6, 3.8],
  ] as const)
    kt.add(new THREE.IcosahedronGeometry(rr, 2), [TX + x, g0 + y, TZ + z], white, { glow: 0.7, scale: [1, 0.85, 1], top: [1, 1, 0.96] });
  const sr = rng(31);
  const strands: { P: number[]; N: number[]; C: number[] } = { P: [], N: [], C: [] };
  const NS = mobile ? 210 : 440;
  const SEG = 7;
  for (let i = 0; i < NS; i++) {
    const tier = i % 3;
    const a = sr() * Math.PI * 2;
    const reach = [13, 21, 30][tier] * (0.78 + 0.44 * sr());
    const y0 = [49, 45.5, 42][tier] + (sr() - 0.5) * 3;
    const yEnd = [27, 12, 1.6][tier] * (0.6 + 0.8 * sr()) + 1;
    const lift = [4, 6, 8][tier] * (0.6 + 0.8 * sr());
    const w0 = (0.42 + 0.7 * sr()) * [1.7, 1.15, 0.9][tier];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pts: V3[] = [];
    for (let j = 0; j <= SEG; j++) {
      const t = j / SEG;
      const rad = 1.6 + (reach - 1.6) * Math.pow(t, 0.8);
      const wob = Math.sin(t * 4.2 + i * 1.7) * 1.4 * t + Math.sin(t * 9 + i) * 0.35 * t;
      pts.push([TX + ca * rad - sa * wob, g0 + y0 + (yEnd - y0) * t * t + lift * Math.sin(Math.PI * Math.min(1, t * 1.25) * 0.8) * (1 - t) * 1.2, TZ + sa * rad + ca * wob]);
    }
    for (let j = 0; j < SEG; j++) {
      const t0 = j / SEG;
      const t1 = (j + 1) / SEG;
      const wA = w0 * (1 - 0.78 * Math.pow(t0, 1.3));
      const wB = w0 * (1 - 0.78 * Math.pow(t1, 1.3));
      const A = pts[j];
      const B = pts[j + 1];
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const dz = B[2] - A[2];
      // the ribbon's width runs round the tree; its face looks out
      const sx = -sa;
      const sz = ca;
      let nx = dy * sz - dz * 0;
      let ny = dz * sx - dx * sz;
      let nz = dx * 0 - dy * sx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const g1 = 0.62 - 0.5 * Math.pow(t0, 1.0);
      const g2 = 0.62 - 0.5 * Math.pow(t1, 1.0);
      const col: V3 = i % 2 ? white : cream;
      const q = (P: V3, w: number, sgn: number, gl: number) => {
        strands.P.push(P[0] + sx * w * 0.5 * sgn, P[1], P[2] + sz * w * 0.5 * sgn);
        strands.N.push(nx, ny, nz);
        strands.C.push(col[0], col[1], col[2], gl);
      };
      for (const [P, w, sg, gl] of [
        [A, wA, -1, g1],
        [A, wA, 1, g1],
        [B, wB, 1, g2],
        [A, wA, -1, g1],
        [B, wB, 1, g2],
        [B, wB, -1, g2],
      ] as const)
        q(P, w, sg, gl);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(strands.P, 3));
  sg.setAttribute("normal", new THREE.Float32BufferAttribute(strands.N, 3));
  sg.setAttribute("aCol", new THREE.Float32BufferAttribute(strands.C, 4));
  // the pale basin at its foot, where the streams fall, and a ring of light on its lip
  kt.add(new THREE.CylinderGeometry(20, 21, 2.4, 48), [TX, g0 + 0.4, TZ], [0.34, 0.4, 0.5], { glow: 0.12, top: [0.5, 0.62, 0.78] });
  kt.add(new THREE.CylinderGeometry(18.6, 18.6, 0.2, 48), [TX, g0 + 1.45, TZ], [0.5, 0.64, 0.82], { glow: 0.28 });
  kt.add(new THREE.TorusGeometry(20, 0.6, 6, 72), [TX, g0 + 1.6, TZ], [1, 0.92, 0.78], { glow: 0.6, rot: [Math.PI / 2, 0, 0] });

  // ----- the cave: a mound of dark rock with the mouth in it, the way the road comes out -----
  const mx = MOUTH.x;
  const mz = MOUTH.z;
  const gm = gy(mx, mz + 10);
  const ROCK: V3 = [0.03, 0.036, 0.062];
  const ROCK_T: V3 = [0.075, 0.085, 0.11];
  rock(k, [mx, gm + 12, mz + 86], [84, 38, 56], 1.3, ROCK, { top: ROCK_T });
  rock(k, [mx - 50, gm + 7, mz + 28], [32, 22, 26], 2.1, ROCK, { top: ROCK_T });
  rock(k, [mx + 50, gm + 7, mz + 30], [32, 24, 26], 3.4, ROCK, { top: ROCK_T });
  // the jambs and the lintel of the mouth: fourteen metres wide, eleven high
  rock(k, [mx - 15.5, gm + 6.5, mz + 4], [8.4, 14, 9], 4.2, ROCK, { top: ROCK_T });
  rock(k, [mx + 15.5, gm + 6.5, mz + 4], [8.4, 14.5, 9], 5.1, ROCK, { top: ROCK_T });
  rock(k, [mx, gm + 16.2, mz + 5], [17, 5.6, 9], 6.3, ROCK, { top: ROCK_T });
  rock(k, [mx - 29, gm + 3, mz - 6], [7, 6, 6], 7.7, ROCK, { top: ROCK_T });
  rock(k, [mx + 30, gm + 2.4, mz - 4], [7.5, 5.2, 6], 8.9, ROCK, { top: ROCK_T });
  // inside: the amber light of the cave the souls came out of, a slit of it, and the floor of it
  k.box(15, 12.4, 0.6, [mx, gm + 5.9, mz + 18], [1, 0.74, 0.4], { glow: 1.1, top: [1, 0.55, 0.2] });
  k.box(9, 0.2, 18, [mx, gm + 0.1, mz + 9], [0.95, 0.66, 0.34], { glow: 0.5 });
  // (the tree is made at the size of the little one in the glass, a tenth of the kings' height, then raised to its own)
  const SC = TREE.s;
  const place = (g: THREE.BufferGeometry) => g.translate(-TX, -g0, -TZ).scale(SC, SC, SC).translate(TX, g0, TZ);
  const treeG = kt.build();
  place(treeG);
  place(sg);
  const solid = mergeGeometries([k.build(), treeG])!;
  treeG.dispose();
  return { solid, strands: sg };
}

// ---------- the souls ----------
// one soul, a unit tall: a long cloak falling from narrow shoulders, a small rounded hood, bowed (as in the blue world)
function soulGeometry(seg: number) {
  const rings: [number, number][] = [
    [0.19, 0],
    [0.17, 0.2],
    [0.14, 0.5],
    [0.124, 0.7],
    [0.13, 0.765],
    [0.082, 0.81],
    [0.1, 0.875],
    [0.1, 0.93],
    [0.05, 0.985],
    [0.0, 1.03],
  ];
  const g = new THREE.LatheGeometry(
    rings.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)),
    seg,
  );
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = Math.max(0, (y - 0.66) / 0.34);
    p.setZ(i, p.getZ(i) * 0.82 + k * k * 0.05);
    p.setY(i, y - k * k * 0.018);
  }
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}

const ROAD_GLSL = /* glsl */ `
  uniform vec3 uRoad[${MAXN}]; uniform vec4 uRd; uniform float uWalk;
  // the road at s metres along it: its middle, and the way it runs
  vec3 roadAt(float s, out vec3 fwd){
    float f = clamp(s / uRd.y, 0.0, uRd.x - 1.001);
    int i = int(floor(f)); float t = f - floor(f);
    vec3 a = uRoad[i]; vec3 b = uRoad[i + 1];
    fwd = normalize(vec3(b.x - a.x, 0.0, b.z - a.z));
    return mix(a, b, t);
  }
  // where along the circuit a soul is (the road, then a few metres of its being lit): uRd.z the road's length
  float soulS(float phase){ return mod(phase + uTime * uWalk, uRd.z + 8.0); }
`;

function roadUniforms() {
  const arr: THREE.Vector3[] = [];
  for (let i = 0; i < MAXN; i++) {
    const p = ROAD.pts[Math.min(i, ROAD.pts.length - 1)];
    arr.push(new THREE.Vector3(p.x, groundAt(def, p.x, p.z) + 0.04, p.z));
  }
  return { uRoad: { value: arr }, uRd: { value: new THREE.Vector4(ROAD.n, ROAD.step, ROAD.len, 0) }, uWalk: { value: 0.85 } };
}

function makeFigureMaterial(ro: ReturnType<typeof roadUniforms>) {
  return new THREE.ShaderMaterial({
    uniforms: { ...KINGS_UNIFORMS, ...ro },
    vertexShader: /* glsl */ `
      attribute vec4 aI; uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying float vSeed; varying float vK;
      ${ROAD_GLSL}
      void main(){
        float s = soulS(aI.x);
        vec3 fwd; vec3 c = roadAt(s, fwd);
        vec3 right = vec3(-fwd.z, 0.0, fwd.x);
        float seed = aI.z;
        float walked = uTime * uWalk;
        // on the road they go single file toward the tree and gather round its foot
        float lat = aI.y * mix(1.0, 0.55, smoothstep(uRd.z - 40.0, uRd.z - 4.0, s));
        vec3 base = c + right * (lat + sin(uTime * 0.09 + seed * 50.0) * 0.14);
        // (a soul comes into being in the dark of the cave, rising out of it over a few steps; at the tree it gives up its body)
        float born = smoothstep(0.0, 10.0, s);
        float melt = 1.0 - smoothstep(uRd.z - 9.0, uRd.z - 0.5, s);
        float H = 2.65 * aI.w * born * melt;
        float girth = 0.9 + 0.24 * fract(seed * 3.7);
        float ph = (aI.x + walked) * 4.4 + seed * 6.2832;
        float k = position.y;
        float sway = sin(ph) * 0.07 * k;
        float bob = abs(sin(ph)) * 0.045;
        float turn = (fract(seed * 7.13) - 0.5) * 0.5;
        float cs = cos(turn); float sn = sin(turn);
        vec3 f2 = fwd * cs + right * sn; vec3 r2 = right * cs - fwd * sn;
        float stoop = fract(seed * 2.17); float hoodK = fract(seed * 5.31);
        float bow = smoothstep(0.68, 1.0, k) * (0.6 + 1.5 * stoop);
        float hem = 1.0 + (fract(seed * 8.3) - 0.3) * 0.5 * (1.0 - smoothstep(0.0, 0.5, k));
        float peak = 1.0 + (hoodK - 0.4) * 0.16 * smoothstep(0.86, 1.0, k);
        vec3 lp = vec3(position.x * H * girth * hem + sway, k * H * peak + bob - bow * 0.03, position.z * H * girth * hem + 0.09 * k * k + bow * (0.05 + 0.025 * sin(ph * 2.0 + 1.0)));
        vec3 wp0 = base + r2 * lp.x + vec3(0.0, lp.y, 0.0) + f2 * lp.z;
        vec4 wp = modelMatrix * vec4(wp0, 1.0);
        vWorld = wp.xyz; vSeed = seed; vK = k;
        vN = normalize(mat3(modelMatrix) * (r2 * normal.x + vec3(0.0, normal.y, 0.0) + f2 * normal.z));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying float vSeed; varying float vK;
      ${GLSL_KINGS}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float k = vK;
        // near-black indigo cloth in folds, lit along its edges: gold from the cave behind, and as it comes near, the tree's white
        float fold = vnoise(vec2(atan(n.x, n.z) * 3.0 + vSeed * 40.0, k * 9.0 + vSeed * 7.0)) * 0.6 + 0.4;
        vec3 alb = mix(vec3(0.004, 0.006, 0.024), vec3(0.01, 0.013, 0.05), fract(vSeed * 5.3)) * (0.5 + 0.5 * k) * (0.6 + 0.8 * fold);
        vec3 col = alb * (coolFill(n) * 5.0 + treeLight(vWorld, n) * 7.0 + DOME_WARM * domeLight(vWorld, n).y * 0.4);
        vec3 toTree = uTree.xyz - vWorld; float dT = length(toTree);
        vec3 L = normalize(vec3(toTree.x, 0.25, toTree.z));
        float near = 1.0 - smoothstep(30.0, 190.0, dT);
        vec3 rimCol = mix(vec3(1.0, 0.62, 0.2), TREE_COL, near);
        float fres = pow(1.0 - abs(dot(n, V)), 3.2) * smoothstep(-0.1, 0.8, dot(n, L));
        float up = smoothstep(0.38, 0.8, k);
        float crown = smoothstep(0.35, 0.95, n.y) * smoothstep(0.86, 0.97, k);
        col += rimCol * (fres * up * 1.9 + crown * 0.1 * near) * (0.6 + 0.6 * near);
        col += vec3(0.03, 0.12, 0.2) * smoothstep(0.4, 1.0, n.y) * smoothstep(0.8, 0.95, k) * 0.12;
        gl_FragColor = vec4(kingsAir(col, vWorld), 1.0);
        ${GLSL_END}
      }`,
  });
}

// the lights: a small flame some of them carry before the breast; and each soul's own light, which it becomes at the tree and
// carries up round the trunk into the crown
function makeLightMaterial(ro: ReturnType<typeof roadUniforms>) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...KINGS_UNIFORMS, ...ro },
    vertexShader: /* glsl */ `
      attribute vec4 aL; uniform float uTime; uniform float uMist; uniform vec4 uFogK;
      varying vec2 vUv; varying float vK; varying float vRise;
      ${ROAD_GLSL}
      void main(){
        float kind = aL.w;
        float s = soulS(aL.x);
        float seed = aL.z;
        vec3 fwd; vec3 c = roadAt(s, fwd);
        vec3 right = vec3(-fwd.z, 0.0, fwd.x);
        float lat = aL.y * mix(1.0, 0.55, smoothstep(uRd.z - 40.0, uRd.z - 4.0, s));
        float ph = (aL.x + uTime * uWalk) * 4.4 + seed * 6.2832;
        vec3 p;
        float live;
        float rise = 0.0;
        vRise = 0.0;
        if (kind < 0.5) {
          // a flame carried: before the breast, up and down a little with the step
          p = c + right * (lat + 0.32) + fwd * 0.45 + vec3(0.0, 1.5 + abs(sin(ph)) * 0.045, 0.0);
          live = smoothstep(0.0, 10.0, s) * (1.0 - smoothstep(uRd.z - 7.0, uRd.z - 1.0, s));
        } else {
          // a soul's light: nothing until it has reached the tree; then up in a slow spiral round the trunk to the crown, and out
          rise = clamp((s - (uRd.z - 7.0)) / 15.0, 0.0, 1.0);
          float e = rise * rise * (3.0 - 2.0 * rise);
          float a = seed * 6.2832 + e * 7.0 + uTime * 0.1;
          float rad = mix(1.6, ${(TREE.s * 15).toFixed(1)}, e * e) + sin(uTime * 0.7 + seed * 30.0) * 0.8;
          p = mix(c + vec3(right * lat), vec3(${TREE.x.toFixed(1)}, 0.0, ${TREE.z.toFixed(1)}) + vec3(cos(a) * rad, 0.0, sin(a) * rad), smoothstep(0.0, 0.25, rise));
          p.y = ${TREE_Y.toFixed(2)} + 1.9 + ${(TREE.s * 46).toFixed(1)} * pow(e, 0.8);
          live = smoothstep(0.0, 0.08, rise) * (1.0 - smoothstep(0.82, 1.0, rise)) * step(0.0001, rise);
          vRise = 1.0;
        }
        vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
        float d = -mv.z;
        float size = max(kind < 0.5 ? 2.4 : 3.2, d * 0.0048);
        mv.xy += position.xy * size;
        vUv = position.xy;
        float flick = 0.84 + 0.16 * sin(uTime * (5.0 + seed * 4.0) + seed * 40.0) * sin(uTime * 2.3 + seed * 17.0);
        float k0 = kind < 0.5 ? 1.0 : 0.8 + 0.4 * sin(uTime * 0.8 + seed * 50.0);
        vK = live * flick * k0 * smoothstep(1.5, 8.0, d) * (min(size, 2.4) / size) * exp(-d * (uFogK.x * 0.3 + uMist * 1.5));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vK; varying float vRise;
      ${GLSL_KINGS}
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = exp(-r * r * 90.0) * 3.0 + exp(-r * r * 9.0) * 0.3 + exp(-r * 3.2) * 0.05;
        a *= 1.0 - smoothstep(0.75, 1.0, r);
        vec3 c = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.95, 0.8), exp(-r * r * 160.0));
        // a soul that has become light is cold and white, as the tree is
        c = mix(c, mix(vec3(0.7, 0.86, 1.0), vec3(1.0, 0.97, 0.9), exp(-r * r * 120.0)), vRise);
        gl_FragColor = vec4(c * a * vK * 2.6, 1.0);
        ${GLSL_END}
      }`,
  });
}

// the road itself: a worn pale line on the ground under them, faintly lit, a slow brightening walking along it toward the tree
function roadRibbon() {
  const P: number[] = [];
  const U: number[] = [];
  const idx: number[] = [];
  const pts = ROAD.pts;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    const rx = -dz / l;
    const rz = dx / l;
    for (const sd of [-1, 1]) {
      const x = pts[i].x + rx * ROAD_W * 0.62 * sd;
      const z = pts[i].z + rz * ROAD_W * 0.62 * sd;
      P.push(x, groundAt(def, x, z) + 0.22, z);
      U.push(sd, i * ROAD.step);
    }
    if (i) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("aU", new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
function makeRoadMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...KINGS_UNIFORMS },
    vertexShader: /* glsl */ `
      attribute vec2 aU; varying vec2 vU; varying vec3 vWorld;
      void main(){ vU = aU; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec2 vU; varying vec3 vWorld;
      ${GLSL_KINGS}
      void main(){
        float across = 1.0 - smoothstep(0.25, 1.0, abs(vU.x));
        float d = length(cameraPosition - vWorld);
        float near = 1.0 - smoothstep(30.0, 200.0, length(uTree.xyz - vWorld));
        float walk = 0.55 + 0.45 * sin(vU.y * 0.16 - uTime * 0.7);
        float grain = 0.7 + 0.5 * vnoise(vec2(vU.x * 3.0, vU.y * 0.5));
        float born = smoothstep(4.0, 26.0, vU.y);
        vec3 c = mix(vec3(1.0, 0.7, 0.36), vec3(0.85, 0.93, 1.0), near);
        float a = across * across * walk * grain * born * (0.075 + 0.06 * near);
        gl_FragColor = vec4(c * a * exp(-d * (uFogK.x * 0.45 + uMist * 1.5)), 1.0);
        ${GLSL_END}
      }`,
  });
}

export function buildProcession(mobile: boolean, effects: number) {
  const r = rng(1911);
  const n = mobile ? 130 : Math.round(220 + 70 * Math.min(1, effects));
  const C = ROAD.len + 8;
  const inst = new Float32Array(n * 4);
  const lights: number[] = [];
  for (let i = 0; i < n; i++) {
    const phase = ((i + 0.5 + (r() - 0.5) * 0.9) / n) * C;
    // (the crowd keeps to the road: a few more toward its middle)
    const lat = ((r() + r()) / 2 - 0.5) * (ROAD_W - 1.2) * 1.5;
    const seed = r();
    inst.set([phase, lat, seed, 0.86 + r() * 0.28], i * 4);
    lights.push(phase, lat, seed, 1);
    if (r() < 0.12) lights.push(phase, lat, seed * 0.999, 0);
  }
  const src = soulGeometry(mobile ? 6 : 7);
  const figG = new THREE.InstancedBufferGeometry();
  figG.setAttribute("position", src.attributes.position);
  figG.setAttribute("normal", src.attributes.normal);
  figG.setIndex(src.index);
  figG.setAttribute("aI", new THREE.InstancedBufferAttribute(inst, 4));
  figG.instanceCount = n;
  figG.boundingSphere = new THREE.Sphere(new THREE.Vector3(20, 20, 690), 200);
  const lightG = new THREE.InstancedBufferGeometry();
  lightG.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  lightG.setIndex([0, 1, 2, 0, 2, 3]);
  lightG.setAttribute("aL", new THREE.InstancedBufferAttribute(new Float32Array(lights), 4));
  lightG.instanceCount = lights.length / 4;
  lightG.boundingSphere = new THREE.Sphere(new THREE.Vector3(20, 40, 690), 260);
  const ro = roadUniforms();
  return {
    ...(() => {
      const sc = sculpt(mobile);
      return { scenery: sc.solid, strands: sc.strands };
    })(),
    sceneryMat: makeSculptMaterial(),
    road: roadRibbon(),
    roadMat: makeRoadMaterial(),
    figs: figG,
    figMat: makeFigureMaterial(ro),
    lights: lightG,
    lightMat: makeLightMaterial(ro),
    src,
  };
}
