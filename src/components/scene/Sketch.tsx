"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { getMats } from "./materials";
import { clamp01, easeInOutCubic } from "./shared";
import { SKY_U } from "./sky";

// The sketchbook. Closed: hard linen cover, elastic band, pencil on top. In
// sketch mode the cover swings open and the right-hand page is a canvas you
// draw on with a soft graphite line (width follows speed, smoothed with
// quadratic midpoints). Clear and Save are driven from the DOM.
//
// Once something has been drawn the book is left lying open on the desk with
// the drawing on its page, for the rest of the visit (nothing is stored: a
// reload closes it): it can be photographed with the camera, seen from the
// plane, and picked up again to go on with the same drawing. Clearing the
// page lets it close. Lying open it is a real thing on the desk: the cover
// comes to rest on the wood (not held level in the air at the page's height),
// the pencil lies on the desk in front of it, and the two pages are drawn
// just proud of what they lie on, so nothing shimmers from across the field.

const W = 0.212;
const D = 0.152;
const PAGE_W = W - 0.008;
const PAGE_D = D - 0.006;
// The cover swings a little past flat: its far edge comes down to the desk (half a millimetre off it).
const COVER_REST = Math.PI + Math.asin((0.0143 - 0.0026 - 0.0005) / W);
// Opened on the wide desk, the book slides this far to its right (its own +x): the cover, as wide again as the
// book, then lies on the desk instead of over its left edge. (Room hands it in as `shift`, and its sketch view,
// centred on the spine, allows for the same. The phone's desk has the room already, and the phone itself stands
// just to the right: there the book stays where it is.)
export const SKETCH_OPEN_SHIFT = 0.045;
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const CW = 1024;
const CH = Math.round((CW * PAGE_D) / PAGE_W);

let tile: HTMLCanvasElement | null = null;
function grainTile() {
  if (tile) return tile;
  tile = document.createElement("canvas");
  tile.width = tile.height = 256;
  const g = tile.getContext("2d")!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    img.data[i] = 0xf4 + n;
    img.data[i + 1] = 0xf1 + n;
    img.data[i + 2] = 0xea + n;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tile;
}
function paperCanvas() {
  const c = document.createElement("canvas");
  c.width = CW;
  c.height = CH;
  const g = c.getContext("2d")!;
  // tooth: faint grain. (One small tile of it, made once and laid as a pattern: reading and writing every pixel
  // of two full pages took a quarter of a second of the loader on a slowed machine.)
  g.fillStyle = g.createPattern(grainTile(), "repeat") ?? "#f4f1ea";
  g.fillRect(0, 0, CW, CH);
  return c;
}

export type SketchApi = { clear: () => void; save: () => void };

// The page (and whether it has been drawn on) outlives the book's own mounting: the scene is built afresh when
// the layout changes between the wide desk and the phone's (a window dragged narrow, a tablet turned), and the
// drawing must still be there. It lasts as long as the page in the browser does: a reload starts clean.
let PAGE: { canvas: HTMLCanvasElement; base: HTMLCanvasElement; kept: boolean } | null = null;

