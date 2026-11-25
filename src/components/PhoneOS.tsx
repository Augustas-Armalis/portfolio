"use client";

import { AnimatePresence, animate, motion, useMotionValue, useScroll, useTransform, type AnimationPlaybackControls, type MotionValue } from "motion/react";
import { flushSync } from "react-dom";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apps, dockApps, gallery, gameApps, mainWork, playableTracks, projectApps, projectGroups, projects, sharedApps, shots, timeline, tracks, type AppId } from "@/content";
import { flightMusicPrime } from "@/lib/flightMusic";
import { handoff } from "@/lib/handoff";
import { isUp, useOS, useWallpaper } from "@/store";
import { AppIcon, AppView, LiveWallpaper, player, usePlayer, warmApps } from "./Apps";
import { Bars, PowerOverlay } from "./shell";
import { IconFace } from "./icons";
import { BookOpen, Check, ChevronLeft, Folder as FolderSym, Images, Music, Pause, Play, Power, Send, Wifi, X } from "lucide-react";
import { Sym } from "./symbols";
import { Chrome, EASE_OUT, glass, instantly, M, PhoneBack, PhoneNav, reducedMotion, SPRING_GLASS, sfx, useEdgeSwipe, useGlassScope, useLiveInterval, type PhoneDetail } from "./ui";
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
            <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, delay: 0.08 }} className="absolute inset-0 flex flex-col px-5 pb-4 pt-5">
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
      {/* the time at the far left and the signal, Wi-Fi and battery at the far right, at every width: the island
          stays in the middle and only the space between them grows */}
      <span className="flex flex-1 justify-start pl-[max(24px,env(safe-area-inset-left))]">{time}</span>
      <span className="w-[126px] shrink-0" />
      <span className="flex flex-1 items-center justify-end gap-[5px] pr-[max(20px,env(safe-area-inset-right))]">
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

// the round lock screen widgets: the places people come for
const LOCK_WAYS: { id: AppId; icon: typeof Music }[] = [
  { id: "projects", icon: FolderSym },
  { id: "records", icon: Music },
  { id: "gallery", icon: Images },
  { id: "novel", icon: BookOpen },
];

