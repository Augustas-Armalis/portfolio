"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { AVENUE, HOME_GATE_Z, clearOfRoad, roadX } from "./flightPath";
import { GLSL_NOISE, lakeK, pathX } from "./shared";
import { GLSL_SKY, SKY_U } from "./sky";

// Trees after Čiurlionis: slender and tall, a bare leaning trunk carrying its
// foliage high as a few soft, cloud-like masses. Three kinds: the Lithuanian
// pine (grey foot, ochre upper trunk, a flat layered crown), a dark narrow
// spruce like the spires in his landscapes, and the birch (a white stem that
// forks, small drooping crowns). Real geometry, not cards: clean silhouettes
// at any distance and nothing to sort. One draw call per kind, instanced,
// swaying in the wind, hazed by the same air as the hills.

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type Part = { geo: THREE.BufferGeometry; col: [number, number, number]; col2?: [number, number, number]; fol: number };

// paint a part: per-vertex colour (blending bottom -> top when col2 is given) and a foliage flag
function paint(p: Part) {
  const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
  const pos = g.attributes.position;
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y;
  const y1 = g.boundingBox!.max.y;
  const col = new Float32Array(pos.count * 3);
  const fol = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = p.col2 ? (pos.getY(i) - y0) / Math.max(1e-4, y1 - y0) : 0;
    const c2 = p.col2 ?? p.col;
    col[i * 3] = p.col[0] + (c2[0] - p.col[0]) * k;
    col[i * 3 + 1] = p.col[1] + (c2[1] - p.col[1]) * k;
    col[i * 3 + 2] = p.col[2] + (c2[2] - p.col[2]) * k;
    fol[i] = p.fol;
  }
  g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aFol", new THREE.BufferAttribute(fol, 1));
  g.deleteAttribute("uv");
  return g;
}

// A tapered limb along a gently curved line.
function limb(points: THREE.Vector3[], r0: number, r1: number, sides = 7, steps = 10) {
  const curve = new THREE.CatmullRomCurve3(points);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const c = curve.getPoint(k);
    curve.getTangent(k, t);
    a.crossVectors(t, Math.abs(t.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    b.crossVectors(t, a).normalize();
    const r = r0 + (r1 - r0) * Math.pow(k, 0.8);
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      const nx = a.x * Math.cos(ang) + b.x * Math.sin(ang);
      const ny = a.y * Math.cos(ang) + b.y * Math.sin(ang);
      const nz = a.z * Math.cos(ang) + b.z * Math.sin(ang);
      pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < steps; i++)
    for (let j = 0; j < sides; j++) {
      const p0 = i * sides + j;
      const p1 = i * sides + ((j + 1) % sides);
      idx.push(p0, p0 + sides, p1, p1, p0 + sides, p1 + sides);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// A soft mass of foliage: a lumpy ellipsoid whose normals stay those of the
// ellipsoid, so it shades as one rounded volume.
function blob(c: THREE.Vector3, rx: number, ry: number, rz: number, seed: number, detail: number) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const lump = 1 + 0.16 * Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 1.7) + 0.1 * Math.sin(v.z * 7.3 + seed * 2.3 + v.x * 3.1);
    // flatter underneath, like a crown seen from below
    const under = v.y < 0 ? 0.72 : 1;
    p.setXYZ(i, c.x + v.x * rx * lump, c.y + v.y * ry * lump * under, c.z + v.z * rz * lump);
    v.set(v.x / rx, (v.y / ry) * 0.8 + 0.25, v.z / rz).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export function buildPine(seed: number, detail: number) {
  const r = rng(seed);
  const H = 11 + r() * 2.5;
  const lean = (r() - 0.5) * 1.3;
  const lz = (r() - 0.5) * 0.7;
  const at = (k: number) => new THREE.Vector3(lean * k * k + Math.sin(k * 3.1 + seed) * 0.16, H * k, lz * k * k);
  const parts: Part[] = [{ geo: limb([at(0), at(0.3), at(0.6), at(0.85), at(1)], 0.17, 0.04, 7, 12), col: [0.1, 0.085, 0.075], col2: [0.5, 0.26, 0.12], fol: 0 }];
  // a few bare stubs where the lower branches broke away
  for (let i = 0; i < 3; i++) {
    const k = 0.34 + i * 0.1 + r() * 0.05;
    const a = r() * Math.PI * 2;
    const o = at(k);
    parts.push({ geo: limb([o, o.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.5)), o.clone().add(new THREE.Vector3(Math.cos(a) * 0.95, 0.05, Math.sin(a) * 0.95))], 0.03, 0.008, 4, 2), col: [0.2, 0.14, 0.1], fol: 0 });
  }
  // the crown: flat tiers stepping up and narrowing, each pushed to one side
  const tiers = 5 + Math.floor(r() * 2);
  for (let i = 0; i < tiers; i++) {
    const k = 0.62 + (i / (tiers - 1)) * 0.38;
    const o = at(k);
    const w = (1.9 - (i / (tiers - 1)) * 1.25) * (0.85 + r() * 0.3);
    const a = i * 2.4 + r();
    const off = i === tiers - 1 ? 0 : w * 0.45;
    const c = new THREE.Vector3(o.x + Math.cos(a) * off, o.y + (i === tiers - 1 ? 0.25 : 0), o.z + Math.sin(a) * off);
    parts.push({ geo: blob(c, w, w * (0.26 + r() * 0.08), w * (0.8 + r() * 0.25), seed + i * 3.3, detail), col: [0.05, 0.105, 0.085], col2: [0.13, 0.2, 0.115], fol: 1 });
    // the branch that carries it
    if (off > 0) parts.push({ geo: limb([o.clone().setY(o.y - 0.5), c.clone().setY(c.y - 0.15)], 0.035, 0.012, 4, 2), col: [0.34, 0.2, 0.11], fol: 0 });
  }
  return mergeGeometries(parts.map(paint))!;
}

