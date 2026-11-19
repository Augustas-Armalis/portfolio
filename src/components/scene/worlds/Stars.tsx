"use client";

import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { Halos, WorldBase, useDisposable, type WorldProps } from "./common";
import { GLSL_AIR, Kit, WORLD_U, angel, makePoints, makeTempera, pointsGeometry, rng, type GroundPalette, type Halo, type V3 } from "./kit";
import { WORLDS, groundAt } from "./voyage";

// Sonata of the Stars (Allegro and Andante, 1908). Deep night over a land
// that is itself a score: long waves of ochre, umber, dusty green and blue.
// In the middle of it a pyramid of light stands as tall as the sky, a veil
// with slow waves crossing it; at its point, on a pale disc, an angel with
// wings raised. A river of stars runs level across the whole sky behind it,
// and the path of light climbs up into that river. Thin golden strings hang
// from the dark, amber worlds threaded on them; long pale waves cross the
// air like staves. Off to the left lies the great glassy globe of the
// Andante, a band of stars wound round it.

const def = WORLDS.stars;
export const STARS_PAL: GroundPalette = { a: [0.4, 0.28, 0.11], b: [0.17, 0.095, 0.05], c: [0.17, 0.23, 0.15], high: [0.05, 0.075, 0.24], bands: 0.92 };

export const PYR = { x: 0, z: -90, half: 150, h: 340 };
export const RIVER = { y: 190, z: -250 };
export const GLOBE = { x: -250, z: 90, r: 96 };

