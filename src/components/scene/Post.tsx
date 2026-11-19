"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SKY_U } from "./sky";

// The lens and the hand: everything the world is seen through.
//
//   scene (linear HDR, MSAA, depth)
//     -> half res + circle of confusion -> a soft disc blur (depth of field)
//     -> a pyramid of blurs (bloom on the sun, moon, lamps and station lights)
//     -> a sky-only mask smeared away from the sun (god rays)
//     -> composite, exposure, filmic curve, a gentle grade
//     -> a light Kuwahara (flat dabs of paint), paper grain, a soft colour
//        quantise, vignette
//
// Levels: 0 = off (the scene is drawn straight to the screen, as before),
// 1 = bloom + grade + grain, 2 = everything, 3 = everything with more taps.
//
// Display-referred surfaces (the monitor's boot frame and lock screen, the
// paintings) mark themselves with alpha 0 and pass through untouched, so the
// boot hand-off to the DOM stays exact.

export const POST_U = {
  // 1 while the scene is being drawn into the linear target, 0 straight to screen
  uLinearOut: { value: 0 },
};

export const postCtl = {
  focus: 2, // metres to the plane of focus
  dof: 1, // 0..1 depth of field strength
  look: 1, // 0..1 strength of the painterly pass
  overlay: null as THREE.Material | null, // drawn over everything (the loader)
  render: null as (() => void) | null, // draw one finished frame now (photos, stills)
  level: 0,
};

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function pass(frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, number> = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
}

const GLSL_DEPTH = /* glsl */ `
uniform sampler2D tDepth; uniform float uNear; uniform float uFar;
float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
`;

// half resolution colour, with the circle of confusion in alpha
const HALF = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform float uFocus; uniform float uDof;
${GLSL_DEPTH}
void main(){
  vec3 c = min(texture2D(tMap, vUv).rgb, vec3(48.0));
  float z = viewZ(vUv);
  float coc = clamp(abs(uFocus / z - 1.0) * 0.44 - 0.06, 0.0, 1.0) * uDof;
  gl_FragColor = vec4(c, coc);
}`;

const DOF = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel; uniform float uMaxR;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  vec4 c = texture2D(tMap, vUv);
  float coc = c.a;
  vec3 acc = c.rgb; float w = 1.0;
  if (coc > 0.01) {
    float j = ign(gl_FragCoord.xy) * 6.2831;
    for (int i = 1; i <= TAPS; i++) {
      float k = sqrt(float(i) / float(TAPS));
      float r = k * coc * uMaxR;
      float a = float(i) * 2.39996 + j;
      vec4 s = texture2D(tMap, vUv + vec2(cos(a), sin(a)) * r * uTexel);
      // a sample only spills here if its own blur reaches this far
      float sw = clamp(s.a * uMaxR - r + 1.0, 0.0, 1.0);
      acc += s.rgb * sw; w += sw;
    }
  }
  gl_FragColor = vec4(acc / w, coc);
}`;

