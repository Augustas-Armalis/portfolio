"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { GEIST, geistReady } from "../font";
import { WorldGrass } from "../Grass";
import { GLSL_NOISE } from "../shared";
import { GLSL_SKY, SKY_U } from "../sky";
import { GLSL_AIR, Kit, WORLD_U, angel, haloGeometry, makeCanvasMaterial, makeHaloMaterial, makePuffMaterial, makeTempera, makeTerrainMaterial, puffGeometry, rng, terrainGeometry, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { gateOf, groundAt, pathOf, type WorldDef, type WorldId } from "./voyage";

// What every world shares: its ground and grass, the path of light with its
// waymarks and angels, the gate onward, and the paintings standing in their
// gallery of light.

export type WorldProps = { mobile: boolean; effects: number; trees: number; far: number; grass: number; reduced: boolean };

// dispose whatever a useMemo built when it is replaced or the world is let go
export function useDisposable<T>(make: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const v = useMemo(make, deps);
  useEffect(
    () => () => {
      const walk = (x: unknown, depth: number) => {
        if (!x || depth > 3) return;
        if (x instanceof THREE.BufferGeometry || x instanceof THREE.Material || x instanceof THREE.Texture) x.dispose();
        else if (x instanceof THREE.InstancedMesh) {
          x.geometry.dispose();
          x.dispose();
        } else if (Array.isArray(x)) x.forEach((y) => walk(y, depth + 1));
        else if (typeof x === "object" && (x as { dispose?: unknown }).dispose && typeof (x as { dispose: unknown }).dispose === "function" && !(x instanceof THREE.Object3D)) (x as { dispose: () => void }).dispose();
        else if (typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype) Object.values(x as object).forEach((y) => walk(y, depth + 1));
      };
      walk(v, 0);
    },
    [v],
  );
  return v;
}

// ---------- ground ----------
export function Ground({ def, pal, mobile, size = 2400 }: { def: WorldDef; pal: GroundPalette; mobile: boolean; size?: number }) {
  const b = useDisposable(() => ({ geo: terrainGeometry(def.terrain!, size, mobile ? 150 : 250), mat: makeTerrainMaterial(def, pal) }), [def, mobile]);
  return <mesh geometry={b.geo} material={b.mat} renderOrder={-5} />;
}

// ---------- the path of light ----------
// A ribbon of light hanging in the air at the height the plane keeps, with a
// slow pulse running along it toward the gate; at intervals a lantern of
// light on a thread, and now and then an angel standing by to show the way.
function ribbonGeometry(pts: THREE.Vector3[], width: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  const side = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    tan.subVectors(b, a).normalize();
    side.set(-tan.z, 0, tan.x).normalize();
    if (i > 0) run += pts[i].distanceTo(pts[i - 1]);
    const p = pts[i];
    pos.push(p.x - side.x * width, p.y - 0.75, p.z - side.z * width, p.x + side.x * width, p.y - 0.75, p.z + side.z * width);
    uv.push(run, -1, run, 1);
    if (i < pts.length - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geo: g, len: run };
}

export function LightPath({ id, def, tint = [1, 0.9, 0.68], gain = 1, angels = true, marks = true, effects = 1, from = 0 }: { id: WorldId; def: WorldDef; tint?: V3; gain?: number; angels?: boolean; marks?: boolean; effects?: number; from?: number }) {
  const b = useDisposable(() => {
    const path = pathOf(id);
    const pts = path.pts.slice(Math.round(from / 4));
    const { geo, len } = ribbonGeometry(pts, 0.9);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) }, uGain: { value: gain }, uLen: { value: len } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld;
        void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform float uGain; uniform float uLen;
        varying vec2 vUv; varying vec3 vWorld;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          float across = exp(-vUv.y * vUv.y * 3.4);
          float core = exp(-vUv.y * vUv.y * 40.0);
          // a slow pulse walking toward the gate, and a fine grain of sparks
          float wave = 0.5 + 0.5 * sin(vUv.x * 0.21 - uTime * 1.35);
          wave = wave * wave;
          float grain = vnoise(vec2(vUv.x * 2.3 - uTime * 0.8, vUv.y * 3.0));
          float a = across * (0.05 + 0.13 * wave) + core * (0.11 + 0.3 * wave) * (0.5 + 0.9 * grain);
          float dist = length(vWorld - cameraPosition);
          a *= smoothstep(2.0, 16.0, dist) * (1.0 - smoothstep(240.0, 520.0, dist));
          // far off it is a thread; let it keep its light there
          a *= 1.0 + smoothstep(30.0, 160.0, dist) * 1.6;
          a *= smoothstep(0.0, 14.0, vUv.x) * smoothstep(uLen, uLen - 14.0, vUv.x);
          a *= 1.0 - airAmt(vWorld) * 0.7;
          gl_FragColor = vec4(uTint * a * uGain * glowK() * (1.0 + uPulse * 0.6), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    // waymarks
    const r = rng(91 + id.length * 7);
    const halos: Halo[] = [];
    const glows: Halo[] = [];
    const k = new Kit();
    const step = Math.round(46 / 4);
    const tan = new THREE.Vector3();
    let n = 0;
    for (let i = step; marks && i < pts.length - step; i += step, n++) {
      const p = pts[i];
      const lx = p.x;
      const lz = p.z;
      const g = id === "home" ? 0 : groundAt(def, lx, lz);
      halos.push({ p: [p.x, p.y - 0.75, p.z], size: 2.4, col: tint, k: 0.26 * gain });
      // the thread it hangs on, down into the mist
      const h = p.y - 0.75 - g;
      if (h > 2 && def.water === null) k.box(0.035, h, 0.035, [p.x, g + h / 2, p.z], [tint[0] * 0.8, tint[1] * 0.74, tint[2] * 0.6], { glow: 0.22 * gain });
      if (angels && n % 4 === 1 && effects > 0.25) {
        tan.subVectors(pts[i + 1], pts[i - 1]).normalize();
        const s = n % 8 === 1 ? 1 : -1;
        const ax = p.x - tan.z * s * 8.5;
        const az = p.z + tan.x * s * 8.5;
        const gy = id === "home" ? 0 : groundAt(def, ax, az);
        // on open water they stand on the path itself, small and far-seen
        const onWater = def.water !== null && gy <= def.water + 0.05;
        const size = onWater ? 2.2 : 3.0 + r() * 0.8;
        const robes: V3[] = [
          [0.85, 0.82, 0.74],
          [0.62, 0.7, 0.82],
          [0.86, 0.68, 0.62],
          [0.66, 0.8, 0.7],
        ];
        angel(k, [ax, onWater ? p.y - 0.9 : gy - 0.1, az], size, Math.atan2(tan.z * s * 0.6 - tan.x * 0.8, -tan.x * s * 0.6 - tan.z * 0.8), robes[n % robes.length], { glow: 0.06 * gain });
        glows.push({ p: [ax, (onWater ? p.y - 0.9 : gy) + size * 1.72, az], size: size * 1.3, col: [1, 0.9, 0.7], k: 0.3 * gain });
      }
    }
    return { geo, mat, halos: haloGeometry(halos), haloMat: makeHaloMaterial(0), glows: glows.length ? haloGeometry(glows) : null, glowMat: makeHaloMaterial(2), marks: k.parts.length ? k.build() : null, tempera: makeTempera({ amb: 0.9, key: 0.3 }) };
  }, [id, effects > 0.25]);
  return (
    <>
      <mesh geometry={b.geo} material={b.mat} renderOrder={4} />
      {marks && <mesh geometry={b.halos} material={b.haloMat} renderOrder={6} />}
      {b.glows && <mesh geometry={b.glows} material={b.glowMat} renderOrder={6} />}
      {b.marks && <mesh geometry={b.marks} material={b.tempera} />}
    </>
  );
}

