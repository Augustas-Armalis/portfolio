"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { POST_U, postCtl } from "../Post";
import { GLSL_SKY, SKY_U, applySky, clockHours, skyState, type SkyState } from "../sky";
import { GLSL_AIR, WORLD_U, setWorldAir } from "./kit";
import { GLSL_HOME_AIR, HOME_U } from "../home/land";
import { FINALE_OPENING } from "./seafinale/shape";
import { WORLDS, WORLD_ORDER, entryOf, gateOf, groundAt, originOf, voyage, voyageSky, type WorldDef, type WorldId } from "./voyage";

// Gates are windows. As the plane nears a gate the opening shows the next world itself, live: that world (already
// made and warm, hidden at the same place) is drawn into a small target from an eye that stands to its entry
// exactly as the visitor's eye stands to the gate, and the gate's opening shows that picture pixel for pixel
// where it falls on the screen, so near things in it slide against far ones as the plane moves (true parallax)
// and what is seen through the gate is what will be flown into. Going through, the worlds are simply exchanged
// (Plane.tsx carries the plane across with the same turn and offset): the picture in the window becomes the
// scene, under a breath of cloud at the frame's edges instead of the long closed cloud.
//
// Bounded: only within 320 m of the gate, only once the next world is warm (voyage.ready), at 0.4 of the frame
// each way (a sixth of its pixels), every third frame until the last seventy metres and every frame from there.
// Never on Low or on a phone, and never when anything is missing: then the gate is today's veil and cloud.
//
//   <PortalView mobile />                 once, beside the worlds (Worlds.tsx): draws the next world's picture
//   <PortalWindow id def half rise />     at a world's gate (WorldBase gives every world one): shows it
//   portalReady(to)                       Plane.tsx: may this crossing be made through the window, now?
//   portalSwap(to)                        Plane.tsx: the worlds change places this instant (shown, sky and air)
//   gateToEntry(from, to, m)              the move that carries a point at `from`'s gate to `to`'s entry; returns the turn

// what stands and what waits, as the scene graph has them (Worlds.tsx keeps these up to date)
// (`windows`: the worlds whose gate has a window mounted in it: without one a crossing is never made this way)
export const portalRig = { stand: null as THREE.Object3D | null, warm: null as THREE.Object3D | null, warmId: null as WorldId | null, home: new Set<THREE.Object3D>(), windows: new Map<WorldId, number>(), gl: null as THREE.WebGLRenderer | null, close: 0 };

// (uPortalGain: the picture is that world's light, but the frame is still exposed for this one until the plane is
// through: it is shown at the brightness it will have on the far side)
export const PORTAL_U = { tPortal: { value: null as THREE.Texture | null }, uPortalK: { value: 0 }, uPortalRes: { value: new THREE.Vector2(1, 1) }, uPortalGain: { value: 1 } };
// From afar the window shows a still: one sharp picture of the next world taken from its entry, made once when that
// world is warm, and looked up by the direction from the eye through each point of the opening (carried by the same
// turn), so it turns with the eye as the live picture does and costs nothing a frame. Close in (from 130 m to 90 m)
// the live picture takes over; the last stretch is drawn live at the frame's full size, every frame, so the frame
// after the worlds change places is the frame before.
const STILL_U = { tStill: { value: null as THREE.Texture | null }, uStillMat: { value: new THREE.Matrix4() }, uStillOn: { value: 0 }, uLiveK: { value: 0 } };
const OPENING: Partial<Record<WorldId, [number, number, number?]>> = { sun: [23, 33], stars: [50, 80, 32], rex: [40, 72], fairy: [18, 27, 74], paradise: [14.5, 22.5], gate: [35, 93], seafinale: FINALE_OPENING, sea: [27, 27], funeral: [26, 40] };
const state = { next: null as WorldId | null, k: 0, fresh: 0, tick: 0, still: null as WorldId | null, live: 0 };

