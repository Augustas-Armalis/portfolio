"use client";

import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_AIR, Kit, WORLD_U, angel, makePoints, makeTempera, makeWater, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { WORLDS, groundAt, heightAt } from "./voyage";

// Paradise (Angels, 1909). A yellow-green noon under rows of cloud. On the
// left a still lake, its shore one long curve of pale sand; on the right a
// meadow thick with small flowers, and beyond it broad pale steps climbing
// away in an arc. Angels stand about in the grass and on the steps, slight
// figures in blue, rose, green and white with tall narrow wings; one, larger
// and nearer, bends to pick a flower. White birds cross the sky.

const def = WORLDS.paradise;
export const PARADISE_PAL: GroundPalette = { a: [0.08, 0.125, 0.034], b: [0.13, 0.15, 0.042], c: [0.058, 0.1, 0.038], shore: [0.5, 0.42, 0.2], shoreAt: [0.1, 0.62] };

// the steps curve round the meadow: arcs struck from the middle of the lake, like its shore
export const STEPS = { x: -200, z: 100, r0: 392, tread: 9.5, rise: 2.3, n: 13, y0: 4.8, a0: -0.94, a1: 0.56 };
const STEP_TOP: V3 = [0.86, 0.76, 0.42];
const STEP_EDGE: V3 = [0.98, 0.9, 0.58];
const STEP_FACE: V3 = [0.6, 0.5, 0.26];
const CLOUD_Y = 380;
const glv = (c: V3) => `vec3(${c.map((x) => x.toFixed(3)).join(", ")})`;

