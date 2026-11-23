"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { POST_U, postCtl } from "../../Post";
import { GOLDEN_HOUR, applySky, skyState, type SkyState } from "../../sky";
import { setWorldAir } from "../kit";
import { PORTAL_U, portalRig } from "../portal";
import { KINGS, ORIGIN, WORLDS, voyage } from "../voyage";
import { BY, R } from "./light";

// The little world the kings hold is a window. Inside the glass, when the plane is near enough, is the desk's own
// field itself, live, at golden hour: drawn the way a gate's window draws the world beyond it (portal.tsx), from
// an eye that stands over the desk as the visitor's eye stands to the dome, so what is in it slides as the
// plane moves and is what the plane then flies into. No gate and no next world are needed for it, so it is its
// own small thing here.
//
// Bounded like the gates' windows: only within 420 m of the dome, at 0.4 of the frame each way, every fourth frame
// until the last hundred and twenty metres and every second from there. Never on a phone or on Low (there, and wherever anything is missing, the dome keeps
// its modelled homestead, which stands under this window always and is simply covered by it).

const U = { tHome: { value: null as THREE.Texture | null }, uHomeK: { value: 0 }, uHomeRes: { value: new THREE.Vector2(1, 1) }, uHomeGain: { value: 1 } };
// the heart of the dome, in the scene's own coordinates: it stands for the desk
const HEART = new THREE.Vector3(ORIGIN.x, ORIGIN.y + BY + R * 0.3, ORIGIN.z + KINGS.z);
// ...but seen from a little above it and tipped toward it. The plane comes to the kings from low in the wood, looking
// up at their hands: were the dome's floor the field itself, that eye would be under the field's ground and see
// nothing, and an eye merely lifted would see only sky. So the heart of the dome is set this far over the desk and
// the whole of that country is tipped this much toward the way in: from the wood the glass holds the evening field
// with its hills along the middle, and at the hands the field lies close below, the desk in the middle of it.
const HOME_UP = 12;
const HOME_TIP = -0.245;
let golden: SkyState | null = null;

