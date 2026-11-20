"use client";

import { AnimatePresence, animate, motion, useMotionValue, useScroll, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { apps, bookCall, dockApps, gameApps, mainWork, owner, projectApps, projectGroups, projects, sharedApps, shots, timeline, tracks, type AppId } from "@/content";
import { flightMusicPrime } from "@/lib/flightMusic";
import { handoff } from "@/lib/handoff";
import { isUp, useOS, useWallpaper } from "@/store";
import { AppIcon, AppView, LiveWallpaper, player, usePlayer, warmApps } from "./Apps";
import { Bars } from "./Desktop";
import { Monogram, PowerOverlay } from "./Login";
import { IconFace } from "./icons";
import { Check, ChevronLeft, Pause, Play, Power, Send, Wifi, X } from "lucide-react";
import { Sym } from "./symbols";
import { Chrome, EASE_OUT, glass, M, PhoneNav, reducedMotion, SPRING_GLASS, sfx, useGlassScope, type PhoneDetail } from "./ui";
import { useClock, useDate } from "./useClock";

// iPhone-style OS: lock screen that lifts away, a home screen of icons, and apps
// that grow out of their icon and shrink back into it with the home gesture.

// The Dynamic Island: a live activity grows out of it with a spring. Music shows the artwork and a waveform,
// Get in Touch shows "Sent", and a long press opens the full activity. A tap opens the app it belongs to.
function Island({ real }: { real: boolean }) {
  const p = usePlayer();
  const activity = useOS((s) => s.activity);
  const setActivity = useOS((s) => s.setActivity);
  const openPhoneApp = useOS((s) => s.openPhoneApp);
  const track = tracks.find((t) => t.id === p.id) ?? null;
  const [big, setBig] = useState(false);
  const hold = useRef<number | undefined>(undefined);
  const held = useRef(false);
  useEffect(() => {
    if (!activity) return;
    const t = window.setTimeout(() => setActivity(null), 2600);
    return () => window.clearTimeout(t);
  }, [activity, setActivity]);
  const music = !!track && (p.playing || big);
  const mode: "idle" | "music" | "sent" | "big" = big && track ? "big" : activity?.kind === "sent" ? "sent" : music ? "music" : "idle";
  useEffect(() => {
    if (!track) setBig(false);
  }, [track]);
  const size = { idle: [126, 37, 19], music: [168, 37, 19], sent: [168, 37, 19], big: [356, 172, 44] }[mode];
  const onTap = () => {
    if (held.current) return;
    if (mode === "big") return setBig(false);
    if (mode === "music") openPhoneApp("records");
    if (mode === "sent") openPhoneApp("contact");
  };
  return (
    // on a real phone there is a real island above this: ours is only a pill that appears, under the safe area,
    // while something is going on (music, a copied address)
    <div className={`pointer-events-none absolute inset-x-0 z-[90] flex justify-center top-[var(--phone-island)]`} data-island={mode}>
      <motion.div
        initial={false}
        animate={{ width: size[0], height: size[1], borderRadius: size[2], opacity: real && mode === "idle" ? 0 : 1, scale: real && mode === "idle" ? 0.6 : 1 }}
        transition={SPRING_GLASS}
        onPointerDown={() => {
          held.current = false;
          hold.current = window.setTimeout(() => {
            held.current = true;
            if (track) setBig(true);
          }, 420);
        }}
        onPointerUp={() => window.clearTimeout(hold.current)}
        onPointerLeave={() => window.clearTimeout(hold.current)}
        onClick={onTap}
        className={`relative overflow-hidden bg-black text-white ${mode === "idle" ? "" : "pointer-events-auto"}`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {mode === "music" && track && (
            <motion.div key="m" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: M.out }} transition={M.fade} className="absolute inset-0 flex items-center justify-between px-[7px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={track.cover} alt="" className="h-[25px] w-[25px] rounded-[9px] object-cover" />
              <span className="pr-2 text-[#9b8cff]">
                <Bars light />
              </span>
            </motion.div>
          )}
          {mode === "sent" && (
            <motion.div key="s" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: M.out }} transition={M.fade} className="absolute inset-0 flex items-center justify-between px-3">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#30D158] text-black">
                <Sym icon={Check} size={14} weight="bold" />
              </span>
              <span className="text-[13px] font-semibold">Copied</span>
            </motion.div>
          )}
          {mode === "big" && track && (
            <motion.div key="b" initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.25, delay: 0.08 }} className="absolute inset-0 flex flex-col px-5 pb-4 pt-5">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={track.cover} alt="" className="h-[52px] w-[52px] rounded-[16px] object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{track.title}</div>
                  <div className="truncate text-[13px] text-white/55">{track.artist}</div>
                </div>
                <span className="text-[#9b8cff]">
                  <Bars light />
                </span>
              </div>
              <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-white/20">
                <div className="h-full origin-left rounded-full bg-white" style={{ transform: `scaleX(${p.dur ? p.t / p.dur : 0})` }} />
              </div>
              <div className="mt-2 flex items-center justify-center gap-8">
                <button
                  type="button"
                  aria-label={p.playing ? "Pause" : "Play"}
                  onClick={(e) => {
                    e.stopPropagation();
                    player.toggle();
                  }}
                  className="press flex h-9 w-9 items-center justify-center"
                >
                  {p.playing ? <Sym icon={Pause} size={26} fill /> : <Sym icon={Play} size={26} fill />}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function StatusBar({ light }: { light?: boolean }) {
  const time = useClock(false);
  const c = light ? "text-white" : "text-ink";
  return (
    <div className={`pointer-events-none absolute inset-x-0 top-0 z-[80] flex h-[var(--phone-top)] items-center pt-1 text-[17px] font-semibold tracking-[-0.02em] tabular-nums ${c}`}>
      {/* the time and the icons are each centred in the "ears" either side of the Dynamic Island */}
      <span className="flex flex-1 justify-center pl-3">{time}</span>
      <span className="w-[126px]" />
      <span className="flex flex-1 items-center justify-center gap-[5px] pr-3">
        <span className="flex h-[10px] items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className={`w-[3px] rounded-[1px] ${light ? "bg-white" : "bg-ink"}`} style={{ height: h }} />
          ))}
        </span>
        <Sym icon={Wifi} size={17} weight="bold" className="-mt-px" />
        <span className="flex items-center gap-[1px]">
          <span className={`flex h-[13px] w-[25px] items-center rounded-[4.5px] border p-[1.5px] ${light ? "border-white/45" : "border-ink/35"}`}>
            <span className={`h-full w-[72%] rounded-[2.5px] ${light ? "bg-white" : "bg-ink"}`} />
          </span>
          <span className={`h-[4.5px] w-[1.5px] rounded-r-[1px] ${light ? "bg-white/45" : "bg-ink/35"}`} />
        </span>
      </span>
    </div>
  );
}

