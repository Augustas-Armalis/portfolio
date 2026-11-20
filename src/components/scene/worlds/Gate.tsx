"use client";

import * as THREE from "three";
import { buildGrove, type Kind, type Tree } from "../Trees";
import { Halos, Mist, WorldBase, useDisposable, type WorldProps } from "./common";
import { Kit, angel, cloudMesh, makeCloudMaterial, makeTempera, noise2, ridge2, rng, type Cloud, type GroundPalette, type Halo, type Puff, type V3 } from "./kit";
import { Birds, LightShafts, type Flock, type Shaft } from "./life";
import { WORLDS, groundAt, pathOf } from "./voyage";

// The mountain gate, under the sky of "Offering" (Auka, 1909). The valley
// climbs to a pass between two mountains that lean in until their summits
// cross, a gate as tall as the sky; needles of rock stand in ranks at their
// feet; on a ledge an altar sends up two smokes, one white and one dark, that
// lean together across the gap; and on the terrace opposite stands an angel,
// very tall, watching them rise. The last light comes through the pass.

const def = WORLDS.gate;
export const GATE_PAL: GroundPalette = { a: [0.15, 0.17, 0.07], b: [0.26, 0.21, 0.08], c: [0.1, 0.13, 0.08], rock: [0.2, 0.17, 0.18], high: [0.24, 0.2, 0.19], highAt: [34, 70] };

// (colossal: over six hundred metres, leaning in until their summits cross far over the pass)
export const PEAKS = { z: -330, off: 250, r: 165, h: 640, lean: 320 };

