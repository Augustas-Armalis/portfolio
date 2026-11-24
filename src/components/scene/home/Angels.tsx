"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { laneD, sst } from "./journey";
import { GLSL_HOME_AIR, HOME_U, landH, rng } from "./land";
import { DEER, FOREST_K, OWLS, plantWoods, trackAt } from "./Woods";

// The angels of the old forest (Angelų takas: the path of angels). They stand at the wayside, between the track and
// the first trunks, framed by the trees, turned toward the way the plane comes. Not statues: tall pale figures whose
// robes go to mist below the knee, so they seem to stand IN the low fog rather than on the ground, with a soft light
// about them that grows as the forest goes to night, and a slow sway, the wings breathing a little.
//
// Each is drawn smooth: a robe turned on a lathe (falling in soft folds), hands held together at the breast, a head
// with its hair, and two long wings as curved feathered surfaces rising behind the shoulders and sweeping down
// behind, cut into feathers at their trailing edge. One mesh for all of them, one for their light.

const ROBES: [number, number, number][] = [
  [0.86, 0.84, 0.8],
  [0.7, 0.76, 0.88],
  [0.88, 0.76, 0.72],
  [0.76, 0.86, 0.8],
];

// where they stand: along the track, each side in turn, clear of every trunk and of the track itself
function placeAngels(amount: number) {
  const trees = plantWoods(amount);
  const r = rng(777);
  const out: { x: number; z: number; y: number; yaw: number; s: number; robe: number }[] = [];
  let side = 1;
  for (let al = 1.95; al < 7.7; al += 0.62 + r() * 0.12) {
    let best: { x: number; z: number; score: number } | null = null;
    for (let j = 0; j < 40; j++) {
      const a = al + (r() - 0.5) * 0.12;
      const t = trackAt(a);
      // (beside the track, short of where the trees begin: the lane is kept seven metres either side of its line)
      const off = 3.4 + r() * 1.8;
      const x = t.x + t.nx * side * off;
      const z = t.z + t.nz * side * off;
      if (laneD(x, z).d > 6.2) continue;
      if (Math.hypot(x - DEER.x, z - DEER.z) < 7 || OWLS.some((o) => Math.hypot(x - o.x, z - o.z) < 4)) continue;
      // (from its own track it keeps at least three metres, so the fox and anyone walking pass by it)
      let trackGap = 1e9;
      for (let k = -6; k <= 6; k++) {
        const q = trackAt(a + k * 0.02);
        trackGap = Math.min(trackGap, Math.hypot(x - q.x, z - q.z));
      }
      if (trackGap < 3.0) continue;
      let trunk = 1e9;
      for (const tr of trees) {
        const d = Math.hypot(tr.x - x, tr.z - z);
        if (d < trunk) trunk = d;
      }
      if (trunk < 2.2) continue;
      // (best: framed, a trunk or two near behind it but none touching)
      const score = -Math.abs(trunk - 3.2) - 0.2 * Math.abs(off - 4.2);
      if (!best || score > best.score) best = { x, z, score };
    }
    if (best) {
      const t = trackAt(al);
      // turned toward the track and a little toward the way the plane comes (from the town)
      const back = trackAt(al - 0.25);
      const fx = (t.x - best.x) * 0.75 + (back.x - t.x) * 0.012;
      const fz = (t.z - best.z) * 0.75 + (back.z - t.z) * 0.012;
      out.push({ x: best.x, z: best.z, y: landH(best.x, best.z), yaw: Math.atan2(fx, fz), s: 1.25 + r() * 0.18, robe: out.length % ROBES.length });
      side = -side;
    }
  }
  return out;
}

