import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { KINGS, ORIGIN, kingsDome } from "../voyage";

// The light and the air of the kings' wood, shared by everything that stands in it.
//
// There is one light: the little world the kings hold. It falls on whatever faces it, the kings themselves
// cast their great shadows away from it into the wood, and it hangs in the mist: the warmth gathered along
// each line of sight is worked out exactly (it thins with the square of the distance, and that sums to an
// arctangent), then weighed by how much mist lies where the line passes nearest the light and by whether
// that place is in a king's shadow. So the glow lies in front of far trunks and behind near ones, the shade
// of the two bowed figures stands in the air as dark wedges, and between them the light goes up and out as
// broad soft shafts. No lit card anywhere: nothing has an edge.
//
// The mist itself is thick between the roots, thinner through the trunks, thin above, in slow drifting
// banks; cold blue-teal, and it takes the colour of the banded night behind it, so the far wood dissolves
// into the sky before its geometry ends.

export const R = KINGS.domeR;
export const DOME_AT = kingsDome();
export const BY = DOME_AT.y;
// the kings as the light sees them: four rounded masses (two bodies, two crowned heads), in the scene's own coordinates
const occ = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(ORIGIN.x + x * R, BY + y * R, ORIGIN.z + KINGS.z + z * R);
export const DOME_U = {
  uDome: { value: new THREE.Vector3(ORIGIN.x, ORIGIN.y + BY, ORIGIN.z + KINGS.z) },
  uR: { value: R },
  uOccC: { value: [occ(-3.55, -0.4, 0), occ(-2.3, 2.5, 0), occ(3.75, 0.2, 0), occ(2.2, 2.95, 0)] },
  uOccR: { value: [new THREE.Vector3(1.5 * R, 2.7 * R, 1.7 * R), new THREE.Vector3(0.85 * R, 0.8 * R, 0.8 * R), new THREE.Vector3(1.55 * R, 3.1 * R, 1.75 * R), new THREE.Vector3(0.9 * R, 0.8 * R, 0.85 * R)] },
  // x: how thick the mist is (per metre at its thickest), y: how much of the light hangs in it, z: how strongly the shafts are cut, w: how light the mist itself is
  uFogK: { value: new THREE.Vector4(0.0066, 1.3, 1, 0.73) },
  // what happens as the plane comes on (set each frame by the world): x: the little world's light (1, and brighter as
  // the kings lean to it), y: how far they have leaned (0..1), z: how many of the stars are out (0..1)
  uEvt: { value: new THREE.Vector4(1, 0, 0.3, 0) },
};
export const KINGS_UNIFORMS = { ...SKY_U, ...DOME_U };
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __kingsU: DOME_U });

