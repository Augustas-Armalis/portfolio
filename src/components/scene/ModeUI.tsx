"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Download, Grid3x3, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { getAnalyser, music, onMuteChange, sceneMuted, setSceneMuted, voice, voicePlayUrl, voiceStop } from "@/lib/audio";
import { QUALITY_LABELS, setQualityChoice, setQualityOverride, useQuality, useQualityChoice, type QualityChoice } from "@/lib/quality";
import { play } from "@/lib/sfx";
import { WORLDS, setGuide, useFlightFlags, useVoyageTick, useWorld, voyage } from "./worlds/voyage";
import { GLASS_IN, GLASS_ON, GLASS_SPRING, Glass } from "./Glass";
import { photoCtl, postCtl, type Capture } from "./Post";

// DOM controls for the focused desk modes. Quiet, glassy, dark-on-light pills
// that sit over the 3D scene. Every mode has the same exit: Esc or "Put down".

const EASE = [0.22, 1, 0.36, 1] as const;
const btn = "lg-btn pointer-events-auto h-8 px-3.5 text-[13px] font-medium text-white/92";

// The top capsule every mode shares: what you're holding, a hint, and the way out.
export function TopBar({ title, hint, exitLabel = "Put down", onExit }: { title: string; hint?: string; exitLabel?: string; onExit: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
      <Glass
        className="flex items-center gap-1 p-1 pl-4"
        initial={{ ...GLASS_IN, y: -10 }}
        animate={GLASS_ON}
        exit={{ ...GLASS_IN, y: -10 }}
        transition={GLASS_SPRING}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="text-[13px] font-semibold tracking-[-0.02em]">{title}</span>
        {hint && <span className="ml-2 hidden text-[12.5px] text-white/65 sm:inline">{hint}</span>}
        <button type="button" className={`${btn} lg-chip ml-2`} onClick={(e) => (e.stopPropagation(), onExit())}>
          {exitLabel}
          <span className="ml-1.5 text-white/50">Esc</span>
        </button>
      </Glass>
    </div>
  );
}

function Bottom({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-4"
      initial={GLASS_IN}
      animate={GLASS_ON}
      exit={GLASS_IN}
      transition={{ ...GLASS_SPRING, delay: 0.06 }}
    >
      {children}
    </motion.div>
  );
}

// ---------- piano ----------

export function PianoUI({ onExit }: { onExit: () => void }) {
  return <TopBar title="Piano" hint="Click the keys, or play A–L and W E T Y U O P" onExit={onExit} />;
}

// ---------- camera ----------

// The camera is a photo mode: a free flight, a real lens (focus, aperture,
// focal length, exposure), the hour, a frame in one of five shapes, and a
// shutter that keeps exactly what the frame holds at full resolution.

