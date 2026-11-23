import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U } from "../kit";
import { FRIEND_U, GLSL_ORB } from "./cave";
import { ORB, PAINT } from "./shape";

// Her, as he painted her: the figure, the hand and the crown of rays are the picture's own pixels, cut out of
// friendship.jpg and laid on a relief (camera projection, the matte painter's way): his strokes, his colours, the
// exact profile and fingers. The relief is gently curved and pressed forward where she comes toward us (the hand,
// the forearm, the face) and back where she goes away (the back of her head, the body falling into the dark), and
// a little by the paint's own light, so the plane's movement gives it depth without a seam.
//
//   the figure   one mesh, cut by a painted mask: drawn twice, the solid heart (writes depth) and the soft edge
//                (blended, writes none), so the edge is soft and nothing behind it shows through the heart
//   the crown    the rays keyed out of the dark by their own brightness and added: no edge at all to cut

const W = PAINT.w;
const H = PAINT.h;
const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

// The cut, in the picture's pixels (traced over a grid laid on the painting): from the finger-tips on the orb along
// the hand, the forearm and the near shoulder to the chin, up the profile (lips, nose, brow, forehead) over the
// crown to the right edge, down it, and back along the robe's edge under the arm to the hand.
const OUTLINE: [number, number][] = [
  [292, 872],
  [312, 856],
  [340, 846],
  [372, 838],
  [398, 852],
  [438, 868],
  [482, 864],
  [534, 832],
  [604, 803],
  [688, 772],
  [726, 746],
  [742, 728],
  [741, 716],
  [728, 706],
  [716, 690],
  [712, 672],
  [706, 655],
  [702, 640],
  [692, 626],
  [680, 612],
  [668, 598],
  [670, 588],
  [690, 566],
  [712, 540],
  [734, 516],
  [750, 492],
  [756, 466],
  [760, 432],
  [770, 398],
  [792, 366],
  [836, 340],
  [904, 322],
  [1000, 328],
  [1100, 356],
  [1200, 396],
  [1290, 426],
  [1290, 1490],
  [700, 1490],
  [664, 1290],
  [584, 1094],
  [484, 984],
  [384, 928],
  [322, 908],
  [296, 892],
];

// the mask, painted once into a canvas: the outline filled and softened
export function maskTexture() {
  const s = 0.5;
  const c = document.createElement("canvas");
  c.width = Math.round(W * s);
  c.height = Math.round(H * s);
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.filter = "blur(5px)";
  g.fillStyle = "#fff";
  g.beginPath();
  OUTLINE.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// the relief: a grid over the picture, its vertices carried to the picture's pixels in the shader
export function reliefGeometry(nx: number, ny: number) {
  const g = new THREE.PlaneGeometry(1, 1, nx, ny);
  g.translate(0.5, 0.5, 0);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(ORB.x + (W / 2 - PAINT.cx) * PAINT.s, ORB.y, 0), Math.hypot(W, H) * PAINT.s * 0.6 + 60);
  return g;
}

// where a pixel of the picture stands, and how far forward (the same in every pass)
const GLSL_PLACE = /* glsl */ `
uniform sampler2D tMap; uniform sampler2D tMask; uniform float uLayer;
float capsule(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec2 pxOf(vec2 uv){ return vec2(uv.x * ${W.toFixed(1)}, (1.0 - uv.y) * ${H.toFixed(1)}); }
float reliefZ(vec2 px, float lum){
  if (uLayer > 0.5) {
    // the crown leans back and away as it rises
    return -12.0 - 26.0 * (1.0 - clamp(px.y / 480.0, 0.0, 1.0)) - 10.0 * clamp((px.x - 800.0) / 480.0, 0.0, 1.0);
  }
  // the picture plane, bowed: her back and the right edge go away into the dark
  float x = (px.x - 640.0) / 640.0;
  float z = -2.0 - 6.0 * x * x - 8.0 * clamp(x, 0.0, 1.0);
  // the body falls back below the arm
  z -= 14.0 * clamp((px.y - 1000.0) / 480.0, 0.0, 1.0);
  // the forearm and the hand come forward; the hand most, round the orb
  // (the hand holds the orb from below and in front: it must stand clear of the orb's own surface, which comes
  // nearly thirty metres toward the eye where the fingers lie on it)
  float arm = 1.0 - smoothstep(40.0, 150.0, capsule(px, vec2(470.0, 905.0), vec2(830.0, 1140.0)));
  float along = clamp((830.0 - px.x) / 360.0, 0.0, 1.0);
  z += arm * mix(3.0, 9.0, along);
  z += 3.0 * (1.0 - smoothstep(60.0, 170.0, length((px - vec2(360.0, 880.0)) * vec2(1.0, 1.4))));
  // the face forward of the skull, the knot of hair at the back behind it
  z += 5.0 * (1.0 - smoothstep(20.0, 140.0, capsule(px, vec2(700.0, 470.0), vec2(720.0, 720.0))));
  z -= 9.0 * (1.0 - smoothstep(40.0, 160.0, length(px - vec2(1240.0, 600.0))));
  // and a little by the paint itself: light strokes stand out
  return z + (lum - 0.25) * 1.6;
}
vec3 placeOf(vec2 px, float lum){
  return vec3(${ORB.x.toFixed(1)} + (px.x - ${PAINT.cx.toFixed(1)}) * ${PAINT.s.toFixed(5)}, ${ORB.y.toFixed(1)} + (${PAINT.cy.toFixed(1)} - px.y) * ${PAINT.s.toFixed(5)}, reliefZ(px, lum));
}
`;

