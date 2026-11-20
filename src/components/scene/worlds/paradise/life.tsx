"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { useDisposable } from "../common";
import { GLSL_AIR, Kit, WORLD_U, makeTempera, type V3 } from "../kit";

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// ---------- wings that breathe ----------
// (geometry from paradise/isle.ts Wings: each vertex knows the spine it turns about)
export function makeWingMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      attribute vec4 aCol; attribute vec4 aPiv;
      uniform float uTime;
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec3 vLocal;
      void main(){
        // a slow opening and closing about the spine, each angel in its own time
        float a = aPiv.z * (0.1 * sin(uTime * 0.55 + aPiv.w) + 0.035 * sin(uTime * 1.7 + aPiv.w * 2.3));
        float c = cos(a); float s = sin(a);
        vec3 p = position;
        vec2 d = p.xz - aPiv.xy;
        p.xz = aPiv.xy + vec2(d.x * c - d.y * s, d.x * s + d.y * c);
        vec3 n = normal;
        n.xz = vec2(n.x * c - n.z * s, n.x * s + n.z * c);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz; vLocal = position; vN = normalize(mat3(modelMatrix) * n); vCol = aCol;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec4 vCol; varying vec3 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        // feathers: long soft strokes down the blade
        float f = vnoise(vec2(vLocal.x * 3.0 + vLocal.z * 3.0, vLocal.y * 0.35)) * 0.6 + vnoise(vec2((vLocal.x - vLocal.z) * 9.0, vLocal.y * 0.9)) * 0.4;
        vec3 alb = vCol.rgb * (0.86 + 0.3 * f);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float lit = clamp(dot(n, uKeyDir) * 0.55 + 0.45, 0.0, 1.0) * sunUp;
        vec3 col = alb * (uSkyCol * 0.85 + uKeyCol * lit * 0.4);
        // a wing is thin: the light comes through it
        col += alb * uKeyCol * pow(max(dot(-V, uKeyDir), 0.0), 2.0) * 0.4 * sunUp;
        col += vec3(1.0, 0.95, 0.8) * pow(clamp(1.0 - abs(dot(n, V)), 0.0, 1.0), 3.0) * 0.12;
        col = applyAir(col, vWorld);
        col += vCol.rgb * vCol.a * glowK();
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}