// ---------- the gate ----------
// A tall lancet of pale light standing on the path, a slow veil of mist and
// light inside it: the brightest thing in its world, so the eye always knows
// the way on.
export function LightGate({ id, def, tint = [1, 0.88, 0.62], gain = 1, half = 11, rise = 17 }: { id: WorldId; def: WorldDef; tint?: V3; gain?: number; half?: number; rise?: number }) {
  const b = useDisposable(() => {
    const gate = gateOf(id)!;
    const c = Math.cos(gate.yaw);
    const s = Math.sin(gate.yaw);
    const at = (u: number, y: number): V3 => [gate.pos.x + c * u, y, gate.pos.z - s * u];
    const g0 = id === "home" ? 0 : Math.min(groundAt(def, at(-half, 0)[0], at(-half, 0)[2]), groundAt(def, at(half, 0)[0], at(half, 0)[2]));
    const foot = Math.min(g0, def.water ?? g0) - 1.5;
    const top = gate.pos.y + rise;
    const spring = gate.pos.y + 2;
    const k = new Kit();
    // the lancet: two long legs leaning a breath inward, meeting in a point
    const leg = (side: number): V3[] => {
      const pts: V3[] = [at(side * (half + 0.9), foot), at(side * half, spring - 8), at(side * half, spring)];
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        // a pointed arch: each side is an arc struck from the far springing
        const a = (t * Math.PI) / 3;
        pts.push(at(side * (half - 2 * half * (1 - Math.cos(a))), spring + 2 * half * Math.sin(a) * ((top - spring) / (half * 1.732))));
      }
      return pts;
    };
    const stone: V3 = [0.78 * tint[0], 0.74 * tint[1], 0.66 * tint[2]];
    for (const side of [-1, 1]) {
      k.tube(leg(side), 0.42, stone, { glow: 0.5 * gain, seg: 60, sides: 7 });
      // a thread of brighter light on the inner edge
      k.tube(
        leg(side).map((p, i): V3 => (i === 0 ? p : [p[0] - c * side * 0.5, p[1] - (i > 2 ? 0.3 : 0), p[2] + s * side * 0.5])),
        0.09,
        tint,
        { glow: 2.6 * gain, seg: 60, sides: 4 },
      );
    }
    // the veil inside
    const shape = new THREE.Shape();
    shape.moveTo(-half, foot - gate.pos.y);
    shape.lineTo(-half, spring - gate.pos.y);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const a = (t * Math.PI) / 3;
      shape.lineTo(-half + 2 * half * (1 - Math.cos(a)), spring - gate.pos.y + 2 * half * Math.sin(a) * ((top - spring) / (half * 1.732)));
    }
    for (let i = 11; i >= 0; i--) {
      const t = i / 12;
      const a = (t * Math.PI) / 3;
      shape.lineTo(half - 2 * half * (1 - Math.cos(a)), spring - gate.pos.y + 2 * half * Math.sin(a) * ((top - spring) / (half * 1.732)));
    }
    shape.lineTo(half, foot - gate.pos.y);
    const veilGeo = new THREE.ShapeGeometry(shape, 8);
    const veil = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...WORLD_U, uTint: { value: new THREE.Color(...tint) }, uGain: { value: gain }, uSpan: { value: new THREE.Vector3(half, foot - gate.pos.y, top - gate.pos.y) } },
      vertexShader: /* glsl */ `
        varying vec3 vLocal; varying vec3 vWorld;
        void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint; uniform float uGain; uniform vec3 uSpan;
        varying vec3 vLocal; varying vec3 vWorld;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          vec2 p = vLocal.xy;
          float n = fbm(vec2(p.x * 0.09 + uTime * 0.02, p.y * 0.05 - uTime * 0.05)) * 0.7 + fbm(p * 0.22 + vec2(-uTime * 0.03, uTime * 0.02)) * 0.3;
          // brightest at the plane's own height, thinning up into the point and down into the mist
          float up = smoothstep(uSpan.z, 0.0, p.y);
          float down = smoothstep(uSpan.y, min(uSpan.y * 0.2, -4.0), p.y);
          float side = 1.0 - smoothstep(0.55, 1.0, abs(p.x) / uSpan.x) * 0.5;
          float a = (0.3 + 0.7 * smoothstep(0.25, 0.75, n)) * up * (0.35 + 0.65 * down) * side;
          vec3 col = mix(airCol(normalize(vWorld - cameraPosition)) * 1.3, uTint * 1.15 * glowK(), 0.5 + 0.3 * n) * uGain;
          float dist = length(vWorld - cameraPosition);
          gl_FragColor = vec4(col * (1.0 + uPulse * 0.4), clamp(a * 0.86, 0.0, 0.9) * smoothstep(0.5, 6.0, dist));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const halos: Halo[] = [{ p: [gate.pos.x, top + 0.6, gate.pos.z], size: 6, col: tint, k: 0.7 * gain }];
    const glow: Halo[] = [{ p: [gate.pos.x, gate.pos.y + 2, gate.pos.z], size: 60, col: tint, k: 0.3 * gain }];
    const puffs: Puff[] = [];
    const r = rng(17);
    for (let i = 0; i < 7; i++) puffs.push({ p: at((r() - 0.5) * half * 3.4, Math.max(foot + 3, gate.pos.y - 12) + r() * 5), size: 16 + r() * 16, a: 0.8 });
    return { arch: k.build(), tempera: makeTempera({ amb: 0.9, key: 0.3 }), veilGeo, veil, halos: haloGeometry(halos), haloMat: makeHaloMaterial(0), glow: haloGeometry(glow), glowMat: makeHaloMaterial(2), puffs: puffGeometry(puffs), puffMat: makePuffMaterial(), pos: gate.pos.toArray() as V3, yaw: gate.yaw };
  }, [id]);
  return (
    <>
      <mesh geometry={b.arch} material={b.tempera} />
      <mesh geometry={b.puffs} material={b.puffMat} renderOrder={3} />
      <mesh geometry={b.veilGeo} material={b.veil} position={b.pos} rotation={[0, b.yaw, 0]} renderOrder={5} />
      <mesh geometry={b.glow} material={b.glowMat} renderOrder={6} />
      <mesh geometry={b.halos} material={b.haloMat} renderOrder={6} />
    </>
  );
}

// ---------- mist ----------
export function Mist({ puffs }: { puffs: Puff[] }) {
  const b = useDisposable(() => ({ geo: puffGeometry(puffs), mat: makePuffMaterial() }), [puffs]);
  return <mesh geometry={b.geo} material={b.mat} renderOrder={3} />;
}
export function Halos({ list, kind = 0 }: { list: Halo[]; kind?: 0 | 1 | 2 }) {
  const b = useDisposable(() => ({ geo: haloGeometry(list), mat: makeHaloMaterial(kind) }), [list, kind]);
  return <mesh geometry={b.geo} material={b.mat} renderOrder={6} />;
}

// ---------- the paintings ----------
export type PaintingInfo = { id: string; file: string; title: string; width: number; height: number };
let paintingsP: Promise<PaintingInfo[]> | null = null;
export function loadPaintings() {
  return (paintingsP ??= fetch("/assets/ciurlionis/paintings.json")
    .then((r) => r.json() as Promise<PaintingInfo[]>)
    .catch(() => {
      paintingsP = null;
      return [];
    }));
}
// a canvas that arrives later than the code finds its world by its name
const WORLD_OF: [RegExp, WorldId][] = [
  [/^sun/, "sun"],
  [/^stars|^pyramid/, "stars"],
  [/^rex/, "rex"],
  [/^fairy/, "fairy"],
  [/^paradise|^angel|^spring/, "paradise"],
  [/^offering/, "gate"],
  [/^sea|^tranquil/, "sea"],
];
const worldOfPainting = (id: string) => WORLD_OF.find(([re]) => re.test(id))?.[1] ?? null;

function captionTexture(title: string, year: string) {
  const c = document.createElement("canvas");
  c.width = 1536;
  c.height = 300;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const draw = () => {
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.textBaseline = "alphabetic";
    g.fillStyle = "rgba(255,252,244,0.96)";
    g.font = `600 84px ${GEIST}`;
    (g as unknown as { letterSpacing: string }).letterSpacing = "-3.2px";
    // a long title steps down a size rather than running off the stone
    let size = 84;
    while (g.measureText(title).width > c.width - 16 && size > 44) {
      size -= 4;
      g.font = `600 ${size}px ${GEIST}`;
      (g as unknown as { letterSpacing: string }).letterSpacing = `${(-size * 0.038).toFixed(1)}px`;
    }
    g.fillText(title, 6, 96);
    g.font = `400 58px ${GEIST}`;
    (g as unknown as { letterSpacing: string }).letterSpacing = "-1px";
    g.fillStyle = "rgba(255,250,240,0.66)";
    g.fillText("M. K. Čiurlionis", 6, 186);
    if (year) {
      g.fillStyle = "rgba(255,250,240,0.46)";
      g.fillText(year, 6, 262);
    }
    tex.needsUpdate = true;
  };
  draw();
  void geistReady().then(draw);
  return tex;
}

const CANVAS_H = 18;
function CanvasStand({ p, x, z, y, yaw }: { p: PaintingInfo; x: number; z: number; y: number; yaw: number }) {
  const aspect = p.width / p.height;
  const H = aspect > 1.25 ? CANVAS_H * 0.8 : CANVAS_H;
  const W = H * aspect;
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(p.title);
  const title = m ? m[1] : p.title;
  const year = m ? m[2] : "";
  const b = useDisposable(() => {
    const map = new THREE.TextureLoader().load(p.file, () => (state.loaded = true));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const state = { loaded: false };
    const k = new Kit();
    const wall: V3 = [0.1, 0.088, 0.078];
    const wallTop: V3 = [0.15, 0.132, 0.116];
    const wood: V3 = [0.05, 0.034, 0.024];
    const gilt: V3 = [0.86, 0.62, 0.26];
    const WW = W + 8;
    const base = 7.4; // the painting's lower edge above the ground
    const WH = base + H + 4.2;
    // the wall: a tall slab of dark stone on a low plinth, its foot well down in the ground
    k.box(WW, WH + 6, 1.1, [0, WH / 2 - 3, -0.75], wall, { top: wallTop });
    k.box(WW + 3, 1.3, 3.2, [0, 0.2, -0.3], wall, { top: wallTop });
    k.box(WW + 0.9, 0.5, 1.5, [0, WH + 0.05, -0.75], wallTop);
    // the frame: dark wood, a deep step, and a thin gilt lip against the canvas
    const cy = base + H / 2;
    const bar = 0.62;
    for (const sy of [-1, 1]) {
      k.box(W + bar * 2, bar, 0.5, [0, cy + sy * (H / 2 + bar / 2), 0.02], wood);
      k.box(W + 0.16, 0.08, 0.2, [0, cy + sy * (H / 2 + 0.04), 0.3], gilt, { glow: 0.16 });
    }
    for (const sx of [-1, 1]) {
      k.box(bar, H + bar * 2, 0.5, [sx * (W / 2 + bar / 2), cy, 0.02], wood);
      k.box(0.08, H + 0.16, 0.2, [sx * (W / 2 + 0.04), cy, 0.3], gilt, { glow: 0.16 });
    }
    // a picture light: a slim bar held out over the frame
    k.box(W * 0.56, 0.16, 0.16, [0, cy + H / 2 + bar + 1.0, 1.5], [1, 0.9, 0.7], { glow: 2.4 });
    for (const sx of [-1, 1]) k.box(0.07, 0.07, 1.6, [sx * W * 0.2, cy + H / 2 + bar + 1.0, 0.7], wood);
    return {
      map,
      state,
      canvas: makeCanvasMaterial(map),
      cap: captionTexture(title, year),
      stand: k.build(),
      tempera: makeTempera({ amb: 1, key: 0.3, dab: 0.6 }),
      halo: haloGeometry([{ p: [0, cy + H / 2 + bar + 1.0, 1.6], size: 5.5, col: [1, 0.86, 0.6], k: 0.4 }]),
      haloMat: makeHaloMaterial(0),
      cy,
      WW,
      base,
    };
  }, [p.file]);
  useFrame((_, dt) => {
    const u = b.canvas.uniforms.uShow;
    if (b.state.loaded && u.value < 1) u.value = Math.min(1, u.value + Math.min(dt, 0.1) / 0.9);
  });
  return (
    <group position={[x, y, z]} rotation={[0, yaw, 0]}>
      <mesh geometry={b.stand} material={b.tempera} />
      <mesh position={[0, b.cy, 0.24]} material={b.canvas}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <mesh position={[-W / 2 - 0.62 + 7, b.base - 3.0, 0.1]}>
        <planeGeometry args={[14, 2.73]} />
        <meshBasicMaterial map={b.cap} transparent toneMapped={false} depthWrite={false} fog={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-80} />
      </mesh>
      <mesh geometry={b.halo} material={b.haloMat} renderOrder={6} />
    </group>
  );
}

export function Gallery({ def }: { def: WorldDef }) {
  const [list, setList] = useState<PaintingInfo[]>([]);
  useEffect(() => {
    let on = true;
    void loadPaintings().then((l) => on && setList(l));
    return () => {
      on = false;
    };
  }, []);
  const stands = useMemo(() => {
    const out: { p: PaintingInfo; x: number; z: number; yaw: number }[] = [];
    const named = new Set(def.canvases.map((c) => c.painting));
    for (const c of def.canvases) {
      const p = list.find((q) => q.id === c.painting);
      if (p) out.push({ p, x: c.x, z: c.z, yaw: c.yaw });
    }
    // late arrivals: stood in a row beside the world's own canvas, each a little further along
    const base = def.canvases[def.canvases.length - 1];
    if (base) {
      let n = 0;
      for (const p of list) {
        if (named.has(p.id) || worldOfPainting(p.id) !== def.id) continue;
        n++;
        const side = base.yaw > 0 ? -1 : 1; // away from the path
        const step = 34 * n;
        out.push({ p, x: base.x + Math.cos(base.yaw) * side * step - Math.sin(base.yaw) * 6 * n, z: base.z - Math.sin(base.yaw) * side * step - Math.cos(base.yaw) * 6 * n, yaw: base.yaw + side * -0.12 * n });
      }
    }
    return out;
  }, [list, def]);
  return (
    <>
      {stands.map((s) => (
        <CanvasStand key={s.p.id} p={s.p} x={s.x} z={s.z} y={Math.max(groundAt(def, s.x, s.z), (def.water ?? -99) + 0.4) - 0.4} yaw={s.yaw} />
      ))}
    </>
  );
}

// ---------- the whole base of a world ----------
export function WorldBase({ id, def, pal, props, grass = true, tip, pathTint, pathGain, gateTint, mask, tall, groundSize, angels = true, marks = true }: { id: WorldId; def: WorldDef; pal: GroundPalette; props: WorldProps; grass?: boolean; tip?: V3; pathTint?: V3; pathGain?: number; gateTint?: V3; mask?: string; tall?: number; groundSize?: number; angels?: boolean; marks?: boolean }) {
  return (
    <>
      {def.terrain && <Ground def={def} pal={pal} mobile={props.mobile} size={groundSize} />}
      {grass && def.terrain && <WorldGrass def={def} pal={pal} tip={tip} mobile={props.mobile} density={props.grass} wind={props.reduced ? 0.25 : 1} mask={mask} tall={tall} />}
      <LightPath id={id} def={def} tint={pathTint} gain={pathGain} effects={props.effects} angels={angels} marks={marks} />
      {def.gate && <LightGate id={id} def={def} tint={gateTint ?? pathTint} gain={pathGain} />}
      <Gallery def={def} />
    </>
  );
}
