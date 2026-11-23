"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUp, Download, EyeOff, Grid3x3, LayoutGrid, LocateFixed, Lock, LockOpen, Minus, Moon, Pause, PlaneLanding, Play, Plus, Route, Settings2, SkipBack, SkipForward, Smartphone, Sun, Volume2, VolumeX, X, MousePointer2 } from "lucide-react";
import { mouseLook } from "./Plane";
import { gyroAvailable, gyroCentre, gyroStart, gyroStop } from "@/lib/gyro";
import { getAnalyser, music, onMuteChange, sceneMuted, setSceneMuted, voice, voicePlayUrl, voiceStop } from "@/lib/audio";
import { FPS_CHOICES, FPS_LABELS, PRESET_LABELS, QUALITY_LABELS, RES_LABELS, setFrameCap, setQualityChoice, setQualityLevel, setQualityOverride, setResolution, useQuality, useQualityChoice, useQualitySettings, type Preset, type QualityChoice, type Res } from "@/lib/quality";
import { togglePause, usePaused } from "@/lib/pause";
import { play } from "@/lib/sfx";
import { setMusicMuted, setMusicVolume, useMusic } from "@/lib/musicDirector";
import { WORLDS, WORLD_ORDER, markEntered, setFlight, setGuide, travelStep, travelTo, useFlightFlags, useTravel, useVoyageTick, useWorld, voyage, type WorldId } from "./worlds/voyage";
import { GLASS_IN, GLASS_ON, GLASS_SPRING, Glass } from "./Glass";
import { photoCtl, postCtl, type Capture } from "./Post";

// DOM controls for the focused desk modes. Quiet, glassy, dark-on-light pills
// that sit over the 3D scene. Every mode has the same exit: Esc or "Put down".

const EASE = [0.22, 1, 0.36, 1] as const;
// Safe-area insets, so glass never sits under a notch, a rounded corner or the home bar.
const SAFE = {
  t: "max(12px, env(safe-area-inset-top))",
  b: "max(12px, env(safe-area-inset-bottom))",
  l: "max(14px, env(safe-area-inset-left))",
  r: "max(14px, env(safe-area-inset-right))",
};
const btn = "lg-btn pointer-events-auto h-8 px-3.5 text-[13px] font-medium text-white/92";

