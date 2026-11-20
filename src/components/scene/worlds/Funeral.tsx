"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, makePoints, makeTempera, noise2, paint, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, PaintedClouds, type Flock, type PaintedCloud } from "./life";
import { ORIGIN, WORLDS, voyage } from "./voyage";
import { ROAD_W, funeralLand } from "./funeral/land";
import { buildFuneralRock, makeLedgeMaterial, makeRockMaterial } from "./funeral/rock";
import { buildSouls } from "./funeral/souls";

// Funeral Symphony VI (Laidotuvių simfonija, 1903). Deep ultramarine pastel: a steep, dark, sculpted mountain,
// every crest edged in green-blue light; and up it, in tight switchbacks along the very edge of the rock, a
// river of hooded souls packed shoulder to shoulder, gold where the light finds their hoods; at the top two
// tall black cypresses mark the pass.
//
// Here the mountain is colossal and the road is a fin of rock that winds up out of the mist with a sheer drop on
// either hand. The plane comes in low over the tail of the procession on the valley floor, the whole serpentine
// standing over it; climbs beside the crowd along the cliff's edge, swinging out over the abyss at each turn to
// look back at them on the brink; passes between the two cypresses at the pass; and follows the souls into the
// mouth of a cave in the north wall, faintly lit from within. That is the way on: no gate of light here.
// A thin moon with fine rays stands over the far wall; mist lies in the valleys; near silence.

const def = WORLDS.funeral;
export const FUNERAL_PAL: GroundPalette = { a: [0.018, 0.035, 0.11], b: [0.026, 0.045, 0.13], c: [0.012, 0.028, 0.09], rock: [0.02, 0.03, 0.09] };
const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// a cypress as he drew them: a tall dark flame, slim as a column, its edge a little ragged
function cypress(x: number, y: number, z: number, h: number, seed: number) {
  const SEG = 28;
  const RINGS = 56;
  const R = h * 0.032;
  const g = new THREE.CylinderGeometry(1, 1, 1, SEG, RINGS, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const q = p.getY(i) + 0.5;
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const rad = Math.hypot(p.getX(i), p.getZ(i));
    // a short trunk, fullest a quarter of the way up, drawn out to a point
    let w = q < 0.045 ? 0.22 : Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, (q - 0.045) / 0.955), 0.62)), 0.75) * (1 - 0.25 * q);
    // tufts of foliage, in long upright locks
    if (q >= 0.045) w *= 0.86 + 0.3 * noise2(a * 2.2 + seed, q * 17 + seed) + 0.12 * noise2(a * 6 + seed * 3, q * 46);
    const lean = Math.sin(q * 2.4 + seed) * h * 0.006;
    const k = rad > 0.01 ? (w * R) / 1 : 0;
    p.setXYZ(i, Math.cos(a) * k * (rad > 0.01 ? 1 : 0) + lean, q * h, Math.sin(a) * k * (rad > 0.01 ? 1 : 0));
  }
  g.computeVertexNormals();
  const painted = paint(g, [0.004, 0.012, 0.02], 0, [0.006, 0.02, 0.034]);
  painted.translate(x, y - 2, z);
  return painted;
}

