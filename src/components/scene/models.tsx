"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DESK, MONITOR, PHONE, clamp01, smooth } from "./shared";
import { getMats, nightLift } from "./materials";
import { SKY_U } from "./sky";

// Everything here is modelled in code at real scale (metres): lofted
// sections, bevelled prisms and lathes with PBR materials. No logos anywhere.
// Static parts that share a material are merged into one geometry; every
// model builds its geometry once and frees it when it unmounts.

type Geo = THREE.BufferGeometry;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const rbox = (w: number, h: number, d: number, r: number, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);
const cyl = (rt: number, rb: number, h: number, seg = 32) => new THREE.CylinderGeometry(rt, rb, h, seg);

// Move (and optionally turn) a geometry in place: used to bake parts before merging.
function put<T extends Geo>(g: T, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
}

// One geometry (position / normal / uv, non-indexed) out of many parts.
function merge(parts: Geo[]) {
  const flat = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    if (q !== p) p.dispose();
    Object.keys(q.attributes).forEach((k) => {
      if (k !== "position" && k !== "normal" && k !== "uv") q.deleteAttribute(k);
    });
    if (!q.attributes.uv) q.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2));
    return q;
  });
  const g = mergeGeometries(flat, false)!;
  flat.forEach((f) => f.dispose());
  return g;
}

// Geometries built once per mount and freed with it.
function useGeo<T extends Record<string, unknown>>(make: () => T): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const g = useMemo(make, []);
  useEffect(
    () => () => {
      Object.values(g).forEach((v) => {
        if (v && (v as Geo).isBufferGeometry) (v as Geo).dispose();
      });
    },
    [g],
  );
  return g;
}

// the desk's metals pick up more of the sky after dark (see nightLift)
const useNightLift = () => useFrame(() => nightLift(SKY_U.uNight.value));

function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// Flat rounded rectangle with 0..1 UVs.
function roundedPlane(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(roundedRectShape(w, h, r), 12);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / w + 0.5;
    uv[i * 2 + 1] = p.getY(i) / h + 0.5;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

// Rounded-rectangle outline, counter-clockwise, as [u, v] pairs.
function rrPts(hw: number, hh: number, r: number, cs = 5) {
  const pts: [number, number][] = [];
  const c: [number, number][] = [
    [hw - r, hh - r],
    [-(hw - r), hh - r],
    [-(hw - r), -(hh - r)],
    [hw - r, -(hh - r)],
  ];
  c.forEach(([cx, cy], q) => {
    for (let i = 0; i <= cs; i++) {
      const a = (q + i / cs) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  });
  return pts;
}

// Skin a stack of closed rings (all the same length). Smooth by default; give
// the same ring twice for a hard edge, or a ring collapsed to a point for a
// cap. The winding is fixed up so the faces look outward.
function loft(rings: THREE.Vector3[][], uv: (p: THREE.Vector3) => [number, number] = (p) => [p.x, p.y]) {
  const n = rings[0].length;
  const pos = new Float32Array(rings.length * n * 3);
  const uvs = new Float32Array(rings.length * n * 2);
  rings.forEach((r, i) =>
    r.forEach((p, j) => {
      const k = i * n + j;
      pos[k * 3] = p.x;
      pos[k * 3 + 1] = p.y;
      pos[k * 3 + 2] = p.z;
      const t = uv(p);
      uvs[k * 2] = t[0];
      uvs[k * 2 + 1] = t[1];
    }),
  );
  const idx: number[] = [];
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      idx.push(a, b, a + n, b, b + n, a + n);
    }
  let vol = 0;
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    A.fromArray(pos, idx[t] * 3);
    B.fromArray(pos, idx[t + 1] * 3);
    C.fromArray(pos, idx[t + 2] * 3);
    vol += A.dot(B.cross(C));
  }
  if (vol < 0)
    for (let t = 0; t < idx.length; t += 3) {
      const k = idx[t + 1];
      idx[t + 1] = idx[t + 2];
      idx[t + 2] = k;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A solid with a rounded-rectangle plan (x, z) and a profile of [inset, y]
// steps going up: chamfers, bevels and crisp arrises (hard = true) in one skin.
function planLoft(hw: number, hd: number, r: number, prof: [number, number, boolean?][], cs = 6, uv?: (p: THREE.Vector3) => [number, number]) {
  const ring = (inset: number, y: number) => rrPts(hw - inset, hd - inset, Math.max(r - inset, 0.0004), cs).map(([x, z]) => v3(x, y, z));
  const rings: THREE.Vector3[][] = [];
  const last = prof.length - 1;
  rings.push(ring(prof[0][0], prof[0][1]).map((p) => v3(0, p.y, 0)));
  prof.forEach(([inset, y, hard], k) => {
    rings.push(ring(inset, y));
    if (hard || k === 0 || k === last) rings.push(ring(inset, y));
  });
  rings.push(ring(prof[last][0], prof[last][1]).map((p) => v3(0, p.y, 0)));
  return loft(rings, uv ?? ((p) => [p.x, p.z]));
}

// A rounded-rectangle plan extruded up from y = 0 to h, with a soft bevel on
// the top and bottom edges. The plan is w (x) by d (z) overall.
function prism(w: number, d: number, r: number, h: number, bevel: number, bevelSeg = 3) {
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - bevel * 2, d - bevel * 2, Math.max(r - bevel, 0.0004)), {
    depth: h - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevelSeg,
    curveSegments: 10,
  });
  g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2);
  return g;
}

// An upright band around a rounded-rectangle plan, its top and bottom edges
// turned in, with UVs that follow the perimeter (in metres x scale), so a
// texture wraps the corners without stretching.
function wrapBand(hw: number, hd: number, r: number, y0: number, y1: number, scale: number) {
  const lip = 0.0025;
  const outline = (inset: number) => {
    const o = rrPts(hw - inset, hd - inset, r - inset, 8);
    o.push(o[0]);
    return o;
  };
  const o = outline(0);
  const cum = [0];
  for (let j = 1; j < o.length; j++) cum.push(cum[j - 1] + Math.hypot(o[j][0] - o[j - 1][0], o[j][1] - o[j - 1][1]));
  const rows: [number, number, number][] = [
    [lip, y0, y0 - lip],
    [0, y0, y0],
    [0, y1, y1],
    [lip, y1, y1 + lip],
  ];
  const g = loft(rows.map(([inset, y]) => outline(inset).map(([x, z]) => v3(x, y, z))));
  const uv = g.attributes.uv;
  rows.forEach(([, , v], i) => o.forEach((_, j) => uv.setXY(i * o.length + j, cum[j] * scale, v * scale)));
  return g;
}