// pass: 0 the figure's solid heart, 1 its soft edge, 2 the crown
export function makePaintedMaterial(map: THREE.Texture, mask: THREE.Texture, pass: 0 | 1 | 2) {
  return new THREE.ShaderMaterial({
    transparent: pass > 0,
    depthWrite: pass === 0,
    blending: pass === 2 ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    uniforms: { ...SKY_U, ...WORLD_U, ...FRIEND_U, tMap: { value: map }, tMask: { value: mask }, uLayer: { value: pass === 2 ? 1 : 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld;
      ${GLSL_PLACE}
      void main(){
        vUv = position.xy;
        vec3 c = textureLod(tMap, vUv, 3.0).rgb;
        vec3 p = placeOf(pxOf(vUv), dot(c, vec3(0.3, 0.55, 0.15)));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vWorld;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${GLSL_ORB}
      ${GLSL_PLACE}
      void main(){
        vec2 px = pxOf(vUv);
        vec3 col = texture2D(tMap, vUv).rgb;
        float lum = dot(col, vec3(0.3, 0.55, 0.15));
        ${
          pass === 2
            ? `// the rays: whatever is brighter than the dark they stream through, in the crown's own corner
               float region = smoothstep(680.0, 780.0, px.x) * (1.0 - smoothstep(400.0, 500.0, px.y + (px.x - 900.0) * 0.18));
               float edge = smoothstep(0.0, 60.0, px.y) * smoothstep(${W.toFixed(1)}, ${(W - 50).toFixed(1)}, px.x);
               float key = smoothstep(0.05, 0.2, lum - 0.06);
               // (a slow brightening running out along them)
               float run = 0.8 + 0.35 * sin(length(px - vec2(860.0, 420.0)) * 0.025 - uTime * 0.8);
               vec3 c = max(col - vec3(0.05, 0.06, 0.04), 0.0) * key * region * edge * run * 6.0;
               c *= 1.0 - 0.7 * airAmt(vWorld);
               gl_FragColor = vec4(c, 1.0);`
            : `float a = texture2D(tMask, vUv).r;
               // she goes into the dark at the bottom and at the picture's right edge
               a *= smoothstep(${H.toFixed(1)}, 1260.0, px.y) * smoothstep(${W.toFixed(1)}, 1040.0, px.x);
               // over the orb only the dark of her fingers is hers, not the orb's cream between them
               float onOrb = 1.0 - smoothstep(${(PAINT.r - 6).toFixed(1)}, ${(PAINT.r + 8).toFixed(1)}, length(px - vec2(${PAINT.cx.toFixed(1)}, ${PAINT.cy.toFixed(1)})));
               a *= mix(1.0, 1.0 - smoothstep(0.2, 0.42, lum), onOrb);
               ${pass === 0 ? "if (a < 0.985) discard;" : "if (a >= 0.985 || a < 0.004) discard;"}
               // the orb warms what is near it a little more than he did, and the air lies over the far parts
               float od = length(vWorld - uOrb);
               col *= 1.15 + 0.5 / (1.0 + pow(od / 55.0, 2.0));
               col = mix(col, airCol(normalize(vWorld - cameraPosition)), airAmt(vWorld) * 0.45) + orbScatter(vWorld) * 0.5;
               gl_FragColor = vec4(col, ${pass === 0 ? "1.0" : "a"});`
        }
        ${END}
      }`,
  });
}
