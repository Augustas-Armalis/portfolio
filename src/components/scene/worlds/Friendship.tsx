"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { postCtl } from "../Post";
import { SKY_U } from "../sky";
import { Gallery, Halos, LightPath, Mist, useDisposable, type WorldProps } from "./common";
import { makeTempera, type Halo, type Puff } from "./kit";
import { SunShafts } from "./fairy/shared";
import { useMoment } from "./moments";
import { portalRig } from "./portal";
import { ORIGIN, WORLDS, voyage } from "./voyage";
import { FRIEND_U, caveGeometry, makeCaveMaterial } from "./friendship/cave";
import { forestSteps, pathX, withOrb, type Forest } from "./friendship/forest";
import { makeMotesMaterial, makeOrbMaterial, makeStreaksMaterial, motesGeometry, streaksGeometry } from "./friendship/light";
import { fernGeometry, makeFernMaterial } from "./friendship/ferns";
import { makeWaterMaterial, waterGeometry } from "./friendship/water";
import { herSteps, makeHerMaterial, makeRayMotesMaterial, makeRaysMaterial, rayMotesGeometry, raysGeometry, type Her } from "./friendship/figure";
import { FRIEND_PATH, HALL, HEAD, HER_K, MODEL, ORB, TUNNEL, floorAt, herAt } from "./friendship/shape";
import { fallsGeometry, makeFallsMaterial } from "./friendship/falls";

// Friendship (Draugystė, 1906–1907). In the picture a figure in profile, her face lit gold from the orb, a crown of
// green and gold rays streaming up from her head, her body going into the dark, holds out on her open hand a pale
// orb of light; the ground is deep teal-green laid in upright strokes.
//
// Here she lives in a cave, a vast one, and the cave is a wood: the picture's upright strokes stand up as tall dark
// trunks going into the haze, roots hang from the vault, ferns and mossy stones lie on a soft misted floor, small
// mushrooms glow, shafts of light come down from far above. The plane comes in low under the trees, the orb's
// light glimpsed far off between the trunks; the wood opens through an arch of rock, and across the clearing she
// stands, colossal, sculpted in clay as the kings are (friendship/figure.ts), her hand holding the
// orb out over the way. The plane rises straight at it; in its heart is the Sonata of the Sun (worlds/portal.tsx),
// and it flies into the light and out into that world.
//
// (The wood is made a few milliseconds a frame while home is flown, by prepareFriendship, so neither the flight nor
// the crossing waits for it.)

const def = WORLDS.friendship;
// the light's strands for a gear's effects (1 at High and up)
const rayCount = (effects: number) => Math.round(720 * Math.min(1, 0.35 + 0.65 * effects));
const keyOf = (p: Pick<WorldProps, "mobile">) => (p.mobile ? "m" : "d");
// her two forms: as she is seen close, and in coarse clay for the long way in
type Figure = { near: Her; far: Her };
function* figureSteps(mobile: boolean, budget: number): Generator<void, Figure, void> {
  const near = yield* herSteps(mobile, budget);
  const far = yield* herSteps(mobile, budget, true);
  return { near, far };
}
function* allSteps(mobile: boolean, budget: number): Generator<void, { forest: Forest; figure: Figure }, void> {
  const forest = yield* forestSteps(mobile, budget);
  const figure = yield* figureSteps(mobile, budget);
  return { forest, figure };
}
let made: { key: string; forest: Forest; figure: Figure } | null = null;
export function prepareFriendship(props: Pick<WorldProps, "mobile">, budget = 4) {
  const key = keyOf(props);
  if (made && made.key !== key) dropFriendship();
  const g = made ? null : allSteps(props.mobile, budget);
  return () => {
    if (!g || made) return true;
    const r = g.next();
    if (r.done) made = { key, ...r.value };
    return !!r.done;
  };
}
function letGoForest(f: Forest) {
  for (const t of f.trees) t.geometry.dispose();
  for (const x of [f.leafy, f.stone, f.rock, f.rockMat, f.roots, f.shrooms]) x.dispose();
}
export function dropFriendship() {
  const m = made;
  made = null;
  if (m) {
    letGoForest(m.forest);
    m.figure.near.geo.dispose();
    m.figure.far.geo.dispose();
  }
}

