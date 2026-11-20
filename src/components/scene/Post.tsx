"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { SKY_U } from "./sky";

// The lens and the hand: everything the world is seen through.
//
//   scene (linear HDR, MSAA, depth)
//     -> half res with a signed circle of confusion (behind / in front of the
//        plane of focus), from a real thin lens: focal length, f-number,
//        focus distance
//     -> depth of field: one gather that keeps two layers apart, what lies
//        behind the plane and what hangs in front of it, so soft background
//        never creeps over a sharp edge and soft foreground does spill
//     -> a pyramid of blurs (bloom on the sun, moon, lamps and station lights)
//     -> a sky-only mask smeared away from the sun (god rays)
//     -> composite at full resolution: whatever is in focus is the scene's own
//        pixels, untouched; exposure, filmic curve, a gentle grade
//     -> far away only, a light Kuwahara (flat dabs of paint); paper grain,
//        vignette
//
// Levels: 0 = off (the scene is drawn straight to the screen, as before),
// 1 = bloom + grade + grain (depth of field only while the camera is held),
// 2 = everything, 3 = everything with more taps.
//
// Display-referred surfaces (the monitor's boot frame and lock screen, the
// paintings) mark themselves with alpha 0 and pass through untouched while
// they are in focus, so the boot hand-off to the DOM stays exact.

export const POST_U = {
  // 1 while the scene is being drawn into the linear target, 0 straight to screen
  uLinearOut: { value: 0 },
};

export type Capture = { data: Uint8ClampedArray; w: number; h: number };

export const postCtl = {
  focus: 2, // metres to the plane of focus
  aperture: 2.8, // f-number
  sensor: 24, // mm of film the full height of the frame stands for (the focal length follows from the camera's fov)
  band: 0.3, // how far either side of the plane stays perfectly sharp, in 1 - focus / distance
  dof: 1, // 0..1 depth of field strength
  look: 1, // 0..1 strength of the painterly pass
  exposure: 1, // multiplies the sky's own exposure (the camera's exposure dial)
  photo: false, // the camera is held: depth of field at every level that has a lens, with more taps
  overlay: null as THREE.Material | null, // drawn over everything (the loader)
  render: null as (() => void) | null, // draw one finished frame now (photos, stills)
  // metres from the lens to whatever is drawn at a point of the frame (0..1, origin bottom left)
  depthAt: null as ((u: number, v: number) => number | null) | null,
  // one finished frame drawn at width x height pixels, cropped to a rectangle of the frame (0..1, origin top left)
  capture: null as ((rect: { x: number; y: number; w: number; h: number }, width: number, height: number) => Capture | null) | null,
  level: 0,
  // where the scene itself is drawn (null: straight to the screen), for whoever warms shaders ahead of time
  sceneTarget: null as THREE.WebGLRenderTarget | null,
};

// The camera in the hand: what its rings and dials are set to. The camera's
// controls write here, the scene reads.
export const photoCtl = {
  focal: 28, // mm, as on a 36 x 24 frame
  aperture: 2, // f-number
  focus: 30, // metres
  ev: 0, // stops
  frame: { x: 0, y: 0, w: 1, h: 1 }, // the framed part of the view (0..1, origin top left)
  sensorH: 24, // mm of film behind the frame's height
  onFocus: null as ((x: number, y: number, metres: number) => void) | null, // a point of the view was tapped: where, and how far away it is
  onWheel: null as ((dy: number) => void) | null, // the zoom ring
};

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function pass(frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, number> = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
}

const GLSL_DEPTH = /* glsl */ `
uniform sampler2D tDepth; uniform float uNear; uniform float uFar;
float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
`;

