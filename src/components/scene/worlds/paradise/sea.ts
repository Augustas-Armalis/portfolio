import * as THREE from "three";
import { GLSL_NOISE } from "../../shared";
import { GLSL_SKY, SKY_U } from "../../sky";
import { GLSL_AIR, WORLD_U, type V3 } from "../kit";
import { heightGLSL, type WorldDef } from "../voyage";

// The sea of Paradise: endless, still, full of the sky. The cloud stands in it as long soft strokes of light
// drawn toward the eye; the sun lays a road of sparks across it; long low lines of ripple come in to the shore
// one behind another, as he drew them; and over the sand the water thins to nothing, a line of foam walking
// in and out along its edge. One sheet at the water's level; the ground under it is never drawn (so nothing
// can shimmer through it), its depth is read from the ground's own formula.
const v3 = (c: V3) => `vec3(${c.map((x) => x.toFixed(4)).join(", ")})`;
export function makeSea(o: { def: WorldDef; sand: V3; deep?: V3; shallow?: V3; tint?: V3; calm?: number }) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SKY_U, ...WORLD_U },
    vertexShader: /* glsl */ `
      varying vec3 vWorld; varying vec2 vLocal;
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vLocal = wp.xz - modelMatrix[3].xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec2 vLocal;
      ${GLSL_NOISE}
      ${GLSL_SKY}
      ${GLSL_AIR}
      ${heightGLSL(o.def.terrain)}
      void main(){
        vec3 dv = vWorld - cameraPosition;
        float dist = length(dv);
        vec3 V = -dv / dist;
        vec2 q = vLocal;
        float bed = terrainH(q);
        if (bed > 0.35) discard;
        float depth = max(-bed, 0.0);
        float t = uTime;
        // small ripples, flattening with distance; and the long low swell that comes in to the shore
        vec2 fl = vec2(t * 0.05, t * 0.03);
        float e = 0.4;
        float h0 = fbm(q * 0.1 + fl) + 0.4 * fbm(q * 0.55 - fl * 2.6);
        float hx = fbm((q + vec2(e, 0.0)) * 0.1 + fl) + 0.4 * fbm((q + vec2(e, 0.0)) * 0.55 - fl * 2.6);
        float hz = fbm((q + vec2(0.0, e)) * 0.1 + fl) + 0.4 * fbm((q + vec2(0.0, e)) * 0.55 - fl * 2.6);
        float calm = ${(o.calm ?? 0.5).toFixed(2)} / (1.0 + dist * 0.01);
        float r = length(q);
        float shoreK = exp(-depth * 0.09);
        float wob = vnoise(q * 0.012) * 5.0 + vnoise(q * 0.05) * 1.2;
        float lines = sin(depth * 1.15 - t * 0.45 + wob);
        vec3 n = normalize(vec3((h0 - hx) * 1.4 * calm, 1.0, (h0 - hz) * 1.4 * calm) + vec3(q.x, 0.0, q.y) / max(r, 1.0) * lines * 0.02 * shoreK);
        vec3 R = reflect(-V, n);
        R.y = abs(R.y) + 0.002;
        R = normalize(R);
        vec3 sky = skyBase(R) * ${v3(o.tint ?? [1, 1, 1])};
        // the cloud in the water: long soft strokes of its light, drawn out toward the eye
        vec2 toEye = normalize(q - (cameraPosition.xz - (vWorld.xz - vLocal)) + vec2(1e-4));
        float lat = dot(q, vec2(-toEye.y, toEye.x));
        float alongD = dot(q, toEye);
        float stroke = vnoise(vec2(lat * 0.016, alongD * 0.0022 + 3.0)) * 0.6 + vnoise(vec2(lat * 0.05 + 9.0, alongD * 0.006)) * 0.4;
        stroke = smoothstep(0.5, 0.74, stroke + (h0 - 0.7) * 0.25);
        sky = mix(sky, uCloudLit * 0.9, stroke * 0.42 * smoothstep(0.02, 0.2, R.y) * (1.0 - smoothstep(0.35, 0.9, R.y)));
        // the sun's road: a broad soft path and, in it, sparks that come and go along the ripples
        float sunUp = smoothstep(-0.03, 0.05, uSunDir.y);
        float sd = max(dot(R, uSunDir), 0.0);
        float spark = smoothstep(0.6, 0.82, vnoise(q * vec2(0.5, 0.5) + vec2(t * 0.5, -t * 0.3)) * 0.6 + vnoise(q * 1.7 - t * 0.4) * 0.4);
        vec2 sh = normalize(uSunDir.xz + vec2(1e-4));
        float offRoad = dot(normalize(dv.xz + vec2(1e-4)), vec2(-sh.y, sh.x)) * 3.2;
        float road = exp(-offRoad * offRoad) * smoothstep(0.0, 0.3, dot(normalize(dv.xz + vec2(1e-4)), sh));
        sky += mix(uGlow, vec3(1.0), 0.4) * (pow(sd, 260.0) * 14.0 + pow(sd, 24.0) * 0.5 + road * spark * 1.7 * (0.25 + 0.75 * smoothstep(120.0, 900.0, dist))) * sunUp;
        float fres = 0.04 + 0.96 * pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 5.0);
        // the body of the water: over sand it is the sand's own gold going to green, then deep
        vec3 light = uSkyCol * 0.7 + uKeyCol * (0.22 + 0.5 * max(uKeyDir.y, 0.0)) * sunUp;
        vec3 sand = ${v3(o.sand)} * light * 0.86;
        vec3 body = mix(sand, ${v3(o.shallow ?? [0.2, 0.32, 0.2])} * light, smoothstep(0.0, 3.0, depth));
        body = mix(body, ${v3(o.deep ?? [0.05, 0.1, 0.1])} * (uSkyCol * 2.0 + 0.12), smoothstep(2.0, 16.0, depth));
        vec3 col = mix(body, sky, clamp(fres * 0.86 + 0.14 * smoothstep(0.0, 4.0, depth), 0.0, 1.0));
        // long pale lines of ripple coming in, one behind another, fainter the further out
        float line = pow(0.5 + 0.5 * lines, 10.0) * shoreK * smoothstep(0.15, 1.2, depth) * (0.55 + 0.45 * vnoise(q * 0.3 + t * 0.1));
        col += uCloudLit * line * 0.3;
        // the edge: the water thins to nothing over the sand, and a line of foam walks in and out
        float lap = 0.16 + 0.13 * sin(t * 0.55 + wob * 1.3) + (h0 - 0.7) * 0.1;
        float foam = (1.0 - smoothstep(0.0, 0.3, abs(depth - lap) + (vnoise(q * 0.9 + t * 0.2) - 0.5) * 0.16)) * 0.7 + (1.0 - smoothstep(0.0, lap, depth)) * 0.25;
        col = mix(col, sand, 1.0 - smoothstep(0.0, 0.55, depth));
        col = mix(col, vec3(1.0, 0.98, 0.9) * (uSkyCol + uKeyCol * 0.3), clamp(foam, 0.0, 1.0) * step(-0.05, depth) * 0.75);
        col = applyAir(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
