"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { DESK, clamp01, easeInOutCubic, nowS } from "./shared";
import { SKY_U } from "./sky";

// A folded paper plane that lives on the desk. Click it and it takes off; the
// visitor steers it around the field. Simple glide model (no physics engine):
// bank to turn, pitch trades height for speed, soft wind currents boost you,
// and invisible walls turn you back before the world ends.

export type FlightInput = { sx: number; sy: number };
export type PlaneApi = {
  launch: (cam: THREE.PerspectiveCamera) => void;
  fly: (dt: number, input: FlightInput, cam: THREE.PerspectiveCamera) => void;
  beginLand: (cam: THREE.PerspectiveCamera) => void;
  land: (dt: number, cam: THREE.PerspectiveCamera, home: { pos: THREE.Vector3; look: THREE.Vector3 }) => boolean;
  speed: () => number;
};

const BOUND = 42;

// A classic dart, folded: a centre keel, wings with a dihedral and a fold line
// halfway out, a tapered nose. Flat-shaded so each fold catches the light.
function planeGeometry() {
  const N = [0, 0.006, -0.112];
  const T = [0, 0.008, 0.094];
  const Kl = [-0.0025, -0.03, 0.088];
  const Kr = [0.0025, -0.03, 0.088];
  const L1 = [-0.024, 0.012, 0.096];
  const Lt = [-0.064, 0.026, 0.09];
  const R1 = [0.024, 0.012, 0.096];
  const Rt = [0.064, 0.026, 0.09];
  const tris = [N, T, L1, N, L1, Lt, N, R1, T, N, Rt, R1, N, Kl, T, N, T, Kr];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}