// ---------- one figure, in its own space: feet at the origin, facing +z, about 2.7 units tall ----------
// part 0 robe, 1 skin, 2 hair, 3 wing; flex: how far a wing point is from its root (it breathes more there)
type Piece = { g: THREE.BufferGeometry; part: number; flex?: (i: number) => number };
function figure(): Piece[] {
  const pieces: Piece[] = [];
  // the robe: a lathe profile from the hem up to the neck, a little fuller at the back; soft folds run down it
  const prof: [number, number][] = [
    [0.56, 0.0],
    [0.47, 0.25],
    [0.39, 0.55],
    [0.33, 0.85],
    [0.25, 1.1],
    [0.2, 1.3],
    [0.215, 1.45],
    [0.225, 1.55],
    [0.19, 1.63],
    [0.08, 1.7],
    [0.055, 1.76],
  ];
  const curve = new THREE.SplineCurve(prof.map(([a, b]) => new THREE.Vector2(a, b)));
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 22; i++) pts.push(curve.getPoint(i / 22));
  const robe = new THREE.LatheGeometry(pts, 40);
  const p = robe.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(x, z);
    // folds: deeper toward the hem, gone at the shoulders
    const fold = 1 + 0.06 * Math.sin(a * 9) * (1 - sst(0.3, 1.2, y)) + 0.025 * Math.sin(a * 5 + 1.3) * (1 - sst(0.9, 1.5, y));
    p.setXYZ(i, x * fold, y, z * fold * (z < 0 ? 0.9 : 0.82));
  }
  robe.computeVertexNormals();
  pieces.push({ g: robe, part: 0 });
  // the head and its hair (a cap over the back and top of the head)
  const head = new THREE.SphereGeometry(0.105, 20, 14);
  head.scale(0.92, 1.08, 0.96);
  head.translate(0, 1.86, 0.01);
  pieces.push({ g: head, part: 1 });
  const hair = new THREE.SphereGeometry(0.118, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hair.scale(0.98, 1.12, 1.0);
  hair.rotateX(-0.55);
  hair.translate(0, 1.875, -0.018);
  pieces.push({ g: hair, part: 2 });
  // the hands together at the breast, in sleeves that widen toward the wrist
  for (const sg of [-1, 1]) {
    const arm = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sg * 0.21, 1.53, -0.01),
      new THREE.Vector3(sg * 0.25, 1.36, 0.05),
      new THREE.Vector3(sg * 0.15, 1.3, 0.17),
      new THREE.Vector3(sg * 0.035, 1.38, 0.22),
    ]);
    const tube = new THREE.TubeGeometry(arm, 16, 0.055, 12, false);
    const tp = tube.attributes.position;
    const c = new THREE.Vector3();
    const d = new THREE.Vector3();
    for (let i = 0; i < tp.count; i++) {
      const seg = Math.floor(i / 13) / 16;
      arm.getPoint(seg, c);
      d.set(tp.getX(i), tp.getY(i), tp.getZ(i)).sub(c).multiplyScalar(0.85 + 0.55 * seg * seg);
      tp.setXYZ(i, c.x + d.x, c.y + d.y, c.z + d.z);
    }
    tube.computeVertexNormals();
    pieces.push({ g: tube, part: 0 });
    const hand = new THREE.SphereGeometry(0.04, 14, 10);
    hand.scale(0.7, 1.5, 0.9);
    hand.translate(sg * 0.022, 1.43, 0.235);
    pieces.push({ g: hand, part: 1 });
  }
  // the wings: a curved surface for each, u along the wing from the shoulder to its raised tip, v down across it to
  // the feathered trailing edge, which sweeps down behind the figure almost to the knee
  for (const sg of [-1, 1]) {
    const U = 26;
    const V = 14;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    // the leading edge arches up and out from the shoulder to the raised tip; the trailing edge, the long flight
    // feathers, sweeps from the tip down and in behind the figure to below the waist
    const lead = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sg * 0.1, 1.62, -0.16),
      new THREE.Vector3(sg * 0.42, 1.92, -0.3),
      new THREE.Vector3(sg * 0.76, 2.32, -0.42),
      new THREE.Vector3(sg * 0.93, 2.72, -0.5),
      new THREE.Vector3(sg * 0.86, 2.98, -0.53),
    ]);
    const trail = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sg * 0.13, 0.78, -0.3),
      new THREE.Vector3(sg * 0.32, 1.02, -0.42),
      new THREE.Vector3(sg * 0.58, 1.46, -0.52),
      new THREE.Vector3(sg * 0.82, 2.14, -0.56),
      new THREE.Vector3(sg * 0.86, 2.98, -0.53),
    ]);
    const q = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i <= U; i++) {
      const u = i / U;
      lead.getPoint(u, q);
      trail.getPoint(u, t);
      for (let j = 0; j <= V; j++) {
        const v = j / V;
        // across the wing from its leading edge to its feathers, bellied back away from the body
        const cup = 0.13 * Math.sin(Math.PI * v) * (1 - u * 0.5);
        pos.push(q.x + (t.x - q.x) * v + sg * 0.03 * cup, q.y + (t.y - q.y) * v, q.z + (t.z - q.z) * v - cup);
        uv.push(u, v);
      }
    }
    for (let i = 0; i < U; i++)
      for (let j = 0; j < V; j++) {
        const a = i * (V + 1) + j;
        const b = a + V + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    pieces.push({ g, part: 3, flex: (i) => uv[i * 2] * 0.7 + uv[i * 2 + 1] * 0.3 });
  }
  return pieces;
}

