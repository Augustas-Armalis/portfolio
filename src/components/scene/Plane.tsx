"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { ROUTE, roadX, roadY } from "./flightPath";
import { DESK, clamp01, easeInOutCubic, nowS } from "./shared";
import { SKY_U } from "./sky";

// A folded paper plane that lives on the desk. Click it and it takes off down
// the road. By default it rides a rail (nobody gets lost): the pointer, the
// arrow keys or a finger only lean it left, right, up and down, and it eases
// back to the middle when you let go. "Free flight" hands over the stick:
// bank to turn, pitch to climb, with the land gently turning you back toward
// the road at its edges. Out past the gate the rail circles the island.

export type FlightInput = { sx: number; sy: number };
export type PlaneApi = {
  launch: (cam: THREE.PerspectiveCamera) => void;
  fly: (dt: number, input: FlightInput, cam: THREE.PerspectiveCamera) => void;
  beginLand: (cam: THREE.PerspectiveCamera) => void;
  land: (dt: number, cam: THREE.PerspectiveCamera, home: { pos: THREE.Vector3; look: THREE.Vector3 }) => boolean;
  speed: () => number;
  boost: () => number;
  pos: THREE.Vector3;
  landMist: () => number;
  // jump along the rail to a z (used to check the stations; also handy for deep links later)
  warp: (z: number) => void;
};

const CRUISE = 11.5;
const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

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

// Wind you can see: long soft streaks hanging over the road. Fly through one
// and it carries you.
function makeCurrents() {
  const out: THREE.CatmullRomCurve3[] = [];
  for (let i = 0; i < 9; i++) {
    const z0 = -34 - i * 54;
    const side = i % 2 ? 1 : -1;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 5; j++) {
      const z = z0 - j * 8;
      pts.push(new THREE.Vector3(roadX(z) + side * (5 - j * 1.6) + Math.sin(j * 1.3 + i) * 1.2, roadY(z) + 0.8 + Math.sin(j * 0.9 + i * 2) * 1.1, z));
    }
    out.push(new THREE.CatmullRomCurve3(pts, false, "centripetal"));
  }
  return out;
}

