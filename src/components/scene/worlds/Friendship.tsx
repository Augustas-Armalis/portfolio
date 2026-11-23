"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { postCtl } from "../Post";
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
import { crownGeometry, makePaintedMaterial, maskTexture, reliefGeometry } from "./friendship/painted";
import { FRIEND_PATH, HEAD, ORB, TUNNEL, floorAt } from "./friendship/shape";

// Friendship (Draugystė, 1906–1907). In the picture a figure in profile, her face lit gold from the orb, a crown of
// green and gold rays streaming up from her head, her body going into the dark, holds out on her open hand a pale
// orb of light; the ground is deep teal-green laid in upright strokes.
//
// Here she lives in a cave, a vast one, and the cave is a wood: the picture's upright strokes stand up as tall dark
// trunks going into the haze, roots hang from the vault, ferns and mossy stones lie on a soft misted floor, small
// mushrooms glow, shafts of light come down from far above. The plane comes in low under the trees, the orb's
// light glimpsed far off between the trunks; the wood opens through an arch of rock, and across the clearing she
// stands, colossal, exactly as he painted her (she IS his painting: friendship/painted.ts), her hand holding the
// orb out over the way. The plane rises straight at it; in its heart is the Sonata of the Sun (worlds/portal.tsx),
// and it flies into the light and out into that world.
//
// (The wood is made a few milliseconds a frame while home is flown, by prepareFriendship, so neither the flight nor
// the crossing waits for it.)

