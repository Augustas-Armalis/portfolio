"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { postCtl } from "../Post";
import { ContactShade, Gallery, Halos, LightPath, Mist, useDisposable, type WorldProps } from "./common";
import { type Halo, type Puff } from "./kit";
import { portalRig } from "./portal";
import { ORIGIN, WORLDS, gateOf, voyage } from "./voyage";
import { FRIEND_U, caveGeometry, makeCaveMaterial, makeFigureMaterial } from "./friendship/cave";
import { figureSteps, type Figure } from "./friendship/figure";
import { makeMotesMaterial, makeOrbMaterial, makeRaysMaterial, makeStreaksMaterial, motesGeometry, raysGeometry, streaksGeometry } from "./friendship/light";
import { HEAD, ORB, floorAt } from "./friendship/shape";

// Friendship (Draugystė, 1906–1907). In the picture a figure in profile, her face lit from below, a crown of
// green and gold rays streaming up from her head, her body going into the dark, holds out on her open hand a
// pale orb of light; the ground is a deep teal-green laid in upright strokes with rows of short dark marks.
//
// Here she lives in a cave, a vast one. The plane comes out of a passage into a chamber of dim green-gold air,
// and far down it she stands, colossal, on the right, facing across the way: her profile (forehead, nose, lips,
// chin) drawn in a thread of orange-gold where the orb's light finds it, the rays rising from her crown into the
// vault, her robe falling into the mist on the floor. Her hand holds the orb out over the path of light at the
// height of her face, and the orb lights her face, her fingers, the floor under it and the walls far off. Motes
// drift in its light, faint upright strokes hang in the air as they hang over the whole picture.
//
// The wow moment: the long rise toward the orb, she growing until the picture itself stands in the frame, and
// then the orb opening: in its heart is the Sonata of the Sun (worlds/portal.tsx draws it), and the plane flies
// into the light and out into that world.
//
// (The figure is three skins drawn over distance fields, friendship/figure.ts: made a few milliseconds a frame
// while home is flown, by prepareFriendship, so neither the flight nor the crossing waits for it.)

const def = WORLDS.friendship;
const keyOf = (p: Pick<WorldProps, "mobile">) => (p.mobile ? "m" : "d");
let made: { key: string; fig: Figure } | null = null;
export function prepareFriendship(props: Pick<WorldProps, "mobile">, budget = 4) {
  const key = keyOf(props);
  if (made && made.key !== key) dropFriendship();
  const g = made ? null : figureSteps(props.mobile, budget);
  return () => {
    if (!g || made) return true;
    const r = g.next();
    if (r.done) made = { key, fig: r.value };
    return !!r.done;
  };
}
export function dropFriendship() {
  const f = made?.fig;
  made = null;
  if (f) for (const g of Object.values(f)) g.dispose();
}

