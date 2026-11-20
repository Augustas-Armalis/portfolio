// The island of Tranquility as numbers: its outline (the painting's own, read off the picture column by column),
// where its two eyes are, and the grotto between them. Nothing here draws or imports anything, so the journey's
// map (worlds/voyage.ts) can read it.

export const ISLAND = { x: 40, z: -640, half: 740, top: 290 };
const PROFILE = [
  0.0, 0.026, 0.054, 0.082, 0.099, 0.108, 0.115, 0.122, 0.14, 0.153, 0.152, 0.146, 0.144, 0.149, 0.159, 0.173, 0.19, 0.208, 0.231, 0.254, 0.273, 0.293, 0.314, 0.329, 0.341, 0.352, 0.359, 0.369, 0.378, 0.381, 0.378, 0.375, 0.378, 0.391, 0.418,
  0.453, 0.485, 0.514, 0.546, 0.577, 0.612, 0.648, 0.685, 0.729, 0.792, 0.866, 0.926, 0.965, 0.991, 1.0, 0.996, 0.978, 0.946, 0.928, 0.884, 0.775, 0.621, 0.446, 0.321, 0.265, 0.224, 0.175, 0.119, 0.059, 0.0,
];
const PN = PROFILE.length - 1;
// height of the back over a place along it (-1 the tip of the tail .. +1 the end of the spit), in metres
export const profJS = (xn: number) => {
  const f = Math.min(PN, Math.max(0, ((xn + 1) / 2) * PN));
  const i = Math.min(PN - 1, Math.floor(f));
  const t = f - i;
  const s = t * t * (3 - 2 * t);
  return ISLAND.top * (PROFILE[i] + (PROFILE[i + 1] - PROFILE[i]) * s);
};
export const PROF_GLSL = /* glsl */ `
const float ISL_P[${PROFILE.length}] = float[](${PROFILE.map((v) => v.toFixed(3)).join(", ")});
float islandProf(float xn){
  float f = clamp((xn + 1.0) * 0.5 * ${PN.toFixed(1)}, 0.0, ${PN.toFixed(1)});
  int i = int(min(floor(f), ${(PN - 1).toFixed(1)}));
  float t = f - float(i);
  return ${ISLAND.top.toFixed(1)} * mix(ISL_P[i], ISL_P[i + 1], t * t * (3.0 - 2.0 * t));
}`;
// how far it runs back from its face: a long narrow body, not a dome
export const halfDepth = (h: number) => 12 + h * 0.42;

// The two eyes: at the waterline on the island's face, under the head, close together (the painting sets them
// at 0.50 and 0.67 of the way from the middle to the end of the spit).
const EYE_XN = [0.5, 0.665];
export const EYES: [number, number, number][] = EYE_XN.map((xn) => {
  const h = profJS(xn);
  return [ISLAND.x + xn * ISLAND.half, 9, ISLAND.z + halfDepth(h) + 6];
});
// Between them, at the waterline, a low dark grotto runs into the rock: the way on. (x of its middle, z of the
// island's face there, half its width, its height, how far it runs in)
const GX = (EYES[0][0] + EYES[1][0]) / 2;
export const GROTTO = { x: GX, z: ISLAND.z + halfDepth(profJS((GX - ISLAND.x) / ISLAND.half)), half: 24, top: 27, deep: 120 };

