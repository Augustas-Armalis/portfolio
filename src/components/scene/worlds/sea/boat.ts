import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { rng } from "../kit";

// The small boats that carry the souls. One boat is a slim dark skiff with a raised prow and stern, a lantern on a
// post at the prow, and up to three hooded souls standing in it; a boat is one instance of one mesh (about seven
// hundred triangles), drawn once for the whole fleet, and every motion is the vertex shader's: where it is on its
// way, which way it points, how it rides the water. The same boat sails two ways:
//   - in Tranquility, over the open glass, from far at the sides in toward the island's mouth, and in;
//   - in the Funeral Symphony, down the dark channel of the cave to the landing, where the souls step out.
// What differs is only `place` (a GLSL function that says where a boat is), and which air its colours stand in.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export const BOAT_LEN = 7;
// the lantern, in the boat's own metres (x across, y up, z toward the prow)
export const LANTERN: [number, number, number] = [0, 1.9, 3.05];

// A boat of length 7 m, prow toward +z. aT: x the kind of part (0 hull, 1 a soul, 2 the post and lantern, 3 the
// glow, a quad that faces the eye), y which soul it is (1..3) or, for the glow, which corner.
export function boatBase() {
  const pos: number[] = [];
  const idx: number[] = [];
  const typ: number[] = [];
  const L = BOAT_LEN / 2;
  const N = 20;
  const M = 8;
  const w = (z: number) => 0.98 * Math.pow(Math.max(0, 1 - (z / L) ** 2), 0.55) + 0.02;
  const d = (z: number) => 0.5 * Math.pow(Math.max(0, 1 - (z / L) ** 2), 0.5);
  const h = (z: number) => 0.46 + 1.0 * Math.pow(Math.abs(z / L), 5) + (z > 0 ? 0.25 * Math.pow(z / L, 3) : 0);
  for (let i = 0; i <= N; i++) {
    const z = -L + (i / N) * BOAT_LEN;
    for (let k = 0; k <= M; k++) {
      const a = (k / M) * Math.PI;
      pos.push(-w(z) * Math.cos(a), h(z) - (h(z) + d(z)) * Math.sin(a), z);
      typ.push(0, 0);
    }
  }
  for (let i = 0; i < N; i++)
    for (let k = 0; k < M; k++) {
      const a = i * (M + 1) + k;
      const b = a + M + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  // the floor of it, a little under the gunwales
  const f0 = pos.length / 3;
  for (let i = 0; i <= N; i++) {
    const z = -L + (i / N) * BOAT_LEN;
    pos.push(-w(z) * 0.94, 0.28, z, w(z) * 0.94, 0.28, z);
    typ.push(0, 0, 0, 0);
  }
  for (let i = 0; i < N; i++) {
    const a = f0 + i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // souls: a cloak falling from narrow shoulders to a pointed hood
  const prof: [number, number][] = [
    [0.27, 0],
    [0.24, 0.45],
    [0.17, 1.0],
    [0.2, 1.22],
    [0.1, 1.34],
    [0.12, 1.48],
    [0.0, 1.72],
  ];
  const S = 7;
  [-1.55, 0.05, 1.45].forEach((z, n) => {
    const base = pos.length / 3;
    for (const [r, y] of prof)
      for (let j = 0; j < S; j++) {
        const a = (j / S) * Math.PI * 2;
        pos.push(Math.cos(a) * r, 0.3 + y, z + Math.sin(a) * r * 0.85 + (y > 1.2 ? 0.06 : 0));
        typ.push(1, n + 1);
      }
    for (let r = 0; r < prof.length - 1; r++)
      for (let j = 0; j < S; j++) {
        const a = base + r * S + j;
        const b = base + r * S + ((j + 1) % S);
        idx.push(a, b, a + S, b, b + S, a + S);
      }
  });
  // the post at the prow, and the lantern's little box on it
  const post = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, kind: number) => {
    const o = pos.length / 3;
    for (const [x, y, z] of [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ]) {
      pos.push(cx + x * sx, cy + y * sy, cz + z * sz);
      typ.push(kind, 0);
    }
    for (const f of [
      [0, 2, 1, 0, 3, 2],
      [4, 5, 6, 4, 6, 7],
      [0, 1, 5, 0, 5, 4],
      [3, 7, 6, 3, 6, 2],
      [0, 4, 7, 0, 7, 3],
      [1, 2, 6, 1, 6, 5],
    ])
      idx.push(...f.map((v) => o + v));
  };
  post(0, 1.35, 3.05, 0.04, 0.95, 0.04, 2);
  post(LANTERN[0], LANTERN[1], LANTERN[2], 0.11, 0.15, 0.11, 2.5);
  // the glow: four corners, all at the lantern, spread by the shader
  const g0 = pos.length / 3;
  for (let c = 0; c < 4; c++) {
    pos.push(...LANTERN);
    typ.push(3, c);
  }
  idx.push(g0, g0 + 1, g0 + 2, g0, g0 + 2, g0 + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aT", new THREE.Float32BufferAttribute(typ, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// One boat: aA (what `place` needs: where it starts, its lane, its place in the cycle, a seed) and aB (the seconds
// one crossing takes, its size, how many souls it carries, a seed for its own bobbing).
export type Boat = { a: [number, number, number, number]; b: [number, number, number, number] };
export function boatsGeometry(list: Boat[]) {
  const base = boatBase();
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", base.attributes.position);
  g.setAttribute("normal", base.attributes.normal);
  g.setAttribute("aT", base.attributes.aT);
  g.setIndex(base.index);
  const a = new Float32Array(list.length * 4);
  const b = new Float32Array(list.length * 4);
  list.forEach((s, i) => {
    a.set(s.a, i * 4);
    b.set(s.b, i * 4);
  });
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 4));
  g.instanceCount = list.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

// A fleet over open water: `n` boats that start far off to either side and drift in toward the mouth. Each takes
// `period` seconds and the cycle is staggered, so there are always some on the water, nearer and farther.
export function seaFleet(n: number, mouth: { x: number; z: number }, seed = 7): Boat[] {
  const r = rng(seed);
  const out: Boat[] = [];
  for (let i = 0; i < n; i++) {
    // a ring of starts south of the island: wide to either side, some far, some near
    const side = i % 2 ? 1 : -1;
    const far = 320 + r() * 760;
    const across = side * (90 + Math.pow(r(), 0.8) * 560);
    out.push({ a: [mouth.x + across, mouth.z + far, (i + r() * 0.8) / n, r()], b: [150 + r() * 60, 1.45 + r() * 0.45, 1 + Math.floor(r() * 3.99), r()] });
  }
  return out;
}

export type BoatPlace = {
  // GLSL defining `vec3 boatPlace(vec4 A, vec4 B, out vec2 hd, out float fade)`: the boat's place in the world
  // (x, the water's level, z), the unit way it points on the water, and how much of it is there (0..1)
  glsl: string;
  uniforms: Record<string, THREE.IUniform>;
  // the air its colours stand in: GLSL it needs, and the call that applies it to `col` at `vWorld`
  airGlsl: string;
  airCall: string;
  // how much of a light at `vWorld` gets through that air (0..1)
  airK: string;
};

// mirror: the same fleet as the glass shows it (drawn under the water's face: see Sea.tsx for the order)
export function makeBoatMaterial(p: BoatPlace, mirror = false) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: !mirror,
    depthFunc: mirror ? THREE.GreaterDepth : THREE.LessEqualDepth,
    // (colour and glow in one pass: what is solid is drawn over, what is glow adds)
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { ...SKY_U, ...p.uniforms, uMirror: { value: mirror ? -1 : 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec4 aB; attribute vec2 aT;
      uniform float uTime; uniform float uMirror;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vL; varying vec3 vK; varying float vFade; varying vec2 vCorner; varying float vSeed;
      ${p.glsl}
      void main(){
        vec2 hd; float fade;
        vec3 c = boatPlace(aA, aB, hd, fade);
        float sc = aB.y;
        float type = aT.x;
        vec3 lp = position * sc;
        // fewer souls than places: the rest are not there
        if (type > 0.5 && type < 1.5 && aT.y > aB.z + 0.5) lp = vec3(0.0);
        vec3 fwd = vec3(hd.x, 0.0, hd.y);
        vec3 right = vec3(-hd.y, 0.0, hd.x);
        float ph = uTime * 0.8 + aB.w * 31.0;
        float bob = sin(ph) * 0.07 + sin(ph * 0.57 + 1.0) * 0.05;
        float roll = sin(ph * 0.9 + 2.0) * 0.03;
        float pitch = sin(ph * 0.7 + 4.0) * 0.02;
        // the souls stand, and sway a very little with the water
        if (type > 0.5 && type < 1.5) lp.x += (lp.y - 0.3 * sc) * sin(ph * 0.5 + aT.y * 2.0) * 0.012;
        lp.x += lp.y * roll; lp.z += lp.y * pitch;
        vec3 w = c + right * lp.x + vec3(0.0, lp.y + bob, 0.0) + fwd * lp.z;
        w.y = c.y + (w.y - c.y) * uMirror;
        vec3 nn = normal;
        vN = normalize(right * nn.x + vec3(0.0, nn.y * uMirror, 0.0) + fwd * nn.z);
        vL = position; vK = vec3(type, aT.y, 0.0); vFade = fade; vSeed = aB.w; vCorner = vec2(0.0);
        vWorld = w;
        if (type > 2.9) {
          // the glow of the lantern: a card that faces the eye, never smaller than a few pixels
          vec4 mv = viewMatrix * vec4(w, 1.0);
          float s = max(1.5 * sc, -mv.z * 0.0042);
          vec2 q = vec2(aT.y < 0.5 || aT.y > 2.5 ? -1.0 : 1.0, aT.y < 1.5 ? -1.0 : 1.0);
          mv.xy += q * s;
          vCorner = q;
          vK.z = s;
          gl_Position = projectionMatrix * mv;
          return;
        }
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uMirror;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vL; varying vec3 vK; varying float vFade; varying vec2 vCorner; varying float vSeed;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${p.airGlsl}
      float dith(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
      void main(){
        float type = vK.x;
        float flick = 0.86 + 0.14 * sin(uTime * (3.0 + vSeed * 3.0) + vSeed * 40.0) * sin(uTime * 1.7 + vSeed * 9.0);
        vec3 col;
        float a = 1.0;
        if (type > 2.9) {
          float r = length(vCorner);
          if (r > 1.0) discard;
          float g = exp(-r * r * 11.0) * 1.1 + exp(-r * 3.0) * 0.1;
          g *= 1.0 - smoothstep(0.7, 1.0, r);
          vec3 gc = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.9, 0.7), exp(-r * r * 40.0));
          // (a glow is a light in the air: the air it stands in takes it too)
          vec3 c2 = gc * g * flick * 1.5 * glowK();
          float air = ${p.airK};
          gl_FragColor = vec4(c2 * air * vFade * (uMirror < 0.0 ? 0.35 : 1.0), 0.0);
          ${END}
          return;
        }
        // (a boat that is not all there is dissolved, not faded: nothing here is drawn blended)
        if (vFade < dith(gl_FragCoord.xy)) discard;
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 l = vL;
        // the lantern's light on whatever is near it
        vec3 dl = l - vec3(${LANTERN.map((v) => v.toFixed(2)).join(", ")});
        float near = 1.0 / (1.0 + dot(dl, dl) * 0.5);
        float lit = near * flick;
        vec3 warm = vec3(1.0, 0.62, 0.26);
        if (type < 0.5) {
          // wood, tarred: dark plank on plank, the grain along its length
          float plank = vnoise(vec2(l.z * 1.6 + vSeed * 9.0, l.y * 9.0)) * 0.6 + vnoise(vec2(l.z * 5.0, l.x * 7.0)) * 0.4;
          vec3 alb = vec3(0.05, 0.036, 0.026) * (0.55 + 0.9 * plank);
          col = alb * (uSkyCol * (0.55 + 0.45 * n.y) * 0.9 + uKeyCol * clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0) * 0.18);
          col += alb * warm * lit * 7.0 * clamp(dot(n, -normalize(dl)) * 0.5 + 0.6, 0.0, 1.0);
          col += uHorizon * pow(1.0 - max(dot(n, V), 0.0), 3.5) * 0.06;
        } else if (type < 1.5) {
          // a soul: near-black cloth, only the lantern's side of it and a thread of cold along the hood
          float fold = vnoise(vec2(atan(l.x, l.z) * 2.5 + vK.y * 4.0, l.y * 5.0)) * 0.5 + 0.5;
          vec3 alb = vec3(0.012, 0.014, 0.03) * (0.6 + 0.8 * fold);
          col = alb * (uSkyCol * 1.3 + uKeyCol * 0.12);
          col += warm * alb * lit * 22.0 * clamp(dot(n, -normalize(dl)) * 0.6 + 0.4, 0.0, 1.0) + warm * 0.05 * lit * smoothstep(0.0, 1.0, -dot(n, normalize(dl)));
          col += uHorizon * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.1 * smoothstep(0.3, 1.0, l.y - 0.3);
        } else if (type < 2.25) {
          col = vec3(0.02, 0.014, 0.01) * (uSkyCol * 1.2 + 0.05);
        } else {
          col = vec3(1.0, 0.66, 0.28) * 3.4 * flick * glowK();
        }
        col = ${p.airCall};
        if (uMirror < 0.0) {
          col *= 0.62;
          a = 0.75;
        }
        gl_FragColor = vec4(col * a, a);
        ${END}
      }`,
  });
}
