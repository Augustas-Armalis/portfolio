import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, noise2 } from "../kit";
import { FUNERAL_U, GLSL_FUNERAL_AIR } from "./air";
import { funeralLand } from "./land";

// The ancient tree. Where the road ends, at the pass's far side, the mountain has a tree growing out of it: a trunk
// a hundred metres through that goes up out of sight into the night, roots running down the slope like the buttresses
// of a cathedral, great limbs going out from it high up, and at its foot an arched door, tall as a church, with
// the light of the other side coming out of it. This is where the souls go: the crowd turns left at the parting
// of the ways, goes up to it, and in. (The plane goes the other way, to the right: the gate over the abyss.)
//
// One mesh, one draw: the trunk and its limbs are a single surface; the door is cut out of it in the shader (the
// same arch as the cave the road goes into behind it, worlds/funeral/rock.ts).

export const TREE = { R: 112, top: 1180, front: 28, doorHalf: 20, doorWall: 19, doorTop: 44 };

export function treeFrame() {
  const L = funeralLand();
  const M = L.pts[L.iMouth];
  const mt = L.tan[L.iMouth];
  const my = L.y[L.iMouth];
  // the trunk's axis stands behind the door by its own radius, less how far the bark stands out in front of the rock
  const c = { x: M.x + mt[0] * (TREE.R - TREE.front), z: M.z + mt[1] * (TREE.R - TREE.front) };
  return { M, mt, my, c, across: [-mt[1], mt[0]] as [number, number], yawIn: Math.atan2(mt[0], mt[1]) };
}

