"use client";

import * as THREE from "three";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, angel, makePoints, makeTempera, makeWater, pointsGeometry, rng, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { WORLDS, groundAt, heightAt } from "./voyage";

// Paradise (Angels, 1909). A yellow-green noon under rows of cloud. On the
// left a still lake, its shore one long curve of pale sand; on the right a
// meadow thick with small flowers, and beyond it broad pale steps climbing
// away in an arc. Angels stand about in the grass and on the steps, slight
// figures in blue, rose, green and white with tall narrow wings; one, larger
// and nearer, bends to pick a flower. White birds cross the sky.

const def = WORLDS.paradise;
export const PARADISE_PAL: GroundPalette = { a: [0.17, 0.3, 0.07], b: [0.3, 0.36, 0.09], c: [0.12, 0.26, 0.08], shore: [0.74, 0.6, 0.3] };

// the steps curve round the meadow: arcs about this point
export const STEPS = { x: 60, z: -60, r0: 150, tread: 9.5, rise: 2.3, n: 13, y0: 7, a0: -1.95, a1: 0.62 };

function steps(mobile: boolean) {
  const seg = mobile ? 40 : 80;
  const pos: number[] = [];
  const col: number[] = [];
  const top: V3 = [0.84, 0.74, 0.42];
  const topB: V3 = [0.96, 0.88, 0.58];
  const face: V3 = [0.56, 0.47, 0.25];
  const P = (r: number, a: number, y: number) => new THREE.Vector3(STEPS.x + Math.cos(a) * r, y, STEPS.z + Math.sin(a) * r);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: V3, cb: V3) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
    col.push(...ca, 0, ...cb, 0, ...ca, 0, ...cb, 0, ...cb, 0, ...ca, 0);
  };
  for (let i = 0; i < STEPS.n; i++) {
    const ri = STEPS.r0 + i * STEPS.tread;
    const ro = ri + STEPS.tread;
    const y = STEPS.y0 + i * STEPS.rise;
    for (let s = 0; s < seg; s++) {
      const a = STEPS.a0 + (s / seg) * (STEPS.a1 - STEPS.a0);
      const a2 = STEPS.a0 + ((s + 1) / seg) * (STEPS.a1 - STEPS.a0);
      // the tread, paler toward its front edge, and the riser under it
      quad(P(ri, a, y), P(ro, a, y), P(ri, a2, y), P(ro, a2, y), topB, top);
      quad(P(ri, a, y - STEPS.rise - (i === 0 ? 8 : 0)), P(ri, a, y), P(ri, a2, y - STEPS.rise - (i === 0 ? 8 : 0)), P(ri, a2, y), face, [0.7, 0.6, 0.33]);
    }
    // the ends of the flight
    for (const a of [STEPS.a0, STEPS.a1]) quad(P(ri, a, y - 14), P(ro, a, y - 14), P(ri, a, y), P(ro, a, y), face, face);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export default function ParadiseWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const r = rng(606);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const dry = (x: number, z: number) => heightAt(def.terrain!, x, z) > 0.9;
    const k = new Kit();
    const glows: Halo[] = [];
    const robes: V3[] = [
      [0.36, 0.56, 0.84],
      [0.88, 0.56, 0.62],
      [0.46, 0.74, 0.5],
      [0.95, 0.93, 0.86],
      [0.74, 0.62, 0.9],
      [0.95, 0.8, 0.44],
      [0.5, 0.78, 0.82],
    ];
    // a company of them in the grass before the steps, in twos and threes, turned to one another
    const groups = props.mobile ? 5 : 9;
    let n = 0;
    for (let gi = 0; gi < groups; gi++) {
      const a = STEPS.a0 + 0.35 + (gi / (groups - 1)) * (STEPS.a1 - STEPS.a0 - 0.6);
      const d = STEPS.r0 - 16 - (gi % 3) * 22 - r() * 12;
      const cx = STEPS.x + Math.cos(a) * d;
      const cz = STEPS.z + Math.sin(a) * d;
      const m = 2 + (gi % 2);
      for (let i = 0; i < m; i++) {
        const x = cx + Math.cos(i * 2.2 + gi) * 4.5;
        const z = cz + Math.sin(i * 2.2 + gi) * 4.5;
        if (!dry(x, z)) continue;
        const s = 4.2 + r() * 1.3;
        angel(k, [x, g(x, z) - 0.1, z], s, Math.atan2(cx - x, cz - z) + (r() - 0.5) * 0.6, robes[n++ % robes.length], { glow: 0.05, open: 0.3 + r() * 0.12 });
      }
    }
    // some on the steps themselves, going up
    for (let i = 0; i < (props.mobile ? 4 : 8); i++) {
      const st = 1 + ((i * 3) % (STEPS.n - 2));
      const a = STEPS.a0 + 0.3 + r() * (STEPS.a1 - STEPS.a0 - 0.6);
      const rr = STEPS.r0 + st * STEPS.tread + 4.5;
      angel(k, [STEPS.x + Math.cos(a) * rr, STEPS.y0 + st * STEPS.rise, STEPS.z + Math.sin(a) * rr], 4.2 + r(), a + Math.PI / 2 + (r() - 0.5), robes[n++ % robes.length], { glow: 0.05 });
    }
    // and the one who bends to pick a flower, larger and nearer
    const bx = 82;
    const bz = 10;
    angel(k, [bx, g(bx, bz) - 0.1, bz], 9.5, -2.3, [0.97, 0.93, 0.8], { bow: 0.62, glow: 0.07, open: 0.5 });
    glows.push({ p: [bx - 3, g(bx, bz) + 9, bz - 3], size: 30, col: [1, 0.94, 0.74], k: 0.16 });

    // white birds over the water
    for (let i = 0; i < (props.mobile ? 4 : 7); i++) {
      const p: V3 = [-260 + r() * 300, 70 + r() * 60, 160 - r() * 320];
      const s = 3 + r() * 2;
      const yaw = r() * 6.28;
      for (const w of [-1, 1]) {
        const wing = new THREE.BufferGeometry();
        wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.5 * s, w * 2.6 * s, 0.9 * s, 0.1 * s, 0, 0, 0.6 * s, 0, 0, -0.5 * s, 0, 0, 0.6 * s, w * 2.6 * s, 0.9 * s, 0.1 * s], 3));
        wing.computeVertexNormals();
        k.add(wing, p, [1, 1, 0.97], { glow: 0.5, rot: [0, yaw, 0] });
      }
    }

    // the meadow's flowers: thick near the path, thinning toward the steps
    const flowers = (count: number, seed: number) =>
      pointsGeometry(
        count,
        (_, q) => {
          for (let tries = 0; tries < 12; tries++) {
            const a = STEPS.a0 - 0.3 + q() * (STEPS.a1 - STEPS.a0 + 1.2);
            const d = Math.pow(q(), 0.7) * (STEPS.r0 - 4);
            const x = STEPS.x + Math.cos(a) * d + (q() - 0.5) * 40;
            const z = STEPS.z + Math.sin(a) * d + (q() - 0.5) * 40 + 60;
            if (!dry(x, z)) continue;
            return [x, g(x, z) + 0.5 + q() * 0.35, z, 0.5 + q() * 0.9];
          }
          return [STEPS.x, g(STEPS.x, STEPS.z) + 0.6, STEPS.z, 0.6];
        },
        seed,
      );
    const nF = props.mobile ? 900 : Math.round(2600 * (0.5 + 0.5 * props.effects));
    // low mist far out over the lake
    const puffs: Puff[] = [];
    for (let i = 0; i < 10; i++) puffs.push({ p: [-420 - r() * 260, 7 + r() * 5, 200 - r() * 520], size: 70 + r() * 60, a: 0.5 });

    return {
      set: k.build(),
      steps: steps(props.mobile),
      tempera: makeTempera({ amb: 0.95, key: 0.34, dab: 0.8 }),
      glows,
      puffs,
      flowersA: flowers(nF, 717),
      flowersB: flowers(Math.round(nF * 0.6), 919),
      flowerA: makePoints({ a: [1.0, 0.98, 0.9], b: [1.0, 0.86, 0.3], scale: 150, solid: true, gain: 1.25, max: 14 }),
      flowerB: makePoints({ a: [0.95, 0.5, 0.62], b: [0.42, 0.56, 1.0], scale: 140, solid: true, gain: 1.2, max: 12 }),
      water: makeWater({ def, deep: [0.07, 0.11, 0.1], calm: 0.3, tint: [0.92, 1.0, 1.04], shore: PARADISE_PAL.shore }),
    };
  }, [props.mobile, props.effects > 0.5]);
  return (
    <>
      <WorldBase id="paradise" def={def} pal={PARADISE_PAL} props={props} tip={[0.5, 0.56, 0.16]} pathTint={[1, 0.95, 0.76]} tall={0.8} />
      <mesh material={b.water} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-4}>
        <planeGeometry args={[5200, 5200]} />
      </mesh>
      <mesh geometry={b.steps} material={b.tempera} />
      <mesh geometry={b.set} material={b.tempera} />
      <points geometry={b.flowersA} material={b.flowerA} />
      <points geometry={b.flowersB} material={b.flowerB} />
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
    </>
  );
}