const E = new THREE.Vector3();
const G = new THREE.Vector3();
// How high above or below the gate's middle a thing was, as it is carried to the entry: kept within a few metres
// of the entry's own height (a gate taken at its foot, or one that stands far above its world, would otherwise set
// the plane down at the water's edge to climb back to its way). The window's eye is carried by the same rule, so
// what is seen through the gate is still exactly what is flown into.
export const carried = { gateY: 0, entryY: 0 };
export const carryY = (y: number) => carried.entryY + THREE.MathUtils.clamp(y - carried.gateY, -5, 9);
const M1 = new THREE.Matrix4();
const M2 = new THREE.Matrix4();
export function gateToEntry(from: WorldId, to: WorldId, out: THREE.Matrix4): number | null {
  const g = gateOf(from);
  if (!g) return null;
  const e = entryOf(to);
  G.copy(g.pos).add(originOf(from));
  E.copy(e.pos).add(originOf(to));
  const turn = e.yaw - g.yaw;
  carried.gateY = G.y;
  carried.entryY = E.y;
  // p' = E + R(turn) (p - G)
  out.makeTranslation(E.x, E.y, E.z).multiply(M1.makeRotationY(turn)).multiply(M2.makeTranslation(-G.x, -G.y, -G.z));
  return turn;
}

// the sky a world has when it stands (the same the voyage would give it)
const skies = new Map<WorldId, SkyState>();
function skyOf(id: WorldId): SkyState {
  let s = skies.get(id);
  if (s) return s;
  const keep = { cur: voyage.cur, skyFrom: voyage.skyFrom, lastSky: voyage.lastSky, skyMod: voyage.skyMod };
  voyage.cur = id;
  voyage.skyFrom = null;
  voyage.skyMod = null;
  s = voyageSky(skyState(clockHours()), 0);
  Object.assign(voyage, keep);
  // (home's sky is the hour's: not kept)
  if (WORLDS[id].air) skies.set(id, s);
  return s;
}

export const portalReady = (to: WorldId) => state.next === to && state.k > 0.6 && state.fresh > 0 && portalRig.warmId === to && !!portalRig.warm;

export function portalSwap(to: WorldId) {
  if (portalRig.stand) portalRig.stand.visible = false;
  if (portalRig.warm && portalRig.warmId === to) portalRig.warm.visible = true;
  portalRig.home.forEach((o) => (o.visible = to === "home"));
  const sky = skyOf(to);
  applySky(sky);
  setWorldAir(WORLDS[to].fog);
  // (and the frame is exposed for that world from this very frame, as the window's picture already was)
  if (portalRig.gl) portalRig.gl.toneMappingExposure = sky.exposure;
  state.next = null;
  state.k = 0;
  state.fresh = 0;
  PORTAL_U.uPortalK.value = 0;
}

