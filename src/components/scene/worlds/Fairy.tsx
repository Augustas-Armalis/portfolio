"use client";

import * as THREE from "three";
import { GLSL_SKY, SKY_U } from "../sky";
import { buildTree, makeLeafTexture } from "../home/trees";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { buildCastle } from "./fairy/castle";
import { buildAngels, type AngelSpot } from "../home/Angels";
import { MT, PEAKS, WARDS, buildMountain, buildPeaks, buildRamp, mountainCrowns, peakRadius, rampLine, roadLine, surfaceY } from "./fairy/mountain";
import { GLSL_GROUND_LIFE, Kindling, SunShafts, type Beam, archGeometry, leafyMesh, makeLeafyMaterial, Procession, RayedSun, RisingFlock, Walkers, crownMesh, cypressMesh, heapBlobs, heapMesh, makeCrownMaterial, makeHeapMaterial, makeMasonry, useDeepLens, type Crown, type Heap, type Lamp, type Wood } from "./fairy/shared";
import { WORLDS, gateOf, groundAt, pathOf } from "./voyage";
import { GATE, GLSL_ROAD_AX, GLSL_WAYS, RAMP_FOOT, ROAD_AX, clearOfWays, makeWayField, roadAxAt, wayA, wayB, wayDist } from "./fairy/track";

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
// the green of every tree here, near or far (makeCrownMaterial, and makeLeafyMaterial's `wood`)
const WOOD: Wood = { a: [0.055, 0.125, 0.035], b: [0.13, 0.18, 0.04], shade: [0.012, 0.04, 0.046] };
const f4 = (n: number) => n.toFixed(4);

// ---------- the plain: where the woods stand, and where the fields are ----------
// One function, the same in JS (where trees are planted) and in GLSL (where the ground is painted):
// above zero is wood, well below it are fields, between them meadow.
const HAMLETS: [x: number, z: number, r: number][] = [
  [150, 640, 200],
  [-430, 380, 210],
  [640, 80, 190],
  [-1020, -330, 220],
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
// The wood the plane arrives in: on the far slope of the rise, a track winding through it to the crest.
const ARRIVAL = { z0: 1535, z1: 1600, half: 300, soft: 110 };
const sm = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const inArrival = (x: number, z: number) => sm(ARRIVAL.z0, ARRIVAL.z1, z) * (1 - sm(ARRIVAL.half, ARRIVAL.half + ARRIVAL.soft, Math.abs(x)));
const GLSL_ARRIVAL = `smoothstep(${ARRIVAL.z0.toFixed(1)}, ${ARRIVAL.z1.toFixed(1)}, p.y) * (1.0 - smoothstep(${ARRIVAL.half.toFixed(1)}, ${(ARRIVAL.half + ARRIVAL.soft).toFixed(1)}, abs(p.x)))`;
// (the open slope about the crest, between the wood and the plain: grass, a few great trees)
const GLSL_CREST = `smoothstep(1270.0, 1340.0, p.y) * (1.0 - smoothstep(430.0, 520.0, abs(p.x))) * (1.0 - ${GLSL_ARRIVAL})`;
// (the track: a gentle S under the trees, over the crest, and on as the pale road: one smooth way, fairy/track.ts)
const trackX = roadAxAt;
const woodF = (x: number, z: number) => {
  let F = Math.sin(x * 0.0041 + 1.3) * Math.sin(z * 0.0052 + 0.4) + 0.55 * Math.sin((x + z) * 0.0093 + 2.0) + 0.3 * Math.sin(x * 0.019 - z * 0.015 + 0.7) + 0.12;
  const dm = Math.hypot(x - MT.x, z - MT.z);
  F += 1.5 * Math.exp(-Math.pow((dm - 450) / 190, 2));
  for (const [hx, hz, hr] of HAMLETS) F -= 1.7 * Math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (hr * hr));
  F += 2.4 * inArrival(x, z);
  return F;
};
const GLSL_WOOD = /* glsl */ `
float fairyF(vec2 p){
  float F = sin(p.x * 0.0041 + 1.3) * sin(p.y * 0.0052 + 0.4) + 0.55 * sin((p.x + p.y) * 0.0093 + 2.0) + 0.3 * sin(p.x * 0.019 - p.y * 0.015 + 0.7) + 0.12;
  float dm = length(p - vec2(${f4(MT.x)}, ${f4(MT.z)}));
  F += 1.5 * exp(-(dm - 450.0) * (dm - 450.0) / 36100.0);
  ${HAMLETS.map(([x, z, r]) => `{ vec2 d = p - vec2(${f4(x)}, ${f4(z)}); F -= 1.7 * exp(-dot(d, d) / ${f4(r * r)}); }`).join("\n  ")}
  F += 2.4 * ${GLSL_ARRIVAL};
  return F;
}`;
// the road over the plain: from the rise down the plain's west side and round the mountain's foot (fairy/track.ts)
const FOOT = rampLine(2)[0];
if (process.env.NODE_ENV !== "production" && Math.hypot(MT.x + FOOT.x - RAMP_FOOT[0], MT.z + FOOT.z - RAMP_FOOT[1]) > 1.5) console.warn("fairy: the ramp's foot has moved; update RAMP_FOOT in fairy/track.ts", MT.x + FOOT.x, MT.z + FOOT.z);
const WAYS = { tex: null as THREE.DataTexture | null };
// (development: window.__fairyWays.dist(x, z) is the distance to the nearest way, for checking that nothing grows on one)
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __fairyWays: { dist: wayDist, a: wayA, b: wayB } });