// ---------- lock ----------

function Lock({ onPower }: { onPower: () => void }) {
  const login = useOS((s) => s.login);
  // a long press anywhere on the lock screen asks about power, as holding the side button would
  const hold = useRef<number | undefined>(undefined);
  const held = useRef(false);
  const seamless = useOS((s) => s.seamless);
  const wp = useWallpaper();
  const time = useClock(false);
  const date = useDate();
  // the same picture as the home screen, sharp, with the clock in white over it (the home screen appears behind
  // it as it lifts away, so the picture never changes)
  return (
    <div
      className="wp-photo absolute inset-0 flex flex-col items-center bg-black text-white"
      style={wp.src.startsWith("live:") ? undefined : { backgroundImage: `url(${wp.src})` }}
      onPointerDown={() => {
        held.current = false;
        hold.current = window.setTimeout(() => {
          held.current = true;
          onPower();
        }, 600);
      }}
      onPointerUp={() => window.clearTimeout(hold.current)}
      onPointerLeave={() => window.clearTimeout(hold.current)}
      onPointerCancel={() => window.clearTimeout(hold.current)}
      // a tap anywhere opens it; the control a keyboard or a screen reader finds is the button below
      onClick={() => !held.current && login()}
      data-lock=""
    >
      {wp.src.startsWith("live:") && <LiveWallpaper />}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.3),rgb(0_0_0/0.08)_38%,rgb(0_0_0/0.12)_62%,rgb(0_0_0/0.42))]" />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...M.arrive, delay: seamless ? 0.35 : 0.2 }}
        className="relative mt-[calc(var(--phone-top)+30px)] text-center [text-shadow:0_1px_12px_rgb(0_0_0/0.25)]"
      >
        <div className="text-[20px] font-medium leading-6 tracking-[-0.01em] text-white/85">{date || "\u00a0"}</div>
        <div className="mt-1 min-h-[96px] text-[96px] font-light leading-none tracking-[-0.05em] tabular-nums text-white/95">{time}</div>
      </motion.div>
      <div className="relative mt-auto flex w-full flex-col items-center px-4 pb-[calc(var(--phone-bottom)-24px)]">
        {/* lock screen widgets, at the bottom like iOS 26: what he's working on, and the studio */}
        <motion.div initial={{ y: 8 }} animate={{ y: 0 }} transition={{ ...M.arrive, delay: 0.45 }} className="grid w-full grid-cols-2 gap-2.5">
          {[
            { k: "Working on", v: mainWork.name, s: mainWork.role ?? "" },
            { k: "Studio", v: "Larpo", s: owner.city },
          ].map((w) => (
            // each widget fades itself: glass inside a fading parent sits flat until the fade ends, then snaps
            <motion.div key={w.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ ...M.arrive, delay: 0.45 }} data-glass="" className={`${glass("widget-dark")} rounded-[26px] px-4 py-3 text-left`}>
              <div className="text-[12px] font-medium leading-4 text-white/60">{w.k}</div>
              <div className="t-headline mt-0.5 truncate text-white">{w.v}</div>
              <div className="t-foot truncate text-white/65">{w.s}</div>
            </motion.div>
          ))}
        </motion.div>
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!held.current) login();
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...M.arrive, delay: seamless ? 0.55 : 0.4 }}
          className="mt-5 flex h-11 items-center px-4 text-[15px] font-medium text-white/80 [text-shadow:0_1px_6px_rgb(0_0_0/0.3)]"
        >
          Tap to open
        </motion.button>
        {/* the way back out, always in sight: the phone goes dark and the desk is there again */}
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...M.arrive, delay: 0.6 }}
          data-glass=""
          data-lock-back=""
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onPower();
          }}
          className={`glass-press mt-4 flex h-11 items-center gap-2 rounded-full pl-3.5 pr-4 text-[15px] font-medium tracking-[-0.015em] text-white ${glass("btn-dark")}`}
        >
          <Sym icon={Power} size={16} weight="semibold" />
          Back to the desk
        </motion.button>
        <div className="mt-4 h-[5px] w-[134px] rounded-full bg-white/90" />
      </div>
    </div>
  );
}

// ---------- home ----------

type Origin = { x: number; y: number; w: number; h: number };
// iOS calls it Settings
const phoneTitle = (id: AppId) => (id === "settings" ? "Settings" : apps[id].title);

