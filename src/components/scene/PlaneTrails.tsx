"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "./shared";
import { SKY_U } from "./sky";

// The mist the paper plane draws off its wing tips, as a gliding child's cape does in Sky and a wing does in damp
// air: two soft ribbons that begin as a thread at each tip, widen and thin away over a couple of seconds, stronger
// the faster it goes and in a turn or a dive, the colour of the world's own light.
//
// One mesh, one draw. Each ribbon is a strip of N points. The first is the tip as it is this frame and the second
// the tip as it was the frame before; after them come points laid down every seventy centimetres of the way the
// tip has really gone, placed on a Catmull-Rom curve through the tip's last four places (so a long frame at
// speed leaves a curve, not a chord, and a point never moves once it is laid: nothing flickers as the oldest
// falls off). They live in typed arrays that are shifted along; nothing is made per frame. The strip is turned to
// face the eye on the CPU (two vertices a point). Along it the shader knows how far each point is from the tip
// and how old it is; it is a thread at the tip, widens steadily, and its light goes over more than four seconds
// (and over the last fifth of the strip, whichever comes first), so it has no end to see: it thins into the air.
// Across it the edges are soft; a slow, long noise drifts through it. It is laid over the picture with ordinary
// blending at well under the brightness the lens blooms at, tested against depth, never written to it.
//
//   trails.update(dt, group, k, cam)   once a frame after the plane has moved: k 0..1.4 is how strong (0 = none)
//   trails.reset()                     the plane was put somewhere else (a gate, a jump, a landing): nothing is
//                                      left streaking across the map. (A leap of more than 25 m resets by itself.)

const N = 440; // points a ribbon
const SP = 0.7; // metres between points laid down
const LIFE = 4.4; // seconds a point's light lasts
const TIPS: [number, number, number][] = [
  [-0.071, 0.031, 0.088],
  [0.071, 0.031, 0.088],
];

export type Trails = { mesh: THREE.Mesh; update: (dt: number, plane: THREE.Object3D, k: number, cam: THREE.Camera) => void; reset: () => void; dispose: () => void };

