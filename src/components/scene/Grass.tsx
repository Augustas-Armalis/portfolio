"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { HOME_GATE_Z } from "./flightPath";
import { GLSL_AIR, WORLD_U, groundGLSL, type GroundPalette, type V3 } from "./worlds/kit";
import { ORIGIN, heightGLSL, voyage, type WorldDef } from "./worlds/voyage";
import { DESK, GLSL_NOISE, GLSL_PATH, GLSL_SKY, pathW, pathX } from "./shared";
import { SKY_U } from "./sky";
import { GLSL_DESK_SHADOW } from "./World";
import { GLSL_PATHS, deskPk } from "./home/journey";
import { GLSL_FIELD, GLSL_HOME_AIR, GLSL_LAND, HOLD, HOME_U, timed } from "./home/land";

// Instanced grass blades (after Ghost of Tsushima / al-ro / Codrops):
// - each blade is a tapered strip bent along a constant-length arc
// - wind is two scrolling noise fields (rolling gusts + flutter); leaning
//   blades get brighter, which draws the gust waves across the field
// - normals are rounded across the blade and blended toward up for soft,
//   painterly shading; blades are widened when seen edge-on
// - colour: dark root, green mid, sun-bleached tips, clumps of drier grass
// - translucency when the sun is behind the blade, analytic desk shadow,
//   and fog that resolves to the sky's horizon colour

// (a blade is cut finer the nearer it is seen: 3 pieces by the desk, 2 in the tile round it, a single triangle far off)
function bladeGeometry(SEG = 3) {
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
type Ring = { seg?: number; far?: boolean; count: number; rMin: number; rMax: number; width: number; height: [number, number]; fadeIn?: [number, number]; fadeOut?: [number, number]; linear?: boolean; grow?: number; wrap?: number; inner?: boolean; walk?: boolean };
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function scatter(g: THREE.InstancedBufferGeometry, ring: Ring, seed: number) {
  let s = seed;
  // (the same sequence as (s * 16807) % 2147483647, without the slow float remainder: this runs some ten
  // million times while the field is laid out)
  const rnd = () => {
    const x = s * 16807;
    s = x - Math.floor(x / 2147483647) * 2147483647;
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
    const px0 = off[i * 3];
    // (the main path, measured only where it can be near: the blades round the desk, not the whole field)
    const onPath = Math.min(pz > -2 ? Math.abs(px0 - pathX(pz)) / pathW(pz) : 1e3, pz < 2 && pz > -20 && px0 > -14 && px0 < 5 ? deskPk(px0, pz) : 1e3);
    // (the grass thins toward the path by there being fewer blades, each still a whole blade: short dark stubs
    // standing in the sand read as dirt)
    const pathK = sstep(0.5, 1.2, onPath);
    const keep = rnd() < pathK * pathK;
    shp[i * 4] = (ring.height[0] + rnd() * (ring.height[1] - ring.height[0])) * Math.max(fade * (keep ? 0.62 + 0.38 * pathK : 0.001), 0.001);
    shp[i * 4 + 1] = ring.width * (1 + r * (ring.grow ?? 0)) * (0.7 + rnd() * 0.6);
    shp[i * 4 + 2] = 0.25 + rnd() * 0.7;
    shp[i * 4 + 3] = rnd();
    // the desk stands IN the grass: nothing grows through a leg, and the blades round each foot are pressed
    // outward from it, leaning away, as grass is round anything set down in it
    if (r < 1.2) {
      const lx = Math.abs(off[i * 3]) - (DESK.w / 2 - 0.068);
      const lz = Math.abs(off[i * 3 + 1]) - (DESK.d / 2 - 0.052);
      const dl = Math.hypot(lx, lz);
      if (dl < 0.02) shp[i * 4] = 0.001;
      else if (dl < 0.17) {
        const k = 1 - (dl - 0.02) / 0.15;
        off[i * 3 + 2] = Math.atan2(lz * Math.sign(off[i * 3 + 1]), lx * Math.sign(off[i * 3])) + (rnd() - 0.5) * 0.5;
        shp[i * 4 + 2] = Math.min(1.25, shp[i * 4 + 2] + 0.75 * k * k);
        shp[i * 4] *= 1 - 0.25 * k;
      }
    }
  }
  g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute("aShape", new THREE.InstancedBufferAttribute(shp, 4));
  g.instanceCount = ring.count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), ring.wrap ? 1e5 : ring.rMax + 2);
}

