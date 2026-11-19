"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { loginWallpaper, users, type UserId } from "@/content";
import { useOS } from "@/store";
import { EASE_OUT, sfx, useGlassScope } from "./ui";
import { useClock, useDate } from "./useClock";

// Persona picture: one image per persona (to be swapped for his photo later).
export function Avatar({ id, size = 88 }: { id: UserId; size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full bg-cover bg-center shadow-[0_8px_20px_-8px_rgb(0_0_0/0.4),0_0_0_1px_rgb(0_0_0/0.06)]"
      style={{ width: size, height: size, backgroundImage: `url(${users[id].avatar})` }}
      role="img"
      aria-label={users[id].name}
    />
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

// macOS-style user picker. One centred block: date and clock, then three users
// of identical size on one baseline. Hover draws a ring; nothing moves.
export default function Login() {
  useGlassScope();
  const { login, shutdown, locked, user } = useOS();
  const seamless = useOS((s) => s.seamless);
  const time = useClock(false);
  const date = useDate();
  const ids = Object.keys(users) as UserId[];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-ink">
      <LoginBackdrop />
      <div className="relative flex flex-col items-center gap-14">
        <motion.div
          initial={{ opacity: 0, y: -10, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: EASE_OUT, delay: seamless ? 0.35 : 0.2 }}
          className="text-center"
        >
          <div className="text-[15px] font-semibold text-ink-2">{date}</div>
          <div className="text-[96px] font-semibold leading-[0.95] tracking-[-0.045em] tabular-nums">{time}</div>
        </motion.div>

        <div className="flex items-start justify-center gap-6">
          {ids.map((id, i) => (
            <motion.button
              type="button"
              key={id}
              onClick={() => {
                login(id);
              }}
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: locked && id !== user ? 0.55 : 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: EASE_OUT, delay: (seamless ? 0.55 : 0.4) + i * 0.08 }}
              className="user-tile group flex w-[168px] flex-col items-center gap-3 rounded-[16px] px-2 py-3 outline-none"
            >
              <span className={`avatar-ring rounded-full p-[3px] ${locked && id === user ? "is-current" : ""}`}>
                <Avatar id={id} size={84} />
              </span>
              <span className="block w-full truncate text-[15px] font-semibold">{users[id].name}</span>
            </motion.button>
          ))}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: seamless ? 0.95 : 0.8, duration: 0.5 }} className="h-8">
          {locked ? (
            <span className="text-[13px] font-medium text-ink-2">Locked</span>
          ) : (
            <button type="button" onClick={() => (sfx("shutdown"), shutdown())} className="press flex h-8 items-center rounded-[10px] px-3 text-[13px] font-medium text-ink-2 hov:hover:text-ink">
              Shut Down
            </button>
          )}
        </motion.div>
      </div>
      <PowerOverlay />
    </div>
  );
}