export type AngelSpot = { x: number; z: number; y: number; yaw: number; s: number; robe: number };
// The air a set of angels stands in: its GLSL (with the sky's and noise already before it), the calls that apply it
// to a colour and give how much of it lies on a point, and its uniforms. The forest's own by default.
export type AngelAir = { glsl: string; apply: string; amount: string; uniforms: Record<string, THREE.IUniform>; night?: THREE.IUniform };
const HOME_ANGEL_AIR: AngelAir = { glsl: GLSL_HOME_AIR, apply: "homeAir(col, vWorld)", amount: "homeAirAmt(vWorld)", uniforms: HOME_U };
export function makeAngels(amount: number) {
  return buildAngels(placeAngels(amount));
}
// Any set of angels, anywhere (the Funeral Symphony's watchers use this): `list` says where, how large (s: metres
// of scale, a figure stands 2.7 s tall), which way it faces and which robe.
export function buildAngels(list: AngelSpot[], air: AngelAir = HOME_ANGEL_AIR) {
  const pieces = figure();
  const geos: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  list.forEach((a, n) => {
    m.compose(new THREE.Vector3(a.x, a.y - 0.05, a.z), new THREE.Quaternion().setFromAxisAngle(up, a.yaw), new THREE.Vector3(a.s, a.s, a.s));
    const seed = n * 1.73 + 0.4;
    for (const pc of pieces) {
      const g = pc.g.clone();
      const cnt = g.attributes.position.count;
      const am = new Float32Array(cnt * 4);
      const col = new Float32Array(cnt * 3);
      const uv = new Float32Array(cnt * 2);
      const c = pc.part === 0 ? ROBES[a.robe] : pc.part === 1 ? [0.93, 0.8, 0.7] : pc.part === 2 ? [0.62, 0.46, 0.28] : [0.95, 0.92, 0.84];
      const pa = g.attributes.position;
      for (let i = 0; i < cnt; i++) {
        am.set([pa.getY(i) / 2.7, pc.part, pc.flex ? pc.flex(i) : 0, seed], i * 4);
        col.set(c, i * 3);
        if (pc.part === 3) uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], i * 2);
      }
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute("aM", new THREE.Float32BufferAttribute(am, 4));
      g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 3));
      g.applyMatrix4(m);
      geos.push(g.index ? g : g);
    }
  });
  const geo = mergeGeometries(geos, false)!;
  geos.forEach((g) => g.dispose());
  pieces.forEach((pc) => pc.g.dispose());
  geo.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...air.uniforms, uNightK: air.night ?? FOREST_K.night },
    vertexShader: /* glsl */ `
      attribute vec4 aM; attribute vec3 aCol;
      uniform float uTime;
      varying vec3 vN; varying vec3 vWorld; varying vec3 vCol; varying vec4 vM; varying vec2 vUv;
      void main(){
        vec3 wp = position;
        float h = aM.x; float seed = aM.w;
        // a slow sway from the feet up, each its own; a breath through the wings
        vec3 lean = vec3(sin(uTime * 0.42 + seed), 0.0, cos(uTime * 0.37 + seed * 1.7)) * 0.07;
        wp += lean * h * h;
        wp.y += 0.04 * sin(uTime * 0.6 + seed * 2.3) * h;
        wp += normal * aM.z * aM.z * 0.07 * sin(uTime * 0.8 + seed) * step(2.5, aM.y);
        // (the model matrix is the identity in the forest; elsewhere the figures stand with their world)
        vec4 w4 = modelMatrix * vec4(wp, 1.0);
        vWorld = w4.xyz; vN = normal; vCol = aCol; vM = aM; vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * w4;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNightK;
      varying vec3 vN; varying vec3 vWorld; varying vec3 vCol; varying vec4 vM; varying vec2 vUv;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${air.glsl}
      void main(){
        float part = vM.y;
        vec3 eye = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vN);
        if (dot(n, eye) < 0.0) n = -n;
        float a = 1.0;
        vec3 alb = vCol;
        if (part > 2.5) {
          // feathers: the trailing edge cut into rounded tips, fine lines running down the wing, a gold rim
          float u = vUv.x; float v = vUv.y;
          // (rows of feathers: coverts near the leading edge, then the long flight feathers, each row's tips
          // rounded, the last row's free against the air)
          float rows = v * 3.0;
          float row = floor(rows);
          float fr = fract(rows);
          float tipU = fract(u * (9.0 + row * 2.0) + row * 0.37);
          float tip = 0.82 + 0.16 * sqrt(max(0.0, 1.0 - pow(tipU * 2.0 - 1.0, 2.0)));
          a *= row > 1.5 ? 1.0 - smoothstep(tip - 0.06, tip, fr) : 1.0;
          float shade = mix(1.0, 0.86, smoothstep(tip - 0.25, tip, fr)) * (0.93 + 0.07 * smoothstep(0.1, 0.4, abs(tipU - 0.5)));
          alb *= shade;
          alb = mix(alb, vec3(1.0, 0.86, 0.55), smoothstep(0.1, 0.0, v) * 0.55 + smoothstep(0.88, 1.0, v) * 0.25);
          a *= 0.9 - 0.25 * v;
        }
        // painted light: soft wrap from the sky and the key, a cool fill
        float wrap = clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = alb * (uSkyCol * (0.75 + 0.25 * n.y) + uKeyCol * wrap * 0.45 + vec3(0.06, 0.07, 0.09));
        // their own light: a glow from within, brightest at the rims, warmer as night comes
        float rim = pow(1.0 - max(dot(n, eye), 0.0), 2.2);
        vec3 glowC = mix(vec3(1.0, 0.93, 0.8), vec3(1.0, 0.85, 0.6), uNightK);
        col += glowC * (0.1 + 0.32 * uNightK) * (0.35 + 0.65 * vM.x);
        col += glowC * rim * (0.35 + 0.9 * uNightK);
        // below the knee the robe goes into the mist: thinning to nothing at the ground, broken by drifting noise
        float drift = vnoise(vWorld.xz * 2.2 + vec2(uTime * 0.12, -uTime * 0.09) + vWorld.y * 1.5);
        float fade = smoothstep(0.1, 0.55, vM.x + (drift - 0.5) * 0.22);
        fade *= fade;
        a *= fade;
        // (and as it thins it pales, into the light of the mist it stands in)
        col = mix(col, glowC * mix(vec3(0.62, 0.68, 0.8), vec3(1.0), 0.4) * (0.55 + 0.35 * uNightK), (1.0 - fade) * 0.7);
        if (a < 0.01) discard;
        col = ${air.apply};
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  // their light: a halo behind each head, a long soft aura about the figure, a pale mist at the feet
  const glow = new THREE.InstancedBufferGeometry();
  glow.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  glow.setIndex([0, 1, 2, 0, 2, 3]);
  const at: number[] = [];
  const kind: number[] = [];
  list.forEach((a) => {
    const bx = -Math.sin(a.yaw) * 0.12 * a.s;
    const bz = -Math.cos(a.yaw) * 0.12 * a.s;
    at.push(a.x + bx, a.y + 1.9 * a.s, a.z + bz, 0.3 * a.s);
    kind.push(0, 1.0);
    at.push(a.x, a.y + 1.35 * a.s, a.z, 1.5 * a.s);
    kind.push(1, 1.7);
    at.push(a.x, a.y + 0.55 * a.s, a.z, 1.6 * a.s);
    kind.push(2, 2.6);
  });
  glow.setAttribute("aAt", new THREE.InstancedBufferAttribute(new Float32Array(at), 4));
  glow.setAttribute("aKind", new THREE.InstancedBufferAttribute(new Float32Array(kind), 2));
  glow.instanceCount = at.length / 4;
  glow.boundingSphere = geo.boundingSphere!.clone();
  glow.boundingSphere.radius += 4;
  const glowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...air.uniforms, uNightK: air.night ?? FOREST_K.night },
    vertexShader: /* glsl */ `
      attribute vec4 aAt; attribute vec2 aKind;
      varying vec2 vUv; varying float vKind; varying vec3 vWorld; varying float vDist; varying float vSz;
      void main(){
        vSz = aAt.w;
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec2 sz = vec2(1.0, aKind.y);
        // (the aura stands tall and narrow, the mist lies wide and low)
        if (aKind.x > 1.5) sz = vec2(aKind.y, 0.45);
        vec3 c = (modelMatrix * vec4(aAt.xyz, 1.0)).xyz;
        vWorld = c + (R * position.x * sz.x + U * position.y * sz.y) * aAt.w;
        vUv = position.xy; vKind = aKind.x; vDist = length(c - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNightK;
      varying vec2 vUv; varying float vKind; varying vec3 vWorld; varying float vDist; varying float vSz;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${air.glsl}
      void main(){
        float r = length(vUv);
        float a;
        vec3 c;
        if (vKind < 0.5) {
          // the halo: a soft ring of light with a faint fill
          a = exp(-pow((r - 0.62) * 6.0, 2.0)) * 0.55 + exp(-r * r * 3.0) * 0.18;
          a *= 1.0 - smoothstep(0.8, 1.0, r);
          c = vec3(1.0, 0.86, 0.55);
        } else if (vKind < 1.5) {
          // (round, and gone to nothing before the edge of its quad)
          float k = max(0.0, 1.0 - r * r);
          a = k * k * k * 0.16;
          c = vec3(1.0, 0.92, 0.78);
        } else {
          float n = vnoise(vWorld.xz * 0.9 / max(vSz * 0.6, 1.0) + uTime * 0.08) * 0.5 + 0.5;
          float k = max(0.0, 1.0 - r * r);
          a = k * k * 0.22 * n;
          // (thinning toward the ground it lies on, so the land never cuts it off in a line)
          a *= smoothstep(-0.9, 0.1, vUv.y);
          c = mix(vec3(0.75, 0.82, 0.92), vec3(1.0, 0.9, 0.75), 0.4);
        }
        a *= (0.35 + 0.65 * uNightK) * smoothstep(1.5, 5.0, vDist) * (1.0 - smoothstep(110.0 + vSz * 60.0, 200.0 + vSz * 90.0, vDist));
        a *= 1.0 - ${air.amount} * 0.8;
        // (light added to what is behind: nothing where there is none, and no tone curve to lift its black into a
        // pale square)
        if (a < 0.002) discard;
        gl_FragColor = vec4(c * a, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return { geo, mat, glow, glowMat, count: list.length };
}

export function ForestAngels({ amount }: { amount: number }) {
  const a = useMemo(() => makeAngels(amount), [amount]);
  const body = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.Mesh>(null);
  // (drawn only while the eye is in or near the old forest: from the desk and the town they are not there to see)
  const c = a.geo.boundingSphere!;
  useFrame(({ camera }) => {
    const near = camera.position.distanceTo(c.center) < c.radius + 160;
    if (body.current) body.current.visible = near;
    if (light.current) light.current.visible = near;
  });
  useEffect(
    () => () => {
      a.geo.dispose();
      a.mat.dispose();
      a.glow.dispose();
      a.glowMat.dispose();
    },
    [a],
  );
  return (
    <>
      {/* (their light first, the figures over it: a figure's thinning hem never punches a dark hole in the mist) */}
      <mesh ref={light} geometry={a.glow} material={a.glowMat} renderOrder={2} />
      <mesh ref={body} geometry={a.geo} material={a.mat} renderOrder={3} />
    </>
  );
}
