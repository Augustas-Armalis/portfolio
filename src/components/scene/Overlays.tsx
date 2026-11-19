"use client";

import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
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

// First-load preloader. Black, one thin line of light: real loading progress
// draws it out from the centre into a horizon. When the world is ready a small
// sun rises over it, and the whole thing dissolves into the mist the camera
// descends through. Name and the live Kaunas time, small.
export function Preloader({ progress, done = false, caption }: { progress: number; done?: boolean; caption?: string }) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[50] bg-black"
      initial={false}
      animate={{ opacity: done ? 0 : 1 }}
      transition={{ duration: 1.4, ease: [0.4, 0, 0.2, 1], delay: done ? 0.55 : 0 }}
    >
      <div className="absolute left-1/2 top-1/2 h-0 w-[min(560px,78vw)] -translate-x-1/2">
        {/* horizon */}
        <div
          className="absolute left-1/2 top-0 h-px -translate-x-1/2 bg-gradient-to-r from-transparent via-white/90 to-transparent"
          style={{ width: `${8 + p * 92}%`, transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <div
          className="absolute left-1/2 top-0 h-6 -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_236_200/0.22),transparent)] blur-md"
          style={{ width: `${p * 100}%`, transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        {/* the sun rising once everything is ready */}
        <motion.div
          className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-[#fff3dc] shadow-[0_0_24px_8px_rgb(255_214_160/0.55),0_0_80px_30px_rgb(255_190_120/0.2)]"
          initial={{ y: 4, opacity: 0, scale: 0.6 }}
          animate={p >= 1 ? { y: -22, opacity: 1, scale: 1 } : { y: 4, opacity: 0, scale: 0.6 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <motion.div
        className="absolute inset-x-0 top-1/2 mt-7 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: done ? 0 : 1 }}
        transition={{ duration: 0.8, delay: done ? 0 : 0.2 }}
      >
        <div className="text-[11px] font-medium uppercase tracking-[0.42em] text-white/80">Augustas Armalis</div>
        <div className="mt-2 text-[11px] tabular-nums tracking-[0.08em] text-white/40">{caption ?? "\u00a0"}</div>
      </motion.div>
    </motion.div>
  );
}
