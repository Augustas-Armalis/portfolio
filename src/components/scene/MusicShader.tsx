"use client";

import { useEffect, useRef } from "react";
import { getAnalyser } from "@/lib/audio";

// Audio-reactive background. One fullscreen triangle in raw WebGL (no three),
// drawn at a reduced resolution because the image is soft anyway.
// Silent: slow light ribbons drifting over a deep night gradient, with faint
// rain. Playing: bass swells the ribbons, highs light up the rain.
//
//   <div className="absolute inset-0"><MusicShader palette="night" /></div>
//
// It fills its positioned parent and ignores pointer events.

type Palette = "night" | "dusk";

const PALETTES: Record<Palette, number[][]> = {
  // top, bottom, ribbon A, ribbon B, rain
  night: [
    [0.035, 0.07, 0.16],
    [0.006, 0.012, 0.035],
    [0.2, 0.42, 1.0],
    [0.55, 0.85, 1.0],
    [0.6, 0.72, 1.0],
  ],
  dusk: [
    [0.13, 0.08, 0.2],
    [0.03, 0.02, 0.06],
    [1.0, 0.48, 0.32],
    [0.72, 0.42, 1.0],
    [1.0, 0.8, 0.75],
  ],
};

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uBass; uniform float uMid; uniform float uHigh; uniform float uI;
uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uRa; uniform vec3 uRb; uniform vec3 uRain;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float bass = uBass * uI, high = uHigh * uI, mid = uMid * uI;
  vec3 col = mix(uBot, uTop, smoothstep(-0.7, 0.8, p.y + fbm(p * 1.3 + t * 0.02) * 0.25));

  // light ribbons
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float s = t * (0.05 + fi * 0.012);
    float y = -0.22 + fi * 0.13
      + sin(p.x * (1.1 + fi * 0.3) + s * 3.0 + fi * 1.7) * 0.09
      + (fbm(vec2(p.x * 0.9 + fi * 3.1, s)) - 0.5) * 0.35;
    float d = abs(p.y - y);
    float w = 0.006 + fi * 0.002 + bass * 0.03;
    float core = w / (d + w);
    float glow = pow(core, 2.0) + 0.25 * exp(-d * (9.0 - bass * 4.0));
    float shimmer = 0.6 + 0.4 * sin(p.x * 5.0 - t * (0.6 + fi * 0.2) + fi * 2.0 + mid * 3.0);
    vec3 rc = mix(uRa, uRb, fi / 3.0);
    col += rc * glow * shimmer * (0.16 + 0.55 * bass + 0.1 * mid) * (1.0 - fi * 0.15);
  }

  // rain: thin falling streaks in sparse columns
  float cols = 90.0;
  float cx = floor(uv.x * cols);
  float r = hash(vec2(cx, 3.7));
  float fx = abs(fract(uv.x * cols) - 0.5);
  float speed = 0.18 + r * 0.25;
  float ph = fract(uv.y * (0.7 + r * 0.6) + t * speed + r * 9.0);
  float streak = smoothstep(0.0, 0.015, ph) * (1.0 - smoothstep(0.015, 0.16, ph)) * (1.0 - smoothstep(0.03, 0.09, fx));
  col += uRain * streak * step(0.62, r) * (0.035 + 0.35 * high) * (0.5 + 0.5 * uv.y);

  // soft vignette and grain
  vec2 v = uv - 0.5;
  col *= 1.0 - dot(v, v) * 0.9;
  col += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.012;
  col = col / (1.0 + col * 0.35);
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

export default function MusicShader({ intensity = 1, palette = "night" }: { intensity?: number; palette?: Palette }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const props = useRef({ intensity, palette });
  props.current = { intensity, palette };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, depth: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = { res: u("uRes"), time: u("uTime"), bass: u("uBass"), mid: u("uMid"), high: u("uHigh"), i: u("uI"), top: u("uTop"), bot: u("uBot"), ra: u("uRa"), rb: u("uRb"), rain: u("uRain") };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const analyser = getAnalyser();
    const bins = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    const lvl = { bass: 0, mid: 0, high: 0 };
    const band = (a: number, b: number) => {
      if (!bins) return 0;
      let s = 0;
      for (let i = a; i < b; i++) s += bins[i];
      return s / ((b - a) * 255);
    };
    const follow = (k: "bass" | "mid" | "high", v: number) => {
      lvl[k] += (v - lvl[k]) * (v > lvl[k] ? 0.45 : 0.06);
    };

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1) * 0.7;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    const t0 = performance.now();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (analyser && bins) {
        analyser.getByteFrequencyData(bins);
        // ~47 Hz per bin at 48 kHz: bass 50-250 Hz, mid 250-1.2k, high 1.2-4.5k
        follow("bass", Math.min(1, band(1, 6) * 1.4));
        follow("mid", Math.min(1, band(6, 26) * 1.6));
        follow("high", Math.min(1, band(26, 96) * 2.4));
      }
      const pal = PALETTES[props.current.palette];
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, ((performance.now() - t0) / 1000) * (reduced ? 0.3 : 1));
      gl.uniform1f(U.bass, lvl.bass);
      gl.uniform1f(U.mid, lvl.mid);
      gl.uniform1f(U.high, lvl.high);
      gl.uniform1f(U.i, props.current.intensity);
      gl.uniform3fv(U.top, pal[0]);
      gl.uniform3fv(U.bot, pal[1]);
      gl.uniform3fv(U.ra, pal[2]);
      gl.uniform3fv(U.rb, pal[3]);
      gl.uniform3fv(U.rain, pal[4]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
