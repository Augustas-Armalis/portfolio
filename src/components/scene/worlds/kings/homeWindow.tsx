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
// Bounded like the gates' windows: only within 330 m of the dome, at a quarter of the frame each way, of a reduced home
// (no grass blades, none of the far country, no small far things, no new shadows), every fourth frame
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
// how much of the dome the window covers now (0..1): wholly covered, the modelled homestead under it need not be drawn
export const homeWindowK = () => U.uHomeK.value;
const SP = new THREE.Vector3();

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
      spare: [] as THREE.Object3D[],
      thin: [] as [THREE.InstancedBufferGeometry, number][],
      sparse: [] as [THREE.InstancedMesh, number][],
      land: [] as THREE.Mesh[],
      spareAt: -1,
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
    const able = !mobile && postCtl.level >= 1 && !!target && voyage.cur === "kings" && voyage.flying && voyage.phase === "open" && !voyage.homing && !!stand && portalRig.home.size > 0 && d < 250;
    const want = able ? 1 - THREE.MathUtils.smoothstep(d, 175, 245) : 0;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __homeWin: { able, d, k: rig.k, fresh: rig.fresh, level: postCtl.level, target: !!target, stand: !!stand, home: portalRig.home.size, phase: voyage.phase, flying: voyage.flying, cur: voyage.cur, U, portalRig, scene, gl, spare: rig.spare, thin: rig.thin } });
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
    const w = Math.max(8, Math.round(target!.width * 0.25));
    const h = Math.max(8, Math.round(target!.height * 0.25));
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
    // A reduced home: seen small through the glass from tens of metres up, it needs no blades of grass, nothing of the
    // opening flight's far country (the town, the old forest, the cave), and none of its small far things. Which those
    // are is worked out from the field itself now and then (it changes as home's own detail comes and goes).
    if (rig.spareAt < 0 || ++rig.spareAt > 240) {
      rig.spareAt = 0;
      rig.spare.length = 0;
      rig.thin.length = 0;
      rig.sparse.length = 0;
      rig.land.length = 0;
      portalRig.home.forEach((grp) =>
        grp.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!(m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) || !m.geometry) return;
          const u = (m.material as THREE.ShaderMaterial).uniforms as Record<string, unknown> | undefined;
          // (the land's levels, finest to coarsest: see below)
          if (u && u.uCell && u.uHole && u.uCenter) {
            rig.land.push(m);
            return;
          }
          const im = o as THREE.InstancedMesh;
          if (im.isInstancedMesh && !im.boundingSphere) im.computeBoundingSphere();
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const bs = (im.isInstancedMesh ? im.boundingSphere : null) ?? m.geometry.boundingSphere!;
          const c = SP.copy(bs.center).applyMatrix4(o.matrixWorld);
          const far = Math.hypot(c.x, c.z);
          const g = m.geometry;
          const ig = g as THREE.InstancedBufferGeometry;
          const many = im.isInstancedMesh ? im.count : ig.isInstancedBufferGeometry && Number.isFinite(ig.instanceCount) ? ig.instanceCount : 1;
          const tris = ((g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3) * many;
          // (blades of every kind are drawn in rings that follow the eye, and carry this bound to say they have none)
          const grass = !!(u && u.uTile && u.uInner) || (!im.isInstancedMesh && bs.radius === 100000 && tris > 20000);
          // (and the clouds, which carry the greater one: a third of them is sky enough for a picture this small)
          if (ig.isInstancedBufferGeometry && bs.radius === 1000000 && many > 4) rig.thin.push([ig, many]);
          // (the window is small and its middle is the desk: what is more than a couple of hundred metres off is haze in it)
          // (and of the mountains only the nearest range: the others are a line of haze at this size)
          const away = (bs.radius < 1500 && far - bs.radius > 220) || (bs.radius < 600 && far > 260) || (bs.radius < 100000 && far > 1000) || (bs.radius > 1500 && bs.radius < 100000);
          const small = (tris < 1500 && far > 80) || (tris < 6000 && far > 160);
          const mote = !m.isMesh && far > 150;
          // (things strewn by the thousand, a few triangles each: flowers, tufts)
          const strewn = !im.isInstancedMesh && ig.isInstancedBufferGeometry && many > 1000 && tris / many < 24 && bs.radius < 100000;
          if (grass || away || small || mote || strewn) rig.spare.push(o);
          // (and of every stand of trees, far or near, every other one: at this size it makes the same wood)
          else if (im.isInstancedMesh && im.count > 6) rig.sparse.push([im, far > 110 ? 4 : 3]);
        }),
      );
      // and of what stands on the desk only the large things: the rest are specks from here
      const walk = (o: THREE.Object3D) => {
        if (portalRig.home.has(o) || o === stand) return;
        const m = o as THREE.Mesh;
        if ((m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) && m.geometry) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const bs = m.geometry.boundingSphere!;
          const c = SP.copy(bs.center).applyMatrix4(o.matrixWorld);
          if (Math.hypot(c.x, c.z) < 60 && bs.radius * o.matrixWorld.getMaxScaleOnAxis() < 0.45) rig.spare.push(o);
        }
        for (const ch of o.children) walk(ch);
      };
      walk(scene);
    }
    const spareWas = rig.spare.map((o) => o.visible);
    for (const o of rig.spare) o.visible = false;
    // (the counts as they are this frame: home may change them itself)
    const thinWas = rig.thin.map(([g]) => g.instanceCount);
    const sparseWas = rig.sparse.map(([m]) => m.count);
    rig.thin.forEach(([g], i) => (g.instanceCount = Math.ceil(thinWas[i] / 10)));
    // The land is drawn in square levels round the eye (home/Terrain.tsx), and the eye they are round is this wood's,
    // kilometres off: for the window they are set round the window's own eye, so the field under the desk is the fine
    // land and not the coarsest. In a picture a quarter the size the two finest levels are below a pixel: the third is
    // drawn whole in their place, and the three coarsest (past three kilometres, haze from here) not at all.
    const landWas = rig.land.map((m) => {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      return { m, vis: m.visible, geo: m.geometry, hole: u.uHole.value as number, c: (u.uCenter.value as THREE.Vector2).clone() };
    });
    const eyeU = (rig.land[0]?.material as THREE.ShaderMaterial | undefined)?.uniforms.uEye;
    const eyeWas = eyeU ? (eyeU.value as THREE.Vector2).clone() : null;
    if (rig.land.length > 4) {
      const cells = rig.land.map((m) => (m.material as THREE.ShaderMaterial).uniforms.uCell.value as number);
      const sorted = [...cells].sort((a, b) => a - b);
      const full = rig.land[cells.indexOf(sorted[0])].geometry;
      const first = sorted[2];
      const last = sorted[sorted.length - 4];
      rig.land.forEach((m, i) => {
        const u = (m.material as THREE.ShaderMaterial).uniforms;
        const cell = cells[i];
        if (cell < first || cell > last) {
          m.visible = false;
          return;
        }
        if (cell === first) {
          m.geometry = full;
          u.uHole.value = 0;
        }
        const s2 = cell * 2;
        (u.uCenter.value as THREE.Vector2).set(Math.round(pc.position.x / s2) * s2, Math.round(pc.position.z / s2) * s2);
      });
      eyeU?.value.set(pc.position.x, pc.position.z);
    }
    rig.sparse.forEach(([m, k], i) => (m.count = Math.ceil(sparseWas[i] / k)));
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
    // no shadows through the glass: the room asks for the shadow map by hand each frame, and that asking has to be
    // kept for the real draw, or home's shadows are drawn here and this wood goes a frame without its own
    const shadows = gl.shadowMap.autoUpdate;
    const shadowDue = gl.shadowMap.needsUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = false;
    try {
      gl.setRenderTarget(rig.rt);
      gl.clear();
      const t0 = gl.info.autoReset ? 0 : gl.info.render.triangles;
      gl.render(scene, pc);
      // (development: what the window costs, for the world's budget)
      if (process.env.NODE_ENV !== "production") (window as unknown as { __homeWinTris: number }).__homeWinTris = gl.info.render.triangles - t0;
      rig.fresh = true;
    } catch {
      rig.fresh = false;
    }
    gl.setRenderTarget(prev);
    gl.shadowMap.autoUpdate = shadows;
    gl.shadowMap.needsUpdate = shadowDue;
    POST_U.uLinearOut.value = lin;
    PORTAL_U.uPortalK.value = k0;
    setWorldAir(WORLDS.kings.fog);
    if (skyWas) applySky(skyWas);
    if (rig.veil) rig.veil.visible = veilWas;
    stand!.visible = standWas;
    rig.spare.forEach((o, i) => (o.visible = spareWas[i]));
    rig.thin.forEach(([g], i) => (g.instanceCount = thinWas[i]));
    rig.sparse.forEach(([m], i) => (m.count = sparseWas[i]));
    for (const w of landWas) {
      const u = (w.m.material as THREE.ShaderMaterial).uniforms;
      w.m.visible = w.vis;
      w.m.geometry = w.geo;
      u.uHole.value = w.hole;
      (u.uCenter.value as THREE.Vector2).copy(w.c);
    }
    if (eyeU && eyeWas) (eyeU.value as THREE.Vector2).copy(eyeWas);
    homeWas.forEach(([o, v]) => (o.visible = v));
    U.tHome.value = rig.rt.texture;
    U.uHomeRes.value.set(target!.width, target!.height);
    U.uHomeGain.value = (golden.exposure / Math.max(skyWas?.exposure ?? 1.3, 0.05)) * 1.25;
    U.uHomeK.value = rig.fresh ? rig.k : 0;
  }, 0.5);
  return <mesh geometry={b.geo} material={b.mat} position={[0, BY, KINGS.z]} renderOrder={4.5} frustumCulled={false} />;
}
