"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { postCtl } from "../Post";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { LightGate, LightPath, type WorldProps } from "./common";
import { setWorldAir } from "./kit";
import FairyWorld from "./Fairy";
import FuneralWorld from "./Funeral";
import GateWorld from "./Gate";
import KingsWorld, { dropKings, prepareKings } from "./Kings";
import ParadiseWorld from "./Paradise";
import RexWorld from "./Rex";
import SeaWorld from "./Sea";
import StarsWorld from "./Stars";
import SunWorld from "./Sun";
import { ORIGIN, WORLDS, WORLD_ORDER, entryOf, gateOf, groundAt, pathOf, useWorld, voyage, type WorldId } from "./voyage";

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
        uniforms: { ...SKY_U, uVeil: { value: 0 }, uAspect: { value: 1 }, uWarm: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uVeil; uniform float uAspect; uniform float uWarm;
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
            // the way home: not cloud but the little world's own light, brightest at the heart of the frame
            col = mix(col, vec3(2.0, 1.5, 0.84) * (1.0 - 0.34 * edge), uWarm);
            a = mix(a, smoothstep(0.0, 1.0, uVeil * 1.6 - (1.0 - edge) * 0.0 - edge * 0.45), uWarm);
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
    mat.uniforms.uWarm.value = voyage.warm;
    mat.uniforms.uAspect.value = size.width / size.height;
    if (ref.current) ref.current.visible = voyage.veil > 0.001;
  });
  return <mesh ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={1000} visible={false} />;
}

const COMPONENTS: Partial<Record<WorldId, (p: { props: WorldProps }) => ReactNode>> = { sun: SunWorld, stars: StarsWorld, rex: RexWorld, fairy: FairyWorld, paradise: ParadiseWorld, gate: GateWorld, sea: SeaWorld, funeral: FuneralWorld, kings: KingsWorld };

