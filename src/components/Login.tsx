"use client";

import { AnimatePresence, motion } from "motion/react";
import { MarkDeep, SystemBootMark } from "./Mark";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mainWork, owner } from "@/content";
import { isUp, useOS, useWallpaper } from "@/store";
import Desktop from "./Desktop";
import { EASE_OUT, glass, reducedMotion, sfx, useGlassScope } from "./ui";
import { useClock, useDate } from "./useClock";

// His mark as an account picture: the gold circle on a near-black disc, the app icon made round
// (to be swapped for his photo later).
export function Monogram({ size = 88 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#1b1c21_0%,#0a0b0d_100%)] shadow-[0_10px_26px_-12px_rgb(16_18_24/0.5),inset_0_0_0_0.5px_rgb(255_255_255/0.14),0_0_0_0.5px_rgb(0_0_0/0.3)]"
      style={{ width: size, height: size }}
      role="img"
      aria-label={owner.name}
    >
      <MarkDeep size={Math.round(size * 0.56)} />
    </div>
  );
}

// The lock screen's face: the date over a large light clock, two glass widgets, his mark and one way in.
// It comes ("in") and goes ("out") leaf by leaf: every piece fades by itself and only the groups move. Nothing
// that holds glass is ever faded from above, because a backdrop blur inside a fading parent has nothing behind it
// to blur until the fade ends: the widgets would sit flat and dark, then snap to glass.
const LOCK_WIDGETS = [
  { k: "Working on", v: mainWork.name, s: mainWork.role ?? "" },
  { k: "Studio", v: "Larpo", s: owner.city },
];
type FaceMode = "in" | "out";
const OUT = { duration: 0.28, ease: EASE_OUT } as const;
function useFace(mode: FaceMode) {
  const seamless = useOS((s) => s.seamless);
  const reduce = reducedMotion();
  const base = seamless ? 0.2 : 0.1;
  // a leaf fades; a group travels
  const leaf = (delay = 0) =>
    mode === "in"
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.6, ease: EASE_OUT, delay: base + delay } }
      : { initial: false as const, animate: { opacity: 0 }, transition: OUT };
  const group = (delay: number, y: number) =>
    mode === "in"
      ? { initial: { y: reduce ? 0 : y }, animate: { y: 0 }, transition: { duration: 0.8, ease: EASE_OUT, delay: base + delay } }
      : { initial: false as const, animate: { y: reduce ? 0 : -22 }, transition: { duration: 0.42, ease: EASE_OUT } };
  return { leaf, group };
}
export function LockFace({ mode, onEnter, onShutDown, locked }: { mode: FaceMode; onEnter?: () => void; onShutDown?: () => void; locked?: boolean }) {
  const time = useClock(false);
  const date = useDate();
  const { leaf, group } = useFace(mode);
  const live = mode === "in";
  return (
    <div className="absolute inset-0 flex flex-col items-center text-white">
      {/* depth: the picture is a touch darker at the top and bottom, where the type sits */}
      <motion.div {...leaf()} aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.34),rgb(0_0_0/0.06)_34%,rgb(0_0_0/0.1)_62%,rgb(0_0_0/0.46))]" />
      <motion.div {...group(0, -8)} className="relative mt-[9vh] text-center [text-shadow:0_2px_24px_rgb(0_0_0/0.22)]">
        <motion.div {...leaf(0)}>
          <div className="text-[22px] font-medium leading-7 tracking-[-0.01em] text-white/85">{date || "\u00a0"}</div>
          <div className="mt-1 min-h-[136px] text-[136px] font-light leading-none tracking-[-0.05em] tabular-nums text-white/95">{time}</div>
        </motion.div>
      </motion.div>
      <motion.div {...group(0.12, 8)} className="relative mt-8 grid w-[420px] max-w-[calc(100%-48px)] grid-cols-2 gap-3">
        {LOCK_WIDGETS.map((w) => (
          <motion.div key={w.k} {...leaf(0.12)} data-glass="" className={`${glass("widget-dark")} sq-panel rounded-[26px] px-4 py-3.5 text-left`}>
            <div className="text-[12px] font-medium leading-4 text-white/60">{w.k}</div>
            <div className="mt-1 truncate text-[17px] font-semibold leading-[22px] tracking-[-0.02em] text-white">{w.v}</div>
            <div className="truncate text-[13px] leading-[18px] text-white/65">{w.s}</div>
          </motion.div>
        ))}
      </motion.div>
      <motion.div {...group(0.2, 10)} className="relative mt-auto flex flex-col items-center pb-[7vh]">
        <motion.div {...leaf(0.2)} className="flex flex-col items-center">
          <Monogram size={56} />
          <div className="mt-3 text-[17px] font-semibold leading-[22px] tracking-[-0.02em] [text-shadow:0_1px_8px_rgb(0_0_0/0.3)]">{owner.name}</div>
        </motion.div>
        <motion.button
          {...leaf(0.2)}
          type="button"
          tabIndex={live ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            onEnter?.();
          }}
          data-glass=""
          className={`${glass("widget-dark")} glass-press mt-4 flex h-10 items-center rounded-full px-6 text-[15px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent`}
        >
          {locked ? "Unlock" : "Enter"}
        </motion.button>
        <motion.div {...leaf(0.2)} className="flex flex-col items-center">
          <div className="mt-2 text-[12px] leading-4 text-white/55">or press Return</div>
          <button
            type="button"
            tabIndex={live ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              onShutDown?.();
            }}
            className="press mt-5 flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-white/70 outline-none focus-visible:ring-2 focus-visible:ring-white/80 hov:hover:text-white"
          >
            Shut Down
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}

