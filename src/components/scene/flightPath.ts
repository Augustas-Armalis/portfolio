// The road out of the desk's field: it leaves the desk along the dirt path
// and runs, nearly straight, through a long avenue of pines and birches to
// the first gate. Everything at home that needs to know where the road runs
// (the trees that line it, the ground that wears it, the path of light, the
// plane) reads it from here. The worlds beyond the gate live in worlds/.

export const HOME_GATE_Z = -268; // where the first gate stands
export const AVENUE = { from: -34, to: HOME_GATE_Z + 14 };

// The road's x at a given z: straight, with the faintest sway.
export const roadX = (z: number) => 1.45 + 0.6 * Math.sin(z * 0.043 - 1.1) * Math.min(1, Math.abs(z) / 40);
// The height the path of light keeps above the road.
export const roadY = (z: number) => {
  const d = -z;
  const climb = Math.min(1, Math.max(0, d / 70));
  return 0.95 + (5.6 + 1.2 * Math.sin(d * 0.021)) * climb * climb * (3 - 2 * climb);
};

// Is (x, z) land the home trees may stand on, clear of the road and the gate?
export function clearOfRoad(x: number, z: number) {
  if (z < 4 && z > HOME_GATE_Z - 60 && Math.abs(x - roadX(z)) < 7) return false;
  if (Math.hypot(x - roadX(HOME_GATE_Z), z - HOME_GATE_Z) < 20) return false;
  return true;
}
