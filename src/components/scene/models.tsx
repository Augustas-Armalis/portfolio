"use client";

import { useMemo, type RefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DESK, MONITOR, PHONE } from "./shared";
import { getMats } from "./materials";

// Everything here is modelled in code at real scale (metres): bevelled boxes,
// extruded profiles and lathes with PBR materials. No logos anywhere.

const rbox = (w: number, h: number, d: number, r: number, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

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

function Blob({ w, d, opacity = 0.5, y = 0.0006 }: { w: number; d: number; opacity?: number; y?: number }) {
  const m = getMats();
  const mat = useMemo(() => {
    const c = m.blob.clone();
    c.opacity = opacity;
    return c;
  }, [m, opacity]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} material={mat} renderOrder={1}>
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}

// ---------- desk ----------

export function Desk() {
  const m = getMats();
  const g = useMemo(() => {
    const legH = DESK.top - DESK.t;
    return { top: rbox(DESK.w, DESK.t, DESK.d, 0.012, 6), leg: rbox(0.032, legH, 0.032, 0.006, 3), legH };
  }, []);
  const lx = DESK.w / 2 - 0.06;
  const lz = DESK.d / 2 - 0.06;
  const railY = DESK.top - DESK.t - 0.024;
  return (
    <group>
      <mesh geometry={g.top} material={m.wood} position={[0, DESK.top - DESK.t / 2, 0]} castShadow receiveShadow />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={g.leg} material={m.frame} position={[sx * lx, g.legH / 2, sz * lz]} castShadow />))}
      {[-1, 1].map((sz) => (
        <mesh key={`r${sz}`} material={m.frame} position={[0, railY, sz * lz]} castShadow>
          <boxGeometry args={[lx * 2, 0.044, 0.018]} />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`s${sx}`} material={m.frame} position={[sx * lx, railY, 0]} castShadow>
          <boxGeometry args={[0.018, 0.044, lz * 2]} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- display ----------

// Studio-style stand: one bent aluminium sheet, a foot on the desk curving up
// into an arm that leans back to the hinge.
function standGeometry() {
  const t = 0.0085;
  const R = 0.034;
  const pts: [number, number][] = [];
  const zc = -0.055;
  const y0 = t / 2;
  for (let i = 0; i <= 6; i++) pts.push([0.05 + (zc - 0.05) * (i / 6), y0]);
  const a0 = -Math.PI / 2;
  const a1 = -Math.PI / 2 - (78 * Math.PI) / 180;
  for (let i = 1; i <= 14; i++) {
    const a = a0 + (a1 - a0) * (i / 14);
    pts.push([zc + R * Math.cos(a), y0 + R + R * Math.sin(a)]);
  }
  const [ez, ey] = pts[pts.length - 1];
  const dir: [number, number] = [-Math.sin((12 * Math.PI) / 180), Math.cos((12 * Math.PI) / 180)];
  const L = (MONITOR.y - DESK.top - 0.03 - ey) / dir[1];
  for (let i = 1; i <= 6; i++) pts.push([ez + dir[0] * L * (i / 6), ey + dir[1] * L * (i / 6)]);
  // offset the centreline both ways into a closed outline
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l;
    const ny = tx / l;
    left.push([p[0] + (nx * t) / 2, p[1] + (ny * t) / 2]);
    right.push([p[0] - (nx * t) / 2, p[1] - (ny * t) / 2]);
  });
  const shape = new THREE.Shape();
  // shape x = -z; after the rotation below the extrusion runs along x
  shape.moveTo(-left[0][0], left[0][1]);
  left.forEach((p) => shape.lineTo(-p[0], p[1]));
  right.reverse().forEach((p) => shape.lineTo(-p[0], p[1]));
  shape.closePath();
  const width = 0.15;
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2);
  const top = pts[pts.length - 1];
  return { g, top: { z: top[0], y: top[1] } };
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

