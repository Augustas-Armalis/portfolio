import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, rng } from "../kit";
import { FRIEND_U, GLSL_ORB } from "./cave";
import { HER_AT, HER_S, toWorld } from "./her";
import type { HerSkin } from "./herBuild";
import { floorAt } from "./shape";

// How she is painted, and her crown of rays.
//
// Her skin is lit as he lit her: only by the orb. Where it reaches her (the palm and fingers round it, the face
// turned to it, the throat and the shoulder) she is warm ochre going to gold, through rose at the turn of the form,
// the light wrapping softly round (as through skin: the fingers glow at their edges where the orb is behind them);
// away from it she goes into deep umber, and in the hollows to the cave's teal. A soft rim of the crown's green-gold
// light lies along her back and the top of her head. The surface is pastel laid in strokes (projected three ways,
// so they follow no seam), with grain; there is no shine on it anywhere. Below the shoulder she goes into the dark,
// as in the picture.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export function herGeometry(s: HerSkin) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(s.pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(s.nor, 3));
  g.setAttribute("aAO", new THREE.BufferAttribute(s.ao, 1));
  g.setAttribute("aPart", new THREE.BufferAttribute(s.part, 1));
  g.setIndex(new THREE.BufferAttribute(s.idx, 1));
  g.computeBoundingSphere();
  return g;
}