function Lock({ onPower, lift, onPeek }: { onPower: () => void; lift: MotionValue<number>; onPeek: (on: boolean) => void }) {
  const login = useOS((s) => s.login);
  // swipe up to open: the lock screen follows the finger with the home screen settling in under it; let go high
  // enough (or with a flick) and it carries on up from where it is, otherwise it drops back
  // a way in from the lock screen: open, then that app
  const openFrom = (id: AppId) => {
    login();
    window.setTimeout(() => useOS.getState().openPhoneApp(id), 0);
  };
  const lifting = useRef<{ id: number; x0: number; y0: number; on: boolean; hist: { y: number; t: number }[] } | null>(null);
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
      className="wp-photo absolute inset-0 flex touch-none flex-col items-center bg-black text-white"
      style={wp.src.startsWith("live:") ? undefined : { backgroundImage: `url(${wp.src})` }}
      onPointerDown={(e) => {
        held.current = false;
        hold.current = window.setTimeout(() => {
          held.current = true;
          onPower();
        }, 600);
        if (!lifting.current) lifting.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, hist: [{ y: e.clientY, t: e.timeStamp }] };
      }}
      onPointerMove={(e) => {
        const d = lifting.current;
        if (!d || d.id !== e.pointerId) return;
        const dy = e.clientY - d.y0;
        if (!d.on) {
          // a finger that moves is not holding: no power sheet
          if (Math.hypot(e.clientX - d.x0, dy) > 8) window.clearTimeout(hold.current);
          if (dy > -10) return;
          d.on = true;
          held.current = true;
          window.clearTimeout(hold.current);
          onPeek(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // the lock screen fills the phone: the finger stays over it anyway
          }
        }
        lift.set(Math.min(0, dy));
        d.hist.push({ y: e.clientY, t: e.timeStamp });
        if (d.hist.length > 5) d.hist.shift();
      }}
      onPointerUp={(e) => {
        window.clearTimeout(hold.current);
        const d = lifting.current;
        lifting.current = null;
        if (!d?.on) return;
        const a = d.hist[0];
        const b = d.hist[d.hist.length - 1];
        const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0;
        if (e.type !== "pointercancel" && (lift.get() < -window.innerHeight * 0.18 || v < -500)) login();
        else animate(lift, 0, { ...M.fling, velocity: v, onComplete: () => onPeek(false) });
      }}
      onPointerLeave={() => !lifting.current?.on && window.clearTimeout(hold.current)}
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
        {/* lock screen widgets, at the bottom like iOS 26: what he's working on, and four ways in. A tap on one
            opens the phone straight into that app. Each widget fades itself: glass inside a fading parent sits flat
            until the fade ends, then snaps. */}
        <motion.div initial={{ y: 8 }} animate={{ y: 0 }} transition={{ ...M.arrive, delay: 0.45 }} className="flex w-full items-stretch gap-2.5">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...M.arrive, delay: 0.45 }}
            data-glass=""
            onClick={(e) => (e.stopPropagation(), !held.current && openFrom(mainWork.id as AppId))}
            className={`${glass("widget-dark")} glass-press flex min-w-0 flex-1 items-center gap-3 rounded-[26px] py-3 pl-3 pr-4 text-left`}
          >
            <AppIcon id={mainWork.id as AppId} size={40} />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium leading-4 text-white/60">Working on</span>
              <span className="t-headline block truncate text-white">{mainWork.name}</span>
            </span>
          </motion.button>
          <span className="flex shrink-0 items-center gap-1.5">
            {LOCK_WAYS.map((w, n) => (
              <motion.button
                key={w.id}
                type="button"
                aria-label={`Open ${phoneTitle(w.id)}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...M.pop, delay: 0.5 + n * 0.04 }}
                data-glass=""
                onClick={(e) => (e.stopPropagation(), !held.current && openFrom(w.id))}
                className={`${glass("widget-dark")} glass-press flex h-11 w-11 items-center justify-center rounded-full text-white`}
              >
                <Sym icon={w.icon} size={18} weight="semibold" />
              </motion.button>
            ))}
          </span>
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
  const down = useRef<{ x: number; y: number } | null>(null);
  const openIt = () => {
    const r = ref.current!.getBoundingClientRect();
    onOpen(id, { x: r.x, y: r.y, w: r.width, h: r.height });
  };
  return (
    <div className="relative flex w-[60px] flex-col items-center gap-[5px]">
      <motion.button
        type="button"
        aria-label={`Open ${apps[id].title}`}
        onPointerDown={(e) => {
          down.current = { x: e.clientX, y: e.clientY };
          timer.current = window.setTimeout(() => setHeld(true), 450);
        }}
        // a finger that moves is swiping the page, not holding the icon
        onPointerMove={(e) => {
          const d = down.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) window.clearTimeout(timer.current);
        }}
        onPointerUp={() => window.clearTimeout(timer.current)}
        onPointerCancel={() => window.clearTimeout(timer.current)}
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

// true while an app covers the home screen: its clocks and slideshows stop ticking, and it is not drawn at all
const HomeCovered = createContext(false);
// an interval that only runs while the home screen is in sight
function useHomeInterval(fn: () => void, ms: number, atOnce = false) {
  const covered = useContext(HomeCovered);
  const f = useRef(fn);
  f.current = fn;
  // and only while the tab is shown and the scene is not paused
  useLiveInterval(() => f.current(), covered ? null : ms, atOnce);
}

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
  const track = tracks.find((t) => t.id === p.id) ?? playableTracks[0];
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

// Start here: where things are, four places a visitor came for, each with a line on what is inside.
const GUIDE: { id: AppId; what: string }[] = [
  { id: "projects", what: "What I've built" },
  { id: "records", what: "My music" },
  { id: "gallery", what: "Photos and films" },
  { id: "novel", what: "My book" },
];
function GuideWidget({ onOpen }: { onOpen: Open }) {
  return (
    <div data-glass="" data-widget="guide" className={`relative overflow-hidden rounded-[26px] text-white ${glass("widget-dark")} flex ${WIDGET_H} flex-col px-3 pb-3 pt-3.5`}>
      <span className={`${kicker} px-1`}>Start here</span>
      <span className="mt-2 grid flex-1 grid-cols-2 gap-1.5">
        {GUIDE.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-label={`Open ${apps[g.id].title}: ${g.what}`}
            onClick={(e) => onOpen(g.id, rectOf(e.currentTarget.firstElementChild ?? e.currentTarget))}
            className="press flex min-w-0 items-center gap-2.5 rounded-[16px] bg-white/[0.08] px-2 text-left"
          >
            <span className="block shrink-0">
              <AppIcon id={g.id} size={32} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-4 tracking-[-0.01em]">{phoneTitle(g.id)}</span>
              <span className="block truncate text-[11px] leading-[14px] text-white/60">{g.what}</span>
            </span>
          </button>
        ))}
      </span>
    </div>
  );
}

// His projects, one at a time, each under its own mark.
const STACK: AppId[] = projectGroups.slice(0, 2).flatMap((g) => g.apps).filter((id) => projects[id]);
function ProjectsWidget({ onOpen }: { onOpen: Open }) {
  const [i, setI] = useState(0);
  useHomeInterval(() => setI((n) => (n + 1) % STACK.length), 3600);
  const id = STACK[i];
  const p = projects[id]!;
  return (
    <Widget app="projects" onOpen={onOpen} className={`flex ${WIDGET_H} flex-col p-4`}>
      <span className={kicker}>Projects</span>
      <span className="relative mt-2 block flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={id} className="absolute inset-0 flex flex-col justify-between" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
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

// A large picture from the Gallery, changing slowly.
function PhotoWidget({ onOpen }: { onOpen: Open }) {
  // a few of his photographs: the Gallery's Best of, one after another
  const best = useMemo(() => (gallery.albums.find((x) => x.id === "best")?.items ?? []).map((id) => gallery.media.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m && m.kind === "photo"), []);
  const [i, setI] = useState(0);
  useHomeInterval(() => setI((n) => (n + 1) % Math.max(1, best.length)), 6000);
  const s = best[i];
  if (!s) return null;
  return (
    <Widget app="gallery" onOpen={onOpen} label="Open Gallery" className="block h-[clamp(132px,24dvh,206px)] w-full">
      <AnimatePresence initial={false}>
        <motion.img key={s.id} src={s.src.replace(/w=\d+/, "w=900")} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: EASE_OUT }} />
      </AnimatePresence>
      <span aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(0_0_0/0.55))]" />
      <span className="absolute inset-x-4 bottom-3 flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-semibold tracking-[-0.022em]">Gallery</span>
        <span className="truncate text-[13px] text-white/75">{s.title}</span>
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
        <span className="block truncate text-[13px] leading-[17px] text-white/45">A team of three</span>
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
  // a swipe in from the left edge closes it too: the panel follows the finger
  const fx = useMotionValue(0);
  const edge = useEdgeSwipe({
    move: (dx) => fx.set(dx),
    end: (dx, v) => (dx > 90 || v > 500 ? onClose() : animate(fx, 0, { ...M.fling, velocity: v })),
  });
  return (
    // Each layer fades by itself. A backdrop blur (the scrim, the glass panel) inside a parent that is fading has
    // nothing behind it to blur until the fade ends: it would sit flat and then snap to frosted.
    <motion.div className="absolute inset-0 z-[40] flex flex-col items-center justify-center px-6" exit={{ opacity: 1, transition: M.out }} onClick={onClose} role="dialog" aria-label={`${f.title} folder`} data-folder={id}>
      <motion.div aria-hidden className="absolute inset-0 bg-black/35 backdrop-blur-[26px] backdrop-saturate-150" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: M.out }} transition={M.fade} />
      <div {...edge} aria-hidden onClick={(e) => e.stopPropagation()} className="absolute inset-y-0 left-0 z-10 w-4 touch-none" />
      <motion.div style={{ x: fx }} className="relative w-full max-w-[340px]" initial={{ scale: 0.9, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, transition: M.out }} transition={M.ui} onClick={(e) => e.stopPropagation()}>
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
  const edgeY = useRef<number | null>(null);
  const slide = useRef<AnimationPlaybackControls | null>(null);
  // a swipe is not a tap: whatever was under the finger does not open
  const swiped = useRef(false);
  const go = (p: number, velocity = 0) => {
    const to = Math.min(PAGES - 1, Math.max(0, p));
    setPage(to);
    slide.current?.stop();
    slide.current = animate(x, -to * w, { ...M.ui, velocity });
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
  // The pages follow the finger 1:1 (our own pointer handling: the library drag lost its place on a slow swipe
  // and snapped back). Past the first or last page it gives a little; let go and a flick turns the page whatever
  // the distance, otherwise the nearer page wins. A page still moving can be caught.
  const g = useRef<{ id: number; x0: number; y0: number; bx: number; axis: "x" | "y" | null; hist: { x: number; t: number }[] } | null>(null);
  const pager = {
    down: (e: React.PointerEvent<HTMLDivElement>) => {
      if (folder || g.current || (e.pointerType === "mouse" && e.button !== 0)) return;
      g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, bx: x.get(), axis: null, hist: [{ x: e.clientX, t: e.timeStamp }] };
    },
    move: (e: React.PointerEvent<HTMLDivElement>) => {
      const s = g.current;
      if (!s || s.id !== e.pointerId || s.axis === "y") return;
      const dx = e.clientX - s.x0;
      if (!s.axis) {
        const dy = e.clientY - s.y0;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
        s.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
        if (s.axis === "y") return;
        swiped.current = true;
        slide.current?.stop();
        s.bx = x.get();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // the pages fill the screen: the finger stays over them anyway
        }
      }
      const min = -(PAGES - 1) * w;
      let to = s.bx + dx;
      if (to > 0) to *= 0.25;
      if (to < min) to = min + (to - min) * 0.25;
      x.set(to);
      s.hist.push({ x: e.clientX, t: e.timeStamp });
      if (s.hist.length > 5) s.hist.shift();
    },
    up: (e: React.PointerEvent<HTMLDivElement>) => {
      const s = g.current;
      if (!s || s.id !== e.pointerId) return;
      g.current = null;
      if (s.axis !== "x") return;
      const a = s.hist[0];
      const b = s.hist[s.hist.length - 1];
      const v = e.type === "pointercancel" || b.t <= a.t ? 0 : Math.max(-4000, Math.min(4000, ((b.x - a.x) / (b.t - a.t)) * 1000));
      const at = -x.get() / w;
      go(Math.abs(v) > 320 ? (v < 0 ? Math.floor(at) + 1 : Math.ceil(at) - 1) : Math.round(at), v);
      window.setTimeout(() => (swiped.current = false), 80);
    },
  };
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
        onPointerDown={pager.down}
        onPointerMove={pager.move}
        onPointerUp={pager.up}
        onPointerCancel={pager.up}
        data-home-pages=""
      >
        <div className={pageCls} style={{ width: w }} aria-hidden={page !== 0} data-page="0">
          <PlayingWidget onOpen={open} />
          <div className="[@media(max-height:759px)]:hidden">
            <GuideWidget onOpen={open} />
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
            <ProjectsWidget onOpen={open} />
            <GamesWidget onOpen={open} />
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
      {/* the bottom edge, under the Dock: a swipe up from here opens the app switcher, as it does inside an app */}
      <div
        aria-hidden
        data-home-edge=""
        className="absolute inset-x-0 bottom-0 z-[5] h-[18px] touch-none"
        onPointerDown={(e) => {
          edgeY.current = e.clientY;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // the strip spans the screen: the finger stays over it at the start
          }
        }}
        onPointerUp={(e) => {
          const y0 = edgeY.current;
          edgeY.current = null;
          if (y0 !== null && y0 - e.clientY > 60) useOS.getState().setPhoneSwitcher(true);
        }}
        onPointerCancel={() => (edgeY.current = null)}
      />
      <AnimatePresence>{folder && <Folder key={folder} id={folder} onOpen={openFromFolder} onClose={() => setFolder(null)} />}</AnimatePresence>
    </div>
  );
}

// ---------- app switcher ----------

// One open app as a card. Sideways the row scrolls (the browser's own scroll, with its momentum); up, the card
// follows the finger and, let go high enough or with a flick, flies off and the app is closed; a tap opens it,
// grown out of the card.
function SwitcherCard({ id, n, onOpen, onClose }: { id: AppId; n: number; onOpen: (id: AppId, o: Origin) => void; onClose: (id: AppId) => void }) {
  const y = useMotionValue(0);
  const fade = useTransform(y, [0, -320], [1, 0]);
  const card = useRef<HTMLDivElement>(null);
  const g = useRef<{ id: number; x0: number; y0: number; on: boolean; dead: boolean; hist: { y: number; t: number }[] } | null>(null);
  const dark = id === "terminal" || id === "doom" || id === "blocks";
  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current;
    if (!s || s.id !== e.pointerId) return;
    g.current = null;
    if (s.on) {
      const a = s.hist[0];
      const b = s.hist[s.hist.length - 1];
      const v = e.type === "pointercancel" || b.t <= a.t ? 0 : ((b.y - a.y) / (b.t - a.t)) * 1000;
      if (y.get() < -140 || v < -700) animate(y, -window.innerHeight, { type: "spring", bounce: 0, duration: 0.35, velocity: v, onComplete: () => onClose(id) });
      else animate(y, 0, { ...M.fling, velocity: v });
      return;
    }
    if (!s.dead && e.type === "pointerup" && card.current) onOpen(id, rectOf(card.current));
  };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 24 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, transition: M.out }}
      transition={{ ...M.ui, delay: n * 0.035 }}
      className="shrink-0 snap-center"
    >
      <motion.div
        style={{ y, opacity: fade }}
        className="flex touch-pan-x flex-col items-start gap-2"
        onPointerDown={(e) => {
          if (g.current) return;
          g.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, dead: false, hist: [{ y: e.clientY, t: e.timeStamp }] };
        }}
        onPointerMove={(e) => {
          const s = g.current;
          if (!s || s.id !== e.pointerId || s.dead) return;
          const dx = e.clientX - s.x0;
          const dy = e.clientY - s.y0;
          if (!s.on) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
            if (Math.abs(dx) > Math.abs(dy) || dy > 0) {
              s.dead = true;
              return;
            }
            s.on = true;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // the card stays under the finger as it moves up
            }
          }
          y.set(dy < 0 ? dy : dy * 0.2);
          s.hist.push({ y: e.clientY, t: e.timeStamp });
          if (s.hist.length > 5) s.hist.shift();
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        data-switcher-card={id}
      >
        <span className="flex items-center gap-2 pl-1 text-[15px] font-semibold tracking-[-0.015em] text-white [text-shadow:0_1px_6px_rgb(0_0_0/0.35)]">
          <AppIcon id={id} size={28} />
          {phoneTitle(id)}
        </span>
        <div
          ref={card}
          role="button"
          tabIndex={0}
          aria-label={`Open ${phoneTitle(id)}`}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && card.current && onOpen(id, rectOf(card.current))}
          className={`relative h-[62dvh] w-[62vw] overflow-hidden rounded-[30px] shadow-[0_20px_50px_-20px_rgb(0_0_0/0.6)] ${dark ? "bg-[#1C1D20] text-white" : "bg-[#F2F2F7] text-ink"}`}
        >
          <span className="absolute left-4 top-5 text-[26px] font-bold leading-8 tracking-[0.01em]">{phoneTitle(id)}</span>
          <span className="absolute inset-0 flex items-center justify-center">
            <AppIcon id={id} size={76} />
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Switcher({ onOpen }: { onOpen: (id: AppId, o: Origin) => void }) {
  const recents = useOS((s) => s.phoneRecents);
  const close = () => useOS.getState().setPhoneSwitcher(false);
  return (
    // the scrim fades by itself and the cards come in on their own: nothing that blurs sits in a fading parent
    <motion.div className="absolute inset-0 z-[70] flex flex-col justify-center" exit={{ opacity: 1, transition: M.out }} onClick={close} role="dialog" aria-label="Open apps" data-switcher="">
      <motion.div aria-hidden className="absolute inset-0 bg-black/40 backdrop-blur-[20px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: M.out }} transition={M.fade} />
      {recents.length ? (
        <div onClick={(e) => e.stopPropagation()} className="relative flex snap-x snap-mandatory items-center gap-4 overflow-x-auto px-[19vw] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <AnimatePresence initial>
            {recents.map((id, n) => (
              <SwitcherCard key={id} id={id} n={n} onOpen={onOpen} onClose={(x) => useOS.getState().closeRecent(x)} />
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative text-center text-[17px] font-medium text-white/80">
          No apps open
        </motion.p>
      )}
    </motion.div>
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

function AppScroll({ id, ground, dark, onClose, onBack }: { id: AppId; ground: string; dark: boolean; onClose: () => void; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: ref });
  // a pushed screen (a Settings pane, a Taste list): Back top-left, and the large title names it
  const [detail, setDetail] = useState<PhoneDetail>(null);
  // a story opens on a picture that runs to the top edge, under the status bar (which turns white over it)
  const p = projects[id];
  const story = false as boolean;
  const [hero] = useState(() => (story ? window.innerWidth * 1.25 : 0));
  // the bar comes in as the large title leaves: a pushed screen's title sits a row lower, a story's under its picture
  const from = story ? hero - 60 : detail || onBack ? 74 : 24;
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
        {(detail || onBack) && (
          <motion.button
            key="back"
            type="button"
            onClick={detail ? detail.back : onBack}
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
          <div className={story || p ? "" : id === "contact" || id === "about" ? "h-[calc(var(--phone-top)+50px)]" : "h-[calc(var(--phone-top)+4px)]"} />
        ) : (
        <motion.h2
          style={{ opacity: big }}
          className={`pb-2 pl-4 pr-16 text-[34px] font-bold leading-[41px] tracking-[0.011em] ${detail || onBack ? "pt-[calc(var(--phone-top)+56px)]" : "pt-[calc(var(--phone-top)+6px)]"}`}
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

// A phone app is one of a stack: the first grows out of its icon, one opened from inside another is pushed over it
// from the right (the one under it drifts a little left and dims, as on iOS). A swipe in from the left edge takes
// the deepest way back there is: a screen inside the app, else the app under this one, else home. The screen
// follows the finger and can be caught again while it settles.
type WindowProps = {
  id: AppId;
  origin: Origin | null;
  enter: "icon" | "push";
  // 0 is the app in front, 1 the one under it; deeper ones wait out of sight with their state kept
  depth: number;
  hidden: boolean;
  canPop: boolean;
  topX: MotionValue<number>;
  onClosed: () => void;
  onPop: () => void;
  onLeaving?: (leaving: boolean) => void;
  // whether the home screen is fully hidden under this app (so it can stop drawing)
  onCover?: (covered: boolean) => void;
  // swipe up and hold: let go into the app switcher
  onSwitcher?: () => void;
};
function AppWindow({ id, origin, enter, depth, hidden, canPop, topX, onClosed, onPop, onLeaving, onCover, onSwitcher }: WindowProps) {
  const [vw] = useState(() => window.innerWidth);
  const [vh] = useState(() => window.innerHeight);
  const o = origin ?? { x: vw / 2 - 31, y: vh / 2 - 31, w: 62, h: 62 };
  const s0 = o.w / vw;
  const icx = o.x + o.w / 2 - vw / 2;
  const icy = o.y + o.h / 2 - vh / 2;
  const inset = Math.max(0, (vh - vw) / 2);

  // p: 0 = the icon, 1 = full screen. lift: finger offset during the home gesture.
  const p = useMotionValue(enter === "push" ? 1 : 0);
  const lift = useMotionValue(0);
  // the whole window's opacity: only moved when less motion is asked for (it fades instead of growing)
  const veil = useMotionValue(1);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  const scale = useTransform(p, (v) => s0 + (1 - s0) * v);
  const x = useTransform(p, (v) => icx * (1 - v));
  const y = useTransform([p, lift], ([v, l]: number[]) => icy * (1 - v) + l * 0.45 * v);
  const clipPath = useTransform(p, (v) => {
    const t = inset * (1 - v);
    const r = v >= 0.999 ? 0 : Math.max((vw * 0.225) * (1 - v), 40);
    return `inset(${t}px 0px ${t}px 0px round ${r}px)`;
  });
  // the icon stays until the window is well on its way (the spring covers the first 40% in a few frames, so an
  // earlier fade showed a blank card growing), then dissolves into the app drawn under it
  const iconOpacity = useTransform(p, [0.2, 0.5], [1, 0]);
  // opaque while the window is still small: its glass bars (tab bar, player) need an opaque parent to frost,
  // and would otherwise snap to glass half-way through the move
  const contentOpacity = useTransform(p, [0.04, 0.22], [0, 1]);

  const to = (target: number, velocity = 0) => {
    anim.current?.stop();
    // on its way back to its icon the app no longer covers the home screen: the icons take taps again at once
    onLeaving?.(target === 0);
    if (target === 0) onCover?.(false);
    // asked for less motion: the app does not grow out of its icon or shrink back into it; it is simply there,
    // faded in (or out) where it stands
    if (reducedMotion()) {
      p.set(1);
      lift.set(0);
      if (target === 1) {
        veil.set(0);
        anim.current = animate(veil, 1, { duration: 0.2, ease: EASE_OUT, onComplete: () => onCover?.(true) });
      } else anim.current = animate(veil, 0, { duration: 0.16, ease: EASE_OUT, onComplete: onClosed });
      return;
    }
    anim.current = animate(p, target, {
      ...(target === 1 ? M.sheet : M.ui),
      velocity,
      onComplete: () => {
        if (target === 0) onClosed();
        else onCover?.(true);
      },
    });
    animate(lift, 0, M.ui);
  };

  // the slide: the app in front moves on topX (shared with the one under it, which follows at a third of the pace);
  // inside the app, a screen being swiped away moves on navX
  const navX = useMotionValue(0);
  const slide = useRef<AnimationPlaybackControls | null>(null);
  useEffect(() => {
    if (enter === "push" && !reducedMotion()) {
      topX.set(vw);
      slide.current = animate(topX, 0, { ...M.ui, onComplete: () => onCover?.(true) });
    } else if (enter === "push") {
      topX.set(0);
      onCover?.(true);
    } else {
      topX.set(0);
      to(1);
    }
    // open once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const under = useTransform(topX, (v) => (Math.min(v, vw) - vw) * 0.3);
  // the app under is only drawn while the one in front is moving off it
  const underShown = useTransform(topX, (v) => (v > 0.5 ? "visible" : "hidden"));
  const dim = useTransform(topX, [0, vw], [0.16, 0]);
  const top = depth === 0;

  // the ways back inside this app, deepest last
  const backs = useRef<(() => void)[]>([]);
  const registry = useMemo(
    () => ({
      add: (fn: () => void) => {
        backs.current.push(fn);
        return () => {
          backs.current = backs.current.filter((f) => f !== fn);
        };
      },
    }),
    [],
  );
  const pop = (velocity = 0) => {
    slide.current?.stop();
    slide.current = animate(topX, vw, {
      type: "spring",
      bounce: 0,
      duration: 0.32,
      velocity,
      // a frame later: the animation writes its last value after onComplete, which would undo the reset
      onComplete: () =>
        requestAnimationFrame(() => {
          flushSync(onPop);
          topX.set(0);
        }),
    });
  };
  const mode = useRef<"nested" | "pop" | "close">("close");
  const base = useRef(0);
  const mv = () => (mode.current === "nested" ? navX : topX);
  const edge = useEdgeSwipe({
    start: () => {
      slide.current?.stop();
      mode.current = backs.current.length ? "nested" : canPop ? "pop" : "close";
      if (mode.current === "close") onCover?.(false);
      base.current = mv().get();
    },
    move: (dx) => mv().set(Math.max(0, base.current + dx)),
    end: (_, v) => {
      const m = mv();
      const at = m.get();
      const go = v > 500 || (at > vw * 0.4 && v > -150);
      if (!go) {
        const close = mode.current === "close";
        slide.current = animate(m, 0, { ...M.fling, velocity: v, onComplete: () => close && onCover?.(true) });
        return;
      }
      if (mode.current === "pop") return pop(v);
      if (mode.current === "close") onLeaving?.(true);
      slide.current = animate(m, vw, {
        type: "spring",
        bounce: 0,
        duration: 0.32,
        velocity: v,
        onComplete: () => {
          if (mode.current === "close") return onClosed();
          // (a frame later, for the same reason as pop)
          requestAnimationFrame(() => {
            // the screen under comes back in from a little to the left, as the one under a push does
            const back = backs.current[backs.current.length - 1];
            instantly(
              () => back?.(),
              () => {
                slide.current = animate(navX, 0, M.ui);
              },
            );
            navX.set(-vw * 0.3);
          });
        },
      });
    },
  });

  // Home indicator: swipe up, the app follows the finger and shrinks toward its icon.
  // ...and swipe up and hold: the app switcher, as on iOS (the finger rests a moment once the app has lifted)
  const drag = useRef<{ y0: number; p0: number; hist: { y: number; t: number }[]; still?: number; hold?: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    // one finger owns the gesture: a second touch does not restart it from somewhere else
    if (drag.current) return;
    anim.current?.stop();
    onCover?.(false);
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
    // lifted well clear and resting (under 0.15 px/ms) for a fifth of a second: it will let go into the switcher
    const last = d.hist[d.hist.length - 1];
    const slow = Math.abs(e.clientY - last.y) / Math.max(1, e.timeStamp - last.t) < 0.15;
    if (dy < -100 && slow) {
      d.still ??= e.timeStamp;
      if (e.timeStamp - d.still > 180) d.hold = true;
    } else d.still = undefined;
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
    // a finger that rests sends no moves: a pause before letting go counts as the hold too
    const rested = e.timeStamp - b.t > 180 && dy < -100;
    if ((d.hold || rested) && (rested || v > -550) && e.type !== "pointercancel") return onSwitcher?.();
    if (dy < -90 || v < -550) {
      to(0, v / (vh * 0.85));
    }
    else to(1);
  };

  const darkApp = id === "terminal" || id === "doom" || id === "blocks";
  // sidebar apps become iOS grouped lists: grey ground, title on the same ground
  const grouped = ["projects", "games", "taste", "kit", "settings", "contact", "records"].includes(id);
  const ground = darkApp ? "bg-[#1C1D20] text-white" : grouped ? "bg-[#F2F2F7] text-ink" : "bg-white text-ink";
  return (
    <motion.div
      className={`absolute inset-0 ${top ? "shadow-[-12px_0_32px_rgb(0_0_0/0.2)]" : ""}`}
      style={{ x: top ? topX : depth === 1 ? under : 0, opacity: veil, zIndex: 60 - depth, visibility: depth > 1 || (!top && hidden) ? "hidden" : depth === 1 ? underShown : undefined }}
      inert={!top}
      data-phone-window={id}
      data-depth={depth}
    >
    <motion.div className="phone-app absolute inset-0 will-change-transform" style={{ x, y, scale, clipPath }}>
      <div className={`absolute inset-0 ${ground}`} />
      <motion.div style={{ opacity: contentOpacity, x: navX }} className="absolute inset-0">
        <PhoneBack.Provider value={registry}>
          <AppScroll id={id} ground={ground} dark={darkApp} onClose={() => to(0)} onBack={canPop ? () => pop() : undefined} />
        </PhoneBack.Provider>
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
      {depth === 1 && <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dim }} />}
      {/* the left edge: a swipe from here goes back */}
      {top && <div {...edge} aria-hidden data-edge-back="" className="absolute inset-y-0 left-0 z-[2600] w-4 touch-none" />}
    </motion.div>
  );
}

export default function PhoneOS() {
  useGlassScope();
  useEffect(warmApps, []);
  const up = useOS(isUp);
  const phoneApp = useOS((s) => s.phoneApp);
  const switcher = useOS((s) => s.phoneSwitcher);
  const origin = useOS((s) => s.phoneOrigin);
  const openPhoneApp = useOS((s) => s.openPhoneApp);
  const heroDark = useOS((s) => s.heroDark);
  const below = useOS((s) => s.phoneBelow);
  const enter = useOS((s) => s.phoneEnter);
  const phoneBack = useOS((s) => s.phoneBack);
  const stack = useMemo(() => (phoneApp ? [...below, phoneApp] : []), [below, phoneApp]);
  const topX = useMotionValue(0);
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    if (!phoneApp) setCovered(false);
  }, [phoneApp]);
  const lightBar = !(up) || !phoneApp || phoneApp === "terminal" || phoneApp === "doom" || phoneApp === "blocks" || (!!phoneApp && heroDark);
  const shutdown = useOS((s) => s.shutdown);
  const [power, setPower] = useState(false);
  const lift = useMotionValue(0);
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (up) setPeek(false);
  }, [up]);
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
        {/* the home screen is there under the lock screen while it is being swiped up */}
        {(up || peek) && (
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
            <HomeCovered.Provider value={covered && !!phoneApp}>
              <div className="absolute inset-0" style={covered && phoneApp ? { visibility: "hidden" } : undefined}>
                <Home onOpen={(id, o) => openPhoneApp(id, o)} onFly={fly} />
              </div>
            </HomeCovered.Provider>
          </motion.div>
        )}
        {!up && (
          <motion.div
            key="lock"
            className="absolute inset-0 z-[50]"
            style={{ y: lift }}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ y: -(typeof window === "undefined" ? 900 : window.innerHeight) - 40, transition: M.sheet }}
            transition={M.fade}
          >
            <Lock onPower={() => setPower(true)} lift={lift} onPeek={setPeek} />
          </motion.div>
        )}
      </AnimatePresence>
      {up &&
        stack.map((id, i) => {
          const depth = stack.length - 1 - i;
          return (
            <AppWindow
              key={`${id}:${i}`}
              id={id}
              origin={origin}
              enter={depth === 0 ? enter : "icon"}
              depth={depth}
              hidden={leaving}
              canPop={i > 0}
              topX={topX}
              onClosed={() => openPhoneApp(null)}
              onPop={phoneBack}
              onLeaving={setLeaving}
              onCover={depth === 0 ? setCovered : undefined}
              onSwitcher={() => {
                openPhoneApp(null);
                useOS.getState().setPhoneSwitcher(true);
              }}
            />
          );
        })}
      <AnimatePresence>{up && switcher && <Switcher key="switcher" onOpen={(id, o) => openPhoneApp(id, o)} />}</AnimatePresence>
      <AnimatePresence>{power && <PowerSheet key="power" onClose={() => setPower(false)} />}</AnimatePresence>
      <PowerOverlay />
    </div>
  );
}