// The light through which the plane leaves when the crossing is made under cloud (a phone, Low, the next world not
// yet ready): the cloud is the orb's own light, and lets go once the plane is out in the Sun.
let lit = false;
function letLightGo() {
  const tick = () => {
    if (!lit) return;
    if (voyage.phase === "open" || !voyage.flying) {
      lit = false;
      if (!voyage.homing) voyage.warm = 0;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// The orb's light standing in the air: spokes of it going out from the orb through the haze the whole width of the
// cavern, broad and soft, turning very slowly, never the same two together. A card that faces the eye, centred on
// the orb; added to what is behind it.
const GLORY_END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
function makeGloryMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...FRIEND_U, uTime: SKY_U.uTime, uK: { value: 1 }, uSize: { value: ORB.r * 15 } },
    vertexShader: /* glsl */ `
      uniform float uSize;
      varying vec2 vUv;
      void main(){
        vec4 mv = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += position.xy * uSize;
        vUv = position.xy;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uK; uniform float uOrbK;
      varying vec2 vUv;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      float n1(float x){ float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
      void main(){
        float r = length(vUv);
        float a = atan(vUv.y, vUv.x);
        // spokes: three sets at three widths, each turning at its own slow pace (and one the other way)
        float s = n1(a * 5.0 + uTime * 0.012) * 0.56 + n1(a * 13.0 - uTime * 0.02 + 5.0) * 0.3 + n1(a * 31.0 + uTime * 0.035 + 9.0) * 0.14;
        // (broad and soft: light standing in haze, not lines ruled on it)
        float spoke = smoothstep(0.3, 0.9, s);
        // strongest just outside the orb, dying toward the card's edge; nothing inside the orb itself
        float fall = smoothstep(0.066, 0.12, r) * pow(max(1.0 - r, 0.0), 2.2) / (0.25 + r * 3.0);
        float glow = pow(max(1.0 - r, 0.0), 6.0) * 0.22;
        vec3 col = vec3(1.0, 0.78, 0.42) * (spoke * fall * 0.085 + glow * 0.5 * smoothstep(0.066, 0.1, r)) * uK * (0.6 + 0.5 * uOrbK);
        gl_FragColor = vec4(col, 1.0);
        ${GLORY_END}
      }`,
  });
}

