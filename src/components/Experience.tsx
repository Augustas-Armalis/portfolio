"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UserId } from "@/content";
import { useOS } from "@/store";
import Desktop from "./Desktop";
import Login from "./Login";
import PhoneOS from "./PhoneOS";
import { BootVeil, Preloader } from "./scene/Overlays";

const Room = dynamic(() => import("./Room"), { ssr: false, loading: () => <Preloader progress={0.12} /> });
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") Object.assign(window, { __t: { boot: performance.now() } });

export default function Experience() {
  const phase = useOS((s) => s.phase);
  const user = useOS((s) => s.user);
  const isMobile = useOS((s) => s.isMobile);
  const setMobile = useOS((s) => s.setMobile);
  const finishIntro = useOS((s) => s.finishIntro);
  const introOff = useOS((s) => s.introOff);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [roomOn, setRoomOn] = useState(false);
  const [veil, setVeil] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const set = () => setMobile(mq.matches);
    set();
    mq.addEventListener("change", set);
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(rm);
    // reduced motion: straight to the login, the 3D only loads after a Shut Down
    if (rm) finishIntro();
    return () => mq.removeEventListener("change", set);
  }, [setMobile, finishIntro]);

  // Mount the 3D once it's first needed and keep it: it pauses (no frames)
  // while the OS is up, so Shut Down can power the same scene back down.
  useEffect(() => {
    if (reduced === null) return;
    if (phase === "room" && !(reduced && first.current)) setRoomOn(true);
    first.current = false;
  }, [phase, reduced]);

  const handoff = useCallback(
    (t?: UserId) => {
      if (!reduced) setVeil(true);
      finishIntro(t);
    },
    [finishIntro, reduced],
  );

  if (isMobile === null || reduced === null) return <main className="fixed inset-0 bg-page" />;

  return (
    <main className="fixed inset-0 overflow-hidden bg-page">
      {roomOn && (
        <Room active={phase === "room"} introOff={introOff} reduced={reduced} isMobile={isMobile} onHandoff={handoff} onSkip={() => finishIntro()} />
      )}
      <AnimatePresence>
        {phase !== "room" && (
          <motion.div
            key="os"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ duration: veil ? 0 : 0.45 }}
          >
            {isMobile ? (
              <PhoneOS />
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={phase === "os" ? `os-${user}` : "login"}
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: phase === "os" ? 1.02 : 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {phase === "os" && user ? <Desktop user={user} /> : <Login />}
                </motion.div>
              </AnimatePresence>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {veil && <BootVeil onDone={() => setVeil(false)} />}
    </main>
  );
}
