"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { originOf, voyage, type WorldId } from "./voyage";

// Moments: the quiet events of a flight. A world says when something of its own should happen (a while after
// arriving, on coming near a place, on flying calmly for a time, or any of these together) and gets back one eased
// number, 0 to 1, to drive it with: creatures surfacing, lights kindling, a door opening, a flock rising, cloud
// parting. Nothing is announced, counted or scored; a visitor who flies past too fast simply does not see it.
//
//   const dolphins = useMoment("sea", { id: "dolphins", at: [120, 0, -300], within: 260, calm: 14, calmFor: 4, ease: 5, hold: 40, out: 8 });
//   // then, in the world's own material:   uniforms: { uRise: dolphins.k }     (a live { value } uniform)
//   // or in a useFrame:                     group.position.y = -6 + 6 * dolphins.k.value;
//
//   id        a name (for the development console: __moments.fire("dolphins"), .state())
//   after     seconds since the world was entered before it can begin (default 0)
//   at        a place in the world's own coordinates; with `within`, the plane must come that close (metres)
//   calm      the plane must be flying no faster than this (m/s) ...
//   calmFor   ... for this many seconds without a break (default 3)
//   ease      seconds it takes to arrive (smooth, default 4)
//   hold      seconds it stays before leaving again; left out, it stays for the rest of the visit to the world
//   out       seconds it takes to leave (default: the same as ease)
//   again     seconds after it has left before it may happen once more (left out: once per visit)
//
// What comes back: k (a uniform, 0..1, eased both ways), t (a uniform: seconds since it began, 0 before), and
// `on` (true from the moment it begins until it has left).
export type MomentSpec = { id: string; after?: number; at?: [number, number, number]; within?: number; calm?: number; calmFor?: number; ease?: number; hold?: number; out?: number; again?: number };
export type Moment = { k: { value: number }; t: { value: number }; on: boolean };
type Live = Moment & { spec: MomentSpec; world: WorldId; began: number; calmT: number; age: number; left: number; force: boolean };

const all = new Set<Live>();
const smooth = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};
const P = new THREE.Vector3();

export function useMoment(world: WorldId, spec: MomentSpec): Moment {
  const m = useMemo<Live>(() => ({ k: { value: 0 }, t: { value: 0 }, on: false, spec, world, began: -1, calmT: 0, age: 0, left: -1, force: false }), [world, spec.id]); // eslint-disable-line react-hooks/exhaustive-deps
  m.spec = spec;
  useEffect(() => {
    all.add(m);
    return () => {
      all.delete(m);
    };
  }, [m]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = m.spec;
    // only while this world stands, open, with the plane in it
    const here = voyage.flying && voyage.cur === world && voyage.phase === "open";
    if (!here) {
      if (voyage.cur !== world && (m.began >= 0 || m.k.value > 0)) Object.assign(m, { began: -1, calmT: 0, age: 0, left: -1, on: false }), (m.k.value = 0), (m.t.value = 0);
      return;
    }
    m.age += dt;
    const ease = s.ease ?? 4;
    if (m.began < 0) {
      let ok = m.age >= (s.after ?? 0);
      if (ok && s.at && s.within !== undefined) {
        const o = originOf(world);
        ok = P.set(s.at[0] + o.x, s.at[1], s.at[2] + o.z).distanceTo(voyage.planePos) <= s.within;
      }
      if (s.calm !== undefined) {
        m.calmT = ok && voyage.planeSpeed <= s.calm ? m.calmT + dt : 0;
        ok = ok && m.calmT >= (s.calmFor ?? 3);
      }
      if (ok && m.left >= 0 && (s.again === undefined || m.age - m.left < s.again)) ok = false;
      if (ok || m.force) {
        m.began = m.age;
        m.force = false;
        m.on = true;
      } else return;
    }
    const t = m.age - m.began;
    m.t.value = t;
    let k = smooth(t / Math.max(ease, 0.01));
    if (s.hold !== undefined) {
      const out = s.out ?? ease;
      const u = (t - ease - s.hold) / Math.max(out, 0.01);
      if (u > 0) k = 1 - smooth(u);
      if (u >= 1) {
        // gone: it may come again later, or not
        m.on = false;
        m.left = m.age;
        m.began = -1;
        m.calmT = 0;
        m.t.value = 0;
        k = 0;
      }
    }
    m.k.value = k;
  });
  return m;
}

// Development: window.__moments.state() lists every moment mounted and where it stands; .fire(id) begins one now.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production")
  Object.assign(window, {
    __moments: {
      state: () => [...all].map((m) => ({ id: m.spec.id, world: m.world, on: m.on, k: +m.k.value.toFixed(3), t: +m.t.value.toFixed(1), age: +m.age.toFixed(1), calm: +m.calmT.toFixed(1) })),
      fire: (id: string) => [...all].filter((m) => m.spec.id === id).forEach((m) => ((m.force = true), (m.left = -1))),
    },
  });