// A hint is shown once, briefly, and never again (remembered in the browser, per hint).
function useOnce(key: string | null, delay = 1000, hold = 5200) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!key) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(`ag-hint-${key}`) === "1";
    } catch {
      /* storage blocked: it is shown this once */
    }
    if (seen) return;
    const a = window.setTimeout(() => {
      setShow(true);
      // (remembered only once it has really been on screen)
      try {
        window.localStorage.setItem(`ag-hint-${key}`, "1");
      } catch {
        /* not remembered */
      }
    }, delay);
    const b = window.setTimeout(() => setShow(false), delay + hold);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [key, delay, hold]);
  return show;
}
// One quiet line in a small piece of glass, so it reads over a pale page as well as a dark sky: shown once, for a few seconds.
function OnceHint({ id, children, at = "top-[60px]" }: { id: string; children: React.ReactNode; at?: string }) {
  const show = useOnce(id);
  return (
    <AnimatePresence>
      {show && (
        <motion.div key={id} data-hint={id} className={`pointer-events-none absolute inset-x-0 z-30 flex justify-center px-5 ${at}`} initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.6, ease: EASE }}>
          <Glass radius={18} lens={false} panel className="px-3.5 py-1.5 text-center text-[12.5px] font-medium tracking-[-0.01em] text-white/95">
            {children}
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// What every focus mode shares: one small glass capsule in the corner, the way out and the name of what you
// are holding. No bar across the top and no standing explanation: a mode's hint is one line, shown once.
export function TopBar({ title, hint, hintId, exitLabel = "Put down", onExit }: { title: string; hint?: string; hintId?: string; exitLabel?: string; onExit: () => void }) {
  return (
    <>
      <div className="pointer-events-none absolute z-30" style={{ top: SAFE.t, left: SAFE.l }}>
        <Glass
          className="flex min-w-0 items-center gap-1 p-0.5 pr-3.5"
          initial={{ ...GLASS_IN, y: -10 }}
          animate={GLASS_ON}
          exit={{ ...GLASS_IN, y: -10 }}
          transition={GLASS_SPRING}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            data-mode-exit=""
            aria-label={`${exitLabel} (Esc)`}
            title={`${exitLabel} · Esc`}
            className="lg-btn pointer-events-auto grid h-8 w-8 shrink-0 place-items-center text-white [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            onClick={(e) => (e.stopPropagation(), onExit())}
          >
            <X size={15} strokeWidth={2.2} />
          </button>
          <span className="min-w-0 max-w-[46vw] truncate text-[13px] font-semibold tracking-[-0.02em]">{title}</span>
        </Glass>
      </div>
      {hint && hintId && <OnceHint id={hintId}>{hint}</OnceHint>}
    </>
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
  return <TopBar title="Piano" hint="Click the keys, or play A–L and W E T Y U O P" hintId="piano" onExit={onExit} />;
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
// the hour slider runs from one dawn round to the next: the day on the left under the sun, the night on the right under the moon
const DAWN = 5;
const DAY_TRACK = "linear-gradient(90deg,#f3a98a 0%,#ffd9a8 5%,#a9d6ff 13%,#cfe8ff 34%,#ffe2ad 52%,#ff9d6c 62%,#7a5a9a 68%,#2a3470 76%,#161c44 90%,#5d4f86 97%,#f3a98a 100%)";

type Shot = { id: number; thumb: string; url: string | null; name: string; w: number; h: number; saved: boolean };
type Dial = "focus" | "aperture" | "zoom" | "ev" | "aspect";
let shotSeq = 0;

export function CameraUI({
  mobile,
  onExit,
  onShoot,
  onLift,
  hours,
  live,
  onTime,
  onLive,
}: {
  mobile: boolean;
  onExit: () => void;
  onShoot: () => Capture | null;
  onLift: (dir: -1 | 0 | 1) => void;
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
    };
    photoCtl.onWheel = (dy) => setFocal((f) => Math.min(135, Math.max(16, f * Math.exp(-dy * 0.0012))));
    const t = window.setInterval(() => setLens(postCtl.level), 700);
    return () => {
      photoCtl.onFocus = null;
      photoCtl.onWheel = null;
      photoCtl.frame = { x: 0, y: 0, w: 1, h: 1 };
      window.clearInterval(t);
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
      // (Space is no longer the shutter: it lifts the camera, with Shift to bring it down: Room's photoStep)
      if (e.key !== "Enter") return;
      // a focused control keeps its own Enter
      if ((e.target as HTMLElement | null)?.closest?.("button, a, input")) return;
      e.preventDefault();
      if (!e.repeat) shoot();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  // a click hands the keyboard back to the camera (Space lifts it, Enter is the shutter); keyboard focus stays where it was put
  const release = (e: React.MouseEvent) => {
    if (e.detail > 0) (document.activeElement as HTMLElement | null)?.blur?.();
  };
  const chip = (on: boolean, wide = "") => `lg-btn pointer-events-auto h-8 shrink-0 px-2.5 text-[12.5px] font-medium tabular-nums max-sm:px-2 max-sm:text-[12px] ${wide} ${on ? "lg-on" : "text-white/92"}`;
  const seg = (on: boolean) => `lg-btn pointer-events-auto h-7 flex-1 px-2.5 text-[12.5px] font-medium tabular-nums ${on ? "lg-on" : "text-white/90"}`;
  const range = "lg-range min-w-0 flex-1";
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
    ["aspect", "Frame", ratioName, "min-w-[42px]"],
  ];
  const shown = dial && dials.some((d) => d[0] === dial) ? dial : null;
  const row = "flex h-9 items-center gap-3 px-3 text-[12.5px]";
  const name = (s: string) => <span className="w-[62px] shrink-0 text-white/70">{s}</span>;
  const value = (s: string) => <span className="w-[52px] shrink-0 text-right font-medium tabular-nums">{s}</span>;

  return (
    <>
      <TopBar title="Camera" hint={mobile ? "Drag to look · two fingers to move · tap to focus" : "W A S D to move · Space up · Shift down · drag to look · click to focus · Enter to shoot"} hintId={mobile ? "camera" : "camera-keys"} onExit={onExit} />
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
        <Glass radius={24} panel className="pointer-events-auto flex min-w-0 flex-col p-1 max-sm:order-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => (e.stopPropagation(), release(e))} onWheel={(e) => e.stopPropagation()}>
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
                  {shown === "aspect" && (
                    <div className="flex h-9 items-center px-1">
                      <div className="flex w-full gap-0.5 rounded-full" role="radiogroup" aria-label="Frame shape">
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
          {/* the hour: always there, from one dawn round to the next, with the way back to the visitor's own clock */}
          <div className="flex h-9 items-center gap-2 pl-2.5 pr-1" data-camera="time">
            <Sun size={14} strokeWidth={2} className="shrink-0 text-white/90" aria-hidden />
            <input
              type="range"
              min={0}
              max={23.95}
              step={0.05}
              value={(hours - DAWN + 24) % 24}
              onChange={(e) => onTime((+e.target.value + DAWN) % 24)}
              className="lg-range min-w-0 flex-1"
              style={{ "--lg-track": DAY_TRACK } as React.CSSProperties}
              aria-label="Time of day"
              aria-valuetext={fmtH(hours)}
            />
            <Moon size={13} strokeWidth={2} className="shrink-0 text-white/90" aria-hidden />
            <span className="w-[40px] shrink-0 text-right text-[12.5px] font-medium tabular-nums">{fmtH(hours)}</span>
            <button type="button" aria-pressed={live} aria-label={live ? "The sky follows your clock" : "Go back to your own time"} className={`lg-btn pointer-events-auto flex h-7 shrink-0 items-center gap-1.5 px-2.5 text-[12px] font-semibold ${live ? "lg-on" : "text-white/92"}`} onClick={onLive}>
              <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-500" : "bg-white/50"}`} />
              Live
            </button>
          </div>
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
            <button type="button" aria-label="Take photo (Enter)" className="group grid h-12 w-12 place-items-center rounded-full max-sm:h-14 max-sm:w-14" onClick={(e) => (e.stopPropagation(), release(e), shoot())}>
              <span className="h-9 w-9 rounded-full bg-white shadow-[0_1px_6px_rgb(0_0_0/0.25)] transition-transform duration-150 ease-out group-active:scale-90 max-sm:h-11 max-sm:w-11" />
            </button>
          </Glass>
          {/* with no keyboard: the camera is raised and lowered from two small buttons, held down */}
          {mobile ? (
            <div className="flex flex-1 items-center justify-end">
              <Glass className="pointer-events-auto flex shrink-0 items-center p-0.5" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} data-camera="lift">
                {([1, -1] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-label={d > 0 ? "Raise the camera" : "Lower the camera"}
                    className="lg-btn grid h-10 w-10 touch-none select-none place-items-center text-white/95"
                    onPointerDown={(e) => {
                      // (held: the finger may slide off the button and the camera still moves until it lifts)
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        /* not captured: letting go over the button still stops it */
                      }
                      onLift(d);
                    }}
                    onPointerUp={() => onLift(0)}
                    onPointerCancel={() => onLift(0)}
                    onLostPointerCapture={() => onLift(0)}
                    onPointerLeave={(e) => !e.currentTarget.hasPointerCapture(e.pointerId) && onLift(0)}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {d > 0 ? <ChevronUp size={18} strokeWidth={2.2} /> : <ChevronDown size={18} strokeWidth={2.2} />}
                  </button>
                ))}
              </Glass>
            </div>
          ) : (
            <div className="hidden flex-1 max-sm:block" />
          )}
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
    voicePlayUrl(headphones(), track.file, { fade: 1.2 });
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
      <TopBar title="Music" onExit={onExit} />
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center px-3">
        <Glass
          radius={34}
          panel
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
              <button type="button" aria-label="Previous" className={`${icon} h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-10`} onClick={() => step(-1)}>
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
              <button type="button" aria-label="Next" className={`${icon} h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-10`} onClick={() => step(1)}>
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

export function BookUI({ info, page, onExit, onPrev, onNext, onApp }: { info: { spread: number; spreads: number; ready: boolean }; page?: { n: number; of: number }; onExit: () => void; onPrev: () => void; onNext: () => void; onApp: () => void }) {
  const total = info.spreads * 2 - 2;
  const where = !info.ready ? "Opening…" : page ? `${page.n}` : info.spread === 0 ? "1" : 2 * info.spread + 1 > total ? `${2 * info.spread}` : `${2 * info.spread}–${2 * info.spread + 1}`;
  const arrow = "lg-btn pointer-events-auto grid h-7 w-7 shrink-0 place-items-center text-white/95 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10";
  const link = "lg-btn pointer-events-auto inline-flex h-7 items-center px-2.5 text-[12px] font-medium text-white/92 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:text-[13px]";
  return (
    <>
      <TopBar title="Novel" hint="Click or drag a page, or use ← →" hintId="book" exitLabel="Close book" onExit={onExit} />
      <Bottom>
        {/* one small pill of the family: the pages (arrows, where you are), then where else to read it; two rows on a phone */}
        <Glass radius={20} panel className="pointer-events-auto flex items-center gap-0.5 p-0.5 max-sm:flex-col max-sm:gap-0" data-book="bar" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex items-center">
            <button type="button" className={arrow} onClick={onPrev} aria-label="Previous page">
              <ChevronLeft size={15} strokeWidth={2.2} />
            </button>
            <span className="min-w-[78px] whitespace-nowrap px-1 text-center text-[12px] font-medium tabular-nums tracking-[-0.01em] text-white/95" aria-live="polite" data-book="page">
              {where}
              {info.ready && <span className="text-white/55"> / {page ? page.of : total}</span>}
            </span>
            <button type="button" className={arrow} onClick={onNext} aria-label="Next page">
              <ChevronRight size={15} strokeWidth={2.2} />
            </button>
          </div>
          <span className="mx-1 h-3.5 w-px bg-white/22 max-sm:hidden" />
          <div className="flex items-center whitespace-nowrap">
            <button type="button" className={link} onClick={onApp}>
              Read in the Novel app
            </button>
            <a className={link} href="/content/novel/Ziemos_Naktys_Sviesesnes.epub" download>
              EPUB
            </a>
            <a className={link} href="/content/novel/Ziemos_Naktys_Sviesesnes.pdf" download>
              PDF
            </a>
          </div>
        </Glass>
      </Bottom>
    </>
  );
}

// ---------- sketch ----------

export function SketchUI({ onExit, onClear, onSave }: { onExit: () => void; onClear: () => void; onSave: () => void }) {
  const tall = `${btn} [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-4 [@media(pointer:coarse)]:text-[14px]`;
  return (
    <>
      <TopBar title="Sketchbook" hint="Draw on the page" hintId="sketch" onExit={onExit} />
      <Bottom>
        <Glass className="pointer-events-auto flex items-center gap-1 p-1" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className={tall} onClick={onClear}>
            Clear
          </button>
          <button type="button" className={tall} onClick={onSave}>
            Save PNG
          </button>
        </Glass>
      </Bottom>
    </>
  );
}

// ---------- flight ----------

// The stick, for a thumb: a glass dish with a bead in it. The bead follows the thumb to the rim and springs back
// when it lifts; a small dead middle means resting a thumb on it does nothing. What it sends is eased again by
// the plane itself, so nothing here can make it twitch.
function Stick({ onStick }: { onStick: (x: number, y: number) => void }) {
  const knob = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const R = 38;
  const DEAD = 0.14;
  const put = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx *= R / len;
      dy *= R / len;
    }
    if (knob.current) {
      knob.current.style.transition = "none";
      knob.current.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
    const m = Math.min(1, len / R);
    const k = m < DEAD ? 0 : (m - DEAD) / (1 - DEAD) / Math.max(m, 1e-3);
    // a little less than full bank and a gentler climb: a thumb is a blunt thing
    onStick((dx / R) * k * 0.86, (-dy / R) * k * 0.78);
  };
  const lift = (e: React.PointerEvent) => {
    if (id.current !== e.pointerId) return;
    id.current = null;
    if (knob.current) {
      knob.current.style.transition = "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)";
      knob.current.style.transform = "translate(0px, 0px)";
    }
    onStick(0, 0);
  };
  useEffect(() => () => onStick(0, 0), [onStick]);
  return (
    <Glass
      lens={false}
      className="pointer-events-auto grid h-[116px] w-[116px] touch-none place-items-center"
      initial={GLASS_IN}
      animate={GLASS_ON}
      exit={GLASS_IN}
      transition={GLASS_SPRING}
      role="application"
      aria-label="Steer: drag to bank, climb and dive"
      data-flight="stick"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (id.current !== null) return;
        id.current = e.pointerId;
        put(e);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* a pointer that cannot be captured still steers while it stays over the control */
        }
      }}
      onPointerMove={(e) => {
        if (id.current === e.pointerId) put(e);
      }}
      onPointerUp={lift}
      onPointerCancel={lift}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="pointer-events-none absolute inset-[15px] rounded-full shadow-[0_0_0_0.5px_rgb(255_255_255/0.32)]" />
      <div ref={knob} className="pointer-events-none relative h-[46px] w-[46px] rounded-full bg-white/90 shadow-[0_0_0_0.5px_rgb(255_255_255/0.8),0_2px_10px_rgb(0_0_0/0.18)]" />
    </Glass>
  );
}

// The throttle, for the other thumb: an upright glass slot on the right edge. Up is fast, the foot is a glide
// that barely moves. It takes the thumb wherever it lands and follows it.
function Throttle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const id = useRef<number | null>(null);
  const cur = useRef(value);
  cur.current = value;
  // let go, it settles on the nearest of the four speeds (slow, cruise, fast, very fast)
  const settle = () => {
    id.current = null;
    onChange(SPEED_STEPS[stepOf(cur.current)]);
  };
  const PAD = 22;
  const put = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, 1 - (e.clientY - r.top - PAD) / Math.max(1, r.height - PAD * 2))));
  };
  return (
    <Glass
      lens={false}
      className="pointer-events-auto relative h-[176px] w-12 touch-none landscape:h-[min(176px,calc(100dvh-150px))]"
      initial={GLASS_IN}
      animate={GLASS_ON}
      exit={GLASS_IN}
      transition={GLASS_SPRING}
      role="slider"
      tabIndex={0}
      aria-label="Speed"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={SPEED_NAMES[stepOf(value)]}
      data-flight="throttle"
      onPointerDown={(e) => {
        e.stopPropagation();
        id.current = e.pointerId;
        put(e);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* a pointer that cannot be captured still steers while it stays over the control */
        }
      }}
      onPointerMove={(e) => {
        if (id.current === e.pointerId) put(e);
      }}
      onPointerUp={settle}
      onPointerCancel={settle}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          onChange(SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, Math.max(0, stepOf(value) + (e.key === "ArrowUp" ? 1 : -1)))]);
        }
      }}
    >
      <span className="pointer-events-none absolute inset-x-0 top-[9px] grid place-items-center text-white/70">
        <ChevronsUp size={15} strokeWidth={2.2} />
      </span>
      <span className="pointer-events-none absolute inset-x-[22.5px] bottom-[22px] top-[26px] rounded-full bg-white/30">
        <span className="absolute inset-x-0 bottom-0 rounded-full bg-white/95" style={{ height: `${value * 100}%` }} />
      </span>
      {/* the four speeds, as notches beside the slot */}
      <span className="pointer-events-none absolute bottom-[22px] left-[9px] top-[26px]">
        {SPEED_STEPS.map((v, i) => (
          <span key={i} className={`absolute h-[2px] w-[6px] translate-y-1/2 rounded-full transition-colors duration-300 ${stepOf(value) === i ? "bg-white" : "bg-white/40"}`} style={{ bottom: `${v * 100}%` }} />
        ))}
      </span>
      <span className="pointer-events-none absolute inset-x-0 bottom-[22px] top-[26px]">
        <span className="absolute left-1/2 h-[18px] w-8 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/95 shadow-[0_0_0_0.5px_rgb(255_255_255/0.8),0_2px_8px_rgb(0_0_0/0.2)]" style={{ bottom: `${value * 100}%` }} />
      </span>
    </Glass>
  );
}

