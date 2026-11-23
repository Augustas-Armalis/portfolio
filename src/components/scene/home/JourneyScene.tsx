"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SKY_U, mixSky, skyState, type SkyState } from "../sky";
import { pathOf, voyage } from "../worlds/voyage";
import { ForestAngels } from "./Angels";
import { Cave } from "./Cave";
import { Farm, Sacred, SeaBoats } from "./Sacred";
import { FOREST_LINE, TOWN } from "./journey";
import { HOME_U } from "./land";
import { Town } from "./Town";
import { FOREST_K, Woods } from "./Woods";

// The opening flight of the home world (journey.ts): the town on the river, the old forest, the cave in the mountain.
//
// The hour moves with the flight: whatever the clock says at the desk, the sun is lower over the town (golden
// hour, the lamps kindling), sets as the plane reaches the forest's edge, and inside the forest it is night, the
// fog thick between the trunks. Near the mountain the fog lifts, and the cave's light stands in the dark.
const AIR0 = HOME_U.uAirK.value.x;

function fracNear(pts: THREE.Vector3[], x: number, z: number) {
  let best = 0;
  let bd = 1e18;
  pts.forEach((p, i) => {
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best / (pts.length - 1);
}

export function Journey({ mobile, trees, effects }: { mobile: boolean; trees: number; effects: number }) {
  const marks = useMemo(() => {
    const pts = pathOf("home").pts;
    return { pts, town: fracNear(pts, TOWN.x, TOWN.z), forest: fracNear(pts, ...FOREST_LINE[1]), deep: fracNear(pts, ...FOREST_LINE[4]), cave: fracNear(pts, ...FOREST_LINE[FOREST_LINE.length - 1]) };
  }, []);
  const st = useMemo(() => ({ i: 0, f: 0, fe: 0, q: -1, live: null as SkyState | null, sky: null as SkyState | null, age: 0 }), []);
  useEffect(
    () => () => {
      HOME_U.uAirK.value.x = AIR0;
      HOME_U.uFogGlow.value.w = 0;
      HOME_U.uFogLayer.value.y = 0.012;
      if (voyage.skyMod === mod) voyage.skyMod = null;
    },
    [],
  );
  // the sky of a point of the flight (f: 0 at the desk .. 1 at the cave), blended over the live one
  const hourAt = (f: number) => {
    const { town, forest, deep } = marks;
    const k = [
      [0, 17.6],
      [town - 0.06, 18.45],
      [town + 0.02, 18.95],
      [forest, 19.75],
      [deep, 22.4],
      [1, 22.4],
    ];
    for (let i = 0; i < k.length - 1; i++)
      if (f <= k[i + 1][0]) {
        const t = (f - k[i][0]) / Math.max(1e-4, k[i + 1][0] - k[i][0]);
        return k[i][1] + (k[i + 1][1] - k[i][1]) * Math.min(1, Math.max(0, t));
      }
    return 22.4;
  };
  function mod(s: SkyState) {
    if (voyage.cur !== "home" || st.fe <= 0.005) return s;
    // (a visitor already at night stays in the night: the journey only darkens)
    if (s.night > 0.5 && st.fe < marks.forest) return s;
    const q = Math.round(st.fe * 400) / 400;
    if (q !== st.q || !st.sky || st.age > 90) {
      st.q = q;
      st.age = 0;
      const w = THREE.MathUtils.smoothstep(q, 0.0, Math.max(0.05, marks.town - 0.08));
      st.sky = mixSky(s, skyState(hourAt(q)), w);
    }
    st.age++;
    return st.sky;
  }
  useFrame((_, dt) => {
    const flying = voyage.cur === "home" && voyage.flying && voyage.planePos.y > -100;
    if (flying) {
      // the plane's place along the path: searched near where it was last
      const pts = marks.pts;
      const p = voyage.planePos;
      let best = st.i;
      let bd = 1e18;
      const lo = Math.max(0, st.i - 40);
      const hi = Math.min(pts.length - 1, st.i + 40);
      for (let i = lo; i <= hi; i++) {
        const d = (pts[i].x - p.x) ** 2 + (pts[i].z - p.z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      // (lost: a jump, or wandering far: look along the whole path)
      if (bd > 120 * 120) best = Math.round(fracNear(pts, p.x, p.z) * (pts.length - 1));
      st.i = best;
      const f = best / (pts.length - 1);
      // (once into the flight, the hour only goes on: turning back does not undo the evening, unless far off the path)
      st.f = bd < 160 * 160 ? Math.max(st.f, f) : THREE.MathUtils.damp(st.f, f, 0.5, dt);
    } else {
      st.f = 0;
      st.i = 0;
    }
    if (voyage.cur === "home") voyage.skyMod = mod;
    // Everything the journey changes (the hour, the sky, the light, night in the forest, its fog, the town's mist)
    // follows an eased place along the path, not the plane's own: over distance each change is spread across a
    // hundred metres or more of flight, and the ease in time (about three seconds to settle, as the music's
    // crossfade at the forest's edge) keeps a jump, a fast pass or a turn back from ever snapping it. The same on
    // the way out.
    st.fe = voyage.cur === "home" ? THREE.MathUtils.damp(st.fe, st.f, 1.0, Math.min(dt, 0.1)) : 0;
    if (Math.abs(st.fe - st.f) < 1e-5) st.fe = st.f;
    const f = st.fe;
    const night = THREE.MathUtils.smoothstep(f, marks.forest - 0.06, marks.deep);
    FOREST_K.night.value = Math.max(night, SKY_U.uNight.value * 0.8);
    const fog = THREE.MathUtils.smoothstep(f, marks.forest - 0.05, marks.forest + 0.08) * (1 - 0.7 * THREE.MathUtils.smoothstep(f, marks.cave - 0.36, marks.cave - 0.16)) * (1 - THREE.MathUtils.smoothstep(f, marks.cave - 0.14, marks.cave - 0.05));
    FOREST_K.fog.value = fog;
    // the air: a light mist over the town's roofs (smoke and evening damp), and in the forest a soft fog lit by the
    // moon, thick enough that the trunks fade within a few tens of metres; it lifts before the mountain
    const town = THREE.MathUtils.smoothstep(f, marks.town - 0.1, marks.town) * (1 - THREE.MathUtils.smoothstep(f, marks.forest - 0.04, marks.forest + 0.02));
    if (voyage.cur === "home") {
      HOME_U.uAirK.value.x = AIR0 + 0.0022 * town;
      HOME_U.uFogGlow.value.w = 0.28 * fog;
      // (the woods' mist: always a little, thick in the old forest at night)
      HOME_U.uFogLayer.value.y = 0.012 + 0.09 * fog;
    } else {
      HOME_U.uFogGlow.value.w = 0;
      HOME_U.uFogLayer.value.y = 0.012;
    }
  });
  return (
    <group ref={(g) => { if (g && process.env.NODE_ENV !== "production") Object.assign(window, { __journey: g }); }}>
      <Town mobile={mobile} />
      <Woods amount={trees} mobile={mobile} effects={effects} />
      {effects > 0.25 && <ForestAngels amount={trees} />}
      <Cave />
      <Sacred mobile={mobile} />
      <SeaBoats />
      <Farm />
    </group>
  );
}
