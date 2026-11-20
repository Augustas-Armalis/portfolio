"use client";

import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, makeTempera, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { WORLDS, groundAt, pathOf } from "./voyage";

// Funeral Symphony VI (Laidotuvių simfonija, 1903). A vast night of deep ultramarine laid in pastel. Over dark
// hills and along the edges of cliffs a road winds like a river, and along all of it, endless, a procession of
// small hooded figures, souls, walking toward a pass marked by two tall dark cypresses; where the faint light
// touches the hoods the crowd glows gold. A great dark mountain stands to the left, a cliff to the right.
//
// Here: the plane flies low along the road over thousands of hooded figures (instanced, each walking slowly in
// place, swaying, its hood rimmed with warm light), the road snaking over the hills, the two cypresses at the
// pass, and beyond them a dark gateway in the rock that the procession goes into: the world's way out, faintly
// glowing. A thin moon, mist lying in the valleys, and silence.

const def = WORLDS.funeral;
export const FUNERAL_PAL: GroundPalette = { a: [0.018, 0.035, 0.11], b: [0.026, 0.045, 0.13], c: [0.012, 0.028, 0.09], rock: [0.02, 0.03, 0.09] };
const ROAD_W = 13;

// the road: a smooth curve through the path of light, on the ground
function roadCurve() {
  const pts = pathOf("funeral").pts;
  const c = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p.x, 0, p.z)),
    false,
    "centripetal",
  );
  return c;
}

function roadGeometry(curve: THREE.CatmullRomCurve3, n: number) {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    const nx = -t.z;
    const nz = t.x;
    const l = Math.hypot(nx, nz) || 1;
    for (const s of [-1, 1]) {
      const x = p.x + (nx / l) * s * ROAD_W * 0.5;
      const z = p.z + (nz / l) * s * ROAD_W * 0.5;
      pos.push(x, groundAt(def, x, z) + 0.12, z);
      // a pale dusty way, a little paler down its middle where the most feet have gone
      col.push(0.055, 0.075, 0.16, 0);
    }
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// One soul: a long cloak falling from a rounded hood, slightly bowed. ~70 triangles.
function soulGeometry() {
  const prof: [number, number][] = [
    [0.34, 0],
    [0.33, 0.12],
    [0.27, 0.7],
    [0.23, 1.15],
    [0.21, 1.36],
    [0.23, 1.5],
    [0.21, 1.66],
    [0.14, 1.8],
    [0.04, 1.88],
  ];
  const g = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    7,
  );
  // the hood leans forward a little over the bowed head
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = Math.max(0, (y - 1.2) / 0.7);
    p.setZ(i, p.getZ(i) + k * k * 0.12);
  }
  g.computeVertexNormals();
  return g;
}

function makeSoulMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, uRim: { value: new THREE.Color(1.0, 0.82, 0.42) } },
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying float vY; varying float vSeed;
      void main(){
        vec3 p = position;
        // walking slowly in place: a rise and fall with each step, the body swaying side to side over it
        float ph = uTime * (1.1 + aSeed.y * 0.4) + aSeed.x * 40.0;
        float k = p.y / 1.88;
        p.y += abs(sin(ph)) * 0.035;
        p.x += sin(ph * 0.5) * 0.05 * k;
        p.z += 0.04 * k;
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vY = k;
        vSeed = aSeed.x;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRim;
      varying vec3 vWorld; varying vec3 vN; varying float vY; varying float vSeed;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        // deep ultramarine cloth, a touch different on each, darker toward the hem
        vec3 alb = mix(vec3(0.02, 0.035, 0.12), vec3(0.035, 0.06, 0.18), vSeed) * (0.55 + 0.45 * vY);
        float lit = clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = alb * (uSkyCol * 1.4 + uKeyCol * lit * 0.25);
        // where the faint light touches the hoods: gold along the rim and over the crown
        float fres = pow(1.0 - abs(dot(n, V)), 2.6);
        float crown = smoothstep(0.6, 0.95, vY) * smoothstep(-0.1, 0.6, n.y);
        col += uRim * (fres * 0.32 + crown * 0.42 * lit) * smoothstep(0.35, 0.9, vY) * glowK() * 1.6;
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// a thin moon: the sliver left between two circles
function crescent(R: number) {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, -Math.PI * 0.62, Math.PI * 0.62, false);
  const d = R * 0.5;
  const r2 = Math.hypot(R * Math.cos(Math.PI * 0.62) - d, R * Math.sin(Math.PI * 0.62));
  const a2 = Math.atan2(R * Math.sin(Math.PI * 0.62), R * Math.cos(Math.PI * 0.62) - d);
  s.absarc(d, 0, r2, a2, -a2, true);
  return new THREE.ShapeGeometry(s, 40);
}