// ---------- flowers ----------
// The big flowers of his foreground: daisies, poppies, cornflowers, dandelion clocks. Each is a small card
// lying in the grass and tipped toward the eye, its petals drawn on it.
export type Bloom = { p: V3; size: number; seed: number };
export function Blooms({ list }: { list: Bloom[] }) {
  const b = useDisposable(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const at = new Float32Array(list.length * 4);
    const sd = new Float32Array(list.length);
    const box = new THREE.Box3();
    list.forEach((f, i) => {
      at.set([...f.p, f.size], i * 4);
      sd[i] = f.seed;
      box.expandByPoint(new THREE.Vector3(...f.p));
    });
    g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(sd, 1));
    g.instanceCount = list.length;
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...WORLD_U },
      vertexShader: /* glsl */ `
        attribute vec4 aAt; attribute float aSeed;
        uniform float uTime;
        varying vec2 vUv; varying float vSeed; varying vec3 vWorld;
        void main(){
          vSeed = aSeed;
          vec3 c = (modelMatrix * vec4(aAt.xyz, 1.0)).xyz;
          // it nods a little on its stem
          c.xz += vec2(sin(uTime * 0.9 + aSeed * 40.0), cos(uTime * 0.7 + aSeed * 23.0)) * 0.05 * aAt.w;
          vec3 toEye = cameraPosition - c;
          vec3 nrm = normalize(vec3(0.0, 1.0, 0.0) + normalize(vec3(toEye.x, 0.0, toEye.z) + 1e-4) * 0.75);
          vec3 ax = normalize(cross(vec3(0.0, 1.0, 0.0), nrm) + vec3(1e-4, 0.0, 0.0));
          vec3 ay = cross(nrm, ax);
          float ro = aSeed * 6.2832;
          vec2 pr = vec2(position.x * cos(ro) - position.y * sin(ro), position.x * sin(ro) + position.y * cos(ro));
          vec3 p = c + (ax * pr.x + ay * pr.y) * aAt.w;
          vUv = position.xy; vWorld = p;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vSeed; varying vec3 vWorld;
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          float r = length(vUv);
          float th = atan(vUv.y, vUv.x);
          float kind = fract(vSeed * 13.7);
          vec3 petal; vec3 heart = vec3(1.0, 0.78, 0.16); float shape; float core = 0.24;
          if (kind < 0.42) {
            // a daisy: many narrow white petals round a yellow heart
            float pt = abs(cos(th * 7.0));
            shape = 0.42 + 0.58 * pow(max(pt, 1e-4), 0.35);
            petal = mix(vec3(1.0, 0.99, 0.94), vec3(0.9, 0.86, 0.8), smoothstep(0.3, 0.0, pt));
          } else if (kind < 0.6) {
            // a poppy: four broad red petals, a dark heart
            shape = 0.72 + 0.28 * abs(cos(th * 2.0));
            petal = mix(vec3(0.95, 0.2, 0.1), vec3(0.75, 0.1, 0.08), smoothstep(0.4, 1.0, r));
            heart = vec3(0.12, 0.08, 0.1); core = 0.2;
          } else if (kind < 0.76) {
            // a cornflower: a ragged blue star
            shape = 0.5 + 0.5 * pow(max(abs(cos(th * 4.5)), 1e-4), 0.6);
            petal = mix(vec3(0.3, 0.42, 1.0), vec3(0.5, 0.6, 1.0), r);
            heart = vec3(0.24, 0.2, 0.6); core = 0.18;
          } else if (kind < 0.9) {
            // a buttercup: five round gold petals
            shape = 0.7 + 0.3 * abs(cos(th * 2.5));
            petal = vec3(1.0, 0.84, 0.14);
            heart = vec3(0.9, 0.6, 0.1); core = 0.2;
          } else {
            // a dandelion clock: a pale globe of down
            shape = 0.92;
            petal = vec3(0.96, 0.95, 0.88) * (0.75 + 0.25 * step(0.5, fract(th * 5.0 + r * 9.0)));
            heart = vec3(0.8, 0.78, 0.66); core = 0.3;
          }
          if (r > shape) discard;
          vec3 alb = r < core ? heart : petal * (0.82 + 0.18 * smoothstep(core, shape, r));
          vec3 col = alb * (uSkyCol * 0.95 + uKeyCol * 0.34);
          gl_FragColor = vec4(applyAir(col, vWorld), 1.0);
          ${END}
        }`,
    });
    return { g, mat };
  }, [list]);
  return <mesh geometry={b.g} material={b.mat} />;
}

