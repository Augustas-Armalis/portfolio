"use client";

import { useFrame } from "@react-three/fiber";
import { PLAY_U } from "./kit";
import { voyage } from "./voyage";

// What in a world answers the plane's passing, quietly. There is nothing to collect and nothing to fly through:
// only life that notices.
//
//   <Birds scatter={30} ... />   (worlds/life.tsx) a flock that parts round the plane and closes behind it
//   <PlayFrame />                once, wherever the worlds are drawn (Worlds.tsx has it): keeps the shared uniforms
//                                (kit.ts PLAY_U: where the plane is, and where it was a moment ago)
//
// A world can read the same two points for anything of its own that should stir, turn or wake as the plane comes by
// (spread ...PLAY_U into a material's uniforms: uPlane and uPlaneTrail are world-space positions), or read
// voyage.planePos / voyage.planeSpeed in a useFrame.
export function PlayFrame() {
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const p = voyage.planePos;
    const trail = PLAY_U.uPlaneTrail.value;
    if (trail.distanceToSquared(p) > 400 * 400) trail.copy(p);
    else trail.lerp(p, 1 - Math.exp(-dt * 1.4));
    PLAY_U.uPlane.value.copy(p);
  });
  return null;
}
