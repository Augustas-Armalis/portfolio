import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, Kit, WORLD_U, type V3 } from "../kit";
import type { Seg } from "./forms";

// The Sonata of the Stars' own materials and figures: the sea of waves it stands on, the veil the pyramid is
// made of, the river of stars, the bands that cross the air, the glass globe, the angel, the constellations.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
const HASH = /* glsl */ `float h11(float x){ return fract(sin(x * 12.9898) * 43758.5453); }`;

// ---------- the sea of waves ----------
// Not land: long bands of deep blue, blue-green and umber lying one behind another like staves, each edged with a
// thread of gold, some hatched with fine level lines as he drew them, all drifting very slowly. `uLight`: where
// the pyramid stands (its light lies on the waves round its foot).
export function makeWaveSea(light: V3, reflect = "vec4 worldReflect(vec3 P, vec3 r){ return vec4(0.0); }") {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, uLight: { value: new THREE.Vector3(...light) } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vLocal = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${HASH}
      ${reflect}
      vec3 seaBand(float pick){ return pick < 0.3 ? vec3(0.008, 0.040, 0.060) : pick < 0.52 ? vec3(0.012, 0.062, 0.064) : pick < 0.66 ? vec3(0.010, 0.024, 0.085) : pick < 0.8 ? vec3(0.070, 0.040, 0.018) : pick < 0.9 ? vec3(0.120, 0.078, 0.028) : vec3(0.030, 0.080, 0.064); }
      void main(){
        vec2 p = vLocal.xz; float h = vLocal.y;
        vec3 camL = cameraPosition - (vWorld - vLocal);
        float dist = length(vWorld - cameraPosition);
        float warp = fbm(p * 0.003 + vec2(0.0, uTime * 0.003));
        float s = p.y * 0.03 + warp * 2.2 + 0.22 * sin(p.x * 0.006 + warp * 4.0);
        float fw = fwidth(s);
        float bi = floor(s); float bf = fract(s);
        vec3 deep = vec3(0.007, 0.032, 0.046);
        vec3 band = mix(seaBand(h11(bi - 1.0)), seaBand(h11(bi)), smoothstep(0.0, 0.45, bf));
        // far off the bands melt into one deep tone (and never shimmer)
        float farK = smoothstep(0.18, 0.9, fw);
        band = mix(band, deep, farK);
        float nearK = 1.0 - smoothstep(60.0, 420.0, dist);
        band = mix(band, deep * 1.5, nearK * 0.93);
        // each band is lighter toward its crest, as a wave is
        vec3 col = band * (0.55 + 0.9 * bf * bf * (1.0 - farK) * (1.0 - 0.85 * nearK) + 0.3 * nearK);
        // long strokes of the pastel laid along the band, and its grain
        float stroke = vnoise(vec2(p.x * 0.05, s * 14.0)) * 0.6 + vnoise(vec2(p.x * 0.21, s * 40.0)) * 0.4;
        col *= 1.0 + (stroke - 0.5) * 0.6 * (1.0 - smoothstep(60.0, 420.0, dist));
        col *= 0.8 + 0.4 * fbm(p * 0.0016 + 9.0);
        // fine level hatching in some of them
        float hl = bf * 26.0; float hw = fwidth(hl);
        float hatch = (1.0 - smoothstep(0.12, 0.2 + hw, abs(fract(hl) - 0.5))) * step(0.45, h11(bi + 7.0)) * (1.0 - smoothstep(0.3, 0.9, hw));
        col += vec3(0.04, 0.13, 0.10) * hatch * 0.6 * (1.0 - 0.6 * nearK);
        // the gold thread along every crest
        float crest = 1.0 - smoothstep(fw * 0.8, fw * 2.0 + 0.008, 1.0 - bf);
        vec3 gold = vec3(1.0, 0.8, 0.42);
        col += gold * crest * (0.1 + 0.1 * sin(p.x * 0.02 + uTime * 0.2 + bi)) * (1.0 - smoothstep(0.2, 1.0, fw));
        col *= uSkyCol * 2.3 + 0.2;
        // the light of the pyramid on the waves round its foot
        vec2 dL = p - uLight.xz; float dl = length(dL);
        col += gold * (0.4 + 0.6 * bf) * (exp(-dl * dl / (uLight.y * uLight.y)) * 0.22 + exp(-dl / (uLight.y * 2.4)) * 0.04) * glowK() * 2.0;
        // and its road across them toward the eye, broken into glints on the crests
        vec2 tc = camL.xz - uLight.xz; float D = length(tc); tc /= max(D, 1.0);
        float along = dot(dL, tc); float perp = dot(dL, vec2(-tc.y, tc.x));
        float wd = 26.0 + along * 0.07;
        float road = exp(-perp * perp / (wd * wd)) * smoothstep(150.0, 480.0, along) * (1.0 - smoothstep(D * 0.7, D, along));
        float spark = smoothstep(0.5, 0.86, vnoise(vec2(p.x * 0.07 + uTime * 0.35, s * 16.0))) * (0.3 + 0.7 * bf);
        col += gold * road * (0.035 + 0.6 * spark * (1.0 - farK)) * glowK() * 2.0;
        // the pyramids and their light mirrored in the swell, more of it the lower the eye looks
        {
          vec3 V = normalize(cameraPosition - vWorld); vec3 n = normalize(vN);
          vec3 rr = reflect(-V, n); rr.y = abs(rr.y) + 0.002; rr = normalize(rr);
          vec4 wr = worldReflect(vec3(p.x, 0.0, p.y), rr);
          float fr = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          col = mix(col, wr.rgb, wr.a * clamp(fr * 1.3 + 0.12, 0.0, 1.0));
        }
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- a veil of light ----------
// What the pyramid is made of: bands of pale colour with scalloped edges lying one over another like cloud seen
// through cloud, a gold thread along each, its four edges drawn in light, brighter toward the point.
export function makePyramidVeil(o: { h: number; half: number; alpha: number; seed: number; freq: number; edge?: number }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, uH: { value: o.h }, uHalf: { value: o.half }, uAlpha: { value: o.alpha }, uSeed: { value: o.seed }, uFreq: { value: o.freq }, uEdge: { value: o.edge ?? 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec2 vUv;
      void main(){ vLocal = position; vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uH; uniform float uHalf; uniform float uAlpha; uniform float uSeed; uniform float uFreq; uniform float uEdge;
      varying vec3 vLocal; varying vec3 vWorld; varying vec2 vUv;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${HASH}
      void main(){
        float t = clamp(vLocal.y / uH, 0.0, 1.0);
        float f = fract(vUv.x * 4.0);
        float wide = 2.0 * uHalf * (1.0 - t);
        float across = (f - 0.5) * wide;
        float edgeM = (0.5 - abs(f - 0.5)) * wide;
        float dist = length(vWorld - cameraPosition);
        float warp = fbm(vec2(across * 0.005 + uSeed, vLocal.y * 0.004 - uTime * 0.004)) * 110.0;
        float s = (vLocal.y + warp + 16.0 * abs(sin(across * 0.021 + vLocal.y * 0.003 + uSeed * 3.0))) * uFreq * (1.0 + t * 0.7) + uTime * 0.01;
        float fw = fwidth(s);
        float bi = floor(s); float bf = fract(s);
        float pick = h11(bi + uSeed * 7.0);
        vec3 c = pick < 0.34 ? vec3(1.0, 0.70, 0.30) : pick < 0.56 ? vec3(0.36, 0.70, 0.50) : pick < 0.82 ? vec3(0.92, 0.50, 0.34) : vec3(1.0, 0.86, 0.60);
        float line = (1.0 - smoothstep(fw, fw * 2.5 + 0.03, bf)) * (1.0 - smoothstep(0.3, 1.2, fw));
        float edge = (1.0 - smoothstep(0.3 + dist * 0.0008, 1.2 + dist * 0.0028, edgeM)) * uEdge;
        // drawn stars scattered over it
        vec2 sq = vec2(across, vLocal.y) / 26.0; vec2 sc = floor(sq); float sh = hash12(sc + uSeed * 13.0);
        vec2 sd = fract(sq) - 0.5 - (vec2(hash12(sc + 3.1), hash12(sc + 7.7)) - 0.5) * 0.6;
        float sr = length(sd); float sa = atan(sd.y, sd.x);
        float star = step(0.8, sh) * smoothstep(0.16 * (0.25 + 0.75 * pow(abs(cos(sa * 3.0)), 8.0)), 0.0, sr) * (0.6 + 0.4 * sin(uTime * (1.0 + 2.0 * sh) + sh * 40.0));
        star *= 1.0 - smoothstep(300.0, 900.0, dist);
        vec3 gold = vec3(1.0, 0.86, 0.52);
        vec3 col = c * (0.3 + 0.5 * t + 0.14 * pick) + gold * (line * 0.5 + edge * 0.8 + star * 1.6);
        col *= glowK() * 2.2;
        float a = uAlpha * (0.45 + 0.55 * pick) * (0.6 + 0.6 * t) + line * 0.2 + edge * 0.5 + star * 0.6;
        a *= smoothstep(0.0, 0.04, t) * smoothstep(8.0, 110.0, dist) * (1.0 - airAmt(vWorld) * 0.6) * exp(-dist * uMist * 1.5);
        gl_FragColor = vec4(col * (1.0 + uPulse * 0.4), clamp(a, 0.0, 0.9));
        ${END}
      }`,
  });
}

// ---------- the river of stars ----------
// A dark band sown with drawn stars of three sizes (six-pointed, gold, white and blue), a milky drift down its
// middle, gold threads along its brinks, the whole of it flowing slowly. uv.x: metres along; uv.y: -1..1 across.
// `top`: the share of its width that lies level; past that it falls away as a curtain and thins to nothing.
export function makeStarRiver(o: { width: number; top?: number; base: V3; warm?: number; flow?: number; alpha?: number }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, uW: { value: o.width }, uTop: { value: o.top ?? 1 }, uBase: { value: new THREE.Color(...o.base) }, uWarm: { value: o.warm ?? 0.5 }, uFlow: { value: o.flow ?? 1.2 }, uAlpha: { value: o.alpha ?? 0.8 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld;
      void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      uniform float uW; uniform float uTop; uniform vec3 uBase; uniform float uWarm; uniform float uFlow; uniform float uAlpha;
      varying vec2 vUv; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float v01 = vUv.y * 0.5 + 0.5;
        vec2 g = vec2(vUv.x - uTime * uFlow, v01 * uW);
        float dist = length(vWorld - cameraPosition);
        vec3 stars = vec3(0.0);
        for (int L = 0; L < 3; L++) {
          float cs = L == 0 ? 12.0 : L == 1 ? 5.0 : 2.2;
          vec2 q = g / cs + float(L) * 17.0;
          vec2 c = floor(q); float h = hash12(c);
          vec2 d = fract(q) - 0.5 - (vec2(hash12(c + 3.1), hash12(c + 7.7)) - 0.5) * 0.6;
          float r = length(d); float ang = atan(d.y, d.x);
          float size = (L == 0 ? 0.34 : 0.22) * (0.45 + 0.55 * h);
          float arms = L < 2 ? pow(abs(cos(ang * 3.0 + h * 6.0)), 9.0) : 0.0;
          float s = smoothstep(size * (0.3 + 0.7 * arms), 0.0, r) + exp(-r * r / (size * size * 0.06)) * 0.9;
          float tw = 0.6 + 0.4 * sin(uTime * (0.8 + 2.0 * h) + h * 40.0);
          float on = step(L == 0 ? 0.6 : 0.4, h);
          vec3 tint = h > 0.86 - 0.3 * (1.0 - uWarm) ? vec3(0.42, 0.6, 1.0) : h > 0.7 ? vec3(1.0) : vec3(1.0, 0.84, 0.5);
          // (the small ones are for near by: far off they would only shimmer)
          float lod = L == 2 ? 1.0 - smoothstep(120.0, 300.0, dist) : L == 1 ? 1.0 - smoothstep(380.0, 800.0, dist) : 1.0;
          stars += tint * s * tw * on * lod * (L == 0 ? 1.5 : L == 1 ? 1.0 : 0.6);
        }
        float milk = fbm(g * vec2(0.012, 0.07)) * exp(-pow((v01 - uTop * 0.5) / (uTop * 0.34), 2.0));
        vec3 col = uBase * (0.7 + 0.6 * vnoise(g * vec2(0.03, 0.3))) + vec3(0.2, 0.34, 0.36) * milk * 0.5 + stars * glowK() * 2.4;
        // gold threads along the brinks
        float e0 = v01 * uW; float e1 = abs(v01 - uTop) * uW;
        float brink = (1.0 - smoothstep(0.25 + dist * 0.001, 0.9 + dist * 0.003, e0)) + (1.0 - smoothstep(0.25 + dist * 0.001, 0.9 + dist * 0.003, e1));
        col += vec3(1.0, 0.82, 0.46) * brink * 0.9 * glowK() * 2.0;
        // the curtain: stars falling from the brink in long threads
        float fall = smoothstep(uTop, 1.0, v01);
        float streak = vnoise(vec2(vUv.x * 0.09, fall * 2.0 - uTime * 0.1)) * vnoise(vec2(vUv.x * 0.37 + 5.0, fall * 5.0 - uTime * 0.22));
        float a = uAlpha * (1.0 - fall) + (1.0 - fall) * step(uTop, v01) * (0.2 + 0.9 * streak);
        col += vec3(1.0, 0.8, 0.46) * streak * step(uTop, v01) * (1.0 - fall) * 0.8 * glowK();
        a = max(a, brink * 0.8) + length(stars) * 0.25;
        a *= smoothstep(0.0, 0.03, v01) * (uTop > 0.999 ? smoothstep(1.0, 0.97, v01) : 1.0) * (1.0 - airAmt(vWorld) * 0.7) * exp(-dist * uMist * 1.5) * smoothstep(1.0, 9.0, dist);
        gl_FragColor = vec4(col * (1.0 + uPulse * 0.4), clamp(a, 0.0, 0.92));
        ${END}
      }`,
  });
}
// the river's own bed: level across `top` metres, then turned over a round brink into a curtain `fall` metres deep
export function riverGeometry(x0: number, x1: number, yAt: (x: number) => number, z: number, top: number, fall: number, seg = 160) {
  const prof: [number, number][] = [];
  prof.push([-top / 2, 0], [-top / 4, 0], [0, 0], [top / 4, 0], [top / 2 - 4, 0]);
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    prof.push([top / 2 - 4 + Math.sin(a) * 4, -(1 - Math.cos(a)) * 4]);
  }
  for (let i = 1; i <= 4; i++) prof.push([top / 2, -4 - (i / 4) * (fall - 4)]);
  const lens = [0];
  for (let i = 1; i < prof.length; i++) lens.push(lens[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const total = lens[lens.length - 1];
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const m = prof.length;
  for (let i = 0; i <= seg; i++) {
    const x = x0 + ((x1 - x0) * i) / seg;
    const y = yAt(x);
    for (let j = 0; j < m; j++) {
      pos.push(x, y + prof[j][1], z + prof[j][0]);
      uv.push(x - x0, (lens[j] / total) * 2 - 1);
      if (i < seg && j < m - 1) {
        const a = i * m + j;
        idx.push(a, a + 1, a + m, a + 1, a + m + 1, a + m);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geo: g, width: total, top: lens[4] / total };
}

// ---------- bands that cross the air ----------
// Long translucent waves of pale blue-green, drawn with fine parallel threads that run their length and never
// quite keep still. Added to what is behind them, feathered to nothing at their edges.
export function makeWaveBand(o: { a: V3; b: V3; thread: V3; lines?: number; seed?: number; gain?: number }) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { ...SKY_U, ...WORLD_U, uA: { value: new THREE.Color(...o.a) }, uB: { value: new THREE.Color(...o.b) }, uThread: { value: new THREE.Color(...o.thread) }, uLines: { value: o.lines ?? 6 }, uSeed: { value: o.seed ?? 0 }, uGain: { value: o.gain ?? 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uSeed;
      varying vec2 vUv; varying vec3 vWorld;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.y += sin(uv.x * 0.006 + uTime * 0.11 + uSeed * 9.0) * 9.0 + sin(uv.x * 0.017 - uTime * 0.07 + uv.y * 1.3) * 4.0;
        vec4 wp = modelMatrix * vec4(p, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA; uniform vec3 uB; uniform vec3 uThread; uniform float uLines; uniform float uSeed; uniform float uGain;
      varying vec2 vUv; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        float y = vUv.y;
        float feather = pow(max(1.0 - y * y, 0.0), 1.6);
        float n = fbm(vec2(vUv.x * 0.006 - uTime * 0.012 + uSeed * 5.0, y * 1.4 + uSeed));
        float l = y * uLines + n * 3.0 + sin(vUv.x * 0.009 + uSeed * 9.0) * 0.7;
        float fw = fwidth(l);
        float thread = (1.0 - smoothstep(0.05, 0.12 + fw, abs(fract(l) - 0.5))) * (1.0 - smoothstep(0.35, 1.0, fw));
        // it comes and goes along its length, like cloud
        float body = smoothstep(0.3, 0.62, fbm(vec2(vUv.x * 0.0022 + uSeed * 3.0, y * 0.6 + uTime * 0.005)));
        vec3 col = mix(uA, uB, n) * (0.2 + 0.5 * n) * feather + uThread * thread * feather * 0.75;
        float dist = length(vWorld - cameraPosition);
        float fade = smoothstep(14.0, 120.0, dist) * (1.0 - airAmt(vWorld) * 0.8) * exp(-dist * uMist * 1.5);
        gl_FragColor = vec4(col * (0.25 + 0.75 * body) * fade * uGain * glowK() * (1.0 + uPulse * 0.4), 1.0);
        ${END}
      }`,
  });
}

// ---------- the globe ----------
// The Andante's glass world: green glass with rings of paler green drawn round a pale gold heart, turning slowly;
// seen through, brightest at its rim.
export function makeGlobeGlass(r: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...SKY_U, ...WORLD_U, uR: { value: r } },
    vertexShader: /* glsl */ `
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      void main(){ vLocal = position; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uR;
      varying vec3 vLocal; varying vec3 vWorld; varying vec3 vN;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${HASH}
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 q = normalize(vLocal);
        float ca = cos(uTime * 0.025); float sa = sin(uTime * 0.025);
        q = vec3(q.x * ca - q.z * sa, q.y, q.x * sa + q.z * ca);
        // rings drawn round its heart, which looks out a little above the level
        vec3 ax = normalize(vec3(0.5, 0.22, 0.84));
        float d = acos(clamp(dot(q, ax), -1.0, 1.0));
        float ring = d * 3.4 + fbm(q.xy * 2.2 + q.z) * 1.3;
        float fw = fwidth(ring);
        float bi = floor(ring); float bf = fract(ring);
        float pick = h11(bi + 2.0);
        vec3 glass = mix(vec3(0.02, 0.13, 0.11), vec3(0.16, 0.42, 0.30), pick);
        glass = mix(glass, vec3(0.05, 0.10, 0.26), step(0.78, pick));
        float heart = smoothstep(0.8, 0.0, d);
        float line = (1.0 - smoothstep(fw, fw * 2.5 + 0.03, bf)) * (1.0 - smoothstep(0.4, 1.4, fw));
        float fr = pow(1.0 - abs(dot(n, V)), 2.2);
        float lit = clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = glass * (0.4 + 0.8 * lit) * (uSkyCol * 1.6 + 0.25);
        col += vec3(1.0, 0.86, 0.48) * (heart * heart * 0.7 + line * 0.22) * glowK() * 2.0;
        col += vec3(0.3, 0.8, 0.6) * fr * 0.4 * glowK() * 2.0;
        float dist = length(vWorld - cameraPosition);
        float a = (0.42 + 0.2 * pick + 0.45 * fr + heart * 0.3) * smoothstep(6.0, 90.0, dist);
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col * (1.0 + uPulse * 0.4), clamp(a, 0.0, 0.94));
        ${END}
      }`,
  });
}

// ---------- the angel ----------
// The one at the pyramid's point: a slim robe of pale gold, a small head in a ring of light, arms lifted.
export function heroAngel(k: Kit, p: V3, s: number) {
  const prof: [number, number][] = [
    [0.44, 0],
    [0.38, 0.08],
    [0.28, 0.55],
    [0.21, 0.98],
    [0.19, 1.28],
    [0.23, 1.42],
    [0.13, 1.52],
    [0.07, 1.57],
  ];
  k.lathe(
    prof.map(([r, y]): [number, number] => [r * s, y * s]),
    p,
    [0.9, 0.6, 0.26],
    { glow: 0.7, top: [1, 0.86, 0.56], seg: 24 },
  );
  k.add(new THREE.SphereGeometry(0.115 * s, 16, 12), [p[0], p[1] + 1.69 * s, p[2]], [1, 0.93, 0.8], { glow: 1.1 });
  k.add(new THREE.TorusGeometry(0.27 * s, 0.012 * s, 6, 48), [p[0], p[1] + 1.69 * s, p[2] - 0.05 * s], [1, 0.9, 0.6], { glow: 2.4 });
  for (const sd of [-1, 1])
    k.tube(
      [
        [p[0] + sd * 0.2 * s, p[1] + 1.4 * s, p[2]],
        [p[0] + sd * 0.36 * s, p[1] + 1.6 * s, p[2] + 0.06 * s],
        [p[0] + sd * 0.46 * s, p[1] + 1.92 * s, p[2] + 0.04 * s],
      ],
      0.035 * s,
      [0.95, 0.84, 0.62],
      { glow: 0.8, seg: 10, sides: 6 },
    );
}
// one wing, as he drew it: a fan of long gold strokes, built about the shoulder
export function wingFan(side: number, s: number) {
  const k = new Kit();
  const n = 11;
  for (let i = 0; i < n; i++) {
    const ang = (0.1 + i * 0.118) * side;
    const len = s * (2.5 - 0.085 * Math.abs(i - 3) - (i > 7 ? (i - 7) * 0.22 : 0));
    const c = new THREE.ConeGeometry(0.06 * s, len, 4, 6);
    k.add(c, [Math.sin(ang) * len * 0.5, Math.cos(ang) * len * 0.5, -0.02 * s * i], [1, 0.62, 0.24], { glow: 0.9, top: [1, 0.9, 0.62], rot: [0, 0, -ang], scale: [1, 1, 0.22] });
  }
  return k.build();
}

// ---------- constellations ----------
// Figures of the night sky as he would have drawn them: stars joined by straight lines. Each is a set of strokes
// in a square of -1..1; the order they are written in is the order they are drawn in.
const FIGS: [number, number][][][] = [
  // the Great Wain (Grįžulo Ratai)
  [[[-1, 0.3], [-0.6, 0.42], [-0.25, 0.3], [0.05, 0.1], [0.1, -0.3], [0.62, -0.35], [0.7, 0.08], [0.05, 0.1]]],
  // the Swan
  [[[0, -1], [0, -0.3], [0, 0.25], [0, 0.85]], [[-0.95, 0.05], [-0.45, 0.3], [0, 0.25], [0.45, 0.3], [0.95, 0.05]]],
  // the Crown
  [[[-0.8, 0.5], [-0.6, -0.1], [-0.25, -0.42], [0.25, -0.42], [0.6, -0.1], [0.8, 0.5]], [[-0.8, 0.5], [-0.4, 0.1], [0, 0.55], [0.4, 0.1], [0.8, 0.5]]],
  // the Lyre
  [[[-0.3, -0.8], [-0.45, 0], [-0.22, 0.7], [0.22, 0.7], [0.45, 0], [0.3, -0.8], [-0.3, -0.8]], [[-0.1, 0.7], [-0.1, -0.8]], [[0.1, 0.7], [0.1, -0.8]]],
  // Cassiopeia
  [[[-1, 0.4], [-0.5, -0.3], [0, 0.2], [0.5, -0.4], [1, 0.3]]],
  // the Hunter
  [[[-0.5, 0.9], [0.5, 0.8], [0.15, 0.05], [0.6, -0.9], [-0.55, -0.8], [-0.15, 0], [-0.5, 0.9]], [[-0.15, 0], [0, 0.02], [0.15, 0.05]]],
  // the Ship
  [[[-0.85, -0.3], [-0.5, -0.65], [0.5, -0.65], [0.85, -0.3], [-0.85, -0.3]], [[0, -0.3], [0, 0.9], [0.6, -0.12], [0, -0.12]]],
  // the Pyramid
  [[[-0.75, -0.8], [0, 0.9], [0.75, -0.8], [-0.75, -0.8]], [[-0.36, 0.04], [0.36, 0.04]], [[0, 0.9], [0, 1.2]]],
  // the Angel
  [[[0, -0.95], [0, 0.3], [-0.7, 0.95], [-0.3, 0.05], [0, 0.3], [0.7, 0.95], [0.3, 0.05], [0, 0.3]], [[-0.1, 0.42], [0, 0.56], [0.1, 0.42], [-0.1, 0.42]]],
  // the Fish
  [[[-0.9, 0], [-0.3, 0.4], [0.4, 0.2], [0.7, 0], [0.4, -0.2], [-0.3, -0.4], [-0.9, 0]], [[0.7, 0], [1, 0.35], [1, -0.35], [0.7, 0]]],
];
export type Figure = { c: THREE.Vector3; size: number };
// lay figure `kind` at `c`, facing `toward`, `size` metres from its middle to its edge: its strokes and its stars
export function constellation(kind: number, fig: number, c: THREE.Vector3, toward: THREE.Vector3, size: number, segs: Seg[], stars: V3[], col: V3) {
  const strokes = FIGS[kind % FIGS.length];
  const fwd = toward.clone().sub(c).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
  const up = new THREE.Vector3().crossVectors(fwd, right).normalize();
  const at = (q: [number, number]): V3 => [c.x + (right.x * q[0] + up.x * q[1]) * size, c.y + (right.y * q[0] + up.y * q[1]) * size, c.z + (right.z * q[0] + up.z * q[1]) * size];
  let total = 0;
  for (const st of strokes) for (let i = 1; i < st.length; i++) total += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
  let run = 0;
  const seen = new Set<string>();
  for (const st of strokes)
    for (let i = 0; i < st.length; i++) {
      const key = st[i].join(",");
      if (!seen.has(key)) {
        seen.add(key);
        stars.push(at(st[i]));
      }
      if (i === 0) continue;
      const l = Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
      segs.push({ a: at(st[i - 1]), b: at(st[i]), w: 1.1, col, fig, t0: 0.02 + (run / total) * 0.96, t1: 0.02 + ((run + l) / total) * 0.96 });
      run += l;
    }
}
export const FIG_KINDS = FIGS.length;
