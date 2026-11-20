import * as THREE from "three";
import { loader } from "./Overlays";
import { clamp01, smooth } from "./shared";
import type { SkyState } from "./sky";

// The in-canvas half of the loader: one fullscreen material, drawn over the
// finished frame (postCtl.overlay), that holds the darkness, the hairline, the
// first light and the lifting of the dark, all from uniforms. While the DOM
// loader is up it draws the very same frame underneath it (same black, same
// line, taken from the DOM element's own box), so when the DOM layer lets go
// nothing on screen changes. Then:
//   the line runs out to both edges of the screen and is the horizon (it is
//   pinned to the camera's real horizon from then on, so it stays on it as the
//   camera tips down);
//   light gathers along it, in the colour of that hour's sky: gold at dusk,
//   pale at noon, moon-blue at night;
//   the dark thins from the horizon outward, a wide soft gradient, never an edge.
// Colours are display-referred sRGB, premultiplied.

export const LOADER_T = { extend: 1.0, openAt: 0.3, open: 2.5, total: 3.4 };

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform vec4 uLine;   // x0, x1, centre y from the top, thickness: buffer px
uniform float uShift; // how far the horizon has risen from the line's first place, buffer px
uniform float uExtend; uniform float uOpen; uniform float uGlow; uniform float uLineA;
uniform vec3 uTint;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float dy = p.y - (uLine.z - uShift);
  float ady = abs(dy);
  float H = uRes.y;
  float live = step(0.0005, uOpen + uGlow);
  float n = (hash(gl_FragCoord.xy) - 0.5) * live;

  // the dark, lifting from the horizon outward
  float e = uOpen * 2.2;
  float dark = smoothstep(e - 1.0, e, ady / H + n * 0.012);
  dark *= 1.0 - smoothstep(0.8, 1.0, uOpen);

  // the hairline: the progress segment, then out to the edges
  float cx = (uLine.x + uLine.y) * 0.5;
  float seg = (uLine.y - uLine.x) * 0.5;
  float hw = mix(seg, uRes.x * 0.5 + 2.0, uExtend);
  float ax = abs(p.x - cx);
  float tip = mix(1.0, uRes.x * 0.16, smoothstep(0.0, 0.25, uExtend) * (1.0 - smoothstep(0.75, 1.0, uExtend)));
  float inX = clamp((hw - ax) / tip + 0.5, 0.0, 1.0);
  // exactly the DOM hairline at first; once it runs out it takes a soft profile, so it can ride the horizon between pixels without shimmering
  float box = clamp(uLine.w * 0.5 + 0.5 - ady, 0.0, 1.0);
  float soft = exp(-ady * ady / (0.9 * uLine.w * uLine.w));
  float line = mix(box, soft, smoothstep(0.0, 0.4, uExtend)) * inX * uLineA;

  // first light along it: a tight core, a soft body and a wide breath
  float gx = 1.0 - smoothstep(hw * 0.35, hw * 1.2 + 1.0, ax);
  gx *= mix(1.0, 0.72, clamp(ax / (uRes.x * 0.5), 0.0, 1.0));
  float up = dy < 0.0 ? 1.0 : 0.62; // a little more above the horizon than below
  float g = (0.26 * exp(-ady / (0.006 * H)) + 0.3 * exp(-ady / (0.035 * H)) + 0.16 * exp(-ady / (0.16 * H) * (dy < 0.0 ? 1.0 : 1.6))) * up;
  vec3 light = uTint * g * gx * uGlow;

  vec3 bg = vec3(5.0, 5.0, 6.0) / 255.0;
  vec3 col = bg * dark * (1.0 - line) + vec3(line) + light + n / 255.0;
  float a = dark + line * (1.0 - dark);
  gl_FragColor = vec4(max(col, 0.0), clamp(a, 0.0, 1.0));
}`;

export type LoaderOverlay = {
  mat: THREE.ShaderMaterial;
  // t: seconds since the reveal began (negative: still loading). Returns false once there is nothing left to draw.
  update: (t: number, cam: THREE.PerspectiveCamera, size: { width: number; height: number; left: number; top: number }, buf: THREE.Vector2) => boolean;
  tint: (s: SkyState) => void;
  dispose: () => void;
};

const fwd = new THREE.Vector3();

// `rate`: how much faster than written the opening plays (a phone's is quicker)
export function makeLoaderOverlay(rate = 1): LoaderOverlay {
  const u = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uLine: { value: new THREE.Vector4(0, 1, 0.5, 1) },
    uShift: { value: 0 },
    uExtend: { value: 0 },
    uOpen: { value: 0 },
    uGlow: { value: 0 },
    uLineA: { value: 1 },
    uTint: { value: new THREE.Color(1, 0.93, 0.82) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return {
    mat,
    update(t, cam, size, buf) {
      if (t > 0) t *= rate;
      const k = buf.y / Math.max(1, size.height); // buffer px per CSS px
      u.uRes.value.copy(buf);
      const l = t < 0.5 ? loader.measure() : loader.line;
      if (l) {
        // on the pixel grid, as the browser snaps the DOM line
        const th = Math.max(1, Math.round(l.height * k));
        u.uLine.value.set(Math.round((l.left - size.left) * k), Math.round((l.right - size.left) * k), Math.round((l.top - size.top) * k) + th / 2, th);
      }
      else u.uLine.value.set(buf.x / 2 - 180 * k, buf.x / 2 + 180 * k, Math.floor(size.height / 2) * k + k / 2, Math.max(1, k));
      // where the true horizon is now, relative to where the camera began (level: dead centre)
      cam.getWorldDirection(fwd);
      const pitch = Math.asin(THREE.MathUtils.clamp(-fwd.y, -1, 1));
      u.uShift.value = t <= 0 ? 0 : (Math.tan(pitch) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * (buf.y / 2);
      const T = LOADER_T;
      const x = clamp01(t / T.extend);
      u.uExtend.value = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      u.uOpen.value = smooth(clamp01((t - T.openAt) / T.open));
      u.uGlow.value = 0.6 * smooth(clamp01((t - 0.15) / 0.9)) * (1 - smooth(clamp01((t - 1.1) / 1.5)));
      u.uLineA.value = 1 - smooth(clamp01((t - 0.8) / 1.0));
      return t < T.total;
    },
    // the light takes the colour of the hour's horizon, lifted to a luminous tint
    tint(s) {
      const c = s.horizon.clone().lerp(s.glow, s.night > 0.5 ? 0 : 0.4);
      const m = Math.max(c.r, c.g, c.b, 1e-4);
      c.multiplyScalar(1 / m);
      // toward white by day, held saturated at dusk and at night
      const day = THREE.MathUtils.smoothstep(s.elev, 8, 30);
      c.lerp(new THREE.Color(1, 0.95, 0.86), 0.25 + 0.4 * day);
      c.multiplyScalar(1 - 0.35 * s.night - 0.18 * day);
      u.uTint.value.copy(c);
    },
    dispose: () => mat.dispose(),
  };
}
