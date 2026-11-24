"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { DESK, clamp01, easeInOutCubic, nowS, spring } from "./shared";
import { ambienceListener } from "@/lib/ambience";
import { postCtl } from "./Post";
import { bakeHomeSolids, homeGround } from "./homeGround";
import { useTrails } from "./PlaneTrails";
import { carryY, gateToEntry, openingReach, portalCapable, portalReady, portalSwap } from "./worlds/portal";
import { arriveGolden } from "./sky";
import { castleGlance } from "./worlds/fairy/track";
import { GATE_REACH, KINGS, WORLDS, crossingStep, entryOf, gateOf, groundAt, kingsBloom, kingsPace, kingsView, noteAssist, originOf, pathOf, swapWorld, voyage, WORLD_ORDER, type WorldId } from "./worlds/voyage";

// A folded paper plane that lives on the desk. Click it and it takes off down
// the road, and from there it is yours: it glides. The pointer (or A / D, or a
// finger) banks it and the bank turns it; the pointer's height (or W / S) pitches it;
// Shift and Ctrl (or E and Q, or the slider) open and close the throttle, from barely moving to very fast. It has
// a little weight: every change eases in, nothing snaps. The ground, the tall
// things and the edge of each world turn it aside gently and never stop it.
// Leave the controls alone for a few seconds and a quiet hand takes over and
// carries it along the path of light to the next gate; touch them and it lets
// go at once. Passing a gate, cloud closes, the next world is made under it,
// and the cloud opens.

// `soft`: the stick is a thumb on glass, so it is eased a little more before the plane hears it; `auto`: there is no
// stick while the path is followed (Follow the path on, with a mouse or on a phone), so the quiet hand has the plane
// at once and the keys only nudge it. `look` is a drag across the view, in screen widths (so a whole drag across
// any screen is the same turn), and `gyro` the phone's own turning: both only turn the eye, never the plane.
export type FlightInput = {
  sx: number;
  sy: number;
  climb?: number;
  wheel?: number;
  moved?: number;
  keys?: boolean;
  soft?: boolean;
  auto?: boolean;
  look?: { dx: number; dy: number; held: boolean };
  gyro?: { yaw: number; pitch: number } | null;
};
export type PlaneApi = {
  launch: (cam: THREE.PerspectiveCamera) => void;
  fly: (dt: number, input: FlightInput, cam: THREE.PerspectiveCamera) => void;
  beginLand: (cam: THREE.PerspectiveCamera) => void;
  land: (dt: number, cam: THREE.PerspectiveCamera, home: { pos: THREE.Vector3; look: THREE.Vector3 }) => boolean;
  speed: () => number;
  boost: () => number;
  pos: THREE.Vector3;
  landMist: () => number;
  // dev: jump along the home road to a z, or straight into a world (optionally part-way along its path, 0..1)
  warp: (z: number) => void;
  jump: (id: WorldId, along?: number) => void;
};

const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));
// A critically damped spring, solved exactly for the step (so it is the same at 30 fps or 144, and never rings):
// moves st[x] toward `to` with its velocity kept in st[v]. `w` is its natural frequency (settles in about 4/w s).
function spring2<K extends string>(st: Record<K, number>, x: K, v: K, to: number, w: number, dt: number) {
  const e = Math.exp(-w * dt);
  const c = st[x] - to;
  const t = (st[v] + w * c) * dt;
  st[v] = (st[v] - w * t) * e;
  st[x] = to + (c + t) * e;
}
// Mouse-look (the flight bar's toggle, ModeUI): while the pointer is locked to the scene the mouse turns the eye
// freely, all the way round, as in a game; the plane is still flown by the keys. ModeUI adds the mouse's movement
// here (pixels), the plane's eye takes it up each frame.
export const mouseLook = { on: false, dx: 0, dy: 0 };
const MOUSE_TURN = 0.0024; // radians a pixel
// how far one screen width of drag turns the eye (about 135 degrees)
export const LOOK_PER_WIDTH = 2.35;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth01 = (t: number) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};
// The six speeds (voyage.ts SPEED_STEPS, 0..1) are evenly spread from `min`, a slow drift, to `max`, fast;
// `cruise` is where the eye's widening for speed (fovT) eases off.
export const SPEED = { min: 4, cruise: 28, max: 60 };
// How far the paper leans into a full turn (radians): a gentle bank, about 35 degrees. The turn itself is the same as
// it was at the deeper lean it had before (0.8 rad): TURN_PER_BANK gives the heading its rate from the smaller bank.
const BANK = 0.62;
const TURN_PER_BANK = 0.8 / BANK;
// how far the chase camera stands back (1 = as designed), kept for the rest of the visit
export const zoomMem = { v: 1, min: 0.55, max: 3.4 };
// The bank keys (A / D and the arrows), held by the plane itself while it flies with a keyboard.
const bank = { l: false, r: false };
const bankKeys = () => (bank.r ? 1 : 0) - (bank.l ? 1 : 0);
// In the open the eye sees for kilometres: the near plane is drawn in from a centimetre (the desk's close-ups
// need that) to forty centimetres near the ground, and further the higher the plane is above it (up to four
// metres at three hundred), though never past half the way to the paper plane itself. Depth far away is that
// many times finer, so far ridges and water stop fighting.
const FLY_NEAR = 0.4;
const M4 = new THREE.Matrix4();
const Q1 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
// how many seconds ahead the plane reads the land at home (beyond the two looks every world gets)
const FAR_LOOK = [3.2, 5.5];
const NO_INPUT: FlightInput = { sx: 0, sy: 0 };
const handsIn: FlightInput = { sx: 0, sy: 0, climb: 0 };
const OPT_NONE = {};
const OPT_HANDS = { hands: true };
const OPT_LAUNCH = { launching: true };
const OPT_LAUNCH_HANDS = { launching: true, hands: true };
export const speedOf = (throttle: number) => SPEED.min + (SPEED.max - SPEED.min) * clamp01(throttle);

// A classic dart, folded from one sheet: the keel pinched underneath, wings
// with a slight dihedral, their tips creased up. Flat-shaded so every fold
// catches the light differently, like paper does.
function planeGeometry() {
  const N = [0, 0.003, -0.118];
  const K = [0, -0.03, 0.09]; // bottom of the keel at the tail
  const Kf = [0, -0.012, -0.03];
  const tri: number[][] = [];
  for (const s of [-1, 1]) {
    const root = [s * 0.0035, 0.004, 0.096];
    const fold = [s * 0.057, 0.013, 0.094];
    const tip = [s * 0.071, 0.031, 0.088];
    const lead = [s * 0.02, 0.006, -0.05]; // on the leading edge, where the tip crease starts
    // keel panel (two triangles so it reads as a folded flap), wing, raised tip
    if (s < 0) tri.push(N, Kf, root, Kf, K, root, N, root, fold, lead, fold, tip);
    else tri.push(N, root, Kf, Kf, root, K, N, fold, root, lead, tip, fold);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tri.flat(), 3));
  g.computeVertexNormals();
  return g;
}

