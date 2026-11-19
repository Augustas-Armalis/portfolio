"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ROUTE, STATIONS, roadX } from "./flightPath";

const PARADISE_Z = STATIONS.find((s) => s.id === "paradise")!.z;
import { GLSL_LAKE, GLSL_NOISE, GLSL_PATH, GLSL_SKY, lakeK, pathW, pathX } from "./shared";
import { SKY_U } from "./sky";
import { GLSL_DESK_SHADOW } from "./World";

// Instanced grass blades (after Ghost of Tsushima / al-ro / Codrops):
// - each blade is a tapered strip bent along a constant-length arc
// - wind is two scrolling noise fields (rolling gusts + flutter); leaning
//   blades get brighter, which draws the gust waves across the field
// - normals are rounded across the blade and blended toward up for soft,
//   painterly shading; blades are widened when seen edge-on
// - colour: dark root, green mid, sun-bleached tips, clumps of drier grass
// - translucency when the sun is behind the blade, analytic desk shadow,
//   and fog that resolves to the sky's horizon colour

const SEG = 4;

function bladeGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  const pos: number[] = [];
  for (let i = 0; i < SEG; i++) {
    const t = i / SEG;
    pos.push(-0.5, t, 0, 0.5, t, 0);
  }
  pos.push(0, 1, 0);
  const idx: number[] = [];
  for (let i = 0; i < SEG - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (SEG - 1) * 2;
  idx.push(last, last + 1, SEG * 2);
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// Rings overlap and cross-fade (blades shrink to nothing at a ring's edge) so
// density and blade width change without a visible seam.
type Ring = { count: number; rMin: number; rMax: number; width: number; height: [number, number]; fadeIn?: [number, number]; fadeOut?: [number, number]; linear?: boolean; grow?: number; wrap?: number };
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function scatter(g: THREE.InstancedBufferGeometry, ring: Ring, seed: number) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const off = new Float32Array(ring.count * 3);
  const shp = new Float32Array(ring.count * 4);
  for (let i = 0; i < ring.count; i++) {
    // uniform area between rMin and rMax
    // linear: density falls off as 1/r (dense near the desk, no seams), blades
    // widen with distance to keep the field looking full
    if (ring.wrap) {
      // a square tile of blades that the shader wraps around the camera, so
      // the field travels with the plane; fades and clearings happen there
      off[i * 3] = (rnd() - 0.5) * ring.wrap;
      off[i * 3 + 1] = (rnd() - 0.5) * ring.wrap;
      off[i * 3 + 2] = rnd() * Math.PI * 2;
      shp[i * 4] = ring.height[0] + rnd() * (ring.height[1] - ring.height[0]);
      shp[i * 4 + 1] = ring.width * (0.7 + rnd() * 0.6);
      shp[i * 4 + 2] = 0.25 + rnd() * 0.7;
      shp[i * 4 + 3] = rnd();
      continue;
    }
    const r = ring.linear
      ? ring.rMin + rnd() * (ring.rMax - ring.rMin)
      : Math.sqrt(ring.rMin * ring.rMin + rnd() * (ring.rMax * ring.rMax - ring.rMin * ring.rMin));
    const a = rnd() * Math.PI * 2;
    off[i * 3] = Math.cos(a) * r;
    off[i * 3 + 1] = Math.sin(a) * r;
    off[i * 3 + 2] = rnd() * Math.PI * 2;
    const fade = (ring.fadeIn ? sstep(ring.fadeIn[0], ring.fadeIn[1], r) : 1) * (ring.fadeOut ? 1 - sstep(ring.fadeOut[0], ring.fadeOut[1], r) : 1);
    // the dirt path: blades thin out and shorten toward its centre
    const pz = off[i * 3 + 1];
    const onPath = Math.abs(off[i * 3] - pathX(pz)) / pathW(pz);
    const pathK = Math.abs(pz) < 45 ? sstep(0.45, 1.15, onPath) : 1;
    const keep = pathK > 0.05 || rnd() < 0.08;
    shp[i * 4] = (ring.height[0] + rnd() * (ring.height[1] - ring.height[0])) * Math.max(fade * (keep ? Math.max(pathK, 0.18) : 0.001), 0.001);
    shp[i * 4 + 1] = ring.width * (1 + r * (ring.grow ?? 0)) * (0.7 + rnd() * 0.6);
    shp[i * 4 + 2] = 0.25 + rnd() * 0.7;
    shp[i * 4 + 3] = rnd();
  }
  g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute("aShape", new THREE.InstancedBufferAttribute(shp, 4));
  g.instanceCount = ring.count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), ring.wrap ? 1e5 : ring.rMax + 2);
}