// While the plane flies through one world the next is made ready behind it, a little at a time, so that
// passing the gate is only cloud closing and opening:
//   1. a few seconds after the cloud has opened, the next world is mounted, hidden, as a low-priority update
//      (React builds it between frames, a piece at a time; mounting it also fetches its painting);
//   2. its shaders are handed to the driver to compile, a few objects a frame (the driver compiles them off
//      the main thread where it can);
//   3. then each of its objects is drawn once into a single pixel, one a frame, which uploads its geometry
//      and textures.
// When all three are done the world is `voyage.ready`, and the crossing keeps the cloud shut only as long as the
// sky takes to change. At most two painted worlds exist at once: the one being flown and the one after it. The
// one left behind is unmounted (and its geometry, materials and textures disposed) as the plane arrives.
type Drawn = THREE.Mesh | THREE.Points | THREE.Line;
// (step 0, for a world with something heavy in it: that is made first, a few milliseconds a frame)
const PREPARE: Partial<Record<WorldId, (props: WorldProps) => () => boolean>> = { kings: (props) => prepareKings(props) };
function useWarmWorld(cur: WorldId, props: WorldProps) {
  const { gl, camera, scene } = useThree();
  const [warm, setWarm] = useState<WorldId | null>(null);
  const group = useRef<THREE.Group | null>(null);
  const job = useRef({ id: null as WorldId | null, since: 0, list: null as Drawn[] | null, compiled: 0, drawn: 0, wait: 0, t0: 0, prep: null as (() => boolean) | null, prepFor: null as WorldId | null });
  const tiny = useMemo(() => new THREE.WebGLRenderTarget(1, 1), []);
  useEffect(() => () => tiny.dispose(), [tiny]);
  // an object whose shader uses the scene's lights cannot be lit when drawn alone: those are only compiled
  const lit = (o: Drawn) => (Array.isArray(o.material) ? o.material : [o.material]).some((m) => (m as THREE.ShaderMaterial).lights === true || (m as THREE.MeshStandardMaterial).isMeshStandardMaterial);
  // made where the world itself will be drawn (the lens's linear target, or the screen), so the same shader variants are made
  const into = (rt: THREE.WebGLRenderTarget | null, f: () => void) => {
    const prev = gl.getRenderTarget();
    try {
      gl.setRenderTarget(rt);
      f();
    } catch {
      /* made on first sight instead */
    }
    gl.setRenderTarget(prev);
  };
  useFrame(() => {
    const j = job.current;
    const now = performance.now();
    if (!voyage.flying) {
      // landed: the world that was waiting is let go
      if (warm) setWarm(null);
      if (j.prepFor) dropKings();
      j.id = j.prep = j.prepFor = null;
      j.since = 0;
      voyage.ready = null;
      return;
    }
    const next = voyage.phase === "open" && !voyage.homing ? (WORLD_ORDER[WORLD_ORDER.indexOf(cur) + 1] ?? null) : null;
    if (!next) {
      if (voyage.phase !== "open") j.since = now;
      return;
    }
    if (j.id !== next) {
      // let the world just arrived in settle (and the first moments of take-off pass) before any work is done
      if (j.since === 0) j.since = now;
      if (now - j.since < 2500) return;
      // (development: window.__noWarm = true flies the old way, every world made under the cloud, for comparing)
      if (process.env.NODE_ENV !== "production" && (window as unknown as { __noWarm?: boolean }).__noWarm) return;
      if (PREPARE[next] && j.prepFor !== next) {
        j.prepFor = next;
        j.prep = PREPARE[next]!(props);
        j.t0 = now;
      }
      if (j.prep) {
        if (j.prep()) j.prep = null;
        return;
      }
      Object.assign(j, { id: next, list: null, compiled: 0, drawn: 0, wait: 0, t0: j.prepFor === next ? j.t0 : now });
      startTransition(() => setWarm(next));
      return;
    }
    const g = group.current;
    if (!g || voyage.ready === next) return;
    if (!j.list) {
      // mounted (the transition has committed): give late pieces a few frames, then take stock
      if (++j.wait < 6) return;
      const list: Drawn[] = [];
      g.traverse((o) => {
        const d = o as Drawn;
        if (((d as THREE.Mesh).isMesh || (d as THREE.Points).isPoints || (d as THREE.Line).isLine) && d.material && d.geometry) list.push(d);
      });
      j.list = list;
      j.wait = 0;
      return;
    }
    const rt = postCtl.sceneTarget ?? null;
    if (j.compiled < j.list.length) {
      // shaders: a few objects a frame, inside a small budget
      const t = performance.now();
      into(rt, () => {
        while (j.compiled < j.list!.length && performance.now() - t < 3) gl.compile(j.list![j.compiled++], camera, scene);
      });
      return;
    }
    // give the driver a moment to finish compiling before anything is drawn with those shaders
    if (++j.wait < 24) return;
    if (j.drawn < j.list.length) {
      const o = j.list[j.drawn++];
      if (lit(o) || !o.parent) return;
      // one pixel is enough to upload its buffers and textures
      const fc = o.frustumCulled;
      const ac = gl.autoClear;
      o.frustumCulled = false;
      gl.autoClear = false;
      if (rt) {
        const st = rt.scissorTest;
        const sc = rt.scissor.clone();
        rt.scissorTest = true;
        rt.scissor.set(0, 0, 1, 1);
        into(rt, () => gl.render(o, camera));
        rt.scissorTest = st;
        rt.scissor.copy(sc);
      } else into(tiny, () => gl.render(o, camera));
      gl.autoClear = ac;
      o.frustumCulled = fc;
      return;
    }
    voyage.ready = next;
    if (process.env.NODE_ENV !== "production") console.info(`[voyage] ${next} is warm: ${j.list.length} objects made, compiled and uploaded in ${Math.round(performance.now() - j.t0)} ms while flying ${cur}`);
  });
  // a new world to fly: the clock for warming the one after it starts again
  // (arriving anywhere but in the world that was waiting, as a jump in development does, lets that one go)
  useEffect(() => {
    Object.assign(job.current, { since: performance.now(), id: null, list: null, prep: null });
    if (warm && warm !== cur) setWarm(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);
  return { warm, group };
}

export function Worlds(props: WorldProps) {
  const id = useWorld();
  // the air of the world that stands, set before anything of it is drawn
  useMemo(() => {
    const def = WORLDS[id];
    setWorldAir(def.fog);
  }, [id]);
  useFrame(() => {
    voyage.frames++;
  });
  const { warm, group } = useWarmWorld(id, props);
  // the world that stands and, hidden, the one being made ready (never more than these two)
  const ids = [id, warm].filter((w, i, a): w is WorldId => !!w && w !== "home" && a.indexOf(w) === i);
  return (
    <>
      {id === "home" && (
        <>
          <LightPath id="home" def={WORLDS.home} angels effects={props.effects} from={10} />
          <LightGate id="home" def={WORLDS.home} />
        </>
      )}
      {ids.map((w) => {
        const Comp = COMPONENTS[w];
        return (
          <group key={w} position={ORIGIN} visible={w === id} ref={w === id ? undefined : group}>
            {Comp && <Comp props={props} />}
          </group>
        );
      })}
      <Veil />
    </>
  );
}