export function makeTrails(): Trails {
  const R = TIPS.length;
  const pts = new Float32Array(R * N * 3); // where each point is
  const born = new Float32Array(R * N); // when it was laid down (the trail's own clock)
  const str = new Float32Array(R * N); // how strong it was laid
  const pos = new Float32Array(R * N * 2 * 3);
  const info = new Float32Array(R * N * 2 * 4); // across (-1 / 1), metres from the tip, age 0..1, strength
  const idx: number[] = [];
  for (let r = 0; r < R; r++)
    for (let i = 0; i < N - 1; i++) {
      const a = (r * N + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aInfo = new THREE.BufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", aPos);
  geo.setAttribute("aInfo", aInfo);
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: SKY_U.uTime, uKeyCol: SKY_U.uKeyCol, uSkyCol: SKY_U.uSkyCol, uNight: SKY_U.uNight, uNear: { value: 0.4 } },
    vertexShader: /* glsl */ `
      attribute vec4 aInfo; varying vec4 vInfo; varying float vZ;
      void main(){ vInfo = aInfo; vec4 mv = viewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uKeyCol; uniform vec3 uSkyCol; uniform float uNight; uniform float uNear; varying vec4 vInfo; varying float vZ;
      ${GLSL_NOISE}
      void main(){
        float across = 1.0 - abs(vInfo.x);
        across = across * across * (3.0 - 2.0 * across);
        // (softer across the older it is: the edge dissolves before the middle does)
        across = pow(across, 1.0 + 1.5 * vInfo.z);
        float life = 1.0 - clamp(vInfo.z, 0.0, 1.0);
        // a thread at the tip, full an arm's length behind it, then a long even going (no step anywhere in it)
        float a = across * smoothstep(0.0, 0.5, vInfo.y) * life * life * (3.0 - 2.0 * life) * vInfo.w;
        // (it dissolves over the last metre and more before the lens's own near plane, which would otherwise cut it off square)
        a *= smoothstep(uNear * 1.15, uNear * 2.4 + 0.7, vZ);
        // mist, not a line and not beads: a long slow unevenness drifting back along it
        float n = vnoise(vec2(vInfo.y * 0.13 - uTime * 0.3, vInfo.x * 0.7 + vInfo.z * 2.0));
        a *= 0.78 + 0.4 * n;
        // the world's own light on water in the air: mostly its sky, warmed by its sun; never bright enough to bloom
        vec3 col = min(mix(uSkyCol * 1.5 + uKeyCol * 0.5, vec3(0.9), 0.35 - 0.2 * uNight), vec3(0.92));
        gl_FragColor = vec4(col, clamp(a * 0.25, 0.0, 0.36));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.visible = false;
  const tip = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const eye = new THREE.Vector3();
  // the tip's last four places a ribbon (this frame's first), how many points each has laid, how far it has gone since the last one
  const T = new Float32Array(R * 12);
  const cnt = new Int32Array(R);
  const carried = new Float32Array(R);
  let clock = 0;
  let dtPrev = 1 / 60;
  let kPrev = 0;
  let kPrev2 = 0;
  let live = false; // there is something of it to draw
  const reset = () => {
    live = false;
    mesh.visible = false;
  };
  const update: Trails["update"] = (dt, plane, k, cam) => {
    clock += dt;
    mat.uniforms.uNear.value = (cam as THREE.PerspectiveCamera).near ?? 0.4;
    plane.updateWorldMatrix(true, false);
    // a leap (a gate, a jump): begin again
    tip.set(...TIPS[0]).applyMatrix4(plane.matrixWorld);
    if (live && (tip.x - T[0]) ** 2 + (tip.y - T[1]) ** 2 + (tip.z - T[2]) ** 2 > 625) reset();
    if (!live) {
      if (k <= 0.01) return;
      for (let r = 0; r < R; r++) {
        tip.set(...TIPS[r]).applyMatrix4(plane.matrixWorld);
        for (let j = 0; j < 4; j++) T.set([tip.x, tip.y, tip.z], r * 12 + j * 3);
        cnt[r] = 0;
        carried[r] = 0;
      }
      kPrev = kPrev2 = 0;
      live = true;
    }
    let any = 0;
    for (let r = 0; r < R; r++) {
      const b = r * N;
      const t0 = r * 12;
      // the tip's places move along by one, and this frame's is put first
      T.copyWithin(t0 + 3, t0, t0 + 9);
      tip.set(...TIPS[r]).applyMatrix4(plane.matrixWorld);
      T[t0] = tip.x;
      T[t0 + 1] = tip.y;
      T[t0 + 2] = tip.z;
      // points are laid along the stretch the tip covered in the frame BEFORE (its curve is known now that the
      // place after it is): every SP metres of it, on the curve through the four places
      const L = Math.hypot(T[t0 + 3] - T[t0 + 6], T[t0 + 4] - T[t0 + 7], T[t0 + 5] - T[t0 + 8]);
      const s0 = SP - carried[r];
      if (L > 1e-5 && s0 <= L) {
        const m = Math.min(N - 2, Math.floor((L - s0) / SP) + 1);
        const keep = Math.min(cnt[r], N - 2 - m);
        pts.copyWithin((b + 2 + m) * 3, (b + 2) * 3, (b + 2 + keep) * 3);
        born.copyWithin(b + 2 + m, b + 2, b + 2 + keep);
        str.copyWithin(b + 2 + m, b + 2, b + 2 + keep);
        cnt[r] = keep + m;
        for (let j = 0; j < m; j++) {
          const u = (s0 + j * SP) / L;
          const u2 = u * u;
          const u3 = u2 * u;
          const o = b + 2 + (m - 1 - j);
          for (let c = 0; c < 3; c++) {
            // (P0 the place before the stretch, P1 and P2 its ends, P3 the place after: this frame's)
            const P0 = T[t0 + 9 + c];
            const P1 = T[t0 + 6 + c];
            const P2 = T[t0 + 3 + c];
            const P3 = T[t0 + c];
            pts[o * 3 + c] = 0.5 * (2 * P1 + (P2 - P0) * u + (2 * P0 - 5 * P1 + 4 * P2 - P3) * u2 + (3 * P1 - P0 - 3 * P2 + P3) * u3);
          }
          born[o] = clock - dt - dtPrev * (1 - u);
          str[o] = kPrev2 + (kPrev - kPrev2) * u;
        }
        carried[r] = L - (s0 + (m - 1) * SP);
      } else carried[r] += L;
      // the two living points at the head: the tip now, and where it was a frame ago
      pts[b * 3] = T[t0];
      pts[b * 3 + 1] = T[t0 + 1];
      pts[b * 3 + 2] = T[t0 + 2];
      born[b] = clock;
      str[b] = k;
      pts[b * 3 + 3] = T[t0 + 3];
      pts[b * 3 + 4] = T[t0 + 4];
      pts[b * 3 + 5] = T[t0 + 5];
      born[b + 1] = clock - dt;
      str[b + 1] = kPrev;
      const total = 2 + cnt[r];
      let d = 0;
      for (let i = 0; i < N; i++) {
        // (what has not been laid yet lies folded on the last point, unseen)
        const o = b + Math.min(i, total - 1);
        const x = pts[o * 3];
        const y = pts[o * 3 + 1];
        const z = pts[o * 3 + 2];
        const h = b + Math.max(0, Math.min(i, total - 1) - 1);
        const j = b + Math.min(total - 1, i + 1);
        tan.set(pts[h * 3] - pts[j * 3], pts[h * 3 + 1] - pts[j * 3 + 1], pts[h * 3 + 2] - pts[j * 3 + 2]);
        if (i > 0 && i < total) d += Math.hypot(x - pts[(o - 1) * 3], y - pts[(o - 1) * 3 + 1], z - pts[(o - 1) * 3 + 2]);
        // its light goes with time, and over the last fifth of the strip: there is never an end to see
        const age = i >= total ? 1 : Math.min(1, Math.max((clock - born[o]) / LIFE, (i / (N - 1) - 0.8) / 0.2));
        // a thread at the tip, a wisp narrower than the wing a little way back, then steadily wider and softer
        const w = 0.004 + 0.02 * (1 - Math.exp(-d / 1.2)) + 0.0032 * d;
        eye.copy(cam.position).sub(tip.set(x, y, z));
        side.crossVectors(tan, eye);
        const l = side.length();
        if (l > 1e-6) side.multiplyScalar(w / l);
        else side.set(0, w, 0);
        const v = (b + i) * 6;
        pos[v] = x - side.x;
        pos[v + 1] = y - side.y;
        pos[v + 2] = z - side.z;
        pos[v + 3] = x + side.x;
        pos[v + 4] = y + side.y;
        pos[v + 5] = z + side.z;
        const q = (b + i) * 8;
        info[q] = -1;
        info[q + 4] = 1;
        info[q + 1] = info[q + 5] = d;
        info[q + 2] = info[q + 6] = age;
        info[q + 3] = info[q + 7] = i >= total ? 0 : str[o];
        if (age < 1 && str[o] > 0.01 && i < total) any++;
      }
    }
    kPrev2 = kPrev;
    kPrev = k;
    dtPrev = Math.max(dt, 1e-4);
    aPos.needsUpdate = true;
    aInfo.needsUpdate = true;
    mesh.visible = any > 0;
    // (all of it has gone: let it rest until the plane makes more)
    if (!any && k <= 0.01) live = false;
  };
  return {
    mesh,
    update,
    reset,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

export function useTrails() {
  const t = useMemo(makeTrails, []);
  useEffect(() => () => t.dispose(), [t]);
  return t;
}
