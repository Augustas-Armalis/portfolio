"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { postCtl } from "../Post";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { CAVE_GATE } from "../home/journey";
import { PortalView, PortalWindow, portalRig } from "./portal";
import { LightGate, LightPath, type WorldProps } from "./common";
import { Birds, type Flock } from "./life";
import { PlayFrame } from "./play";
import { setWorldAir } from "./kit";
import FairyWorld from "./Fairy";
import FriendshipWorld, { dropFriendship, prepareFriendship } from "./Friendship";
import FuneralWorld, { prepareFuneral } from "./Funeral";
import GateWorld from "./Gate";
import KingsWorld, { dropKings, prepareKings } from "./Kings";
import ParadiseWorld from "./Paradise";
import RexWorld, { prepareRex } from "./Rex";
import SeaWorld from "./Sea";
import SeaFinaleWorld from "./SeaFinale";
import StarsWorld, { prepareStars } from "./Stars";
import SunWorld from "./Sun";
import { ORIGIN, WORLDS, WORLD_ORDER, entryOf, gateOf, groundAt, originOf, pathOf, useWorld, voyage, type WorldId } from "./voyage";

// dev: the map, for framing stills from the console
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") Object.assign(window, { __worlds: { WORLDS, ORIGIN, groundAt, gateOf, pathOf, entryOf } });

// Which world stands: the desk's own field, or one of the painted worlds at
// its far centre. Exactly one is drawn. The cloud that covers the change is
// here too.