// The circle of confusion of a thin lens focused at uFocus: its radius grows
// with 1 - focus / distance, behind the plane (+) and in front of it (-).
// uCocK is the radius at infinity and uMaxC the largest radius drawn, both as
// a fraction of the frame's height; the result is in units of that largest
// radius. uBand is the slice either side of the plane that stays dead sharp.
const GLSL_COC = /* glsl */ `
uniform float uFocus; uniform float uCocK; uniform float uBand; uniform float uMaxC;
float cocAt(float z){
  float x = 1.0 - uFocus / max(z, 0.01);
  float m = max(abs(x) - uBand, 0.0) / (1.0 - uBand);
  return clamp(sign(x) * m * uCocK / uMaxC, -1.0, 1.0);
}
`;

// The filmic curve and its way back: a display-referred surface (the screen)
// that falls out of focus is walked back to scene light, blurred with
// everything else, and comes forward through the curve again.
const GLSL_TONE = /* glsl */ `
uniform float uExposure;
const mat3 ACES_I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
const mat3 ACES_O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 color){
  color *= uExposure / 0.6;
  color = ACES_I * color; color = RRTAndODTFit(color); color = ACES_O * color;
  return clamp(color, 0.0, 1.0);
}
vec3 untone(vec3 y){
  vec3 v = clamp(inverse(ACES_O) * clamp(y, 0.0, 0.9), 0.0, 0.96);
  vec3 A = 0.983729 * v - 1.0; vec3 B = 0.4329510 * v - 0.0245786; vec3 C = 0.238081 * v + 0.000090537;
  vec3 x = (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  return max(inverse(ACES_I) * x, 0.0) / (uExposure / 0.6);
}
`;