// The names shown in the scene's UI are English everywhere (the list itself, and its order, come from voyage.ts;
// a world this table has not heard of yet shows its own title).
const WORLD_NAMES: Partial<Record<WorldId, string>> = {
  home: "Home",
  friendship: "Friendship",
  sun: "Sonata of the Sun",
  stars: "Sonata of the Stars",
  rex: "Rex",
  fairy: "Castle Fairy Tale",
  paradise: "Paradise",
  gate: "The Offering",
  seafinale: "Sonata of the Sea: Finale",
  sea: "Tranquility",
  funeral: "Funeral Symphony VI",
  kings: "Fairy Tale of the Kings",
};
export const worldName = (id: WorldId) => WORLD_NAMES[id] ?? WORLDS[id].title;
// The worlds, as a small glass list of their paintings: one tap and the cloud closes and opens on that world.
// The row tapped lights at once and carries a breathing bead until the plane is there (the list itself closes on
// the tap; opened again mid-crossing it shows where the plane is going, and another tap leads there instead).
const thumbOf = (id: WorldId) => (id === "home" ? null : `/assets/ciurlionis/${WORLDS[id].canvases[0]?.painting ?? id}.jpg`);
function WorldsList({ current, pending, onPick, mobile }: { current: WorldId; pending: WorldId | null; onPick: (id: WorldId) => void; mobile: boolean }) {
  // (the list is on its way out from the moment of the tap, and a leaving list no longer hears from above: the row
  // tapped is remembered here, so it is the one seen lit as the list goes)
  const [tapped, setTapped] = useState<WorldId | null>(null);
  const going = tapped ?? pending;
  // (a phone on its side is shorter than the list: there it scrolls inside its own glass, opened on the world that is lit)
  // (in braces: newer browsers return a promise from scrollIntoView, and an effect may only return its clean-up)
  useEffect(() => {
    document.querySelector('[data-flight="worlds"] .lg-on')?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <Glass radius={22} panel className={`pointer-events-auto flex max-h-[calc(100dvh-124px)] origin-bottom flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:none] ${mobile ? "w-[236px]" : "w-[228px]"}`} initial={{ opacity: 0, y: 14, scale: 0.86 }} animate={GLASS_ON} exit={{ opacity: 0, y: 10, scale: 0.9 }} transition={GLASS_SPRING} data-flight="worlds">
      {WORLD_ORDER.map((id) => {
        const t = thumbOf(id);
        const on = id === (going ?? current);
        return (
          <button
            key={id}
            type="button"
            aria-current={id === current ? "true" : undefined}
            data-pending={id === going && id !== current ? "" : undefined}
            className={`lg-btn flex shrink-0 items-center gap-2.5 !rounded-[15px] px-1.5 text-left ${mobile ? "h-11" : "h-9"} ${on ? "lg-on" : "text-white/95"}`}
            onClick={(e) => {
              e.stopPropagation();
              setTapped(id);
              onPick(id);
            }}
          >
            <span className="h-7 w-7 shrink-0 overflow-hidden rounded-[9px] bg-white/15">
              {t ? <img src={t} alt="" className="h-full w-full object-cover" decoding="async" /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium tracking-[-0.01em]">{worldName(id)}</span>
            {id === going && id !== current && <span aria-hidden className="mr-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-black/60" />}
          </button>
        );
      })}
    </Glass>
  );
}

// The speed, in four steps: slow, cruise, fast, very fast. Minus and plus step it down and up, a bar can be
// tapped to go straight to it, and its name stands above it for a moment when it changes. The keys (Shift or E
// faster, Ctrl or Q slower) move the same throttle smoothly, and the bars follow.
export const SPEED_STEPS = [0.12, 0.42, 0.72, 1];
const SPEED_NAMES = ["Slow", "Cruise", "Fast", "Very fast"];
const stepOf = (thr: number) => SPEED_STEPS.reduce((best, v, i) => (Math.abs(v - thr) < Math.abs(SPEED_STEPS[best] - thr) ? i : best), 0);
function SpeedSteps({ value, onChange, size }: { value: number; onChange: (v: number) => void; size: number }) {
  const step = stepOf(value);
  const [said, setSaid] = useState<number | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaid(step);
    const t = window.setTimeout(() => setSaid(null), 1300);
    return () => window.clearTimeout(t);
  }, [step]);
  const go = (i: number) => onChange(SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, Math.max(0, i))]);
  const side = `lg-btn pointer-events-auto grid shrink-0 place-items-center text-white/95 disabled:opacity-35`;
  return (
    <div className="relative flex shrink-0 items-center" role="group" aria-label="Speed" data-flight="speed">
      <button type="button" aria-label="Slower (Ctrl or Q)" className={side} style={{ height: size, width: size * 0.8 }} disabled={step === 0} onClick={() => go(step - 1)}>
        <Minus size={13} strokeWidth={2.4} />
      </button>
      <div className="flex items-end gap-[3px] px-0.5" style={{ height: size }} role="radiogroup" aria-label="Speed">
        {SPEED_STEPS.map((_, i) => (
          <button key={i} type="button" role="radio" aria-checked={i === step} aria-label={SPEED_NAMES[i]} data-speed={i} className="pointer-events-auto flex h-full w-[9px] items-center justify-center" onClick={() => go(i)}>
            <span className="w-[5px] rounded-full transition-[background-color,height,transform] duration-300 [transition-timing-function:var(--lg-spring)]" style={{ height: 7 + i * 4, backgroundColor: i <= step ? "#fff" : "rgb(255 255 255 / 0.3)", transform: i === step ? "scaleX(1.25)" : undefined }} />
          </button>
        ))}
      </div>
      <button type="button" aria-label="Faster (Shift or E)" className={side} style={{ height: size, width: size * 0.8 }} disabled={step === SPEED_STEPS.length - 1} onClick={() => go(step + 1)}>
        <Plus size={13} strokeWidth={2.4} />
      </button>
      <AnimatePresence>
        {said !== null && (
          <motion.span key={said} className="pointer-events-none absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 whitespace-nowrap text-[11.5px] font-medium text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.6),0_0_2px_rgb(0_0_0/0.35)]" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 0.95, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} data-flight="speed-name">
            {SPEED_NAMES[said]}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// The chrome over the flight comes and goes on its own. Left alone for a few seconds it fades to almost nothing;
// the pointer (or a touch) brings it back. H, or the eye, hides every piece of glass for a view with nothing on it;
// it comes back on H, Esc, any key that does not fly the plane, or a click (a drag still only looks). On a phone
// a two-finger tap hides and shows it, and one tap brings it back.
const FLYING_KEYS = new Set(["w", "a", "s", "d", "q", "e", " ", "shift", "control", "arrowup", "arrowdown", "arrowleft", "arrowright", "[", "]", "meta", "alt", "tab", "capslock"]);
function useChrome(on: boolean) {
  const [hidden, setHidden] = useState(false);
  const [idle, setIdle] = useState(false);
  const hid = useRef(false);
  hid.current = hidden;
  const wakeRef = useRef<() => void>(() => {});
  useEffect(() => {
    document.documentElement.toggleAttribute("data-ui-hidden", on && hidden);
    return () => document.documentElement.removeAttribute("data-ui-hidden");
  }, [on, hidden]);
  useEffect(() => {
    if (!on) return;
    let timer = 0;
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 3600);
    };
    wakeRef.current = wake;
    wake();
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.metaKey || e.altKey || (e.ctrlKey && k !== "control")) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (hid.current) {
        if (FLYING_KEYS.has(k)) return;
        setHidden(false);
        wake();
        // (the first Esc only brings the controls back; the next one lands)
        if (k === "escape") e.stopImmediatePropagation();
        return;
      }
      if (k === "h" && !e.repeat) setHidden(true);
    };
    // taps: where each finger went down, and whether anything moved since the first of them
    const downs = new Map<number, { x: number; y: number; t: number }>();
    let most = 0;
    let moved = false;
    const pd = (e: PointerEvent) => {
      if (!downs.size) {
        most = 0;
        moved = false;
      }
      downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
      most = Math.max(most, downs.size);
      if (!hid.current) wake();
    };
    const pm = (e: PointerEvent) => {
      const p = downs.get(e.pointerId);
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) moved = true;
      if (!hid.current && e.pointerType === "mouse") wake();
    };
    const pu = (e: PointerEvent) => {
      const p = downs.get(e.pointerId);
      downs.delete(e.pointerId);
      if (!p || downs.size) return;
      const tap = !moved && performance.now() - p.t < 420 && e.type === "pointerup";
      if (tap && most === 2 && e.pointerType === "touch") setHidden((h) => !h);
      else if (tap && most === 1 && hid.current) setHidden(false);
      if (tap) wake();
    };
    window.addEventListener("keydown", kd, true);
    window.addEventListener("pointerdown", pd, true);
    window.addEventListener("pointermove", pm, true);
    window.addEventListener("pointerup", pu, true);
    window.addEventListener("pointercancel", pu, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", kd, true);
      window.removeEventListener("pointerdown", pd, true);
      window.removeEventListener("pointermove", pm, true);
      window.removeEventListener("pointerup", pu, true);
      window.removeEventListener("pointercancel", pu, true);
    };
  }, [on]);
  return { hidden, idle, hide: () => setHidden(true), wake: () => wakeRef.current() };
}