// The light through which the plane leaves, when the crossing is made under cloud (a phone, Low, the next world
// not yet ready): the cloud is the orb's own light, as the kings' little world is at the end, and lets go once
// the plane is out in the Sun.
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
  const fig = useMemo(() => {
    if (made && made.key === keyOf(props)) return made.fig;
    // (not made ahead: made here, all at once; the crossing's cloud covers it)
    const g = figureSteps(props.mobile, Infinity);
    let r = g.next();
    while (!r.done) r = g.next();
    made = { key: keyOf(props), fig: r.value };
    return r.value;
  }, [props.mobile]);
  useEffect(
    () => () => {
      if (made?.fig === fig) dropFriendship();
    },
    [fig],
  );
  const b = useDisposable(() => {
    const m = props.mobile;
    // (set here, not only while flown: the world is also drawn through the home gate's window before it stands)
    FRIEND_U.uOrb.value.set(ORB.x, ORB.y, ORB.z).add(ORIGIN);
    const glows: Halo[] = [
      // the orb's glow in the air: close and warm, and a long faint breath of it
      { p: [ORB.x, ORB.y, ORB.z], size: ORB.r * 3.4, col: [1, 0.82, 0.52], k: 0.42 },
      { p: [ORB.x, ORB.y, ORB.z], size: ORB.r * 9, col: [0.9, 0.7, 0.36], k: 0.09 },
      // its light lying on the floor beneath it
      { p: [ORB.x + 8, floorAt(8, 0) + 14, ORB.z], size: 120, col: [0.8, 0.6, 0.3], k: 0.05 },
    ];
    const puffs: Puff[] = [];
    // mist on the floor, deepest round her robe, where she goes into it
    for (let i = 0; i < (m ? 26 : 60); i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const d = 30 + ((i * 37) % 200);
      const x = HEAD.x + 60 + Math.cos(a) * d * 1.3;
      const z = Math.sin(a) * d;
      puffs.push({ p: [x, floorAt(x, z) + 10 + (i % 5) * 6, z], size: 70 + ((i * 53) % 90), a: 0.5 });
    }
    for (let i = 0; i < (m ? 16 : 36); i++) {
      const x = -300 + ((i * 97) % 600);
      const z = -380 + ((i * 211) % 980);
      puffs.push({ p: [x, floorAt(x, z) + 8 + (i % 3) * 5, z], size: 90 + ((i * 31) % 80), a: 0.32 });
    }
    return {
      cave: caveGeometry(m),
      caveMat: makeCaveMaterial(),
      headMat: makeFigureMaterial(0),
      armMat: makeFigureMaterial(1),
      bodyMat: makeFigureMaterial(2),
      orb: new THREE.SphereGeometry(ORB.r, m ? 64 : 112, m ? 40 : 72),
      orbMat: makeOrbMaterial(),
      rays: raysGeometry(m ? 100 : 190),
      raysMat: makeRaysMaterial(),
      motes: motesGeometry(
        [
          { c: [ORB.x, ORB.y, ORB.z], r: [80, 70, 80], n: m ? 300 : 800, size: [0.18, 0.6], rise: 3 },
          { c: [0, 190, 120], r: [400, 200, 520], n: m ? 600 : 1600, size: [0.35, 1.1], rise: 0 },
          { c: [HEAD.x + 60, HEAD.y + 90, 0], r: [100, 90, 40], n: m ? 120 : 320, size: [0.3, 0.9], rise: 2 },
        ],
        5,
      ),
      motesMat: makeMotesMaterial(),
      streaks: streaksGeometry(m ? 200 : 520),
      streaksMat: makeStreaksMaterial(),
      glows,
      puffs,
    };
  }, [props.mobile]);
  // the gate here is the orb: it is the window on the Sun (worlds/portal.tsx), with no lancet of its own
  useEffect(() => {
    const w = portalRig.windows;
    w.set("friendship", (w.get("friendship") ?? 0) + 1);
    return () => void w.set("friendship", (w.get("friendship") ?? 1) - 1);
  }, []);
  // (the lens keeps her face clear of the far softness)
  useEffect(() => {
    const at = new THREE.Vector3(HEAD.x - 10, HEAD.y, 0).add(ORIGIN);
    const t = window.setInterval(() => {
      postCtl.flight.subject = voyage.cur === "friendship" ? at : postCtl.flight.subject === at ? null : postCtl.flight.subject;
    }, 250);
    return () => {
      window.clearInterval(t);
      if (postCtl.flight.subject === at) postCtl.flight.subject = null;
      if (lit) letLightGo();
    };
  }, []);
  useFrame(({ camera, size }) => {
    if (voyage.cur !== "friendship") return;
    const px = (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)) / Math.max(size.height, 1);
    b.raysMat.uniforms.uPx.value = px;
    b.motesMat.uniforms.uPx.value = px;
    b.streaksMat.uniforms.uPx.value = px;
    // the orb opens as the plane comes to it
    const d = camera.position.distanceTo(FRIEND_U.uOrb.value);
    const o = THREE.MathUtils.smoothstep(d, 30, 340);
    b.orbMat.uniforms.uOpen.value = 1 - o;
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
      <mesh geometry={fig.body} material={b.bodyMat} />
      <mesh geometry={fig.head} material={b.headMat} />
      <mesh geometry={fig.arm} material={b.armMat} />
      <mesh geometry={b.orb} material={b.orbMat} position={[ORB.x, ORB.y, ORB.z]} />
      <ContactShade def={def} spots={[{ x: HEAD.x + 60, z: 0, r: 120, k: 0.55 }]} />
      <LightPath id="friendship" def={def} tint={[1, 0.86, 0.56]} gain={0.55} angels={false} marks={false} effects={props.effects} />
      <Gallery def={def} />
      <mesh geometry={b.streaks} material={b.streaksMat} renderOrder={4} frustumCulled={false} />
      <mesh geometry={b.rays} material={b.raysMat} renderOrder={6} />
      <mesh geometry={b.motes} material={b.motesMat} renderOrder={7} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
    </>
  );
}