function HomeIcon({ id, label, onOpen }: { id: AppId; label?: string; onOpen: (id: AppId, o: Origin) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const openIt = () => {
    const r = ref.current!.getBoundingClientRect();
    onOpen(id, { x: r.x, y: r.y, w: r.width, h: r.height });
  };
  return (
    <div className="relative flex w-[60px] flex-col items-center gap-[5px]">
      <motion.button
        type="button"
        aria-label={`Open ${apps[id].title}`}
        onPointerDown={() => {
          timer.current = window.setTimeout(() => setHeld(true), 450);
        }}
        onPointerUp={() => window.clearTimeout(timer.current)}
        onPointerLeave={() => window.clearTimeout(timer.current)}
        onClick={() => !held && openIt()}
        whileTap={{ scale: 0.92, filter: "brightness(0.9)" }}
        transition={M.pop}
        className="no-callout"
      >
        <div ref={ref}>
          <AppIcon id={id} size={60} />
        </div>
      </motion.button>
      {label !== "" && (
        <span className={`-mx-2 w-[76px] truncate text-center text-[12px] font-medium leading-[14px] tracking-[-0.005em] text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.5),0_0_10px_rgb(0_0_0/0.28)]`}>
          {label ?? apps[id].title}
        </span>
      )}
      <AnimatePresence>
        {held && (
          <>
            <motion.div className="fixed inset-0 z-40" onClick={() => setHeld(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, transition: M.out }}
              transition={M.pop}
              style={{ transformOrigin: "top left" }}
              data-glass=""
              className={`${glass("pop")} absolute left-0 top-[68px] z-50 w-[220px] overflow-hidden rounded-[18px]`}
            >
              <button
                type="button"
                onClick={() => {
                  setHeld(false);
                  openIt();
                }}
                className="flex h-11 w-full items-center px-4 text-left text-[15px] text-ink"
              >
                Open {apps[id].title}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- home: pages of widgets and apps ----------

// A tap on anything that opens grows the app out of that thing's own rectangle.
type Open = (id: AppId, o: Origin) => void;
const rectOf = (el: Element): Origin => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};
// Widget sizes follow the icon grid, as on iOS: a small one covers two columns and is square, a medium one runs
// the width of the page at the same height.
const WIDGET_H = "h-[152px]";
const widget = `glass-press relative overflow-hidden rounded-[26px] text-left text-white ${glass("widget-dark")}`;
const kicker = "text-[12px] font-semibold leading-4 tracking-[-0.005em] text-white/60";

// a widget is named by what it shows (a separate label read differently from the words on it); only a widget
// that shows pictures alone carries a label
function Widget({ app, onOpen, className = "", children, label }: { app: AppId; onOpen: Open; className?: string; children: React.ReactNode; label?: string }) {
  return (
    <button type="button" aria-label={label} data-glass="" data-widget={app} onClick={(e) => onOpen(app, rectOf(e.currentTarget))} className={`${widget} ${className}`}>
      {children}
    </button>
  );
}

// Now playing: the artwork, what it is, and a play button that works without opening Music.
function PlayingWidget({ onOpen }: { onOpen: Open }) {
  const p = usePlayer();
  const track = tracks.find((t) => t.id === p.id) ?? tracks[0];
  if (!track) return null;
  const on = p.playing && p.id === track.id;
  return (
    <div className={`relative ${WIDGET_H}`}>
      <Widget app="records" onOpen={onOpen} className="flex h-full w-full items-center gap-4 p-4 pr-[84px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={track.cover} alt="" draggable={false} className="h-[120px] w-[120px] shrink-0 rounded-[18px] object-cover shadow-[0_8px_22px_-8px_rgb(0_0_0/0.55)]" />
        <span className="min-w-0 flex-1">
          <span className={`block ${kicker}`}>{on ? "Now playing" : "Music"}</span>
          <span className="mt-1 line-clamp-2 text-[17px] font-semibold leading-[21px] tracking-[-0.022em]">{track.title}</span>
          <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-white/65">{track.artist}</span>
          <span className="mt-3 block h-[3px] overflow-hidden rounded-full bg-white/20">
            <span className="block h-full origin-left rounded-full bg-white/90" style={{ transform: `scaleX(${p.id === track.id && p.dur ? Math.min(1, p.t / p.dur) : 0})` }} />
          </span>
        </span>
      </Widget>
      <button
        type="button"
        aria-label={on ? "Pause" : `Play ${track.title}`}
        data-widget="play"
        onClick={() => player.toggle(track.id)}
        className="press absolute right-4 top-1/2 flex h-[52px] w-[52px] -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-[0_6px_16px_-6px_rgb(0_0_0/0.5)]"
      >
        {on ? <Sym icon={Pause} size={22} fill /> : <Sym icon={Play} size={22} className="ml-0.5" fill />}
      </button>
    </div>
  );
}

// The time where he is: a plain clock face, Kaunas under it.
function ClockWidget({ onOpen }: { onOpen: Open }) {
  const [now, setNow] = useState<{ h: number; m: number; s: number; label: string } | null>(null);
  useEffect(() => {
    const tick = () => {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Vilnius", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date());
      const n = (t: string) => +(parts.find((x) => x.type === t)?.value ?? 0);
      setNow({ h: n("hour") % 24, m: n("minute"), s: n("second"), label: `${String(n("hour") % 24).padStart(2, "0")}:${String(n("minute")).padStart(2, "0")}` });
    };
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, []);
  const hand = (deg: number, len: number, w: number, col: string) => <line x1="50" y1="50" x2={50 + Math.sin((deg * Math.PI) / 180) * len} y2={50 - Math.cos((deg * Math.PI) / 180) * len} stroke={col} strokeWidth={w} strokeLinecap="round" />;
  return (
    <Widget app="about" onOpen={onOpen} className={`flex ${WIDGET_H} flex-col items-center justify-between p-3`}>
      <svg viewBox="0 0 100 100" className="h-[98px] w-[98px]" aria-hidden>
        <circle cx="50" cy="50" r="48" fill="rgb(255 255 255 / 0.94)" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="50" y1={i % 3 === 0 ? 7 : 8} x2="50" y2={i % 3 === 0 ? 15 : 12} stroke="#1c1c1e" strokeWidth={i % 3 === 0 ? 2.4 : 1.4} strokeLinecap="round" opacity={i % 3 === 0 ? 0.9 : 0.45} transform={`rotate(${i * 30} 50 50)`} />
        ))}
        {now && (
          <>
            {hand((now.h % 12) * 30 + now.m * 0.5, 23, 4.4, "#1c1c1e")}
            {hand(now.m * 6 + now.s * 0.1, 35, 3, "#1c1c1e")}
            {hand(now.s * 6, 38, 1.1, "#ff9f0a")}
            <circle cx="50" cy="50" r="2.6" fill="#ff9f0a" />
          </>
        )}
      </svg>
      <span className="flex w-full items-baseline justify-between px-1.5 pb-0.5">
        <span className="text-[13px] font-semibold tracking-[-0.01em]">Kaunas</span>
        <span className="text-[13px] tabular-nums text-white/65">{now?.label ?? " "}</span>
      </span>
    </Widget>
  );
}

// His projects, one at a time, each under its own mark.
const STACK: AppId[] = projectGroups.slice(0, 2).flatMap((g) => g.apps).filter((id) => projects[id]);
function ProjectsWidget({ onOpen }: { onOpen: Open }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => setI((n) => (n + 1) % STACK.length), 3600);
    return () => window.clearInterval(iv);
  }, []);
  const id = STACK[i];
  const p = projects[id]!;
  return (
    <Widget app="projects" onOpen={onOpen} className={`flex ${WIDGET_H} flex-col p-4`}>
      <span className={kicker}>Projects</span>
      <span className="relative mt-2 block flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={id} className="absolute inset-0 flex flex-col justify-between" initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, filter: "blur(4px)" }} transition={{ duration: 0.45, ease: EASE_OUT }}>
            <AppIcon id={id} size={46} />
            <span>
              <span className="block truncate text-[17px] font-semibold leading-[21px] tracking-[-0.022em]">{p.name}</span>
              <span className="block truncate text-[13px] leading-[17px] text-white/65">{p.role ?? p.what ?? ""}</span>
            </span>
          </motion.span>
        </AnimatePresence>
      </span>
    </Widget>
  );
}