// Wind currents: closed loops through the air, drawn as soft moving streaks.
function makeCurrents() {
  const loops: [number, number, number][][] = [
    [[-9, 2.6, -6], [-3, 3.4, -11], [5, 3.0, -10], [10, 2.4, -5], [6, 2.2, 1], [-1, 2.8, 3], [-8, 3.2, 0]],
    [[-20, 5.5, 2], [-15, 7, -6], [-6, 6.2, -2], [-9, 5, 8], [-17, 4.6, 10]],
    [[15, 2.2, 10], [8, 4, -6], [0, 5, -20], [-14, 6, -16], [-20, 4.5, -2], [-6, 3, 12], [6, 2.5, 16]],
    [[-4, 10, -24], [8, 11, -18], [14, 9.5, -8], [4, 8.5, -4], [-8, 9, -10]],
  ];
  return loops.map((pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), true, "centripetal"));
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
  onPick: () => void;
  hoverable: boolean;
}) {
  const geo = useMemo(planeGeometry, []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f3f1ea", roughness: 0.92, side: THREE.DoubleSide, flatShading: true }), []);
  const group = useRef<THREE.Group>(null);
  const curves = useMemo(makeCurrents, []);
  const samples = useMemo(() => curves.map((c) => c.getSpacedPoints(220)), [curves]);
  const tubes = useMemo(() => curves.map((c) => new THREE.TubeGeometry(c, 320, 0.035, 5, true)), [curves]);
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
            float s = fract(vUv.x * 18.0 - uTime * 0.22);
            float a = smoothstep(0.0, 0.7, s) * (1.0 - smoothstep(0.7, 1.0, s));
            a *= 0.5 + 0.5 * sin(vUv.x * 70.0 + uTime * 0.6);
            float d = length(vWorld - cameraPosition);
            a *= smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(25.0, 45.0, d));
            vec3 c = mix(vec3(1.0, 0.97, 0.9), vec3(0.7, 0.8, 1.0), uNight);
            gl_FragColor = vec4(c * a * uOpacity * 0.55, 1.0);
          }`,
      }),
    [],
  );
  const hover = useRef(false);

  const st = useMemo(
    () => ({
      pos: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      speed: 0,
      t: 0,
      camFrom: new THREE.Vector3(),
      lookFrom: new THREE.Vector3(),
      landFrom: new THREE.Vector3(),
      landYaw: 0,
      fov: 36,
      look: new THREE.Vector3(),
      nose: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
      tmp2: new THREE.Vector3(),
      boost: 0,
    }),
    [],
  );
  const rest = useMemo(() => new THREE.Vector3(spot.pos[0], DESK.top + 0.013, spot.pos[2]), [spot]);

  const chase = (dt: number, cam: THREE.PerspectiveCamera, k: number) => {
    const back = st.tmp.set(Math.sin(st.yaw), 0, Math.cos(st.yaw)); // opposite of the nose
    const want = st.tmp2.copy(st.pos).addScaledVector(back, 1.5).add(new THREE.Vector3(0, 0.5, 0));
    want.y = Math.max(want.y, 0.55);
    const a = 1 - Math.exp(-dt * 4.5);
    cam.position.lerp(want, k < 1 ? a + (1 - a) * 0 : a);
    st.look.lerp(st.pos.clone().addScaledVector(st.nose, 1.6), 1 - Math.exp(-dt * 8));
    cam.up.set(Math.sin(st.roll) * 0.25, 1, 0).normalize();
    cam.lookAt(st.look);
    const fovT = 38 + Math.min(1, st.speed / 14) * 22 + st.boost * 6;
    st.fov += (fovT - st.fov) * (1 - Math.exp(-dt * 3));
    cam.fov = st.fov;
    cam.updateProjectionMatrix();
  };

  const updateNose = () => st.nose.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));

  apiRef.current = {
    launch: (cam) => {
      st.pos.copy(rest);
      st.yaw = spot.rot;
      st.pitch = 0.5;
      st.roll = 0;
      st.speed = 2.2;
      st.t = 0;
      st.fov = cam.fov;
      st.camFrom.copy(cam.position);
      st.look.copy(rest);
      updateNose();
    },
    fly: (dt, input, cam) => {
      st.t += dt;
      const launching = st.t < 1.1;
      const sx = launching ? 0 : input.sx;
      const sy = launching ? 0.6 : input.sy;
      const a1 = 1 - Math.exp(-dt * 3);
      st.roll += (sx * 0.85 - st.roll) * a1;
      st.yaw -= st.roll * 1.15 * dt;
      st.pitch += (sy * 0.5 - st.pitch) * (1 - Math.exp(-dt * 2.2));
      // wind currents
      let near = 9;
      for (const pts of samples) for (const p of pts) near = Math.min(near, p.distanceToSquared(st.pos));
      near = Math.sqrt(near);
      st.boost = clamp01(1 - near / 1.7);
      let acc = -Math.sin(st.pitch) * 7.5 - (st.speed - 6.5) * 0.45 + st.boost * 7;
      if (launching) acc += 9;
      st.speed = THREE.MathUtils.clamp(st.speed + acc * dt, 2.6, 16);
      // keep inside the world
      const r = Math.hypot(st.pos.x, st.pos.z);
      if (r > BOUND * 0.75) {
        const yc = Math.atan2(st.pos.x, st.pos.z);
        let dy = yc - st.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        st.yaw += dy * Math.min(1, ((r - BOUND * 0.75) / (BOUND * 0.25)) * 2.5 * dt);
        st.roll += (Math.sign(-dy) * 0.6 - st.roll) * dt * 2;
      }
      if (st.pos.y < 1.0) st.pitch += (0.35 - st.pitch) * dt * 4;
      if (st.pos.y > 26) st.pitch += (-0.3 - st.pitch) * dt * 2;
      updateNose();
      st.pos.addScaledVector(st.nose, st.speed * dt);
      st.pos.y += (st.boost * 0.8 - 0.22 * (1 - st.speed / 12)) * dt;
      st.pos.y = Math.max(st.pos.y, 0.55);
      const rr = Math.hypot(st.pos.x, st.pos.z);
      if (rr > BOUND) st.pos.multiplyScalar(BOUND / rr).setY(st.pos.y);
      // camera: blend from the orbit view into the chase cam during launch
      const k = easeInOutCubic(clamp01(st.t / 1.3));
      if (k < 1) {
        const prev = cam.position.clone();
        chase(dt, cam, 1);
        cam.position.lerpVectors(st.camFrom, cam.position, k);
        if (k < 0.02) cam.position.copy(prev);
      } else chase(dt, cam, 1);
      streak.uniforms.uOpacity.value += (1 - streak.uniforms.uOpacity.value) * dt * 1.5;
    },
    beginLand: (cam) => {
      st.t = 0;
      st.landFrom.copy(st.pos);
      st.landYaw = st.yaw;
      st.camFrom.copy(cam.position);
      st.lookFrom.copy(st.look);
    },
    land: (dt, cam, home) => {
      st.t += dt;
      const k = easeInOutCubic(clamp01(st.t / 2.2));
      // arc home: up and over, settling onto the desk
      st.pos.lerpVectors(st.landFrom, rest, k);
      st.pos.y += Math.sin(Math.PI * k) * 1.2 * (1 - k * 0.3);
      let dy = spot.rot - st.landYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yaw = st.landYaw + dy * k;
      st.pitch = (1 - k) * -0.15;
      st.roll *= 1 - Math.min(1, dt * 3);
      updateNose();
      cam.position.lerpVectors(st.camFrom, home.pos, k);
      st.look.lerpVectors(st.lookFrom, home.look, k);
      cam.up.set(0, 1, 0);
      cam.lookAt(st.look);
      st.fov += (36 - st.fov) * Math.min(1, dt * 3);
      streak.uniforms.uOpacity.value *= 1 - Math.min(1, dt * 2);
      return k >= 1;
    },
    speed: () => st.speed,
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
      g.position.y += hover.current && hoverable ? 0.01 : 0;
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
        <mesh geometry={geo} material={mat} castShadow receiveShadow scale={1} />
        {/* generous invisible hit area: the plane is small */}
        <mesh visible={false}>
          <boxGeometry args={[0.16, 0.06, 0.24]} />
        </mesh>
      </group>
      {tubes.map((t, i) => (
        <mesh key={i} geometry={t} material={streak} frustumCulled={false} renderOrder={5} />
      ))}
    </>
  );
}
