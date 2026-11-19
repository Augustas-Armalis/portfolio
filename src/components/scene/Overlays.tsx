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

// First-load preloader. Black, his mark, his name, and one hairline: real
// loading progress draws it across, a small counter follows. When the world is
// ready the line runs out to both edges of the screen and becomes the horizon:
// the black parts along it, up and down, onto the sky the camera starts in.
let shownProgress = 0; // survives the swap from the chunk-loading fallback to the scene's own loader

export function Preloader({ progress, done = false, caption }: { progress: number; done?: boolean; caption?: string }) {
  const target = Math.min(1, Math.max(0, progress));
  const fill = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const goal = useRef(target);
  goal.current = done ? 1 : target;
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // a lagging value, never the raw one: it glides and never steps back
      shownProgress = Math.max(shownProgress, shownProgress + (goal.current - shownProgress) * (1 - Math.exp(-dt * (goal.current >= 1 ? 9 : 3.2))));
      if (goal.current - shownProgress < 0.002) shownProgress = goal.current;
      if (fill.current) fill.current.style.transform = `scaleX(${shownProgress.toFixed(4)})`;
      if (count.current) count.current.textContent = String(Math.round(shownProgress * 100)).padStart(2, "0");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (gone) return null;
  const OPEN = { duration: 1.5, ease: [0.7, 0, 0.2, 1] as const, delay: 0.55 };
  const panel = "absolute inset-x-0 bg-[#050506]";
  return (
    <div className={`${geist.className} pointer-events-none fixed inset-0 z-[50] text-white`} style={{ letterSpacing: TRACK.body }} aria-hidden={done}>
      {/* the two halves of the dark, meeting on the horizon */}
      <motion.div
        className={`${panel} top-0 h-[calc(50%+1px)]`}
        initial={false}
        animate={{ y: done ? "-101%" : "0%" }}
        transition={OPEN}
        style={{ boxShadow: "0 28px 60px 30px #050506" }}
      />
      <motion.div
        className={`${panel} bottom-0 h-[calc(50%+1px)]`}
        initial={false}
        animate={{ y: done ? "101%" : "0%" }}
        transition={OPEN}
        style={{ boxShadow: "0 -28px 60px 30px #050506" }}
        onAnimationComplete={() => done && setGone(true)}
      />
      {/* the line: progress first, then the horizon */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-px -translate-y-1/2"
        initial={false}
        animate={{ width: done ? "100vw" : "min(360px, 64vw)", x: "-50%", opacity: done ? 0 : 1 }}
        transition={{ width: { duration: 0.75, ease: [0.7, 0, 0.2, 1] }, opacity: { duration: 0.9, delay: 0.9 } }}
      >
        <div className="absolute inset-0 bg-white/14" />
        <div ref={fill} className="absolute inset-0 origin-left bg-white" style={{ transform: `scaleX(${shownProgress})` }} />
        <div className="absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(255_232_196/0.16),transparent)] blur-md" />
      </motion.div>
      {/* lockup: mark above the line, name and counter hanging from its ends */}
      <motion.div
        className="absolute left-1/2 top-1/2 w-[min(360px,64vw)] -translate-x-1/2"
        initial={{ opacity: 0 }}
        animate={{ opacity: done ? 0 : 1, y: done ? 6 : 0 }}
        transition={{ duration: done ? 0.35 : 0.7, ease: [0.22, 1, 0.36, 1], delay: done ? 0 : 0.1 }}
      >
        <svg viewBox="15 13 34 38" className="absolute bottom-5 left-0 h-[26px] w-auto" fill="currentColor" aria-hidden>
          <path d="M32 13 15.5 51h7.2l3.4-8.3h11.8l3.4 8.3h7.2L32 13Zm-3.6 23.6L32 27.4l3.6 9.2h-7.2Z" />
        </svg>
        <div className="flex items-baseline justify-between pt-3.5 text-[13px] font-medium leading-none">
          <span>
            Augustas Armalis
            {caption && <span className="ml-2 font-normal text-white/38 max-sm:hidden">{caption}</span>}
          </span>
          <span ref={count} className="tabular-nums text-white/55">
            00
          </span>
        </div>
      </motion.div>
    </div>
  );
}