export function Monitor({ screenMat, screenRef }: { screenMat: THREE.Material; screenRef: RefObject<THREE.Mesh | null> }) {
  const m = getMats();
  const geo = useMemo(() => {
    const stand = standGeometry();
    return {
      body: rbox(MONITOR.w, MONITOR.h, MONITOR.d, 0.0045, 4),
      glass: roundedPlane(MONITOR.w - 0.0018, MONITOR.h - 0.0018, 0.0036),
      stand,
    };
  }, []);
  const back = MONITOR.z - MONITOR.d / 2;
  // stand origin so the top of its arm meets the back of the panel
  const standZ = back - geo.stand.top.z - 0.006;
  const fz = MONITOR.d / 2;
  return (
    <group>
      <group position={[0, DESK.top, standZ]}>
        <mesh geometry={geo.stand.g} material={m.alu} castShadow receiveShadow />
      </group>
      <group position={[0, MONITOR.y, MONITOR.z]} rotation={[MONITOR.tilt, 0, 0]}>
        <mesh geometry={geo.body} material={m.alu} castShadow receiveShadow />
        <mesh geometry={geo.glass} material={m.glass} position={[0, 0, fz + 0.0002]} />
        <mesh ref={screenRef} material={screenMat} position={[0, 0, fz + 0.0005]}>
          <planeGeometry args={[MONITOR.aw, MONITOR.ah]} />
        </mesh>
        <mesh geometry={geo.glass} material={m.reflect} position={[0, 0, fz + 0.0009]} renderOrder={2} />
        {glintMat && <mesh geometry={geo.glass} material={glintMat} position={[0, 0, fz + 0.0012]} renderOrder={3} />}
      </group>
      <group position={[0, DESK.top, standZ - 0.03]}>
        <Blob w={0.2} d={0.22} opacity={0.3} />
      </group>
    </group>
  );
}

// ---------- phone (mobile) ----------

export function Phone({ screenMat, screenRef }: { screenMat: THREE.Material; screenRef: RefObject<THREE.Mesh | null> }) {
  const m = getMats();
  const geo = useMemo(() => {
    const bevel = 0.0013;
    const body = new THREE.ExtrudeGeometry(roundedRectShape(PHONE.w - bevel * 2, PHONE.h - bevel * 2, PHONE.r - bevel), {
      depth: PHONE.d - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 4,
      curveSegments: 16,
    });
    body.translate(0, 0, -(PHONE.d - bevel * 2) / 2);
    return {
      body,
      glass: roundedPlane(PHONE.w - 0.0012, PHONE.h - 0.0012, PHONE.r - 0.0006),
      screen: roundedPlane(PHONE.aw, PHONE.ah, PHONE.ar),
      base: rbox(0.075, 0.006, 0.085, 0.0025, 3),
      back: rbox(0.058, 0.1, 0.005, 0.0022, 3),
      lip: rbox(0.058, 0.008, 0.008, 0.0025, 3),
    };
  }, []);
  const y0 = DESK.top + 0.0105;
  const lean = PHONE.lean;
  const cy = y0 + Math.cos(-lean) * (PHONE.h / 2);
  const cz = -Math.sin(-lean) * (PHONE.h / 2);
  const fz = PHONE.d / 2;
  return (
    <group>
      <group position={[0, DESK.top, 0]}>
        <mesh geometry={geo.base} material={m.alu} position={[0, 0.003, -0.02]} castShadow receiveShadow />
        <mesh geometry={geo.back} material={m.alu} position={[0, 0.052, -0.042]} rotation={[lean, 0, 0]} castShadow />
        <mesh geometry={geo.lip} material={m.alu} position={[0, 0.009, 0.006]} castShadow />
        <Blob w={0.1} d={0.11} opacity={0.32} />
      </group>
      <group position={[0, cy, cz - 0.004]} rotation={[lean, 0, 0]}>
        <mesh geometry={geo.body} material={m.titanium} castShadow />
        <mesh geometry={geo.glass} material={m.glass} position={[0, 0, fz + 0.0002]} />
        <mesh ref={screenRef} geometry={geo.screen} material={screenMat} position={[0, 0, fz + 0.0004]} />
        <mesh geometry={geo.glass} material={m.reflect} position={[0, 0, fz + 0.0007]} renderOrder={2} />
      </group>
    </group>
  );
}

// ---------- desk objects ----------

