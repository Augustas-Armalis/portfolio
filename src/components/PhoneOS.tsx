"use client";

import { AnimatePresence, animate, motion, useMotionValue, useScroll, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { apps, mainWork, owner, projects, sharedApps, tracks, users, type AppId, type UserId } from "@/content";
import { useOS, useWallpaper } from "@/store";
import { AppIcon, AppView, LiveWallpaper, player, usePlayer } from "./Apps";
import { Bars } from "./Desktop";
import { Avatar, LoginBackdrop, PowerOverlay } from "./Login";
import { Glyph, ICONS, iconBackground } from "./icons";
import { Check, Pause, Play, X } from "lucide-react";
import { Chrome, EASE_OUT, glass, useGlassScope } from "./ui";
import { useClock, useDate } from "./useClock";

// iPhone-style OS: lock screen that lifts away, a home screen of icons, and apps
// that grow out of their icon and shrink back into it with the home gesture.

// The Dynamic Island: a live activity grows out of it with a spring. Music shows the artwork and a waveform,
// Get in Touch shows "Sent", and a long press opens the full activity. A tap opens the app it belongs to.
function Island() {
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
  const size = { idle: [126, 37, 19], music: [196, 37, 19], sent: [184, 37, 19], big: [356, 172, 44] }[mode];
  const onTap = () => {
    if (held.current) return;
    if (mode === "big") return setBig(false);
    if (mode === "music") openPhoneApp("records");
    if (mode === "sent") openPhoneApp("contact");
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[max(11px,env(safe-area-inset-top))] z-[90] flex justify-center">
      <motion.div
        initial={false}
        animate={{ width: size[0], height: size[1], borderRadius: size[2] }}
        transition={{ type: "spring", bounce: 0.28, duration: 0.55 }}
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
            <motion.div key="m" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 flex items-center justify-between px-[7px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={track.cover} alt="" className="h-[25px] w-[25px] rounded-[7px] object-cover" />
              <span className="pr-2 text-[#9b8cff]">
                <Bars light />
              </span>
            </motion.div>
          )}
          {mode === "sent" && (
            <motion.div key="s" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 flex items-center justify-between px-3">
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#30D158] text-black">
                <Check size={14} className="bold" />
              </span>
              <span className="text-[13px] font-semibold">Copied</span>
            </motion.div>
          )}
          {mode === "big" && track && (
            <motion.div key="b" initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0 }} transition={{ duration: 0.25, delay: 0.08 }} className="absolute inset-0 flex flex-col px-5 pb-4 pt-5">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={track.cover} alt="" className="h-[52px] w-[52px] rounded-[12px] object-cover" />
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
                  {p.playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" />}
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
    <div className={`pointer-events-none absolute inset-x-0 top-0 z-[80] flex h-[54px] items-center pt-[max(4px,env(safe-area-inset-top))] text-[17px] font-semibold tracking-[-0.02em] tabular-nums ${c}`}>
      {/* the time and the icons are each centred in the "ears" either side of the Dynamic Island */}
      <span className="flex flex-1 justify-center pl-3">{time}</span>
      <span className="w-[126px]" />
      <span className="flex flex-1 items-center justify-center gap-[5px] pr-3">
        <span className="flex h-[10px] items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className={`w-[3px] rounded-[1px] ${light ? "bg-white" : "bg-ink"}`} style={{ height: h }} />
          ))}
        </span>
        <span className={`ml-[2px] flex h-[13px] w-[25px] items-center rounded-[4px] border p-[1.5px] ${light ? "border-white/45" : "border-ink/35"}`}>
          <span className={`h-full w-[72%] rounded-[2px] ${light ? "bg-white" : "bg-ink"}`} />
        </span>
      </span>
    </div>
  );
}

// ---------- lock ----------