// the fine tile that travels with the plane, and the wide one round it
const INNER_TILE = 44;
export function makeGrassMaterial(_fogDensity: number, wrap = 0, inner = false, walk = false, far = false) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    defines: wrap ? (far ? { WRAP: 1, FAR: 1 } : walk ? { WRAP: 1, WALK: 1 } : inner ? { WRAP: 1, INNER: 1 } : { WRAP: 1 }) : {},
    uniforms: {
      uCenter: { value: new THREE.Vector2() },
      uTile: { value: wrap || 1 },
      uInner: { value: INNER_TILE },
      uInnerOn: { value: 0 },
      uWalkOn: { value: 0 },
      // (the old straight road north is bare only as far as the paths part: beyond it the meadow has taken it back)
      uRoadEnd: { value: -2 },
      ...SKY_U,
      ...HOME_U,
      uWind: { value: 1 },
      uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
    },
    vertexShader: /* glsl */ `
      uniform float uWind; uniform vec2 uWindDir;
      attribute vec3 aOffset; attribute vec4 aShape;
      varying float vT; varying vec3 vN; varying vec3 vWorld; varying float vRand; varying float vDry; varying float vWave; varying float vClump; varying float vShade;
      uniform vec2 uCenter; uniform float uTile; uniform float uInner; uniform float uInnerOn; uniform float uRoadEnd; uniform float uWalkOn;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_PATH}
      ${GLSL_LAND}
      ${GLSL_HOME_AIR}
      ${GLSL_FIELD}
      ${GLSL_PATHS}
      void main(){
        float t = position.y; float side = position.x;
        vec2 root = aOffset.xy; float yaw = aOffset.z;
        float lod = 1.0;
        #ifdef WRAP
          root = mod(root - uCenter + uTile * 0.5, uTile) - uTile * 0.5 + uCenter;
          float dc = length(root - uCenter);
          // out to the edge of the tile, in from where the fine blades by the desk take over
          #ifdef FAR
            // the far field: broad tufts from where the blades proper thin out, to a couple of hundred metres
            lod = (1.0 - smoothstep(uTile * 0.3, uTile * 0.49, dc)) * smoothstep(26.0, 52.0, dc);
          #else
            lod = (1.0 - smoothstep(uTile * 0.3, uTile * 0.49, dc)) * smoothstep(8.0, 16.0, length(root));
          #endif
          // the road stays bare as far as it runs
          // (and the main path from the desk is that same road running on, measured the same way, so the grass
          // keeps one edge along both: no step where one ends and the other begins)
          float pk = min(root.y > uRoadEnd ? abs(root.x - pathX(root.y)) / pathW(root.y) : 1e3, deskPk(root));
          // (fewer blades toward it, not shorter ones; and the grass edge follows the painted edge, ragged with the
          // same noise, so the blades end where the earth does: no band of stubs standing on bare path)
          pk -= vnoise(root * 0.9) * 0.32;
          lod *= step(aShape.w, smoothstep(0.62, 0.98, pk));
          // in flight a fine tile rides with the plane and the wide one makes room for it
          #ifdef WALK
            // the fine grass underfoot, wherever one walks to
            lod *= uWalkOn;
          #else
            #ifdef INNER
              lod *= uInnerOn;
            #else
              lod *= mix(1.0, smoothstep(uInner * 0.3, uInner * 0.47, dc), uInnerOn);
            #endif
            lod *= mix(1.0, smoothstep(4.5, 8.5, dc), uWalkOn);
          #endif
        #endif
        float gy = landH(root);
        float lk = hLakeK(root);
        // no grass in water or on bare sand; under the trees it is shorter and thinner
        float level = max(lk < 1.15 ? LAKE_Y : SEA, riverLevel(root));
        float woods = forestAt(root);
        lod *= smoothstep(level + 0.03, level + 0.3, gy) * smoothstep(38.0, 100.0, inland(root) + (vnoise(root * 0.035) - 0.5) * 46.0);
        lod *= smoothstep(0.6, 1.5, streamD(root));
        // (and none on the lake's sandy rim: pale tufts stood in a row on the sand there. The rim is where the ground
        // paints its sand, the low strip just above the water (Terrain.tsx), so the grass stops where the sand begins,
        // whole blades up to it and none on it: not a wide band of thinned stubs standing on pale earth)
        float rimSand = (1.0 - smoothstep(0.02, 0.4, gy - LAKE_Y)) * (1.0 - smoothstep(1.2, 1.32, lk));
        lod *= smoothstep(1.12, 1.22, lk) * step(rimSand, 0.35);
        lod *= (1.0 - smoothstep(0.15, 0.6, townStreet(root))) * (1.0 - smoothstep(0.2, 0.7, forestTrack(root))) * (1.0 - caveIn(root)) * (1.0 - fieldPlot(root).z);
        vec2 hpath = homePaths(root);
        lod *= 1.0 - 0.65 * hpath.y;
        float h = aShape.x * max(lod, 0.001) * mix(1.0, 0.6, smoothstep(0.3, 0.8, woods)); float w = aShape.y; float bend = aShape.z; float r = aShape.w;
        #ifdef WRAP
          #ifdef FAR
            w *= 0.7 + dc * 0.012;
            h *= 0.62;
          #else
          #ifndef WALK
            w *= 1.0 + dc * 0.045;
          #endif
          #endif
        #endif
        vec2 fm = fieldMix(root);
        float clump = vnoise(root * 0.42 + 11.0);
        float patchN = vnoise(root * 0.11 + 3.0);
        h *= mix(0.62, 1.22, clump) * mix(0.85, 1.12, patchN);
        // taller at the lake's edge: sedge
        h *= 1.0 + 0.25 * (1.0 - smoothstep(1.02, 1.3, lk)) * step(lk, 1.6);

        vec2 face = vec2(cos(yaw), sin(yaw));
        vec2 sideDir = vec2(-face.y, face.x);
        // wind: slow rolling gusts + a quicker flutter
        // (the quick small stirring is kept slight and slow: hundreds of thin bright blades each twitching on its own is
        // not wind, it is a flicker)
        float g2 = vnoise(root * 0.9 - uWindDir * uTime * 0.9 + r * 3.0);
        float wave = windWave(root);
        float lean = bend * 0.5 + (wave * 0.85 + g2 * 0.16) * uWind + sin(uTime * (1.1 + r * 0.6) + r * 31.0) * 0.016 * uWind;
        // (a blade pressed aside by something keeps to its own way: the wind only stirs it)
        float own = smoothstep(0.95, 1.2, bend);
        vec2 bdir = normalize(mix(face, uWindDir, clamp(0.35 + wave * 0.5, 0.0, 1.0) * uWind * (1.0 - own) + 0.0001));
        // constant-length arc
        float a = max(lean, 0.001) * t;
        float L = max(lean, 0.001);
        float x = h * (1.0 - cos(a)) / L;
        float y = h * sin(a) / L;
        // widen blades seen edge-on so the field stays full
        vec3 toCam = cameraPosition - vec3(root.x, gy, root.y);
        float edge = 1.0 - abs(dot(normalize(toCam.xz), face));
        float width = w * (1.0 - pow(t, 1.5)) * (1.0 + edge * 0.9);
        // never thinner than a pixel can carry: a hair of a blade sparkles as the wind moves it
        width = max(width, length(toCam) * 0.0011 * (1.0 - 0.55 * t) * step(0.002, lod));
        vec3 p = vec3(root.x, gy, root.y) + vec3(bdir.x * x, y, bdir.y * x) + vec3(sideDir.x, 0.0, sideDir.y) * side * width;
        // normal: across the arc, rounded over the width, then toward the sky
        vec3 tang = normalize(vec3(bdir.x * sin(a), cos(a), bdir.y * sin(a)));
        vec3 sd3 = vec3(sideDir.x, 0.0, sideDir.y);
        vec3 n = normalize(cross(sd3, tang));
        n = normalize(n + sd3 * side * 1.4);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.45));
        vClump = fm.y; vT = t; vN = n; vWorld = p; vRand = r; vWave = wave * uWind;
        vDry = fm.x;
        // the shade of trees and clouds, taken once at the blade's foot
        vec3 rp = vec3(root.x, gy, root.y);
        vShade = treeShade(rp) * cloudShade(rp);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vT; varying vec3 vN; varying vec3 vWorld; varying float vRand; varying float vDry; varying float vWave; varying float vClump; varying float vShade;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_DESK_SHADOW}
      ${GLSL_HOME_AIR}
      ${GLSL_FIELD}
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = normalize(vec3(-n.x, n.y, -n.z));
        // the field's own paint at this blade's foot: what the ground shows where no blades are drawn
        vec3 fieldA = fieldAlbK(vec2(vDry, vClump));
        float sh = deskShadow(vWorld) * vShade;
        float aoD = deskAO(vWorld);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        vec3 fieldC = fieldA * (uSkyCol * 0.62 * aoD + uKeyCol * (0.25 + 0.75 * max(uKeyDir.y, 0.0)) * sh * sunUp * mix(0.6, 1.0, aoD));
        float dist = length(vWorld - cameraPosition);

        // close to: a blade with a dark foot in its neighbours' shade, a green body and a sun-bleached tip
        // (the dark between the blades is deepest right at the eye; a little way off it is shallower, so the field is not
        // a mesh of black and bright threads)
        vec3 rootC = fieldA * mix(0.17, 0.36, smoothstep(1.2, 4.5, dist));
        vec3 midC = fieldA * 0.72;
        vec3 tipC = mix(fieldA * 1.7, vec3(0.4, 0.37, 0.15), 0.12 + 0.34 * vDry);
        vec3 alb = mix(rootC, midC, smoothstep(0.0, 0.45, vT));
        alb = mix(alb, tipC, smoothstep(0.4, 1.0, vT));
        alb *= 0.82 + 0.36 * vRand;
        vec3 V = normalize(cameraPosition - vWorld);
        float ndl = dot(n, uKeyDir);
        float diff = pow(clamp(ndl * 0.5 + 0.5, 0.0, 1.0), 1.6) * sunUp;
        // ambient occlusion at the roots
        float ao = mix(0.2, 1.0, smoothstep(0.0, 0.75, vT)) * aoD;
        vec3 sunC = uKeyCol * 1.1;
        vec3 col = alb * (uSkyCol * 0.62 * ao + sunC * diff * sh * ao);
        // light through the blade when the sun is behind it
        float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 4.0);
        col += alb * vec3(1.0, 0.85, 0.35) * sunC * back * vT * vT * 0.9 * sh;
        // (no glint on a blade: a sharp highlight on something a few pixels wide that moves is a spark every frame)
        col *= 1.0 + vWave * 0.24 * vT;

        // further off every blade takes exactly the light of the field under it: no speckle, no edge, only its nap
        vec3 nap = fieldFar(fieldC, dist) * (0.86 + 0.24 * vT) * (0.93 + 0.14 * vRand) * (1.0 + vWave * 0.16);
        col = mix(col, nap, smoothstep(3.5, 15.0, dist));
        col = homeAir(col, vWorld);
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
            // (a phone's blades by the desk are cut in two pieces, not three: at its size no one can tell, and it is two fifths fewer triangles)
            { seg: 2, count: Math.round(95000 * density), rMin: 0, rMax: 15, width: 0.013 / Math.sqrt(density), grow: 0.2, height: [0.2, 0.44], linear: true, fadeOut: [9, 15] },
            { seg: 2, count: Math.round(30000 * density), rMin: 0, rMax: 0, wrap: 76, width: 0.06 / Math.sqrt(density), height: [0.22, 0.46] },
            { seg: 2, count: Math.round(34000 * density), rMin: 0, rMax: 0, wrap: INNER_TILE, inner: true, width: 0.045 / Math.sqrt(density), height: [0.24, 0.5] },
            { count: Math.round(40000 * density), rMin: 0, rMax: 0, wrap: 18, walk: true, width: 0.022 / Math.sqrt(density), height: [0.2, 0.44] },
            { seg: 1, far: true, count: Math.round(50000 * density), rMin: 0, rMax: 0, wrap: 280, width: 0.34 / Math.sqrt(density), height: [0.3, 0.56] },
          ]
        : [
            { count: Math.round(160000 * density), rMin: 0, rMax: 16, width: 0.013 / Math.sqrt(density), grow: 0.17, height: [0.2, 0.44], linear: true, fadeOut: [9, 16] },
            { seg: 2, count: Math.round(145000 * density), rMin: 0, rMax: 0, wrap: 104, width: 0.05 / Math.sqrt(density), height: [0.22, 0.46] },
            { seg: 2, count: Math.round(100000 * density), rMin: 0, rMax: 0, wrap: INNER_TILE, inner: true, width: 0.034 / Math.sqrt(density), height: [0.24, 0.5] },
            { count: Math.round(120000 * density), rMin: 0, rMax: 0, wrap: 18, walk: true, width: 0.015 / Math.sqrt(density), height: [0.2, 0.44] },
            // the far field: single broad triangles out to two hundred metres, so the meadow is grass as far as it is seen
            { seg: 1, far: true, count: Math.round(230000 * density), rMin: 0, rMax: 0, wrap: 420, width: 0.3 / Math.sqrt(density), height: [0.3, 0.58] },
          ],
    [mobile, density],
  );
  const mats = useMemo(() => rings.map((r) => makeGrassMaterial(fogDensity, r.wrap ?? 0, !!r.inner, !!r.walk, !!r.far)), [fogDensity, rings]);
  const geos = useMemo(
    () =>
      rings.map((r, i) => {
        const g = bladeGeometry(r.seg ?? 3);
        timed("grass", () => scatter(g, r, 1234 + i * 97));
        return g;
      }),
    [rings],
  );
  const near = useRef<THREE.Mesh>(null);
  const fine = useRef<THREE.Mesh>(null);
  const walk = useRef<THREE.Mesh>(null);
  const innerOn = useRef(0);
  const walkOn = useRef(0);
  const lastCam = useRef(new THREE.Vector2());
  const warmed = useRef(0);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  useFrame(({ camera }, dt) => {
    // (while the world is held behind the loader no frame counts: the warming draws below must really be drawn)
    if (HOLD.on) return;
    // the fine travelling tile grows in once the plane is up and away from the desk
    const d2 = camera.position.x * camera.position.x + camera.position.z * camera.position.z;
    const want = voyage.flying && d2 > 9 * 9 ? 1 : 0;
    innerOn.current += (want - innerOn.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 1.6));
    if (innerOn.current < 0.002 && !want) innerOn.current = 0;
    // and the finest one comes up underfoot whenever the eye is away from the desk and near the ground
    const wantW = d2 > 10 * 10 && camera.position.y < 14 ? 1 : 0;
    const jumped = Math.hypot(camera.position.x - lastCam.current.x, camera.position.z - lastCam.current.y) > 6;
    lastCam.current.set(camera.position.x, camera.position.z);
    if (jumped) walkOn.current = wantW;
    walkOn.current += (wantW - walkOn.current) * (1 - Math.exp(-Math.min(dt, 0.1) * 2.2));
    if (walkOn.current < 0.002 && !wantW) walkOn.current = 0;
    // From the sky no blade can be seen, and each still costs its vertices: the field is thinned by count with the
    // eye's height (the blades are in random order, so fewer of them is the same field, sparser), each kind of tile
    // over its own range. Coming down, the grass thickens under the eye instead of all being there from a kilometre up.
    const hy = camera.position.y;
    const sm = THREE.MathUtils.smoothstep;
    rings.forEach((r, i) => {
      const k = r.walk ? 1 : r.far ? 1 - sm(hy, 110, 300) : r.wrap ? 1 - sm(hy, 38, 125) : 1 - sm(hy, 16, 58);
      geos[i].instanceCount = Math.round(r.count * k);
    });
    mats.forEach((m) => {
      m.uniforms.uWind.value = wind;
      m.uniforms.uCenter.value.set(camera.position.x, camera.position.z);
      m.uniforms.uInnerOn.value = innerOn.current;
      m.uniforms.uWalkOn.value = walkOn.current;
    });
    if (walk.current) walk.current.visible = warmed.current < 12 || walkOn.current > 0;
    // the fine blades round the desk aren't drawn once the plane has left them behind
    // (for the first frames every tile is drawn, blades at nothing: their shaders are made behind the loader, not mid-descent)
    const warm = warmed.current++ < 12;
    if (near.current) near.current.visible = warm || d2 < 70 * 70;
    if (fine.current) fine.current.visible = warm || innerOn.current > 0;
  });
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} ref={i === 0 ? near : rings[i].walk ? walk : rings[i].inner ? fine : undefined} geometry={g} material={mats[i]} frustumCulled={false} />
      ))}
    </>
  );
}

// ---------- the grass of the painted worlds ----------
// The same blades, standing on a world's own ground: two tiles that travel
// with the plane (a fine one close by, a wide one of broad blades round it),
// coloured from the world's ground palette so that at any distance a blade
// is exactly the colour of the field it stands in.
function makeWorldGrassMaterial(def: WorldDef, pal: GroundPalette, tile: number, inner: boolean, tip: V3, mask: string) {
  const water = def.water ?? -1e4;
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    defines: inner ? { INNER: 1 } : {},
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      uCenter: { value: new THREE.Vector2() },
      uTile: { value: tile },
      uInner: { value: INNER_TILE },
      uWind: { value: 1 },
      uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
      uTip: { value: new THREE.Color(...tip) },
    },
    vertexShader: /* glsl */ `
      uniform float uWind; uniform vec2 uWindDir; uniform vec2 uCenter; uniform float uTile; uniform float uInner;
      attribute vec3 aOffset; attribute vec4 aShape;
      varying float vT; varying vec3 vN; varying vec3 vWorld; varying float vRand; varying float vWave; varying vec3 vAlb;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${heightGLSL(def.terrain)}
      ${groundGLSL(pal)}
      float grassMask(vec2 p, float h){ ${mask || "return 1.0;"} }
      void main(){
        float t = position.y; float side = position.x;
        vec2 root = mod(aOffset.xy - uCenter + uTile * 0.5, uTile) - uTile * 0.5 + uCenter;
        float yaw = aOffset.z;
        float dc = length(root - uCenter);
        float lod = 1.0 - smoothstep(uTile * 0.34, uTile * 0.49, dc);
        #ifndef INNER
          lod *= smoothstep(uInner * 0.3, uInner * 0.47, dc);
        #endif
        float gh = terrainH(root);
        float slope = length(vec2(terrainH(root + vec2(1.5, 0.0)) - gh, terrainH(root + vec2(0.0, 1.5)) - gh)) / 1.5;
        lod *= smoothstep(${(water + 0.3).toFixed(2)}, ${(water + 1.3).toFixed(2)}, gh) * (1.0 - smoothstep(0.5, 0.85, slope)) * grassMask(root, gh);
        float h = aShape.x * max(lod, 0.001); float w = aShape.y * (1.0 + dc * 0.045); float bend = aShape.z; float r = aShape.w;
        float clump = vnoise(root * 0.42 + 11.0);
        float patchN = vnoise(root * 0.11 + 3.0);
        h *= mix(0.62, 1.22, clump) * mix(0.85, 1.12, patchN);
        vec2 face = vec2(cos(yaw), sin(yaw));
        vec2 sideDir = vec2(-face.y, face.x);
        float g1 = vnoise(root * 0.22 - uWindDir * uTime * 0.55);
        float g2 = vnoise(root * 1.3 - uWindDir * uTime * 1.6 + r * 3.0);
        float wave = smoothstep(0.25, 0.85, g1);
        float lean = bend * 0.5 + (wave * 0.85 + g2 * 0.25) * uWind + sin(uTime * (1.7 + r) + r * 31.0) * 0.035 * uWind;
        vec2 bdir = normalize(mix(face, uWindDir, clamp(0.35 + wave * 0.5, 0.0, 1.0) * uWind + 0.0001));
        float a = max(lean, 0.001) * t;
        float L = max(lean, 0.001);
        float x = h * (1.0 - cos(a)) / L;
        float y = h * sin(a) / L;
        float edge = 1.0 - abs(dot(normalize(uCenter - root + 0.0001), face));
        float width = w * (1.0 - pow(t, 1.5)) * (1.0 + edge * 0.9);
        vec3 p = vec3(root.x, gh, root.y) + vec3(bdir.x * x, y, bdir.y * x) + vec3(sideDir.x, 0.0, sideDir.y) * side * width;
        vec3 tang = normalize(vec3(bdir.x * sin(a), cos(a), bdir.y * sin(a)));
        vec3 sd3 = vec3(sideDir.x, 0.0, sideDir.y);
        vec3 n = normalize(cross(sd3, tang));
        n = normalize(n + sd3 * side * 1.4);
        n = normalize(mix(n, vec3(0.0, 1.0, 0.0), 0.45));
        vT = t; vN = n; vRand = r; vWave = wave * uWind;
        vAlb = groundAlb(root);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTip;
      varying float vT; varying vec3 vN; varying vec3 vWorld; varying float vRand; varying float vWave; varying vec3 vAlb;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      vec3 groundLight(vec3 alb){ return alb * (uSkyCol * 0.7 + uKeyCol * (0.22 + 0.5 * max(uKeyDir.y, 0.0)) * smoothstep(-0.02, 0.08, uKeyDir.y)); }
      void main(){
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = normalize(vec3(-n.x, n.y, -n.z));
        vec3 alb = mix(vAlb * 0.66, vAlb * 0.95, smoothstep(0.0, 0.45, vT));
        alb = mix(alb, mix(vAlb * 1.6, uTip, 0.4), smoothstep(0.4, 1.0, vT));
        alb *= 0.85 + 0.3 * vRand;
        vec3 V = normalize(cameraPosition - vWorld);
        float sunUp = smoothstep(-0.02, 0.08, uKeyDir.y);
        float diff = pow(clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0), 1.6) * sunUp;
        float ao = mix(0.62, 1.0, smoothstep(0.0, 0.75, vT));
        vec3 col = alb * (uSkyCol * 0.7 * ao + uKeyCol * 0.62 * diff * ao);
        float back = pow(clamp(dot(-V, uKeyDir), 0.0, 1.0), 4.0);
        col += alb * vec3(1.0, 0.85, 0.35) * uKeyCol * back * vT * vT * 0.6 * sunUp;
        col *= 1.0 + vWave * 0.3 * vT;
        float dist = length(vWorld - cameraPosition);
        col = mix(col, groundLight(vAlb) * (0.92 + 0.16 * vT), smoothstep(5.0, 34.0, dist));
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function WorldGrass({ def, pal, tip = [0.5, 0.5, 0.2], mobile, density = 1, wind = 1, mask = "", tall = 1 }: { def: WorldDef; pal: GroundPalette; tip?: V3; mobile: boolean; density?: number; wind?: number; mask?: string; tall?: number }) {
  const { geos, mats } = useMemo(() => {
    const rings: Ring[] = mobile
      ? [
          { count: Math.round(34000 * density), rMin: 0, rMax: 0, wrap: INNER_TILE, inner: true, width: 0.045 / Math.sqrt(density), height: [0.26 * tall, 0.54 * tall] },
          { count: Math.round(34000 * density), rMin: 0, rMax: 0, wrap: 96, width: 0.075 / Math.sqrt(density), height: [0.34 * tall, 0.62 * tall] },
        ]
      : [
          { count: Math.round(105000 * density), rMin: 0, rMax: 0, wrap: INNER_TILE, inner: true, width: 0.034 / Math.sqrt(density), height: [0.26 * tall, 0.54 * tall] },
          { count: Math.round(125000 * density), rMin: 0, rMax: 0, wrap: 130, width: 0.06 / Math.sqrt(density), height: [0.34 * tall, 0.64 * tall] },
        ];
    const geos = rings.map((r, i) => {
      const g = bladeGeometry();
      scatter(g, r, 4321 + i * 131);
      return g;
    });
    const mats = rings.map((r) => makeWorldGrassMaterial(def, pal, r.wrap!, !!r.inner, tip, mask));
    return { geos, mats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, mobile, density, tall]);
  useEffect(
    () => () => {
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
    [geos, mats],
  );
  useFrame(({ camera }) => {
    mats.forEach((m) => {
      m.uniforms.uWind.value = wind;
      m.uniforms.uCenter.value.set(camera.position.x - ORIGIN.x, camera.position.z - ORIGIN.z);
    });
  });
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={mats[i]} frustumCulled={false} />
      ))}
    </>
  );
}