export function HomeWindow({ mobile }: { mobile: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const rig = useMemo(
    () => ({
      rt: new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, depthBuffer: true }),
      cam: new THREE.PerspectiveCamera(),
      m: new THREE.Matrix4().makeTranslation(0, HOME_UP, 0).multiply(new THREE.Matrix4().makeRotationX(HOME_TIP)).multiply(new THREE.Matrix4().makeTranslation(-HEART.x, -HEART.y, -HEART.z)),
      scale: new THREE.Vector3(),
      k: 0,
      tick: 0,
      fresh: false,
      veil: null as THREE.Object3D | null,
    }),
    [],
  );
  const b = useMemo(
    () => ({
      geo: new THREE.SphereGeometry(R * 0.992, 56, 22, 0, Math.PI * 2, 0, Math.PI / 2),
      mat: new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: U,
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tHome; uniform float uHomeK; uniform vec2 uHomeRes; uniform float uHomeGain;
          varying vec3 vN; varying vec3 vW;
          void main(){
            if (uHomeK <= 0.003) discard;
            // soft into the glass at its limb, where the red-gold line of it is
            float f = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
            float a = smoothstep(0.02, 0.3, f) * uHomeK;
            // that country's own light, as it will be seen from inside it
            // (it is the one light of this wood: a little of its own glow lies over the picture, most toward the rim)
            vec3 col = texture2D(tHome, gl_FragCoord.xy / uHomeRes).rgb * uHomeGain + vec3(0.5, 0.32, 0.16) * (0.06 + 0.8 * (1.0 - f) * (1.0 - f));
            gl_FragColor = vec4(col, a);
          }`,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      rig.rt.dispose();
      b.geo.dispose();
      b.mat.dispose();
      U.tHome.value = null;
      U.uHomeK.value = 0;
    },
    [rig, b],
  );
  // (after the frame's own movement, before the lens draws it: Post's draw is at priority 1)
  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const target = postCtl.sceneTarget;
    const stand = portalRig.stand;
    const d = HEART.distanceTo(voyage.planePos);
    const able = !mobile && postCtl.level >= 1 && !!target && voyage.cur === "kings" && voyage.flying && voyage.phase === "open" && !voyage.homing && !!stand && portalRig.home.size > 0 && d < 420;
    const want = able ? 1 - THREE.MathUtils.smoothstep(d, 300, 400) : 0;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __homeWin: { able, d, k: rig.k, fresh: rig.fresh, level: postCtl.level, target: !!target, stand: !!stand, home: portalRig.home.size, phase: voyage.phase, flying: voyage.flying, cur: voyage.cur, U } });
    rig.k += (want - rig.k) * (1 - Math.exp(-dt * 3));
    if (!able) {
      if (rig.k < 0.01) {
        rig.k = 0;
        rig.fresh = false;
      }
      U.uHomeK.value = rig.fresh ? rig.k : 0;
      return;
    }
    // (home is a whole world to draw: every fourth frame from far off, every second over the last hundred and twenty metres)
    if (rig.fresh && ++rig.tick % (d > 120 ? 4 : 2) !== 0) {
      U.uHomeK.value = rig.k;
      return;
    }
    const cam = st.camera as THREE.PerspectiveCamera;
    const w = Math.max(8, Math.round(target!.width * 0.4));
    const h = Math.max(8, Math.round(target!.height * 0.4));
    if (rig.rt.width !== w || rig.rt.height !== h) rig.rt.setSize(w, h);
    // the same eye, carried from the dome's floor to the desk's ground
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
    pc.matrixAutoUpdate = false;
    pc.matrix.copy(pc.matrixWorld);
    pc.matrixWorldInverse.copy(pc.matrixWorld).invert();
    // home shown and this wood not, under home's own evening sky and air, for the length of one draw
    // (and without the light that is closing over the lens: that belongs to this side of the glass)
    if (!rig.veil)
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m && m.uniforms && m.uniforms.uVeil) rig.veil = o;
      });
    const homeWas: [THREE.Object3D, boolean][] = [];
    portalRig.home.forEach((o) => homeWas.push([o, o.visible]));
    portalRig.home.forEach((o) => (o.visible = true));
    const standWas = stand!.visible;
    stand!.visible = false;
    const veilWas = rig.veil?.visible ?? false;
    if (rig.veil) rig.veil.visible = false;
    const skyWas = voyage.lastSky;
    golden ??= skyState(GOLDEN_HOUR);
    applySky(golden);
    setWorldAir(WORLDS.home.fog);
    const k0 = PORTAL_U.uPortalK.value;
    PORTAL_U.uPortalK.value = 0;
    const lin = POST_U.uLinearOut.value;
    POST_U.uLinearOut.value = 1;
    const prev = gl.getRenderTarget();
    const shadows = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    try {
      gl.setRenderTarget(rig.rt);
      gl.clear();
      gl.render(scene, pc);
      rig.fresh = true;
    } catch {
      rig.fresh = false;
    }
    gl.setRenderTarget(prev);
    gl.shadowMap.autoUpdate = shadows;
    POST_U.uLinearOut.value = lin;
    PORTAL_U.uPortalK.value = k0;
    setWorldAir(WORLDS.kings.fog);
    if (skyWas) applySky(skyWas);
    if (rig.veil) rig.veil.visible = veilWas;
    stand!.visible = standWas;
    homeWas.forEach(([o, v]) => (o.visible = v));
    U.tHome.value = rig.rt.texture;
    U.uHomeRes.value.set(target!.width, target!.height);
    U.uHomeGain.value = (golden.exposure / Math.max(skyWas?.exposure ?? 1.3, 0.05)) * 1.25;
    U.uHomeK.value = rig.fresh ? rig.k : 0;
  }, 0.5);
  return <mesh geometry={b.geo} material={b.mat} position={[0, BY, KINGS.z]} renderOrder={4.5} frustumCulled={false} />;
}