// Give a loft of closed rings UVs that run round the ring (u) and along the
// profile (v) in metres x scale, with a real seam, so a fine texture wraps a
// soft form without swirling. Pass the rings open; the seam is added here.
function skin(rings: THREE.Vector3[][], scale: number) {
  const closed = rings.map((r) => [...r, r[0].clone()]);
  const n = closed[0].length;
  const g = loft(closed);
  const ref = closed.reduce((a, b) => (b[0].distanceTo(b[n >> 1]) > a[0].distanceTo(a[n >> 1]) ? b : a));
  const cum = [0];
  for (let j = 1; j < n; j++) cum.push(cum[j - 1] + ref[j].distanceTo(ref[j - 1]));
  const tiles = Math.max(1, Math.round(cum[n - 1] * scale)) / cum[n - 1];
  const uv = g.attributes.uv;
  const nor = g.attributes.normal;
  let v = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  closed.forEach((r, i) => {
    if (i) v += r[0].distanceTo(closed[i - 1][0]);
    r.forEach((_, j) => uv.setXY(i * n + j, cum[j] * tiles, v * scale));
    // one normal across the seam
    a.fromBufferAttribute(nor, i * n).add(b.fromBufferAttribute(nor, i * n + n - 1)).normalize();
    nor.setXYZ(i * n, a.x, a.y, a.z);
    nor.setXYZ(i * n + n - 1, a.x, a.y, a.z);
  });
  return g;
}

// A cylinder with a knurled side.
function ridgedRing(r: number, h: number, ridges: number, depth: number) {
  const g = new THREE.CylinderGeometry(r, r, h, ridges * 4, 1, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const rr = Math.hypot(x, z);
    if (rr < r * 0.99) continue;
    const a = Math.atan2(z, x);
    const k = (r - (Math.sin(a * ridges) > 0 ? 0 : depth)) / rr;
    p.setXYZ(i, x * k, p.getY(i), z * k);
  }
  g.computeVertexNormals();
  return g;
}

// A knurled dial sitting on y = 0 with a chamfered top.
function dial(r: number, h: number, ridges: number, depth = 0.0004) {
  const cap = 0.0011;
  return merge([put(ridgedRing(r, h - cap, ridges, depth), 0, (h - cap) / 2, 0), put(cyl(r - 0.0013, r - 0.0002, cap, 36), 0, h - cap / 2, 0)]);
}

// With real contact shadows on the desk (scene/home/Contact) these soft patches are only a faint broad shade
// under each thing; without them (a low graphics setting) they are the whole of its grounding.
const blobs = new Set<{ mat: THREE.Material; opacity: number }>();
let blobK = 1;
export function setBlobStrength(k: number) {
  blobK = k;
  blobs.forEach((b) => (b.mat.opacity = b.opacity * k));
}
function Blob({ w, d, opacity = 0.5, y = 0.0006 }: { w: number; d: number; opacity?: number; y?: number }) {
  const m = getMats();
  const mat = useMemo(() => {
    const c = m.blob.clone();
    c.opacity = opacity * blobK;
    return c;
  }, [m, opacity]);
  useEffect(() => {
    const e = { mat, opacity };
    blobs.add(e);
    mat.opacity = opacity * blobK;
    return () => {
      blobs.delete(e);
      mat.dispose();
    };
  }, [mat, opacity]);
  return (
    <mesh name="blob" rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} material={mat} renderOrder={1}>
      {/* the falloff is soft all the way out, so the patch reaches a little past the footprint it was sized for */}
      <planeGeometry args={[w * 1.14, d * 1.14]} />
    </mesh>
  );
}

// ---------- desk ----------

// A solid oak top with a knife-edge chamfer underneath, on tapered, slightly
// splayed oak legs with brass ferrules and a slim apron.
export function Desk() {
  const m = getMats();
  const g = useGeo(() => {
    const top = planLoft(
      DESK.w / 2,
      DESK.d / 2,
      0.032,
      [
        [0.03, -DESK.t],
        [0, -0.013, true],
        [0, -0.0045],
        [0.0005, -0.0022],
        [0.0018, -0.0007],
        [0.0042, 0, true],
      ],
      8,
      // grain runs the length of the top; the edges take a slanted slice of it rather than a stretched one
      (p) => [(p.z / DESK.d) * 0.5 + 0.5 + p.y * 1.1, (p.x / DESK.w) * 2 + p.y * 1.7],
    );
    const under = DESK.top - DESK.t;
    const ax = DESK.w / 2 - 0.125;
    const az = DESK.d / 2 - 0.105;
    const fx = DESK.w / 2 - 0.068;
    const fz = DESK.d / 2 - 0.052;
    const up = v3(0, 1, 0);
    const wood: Geo[] = [];
    const feet: Geo[] = [];
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const a = v3(sx * fx, -0.01, sz * fz);
        const b = v3(sx * ax, under + 0.012, sz * az);
        const dir = b.clone().sub(a);
        const len = dir.length();
        dir.normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
        const leg = cyl(0.0205, 0.0125, len, 20);
        // grain runs along the leg
        const uv = leg.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.07 + 0.3 + (sx + sz * 2) * 0.11, uv.getY(i));
        leg.applyQuaternion(q);
        leg.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        wood.push(leg);
        const fl = 0.045;
        const ferrule = cyl(0.0138, 0.0128, fl, 20);
        ferrule.applyQuaternion(q);
        const c = a.clone().addScaledVector(dir, fl / 2);
        ferrule.translate(c.x, c.y, c.z);
        feet.push(ferrule);
      }
    const railY = under - 0.021;
    const rail = (len: number, k: number) => {
      const r = rbox(len, 0.042, 0.018, 0.003, 2);
      const uv = r.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.05 + k, uv.getX(i) * len * 1.4);
      return r;
    };
    for (const s of [-1, 1]) {
      wood.push(put(rail(ax * 2, 0.2 + s * 0.1), 0, railY, s * az));
      wood.push(put(rail(az * 2, 0.6 + s * 0.1), s * ax, railY, 0, 0, Math.PI / 2));
    }
    return { top, frame: merge(wood), feet: merge(feet) };
  });
  return (
    <group>
      <mesh geometry={g.top} material={m.wood} position={[0, DESK.top, 0]} castShadow receiveShadow />
      <mesh geometry={g.frame} material={m.wood} castShadow receiveShadow />
      <mesh geometry={g.feet} material={m.brass} castShadow />
    </group>
  );
}