export function PortalView({ mobile }: { mobile: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const rig = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, depthBuffer: true });
    const still = new THREE.WebGLRenderTarget(1440, 900, { type: THREE.HalfFloatType, depthBuffer: true, samples: 4 });
    return { rt, still, stillCam: new THREE.PerspectiveCamera(56, 1.6, 0.5, 12000), m: new THREE.Matrix4(), r: new THREE.Matrix4(), cam: new THREE.PerspectiveCamera(), buf: new THREE.Vector2(), gate: new THREE.Vector3(), scale: new THREE.Vector3() };
  }, []);
  useEffect(() => {
    portalRig.gl = gl;
  }, [gl]);
  useEffect(
    () => () => {
      rig.rt.dispose();
      rig.still.dispose();
      STILL_U.tStill.value = null;
      STILL_U.uStillOn.value = 0;
      state.still = null;
      PORTAL_U.tPortal.value = null;
      PORTAL_U.uPortalK.value = 0;
      state.next = null;
      state.k = 0;
      state.fresh = 0;
    },
    [rig],
  );
  // that world shown and this one not, under its own sky and air, for the length of one draw into `target`
  const drawNext = (cur: WorldId, next: WorldId, cam: THREE.Camera, target: THREE.WebGLRenderTarget) => {
    const stand = portalRig.stand;
    const warm = portalRig.warm!;
    const homeWas: [THREE.Object3D, boolean][] = [];
    portalRig.home.forEach((o) => homeWas.push([o, o.visible]));
    const standWas = stand?.visible ?? false;
    if (stand) stand.visible = false;
    portalRig.home.forEach((o) => (o.visible = false));
    warm.visible = true;
    const skyWas = voyage.lastSky;
    applySky(skyOf(next));
    setWorldAir(WORLDS[next].fog);
    const k0 = PORTAL_U.uPortalK.value;
    PORTAL_U.uPortalK.value = 0;
    // (and without this side's mist: SKY_U.uMist is this world's cloud, forest fog or cave haze, which every material
    // of that world would otherwise wear in the picture and drop the frame after the swap)
    const mist0 = SKY_U.uMist.value;
    SKY_U.uMist.value = 0;
    const lin = POST_U.uLinearOut.value;
    POST_U.uLinearOut.value = 1;
    const prev = gl.getRenderTarget();
    // (no shadow pass for the picture: the room asks for the shadow map by hand each frame, and that asking is kept
    // for the real draw, or the next world's shadows are drawn here and this one goes a frame without its own)
    const shadows = gl.shadowMap.autoUpdate;
    const shadowDue = gl.shadowMap.needsUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = false;
    try {
      gl.setRenderTarget(target);
      gl.clear();
      gl.render(scene, cam);
    } finally {
      gl.setRenderTarget(prev);
      gl.shadowMap.autoUpdate = shadows;
      gl.shadowMap.needsUpdate = shadowDue;
      POST_U.uLinearOut.value = lin;
      PORTAL_U.uPortalK.value = k0;
      SKY_U.uMist.value = mist0;
      setWorldAir(WORLDS[cur].fog);
      if (skyWas) applySky(skyWas);
      warm.visible = false;
      if (stand) stand.visible = standWas;
      homeWas.forEach(([o, v]) => (o.visible = v));
    }
    return skyWas;
  };
  // (after the frame's own movement, before the lens draws it: Post's draw is at priority 1)
  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const cur = voyage.cur;
    const next = WORLD_ORDER[WORLD_ORDER.indexOf(cur) + 1] ?? null;
    const gate = gateOf(cur);
    const target = postCtl.sceneTarget;
    let want = 0;
    let d = 1e9;
    const able = !mobile && postCtl.level >= 1 && !!target && (portalRig.windows.get(cur) ?? 0) > 0 && voyage.flying && voyage.phase === "open" && !!gate && !!next && next !== "home" && voyage.ready === next && portalRig.warmId === next && !!portalRig.warm;
    if (able) {
      d = rig.gate.copy(gate!.pos).add(originOf(cur)).distanceTo(voyage.planePos);
      want = d < 320 ? 1 - THREE.MathUtils.smoothstep(d, 200, 300) : 0;
      // the still: once a world, as soon as it stands warm (its entry, its own sky and air)
      if (state.still !== next) {
        const e = entryOf(next!);
        const sc = rig.stillCam;
        sc.position.copy(e.pos).add(originOf(next!));
        sc.lookAt(sc.position.x - Math.sin(e.yaw), sc.position.y, sc.position.z - Math.cos(e.yaw));
        sc.updateMatrixWorld();
        sc.near = 0.5;
        sc.far = (st.camera as THREE.PerspectiveCamera).far;
        sc.updateProjectionMatrix();
        drawNext(cur, next!, sc, rig.still);
        state.still = next;
        STILL_U.tStill.value = rig.still.texture;
      }
      // (this world's directions, carried into that one, seen by the still's camera: P * view's turn * the gate's turn)
      const turn = gateToEntry(cur, next!, rig.m);
      if (turn !== null) {
        rig.r.extractRotation(rig.stillCam.matrixWorldInverse).multiply(M1.makeRotationY(turn));
        STILL_U.uStillMat.value.multiplyMatrices(rig.stillCam.projectionMatrix, rig.r);
        STILL_U.uStillOn.value = 1;
      }
      PORTAL_U.uPortalGain.value = skyOf(next!).exposure / Math.max(voyage.lastSky?.exposure ?? 1, 0.05);
    }
    if (!able || d >= 45) portalRig.close = 0;
    if (!able || d >= 320) {
      state.k = Math.max(0, state.k - dt * 3);
      if (state.k <= 0) {
        state.next = null;
        state.fresh = 0;
      }
      PORTAL_U.uPortalK.value = state.fresh > 0 || STILL_U.uStillOn.value > 0 ? state.k : 0;
      if (!able) STILL_U.uStillOn.value = 0;
      return;
    }
    if (state.next !== next) {
      state.next = next;
      state.fresh = 0;
      state.k = 0;
    }
    state.k += (want - state.k) * (1 - Math.exp(-dt * 4));
    // the live picture: only within 130 m (beyond, the still); every second frame, every frame over the last seventy metres
    // (the last stretch: the window is drawn after everything of this world, so no mist, spray or glow of this side
    // lies over it in the frames before the swap and is gone the frame after)
    portalRig.close = d < 45 ? 1 : 0;
    const stillOk = STILL_U.uStillOn.value > 0;
    const liveT = stillOk ? 1 - THREE.MathUtils.smoothstep(d, 90, 130) : 1;
    if (stillOk && d > 135) {
      state.fresh = 0;
      state.live = 0;
      STILL_U.uLiveK.value = 0;
      PORTAL_U.uPortalK.value = state.k;
      return;
    }
    // (every frame once it is live: a picture drawn every other frame made every other frame long, a judder near gates)
    if (false && d > 70 && state.fresh > 0 && ++state.tick % 2 !== 0) {
      PORTAL_U.uPortalK.value = state.k;
      return;
    }
    const cam = st.camera as THREE.PerspectiveCamera;
    const turn = gateToEntry(cur, next!, rig.m);
    if (turn === null) return;
    // (half the frame each way from afar; the frame's own size over the last sixty metres, so the swap is exact)
    const f = d < 60 ? 1 : 0.5;
    const w = Math.max(8, Math.round(target!.width * f));
    const h = Math.max(8, Math.round(target!.height * f));
    if (rig.rt.width !== w || rig.rt.height !== h) rig.rt.setSize(w, h);
    // the same eye, carried from this gate to that entry
    const pc = rig.cam;
    pc.fov = cam.fov;
    pc.aspect = cam.aspect;
    pc.near = cam.near;
    pc.far = cam.far;
    pc.projectionMatrix.copy(cam.projectionMatrix);
    pc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    cam.updateMatrixWorld();
    pc.matrixWorld.multiplyMatrices(rig.m, cam.matrixWorld);
    pc.matrixWorld.decompose(pc.position, pc.quaternion, rig.scale);
    pc.position.y = carryY(cam.position.y);
    pc.matrixWorld.compose(pc.position, pc.quaternion, rig.scale);
    pc.matrixAutoUpdate = false;
    pc.matrix.copy(pc.matrixWorld);
    pc.matrixWorldInverse.copy(pc.matrixWorld).invert();
    const skyWas = drawNext(cur, next!, pc, rig.rt);
    state.fresh = 1;
    // (the live picture comes in over the still only once it is there)
    state.live = liveT;
    STILL_U.uLiveK.value = liveT;
    PORTAL_U.tPortal.value = rig.rt.texture;
    PORTAL_U.uPortalRes.value.set(target!.width, target!.height);
    PORTAL_U.uPortalGain.value = skyOf(next!).exposure / Math.max(skyWas?.exposure ?? 1, 0.05);
    PORTAL_U.uPortalK.value = state.k;
  }, 0.5);
  return null;
}

