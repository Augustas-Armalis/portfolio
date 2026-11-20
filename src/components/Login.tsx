"use client";

import { AnimatePresence, motion } from "motion/react";
import { MarkDeep, SystemBootMark } from "./Mark";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { mainWork, owner } from "@/content";
import { useOS, useWallpaper } from "@/store";
import { EASE_OUT, glass, sfx, useGlassScope } from "./ui";
import { useClock, useDate } from "./useClock";

// His mark: a soft glass sphere with the initial (to be swapped for his photo later).
export function Monogram({ size = 88 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[radial-gradient(120%_120%_at_30%_15%,#ffffff_0%,#e9eaee_45%,#c9ccd3_100%)] font-semibold tracking-[-0.03em] text-[#17181b] shadow-[0_10px_26px_-12px_rgb(16_18_24/0.5),inset_0_-2px_6px_rgb(0_0_0/0.06),0_0_0_0.5px_rgb(0_0_0/0.08)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      role="img"
      aria-label={owner.name}
    >
      <MarkDeep size={Math.round(size * 0.62)} />
    </div>
  );
}

// The lock screen's face: the date over a large light clock, two glass widgets, his mark and one way in.
// Login shows it; the desktop shows it once more for the half second it takes to dissolve, so unlocking is one
// continuous move over the same picture instead of a cut.
const LOCK_WIDGETS = [
  { k: "Working on", v: mainWork.name, s: mainWork.role ?? "" },
  { k: "Studio", v: "Larpo", s: owner.city },
];
export function LockFace({ still = false, action }: { still?: boolean; action?: React.ReactNode }) {
  const seamless = useOS((s) => s.seamless);
  const time = useClock(false);
  const date = useDate();
  const enter = (delay: number, y: number) =>
    still ? { initial: false as const } : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: EASE_OUT, delay: (seamless ? 0.2 : 0.1) + delay } };
  return (
    <div className="absolute inset-0 flex flex-col items-center text-white">
      {/* depth: the picture is a touch darker at the top and bottom, where the type sits */}
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.34),rgb(0_0_0/0.06)_34%,rgb(0_0_0/0.1)_62%,rgb(0_0_0/0.46))]" />
      <motion.div {...enter(0, -8)} className="relative mt-[9vh] text-center [text-shadow:0_2px_24px_rgb(0_0_0/0.22)]">
        <div className="text-[22px] font-medium leading-7 tracking-[-0.01em] text-white/85">{date || "\u00a0"}</div>
        <div className="mt-1 min-h-[136px] text-[136px] font-light leading-none tracking-[-0.05em] tabular-nums text-white/95">{time}</div>
      </motion.div>
      <motion.div {...enter(0.12, 8)} className="relative mt-8 grid w-[420px] max-w-[calc(100%-48px)] grid-cols-2 gap-3">
        {LOCK_WIDGETS.map((w) => (
          <div key={w.k} data-glass="" className={`${glass("widget-dark")} sq-panel rounded-[26px] px-4 py-3.5 text-left`}>
            <div className="text-[12px] font-medium leading-4 text-white/60">{w.k}</div>
            <div className="mt-1 truncate text-[17px] font-semibold leading-[22px] tracking-[-0.02em] text-white">{w.v}</div>
            <div className="truncate text-[13px] leading-[18px] text-white/65">{w.s}</div>
          </div>
        ))}
      </motion.div>
      <motion.div {...enter(0.2, 10)} className="relative mt-auto flex flex-col items-center pb-[7vh]">
        <Monogram size={56} />
        <div className="mt-3 text-[17px] font-semibold leading-[22px] tracking-[-0.02em] [text-shadow:0_1px_8px_rgb(0_0_0/0.3)]">{owner.name}</div>
        {action}
      </motion.div>
    </div>
  );
}

// The picture behind the lock screen: the desktop's own, sharp, so nothing changes underneath when it unlocks.
// It wakes like a display: up out of black, settling from a slight zoom (opacity and transform only).
export function LockBackdrop() {
  const wp = useWallpaper();
  const src = wp.src.startsWith("live:") ? "/wallpapers/art-bernd-dittrich.webp" : wp.src;
  return (
    <div className="absolute inset-0 overflow-hidden bg-black" aria-hidden>
      <motion.div
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
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
const RESTART_MS = 3300;
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
export { RESTART_MS };

// The way in, and the way out. The unlock veil draws the same controls inert, so nothing pops as it dissolves.
export function LockActions({ inert = false }: { inert?: boolean }) {
  const { login, shutdown, locked } = useOS();
  return (
    <>
      <button
        type="button"
        tabIndex={inert ? -1 : 0}
        onClick={(e) => {
          e.stopPropagation();
          login();
        }}
        data-glass=""
        className={`${glass("widget-dark")} glass-press mt-4 flex h-10 items-center rounded-full px-6 text-[15px] font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent`}
      >
        {locked ? "Unlock" : "Enter"}
      </button>
      <div className="mt-2 text-[12px] leading-4 text-white/55">or press Return</div>
      <button
        type="button"
        tabIndex={inert ? -1 : 0}
        onClick={(e) => {
          e.stopPropagation();
          sfx("shutdown");
          shutdown();
        }}
        className="press mt-5 flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-white/70 outline-none focus-visible:ring-2 focus-visible:ring-white/80 hov:hover:text-white"
      >
        Shut Down
      </button>
    </>
  );
}

// The lock screen. A click anywhere (or Return) unlocks; there is nobody to choose.
export default function Login() {
  useGlassScope();
  const login = useOS((s) => s.login);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && login();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [login]);
  return (
    <div className="absolute inset-0" onClick={() => login()}>
      <LockBackdrop />
      <LockFace action={<LockActions />} />
      <PowerOverlay />
    </div>
  );
}
