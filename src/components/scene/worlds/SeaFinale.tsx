"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, WORLD_U, makeTempera, rng, type GroundPalette, type Puff, type V3 } from "./kit";
import { Birds, type Flock } from "./life";
import { greatSunMaterial } from "./sun/life";
import { useMoment } from "./moments";
import { makeCloudPaint, paintedCloudGeometry, type PCloud } from "./stars/forms";
import { SKY_U, airState, mixSky, type SkyState } from "../sky";
import { ORIGIN, WORLDS, pathOf, voyage } from "./voyage";
import { useDeepLens } from "./fairy/shared";
import { FINALE_U, buildCrest, buildSea, buildSpray, makeCrashMaterial, makeCrestMaterial, makeRainMaterial, makeSeaMaterial, makeSprayMaterial, signTexture } from "./seafinale/ocean";
import { SHIPS, bodyAt, onFace, swellAt, swellDamp } from "./seafinale/shape";

// Sonata of the Sea. Finale (Jūros sonata. Finale, 1908). One colossal green wave rearing over the whole
// picture and curling forward, its crest breaking into fingers of foam like lace; small sailing ships riding
// the band of foam at its foot; green and amber water with strings of bubbles like beads of amber (and, in the
// foam of the face, his initials); a pale warm sky in level bands.
//
// Here the wave is three hundred metres high and more than a kilometre long, bowed like an arm round whoever
// comes toward it, and the sun stands low behind it so its upper water is lit from within. The plane comes in
// low over a running swell with the whole wave ahead and the ships small on its lower slope; goes round to the
// left and along the face, climbing, the crest curling overhead and its fingers hanging between the plane and
// the open sea; and at the wave's far end goes out through that hanging lace into calm.

// The whole flight is one build: the plane comes out over a quiet sea in gentle weather; far off the water begins
// to stand up, and it keeps coming, higher and higher, until it is a wall seven hundred metres tall with its crest
// curling over; as it builds the weather turns: dark cloud rolls in over it, the sea begins to run, rain comes in
// long slanting strokes, the cloud is lit from within; and at the end, under the curl, the crest comes down on the
// plane in foam and light, and that is the way on. Everything is driven by how far along its way the plane has
// come (never back), so the drawn wave is at its full height before the way reaches its face.
const def = WORLDS.seafinale;
// the height of the storm: umber-black cloud, a low band of sick gold under it, the wave still lit through from behind
const STORM = airState({
  label: "Sonata of the Sea: Finale",
  zenith: [0.016, 0.015, 0.02],
  upper: [0.06, 0.052, 0.05],
  horizon: [0.2, 0.16, 0.09],
  glow: [0.95, 0.7, 0.3],
  amb: [0.2, 0.21, 0.17],
  key: [1.0, 0.84, 0.5],
  keyI: 1.05,
  sunAz: -4,
  sunEl: 10,
  keyAz: -4,
  keyEl: 16,
  cloudLit: [0.3, 0.26, 0.2],
  cloudShade: [0.06, 0.06, 0.07],
  night: 0.15,
  exposure: 0.92,
  fx: [0.0, 0.3, 0.0, 0],
});
const storm = { k: 0, keyK: -1, sky: null as SkyState | null };
const sm = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b);
export const FINALE_PAL: GroundPalette = { a: [0.1, 0.2, 0.1], b: [0.2, 0.22, 0.1], c: [0.08, 0.16, 0.1] };