export function buildSpruce(seed: number, detail: number) {
  const r = rng(seed);
  const H = 9.5 + r() * 3;
  const parts: Part[] = [{ geo: limb([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.04, H * 0.5, 0), new THREE.Vector3(0, H, 0)], 0.13, 0.02, 6, 6), col: [0.09, 0.075, 0.065], col2: [0.14, 0.11, 0.09], fol: 0 }];
  // a narrow dark flame: overlapping skirts, wide low and vanishing to a point
  const n = 8;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const y = H * (0.2 + 0.78 * k);
    const w = (1.25 * (1 - k * 0.86) + 0.08) * (0.9 + r() * 0.2);
    const c = new THREE.Vector3((r() - 0.5) * 0.12, y, (r() - 0.5) * 0.12);
    parts.push({ geo: blob(c, w, H * 0.085 + w * 0.25, w, seed + i * 1.9, detail), col: [0.03, 0.065, 0.06], col2: [0.07, 0.12, 0.085], fol: 1 });
  }
  return mergeGeometries(parts.map(paint))!;
}

export function buildBirch(seed: number, detail: number) {
  const r = rng(seed);
  const H = 8 + r() * 2;
  const lean = (r() - 0.5) * 1.6;
  const at = (k: number) => new THREE.Vector3(lean * k * k + Math.sin(k * 2.4 + seed) * 0.12, H * k, Math.cos(k * 2 + seed) * 0.1);
  const white: [number, number, number] = [0.78, 0.76, 0.7];
  const parts: Part[] = [{ geo: limb([at(0), at(0.25), at(0.5), at(0.72)], 0.085, 0.045, 7, 9), col: [0.5, 0.48, 0.44], col2: white, fol: 0.5 }];
  // the stem forks into two or three slender leaders
  const forks = 2 + Math.floor(r() * 2);
  const base = at(0.72);
  for (let i = 0; i < forks; i++) {
    const a = (i / forks) * Math.PI * 2 + r() * 1.2;
    const reach = 0.7 + r() * 0.5;
    const top = new THREE.Vector3(base.x + Math.cos(a) * reach, H * (0.95 + r() * 0.1), base.z + Math.sin(a) * reach);
    const mid = base.clone().lerp(top, 0.5).add(new THREE.Vector3(Math.cos(a) * 0.18, 0.1, Math.sin(a) * 0.18));
    parts.push({ geo: limb([base, mid, top], 0.04, 0.01, 5, 5), col: white, col2: [0.6, 0.56, 0.5], fol: 0.5 });
    // small light crowns strung along each leader, hanging a little
    const m = 3 + Math.floor(r() * 2);
    for (let j = 0; j < m; j++) {
      const k = 0.3 + (j / m) * 0.75;
      const o = base.clone().lerp(top, k);
      const w = 0.42 + r() * 0.34 - j * 0.03;
      const c = new THREE.Vector3(o.x + (r() - 0.5) * 0.7, o.y - 0.12 + (r() - 0.5) * 0.3, o.z + (r() - 0.5) * 0.7);
      parts.push({ geo: blob(c, w, w * (1.05 + r() * 0.5), w * (0.85 + r() * 0.3), seed + i * 7 + j * 2.1, detail), col: [0.2, 0.3, 0.1], col2: [0.4, 0.47, 0.17], fol: 1 });
    }
  }
  return mergeGeometries(parts.map(paint))!;
}

