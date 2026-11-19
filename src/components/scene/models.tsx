"use client";

import { useEffect, useMemo, type RefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DESK, MONITOR, PHONE } from "./shared";
import { getMats } from "./materials";

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

// Superellipse outline (a squircle for n > 2), counter-clockwise, as [u, v] pairs.
function sePts(a: number, b: number, n: number, seg = 48) {
  const pts: [number, number][] = [];
  const e = 2 / n;
  for (let j = 0; j < seg; j++) {
    const t = (j / seg) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    pts.push([a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e)]);
  }
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

function Blob({ w, d, opacity = 0.5, y = 0.0006 }: { w: number; d: number; opacity?: number; y?: number }) {
  const m = getMats();
  const mat = useMemo(() => {
    const c = m.blob.clone();
    c.opacity = opacity;
    return c;
  }, [m, opacity]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} material={mat} renderOrder={1}>
      <planeGeometry args={[w, d]} />
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

// Studio-style tilt stand: one bent slab of aluminium. A flat foot with
// rounded front corners, a tight bend at the back, and an arm that leans
// forward up to the hinge. Built as a loft along the bend, so the edges stay
// rounded all the way round. Origin: desk surface, under the bend's centre.
function standGeometry(topY: number) {
  const t = 0.009;
  const R = 0.017;
  const W = 0.18;
  const planR = 0.013;
  const lean = (10 * Math.PI) / 180;
  const y0 = t / 2;
  const turn = Math.PI / 2 + lean;
  const Lf = 0.168 - R - t / 2;
  const a1 = -Math.PI / 2 - turn;
  const end: [number, number] = [R * Math.cos(a1), y0 + R + R * Math.sin(a1)];
  const dir: [number, number] = [Math.sin(lean), Math.cos(lean)];
  const La = (topY - end[1]) / dir[1];
  const total = Lf + R * turn + La;
  // centreline point and tangent, as (z, y)
  const at = (s: number): [number, number, number, number] => {
    if (s < Lf) return [Lf - s, y0, -1, 0];
    if (s < Lf + R * turn) {
      const a = -Math.PI / 2 - (s - Lf) / R;
      return [R * Math.cos(a), y0 + R + R * Math.sin(a), Math.sin(a), -Math.cos(a)];
    }
    const u = s - Lf - R * turn;
    return [end[0] + dir[0] * u, end[1] + dir[1] * u, dir[0], dir[1]];
  };
  const ss: number[] = [];
  for (let k = 0; k <= 8; k++) ss.push(planR * (1 - Math.cos((k / 8) * (Math.PI / 2))));
  for (let k = 1; k <= 3; k++) ss.push(planR + (Lf - planR) * (k / 3));
  for (let k = 1; k <= 16; k++) ss.push(Lf + R * turn * (k / 16));
  for (let k = 1; k <= 4; k++) ss.push(Lf + R * turn + La * (k / 4));
  const ringAt = (s: number, flat = false) => {
    const [z, y, tz, ty] = at(s);
    const e = Math.min(s, planR);
    const hw = W / 2 - planR + Math.sqrt(Math.max(0, planR * planR - (planR - e) * (planR - e)));
    return rrPts(hw, t / 2, 0.0024, 3).map(([u, v]) => (flat ? v3(u, y, z) : v3(u, y + v * tz, z + v * -ty)));
  };
  const rings: THREE.Vector3[][] = [ringAt(0, true), ringAt(0)];
  ss.forEach((s) => rings.push(ringAt(s)));
  rings.push(ringAt(total), ringAt(total, true));
  const top = at(total);
  return { g: loft(rings), top: { z: top[0], y: top[1] }, footMid: Lf / 2 };
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

// A 27-inch studio display: a flat 2 cm aluminium slab with softly rounded
// corners, edge-to-edge glass with a thin uniform black border, vent slots
// along the top and bottom edges, ports low on the back. No logo.
const STAND_TOP = MONITOR.y - DESK.top - 0.055;

export function Monitor({ screenMat, screenRef }: { screenMat: THREE.Material; screenRef: RefObject<THREE.Mesh | null> }) {
  const m = getMats();
  const geo = useGeo(() => {
    const stand = standGeometry(STAND_TOP);
    const bevel = 0.0011;
    const cr = 0.0105;
    const body = new THREE.ExtrudeGeometry(roundedRectShape(MONITOR.w - bevel * 2, MONITOR.h - bevel * 2, cr - bevel), {
      depth: MONITOR.d - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 10,
    });
    body.translate(0, 0, -(MONITOR.d - bevel * 2) / 2);
    const dark: Geo[] = [];
    for (const s of [-1, 1]) dark.push(put(rbox(MONITOR.w * 0.8, 0.0006, 0.0075, 0.00025, 1), 0, s * (MONITOR.h / 2 + 0.00005), -0.0012));
    const bz = -MONITOR.d / 2 - 0.00005;
    for (let i = 0; i < 4; i++) dark.push(put(rbox(0.0092, 0.0036, 0.0006, 0.00025, 1), -0.235 + i * 0.0165, -0.118, bz));
    dark.push(put(cyl(0.0085, 0.0085, 0.0006, 28), 0.215, -0.118, bz, Math.PI / 2));
    return {
      body,
      dark: merge(dark),
      glass: roundedPlane(MONITOR.w - 0.0016, MONITOR.h - 0.0016, cr - 0.0008),
      hinge: put(cyl(0.0118, 0.0118, 0.164, 28), 0, 0, 0, 0, 0, Math.PI / 2),
      standG: stand.g,
      standTop: stand.top,
      footMid: stand.footMid,
    };
  });
  // the hinge sits just behind the back of the panel; the arm's top meets it there
  const hy = DESK.top + STAND_TOP;
  const yl = (hy - MONITOR.y) / Math.cos(MONITOR.tilt);
  const hz = MONITOR.z + yl * Math.sin(MONITOR.tilt) - (MONITOR.d / 2) * Math.cos(MONITOR.tilt) - 0.0095;
  const standZ = hz - geo.standTop.z;
  const fz = MONITOR.d / 2;
  return (
    <group>
      <mesh geometry={geo.standG} material={m.anodised} position={[0, DESK.top, standZ]} castShadow receiveShadow />
      <mesh geometry={geo.hinge} material={m.anodised} position={[0, hy, hz]} castShadow />
      <group position={[0, MONITOR.y, MONITOR.z]} rotation={[MONITOR.tilt, 0, 0]}>
        <mesh geometry={geo.body} material={m.anodised} castShadow receiveShadow />
        <mesh geometry={geo.dark} material={m.rubber} />
        <mesh geometry={geo.glass} material={m.glass} position={[0, 0, fz + 0.0002]} />
        <mesh ref={screenRef} material={screenMat} position={[0, 0, fz + 0.0005]}>
          <planeGeometry args={[MONITOR.aw, MONITOR.ah]} />
        </mesh>
        <mesh geometry={geo.glass} material={m.reflect} position={[0, 0, fz + 0.0009]} renderOrder={2} />
        {glintMat && <mesh geometry={geo.glass} material={glintMat} position={[0, 0, fz + 0.0012]} renderOrder={3} />}
      </group>
      <group position={[0, DESK.top, standZ + geo.footMid]}>
        <Blob w={0.25} d={0.23} opacity={0.3} />
      </group>
    </group>
  );
}

// ---------- phone (mobile) ----------

// A titanium phone standing in the slot of a small machined-aluminium dock.
export function Phone({ screenMat, screenRef }: { screenMat: THREE.Material; screenRef: RefObject<THREE.Mesh | null> }) {
  const m = getMats();
  const geo = useGeo(() => {
    const bevel = 0.0013;
    const shell = new THREE.ExtrudeGeometry(roundedRectShape(PHONE.w - bevel * 2, PHONE.h - bevel * 2, PHONE.r - bevel), {
      depth: PHONE.d - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 16,
    });
    shell.translate(0, 0, -(PHONE.d - bevel * 2) / 2);
    const bx = PHONE.w / 2 + 0.0003;
    const back = -PHONE.d / 2;
    // side buttons and the camera plateau on the back
    const body = merge([
      shell,
      put(rbox(0.0014, 0.02, 0.0032, 0.0006, 2), bx, 0.018, 0),
      put(rbox(0.0014, 0.011, 0.0032, 0.0006, 2), -bx, 0.03, 0),
      put(rbox(0.0014, 0.011, 0.0032, 0.0006, 2), -bx, 0.015, 0),
      put(rbox(0.0014, 0.006, 0.0032, 0.0006, 2), -bx, 0.045, 0),
      put(rbox(0.035, 0.036, 0.0026, 0.0011, 3), 0.0135, PHONE.h / 2 - 0.0225, back - 0.0005),
    ]);
    const spots: [number, number][] = [
      [0.0215, PHONE.h / 2 - 0.0135],
      [0.0215, PHONE.h / 2 - 0.0315],
      [0.0065, PHONE.h / 2 - 0.0225],
    ];
    const rings = merge(spots.map(([x, y]) => put(cyl(0.0074, 0.0078, 0.0022, 28), x, y, back - 0.0027, Math.PI / 2)));
    const lenses = merge(spots.map(([x, y]) => put(cyl(0.0056, 0.0056, 0.0003, 24), x, y, back - 0.0039, Math.PI / 2)));
    return {
      body,
      rings,
      lenses,
      glass: roundedPlane(PHONE.w - 0.0012, PHONE.h - 0.0012, PHONE.r - 0.0006),
      screen: roundedPlane(PHONE.aw, PHONE.ah, PHONE.ar),
      dock: prism(0.086, 0.066, 0.016, 0.0195, 0.003, 4),
    };
  });
  const y0 = DESK.top + 0.0105;
  const lean = PHONE.lean;
  const cy = y0 + Math.cos(-lean) * (PHONE.h / 2);
  const cz = -Math.sin(-lean) * (PHONE.h / 2);
  const fz = PHONE.d / 2;
  return (
    <group>
      <group position={[0, DESK.top, 0]}>
        <mesh geometry={geo.dock} material={m.anodised} position={[0, 0, -0.011]} castShadow receiveShadow />
        <Blob w={0.12} d={0.1} opacity={0.34} />
      </group>
      <group position={[0, cy, cz - 0.004]} rotation={[lean, 0, 0]}>
        <mesh geometry={geo.body} material={m.titanium} castShadow />
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
      <Blob w={0.38} d={0.17} opacity={0.35} />
    </group>
  );
}

// Over-ear headphones after a well-known aluminium pair: squircle cups with a
// gently domed face, knit cushions, polished telescoping rods, a soft-touch
// frame whose two rails open into a loop, and a knit canopy stretched between
// them. A crown and a button on the right cup. They stand on the cups, the
// band leaning back a little the way they come to rest.
const HP = {
  a: 0.039, // cup half-width (front to back)
  b: 0.048, // cup half-height
  n: 3.3, // squircle exponent
  cupD: 0.025,
  cushD: 0.0205,
  cupX: 0.058, // where cup meets cushion, from the centre
  armX: 0.0685,
  spring: 0.036, // the arch starts this far above the cup top
  top: 0.187, // overall height
  railZ: 0.0195,
  railR: 0.003,
  lean: -0.06,
  yaw: 0.07,
};
const HP_PIVOT = HP.b * 2 - 0.003;
const HP_RISE = HP.top - HP_PIVOT - HP.spring - HP.railR;

// the band's centreline over t = 0..1, in the band's own frame (pivot at the cup tops)
function archAt(t: number) {
  const th = Math.PI * t;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const e = 2 / 2.6;
  return v3(HP.armX * Math.sign(c) * Math.pow(Math.abs(c), e), HP.spring + HP_RISE * Math.pow(Math.abs(s), e), 0);
}
// half the gap between the two rails: they leave the stem together and open into a loop
function railGap(t: number) {
  const u = Math.min(1, Math.min(t, 1 - t) / 0.075);
  return HP.railZ * Math.sqrt(1 - (1 - u) * (1 - u));
}

function canopyGeometry() {
  const n = 56;
  const m = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const t0 = 0.03;
  for (let i = 0; i <= n; i++) {
    const t = t0 + (1 - 2 * t0) * (i / n);
    const p = archAt(t);
    const q = archAt(t + 0.002).sub(archAt(t - 0.002)).normalize();
    // inward normal of the arch (toward the head)
    const nx = -q.y;
    const ny = q.x;
    const half = Math.max(0.001, railGap(t) - 0.0012);
    for (let j = 0; j <= m; j++) {
      const v = (j / m) * 2 - 1;
      const dip = 0.0008 + 0.0042 * (1 - v * v) * Math.sin(Math.PI * (i / n));
      pos.push(p.x + nx * dip, p.y + ny * dip, v * half);
      uv.push(i / n, j / m);
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j;
      idx.push(a, a + m + 1, a + 1, a + 1, a + m + 1, a + m + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// top edge of the cup outline at front/back offset u
const cupTopAt = (u: number) => HP.b * Math.pow(1 - Math.pow(Math.abs(u) / HP.a, HP.n), 1 / HP.n);

export function Headphones() {
  const m = getMats();
  const geo = useGeo(() => {
    const ring = (inset: number, z: number, k = 1) => sePts((HP.a - inset) * k, (HP.b - inset) * k, HP.n, 56).map(([x, y]) => v3(x, y, z));
    // cup: built with its outer face toward +z, the cushion side at z = 0
    const cupRings: THREE.Vector3[][] = [ring(0.006, 0, 0.001), ring(0.006, 0)];
    (
      [
        [0.0018, 0.0005],
        [0, 0.003],
        [0, 0.011],
        [0.0006, 0.0152],
        [0.0026, 0.0193],
        [0.0064, 0.0226],
        [0.0122, 0.0245],
      ] as const
    ).forEach(([i, z]) => cupRings.push(ring(i, z)));
    for (const f of [0.8, 0.6, 0.4, 0.2, 0.001]) cupRings.push(ring(0.0122, 0.0245 + (HP.cupD - 0.0245) * (1 - f * f), f));
    const cup = loft(cupRings);
    // cushion: a pillow ring toward -z, open in the middle
    const c0 = 0.0026;
    const cushion = loft(
      (
        [
          [0.004, 0.0006],
          [0.0012, -0.0018],
          [0, -0.006],
          [0, -0.012],
          [0.0018, -0.0166],
          [0.0056, -0.0195],
          [0.0105, -HP.cushD],
          [0.0155, -0.0196],
          [0.019, -0.0165],
          [0.0204, -0.011],
          [0.0204, -0.0025],
        ] as const
      ).map(([i, z]) => ring(c0 + i, z)),
      (p) => [p.x * 9 + p.z * 9, p.y * 9],
    );
    const floor = loft([ring(c0 + 0.0204, -0.0035), ring(c0 + 0.0204, -0.0035, 0.001)]);
    // crown and noise button on the top of the right cup
    const onTop = (g: Geo, u: number, sink: number) => {
      const slope = Math.atan((cupTopAt(u + 0.001) - cupTopAt(u - 0.001)) / 0.002);
      return put(put(g, 0, -sink, 0, 0, 0, slope), u, cupTopAt(u), HP.cupD * 0.46);
    };
    const controls = merge([onTop(dial(0.0049, 0.0046, 20, 0.0003), 0.0175, 0.0006), onTop(rbox(0.0175, 0.003, 0.0056, 0.0013, 3), -0.014, 0.0009)]);
    const railPts = (z: number) => Array.from({ length: 73 }, (_, i) => archAt(i / 72).setZ(z * railGap(i / 72)));
    const frame = merge([
      ...[-1, 1].map((z) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts(z)), 96, HP.railR, 8, false)),
      ...[-1, 1].map((s) => put(new THREE.CapsuleGeometry(0.0046, 0.013, 6, 16), s * HP.armX, HP.spring - 0.0055, 0)),
    ]);
    const steel = merge([
      ...[-1, 1].map((s) => put(cyl(0.0027, 0.0027, 0.03, 16), s * HP.armX, 0.012, 0)),
      ...[-1, 1].map((s) => put(cyl(0.0044, 0.0048, 0.0032, 20), s * HP.armX, 0.0036, 0)),
    ]);
    return { cup, cushion, floor, controls, frame, steel, canopy: canopyGeometry() };
  });
  return (
    <group position={[0, 0, 0.02]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * HP.cupX, HP.b, 0]} rotation={[0, s * (Math.PI / 2 - HP.yaw), 0]}>
          <mesh geometry={geo.cup} material={m.anodised} castShadow receiveShadow />
          <mesh geometry={geo.cushion} material={m.knit} castShadow />
          <mesh geometry={geo.floor} material={m.meshDark} />
          {s > 0 && <mesh geometry={geo.controls} material={m.anodised} castShadow />}
        </group>
      ))}
      <group position={[0, HP_PIVOT, 0]} rotation={[HP.lean, 0, 0]}>
        <mesh geometry={geo.steel} material={m.steel} castShadow />
        <mesh geometry={geo.frame} material={m.softTouch} castShadow />
        <mesh geometry={geo.canopy} material={m.canopy} castShadow />
      </group>
    </group>
  );
}

export function HeadphonesBlob() {
  return (
    <group position={[0, 0, 0.02]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (HP.cupX + 0.004), 0, 0]}>
          <Blob w={0.1} d={0.14} opacity={0.36} />
        </group>
      ))}
      <Blob w={0.3} d={0.13} opacity={0.14} />
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
    const lensPut = <G extends Geo>(g: G) => put(g, CAM.lx, CAM.ly, front, HPI);
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
      lensPut(put(ridgedRing(0.024, 0.006, 40, 0.0007), 0, 0.0074, 0)),
      lensPut(put(ridgedRing(0.0242, 0.0095, 72, 0.0005), 0, 0.0178, 0)),
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

    const leather = merge([
      put(prism(CAM.w + 0.0006, CAM.d + 0.0006, CAM.r + 0.0003, CAM.band - CAM.base + 0.0006, 0), 0, CAM.base - 0.0003, 0),
      // a low grip under the fingers
      put(rbox(0.015, 0.037, 0.0085, 0.0041, 4), -0.0525, 0.0275, front + 0.0012),
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
        <Blob w={0.17} d={0.115} opacity={0.4} />
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