const HEADW = toWorld([0, 0.03, 0]);
export function makeHerMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, uHead: { value: new THREE.Vector3(...HEADW) } },
    vertexShader: /* glsl */ `
      attribute float aAO; attribute float aPart;
      varying vec3 vWorld; varying vec3 vN; varying float vAO; varying float vPart; varying vec3 vLocal;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vN = normalize(mat3(modelMatrix) * normal);
        vAO = aAO; vPart = aPart;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHead;
      varying vec3 vWorld; varying vec3 vN; varying float vAO; varying float vPart; varying vec3 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_ORB}
      // a pastel stroke field on one plane: short strokes laid one way, broken
      float strokes(vec2 p, float ang){
        vec2 d = vec2(cos(ang), sin(ang));
        vec2 q = vec2(dot(p, d), dot(p, vec2(-d.y, d.x)));
        float row = floor(q.y * 1.6);
        float along = q.x * 0.45 + hash12(vec2(row, 3.1)) * 9.0;
        float s = vnoise(vec2(along, row * 1.7)) * 0.65 + vnoise(vec2(q.x * 2.3, q.y * 7.0)) * 0.35;
        return s;
      }
      void main(){
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(n, V) < -0.2) n = -n;
        float ndv = clamp(dot(n, V), 0.0, 1.0);
        // the paint, laid three ways and blended by the normal
        vec3 bw = pow(abs(n), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
        vec3 wp = vLocal;
        float st = strokes(wp.zy, 1.2) * bw.x + strokes(wp.xz, 0.4) * bw.y + strokes(wp.xy, 1.35) * bw.z;
        float grain = hash12(floor(gl_FragCoord.xy * 0.7)) - 0.5;
        // the orb's light, wrapped round the form, and what comes through thin flesh
        vec3 Lv = uOrb - vWorld;
        float d = length(Lv);
        vec3 L = Lv / d;
        float ndl = dot(n, L);
        float att = 1.0 / (1.0 + pow(max(d - 30.0, 0.0) / 52.0, 2.0));
        float wrap = clamp((ndl + 0.55) / 1.55, 0.0, 1.0);
        wrap = wrap * wrap * (3.0 - 2.0 * wrap);
        float thin = 1.0 - smoothstep(30.0, 75.0, d);
        float through = pow(clamp(dot(V, -L), 0.0, 1.0), 2.0) * thin * (0.35 + 0.65 * (1.0 - ndv));
        float lit = (wrap * att * 1.15 + through * 0.7) * uOrbK;
        lit *= 0.55 + 0.45 * vAO;
        lit *= 0.86 + 0.28 * st;
        // the ramp: umber in the dark, rose at the turn, ochre, gold where the light is full
        vec3 umber = vec3(0.045, 0.028, 0.018);
        vec3 teal = vec3(0.02, 0.06, 0.055);
        vec3 rose = vec3(0.42, 0.17, 0.11);
        vec3 ochre = vec3(0.78, 0.47, 0.2);
        vec3 gold = vec3(1.05, 0.78, 0.42);
        float l = clamp(lit, 0.0, 1.6);
        vec3 skin = mix(umber, rose, smoothstep(0.02, 0.32, l));
        skin = mix(skin, ochre, smoothstep(0.25, 0.7, l));
        skin = mix(skin, gold, smoothstep(0.7, 1.4, l));
        // the hollows and the turned-away go to the cave's teal
        skin = mix(skin, teal, (1.0 - vAO) * 0.6 * (1.0 - smoothstep(0.1, 0.5, l)));
        // the hair: dark umber locks, the light catching along them in gold
        float lock = vnoise(vec2(atan(vLocal.z - uHead.z, vLocal.x - uHead.x) * 70.0, (vLocal.y - uHead.y) * 0.05)) * 0.6 + st * 0.4;
        vec3 hairC = mix(vec3(0.025, 0.018, 0.012), vec3(0.11, 0.065, 0.03), lock) * (0.35 + 1.1 * l);
        hairC += vec3(0.5, 0.36, 0.14) * pow(clamp(wrap, 0.0, 1.0), 3.0) * att * lock * 0.6;
        vec3 col = mix(skin, hairC, smoothstep(0.3, 0.7, vPart));
        // the crown's light on her from above and behind: a soft green-gold rim, and the orb's own rim on the profile
        vec3 crownDir = normalize(vec3(0.55, 0.8, -0.2));
        float rim = pow(1.0 - ndv, 3.0);
        col += vec3(0.16, 0.26, 0.11) * rim * clamp(dot(n, crownDir) + 0.2, 0.0, 1.0) * 0.4;
        col += vec3(1.0, 0.5, 0.18) * pow(1.0 - ndv, 1.6) * smoothstep(0.0, 0.5, ndl) * att * 1.1 * uOrbK;
        // a fleck of the ground's colours in the strokes, as pastel picks up its neighbours
        col *= 1.0 + vec3(-0.04, 0.03, 0.05) * (st - 0.5) * 2.0;
        col *= 1.0 + grain * 0.07;
        // she goes into the dark below the shoulder
        float fl = ${floorAt(HER_AT.x, HER_AT.z).toFixed(1)};
        float down = smoothstep(fl + 18.0, fl + 85.0, vWorld.y);
        col = mix(vec3(0.012, 0.018, 0.014), col, down);
        col = mix(col, airCol(-V), airAmt(vWorld) * 0.5) + orbScatter(vWorld) * 0.5;
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- the crown of rays ----------
// Fine strands of light rooted in the crown of her head, streaming up and back in a fan, each a thin ribbon that
// tapers and breaks as a pastel stroke does, swaying slowly. One instanced strip, added to what is behind.
export function crownGeometry(n: number, seg = 10) {
  const base = new THREE.InstancedBufferGeometry();
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    pos.push(i / seg, -1, 0, i / seg, 1, 0);
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  base.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  base.setIndex(idx);
  const r = rng(907);
  const root = new Float32Array(n * 3);
  const dir = new Float32Array(n * 3);
  const shape = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // a root on the crown: over the top and back of the head (her frame), a little under the hair's surface
    const a = r();
    const lx = -0.06 + a * 0.15;
    const lz = (r() * 2 - 1) * 0.07 * (1 - a * 0.3);
    const ly = 0.115 - Math.pow((lx - 0.01) / 0.1, 2) * 0.04 - Math.pow(lz / 0.07, 2) * 0.03;
    const p = toWorld([lx, ly, lz]);
    root.set(p, i * 3);
    // the fan: from steeply up at her brow to far back at the back of the head (the picture's 50 to 85 degrees)
    const ang = THREE.MathUtils.degToRad(84 - a * 38 + (r() - 0.5) * 10);
    const side = lz / 0.055;
    const d = new THREE.Vector3(Math.cos(ang), Math.sin(ang), side * 0.28 + (r() - 0.5) * 0.15).normalize();
    dir.set([d.x, d.y, d.z], i * 3);
    // length, width at the root, a seed, brightness
    const L = 70 + Math.pow(r(), 0.7) * 160;
    shape.set([L, 0.5 + r() * 0.9, r(), 0.5 + r() * 0.5], i * 4);
  }
  base.setAttribute("aRoot", new THREE.InstancedBufferAttribute(root, 3));
  base.setAttribute("aDir", new THREE.InstancedBufferAttribute(dir, 3));
  base.setAttribute("aShape", new THREE.InstancedBufferAttribute(shape, 4));
  base.instanceCount = n;
  base.boundingSphere = new THREE.Sphere(new THREE.Vector3(HER_AT.x + 40, HER_AT.y + 90, HER_AT.z), 0.8 * HER_S);
  return base;
}
export function makeCrownMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, uPx: { value: 0.001 }, uK: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aRoot; attribute vec3 aDir; attribute vec4 aShape;
      uniform float uPx; uniform float uTime;
      varying float vT; varying float vS; varying float vSeed; varying float vB; varying vec3 vWorld; varying float vThin;
      void main(){
        float t = position.x;
        float L = aShape.x;
        // the strand bows back as it rises, and sways, more toward its tip
        vec3 back = vec3(1.0, -0.15, 0.0);
        float sway = sin(uTime * 0.35 + aShape.z * 30.0 + t * 2.0) * 0.6 + sin(uTime * 0.21 + aShape.z * 11.0) * 0.4;
        vec3 p = aRoot + aDir * L * t + back * L * 0.16 * t * t + vec3(0.0, 0.0, 1.0) * sway * L * 0.035 * t * t;
        vec3 tng = normalize(aDir + back * 0.32 * t);
        vec3 toEye = cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz;
        vec3 side = normalize(cross(tng, toEye));
        // tapering; never thinner than a pixel and a half (thinner, it is dimmed instead)
        float w = aShape.y * (1.0 - 0.8 * t);
        float minW = 1.5 * uPx * length(toEye);
        vThin = clamp(w / minW, 0.0, 1.0);
        w = max(w, minW);
        p += side * position.y * w;
        vT = t; vS = position.y; vSeed = aShape.z; vB = aShape.w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uK;
      varying float vT; varying float vS; varying float vSeed; varying float vB; varying vec3 vWorld; varying float vThin;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        // soft across, rising from the root, thinning out at the tip, broken like chalk along its length
        float across = 1.0 - smoothstep(0.2, 1.0, abs(vS));
        float along = smoothstep(0.0, 0.22, vT) * (1.0 - smoothstep(0.55, 1.0, vT));
        float brk = 0.35 + 0.65 * smoothstep(0.3, 0.7, vnoise(vec2(vT * 9.0 + vSeed * 50.0 - uTime * 0.15, vSeed * 13.0)));
        vec3 c = mix(vec3(0.95, 0.78, 0.36), vec3(0.55, 0.85, 0.35), smoothstep(0.1, 0.7, vT) * (0.5 + 0.5 * vSeed));
        float k = across * along * brk * vB * vThin * 0.07 * uK;
        k *= 1.0 - 0.6 * airAmt(vWorld);
        gl_FragColor = vec4(c * k, 1.0);
        ${END}
      }`,
  });
}
