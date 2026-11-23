import * as THREE from "three";
import { Kit, angel, noise2, type Halo, type V3 } from "../kit";
import { funeralLand } from "./land";

// The watchers. Great winged figures stand on ledges cut in the mountain's flanks, high over the road, and look
// down on the procession; each is framed by an arch of dark stone behind it (a niche, open to the night) and has
// one small light at its feet, so from the road it is read first as a shape against the sky and then as a face
// turned toward you. Two stand over the landing where the boats come in; three along the valley, each on the
// side the road is farthest from; two on spires of rock either side of the gate over the abyss, to frame it.
// (the angel is the kit's own: worlds/kit.ts, the same slim robe and tall closed wings as every other world's)

type Spot = { x: number; z: number; y: number; yaw: number; s: number };

export function buildWatchers() {
  const L = funeralLand();
  const k = new Kit();
  const halos: Halo[] = [];
  const stone: V3 = [0.018, 0.03, 0.09];
  const stoneTop: V3 = [0.03, 0.06, 0.14];
  const robe: V3 = [0.035, 0.07, 0.17];
  const spots: Spot[] = [];

  // a place on the flank above the road at sample i, on one side, where the land has risen `rise` metres above the road
  const flank = (i: number, side: number, rise: number, from = 70) => {
    const p = L.pts[i];
    const nx = -L.tan[i][1] * side;
    const nz = L.tan[i][0] * side;
    for (let d = from; d < 520; d += 8) {
      const x = p.x + nx * d;
      const z = p.z + nz * d;
      const g = L.ground(x, z);
      if (g >= L.y[i] + rise) return { x, z, g, to: [-nx, -nz] as [number, number], d };
    }
    return null;
  };
  const ledge = (x: number, z: number, top: number, yaw: number, s: number, tall: boolean) => {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // the shelf: a block sunk into the slope, flat on top, its front a little ragged
    {
      const g = new THREE.CylinderGeometry(s * 0.82, s * 0.16, 90, 9, 8, true);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const y = p.getY(i);
        const r = 1 + (noise2(a * 2 + x * 0.01, y * 0.05) - 0.5) * 0.45 + (noise2(a * 6, y * 0.2 + 3) - 0.5) * 0.15;
        p.setX(i, p.getX(i) * r);
        p.setZ(i, p.getZ(i) * r * 0.8);
      }
      k.add(g, [x + fx * s * 0.2, top - 45, z + fz * s * 0.2], stone, { top: stoneTop, rot: [0, yaw, 0] });
    }
    k.box(s * 1.6, 1.6, s * 1.25, [x + fx * s * 0.2, top - 0.8, z + fz * s * 0.2], stoneTop, { rot: [0, yaw, 0] });
    // the niche: an arch of stone standing behind the figure, two legs and a round head
    const R = s * 0.62;
    const H = s * (tall ? 1.95 : 1.7);
    const bx = x - fx * s * 0.5;
    const bz = z - fz * s * 0.5;
    const cx = Math.cos(yaw);
    const cz = -Math.sin(yaw);
    const pts: V3[] = [];
    for (let i = 0; i <= 14; i++) {
      const a = (i / 14) * Math.PI;
      const u = Math.cos(a) * R;
      const v = Math.sin(a);
      pts.push([bx + cx * u, top + (v > 0.001 ? H * 0.42 + (H * 0.58) * v : 0) * (i === 0 || i === 14 ? 0.001 : 1) + (i === 0 || i === 14 ? 0 : 0), bz + cz * u]);
    }
    const arch: V3[] = [];
    arch.push([bx - cx * R, top, bz - cz * R], [bx - cx * R, top + H * 0.3, bz - cz * R]);
    for (let i = 0; i <= 12; i++) {
      const a = Math.PI - (i / 12) * Math.PI;
      arch.push([bx + cx * Math.cos(a) * R, top + H * 0.42 + H * 0.58 * Math.sin(a), bz + cz * Math.cos(a) * R]);
    }
    arch.push([bx + cx * R, top + H * 0.3, bz + cz * R], [bx + cx * R, top, bz + cz * R]);
    void pts;
    k.tube(arch, s * 0.07, stoneTop, { glow: 0.2, seg: 48, sides: 6 });
    // the figure: pale-robed, bowed a little toward the road, wings closed like a fan
    angel(k, [x + fx * s * 0.2, top, z + fz * s * 0.2], s * 0.62, yaw, robe, { glow: 0.12, wing: [0.07, 0.15, 0.32], bow: 0.12 });
    halos.push({ p: [x + fx * s * 0.6, top + 1.5, z + fz * s * 0.6], size: s * 0.22, col: [1, 0.72, 0.34], k: 0.45 });
  };
  const onFlank = (i: number, side: number, rise: number, s: number, from?: number) => {
    const f = flank(i, side, rise, from);
    if (!f) return;
    const yaw = Math.atan2(f.to[0], f.to[1]);
    // the shelf is cut a little way into the slope, and its top set over the land there
    const top = f.g + 3;
    const x = f.x + f.to[0] * 4;
    const z = f.z + f.to[1] * 4;
    ledge(x, z, top, yaw, s, true);
    spots.push({ x, z, y: top, yaw, s });
  };
  // over the landing, one on each hand, high
  onFlank(L.iOut + 14, -1, 70, 44, 40);
  onFlank(L.iOut + 30, 1, 90, 52, 46);
  // along the valley
  onFlank(L.iOut + 120, -1, 110, 56, 80);
  onFlank(L.iPass - 330, 1, 100, 60, 80);
  onFlank(L.iPass - 180, -1, 120, 60, 80);
  // framing the way on: two spires over the abyss, each with a figure on it
  const gp = L.gate;
  const gy = L.ground(gp.x, gp.z) + gp.above;
  const c = Math.cos(gp.yaw);
  const sn = Math.sin(gp.yaw);
  for (const side of [-1, 1]) {
    const x = gp.x + c * side * 62 + sn * -14;
    const z = gp.z - sn * side * 62 + c * -14;
    const base = L.ground(x, z) - 40;
    const top = gy - 6;
    const H = top - base;
    const g = new THREE.CylinderGeometry(3.4, 14, H, 11, 14, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const r = 1 + (noise2(a * 2 + side * 5, y * 0.03) - 0.5) * 0.5 + (noise2(a * 6, y * 0.09 + 3) - 0.5) * 0.18;
      p.setX(i, p.getX(i) * r);
      p.setZ(i, p.getZ(i) * r);
    }
    k.add(g, [x, base + H / 2, z], stone, { top: stoneTop });
    k.box(24, 2, 24, [x, top - 1, z], stoneTop, { rot: [0, gp.yaw, 0] });
    angel(k, [x, top, z], 20, gp.yaw, robe, { glow: 0.14, wing: [0.07, 0.15, 0.32], bow: 0.08 });
    halos.push({ p: [x, top + 3, z], size: 7, col: [1, 0.74, 0.36], k: 0.5 });
    spots.push({ x, z, y: top, yaw: gp.yaw, s: 32 });
  }
  return { geo: k.build(), halos, spots };
}
