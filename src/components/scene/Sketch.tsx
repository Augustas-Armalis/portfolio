"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { getMats } from "./materials";
import { clamp01, easeInOutCubic } from "./shared";

// The sketchbook. Closed: hard linen cover, elastic band, pencil on top. In
// sketch mode the cover swings open and the right-hand page is a canvas you
// draw on with a soft graphite line (width follows speed, smoothed with
// quadratic midpoints). Clear and Save are driven from the DOM.

const W = 0.212;
const D = 0.152;
const PAGE_W = W - 0.008;
const PAGE_D = D - 0.006;
const CW = 1024;
const CH = Math.round((CW * PAGE_D) / PAGE_W);

function paperCanvas() {
  const c = document.createElement("canvas");
  c.width = CW;
  c.height = CH;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f1ea";
  g.fillRect(0, 0, CW, CH);
  // tooth: faint grain
  const img = g.getImageData(0, 0, CW, CH);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 9;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export type SketchApi = { clear: () => void; save: () => void };

export function SketchbookLive({ open, apiRef }: { open: boolean; apiRef: MutableRefObject<SketchApi | null> }) {
  const m = getMats();
  const cover = useRef<THREE.Group>(null);
  const pencil = useRef<THREE.Group>(null);
  const k = useRef(0);
  const { canvas, base, tex, mat } = useMemo(() => {
    const canvas = paperCanvas();
    const base = document.createElement("canvas");
    base.width = CW;
    base.height = CH;
    base.getContext("2d")!.drawImage(canvas, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    return { canvas, base, tex, mat };
  }, []);
  const leftMat = useMemo(() => {
    const t = new THREE.CanvasTexture(paperCanvas());
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  }, []);
  const stroke = useRef<{ x: number; y: number; t: number; w: number } | null>(null);
  const mid = useRef<{ x: number; y: number } | null>(null);

  apiRef.current = {
    clear: () => {
      canvas.getContext("2d")!.drawImage(base, 0, 0);
      tex.needsUpdate = true;
    },
    save: () => {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "sketch.png";
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
    const w = THREE.MathUtils.lerp(last.w, THREE.MathUtils.clamp(5.2 - speed * 2.2, 1.4, 5.2), 0.35);
    const g = canvas.getContext("2d")!;
    g.strokeStyle = "rgba(38,38,44,0.88)";
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
    k.current += ((open ? 1 : 0) - k.current) * (1 - Math.exp(-dt * 4));
    const e = easeInOutCubic(clamp01(k.current));
    if (cover.current) cover.current.rotation.z = e * Math.PI;
    if (pencil.current) {
      // the pencil slides off to the side when the book opens
      pencil.current.position.set(-0.005 + e * 0.14, 0.0198 - e * 0.004, 0.012 + e * 0.02);
      pencil.current.rotation.set(0, 0.42 - e * 0.3, 0);
    }
  });

  const sp = -W / 2 + 0.003;
  const shown = k.current > 0.02 || open;
  return (
    <group>
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
          onPointerDown={(e) => {
            if (!open) return;
            e.stopPropagation();
            const p = toPx(e);
            if (p) {
              stroke.current = { ...p, t: performance.now(), w: 3 };
              mid.current = null;
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
          <mesh material={leftMat} position={[W / 2, -0.0002, 0]} rotation={[Math.PI / 2, 0, 0]}>
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
