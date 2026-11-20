"use client";

// The two shells as separate downloads. The first page is the 3D field: it needs neither the Mac's desktop nor
// the phone's home screen to draw, and a visitor only ever needs one of the two. So each shell is its own chunk,
// fetched for the device in hand while the intro plays (warmShell), and drawn in the same frame it is asked for
// once it is there: the module is kept here, so a mounted shell never waits on a promise or shows a fallback.

import { useEffect, useState, type ComponentType } from "react";

type Shell = ComponentType;
const loaded: { mac: Shell | null; phone: Shell | null } = { mac: null, phone: null };
const pending: { mac?: Promise<Shell>; phone?: Promise<Shell> } = {};
const load = (which: "mac" | "phone") =>
  (pending[which] ??= (which === "mac" ? import("./Login") : import("./PhoneOS")).then((m) => (loaded[which] = m.default)));

/** Fetch the shell this device will use, once the browser has a quiet moment (or at once with `now`). */
export function warmShell(mobile: boolean, now = false) {
  const which = mobile ? "phone" : "mac";
  if (loaded[which] || pending[which]) return;
  const go = () => void load(which).catch(() => {});
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (now || !w.requestIdleCallback) go();
  else w.requestIdleCallback(go, { timeout: 1500 });
}

function make(which: "mac" | "phone") {
  return function ShellSlot() {
    const [C, setC] = useState<Shell | null>(() => loaded[which]);
    useEffect(() => {
      if (C) return;
      let live = true;
      load(which).then((c) => live && setC(() => c), () => {});
      return () => {
        live = false;
      };
    }, [C]);
    return C ? <C /> : null;
  };
}
/** The Mac: the lock screen and the desktop under it. */
export const MacShell = make("mac");
/** The phone: lock screen, home screen and apps. */
export const PhoneShell = make("phone");