export const FAIRY_PAL: GroundPalette = {
  a: [0.075, 0.15, 0.045],
  b: [0.13, 0.18, 0.05],
  c: [0.05, 0.115, 0.05],
  hook: {
    uniforms: { tWays: { value: null as THREE.Texture | null } },
    decl: /* glsl */ `
      ${GLSL_WOOD}
      ${GLSL_GROUND_LIFE}
      ${GLSL_WAYS}
    `,
    lit: /* glsl */ `
      {
        float F = fairyF(p);
        vec3 light = uSkyCol * 0.7 + uKeyCol * (0.22 + 0.5 * max(uKeyDir.y, 0.0)) * sunUp;
        float fpx = length(fwidth(p));
        vec3 meadow0 = col;
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
        float crestZ = ${GLSL_CREST};
        float wood = smoothstep(-0.06, 0.1, F) * (1.0 - crestZ);
        float can = vnoise(p * 0.07) * 0.5 + vnoise(p * 0.19 + 3.0) * 0.5;
        vec3 floorC = mix(vec3(0.028, 0.065, 0.04), vec3(0.1, 0.16, 0.045), smoothstep(0.42, 0.7, can) * (1.0 - smoothstep(0.6, 3.5, fpx)) * 0.8);
        col = mix(col, floorC * light, wood);
        // the pale road
        float sd = waySD(p);
        float way = (1.0 - smoothstep(3.2, 5.0, abs(sd))) * (1.0 - smoothstep(1430.0, 1450.0, p.y));
        // (the way out runs on past the gate and dies away in the haze of the plain, with no end to see)
        way *= mix(1.0, 1.0 - smoothstep(230.0, 370.0, dot(p - vec2(${f4(646)}, ${f4(-1335)}), vec2(${f4(0.3553)}, ${f4(-0.9348)}))), step(p.y, -1335.0));
        col = mix(col, vec3(0.74, 0.66, 0.5) * light, way * 0.9);
        // the arrival wood. Its floor is not the far woods' dark: grass where the light comes down, thinning under
        // the trees to soil, leaf litter and single fallen leaves, cushions of moss, roots running across; over all
        // of it the sun let through the leaves in warm patches that drift. The track: earth worn by wheels, two
        // ruts with grass standing between them and water lying in them, its edges ragged with turf; it pales
        // toward the crest, where the road begins.
        float inW = ${GLSL_ARRIVAL};
        float trk = 0.0;
        {
          float near = 1.0 - smoothstep(1.0, 4.0, fpx);
          float fine = 1.0 - smoothstep(0.06, 0.45, fpx);
          float dap = smoothstep(0.58, 0.76, vnoise(p * 0.15 + vec2(uTime * 0.012, 0.0)) * 0.62 + vnoise(p * 0.41 + 5.0) * 0.38) * near;
          float thin = smoothstep(0.46, 0.8, vnoise(p * 0.07 + 2.0));
          vec3 litter = mix(vec3(0.115, 0.095, 0.05), vec3(0.2, 0.165, 0.075), vnoise(p * 1.9)) * (0.8 + 0.4 * vnoise(p * 7.0) * fine);
          vec2 lc = p * 2.4;
          vec2 li = floor(lc);
          float lh = hash12(li);
          float la = lh * 6.2832;
          vec2 lq = fract(lc) - 0.5 - (vec2(hash12(li + 3.1), hash12(li + 7.7)) - 0.5) * 0.5;
          lq = vec2(lq.x * cos(la) - lq.y * sin(la), lq.x * sin(la) + lq.y * cos(la));
          float leaf = (1.0 - smoothstep(0.1, 0.16, length(lq * vec2(1.0, 2.1)))) * step(0.4, lh) * fine;
          litter = mix(litter, mix(vec3(0.34, 0.25, 0.08), vec3(0.44, 0.38, 0.14), fract(lh * 7.3)), leaf);
          vec3 soil = vec3(0.075, 0.066, 0.042) * (0.8 + 0.4 * vnoise(p * 2.3));
          vec3 bare = mix(soil, litter, smoothstep(0.3, 0.6, vnoise(p * 0.5 + 6.0)));
          float moss = smoothstep(0.56, 0.74, vnoise(p * 0.31 + 9.0)) * thin;
          bare = mix(bare, vec3(0.1, 0.19, 0.045) * (0.75 + 0.5 * vnoise(p * 3.1)), moss * 0.85);
          // (no thin pale root-lines: an isoline of lattice noise is a hairline that zigzags across the floor)
          vec3 fl = mix(meadow0 * 0.86, bare * light, thin * 0.9);
          fl *= mix(0.6, 1.0, dap);
          fl += vec3(0.11, 0.1, 0.035) * light * dap;
          col = mix(col, fl, inW);
          float tw0 = abs(sd);
          float tw = tw0 + (vnoise(p * 0.21) - 0.5) * 1.4 + (vnoise(p * 1.3) - 0.5) * 0.5 * near;
          trk = (1.0 - smoothstep(2.3, 3.9, tw)) * smoothstep(1430.0, 1450.0, p.y) * (1.0 - smoothstep(1890.0, 1925.0, p.y));
          vec3 earth = vec3(0.3, 0.25, 0.155) * (0.8 + 0.4 * vnoise(p * 0.8)) * (0.9 + 0.2 * vnoise(p * 9.0) * fine);
          float rutd = abs(tw0 - 1.25);
          float rut = 1.0 - smoothstep(0.1, 0.5, rutd);
          earth *= 1.0 - 0.4 * rut * near;
          earth *= 1.0 + 0.16 * (smoothstep(0.45, 0.6, rutd) - smoothstep(0.6, 0.9, rutd)) * near;
          earth = mix(earth, vec3(0.1, 0.17, 0.05) * (0.8 + 0.5 * vnoise(p * 2.7)), (1.0 - smoothstep(0.2, 0.62, tw0)) * 0.8 * near);
          earth = mix(vec3(0.74, 0.66, 0.5), earth, smoothstep(1450.0, 1560.0, p.y));
          vec3 earthLit = earth * light * mix(1.0, mix(0.66, 1.12, dap), inW);
          float side = step(0.0, sd);
          float pn = vnoise(vec2(p.y * 0.24 + side * 17.0, side * 5.0 + 1.0));
          float pud = (1.0 - smoothstep(0.2, 0.3 + 0.5 * smoothstep(0.7, 0.86, pn), rutd)) * smoothstep(0.7, 0.76, pn) * smoothstep(1565.0, 1600.0, p.y) * near;
          vec3 water = mix(vec3(0.06, 0.052, 0.035) * light, vec3(dot(uSkyCol, vec3(0.3, 0.5, 0.2))) * vec3(0.5, 0.5, 0.46), 0.45) + vec3(0.9, 0.85, 0.6) * dap * 0.16;
          earthLit = mix(earthLit, water, pud * 0.9);
          col = mix(col, earthLit, trk * 0.95);
        }
        // the open slope about the crest, read from the air: turf in tufts and tussocks, paler where the seed-heads
        // stand, never one smooth green
        {
          float k = crestZ * (1.0 - smoothstep(2.0, 9.0, fpx));
          float tuft = vnoise(p * 1.4) * 0.45 + vnoise(p * 4.1) * 0.3 + vnoise(p * 0.37) * 0.25;
          col *= mix(1.0, 0.7 + 0.6 * tuft, k);
          col = mix(col, col * vec3(1.3, 1.2, 0.78), smoothstep(0.55, 0.8, vnoise(p * 0.085 + 4.0)) * 0.4 * crestZ);
          col = mix(col, col * vec3(0.72, 0.86, 0.7), smoothstep(0.6, 0.85, vnoise(p * 0.05 + 11.0)) * 0.4 * crestZ);
        }
        // the meadows between: flowers in drifts and one by one, stones, strokes of turf
        col = groundLife(col, p, gd, px, light, max((1.0 - wood) * (1.0 - fld) * (1.0 - way), inW * 0.2) * (1.0 - trk), vec3(1.0, 0.84, 0.25), vec3(0.86, 0.3, 0.42));
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
  F += 2.4 * ${GLSL_ARRIVAL};
  float meadow = smoothstep(-0.75, -0.5, F) * (1.0 - smoothstep(-0.12, 0.02, F)) * (1.0 - smoothstep(330.0, 400.0, dm));
  // the arrival wood has grass too (thin where the floor is litter and soil), and the open slope about the crest;
  // none in the track's ruts (a strip stands between them) and none on the pale road
  float arr = ${GLSL_ARRIVAL};
  float woodGrass = arr * mix(0.25, 1.0, 1.0 - smoothstep(0.46, 0.8, vnoise(p * 0.07 + 2.0)));
  float crest = ${GLSL_CREST};
  // the track and the road, as far as the plane is ever low enough to see grass beside them (x of the way at this z, read
  // off a table every ${ROAD_AX.step} m); none in the track's ruts (a strip stands between them) and none on the pale road
  ${GLSL_ROAD_AX}
  float ruts = 0.0;
  float road = 0.0;
  {
    float ix = (${ROAD_AX.top.toFixed(1)} - p.y) / ${ROAD_AX.step.toFixed(1)};
    if (ix >= 0.0 && ix < ${(ROAD_AX.n - 1).toFixed(1)}) {
      float i0 = floor(ix);
      float tx = mix(RAX[int(i0)], RAX[int(i0) + 1], ix - i0);
      float tw = abs(p.x - tx);
      ruts = smoothstep(0.4, 0.7, tw) * (1.0 - smoothstep(2.5, 3.5, tw)) * smoothstep(1430.0, 1450.0, p.y);
      road = (1.0 - smoothstep(3.4, 5.0, tw)) * (1.0 - smoothstep(1430.0, 1450.0, p.y));
    }
  }
  return max(meadow, max(woodGrass, crest)) * (1.0 - ruts) * (1.0 - road);`;

// ---------- the light in the way-out arch, seen from far ----------
// The window onto Paradise (portal.tsx) only comes alive within 320 m of the gate; from farther off the arch would stand
// empty. This is a soft sheet of Paradise's gold hung in its opening, strong from afar and given up to the window as
// the plane comes near.
function GateGlow() {
  const b = useDisposable(() => {
    const gt = gateOf("fairy")!;
    const gy = groundAt(def, gt.pos.x, gt.pos.z) - 2;
    const h = gt.pos.y - gy + 27;
    const half = 18;
    const spring = Math.max(h * 0.35, h - half * 1.6);
    const sh = new THREE.Shape();
    sh.moveTo(-half, 0);
    sh.lineTo(-half, spring);
    sh.quadraticCurveTo(-half, h * 0.95, 0, h);
    sh.quadraticCurveTo(half, h * 0.95, half, spring);
    sh.lineTo(half, 0);
    const g = new THREE.ShapeGeometry(sh, 16);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, uH: { value: h } },
      vertexShader: /* glsl */ `varying vec2 vP; varying vec3 vW; void main(){ vP = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uH; varying vec2 vP; varying vec3 vW;
        void main(){
          float d = length(cameraPosition - vW);
          float far = smoothstep(150.0, 320.0, d);
          float t = clamp(vP.y / uH, 0.0, 1.0);
          float edge = 1.0 - smoothstep(0.55, 1.0, abs(vP.x) / 18.0);
          vec3 col = mix(vec3(1.0, 0.82, 0.5), vec3(1.0, 0.95, 0.86), t) * (0.55 + 0.45 * t);
          gl_FragColor = vec4(col * far * (0.5 + 0.5 * edge) * 0.8, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { g, mat, gt, gy };
  }, []);
  return <mesh geometry={b.g} material={b.mat} position={[b.gt.pos.x, b.gy, b.gt.pos.z]} rotation={[0, b.gt.yaw, 0]} renderOrder={4} frustumCulled={false} />;
}

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
    if (!WAYS.tex) WAYS.tex = makeWayField();
    FAIRY_PAL.hook!.uniforms!.tWays.value = WAYS.tex;
    // nothing grows on a way, or over it: a crown (or bush) whose reach comes within `pad` of one is not planted
    const offWays = (list: Crown[], pad: number, ox = 0, oz = 0) => {
      for (let i = list.length - 1; i >= 0; i--) if (!clearOfWays(list[i].p[0] + ox, list[i].p[2] + oz, list[i].r, pad)) list.splice(i, 1);
    };

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
    const wood = makeCrownMaterial(WOOD);
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
    // (the plane comes up the front and passes the right flank: the woods of the far side and the back are only
    // ever seen across the valley, and are drawn with the plain's coarse crowns)
    offWays(onMount, 7, MT.x, MT.z);
    const farSide = (c: Crown) => c.p[0] < -110 || (c.p[2] < -60 && c.p[0] < 150);
    const slopes = crownMesh(onMount.filter((c) => !farSide(c)), wood, true);
    const slopesFar = crownMesh(onMount.filter(farSide), wood, false);

    // ---- the woods of the plain: thick near the way and round the mountain's foot, bigger and fewer far off
    const plain: Crown[] = [];
    const close: Crown[] = [];
    const track = pathOf("fairy").pts.filter((_, i) => i % 6 === 0);
    const nearTrack = (x: number, z: number) => track.some((q) => q.y < 300 && Math.abs(q.x - x) < 170 && Math.abs(q.z - z) < 170);
    const nearN = Math.round(6000 * few);
    for (let i = 0, guard = 0; i < nearN && guard < nearN * 8; guard++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 1180;
      const x = 60 + Math.cos(a) * d;
      const z = 120 + Math.sin(a) * d;
      const F = woodF(x, z);
      if (F < 0.04 + r() * 0.1) continue;
      if (Math.hypot(x - MT.x, z - MT.z) < 372) continue;
      if (wayDist(x, z) < 26) continue;
      if (def.canvases.some((c) => Math.hypot(x - c.x, z - c.z) < 30)) continue;
      const s = 6 + r() * 4.5;
      (nearTrack(x, z) ? close : plain).push({ p: [x, g(x, z) - s * 0.1, z], r: s, h: 0.95 + r() * 0.55, seed: r() });
      i++;
    }
    const edge: Crown[] = [];
    const farN = Math.round(4800 * few * Math.min(1, props.far + 0.2));
    for (let i = 0, guard = 0; i < farN && guard < farN * 8; guard++) {
      const a = r() * Math.PI * 2;
      const d = 1100 + Math.pow(r(), 0.8) * 1500;
      const x = 60 + Math.cos(a) * d;
      const z = 120 + Math.sin(a) * d;
      if (woodF(x, z) < 0.05 + r() * 0.15) continue;
      // (the arrival wood is planted with real trees, below; and about the crest, where the plane comes out of
      // it, every tree is a real one too: no round crown stands where it is seen close)
      if (Math.abs(x) < 200 && z > 1480) continue;
      if (Math.abs(x) < 430 && z > 1270) {
        edge.push({ p: [x, g(x, z) - 0.4, z], r: 6 + r() * 3, h: 1, seed: r() });
        i++;
        continue;
      }
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
      if (wayDist(x, z) < 22) continue;
      const s = 4.5 + r() * 5;
      plain.push({ p: [x, g(x, z) - s * 0.1, z], r: s, h: 1 + r() * 0.5, seed: r() });
    }

    // The trees the plane passes as the world opens are real trees (a short trunk, boughs, a crown of leaf clumps):
    // richly made where it passes close, in fewer larger clumps at mid distance. None stands under the way itself,
    // and those beside it are kept low, so the plane rides over the wood and no crown fills the eye.
    const nearTrees: Crown[] = [];
    const midTrees: Crown[] = [];
    const low = pathOf("fairy").pts.filter((q, i) => i % 4 === 0 && q.y < 150);
    // (the richly made oaks are kept for the arrival wood, where the plane goes under them)
    const NEAR_MAX = 0;
    const MID_MAX = props.mobile ? 340 : 540;
    const ranked = close
      .map((c) => {
        let d = 1e9;
        for (const q of low) d = Math.min(d, Math.hypot(q.x - c.p[0], q.z - c.p[2]));
        return { c, d };
      })
      .sort((u, v) => u.d - v.d);
    close.length = 0;
    for (const { c, d } of ranked) {
      if (d < 30) continue;
      const tree: Crown = { p: [c.p[0], g(c.p[0], c.p[2]) - 0.4, c.p[2]], r: d < 110 ? Math.min(c.r, 6.2) : c.r * 0.9, h: 1, seed: c.seed };
      if (d < 150 && nearTrees.length < NEAR_MAX) nearTrees.push(tree);
      else if (midTrees.length < MID_MAX) midTrees.push(tree);
      else plain.push(c);
    }
    midTrees.push(...edge);
    // about the gate of the way on, too, the plane comes close: real trees on its hill, none within the arch's reach
    {
      const gt = def.gate!;
      for (let i = plain.length - 1; i >= 0; i--) {
        const c = plain[i];
        const dg = Math.hypot(c.p[0] - gt.x, c.p[2] - gt.z);
        if (dg >= 320) continue;
        plain.splice(i, 1);
        if (dg > 95) midTrees.push({ p: [c.p[0], g(c.p[0], c.p[2]) - 0.4, c.p[2]], r: Math.min(c.r, 8.5), h: 1, seed: c.seed });
      }
    }
    // ---- the arrival wood, as it is laid out from the plane's first place to the plain:
    //   the glade      a small clearing the plane appears in, birches round it, open sky over it;
    //   the deep wood  great oaks close on either hand, their crowns meeting over the track;
    //   the stand      half-way, a lighter stretch of birch;
    //   the wood's edge the trees stand back and thin to single birches and thorn, and the plane climbs out;
    //   the crest      open grass, a few great trees to either side; and the plain beyond.
    const ferns: Crown[] = [];
    const birchNear: Crown[] = [];
    {
      const GLADE = 1830;
      const step = props.mobile ? 21 : 13.5;
      for (let z = 1490; z < 1882; z += step) {
        for (let x = -190; x <= 190; x += step) {
          const tz = z + (r() - 0.5) * step * 0.85;
          const tx = x + (r() - 0.5) * step * 0.85;
          const d = Math.abs(tx - trackX(tz));
          const glade = 31 * Math.exp(-(((tz - GLADE) / 30) ** 2));
          // (the way itself is clear: wider and wider toward the crest, where the plane climbs out)
          // (and wide enough that no bough hangs where the eye follows the plane round the bends)
          const clear = Math.max(22 + Math.max(0, 1672 - tz) * 0.5, glade);
          if (d < clear) continue;
          const patch = 0.5 + 0.5 * Math.sin(tx * 0.031 + 1.3) * Math.sin(tz * 0.027 + 0.6);
          if (r() > sm(1480, 1575, tz) * (d < 70 ? 1 : 0.45) * (0.62 + 0.6 * patch)) continue;
          const near = d < 34 && !props.mobile;
          const birch = (glade > 12 && d - clear < 10) || (tz > 1632 && tz < 1700 && r() < 0.62) || (tz < 1604 && r() < 0.5) || r() < 0.1;
          if (birch && (near || d - clear < 14)) birchNear.push({ p: [tx, g(tx, tz) - 0.4, tz], r: 5.8 + r() * 2.8, h: 1.04 + r() * 0.2, seed: r() });
          else (near ? nearTrees : midTrees).push({ p: [tx, g(tx, tz) - 0.5, tz], r: (d < 46 ? 9.2 : 7) + r() * r() * 3.2, h: (d < 46 ? 1.26 : 1.08) + r() * 0.12, seed: r() });
        }
      }
      // undergrowth: thorn and hazel in clumps under the wood's edge and round the glade, a few along the verges
      for (let i = 0; i < (props.mobile ? 110 : 250); i++) {
        const z = 1548 + r() * 330;
        const sd = r() < 0.5 ? -1 : 1;
        const d = 8 + Math.pow(r(), 1.3) * 60 + Math.max(0, 1640 - z) * 0.16;
        const x = trackX(z) + sd * d;
        if (Math.sin(x * 0.09 + 0.7) * Math.sin(z * 0.07 + 2.1) < -0.1) continue;
        const sz = 1.1 + r() * r() * 2.0;
        ferns.push({ p: [x, g(x, z) - 0.2, z], r: sz, h: 0.8 + r() * 0.5, seed: r() });
      }
    }
    offWays(nearTrees, 9);
    offWays(midTrees, 9);
    offWays(birchNear, 9);
    offWays(ferns, 5);
    const leaves = makeLeafTexture();
    // one palette for every crown of this world, the leaf-clump trees by the way and the far woods alike
    const leafy = makeLeafyMaterial(leaves, { wood: WOOD });
    const bushGeo = buildTree("bush", 1, props.mobile ? 0 : 1);
    const fernMesh = leafyMesh(ferns, bushGeo, makeLeafyMaterial(leaves, { wood: { ...WOOD, gold: 0.6 } }), 1.3);
    bushGeo.dispose();
    const birchRich = buildTree("birch", 0, props.mobile ? 0 : 1);
    const birchMeshes = [leafyMesh(birchNear, birchRich, leafy)];
    birchRich.dispose();
    // sun come down through the canopy onto the track, and a thin mist lying in the wood
    const shafts: Beam[] = [];
    for (let i = 0; i < (props.mobile ? 6 : 13); i++) {
      const z = 1590 + (i / 12) * 270 + (r() - 0.5) * 12;
      const x = trackX(z) + (r() - 0.5) * 26;
      shafts.push({ foot: [x, g(x, z), z], len: 46 + r() * 22, w: 3.4 + r() * 3.6, k: 0.42 + r() * 0.3 });
    }
    const treeMeshes = [0, 1].flatMap((v) => {
      const rich = buildTree("broad", v, props.mobile ? 0 : 1);
      const coarse = buildTree("broad", v, 0);
      const out = [leafyMesh(nearTrees.filter((_, i) => i % 2 === v), rich, leafy), leafyMesh(midTrees.filter((_, i) => i % 2 === v), coarse, leafy)];
      rich.dispose();
      coarse.dispose();
      return out;
    });
    // low bushes scattered through the meadows, so no stretch of ground is bare
    for (let i = 0; i < Math.round(1500 * few); i++) {
      const a = r() * Math.PI * 2;
      const d = 380 + Math.sqrt(r()) * 1250;
      const x = Math.cos(a) * d;
      const z = 100 + Math.sin(a) * d;
      const F = woodF(x, z);
      if (F > -0.04 || F < -0.6) continue;
      if (wayDist(x, z) < 14) continue;
      const s = 1.5 + r() * 2.2;
      plain.push({ p: [x, g(x, z) - s * 0.2, z], r: s, h: 0.8 + r() * 0.4, seed: r() });
    }
    // (none stands in the way on)
    const gate = def.gate!;
    for (const list of [plain, midTrees]) for (let i = list.length - 1; i >= 0; i--) if (Math.hypot(list[i].p[0] - gate.x, list[i].p[2] - gate.z) < 95) list.splice(i, 1);
    offWays(plain, 8);

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
        if (wayDist(x, z) < 20) continue;
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
        if (wayDist(px, pz) < 14) continue;
        cyp.push({ p: [px, g(px, pz) - 0.5, pz], r: 2 + r() * 1.5, h: 6.5 + r() * 3.5, seed: r() });
      }
    }
    offWays(cyp, 6);
    // the gatehouses: where the plain's road meets the way up the mountain, and (at the back) where the way out leaves it:
    // two small towers either side of the road and a lamp between them
    const gatehouse = (gx: number, gz: number, ax: number, az: number, gap: number) => {
      const gy = g(gx, gz);
      for (const sd of [-1, 1]) {
        const tx = gx + ax * sd * gap;
        const tz = gz + az * sd * gap;
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
    };
    {
      // (the way up leaves the plain's road at the foot of the mountain heading across the slope: the towers stand on the radius)
      const fl = Math.hypot(FOOT.x, FOOT.z);
      gatehouse(MT.x + FOOT.x, MT.z + FOOT.z, FOOT.x / fl, FOOT.z / fl, 11);
      // (the way out: a smaller gate in the back of the mountain's foot, the towers either side of the road's line)
      const b0 = wayB.pts[0];
      const b1 = wayB.pts[6];
      const bl = Math.hypot(b1.x - b0.x, b1.y - b0.y);
      gatehouse(b0.x, b0.y, -(b1.y - b0.y) / bl, (b1.x - b0.x) / bl, 11);
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
    for (let i = 0; i < (props.mobile ? 6 : 14); i++) {
      const z = 1570 + (i / 13) * 300;
      const x = trackX(z) + (r() - 0.5) * 90;
      puffs.push({ p: [x, g(x, z) + 4 + r() * 7, z], size: 46 + r() * 40, a: 0.26 });
    }
    // air in layers: a band of low mist across the valley between the rise and the mountain (the mountain stands
    // up out of it), mist in the woods about its foot, and long banks behind it so the far plain goes back in steps
    for (let i = 0; i < (props.mobile ? 10 : 24); i++) {
      const x = -900 + (i / 23) * 1800 + (r() - 0.5) * 60;
      const z = 330 + (r() - 0.5) * 260 + Math.abs(x) * 0.12;
      if (Math.abs(x) < 70) continue;
      puffs.push({ p: [x, g(x, z) + 14 + r() * 16, z], size: 170 + r() * 120, a: 0.5 });
    }
    for (let i = 0; i < (props.mobile ? 8 : 20); i++) {
      const a = (i / 20) * Math.PI * 2 + r() * 0.2;
      const d = 405 + r() * 130;
      // (thinner in front, where the road and the ramp are to be seen)
      puffs.push({ p: [MT.x + Math.cos(a) * d, y0 + 16 + r() * 34, MT.z + Math.sin(a) * d], size: 120 + r() * 90, a: Math.sin(a) > 0.3 ? 0.3 : 0.55 });
    }
    for (let i = 0; i < (props.mobile ? 8 : 18); i++) {
      const x = -1700 + (i / 17) * 3400;
      const z = -1100 - r() * 900;
      puffs.push({ p: [x, g(x, z) + 30 + r() * 60, z], size: 320 + r() * 220, a: 0.5 });
    }
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
      // small birds under the trees of the arrival wood
      { c: [trackX(1720), g(trackX(1720), 1720) + 13, 1720], r: 44, n: props.mobile ? 4 : 9, size: 0.8, speed: 6 },
      { c: [-420, 150, 200], r: 190, n: props.mobile ? 5 : 11, size: 1.5, speed: 11 },
      { c: [520, 200, -700], r: 160, n: props.mobile ? 5 : 10, size: 1.7, speed: 10 },
    ];
    const road = roadLine(7);
    // the plain's road, from the crest to the mountain (the walkers and the little procession go along it), and the way out
    const way: THREE.Vector3[] = wayA.pts.filter((q, i) => q.y < 1420 && i % 2 === 0).map((q) => new THREE.Vector3(q.x, g(q.x, q.y), q.y));
    const wayOut: THREE.Vector3[] = wayB.pts.filter((_, i) => i % 2 === 0).map((q) => new THREE.Vector3(q.x, g(q.x, q.y), q.y));
    const nM = props.mobile ? 260 : Math.round(1300 * props.effects);
    // the castle's lamps: dark from far off, they kindle ward by ward as the plane comes on, the summit last
    // the angels (the home forest's, home/Angels.tsx): on the castle's terraces and bridge (standing with the mountain), and
    // at the way out: one great one either side of the gate, and a pair at every stride of the last reach of road before it,
    // each looking in at the road the souls walk
    const air = { glsl: GLSL_AIR, apply: "applyAir(col, vWorld)", amount: "airAmt(vWorld)", uniforms: WORLD_U, night: { value: 0.3 } };
    const roadAngels: AngelSpot[] = [];
    {
      const gax = -Math.sin(GATE.yaw);
      const gaz = -Math.cos(GATE.yaw);
      // (across the gate: its own right-hand side, the same as the piers)
      const cx = Math.cos(GATE.yaw);
      const cz = -Math.sin(GATE.yaw);
      for (const sd of [-1, 1]) {
        const x = GATE.x + cx * sd * 56 - gax * 6;
        const z = GATE.z + cz * sd * 56 - gaz * 6;
        roadAngels.push({ x, z, y: g(x, z) - 0.2, yaw: Math.atan2(-sd * cx * 0.7 - gax * 0.7, -sd * cz * 0.7 - gaz * 0.7), s: 4, robe: sd > 0 ? 0 : 1 });
      }
      let last = -1e9;
      let n = 0;
      for (let i = 2; i < wayB.pts.length - 2; i++) {
        const p = wayB.pts[i];
        const dg = Math.hypot(p.x - GATE.x, p.y - GATE.z);
        if (dg > 470 || dg < 110 || p.y < GATE.z) continue;
        const along = i * 4;
        if (along - last < 64) continue;
        last = along;
        const t = new THREE.Vector2(wayB.pts[i + 1].x - wayB.pts[i - 1].x, wayB.pts[i + 1].y - wayB.pts[i - 1].y).normalize();
        for (const sd of [-1, 1]) {
          const x = p.x + -t.y * sd * 13;
          const z = p.y + t.x * sd * 13;
          roadAngels.push({ x, z, y: g(x, z) - 0.2, yaw: Math.atan2(t.y * sd * 0.8 - t.x * 0.4, -t.x * sd * 0.8 - t.y * 0.4), s: 2.6, robe: (n + (sd > 0 ? 1 : 0)) % 4 });
        }
        n++;
      }
    }
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
      castleAngels: buildAngels(castle.angels, air),
      roadAngels: buildAngels(roadAngels, air),
      castleGlows: castle.glows,
      tips: castle.tips.filter((_, i) => i % (props.mobile ? 5 : 2) === 0),
      slopes,
      slopesFar,
      wood,
      plain: crownMesh(plain, wood, false),
      leaves,
      leafy,
      treeMeshes,
      fernMesh,
      birchMeshes,
      shafts,
      cypress: cypressMesh(cyp, makeCrownMaterial({ a: [0.045, 0.12, 0.06], b: [0.07, 0.15, 0.06], shade: [0.02, 0.05, 0.055], wind: 0.5, gold: 0 })),
      set: k.build(),
      lamps,
      heaps: heapMesh([...heapBlobs(heaps, 5), ...heapBlobs(belt, 13)], heapMat, props.mobile ? 1 : 2),
      far: heapMesh(heapBlobs(far, 9), heapMat, 1),
      heapMat,
      puffs,
      flocks,
      road,
      way,
      wayOut,
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
      <WorldBase id="fairy" def={def} pal={FAIRY_PAL} props={b.base} tip={[0.44, 0.5, 0.16]} pathTint={[1, 0.92, 0.7]} mask={GRASS_MASK} tall={1.3} groundSize={14000} angels={false} gate="veil" gateSize={[18, 27]} />
      <RayedSun />
      <GateGlow />
      {/* the mountain, measured from its own foot */}
      <group position={[MT.x, b.y0, MT.z]}>
        <mesh geometry={b.soil} material={b.tempera} />
        <mesh geometry={b.ramp} material={b.rampMat} />
        <mesh geometry={b.wall} material={b.masonry} />
        <mesh geometry={b.peaks} material={b.rock} />
        <mesh geometry={b.castle} material={b.stone} />
        <primitive object={b.slopes} />
        <primitive object={b.slopesFar} />
        <Pennants tips={b.tips} />
        <Kindling list={b.windows} centre={[0, 520, 60]} />
        <Procession road={b.road} n={props.mobile ? 30 : 90} speed={1.3} scale={2.6} robe={[0.5, 0.36, 0.3]} wing={[0.36, 0.26, 0.3]} glow={0.04} seed={5} />
        <mesh geometry={b.castleAngels.glow} material={b.castleAngels.glowMat} renderOrder={2} />
        <mesh geometry={b.castleAngels.geo} material={b.castleAngels.mat} renderOrder={3} />
        <Halos list={b.castleGlows} kind={2} />
        <Halos list={b.castleHalos} />
        <Walkers road={b.road} n={props.mobile ? 60 : 150} speed={1.5} size={1.1} />
      </group>
      <primitive object={b.plain} />
      {b.treeMeshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <primitive object={b.cypress} />
      <mesh geometry={b.set} material={b.stone} />
      <Halos list={b.lamps} />
      <mesh geometry={b.roadAngels.glow} material={b.roadAngels.glowMat} renderOrder={2} />
      <mesh geometry={b.roadAngels.geo} material={b.roadAngels.mat} renderOrder={3} />
      <Walkers road={b.way} n={props.mobile ? 20 : 46} speed={1.4} size={0.9} seed={8} />
      <Walkers road={b.wayOut} n={props.mobile ? 14 : 34} speed={1.4} size={0.9} seed={14} />
      <Procession road={b.wayOut} n={props.mobile ? 14 : 34} speed={1.4} scale={2.6} robe={[0.5, 0.36, 0.3]} wing={[0.36, 0.26, 0.3]} glow={0.04} seed={14} />
      <Procession road={b.way} n={props.mobile ? 20 : 46} speed={1.4} scale={2.6} robe={[0.5, 0.36, 0.3]} wing={[0.36, 0.26, 0.3]} glow={0.04} seed={8} />
      <RisingFlock origin={[36, b.flockY, 1040]} n={props.mobile ? 24 : 60} reach={210} size={1.5} tint={[0.14, 0.09, 0.1]} away={[0.5, -0.86]} />
      <primitive object={b.heaps} />
      <primitive object={b.far} />
      <Birds flocks={b.flocks} tint={[0.14, 0.09, 0.1]} />
      <primitive object={b.fernMesh} />
      {b.birchMeshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <SunShafts list={b.shafts} tint={[1, 0.92, 0.62]} />
      <points geometry={b.motes} material={b.moteMat} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
    </>
  );
}