const ASPECTS: [string, number][] = [
  ["3:2", 3 / 2],
  ["4:3", 4 / 3],
  ["1:1", 1],
  ["16:9", 16 / 9],
  ["9:16", 9 / 16],
];
const F_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
const FOCUS_NEAR = 0.25;
const FOCUS_FAR = 120; // the end of the ring: past it the lens is at infinity
// the film behind the frame: a 36 x 24 negative, cropped to the frame's shape
const filmHeight = (a: number) => (a >= 1.5 ? 36 / a : a >= 1 ? 24 : a >= 2 / 3 ? 24 / a : 36);
const ringOfFocus = (m: number) => (m >= FOCUS_FAR ? 1 : Math.min(1, Math.max(0, Math.log(m / FOCUS_NEAR) / Math.log(FOCUS_FAR / FOCUS_NEAR))));
const focusOfRing = (t: number) => (t >= 0.995 ? 1000 : FOCUS_NEAR * Math.pow(FOCUS_FAR / FOCUS_NEAR, t));
const fmtFocus = (m: number) => (m >= FOCUS_FAR ? "∞" : m < 1 ? `${Math.round(m * 100)} cm` : m < 10 ? `${m.toFixed(1)} m` : `${Math.round(m)} m`);
const fmtStop = (n: number) => `ƒ/${n}`;
const fmtEv = (v: number) => `${v > 0.04 ? "+" : v < -0.04 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
const FRAME_EASE = "280ms cubic-bezier(0.22, 1, 0.36, 1)";

type Shot = { id: number; thumb: string; url: string | null; name: string; w: number; h: number; saved: boolean };
type Dial = "focus" | "aperture" | "zoom" | "ev" | "time" | "aspect";
let shotSeq = 0;

export function CameraUI({
  mobile,
  onExit,
  onShoot,
  hours,
  live,
  onTime,
  onLive,
}: {
  mobile: boolean;
  onExit: () => void;
  onShoot: () => Capture | null;
  hours: number;
  live: boolean;
  onTime: (h: number) => void;
  onLive: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<string | null>(null);
  const [focus, setFocus] = useState(30);
  const [stop, setStop] = useState(1); // index into F_STOPS
  const [focal, setFocal] = useState(28);
  const [ev, setEv] = useState(0);
  const [grid, setGrid] = useState(false);
  const [dial, setDial] = useState<Dial | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [blink, setBlink] = useState(0);
  const [mark, setMark] = useState<{ x: number; y: number; id: number } | null>(null);
  const [lens, setLens] = useState(postCtl.level);
  const [hint, setHint] = useState(true);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const read = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the frame: as large as the view allows between the bar above and the controls below, centred on the lens
  const ratioName = aspect ?? (vp.h > vp.w ? "9:16" : "3:2");
  const ratio = ASPECTS.find((a) => a[0] === ratioName)![1];
  const narrow = vp.w < 640;
  const padX = narrow ? 12 : 28;
  const padY = vp.h < 520 ? 58 : narrow ? 150 : 80;
  const fw = Math.max(2, Math.round(Math.min(vp.w - padX * 2, (vp.h - padY * 2) * ratio)));
  const fh = Math.max(2, Math.round(fw / ratio));
  const fx = Math.round((vp.w - fw) / 2);
  const fy = Math.round((vp.h - fh) / 2);

  // the dials, handed to the scene
  useEffect(() => {
    photoCtl.focus = focus;
    photoCtl.aperture = F_STOPS[stop];
    photoCtl.focal = focal;
    photoCtl.ev = ev;
  }, [focus, stop, focal, ev]);
  useEffect(() => {
    if (!vp.w || !vp.h) return;
    photoCtl.frame = { x: fx / vp.w, y: fy / vp.h, w: fw / vp.w, h: fh / vp.h };
    photoCtl.sensorH = filmHeight(ratio);
  }, [vp.w, vp.h, fx, fy, fw, fh, ratio]);
  useEffect(() => {
    photoCtl.onFocus = (x, y, m) => {
      setFocus(Math.min(1000, Math.max(FOCUS_NEAR, m)));
      setMark({ x, y, id: Date.now() });
      setHint(false);
    };
    photoCtl.onWheel = (dy) => setFocal((f) => Math.min(135, Math.max(16, f * Math.exp(-dy * 0.0012))));
    const t = window.setInterval(() => setLens(postCtl.level), 700);
    const h = window.setTimeout(() => setHint(false), 7000);
    return () => {
      photoCtl.onFocus = null;
      photoCtl.onWheel = null;
      photoCtl.frame = { x: 0, y: 0, w: 1, h: 1 };
      window.clearInterval(t);
      window.clearTimeout(h);
    };
  }, []);

  // photographs are kept as PNG files in memory until saved or pushed out by newer ones
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const keep = new Set(shots.map((s) => s.url));
    urls.current.forEach((u) => {
      if (!keep.has(u)) {
        URL.revokeObjectURL(u);
        urls.current.delete(u);
      }
    });
  }, [shots]);
  useEffect(() => {
    const all = urls.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const busy = useRef(false);
  const shoot = () => {
    if (busy.current) return;
    busy.current = true;
    play("shutter");
    setBlink((b) => b + 1);
    setHint(false);
    // the blink is on screen first; the photograph is drawn under it
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        busy.current = false;
        const cap = onShoot();
        if (!cap) return;
        const c = document.createElement("canvas");
        c.width = cap.w;
        c.height = cap.h;
        c.getContext("2d")!.putImageData(new ImageData(cap.data as Uint8ClampedArray<ArrayBuffer>, cap.w, cap.h), 0, 0);
        const t = document.createElement("canvas");
        t.height = 132;
        t.width = Math.round((132 * cap.w) / cap.h);
        const g = t.getContext("2d")!;
        g.imageSmoothingQuality = "high";
        g.drawImage(c, 0, 0, t.width, t.height);
        const d = new Date();
        const p2 = (n: number) => String(n).padStart(2, "0");
        const name = `augustas-os-photo-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`;
        const id = ++shotSeq;
        setShots((s) => [{ id, thumb: t.toDataURL("image/jpeg", 0.86), url: null, name, w: cap.w, h: cap.h, saved: false }, ...s].slice(0, mobile ? 2 : 3));
        c.toBlob((b) => {
          if (!b) return;
          const url = URL.createObjectURL(b);
          urls.current.add(url);
          setShots((s) => s.map((x) => (x.id === id ? { ...x, url } : x)));
          if (process.env.NODE_ENV !== "production") Object.assign(window, { __photo: { blob: b, w: cap.w, h: cap.h, name } });
        }, "image/png");
      }),
    );
  };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      // a focused control keeps its own Space and Enter
      if ((e.target as HTMLElement | null)?.closest?.("button, a, input")) return;
      e.preventDefault();
      if (!e.repeat) shoot();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // a click hands the keyboard back to the camera (Space is the shutter); keyboard focus stays where it was put
  const release = (e: React.MouseEvent) => {
    if (e.detail > 0) (document.activeElement as HTMLElement | null)?.blur?.();
  };
  const chip = (on: boolean, wide = "") => `lg-btn pointer-events-auto h-8 shrink-0 px-2.5 text-[12.5px] font-medium tabular-nums max-sm:px-2 max-sm:text-[12px] ${wide} ${on ? "lg-on" : "text-white/92"}`;
  const seg = (on: boolean) => `lg-btn pointer-events-auto h-7 flex-1 px-2.5 text-[12.5px] font-medium tabular-nums ${on ? "lg-on" : "text-white/90"}`;
  const range = "h-1 min-w-0 flex-1 cursor-pointer accent-white";
  const hasLens = lens >= 1;
  const dials: [Dial, string, string, string][] = [
    ...(hasLens
      ? ([
          ["focus", "Focus", fmtFocus(focus), "min-w-[52px]"],
          ["aperture", "Aperture", fmtStop(F_STOPS[stop]), "min-w-[50px]"],
        ] as [Dial, string, string, string][])
      : []),
    ["zoom", "Zoom", `${Math.round(focal)} mm`, "min-w-[58px]"],
    ...(hasLens ? ([["ev", "Exposure", `${fmtEv(ev)} EV`, "min-w-[62px]"]] as [Dial, string, string, string][]) : []),
    ["time", "Time of day", fmtH(hours), "min-w-[50px]"],
    ["aspect", "Frame", ratioName, "min-w-[42px]"],
  ];
  const shown = dial && dials.some((d) => d[0] === dial) ? dial : null;
  const row = "flex h-9 items-center gap-3 px-3 text-[12.5px]";
  const name = (s: string) => <span className="w-[62px] shrink-0 text-white/70">{s}</span>;
  const value = (s: string) => <span className="w-[52px] shrink-0 text-right font-medium tabular-nums">{s}</span>;

  return (
    <>
      <TopBar title="Camera" hint="Drag to look · W A S D to fly · click to focus" onExit={onExit} />
      <motion.div ref={host} className="pointer-events-none absolute inset-0 z-20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
        {vp.w > 0 && (
          <>
            {/* everything outside the frame, dimmed: one layer with the frame cut out of it */}
            <div
              className="absolute inset-0 bg-black/45"
              style={{
                clipPath: `polygon(0px 0px, ${vp.w}px 0px, ${vp.w}px ${vp.h}px, 0px ${vp.h}px, 0px 0px, ${fx}px ${fy}px, ${fx}px ${fy + fh}px, ${fx + fw}px ${fy + fh}px, ${fx + fw}px ${fy}px, ${fx}px ${fy}px)`,
                transition: `clip-path ${FRAME_EASE}`,
              }}
            />
            {/* the frame itself: a hairline just outside what will be kept */}
            <div
              className="absolute"
              style={{
                left: fx,
                top: fy,
                width: fw,
                height: fh,
                outline: "1px solid rgb(255 255 255 / 0.85)",
                boxShadow: "0 0 0 2px rgb(0 0 0 / 0.16)",
                transition: `left ${FRAME_EASE}, top ${FRAME_EASE}, width ${FRAME_EASE}, height ${FRAME_EASE}`,
              }}
            >
              <div className="absolute inset-0 transition-opacity duration-200" style={{ opacity: grid ? 1 : 0 }}>
                {["left-1/3 inset-y-0 w-px", "left-2/3 inset-y-0 w-px", "top-1/3 inset-x-0 h-px", "top-2/3 inset-x-0 h-px"].map((c) => (
                  <div key={c} className={`absolute bg-white/45 shadow-[0_0_0_0.5px_rgb(0_0_0/0.14)] ${c}`} />
                ))}
              </div>
              <AnimatePresence>
                {blink > 0 && <motion.div key={blink} className="absolute inset-0 bg-black" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.9, 0] }} transition={{ duration: 0.34, times: [0, 0.2, 1], ease: "easeOut" }} />}
              </AnimatePresence>
            </div>
            {/* where the lens was told to focus */}
            <AnimatePresence>
              {mark && (
                <motion.div
                  key={mark.id}
                  className="absolute h-14 w-14 rounded-[12px] border border-white/90 shadow-[0_0_0_1px_rgb(0_0_0/0.18),inset_0_0_0_1px_rgb(0_0_0/0.12)]"
                  style={{ left: mark.x - 28, top: mark.y - 28 }}
                  initial={{ opacity: 0, scale: 1.4 }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [1.4, 1, 1, 1] }}
                  transition={{ duration: 1.5, times: [0, 0.14, 0.72, 1], ease: EASE }}
                  onAnimationComplete={() => setMark((m) => (m && m.id === mark.id ? null : m))}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>

      {/* phones have no keys to read about: one line, gone after the first tap */}
      <AnimatePresence>
        {mobile && hint && (
          <motion.div className="pointer-events-none absolute inset-x-0 top-[62px] z-30 flex justify-center px-4" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
            <Glass className="px-3.5 py-1.5 text-[12px] font-medium text-white/90">Drag to look · two fingers to move · tap to focus</Glass>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex items-end justify-center gap-3 px-3 max-sm:bottom-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-2.5"
        initial={GLASS_IN}
        animate={GLASS_ON}
        exit={GLASS_IN}
        transition={{ ...GLASS_SPRING, delay: 0.06 }}
      >
        {/* the last photographs: tap one to save it */}
        <div className="flex h-12 w-[150px] items-center justify-end gap-2 max-sm:order-2 max-sm:hidden">
          <Shots shots={shots} onSaved={(id) => setShots((s) => s.map((x) => (x.id === id ? { ...x, saved: true } : x)))} />
        </div>
        <Glass radius={24} className="pointer-events-auto flex min-w-0 flex-col p-1 max-sm:order-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => (e.stopPropagation(), release(e))} onWheel={(e) => e.stopPropagation()}>
          <AnimatePresence initial={false}>
            {shown && (
              <motion.div key="dial" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={GLASS_SPRING} className="overflow-hidden">
                <div className="pb-1">
                  {shown === "focus" && (
                    <label className={row}>
                      {name("Focus")}
                      <input type="range" min={0} max={1} step={0.005} value={ringOfFocus(focus)} onChange={(e) => setFocus(focusOfRing(+e.target.value))} onDoubleClick={() => setFocus(30)} className={range} aria-label="Focus distance" aria-valuetext={fmtFocus(focus)} />
                      {value(fmtFocus(focus))}
                    </label>
                  )}
                  {shown === "aperture" && (
                    <label className={row}>
                      {name("Aperture")}
                      <input type="range" min={0} max={F_STOPS.length - 1} step={1} value={stop} onChange={(e) => setStop(+e.target.value)} onDoubleClick={() => setStop(1)} className={range} aria-label="Aperture" aria-valuetext={fmtStop(F_STOPS[stop])} />
                      {value(fmtStop(F_STOPS[stop]))}
                    </label>
                  )}
                  {shown === "zoom" && (
                    <label className={row}>
                      {name("Zoom")}
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.005}
                        value={Math.log(focal / 16) / Math.log(135 / 16)}
                        onChange={(e) => setFocal(16 * Math.pow(135 / 16, +e.target.value))}
                        onDoubleClick={() => setFocal(28)}
                        className={range}
                        aria-label="Focal length"
                        aria-valuetext={`${Math.round(focal)} millimetres`}
                      />
                      {value(`${Math.round(focal)} mm`)}
                    </label>
                  )}
                  {shown === "ev" && (
                    <label className={row}>
                      {name("Exposure")}
                      <input type="range" min={-2} max={2} step={0.1} value={ev} onChange={(e) => setEv(+e.target.value)} onDoubleClick={() => setEv(0)} className={range} aria-label="Exposure" aria-valuetext={`${fmtEv(ev)} stops`} />
                      {value(`${fmtEv(ev)} EV`)}
                    </label>
                  )}
                  {shown === "time" && (
                    <div className={row}>
                      {name("Time")}
                      <input type="range" min={0} max={23.98} step={0.05} value={hours} onChange={(e) => onTime(+e.target.value)} className={range} aria-label="Time of day" aria-valuetext={fmtH(hours)} />
                      <button type="button" className={`lg-btn pointer-events-auto w-[52px] shrink-0 py-0.5 text-[11.5px] font-semibold ${live ? "lg-on" : "lg-chip text-white/90"}`} onClick={onLive}>
                        {live ? "Live" : "Go live"}
                      </button>
                    </div>
                  )}
                  {shown === "aspect" && (
                    <div className="flex h-9 items-center px-1">
                      <div className="flex w-full rounded-full bg-black/18 p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]" role="radiogroup" aria-label="Frame shape">
                        {ASPECTS.map(([n]) => (
                          <button key={n} type="button" role="radio" aria-checked={ratioName === n} className={seg(ratioName === n)} onClick={() => setAspect(n)}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-0.5 max-sm:justify-between">
            {dials.map(([k, label, val, w]) => (
              <button key={k} type="button" className={chip(shown === k, w)} aria-label={`${label}: ${val}`} aria-expanded={shown === k} title={label} onClick={() => setDial((d) => (d === k ? null : k))}>
                {val}
              </button>
            ))}
            <button type="button" className={`${chip(grid)} grid w-8 place-items-center !px-0`} aria-label="Thirds grid" aria-pressed={grid} title="Grid" onClick={() => setGrid((g) => !g)}>
              <Grid3x3 size={14} strokeWidth={1.9} />
            </button>
          </div>
        </Glass>
        <div className="flex h-12 w-[150px] items-center gap-2 max-sm:order-2 max-sm:h-14 max-sm:w-full">
          <div className="hidden flex-1 items-center justify-end gap-2 max-sm:flex">
            <Shots shots={shots} onSaved={(id) => setShots((s) => s.map((x) => (x.id === id ? { ...x, saved: true } : x)))} />
          </div>
          <Glass className="pointer-events-auto shrink-0" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Take photo" className="group grid h-12 w-12 place-items-center rounded-full max-sm:h-14 max-sm:w-14" onClick={(e) => (e.stopPropagation(), shoot())}>
              <span className="h-9 w-9 rounded-full bg-white shadow-[0_1px_6px_rgb(0_0_0/0.25)] transition-transform duration-150 ease-out group-active:scale-90 max-sm:h-11 max-sm:w-11" />
            </button>
          </Glass>
          <div className="hidden flex-1 max-sm:block" />
        </div>
      </motion.div>
    </>
  );
}

// The strip of last photographs. Each is a link to its own PNG: tap to save.
function Shots({ shots, onSaved }: { shots: Shot[]; onSaved: (id: number) => void }) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {[...shots].reverse().map((s) => (
        <motion.a
          key={s.id}
          layout
          href={s.url ?? undefined}
          download={s.name}
          aria-label={s.saved ? "Saved. Save this photo again" : "Save this photo"}
          title={`${s.w} × ${s.h}`}
          className="group pointer-events-auto relative block h-11 shrink-0 overflow-hidden rounded-[9px] shadow-[0_8px_20px_-8px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.4)]"
          style={{ aspectRatio: `${s.w} / ${s.h}`, cursor: s.url ? "pointer" : "progress" }}
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={GLASS_SPRING}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (!s.url) e.preventDefault();
            else onSaved(s.id);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
          <span className={`absolute inset-0 grid place-items-center bg-black/40 text-white transition-opacity duration-150 ${s.saved ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"}`}>
            {s.saved ? <Check size={15} strokeWidth={2.4} /> : <Download size={15} strokeWidth={2.2} />}
          </span>
        </motion.a>
      ))}
    </AnimatePresence>
  );
}

