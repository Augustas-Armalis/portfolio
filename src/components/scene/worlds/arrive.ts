import * as THREE from "three";
import { postCtl } from "../Post";
import { ORIGIN, voyage } from "./voyage";

// A world picked from the Worlds list (or reached with [ / ]) is usually not the one that was being made ready
// behind the plane: Worlds.tsx warms only the next along the way. Such a world is made under the closed cloud,
// and the cloud used to open after a fixed three quarters of a second, on whatever had been drawn by then: the
// things in front of the entry. Anything off to the side was compiled the first time the eye turned to it (a
// hitch), and a painting still on its way over the network arrived in plain sight.
//
// This keeps the cloud shut until the world is whole, the same three steps the warming takes but all of them here
// and now, a few milliseconds a frame so the cloud and the controls never freeze:
//   1. the world is mounted (its group stands at the worlds' centre);
//   2. every shader of it is compiled, not only those the first view happens to show;
//   3. every object is drawn once into a single pixel, which uploads its buffers and textures;
// and nothing it asked for is still loading. Then the cloud is given back to the crossing (Plane.tsx passage()),
// which opens it a few frames later. It only ever holds: `voyage.held` is kept under what the crossing waits for.
// Never for ever: after eight seconds the world is shown as it is.
type Drawn = THREE.Mesh | THREE.Points | THREE.Line;
const HELD = 0.45; // (the crossing opens at 0.75 s under the cloud: a third of a second of plain frames follows the last step)
const BUDGET = 8; // ms of this work in any one frame

export function makeArrival(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, loading: () => boolean) {
  let tiny: THREE.WebGLRenderTarget | null = null; // (where there is no lens: the one pixel is its own)
  const job = { at: -1, t0: 0, group: null as THREE.Object3D | null, list: null as Drawn[] | null, wait: 0, compiled: 0, drawn: 0, done: true };
  const lit = (o: Drawn) => (Array.isArray(o.material) ? o.material : [o.material]).some((m) => (m as THREE.ShaderMaterial).lights === true || (m as THREE.MeshStandardMaterial).isMeshStandardMaterial);
  // made where the world itself will be drawn (the lens's linear target, or the screen), so the same shader variants are made
  const into = (rt: THREE.WebGLRenderTarget | null, f: () => void) => {
    const prev = gl.getRenderTarget();
    try {
      gl.setRenderTarget(rt);
      f();
    } catch {
      /* made on first sight instead */
    }
    gl.setRenderTarget(prev);
  };
  // the world that stands: the one group drawn at the worlds' centre (worlds/Worlds.tsx)
  const find = (o: THREE.Object3D, depth: number): THREE.Object3D | null => {
    for (const c of o.children) {
      if (!c.visible) continue;
      if ((c as THREE.Group).isGroup && c.position.x === ORIGIN.x && c.position.z === ORIGIN.z && c.children.length) return c;
      const d = depth > 0 ? find(c, depth - 1) : null;
      if (d) return d;
    }
    return null;
  };
  // call once a frame while flying, before the plane's own step
  return () => {
    if (voyage.phase !== "hold" || voyage.quick || voyage.cur === "home") return;
    if (job.at !== voyage.enteredAt) Object.assign(job, { at: voyage.enteredAt, t0: performance.now(), group: null, list: null, wait: 0, compiled: 0, drawn: 0, done: false });
    if (job.done) return;
    const now = performance.now();
    if (now - job.t0 > 8000) {
      job.done = true;
      return;
    }
    voyage.held = Math.min(voyage.held, HELD);
    if (!job.group) {
      job.group = find(scene, 4);
      return;
    }
    if (!job.list) {
      // mounted: give late pieces a few frames, then take stock
      if (++job.wait < 4) return;
      const list: Drawn[] = [];
      job.group.traverse((o) => {
        const d = o as Drawn;
        if (((d as THREE.Mesh).isMesh || (d as THREE.Points).isPoints || (d as THREE.Line).isLine) && d.material && d.geometry) list.push(d);
      });
      job.list = list;
      job.wait = 0;
      return;
    }
    const list = job.list;
    const rt = postCtl.sceneTarget ?? null;
    if (job.compiled < list.length) {
      into(rt, () => {
        while (job.compiled < list.length && performance.now() - now < BUDGET) gl.compile(list[job.compiled++], camera, scene);
      });
      return;
    }
    // (the driver finishes compiling on its own thread: a moment before anything is drawn with those shaders)
    if (++job.wait < 8) return;
    if (job.drawn < list.length) {
      const ac = gl.autoClear;
      gl.autoClear = false;
      while (job.drawn < list.length && performance.now() - now < BUDGET) {
        const o = list[job.drawn++];
        // (a thing lit by the scene's lights cannot be lit when drawn alone: compiled above, uploaded on first sight)
        if (lit(o) || !o.parent) continue;
        const fc = o.frustumCulled;
        o.frustumCulled = false;
        if (rt) {
          const st = rt.scissorTest;
          const sc = rt.scissor.clone();
          rt.scissorTest = true;
          rt.scissor.set(0, 0, 1, 1);
          into(rt, () => gl.render(o, camera));
          rt.scissorTest = st;
          rt.scissor.copy(sc);
        } else into((tiny ??= new THREE.WebGLRenderTarget(1, 1)), () => gl.render(o, camera));
        o.frustumCulled = fc;
      }
      gl.autoClear = ac;
      return;
    }
    // a painting (or anything else) still on its way: wait for it, within reason
    if (loading() && now - job.t0 < 5000) return;
    job.done = true;
    if (process.env.NODE_ENV !== "production") console.info(`[voyage] ${voyage.cur} was made under the cloud: ${list.length} objects compiled and uploaded, ${Math.round(performance.now() - job.t0)} ms after the world changed`);
  };
}