// ---------- display ----------

// The tilt stand, measured off the maker's own side and back drawings: a flat
// rectangular foot 16.8 cm deep, a slab arm of the same width rising from
// 2.6 cm inside the foot's back edge and leaning 14 degrees forward to a hinge
// barrel 20.7 cm above the desk, with the round cable pass-through below the
// hinge. Origin: the hinge axis.
const STAND = { w: 0.153, foot: 0.168, footT: 0.007, armT: 0.0095, lean: (14 * Math.PI) / 180, hingeH: 0.207, hingeR: 0.0082, back: 0.026, hole: 0.0165, holeDown: 0.068 };

function standGeometry() {
  const S = STAND;
  const bev = 0.001;
  const over = 0.003;
  const L = (S.hingeH - S.footT) / Math.cos(S.lean) + 0.004;
  const shape = roundedRectShape(S.w - bev * 2, L + over - bev * 2, 0.003);
  const holeY = (L + over) / 2 - over - S.holeDown;
  shape.holes.push(new THREE.Path().absarc(0, holeY, S.hole + bev, 0, Math.PI * 2, true));
  const arm = new THREE.ExtrudeGeometry(shape, { depth: S.armT - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 20 });
  arm.translate(0, over - (L + over) / 2, -(S.armT - bev * 2) / 2);
  arm.rotateX(S.lean);
  const liner = new THREE.CylinderGeometry(S.hole - 0.0006, S.hole - 0.0006, S.armT + 0.0006, 40, 1, true);
  liner.rotateX(Math.PI / 2);
  liner.translate(0, -S.holeDown, 0);
  liner.rotateX(S.lean);
  const baseZ = -(S.hingeH - S.footT) * Math.tan(S.lean);
  const footZ = baseZ - S.back + S.foot / 2;
  const foot = put(prism(S.w, S.foot, 0.0065, S.footT, 0.0012, 3), 0, -S.hingeH, footZ);
  const hinge = put(cyl(S.hingeR, S.hingeR, S.w - 0.004, 32), 0, 0, 0, 0, 0, Math.PI / 2);
  return { g: merge([arm, hinge, foot]), liner, footZ };
}