// ---------- music ----------

type Track = { id: string; title: string; artist: string; file: string; cover: string; duration: number };
// The headphones' voice in the audio manager (lib/audio.ts): one element for
// the whole session, owner "headphones". Starting it fades any other music
// out; the manager fades it out when the plane takes off or the OS boots.
const headphones = () => voice("headphones", { channel: "music", owner: "headphones", scene: true });

// Now playing, as one Liquid Glass capsule: artwork, title, a live waveform,
// previous / play / next, and a scrubber along the bottom.
export function MusicUI({ onExit }: { onExit: () => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [len, setLen] = useState(0);
  const wave = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch("/content/music/tracks.json")
      .then((r) => r.json())
      .then((d: Track[]) => setTracks(d))
      .catch(() => {});
    const v = headphones();
    if (!v) return;
    const a = v.el;
    const tick = () => setT(a.currentTime);
    const end = () => setI((x) => x + 1);
    const meta = () => setLen(Number.isFinite(a.duration) ? a.duration : 0);
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    setPlaying(!a.paused);
    a.addEventListener("timeupdate", tick);
    a.addEventListener("ended", end);
    a.addEventListener("loadedmetadata", meta);
    a.addEventListener("playing", on);
    a.addEventListener("pause", off);
    // the mute pill pauses the headphones: nothing plays unheard
    const unmute = onMuteChange(() => {
      if (sceneMuted()) voiceStop(v, 0.3);
    });
    return () => {
      // put down: fade out, then pause
      voiceStop(v, 0.9);
      unmute();
      a.removeEventListener("timeupdate", tick);
      a.removeEventListener("ended", end);
      a.removeEventListener("loadedmetadata", meta);
      a.removeEventListener("playing", on);
      a.removeEventListener("pause", off);
    };
  }, []);

  const track = tracks.length ? tracks[((i % tracks.length) + tracks.length) % tracks.length] : null;
  const start = useCallback(() => {
    if (!track) return;
    // the same file carries on where it is; another one is swapped in under a short dip
    voicePlayUrl(headphones(), track.file, { fade: 0.5 });
  }, [track]);

  // start as soon as the headphones are picked up, and on track change
  // (not while the world is muted: Play asks for sound again)
  useEffect(() => {
    if (track && !sceneMuted()) start();
  }, [track, start]);

  // live waveform: mirrored rounded bars; a slow idle ripple when nothing plays
  useEffect(() => {
    let raf = 0;
    const an = getAnalyser();
    const buf = an ? new Uint8Array(an.frequencyBinCount) : null;
    const N = 30;
    const lvl = new Float32Array(N);
    let cw = 0;
    let ch = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const c = wave.current;
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (!w || !h) return;
      if (w !== cw || h !== ch) {
        c.width = cw = w;
        c.height = ch = h;
      }
      const g = c.getContext("2d")!;
      const live = music.playing && an && buf;
      if (live) an.getByteFrequencyData(buf);
      g.clearRect(0, 0, w, h);
      const step = w / N;
      const bw = Math.max(2 * dpr, step * 0.46);
      for (let k = 0; k < N; k++) {
        // centre-out: the middle bars carry the low end
        const m = Math.abs(k - (N - 1) / 2) / ((N - 1) / 2);
        const bin = 2 + Math.floor(Math.pow(m, 1.5) * 110);
        const v = live ? Math.pow(buf[bin] / 255, 1.25) * (1 - m * 0.25) : 0.1 + 0.07 * Math.sin(now / 520 + k * 0.55);
        lvl[k] += (v - lvl[k]) * (v > lvl[k] ? 0.55 : 0.14);
        const bh = Math.max(bw, lvl[k] * h * 0.96);
        g.fillStyle = `rgba(255,255,255,${(0.55 + 0.45 * lvl[k]).toFixed(3)})`;
        g.beginPath();
        g.roundRect(k * step + (step - bw) / 2, (h - bh) / 2, bw, bh, bw / 2);
        g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const dur = len || track?.duration || 1;
  const bar = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    const el = bar.current;
    const a = headphones()?.el;
    if (!el || !a) return;
    const r = el.getBoundingClientRect();
    const to = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur;
    a.currentTime = to;
    setT(to);
  };
  const icon = "lg-btn pointer-events-auto grid place-items-center text-white";
  const step = (d: number) => {
    play("pop", { volume: 0.35 });
    setI((x) => x + d);
  };
  return (
    <>
      <TopBar title="Music" hint="Headphones on" onExit={onExit} />
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-3">
        <Glass
          radius={34}
          className="pointer-events-auto w-full max-w-[540px] p-2.5 pb-2"
          initial={{ opacity: 0, y: 46, scale: 0.9 }}
          animate={GLASS_ON}
          exit={{ opacity: 0, y: 46, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 320, damping: 26, mass: 0.9 }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <div className="relative h-[58px] w-[58px] shrink-0">
              <AnimatePresence initial={false}>
                {track && (
                  <motion.img
                    key={track.cover}
                    src={track.cover}
                    alt=""
                    className="absolute inset-0 h-full w-full rounded-[18px] object-cover shadow-[0_10px_22px_-8px_rgb(0_0_0/0.6),inset_0_0_0_0.5px_rgb(255_255_255/0.3)]"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: playing ? 1 : 0.9 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 380, damping: 24 }}
                  />
                )}
              </AnimatePresence>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold leading-tight tracking-[-0.025em]">{track?.title ?? "Loading"}</div>
              <div className="mt-0.5 truncate text-[12.5px] leading-tight text-white/80">{track?.artist ?? " "}</div>
            </div>
            <canvas ref={wave} className="h-9 w-[92px] shrink-0 max-[420px]:hidden" aria-hidden />
            <div className="flex shrink-0 items-center">
              <button type="button" aria-label="Previous" className={`${icon} h-9 w-9`} onClick={() => step(-1)}>
                <SkipBack size={17} fill="currentColor" strokeWidth={0} />
              </button>
              <button
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                className={`${icon} h-11 w-11`}
                onClick={() => {
                  if (playing) {
                    // a short fade, then pause
                    voiceStop(headphones(), 0.18);
                    setPlaying(false);
                  } else {
                    if (sceneMuted()) setSceneMuted(false);
                    start();
                  }
                }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={playing ? "pause" : "play"}
                    className="grid place-items-center"
                    initial={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                    animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.5, filter: "blur(4px)" }}
                    transition={{ type: "spring", stiffness: 520, damping: 30 }}
                  >
                    {playing ? <Pause size={24} fill="currentColor" strokeWidth={0} /> : <Play size={24} fill="currentColor" strokeWidth={0} />}
                  </motion.span>
                </AnimatePresence>
              </button>
              <button type="button" aria-label="Next" className={`${icon} h-9 w-9`} onClick={() => step(1)}>
                <SkipForward size={17} fill="currentColor" strokeWidth={0} />
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5 px-1.5 text-[11px] font-medium tabular-nums text-white/70">
            <span className="w-8">{fmt(t)}</span>
            <div
              ref={bar}
              className="group relative h-5 flex-1 cursor-pointer touch-none"
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                seek(e.clientX);
              }}
              onPointerMove={(e) => {
                if (e.buttons) seek(e.clientX);
              }}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(dur)}
              aria-valuenow={Math.round(t)}
            >
              <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 overflow-hidden rounded-full bg-white/24 shadow-[inset_0_0.5px_1px_rgb(0_0_0/0.25)] transition-[height] duration-200 group-hover:h-[7px] group-active:h-[7px]">
                <div className="h-full origin-left rounded-full bg-white" style={{ width: `${Math.min(100, (t / dur) * 100)}%` }} />
              </div>
            </div>
            <span className="w-8 text-right">{fmt(dur)}</span>
          </div>
        </Glass>
      </div>
    </>
  );
}

