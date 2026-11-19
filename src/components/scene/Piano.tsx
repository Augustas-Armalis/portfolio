"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { playPiano, preloadPiano } from "@/lib/piano";
import { getMats } from "./materials";
import { KeysBody } from "./models";

// A 25-key controller you can actually play: click keys, or use the computer
// keyboard (A..' for white keys, W E T Y U O P for black). Keys dip when hit.

const KW = 0.0215;
export const WHITE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
const BLACK_AFTER = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];
export const KEYMAP: Record<string, number> = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72, l: 74, ";": 76, "'": 77,
  w: 61, e: 63, t: 66, y: 68, u: 70, o: 73, p: 75,
};
const LABEL: Record<number, string> = Object.fromEntries(Object.entries(KEYMAP).map(([k, m]) => [m, k.toUpperCase()]));

export const pressed = new Map<number, number>(); // midi -> time it was struck

export function strike(midi: number, vel = 0.75) {
  pressed.set(midi, performance.now());
  playPiano(midi, { vel, dur: 2.4 });
}

export function PianoKeys({ playable }: { playable: boolean }) {
  const m = getMats();
  const geo = useMemo(
    () => ({
      white: new RoundedBoxGeometry(0.0204, 0.011, 0.092, 2, 0.0016),
      black: new RoundedBoxGeometry(0.0112, 0.012, 0.056, 2, 0.0018),
    }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const x0 = (-15 * KW) / 2 + KW / 2;
  const zW = 0.135 / 2 - 0.092 / 2 - 0.004;
  const zB = zW - 0.092 / 2 + 0.056 / 2;
  const refs = useRef(new Map<number, THREE.Group>());
  const keys = useMemo(
    () => [
      ...WHITE.map((midi, i) => ({ midi, black: false, x: x0 + i * KW })),
      ...BLACK_AFTER.map((i) => ({ midi: WHITE[i] + 1, black: true, x: x0 + i * KW + KW / 2 })),
    ],
    [x0],
  );

  useEffect(() => {
    if (playable) preloadPiano(58, 86);
  }, [playable]);

  useFrame(() => {
    const now = performance.now();
    refs.current.forEach((g, midi) => {
      const t = pressed.get(midi);
      const age = t === undefined ? 1 : (now - t) / 1000;
      const dip = age < 0.04 ? age / 0.04 : Math.max(0, 1 - (age - 0.04) / 0.22);
      g.rotation.x = dip * 0.06;
    });
  });

  return (
    <group>
      <KeysBody />
      {keys.map((k) => (
        // pivot at the back edge so keys tip down like real ones
        <group
          key={k.midi}
          ref={(g) => {
            if (g) refs.current.set(k.midi, g);
          }}
          position={[k.x, k.black ? 0.0285 : 0.0235, (k.black ? zB : zW) - (k.black ? 0.028 : 0.046)]}
        >
          <mesh
            geometry={k.black ? geo.black : geo.white}
            material={k.black ? m.keyBlack : m.keyWhite}
            position={[0, 0, k.black ? 0.028 : 0.046]}
            castShadow
            receiveShadow
            onPointerDown={(e) => {
              if (!playable) return;
              e.stopPropagation();
              strike(k.midi);
            }}
            onPointerEnter={(e) => {
              // glide across the keys with the button (or a finger) held down
              if (!playable || !e.buttons) return;
              e.stopPropagation();
              strike(k.midi, 0.6);
            }}
          />
          {playable && LABEL[k.midi] && (
            <Html position={[0, k.black ? 0.008 : 0.007, k.black ? 0.044 : 0.078]} center style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
              <div className={`text-[10px] font-semibold ${k.black ? "text-white/80" : "text-black/45"}`}>{LABEL[k.midi]}</div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}
