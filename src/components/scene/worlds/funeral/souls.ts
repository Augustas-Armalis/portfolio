import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, rng } from "../kit";
import { ORIGIN } from "../voyage";
import { FUNERAL_U, GLSL_FUNERAL_AIR } from "./air";
import { ROAD_W, funeralLand } from "./land";

// The procession. Tens of thousands of hooded souls, shoulder to shoulder, the whole width of the road, walking
// it from the valley to the cave: really walking, each carried along the road's own line (read in the vertex
// shader from a small texture of the road), with a slow step, the weight going from foot to foot, the head bowed.
//
// The road is cut into lengths of CHUNK metres and every length holds the same crowd, so a soul that walks off
// the end of one length is at that moment the soul walking on to the next: the river never breaks, and each
// length can be culled, and drawn as carefully as its distance asks: near, a hooded figure of a hundred
// triangles; further, one of thirty; far off, a single painted card that faces the eye. Some carry a light.

export const CHUNK = 90;
const HEIGHT = 2.65;
const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// one soul, a unit tall: a long cloak falling from narrow shoulders, a small rounded hood, bowed
function soulGeometry(seg: number, rings: [number, number][]) {
  const g = new THREE.LatheGeometry(
    rings.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)),
    seg,
  );
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // narrower from front to back than across the shoulders, and the hood leaning forward over the bowed head
    const k = Math.max(0, (y - 0.66) / 0.34);
    p.setZ(i, p.getZ(i) * 0.82 + k * k * 0.05);
    p.setY(i, y - k * k * 0.018);
  }
  g.deleteAttribute("uv");
  g.computeVertexNormals();
  return g;
}
// (a cloak wide at the hem, shoulders, a narrow neck in shadow, and a deep hood that comes to a point)
const NEAR_PROFILE: [number, number][] = [
  [0.19, 0],
  [0.186, 0.05],
  [0.16, 0.3],
  [0.136, 0.55],
  [0.124, 0.7],
  [0.13, 0.765],
  [0.086, 0.8],
  [0.072, 0.826],
  [0.097, 0.862],
  [0.106, 0.9],
  [0.09, 0.945],
  [0.046, 0.986],
  [0.0, 1.03],
];
const MID_PROFILE: [number, number][] = [
  [0.15, 0],
  [0.116, 0.56],
  [0.085, 0.83],
  [0.088, 0.91],
  [0.0, 1.0],
];

export const ROAD_GLSL = /* glsl */ `
  uniform sampler2D uRoad; uniform vec4 uRd; uniform float uWalk; uniform vec3 uFO; uniform float uBorn; uniform float uBell;
  // (a soul comes into being inside the cave the road comes out of, rising out of the dark over a few steps)
  float born(float s){ return smoothstep(uBorn, uBorn + 12.0, s); }
  // the road at s metres along it: its middle, and the way it runs
  vec3 roadAt(float s, out vec2 tn){
    float f = clamp(s / uRd.y, 0.0, uRd.x - 1.001);
    float fi = floor(f); float t = f - fi; int i = int(fi);
    vec4 a = texelFetch(uRoad, ivec2(i, 0), 0); vec4 b = texelFetch(uRoad, ivec2(i + 1, 0), 0);
    vec4 ta = texelFetch(uRoad, ivec2(i, 1), 0); vec4 tb = texelFetch(uRoad, ivec2(i + 1, 1), 0);
    tn = normalize(mix(ta.xy, tb.xy, t));
    return mix(a.xyz, b.xyz, t);
  }`;
