import * as THREE from "three";

// The paper plane's route: one long, nearly straight road. It leaves the desk
// along the dirt path and runs out through the land, past the Čiurlionis
// stations, through the passes in the hills, to two mountains that lean
// together like a gate; beyond them the sea opens, and in it the dark island
// with two lit eyes. Everything that needs to know where the road runs (the
// rail, the trees that keep clear of it, the hills that part for it, the
// stations, the free-flight bounds) reads it from here.

export const ROUTE = {
  gateZ: -505, // the two leaning mountains
  shoreZ: -545, // where the land ends and the sea begins
  islandZ: -770, // the island with two eyes
  islandX: 96,
  endZ: -770, // where the rail stops running straight and circles the island
  orbitR: 95,
  corridor: 62, // free flight is turned back beyond this distance from the road
};

// The road's x at a given z: straight, with the faintest sway.
export const roadX = (z: number) => 1.45 + 0.6 * Math.sin(z * 0.043 - 1.1) * Math.min(1, Math.abs(z) / 40);
// Cruise height above the ground along the road.
export const roadY = (z: number) => {
  const d = -z;
  const climb = Math.min(1, Math.max(0, d / 70));
  return 0.95 + (6.2 + 1.6 * Math.sin(d * 0.021)) * climb * climb * (3 - 2 * climb) + (d > 470 ? Math.min(7, (d - 470) * 0.05) : 0);
};

// ---------- stations ----------

export type StationId = "forest" | "sun" | "stars" | "rex" | "fairy" | "paradise";
export type Station = {
  id: StationId;
  title: string;
  year: string;
  file: string | null; // the painting shown on the left, when we have it
  aspect: number; // width / height of the painting
  z: number; // where on the road the interpretation is centred
  hour: number; // the time of day the sky leans to here
};

export const STATIONS: Station[] = [
  { id: "forest", title: "The Forest", year: "1907", file: null, aspect: 1, z: -78, hour: 9.2 },
  { id: "sun", title: "Sonata of the Sun. Allegro", year: "1907", file: "/assets/ciurlionis/sun-allegro.jpg", aspect: 574 / 651, z: -150, hour: 18.3 },
  { id: "stars", title: "Sonata of the Stars. Allegro", year: "1908", file: "/assets/ciurlionis/stars-allegro.jpg", aspect: 1920 / 2238, z: -226, hour: 23.3 },
  { id: "rex", title: "Rex", year: "1909", file: "/assets/ciurlionis/rex.jpg", aspect: 1280 / 1437, z: -300, hour: 20.4 },
  { id: "fairy", title: "Fairy Tale. Castle Fairy Tale", year: "1909", file: "/assets/ciurlionis/fairy-tale.jpg", aspect: 1920 / 1420, z: -372, hour: 15.3 },
  { id: "paradise", title: "Paradise", year: "1909", file: "/assets/ciurlionis/paradise.jpg", aspect: 1280 / 943, z: -444, hour: 11.6 },
];
// The sea beyond the gate has its own hour: the long dusk of "Tranquility".
export const SEA_HOUR = 19.72;

export const CANVAS_LEAD = 21; // metres before a station's centre where its painting stands

// Which station the plane is in (if any) and how strongly, 0..1, and how far
// out to sea it is, 0..1.
export function stationAt(z: number): { index: number; w: number; sea: number } {
  let best = -1;
  let bw = 0;
  for (let i = 0; i < STATIONS.length; i++) {
    const d = Math.abs(z - (STATIONS[i].z + 4));
    const k = 1 - Math.min(1, Math.max(0, (d - 20) / 36));
    const w = k * k * (3 - 2 * k);
    if (w > bw) {
      bw = w;
      best = i;
    }
  }
  const s = Math.min(1, Math.max(0, (ROUTE.gateZ + 26 - z) / 46));
  return { index: best, w: bw, sea: s * s * (3 - 2 * s) };
}

// Is (x, z) land the trees may stand on, clear of the road and the stations?
export function clearOfRoad(x: number, z: number) {
  if (z < ROUTE.shoreZ + 26) return false;
  if (z < 4 && z > ROUTE.shoreZ && Math.abs(x - roadX(z)) < 13) return false;
  for (const s of STATIONS) if (s.id !== "forest" && Math.abs(z - s.z) < 30 && Math.abs(x - roadX(z)) < 46) return false;
  return true;
}

const v = new THREE.Vector3();
export function roadPoint(z: number, out = v) {
  return out.set(roadX(z), roadY(z), z);
}
