"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DESK } from "../shared";
import { SKY_U } from "../sky";

// Contact shadows on the desk top: the soft dark every object lays on the wood
// where it touches it and for a hand's breadth round, whatever the hour, which
// is what makes a thing sit ON a table instead of floating over it. The things
// on the desk are drawn from underneath (an eye in the table top looking up,
// seeing only them), each pixel keeping how close above the wood something is;
// that is blurred twice (tight for the line of contact, wide for the ambient
// shade under a larger thing) and laid on the top. A few small draws a frame.
export const CONTACT_LAYER = 3;
const W = DESK.w;
const D = DESK.d;
const REACH = 0.3; // how far above the wood a thing still shades it

const BLUR = /* glsl */ `
  uniform sampler2D tMap; uniform vec2 uStep; varying vec2 vUv;
  void main(){
    float a = texture2D(tMap, vUv).a * 0.227;
    a += (texture2D(tMap, vUv + uStep * 1.385).a + texture2D(tMap, vUv - uStep * 1.385).a) * 0.316;
    a += (texture2D(tMap, vUv + uStep * 3.231).a + texture2D(tMap, vUv - uStep * 3.231).a) * 0.07;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }`;

export function ContactShadows({ strength = 1 }: { strength?: number }) {
  const { gl, scene, camera } = useThree();
  const k = useMemo(() => {
    const mk = () => new THREE.WebGLRenderTarget(320, 160, { depthBuffer: true });
    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0, REACH);
    cam.position.set(0, DESK.top + 0.0004, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, DESK.top + 1, 0);
    cam.updateMatrixWorld();
    cam.layers.set(CONTACT_LAYER);
    const depth = new THREE.ShaderMaterial({
      blending: THREE.NoBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // nearest the wood: darkest; a thing held a hand above it: nearly nothing
      fragmentShader: /* glsl */ `void main(){ float n = 1.0 - gl_FragCoord.z; gl_FragColor = vec4(0.0, 0.0, 0.0, n * sqrt(n)); }`,
    });
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blur = new THREE.ShaderMaterial({
      blending: THREE.NoBlending,
      depthTest: false,
      uniforms: { tMap: { value: null as THREE.Texture | null }, uStep: { value: new THREE.Vector2() } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: BLUR,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blur);
    const a = mk();
    const b = mk();
    const c = mk();
    const show = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      uniforms: { tTight: { value: b.texture }, tWide: { value: c.texture }, uMat: { value: new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse) }, uK: { value: strength }, uNight: SKY_U.uNight },
      vertexShader: /* glsl */ `uniform mat4 uMat; varying vec2 vUv; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec4 c = uMat * wp; vUv = c.xy * 0.5 + 0.5; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tTight; uniform sampler2D tWide; uniform float uK; uniform float uNight; varying vec2 vUv;
        void main(){
          float t = texture2D(tTight, vUv).a; float w = texture2D(tWide, vUv).a;
          float a = clamp(t * 0.8 + w * 0.95, 0.0, 0.88) * uK;
          // soft toward the rim of the top, so nothing is cut off at its edge
          vec2 e = smoothstep(vec2(0.0), vec2(0.03), vUv) * smoothstep(vec2(0.0), vec2(0.03), 1.0 - vUv);
          gl_FragColor = vec4(vec3(0.012, 0.01, 0.014), a * e.x * e.y);
        }`,
    });
    return { cam, depth, quadCam, blur, quad, a, b, c, show };
  }, [strength]);
  const mark = useRef(0);
  useEffect(
    () => () => {
      k.a.dispose();
      k.b.dispose();
      k.c.dispose();
      k.depth.dispose();
      k.blur.dispose();
      k.show.dispose();
      k.quad.geometry.dispose();
    },
    [k],
  );
  useFrame(() => {
    // the things on the desk are found by name (each lifting group is one) and marked for this eye;
    // looked for again now and then, as models arrive late
    if (mark.current++ % 45 === 0)
      scene.traverse((o) => {
        if (!o.name.startsWith("lift-")) return;
        o.traverse((m) => {
          if ((m as THREE.Mesh).isMesh && m.name !== "blob") m.layers.enable(CONTACT_LAYER);
        });
      });
    if (camera.position.lengthSq() > 40 * 40) return;
    const prev = gl.getRenderTarget();
    const auto = gl.shadowMap.autoUpdate;
    const over = scene.overrideMaterial;
    const bg = scene.background;
    const ca = gl.getClearAlpha();
    gl.shadowMap.autoUpdate = false;
    scene.overrideMaterial = k.depth;
    scene.background = null;
    gl.setClearAlpha(0);
    try {
      gl.setRenderTarget(k.a);
      gl.clear();
      gl.render(scene, k.cam);
      scene.overrideMaterial = over;
      k.quad.material = k.blur;
      const pass = (from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget, x: number, y: number) => {
        k.blur.uniforms.tMap.value = from.texture;
        k.blur.uniforms.uStep.value.set(x / from.width, y / from.height);
        gl.setRenderTarget(to);
        gl.render(k.quad, k.quadCam);
      };
      // tight: a couple of centimetres. (a -> c -> b)
      pass(k.a, k.c, 1.1, 0);
      pass(k.c, k.b, 0, 1.1);
      // wide: from the tight one, out to a hand's breadth (b -> a -> c)
      pass(k.b, k.a, 4.2, 0);
      pass(k.a, k.c, 0, 4.2);
    } finally {
      scene.overrideMaterial = over;
      scene.background = bg;
      gl.setClearAlpha(ca);
      gl.shadowMap.autoUpdate = auto;
      gl.setRenderTarget(prev);
    }
  });
  return (
    <mesh position={[0, DESK.top + 0.0002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={k.show} renderOrder={1}>
      <planeGeometry args={[W - 0.012, D - 0.012]} />
    </mesh>
  );
}
