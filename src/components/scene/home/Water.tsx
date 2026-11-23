"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { voyage } from "../worlds/voyage";
import { MIRROR_LAYER } from "./Forest";
import { GLSL_HOME_AIR, HLAKE, HOLD, HOME_U, hLakeK, landH, rng } from "./land";
import { REFLECT_U } from "./Terrain";

// The lake's mirror. The sky, the mountains, the woods and the reeds are drawn
// once more from under the water (a camera mirrored in the lake's surface,
// seeing only those things), into a small target; the land's shader finds each
// point of the lake in it and loosens it with the ripples. Drawn only while
// the lake can be seen, and every other frame.
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export function LakeMirror({ quality }: { quality: number }) {
  const { gl, scene, camera } = useThree();
  const rt = useMemo(() => {
    const k = quality >= 1 ? 1 : 0.6;
    const t = new THREE.WebGLRenderTarget(Math.round(1280 * k), Math.round(720 * k), { type: THREE.HalfFloatType, depthBuffer: true });
    t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
    return t;
  }, [quality]);
  const tmp = useMemo(
    () => ({
      cam: new THREE.PerspectiveCamera(),
      clear: new THREE.Color(),
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      up: new THREE.Vector3(),
      rot: new THREE.Matrix4(),
      frustum: new THREE.Frustum(),
      m: new THREE.Matrix4(),
      sphere: new THREE.Sphere(new THREE.Vector3(HLAKE.x, HLAKE.y, HLAKE.z), Math.max(HLAKE.rx, HLAKE.rz) * 1.25),
      lastPos: new THREE.Vector3(1e9, 0, 0),
      lastQuat: new THREE.Quaternion(),
      cq: new THREE.Quaternion(),
    }),
    [],
  );
  const tick = useRef(0);
  const warmed = useRef(0);
  useEffect(() => {
    REFLECT_U.uReflTex.value = rt.texture;
    return () => {
      REFLECT_U.uReflOn.value = 0;
      REFLECT_U.uReflTex.value = null;
      rt.dispose();
    };
  }, [rt]);
  useFrame(() => {
    if (HOLD.on) return;
    const cam = camera as THREE.PerspectiveCamera;
    const T = tmp;
    let see = voyage.cur === "home" && cam.position.y > HLAKE.y + 0.05 && cam.position.distanceTo(T.sphere.center) < 900;
    if (see) {
      T.frustum.setFromProjectionMatrix(T.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      see = T.frustum.intersectsSphere(T.sphere);
    }
    // (drawn for the first frames whatever: its target and state are made behind the loader)
    if (!see && warmed.current++ > 6) {
      REFLECT_U.uReflOn.value = 0;
      return;
    }
    // (a picture is redrawn when the eye has moved or turned; held still, only every third frame, for the drifting clouds)
    cam.getWorldPosition(T.pos);
    cam.getWorldQuaternion(T.cq);
    const moved = T.pos.distanceToSquared(T.lastPos) > 1e-6 || Math.abs(T.cq.dot(T.lastQuat)) < 0.9999995;
    tick.current++;
    if (!moved && tick.current > 12 && tick.current % 3 !== 0) return;
    T.lastPos.copy(T.pos);
    T.lastQuat.copy(T.cq);
    // the eye, mirrored in the water
    cam.getWorldPosition(T.pos);
    T.rot.extractRotation(cam.matrixWorld);
    T.look.set(0, 0, -1).applyMatrix4(T.rot).add(T.pos);
    T.up.set(0, 1, 0).applyMatrix4(T.rot);
    const Y = HLAKE.y;
    const mc = T.cam;
    mc.position.set(T.pos.x, 2 * Y - T.pos.y, T.pos.z);
    mc.up.set(T.up.x, -T.up.y, T.up.z);
    mc.lookAt(T.look.x, 2 * Y - T.look.y, T.look.z);
    mc.projectionMatrix.copy(cam.projectionMatrix);
    mc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    mc.updateMatrixWorld();
    mc.layers.set(MIRROR_LAYER);
    REFLECT_U.uReflMat.value.copy(BIAS).multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
    const prev = gl.getRenderTarget();
    const auto = gl.shadowMap.autoUpdate;
    // (and the shadow map asked for this frame is kept for the real draw: drawn from the mirror's eye it would hold
    // only what stands in the mirror's layer)
    const due = gl.shadowMap.needsUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = false;
    try {
      gl.setRenderTarget(rt);
      // (cleared to nothing: where no tree or mountain stands, the water shows its own sky and clouds)
      gl.getClearColor(T.clear);
      const ca = gl.getClearAlpha();
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.setClearColor(T.clear, ca);
      gl.render(scene, mc);
    } finally {
      gl.shadowMap.autoUpdate = auto;
      gl.shadowMap.needsUpdate = due;
      gl.setRenderTarget(prev);
    }
    REFLECT_U.uReflOn.value = 1;
  });
  return null;
}

// Reeds and sedge standing in the lake's shallows and along its rim, in
// clumps, taller than the grass, a few with dark heads; they bend with the
// same wind and stand in the mirror.
export function Reeds({ mobile }: { mobile: boolean }) {
  const { geo, mat } = useMemo(() => {
    const SEG = 4;
    const g = new THREE.InstancedBufferGeometry();
    const pos: number[] = [];
    for (let i = 0; i < SEG; i++) pos.push(-0.5, i / SEG, 0, 0.5, i / SEG, 0);
    pos.push(0, 1, 0);
    const idx: number[] = [];
    for (let i = 0; i < SEG - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    idx.push((SEG - 1) * 2, (SEG - 1) * 2 + 1, SEG * 2);
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const r = rng(881);
    const want = mobile ? 1600 : 4200;
    const off: number[] = [];
    const shp: number[] = [];
    let guard = 0;
    while (off.length / 4 < want && guard++ < want * 60) {
      const a = r() * Math.PI * 2;
      const k = 0.9 + r() * 0.26;
      // a point on the rim, found by walking out from the middle along a ray
      let lo = 0;
      let hi = 3;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (hLakeK(HLAKE.x + Math.cos(a) * HLAKE.rx * mid, HLAKE.z + Math.sin(a) * HLAKE.rz * mid) < k) lo = mid;
        else hi = mid;
      }
      const x = HLAKE.x + Math.cos(a) * HLAKE.rx * lo;
      const z = HLAKE.z + Math.sin(a) * HLAKE.rz * lo;
      // in clumps: most of the rim is open water's edge
      const clump = Math.sin(a * 7.0 + 1.3) * 0.5 + Math.sin(a * 17.0 + 4.0) * 0.3 + Math.sin(a * 3.0) * 0.4;
      if (clump < 0.15 + r() * 0.5) continue;
      // (the shore the desk looks across is left clearer)
      if (z > HLAKE.z + 4 && x > HLAKE.x - 6 && r() < 0.75) continue;
      off.push(x + (r() - 0.5) * 0.5, Math.max(landH(x, z), HLAKE.y - 0.25), z + (r() - 0.5) * 0.5, r() * 6.283);
      shp.push(0.9 + r() * 1.1, 0.012 + r() * 0.012, 0.15 + r() * 0.35, r());
    }
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(new Float32Array(off), 4));
    g.setAttribute("aShape", new THREE.InstancedBufferAttribute(new Float32Array(shp), 4));
    g.instanceCount = off.length / 4;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(HLAKE.x, 0, HLAKE.z), 70);
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...HOME_U },
      vertexShader: /* glsl */ `
        attribute vec4 aOffset; attribute vec4 aShape;
        uniform float uTime;
        varying float vT; varying vec3 vWorld; varying float vRand; varying float vHead;
        ${GLSL_NOISE}
        void main(){
          float t = position.y; float side = position.x;
          float h = aShape.x; float r = aShape.w;
          vec2 root = aOffset.xz;
          vec2 face = vec2(cos(aOffset.w), sin(aOffset.w));
          vec2 wd = vec2(0.864, 0.503);
          float wave = smoothstep(0.25, 0.85, vnoise(root * 0.22 - wd * uTime * 0.55));
          float lean = aShape.z * 0.5 + wave * 0.5 + sin(uTime * (1.3 + r) + r * 31.0) * 0.05;
          vec2 bdir = normalize(mix(face, wd, 0.3 + wave * 0.5));
          float a = max(lean, 0.001) * t; float L = max(lean, 0.001);
          float x = h * (1.0 - cos(a)) / L; float y = h * sin(a) / L;
          // one in five carries a dark head near its top
          float head = step(0.8, r) * smoothstep(0.62, 0.7, t) * (1.0 - smoothstep(0.86, 0.9, t));
          float width = aShape.y * (1.0 - pow(t, 2.0)) * (1.0 + head * 2.2);
          vec3 toCam = normalize(cameraPosition - vec3(root.x, aOffset.y, root.y));
          vec2 sd = normalize(vec2(-toCam.z, toCam.x));
          vec3 p = vec3(root.x, aOffset.y, root.y) + vec3(bdir.x * x, y, bdir.y * x) + vec3(sd.x, 0.0, sd.y) * side * width;
          vT = t; vWorld = p; vRand = r; vHead = head;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vT; varying vec3 vWorld; varying float vRand; varying float vHead;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_HOME_AIR}
        void main(){
          vec3 alb = mix(vec3(0.03, 0.055, 0.02), mix(vec3(0.11, 0.17, 0.05), vec3(0.3, 0.27, 0.12), vRand * vRand), smoothstep(0.0, 0.9, vT));
          alb = mix(alb, vec3(0.07, 0.04, 0.025), step(0.5, vHead));
          float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
          vec3 V = normalize(cameraPosition - vWorld);
          float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 4.0);
          vec3 col = alb * (uSkyCol * 0.62 * mix(0.45, 1.0, vT) + uKeyCol * 0.7 * sunUp * cloudShade(vWorld)) + alb * vec3(1.0, 0.85, 0.35) * uKeyCol * back * vT * 0.8 * sunUp;
          col = homeAir(col, vWorld);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, [mobile]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  return <mesh geometry={geo} material={mat} onUpdate={(m) => m.layers.enable(MIRROR_LAYER)} />;
}