// One window a gate. A gate drawn by LightGate brings its own; WorldBase offers one too (`fallback`), for a world
// that draws its gate entirely by itself, and that one stands aside wherever the gate's own is mounted.
const own = new Map<WorldId, number>();
const ownSubs = new Set<() => void>();
const ownSub = (f: () => void) => {
  ownSubs.add(f);
  return () => {
    ownSubs.delete(f);
  };
};
const ownBump = (id: WorldId, d: number) => {
  own.set(id, (own.get(id) ?? 0) + d);
  ownSubs.forEach((f) => f());
};

// The opening itself: a soft-edged lancet standing in the gate, which shows the picture where it falls on the
// screen. Nothing of it is seen until the picture is there (far from the gate, on Low, on a phone: never).
export function PortalWindow({ id, def, half = 15, rise = 23, fallback = false }: { id: WorldId; def: WorldDef; half?: number; rise?: number; fallback?: boolean }) {
  const owned = useSyncExternalStore(
    ownSub,
    () => own.get(id) ?? 0,
    () => 0,
  );
  useEffect(() => {
    if (fallback) return;
    ownBump(id, 1);
    return () => ownBump(id, -1);
  }, [fallback, id]);
  const shown = !(fallback && owned > 0);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (mesh.current) mesh.current.renderOrder = portalRig.close && voyage.cur === id ? 1e4 : 7;
  });
  const b = useMemo(() => {
    const gate = gateOf(id);
    if (!gate) return null;
    let reach: number | undefined;
    [half, rise, reach] = OPENING[id] ?? [half, rise];
    const c = Math.cos(gate.yaw);
    const s = Math.sin(gate.yaw);
    const g0 = id === "home" ? 0 : Math.min(groundAt(def, gate.pos.x - c * half, gate.pos.z + s * half), groundAt(def, gate.pos.x + c * half, gate.pos.z - s * half));
    // (the gate's own measure, as LightGate draws it: from its foot, on the ground or fifteen metres under a gate
    // that hangs in the air, up to `rise` above the height the way passes at; the head begins just above that height)
    const hung = id !== "home" && gate.pos.y - Math.max(g0, def.water ?? -1e9) > 70;
    const wide = half * 1.04;
    const lo = reach !== undefined ? gate.pos.y - reach : (hung ? gate.pos.y - 15 : Math.min(g0, def.water ?? g0) - 1.5) - 1;
    const hi = gate.pos.y + rise * 1.03;
    const spring = (gate.pos.y + 2 - lo) / (hi - lo);
    const pos: number[] = [];
    const uv: number[] = [];
    for (const [u, v] of [
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ]) {
      pos.push(gate.pos.x + c * u * wide, lo + (hi - lo) * v, gate.pos.z - s * u * wide);
      uv.push(u, v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex([0, 1, 2, 1, 3, 2]);
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { ...PORTAL_U, ...STILL_U, ...SKY_U, ...(id === "home" ? HOME_U : WORLD_U), uSpring: { value: spring } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tPortal; uniform float uPortalK; uniform vec2 uPortalRes; uniform float uPortalGain; uniform float uSpring; varying vec2 vUv;
        uniform sampler2D tStill; uniform mat4 uStillMat; uniform float uStillOn; uniform float uLiveK; varying vec3 vW;
        ${GLSL_SKY}
        ${id === "home" ? GLSL_HOME_AIR : GLSL_AIR}
        void main(){
          if (uPortalK <= 0.003) discard;
          // a lancet: straight sides, a pointed round head, soft all the way round
          float head = clamp((vUv.y - uSpring) / max(1.0 - uSpring, 0.001), 0.0, 1.0);
          float wide = sqrt(max(1.0 - head * head, 0.0));
          float dx = abs(vUv.x) / max(wide, 0.001);
          float edge = max(dx, max(head, 1.0 - smoothstep(0.0, 0.04, vUv.y)));
          float a = (1.0 - smoothstep(0.72, 0.98, edge)) * uPortalK;
          // that world's own light, as it will be seen from inside it: nothing added, nothing laid over it
          vec3 col = uLiveK > 0.0 ? texture2D(tPortal, gl_FragCoord.xy / uPortalRes).rgb : vec3(0.0);
          if (uStillOn > 0.5 && uLiveK < 1.0) {
            vec4 c = uStillMat * vec4(normalize(vW - cameraPosition), 0.0);
            vec2 su = clamp(c.xy / max(c.w, 1e-4) * 0.5 + 0.5, 0.0, 1.0);
            col = mix(texture2D(tStill, su).rgb, col, uLiveK);
          }
          col *= uPortalGain;
          // (seen from afar the opening stands in this side's air like the gate round it: no bright cut-out in the haze)
          ${id === "home" ? "col = homeAir(col, vW);" : "col = applyAir(col, vW);"}
          gl_FragColor = vec4(col, a);
        }`,
    });
    return { geo, mat };
  }, [id, def, half, rise]);
  useEffect(
    () => () => {
      b?.geo.dispose();
      b?.mat.dispose();
    },
    [b],
  );
  useEffect(() => {
    if (!b || !shown) return;
    const w = portalRig.windows;
    w.set(id, (w.get(id) ?? 0) + 1);
    return () => void w.set(id, (w.get(id) ?? 1) - 1);
  }, [b, id, shown]);
  if (!b || !shown) return null;
  // (after the gate's own sheet of light, glow and lamps: as the picture comes up they are left as a halo round it
  // and no longer wash it out; over the last stretch, after everything: see PortalView)
  return <mesh geometry={b.geo} material={b.mat} renderOrder={7} frustumCulled={false} ref={mesh} />;
}
