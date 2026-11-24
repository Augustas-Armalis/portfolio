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
  // Whether any of the lake's water is actually on screen. The frustum alone said yes from the desk, where the lake
  // lies hidden behind the meadow's brow and the grass: the whole mirror (400 thousand triangles at 768 x 432) was
  // drawn every frame the eye moved, for nothing, and an orbit at the desk ran at a fraction of the frame rate. So
  // a flat stand-in of the lake's outline is drawn last, writing nothing, inside an occlusion query; while it has
  // passed no sample for a while the mirror is not drawn. (The answer comes a frame or two late: it is held for a
  // few frames each way, so the mirror never flickers on and off.)
  const occ = useMemo(() => {
    const N = 48;
    const pos: number[] = [HLAKE.x, HLAKE.y + 0.04, HLAKE.z];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 1.05 * (1 + 0.15 * Math.sin(a * 3 + 0.7) + 0.08 * Math.sin(a * 5 + 2.1) + 0.05 * Math.sin(a * 9 + 4.0));
      pos.push(HLAKE.x + Math.cos(a) * HLAKE.rx * r, HLAKE.y + 0.04, HLAKE.z + Math.sin(a) * HLAKE.rz * r);
    }
    const idx: number[] = [];
    for (let i = 1; i <= N; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1e7;
    mesh.castShadow = mesh.receiveShadow = false;
    const rim: THREE.Vector4[] = [];
    for (let i = 3; i < pos.length; i += 3) rim.push(new THREE.Vector4(pos[i], pos[i + 1], pos[i + 2], 1));
    const st = { mesh, rim, v: new THREE.Vector4(), vp: new THREE.Matrix4(), crop: new THREE.Matrix4(), q: null as WebGLQuery | null, busy: false, open: false, seenAt: -1e9, frame: 0 };
    const ctx = gl.getContext() as WebGL2RenderingContext;
    mesh.onBeforeRender = (_r, _s, c) => {
      if (c !== camera || st.busy || typeof ctx.beginQuery !== "function") return;
      st.q ??= ctx.createQuery();
      if (!st.q) return;
      ctx.beginQuery(ctx.ANY_SAMPLES_PASSED, st.q);
      st.open = true;
    };
    mesh.onAfterRender = () => {
      if (!st.open) return;
      ctx.endQuery(ctx.ANY_SAMPLES_PASSED);
      st.open = false;
      st.busy = true;
    };
    return st;
  }, [gl, camera]);
  useEffect(
    () => () => {
      occ.mesh.geometry.dispose();
      (occ.mesh.material as THREE.Material).dispose();
      if (occ.q) (gl.getContext() as WebGL2RenderingContext).deleteQuery(occ.q);
    },
    [occ, gl],
  );
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
    // the stand-in's answer, when it has come: any of the water drawn at all
    const ctx = gl.getContext() as WebGL2RenderingContext;
    occ.frame++;
    if (occ.busy && occ.q && ctx.getQueryParameter(occ.q, ctx.QUERY_RESULT_AVAILABLE)) {
      if (ctx.getQueryParameter(occ.q, ctx.QUERY_RESULT)) occ.seenAt = occ.frame;
      occ.busy = false;
    }
    // (after the first frames, which warm the mirror behind the loader whatever is seen)
    if (see && occ.frame > 30 && occ.frame - occ.seenAt > 8) see = false;
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
    // Only the part of the mirror the water is laid over is drawn. A point of the water's own plane is seen by the
    // mirrored eye where the eye sees it, flipped left to right, so the lake's outline on the screen (with a margin
    // for the ripples' loosening) is all of the picture that is ever read. The mirrored eye is narrowed to that
    // window (an off-centre crop of the same lens, drawn into the same pixels of the target), so what lies outside it
    // is neither shaded nor sent to the card. From the desk the lake is a far sliver: a few hundredths of the frame.
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    const vp = occ.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    for (const r of occ.rim) {
      const v = occ.v.copy(r).applyMatrix4(vp);
      if (v.w < 0.05) {
        x0 = y0 = -1;
        x1 = y1 = 1;
        break;
      }
      const nx = v.x / v.w, ny = v.y / v.w;
      if (nx < x0) x0 = nx;
      if (nx > x1) x1 = nx;
      if (ny < y0) y0 = ny;
      if (ny > y1) y1 = ny;
    }
    // (the ripples move a reflection a few hundredths of the frame; and the screen's own edge)
    const W = rt.width, H = rt.height;
    const mx0 = Math.max(-1, -x1 - 0.08), mx1 = Math.min(1, -x0 + 0.08);
    const my0 = Math.max(-1, y0 - 0.1), my1 = Math.min(1, y1 + 0.1);
    if (mx1 <= mx0 || my1 <= my0) {
      REFLECT_U.uReflOn.value = 0;
      return;
    }
    // (on a grid of eight pixels, so the window does not creep a pixel at a time)
    const px0 = Math.max(0, Math.floor((((mx0 + 1) / 2) * W) / 8) * 8), px1 = Math.min(W, Math.ceil((((mx1 + 1) / 2) * W) / 8) * 8);
    const py0 = Math.max(0, Math.floor((((my0 + 1) / 2) * H) / 8) * 8), py1 = Math.min(H, Math.ceil((((my1 + 1) / 2) * H) / 8) * 8);
    const cx0 = (px0 / W) * 2 - 1, cx1 = (px1 / W) * 2 - 1, cy0 = (py0 / H) * 2 - 1, cy1 = (py1 / H) * 2 - 1;
    occ.crop.set(2 / (cx1 - cx0), 0, 0, -(cx1 + cx0) / (cx1 - cx0), 0, 2 / (cy1 - cy0), 0, -(cy1 + cy0) / (cy1 - cy0), 0, 0, 1, 0, 0, 0, 0, 1);
    mc.projectionMatrix.premultiply(occ.crop);
    mc.projectionMatrixInverse.copy(mc.projectionMatrix).invert();
    rt.viewport.set(px0, py0, px1 - px0, py1 - py0);
    rt.scissor.copy(rt.viewport);
    rt.scissorTest = true;
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
  return <primitive object={occ.mesh} />;
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
