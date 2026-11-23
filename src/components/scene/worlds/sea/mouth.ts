import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";
import { ISLAND_U } from "./island";
import { GROTTO } from "./shape";

// The island swallows. As the mouth opens, the bay begins to run toward it: the glass in front of it draws in, long
// pale streaks of light going slowly down the water and in at the dark, faster and finer the nearer they are, a slow
// ring of turning round the place where the water goes under the rock. It is felt before it is seen: only streaks,
// on the glass, that all point one way. (Drawn over the water, added to it, in the island's own warm light.)
const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
export const INFLOW = { w: 1500, d: 1300 };
export function inflowGeometry() {
  const g = new THREE.PlaneGeometry(INFLOW.w, INFLOW.d, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(GROTTO.x, 0.12, GROTTO.z + INFLOW.d / 2 - 20);
  return g;
}
export function makeInflowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, uOpen: ISLAND_U.uOpen },
    vertexShader: /* glsl */ `varying vec3 vWorld; varying vec3 vL; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vL = position; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uOpen;
      varying vec3 vWorld; varying vec3 vL;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        if (uOpen < 0.02) discard;
        vec2 p = vL.xz - vec2(${GROTTO.x.toFixed(1)}, ${(GROTTO.z + 6).toFixed(1)});
        float r = length(p);
        float ang = atan(p.x, p.y);
        // streaks: a fine fan of lines about the mouth, each its own length, each moving in
        float bins = 520.0;
        float cell = ang / 3.14159 * bins * 0.25;
        float id = floor(cell);
        float h = fract(sin(id * 12.9898) * 43758.5453);
        float lat = abs(fract(cell) - 0.5);
        float line = 1.0 - smoothstep(0.03, 0.2, lat);
        float speed = 0.05 + 0.1 * h;
        float run = fract(r * (0.011 + 0.006 * h) + uTime * speed + h * 7.0);
        float dash = smoothstep(0.0, 0.1, run) * (1.0 - smoothstep(0.1, 0.5 + 0.2 * h, run));
        // it gathers toward the mouth and thins away from it
        float near = exp(-r / 380.0) * smoothstep(20.0, 90.0, r);
        float side = smoothstep(1.55, 0.35, abs(ang));
        float k = line * dash * near * side * smoothstep(0.1, 0.8, uOpen);
        // a slow turning of the water just in front of the mouth
        float swirl = exp(-pow((r - 70.0) / 38.0, 2.0)) * (0.5 + 0.5 * sin(ang * 5.0 - uTime * 0.55 + r * 0.04)) * 0.12 * uOpen;
        vec3 col = (vec3(1.0, 0.8, 0.5) * 0.5 + uHorizon * 0.4) * (k * 0.4 + swirl) * (1.0 - 0.5 * uNight);
        col *= 1.0 - airAmt(vWorld) * 0.7;
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}
