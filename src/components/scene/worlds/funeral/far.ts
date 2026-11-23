import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";

// The far view: not one wall of mountains but ranges, one behind another to the end of sight, each paler and bluer
// than the one before it, each with a skirt of mist at its foot, so that the eye reads depth as the painters of the
// north do: by the steps of colour between ridges. They are painted on a shell round the eye (as the sky is) and
// all five are drawn in one pass, far to near; the real mountains of the world stand in front of them, so what is
// seen of them is only what the real ones leave open.
const END = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;
export function makeRangesMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: { ...SKY_U },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      void main(){
        vec3 d = normalize(vDir);
        float az = atan(d.x, -d.z);
        float el = asin(clamp(d.y, -1.0, 1.0));
        float toMoon = pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + vec3(1e-4)), normalize(vec3(uKeyDir.x, 0.0, uKeyDir.z) + vec3(1e-4))), 0.0), 2.0);
        vec3 acc = vec3(0.0);
        float a = 0.0;
        for (int i = 0; i < 5; i++) {
          float fi = float(i);
          float near = fi / 4.0;
          // the ridge: broad masses, a sharper ridged line over them, taller as they come nearer
          float f1 = fbm(vec2(az * (1.6 + fi * 0.7) + fi * 17.0, fi * 3.1));
          float f2 = 1.0 - abs(vnoise(vec2(az * (7.0 + fi * 3.0) + fi * 5.0, fi * 1.7)) * 2.0 - 1.0);
          float h = 0.05 + 0.06 * near + (f1 - 0.35) * (0.34 - 0.03 * fi) + f2 * 0.05 * (0.5 + near);
          float m = smoothstep(h + 0.003, h - 0.002, el) * step(-0.3, el);
          // far ranges are the sky's own colour and a little more; near ones sink into the night
          vec3 haze = uHorizon * (1.25 - 0.3 * near) + vec3(0.0, 0.012, 0.04) * (1.0 - near);
          vec3 body = mix(haze * 0.85, vec3(0.004, 0.01, 0.045), pow(near, 0.7) * 0.9);
          // the mist at each range's foot, glowing a little, and its crest lit from the moon's side
          float foot = smoothstep(h - 0.01, h - 0.15 - 0.05 * near, el);
          vec3 col = mix(body, haze * 1.1 + vec3(0.01, 0.03, 0.06), foot * (0.7 - 0.3 * near));
          col += vec3(0.04, 0.3, 0.3) * exp(-(h - el) * 220.0) * (0.15 + 0.85 * toMoon) * (0.3 + 0.7 * near) * step(el, h);
          acc = mix(acc, col, m);
          a = max(a, m);
        }
        gl_FragColor = vec4(acc, a);
        ${END}
      }`,
  });
}