// ---------- book ----------

export function BookUI({ info, onExit, onPrev, onNext, onApp }: { info: { spread: number; spreads: number; ready: boolean }; onExit: () => void; onPrev: () => void; onNext: () => void; onApp: () => void }) {
  return (
    <>
      <TopBar title="Žiemos naktys šviesesnės" hint="Click or drag a page, or use ← →" exitLabel="Close book" onExit={onExit} />
      <Bottom>
        <Glass className="pointer-events-auto flex items-center gap-1 p-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={btn} onClick={onPrev} aria-label="Previous page">
            ←
          </button>
          <span className="min-w-[72px] text-center text-[12px] tabular-nums text-white/70">{info.ready ? `${info.spread + 1} / ${info.spreads}` : "Opening…"}</span>
          <button type="button" className={btn} onClick={onNext} aria-label="Next page">
            →
          </button>
          <span className="mx-1 h-4 w-px bg-white/25" />
          <button type="button" className={btn} onClick={onApp}>
            Read in the Novel app
          </button>
          <a className={btn + " inline-flex items-center"} href="/content/novel/Ziemos_Naktys_Sviesesnes.epub" download>
            EPUB
          </a>
          <a className={btn + " inline-flex items-center"} href="/content/novel/Ziemos_Naktys_Sviesesnes.pdf" download>
            PDF
          </a>
        </Glass>
      </Bottom>
    </>
  );
}