// A large picture from Shots, changing slowly.
function PhotoWidget({ onOpen }: { onOpen: Open }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => setI((n) => (n + 1) % shots.items.length), 6000);
    return () => window.clearInterval(iv);
  }, []);
  const s = shots.items[i];
  return (
    <Widget app="shots" onOpen={onOpen} label="Open Shots" className="block h-[clamp(132px,24dvh,206px)] w-full">
      <AnimatePresence initial={false}>
        <motion.img key={s.src} src={s.src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: EASE_OUT }} />
      </AnimatePresence>
      <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(0_0_0/0.55))]" />
      <span className="absolute inset-x-4 bottom-3 flex items-baseline justify-between">
        <span className="text-[17px] font-semibold tracking-[-0.022em]">Shots</span>
        <span className="text-[13px] text-white/75">{s.title}</span>
      </span>
    </Widget>
  );
}

function WorkingWidget({ onOpen }: { onOpen: Open }) {
  return (
    <Widget app={mainWork.id as AppId} onOpen={onOpen} className={`flex ${WIDGET_H} flex-col justify-between p-4`}>
      <span className="flex items-start justify-between">
        <span className={kicker}>Working on</span>
        <AppIcon id={mainWork.id as AppId} size={34} />
      </span>
      <span>
        <span className="block text-[20px] font-semibold leading-6 tracking-[-0.025em]">{mainWork.name}</span>
        <span className="block truncate text-[13px] leading-[17px] text-white/65">{mainWork.role}</span>
        <span className="block truncate text-[13px] leading-[17px] text-white/45">{mainWork.years}</span>
      </span>
    </Widget>
  );
}

// Back to the field, and straight into the air.
function FlyWidget({ onFly }: { onFly: () => void }) {
  return (
    <button type="button" data-glass="" data-widget="fly" onClick={onFly} className={`${widget} flex ${WIDGET_H} flex-col justify-between p-4`}>
      <span aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgb(255_214_150/0.34),transparent_60%)]" />
      <span className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white text-black">
        <Sym icon={Send} size={18} weight="medium" className="-ml-0.5 mt-0.5" />
      </span>
      <span className="relative">
        <span className="block text-[20px] font-semibold leading-6 tracking-[-0.025em]">Fly</span>
        <span className="block text-[13px] leading-[17px] text-white/65">Out over the field, by paper plane</span>
      </span>
    </button>
  );
}

function ContactWidget({ onOpen }: { onOpen: Open }) {
  return (
    <Widget app="contact" onOpen={onOpen} className={`flex ${WIDGET_H} flex-col justify-between p-4`}>
      <span className="flex items-start justify-between">
        <span className={kicker}>Get in Touch</span>
        <Monogram size={34} />
      </span>
      <span>
        <span className="block text-[17px] font-semibold leading-[21px] tracking-[-0.022em]">{bookCall.label}</span>
        <span className="block truncate text-[13px] leading-[17px] text-white/65">{bookCall.sub}</span>
      </span>
    </Widget>
  );
}

// Games, as a folder standing open on the page: its two apps, ready to tap.
function GamesWidget({ onOpen }: { onOpen: Open }) {
  return (
    <div data-glass="" data-widget="games" className={`relative overflow-hidden rounded-[26px] text-white ${glass("widget-dark")} flex ${WIDGET_H} flex-col p-4`}>
      <span className={kicker}>Games</span>
      <span className="mt-auto grid grid-cols-2 gap-2 pb-0.5">
        {gameApps.map((id) => (
          <button key={id} type="button" aria-label={`Open ${apps[id].title}`} onClick={(e) => onOpen(id, rectOf(e.currentTarget.firstElementChild ?? e.currentTarget))} className="press flex flex-col items-center gap-1.5">
            <span className="block">
              <AppIcon id={id} size={52} />
            </span>
            <span className="w-full truncate text-center text-[11px] font-medium leading-[13px] text-white/85">{apps[id].title}</span>
          </button>
        ))}
      </span>
    </div>
  );
}