export function Keys() {
  const m = getMats();
  const geo = useMemo(
    () => ({
      chassis: rbox(0.345, 0.022, 0.135, 0.0055, 4),
      white: rbox(0.0204, 0.011, 0.092, 0.0016, 2),
      black: rbox(0.0112, 0.012, 0.056, 0.0018, 2),
      oled: rbox(0.042, 0.002, 0.012, 0.0009, 2),
    }),
    [],
  );
  const kw = 0.0215;
  const x0 = (-15 * kw) / 2 + kw / 2;
  const zW = 0.135 / 2 - 0.092 / 2 - 0.004;
  const zB = zW - 0.092 / 2 + 0.056 / 2;
  const blacks = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];
  return (
    <group>
      <mesh geometry={geo.chassis} material={m.aluDark} position={[0, 0.011, 0]} castShadow receiveShadow />
      {Array.from({ length: 15 }, (_, i) => (
        <mesh key={i} geometry={geo.white} material={m.keyWhite} position={[x0 + i * kw, 0.0235, zW]} castShadow receiveShadow />
      ))}
      {blacks.map((i) => (
        <mesh key={`b${i}`} geometry={geo.black} material={m.keyBlack} position={[x0 + i * kw + kw / 2, 0.0285, zB]} castShadow />
      ))}
      <mesh geometry={geo.oled} material={m.oled} position={[-0.12, 0.0225, -0.046]} />
      {[0.118, 0.146].map((x) => (
        <mesh key={x} material={m.alu} position={[x, 0.026, -0.046]} castShadow>
          <cylinderGeometry args={[0.0075, 0.0078, 0.009, 40]} />
        </mesh>
      ))}
      <Blob w={0.38} d={0.17} opacity={0.35} />
    </group>
  );
}

// Over-ear headphones in the spirit of a premium aluminium pair: tall
// rounded-rectangle cups, cushions flush with the cups, stainless arms that
// slide into the cup tops, a stainless frame with a knit mesh canopy slung
// beneath it. Standing upright on the cushions' lower edges.
const HP = { cupW: 0.064, cupH: 0.084, cupR: 0.027, cupD: 0.028, cushD: 0.02, gap: 0.128, archH: 0.118 };

function archPoints(a: number, b: number, n: number, k = 1) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    pts.push(new THREE.Vector3(Math.cos(t) * a * k, Math.sin(t) * b * k, 0));
  }
  return pts;
}

function canopyGeometry(a: number, b: number, width: number) {
  // a strip following an elliptical arch, slightly sagging in the middle
  const n = 64;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    const sag = Math.sin(t) * 0.012;
    const x = Math.cos(t) * a;
    const y = Math.sin(t) * b - sag;
    pos.push(x, y, -width / 2, x, y, width / 2);
    uv.push(i / n, 0, i / n, 1);
    if (i < n) {
      const j = i * 2;
      idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function Headphones() {
  const m = getMats();
  const geo = useMemo(() => {
    const outline = roundedRectShape(HP.cupW - 0.012, HP.cupH - 0.012, HP.cupR - 0.006);
    const cup = new THREE.ExtrudeGeometry(outline, { depth: HP.cupD - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 6, curveSegments: 20 });
    cup.translate(0, 0, -(HP.cupD - 0.012) / 2);
    cup.rotateY(Math.PI / 2);
    const cushion = new THREE.ExtrudeGeometry(roundedRectShape(HP.cupW - 0.012, HP.cupH - 0.012, HP.cupR - 0.006), {
      depth: HP.cushD - 0.01,
      bevelEnabled: true,
      bevelThickness: 0.005,
      bevelSize: 0.0058,
      bevelSegments: 6,
      curveSegments: 20,
    });
    cushion.translate(0, 0, -(HP.cushD - 0.01) / 2);
    cushion.rotateY(Math.PI / 2);
    const inner = new THREE.ShapeGeometry(roundedRectShape(HP.cupW - 0.026, HP.cupH - 0.026, HP.cupR - 0.013), 12);
    inner.rotateY(Math.PI / 2);
    const a = HP.gap / 2 + HP.cushD + HP.cupD / 2;
    const frame = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(archPoints(a, HP.archH, 40)), 80, 0.0021, 8, false);
    const canopy = canopyGeometry(a * 0.985, HP.archH * 0.94, 0.04);
    const hinge = new THREE.CylinderGeometry(0.0042, 0.0042, 0.012, 16);
    return { cup, cushion, inner, frame, canopy, hinge, a };
  }, []);
  const cupX = geo.a;
  const cy = HP.cupH / 2;
  const top = cy + HP.cupH / 2;
  const armTop = top + 0.03;
  const archY = armTop;
  return (
    <group position={[0, 0, 0.02]}>
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh geometry={geo.cup} material={m.alu} position={[s * cupX, cy, 0]} castShadow receiveShadow />
          <mesh geometry={geo.cushion} material={m.knit} position={[s * (cupX - HP.cupD / 2 - HP.cushD / 2 + 0.002), cy, 0]} castShadow />
          <mesh geometry={geo.inner} material={m.rubber} position={[s * (cupX - HP.cupD / 2 - HP.cushD - 0.0005), cy, 0]} rotation={[0, s > 0 ? Math.PI : 0, 0]} />
          {/* telescoping arm sliding into the cup top, with a small hinge */}
          <mesh geometry={geo.hinge} material={m.steel} position={[s * cupX, top + 0.002, 0]} rotation={[Math.PI / 2, 0, 0]} />
          {[-1, 1].map((z) => (
            <mesh key={z} material={m.steel} position={[s * cupX, (top + archY) / 2, z * 0.016]} castShadow>
              <cylinderGeometry args={[0.0021, 0.0021, archY - top, 10]} />
            </mesh>
          ))}
        </group>
      ))}
      <group position={[0, archY, 0]}>
        {[-1, 1].map((z) => (
          <mesh key={z} geometry={geo.frame} material={m.steel} position={[0, 0, z * 0.016]} castShadow />
        ))}
        <mesh geometry={geo.canopy} material={m.canopy} castShadow />
      </group>
    </group>
  );
}

