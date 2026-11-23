import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, noise2, ridge2 } from "../kit";
import { CAVE_Z, HALL, HER_K, ORB, TUNNEL, caveAt, floorAt } from "./shape";

const sst = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The cave and the light in it. Everything here is lit by one thing only: the orb she holds (a point of light
// with a soft fall-off), and the dim green air. The rock is painted as the picture's ground is: deep teal-green
// pastel laid in long upright strokes, flecks of yellow-green and blue in it, and the rows of short dark wavy
// marks that drift across the top of the picture.

export const FRIEND_U = {
  // where the orb is (world space), and how strong its light is
  uOrb: { value: new THREE.Vector3() },
  uOrbK: { value: 1 },
  // the light through the cracks high in the vault (the cavern's own beat: it comes as the plane comes out of the tunnel)
  uCracks: { value: 0 },
};

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// the light of the orb at a point with a normal: its colour, falling off softly with distance (shared by the rock,
// the floor and her)
export const GLSL_ORB = /* glsl */ `
uniform vec3 uOrb; uniform float uOrbK; uniform float uCracks;
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
  // (the mountain stands between it and the hall of fog and the tunnel: there only what comes in by the throat)
  att *= mix(0.07, 1.0, 1.0 - smoothstep(${(HALL.z1 - 130 - ORB.z).toFixed(1)}, ${(HALL.z1 + 260 - ORB.z).toFixed(1)}, p.z - uOrb.z));
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
  float h = max(length(oc - rd * b), ${(ORB.r * 0.9).toFixed(1)}) / ${HER_K.toFixed(3)};
  // (the angle the lit stretch of the ray spans, and a fall-off with its nearest distance that is softer than a
  // true lamp's: near the orb the haze is a glow, not a white-out)
  float span = atan((L - b) / h) - atan(-b / h);
  // (measured in the orb's own size, so the glow is as wide about a great orb as about a small one; and a faint
  // long tail of it reaches the whole cavern)
  float shut = mix(0.25, 1.0, 1.0 - smoothstep(${(HALL.z1 - 60 - ORB.z).toFixed(1)}, ${(HALL.z1 + 360 - ORB.z).toFixed(1)}, ro.z - uOrb.z));
  return vec3(1.0, 0.74, 0.4) * span * (26.0 / pow(h + 50.0, 1.6) + 0.006 / (1.0 + h * 0.004)) * uOrbK * shut;
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
    // (two fifths of the rings are spent on the tunnel and the hall of fog, which are flown close along; the cavern
    // has the rest, closer together toward its far end where the dome closes)
    const s = j / NZ;
    const z = s < 0.6 ? z0 + (HALL.z1 - z0) * Math.pow(s / 0.6, 0.85) : HALL.z1 + (z1 - HALL.z1) * ((s - 0.6) / 0.4);
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
      const arc = th * Math.max(520, w * 0.74);
      const up = Math.max(0, y) / Math.max(top, 1);
      const fold = ridge2(arc * 0.011, y * 0.0026 + z * 0.0009, 4);
      const swell = noise2(arc * 0.0035 + 3.1, z * 0.0042 + 1.7);
      // (in the cavern the rock stands in and out by hundreds of metres: buttresses, bays, hanging curtains)
      const big = sst(260, 1200, w);
      const bay = noise2(arc * 0.0011 + 9.2, z * 0.0012 + 4.4) - 0.5;
      const curtain = ridge2(arc * 0.0042 + 2.0, z * 0.0019, 3);
      const k = Math.min(1, w / 160) * (0.25 + 0.75 * Math.sin(Math.min(1, up * 1.4) * Math.PI * 0.5));
      const push = ((fold * 34 + swell * 46 - 16) * (1 + 1.2 * big) + (bay * 520 + curtain * 150) * big) * k;
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
        vec3 P = vLocal;
        float fwh = length(fwidth(P));
        float fine = 1.0 - smoothstep(0.3, 1.6, fwh);
        // how far into the cavern: the tunnel's rock is the home mountain's own (lilac-grey with ochre beds), the
        // cavern's goes over into his teal-green as the moss takes it
        float inC = smoothstep(${(TUNNEL.z0 + 40).toFixed(1)}, ${(TUNNEL.z0 - 220).toFixed(1)}, P.z);
        // ---- rock: level beds, warped; cracks along them and across; grain
        float warp = fbm(P.xz * 0.012) * 9.0;
        float bed = P.y * 0.075 + warp;
        float strata = vnoise(vec2(bed, P.x * 0.003 + P.z * 0.002));
        float band = smoothstep(0.35, 0.65, fract(bed * 0.5));
        float grain = fbm(P.xz * 0.11 + P.y * 0.09) * 0.6 + fbm(vec2(P.x + P.z, P.y) * 0.4) * 0.4 * mix(0.5, 1.0, fine);
        vec3 homeRock = mix(vec3(0.075, 0.07, 0.085), vec3(0.2, 0.165, 0.135), strata);
        vec3 tealRock = mix(vec3(0.03, 0.055, 0.05), vec3(0.11, 0.1, 0.06), strata);
        vec3 rock = mix(homeRock, tealRock, inC) * (0.72 + 0.5 * grain) * (0.88 + 0.24 * band);
        // cracks: thin dark lines along the beds, and jointing across them
        float c1 = abs(fract(bed * 0.5 + 0.13 * vnoise(P.xz * 0.05)) - 0.5);
        float c2 = abs(vnoise(vec2((P.x + P.z) * 0.035, P.y * 0.01)) - 0.5);
        float crack = (1.0 - smoothstep(0.0, 0.02 + fwh * 0.01, c1)) * 0.7 + (1.0 - smoothstep(0.0, 0.015 + fwh * 0.008, c2)) * 0.6;
        rock *= 1.0 - 0.55 * crack * fine;
        // the picture's own strokes still in it, faintly: upright, green and gold
        float st = vnoise(vec2((P.x + P.z) * 0.14, P.y * 0.012));
        rock = mix(rock, vec3(0.15, 0.18, 0.06), smoothstep(0.7, 0.85, st) * 0.35 * inC);
        // moss: on every ledge that faces up, thicker low down and toward the light
        float ledge = smoothstep(0.15, 0.6, n.y);
        float mossN = vnoise(P.xz * 0.08) * 0.6 + vnoise(P.xz * 0.31 + 3.0) * 0.4;
        float moss = ledge * smoothstep(0.35, 0.6, mossN + 0.2 * inC) * mix(0.4, 1.0, inC);
        vec3 mossC = mix(vec3(0.04, 0.075, 0.03), vec3(0.11, 0.15, 0.04), vnoise(P.xz * 0.6) * fine + 0.3 * (1.0 - fine));
        vec3 wall = mix(rock, mossC, moss);
        // ---- the floor: moss, leaf litter, the dark of roots, still pools
        float isFloor = (1.0 - vWall) * smoothstep(0.4, 0.8, n.y);
        float fm = vnoise(P.xz * vec2(0.05, 0.05)) * 0.55 + vnoise(P.xz * 0.21 + 4.0) * 0.45;
        vec3 floorC = mix(vec3(0.03, 0.05, 0.026), vec3(0.075, 0.1, 0.035), fm);
        // litter: small warm flecks, gone where a pixel cannot hold them
        float lit = smoothstep(0.62, 0.8, vnoise(P.xz * 1.3)) * fine;
        floorC = mix(floorC, vec3(0.14, 0.09, 0.04), lit * 0.5);
        // roots: long dark winding lines
        float rt = abs(vnoise(vec2(P.x * 0.06 + vnoise(P.xz * 0.02) * 3.0, P.z * 0.012)) - 0.5);
        floorC *= 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.03 + fwh * 0.01, rt)) * fine;
        floorC = mix(floorC, homeRock * 0.8, (1.0 - inC) * 0.7);
        // pools: still dark water in the hollows, the orb and the air in them
        float poolN = vnoise(P.xz * 0.018 + 7.0) * 0.7 + vnoise(P.xz * 0.06) * 0.3;
        float aa = max(fwidth(poolN), 0.002);
        float pool = smoothstep(0.24 + aa, 0.24 - aa, poolN) * isFloor * inC;
        vec3 alb = mix(wall, floorC, isFloor);
        // the light of the orb, and the dim air's own light in the shade
        vec4 o = orbLight(vWorld, n, 0.35, 1150.0);
        // (the tunnel is dark: what light there is in it is ahead)
        vec3 amb = uSkyCol * (0.55 + 0.45 * n.y) * 1.1 * mix(0.5, 1.0, inC);
        vec3 col = alb * (amb + o.rgb * 2.3);
        // in the tunnel: the cavern's light coming in at its far mouth, green-gold, along the wet walls
        vec3 mouth = vec3(0.0, 22.0, ${(TUNNEL.z0 - 30).toFixed(1)});
        vec3 toM = mouth - P;
        float dm = length(toM);
        float mouthL = (0.25 + 0.75 * max(dot(n, toM / dm), 0.0)) / (1.0 + pow(dm / 110.0, 2.0)) * (1.0 - inC * 0.6);
        col += alb * vec3(0.9, 0.8, 0.45) * mouthL * 1.5;
        // damp: a sheen on the wet rock where it faces the orb
        vec3 toO = normalize(uOrb - vWorld);
        float spec = pow(max(dot(reflect(-V, n), toO), 0.0), 24.0);
        col += orbCol() * spec * length(o.rgb) * 0.35 * (1.0 - moss) * fine;
        col += vec3(0.7, 0.85, 0.45) * pow(max(dot(reflect(-V, n), toM / dm), 0.0), 16.0) * mouthL * 0.5 * fine;
        // the pools: a mirror of the air, and the orb's own light lying in them
        if (pool > 0.0) {
          vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
          float glint = pow(max(dot(R, toO), 0.0), 400.0) * 6.0 + pow(max(dot(R, toO), 0.0), 30.0) * 0.4;
          vec3 water = airCol(R) * 0.7 + orbCol() * glint * uOrbK;
          col = mix(col, water, pool * 0.9);
        }
        // the lower walls stand in their own shade
        col *= mix(0.65, 1.0, smoothstep(0.0, 140.0, vWorld.y));
        // light through cracks high in the vault: thin pale lines that glow
        float vault = smoothstep(-0.3, -0.7, n.y) * smoothstep(250.0, 700.0, P.y) * inC;
        col += vec3(0.75, 0.85, 0.55) * (1.0 - smoothstep(0.0, 0.012 + fwh * 0.006, c2)) * vault * 0.8 * uCracks;
        col = applyAir(col, vWorld) + orbScatter(vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// the floor's height in the shader, for whatever lies on it
export const FLOOR_Y = (x: number, z: number) => floorAt(x, z);
