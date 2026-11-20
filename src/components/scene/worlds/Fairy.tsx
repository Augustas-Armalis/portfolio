"use client";

import * as THREE from "three";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { buildCastle } from "./fairy/castle";
import { MT, PEAKS, WARDS, buildMountain, buildPeaks, buildRamp, mountainCrowns, peakRadius, rampLine, roadLine, surfaceY } from "./fairy/mountain";
import { GLSL_GROUND_LIFE, Kindling, archGeometry, Procession, RayedSun, RisingFlock, Walkers, crownMesh, cypressMesh, heapBlobs, heapMesh, makeCrownMaterial, makeHeapMaterial, makeMasonry, useDeepLens, type Crown, type Heap, type Lamp } from "./fairy/shared";
import { WORLDS, gateOf, groundAt, pathOf } from "./voyage";

// Fairy Tale (Castle Fairy Tale, 1909), after the painting and after the way the film "Angelų takais" built it
// in the round. A wide plain of woods and small fields under a whole sky of gilded cloud; out of it one great
// mountain, wound round by a wall that climbs it in a spiral, its slopes thick with small round trees, a pale
// road going up behind the wall; and on its peaks a castle of many towers, every window lit, with the sun
// standing in a fan of rays just behind its highest spire.
//
// The plane comes in over a rise and low across the fields, then climbs straight at the castle while the
// mountain grows to fill the sky, passes close under its towers by the right flank, and goes away toward the
// sun. (It does not circle: the eye looks where the plane flies, and a plane that circles a mountain looks
// away from it.)

const def = WORLDS.fairy;
const f4 = (n: number) => n.toFixed(4);

// ---------- the plain: where the woods stand, and where the fields are ----------
// One function, the same in JS (where trees are planted) and in GLSL (where the ground is painted):
// above zero is wood, well below it are fields, between them meadow.
const HAMLETS: [x: number, z: number, r: number][] = [
  [150, 640, 200],
  [-430, 380, 210],
  [640, 80, 190],
  [-690, -200, 220],
  [520, -760, 200],
  [-330, -880, 210],
  [900, -420, 200],
  [-980, 240, 220],
  [-360, 1120, 180],
  [1100, 760, 220],
  [-1250, -650, 240],
  [120, -1250, 220],
  [1350, -900, 240],
  [-1300, 900, 240],
];
const woodF = (x: number, z: number) => {
  let F = Math.sin(x * 0.0041 + 1.3) * Math.sin(z * 0.0052 + 0.4) + 0.55 * Math.sin((x + z) * 0.0093 + 2.0) + 0.3 * Math.sin(x * 0.019 - z * 0.015 + 0.7) + 0.12;
  const dm = Math.hypot(x - MT.x, z - MT.z);
  F += 1.5 * Math.exp(-Math.pow((dm - 450) / 190, 2));
  for (const [hx, hz, hr] of HAMLETS) F -= 1.7 * Math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (hr * hr));
  return F;
};
const GLSL_WOOD = /* glsl */ `
float fairyF(vec2 p){
  float F = sin(p.x * 0.0041 + 1.3) * sin(p.y * 0.0052 + 0.4) + 0.55 * sin((p.x + p.y) * 0.0093 + 2.0) + 0.3 * sin(p.x * 0.019 - p.y * 0.015 + 0.7) + 0.12;
  float dm = length(p - vec2(${f4(MT.x)}, ${f4(MT.z)}));
  F += 1.5 * exp(-(dm - 450.0) * (dm - 450.0) / 36100.0);
  ${HAMLETS.map(([x, z, r]) => `{ vec2 d = p - vec2(${f4(x)}, ${f4(z)}); F -= 1.7 * exp(-dot(d, d) / ${f4(r * r)}); }`).join("\n  ")}
  return F;
}`;
// the road over the plain: from the rise, by the first hamlet, to where the mountain's own road begins
const FOOT = rampLine(2)[0];
const WAY0 = { z0: MT.z + FOOT.z, z1: 1440, x0: MT.x + FOOT.x, k: (4 - (MT.x + FOOT.x)) / (1440 - (MT.z + FOOT.z)) };
const wayX = (z: number) => WAY0.x0 + (z - WAY0.z0) * WAY0.k + 46 * Math.sin(z * 0.011 + 0.4) * Math.sin(((z - WAY0.z0) / (WAY0.z1 - WAY0.z0)) * Math.PI);

