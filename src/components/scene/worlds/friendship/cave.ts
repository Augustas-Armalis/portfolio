import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, noise2, ridge2 } from "../kit";
import { CAVE_Z, ORB, caveAt, floorAt } from "./shape";

// The cave and the light in it. Everything here is lit by one thing only: the orb she holds (a point of light
// with a soft fall-off), and the dim green air. The rock is painted as the picture's ground is: deep teal-green
// pastel laid in long upright strokes, flecks of yellow-green and blue in it, and the rows of short dark wavy
// marks that drift across the top of the picture.

export const FRIEND_U = {
  // where the orb is (world space), and how strong its light is
  uOrb: { value: new THREE.Vector3() },
  uOrbK: { value: 1 },
};

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// the light of the orb at a point with a normal: its colour, falling off softly with distance (shared by the rock,
// the floor and her)
export const GLSL_ORB = /* glsl */ `
uniform vec3 uOrb; uniform float uOrbK;
vec3 orbCol(){ return vec3(1.0, 0.8, 0.5); }
// returns the light arriving (no albedo), and in .w the direction's cosine for whoever wants a rim
vec4 orbLight(vec3 p, vec3 n, float wrap, float reach){
  vec3 L = uOrb - p;
  float d = length(L);
  vec3 l = L / max(d, 0.001);
  float ndl = dot(n, l);
  float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  // soft near the orb (no hot spot where the hand holds it), a long tail out to the walls
  float att = 1.0 / (1.0 + pow(max(d - ${(ORB.r * 0.6).toFixed(1)}, 0.0) / reach, 2.0));
  return vec4(orbCol() * diff * att * uOrbK, ndl);
}
// The orb's light in the air between the eye and a point: the haze glows round it as round a lamp in fog, and
// whatever stands before it cuts the glow off (the light of a point falling off as the square of the distance,
// gathered along the ray in closed form).
vec3 orbScatter(vec3 p){
  vec3 ro = cameraPosition;
  vec3 dv = p - ro;
  float L = length(dv);
  vec3 rd = dv / max(L, 0.001);
  vec3 oc = uOrb - ro;
  float b = dot(oc, rd);
  float h = max(length(oc - rd * b), ${(ORB.r * 0.9).toFixed(1)});
  // (the angle the lit stretch of the ray spans, and a fall-off with its nearest distance that is softer than a
  // true lamp's: near the orb the haze is a glow, not a white-out)
  float span = atan((L - b) / h) - atan(-b / h);
  return vec3(1.0, 0.74, 0.4) * span * 26.0 / pow(h + 50.0, 1.6) * uOrbK;
}
`;

