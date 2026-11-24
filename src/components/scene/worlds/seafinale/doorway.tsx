"use client";

import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { Halos, useDisposable } from "../common";
import { GLSL_AIR, Kit, WORLD_U, makeTempera, makePoints, pointsGeometry, type Halo, type V3 } from "../kit";
import { PortalWindow } from "../portal";
import { gateOf, type WorldDef } from "../voyage";
import { FINALE_OPENING } from "./shape";

// The way on out of the Finale: a pointed doorway carved into the end of the wave's hollow. Its sides stand in the
// water (the face and the sea hide its feet, so it is cut out of the wave and not set in front of it), the curl of
// the crest is over its head, and the plane comes along the tube straight at its middle. A frame of lit foam runs
// round it, a thin sheet of the next world's light fills it from far off, and nearer the window onto that world
// (worlds/portal.tsx) takes its place.
export default function FinaleDoorway({ def }: { def: WorldDef }) {
  const b = useDisposable(() => {
    const gate = gateOf("seafinale")!;
    const [half, rise, reach] = FINALE_OPENING;
    const c = Math.cos(gate.yaw);
    const s = Math.sin(gate.yaw);
    // the outline in the doorway's own plane (u across, y up from the way), as the lancet is drawn everywhere else
    const spring = 2;
    const arc = (side: number, n: number): [number, number][] => {
      const out: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const a = ((i / n) * Math.PI) / 3;
        out.push([side * (half - 2 * half * (1 - Math.cos(a))), spring + 2 * half * Math.sin(a) * ((rise - spring) / (half * 1.732))]);
      }
      return out;
    };
    const at = (u: number, y: number): V3 => [gate.pos.x + c * u, gate.pos.y + y, gate.pos.z - s * u];
    // the frame: two great ribs of foam, up from under the water and meeting in the point, with a thread of light on the inside
    const k = new Kit();
    const foam: V3 = [0.86, 0.94, 0.9];
    for (const side of [-1, 1]) {
      const leg = [[side * half, -reach] as [number, number], [side * half, -reach * 0.4] as [number, number], [side * half, spring - 30] as [number, number], ...arc(side, 14)];
      k.tube(leg.map(([u, y]) => at(u * 1.0, y)), 6.5, foam, { glow: 0.5, seg: 90, sides: 8 });
      k.tube(
        leg.map(([u, y]) => at(u - side * 8, y)),
        1.6,
        [1, 0.92, 0.66],
        { glow: 2.4, seg: 90, sides: 5 },
      );
    }
    // the lancet's sheet
    const shape = new THREE.Shape();
    shape.moveTo(-half, -reach);
    shape.lineTo(-half, spring);
    const l = arc(-1, 14);
    for (const [u, y] of l) shape.lineTo(u, y);
    const r = arc(1, 14).reverse();
    for (const [u, y] of r) shape.lineTo(u, y);
    shape.lineTo(half, -reach);
    const sheetGeo = new THREE.ShapeGeometry(shape, 6);
    const sheet = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...WORLD_U, uSpan: { value: new THREE.Vector3(half, reach, rise) } },
      vertexShader: /* glsl */ `varying vec2 vP; varying vec3 vWorld; void main(){ vP = position.xy; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSpan; varying vec2 vP; varying vec3 vWorld;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          float t = uTime;
          // across the sheet, how near its edge (1 on it): sides, and the head
          float head = clamp((vP.y - 2.0) / max(uSpan.z - 2.0, 1.0), 0.0, 1.0);
          float wide = sqrt(max(1.0 - head * head, 0.0));
          float edge = max(abs(vP.x) / max(uSpan.x * wide, 1.0), head);
          vec2 w = vP + (vec2(fbm(vP * 0.012 + vec2(t * 0.03, 0.0)), fbm(vP * 0.012 + vec2(4.1, -t * 0.03))) - 0.5) * 40.0;
          // the light of Tranquility: gold at the way's height, a clear green over it, deepening to teal up in the point
          vec3 gold = vec3(1.0, 0.86, 0.5);
          vec3 sea = vec3(0.36, 0.74, 0.66);
          float up = smoothstep(-60.0, uSpan.z, w.y);
          vec3 col = mix(gold, sea, up * 0.9);
          float n = fbm(vec2(w.x * 0.02 + t * 0.02, w.y * 0.012 - t * 0.04));
          float caustic = pow(1.0 - abs(sin((n * 3.0 + w.y * 0.004) * 6.2832)), 18.0);
          // shafts: long upright strokes of light through it, as through water seen from under
          float shaft = vnoise(vec2(w.x * 0.045, t * 0.05 + w.y * 0.002)) * 0.6 + vnoise(vec2(w.x * 0.13 + 3.0, t * 0.08)) * 0.4;
          col *= 0.55 + 0.7 * n + caustic * 0.5 + shaft * 0.5;
          // brightest at the way's own height in the middle, going out at the edge into the lit rim
          float core = exp(-dot(vec2(vP.x / uSpan.x, (vP.y - 40.0) / (uSpan.z * 0.7)), vec2(vP.x / uSpan.x, (vP.y - 40.0) / (uSpan.z * 0.7))) * 1.6);
          col += vec3(1.0, 0.9, 0.62) * core * 0.55;
          float rim = smoothstep(0.84, 0.98, edge) * (1.0 - smoothstep(0.985, 1.0, edge));
          col += vec3(1.0, 0.92, 0.7) * rim * 0.9;
          float breath = 0.92 + 0.08 * sin(t * 0.8);
          float a = (0.34 + 0.4 * core + 0.12 * shaft + rim * 0.4) * (1.0 - smoothstep(0.96, 1.0, edge)) * (0.4 + 0.6 * smoothstep(-300.0, 20.0, vP.y));
          float dist = length(vWorld - cameraPosition);
          vec3 aired = applyAir(col, vWorld);
          col = mix(aired, col, 0.8);
          gl_FragColor = vec4(col * 1.2 * breath, clamp(a, 0.0, 0.88) * smoothstep(1.0, 30.0, dist));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const halos: Halo[] = [
      { p: [gate.pos.x, gate.pos.y + rise * 0.3, gate.pos.z], size: half * 3.4, col: [1, 0.9, 0.62], k: 0.32 },
      { p: [gate.pos.x, gate.pos.y + rise * 0.78, gate.pos.z], size: half * 1.4, col: [1, 0.96, 0.8], k: 0.4 },
    ];
    // motes of light drifting up in front of the doorway, and a few seen in it
    const motes = pointsGeometry(
      120,
      (i, q) => {
        const u = (q() - 0.5) * half * 2.2;
        const y = -reach * 0.3 + q() * (rise + reach * 0.3);
        const w = (q() - 0.5) * 60;
        return [gate.pos.x + c * u + s * w, gate.pos.y + y, gate.pos.z - s * u + c * w, 1.2 + q() * 2.4];
      },
      31,
    );
    return {
      frame: k.build(),
      frameMat: makeTempera({ amb: 1.0, key: 0.5, rim: [0.9, 0.96, 0.8], rimPow: 2.5, wrap: 0.4 }),
      sheetGeo,
      sheet,
      halos,
      motes,
      moteMat: makePoints({ a: [1, 0.9, 0.62], b: [0.9, 1, 0.9], scale: 180, drift: 4, gain: 1.1, max: 22 }),
      pos: gate.pos.toArray() as V3,
      yaw: gate.yaw,
    };
  }, []);
  return (
    <>
      <mesh geometry={b.frame} material={b.frameMat} />
      <PortalWindow id="seafinale" def={def} half={FINALE_OPENING[0]} rise={FINALE_OPENING[1]} />
      <mesh geometry={b.sheetGeo} material={b.sheet} position={b.pos} rotation={[0, b.yaw, 0]} renderOrder={5} />
      <Halos list={b.halos} kind={2} />
      <points geometry={b.motes} material={b.moteMat} />
    </>
  );
}