export const FAIRY_PAL: GroundPalette = {
  a: [0.075, 0.15, 0.045],
  b: [0.13, 0.18, 0.05],
  c: [0.05, 0.115, 0.05],
  hook: {
    decl: /* glsl */ `
      ${GLSL_WOOD}
      ${GLSL_GROUND_LIFE}
      float fairyWay(float z){ return ${f4(WAY0.x0)} + (z - ${f4(WAY0.z0)}) * ${f4(WAY0.k)} + 46.0 * sin(z * 0.011 + 0.4) * sin((z - ${f4(WAY0.z0)}) / ${f4(WAY0.z1 - WAY0.z0)} * 3.14159265); }
    `,
    lit: /* glsl */ `
      {
        float F = fairyF(p);
        vec3 light = uSkyCol * 0.7 + uKeyCol * (0.22 + 0.5 * max(uKeyDir.y, 0.0)) * sunUp;
        float fpx = length(fwidth(p));
        // the fields: a patchwork laid a little askew, each its own crop, a dark hedge between
        vec2 q = mat2(0.92, 0.39, -0.39, 0.92) * p + vec2(vnoise(p * 0.004) - 0.5, vnoise(p * 0.004 + 7.0) - 0.5) * 90.0;
        vec2 c = q / vec2(118.0, 74.0);
        float rowH = hash12(vec2(floor(c.y), 3.7));
        c.x = c.x * (0.62 + 0.9 * rowH) + rowH * 7.0;
        vec2 id = floor(c); vec2 ff = fract(c);
        float fh = hash12(id);
        vec3 crop = fh < 0.3 ? vec3(0.44, 0.37, 0.11) : fh < 0.55 ? vec3(0.15, 0.27, 0.07) : fh < 0.8 ? vec3(0.27, 0.31, 0.09) : vec3(0.21, 0.14, 0.12);
        // furrows, each field its own way, gone before they could shimmer
        float fa = fh * 6.2832;
        float furrow = sin(dot(q, vec2(cos(fa), sin(fa))) * 0.9);
        crop *= 1.0 + furrow * 0.12 * (1.0 - smoothstep(0.4, 1.6, fpx));
        crop *= 0.9 + 0.2 * vnoise(p * 0.05 + fh * 9.0);
        float hedge = 1.0 - smoothstep(0.02, 0.05, min(min(ff.x, 1.0 - ff.x) * 1.6, min(ff.y, 1.0 - ff.y)));
        crop = mix(crop, vec3(0.03, 0.07, 0.04), hedge * 0.9);
        float fld = 1.0 - smoothstep(-0.75, -0.45, F);
        col = mix(col, crop * light, fld);
        // under the wood it is dark; far off the wood itself is painted here, crown by crown
        float wood = smoothstep(-0.06, 0.1, F);
        float can = vnoise(p * 0.07) * 0.5 + vnoise(p * 0.19 + 3.0) * 0.5;
        vec3 floorC = mix(vec3(0.028, 0.065, 0.04), vec3(0.1, 0.16, 0.045), smoothstep(0.42, 0.7, can) * (1.0 - smoothstep(0.6, 3.5, fpx)) * 0.8);
        col = mix(col, floorC * light, wood);
        // the pale road
        float wd = abs(p.x - fairyWay(p.y));
        float way = (1.0 - smoothstep(3.2, 5.0, wd)) * step(${f4(WAY0.z0)}, p.y) * step(p.y, ${f4(WAY0.z1)});
        col = mix(col, vec3(0.74, 0.66, 0.5) * light, way * 0.9);
        // the meadows between: flowers in drifts and one by one, stones, strokes of turf
        col = groundLife(col, p, gd, px, light, (1.0 - wood) * (1.0 - fld) * (1.0 - way), vec3(1.0, 0.84, 0.25), vec3(0.86, 0.3, 0.42));
      }
    `,
  },
};
// (grass grows in the meadows only: not under the trees, and not in the crops)
const GRASS_MASK = /* glsl */ `
  float F = sin(p.x * 0.0041 + 1.3) * sin(p.y * 0.0052 + 0.4) + 0.55 * sin((p.x + p.y) * 0.0093 + 2.0) + 0.3 * sin(p.x * 0.019 - p.y * 0.015 + 0.7) + 0.12;
  float dm = length(p - vec2(${f4(MT.x)}, ${f4(MT.z)}));
  F += 1.5 * exp(-(dm - 450.0) * (dm - 450.0) / 36100.0);
  ${HAMLETS.map(([x, z, r]) => `{ vec2 d = p - vec2(${f4(x)}, ${f4(z)}); F -= 1.7 * exp(-dot(d, d) / ${f4(r * r)}); }`).join("\n  ")}
  return smoothstep(-0.75, -0.5, F) * (1.0 - smoothstep(-0.12, 0.02, F)) * (1.0 - smoothstep(330.0, 400.0, dm));`;