export function Plane({
  spot,
  apiRef,
  flying,
  free,
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
  free: boolean;
  onPick: () => void;
  hoverable: boolean;
}) {
  const geo = useMemo(planeGeometry, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f6f3ea", roughness: 0.9, side: THREE.DoubleSide, flatShading: true }), []);
  const group = useRef<THREE.Group>(null);
  const curves = useMemo(makeCurrents, []);
  const samples = useMemo(() => curves.map((c) => c.getSpacedPoints(40)), [curves]);
  const tubes = useMemo(() => curves.map((c) => new THREE.TubeGeometry(c, 90, 0.05, 5, false)), [curves]);
  const streak = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { ...SKY_U, uOpacity: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vWorld;
          void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; uniform float uTime; uniform float uNight;
          varying vec2 vUv; varying vec3 vWorld;
          void main(){
            float s = fract(vUv.x * 5.0 - uTime * 0.35);
            float a = smoothstep(0.0, 0.7, s) * (1.0 - smoothstep(0.7, 1.0, s));
            a *= smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
            float d = length(vWorld - cameraPosition);
            a *= smoothstep(0.6, 3.0, d) * (1.0 - smoothstep(60.0, 110.0, d));
            vec3 c = mix(vec3(1.0, 0.97, 0.9), vec3(0.7, 0.8, 1.0), uNight);
            gl_FragColor = vec4(c * a * uOpacity * 0.5, 1.0);
          }`,
      }),
    [],
  );
  const hover = useRef(false);
  const freeRef = useRef(free);

  const st = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      vel: new THREE.Vector3(0, 0, -1),
      yaw: 0,
      pitch: 0,
      roll: 0,
      speed: 0,
      t: 0,
      s: 0, // metres run along the rail
      ox: 0,
      oy: 0,
      wasFree: false,
      camFrom: new THREE.Vector3(),
      lookFrom: new THREE.Vector3(),
      landFrom: new THREE.Vector3(),
      landYaw: 0,
      landFar: 0,
      landK: 0,
      fov: 36,
      look: new THREE.Vector3(),
      nose: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
      tmp2: new THREE.Vector3(),
      want: new THREE.Vector3(),
      boost: 0,
      snap: false,
    }),
    [],
  );
  const rest = useMemo(() => new THREE.Vector3(spot.pos[0], DESK.top + 0.013, spot.pos[2]), [spot]);

  const chase = (dt: number, cam: THREE.PerspectiveCamera) => {
    const back = st.tmp.set(Math.sin(st.yaw), 0, Math.cos(st.yaw)); // opposite of the nose
    const want = st.tmp2.copy(st.pos).addScaledVector(back, 1.55);
    want.y += 0.46 + Math.sin(st.t * 1.7) * 0.03;
    want.y = Math.max(want.y, 0.55);
    cam.position.lerp(want, st.snap ? 1 : 1 - Math.exp(-dt * 4.5));
    st.want.copy(st.pos).addScaledVector(st.nose, 2.2);
    st.look.lerp(st.want, st.snap ? 1 : 1 - Math.exp(-dt * 7));
    st.snap = false;
    cam.up.set(Math.sin(st.roll) * 0.28, 1, 0).normalize();
    cam.lookAt(st.look);
    const fovT = 46 + Math.min(1, st.speed / 16) * 16 + st.boost * 5;
    st.fov += (fovT - st.fov) * (1 - Math.exp(-dt * 3));
    cam.fov = st.fov;
    cam.updateProjectionMatrix();
  };

  const updateNose = () => st.nose.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));

  // the rail: straight down the road, then round the island
  const S1 = rest.z - ROUTE.endZ;
  const railPoint = (s: number, out: THREE.Vector3) => {
    if (s < S1) {
      const z = rest.z - s;
      const k = clamp01(s / 26);
      const e = k * k * (3 - 2 * k);
      return out.set(rest.x + (roadX(z) - rest.x) * e, rest.y + (roadY(z) - rest.y) * e, z);
    }
    const phi = (s - S1) / ROUTE.orbitR;
    return out.set(ROUTE.islandX - ROUTE.orbitR * Math.cos(phi), roadY(ROUTE.endZ), ROUTE.islandZ - ROUTE.orbitR * Math.sin(phi));
  };

  const windBoost = () => {
    let near = 16;
    for (const pts of samples) {
      if (Math.abs(pts[0].z - st.pos.z) > 60) continue;
      for (const p of pts) near = Math.min(near, p.distanceToSquared(st.pos));
    }
    return clamp01(1 - Math.sqrt(near) / 2.2);
  };

  const flyRail = (dt: number, input: FlightInput, launching: boolean) => {
    if (st.wasFree) {
      // pick the rail back up from wherever free flight left us
      st.s = THREE.MathUtils.clamp(rest.z - st.pos.z, 0, S1 - 1);
      railPoint(st.s, st.tmp);
      st.ox = st.pos.x - st.tmp.x;
      st.oy = st.pos.y - st.tmp.y;
      st.wasFree = false;
    }
    const cruise = CRUISE + st.boost * 3.5;
    st.speed = damp(st.speed, launching ? 7 : cruise, launching ? 1.2 : 1.6, dt);
    st.s += st.speed * dt;
    const orbit = st.s >= S1;
    railPoint(st.s, st.tmp);
    railPoint(st.s + 2, st.tmp2);
    const fx = st.tmp2.x - st.tmp.x;
    const fz = st.tmp2.z - st.tmp.z;
    const fl = Math.hypot(fx, fz) || 1;
    // lean off the line: right is +x when heading down the road
    const reach = clamp01((st.s - 10) / 30);
    st.ox = damp(st.ox, input.sx * 15 * reach, input.sx ? 2.4 : 1.3, dt);
    st.oy = damp(st.oy, input.sy * 5.5 * reach, input.sy ? 2.4 : 1.3, dt);
    st.want.set(st.tmp.x + (-fz / fl) * st.ox, Math.max(1.1 * reach + st.tmp.y * (1 - reach), st.tmp.y + st.oy), st.tmp.z + (fx / fl) * st.ox);
    st.prev.copy(st.pos);
    st.pos.lerp(st.want, 1 - Math.exp(-dt * (launching ? 9 : 5)));
    st.vel.subVectors(st.pos, st.prev).divideScalar(Math.max(dt, 1e-3));
    const hv = Math.hypot(st.vel.x, st.vel.z);
    if (hv > 0.5) {
      let dy = Math.atan2(-st.vel.x, -st.vel.z) - st.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yaw += dy * (1 - Math.exp(-dt * 6));
      st.pitch = damp(st.pitch, Math.atan2(st.vel.y, hv) * 1.15, 5, dt);
      // bank into the lean, and into the long turn round the island
      const lateral = (st.vel.x * (-fz / fl) + st.vel.z * (fx / fl)) * 0.085;
      st.roll = damp(st.roll, THREE.MathUtils.clamp(lateral + (orbit ? 0.32 : 0), -0.7, 0.7), 4, dt);
    }
  };

  const flyFree = (dt: number, input: FlightInput) => {
    if (!st.wasFree) st.wasFree = true;
    st.roll += (input.sx * 0.85 - st.roll) * (1 - Math.exp(-dt * 3));
    st.yaw -= st.roll * 1.15 * dt;
    st.pitch += (input.sy * 0.5 - st.pitch) * (1 - Math.exp(-dt * 2.2));
    const acc = -Math.sin(st.pitch) * 7.5 - (st.speed - CRUISE) * 0.45 + st.boost * 7;
    st.speed = THREE.MathUtils.clamp(st.speed + acc * dt, 4, 19);
    // the edges of the world lean you back toward the road
    const lat = st.pos.x - roadX(st.pos.z);
    const over = Math.max(clamp01((Math.abs(lat) - ROUTE.corridor * 0.6) / (ROUTE.corridor * 0.4)), clamp01((st.pos.z - 20) / 30), clamp01((ROUTE.islandZ - 170 - st.pos.z) / 60));
    if (over > 0) {
      const tz = st.pos.z > 0 ? st.pos.z - 60 : st.pos.z < ROUTE.islandZ - 150 ? st.pos.z + 80 : st.pos.z - 40;
      let dy = Math.atan2(-(roadX(tz) - st.pos.x), -(tz - st.pos.z)) - st.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yaw += dy * Math.min(1, over * 2.2 * dt);
      st.roll += (Math.sign(-dy) * 0.55 * over - st.roll) * dt * 2;
    }
    if (st.pos.y < 1.3) st.pitch += (0.35 - st.pitch) * dt * 4;
    if (st.pos.y > 46) st.pitch += (-0.3 - st.pitch) * dt * 2;
    updateNose();
    st.pos.addScaledVector(st.nose, st.speed * dt);
    st.pos.y = Math.max(st.pos.y + (st.boost * 0.8 - 0.2 * (1 - st.speed / 14)) * dt, 0.7);
  };

  freeRef.current = free;
  apiRef.current = {
    pos: st.pos,
    launch: (cam) => {
      st.pos.copy(rest);
      st.prev.copy(rest);
      st.yaw = spot.rot;
      st.pitch = 0.3;
      st.roll = 0;
      st.speed = 2.4;
      st.t = 0;
      st.s = 0;
      st.ox = st.oy = 0;
      st.wasFree = false;
      st.landK = 0;
      st.fov = cam.fov;
      st.camFrom.copy(cam.position);
      st.look.copy(rest);
      updateNose();
    },
    fly: (dt, input, cam) => {
      st.t += dt;
      const launching = st.t < 1.6;
      st.boost = damp(st.boost, launching ? 0 : windBoost(), 3, dt);
      if (freeRef.current && !launching) flyFree(dt, input);
      else flyRail(dt, launching ? { sx: 0, sy: 0 } : input, launching);
      updateNose();
      // camera: blend from the orbit view into the chase cam during launch
      const k = easeInOutCubic(clamp01(st.t / 1.5));
      if (k < 1) {
        chase(dt, cam);
        cam.position.lerpVectors(st.camFrom, cam.position, k);
      } else chase(dt, cam);
      streak.uniforms.uOpacity.value += (1 - streak.uniforms.uOpacity.value) * dt * 1.5;
    },
    beginLand: (cam) => {
      st.t = 0;
      st.landFrom.copy(st.pos);
      st.landYaw = st.yaw;
      st.landFar = clamp01((st.pos.distanceTo(rest) - 30) / 60);
      st.camFrom.copy(cam.position);
      st.lookFrom.copy(st.look);
    },
    land: (dt, cam, home) => {
      st.t += dt;
      // from far out it comes home through a bank of cloud; close by it simply arcs back
      const dur = 2.2 + st.landFar * 1.4;
      const k = easeInOutCubic(clamp01(st.t / dur));
      st.landK = k;
      st.pos.lerpVectors(st.landFrom, rest, k);
      st.pos.y += Math.sin(Math.PI * k) * (1.2 + st.landFar * 6) * (1 - k * 0.3);
      let dy = spot.rot - st.landYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yaw = st.landYaw + dy * k;
      st.pitch = (1 - k) * -0.15;
      st.roll *= 1 - Math.min(1, dt * 3);
      updateNose();
      cam.position.lerpVectors(st.camFrom, home.pos, k);
      cam.position.y += Math.sin(Math.PI * k) * st.landFar * 8;
      st.look.lerpVectors(st.lookFrom, home.look, k);
      cam.up.set(0, 1, 0);
      cam.lookAt(st.look);
      st.fov += (36 - st.fov) * Math.min(1, dt * 3);
      cam.fov = st.fov;
      streak.uniforms.uOpacity.value *= 1 - Math.min(1, dt * 2);
      if (k >= 1) st.landK = 0;
      return k >= 1;
    },
    warp: (z) => {
      st.s = rest.z - z;
      st.t = Math.max(st.t, 3);
      st.ox = st.oy = 0;
      st.speed = CRUISE;
      railPoint(st.s, st.pos);
      st.prev.copy(st.pos);
      railPoint(st.s + 2, st.tmp);
      st.yaw = Math.atan2(-(st.tmp.x - st.pos.x), -(st.tmp.z - st.pos.z));
      st.pitch = 0;
      updateNose();
      st.snap = true;
    },
    speed: () => st.speed,
    boost: () => st.boost,
    landMist: () => Math.sin(Math.PI * st.landK) * st.landFar,
  };

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (!flying) {
      // load-in: glides in from the left, flares, and skids to a stop
      const at = introAt?.current ?? null;
      const t = instant ? 99 : at === null ? 0 : nowS() - at - introDelay;
      g.visible = at === null || instant || t > 0;
      if (!instant && at !== null && t < 1.7) {
        const k = 1 - Math.pow(1 - clamp01(t / 1.7), 2.4);
        const p0 = st.tmp.set(rest.x - 2.4, rest.y + 1.3, rest.z + 1.6);
        const p1 = st.tmp2.set(rest.x - 0.7, rest.y + 0.18, rest.z + 0.5);
        const q = (a: number, b: number, c: number) => (1 - k) * (1 - k) * a + 2 * (1 - k) * k * b + k * k * c;
        g.position.set(q(p0.x, p1.x, rest.x), q(p0.y, p1.y, rest.y), q(p0.z, p1.z, rest.z));
        const dx = 2 * (1 - k) * (p1.x - p0.x) + 2 * k * (rest.x - p1.x);
        const dy = 2 * (1 - k) * (p1.y - p0.y) + 2 * k * (rest.y - p1.y);
        const dz = 2 * (1 - k) * (p1.z - p0.z) + 2 * k * (rest.z - p1.z);
        const yaw = Math.atan2(-dx, -dz);
        let dyaw = spot.rot - yaw;
        dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
        g.rotation.set(0, 0, 0, "YXZ");
        g.rotation.y = yaw + dyaw * k * k;
        g.rotation.x = Math.atan2(dy, Math.hypot(dx, dz)) * (1 - k) + k * (1 - k) * 0.5;
        g.rotation.z = Math.sin(k * Math.PI) * 0.35;
        return;
      }
      g.rotation.order = "XYZ";
      g.position.copy(rest);
      g.position.y += 0.017 + (hover.current && hoverable ? 0.008 : 0);
      g.rotation.set(0, spot.rot, 0);
      if (streak.uniforms.uOpacity.value > 0.001) streak.uniforms.uOpacity.value *= 0.95;
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
      {flying &&
        tubes.map((t, i) => (
          <mesh key={i} geometry={t} material={streak} frustumCulled={false} renderOrder={5} />
        ))}
    </>
  );
}