export function makeGrassMaterial(fogDensity: number, wrap = 0) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    defines: wrap ? { WRAP: 1 } : {},
    uniforms: {
      uCenter: { value: new THREE.Vector2() },
      uTile: { value: wrap || 1 },
      uShore: { value: ROUTE.shoreZ },
      uPond: { value: new THREE.Vector3(roadX(PARADISE_Z) - 66, PARADISE_Z - 6, 58) },
      ...SKY_U,
      uWind: { value: 1 },
      uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
      uFog: { value: fogDensity },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uWind; uniform vec2 uWindDir;
      attribute vec3 aOffset; attribute vec4 aShape;
      varying float vT; varying vec3 vN; varying vec3 vWorld; varying float vRand; varying float vDry; varying float vWave; varying float vClump;
      uniform vec2 uCenter; uniform float uTile; uniform float uShore; uniform vec3 uPond;
      ${GLSL_NOISE}
      ${GLSL_LAKE}
      ${GLSL_PATH}
      void main(){
        float t = position.y; float side = position.x;
        vec2 root = aOffset.xy; float yaw = aOffset.z;
        float lod = 1.0;
        #ifdef WRAP
          root = mod(root - uCenter + uTile * 0.5, uTile) - uTile * 0.5 + uCenter;
          float dc = length(root - uCenter);
          // out to the edge of the tile, in from where the fine blades by the desk take over
          lod = (1.0 - smoothstep(uTile * 0.34, uTile * 0.49, dc)) * smoothstep(11.5, 16.0, length(root));
          // the road stays bare, and nothing grows in the sea
          float pk = abs(root.x - pathX(root.y)) / pathW(root.y);
          lod *= mix(1.0, smoothstep(0.5, 1.2, pk), step(root.y, 2.0)) * smoothstep(uShore + 1.0, uShore + 7.0, root.y);
          // and none in the still water at Paradise
          lod *= smoothstep(uPond.z + 1.0, uPond.z + 6.0, length(root - uPond.xy));
        #endif
        float h = aShape.x * max(lod, 0.001); float w = aShape.y; float bend = aShape.z; float r = aShape.w;
        #ifdef WRAP
          w *= 1.0 + dc * 0.035;
        #endif
        float clump = vnoise(root * 0.42 + 11.0);
        float patchN = vnoise(root * 0.11 + 3.0);
        h *= mix(0.62, 1.22, clump) * mix(0.85, 1.12, patchN);
        // no grass in the lake; short reeds-like fringe at the shore
        float lk = lakeK(root);
        h *= smoothstep(1.0, 1.12, lk) * (1.0 + 0.6 * (1.0 - smoothstep(1.1, 1.4, lk)));

        vec2 face = vec2(cos(yaw), sin(yaw));
        vec2 sideDir = vec2(-face.y, face.x);
        // wind: slow rolling gusts + a quicker flutter
        float g1 = vnoise(root * 0.22 - uWindDir * uTime * 0.55);
        float g2 = vnoise(root * 1.3 - uWindDir * uTime * 1.6 + r * 3.0);
        float wave = smoothstep(0.25, 0.85, g1);
        float lean = bend * 0.5 + (wave * 0.85 + g2 * 0.25) * uWind + sin(uTime * (1.7 + r) + r * 31.0) * 0.035 * uWind;
        vec2 bdir = normalize(mix(face, uWindDir, clamp(0.35 + wave * 0.5, 0.0, 1.0) * uWind + 0.0001));
        // constant-length arc
        float a = max(lean, 0.001) * t;
        float L = max(lean, 0.001);
        float x = h * (1.0 - cos(a)) / L;
        float y = h * sin(a) / L;
        // widen blades seen edge-on so the field stays full
        vec3 toCam = cameraPosition - vec3(root.x, 0.0, root.y);
        float edge = 1.0 - abs(dot(normalize(toCam.xz), face));
        float width = w * (1.0 - pow(t, 1.5)) * (1.0 + edge * 0.9);
        vec3 p = vec3(root.x, 0.0, root.y) + vec3(bdir.x * x, y, bdir.y * x) + vec3(sideDir.x, 0.0, sideDir.y) * side * width;
        // normal: across the arc, rounded over the width, then toward the sky
        vec3 tang = normalize(vec3(bdir.x * sin(a), cos(a), bdir.y * sin(a)));
        vec3 sd3 = vec3(sideDir.x, 0.0, sideDir.y);
        vec3 n = normalize(cross(sd3, tang));
        n = normalize(n + sd3 * side * 1.4);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.45));
        vClump = clamp(clump * 0.6 + patchN * 0.6 - 0.1, 0.0, 1.0); vT = t; vN = n; vWorld = p; vRand = r; vWave = wave * uWind;
        vDry = smoothstep(0.5, 0.85, patchN * 0.7 + clump * 0.3 + (r - 0.5) * 0.25);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFog;
      varying float vT; varying vec3 vN; varying vec3 vWorld; varying float vRand; varying float vDry; varying float vWave; varying float vClump;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_DESK_SHADOW}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = normalize(vec3(-n.x, n.y, -n.z));
        vec3 rootC = vec3(0.020, 0.032, 0.010);
        vec3 midC = mix(vec3(0.06, 0.105, 0.03), vec3(0.13, 0.12, 0.04), vDry);
        vec3 tipC = mix(vec3(0.2, 0.29, 0.075), vec3(0.44, 0.37, 0.15), vDry);
        vec3 alb = mix(rootC, midC, smoothstep(0.0, 0.45, vT));
        alb = mix(alb, tipC, smoothstep(0.4, 1.0, vT));
        alb *= (0.82 + 0.36 * vRand) * mix(0.72, 1.12, vClump);
        // far off the blades melt into the painted field under them: no edge to the grass
        float far = smoothstep(12.0, 46.0, length(vWorld - cameraPosition));
        alb = mix(alb, mix(vec3(0.13, 0.2, 0.05), vec3(0.28, 0.24, 0.095), vDry) * mix(0.72, 1.12, vClump), far * 0.75);

        vec3 V = normalize(cameraPosition - vWorld);
        float sh = deskShadow(vWorld);
        float ndl = dot(n, uKeyDir);
        float diff = pow(clamp(ndl * 0.5 + 0.5, 0.0, 1.0), 1.6) * smoothstep(-0.02, 0.08, uKeyDir.y);
        float ao = mix(mix(0.18, 0.8, far), 1.0, smoothstep(0.0, 0.75, vT));
        vec3 sunC = uKeyCol * 1.1;
        vec3 skyC = uSkyCol * 0.62;
        vec3 col = alb * (skyC * ao + sunC * diff * sh * ao);
        // light through the blade when the sun is behind it
        float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 4.0);
        col += alb * vec3(1.0, 0.85, 0.35) * sunC * back * vT * vT * 0.9 * sh;
        // sheen
        vec3 H = normalize(uKeyDir + V);
        col += sunC * 0.035 * pow(max(dot(n, H), 0.0), 24.0) * vT * sh;
        col *= 1.0 + vWave * 0.38 * vT;

        float dist = length(vWorld - cameraPosition);
        vec3 fd = normalize(vec3(vWorld.x - cameraPosition.x, 0.015, vWorld.z - cameraPosition.z));
        col = mix(col, skyBase(fd), 1.0 - exp(-dist * (uFog + uMist)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function Grass({ mobile, wind, fogDensity, density = 1 }: { mobile: boolean; wind: number; fogDensity: number; density?: number }) {
  const rings: Ring[] = useMemo(
    () =>
      mobile
        ? [
            { count: Math.round(95000 * density), rMin: 0, rMax: 15, width: 0.013 / Math.sqrt(density), grow: 0.2, height: [0.2, 0.44], linear: true, fadeOut: [11, 15] },
            { count: Math.round(30000 * density), rMin: 0, rMax: 0, wrap: 76, width: 0.06 / Math.sqrt(density), height: [0.3, 0.52] },
          ]
        : [
            { count: Math.round(230000 * density), rMin: 0, rMax: 16, width: 0.011 / Math.sqrt(density), grow: 0.17, height: [0.2, 0.44], linear: true, fadeOut: [12, 16] },
            { count: Math.round(120000 * density), rMin: 0, rMax: 0, wrap: 116, width: 0.05 / Math.sqrt(density), height: [0.3, 0.54] },
          ],
    [mobile, density],
  );
  const mats = useMemo(() => rings.map((r) => makeGrassMaterial(fogDensity, r.wrap ?? 0)), [fogDensity, rings]);
  const geos = useMemo(
    () =>
      rings.map((r, i) => {
        const g = bladeGeometry();
        scatter(g, r, 1234 + i * 97);
        return g;
      }),
    [rings],
  );
  const near = useRef<THREE.Mesh>(null);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ camera }) => {
    mats.forEach((m) => {
      m.uniforms.uWind.value = wind;
      m.uniforms.uCenter.value.set(camera.position.x, camera.position.z);
    });
    // the fine blades round the desk aren't drawn once the plane has left them behind
    if (near.current) near.current.visible = camera.position.x * camera.position.x + camera.position.z * camera.position.z < 70 * 70;
  });
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} ref={i === 0 ? near : undefined} geometry={g} material={mats[i]} frustumCulled={false} />
      ))}
    </>
  );
}

