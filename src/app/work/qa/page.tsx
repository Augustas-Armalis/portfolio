"use client";

// QA harness: the OS without the 3D intro, so it can be checked while the scene is being rebuilt.
// Not linked from anywhere. Delete when the intro is stable.
import { MotionGlobalConfig } from "motion/react";
import { useEffect, useState } from "react";
import Login from "@/components/Login";
import PhoneOS from "@/components/PhoneOS";
import { useOS } from "@/store";
import type { AppId } from "@/content";

export default function QA() {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    // ?still jumps every animation to its end, so screens can be checked where frames are throttled
    if (new URLSearchParams(window.location.search).has("still")) MotionGlobalConfig.skipAnimations = true;
    const mq = window.matchMedia("(max-width: 767px)");
    setMobile(mq.matches);
    useOS.getState().setMobile(mq.matches);
    if (useOS.getState().phase === "room") useOS.setState({ phase: "login" });
    // state by URL, so the review tools (which load a bare URL) can reach any screen:
    //   ?login  ?open=settings,records (desktop windows; the first is the phone app on a phone)  ?pane=wallpaper
    //   ?theme=dark|light|auto  ?close (no windows but the opened ones)
    const q = new URLSearchParams(window.location.search);
    const theme = q.get("theme");
    if (theme === "dark" || theme === "light" || theme === "auto") useOS.getState().setAppearance(theme);
    const open = (q.get("open") ?? "").split(",").filter(Boolean) as AppId[];
    if (q.has("login") || open.length) {
      const os = useOS.getState();
      os.login();
      if (q.has("close") || open.length) useOS.setState({ windows: [] });
      const pane = q.get("pane");
      if (pane) os.setSettingsPane(pane);
      if (mq.matches) {
        if (open[0]) os.openPhoneApp(open[0]);
      } else open.forEach((id) => useOS.getState().open(id));
    }
  }, []);
  if (mobile === null) return null;
  return (
    <main className="fixed inset-0 overflow-hidden bg-page">
      {mobile ? <PhoneOS /> : <Login />}
    </main>
  );
}