// ---------- butterflies ----------
// Never still: each wanders about its own place, its two wings beating; some sit on the sand and only open
// and close them slowly, as in the picture.
export type Flutter = { p: V3; roam: number; size: number; seed: number };
export function Butterflies({ list }: { list: Flutter[] }) {
  const b = useDisposable(() => {
    const g = new THREE.InstancedBufferGeometry();
    // two wings, each a quad hinged on the body's line (x: out along the wing, z: along the body)
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.5, 1, 0, -0.6, 1, 0, 0.6, 0, 0, 0.5, 0, 0, -0.5, -1, 0, -0.6, -1, 0, 0.6, 0, 0, 0.5], 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    const at = new Float32Array(list.length * 4);
    const ph = new Float32Array(list.length * 2);
    const box = new THREE.Box3();
    list.forEach((f, i) => {
      at.set([...f.p, f.size], i * 4);
      ph.set([f.seed, f.roam], i * 2);
      box.expandByPoint(new THREE.Vector3(...f.p));
    });
    g.setAttribute("aAt", new THREE.InstancedBufferAttribute(at, 4));
    g.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 2));
    g.instanceCount = list.length;
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    g.boundingSphere.radius += 30;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...WORLD_U },
      vertexShader: /* glsl */ `
        attribute vec4 aAt; attribute vec2 aPh;
        uniform float uTime;
        varying vec2 vUv; varying float vSeed; varying vec3 vWorld;
        void main(){
          vSeed = aPh.x;
          float ph = aPh.x * 50.0;
          float roam = aPh.y;
          float t = uTime;
          vec3 c = aAt.xyz + vec3(sin(t * 0.31 + ph) + 0.5 * sin(t * 0.83 + ph * 1.7), 0.35 * sin(t * 1.1 + ph * 2.1) + 0.2 * sin(t * 2.7 + ph), cos(t * 0.27 + ph * 1.3) + 0.5 * cos(t * 0.71 + ph * 0.6)) * roam;
          // heading: the way it is drifting
          vec2 vel = vec2(0.31 * cos(t * 0.31 + ph) + 0.415 * cos(t * 0.83 + ph * 1.7), -0.27 * sin(t * 0.27 + ph * 1.3) - 0.355 * sin(t * 0.71 + ph * 0.6));
          vec2 fw = roam > 0.01 ? normalize(vel + vec2(1e-4)) : vec2(cos(ph), sin(ph));
          // the beat: quick in the air, slow and wide at rest
          float beat = roam > 0.01 ? 0.25 + 0.95 * abs(sin(t * (9.0 + 4.0 * aPh.x) + ph)) : 0.5 + 0.7 * (0.5 + 0.5 * sin(t * 0.8 + ph));
          float sx = position.x;
          vec3 p = vec3(sx * cos(beat), abs(sx) * sin(beat), position.z);
          vec3 right = vec3(fw.y, 0.0, -fw.x);
          vec3 w = c + (right * p.x + vec3(0.0, p.y, 0.0) + vec3(fw.x, 0.0, fw.y) * p.z) * aAt.w;
          vec4 wp = modelMatrix * vec4(w, 1.0);
          vUv = vec2(abs(position.x), position.z); vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vSeed; varying vec3 vWorld;
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          // a wing: rounded, notched where the fore wing meets the hind
          float edge = 1.0 - smoothstep(0.82, 0.98, length(vec2(vUv.x * 0.95, vUv.y * 1.5 - 0.1 * vUv.x)));
          float notch = smoothstep(0.0, 0.1, abs(vUv.y + 0.08) + (1.0 - vUv.x) * 0.5);
          if (edge * notch < 0.5) discard;
          float k = fract(vSeed * 9.1);
          vec3 c = k < 0.4 ? vec3(1.0, 0.99, 0.94) : k < 0.62 ? vec3(1.0, 0.86, 0.3) : k < 0.8 ? vec3(0.45, 0.6, 1.0) : k < 0.92 ? vec3(1.0, 0.56, 0.2) : vec3(0.85, 0.3, 0.3);
          // a darker border and a spot
          c *= mix(1.0, 0.55, smoothstep(0.66, 0.9, length(vec2(vUv.x * 0.95, vUv.y * 1.5))));
          c *= 1.0 - 0.5 * (1.0 - smoothstep(0.06, 0.1, length(vUv - vec2(0.6, 0.15))));
          gl_FragColor = vec4(applyAir(c * (uSkyCol * 0.95 + uKeyCol * 0.36), vWorld), 1.0);
          ${END}
        }`,
    });
    return { g, mat };
  }, [list]);
  return <mesh geometry={b.g} material={b.mat} frustumCulled={false} />;
}