export function HeadphonesBlob() {
  return (
    <group position={[0, 0, 0.02]}>
      <Blob w={0.3} d={0.13} opacity={0.32} />
    </group>
  );
}

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

export function CameraBody() {
  const m = getMats();
  const geo = useMemo(() => {
    const lathe = new THREE.LatheGeometry(
      [
        [0.0262, 0.004],
        [0.0272, 0.0045],
        [0.0278, 0.007],
        [0.0278, 0.045],
        [0.0272, 0.0495],
        [0.0246, 0.0515],
        [0.0196, 0.052],
        [0.0192, 0.049],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      72,
    );
    const capR = 0.03;
    const capA = Math.asin(0.0192 / capR);
    return {
      body: rbox(0.128, 0.058, 0.038, 0.006, 4),
      plate: rbox(0.128, 0.018, 0.04, 0.0045, 4),
      grip: rbox(0.03, 0.066, 0.026, 0.0095, 4),
      hump: rbox(0.04, 0.018, 0.034, 0.005, 4),
      lathe,
      focus: ridgedRing(0.0286, 0.015, 60, 0.0007),
      cap: new THREE.SphereGeometry(capR, 48, 12, 0, Math.PI * 2, 0, capA),
      capY: 0.049 - capR * Math.cos(capA),
    };
  }, []);
  return (
    <group>
      <mesh geometry={geo.body} material={m.leather} position={[0, 0.03, 0]} castShadow receiveShadow />
      <mesh geometry={geo.plate} material={m.alu} position={[0, 0.0655, 0]} castShadow receiveShadow />
      <mesh geometry={geo.hump} material={m.alu} position={[-0.03, 0.077, -0.002]} castShadow />
      <mesh geometry={geo.grip} material={m.leather} position={[0.047, 0.034, 0.021]} castShadow />
      {[0.026, 0.05].map((x) => (
        <mesh key={x} geometry={ridgedRing(0.0085, 0.007, 36, 0.0004)} material={m.alu} position={[x, 0.078, -0.004]} castShadow />
      ))}
      <mesh material={m.alu} position={[0.048, 0.0705, 0.022]} castShadow>
        <cylinderGeometry args={[0.0048, 0.0048, 0.004, 24]} />
      </mesh>
      <group position={[-0.006, 0.033, 0.019]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh material={m.alu} position={[0, 0.002, 0]}>
          <cylinderGeometry args={[0.0262, 0.0262, 0.004, 64]} />
        </mesh>
        <mesh geometry={geo.lathe} material={m.rubber} castShadow />
        <mesh geometry={geo.focus} material={m.rubber} position={[0, 0.026, 0]} castShadow />
        <mesh geometry={geo.cap} material={m.lens} position={[0, geo.capY, 0]} />
      </group>
      <Blob w={0.16} d={0.1} opacity={0.4} />
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
