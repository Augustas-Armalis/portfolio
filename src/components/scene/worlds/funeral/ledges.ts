import * as THREE from "three";
import { Kit, noise2, type Halo, type V3 } from "../kit";
import type { AngelSpot } from "../../home/Angels";
import { funeralLand } from "./land";

// The watchers: great winged figures standing on the rock above the road, looking down on the procession (the home
// forest's angels, worlds home/Angels.tsx, whose robes go to mist below the knee). Five stand on the mountain's own
// flanks, where the land has risen over the road, each with one small light at its feet; two stand on tall dark
// needles of rock either side of the gate over the abyss. Nothing is built for them to stand on but the rock itself.
export function buildWatchers() {
  const L = funeralLand();
  const k = new Kit();
  const halos: Halo[] = [];
  const angels: AngelSpot[] = [];
  const stone: V3 = [0.006, 0.012, 0.045];
  const stoneTop: V3 = [0.012, 0.024, 0.075];
  const flank = (i: number, side: number, rise: number, from = 70) => {
    const p = L.pts[i];
    const nx = -L.tan[i][1] * side;
    const nz = L.tan[i][0] * side;
    for (const r of [rise, rise * 0.55]) for (let d = from; d < 520; d += 8) {
      const x = p.x + nx * d;
      const z = p.z + nz * d;
      const g = L.ground(x, z);
      if (g >= L.y[i] + r) return { x, z, g, to: [-nx, -nz] as [number, number] };
    }
    return null;
  };
  const onFlank = (i: number, side: number, rise: number, s: number, from?: number) => {
    const f = flank(i, side, rise, from);
    if (!f) return;
    // (a little way into the slope, so the feet are in the rock and the mist hides the join)
    const x = f.x + f.to[0] * 3;
    const z = f.z + f.to[1] * 3;
    const y = L.ground(x, z) - 1.2;
    angels.push({ x, y, z, yaw: Math.atan2(f.to[0], f.to[1]), s, robe: angels.length % 4 });
    halos.push({ p: [x + f.to[0] * 2, y + 2.2, z + f.to[1] * 2], size: s * 0.5, col: [1, 0.72, 0.34], k: 0.3 });
  };
  onFlank(L.iOut + 14, -1, 70, 15, 40);
  onFlank(L.iOut + 30, 1, 90, 17, 46);
  onFlank(L.iOut + 120, -1, 110, 20, 80);
  onFlank(L.iPass - 330, 1, 100, 21, 80);
  onFlank(L.iPass - 180, -1, 120, 21, 80);
  // the gate: a needle of rock each side, going up out of the abyss, an angel on the point of each
  const gp = L.gate;
  const gy = L.ground(gp.x, gp.z) + gp.above;
  const c = Math.cos(gp.yaw);
  const sn = Math.sin(gp.yaw);
  for (const side of [-1, 1]) {
    const x = gp.x + c * side * 62 + sn * -14;
    const z = gp.z - sn * side * 62 + c * -14;
    const base = L.ground(x, z) - 40;
    const top = gy - 4;
    const H = top - base;
    const g = new THREE.CylinderGeometry(0.8, 15, H, 11, 16, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const r = 1 + (noise2(a * 2 + side * 5, y * 0.03) - 0.5) * 0.5 + (noise2(a * 6, y * 0.09 + 3) - 0.5) * 0.18;
      p.setX(i, p.getX(i) * r);
      p.setZ(i, p.getZ(i) * r);
    }
    k.add(g, [x, base + H / 2, z], stone, { top: stoneTop });
    angels.push({ x, y: top - 3, z, yaw: gp.yaw, s: 13, robe: angels.length % 4 });
    halos.push({ p: [x, top + 3, z], size: 7, col: [1, 0.74, 0.36], k: 0.35 });
  }
  return { geo: k.build(), halos, angels };
}
