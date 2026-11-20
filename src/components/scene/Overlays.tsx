"use client";

import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TRACK, geist } from "./font";
import { BOOT } from "./shared";

const { markY, markH, markW, stroke, barY, barW, barH } = BOOT;
const cx = (markW / 2) * 0.66;
const cy = markY + markH * 0.16;

// The boot mark and bar, drawn in CSS px from the viewport centre, the same
// numbers the 3D screen shader uses.
function BootMark({ w, h, color, track, prog }: { w: number; h: number; color: string; track: string; prog: number }) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden>
      <g stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1={0} y1={markY - markH / 2} x2={-markW / 2} y2={markY + markH / 2} />
        <line x1={0} y1={markY - markH / 2} x2={markW / 2} y2={markY + markH / 2} />
        <line x1={-cx} y1={cy} x2={cx} y2={cy} />
      </g>
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
// Darkness, and one hairline of light on the horizon. Real loading progress
// draws the line across; his name and the hour sit on it. This DOM layer is in
// the server-rendered HTML, so it paints before any script runs, and its line
// runs as a CSS transition on the compositor, so it keeps gliding while the
// main thread compiles shaders. When the world is ready the canvas is already
// drawing the very same frame underneath (scene/Loader.tsx: same black, same
// line, read from this element's own box), this layer lets go, and the rest
// (the line running out to the edges, first light along it, the dark lifting)
// happens inside the canvas.

type LoaderPhase = "load" | "open" | "fade" | "gone";
const subs = new Set<() => void>();
export const loader = {
  progress: 0,
  phase: "load" as LoaderPhase,
  // where the hairline sits, in CSS px: the canvas draws its own from this
  line: null as { left: number; right: number; top: number; height: number } | null,
  el: null as HTMLElement | null,
  measure() {
    const r = loader.el?.getBoundingClientRect();
    if (r && r.width > 0) loader.line = { left: r.left, right: r.right, top: r.top, height: r.height };
    return loader.line;
  },
  // progress only ever moves forward
  set(p: number) {
    if (p <= loader.progress) return;
    loader.progress = Math.min(1, p);
    subs.forEach((f) => f());
  },
  // "open": the canvas takes over (cinematic); "fade": a plain dissolve (no intro)
  finish(how: "open" | "fade") {
    if (loader.phase !== "load") return;
    loader.progress = 1;
    loader.phase = how;
    subs.forEach((f) => f());
  },
  reset() {
    loader.progress = 0;
    loader.phase = "load";
    subs.forEach((f) => f());
  },
};
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __loader: loader });

const LOADER_CSS = `
@keyframes ld-first{from{transform:scaleX(0)}to{transform:scaleX(.08)}}
.ld-fill{transform-origin:0 50%;transform:scaleX(0);animation:ld-first 1.6s cubic-bezier(.23,1,.32,1) both;transition:transform .7s cubic-bezier(.23,1,.32,1),opacity .28s linear;will-change:transform}
.ld-type{transition:opacity .7s cubic-bezier(.23,1,.32,1),filter .7s cubic-bezier(.23,1,.32,1),transform .7s cubic-bezier(.23,1,.32,1)}
`;

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
  const taken = useRef(false);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    setTime(localTime());
    loader.set(0.14); // hydrated
    return () => void subs.delete(f);
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
    if (!taken.current) {
      // pin the line where the CSS animation has it, so the hand-over can never step back
      taken.current = true;
      const now = getComputedStyle(el).transform;
      el.style.transition = "none";
      el.style.animation = "none";
      el.style.transform = now === "none" ? "scaleX(0)" : now;
      void el.offsetWidth;
      el.style.transition = "";
    }
    el.style.transform = `scaleX(${Math.max(0.08, loader.progress).toFixed(4)})`;
  });
  if (phase === "gone") return null;
  const open = phase === "open";
  const out = phase !== "load";
  return (
    <div
      className={`${geist.className} pointer-events-none fixed inset-0 z-[50] text-white ${hideForReducedMotion ? "motion-reduce:hidden" : ""}`}
      style={{
        letterSpacing: TRACK.body,
        // open: the canvas is already showing this exact black, so the layer simply lets go
        background: open ? "transparent" : "#050506",
        opacity: phase === "fade" ? 0 : 1,
        transition: phase === "fade" ? "opacity .5s cubic-bezier(.4,0,.2,1)" : undefined,
      }}
      aria-hidden={out}
    >
      <style dangerouslySetInnerHTML={{ __html: LOADER_CSS }} />
      <div className="absolute left-1/2 top-1/2 w-[min(360px,64vw)] -translate-x-1/2">
        <div
          className="ld-type absolute inset-x-0 bottom-0 flex items-baseline justify-between pb-[14px] text-[13px] font-medium leading-none"
          style={out ? { opacity: 0, filter: "blur(5px)", transform: "translateY(-5px)", transitionDelay: open ? "0.12s" : "0s" } : undefined}
        >
          <span>Augustas Armalis</span>
          {/* (a phone's loader carries the name alone) */}
          <span className="tabular-nums text-white/50 max-md:hidden" style={{ opacity: time ? 1 : 0, transition: "opacity .6s cubic-bezier(.23,1,.32,1)" }}>
            Kaunas · {time ?? "00:00"}
          </span>
        </div>
        <div ref={line} className="relative h-px">
          <div className="absolute inset-0 bg-white/[0.14]" style={{ opacity: out ? 0 : 1, transition: "opacity .28s linear" }} />
          <div ref={fill} className="ld-fill absolute inset-0 bg-white" style={{ opacity: out ? 0 : 1 }} />
        </div>
      </div>
    </div>
  );
}