// (the core alone, for shaders that already carry the noise and the sky: the ground)
export const GLSL_KINGS_CORE = /* glsl */ `
uniform vec3 uDome; uniform float uR; uniform vec3 uOccC[4]; uniform vec3 uOccR[4]; uniform vec4 uFogK; uniform vec4 uEvt;
const vec3 DOME_WARM = vec3(1.0, 0.62, 0.31);

// ---- the night behind the wood ----
// long level strokes of blue, lighter and darker, low between the trunks; darker overhead
vec3 nightBands(vec3 d){
  float e = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, -d.z);
  vec3 col = mix(vec3(0.01, 0.025, 0.038), vec3(0.002, 0.006, 0.012), smoothstep(0.08, 0.95, e));
  float st = vnoise(vec2(az * 2.2, e * 110.0)) * 0.6 + vnoise(vec2(az * 7.0 + 3.0, e * 240.0 + 7.0)) * 0.4;
  float low = smoothstep(-0.05, 0.03, e) * (1.0 - smoothstep(0.22, 0.7, e));
  // (the bands are quiet: a few long strokes a shade lighter, never stripes)
  vec3 blue = mix(vec3(0.013, 0.032, 0.05), vec3(0.022, 0.05, 0.074), smoothstep(0.5, 0.74, st));
  col = mix(col, blue, smoothstep(0.45, 0.62, st) * low * 0.75);
  return mix(col, vec3(0.008, 0.018, 0.024), smoothstep(0.0, -0.08, e));
}

// ---- the mist ----
float mistAt(vec3 p){
  float h = abs(p.y);
  vec2 q = p.xz * 0.0052 + vec2(uTime * 0.0055, -uTime * 0.0035);
  float n = vnoise(q) * 0.62 + vnoise(q * 2.9 + vec2(4.1 - uTime * 0.012, 1.7 + uTime * 0.008) + p.y * 0.011) * 0.38;
  float bank = smoothstep(0.22, 0.8, n);
  // a blanket that lies between the roots, a taller haze through the trunks, thin air above
  // (it stands back from the little world: in the glade the air is clearer, and what is dark there stays dark)
  float open = mix(0.4, 1.0, smoothstep(140.0, 520.0, length(p.xz - uDome.xz)));
  // (and a third, slower layer: deep banks rolling between the trunks at the height of the towns' feet)
  vec2 q3 = p.xz * 0.0028 + vec2(-uTime * 0.0021, uTime * 0.0016);
  float mid = smoothstep(0.35, 0.85, vnoise(q3 + 11.0)) * exp(-abs(p.y - 46.0) / 26.0);
  return (exp(-h / 12.0) * (0.22 + 2.1 * bank) + exp(-h / 75.0) * (0.22 + 0.5 * bank) + mid * 0.55 + 0.05) * open;
}

// ---- the light ----
// is a point in a king's shadow? (soft: 1 in the light, 0 behind him)
float domeVis(vec3 p){
  vec3 L = uDome + vec3(0.0, uR * 0.35, 0.0);
  float v = 1.0;
  for (int i = 0; i < 4; i++) {
    vec3 a = (L - uOccC[i]) / uOccR[i];
    vec3 d = (p - uOccC[i]) / uOccR[i] - a;
    float t = clamp(-dot(a, d) / max(dot(d, d), 1e-4), 0.0, 1.0);
    v *= smoothstep(0.78, 1.32, length(a + d * t));
  }
  return v;
}
// how strongly it lights a surface at P facing n (x), and how near it is (y)
vec2 domeLight(vec3 P, vec3 n){
  vec3 L = uDome + vec3(0.0, uR * 0.35, 0.0) - P; float d = length(L); L /= max(d, 0.001);
  // (it breathes with the two who hold it, a twentieth brighter and dimmer)
  float att = uEvt.x * (1.0 + 0.05 * sin(uTime * 0.38)) / (1.0 + d * d / (uR * uR * 7.5));
  // it shines up and out: the dish and the hands shade whatever lies below it
  att *= smoothstep(-0.62, 0.1, -L.y);
  return vec2(dot(n, L), att);
}
// broad soft shafts: the light broken by all that stands round it. They belong to the world, not the eye:
// each is a direction out from the little world, and stays where it is as the eye moves past.
float domeBeams(vec3 v){
  float r = length(v);
  vec3 d = v / max(r, 0.001);
  // (laid on the directions as seen from above, so there is no seam and nothing gathers straight overhead)
  vec2 q = d.xz * (1.0 + 0.5 * d.y * d.y);
  float n = vnoise(q * 4.6 + vec2(1.0, uTime * 0.006)) * 0.6 + vnoise(q * 11.0 + vec2(-uTime * 0.009, 3.0) + d.y * 2.0) * 0.4;
  float beam = smoothstep(0.3, 0.74, n);
  float wide = smoothstep(uR * 1.3, uR * 5.0, r);
  return mix(1.0, 0.3 + 1.3 * beam, wide * uFogK.z);
}

// everything is seen through the mist, and the light hangs in it (ro: where it is seen from)
vec3 airFrom(vec3 col, vec3 ro, vec3 P){
  vec3 rd = P - ro; float len = length(rd); rd /= max(len, 0.001);
  float m0 = mistAt(ro + rd * (len * 0.14));
  float m1 = mistAt(ro + rd * (len * 0.5));
  float m2 = mistAt(ro + rd * (len * 0.88));
  float od = len * ((m0 + m1 + m2) * 0.3333 * uFogK.x + uMist);
  float T = exp(-od);
  // (its own colour: the night's blue-teal, a little lighter where the eye looks level through the most of it)
  vec3 fc = mix(vec3(0.02, 0.043, 0.05), vec3(0.006, 0.013, 0.019), smoothstep(0.0, 0.55, rd.y));
  // (looking down into the floor of the wood it is the brown-black of the trunks, not the night's blue)
  fc = mix(fc, vec3(0.021, 0.019, 0.016), smoothstep(0.02, -0.22, rd.y)) * uFogK.w;
  col = col * T + fc * (1.0 - T);
  // the warmth gathered along the line
  vec3 C = uDome + vec3(0.0, uR * 0.4, 0.0);
  vec3 oc = ro - C; float b = dot(oc, rd);
  vec3 q = oc - rd * b; float p2 = dot(q, q);
  float s = sqrt(p2 + uR * uR * 0.5);
  float gathered = (atan((len + b) / s) - atan(b / s)) / s;
  float tc = clamp(-b, 0.0, len);
  vec3 pc = ro + rd * tc;
  float dens = mistAt(pc);
  float k = (0.4 + 0.75 * dens * uFogK.y) * mix(0.3, 1.0, domeVis(pc)) * domeBeams(pc - C);
  // (what lies between the eye and that place dims it a little)
  k *= exp(-od * (tc / max(len, 0.001)) * 0.6);
  // it does not light the air beneath the dish
  k *= mix(0.2, 1.0, smoothstep(-0.7, 0.15, q.y / max(sqrt(p2), 1.0)));
  return col + DOME_WARM * gathered * k * uR * 0.082 * (1.0 + uPulse * 0.25) * (1.0 + 0.05 * sin(uTime * 0.38)) * uEvt.x;
}
vec3 kingsAir(vec3 col, vec3 P){ return airFrom(col, cameraPosition, P); }

// ---- the hand ----
// chalky dabs of a loaded brush, the same on everything
float dabs(vec3 p){ return vnoise(p.xz * 0.23 + p.y * 0.19) * 0.6 + vnoise(p.xy * 0.9 + p.z * 0.7) * 0.4; }
// a height drawn on a surface pushes its normal about (Mikkelsen's way, from the screen's own derivatives)
vec3 bumpN(vec3 n, vec3 P, float h, float k){
  vec3 dpx = dFdx(P); vec3 dpy = dFdy(P);
  float hx = dFdx(h); float hy = dFdy(h);
  vec3 r1 = cross(dpy, n); vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 g = (r1 * hx + r2 * hy) * sign(det) / max(abs(det), 1e-7);
  return normalize(n - g * k);
}
// What the wood's own night gives a surface. The darks of this picture are brown-black, not blue: an umber from
// all round, and only on what faces up a little of the sky's teal coming down through the vault (it is this that
// gives a trunk its roundness in the dark).
vec3 coolFill(vec3 n){
  return (vec3(0.06, 0.052, 0.044) * (0.6 + 0.4 * n.y)
    + vec3(0.03, 0.062, 0.07) * pow(max(dot(n, vec3(0.2507, 0.8023, 0.5416)), 0.0), 1.6)) * 0.87;
}
`;

export const GLSL_KINGS = GLSL_NOISE + GLSL_SKY + GLSL_KINGS_CORE;

export const GLSL_END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
