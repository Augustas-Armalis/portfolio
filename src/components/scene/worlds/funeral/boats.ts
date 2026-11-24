import * as THREE from "three";
import { Kit, noise2, type Halo, type V3 } from "../kit";
import { ROAD_W, funeralLand } from "./land";

// The boats the souls came in by. The cave they walk out of is a channel of still water down to a stone landing,
// and at the landing the boats are drawn up, bows to the shore: long, low, black-blue, the stem and stern lifted,
// a lantern on a pole at the bow. Souls step off them and go up the road. A few more lie out in the water, coming in.

// a hull: a long ellipsoid, pointed and lifted at both ends, its top cut level (the deck, dark inside)
function hull(len: number, wide: number, seed: number) {
  const g = new THREE.SphereGeometry(1, 22, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i) * len * 0.5;
    const q = Math.abs(z) / (len * 0.5);
    let y = p.getY(i);
    // the underside is shallow and flat, the top is cut at the gunwale
    y = y < 0 ? y * 0.42 : Math.min(y, 0.3);
    const pinch = 1 - 0.62 * Math.pow(q, 3);
    const x = p.getX(i) * wide * 0.5 * pinch * (1 + (noise2(i * 0.31 + seed, 2.1) - 0.5) * 0.03);
    p.setXYZ(i, x, y * 1.0 + 1.25 * Math.pow(q, 3.2) * (y > -0.2 ? 1 : 0.6), z);
  }
  g.computeVertexNormals();
  return g;
}

export function buildBoats() {
  const L = funeralLand();
  const k = new Kit();
  const halos: Halo[] = [];
  const wood: V3 = [0.012, 0.018, 0.05];
  const inner: V3 = [0.004, 0.006, 0.02];
  const at = (i: number, u: number): [number, number, number, [number, number]] => {
    const p = L.pts[i];
    const t = L.tan[i];
    return [p.x - t[1] * u, L.y[i] - 1.1, p.z + t[0] * u, [t[0], t[1]]];
  };
  // [road sample, across, length, yaw off the road's line]
  const list: [number, number, number, number][] = [
    [L.iDock - 5, -7.6, 15, 0.03],
    [L.iDock - 5, -2.6, 14, -0.05],
    [L.iDock - 5, 2.6, 16, 0.04],
    [L.iDock - 5, 7.8, 14, -0.03],
    [L.iDock - 17, -5.2, 14, 0.08],
    [L.iDock - 18, 4.8, 15, -0.1],
    [L.iDock - 31, 0.5, 14, 0.18],
    [L.iDock - 46, -4, 15, -0.3],
  ];
  list.forEach(([i, u, len, yaw], n) => {
    const [x, y, z, t] = at(i, u);
    const ang = Math.atan2(t[0], t[1]) + yaw; // along the way they walk: the bow toward the landing
    const w = len * 0.2;
    k.add(hull(len, w, n * 7), [x, y + 0.45, z], wood, { rot: [0, ang, 0], top: [0.03, 0.07, 0.13] });
    // the dark of the inside, a little under the gunwale
    k.add(new THREE.BoxGeometry(w * 0.62, 0.1, len * 0.58), [x, y + 0.66, z], inner, { rot: [0, ang, 0] });
    const fx = Math.sin(ang);
    const fz = Math.cos(ang);
    // a thwart or two, and the lantern pole at the bow
    for (const d of [-0.18, 0.12]) k.add(new THREE.BoxGeometry(w * 0.8, 0.08, 0.3), [x + fx * len * d, y + 0.88, z + fz * len * d], wood, { rot: [0, ang, 0] });
    const bx = x + fx * (len * 0.5 - 0.5);
    const bz = z + fz * (len * 0.5 - 0.5);
    k.add(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 5), [bx, y + 3.0, bz], wood);
    k.add(new THREE.BoxGeometry(0.5, 0.65, 0.5), [bx, y + 5.2, bz], [1.0, 0.72, 0.3], { glow: 1.5 });
    halos.push({ p: [bx, y + 5.2, bz], size: 2.6, col: [1, 0.74, 0.34], k: 0.8 });
  });
  void ROAD_W;
  return { geo: k.build(), halos };
}
