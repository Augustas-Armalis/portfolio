"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_HOME_AIR, HOME_U, homeLand, type HomeTree, type TreeKind } from "./land";
import { FAR_KIND, VARIANTS, buildTree, makeFarTreeTexture, makeLeafTexture } from "./trees";

// The woods of the home world.
//   near the desk and along the road: whole trees, a trunk with boughs and a
//     crown of hundreds of leaf clumps (instanced, one draw per kind and cut);
//   a little further: the same trees in fewer, larger clumps, drawn a quarter
//     of the compass at a time (the quarters behind the eye are not drawn);
//   beyond: each tree is one small painted card that turns to the eye, lit as
//     a rounded form from the sun's side and from above: tens of thousands of
//     them, in blocks that are skipped when out of sight, make the soft forest
//     masses on the hills.
// All of them take the sun's and the sky's light, are darker beneath and
// inside a wood, are shaded by the passing clouds, sway, and go into the same
// air as the land.

const WIND = /* glsl */ `
  float ph = root.x * 0.37 + root.z * 0.23;
  float gust = sin(uTime * 0.7 + ph) * 0.6 + sin(uTime * 1.9 + ph * 1.7) * 0.25;
`;

export function makeHomeTreeMaterial(leaves: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...HOME_U, uLeafTex: { value: leaves } },
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute float aFol; attribute vec2 aCorner; attribute vec4 aLeaf;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vFol; varying float vH; varying vec3 vLocal;
      varying vec2 vUv; varying vec2 vOff; varying vec2 vLeaf;
      void main(){
        mat4 im = instanceMatrix;
        vec3 root = im[3].xyz;
        vec3 wp = (im * vec4(position, 1.0)).xyz;
        vec3 wn = mat3(im) * normal;
        float sc = length(im[1].xyz);
        ${WIND}
        float h = max(wp.y - root.y, 0.0);
        // the whole tree leans with the gusts, the crown more than the foot; each clump of leaves stirs on top of that
        wp.x += gust * 0.0013 * h * h;
        wp.z += cos(uTime * 0.55 + ph * 1.3) * 0.0008 * h * h;
        float fol = step(0.75, aFol);
        float fl = sin(uTime * (1.5 + aLeaf.y * 2.0) + wp.y * 1.7 + ph + aLeaf.y * 40.0);
        wp += fol * vec3(fl, 0.4 * sin(uTime * 1.7 + wp.x * 1.3), cos(uTime * 1.9 + wp.x * 1.7 + ph)) * 0.05;
        float ang = aLeaf.y * 6.2832 + fl * 0.06;
        vec2 cr = vec2(aCorner.x * cos(ang) - aCorner.y * sin(ang), aCorner.x * sin(ang) + aCorner.y * cos(ang));
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        wp += (R * cr.x + U * cr.y) * aLeaf.x * sc;
        vWorld = wp; vLocal = position;
        vN = normalize(wn);
        vCol = aCol;
        #ifdef USE_INSTANCING_COLOR
          vCol *= mix(vec3(1.0), instanceColor, fol);
        #endif
        vFol = aFol; vH = h; vUv = aCorner; vOff = cr; vLeaf = aLeaf.zw;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uLeafTex;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vFol; varying float vH; varying vec3 vLocal;
      varying vec2 vUv; varying vec2 vOff; varying vec2 vLeaf;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 alb = vCol;
        float fol = step(0.75, vFol);
        float ao = 1.0;
        float dist = length(vWorld - cameraPosition);
        if (fol > 0.5) {
          float cell = floor(vLeaf.x + 0.5);
          vec2 uv = (vec2(mod(cell, 2.0), floor(cell * 0.5)) + vec2(vUv.x, -vUv.y) * 0.5 + 0.5) * 0.5;
          vec4 t = texture2D(uLeafTex, uv);
          // (further off the sheet is read blurred and its leaves thin away: the cut is lowered to keep the crown whole)
          float cut = mix(0.5, 0.24, smoothstep(25.0, 170.0, dist));
          if (t.a < cut) discard;
          // each clump is a small rounded form of its own
          vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          n = normalize(n + (R * vOff.x + U * vOff.y) * 0.5);
          alb *= 0.66 + 0.5 * t.g / max(t.a, 0.3);
          ao = vLeaf.y;
        } else if (vFol > 0.25) {
          // birch bark: dark lenticels and scars on the white stem
          float mk = smoothstep(0.62, 0.8, vnoise(vec2(atan(vLocal.z, vLocal.x) * 1.5, vLocal.y * 5.5)) * (0.75 + 0.5 * vnoise(vec2(vLocal.y * 0.9, 3.0))));
          alb = mix(alb, vec3(0.05, 0.045, 0.04), mk * 0.85);
        } else {
          // bark: long furrows
          alb *= 0.8 + 0.4 * vnoise(vec2(atan(vLocal.z, vLocal.x) * 4.0, vLocal.y * 1.3));
          alb = mix(alb, vec3(dot(alb, vec3(0.33))), 0.25);
        }
        alb = mix(alb, vec3(dot(alb, vec3(0.3, 0.5, 0.2))) * vec3(0.42, 0.56, 0.62), uNight * 0.7 * fol);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float ndl = dot(n, uKeyDir);
        float w = ndl * 0.5 + 0.5;
        // leaves: light in three soft steps, as paint is laid (shade, the body colour, the lit top)
        float ramp = mix(max(ndl, 0.0), 0.2 * smoothstep(0.14, 0.4, w) + 0.8 * smoothstep(0.46, 0.84, w), fol);
        float cs = cloudShade(vWorld);
        // inside a wood the trunks and lower boughs stand in the wood's own shade
        float woods = forestAt(vWorld.xz);
        float deep = mix(1.0, mix(0.5, 1.0, smoothstep(1.0, 11.0, vH)), smoothstep(0.3, 0.9, woods));
        vec3 amb = uSkyCol * mix(0.36, 1.0, 0.5 + 0.5 * n.y) * mix(0.34, 1.0, ao) + vec3(0.07, 0.1, 0.03) * uSkyCol * max(-n.y, 0.0) * 1.2;
        // lit leaves are warm and yellow, shaded ones cool: two greens, not one
        vec3 litAlb = alb * mix(vec3(1.0), vec3(1.22, 1.07, 0.66), fol * ramp);
        vec3 col = alb * mix(vec3(1.0), vec3(0.86, 0.98, 1.1), fol) * amb * mix(1.0, deep, 0.7) + litAlb * uKeyCol * ramp * 0.98 * cs * deep * mix(0.5, 1.0, ao) * sunUp;
        // light caught in the edge of the crown when the sun is behind it
        vec3 V = normalize(cameraPosition - vWorld);
        float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 3.0);
        col += alb * vec3(1.15, 1.0, 0.45) * uKeyCol * back * (0.25 + 0.5 * ao) * fol * sunUp * cs * 0.7;
        // the foot sinks into the grass
        col *= mix(0.5, 1.0, smoothstep(0.0, 1.3, vH));
        col = homeAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// the far woods: one card a tree
