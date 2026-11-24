"use client";

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TRACK, geist } from "./font";
import { BOOT } from "./shared";
import { SYSTEM_FONT, appleInk } from "../Mark";

const { sunR, sunY, gap, lineH, lineHalf, barY, barW, barH } = BOOT;

// The boot mark and bar, drawn in CSS px from the viewport centre, the same
// numbers the 3D screen shader uses.
function BootMark({ w, h, color, track, prog }: { w: number; h: number; color: string; track: string; prog: number }) {
  const ink = appleInk();
  const fs = ink.ok ? BOOT.logoH / (ink.a + ink.d) : 0;
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden>
      {ink.ok ? (
        // the Apple logo from the system font, set by its ink: the same box the 3D screen draws its texture in
        <text x={(-(ink.l + ink.r) / 2 + ink.l) * fs} y={(-(ink.a + ink.d) / 2 + ink.a) * fs} fontSize={fs} fill={color} style={{ fontFamily: SYSTEM_FONT }}>
          {"\uF8FF"}
        </text>
      ) : (
        <>
          {/* the half-sun on its horizon */}
          <path d={`M${-sunR} ${sunY}A${sunR} ${sunR} 0 0 1 ${sunR} ${sunY}Z`} fill={color} />
          <rect x={-lineHalf} y={sunY + gap} width={lineHalf * 2} height={lineH} rx={lineH / 2} fill={color} />
        </>
      )}
      <rect x={-barW / 2} y={barY - barH / 2} width={barW} height={barH} rx={barH / 2} fill={track} />
      <rect
        x={-barW / 2}
        y={barY - barH / 2}
        width={Math.max(barH, barW * prog)}
        height={barH}
        rx={barH / 2}
        fill={color}
        style={{ transition: "width 500ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
    </svg>
  );
}

function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

// Takes over from the 3D screen the moment the glass covers the viewport:
// identical black frame, then the mark lifts away and the login fades up.
export function BootVeil({ onDone }: { onDone: () => void }) {
  const [ref, box] = useBox();
  return (
    <motion.div
      ref={ref}
      className="pointer-events-none fixed inset-0 z-[6000] bg-black"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: 0.5, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      onAnimationComplete={onDone}
    >
      {box.w > 0 && (
        <motion.div className="absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 0.14, duration: 0.34, ease: [0.4, 0, 1, 1] }}>
          <BootMark w={box.w} h={box.h} color="#ffffff" track="rgba(255,255,255,0.2)" prog={1} />
        </motion.div>
      )}
    </motion.div>
  );
}

// ---------- the loader ----------
//
// Darkness, and the mark of the OS being made out of light: one hairline, the
// horizon, drawn across by real loading progress, and over its middle the
// half-sun rising out of it as the same progress climbs. His name and the
// hour sit under the line. This DOM layer is in
// the server-rendered HTML, so it paints before any script runs, and its line
// runs as a CSS transition on the compositor, so it keeps gliding while the
// main thread compiles shaders. When the world is ready the canvas is already
// drawing the very same frame underneath (scene/Loader.tsx: same black, same
// line, read from this element's own box), this layer lets go, and the rest
// (the line running out to the edges, first light along it, the dark lifting)
// happens inside the canvas.

type LoaderPhase = "load" | "open" | "fade" | "gone";
const subs = new Set<() => void>();
// While loading, the shown progress eases on toward a little short of the end, never more than a fifth ahead of
// the real progress, and slower the nearer it gets: it keeps moving, but never claims done before it is.
let creeping = false;
function creep() {
  if (creeping || typeof window === "undefined") return;
  creeping = true;
  let last = performance.now();
  const step = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (loader.phase !== "load" || loader.progress >= 0.985) {
      creeping = false;
      return;
    }
    const ceil = Math.min(0.97, loader.real + 0.2 + 0.1 * loader.real);
    if (loader.progress < ceil) {
      loader.progress += (ceil - loader.progress) * (1 - Math.exp(-dt / 2.6));
      subs.forEach((f) => f());
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
export const loader = {
  progress: 0,
  phase: "load" as LoaderPhase,
  // where the hairline sits, in CSS px: the canvas draws its own from this
  line: null as { left: number; right: number; top: number; height: number } | null,
  el: null as HTMLElement | null,
  // when everything is ready: the line is across and it waits for a click (sound may only begin with one)
  prompt: null as string | null,
  ask(text: string | null) {
    loader.prompt = text;
    subs.forEach((f) => f());
  },
  measure() {
    const r = loader.el?.getBoundingClientRect();
    if (r && r.width > 0) loader.line = { left: r.left, right: r.right, top: r.top, height: r.height };
    return loader.line;
  },
  // progress only ever moves forward. What is shown is the real progress, but never standing still: between
  // reports it creeps on by itself (see creep()), so the line and the count run instead of waiting on a step.
  real: 0,
  set(p: number) {
    if (p <= loader.real) return;
    loader.real = Math.min(1, p);
    creep();
    if (loader.real > loader.progress) {
      loader.progress = loader.real;
      subs.forEach((f) => f());
    }
  },
  // "open": the canvas takes over (cinematic); "fade": a plain dissolve (no intro)
  finish(how: "open" | "fade") {
    if (loader.phase !== "load") return;
    loader.progress = 1;
    loader.phase = how;
    subs.forEach((f) => f());
  },
  reset() {
    loader.real = 0;
    loader.progress = 0;
    loader.phase = "load";
    loader.prompt = null;
    subs.forEach((f) => f());
  },
};
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __loader: loader });
// (the count starts moving from the first frame, before the scene has reported anything)
if (typeof window !== "undefined") queueMicrotask(creep);

// The loading moment: dusk over the sea. A dark sky full of small stars, the
// mountains' line along the horizon, and on the horizon the mark of the OS: a
// half-sun that rises out of the water as real progress climbs, its light
// spreading up the sky in soft rays and down the water in a broken path. The
// hairline of the horizon is the progress itself. Motes of light drift up.
// Everything here is HTML and CSS in the server-rendered page (it paints before
// any script, and its motion runs on the compositor while the main thread
// compiles shaders); the stars are box-shadows from a fixed seed.
function starField(seed: number, n: number, bright: number) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 100;
    const y = -Math.pow(r(), 0.8) * 50;
    // fainter toward the horizon, where the air is thick
    const a = (0.25 + 0.75 * r()) * bright * Math.min(1, -y / 9);
    const big = r() < 0.12 ? 0.6 : 0;
    const warm = r();
    const c = warm < 0.2 ? "255 232 200" : warm > 0.8 ? "205 222 255" : "255 255 255";
    out.push(`${x.toFixed(2)}vw ${y.toFixed(2)}vh 0 ${big}px rgb(${c}/${a.toFixed(2)})`);
  }
  return out.join(",");
}
const MOTES = Array.from({ length: 16 }, (_, i) => {
  const k = (i * 0.618034) % 1;
  const j = (i * 0.754877) % 1;
  return { left: (k - 0.5) * 78, dur: 9 + j * 9, delay: -(k * 17), size: 1.5 + ((i * 7) % 5) * 0.45, drift: (j - 0.5) * 60, rise: 26 + k * 30 };
});
const LOADER_CSS = `
@keyframes ld-first{from{transform:scaleX(0)}to{transform:scaleX(.08)}}
.ld-fill{transform-origin:0 50%;transform:scaleX(0);animation:ld-first 1.6s cubic-bezier(.23,1,.32,1) both;transition:transform .7s cubic-bezier(.23,1,.32,1),opacity .28s linear;will-change:transform}
@keyframes ld-dawn{from{transform:translateY(101%)}to{transform:translateY(84%)}}
.ld-sun{transform:translateY(101%);animation:ld-dawn 1.6s cubic-bezier(.23,1,.32,1) both;transition:transform .7s cubic-bezier(.23,1,.32,1);will-change:transform}
.ld-fade{transition:opacity .5s cubic-bezier(.4,0,.2,1),transform .6s cubic-bezier(.23,1,.32,1),filter .6s cubic-bezier(.23,1,.32,1)}
@keyframes ld-up{from{opacity:0}to{opacity:1}}
.ld-sky{animation:ld-up 1.2s cubic-bezier(.23,1,.32,1) both}
.ld-glow{transition:opacity .9s cubic-bezier(.23,1,.32,1);will-change:opacity}
.ld-halo{opacity:0;transition:opacity .9s cubic-bezier(.23,1,.32,1)}
.ld-type{transition:opacity .7s cubic-bezier(.23,1,.32,1),filter .7s cubic-bezier(.23,1,.32,1),transform .7s cubic-bezier(.23,1,.32,1)}
@keyframes ld-enter{from{opacity:0;transform:translateY(6px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
.ld-enter{animation:ld-enter .9s .25s cubic-bezier(.23,1,.32,1) both}
.ld-enter2{animation:ld-enter .9s .45s cubic-bezier(.23,1,.32,1) both}
@keyframes ld-breathe{0%,100%{opacity:.55}50%{opacity:1}}
.ld-ask{animation:ld-breathe 2.4s cubic-bezier(.45,0,.55,1) infinite}
@keyframes ld-twinkle{0%,100%{opacity:.45}50%{opacity:1}}
.ld-stars{position:absolute;left:50%;top:50%;width:1px;height:1px;border-radius:50%;background:transparent}
.ld-s1{box-shadow:${starField(7, 70, 0.75)};animation:ld-twinkle 4.3s cubic-bezier(.45,0,.55,1) infinite}
.ld-s2{box-shadow:${starField(131, 60, 0.6)};animation:ld-twinkle 6.1s 1.3s cubic-bezier(.45,0,.55,1) infinite}
.ld-s3{box-shadow:${starField(977, 44, 0.9)};animation:ld-twinkle 3.1s .6s cubic-bezier(.45,0,.55,1) infinite}
@keyframes ld-turn{to{transform:rotate(360deg)}}
.ld-rays{animation:ld-turn 140s linear infinite;will-change:transform}
@keyframes ld-shimmer{0%,100%{transform:translateX(-50%) scaleX(1)}50%{transform:translateX(-50%) scaleX(1.12)}}
.ld-path{animation:ld-shimmer 5.5s cubic-bezier(.45,0,.55,1) infinite}
@keyframes ld-mote{0%{transform:translate3d(0,0,0);opacity:0}12%{opacity:var(--o)}80%{opacity:var(--o)}100%{transform:translate3d(var(--dx),var(--dy),0);opacity:0}}
.ld-mote{position:absolute;top:50%;border-radius:50%;background:rgb(255 226 178);box-shadow:0 0 6px 1px rgb(255 200 130/.5);opacity:0;animation:ld-mote var(--t) linear infinite;will-change:transform,opacity}
@media (prefers-reduced-motion:reduce){.ld-s1,.ld-s2,.ld-s3,.ld-ask,.ld-rays,.ld-path,.ld-mote,.ld-enter,.ld-enter2{animation:none}}
`;