export function makeTreeMaterial(fog: number) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, uFog: { value: fog } },
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute float aFol;
      #ifdef USE_INSTANCING_COLOR
        // (three declares instanceColor for us)
      #endif
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vFol; varying float vH; varying vec3 vLocal;
      void main(){
        vec3 p = position;
        vec3 n = normal;
        #ifdef USE_INSTANCING
          mat4 im = instanceMatrix;
        #else
          mat4 im = mat4(1.0);
        #endif
        float ph = im[3].x * 0.37 + im[3].z * 0.23;
        // the whole tree leans with the gusts, the crown more than the foot;
        // foliage shivers on top of that
        float h = max(p.y, 0.0);
        float sway = sin(uTime * 0.7 + ph) * 0.6 + sin(uTime * 1.9 + ph * 1.7) * 0.25;
        p.x += sway * 0.0016 * h * h;
        p.z += cos(uTime * 0.55 + ph * 1.3) * 0.0009 * h * h;
        p += aFol * step(0.75, aFol) * vec3(sin(uTime * 2.3 + p.y * 2.0 + ph), 0.0, cos(uTime * 1.9 + p.x * 2.0 + ph)) * 0.035;
        vec4 wp = modelMatrix * im * vec4(p, 1.0);
        vWorld = wp.xyz; vLocal = position;
        vN = normalize(mat3(modelMatrix * im) * n);
        vCol = aCol;
        #ifdef USE_INSTANCING_COLOR
          vCol *= mix(vec3(1.0), instanceColor, step(0.75, aFol));
        #endif
        vFol = aFol; vH = position.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFog;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying float vFol; varying float vH; varying vec3 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        vec3 n = normalize(vN);
        vec3 alb = vCol;
        float fol = step(0.75, vFol);
        // birch bark: dark lenticels and scars on the white stem
        if (vFol > 0.25 && vFol < 0.75) {
          float mk = smoothstep(0.62, 0.8, vnoise(vec2(atan(vLocal.z, vLocal.x) * 1.5, vLocal.y * 5.5)) * (0.75 + 0.5 * vnoise(vec2(vLocal.y * 0.9, 3.0))));
          alb = mix(alb, vec3(0.05, 0.045, 0.04), mk * 0.85);
        }
        // tempera: broad dabs of a second tone, no gloss
        float dab = vnoise(vWorld.xz * 1.7 + vWorld.y * 1.3) * 0.6 + vnoise(vWorld.xy * 4.5) * 0.4;
        alb *= mix(1.0, 0.78 + dab * 0.5, fol);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float ndl = dot(n, uKeyDir);
        float lit = mix(max(ndl, 0.0), smoothstep(-0.35, 0.55, ndl), fol) * sunUp;
        vec3 col = alb * (uSkyCol * (0.55 + 0.45 * n.y) + uKeyCol * lit * 1.05);
        // light caught in the edge of the crown when the sun is behind it
        vec3 V = normalize(cameraPosition - vWorld);
        col += alb * uKeyCol * pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 3.0) * 0.5 * fol * sunUp;
        // the foot sinks into the grass
        col *= mix(0.55, 1.0, smoothstep(0.0, 1.2, vH));
        float dist = length(vWorld - cameraPosition);
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 air = skyBase(normalize(vec3(d.x, max(d.y, 0.0) * 0.5 + 0.012, d.z)));
        // ground mist: thicker around the trunks than in the crowns
        float low = exp(-max(vWorld.y, 0.0) * 0.16);
        float f = 1.0 - exp(-dist * (uFog * (0.55 + 0.9 * low) + uMist));
        col = mix(col, air, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export type Kind = "pine" | "spruce" | "birch";
export type Tree = { x: number; z: number; s: number; kind: Kind; v: number; rot: number; tint: number };

// Loose groves, composed for the view from the desk (a clear lane to the lake
// and the far hills, taller trees framing left and right) and for the flight
// (stands either side of the route, never on it).
function place(mobile: boolean) {
  const r = rng(77);
  const trees: Tree[] = [];
  const ok = (x: number, z: number, avenue = false) => {
    if (lakeK(x, z) < 1.25) return false;
    if (Math.abs(x - pathX(z)) < 2.5 && Math.abs(z) < 60) return false;
    if (Math.hypot(x, z) < 17) return false;
    if (avenue ? Math.abs(x - roadX(z)) < 5.5 : !clearOfRoad(x, z)) return false;
    // nothing between the visitor and the desk
    if (z > 6 && Math.abs(x) < 14) return false;
    return true;
  };
  const grove = (gx: number, gz: number, spread: number, n: number, kinds: Kind[], s0: number, s1: number, avenue = false) => {
    for (let i = 0; i < n * 3 && n > 0; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * spread;
      const x = gx + Math.cos(a) * d * 1.5;
      const z = gz + Math.sin(a) * d * 0.7;
      if (!ok(x, z, avenue)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 1.8)) continue;
      trees.push({ x, z, s: s0 + r() * (s1 - s0), kind: kinds[Math.floor(r() * kinds.length)], v: Math.floor(r() * 3), rot: r() * 6.28, tint: r() });
      n--;
    }
  };
  // framing the desk view
  grove(-26, -44, 9, 7, ["birch", "birch", "pine"], 0.95, 1.25);
  grove(-34, -30, 5, 4, ["birch"], 0.9, 1.15);
  grove(24, -40, 8, 6, ["pine", "pine", "spruce"], 1.0, 1.35);
  grove(38, -22, 6, 4, ["pine", "birch"], 0.9, 1.2);
  grove(-52, -18, 9, 6, ["spruce", "pine"], 1.0, 1.4);
  grove(-12, -72, 10, 6, ["spruce", "spruce", "pine"], 1.1, 1.5);
  grove(14, -78, 9, 5, ["spruce", "pine"], 1.1, 1.5);
  grove(-30, 24, 8, 5, ["birch", "pine"], 0.9, 1.2);
  grove(34, 22, 8, 5, ["pine", "birch"], 0.9, 1.2);
  // the avenue: the road runs long and calm between tall pines and white
  // birches, standing in stands of a kind, close to the verge, two and three deep
  const len = AVENUE.from - AVENUE.to;
  const steps = mobile ? 26 : 44;
  for (let i = 0; i < steps; i++) {
    const side = i % 2 ? 1 : -1;
    const z = AVENUE.from - (i / steps) * len - r() * 3;
    // species by stretch, not by tree: a run of birches, then pines, a dark spruce or two between
    const run = Math.floor((i + (side > 0 ? 3 : 0)) / 6) % 3;
    const kinds: Kind[] = run === 0 ? ["birch", "birch", "birch", "pine"] : run === 1 ? ["pine", "pine", "pine", "spruce"] : ["pine", "birch", "spruce"];
    grove(roadX(z) + side * (8.5 + r() * 2.5), z, 2.6, mobile ? 2 : 3, kinds, 1.2, 1.75, true);
    if (i % 2 === 0) grove(roadX(z) + side * (17 + r() * 8), z + (r() - 0.5) * 8, 5, mobile ? 2 : 4, kinds, 1.1, 1.6, true);
  }
  // deeper stands behind the avenue and round the gate, so the road reads as a way through a wood
  const stands = mobile ? 12 : 26;
  for (let i = 0; i < stands; i++) {
    const z = -40 - (i / stands) * (-HOME_GATE_Z + 10);
    const side = i % 2 ? 1 : -1;
    const k: Kind[] = i % 4 === 0 ? ["birch", "birch", "pine"] : i % 4 === 1 ? ["spruce", "spruce", "pine"] : ["pine", "spruce", "birch"];
    grove(roadX(z) + side * (34 + r() * 44), z + (r() - 0.5) * 14, 8 + r() * 7, mobile ? 3 : 5 + Math.floor(r() * 4), k, 1.0, 1.6);
  }
  for (let i = 0; i < (mobile ? 8 : 14); i++) {
    const a = 0.9 + (i / 14) * 4.5 + r() * 0.2; // behind and beside the desk, not down the road
    const d = 60 + r() * 60;
    grove(Math.sin(a) * d, Math.cos(a) * d * 0.9 + 10, 9 + r() * 6, mobile ? 3 : 5, i % 2 ? ["pine", "spruce"] : ["birch", "pine"], 1.0, 1.6);
  }
  return trees;
}