// A single bright sweep across the display glass as it settles (0..1, <0 = off).
export const glint = { value: -1 };
const glintMat =
  typeof window === "undefined"
    ? null
    : new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -8,
        uniforms: { uG: glint },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uG; varying vec2 vUv;
          void main(){
            if (uG < 0.0 || uG > 1.0) discard;
            float x = vUv.x + vUv.y * 0.45 - (uG * 1.9 - 0.4);
            float a = exp(-x * x * 90.0) * 0.55 + exp(-x * x * 6.0) * 0.08;
            a *= sin(uG * 3.14159);
            gl_FragColor = vec4(vec3(1.0, 0.98, 0.95) * a, 1.0);
          }`,
      });

// A 27-inch studio display: the real 62.3 x 36.2 cm enclosure around the 16:9
// panel, which leaves an even 1.3 cm black border under edge-to-edge glass; a
// flat 2 cm aluminium slab with tight corners and a hairline chamfer, fine
// perforations along the top and bottom edges, four upright ports low on the
// back. No logo.
const ENC = { w: 0.623, h: 0.362, r: 0.0066 };

export function Monitor({ screenMat, screenRef }: { screenMat: THREE.Material; screenRef: RefObject<THREE.Mesh | null> }) {
  const m = getMats();
  useNightLift();
  // the hinge sits just behind the back of the panel, 8.8 cm below its centre
  const hy = DESK.top + STAND.hingeH;
  const zl = -MONITOR.d / 2 - STAND.hingeR - 0.0028;
  const yl = (hy - MONITOR.y + zl * Math.sin(MONITOR.tilt)) / Math.cos(MONITOR.tilt);
  const hz = MONITOR.z + yl * Math.sin(MONITOR.tilt) + zl * Math.cos(MONITOR.tilt);
  const geo = useGeo(() => {
    const stand = standGeometry();
    const bevel = 0.0008;
    const shell = new THREE.ExtrudeGeometry(roundedRectShape(ENC.w - bevel * 2, ENC.h - bevel * 2, ENC.r - bevel), {
      depth: MONITOR.d - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 10,
    });
    shell.translate(0, 0, -(MONITOR.d - bevel * 2) / 2);
    // the short neck between the hinge barrel and the back of the enclosure
    const body = merge([shell, put(rbox(0.058, 0.0125, 0.012, 0.002, 2), 0, yl, -MONITOR.d / 2 - 0.004)]);
    const bz = -MONITOR.d / 2 - 0.00005;
    const ports = merge(Array.from({ length: 4 }, (_, i) => put(rbox(0.0031, 0.0088, 0.0006, 0.00028, 2), 0.173 + i * 0.015, -ENC.h / 2 + 0.026, bz)));
    const vw = ENC.w - 0.05;
    const vents = merge([
      put(new THREE.PlaneGeometry(vw, 0.0085), 0, ENC.h / 2 + 0.00012, -0.0012, -Math.PI / 2),
      put(new THREE.PlaneGeometry(vw, 0.0085), 0, -ENC.h / 2 - 0.00012, -0.0012, Math.PI / 2),
    ]);
    return {
      body,
      ports,
      vents,
      glass: roundedPlane(ENC.w - 0.0024, ENC.h - 0.0024, ENC.r - 0.0012),
      standG: stand.g,
      liner: stand.liner,
      footZ: stand.footZ,
    };
  });
  const fz = MONITOR.d / 2;
  return (
    <group>
      <group position={[0, hy, hz]}>
        <mesh geometry={geo.standG} material={m.anodised} castShadow receiveShadow />
        <mesh geometry={geo.liner} material={m.liner} />
      </group>
      <group position={[0, MONITOR.y, MONITOR.z]} rotation={[MONITOR.tilt, 0, 0]}>
        <mesh geometry={geo.body} material={m.anodised} castShadow receiveShadow />
        <mesh geometry={geo.ports} material={m.rubber} />
        <mesh geometry={geo.vents} material={m.vents} renderOrder={1} />
        <mesh geometry={geo.glass} material={m.glass} position={[0, 0, fz + 0.0004]} renderOrder={1} />
        <mesh ref={screenRef} material={screenMat} position={[0, 0, fz + 0.0009]} renderOrder={1}>
          <planeGeometry args={[MONITOR.aw, MONITOR.ah]} />
        </mesh>
        <mesh geometry={geo.glass} material={m.reflect} position={[0, 0, fz + 0.0014]} renderOrder={2} />
        {glintMat && <mesh geometry={geo.glass} material={glintMat} position={[0, 0, fz + 0.0018]} renderOrder={3} />}
      </group>
      <group position={[0, DESK.top, hz + geo.footZ]}>
        <Blob w={0.2} d={0.215} opacity={0.42} />
      </group>
    </group>
  );
}

// ---------- phone (mobile) ----------

// A current Pro iPhone (flat titanium sides, thin even bezels, the Dynamic Island on its lock face, a camera plateau
// across the full width of the back) leaning back on a small machined-aluminium stand: a low base, a lip the phone
// rests against at the front, and a back rest. Nothing covers the screen: the lip is lower than the bezel.
export function Phone({ screenMat, screenRef }: { screenMat: THREE.Material; screenRef: RefObject<THREE.Mesh | null> }) {
  const m = getMats();
  useNightLift();
  const BASE_H = 0.005;
  const geo = useGeo(() => {
    const bevel = 0.0009;
    const shell = new THREE.ExtrudeGeometry(roundedRectShape(PHONE.w - bevel * 2, PHONE.h - bevel * 2, PHONE.r - bevel), {
      depth: PHONE.d - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 18,
    });
    shell.translate(0, 0, -(PHONE.d - bevel * 2) / 2);
    const bx = PHONE.w / 2 + 0.0002;
    const back = -PHONE.d / 2;
    const top = PHONE.h / 2;
    // buttons: Action and volume on the left, the side button and Camera Control on the right
    const body = merge([
      shell,
      put(rbox(0.0011, 0.007, 0.0028, 0.0005, 2), -bx, top - 0.032, 0),
      put(rbox(0.0011, 0.012, 0.0028, 0.0005, 2), -bx, top - 0.047, 0),
      put(rbox(0.0011, 0.012, 0.0028, 0.0005, 2), -bx, top - 0.062, 0),
      put(rbox(0.0011, 0.017, 0.0028, 0.0005, 2), bx, top - 0.052, 0),
      put(rbox(0.0009, 0.0115, 0.0026, 0.0005, 2), bx, -0.032, 0),
    ]);
    // the camera plateau: a raised band across the whole width near the top of the back
    const plateau = put(rbox(PHONE.w - 0.0016, 0.027, 0.0016, 0.0007, 3), 0, top - 0.0205, back - 0.0006);
    const spots: [number, number][] = [
      [-0.0215, top - 0.0128],
      [-0.0215, top - 0.0282],
      [-0.0075, top - 0.0205],
    ];
    const rings = merge(spots.map(([x, y]) => put(cyl(0.0062, 0.0066, 0.0018, 32), x, y, back - 0.0021, Math.PI / 2)));
    const lenses = merge([
      ...spots.map(([x, y]) => put(cyl(0.0047, 0.0047, 0.0003, 28), x, y, back - 0.0031, Math.PI / 2)),
      // flash and LiDAR at the far end of the plateau
      put(cyl(0.0021, 0.0021, 0.0003, 20), 0.022, top - 0.0145, back - 0.0016, Math.PI / 2),
      put(cyl(0.0024, 0.0024, 0.0003, 20), 0.022, top - 0.0265, back - 0.0016, Math.PI / 2),
    ]);
    return {
      body,
      plateau,
      rings,
      lenses,
      glass: roundedPlane(PHONE.w - 0.0008, PHONE.h - 0.0008, PHONE.r - 0.0004),
      screen: roundedPlane(PHONE.aw, PHONE.ah, PHONE.ar),
      base: prism(0.082, 0.066, 0.014, BASE_H, 0.0014, 4),
      lip: rbox(0.058, 0.0026, 0.0036, 0.0011, 3),
      rest: rbox(0.046, 0.07, 0.004, 0.0016, 3),
    };
  });
  const lean = PHONE.lean;
  // the bottom edge sits on the base: its back corner (the lowest point once leaning) just touches the top
  const y0 = DESK.top + BASE_H + Math.sin(-lean) * (PHONE.d / 2) + 0.0002;
  const cy = y0 + Math.cos(-lean) * (PHONE.h / 2);
  const cz = -Math.sin(-lean) * (PHONE.h / 2);
  const fz = PHONE.d / 2;
  const pz = cz - 0.004;
  // where the front of the bottom edge is, for the lip in front of it
  const lipZ = -0.004 + Math.cos(-lean) * fz + 0.0019;
  return (
    <group>
      <group position={[0, DESK.top, 0]}>
        <mesh geometry={geo.base} material={m.anodised} position={[0, 0, -0.008]} castShadow receiveShadow />
        <mesh geometry={geo.lip} material={m.anodised} position={[0, BASE_H + 0.0013, lipZ]} castShadow />
        <Blob w={0.11} d={0.095} opacity={0.34} />
      </group>
      <group position={[0, cy, pz]} rotation={[lean, 0, 0]}>
        {/* the back rest, behind the lower half of the phone, down into the base */}
        <mesh geometry={geo.rest} material={m.anodised} position={[0, -PHONE.h / 2 + 0.031, -fz - 0.0021]} castShadow />
        <mesh geometry={geo.body} material={m.titanium} castShadow />
        <mesh geometry={geo.plateau} material={m.titanium} />
        <mesh geometry={geo.rings} material={m.steel} />
        <mesh geometry={geo.lenses} material={m.lens} />
        <mesh geometry={geo.glass} material={m.glass} position={[0, 0, fz + 0.0002]} />
        <mesh ref={screenRef} geometry={geo.screen} material={screenMat} position={[0, 0, fz + 0.0004]} />
        <mesh geometry={geo.glass} material={m.reflect} position={[0, 0, fz + 0.0007]} renderOrder={2} />
      </group>
    </group>
  );
}

// ---------- desk objects ----------

// The controller's body without its keys (those live in Piano.tsx, where they
// are played): a low anodised slab, a raised control deck along the back with
// a small display, four pads and four knurled knobs, and a strip of red felt
// behind the keys.
export function KeysBody() {
  const m = getMats();
  const geo = useGeo(() => {
    const deckY = 0.0238;
    const dz = -0.048;
    const body = merge([prism(0.345, 0.135, 0.011, 0.0178, 0.0022, 4), put(prism(0.345, 0.039, 0.011, 0.0128, 0.0018, 3), 0, deckY - 0.0128, dz)]);
    const dark: Geo[] = [put(rbox(0.044, 0.0012, 0.0125, 0.0005, 2), -0.122, deckY + 0.0003, dz)];
    for (let i = 0; i < 4; i++) dark.push(put(cyl(0.0037, 0.004, 0.0016, 24), -0.078 + i * 0.0135, deckY + 0.0008, dz));
    const xs = [0.062, 0.09, 0.118, 0.146];
    const knobs = merge(xs.map((x) => put(dial(0.0074, 0.0088, 22, 0.00045), x, deckY, dz)));
    const marks = merge(xs.map((x, i) => rbox(0.0009, 0.0005, 0.0042, 0.0002, 1).translate(0, 0, -0.0034).rotateY(-0.7 + i * 0.55).translate(x, deckY + 0.0089, dz)));
    const felt = put(rbox(0.3235, 0.003, 0.0022, 0.0008, 1), 0, 0.0186, -0.0287);
    return { body, dark: merge(dark), knobs, marks, felt };
  });
  return (
    <group>
      <mesh geometry={geo.body} material={m.aluDark} castShadow receiveShadow />
      <mesh geometry={geo.dark} material={m.oled} />
      <mesh geometry={geo.knobs} material={m.satin} castShadow />
      <mesh geometry={geo.marks} material={m.keyWhite} />
      <mesh geometry={geo.felt} material={m.ribbon} />
      <Blob w={0.37} d={0.16} opacity={0.46} />
    </group>
  );
}

export function Keys() {
  const m = getMats();
  const geo = useGeo(() => ({
    white: rbox(0.0204, 0.011, 0.092, 0.0016, 2),
    black: rbox(0.0112, 0.012, 0.056, 0.0018, 2),
  }));
  const kw = 0.0215;
  const x0 = (-15 * kw) / 2 + kw / 2;
  const zW = 0.135 / 2 - 0.092 / 2 - 0.004;
  const zB = zW - 0.092 / 2 + 0.056 / 2;
  const blacks = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];
  return (
    <group>
      <KeysBody />
      {Array.from({ length: 15 }, (_, i) => (
        <mesh key={i} geometry={geo.white} material={m.keyWhite} position={[x0 + i * kw, 0.0235, zW]} castShadow receiveShadow />
      ))}
      {blacks.map((i) => (
        <mesh key={`b${i}`} geometry={geo.black} material={m.keyBlack} position={[x0 + i * kw + kw / 2, 0.0285, zB]} castShadow />
      ))}
    </group>
  );
}

// Over-ear headphones after a well-known aluminium pair, proportioned from the
// maker's own front and side views: egg-shaped anodised cups with a domed
// face, knit cushions of the same outline around a perforated inner fabric,
// short polished rods dropping from steel collars into the top of each cup,
// and a soft-touch band whose thick stems fork into two slim rails with an
// open knit canopy slung between them. A crown and a noise button on the
// right cup. With no head between them the cups swing in at the bottom, the
// way the pair really rests. Origin of the parts: the underside of the collars.
const HP = {
  a: 0.0385, // cup half-width (front to back)
  bt: 0.043, // cup height above its widest line
  bb: 0.051, // and below it: the bottom is rounder than the top
  nt: 3.0,
  nb: 2.5,
  cupD: 0.0245,
  cushD: 0.0205,
  x: 0.0775, // collar centres, from the middle
  straight: 0.012, // the stems run straight this far before the arch begins
  rise: 0.082, // collar to the top of the band
  stemR: 0.0047,
  railW: 0.0029, // rail half-width (front to back)
  railT: 0.0021, // rail half-thickness
  gap: 0.0172, // half the distance between the rails
  fork0: 0.03, // arc length from the collar at which the stem starts to open
  fork1: 0.058, // ... and at which the rails run parallel
  collar: 0.003,
  rod: 0.0095,
  toe: 0.31,
  yaw: [0.12, -0.07],
};

function cupPts(inset: number, k = 1, seg = 56) {
  const pts: [number, number][] = [];
  for (let j = 0; j < seg; j++) {
    const t = (j / seg) * Math.PI * 2;
    const c = Math.cos(t);
    const sn = Math.sin(t);
    const up = sn >= 0;
    const e = 2 / (up ? HP.nt : HP.nb);
    pts.push([(HP.a - inset) * k * Math.sign(c) * Math.pow(Math.abs(c), e), ((up ? HP.bt : HP.bb) - inset) * k * Math.sign(sn) * Math.pow(Math.abs(sn), e)]);
  }
  return pts;
}
// top edge of the cup outline at front/back offset u
const cupTopAt = (u: number) => HP.bt * Math.pow(1 - Math.pow(Math.abs(u) / HP.a, HP.nt), 1 / HP.nt);

// The band's centreline from collar to collar, resampled evenly along its length.
function bandLine(n: number) {
  const raw: THREE.Vector3[] = [];
  const B = HP.rise - HP.straight - HP.railT;
  const e = 2 / 2.2;
  for (let i = 0; i < 6; i++) raw.push(v3(-HP.x, (HP.straight * i) / 6, 0));
  for (let i = 0; i <= 200; i++) {
    const th = Math.PI * (1 - i / 200);
    const c = Math.cos(th);
    raw.push(v3(HP.x * Math.sign(c) * Math.pow(Math.abs(c), e), HP.straight + B * Math.pow(Math.sin(th), e), 0));
  }
  for (let i = 5; i >= 0; i--) raw.push(v3(HP.x, (HP.straight * i) / 6, 0));
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + raw[i].distanceTo(raw[i - 1]));
  const total = cum[cum.length - 1];
  const pts: THREE.Vector3[] = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const d = (total * i) / n;
    while (k < raw.length - 2 && cum[k + 1] < d) k++;
    pts.push(raw[k].clone().lerp(raw[k + 1], (d - cum[k]) / Math.max(cum[k + 1] - cum[k], 1e-9)));
  }
  return { pts, total };
}

function bandGeometry() {
  const n = 120;
  const { pts, total } = bandLine(n);
  const centre = v3(0, HP.straight, 0);
  const frames = pts.map((p, i) => {
    const t = pts[Math.min(n, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    // in-plane normal, pointing in toward the head
    const nIn = v3(-t.y, t.x, 0);
    if (nIn.dot(centre.clone().sub(p)) < 0) nIn.negate();
    const d = Math.min((total * i) / n, total - (total * i) / n);
    const u = smooth(clamp01((d - HP.fork0) / (HP.fork1 - HP.fork0)));
    return { p, nIn, d, u };
  });
  const rail = (side: number) => {
    const rings = frames.map(({ p, nIn, u }) => {
      const rn = THREE.MathUtils.lerp(HP.stemR, HP.railT, u);
      const rz = THREE.MathUtils.lerp(HP.stemR, HP.railW, u);
      return Array.from({ length: 12 }, (_, j) => {
        const a = (j / 12) * Math.PI * 2;
        return v3(p.x + nIn.x * rn * Math.cos(a), p.y + nIn.y * rn * Math.cos(a), side * HP.gap * u + rz * Math.sin(a));
      });
    });
    return loft(rings);
  };
  // the canopy: slung between the rails, sagging in toward the head, starting in the crotch of each fork
  const open = frames.filter((f) => HP.gap * f.u > 0.0045);
  const d0 = open[0].d;
  const m = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  open.forEach(({ p, nIn, d, u }, i) => {
    const half = HP.gap * u - HP.railW * 0.5;
    const sag = smooth(clamp01((d - d0) / 0.03));
    for (let j = 0; j <= m; j++) {
      const v = (j / m) * 2 - 1;
      const dip = 0.0004 + 0.0074 * Math.pow(1 - v * v, 0.8) * sag;
      pos.push(p.x + nIn.x * dip, p.y + nIn.y * dip, v * half);
      uv.push(i / (open.length - 1), j / m);
    }
  });
  for (let i = 0; i < open.length - 1; i++)
    for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j;
      idx.push(a, a + m + 1, a + 1, a + 1, a + m + 1, a + m + 2);
    }
  const canopy = new THREE.BufferGeometry();
  canopy.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  canopy.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  canopy.setIndex(idx);
  canopy.computeVertexNormals();
  return { frame: merge([rail(-1), rail(1)]), canopy };
}

export function Headphones() {
  const m = getMats();
  const geo = useGeo(() => {
    const ring = (inset: number, z: number, k = 1) => cupPts(inset, k).map(([x, y]) => v3(x, y, z));
    // every cup part is built with its outer face toward +z and the cushion side at z = 0,
    // then seated so the rod's pivot (top of the cup, mid-depth) is the origin and the face looks along +x
    const seat = <G extends Geo>(g: G) => put(put(g, 0, -HP.bt, -HP.cupD / 2), 0, 0, 0, 0, Math.PI / 2, 0);
    const prof: [number, number][] = [
      [0.0019, 0.0005],
      [0.0002, 0.0028],
      [0, 0.0075],
      [0.0006, 0.0118],
      [0.0024, 0.0158],
      [0.0056, 0.0192],
      [0.0102, 0.0219],
      [0.0156, 0.0236],
    ];
    const cupRings: THREE.Vector3[][] = [ring(0.006, 0, 0.001), ring(0.006, 0)];
    prof.forEach(([i, z]) => cupRings.push(ring(i, z)));
    for (const f of [0.78, 0.56, 0.34, 0.14, 0.001]) cupRings.push(ring(0.0156, 0.0236 + (HP.cupD - 0.0236) * (1 - f * f), f));
    const cup = seat(loft(cupRings));
    // cushion: a pillow ring toward -z with the cup's own outline, open in the middle
    const c0 = 0.0012;
    const cushion = seat(
      skin(
        (
          [
            [0.004, 0.0006],
            [0.0012, -0.0018],
            [0, -0.006],
            [0, -0.0118],
            [0.0016, -0.0162],
            [0.0052, -0.0193],
            [0.01, -HP.cushD],
            [0.0148, -0.0195],
            [0.0184, -0.0166],
            [0.0202, -0.0115],
            [0.0206, -0.004],
          ] as const
        ).map(([i, z]) => ring(c0 + i, z)),
        16,
      ),
    );
    const floor = seat(loft([ring(c0 + 0.0206, -0.0045), ring(c0 + 0.0206, -0.0045, 0.001)], (p) => [p.x * 26, p.y * 26]));
    // crown (toward the back) and noise button (toward the front) on top of the right cup
    const onTop = (g: Geo, u: number, sink: number) => {
      const slope = Math.atan((cupTopAt(u + 0.001) - cupTopAt(u - 0.001)) / 0.002);
      return put(put(g, 0, -sink, 0, 0, 0, slope), u, cupTopAt(u), HP.cupD * 0.47);
    };
    const controls = seat(merge([onTop(dial(0.0052, 0.0047, 30, 0.0003), 0.0195, 0.0007), onTop(rbox(0.0165, 0.0028, 0.0052, 0.0012, 3), -0.0165, 0.0012)]));
    // a microphone slot high on the outer face, lying along the dome
    const slot = seat(put(rbox(0.0058, 0.0004, 0.0015, 0.00015, 1), 0, HP.bt - 0.0041, 0.01765, 0.76));
    // how far the lowest point of a swung-in cup hangs below its pivot
    let low = 0;
    const q = new THREE.Vector3();
    HP.yaw.forEach((yaw, k) => {
      const mat = new THREE.Matrix4().makeRotationZ(k ? HP.toe : -HP.toe).multiply(new THREE.Matrix4().makeRotationY(yaw + (k ? Math.PI : 0)));
      for (const g of [cup, cushion]) {
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) low = Math.min(low, q.fromBufferAttribute(p, i).applyMatrix4(mat).y);
      }
    });
    const drop = HP.collar + HP.rod;
    const steel = merge(
      [-1, 1].flatMap((sd) => [
        put(cyl(0.0056, 0.0056, HP.collar, 28), sd * HP.x, -HP.collar / 2, 0),
        put(cyl(0.0032, 0.0032, HP.rod, 20), sd * HP.x, -HP.collar - HP.rod / 2, 0),
        put(new THREE.SphereGeometry(0.0032, 16, 10), sd * HP.x, -drop, 0),
      ]),
    );
    return { cup, cushion, floor, controls, slot, steel, ...bandGeometry(), lift: drop - low + 0.0002 };
  });
  return (
    <group position={[0, geo.lift, 0.02]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * HP.x, -(HP.collar + HP.rod), 0]} rotation={[0, 0, -s * HP.toe]}>
          <group rotation={[0, s > 0 ? HP.yaw[0] : Math.PI + HP.yaw[1], 0]}>
            <mesh geometry={geo.cup} material={m.cupAlu} castShadow receiveShadow />
            <mesh geometry={geo.cushion} material={m.knit} castShadow />
            <mesh geometry={geo.floor} material={m.earMesh} />
            <mesh geometry={geo.slot} material={m.aluDark} />
            {s > 0 && <mesh geometry={geo.controls} material={m.cupAlu} castShadow />}
          </group>
        </group>
      ))}
      <mesh geometry={geo.steel} material={m.steel} castShadow />
      <mesh geometry={geo.frame} material={m.softTouch} castShadow />
      <mesh geometry={geo.canopy} material={m.canopy} castShadow />
    </group>
  );
}

export function HeadphonesBlob() {
  return (
    <group position={[0, 0, 0.02]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.056, 0, 0]}>
          <Blob w={0.09} d={0.125} opacity={0.5} />
        </group>
      ))}
      <Blob w={0.26} d={0.13} opacity={0.14} />
    </group>
  );
}

// A fixed-lens rangefinder-style camera: silver top and base plates around a
// leatherette band, a shutter-speed dial and an exposure-compensation dial, a
// threaded shutter button in its collar, a hot shoe, the viewfinder window, a
// compact lens with aperture and focus rings and a coated front element,
// strap lugs with their rings. Front is +z; the grip side is -x.
const CAM = { w: 0.128, d: 0.034, r: 0.0088, base: 0.0055, band: 0.048, top: 0.0665, lx: 0.008, ly: 0.0295 };

export function CameraBody() {
  const m = getMats();
  const geo = useGeo(() => {
    const front = CAM.d / 2;
    const T = CAM.top;
    const HPI = Math.PI / 2;
    // along the lens axis (lathe y -> camera +z)
    // (a compact pancake: the barrel stands 2.5 cm off the body)
    const lensPut = <G extends Geo>(g: G) => put(g.scale(1, 0.82, 1) as G, CAM.lx, CAM.ly, front, HPI);
    const lathe = (pts: [number, number][], seg = 64) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

    const silver: Geo[] = [
      prism(CAM.w, CAM.d, CAM.r, CAM.base, 0.0013),
      put(prism(CAM.w, CAM.d, CAM.r, T - CAM.band, 0.0016, 4), 0, CAM.band, 0),
      // lens barrel
      lensPut(
        lathe([
          [0.0262, 0],
          [0.0262, 0.002],
          [0.025, 0.003],
          [0.0228, 0.0032],
          [0.0228, 0.0235],
          [0.0234, 0.024],
          [0.0234, 0.029],
          [0.0228, 0.03],
          [0.0212, 0.0302],
          [0.0208, 0.0295],
        ]),
      ),
      lensPut(put(ridgedRing(0.0238, 0.006, 64, 0.00035), 0, 0.0074, 0)),
      lensPut(put(ridgedRing(0.0241, 0.0095, 96, 0.0003), 0, 0.0178, 0)),
      ...[-1, 1].map((s) => lensPut(put(rbox(0.0052, 0.0056, 0.0085, 0.0014, 2), s * 0.0247, 0.0074, 0))),
      // top plate: shutter-speed dial, exposure compensation, shutter collar and button, hot shoe
      put(dial(0.0113, 0.0078, 40, 0.0005), -0.0195, T, -0.002),
      put(cyl(0.0034, 0.0034, 0.0006, 20), -0.0195, T + 0.0081, -0.002),
      put(dial(0.0093, 0.0056, 34, 0.00045), -0.0505, T, -0.0072),
      put(cyl(0.0068, 0.0071, 0.003, 32), -0.0405, T + 0.0015, 0.0088),
      put(rbox(0.0034, 0.0022, 0.0048, 0.0009, 2), -0.0405, T + 0.0012, 0.0162),
      put(cyl(0.0043, 0.0047, 0.0028, 28), -0.0405, T + 0.0044, 0.0088),
      put(rbox(0.0205, 0.0012, 0.0195, 0.0005, 1), CAM.lx, T + 0.0005, -0.0025),
      ...[-1, 1].flatMap((s) => [
        put(rbox(0.0022, 0.0028, 0.0195, 0.0006, 1), CAM.lx + s * 0.0098, T + 0.0019, -0.0025),
        put(rbox(0.0046, 0.0009, 0.0195, 0.0004, 1), CAM.lx + s * 0.0086, T + 0.0034, -0.0025),
      ]),
      // viewfinder lever by the lens, window surround
      put(cyl(0.0042, 0.0042, 0.002, 24), -0.0235, 0.0405, front + 0.0008, HPI),
      put(rbox(0.0024, 0.0095, 0.0022, 0.0009, 2), -0.0235, 0.0368, front + 0.0018, 0, 0, 0.35),
      put(rbox(0.0262, 0.0146, 0.0012, 0.0005, 2), 0.0435, 0.0573, front),
      // strap lugs
      ...[-1, 1].map((s) => put(cyl(0.0021, 0.0021, 0.0042, 14), s * (CAM.w / 2 + 0.0012), 0.0575, 0.003, 0, 0, HPI)),
    ];
    const rings = merge([-1, 1].map((s) => put(new THREE.TorusGeometry(0.0046, 0.00065, 6, 22), s * (CAM.w / 2 + 0.0042), 0.0535, 0.003, 0, HPI, s * -0.42)));

    const grip = put(rbox(0.015, 0.037, 0.0085, 0.0041, 4), -0.0525, 0.0275, front + 0.0012);
    for (let i = 0, gp = grip.attributes.position, gu = grip.attributes.uv; i < gp.count; i++) gu.setXY(i, (gp.getX(i) - gp.getZ(i)) * 11, gp.getY(i) * 11);
    const leather = merge([
      wrapBand(CAM.w / 2 + 0.0003, CAM.d / 2 + 0.0003, CAM.r + 0.0003, CAM.base - 0.0003, CAM.band + 0.0003, 11),
      // a low grip under the fingers, its grain at the same scale
      grip,
    ]);

    const black = merge([
      // inside of the lens front, sloping down to the glass
      lensPut(
        lathe([
          [0.021, 0.0297],
          [0.0203, 0.029],
          [0.0201, 0.0275],
          [0.0165, 0.0258],
          [0.0142, 0.0254],
          [0.014, 0.0245],
        ]),
      ),
      // the release thread, eyepiece, a thumb dial on the back
      put(cyl(0.0017, 0.0017, 0.0004, 16), -0.0405, T + 0.0059, 0.0088),
      put(rbox(0.022, 0.0155, 0.0046, 0.0019, 3), 0.0435, 0.0573, -front - 0.0012),
      put(ridgedRing(0.0052, 0.0034, 18, 0.0004), -0.046, 0.054, -front + 0.0004),
    ]);

    const capR = 0.03;
    const capA = Math.asin(0.0143 / capR);
    const glassParts: Geo[] = [
      lensPut(put(new THREE.SphereGeometry(capR, 40, 10, 0, Math.PI * 2, 0, capA), 0, 0.0249 - capR * Math.cos(capA), 0)),
      put(rbox(0.0236, 0.012, 0.0012, 0.0005, 2), 0.0435, 0.0573, front + 0.0004),
      put(cyl(0.0027, 0.0027, 0.0008, 20), 0.0185, 0.0585, front + 0.0001, HPI),
      put(rbox(0.016, 0.0095, 0.001, 0.0004, 1), 0.0435, 0.0573, -front - 0.0031),
    ];
    const lcd = put(rbox(0.074, 0.0465, 0.0012, 0.0005, 2), 0.006, 0.0268, -front - 0.0001);
    return { silver: merge(silver), rings, leather, black, glass: merge(glassParts), lcd };
  });
  return (
    <group>
      <mesh geometry={geo.silver} material={m.satin} castShadow receiveShadow />
      <mesh geometry={geo.rings} material={m.steel} />
      <mesh geometry={geo.leather} material={m.leather} castShadow receiveShadow />
      <mesh geometry={geo.black} material={m.rubber} castShadow />
      <mesh geometry={geo.glass} material={m.lens} />
      <mesh geometry={geo.lcd} material={m.glass} />
      <group position={[0, 0, 0.006]}>
        <Blob w={0.165} d={0.1} opacity={0.5} />
      </group>
    </group>
  );
}

export function Sketchbook() {
  const m = getMats();
  const geo = useMemo(
    () => ({
      board: rbox(0.212, 0.0026, 0.152, 0.0011, 2),
      spine: rbox(0.007, 0.0168, 0.152, 0.0032, 3),
    }),
    [],
  );
  return (
    <group>
      <mesh geometry={geo.board} material={m.linen} position={[0, 0.0013, 0]} castShadow receiveShadow />
      <mesh material={m.pages} position={[0.002, 0.0078, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.204, 0.0104, 0.146]} />
      </mesh>
      <mesh geometry={geo.board} material={m.linen} position={[0, 0.0143, 0]} castShadow receiveShadow />
      <mesh geometry={geo.spine} material={m.linen} position={[-0.104, 0.0078, 0]} castShadow />
      <mesh material={m.elastic} position={[0.084, 0.0159, 0]}>
        <boxGeometry args={[0.0045, 0.0006, 0.1525]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={m.elastic} position={[0.084, 0.008, s * 0.0763]}>
          <boxGeometry args={[0.0045, 0.0162, 0.0006]} />
        </mesh>
      ))}
      <group position={[-0.005, 0.0198, 0.012]} rotation={[0, 0.42, 0]}>
        <mesh material={m.pencil} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.0037, 0.0037, 0.15, 6]} />
        </mesh>
        <mesh material={m.pencilWood} position={[0.084, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.001, 0.0035, 0.018, 18]} />
        </mesh>
        <mesh material={m.graphite} position={[0.0948, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.001, 0.0038, 12]} />
        </mesh>
      </group>
      <Blob w={0.24} d={0.18} opacity={0.32} />
    </group>
  );
}

export function Book() {
  const m = getMats();
  // +x pages, -x spine, +y cover, -y back, +z/-z pages
  const mats = useMemo(() => [m.pages, m.paperBlack, m.cover, m.paperBlack, m.pages, m.pages], [m]);
  return (
    <group>
      <mesh material={mats} position={[0, 0.0105, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.135, 0.021, 0.205]} />
      </mesh>
      <Blob w={0.16} d={0.23} opacity={0.32} />
    </group>
  );
}
