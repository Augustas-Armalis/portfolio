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

// First-load preloader: the "A" draws itself stroke by stroke as assets load
// and shaders compile, then a caption with the place, local time and light.
// When everything is ready the mark lifts away and the field fades up.
export function Preloader({ progress, done = false, caption }: { progress: number; done?: boolean; caption?: string }) {
  const [ref, box] = useBox();
  const seg = (a: number, b: number) => 1 - Math.min(1, Math.max(0, (progress - a) / (b - a)));
  const ease = "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)";
  return (
    <motion.div
      ref={ref}
      className="pointer-events-none fixed inset-0 z-[50] bg-page"
      initial={false}
      animate={{ opacity: done ? 0 : 1 }}
      transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1], delay: done ? 0.35 : 0 }}
    >
      {box.w > 0 && (
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: done ? 0 : 1, y: done ? -10 : 0, filter: done ? "blur(4px)" : "blur(0px)" }}
          transition={{ duration: 0.5, ease: [0.4, 0, 1, 1] }}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox={`${-box.w / 2} ${-box.h / 2} ${box.w} ${box.h}`} aria-hidden>
            <g stroke="rgba(26,27,30,0.1)" strokeWidth={stroke} strokeLinecap="round" fill="none">
              <line x1={0} y1={markY - markH / 2} x2={-markW / 2} y2={markY + markH / 2} />
              <line x1={0} y1={markY - markH / 2} x2={markW / 2} y2={markY + markH / 2} />
              <line x1={-cx} y1={cy} x2={cx} y2={cy} />
            </g>
            <g stroke="#1a1b1e" strokeWidth={stroke} strokeLinecap="round" fill="none">
              <line x1={-markW / 2} y1={markY + markH / 2} x2={0} y2={markY - markH / 2} pathLength={1} strokeDasharray="1 1" strokeDashoffset={seg(0.02, 0.45)} style={{ transition: ease }} />
              <line x1={0} y1={markY - markH / 2} x2={markW / 2} y2={markY + markH / 2} pathLength={1} strokeDasharray="1 1" strokeDashoffset={seg(0.35, 0.75)} style={{ transition: ease }} />
              <line x1={-cx} y1={cy} x2={cx} y2={cy} pathLength={1} strokeDasharray="1 1" strokeDashoffset={seg(0.7, 0.98)} style={{ transition: ease }} />
            </g>
          </svg>
          <div className="absolute inset-x-0 text-center" style={{ top: box.h / 2 + 30 }}>
            <div className="text-[12px] font-semibold uppercase tracking-[0.32em] text-ink">Augustas OS</div>
            <motion.div className="mt-1.5 text-[12px] tabular-nums text-ink-3" initial={{ opacity: 0 }} animate={{ opacity: caption ? 1 : 0 }} transition={{ duration: 0.6 }}>
              {caption ?? "\u00a0"}
            </motion.div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
