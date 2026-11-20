"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_HOME_AIR, HOME_U, homeLand, type HomeTree, type TreeKind } from "./land";
import { VARIANTS, buildFarWood, buildTree } from "./trees";

// The woods of the home world: whole trees near the desk and along the road
// (instanced, one draw per kind and cut), and beyond them thousands of small
// crowns to the edge of sight (one geometry per quarter of the compass).
// All of them sway, take the sun's and the sky's light as rounded forms with
// a painted surface, stand darker at the foot and inside a wood, are shaded by
// the passing clouds, and go into the same air as the land.

export function makeHomeTreeMaterial(merged: boolean) {
  return new THREE.ShaderMaterial({
    defines: merged ? { MERGED: 1 } : {},
    uniforms: { ...SKY_U, ...HOME_U },
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute float aFol;
      #ifdef MERGED
        attribute vec3 aRoot;
      #endif
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vFol; varying float vH; varying vec3 vLocal;
      void main(){
        vec3 n = normal;
        #ifdef MERGED
          vec3 root = aRoot;
          vec3 lp = position - aRoot;
          vec3 wp = position;
          vec3 wn = n;
        #else
          mat4 im = instanceMatrix;
          vec3 root = im[3].xyz;
          vec3 lp = position;
          vec3 wp = (im * vec4(position, 1.0)).xyz;
          vec3 wn = mat3(im) * n;
        #endif
        float ph = root.x * 0.37 + root.z * 0.23;
        float h = max(wp.y - root.y, 0.0);
        // the whole tree leans with the gusts, the crown more than the foot; foliage shivers on top of that
        float gust = sin(uTime * 0.7 + ph) * 0.6 + sin(uTime * 1.9 + ph * 1.7) * 0.25;
        wp.x += gust * 0.0013 * h * h;
        wp.z += cos(uTime * 0.55 + ph * 1.3) * 0.0008 * h * h;
        float fol = step(0.75, aFol);
        wp += fol * vec3(sin(uTime * 2.3 + wp.y * 1.7 + ph), sin(uTime * 1.7 + wp.x * 1.3) * 0.5, cos(uTime * 1.9 + wp.x * 1.7 + ph)) * 0.045;
        vWorld = wp; vLocal = lp;
        vN = normalize(wn);
        vCol = aCol;
        #ifdef USE_INSTANCING_COLOR
          vCol *= mix(vec3(1.0), instanceColor, fol);
        #endif
        vFol = aFol; vH = h;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vFol; varying float vH; varying vec3 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_HOME_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 alb = vCol;
        float fol = step(0.75, vFol);
        // leaves in masses: the smooth lump is broken into many small soft clumps, each catching the light its own way
        if (fol > 0.5) {
          vec3 lp = vWorld * 1.9;
          float b0 = vnoise(lp.xz + lp.y * 0.7) + 0.5 * vnoise(lp.xy * 2.3 + lp.z * 1.9);
          float bx = vnoise(lp.xz + vec2(0.35, 0.0) + lp.y * 0.7) + 0.5 * vnoise((lp.xy + vec2(0.35, 0.0)) * 2.3 + lp.z * 1.9);
          float bz = vnoise(lp.xz + vec2(0.0, 0.35) + lp.y * 0.7) + 0.5 * vnoise(lp.xy * 2.3 + (lp.z + 0.35) * 1.9);
          float by = vnoise(lp.xz + (lp.y + 0.35) * 0.7) + 0.5 * vnoise((lp.xy + vec2(0.0, 0.35)) * 2.3 + lp.z * 1.9);
          float nearK = 1.0 - smoothstep(60.0, 260.0, length(vWorld - cameraPosition));
          n = normalize(n - vec3(bx - b0, by - b0, bz - b0) * 0.95 * nearK);
          // and the hollows between the clumps are darker
          alb *= mix(1.0, 0.76 + 0.32 * smoothstep(0.35, 1.1, b0), nearK);
        }
        // birch bark: dark lenticels and scars on the white stem
        if (vFol > 0.25 && vFol < 0.75) {
          float mk = smoothstep(0.62, 0.8, vnoise(vec2(atan(vLocal.z, vLocal.x) * 1.5, vLocal.y * 5.5)) * (0.75 + 0.5 * vnoise(vec2(vLocal.y * 0.9, 3.0))));
          alb = mix(alb, vec3(0.05, 0.045, 0.04), mk * 0.85);
        } else if (fol < 0.5) {
          // bark: long furrows
          alb *= 0.8 + 0.4 * vnoise(vec2(atan(vLocal.z, vLocal.x) * 4.0, vLocal.y * 1.3));
          alb = mix(alb, vec3(dot(alb, vec3(0.33))), 0.25);
        }
        // tempera: broad dabs of a second tone and a finer stipple, no gloss
        float dab = vnoise(vWorld.xz * 1.5 + vWorld.y * 1.1) * 0.6 + vnoise(vWorld.xy * 4.3 + vWorld.z * 3.1) * 0.4;
        alb *= mix(1.0, 0.74 + dab * 0.56, fol);
        // warmer where the dabs are light, cooler where dark: two greens, not one
        alb = mix(alb, alb * vec3(1.12, 1.03, 0.8), fol * smoothstep(0.5, 0.85, dab) * 0.5);
        alb = mix(alb, vec3(dot(alb, vec3(0.3, 0.5, 0.2))) * vec3(0.42, 0.56, 0.62), uNight * 0.7 * fol);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float ndl = dot(n, uKeyDir);
        float lit = mix(max(ndl, 0.0), smoothstep(-0.42, 0.62, ndl), fol) * sunUp;
        float cs = cloudShade(vWorld);
        // inside a wood the trunks and lower boughs stand in the wood's own shade
        float woods = forestAt(vWorld.xz);
        float deep = mix(1.0, mix(0.5, 1.0, smoothstep(1.0, 11.0, vH)), smoothstep(0.3, 0.9, woods));
        vec3 amb = uSkyCol * (0.5 + 0.5 * n.y) + vec3(0.07, 0.1, 0.03) * uSkyCol * max(-n.y, 0.0) * 1.4;
        vec3 col = alb * (amb * mix(1.0, deep, 0.7) + uKeyCol * lit * 0.92 * cs * deep);
        // light caught in the edge of the crown when the sun is behind it
        vec3 V = normalize(cameraPosition - vWorld);
        float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 3.0);
        col += alb * vec3(1.15, 1.0, 0.5) * uKeyCol * back * (0.35 + 0.5 * (1.0 - abs(dot(n, V)))) * fol * sunUp * cs;
        // the foot sinks into the grass
        col *= mix(0.5, 1.0, smoothstep(0.0, 1.3, vH));
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

export function Forest({ amount, mobile }: { amount: number; mobile: boolean }) {
  const built = useMemo(() => {
    const { trees } = homeLand(amount);
    const mat = makeHomeTreeMaterial(false);
    const farMat = makeHomeTreeMaterial(true);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    const meshes: THREE.Object3D[] = [];
    const geos: THREE.BufferGeometry[] = [];
    let tris = 0;
    for (const lod of [-1, 0, 1] as const)
      for (const kind of KINDS)
        for (let v = 0; v < VARIANTS; v++) {
          // (a phone has no close cuts: every whole tree is the coarse one)
          const list = trees.filter((t: HomeTree) => t.kind === kind && t.v % VARIANTS === v && (mobile ? t.lod !== 2 && lod === 1 : t.lod === lod));
          if (!list.length) continue;
          const geo = buildTree(kind, v, lod === -1 ? 2 : lod === 0 ? 1 : 0);
          geos.push(geo);
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
        }
    // the far woods, a quarter of the compass at a time (so the quarters behind the eye are not drawn)
    const far = trees.filter((t) => t.lod === 2);
    for (let qd = 0; qd < 4; qd++) {
      const list = far.filter((t) => (t.x >= 0 ? 0 : 1) + (t.z >= 0 ? 0 : 2) === qd);
      if (!list.length) continue;
      const geo = buildFarWood(list);
      geos.push(geo);
      const m = new THREE.Mesh(geo, farMat);
      m.layers.enable(MIRROR_LAYER);
      tris += (geo.index?.count ?? 0) / 3;
      meshes.push(m);
    }
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __forest: { trees: trees.length, whole: trees.length - far.length, far: far.length, tris: Math.round(tris), draws: meshes.length } });
    return { meshes, geos, mats: [mat, farMat] };
  }, [amount, mobile]);
  useEffect(
    () => () => {
      built.meshes.forEach((m) => (m as THREE.InstancedMesh).dispose?.());
      built.geos.forEach((g) => g.dispose());
      built.mats.forEach((m) => m.dispose());
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