// ---------- the upper sky ----------
// Over the heaps a high ceiling of cloud as he painted it: long flat strokes laid in rows, olive in their shade,
// with short strokes of yellow light along them, row behind row going down into the horizon's own colour.
export function CloudDeck({ y = 1250, size = 9000 }: { y?: number; size?: number }) {
  const b = useDisposable(() => {
    const g = new THREE.PlaneGeometry(size, size);
    g.rotateX(Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { ...SKY_U, ...WORLD_U },
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying vec2 vLocal;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vLocal = wp.xz - modelMatrix[3].xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld; varying vec2 vLocal;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_AIR}
        void main(){
          vec2 q = vLocal + vec2(uTime * 2.0, 0.0);
          // long strokes: the noise is drawn out one way, and wanders a little
          vec2 s = vec2(q.x * 0.00075 + vnoise(q * 0.0006) * 0.6, q.y * 0.0031);
          float body = fbm(s * 1.7 + 3.0);
          float a = smoothstep(0.4, 0.62, body);
          // strokes of light along the tops of the bars, broken, no two alike
          float lit = smoothstep(0.5, 0.72, fbm(vec2(q.x * 0.0021, q.y * 0.0075) + 11.0)) * smoothstep(0.45, 0.7, body);
          float dab = vnoise(vec2(q.x * 0.012, q.y * 0.045)) ;
          vec3 col = mix(uCloudShade * vec3(0.8, 0.86, 0.95), uCloudLit, lit * (0.55 + 0.45 * dab));
          vec3 dv = vWorld - cameraPosition; float dist = length(dv);
          float far = smoothstep(900.0, 5200.0, dist);
          col = mix(col, airCol(dv / dist), far * 0.8);
          gl_FragColor = vec4(col, a * 0.82 * (1.0 - smoothstep(5000.0, 9000.0, dist)));
          ${END}
        }`,
    });
    return { g, mat };
  }, [size]);
  return <mesh geometry={b.g} material={b.mat} position={[0, y, 0]} renderOrder={-3} frustumCulled={false} />;
}

// ---------- a ship setting out ----------
// A small boat with one tall pale sail, lying off the sand until the plane comes near; then it puts out, slowly,
// along the sun's road toward the horizon, rocking a little, its sail filling. `far` boats are already out there.
export function Ship({ from, heading, reach = 420, scale = 1, sailing = false }: { from: V3; heading: number; reach?: number; scale?: number; sailing?: boolean }) {
  const camera = useThree((s) => s.camera);
  const ref = useRef<THREE.Group>(null);
  const st = useRef({ t0: sailing ? 0 : -1, out: sailing ? 1 : 0 });
  const b = useDisposable(() => {
    const k = new Kit();
    const wood: V3 = [0.36, 0.24, 0.12];
    // the hull: a long shallow shell, high at stem and stern
    const hull = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
    const hp = hull.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const z = hp.getZ(i);
      hp.setXYZ(i, hp.getX(i) * 2.1 * (1 - 0.55 * z * z), hp.getY(i) * 1.5 + Math.pow(Math.abs(z), 2.4) * 1.5, z * 7.5);
    }
    hull.computeVertexNormals();
    k.add(hull, [0, 0.9, 0], wood, { top: [0.62, 0.44, 0.2] });
    k.box(3.6, 0.2, 12, [0, 0.75, 0], [0.5, 0.36, 0.18]);
    k.add(new THREE.CylinderGeometry(0.1, 0.16, 15, 6), [0, 8, 0.6], wood, { top: [0.7, 0.5, 0.24] });
    k.add(new THREE.CylinderGeometry(0.07, 0.07, 7.4, 5), [0, 2.6, -2.6], wood, { rot: [Math.PI / 2, 0, 0] });
    // the sail: a tall triangle, bellied by the wind
    const sail = new THREE.PlaneGeometry(1, 1, 8, 10);
    const sp = sail.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const u = sp.getX(i) + 0.5;
      const v = sp.getY(i) + 0.5;
      const w = (1 - v) * 7.2;
      sp.setXYZ(i, Math.sin(u * Math.PI) * Math.sin((1 - v * 0.6) * Math.PI * 0.5) * 1.5, 2.6 + v * 12, 0.5 - u * w);
    }
    sail.computeVertexNormals();
    k.add(sail, [0, 0, 0], [0.86, 0.8, 0.66], { top: [1, 0.97, 0.86], glow: 0.14 });
    // a figure at the steering oar, and a lamp at the masthead
    k.add(new THREE.ConeGeometry(0.42, 1.9, 7), [0, 1.9, -5.2], [0.8, 0.76, 0.66], { top: [0.95, 0.9, 0.8], glow: 0.06 });
    k.add(new THREE.SphereGeometry(0.2, 6, 5), [0, 3.0, -5.2], [0.94, 0.8, 0.68], { glow: 0.08 });
    k.add(new THREE.SphereGeometry(0.22, 6, 5), [0, 15.7, 0.6], [1, 0.84, 0.5], { glow: 1.6 });
    return { geo: k.build(), mat: makeTempera({ amb: 0.9, key: 0.5, wrap: 0.7 }) };
  }, []);
  const v = new THREE.Vector3();
  const last = useRef(0);
  useFrame(() => {
    const g = ref.current;
    if (!g || !g.parent) return;
    const s = st.current;
    const t = SKY_U.uTime.value;
    const dt = Math.min(0.2, Math.max(0, t - last.current));
    last.current = t;
    if (s.t0 < 0) {
      v.set(...from).applyMatrix4(g.parent.matrixWorld);
      let shown = true;
      for (let p: THREE.Object3D | null = g; p; p = p.parent) if (!p.visible) shown = false;
      if (shown && v.distanceTo(camera.position) < reach) s.t0 = t;
    }
    // under way: slowly at first, then a steady four knots
    if (s.t0 >= 0) s.out += Math.min(dt, 0.1) * (sailing ? 1.2 : 3.4 * Math.min(1, (t - s.t0) / 8));
    const d = sailing ? (s.out % 900) : s.out;
    g.position.set(from[0] + Math.sin(heading) * d, from[1] + Math.sin(t * 0.7 + from[0]) * 0.12, from[2] + Math.cos(heading) * d);
    g.rotation.set(Math.sin(t * 0.5 + from[2]) * 0.03, heading, Math.sin(t * 0.63 + from[0]) * 0.05 + (s.t0 >= 0 ? 0.06 : 0));
  });
  return (
    <group ref={ref} position={from} scale={scale}>
      <mesh geometry={b.geo} material={b.mat} />
    </group>
  );
}
