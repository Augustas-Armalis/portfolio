"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { SKY_U } from "../../sky";
import { useDisposable } from "../common";
import type { V3 } from "../kit";
import { useMoment } from "../moments";
import type { WorldId } from "../voyage";

// A comet that crosses the whole sky once, slowly, some while after the plane has come: a small bright head and
// a long tail of light that thins away behind it, as he drew them. One quad, turned to the eye about its own
// line of flight; where it is and how bright is worked out in the shader from the seconds since it was let go.
// (A moment of the flight: worlds/moments.tsx; in development __moments.fire(id) sends it at once.)
export function Comet({ world, id, from, to, seconds = 28, after = 30, again, tail = 520, width = 26, tint = [1, 0.9, 0.66] }: { world: WorldId; id: string; from: V3; to: V3; seconds?: number; after?: number; again?: number; tail?: number; width?: number; tint?: V3 }) {
  const m = useMoment(world, { id, after, ease: 1, hold: seconds, out: 1, again });
  const b = useDisposable(() => {
    const g = new THREE.PlaneGeometry(1, 1, 24, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, uA: { value: new THREE.Vector3(...from) }, uB: { value: new THREE.Vector3(...to) }, uK: { value: -1 }, uTail: { value: tail }, uW: { value: width }, uTint: { value: new THREE.Color(...tint) } },
      vertexShader: /* glsl */ `
        uniform vec3 uA; uniform vec3 uB; uniform float uK; uniform float uTail; uniform float uW;
        varying vec2 vUv; varying float vOn; varying vec2 vM;
        void main(){
          // u: 0 at the head .. 1 at the end of the tail; v: across
          vUv = vec2(0.5 - position.x, position.y * 2.0);
          vec3 dir = normalize(uB - uA);
          vec3 head = (modelMatrix * vec4(mix(uA, uB, clamp(uK, 0.0, 1.0)), 1.0)).xyz;
          // (the tail grows as it comes and is drawn in as it goes)
          float len = uTail * smoothstep(0.0, 0.12, uK) * (1.0 - smoothstep(0.9, 1.0, uK));
          vec3 c = head - dir * (vUv.x * len - uW * 1.5 * (1.0 - vUv.x) * 0.3);
          vec3 side = normalize(cross(dir, c - cameraPosition));
          float halfW = uW * (0.35 + 0.65 * (1.0 - vUv.x)) * (1.0 + 2.0 * (1.0 - smoothstep(0.0, 0.05, vUv.x)));
          vec3 w = c + side * vUv.y * halfW;
          // (metres from the head, along and across: its glow is round whatever the tail does)
          vM = vec2(dot(w - head, -dir), vUv.y * halfW) / uW;
          vOn = step(0.0, uK) * smoothstep(0.0, 0.06, uK) * (1.0 - smoothstep(0.92, 1.0, uK));
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform float uTime;
        varying vec2 vUv; varying float vOn; varying vec2 vM;
        ${GLSL_NOISE}
        void main(){
          if (vOn < 0.003) discard;
          float across = 1.0 - smoothstep(0.0, 1.0, abs(vUv.y));
          // the tail: a soft blade, brightest along its spine, in long fine strands that thin away
          float strand = 0.6 + 0.4 * vnoise(vec2(vUv.y * 9.0, vUv.x * 3.0 - uTime * 0.2));
          float tailA = across * across * exp(-vUv.x * 3.2) * (1.0 - smoothstep(0.75, 1.0, vUv.x)) * strand;
          // the head: a small hot disc in a breath of light
          float hr = dot(vM, vM);
          float head = exp(-hr * 22.0) * 3.0 + exp(-hr * 3.0) * 0.5;
          vec3 col = uTint * tailA * 0.42 + mix(uTint, vec3(1.0, 0.98, 0.9), 0.7) * head;
          gl_FragColor = vec4(col * vOn, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { g, mat };
  }, [world, id]);
  // its seconds are counted on the sky's own clock from the moment it is let go
  const t0 = useRef(-1);
  useFrame(() => {
    if (!m.on) {
      t0.current = -1;
      b.mat.uniforms.uK.value = -1;
      return;
    }
    if (t0.current < 0) t0.current = SKY_U.uTime.value;
    const k = (SKY_U.uTime.value - t0.current) / seconds;
    b.mat.uniforms.uK.value = k <= 1 ? k : -1;
  });
  return <mesh geometry={b.g} material={b.mat} frustumCulled={false} renderOrder={5} />;
}