// ---------- sketch ----------

export function SketchUI({ onExit, onClear, onSave }: { onExit: () => void; onClear: () => void; onSave: () => void }) {
  return (
    <>
      <TopBar title="Sketchbook" hint="Draw on the page" onExit={onExit} />
      <Bottom>
        <Glass className="pointer-events-auto flex items-center gap-1 p-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={btn} onClick={onClear}>
            Clear
          </button>
          <button type="button" className={btn} onClick={onSave}>
            Save PNG
          </button>
        </Glass>
      </Bottom>
    </>
  );
}

// ---------- flight ----------

// The flight's few controls: how fast, whether the quiet hand may take over,
// and the way home. On entering a world its name is shown for a while, quietly.
export function FlightUI({ onLand, mobile, flying }: { onLand: () => void; mobile: boolean; flying: boolean }) {
  const world = useWorld();
  const entered = useVoyageTick();
  const flags = useFlightFlags();
  const guide = (flags & 1) > 0;
  const guided = (flags & 2) > 0;
  // the throttle is also worked from the keys and the wheel: the slider follows
  const [thr, setThr] = useState(voyage.throttle);
  useEffect(() => {
    let raf = 0;
    let last = voyage.throttle;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (Math.abs(voyage.throttle - last) > 0.004) setThr((last = voyage.throttle));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // the title card: once the cloud has opened on a world, for a few seconds
  const [card, setCard] = useState(false);
  useEffect(() => {
    if (!flying) {
      setCard(false);
      return;
    }
    const a = window.setTimeout(() => setCard(true), entered ? 1900 : 900);
    const b = window.setTimeout(() => setCard(false), (entered ? 1900 : 900) + 7500);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      setCard(false);
    };
  }, [world, entered, flying]);
  const def = WORLDS[world];
  const sub = world === "home" ? "The path of angels" : def.year ? `M. K. Čiurlionis, ${def.year}` : "";
  return (
    <>
      <TopBar title="Paper plane" hint={mobile ? "Drag to steer" : "Mouse steers · W S or scroll for speed"} exitLabel="Land" onExit={onLand} />
      <Bottom>
        <Glass className="pointer-events-auto flex items-center gap-2.5 p-1 pl-4" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <label className="flex items-center gap-2.5">
            <span className="text-[12.5px] font-medium text-white/75">Speed</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={thr}
              onChange={(e) => {
                voyage.throttle = +e.target.value;
                setThr(+e.target.value);
              }}
              className="h-1 w-28 min-w-0 cursor-pointer accent-white max-sm:w-24"
              aria-label="Speed"
              aria-valuetext={thr < 0.2 ? "Slow glide" : thr < 0.6 ? "Cruise" : "Fast"}
            />
          </label>
          <button
            type="button"
            aria-pressed={guide}
            title="When you let go of the controls for a moment, the plane follows the path of light on its own"
            className={`lg-btn pointer-events-auto flex h-7 items-center gap-1.5 whitespace-nowrap px-3 text-[12.5px] font-medium ${guide ? "lg-on" : "lg-chip text-white/90"}`}
            onClick={() => setGuide(!guide)}
          >
            {/* lit while the quiet hand has the plane */}
            <span className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${guide && guided ? "bg-amber-500" : guide ? "bg-black/25" : "bg-white/35"}`} />
            Follow the path
          </button>
        </Glass>
      </Bottom>
      {/* where you are: the painting this world is built from */}
      <div className="pointer-events-none absolute bottom-6 left-5 z-30 max-sm:bottom-20 max-sm:left-3">
        <AnimatePresence mode="wait">
          {card && (
            <Glass key={world} radius={22} lens={false} className="px-4 py-2.5" initial={GLASS_IN} animate={GLASS_ON} exit={GLASS_IN} transition={GLASS_SPRING}>
              <div className="text-[15px] font-semibold leading-tight tracking-[-0.03em]">{def.title}</div>
              {sub && <div className="mt-0.5 text-[12.5px] leading-tight text-white/70">{sub}</div>}
            </Glass>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------- navigation + time of day ----------

const fmtH = (h: number) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

// A small Liquid Glass bar, bottom left: Orbit / Explore, Back to desk, and a
// time-of-day scrubber that previews the sky (Live snaps back to the clock).
export function NavBar({
  nav,
  onNav,
  onBack,
  hours,
  live,
  onTime,
  onLive,
  label,
}: {
  nav: "orbit" | "explore";
  onNav: (n: "orbit" | "explore") => void;
  onBack: () => void;
  hours: number;
  live: boolean;
  onTime: (h: number) => void;
  onLive: () => void;
  label: string;
}) {
  const seg = (on: boolean) => `lg-btn pointer-events-auto h-7 px-3 text-[12.5px] font-medium ${on ? "lg-on" : "text-white/90"}`;
  const [gfx, setGfx] = useState(false);
  const choice = useQualityChoice();
  const quality = useQuality();
  return (
    <div className="pointer-events-none absolute bottom-5 left-4 z-30 max-sm:bottom-auto max-sm:left-3 max-sm:top-14">
      <Glass
        radius={22}
        className="pointer-events-auto flex flex-col gap-1.5 p-1.5"
        initial={GLASS_IN}
        animate={GLASS_ON}
        exit={GLASS_IN}
        transition={GLASS_SPRING}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1">
          <div className="flex rounded-full bg-black/18 p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]">
            <button type="button" className={seg(nav === "orbit")} onClick={() => onNav("orbit")}>
              Orbit
            </button>
            <button type="button" className={seg(nav === "explore")} onClick={() => onNav("explore")}>
              Explore
            </button>
          </div>
          <AnimatePresence>
            {nav === "explore" && (
              <motion.button
                type="button"
                className="lg-btn lg-chip pointer-events-auto h-7 px-3 text-[12.5px] font-medium text-white/92"
                initial={{ opacity: 0, x: -6, scale: 0.94 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -6, scale: 0.94 }}
                transition={GLASS_SPRING}
                onClick={onBack}
              >
                Back to desk
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2 px-1.5 pb-0.5">
          <span className="w-10 text-[12px] font-semibold tabular-nums">{fmtH(hours)}</span>
          <input
            type="range"
            min={0}
            max={23.98}
            step={0.05}
            value={hours}
            onChange={(e) => onTime(+e.target.value)}
            className="h-1 w-36 cursor-pointer accent-white"
            aria-label="Time of day"
          />
          <button
            type="button"
            className={`lg-btn pointer-events-auto px-2 py-0.5 text-[11.5px] font-semibold ${live ? "lg-on" : "lg-chip text-white/90"}`}
            onClick={onLive}
          >
            {live ? "Live" : "Go live"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 px-2 pb-0.5 text-[11px] text-white/65">
          <span>{nav === "explore" ? "Drag to look · W A S D to move · scroll to fly forward" : label}</span>
          <button type="button" className="lg-btn pointer-events-auto -mr-1 px-1.5 py-0.5 text-[11px] font-medium text-white/85" aria-expanded={gfx} onClick={() => setGfx((g) => !g)}>
            Graphics · {QUALITY_LABELS[choice]}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {gfx && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={GLASS_SPRING} className="overflow-hidden">
              <div className="flex flex-col gap-1.5 px-1 pb-1 pt-0.5">
                <div className="flex rounded-full bg-black/18 p-0.5 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]">
                  {(["auto", "low", "medium", "high", "ultra"] as QualityChoice[]).map((c) => (
                    <button key={c} type="button" className={`lg-btn pointer-events-auto h-6 flex-1 px-2 text-[11.5px] font-medium ${choice === c ? "lg-on" : "text-white/90"}`} onClick={() => setQualityChoice(c)}>
                      {QUALITY_LABELS[c]}
                    </button>
                  ))}
                </div>
                {(
                  [
                    ["Resolution", "resolution", (quality.dpr - 0.75) / 1.25],
                    ["Grass", "grass", (quality.grass - 0.2) / 1.3],
                    ["Effects", "effects", quality.effects],
                  ] as [string, "resolution" | "grass" | "effects", number][]
                ).map(([name, key, v]) => (
                  <label key={key} className="flex items-center gap-2 px-1 text-[11.5px] text-white/80">
                    <span className="w-[68px]">{name}</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      defaultValue={Math.min(1, Math.max(0, v))}
                      key={`${key}-${choice}-${quality.preset}`}
                      onPointerUp={(e) => setQualityOverride(key, +(e.target as HTMLInputElement).value)}
                      onKeyUp={(e) => setQualityOverride(key, +(e.target as HTMLInputElement).value)}
                      className="h-1 flex-1 cursor-pointer accent-white"
                      aria-label={name}
                    />
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Glass>
    </div>
  );
}