// a small ship as he drew them: a dark hull, a mast, two pale sails with a drawn edge, a pennant
function shipGeometry() {
  const k = new Kit();
  const hull: V3 = [0.012, 0.016, 0.04];
  // the hull: a long pointed bowl, flat on top
  const h = new THREE.SphereGeometry(1, 18, 10);
  const p = h.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    // sharper at the bow than the stern, the sheer rising to both
    const ends = Math.pow(Math.abs(x), 2.2);
    p.setXYZ(i, x * (x > 0 ? 1.12 : 0.94), Math.min(y, 0.18) + ends * 0.36 + (y > 0.18 ? 0 : 0), p.getZ(i) * (1 - 0.72 * ends));
  }
  k.add(h, [0, 0.6, 0], hull, { scale: [8.4, 2.3, 2.5], top: [0.03, 0.04, 0.085] });
  // a pale line along the gunwale
  k.box(15.4, 0.14, 0.14, [0.3, 1.36, 1.5], [0.6, 0.52, 0.34]);
  k.box(15.4, 0.14, 0.14, [0.3, 1.36, -1.5], [0.6, 0.52, 0.34]);
  const wood: V3 = [0.05, 0.035, 0.03];
  k.add(new THREE.CylinderGeometry(0.1, 0.17, 17, 6), [0.6, 9.4, 0], wood);
  k.add(new THREE.CylinderGeometry(0.07, 0.09, 12.5, 5), [0.9, 3.0, 0], wood, { rot: [0, 0, Math.PI / 2 - 0.04] });
  // sails: bellied a little, cream, each edged with a dark drawn line
  const sail = (pts: V3[], belly: number, dark: boolean) => {
    const g = new THREE.BufferGeometry();
    const N = 8;
    const pos: number[] = [];
    const idx: number[] = [];
    const [a, b, c] = pts.map((q) => new THREE.Vector3(...q));
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N - i; j++) {
        const u = i / N;
        const v = j / N;
        const q = a
          .clone()
          .multiplyScalar(1 - u - v)
          .addScaledVector(b, u)
          .addScaledVector(c, v);
        q.z += belly * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v + 0.2)) + belly * 16 * u * v * (1 - u - v);
        pos.push(q.x, q.y, q.z);
      }
    const at = (i: number, j: number) => {
      let o = 0;
      for (let q = 0; q < i; q++) o += N - q + 1;
      return o + j;
    };
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N - i; j++) {
        idx.push(at(i, j), at(i + 1, j), at(i, j + 1));
        if (j < N - i - 1) idx.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
      }
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    k.add(g, [0, 0, 0], dark ? [0.014, 0.018, 0.05] : [0.8, 0.72, 0.5], { top: dark ? [0.03, 0.04, 0.1] : [0.96, 0.9, 0.7], glow: dark ? 0 : 0.04 });
    k.tube([pts[0], pts[1], pts[2], pts[0]], 0.07, dark ? [0.5, 0.42, 0.26] : [0.05, 0.04, 0.05], { seg: 30, sides: 4 });
  };
  sail(
    [
      [0.9, 3.1, 0],
      [0.75, 17.4, 0],
      [-6.6, 3.2, 0],
    ],
    1.5,
    true,
  );
  sail(
    [
      [1.0, 4.2, 0],
      [0.8, 15.2, 0],
      [7.7, 2.5, 0],
    ],
    1.1,
    false,
  );
  // the pennant at the masthead
  k.box(1.9, 0.34, 0.03, [-0.4, 17.9, 0], [0.7, 0.2, 0.12], { glow: 0.1 });
  return k.build();
}

