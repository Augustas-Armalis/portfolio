"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { DESK, clamp01, easeInOutCubic, nowS, spring } from "./shared";
import { arriveGolden } from "./sky";
import { KINGS, WORLDS, crossingStep, entryOf, gateOf, groundAt, kingsBloom, kingsPace, kingsView, noteAssist, originOf, pathOf, swapWorld, voyage, WORLD_ORDER, type WorldId } from "./worlds/voyage";

// A folded paper plane that lives on the desk. Click it and it takes off down
// the road, and from there it is yours: it glides. The pointer (or A / D, or a
// finger) banks it and the bank turns it; the pointer's height pitches it; W / S
// or the wheel open and close the throttle, from barely moving to quick. It has
// a little weight: every change eases in, nothing snaps. The ground, the tall
// things and the edge of each world turn it aside gently and never stop it.
// Leave the controls alone for a few seconds and a quiet hand takes over and
// carries it along the path of light to the next gate; touch them and it lets
// go at once. Passing a gate, cloud closes, the next world is made under it,
// and the cloud opens.

// `soft`: the stick is a thumb on glass, so it is eased before the plane hears it; `auto`: there is no stick while
// the path is followed (a phone), so the quiet hand has the plane at once. `look` is a drag across the view and
// `gyro` the phone's own turning: both only turn the eye, never the plane.
export type FlightInput = {
  sx: number;
  sy: number;
  thr?: number;
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
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth01 = (t: number) => {
  const k = clamp01(t);
  return k * k * (3 - 2 * k);
};
export const SPEED = { min: 3.2, max: 28 };
export const speedOf = (throttle: number) => SPEED.min + (SPEED.max - SPEED.min) * Math.pow(clamp01(throttle), 1.35);

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

  const st = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      rollV: 0,
      pitchV: 0,
      speed: 0,
      t: 0,
      idle: 9, // seconds since the controls were last touched
      pathI: 0,
      seek: 0,
      gateSide: -1,
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
    }),
    [],
  );
  const rest = useMemo(() => new THREE.Vector3(spot.pos[0], DESK.top + 0.013, spot.pos[2]), [spot]);

  // The paper itself is moved in the same breath as the camera that follows it
  // (fly and land are called from the scene's frame; this component's own
  // frame callback runs before that one and would show it a frame behind).
  const sync = () => {
    const g = group.current;
    if (!g) return;
    g.position.copy(st.pos);
    g.rotation.set(0, 0, 0, "YXZ");
    g.rotation.y = st.yaw;
    g.rotation.x = st.pitch;
    g.rotation.z = -st.roll;
  };
  const updateNose = () => st.nose.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));

  // the chase camera swings on a boom behind the plane: it follows the
  // heading a beat late, so a turn shows the plane banking into it, and it
  // never falls behind however fast the plane goes
  const chase = (dt: number, cam: THREE.PerspectiveCamera, blend = 1) => {
    if (st.snap) {
      st.camYaw = st.yaw;
      st.camPitch = st.pitch * 0.55;
    }
    st.camYaw += wrap(st.yaw - st.camYaw) * (1 - Math.exp(-dt * 3.2));
    st.camPitch = damp(st.camPitch, st.pitch * 0.55, 2.6, dt);
    const dist = 1.32 + st.speed * 0.022;
    // the eye may be turned away from the plane's own line: it swings round the plane on the same boom
    const lw = smooth01(Math.hypot(st.lookYaw, st.lookPitch) / 0.5);
    const yawC = st.camYaw + st.lookYaw;
    const pitC = THREE.MathUtils.clamp(st.camPitch + st.lookPitch, -1.45, 1.45);
    const cp = Math.cos(pitC);
    const want = st.tmp2.set(st.pos.x + Math.sin(yawC) * cp * dist, st.pos.y - Math.sin(pitC) * dist + 0.44 * (1 - 0.75 * lw) + Math.sin(st.t * 1.7) * 0.02, st.pos.z + Math.cos(yawC) * cp * dist);
    // the lens keeps clear of the ground too
    const id = voyage.cur;
    const o = originOf(id);
    const floor = (id === "home" ? 0 : groundAt(WORLDS[id], want.x - o.x, want.z - o.z)) + 0.5;
    if (want.y < floor) want.y = floor;
    if (blend < 1) cam.position.lerpVectors(st.camFrom, want, blend);
    else cam.position.copy(want);
    st.tmp.copy(st.pos).addScaledVector(st.nose, 2.4);
    // before the kings the eye is lifted to the whole picture, and the lens opens to hold it
    const kv = id === "kings" && !voyage.homing ? kingsView(st.pos.y, st.pos.z - o.z - KINGS.z) : null;
    if (kv) st.tmp.y += (cam.position.y + Math.tan(kv.elev) * Math.hypot(st.tmp.x - cam.position.x, st.tmp.z - cam.position.z) - st.tmp.y) * kv.w;
    st.look.lerp(st.tmp, st.snap ? 1 : 1 - Math.exp(-dt * 8));
    st.snap = false;
    const lean = Math.sin(st.roll) * 0.26 * (1 - lw);
    cam.up.set(Math.cos(st.camYaw) * lean, 1, -Math.sin(st.camYaw) * lean).normalize();
    if (lw > 0.001) {
      // turned: it looks where it was turned to, past the plane (and keeps that line even where the ground holds the lens up)
      st.tmp3.set(cam.position.x - Math.sin(yawC) * cp * 9, cam.position.y + Math.sin(pitC) * 9, cam.position.z - Math.cos(yawC) * cp * 9);
      cam.lookAt(st.tmp3.lerpVectors(st.look, st.tmp3, lw));
    } else cam.lookAt(st.look);
    const fovT = Math.max(kv ? kv.fov : 0, 50 + clamp01((st.speed - SPEED.min) / (SPEED.max - SPEED.min)) * 16);
    st.fov += (fovT - st.fov) * (1 - Math.exp(-dt * 2.4));
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
    } else if (L) {
      if (L.dx || L.dy) {
        st.lookTY = THREE.MathUtils.clamp(st.lookTY + L.dx * 0.0052, -2.95, 2.95);
        st.lookTP = THREE.MathUtils.clamp(st.lookTP + L.dy * 0.0044, -1.15, 1.35);
        st.lookIdle = 0;
      } else if (!L.held) st.lookIdle += dt;
      if (!voyage.lockView && st.lookIdle > 2.6) {
        const k = 1 - Math.exp(-dt * 1.15);
        st.lookTY -= st.lookTY * k;
        st.lookTP -= st.lookTP * k;
      }
    }
    const k = 1 - Math.exp(-dt * 9);
    st.lookYaw += wrap(st.lookTY - st.lookYaw) * k;
    st.lookPitch += (st.lookTP - st.lookPitch) * k;
  };

  const gates = new Map<WorldId, ReturnType<typeof gateOf>>();
  const gateAt = (id: WorldId) => {
    if (!gates.has(id)) gates.set(id, gateOf(id));
    return gates.get(id) ?? null;
  };

  const place = (id: WorldId, lp: THREE.Vector3, yaw: number) => {
    st.pos.copy(lp).add(originOf(id));
    st.yaw = yaw;
    st.pitch = st.roll = st.rollV = st.pitchV = 0;
    st.pathI = 0;
    st.seek = 0;
    st.gateSide = -1;
    st.gateAlong = NaN;
    st.snap = true;
    updateNose();
  };

  // where on the path of light the plane is nearest (kept as an index that only creeps, so a loop or a hairpin can't confuse it)
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
    // far off the path: look along all of it now and then, and take it up wherever it is nearest
    st.seek -= dt;
    if (bd > 70 * 70 && st.seek <= 0) {
      st.seek = 0.6;
      for (let i = 0; i < n; i += 2) {
        const d = d2(i);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    st.pathI = loop ? ((best % n) + n) % n : Math.min(n - 1, Math.max(0, best));
  };

  // one step of gliding in the world that stands
  const glide = (dt: number, input: FlightInput, opts: { launching?: boolean; hands?: boolean } = {}) => {
    const id = voyage.cur;
    const def = WORLDS[id];
    const o = originOf(id);
    const lx = st.pos.x - o.x;
    const lz = st.pos.z - o.z;
    const ground = (x: number, z: number) => (id === "home" ? 0 : groundAt(def, x, z));

    // throttle: keys ease it, the wheel nudges it
    voyage.throttle = clamp01(voyage.throttle + (input.thr ?? 0) * 0.42 * dt - (input.wheel ?? 0) * 0.0009);

    // the stick, with a soft centre so small corrections are small
    const shape = (v: number) => v * (0.5 + 0.5 * v * v);
    // a thumb's stick is eased on its way to the plane, so a quick thumb is never a twitch
    st.sx = damp(st.sx, input.sx, input.soft ? 7.5 : 60, dt);
    st.sy = damp(st.sy, input.sy, input.soft ? 7.5 : 60, dt);
    let sx = shape(st.sx);
    let sy = shape(st.sy);
    const climb = input.climb ?? 0;
    const touching = Math.abs(input.sx) > 0.03 || Math.abs(input.sy) > 0.03 || climb !== 0;
    // a pointer lying still off-centre is not steering: after a while it is let go of
    const stale = !input.keys && performance.now() - (input.moved ?? 0) > 7000;
    if (touching && !stale && !opts.hands) st.idle = 0;
    else st.idle += dt;
    const want = opts.hands || opts.launching || (voyage.guide && (st.idle > 3.2 || (input.auto && !touching))) ? 1 : 0;
    voyage.assist = damp(voyage.assist, want, want ? 0.85 : 5.5, dt);
    noteAssist();
    const a = voyage.assist;

    // the quiet hand: aim a little way down the path of light
    const path = pathOf(id);
    nearestOnPath(path.pts, lx, st.pos.y, lz, !!def.loop, dt);
    if (a > 0.001) {
      const n = path.pts.length;
      const ahead = Math.round((24 + st.speed * 1.7) / 4);
      const ti = def.loop ? (st.pathI + ahead) % n : Math.min(n - 1, st.pathI + ahead);
      const tp = path.pts[ti];
      const dx = tp.x - lx;
      const dz = tp.z - lz;
      const err = wrap(Math.atan2(-dx, -dz) - st.yaw);
      const ax = THREE.MathUtils.clamp(-err * 1.5, -1, 1);
      const ay = THREE.MathUtils.clamp((Math.atan2(tp.y - st.pos.y, Math.hypot(dx, dz) + 6) / 0.5) * 1.5, -1, 1);
      sx = sx * (1 - a) + ax * a;
      sy = sy * (1 - a) + ay * a;
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
          const k = smooth01((150 + along) / 80) * smooth01((80 - Math.abs(side)) / 45) * 0.6 * (1 - a);
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
      edge = smooth01((r - def.radius * 0.86) / (def.radius * 0.2));
      if (edge > 0) {
        const outward = (-Math.sin(st.yaw) * ex - Math.cos(st.yaw) * ez) / Math.max(r, 1);
        const err = wrap(Math.atan2(ex, ez) - st.yaw);
        const k = edge * (outward > -0.2 ? 1 : 0.25);
        sx = sx * (1 - k) + THREE.MathUtils.clamp(-err * 1.4, -1, 1) * k;
      }
    }

    // tall things: lean away early, and be eased round them
    const g0b = ground;
    let pushX = 0;
    let pushZ = 0;
    for (const ob of def.obstacles) {
      const ox = lx - ob.x;
      const oz = lz - ob.z;
      const d = Math.hypot(ox, oz);
      const reach = 12 + st.speed * 0.9;
      const top = g0b(ob.x, ob.z) + ob.h;
      if (d > ob.r + reach || st.pos.y > top + 8) continue;
      // a bell narrows toward its crown: the plane may pass close over its shoulder
      const t = clamp01((st.pos.y - (top - ob.h)) / ob.h);
      const rad = ob.bell ? ob.r * Math.sqrt(Math.max(0.02, 1 - Math.pow(t, 2.5))) : ob.r;
      const k = smooth01(1 - (d - rad) / reach) * smooth01((top + 8 - st.pos.y) / 10);
      const toward = (Math.sin(st.yaw) * ox + Math.cos(st.yaw) * oz) / Math.max(d, 1); // > 0 when flying at it
      if (toward > 0) {
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
    const g0 = ground(lx, lz);
    const g1 = ground(lx + hx * st.speed * 0.9, lz + hz * st.speed * 0.9);
    const g2 = ground(lx + hx * st.speed * 2.0, lz + hz * st.speed * 2.0);
    const floor = Math.max(g0, g1, g2 - 2) + 1.5 * gk;
    const band = 2.6 + st.speed * 0.16;
    const low = clamp01(1 - (st.pos.y - floor) / band);
    const low3 = low * low * low;
    let pitchT = sy * 0.5 + climb * 0.34;
    if (low > 0) pitchT = Math.max(pitchT, pitchT * (1 - low) + low3 * 0.6);
    const high = clamp01((st.pos.y - (def.ceil - 24)) / 24);
    if (high > 0) pitchT = Math.min(pitchT, pitchT * (1 - high) - high * 0.3);

    // bank and pitch are sprung, a touch under critical: they arrive, they don't snap
    const rollT = THREE.MathUtils.clamp(sx, -1, 1) * 0.92;
    st.rollV += ((rollT - st.roll) * 10.5 - st.rollV * 6.0) * dt;
    st.roll += st.rollV * dt;
    st.pitchV += ((pitchT - st.pitch) * 8.5 - st.pitchV * 5.6) * dt;
    st.pitch += st.pitchV * dt;
    // the bank is the turn: slow flight turns tighter
    st.yaw -= st.roll * (0.8 + 2.2 / Math.max(st.speed, 3)) * dt;
    // speed follows the throttle; diving gathers a little, climbing spends a little
    // the kings' wood is gone through slowly
    // and at a cruise the quiet hand takes its time everywhere
    st.cruise = damp(st.cruise, voyage.cruise ? 1 : 0, 1.4, dt);
    const pace = (id === "kings" ? kingsPace(lz - KINGS.z) : 1) * (1 - 0.55 * st.cruise * a);
    const vT = opts.launching ? Math.min(speedOf(voyage.throttle), 2 + st.t * 3.6) : speedOf(voyage.throttle) * pace - Math.sin(st.pitch) * 5 * pace;
    st.speed = damp(st.speed, Math.max(SPEED.min * 0.8, vT), opts.launching ? 1.8 : 0.9, dt);
    updateNose();
    st.pos.addScaledVector(st.nose, st.speed * dt);
    // off the desk it lifts first, clear of everything standing there
    if (opts.launching && st.t < 0.7) st.pos.y += 0.75 * (1 - st.t / 0.7) * dt;
    st.pos.x += pushX * dt;
    st.pos.z += pushZ * dt;
    // eased up off the ground, never bumped
    if (low > 0) st.pos.y += low3 * (2 + st.speed * 0.4) * dt * gk;
    if (st.pos.y < floor) st.pos.y = damp(st.pos.y, floor, 10, dt);
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
        const inside = side < 19 && ry < 26;
        const crossed = Number.isFinite(st.gateAlong) && st.gateAlong < 0 !== along < 0 && Math.abs(along - st.gateAlong) < 40;
        const through = inside && (crossed || Math.abs(along) < 3.5);
        if (process.env.NODE_ENV !== "production" && crossed && !inside && side < 60) console.warn(`[voyage] ${id}: passed the gate's plane outside it (${side.toFixed(1)} m aside, ${ry.toFixed(1)} m above its middle)`);
        st.gateAlong = along;
        if (through) {
          voyage.next = WORLD_ORDER[WORLD_ORDER.indexOf(id) + 1] ?? null;
          if (voyage.next) voyage.phase = "closing";
          else if (process.env.NODE_ENV !== "production") console.error(`[voyage] ${id}: through the gate, but no world follows`);
        }
      }
    } else if (voyage.phase === "closing") {
      voyage.veil = Math.min(1, voyage.veil + dt / 1.0);
      if (voyage.veil >= 1 && voyage.next) {
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
      voyage.veil = Math.max(0, voyage.veil - dt / 1.7);
      if (voyage.veil <= 0) voyage.phase = "open";
    }
  };
  const airOf = (edge: number) => {
    // (the kings' light is not cloud: it thickens no air)
    const v = voyage.warm > 0 ? 0 : voyage.veil;
    voyage.mist = v * v * 0.03 + edge * edge * 0.004;
  };

  apiRef.current = {
    pos: st.pos,
    launch: (cam) => {
      st.pos.copy(rest);
      st.pos.y += 0.017;
      st.yaw = spot.rot;
      st.pitch = 0.3;
      st.roll = st.rollV = st.pitchV = 0;
      st.speed = 0.6;
      st.t = 0;
      st.idle = 9;
      st.pathI = 0;
      st.gateSide = -1;
      st.fov = cam.fov;
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
      voyage.throttle = 0.42;
      updateNose();
    },
    fly: (dt, input, cam) => {
      st.t += dt;
      const launching = st.t < 2.4 && voyage.cur === "home" && voyage.phase === "open";
      // in the first moments, and while cloud is over the lens, the plane flies itself
      const hands = st.t < 0.9 || voyage.phase === "closing";
      const edge = glide(dt, hands ? { ...input, sx: 0, sy: 0, climb: 0 } : input, { launching, hands });
      passage(dt);
      crossingStep(dt, voyage.next !== null && voyage.ready === voyage.next);
      airOf(edge);
      lookStep(dt, st.t < 1.7 ? null : input);
      chase(dt, cam, easeInOutCubic(clamp01(st.t / 1.7)));
      sync();
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
      if (st.landPhase === 0) {
        // on, into the cloud
        glide(dt, { sx: 0, sy: 0 }, { hands: true });
        voyage.veil = Math.min(1, voyage.veil + dt / 1.0);
        airOf(0);
        lookStep(dt, null);
        chase(dt, cam);
        sync();
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
          st.landDur = 3.2;
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
        cam.position.copy(home.pos);
        cam.up.set(0, 1, 0);
        st.look.copy(home.look);
        cam.lookAt(st.look);
        st.fov = 36;
        cam.fov = 36;
        st.camFrom.copy(home.pos);
        st.lookFrom.copy(home.look);
        if (voyage.held > 0.6 && voyage.frames >= 4 && !voyage.skyFrom) {
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
      const ck = easeInOutCubic(clamp01(st.landT / Math.min(st.landDur, 3.2)));
      cam.position.lerpVectors(st.camFrom, home.pos, ck);
      st.look.lerpVectors(st.lookFrom, home.look, ck);
      cam.up.set(0, 1, 0);
      cam.lookAt(st.look);
      st.fov += (36 - st.fov) * Math.min(1, dt * 3);
      cam.fov = st.fov;
      // (the light of the kings' little world thins more slowly than cloud)
      if (st.landMode === "cloud") voyage.veil = Math.max(0, voyage.veil - dt / (voyage.homing ? 2.6 : 1.7));
      airOf(0);
      sync();
      const done = u >= 1 && voyage.veil <= 0;
      if (done) {
        voyage.homing = false;
        voyage.warm = 0;
        voyage.flying = false;
        voyage.assist = 0;
        voyage.mist = 0;
        st.landPhase = 0;
      }
      return done;
    },
    warp: (z) => {
      const p = pathOf("home").pts;
      let best = 0;
      for (let i = 0; i < p.length; i++) if (Math.abs(p[i].z - z) < Math.abs(p[best].z - z)) best = i;
      place("home", p[best], 0);
      st.pathI = best;
      st.t = Math.max(st.t, 3);
      st.speed = speedOf(voyage.throttle);
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
      voyage.frames = 0;
      if (along > 0 || id === "home") {
        const p = pathOf(id).pts;
        const i = Math.min(p.length - 2, Math.round(along * (p.length - 1)));
        place(id, p[i], Math.atan2(-(p[i + 1].x - p[i].x), -(p[i + 1].z - p[i].z)));
        st.pathI = i;
      } else {
        const e = entryOf(id);
        place(id, e.pos, e.yaw);
      }
      st.t = Math.max(st.t, 3);
      st.idle = 9;
      st.speed = speedOf(voyage.throttle);
    },
    speed: () => st.speed,
    boost: () => 0,
    landMist: () => 0,
  };

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (!flying) {
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
      g.position.y += 0.017 + (hover.current && hoverable ? 0.008 : 0);
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