// His sky: long bars of cloud laid in rows, olive in the shade, with short
// flat strokes of yellow light along them. One function draws them overhead
// and again, upside down, in the water.
const GLSL_BARS = /* glsl */ `
vec4 barsAt(vec2 q){
  float row = q.y / 170.0 + vnoise(q * 0.0015) * 0.5;
  float ri = floor(row); float rf = fract(row);
  float n = vnoise(vec2(q.x / 300.0 + ri * 7.31, ri * 1.7)) * 0.7 + vnoise(vec2(q.x / 90.0 - ri * 3.1, ri + 4.0)) * 0.3;
  float body = smoothstep(0.32, 0.5, n);
  float band = smoothstep(0.06, 0.24, rf) * smoothstep(0.96, 0.72, rf);
  // long soft dabs of light laid along the bar, no two alike
  float dab = vnoise(vec2(q.x / 58.0 + ri * 3.7, rf * 3.4 + ri * 1.3)) * 0.7 + vnoise(vec2(q.x / 21.0 - ri * 5.1, rf * 6.0)) * 0.3;
  float lit = smoothstep(0.5, 0.64, dab) * smoothstep(0.18, 0.42, rf) * smoothstep(1.0, 0.8, rf) * (0.6 + 0.4 * n);
  return vec4(mix(uCloudShade, uCloudLit, lit), body * band * 0.92);
}`;
function makeBars() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec2 vLocal;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vLocal = wp.xz - modelMatrix[3].xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec2 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_BARS}
      void main(){
        vec4 b = barsAt(vLocal);
        vec3 dv = vWorld - cameraPosition;
        float dist = length(dv);
        // row behind row they sink into the sky's own colour at the horizon
        float far = smoothstep(500.0, 2500.0, dist);
        vec3 col = mix(b.rgb, airCol(normalize(dv)), far * 0.72);
        gl_FragColor = vec4(col, b.a * (1.0 - smoothstep(1900.0, 2800.0, dist)) * exp(-dist * uMist * 0.4));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
// what stands mirrored in the lake: the cloud bars, and the pale flight of steps beyond the meadow
const REFLECT = /* glsl */ `
${GLSL_BARS}
vec4 worldReflect(vec3 P, vec3 r){
  // low rays are bent up a little, so the far water still carries the rows as bands of light
  float t = ${CLOUD_Y.toFixed(1)} / max(r.y, 0.22);
  vec4 b = barsAt(P.xz + r.xz * t);
  vec4 o = vec4(mix(b.rgb, skyBase(r), smoothstep(500.0, 2500.0, t) * 0.5), b.a * 0.7);
  vec2 d = P.xz - vec2(${STEPS.x.toFixed(1)}, ${STEPS.z.toFixed(1)});
  vec2 v = r.xz; float A = dot(v, v); float B = dot(d, v);
  float R = ${STEPS.r0.toFixed(1)};
  float top = ${(STEPS.n * STEPS.rise).toFixed(1)};
  for (int i = 0; i < 2; i++) {
    float disc = B * B - A * (dot(d, d) - R * R);
    if (disc <= 0.0) return o;
    float ts = (-B + sqrt(disc)) / max(A, 1e-5);
    float y = r.y * ts - ${STEPS.y0.toFixed(1)};
    if (i == 0) { R += clamp(y, 0.0, top) * ${(STEPS.tread / STEPS.rise).toFixed(3)}; continue; }
    vec2 h = d + v * ts;
    float ang = atan(h.y, h.x);
    float on = step(-${STEPS.rise.toFixed(1)}, y) * step(y, top) * smoothstep(${STEPS.a0.toFixed(2)}, ${(STEPS.a0 + 0.03).toFixed(2)}, ang) * smoothstep(${STEPS.a1.toFixed(2)}, ${(STEPS.a1 - 0.03).toFixed(2)}, ang);
    vec3 sc = mix(${glv(STEP_FACE)}, ${glv(STEP_TOP)}, step(0.45, fract(y / ${STEPS.rise.toFixed(1)}))) * (uSkyCol * 0.8 + uKeyCol * 0.5);
    o = mix(o, vec4(sc, 1.0), on * 0.9);
  }
  return o;
}`;

function steps(mobile: boolean) {
  const seg = mobile ? 44 : 96;
  const pos: number[] = [];
  const col: number[] = [];
  const P = (r: number, a: number, y: number) => new THREE.Vector3(STEPS.x + Math.cos(a) * r, y, STEPS.z + Math.sin(a) * r);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: V3, cb: V3) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
    col.push(...ca, 0, ...cb, 0, ...ca, 0, ...cb, 0, ...cb, 0, ...ca, 0);
  };
  const green: V3 = [0.2, 0.28, 0.08];
  for (let i = 0; i <= STEPS.n; i++) {
    const ri = STEPS.r0 + i * STEPS.tread;
    const last = i === STEPS.n;
    // above the last step a broad landing, and the meadow falling away behind it
    const ro = ri + (last ? 70 : STEPS.tread);
    const y = STEPS.y0 + i * STEPS.rise;
    for (let s = 0; s < seg; s++) {
      const a = STEPS.a0 + (s / seg) * (STEPS.a1 - STEPS.a0);
      const a2 = STEPS.a0 + ((s + 1) / seg) * (STEPS.a1 - STEPS.a0);
      // the tread, paler toward its front edge, and the riser under it
      quad(P(ri, a, y), P(ro, a, y), P(ri, a2, y), P(ro, a2, y), STEP_EDGE, last ? green : STEP_TOP);
      quad(P(ri, a, y - STEPS.rise - (i === 0 ? 8 : 0)), P(ri, a, y), P(ri, a2, y - STEPS.rise - (i === 0 ? 8 : 0)), P(ri, a2, y), STEP_FACE, [0.72, 0.62, 0.34]);
      if (last) quad(P(ro, a, y), P(ro + 110, a, -12), P(ro, a2, y), P(ro + 110, a2, -12), green, [0.1, 0.16, 0.05]);
    }
    // the ends of the flight
    for (const a of [STEPS.a0, STEPS.a1]) quad(P(ri, a, -12), P(ro, a, -12), P(ri, a, y), P(ro, a, y), STEP_FACE, STEP_FACE);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export default function ParadiseWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const r = rng(606);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const dry = (x: number, z: number) => heightAt(def.terrain!, x, z) > 1.5;
    const k = new Kit();
    const glows: Halo[] = [];
    // pale robes, and wings in his soft colours
    const wings: V3[] = [
      [0.14, 0.3, 0.62],
      [0.62, 0.26, 0.34],
      [0.16, 0.42, 0.26],
      [0.66, 0.54, 0.16],
      [0.4, 0.28, 0.62],
      [0.18, 0.46, 0.5],
      [0.7, 0.68, 0.6],
    ];
    const robes: V3[] = [
      [0.7, 0.68, 0.6],
      [0.5, 0.6, 0.74],
      [0.74, 0.58, 0.56],
      [0.56, 0.7, 0.58],
    ];
    // polar about the lake: the meadow is the band between the sand and the steps
    const M = (a: number, d: number): [number, number] => [STEPS.x + Math.cos(a) * d, STEPS.z + Math.sin(a) * d];
    // a company of them in the grass before the steps, in twos and threes, turned to one another
    const groups = props.mobile ? 5 : 9;
    let n = 0;
    for (let gi = 0; gi < groups; gi++) {
      const a = STEPS.a0 + 0.2 + (gi / (groups - 1)) * (STEPS.a1 - STEPS.a0 - 0.5);
      const [cx, cz] = M(a, STEPS.r0 - 12 - (gi % 3) * 13 - r() * 8);
      const m = 2 + (gi % 2);
      for (let i = 0; i < m; i++) {
        const x = cx + Math.cos(i * 2.2 + gi) * 4.2;
        const z = cz + Math.sin(i * 2.2 + gi) * 4.2;
        if (!dry(x, z)) continue;
        const s = 4.0 + r() * 1.4;
        angel(k, [x, g(x, z) - 0.1, z], s, Math.atan2(cx - x, cz - z) + (r() - 0.5) * 0.6, robes[n % robes.length], { glow: 0.05, open: 0.26 + r() * 0.14, wing: wings[n % wings.length] });
        n++;
      }
    }
    // some on the steps themselves, going up
    for (let i = 0; i < (props.mobile ? 5 : 10); i++) {
      const st = 1 + ((i * 3) % (STEPS.n - 2));
      const a = STEPS.a0 + 0.15 + r() * (STEPS.a1 - STEPS.a0 - 0.3);
      const [x, z] = M(a, STEPS.r0 + st * STEPS.tread + 4.5);
      angel(k, [x, STEPS.y0 + st * STEPS.rise, z], 4.2 + r(), -a + Math.PI / 2 + (r() - 0.5) * 1.2, robes[n % robes.length], { glow: 0.05, wing: wings[n % wings.length] });
      n++;
    }
    // and the one who bends to pick a flower, larger and nearer, the wings arched over like a shell
    const [bx, bz] = M(0.42, 338);
    const by = g(bx, bz) - 0.1;
    const byaw = 0.7;
    angel(k, [bx, by, bz], 7.6, byaw, [0.72, 0.66, 0.56], { bend: 1.25, glow: 0.07, open: 0.34, wing: [0.74, 0.62, 0.3] });
    // the flower under the hand
    const fx = bx + Math.sin(byaw) * 7.6 * 0.72;
    const fz = bz + Math.cos(byaw) * 7.6 * 0.72;
    k.add(new THREE.SphereGeometry(0.42, 8, 6), [fx, g(fx, fz) + 0.7, fz], [1, 0.98, 0.9], { glow: 0.9 });
    k.add(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 4), [fx, g(fx, fz) + 0.3, fz], [0.2, 0.3, 0.08]);
    glows.push({ p: [bx, by + 6, bz], size: 26, col: [1, 0.94, 0.74], k: 0.14 });

    // white birds over the water
    for (let i = 0; i < (props.mobile ? 4 : 7); i++) {
      const p: V3 = [-330 + r() * 330, 60 + r() * 60, 330 - r() * 380];
      const s = 3 + r() * 2;
      const yaw = r() * 6.28;
      for (const w of [-1, 1]) {
        const wing = new THREE.BufferGeometry();
        wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.5 * s, w * 2.6 * s, 0.9 * s, 0.1 * s, 0, 0, 0.6 * s, 0, 0, -0.5 * s, 0, 0, 0.6 * s, w * 2.6 * s, 0.9 * s, 0.1 * s], 3));
        wing.computeVertexNormals();
        k.add(wing, p, [1, 1, 0.97], { glow: 0.5, rot: [0, yaw, 0] });
      }
    }

    // flowers: thick in the meadow between the sand and the steps, thinning up the way in
    const spot = (q: () => number): [number, number] => {
      for (let tries = 0; tries < 12; tries++) {
        let x: number;
        let z: number;
        if (q() < 0.3) {
          z = 480 - q() * 230;
          x = 70 + (q() + q() - 1) * 80;
        } else [x, z] = M(STEPS.a0 - 0.1 + q() * (STEPS.a1 - STEPS.a0 + 0.5), 318 + Math.pow(q(), 0.8) * (STEPS.r0 - 320));
        if (dry(x, z)) return [x, z];
      }
      return M(0, 360);
    };
    const flowers = (count: number, seed: number) =>
      pointsGeometry(
        count,
        (_, q) => {
          const [x, z] = spot(q);
          return [x, g(x, z) + 0.5 + q() * 0.35, z, 0.5 + q() * 0.9];
        },
        seed,
      );
    // butterflies: a few over the meadow and out along the sand, never still
    const nB = props.mobile ? 60 : 150;
    const butterflies = pointsGeometry(
      nB,
      (_, q) => {
        const [x, z] = q() < 0.5 ? spot(q) : M(STEPS.a0 + q() * (STEPS.a1 - STEPS.a0 + 0.3), 290 + q() * 40);
        return [x, Math.max(g(x, z), 0) + 1.6 + q() * 4, z, 0.9 + q() * 0.8];
      },
      1313,
    );
    const nF = props.mobile ? 1300 : Math.round(4200 * (0.5 + 0.5 * props.effects));
    // low mist far out over the lake
    const puffs: Puff[] = [];
    for (let i = 0; i < 8; i++) puffs.push({ p: [-520 - r() * 240, 30 + r() * 8, 300 - r() * 520], size: 70 + r() * 60, a: 0.5 });

    return {
      set: k.build(),
      steps: steps(props.mobile),
      tempera: makeTempera({ amb: 0.95, key: 0.34, dab: 0.8 }),
      glows,
      puffs,
      bars: makeBars(),
      flowersA: flowers(nF, 717),
      flowersB: flowers(Math.round(nF * 0.6), 919),
      butterflies,
      flowerA: makePoints({ a: [1.0, 0.98, 0.9], b: [1.0, 0.86, 0.3], scale: 120, solid: true, gain: 1.2, max: 9 }),
      flowerB: makePoints({ a: [0.95, 0.5, 0.62], b: [0.42, 0.56, 1.0], scale: 110, solid: true, gain: 1.15, max: 8 }),
      butterfly: makePoints({ a: [1.0, 0.98, 0.92], b: [1.0, 0.84, 0.4], scale: 220, solid: true, gain: 1.25, max: 12, drift: 2.4 }),
      water: makeWater({ def, deep: [0.07, 0.11, 0.1], calm: 0.3, tint: [0.92, 1.0, 1.04], shore: PARADISE_PAL.shore, reflect: REFLECT }),
    };
  }, [props.mobile, props.effects > 0.5]);
  return (
    <>
      <WorldBase id="paradise" def={def} pal={PARADISE_PAL} props={props} tip={[0.42, 0.46, 0.14]} pathTint={[1, 0.95, 0.76]} tall={0.8} mask="return smoothstep(0.45, 0.9, h);" />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[5200, 5200]} />
      </mesh>
      <mesh material={b.bars} rotation={[-Math.PI / 2, 0, 0]} position={[0, CLOUD_Y, 0]} renderOrder={-3}>
        <planeGeometry args={[5600, 5600]} />
      </mesh>
      <mesh geometry={b.steps} material={b.tempera} />
      <mesh geometry={b.set} material={b.tempera} />
      <points geometry={b.flowersA} material={b.flowerA} />
      <points geometry={b.flowersB} material={b.flowerB} />
      <points geometry={b.butterflies} material={b.butterfly} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
    </>
  );
}