// The home field's own things (hills, trees, lake, grass) are wrapped in this
// so they are not even submitted while the plane is in another world.
// (a gate's window draws the next world by itself for a moment: it needs to know what is home's, to leave it out)
const homeRef = (g: THREE.Group | null) => {
  if (g) portalRig.home.add(g);
  else portalRig.home.forEach((o) => !o.parent && portalRig.home.delete(o));
};
export function HomeWorld({ children }: { children: ReactNode }) {
  const id = useWorld();
  return (
    <group visible={id === "home"} ref={homeRef}>
      {children}
    </group>
  );
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

// (a loose skein over the avenue, about where the wood closes in, and a few further on by the gate)
const HOME_FLOCKS: Flock[] = [
  { c: [1.4, 8.5, -78], r: 13, n: 9, size: 0.34, speed: 5.5, spread: 5 },
  { c: [-3, 12, -150], r: 20, n: 7, size: 0.38, speed: 6.5, spread: 6 },
];

const COMPONENTS: Partial<Record<WorldId, (p: { props: WorldProps }) => ReactNode>> = { friendship: FriendshipWorld, sun: SunWorld, stars: StarsWorld, rex: RexWorld, fairy: FairyWorld, paradise: ParadiseWorld, gate: GateWorld, sea: SeaWorld, seafinale: SeaFinaleWorld, funeral: FuneralWorld, kings: KingsWorld };

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
const PREPARE: Partial<Record<WorldId, (props: WorldProps) => () => boolean>> = { friendship: (props) => prepareFriendship(props), kings: (props) => prepareKings(props), stars: (props) => prepareStars(props), funeral: (props) => prepareFuneral(props), rex: (props) => prepareRex(props) };
const tag = { v: "" };
function useWarmWorld(cur: WorldId, props: WorldProps) {
  const { gl, camera, scene } = useThree();
  const [warm, setWarm] = useState<WorldId | null>(null);
  const group = useRef<THREE.Group | null>(null);
  const job = useRef({ id: null as WorldId | null, since: 0, list: null as Drawn[] | null, compiled: 0, pending: 0, t1: 0, drawn: 0, wait: 0, t0: 0, prep: null as (() => boolean) | null, prepFor: null as WorldId | null, closing: null as WorldId | null });
  // (one half-float pixel, no samples: the lens's own target is multisampled, and every switch back from it would resolve the
  // whole frame; the shaders made are the same, the target's type is what they are keyed on)
  const tiny = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true }), []);
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
  const warmStep = () => {
    const j = job.current;
    const now = performance.now();
    if (!voyage.flying) {
      // landed: the world that was waiting is let go
      if (warm) setWarm(null);
      if (j.prepFor) {
        dropKings();
        dropFriendship();
      }
      j.id = j.prep = j.prepFor = j.closing = null;
      voyage.prep = null;
      j.since = 0;
      voyage.ready = null;
      return;
    }
    const next = voyage.phase === "open" && !voyage.homing ? (WORLD_ORDER[WORLD_ORDER.indexOf(cur) + 1] ?? null) : null;
    if (!next) {
      if (voyage.phase !== "open") j.since = now;
      // the cloud is closing on a world that was not made ready (a jump from the Worlds list): its heavy part is
      // handed to the plane to make in slices under the cloud, instead of all at once in the frame it is swapped in
      const to = voyage.phase === "closing" ? voyage.next : null;
      if (!to) j.closing = null;
      else if (j.closing !== to) {
        j.closing = to;
        if (PREPARE[to] && voyage.ready !== to) {
          // (if it was already being made ahead of time, the same work is carried on, not begun again)
          voyage.prep = j.prepFor === to && j.prep ? j.prep : PREPARE[to]!(props);
          j.prep = null;
          j.prepFor = to;
        }
      }
      return;
    }
    if (j.id !== next) {
      // let the world just arrived in settle (and the first moments of take-off pass) before any work is done
      if (j.since === 0) j.since = now;
      // (from home it begins as soon as the plane is clear of the desk: the first gate must always find its world
      // ready, and the first crossing be through the window)
      if (now - j.since < (cur === "home" ? 500 : 800)) return;
      // (development: window.__noWarm = true flies the old way, every world made under the cloud, for comparing)
      if (process.env.NODE_ENV !== "production" && (window as unknown as { __noWarm?: boolean }).__noWarm) return;
      if (PREPARE[next] && j.prepFor !== next) {
        j.prepFor = next;
        j.prep = PREPARE[next]!(props);
        j.t0 = now;
      }
      if (j.prep) {
        tag.v = "prep " + next;
        if (j.prep()) j.prep = null;
        return;
      }
      Object.assign(j, { id: next, list: null, compiled: 0, pending: 0, drawn: 0, wait: 0, t0: j.prepFor === next ? j.t0 : now });
      tag.v = "mount " + next;
      startTransition(() => setWarm(next));
      return;
    }
    const g = group.current;
    if (!g || voyage.ready === next) return;
    if (!j.list) {
      // mounted (the transition has committed): give late pieces a few frames, then take stock
      if (++j.wait < 6) return;
      tag.v = "list";
      const list: Drawn[] = [];
      g.traverse((o) => {
        const d = o as Drawn;
        if (((d as THREE.Mesh).isMesh || (d as THREE.Points).isPoints || (d as THREE.Line).isLine) && d.material && d.geometry) list.push(d);
      });
      j.list = list;
      j.wait = 0;
      return;
    }
    // (a little a frame, about four milliseconds; but the nearer the gate and the world still not warm, the more: the
    // window must be there by the time the plane is, and a slice of a few frames is better than cloud)
    const gt = gateOf(cur);
    const dGate = gt ? gt.pos.clone().add(originOf(cur)).distanceTo(voyage.planePos) : 1e9;
    const slice = dGate < 600 ? 12 : dGate < 1200 ? 7 : 4;
    if (j.compiled < j.list.length) {
      // shaders: a few objects a frame, each handed to the driver to compile off this thread (compileAsync)
      const t = performance.now();
      tag.v = "compile";
      into(tiny, () => {
        while (j.compiled < j.list!.length && performance.now() - t < slice) {
          j.pending++;
          const done = () => void j.pending--;
          try {
            gl.compileAsync(j.list![j.compiled++], camera, scene).then(done, done);
          } catch {
            done();
          }
        }
      });
      j.wait = 0;
      j.t1 = performance.now();
      return;
    }
    // the driver finishes compiling in its own time: draw nothing with those shaders until it has (or three seconds)
    if (j.pending > 0 && performance.now() - j.t1 < 3000) return;
    if (++j.wait < 3) return;
    if (j.drawn < j.list.length) {
      // (as many a frame as fit in three milliseconds, not one a frame: a world of four hundred things took four
      // hundred frames, and a brisk flight from home could reach the gate first. One slow thing ends the frame's share.)
      const t = performance.now();
      tag.v = "draw";
      while (j.drawn < j.list.length && performance.now() - t < slice) {
        const o = j.list[j.drawn++];
        if (lit(o) || !o.parent) continue;
        // one pixel is enough to upload its buffers and textures
        const fc = o.frustumCulled;
        const ac = gl.autoClear;
        o.frustumCulled = false;
        gl.autoClear = false;
        const td = performance.now();
        into(tiny, () => gl.render(o, camera));
        if (process.env.NODE_ENV !== "production" && performance.now() - td > 30) ((window as unknown as { __slow?: unknown[] }).__slow ??= []).push([o.name || o.type, (o.geometry as THREE.BufferGeometry).attributes?.position?.count, Math.round(performance.now() - td), Array.isArray(o.material) ? "multi" : (o.material as THREE.Material).type]);
        gl.autoClear = ac;
        o.frustumCulled = fc;
      }
      return;
    }
    voyage.ready = next;
    if (process.env.NODE_ENV !== "production") console.info(`[voyage] ${next} is warm: ${j.list.length} objects made, compiled and uploaded in ${Math.round(performance.now() - j.t0)} ms while flying ${cur}`);
  };
  useFrame(() => {
    const t = performance.now();
    tag.v = "";
    warmStep();
    const ms = performance.now() - t;
    if (process.env.NODE_ENV !== "production" && ms > 12) ((window as unknown as { __wlog?: unknown[] }).__wlog ??= []).push([Math.round(t), tag.v, Math.round(ms)]);
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
  // dev: the scene itself, for audits from the console (what is drawn, with which material)
  const root = useThree((s) => s.scene);
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __three: root });
  }, [root]);
  // the air of the world that stands, set before anything of it is drawn
  useMemo(() => {
    const def = WORLDS[id];
    setWorldAir(def.fog);
  }, [id]);
  // A world that was not made ready ahead of time (a jump from the Worlds list) is shown to the renderer a few
  // things a frame under the closed cloud, so its shaders are compiled and its buffers uploaded over many short
  // frames instead of one long one; the cloud does not open (voyage.frames stays at 0) until all of it is there.
  const stand = useRef<THREE.Group | null>(null);
  const reveal = useRef({ id: null as WorldId | null, on: false, list: null as THREE.Object3D[] | null, i: 0 });
  useFrame(() => {
    const rv = reveal.current;
    if (rv.id !== id) Object.assign(rv, { id, on: id !== "home" && voyage.phase === "hold" && !voyage.quick, list: null, i: 0 });
    if (rv.on) {
      const g = stand.current;
      if (!g) {
        voyage.frames = 0;
        return;
      }
      if (!rv.list) {
        const list: THREE.Object3D[] = [];
        g.traverse((o) => {
          const d = o as Drawn;
          if (((d as THREE.Mesh).isMesh || (d as THREE.Points).isPoints || (d as THREE.Line).isLine) && d.visible) {
            d.visible = false;
            list.push(d);
          }
        });
        rv.list = list;
      }
      const n = Math.min(rv.list.length, rv.i + 2);
      for (; rv.i < n; rv.i++) rv.list[rv.i].visible = true;
      if (rv.i < rv.list.length && voyage.phase === "hold") {
        voyage.frames = 0;
        return;
      }
      // (all shown; or the cloud is opening after all: nothing stays hidden)
      for (; rv.i < rv.list.length; rv.i++) rv.list[rv.i].visible = true;
      rv.on = false;
    }
    voyage.frames++;
  });
  const { warm, group } = useWarmWorld(id, props);
  // the world that stands and, hidden, the one being made ready (never more than these two)
  const ids = [id, warm].filter((w, i, a): w is WorldId => !!w && w !== "home" && a.indexOf(w) === i);
  return (
    <>
      {id === "home" && (
        <group ref={homeRef}>
          <LightPath id="home" def={WORLDS.home} angels={false} effects={props.effects} from={10} />
          {/* the home gate is the veil inside the cave's arch (home/journey.ts, home/Cave.tsx draw the stone) */}
          <LightGate id="home" def={WORLDS.home} look="veil" half={CAVE_GATE.half} rise={CAVE_GATE.rise} gain={0.3} />
          {/* and the next world seen live through it, crossed into at once (portal.tsx) */}
          <PortalWindow id="home" def={WORLDS.home} half={CAVE_GATE.half} rise={CAVE_GATE.rise} fallback />
          {/* a small flock over the road that parts round the plane as it passes (worlds/play.tsx) */}
          {props.effects > 0.25 && <Birds flocks={HOME_FLOCKS} scatter={15} seed={11} />}
        </group>
      )}
      {ids.map((w) => {
        const Comp = COMPONENTS[w];
        return (
          <group
            key={w}
            position={ORIGIN}
            visible={w === id}
            ref={(g) => {
              (w === id ? stand : group).current = g;
              // (which of the two is which, for the gate's window)
              if (w === id) portalRig.stand = g;
              else {
                portalRig.warm = g;
                portalRig.warmId = g ? w : null;
              }
            }}
          >
            {Comp && <Comp props={props} />}
          </group>
        );
      })}
      <PlayFrame />
      <PortalView mobile={props.mobile} />
      <Veil />
    </>
  );
}
