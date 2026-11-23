import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";
import { ORIGIN } from "../voyage";
import { BOAT_LEN, boatsGeometry, type Boat, type BoatPlace } from "../sea/boat";
import { FUNERAL_U, GLSL_FUNERAL_AIR } from "./air";
import { funeralLand } from "./land";
import { ROAD_GLSL } from "./souls";

// The landing. The cave the plane comes in by is not dry: the water of Tranquility comes through under the rock and
// lies in it, black and still, from where the plane comes in to the quay just inside the cave's mouth. The boats
// come down it out of the dark, slow, each with its lantern and its souls, and put in at the quay, side by side;
// the souls step out of them there (the crowd's first rows come into being at the quay: uBorn, in souls.ts) and
// walk up the valley. A boat that has landed its souls is gone a while after.

// the quay: how far along the road (metres) the boats put in
export const dockS = () => {
  const L = funeralLand();
  return (L.iOut - 10) * L.STEP;
};
export const waterY = 0.34;

export function channelGeometry() {
  const L = funeralLand();
  const i1 = L.iOut - 8;
  const pos: number[] = [];
  const k: number[] = [];
  const idx: number[] = [];
  const W = 20;
  for (let i = 0; i <= i1; i++) {
    const nx = -L.tan[i][1];
    const nz = L.tan[i][0];
    for (const u of [-1, -0.35, 0.35, 1]) {
      pos.push(L.pts[i].x + nx * u * W, L.y[i] + waterY, L.pts[i].z + nz * u * W);
      k.push(u, i * L.STEP, i === i1 ? 1 : 0);
    }
    if (i < i1) {
      const a = i * 4;
      for (let c = 0; c < 3; c++) idx.push(a + c, a + 4 + c, a + c + 1, a + 4 + c, a + 5 + c, a + c + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aK", new THREE.Float32BufferAttribute(k, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
export function makeChannelMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...FUNERAL_U, uDockS: { value: dockS() } },
    vertexShader: /* glsl */ `
      attribute vec3 aK;
      varying vec3 vWorld; varying vec3 vK;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vK = aK; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uDockS;
      varying vec3 vWorld; varying vec3 vK;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_FUNERAL_AIR}
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        vec2 q = vWorld.xz;
        // black glass, with the slowest ripples going out from the boats' way
        float e = 0.6;
        float t = uTime;
        float h0 = vnoise(q * 0.35 + vec2(t * 0.05, -t * 0.04)) * 0.6 + vnoise(q * 1.3 - vec2(t * 0.09, 0.0)) * 0.4;
        float hx = vnoise((q + vec2(e, 0.0)) * 0.35 + vec2(t * 0.05, -t * 0.04)) * 0.6 + vnoise((q + vec2(e, 0.0)) * 1.3 - vec2(t * 0.09, 0.0)) * 0.4;
        float hz = vnoise((q + vec2(0.0, e)) * 0.35 + vec2(t * 0.05, -t * 0.04)) * 0.6 + vnoise((q + vec2(0.0, e)) * 1.3 - vec2(t * 0.09, 0.0)) * 0.4;
        vec3 n = normalize(vec3((h0 - hx) * 0.5, 1.0, (h0 - hz) * 0.5));
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        vec3 R = reflect(-V, n);
        // the cave's own dark, the night's blue from the mouth, a little of the lanterns' gold
        vec3 col = vec3(0.003, 0.007, 0.018);
        col += (uHorizon * 0.9 + vec3(0.0, 0.02, 0.08)) * fres * (0.25 + 0.75 * smoothstep(0.0, 0.35, R.y));
        col += vec3(0.5, 0.3, 0.12) * 0.03 * pow(max(dot(R, normalize(vec3(0.0, 0.25, -1.0))), 0.0), 8.0) * glowK();
        // the quay's edge, where it meets the stone: a thin pale line of broken water
        float edge = smoothstep(uDockS - 26.0, uDockS - 2.0, vK.y) * 0.04;
        col += vec3(0.4, 0.5, 0.55) * edge * (0.5 + 0.5 * vnoise(q * 0.9 + t * 0.1));
        // the walls of the cave: nothing to see of the water close to them
        float side = smoothstep(0.7, 1.0, abs(vK.x));
        col = funeralAir(col, vWorld);
        float a = (0.9 - 0.4 * side) * (1.0 - smoothstep(uDockS - 4.0, uDockS + 8.0, vK.y) );
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
        ${END}
      }`,
  });
}

// boats along the road, from the dark behind to the quay
export function funeralBoats(n: number, roadTex: THREE.DataTexture, rd: THREE.Vector4, mobile: boolean) {
  const L = funeralLand();
  const dock = dockS();
  const list: Boat[] = [];
  const lanes = 6;
  for (let i = 0; i < n; i++) {
    const lane = (i % lanes) - (lanes - 1) / 2;
    const rank = Math.floor(i / lanes);
    // (the quay is 20 m wide: boats side by side, the next rank a boat's length behind)
    list.push({ a: [lane * 3.3, 0, ((i * 0.618034) % 1), (rank * (BOAT_LEN + 2.4)) / 7], b: [120, 1.15 + ((i * 0.37) % 0.25), 1 + (i % 3), ((i * 0.29) % 1)] });
  }
  const place: BoatPlace = {
    glsl: /* glsl */ `
      ${ROAD_GLSL}
      uniform vec3 uDock;
      vec3 boatPlace(vec4 A, vec4 B, out vec2 hd, out float fade){
        float u = fract(uTime / B.x + A.z);
        float k = clamp(u / 0.55, 0.0, 1.0);
        float e = 1.0 - pow(1.0 - k, 2.4);
        float s = mix(uDock.y, uDock.x - 4.2 - A.w * 7.0, e);
        vec2 tn; vec3 c = roadAt(s, tn);
        vec2 right = vec2(-tn.y, tn.x);
        hd = normalize(tn);
        // (it comes in from the dark, stays at the quay while its souls step out, and is gone a while after)
        fade = smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.86, 0.97, u));
        return vec3(c.x + right.x * A.x + uFO.x, c.y + ${waterY.toFixed(2)} + uFO.y, c.z + right.y * A.x + uFO.z);
      }`,
    uniforms: { uRoad: { value: roadTex }, uRd: { value: rd }, uWalk: { value: 0 }, uDock: { value: new THREE.Vector3(dock, 6, 0) }, ...FUNERAL_U, ...WORLD_U, uBO: { value: ORIGIN } },
    airGlsl: `${GLSL_AIR}\n${GLSL_FUNERAL_AIR}`,
    airCall: "funeralAir(col, vWorld)",
    airK: "((1.0 - valleyAmt(vWorld) * 0.8) * (1.0 - airAmt(vWorld) * 0.7))",
  };
  void mobile;
  return { geo: boatsGeometry(list), place };
}