export default function FriendshipWorld({ props }: { props: WorldProps }) {
  const all = useMemo(() => {
    if (made && made.key === keyOf(props)) return made;
    // (not made ahead: made here, all at once; the crossing's cloud covers it)
    const g = allSteps(props.mobile, Infinity);
    let r = g.next();
    while (!r.done) r = g.next();
    made = { key: keyOf(props), ...r.value };
    return made;
  }, [props.mobile]);
  const forest = all.forest;
  const figure = all.figure;
  useEffect(
    () => () => {
      if (made === all) dropFriendship();
    },
    [all],
  );
  const b = useDisposable(() => {
    const m = props.mobile;
    // (set here, not only while flown: the world is also drawn through the home gate's window before it stands)
    FRIEND_U.uOrb.value.set(ORB.x, ORB.y, ORB.z).add(ORIGIN);
    // (and its beats where they begin, so the world seen through the home gate is the one flown into)
    FRIEND_U.uOrbK.value = 0.55;
    FRIEND_U.uCracks.value = 0;
    const glows: Halo[] = [
      // the orb's glow in the air
      { p: [ORB.x, ORB.y, ORB.z], size: ORB.r * 3.2, col: [1, 0.82, 0.52], k: 0.3 },
      // its light lying on the floor beneath it
      { p: [ORB.x + 20, floorAt(20, ORB.z) + 30, ORB.z], size: 420, col: [0.8, 0.6, 0.3], k: 0.05 },
      ...forest.glows,
    ];
    const puffs: Puff[] = [];
    // mist on the floor, deepest round the rocks she rises from
    const feet = herAt(140, 0, -40);
    for (let i = 0; i < (m ? 24 : 54); i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const d = (30 + ((i * 37) % 190)) * HER_K;
      const x = feet[0] + Math.cos(a) * d * 1.4;
      const z = feet[2] + Math.sin(a) * d * 0.8;
      puffs.push({ p: [x, floorAt(x, z) + 30 + (i % 5) * 22, z], size: 190 + ((i * 53) % 230), a: 0.5 });
    }
    // The hall of fog: thick, low and high, so the wood in it is seen a tree at a time and the cavern beyond it not
    // at all, only its light.
    for (let i = 0; i < (m ? 30 : 70); i++) {
      const x = -170 + ((i * 41) % 340);
      const z = HALL.z1 - 60 + ((i * 67) % (TUNNEL.z0 - HALL.z1 + 40));
      puffs.push({ p: [x, floorAt(x, z) + 8 + (i % 6) * 18, z], size: 80 + ((i * 29) % 100), a: 0.56 });
    }
    // (and a curtain of it across the throat, which the plane comes out through)
    for (let i = 0; i < (m ? 10 : 24); i++) {
      const x = -230 + ((i * 53) % 460);
      const z = HALL.z1 - 110 + ((i * 31) % 150);
      puffs.push({ p: [x, floorAt(x, z) + 20 + ((i * 17) % 170), z], size: 120 + ((i * 37) % 110), a: 0.4 });
    }
    // The cavern: banks of mist at four heights across the whole of it, so every view has a near, a middle and a
    // far layer and the pillars stand in it one behind another: on the floor among the trees, over their tops, at
    // the pillars' middles, and high, under the lost vault.
    const banks: [number, number, number, number][] = [
      [m ? 30 : 64, 40, 300, 0.34],
      [m ? 22 : 50, 190, 420, 0.24],
      [m ? 14 : 34, 520, 560, 0.18],
      [m ? 10 : 24, 980, 700, 0.14],
    ];
    banks.forEach(([n, hy, sz, a], bi) => {
      for (let i = 0; i < n; i++) {
        const x = -1300 + ((i * 331 + bi * 157) % 2600);
        const z = -2400 + ((i * 463 + bi * 201) % 2650);
        // (never between the way and her face and the orb: the veil has that place)
        if (x > -260 && x < HEAD.x + 160 && z > ORB.z - 260 && z < ORB.z + 900 && hy > 100 && hy < 800) continue;
        puffs.push({ p: [x, floorAt(x, z) + hy + ((i * 37) % 90), z], size: sz + ((i * 53) % 220), a });
      }
    });
    // the veil of mist that hangs before her until the plane is out of the throat, and then parts, to either side
    const veilL: Puff[] = [];
    const veilR: Puff[] = [];
    for (let i = 0; i < (m ? 22 : 46); i++) {
      const x = -330 + ((i * 53) % 900);
      const z = ORB.z + 420 + ((i * 29) % 420);
      const y = floorAt(x, z) + 60 + ((i * 17) % 520);
      (x < 120 ? veilL : veilR).push({ p: [x, y, z], size: 260 + ((i * 41) % 220), a: 0.5 });
    }
    // drips of light in the tunnel, falling slowly from its roof
    const drips = motesGeometry([{ c: [0, TUNNEL.top * 0.55, (TUNNEL.z0 + 1000) / 2], r: [TUNNEL.half * 0.8, TUNNEL.top * 0.45, (1000 - TUNNEL.z0) / 2], n: m ? 90 : 220, size: [0.05, 0.14], rise: -5 }], 21);
    // fireflies along the way through the wood, low, wandering: they show the way to her
    const ff: { c: [number, number, number]; r: [number, number, number]; n: number; size: [number, number]; rise: number }[] = [];
    for (let z = TUNNEL.z0 - 40; z > HALL.z1 - 30; z -= 55) {
      const P = FRIEND_PATH.find((q) => q[1] <= z) ?? FRIEND_PATH[FRIEND_PATH.length - 1];
      const y = floorAt(pathX(z), z) + P[2] - 3;
      ff.push({ c: [pathX(z), y, z], r: [16, 7, 26], n: m ? 14 : 30, size: [0.12, 0.3], rise: 0 });
    }
    const flies = motesGeometry(ff, 33);
    const map = new THREE.TextureLoader().load("/assets/ciurlionis/friendship.jpg");
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return {
      cave: caveGeometry(m),
      caveMat: (() => {
        const cm = makeCaveMaterial();
        // (the tunnel's mushrooms, as the rock near them sees them)
        forest.tunnelLights.slice(0, 9).forEach((t, i) => {
          (cm.uniforms.uShroomP.value as THREE.Vector3[])[i].set(t.p[0], t.p[1], t.p[2]).add(ORIGIN);
          (cm.uniforms.uShroomC.value as THREE.Vector3[])[i].set(t.col[0], t.col[1], t.col[2]);
        });
        return cm;
      })(),
      map,
      herMat: makeHerMaterial(figure.near, map),
      // (fewer strands on the lower gears: High and up keep all 720; Medium about three quarters, Low a little over half)
      rays: raysGeometry(figure.near, m ? 320 : rayCount(props.effects)),
      raysMat: makeRaysMaterial(),
      rayMotes: rayMotesGeometry(figure.near, m ? 320 : rayCount(props.effects), m ? 130 : Math.round((340 * rayCount(props.effects)) / 720)),
      falls: fallsGeometry(forest.falls),
      fallsMat: makeFallsMaterial(),
      glory: new THREE.PlaneGeometry(2, 2),
      gloryMat: makeGloryMaterial(),
      rayMotesMat: makeRayMotesMaterial(),
      ferns: fernGeometry(forest.ferns, m),
      water: waterGeometry(pathX, m),
      waterMat: makeWaterMaterial(),
      fernMat: makeFernMaterial(),
      orb: new THREE.SphereGeometry(ORB.r, m ? 64 : 112, m ? 40 : 72),
      orbMat: makeOrbMaterial(map),
      stoneMat: withOrb(makeTempera({ amb: 1.2, key: 0.4, grain: 1.0, ao: 0.5, aoH: 8, rim: [0.03, 0.06, 0.04], rimPow: 3 }), 1.2, 1000),
      rootMat: withOrb(makeTempera({ amb: 1.0, key: 0.3, grain: 0.8, rim: [0.05, 0.09, 0.06], rimPow: 2.5 }), 1.0, 1000),
      shroomMat: makeTempera({ amb: 1.1, key: 0.3 }),
      motes: motesGeometry(
        [
          { c: [ORB.x, ORB.y, ORB.z], r: [210, 180, 210], n: m ? 260 : 650, size: [0.4, 1.2], rise: 6 },
          // (the whole length of the way through the cavern, about the height it is flown at)
          { c: [-40, 190, -420], r: [520, 190, 820], n: m ? 500 : 1500, size: [0.5, 1.6], rise: 0 },
          // (thick in the hall of fog)
          { c: [0, 50, 560], r: [150, 50, 230], n: m ? 150 : 420, size: [0.12, 0.4], rise: 1 },
          { c: [HEAD.x + 60, HEAD.y + 160, HEAD.z + 40], r: [230, 180, 110], n: m ? 120 : 300, size: [0.6, 1.8], rise: 4 },
        ],
        5,
      ),
      motesMat: makeMotesMaterial(),
      streaks: streaksGeometry(m ? 90 : 220),
      streaksMat: makeStreaksMaterial(),
      glows,
      puffs,
      veilL,
      veilR,
      drips,
      dripsMat: makeMotesMaterial([0.75, 0.9, 1.0]),
      flies,
      fliesMat: makeMotesMaterial([0.85, 1.0, 0.45]),
    };
  }, [props.mobile, props.effects, forest, figure]);
  // The story, in beats (worlds/moments.tsx): the dark tunnel and its drips of light; a warm glow far ahead; the
  // cavern opening, a wood inside the mountain lit through cracks high above; fireflies showing the way; the mist
  // parting before her; the orb brightening and opening as the plane rises to it.
  const tunnel = useMoment("friendship", { id: "friendship-tunnel", ease: 2.5 });
  const glimpse = useMoment("friendship", { id: "friendship-glimpse", after: 2, ease: 6 });
  const cavern = useMoment("friendship", { id: "friendship-cavern", at: [0, 20, TUNNEL.z0 - 60], within: 90, ease: 7 });
  const flies = useMoment("friendship", { id: "friendship-fireflies", at: [0, 20, TUNNEL.z0 - 160], within: 120, ease: 5 });
  const reveal = useMoment("friendship", { id: "friendship-reveal", at: [-10, 70, HALL.z1 - 40], within: 150, ease: 9 });
  const rise = useMoment("friendship", { id: "friendship-orb", at: [ORB.x, ORB.y, ORB.z], within: 620, ease: 6 });
  const veilL = useRef<THREE.Group>(null);
  const veilR = useRef<THREE.Group>(null);
  // the gate here is the orb: it is the window on the Sun (worlds/portal.tsx), with no lancet of its own
  useEffect(() => {
    const w = portalRig.windows;
    w.set("friendship", (w.get("friendship") ?? 0) + 1);
    return () => void w.set("friendship", (w.get("friendship") ?? 1) - 1);
  }, []);
  // (the lens keeps her face clear of the far softness)
  useEffect(() => {
    const at = new THREE.Vector3(HEAD.x, HEAD.y, HEAD.z).add(ORIGIN);
    const t = window.setInterval(() => {
      postCtl.flight.subject = voyage.cur === "friendship" ? at : postCtl.flight.subject === at ? null : postCtl.flight.subject;
      // (and the cave's far softness begins nearer: the wood behind her and the far walls go into a painted blur)
      if (voyage.cur === "friendship") postCtl.flight.from = 1100;
      else if (postCtl.flight.from === 1100) postCtl.flight.from = 420;
    }, 250);
    return () => {
      window.clearInterval(t);
      if (postCtl.flight.from === 1100) postCtl.flight.from = 420;
      if (postCtl.flight.subject === at) postCtl.flight.subject = null;
      if (lit) letLightGo();
    };
  }, []);
  // she stands in clay now, and stands still; far off in the haze she is drawn in her coarse form
  const herNear = useRef<THREE.Mesh>(null);
  const herFar = useRef<THREE.Mesh>(null);
  const lod = useRef({ near: true });
  useFrame(({ camera, size }) => {
    {
      const dh = Math.hypot(camera.position.x - ORIGIN.x - HEAD.x, camera.position.y - ORIGIN.y - HEAD.y, camera.position.z - ORIGIN.z - HEAD.z);
      if (lod.current.near ? dh > 1650 : dh < 1500) lod.current.near = !lod.current.near;
      // (while the world is still being made ready under another sky both forms stand, so both are sent to the card)
      const live = voyage.cur === "friendship";
      if (herNear.current) herNear.current.visible = !live || lod.current.near;
      if (herFar.current) herFar.current.visible = !live || !lod.current.near;
    }
    const px = (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)) / Math.max(size.height, 1);
    b.motesMat.uniforms.uPx.value = px;
    b.streaksMat.uniforms.uPx.value = px;
    b.raysMat.uniforms.uPx.value = px;
    b.rayMotesMat.uniforms.uPx.value = px;
    b.gloryMat.uniforms.uK.value = 0.35 + 0.65 * reveal.k.value;
    b.dripsMat.uniforms.uPx.value = px;
    b.fliesMat.uniforms.uPx.value = px;
    if (voyage.cur !== "friendship") return;
    // the beats
    b.dripsMat.uniforms.uK.value = 1.6 * tunnel.k.value * (1 - 0.7 * cavern.k.value);
    b.fliesMat.uniforms.uK.value = 2.6 * flies.k.value;
    FRIEND_U.uCracks.value = cavern.k.value;
    FRIEND_U.uOrbK.value = 0.6 + 0.5 * glimpse.k.value + 0.25 * reveal.k.value + 0.3 * rise.k.value;
    const part = reveal.k.value;
    if (veilL.current) veilL.current.position.set(-520 * part, 60 * part, 0);
    if (veilR.current) veilR.current.position.set(560 * part, 60 * part, 0);
    // the orb opens as the plane comes to it
    const d = camera.position.distanceTo(FRIEND_U.uOrb.value);
    // (the Sun is seen in its heart from the first sight of it; it opens wide as the plane comes)
    b.orbMat.uniforms.uOpen.value = Math.max(0.6, 1 - THREE.MathUtils.smoothstep(d, 80, 1000));
    // (the orb is wider than the gate's own catch: entering it anywhere is going through; through its heart the
    // plane's own gate takes it, through the window, and this is only for the rest of it)
    const o = FRIEND_U.uOrb.value;
    const off = Math.abs(voyage.planePos.x - o.x) > 17 || voyage.planePos.y - o.y > 24;
    if (voyage.phase === "open" && voyage.flying && off && voyage.planePos.distanceTo(o) < ORB.r * 0.92) {
      voyage.gateHit = { world: "friendship", side: voyage.planePos.x - o.x, up: voyage.planePos.y - o.y, at: performance.now() };
      voyage.next = "sun";
      voyage.phase = "closing";
    }
    // through it under cloud: the cloud is its light
    const h = voyage.gateHit;
    if (voyage.phase === "closing" && voyage.next === "sun" && h && h.world === "friendship" && performance.now() - h.at < 2000) {
      voyage.warm = 1;
      lit = true;
    }
  });
  return (
    <>
      <mesh geometry={b.cave} material={b.caveMat} renderOrder={-5} />
      {forest.trees.map((t, i) => (
        <primitive key={i} object={t} />
      ))}
      <mesh geometry={forest.stone} material={b.stoneMat} />
      <mesh geometry={forest.rock} material={forest.rockMat} />
      <mesh geometry={forest.roots} material={b.rootMat} />
      <mesh geometry={forest.shrooms} material={b.shroomMat} />
      <mesh geometry={b.ferns} material={b.fernMat} />
      <mesh geometry={b.water} material={b.waterMat} renderOrder={1} />
      {/* her: sculpted, in two forms; and the crown of rays, strands of light from the band on her hair */}
      {/* (made about a small orb in her own measure; stood here much larger, the two orbs one) */}
      <group position={[ORB.x - MODEL.orb.x * HER_K, ORB.y - MODEL.orb.y * HER_K, ORB.z - MODEL.orb.z * HER_K]} scale={HER_K}>
        <mesh ref={herNear} geometry={figure.near.geo} material={b.herMat} />
        <mesh ref={herFar} geometry={figure.far.geo} material={b.herMat} />
        <mesh geometry={b.rays} material={b.raysMat} renderOrder={3.9} frustumCulled={false} />
        <mesh geometry={b.rayMotes} material={b.rayMotesMat} renderOrder={7} frustumCulled={false} />
      </group>
      <mesh geometry={forest.far} material={b.stoneMat} />
      <mesh geometry={b.falls} material={b.fallsMat} renderOrder={3.2} frustumCulled={false} />
      {/* the orb's rays in the haze: long soft spokes of its light, standing in the cavern's air all round it */}
      <mesh geometry={b.glory} material={b.gloryMat} position={[ORB.x, ORB.y, ORB.z]} renderOrder={3.4} frustumCulled={false} />
      {/* (drawn after the mist: it is a light, and the veil before her never greys it) */}
      <mesh geometry={b.orb} material={b.orbMat} position={[ORB.x, ORB.y, ORB.z]} renderOrder={3.5} />
      <LightPath id="friendship" def={def} tint={[1, 0.86, 0.56]} gain={0.3} angels={false} marks={false} effects={props.effects} />
      <Gallery def={def} />
      <SunShafts list={forest.beams} tint={[0.8, 0.95, 0.6]} dir={[0.22, 1, -0.18]} />
      <mesh geometry={b.streaks} material={b.streaksMat} renderOrder={4} frustumCulled={false} />
      <mesh geometry={b.motes} material={b.motesMat} renderOrder={7} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <group ref={veilL}>
        <Mist puffs={b.veilL} />
      </group>
      <group ref={veilR}>
        <Mist puffs={b.veilR} />
      </group>
      <mesh geometry={b.drips} material={b.dripsMat} renderOrder={7} />
      <mesh geometry={b.flies} material={b.fliesMat} renderOrder={7} />
      <Halos list={b.glows} kind={2} />
    </>
  );
}
