import * as THREE from "three";
import { ORIGIN } from "../voyage";

// The air of the Funeral Symphony, shared by everything drawn in it: the world's own height fog (kit's applyAir)
// and, under it, mist lying in the valleys: thick below the road's lowest turn, thinning to nothing by the height
// of the pass, slowly drifting, paler toward the moon. Written once so the rock, the road, the souls and the
// cypresses all stand in the same mist.
//
// Needs GLSL_NOISE, GLSL_SKY and GLSL_AIR before it.
export const FUNERAL_U = {
  uFO: { value: new THREE.Vector3().copy(ORIGIN) },
  // x: how thick the valley mist is, y: the height it lies under, z: how fast it thins above that
  uValley: { value: new THREE.Vector3(1.25, 44, 100) },
  // metres along the road at which the souls come into being (inside the cave they walk out of)
  uBorn: { value: 0 },
  // metres along the road at which the souls reach the portal at the cave's end and are gone into it
  uEnd: { value: 1e5 },
  // the bell-light that passes up the procession: where its middle is (metres along the road; far below 0: none)
  uBell: { value: -1e5 },
  // how brightly the cave at the pass burns (1: as ever; it flares when the bell-light reaches it)
  uCaveK: { value: 1 },
};
export const GLSL_FUNERAL_AIR = /* glsl */ `
uniform vec3 uFO; uniform vec3 uValley; uniform float uBell; uniform float uCaveK; uniform float uBorn;
// the bell-light: how much of it lies on a place s metres along the road
float bellAt(float s){ float d = (s - uBell) / 70.0; return exp(-d * d); }
vec3 mistCol(vec3 d){
  // moonlit from the right: a cold pale blue, a breath of green in it, warmer toward the moon
  float m = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uKeyDir.x, 0.0, uKeyDir.z))), 0.0), 3.0);
  return mix(uHorizon * 0.62 + vec3(0.0, 0.006, 0.01), uHorizon * 0.7 + uKeyCol * 0.07, m);
}
float valleyAmt(vec3 wp){
  vec3 l = wp - uFO;
  float dist = length(wp - cameraPosition);
  // how deep in the mist the point lies, and how deep the eye does: the ray gathers it between the two
  float hp = exp(-max(l.y - uValley.y, 0.0) / uValley.z);
  float hc = exp(-max(cameraPosition.y - uFO.y - uValley.y, 0.0) / uValley.z);
  float dens = mix(hp, hc, 0.3);
  float n = vnoise(l.xz * 0.0035 + vec2(uTime * 0.004, -uTime * 0.0027)) * 0.6 + vnoise(l.xz * 0.011 + vec2(-uTime * 0.007, uTime * 0.004) + 4.0) * 0.4;
  dens *= 0.35 + 1.1 * smoothstep(0.25, 0.8, n);
  return clamp((1.0 - exp(-dist * 0.0022 * dens)) * uValley.x, 0.0, 0.94);
}
vec3 funeralAir(vec3 col, vec3 wp){
  vec3 d = normalize(wp - cameraPosition);
  col = mix(col, mistCol(d), valleyAmt(wp));
  return applyAir(col, wp);
}
`;