export function buildTree(mobile: boolean) {
  const F = treeFrame();
  const SEG = mobile ? 72 : 112;
  const ROWS = mobile ? 52 : 84;
  const y0 = F.my - 70;
  const door = Math.atan2(-F.mt[0], -F.mt[1]); // the direction the door faces, as an angle about the trunk (x, z)
  const pos: number[] = [];
  const idx: number[] = [];
  const kk: number[] = [];
  const radAt = (a: number, y: number) => {
    const h = y - y0;
    const t = h / (TREE.top - y0);
    // roots: great lobes at the foot, none where the door is, running down and out along the slope
    const lobe = Math.pow(0.5 + 0.5 * Math.cos(5 * (a - door) + Math.PI), 1.6) * (0.55 + 0.45 * noise2(a * 3.1 + 2, 0.4));
    const flare = (0.2 + 1.5 * lobe) * Math.exp(-h / 70) + 0.34 * Math.exp(-h / 260) * (0.4 + 0.6 * noise2(a * 1.7, 7));
    // the door's own side keeps a quiet face (a slight flare, framed by two roots)
    const quiet = Math.exp(-Math.pow((((a - door + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / 0.5, 2));
    // furrows: tall, deep, wandering with the height
    const fur = Math.pow(Math.abs(Math.sin(a * 17 + 3.2 * noise2(a * 2.1, y * 0.006) + y * 0.004)), 0.6);
    const bumps = noise2(a * 5.3 + 5, y * 0.012) - 0.5;
    const taper = 1 - 0.42 * Math.pow(t, 0.8);
    return TREE.R * taper * (1 + flare * (1 - 0.8 * quiet)) * (1 + 0.035 * (fur - 0.5) + 0.07 * bumps);
  };
  for (let r = 0; r <= ROWS; r++) {
    const t = r / ROWS;
    const y = y0 + (TREE.top - y0) * Math.pow(t, 1.7);
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const rad = radAt(a, y);
      // (it leans, a little, as a very old tree does)
      const lean = Math.sin((y - y0) * 0.0021 + 1.0) * 16 * Math.min(1, (y - y0) / 300);
      pos.push(F.c.x + Math.sin(a) * rad + lean * 0.4, y, F.c.z + Math.cos(a) * rad + lean);
      kk.push(0, t, a);
    }
  }
  for (let r = 0; r < ROWS; r++)
    for (let s = 0; s < SEG; s++) {
      const a = r * (SEG + 1) + s;
      const b = a + SEG + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  // limbs: great boughs going out from high on the trunk and up, tapering, losing themselves in the night
  const limbs: [number, number, number, number, number][] = [
    // angle about the trunk, height, length, thickness at the root, how far it climbs
    [door + 1.9, 520, 520, 34, 0.5],
    [door - 2.1, 640, 600, 38, 0.55],
    [door + 0.9, 760, 520, 28, 0.7],
    [door - 0.6, 860, 560, 30, 0.8],
    [door + 3.2, 700, 640, 36, 0.5],
    [door - 3.6, 930, 520, 26, 0.7],
  ];
  const LS = 16;
  const LC = mobile ? 7 : 9;
  limbs.forEach(([a, y, len, th, climb], li) => {
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const base = pos.length / 3;
    const rc = radAt(a, y) - 6;
    for (let i = 0; i <= LS; i++) {
      const t = i / LS;
      // out, and up, bending as it goes
      const out = len * t;
      const up = len * climb * Math.pow(t, 1.5) * 0.5 + 40 * Math.sin(t * 2.2 + li);
      const sway = Math.sin(t * 3.0 + li * 2.0) * 40 * t;
      const cx = F.c.x + dx * (rc + out) - dz * sway;
      const cz = F.c.z + dz * (rc + out) + dx * sway;
      const cy = y + up;
      const rad = th * (1 - 0.92 * Math.pow(t, 0.7)) * (1 + 0.8 * Math.exp(-t * 14));
      for (let j = 0; j <= LC; j++) {
        const q = (j / LC) * Math.PI * 2;
        const ox = Math.cos(q) * rad;
        const oy = Math.sin(q) * rad;
        pos.push(cx + (-dz) * ox, cy + oy, cz + dx * ox);
        kk.push(1, t, q);
      }
    }
    for (let i = 0; i < LS; i++)
      for (let j = 0; j < LC; j++) {
        const a0 = base + i * (LC + 1) + j;
        const b0 = a0 + LC + 1;
        idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
      }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aK", new THREE.Float32BufferAttribute(kk, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
export function makeTreeMaterial() {
  const F = treeFrame();
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...SKY_U,
      ...WORLD_U,
      ...FUNERAL_U,
      uDoor: { value: new THREE.Vector4(F.M.x, F.my, F.M.z, 0) },
      uIn: { value: new THREE.Vector2(F.mt[0], F.mt[1]) },
      uCt: { value: new THREE.Vector2(F.c.x, F.c.z) },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aK;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec3 vK;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vLocal = position; vN = normalize(mat3(modelMatrix) * normal); vK = aK;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec4 uDoor; uniform vec2 uIn; uniform vec2 uCt;
      varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec3 vK;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_FUNERAL_AIR}
      float archHalf(float y){
        float W = ${TREE.doorHalf.toFixed(1)}; float wall = ${TREE.doorWall.toFixed(1)}; float top = ${TREE.doorTop.toFixed(1)};
        return y <= wall ? W : W * sqrt(max(0.0, 1.0 - pow((y - wall) / (top - wall), 2.0)));
      }
      void main(){
        vec3 l = vLocal;
        vec2 rel = l.xz - uDoor.xz;
        float w = dot(rel, uIn);
        float u = dot(rel, vec2(-uIn.y, uIn.x));
        float y = l.y - uDoor.y;
        // the door: the arch, cut out of the bark where it faces the road
        float hw = archHalf(y);
        float inDoor = (y > -2.0 && w < -6.0 && w > -70.0) ? hw - abs(u) : -9.0;
        if (inDoor > 0.0) discard;
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(vWorld - cameraPosition);
        // the bark: long furrows running down, ridges between them that catch the light, plates split across
        float a = vK.z;
        float fur = vnoise(vec2((vK.x < 0.5 ? a * 14.0 : vK.z * 3.0) + vnoise(l.xz * 0.02 + l.y * 0.01) * 2.5, l.y * 0.012));
        float ridge = smoothstep(0.35, 0.8, fur);
        float split = vnoise(vec2(a * 40.0 + l.y * 0.03, l.y * 0.18));
        float pits = vnoise(l.xz * 0.9 + l.y * 0.7);
        vec3 alb = mix(vec3(0.009, 0.007, 0.012), vec3(0.04, 0.032, 0.036), ridge) * (0.7 + 0.6 * split) * (0.8 + 0.4 * pits);
        // lichen and moss in the furrows, faintly the night's green-blue
        float moss = smoothstep(0.55, 0.9, vnoise(l.xz * 0.05 + l.y * 0.04)) * smoothstep(0.55, 0.9, n.y + 0.2) ;
        alb = mix(alb, vec3(0.012, 0.045, 0.045), moss * 0.55);
        float lam = clamp(dot(n, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = alb * (uSkyCol * 1.5 * (0.6 + 0.4 * n.y) + uKeyCol * lam * lam * 0.7);
        // the moon's line of green-blue on every ridge that turns toward it
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.2);
        float toMoon = smoothstep(-0.2, 0.8, dot(n, uKeyDir));
        col += vec3(0.05, 0.32, 0.3) * fres * toMoon * (0.35 + 0.8 * ridge) * 0.55;
        // the light of the door, and of the crowd going in, on the bark and the roots round it: warm, close
        vec3 dc = vec3(uDoor.x, uDoor.y + 14.0, uDoor.z) - vec3(l.x, l.y, l.z);
        float dd = dot(dc, dc);
        col += (alb * 14.0 + vec3(0.01, 0.006, 0.004)) * vec3(1.0, 0.62, 0.28) * 120.0 / (dd + 120.0) * smoothstep(-0.2, 0.7, dot(n, normalize(dc))) * glowK() * 1.5 * (1.0 - smoothstep(60.0, 220.0, sqrt(dd)));
        // up in the night the trunk goes, pale with distance, into the mist
        col = funeralAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        ${END}
      }`,
  });
}