const SHADE_GLSL = /* glsl */ `
  uniform vec3 uRim;
  // Near-black cloth, hardly lit: the night's own blue only on what turns up toward the sky, a thin cold line along
  // the hood and shoulder that faces the moon, and, warm and soft, the light of the lanterns that are carried nearby
  // (ldir: the way to the nearest of them, lk: how much of their light reaches this one). Nothing is flat: the cloth
  // falls in folds, and the lantern's gold lies only on the folds that face it.
  vec3 soulShade(vec3 n, vec3 V, float k, float seed, vec3 ldir, float lk){
    float fold = vnoise(vec2(atan(n.x, n.z) * 3.0 + seed * 40.0, k * 9.0 + seed * 7.0)) * 0.6 + vnoise(vec2(atan(n.x, n.z) * 7.0, k * 21.0 + 3.0)) * 0.4;
    vec3 alb = mix(vec3(0.009, 0.009, 0.02), vec3(0.02, 0.019, 0.04), fract(seed * 5.3)) * (0.5 + 0.5 * k) * (0.65 + 0.7 * fold);
    float lam = clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = alb * (uSkyCol * 0.9 * (0.55 + 0.45 * n.y) + uKeyCol * lam * lam * 0.16);
    // the lanterns of the crowd: warm, on the side of each fold that faces them, falling off with the cloak's height
    float ld = clamp(dot(n, normalize(ldir + vec3(0.0, 0.35, 0.0))) * 0.55 + 0.45, 0.0, 1.0);
    float lit = lk * ld * ld * (0.55 + 0.6 * smoothstep(0.1, 0.8, k));
    col += vec3(1.0, 0.56, 0.22) * (alb * 4.0 + vec3(0.006, 0.004, 0.003)) * lit * glowK() * 1.5;
    // moon rim, thin and cold; and a warm thread where a lantern is behind the figure
    vec3 L = normalize(vec3(uKeyDir.x, 0.12, uKeyDir.z));
    float fres = pow(1.0 - abs(dot(n, V)), 3.2);
    col += uRim * fres * smoothstep(0.0, 0.8, dot(n, L)) * smoothstep(0.4, 0.85, k) * 0.2 * glowK();
    col += vec3(0.04, 0.15, 0.22) * fres * smoothstep(0.1, 0.9, n.y) * smoothstep(0.55, 0.95, k) * 0.35;
    col += vec3(1.0, 0.62, 0.3) * fres * lk * 0.2 * smoothstep(0.3, 0.9, k) * glowK();
    return col;
  }`;

