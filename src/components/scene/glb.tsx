"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as THREE from "three";

// Real models for the desk, when they exist. Drop a .glb into
// /public/assets/models/ under the name below, set `present: true` on its
// entry, and it replaces the built-in model; tune how it sits with scale /
// rotation / offset here. Nothing is requested for an entry that is not
// marked present (a probe for a missing file is a red 404 in every visitor's
// console), and if a marked file is missing after all the code model stays.
//
// `replace: false` keeps the built-in model as well: the display's glass and
// the piano's keys are the interactive parts (the screen boots the OS, each
// key plays), so for those two a glb can only add a body around them once it
// has been lined up by hand.

export type GlbEntry = { file: string; scale: number; rotation: [number, number, number]; offset: [number, number, number]; replace: boolean; present: boolean };
export const GLB_MODELS: Record<"display" | "headphones" | "camera" | "keyboard", GlbEntry> = {
  display: { file: "/assets/models/display.glb", scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0], replace: false, present: false },
  headphones: { file: "/assets/models/headphones.glb", scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0], replace: true, present: false },
  camera: { file: "/assets/models/camera.glb", scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0], replace: true, present: false },
  keyboard: { file: "/assets/models/keyboard.glb", scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0], replace: false, present: false },
};

const cache = new Map<string, Promise<THREE.Object3D | null>>();
let draco: import("three/examples/jsm/loaders/DRACOLoader.js").DRACOLoader | null = null;
function load(file: string) {
  let p = cache.get(file);
  if (!p) {
    p = fetch(file, { method: "HEAD" })
      .then((r) => {
        // a static host answers a missing file with 404 (or an HTML page): only a real model counts
        if (!r.ok || (r.headers.get("content-type") ?? "").includes("text/html")) return null;
        // the Draco decoder (public/draco, copied from three) is only fetched if a model is actually compressed
        return Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/loaders/DRACOLoader.js")]).then(
          ([{ GLTFLoader }, { DRACOLoader }]) =>
            new Promise<THREE.Object3D | null>((res) => {
              draco ??= new DRACOLoader().setDecoderPath("/draco/");
              new GLTFLoader().setDRACOLoader(draco).load(
                file,
                (g) => {
                  g.scene.traverse((o) => {
                    const m = o as THREE.Mesh;
                    if (m.isMesh) m.castShadow = m.receiveShadow = true;
                  });
                  res(g.scene);
                },
                undefined,
                () => res(null),
              );
            }),
        );
      })
      .catch(() => null);
    cache.set(file, p);
  }
  return p;
}

// Shows the glb for `name` if it is there, the fallback otherwise (or both,
// for entries that keep their interactive code model).
export function DeskModel({ name, children }: { name: keyof typeof GLB_MODELS; children: ReactNode }) {
  const cfg = GLB_MODELS[name];
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    let dead = false;
    if (!cfg.present) return;
    void load(cfg.file).then((o) => {
      if (!dead && o) setObj(o.clone(true));
    });
    return () => {
      dead = true;
    };
  }, [cfg.file, cfg.present]);
  return (
    <>
      {obj && <primitive object={obj} position={cfg.offset} rotation={cfg.rotation} scale={cfg.scale} />}
      {(!obj || !cfg.replace) && children}
    </>
  );
}