export default function SeaFinaleWorld({ props }: { props: WorldProps }) {
  // (the near plane at arm's length while this world is flown: far surfaces do not shimmer)
  useDeepLens("seafinale");
  const ships = useRef<(THREE.Mesh | null)[]>([]);
  const b = useDisposable(() => {
    const r = rng(1908);
    const crest = buildCrest(props.mobile);
    const sign = signTexture();
    // spray haze: where the crest's water comes down, along the wave's foot, and far out where the sea meets the sky
    const puffs: Puff[] = [];
    for (let i = 0; i < (props.mobile ? 12 : 26); i++) {
      const s = -780 + r() * 1560;
      const [x, z] = onFace(s, 1.25 + r() * 0.3);
      puffs.push({ p: [x, 10 + r() * 40, z], size: 40 + r() * 60, a: 0.16 });
    }
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + r() * 0.2;
      const d = 1700 + r() * 600;
      puffs.push({ p: [Math.cos(a) * d, 10 + r() * 20, 100 + Math.sin(a) * d], size: 280 + r() * 240, a: 0.25 });
    }
    // gentle weather: a few soft painted cumulus far off in level rows (each one soft form, lit on the sun's side)
    const calm: PCloud[] = [];
    for (let row = 0; row < (props.mobile ? 3 : 5); row++) {
      const d = 2300 + row * 420;
      const per = props.mobile ? 6 : 9;
      for (let i = 0; i < per; i++) {
        const a = -Math.PI * 0.5 + ((i + r() * 0.7) / per - 0.5) * Math.PI * 1.8;
        calm.push({ p: [Math.cos(a) * d, 520 + row * 190 + r() * 90, -300 + Math.sin(a) * d], w: 260 + r() * 300 + row * 40, seed: r() });
      }
    }
    // the storm: a deck of dark cloud, great banks of it, that rolls in over the wave from behind as it rears
    const deck: PCloud[] = [];
    for (let i = 0; i < (props.mobile ? 40 : 84); i++) {
      const x = (r() - 0.5) * 6400;
      const z = 1900 - r() * 5200;
      deck.push({ p: [x, 1120 + r() * r() * 620 + Math.abs(x) * 0.03, z], w: 520 + r() * 700, seed: r() });
    }
    // white birds low over the swell, and a skein high over the crest
    const flocks: Flock[] = [
      // (small against the face, half way up it: the measure of the wave)
      { c: [-120, 150, -90], r: 230, n: props.mobile ? 12 : 24, size: 1.5, speed: 10 },
      { c: [260, 230, -180], r: 170, n: props.mobile ? 8 : 16, size: 1.4, speed: 9 },
      { c: [120, 46, 330], r: 150, n: 14, size: 1.5, speed: 11 },
      { c: [-220, 70, 250], r: 190, n: 10, size: 1.4, speed: 10 },
      { c: [-60, 470, -260], r: 300, n: 18, size: 2.2, speed: 9 },
    ];
    return {
      sea: buildSea(props.mobile),
      seaMat: makeSeaMaterial(sign),
      sign,
      crest: crest.geo,
      crestMat: makeCrestMaterial(),
      spray: buildSpray(crest.tips, props.mobile ? 1400 : Math.round(2600 + 2400 * props.effects)),
      sprayMat: makeSprayMaterial(),
      ship: shipGeometry(),
      shipMat: makeTempera({ amb: 1.0, key: 0.45, rim: [0.5, 0.4, 0.16], rimPow: 3, wrap: 0.5 }),
      puffs,
      calm: paintedCloudGeometry(calm, [300, 20, 1360]),
      calmMat: makeCloudPaint({ lit: [1.5, 1.32, 0.98], shade: [1.25, 1.05, 0.8], under: [0.95, 0.84, 0.78], rim: 0.8, amb: 1.6, key: 0.6, air: 0.6, fade: [3600, 5200], near: [200, 600] }),
      deck: paintedCloudGeometry(deck, [0, 20, 300]),
      deckMat: makeCloudPaint({ lit: [0.36, 0.31, 0.27], shade: [0.17, 0.155, 0.17], under: [0.075, 0.07, 0.09], rim: 0.5, amb: 1.0, key: 0.35, air: 0.5, fade: [3000, 4300], near: [200, 700] }),
      rain: new THREE.CylinderGeometry(70, 70, 170, 48, 1, true),
      rainMat: makeRainMaterial(),
      sunMat: greatSunMaterial({ size: 0.46, tint: [1, 0.78, 0.34], rays: 26, gain: 0.38 }),
      crashGeo: new THREE.SphereGeometry(6, 24, 16),
      crashMat: makeCrashMaterial(),
      flocks,
    };
  }, [props.mobile, props.effects > 0.5]);
  const tmp = useRef({ up: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), m: new THREE.Matrix4() });
  // The timeline. p: how far along its way the plane has come (0..1, never back).
  const ev = useRef({ on: false, p: 0, flash: 0 });
  const deckRef = useRef<THREE.Group>(null);
  const rainRef = useRef<THREE.Mesh>(null);
  const crashRef = useRef<THREE.Mesh>(null);
  // sheet lightning: now and then, once the storm is up, the cloud is lit from within (a moment that comes again)
  const bolt = useMoment("seafinale", { id: "finale-lightning", after: 14, ease: 0.12, hold: 0.1, out: 0.9, again: 6.5 });
  useEffect(() => {
    voyage.skyMod = (sky) => {
      if (voyage.cur !== "seafinale" || storm.k <= 0.004) return sky;
      const q = Math.round(storm.k * 120) / 120;
      if (q !== storm.keyK || !storm.sky) {
        storm.keyK = q;
        storm.sky = mixSky(sky, STORM, q * q * (3 - 2 * q));
      }
      return storm.sky;
    };
    return () => {
      voyage.skyMod = null;
      Object.assign(storm, { k: 0, keyK: -1, sky: null });
      Object.assign(FINALE_U.uRise, { value: 1 });
      FINALE_U.uSwell.value = 1;
      FINALE_U.uCrash.value = 0;
      FINALE_U.uStorm.value = 0;
    };
  }, []);
  useFrame(({ camera }) => {
    const e = ev.current;
    if (voyage.cur !== "seafinale") {
      e.on = false;
      return;
    }
    const t = SKY_U.uTime.value;
    if (!e.on) {
      e.on = true;
      e.p = 0;
    }
    // where on its way the eye is: the nearest of the path's own points
    {
      const pts = pathOf("seafinale").pts;
      const x = camera.position.x - ORIGIN.x;
      const z = camera.position.z - ORIGIN.z;
      let best = 0;
      let bd = 1e12;
      for (let i = 0; i < pts.length; i += 2) {
        const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (bd < 400 * 400) e.p = Math.max(e.p, best / (pts.length - 1));
    }
    const p = e.p;
    // the wave: nothing but a long low swell on the horizon, then rearing all the way in; full before the face
    const rise = 0.035 + 0.965 * Math.pow(sm(p, 0.07, 0.42), 1.5);
    // the weather: gentle, then turning as the wave stands up, at its height along the face
    const k = sm(p, 0.1, 0.5);
    // the end: the crest comes down over the last of the way
    const crash = sm(p, 0.9, 0.985);
    storm.k = k;
    FINALE_U.uRise.value = rise;
    FINALE_U.uStorm.value = k;
    FINALE_U.uSwell.value = 0.4 + 1.5 * k;
    FINALE_U.uCrash.value = crash;
    WORLD_U.uFogD.value = def.fog[0] * (1 + 2.2 * k);
    // the deck of cloud rolls in from behind the wave and comes down a little
    if (deckRef.current) deckRef.current.position.set(0, 260 * (1 - k), -5600 * (1 - sm(k, 0, 0.85)));
    // lit from within, softly, and never bright
    b.deckMat.uniforms.uSelf.value = 0.26 * bolt.k.value * sm(k, 0.5, 0.8);
    // (the sun goes in behind the weather)
    b.sunMat.uniforms.uGain.value = 0.26 * (1 - 0.8 * k);
    const eye: V3 = [camera.position.x - ORIGIN.x, camera.position.y - ORIGIN.y, camera.position.z - ORIGIN.z];
    rainRef.current?.position.set(eye[0], eye[1] + 20, eye[2]);
    crashRef.current?.position.set(eye[0], eye[1], eye[2]);
    const cu = 0;
    void cu;
    // one ship works her way right up the face as the wave stands, hangs under the crest, and is thrown back
    const crestK = sm(p, 0.42, 0.62) * (1 - sm(p, 0.74, 0.9));
    const { up, fwd, right, m } = tmp.current;
    // the ships ride the water that is drawn: lifted and tilted by the swell and by the slope of the wave, each
    // working slowly up the face and slipping back
    const h = (x: number, z: number) => {
      const body = bodyAt(x, z);
      return body * rise + swellAt(x, z, t) * swellDamp(body * rise) * FINALE_U.uSwell.value;
    };
    SHIPS.forEach(([s0, f0, yaw, size], i) => {
      const mesh = ships.current[i];
      if (!mesh) return;
      // (the fifth is the one that crests the wave)
      const [x0, z0] = onFace(s0, i === 4 ? f0 - (f0 - 0.72) * crestK : f0);
      const climb = 26 * Math.sin(t * 0.05 + i * 1.7) * (i === 4 ? 1 - crestK : 1);
      const x = x0 + Math.sin(t * 0.031 + i) * 8;
      const z = z0 - climb;
      const y = h(x, z);
      const e = 5;
      up.set(y - h(x + e, z), e * 1.6, y - h(x, z + e)).normalize();
      // heading: as set, working a little as she goes; and a roll of her own
      const a = yaw + Math.sin(t * 0.23 + i * 2.1) * 0.12;
      fwd.set(Math.cos(a), 0, -Math.sin(a));
      right.crossVectors(fwd, up).normalize();
      fwd.crossVectors(up, right).normalize();
      m.makeBasis(fwd, up, right);
      mesh.quaternion.setFromRotationMatrix(m);
      // (tossed harder as the storm comes up)
      mesh.rotateX(Math.sin(t * 0.7 + i * 1.3) * (0.07 + 0.2 * k) + 0.1);
      mesh.rotateZ(Math.sin(t * 0.53 + i * 2.2) * 0.16 * k);
      mesh.position.set(x, y - 0.5 * size, z);
      mesh.scale.setScalar(size);
    });
  });
  return (
    <>
      <WorldBase id="seafinale" def={def} pal={FINALE_PAL} props={props} grass={false} ground={false} arch={false} pathTint={[1, 0.9, 0.6]} pathGain={0.3} angels={false} marks={false} />
      {/* (hung beyond the wave, which is further off than the shared sun stands) */}
      <mesh material={b.sunMat} frustumCulled={false} renderOrder={-4}>
        <planeGeometry args={[2, 2]} />
      </mesh>
      <mesh geometry={b.calm} material={b.calmMat} frustumCulled={false} renderOrder={-3} />
      <group ref={deckRef}>
        <mesh geometry={b.deck} material={b.deckMat} frustumCulled={false} renderOrder={-3} />
      </group>
      <mesh geometry={b.sea} material={b.seaMat} frustumCulled={false} renderOrder={-4} />
      <mesh geometry={b.crest} material={b.crestMat} />
      <points geometry={b.spray} material={b.sprayMat} renderOrder={4} />
      {SHIPS.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            ships.current[i] = el;
          }}
          geometry={b.ship}
          material={b.shipMat}
        />
      ))}
      <Birds flocks={b.flocks} tint={[0.95, 0.9, 0.78]} seed={8} lit />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <mesh ref={rainRef} geometry={b.rain} material={b.rainMat} frustumCulled={false} renderOrder={8} />
      <mesh ref={crashRef} geometry={b.crashGeo} material={b.crashMat} frustumCulled={false} renderOrder={30} />
    </>
  );
}