export function Trees({ mobile, fogDensity }: { mobile: boolean; fogDensity: number }) {
  const { sets, mat } = useMemo(() => {
    const detail = mobile ? 1 : 2;
    const variants: Record<Kind, THREE.BufferGeometry[]> = {
      pine: [buildPine(11, detail), buildPine(29, detail), buildPine(47, detail)],
      spruce: [buildSpruce(5, detail), buildSpruce(19, detail), buildSpruce(37, detail)],
      birch: [buildBirch(7, detail), buildBirch(23, detail), buildBirch(41, detail)],
    };
    const trees = place(mobile);
    const mat = makeTreeMaterial(fogDensity);
    const o = new THREE.Object3D();
    const col = new THREE.Color();
    const sets: THREE.InstancedMesh[] = [];
    (Object.keys(variants) as Kind[]).forEach((kind) =>
      variants[kind].forEach((geo, v) => {
        const list = trees.filter((t) => t.kind === kind && t.v === v);
        if (!list.length) return;
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((t, i) => {
          o.position.set(t.x, -0.05, t.z);
          o.rotation.set(0, t.rot, 0);
          o.scale.set(t.s * (0.92 + t.tint * 0.16), t.s * (0.94 + ((i * 7) % 5) * 0.04), t.s * (0.92 + t.tint * 0.16));
          o.updateMatrix();
          im.setMatrixAt(i, o.matrix);
          // crowns drift between a cooler and a warmer, sun-bleached green
          im.setColorAt(i, col.setRGB(0.86 + t.tint * 0.3, 0.9 + t.tint * 0.16, 0.86 - t.tint * 0.12));
        });
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.frustumCulled = false;
        sets.push(im);
      }),
    );
    return { sets, mat };
  }, [mobile, fogDensity]);
  useEffect(
    () => () => {
      sets.forEach((s) => {
        s.geometry.dispose();
        s.dispose();
      });
      mat.dispose();
    },
    [sets, mat],
  );
  return (
    <>
      {sets.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
    </>
  );
}

// ---------- trees for the painted worlds ----------
// The same three kinds, standing on a world's own ground. They are gathered
// into chunks of land so that whole stands out of view (or beyond the air's
// reach) are never sent to the card.
export function buildGrove(trees: (Tree & { y: number })[], opts: { mobile: boolean; fog: number; cell?: number; tint?: [number, number, number] }) {
  const detail = opts.mobile ? 1 : 2;
  const variants: Record<Kind, THREE.BufferGeometry[]> = {
    pine: [buildPine(11, detail), buildPine(47, detail)],
    spruce: [buildSpruce(5, detail), buildSpruce(37, detail)],
    birch: [buildBirch(7, detail), buildBirch(41, detail)],
  };
  const mat = makeTreeMaterial(opts.fog);
  const cell = opts.cell ?? 170;
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  const tint = opts.tint ?? [1, 1, 1];
  const buckets = new Map<string, (Tree & { y: number })[]>();
  for (const t of trees) {
    const key = `${t.kind}:${t.v % 2}:${Math.floor(t.x / cell)}:${Math.floor(t.z / cell)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(t);
  }
  const sets: THREE.InstancedMesh[] = [];
  buckets.forEach((list, key) => {
    const [kind, v] = key.split(":");
    const im = new THREE.InstancedMesh(variants[kind as Kind][+v], mat, list.length);
    list.forEach((t, i) => {
      o.position.set(t.x, t.y - 0.08, t.z);
      o.rotation.set(0, t.rot, 0);
      o.scale.set(t.s * (0.92 + t.tint * 0.16), t.s * (0.94 + ((i * 7) % 5) * 0.04), t.s * (0.92 + t.tint * 0.16));
      o.updateMatrix();
      im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, col.setRGB((0.86 + t.tint * 0.3) * tint[0], (0.9 + t.tint * 0.16) * tint[1], (0.86 - t.tint * 0.12) * tint[2]));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    sets.push(im);
  });
  const dispose = () => {
    sets.forEach((x) => x.dispose());
    Object.values(variants).forEach((l) => l.forEach((g) => g.dispose()));
    mat.dispose();
  };
  return { sets, mat, dispose };
}