// The picture behind the lock screen: the desktop's own, sharp, so nothing changes underneath when it unlocks.
// Starting up, it wakes like a display: up out of black, settling from a slight zoom. Locking a running desktop,
// it only comes over the windows (opacity and transform, nothing else).
export function LockBackdrop({ wake }: { wake: boolean }) {
  const wp = useWallpaper();
  const src = wp.src.startsWith("live:") ? "/wallpapers/art-bernd-dittrich.webp" : wp.src;
  const reduce = reducedMotion();
  return (
    <div className={`absolute inset-0 overflow-hidden ${wake ? "bg-black" : ""}`} aria-hidden>
      <motion.div
        initial={wake ? { opacity: 0, scale: reduce ? 1 : 1.05 } : { opacity: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={wake ? { duration: 1.1, ease: [0.22, 1, 0.36, 1] } : { duration: 0.3, ease: EASE_OUT }}
        className="wp-photo absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${src})` }}
      />
    </div>
  );
}

// The boot frame, like a Mac starting up: pure black, the logo dead centre, and 60pt under it a thin bar.
// These numbers are the whole layout; the 3D display's boot frame is meant to be drawn from the same ones.
export const BOOT_UI = { logo: 84, gap: 60, barW: 200, barH: 3 };

// The logo and the bar on black. `at` is when the boot began (ms): every part is placed on that clock with a
// negative animation delay, so if this is mounted again part-way through (the desktop hands over to the lock
// screen underneath a restart) it carries on from the same frame instead of starting over.
export function BootScreen({ at }: { at: number }) {
  const [t0] = useState(() => Math.max(0, (Date.now() - at) / 1000));
  const { logo, gap, barW, barH } = BOOT_UI;
  return (
    <div className="absolute inset-0 text-white" aria-hidden>
      <div className="boot-in absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ height: logo, animationDelay: `${0.5 - t0}s` }}>
        <SystemBootMark size={logo} />
      </div>
      <div
        className="boot-in absolute left-1/2 top-1/2 overflow-hidden rounded-full bg-white/[0.22]"
        style={{ width: barW, height: barH, marginLeft: -barW / 2, marginTop: logo / 2 + gap, animationDelay: `${0.9 - t0}s` }}
      >
        <div className="boot-fill h-full w-full rounded-full bg-white" style={{ animationDelay: `${1.0 - t0}s` }} />
      </div>
    </div>
  );
}

// Sleep (black until a click) and Restart (the boot frame, then the lock screen).
// It is drawn on <body>, outside whichever screen asked for it: the desktop and the lock screen each render one,
// and the screen under it is swapped (and cross-faded) while it is up, which must not show through or restart it.
export function PowerOverlay() {
  const sleeping = useOS((s) => s.sleeping);
  const restarting = useOS((s) => s.restarting);
  const restartAt = useOS((s) => s.restartAt);
  const sleep = useOS((s) => s.sleep);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  // the chime lands as the logo appears, once per restart however many screens mount under it
  useEffect(() => {
    if (!restarting) return;
    const wait = restartAt + 500 - Date.now();
    if (wait < 0) return;
    const t = window.setTimeout(() => sfx("boot"), wait);
    return () => window.clearTimeout(t);
  }, [restarting, restartAt]);
  // already black when this copy mounts under a restart in progress: no second fade
  const [late] = useState(() => restarting && Date.now() - restartAt > 200);
  if (!host) return null;
  return createPortal(
    <AnimatePresence>
      {(sleeping || restarting) && (
        <motion.div
          key={sleeping ? "sleep" : "restart"}
          initial={late ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: EASE_OUT } }}
          transition={{ duration: sleeping ? 0.6 : 0.25, ease: EASE_OUT }}
          onClick={() => sleeping && sleep(false)}
          role={sleeping ? "button" : undefined}
          aria-label={sleeping ? "Wake" : undefined}
          className="fixed inset-0 z-[6000] bg-black"
        >
          {restarting && <BootScreen at={restartAt} />}
        </motion.div>
      )}
    </AnimatePresence>,
    host,
  );
}
// The Mac's screen. There is one desktop and it stays up for the whole session: the lock screen is a face over
// it, not another page. Unlocking mounts the desktop (the first time) and lets the face go, leaf by leaf, over
// the very picture it was standing on; locking brings the picture and the face back over the windows, which keep
// their places. Nothing above this component swaps or cross-fades when the session unlocks.
export default function Login() {
  useGlassScope();
  // Shut Down hands the display back to the room, which fades this screen out over half a second. For that half
  // second the screen holds what it was showing: the session has already ended in the store, and without this the
  // desktop would be swapped for a lock screen waking out of black in the middle of the fade.
  const off = useOS((s) => s.phase === "room");
  const now = { user: useOS((s) => s.user), up: useOS(isUp) };
  const held = useRef(now);
  if (!off) held.current = now;
  const { user, up } = held.current;
  const locked = useOS((s) => s.locked);
  const login = useOS((s) => s.login);
  const shutdown = useOS((s) => s.shutdown);
  // "in": the face is up and takes clicks. "out": it is leaving over the desktop. null: gone.
  const [face, setFace] = useState<FaceMode | null>(up ? null : "in");
  // whether the picture comes up out of black (a start, a restart) or just over the windows (a lock)
  const [wake, setWake] = useState(!locked);
  useEffect(() => {
    if (!up) {
      setWake(!useOS.getState().locked);
      setFace("in");
      return;
    }
    setFace((f) => (f ? "out" : null));
    const t = window.setTimeout(() => setFace(null), 460);
    return () => window.clearTimeout(t);
  }, [up]);
  useEffect(() => {
    if (face !== "in") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (useOS.getState().restarting || useOS.getState().sleeping) return;
      e.preventDefault();
      login();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [face, login]);
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {/* the page's one h1, on the lock screen and the desktop alike: every window's own title is an h2 under it */}
      <h1 className="sr-only text-white">Augustas Armalis, design engineer and founder</h1>
      {user && (
        <div className="absolute inset-0" inert={!up}>
          <Desktop />
        </div>
      )}
      {face && (
        <div className={`absolute inset-0 z-[5000] ${face === "out" ? "pointer-events-none" : ""}`} onClick={face === "in" ? () => login() : undefined} aria-hidden={face === "out"}>
          {face === "in" && <LockBackdrop wake={wake} />}
          <LockFace
            mode={face}
            locked={locked}
            onEnter={login}
            onShutDown={() => {
              sfx("shutdown");
              shutdown();
            }}
          />
        </div>
      )}
      <PowerOverlay />
    </div>
  );
}