// a veil of light: what the pyramid and the globe are made of
function makeVeil(o: { kind: "pyramid" | "globe"; h: number; a: V3; b: V3; alpha: number }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, uH: { value: o.h }, uA: { value: new THREE.Color(...o.a) }, uB: { value: new THREE.Color(...o.b) }, uAlpha: { value: o.alpha } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uH; uniform vec3 uA; uniform vec3 uB; uniform float uAlpha;
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float t = clamp(vLocal.y / uH, 0.0, 1.0);
        // slow waves crossing it, wider low down and closer together toward the top
        float warp = vnoise(vLocal.xz * 0.012 + uTime * 0.01) * 5.0 + sin(vLocal.x * 0.02 + vLocal.z * 0.016 + uTime * 0.07) * 1.4;
        float w1 = sin(vLocal.y * ${o.kind === "pyramid" ? "0.07" : "0.09"} * (1.0 + t * 0.8) + warp);
        float w2 = sin(vLocal.y * 0.19 + warp * 1.7 + 2.0);
        float band = smoothstep(-0.3, 0.85, w1 * 0.7 + w2 * 0.3);
        float fres = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);
        vec3 col = mix(uA, uB, band) * (0.5 + 0.9 * ${o.kind === "pyramid" ? "t" : "(0.4 + 0.6 * band)"});
        float a = uAlpha * (0.45 + 0.75 * band) + fres * 0.3;
        ${o.kind === "pyramid" ? "a *= 0.55 + 0.6 * t; a *= smoothstep(0.0, 0.05, t);" : ""}
        // seen from inside it is all around you: keep it thin there
        float dist = length(vWorld - cameraPosition);
        a *= smoothstep(4.0, 60.0, dist);
        a *= 1.0 - airAmt(vWorld) * 0.6;
        gl_FragColor = vec4(col * (1.0 + uPulse * 0.5), clamp(a, 0.0, 0.85));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export default function StarsWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const r = rng(1908);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const k = new Kit();
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const gold: V3 = [1.0, 0.8, 0.42];

    // the pyramid: two veils, one inside the other
    const py0 = g(PYR.x, PYR.z) - 6;
    const pyr = new THREE.ConeGeometry(PYR.half * Math.SQRT2, PYR.h, 4, 40, true);
    pyr.translate(0, PYR.h / 2, 0);
    pyr.rotateY(Math.PI / 4);
    const pyrIn = new THREE.ConeGeometry(PYR.half * 0.6 * Math.SQRT2, PYR.h * 0.94, 4, 24, true);
    pyrIn.translate(0, (PYR.h * 0.94) / 2, 0);
    pyrIn.rotateY(Math.PI / 4);
    // the angel at its point, on a pale disc, and the light that falls from it
    const tip = py0 + PYR.h;
    k.add(new THREE.CylinderGeometry(20, 20, 1.2, 40), [PYR.x, tip - 9, PYR.z], [1, 0.9, 0.66], { glow: 1.5, rot: [Math.PI / 2, 0, 0] });
    angel(k, [PYR.x, tip - 4, PYR.z + 1.5], 17, 0, [0.96, 0.9, 0.76], { glow: 0.9, open: 0.42 });
    glows.push({ p: [PYR.x, tip + 4, PYR.z + 2], size: 120, col: [1, 0.84, 0.5], k: 0.75 });
    halos.push({ p: [PYR.x, tip + 26, PYR.z + 2], size: 12, col: [1, 0.92, 0.7], k: 1.6 });

    // golden strings from the dark, amber worlds threaded on them
    const strings = props.mobile ? 7 : 12;
    for (let i = 0; i < strings; i++) {
      const a = (i / strings) * Math.PI * 2 + 0.4;
      const d = 180 + (i % 3) * 110 + r() * 40;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d - 60;
      const y0 = g(x, z);
      k.box(0.55, 520, 0.55, [x, y0 + 260, z], [0.95, 0.74, 0.34], { glow: 1.1 });
      const n = 2 + Math.floor(r() * 3);
      for (let j = 0; j < n; j++) {
        const y = y0 + 30 + r() * 230;
        const rad = 3 + r() * 5.5;
        const warm = r() < 0.6;
        const col: V3 = warm ? [0.9, 0.42, 0.14] : [0.72, 0.56, 0.24];
        k.add(new THREE.SphereGeometry(rad, 18, 12), [x, y, z], col, { glow: 0.9, top: [1, 0.72, 0.36] });
        glows.push({ p: [x, y, z], size: rad * 4.5, col: warm ? [1, 0.5, 0.2] : [1, 0.8, 0.4], k: 0.7 });
      }
    }
    // long pale waves crossing the air, like staves
    const waves = props.mobile ? 5 : 9;
    for (let w = 0; w < waves; w++) {
      const y = 46 + w * 31 + r() * 12;
      const z = 260 - w * 78 + r() * 30;
      const amp = 7 + r() * 9;
      const pts: V3[] = [];
      for (let i = 0; i <= 44; i++) {
        const x = -660 + i * 30;
        pts.push([x, y + Math.sin(i * 0.52 + w * 1.7) * amp + Math.sin(i * 0.17 + w) * amp * 1.4, z + Math.cos(i * 0.31 + w) * 22]);
      }
      const green = w % 3 === 1;
      k.tube(pts, 0.7 + (w % 2) * 0.35, green ? [0.5, 0.66, 0.5] : [0.82, 0.72, 0.46], { glow: 0.75, seg: 220, sides: 5 });
    }
    // two small pyramids far off, as at the top of the picture
    const far = new Kit();
    for (const [x, z, s] of [
      [330, -560, 1],
      [-380, -600, 0.8],
    ]) {
      const c = new THREE.ConeGeometry(80 * s, 190 * s, 4, 1, true);
      c.rotateY(Math.PI / 4);
      far.add(c, [x, g(x, z) + 95 * s - 6, z], [0.3, 0.24, 0.14], { top: [0.9, 0.76, 0.46], glow: 0.5 });
    }

    // the river of stars: level across the whole sky, densest along its middle
    const nRiver = props.mobile ? 1500 : Math.round(2600 + 2600 * props.effects);
    const river = pointsGeometry(
      nRiver,
      (_, q) => {
        const x = (q() - 0.5) * 1500;
        const spread = q() + q() + q() - 1.5;
        return [x, RIVER.y + spread * 9 + Math.sin(x * 0.006) * 6, RIVER.z + (q() - 0.5) * 56 + spread * 6, 0.5 + q() * q() * 2.4];
      },
      515,
    );
    // and a dusting of them low over the waves, drifting
    const motes = pointsGeometry(props.mobile ? 300 : Math.round(900 * props.effects), (_, q) => [(q() - 0.5) * 900, 8 + q() * q() * 180, 480 - q() * 900, 0.4 + q() * 1.2], 99);

    // the globe of the Andante, sunk in the waves, and the band of stars wound round it
    const gy = g(GLOBE.x, GLOBE.z) + GLOBE.r * 0.42;
    const band: V3[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * (GLOBE.r + 5), Math.sin(a) * 10, Math.sin(a) * (GLOBE.r + 5)).applyEuler(new THREE.Euler(0.7, 0.3, 0.45));
      band.push([GLOBE.x + p.x, gy + p.y, GLOBE.z + p.z]);
    }
    k.tube(band, 5, [0.26, 0.13, 0.07], { seg: 180, sides: 8, closed: true, glow: 0.12 });
    const bandStars = pointsGeometry(
      props.mobile ? 160 : 420,
      (_, q) => {
        const a = q() * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(a) * (GLOBE.r + 5), Math.sin(a) * 10 + (q() - 0.5) * 8, Math.sin(a) * (GLOBE.r + 5)).applyEuler(new THREE.Euler(0.7, 0.3, 0.45)).multiplyScalar(1.055);
        return [GLOBE.x + p.x, gy + p.y, GLOBE.z + p.z, 0.7 + q() * 1.6];
      },
      31,
    );
    glows.push({ p: [GLOBE.x, gy, GLOBE.z], size: GLOBE.r * 2.3, col: [0.5, 0.8, 0.6], k: 0.34 });

    return {
      pyr,
      pyrIn,
      py0,
      veil: makeVeil({ kind: "pyramid", h: PYR.h, a: [0.42, 0.28, 0.12], b: [1.0, 0.84, 0.52], alpha: 0.2 }),
      veilIn: makeVeil({ kind: "pyramid", h: PYR.h * 0.94, a: [0.6, 0.42, 0.18], b: [1.0, 0.9, 0.62], alpha: 0.16 }),
      globe: new THREE.SphereGeometry(GLOBE.r, 64, 40),
      globeIn: new THREE.SphereGeometry(GLOBE.r * 0.62, 48, 30),
      gy,
      globeMat: makeVeil({ kind: "globe", h: GLOBE.r * 2, a: [0.1, 0.26, 0.24], b: [0.42, 0.66, 0.46], alpha: 0.26 }),
      globeMatIn: makeVeil({ kind: "globe", h: GLOBE.r * 1.3, a: [0.3, 0.42, 0.2], b: [0.82, 0.8, 0.44], alpha: 0.22 }),
      set: k.build(),
      far: far.build(),
      tempera: makeTempera({ amb: 1, key: 0.5 }),
      river,
      riverMat: makePoints({ a: [1.0, 0.94, 0.78], b: [0.72, 0.82, 1.0], scale: 330, gain: 1.15, max: 26, drift: 0.4 }),
      motes,
      moteMat: makePoints({ a: [1.0, 0.86, 0.5], b: [0.8, 0.88, 1.0], scale: 230, gain: 0.8, max: 16, drift: 2.2 }),
      bandStars,
      bandMat: makePoints({ a: [0.3, 0.42, 1.0], b: [0.6, 0.7, 1.0], scale: 300, gain: 1.3, max: 22 }),
      halos,
      glows,
    };
  }, [props.mobile, props.effects > 0.5]);
  return (
    <>
      <WorldBase id="stars" def={def} pal={STARS_PAL} props={props} grass={false} pathTint={[1, 0.9, 0.66]} pathGain={2.2} />
      <mesh geometry={b.set} material={b.tempera} />
      <mesh geometry={b.far} material={b.tempera} />
      <mesh geometry={b.pyrIn} material={b.veilIn} position={[PYR.x, b.py0, PYR.z]} renderOrder={2} />
      <mesh geometry={b.pyr} material={b.veil} position={[PYR.x, b.py0, PYR.z]} renderOrder={3} />
      <mesh geometry={b.globeIn} material={b.globeMatIn} position={[GLOBE.x, b.gy, GLOBE.z]} renderOrder={2} />
      <mesh geometry={b.globe} material={b.globeMat} position={[GLOBE.x, b.gy, GLOBE.z]} renderOrder={3} />
      <points geometry={b.river} material={b.riverMat} />
      <points geometry={b.motes} material={b.moteMat} />
      <points geometry={b.bandStars} material={b.bandMat} />
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
    </>
  );
}