// 13-tap downsample; the first bloom level also keeps only what is brighter than paper
const DOWN = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel; uniform float uThresh;
vec3 s(float x, float y){ return texture2D(tMap, vUv + vec2(x, y) * uTexel).rgb; }
void main(){
  vec3 e = s(0.0, 0.0);
  vec3 col = e * 0.125 + (s(-2.0, 2.0) + s(2.0, 2.0) + s(-2.0, -2.0) + s(2.0, -2.0)) * 0.03125
    + (s(0.0, 2.0) + s(-2.0, 0.0) + s(2.0, 0.0) + s(0.0, -2.0)) * 0.0625
    + (s(-1.0, 1.0) + s(1.0, 1.0) + s(-1.0, -1.0) + s(1.0, -1.0)) * 0.125;
  if (uThresh > 0.0) {
    float br = max(col.r, max(col.g, col.b));
    float knee = uThresh * 0.6;
    float soft = clamp(br - uThresh + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    col *= max(soft, br - uThresh) / max(br, 1e-4);
    col = min(col, vec3(14.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const UP = /* glsl */ `
varying vec2 vUv; uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTexel;
vec3 s(float x, float y){ return texture2D(tLow, vUv + vec2(x, y) * uTexel).rgb; }
void main(){
  vec3 lo = (s(-1.0, 1.0) + s(1.0, 1.0) + s(-1.0, -1.0) + s(1.0, -1.0)) * 0.0625
    + (s(0.0, 1.0) + s(-1.0, 0.0) + s(1.0, 0.0) + s(0.0, -1.0)) * 0.125 + s(0.0, 0.0) * 0.25;
  gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + lo, 1.0);
}`;

// the open sky, and only the sky: what the rays are made of
const MASK = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform sampler2D tDepth;
void main(){
  float sky = step(0.99995, texture2D(tDepth, vUv).x);
  vec3 c = min(texture2D(tMap, vUv).rgb, vec3(3.0));
  gl_FragColor = vec4(c * sky, 1.0);
}`;

const RAYS = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uSun; uniform float uAspect;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  vec2 d = (uSun - vUv) * (0.82 / float(TAPS));
  vec2 uv = vUv + d * ign(gl_FragCoord.xy);
  vec3 acc = vec3(0.0); float illum = 1.0;
  for (int i = 0; i < TAPS; i++) {
    acc += texture2D(tMap, uv).rgb * illum;
    illum *= 0.955; uv += d;
  }
  // strongest around the sun, gone at the far side of the frame
  vec2 q = (vUv - uSun) * vec2(uAspect, 1.0);
  gl_FragColor = vec4(acc / float(TAPS) * exp(-dot(q, q) * 1.4), 1.0);
}`;

const GLSL_FINISH = /* glsl */ `
uniform float uTime; uniform float uLook; uniform vec2 uRes;
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y); }
// paper: long soft fibres and a fine tooth, the same sheet every frame
vec3 finish(vec3 c, vec2 uv){
  vec2 px = uv * uRes / max(uRes.y / 900.0, 1.0);
  float fibre = vn(px * vec2(0.035, 0.5)) * 0.5 + vn(px * vec2(0.6, 0.05) + 40.0) * 0.5;
  float tooth = h12(floor(px * 1.0)) * 0.6 + vn(px * 0.5) * 0.4;
  float paper = (fibre - 0.5) * 0.034 + (tooth - 0.5) * 0.026;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c *= 1.0 + paper * uLook * (0.45 + 0.55 * smoothstep(0.02, 0.5, lum));
  // a soft quantise: the tones gather a little, as mixed paint does
  vec3 q = floor(c * 28.0 + 0.5) / 28.0;
  c = mix(c, q, 0.22 * uLook);
  // vignette
  vec2 v = (uv - 0.5) * vec2(1.0, 0.94);
  float vig = smoothstep(0.42, 0.98, length(v) * 1.28);
  c *= 1.0 - vig * 0.34;
  c += (h12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  return c;
}
vec3 encode(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`;

const COMPOSITE = /* glsl */ `
varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tDof; uniform sampler2D tBloom; uniform sampler2D tRays;
uniform float uExposure; uniform float uBloom; uniform float uRays; uniform vec3 uRayCol; uniform float uFocus; uniform float uDof; uniform float uNight; uniform float uWarm;
${GLSL_DEPTH}
${GLSL_FINISH}
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color){
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = I * color; color = RRTAndODTFit(color); color = O * color;
  return clamp(color, 0.0, 1.0);
}
void main(){
  vec4 sc = texture2D(tScene, vUv);
  float keep = clamp(sc.a, 0.0, 1.0);
  vec3 hdr = sc.rgb;
  #ifdef USE_DOF
    float z = viewZ(vUv);
    float coc = clamp(abs(uFocus / z - 1.0) * 0.44 - 0.06, 0.0, 1.0) * uDof;
    vec4 soft = texture2D(tDof, vUv);
    hdr = mix(hdr, soft.rgb, smoothstep(0.02, 0.4, max(coc, soft.a * 0.6)) * keep * step(0.011, uDof));
  #endif
  vec3 raw = encode(hdr);
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  vec3 lit = hdr + bloom * uBloom;
  #ifdef USE_RAYS
    lit += texture2D(tRays, vUv).rgb * uRayCol * uRays;
  #endif
  vec3 c = aces(lit);
  // the grade: shadows lean to a cool violet, lights to warm cream, blacks a touch lifted
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadow = mix(vec3(0.045, 0.04, 0.075), vec3(0.02, 0.03, 0.075), uNight);
  c = c + shadow * (1.0 - smoothstep(0.0, 0.45, l)) * 0.55;
  c *= mix(vec3(1.0), vec3(1.035, 1.0, 0.95), smoothstep(0.35, 0.95, l) * uWarm);
  c = mix(vec3(l), c, 1.06);
  c = encode(c);
  #ifdef FINISH
    c = finish(c, vUv);
  #endif
  gl_FragColor = vec4(mix(raw, c, keep), keep);
}`;

// Kuwahara over a 5x5 window (four overlapping 3x3 quarters), then the finish
const PAINT = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel; uniform float uStep;
${GLSL_FINISH}
void main(){
  vec4 c0 = texture2D(tMap, vUv);
  vec3 m[4]; vec3 s2[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s2[k] = vec3(0.0); }
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec3 c = texture2D(tMap, vUv + vec2(float(x), float(y)) * uTexel * uStep).rgb;
    vec3 cc = c * c;
    if (x <= 0 && y <= 0) { m[0] += c; s2[0] += cc; }
    if (x >= 0 && y <= 0) { m[1] += c; s2[1] += cc; }
    if (x <= 0 && y >= 0) { m[2] += c; s2[2] += cc; }
    if (x >= 0 && y >= 0) { m[3] += c; s2[3] += cc; }
  }
  vec3 best = c0.rgb; float minV = 1e9;
  for (int k = 0; k < 4; k++) {
    vec3 mean = m[k] / 9.0;
    float v = dot(abs(s2[k] / 9.0 - mean * mean), vec3(0.299, 0.587, 0.114));
    if (v < minV) { minV = v; best = mean; }
  }
  vec3 c = mix(c0.rgb, best, 0.62 * uLook);
  c = finish(c, vUv);
  gl_FragColor = vec4(mix(c0.rgb, c, c0.a), 1.0);
}`;

function build(level: number) {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(tri);
  quad.frustumCulled = false;
  const cam = new THREE.Camera();
  const hdr = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
  const full = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: level >= 2 ? 4 : 2, depthBuffer: true });
  full.depthTexture = new THREE.DepthTexture(4, 4);
  const half = new THREE.WebGLRenderTarget(4, 4, hdr);
  const dof = new THREE.WebGLRenderTarget(4, 4, hdr);
  const down = [0, 1, 2, 3, 4].map(() => new THREE.WebGLRenderTarget(4, 4, hdr));
  const up = [0, 1, 2, 3].map(() => new THREE.WebGLRenderTarget(4, 4, hdr));
  const mask = new THREE.WebGLRenderTarget(4, 4, hdr);
  const rays = new THREE.WebGLRenderTarget(4, 4, hdr);
  const ldr = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const depthU = { tDepth: { value: full.depthTexture }, uNear: { value: 0.01 }, uFar: { value: 3000 } };
  const finishU = { uTime: SKY_U.uTime, uLook: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } };
  const paint = level >= 2;
  const m = {
    half: pass(HALF, { tMap: { value: full.texture }, uFocus: { value: 2 }, uDof: { value: 1 }, ...depthU }),
    dof: pass(DOF, { tMap: { value: half.texture }, uTexel: { value: new THREE.Vector2() }, uMaxR: { value: 5 } }, { TAPS: level >= 3 ? 34 : 20 }),
    down: pass(DOWN, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0 } }),
    up: pass(UP, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() } }),
    mask: pass(MASK, { tMap: { value: half.texture }, tDepth: { value: full.depthTexture } }),
    rays: pass(RAYS, { tMap: { value: mask.texture }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } }, { TAPS: level >= 3 ? 44 : 28 }),
    comp: pass(
      COMPOSITE,
      {
        tScene: { value: full.texture },
        tDof: { value: dof.texture },
        tBloom: { value: up[0].texture },
        tRays: { value: rays.texture },
        uExposure: { value: 1 },
        uBloom: { value: 0.1 },
        uRays: { value: 0 },
        uRayCol: { value: new THREE.Color(1, 0.8, 0.6) },
        uFocus: { value: 2 },
        uDof: { value: 1 },
        uNight: SKY_U.uNight,
        uWarm: { value: 1 },
        ...depthU,
        ...finishU,
      },
      { ...(level >= 2 ? { USE_DOF: 1, USE_RAYS: 1 } : {}), ...(paint ? {} : { FINISH: 1 }) },
    ),
    paint: pass(PAINT, { tMap: { value: ldr.texture }, uTexel: { value: new THREE.Vector2() }, uStep: { value: 1 }, ...finishU }),
  };
  const targets = [full, half, dof, ...down, ...up, mask, rays, ldr];
  return { quad, cam, full, half, dof, down, up, mask, rays, ldr, m, tri, targets, depthU, finishU, paint, w: 0, h: 0 };
}

const sunV = new THREE.Vector3();

export function Post({ level }: { level: number }) {
  const gl = useThree((s) => s.gl);
  // linear float targets need the extension; without it the scene is drawn as before
  const ok = useMemo(() => gl.capabilities.isWebGL2 && (gl.extensions.has("EXT_color_buffer_float") || gl.extensions.has("EXT_color_buffer_half_float")), [gl]);
  const lv = ok ? level : 0;
  const p = useMemo(() => (lv > 0 ? build(lv) : null), [lv]);
  useEffect(
    () => () => {
      if (!p) return;
      p.targets.forEach((t) => t.dispose());
      p.full.depthTexture?.dispose();
      Object.values(p.m).forEach((x) => x.dispose());
      p.tri.dispose();
    },
    [p],
  );
  const over = useMemo(() => {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const q = new THREE.Mesh(tri);
    q.frustumCulled = false;
    return { q, cam: new THREE.Camera(), tri };
  }, []);
  useEffect(() => () => over.tri.dispose(), [over]);

  const draw = (scene: THREE.Scene, camera: THREE.Camera) => {
    const overlay = () => {
      if (!postCtl.overlay) return;
      over.q.material = postCtl.overlay;
      const ac = gl.autoClear;
      gl.autoClear = false;
      gl.setRenderTarget(null);
      gl.render(over.q, over.cam);
      gl.autoClear = ac;
    };
    postCtl.level = lv;
    if (!p) {
      POST_U.uLinearOut.value = 0;
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      overlay();
      return;
    }
    const buf = gl.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(8, Math.floor(buf.x));
    const h = Math.max(8, Math.floor(buf.y));
    if (w !== p.w || h !== p.h) {
      p.w = w;
      p.h = h;
      p.full.setSize(w, h);
      p.ldr.setSize(w, h);
      p.half.setSize(w >> 1, h >> 1);
      p.dof.setSize(w >> 1, h >> 1);
      p.down.forEach((t, i) => t.setSize(Math.max(2, w >> (i + 2)), Math.max(2, h >> (i + 2))));
      p.up.forEach((t, i) => t.setSize(Math.max(2, w >> (i + 2)), Math.max(2, h >> (i + 2))));
      p.mask.setSize(w >> 2, h >> 2);
      p.rays.setSize(w >> 2, h >> 2);
    }
    const run = (mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
      p.quad.material = mat;
      gl.setRenderTarget(target);
      gl.render(p.quad, p.cam);
    };
    const pc = camera as THREE.PerspectiveCamera;
    p.depthU.uNear.value = pc.near;
    p.depthU.uFar.value = pc.far;

    // the scene, linear and unclipped
    POST_U.uLinearOut.value = 1;
    gl.setRenderTarget(p.full);
    gl.render(scene, camera);
    POST_U.uLinearOut.value = 0;

    const dofOn = lv >= 2 ? postCtl.dof : 0;
    p.m.half.uniforms.uFocus.value = postCtl.focus;
    p.m.half.uniforms.uDof.value = dofOn;
    run(p.m.half, p.half);
    if (lv >= 2 && dofOn > 0.01) {
      p.m.dof.uniforms.uTexel.value.set(1 / p.half.width, 1 / p.half.height);
      p.m.dof.uniforms.uMaxR.value = p.half.height / 105;
      run(p.m.dof, p.dof);
    }

    // bloom pyramid
    let src: THREE.WebGLRenderTarget = p.half;
    p.down.forEach((t, i) => {
      p.m.down.uniforms.tMap.value = src.texture;
      p.m.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      p.m.down.uniforms.uThresh.value = i === 0 ? 1.0 : 0;
      run(p.m.down, t);
      src = t;
    });
    let low: THREE.WebGLRenderTarget = p.down[4];
    for (let i = 3; i >= 0; i--) {
      p.m.up.uniforms.tLow.value = low.texture;
      p.m.up.uniforms.tHigh.value = p.down[i].texture;
      p.m.up.uniforms.uTexel.value.set(1 / low.width, 1 / low.height);
      run(p.m.up, p.up[i]);
      low = p.up[i];
    }

    // god rays from the sun (or, faintly, the moon) when it is low and in front of us
    let rayK = 0;
    if (lv >= 2) {
      const sunUp = SKY_U.uSunDir.value.y > -0.06;
      const dir = sunUp ? SKY_U.uSunDir.value : SKY_U.uMoonDir.value;
      sunV.copy(dir).multiplyScalar(1000).add(camera.position).project(camera);
      const fwd = camera.getWorldDirection(new THREE.Vector3()).dot(dir);
      const low2 = sunUp ? 1 - THREE.MathUtils.smoothstep(dir.y, 0.16, 0.62) : 0.35 * SKY_U.uNight.value;
      const inView = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sunV.x), Math.abs(sunV.y)), 1.0, 1.7);
      rayK = fwd > 0.05 ? low2 * inView * THREE.MathUtils.smoothstep(fwd, 0.05, 0.4) : 0;
      if (rayK > 0.004) {
        run(p.m.mask, p.mask);
        p.m.rays.uniforms.uSun.value.set(sunV.x * 0.5 + 0.5, sunV.y * 0.5 + 0.5);
        p.m.rays.uniforms.uAspect.value = w / h;
        run(p.m.rays, p.rays);
      }
    }

    const c = p.m.comp.uniforms;
    c.uExposure.value = gl.toneMappingExposure;
    c.uBloom.value = 0.085 * (1 + SKY_U.uPulse.value * 0.35);
    c.uRays.value = rayK * 0.55;
    (c.uRayCol.value as THREE.Color).copy(SKY_U.uGlow.value).lerp(new THREE.Color(1, 1, 1), 0.35);
    if (SKY_U.uSunDir.value.y <= -0.06) (c.uRayCol.value as THREE.Color).set(0.6, 0.7, 1.0);
    c.uFocus.value = postCtl.focus;
    c.uDof.value = dofOn;
    p.finishU.uLook.value = postCtl.look;
    p.finishU.uRes.value.set(w, h);
    if (p.paint) {
      run(p.m.comp, p.ldr);
      p.m.paint.uniforms.uTexel.value.set(1 / w, 1 / h);
      p.m.paint.uniforms.uStep.value = Math.max(1, h / 1100);
      run(p.m.paint, null);
    } else run(p.m.comp, null);
    overlay();
  };

  const state = useThree();
  useEffect(() => {
    postCtl.render = () => draw(state.scene, state.camera);
    return () => {
      postCtl.render = null;
    };
  });
  useFrame((s) => draw(s.scene, s.camera), 1);
  return null;
}