// The thin moon: a sliver of pale gold, and round it the fine straight rays he drew in the corner of the picture,
// long and short, in broken strokes; behind the far wall for much of the way, so its rays stand over the rock.
function makeMoonMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `
      uniform vec3 uMoonDir;
      varying vec2 vUv;
      void main(){
        vec3 c = cameraPosition + normalize(uMoonDir) * 2500.0;
        vec4 mv = viewMatrix * vec4(c, 1.0);
        mv.xy += position.xy * 2500.0 * 0.62;
        vUv = position.xy;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        // the sliver: what is left of one disc when another, a little aside, is taken from it
        float R = 0.036;
        vec2 q = vUv;
        float d1 = length(q) - R;
        float d2 = length(q - vec2(-0.016, 0.012)) - R * 0.97;
        float aa = 0.0016;
        float moon = (1.0 - smoothstep(-aa, aa, d1)) * smoothstep(-aa, aa, d2);
        // the dark of it, just seen
        float ash = (1.0 - smoothstep(-aa, aa, d1)) * 0.05;
        float ang = atan(vUv.y, vUv.x);
        // rays: many, fine, straight, of different lengths, each a row of chalk strokes; they turn so slowly it is only felt
        float a2 = ang + uTime * 0.004;
        float cell = a2 / 6.2832 * 110.0;
        float id = floor(cell);
        float h = fract(sin(id * 12.9898) * 43758.5453);
        float lat = abs(fract(cell) - 0.5);
        float reach = mix(0.22, 0.98, h * h);
        float stroke = 0.5 + 0.5 * sin(r * 130.0 + h * 40.0 - uTime * 0.25);
        float ray = (1.0 - smoothstep(0.1, 0.3, lat)) * smoothstep(0.06, 0.1, r) * (1.0 - smoothstep(reach * 0.45, reach, r)) * (0.45 + 0.55 * stroke);
        float glow = exp(-r * r * 260.0) * 0.5 + exp(-r * 9.0) * 0.16 + exp(-r * 3.0) * 0.05;
        vec3 pale = vec3(1.0, 0.93, 0.72);
        vec3 cold = vec3(0.34, 0.6, 0.72);
        vec3 col = pale * (moon * 5.0 + ash) + mix(cold, pale, exp(-r * 6.0)) * (ray * 0.3 + glow);
        float edge = 1.0 - smoothstep(0.82, 1.0, r);
        gl_FragColor = vec4(col * edge * (1.0 + uPulse * 0.3), 1.0);
        ${END}
      }`,
  });
}

