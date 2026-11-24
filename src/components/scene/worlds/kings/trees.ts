import * as THREE from "three";
import { buildTree, makeLeafTexture } from "../../home/trees";
import { rng } from "../kit";
import { KINGS, WORLDS, groundAt } from "../voyage";
import { GLSL_END, GLSL_KINGS, KINGS_UNIFORMS } from "./light";
import { inGlade } from "./procession";
import { aisleClear, aisleX } from "./wood";

// The young wood under the old one. Between the great trunks, along both sides of the way and round the glade,
// stand the trees of the home field (scene/home/trees.ts: a real trunk and boughs, a crown of many small leaf
// clumps that turn to the eye), here grown tall and dark: limes and oaks, spruces, pines, and hazel at their feet.
// They take this wood's one light and stand in its mist like everything else, so near ones are dark leaf against
// the glow and far ones go off into the blue. A few hundred of them, one draw call a kind.

const def = WORLDS.kings;
type TreeKind = Parameters<typeof buildTree>[0];

function makeNightLeafMaterial(leaves: THREE.Texture) {
  return new THREE.ShaderMaterial({
    alphaToCoverage: true,
    uniforms: { ...KINGS_UNIFORMS, uLeafTex: { value: leaves } },
    // (the leaf cards are set and turned as the home field sets them: see makeHomeTreeMaterial)
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute float aFol; attribute vec2 aCorner; attribute vec4 aLeaf; attribute float aSeed;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vFol; varying float vH; varying vec3 vLocal;
      varying vec2 vUv; varying vec2 vOff; varying vec2 vLeaf; varying float vSeed;
      void main(){
        mat4 im = modelMatrix * instanceMatrix;
        vec3 root = im[3].xyz;
        vec3 wp = (im * vec4(position, 1.0)).xyz;
        vec3 wn = mat3(im) * normal;
        float sc = length(im[1].xyz);
        float ph = root.x * 0.37 + root.z * 0.23;
        // the air in this wood hardly moves: the crowns only stir
        float gust = sin(uTime * 0.4 + ph) * 0.6 + sin(uTime * 1.1 + ph * 1.7) * 0.25;
        float h = max(wp.y - root.y, 0.0);
        wp.x += gust * 0.0003 * h * h / sc;
        float fol = step(0.75, aFol);
        float fl = sin(uTime * (0.8 + aLeaf.y) + wp.y * 0.6 + ph + aLeaf.y * 40.0) * (1.0 - smoothstep(60.0, 260.0, length(wp - cameraPosition)));
        wp += fol * vec3(fl, 0.4 * sin(uTime * 0.9 + wp.x * 0.5), cos(uTime * 1.0 + wp.x * 0.6 + ph)) * 0.04 * sc;
        float ang = aLeaf.y * 6.2832 + fl * 0.05;
        vec2 cr = vec2(aCorner.x * cos(ang) - aCorner.y * sin(ang), aCorner.x * sin(ang) + aCorner.y * cos(ang));
        vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        wp += (R * cr.x + U * cr.y) * aLeaf.x * sc;
        vWorld = wp; vLocal = position; vN = normalize(wn); vCol = aCol; vSeed = aSeed;
        vFol = aFol; vH = h / sc; vUv = aCorner; vOff = cr; vLeaf = aLeaf.zw;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uLeafTex;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vFol; varying float vH; varying vec3 vLocal;
      varying vec2 vUv; varying vec2 vOff; varying vec2 vLeaf; varying float vSeed;
      ${GLSL_KINGS}
      void main(){
        vec3 n = normalize(vN);
        vec3 alb = vCol;
        float fol = step(0.75, vFol);
        float ao = 1.0;
        float cov = 1.0;
        float dist = length(vWorld - cameraPosition);
        if (fol > 0.5) {
          float cell = floor(vLeaf.x + 0.5);
          vec2 uv = (vec2(mod(cell, 2.0), floor(cell * 0.5)) + vec2(vUv.x, -vUv.y) * 0.5 + 0.5) * 0.5;
          // further off the sheet is read blurred, so a clump is one rounded mass and never single leaves that sparkle
          vec4 t = texture2D(uLeafTex, uv, mix(0.0, 1.8, smoothstep(60.0, 320.0, dist)));
          float cut = mix(0.5, 0.2, smoothstep(80.0, 500.0, dist));
          cov = clamp((t.a - cut) / max(fwidth(t.a) * 1.3, 0.0001) + 0.5, 0.0, 1.0);
          if (cov < 0.1) discard;
          vec3 R = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 U = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          n = normalize(n + (R * vOff.x + U * vOff.y) * 0.5);
          alb *= 0.7 + 0.46 * t.g / max(t.a, 0.3);
          // night leaves: deep and a little olive, each tree its own shade of it, a few gone russet
          float k = fract(vSeed * 7.31);
          alb = mix(alb, vec3(dot(alb, vec3(0.3, 0.5, 0.2))) * vec3(0.5, 0.56, 0.4), 0.55) * 0.42;
          alb *= mix(vec3(1.0), vec3(1.5, 0.95, 0.5), smoothstep(0.82, 0.98, k) * 0.7);
          ao = vLeaf.y;
        } else {
          alb *= (0.8 + 0.4 * vnoise(vec2(atan(vLocal.z, vLocal.x) * 4.0, vLocal.y * 1.3))) * 0.5;
        }
        vec2 dl = domeLight(vWorld, n);
        float att = dl.y * domeVis(vWorld);
        // (a leaf is thin: the light comes through a crown as well as falling on it)
        float wrap = mix(clamp(dl.x * 0.7 + 0.3, 0.0, 1.0), abs(dl.x) * 0.55 + 0.45, fol);
        vec3 col = alb * (coolFill(n) * mix(0.4, 1.0, ao) + DOME_WARM * att * wrap * 3.4 * mix(0.6, 1.0, ao));
        // the foot stands in its own shade
        col *= mix(0.45, 1.0, smoothstep(0.0, 1.6, vH));
        gl_FragColor = vec4(kingsAir(col, vWorld), cov);
        ${GLSL_END}
      }`,
  });
}

export function makeUnderstory(o: { mobile: boolean; trees: number }) {
  const r = rng(4107);
  const leaves = makeLeafTexture();
  const mat = makeNightLeafMaterial(leaves);
  const kinds: [TreeKind, number, number, number][] = [
    // kind, variant, how many in ten, how tall it is made (times its own height)
    ["broad", 0, 3, 4.6],
    ["broad", 1, 2, 4.0],
    ["spruce", 0, 2, 4.8],
    ["pine", 0, 1, 5.2],
    ["bush", 0, 2, 2.6],
  ];
  const total = o.mobile ? 90 : Math.round(360 * Math.max(0.6, o.trees));
  const zTop = def.path[0][1] + 60;
  const meshes: THREE.InstancedMesh[] = [];
  const m4 = new THREE.Object3D();
  for (const [kind, variant, share, tall] of kinds) {
    const n = Math.round((total * share) / 10);
    const geo = buildTree(kind, variant, 0).clone();
    const im = new THREE.InstancedMesh(geo, mat, n);
    const seeds = new Float32Array(n);
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 12; tries++) {
      // most stand along the way, just back from it; the rest deeper in, and a ring of them behind the kings
      const back = r() < 0.2;
      const z = back ? KINGS.z - 60 - r() * 300 : zTop - r() * (zTop - KINGS.z + 40);
      const off = aisleClear(z) + 6 + Math.pow(r(), 1.6) * 280;
      const x = back ? (r() - 0.5) * 620 : aisleX(z) + (r() < 0.5 ? -1 : 1) * off;
      // (never in the glade itself, nor where the kings stand)
      if (Math.abs(z - KINGS.z) < 90 && Math.abs(x) < 250) continue;
      if (inGlade(x, z, 6)) continue;
      const g0 = groundAt(def, x, z);
      const s = tall * (0.7 + r() * 0.7);
      seeds[placed] = r();
      m4.position.set(x, g0 - 0.6, z);
      m4.scale.set(s * (0.9 + r() * 0.3), s, s * (0.9 + r() * 0.3));
      m4.rotation.set(0, r() * 6.283, 0);
      m4.updateMatrix();
      im.setMatrixAt(placed++, m4.matrix);
    }
    im.count = placed;
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    if (im.boundingSphere) im.boundingSphere.radius += 80;
    meshes.push(im);
  }
  return {
    meshes,
    dispose() {
      for (const m of meshes) {
        m.geometry.dispose();
        m.dispose();
      }
      mat.dispose();
    },
  };
}