// One mountain: rings of rock climbing and leaning toward the other, ridged
// and gullied, a little different on every side.
function peak(side: number, seed: number, mobile: boolean) {
  const nA = mobile ? 72 : 120;
  const nH = mobile ? 40 : 70;
  const H = PEAKS.h * (side < 0 ? 1 : 0.93);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const base: V3 = [0.13, 0.105, 0.14];
  const mid: V3 = [0.27, 0.215, 0.2];
  const topC: V3 = [0.56, 0.4, 0.3];
  for (let j = 0; j <= nH; j++) {
    const k = j / nH;
    const y = -14 + (H + 14) * Math.pow(k, 0.92);
    // the axis leans in, further the higher it goes, and wanders a little
    const cx = side * (PEAKS.off - PEAKS.lean * Math.pow(k, 1.35)) + Math.sin(k * 7 + seed) * 6 * k;
    const cz = side * -20 * k + Math.cos(k * 5 + seed) * 5;
    const rr = PEAKS.r * Math.pow(1 - k, 0.82) + 1.2 * (1 - k);
    for (let i = 0; i <= nA; i++) {
      const a = (i / nA) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // ridges that run down the mountain, cut by beds that run across it
      const rib = ridge2(ca * 2.1 + seed, sa * 2.1 + k * 1.3 - seed, 4);
      const bed = noise2(k * 26 + seed, a * 0.7);
      const cut = 1 + 0.42 * (rib - 0.42) + 0.07 * (bed - 0.5) + 0.05 * Math.sin(a * 9 + k * 14 + seed);
      const r = rr * cut * (j === nH ? 0.02 : 1);
      pos.push(cx + ca * r, y, cz + sa * r);
      const t = Math.min(1, Math.max(0, k * 1.15 + (rib - 0.4) * 0.3));
      const c = t < 0.55 ? base.map((b, q) => b + (mid[q] - b) * (t / 0.55)) : mid.map((m, q) => m + (topC[q] - m) * ((t - 0.55) / 0.45));
      col.push(c[0], c[1], c[2], 0);
    }
  }
  const row = nA + 1;
  for (let j = 0; j < nH; j++)
    for (let i = 0; i < nA; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aCol", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// a needle of rock: tall, thin, a little bent, as they stand in the picture
function needle(k: Kit, x: number, y: number, z: number, h: number, w: number, col: V3, top: V3, r: () => number) {
  const g = new THREE.ConeGeometry(w, h, 6, 5);
  const p = g.attributes.position;
  const bend = (r() - 0.5) * w * 1.6;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    p.setX(i, p.getX(i) * (1 + 0.25 * Math.sin(t * 9 + x)) + bend * t * t);
    p.setZ(i, p.getZ(i) * (1 + 0.2 * Math.cos(t * 7 + z)));
  }
  g.computeVertexNormals();
  k.add(g, [x, y + h / 2 - 2, z], col, { top, flat: true });
}

export default function GateWorld({ props }: { props: WorldProps }) {
  const b = useDisposable(() => {
    const r = rng(1909);
    const g = (x: number, z: number) => groundAt(def, x, z);
    const pts = pathOf("gate").pts;
    const nearPath = (x: number, z: number, d: number) => pts.some((q, j) => j % 3 === 0 && Math.hypot(q.x - x, q.z - z) < d);

    const k = new Kit();
    // ranks of needles at the mountains' feet, orange and plum
    const ranks = props.mobile ? 60 : 170;
    for (let i = 0; i < ranks; i++) {
      const side = i % 2 ? 1 : -1;
      const a = side > 0 ? -0.5 + r() * 2.6 : Math.PI - 2.1 + r() * 2.6;
      const d = PEAKS.r * (0.8 + r() * 0.65);
      const x = side * PEAKS.off + Math.cos(a) * d;
      const z = PEAKS.z + Math.sin(a) * d * 0.9 + 30;
      if (Math.abs(x) < 26 || nearPath(x, z, 18)) continue;
      const h = 22 + r() * r() * 120;
      const warm = r() < 0.55;
      needle(k, x, g(x, z), z, h, 2.2 + h * 0.07, warm ? [0.3, 0.14, 0.07] : [0.13, 0.085, 0.14], warm ? [0.62, 0.3, 0.13] : [0.3, 0.2, 0.3], r);
    }
    // the terrace on the left, in broad steps, where the angel stands
    const tx = -96;
    const tz = -150;
    const ty = g(tx, tz);
    for (let i = 0; i < 5; i++) k.box(74 - i * 11, 7, 60 - i * 8, [tx - i * 4, ty + 3.5 + i * 7 - 4, tz - i * 3], [0.2, 0.15, 0.1], { top: [0.42, 0.33, 0.16], rot: [0, 0.3, 0] });
    const terraceTop = ty + 5 * 7 - 4;
    angel(k, [tx - 14, terraceTop, tz - 10], 40, 1.05, [0.88, 0.84, 0.74], { glow: 0.12, open: 0.5 });
    // the altar on its ledge to the right
    const ax = 74;
    const az = -236;
    const ay = g(ax, az);
    for (let i = 0; i < 3; i++) k.box(22 - i * 5, 5, 22 - i * 5, [ax, ay + 2.5 + i * 5 - 2, az], [0.22, 0.14, 0.12], { top: [0.44, 0.26, 0.14] });
    k.box(5, 1.2, 5, [ax, ay + 13.6, az], [1, 0.6, 0.25], { glow: 1.6 });
    // the great arc drawn across the whole sky
    const arc: V3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = -0.25 + t * 2.0;
      arc.push([-700 + 1400 * t, 160 + Math.sin(a) * 620, -820 + 240 * Math.sin(t * Math.PI)]);
    }
    // a string of pearls of light, as he drew it
    k.tube(arc, 3.2, [0.95, 0.8, 0.5], { glow: 0.6, seg: 200, sides: 6 });
    const pearls: Halo[] = arc.filter((_, i) => i % 2 === 0).map((p) => ({ p, size: 9, col: [1, 0.84, 0.56] as V3, k: 0.5 }));

    // the two smokes: the white one stands straight up and opens out; the dark one coils round it
    const white: Cloud[] = [];
    const dark: Cloud[] = [];
    const top = ay + 15;
    const nW = props.mobile ? 44 : 96;
    for (let i = 0; i < nW; i++) {
      const t = Math.pow(i / (nW - 1), 0.9);
      const y = top + 5 + t * 560 + (r() - 0.5) * 8;
      // a narrow stem that opens into a wide head, high over the pass
      const w = (6 + t * 18 + (t > 0.74 ? (t - 0.74) * 220 : 0)) * (0.8 + r() * 0.45);
      const spread = t > 0.74 ? (t - 0.74) * 280 : 3 + t * 8;
      white.push({ p: [ax - t * t * 60 + Math.sin(t * 9) * 5 + (r() - 0.5) * spread, y, az - t * 36 + Math.cos(t * 7) * 4 + (r() - 0.5) * spread], s: [w * 1.15, w * (t > 0.74 ? 0.7 : 1.35), w * 1.15], seed: r() * 10 });
    }
    const nD = props.mobile ? 48 : 110;
    for (let i = 0; i < nD; i++) {
      const t = Math.pow(i / (nD - 1), 0.85);
      // it coils round the white stem as it climbs, then spreads into one wide dark cloud leaning over the pass
      const coil = 22 + t * 60;
      const head = t > 0.6 ? (t - 0.6) / 0.4 : 0;
      const y = top + 4 + t * 460 + Math.sin(t * 5) * 14 + (r() - 0.5) * 10;
      const w = (7 + t * 30 + head * 50) * (0.8 + r() * 0.5);
      dark.push({ p: [ax - t * t * 40 + Math.sin(t * 8.4 + 1) * coil + head * 380 * r(), y + head * 80, az - t * 36 + Math.cos(t * 8.4 + 1) * coil + head * 60 * (r() - 0.3)], s: [w * 1.35, w * 0.78, w * 1.2], seed: r() * 10 });
    }
    const smokeW = makeCloudMaterial({ lit: 1.25, tint: [1, 0.96, 0.88], drift: 1.2 });
    const smokeD = makeCloudMaterial({ lit: 0.2, tint: [0.11, 0.11, 0.15], drift: 1.5 });

    // pines and spruces along the valley, in stands, dark against the mist
    const trees: (Tree & { y: number })[] = [];
    const stands = props.mobile ? 22 : Math.round(60 * props.trees);
    for (let s = 0; s < stands; s++) {
      const side = s % 2 ? 1 : -1;
      const cz = 420 - r() * 640;
      // how far out from the valley the wood is drawn follows the quality's draw distance
      const cx = side * (28 + r() * r() * 260 * Math.min(1, props.far));
      const kinds: Kind[] = s % 3 === 0 ? ["spruce", "spruce", "pine"] : s % 3 === 1 ? ["pine", "pine", "spruce"] : ["pine", "birch", "birch"];
      const n = props.mobile ? 3 : 4 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        const x = cx + (r() - 0.5) * 34;
        const z = cz + (r() - 0.5) * 30;
        if (nearPath(x, z, 12) || def.canvases.some((c) => Math.hypot(x - c.x, z - c.z) < 34) || Math.hypot(Math.abs(x) - PEAKS.off, z - PEAKS.z) < PEAKS.r * 0.9) continue;
        if (Math.hypot(x - tx, z - tz) < 50 || Math.hypot(x - ax, z - az) < 22) continue;
        trees.push({ x, z, y: g(x, z), s: 1.2 + r() * 0.9, kind: kinds[Math.floor(r() * kinds.length)], v: Math.floor(r() * 2), rot: r() * 6.28, tint: r() });
      }
    }
    const grove = buildGrove(trees, { mobile: props.mobile, fog: 0.0011, tint: [0.72, 0.74, 0.8] });

    // mist lying in the pass and along the valley floor
    const puffs: Puff[] = [];
    for (let i = 0; i < (props.mobile ? 20 : 44); i++) puffs.push({ p: [(r() - 0.5) * 120, g(0, PEAKS.z) + 10 + r() * 140, PEAKS.z + 120 - r() * 260], size: 30 + r() * 40, a: 0.85 });
    for (let i = 0; i < 12; i++) puffs.push({ p: [(r() - 0.5) * 420, 9 + r() * 8, 380 - r() * 520], size: 50 + r() * 50, a: 0.55 });
    // light falling from above into the gorge between the mountains, and a few birds circling the crossed summits
    const shafts: Shaft[] = [];
    for (let i = 0; i < (props.mobile ? 4 : 7); i++) shafts.push({ x: (r() - 0.5) * 90, z: PEAKS.z + 160 - r() * 300, y0: g(0, PEAKS.z) - 4, y1: 470, r: 10 + r() * 16, k: 0.7 + r() * 0.5 });
    const flocks: Flock[] = [
      { c: [0, 520, PEAKS.z], r: 160, n: props.mobile ? 6 : 12, size: 3.0, speed: 13 },
      { c: [0, 120, 60], r: 140, n: props.mobile ? 6 : 12, size: 1.6, speed: 11 },
      { c: [ax, 300, az], r: 70, n: props.mobile ? 4 : 8, size: 1.6, speed: 9 },
    ];
    // stars set in the dark face of the terrace, as on the cliff in the picture
    const stars: Halo[] = [];
    for (let i = 0; i < (props.mobile ? 14 : 30); i++) {
      const u = (r() - 0.5) * 66;
      const v = 4 + r() * 26;
      stars.push({ p: [tx + Math.cos(0.3) * u + Math.sin(0.3) * 31, ty + v - 4, tz - Math.sin(0.3) * u + Math.cos(0.3) * 31], size: 1.6 + r() * 1.6, col: [1, 0.84, 0.46], k: 0.9 });
    }
    const halos: Halo[] = [
      { p: [ax, ay + 15.5, az], size: 9, col: [1, 0.62, 0.26], k: 1.1 },
      { p: [tx - 14, terraceTop + 70, tz - 10], size: 60, col: [1, 0.9, 0.7], k: 0.22 },
    ];
    // the last light through the pass: a glow hanging in the gap
    const glows: Halo[] = [
      { p: [0, g(0, PEAKS.z) + 90, PEAKS.z - 80], size: 360, col: [1, 0.72, 0.42], k: 0.16 },
      { p: [0, g(0, PEAKS.z) + 40, PEAKS.z - 30], size: 100, col: [1, 0.82, 0.56], k: 0.14 },
    ];
    return {
      left: peak(-1, 1.3, props.mobile),
      right: peak(1, 4.1, props.mobile),
      rock: makeTempera({ amb: 0.85, key: 0.5, strata: 1, dab: 1.3, grain: 1, ao: 0.6, aoH: 160, wrap: 0.6, rim: [0.6, 0.38, 0.18], rimPow: 3.5 }),
      set: k.build(),
      tempera: makeTempera({ amb: 0.9, key: 0.36, strata: 0.5, grain: 1, ao: 0.35, aoH: 30, wrap: 0.4 }),
      shafts,
      flocks,
      stars,
      pearls,
      white: cloudMesh(white, smokeW, props.mobile ? 2 : 3),
      dark: cloudMesh(dark, smokeD, props.mobile ? 2 : 3),
      smokeW,
      smokeD,
      grove,
      puffs,
      halos,
      glows,
    };
  }, [props.mobile, props.trees, props.far]);
  return (
    <>
      <WorldBase id="gate" def={def} pal={GATE_PAL} props={props} tip={[0.4, 0.36, 0.14]} pathTint={[1, 0.86, 0.6]} />
      <mesh geometry={b.left} material={b.rock} position={[0, 8, PEAKS.z]} />
      <mesh geometry={b.right} material={b.rock} position={[0, 8, PEAKS.z]} />
      <mesh geometry={b.set} material={b.tempera} />
      <primitive object={b.white} />
      <primitive object={b.dark} />
      {b.grove.sets.map((s, i) => (
        <primitive key={i} object={s} />
      ))}
      {props.effects > 0.2 && <Mist puffs={b.puffs} />}
      <Halos list={b.glows} kind={2} />
      <Halos list={b.halos} />
      <Halos list={b.pearls} />
      <Halos list={b.stars} kind={1} />
      <LightShafts list={b.shafts} tint={[1, 0.82, 0.52]} />
      <Birds flocks={b.flocks} tint={[0.1, 0.08, 0.08]} />
    </>
  );
}