// Wildflowers: camera-facing five-petal heads riding the same wind as the
// blades, sprinkled sparsely in drifts (more where the clump noise is high).
export function Flowers({ mobile, wind, fogDensity }: { mobile: boolean; wind: number; fogDensity: number }) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const count = mobile ? 1100 : 2600;
    let s = 4242;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const off = new Float32Array(count * 3);
    const head = new Float32Array(count * 4);
    let n = 0;
    while (n < count) {
      const r = 0.9 + Math.pow(rnd(), 1.4) * 16;
      const a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // drifts: keep a flower only where a low-frequency pattern allows it
      const drift = Math.sin(x * 0.7 + 1.3) * Math.sin(z * 0.55 - 0.4) + Math.sin(x * 0.23 - z * 0.31) * 0.6;
      if (drift < 0.15 && rnd() > 0.15) continue;
      if (Math.abs(x) < 0.8 && Math.abs(z) < 0.45) continue;
      if (lakeK(x, z) < 1.15) continue;
      off[n * 3] = x;
      off[n * 3 + 1] = z;
      off[n * 3 + 2] = rnd();
      const c = rnd();
      head[n * 4] = 0.24 + rnd() * 0.22;
      head[n * 4 + 1] = (0.009 + rnd() * 0.008) * (1 + r * 0.04);
      head[n * 4 + 2] = c < 0.55 ? 0 : c < 0.82 ? 1 : c < 0.95 ? 2 : 3;
      head[n * 4 + 3] = rnd() * 6.28;
      n++;
    }
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute("aHead", new THREE.InstancedBufferAttribute(head, 4));
    g.instanceCount = count;
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...SKY_U,
        uWind: { value: 1 },
        uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
        uFog: { value: fogDensity },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uWind; uniform vec2 uWindDir;
        attribute vec3 aOffset; attribute vec4 aHead;
        varying vec2 vUv; varying float vKind; varying vec3 vWorld; varying float vRot;
        ${GLSL_NOISE}
        void main(){
          vec2 root = aOffset.xy;
          float g1 = vnoise(root * 0.22 - uWindDir * uTime * 0.55);
          float wave = smoothstep(0.25, 0.85, g1);
          float L = max((wave * 0.7 + 0.15) * uWind + sin(uTime * 1.9 + aOffset.z * 30.0) * 0.04, 0.001);
          float h = aHead.x;
          vec3 tip = vec3(root.x, 0.0, root.y) + vec3(uWindDir.x, 0.0, uWindDir.y) * h * (1.0 - cos(L)) / L + vec3(0.0, h * sin(L) / L, 0.0);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 p = tip + (right * position.x + up * position.y * 0.8) * aHead.y;
          vUv = position.xy; vKind = aHead.z; vWorld = p; vRot = aHead.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFog;
        varying vec2 vUv; varying float vKind; varying vec3 vWorld; varying float vRot;
        ${GLSL_SKY}
        void main(){
          float r = length(vUv);
          float a = atan(vUv.y, vUv.x) + vRot;
          float edge = 0.62 + 0.32 * cos(5.0 * a);
          if (r > edge) discard;
          vec3 petal = vKind < 0.5 ? vec3(0.92, 0.9, 0.84) : vKind < 1.5 ? vec3(0.95, 0.74, 0.18) : vKind < 2.5 ? vec3(0.62, 0.5, 0.86) : vec3(0.35, 0.5, 0.95);
          vec3 alb = mix(petal * (0.75 + 0.25 * r / edge), vec3(0.95, 0.7, 0.15), 1.0 - smoothstep(0.16, 0.24, r));
          vec3 col = alb * (uSkyCol * 0.7 + uKeyCol * 0.55 * smoothstep(-0.02, 0.08, uKeyDir.y));
          float dist = length(vWorld - cameraPosition);
          vec3 fd = normalize(vec3(vWorld.x - cameraPosition.x, 0.015, vWorld.z - cameraPosition.z));
          col = mix(col, skyBase(fd), 1.0 - exp(-dist * (uFog + uMist)));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, [mobile, fogDensity]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(() => {
    mat.uniforms.uWind.value = wind;
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}