function makeSoulMaterial(roadTex: THREE.DataTexture, rd: THREE.Vector4, walk: number, card: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, ...FUNERAL_U, uRoad: { value: roadTex }, uRd: { value: rd }, uWalk: { value: walk }, uRim: { value: new THREE.Color(1.0, 0.62, 0.16) } },
    vertexShader: /* glsl */ `
      attribute vec4 aI; attribute vec4 aJ;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vR; varying vec2 vUv; varying float vSeed; varying vec3 vLd; varying float vLk;
      ${ROAD_GLSL}
      void main(){
        float walked = uTime * uWalk;
        float along = mod(aI.x + walked, uRd.w);
        vec2 tn; vec3 c = roadAt(uRd.z + along, tn);
        vec3 fwd = vec3(tn.x, 0.0, tn.y); vec3 right = vec3(-tn.y, 0.0, tn.x);
        float seed = aI.z;
        // the lantern light that reaches this soul, and from where (in the road's own frame, flickering as one)
        vLd = fwd * aJ.x + right * aJ.y;
        vLk = aJ.z * (0.86 + 0.14 * sin(uTime * 2.1 + seed * 31.0) * sin(uTime * 0.9 + seed * 7.0));
        vec3 base = c + right * (aI.y + sin(uTime * 0.09 + seed * 50.0) * 0.14) + uFO;
        float H = ${HEIGHT.toFixed(1)} * aI.w * born(uRd.z + along);
        float girth = 0.9 + 0.24 * fract(seed * 3.7);
        // the slow walk: a rise and fall with each step, the weight going from foot to foot, the bowed head nodding
        float ph = (aI.x + walked) * 4.4 + seed * 6.2832;
        float k = position.y;
        float sway = sin(ph) * 0.07 * k;
        float bob = abs(sin(ph)) * 0.045;
        vec3 wp;
        ${
          card
            ? `// a card that turns to face the eye
               vec3 d = base - cameraPosition;
               vec3 r = normalize(vec3(-d.z, 0.0, d.x));
               wp = base + r * (position.x * 0.15 * H * girth + sway) + vec3(0.0, k * H + bob, 0.0);
               vR = r; vN = normalize(-vec3(d.x, 0.0, d.z));`
            : `// each a little turned from the way they all go
               float turn = (fract(seed * 7.13) - 0.5) * 0.5;
               float cs = cos(turn); float sn = sin(turn);
               vec3 f2 = fwd * cs + right * sn; vec3 r2 = right * cs - fwd * sn;
               // (no two alike: some hoods taller and more pointed, some heads bowed lower, some cloaks fuller at the hem)
               float hoodK = fract(seed * 5.31); float stoop = fract(seed * 2.17);
               float bow = smoothstep(0.68, 1.0, k) * (0.6 + 1.5 * stoop);
               float hem = 1.0 + (fract(seed * 8.3) - 0.3) * 0.5 * (1.0 - smoothstep(0.0, 0.5, k));
               float peak = 1.0 + (hoodK - 0.4) * 0.16 * smoothstep(0.86, 1.0, k);
               vec3 lp = vec3(position.x * H * girth * hem + sway, k * H * peak + bob - bow * 0.03, position.z * H * girth * hem + 0.09 * k * k + bow * (0.05 + 0.025 * sin(ph * 2.0 + 1.0)));
               wp = base + r2 * lp.x + vec3(0.0, lp.y, 0.0) + f2 * lp.z;
               vN = normalize(r2 * normal.x + vec3(0.0, normal.y, 0.0) + f2 * normal.z); vR = r2;`
        }
        vWorld = wp; vUv = position.xy; vSeed = seed;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec3 vR; varying vec2 vUv; varying float vSeed; varying vec3 vLd; varying float vLk;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_FUNERAL_AIR}
      ${SHADE_GLSL}
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float k = vUv.y;
        ${
          card
            ? `// the figure painted on the card: the cloak's long taper, the neck, the round of the hood
               float w = k < 0.805 ? mix(1.0, 0.6, pow(k / 0.805, 0.9)) : k < 0.895 ? mix(0.56, 0.6, (k - 0.805) / 0.09) : 0.6 * sqrt(max(0.0, 1.0 - pow((k - 0.895) / 0.105, 2.0)));
               float x = vUv.x / max(w, 0.02);
               if (abs(x) > 1.0) discard;
               vec3 n = normalize(vR * x + vN * sqrt(max(0.0, 1.0 - x * x)) + vec3(0.0, smoothstep(0.86, 1.0, k) * 1.4, 0.0));`
            : `vec3 n = normalize(vN);`
        }
        vec3 col = soulShade(n, V, k, vSeed, vLd, vLk);
        ${card ? `// far off the crowd is a river of dabs, gold and blue: some hoods simply hold the light
        col += uRim * step(0.8, fract(vSeed * 9.7)) * smoothstep(0.5, 0.9, k) * smoothstep(160.0, 520.0, length(vWorld - cameraPosition)) * 0.1 * glowK();` : ""}
        col = funeralAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// the lights some of them carry: a small flame held before the breast, its glow on the air round it
function makeLampMaterial(roadTex: THREE.DataTexture, rd: THREE.Vector4, walk: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, ...FUNERAL_U, uRoad: { value: roadTex }, uRd: { value: rd }, uWalk: { value: walk } },
    vertexShader: /* glsl */ `
      attribute vec4 aL;
      uniform float uTime; uniform float uMist;
      varying vec2 vUv; varying float vK; varying vec3 vWorld;
      ${ROAD_GLSL}
      void main(){
        float walked = uTime * uWalk;
        float along = mod(aL.y + walked, uRd.w);
        vec2 tn; vec3 c = roadAt(aL.x * uRd.w + along, tn);
        vec3 fwd = vec3(tn.x, 0.0, tn.y); vec3 right = vec3(-tn.y, 0.0, tn.x);
        // (the whole part of the last number: 0 a light carried in the hand, 1 a candle standing on a bier)
        float tier = floor(aL.w);
        float seed = fract(aL.w);
        float ph = (aL.y + walked) * 4.4 + seed * 6.2832;
        vec3 base = c + right * aL.z + fwd * 0.5 * (1.0 - tier) + vec3(0.0, 1.5 + tier * 2.05 + abs(sin(ph)) * 0.045 * (1.0 - tier), 0.0) + uFO;
        vec4 mv = viewMatrix * vec4(base, 1.0);
        float d = -mv.z;
        // far off it is still a point of light, never less than a pixel or two
        float size = max(2.6, d * 0.0052);
        mv.xy += position.xy * size;
        vUv = position.xy;
        float flick = 0.82 + 0.18 * sin(uTime * (5.0 + seed * 4.0) + seed * 40.0) * sin(uTime * 2.3 + seed * 17.0);
        float sRoad = aL.x * uRd.w + along;
        float bd = (sRoad - uBell) / 70.0;
        // (the bell-light: as it passes, every light it reaches burns up, and sinks again behind it)
        vK = flick * smoothstep(1.5, 7.0, d) * (2.6 / size) * (2.6 / size) * (1.0 + 0.5 * smoothstep(60.0, 300.0, d)) * born(sRoad - 4.0) * (1.0 + 2.4 * exp(-bd * bd));
        vWorld = base;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vK; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_FUNERAL_AIR}
      void main(){
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = exp(-r * r * 90.0) * 3.2 + exp(-r * r * 9.0) * 0.26 + exp(-r * 3.2) * 0.05;
        a *= 1.0 - smoothstep(0.75, 1.0, r);
        vec3 c = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.95, 0.8), exp(-r * r * 160.0));
        float air = (1.0 - valleyAmt(vWorld) * 0.8) * (1.0 - airAmt(vWorld) * 0.7);
        gl_FragColor = vec4(c * a * vK * air * glowK() * 2.2, 1.0);
        ${END}
      }`,
  });
}

// a bier: carried along the road with the rest, level, over the hoods
function makeBierMaterial(roadTex: THREE.DataTexture, rd: THREE.Vector4, walk: number) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, ...FUNERAL_U, uRoad: { value: roadTex }, uRd: { value: rd }, uWalk: { value: walk }, uRim: { value: new THREE.Color(1.0, 0.62, 0.16) } },
    vertexShader: /* glsl */ `
      attribute vec4 aL;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vP;
      ${ROAD_GLSL}
      void main(){
        float walked = uTime * uWalk;
        float along = mod(aL.y + walked, uRd.w);
        vec2 tn; vec3 c = roadAt(aL.x * uRd.w + along, tn);
        vec3 fwd = vec3(tn.x, 0.0, tn.y); vec3 right = vec3(-tn.y, 0.0, tn.x);
        float ph = (aL.y + walked) * 4.4;
        // borne on the shoulders: it rides a little with the bearers' step
        vec3 base = c + right * aL.z + vec3(0.0, ${(HEIGHT * 0.86).toFixed(2)} + abs(sin(ph)) * 0.03, 0.0) + uFO;
        float bk = born(aL.x * uRd.w + along - 2.0);
        vec3 wp = base + (right * (position.x + sin(ph * 0.5) * 0.03) + vec3(0.0, position.y, 0.0) + fwd * position.z) * bk - vec3(0.0, (1.0 - bk) * 3.0, 0.0);
        vWorld = wp; vP = position;
        vN = normalize(right * normal.x + vec3(0.0, normal.y, 0.0) + fwd * normal.z);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRim;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vP;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_FUNERAL_AIR}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        // a black pall with a thin border of dull gold, lit from above by its four candles
        float border = max(smoothstep(0.5, 0.56, abs(vP.x)), smoothstep(1.2, 1.27, abs(vP.z))) * step(0.5, vP.y);
        vec3 alb = mix(vec3(0.006, 0.006, 0.02), vec3(0.3, 0.2, 0.06), border * 0.8);
        vec3 col = alb * (uSkyCol * 1.4 + uKeyCol * 0.2);
        vec2 q = abs(vP.xz) - vec2(0.5, 1.05);
        float candle = exp(-dot(q, q) * 1.6) * smoothstep(0.2, 0.9, n.y);
        col += (alb * 6.0 + 0.01) * uRim * candle * glowK() * 2.0;
        col += uRim * pow(1.0 - abs(dot(n, V)), 3.0) * 0.12 * glowK();
        col = funeralAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