// ---------- pennants on the highest spires ----------
function Pennants({ tips }: { tips: V3[] }) {
  const b = useDisposable(() => {
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1, 10, 1);
    base.translate(0.5, 0, 0);
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("uv", base.attributes.uv);
    g.setIndex(base.index);
    const at = new Float32Array(tips.length * 4);
    tips.forEach((p, i) => at.set([p[0], p[1], p[2], 5 + (i % 5) * 1.6], i * 4));
    g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
    g.instanceCount = tips.length;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 560, 30), 420);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U },
      vertexShader: /* glsl */ `
        attribute vec4 aAt;
        uniform float uTime;
        varying vec2 vUv; varying float vSeed;
        void main(){
          vSeed = fract(aAt.x * 0.37 + aAt.z * 0.61);
          float L = aAt.w;
          // a long swallow-tailed pennant streaming on the wind, the wave running down it
          float s = uv.x;
          float w = sin(s * 7.0 - uTime * (3.0 + vSeed) + vSeed * 20.0) * 0.22 * s + sin(s * 3.0 - uTime * 1.7 + vSeed * 9.0) * 0.3 * s;
          vec3 p = aAt.xyz + vec3(s * L * 0.92, position.y * L * 0.2 * (1.0 - 0.45 * s) - s * s * L * 0.12, w * L * 0.5 + s * L * 0.3);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vSeed;
        ${GLSL_SKY}
        void main(){
          // the swallow tail
          if (vUv.x > 0.72 && abs(vUv.y - 0.5) < (vUv.x - 0.72) * 1.3) discard;
          vec3 c = vSeed < 0.4 ? vec3(0.9, 0.2, 0.12) : vSeed < 0.7 ? vec3(1.0, 0.72, 0.2) : vec3(0.36, 0.3, 0.75);
          gl_FragColor = vec4(c * (uSkyCol * 0.9 + uKeyCol * 0.35) * (0.8 + 0.3 * vUv.y), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { g, mat };
  }, [tips]);
  return <mesh geometry={b.g} material={b.mat} />;
}

export default function FairyWorld({ props }: { props: WorldProps }) {
  useDeepLens("fairy");
  const b = useDisposable(() => {
    const r = rng(303);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const y0 = g(MT.x, MT.z);
    const rel = (x: number, z: number) => g(MT.x + x, MT.z + z) - y0;
    const few = props.mobile ? 0.34 : 0.55 + 0.45 * props.trees;

    // ---- the mountain, its rock and its castle
    const mount = buildMountain(props.mobile, rel);
    const peaks = buildPeaks(props.mobile);
    const castle = buildCastle(props.mobile, r);
    const rampPts = rampLine(40);
    const skip = (p: THREE.Vector3) => {
      for (const q of rampPts) if (Math.abs(p.x - q.x) < 11 && Math.abs(p.z - q.z) < 11 && Math.abs(p.y - q.y) < 12) return true;
      for (const w of WARDS) if (Math.hypot(p.x - w.x, p.z - w.z) < w.R + 13 && p.y < w.y + 6) return true;
      for (const pk of PEAKS) if (Math.hypot(p.x - pk.x, p.z - pk.z) < peakRadius(pk, p.y) + 4) return true;
      return false;
    };
    const wood = makeCrownMaterial({ a: [0.055, 0.125, 0.035], b: [0.13, 0.18, 0.04], shade: [0.012, 0.04, 0.046] });
    const onMount = mountainCrowns(Math.round(7000 * few), r, rel, skip);
    // planting where the castle's stone meets the hill: trees close under the drums and bastions, so no wall rises out of bare ground
    for (const [wi, n] of [
      [0, 70],
      [1, 26],
    ] as const) {
      const w = WARDS[wi];
      for (let i = 0; i < n; i++) {
        const a = -2.4 + (i / (n - 1)) * 4.8 + (r() - 0.5) * 0.05;
        const d = w.R + 11 + r() * 13;
        const x = w.x + Math.sin(a) * d;
        const z = w.z + Math.cos(a) * d;
        const y = surfaceY(x, z);
        if (y > w.y - 14 || PEAKS.some((pk) => Math.hypot(x - pk.x, z - pk.z) < peakRadius(pk, y) + 4)) continue;
        const sz = 5 + r() * 4.5;
        onMount.push({ p: [x, y - sz * 0.15, z], r: sz, h: 1.1 + r() * 0.6, seed: r() });
      }
    }
    const slopes = crownMesh(onMount, wood, true);

    // ---- the woods of the plain: thick near the way and round the mountain's foot, bigger and fewer far off
    const plain: Crown[] = [];
    const close: Crown[] = [];
    const track = pathOf("fairy").pts.filter((_, i) => i % 6 === 0);
    const nearTrack = (x: number, z: number) => track.some((q) => q.y < 300 && Math.abs(q.x - x) < 170 && Math.abs(q.z - z) < 170);
    const nearN = Math.round(7000 * few);
    for (let i = 0, guard = 0; i < nearN && guard < nearN * 8; guard++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 1180;
      const x = 60 + Math.cos(a) * d;
      const z = 120 + Math.sin(a) * d;
      const F = woodF(x, z);
      if (F < 0.04 + r() * 0.1) continue;
      if (Math.hypot(x - MT.x, z - MT.z) < 372) continue;
      if (z > WAY0.z0 && z < WAY0.z1 && Math.abs(x - wayX(z)) < 9) continue;
      if (def.canvases.some((c) => Math.hypot(x - c.x, z - c.z) < 30)) continue;
      const s = 6 + r() * 4.5;
      (nearTrack(x, z) ? close : plain).push({ p: [x, g(x, z) - s * 0.1, z], r: s, h: 0.95 + r() * 0.55, seed: r() });
      i++;
    }
    const farN = Math.round(5200 * few * Math.min(1, props.far + 0.2));
    for (let i = 0, guard = 0; i < farN && guard < farN * 8; guard++) {
      const a = r() * Math.PI * 2;
      const d = 1100 + Math.pow(r(), 0.8) * 1500;
      const x = 60 + Math.cos(a) * d;
      const z = 120 + Math.sin(a) * d;
      if (woodF(x, z) < 0.05 + r() * 0.15) continue;
      const s = 9 + (d - 1100) * 0.008 + r() * 6;
      (nearTrack(x, z) ? close : plain).push({ p: [x, g(x, z) - s * 0.1, z], r: s, h: 1.1 + r() * 0.55, seed: r() });
      i++;
    }
    // a few stand alone in the meadows and along the hedges
    for (let i = 0; i < Math.round(700 * few); i++) {
      const a = r() * Math.PI * 2;
      const d = 380 + Math.sqrt(r()) * 1300;
      const x = Math.cos(a) * d;
      const z = -100 + Math.sin(a) * d;
      const F = woodF(x, z);
      if (F > -0.05 || F < -0.9) continue;
      if (z > WAY0.z0 && z < WAY0.z1 && Math.abs(x - wayX(z)) < 10) continue;
      const s = 4.5 + r() * 5;
      plain.push({ p: [x, g(x, z) - s * 0.1, z], r: s, h: 1 + r() * 0.5, seed: r() });
    }

    // the trees the plane passes low over as the world opens: these are looked at, so each is a round crown with
    // two or three lesser ones clustered against it
    const nearest: Crown[] = [];
    const low = pathOf("fairy").pts.filter((q, i) => i % 5 === 0 && q.y < 140);
    for (let i = close.length - 1; i >= 0; i--) {
      const c = close[i];
      if (!low.some((q) => Math.abs(q.x - c.p[0]) < 95 && Math.abs(q.z - c.p[2]) < 95)) continue;
      close.splice(i, 1);
      nearest.push(c);
      const m = props.mobile ? 1 : 2;
      for (let j = 0; j < m; j++) {
        const a = r() * Math.PI * 2;
        const s2 = c.r * (0.5 + r() * 0.22);
        nearest.push({ p: [c.p[0] + Math.cos(a) * c.r * 0.72, c.p[1] + c.r * (0.05 + r() * 0.35), c.p[2] + Math.sin(a) * c.r * 0.72], r: s2, h: 0.95 + r() * 0.3, seed: r() });
      }
    }
    // low bushes scattered through the meadows, so no stretch of ground is bare
    for (let i = 0; i < Math.round(1500 * few); i++) {
      const a = r() * Math.PI * 2;
      const d = 380 + Math.sqrt(r()) * 1250;
      const x = Math.cos(a) * d;
      const z = 100 + Math.sin(a) * d;
      const F = woodF(x, z);
      if (F > -0.04 || F < -0.6) continue;
      if (z > WAY0.z0 && z < WAY0.z1 && Math.abs(x - wayX(z)) < 8) continue;
      const s = 1.5 + r() * 2.2;
      plain.push({ p: [x, g(x, z) - s * 0.2, z], r: s, h: 0.8 + r() * 0.4, seed: r() });
    }
    // (none stands in the way on)
    const gate = def.gate!;
    for (const list of [plain, close]) for (let i = list.length - 1; i >= 0; i--) if (Math.hypot(list[i].p[0] - gate.x, list[i].p[2] - gate.z) < 95) list.splice(i, 1);

    // ---- hamlets in their fields: a tower, a huddle of roofs, lit windows, cypresses standing by
    const k = new Kit();
    const lamps: Halo[] = [];
    const cyp: Crown[] = [];
    const stone: V3 = [0.5, 0.4, 0.42];
    const stoneLit: V3 = [0.92, 0.72, 0.56];
    const roofs: [V3, V3][] = [
      [
        [0.5, 0.18, 0.12],
        [0.95, 0.52, 0.24],
      ],
      [
        [0.22, 0.18, 0.4],
        [0.56, 0.46, 0.72],
      ],
    ];
    HAMLETS.forEach(([hx, hz], hi) => {
      const gy = g(hx, hz);
      const R = 3.2 + r() * 1.6;
      const H = 26 + r() * 20;
      const [lo, hi2] = roofs[hi % 2];
      k.lathe(
        [
          [R * 1.15, 0],
          [R, H * 0.06],
          [R * 0.88, H * 0.88],
          [R * 1.1, H * 0.93],
          [R * 1.1, H],
          [R * 0.5, H + 0.01],
        ],
        [hx, gy - 1, hz],
        stone,
        { top: stoneLit, seg: 10, glow: 0.05 },
      );
      k.add(new THREE.ConeGeometry(R * 1.3, R * 5, 10), [hx, gy - 1 + H + R * 2.5, hz], lo, { top: hi2, glow: 0.12 });
      for (let q = 0; q < 3; q++) k.box(0.7, 1.9, 1, [hx + Math.sin(q * 2.1) * (R * 0.9 - 0.2), gy + H * (0.3 + q * 0.22), hz + Math.cos(q * 2.1) * (R * 0.9 - 0.2)], [1, 0.76, 0.38], { glow: 2.2, rot: [0, q * 2.1, 0] });
      lamps.push({ p: [hx, gy + H * 0.6, hz], size: 5, col: [1, 0.72, 0.36], k: 0.5 });
      const nH = 5 + Math.floor(r() * 6);
      for (let i = 0; i < nH; i++) {
        const a = r() * Math.PI * 2;
        const d = 12 + r() * 46;
        const x = hx + Math.cos(a) * d;
        const z = hz + Math.sin(a) * d;
        const y = g(x, z);
        const w = 7 + r() * 5;
        const dp = 5.5 + r() * 3;
        const h = 4 + r() * 3.5;
        const yaw = r() * Math.PI;
        k.box(w, h + 1, dp, [x, y + h / 2 - 0.5, z], [0.6, 0.5, 0.42], { top: [0.9, 0.78, 0.6], rot: [0, yaw, 0], glow: 0.04 });
        k.add(new THREE.CylinderGeometry(0.001, 1, 1, 4, 1), [x, y + h + h * 0.45, z], roofs[i % 2][0], { top: roofs[i % 2][1], scale: [w * 0.78, h * 0.9, dp * 0.78], rot: [0, yaw + Math.PI / 4, 0], glow: 0.1 });
        k.box(0.9, 1.1, dp + 0.5, [x + Math.cos(yaw) * w * 0.22, y + h * 0.5, z - Math.sin(yaw) * w * 0.22], [1, 0.76, 0.38], { glow: 2.0, rot: [0, yaw, 0] });
        if (i % 2 === 0) lamps.push({ p: [x, y + h * 0.6, z], size: 4.2, col: [1, 0.72, 0.36], k: 0.4 });
      }
      for (let i = 0; i < 9 + Math.floor(r() * 8); i++) {
        const a = r() * Math.PI * 2;
        const d = 20 + r() * 110;
        const x = hx + Math.cos(a) * d;
        const z = hz + Math.sin(a) * d;
        cyp.push({ p: [x, g(x, z) - 0.5, z], r: 2.2 + r() * 1.6, h: 6.5 + r() * 3.5, seed: r() });
      }
    });
    // lone cypresses and little rows of them in the fields
    for (let i = 0; i < (props.mobile ? 120 : 420); i++) {
      const a = r() * Math.PI * 2;
      const d = 400 + Math.sqrt(r()) * 1700;
      const x = Math.cos(a) * d;
      const z = -100 + Math.sin(a) * d;
      if (woodF(x, z) > -0.35) continue;
      const row = r() < 0.3 ? 2 + Math.floor(r() * 4) : 1;
      const dir = r() * Math.PI;
      for (let j = 0; j < row; j++) {
        const px = x + Math.cos(dir) * j * 9;
        const pz = z + Math.sin(dir) * j * 9;
        if (pz > WAY0.z0 && pz < WAY0.z1 && Math.abs(px - wayX(pz)) < 7) continue;
        cyp.push({ p: [px, g(px, pz) - 0.5, pz], r: 2 + r() * 1.5, h: 6.5 + r() * 3.5, seed: r() });
      }
    }
    // the gatehouse where the plain's road meets the mountain: two small towers and a lamp between them
    {
      const gx = MT.x + FOOT.x * 1.04;
      const gz = MT.z + FOOT.z * 1.04;
      const gy = g(gx, gz);
      const ax = -FOOT.z / Math.hypot(FOOT.x, FOOT.z);
      const az = FOOT.x / Math.hypot(FOOT.x, FOOT.z);
      for (const sd of [-1, 1]) {
        const tx = gx + ax * sd * 10;
        const tz = gz + az * sd * 10;
        k.lathe(
          [
            [4.6, 0],
            [4, 3],
            [3.5, 30],
            [4.4, 32],
            [4.4, 36],
            [2, 36.01],
          ],
          [tx, gy - 3, tz],
          stone,
          { top: stoneLit, seg: 10, glow: 0.05 },
        );
        k.add(new THREE.ConeGeometry(5.2, 20, 10), [tx, gy + 43, tz], roofs[0][0], { top: roofs[0][1], glow: 0.12 });
      }
      lamps.push({ p: [gx, gy + 7, gz], size: 16, col: [1, 0.76, 0.4], k: 0.7 });
    }

    // ---- the way on: an outer gate of the castle standing alone on its hill, the light hanging in its arch
    {
      const gt = gateOf("fairy")!;
      const gy = g(gt.pos.x, gt.pos.z) - 2;
      const mid = gt.pos.y - gy;
      const c = Math.cos(gt.yaw);
      const sn = Math.sin(gt.yaw);
      k.add(archGeometry(36, mid + 27, 10, 13), [gt.pos.x, gy, gt.pos.z], [0.25, 0.13, 0.25], { top: [0.9, 0.5, 0.22], rot: [0, gt.yaw, 0], glow: 0.1 });
      // a second order within it, and a crest of small battlements over it
      k.add(archGeometry(33, mid + 25.5, 1.5, 15), [gt.pos.x, gy, gt.pos.z], [0.16, 0.1, 0.22], { top: [0.6, 0.36, 0.3], rot: [0, gt.yaw, 0], glow: 0.05 });
      for (const sd of [-1, 1]) {
        const tx = gt.pos.x + c * sd * 34;
        const tz = gt.pos.z - sn * sd * 34;
        const H = mid + 44;
        k.lathe(
          [
            [9.4, 0],
            [8, H * 0.05],
            [7.2, H * 0.86],
            [9, H * 0.93],
            [9, H],
            [4, H + 0.01],
          ],
          [tx, g(tx, tz) - 4, tz],
          [0.25, 0.13, 0.25],
          { top: [0.9, 0.5, 0.22], seg: 14, glow: 0.1 },
        );
        k.lathe(
          [
            [10.2, 0],
            [6, 7],
            [3.2, 17],
            [1.2, 27],
            [0.05, 34],
          ],
          [tx, g(tx, tz) - 4 + H, tz],
          roofs[sd > 0 ? 0 : 1][0],
          { top: roofs[sd > 0 ? 0 : 1][1], seg: 14, glow: 0.14 },
        );
        lamps.push({ p: [gt.pos.x + c * sd * 19, gt.pos.y - 4, gt.pos.z - sn * sd * 19], size: 7, col: [1, 0.74, 0.38], k: 0.6 });
      }
    }

    // ---- the sky: heaps of cloud in ranks, near ones overhead and row behind row to the horizon
    const heaps: Heap[] = [];
    const far: Heap[] = [];
    const reach = 2500 * Math.min(1.1, Math.max(0.7, props.far + 0.2));
    for (let z = 1700; z > -reach; z -= 215) {
      const row = Math.round((1700 - z) / 215);
      for (let x = -reach + (row % 2) * 140; x < reach; x += 280) {
        const cx = x + (r() - 0.5) * 190;
        const cz = z + (r() - 0.5) * 150;
        const dm = Math.hypot(cx - MT.x, cz - MT.z);
        // the peaks stand clear, and so does the sun's own road down to them
        if (dm < 520) continue;
        if (Math.hypot(cx, cz + 100) > reach) continue;
        if (r() < 0.14) continue;
        const w = 110 + r() * 130;
        const h: Heap = { p: [cx, 800 + (r() - 0.5) * 150 + dm * 0.03, cz], w, seed: r(), tall: 0.9 + r() * 0.5 };
        (Math.hypot(cx, cz - 200) < 1250 ? heaps : far).push(h);
        // a second, lower rank between them here and there, as he set them scale on scale
        if (r() < 0.3 && dm > 760) far.push({ p: [cx + 150, 640 + (r() - 0.5) * 80, cz + 120], w: w * 0.55, seed: r() });
      }
    }
    const heapMat = makeHeapMaterial({});
    // a wreath of low cloud about the mountain's waist, which the plane climbs through
    const belt: Heap[] = [];
    for (let i = 0; i < (props.mobile ? 9 : 16); i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.3;
      const d = 430 + r() * 190;
      // (none in the way of the first sight of it from the rise)
      if (Math.sin(a) > 0.45 && Math.abs(Math.cos(a)) < 0.6) continue;
      belt.push({ p: [MT.x + Math.cos(a) * d, y0 + 205 + r() * 90, MT.z + Math.sin(a) * d], w: 70 + r() * 70, seed: r(), tall: 0.7 });
    }
    const puffs: Puff[] = [];
    // mist lying in the hollows of the plain, far out
    for (let i = 0; i < (props.mobile ? 14 : 34); i++) {
      const a = r() * Math.PI * 2;
      const d = 620 + r() * 1300;
      const x = Math.cos(a) * d;
      const z = -100 + Math.sin(a) * d;
      puffs.push({ p: [x, g(x, z) + 16 + r() * 22, z], size: 150 + r() * 160, a: 0.5 });
    }

    // ---- life: birds about the spires and over the woods, lanterns climbing the road, motes of gold in the air
    const flocks: Flock[] = [
      { c: [MT.x, y0 + 640, MT.z], r: 150, n: props.mobile ? 8 : 18, size: 2.4, speed: 13 },
      { c: [MT.x + 30, y0 + 560, MT.z + 30], r: 210, n: props.mobile ? 6 : 14, size: 2.0, speed: 11 },
      { c: [MT.x - 20, y0 + 730, MT.z - 10], r: 90, n: props.mobile ? 5 : 9, size: 2.6, speed: 9 },
      { c: [120, 120, 520], r: 150, n: props.mobile ? 6 : 12, size: 1.5, speed: 10 },
      { c: [-420, 150, 200], r: 190, n: props.mobile ? 5 : 11, size: 1.5, speed: 11 },
      { c: [520, 200, -700], r: 160, n: props.mobile ? 5 : 10, size: 1.7, speed: 10 },
    ];
    const road = roadLine(7);
    const way: THREE.Vector3[] = [];
    for (let z = WAY0.z1 - 20; z > WAY0.z0 + 10; z -= 7) way.push(new THREE.Vector3(wayX(z), g(wayX(z), z), z));
    const nM = props.mobile ? 260 : Math.round(1300 * props.effects);
    // the castle's lamps: dark from far off, they kindle ward by ward as the plane comes on, the summit last
    const lamps2: Lamp[] = castle.windows.map((w) => ({ p: w.p, size: w.size * 1.25, col: w.col, k: (w.k ?? 0.5) * 1.5, at: 1560 - ((w.p[1] - 400) / 380) * 1050 + (r() - 0.5) * 150 }));
    return {
      y0,
      flockY: g(36, 1040) + 6,
      // (the plane is high over woods for most of this world: the meadows' grass can be thinner)
      base: { ...props, grass: props.grass * 0.5 },
      soil: mount.soil,
      ramp: buildRamp(),
      rampMat: Object.assign(makeTempera({ amb: 0.78, key: 0.6, dab: 1.0, grain: 1.0 }), { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
      wall: mount.wall,
      peaks,
      castle: castle.geo,
      windows: lamps2,
      castleHalos: castle.halos,
      castleGlows: castle.glows,
      tips: castle.tips.filter((_, i) => i % (props.mobile ? 5 : 2) === 0),
      slopes,
      wood,
      plain: crownMesh(plain, wood, false),
      close: crownMesh(close, wood, true),
      near: crownMesh(nearest, wood, "near"),
      cypress: cypressMesh(cyp, makeCrownMaterial({ a: [0.045, 0.12, 0.06], b: [0.07, 0.15, 0.06], shade: [0.02, 0.05, 0.055], wind: 0.5, gold: 0 })),
      set: k.build(),
      lamps,
      heaps: heapMesh(heapBlobs(heaps, 5), heapMat, props.mobile ? 1 : 2),
      far: heapMesh(heapBlobs(far, 9), heapMat, 1),
      belt: heapMesh(heapBlobs(belt, 13), heapMat, props.mobile ? 1 : 2),
      heapMat,
      puffs,
      flocks,
      road,
      way,
      masonry: makeMasonry({ bay: 27, amb: 0.6, key: 0.5, niche: [0.03, 0.03, 0.11], foot: [0.05, 0.17, 0.24] }),
      tempera: makeTempera({ amb: 0.78, key: 0.6, dab: 1.3, grain: 1.1, ao: 0.4, aoH: 30, wrap: 0.8, rim: [0.95, 0.5, 0.22], rimPow: 3 }),
      rock: makeTempera({ amb: 0.8, key: 0.62, dab: 1.4, strata: 0.9, grain: 1.2, wrap: 0.9, rim: [1.0, 0.56, 0.3], rimPow: 3.2 }),
      stone: makeTempera({ amb: 0.7, key: 0.6, dab: 1.2, strata: 0.75, grain: 1.2, wrap: 0.9, gold: 0.5, rim: [1.0, 0.56, 0.26], rimPow: 2.6 }),
      motes: pointsGeometry(nM, (_, q) => [MT.x + (q() - 0.5) * 1500, 30 + q() * 700, MT.z + 200 + (q() - 0.5) * 1700, 0.5 + q() * 1.3], 9),
      moteMat: makePoints({ a: [1, 0.84, 0.5], b: [1, 0.95, 0.8], scale: 320, drift: 3.2, gain: 0.7, max: 14 }),
    };
  }, [props.mobile, props.trees, props.far, props.effects > 0.5, props.grass, props.reduced]);
  return (
    <>
      <WorldBase id="fairy" def={def} pal={FAIRY_PAL} props={b.base} tip={[0.44, 0.5, 0.16]} pathTint={[1, 0.92, 0.7]} mask={GRASS_MASK} groundSize={14000} angels={false} gate="veil" gateSize={[16, 24]} />
      <RayedSun />
      {/* the mountain, measured from its own foot */}
      <group position={[MT.x, b.y0, MT.z]}>
        <mesh geometry={b.soil} material={b.tempera} />
        <mesh geometry={b.ramp} material={b.rampMat} />
        <mesh geometry={b.wall} material={b.masonry} />
        <mesh geometry={b.peaks} material={b.rock} />
        <mesh geometry={b.castle} material={b.stone} />
        <primitive object={b.slopes} />
        <Pennants tips={b.tips} />
        <Kindling list={b.windows} centre={[0, 520, 60]} />
        <Procession road={b.road} n={props.mobile ? 30 : 90} speed={1.3} scale={2.6} robe={[0.5, 0.36, 0.3]} wing={[0.36, 0.26, 0.3]} glow={0.04} seed={5} />
        <Halos list={b.castleGlows} kind={2} />
        <Halos list={b.castleHalos} />
        <Walkers road={b.road} n={props.mobile ? 60 : 150} speed={1.5} size={1.1} />
      </group>
      <primitive object={b.plain} />
      <primitive object={b.close} />
      <primitive object={b.near} />
      <primitive object={b.cypress} />
      <mesh geometry={b.set} material={b.stone} />
      <Halos list={b.lamps} />
      <Walkers road={b.way} n={props.mobile ? 20 : 46} speed={1.4} size={0.9} seed={8} />
      <Procession road={b.way} n={props.mobile ? 20 : 46} speed={1.4} scale={2.6} robe={[0.5, 0.36, 0.3]} wing={[0.36, 0.26, 0.3]} glow={0.04} seed={8} />
      <RisingFlock origin={[36, b.flockY, 1040]} n={props.mobile ? 24 : 60} reach={210} size={1.5} tint={[0.14, 0.09, 0.1]} away={[0.5, -0.86]} />
      <primitive object={b.heaps} />
      <primitive object={b.far} />
      <primitive object={b.belt} />
      <Birds flocks={b.flocks} tint={[0.14, 0.09, 0.1]} />
      <points geometry={b.motes} material={b.moteMat} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
    </>
  );
}