export default function FuneralWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const r = rng(1903);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const curve = roadCurve();
    const k = new Kit();
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const puffs: Puff[] = [];

    // the procession
    const N = props.mobile ? 1400 : Math.round(4200 * (0.6 + 0.4 * props.effects));
    const soul = soulGeometry();
    const mat = makeSoulMaterial();
    const souls = new THREE.InstancedMesh(soul, mat, N);
    const seeds = new Float32Array(N * 2);
    const o = new THREE.Object3D();
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      // along the whole road, a little thinner at its very start, right up to the gateway
      const u = 0.02 + Math.pow(r(), 0.92) * 0.955;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, t);
      const nx = -t.z;
      const nz = t.x;
      const l = Math.hypot(nx, nz) || 1;
      const lat = (r() - 0.5) * (ROAD_W - 2.4);
      const x = p.x + (nx / l) * lat + (r() - 0.5) * 0.6;
      const z = p.z + (nz / l) * lat + (r() - 0.5) * 0.6;
      o.position.set(x, g(x, z) + 0.05, z);
      // facing the way they all go (on along the road), each a little turned
      o.rotation.set(0, Math.atan2(t.x, t.z) + (r() - 0.5) * 0.35, 0);
      const s = 0.85 + r() * 0.3;
      o.scale.set(s, s * (0.9 + r() * 0.2), s);
      o.updateMatrix();
      souls.setMatrixAt(i, o.matrix);
      seeds[i * 2] = r();
      seeds[i * 2 + 1] = r();
    }
    soul.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 2));
    souls.instanceMatrix.needsUpdate = true;
    souls.computeBoundingSphere();
    souls.frustumCulled = false;

    // the two cypresses at the pass: tall, narrow, dark, a little apart
    const cyp: V3 = [0.004, 0.008, 0.022];
    for (const [x, z, h] of [
      [-22, -440, 44],
      [22, -446, 40],
    ] as const) {
      // a slim flame of a tree: a short trunk, fullest a fifth of the way up, drawn to a point
      const prof: [number, number][] = [[0.5, 0], [0.5, 2.5]];
      for (let i = 1; i <= 16; i++) {
        const q = i / 16;
        prof.push([2.3 * Math.pow(1 - q, 0.85) * (0.75 + 0.25 * Math.min(1, q * 5)) + 0.04, 2.5 + q * (h - 2.5)]);
      }
      k.lathe(prof, [x, g(x, z) - 0.5, z], cyp, { top: [0.012, 0.02, 0.05], seg: 12 });
    }
    // the gateway the procession goes into: two great rock shoulders and a lintel of rock over a dark mouth
    const gx = 0;
    const gz = -488;
    const gy = g(gx, gz);
    const rock: V3 = [0.012, 0.02, 0.06];
    for (const s of [-1, 1]) {
      const sh = new THREE.SphereGeometry(1, 20, 14);
      k.add(sh, [gx + s * 36, gy - 2, gz - 4], rock, { top: [0.03, 0.05, 0.13], scale: [24, 62, 30] });
    }
    k.add(new THREE.TorusGeometry(24, 9, 10, 24, Math.PI), [gx, gy + 26, gz], rock, { top: [0.03, 0.05, 0.13], scale: [1, 1.3, 1.2] });
    // the hill the gateway is cut into, rising behind it and running off to either side
    k.add(new THREE.SphereGeometry(1, 28, 14), [gx, gy - 6, gz - 46], rock, { top: [0.025, 0.04, 0.11], scale: [130, 82, 48] });
    // the mouth: dark, with a faint glow far inside it
    k.add(new THREE.CircleGeometry(24, 32, 0, Math.PI), [gx, gy + 26, gz - 6], [0.004, 0.006, 0.02], { scale: [1, 1.3, 1] });
    k.box(48, 27, 0.5, [gx, gy + 12.5, gz - 6], [0.004, 0.006, 0.02]);
    glows.push({ p: [gx, gy + 14, gz - 4], size: 60, col: [0.9, 0.7, 0.38], k: 0.24 });
    glows.push({ p: [gx, gy + 12, gz + 6], size: 120, col: [0.7, 0.58, 0.4], k: 0.08 });
    halos.push({ p: [gx, gy + 10, gz - 5], size: 10, col: [1, 0.82, 0.5], k: 0.6 });

    // the thin moon, high over the cliff to the right
    k.add(crescent(70), [900, 900, -1500], [1, 0.95, 0.8], { glow: 1.6, rot: [0, -0.5, 0.6] });
    glows.push({ p: [900, 900, -1496], size: 380, col: [0.5, 0.56, 0.8], k: 0.12 });

    // mist lying in the valleys, under the road
    for (let i = 0; i < (props.mobile ? 18 : 40); i++) {
      const a = r() * Math.PI * 2;
      const d = 80 + r() * 520;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      puffs.push({ p: [x, g(x, z) + 4 + r() * 6, z], size: 60 + r() * 90, a: 0.45 });
    }

    return {
      road: roadGeometry(curve, props.mobile ? 260 : 600),
      souls,
      set: k.build(),
      tempera: makeTempera({ amb: 0.7, key: 0.18, rim: [0.07, 0.09, 0.2], rimPow: 4, grain: 1.2, ao: 0.4, aoH: 40 }),
      roadMat: makeTempera({ amb: 1.0, key: 0.35, grain: 1.4, dab: 1.6 }),
      halos,
      glows,
      puffs,
    };
  }, [props.mobile, props.effects > 0.5]);
  return (
    <>
      <WorldBase id="funeral" def={def} pal={FUNERAL_PAL} props={props} grass={false} pathTint={[1, 0.86, 0.56]} pathGain={0.55} angels={false} marks={false} />
      <mesh geometry={b.road} material={b.roadMat} renderOrder={-4} />
      <primitive object={b.souls} />
      <mesh geometry={b.set} material={b.tempera} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}