function Lock() {
  const login = useOS((s) => s.login);
  const seamless = useOS((s) => s.seamless);
  const time = useClock(false);
  const date = useDate();
  return (
    <div className="absolute inset-0 flex flex-col items-center text-ink">
      <LoginBackdrop />
      <motion.div
        initial={{ opacity: 0, y: -10, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: EASE_OUT, delay: seamless ? 0.35 : 0.2 }}
        className="relative mt-[90px] text-center"
      >
        <div className="text-[17px] font-semibold text-ink-2">{date}</div>
        <div className="text-[88px] font-semibold leading-[0.95] tracking-[-0.04em] tabular-nums">{time}</div>
      </motion.div>
      {/* lock screen widgets: what he's working on, and the studio */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.45 }}
        className="relative mt-5 grid w-full grid-cols-2 gap-2.5 px-5"
      >
        {[
          { k: "Working on", v: mainWork.name, s: mainWork.role ?? "" },
          { k: "Studio", v: "Larpo", s: owner.city },
        ].map((w) => (
          <div key={w.k} data-glass="" className={`${glass("lock")} rounded-[18px] px-3.5 py-3 text-left`}>
            <div className="t-cap2 font-semibold uppercase text-ink-2">{w.k}</div>
            <div className="t-headline mt-0.5 truncate text-ink">{w.v}</div>
            <div className="t-foot truncate text-ink-2">{w.s}</div>
          </div>
        ))}
      </motion.div>
      <div className="relative mt-auto w-full px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="mb-3 text-center text-[13px] font-medium text-ink-2">Tap a profile to unlock</div>
        <div className="grid grid-cols-3 gap-2.5">
          {(Object.keys(users) as UserId[]).map((id, i) => (
            <motion.button
              type="button"
              key={id}
              onClick={() => {
                login(id);
              }}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: EASE_OUT, delay: (seamless ? 0.55 : 0.4) + i * 0.07 }}
              whileTap={{ scale: 0.96 }}
              data-glass=""
              className={`${glass("lock")} flex h-[118px] flex-col items-center justify-center gap-2.5 rounded-[22px] px-2`}
            >
              <Avatar id={id} size={50} />
              <span className="flex h-[30px] w-full items-center justify-center text-center text-[12px] font-semibold leading-[15px] text-ink [text-wrap:balance]">{users[id].name}</span>
            </motion.button>
          ))}
        </div>
        <div className="mx-auto mt-6 h-[5px] w-[134px] rounded-full bg-ink/80" />
      </div>
    </div>
  );
}

// ---------- home ----------

type Origin = { x: number; y: number; w: number; h: number };

