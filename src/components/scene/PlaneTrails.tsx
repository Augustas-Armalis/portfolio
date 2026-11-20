"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "./shared";
import { SKY_U } from "./sky";

// The mist the paper plane draws off its wing tips, as a gliding child's cape does in Sky and a wing does in damp
// air: two soft ribbons that begin as a thread at each tip, widen and thin away over a couple of seconds, stronger
// the faster it goes and in a turn or a dive, the colour of the world's own light.
//
// One mesh, one draw. Each ribbon is a strip of N points: the first is the tip as it is this frame, the rest are
// where the tip was, laid down every few hundredths of a second (kept in typed arrays that are shifted along, so
// nothing is made per frame). The strip is turned to face the eye on the CPU (two vertices a point). Along it the
// shader knows how far each point is from the tip and how old it is; across it the edges are soft; a slow noise
// drifts through it so it reads as mist and not as a line. It is laid over the picture with ordinary blending at
// well under the brightness the lens blooms at, tested against depth, never written to it.
//
//   trails.update(dt, group, k, cam)   once a frame after the plane has moved: k 0..1.4 is how strong (0 = none)
//   trails.reset()                     the plane was put somewhere else (a gate, a jump, a landing): nothing is
//                                      left streaking across the map. (A leap of more than 25 m resets by itself.)

const N = 54; // points a ribbon
const GAP = 0.045; // seconds between points laid down
const LIFE = N * GAP; // how long a point lasts
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
    uniforms: { uTime: SKY_U.uTime, uKeyCol: SKY_U.uKeyCol, uSkyCol: SKY_U.uSkyCol, uNight: SKY_U.uNight },
    vertexShader: /* glsl */ `
      attribute vec4 aInfo; varying vec4 vInfo; varying float vZ;
      void main(){ vInfo = aInfo; vec4 mv = viewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uKeyCol; uniform vec3 uSkyCol; uniform float uNight; varying vec4 vInfo; varying float vZ;
      ${GLSL_NOISE}
      void main(){
        float across = 1.0 - abs(vInfo.x);
        across = across * across * (3.0 - 2.0 * across);
        float life = 1.0 - clamp(vInfo.z, 0.0, 1.0);
        // a thread at the tip, full a hand's breadth behind it, then a long slow going
        float a = across * smoothstep(0.0, 0.22, vInfo.y) * life * sqrt(life) * vInfo.w;
        // (it thins away as it comes up to the eye, which flies close behind: never a beam across the lens)
        a *= smoothstep(0.7, 2.6, vZ);
        // mist, not a line: slow noise drifting back along it
        float n = vnoise(vec2(vInfo.y * 1.6 - uTime * 0.5, vInfo.x * 1.3 + vInfo.z * 3.0)) * 0.6 + vnoise(vec2(vInfo.y * 5.0 + uTime * 0.3, vInfo.x * 2.0)) * 0.4;
        a *= 0.5 + 0.85 * n;
        // the world's own light on water in the air: mostly its sky, warmed by its sun; never bright enough to bloom
        vec3 col = min(mix(uSkyCol * 1.5 + uKeyCol * 0.5, vec3(0.9), 0.35 - 0.2 * uNight), vec3(0.92));
        gl_FragColor = vec4(col, clamp(a * 0.36, 0.0, 0.5));
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
  let clock = 0;
  let since = 0;
  let live = false; // there is something of it to draw
  const reset = () => {
    live = false;
    mesh.visible = false;
    since = 0;
  };
  const update: Trails["update"] = (dt, plane, k, cam) => {
    clock += dt;
    since += dt;
    plane.updateWorldMatrix(true, false);
    // a leap (a gate, a jump): begin again
    tip.set(...TIPS[0]).applyMatrix4(plane.matrixWorld);
    if (live && (tip.x - pts[0]) ** 2 + (tip.y - pts[1]) ** 2 + (tip.z - pts[2]) ** 2 > 625) reset();
    if (!live) {
      if (k <= 0.01) return;
      // every point begins at the tip, already spent
      for (let r = 0; r < R; r++) {
        tip.set(...TIPS[r]).applyMatrix4(plane.matrixWorld);
        for (let i = 0; i < N; i++) {
          const o = r * N + i;
          pts[o * 3] = tip.x;
          pts[o * 3 + 1] = tip.y;
          pts[o * 3 + 2] = tip.z;
          born[o] = clock - LIFE;
          str[o] = 0;
        }
      }
      live = true;
      since = GAP;
    }
    const lay = since >= GAP;
    if (lay) since = Math.min(since - GAP, GAP);
    let any = 0;
    for (let r = 0; r < R; r++) {
      const b = r * N;
      if (lay) {
        // the oldest falls off the end, the tip's last place becomes a point of its own
        pts.copyWithin((b + 1) * 3, b * 3, (b + N - 1) * 3);
        born.copyWithin(b + 1, b, b + N - 1);
        str.copyWithin(b + 1, b, b + N - 1);
      }
      tip.set(...TIPS[r]).applyMatrix4(plane.matrixWorld);
      pts[b * 3] = tip.x;
      pts[b * 3 + 1] = tip.y;
      pts[b * 3 + 2] = tip.z;
      born[b] = clock;
      str[b] = k;
      let d = 0;
      for (let i = 0; i < N; i++) {
        const o = b + i;
        const x = pts[o * 3];
        const y = pts[o * 3 + 1];
        const z = pts[o * 3 + 2];
        const j = i < N - 1 ? o + 1 : o;
        const h = i < N - 1 ? o : o - 1;
        tan.set(pts[h * 3] - pts[j * 3], pts[h * 3 + 1] - pts[j * 3 + 1], pts[h * 3 + 2] - pts[j * 3 + 2]);
        if (i > 0) d += Math.hypot(x - pts[(o - 1) * 3], y - pts[(o - 1) * 3 + 1], z - pts[(o - 1) * 3 + 2]);
        const age = Math.min(1, (clock - born[o]) / LIFE);
        // it opens out behind the tip: a thread, a wisp a little narrower than the wing, then slowly wider
        const w = 0.004 + 0.022 * (1 - Math.exp(-d / 0.9)) + 0.0016 * d * (0.6 + 0.4 * str[o]);
        eye.copy(cam.position).sub(tip.set(x, y, z));
        side.crossVectors(tan, eye);
        const l = side.length();
        if (l > 1e-6) side.multiplyScalar(w / l);
        else side.set(0, w, 0);
        const v = o * 6;
        pos[v] = x - side.x;
        pos[v + 1] = y - side.y;
        pos[v + 2] = z - side.z;
        pos[v + 3] = x + side.x;
        pos[v + 4] = y + side.y;
        pos[v + 5] = z + side.z;
        const q = o * 8;
        info[q] = -1;
        info[q + 4] = 1;
        info[q + 1] = info[q + 5] = d;
        info[q + 2] = info[q + 6] = age;
        info[q + 3] = info[q + 7] = str[o];
        if (age < 1 && str[o] > 0.01) any++;
      }
    }
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