export function SketchbookLive({ open, shift = 0, apiRef }: { open: boolean; shift?: number; apiRef: MutableRefObject<SketchApi | null> }) {
  const m = getMats();
  const body = useRef<THREE.Group>(null);
  const cover = useRef<THREE.Group>(null);
  const pencil = useRef<THREE.Group>(null);
  // the page has been drawn on: the book stays open when it is put down
  const [kept, keep] = useState(() => !!PAGE?.kept);
  const setKept = (v: boolean) => {
    if (PAGE) PAGE.kept = v;
    keep(v);
  };
  const k = useRef(kept ? 1 : 0);
  const lamp = useRef(0);
  const lying = open || kept;
  const { canvas, base, tex, mat } = useMemo(() => {
    if (!PAGE) {
      const canvas = paperCanvas();
      const base = document.createElement("canvas");
      base.width = CW;
      base.height = CH;
      base.getContext("2d")!.drawImage(canvas, 0, 0);
      PAGE = { canvas, base, kept: false };
    }
    const { canvas, base } = PAGE;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    // after dark the page keeps a little light of its own, so the pencil can still be seen
    // (a page lies a twentieth of a millimetre over the block of pages under it: drawn just proud of it at any distance)
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, emissive: "#ffffff", emissiveMap: tex, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    return { canvas, base, tex, mat };
  }, []);
  const leftMat = useMemo(() => {
    const t = new THREE.CanvasTexture(paperCanvas());
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  }, []);
  const stroke = useRef<{ x: number; y: number; t: number; w: number } | null>(null);
  const mid = useRef<{ x: number; y: number } | null>(null);

  apiRef.current = {
    clear: () => {
      canvas.getContext("2d")!.drawImage(base, 0, 0);
      tex.needsUpdate = true;
      setKept(false);
    },
    save: () => {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      const d = new Date();
      const p2 = (n: number) => String(n).padStart(2, "0");
      a.download = `augustas-os-sketch-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`;
      a.click();
    },
  };

  const toPx = (e: ThreeEvent<PointerEvent>) => (e.uv ? { x: e.uv.x * CW, y: (1 - e.uv.y) * CH } : null);
  const draw = (e: ThreeEvent<PointerEvent>) => {
    const p = toPx(e);
    const last = stroke.current;
    if (!p || !last) return;
    const now = performance.now();
    const dist = Math.hypot(p.x - last.x, p.y - last.y);
    const speed = dist / Math.max(1, now - last.t);
    // a soft pencil: a quick line thins but never to a scratch
    const w = THREE.MathUtils.lerp(last.w, THREE.MathUtils.clamp(6.4 - speed * 1.5, 3, 6.4), 0.35);
    const g = canvas.getContext("2d")!;
    g.strokeStyle = "rgba(30,30,36,0.92)";
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = w;
    const m2 = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
    g.beginPath();
    const from = mid.current ?? last;
    g.moveTo(from.x, from.y);
    g.quadraticCurveTo(last.x, last.y, m2.x, m2.y);
    g.stroke();
    mid.current = m2;
    stroke.current = { x: p.x, y: p.y, t: now, w };
    tex.needsUpdate = true;
  };

  useFrame((_, dt) => {
    k.current += ((lying ? 1 : 0) - k.current) * (1 - Math.exp(-dt * 4));
    // (the page's own light is for drawing after dark; left lying on the desk it is paper under the sky again)
    lamp.current += ((open ? 1 : 0) - lamp.current) * (1 - Math.exp(-dt * 4));
    mat.emissiveIntensity = 0.3 * SKY_U.uNight.value * clamp01(lamp.current);
    const e = easeInOutCubic(clamp01(k.current));
    if (body.current) body.current.position.x = e * shift;
    if (cover.current) cover.current.rotation.z = e * COVER_REST;
    if (pencil.current) {
      // the pencil slides off the cover as it opens, out over the front edge, and is set down on the desk there
      const out = sstep(0, 0.7, e);
      const down = sstep(0.7, 1, e);
      pencil.current.position.set(-0.005 + out * 0.012, 0.0198 - down * 0.0164, 0.012 + out * 0.08);
      pencil.current.rotation.set(0, 0.42 - out * 0.34, 0);
    }
  });

  const sp = -W / 2 + 0.003;
  const shown = k.current > 0.02 || lying;
  return (
    <group ref={body}>
      {/* back board, page block, spine */}
      <mesh material={m.linen} position={[0, 0.0013, 0]} castShadow receiveShadow>
        <boxGeometry args={[W, 0.0026, D]} />
      </mesh>
      <mesh material={m.pages} position={[0.002, 0.0078, 0]} castShadow receiveShadow>
        <boxGeometry args={[W - 0.008, 0.0104, D - 0.006]} />
      </mesh>
      <mesh material={m.linen} position={[sp - 0.001, 0.0078, 0]}>
        <boxGeometry args={[0.006, 0.0166, D]} />
      </mesh>
      {shown && (
        <mesh
          material={mat}
          position={[0.002, 0.01305, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          onPointerDown={(e) => {
            if (!open) return;
            e.stopPropagation();
            const p = toPx(e);
            if (p) {
              setKept(true);
              stroke.current = { ...p, t: performance.now(), w: 4.5 };
              mid.current = null;
              // the point of the pencil touching down: a dot, so a tap (the dot of an i, a full stop) leaves its mark
              const g = canvas.getContext("2d")!;
              g.fillStyle = "rgba(30,30,36,0.92)";
              g.beginPath();
              g.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
              g.fill();
              tex.needsUpdate = true;
              (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            if (!open || !stroke.current) return;
            e.stopPropagation();
            draw(e);
          }}
          onPointerUp={() => {
            stroke.current = null;
            mid.current = null;
          }}
          onPointerLeave={() => {
            stroke.current = null;
            mid.current = null;
          }}
        >
          <planeGeometry args={[PAGE_W, PAGE_D]} />
        </mesh>
      )}
      {/* cover on its hinge; inside is a blank page */}
      <group ref={cover} position={[sp, 0.0143, 0]}>
        <mesh material={m.linen} position={[W / 2, 0.0013, 0]} castShadow>
          <boxGeometry args={[W, 0.0026, D]} />
        </mesh>
        <mesh material={m.elastic} position={[W / 2 + 0.084, 0.0029, 0]}>
          <boxGeometry args={[0.0045, 0.0006, D + 0.0005]} />
        </mesh>
        {shown && (
          <mesh material={leftMat} position={[W / 2, -0.0002, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[W - 0.008, D - 0.006]} />
          </mesh>
        )}
      </group>
      <group ref={pencil}>
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
    </group>
  );
}
