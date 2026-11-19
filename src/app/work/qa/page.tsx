"use client";

// QA harness: the OS without the 3D intro, so it can be checked while the scene is being rebuilt.
// Not linked from anywhere. Delete when the intro is stable.
import { MotionGlobalConfig } from "motion/react";
import { useEffect, useState } from "react";
import Desktop from "@/components/Desktop";
import Login from "@/components/Login";
import PhoneOS from "@/components/PhoneOS";
import { useOS } from "@/store";

export default function QA() {
  const phase = useOS((s) => s.phase);
  const user = useOS((s) => s.user);
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    // ?still jumps every animation to its end, so screens can be checked where frames are throttled
    if (new URLSearchParams(window.location.search).has("still")) MotionGlobalConfig.skipAnimations = true;
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    useOS.getState().setMobile(mq.matches);
    if (useOS.getState().phase === "room") useOS.setState({ phase: "login" });
  }, []);
  if (mobile === null) return null;
  return (
    <main className="fixed inset-0 overflow-hidden bg-page">
      {mobile ? <PhoneOS /> : phase === "os" && user ? <Desktop /> : <Login />}
    </main>
  );
}