function HomeIcon({ id, label, onOpen, light }: { id: AppId; label?: string; onOpen: (id: AppId, o: Origin) => void; light: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const openIt = () => {
    const r = ref.current!.getBoundingClientRect();
    onOpen(id, { x: r.x, y: r.y, w: r.width, h: r.height });
  };
  return (
    <div className="relative flex flex-col items-center gap-[5px]">
      <motion.button
        type="button"
        aria-label={`Open ${apps[id].title}`}
        onPointerDown={() => {
          timer.current = window.setTimeout(() => setHeld(true), 450);
        }}
        onPointerUp={() => window.clearTimeout(timer.current)}
        onPointerLeave={() => window.clearTimeout(timer.current)}
        onClick={() => !held && openIt()}
        whileTap={{ scale: 0.88, filter: "brightness(0.9)" }}
        transition={{ type: "spring", bounce: 0, duration: 0.25 }}
        className="no-callout"
      >
        <div ref={ref}>
          <AppIcon id={id} size={60} />
        </div>
      </motion.button>
      {label !== "" && (
        <span className={`w-[76px] truncate text-center text-[11px] font-medium leading-[13px] tracking-[0.005em] ${light ? "text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.35)]" : "text-ink"}`}>
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
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.12 } }}
              transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
              style={{ transformOrigin: "top left" }}
              data-glass=""
              className={`${glass("pop")} absolute left-0 top-[68px] z-50 w-[220px] overflow-hidden rounded-[14px]`}
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

function Home({ user, onOpen }: { user: UserId; onOpen: (id: AppId, o: Origin) => void }) {
  const logout = useOS((s) => s.logout);
  const u = users[user];
  const wp = useWallpaper(user);
  const dark = wp.dark;
  const dock: AppId[] = [...sharedApps, "about"];
  return (
    <div className="wp-photo absolute inset-0 flex flex-col" style={wp.src.startsWith("live:") ? undefined : { backgroundImage: `url(${wp.src})` }}>
      {wp.src.startsWith("live:") && <LiveWallpaper />}
      <div className="relative px-5 pt-[calc(env(safe-area-inset-top)+64px)]">
        <button
          type="button"
          onClick={logout}
          data-glass=""
          className={`press flex w-full items-center gap-3 rounded-[22px] p-4 text-left ${dark ? `${glass("widget-dark")} text-white` : `${glass("widget")} text-ink`}`}
        >
          <Avatar id={user} size={46} />
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold leading-tight tracking-[-0.01em]">{u.name}</span>
          </span>

        </button>
      </div>
      <div className="relative grid grid-cols-4 gap-x-2 gap-y-[22px] px-5 pt-7">
        {u.apps.map((id, i) => (
          <motion.div key={id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.04 + i * 0.03 }}>
            <HomeIcon id={id} onOpen={onOpen} light={dark} />
          </motion.div>
        ))}
      </div>
      <div className="relative mt-auto px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex justify-center gap-1.5" aria-hidden>
          <span className={`h-[7px] w-[7px] rounded-full ${dark ? "bg-white" : "bg-ink/80"}`} />
        </div>
        <div data-glass="" className={`${glass("dock")} flex justify-around rounded-[34px] px-2 py-4`}>
          {dock.map((id) => (
            <HomeIcon key={id} id={id} label="" onOpen={onOpen} light={dark} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- iOS navigation: large title that collapses into the nav bar ----------

function AppScroll({ id, ground, dark, onClose }: { id: AppId; ground: string; dark: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: ref });
  const bar = useTransform(scrollY, [24, 44], [0, 1]);
  const big = useTransform(scrollY, [0, 36], [1, 0]);
  return (
    <div className={`phone-app absolute inset-0 ${ground}`}>
      <motion.div
        style={{ opacity: bar }}
        data-glass=""
        className={`glass pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[calc(env(safe-area-inset-top)+98px)] items-end justify-center pb-[12px] ${dark ? "ios-bar-dark" : "ios-bar"}`}
      >
        <span className={`text-[17px] font-semibold tracking-[-0.02em] ${dark ? "text-white" : "text-ink"}`}>{apps[id].title}</span>
      </motion.div>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${apps[id].title}`}
        data-glass=""
        className={`press absolute right-4 top-[calc(env(safe-area-inset-top)+60px)] z-30 flex h-9 w-9 items-center justify-center rounded-full ${
          dark ? `${glass("btn-dark")} text-white/90` : `${glass("btn")} text-[#3C3C43]/75`
        }`}
      >
        <X size={18} className="bold" />
      </button>
      <div ref={ref} className="absolute inset-0 overflow-y-auto overscroll-contain pb-12">
        {/* a contact card and an About sheet carry their own big name, so no large title over them */}
        {id === "contact" || id === "about" || id === "work" || id === "lab" || projects[id] ? (
          <div className={id === "contact" || id === "about" ? "h-[calc(env(safe-area-inset-top)+104px)]" : "h-[calc(env(safe-area-inset-top)+58px)]"} />
        ) : (
        <motion.h1
          style={{ opacity: big }}
          className="pb-2 pl-4 pr-16 pt-[calc(env(safe-area-inset-top)+58px)] text-[34px] font-bold leading-[41px] tracking-[0.011em]"
        >
          {apps[id].title}
        </motion.h1>
        )}
        <Chrome.Provider value={{ compact: true }}>
          <AppView id={id} />
        </Chrome.Provider>
      </div>
    </div>
  );
}

// ---------- app window: grows out of its icon, home gesture to close ----------

function AppWindow({ id, origin, onClosed }: { id: AppId; origin: Origin | null; onClosed: () => void }) {
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
  const contentOpacity = useTransform(p, [0.15, 0.55], [0, 1]);

  const to = (target: number, velocity = 0) => {
    anim.current?.stop();
    anim.current = animate(p, target, {
      type: "spring",
      bounce: 0,
      duration: target === 1 ? 0.5 : 0.42,
      velocity,
      onComplete: () => {
        if (target === 0) onClosed();
      },
    });
    animate(lift, 0, { type: "spring", bounce: 0, duration: 0.4 });
  };

  useEffect(() => {
    to(1);
    // open once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Home indicator: swipe up, the app follows the finger and shrinks toward its icon.
  const drag = useRef<{ y0: number; p0: number; hist: { y: number; t: number }[] } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    anim.current?.stop();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
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

  const darkApp = id === "terminal" || id === "doom";
  // sidebar apps become iOS grouped lists: grey ground, title on the same ground
  const grouped = ["work", "taste", "settings", "contact", "records", "lab"].includes(id);
  const ground = darkApp ? "bg-[#1C1D20] text-white" : grouped ? "bg-[#F2F2F7] text-ink" : "bg-white text-ink";
  return (
    <motion.div className="phone-app absolute inset-0 z-[60] will-change-transform" style={{ x, y, scale, clipPath }}>
      <div className={`absolute inset-0 ${ground}`} />
      <motion.div style={{ opacity: contentOpacity }} className="absolute inset-0">
        <AppScroll id={id} ground={ground} dark={darkApp} onClose={() => (to(0))} />
      </motion.div>
      {/* the icon the app grows out of */}
      <motion.div style={{ opacity: iconOpacity, top: inset, height: vw }} className="pointer-events-none absolute inset-x-0">
        <div
          className={`icon-glyph ${ICONS[id].fg === "light" ? "is-light" : "is-dark"}`}
          style={{ position: "relative", height: "100%", background: iconBackground(id) }}
        >
          <Glyph id={id} size={Math.round(vw * 0.48)} />
        </div>
      </motion.div>
      {/* home indicator */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="absolute inset-x-0 bottom-0 z-10 flex h-[34px] touch-none items-end justify-center pb-[max(8px,env(safe-area-inset-bottom))]"
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
  const phase = useOS((s) => s.phase);
  const user = useOS((s) => s.user);
  const phoneApp = useOS((s) => s.phoneApp);
  const origin = useOS((s) => s.phoneOrigin);
  const openPhoneApp = useOS((s) => s.openPhoneApp);
  const homeDark = useWallpaper(user ?? "engineer").dark;
  const heroDark = useOS((s) => s.heroDark);
  const lightBar = (phase === "os" && !!user && homeDark && !phoneApp) || phoneApp === "terminal" || phoneApp === "doom" || (!!phoneApp && heroDark);

  return (
    <div className="no-callout absolute inset-0 overflow-hidden bg-page">
      <StatusBar light={lightBar} />
      <Island />
      <AnimatePresence initial={false}>
        {phase === "os" && user ? (
          <motion.div
            key={`home-${user}`}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.2 } }}
            transition={{ type: "spring", bounce: 0, duration: 0.55 }}
          >
            <Home user={user} onOpen={(id, o) => openPhoneApp(id, o)} />
          </motion.div>
        ) : (
          <motion.div
            key="lock"
            className="absolute inset-0 z-[50]"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ y: "-100%", transition: { type: "spring", bounce: 0, duration: 0.5 } }}
            transition={{ duration: 0.3 }}
          >
            <Lock />
          </motion.div>
        )}
      </AnimatePresence>
      {phase === "os" && phoneApp && <AppWindow key={phoneApp} id={phoneApp} origin={origin} onClosed={() => openPhoneApp(null)} />}
      <PowerOverlay />
    </div>
  );
}