// ---------- the cave: one closed skin, floor and walls and vault ----------
// Rings of the cave's cross-section along its length; each ring a rounded vault over a floor (the floor itself is
// the ring pressed down onto the ground, so wall and floor are one surface with no seam). The rock is pushed in by
// long upright folds (the curtains of stone a cave hangs) and broad swellings.
export function caveGeometry(mobile: boolean) {
  const NZ = mobile ? 150 : 250;
  const NA = mobile ? 120 : 190;
  const pos = new Float32Array((NZ + 1) * (NA + 1) * 3);
  const wallK = new Float32Array((NZ + 1) * (NA + 1));
  const [z0, z1] = CAVE_Z;
  for (let j = 0; j <= NZ; j++) {
    // (rings closer together at the ends, where the dome closes)
    const s = j / NZ;
    const z = z0 + (z1 - z0) * (s - Math.sin(s * Math.PI * 2) * 0.06);
    const { w, top } = caveAt(z);
    const yc = top * 0.34;
    const hy = top - yc;
    for (let i = 0; i <= NA; i++) {
      // starting and ending under the floor, so the seam is buried
      const th = -Math.PI / 2 + (i / NA) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.78);
      const ey = Math.sign(sn) * Math.pow(Math.abs(sn), 0.78);
      let x = w * ex;
      let y = yc + hy * ey;
      // the rock pressed in: upright folds and broad swellings, less near the floor and at the vault's crown
      const arc = th * 520;
      const up = Math.max(0, y) / Math.max(top, 1);
      const fold = ridge2(arc * 0.011, y * 0.0026 + z * 0.0009, 4);
      const swell = noise2(arc * 0.0035 + 3.1, z * 0.0042 + 1.7);
      const k = Math.min(1, w / 160) * (0.25 + 0.75 * Math.sin(Math.min(1, up * 1.4) * Math.PI * 0.5));
      const push = (fold * 34 + swell * 46 - 16) * k;
      // pushed toward the middle of the section
      const nx = -ex;
      const ny = -(y - yc) / Math.max(hy, 1);
      const nl = Math.hypot(nx, ny) || 1;
      x += (nx / nl) * push;
      y += (ny / nl) * push * 0.55;
      // the floor: whatever is under the ground is laid on it (a hand below the plane's own idea of the ground)
      const g = floorAt(x, z) - 0.4;
      const q = j * (NA + 1) + i;
      if (y < g) {
        wallK[q] = 0;
        y = g;
      } else wallK[q] = Math.min(1, (y - g) / 30);
      pos.set([x, y, z], q * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i;
      const b = a + 1;
      const c = a + NA + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aWall", new THREE.BufferAttribute(wallK, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function makeCaveMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U },
    vertexShader: /* glsl */ `
      attribute float aWall;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying float vWall;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vWall = aWall;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec3 vLocal; varying float vWall;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_ORB}
      // the picture's ground: long upright strokes, flecks, and rows of short dark wavy marks (h runs along the wall)
      vec3 ground(float h, float y, float fw){
        float s1 = vnoise(vec2(h * 0.16, y * 0.011));
        float s2 = vnoise(vec2(h * 0.55 + 7.0, y * 0.035));
        float s3 = vnoise(vec2(h * 1.7 + 3.0, y * 0.09));
        // finer strokes are laid only where a pixel can hold them
        float fine = 1.0 - smoothstep(0.35, 1.4, fw);
        float st = s1 * 0.55 + s2 * 0.3 + s3 * 0.15 * fine;
        vec3 deep = vec3(0.028, 0.06, 0.052);
        vec3 teal = vec3(0.05, 0.1, 0.082);
        vec3 col = mix(deep, teal, smoothstep(0.3, 0.7, st));
        // yellow-green strokes, and a few of blue
        col = mix(col, vec3(0.16, 0.2, 0.06), smoothstep(0.66, 0.8, s2 * 0.6 + s1 * 0.4) * 0.8);
        col = mix(col, vec3(0.04, 0.08, 0.14), smoothstep(0.7, 0.84, vnoise(vec2(h * 0.3 + 11.0, y * 0.02))) * 0.6);
        // the rows of dark marks: short, wavy, each with a pale lip under it
        float row = y / 26.0;
        float ry = floor(row);
        float lane = h / 15.0 + hash12(vec2(ry, 3.0)) * 7.0;
        float cell = floor(lane);
        float on = step(0.52, hash12(vec2(cell, ry)));
        float fy = fract(row) - 0.5 - 0.05 * sin(lane * 6.2832 * 1.5 + ry);
        float fx = fract(lane);
        float len = smoothstep(0.08, 0.2, fx) * (1.0 - smoothstep(0.62, 0.8, fx));
        float th = 0.032;
        float aa = max(fw / 26.0, 0.004);
        float dash = (1.0 - smoothstep(th, th + aa * 1.5, abs(fy))) * len * on;
        float lip = (1.0 - smoothstep(0.02, 0.02 + aa * 1.5, abs(fy + 0.06))) * len * on;
        // (marks too fine for the pixel are averaged away rather than flickering)
        float keep = 1.0 - smoothstep(0.6, 2.2, fw);
        col = mix(col, vec3(0.008, 0.014, 0.014), dash * 0.85 * keep);
        col += vec3(0.1, 0.1, 0.05) * lip * 0.5 * keep;
        return col;
      }
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(n, V) < 0.0) n = -n;
        float fwh = length(fwidth(vLocal));
        // the wall's own pattern, laid along x on walls that face along z and along z on walls that face along x
        float wx = abs(n.x); float wz = abs(n.z);
        float sw = wx + wz + 0.0001;
        vec3 wall = (ground(vLocal.z, vLocal.y, fwh) * wx + ground(vLocal.x + 400.0, vLocal.y, fwh) * wz) / sw;
        // the floor: dark umber-green, swept by the same upright strokes run long toward her
        float fl = vnoise(vLocal.xz * vec2(0.05, 0.012)) * 0.6 + vnoise(vLocal.xz * vec2(0.18, 0.05) + 4.0) * 0.4;
        vec3 floorC = mix(vec3(0.022, 0.03, 0.024), vec3(0.05, 0.058, 0.036), fl);
        float isFloor = (1.0 - vWall) * smoothstep(0.4, 0.8, n.y);
        vec3 alb = mix(wall, floorC, isFloor);
        // the light of the orb, and the dim air's own light in the shade
        vec4 o = orbLight(vWorld, n, 0.35, 240.0);
        vec3 amb = uSkyCol * (0.55 + 0.45 * n.y) * 1.1;
        vec3 col = alb * (amb + o.rgb * 2.3);
        // the far reach of it in the hollows: lower walls stand in their own shade
        col *= mix(0.65, 1.0, smoothstep(0.0, 60.0, vWorld.y));
        col = applyAir(col, vWorld) + orbScatter(vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// the floor's height in the shader, for whatever lies on it
export const FLOOR_Y = (x: number, z: number) => floorAt(x, z);