// Wildflowers: five-petal heads on thin stalks riding the same wind as the
// blades. A tile of them travels with the eye, so they are wherever one
// stands; where they grow is the field's own pattern of drifts (thick in a
// drift, a stray one here and there outside it), each drift led by one colour,
// and where the tile ends the ground carries the drifts on as specks.
const FLOWER_TILE = 96;
export function Flowers({ mobile, wind }: { mobile: boolean; wind: number; fogDensity?: number }) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    // a head (quad) and under it a stalk (a thin quad): aPart 0 head, 1 stalk
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0, -1, 0, 1, 1, 0, 1, 1, 1, 1, -1, 1, 1], 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const count = mobile ? 5200 : 27000;
    let s = 4242;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    const off = new Float32Array(count * 4);
    const head = new Float32Array(count * 4);
    for (let n = 0; n < count; n++) {
      off[n * 4] = (rnd() - 0.5) * FLOWER_TILE;
      off[n * 4 + 1] = (rnd() - 0.5) * FLOWER_TILE;
      off[n * 4 + 2] = rnd();
      off[n * 4 + 3] = rnd();
      head[n * 4] = 0.22 + rnd() * 0.34;
      head[n * 4 + 1] = 0.017 + rnd() * rnd() * 0.034;
      head[n * 4 + 2] = rnd();
      head[n * 4 + 3] = rnd() * 6.28;
    }
    g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 4));
    g.setAttribute("aHead", new THREE.InstancedBufferAttribute(head, 4));
    g.instanceCount = count;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      alphaToCoverage: true,
      side: THREE.DoubleSide,
      uniforms: {
        ...SKY_U,
        ...HOME_U,
        uCenter: { value: new THREE.Vector2() },
        uWind: { value: 1 },
        uWindDir: { value: new THREE.Vector2(0.86, 0.5).normalize() },
      },
      vertexShader: /* glsl */ `
        uniform float uWind; uniform vec2 uWindDir; uniform vec2 uCenter;
        attribute vec4 aOffset; attribute vec4 aHead;
        varying vec2 vUv; varying vec3 vHue; varying vec3 vWorld; varying float vRot; varying float vPart; varying float vShade; varying float vKind;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_PATH}
        ${GLSL_LAND}
        ${GLSL_HOME_AIR}
        ${GLSL_FIELD}
        ${GLSL_PATHS}
        void main(){
          const float T = ${FLOWER_TILE.toFixed(1)};
          vec2 root = mod(aOffset.xy - uCenter + T * 0.5, T) - T * 0.5 + uCenter;
          float dc = length(root - uCenter);
          float fd = flowerDrift(root);
          // thick in a drift, one in twelve outside it
          float keep = step(aOffset.z, 0.14 + 0.86 * fd);
          keep *= 1.0 - smoothstep(T * 0.36, T * 0.49, dc);
          float gy = landH(root);
          float lk = hLakeK(root);
          keep *= smoothstep(1.06, 1.2, lk) * step(${(-0.0).toFixed(1)}, gy + 0.2) * smoothstep(60.0, 110.0, inland(root));
          keep *= 1.0 - smoothstep(0.35, 0.7, forestAt(root));
          vec2 fpath = homePaths(root);
          keep *= (1.0 - smoothstep(0.1, 0.4, fpath.x + fpath.y)) * (1.0 - townStreet(root)) * (1.0 - forestTrack(root)) * (1.0 - fieldPlot(root).z) * (1.0 - (1.0 - smoothstep(0.9, 1.4, abs(root.x - pathX(root.y)) / pathW(root.y))) * step(-12.0, root.y) * step(root.y, 60.0));
          // not on the path, not through the desk
          keep *= smoothstep(0.9, 1.3, abs(root.x - pathX(root.y)) / pathW(root.y));
          keep *= 1.0 - (1.0 - step(0.78, abs(root.x))) * (1.0 - step(0.42, abs(root.y)));
          float wave = windWave(root);
          float L = max((wave * 0.7 + 0.15) * uWind + sin(uTime * 1.9 + aOffset.w * 30.0) * 0.04, 0.001);
          float h = aHead.x * keep;
          vec3 base = vec3(root.x, gy, root.y);
          vec3 wd = vec3(uWindDir.x, 0.0, uWindDir.y);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 p;
          if (position.z > 0.5) {
            // the stalk: bent along the same arc as the head rides
            float k = position.y;
            float a = L * k;
            p = base + wd * h * (1.0 - cos(a)) / L + vec3(0.0, h * sin(a) / L, 0.0) + right * position.x * 0.0016;
          } else {
            vec3 tip = base + wd * h * (1.0 - cos(L)) / L + vec3(0.0, h * sin(L) / L, 0.0);
            p = tip + (right * position.x + up * position.y * 0.82) * max(aHead.y, length(tip - cameraPosition) * 0.0014) * keep;
          }
          vUv = position.xy; vPart = position.z; vWorld = p; vRot = aHead.w;
          // each flower mostly its drift's colour, now and then another
          vHue = flowerHue(root + (aHead.z - 0.5) * 34.0 * step(0.72, aOffset.w));
          vKind = aHead.z;
          vShade = treeShade(base) * cloudShade(base);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vHue; varying vec3 vWorld; varying float vRot; varying float vPart; varying float vShade; varying float vKind;
        ${GLSL_NOISE}
        ${GLSL_SKY}
        ${GLSL_DESK_SHADOW}
        ${GLSL_HOME_AIR}
        void main(){
          vec3 alb;
          float cov = 1.0;
          if (vPart > 0.5) alb = vec3(0.1, 0.17, 0.045);
          else {
            float r = length(vUv);
            float a = atan(vUv.y, vUv.x) + vRot;
            // five petals, or a daisy's many
            float petals = vKind > 0.6 ? 11.0 : 5.0;
            float edge = (vKind > 0.6 ? 0.78 : 0.62) + (vKind > 0.6 ? 0.2 : 0.32) * cos(petals * a);
            // (the petal's edge as coverage, a pixel wide: smooth, and still as the flower nods)
            cov = clamp((edge - r) / max(fwidth(r) * 1.3, 0.0001) + 0.5, 0.0, 1.0);
            if (cov < 0.1) discard;
            alb = mix(vHue * (0.72 + 0.28 * r / edge), vec3(0.95, 0.68, 0.12), 1.0 - smoothstep(0.16, 0.26, r));
          }
          float sh = deskShadow(vWorld) * vShade;
          vec3 col = alb * (uSkyCol * 0.72 * deskAO(vWorld) + uKeyCol * 0.6 * sh * smoothstep(-0.02, 0.08, uKeyDir.y));
          col = homeAir(col, vWorld);
          gl_FragColor = vec4(col, cov);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geo: g, mat: m };
  }, [mobile]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(({ camera }) => {
    mat.uniforms.uWind.value = wind;
    mat.uniforms.uCenter.value.set(camera.position.x, camera.position.z);
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}