function makeFarMaterial(sheet: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...HOME_U, uFarTex: { value: sheet } },
    vertexShader: /* glsl */ `
      attribute vec3 aRoot; attribute vec4 aDim; attribute vec3 aLo; attribute vec3 aHi;
      uniform vec3 uKeyDir;
      varying vec3 vWorld; varying vec2 vUv; varying vec3 vLo; varying vec3 vHi; varying float vSide; varying float vCell; varying vec3 vRoot;
      void main(){
        vec3 toCam = cameraPosition - aRoot;
        vec2 rt = normalize(vec2(toCam.z, -toCam.x) + 1e-5);
        vec3 wp = aRoot + vec3(rt.x, 0.0, rt.y) * (position.x * aDim.x) + vec3(0.0, position.y * aDim.y, 0.0);
        vWorld = wp; vRoot = aRoot;
        vUv = vec2(position.x + 0.5, position.y);
        vLo = aLo; vHi = aHi; vCell = aDim.z;
        // how much the sun stands to the card's right
        vSide = dot(uKeyDir.xz, rt);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uFarTex;
      varying vec3 vWorld; varying vec2 vUv; varying vec3 vLo; varying vec3 vHi; varying float vSide; varying float vCell; varying vec3 vRoot;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        float cell = floor(vCell + 0.5);
        vec2 uv = (vec2(mod(cell, 2.0), floor(cell * 0.5)) + vec2(vUv.x, 1.0 - vUv.y) * 0.996 + 0.002) * 0.5;
        vec4 t = texture2D(uFarTex, uv);
        if (t.a < 0.45) discard;
        float leafy = step(0.5, t.b);
        float nx = t.r * 2.0 - 1.0;
        float up = t.g;
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        // a rounded form: lit on the sun's side and from above
        float w = clamp(0.5 + 0.5 * (nx * vSide * 0.9 + (up * 2.0 - 1.0) * (0.3 + 0.7 * uKeyDir.y)), 0.0, 1.0);
        float ramp = 0.2 * smoothstep(0.14, 0.4, w) + 0.8 * smoothstep(0.46, 0.84, w);
        vec3 alb = mix(vLo, vHi, smoothstep(0.15, 0.85, up)) * (0.9 + 0.35 * up);
        alb = mix(vec3(0.16, 0.11, 0.075), alb, leafy);
        alb = mix(alb, vec3(dot(alb, vec3(0.3, 0.5, 0.2))) * vec3(0.42, 0.56, 0.62), uNight * 0.7);
        float cs = cloudShade(vRoot);
        // in a wood only the tops stand in the sun
        float woods = forestAt(vRoot.xz);
        float deep = mix(1.0, mix(0.42, 1.0, smoothstep(0.25, 0.75, vUv.y)), smoothstep(0.3, 0.9, woods));
        vec3 amb = uSkyCol * mix(0.3, 1.0, up) * mix(0.55, 1.0, smoothstep(0.0, 0.5, vUv.y));
        vec3 litAlb = alb * mix(vec3(1.0), vec3(1.22, 1.07, 0.66), ramp * leafy);
        vec3 col = alb * vec3(0.86, 0.98, 1.1) * amb * mix(1.0, deep, 0.7) + litAlb * uKeyCol * ramp * 0.98 * cs * deep * sunUp;
        vec3 V = normalize(cameraPosition - vWorld);
        float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 3.0);
        col += alb * vec3(1.15, 1.0, 0.45) * uKeyCol * back * 0.4 * leafy * sunUp * cs * smoothstep(0.4, 0.9, up);
        col *= mix(0.5, 1.0, smoothstep(0.0, 0.12, vUv.y));
        col = homeAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

const KINDS: TreeKind[] = ["broad", "birch", "pine", "spruce", "cypress", "bush"];
// the layer the lake's mirror draws (see Water)
export const MIRROR_LAYER = 2;

function farBlock(list: HomeTree[], mat: THREE.Material) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const n = list.length;
  const root = new Float32Array(n * 3);
  const dim = new Float32Array(n * 4);
  const lo = new Float32Array(n * 3);
  const hi = new Float32Array(n * 3);
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  list.forEach((t, i) => {
    const k = FAR_KIND[t.kind];
    root.set([t.x, t.y - 0.2, t.z], i * 3);
    dim.set([k.w * t.s * (0.9 + t.tint * 0.2), k.h * t.s * (0.88 + ((i * 7) % 5) * 0.06), k.cell, t.tint], i * 4);
    // crowns drift between a cooler and a warmer, sun-bleached green
    const cr = 0.84 + t.tint * 0.3;
    const cg = 0.9 + t.tint * 0.14;
    const cb = 0.92 - t.tint * 0.14;
    lo.set([k.lo[0] * cr, k.lo[1] * cg, k.lo[2] * cb], i * 3);
    hi.set([k.hi[0] * cr, k.hi[1] * cg, k.hi[2] * cb], i * 3);
    box.expandByPoint(p.set(t.x, t.y, t.z));
    box.expandByPoint(p.set(t.x, t.y + 20, t.z));
  });
  g.setAttribute("aRoot", new THREE.InstancedBufferAttribute(root, 3));
  g.setAttribute("aDim", new THREE.InstancedBufferAttribute(dim, 4));
  g.setAttribute("aLo", new THREE.InstancedBufferAttribute(lo, 3));
  g.setAttribute("aHi", new THREE.InstancedBufferAttribute(hi, 3));
  g.instanceCount = n;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  g.boundingSphere.radius += 10;
  const m = new THREE.Mesh(g, mat);
  m.layers.enable(MIRROR_LAYER);
  return m;
}

export function Forest({ amount, mobile }: { amount: number; mobile: boolean }) {
  const built = useMemo(() => {
    const { trees } = homeLand(amount);
    const leaves = makeLeafTexture();
    const sheet = makeFarTreeTexture();
    const mat = makeHomeTreeMaterial(leaves);
    const farMat = makeFarMaterial(sheet);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    const meshes: THREE.Object3D[] = [];
    const geos: THREE.BufferGeometry[] = [];
    let tris = 0;
    const whole = (list: HomeTree[], geo: THREE.BufferGeometry) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => {
        o.position.set(t.x, t.y - 0.06, t.z);
        o.rotation.set(0, t.rot, 0);
        o.scale.set(t.s * (0.92 + t.tint * 0.16), t.s * (0.94 + ((i * 7) % 5) * 0.04), t.s * (0.92 + t.tint * 0.16));
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
        // crowns drift between a cooler and a warmer, sun-bleached green
        im.setColorAt(i, col.setRGB(0.84 + t.tint * 0.3, 0.9 + t.tint * 0.14, 0.92 - t.tint * 0.14));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.layers.enable(MIRROR_LAYER);
      tris += ((geo.index?.count ?? 0) / 3) * list.length;
      meshes.push(im);
    };
    const quarter = (t: HomeTree) => (t.x >= 0 ? 0 : 1) + (t.z >= 0 ? 0 : 2);
    for (const kind of KINDS) {
      // the trees nearest the desk and along the road, in full (a phone has only the coarse cut)
      for (let v = 0; v < VARIANTS; v++) {
        const list = trees.filter((t) => t.kind === kind && t.lod <= 0 && t.v % VARIANTS === v);
        if (!list.length) continue;
        const geo = buildTree(kind, v, mobile ? 0 : 1);
        geos.push(geo);
        whole(list, geo);
      }
      // a little further: the coarse cut, a quarter of the compass at a time
      const coarse = buildTree(kind, 0, 0);
      geos.push(coarse);
      // (north and south of the desk apart: the half behind the eye is not drawn)
      for (let qd = 0; qd < 2; qd++) whole(trees.filter((t) => t.kind === kind && t.lod === 1 && (quarter(t) >> 1) === qd), coarse);
    }
    // the far woods, in blocks 640 m on a side
    const far = trees.filter((t) => t.lod === 2);
    const blocks = new Map<string, HomeTree[]>();
    for (const t of far) {
      const key = `${Math.floor(t.x / 640)},${Math.floor(t.z / 640)}`;
      let b = blocks.get(key);
      if (!b) blocks.set(key, (b = []));
      b.push(t);
    }
    for (const list of blocks.values()) {
      const m = farBlock(list, farMat);
      geos.push(m.geometry);
      meshes.push(m);
    }
    tris += far.length * 2;
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __forest: { trees: trees.length, whole: trees.length - far.length, far: far.length, tris: Math.round(tris), draws: meshes.length } });
    return { meshes, geos, mats: [mat, farMat], texs: [leaves, sheet] };
  }, [amount, mobile]);
  useEffect(
    () => () => {
      built.meshes.forEach((m) => (m as THREE.InstancedMesh).dispose?.());
      built.geos.forEach((g) => g.dispose());
      built.mats.forEach((m) => m.dispose());
      built.texs.forEach((t) => t.dispose());
    },
    [built],
  );
  return (
    <>
      {built.meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
