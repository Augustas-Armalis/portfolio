"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { LightGate, LightPath, type WorldProps } from "./common";
import { WORLD_U } from "./kit";
import FairyWorld from "./Fairy";
import GateWorld from "./Gate";
import ParadiseWorld from "./Paradise";
import RexWorld from "./Rex";
import SeaWorld from "./Sea";
import StarsWorld from "./Stars";
import SunWorld from "./Sun";
import { ORIGIN, WORLDS, entryOf, gateOf, groundAt, pathOf, useWorld, voyage, type WorldId } from "./voyage";

// dev: the map, for framing stills from the console
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") Object.assign(window, { __worlds: { WORLDS, ORIGIN, groundAt, gateOf, pathOf, entryOf } });

// Which world stands: the desk's own field, or one of the painted worlds at
// its far centre. Exactly one is drawn. The cloud that covers the change is
// here too.

// The home field's own things (hills, trees, lake, grass) are wrapped in this
// so they are not even submitted while the plane is in another world.
export function HomeWorld({ children }: { children: ReactNode }) {
  const id = useWorld();
  return <group visible={id === "home"}>{children}</group>;
}

// The cloud over the lens. It closes from the edges of the frame in soft
// lobes, is one even colour when shut (the air's own), and opens the same way.
function Veil() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { ...SKY_U, uVeil: { value: 0 }, uAspect: { value: 1 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uVeil; uniform float uAspect;
          varying vec2 vUv;
          ${GLSL_NOISE}
          ${GLSL_SKY}
          void main(){
            vec2 p = vUv * vec2(uAspect, 1.0);
            float n = fbm(p * 1.3 + vec2(uTime * 0.05, -uTime * 0.035)) * 0.65 + fbm(p * 3.1 - vec2(uTime * 0.07, 0.0) + 9.0) * 0.35;
            // thick at the edges first, the middle of the frame last
            float edge = smoothstep(0.0, 1.5, length(p));
            float a = clamp(uVeil * 2.3 - (1.0 - n) * 0.9 - (1.0 - edge) * 0.4, 0.0, 1.0);
            a = a * a * (3.0 - 2.0 * a);
            vec3 col = (uHorizon * 1.02 + uSkyCol * 0.22) * (0.94 + 0.12 * n * (1.0 - uVeil * uVeil));
            gl_FragColor = vec4(col, a);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  );
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    return g;
  }, []);
  useFrame(({ size }) => {
    mat.uniforms.uVeil.value = voyage.veil;
    mat.uniforms.uAspect.value = size.width / size.height;
    if (ref.current) ref.current.visible = voyage.veil > 0.001;
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={1000} visible={false} />;
}

const COMPONENTS: Partial<Record<WorldId, (p: { props: WorldProps }) => ReactNode>> = { sun: SunWorld, stars: StarsWorld, rex: RexWorld, fairy: FairyWorld, paradise: ParadiseWorld, gate: GateWorld, sea: SeaWorld };

export function Worlds(props: WorldProps) {
  const id = useWorld();
  // the air of the world that stands, set before anything of it is drawn
  useMemo(() => {
    const def = WORLDS[id];
    WORLD_U.uFogD.value = def.fog[0];
    WORLD_U.uFogH.value = def.fog[1];
  }, [id]);
  useFrame(() => {
    voyage.frames++;
  });
  const Comp = COMPONENTS[id];
  return (
    <>
      {id === "home" ? (
        <>
          <LightPath id="home" def={WORLDS.home} angels effects={props.effects} from={10} />
          <LightGate id="home" def={WORLDS.home} />
        </>
      ) : (
        <group key={id} position={ORIGIN}>
          {Comp && <Comp props={props} />}
        </group>
      )}
      <Veil />
    </>
  );
}
