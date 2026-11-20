import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, noise2, rng } from "../kit";
import { heightGLSL } from "../voyage";
import { FINALE_TERRAIN, SWELL_GLSL, WAVE, bodyAt, ridgeN, ridgeZ } from "./shape";

// The water of the Finale. One sheet for the whole sea, raised into the great wave by the world's own height
// field and moved by the swell (both in the vertex shader); over the wave's shoulder a second sheet, the crest,
// which leaves the face, rears, and curls forward and down into hanging fingers of lace. The water is green
// and amber and lit from within: thin water between the eye and the low sun glows, thick water is dark; foam
// lies on it as he painted it, in a lace of cells and strings of beads.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

const WAVE_GLSL = /* glsl */ `
  const float W_BASE = ${WAVE.base.toFixed(1)};
  float ridgeZ(float s){ return ${WAVE.z0.toFixed(1)} + ${WAVE.bend.toFixed(6)} * s * s; }
  float waveH(float s){ float k = s / ${WAVE.span.toFixed(1)}; k *= k; return ${WAVE.H.toFixed(1)} * exp(-k * k); }
  float waveRho(float s){ return ${WAVE.rho.toFixed(1)} * (0.45 + 0.55 * waveH(s) / ${WAVE.H.toFixed(1)}); }
`;
// foam as he painted it: a lace of cells, slowly working
const LACE_GLSL = /* glsl */ `
  // x: how near a wall of the lace (1 on it), y: this cell's own number, z: how near the cell's heart
  vec3 lace(vec2 p, float t){
    vec2 i = floor(p); vec2 f = fract(p);
    float f1 = 9.0; float f2 = 9.0; float id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash12(i + g), hash12(i + g + 17.3));
      o = 0.5 + 0.36 * sin(t + 6.2832 * o);
      vec2 d = g + o - f; float dd = dot(d, d);
      if (dd < f1) { f2 = f1; f1 = dd; id = hash12(i + g + 3.7); } else if (dd < f2) f2 = dd;
    }
    float e = sqrt(f2) - sqrt(f1);
    return vec3(1.0 - smoothstep(0.03, 0.15, e), id, 1.0 - smoothstep(0.0, 0.5, sqrt(f1)));
  }
  // a string of beads along the lace's walls
  float beads(vec2 p, float wall){
    vec2 c = fract(p * 30.0) - 0.5;
    return smoothstep(0.8, 0.96, wall) * (1.0 - smoothstep(0.2, 0.34, length(c)));
  }
  const vec3 W_DEEP = vec3(0.03, 0.03, 0.012);
  const vec3 W_GREEN = vec3(0.1, 0.17, 0.03);
  const vec3 W_LIME = vec3(0.4, 0.42, 0.07);
  const vec3 W_GOLD = vec3(0.86, 0.62, 0.14);
  const vec3 W_FOAM = vec3(0.98, 0.9, 0.7);
  // the water's own colour by how thin it is between the eye and the light: umber-green, green, yellow-green, gold
  vec3 waterCol(float thin){
    vec3 c = mix(W_DEEP, W_GREEN, smoothstep(0.0, 0.4, thin));
    c = mix(c, W_LIME, smoothstep(0.3, 0.75, thin));
    return mix(c, W_GOLD, smoothstep(0.7, 1.0, thin));
  }
`;

// ---------- the sea, and the wave's face ----------
export function buildSea(mobile: boolean) {
  const SEG = mobile ? 200 : 330;
  const INNER = 980;
  const OUTER = 3300;
  const warp = (u: number) => {
    const a = Math.abs(u);
    const k = 0.76;
    if (a < k) return Math.sign(u) * (a / k) * INNER;
    const t = (a - k) / (1 - k);
    const c0 = (INNER / k) * (1 - k);
    return Math.sign(u) * (INNER + c0 * t + (OUTER - INNER - c0) * t * t);
  };
  const NV = SEG + 1;
  const pos = new Float32Array(NV * NV * 3);
  for (let j = 0; j < NV; j++)
    for (let i = 0; i < NV; i++) {
      const o = (j * NV + i) * 3;
      pos[o] = warp((i / SEG) * 2 - 1) - 80;
      pos[o + 2] = warp((j / SEG) * 2 - 1) + 60;
    }
  const idx = new Uint32Array(SEG * SEG * 6);
  let n = 0;
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < SEG; i++) {
      const a = j * NV + i;
      const b = a + NV;
      idx[n++] = a;
      idx[n++] = b;
      idx[n++] = a + 1;
      idx[n++] = b;
      idx[n++] = b + 1;
      idx[n++] = a + 1;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-80, 100, 60), OUTER * 1.5);
  return g;
}