// half resolution colour, with the signed circle of confusion in alpha. Of
// the four pixels under each texel the largest circle wins, and only the
// pixels that share it give their colour: a sharp edge never tints the soft
// field beside it.
const HALF = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel;
${GLSL_DEPTH}
${GLSL_COC}
${GLSL_TONE}
void main(){
  vec2 o = uTexel * 0.5;
  vec2 uv[4];
  uv[0] = vUv + vec2(-o.x, -o.y); uv[1] = vUv + vec2(o.x, -o.y); uv[2] = vUv + vec2(-o.x, o.y); uv[3] = vUv + vec2(o.x, o.y);
  vec4 s[4]; float c[4];
  float lo = 1.0; float hi = -1.0;
  for (int i = 0; i < 4; i++) {
    s[i] = texture2D(tMap, uv[i]);
    c[i] = uCocK > 0.0 ? cocAt(viewZ(uv[i])) : 0.0;
    lo = min(lo, c[i]); hi = max(hi, c[i]);
  }
  float coc = -lo > hi ? lo : hi;
  vec3 acc = vec3(0.0); float w = 0.0;
  for (int i = 0; i < 4; i++) {
    vec3 col = min(s[i].rgb, vec3(48.0));
    // a screen out of focus joins the scene's light
    float away = (1.0 - clamp(s[i].a, 0.0, 1.0)) * smoothstep(0.0, 0.08, abs(c[i]));
    if (away > 0.0) col = mix(col, untone(col), away);
    float k = abs(coc) < 0.001 ? 1.0 : clamp(c[i] / coc, 0.0, 1.0) + 0.001;
    acc += col * k; w += k;
  }
  gl_FragColor = vec4(acc / w, coc);
}`;

// the largest circle in front of (r) and behind (g) the plane inside each tile
const TILE = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel; uniform int uT;
void main(){
  vec2 base = floor(gl_FragCoord.xy) * float(uT);
  float near = 0.0; float far = 0.0;
  for (int y = 0; y < 32; y++) { if (y >= uT) break;
    for (int x = 0; x < 32; x++) { if (x >= uT) break;
      float a = texture2D(tMap, (base + vec2(float(x), float(y)) + 0.5) * uTexel).a;
      near = max(near, -a); far = max(far, a);
    }
  }
  gl_FragColor = vec4(near, far, 0.0, 1.0);
}`;
const TILE2 = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel;
void main(){
  vec2 m = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) m = max(m, texture2D(tMap, vUv + vec2(float(x), float(y)) * uTexel).rg);
  gl_FragColor = vec4(m, 0.0, 1.0);
}`;

// One gather, two layers. Behind the plane: a sample only spills here if its
// own circle reaches this far and it is not more blurred than this pixel
// (under a sharp or near pixel the layer is filled in from the soft field
// around it, so the upsampled blur has no rim of the sharp thing's colour).
// In front of the plane: anything whose circle reaches here lays over the
// picture, with a coverage that fades out past its edge.
const DOF = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform sampler2D tTile; uniform vec2 uTexel; uniform float uMaxR;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  vec4 c = texture2D(tMap, vUv);
  float c0 = c.a;
  vec2 tile = texture2D(tTile, vUv).rg;
  float m = 1.0 / uMaxR; // one pixel, in units of the largest radius
  bool sharp = c0 < 0.6 * m;
  float R = max(tile.r, sharp ? tile.g : c0);
  if (R < 0.6 * m) { gl_FragColor = vec4(c.rgb, 0.0); return; }
  vec4 bg = vec4(c.rgb, 1.0) * (sharp ? 0.002 : 1.0);
  float fw0 = clamp((-c0 + m) / m, 0.0, 1.0) * step(m, -c0);
  vec4 fg = vec4(c.rgb, 1.0) * fw0;
  // a small disc is covered by the taps as they are; only a large one is turned per pixel, trading rings for grain
  float gap = sqrt(3.14159 * R * R * uMaxR * uMaxR / float(TAPS));
  float j = ign(gl_FragCoord.xy) * 6.2831 * clamp((gap - 1.5) / 1.5, 0.0, 1.0);
  for (int i = 0; i < TAPS; i++) {
    float d = sqrt((float(i) + 0.5) / float(TAPS)) * R;
    float a = float(i) * 2.39996 + j;
    vec4 s = texture2D(tMap, vUv + vec2(cos(a), sin(a)) * d * uMaxR * uTexel);
    float bc = max(sharp ? s.a : min(c0, s.a), 0.0);
    float bw = clamp((bc - d + m) / m, 0.0, 1.0);
    float fw = clamp((-s.a - d + m) / m, 0.0, 1.0) * step(m, -s.a);
    bg += vec4(s.rgb, 1.0) * bw;
    fg += vec4(s.rgb, 1.0) * fw;
  }
  float alpha = clamp(fg.a * 2.4 / float(TAPS + 1), 0.0, 1.0);
  vec3 col = mix(bg.rgb / max(bg.a, 1e-5), fg.rgb / max(fg.a, 1e-5), alpha);
  gl_FragColor = vec4(col, alpha);
}`;