// The same dawn, painted: a fragment shader on a small canvas of its own that
// fades in over the CSS picture once it has drawn a frame (so there is never
// a blank or a flash: the CSS dawn is in the first paint, and this is the same
// sky in the same place, finer). Soft layered haze in his pastel palette, long
// bars of cloud catching the first light, fine rays standing round the sun,
// three ranges of mountains paler with distance, all of it lying again in the
// water with a broken path of light, a little drifting grain, dithered so no
// gradient bands. Cheap: a few noise lookups a pixel, at most 1.5x density.
const SKY_FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uP;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vn(p); p = p * 2.03 + vec2(17.1, 3.7); a *= 0.5; } return v; }
vec3 sky(vec2 uv, float t, float light, float rayK){
  float h = clamp(uv.y * 2.0, 0.0, 1.0);
  float r = length(uv); float ang = atan(uv.y, uv.x);
  // night above, violet lower, a dusty rose and ochre where the sun is coming
  vec3 col = mix(vec3(0.125, 0.105, 0.175), vec3(0.042, 0.07, 0.125), smoothstep(0.0, 0.4, h));
  col = mix(col, vec3(0.014, 0.018, 0.046), smoothstep(0.28, 1.0, h));
  vec3 warm = vec3(1.0, 0.63, 0.36), rose = vec3(0.78, 0.4, 0.42), ochre = vec3(0.86, 0.66, 0.4);
  col += (warm * exp(-r * 6.0) * 0.8 + rose * exp(-r * 2.4) * 0.3 + ochre * exp(-abs(uv.y) * 16.0) * exp(-abs(uv.x) * 1.6) * 0.22) * light;
  // long quiet bars of cloud above the horizon, lit from beneath on the sun's side
  float bars = fbm(vec2(uv.x * 1.25 + t * 0.006, uv.y * 15.0 - t * 0.002 + 3.0));
  float barK = smoothstep(0.5, 0.72, bars) * smoothstep(0.015, 0.07, uv.y) * (1.0 - smoothstep(0.16, 0.34, uv.y));
  vec3 barC = mix(vec3(0.13, 0.11, 0.2), mix(rose, warm, 0.55), exp(-r * 2.6) * light);
  col = mix(col, barC, barK * 0.55);
  // thin high haze
  float veil = fbm(vec2(uv.x * 0.9 - t * 0.004, uv.y * 4.0 + 9.0));
  col += vec3(0.16, 0.13, 0.22) * smoothstep(0.4, 0.8, veil) * 0.22 * (1.0 - h);
  // rays: a few broad, many fine, slowly turning
  float rays = vn(vec2(ang * 5.0 + t * 0.01, 1.0)) * 0.6 + pow(vn(vec2(ang * 19.0 - t * 0.008, 5.0)), 2.0) * 0.4;
  col += mix(warm, vec3(1.0, 0.9, 0.78), 0.3) * (0.35 + 0.65 * rays) * exp(-r * 4.6) * smoothstep(0.03, 0.14, r) * 0.3 * light * rayK;
  // stars, drowned near the light and the horizon
  vec2 sg = uv * 70.0; vec2 si = floor(sg); float sh = hash(si);
  vec2 so = (vec2(hash(si + 3.1), hash(si + 7.7)) - 0.5) * 0.7;
  float star = smoothstep(0.075, 0.0, length(fract(sg) - 0.5 - so)) * step(0.9, sh);
  col += vec3(0.86, 0.9, 1.0) * star * (0.55 + 0.45 * sin(t * (0.8 + sh * 2.5) + sh * 40.0)) * smoothstep(0.05, 0.3, uv.y) * (1.0 - 0.75 * light * exp(-r * 1.8)) * 0.85;
  // the mountains: the far range tall and pale in the haze, the nearer ones lower and darker
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * (1.5 + fi * 0.9) + fi * 31.7;
    float rg = fbm(vec2(x, fi * 5.3)) * 0.75 + (1.0 - abs(vn(vec2(x * 2.6, fi + 9.0)) * 2.0 - 1.0)) * 0.25;
    float top = (rg - 0.33) * (0.31 - fi * 0.105) + 0.004;
    float edge = smoothstep(top + 0.0016, top - 0.0016, uv.y);
    vec3 mc = mix(vec3(0.13, 0.115, 0.22), vec3(0.03, 0.032, 0.062), fi * 0.5);
    mc += (rose * 0.16 + warm * 0.1) * exp(-abs(uv.x) * (2.5 + fi)) * light * (1.0 - fi * 0.4);
    // their feet stand in the low haze
    mc = mix(mc, col, (1.0 - fi * 0.45) * 0.45 * exp(-max(uv.y, 0.0) * 60.0));
    col = mix(col, mc, edge);
  }
  return col;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float light = 0.2 + 0.8 * pow(uP, 1.3);
  vec3 col;
  if (uv.y >= 0.0) col = sky(uv, t, light, 1.0);
  else {
    // the water: the sky again, pulled long and loosened by the swell, darker; a path of light under the sun
    float d = -uv.y;
    float z = 1.0 / (d + 0.012);
    float rip = vn(vec2(uv.x * z * 0.5 + t * 0.06, z * 0.9 + t * 0.35)) - 0.5;
    float swell = vn(vec2(uv.x * z * 0.12 - t * 0.02, z * 0.22 + t * 0.12)) - 0.5;
    vec2 m = vec2(uv.x + (rip * 0.012 + swell * 0.03) * (0.3 + d * 3.0), d * (0.9 + rip * 0.25 + swell * 0.3) + 0.002);
    col = sky(m, t, light, 0.2) * mix(0.62, 0.3, smoothstep(0.0, 0.45, d));
    col = mix(col, vec3(0.012, 0.016, 0.034), smoothstep(0.1, 0.5, d) * 0.6);
    float w = 0.012 + d * 0.5;
    float glit = smoothstep(0.08, 0.34, rip + swell * 0.6);
    col += vec3(1.0, 0.72, 0.44) * exp(-uv.x * uv.x / (w * w)) * (0.1 + 0.9 * glit) * exp(-d * 3.4) * 0.5 * light;
    // the hairline of the far shore
    col *= 1.0 - 0.35 * exp(-d * 260.0);
  }
  // the edges fall away
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - dot(q, q) * 0.55;
  // drifting grain, and a dither finer than the display's steps
  col += (hash(gl_FragCoord.xy + floor(t * 12.0) * 7.3) - 0.5) * 0.022;
  col += (hash(gl_FragCoord.xy * 1.7 + 3.0) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}`;

function LoaderSky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const gl = c.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl) return;
    const mk = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }"));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, SKY_FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uP = gl.getUniformLocation(prog, "uP");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let p = 0;
    let last = performance.now();
    let shown = false;
    const t0 = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // (a phone draws it at a lower pixel count than a desk)
      const k = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.25 : 1.5);
      const w = Math.max(2, Math.round(c.clientWidth * k));
      const h = Math.max(2, Math.round(c.clientHeight * k));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
        gl.viewport(0, 0, w, h);
      }
      p += (loader.progress - p) * (1 - Math.exp(-dt * 2.2));
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uTime, still ? 0 : (now - t0) / 1000);
      gl.uniform1f(uP, p);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!shown) {
        shown = true;
        c.style.opacity = "1";
      }
      if (loader.phase !== "gone") raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      // (losing the context right as the world starts to draw blocked the main thread for over a second: let it go
      // a few seconds later, when nothing is being waited on)
      window.setTimeout(() => gl.getExtension("WEBGL_lose_context")?.loseContext(), 4000);
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ opacity: 0, transition: "opacity 1.4s cubic-bezier(.4,0,.2,1)" }} aria-hidden />;
}

function localTime() {
  const m = /[?&]time=(\d{1,2}):(\d{2})/.exec(window.location.search);
  const d = new Date();
  const hh = m ? Math.min(23, +m[1]) : d.getHours();
  const mm = m ? Math.min(59, +m[2]) : d.getMinutes();
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function Preloader({ hideForReducedMotion = false }: { hideForReducedMotion?: boolean }) {
  const [, bump] = useState(0);
  const [time, setTime] = useState<string | null>(null);
  const line = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const sun = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const taken = useRef<HTMLElement | null>(null);
  const num = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    setTime(localTime());
    loader.set(0.14); // hydrated
    return () => void subs.delete(f);
  }, []);
  // the count under the line: real progress, followed a little behind so it runs instead of jumping
  useEffect(() => {
    let raf = 0;
    let shown = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const want = loader.progress * 100;
      shown += (want - shown) * (1 - Math.exp(-dt * (want >= 100 ? 9 : 4.5)));
      if (want - shown < 0.4) shown = want;
      if (num.current) num.current.textContent = String(Math.round(shown)).padStart(2, "0");
      if (loader.phase === "load") raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // the canvas matches its line to this one, to the pixel (it measures it while the loader is up)
  useLayoutEffect(() => {
    loader.el = line.current;
    loader.measure();
    return () => {
      loader.el = null;
    };
  });
  const phase = loader.phase;
  useEffect(() => {
    if (phase !== "open" && phase !== "fade") return;
    const t = window.setTimeout(() => {
      loader.phase = "gone";
      subs.forEach((f) => f());
    }, 1100);
    return () => window.clearTimeout(t);
  }, [phase]);
  // the first sliver of line is a CSS animation (no script yet); once real
  // progress arrives the transition carries on from wherever it got to
  useLayoutEffect(() => {
    const el = fill.current;
    if (!el || loader.progress <= 0) return;
    if (taken.current !== el) {
      // pin the line where the CSS animation has it, so the hand-over can never step back
      // (once for each time the loader is put up)
      taken.current = el;
      const now = getComputedStyle(el).transform;
      el.style.transition = "none";
      el.style.animation = "none";
      el.style.transform = now === "none" ? "scaleX(0)" : now;
      void el.offsetWidth;
      el.style.transition = "";
      // the sun likewise: from wherever its own first glimmer has got to
      const su = sun.current;
      if (su) {
        const at = getComputedStyle(su).transform;
        su.style.transition = "none";
        su.style.animation = "none";
        su.style.transform = at === "none" ? "translateY(101%)" : at;
        void su.offsetWidth;
        su.style.transition = "";
      }
    }
    el.style.transform = `scaleX(${Math.max(0.08, loader.progress).toFixed(4)})`;
    // the sun is up when the line is across: its rise eases in late, so the last of the loading is the dawn
    const up = Math.pow(Math.max(0.16, loader.progress), 1.6);
    if (sun.current) sun.current.style.transform = `translateY(${((1 - up) * 101).toFixed(2)}%)`;
    if (halo.current && loader.phase === "load") halo.current.style.opacity = (up * 0.9).toFixed(3);
    // the light of it spreads over the sky and down the water as it comes up
    if (root.current && loader.phase === "load") root.current.style.setProperty("--p", (0.22 + 0.78 * Math.pow(loader.progress, 1.3)).toFixed(3));
  });
  if (phase === "gone") return null;
  const open = phase === "open";
  const out = phase !== "load";
  return (
    <div
      ref={root}
      className={`pointer-events-none fixed inset-0 z-[50] text-white ${hideForReducedMotion ? "motion-reduce:hidden" : ""}`}
      style={{
        // centred by an explicit grid on the viewport itself (inline: it holds before any stylesheet has arrived)
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
        letterSpacing: "-0.011em",
        WebkitFontSmoothing: "antialiased",
        ["--p" as string]: 0.22,
        background: "#050506",
        // the world is already drawing its first frame underneath (the same horizon, the sea below it, the mountains
        // beyond): this picture dissolves into that one
        opacity: out ? 0 : 1,
        transition: open ? "opacity 1s cubic-bezier(.45,0,.2,1)" : phase === "fade" ? "opacity .5s cubic-bezier(.4,0,.2,1)" : undefined,
      }}
      aria-hidden={out}
    >
      <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />
      {/* the sky above the horizon, the water below it: both let go together when the world takes over */}
      <div className="absolute inset-0" aria-hidden>
        <div className="ld-sky absolute inset-x-0 top-0 h-1/2" style={{ background: "linear-gradient(180deg,#04050b 0%,#070a17 38%,#0d1126 72%,#161631 100%)" }} />
        <div className="ld-sky absolute inset-x-0 bottom-0 h-1/2" style={{ background: "linear-gradient(180deg,#0b0d1d 0%,#070812 30%,#050506 100%)" }} />
        {/* stars: three sets, twinkling out of step */}
        <div className="ld-stars ld-s1" />
        <div className="ld-stars ld-s2" />
        <div className="ld-stars ld-s3" />
        {/* the glow of the coming sun on the sky, and soft rays turning very slowly in it */}
        <div className="absolute inset-x-0 top-0 h-1/2 overflow-hidden">
          <div className="ld-glow absolute inset-0" style={{ opacity: "var(--p)", background: "radial-gradient(60% 90% at 50% 100%,rgb(255 176 112/.34) 0%,rgb(226 120 110/.17) 26%,rgb(120 96 170/.1) 52%,transparent 78%)" }} />
          <div
            className="ld-glow absolute bottom-0 left-1/2 aspect-square w-[min(150vh,150vw)]"
            style={{ opacity: "calc(var(--p) * .8)", transform: "translate(-50%,50%)", WebkitMaskImage: "radial-gradient(closest-side,#000 0%,rgb(0 0 0/.5) 22%,transparent 62%)", maskImage: "radial-gradient(closest-side,#000 0%,rgb(0 0 0/.5) 22%,transparent 62%)" }}
          >
            <div className="ld-rays absolute inset-0" style={{ background: "repeating-conic-gradient(from 0deg,rgb(255 214 160/.0) 0deg,rgb(255 214 160/.11) 2.2deg,rgb(255 214 160/.0) 5deg,rgb(255 214 160/.05) 8deg,rgb(255 214 160/.0) 12deg)" }} />
          </div>
        </div>
        {/* the far mountains, dark against the glow */}
        <svg className="absolute bottom-1/2 left-1/2 h-[min(9vh,64px)] w-[max(100vw,1100px)] -translate-x-1/2" viewBox="0 0 1100 64" preserveAspectRatio="none" aria-hidden>
          <path d="M0 64V46l38-9 30 6 44-21 26 11 34-23 40 19 28-8 46 20 52-6 60 4h40l56-5 48 7 40-16 30 9 44-27 34 17 38-12 46 19 30-7 44 10 60-6 62 8 60-13H1100V64Z" fill="#0a0b16" />
          <path d="M0 64V54l70-6 60 5 80-9 70 7 90-3 80 5h60l80-4 90 6 70-8 90 7 80-5 90 6 90-5H1100V64Z" fill="#07070d" />
        </svg>
        {/* the light on the water: a broken path under the sun, and the sky's glow lying on it */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden">
          <div className="ld-glow absolute inset-0" style={{ opacity: "calc(var(--p) * .7)", background: "radial-gradient(46% 70% at 50% 0%,rgb(255 170 110/.2) 0%,rgb(160 100 140/.07) 40%,transparent 72%)" }} />
          <div
            className="ld-glow ld-path absolute left-1/2 top-0 h-[70%] w-[min(220px,40vw)]"
            style={{
              opacity: "calc(var(--p) * .9)",
              transform: "translateX(-50%)",
              background: "repeating-linear-gradient(180deg,rgb(255 220 180/.75) 0 1px,transparent 1px 4px,rgb(255 214 170/.4) 4px 5px,transparent 5px 11px)",
              WebkitMaskImage: "radial-gradient(50% 100% at 50% 0%,#000 0%,rgb(0 0 0/.45) 40%,transparent 100%)",
              maskImage: "radial-gradient(50% 100% at 50% 0%,#000 0%,rgb(0 0 0/.45) 40%,transparent 100%)",
            }}
          />
        </div>
        {/* the painted sky takes over from the CSS one as soon as it has a frame */}
        <LoaderSky />
        {/* motes of light, rising */}
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="ld-mote"
            style={{ left: `calc(50% + ${m.left.toFixed(1)}vw)`, width: m.size, height: m.size, ["--t" as string]: `${m.dur.toFixed(1)}s`, ["--dx" as string]: `${m.drift.toFixed(0)}px`, ["--dy" as string]: `-${m.rise.toFixed(0)}vh`, ["--o" as string]: (0.35 + (i % 4) * 0.15).toFixed(2), animationDelay: `${m.delay.toFixed(1)}s` }}
          />
        ))}
      </div>
      <div className="relative" style={{ width: "min(360px, 64vw)", height: 1 }}>
        {/* the half-sun, rising out of the line (it is clipped at the horizon, a breath above it, as in the mark) */}
        <div className="ld-fade pointer-events-none absolute bottom-[5px] left-1/2 h-[34px] w-[68px] -translate-x-1/2 overflow-hidden" style={out ? { opacity: 0, transform: "scale(1.5)", filter: "blur(6px)" } : undefined} aria-hidden>
          <div ref={sun} className="ld-sun h-[68px] w-[68px] rounded-full" style={{ background: "radial-gradient(circle at 50% 30%,#fffdf6 0%,#ffe9c4 55%,#ffcf96 100%)" }} />
        </div>
        <div ref={halo} className="ld-halo pointer-events-none absolute bottom-[-70px] left-1/2 h-[220px] w-[420px] -translate-x-1/2 bg-[radial-gradient(closest-side,rgb(255_226_180/0.3),rgb(255_200_150/0.09)_52%,transparent)]" style={out ? { opacity: 0 } : undefined} aria-hidden />
        <div
          className="ld-type ld-enter absolute inset-x-0 top-0 flex items-baseline justify-between pt-[18px] text-[13px] font-medium leading-none"
          style={out ? { opacity: 0, filter: "blur(4px)", transform: "translateY(4px)" } : undefined}
        >
          <span>Augustas Armalis</span>
          {/* how far along it is: a quiet numeral in even figures */}
          <span className="tabular-nums text-white/50" style={{ fontFeatureSettings: '"tnum"', opacity: loader.prompt ? 0 : 1, transition: "opacity .5s cubic-bezier(.23,1,.32,1)" }} aria-hidden>
            <span ref={num}>00</span>
          </span>
        </div>
        {/* one short line under the horizon: the place and the hour, and when the sun is up, the invitation */}
        <div className="ld-type ld-enter2 absolute inset-x-0 top-[52px] text-center text-[12px] font-medium leading-none" style={out ? { opacity: 0, filter: "blur(4px)", transform: "translateY(4px)" } : undefined} aria-live="polite">
          <span className="absolute inset-x-0 tabular-nums text-white/45" style={{ opacity: loader.prompt ? 0 : time ? 1 : 0, transition: "opacity .6s cubic-bezier(.23,1,.32,1)" }}>
            Kaunas · {time ?? "00:00"}
          </span>
          <span className="absolute inset-x-0 text-white/90" style={{ opacity: loader.prompt ? 1 : 0, transform: loader.prompt ? "none" : "translateY(3px)", transition: "opacity .8s .15s cubic-bezier(.23,1,.32,1), transform .8s .15s cubic-bezier(.23,1,.32,1)" }}>
            {loader.prompt && <span className="ld-ask">{loader.prompt}</span>}
          </span>
        </div>
        <div ref={line} className="relative h-px">
          <div className="absolute inset-0 bg-white/[0.16]" style={{ opacity: out ? 0 : 1, transition: "opacity .28s linear" }} />
          <div ref={fill} className="ld-fill absolute inset-0 bg-white" style={{ opacity: out ? 0 : 1, boxShadow: "0 0 10px 0 rgb(255 220 170/.7)" }} />
        </div>
      </div>
    </div>
  );
}