// The sky is pastel on toothed paper: long slanting strokes of a lighter and a darker blue laid over the night,
// the grain of the paper showing through. A shell round the eye, behind everything.
function makeSkyGrainMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        vec3 d = normalize(vDir);
        float az = atan(d.x, -d.z);
        float el = asin(clamp(d.y, -1.0, 1.0));
        // the strokes: slanting, long, laid in two passes of the chalk; and the paper's tooth
        vec2 p = vec2(az * 60.0 + el * 44.0, el * 60.0 - az * 9.0);
        float s1 = vnoise(vec2(p.x * 1.0, p.y * 0.06));
        float s2 = vnoise(vec2((az * 60.0 - el * 70.0) * 0.55, (el * 60.0 + az * 20.0) * 0.045) + 9.0);
        float tooth = vnoise(vec2(az, el) * 520.0) * 0.6 + vnoise(vec2(az, el) * 1300.0 + 3.0) * 0.4;
        float n = s1 * 0.5 + s2 * 0.3 + tooth * 0.2;
        float light = smoothstep(0.52, 0.8, n);
        float dark = smoothstep(0.46, 0.2, n);
        float up = smoothstep(-0.05, 0.12, d.y);
        vec3 col = mix(vec3(0.0, 0.004, 0.03), uUpper * 2.3 + vec3(0.0, 0.012, 0.03), step(dark, light));
        gl_FragColor = vec4(col, max(light * 0.34, dark * 0.3) * up);
        ${END}
      }`,
  });
}

export default function FuneralWorld({ props }: { props: WorldProps }) {
  const shell = useRef<THREE.Mesh>(null);
  const b = useDisposable(() => {
    const L = funeralLand();
    const r = rng(1903);
    const rock = buildFuneralRock(props.mobile);
    const souls = buildSouls(props.mobile, props.effects);
    const cyp = L.cyp.map((c, i) => cypress(c.x, c.y, c.z, c.h, 3 + i * 5.7));

    const glows: Halo[] = [];
    const halos: Halo[] = [];
    // the light inside the cave, and what of it comes out over the pass
    const m = L.pts[L.iMouth];
    const my = L.y[L.iMouth];
    const mt = L.tan[L.iMouth];
    glows.push({ p: [m.x + mt[0] * 30, my + 20, m.z + mt[1] * 30], size: 40, col: [1, 0.7, 0.32], k: 0.22 });
    glows.push({ p: [m.x - mt[0] * 4, my + 22, m.z - mt[1] * 4], size: 90, col: [0.9, 0.6, 0.28], k: 0.05 });
    const e = L.pts[L.iEnd];
    halos.push({ p: [e.x, L.y[L.iEnd] + 16, e.z], size: 26, col: [1, 0.84, 0.5], k: 0.9 });
    // a glow over each turn of the road, where the crowd is densest to the eye
    for (const i of [L.iPass - 150, L.iPass - 320, L.iPass - 470]) {
      if (i < 0) continue;
      glows.push({ p: [L.pts[i].x, L.y[i] + 10, L.pts[i].z], size: 150, col: [1, 0.72, 0.32], k: 0.035 });
    }

    // mist: lying in the valleys under the road, pouring slowly over the pass, hanging in the abyss
    const puffs: Puff[] = [];
    const nP = props.mobile ? 60 : 150;
    for (let i = 0; i < nP; i++) {
      const x = (r() - 0.5) * 2400;
      const z = 100 + (r() - 0.5) * 2400;
      const g = L.ground(x, z);
      if (g > 120) continue;
      puffs.push({ p: [x, Math.max(g, 0) + 14 + r() * 40, z], size: 120 + r() * 200, a: 0.22 });
    }
    for (let i = 0; i < 14; i++) {
      const j = L.iPass - 20 + Math.floor(r() * 50);
      const side = (r() - 0.5) * 90;
      puffs.push({ p: [L.pts[j].x - L.tan[j][1] * side, L.y[j] + 6 + r() * 26, L.pts[j].z + L.tan[j][0] * side], size: 40 + r() * 50, a: 0.3 });
    }

    // wayside shrines (koplytstulpiai) at the outside of each turn of the road and at the pass: a tall post, a
    // small roofed box at its head with a candle in it, a cross over it; the crowd goes by under them
    const shrines = new Kit();
    const wood: V3 = [0.012, 0.014, 0.04];
    for (const i of [L.iPass - 380, L.iPass - 228, L.iPass - 80, L.iPass + 6]) {
      if (i < 12) continue;
      const cx = (L.pts[i - 12].x + L.pts[Math.min(L.N - 1, i + 12)].x) / 2 - L.pts[i].x;
      const cz = (L.pts[i - 12].z + L.pts[Math.min(L.N - 1, i + 12)].z) / 2 - L.pts[i].z;
      const cl = Math.hypot(cx, cz);
      // (at the pass, where the road runs straight, it stands on the right)
      const ox = cl > 1.5 ? -cx / cl : -L.tan[i][1];
      const oz = cl > 1.5 ? -cz / cl : L.tan[i][0];
      const x = L.pts[i].x + ox * (ROAD_W / 2 - 0.9);
      const z = L.pts[i].z + oz * (ROAD_W / 2 - 0.9);
      const y = L.y[i];
      const yaw = Math.atan2(ox, oz);
      shrines.box(0.42, 7.2, 0.42, [x, y + 3.6, z], wood, { rot: [0, yaw, 0] });
      shrines.box(1.3, 1.25, 1.1, [x, y + 7.7, z], wood, { rot: [0, yaw, 0], top: [0.03, 0.035, 0.09] });
      shrines.box(0.9, 0.8, 0.12, [x - ox * 0.52, y + 7.66, z - oz * 0.52], [1.0, 0.72, 0.3], { rot: [0, yaw, 0], glow: 1.3 });
      shrines.add(new THREE.ConeGeometry(1.25, 1.0, 4), [x, y + 8.8, z], wood, { rot: [0, yaw + Math.PI / 4, 0] });
      shrines.box(0.1, 1.2, 0.1, [x, y + 9.8, z], wood);
      shrines.box(0.62, 0.1, 0.1, [x, y + 9.9, z], wood, { rot: [0, yaw + Math.PI / 2, 0] });
      halos.push({ p: [x - ox * 0.7, y + 7.66, z - oz * 0.7], size: 2.6, col: [1, 0.74, 0.34], k: 0.7 });
      glows.push({ p: [x - ox * 1.6, y + 6.5, z - oz * 1.6], size: 16, col: [1, 0.7, 0.3], k: 0.12 });
    }

    // a sea of cloud far off and far below the walls, row on row of small rounded forms going out to the edge
    // of sight, the moon's light along one side of each: the depth of the night
    const clouds: PaintedCloud[] = [];
    for (let i = 0; i < (props.mobile ? 60 : 150); i++) {
      const a = r() * Math.PI * 2;
      const d = 1300 + Math.pow(r(), 0.8) * 1200;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d + 100;
      const y = 70 + r() * 150 + (d - 1300) * 0.08;
      if (L.ground(x, z) > y - 30) continue;
      clouds.push({ p: [x, y, z], w: 130 + r() * 200 + (d - 1300) * 0.06, seed: r() });
    }

    // sparks of the lights they carry, drifting up off the crowd
    const motes = pointsGeometry(
      props.mobile ? 500 : 1400,
      (i, q) => {
        const j = Math.floor(q() * L.iMouth);
        const lat = (q() - 0.5) * (ROAD_W + 10);
        const up = q();
        return [L.pts[j].x - L.tan[j][1] * lat, L.y[j] + 2.4 + up * up * 26, L.pts[j].z + L.tan[j][0] * lat, 0.5 + q() * 1.3];
      },
      77,
    );

    // dark birds, far off and high, wheeling slowly across the moon's side of the sky
    const flocks: Flock[] = [
      { c: [420, 520, -240], r: 240, n: 26, size: 2.6, speed: 7 },
      { c: [-240, 620, -420], r: 300, n: 18, size: 2.4, speed: 6 },
    ];

    return {
      rock,
      souls,
      cyp,
      rockMat: makeRockMaterial(),
      ledgeMat: makeLedgeMaterial(),
      caveMat: makeLedgeMaterial(),
      tempera: makeTempera({ amb: 1.0, key: 0.25, rim: [0.008, 0.05, 0.055], rimPow: 4, grain: 1.0 }),
      moonMat: makeMoonMaterial(),
      grainMat: makeSkyGrainMaterial(),
      quad: new THREE.PlaneGeometry(2, 2),
      shellGeo: new THREE.SphereGeometry(2650, 40, 20),
      motes,
      moteMat: makePoints({ a: [1, 0.72, 0.3], b: [1, 0.92, 0.66], scale: 110, drift: 1.8, gain: 0.55, max: 9 }),
      glows,
      halos,
      puffs,
      flocks,
      clouds,
      shrines: shrines.build(),
      shrineMat: makeTempera({ amb: 1.0, key: 0.3, rim: [0.4, 0.26, 0.08], rimPow: 3.2 }),
    };
  }, [props.mobile, props.effects > 0.5]);
  useFrame(({ camera }) => {
    // made ready ahead of time, it waits
    if (voyage.cur !== "funeral") return;
    b.souls.update(camera);
    shell.current?.position.copy(camera.position).sub(ORIGIN);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __funeral?: unknown }).__funeral = b.souls.stats;
  });
  return (
    <>
      <WorldBase id="funeral" def={def} pal={FUNERAL_PAL} props={props} grass={false} ground={false} arch={false} pathTint={[1, 0.86, 0.56]} pathGain={0.4} angels={false} marks={false} />
      <mesh ref={shell} geometry={b.shellGeo} material={b.grainMat} frustumCulled={false} renderOrder={-9} />
      <mesh geometry={b.quad} material={b.moonMat} frustumCulled={false} renderOrder={-8} />
      <mesh geometry={b.rock.land} material={b.rockMat} renderOrder={-5} />
      <mesh geometry={b.rock.ledge} material={b.ledgeMat} />
      <mesh geometry={b.rock.cave} material={b.caveMat} />
      {b.cyp.map((g, i) => (
        <mesh key={i} geometry={g} material={b.tempera} />
      ))}
      <primitive object={b.souls.group} />
      <primitive object={b.souls.bierMesh} />
      <primitive object={b.souls.lampMesh} />
      <mesh geometry={b.shrines} material={b.shrineMat} />
      <PaintedClouds list={b.clouds} warm={[0.16, 0.24, 0.5]} shade={[0.03, 0.05, 0.16]} hi={[0.42, 0.56, 0.8]} order={1} />
      <points geometry={b.motes} material={b.moteMat} />
      <Birds flocks={b.flocks} tint={[0.004, 0.008, 0.03]} seed={19} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
