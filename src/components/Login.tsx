"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { loginWallpaper, owner } from "@/content";
import { useOS } from "@/store";
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
      {owner.name[0]}
    </div>
  );
}

// The login and lock background: the photo, softly blurred like the real one.
// It wakes like a Mac: the blurred wallpaper fades up out of black while settling from a slight zoom
// (opacity and transform only; the blur itself is baked into the layer and never animates).
export function LoginBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-black" aria-hidden>
      <motion.div
        initial={{ opacity: 0, scale: 1.08 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-[-40px] bg-cover bg-center blur-[28px]"
        style={{ backgroundImage: `url(${loginWallpaper.src})` }}
      />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.1 }} className="absolute inset-0 bg-white/30" />
    </div>
  );
}

// Sleep (black until a click) and Restart (black, the mark and a bar, then the login).
export function PowerOverlay() {
  const sleeping = useOS((s) => s.sleeping);
  const restarting = useOS((s) => s.restarting);
  const sleep = useOS((s) => s.sleep);
  // the restart chime lands as the mark appears, like a Mac powering back on
  useEffect(() => {
    if (!restarting) return;
    const t = window.setTimeout(() => sfx("boot"), 450);
    return () => window.clearTimeout(t);
  }, [restarting]);
  return (
    <AnimatePresence>
      {(sleeping || restarting) && (
        <motion.div
          key={sleeping ? "sleep" : "restart"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
          transition={{ duration: sleeping ? 0.6 : 0.25 }}
          onClick={() => sleeping && sleep(false)}
          className="fixed inset-0 z-[6000] flex items-center justify-center bg-black"
        >
          {restarting && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              transition={{ delay: 0.35, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex flex-col items-center gap-14"
            >
              {/* a faint light behind the mark, like a display warming up */}
              <motion.span
                aria-hidden
                className="absolute -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.1),transparent)]"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <span className="relative text-[84px] font-semibold leading-none tracking-[-0.045em] text-white">A</span>
              <div className="relative h-[5px] w-[180px] overflow-hidden rounded-full bg-white/[0.16]">
                <motion.div
                  className="h-full w-full origin-left rounded-full bg-white"
                  initial={{ scaleX: 0.03 }}
                  animate={{ scaleX: [0.03, 0.42, 0.58, 1] }}
                  transition={{ delay: 0.6, duration: 1.8, times: [0, 0.35, 0.6, 1], ease: [0.4, 0, 0.6, 1] }}
                />
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// The lock screen: the date and a big clock, his mark and name, and one way in. A click anywhere (or Return)
// unlocks; there is nobody to choose.
export default function Login() {
  useGlassScope();
  const { login, shutdown, locked } = useOS();
  const seamless = useOS((s) => s.seamless);
  const time = useClock(false);
  const date = useDate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && login();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [login]);

  return (
    <div className="absolute inset-0 flex flex-col items-center text-ink" onClick={() => login()}>
      <LoginBackdrop />
      <motion.div
        initial={{ opacity: 0, y: -10, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: EASE_OUT, delay: seamless ? 0.35 : 0.2 }}
        className="relative mt-[11vh] text-center"
      >
        <div className="text-[20px] font-semibold tracking-[-0.01em] text-ink-2">{date}</div>
        <div className="text-[112px] font-semibold leading-[0.95] tracking-[-0.045em] tabular-nums">{time}</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: seamless ? 0.55 : 0.4 }}
        className="relative mt-auto flex flex-col items-center pb-[9vh]"
      >
        <Monogram size={64} />
        <div className="mt-3 text-[17px] font-semibold tracking-[-0.01em]">{owner.name}</div>
        <button
          type="button"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            login();
          }}
          data-glass=""
          className={`${glass("lock")} glass-press mt-4 flex h-9 items-center rounded-full px-5 text-[13px] font-medium text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent)]/50`}
        >
          {locked ? "Click to unlock" : "Click to enter"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            sfx("shutdown");
            shutdown();
          }}
          className="press mt-5 flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-ink-2 hov:hover:text-ink"
        >
          Shut Down
        </button>
      </motion.div>
      <PowerOverlay />
    </div>
  );
}