// The flight's controls: one small capsule of round glass buttons at the foot of the view and nothing else. Music,
// the worlds, follow the path, the speed in four steps (on a phone the throttle under the right thumb has the same
// four), the look, hide, land. No bar across the top
// and no standing text: on the first flight of all one quiet line says how to fly, then never again; each world's
// name stands for a few seconds as plain type. On a phone the same capsule sits between a stick under the left
// thumb (while you fly it yourself) and a throttle under the right; a drag anywhere else turns the eye.
export function FlightUI({ onLand, mobile, flying, onStick }: { onLand: () => void; mobile: boolean; flying: boolean; onStick: (x: number, y: number) => void }) {
  const world = useWorld();
  const entered = useVoyageTick();
  const flags = useFlightFlags();
  const guide = (flags & 1) > 0;
  const guided = (flags & 2) > 0;
  const locked = (flags & 8) > 0;
  const gyro = (flags & 16) > 0;
  const chrome = useChrome(flying);
  // the Worlds list, and [ / ] to step through the worlds with a keyboard
  const [panel, setPanel] = useState<"worlds" | null>(null);
  const pending = useTravel();
  // Every pick is answered. Somewhere else: the cloud closes for it, whatever the cloud was doing (voyage.ts
  // travelTo: the last pick wins). Where the plane already is, or past either end of the list with the keys: the
  // world's name is shown again.
  const soon = useRef(false);
  const answer = (went: boolean) => {
    if (went || voyage.phase !== "open") return;
    soon.current = true;
    markEntered();
  };
  const pick = (id: WorldId) => {
    setPanel(null);
    if (flying) answer(travelTo(id));
  };
  useEffect(() => {
    if (!flying || mobile) return;
    const k = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === "[") answer(travelStep(-1));
      else if (e.key === "]") answer(travelStep(1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [flying, mobile]);
  // coming in to land there is nowhere else to go: the list closes and its button rests
  useEffect(() => {
    if (!flying) setPanel(null);
  }, [flying]);
  // a panel closes when the view itself is touched
  useEffect(() => {
    if (!panel) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-flight-ui]")) setPanel(null);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [panel]);
  // the throttle is also worked from the keys: the slider follows
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
  const throttle = (v: number) => {
    voyage.throttle = v;
    setThr(v);
  };
  // the world's name: once the cloud has opened on it, for a few seconds
  const [card, setCard] = useState(false);
  useEffect(() => {
    if (!flying) {
      setCard(false);
      return;
    }
    // (after a crossing the cloud is still opening; asked for by a tap on the world already flown, it comes at once)
    const wait = soon.current ? 120 : entered ? 1900 : 900;
    soon.current = false;
    const a = window.setTimeout(() => setCard(true), wait);
    const b = window.setTimeout(() => setCard(false), wait + 6000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      setCard(false);
    };
  }, [world, entered, flying]);
  // the phone as the eye: asked for from this tap (iOS wants that); where there are no sensors the button goes away
  const [canGyro, setCanGyro] = useState(false);
  useEffect(() => setCanGyro(gyroAvailable()), []);
  const toggleGyro = async () => {
    if (gyro) {
      gyroStop();
      setFlight({ gyro: false });
      return;
    }
    if (await gyroStart()) setFlight({ gyro: true });
    else setCanGyro(false);
  };
  useEffect(() => () => gyroStop(), []);
  // Mouse-look, with a mouse only: the pointer is locked to the scene (it disappears and cannot leave the window)
  // and its movement turns the eye freely, as in a game; the keys still fly the plane. On from the bar's button or
  // M; off with Esc (the browser's own way out of a locked pointer), M, or by landing. Losing the window lets the
  // pointer go but keeps the choice: the next press on the scene takes it again.
  const [look, setLook] = useState(false); // chosen
  const [held, setHeld] = useState(false); // the pointer is locked now
  const [lookTip, setLookTip] = useState(false);
  const lookOn = useRef(false);
  const [fine, setFine] = useState(false);
  useEffect(() => setFine(!mobile && window.matchMedia("(pointer: fine)").matches && "requestPointerLock" in HTMLElement.prototype), [mobile]);
  const sceneCanvas = () => [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0] ?? null;
  const takePointer = () => {
    try {
      const p = sceneCanvas()?.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* refused: pointerlockerror says so */
    }
  };
  const setLooking = (on: boolean) => {
    lookOn.current = on;
    setLook(on);
    if (on) takePointer();
    else if (document.pointerLockElement) document.exitPointerLock();
  };
  useEffect(() => {
    if (!fine) return;
    let tip = 0;
    let letGoAt = -1e9;
    // Esc gives the pointer back and does nothing else: it must not also land the plane. Chrome keeps that Esc to
    // itself; a browser that passes it on (before or after it lets the pointer go) has it stopped here, ahead of
    // everything else that listens for Esc.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const locked = !!document.pointerLockElement;
      if (!locked && performance.now() - letGoAt > 600) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      if (locked) document.exitPointerLock();
    };
    const change = () => {
      const on = !!document.pointerLockElement;
      if (!on) letGoAt = performance.now();
      mouseLook.on = on;
      mouseLook.dx = mouseLook.dy = 0;
      setHeld(on);
      window.clearTimeout(tip);
      if (on) {
        setLookTip(true);
        tip = window.setTimeout(() => setLookTip(false), 2000);
      } else {
        setLookTip(false);
        // (let go with Esc, the window still in front: the choice is off. Let go because the window was left: it stands)
        if (document.hasFocus() && document.visibilityState === "visible") {
          lookOn.current = false;
          setLook(false);
        }
      }
    };
    const refused = () => {
      mouseLook.on = false;
      lookOn.current = false;
      setLook(false);
      setHeld(false);
    };
    const move = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      mouseLook.dx += e.movementX;
      mouseLook.dy += e.movementY;
    };
    // (chosen but not held, after the window was left and come back to: a press on the scene takes the pointer again)
    const press = (e: PointerEvent) => {
      if (lookOn.current && !document.pointerLockElement && (e.target as HTMLElement | null)?.tagName === "CANVAS") takePointer();
    };
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || (e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key.toLowerCase() === "m") setLooking(!lookOn.current);
    };
    document.addEventListener("pointerlockchange", change);
    document.addEventListener("pointerlockerror", refused);
    document.addEventListener("mousemove", move);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("keydown", key);
    window.addEventListener("keydown", esc, true);
    return () => {
      window.removeEventListener("keydown", esc, true);
      window.clearTimeout(tip);
      document.removeEventListener("pointerlockchange", change);
      document.removeEventListener("pointerlockerror", refused);
      document.removeEventListener("mousemove", move);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("keydown", key);
      // (the flight's chrome is going: another mode, the OS, the desk. The pointer is given back)
      if (document.pointerLockElement) document.exitPointerLock();
      mouseLook.on = false;
      mouseLook.dx = mouseLook.dy = 0;
      lookOn.current = false;
    };
  }, [fine]); // eslint-disable-line react-hooks/exhaustive-deps
  // landing gives the pointer back
  useEffect(() => {
    if (!flying && lookOn.current) setLooking(false);
  }, [flying]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = WORLDS[world];
  const sub = world === "home" ? "" : def.year ? `M. K. Čiurlionis, ${def.year}` : "";
  const stop = { onClick: (e: React.MouseEvent) => e.stopPropagation(), onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const faint = chrome.idle && !panel;
  const ib = (on: boolean) => `lg-btn lg-tip pointer-events-auto grid shrink-0 place-items-center ${mobile ? "h-11 w-11" : "h-8 w-8"} ${on ? "lg-on" : "text-white/95"}`;
  const isz = mobile ? 18 : 15;
  const sw = 2;

  const caption = (
    <AnimatePresence mode="wait">
      {card && (
        <motion.div
          key={world}
          data-chrome=""
          data-flight="caption"
          className={`pointer-events-none [text-shadow:0_1px_14px_rgb(0_0_0/0.55),0_0_2px_rgb(0_0_0/0.3)] ${mobile ? "text-center" : ""}`}
          initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(6px)" }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <div className="text-[15px] font-semibold leading-tight tracking-[-0.03em] text-white">{world === "home" ? "Path of Angels" : worldName(world)}</div>
          {sub && <div className="mt-0.5 text-[12px] leading-tight text-white/75">{sub}</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );

  const bar = (
    <Glass layout className={`pointer-events-auto flex items-center p-1 ${mobile ? "" : "gap-0.5"}`} initial={GLASS_IN} animate={GLASS_ON} exit={GLASS_IN} transition={{ ...GLASS_SPRING, delay: 0.06 }} data-flight="bar" {...stop}>
      <button type="button" aria-pressed={panel === "worlds"} aria-label="Worlds" data-tip={mobile ? undefined : "Worlds  [ ]"} className={`${ib(panel === "worlds")} transition-opacity disabled:opacity-40`} disabled={!flying} onClick={() => setPanel(panel === "worlds" ? null : "worlds")}>
        <LayoutGrid size={isz} strokeWidth={sw} />
        {/* lit while the plane is on its way to a world picked from the list */}
        <span className={`absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full transition-opacity duration-300 ${panel === "worlds" ? "bg-black/60" : "bg-white"} ${pending ? "animate-pulse opacity-90" : "opacity-0"}`} />
      </button>
      <button type="button" aria-pressed={guide} aria-label="Follow the path" data-tip={guide ? "Following the path" : "Follow the path"} data-flight="auto" className={ib(guide)} onClick={() => setGuide(!guide)}>
        <Route size={isz} strokeWidth={sw} />
        {/* lit while the quiet hand has the plane */}
        <span className={`absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full transition-[background-color,opacity] duration-500 ${guide && guided ? "bg-amber-500 opacity-100" : "opacity-0"}`} />
      </button>
      {!mobile && (
        <>
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/25" />
          <SpeedSteps value={thr} onChange={throttle} size={32} />
          <span className="mx-0.5 h-4 w-px shrink-0 bg-white/25" />
        </>
      )}
      {mobile && canGyro && (
        <button type="button" aria-pressed={gyro} aria-label="Look by moving your phone" className={ib(gyro)} onClick={toggleGyro}>
          <Smartphone size={isz} strokeWidth={sw} />
        </button>
      )}
      {gyro ? (
        <button type="button" aria-label="Recentre the view" className={ib(false)} onClick={() => gyroCentre()}>
          <LocateFixed size={isz} strokeWidth={sw} />
        </button>
      ) : (
        <button type="button" aria-pressed={locked} aria-label="Keep the view where you turn it" data-tip={locked ? "View held" : "Hold the view"} data-flight="lock" className={ib(locked)} onClick={() => setFlight({ lockView: !locked })}>
          {locked ? <Lock size={isz} strokeWidth={sw} /> : <LockOpen size={isz} strokeWidth={sw} />}
        </button>
      )}
      {fine && !gyro && (
        <button type="button" aria-pressed={look} aria-label="Look round with the mouse" data-tip={look ? "Mouse look on  M" : "Mouse look  M"} data-flight="mouselook" className={`${ib(look)} transition-opacity disabled:opacity-40`} disabled={!flying} onClick={() => setLooking(!look)}>
          <MousePointer2 size={isz} strokeWidth={sw} />
        </button>
      )}
      <button type="button" aria-label="Hide the controls" data-tip="Hide  H" data-flight="hide" className={ib(false)} onClick={() => (setPanel(null), chrome.hide())}>
        <EyeOff size={isz} strokeWidth={sw} />
      </button>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-white/25" />
      <button type="button" data-mode-exit="" data-flight="land" aria-label="Land (Esc)" data-tip="Land  Esc" className={ib(false)} onClick={(e) => (e.stopPropagation(), onLand())}>
        <PlaneLanding size={isz + 1} strokeWidth={sw} />
      </button>
    </Glass>
  );
  const panels = (
    <AnimatePresence>
      {panel === "worlds" && <WorldsList key="worlds" current={world} pending={pending} onPick={pick} mobile={mobile} />}
    </AnimatePresence>
  );
  // faint when left alone; whole again under the pointer
  const rest = (k: number): React.CSSProperties => ({ opacity: faint ? k : 1 });

  if (mobile) {
    const foot = "bottom-[calc(max(12px,env(safe-area-inset-bottom))+66px)] landscape:bottom-[max(12px,env(safe-area-inset-bottom))]";
    return (
      <>
        <OnceHint id="fly-touch" at="top-[30%]">
          Drag to look · two-finger tap hides everything
        </OnceHint>
        {/* where you are: plain type at the top, for a few seconds */}
        <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-[112px]" style={{ top: `calc(${SAFE.t} + 6px)` }}>
          {caption}
        </div>
        {/* the stick: only while you fly it yourself */}
        <div data-chrome="" data-flight-ui="" className={`pointer-events-none absolute z-30 ${foot}`} style={{ left: SAFE.l, ...rest(0.5) }}>
          <AnimatePresence>{flying && !guide && <Stick key="stick" onStick={onStick} />}</AnimatePresence>
        </div>
        <div data-chrome="" data-flight-ui="" className={`pointer-events-none absolute z-30 ${foot}`} style={{ right: SAFE.r, ...rest(0.5) }}>
          <Throttle value={thr} onChange={throttle} />
        </div>
        <div data-chrome="" data-flight-ui="" className="pointer-events-none absolute inset-x-0 z-30 flex justify-center" style={{ bottom: SAFE.b, ...rest(0.3) }}>
          <div className="absolute bottom-[58px] left-1/2 -translate-x-1/2" {...stop}>
            {panels}
          </div>
          {bar}
        </div>
      </>
    );
  }

  return (
    <>
      {!held && (
        <OnceHint id="fly" at="top-[34%]">
          W A S D to fly · drag to look · scroll to zoom · H hides everything
        </OnceHint>
      )}
      <div data-chrome="" data-flight-ui="" className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center px-4 [@media(hover:hover)]:hover:!opacity-100" style={rest(0.16)}>
        <div className="absolute bottom-[50px] left-1/2 -translate-x-1/2" {...stop}>
          {panels}
        </div>
        {bar}
      </div>
      {/* where you are: the painting this world is built from, as plain type, for a few seconds */}
      <div className="pointer-events-none absolute bottom-7 left-6 z-30">{caption}</div>
      {/* the pointer has just been taken: how to get it back, for two seconds */}
      <AnimatePresence>
        {held && lookTip && (
          <motion.div key="esc" data-flight="esc-tip" className="pointer-events-none absolute inset-x-0 bottom-[74px] z-30 flex justify-center" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
            <span className="rounded-full bg-black/35 px-2.5 py-1 text-[11.5px] font-medium text-white/90 backdrop-blur-md">Esc to release</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------- navigation ----------

const fmtH = (h: number) => {
  const m = Math.round(h * 60) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

// While exploring, a "Back to desk" pill stands at the bottom corner (the top left on a phone).
export function NavBar({ nav, onBack, mobile = false }: { nav: "orbit" | "explore"; onBack: () => void; mobile?: boolean }) {
  return (
    <AnimatePresence>
      {nav === "explore" && (
        <div key="back" className="pointer-events-none absolute z-30" style={mobile ? { top: SAFE.t, left: SAFE.l } : { bottom: 20, left: 16 }} data-desk="nav">
          <Glass radius={mobile ? 22 : 18} className="pointer-events-auto" initial={GLASS_IN} animate={GLASS_ON} exit={GLASS_IN} transition={GLASS_SPRING} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={`lg-btn whitespace-nowrap px-3.5 font-medium text-white/92 ${mobile ? "h-11 text-[14px]" : "h-9 text-[12.5px]"}`} onClick={onBack}>
              Back to desk
            </button>
          </Glass>
        </div>
      )}
    </AnimatePresence>
  );
}

// The scene's two controls, a pair of glass buttons in the top right corner, always there: at the desk, in every
// mode and in flight, even with the flight's controls hidden (H). The gear opens the settings (graphics, the way
// of looking round while at the desk, the music's level and mute, and what plays, credited); the speaker silences
// the whole scene.
export function SceneControls({ mobile, quiet, onQuiet, nav, onNav }: { mobile: boolean; quiet: boolean; onQuiet: () => void; nav?: "orbit" | "explore"; onNav?: (n: "orbit" | "explore") => void }) {
  const [open, setOpen] = useState(false);
  const choice = useQualityChoice();
  const qs = useQualitySettings();
  const paused = usePaused();
  const m = useMusic();
  // P pauses and resumes (not while typing somewhere)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "p" && e.key !== "P") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      togglePause();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const root = useRef<HTMLDivElement>(null);
  // a press anywhere else folds it away
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => void (!root.current?.contains(e.target as Node) && setOpen(false));
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);
  const size = mobile ? "h-11 w-11" : "h-9 w-9";
  const seg = (on: boolean) => `lg-btn flex-1 whitespace-nowrap px-2.5 font-medium ${mobile ? "h-10 text-[13px]" : "h-7 text-[12px]"} ${on ? "lg-on" : "text-white/92"}`;
  const label = "px-2 text-[11px] font-medium text-white/60";
  const credit = m.playing?.credit;
  return (
    <div
      ref={root}
      className="pointer-events-none absolute z-40 flex flex-col items-end gap-2"
      style={mobile ? { top: SAFE.t, right: SAFE.r } : { top: 16, right: 16 }}
      data-scene-controls=""
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex gap-2">
        <Glass data-keep="" className="pointer-events-auto" initial={GLASS_IN} animate={GLASS_ON} exit={GLASS_IN} transition={GLASS_SPRING}>
          <button type="button" aria-label={open ? "Close the settings" : "Settings"} aria-expanded={open} data-scene="settings" className={`lg-btn grid place-items-center text-white ${size} ${open ? "lg-on" : ""}`} onClick={() => setOpen((o) => !o)}>
            {open ? <X size={16} strokeWidth={2.1} /> : <Settings2 size={16} strokeWidth={2} />}
          </button>
        </Glass>
        <Glass data-keep="" className="pointer-events-auto" initial={GLASS_IN} animate={GLASS_ON} exit={GLASS_IN} transition={GLASS_SPRING}>
          <button type="button" aria-label={paused ? "Resume" : "Pause"} aria-pressed={paused} data-scene="pause" title={paused ? "Resume (P)" : "Pause (P)"} className={`lg-btn grid place-items-center text-white ${size} ${paused ? "lg-on" : ""}`} onClick={togglePause}>
            {paused ? <Play size={15} strokeWidth={2} /> : <Pause size={15} strokeWidth={2} />}
          </button>
        </Glass>
        <Glass data-keep="" className="pointer-events-auto" initial={GLASS_IN} animate={GLASS_ON} exit={GLASS_IN} transition={GLASS_SPRING}>
          <button type="button" aria-label={quiet ? "Turn the sound on" : "Mute the sound"} aria-pressed={quiet} data-scene="sound" className={`lg-btn grid place-items-center text-white ${size}`} onClick={onQuiet}>
            {quiet ? <VolumeX size={16} strokeWidth={2} /> : <Volume2 size={16} strokeWidth={2} />}
          </button>
        </Glass>
      </div>
      <AnimatePresence>
        {open && (
          <Glass key="panel" data-keep="" radius={22} lens={false} panel className="pointer-events-auto w-[min(318px,calc(100vw-28px))] origin-top-right" initial={{ ...GLASS_IN, y: -6 }} animate={GLASS_ON} exit={{ ...GLASS_IN, y: -6 }} transition={GLASS_SPRING} data-scene="panel">
            <div className="flex flex-col gap-2.5 p-1.5">
              <div className="flex flex-col gap-1">
                <span className={label}>Graphics{choice === "custom" ? " · Custom" : ""}</span>
                <div className="flex gap-0.5" role="radiogroup" aria-label="Graphics preset">
                  {(["auto", "low", "medium", "high", "ultra"] as QualityChoice[]).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={choice === c} className={seg(choice === c)} onClick={() => setQualityChoice(c)}>
                      {QUALITY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Resolution</span>
                <div className="flex gap-0.5" role="radiogroup" aria-label="Resolution">
                  {(Object.keys(RES_LABELS) as Res[]).map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={qs.res === r} className={seg(qs.res === r)} onClick={() => setResolution(r)}>
                      {RES_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Frame rate</span>
                <div className="flex gap-0.5" role="radiogroup" aria-label="Frame rate cap">
                  {FPS_CHOICES.map((f) => (
                    <button key={f} type="button" role="radio" aria-checked={qs.fps === f} className={seg(qs.fps === f)} onClick={() => setFrameCap(f)}>
                      {f === 0 ? "Max" : FPS_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className={label}>Quality</span>
                <div className="flex gap-0.5" role="radiogroup" aria-label="Quality">
                  {(["low", "medium", "high", "ultra"] as Preset[]).map((l) => (
                    <button key={l} type="button" role="radio" aria-checked={qs.level === l} className={seg(qs.level === l)} onClick={() => setQualityLevel(l)}>
                      {PRESET_LABELS[l]}
                    </button>
                  ))}
                </div>
              </div>
              {nav && onNav && (
                <div className="flex flex-col gap-1">
                  <span className={label}>Look round</span>
                  <div className="flex gap-0.5" role="radiogroup" aria-label="Look round">
                    <button type="button" role="radio" aria-checked={nav === "orbit"} className={seg(nav === "orbit")} onClick={() => onNav("orbit")}>
                      Orbit
                    </button>
                    <button type="button" role="radio" aria-checked={nav === "explore"} className={seg(nav === "explore")} onClick={() => onNav("explore")}>
                      Explore
                    </button>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className={label}>Music</span>
                <div className="flex items-center gap-2 pr-2">
                  <button type="button" className={`lg-btn grid shrink-0 place-items-center ${mobile ? "h-10 w-10" : "h-8 w-8"} ${m.muted ? "lg-on" : "text-white/95"}`} aria-pressed={m.muted} aria-label={m.muted ? "Turn the music on" : "Turn the music off"} data-scene="music-mute" onClick={() => setMusicMuted(!m.muted)}>
                    {m.muted ? <VolumeX size={15} strokeWidth={2} /> : <Volume2 size={15} strokeWidth={2} />}
                  </button>
                  <input type="range" min={0} max={1} step={0.01} value={m.volume} onChange={(e) => setMusicVolume(+e.target.value)} className="lg-range flex-1" aria-label="Music volume" data-scene="music-volume" />
                </div>
                {credit && (
                  <span className="px-2 text-[10.5px] leading-snug text-white/55" data-scene="credit">
                    {credit}
                  </span>
                )}
              </div>
            </div>
          </Glass>
        )}
      </AnimatePresence>
    </div>
  );
}