export type Souls = ReturnType<typeof buildSouls>;
export function buildSouls(mobile: boolean, effects: number) {
  const L = funeralLand();
  const r = rng(1903);
  const HALF = ROAD_W / 2;

  // the road, for the shader: its middle (row 0) and the way it runs (row 1), a sample every STEP metres
  const data = new Float32Array(L.N * 2 * 4);
  for (let i = 0; i < L.N; i++) {
    data.set([L.pts[i].x, L.y[i], L.pts[i].z, 0], i * 4);
    data.set([L.tan[i][0], L.tan[i][1], 0, 0], (L.N + i) * 4);
  }
  const roadTex = new THREE.DataTexture(data, L.N, 2, THREE.RGBAFormat, THREE.FloatType);
  roadTex.minFilter = roadTex.magFilter = THREE.NearestFilter;
  roadTex.generateMipmaps = false;
  roadTex.needsUpdate = true;

  // the crowd that every length of road holds
  // (not packed shoulder to shoulder: room between them, and lanterns among them)
  const dense = mobile ? 0.4 : 0.5 + 0.14 * effects;
  const rows = Math.round((CHUNK / 1.5) * Math.sqrt(dense));
  const cols = Math.round(((ROAD_W - 1.6) / 1.2) * Math.sqrt(dense));
  const per = rows * cols;
  const inst = new Float32Array(per * 4);
  const lamps: number[] = [];
  let n = 0;
  for (let a = 0; a < rows; a++)
    for (let b = 0; b < cols; b++) {
      const s = ((a + 0.5 + (r() - 0.5) * 0.9 + (b % 2) * 0.5) / rows + 1) * CHUNK;
      const lat = ((b + 0.5) / cols) * 2 - 1;
      const seed = r();
      inst.set([s % CHUNK, lat * (HALF - 0.9) + (r() - 0.5) * 0.7, seed, 0.84 + r() * 0.3], n * 4);
      if (r() < 0.085) lamps.push(s % CHUNK, lat * (HALF - 0.9), seed);
      n++;
    }
  // the light each soul has from the lanterns about it: (along, across) toward the nearest and (summed) how much
  const lit = new Float32Array(per * 4);
  for (let i = 0; i < per; i++) {
    const sa = inst[i * 4];
    const sl = inst[i * 4 + 1];
    let wa = 0;
    let wl = 0;
    let wk = 0;
    for (let j = 0; j < lamps.length; j += 3) {
      const da = ((lamps[j] - sa + 1.5 * CHUNK) % CHUNK) - 0.5 * CHUNK;
      const dl = lamps[j + 1] - sl;
      const d2 = da * da + dl * dl;
      if (d2 > 90) continue;
      // (the bearer holds it a little ahead of the breast)
      const w = 1 / (1 + d2 / 7);
      const dd = Math.sqrt(d2) + 0.001;
      wa += (d2 < 0.2 ? 1 : da / dd) * w;
      wl += (d2 < 0.2 ? 0 : dl / dd) * w;
      wk += w;
    }
    const m = Math.hypot(wa, wl) + 1e-4;
    lit.set([wa / m, wl / m, Math.min(1.3, wk * 1.05), 0], i * 4);
  }
  const aI = new THREE.InstancedBufferAttribute(inst, 4);
  const aJ = new THREE.InstancedBufferAttribute(lit, 4);
  const withInst = (g: THREE.BufferGeometry) => {
    const ig = new THREE.InstancedBufferGeometry();
    ig.setAttribute("position", g.attributes.position);
    if (g.attributes.normal) ig.setAttribute("normal", g.attributes.normal);
    if (g.index) ig.setIndex(g.index);
    ig.setAttribute("aI", aI);
    ig.setAttribute("aJ", aJ);
    ig.instanceCount = per;
    return ig;
  };
  const card = new THREE.BufferGeometry();
  card.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  card.setIndex([0, 1, 2, 0, 2, 3]);
  const src = [soulGeometry(mobile ? 6 : 7, NEAR_PROFILE), soulGeometry(4, MID_PROFILE), card];
  const lod = src.map(withInst);
  const tris = [lod[0].index!.count / 3, lod[1].index!.count / 3, 2];

  const walk = 0.55;
  const total = L.iEnd * L.STEP;
  const count = Math.ceil(total / CHUNK);
  const mats: THREE.ShaderMaterial[] = [];
  const chunks: { mesh: THREE.Mesh; solid: THREE.ShaderMaterial; card: THREE.ShaderMaterial; c: THREE.Vector3; rad: number; lod: number }[] = [];
  const group = new THREE.Group();
  for (let c = 0; c < count; c++) {
    const rd = new THREE.Vector4(L.N, L.STEP, c * CHUNK, CHUNK);
    const solid = makeSoulMaterial(roadTex, rd, walk, false);
    const cardM = makeSoulMaterial(roadTex, rd, walk, true);
    mats.push(solid, cardM);
    // where this length of road is
    const i0 = Math.round((c * CHUNK) / L.STEP);
    const i1 = Math.min(L.N - 1, Math.round(((c + 1) * CHUNK) / L.STEP));
    const mid = new THREE.Vector3();
    for (let i = i0; i <= i1; i++) mid.add(new THREE.Vector3(L.pts[i].x, L.y[i], L.pts[i].z));
    mid.multiplyScalar(1 / (i1 - i0 + 1));
    let rad = 0;
    for (let i = i0; i <= i1; i++) rad = Math.max(rad, mid.distanceTo(new THREE.Vector3(L.pts[i].x, L.y[i], L.pts[i].z)));
    // (the first lengths are made near and middling once, so both ways of drawing are compiled and uploaded before they are wanted)
    const first = c === 0 ? 0 : c === 1 ? 1 : 2;
    const mesh = new THREE.Mesh(lod[first], first === 2 ? cardM : solid);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    chunks.push({ mesh, solid, card: cardM, c: mid.add(ORIGIN), rad: rad + HALF + 4, lod: first });
  }

  // the lights
  // the dead, carried among them: a few biers far apart along the road, each a dark box under a pall, borne on
  // the shoulders at the middle of the road, a candle at each corner
  const biers: number[] = [];
  for (let c = 2; c < count - 2; c += 5) biers.push(c, (c * 17.3) % CHUNK, ((c * 7) % 5) - 2, 0.1 + ((c * 0.37) % 0.8));
  const nB = biers.length / 4;
  const perL = lamps.length / 3;
  const la = new Float32Array((count * perL + nB * 4) * 4);
  for (let c = 0; c < count; c++) for (let j = 0; j < perL; j++) la.set([c, lamps[j * 3], lamps[j * 3 + 1], lamps[j * 3 + 2] * 0.999], (c * perL + j) * 4);
  for (let i = 0; i < nB; i++)
    [
      [-1.05, -0.5],
      [-1.05, 0.5],
      [1.05, -0.5],
      [1.05, 0.5],
    ].forEach(([ds, dl], k) => la.set([biers[i * 4], (biers[i * 4 + 1] + ds + CHUNK) % CHUNK, biers[i * 4 + 2] + dl, 1 + ((i * 0.31 + k * 0.17) % 0.99)], (count * perL + i * 4 + k) * 4));
  const bierBox = new THREE.BoxGeometry(0.86, 0.46, 2.25).translate(0, 0.33, 0);
  const pall = new THREE.BoxGeometry(1.16, 0.07, 2.6).translate(0, 0.6, 0);
  const skirt = new THREE.BoxGeometry(1.2, 0.5, 2.64).translate(0, 0.32, 0);
  const bierSrc = new THREE.BufferGeometry();
  {
    const parts = [bierBox, pall, skirt].map((g) => g.toNonIndexed());
    const pos: number[] = [];
    const nor: number[] = [];
    parts.forEach((g) => {
      pos.push(...(g.attributes.position.array as Float32Array));
      nor.push(...(g.attributes.normal.array as Float32Array));
    });
    bierSrc.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    bierSrc.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    [bierBox, pall, skirt, ...parts].forEach((g) => g.dispose());
  }
  const bierGeo = new THREE.InstancedBufferGeometry();
  bierGeo.setAttribute("position", bierSrc.attributes.position);
  bierGeo.setAttribute("normal", bierSrc.attributes.normal);
  bierGeo.setAttribute("aL", new THREE.InstancedBufferAttribute(new Float32Array(biers), 4));
  bierGeo.instanceCount = nB;
  const bierMat = makeBierMaterial(roadTex, new THREE.Vector4(L.N, L.STEP, 0, CHUNK), walk);
  const bierMesh = new THREE.Mesh(bierGeo, bierMat);
  bierMesh.frustumCulled = false;
  const lampGeo = new THREE.InstancedBufferGeometry();
  lampGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  lampGeo.setIndex([0, 1, 2, 0, 2, 3]);
  lampGeo.setAttribute("aL", new THREE.InstancedBufferAttribute(la, 4));
  lampGeo.instanceCount = count * perL + nB * 4;
  const lampMat = makeLampMaterial(roadTex, new THREE.Vector4(L.N, L.STEP, 0, CHUNK), walk);
  const lampMesh = new THREE.Mesh(lampGeo, lampMat);
  lampMesh.frustumCulled = false;
  lampMesh.renderOrder = 6;

  // each length of road is drawn as its distance asks, or not at all when it is out of sight
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const NEAR = mobile ? 34 : 58;
  const MID = mobile ? 120 : 210;
  const stats = { near: 0, mid: 0, far: 0, drawn: 0, triangles: 0 };
  const update = (camera: THREE.Camera) => {
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    stats.near = stats.mid = stats.far = stats.triangles = 0;
    for (const ch of chunks) {
      sphere.center.copy(ch.c);
      // (generous: the eye's own matrices are a frame old here)
      sphere.radius = ch.rad + 14;
      const vis = frustum.intersectsSphere(sphere);
      ch.mesh.visible = vis;
      if (!vis) continue;
      const d = camera.position.distanceTo(ch.c) - ch.rad;
      // (a little stickiness, so a length on the boundary does not flick between two ways of being drawn)
      const want = d < NEAR - (ch.lod === 0 ? -8 : 0) ? 0 : d < MID - (ch.lod <= 1 ? -16 : 0) ? 1 : 2;
      if (want !== ch.lod) {
        ch.lod = want;
        ch.mesh.geometry = lod[want];
        ch.mesh.material = want === 2 ? ch.card : ch.solid;
      }
      if (want === 0) stats.near++;
      else if (want === 1) stats.mid++;
      else stats.far++;
      stats.triangles += tris[want] * per;
    }
    stats.drawn = stats.near + stats.mid + stats.far;
  };

  return { group, lampMesh, bierMesh, update, stats, souls: per * count, per, count, geos: [...src, ...lod, lampGeo, bierSrc, bierGeo], mats: [...mats, lampMat, bierMat], roadTex, roadRd: new THREE.Vector4(L.N, L.STEP, 0, CHUNK) };
}
