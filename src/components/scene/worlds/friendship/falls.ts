import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";
import { FRIEND_U, GLSL_ORB } from "./cave";
import type { Fall } from "./forest";

// Water falling in the cavern: long white threads of it down the sides of the pillars, from high in the haze where
// their heads are lost to the mist on the floor. Each is one tall card turned about the upright to face the eye,
// drawn as falling water is drawn in pastel: streaks that run down, break, and widen into spray toward the foot.
// Soft at both edges and at both ends: it comes out of the haze and goes into the mist.

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export function fallsGeometry(list: Fall[]) {
  const base = new THREE.PlaneGeometry(2, 1, 1, 12);
  base.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute("position", base.attributes.position);
  const a = new Float32Array(list.length * 4);
  const b = new Float32Array(list.length * 2);
  list.forEach((f, i) => {
    a.set([f.x, f.foot, f.z, f.top - f.foot], i * 4);
    b.set([f.w, (i * 0.37) % 1], i * 2);
  });
  g.setAttribute("aA", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aB", new THREE.InstancedBufferAttribute(b, 2));
  g.instanceCount = list.length;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 500, -900), 2600);
  return g;
}

export function makeFallsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U },
    vertexShader: /* glsl */ `
      attribute vec4 aA; attribute vec2 aB;
      varying vec2 vUv; varying vec3 vWorld; varying float vH; varying float vSeed;
      void main(){
        vec3 c = (modelMatrix * vec4(aA.xyz, 1.0)).xyz;
        vec3 toEye = cameraPosition - c;
        vec3 side = normalize(vec3(toEye.z, 0.0, -toEye.x) + vec3(1e-4, 0.0, 0.0));
        // (wider toward the foot, where it breaks into spray)
        float spread = 1.0 + 1.6 * pow(1.0 - position.y, 2.5);
        vec3 wp = c + side * position.x * aB.x * spread + vec3(0.0, position.y * aA.w, 0.0);
        vUv = position.xy; vWorld = wp; vH = aA.w; vSeed = aB.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld; varying float vH; varying float vSeed;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_ORB}
      void main(){
        float y = vUv.y * vH;
        float u = vUv.x;
        // threads of water running down, each at its own speed; the fastest in the middle
        float fall = uTime * 46.0;
        float s1 = vnoise(vec2(u * 7.0 + vSeed * 30.0, (y + fall) * 0.012));
        float s2 = vnoise(vec2(u * 19.0 + 4.0 + vSeed * 9.0, (y + fall * 1.5) * 0.03));
        float s3 = vnoise(vec2(u * 3.0 + 9.0, (y + fall * 0.7) * 0.005));
        float thread = smoothstep(0.38, 0.8, s1 * 0.5 + s2 * 0.3 + s3 * 0.2);
        float body = exp(-u * u * 3.2);
        // out of the haze above, into the mist below
        float ends = smoothstep(1.0, 0.72, vUv.y) * smoothstep(0.0, 0.1, vUv.y);
        float spray = (1.0 - smoothstep(0.0, 0.2, vUv.y)) * exp(-u * u * 1.3) * (0.5 + 0.5 * s3);
        float a = (thread * body * 0.75 + body * 0.14 + spray * 0.4) * ends;
        // pale teal in the cave's own air; where the orb's light reaches it, gold
        vec4 o = orbLight(vWorld, normalize(uOrb - vWorld), 1.0, 1300.0);
        vec3 col = vec3(0.16, 0.26, 0.24) * (0.7 + 0.6 * uCracks) + o.rgb * vec3(1.0, 0.9, 0.75) * 0.7;
        col *= 0.7 + 0.5 * thread;
        a *= 1.0 - 0.6 * airAmt(vWorld);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        ${END}
      }`,
  });
}