function TimelineWidget({ onOpen }: { onOpen: Open }) {
  const rows = timeline.filter((m) => m.key).slice(-3);
  return (
    <Widget app="about" onOpen={onOpen} className="flex w-full flex-col gap-1.5 p-4 [@media(max-height:879px)]:hidden">
      <span className={kicker}>Lately</span>
      {rows.map((m) => (
        <span key={m.title} className="flex items-baseline gap-3">
          <span className="w-[86px] shrink-0 text-[12px] tabular-nums leading-[18px] text-white/50">{m.when}</span>
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-[18px] tracking-[-0.012em]">{m.title}</span>
        </span>
      ))}
    </Widget>
  );
}

// A folder, opened: the page behind goes soft and dark, and its apps stand in a glass panel under its name.
const FOLDERS: Record<"projects" | "games", { title: string; apps: AppId[]; all: string }> = {
  projects: { title: "Projects", apps: projectApps, all: "All projects" },
  games: { title: "Games", apps: gameApps, all: "Library" },
};
function Folder({ id, onOpen, onClose }: { id: "projects" | "games"; onOpen: Open; onClose: () => void }) {
  const f = FOLDERS[id];
  return (
    // Each layer fades by itself. A backdrop blur (the scrim, the glass panel) inside a parent that is fading has
    // nothing behind it to blur until the fade ends: it would sit flat and then snap to frosted.
    <motion.div className="absolute inset-0 z-[40] flex flex-col items-center justify-center px-6" exit={{ opacity: 1, transition: M.out }} onClick={onClose} role="dialog" aria-label={`${f.title} folder`} data-folder={id}>
      <motion.div aria-hidden className="absolute inset-0 bg-black/35 backdrop-blur-[26px] backdrop-saturate-150" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: M.out }} transition={M.fade} />
      <motion.div className="relative w-full max-w-[340px]" initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, transition: M.out }} transition={M.ui} onClick={(e) => e.stopPropagation()}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: M.out }} transition={M.fade} className="mb-4 px-2 text-[28px] font-semibold leading-8 tracking-[-0.028em] text-white [text-shadow:0_1px_10px_rgb(0_0_0/0.3)]">{f.title}</motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: M.out }} transition={M.fade} data-glass="" className={`${glass("widget-dark")} max-h-[72dvh] overflow-y-auto overscroll-contain rounded-[34px] px-4 py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
          <div className="grid grid-cols-3 justify-items-center gap-x-2 gap-y-5">
            {[...f.apps, id].map((a, n) => (
              <HomeIcon key={`${a}${n}`} id={a} label={n === f.apps.length ? f.all : (projects[a]?.name ?? apps[a].title)} onOpen={(app, o) => (onClose(), onOpen(app, o))} />
            ))}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

// The home screen: pages you swipe between. The first is his apps under a few widgets; the second is more of him.
// The dock and the page dots stay put.
const HOME_APPS: AppId[] = [...dockApps, "taste"];
const PAGES = 2;
const GRID = "grid grid-cols-[repeat(4,60px)] justify-between";
function Home({ onOpen, onFly }: { onOpen: Open; onFly: () => void }) {
  const wp = useWallpaper();
  const dark = wp.dark;
  const dock: AppId[] = [...sharedApps, "about"];
  const [w, setW] = useState(() => (typeof window === "undefined" ? 390 : window.innerWidth));
  const [page, setPage] = useState(0);
  const [folder, setFolder] = useState<"projects" | "games" | null>(null);
  const x = useMotionValue(0);
  // a swipe is not a tap: whatever was under the finger does not open
  const swiped = useRef(false);
  const go = (p: number, velocity = 0) => {
    const to = Math.min(PAGES - 1, Math.max(0, p));
    setPage(to);
    animate(x, -to * w, { ...M.ui, velocity });
  };
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  useEffect(() => {
    x.set(-page * w);
    // only when the width changes (a turn of the phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w]);
  const open: Open = (id, o) => {
    if (swiped.current) return;
    if (id === "projects" || id === "games") return setFolder(id);
    onOpen(id, o);
  };
  // (from inside a folder its own tile opens the app itself: the Files-style view)
  const openFromFolder: Open = (id, o) => onOpen(id, o);
  const pageCls = "flex h-full shrink-0 flex-col gap-[14px] px-[27px] pt-[calc(var(--phone-top)+10px)]";
  return (
    <div className="wp-photo absolute inset-0 flex touch-none flex-col overflow-hidden" style={wp.src.startsWith("live:") ? undefined : { backgroundImage: `url(${wp.src})` }}>
      {wp.src.startsWith("live:") && <LiveWallpaper />}
      {/* labels are white, as on iOS: a light picture is toned down so they still read */}
      <div aria-hidden className={`pointer-events-none absolute inset-0 ${dark ? "bg-[linear-gradient(180deg,rgb(0_0_0/0.18),transparent_22%,transparent_70%,rgb(0_0_0/0.22))]" : "bg-black/25"}`} />
      <motion.div
        className="relative flex min-h-0 flex-1"
        style={{ x, width: w * PAGES }}
        drag={folder ? false : "x"}
        dragDirectionLock
        dragConstraints={{ left: -(PAGES - 1) * w, right: 0 }}
        dragElastic={0.2}
        dragMomentum={false}
        onDragStart={() => (swiped.current = true)}
        onDragEnd={(_, info) => {
          const at = -x.get() / w;
          const v = info.velocity.x;
          // a flick turns the page whatever the distance; otherwise the nearer page wins
          go(Math.abs(v) > 320 ? (v < 0 ? Math.floor(at) + 1 : Math.ceil(at) - 1) : Math.round(at), v);
          window.setTimeout(() => (swiped.current = false), 80);
        }}
        data-home-pages=""
      >
        <div className={pageCls} style={{ width: w }} aria-hidden={page !== 0} data-page="0">
          <PlayingWidget onOpen={open} />
          <div className="grid grid-cols-2 gap-[14px] [@media(max-height:759px)]:hidden">
            <ClockWidget onOpen={open} />
            <ProjectsWidget onOpen={open} />
          </div>
          <div className={`${GRID} gap-y-[18px] pt-1`}>
            {HOME_APPS.map((id, i) => (
              <motion.div key={id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.04 + i * 0.03 }}>
                <HomeIcon id={id} onOpen={open} />
              </motion.div>
            ))}
          </div>
        </div>
        <div className={pageCls} style={{ width: w }} aria-hidden={page !== 1} data-page="1">
          <PhotoWidget onOpen={open} />
          <div className="grid grid-cols-2 gap-[14px]">
            <WorkingWidget onOpen={open} />
            <FlyWidget onFly={() => !swiped.current && onFly()} />
          </div>
          <div className="grid grid-cols-2 gap-[14px] [@media(max-height:689px)]:hidden">
            <GamesWidget onOpen={open} />
            <ContactWidget onOpen={open} />
          </div>
          <TimelineWidget onOpen={open} />
        </div>
      </motion.div>
      <div className="relative px-[13px] pb-[calc(var(--phone-bottom)-24px)]">
        <div className="flex justify-center gap-[9px] py-3" role="tablist" aria-label="Home screen pages">
          {Array.from({ length: PAGES }, (_, i) => (
            <button key={i} type="button" role="tab" aria-selected={page === i} aria-label={`Page ${i + 1}`} onClick={() => go(i)} className="relative grid h-5 w-4 place-items-center after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']" data-page-dot={i}>
              <span className={`h-[7px] w-[7px] rounded-full transition-colors duration-300 ${page === i ? "bg-white" : "bg-white/35"}`} />
            </button>
          ))}
        </div>
        <div data-glass="" className={`${glass("dock")} ${GRID} rounded-[34px] px-[14px] py-4`}>
          {dock.map((id) => (
            <HomeIcon key={id} id={id} label="" onOpen={open} />
          ))}
        </div>
      </div>
      <AnimatePresence>{folder && <Folder key={folder} id={folder} onOpen={openFromFolder} onClose={() => setFolder(null)} />}</AnimatePresence>
    </div>
  );
}

// ---------- power ----------

// The way to turn it off, said plainly: one sheet, the same from the lock screen and from Settings.
function PowerSheet({ onClose }: { onClose: () => void }) {
  const shutdown = useOS((s) => s.shutdown);
  return (
    <motion.div className="absolute inset-0 z-[95] flex flex-col justify-end px-3 pb-[calc(var(--phone-bottom)-20px)]" exit={{ opacity: 1, transition: { duration: 0.22 } }} onClick={onClose} role="dialog" aria-label="Power" data-power-sheet="">
      {/* the scrim fades by itself and the sheet slides: nothing that blurs sits inside a fading parent */}
      <motion.div aria-hidden className="absolute inset-0 bg-black/45 backdrop-blur-[18px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_OUT } }} transition={M.fade} />
      <motion.div className="relative flex flex-col gap-2" initial={{ y: "110%" }} animate={{ y: 0 }} exit={{ y: "110%", transition: { duration: 0.22, ease: EASE_OUT } }} transition={M.sheet} onClick={(e) => e.stopPropagation()}>
        <div data-glass="" className={`${glass("widget-dark")} flex flex-col items-center rounded-[30px] px-6 pb-3 pt-6 text-center text-white`}>
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white/14">
            <Sym icon={Power} size={24} weight="semibold" />
          </span>
          <span className="mt-3 text-[20px] font-semibold leading-6 tracking-[-0.025em]">Power Off</span>
          <span className="mt-1 max-w-[260px] text-[14px] leading-[19px] text-white/65">The phone goes dark and you are back at the desk in the field.</span>
          <button
            type="button"
            data-power="off"
            onClick={() => {
              onClose();
              sfx("shutdown");
              shutdown();
            }}
            className="press mt-5 flex h-[52px] w-full items-center justify-center rounded-full bg-[#FF453A] text-[17px] font-semibold tracking-[-0.02em] text-white"
          >
            Power Off
          </button>
          <button type="button" onClick={onClose} className="press mt-1 flex h-[48px] w-full items-center justify-center rounded-full text-[17px] font-medium tracking-[-0.02em] text-white/85">
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------- iOS navigation: large title that collapses into the nav bar ----------

function AppScroll({ id, ground, dark, onClose }: { id: AppId; ground: string; dark: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: ref });
  // a pushed screen (a Settings pane, a Taste list): Back top-left, and the large title names it
  const [detail, setDetail] = useState<PhoneDetail>(null);
  // a story opens on a picture that runs to the top edge, under the status bar (which turns white over it)
  const p = projects[id];
  const story = !!p && !(p.link && p.embeddable) && p.kind !== "code";
  const [hero] = useState(() => (story ? window.innerWidth * 1.25 : 0));
  // the bar comes in as the large title leaves: a pushed screen's title sits a row lower, a story's under its picture
  const from = story ? hero - 60 : detail ? 74 : 24;
  const bar = useTransform(scrollY, (v) => Math.min(1, Math.max(0, (v - from) / 20)));
  const big = useTransform(scrollY, (v) => Math.min(1, Math.max(0, 1 - (v - from + 24) / 36)));
  useEffect(() => {
    if (!story) return;
    const set = (v: number) => useOS.getState().setHeroDark(v < hero - 30);
    set(scrollY.get());
    const off = scrollY.on("change", set);
    return () => {
      off();
      useOS.getState().setHeroDark(false);
    };
  }, [story, hero, scrollY]);
  const title = detail?.title ?? phoneTitle(id);
  const btn = dark ? `${glass("btn-dark")} text-white/90` : `${glass("btn")} text-[#3C3C43]/75`;
  return (
    <div className={`phone-app absolute inset-0 ${ground}`}>
      <motion.div
        style={{ opacity: bar }}
        data-glass=""
        className={`glass pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[calc(var(--phone-top)+52px)] items-center justify-center px-[68px] pb-1 pt-[calc(var(--phone-top)+4px)] ${dark ? "ios-bar-dark" : "ios-bar"}`}
      >
        {/* one row with Close and Back: 44pt, centred on them */}
        <span className={`truncate text-[17px] font-semibold tracking-[-0.02em] ${dark ? "text-white" : "text-ink"}`}>{title}</span>
      </motion.div>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${phoneTitle(id)}`}
        data-glass=""
        className={`glass-press absolute right-4 top-[calc(var(--phone-top)+4px)] z-30 flex h-11 w-11 items-center justify-center rounded-full ${btn}`}
      >
        <Sym icon={X} size={20} weight="semibold" />
      </button>
      <AnimatePresence>
        {detail && (
          <motion.button
            key="back"
            type="button"
            onClick={detail.back}
            aria-label="Back"
            data-glass=""
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: M.out }}
            transition={M.pop}
            className={`absolute left-4 top-[calc(var(--phone-top)+4px)] z-30 flex h-11 w-11 items-center justify-center rounded-full ${btn}`}
          >
            <Sym icon={ChevronLeft} size={26} className="-ml-0.5" weight="semibold" />
          </motion.button>
        )}
      </AnimatePresence>
      <div ref={ref} className="absolute inset-0 overflow-y-auto overscroll-contain pb-[calc(var(--phone-bottom)+14px)]">
        {/* a contact card and an About sheet carry their own big name, so no large title over them */}
        {id === "contact" || id === "about" || id === "blocks" || id === "doom" || id === "projects" || id === "games" || projects[id] ? (
          <div className={story ? "" : id === "contact" || id === "about" || p?.kind === "code" ? "h-[calc(var(--phone-top)+50px)]" : "h-[calc(var(--phone-top)+4px)]"} />
        ) : (
        <motion.h2
          style={{ opacity: big }}
          className={`pb-2 pl-4 pr-16 text-[34px] font-bold leading-[41px] tracking-[0.011em] ${detail ? "pt-[calc(var(--phone-top)+56px)]" : "pt-[calc(var(--phone-top)+6px)]"}`}
        >
          {title}
        </motion.h2>
        )}
        <PhoneNav.Provider value={setDetail}>
          <Chrome.Provider value={{ compact: true }}>
            <AppView id={id} />
          </Chrome.Provider>
        </PhoneNav.Provider>
      </div>
    </div>
  );
}

// ---------- app window: grows out of its icon, home gesture to close ----------

function AppWindow({ id, origin, onClosed, onLeaving }: { id: AppId; origin: Origin | null; onClosed: () => void; onLeaving?: (leaving: boolean) => void }) {
  const [vw] = useState(() => window.innerWidth);
  const [vh] = useState(() => window.innerHeight);
  const o = origin ?? { x: vw / 2 - 31, y: vh / 2 - 31, w: 62, h: 62 };
  const s0 = o.w / vw;
  const icx = o.x + o.w / 2 - vw / 2;
  const icy = o.y + o.h / 2 - vh / 2;
  const inset = Math.max(0, (vh - vw) / 2);

  // p: 0 = the icon, 1 = full screen. lift: finger offset during the home gesture.
  const p = useMotionValue(0);
  const lift = useMotionValue(0);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const scale = useTransform(p, (v) => s0 + (1 - s0) * v);
  const x = useTransform(p, (v) => icx * (1 - v));
  const y = useTransform([p, lift], ([v, l]: number[]) => icy * (1 - v) + l * 0.45 * v);
  const clipPath = useTransform(p, (v) => {
    const t = inset * (1 - v);
    const r = v >= 0.999 ? 0 : Math.max((vw * 0.225) * (1 - v), 40);
    return `inset(${t}px 0px ${t}px 0px round ${r}px)`;
  });
  const iconOpacity = useTransform(p, [0, 0.4], [1, 0]);
  // opaque while the window is still small: its glass bars (tab bar, player) need an opaque parent to frost,
  // and would otherwise snap to glass half-way through the move
  const contentOpacity = useTransform(p, [0.04, 0.22], [0, 1]);

  const to = (target: number, velocity = 0) => {
    anim.current?.stop();
    // on its way back to its icon the app no longer covers the home screen: the icons take taps again at once
    onLeaving?.(target === 0);
    anim.current = animate(p, target, {
      ...(target === 1 ? M.sheet : M.ui),
      velocity,
      onComplete: () => {
        if (target === 0) onClosed();
      },
    });
    animate(lift, 0, M.ui);
  };

  useEffect(() => {
    to(1);
    // open once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Home indicator: swipe up, the app follows the finger and shrinks toward its icon.
  const drag = useRef<{ y0: number; p0: number; hist: { y: number; t: number }[] } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    // one finger owns the gesture: a second touch does not restart it from somewhere else
    if (drag.current) return;
    anim.current?.stop();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // a pointer that cannot be captured still drives the gesture while it stays on the strip
    }
    drag.current = { y0: e.clientY, p0: p.get(), hist: [{ y: e.clientY, t: e.timeStamp }] };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = Math.min(0, e.clientY - d.y0);
    lift.set(dy);
    p.set(Math.max(0.25, d.p0 + dy / (vh * 0.85)));
    d.hist.push({ y: e.clientY, t: e.timeStamp });
    if (d.hist.length > 5) d.hist.shift();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const a = d.hist[0];
    const b = d.hist[d.hist.length - 1];
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0; // px/s, negative = up
    const dy = e.clientY - d.y0;
    if (dy < -90 || v < -550) {
      to(0, v / (vh * 0.85));
    }
    else to(1);
  };

  const darkApp = id === "terminal" || id === "doom" || id === "blocks";
  // sidebar apps become iOS grouped lists: grey ground, title on the same ground
  const grouped = ["projects", "games", "taste", "kit", "settings", "contact", "records"].includes(id) || projects[id]?.kind === "code";
  const ground = darkApp ? "bg-[#1C1D20] text-white" : grouped ? "bg-[#F2F2F7] text-ink" : "bg-white text-ink";
  return (
    <motion.div className="phone-app absolute inset-0 z-[60] will-change-transform" style={{ x, y, scale, clipPath }}>
      <div className={`absolute inset-0 ${ground}`} />
      <motion.div style={{ opacity: contentOpacity }} className="absolute inset-0">
        <AppScroll id={id} ground={ground} dark={darkApp} onClose={() => (to(0))} />
      </motion.div>
      {/* the icon the app grows out of */}
      <motion.div style={{ opacity: iconOpacity, top: inset, height: vw }} className="pointer-events-none absolute inset-x-0">
        <IconFace id={id} />
      </motion.div>
      {/* home indicator */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="absolute inset-x-0 bottom-0 z-10 flex h-[var(--phone-bottom)] touch-none items-end justify-center pb-[calc(var(--phone-bottom)-26px)]"
        aria-label="Swipe up to go home"
        role="button"
      >
        <span className={`h-[5px] w-[134px] rounded-full ${darkApp ? "bg-white/80" : "bg-ink/85"}`} />
      </div>
    </motion.div>
  );
}

export default function PhoneOS() {
  useGlassScope();
  useEffect(warmApps, []);
  const up = useOS(isUp);
  const phoneApp = useOS((s) => s.phoneApp);
  const origin = useOS((s) => s.phoneOrigin);
  const openPhoneApp = useOS((s) => s.openPhoneApp);
  const heroDark = useOS((s) => s.heroDark);
  const lightBar = !(up) || !phoneApp || phoneApp === "terminal" || phoneApp === "doom" || phoneApp === "blocks" || (!!phoneApp && heroDark);
  const shutdown = useOS((s) => s.shutdown);
  const [power, setPower] = useState(false);
  // an app that is closing has let go of the home screen
  const [leaving, setLeaving] = useState(false);
  useEffect(() => setLeaving(false), [phoneApp]);
  // A real phone already has a status bar and an island of its own: ours would sit under them, everything twice.
  // There (a touch screen; the desktop's phone preview is a mouse) the clock, signal and battery are left out,
  // the island is only a pill for live activity, and every screen starts just under the real bar.
  const [real, setReal] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const forced = process.env.NODE_ENV !== "production" ? /[?&]realphone=([01])/.exec(window.location.search)?.[1] : undefined;
    const set = () => setReal(forced ? forced === "1" : mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  const playing = usePlayer().playing;
  const activity = useOS((s) => s.activity);
  const pill = real && (playing || !!activity);
  // Where every screen starts and ends is --phone-top and --phone-bottom (globals.css, .phone-root): they follow
  // data-real and data-pill here, and nothing on the phone measures the status bar or the home indicator itself.
  // the Fly shortcut: the tap wakes the music, the phone goes dark, and the desk sends the plane off
  const fly = () => {
    flightMusicPrime();
    handoff.fly = true;
    shutdown();
  };

  return (
    <div className="phone-root no-callout absolute inset-0 overflow-hidden bg-page" data-real={real ? "1" : "0"} data-pill={pill ? "1" : "0"}>
      {/* the page's one h1: every screen's own title is an h2 under it */}
      <h1 className="sr-only">Augustas Armalis, design engineer and founder</h1>
      {!real && <StatusBar light={lightBar} />}
      <Island real={real} />
      <AnimatePresence initial={false}>
        {up ? (
          <motion.div
            key="home"
            className="absolute inset-0"
            // under an open app the home screen is out of reach: nothing on it takes focus or a tap
            inert={!!phoneApp && !leaving}
            // transform only: the widgets and the Dock are glass, and glass inside a fading parent goes flat. The
            // lock screen is over it while it settles, and comes back over it at once when the phone locks.
            initial={{ scale: reducedMotion() ? 1 : 1.08 }}
            animate={{ scale: 1 }}
            exit={{ scale: 1, transition: { duration: 0.01 } }}
            transition={M.sheet}
          >
            <Home onOpen={(id, o) => openPhoneApp(id, o)} onFly={fly} />
          </motion.div>
        ) : (
          <motion.div
            key="lock"
            className="absolute inset-0 z-[50]"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ y: "-100%", transition: M.sheet }}
            transition={M.fade}
          >
            <Lock onPower={() => setPower(true)} />
          </motion.div>
        )}
      </AnimatePresence>
      {up && phoneApp && <AppWindow key={phoneApp} id={phoneApp} origin={origin} onClosed={() => openPhoneApp(null)} onLeaving={setLeaving} />}
      <AnimatePresence>{power && <PowerSheet key="power" onClose={() => setPower(false)} />}</AnimatePresence>
      <PowerOverlay />
    </div>
  );
}