// a small tent over the gather: the sampling pattern melts away
const TENT = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel;
void main(){
  vec4 d = uTexel.xyxy * vec4(-1.0, -1.0, 1.0, 1.0);
  vec4 acc = texture2D(tMap, vUv) * 4.0;
  acc += (texture2D(tMap, vUv + vec2(d.x, 0.0)) + texture2D(tMap, vUv + vec2(d.z, 0.0)) + texture2D(tMap, vUv + vec2(0.0, d.y)) + texture2D(tMap, vUv + vec2(0.0, d.w))) * 2.0;
  acc += texture2D(tMap, vUv + d.xy) + texture2D(tMap, vUv + d.zy) + texture2D(tMap, vUv + d.xw) + texture2D(tMap, vUv + d.zw);
  gl_FragColor = acc / 16.0;
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
// paper: long soft fibres and a fine tooth, the same sheet every frame; felt more than seen
vec3 finish(vec3 c, vec2 uv){
  vec2 px = uv * uRes / max(uRes.y / 900.0, 1.0);
  float fibre = vn(px * vec2(0.018, 0.21)) * 0.5 + vn(px * vec2(0.24, 0.022) + 40.0) * 0.5;
  float tooth = vn(px * 0.93) * 0.6 + vn(px * 0.41 + 17.0) * 0.4;
  float paper = (fibre - 0.5) * 0.012 + (tooth - 0.5) * 0.018;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c *= 1.0 + paper * uLook * (0.35 + 0.65 * smoothstep(0.02, 0.5, lum));
  // vignette
  vec2 v = (uv - 0.5) * vec2(1.0, 0.94);
  float vig = smoothstep(0.46, 1.0, length(v) * 1.26);
  c *= 1.0 - vig * 0.24;
  c += (h12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  return c;
}
vec3 encode(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`;

const COMPOSITE = /* glsl */ `
varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tDof; uniform sampler2D tBloom; uniform sampler2D tRays;
uniform float uBloom; uniform float uRays; uniform vec3 uRayCol; uniform float uNight; uniform float uWarm; uniform vec2 uPx;
${GLSL_DEPTH}
${GLSL_COC}
${GLSL_TONE}
${GLSL_FINISH}
// scene light at a pixel (a screen's own colour walked back to it)
vec3 sceneLight(vec2 uv){ vec4 s = texture2D(tScene, uv); return s.a < 0.999 ? mix(untone(s.rgb), s.rgb, clamp(s.a, 0.0, 1.0)) : s.rgb; }
// how much of the pixel at uv is the sharp thing one step o away, rather than the background one step the other way
float rimShare(vec2 uv, vec2 o){
  vec3 b = texture2D(tScene, uv - o).rgb;
  vec3 span = sceneLight(uv + o) - b;
  return clamp(dot(sceneLight(uv) - b, span) / max(dot(span, span), 1e-5), 0.0, 1.0);
}
void main(){
  vec4 sc = texture2D(tScene, vUv);
  float keep = clamp(sc.a, 0.0, 1.0);
  vec3 hdr = sc.rgb;
  float soften = 0.0;
  #ifdef USE_DOF
  if (uCocK > 0.0) {
    // What is in focus keeps its own pixels, at full resolution.
    float c0 = cocAt(viewZ(vUv));
    float lo = abs(c0); vec2 toSharp = vec2(0.0);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      float f = abs(cocAt(viewZ(vUv + vec2(float(x), float(y)) * uPx)));
      if (f < lo) { lo = f; toSharp = vec2(float(x), float(y)); }
    }
    float behind = smoothstep(0.0007, 0.0026, max(c0, 0.0) * uMaxC);
    float front = smoothstep(0.0007, 0.0026, max(-c0, 0.0) * uMaxC);
    vec4 soft = texture2D(tDof, vUv);
    soften = max(behind + soft.a - behind * soft.a, front);
    vec3 base = keep < 0.999 ? mix(untone(hdr), hdr, keep) : hdr;
    if (soften > 0.0) hdr = mix(base, soft.rgb, soften);
    // The rim of a sharp thing against a soft background. A pixel there was
    // antialiased against the sharp background and then filed under one
    // depth; filed as background it would lose the part of it that is the
    // thing, and the edge would come out in steps. How much of the pixel is
    // the thing is read from its colour, between the sharp neighbour and the
    // background beyond (steadied along the edge, since grass is noisy), and
    // that share of the neighbour is drawn sharp over the blur.
    float rim = (behind - smoothstep(0.0007, 0.0026, lo * uMaxC)) * (1.0 - soft.a);
    if (rim > 0.01) {
      vec2 o = toSharp * uPx;
      vec2 t = vec2(-toSharp.y, toSharp.x) * uPx;
      float share = rimShare(vUv, o) * 0.4 + (rimShare(vUv + t, o) + rimShare(vUv - t, o)) * 0.2 + (rimShare(vUv + 2.0 * t, o) + rimShare(vUv - 2.0 * t, o)) * 0.1;
      hdr = mix(hdr, mix(soft.rgb, sceneLight(vUv + o), share), rim);
    }
  }
  #endif
  vec3 raw = encode(sc.rgb);
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  vec3 lit = hdr + bloom * uBloom;
  #ifdef USE_RAYS
    lit += texture2D(tRays, vUv).rgb * uRayCol * uRays;
  #endif
  vec3 c = aces(lit);
  // the grade: shadows lean to a cool violet, lights to warm cream, blacks a touch lifted
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadow = mix(vec3(0.045, 0.04, 0.075), vec3(0.02, 0.03, 0.075), uNight);
  c = c + shadow * (1.0 - smoothstep(0.0, 0.45, l)) * 0.5;
  c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.955), smoothstep(0.35, 0.95, l) * uWarm);
  c = mix(vec3(l), c, 1.05);
  c = encode(c);
  #ifdef FINISH
    c = finish(c, vUv);
  #endif
  float k = max(keep, soften);
  gl_FragColor = vec4(mix(raw, c, k), k);
  // straight to the screen there is no later pass to read that flag, and the canvas must stay opaque over the page behind it
  #ifdef FINISH
    gl_FragColor.a = 1.0;
  #endif
}`;

// The hand. Far away, and only there, a Kuwahara over a 5x5 window (four
// overlapping 3x3 quarters) gathers the tones into flat dabs; the desk and
// whatever is near stay as the lens drew them. A point of light (a star, a
// firefly, a glint) is never painted over. Then the finish.
const PAINT = /* glsl */ `
varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel; uniform float uStep; uniform float uPaint; uniform vec2 uPaintZ;
${GLSL_DEPTH}
${GLSL_FINISH}
void main(){
  vec4 c0 = texture2D(tMap, vUv);
  vec3 c = c0.rgb;
  float amt = uPaint * uLook * c0.a * smoothstep(uPaintZ.x, uPaintZ.y, viewZ(vUv));
  if (amt > 0.004) {
    vec3 m[4]; vec3 s2[4];
    for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s2[k] = vec3(0.0); }
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec3 t = texture2D(tMap, vUv + vec2(float(x), float(y)) * uTexel * uStep).rgb;
      vec3 tt = t * t;
      if (x <= 0 && y <= 0) { m[0] += t; s2[0] += tt; }
      if (x >= 0 && y <= 0) { m[1] += t; s2[1] += tt; }
      if (x <= 0 && y >= 0) { m[2] += t; s2[2] += tt; }
      if (x >= 0 && y >= 0) { m[3] += t; s2[3] += tt; }
    }
    vec3 best = c; float minV = 1e9;
    for (int k = 0; k < 4; k++) {
      vec3 mean = m[k] / 9.0;
      float v = dot(abs(s2[k] / 9.0 - mean * mean), vec3(0.299, 0.587, 0.114));
      if (v < minV) { minV = v; best = mean; }
    }
    float spark = dot(c - best, vec3(0.299, 0.587, 0.114));
    c = mix(c, best, amt * (1.0 - smoothstep(0.03, 0.12, spark)));
  }
  c = finish(c, vUv);
  gl_FragColor = vec4(mix(c0.rgb, c, c0.a), 1.0);
}`;

// distance under one point of the frame, packed into 24 bits
const PICK = /* glsl */ `
varying vec2 vUv; uniform vec2 uPoint;
${GLSL_DEPTH}
void main(){
  float t = clamp(log2(1.0 + viewZ(uPoint)) / 12.0, 0.0, 0.999999);
  vec3 p = fract(t * vec3(1.0, 255.0, 65025.0));
  p -= p.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = vec4(p, 1.0);
}`;

const MAX_C = 0.02; // the largest circle of confusion drawn: its radius as a fraction of the frame's height

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
  const dof2 = new THREE.WebGLRenderTarget(4, 4, hdr);
  const tile = new THREE.WebGLRenderTarget(2, 2, { ...hdr, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const tile2 = new THREE.WebGLRenderTarget(2, 2, hdr);
  const down = [0, 1, 2, 3, 4].map(() => new THREE.WebGLRenderTarget(4, 4, hdr));
  const up = [0, 1, 2, 3].map(() => new THREE.WebGLRenderTarget(4, 4, hdr));
  const mask = new THREE.WebGLRenderTarget(4, 4, hdr);
  const rays = new THREE.WebGLRenderTarget(4, 4, hdr);
  const ldr = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const pick = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const depthU = { tDepth: { value: full.depthTexture }, uNear: { value: 0.01 }, uFar: { value: 3000 } };
  const cocU = { uFocus: { value: 2 }, uCocK: { value: 0 }, uBand: { value: 0.3 }, uMaxC: { value: MAX_C } };
  const toneU = { uExposure: { value: 1 } };
  const finishU = { uTime: SKY_U.uTime, uLook: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } };
  const paint = level >= 2;
  const dofU = () => ({ tMap: { value: half.texture }, tTile: { value: tile2.texture }, uTexel: { value: new THREE.Vector2() }, uMaxR: { value: 5 } });
  const m = {
    half: pass(HALF, { tMap: { value: full.texture }, uTexel: { value: new THREE.Vector2() }, ...depthU, ...cocU, ...toneU }),
    tile: pass(TILE, { tMap: { value: half.texture }, uTexel: { value: new THREE.Vector2() }, uT: { value: 8 } }),
    tile2: pass(TILE2, { tMap: { value: tile.texture }, uTexel: { value: new THREE.Vector2() } }),
    dof: pass(DOF, dofU(), { TAPS: level >= 3 ? 36 : 22 }),
    // the camera in the hand, and the photograph itself: a rounder, quieter blur
    dofHi: pass(DOF, dofU(), { TAPS: level >= 2 ? 64 : 36 }),
    tent: pass(TENT, { tMap: { value: dof.texture }, uTexel: { value: new THREE.Vector2() } }),
    down: pass(DOWN, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0 } }),
    up: pass(UP, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() } }),
    mask: pass(MASK, { tMap: { value: half.texture }, tDepth: { value: full.depthTexture } }),
    rays: pass(RAYS, { tMap: { value: mask.texture }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 } }, { TAPS: level >= 3 ? 44 : 28 }),
    comp: pass(
      COMPOSITE,
      {
        tScene: { value: full.texture },
        tDof: { value: dof2.texture },
        tBloom: { value: up[0].texture },
        tRays: { value: rays.texture },
        uBloom: { value: 0.1 },
        uRays: { value: 0 },
        uRayCol: { value: new THREE.Color(1, 0.8, 0.6) },
        uNight: SKY_U.uNight,
        uWarm: { value: 1 },
        uPx: { value: new THREE.Vector2() },
        ...depthU,
        ...cocU,
        ...toneU,
        ...finishU,
      },
      { USE_DOF: 1, ...(level >= 2 ? { USE_RAYS: 1 } : {}), ...(paint ? {} : { FINISH: 1 }) },
    ),
    paint: pass(PAINT, { tMap: { value: ldr.texture }, uTexel: { value: new THREE.Vector2() }, uStep: { value: 1 }, uPaint: { value: 0.5 }, uPaintZ: { value: new THREE.Vector2(7, 30) }, ...depthU, ...finishU }),
    pick: pass(PICK, { uPoint: { value: new THREE.Vector2(0.5, 0.5) }, ...depthU }),
  };
  const targets = [full, half, dof, dof2, tile, tile2, ...down, ...up, mask, rays, ldr, pick];
  return { quad, cam, full, half, dof, dof2, tile, tile2, down, up, mask, rays, ldr, pick, m, tri, targets, depthU, cocU, toneU, finishU, paint, w: 0, h: 0 };
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

  // `out` set: the finished frame goes into that target at its size (a photograph) instead of to the screen
  const draw = (scene: THREE.Scene, camera: THREE.Camera, out?: THREE.WebGLRenderTarget) => {
    const overlay = () => {
      if (!postCtl.overlay || out) return;
      over.q.material = postCtl.overlay;
      const ac = gl.autoClear;
      gl.autoClear = false;
      gl.setRenderTarget(null);
      gl.render(over.q, over.cam);
      gl.autoClear = ac;
    };
    postCtl.level = lv;
    postCtl.sceneTarget = p?.full ?? null;
    if (!p) {
      POST_U.uLinearOut.value = 0;
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      overlay();
      return;
    }
    const buf = gl.getDrawingBufferSize(new THREE.Vector2());
    const w = out ? out.width : Math.max(8, Math.floor(buf.x));
    const h = out ? out.height : Math.max(8, Math.floor(buf.y));
    const pc = camera as THREE.PerspectiveCamera;
    // the lens: focal length from the field of view, then the thin-lens circle at infinity
    const dofOn = lv >= 2 || postCtl.photo ? postCtl.dof : 0;
    const focal = postCtl.sensor / 2 / Math.tan(THREE.MathUtils.degToRad(pc.fov ?? 40) / 2); // mm
    const focusMm = Math.max(postCtl.focus * 1000, focal * 1.5);
    const cocK = dofOn > 0.01 ? (0.5 * ((focal * focal) / (Math.max(1, postCtl.aperture) * (focusMm - focal))) * dofOn) / postCtl.sensor : 0;
    const maxR = Math.max(2, (MAX_C * h) / 2); // largest radius in half-res pixels
    const T = Math.min(32, Math.max(4, Math.ceil(maxR)));
    if (w !== p.w || h !== p.h) {
      p.w = w;
      p.h = h;
      p.full.setSize(w, h);
      p.ldr.setSize(w, h);
      p.half.setSize(w >> 1, h >> 1);
      p.dof.setSize(w >> 1, h >> 1);
      p.dof2.setSize(w >> 1, h >> 1);
      p.tile.setSize(Math.ceil((w >> 1) / T), Math.ceil((h >> 1) / T));
      p.tile2.setSize(Math.ceil((w >> 1) / T), Math.ceil((h >> 1) / T));
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
    p.depthU.uNear.value = pc.near;
    p.depthU.uFar.value = pc.far;
    p.cocU.uFocus.value = postCtl.focus;
    p.cocU.uCocK.value = cocK;
    p.cocU.uBand.value = postCtl.band;
    p.toneU.uExposure.value = gl.toneMappingExposure * postCtl.exposure;

    // the scene, linear and unclipped
    POST_U.uLinearOut.value = 1;
    gl.setRenderTarget(p.full);
    gl.render(scene, camera);
    POST_U.uLinearOut.value = 0;

    p.m.half.uniforms.uTexel.value.set(1 / w, 1 / h);
    run(p.m.half, p.half);
    if (cocK > 0) {
      const ht = p.m.tile.uniforms;
      ht.uTexel.value.set(1 / p.half.width, 1 / p.half.height);
      ht.uT.value = T;
      run(p.m.tile, p.tile);
      p.m.tile2.uniforms.uTexel.value.set(1 / p.tile.width, 1 / p.tile.height);
      run(p.m.tile2, p.tile2);
      const dm = postCtl.photo || out ? p.m.dofHi : p.m.dof;
      dm.uniforms.uTexel.value.set(1 / p.half.width, 1 / p.half.height);
      dm.uniforms.uMaxR.value = maxR;
      run(dm, p.dof);
      p.m.tent.uniforms.uTexel.value.set(1 / p.half.width, 1 / p.half.height);
      run(p.m.tent, p.dof2);
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
    c.uBloom.value = 0.085 * (1 + SKY_U.uPulse.value * 0.35);
    c.uRays.value = rayK * 0.55;
    (c.uRayCol.value as THREE.Color).copy(SKY_U.uGlow.value).lerp(new THREE.Color(1, 1, 1), 0.35);
    if (SKY_U.uSunDir.value.y <= -0.06) (c.uRayCol.value as THREE.Color).set(0.6, 0.7, 1.0);
    c.uPx.value.set(1 / w, 1 / h);
    p.finishU.uLook.value = postCtl.look;
    p.finishU.uRes.value.set(w, h);
    if (p.paint) {
      run(p.m.comp, p.ldr);
      p.m.paint.uniforms.uTexel.value.set(1 / w, 1 / h);
      p.m.paint.uniforms.uStep.value = Math.max(1, h / 1100);
      run(p.m.paint, out ?? null);
    } else run(p.m.comp, out ?? null);
    overlay();
  };

  const state = useThree();
  useEffect(() => {
    postCtl.render = () => draw(state.scene, state.camera);
    postCtl.depthAt = (u, v) => {
      if (!p || !p.w) return null;
      p.m.pick.uniforms.uPoint.value.set(u, v);
      p.quad.material = p.m.pick;
      gl.setRenderTarget(p.pick);
      gl.render(p.quad, p.cam);
      const px = new Uint8Array(4);
      gl.readRenderTargetPixels(p.pick, 0, 0, 1, 1, px);
      gl.setRenderTarget(null);
      const t = px[0] / 255 + px[1] / 255 / 255 + px[2] / 255 / 65025;
      return Math.pow(2, t * 12) - 1;
    };
    postCtl.capture = (rect, width, height) => {
      const cv = gl.domElement;
      const flip = (data: Uint8Array | Uint8ClampedArray, w: number, h: number) => {
        // GL rows run bottom to top
        const o = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) o.set(data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        for (let i = 3; i < o.length; i += 4) o[i] = 255;
        return o;
      };
      const crop = (W: number, H: number) => {
        const x = Math.max(0, Math.min(W - 1, Math.round(rect.x * W)));
        const y = Math.max(0, Math.min(H - 1, Math.round(rect.y * H)));
        return { x, y, w: Math.max(1, Math.min(W - x, Math.round(rect.w * W))), h: Math.max(1, Math.min(H - y, Math.round(rect.h * H))) };
      };
      try {
        if (!p) {
          // no lens: the canvas itself, as it is on screen
          draw(state.scene, state.camera);
          const g2 = gl.getContext();
          const r = crop(cv.width, cv.height);
          const px = new Uint8Array(r.w * r.h * 4);
          g2.readPixels(r.x, cv.height - r.y - r.h, r.w, r.h, g2.RGBA, g2.UNSIGNED_BYTE, px);
          return { data: flip(px, r.w, r.h), w: r.w, h: r.h };
        }
        const max = Math.min(gl.capabilities.maxTextureSize, 8192);
        const fit = Math.min(1, max / width, max / height);
        const W = Math.max(8, Math.round(width * fit));
        const H = Math.max(8, Math.round(height * fit));
        const k = H / cv.height;
        const out = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false });
        // points are sized in device pixels: keep them the size they are on screen
        const pts: { u: THREE.IUniform; v: number }[] = [];
        state.scene.traverse((o) => {
          const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms?.pixelRatio;
          if (u && typeof u.value === "number") pts.push({ u, v: u.value });
        });
        pts.forEach((x) => (x.u.value = x.v * k));
        draw(state.scene, state.camera, out);
        pts.forEach((x) => (x.u.value = x.v));
        const r = crop(W, H);
        const px = new Uint8Array(r.w * r.h * 4);
        gl.readRenderTargetPixels(out, r.x, H - r.y - r.h, r.w, r.h, px);
        gl.setRenderTarget(null);
        out.dispose();
        // the working targets go back to the canvas size before the next frame is shown
        draw(state.scene, state.camera);
        return { data: flip(px, r.w, r.h), w: r.w, h: r.h };
      } catch {
        return null;
      }
    };
    return () => {
      postCtl.render = null;
      postCtl.depthAt = null;
      postCtl.capture = null;
    };
  });
  useFrame((s) => draw(s.scene, s.camera), 1);
  return null;
}