const def = WORLDS.friendship;
const keyOf = (p: Pick<WorldProps, "mobile">) => (p.mobile ? "m" : "d");
let made: { key: string; forest: Forest } | null = null;
export function prepareFriendship(props: Pick<WorldProps, "mobile">, budget = 4) {
  const key = keyOf(props);
  if (made && made.key !== key) dropFriendship();
  const g = made ? null : forestSteps(props.mobile, budget);
  return () => {
    if (!g || made) return true;
    const r = g.next();
    if (r.done) made = { key, forest: r.value };
    return !!r.done;
  };
}
function letGoForest(f: Forest) {
  for (const t of f.trees) t.geometry.dispose();
  for (const x of [f.leafy, f.stone, f.rock, f.rockMat, f.roots, f.shrooms]) x.dispose();
}
export function dropFriendship() {
  const f = made?.forest;
  made = null;
  if (f) letGoForest(f);
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

export default function FriendshipWorld({ props }: { props: WorldProps }) {
  const forest = useMemo(() => {
    if (made && made.key === keyOf(props)) return made.forest;
    // (not made ahead: made here, all at once; the crossing's cloud covers it)
    const g = forestSteps(props.mobile, Infinity);
    let r = g.next();
    while (!r.done) r = g.next();
    made = { key: keyOf(props), forest: r.value };
    return r.value;
  }, [props.mobile]);
  useEffect(
    () => () => {
      if (made?.forest === forest) dropFriendship();
    },
    [forest],
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
      { p: [ORB.x + 8, floorAt(8, 0) + 14, ORB.z], size: 120, col: [0.8, 0.6, 0.3], k: 0.05 },
      ...forest.glows,
    ];
    const puffs: Puff[] = [];
    // mist on the floor, deepest round the rocks she rises from
    for (let i = 0; i < (m ? 30 : 70); i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const d = 20 + ((i * 37) % 160);
      const x = 100 + Math.cos(a) * d * 1.5;
      const z = -25 + Math.sin(a) * d * 0.7;
      puffs.push({ p: [x, floorAt(x, z) + 14 + (i % 5) * 7, z], size: 70 + ((i * 53) % 90), a: 0.55 });
    }
    // banks of mist at three heights across the whole cavern, so every view has a near, a middle and a far layer:
    // low along the floor, a bank at the trees' middles, and a high one under the lost vault
    const banks: [number, number, number, number][] = [
      [m ? 26 : 60, 18, 90, 0.3],
      [m ? 18 : 44, 120, 150, 0.22],
      [m ? 12 : 30, 300, 260, 0.16],
    ];
    banks.forEach(([n, hy, sz, a], bi) => {
      for (let i = 0; i < n; i++) {
        const x = -620 + ((i * 131 + bi * 57) % 1240);
        const z = -900 + ((i * 263 + bi * 101) % 1500);
        // (never in front of her face and the orb: the veil has that place)
        if (Math.abs(x - 40) < 140 && z > -80 && z < 220 && hy > 60) continue;
        puffs.push({ p: [x, floorAt(x, z) + hy + ((i * 37) % 40), z], size: sz + ((i * 53) % 80), a });
      }
    });
    // (the haze in the cavern's mouth, lying low where the tunnel opens)
    for (let i = 0; i < (m ? 10 : 24); i++) {
      const x = -90 + ((i * 41) % 180);
      const z = 470 + ((i * 67) % 260);
      puffs.push({ p: [x, floorAt(x, z) + 8 + (i % 4) * 6, z], size: 50 + ((i * 29) % 50), a: 0.42 });
    }
    for (let i = 0; i < (m ? 24 : 60); i++) {
      const x = -330 + ((i * 97) % 660);
      const z = -380 + ((i * 211) % 1250);
      puffs.push({ p: [x, floorAt(x, z) + 6 + (i % 3) * 4, z], size: 60 + ((i * 31) % 70), a: 0.36 });
    }
    // the veil of mist that hangs before her until the plane is near, and then parts, to either side
    const veilL: Puff[] = [];
    const veilR: Puff[] = [];
    for (let i = 0; i < (m ? 22 : 46); i++) {
      const x = -60 + ((i * 53) % 260);
      const z = 40 + ((i * 29) % 140);
      const y = floorAt(x, z) + 20 + ((i * 17) % 110);
      (x < 50 ? veilL : veilR).push({ p: [x, y, z], size: 80 + ((i * 41) % 70), a: 0.62 });
    }
    // drips of light in the tunnel, falling slowly from its roof
    const drips = motesGeometry([{ c: [0, TUNNEL.top * 0.55, (TUNNEL.z0 + 1000) / 2], r: [TUNNEL.half * 0.8, TUNNEL.top * 0.45, (1000 - TUNNEL.z0) / 2], n: m ? 90 : 220, size: [0.05, 0.14], rise: -5 }], 21);
    // fireflies along the way through the wood, low, wandering: they show the way to her
    const ff: { c: [number, number, number]; r: [number, number, number]; n: number; size: [number, number]; rise: number }[] = [];
    for (let z = TUNNEL.z0 - 40; z > 220; z -= 55) {
      const P = FRIEND_PATH.find((q) => q[1] <= z) ?? FRIEND_PATH[FRIEND_PATH.length - 1];
      const y = floorAt(pathX(z), z) + P[2] - 3;
      ff.push({ c: [pathX(z), y, z], r: [16, 7, 26], n: m ? 14 : 30, size: [0.12, 0.3], rise: 0 });
    }
    const flies = motesGeometry(ff, 33);
    const map = new THREE.TextureLoader().load("/assets/ciurlionis/friendship.jpg");
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const mask = maskTexture();
    return {
      cave: caveGeometry(m),
      caveMat: makeCaveMaterial(),
      relief: reliefGeometry(m ? 120 : 200, m ? 140 : 232),
      crownSheet: crownGeometry(m ? 40 : 70, m ? 46 : 80),
      map,
      mask,
      herCore: makePaintedMaterial(map, mask, 0),
      herEdge: makePaintedMaterial(map, mask, 1),
      crown: makePaintedMaterial(map, mask, 2),
      ferns: fernGeometry(forest.ferns, m),
      water: waterGeometry(pathX, m),
      waterMat: makeWaterMaterial(),
      fernMat: makeFernMaterial(),
      orb: new THREE.SphereGeometry(ORB.r, m ? 64 : 112, m ? 40 : 72),
      orbMat: makeOrbMaterial(map),
      stoneMat: withOrb(makeTempera({ amb: 1.2, key: 0.4, grain: 1.0, ao: 0.5, aoH: 8, rim: [0.03, 0.06, 0.04], rimPow: 3 }), 1.2, 120),
      rootMat: withOrb(makeTempera({ amb: 1.0, key: 0.3, grain: 0.8, rim: [0.05, 0.09, 0.06], rimPow: 2.5 }), 1.0, 140),
      shroomMat: makeTempera({ amb: 1.1, key: 0.3 }),
      motes: motesGeometry(
        [
          { c: [ORB.x, ORB.y, ORB.z], r: [80, 70, 80], n: m ? 260 : 650, size: [0.15, 0.45], rise: 3 },
          { c: [0, 120, 250], r: [380, 120, 620], n: m ? 500 : 1400, size: [0.2, 0.55], rise: 0 },
          // (thick in the cavern's mouth, where the tunnel opens)
          { c: [0, 40, 560], r: [120, 40, 140], n: m ? 150 : 380, size: [0.12, 0.4], rise: 1 },
          { c: [HEAD.x + 30, HEAD.y + 60, -20], r: [90, 70, 40], n: m ? 120 : 300, size: [0.25, 0.7], rise: 2 },
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
  }, [props.mobile, forest]);
  // The story, in beats (worlds/moments.tsx): the dark tunnel and its drips of light; a warm glow far ahead; the
  // cavern opening, a wood inside the mountain lit through cracks high above; fireflies showing the way; the mist
  // parting before her; the orb brightening and opening as the plane rises to it.
  const tunnel = useMoment("friendship", { id: "friendship-tunnel", ease: 2.5 });
  const glimpse = useMoment("friendship", { id: "friendship-glimpse", after: 2, ease: 6 });
  const cavern = useMoment("friendship", { id: "friendship-cavern", at: [0, 20, TUNNEL.z0 - 60], within: 90, ease: 7 });
  const flies = useMoment("friendship", { id: "friendship-fireflies", at: [0, 20, TUNNEL.z0 - 160], within: 120, ease: 5 });
  const reveal = useMoment("friendship", { id: "friendship-reveal", at: [0, 30, 420], within: 110, ease: 7 });
  const rise = useMoment("friendship", { id: "friendship-orb", at: [ORB.x, ORB.y, ORB.z], within: 230, ease: 5 });
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
      if (voyage.cur === "friendship") postCtl.flight.from = 240;
      else if (postCtl.flight.from === 240) postCtl.flight.from = 420;
    }, 250);
    return () => {
      window.clearInterval(t);
      if (postCtl.flight.from === 240) postCtl.flight.from = 420;
      if (postCtl.flight.subject === at) postCtl.flight.subject = null;
      if (lit) letLightGo();
    };
  }, []);
  // She turns a little with the eye, about the orb's upright (so the hand never leaves it): a picture seen from
  // the side would be squeezed; this keeps it nearly square to whoever looks, the way a painted card stays readable.
  const her = useRef<THREE.Group>(null);
  useFrame(({ camera, size }) => {
    if (her.current && voyage.cur === "friendship") {
      const o = FRIEND_U.uOrb.value;
      // (turned toward the eye as seen from her face, not the orb: the painting stays within some 25 degrees of square)
      const f = HEAD.x + o.x - ORB.x;
      const want = THREE.MathUtils.clamp(Math.atan2(camera.position.x - f, camera.position.z - o.z) * 0.6, -0.5, 0.5);
      her.current.rotation.y += (want - her.current.rotation.y) * 0.08;
    }
    const px = (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)) / Math.max(size.height, 1);
    b.motesMat.uniforms.uPx.value = px;
    b.streaksMat.uniforms.uPx.value = px;
    b.dripsMat.uniforms.uPx.value = px;
    b.fliesMat.uniforms.uPx.value = px;
    if (voyage.cur !== "friendship") return;
    // the beats
    b.dripsMat.uniforms.uK.value = 1.6 * tunnel.k.value * (1 - 0.7 * cavern.k.value);
    b.fliesMat.uniforms.uK.value = 2.6 * flies.k.value;
    FRIEND_U.uCracks.value = cavern.k.value;
    FRIEND_U.uOrbK.value = 0.55 + 0.45 * glimpse.k.value + 0.3 * rise.k.value;
    const part = reveal.k.value;
    if (veilL.current) veilL.current.position.set(-170 * part, 25 * part, 0);
    if (veilR.current) veilR.current.position.set(190 * part, 25 * part, 0);
    // the orb opens as the plane comes to it
    const d = camera.position.distanceTo(FRIEND_U.uOrb.value);
    // (the Sun is seen in its heart from the first sight of it; it opens wide as the plane comes)
    b.orbMat.uniforms.uOpen.value = Math.max(0.6, 1 - THREE.MathUtils.smoothstep(d, 30, 420));
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
      {/* her: the painting's own figure on its relief, the crown of rays keyed out and added behind */}
      <group ref={her} position={[ORB.x, 0, ORB.z]}>
        <group position={[-ORB.x, 0, -ORB.z]}>
          <mesh geometry={b.crownSheet} material={b.crown} renderOrder={2} frustumCulled={false} />
          <mesh geometry={b.relief} material={b.herCore} frustumCulled={false} />
          <mesh geometry={b.relief} material={b.herEdge} renderOrder={3.8} frustumCulled={false} />
        </group>
      </group>
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