export function makeSeaMaterial(sign: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, uSign: { value: sign } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec3 vW;
      ${heightGLSL(FINALE_TERRAIN, "fieldH")}
      ${SWELL_GLSL}
      float surf(vec2 p){ float b = fieldH(p) - ${WAVE.base.toFixed(1)}; return b + swellH(p, uTime) * swellDamp(b); }
      void main(){
        vec2 p = position.xz;
        float b = fieldH(p) - ${WAVE.base.toFixed(1)};
        float sw = swellH(p, uTime) * swellDamp(b);
        float y = b + sw;
        float e = 2.5;
        vec3 n = normalize(vec3(y - surf(p + vec2(e, 0.0)), e, y - surf(p + vec2(0.0, e))));
        vec3 lp = vec3(p.x, y, p.y);
        vec4 wp = modelMatrix * vec4(lp, 1.0);
        vWorld = wp.xyz; vLocal = lp; vN = normalize(mat3(modelMatrix) * n); vW = vec3(b, sw, 0.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSign;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec3 vW;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${WAVE_GLSL}
      ${LACE_GLSL}
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(vWorld - cameraPosition);
        vec2 p = vLocal.xz;
        float body = vW.x; float sw = vW.y;
        // where on the wave: along its crest, across it (in its own widths), and how far up its face
        float s = p.x;
        float sl = 2.0 * ${WAVE.bend.toFixed(6)} * s;
        float f = (p.y - ridgeZ(s)) / sqrt(1.0 + sl * sl) / waveRho(s);
        float up = clamp(body / max(waveH(s), 1.0), 0.0, 1.0);
        float onWave = smoothstep(5.0, 46.0, body);
        float front = step(0.0, f);
        // the small work of the surface: chop that thins out with distance and smooths up the face
        vec2 fl = vec2(uTime * 0.11, -uTime * 0.19);
        float e = 0.6;
        float c0 = fbm(p * 0.07 + fl) + 0.5 * vnoise(p * 0.31 - fl * 2.3);
        float cx = fbm((p + vec2(e, 0.0)) * 0.07 + fl) + 0.5 * vnoise((p + vec2(e, 0.0)) * 0.31 - fl * 2.3);
        float cz = fbm((p + vec2(0.0, e)) * 0.07 + fl) + 0.5 * vnoise((p + vec2(0.0, e)) * 0.31 - fl * 2.3);
        float chop = (1.1 - 0.75 * onWave) / (1.0 + dist * 0.006);
        vec3 n = normalize(normalize(vN) + vec3(c0 - cx, 0.0, c0 - cz) * chop);
        vec3 L = uSunDir;
        vec3 Lh = normalize(vec3(L.x, 0.0, L.z));
        // how thin the water is between the eye and the light: the upper face of the wave, the crests of the swell
        // (most light comes through the middle of the face; above it the wave is in its own crest's shade)
        float thinW = smoothstep(0.04, 0.5, up) * (1.0 - 0.55 * smoothstep(0.55, 0.85, up));
        float thinS = smoothstep(0.6, 4.4, sw + (c0 - 0.8) * 1.5) * 0.6;
        float thin = mix(thinS, thinW, onWave * front);
        float toSun = pow(max(dot(-V, Lh), 0.0), 2.0);
        vec3 water = waterCol(thin * (0.72 + 0.28 * toSun));
        // (the troughs of the swell are umber, as his foreground waves are)
        water = mix(water, vec3(0.04, 0.024, 0.01), (1.0 - onWave) * smoothstep(1.5, -3.5, sw) * 0.42);
        // lit from within: the low sun behind the water
        vec3 col = water * (uSkyCol * 0.95 + uKeyCol * (0.12 + thin * (0.5 + 0.9 * toSun)));
        // the long fine lines of the water drawn up the face, lighter and darker, always moving up
        float line = vnoise(vec2((s + f * 110.0) * 0.3, up * 2.6 - uTime * 0.1)) * 0.55 + vnoise(vec2((s - f * 40.0) * 0.9, up * 6.0 - uTime * 0.16)) * 0.45;
        col *= 1.0 + (line - 0.5) * 1.2 * onWave * front;
        // under the overhanging crest the face stands in the wave's own shade: umber, as he painted the hollow
        float hollow = smoothstep(0.5, 0.72, up + (line - 0.5) * 0.16) * (1.0 - smoothstep(0.88, 0.99, up)) * onWave * front * smoothstep(900.0, 700.0, abs(s));
        col = mix(col, vec3(0.085, 0.052, 0.022) * (0.5 + 1.1 * line) * (uSkyCol * 1.1 + uKeyCol * 0.12), hollow * 0.82);
        // the sky in it: strongly at a grazing eye on the open sea, hardly at all on the lit face
        vec3 r = reflect(-V, n); r.y = abs(r.y) + 0.002; r = normalize(r);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        col = mix(col, skyBase(r), fres * (1.0 - 0.75 * onWave * front));
        // the sun's road on the open water
        col += uKeyCol * pow(max(dot(r, L), 0.0), 140.0) * 0.9 * (1.0 - onWave) * smoothstep(-0.02, 0.06, L.y);
        // far down in the open water, the lights of ships that went under long ago (the sonata's Andante): seen
        // only looking down into it, never at a distance
        {
          float deepLook = smoothstep(0.25, 0.7, V.y) * (1.0 - onWave);
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            vec2 c = vec2(210.0 - fi * 46.0 + 30.0 * sin(fi * 2.3), 560.0 - fi * 92.0);
            vec2 d = (p - c) + V.xz / max(V.y, 0.2) * 14.0;
            float g = exp(-dot(d, d) * 0.012) + 0.5 * exp(-dot(d - vec2(5.0, 3.0), d - vec2(5.0, 3.0)) * 0.05);
            col += vec3(1.0, 0.66, 0.24) * g * deepLook * (0.5 + 0.2 * sin(uTime * 0.8 + fi * 2.0)) * 0.55;
          }
        }
        // ---- foam ----
        vec2 drift = vec2(uTime * 0.6, -uTime * 2.4);
        vec3 l1 = lace((p + drift) * 0.19, uTime * 0.3);
        vec3 l2 = lace((p + drift * 0.6) * 0.52 + 7.0, uTime * 0.45);
        float ragged = smoothstep(0.35, 0.65, fbm((p + drift * 0.8) * 0.018 + 3.0));
        // on the swell: on the crests and streaming down their backs
        float crest = smoothstep(1.6, 4.8, sw + (c0 - 0.8) * 2.4) * (1.0 - onWave) * (0.35 + 0.65 * ragged);
        // the broad band of lace at the wave's foot, where the ships ride
        float band = smoothstep(2.9, 2.3, f) * smoothstep(1.35, 1.9, f) * smoothstep(1050.0, 600.0, abs(s)) * front * (0.45 + 0.55 * ragged);
        // drawn up the face in long ragged tongues, thinning as they climb
        vec3 l3 = lace(vec2(s * 0.24, body * 0.24 - uTime * 0.3), uTime * 0.2);
        float tongue = smoothstep(0.52, 0.76, vnoise(vec2(s * 0.02 + up * 2.6 + 2.0, up * 3.4 - uTime * 0.03)) * 0.7 + vnoise(vec2(s * 0.07 - up * 3.0, up * 8.0 - uTime * 0.05)) * 0.3) * smoothstep(0.02, 0.2, up) * (1.0 - smoothstep(0.5, 0.86, up)) * onWave * front;
        // and where the crest leaves the face it is all foam
        float shoulder = smoothstep(0.76, 0.9, up) * onWave * front;
        // (foam is a paleness with the lace's cells standing open in it, most open at its edges)
        float foam = crest * (0.4 + 0.6 * l1.x) * (0.6 + 0.4 * l2.x) + band * mix(max(l1.x * 0.9, l2.x * 0.6), 0.62 + 0.38 * l2.x, smoothstep(0.55, 0.85, ragged)) + tongue * (0.42 + 0.58 * l3.x) + shoulder * (0.6 + 0.4 * l2.x);
        // (far off the lace is only a paleness)
        foam = mix(foam, (crest * 0.5 + band * 0.5 + tongue * 0.3 + shoulder * 0.8), smoothstep(160.0, 700.0, dist));
        // ---- strings of beads: amber, on the green of the face ----
        vec2 bp = vec2(s * 0.052, body * 0.052 - uTime * 0.03) + 3.0;
        vec3 l4 = lace(bp, uTime * 0.1);
        float bead = beads(bp, l4.x) * smoothstep(0.1, 0.26, up) * (1.0 - smoothstep(0.62, 0.84, up)) * onWave * front * (1.0 - smoothstep(90.0, 520.0, dist) * 0.85);
        // ---- his initials, in beads, on the face (as on the picture) ----
        vec2 sg = vec2((s - 150.0) / 84.0, (up - 0.36) / 0.125);
        float sign = 0.0;
        if (sg.x > 0.0 && sg.x < 1.0 && sg.y > 0.0 && sg.y < 1.0) {
          float m = texture2D(uSign, sg).r;
          vec2 bc = fract(sg * vec2(56.0, 24.0)) - 0.5;
          sign = m * (1.0 - smoothstep(0.22, 0.36, length(bc))) * onWave * front;
        }
        vec3 foamCol = W_FOAM * (uSkyCol * 0.85 + uKeyCol * (0.3 + 0.25 * toSun));
        col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.92);
        col = mix(col, vec3(0.95, 0.52, 0.1) * (uSkyCol * 0.8 + uKeyCol * (0.35 + 0.6 * toSun)), clamp(bead, 0.0, 1.0) * 0.75);
        col = mix(col, foamCol * 1.1, sign);
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// his initials, as the sea shader reads them: white letters on black
export function signTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 192;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "italic 600 150px Georgia, 'Times New Roman', serif";
  g.fillText("MKČ", c.width / 2, c.height / 2 + 8);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = true;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ---------- the crest ----------
// Its section, in widths of the wave across (0 the crest line, toward the face) and heights of the wave: it
// leaves the face at the shoulder, rears, goes over, comes down, and ends in the fingers.
const LIP: [number, number][] = [
  [0.445, 0.82],
  [0.4, 0.97],
  [0.43, 1.11],
  [0.56, 1.21],
  [0.76, 1.26],
  [0.97, 1.23],
  [1.13, 1.14],
  [1.22, 1.02],
  [1.26, 0.9],
  [1.27, 0.8],
  [1.25, 0.7],
];
const TIP_ROW = 7; // from here on it is fingers
function lipAt(v: number): [number, number] {
  // a smooth line through the section's points (Catmull-Rom)
  const f = v * (LIP.length - 1);
  const i = Math.min(LIP.length - 2, Math.floor(f));
  const t = f - i;
  const p = (k: number) => LIP[Math.min(LIP.length - 1, Math.max(0, k))];
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  return [cr(p(i - 1)[0], p(i)[0], p(i + 1)[0], p(i + 2)[0]), cr(p(i - 1)[1], p(i)[1], p(i + 1)[1], p(i + 2)[1])];
}
export const LIP_FINGERS = TIP_ROW / (LIP.length - 1);
// how far the fingers hang at a place along the crest (longest where the plane goes out through them)
const fingerLen = (s: number) => 0.75 + 0.45 * noise2(s * 0.012, 3.3) + 0.9 * Math.exp(-(((s + 635) / 70) ** 2));

export function buildCrest(mobile: boolean) {
  const STEP = mobile ? 14 : 7;
  const ROWS = mobile ? 26 : 40;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tips: { p: THREE.Vector3; n: [number, number]; h: number }[] = [];
  let cols = 0;
  for (let s = -900; s <= 900; s += STEP, cols++) {
    const n = ridgeN(s);
    const rx = s;
    const rz = ridgeZ(s);
    const hc = bodyAt(rx, rz);
    // where the face is at the shoulder's height: the crest springs from there
    let d = 0;
    while (d < 400 && bodyAt(rx + n[0] * d, rz + n[1] * d) > 0.82 * hc) d += 2;
    const rho = d / 0.445;
    const end = Math.min(1, Math.max(0, (880 - Math.abs(s)) / 200));
    const k = end * end * (3 - 2 * end);
    const fl = fingerLen(s);
    for (let r = 0; r <= ROWS; r++) {
      const v = r / ROWS;
      const [lf, ly] = lipAt(v);
      // toward the wave's ends the crest is less and less, and folds down into the face
      let ff = 0.445 + (lf - 0.445) * k;
      let yy = 0.82 + (ly - 0.82) * k;
      if (v > LIP_FINGERS) {
        const [tf, ty] = lipAt(LIP_FINGERS);
        ff = 0.445 + (tf + (lf - tf) * fl - 0.445) * k;
        yy = 0.82 + (ty + (ly - ty) * fl - 0.82) * k;
      }
      const x = rx + n[0] * ff * rho;
      const z = rz + n[1] * ff * rho;
      pos.push(x, yy * hc, z);
      uv.push(s, v, hc, k);
      if (r === ROWS && k > 0.3) tips.push({ p: new THREE.Vector3(x, (1.0 - (1.0 - yy) * 0.5) * hc, z), n, h: hc });
    }
  }
  const NR = ROWS + 1;
  for (let c = 0; c < cols - 1; c++)
    for (let r = 0; r < ROWS; r++) {
      const a = c * NR + r;
      const b = a + NR;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geo: g, tips };
}

export function makeCrestMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aUv;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vUv;
      void main(){
        vec3 p = position;
        // the hanging part is never still: it sways along the crest and breathes up and down
        float hang = smoothstep(0.45, 1.0, aUv.y) * aUv.w;
        p.x += sin(uTime * 0.5 + aUv.x * 0.021) * 5.0 * hang * hang;
        p.y += (sin(uTime * 0.37 + aUv.x * 0.013) * 0.02 + sin(uTime * 0.9 + aUv.x * 0.05) * 0.006) * aUv.z * hang;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = aUv;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec4 vUv;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${LACE_GLSL}
      void main(){
        float s = vUv.x; float v = vUv.y;
        float dist = length(vWorld - cameraPosition);
        // ---- the fingers: beyond the turn of the crest the sheet divides, each finger its own length and width ----
        float fz = (v - ${LIP_FINGERS.toFixed(3)}) / ${(1 - LIP_FINGERS).toFixed(3)};
        float su = s / 44.0 + 0.4 * sin(s * 0.013) + 0.15 * sin(s * 0.047);
        float fid = floor(su); float fu = fract(su) - 0.5;
        // (rounded lobes, as he drew the foam's edge: scallops, some long, most short)
        float flen = 0.34 + 0.66 * pow(hash12(vec2(fid, 2.0)), 1.6);
        float fw = 0.5 * sqrt(max(0.0, 1.0 - (fz / flen) * (fz / flen))) + 0.02;
        // (a second, smaller row between them)
        float su2 = s / 17.0 + 3.0; float fu2 = fract(su2) - 0.5; float flen2 = 0.18 + 0.3 * hash12(vec2(floor(su2), 5.0));
        float fw2 = 0.5 * sqrt(max(0.0, 1.0 - (fz / flen2) * (fz / flen2)));
        float inF = fz < 0.0 ? 1.0 : max(step(abs(fu), fw) * step(fz, flen), step(abs(fu2), fw2) * step(fz, flen2));
        float edgeD = fz < 0.0 ? 1.0 : min(max(fw - abs(fu), 0.0) * 44.0, (flen - fz) * 90.0);
        // ---- the lace: the further from the shoulder, the more it is holes ----
        vec3 l1 = lace(vec2(s * 0.06, v * 20.0 - uTime * 0.05), uTime * 0.25);
        vec3 l2 = lace(vec2(s * 0.19 + 5.0, v * 62.0 - uTime * 0.11), uTime * 0.4);
        // (whole cells of the lace are open: a net, not a sieve; none near the shoulder, most at the fingers' ends)
        float open = smoothstep(0.72, 1.0, v);
        float hole = step(l1.x, 0.45) * step(l1.y, open * 0.4);
        if (inF < 0.5 || (hole > 0.5 && edgeD > 2.5)) discard;
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float under = step(dot(n, V), 0.0) * step(0.0, vN.y) + step(0.0, dot(n, V)) * step(vN.y, 0.0);
        if (dot(n, V) < 0.0) n = -n;
        vec3 L = uSunDir;
        float toSun = max(dot(-V, L), 0.0);
        // thin water lit from behind: green at the shoulder, yellow-green over the top, gold toward the edge
        float thin = smoothstep(0.0, 0.9, v);
        vec3 water = waterCol(0.3 + 0.7 * thin * (0.65 + 0.35 * pow(toSun, 2.0)));
        vec3 col = water * (uSkyCol * 0.95 + uKeyCol * (0.2 + (0.5 + 1.3 * pow(toSun, 2.0)) * (0.3 + 0.7 * thin)));
        // seen from under, in the hollow, it is the wave's own shade with the light coming through in lines
        col = mix(col, col * vec3(0.6, 0.42, 0.26), under * (1.0 - 0.6 * pow(toSun, 3.0)) * 0.75);
        // the sun itself, seen through the sheet
        col += uKeyCol * vec3(0.95, 1.0, 0.55) * pow(toSun, 46.0) * (0.25 + 0.75 * thin) * 1.2;
        // falling water: long lines down the sheet
        float line = vnoise(vec2(s * 0.24, v * 5.0 - uTime * 0.22)) * 0.6 + vnoise(vec2(s * 0.7, v * 11.0 - uTime * 0.4)) * 0.4;
        col *= 0.62 + 0.76 * line;
        // the sky on its upper side
        float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
        col = mix(col, skyBase(reflect(-V, n)), fres * 0.3 * (1.0 - under));
        // foam: lace over the sheet toward its edge, thick on the fingers, and beads along every edge
        // (on its upper side the crest is a thick cap of foam, a honeycomb of bubbles; from under, the water shows through)
        float cap = smoothstep(0.3, 0.6, v) * (1.0 - 0.72 * under);
        float foam = cap * (0.62 + 0.38 * l2.x) * (0.8 + 0.2 * l1.x) + l1.x * smoothstep(0.5, 0.9, v) * 0.5 * under;
        foam = max(foam, 1.0 - smoothstep(0.5, 2.6, edgeD));
        foam += beads(vec2(s * 0.06, v * 20.0 - uTime * 0.05), l1.x) * 0.6 * smoothstep(0.3, 0.6, v);
        foam = mix(foam, smoothstep(0.55, 1.0, v) * 0.6, smoothstep(300.0, 1000.0, dist));
        vec3 foamCol = W_FOAM * (uSkyCol * 0.85 + uKeyCol * (0.3 + 0.5 * toSun));
        col = mix(col, foamCol, clamp(foam, 0.0, 1.0) * 0.9);
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- spray ----------
// Drops thrown from the fingers of the crest: each leaves a finger's end, is carried out and falls, slowly (the
// wave is very large), and begins again; near the eye they are beads of amber and cream.
export function buildSpray(tips: { p: THREE.Vector3; n: [number, number]; h: number }[], count: number) {
  const r = rng(1908);
  const p0 = new Float32Array(count * 3);
  const v0 = new Float32Array(count * 3);
  const t = new Float32Array(count * 3);
  const box = new THREE.Box3();
  for (let i = 0; i < count; i++) {
    const tip = tips[Math.floor(r() * tips.length)];
    p0.set([tip.p.x + (r() - 0.5) * 14, tip.p.y + (r() - 0.3) * tip.h * 0.16, tip.p.z + (r() - 0.5) * 14], i * 3);
    const out = 2 + r() * 9;
    v0.set([tip.n[0] * out + (r() - 0.5) * 5, 3 - r() * 6, tip.n[1] * out + (r() - 0.5) * 5], i * 3);
    t.set([r(), 5 + r() * 5, 0.5 + r() * r() * 2.4], i * 3);
    box.expandByPoint(tip.p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p0, 3));
  g.setAttribute("aV", new THREE.BufferAttribute(v0, 3));
  g.setAttribute("aT", new THREE.BufferAttribute(t, 3));
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  g.boundingSphere.radius += 400;
  return g;
}
export function makeSprayMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec3 aV; attribute vec3 aT;
      uniform float uTime;
      varying float vA; varying float vK; varying vec3 vWorld;
      void main(){
        float life = aT.y;
        float age = fract(uTime / life + aT.x);
        float tt = age * life;
        vec3 p = position + aV * tt + vec3(0.0, -2.6 * tt * tt, 0.0);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vec4 mv = viewMatrix * wp;
        vWorld = wp.xyz;
        vK = fract(aT.z * 7.31);
        vA = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.7, 1.0, age)) * step(1.0, p.y);
        gl_PointSize = clamp(aT.z * 300.0 / -mv.z, 1.0, 26.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vK; varying vec3 vWorld;
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        if (r > 1.0) discard;
        // a bead: a pale body, a brighter rim on the sun's side, a dark hair of an outline
        float body = 1.0 - smoothstep(0.75, 1.0, r);
        vec3 V = normalize(cameraPosition - vWorld);
        float toSun = pow(max(dot(-V, uSunDir), 0.0), 2.0);
        vec3 col = mix(vec3(0.98, 0.9, 0.7), vec3(1.0, 0.72, 0.26), vK * 0.7) * (uSkyCol * 0.85 + uKeyCol * (0.3 + 0.9 * toSun));
        col *= 0.8 + 0.4 * smoothstep(0.2, -0.6, c.y);
        gl_FragColor = vec4(applyAir(col, vWorld), body * vA * 0.85);
        ${END}
      }`,
  });
}