export function Plane({
  spot,
  apiRef,
  flying,
  onPick,
  hoverable,
  introAt,
  introDelay = 1.1,
  instant = false,
}: {
  introAt?: MutableRefObject<number | null>;
  introDelay?: number;
  instant?: boolean;
  spot: { pos: [number, number, number]; rot: number };
  apiRef: MutableRefObject<PlaneApi | null>;
  flying: boolean;
  free?: boolean;
  onPick: () => void;
  hoverable: boolean;
}) {
  const geo = useMemo(planeGeometry, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f6f3ea", roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), []);
  const group = useRef<THREE.Group>(null);
  const hover = useRef(false);
  const scene = useThree((s) => s.scene);
  // the mist off its wing tips (PlaneTrails.tsx), and the land or water under a point of whichever world stands
  const trails = useTrails();
  const groundUnder = useMemo(
    () => (x: number, z: number) => {
      const id = voyage.cur;
      if (id === "home") return homeGround(x, z);
      const o = originOf(id);
      return groundAt(WORLDS[id], x - o.x, z - o.z);
    },
    [],
  );
  useEffect(() => {
    // dev: __homeGround(x, z) is what the plane stays above at home; __homeGround.bake() reads the ranges again
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __homeGround: Object.assign((x: number, z: number) => homeGround(x, z), { bake: () => bakeHomeSolids(scene) }) });
  }, [scene]);

  const st = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      rollV: 0,
      pitchV: 0,
      yawR: 0,
      yawRV: 0,
      climbF: 0,
      speed: 0,
      speedT: 0,
      t: 0,
      idle: 9, // seconds since the controls were last touched
      pathI: 0,
      pathMax: 0, // the farthest along the path the plane has been (the way back never snaps to an earlier lap or a lower switchback)
      tunnel: false, // the way here runs under the land (a cave): the ground is not the mountain over it
      vPath: 1e9, // the speed the bends and the end of the path allow while the quiet hand flies (m/s)
      seek: 0,
      gateSide: -1,
      gateBack: false, // the hand has missed the gate and is flying back out to come at it again
      gateWait: 0, // seconds the hand has spent at the end of the way without getting through
      holdK: 0, // 0..1 the next world is not yet warm behind the gate: the plane eases to a glide as it nears it
      holdT: 0, // seconds it has been held at the gate's plane
      camYaw: 0,
      camPitch: 0,
      // free look: where the eye is turned from straight behind the plane, and where it is turning to
      lookYaw: 0,
      lookPitch: 0,
      lookTY: 0,
      lookTP: 0,
      lookIdle: 9,
      // the stick as the plane hears it, and the cruise pace as it comes on
      sx: 0,
      sy: 0,
      cruise: 0,
      zoom: zoomMem.v,
      gateAlong: NaN,
      tmp3: new THREE.Vector3(),
      camFrom: new THREE.Vector3(),
      lookFrom: new THREE.Vector3(),
      fov: 36,
      look: new THREE.Vector3(),
      nose: new THREE.Vector3(0, 0, -1),
      tmp: new THREE.Vector3(),
      tmp2: new THREE.Vector3(),
      snap: false,
      // landing
      landMode: "near" as "near" | "cloud",
      landPhase: 0,
      landT: 0,
      landDur: 3,
      b0: new THREE.Vector3(),
      b1: new THREE.Vector3(),
      b2: new THREE.Vector3(),
      b3: new THREE.Vector3(),
      lastYaw: 0,
      near0: 0.01,
      nearNow: 0.01,
      nearOn: false,
      alt: 0, // metres of air under the plane
      camLift: 0,
      camLiftV: 0,
      mouseWas: false,
      windowed: false, // the crossing just made was through a gate's window
      paceW: 1, // the pace of the world that stands (WorldDef.pace)
      qFrom: new THREE.Quaternion(),
      upFrom: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );
  const rest = useMemo(() => new THREE.Vector3(spot.pos[0], DESK.top + 0.013, spot.pos[2]), [spot]);
  useEffect(() => {
    if (!flying) return;
    const set = (e: KeyboardEvent, on: boolean) => {
      // (by the key's place on the keyboard, so any layout, Caps Lock or a held Shift still banks)
      const k = e.code === "KeyA" ? "a" : e.code === "KeyD" ? "d" : e.key.toLowerCase();
      // (a chord with Cmd, Alt or Ctrl is the browser's; an arrow pressed on a slider is the slider's)
      if (on && (e.metaKey || e.altKey || e.ctrlKey || (k.startsWith("arrow") && (e.target as HTMLElement | null)?.tagName === "INPUT"))) return;
      if (k === "a" || k === "arrowleft") bank.l = on;
      else if (k === "d" || k === "arrowright") bank.r = on;
    };
    const kd = (e: KeyboardEvent) => set(e, true);
    const ku = (e: KeyboardEvent) => set(e, false);
    const drop = () => (bank.l = bank.r = false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", drop);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", drop);
      drop();
    };
  }, [flying]);

  // The paper itself is moved in the same breath as the camera that follows it
  // (fly and land are called from the scene's frame; this component's own
  // frame callback runs before that one and would show it a frame behind).
  // (`mist`: how much the wing tips draw behind them this frame, 0 for none)
  const sync = (dt = 0, cam: THREE.Camera | null = null, mist = 0) => {
    const g = group.current;
    if (!g) return;
    g.position.copy(st.pos);
    g.rotation.set(0, 0, 0, "YXZ");
    g.rotation.y = st.yaw;
    g.rotation.x = st.pitch;
    g.rotation.z = -st.roll;
    voyage.planePos.copy(st.pos);
    voyage.planeSpeed = st.speed;
    // (what sounds near the plane grows as it comes: lib/ambience.ts)
    ambienceListener(st.pos.x, st.pos.y, st.pos.z);
    if (cam) trails.update(dt, g, mist, cam, groundUnder);
  };
  const updateNose = () => st.nose.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));

  // the chase camera swings on a boom behind the plane: it follows the
  // heading a beat late, so a turn shows the plane banking into it, and it
  // never falls behind however fast the plane goes
  const chase = (dt: number, cam: THREE.PerspectiveCamera, blend = 1) => {
    // The eye's whole pose comes from a few eased ANGLES and the plane's own place, never from a point in the
    // world that is chased: a chased point falls behind by speed / stiffness (ten metres at the top of the
    // throttle, further than the point was ahead), and how far depends on the length of each frame, which is
    // what shook the picture and pulled it down at the ground. Angles do not know how fast the plane goes.
    const pitT = THREE.MathUtils.clamp(st.pitch * 0.5, -0.26, 0.3);
    if (st.snap) {
      st.camYaw = st.yaw;
      st.camPitch = pitT;
      st.camLiftV = 0;
    }
    // (the boom keeps up a little more closely the faster the plane goes, so a turn at speed never swings it wide)
    st.camYaw += wrap(st.yaw - st.camYaw) * (1 - Math.exp(-dt * (3.2 + st.speed * 0.025)));
    // the eye takes half of a climb or a dive, slowly, and no more than fifteen degrees of it
    st.camPitch = damp(st.camPitch, pitT, 2.2, dt);
    // the wheel or a pinch draws the eye in close behind the plane or out to a wide view (remembered for the visit)
    st.zoom += (zoomMem.v - st.zoom) * (1 - Math.exp(-dt * 5));
    // (how far back it stands and how wide it looks go by the pace of flying, not by metres a second: a world built
    // three times the size is flown three times as fast, and the eye should not stand off and stare for that)
    const vc = st.speed / st.paceW;
    const dist = (1.32 + vc * 0.022) * st.zoom;
    // the eye may be turned away from the plane's own line: it swings round the plane on the same boom
    const lw = smooth01(Math.hypot(st.lookYaw, st.lookPitch) / 0.5);
    const yawC = st.camYaw + st.lookYaw;
    const pitC = THREE.MathUtils.clamp(st.camPitch + st.lookPitch, -1.45, 1.45);
    const cp = Math.cos(pitC);
    const h = 0.44 * Math.sqrt(st.zoom) * (1 - 0.75 * lw);
    const want = st.tmp2.set(st.pos.x + Math.sin(yawC) * cp * dist, st.pos.y - Math.sin(pitC) * dist + h + Math.sin(st.t * 1.7) * 0.02, st.pos.z + Math.cos(yawC) * cp * dist);
    // The lens keeps clear of the ground too, softly: what it lacks of ninety centimetres is given to it by a
    // critically damped spring (no kink where a rise in the land first reaches it), and only as a last resort is
    // it simply held above the surface.
    const id = voyage.cur;
    const o = originOf(id);
    let g = id === "home" ? homeGround(want.x, want.z) : groundAt(WORLDS[id], want.x - o.x, want.z - o.z);
    // (in a tunnel under the mountain the lens is not lifted over it)
    if (st.tunnel) g = Math.min(g, st.pos.y - 4);
    const need = Math.max(0, g + 0.9 - want.y);
    if (st.snap) st.camLift = need;
    else spring2(st, "camLift", "camLiftV", need, 7, dt);
    want.y += Math.max(0, st.camLift);
    if (want.y < g + 0.3) want.y = g + 0.3;
    if (blend < 1) cam.position.lerpVectors(st.camFrom, want, blend);
    else cam.position.copy(want);
    // Where it looks. Along the boom's own heading, led a little into a turn (the plane shows its bank, the eye
    // sees where it is going), and a few degrees under level once in the air: the plane rides low in the frame
    // with the world and the horizon before it, in a climb and in a dive alike. A turned eye looks down the boom.
    const rise = smooth01((st.t - 0.8) / 2.6);
    let yawV = yawC + wrap(st.yaw - st.camYaw) * 0.45 * (1 - lw);
    const under = Math.atan2(h, dist + 2.4) * (1 - rise) + 0.06 * rise + Math.atan2(Math.max(0, st.camLift), dist + 6);
    let pitV = pitC - under * (1 - lw);
    // (Castle Fairy Tale: while the line goes round the castle the eye leans toward it, plane and castle both in the frame)
    if (id === "fairy") {
      const gl = castleGlance(st.pos.x - o.x, st.pos.y - o.y, st.pos.z - o.z);
      if (gl.w > 0) {
        yawV += wrap(gl.yaw - yawV) * 0.62 * gl.w * (1 - lw);
        pitV += (gl.pitch - pitV) * 0.45 * gl.w * (1 - lw);
      }
    }
    // before the kings the eye is lifted to the whole picture, and the lens opens to hold it
    const kv = id === "kings" && !voyage.homing ? kingsView(st.pos.y, st.pos.z - o.z - KINGS.z) : null;
    if (kv) pitV += (kv.elev - pitV) * kv.w * (1 - lw);
    const cv = Math.cos(pitV);
    st.look.set(cam.position.x - Math.sin(yawV) * cv * (dist + 8), cam.position.y + Math.sin(pitV) * (dist + 8), cam.position.z - Math.cos(yawV) * cv * (dist + 8));
    st.snap = false;
    const lean = Math.sin(st.roll) * 0.26 * (1 - lw);
    cam.up.set(Math.cos(st.camYaw) * lean, 1, -Math.sin(st.camYaw) * lean).normalize();
    if (blend < 1) {
      // leaving the desk: from the pose the eye had there to this one, as one turn
      M4.lookAt(cam.position, st.look, cam.up);
      cam.quaternion.slerpQuaternions(st.qFrom, Q1.setFromRotationMatrix(M4), blend);
    } else cam.lookAt(st.look);
    const fovT = Math.max(kv ? kv.fov : 0, 50 + clamp01((vc - SPEED.min) / (SPEED.cruise - SPEED.min)) * 16 + clamp01((vc - SPEED.cruise) / (SPEED.max - SPEED.cruise)) * 10);
    st.fov += (fovT - st.fov) * (1 - Math.exp(-dt * 1.6));
    cam.fov = st.fov;
    cam.updateProjectionMatrix();
  };

  // Free look. A drag turns the eye round the plane (what is under the finger follows it), nearly a whole sphere:
  // up into the sky, back down the way it came. Let go and after a few seconds it eases back behind the plane,
  // unless the view is locked. With the phone as the eye, its own turning is the look.
  const lookStep = (dt: number, input: FlightInput | null) => {
    const L = input?.look;
    if (!input) {
      st.lookTY = damp(st.lookTY, 0, 2.5, dt);
      st.lookTP = damp(st.lookTP, 0, 2.5, dt);
    } else if (input.gyro) {
      st.lookTY = input.gyro.yaw;
      st.lookTP = THREE.MathUtils.clamp(input.gyro.pitch, -1.15, 1.35);
      st.lookIdle = 0;
    } else if (mouseLook.on) {
      if (mouseLook.dx || mouseLook.dy) {
        // (right is right and down is down; round and round without an end, up and down within reason)
        st.lookTY = wrap(st.lookTY - mouseLook.dx * MOUSE_TURN);
        st.lookTP = THREE.MathUtils.clamp(st.lookTP - mouseLook.dy * MOUSE_TURN * 0.85, -1.15, 1.35);
        mouseLook.dx = mouseLook.dy = 0;
        st.lookIdle = 0;
      } else st.lookIdle += dt;
      if (!voyage.lockView && st.lookIdle > 3.2) {
        const k = 1 - Math.exp(-dt * 1.15);
        st.lookTY -= st.lookTY * k;
        st.lookTP -= st.lookTP * k;
      }
    } else if (L) {
      // (the mouse has just been let go: the eye comes back behind the plane, unless the view is held)
      if (st.mouseWas && !voyage.lockView) st.lookIdle = 9;
      if (L.dx || L.dy) {
        // grab the world, as at the desk: drag right and the eye swings round to the right, drag down and it rises
        st.lookTY = THREE.MathUtils.clamp(st.lookTY - L.dx * LOOK_PER_WIDTH, -2.95, 2.95);
        st.lookTP = THREE.MathUtils.clamp(st.lookTP - L.dy * LOOK_PER_WIDTH * 0.8, -1.15, 1.35);
        st.lookIdle = 0;
      } else if (!L.held) st.lookIdle += dt;
      if (!voyage.lockView && st.lookIdle > 2.6) {
        const k = 1 - Math.exp(-dt * 1.15);
        st.lookTY -= st.lookTY * k;
        st.lookTP -= st.lookTP * k;
      }
    }
    st.mouseWas = mouseLook.on;
    // (a mouse is followed more closely than a drag: it is the hand itself)
    const k = 1 - Math.exp(-dt * (mouseLook.on ? 16 : 6.5));
    st.lookYaw = wrap(st.lookYaw + wrap(st.lookTY - st.lookYaw) * k);
    st.lookPitch += (st.lookTP - st.lookPitch) * k;
  };

  const gates = new Map<WorldId, ReturnType<typeof gateOf>>();
  const gateAt = (id: WorldId) => {
    if (!gates.has(id)) gates.set(id, gateOf(id));
    return gates.get(id) ?? null;
  };

  // (into a world of another size the plane arrives already at that world's pace: the same flying, so the eye
  // behind it has nothing to settle)
  const repace = (id: WorldId) => {
    const p = id === "kings" ? 1 : (WORLDS[id].pace ?? 1);
    const k = p / st.paceW;
    st.speed *= k;
    st.speedT *= k;
    st.paceW = p;
  };
  const place = (id: WorldId, lp: THREE.Vector3, yaw: number) => {
    repace(id);
    st.pos.copy(lp).add(originOf(id));
    st.yaw = yaw;
    st.pitch = st.roll = st.rollV = st.pitchV = st.yawR = st.yawRV = 0;
    st.pathI = 0;
    st.pathMax = 0;
    st.vPath = 1e9;
    st.seek = 0;
    st.gateSide = -1;
    st.gateBack = false;
    st.gateWait = 0;
    st.gateAlong = NaN;
    st.holdK = 0;
    st.holdT = 0;
    st.snap = true;
    trails.reset();
    updateNose();
  };

  // where on the path of light the plane is nearest (kept as an index that only creeps, so a loop or a hairpin can't confuse it)
  // When it is far from the path and looks along all of it, a point BEHIND the farthest the plane has been costs more
  // the further back it is, so a plane that has missed its gate does not go back to an earlier lap of a spiral (Rex) or a
  // lower switchback (the funeral's road) and fly it all again, which was the "flies upward at random" and the endless circling.
  const nearestOnPath = (pts: THREE.Vector3[], lx: number, ly: number, lz: number, loop: boolean, dt: number) => {
    const n = pts.length;
    const d2 = (i: number) => {
      const p = pts[((i % n) + n) % n];
      return (p.x - lx) ** 2 + (p.y - ly) ** 2 * 0.25 + (p.z - lz) ** 2;
    };
    let best = st.pathI;
    let bd = d2(best);
    for (let i = st.pathI - 3; i <= st.pathI + 24; i++) {
      if (!loop && (i < 0 || i >= n)) continue;
      const d = d2(i);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // far off the path: look along all of it now and then, and take it up where it is nearest, counting the way back dear
    st.seek -= dt;
    if (bd > 70 * 70 && st.seek <= 0) {
      st.seek = 0.6;
      let bc = Math.sqrt(bd) + (loop ? 0 : Math.max(0, st.pathMax - best) * 8);
      for (let i = 0; i < n; i += 2) {
        const c = Math.sqrt(d2(i)) + (loop ? 0 : Math.max(0, st.pathMax - i) * 8);
        if (c < bc) {
          bc = c;
          best = i;
          bd = d2(i);
        }
      }
    }
    st.pathI = loop ? ((best % n) + n) % n : Math.min(n - 1, Math.max(0, best));
    if (!loop && bd < 90 * 90 && st.pathI > st.pathMax) st.pathMax = st.pathI;
  };

  // one step of gliding in the world that stands
  const glide = (dt: number, input: FlightInput, opts: { launching?: boolean; hands?: boolean } = {}) => {
    const id = voyage.cur;
    const def = WORLDS[id];
    const o = originOf(id);
    const lx = st.pos.x - o.x;
    const lz = st.pos.z - o.z;
    // (home is real land: knolls, hills, a lake, the sea and the mountain ranges; see homeGround.ts)
    const ground = (x: number, z: number) => (id === "home" ? homeGround(x, z) : groundAt(def, x, z));

    // (the throttle is stepped, by Space and Shift or the bar: voyage.ts stepSpeed. The wheel and a pinch are the lens's: see chase)

    // the stick, with a soft centre so small corrections are small
    const shape = (v: number) => v * (0.45 + 0.55 * v * v);
    // a pointer lying still off-centre is not steering: after a while it is let go of, and the plane levels itself
    const stale = !input.keys && performance.now() - (input.moved ?? 0) > 7000;
    // every input is low-passed on its way to the plane (a mouse's jitter, a key's on and off, a quick thumb), so
    // nothing reaches the springs as a step; let go and the stick drifts back to the middle, slower still
    // With a mouse the keyboard flies the plane and the mouse only looks: the pointer never steers. (The keys' bank
    // arrives as a full stick, -1 or 1; anything in between is the pointer, and is ignored.) A thumb on the glass
    // stick (soft) still steers.
    // (The bank keys are read here, by the plane itself: what arrives as `sx` with a mouse may be the pointer's
    // own place on the screen, which at the very edge of the window is a full stick and used to turn the plane.)
    const kbOnly = !input.soft;
    const inSx = kbOnly ? bankKeys() : stale ? 0 : input.sx;
    const inSy = stale || kbOnly ? 0 : input.sy;
    // A key is a step, and the springs below already turn a step into an eased arrival: the keys are only
    // rounded off here (so the plane answers within a tenth of a second), a thumb a little more.
    st.sx = damp(st.sx, inSx, inSx === 0 ? (input.soft ? 4 : 9) : input.soft ? 7 : 14, dt);
    st.sy = damp(st.sy, inSy, inSy === 0 ? 4 : 7, dt);
    st.climbF = damp(st.climbF, input.climb ?? 0, 9, dt);
    let sx = shape(st.sx);
    let sy = shape(st.sy);
    const climb = st.climbF;
    const touching = Math.abs(inSx) > 0.03 || Math.abs(inSy) > 0.03 || (input.climb ?? 0) !== 0;
    // A held key (or the stick) always flies the plane, at once: nothing below (the quiet hand, the gate's pull, the
    // edge of the world, a tree or a tower ahead) may take the turn from it. (He could not turn in the forest: the
    // quiet hand let go over half a second and the trees each took up to four parts in five of the stick.)
    const steering = !opts.hands && Math.abs(inSx) > 0.03;
    if (touching && !stale && !opts.hands) st.idle = 0;
    else st.idle += dt;
    const want = opts.hands || (opts.launching && !touching) || (voyage.guide && !touching && (st.idle > 3.2 || (input.auto && st.idle > 1.4))) ? 1 : 0;
    if (touching && !opts.hands) voyage.assist = 0;
    else voyage.assist = damp(voyage.assist, want, want ? 0.85 : 5.5, dt);
    noteAssist();
    const a = voyage.assist;

    // the quiet hand: aim a little way down the path of light
    // (a way steeper than the plane's own 0.55 rad climb, a great wave's face: the hand may lift the nose further, to 0.95)
    let extraPitch = 0;
    const path = pathOf(id);
    nearestOnPath(path.pts, lx, st.pos.y, lz, !!def.loop, dt);
    if (a > 0.001) {
      const n = path.pts.length;
      // (how far down the path it aims: a little more than a second of flight and a little over, never so far that a
      // bend is cut across, and further at speed so a turn is begun in time)
      const ahead = Math.round((24 + st.speed * 1.3) / 4);
      const ti = def.loop ? (st.pathI + ahead) % n : Math.min(n - 1, st.pathI + ahead);
      const tp = path.pts[ti];
      let tx = tp.x;
      let ty = tp.y;
      let tz = tp.z;
      // (the height is aimed at nearer than the heading is: the nose follows the way's rise and fall closely, so a climb of a
      // few hundred metres at a hundred metres a second is not begun two seconds before it comes)
      const vp = path.pts[def.loop ? (st.pathI + Math.round((14 + st.speed * 0.5) / 4)) % n : Math.min(n - 1, st.pathI + Math.round((14 + st.speed * 0.5) / 4))];
      let aimY = vp.y;
      let aimD = Math.hypot(vp.x - lx, vp.z - lz);
      // The end of the way is the gate, and the hand flies the GATE, not the last point of the path. Aimed at that
      // last point, a plane that came in too high or too wide could only circle it for ever (the point was nearer
      // than it can turn). Instead it follows the line through the gate: its mark runs ahead of it along that
      // line and on out the far side, so it straightens up and goes through. If it has missed (it is past the
      // gate's plane, or too far to one side to make it), it flies back out to a point well before the gate, four
      // turning-circles away, comes round, and lines up again.
      const gt = def.loop || voyage.phase !== "open" ? null : gateAt(id);
      if (gt) {
        const hgx = -Math.sin(gt.yaw);
        const hgz = -Math.cos(gt.yaw);
        const rx = lx - gt.pos.x;
        const rz = lz - gt.pos.z;
        const along = hgx * rx + hgz * rz;
        const side = Math.abs(-hgz * rx + hgx * rz);
        const R = Math.max(40, st.speed / 0.45); // the circle it turns in at this pace
        const D = Math.max(170, R * 3.2);
        const off = Math.hypot(rx, rz);
        // (it lines up on the gate's own axis from a good way off, as soon as the gate is ahead of it and near enough to be
        // flown at, whatever way the last of the path bends: a path that comes at its gate from the side is not flown at
        // the gate's edge at the last moment, with no room left to turn)
        const bearing = wrap(Math.atan2(rx, rz) - st.yaw);
        // (only for the last of the way: a gate standing over the middle of a long spiral (Rex) is near in plan from the first
        // lap, and aiming at its height from there would simply climb straight up)
        const left = (n - 1 - st.pathI) * 4;
        const near = left < Math.max(300, R * 2.2) && off < Math.max(260, R * 3) && along < -20 && Math.abs(bearing) < 1.3;
        const ending = (ti >= n - 1 || st.gateBack || near) && off < D * 3 + 400;
        if (ending) {
          aimY = NaN;
          // It has missed the gate only when it can no longer be lined up on it: past its plane, too high, or too far
          // aside for the distance left (an arc of the circle it turns in, R, takes up `side` metres in about
          // sqrt(2 R side) of the way; a plane some metres off at a hundred metres is simply brought in, not sent round)
          const need = Math.sqrt(2 * R * Math.max(0, side - 9)) * 0.85;
          if (along > 6 || (side > 14 && -along < need) || st.pos.y - gt.pos.y > 24 + Math.max(0, -along) * 0.45) st.gateBack = true;
          else if (st.gateBack && along < -D * 0.7) st.gateBack = false;
          const to = st.gateBack ? -D : Math.min(along + Math.max(45, R * 1.5), 60);
          tx = gt.pos.x + hgx * to;
          tz = gt.pos.z + hgz * to;
          ty = gt.pos.y - 2;
        } else st.gateBack = false;
        // (it has been round this gate a long while and is still not through: it is simply let through)
        // (it counts for less while the plane is eased down to a glide to wait for the gate's window: a gate with a long
        // bend before it, flown at a third of the pace, was "let through" under cloud 100 m short of the window)
        if (off < 450) st.gateWait += dt * a * (1 - 0.6 * st.holdK);
        else if (off > 700) st.gateWait = 0;
        if (st.gateWait > 60) {
          st.gateWait = 0;
          st.gateBack = false;
          voyage.next = WORLD_ORDER[WORLD_ORDER.indexOf(id) + 1] ?? null;
          if (voyage.next) voyage.phase = "closing";
        }
      }
      const dx = tx - lx;
      const dz = tz - lz;
      const err = wrap(Math.atan2(-dx, -dz) - st.yaw);
      const ax = THREE.MathUtils.clamp(-err * 1.5, -1, 1);
      if (Number.isNaN(aimY)) {
        aimY = ty;
        aimD = Math.hypot(dx, dz);
      }
      const ay = THREE.MathUtils.clamp((Math.atan2(aimY - st.pos.y, aimD + 6) / 0.5) * 1.5, -1, 1);
      sx = sx * (1 - a) + ax * a;
      sy = sy * (1 - a) + ay * a;
      const want3 = Math.atan2(aimY - st.pos.y, aimD + 6);
      extraPitch = a * (THREE.MathUtils.clamp(want3 * 1.65, -0.95, 0.95) - THREE.MathUtils.clamp(want3 * 1.65, -0.55, 0.55));
      // The speed the way allows: no bend may be flown faster than the plane can turn it (about 0.5 rad/s at full bank,
      // whatever the speed), looked at far enough ahead to slow in time, and the last of the way, where the gate or
      // the light is, is come to at about two fifths of the top pace. Where it matters, never under 16 m/s.
      if (!def.loop) {
        const top = SPEED.max * st.paceW;
        const rem = (n - 1 - st.pathI) * 4;
        let lim = top * (0.45 + 0.55 * smooth01((rem - 60) / 480));
        const H = THREE.MathUtils.clamp(st.speed * 4.5, 140, 700);
        let h0 = 0;
        let q0 = 0;
        for (let k = 0; k * 24 < H; k++) {
          const i0 = st.pathI + k * 6;
          const i1 = i0 + 6;
          if (i1 >= n) break;
          const p0 = path.pts[i0];
          const p1 = path.pts[i1];
          const h1 = Math.atan2(p1.x - p0.x, p1.z - p0.z);
          const q1 = Math.atan2(p1.y - p0.y, Math.hypot(p1.x - p0.x, p1.z - p0.z));
          if (k > 0) {
            // (a climb that begins or ends quickly is followed no faster than the nose can come up to it: the pitch is the
            // slower of the plane's two turns, about 0.3 rad/s)
            const vq = 0.3 / Math.max(Math.abs(q1 - q0) / 24, 1e-4);
            lim = Math.min(lim, Math.sqrt(vq * vq + 2 * 26 * k * 24));
            const kap = Math.abs(wrap(h1 - h0)) / 24;
            // (a hairpin tighter than the plane can turn is flown as slowly as that costs, and no slower than a glide)
            const vb = 0.5 / Math.max(kap, 1e-4);
            lim = Math.min(lim, Math.sqrt(vb * vb + 2 * 26 * k * 24));
          }
          h0 = h1;
          q0 = q1;
        }
        st.vPath = Math.max(16, lim);
      } else st.vPath = 1e9;
    } else {
      st.gateBack = false;
      st.gateWait = 0;
      st.vPath = 1e9;
    }

    // near the gate, and headed for it, the plane is drawn gently to its middle: nobody misses the way on
    const gate = gateAt(id);
    if (gate && voyage.phase === "open" && a < 0.98) {
      const rx = lx - gate.pos.x;
      const rz = lz - gate.pos.z;
      const along = -Math.sin(gate.yaw) * rx - Math.cos(gate.yaw) * rz;
      const side = Math.cos(gate.yaw) * rx - Math.sin(gate.yaw) * rz;
      if (along < 0 && along > -150 && Math.abs(side) < 80) {
        const err = wrap(Math.atan2(rx, rz) - st.yaw);
        if (Math.abs(err) < 1.25) {
          // (only while the controls are left alone: a hand on them is never argued with)
          const k = touching || !voyage.guide ? 0 : smooth01((150 + along) / 80) * smooth01((80 - Math.abs(side)) / 45) * 0.6 * (1 - a);
          sx = sx * (1 - k) + THREE.MathUtils.clamp(-err * 1.5, -1, 1) * k;
          const ay = THREE.MathUtils.clamp((Math.atan2(gate.pos.y - st.pos.y, Math.hypot(rx, rz) + 6) / 0.5) * 1.5, -1, 1);
          sy = sy * (1 - k) + ay * k;
        }
      }
    }

    // the edge of the world leans the plane back toward its middle
    let edge = 0;
    if (voyage.phase === "open") {
      const ex = lx - def.centre[0];
      const ez = lz - def.centre[1];
      const r = Math.hypot(ex, ez);
      // No walls: the plane may go wherever a world has anything to see, well past what its maker called its
      // edge. Only far out, where the land has run out into haze, does the air lean it round in a wide easy
      // turn (never more than three parts in four of the stick, and hardly at all once it is headed back in).
      edge = smooth01((r - def.radius * 1.2) / (def.radius * 0.5));
      if (edge > 0) {
        const outward = (-Math.sin(st.yaw) * ex - Math.cos(st.yaw) * ez) / Math.max(r, 1);
        const err = wrap(Math.atan2(ex, ez) - st.yaw);
        const k = steering ? 0 : edge * 0.75 * (outward > -0.2 ? 1 : 0.2);
        sx = sx * (1 - k) + THREE.MathUtils.clamp(-err * 1.1, -1, 1) * k;
      }
    }

    // tall things: lean away early, and be eased round them
    const g0b = ground;
    let pushX = 0;
    let pushZ = 0;
    // (nothing leans it aside in the gate's own way: whatever stands there, the way through is open, and a plane
    // lined up on the gate was being pushed off it at the last moment by the gate's own surroundings)
    let gateway = false;
    {
      const gw = voyage.phase === "open" ? gateAt(id) : null;
      if (gw) {
        const rx = lx - gw.pos.x;
        const rz = lz - gw.pos.z;
        const along = -Math.sin(gw.yaw) * rx - Math.cos(gw.yaw) * rz;
        const side = Math.abs(Math.cos(gw.yaw) * rx - Math.sin(gw.yaw) * rz);
        gateway = along > -150 && along < 30 && side < 24 + Math.max(0, -along) * 0.25 && Math.abs(st.pos.y - gw.pos.y) < 45;
      }
    }
    for (const ob of def.obstacles) {
      if (gateway) break;
      const ox = lx - ob.x;
      const oz = lz - ob.z;
      const d = Math.hypot(ox, oz);
      // (it may pass close by a tower or between two: it is only leaned off what it is about to meet)
      const reach = 3 + st.speed * 0.4;
      const top = g0b(ob.x, ob.z) + ob.h;
      if (d > ob.r + reach || st.pos.y > top + 8) continue;
      // a bell narrows toward its crown: the plane may pass close over its shoulder
      const t = clamp01((st.pos.y - (top - ob.h)) / ob.h);
      const rad = ob.bell ? ob.r * Math.sqrt(Math.max(0.02, 1 - Math.pow(t, 2.5))) : ob.r;
      const k = smooth01(1 - (d - rad) / reach) * smooth01((top + 8 - st.pos.y) / 10);
      const toward = (Math.sin(st.yaw) * ox + Math.cos(st.yaw) * oz) / Math.max(d, 1); // > 0 when flying at it
      if (toward > 0 && !steering) {
        // which side of it are we headed for: bank to that side
        const cross = -Math.sin(st.yaw) * oz + Math.cos(st.yaw) * ox;
        sx = sx * (1 - k * 0.8) + (cross > 0 ? 1 : -1) * k * 0.8;
      }
      const f = k * k * (2 + st.speed * 0.7);
      pushX += (ox / Math.max(d, 1)) * f;
      pushZ += (oz / Math.max(d, 1)) * f;
    }

    // the ground, read under the plane and a little ahead of it
    const gk = opts.launching ? smooth01((st.t - 0.2) / 2.6) : 1;
    const hx = -Math.sin(st.yaw);
    const hz = -Math.cos(st.yaw);
    let g0 = ground(lx, lz);
    let g1 = ground(lx + hx * st.speed * 0.9, lz + hz * st.speed * 0.9);
    let g2 = ground(lx + hx * st.speed * 2.0, lz + hz * st.speed * 2.0);
    // A tunnel: where the way itself runs well under the surface of the land (a cave in a mountain: the funeral's, the
    // home forest's), the land over it is not what the plane must clear. Near such a part of the path the ground it reads
    // is the way's own, so it flies in under the rock instead of being lifted over the mountain (it was carried up
    // hundreds of metres at the cave's mouth and never went in).
    let tunnel = false;
    if (!def.loop && path.pts.length > 4) {
      const pp = path.pts;
      for (const k of [0, 6, 12, 20]) {
        const q = pp[Math.min(pp.length - 1, st.pathI + k)];
        if (ground(q.x, q.z) > q.y + 8 && Math.hypot(q.x - lx, q.y - st.pos.y, q.z - lz) < 90) tunnel = true;
      }
    }
    // While the quiet hand flies, the land it must clear is the land UNDER THE PATH ahead, not what lies along the nose:
    // a path that winds along a cliff (the funeral's road) turns away from the wall that the straight line ahead hits,
    // and reading that wall made the plane climb over rock it was never going to meet ("flies upward at random").
    if (voyage.assist > 0.05 && !def.loop && path.pts.length > 4) {
      const pp = path.pts;
      const at = (m: number) => {
        const q = pp[Math.min(pp.length - 1, st.pathI + Math.round(m / 4))];
        const gq = ground(q.x, q.z);
        return gq > q.y + 8 ? q.y - 3 : gq;
      };
      const k = smooth01(voyage.assist);
      g1 += (Math.max(Math.min(g0, st.pos.y - 3), at(st.speed * 0.9)) - g1) * k;
      g2 += (Math.max(Math.min(g0, st.pos.y - 3), at(st.speed * 2.0)) - g2) * k;
    }
    st.tunnel = tunnel;
    if (tunnel) {
      g0 = Math.min(g0, st.pos.y - 3);
      g1 = Math.min(g1, st.pos.y - 3);
      g2 = Math.min(g2, st.pos.y - 3);
    }
    // It may fly low: a metre and a half over land or water, level, for as long as it likes. The air only holds
    // it off the ground it is SINKING toward (the faster it comes down, the sooner), and off ground that rises ahead.
    const floor = Math.max(g0, g1, g2 - 2) + 1.5 * gk;
    const band = 0.5 + Math.max(0, -Math.sin(st.pitch) * st.speed) * 1.0 + Math.max(0, Math.max(g1, g2 - 2) - g0) * 0.5;
    const low = clamp01(1 - (st.pos.y - floor) / band);
    const low3 = low * low * low;
    // (W and S: he asked to go up and down quicker. The nose answers nearly twice as far as it did, eased in by the
    // spring below, and a dive gathers speed while a climb spends it, further down)
    let pitchT = sy * 0.55 + climb * 0.7 + extraPitch;
    if (low > 0) pitchT = Math.max(pitchT, pitchT * (1 - low) + low3 * 0.6);
    // At home the land rises into hills and mountains: the plane looks further ahead too, and begins to climb in
    // good time for whatever stands in its way (the nose comes up as steeply as the rise needs, never as a jolt
    // at the foot of it). The air's ceiling lifts with the land, so a range can be flown over.
    let rise = 0;
    if (id === "home" && gk > 0) {
      for (const t of FAR_LOOK) {
        const d = Math.max(30, st.speed * t);
        const g = ground(lx + hx * d, lz + hz * d);
        const need = Math.atan2(g + 1.6 + d * 0.012 - st.pos.y, d);
        if (need > 0) pitchT = Math.max(pitchT, Math.min(0.82, need * 1.2) * gk);
        rise = Math.max(rise, g);
      }
    }
    // (and high: two and a half times what a world called its ceiling, eased over sixty metres, not twenty-four)
    const ceil = id === "home" ? Math.max(def.ceil * 2.5, Math.max(g0, g2, rise) + 120) : def.ceil * 2.5;
    const high = clamp01((st.pos.y - (ceil - 60)) / 60);
    if (high > 0) pitchT = Math.min(pitchT, pitchT * (1 - high) - high * 0.3);

    // bank and pitch are critically damped springs: they arrive, they never snap or ring
    const rollT = THREE.MathUtils.clamp(sx, -1, 1) * BANK;
    // (rolling into a turn is a little quicker than levelling out of it: it answers at once and lets go gently)
    spring2(st, "roll", "rollV", rollT, Math.abs(rollT) > Math.abs(st.roll) ? 4.8 : 4.0, dt);
    spring2(st, "pitch", "pitchV", pitchT, 4.2, dt);
    // The bank is the turn (slow flight turns a little tighter). The bank is already a spring, so the rate of turn
    // has no corner in it and the heading swings in and out of a turn; a second spring on top of it only made
    // the plane wait half a second before it answered and carry on turning long after the key was let go.
    st.yawR = st.roll * TURN_PER_BANK * (0.62 + 1.5 / Math.max(st.speed, 3));
    st.yaw -= st.yawR * dt;
    // speed follows the throttle; diving gathers a little, climbing spends a little
    // the kings' wood is gone through slowly
    // and at a cruise the quiet hand takes its time everywhere
    st.cruise = damp(st.cruise, voyage.cruise ? 1 : 0, 1.4, dt);
    // (a world built several times the size of the others is flown that much faster: WorldDef.pace; the top speed is held near the ordinary one)
    // (coming round for another go at a gate, it takes its time: a tighter circle)
    // (the kings' wood is gone through slowly at the slow steps and at the speed of every other world at the top one:
    // the six steps are the same six everywhere, scaled to the size of the world they are flown in)
    const kp = id === "kings" ? kingsPace(lz - KINGS.z) : 1;
    const wp = id === "kings" ? 1 : (def.pace ?? 1);
    const pace = wp * (id === "kings" ? kp + (1 - kp) * Math.pow(voyage.throttle, 1.5) : 1) * (1 - 0.55 * st.cruise * a) * (st.gateBack ? 0.65 : 1) * (1 - 0.7 * st.holdK);
    // (the pace held to what the bends and the last of the way allow, while the quiet hand has the plane)
    const vWant = speedOf(voyage.throttle) * pace;
    const vFree = opts.launching ? 0 : vWant + (Math.min(vWant, st.vPath) - vWant) * a;
    const vT = opts.launching ? Math.min(speedOf(voyage.throttle), 2 + st.t * 3.6) : Math.min(vFree, SPEED.max * wp * 1.1) - Math.sin(st.pitch) * 9 * pace;
    // (eased twice over: the pace a moment ago leads the pace now, so a change of speed has no corner in it)
    st.speedT = damp(st.speedT, Math.max(SPEED.min * 0.8, vT), opts.launching ? 3 : 1.6, dt);
    st.speed = damp(st.speed, st.speedT, opts.launching ? 3 : 1.6, dt);
    updateNose();
    st.pos.addScaledVector(st.nose, st.speed * dt);
    // (at a crawl the nose alone would hardly lift it: the keys also raise and lower it a little directly)
    st.pos.y += st.climbF * 3.2 * clamp01(1 - st.speed / 24) * gk * dt;
    // off the desk it lifts first, clear of everything standing there
    if (opts.launching && st.t < 0.7) st.pos.y += 0.75 * (1 - st.t / 0.7) * dt;
    st.pos.x += pushX * dt;
    st.pos.z += pushZ * dt;
    // eased up off the ground, never bumped
    if (low > 0) st.pos.y += low3 * (2 + st.speed * 0.4) * dt * gk;
    if (st.pos.y < floor) st.pos.y = damp(st.pos.y, floor, 10, dt);
    // (never under the surface itself, however steep the land and however long the frame)
    const gNow = tunnel ? Math.min(ground(st.pos.x - o.x, st.pos.z - o.z), st.pos.y - 5) : ground(st.pos.x - o.x, st.pos.z - o.z);
    if (st.pos.y < gNow + 0.25 * gk) st.pos.y = gNow + 0.25 * gk;
    st.alt = st.pos.y - gNow;
    return edge;
  };

  // gates and the cloud between worlds
  const passage = (dt: number) => {
    const id = voyage.cur;
    if (voyage.phase === "open") {
      // the flight's end: into the little world between the kings' hands, and home
      // its light grows over the frame as the plane comes up to it, so there is no moment of going in: only more light
      if (id === "kings" && !voyage.homing) {
        const o = originOf(id);
        const b = kingsBloom(st.pos.x - o.x, st.pos.y, st.pos.z - o.z);
        voyage.veil = b.veil;
        voyage.warm = b.veil > 0 ? 1 : 0;
        if (b.d < KINGS.domeR * 1.1) {
          voyage.homing = true;
          voyage.warm = 1;
          voyage.onHome?.();
          return;
        }
      }
      // The gate is forgiving: the whole lit opening counts, from the ground under it to above its point and a
      // little either side, and so does the air just round it. Going through it either way, at any pace, is the way on.
      const gate = gateAt(id);
      if (gate) {
        const o = originOf(id);
        const rx = st.pos.x - o.x - gate.pos.x;
        const ry = st.pos.y - gate.pos.y;
        const rz = st.pos.z - o.z - gate.pos.z;
        const along = -Math.sin(gate.yaw) * rx - Math.cos(gate.yaw) * rz;
        const side = Math.abs(Math.cos(gate.yaw) * rx - Math.sin(gate.yaw) * rz);
        const reach = GATE_REACH[id] ?? openingReach(id);
        const inside = side < (reach?.[0] ?? 19) && ry < (reach?.[1] ?? 26);
        const crossed = Number.isFinite(st.gateAlong) && st.gateAlong < 0 !== along < 0 && Math.abs(along - st.gateAlong) < 40;
        const through = inside && (crossed || Math.abs(along) < 3.5);
        if (process.env.NODE_ENV !== "production" && crossed && !inside && side < 60) console.warn(`[voyage] ${id}: passed the gate's plane outside it (${side.toFixed(1)} m aside, ${ry.toFixed(1)} m above its middle)`);
        // The window is not ready yet (the next world is still being made ready behind the gate): the plane eases down
        // to a glide as it comes up to the gate and waits for it there, never going under cloud while a window can be had
        const nx = WORLD_ORDER[WORLD_ORDER.indexOf(id) + 1];
        const waiting = !!nx && !voyage.homing && portalCapable(id) && !portalReady(nx) && st.holdT < 25;
        st.holdK = waiting && along < 4 && side < 160 ? smooth01((320 + along) / 260) : damp(st.holdK, 0, 4, dt);
        if (waiting && inside && along > -3 && along < 40 && st.holdK > 0.5) {
          const fx = -Math.sin(gate.yaw);
          const fz = -Math.cos(gate.yaw);
          st.pos.x -= fx * (along + 3);
          st.pos.z -= fz * (along + 3);
          st.holdT += dt;
          st.gateAlong = -3;
        } else {
        st.gateAlong = along;
        if (through) {
          // (for the gate's ripple only: where in its opening the plane went through)
          voyage.gateHit = { world: id, side: Math.cos(gate.yaw) * rx - Math.sin(gate.yaw) * rz, up: ry, at: performance.now() };
          voyage.next = WORLD_ORDER[WORLD_ORDER.indexOf(id) + 1] ?? null;
          // (the gate was a window on a world that stands ready: straight through it. Otherwise, the cloud)
          if (voyage.next && portalReady(voyage.next)) through_(id, voyage.next);
          else if (voyage.next) voyage.phase = "closing";
          else if (process.env.NODE_ENV !== "production") console.error(`[voyage] ${id}: through the gate, but no world follows`);
        }
        }
      }
    } else if (voyage.phase === "closing") {
      voyage.veil = Math.min(1, voyage.veil + dt / 1.0);
      // (a world with something heavy in it is made in slices: a little each frame while the cloud closes, more once it
      // is shut and nothing else is seen; the world is not swapped in until that is done, so no single frame is long)
      let made = true;
      if (voyage.prep) {
        const t0 = performance.now();
        const budget = voyage.veil >= 1 ? 13 : 3;
        do made = voyage.prep();
        while (!made && performance.now() - t0 < budget);
        if (made) voyage.prep = null;
      }
      if (voyage.veil >= 1 && voyage.next && made) {
        const to = voyage.next;
        voyage.next = null;
        // a world made ready while this one was flown is simply shown
        voyage.quick = voyage.ready === to;
        swapWorld(to);
        const e = entryOf(to);
        place(to, e.pos, e.yaw);
        voyage.phase = "hold";
        voyage.held = 0;
      }
    } else if (voyage.phase === "hold") {
      // the new world is drawn under the cloud for a few frames (its shaders and buffers are made there) before it opens
      voyage.veil = 1;
      voyage.held += dt;
      // (one that was ready needs only the sky's change of colour; one made here and now is given longer)
      if (voyage.held > (voyage.quick ? 0.3 : 0.75) && voyage.frames >= (voyage.quick ? 3 : 5) && !voyage.skyFrom) voyage.phase = "opening";
    } else {
      // (after a window there was never more than a breath of cloud at the frame's edges: it is gone in a moment)
      voyage.veil = Math.max(0, voyage.veil - dt / (st.windowed ? 0.9 : 1.7));
      if (voyage.veil <= 0) {
        voyage.phase = "open";
        st.windowed = false;
      }
    }
  };
  // Through a gate that is a window (worlds/portal.tsx): the plane is carried from this world's gate to the next
  // world's entry with the very turn and offset it has (so is the eye that follows it, and the mist behind it),
  // and the worlds change places in the same instant. What was seen through the gate is now simply there.
  const through_ = (from: WorldId, to: WorldId) => {
    const turn = gateToEntry(from, to, M4);
    if (turn === null) {
      voyage.phase = "closing";
      return;
    }
    const y0 = st.pos.y;
    st.pos.applyMatrix4(M4);
    const yRigid = st.pos.y;
    st.pos.y = carryY(y0);
    repace(to);
    st.yaw += turn;
    st.camYaw += turn;
    // (the mist goes with it; where the height was brought in toward the entry's it begins afresh instead of hanging apart from the wings)
    if (Math.abs(st.pos.y - yRigid) < 0.3) trails.carry(M4);
    else trails.reset();
    voyage.next = null;
    voyage.quick = true;
    swapWorld(to);
    // (no slow change of sky under a cloud: the sky is already the one that was seen through the gate)
    voyage.skyFrom = null;
    portalSwap(to);
    // never into the ground on the far side, whatever height the gate was taken at
    const o = originOf(to);
    const floor = groundAt(WORLDS[to], st.pos.x - o.x, st.pos.z - o.z) + 2;
    if (st.pos.y < floor) st.pos.y = floor;
    st.pathI = 0;
    st.pathMax = 0;
    st.vPath = 1e9;
    st.seek = 0;
    st.gateSide = -1;
    st.gateBack = false;
    st.gateWait = 0;
    st.gateAlong = NaN;
    st.holdK = 0;
    st.holdT = 0;
    st.idle = Math.max(st.idle, 0);
    updateNose();
    st.windowed = true;
    // (no breath of cloud: the frame after the worlds change places is the frame before)
    voyage.veil = 0;
    voyage.held = 0;
    voyage.phase = "opening";
  };
  const airOf = (edge: number) => {
    // (the kings' light is not cloud: it thickens no air)
    const v = voyage.warm > 0 ? 0 : voyage.veil;
    voyage.mist = v * v * 0.03 + edge * edge * 0.004;
  };

  apiRef.current = {
    pos: st.pos,
    launch: (cam) => {
      bakeHomeSolids(scene);
      st.pos.copy(rest);
      st.pos.y += 0.017;
      st.yaw = spot.rot;
      st.pitch = 0.3;
      st.roll = st.rollV = st.pitchV = st.yawR = st.yawRV = st.climbF = 0;
      st.speed = st.speedT = 0.6;
      st.t = 0;
      st.idle = 9;
      st.pathI = 0;
      st.gateSide = -1;
    st.gateBack = false;
    st.gateWait = 0;
      st.fov = cam.fov;
      st.qFrom.copy(cam.quaternion);
      st.paceW = 1;
      st.nearOn = false;
      st.camLift = st.camLiftV = 0;
      st.camFrom.copy(cam.position);
      st.camYaw = Math.atan2(cam.position.x - rest.x, cam.position.z - rest.z);
      st.camPitch = 0;
      st.look.copy(rest);
      st.landPhase = 0;
      st.lookYaw = st.lookPitch = st.lookTY = st.lookTP = 0;
      st.lookIdle = 9;
      st.sx = st.sy = st.cruise = 0;
      st.gateAlong = NaN;
      voyage.flying = true;
      voyage.assist = 1;
      voyage.throttle = 0.2;
      updateNose();
    },
    fly: (dt, input, cam) => {
      st.t += dt;
      if (input.wheel) zoomMem.v = THREE.MathUtils.clamp(zoomMem.v * Math.exp(input.wheel * 0.0011), zoomMem.min, zoomMem.max);
      const launching = st.t < 2.4 && voyage.cur === "home" && voyage.phase === "open";
      // in the first moments, and while cloud is over the lens, the plane flies itself
      const hands = st.t < 0.9 || voyage.phase === "closing";
      if (hands) {
        handsIn.wheel = input.wheel;
        handsIn.moved = input.moved;
      }
      // At speed a long frame is flown in several short steps (never more than about a metre and a half each), so
      // the ground, a gate's plane and a tight turn are met as they would be at sixty frames a second.
      const n = Math.min(5, Math.max(1, Math.ceil((st.speed * dt) / 1.5)));
      let edge = 0;
      for (let i = 0; i < n; i++) {
        edge = glide(dt / n, hands ? handsIn : input, hands ? (launching ? OPT_LAUNCH_HANDS : OPT_HANDS) : launching ? OPT_LAUNCH : OPT_NONE);
        passage(dt / n);
        if (voyage.phase === "hold") break;
      }
      crossingStep(dt, voyage.next !== null && voyage.ready === voyage.next);
      airOf(edge);
      lookStep(dt, st.t < 1.7 ? null : input);
      chase(dt, cam, easeInOutCubic(clamp01(st.t / 1.7)));
      // the lens in flight (Post.tsx): the plane and the whole middle distance sharp, a slow soft fall-off far away, and whatever comes right up to the glass
      postCtl.flight.k = damp(postCtl.flight.k, st.t > 2 ? 1 : 0, 0.9, dt);
      // Out in the open the eye sees for kilometres: the near plane is drawn in from a centimetre (the desk's
      // close-ups need that) to a hand's breadth, which gives the far distance some fifty times the depth to tell
      // one far thing from another, so nothing shimmers or fights out there. (The plane is never nearer than 70 cm.)
      if (st.t > 1.4) {
        if (!st.nearOn) {
          st.nearOn = true;
          st.near0 = cam.near;
          st.nearNow = cam.near;
        }
        const toPlane = cam.position.distanceTo(st.pos);
        const nearT = Math.min(FLY_NEAR + (4 - FLY_NEAR) * smooth01(st.alt / 300), Math.max(FLY_NEAR, toPlane * 0.5 - 0.15));
        st.nearNow = damp(st.nearNow, nearT, 2, dt);
        cam.near = st.nearNow;
        cam.updateProjectionMatrix();
      }
      // the mist: from a brisk pace up, more in a bank and a dive; none in the first moments off the desk or under cloud
      const mist = smooth01((st.speed - 8) / 16) * (0.75 + 0.75 * Math.min(1, Math.abs(st.roll) / 0.47) + 1.1 * clamp01(-st.pitch / 0.45)) * smooth01((st.t - 1.6) / 2) * (1 - voyage.veil);
      sync(dt, cam, Math.min(1.4, mist));
    },
    beginLand: (cam) => {
      st.t = 0;
      st.landT = 0;
      const far = voyage.cur !== "home" || st.pos.distanceTo(rest) > 80 || voyage.phase !== "open";
      st.landMode = far ? "cloud" : "near";
      st.landPhase = far ? 0 : 2;
      voyage.next = null;
      voyage.phase = "open";
      st.camFrom.copy(cam.position);
      st.lookFrom.copy(st.look);
      st.upFrom.copy(cam.up);
      if (!far) {
        // straight home: a long curve from wherever it is, arriving along the plane's own resting line
        const d = st.pos.distanceTo(rest);
        st.b0.copy(st.pos);
        st.b1.copy(st.pos).addScaledVector(st.nose, d * 0.4);
        st.b2.set(rest.x + Math.sin(spot.rot) * d * 0.3, rest.y + 0.017 + d * 0.1, rest.z + Math.cos(spot.rot) * d * 0.3);
        st.b3.copy(rest).setY(rest.y + 0.017);
        st.landDur = THREE.MathUtils.clamp(1.9 + d * 0.045, 2.4, 5.2);
        st.lastYaw = st.yaw;
      }
    },
    land: (dt, cam, home) => {
      st.t += dt;
      postCtl.flight.k = damp(postCtl.flight.k, 0, 2.2, dt);
      // (coming back to the desk the lens sees close again: at once under the cloud, and over the last of a straight approach)
      if (st.landPhase === 1 && st.nearOn) {
        st.nearOn = false;
        cam.near = st.near0;
      }
      if (st.landPhase === 0) {
        // on, into the cloud
        glide(dt, NO_INPUT, OPT_HANDS);
        // (out of the kings' light it fills the frame more slowly: the last of it is a long swell, not a snap)
        voyage.veil = Math.min(1, voyage.veil + dt / (voyage.homing ? 2.4 : 1.0));
        airOf(0);
        lookStep(dt, null);
        chase(dt, cam);
        sync(dt, cam, 0);
        if (voyage.veil >= 1) {
          // out of the little world's light, home is found in that same light
          if (voyage.homing) arriveGolden();
          swapWorld("home");
          st.landPhase = 1;
          voyage.held = 0;
          voyage.frames = 0;
          // it comes down out of the cloud over the visitor's shoulder
          st.b0.set(rest.x - 1.9, rest.y + 1.7, rest.z + 3.2);
          st.b3.copy(rest).setY(rest.y + 0.017);
          st.b1.copy(st.b0).lerp(st.b3, 0.4).setY(st.b0.y - 0.25);
          st.b2.set(rest.x + Math.sin(spot.rot) * 0.95, rest.y + 0.017 + 0.3, rest.z + Math.cos(spot.rot) * 0.95);
          st.landDur = voyage.homing ? 4.8 : 3.2;
          st.pos.copy(st.b0);
          st.lastYaw = spot.rot;
          st.speed = 0;
        }
        return false;
      }
      if (st.landPhase === 1) {
        // home is drawn under the cloud first
        voyage.veil = 1;
        voyage.held += dt;
        st.camFrom.copy(home.pos);
        st.lookFrom.copy(home.look);
        // Out of the kings' light the eye is still going forward: it is found a little back from and above where it
        // comes to rest, looking the same way, and as the light thins it glides on in, so the way into the dome and
        // the way down to the desk are one move.
        if (voyage.homing) st.camFrom.addScaledVector(st.tmp2.copy(home.look).sub(home.pos).normalize(), -2.4).y += 0.9;
        cam.position.copy(st.camFrom);
        cam.up.set(0, 1, 0);
        st.look.copy(home.look);
        cam.lookAt(st.look);
        st.fov = voyage.homing ? 44 : 36;
        cam.fov = st.fov;
        if (voyage.held > (voyage.homing ? 0.25 : 0.6) && voyage.frames >= 4 && !voyage.skyFrom) {
          st.landPhase = 2;
          st.landT = 0;
        }
        return false;
      }
      st.landT += dt;
      const u = clamp01(st.landT / st.landDur);
      // quick away, long and soft at the end
      const k = 1 - Math.pow(1 - u, 2.6) * (1 + 1.6 * u);
      const kk = clamp01(k);
      const a = (1 - kk) ** 3;
      const b = 3 * (1 - kk) ** 2 * kk;
      const c = 3 * (1 - kk) * kk ** 2;
      const d = kk ** 3;
      const prev = st.tmp.copy(st.pos);
      st.pos.set(a * st.b0.x + b * st.b1.x + c * st.b2.x + d * st.b3.x, a * st.b0.y + b * st.b1.y + c * st.b2.y + d * st.b3.y, a * st.b0.z + b * st.b1.z + c * st.b2.z + d * st.b3.z);
      // (the way down never dips through a knoll or the water on its way to the desk)
      if (voyage.cur === "home") st.pos.y = Math.max(st.pos.y, homeGround(st.pos.x, st.pos.z) + Math.min(1.2, st.pos.distanceTo(st.b3) * 0.1));
      const vx = st.pos.x - prev.x;
      const vy = st.pos.y - prev.y;
      const vz = st.pos.z - prev.z;
      const hv = Math.hypot(vx, vz);
      st.speed = Math.hypot(hv, vy) / Math.max(dt, 1e-3);
      if (hv > 1e-5) {
        const yawT = Math.atan2(-vx, -vz);
        // heading from the curve, settling on the resting heading as it slows
        const settle = smooth01((u - 0.72) / 0.28);
        const want = yawT + wrap(spot.rot - yawT) * settle;
        st.yaw += wrap(want - st.yaw) * (1 - Math.exp(-dt * 9));
        st.pitch = damp(st.pitch, Math.atan2(vy, hv) * (1 - settle), 7, dt);
        const turn = wrap(st.yaw - st.lastYaw) / Math.max(dt, 1e-3);
        st.roll = damp(st.roll, THREE.MathUtils.clamp(-turn * 0.32, -0.6, 0.6) * (1 - settle), 5, dt);
        st.lastYaw = st.yaw;
      }
      if (u >= 1) {
        st.yaw = spot.rot;
        st.pitch = st.roll = 0;
      }
      updateNose();
      // (coming out of the kings' light it is already moving: it only slows, over the whole time the light thins)
      const ck = voyage.homing ? 1 - Math.pow(1 - clamp01(st.landT / 4.8), 3) : easeInOutCubic(clamp01(st.landT / Math.min(st.landDur, 3.2)));
      cam.position.lerpVectors(st.camFrom, home.pos, ck);
      st.look.lerpVectors(st.lookFrom, home.look, ck);
      // (the frame is levelled as it comes home, not at a stroke)
      if (st.landMode === "near") cam.up.lerpVectors(st.upFrom, UP, ck).normalize();
      else cam.up.set(0, 1, 0);
      cam.lookAt(st.look);
      if (st.nearOn) {
        const k = smooth01((ck - 0.45) / 0.45);
        cam.near = st.nearNow + (st.near0 - st.nearNow) * k;
        if (k >= 1) st.nearOn = false;
      }
      st.fov += (36 - st.fov) * Math.min(1, dt * 3);
      cam.fov = st.fov;
      // (the light of the kings' little world thins more slowly than cloud)
      // (out of the kings' light the light does not drain at a steady rate: it lets go slowly, thins through the middle of the
      // time and settles last, over the whole of the glide down to the desk)
      if (st.landMode === "cloud") voyage.veil = voyage.homing ? Math.min(voyage.veil, 1 - smooth01(st.landT / 4.6)) : Math.max(0, voyage.veil - dt / 1.7);
      airOf(0);
      sync(dt, cam, 0);
      const done = u >= 1 && voyage.veil <= 0;
      if (done) {
        voyage.homing = false;
        voyage.warm = 0;
        voyage.flying = false;
        voyage.assist = 0;
        voyage.mist = 0;
        st.landPhase = 0;
        if (st.nearOn) {
          st.nearOn = false;
          cam.near = st.near0;
        }
        postCtl.flight.k = 0;
        voyage.planePos.set(0, -1e4, 0);
        voyage.planeSpeed = 0;
      }
      return done;
    },
    warp: (z) => {
      const p = pathOf("home").pts;
      let best = 0;
      for (let i = 0; i < p.length; i++) if (Math.abs(p[i].z - z) < Math.abs(p[best].z - z)) best = i;
      place("home", p[best], 0);
      st.pathI = st.pathMax = best;
      st.t = Math.max(st.t, 3);
      st.speed = st.speedT = speedOf(voyage.throttle);
    },
    jump: (id, along = 0) => {
      voyage.homing = false;
      voyage.warm = 0;
      voyage.next = null;
      voyage.phase = "hold";
      voyage.veil = 1;
      voyage.held = 0;
      voyage.quick = false;
      swapWorld(id);
      if (id === "home") bakeHomeSolids(scene);
      voyage.frames = 0;
      if (along > 0 || id === "home") {
        const p = pathOf(id).pts;
        const i = Math.min(p.length - 2, Math.round(along * (p.length - 1)));
        place(id, p[i], Math.atan2(-(p[i + 1].x - p[i].x), -(p[i + 1].z - p[i].z)));
        st.pathI = st.pathMax = i;
      } else {
        const e = entryOf(id);
        place(id, e.pos, e.yaw);
      }
      st.t = Math.max(st.t, 3);
      st.idle = 9;
      st.speed = st.speedT = speedOf(voyage.throttle);
    },
    speed: () => st.speed,
    boost: () => 0,
    landMist: () => 0,
  };

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (!flying) {
      if (trails.mesh.visible) trails.reset();
      // load-in: like everything else on the desk it waits just above its
      // place and alights, last and lightest: a short glide down its own
      // heading, nose a little high, levelling as it touches
      const at = introAt?.current ?? null;
      const t = instant ? 99 : at === null ? -1 : nowS() - at - introDelay;
      g.visible = true;
      if (!instant && t < 3) {
        const r = 1 - spring(t, 7, 1);
        const rr = 1 - spring(t - 0.05, 5.6, 1);
        g.rotation.order = "XYZ";
        g.position.set(rest.x + Math.sin(spot.rot) * 0.07 * r, rest.y + 0.017 + 0.055 * r, rest.z + Math.cos(spot.rot) * 0.07 * r);
        g.rotation.set(0.1 * rr, spot.rot + 0.14 * rr, -0.16 * rr);
        return;
      }
      g.rotation.order = "XYZ";
      g.position.copy(rest);
      // (it lies still under the pointer: he asked that it never lift or stir on hover; the cursor and its label say it can be picked)
      g.position.y += 0.017;
      g.rotation.set(0, spot.rot, 0);
      return;
    }
    g.position.copy(st.pos);
    g.rotation.set(0, 0, 0, "YXZ");
    g.rotation.y = st.yaw;
    g.rotation.x = st.pitch;
    g.rotation.z = -st.roll;
  });

  return (
    <>
      <primitive object={trails.mesh} />
      <group
        ref={group}
        onPointerOver={(e) => {
          if (!hoverable) return;
          e.stopPropagation();
          hover.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          hover.current = false;
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          if (!hoverable || e.delta > 6) return;
          e.stopPropagation();
          onPick();
        }}
      >
        <mesh geometry={geo} material={mat} castShadow receiveShadow />
        {/* generous invisible hit area: the plane is small */}
        <mesh visible={false}>
          <boxGeometry args={[0.17, 0.07, 0.25]} />
        </mesh>
      </group>
    </>
  );
}
